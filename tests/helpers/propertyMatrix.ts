/** 10,000-profile randomized property matrix (instruct/06 section 15), split across files for parallelism. */
import { expect } from 'vitest';
import { assessBaseline, planContextFrom } from '@/science/assessment';
import { buildGoalPlan, hardFloorKcal, weightAtDay } from '@/science/goals';
import { validateProfile } from '@/science/validation';
import type { ActivityIntensity, StructuredActivityType, UserProfile } from '@/science/types';
import { createRng } from './random';

export const PROFILES_PER_PART = 2500;
const TODAY = '2026-09-13';

function randomProfile(rng: ReturnType<typeof createRng>): UserProfile {
  const trainingHours = rng.uniform(0, 20);
  const types: StructuredActivityType[] = ['strength', 'running', 'walking', 'hiking', 'cycling', 'swimming', 'rowing', 'team_sport', 'other'];
  const activities = [];
  if (trainingHours > 0.25) {
    const count = rng.int(1, 3);
    for (let i = 0; i < count; i++) {
      const sessions = rng.int(1, 7);
      activities.push({
        type: rng.pick(types),
        sessionsPerWeek: sessions,
        durationMin: Math.min(360, (trainingHours * 60) / count / sessions),
        intensity: rng.pick(['light', 'moderate', 'vigorous'] as ActivityIntensity[]),
      });
    }
  }
  const weight = rng.uniform(45, 200);
  const goal = rng.pick(['loss', 'maintenance', 'gain'] as const);
  return {
    ageYears: rng.int(19, 65),
    sexForEquation: rng.pick(['female', 'male'] as const),
    heightCm: rng.uniform(145, 205),
    currentWeightKg: weight,
    averageSteps7d: Math.round(rng.uniform(0, 30000)),
    walkingPace: rng.pick(['slow', 'normal', 'brisk'] as const),
    occupation: rng.pick(['seated', 'mixed', 'standing', 'physical'] as const),
    activities,
    goal,
    targetWeightKg: goal === 'loss' ? weight * 0.9 : goal === 'gain' ? weight * 1.08 : weight,
    weeklyRateTarget: goal === 'loss' ? rng.uniform(0.002, 0.01) : goal === 'gain' ? rng.uniform(0.001, 0.005) : 0,
    ...(rng.chance(0.25) ? { bodyFatPercent: rng.uniform(8, 45), bodyFatMethod: rng.pick(['dxa', 'consumer_bia', 'skinfold', 'self_estimate'] as const) } : {}),
  };
}

const finite = (x: number) => Number.isFinite(x);

export function runPropertyPart(part: number): { accepted: number; rejected: number; plans: number } {
  const rng = createRng(90_000 + part);
  let accepted = 0;
  let rejected = 0;
  let plans = 0;
  let attempts = 0;
  while (accepted < PROFILES_PER_PART) {
    attempts++;
    const profile = randomProfile(rng);
    if (!validateProfile(profile).ok) {
      rejected++;
      continue;
    }
    accepted++;
    const a = assessBaseline(profile, TODAY);
    expect(finite(a.ree.reeKcalDay) && a.ree.reeKcalDay > 0).toBe(true);
    expect(finite(a.populationTdeeKcal) && a.populationTdeeKcal > 0).toBe(true);
    expect(finite(a.pal.provisionalPal)).toBe(true);
    expect(a.interval80[0]).toBeLessThan(a.populationTdeeKcal);
    expect(a.populationTdeeKcal).toBeLessThan(a.interval80[1]);
    expect(a.interval95[0]).toBeLessThan(a.interval80[0]);

    const ctx = planContextFrom(profile, a, a.populationTdeeKcal);
    const plan = buildGoalPlan(ctx, { goal: profile.goal, weeklyRate: profile.weeklyRateTarget, targetWeightKg: profile.targetWeightKg, stepTarget: profile.averageSteps7d });
    if (plan.status !== 'ok') continue;
    plans++;
    const kcal = plan.calorieTargetKcal as number;
    const macros = plan.macros;
    expect(finite(kcal) && kcal > 0).toBe(true);
    expect(kcal).toBeGreaterThanOrEqual(hardFloorKcal(ctx.reeKcal, ctx.sex));
    expect(macros).not.toBeNull();
    if (!macros) continue;
    expect(macros.display.proteinG).toBeGreaterThanOrEqual(0);
    expect(macros.display.carbsG).toBeGreaterThanOrEqual(0);
    expect(macros.display.fatG).toBeGreaterThanOrEqual(0);
    expect(Math.abs(macros.displayMacroEnergyKcal - macros.displayCalorieTargetKcal)).toBeLessThanOrEqual(5);

    // Continuity: a 0.1 kg change in body weight must not jump the projected day-84 weight
    // (evaluated at the same intake and steps, so guardrail speed switches do not interfere).
    // No exemption: the nutrition reference weight is continuous at BMI 25 and BMI 30 since model 1.1.0.
    const scenario = { calorieTargetKcal: kcal, stepsPerDay: profile.averageSteps7d };
    const w84 = weightAtDay(ctx, profile.goal, scenario, 84);
    const nudged = planContextFrom(profile, assessBaseline({ ...profile, currentWeightKg: profile.currentWeightKg + 0.1 }, TODAY), a.populationTdeeKcal);
    const w84b = weightAtDay(nudged, profile.goal, scenario, 84);
    expect(finite(w84) && finite(w84b)).toBe(true);
    expect(Math.abs(w84b - w84)).toBeLessThan(0.3);
  }
  expect(attempts).toBe(accepted + rejected);
  return { accepted, rejected, plans };
}
