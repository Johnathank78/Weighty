import { describe, expect, it } from 'vitest';
import { classifyPal, compendiumBasisForAge, netKcalPerMin, grossKcalPerMin, netStepKcal, palCategoryFromValue, structuredActivityEnergy, exerciseSummary } from '@/science/activity';
import { decomposeExpenditure } from '@/science/neat';
import type { ActivityIntensity, StructuredActivityType } from '@/science/types';
import { createRng } from '../helpers/random';

const ctx = { weightKg: 70, ageYears: 30, usualPace: 'normal' as const };

describe('step energy (06 s5)', () => {
  it('0 steps => 0 kcal and never negative', () => {
    expect(netStepKcal({ steps: 0, pace: 'normal', weightKg: 70, ageYears: 30 })).toBe(0);
    expect(netStepKcal({ steps: -10, pace: 'normal', weightKg: 70, ageYears: 30 })).toBe(0);
  });

  it('matches the specified MET conversion', () => {
    // normal pace: 3.8 MET, 100 steps/min; 10000 steps = 100 min
    const expected = ((3.8 * 3.5 * 70) / 200 - (3.5 * 70) / 200) * 100;
    expect(netStepKcal({ steps: 10000, pace: 'normal', weightKg: 70, ageYears: 30 })).toBeCloseTo(expected, 9);
    const older = ((5.3 * 2.7 * 70) / 200 - (2.7 * 70) / 200) * 100;
    expect(netStepKcal({ steps: 10000, pace: 'normal', weightKg: 70, ageYears: 60 })).toBeCloseTo(older, 9);
  });

  it('properties over random inputs', () => {
    const rng = createRng(7);
    for (let i = 0; i < 2000; i++) {
      const pace = rng.pick(['slow', 'normal', 'brisk'] as const);
      const age = rng.int(19, 65);
      const w = rng.uniform(45, 200);
      const s = rng.uniform(0, 30000);
      const base = netStepKcal({ steps: s, pace, weightKg: w, ageYears: age });
      expect(base).toBeGreaterThanOrEqual(0);
      expect(netStepKcal({ steps: s + rng.uniform(1, 5000), pace, weightKg: w, ageYears: age })).toBeGreaterThanOrEqual(base);
      if (s > 0) expect(netStepKcal({ steps: s, pace, weightKg: w + 5, ageYears: age })).toBeGreaterThan(base);
    }
  });

  it('brisk pace gives a different estimate than slow pace', () => {
    const slow = netStepKcal({ steps: 8000, pace: 'slow', weightKg: 70, ageYears: 30 });
    const brisk = netStepKcal({ steps: 8000, pace: 'brisk', weightKg: 70, ageYears: 30 });
    expect(brisk).not.toBeCloseTo(slow, 3);
  });

  it('age 59 uses the adult basis and 60 the older-adult basis', () => {
    expect(compendiumBasisForAge(59)).toBe('adult_3_5');
    expect(compendiumBasisForAge(60)).toBe('older_adult_2_7');
  });

  it('never uses a fixed kcal per step conversion (depends on weight and pace)', () => {
    const perStepA = netStepKcal({ steps: 10000, pace: 'normal', weightKg: 60, ageYears: 30 }) / 10000;
    const perStepB = netStepKcal({ steps: 10000, pace: 'normal', weightKg: 90, ageYears: 30 }) / 10000;
    expect(perStepA).not.toBeCloseTo(perStepB, 4);
  });
});

describe('structured exercise (06 s6)', () => {
  const types: StructuredActivityType[] = ['strength', 'running', 'walking', 'hiking', 'cycling', 'swimming', 'rowing', 'team_sport', 'other'];
  const intensities: ActivityIntensity[] = ['light', 'moderate', 'vigorous'];

  it('0 duration and 0 sessions give 0 kcal', () => {
    for (const type of types) {
      expect(structuredActivityEnergy({ type, sessionsPerWeek: 3, durationMin: 0, intensity: 'moderate' }, ctx).dailyAvgKcalAfterOverlap).toBe(0);
      expect(structuredActivityEnergy({ type, sessionsPerWeek: 0, durationMin: 45, intensity: 'moderate' }, ctx).dailyAvgNetKcal).toBe(0);
    }
  });

  it('vigorous >= moderate for the same activity, at adult and older ages', () => {
    for (const ageYears of [30, 62]) {
      for (const type of types) {
        const m = structuredActivityEnergy({ type, sessionsPerWeek: 3, durationMin: 45, intensity: 'moderate' }, { ...ctx, ageYears });
        const v = structuredActivityEnergy({ type, sessionsPerWeek: 3, durationMin: 45, intensity: 'vigorous' }, { ...ctx, ageYears });
        expect(v.sessionNetKcal).toBeGreaterThanOrEqual(m.sessionNetKcal);
      }
    }
  });

  it('net kcal < gross kcal for MET > 1', () => {
    for (const intensity of intensities) {
      for (const type of types) {
        const e = structuredActivityEnergy({ type, sessionsPerWeek: 2, durationMin: 30, intensity }, ctx);
        expect(e.met).toBeGreaterThan(1);
        expect(e.sessionNetKcal).toBeLessThan(e.sessionGrossKcal);
      }
    }
    expect(netKcalPerMin(5, 70, 'adult_3_5')).toBeLessThan(grossKcalPerMin(5, 70, 'adult_3_5'));
  });

  it('running: steps assumed in the daily count, only the intensity premium is added', () => {
    const run = structuredActivityEnergy({ type: 'running', sessionsPerWeek: 3, durationMin: 40, intensity: 'moderate' }, ctx);
    expect(run.stepDominant).toBe(true);
    expect(run.estimatedStepsPerSession).toBe(40 * 160);
    const stepKcal = netStepKcal({ steps: 40 * 160, pace: 'normal', weightKg: 70, ageYears: 30 });
    expect(run.overlapStepKcalPerSession).toBeCloseTo(stepKcal, 9);
    expect(run.sessionExtraKcalAfterOverlap).toBeCloseTo(run.sessionNetKcal - stepKcal, 9);
    expect(run.sessionExtraKcalAfterOverlap).toBeLessThan(run.sessionNetKcal);
  });

  it('cycling energy is added in full', () => {
    const bike = structuredActivityEnergy({ type: 'cycling', sessionsPerWeek: 3, durationMin: 60, intensity: 'moderate' }, ctx);
    expect(bike.stepDominant).toBe(false);
    expect(bike.sessionExtraKcalAfterOverlap).toBe(bike.sessionNetKcal);
    expect(bike.dailyAvgKcalAfterOverlap).toBeCloseTo((bike.sessionNetKcal * 3) / 7, 9);
  });

  it('flags a default cadence for step-dominant activities without a specific cadence', () => {
    expect(exerciseSummary([{ type: 'team_sport', sessionsPerWeek: 2, durationMin: 60, intensity: 'moderate' }], ctx).anyDefaultCadence).toBe(true);
    expect(exerciseSummary([{ type: 'running', sessionsPerWeek: 2, durationMin: 60, intensity: 'moderate' }], ctx).anyDefaultCadence).toBe(false);
  });
});

describe('PAL classifier (06 s7)', () => {
  it('exact category boundaries', () => {
    expect(palCategoryFromValue(1.5299)).toBe('inactive');
    expect(palCategoryFromValue(1.53)).toBe('low_active');
    expect(palCategoryFromValue(1.6799)).toBe('low_active');
    expect(palCategoryFromValue(1.68)).toBe('active');
    expect(palCategoryFromValue(1.8499)).toBe('active');
    expect(palCategoryFromValue(1.85)).toBe('very_active');
  });

  it('factoral proxy formula and boundary flag within 0.05', () => {
    const r = classifyPal({ reeKcalDay: 1500, occupation: 'seated', netStepKcalDay: 200, exerciseKcalDayAfterOverlap: 100 });
    const expected = (1500 + 300 + 0 + 200 + 100) / 0.9;
    expect(r.provisionalTdeeKcal).toBeCloseTo(expected, 9);
    expect(r.provisionalPal).toBeCloseTo(expected / 1500, 9);
    // PAL = 1.5556, within 0.05 of 1.53
    expect(r.palBoundaryFlag).toBe(true);
    const far = classifyPal({ reeKcalDay: 1500, occupation: 'seated', netStepKcalDay: 360, exerciseKcalDayAfterOverlap: 0 });
    expect(far.provisionalPal).toBeCloseTo(1.6, 3);
    expect(far.palBoundaryFlag).toBe(false);
  });

  it('physical occupation cannot be below active', () => {
    const r = classifyPal({ reeKcalDay: 1800, occupation: 'physical', netStepKcalDay: 0, exerciseKcalDayAfterOverlap: 0 });
    expect(r.categoryFromProxy).toBe('inactive');
    expect(r.palCategory).toBe('active');
    expect(classifyPal({ reeKcalDay: 1500, occupation: 'physical', netStepKcalDay: 900, exerciseKcalDayAfterOverlap: 400 }).palCategory).toBe('very_active');
  });

  it('property: more steps or exercise never decreases provisional PAL', () => {
    const rng = createRng(11);
    for (let i = 0; i < 3000; i++) {
      const input = { reeKcalDay: rng.uniform(1000, 2600), occupation: rng.pick(['seated', 'mixed', 'standing', 'physical'] as const), netStepKcalDay: rng.uniform(0, 900), exerciseKcalDayAfterOverlap: rng.uniform(0, 800) };
      const base = classifyPal(input).provisionalPal;
      expect(classifyPal({ ...input, netStepKcalDay: input.netStepKcalDay + rng.uniform(0, 300) }).provisionalPal).toBeGreaterThanOrEqual(base);
      expect(classifyPal({ ...input, exerciseKcalDayAfterOverlap: input.exerciseKcalDayAfterOverlap + rng.uniform(0, 300) }).provisionalPal).toBeGreaterThanOrEqual(base);
    }
  });
});

describe('residual NEAT bookkeeping (02 s8)', () => {
  it('keeps the raw residual and clamps only for display', () => {
    const d = decomposeExpenditure({ initialTdeeKcal: 2000, reeKcal: 1500, netStepKcal: 300, exerciseKcalAfterOverlap: 100, occupationPostureKcal: 18 });
    expect(d.referenceTefKcal).toBe(200);
    expect(d.residualNeatKcalRaw).toBeCloseTo(-118, 9);
    expect(d.residualNeatKcalDisplay).toBe(0);
  });
});
