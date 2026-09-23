/**
 * Non-regression capture (prompt 34 s3.8), T-03: every fit of the ideal benchmark at 28, 42, 84 and 120 days,
 * same loop, seeds and settings as tests/helpers/idealRecovery.ts, full CalibrationFit (both posteriors, all grid values).
 */
import { expect, it } from 'vitest';
import { fitCalibration } from '@/science/calibration';
import type { UserProfile } from '@/science/types';
import { createRng } from '../../helpers/random';
import { simulateSyntheticUser } from '../../helpers/syntheticUser';
import { writeCapture } from './serialize';

const PROFILES: UserProfile[] = [
  { ageYears: 34, sexForEquation: 'female', heightCm: 168, currentWeightKg: 74, averageSteps7d: 7500, walkingPace: 'normal', occupation: 'seated', activities: [], goal: 'loss', targetWeightKg: 66, weeklyRateTarget: 0.005 },
  { ageYears: 45, sexForEquation: 'male', heightCm: 180, currentWeightKg: 95, averageSteps7d: 6000, walkingPace: 'normal', occupation: 'mixed', activities: [{ type: 'running', sessionsPerWeek: 2, durationMin: 40, intensity: 'moderate' }], goal: 'loss', targetWeightKg: 85, weeklyRateTarget: 0.005 },
  { ageYears: 27, sexForEquation: 'male', heightCm: 176, currentWeightKg: 70, averageSteps7d: 9000, walkingPace: 'brisk', occupation: 'standing', activities: [{ type: 'strength', sessionsPerWeek: 3, durationMin: 60, intensity: 'moderate' }], goal: 'gain', targetWeightKg: 75, weeklyRateTarget: 0.0025 },
];

it('captures T-03', () => {
  const out: unknown[] = [];
  let seed = 1000;
  for (const trueOffsetKcal of [-500, -300, -150, 0, 150, 300, 500]) {
    for (const weighEveryDays of [1, 3]) {
      for (const minorDeviationFraction of [0, 0.1, 0.25]) {
        for (const profile of PROFILES) {
          const s = seed++;
          const run = simulateSyntheticUser(
            profile,
            { trueOffsetKcal, weighEveryDays, minorDeviationFraction, majorDeviationFraction: 0.04, unreportedFraction: 0.2, stepLogProbability: 0.6, days: 120, noiseScaleKg: 0.5, minorExtraKcal: [150, 350], majorExtraKcal: [700, 1200] },
            createRng(s),
          );
          for (const h of [28, 42, 84, 120]) out.push({ seed: s, h, fit: fitCalibration(run.calibrationInputFor(h)), apparent: run.apparentOffsetKcal(h) });
        }
      }
    }
  }
  writeCapture('t03', out);
  expect(out).toHaveLength(504);
});
