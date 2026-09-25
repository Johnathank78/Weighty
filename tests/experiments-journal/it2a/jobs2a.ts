/**
 * Iteration 2a (prompt 37): solver fix, closed-loop jobs. Measurement only.
 *
 * Current method only (arm A, no journal). The solver arm is a property of the simulated user (`UserSpec.solver`): every
 * plan of the user, onboarding included, uses it. The arms of one user share the same master seed, hence the same world
 * and every random draw (paired arms). Raw rows: tests/experiments-journal/results/solver/<job>-shard<k>.csv.gz.
 *
 * Declared seeds (new bases, disjoint from every previous seed: iteration 2 uses [1.0e9, 2.03e9], phases 1 and 1b < 6e6):
 * - ideal2a      2 100 000 000 (5.1, 500 users)
 * - followers2a  2 200 000 000 (5.2, 2 000 followers)
 * - steady2a     2 300 000 000 (5.2, 500 regular non-followers)
 * - firstplan2a  2 400 000 000 (5.3, 1 000 hypercube profiles)
 * - timing2a     2 500 000 000 (5.5, 50 profiles)
 * - pilot2a      2 600 000 000 (debugging of the harness only, no result used)
 * User master seed = base + index; derived streams = master + k x 1 000 003 (k <= 20); LHS seed = base + 999 983.
 * The training and validation seeds of iteration 2 are not used.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import type { SolverRequest } from '@/domain/engine';
import { POPULATIONS, SIM_DAYS, armMetrics, closedLoopSlots, lhsSeed, makeSpec, simulateUser } from '../../helpers/closedLoop';
import type { ArmConfig, Behavior, Population, ProfileSlot, SimState, UserSpec } from '../../helpers/closedLoop';
import { writeCsvGz } from '../../helpers/journalExport';
import type { CsvValue } from '../../helpers/journalExport';
import { RESULTS, specColumns, stateColumns } from '../it2/jobs';

export const SOLVER_DIR = 'solver';
export const SEED_BASES_2A = {
  ideal2a: 2_100_000_000,
  followers2a: 2_200_000_000,
  steady2a: 2_300_000_000,
  firstplan2a: 2_400_000_000,
  timing2a: 2_500_000_000,
  pilot2a: 2_600_000_000,
} as const;

/** Solver arms (prompt 37 s5.1). S0: production (control); CS: currentState only; ST: sustainedTissue only; FX: both (retained fix). */
export const SOLVER_ARMS: Record<'S0' | 'CS' | 'ST' | 'FX', SolverRequest | undefined> = {
  S0: undefined,
  CS: { solverStart: 'currentState' },
  ST: { rateDefinition: 'sustainedTissue' },
  FX: { solverStart: 'currentState', rateDefinition: 'sustainedTissue' },
};
export type SolverArmKey = keyof typeof SOLVER_ARMS;

/** Shift of the regular non-followers (s4): -270 kcal/day for even indexes, +270 for odd ones. */
export const steadyShift = (i: number) => (i % 2 === 0 ? -270 : 270);

export type Job2a = { name: string; count: number; arms: SolverArmKey[]; user: (i: number) => { slot: ProfileSlot; base: number; index: number; behavior: Behavior; ideal: boolean; tags: Record<string, CsvValue> } | null };

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

export function jobFor2a(name: string): Job2a {
  switch (name) {
    // 5.1: ideal world of control 6.1 (nominal Hall, noiseless weigh-ins, u = 0, perfect followers), 2 x 2 decomposition.
    case 'ideal2a': {
      const base = SEED_BASES_2A.ideal2a;
      return { name, count: 500, arms: ['S0', 'CS', 'ST', 'FX'], user: (i) => ({ slot: slots(500, base)[i] as ProfileSlot, base, index: i, behavior: 'follower', ideal: true, tags: { population: 'ideal', world: 'ideal' } }) };
    }
    // 5.2: realistic world of iteration 2; 2 000 followers then 500 regular non-followers (s = -270 / +270).
    case 'real2a': {
      return {
        name,
        count: 2500,
        arms: ['S0', 'FX'],
        user: (i) => {
          if (i < 2000) {
            const base = SEED_BASES_2A.followers2a;
            return { slot: slots(2000, base)[i] as ProfileSlot, base, index: i, behavior: 'follower', ideal: false, tags: { population: 'P10', world: 'realistic' } };
          }
          const base = SEED_BASES_2A.steady2a;
          const j = i - 2000;
          const slot = slots(500, base)[j] as ProfileSlot;
          return { slot: { ...slot, shiftKcal: steadyShift(j) }, base, index: j, behavior: 'steady', ideal: false, tags: { population: 'P10', world: 'realistic' } };
        },
      };
    }
    // Debugging only (pilot seeds): ideal world, then realistic followers and regular non-followers, every arm.
    case 'pilot2a': {
      const base = SEED_BASES_2A.pilot2a;
      return {
        name,
        count: 12,
        arms: ['S0', 'CS', 'ST', 'FX'],
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

export function specFor(job: Job2a, i: number, arm: SolverArmKey): UserSpec | null {
  const u = job.user(i);
  if (!u) return null;
  const solver = SOLVER_ARMS[arm];
  return makeSpec(u.slot, u.base, u.index, { pass: job.name, behavior: u.behavior, population: POPULATIONS.P10 as Population, ...(u.ideal ? { ideal: true } : {}), ...(solver ? { solver } : {}) });
}

const A: ArmConfig = { key: 'A', kind: 'A' };
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Recalibration plans of iteration 2a: day, target, rate, maintenance, trend weight, true weight, modeled weight. */
function solverPlanColumns(st: SimState): Record<string, CsvValue> {
  const recals = st.plans.filter((p) => p.kind === 'recal_current');
  const gaps = recals.filter((p) => p.modeledWeightKg !== undefined && p.modeledWeightKg !== null && p.trendWeightKg !== undefined).map((p) => (p.modeledWeightKg as number) - (p.trendWeightKg as number));
  const trueGaps = recals.filter((p) => p.modeledWeightKg !== undefined && p.modeledWeightKg !== null && p.trueWeightKg !== undefined).map((p) => (p.modeledWeightKg as number) - (p.trueWeightKg as number));
  return {
    first_plan_target: st.plans[0]?.calorieTarget ?? null,
    first_plan_rate: st.plans[0]?.weeklyRateTarget ?? null,
    recal_modeled: recals.map((p) => [p.day, p.trendWeightKg === undefined ? '' : r3(p.trendWeightKg), p.trueWeightKg === undefined ? '' : r3(p.trueWeightKg), p.modeledWeightKg === undefined || p.modeledWeightKg === null ? '' : r3(p.modeledWeightKg)].join(':')).join('|'),
    ref_gap_mean: gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
    ref_gap_max_abs: gaps.length > 0 ? Math.max(...gaps.map(Math.abs)) : null,
    ref_true_gap_mean: trueGaps.length > 0 ? trueGaps.reduce((a, b) => a + b, 0) / trueGaps.length : null,
    n_modeled_null: recals.filter((p) => p.modeledWeightKg === null).length,
  };
}

export type ShardOutput2a = { rows: Array<Record<string, CsvValue>>; daily: Array<Record<string, CsvValue>>; users: number; ms: number[] };

export function runUser2a(job: Job2a, i: number, out: ShardOutput2a): void {
  const u = job.user(i);
  if (!u) return;
  out.users++;
  for (const arm of job.arms) {
    const spec = specFor(job, i, arm) as UserSpec;
    const t0 = performance.now();
    const res = simulateUser(spec, [A]);
    out.ms.push(performance.now() - t0);
    const state = (res.arms[0] as { state: SimState }).state;
    out.rows.push({ job: job.name, job_index: i, solver_arm: arm, ...u.tags, ...specColumns(spec, res.world), common_until: res.commonUntil, ...stateColumns(state), ...solverPlanColumns(state), ...armMetrics(res.world, A, state) });
    if (i % 25 < 1 || i < 10) {
      for (let d = 0; d < SIM_DAYS; d++) {
        out.daily.push({ job: job.name, job_index: i, solver_arm: arm, behavior: spec.behavior, day: d, true_w: Math.round((state.trueW[d] as number) * 1000) / 1000, real: Math.round((state.realKcal[d] as number) * 10) / 10, target: Math.round((state.planTarget[d] as number) * 10) / 10, rate: state.planRate[d] as number });
      }
    }
  }
}

export function writeShard2a(job: Job2a, shard: number, out: ShardOutput2a, wallMs: number): void {
  const dir = `${RESULTS}/${SOLVER_DIR}`;
  mkdirSync(dir, { recursive: true });
  const cols = (rows: ReadonlyArray<Record<string, CsvValue>>) => [...new Set(rows.flatMap((r) => Object.keys(r)))];
  writeCsvGz(`${dir}/${job.name}-shard${shard}.csv.gz`, cols(out.rows), out.rows);
  if (out.daily.length > 0) writeCsvGz(`${dir}/${job.name}-daily-shard${shard}.csv.gz`, cols(out.daily), out.daily);
  const sorted = [...out.ms].sort((a, b) => a - b);
  writeFileSync(`${dir}/${job.name}-timing-shard${shard}.json`, `${JSON.stringify({ job: job.name, shard, users: out.users, runs: out.ms.length, wallMs, runMsTotal: sorted.reduce((a, b) => a + b, 0), runMsP50: sorted[Math.floor(sorted.length / 2)] ?? null, runMsMax: sorted[sorted.length - 1] ?? null }, null, 2)}\n`);
}
