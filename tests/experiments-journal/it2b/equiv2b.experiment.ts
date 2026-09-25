/**
 * Iteration 2b (prompt 38 s3.3): equivalence of the journal-mode modeled body and plan with the current method (same
 * principle as N1). Run: npx vitest run -c vitest.journal.config.ts it2b/equiv2b
 *
 * Fixtures: 50 users of the ideal world (seed base equiv2b = 3.3e9; nominal Hall, noiseless daily weigh-ins, exact logging
 * u = 0 without noise, perfect followers declaring 'on_plan'), arm FX, simulated for D = 28, 56 and 84 days: 150
 * fixtures. On the last day of each (today = day D - 1):
 * - current method: calibration input of the store, fit, snapshot of `computeCalibrationState`, modeled body at the
 *   posterior median, plan rebuilt by `buildPlanFromStore` with the solver options;
 * - journal mode: `journalCalibrationInputFromStore` (regime from day 0, R0, non-usable weight 0.5, NASEM prior,
 *   production grid, harness carbohydrates 'harness_scaled'), fit, modeled body at its own posterior median (days rebuilt
 *   by `reconstructJournalDays`), plan of the harness `journalGoalPlan` with the same solver options and the production
 *   floor (the path is compared, not the arm's raised floor).
 * Solver options compared: FX (horizon 42) and K2 (FX + horizon 28); the periodic replan uses the same plan path.
 *
 * Declared tolerance, fixed before the run (numerical: the journal totals are rounded to 0.01 kcal, D1): posterior median
 * |delta| <= 1 kcal/day and plan target |delta| <= 1 kcal/day (N1 engineering tolerance, THRESHOLDS.md), same applied
 * rate, modeled weight and tissue mass |delta| <= 0.001 kg. Bit-identical fixtures are counted.
 * Raw file: results/solver2b/equiv2b.csv.gz; summary: results/solver2b/equiv2b.txt.
 */
import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildPlanFromStore, calibrationInputFromStore, computeCalibrationState } from '@/domain/engine';
import type { SolverRequest } from '@/domain/engine';
import { journalCalibrationInputFromStore } from '@/domain/journalCalibration';
import { fitCalibration } from '@/science/calibration';
import { addDays } from '@/science/dates';
import { fatFromLean } from '@/science/hall/model';
import { modeledBodyAt } from '@/science/modeledBody';
import type { ModeledBodyResult } from '@/science/modeledBody';
import { POPULATIONS, SIM_START, closedLoopSlots, journalGoalPlan, lhsSeed, makeSpec, simulateArmDays } from '../../helpers/closedLoop';
import type { ArmConfig, Population } from '../../helpers/closedLoop';
import { writeCsvGz } from '../../helpers/journalExport';
import type { CsvValue } from '../../helpers/journalExport';
import { RESULTS } from '../it2/jobs';
import { ARMS_2B, SEED_BASES_2B, SOLVER2B_DIR } from './jobs2b';

const DIR = `${RESULTS}/${SOLVER2B_DIR}`;
const A: ArmConfig = { key: 'A', kind: 'A' };
const iso = (date: string) => `${date}T08:00:00.000Z`;
const TOL_KCAL = 1;
const TOL_KG = 0.001;
const tissue = (b: ModeledBodyResult) => b.state.lean + fatFromLean(b.params, b.state.lean);

it('iteration 2b equivalence of the journal-mode modeled body and plan', () => {
  const base = SEED_BASES_2B.equiv2b;
  const slots = closedLoopSlots(50, lhsSeed(base));
  const requests: Array<[string, SolverRequest]> = [
    ['FX', ARMS_2B.FX.solver as SolverRequest],
    ['K2', ARMS_2B.K2.solver as SolverRequest],
  ];
  const rows: Array<Record<string, CsvValue>> = [];
  slots.forEach((slot, i) => {
    const spec = makeSpec(slot, base, i, { pass: 'equiv2b', behavior: 'follower', population: POPULATIONS.P00 as Population, ideal: true, solver: ARMS_2B.FX.solver as SolverRequest });
    for (const days of [28, 56, 84]) {
      const { state } = simulateArmDays(spec, A, days);
      const store = state.store;
      const today = addDays(SIM_START, days - 1);
      const inputA = calibrationInputFromStore(store, today);
      const prepared = journalCalibrationInputFromStore(store, today, { journalRegimeStart: SIM_START, usabilityRule: { kind: 'R0' }, nonUsableDayWeight: 0.5, journalPrior: 'nasem', carbSource: 'harness_scaled' });
      if (!inputA || !prepared) throw new Error('no input');
      const fitA = fitCalibration(inputA);
      const fitJ = fitCalibration(prepared.input);
      const cal = computeCalibrationState(store, today, iso(today));
      if (!fitA || !fitJ || !cal?.candidate) throw new Error(`no fit or candidate (${i}, ${days})`);
      const medA = fitA.posterior.medianKcal;
      const medJ = fitJ.posterior.medianKcal;
      const bodyA = modeledBodyAt(inputA, medA, today);
      const bodyJ = modeledBodyAt(prepared.input, medJ, today);
      if (!bodyA || !bodyJ) throw new Error('no modeled body');
      const row: Record<string, CsvValue> = {
        index: i,
        days,
        goal: slot.goal,
        sex: slot.sex,
        bmi_class: slot.bmiClass,
        median_a: medA,
        median_j: medJ,
        d_median: medJ - medA,
        d_modeled_w: bodyJ.modeledWeightKg - bodyA.modeledWeightKg,
        d_tissue: tissue(bodyJ) - tissue(bodyA),
        d_at: bodyJ.state.at - bodyA.state.at,
        d_glycogen: bodyJ.state.glycogen - bodyA.state.glycogen,
        d_ecf: bodyJ.state.ecf - bodyA.state.ecf,
        d_shift: bodyJ.weightShiftKg - bodyA.weightShiftKg,
        body_exact: bodyJ.modeledWeightKg === bodyA.modeledWeightKg && tissue(bodyJ) === tissue(bodyA),
      };
      for (const [key, request] of requests) {
        const a = buildPlanFromStore(store, today, { source: 'recalibrated', snapshot: cal.candidate, ...(store.plan ? { stepTarget: store.plan.stepTarget } : {}), solver: request });
        const j = journalGoalPlan(store, today, medJ, undefined, { request, input: prepared.input });
        const ta = a.ok && 'goalPlan' in a ? a.goalPlan.calorieTargetKcal : null;
        const ra = a.ok && 'goalPlan' in a ? a.goalPlan.weeklyRateTarget : null;
        row[`${key}_target_a`] = ta;
        row[`${key}_target_j`] = j.goalPlan.calorieTargetKcal;
        row[`${key}_d_target`] = ta === null || j.goalPlan.calorieTargetKcal === null ? null : j.goalPlan.calorieTargetKcal - ta;
        row[`${key}_same_rate`] = ra === j.goalPlan.weeklyRateTarget;
        row[`${key}_status_a`] = a.ok ? 'ok' : a.reason;
        row[`${key}_status_j`] = j.goalPlan.status;
        row[`${key}_exact`] = ta === j.goalPlan.calorieTargetKcal;
      }
      rows.push(row);
    }
  });
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  writeCsvGz(`${DIR}/equiv2b.csv.gz`, cols, rows);
  const maxAbs = (k: string) => Math.max(...rows.map((r) => Math.abs(Number(r[k] ?? Number.NaN))).filter((v) => Number.isFinite(v)));
  const count = (pred: (r: Record<string, CsvValue>) => boolean) => rows.filter(pred).length;
  // Same status; when both plans exist, same applied rate and target within the tolerance.
  const planOk = (key: string) => rows.every((r) => r[`${key}_status_a`] === r[`${key}_status_j`] && (r[`${key}_status_a`] !== 'ok' || (r[`${key}_same_rate`] === true && Math.abs(r[`${key}_d_target`] as number) <= TOL_KCAL)));
  const pass = maxAbs('d_median') <= TOL_KCAL && maxAbs('d_modeled_w') <= TOL_KG && maxAbs('d_tissue') <= TOL_KG && planOk('FX') && planOk('K2');
  const lines = [
    `Iteration 2b equivalence test (prompt 38 s3.3): ${rows.length} fixtures (50 ideal users x D = 28, 56, 84 days), seed base ${base}.`,
    `Declared tolerance: posterior median and plan target |delta| <= ${TOL_KCAL} kcal/day, same applied rate, modeled weight and tissue |delta| <= ${TOL_KG} kg.`,
    `max |delta| posterior median (kcal/day): ${maxAbs('d_median')}`,
    `max |delta| modeled weight (kg): ${maxAbs('d_modeled_w')}; tissue (kg): ${maxAbs('d_tissue')}; AT (kcal/day): ${maxAbs('d_at')}; glycogen (kg): ${maxAbs('d_glycogen')}; ECF (kg): ${maxAbs('d_ecf')}; intercept (kg): ${maxAbs('d_shift')}`,
    `modeled bodies bit-identical: ${count((r) => r.body_exact === true)} / ${rows.length}; posterior medians bit-identical: ${count((r) => r.d_median === 0)} / ${rows.length}`,
    ...requests.map(([key]) => `${key} plans: max |delta target| ${maxAbs(`${key}_d_target`)} kcal/day; same rate ${count((r) => r[`${key}_same_rate`] === true)} / ${rows.length}; bit-identical targets ${count((r) => r[`${key}_exact`] === true)} / ${rows.length}; same status ${count((r) => r[`${key}_status_a`] === r[`${key}_status_j`])} / ${rows.length}; status ok ${count((r) => r[`${key}_status_j`] === 'ok')} / ${rows.length}`),
    `VERDICT: ${pass ? 'PASS' : 'FAIL'}`,
  ];
  writeFileSync(`${DIR}/equiv2b.txt`, `${lines.join('\n')}\n`);
  expect(pass).toBe(true);
});
