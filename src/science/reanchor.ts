/**
 * Reanchoring after a pause (report 49, point 7, D7; amendment 8 of tests/experiments-journal/THRESHOLDS.md), behind the option
 * `reanchorAfterPause` of the calibration input ('off' until the verdict of the amendment).
 *
 * A pause is two consecutive valid weigh-ins TRACKING_PAUSE_MIN_GAP_DAYS (15) days apart or more; a tracking period, the
 * weigh-ins between two pauses (`trackingPauses`). Without a pause, or with the option 'off', nothing here runs: the fit and the
 * modeled body are those of today, bit for bit.
 *
 * Variant A: one level per period. Each period k has its own intercept c_k on the production grid (+-3 kg by 0.05 kg),
 * centred on its first weigh-in: residual = weigh-in - (first weigh-in of the period + c_k) - (predicted - predicted at the
 * first weigh-in of the period); for the first period, exactly the residual of today. The intercepts are marginalised apart
 * at a given offset (the likelihood factorises by period). Evidence weights: the first weigh-in of each period weighs 1 (as the
 * first weigh-in of the window today), so the days of a pause bring no evidence. The Hall model goes on through the pause with
 * the reconstructed days, as today. Modeled body of the day: the level of the last period, the median of its intercept
 * conditional on the offset, from its own weigh-ins only.
 *
 * Variant B: as A, and the Hall state starts again from equilibrium at the first weigh-in of each period after the first:
 * `initializeHall` at that weight, with a baseline intake equal to the population maintenance at that weight plus the offset
 * evaluated.
 *
 * Unchanged: prior, offset grid, Student-t likelihood, adherence weights, structural floor (D-33).
 */
import { netStepKcal } from './activity';
import type { CalibrationInput, ReconstructedDay } from './calibration';
import { gridQuantile, studentTLogDensityKernel } from './calibration';
import { CALIBRATION_INTERCEPT_HALF_RANGE_KG, CALIBRATION_INTERCEPT_STEP_KG, CALIBRATION_T_DF, CALIBRATION_T_SCALE_KG, TRACKING_PAUSE_MIN_GAP_DAYS } from './constants';
import { daysBetween } from './dates';
import { advance, bodyWeightOf, initializeHall, initialState, isAdmissibleBaselineIntake } from './hall/model';
import type { HallDailyInput, HallParameters, HallState } from './hall/model';
import type { WeightEntry } from './types';

export type ReanchorMode = 'off' | 'A' | 'B';

/** Population maintenance (NASEM, fixed PAL category) and REE at a body weight, kcal/day: the baseline of variant B. */
export type PopulationAt = (weightKg: number) => { tdeeKcal: number; reeKcal: number };

/** Indices of the first weigh-in of each tracking period (0 first), and the period of each weigh-in; null without a pause. */
export type PeriodLayout = { starts: number[]; periodOf: number[] };

export function periodLayout(weights: readonly WeightEntry[]): PeriodLayout | null {
  const starts = [0];
  const periodOf: number[] = weights.length > 0 ? [0] : [];
  for (let i = 1; i < weights.length; i++) {
    if (daysBetween((weights[i - 1] as WeightEntry).date, (weights[i] as WeightEntry).date) >= TRACKING_PAUSE_MIN_GAP_DAYS) starts.push(i);
    periodOf.push(starts.length - 1);
  }
  return starts.length > 1 ? { starts, periodOf } : null;
}

/** The reanchoring that applies to a calibration input: its mode, when the input carries pauses and no journal observations. */
export function reanchorLayout(input: Pick<CalibrationInput, 'reanchorAfterPause' | 'intakeObservations'>, weights: readonly WeightEntry[]): { mode: 'A' | 'B'; layout: PeriodLayout } | null {
  const mode = input.reanchorAfterPause ?? 'off';
  // The journal regime (intake observations) is outside the scope of the amendment.
  if (mode === 'off' || input.intakeObservations) return null;
  const layout = periodLayout(weights);
  return layout ? { mode, layout } : null;
}

/**
 * Evidence weight of each weigh-in: as today (mean of the daily weights since the previous weigh-in; the first one 1), and 1
 * for the first weigh-in of each period, so that the days of a pause bring no evidence.
 */
export function reanchoredObservationWeights(days: readonly ReconstructedDay[], obsDays: readonly number[], layout: PeriodLayout): number[] {
  const firsts = new Set(layout.starts);
  return obsDays.map((to, i) => {
    if (firsts.has(i)) return 1;
    const from = obsDays[i - 1] as number;
    let sum = 0;
    for (let d = from; d < to; d++) sum += (days[d] as ReconstructedDay).weight;
    return to > from ? sum / (to - from) : 0;
  });
}

export function interceptGrid(): number[] {
  const out: number[] = [];
  for (let c = -CALIBRATION_INTERCEPT_HALF_RANGE_KG; c <= CALIBRATION_INTERCEPT_HALF_RANGE_KG + 1e-9; c += CALIBRATION_INTERCEPT_STEP_KG) out.push(c);
  return out;
}

/** Per-kg activity inputs of the Hall model, as `fitCalibration` builds them (step energy at the window-start weight). */
export function hallInputsOf(input: CalibrationInput, days: readonly ReconstructedDay[], w0: number): HallDailyInput[] {
  const net = (steps: number) => netStepKcal({ steps, pace: input.walkingPace, weightKg: w0, ageYears: input.ageYears });
  const base = net(input.maintenanceStepsPerDay);
  return days.map((day) => ({ intakeKcal: day.intakeKcal, carbKcal: day.carbKcal, sodiumDeltaMg: 0, paDeltaKcalPerKgDay: (net(day.steps) - base) / w0 }));
}

export type ReanchoredRun = {
  /** Hall weight (absolute) at each weigh-in. */
  hallKg: number[];
  /** Parameters and state of the model at the last simulated day (B: those of the last restart). */
  params: HallParameters;
  state: HallState;
};

/**
 * Hall model over the window and on to `totalDays`, at an offset. Variant B restarts it from equilibrium at the first weigh-in
 * of each period after the first. Null when an initialisation leaves the admissible domain (D-28).
 */
export function runReanchoredHall(input: CalibrationInput, mode: 'A' | 'B', layout: PeriodLayout, weights: readonly WeightEntry[], obsDays: readonly number[], hallInputs: readonly HallDailyInput[], offsetKcal: number, totalDays: number): ReanchoredRun | null {
  const w0 = (weights[0] as WeightEntry).weightKg;
  if (!isAdmissibleBaselineIntake(input.populationTdeeAtStartKcal + offsetKcal)) return null;
  let p = initializeHall({
    sex: input.sex,
    ageYears: input.ageYears,
    heightM: input.heightCm / 100,
    bodyWeightKg: w0,
    baselineIntakeKcal: input.populationTdeeAtStartKcal + offsetKcal,
    baselineRmrKcal: input.reeAtStartKcal,
    initialFatKg: input.initialFatKg,
    baselineCarbFraction: input.baselineCarbFraction,
  });
  let s = initialState(p);
  const restartAt = new Map<number, number>();
  if (mode === 'B') for (const i of layout.starts.slice(1)) restartAt.set(obsDays[i] as number, i);
  const hallKg = new Array<number>(weights.length).fill(Number.NaN);
  let obsIndex = 0;
  for (let d = 0; d <= totalDays; d++) {
    const restart = restartAt.get(d);
    if (restart !== undefined) {
      const wk = (weights[restart] as WeightEntry).weightKg;
      if (!input.populationAt) throw new Error('variant B needs populationAt');
      const pop = input.populationAt(wk);
      if (!isAdmissibleBaselineIntake(pop.tdeeKcal + offsetKcal)) return null;
      p = initializeHall({
        sex: input.sex,
        ageYears: input.ageYears,
        heightM: input.heightCm / 100,
        bodyWeightKg: wk,
        baselineIntakeKcal: pop.tdeeKcal + offsetKcal,
        baselineRmrKcal: pop.reeKcal,
        initialFatKg: input.initialFatKg === undefined ? undefined : (input.initialFatKg * wk) / w0,
        baselineCarbFraction: input.baselineCarbFraction,
      });
      s = initialState(p);
    }
    while (obsIndex < obsDays.length && obsDays[obsIndex] === d) {
      hallKg[obsIndex] = bodyWeightOf(p, s);
      obsIndex++;
    }
    if (d === totalDays) break;
    s = advance(p, s, hallInputs[d] as HallDailyInput, 1);
  }
  return { hallKg, params: p, state: s };
}

/**
 * Residual of weigh-in i at intercept c of its period: for the first period exactly today's (w_i - (w0 + c) - (H_i - w0)),
 * for a later one w_i - (w_first + c) - (H_i - H_first).
 */
function anchorOf(weights: readonly WeightEntry[], hallKg: readonly number[], layout: PeriodLayout, k: number): { level: number; hall: number } {
  if (k === 0) {
    const w0 = (weights[0] as WeightEntry).weightKg;
    return { level: w0, hall: w0 };
  }
  const first = layout.starts[k] as number;
  return { level: (weights[first] as WeightEntry).weightKg, hall: hallKg[first] as number };
}

/** Log-likelihood of period k at each intercept of the grid (weighted Student-t kernel, as the calibration). */
export function periodInterceptLogLik(weights: readonly WeightEntry[], hallKg: readonly number[], obsWeights: readonly number[], layout: PeriodLayout, k: number, intercepts: readonly number[]): number[] {
  const { level, hall } = anchorOf(weights, hallKg, layout, k);
  const members: number[] = [];
  layout.periodOf.forEach((pk, i) => {
    if (pk === k && (obsWeights[i] as number) > 0) members.push(i);
  });
  return intercepts.map((c) => {
    let ll = 0;
    for (const i of members) ll += (obsWeights[i] as number) * studentTLogDensityKernel((weights[i] as WeightEntry).weightKg - (level + c) - ((hallKg[i] as number) - hall), CALIBRATION_T_DF, CALIBRATION_T_SCALE_KG);
    return ll;
  });
}

function logSumExp(values: readonly number[]): number {
  let max = -Infinity;
  for (const v of values) if (v > max) max = v;
  if (!Number.isFinite(max)) return max;
  let sum = 0;
  for (const v of values) sum += Math.exp(v - max);
  return max + Math.log(sum);
}

/** Marginal log-likelihood at an offset: the sum over periods of the intercept marginal of each (flat prior on the grid). */
export function reanchoredMarginal(weights: readonly WeightEntry[], hallKg: readonly number[], obsWeights: readonly number[], layout: PeriodLayout, intercepts: readonly number[]): number {
  let total = 0;
  for (let k = 0; k < layout.starts.length; k++) total += logSumExp(periodInterceptLogLik(weights, hallKg, obsWeights, layout, k, intercepts));
  return total;
}

/**
 * Shift of the modeled body (modeled weight = Hall weight + shift): the level of the last period, from the median of its
 * intercept conditional on the offset (its own weigh-ins only): first weigh-in of the period + c - Hall weight there.
 */
export function lastPeriodShift(weights: readonly WeightEntry[], hallKg: readonly number[], obsWeights: readonly number[], layout: PeriodLayout, intercepts: readonly number[]): { shiftKg: number; interceptKg: number; periodStart: string } {
  const k = layout.starts.length - 1;
  const ll = periodInterceptLogLik(weights, hallKg, obsWeights, layout, k, intercepts);
  const max = Math.max(...ll);
  const un = ll.map((v) => Math.exp(v - max));
  const total = un.reduce((a, b) => a + b, 0);
  const c = gridQuantile(intercepts, un.map((v) => v / total), 0.5);
  const { level, hall } = anchorOf(weights, hallKg, layout, k);
  return { shiftKg: level + c - hall, interceptKg: c, periodStart: (weights[layout.starts[k] as number] as WeightEntry).date };
}
