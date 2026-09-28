/**
 * Pass 5a (report 43), verification 1: the default production path gives exactly the plans of the validated prototype
 * (K2 + G, reports 38 and 39) on 200 ideal and 200 realistic users over 24 weeks.
 *
 * The fixture comes from the measurement branch (fixture.bench.ts, run there, never committed there): every call of the
 * validated simulator to a plan-producing function, with its input store and the prototype's output. Here each call is
 * replayed on the production functions, with their defaults (no solver option, no replan cadence, no guardrail option):
 * completeOnboarding, applyRecalibration (calibration state recomputed from the store), periodicReplan,
 * enforcePlanGuardrails. The guardrail calls are those the simulator made once a week (the production checks them every
 * day; replaying the simulator's calls is the weekly configuration). Stores are loaded through the migration 6 -> 7.
 *
 * Compared: status, rule and reason; every field of the plan (and, for G1, of the profile), numbers bit for bit, except
 * the fields that differ by design: `source` (own sources 'guardrail' and 'periodic_replan' instead of 'initial' and
 * 'recalibrated') and `scientificModelVersion` (1.4.0 instead of 1.3.0).
 * Run: FIX_DIR=tests/experiments-journal/results/prod5a npx vitest run -c vitest.journal.config.ts prod5a/equivalence
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { applyRecalibration, completeOnboarding, computeCalibrationState, enforcePlanGuardrails, periodicReplan } from '@/domain/engine';
import type { WheightyStore } from '@/domain/types';
import { migrateToCurrent } from '@/persistence/migrations';
import { emptyStore, validateStore } from '@/persistence/schema';
import { minimumTargetWeightKg } from '@/science/macros';
import type { UserProfile } from '@/science/types';

type Event = { kind: 'onboarding' | 'recal' | 'periodic' | 'guard'; date: string; input: Record<string, unknown>; expected: Record<string, unknown> };
type User = { job: string; index: number; goal: string; events: Event[] };

const IGNORED = new Set(['source', 'scientificModelVersion']);

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

function load(raw: unknown, nowIso: string): WheightyStore {
  const m = migrateToCurrent(raw, undefined, undefined, { nowIso });
  if (!m.ok) throw new Error(m.error);
  const v = validateStore(m.value);
  if ('error' in v) throw new Error(v.error);
  if (!v.clean) throw new Error(`dropped: ${JSON.stringify(v.dropped)}`);
  return v.store;
}

function raised(profile: UserProfile): UserProfile {
  if (profile.goal !== 'loss') return profile;
  const min = minimumTargetWeightKg(profile.heightCm);
  return profile.targetWeightKg < min ? { ...profile, targetWeightKg: min } : profile;
}

it('pass 5a: production path = validated prototype (K2 + G)', () => {
  const dir = process.env.FIX_DIR ?? 'tests/experiments-journal/results/prod5a';
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl.gz')).sort();
  const counts: Record<string, number> = {};
  const failures: string[] = [];
  let users = 0;
  const t0 = performance.now();
  for (const f of files) {
    for (const line of gunzipSync(readFileSync(`${dir}/${f}`)).toString('utf8').trim().split('\n')) {
      const u = JSON.parse(line) as User;
      users++;
      for (const e of u.events) {
        const key = `${u.job} ${e.kind}`;
        counts[key] = (counts[key] ?? 0) + 1;
        const where = `${u.job}#${u.index} ${e.kind} ${e.date}`;
        const exp = e.expected;
        if (e.kind === 'onboarding') {
          const i = e.input as { profile: UserProfile; today: string; nowIso: string };
          const r = completeOnboarding(emptyStore(), raised(i.profile), i.today, i.nowIso, null);
          if (r.ok !== exp.ok) failures.push(`${where}: ok ${r.ok} != ${String(exp.ok)}`);
          else if (r.ok) failures.push(...diff(r.store.plan, exp.plan, `${where} plan`));
          continue;
        }
        const today = e.input.today as string;
        const store = load(e.input.store, `${today}T08:00:00.000Z`);
        if (e.kind === 'recal') {
          const nowIso = e.input.nowIso as string;
          const state = computeCalibrationState(store, today, nowIso);
          if (!state) {
            failures.push(`${where}: no calibration state`);
            continue;
          }
          if (!Object.is(state.candidate?.posteriorMedianOffsetKcal ?? null, e.input.candidateMedian)) failures.push(`${where}: candidate ${state.candidate?.posteriorMedianOffsetKcal} != ${String(e.input.candidateMedian)}`);
          const r = applyRecalibration(store, state, today, nowIso);
          if (r.ok !== exp.ok) failures.push(`${where}: ok ${r.ok} != ${String(exp.ok)} (${r.ok ? '' : r.reason} / ${String(exp.reason)})`);
          else if (r.ok) failures.push(...diff(r.store.plan, exp.plan, `${where} plan`));
          else if (r.reason !== exp.reason) failures.push(`${where}: reason ${r.reason} != ${String(exp.reason)}`);
          continue;
        }
        if (e.kind === 'periodic') {
          const r = periodicReplan(store, today);
          if (r.status !== exp.status) failures.push(`${where}: status ${r.status} != ${String(exp.status)}`);
          else if (r.status === 'replanned') {
            failures.push(...diff(r.store.plan, exp.plan, `${where} plan`));
            if (r.store.plan?.source !== 'periodic_replan') failures.push(`${where}: source ${r.store.plan?.source}`);
          } else if (r.status === 'failed' && r.reason !== exp.reason) failures.push(`${where}: reason ${r.reason} != ${String(exp.reason)}`);
          continue;
        }
        const r = enforcePlanGuardrails(store, today);
        if (r.status !== exp.status) failures.push(`${where}: status ${r.status} != ${String(exp.status)}`);
        else if (r.status !== 'none') {
          if (r.rule !== exp.rule) failures.push(`${where}: rule ${r.rule} != ${String(exp.rule)}`);
          if (r.status === 'applied') {
            failures.push(...diff(r.store.plan, exp.plan, `${where} plan`));
            failures.push(...diff(r.store.profile, exp.profile, `${where} profile`));
            if (r.store.plan?.source !== 'guardrail') failures.push(`${where}: source ${r.store.plan?.source}`);
          } else if (r.reason !== exp.reason) failures.push(`${where}: reason ${r.reason} != ${String(exp.reason)}`);
        } else if (r.store !== store) failures.push(`${where}: store changed without a guardrail`);
      }
    }
  }
  const summary = [`users ${users}`, `events ${JSON.stringify(counts)}`, `failures ${failures.length}`, ...failures.slice(0, 50), `${Math.round(performance.now() - t0)} ms`].join('\n');
  writeFileSync(`${dir}/equivalence.txt`, `${summary}\n`);
  expect(users).toBe(400);
  expect(failures).toEqual([]);
});

it('negative control: the same replay with the superseded solver differs', () => {
  const dir = process.env.FIX_DIR ?? 'tests/experiments-journal/results/prod5a';
  const file = readdirSync(dir).filter((f) => f.endsWith('.jsonl.gz')).sort()[0] as string;
  const u = JSON.parse(gunzipSync(readFileSync(`${dir}/${file}`)).toString('utf8').split('\n')[0] as string) as User;
  const recals = u.events.filter((e) => e.kind === 'recal' && e.expected.ok).slice(0, 5);
  expect(recals.length).toBe(5);
  for (const e of recals) {
    const today = e.input.today as string;
    const nowIso = e.input.nowIso as string;
    const store = load(e.input.store, `${today}T08:00:00.000Z`);
    const state = computeCalibrationState(store, today, nowIso);
    const production = applyRecalibration(store, state as NonNullable<typeof state>, today, nowIso);
    const legacy = applyRecalibration(store, state as NonNullable<typeof state>, today, nowIso, { solverStart: 'equilibrium', rateDefinition: 'fortyTwoDayWeight', solverHorizonDays: 42 });
    expect(production.ok && diff(production.store.plan, e.expected.plan)).toEqual([]);
    expect(legacy.ok && diff(legacy.store.plan, e.expected.plan).length).toBeGreaterThan(0);
  }
});
