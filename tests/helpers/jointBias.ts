/**
 * Joint estimation of (personal TDEE offset, intake logging bias) for the benchmark of handoff prompt 27.
 * Measurement only: nothing here is used by the application.
 *
 * Bias parametrisation (prompt 27 s3):
 *   EI(day) = logged(day) x k   when the day is logged,   k = 1 / (1 + u) >= 1
 *           = target(day)       otherwise (adherence unchanged, no imputation from logged days)
 * u is the under-reporting fraction (u = -0.20 means 20 percent under-reported, k = 1.25). The support is a grid on u.
 *
 * The bias is a nuisance parameter marginalised on a grid, the same pattern as the latent starting weight (D-10):
 * the posterior is computed on offset x u, with the starting weight marginalised inside each cell, i.e. three
 * dimensions. `offsetLogPosterior` reproduces the production likelihood of `fitCalibration` exactly (checked by test)
 * and returns the unnormalised log posterior over the offset grid, which the production function does not expose.
 */
import { netStepKcal } from '@/science/activity';
import { convolveGridProbabilities, gridQuantile, offsetGrid, reconstructDays, studentTLogDensityKernel, summarizeGridProbabilities, validWeights } from '@/science/calibration';
import type { CalibrationInput, Posterior, ReconstructedDay } from '@/science/calibration';
import { CALIBRATION_INTERCEPT_HALF_RANGE_KG, CALIBRATION_INTERCEPT_STEP_KG, CALIBRATION_STRUCTURAL_SD_KCAL, CALIBRATION_T_DF, CALIBRATION_T_SCALE_KG } from '@/science/constants';
import { daysBetween } from '@/science/dates';
import { advance, bodyWeightOf, initialState, initializeHall, isAdmissibleBaselineIntake } from '@/science/hall/model';
import type { HallDailyInput } from '@/science/hall/model';
import { logSumExp } from '@/science/normal';
import { withLoggedIntake } from './intakeLogging';

// Same values as the private constants of fitCalibration (P-01); exactness is checked by test.
const INTERCEPT_COARSE_STRIDE = 4;
const INTERCEPT_PRUNE_LOG_MARGIN = 60;

export type OffsetLogPosterior = { logPost: number[]; admissible: boolean[] };

/** Unnormalised log posterior over offsetGrid(): weigh-in marginal likelihood + population prior (+ history when given). */
export function offsetLogPosterior(input: CalibrationInput): OffsetLogPosterior | null {
  const weights = validWeights(input.weights);
  const first = weights[0];
  const last = weights[weights.length - 1];
  if (!first || !last || weights.length < 2) return null;
  const spanDays = daysBetween(first.date, last.date);
  if (spanDays <= 0) return null;
  const days = reconstructDays(input, first.date, spanDays);
  const obsDays = weights.map((w) => daysBetween(first.date, w.date));
  const obsWeights = weights.map((_, i) => {
    if (i === 0) return 1;
    const from = obsDays[i - 1] as number;
    const to = obsDays[i] as number;
    let sum = 0;
    for (let d = from; d < to; d++) sum += (days[d] as ReconstructedDay).weight;
    return to > from ? sum / (to - from) : 0;
  });
  const w0 = first.weightKg;
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
  const logPost: number[] = [];
  const admissible: boolean[] = [];
  const predicted = new Float64Array(weights.length);
  const interceptLogLik = new Float64Array(intercepts.length);
  const coarseCount = Math.floor((intercepts.length - 1) / INTERCEPT_COARSE_STRIDE) + 1;
  const coarseLogLik = new Float64Array(coarseCount);
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
  for (const [gridIndex, offset] of offsets.entries()) {
    if (!isAdmissibleBaselineIntake(input.populationTdeeAtStartKcal + offset)) {
      logPost.push(Number.NEGATIVE_INFINITY);
      admissible.push(false);
      continue;
    }
    admissible.push(true);
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
      for (let k = 0; k < activeIndex.length; k++) {
        const i = activeIndex[k] as number;
        ll += (activeWeight[k] as number) * studentTLogDensityKernel((activeKg[k] as number) - (w0 + c) - (predicted[i] as number), CALIBRATION_T_DF, CALIBRATION_T_SCALE_KG);
      }
      return ll;
    };
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
    const marginal = logSumExp(Array.from(interceptLogLik));
    logPost.push(marginal + -0.5 * (offset / input.priorSigmaKcal) ** 2 + (history ? (history[gridIndex] as number) : 0));
  }
  return { logPost, admissible };
}

/** Posterior of the offset from an unnormalised log posterior, with the production structural floor (D-33). */
export function offsetPosteriorFrom(logPost: readonly number[], admissible: readonly boolean[], structuralSdKcal = CALIBRATION_STRUCTURAL_SD_KCAL): Posterior {
  const offsets = offsetGrid();
  const norm = logSumExp(logPost);
  const info = logPost.map((lp) => Math.exp(lp - norm));
  return summarizeGridProbabilities(offsets, structuralSdKcal > 0 ? convolveGridProbabilities(offsets, info, structuralSdKcal, admissible) : info);
}

// ---------------------------------------------------------------------------
// Bias support, prior and joint posterior
// ---------------------------------------------------------------------------

/** Support of u (under-reporting fraction): -0.40 to 0 by 0.01, i.e. k from 1 to 1.667. Prompt 27: k >= 1. */
export const U_SUPPORT_MIN = -0.4;
export const U_SUPPORT_MAX = 0;
export const U_SUPPORT_STEP = 0.01;

export function uGrid(): number[] {
  const n = Math.round((U_SUPPORT_MAX - U_SUPPORT_MIN) / U_SUPPORT_STEP);
  return Array.from({ length: n + 1 }, (_, i) => Math.round((U_SUPPORT_MIN + i * U_SUPPORT_STEP) * 100) / 100);
}

export const kOf = (u: number): number => 1 / (1 + u);

/**
 * Prior on u: Normal(meanU, sdU) restricted to the support (engineering_prior, PROVISIONAL, pending literature sourcing).
 * Input parameter of the benchmark; never tuned on a metric.
 */
export type BiasPrior = { label: string; meanU: number; sdU: number };

export const NOMINAL_BIAS_PRIOR: BiasPrior = { label: 'nominal N(-10 %, 10 pts)', meanU: -0.1, sdU: 0.1 };

export type JointSlices = { u: number[]; logPost: number[][]; admissible: boolean[] };

/** One production-likelihood slice per u: logged days scaled by k = 1 / (1 + u). */
export function jointSlices(base: CalibrationInput, startDate: string, logged: ReadonlyArray<number | null>): JointSlices {
  const u = uGrid();
  const logPost: number[][] = [];
  let admissible: boolean[] = [];
  for (const ui of u) {
    const k = kOf(ui);
    const slice = offsetLogPosterior(withLoggedIntake(base, startDate, logged.map((v) => (v === null ? null : v * k))));
    if (!slice) throw new Error('joint slice failed');
    logPost.push(slice.logPost);
    admissible = slice.admissible;
  }
  return { u, logPost, admissible };
}

export type JointPosterior = {
  offset: Posterior;
  uMedian: number;
  kMedian: number;
  k80: readonly [number, number];
  kWidthRatio: number;
  /** Posterior correlation between offset and u (information joint, before the structural floor). */
  correlation: number;
  edgeMass: { kLowerBin: number; kUpperBin: number; kLower3: number; kUpper3: number; offsetLow5: number; offsetHigh5: number };
};

function priorProbabilities(u: readonly number[], prior: BiasPrior): number[] {
  const lp = u.map((x) => -0.5 * ((x - prior.meanU) / prior.sdU) ** 2);
  const norm = logSumExp(lp);
  return lp.map((v) => Math.exp(v - norm));
}

/** 80 percent interval of k from probabilities on the u grid (k decreases with u). */
function k80From(u: readonly number[], probs: readonly number[]): readonly [number, number] {
  const lo = gridQuantile(u, probs, 0.1);
  const hi = gridQuantile(u, probs, 0.9);
  return [kOf(hi), kOf(lo)];
}

export function jointPosterior(slices: JointSlices, prior: BiasPrior, structuralSdKcal = CALIBRATION_STRUCTURAL_SD_KCAL): JointPosterior {
  const offsets = offsetGrid();
  const u = slices.u;
  const logPriorU = priorProbabilities(u, prior).map(Math.log);
  const joint = slices.logPost.map((row, i) => row.map((lp) => lp + (logPriorU[i] as number)));
  const norm = logSumExp(joint.map((row) => logSumExp(row)));
  const p = joint.map((row) => row.map((lp) => Math.exp(lp - norm)));
  const pU = p.map((row) => row.reduce((s, v) => s + v, 0));
  const pO = offsets.map((_, j) => p.reduce((s, row) => s + (row[j] as number), 0));
  const offset = summarizeGridProbabilities(offsets, structuralSdKcal > 0 ? convolveGridProbabilities(offsets, pO, structuralSdKcal, slices.admissible) : pO);

  const meanU = u.reduce((s, x, i) => s + x * (pU[i] as number), 0);
  const meanO = offsets.reduce((s, o, j) => s + o * (pO[j] as number), 0);
  let cov = 0;
  let varU = 0;
  let varO = 0;
  p.forEach((row, i) => {
    const du = (u[i] as number) - meanU;
    row.forEach((v, j) => {
      const dO = (offsets[j] as number) - meanO;
      cov += v * du * dO;
      varU += v * du * du;
      varO += v * dO * dO;
    });
  });
  const correlation = varU > 0 && varO > 0 ? cov / Math.sqrt(varU * varO) : 0;
  const uMedian = gridQuantile(u, pU, 0.5);
  const k80 = k80From(u, pU);
  const prior80 = k80From(u, priorProbabilities(u, prior));
  const n = u.length;
  const sum = (arr: readonly number[], from: number, to: number) => arr.slice(from, to).reduce((s, v) => s + v, 0);
  return {
    offset,
    uMedian,
    kMedian: kOf(uMedian),
    k80,
    kWidthRatio: (k80[1] - k80[0]) / (prior80[1] - prior80[0]),
    correlation,
    // u = 0 is the lower bound of k (k = 1); u = -0.40 is the upper bound of k.
    edgeMass: {
      kLowerBin: pU[n - 1] as number,
      kUpperBin: pU[0] as number,
      kLower3: sum(pU, n - 3, n),
      kUpper3: sum(pU, 0, 3),
      offsetLow5: sum(pO, 0, 5),
      offsetHigh5: sum(pO, pO.length - 5, pO.length),
    },
  };
}

/** C-exact arm: the k = 1 slice (u = 0), i.e. the logged intake treated as exact. */
export function exactSlicePosterior(slices: JointSlices): Posterior {
  const index = slices.u.indexOf(0);
  return offsetPosteriorFrom(slices.logPost[index] as number[], slices.admissible);
}
