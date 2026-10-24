/**
 * Pass 5b (report 45), verification 1: the production journal path gives exactly the plans of the validated prototype
 * (iteration 2d, arms C and JS, K2 + G, report 41) on 200 users of step V1 (P00, R0 to R30) and 200 of step V3 in the P10
 * population, over 24 weeks.
 *
 * The fixture comes from the measurement branch (fixture.bench.ts, run there with the hooks described in the report, never
 * committed there): every call of the validated simulator after the switch that produces or checks a plan, with its input
 * store and the prototype's output on the same input with the loss target raised to the BMI-20 weight (rule of pass 5a).
 * Here each call is replayed on the production functions, stores loaded through the migrations 6 -> 7 -> 8, the journal
 * path state set from the simulator's state (method, switch day, aligned target in force, last estimate and h, surfacing
 * reference):
 * - proposal: `checkAlignProposal` opens it exactly on the days the prototype triggers it;
 * - switch: `switchToAlignedTarget` (median, rounding, floor x 1.10, plan);
 * - aligned target: `computeCalibrationState` (gate, surfacing, candidate) and `applyRecalibration`, `periodicReplan` (and
 *   the days it is skipped on the aligned target itself), `enforcePlanGuardrails`;
 * - measured habit: `evaluateJournalWeek` (gate, estimate M, habit h, surfacing on M / h, first plan and later plans,
 *   failures), `measuredPeriodicReplan`, `enforceMeasuredGuardrails`.
 * The first plan of the habit is offered in production and confirmed here, as the prototype applies it (kept from the
 * prototype, with the weekly guardrails and the BMI-20 rule of pass 5a).
 *
 * Compared: status, rule and reason; every field of the plan (and of the profile for G1), numbers bit for bit, except
 * `source` (own sources of the production paths) and `scientificModelVersion`. Also checked: the tolerances of decisions 6
 * to 8 never trigger (every simulated user weighs in and logs every day in full).
 * Report 46 (fixes of 5b): also checked, the adherence deduced from the journal writes nothing on these stores (every
 * simulated user declares every day); stores now loaded through the migrations up to schema 9.
 * Run (8 parts, then the merge that checks everything):
 *   REPLAY_PART=<k> REPLAY_PARTS=8 npx vitest run -c vitest.journal.config.ts prod5b/equivalence -t part
 *   REPLAY_PARTS=8 npx vitest run -c vitest.journal.config.ts prod5b/equivalence -t merge
 * FIX_DIR (optional): the fixture directory, tests/experiments-journal/results/prod5b by default.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { applyRecalibration, computeCalibrationState, enforcePlanGuardrails, periodicReplan } from '@/domain/engine';
import {
  acceptMeasuredOffer,
  checkAlignProposal,
  continuousLoggingStart,
  deduceAdherenceFromJournal,
  enforceMeasuredGuardrails,
  evaluateJournalWeek,
  jstarPlanOf,
  measuredInput,
  measuredPeriodicReplan,
  switchToAlignedTarget,
} from '@/domain/journalPath';
import type { WheightyStore } from '@/domain/types';
import { defaultJournalPath } from '@/domain/types';
import type { JournalPathState } from '@/domain/types';
import { migrateToCurrent } from '@/persistence/migrations';
import { validateStore } from '@/persistence/schema';
import { addDays } from '@/science/dates';
import { PRODUCTION_SOLVER } from '@/domain/engine';

type Arrays = { weights: WheightyStore['weights']; dailyLogs: WheightyStore['dailyLogs']; entries: WheightyStore['foodJournal']['entries'] };
type Ctx = {
  switchDay: number | null;
  mode: string;
  chosenTargetActive: boolean;
  jsRef: { tdeeKcal: number; interval80Width: number; surfacedOn: string } | null;
  journalApplied: { offsetKcal: number; interval80: [number, number]; interval95: [number, number] } | null;
  jsHInForce: number | null;
};
type Event = { kind: string; arm: string; day: number; date: string; ctx: Ctx; expected: Record<string, unknown>; store: Record<string, unknown>; reduced: boolean };
type User = { job: string; index: number; goal: string; behavior: string | null; population: string; proposalDay: number | null; finals: Record<string, Arrays>; events: Event[] };

const IGNORED = new Set(['source', 'scientificModelVersion']);
const nowIsoOf = (date: string) => `${date}T08:00:00.000Z`;

/** Paths where a and b differ (exact equality of numbers), the fields that differ by design left out. */
function diff(a: unknown, b: unknown, path = ''): string[] {
  if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b) ? [] : [`${path}: ${a} != ${b}`];
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b ? [] : [`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`];
  if (Array.isArray(a) !== Array.isArray(b)) return [`${path}: array mismatch`];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const k of keys) {
    if (IGNORED.has(k)) continue;
    out.push(...diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`));
  }
  return out;
}

/** Inverse of the fixture's reduction (same code as fixture.bench.ts). */
function restore(reduced: Record<string, unknown>, date: string, final: Arrays): Record<string, unknown> {
  const { counts, dailyLogs, foodJournal, ...rest } = reduced as { counts: { weights: number; entries: number }; dailyLogs: WheightyStore['dailyLogs']; foodJournal: WheightyStore['foodJournal'] } & Record<string, unknown>;
  return { ...rest, weights: final.weights.slice(0, counts.weights), dailyLogs: [...final.dailyLogs.filter((l) => l.date < date), ...dailyLogs], foodJournal: { ...foodJournal, entries: final.entries.slice(0, counts.entries) } };
}

function load(raw: unknown, nowIso: string): WheightyStore {
  const m = migrateToCurrent(raw, undefined, undefined, { nowIso });
  if (!m.ok) throw new Error(m.error);
  const v = validateStore(m.value);
  if ('error' in v) throw new Error(v.error);
  if (!v.clean) throw new Error(`dropped: ${JSON.stringify(v.dropped)}`);
  return v.store;
}

const withPath = (s: WheightyStore, patch: Partial<JournalPathState>): WheightyStore => ({ ...s, meta: { ...s.meta, journalPath: { ...defaultJournalPath(), ...patch } } });

/** Journal path state of the simulator's state at the event (method, switch, aligned target itself, measured habit). */
function pathFor(e: Event): Partial<JournalPathState> {
  const c = e.ctx;
  const switchedOn = c.switchDay === null ? null : addDays(e.date, c.switchDay - e.day);
  if (c.mode === 'JS') {
    const h = c.jsHInForce as number;
    return {
      method: 'measured',
      switchedOn,
      lastEvaluatedOn: addDays(e.date, -7),
      estimate: c.journalApplied,
      habit: { h, raw: h, bound: null, days: 0 },
      surfacingReference: c.jsRef,
    };
  }
  return { method: 'aligned', switchedOn, chosenTargetActive: c.chosenTargetActive, lastEvaluatedOn: addDays(e.date, -7) };
}

const DIR = process.env.FIX_DIR ?? 'tests/experiments-journal/results/prod5b';
const PARTS = Number(process.env.REPLAY_PARTS ?? '8');
type PartResult = { users: number; switched: number; counts: Record<string, number>; failures: string[]; tolerance: Record<string, number>; controls: number; controlDiffers: number; ms: number };

it('part: replay of one part of the fixture files', () => {
  const part = Number(process.env.REPLAY_PART ?? '0');
  const dir = DIR;
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl.gz')).sort().filter((_f, i) => i % PARTS === part);
  const counts: Record<string, number> = {};
  const failures: string[] = [];
  const tolerance = { jstarGates: 0, missedWeighIns: 0, unusableDays: 0, flaggedDays: 0, startNotOnboarding: 0, adherenceDeduced: 0 };
  let users = 0;
  let switched = 0;
  let controls = 0;
  let controlDiffers = 0;
  const t0 = performance.now();
  const count = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  for (const f of files) {
    for (const line of gunzipSync(readFileSync(`${dir}/${f}`)).toString('utf8').trim().split('\n')) {
      const u = JSON.parse(line) as User;
      users++;
      if (u.proposalDay !== null) switched++;
      for (const e of u.events) {
        const key = `${u.job} ${e.arm} ${e.kind}${e.kind === 'jstar' ? (e.ctx.mode === 'C' ? ' first' : ' habit') : ''}`;
        count(key);
        const where = `${u.job}#${u.index} ${e.arm} ${e.kind} ${e.date}`;
        const exp = e.expected;
        const final = u.finals[e.arm === 'common' ? 'C' : e.arm] as Arrays;
        const raw = e.reduced ? restore(e.store, e.date, final) : e.store;
        const base = load(raw, nowIsoOf(e.date));
        const nowIso = nowIsoOf(e.date);
        // Report 46, point 4: every simulated user declares every day, so the adherence deduced from the journal writes nothing.
        const deduced = deduceAdherenceFromJournal(base, e.date);
        if (deduced !== base) tolerance.adherenceDeduced += deduced.dailyLogs.filter((l, i) => l !== base.dailyLogs[i]).length;
        const fail = (msg: string) => failures.push(`${where}: ${msg}`);

        if (e.kind === 'proposal') {
          const s = checkAlignProposal(base, e.date, nowIso);
          const opened = s.meta.journalPath.proposalOpenedOn === e.date;
          if (opened !== exp.triggered) fail(`proposal opened ${opened} != triggered ${String(exp.triggered)}`);
          continue;
        }
        if (e.kind === 'switch') {
          const r = switchToAlignedTarget(base, e.date, nowIso);
          if (!r.ok) {
            fail(`switch refused (${r.reason})`);
            continue;
          }
          const t = r.target;
          const got = { median14: t.medianKcal, rounded: t.roundedKcal, final: t.finalKcal, floor: r.store.meta.journalPath.alignedTarget?.floorKcal, replaced: r.store.meta.journalPath.alignedTarget?.raised };
          failures.push(...diff(got, { median14: exp.median14, rounded: exp.rounded, final: exp.final, floor: exp.floor, replaced: exp.replaced }, `${where} target`));
          failures.push(...diff(r.store.plan, exp.plan, `${where} plan`));
          continue;
        }
        const store = withPath(base, pathFor(e));
        if (e.kind === 'current') {
          const state = computeCalibrationState(store, e.date, nowIso);
          if (!state) {
            fail('no calibration state');
            continue;
          }
          if (state.gate.met !== exp.gateMet) fail(`gate ${state.gate.met} != ${String(exp.gateMet)}`);
          if (state.surfaced !== exp.surfaced) fail(`surfaced ${state.surfaced} != ${String(exp.surfaced)}`);
          if (exp.gateMet && !Object.is(state.candidate?.posteriorMedianOffsetKcal ?? null, exp.candidateMedian)) fail(`candidate ${state.candidate?.posteriorMedianOffsetKcal} != ${String(exp.candidateMedian)}`);
          const recal = exp.recal as { ok: boolean; plan?: unknown; reason?: string } | undefined;
          if (recal) {
            const r = applyRecalibration(store, state, e.date, nowIso);
            if (r.ok !== recal.ok) fail(`recal ok ${r.ok} != ${recal.ok}`);
            else if (r.ok) {
              failures.push(...diff(r.store.plan, recal.plan, `${where} recal plan`));
              if (r.store.meta.journalPath.chosenTargetActive) fail('aligned target still marked in force after a recalibration');
              if (controls < 5) {
                // Negative control: the same recalibration without the floor factor of the aligned target differs.
                controls++;
                const plain = applyRecalibration(withPath(base, {}), state, e.date, nowIso);
                if (plain.ok && diff(plain.store.plan, recal.plan).length > 0) controlDiffers++;
              }
            } else if (r.reason !== recal.reason) fail(`recal reason ${r.reason} != ${String(recal.reason)}`);
          }
          continue;
        }
        if (e.kind === 'periodic_skip') {
          const r = periodicReplan(store, e.date, { nowIso });
          if (r.status !== 'not_due') fail(`periodic on the aligned target itself: ${r.status}`);
          continue;
        }
        if (e.kind === 'periodic') {
          const r = periodicReplan(store, e.date, { nowIso });
          if (r.status !== exp.status) fail(`status ${r.status} != ${String(exp.status)}`);
          else if (r.status === 'replanned') failures.push(...diff(r.store.plan, exp.plan, `${where} plan`));
          else if (r.status === 'failed' && r.reason !== exp.reason) fail(`reason ${r.reason} != ${String(exp.reason)}`);
          continue;
        }
        if (e.kind === 'guard') {
          const r = enforcePlanGuardrails(store, e.date, { nowIso });
          if (r.status !== exp.status) fail(`status ${r.status} != ${String(exp.status)}`);
          else if (r.status !== 'none') {
            if (r.rule !== exp.rule) fail(`rule ${r.rule} != ${String(exp.rule)}`);
            if (r.status === 'applied') {
              failures.push(...diff(r.store.plan, exp.plan, `${where} plan`));
              failures.push(...diff(r.store.profile, exp.profile, `${where} profile`));
            } else if (r.reason !== exp.reason) fail(`reason ${r.reason} != ${String(exp.reason)}`);
          } else if (r.store !== store) fail('store changed without a guardrail');
          continue;
        }
        if (e.kind === 'jstar') {
          const week = evaluateJournalWeek(store, e.date, nowIso);
          const rec = exp.record as { gateMet: boolean; m: number | null; h: number | null; surfaced: boolean; applied: boolean; failure?: string } | null;
          const build = exp.build as { iStar: number | null; h: number } | null;
          if (week.kind === 'not_due') {
            fail('not due');
            continue;
          }
          const gate = week.gate;
          if (gate) {
            tolerance.jstarGates++;
            tolerance.missedWeighIns += gate.missedWeighIns;
            tolerance.unusableDays += gate.unusableDays;
            const prepared = measuredInput(store, e.date);
            if (prepared) tolerance.flaggedDays += prepared.observations.filter((o) => o.date >= prepared.windowStart && o.date < e.date && !o.usable).length;
            if (continuousLoggingStart(store, e.date) !== store.meta.onboardingDate) tolerance.startNotOnboarding++;
          }
          if (rec === null) {
            // The prototype does not evaluate before 14 days since the switch (fallback).
            if (!(week.kind === 'evaluated' && gate === null)) fail(`too early, got ${week.kind}`);
            continue;
          }
          if ((gate?.met ?? false) !== rec.gateMet) fail(`gate ${String(gate?.met)} != ${rec.gateMet} (${gate?.missing.join('|')})`);
          if (rec.failure !== undefined) {
            if (week.kind !== 'failed' || week.reason !== rec.failure) fail(`failure ${rec.failure} != ${week.kind} ${week.kind === 'failed' ? week.reason : ''}`);
            continue;
          }
          if (rec.applied) {
            if (week.kind !== 'offer') {
              fail(`applied in the prototype, ${week.kind} here`);
              continue;
            }
            const o = week.offer;
            failures.push(...diff(o.plan, exp.plan, `${where} plan`));
            failures.push(...diff({ m: o.maintenanceKcal, h: o.habit.h, iStar: o.intakeKcal }, { m: rec.m, h: rec.h, iStar: build?.iStar ?? null }, `${where} estimate`));
            // Confirmed, as the prototype applies it: the plan in force is the offered plan.
            const accepted = acceptMeasuredOffer({ ...store, meta: { ...store.meta, journalPath: { ...store.meta.journalPath, offer: o } } }, e.date, nowIso);
            if (!accepted.ok || accepted.store.plan !== o.plan || accepted.store.meta.journalPath.method !== 'measured') fail('confirmation');
            if (controls < 10 && o.habit.h !== 1) {
              // Negative control: the same plan with h = 1 differs.
              controls++;
              const input = measuredInput(store, e.date);
              const plain = input ? jstarPlanOf(store, e.date, o.estimate, 1, { request: PRODUCTION_SOLVER, input: input.input }) : null;
              if (plain?.ok && diff(plain.plan, exp.plan).length > 0) controlDiffers++;
            }
            continue;
          }
          if (week.kind === 'offer' || week.kind === 'failed') fail(`not applied in the prototype, ${week.kind} here`);
          if (rec.m !== null && week.kind === 'evaluated' && week.measured) failures.push(...diff({ m: week.measured.maintenanceKcal, h: week.measured.habit.h }, { m: rec.m, h: rec.h }, `${where} estimate`));
          continue;
        }
        if (e.kind === 'jstar_periodic') {
          const r = measuredPeriodicReplan(store, e.date, nowIso);
          const status = r.status === 'not_due' ? 'not_due' : r.status;
          if (status !== exp.status) fail(`status ${status} != ${String(exp.status)}`);
          else if (r.status === 'replanned') failures.push(...diff(r.store.plan, exp.plan, `${where} plan`));
          else if (r.status === 'failed' && r.reason !== exp.reason) fail(`reason ${r.reason} != ${String(exp.reason)}`);
          continue;
        }
        if (e.kind === 'jstar_guard') {
          const s = enforceMeasuredGuardrails(store, e.date, nowIso);
          const last = s.meta.planEvents[s.meta.planEvents.length - 1];
          const changed = s !== store;
          const status = !changed ? 'none' : last?.status ?? 'none';
          if (status !== exp.status) fail(`status ${status} != ${String(exp.status)}`);
          else if (status === 'applied') {
            if (last?.rule !== exp.rule) fail(`rule ${String(last?.rule)} != ${String(exp.rule)}`);
            failures.push(...diff(s.plan, exp.plan, `${where} plan`));
            failures.push(...diff(s.profile, exp.profile, `${where} profile`));
          } else if (status === 'failed' && last?.reason !== exp.reason) fail(`reason ${String(last?.reason)} != ${String(exp.reason)}`);
          continue;
        }
        fail(`unknown event ${e.kind}`);
      }
    }
  }
  const result: PartResult = { users, switched, counts, failures, tolerance, controls, controlDiffers, ms: Math.round(performance.now() - t0) };
  writeFileSync(`${dir}/equivalence-part${part}.json`, `${JSON.stringify(result)}\n`);
});

it('merge: production journal path = validated prototype (iteration 2d, arms C and JS)', () => {
  const parts: PartResult[] = [];
  for (let k = 0; k < PARTS; k++) {
    const f = `${DIR}/equivalence-part${k}.json`;
    expect(existsSync(f), f).toBe(true);
    parts.push(JSON.parse(readFileSync(f, 'utf8')) as PartResult);
  }
  const sum = (k: 'users' | 'switched' | 'controls' | 'controlDiffers' | 'ms') => parts.reduce((s, p) => s + p[k], 0);
  const counts: Record<string, number> = {};
  const tolerance: Record<string, number> = {};
  for (const p of parts) {
    for (const [k, v] of Object.entries(p.counts)) counts[k] = (counts[k] ?? 0) + v;
    for (const [k, v] of Object.entries(p.tolerance)) tolerance[k] = (tolerance[k] ?? 0) + v;
  }
  const failures = parts.flatMap((p) => p.failures);
  const byKey = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)));
  const tol = (k: string) => tolerance[k] ?? 0;
  const summary = [
    `users ${sum('users')}, switched ${sum('switched')}`,
    `events ${Object.values(counts).reduce((a, b) => a + b, 0)} ${JSON.stringify(byKey, null, 1)}`,
    `tolerances (J* evaluations with a gate: ${tol('jstarGates')}): missed weigh-ins ${tol('missedWeighIns')}, non-usable days ${tol('unusableDays')}, days flagged in the windows ${tol('flaggedDays')}, window not from the onboarding day ${tol('startNotOnboarding')}`,
    `adherence deduced from the journal (report 46, point 4) over every replayed store: ${tol('adherenceDeduced')} days`,
    `negative controls ${sum('controlDiffers')} / ${sum('controls')} differ`,
    `failures ${failures.length}`,
    ...failures.slice(0, 80),
    `${sum('ms')} ms of replay over ${PARTS} parts`,
  ].join('\n');
  writeFileSync(`${DIR}/equivalence.txt`, `${summary}\n`);
  expect(sum('users')).toBe(400);
  expect(tol('missedWeighIns') + tol('unusableDays') + tol('flaggedDays') + tol('startNotOnboarding')).toBe(0);
  expect(tol('adherenceDeduced')).toBe(0);
  expect(sum('controlDiffers')).toBe(sum('controls'));
  expect(failures).toEqual([]);
});
