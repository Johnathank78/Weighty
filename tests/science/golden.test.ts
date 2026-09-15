import { describe, expect, it } from 'vitest';
import { assessBaseline, planContextFrom } from '@/science/assessment';
import { buildGoalPlan, projectPlan } from '@/science/goals';
import type { UserProfile } from '@/science/types';
import { makeProfile } from '../helpers/profiles';

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

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
function roundDeep(value: unknown): unknown {
  if (typeof value === 'number') return r6(value);
  if (Array.isArray(value)) return value.map(roundDeep);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, roundDeep(v)]));
  return value;
}

describe('golden end-to-end profiles (06 s16)', () => {
  it('covers the 12 required fixtures', () => {
    expect(GOLDEN).toHaveLength(12);
  });

  for (const [name, profile] of GOLDEN) {
    it(name, () => {
      const a = assessBaseline(profile, TODAY);
      expect(a.validation.ok).toBe(true);
      const ctx = planContextFrom(profile, a, a.populationTdeeKcal);
      const plan = buildGoalPlan(ctx, { goal: profile.goal, weeklyRate: profile.weeklyRateTarget, targetWeightKg: profile.targetWeightKg, stepTarget: profile.averageSteps7d });
      expect(plan.status).toBe('ok');
      const projection = projectPlan(ctx, {
        goal: profile.goal,
        scenario: { calorieTargetKcal: plan.calorieTargetKcal as number, stepsPerDay: profile.averageSteps7d },
        targetWeightKg: profile.targetWeightKg,
        maintenanceOffsets80: [a.interval80[0] - a.populationTdeeKcal, a.interval80[1] - a.populationTdeeKcal],
        maintenanceHorizonDays: 84,
      });
      const snapshot = {
        ree: { method: a.ree.method, kcal: a.ree.reeKcalDay, athleteLike: a.ree.athleteLike, disagreement: a.ree.reeModelDisagreement, measured: a.ree.measuredRmrStatus.kind, secondary: a.ree.secondaryChecks },
        steps: { netStepKcal: a.netStepKcal },
        exercise: { afterOverlap: a.exercise.dailyAvgKcalAfterOverlap, beforeOverlap: a.exercise.dailyAvgNetKcalBeforeOverlap, perActivity: a.exercise.perActivity.map((e) => ({ met: e.met, basis: e.basis, extra: e.sessionExtraKcalAfterOverlap })) },
        pal: a.pal,
        nasem: { category: a.palCategory, tdee: a.populationTdeeKcal },
        uncertainty: { sigma: a.sigma, interval80: a.interval80, interval95: a.interval95 },
        decomposition: a.decomposition,
        macroClass: a.activityClass,
        plan: {
          rateAdjusted: plan.rateAdjusted,
          rejections: plan.rejections,
          weeklyRate: plan.weeklyRateTarget,
          calories: plan.calorieTargetKcal,
          hardFloor: plan.hardFloorKcal,
          macrosExact: plan.macros?.exact,
          macrosDisplay: plan.macros?.display,
          proteinRule: plan.macros?.proteinRule,
          warnings: plan.warnings,
          w42: plan.solve?.weightAtHorizonKg,
          target42: plan.solve?.targetWeightAtHorizonKg,
        },
        projection: {
          daysToTarget: projection.daysToTarget,
          approximateWeeks: projection.approximateWeeks ?? null,
          horizon: projection.horizonDays,
          start: projection.trajectory[0],
          end: projection.trajectory[projection.trajectory.length - 1],
          lowerEnd: projection.lower80[projection.lower80.length - 1],
          upperEnd: projection.upper80[projection.upper80.length - 1],
        },
      };
      expect(roundDeep(snapshot)).toMatchSnapshot();
    });
  }

  it('profile 12 routes to measured calorimetry', () => {
    const profile = GOLDEN[11]![1];
    expect(assessBaseline(profile, TODAY).ree.method).toBe('measured_indirect_calorimetry');
  });

  it('profile 04 routes to ten Haaf with a high-quality FFM override for macros', () => {
    const a = assessBaseline(GOLDEN[3]![1], TODAY);
    expect(a.ree.method).toBe('ten_haaf_weight');
    expect(a.activityClass).toBe('mixed');
  });
});
