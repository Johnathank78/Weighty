import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { nasemEerKcalDay } from '@/science/nasem';
import { referenceTefKcalDay, tefDeltaKcalDay, tefKcalDay } from '@/science/tef';
import { assessBaseline } from '@/science/assessment';
import type { PalCategory, SexForEquation } from '@/science/types';
import { makeProfile } from '../helpers/profiles';

describe('NASEM 2023 EER (06 s3)', () => {
  const cases: Array<[SexForEquation, PalCategory, number, number, number, number]> = [
    ['male', 'inactive', 753.07, 6.5, 14.1, 10.83],
    ['male', 'low_active', 581.47, 8.3, 14.94, 10.83],
    ['male', 'active', 1004.82, 6.52, 15.91, 10.83],
    ['male', 'very_active', -517.88, 15.61, 19.11, 10.83],
    ['female', 'inactive', 584.9, 5.72, 11.71, 7.01],
    ['female', 'low_active', 575.77, 6.6, 12.14, 7.01],
    ['female', 'active', 710.25, 6.54, 12.34, 7.01],
    ['female', 'very_active', 511.83, 9.07, 12.56, 7.01],
  ];
  for (const [sex, pal, a, h, w, age] of cases) {
    it(`${sex} ${pal} formula`, () => {
      const expected = a - age * 40 + h * 170 + w * 70;
      expect(Math.abs(nasemEerKcalDay({ sex, palCategory: pal, ageYears: 40, heightCm: 170, weightKg: 70 }) - expected)).toBeLessThan(1e-9);
    });
  }

  it('official female example: 22 y, 165 cm, 63 kg, low active = 2275 kcal/day', () => {
    expect(Math.abs(nasemEerKcalDay({ sex: 'female', ageYears: 22, heightCm: 165, weightKg: 63, palCategory: 'low_active' }) - 2275)).toBeLessThanOrEqual(1);
  });

  it('official-style male example: 45 y, 175 cm, 100 kg, low active ~3041 kcal/day', () => {
    expect(Math.abs(nasemEerKcalDay({ sex: 'male', ageYears: 45, heightCm: 175, weightKg: 100, palCategory: 'low_active' }) - 3041)).toBeLessThanOrEqual(1);
  });
});

describe('TEF (06 s8)', () => {
  it('central TEF example = 250.75 kcal', () => {
    expect(Math.abs(tefKcalDay({ proteinG: 160, carbsG: 250, fatG: 70 }) - 250.75)).toBeLessThan(1e-9);
  });

  it('only the delta vs the 10 percent reference adjusts a scenario', () => {
    expect(referenceTefKcalDay(2500)).toBeCloseTo(250, 9);
    expect(tefDeltaKcalDay({ proteinG: 160, carbsG: 250, fatG: 70 }, 2500)).toBeCloseTo(0.75, 9);
  });

  it('regression: population TDEE equals the bare NASEM equation (no additive TEF)', () => {
    const profile = makeProfile({ ageYears: 22, heightCm: 165, currentWeightKg: 63, averageSteps7d: 9000 });
    const a = assessBaseline(profile, '2026-09-13');
    const bare = nasemEerKcalDay({ sex: 'female', ageYears: 22, heightCm: 165, weightKg: 63, palCategory: a.palCategory });
    expect(a.populationTdeeKcal).toBe(bare);
  });

  it('static: the NASEM module does not depend on the TEF module', () => {
    const src = readFileSync('src/science/nasem.ts', 'utf8');
    expect(src).not.toMatch(/from '\.\/tef'/);
    expect(src).not.toMatch(/tefKcalDay|TEF_/);
  });
});
