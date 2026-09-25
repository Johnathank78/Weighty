/**
 * Modeled body today (prompt 37 s3.1, solver prototype, measurement only, never called by the app).
 *
 * The calibration does not expose its Hall state, so this runs one more simulation of its window, with the same model,
 * the same parameters (window-start weight, NASEM at that weight + the retained offset, activity parameter solved at the
 * window start, baseline carbohydrate share) and the same reconstructed days as `fitCalibration`
 * (src/science/calibration.ts), then continues with the reconstructed days up to today. The latent starting-weight
 * intercept is the median of its posterior conditional on the retained offset (flat prior, same intercept grid and
 * Student-t likelihood as the calibration). No second model and no state rebuilt at equilibrium.
 */
import { netStepKcal } from './activity';
import { reconstructDays, gridQuantile, studentTLogDensityKernel, validWeights } from './calibration';
import type { CalibrationInput, ReconstructedDay } from './calibration';
import { CALIBRATION_INTERCEPT_HALF_RANGE_KG, CALIBRATION_INTERCEPT_STEP_KG, CALIBRATION_T_DF, CALIBRATION_T_SCALE_KG } from './constants';
import { daysBetween } from './dates';
import type { ModeledBody } from './goals';
import { advance, bodyWeightOf, initializeHall, initialState, isAdmissibleBaselineIntake } from './hall/model';
import type { HallDailyInput } from './hall/model';

export type ModeledBodyResult = ModeledBody & {
  offsetKcal: number;
  windowStartDate: string;
  windowEndDate: string;
  /** Days simulated from the window start (window span, plus the days from the last weigh-in to today). */
  simulatedDays: number;
  /** Modeled weight today: Hall weight of the state + intercept, kg. */
  modeledWeightKg: number;
};

/**
 * State of the calibration's Hall model today, at the offset `offsetKcal` (relative to NASEM at the window-start weight).
 * Null when the calibration has no window (fewer than two valid weigh-ins) or the offset is outside the admissible domain.
 */
export function modeledBodyAt(input: CalibrationInput, offsetKcal: number, today: string): ModeledBodyResult | null {
  const weights = validWeights(input.weights);
  const first = weights[0];
  const last = weights[weights.length - 1];
  if (!first || !last || weights.length < 2) return null;
  const startDate = first.date;
  const spanDays = daysBetween(startDate, last.date);
  if (spanDays <= 0) return null;
  if (!isAdmissibleBaselineIntake(input.populationTdeeAtStartKcal + offsetKcal)) return null;
  const totalDays = Math.max(spanDays, daysBetween(startDate, today));

  // Window of the fit (evidence weights and inputs, exactly those of fitCalibration), then the days after the last weigh-in
  // from the same reconstruction extended to today. `reconstructDays` follows the calibration input: the current method's
  // days, or the journal regime's days (`reconstructJournalDays`) when the input carries `intakeObservations` (prompt 38
  // s3.3). The journal reconstruction depends on the day count (median of the window), hence the window days are kept.
  const windowDays = reconstructDays(input, startDate, spanDays);
  const days = totalDays === spanDays ? windowDays : [...windowDays, ...reconstructDays(input, startDate, totalDays).slice(spanDays)];
  const obsDays = weights.map((w) => daysBetween(startDate, w.date));
  const obsWeights = weights.map((_, i) => {
    if (i === 0) return 1;
    const from = obsDays[i - 1] as number;
    const to = obsDays[i] as number;
    let sum = 0;
    for (let d = from; d < to; d++) sum += (windowDays[d] as ReconstructedDay).weight;
    return to > from ? sum / (to - from) : 0;
  });

  const w0 = first.weightKg;
  const net = (steps: number) => netStepKcal({ steps, pace: input.walkingPace, weightKg: w0, ageYears: input.ageYears });
  const hallInputs: HallDailyInput[] = days.map((day) => ({
    intakeKcal: day.intakeKcal,
    carbKcal: day.carbKcal,
    sodiumDeltaMg: 0,
    paDeltaKcalPerKgDay: (net(day.steps) - net(input.maintenanceStepsPerDay)) / w0,
  }));

  const p = initializeHall({
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
  const predicted: number[] = new Array<number>(weights.length).fill(Number.NaN);
  let obsIndex = 0;
  for (let d = 0; d <= totalDays; d++) {
    while (obsIndex < obsDays.length && obsDays[obsIndex] === d) {
      predicted[obsIndex] = bodyWeightOf(p, s) - w0;
      obsIndex++;
    }
    if (d === totalDays) break;
    s = advance(p, s, hallInputs[d] as HallDailyInput, 1);
  }

  // Intercept posterior conditional on the offset: flat prior on the calibration grid, every intercept evaluated exactly.
  const intercepts: number[] = [];
  for (let c = -CALIBRATION_INTERCEPT_HALF_RANGE_KG; c <= CALIBRATION_INTERCEPT_HALF_RANGE_KG + 1e-9; c += CALIBRATION_INTERCEPT_STEP_KG) intercepts.push(c);
  const logLik = intercepts.map((c) => {
    let ll = 0;
    weights.forEach((w, i) => {
      const wi = obsWeights[i] as number;
      if (wi <= 0) return;
      ll += wi * studentTLogDensityKernel(w.weightKg - (w0 + c) - (predicted[i] as number), CALIBRATION_T_DF, CALIBRATION_T_SCALE_KG);
    });
    return ll;
  });
  const max = Math.max(...logLik);
  const unnormalized = logLik.map((ll) => Math.exp(ll - max));
  const total = unnormalized.reduce((a, b) => a + b, 0);
  const shift = gridQuantile(intercepts, unnormalized.map((v) => v / total), 0.5);

  return {
    params: p,
    state: s,
    weightShiftKg: shift,
    steps: { weightKg: w0, ageYears: input.ageYears, pace: input.walkingPace, maintenanceStepsPerDay: input.maintenanceStepsPerDay },
    offsetKcal,
    windowStartDate: startDate,
    windowEndDate: last.date,
    simulatedDays: totalDays,
    modeledWeightKg: bodyWeightOf(p, s) + shift,
  };
}
