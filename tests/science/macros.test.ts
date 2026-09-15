import { describe, expect, it } from 'vitest';
import { bmi, classifyMacroActivity, computeMacros, nutritionReferenceWeightKg } from '@/science/macros';
import type { MacroInput } from '@/science/macros';
import { assessBaseline } from '@/science/assessment';
import { createRng } from '../helpers/random';
import { makeProfile } from '../helpers/profiles';

function randomMacroInputs(n: number, seed: number): MacroInput[] {
  const rng = createRng(seed);
  const out: MacroInput[] = [];
  while (out.length < n) {
    const heightCm = rng.uniform(150, 200);
    const weightKg = rng.uniform(48, 160);
    const b = bmi(weightKg, heightCm);
    if (b < 17 || b > 55) continue;
    out.push({
      weightKg,
      heightCm,
      athleteLike: rng.chance(0.2),
      activityClass: rng.pick(['sedentary', 'endurance', 'resistance', 'mixed'] as const),
      goal: rng.pick(['loss', 'maintenance', 'gain'] as const),
      calorieTargetKcal: rng.uniform(1200, 4200),
      ...(rng.chance(0.3) ? { bodyFatPercent: rng.uniform(8, 40), bodyFatMethod: rng.pick(['dxa', 'consumer_bia', 'skinfold', 'four_compartment'] as const) } : {}),
    });
  }
  return out;
}

describe('macro engine properties (06 s9)', () => {
  const fixtures = randomMacroInputs(400, 99);
  it('holds for at least 50 fixture profiles', () => {
    let feasibleCount = 0;
    for (const input of fixtures) {
      const r = computeMacros(input);
      if (!r.feasible) {
        expect(r.exact.carbsG).toBeLessThan(0);
        continue;
      }
      feasibleCount++;
      expect(r.display.proteinG).toBeGreaterThanOrEqual(0);
      expect(r.display.fatG).toBeGreaterThanOrEqual(0);
      expect(r.display.carbsG).toBeGreaterThanOrEqual(0);
      expect(Math.abs(r.displayMacroEnergyKcal - r.displayCalorieTargetKcal)).toBeLessThanOrEqual(5);
      expect(r.exact.proteinG).toBeLessThanOrEqual(2.2 * input.weightKg + 1e-9);
      expect((r.exact.fatG * 9) / input.calorieTargetKcal).toBeGreaterThanOrEqual(0.2 - 1e-12);
      expect(4 * r.exact.proteinG + 4 * r.exact.carbsG + 9 * r.exact.fatG).toBeCloseTo(input.calorieTargetKcal, 6);
    }
    expect(feasibleCount).toBeGreaterThanOrEqual(50);
  });

  it('rounding reconciles to the displayed 10 kcal target', () => {
    const r = computeMacros({ weightKg: 76.8, heightCm: 172, athleteLike: false, activityClass: 'resistance', goal: 'loss', calorieTargetKcal: 2034.02 });
    expect(r.displayCalorieTargetKcal).toBe(2030);
    expect(Math.abs(r.displayMacroEnergyKcal - 2030)).toBeLessThanOrEqual(5);
  });

  it('selects the specified protein rules', () => {
    const base = { weightKg: 70, heightCm: 175, athleteLike: false, calorieTargetKcal: 2500 };
    expect(computeMacros({ ...base, activityClass: 'sedentary', goal: 'maintenance' }).exact.proteinG).toBeCloseTo(84, 9);
    expect(computeMacros({ ...base, activityClass: 'endurance', goal: 'gain' }).exact.proteinG).toBeCloseTo(112, 9);
    expect(computeMacros({ ...base, activityClass: 'resistance', goal: 'maintenance' }).exact.proteinG).toBeCloseTo(112, 9);
    expect(computeMacros({ ...base, activityClass: 'sedentary', goal: 'loss' }).exact.proteinG).toBeCloseTo(112, 9);
    expect(computeMacros({ ...base, activityClass: 'resistance', goal: 'loss' }).exact.proteinG).toBeCloseTo(126, 9);
    const athlete = computeMacros({ ...base, athleteLike: true, activityClass: 'resistance', goal: 'loss', bodyFatPercent: 12, bodyFatMethod: 'dxa' });
    // max(1.8*70=126, 2.3*61.6=141.68) then cap 2.2*70=154
    expect(athlete.exact.proteinG).toBeCloseTo(141.68, 9);
    expect(athlete.proteinRule).toBe('athlete_loss_ffm_2_3');
  });

  it('applies the 2.2 g/kg actual weight cap', () => {
    const r = computeMacros({ weightKg: 50, heightCm: 150, athleteLike: true, activityClass: 'resistance', goal: 'loss', calorieTargetKcal: 2000, bodyFatPercent: 3.5, bodyFatMethod: 'dxa' });
    expect(r.exact.proteinG).toBeLessThanOrEqual(110 + 1e-9);
  });

  it('rejects infeasible plans rather than forcing carbohydrate negative', () => {
    const r = computeMacros({ weightKg: 150, heightCm: 200, athleteLike: false, activityClass: 'resistance', goal: 'loss', calorieTargetKcal: 1200 });
    expect(r.feasible).toBe(false);
    expect(r.display.carbsG).toBeGreaterThanOrEqual(0);
  });

  it('flags low carbohydrate for endurance and resistance as soft guidance', () => {
    const r = computeMacros({ weightKg: 70, heightCm: 175, athleteLike: false, activityClass: 'mixed', goal: 'loss', calorieTargetKcal: 1500 });
    expect(r.lowCarbForEndurance).toBe(true);
    expect(r.feasible).toBe(true);
  });
});

describe('continuous nutrition reference weight (03 s1, D-21)', () => {
  const bmi25 = 25 * 1.75 * 1.75; // 76.5625 kg at 175 cm

  it('actual weight up to the BMI 25 weight, then BMI 25 weight + 0.33 of the excess', () => {
    expect(nutritionReferenceWeightKg(70, 175)).toBe(70);
    expect(nutritionReferenceWeightKg(bmi25, 175)).toBeCloseTo(bmi25, 12);
    expect(nutritionReferenceWeightKg(90, 175)).toBeCloseTo(bmi25 + 0.33 * (90 - bmi25), 9);
    expect(nutritionReferenceWeightKg(110, 175)).toBeCloseTo(bmi25 + 0.33 * (110 - bmi25), 9);
    const r = computeMacros({ weightKg: 110, heightCm: 175, athleteLike: false, activityClass: 'sedentary', goal: 'loss', calorieTargetKcal: 2200 });
    expect(r.exact.proteinG).toBeCloseTo(1.6 * (bmi25 + 0.33 * (110 - bmi25)), 9);
  });

  it('is continuous and monotone around BMI 25 and BMI 30 (no step, no exemption)', () => {
    for (const heightCm of [150, 165, 175, 190, 205]) {
      const h2 = (heightCm / 100) ** 2;
      for (const bmiPoint of [25, 30]) {
        const w = bmiPoint * h2;
        for (const eps of [1e-3, 1e-6]) {
          const below = nutritionReferenceWeightKg(w - eps, heightCm);
          const above = nutritionReferenceWeightKg(w + eps, heightCm);
          expect(above - below).toBeGreaterThanOrEqual(0);
          expect(above - below).toBeLessThanOrEqual(2 * eps + 1e-9);
        }
      }
      let prev = -Infinity;
      for (let w = 20 * h2; w <= 45 * h2; w += 0.05) {
        const ref = nutritionReferenceWeightKg(w, heightCm);
        expect(ref).toBeGreaterThanOrEqual(prev);
        expect(ref).toBeLessThanOrEqual(w + 1e-9);
        prev = ref;
      }
    }
  });

  it('protein, fat floor and carbohydrate flags move continuously across BMI 25 and 30', () => {
    for (const goal of ['loss', 'maintenance', 'gain'] as const) {
      for (const activityClass of ['sedentary', 'endurance', 'resistance', 'mixed'] as const) {
        for (const bmiPoint of [25, 30]) {
          const w = bmiPoint * 1.75 * 1.75;
          const lo = computeMacros({ weightKg: w - 0.01, heightCm: 175, athleteLike: false, activityClass, goal, calorieTargetKcal: 2400 });
          const hi = computeMacros({ weightKg: w + 0.01, heightCm: 175, athleteLike: false, activityClass, goal, calorieTargetKcal: 2400 });
          expect(Math.abs(hi.exact.proteinG - lo.exact.proteinG)).toBeLessThan(0.05);
          expect(Math.abs(hi.exact.fatG - lo.exact.fatG)).toBeLessThan(0.05);
          expect(Math.abs(hi.exact.carbsG - lo.exact.carbsG)).toBeLessThan(0.1);
        }
      }
    }
  });
});

describe('obesity handling (03 s8, 06 s9)', () => {
  it('above the BMI 25 weight, g/kg rules use the reference weight, below actual weight', () => {
    expect(nutritionReferenceWeightKg(90, 175)).toBeLessThan(90);
    expect(nutritionReferenceWeightKg(60, 175)).toBe(60);
  });

  it('actual body weight remains unchanged for TDEE equations', () => {
    const profile = makeProfile({ sexForEquation: 'male', ageYears: 45, heightCm: 175, currentWeightKg: 110 });
    const a = assessBaseline(profile, '2026-09-13');
    expect(a.weightKg).toBe(110);
    expect(a.populationTdeeKcal).toBeGreaterThan(assessBaseline({ ...profile, currentWeightKg: 76.6 }, '2026-09-13').populationTdeeKcal);
  });

  it('BIA does not activate the FFM override', () => {
    const r = computeMacros({ weightKg: 80, heightCm: 180, athleteLike: true, activityClass: 'resistance', goal: 'loss', calorieTargetKcal: 2400, bodyFatPercent: 10, bodyFatMethod: 'consumer_bia' });
    expect(r.ffmOverrideKg).toBeNull();
    expect(r.proteinRule).toBe('loss_resistance_1_8');
  });
});

describe('macro activity classification (03 s5)', () => {
  it('mixed = resistance criteria met AND endurance volume >= 150 min/week (official v1 definition)', () => {
    const strength = { type: 'strength' as const, sessionsPerWeek: 2, durationMin: 30, intensity: 'moderate' as const };
    expect(classifyMacroActivity([strength, { type: 'cycling', sessionsPerWeek: 3, durationMin: 50, intensity: 'moderate' }])).toBe('mixed');
    expect(classifyMacroActivity([strength, { type: 'cycling', sessionsPerWeek: 3, durationMin: 49, intensity: 'moderate' }])).toBe('resistance');
    expect(classifyMacroActivity([{ ...strength, sessionsPerWeek: 1, durationMin: 90 }, { type: 'cycling', sessionsPerWeek: 3, durationMin: 50, intensity: 'moderate' }])).toBe('endurance');
    expect(classifyMacroActivity([{ ...strength, durationMin: 29 }, { type: 'cycling', sessionsPerWeek: 3, durationMin: 50, intensity: 'moderate' }])).toBe('sedentary');
  });

  it('routes sedentary, resistance, endurance and mixed', () => {
    expect(classifyMacroActivity([])).toBe('sedentary');
    expect(classifyMacroActivity([{ type: 'strength', sessionsPerWeek: 2, durationMin: 30, intensity: 'moderate' }])).toBe('resistance');
    expect(classifyMacroActivity([{ type: 'strength', sessionsPerWeek: 1, durationMin: 90, intensity: 'moderate' }])).toBe('sedentary');
    expect(classifyMacroActivity([{ type: 'running', sessionsPerWeek: 3, durationMin: 50, intensity: 'moderate' }])).toBe('endurance');
    expect(
      classifyMacroActivity([
        { type: 'running', sessionsPerWeek: 3, durationMin: 50, intensity: 'moderate' },
        { type: 'strength', sessionsPerWeek: 2, durationMin: 45, intensity: 'moderate' },
      ]),
    ).toBe('mixed');
  });
});
