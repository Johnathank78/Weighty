/**
 * Iteration 2a (prompt 37 s5.5 and s5.4): time of a full recalculation (calibration + current state + solver), with and
 * without the fix, and the slider invariants of the fix on modeled bodies of simulated users.
 * Run alone (one process, no parallel load): npx vitest run -c vitest.journal.config.ts it2a/timing2a
 *
 * 50 profiles (seed base timing2a = 2.5e9), realistic followers weighed every day: each arm simulated for 84 days under its
 * own solver, then on day 83 (84 daily weigh-ins, days 0 to 83) computeCalibrationState + applyRecalibration, timed 3
 * times after one warm-up; the median of the 3 is the profile's time. Raw file: results/solver/timing2a-shard0.csv.gz.
 */
import { it } from 'vitest';
import { applyRecalibration, buildPlanFromStore, computeCalibrationState } from '@/domain/engine';
import type { SolverRequest } from '@/domain/engine';
import { addDays } from '@/science/dates';
import { sliderBounds, solveSliderPoint } from '@/science/goals';
import { POPULATIONS, SIM_START, closedLoopSlots, lhsSeed, makeSpec, simulateArmDays } from '../../helpers/closedLoop';
import type { ArmConfig, Population } from '../../helpers/closedLoop';
import { writeCsvGz } from '../../helpers/journalExport';
import type { CsvValue } from '../../helpers/journalExport';
import { RESULTS } from '../it2/jobs';
import { SEED_BASES_2A, SOLVER_ARMS, SOLVER_DIR } from './jobs2a';

const DIR = `${RESULTS}/${SOLVER_DIR}`;
const DAYS = 84;
const A: ArmConfig = { key: 'A', kind: 'A' };
const iso = (date: string) => `${date}T08:00:00.000Z`;

it('iteration 2a timing and invariants on modeled bodies', () => {
  const base = SEED_BASES_2A.timing2a;
  const slots = closedLoopSlots(50, lhsSeed(base)).map((s) => ({ ...s, weighProbability: 1 }));
  const rows: Array<Record<string, CsvValue>> = [];
  const inv: Array<Record<string, CsvValue>> = [];
  slots.forEach((slot, i) => {
    for (const arm of ['S0', 'FX'] as const) {
      const solver = SOLVER_ARMS[arm];
      const spec = makeSpec(slot, base, i, { pass: 'timing2a', behavior: 'follower', population: POPULATIONS.P10 as Population, ...(solver ? { solver } : {}) });
      const { state } = simulateArmDays(spec, A, DAYS);
      const store = state.store;
      const today = addDays(SIM_START, DAYS - 1);
      const run = () => {
        const t0 = performance.now();
        const cal = computeCalibrationState(store, today, iso(today));
        const applied = cal ? applyRecalibration(store, cal, today, iso(today), solver) : null;
        return { ms: performance.now() - t0, cal, applied };
      };
      run();
      const times = [run(), run(), run()];
      const ms = times.map((t) => t.ms).sort((a, b) => a - b)[1] as number;
      const last = times[2] as ReturnType<typeof run>;
      rows.push({ profile_index: i, goal: slot.goal, sex: slot.sex, bmi_class: slot.bmiClass, solver_arm: arm, weigh_ins: store.weights.length, ms, ms_min: Math.min(...times.map((t) => t.ms)), ms_max: Math.max(...times.map((t) => t.ms)), gate_met: last.cal?.gate.met ?? false, applied: last.applied?.ok ?? false });
      // 5.4: slider invariants of the fix on the modeled body of day 83.
      if (arm === 'FX' && last.cal?.candidate && last.applied?.ok) {
        const r = buildPlanFromStore(last.applied.store, today, { source: 'recalibrated', snapshot: last.cal.candidate, solver: SOLVER_ARMS.FX as SolverRequest });
        if (r.ok && 'goalPlan' in r && r.context.solver?.modeledBody) {
          const baseline = { goal: r.plan.goal, scenario: { calorieTargetKcal: r.goalPlan.calorieTargetKcal as number, stepsPerDay: r.plan.maintenanceStepsPerDay ?? r.plan.stepTarget } };
          const bounds = sliderBounds(baseline.scenario.stepsPerDay);
          let previous = Number.NEGATIVE_INFINITY;
          let monotone = true;
          let maxGap = 0;
          let points = 0;
          let notConverged = 0;
          for (let s = bounds.minSteps; s <= bounds.maxSteps; s += 500) {
            const pt = solveSliderPoint(r.context, baseline, s);
            points++;
            if (!pt.converged) notConverged++;
            if (pt.calorieTargetKcal < previous - 1e-9) monotone = false;
            previous = pt.calorieTargetKcal;
            maxGap = Math.max(maxGap, Math.abs(pt.weightAtHorizonKg - pt.baselineWeightAtHorizonKg));
          }
          inv.push({ source: 'utilisateurs simulés, jour 83, état actuel', profile_index: i, goal: slot.goal, points, monotone, max_abs_tissue_gap: maxGap, not_converged: notConverged });
        }
      }
    }
  });
  const cols = (rs: ReadonlyArray<Record<string, CsvValue>>) => [...new Set(rs.flatMap((r) => Object.keys(r)))];
  writeCsvGz(`${DIR}/timing2a-shard0.csv.gz`, cols(rows), rows);
  writeCsvGz(`${DIR}/invariants2a-shard99.csv.gz`, cols(inv), inv);
});
