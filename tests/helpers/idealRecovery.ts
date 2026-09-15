/**
 * Ideal-world calibration recovery benchmark (instruct/06 s13, IMPLEMENTATION_NOTES T-03), shared by the 28/42-day
 * and the 84/120-day tests. The truth is the apparent maintenance offset, the estimand of the calibration (D-31);
 * the metabolic offset is reported alongside.
 *
 * Documented simulator assumptions: Student-t(4) weight noise with 0.5 kg scale (SD ~0.71 kg), minor deviations
 * +150..350 kcal, 4 percent major days +700..1200 kcal, 20 percent unreported days, 60 percent of days with logged
 * steps (step noise SD 20 percent). The world uses the same Hall model with a shifted maintenance.
 */
import { fitCalibration } from '@/science/calibration';
import type { UserProfile } from '@/science/types';
import { createRng } from './random';
import { simulateSyntheticUser } from './syntheticUser';

const PROFILES: UserProfile[] = [
  { ageYears: 34, sexForEquation: 'female', heightCm: 168, currentWeightKg: 74, averageSteps7d: 7500, walkingPace: 'normal', occupation: 'seated', activities: [], goal: 'loss', targetWeightKg: 66, weeklyRateTarget: 0.005 },
  { ageYears: 45, sexForEquation: 'male', heightCm: 180, currentWeightKg: 95, averageSteps7d: 6000, walkingPace: 'normal', occupation: 'mixed', activities: [{ type: 'running', sessionsPerWeek: 2, durationMin: 40, intensity: 'moderate' }], goal: 'loss', targetWeightKg: 85, weeklyRateTarget: 0.005 },
  { ageYears: 27, sexForEquation: 'male', heightCm: 176, currentWeightKg: 70, averageSteps7d: 9000, walkingPace: 'brisk', occupation: 'standing', activities: [{ type: 'strength', sessionsPerWeek: 3, durationMin: 60, intensity: 'moderate' }], goal: 'gain', targetWeightKg: 75, weeklyRateTarget: 0.0025 },
];
const OFFSETS = [-500, -300, -150, 0, 150, 300, 500];
const FREQUENCIES = [1, 3];
const MINOR = [0, 0.1, 0.25];
/** Simulated days: long enough for every horizon, so all horizons share the same simulated users. */
const SIMULATED_DAYS = 120;

export const IDEAL_RECOVERY_USERS = OFFSETS.length * FREQUENCIES.length * MINOR.length * PROFILES.length;

export type RecoveryRow = { error: number; in80: boolean; in95: boolean; width80: number; weights: number };

export function runIdealRecovery(horizons: readonly number[]): { rows: Record<number, RecoveryRow[]>; metabolicRows: Record<number, RecoveryRow[]> } {
  const rows: Record<number, RecoveryRow[]> = {};
  const metabolicRows: Record<number, RecoveryRow[]> = {};
  for (const h of horizons) {
    rows[h] = [];
    metabolicRows[h] = [];
  }
  let seed = 1000;
  for (const trueOffsetKcal of OFFSETS) {
    for (const weighEveryDays of FREQUENCIES) {
      for (const minorDeviationFraction of MINOR) {
        for (const profile of PROFILES) {
          const run = simulateSyntheticUser(
            profile,
            { trueOffsetKcal, weighEveryDays, minorDeviationFraction, majorDeviationFraction: 0.04, unreportedFraction: 0.2, stepLogProbability: 0.6, days: SIMULATED_DAYS, noiseScaleKg: 0.5, minorExtraKcal: [150, 350], majorExtraKcal: [700, 1200] },
            createRng(seed++),
          );
          for (const h of horizons) {
            const fit = fitCalibration(run.calibrationInputFor(h));
            if (!fit) throw new Error('fit failed');
            const [l80, u80] = fit.posterior.interval80;
            const [l95, u95] = fit.posterior.interval95;
            const row = (truth: number): RecoveryRow => ({ error: fit.posterior.medianKcal - truth, in80: truth >= l80 && truth <= u80, in95: truth >= l95 && truth <= u95, width80: u80 - l80, weights: fit.validWeightCount });
            rows[h]?.push(row(run.apparentOffsetKcal(h)));
            metabolicRows[h]?.push(row(trueOffsetKcal));
          }
        }
      }
    }
  }
  return { rows, metabolicRows };
}
