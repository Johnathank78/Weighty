/**
 * Non-regression capture (prompt 34 s3.8): the 12 golden profiles (unrounded assessment, plan and full projection,
 * profiles copied verbatim from tests/science/golden.test.ts), cases R and S (full view-model of the preview, plus a
 * calibrated store with warm-start history: calibration state, recalibrated store and explanation), and the
 * convergence journeys A, B, C (full result, store included).
 */
import { expect, it } from 'vitest';
import { addWeight, applyRecalibration, completeOnboarding, computeCalibrationState, ensureDailyLogs, setActualSteps, setAdherence } from '@/domain/engine';
import { explainCurrentPlan, explainPreview } from '@/domain/explain';
import { emptyStore } from '@/persistence/schema';
import { assessBaseline, planContextFrom } from '@/science/assessment';
import { addDays } from '@/science/dates';
import { buildGoalPlan, projectPlan } from '@/science/goals';
import type { HistoricalIntakeEvidence, UserProfile } from '@/science/types';
import { runJourney } from '../../helpers/convergenceJourney';
import { makeProfile } from '../../helpers/profiles';
import { createRng } from '../../helpers/random';
import { writeCapture } from './serialize';

const TODAY = '2026-09-13';

const GOLDEN: Array<[string, UserProfile]> = [
  ['01 female 25 sedentary normal BMI loss', makeProfile({ ageYears: 25, sexForEquation: 'female', heightCm: 165, currentWeightKg: 62, averageSteps7d: 4500, occupation: 'seated', goal: 'loss', targetWeightKg: 57, weeklyRateTarget: 0.005 })],
  ['02 male 30 low active normal BMI maintenance', makeProfile({ ageYears: 30, sexForEquation: 'male', heightCm: 180, currentWeightKg: 75, averageSteps7d: 8500, occupation: 'mixed', goal: 'maintenance', targetWeightKg: 75 })],
  ['03 female 35 resistance training loss', makeProfile({ ageYears: 35, sexForEquation: 'female', heightCm: 168, currentWeightKg: 70, averageSteps7d: 7000, activities: [{ type: 'strength', sessionsPerWeek: 3, durationMin: 60, intensity: 'moderate' }], goal: 'loss', targetWeightKg: 64, weeklyRateTarget: 0.005 })],
  [
    '04 male 28 athlete-like resistance + endurance maintenance',
    makeProfile({
      ageYears: 28,
      sexForEquation: 'male',
      heightCm: 182,
      currentWeightKg: 80,
      averageSteps7d: 11000,
      occupation: 'mixed',
      bodyFatPercent: 12,
      bodyFatMethod: 'dxa',
      activities: [
        { type: 'strength', sessionsPerWeek: 3, durationMin: 75, intensity: 'vigorous' },
        { type: 'running', sessionsPerWeek: 3, durationMin: 50, intensity: 'moderate' },
      ],
      goal: 'maintenance',
      targetWeightKg: 80,
    }),
  ],
  ['05 female 42 obesity low active loss', makeProfile({ ageYears: 42, sexForEquation: 'female', heightCm: 162, currentWeightKg: 95, averageSteps7d: 6500, occupation: 'mixed', goal: 'loss', targetWeightKg: 80, weeklyRateTarget: 0.005 })],
  ['06 male 45 obesity active loss', makeProfile({ ageYears: 45, sexForEquation: 'male', heightCm: 176, currentWeightKg: 112, averageSteps7d: 12000, occupation: 'physical', goal: 'loss', targetWeightKg: 95, weeklyRateTarget: 0.0075 })],
  ['07 female 55 active maintenance', makeProfile({ ageYears: 55, sexForEquation: 'female', heightCm: 164, currentWeightKg: 60, averageSteps7d: 12500, occupation: 'standing', activities: [{ type: 'cycling', sessionsPerWeek: 3, durationMin: 60, intensity: 'moderate' }], goal: 'maintenance', targetWeightKg: 60 })],
  ['08 male 60 moderate activity maintenance', makeProfile({ ageYears: 60, sexForEquation: 'male', heightCm: 175, currentWeightKg: 82, averageSteps7d: 8000, occupation: 'mixed', activities: [{ type: 'walking', sessionsPerWeek: 4, durationMin: 45, intensity: 'moderate' }], goal: 'maintenance', targetWeightKg: 82 })],
  ['09 female 65 resistance training maintenance', makeProfile({ ageYears: 65, sexForEquation: 'female', heightCm: 160, currentWeightKg: 63, averageSteps7d: 7000, activities: [{ type: 'strength', sessionsPerWeek: 2, durationMin: 45, intensity: 'moderate' }], goal: 'maintenance', targetWeightKg: 63 })],
  ['10 male 35 resistance training gain', makeProfile({ ageYears: 35, sexForEquation: 'male', heightCm: 178, currentWeightKg: 72, averageSteps7d: 9000, activities: [{ type: 'strength', sessionsPerWeek: 4, durationMin: 70, intensity: 'vigorous' }], goal: 'gain', targetWeightKg: 78, weeklyRateTarget: 0.0025 })],
  ['11 female 30 endurance heavy gain', makeProfile({ ageYears: 30, sexForEquation: 'female', heightCm: 170, currentWeightKg: 56, averageSteps7d: 14000, activities: [{ type: 'running', sessionsPerWeek: 5, durationMin: 60, intensity: 'moderate' }, { type: 'swimming', sessionsPerWeek: 2, durationMin: 45, intensity: 'moderate' }], goal: 'gain', targetWeightKg: 59, weeklyRateTarget: 0.001 })],
  [
    '12 valid indirect calorimetry',
    makeProfile({ ageYears: 40, sexForEquation: 'female', heightCm: 166, currentWeightKg: 68, averageSteps7d: 7500, measuredRmr: { kcalPerDay: 1420, measuredAt: '2026-06-01', weightKgAtTest: 67.5, method: 'indirect_calorimetry', conditionsKnown: true }, goal: 'loss', targetWeightKg: 63, weeklyRateTarget: 0.0025 }),
  ],
];

it('captures the golden profiles', () => {
  const out = GOLDEN.map(([name, profile]) => {
    const a = assessBaseline(profile, TODAY);
    const ctx = planContextFrom(profile, a, a.populationTdeeKcal);
    const plan = buildGoalPlan(ctx, { goal: profile.goal, weeklyRate: profile.weeklyRateTarget, targetWeightKg: profile.targetWeightKg, stepTarget: profile.averageSteps7d });
    const projection = projectPlan(ctx, {
      goal: profile.goal,
      scenario: { calorieTargetKcal: plan.calorieTargetKcal as number, stepsPerDay: profile.averageSteps7d },
      targetWeightKg: profile.targetWeightKg,
      maintenanceOffsets80: [a.interval80[0] - a.populationTdeeKcal, a.interval80[1] - a.populationTdeeKcal],
      maintenanceHorizonDays: 84,
    });
    return { name, assessment: a, plan, projection };
  });
  writeCapture('golden', out);
  expect(out).toHaveLength(12);
});

const RS_TODAY = '2026-09-14';
const history = (kcal: number): HistoricalIntakeEvidence => ({ evidenceVersion: 1, recordedOn: RS_TODAY, averageCaloriesKcal: kcal, durationDays: 14, startWeightKg: 68, endWeightKg: 68, trackingQuality: 'high', activityComparable: true });
const CASE_R: UserProfile = makeProfile({ sexForEquation: 'female', ageYears: 24, heightCm: 155, currentWeightKg: 68, averageSteps7d: 9400, walkingPace: 'normal', occupation: 'seated', activities: [{ type: 'strength', sessionsPerWeek: 4, durationMin: 55, intensity: 'moderate' }], goal: 'loss', targetWeightKg: 60, weeklyRateTarget: 0.01 });
const CASE_S: UserProfile = { ...CASE_R, activities: [{ type: 'strength', sessionsPerWeek: 5, durationMin: 55, intensity: 'moderate' }], targetWeightKg: 62 };

function calibratedStore(profile: UserProfile, seed: number) {
  const iso = (d: string) => `${d}T08:00:00.000Z`;
  const onboarding = completeOnboarding(emptyStore(), profile, RS_TODAY, iso(RS_TODAY), history(1450));
  if (!onboarding.ok) throw new Error(onboarding.reason);
  let s = onboarding.store;
  const rng = createRng(seed);
  for (let d = 1; d <= 35; d++) {
    const date = addDays(RS_TODAY, d);
    s = ensureDailyLogs(s, date);
    s = setAdherence(s, addDays(date, -1), d % 9 === 0 ? 'minor_deviation' : 'on_plan');
    if (d % 2 === 0) s = setActualSteps(s, addDays(date, -1), profile.averageSteps7d);
    if (d % 2 === 1) s = addWeight(s, { date, weightKg: profile.currentWeightKg - 0.07 * d + 0.3 * rng.normal() }, iso(date));
  }
  const today = addDays(RS_TODAY, 35);
  const state = computeCalibrationState(s, today, iso(today));
  const applied = state ? applyRecalibration(s, state, today, iso(today)) : null;
  const after = applied?.ok ? applied.store : null;
  return { store: s, state, applied: after, explanation: after ? explainCurrentPlan(after, today) : null, stateAfter: after ? computeCalibrationState(after, today, iso(today)) : null };
}

it('captures cases R and S', () => {
  const out = {
    R: { preview: explainPreview(CASE_R, RS_TODAY, history(1450)), calibrated: calibratedStore(CASE_R, 41) },
    S: { preview: explainPreview(CASE_S, RS_TODAY, history(1450)), calibrated: calibratedStore(CASE_S, 43) },
  };
  writeCapture('cases-rs', out);
  expect(out.R.calibrated.state?.gate.met).toBe(true);
});

it('captures the convergence journeys', () => {
  const out = [
    { key: 'A', trueOffsetKcal: -300, hiddenFraction: 0, hiddenKcal: 0, seed: 11 },
    { key: 'B', trueOffsetKcal: -300, hiddenFraction: 0.2, hiddenKcal: 400, seed: 11 },
    { key: 'C', trueOffsetKcal: 250, hiddenFraction: 0, hiddenKcal: 0, seed: 23 },
  ].map((scenario) => ({ scenario, result: runJourney(scenario, 84) }));
  writeCapture('journey', out);
  expect(out).toHaveLength(3);
});
