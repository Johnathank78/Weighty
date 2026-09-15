import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { assessBaseline, planContextFrom } from '@/science/assessment';
import {
  buildGoalPlan,
  effectiveMinSliderSteps,
  guardrailMaxWeeklyRate,
  hardFloorKcal,
  lossAvailability,
  maintenanceZone,
  maxSelectableWeeklyRate,
  projectPlan,
  sliderBounds,
  snapWeeklyRate,
  solveRoundedSliderPoint,
  solveSliderPoint,
  speedZoneFor,
  weeklyRateRange,
  weightAtDay,
} from '@/science/goals';
import type { PlanContext } from '@/science/goals';
import { GAIN_RATE_HARD_MAX, LOSS_RATE_HARD_MAX } from '@/science/constants';
import type { UserProfile } from '@/science/types';
import { makeProfile } from '../helpers/profiles';
import { createRng } from '../helpers/random';

const TODAY = '2026-09-13';

function ctxFor(profile: UserProfile): PlanContext {
  const a = assessBaseline(profile, TODAY);
  return planContextFrom(profile, a, a.populationTdeeKcal);
}

describe('continuous weekly rate (04 s2, 06 s10)', () => {
  it('loss range 0.2 to 1.0 percent per week, default 0.5; gain range 0.1 to 0.5, default 0.25; maintenance has no speed', () => {
    expect(weeklyRateRange('loss')).toEqual({ minRate: 0.002, maxRate: 0.01, defaultRate: 0.005, step: 0.0005 });
    expect(weeklyRateRange('gain')).toEqual({ minRate: 0.001, maxRate: 0.005, defaultRate: 0.0025, step: 0.0005 });
    expect(weeklyRateRange('maintenance').maxRate).toBe(0);
    expect(LOSS_RATE_HARD_MAX).toBe(0.01);
    expect(GAIN_RATE_HARD_MAX).toBe(0.005);
  });

  it('qualitative zones label ranges of the slider, not presets', () => {
    expect([0.002, 0.0035, 0.004, 0.006, 0.0065, 0.01].map((r) => speedZoneFor('loss', r))).toEqual(['gentle', 'gentle', 'moderate', 'moderate', 'fast', 'fast']);
    expect([0.001, 0.0015, 0.002, 0.003, 0.0035, 0.005].map((r) => speedZoneFor('gain', r))).toEqual(['gentle', 'gentle', 'moderate', 'moderate', 'fast', 'fast']);
    expect(snapWeeklyRate(0.0045000000001)).toBe(0.0045);
  });

  it('faster requested rates give lower calories, strictly monotone across the loss slider', () => {
    const profile = makeProfile({ sexForEquation: 'male', ageYears: 40, heightCm: 180, currentWeightKg: 92, goal: 'loss', targetWeightKg: 82 });
    const ctx = ctxFor(profile);
    let prev = Infinity;
    for (let r = 0.002; r <= 0.01 + 1e-9; r += 0.001) {
      const plan = buildGoalPlan(ctx, { goal: 'loss', weeklyRate: r, targetWeightKg: 82, stepTarget: 7000 });
      expect(plan.status).toBe('ok');
      expect(plan.weeklyRateTarget).toBeCloseTo(r, 9);
      expect(plan.calorieTargetKcal as number).toBeLessThan(prev);
      prev = plan.calorieTargetKcal as number;
    }
  });

  it('the solved plan reaches the 42-day target on the dynamic model', () => {
    const profile = makeProfile({ sexForEquation: 'male', ageYears: 40, heightCm: 180, currentWeightKg: 92, goal: 'loss', targetWeightKg: 82 });
    const ctx = ctxFor(profile);
    const plan = buildGoalPlan(ctx, { goal: 'loss', weeklyRate: 0.005, targetWeightKg: 82, stepTarget: 7000 });
    expect(plan.status).toBe('ok');
    const w42 = weightAtDay(ctx, 'loss', { calorieTargetKcal: plan.calorieTargetKcal as number, stepsPerDay: 7000 }, 42);
    expect(Math.abs(w42 - 92 * Math.pow(1 - 0.005, 6))).toBeLessThanOrEqual(0.01);
    expect(plan.solve?.iterations).toBeLessThanOrEqual(60);
  });
});

describe('BMI safety (06 s10)', () => {
  it('target BMI < 18.5 is rejected', () => {
    const profile = makeProfile({ heightCm: 170, currentWeightKg: 60, goal: 'loss', targetWeightKg: 53 });
    expect(buildGoalPlan(ctxFor(profile), { goal: 'loss', weeklyRate: 0.0025, targetWeightKg: 53, stepTarget: 7000 }).status).toBe('target_bmi_too_low');
  });

  it('current BMI < 20 cannot create a weight-loss plan', () => {
    expect(lossAvailability(19.9)).toEqual({ available: false, reason: 'current_bmi_below_20' });
    const profile = makeProfile({ heightCm: 170, currentWeightKg: 57, goal: 'loss', targetWeightKg: 55 });
    expect(buildGoalPlan(ctxFor(profile), { goal: 'loss', weeklyRate: 0.002, targetWeightKg: 55, stepTarget: 7000 }).status).toBe('loss_unavailable_low_bmi');
  });

  it('BMI 20-21.99 caps loss at 0.25 percent, 22-24.99 at 0.5 percent, >= 25 at the 1.0 percent product maximum', () => {
    expect(lossAvailability(20)).toEqual({ available: true, maxRate: 0.0025 });
    expect(lossAvailability(21.99)).toEqual({ available: true, maxRate: 0.0025 });
    expect(lossAvailability(22)).toEqual({ available: true, maxRate: 0.005 });
    expect(lossAvailability(24.99)).toEqual({ available: true, maxRate: 0.005 });
    expect(lossAvailability(25)).toEqual({ available: true, maxRate: 0.01 });
    expect(guardrailMaxWeeklyRate('gain', 18)).toBe(0.005);
    const profile = makeProfile({ heightCm: 170, currentWeightKg: 61, goal: 'loss', targetWeightKg: 58 });
    const plan = buildGoalPlan(ctxFor(profile), { goal: 'loss', weeklyRate: 0.0075, targetWeightKg: 58, stepTarget: 7000 });
    expect(plan.weeklyRateTarget).toBe(0.0025);
    expect(plan.rateAdjusted).toBe(true);
    expect(plan.rejections).toEqual([{ weeklyRate: 0.0075, reason: 'above_guardrail_cap' }]);
  });

  it('the selectable maximum is dynamic: BMI guardrail, then calorie floor, so the engine never refuses a selectable rate', () => {
    const lean = ctxFor(makeProfile({ heightCm: 170, currentWeightKg: 66, goal: 'loss', targetWeightKg: 62 }));
    const limLean = maxSelectableWeeklyRate(lean, 'loss', 7000);
    expect(limLean).toMatchObject({ maxSelectableRate: 0.005, limitedBy: 'bmi_guardrail' });
    const free = ctxFor(makeProfile({ sexForEquation: 'male', heightCm: 180, currentWeightKg: 100, averageSteps7d: 9000, goal: 'loss', targetWeightKg: 85 }));
    expect(maxSelectableWeeklyRate(free, 'loss', 9000)).toMatchObject({ maxSelectableRate: 0.01, limitedBy: null });
    // Small older woman: the 1200 kcal floor binds before the guardrail.
    const small = ctxFor(makeProfile({ sexForEquation: 'female', ageYears: 62, heightCm: 150, currentWeightKg: 62, averageSteps7d: 2000, goal: 'loss', targetWeightKg: 55 }));
    const limSmall = maxSelectableWeeklyRate(small, 'loss', 2000);
    expect(limSmall.limitedBy).toBe('below_hard_floor');
    expect(limSmall.maxSelectableRate).not.toBeNull();
    expect(limSmall.maxSelectableRate as number).toBeLessThan(0.01);
    for (const [ctx, lim, steps] of [
      [lean, limLean, 7000],
      [small, limSmall, 2000],
    ] as const) {
      const at = buildGoalPlan(ctx, { goal: 'loss', weeklyRate: lim.maxSelectableRate as number, targetWeightKg: ctx.currentWeightKg * 0.9, stepTarget: steps });
      expect(at.status).toBe('ok');
      expect(at.rateAdjusted).toBe(false);
      const above = buildGoalPlan(ctx, { goal: 'loss', weeklyRate: (lim.maxSelectableRate as number) + 0.0005, targetWeightKg: ctx.currentWeightKg * 0.9, stepTarget: steps });
      expect(above.rateAdjusted).toBe(true);
      expect(above.weeklyRateTarget).toBeCloseTo(lim.maxSelectableRate as number, 9);
    }
  });

  it('gain uses its own range and maintenance ignores any rate', () => {
    const ctx = ctxFor(makeProfile({ sexForEquation: 'male', heightCm: 178, currentWeightKg: 70, goal: 'gain', targetWeightKg: 76 }));
    expect(maxSelectableWeeklyRate(ctx, 'gain', 7000).maxSelectableRate).toBe(0.005);
    const tooFast = buildGoalPlan(ctx, { goal: 'gain', weeklyRate: 0.01, targetWeightKg: 76, stepTarget: 7000 });
    expect(tooFast.weeklyRateTarget).toBe(0.005);
    const m = buildGoalPlan(ctx, { goal: 'maintenance', weeklyRate: 0.0075, targetWeightKg: 70, stepTarget: 7000 });
    expect(m.weeklyRateTarget).toBe(0);
    expect(m.requestedWeeklyRate).toBe(0);
    expect(maxSelectableWeeklyRate(ctx, 'maintenance', 7000).maxSelectableRate).toBe(0);
  });
});

describe('calorie safety (06 s10)', () => {
  it('no saved plan under the hard floor: falls back to the fastest feasible slower rate', () => {
    let floorRejections = 0;
    let fallbacks = 0;
    for (const weight of [48, 50, 53, 56, 60]) {
      for (const age of [50, 58, 65]) {
        const profile = makeProfile({ sexForEquation: 'female', ageYears: age, heightCm: 135, currentWeightKg: weight, averageSteps7d: 0, goal: 'loss', targetWeightKg: 40 });
        const ctx = ctxFor(profile);
        const plan = buildGoalPlan(ctx, { goal: 'loss', weeklyRate: 0.01, targetWeightKg: 40, stepTarget: 0 });
        const floor = hardFloorKcal(ctx.reeKcal, ctx.sex);
        if (plan.rejections.some((r) => r.reason === 'below_hard_floor')) floorRejections++;
        if (plan.status === 'ok') {
          expect(plan.calorieTargetKcal as number).toBeGreaterThanOrEqual(floor);
          if (plan.weeklyRateTarget < (plan.guardrailMaxRate as number) && plan.rejections.some((r) => r.reason === 'below_hard_floor')) fallbacks++;
        } else {
          expect(['no_feasible_speed', 'target_bmi_too_low', 'loss_unavailable_low_bmi']).toContain(plan.status);
          expect(plan.calorieTargetKcal).toBeNull();
        }
      }
    }
    expect(floorRejections).toBeGreaterThan(0);
    expect(fallbacks).toBeGreaterThan(0);
  });

  it('hard floor is max(1200 women or 1500 men, 0.7 * REE) (D-32)', () => {
    expect(hardFloorKcal(1500, 'female')).toBe(1200);
    expect(hardFloorKcal(2000, 'female')).toBe(1400);
    expect(hardFloorKcal(1500, 'male')).toBe(1500);
    expect(hardFloorKcal(1800, 'male')).toBe(1500);
    expect(hardFloorKcal(2400, 'male')).toBeCloseTo(1680, 9);
  });

  it('a small man in fast loss is held at the 1500 kcal floor, a woman of the same size is not', () => {
    const male = ctxFor(makeProfile({ sexForEquation: 'male', ageYears: 60, heightCm: 160, currentWeightKg: 70, averageSteps7d: 2000, goal: 'loss', targetWeightKg: 62 }));
    const plan = buildGoalPlan(male, { goal: 'loss', weeklyRate: 0.01, targetWeightKg: 62, stepTarget: 2000 });
    expect(plan.hardFloorKcal).toBe(1500);
    expect(plan.rejections.some((r) => r.reason === 'below_hard_floor')).toBe(true);
    expect(plan.status).toBe('ok');
    expect(plan.calorieTargetKcal as number).toBeGreaterThanOrEqual(1500);
    expect(plan.rateAdjusted).toBe(true);
    const female = ctxFor(makeProfile({ sexForEquation: 'female', ageYears: 60, heightCm: 160, currentWeightKg: 70, averageSteps7d: 2000, goal: 'loss', targetWeightKg: 62 }));
    expect(buildGoalPlan(female, { goal: 'loss', weeklyRate: 0.01, targetWeightKg: 62, stepTarget: 2000 }).hardFloorKcal).toBe(1200);
  });

  it('maintenance zone half width clamp(0.75 percent, 0.5, 1.0)', () => {
    expect(maintenanceZone(50).halfWidthKg).toBe(0.5);
    expect(maintenanceZone(100).halfWidthKg).toBeCloseTo(0.75, 9);
    expect(maintenanceZone(160).halfWidthKg).toBe(1);
  });

  it('gain without resistance training shows the neutral context note only', () => {
    const profile = makeProfile({ goal: 'gain', targetWeightKg: 66 });
    const plan = buildGoalPlan(ctxFor(profile), { goal: 'gain', weeklyRate: 0.0025, targetWeightKg: 66, stepTarget: 7000 });
    expect(plan.status).toBe('ok');
    expect(plan.warnings.gainWithoutResistance).toBe(true);
  });
});

describe('projection (04 s7)', () => {
  it('follows the dynamic model (not a straight line) and gives approximate weeks', () => {
    const profile = makeProfile({ sexForEquation: 'female', ageYears: 34, heightCm: 172, currentWeightKg: 76.8, goal: 'loss', targetWeightKg: 72 });
    const a = assessBaseline(profile, TODAY);
    const ctx = planContextFrom(profile, a, a.populationTdeeKcal);
    const plan = buildGoalPlan(ctx, { goal: 'loss', weeklyRate: 0.005, targetWeightKg: 72, stepTarget: 7000 });
    const p = projectPlan(ctx, {
      goal: 'loss',
      scenario: { calorieTargetKcal: plan.calorieTargetKcal as number, stepsPerDay: 7000 },
      targetWeightKg: 72,
      maintenanceOffsets80: [a.interval80[0] - a.populationTdeeKcal, a.interval80[1] - a.populationTdeeKcal],
      maintenanceHorizonDays: 84,
    });
    expect(p.reachedWithinWindow).toBe(true);
    expect(p.approximateWeeks).toBeGreaterThan(0);
    const first = p.trajectory[0]!;
    const last = p.trajectory[p.trajectory.length - 1]!;
    const mid = p.trajectory[Math.floor(p.trajectory.length / 2)]!;
    const linearMid = first.weightKg + ((last.weightKg - first.weightKg) * (mid.day - first.day)) / (last.day - first.day);
    expect(Math.abs(mid.weightKg - linearMid)).toBeGreaterThan(0.05);
    p.trajectory.forEach((pt, i) => {
      expect(p.lower80[i]!.weightKg).toBeLessThanOrEqual(pt.weightKg + 1e-9);
      expect(p.upper80[i]!.weightKg).toBeGreaterThanOrEqual(pt.weightKg - 1e-9);
    });
  });

  it('reports no reliable date when the target is not reached within 730 days', () => {
    const profile = makeProfile({ sexForEquation: 'male', ageYears: 40, heightCm: 180, currentWeightKg: 90, goal: 'loss', targetWeightKg: 70 });
    const a = assessBaseline(profile, TODAY);
    const ctx = planContextFrom(profile, a, a.populationTdeeKcal);
    const p = projectPlan(ctx, { goal: 'loss', scenario: { calorieTargetKcal: a.populationTdeeKcal - 100, stepsPerDay: 7000 }, targetWeightKg: 70, maintenanceOffsets80: [-300, 300], maintenanceHorizonDays: 84 });
    expect(p.reachedWithinWindow).toBe(false);
    expect(p.approximateWeeks).toBeUndefined();
    expect(p.horizonDays).toBe(730);
  });
});

describe('slider invariants (06 s12)', () => {
  function randomCases(n: number) {
    const rng = createRng(2024);
    const out: Array<{ ctx: PlanContext; calories: number; steps: number; goal: 'loss' | 'maintenance' | 'gain' }> = [];
    while (out.length < n) {
      const heightCm = rng.uniform(150, 195);
      const profile = makeProfile({
        sexForEquation: rng.pick(['female', 'male'] as const),
        ageYears: rng.int(19, 65),
        heightCm,
        currentWeightKg: rng.uniform(25, 38) * (heightCm / 100) ** 2,
        averageSteps7d: rng.int(30, 140) * 100,
        walkingPace: rng.pick(['slow', 'normal', 'brisk'] as const),
        occupation: rng.pick(['seated', 'mixed', 'standing', 'physical'] as const),
      });
      const ctx = ctxFor(profile);
      const goal = rng.pick(['loss', 'maintenance', 'gain'] as const);
      const target = goal === 'loss' ? profile.currentWeightKg * 0.9 : goal === 'gain' ? profile.currentWeightKg * 1.08 : profile.currentWeightKg;
      const plan = buildGoalPlan(ctx, { goal, weeklyRate: goal === 'loss' ? 0.005 : goal === 'gain' ? 0.0025 : 0, targetWeightKg: target, stepTarget: profile.averageSteps7d });
      if (plan.status !== 'ok') continue;
      out.push({ ctx, calories: plan.calorieTargetKcal as number, steps: profile.averageSteps7d, goal });
    }
    return out;
  }

  const cases = randomCases(40);

  it('more steps never reduce allowed calories, fewer steps never increase them, trajectory preserved', () => {
    for (const c of cases) {
      const baseline = { goal: c.goal, scenario: { calorieTargetKcal: c.calories, stepsPerDay: c.steps } };
      const bounds = sliderBounds(c.steps);
      const w42 = weightAtDay(c.ctx, c.goal, baseline.scenario, 42);
      let prev = -Infinity;
      for (let s = bounds.minSteps; s <= bounds.maxSteps; s += 1000) {
        const pt = solveSliderPoint(c.ctx, baseline, s, w42);
        expect(pt.calorieTargetKcal).toBeGreaterThanOrEqual(prev - 1);
        prev = pt.calorieTargetKcal;
        expect(Math.abs(pt.weightAtHorizonKg - w42)).toBeLessThanOrEqual(0.05);
      }
    }
  });

  it('saved (rounded) points respect the floor and the step range', () => {
    for (const c of cases.slice(0, 15)) {
      const baseline = { goal: c.goal, scenario: { calorieTargetKcal: c.calories, stepsPerDay: c.steps } };
      const bounds = sliderBounds(c.steps);
      const minFeasible = effectiveMinSliderSteps(c.ctx, baseline);
      expect(minFeasible).toBeGreaterThanOrEqual(bounds.minSteps);
      const pt = solveRoundedSliderPoint(c.ctx, baseline, minFeasible + 37);
      expect(pt.stepsPerDay % 100).toBe(0);
      if (pt.stepsPerDay >= minFeasible) expect(pt.calorieTargetKcal).toBeGreaterThanOrEqual(hardFloorKcal(c.ctx.reeKcal, c.ctx.sex) - 1e-6);
      expect(bounds.maxSteps).toBeLessThanOrEqual(30000);
    }
  });

  it('no discontinuity at NASEM PAL boundaries while dragging (PAL is not reclassified)', () => {
    for (const c of cases.slice(0, 10)) {
      const baseline = { goal: c.goal, scenario: { calorieTargetKcal: c.calories, stepsPerDay: c.steps } };
      const w42 = weightAtDay(c.ctx, c.goal, baseline.scenario, 42);
      const bounds = sliderBounds(c.steps);
      let prev: number | null = null;
      for (let s = bounds.minSteps; s <= bounds.maxSteps; s += 100) {
        const kcal = solveSliderPoint(c.ctx, baseline, s, w42).calorieTargetKcal;
        if (prev !== null) expect(Math.abs(kcal - prev)).toBeLessThan(15);
        prev = kcal;
      }
    }
  });

  it('bounds follow the specified usability limits', () => {
    expect(sliderBounds(8200)).toEqual({ minSteps: 2200, maxSteps: 18200, recommendedMinSteps: 5200, recommendedMaxSteps: 11200 });
    expect(sliderBounds(3000)).toEqual({ minSteps: 2000, maxSteps: 13000, recommendedMinSteps: 2000, recommendedMaxSteps: 6000 });
    expect(sliderBounds(15000).maxSteps).toBe(20000);
  });
});

describe('static policy: no prototype placeholder science in production code (06 s12, 04 s12)', () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });
  }
  const sources = files('src').map((f) => [f, readFileSync(f, 'utf8')] as const);
  const forbidden: Array<[RegExp, string]> = [
    [/1980\s*\+\s*4\.55/, 'prototype kcal slider formula'],
    [/5600\s*\+\s*66/, 'prototype steps slider formula'],
    [/\(bSteps\s*-\s*8500\)\s*\*\s*0\.04/, 'prototype kcal per step'],
    [/\/\s*1100\b/, 'prototype kg per week divisor'],
    [/\b7700\b/, '7700 kcal per kg rule'],
    [/\b3500\s*\*?\s*(kcal|lb)/i, '3500 kcal per lb rule'],
    [/\b500\s*kcal\s*deficit/i, 'fixed 500 kcal deficit'],
    [/KCAL_PER_STEP|kcalPerStep\s*=/, 'fixed kcal per step conversion'],
    [/ree\w*\s*\*\s*(activityFactor|activity_multiplier|1\.55)/i, 'REE x activity factor'],
  ];
  for (const [re, label] of forbidden) {
    it(`absent: ${label}`, () => {
      for (const [file, src] of sources) expect(re.test(src), `${label} in ${file}`).toBe(false);
    });
  }
});
