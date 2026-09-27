/**
 * Iteration 2d (prompt 41): full level 2 (J*, code JS) against the chosen target (C), after the accepted revision proposal.
 * Job definitions, raw export and the continuous control of s5.4. Measurement only.
 *
 * Every simulated user carries K2 + G (K2G of the relaunch, it2r/jobs2r.ts), in both arms (s3.3). Arms (s3):
 * - C: the chosen target of report 40, with the floor D-32 x 1.10 on every target after the switch and the plan floor field
 *   set with T_c (artefact M3), `ARM_C2D`;
 * - JS: J*, `ARM_JS`: fallback on arm C until its first plan; level-2 gate of arm J (X = 100 %, 28 days) plus 14 days since
 *   the switch; M = the journal estimate of arm J (flat prior, +-2 000 grid); h over 28 days bounded to [0.80, 1.25]; plans
 *   I* >= h x floor x 1.10, T = I* / h.
 * Non-followers only (s5.1); goals loss 2/5, maintenance 1/5, gain 2/5 (goal dimension of the Latin hypercube with five
 * equal levels); weigh-in density 1.00 in every measurement sample ({0.90, 0.75} in control 6.1); behaviour after the switch
 * (s5.3) = one more Latin dimension with the behaviours of the step, in equal shares; H4 = robustness (T_c kept).
 *
 * Declared seeds (new bases, disjoint from every previous pass, derived streams included: phases 1 and 1b < 6e6, iteration
 * 2 in [1.0e9, 2.03e9], 2a in [2.1e9, 2.63e9], 2b in [2.7e9, 3.53e9], 2c in [3.6e9, 4.03e9], relaunch in [4.03e9, 4.2925e9];
 * the bootstrap seeds of the tables, 38 000 001 to 41 000 001, are avoided; checked with the validity for the generator
 * (< 2^32) by tests/domain/seeds2d.test.ts before any measurement). For a base b: user master seed = b + index (index <
 * 100 000, sub-bases included); derived streams = master + k x 1 000 003 (k <= 20; k = 14: H3 draws); LHS seed = b + 999 983;
 * declared major-deviation share seed = b + 999 979; behaviour seed = b + 999 977; daily sample seed = b + 999 991.
 * - pilot2d    100 000 000  cost pilot (s6.4), sub-bases b, b + 10 000, b + 20 000, b + 30 000 (V1, V2, V3, V4 types);
 *                           outputs deleted, no result used; also the fixtures of the unit tests (index 90 000 and above)
 * - controls2d 120 200 000  controls: fallback (s6.1, density 0.90 / 0.75) from b, pairing (s6.2) from b + 10 000
 * - v1         140 400 000  V1: P00, R0, R15, R30
 * - v1x2       160 600 000  doubled V1 pass (INCONCLUSIF, A7.4)
 * - v2         180 800 000  V2: P00, H1, H2a, H2b, H3; H4 (500, reported) from the sub-base b + 50 000
 * - v2x2       201 000 000  doubled V2 pass
 * - v3         221 200 000  V3: P05, P10, P20, R0, R15, R30 (the same users in each population, u from its law)
 * - v3x2       241 400 000  doubled V3 pass
 * - v4         261 600 000  V4: sensitivities P10_sd20, P10_slope-5, P10_slope-10, R0, R15, R30 (the same users in each)
 * - v4x2       281 800 000  doubled V4 pass
 * Raw rows: tests/experiments-journal/results/it2d/<dir>/<job>-shard<k>.csv.gz (+ -daily- and -timing- files).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { SIM_DAYS, POPULATIONS, armMetrics, closedLoopSlots, journalArm, lhsSeed, makeSpec, simulateUser } from '../../helpers/closedLoop';
import type { ArmConfig, ChosenTargetSettings, JStarSettings, Population, PostSwitchBehavior, ProfileSlot, SimState, SpecOptions, UserSpec, World } from '../../helpers/closedLoop';
import { writeCsvGz } from '../../helpers/journalExport';
import type { CsvValue } from '../../helpers/journalExport';
import { createRng } from '../../helpers/random';
import { RESULTS, specColumns, stateColumns } from '../it2/jobs';
import { columns2b } from '../it2b/jobs2b';
import { columns2c } from '../it2c/jobs2c';
import { K2G, MAJOR_SHARE_SEED_OFFSET, SAMPLE_SEED_OFFSET, columns2r } from '../it2r/jobs2r';

export const IT2D_DIR = `${RESULTS}/it2d`;
export const SEED_BASES_2D = {
  pilot2d: 100_000_000,
  controls2d: 120_200_000,
  v1: 140_400_000,
  v1x2: 160_600_000,
  v2: 180_800_000,
  v2x2: 201_000_000,
  v3: 221_200_000,
  v3x2: 241_400_000,
  v4: 261_600_000,
  v4x2: 281_800_000,
} as const;
export const BEHAVIOR_SEED_OFFSET = 999_977;
/** Share of each stratum in the daily sample (s5.5): 5 % (rounded up), plus every user whose h reached a bound. */
export const DAILY_SAMPLE_SHARE_2D = 0.05;
export const H4_SUB_BASE_OFFSET = 50_000;

/** s5.1: goal levels of the hypercube, loss 2/5, maintenance 1/5, gain 2/5. */
export const GOALS_2D = ['loss', 'loss', 'maintenance', 'gain', 'gain'] as const;
export const BEHAVIORS_R: readonly PostSwitchBehavior[] = ['R0', 'R15', 'R30'];
export const BEHAVIORS_H: readonly PostSwitchBehavior[] = ['H1', 'H2a', 'H2b', 'H3'];
export const DENSITY_MEASURE = [1] as const;
export const DENSITY_FALLBACK = [0.9, 0.75] as const;

/**
 * Sizes of the steps (s7), fixed before any measurement. V1 and V3 (per population): 2 500 non-followers per behaviour; V2:
 * 2 500 per behaviour; H4: 500; V4: 1 500 per sensitivity. A doubled pass doubles n (A7.4). The scaling of s7 (a loss or
 * gain cell under 700 switched users in the pilot) is applied here, before any measurement, and declared in the report.
 */
export const SIZES_2D = { v1: 7500, v2: 10000, h4: 500, v3: 7500, v4: 1500, fallback: 300, pairing: 50, pilotPerType: 64 } as const;

// Arms (s3).
export const CHOSEN_2D: ChosenTargetSettings = { floorFactor: 1.1, fixFloorField: true };
export const JSTAR_2D: JStarSettings = {
  // Estimator of arm J at report 40, unchanged: flat prior, +-2 000 grid, floor x 1.10, baseline carbohydrates, X = 100 %.
  journal: (journalArm('J', 1) as Extract<ArmConfig, { kind: 'J' }>).journal,
  minDaysSinceSwitch: 14,
  habitWindowDays: 28,
  habitBounds: [0.8, 1.25],
  floorFactor: 1.1,
};
export const ARM_C2D: ArmConfig = { key: 'C', kind: 'C', chosen: CHOSEN_2D };
export const ARM_JS: ArmConfig = { key: 'JS', kind: 'JS', chosen: CHOSEN_2D, jstar: JSTAR_2D };
export const ARMS_2D: readonly ArmConfig[] = [ARM_C2D, ARM_JS];

export type JobUser2d = { slot: ProfileSlot; base: number; index: number; options: SpecOptions; tags: Record<string, CsvValue> };
export type Job2d = { name: string; dir: string; count: number; base: number; user: (i: number) => JobUser2d | null };

const slotCache = new Map<string, ProfileSlot[]>();
/** LHS slots of a base (s5.1): goals 2/5, 1/5, 2/5, the given weigh-in levels, major-deviation share, behaviour of the step. */
export function slots2d(n: number, base: number, behaviors: readonly PostSwitchBehavior[], weighProbabilities: readonly number[] = DENSITY_MEASURE): ProfileSlot[] {
  const key = `${n}:${base}:${behaviors.join(',')}:${weighProbabilities.join(',')}`;
  let s = slotCache.get(key);
  if (!s) {
    s = closedLoopSlots(n, lhsSeed(base), base + MAJOR_SHARE_SEED_OFFSET, { goals: GOALS_2D, weighProbabilities, behaviorSeed: base + BEHAVIOR_SEED_OFFSET, behaviors });
    slotCache.set(key, s);
  }
  return s;
}

const pop = (key: string) => POPULATIONS[key] as Population;
/** Spec options: non-follower, K2 + G, H4 = robustness (T_c kept to the end, s5.3). */
const opts = (pass: string, population: Population, slot: ProfileSlot): SpecOptions => ({ pass, behavior: 'nonfollower', population, ...K2G, ...(slot.postSwitch === 'H4' ? { robustness: true } : {}) });

/** n users per population key, the same slots and master seeds in every population (u drawn from its law). */
function populationsJob(name: string, dir: string, keys: readonly string[], base: number, n: number, behaviors: readonly PostSwitchBehavior[], weigh: readonly number[] = DENSITY_MEASURE): Job2d {
  return {
    name,
    dir,
    count: n * keys.length,
    base,
    user: (i) => {
      const key = keys[Math.floor(i / n)];
      if (key === undefined) return null;
      const j = i % n;
      const slot = slots2d(n, base, behaviors, weigh)[j] as ProfileSlot;
      return { slot, base, index: j, options: opts(name, pop(key), slot), tags: { population: key } };
    },
  };
}

export function jobFor2d(name: string): Job2d {
  const B = SEED_BASES_2D;
  const S = SIZES_2D;
  switch (name) {
    // s6.4 cost pilot (discarded seeds): 64 non-followers per step type (V1: P00, R; V2: P00, H1 to H4; V3: P10, R; V4: P10_sd20, R).
    case 'pilot2d': {
      const types: Array<{ key: string; pop: string; behaviors: readonly PostSwitchBehavior[] }> = [
        { key: 'V1', pop: 'P00', behaviors: BEHAVIORS_R },
        { key: 'V2', pop: 'P00', behaviors: [...BEHAVIORS_H, 'H4'] },
        { key: 'V3', pop: 'P10', behaviors: BEHAVIORS_R },
        { key: 'V4', pop: 'P10_sd20', behaviors: BEHAVIORS_R },
      ];
      const n = S.pilotPerType;
      return {
        name,
        dir: 'pilot',
        count: n * types.length,
        base: B.pilot2d,
        user: (i) => {
          const t = types[Math.floor(i / n)];
          if (!t) return null;
          const sub = B.pilot2d + 10_000 * Math.floor(i / n);
          const j = i % n;
          const slot = slots2d(n, sub, t.behaviors)[j] as ProfileSlot;
          return { slot, base: sub, index: j, options: opts(name, pop(t.pop), slot), tags: { population: t.pop, step_type: t.key } };
        },
      };
    }
    // s6.1 fallback: non-followers of P00 weighed with probability 0.90 or 0.75, every behaviour of V1 and V2.
    case 'fallback2d':
      return populationsJob(name, 'controls', ['P00'], B.controls2d, S.fallback, [...BEHAVIORS_R, ...BEHAVIORS_H, 'H4'], DENSITY_FALLBACK);
    // s6.2 pairing: 50 non-followers of P00, density 1.00, every behaviour.
    case 'pairing2d':
      return populationsJob(name, 'controls', ['P00'], B.controls2d + 10_000, S.pairing, [...BEHAVIORS_R, ...BEHAVIORS_H, 'H4']);
    case 'v1':
    case 'v1x2':
      return populationsJob(name, 'v1', ['P00'], name === 'v1' ? B.v1 : B.v1x2, name === 'v1' ? S.v1 : 2 * S.v1, BEHAVIORS_R);
    case 'v2':
    case 'v2x2':
      return populationsJob(name, 'v2', ['P00'], name === 'v2' ? B.v2 : B.v2x2, name === 'v2' ? S.v2 : 2 * S.v2, BEHAVIORS_H);
    // H4 (reported, no verdict): 500 non-followers of P00, T_c kept to the end.
    case 'v2h4':
      return populationsJob(name, 'v2', ['P00'], B.v2 + H4_SUB_BASE_OFFSET, S.h4, ['H4']);
    case 'v3':
    case 'v3x2':
      return populationsJob(name, 'v3', ['P05', 'P10', 'P20'], name === 'v3' ? B.v3 : B.v3x2, name === 'v3' ? S.v3 : 2 * S.v3, BEHAVIORS_R);
    case 'v4':
    case 'v4x2':
      return populationsJob(name, 'v4', ['P10_sd20', 'P10_slope-5', 'P10_slope-10'], name === 'v4' ? B.v4 : B.v4x2, name === 'v4' ? S.v4 : 2 * S.v4, BEHAVIORS_R);
    default:
      throw new Error(`unknown job ${name}`);
  }
}

export function specFor2d(u: JobUser2d): UserSpec {
  return makeSpec(u.slot, u.base, u.index, u.options);
}

// ---------------------------------------------------------------------------
// Continuous control (s5.4)
// ---------------------------------------------------------------------------

const DAY_SERIES = ['realKcal', 'loggedKcal', 'loggedCarbsG', 'realCarbsG', 'realProteinG', 'planTarget', 'planRate', 'planRequested', 'planProteinG', 'planGoal', 'planFloor', 'appW', 'modeDay', 'targetingDay', 'deviationDay', 'floorReal'] as const;

/**
 * s5.4: the series and plans of arm J* are identical, value for value (JSON with round-trip doubles), to those of arm C up to
 * the day before the first J* plan (the whole run when there is none): every daily series of days < first, true weight and
 * tissue up to the morning of the first day, plans, evaluations, periodic replans, guardrail events and S3-P checks of days
 * < first, recalibration days, T_c and the switch; without a J* plan, the final plan, profile and mode as well. Returns the
 * first difference, or null.
 */
export function continuityMismatch(c: SimState, js: SimState): string | null {
  const first = js.firstSwitchPlanDay ?? SIM_DAYS;
  const before = <T extends { day: number }>(v: readonly T[]) => v.filter((x) => x.day < first);
  const cmp: Array<[string, unknown, unknown]> = [
    ['switch', [c.proposalDay, c.accepted, c.switchDay, c.tc], [js.proposalDay, js.accepted, js.switchDay, js.tc]],
    ['trueW', c.trueW.slice(0, first + 1), js.trueW.slice(0, first + 1)],
    ['trueTissue', c.trueTissue.slice(0, first + 1), js.trueTissue.slice(0, first + 1)],
    ...DAY_SERIES.map((k) => [k, (c[k] as unknown[]).slice(0, first), (js[k] as unknown[]).slice(0, first)] as [string, unknown, unknown]),
    ['plans', before(c.plans), before(js.plans)],
    ['evals', before(c.evals), before(js.evals)],
    ['replans', before(c.replans), before(js.replans)],
    ['guards', before(c.guards), before(js.guards)],
    ['s3p', before(c.s3p), before(js.s3p)],
    ['recalDays', c.recalDays.filter((d) => d < first), js.recalDays.filter((d) => d < first)],
    ['failures', c.planFailures.filter((f) => Number(f.split(':')[0]) < first), js.planFailures.filter((f) => !f.includes(':jstar:') && Number(f.split(':')[0]) < first)],
  ];
  if (js.firstSwitchPlanDay === null) cmp.push(['final', [c.mode, c.chosenTargetActive, c.store.plan, c.store.profile], [js.mode, js.chosenTargetActive, js.store.plan, js.store.profile]]);
  for (const [k, a, b] of cmp) if (JSON.stringify(a) !== JSON.stringify(b)) return k;
  return null;
}

// ---------------------------------------------------------------------------
// Columns of iteration 2d (s5.5)
// ---------------------------------------------------------------------------

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const opt = (v: number | null, f: (x: number) => number = r1) => (v === null || !Number.isFinite(v) ? '' : f(v));

/**
 * Columns of prompt 41 (s5.5), on top of those of the relaunch (columns2r: S3-P, S3-D, S4-P, S4-J from the reference day of
 * A6.5 read by A7.4, i.e. the first J* plan for arm JS and the switch day for arm C):
 * - behaviour, weigh-in density (spec columns), robustness;
 * - day of the first J* plan, or the missing gate criteria of the last fallback evaluation;
 * - every J* plan construction: h, raw h, bound, I*, T, rate, floor active, failure reason; counts per kind and bound;
 * - error of h: h retained - realised ratio sum(logged) / sum(target of the plan) over the 28 following days or up to the
 *   next plan (every day of the simulation is usable, R0: the logged total is the intake of the estimate);
 * - every J* evaluation: M (median and 80 % interval), M / h, surfaced, applied; error of M against its truth in logged units
 *   (definition of the relaunch: true offset in logged units, `truthLogged`); weekly change of M / h;
 * - arm C: T_c and its replacement by the floor (state columns), floor of the check.
 */
export function columns2d(world: World, arm: ArmConfig, st: SimState, contMismatch: string | null): Record<string, CsvValue> {
  const out: Record<string, CsvValue> = {};
  out.behavior_ps = world.spec.slot.postSwitch ?? null;
  out.robustness_ps = world.spec.robustness;
  out.js_first_day = arm.kind === 'JS' ? st.firstSwitchPlanDay : null;
  const lastFallback = [...st.jsEvals].reverse().find((e) => e.fallback);
  out.js_gate_missing = arm.kind === 'JS' && st.firstSwitchPlanDay === null ? (lastFallback ? lastFallback.missing : st.switchDay === null ? 'no_switch' : 'not_evaluated') : null;
  out.js_fallback_evals = st.jsEvals.filter((e) => e.fallback).length;
  const builds = st.jsBuilds;
  out.js_builds = builds.map((b) => [b.day, b.kind, b.ok ? 1 : 0, r4(b.h), r4(b.hRaw), b.bound ?? '', opt(b.iStar), opt(b.target), b.rate ?? '', b.floorActive === null ? '' : b.floorActive ? 1 : 0, b.reason ?? ''].join(':')).join('|');
  const ok = builds.filter((b) => b.ok);
  out.n_js_recal = ok.filter((b) => b.kind === 'recal_jstar').length;
  out.n_js_periodic = ok.filter((b) => b.kind === 'replan_periodic_jstar').length;
  out.n_js_g1 = ok.filter((b) => b.kind === 'guardrail_g1').length;
  out.n_js_g2 = ok.filter((b) => b.kind === 'guardrail_g2').length;
  out.n_js_failed = builds.filter((b) => !b.ok).length;
  out.js_failed_reasons = builds.filter((b) => !b.ok).map((b) => `${b.day}:${b.kind}:${b.reason ?? ''}`).join('|');
  out.n_js_bound_low = builds.filter((b) => b.bound === 'low').length;
  out.n_js_bound_high = builds.filter((b) => b.bound === 'high').length;
  out.n_js_floor_active = ok.filter((b) => b.floorActive).length;
  const firstBuild = ok[0];
  out.h_first = firstBuild ? firstBuild.h : null;
  out.h_raw_first = firstBuild ? firstBuild.hRaw : null;
  out.h_bound_first = firstBuild ? (firstBuild.bound ?? 'none') : null;
  out.istar_first = firstBuild ? firstBuild.iStar : null;
  out.t_first = firstBuild ? firstBuild.target : null;
  // Error of h: realised sum(logged) / sum(target) over [plan day, min(plan day + 28, next plan day)).
  const starts = [...new Set(st.plans.map((p) => p.day))].sort((a, b) => a - b);
  const herr: number[] = [];
  for (const b of ok) {
    const next = starts.find((s) => s > b.day) ?? SIM_DAYS;
    const end = Math.min(b.day + 28, next, SIM_DAYS);
    let sl = 0;
    let stg = 0;
    for (let d = b.day; d < end; d++) {
      sl += st.loggedKcal[d] as number;
      stg += st.planTarget[d] as number;
    }
    if (end > b.day && stg > 0) herr.push(b.h - sl / stg);
  }
  out.h_err = herr.map((v) => r4(v)).join('|');
  out.h_err_first = herr[0] ?? null;
  out.h_err_mean = herr.length ? herr.reduce((s, v) => s + v, 0) / herr.length : null;
  const evals = st.jsEvals.filter((e) => !e.fallback || e.applied);
  out.js_evals = evals.map((e) => [e.day, e.gateMet ? 1 : 0, e.missing, opt(e.m), e.m80 ? r1(e.m80[0]) : '', e.m80 ? r1(e.m80[1]) : '', opt(e.mOverH), opt(e.h, r4), e.surfaced ? 1 : 0, e.applied ? 1 : 0, e.failure ?? ''].join(':')).join('|');
  const merr = evals.filter((e) => e.offsetMedian !== null && e.truthLogged !== null).map((e) => (e.offsetMedian as number) - (e.truthLogged as number));
  out.m_err_first = merr[0] ?? null;
  out.m_err_mean = merr.length ? merr.reduce((s, v) => s + v, 0) / merr.length : null;
  out.m_abs_err_mean = merr.length ? merr.reduce((s, v) => s + Math.abs(v), 0) / merr.length : null;
  const mh = evals.filter((e) => e.mOverH !== null).map((e) => e.mOverH as number);
  let dmh = 0;
  for (let k = 1; k < mh.length; k++) dmh += Math.abs((mh[k] as number) - (mh[k - 1] as number));
  out.mh_weekly_abs_change = mh.length > 1 ? dmh / (mh.length - 1) : null;
  // Displayed target stability after the reference day (H4 and reported): mean |week-to-week change| of the target in force.
  const ref = arm.kind === 'JS' ? st.firstSwitchPlanDay : st.switchDay;
  let dt = 0;
  let nt = 0;
  if (ref !== null) {
    for (let d = ref + 7; d < SIM_DAYS; d += 7) {
      dt += Math.abs((st.planTarget[d] as number) - (st.planTarget[d - 7] as number));
      nt++;
    }
  }
  out.target_weekly_abs_change = nt > 0 ? dt / nt : null;
  out.cont_mismatch = arm.kind === 'JS' ? (contMismatch ?? '') : null;
  return out;
}

// ---------------------------------------------------------------------------
// Daily sample (s5.5)
// ---------------------------------------------------------------------------

/** Stratum of the daily sample (s5.5): population x goal x BMI class x behaviour. */
export const stratumOf2d = (u: JobUser2d) => `${String(u.tags.population)}|${u.slot.goal}|${u.slot.bmiClass}|${u.slot.postSwitch ?? ''}`;

/** Random ceil(5 %) of each stratum (strata in sorted order), drawn with the job's sample seed (base + 999 991). */
export function dailySample2d(job: Job2d): Set<number> {
  const strata = new Map<string, number[]>();
  for (let i = 0; i < job.count; i++) {
    const u = job.user(i);
    if (!u) continue;
    const k = stratumOf2d(u);
    const list = strata.get(k) ?? [];
    list.push(i);
    strata.set(k, list);
  }
  const rng = createRng(job.base + SAMPLE_SEED_OFFSET);
  const out = new Set<number>();
  for (const k of [...strata.keys()].sort()) {
    const ids = [...(strata.get(k) as number[])];
    for (let n = ids.length - 1; n > 0; n--) {
      const m = Math.floor(rng.next() * (n + 1));
      [ids[n], ids[m]] = [ids[m] as number, ids[n] as number];
    }
    for (const i of ids.slice(0, Math.ceil(DAILY_SAMPLE_SHARE_2D * ids.length))) out.add(i);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export type ShardOutput2d = {
  rows: Array<Record<string, CsvValue>>;
  daily: Array<Record<string, CsvValue>>;
  users: number;
  proposals: number;
  ms: number[];
  /** Cost pilot (s6.4): total ms of the common parts and of each arm, users and proposals, per step type. */
  cost: Record<string, number>;
  /** s5.4: users whose J* arm differs from arm C before its first plan (job index: first differing item). */
  contMismatches: string[];
  contChecked: number;
};
export const emptyShard2d = (): ShardOutput2d => ({ rows: [], daily: [], users: 0, proposals: 0, ms: [], cost: {}, contMismatches: [], contChecked: 0 });

/** One user, arms C and J* (bifurcation at the proposal): one raw row per arm, the continuous control, the daily rows. */
export function runUser2d(job: Job2d, i: number, sample: ReadonlySet<number>, out: ShardOutput2d): void {
  const u = job.user(i);
  if (!u) return;
  const spec = specFor2d(u);
  const t0 = performance.now();
  const res = simulateUser(spec, ARMS_2D);
  out.ms.push(performance.now() - t0);
  out.users++;
  if (res.proposalDay !== null) out.proposals++;
  const type = String(u.tags.step_type ?? job.name);
  const add = (k: string, v: number) => {
    out.cost[k] = (out.cost[k] ?? 0) + v;
  };
  add(`${type}:common`, res.ms?.common ?? 0);
  add(`${type}:users`, 1);
  if (res.proposalDay !== null) add(`${type}:proposals`, 1);
  res.arms.forEach((a, k) => add(`${type}:${a.arm.key}`, res.ms?.arms[k] ?? 0));
  const c = res.arms.find((a) => a.arm.key === 'C')?.state as SimState;
  const js = res.arms.find((a) => a.arm.key === 'JS')?.state as SimState;
  const mismatch = res.proposalDay === null ? null : continuityMismatch(c, js);
  if (res.proposalDay !== null) out.contChecked++;
  if (mismatch !== null) out.contMismatches.push(`${i}:${mismatch}`);
  const common = { job: job.name, job_index: i, ...u.tags, ...specColumns(spec, res.world), common_until: res.commonUntil };
  for (const { arm, state } of res.arms) {
    out.rows.push({
      ...common,
      arm: arm.key,
      arm_kind: arm.kind,
      ...stateColumns(state),
      ...armMetrics(res.world, arm, state),
      ...columns2b(res.world, spec.slot.goal, state),
      ...columns2c(res.world, spec.slot.goal, state),
      ...columns2r(res.world, arm, state),
      ...columns2d(res.world, arm, state, mismatch),
    });
  }
  const sampled = sample.has(i);
  const bounded = js.jsBuilds.some((b) => b.bound !== null);
  if (!sampled && !bounded) return;
  for (const { arm, state } of res.arms) {
    for (let d = 0; d <= SIM_DAYS; d++) {
      const events = state.guards.filter((g) => g.day === d).map((g) => `${g.rule}:${g.status}:${g.path ?? 'current'}`);
      const last = d < SIM_DAYS;
      out.daily.push({
        job: job.name,
        job_index: i,
        ...u.tags,
        arm: arm.key,
        sampled,
        h_bound_user: bounded,
        stratum: stratumOf2d(u),
        day: d,
        mode: last ? (state.modeDay[d] as string) : null,
        true_w: r3(state.trueW[d] as number),
        true_tissue: r3(state.trueTissue[d] as number),
        real: last ? r1(state.realKcal[d] as number) : null,
        logged: last ? r1(state.loggedKcal[d] as number) : null,
        target: last ? r1(state.planTarget[d] as number) : null,
        istar: last && Number.isFinite(state.iStarDay[d] as number) ? r1(state.iStarDay[d] as number) : null,
        h: last && Number.isFinite(state.hDay[d] as number) ? r4(state.hDay[d] as number) : null,
        rate: last ? (state.planRate[d] as number) : null,
        app_w: last ? r3(state.appW[d] as number) : null,
        plan_goal: last ? (state.planGoal[d] as string) : null,
        plan_floor: last ? r1(state.planFloor[d] as number) : null,
        real_floor: last ? r1(state.floorReal[d] as number) : null,
        targeting: last ? (state.targetingDay[d] as boolean) : null,
        deviation: last ? (state.deviationDay[d] as boolean) : null,
        g_event: events.join('|'),
      });
    }
  }
}

export function writeShard2d(job: Job2d, shard: number, out: ShardOutput2d, wallMs: number, dir = `${IT2D_DIR}/${job.dir}`): void {
  mkdirSync(dir, { recursive: true });
  const cols = (rows: ReadonlyArray<Record<string, CsvValue>>) => [...new Set(rows.flatMap((r) => Object.keys(r)))];
  writeCsvGz(`${dir}/${job.name}-shard${shard}.csv.gz`, cols(out.rows), out.rows);
  if (out.daily.length > 0) writeCsvGz(`${dir}/${job.name}-daily-shard${shard}.csv.gz`, cols(out.daily), out.daily);
  const sorted = [...out.ms].sort((a, b) => a - b);
  writeFileSync(
    `${dir}/${job.name}-timing-shard${shard}.json`,
    `${JSON.stringify({ job: job.name, shard, users: out.users, proposals: out.proposals, wallMs, userMsTotal: sorted.reduce((a, b) => a + b, 0), userMsP50: sorted[Math.floor(sorted.length / 2)] ?? null, userMsMax: sorted[sorted.length - 1] ?? null, cost: out.cost, contChecked: out.contChecked, contMismatches: out.contMismatches }, null, 2)}\n`,
  );
}
