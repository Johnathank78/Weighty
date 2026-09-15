/**
 * Personal TDEE calibration (instruct/05 sections 6 to 13).
 *
 * One latent parameter: personal_tdee_offset (kcal/day), with prior N(0, sigma).
 * Deterministic 1-D grid posterior from -1200 to +1200 kcal/day by 5 kcal/day.
 * For each candidate the Hall model is run over the observation period with the
 * historical targets, macro composition and reconstructed steps, and compared
 * with raw weights through a weighted Student-t likelihood.
 *
 * The unknown true starting weight is a nuisance parameter marginalised under a
 * flat prior on a fixed grid (IMPLEMENTATION_NOTES D-10), so the posterior stays
 * one-dimensional in the offset.
 *
 * When the user supplied historical intake evidence at onboarding (warm start, D-23),
 * its log-likelihood over the same offset grid is added to the population prior.
 * The history period precedes the first weigh-in, so no observation is counted twice.
 */
import { netStepKcal } from './activity';
import {
  ADHERENCE_WEIGHT_MAJOR,
  ADHERENCE_WEIGHT_MINOR,
  ADHERENCE_WEIGHT_ON_PLAN,
  ADHERENCE_WEIGHT_UNKNOWN,
  CALIBRATION_GRID_MAX_KCAL,
  CALIBRATION_GRID_MIN_KCAL,
  CALIBRATION_GRID_STEP_KCAL,
  CALIBRATION_INTERCEPT_HALF_RANGE_KG,
  CALIBRATION_INTERCEPT_STEP_KG,
  CALIBRATION_STRUCTURAL_SD_KCAL,
  CALIBRATION_T_DF,
  CALIBRATION_T_SCALE_KG,
  CONFIDENCE_GOOD_MIN_WIDTH_KCAL,
  CONFIDENCE_HIGH_MAX_MAJOR_FRACTION,
  CONFIDENCE_HIGH_MIN_SPAN_DAYS,
  CONFIDENCE_HIGH_MIN_WEIGHINS,
  CONFIDENCE_MEDIUM_MIN_WIDTH_KCAL,
  GATE_MAJOR_DOMINATION_FRACTION,
  GATE_MIN_ADHERENCE_COVERAGE,
  GATE_MIN_CLEAN_WEIGHINS,
  GATE_MIN_SPAN_DAYS,
  GATE_MIN_WEIGHINS,
  HALL_BASELINE_CARB_FRACTION,
  KCAL_PER_G_CARB,
  MISSING_STEPS_WEIGHT_FACTOR,
  RECAL_SURFACE_MIN_CHANGE_AFTER_DAYS_KCAL,
  RECAL_SURFACE_MIN_CHANGE_KCAL,
  RECAL_SURFACE_MIN_DAYS,
  RECAL_SURFACE_MIN_INTERVAL_DAYS,
  RECAL_SURFACE_MIN_WIDTH_SHRINK,
  SCIENTIFIC_MODEL_VERSION,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
} from './constants';
import { addDays, daysBetween } from './dates';
import { advance, bodyWeightOf, initializeHall, initialState, isAdmissibleBaselineIntake } from './hall/model';
import type { HallDailyInput } from './hall/model';
import { dedupeWeightsByDate } from './trend';
import type { Adherence, CalibrationSnapshot, ConfidenceLevel, DailyLog, Interval, SexForEquation, WalkingPace, WeightEntry } from './types';

export const ADHERENCE_WEIGHTS: Readonly<Record<Adherence, number>> = {
  on_plan: ADHERENCE_WEIGHT_ON_PLAN,
  minor_deviation: ADHERENCE_WEIGHT_MINOR,
  major_deviation: ADHERENCE_WEIGHT_MAJOR,
  unknown: ADHERENCE_WEIGHT_UNKNOWN,
};

export type CalibrationInput = {
  sex: SexForEquation;
  ageYears: number;
  heightCm: number;
  walkingPace: WalkingPace;
  /** Population (NASEM) TDEE for the window-start weight, kcal/day. */
  populationTdeeAtStartKcal: number;
  /** REE for the window-start weight, kcal/day. */
  reeAtStartKcal: number;
  /** Steps represented inside the population TDEE. */
  maintenanceStepsPerDay: number;
  /** Measured initial fat mass for the Hall model (high-quality methods only). */
  initialFatKg?: number | undefined;
  priorSigmaKcal: number;
  /** Carbohydrate share of the Hall baseline diet (same rule as planning, D-16). */
  baselineCarbFraction: number;
  weights: readonly WeightEntry[];
  dailyLogs: readonly DailyLog[];
  /**
   * Optional log-likelihood of historical intake evidence, aligned with offsetGrid() (warm start, D-23).
   * Added to the population prior; never a second prior on the weigh-ins.
   */
  historicalLogLikelihood?: readonly number[] | undefined;
  /** Benchmarks and tests only: overrides CALIBRATION_STRUCTURAL_SD_KCAL (D-33). */
  structuralSdKcal?: number | undefined;
};

export type ReconstructedDay = {
  date: string;
  intakeKcal: number;
  carbKcal: number;
  steps: number;
  stepsLogged: boolean;
  adherence: Adherence;
  weight: number;
};

export function validWeights(weights: readonly WeightEntry[]): WeightEntry[] {
  return dedupeWeightsByDate(weights).filter((w) => Number.isFinite(w.weightKg) && w.weightKg >= WEIGHT_MIN_KG && w.weightKg <= WEIGHT_MAX_KG);
}

function logForDate(logs: readonly DailyLog[], sortedLogs: readonly DailyLog[], date: string): { log: DailyLog | undefined; fallback: DailyLog | undefined } {
  const exact = logs.find((l) => l.date === date);
  if (exact) return { log: exact, fallback: exact };
  // Nearest earlier log carries the plan in force; else the earliest later one.
  let fallback: DailyLog | undefined;
  for (const l of sortedLogs) {
    if (l.date <= date) fallback = l;
    else break;
  }
  return { log: undefined, fallback: fallback ?? sortedLogs[0] };
}

/** Day-level reconstruction of intake, activity and evidence weight (05 s6-s7). */
export function reconstructDays(input: Pick<CalibrationInput, 'dailyLogs' | 'populationTdeeAtStartKcal' | 'maintenanceStepsPerDay' | 'baselineCarbFraction'>, startDate: string, dayCount: number): ReconstructedDay[] {
  const sortedLogs = [...input.dailyLogs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const days: ReconstructedDay[] = [];
  for (let d = 0; d < dayCount; d++) {
    const date = addDays(startDate, d);
    const { log, fallback } = logForDate(input.dailyLogs, sortedLogs, date);
    const source = log ?? fallback;
    const intakeKcal = source?.calorieTargetForDay ?? input.populationTdeeAtStartKcal;
    const macros = source?.macrosForDay;
    // Macros only set the carbohydrate intake (glycogen); TEF is the Hall model's native term (D-01).
    // Without stored macros the day keeps the baseline carbohydrate share.
    const carbFraction = input.baselineCarbFraction > 0 ? input.baselineCarbFraction : HALL_BASELINE_CARB_FRACTION;
    const carbKcal = macros ? Math.max(0, macros.carbsG) * KCAL_PER_G_CARB : carbFraction * intakeKcal;
    const stepsLogged = log?.actualSteps !== undefined;
    const steps = log?.actualSteps ?? source?.stepTargetForDay ?? input.maintenanceStepsPerDay;
    const adherence: Adherence = log?.adherence ?? 'unknown';
    const weight = ADHERENCE_WEIGHTS[adherence] * (stepsLogged ? 1 : MISSING_STEPS_WEIGHT_FACTOR);
    days.push({ date, intakeKcal, carbKcal, steps, stepsLogged, adherence, weight });
  }
  return days;
}

// ---------------------------------------------------------------------------
// Gate (05 s8)
// ---------------------------------------------------------------------------

export type GateStatus = {
  met: boolean;
  weighInCount: number;
  spanDays: number;
  cleanWeighInCount: number;
  adherenceCoverage: number;
  majorDeviationFraction: number;
  trackedDays: number;
  criteria: {
    enoughWeighIns: boolean;
    enoughSpan: boolean;
    enoughCleanWeighIns: boolean;
    enoughAdherenceInfo: boolean;
  };
};

export function evaluateGate(weights: readonly WeightEntry[], dailyLogs: readonly DailyLog[]): GateStatus {
  const valid = validWeights(weights);
  const first = valid[0];
  const last = valid[valid.length - 1];
  const spanDays = first && last ? daysBetween(first.date, last.date) : 0;
  const logByDate = new Map(dailyLogs.map((l) => [l.date, l]));

  let cleanWeighInCount = 0;
  valid.forEach((w, i) => {
    if (i === 0) {
      cleanWeighInCount++;
      return;
    }
    const prev = valid[i - 1];
    if (!prev) return;
    const windowDays = daysBetween(prev.date, w.date);
    let major = 0;
    // Intake of the weigh-in day itself happens after the (morning) weigh-in.
    for (let d = 0; d < windowDays; d++) {
      if (logByDate.get(addDays(prev.date, d))?.adherence === 'major_deviation') major++;
    }
    if (!(windowDays > 0 && major / windowDays > GATE_MAJOR_DOMINATION_FRACTION)) cleanWeighInCount++;
  });

  let totalDays = 0;
  let adherenceDays = 0;
  let majorDays = 0;
  if (first && last) {
    for (let d = 0; d <= spanDays; d++) {
      totalDays++;
      const adherence = logByDate.get(addDays(first.date, d))?.adherence;
      if (adherence !== undefined) {
        adherenceDays++;
        if (adherence === 'major_deviation') majorDays++;
      }
    }
  }
  const adherenceCoverage = totalDays > 0 ? adherenceDays / totalDays : 0;
  const criteria = {
    enoughWeighIns: valid.length >= GATE_MIN_WEIGHINS,
    enoughSpan: spanDays >= GATE_MIN_SPAN_DAYS,
    enoughCleanWeighIns: cleanWeighInCount >= GATE_MIN_CLEAN_WEIGHINS,
    enoughAdherenceInfo: adherenceCoverage >= GATE_MIN_ADHERENCE_COVERAGE,
  };
  return {
    met: criteria.enoughWeighIns && criteria.enoughSpan && criteria.enoughCleanWeighIns && criteria.enoughAdherenceInfo,
    weighInCount: valid.length,
    spanDays,
    cleanWeighInCount,
    adherenceCoverage,
    majorDeviationFraction: adherenceDays > 0 ? majorDays / adherenceDays : 0,
    trackedDays: adherenceDays,
    criteria,
  };
}

// ---------------------------------------------------------------------------
// Posterior (05 s9-s10)
// ---------------------------------------------------------------------------

export function studentTLogDensityKernel(residualKg: number, df: number, scaleKg: number): number {
  const z = residualKg / scaleKg;
  return (-(df + 1) / 2) * Math.log(1 + (z * z) / df);
}

function logSumExp(values: ArrayLike<number>): number {
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) if ((values[i] as number) > max) max = values[i] as number;
  if (!Number.isFinite(max)) return max;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += Math.exp((values[i] as number) - max);
  return max + Math.log(sum);
}

/** Stride of the coarse intercept pass (0.2 kg with the 0.05 kg grid). Exactness-preserving speed-up only (P-01). */
const INTERCEPT_COARSE_STRIDE = 4;
/**
 * Log-likelihood margin below the best coarse intercept under which a coarse neighbourhood is skipped. The coarse pass
 * can miss a peak by at most half the curvature times the stride squared (about 13 log units for two years of daily
 * weigh-ins), so the skipped mass stays below exp(-40) of the total.
 */
const INTERCEPT_PRUNE_LOG_MARGIN = 60;

export type Posterior = {
  offsetsKcal: number[];
  probabilities: number[];
  meanKcal: number;
  medianKcal: number;
  interval80: Interval;
  interval95: Interval;
  sdKcal: number;
};

export function gridQuantile(offsets: readonly number[], probabilities: readonly number[], q: number): number {
  // Piecewise-linear CDF over grid cells centred on each offset.
  const step = offsets.length > 1 ? (offsets[1] as number) - (offsets[0] as number) : 1;
  let cumulative = 0;
  for (let i = 0; i < offsets.length; i++) {
    const p = probabilities[i] as number;
    if (cumulative + p >= q) {
      const within = p > 0 ? (q - cumulative) / p : 0.5;
      return (offsets[i] as number) - step / 2 + within * step;
    }
    cumulative += p;
  }
  return offsets[offsets.length - 1] as number;
}

export type CalibrationFit = {
  posterior: Posterior;
  startDate: string;
  endDate: string;
  observationSpanDays: number;
  validWeightCount: number;
  observationWeights: number[];
  /** Grid offsets excluded because NASEM + offset is outside the Hall admissible domain (D-28). */
  excludedOffsetCount: number;
  /** Posterior before the structural uncertainty floor (weigh-in and prior information only). */
  informationPosterior: Posterior;
  /** SD of the structural model error convolved into the posterior, kcal/day (D-33). */
  structuralSdKcal: number;
};

export function offsetGrid(): number[] {
  const out: number[] = [];
  for (let o = CALIBRATION_GRID_MIN_KCAL; o <= CALIBRATION_GRID_MAX_KCAL + 1e-9; o += CALIBRATION_GRID_STEP_KCAL) out.push(o);
  return out;
}

export function fitCalibration(input: CalibrationInput): CalibrationFit | null {
  const weights = validWeights(input.weights);
  const first = weights[0];
  const last = weights[weights.length - 1];
  if (!first || !last || weights.length < 2) return null;
  const startDate = first.date;
  const endDate = last.date;
  const spanDays = daysBetween(startDate, endDate);
  if (spanDays <= 0) return null;

  const days = reconstructDays(input, startDate, spanDays);
  const obsDays = weights.map((w) => daysBetween(startDate, w.date));
  const obsWeights = weights.map((_, i) => {
    if (i === 0) return 1;
    const from = obsDays[i - 1] as number;
    const to = obsDays[i] as number;
    let sum = 0;
    for (let d = from; d < to; d++) sum += (days[d] as ReconstructedDay).weight;
    return to > from ? sum / (to - from) : 0;
  });

  const w0 = first.weightKg;
  // Per-kg activity change: the Hall model multiplies it by the current body weight, so step energy follows the weight.
  const hallInputs: HallDailyInput[] = days.map((day) => ({
    intakeKcal: day.intakeKcal,
    carbKcal: day.carbKcal,
    sodiumDeltaMg: 0,
    paDeltaKcalPerKgDay:
      (netStepKcal({ steps: day.steps, pace: input.walkingPace, weightKg: w0, ageYears: input.ageYears }) -
        netStepKcal({ steps: input.maintenanceStepsPerDay, pace: input.walkingPace, weightKg: w0, ageYears: input.ageYears })) /
      w0,
  }));

  const intercepts: number[] = [];
  for (let c = -CALIBRATION_INTERCEPT_HALF_RANGE_KG; c <= CALIBRATION_INTERCEPT_HALF_RANGE_KG + 1e-9; c += CALIBRATION_INTERCEPT_STEP_KG) intercepts.push(c);

  const offsets = offsetGrid();
  const history = input.historicalLogLikelihood;
  if (history !== undefined && history.length !== offsets.length) throw new Error('historicalLogLikelihood must align with offsetGrid()');
  const logPost: number[] = [];
  const predicted = new Float64Array(weights.length);
  const interceptLogLik = new Float64Array(intercepts.length);
  const coarseCount = Math.floor((intercepts.length - 1) / INTERCEPT_COARSE_STRIDE) + 1;
  const coarseLogLik = new Float64Array(coarseCount);
  // Weigh-ins with a positive evidence weight, in their original order.
  const activeIndex: number[] = [];
  const activeKg: number[] = [];
  const activeWeight: number[] = [];
  weights.forEach((w, i) => {
    const wi = obsWeights[i] as number;
    if (wi <= 0) return;
    activeIndex.push(i);
    activeKg.push(w.weightKg);
    activeWeight.push(wi);
  });
  const activeCount = activeIndex.length;
  let excludedOffsetCount = 0;
  for (const [gridIndex, offset] of offsets.entries()) {
    if (!isAdmissibleBaselineIntake(input.populationTdeeAtStartKcal + offset)) {
      // Outside the Hall admissible domain: excluded from the support, never simulated (D-28).
      excludedOffsetCount++;
      logPost.push(Number.NEGATIVE_INFINITY);
      continue;
    }
    const p = initializeHall({
      sex: input.sex,
      ageYears: input.ageYears,
      heightM: input.heightCm / 100,
      bodyWeightKg: w0,
      baselineIntakeKcal: input.populationTdeeAtStartKcal + offset,
      baselineRmrKcal: input.reeAtStartKcal,
      initialFatKg: input.initialFatKg,
      baselineCarbFraction: input.baselineCarbFraction,
    });
    let s = initialState(p);
    let obsIndex = 0;
    for (let d = 0; d <= spanDays; d++) {
      while (obsIndex < obsDays.length && obsDays[obsIndex] === d) {
        predicted[obsIndex] = bodyWeightOf(p, s) - w0;
        obsIndex++;
      }
      if (d === spanDays) break;
      s = advance(p, s, hallInputs[d] as HallDailyInput, 1);
    }
    const interceptAt = (ci: number): number => {
      const c = intercepts[ci] as number;
      let ll = 0;
      for (let k = 0; k < activeCount; k++) {
        const i = activeIndex[k] as number;
        ll += (activeWeight[k] as number) * studentTLogDensityKernel((activeKg[k] as number) - (w0 + c) - (predicted[i] as number), CALIBRATION_T_DF, CALIBRATION_T_SCALE_KG);
      }
      return ll;
    };
    // Coarse-to-fine marginalisation of the starting weight (IMPLEMENTATION_NOTES P-01): intercepts whose coarse
    // neighbourhood lies more than INTERCEPT_PRUNE_LOG_MARGIN below the best coarse value contribute less than
    // exp(-40) relative mass and are skipped; every other intercept is evaluated exactly as before.
    let bestCoarse = Number.NEGATIVE_INFINITY;
    for (let ci = 0; ci < intercepts.length; ci += INTERCEPT_COARSE_STRIDE) {
      const ll = interceptAt(ci);
      coarseLogLik[ci / INTERCEPT_COARSE_STRIDE] = ll;
      if (ll > bestCoarse) bestCoarse = ll;
    }
    interceptLogLik.fill(Number.NEGATIVE_INFINITY);
    for (let k = 0; k < coarseCount; k++) {
      if ((coarseLogLik[k] as number) < bestCoarse - INTERCEPT_PRUNE_LOG_MARGIN) continue;
      const from = Math.max(0, (k - 1) * INTERCEPT_COARSE_STRIDE);
      const to = Math.min(intercepts.length - 1, (k + 1) * INTERCEPT_COARSE_STRIDE);
      for (let ci = from; ci <= to; ci++) {
        if (interceptLogLik[ci] === Number.NEGATIVE_INFINITY) interceptLogLik[ci] = ci % INTERCEPT_COARSE_STRIDE === 0 ? (coarseLogLik[ci / INTERCEPT_COARSE_STRIDE] as number) : interceptAt(ci);
      }
    }
    const marginal = logSumExp(interceptLogLik);
    const logPrior = -0.5 * (offset / input.priorSigmaKcal) ** 2 + (history ? (history[gridIndex] as number) : 0);
    logPost.push(marginal + logPrior);
  }

  const informationPosterior = summarizeGridPosterior(offsets, logPost);
  const structuralSdKcal = input.structuralSdKcal ?? CALIBRATION_STRUCTURAL_SD_KCAL;
  const admissible = logPost.map((lp) => lp !== Number.NEGATIVE_INFINITY);
  const posterior = structuralSdKcal > 0 ? summarizeGridProbabilities(offsets, convolveGridProbabilities(offsets, informationPosterior.probabilities, structuralSdKcal, admissible)) : informationPosterior;
  return { posterior, informationPosterior, structuralSdKcal, startDate, endDate, observationSpanDays: spanDays, validWeightCount: weights.length, observationWeights: obsWeights, excludedOffsetCount };
}

/**
 * Structural uncertainty floor (D-33): the apparent maintenance is never known better than the model itself.
 * Convolves a normalised grid distribution with Normal(0, sdKcal) (kernel truncated at 6 SD), then renormalises;
 * mass pushed beyond the grid edges, or onto offsets outside the Hall admissible domain (`admissible[i] === false`,
 * D-28), is dropped by the renormalisation, so excluded offsets keep a zero probability.
 */
export function convolveGridProbabilities(offsets: readonly number[], probabilities: readonly number[], sdKcal: number, admissible?: readonly boolean[]): number[] {
  const step = offsets.length > 1 ? (offsets[1] as number) - (offsets[0] as number) : 1;
  const half = Math.ceil((6 * sdKcal) / step);
  const kernel: number[] = [];
  for (let j = -half; j <= half; j++) kernel.push(Math.exp(-0.5 * ((j * step) / sdKcal) ** 2));
  const n = probabilities.length;
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const p = probabilities[i] as number;
    if (p === 0) continue;
    for (let j = -half; j <= half; j++) {
      const k = i + j;
      if (k >= 0 && k < n && admissible?.[k] !== false) out[k] = (out[k] as number) + p * (kernel[j + half] as number);
    }
  }
  const total = out.reduce((s, v) => s + v, 0);
  return out.map((v) => v / total);
}

/** Summary of a normalised grid distribution (mean, median, 80/95 percent intervals, SD). */
export function summarizeGridProbabilities(offsets: readonly number[], probabilities: readonly number[]): Posterior {
  const meanKcal = offsets.reduce((s, o, i) => s + o * (probabilities[i] as number), 0);
  const variance = offsets.reduce((s, o, i) => s + (o - meanKcal) ** 2 * (probabilities[i] as number), 0);
  return {
    offsetsKcal: [...offsets],
    probabilities: [...probabilities],
    meanKcal,
    medianKcal: gridQuantile(offsets, probabilities, 0.5),
    interval80: [gridQuantile(offsets, probabilities, 0.1), gridQuantile(offsets, probabilities, 0.9)],
    interval95: [gridQuantile(offsets, probabilities, 0.025), gridQuantile(offsets, probabilities, 0.975)],
    sdKcal: Math.sqrt(variance),
  };
}

/** Normalises unnormalised log densities on the offset grid and summarises them (mean, median, 80/95 percent intervals). */
export function summarizeGridPosterior(offsets: readonly number[], logDensity: readonly number[]): Posterior {
  const norm = logSumExp(logDensity);
  return summarizeGridProbabilities(offsets, logDensity.map((lp) => Math.exp(lp - norm)));
}

// ---------------------------------------------------------------------------
// Confidence (05 s11)
// ---------------------------------------------------------------------------

export function confidenceLevel(gate: GateStatus, interval80Width: number | null): ConfidenceLevel {
  if (!gate.met || gate.spanDays < GATE_MIN_SPAN_DAYS || interval80Width === null) return 'low';
  if (
    interval80Width <= CONFIDENCE_GOOD_MIN_WIDTH_KCAL &&
    gate.spanDays >= CONFIDENCE_HIGH_MIN_SPAN_DAYS &&
    gate.weighInCount >= CONFIDENCE_HIGH_MIN_WEIGHINS &&
    gate.majorDeviationFraction < CONFIDENCE_HIGH_MAX_MAJOR_FRACTION
  ) {
    return 'high';
  }
  // Widths <= 300 that miss a high-confidence data criterion stay "good" (IMPLEMENTATION_NOTES D-15).
  if (interval80Width <= CONFIDENCE_MEDIUM_MIN_WIDTH_KCAL) return 'good';
  return 'medium';
}

// ---------------------------------------------------------------------------
// Snapshot and surfacing (05 s10, s12)
// ---------------------------------------------------------------------------

export function buildSnapshot(fit: CalibrationFit, gate: GateStatus, populationTdeeKcal: number, createdAt: string): CalibrationSnapshot {
  const p = fit.posterior;
  return {
    scientificModelVersion: SCIENTIFIC_MODEL_VERSION,
    createdAt,
    posteriorMeanOffsetKcal: p.meanKcal,
    posteriorMedianOffsetKcal: p.medianKcal,
    interval80: p.interval80,
    interval95: p.interval95,
    calibratedTdeeMedian: populationTdeeKcal + p.medianKcal,
    validWeightCount: fit.validWeightCount,
    observationSpanDays: fit.observationSpanDays,
    confidence: confidenceLevel(gate, p.interval80[1] - p.interval80[0]),
    populationTdeeKcal,
  };
}

export type SurfacingReference = {
  tdeeKcal: number;
  interval80Width: number;
  /** ISO date of the previous surfaced recalibration, null when none. */
  surfacedOn: string | null;
};

export function shouldSurfaceRecalibration(gate: GateStatus, candidate: { tdeeKcal: number; interval80Width: number }, last: SurfacingReference, today: string): boolean {
  if (!gate.met) return false;
  const daysSince = last.surfacedOn === null ? Number.POSITIVE_INFINITY : daysBetween(last.surfacedOn, today);
  // At most one proposal per interval, whatever the criteria (IMPLEMENTATION_NOTES D-34). The first one after the gate is free.
  if (daysSince < RECAL_SURFACE_MIN_INTERVAL_DAYS) return false;
  const change = Math.abs(candidate.tdeeKcal - last.tdeeKcal);
  if (change >= RECAL_SURFACE_MIN_CHANGE_KCAL) return true;
  if (last.interval80Width > 0 && (last.interval80Width - candidate.interval80Width) / last.interval80Width >= RECAL_SURFACE_MIN_WIDTH_SHRINK) return true;
  return daysSince >= RECAL_SURFACE_MIN_DAYS && change >= RECAL_SURFACE_MIN_CHANGE_AFTER_DAYS_KCAL;
}
