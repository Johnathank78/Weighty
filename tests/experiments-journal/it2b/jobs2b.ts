/**
 * Iteration 2b (prompt 38): periodic replan and solver horizon, closed-loop jobs. Measurement only.
 *
 * Current method only (arm A, no journal). The solver arm is a property of the simulated user (`UserSpec.solver`,
 * `UserSpec.replanEveryDays`): every plan of the user, onboarding included, uses it. The arms of one user share the same
 * master seed, hence the same world and every random draw (paired arms). Raw rows:
 * tests/experiments-journal/results/solver2b/<job>-shard<k>.csv.gz.
 *
 * Declared seeds (new bases, disjoint from every previous seed: phases 1 and 1b < 6e6, iteration 2 in [1.0e9, 2.03e9],
 * iteration 2a in [2.1e9, 2.63e9]; each base below + index (< 100 000) + derived streams (<= 20 x 1 000 003) + LHS
 * (999 983) stays below the next base; the RNG takes seeds modulo 2^32 = 4.29e9, all bases are below):
 * - select2b     2 700 000 000 (5.1 selection, 500 ideal users)
 * - valid2b      2 800 000 000 (5.2 validation, 500 ideal users)
 * - followers2b  2 900 000 000 (5.3, 2 000 followers)
 * - steady2b     3 000 000 000 (5.3, 500 regular non-followers)
 * - firstplan2b  3 100 000 000 (5.5, 1 000 hypercube profiles, only if K2 is retained)
 * - timing2b     3 200 000 000 (5.6, 50 profiles)
 * - equiv2b      3 300 000 000 (3.3 equivalence test, 50 users)
 * - pilot2b      3 400 000 000 (debugging of the harness only, no result used)
 * - select2bx2   3 500 000 000 (5.1 doubled pass, 1 000 ideal users, S0 and K2: common rule INCONCLUSIF of THRESHOLDS.md
 *                and A1.3, declared after the first selection pass, before this pass ran)
 * User master seed = base + index; derived streams = master + k x 1 000 003 (k <= 20); LHS seed = base + 999 983.
 * The training and validation seeds of iteration 2 are not used.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import type { SolverRequest } from '@/domain/engine';
import { BLOCKS, POPULATIONS, SIM_DAYS, armMetrics, closedLoopSlots, lhsSeed, makeSpec, olsSlope, simulateUser, tissueBlockRatio } from '../../helpers/closedLoop';
import type { ArmConfig, Behavior, Population, ProfileSlot, SimState, UserSpec } from '../../helpers/closedLoop';
import { writeCsvGz } from '../../helpers/journalExport';
import type { CsvValue } from '../../helpers/journalExport';
import { guardrailMaxWeeklyRate, sliderBounds, solveSliderPoint } from '@/science/goals';
import type { PlanContext } from '@/science/goals';
import type { Goal } from '@/science/types';
import { GAIN_RATE_HARD_MAX } from '@/science/constants';
import { RESULTS, specColumns, stateColumns } from '../it2/jobs';

export const SOLVER2B_DIR = 'solver2b';
export const SEED_BASES_2B = {
  select2b: 2_700_000_000,
  valid2b: 2_800_000_000,
  followers2b: 2_900_000_000,
  steady2b: 3_000_000_000,
  firstplan2b: 3_100_000_000,
  timing2b: 3_200_000_000,
  equiv2b: 3_300_000_000,
  pilot2b: 3_400_000_000,
  select2bx2: 3_500_000_000,
} as const;

/** Periodic replan cadence and the two horizons measured (prompt 38: the only values measured). */
export const REPLAN_EVERY_DAYS = 28;
const FIX: SolverRequest = { solverStart: 'currentState', rateDefinition: 'sustainedTissue' };

/**
 * Solver arms (prompt 38 s5.1). S0: production (control); FX: fix of 2a, no periodic replan, horizon 42; K1: FX + replan
 * every 28 days, horizon 42; K2: FX + replan every 28 days, horizon 28.
 */
export const ARMS_2B: Record<'S0' | 'FX' | 'K1' | 'K2', { solver?: SolverRequest; replanEveryDays?: number }> = {
  S0: {},
  FX: { solver: FIX },
  K1: { solver: FIX, replanEveryDays: REPLAN_EVERY_DAYS },
  K2: { solver: { ...FIX, solverHorizonDays: 28 }, replanEveryDays: REPLAN_EVERY_DAYS },
};
export type Arm2bKey = keyof typeof ARMS_2B;

/** Candidate retained by the selection rule A4.2, passed to the validation and realistic jobs (IT2B_CANDIDATE). */
export function retainedCandidate(): 'K1' | 'K2' {
  const c = process.env.IT2B_CANDIDATE;
  if (c !== 'K1' && c !== 'K2') throw new Error('IT2B_CANDIDATE must be K1 or K2 (selection rule A4.2)');
  return c;
}

/** Shift of the regular non-followers: -270 kcal/day for even indexes, +270 for odd ones (as in 2a). */
export const steadyShift = (i: number) => (i % 2 === 0 ? -270 : 270);

export type Job2b = { name: string; count: number; arms: Arm2bKey[]; user: (i: number) => { slot: ProfileSlot; base: number; index: number; behavior: Behavior; ideal: boolean; tags: Record<string, CsvValue> } | null };

const slotCache = new Map<string, ProfileSlot[]>();
function slots(n: number, base: number): ProfileSlot[] {
  const key = `${n}:${base}`;
  let s = slotCache.get(key);
  if (!s) {
    s = closedLoopSlots(n, lhsSeed(base));
    slotCache.set(key, s);
  }
  return s;
}

function idealJob(name: string, base: number, arms: Arm2bKey[], count = 500): Job2b {
  return { name, count, arms, user: (i) => ({ slot: slots(count, base)[i] as ProfileSlot, base, index: i, behavior: 'follower', ideal: true, tags: { population: 'ideal', world: 'ideal' } }) };
}

export function jobFor2b(name: string): Job2b {
  switch (name) {
    // 5.1 selection: ideal world of control 6.1 (nominal Hall, noiseless weigh-ins, u = 0, perfect followers), 4 arms.
    case 'select2b':
      return idealJob(name, SEED_BASES_2B.select2b, ['S0', 'FX', 'K1', 'K2']);
    // 5.1 doubled pass (THRESHOLDS.md common rules: an inconclusive criterion is never GO, n is doubled once with new
    // seeds, A1.3, and the verdict rests on the new pass alone): K2, inconclusive on one criterion of the first pass; S0 as
    // control. K1 failed outright (CI entirely outside the band) and is not rerun.
    case 'select2bx2':
      return idealJob(name, SEED_BASES_2B.select2bx2, ['S0', 'K2'], 1000);
    // 5.2 validation: same world, new seeds, control and retained candidate.
    case 'valid2b':
      return idealJob(name, SEED_BASES_2B.valid2b, ['S0', retainedCandidate()]);
    // 5.3 realistic world of iteration 2: 2 000 followers then 500 regular non-followers (s = -270 / +270).
    case 'real2b':
      return {
        name,
        count: 2500,
        arms: ['S0', retainedCandidate()],
        user: (i) => {
          if (i < 2000) {
            const base = SEED_BASES_2B.followers2b;
            return { slot: slots(2000, base)[i] as ProfileSlot, base, index: i, behavior: 'follower', ideal: false, tags: { population: 'P10', world: 'realistic' } };
          }
          const base = SEED_BASES_2B.steady2b;
          const j = i - 2000;
          const slot = slots(500, base)[j] as ProfileSlot;
          return { slot: { ...slot, shiftKcal: steadyShift(j) }, base, index: j, behavior: 'steady', ideal: false, tags: { population: 'P10', world: 'realistic' } };
        },
      };
    // Debugging only (pilot seeds): ideal world, realistic followers and regular non-followers, every arm.
    case 'pilot2b': {
      const base = SEED_BASES_2B.pilot2b;
      return {
        name,
        count: 12,
        arms: ['S0', 'FX', 'K1', 'K2'],
        user: (i) => {
          const slot = slots(12, base)[i] as ProfileSlot;
          if (i < 4) return { slot, base, index: i, behavior: 'follower', ideal: true, tags: { population: 'pilot', world: 'ideal' } };
          if (i < 8) return { slot, base, index: i, behavior: 'follower', ideal: false, tags: { population: 'pilot', world: 'realistic' } };
          return { slot: { ...slot, shiftKcal: steadyShift(i) }, base, index: i, behavior: 'steady', ideal: false, tags: { population: 'pilot', world: 'realistic' } };
        },
      };
    }
    default:
      throw new Error(`unknown job ${name}`);
  }
}

export function specFor2b(job: Job2b, i: number, arm: Arm2bKey): UserSpec | null {
  const u = job.user(i);
  if (!u) return null;
  const a = ARMS_2B[arm];
  return makeSpec(u.slot, u.base, u.index, {
    pass: job.name,
    behavior: u.behavior,
    population: POPULATIONS.P10 as Population,
    ...(u.ideal ? { ideal: true } : {}),
    ...(a.solver ? { solver: a.solver } : {}),
    ...(a.replanEveryDays !== undefined ? { replanEveryDays: a.replanEveryDays } : {}),
  });
}

const A: ArmConfig = { key: 'A', kind: 'A' };
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Days on which a plan started (onboarding, recalibrations, periodic replans). */
export function planStarts(st: SimState): number[] {
  return [...new Set(st.plans.map((p) => p.day))].sort((a, b) => a - b);
}

/**
 * Iteration 2b columns (prompt 38 s4, s5.4, s7): per block, the tissue ratio (verdict, A4.1), the true tissue mass and
 * true weight at the start and end of the block, the mean age of the active plan and the plans started; S3 on the tissue
 * mass; the periodic replans.
 */
export function columns2b(world: { heightM: number }, goal: string, st: SimState): Record<string, CsvValue> {
  const out: Record<string, CsvValue> = {};
  const starts = planStarts(st);
  BLOCKS.forEach(([a, b], i) => {
    const k = i + 1;
    out[`tratio_b${k}`] = tissueBlockRatio(st, goal as 'loss' | 'gain' | 'maintenance', a, b, st.planRate);
    out[`tissue_start_b${k}`] = st.trueTissue[a] as number;
    out[`tissue_end_b${k}`] = st.trueTissue[b] as number;
    out[`w_start_b${k}`] = st.trueW[a] as number;
    out[`w_end_b${k}`] = st.trueW[b] as number;
    let age = 0;
    for (let d = a; d < b; d++) age += d - (starts.filter((x) => x <= d).pop() as number);
    out[`age_b${k}`] = age / (b - a);
    out[`started_b${k}`] = starts.filter((x) => x >= a && x < b).length;
  });
  // S3 on the tissue mass (A4.1): weekly OLS slope of the true tissue mass over 8 days / true weight at the week start.
  let weeks = 0;
  let above = 0;
  for (let k = 0; k < SIM_DAYS / 7; k++) {
    const a = 7 * k;
    const w0 = st.trueW[a] as number;
    const rate = (olsSlope(st.trueTissue.slice(a, a + 8)) * 7) / w0;
    const bmi = w0 / world.heightM ** 2;
    const lossCap = guardrailMaxWeeklyRate('loss', bmi) ?? 0;
    weeks++;
    if (rate < 0 ? -rate > lossCap : rate > GAIN_RATE_HARD_MAX) above++;
  }
  out.s3t_weeks = weeks;
  out.s3t_above = above;
  out.tissue_end = st.trueTissue[SIM_DAYS] as number;
  const done = st.replans.filter((r) => r.status === 'replanned');
  out.n_replan = done.length;
  out.n_replan_no_snapshot = st.replans.filter((r) => r.status === 'no_snapshot').length;
  out.n_replan_failed = st.replans.filter((r) => r.status === 'failed').length;
  out.replans = st.replans.map((r) => [r.day, r.status, r.ageDays, r1(r.targetBefore), r.targetAfter === null ? '' : r1(r.targetAfter), r.reason ?? ''].join(':')).join('|');
  out.first_plan_target = st.plans[0]?.calorieTarget ?? null;
  out.first_plan_rate = st.plans[0]?.weeklyRateTarget ?? null;
  out.recal_true_w = st.plans.filter((p) => p.trueWeightKg !== undefined).map((p) => `${p.day}:${r3(p.trueWeightKg as number)}`).join('|');
  return out;
}

export type ShardOutput2b = { rows: Array<Record<string, CsvValue>>; daily: Array<Record<string, CsvValue>>; users: number; ms: number[] };

export function runUser2b(job: Job2b, i: number, out: ShardOutput2b): void {
  const u = job.user(i);
  if (!u) return;
  out.users++;
  for (const arm of job.arms) {
    const spec = specFor2b(job, i, arm) as UserSpec;
    const t0 = performance.now();
    const res = simulateUser(spec, [A]);
    out.ms.push(performance.now() - t0);
    const state = (res.arms[0] as { state: SimState }).state;
    out.rows.push({ job: job.name, job_index: i, solver_arm: arm, ...u.tags, ...specColumns(spec, res.world), common_until: res.commonUntil, ...stateColumns(state), ...armMetrics(res.world, A, state), ...columns2b(res.world, spec.slot.goal, state) });
    if (i % 25 < 1 || i < 10) {
      for (let d = 0; d <= SIM_DAYS; d++) {
        out.daily.push({
          job: job.name,
          job_index: i,
          solver_arm: arm,
          behavior: spec.behavior,
          day: d,
          true_w: r3(state.trueW[d] as number),
          true_tissue: r3(state.trueTissue[d] as number),
          real: d < SIM_DAYS ? r1(state.realKcal[d] as number) : null,
          target: d < SIM_DAYS ? r1(state.planTarget[d] as number) : null,
          rate: d < SIM_DAYS ? (state.planRate[d] as number) : null,
        });
      }
    }
  }
}

export function writeShard2b(job: Job2b, shard: number, out: ShardOutput2b, wallMs: number): void {
  const dir = `${RESULTS}/${SOLVER2B_DIR}`;
  mkdirSync(dir, { recursive: true });
  const cols = (rows: ReadonlyArray<Record<string, CsvValue>>) => [...new Set(rows.flatMap((r) => Object.keys(r)))];
  writeCsvGz(`${dir}/${job.name}-shard${shard}.csv.gz`, cols(out.rows), out.rows);
  if (out.daily.length > 0) writeCsvGz(`${dir}/${job.name}-daily-shard${shard}.csv.gz`, cols(out.daily), out.daily);
  const sorted = [...out.ms].sort((a, b) => a - b);
  writeFileSync(`${dir}/${job.name}-timing-shard${shard}.json`, `${JSON.stringify({ job: job.name, shard, users: out.users, runs: out.ms.length, wallMs, runMsTotal: sorted.reduce((a, b) => a + b, 0), runMsP50: sorted[Math.floor(sorted.length / 2)] ?? null, runMsMax: sorted[sorted.length - 1] ?? null }, null, 2)}\n`);
}

/** Monotone calories in steps, horizon value of each slider point on the baseline's, over the whole slider range. */
export function sliderInvariants(ctx: PlanContext, goal: Goal, calorieTargetKcal: number, steps: number): { points: number; monotone: boolean; maxGap: number; notConverged: number } {
  const baseline = { goal, scenario: { calorieTargetKcal, stepsPerDay: steps } };
  const bounds = sliderBounds(steps);
  let previous = Number.NEGATIVE_INFINITY;
  let monotone = true;
  let maxGap = 0;
  let points = 0;
  let notConverged = 0;
  for (let s = bounds.minSteps; s <= bounds.maxSteps; s += 500) {
    const pt = solveSliderPoint(ctx, baseline, s);
    points++;
    if (!pt.converged) notConverged++;
    if (pt.calorieTargetKcal < previous - 1e-9) monotone = false;
    previous = pt.calorieTargetKcal;
    maxGap = Math.max(maxGap, Math.abs(pt.weightAtHorizonKg - pt.baselineWeightAtHorizonKg));
  }
  return { points, monotone, maxGap, notConverged };
}
