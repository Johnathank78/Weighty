/**
 * Relaunch of iteration 2 (prompt 40 s6.1): equivalence of the journal-mode path and the current method, extended to the
 * guardrails. Tolerances of report 38 (declared before the 2b run, unchanged): posterior median and plan target
 * |delta| <= 1 kcal/day, same applied rate (and same status), modeled weight and tissue mass |delta| <= 0.001 kg.
 *
 * Part 1 (EQUIV_PART=2b): the 150 fixtures of iteration 2b (equiv2b.experiment.ts, seeds 3.3e9, arm FX) rerun with the code
 * of this iteration, same procedure; the rows are also compared with the committed results/solver2b/equiv2b.csv.gz.
 *
 * Part 2 (EQUIV_PART=g, sharded by EQUIV_SHARD / EQUIV_SHARDS, then EQUIV_PART=summary): ideal world (nominal Hall,
 * noiseless daily weigh-ins, exact logging u = 0 without noise, perfect followers declaring 'on_plan'), 400 users of the
 * sub-base controls2r + 10 000, arm A with K2 + G. Fixture = every guardrail applied (G1 or G2) on a day D after a
 * calibration snapshot was applied (day E of that snapshot). On the morning of D (weigh-in included, before the guardrail):
 * - current method: `enforcePlanGuardrails` (K2), from the latest applied snapshot (offset o_A), modeled body of the
 *   calibration input of the store at o_A;
 * - journal mode: the journal estimate of day E (store of the morning of E after its guardrail step: journal input with the
 *   regime from day 0, R0, non-usable weight 0.5, NASEM prior, production grid, harness carbohydrates, as in 2b), then
 *   `enforceJournalPlanGuardrails` at D with that estimate, the journal input of D for the solver options (K2) and the
 *   production floor (the path is compared, not the arm's raised floor); modeled body of the journal input of D at o_J.
 * Compared: posterior median of day E, rule and status, plan target, applied rate, goal, modeled weight and tissue mass.
 * A guardrail before any applied snapshot is counted apart (both arms then use the current method's path, s3.13).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildPlanFromStore, calibrationInputFromStore, computeCalibrationState, enforcePlanGuardrails, latestAppliedSnapshot } from '@/domain/engine';
import type { SolverRequest } from '@/domain/engine';
import { journalCalibrationInputFromStore } from '@/domain/journalCalibration';
import type { JournalRegimeOptions } from '@/domain/journalCalibration';
import type { WheightyStore } from '@/domain/types';
import { fitCalibration } from '@/science/calibration';
import { addDays, daysBetween } from '@/science/dates';
import { fatFromLean } from '@/science/hall/model';
import { modeledBodyAt } from '@/science/modeledBody';
import type { ModeledBodyResult } from '@/science/modeledBody';
import { POPULATIONS, SIM_START, closedLoopSlots, enforceJournalPlanGuardrails, journalGoalPlan, lhsSeed, makeSpec, simulateArmDays, simulateArmToMorning, simulateUser } from '../../helpers/closedLoop';
import type { ArmConfig, Population } from '../../helpers/closedLoop';
import { readCsvGz, writeCsvGz } from '../../helpers/journalExport';
import type { CsvValue } from '../../helpers/journalExport';
import { RESULTS } from '../it2/jobs';
import { ARMS_2B, SEED_BASES_2B } from '../it2b/jobs2b';
import { EQUIV_G_SUB_BASE, IT2R_DIR, K2G } from './jobs2r';

const DIR = `${IT2R_DIR}/controls`;
const A: ArmConfig = { key: 'A', kind: 'A' };
const iso = (date: string) => `${date}T08:00:00.000Z`;
const TOL_KCAL = 1;
const TOL_KG = 0.001;
const EQUIV_G_USERS = 400;
const tissue = (b: ModeledBodyResult) => b.state.lean + fatFromLean(b.params, b.state.lean);
const JOURNAL_2B: JournalRegimeOptions = { journalRegimeStart: SIM_START, usabilityRule: { kind: 'R0' }, nonUsableDayWeight: 0.5, journalPrior: 'nasem', carbSource: 'harness_scaled' };
const asCsv = (v: CsvValue) => (v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? '1' : '0') : String(v));

/** Part 1: the fixtures and rows of equiv2b.experiment.ts (report 38), same procedure. */
function part2b(): void {
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
      const prepared = journalCalibrationInputFromStore(store, today, JOURNAL_2B);
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
  writeCsvGz(`${DIR}/equiv2b-rerun.csv.gz`, cols, rows);
  const committed = readCsvGz(`${RESULTS}/solver2b/equiv2b.csv.gz`);
  let values = 0;
  let diffs = 0;
  committed.forEach((ref, k) => {
    for (const [key, v] of Object.entries(ref)) {
      values++;
      if (asCsv(rows[k]?.[key]) !== v) diffs++;
    }
  });
  const maxAbs = (k: string) => Math.max(...rows.map((r) => Math.abs(Number(r[k] ?? Number.NaN))).filter((v) => Number.isFinite(v)));
  const count = (pred: (r: Record<string, CsvValue>) => boolean) => rows.filter(pred).length;
  const planOk = (key: string) => rows.every((r) => r[`${key}_status_a`] === r[`${key}_status_j`] && (r[`${key}_status_a`] !== 'ok' || (r[`${key}_same_rate`] === true && Math.abs(r[`${key}_d_target`] as number) <= TOL_KCAL)));
  const pass = maxAbs('d_median') <= TOL_KCAL && maxAbs('d_modeled_w') <= TOL_KG && maxAbs('d_tissue') <= TOL_KG && planOk('FX') && planOk('K2');
  const lines = [
    `Relaunch of iteration 2 (prompt 40 s6.1), part 1: equiv2b (report 38) rerun with the code of this iteration: ${rows.length} fixtures (50 ideal users x D = 28, 56, 84 days), seed base ${base}.`,
    `Rows against the committed results/solver2b/equiv2b.csv.gz (${committed.length} rows): ${values} values compared, ${diffs} differences.`,
    `Tolerance of report 38: posterior median and plan target |delta| <= ${TOL_KCAL} kcal/day, same applied rate, modeled weight and tissue |delta| <= ${TOL_KG} kg.`,
    `max |delta| posterior median (kcal/day): ${maxAbs('d_median')}; modeled weight (kg): ${maxAbs('d_modeled_w')}; tissue (kg): ${maxAbs('d_tissue')}`,
    ...requests.map(([key]) => `${key} plans: max |delta target| ${maxAbs(`${key}_d_target`)} kcal/day; same rate ${count((r) => r[`${key}_same_rate`] === true)} / ${rows.length}; bit-identical targets ${count((r) => r[`${key}_exact`] === true)} / ${rows.length}; same status ${count((r) => r[`${key}_status_a`] === r[`${key}_status_j`])} / ${rows.length}`),
    `VERDICT: ${pass && diffs === 0 ? 'PASS' : 'FAIL'}`,
  ];
  writeFileSync(`${DIR}/equiv2b-rerun.txt`, `${lines.join('\n')}\n`);
  expect(diffs).toBe(0);
  expect(pass).toBe(true);
}

/** Store of the morning of `day` after its guardrail step (as the harness evaluates the calibration that morning). */
function morningAfterGuard(spec: ReturnType<typeof makeSpec>, day: number, request: SolverRequest): WheightyStore {
  const store = simulateArmToMorning(spec, A, day).state.store;
  const g = enforcePlanGuardrails(store, addDays(SIM_START, day), { solver: request });
  return g.status === 'applied' ? g.store : store;
}

/** Part 2, one shard: the guardrail fixtures of the ideal users i mod shards = shard. */
function partG(shard: number, shards: number): void {
  const base = EQUIV_G_SUB_BASE;
  const slots = closedLoopSlots(EQUIV_G_USERS, lhsSeed(base));
  const request = K2G.solver;
  const rows: Array<Record<string, CsvValue>> = [];
  for (let i = shard; i < EQUIV_G_USERS; i += shards) {
    const slot = slots[i];
    if (!slot) continue;
    const spec = makeSpec(slot, base, i, { pass: 'equivG', behavior: 'follower', population: POPULATIONS.P00 as Population, ideal: true, ...K2G });
    const st = (simulateUser(spec, [A]).arms[0] as { state: ReturnType<typeof simulateArmDays>['state'] }).state;
    for (const g of st.guards.filter((x) => x.status === 'applied')) {
      const d = g.day;
      const date = addDays(SIM_START, d);
      const store = simulateArmToMorning(spec, A, d).state.store;
      const snapshot = latestAppliedSnapshot(store);
      const row: Record<string, CsvValue> = { index: i, day: d, rule: g.rule, goal: slot.goal, sex: slot.sex, bmi_class: slot.bmiClass, bmi: g.bmi, has_snapshot: snapshot !== null };
      if (!snapshot?.appliedAt) {
        rows.push(row);
        continue;
      }
      const e = daysBetween(SIM_START, snapshot.appliedAt.slice(0, 10));
      const storeE = morningAfterGuard(spec, e, request);
      const preparedE = journalCalibrationInputFromStore(storeE, addDays(SIM_START, e), JOURNAL_2B);
      const fitJ = preparedE ? fitCalibration(preparedE.input) : null;
      if (!fitJ) throw new Error(`no journal fit (${i}, ${e})`);
      const oA = snapshot.posteriorMedianOffsetKcal;
      const oJ = fitJ.posterior.medianKcal;
      const current = enforcePlanGuardrails(store, date, { solver: request });
      const preparedD = journalCalibrationInputFromStore(store, date, JOURNAL_2B);
      const inputA = calibrationInputFromStore(store, date);
      if (!preparedD || !inputA) throw new Error('no input');
      const journal = enforceJournalPlanGuardrails(store, date, { offsetKcal: oJ, interval80: fitJ.posterior.interval80, interval95: fitJ.posterior.interval95 }, undefined, { request, input: preparedD.input });
      const bodyA = modeledBodyAt(inputA, oA, date);
      const bodyJ = modeledBodyAt(preparedD.input, oJ, date);
      if (!bodyA || !bodyJ) throw new Error('no modeled body');
      const planA = current.status === 'applied' ? current.store.plan : null;
      const planJ = journal.status === 'applied' ? journal.store.plan : null;
      Object.assign(row, {
        snapshot_day: e,
        median_a: oA,
        median_j: oJ,
        d_median: oJ - oA,
        status_a: current.status === 'applied' ? `${current.rule}:applied` : current.status === 'failed' ? `${current.rule}:${current.reason}` : 'none',
        status_j: journal.status === 'applied' ? `${journal.rule}:applied` : journal.status === 'failed' ? `${journal.rule}:${journal.reason}` : 'none',
        target_a: planA?.calorieTarget ?? null,
        target_j: planJ?.calorieTarget ?? null,
        d_target: planA && planJ ? planJ.calorieTarget - planA.calorieTarget : null,
        rate_a: planA?.weeklyRateTarget ?? null,
        rate_j: planJ?.weeklyRateTarget ?? null,
        same_rate: planA !== null && planJ !== null && planA.weeklyRateTarget === planJ.weeklyRateTarget,
        same_goal: planA !== null && planJ !== null && planA.goal === planJ.goal && current.status === 'applied' && journal.status === 'applied' && current.store.profile?.goal === journal.store.profile?.goal,
        exact: planA !== null && planJ !== null && planA.calorieTarget === planJ.calorieTarget,
        d_modeled_w: bodyJ.modeledWeightKg - bodyA.modeledWeightKg,
        d_tissue: tissue(bodyJ) - tissue(bodyA),
      });
      rows.push(row);
    }
  }
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${DIR}/equivG-part${shard}.json`, `${JSON.stringify(rows)}\n`);
}

function summaryG(): void {
  const rows = readdirSync(DIR)
    .filter((f) => /^equivG-part\d+\.json$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
    .flatMap((f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as Array<Record<string, CsvValue>>)
    .sort((a, b) => (a.index as number) - (b.index as number) || (a.day as number) - (b.day as number));
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  writeCsvGz(`${DIR}/equivG.csv.gz`, cols, rows);
  const fixtures = rows.filter((r) => r.has_snapshot === true);
  const maxAbs = (k: string) => Math.max(...fixtures.map((r) => Math.abs(Number(r[k] ?? Number.NaN))).filter((v) => Number.isFinite(v)));
  const count = (pred: (r: Record<string, CsvValue>) => boolean) => fixtures.filter(pred).length;
  const sameStatus = count((r) => r.status_a === r.status_j);
  const planOk = fixtures.every((r) => r.status_a === r.status_j && (!String(r.status_a).endsWith(':applied') || (r.same_rate === true && r.same_goal === true && Math.abs(r.d_target as number) <= TOL_KCAL)));
  const pass = fixtures.length >= 50 && maxAbs('d_median') <= TOL_KCAL && maxAbs('d_modeled_w') <= TOL_KG && maxAbs('d_tissue') <= TOL_KG && planOk;
  const lines = [
    `Relaunch of iteration 2 (prompt 40 s6.1), part 2: guardrail fixtures of the ideal world (${EQUIV_G_USERS} users, sub-base ${EQUIV_G_SUB_BASE}, arm A with K2 + G).`,
    `Guardrails applied: ${rows.length} (G1 ${rows.filter((r) => r.rule === 'G1').length}, G2 ${rows.filter((r) => r.rule === 'G2').length}); without an applied snapshot (counted apart, current method's path in both arms): ${rows.length - fixtures.length}.`,
    `Fixtures compared: ${fixtures.length} (G1 ${count((r) => r.rule === 'G1')}, G2 ${count((r) => r.rule === 'G2')}; users ${new Set(fixtures.map((r) => r.index)).size}). Required: at least 50.`,
    `Tolerance of report 38: posterior median and plan target |delta| <= ${TOL_KCAL} kcal/day, same applied rate (and status, goal), modeled weight and tissue |delta| <= ${TOL_KG} kg.`,
    `max |delta| posterior median of day E (kcal/day): ${maxAbs('d_median')}; modeled weight (kg): ${maxAbs('d_modeled_w')}; tissue (kg): ${maxAbs('d_tissue')}`,
    `plans: same status ${sameStatus} / ${fixtures.length}; applied in both ${count((r) => String(r.status_a).endsWith(':applied') && String(r.status_j).endsWith(':applied'))}; max |delta target| ${maxAbs('d_target')} kcal/day; same rate ${count((r) => r.same_rate === true)}; same goal ${count((r) => r.same_goal === true)}; bit-identical targets ${count((r) => r.exact === true)} / ${fixtures.length}`,
    `VERDICT: ${pass ? 'PASS' : 'FAIL'}`,
  ];
  writeFileSync(`${DIR}/equivG.txt`, `${lines.join('\n')}\n`);
  expect(pass).toBe(true);
}

it('relaunch equivalence of the journal path, extended to the guardrails', () => {
  mkdirSync(DIR, { recursive: true });
  const part = process.env.EQUIV_PART;
  if (part === '2b') part2b();
  else if (part === 'g') partG(Number(process.env.EQUIV_SHARD ?? '0'), Number(process.env.EQUIV_SHARDS ?? '1'));
  else if (part === 'summary') summaryG();
  else throw new Error('EQUIV_PART must be 2b, g or summary');
});
