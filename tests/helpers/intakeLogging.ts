/**
 * Intake logging benchmark (handoff prompt 26): what the calibration estimator would receive if users logged their
 * real daily intake. Measurement only: the production estimator (`fitCalibration`) is used unchanged.
 *
 * Experimental input path: a logged day is handed to the estimator through the existing DailyLog fields
 * (`calorieTargetForDay` = logged intake, macros scaled by logged / target, `adherence: 'on_plan'` so the day keeps
 * full evidence weight). Unlogged days keep arm A behaviour (target + declared adherence). No production line changes.
 *
 * Imperfection model (arm C), every parameter explicit:
 *   logged = true intake x (1 + underReportBias) x (1 + residualNoiseSd x z_day), on a share `dailyCoverage` of days.
 * The bias is systematic per simulated user; the estimator never receives it.
 */
import { CALIBRATION_STRUCTURAL_SD_KCAL } from '@/science/constants';
import type { CalibrationInput } from '@/science/calibration';
import { daysBetween } from '@/science/dates';
import type { DailyLog } from '@/science/types';
import type { Rng } from './random';

export type LoggingImperfection = {
  /** Multiplicative, systematic per user: -0.2 logs 20 percent less than eaten. */
  underReportBias: number;
  /** Share of days actually logged, in [0, 1]. */
  dailyCoverage: number;
  /** SD of the multiplicative residual noise of one logged day. */
  residualNoiseSd: number;
};

export const PERFECT_LOGGING: LoggingImperfection = { underReportBias: 0, dailyCoverage: 1, residualNoiseSd: 0 };
export const PROMPT_26_BIASES = [0, -0.1, -0.2] as const;
export const PROMPT_26_COVERAGES = [1, 0.85, 0.7] as const;
export const PROMPT_26_RESIDUAL_NOISE_SD = 0.08;

/**
 * Per-day random draws of the logging process, drawn once per simulated user from a dedicated RNG so that the world
 * is identical across arms, and so that coverage masks are nested (a day logged at 70 percent is logged at 85 percent)
 * and the residual noise is shared by every imperfection cell.
 */
export type LoggingDraws = { coverageU: number[]; noiseZ: number[] };

export function drawLogging(days: number, rng: Rng): LoggingDraws {
  const coverageU: number[] = [];
  const noiseZ: number[] = [];
  for (let d = 0; d < days; d++) {
    coverageU.push(rng.next());
    noiseZ.push(rng.normal());
  }
  return { coverageU, noiseZ };
}

/** Logged intake per day (null when the day is not logged). */
export function applyImperfection(trueIntakeKcal: readonly number[], draws: LoggingDraws, imp: LoggingImperfection): Array<number | null> {
  return trueIntakeKcal.map((kcal, d) => {
    if ((draws.coverageU[d] as number) >= imp.dailyCoverage) return null;
    return Math.max(0, kcal * (1 + imp.underReportBias) * (1 + imp.residualNoiseSd * (draws.noiseZ[d] as number)));
  });
}

/** Calibration input where logged days carry the logged intake; unlogged days are left untouched (arm A behaviour). */
export function withLoggedIntake(input: CalibrationInput, startDate: string, logged: ReadonlyArray<number | null>): CalibrationInput {
  const dailyLogs: DailyLog[] = input.dailyLogs.map((log) => {
    const kcal = logged[daysBetween(startDate, log.date)];
    if (kcal === null || kcal === undefined) return log;
    const ratio = kcal / log.calorieTargetForDay;
    const macros = log.macrosForDay;
    return {
      ...log,
      calorieTargetForDay: kcal,
      adherence: 'on_plan',
      ...(macros ? { macrosForDay: { proteinG: macros.proteinG * ratio, carbsG: macros.carbsG * ratio, fatG: macros.fatG * ratio } } : {}),
    };
  });
  return { ...input, dailyLogs };
}

/** Intake the estimator assumes on each day of the window: the logged value, else the day's target. */
export function assumedIntakeKcal(input: CalibrationInput, startDate: string, days: number): number[] {
  const out = new Array<number>(days).fill(Number.NaN);
  for (const log of input.dailyLogs) {
    const d = daysBetween(startDate, log.date);
    if (d >= 0 && d < days) out[d] = log.calorieTargetForDay;
  }
  return out;
}

/**
 * Arm-specific apparent offset (generalised D-31): window-mean metabolic offset minus the mean intake eaten above the
 * intake the estimator assumes. For arm A it equals `apparentOffsetKcal`; for a perfect log it equals the metabolic offset.
 */
export function armApparentOffsetKcal(metabolicMeanOffsetKcal: number, trueIntakeKcal: readonly number[], assumed: readonly number[], days: number): number {
  let excess = 0;
  for (let d = 0; d < days; d++) excess += (trueIntakeKcal[d] as number) - (assumed[d] as number);
  return metabolicMeanOffsetKcal - excess / days;
}

/**
 * Sensitivity variant only (arm C+sigma), NOT a validated sigma: kcal-domain uncertainty of a systematic relative
 * logging error, from observables only (mean logged intake and share of logged days over the window) and a declared
 * tracking quality mapped to the existing warm-start constant. Added in quadrature to the structural floor through the
 * existing test override `structuralSdKcal`.
 */
export function observableLoggingSdKcal(logged: ReadonlyArray<number | null>, declaredRelSd: number): number {
  const values = logged.filter((v): v is number => v !== null);
  if (values.length === 0) return 0;
  const meanLogged = values.reduce((s, v) => s + v, 0) / values.length;
  return declaredRelSd * meanLogged * (values.length / logged.length);
}

export function withLoggingSigma(input: CalibrationInput, loggingSdKcal: number): CalibrationInput {
  return { ...input, structuralSdKcal: Math.sqrt(CALIBRATION_STRUCTURAL_SD_KCAL ** 2 + loggingSdKcal ** 2) };
}
