/**
 * Journal regime of the calibration: PROTOTYPE for the measurement battery of prompt 34, phase 1.
 *
 * Reachable only through an explicit option passed by tests: nothing in the store, the worker or the UI imports this
 * module (static test), so the production calibration (`computeCalibrationState`) is unchanged. It never reads the
 * journal itself: the journal reaches the science through `intakeObservationsFrom` only (D8).
 *
 * Journal regime (s3.3 to s3.5):
 * - the window starts at the first valid weigh-in dated on or after `journalRegimeStart`; NASEM, REE and the prior SD
 *   are taken at that weigh-in, as the production path does for the first weigh-in;
 * - the warm-start history likelihood is not added (`includeWarmStartHistory`, default false, provisional choice);
 * - gate: usable-day coverage and "clean" weigh-ins judged on non-usable days, with the existing constants;
 * - prior: `nasem` (default, unchanged), `flat` (null log-prior on the grid) or `widened` (measurement N4 only).
 */
import { assessBaseline, planContextFrom } from '@/science/assessment';
import { buildSnapshot, fitCalibration, validWeights } from '@/science/calibration';
import type { CalibrationFit, CalibrationInput, GateStatus, IntakeObservation } from '@/science/calibration';
import {
  GATE_MAJOR_DOMINATION_FRACTION,
  GATE_MIN_ADHERENCE_COVERAGE,
  GATE_MIN_CLEAN_WEIGHINS,
  GATE_MIN_SPAN_DAYS,
  GATE_MIN_WEIGHINS,
  HALL_BODY_FAT_MIN_QUALITY,
} from '@/science/constants';
import { addDays, daysBetween } from '@/science/dates';
import { baselineCarbFractionFor } from '@/science/goals';
import { BODY_FAT_QUALITY } from '@/science/ree';
import type { CalibrationSnapshot, WeightEntry } from '@/science/types';
import { storedWarmStart } from './engine';
import { intakeObservationsFrom } from './intakeObservations';
import type { UsabilityRule } from './intakeObservations';
import type { WheightyStore } from './types';

export type JournalPrior = 'nasem' | 'flat' | 'widened';

export type JournalRegimeOptions = {
  journalRegimeStart: string;
  usabilityRule: UsabilityRule;
  /** Evidence weight of a non-usable day, 0.5 or 0; no implicit default. */
  nonUsableDayWeight: 0.5 | 0;
  /** Default false (provisional choice, s3.3). */
  includeWarmStartHistory?: boolean;
  /** Default 'nasem'. 'flat' and 'widened' are reserved to measurement N4. */
  journalPrior?: JournalPrior;
  /** Measurement N1 only. */
  carbSource?: 'baseline' | 'harness_scaled';
  /** Benchmarks only: overrides the structural floor (D-33), e.g. 0 for measurement N3. */
  structuralSdKcal?: number;
};

/** Relative width added to the NASEM prior by the 'widened' prior: 10 percent of NASEM at the window start (s3.5). */
const WIDENED_PRIOR_NASEM_FRACTION = 0.1;

export type JournalCalibrationInput = {
  input: CalibrationInput;
  observations: IntakeObservation[];
  /** First valid weigh-in on or after the regime start, and last valid weigh-in. */
  windowStart: string;
  windowEnd: string;
  /** Prior SD of the population prior at the window start (before any widening), kcal/day. */
  nasemSigmaKcal: number;
};

/** Valid weigh-ins of the regime: dated on or after `journalRegimeStart` (one per day, bounded, D-10). */
function regimeWeights(store: WheightyStore, journalRegimeStart: string): WeightEntry[] {
  return validWeights(store.weights.filter((w) => w.date >= journalRegimeStart));
}

export function journalCalibrationInputFromStore(store: WheightyStore, today: string, options: JournalRegimeOptions): JournalCalibrationInput | null {
  const profile = store.profile;
  if (!profile) return null;
  const weights = regimeWeights(store, options.journalRegimeStart);
  const first = weights[0];
  const last = weights[weights.length - 1];
  if (!first || !last) return null;
  const palCategory = store.meta.initialPalCategory ?? store.plan?.palCategory;
  const assessment = assessBaseline(profile, today, { weightKg: first.weightKg, ...(palCategory ? { palCategory } : {}) });
  const context = planContextFrom(profile, { ...assessment }, assessment.populationTdeeKcal);
  const hq = profile.bodyFatMethod !== undefined && profile.bodyFatPercent !== undefined && BODY_FAT_QUALITY[profile.bodyFatMethod] >= HALL_BODY_FAT_MIN_QUALITY;
  const nasemSigmaKcal = assessment.sigma.sigmaKcal;
  const prior = options.journalPrior ?? 'nasem';
  // Flat: an infinite SD makes -0.5 (offset / sigma)^2 exactly zero on the whole grid.
  const priorSigmaKcal =
    prior === 'flat' ? Number.POSITIVE_INFINITY : prior === 'widened' ? Math.sqrt(nasemSigmaKcal ** 2 + (WIDENED_PRIOR_NASEM_FRACTION * assessment.populationTdeeKcal) ** 2) : nasemSigmaKcal;
  // Observations cover the window plus the 14-day look-back of the imputation of non-usable days.
  const observations = intakeObservationsFrom(store, addDays(first.date, -14), last.date, options.usabilityRule);
  const history = options.includeWarmStartHistory === true ? storedWarmStart(store) : null;
  const input: CalibrationInput = {
    sex: profile.sexForEquation,
    ageYears: profile.ageYears,
    heightCm: profile.heightCm,
    walkingPace: profile.walkingPace,
    populationTdeeAtStartKcal: assessment.populationTdeeKcal,
    reeAtStartKcal: assessment.ree.reeKcalDay,
    maintenanceStepsPerDay: profile.averageSteps7d,
    ...(hq ? { initialFatKg: (first.weightKg * (profile.bodyFatPercent as number)) / 100 } : {}),
    priorSigmaKcal,
    baselineCarbFraction: baselineCarbFractionFor(context, store.plan?.goal ?? profile.goal),
    weights: store.weights.filter((w) => w.date >= first.date),
    dailyLogs: store.dailyLogs,
    ...(history?.likelihood.logLikelihood ? { historicalLogLikelihood: history.likelihood.logLikelihood } : {}),
    ...(options.structuralSdKcal !== undefined ? { structuralSdKcal: options.structuralSdKcal } : {}),
    intakeObservations: { days: observations, nonUsableDayWeight: options.nonUsableDayWeight, ...(options.carbSource ? { carbSource: options.carbSource } : {}) },
  };
  return { input, observations, windowStart: first.date, windowEnd: last.date, nasemSigmaKcal };
}

/**
 * Gate of the journal regime (s3.4), same structure and constants as `evaluateGate` (05 s8, D-11):
 * - coverage = usable days / window days (first to last weigh-in, both included, as the adherence coverage);
 * - a weigh-in is clean when at most 50 percent of the days of its window are non-usable.
 * Field mapping: `adherenceCoverage` holds the usable-day coverage, `trackedDays` the usable days and
 * `majorDeviationFraction` the non-usable share of the window days.
 */
export function evaluateJournalGate(weights: readonly WeightEntry[], observations: readonly IntakeObservation[]): GateStatus {
  const valid = validWeights(weights);
  const first = valid[0];
  const last = valid[valid.length - 1];
  const spanDays = first && last ? daysBetween(first.date, last.date) : 0;
  const usable = new Map(observations.map((o) => [o.date, o.usable]));
  let cleanWeighInCount = 0;
  valid.forEach((w, i) => {
    if (i === 0) {
      cleanWeighInCount++;
      return;
    }
    const prev = valid[i - 1];
    if (!prev) return;
    const windowDays = daysBetween(prev.date, w.date);
    let nonUsable = 0;
    for (let d = 0; d < windowDays; d++) if (usable.get(addDays(prev.date, d)) !== true) nonUsable++;
    if (!(windowDays > 0 && nonUsable / windowDays > GATE_MAJOR_DOMINATION_FRACTION)) cleanWeighInCount++;
  });
  let totalDays = 0;
  let usableDays = 0;
  if (first && last) {
    for (let d = 0; d <= spanDays; d++) {
      totalDays++;
      if (usable.get(addDays(first.date, d)) === true) usableDays++;
    }
  }
  const coverage = totalDays > 0 ? usableDays / totalDays : 0;
  const criteria = {
    enoughWeighIns: valid.length >= GATE_MIN_WEIGHINS,
    enoughSpan: spanDays >= GATE_MIN_SPAN_DAYS,
    enoughCleanWeighIns: cleanWeighInCount >= GATE_MIN_CLEAN_WEIGHINS,
    enoughAdherenceInfo: coverage >= GATE_MIN_ADHERENCE_COVERAGE,
  };
  return {
    met: criteria.enoughWeighIns && criteria.enoughSpan && criteria.enoughCleanWeighIns && criteria.enoughAdherenceInfo,
    weighInCount: valid.length,
    spanDays,
    cleanWeighInCount,
    adherenceCoverage: coverage,
    majorDeviationFraction: totalDays > 0 ? (totalDays - usableDays) / totalDays : 0,
    trackedDays: usableDays,
    criteria,
  };
}

export type JournalCalibrationState = {
  gate: GateStatus;
  fit: CalibrationFit | null;
  candidate: CalibrationSnapshot | null;
  prepared: JournalCalibrationInput;
};

/** Journal-regime counterpart of the calibration part of `computeCalibrationState`, for measurement only. */
export function computeJournalCalibration(store: WheightyStore, today: string, nowIso: string, options: JournalRegimeOptions): JournalCalibrationState | null {
  const prepared = journalCalibrationInputFromStore(store, today, options);
  if (!prepared) return null;
  const gate = evaluateJournalGate(prepared.input.weights, prepared.observations);
  const fit = gate.weighInCount >= 2 ? fitCalibration(prepared.input) : null;
  const candidate = fit ? buildSnapshot(fit, gate, prepared.input.populationTdeeAtStartKcal, nowIso) : null;
  return { gate, fit, candidate, prepared };
}
