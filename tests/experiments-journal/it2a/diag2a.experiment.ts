/**
 * Iteration 2a (prompt 37 s6.3): diagnostic of the A3.1 failure, without any correction. Measurement only.
 * Run: IT2A_SHARD=<k> IT2A_SHARDS=<n> npx vitest run -c vitest.journal.config.ts it2a/diag2a
 *
 * Users of job ideal2a in loss and gain, arm FX (and S0 for the plan ages), replayed with the same seeds (deterministic).
 * For each recalibration plan of day D, the plan is rebuilt from the store truncated at D (weigh-ins up to D, logs up to D;
 * the calibration window ends at the last weigh-in, so later logs are never read) and checked against the recorded target.
 * Then, from the solver's own start (modeled body of day D) at the plan's constant intake, over 42 days:
 * - the solver's own weight trajectory (constant intake, 70 days), its OLS slopes over plan days 0-7, 0-28, 7-35, 0-42,
 *   28-42 and 42-70, as ratios of the applied rate x reference weight, and the start state (AT, glycogen, ECF);
 * - the world's true-weight ratio over the plan's first 28 days when the plan lasts at least 28 days;
 * - plan duration (days to the next recalibration or to day 168).
 * Per user and block: mean age of the active plan over the block, and the number of plans started in the block.
 * Raw files: results/solver/diag2a-plans-shard<k>.csv.gz, diag2a-blocks-shard<k>.csv.gz.
 */
import { it } from 'vitest';
import { buildPlanFromStore, computeCalibrationState } from '@/domain/engine';
import type { SolverRequest } from '@/domain/engine';
import type { WheightyStore } from '@/domain/types';
import { addDays } from '@/science/dates';
import { weightAtDay } from '@/science/goals';
import { fatFromLean } from '@/science/hall/model';
import { BLOCKS, SIM_DAYS, SIM_START, blockRatio, olsSlope, simulateUser } from '../../helpers/closedLoop';
import type { ArmConfig, SimState } from '../../helpers/closedLoop';
import { writeCsvGz } from '../../helpers/journalExport';
import type { CsvValue } from '../../helpers/journalExport';
import { RESULTS } from '../it2/jobs';
import { SOLVER_ARMS, SOLVER_DIR, jobFor2a, specFor } from './jobs2a';

const DIR = `${RESULTS}/${SOLVER_DIR}`;
const A: ArmConfig = { key: 'A', kind: 'A' };
const iso = (date: string) => `${date}T08:00:00.000Z`;
const dateOf = (d: number) => addDays(SIM_START, d);

function truncated(store: WheightyStore, d: number): WheightyStore {
  const date = dateOf(d);
  return { ...store, weights: store.weights.filter((w) => w.date <= date), dailyLogs: store.dailyLogs.filter((l) => l.date <= date) };
}

function planStarts(st: SimState): number[] {
  return [0, ...st.recalDays];
}

it('iteration 2a diagnostic shard', () => {
  const shard = Number(process.env.IT2A_SHARD ?? '0');
  const shards = Number(process.env.IT2A_SHARDS ?? '1');
  const job = jobFor2a('ideal2a');
  const plans: Array<Record<string, CsvValue>> = [];
  const blocks: Array<Record<string, CsvValue>> = [];
  for (let i = shard; i < job.count; i += shards) {
    const u = job.user(i);
    if (!u || u.slot.goal === 'maintenance') continue;
    const goal = u.slot.goal;
    const sign = goal === 'loss' ? -1 : 1;
    for (const arm of ['S0', 'FX'] as const) {
      const spec = specFor(job, i, arm);
      if (!spec) continue;
      const res = simulateUser(spec, [A]);
      const st = (res.arms[0] as { state: SimState }).state;
      const starts = planStarts(st);
      // Blocks: mean age of the active plan, plans started in the block.
      BLOCKS.forEach(([a, b], k) => {
        let age = 0;
        for (let d = a; d < b; d++) {
          const s = starts.filter((x) => x <= d).pop() as number;
          age += d - s;
        }
        blocks.push({ job_index: i, goal, solver_arm: arm, block: k + 1, ratio: blockRatio(st, goal, a, b, st.planRate), mean_plan_age: age / (b - a), plans_started: starts.filter((x) => x >= a && x < b).length });
      });
      if (arm !== 'FX') continue;
      const request = SOLVER_ARMS.FX as SolverRequest;
      starts.forEach((D, k) => {
        const duration = (starts[k + 1] ?? SIM_DAYS) - D;
        const rate = st.planRate[D] as number;
        const target = st.planTarget[D] as number;
        const worldRatio = duration >= 28 ? (olsSlope(st.trueW.slice(D, D + 29)) * 7) / (sign * rate * (st.trueW[D] as number)) : null;
        const row: Record<string, CsvValue> = { job_index: i, goal, plan_day: D, kind: D === 0 ? 'onboarding' : 'recal', rate, target, duration, world_ratio_0_28: worldRatio };
        if (D > 0) {
          const store = truncated(st.store, D);
          const cal = computeCalibrationState(store, dateOf(D), iso(dateOf(D)));
          const snapshot = cal?.candidate ?? null;
          const r = snapshot ? buildPlanFromStore(store, dateOf(D), { source: 'recalibrated', snapshot, solver: request }) : null;
          if (r && r.ok && 'goalPlan' in r) {
            const ctx = r.context;
            const scenario = { calorieTargetKcal: r.plan.calorieTarget, stepsPerDay: r.plan.stepTarget };
            const w = Array.from({ length: 71 }, (_, d) => weightAtDay(ctx, goal, scenario, d));
            const body = ctx.solver?.modeledBody;
            const W = r.goalPlan.solve?.origin?.referenceWeightKg ?? Number.NaN;
            const denom = sign * r.goalPlan.weeklyRateTarget * W;
            row.rebuilt_target = r.plan.calorieTarget;
            row.rebuilt_matches = r.plan.calorieTarget === target;
            row.solver_weight_ratio_0_28 = (olsSlope(w.slice(0, 29)) * 7) / denom;
            row.solver_weight_ratio_0_42 = (olsSlope(w.slice(0, 43)) * 7) / denom;
            row.solver_weight_ratio_0_7 = (olsSlope(w.slice(0, 8)) * 7) / denom;
            row.solver_weight_ratio_28_42 = (olsSlope(w.slice(28, 43)) * 7) / denom;
            row.solver_weight_ratio_42_70 = (olsSlope(w.slice(42, 71)) * 7) / denom;
            row.solver_weight_ratio_7_35 = (olsSlope(w.slice(7, 36)) * 7) / denom;
            if (body) {
              row.start_at_kcal = body.state.at;
              row.start_glycogen_kg = body.state.glycogen;
              row.start_glycogen_baseline_kg = body.params.glycogen0Kg;
              row.start_ecf_minus_baseline_kg = body.state.ecf - body.params.ecf0Kg;
              row.solver_start_weight = w[0] as number;
              row.solver_weight_42 = w[42] as number;
              row.target_42 = r.goalPlan.solve?.targetWeightAtHorizonKg ?? null;
              row.solver_value_42 = r.goalPlan.solve?.weightAtHorizonKg ?? null;
              row.start_tissue = r.goalPlan.solve?.origin?.startTissueKg ?? null;
              row.fat_start = fatFromLean(body.params, body.state.lean);
            }
            row.previous_target = st.planTarget[D - 1] as number;
          }
        }
        plans.push(row);
      });
    }
  }
  const cols = (rs: ReadonlyArray<Record<string, CsvValue>>) => [...new Set(rs.flatMap((r) => Object.keys(r)))];
  writeCsvGz(`${DIR}/diag2a-plans-shard${shard}.csv.gz`, cols(plans), plans);
  writeCsvGz(`${DIR}/diag2a-blocks-shard${shard}.csv.gz`, cols(blocks), blocks);
});
