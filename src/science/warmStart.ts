/**
 * Warm start from historical intake evidence (IMPLEMENTATION_NOTES D-23, instruct/05 s17).
 *
 * population prior  +  historical personal evidence  =  initial personalised posterior
 *
 * The declared average intake is never taken as maintenance. For every candidate personal
 * offset on the calibration grid, the production Hall model (native TEF) is initialised in
 * steady state at the history start weight with maintenance = NASEM + offset, fed the declared
 * average intake for the declared duration, and the predicted weight change is compared with the
 * declared change. The Gaussian likelihood variance combines endpoint weigh-in noise with
 * kcal-domain uncertainty (intake reporting error by tracking quality, activity change, model
 * mismatch) mapped through the model's sensitivity.
 *
 * Model 1.2.0 (IMPLEMENTATION_NOTES D-29): the likelihood is computed on a dedicated evidence support
 * (same step, wider than the calibration grid, bounded below by the Hall admissible domain). The
 * coherence flag uses the exact root of predicted(offset) = observed and has no numerical effect; the
 * conflict statistic is the prior predictive tail probability of the observed change. The fused
 * posterior and the calibration handoff stay sampled on the calibration grid.
 */
import { offsetGrid, summarizeGridPosterior } from './calibration';
import type { Posterior } from './calibration';
import {
  CALIBRATION_GRID_STEP_KCAL,
  CALIBRATION_T_DF,
  CALIBRATION_T_SCALE_KG,
  SCIENTIFIC_MODEL_VERSION,
  WARM_START_ACTIVITY_CHANGE_SD_KCAL,
  WARM_START_CONFLICT_Z,
  WARM_START_EVIDENCE_SUPPORT_HALF_WIDTH_KCAL,
  WARM_START_INCOHERENT_OFFSET_BOUND,
  WARM_START_INTAKE_REL_SD_HIGH,
  WARM_START_INTAKE_REL_SD_LOW,
  WARM_START_INTAKE_REL_SD_MEDIUM,
  WARM_START_MAX_DAYS,
  WARM_START_MAX_INTAKE_KCAL,
  WARM_START_MEDIUM_MAX_WIDTH_RATIO,
  WARM_START_MIN_DAYS,
  WARM_START_MIN_INTAKE_KCAL,
  WARM_START_MODEL_SD_KCAL,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
  Z_80,
} from './constants';
import { isIsoDate } from './dates';
import { deltaClampBaselineIntakeKcal, initializeHall, isAdmissibleBaselineIntake, minAdmissibleBaselineIntakeKcal, simulateHall } from './hall/model';
import { logNormalCdf, logSumExp, normalQuantileFromLogCdf } from './normal';
import type { CalibrationSnapshot, ConfidenceLevel, HistoricalIntakeEvidence, SexForEquation, TrackingQuality } from './types';

export const INTAKE_REL_SD: Readonly<Record<TrackingQuality, number>> = {
  high: WARM_START_INTAKE_REL_SD_HIGH,
  medium: WARM_START_INTAKE_REL_SD_MEDIUM,
  low: WARM_START_INTAKE_REL_SD_LOW,
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type EvidenceIssue = { field: keyof HistoricalIntakeEvidence; code: 'out_of_range' | 'not_finite' | 'not_integer' | 'invalid' };

export function validateHistoricalEvidence(e: HistoricalIntakeEvidence): { ok: true } | { ok: false; issues: EvidenceIssue[] } {
  const issues: EvidenceIssue[] = [];
  const range = (field: keyof HistoricalIntakeEvidence, v: number, min: number, max: number) => {
    if (!Number.isFinite(v)) issues.push({ field, code: 'not_finite' });
    else if (v < min || v > max) issues.push({ field, code: 'out_of_range' });
  };
  if (e.evidenceVersion !== 1) issues.push({ field: 'evidenceVersion', code: 'invalid' });
  if (!isIsoDate(e.recordedOn)) issues.push({ field: 'recordedOn', code: 'invalid' });
  range('averageCaloriesKcal', e.averageCaloriesKcal, WARM_START_MIN_INTAKE_KCAL, WARM_START_MAX_INTAKE_KCAL);
  range('durationDays', e.durationDays, 1, WARM_START_MAX_DAYS);
  if (Number.isFinite(e.durationDays) && !Number.isInteger(e.durationDays)) issues.push({ field: 'durationDays', code: 'not_integer' });
  if (e.startWeightKg !== null) range('startWeightKg', e.startWeightKg, WEIGHT_MIN_KG, WEIGHT_MAX_KG);
  range('endWeightKg', e.endWeightKg, WEIGHT_MIN_KG, WEIGHT_MAX_KG);
  if (!['high', 'medium', 'low'].includes(e.trackingQuality)) issues.push({ field: 'trackingQuality', code: 'invalid' });
  if (typeof e.activityComparable !== 'boolean') issues.push({ field: 'activityComparable', code: 'invalid' });
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

// ---------------------------------------------------------------------------
// Likelihood
// ---------------------------------------------------------------------------

export type WarmStartModelInput = {
  sex: SexForEquation;
  ageYears: number;
  heightCm: number;
  /** NASEM TDEE at the history start weight, with the PAL category fixed at onboarding, kcal/day. */
  populationTdeeAtStartKcal: number;
  /** REE at the history start weight, kcal/day. */
  reeAtStartKcal: number;
  /** Carbohydrate share of the Hall baseline diet (maintenance plan composition, D-16). */
  baselineCarbFraction: number;
  /** High-quality measured fat mass at the history start weight, when available. */
  initialFatKg?: number | undefined;
  /** Population prior SD of the personal offset, kcal/day. */
  priorSigmaKcal: number;
  evidence: HistoricalIntakeEvidence;
};

export type WarmStartStatus = 'used' | 'invalid' | 'insufficient_duration' | 'missing_start_weight';

export type HistoricalLikelihood = {
  status: WarmStartStatus;
  /** Aligned with offsetGrid() (calibration handoff); -Infinity where excluded; null when the evidence is not used. */
  logLikelihood: number[] | null;
  observedChangeKg: number | null;
  /** Predicted weight change for each grid offset, kg (NaN where excluded, null when not used). */
  predictedChangeKg: number[] | null;
  /** d(predicted change)/d(offset), kg per kcal/day (negative). */
  sensitivityKgPerKcal: number | null;
  /** SD of the Gaussian likelihood of the observed change, kg. */
  likelihoodSdKg: number | null;
  /** Diagnostic approximation only: offset implied by the history, linearised around offset 0, kcal/day. */
  historyOnlyOffsetKcal: number | null;
  /** Diagnostic approximation only: SD of the linearised offset, kcal/day. */
  historyOnlySdKcal: number | null;
  /** Display and diagnostic signal only (exact rule, D-29): no effect on the likelihood, the fusion or the handoff. */
  incoherent: boolean;
  components: { endpointWeightSdKg: number; intakeSdKcal: number; activitySdKcal: number; modelSdKcal: number } | null;
  /** Dedicated evidence support of the likelihood (D-29); null when the evidence is not used. */
  evidenceSupport: EvidenceSupport | null;
  /** Exact solution of predicted(offset) = observed on the evidence support and the coherence interval (D-29). */
  exactRoot: ExactRoot | null;
  /** Admissible domain of the Hall initialisation and diagnostics (D-28); null when the evidence is not used. */
  hallDomain: HistoricalHallDomain | null;
};

export type EvidenceSupport = {
  offsetsKcal: number[];
  predictedChangeKg: number[];
  logLikelihood: number[];
  /** Offsets of [-half width, +half width] left out because NASEM + offset is outside the Hall admissible domain. */
  excludedByDomainCount: number;
};

export type ExactRoot = {
  /** Offset where the predicted change equals the observed change (linear interpolation between support points), null when outside the support. */
  rootOffsetKcal: number | null;
  position: 'inside_support' | 'below_support' | 'above_support';
  /** |root| - WARM_START_INCOHERENT_OFFSET_BOUND: positive when incoherent, null when the root lies outside the support. */
  distanceToBoundKcal: number | null;
  /** Observed changes explained by an offset inside [-bound, +bound]: [predicted(+bound), predicted(-bound)], kg. */
  coherenceIntervalKg: [number, number];
};

export type HistoricalHallDomain = {
  /** Baseline intake must be strictly greater than this value (B1), kcal/day. */
  minAdmissibleBaselineIntakeKcal: number;
  /** Calibration grid offsets excluded because NASEM + offset is not admissible (log-likelihood -Infinity). */
  excludedOffsetCount: number;
  /** Evidence support offsets excluded for the same reason. */
  supportExcludedOffsetCount: number;
  /** Diagnostic only (B2, not a filter): offset below which the Hall activity parameter delta is clamped at 0. */
  deltaClampOffsetKcal: number;
  /** Evidence support offset of the largest historical log-likelihood (first one on ties). */
  likelihoodArgmaxOffsetKcal: number;
  /** likelihoodArgmaxOffsetKcal - deltaClampOffsetKcal: negative when the maximum lies where delta is clamped. */
  argmaxMinusDeltaClampKcal: number;
};

/** Offsets of the evidence support: multiples of the grid step in [-half width, +half width] with an admissible Hall baseline. */
export function evidenceSupportOffsets(populationTdeeAtStartKcal: number): { offsetsKcal: number[]; excludedByDomainCount: number } {
  const offsetsKcal: number[] = [];
  let excludedByDomainCount = 0;
  const steps = Math.round(WARM_START_EVIDENCE_SUPPORT_HALF_WIDTH_KCAL / CALIBRATION_GRID_STEP_KCAL);
  for (let k = -steps; k <= steps; k++) {
    const offset = k * CALIBRATION_GRID_STEP_KCAL;
    if (isAdmissibleBaselineIntake(populationTdeeAtStartKcal + offset)) offsetsKcal.push(offset);
    else excludedByDomainCount++;
  }
  return { offsetsKcal, excludedByDomainCount };
}

/**
 * Exact coherence rule (D-29): incoherent if and only if the observed change lies outside
 * [predicted(+bound), predicted(-bound)], i.e. no offset inside [-bound, +bound] explains it.
 * When -bound or +bound is outside the Hall admissible domain, the closest admissible support offset inside
 * the bounds is used (no admissible offset explains changes beyond it). Throws when none lies inside the bounds.
 */
export function exactCoherence(offsets: readonly number[], predictedChangeKg: readonly number[], observedChangeKg: number, boundKcal: number): { incoherent: boolean; root: ExactRoot } {
  const inside = offsets.map((o, i) => [o, i] as const).filter(([o]) => o >= -boundKcal && o <= boundKcal);
  const first = inside[0];
  const last = inside[inside.length - 1];
  if (!first || !last) throw new Error(`no admissible offset inside [-${boundKcal}, +${boundKcal}] kcal/day`);
  const atPlus = predictedChangeKg[last[1]] as number;
  const atMinus = predictedChangeKg[first[1]] as number;
  const lo = Math.min(atPlus, atMinus);
  const hi = Math.max(atPlus, atMinus);
  const incoherent = !(observedChangeKg >= lo && observedChangeKg <= hi);
  let rootOffsetKcal: number | null = null;
  for (let i = 1; i < offsets.length && rootOffsetKcal === null; i++) {
    const a = (predictedChangeKg[i - 1] as number) - observedChangeKg;
    const b = (predictedChangeKg[i] as number) - observedChangeKg;
    if (a === 0) rootOffsetKcal = offsets[i - 1] as number;
    else if (a * b <= 0) rootOffsetKcal = (offsets[i - 1] as number) + ((offsets[i] as number) - (offsets[i - 1] as number)) * (a / (a - b));
  }
  // Predicted change decreases with the offset: an observed change above every prediction needs a lower offset.
  const position: ExactRoot['position'] = rootOffsetKcal !== null ? 'inside_support' : observedChangeKg > (predictedChangeKg[0] as number) ? 'below_support' : 'above_support';
  return {
    incoherent,
    root: { rootOffsetKcal, position, distanceToBoundKcal: rootOffsetKcal === null ? null : Math.abs(rootOffsetKcal) - boundKcal, coherenceIntervalKg: [atPlus, atMinus] },
  };
}

/**
 * Prior predictive conflict statistic (D-29). The observed change is compared with its prior predictive
 * distribution, the mixture sum_o prior(o) Normal(predicted(o), sdKg^2) on the support. The sign follows the
 * former linearised z (negative when the history points to a lower maintenance):
 * z = Phi^-1(P(change >= observed)) = -Phi^-1(P(change <= observed)). For a linear model it equals the linearised z.
 */
export function predictiveConflictZ(offsets: readonly number[], predictedChangeKg: readonly number[], sdKg: number, priorSigmaKcal: number, observedChangeKg: number): number {
  const logPrior = offsets.map((o) => -0.5 * (o / priorSigmaKcal) ** 2);
  const norm = logSumExp(logPrior);
  const logAtLeast = logSumExp(offsets.map((_, i) => (logPrior[i] as number) - norm + logNormalCdf(((predictedChangeKg[i] as number) - observedChangeKg) / sdKg)));
  const logAtMost = logSumExp(offsets.map((_, i) => (logPrior[i] as number) - norm + logNormalCdf((observedChangeKg - (predictedChangeKg[i] as number)) / sdKg)));
  return logAtLeast <= logAtMost ? normalQuantileFromLogCdf(logAtLeast) : -normalQuantileFromLogCdf(logAtMost);
}

export type EdgeMass = { lower5: number; lower10: number; upper5: number; upper10: number };

/** Probability mass in the first and last 5 and 10 bins of a normalised distribution. */
export function edgeMass(probabilities: readonly number[]): EdgeMass {
  const sum = (from: number, to: number) => probabilities.slice(from, to).reduce((s, p) => s + p, 0);
  const n = probabilities.length;
  return { lower5: sum(0, 5), lower10: sum(0, 10), upper5: sum(n - 5, n), upper10: sum(n - 10, n) };
}

/**
 * Value of a per-offset array at one grid offset. Throws when the offset is absent from the support or excluded,
 * instead of reading undefined and propagating a silent NaN.
 */
export function valueAtOffset(offsets: readonly number[], values: readonly number[], offsetKcal: number): number {
  const index = offsets.indexOf(offsetKcal);
  if (index < 0) throw new Error(`offset ${offsetKcal} kcal/day is missing from the offset support`);
  const value = values[index] as number;
  if (!Number.isFinite(value)) throw new Error(`offset ${offsetKcal} kcal/day is excluded from the offset support`);
  return value;
}

/** SD of one weigh-in around the true weight, from the calibration Student-t noise model (scale 0.6 kg, df 4). */
export function endpointWeightSdKg(): number {
  return CALIBRATION_T_SCALE_KG * Math.sqrt(CALIBRATION_T_DF / (CALIBRATION_T_DF - 2));
}

function notUsed(status: WarmStartStatus, observedChangeKg: number | null = null): HistoricalLikelihood {
  return {
    status,
    logLikelihood: null,
    observedChangeKg,
    predictedChangeKg: null,
    sensitivityKgPerKcal: null,
    historyOnlyOffsetKcal: null,
    likelihoodSdKg: null,
    historyOnlySdKcal: null,
    incoherent: false,
    components: null,
    evidenceSupport: null,
    exactRoot: null,
    hallDomain: null,
  };
}

export function historicalLikelihood(input: WarmStartModelInput): HistoricalLikelihood {
  const e = input.evidence;
  if (!validateHistoricalEvidence(e).ok) return notUsed('invalid');
  if (e.startWeightKg === null) return notUsed('missing_start_weight');
  const observedChangeKg = e.endWeightKg - e.startWeightKg;
  if (e.durationDays < WARM_START_MIN_DAYS) return notUsed('insufficient_duration', observedChangeKg);

  const startWeight = e.startWeightKg;
  // Evidence support: offsets whose baseline intake is outside the Hall admissible domain are excluded, never simulated (D-28).
  const support = evidenceSupportOffsets(input.populationTdeeAtStartKcal);
  const offsets = support.offsetsKcal;
  const predictedOnSupport = offsets.map((offset) => {
    const p = initializeHall({
      sex: input.sex,
      ageYears: input.ageYears,
      heightM: input.heightCm / 100,
      bodyWeightKg: startWeight,
      baselineIntakeKcal: input.populationTdeeAtStartKcal + offset,
      baselineRmrKcal: input.reeAtStartKcal,
      initialFatKg: input.initialFatKg,
      baselineCarbFraction: input.baselineCarbFraction,
    });
    // Composition of the history diet is unknown: same carbohydrate share as the baseline diet.
    const u = { intakeKcal: e.averageCaloriesKcal, carbKcal: input.baselineCarbFraction * e.averageCaloriesKcal, paDeltaKcalPerKgDay: 0, sodiumDeltaMg: 0 };
    const r = simulateHall(p, e.durationDays, () => u, { recordEveryDays: e.durationDays });
    return (r.days[r.days.length - 1]?.bodyWeightKg ?? Number.NaN) - startWeight;
  });

  const at = (offset: number) => valueAtOffset(offsets, predictedOnSupport, offset);
  const sensitivityKgPerKcal = (at(100) - at(-100)) / 200;
  const intakeSdKcal = INTAKE_REL_SD[e.trackingQuality] * e.averageCaloriesKcal;
  const activitySdKcal = e.activityComparable ? 0 : WARM_START_ACTIVITY_CHANGE_SD_KCAL;
  const modelSdKcal = WARM_START_MODEL_SD_KCAL;
  const kcalVariance = intakeSdKcal ** 2 + activitySdKcal ** 2 + modelSdKcal ** 2;
  const weightSd = endpointWeightSdKg();
  // Two independent endpoint weigh-ins. No inflation of any kind: the coherence flag has no numerical effect (D-29).
  const sdKg = Math.sqrt(2 * weightSd ** 2 + sensitivityKgPerKcal ** 2 * kcalVariance);

  // Linearised offset: diagnostic approximation only, used by no decision since model 1.2.0.
  const historyOnlyOffsetKcal = (observedChangeKg - at(0)) / sensitivityKgPerKcal;
  const { incoherent, root } = exactCoherence(offsets, predictedOnSupport, observedChangeKg, WARM_START_INCOHERENT_OFFSET_BOUND);

  const logLikelihoodOnSupport = predictedOnSupport.map((pred) => -0.5 * ((observedChangeKg - pred) / sdKg) ** 2);
  // Calibration grid handoff: same values sampled at the grid offsets (grid and support share the step and the origin).
  const indexOf = new Map(offsets.map((o, i) => [o, i]));
  const grid = offsetGrid();
  const gridIndices = grid.map((o) => indexOf.get(o));
  const logLikelihood = gridIndices.map((i) => (i === undefined ? Number.NEGATIVE_INFINITY : (logLikelihoodOnSupport[i] as number)));
  const predictedChangeKg = gridIndices.map((i) => (i === undefined ? Number.NaN : (predictedOnSupport[i] as number)));

  let argmax = 0;
  for (let i = 1; i < logLikelihoodOnSupport.length; i++) if ((logLikelihoodOnSupport[i] as number) > (logLikelihoodOnSupport[argmax] as number)) argmax = i;
  const deltaClampOffsetKcal = deltaClampBaselineIntakeKcal(input.reeAtStartKcal) - input.populationTdeeAtStartKcal;
  const likelihoodArgmaxOffsetKcal = offsets[argmax] as number;
  return {
    status: 'used',
    logLikelihood,
    observedChangeKg,
    predictedChangeKg,
    sensitivityKgPerKcal,
    likelihoodSdKg: sdKg,
    historyOnlyOffsetKcal,
    historyOnlySdKcal: sdKg / Math.abs(sensitivityKgPerKcal),
    incoherent,
    components: { endpointWeightSdKg: weightSd, intakeSdKcal, activitySdKcal, modelSdKcal },
    evidenceSupport: { offsetsKcal: offsets, predictedChangeKg: predictedOnSupport, logLikelihood: logLikelihoodOnSupport, excludedByDomainCount: support.excludedByDomainCount },
    exactRoot: root,
    hallDomain: {
      minAdmissibleBaselineIntakeKcal: minAdmissibleBaselineIntakeKcal(),
      excludedOffsetCount: gridIndices.filter((i) => i === undefined).length,
      supportExcludedOffsetCount: support.excludedByDomainCount,
      deltaClampOffsetKcal,
      likelihoodArgmaxOffsetKcal,
      argmaxMinusDeltaClampKcal: likelihoodArgmaxOffsetKcal - deltaClampOffsetKcal,
    },
  };
}

// ---------------------------------------------------------------------------
// Posterior
// ---------------------------------------------------------------------------

export type WarmStartResult = {
  status: WarmStartStatus;
  likelihood: HistoricalLikelihood;
  /** Initial posterior of the personal offset (population prior alone when the history is not used). */
  posterior: Posterior;
  /**
   * Observability only (no effect on the plan): the historical likelihood normalised on the evidence support
   * with a flat prior, i.e. what the history suggests on its own. Null when unused.
   */
  historyOnly: Posterior | null;
  /** Probability mass at the edges of the history-only distribution, on the calibration grid and on the evidence support. */
  historyOnlyEdgeMass: { grid: EdgeMass; evidenceSupport: EdgeMass } | null;
  /** NASEM TDEE at the history start weight: offsets above are relative to it. */
  populationTdeeAtStartKcal: number;
  priorSigmaKcal: number;
  /** History-only estimate far from the population prior: shown, never hidden. */
  conflict: boolean;
  conflictZ: number | null;
  /** 'medium' at most: a warm start never replaces Wheighty's own weigh-ins. */
  confidence: ConfidenceLevel;
};

export function populationPriorLogDensity(priorSigmaKcal: number): number[] {
  return offsetGrid().map((o) => -0.5 * (o / priorSigmaKcal) ** 2);
}

export function warmStartPosterior(input: WarmStartModelInput): WarmStartResult {
  const likelihood = historicalLikelihood(input);
  const offsets = offsetGrid();
  const prior = populationPriorLogDensity(input.priorSigmaKcal);
  const history = likelihood.logLikelihood;
  const posterior = summarizeGridPosterior(offsets, history ? prior.map((lp, i) => lp + (history[i] as number)) : prior);

  let conflictZ: number | null = null;
  let confidence: ConfidenceLevel = 'low';
  const support = likelihood.evidenceSupport;
  if (likelihood.status === 'used' && support && likelihood.likelihoodSdKg !== null && likelihood.observedChangeKg !== null) {
    conflictZ = predictiveConflictZ(support.offsetsKcal, support.predictedChangeKg, likelihood.likelihoodSdKg, input.priorSigmaKcal, likelihood.observedChangeKg);
    const priorWidth = 2 * Z_80 * input.priorSigmaKcal;
    const width = posterior.interval80[1] - posterior.interval80[0];
    if (width <= WARM_START_MEDIUM_MAX_WIDTH_RATIO * priorWidth) confidence = 'medium';
  }
  const historyOnly = support ? summarizeGridPosterior(support.offsetsKcal, support.logLikelihood) : null;
  return {
    status: likelihood.status,
    likelihood,
    posterior,
    historyOnly,
    historyOnlyEdgeMass: history && historyOnly ? { grid: edgeMass(summarizeGridPosterior(offsets, history).probabilities), evidenceSupport: edgeMass(historyOnly.probabilities) } : null,
    populationTdeeAtStartKcal: input.populationTdeeAtStartKcal,
    priorSigmaKcal: input.priorSigmaKcal,
    conflict: conflictZ !== null && Math.abs(conflictZ) >= WARM_START_CONFLICT_Z,
    conflictZ,
    confidence,
  };
}

/** Snapshot persisted when a warm start is applied to the initial plan (no weigh-in involved). */
export function buildWarmStartSnapshot(result: WarmStartResult, populationTdeeKcal: number, createdAt: string): CalibrationSnapshot {
  const p = result.posterior;
  return {
    scientificModelVersion: SCIENTIFIC_MODEL_VERSION,
    createdAt,
    posteriorMeanOffsetKcal: p.meanKcal,
    posteriorMedianOffsetKcal: p.medianKcal,
    interval80: p.interval80,
    interval95: p.interval95,
    calibratedTdeeMedian: populationTdeeKcal + p.medianKcal,
    validWeightCount: 0,
    observationSpanDays: 0,
    confidence: result.confidence,
    populationTdeeKcal,
    appliedAt: createdAt,
    source: 'warm_start',
  };
}
