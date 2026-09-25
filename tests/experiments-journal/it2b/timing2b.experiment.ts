/**
 * Iteration 2b (prompt 38 s5.6): time of a full recalculation (calibration + current state + solver), retained candidate
 * against S0, and the slider invariants of the candidate on modeled bodies of simulated users.
 * Run alone (one process, no parallel load): IT2B_CANDIDATE=K1|K2 npx vitest run -c vitest.journal.config.ts it2b/timing2b
 *
 * 50 profiles (seed base timing2b = 3.2e9), realistic followers weighed every day: each arm simulated for 84 days under its
 * own solver (periodic replans included for the candidate), then on day 83 (84 daily weigh-ins, days 0 to 83):
 * - 'recalcul complet': computeCalibrationState + applyRecalibration with the arm's solver options;
 * - 'recalcul périodique' (candidate only): the rebuild of the periodic replan from the applied snapshot, i.e.
 *   buildPlanFromStore with that snapshot and the solver options (current state + solver, without the calibration).
 * Each timed 3 times after one warm-up; the median of the 3 is the profile's time.
 * Raw files: results/solver2b/timing2b<candidate>-shard0.csv.gz, invariants2b<candidate>-shard99.csv.gz.
 */
import { it } from 'vitest';
import { applyRecalibration, buildPlanFromStore, computeCalibrationState, latestAppliedSnapshot } from '@/domain/engine';
import type { SolverRequest } from '@/domain/engine';
import { addDays } from '@/science/dates';
import { solverHorizonDaysOf } from '@/science/goals';
import { POPULATIONS, SIM_START, closedLoopSlots, lhsSeed, makeSpec, simulateArmDays } from '../../helpers/closedLoop';
import type { ArmConfig, Population } from '../../helpers/closedLoop';
import { writeCsvGz } from '../../helpers/journalExport';
import type { CsvValue } from '../../helpers/journalExport';
import { RESULTS } from '../it2/jobs';
import { ARMS_2B, SEED_BASES_2B, SOLVER2B_DIR, retainedCandidate, sliderInvariants } from './jobs2b';

const DIR = `${RESULTS}/${SOLVER2B_DIR}`;
const DAYS = 84;
const A: ArmConfig = { key: 'A', kind: 'A' };
const iso = (date: string) => `${date}T08:00:00.000Z`;

function timed<T>(f: () => T): { ms: number; value: T } {
  f();
  const runs = [0, 1, 2].map(() => {
    const t0 = performance.now();
    const value = f();
    return { ms: performance.now() - t0, value };
  });
  const sorted = [...runs].sort((a, b) => a.ms - b.ms);
  return { ms: (sorted[1] as { ms: number }).ms, value: (runs[2] as { value: T }).value };
}

it('iteration 2b timing and invariants on modeled bodies', () => {
  const candidate = retainedCandidate();
  const base = SEED_BASES_2B.timing2b;
  const slots = closedLoopSlots(50, lhsSeed(base)).map((s) => ({ ...s, weighProbability: 1 }));
  const rows: Array<Record<string, CsvValue>> = [];
  const inv: Array<Record<string, CsvValue>> = [];
  slots.forEach((slot, i) => {
    for (const arm of ['S0', candidate] as const) {
      const a = ARMS_2B[arm];
      const spec = makeSpec(slot, base, i, { pass: 'timing2b', behavior: 'follower', population: POPULATIONS.P10 as Population, ...(a.solver ? { solver: a.solver } : {}), ...(a.replanEveryDays !== undefined ? { replanEveryDays: a.replanEveryDays } : {}) });
      const { state } = simulateArmDays(spec, A, DAYS);
      const store = state.store;
      const today = addDays(SIM_START, DAYS - 1);
      const full = timed(() => {
        const cal = computeCalibrationState(store, today, iso(today));
        const applied = cal ? applyRecalibration(store, cal, today, iso(today), a.solver) : null;
        return { cal, applied };
      });
      rows.push({ run: candidate, profile_index: i, goal: slot.goal, sex: slot.sex, bmi_class: slot.bmiClass, solver_arm: arm, operation: 'recalcul complet', weigh_ins: store.weights.length, ms: full.ms, gate_met: full.value.cal?.gate.met ?? false, applied: full.value.applied?.ok ?? false });
      if (arm === 'S0') continue;
      const snapshot = latestAppliedSnapshot(store);
      if (snapshot) {
        const replan = timed(() => buildPlanFromStore(store, today, { source: 'recalibrated', snapshot, ...(store.plan ? { stepTarget: store.plan.stepTarget } : {}), solver: a.solver as SolverRequest }));
        rows.push({ run: candidate, profile_index: i, goal: slot.goal, sex: slot.sex, bmi_class: slot.bmiClass, solver_arm: arm, operation: 'recalcul périodique', weigh_ins: store.weights.length, ms: replan.ms, gate_met: null, applied: replan.value.ok });
      }
      // Slider invariants of the candidate on the modeled body of day 83 (plan rebuilt from the day-83 snapshot).
      const cal = full.value.cal;
      if (cal?.candidate && full.value.applied?.ok) {
        const r = buildPlanFromStore(full.value.applied.store, today, { source: 'recalibrated', snapshot: cal.candidate, solver: a.solver as SolverRequest });
        if (r.ok && 'goalPlan' in r && r.context.solver?.modeledBody && r.goalPlan.calorieTargetKcal !== null && r.goalPlan.solve) {
          const res = sliderInvariants(r.context, r.plan.goal, r.goalPlan.calorieTargetKcal, r.plan.maintenanceStepsPerDay ?? r.plan.stepTarget);
          inv.push({ source: 'utilisateurs simulés, jour 83, état actuel', candidate, horizon: solverHorizonDaysOf(r.context), profile_index: i, goal: slot.goal, points: res.points, monotone: res.monotone, max_abs_tissue_gap: res.maxGap, plan_tissue_gap: Math.abs(r.goalPlan.solve.weightAtHorizonKg - r.goalPlan.solve.targetWeightAtHorizonKg), not_converged: res.notConverged });
        }
      }
    }
  });
  const cols = (rs: ReadonlyArray<Record<string, CsvValue>>) => [...new Set(rs.flatMap((r) => Object.keys(r)))];
  writeCsvGz(`${DIR}/timing2b${candidate}-shard0.csv.gz`, cols(rows), rows);
  writeCsvGz(`${DIR}/invariants2b${candidate}-shard99.csv.gz`, cols(inv), inv);
});
