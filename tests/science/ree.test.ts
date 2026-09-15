import { describe, expect, it } from 'vitest';
import {
  cunninghamKcalDay,
  evaluateMeasuredRmr,
  isAthleteLike,
  mifflinStJeorKcalDay,
  routeRee,
  tenHaafFfmKcalDay,
  tenHaafWeightKcalDay,
} from '@/science/ree';
import { validateAge, validateProfile } from '@/science/validation';
import { makeProfile } from '../helpers/profiles';

const TODAY = '2026-09-13';

describe('Mifflin-St Jeor (06 s2)', () => {
  it('male example 1780 kcal/day', () => {
    expect(Math.abs(mifflinStJeorKcalDay({ sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80 }) - 1780)).toBeLessThan(1e-9);
  });
  it('female example 1320.25 kcal/day', () => {
    expect(Math.abs(mifflinStJeorKcalDay({ sex: 'female', ageYears: 30, heightCm: 165, weightKg: 60 }) - 1320.25)).toBeLessThan(1e-9);
  });
});

describe('ten Haaf (06 s2)', () => {
  it('weight-based equation for both sexes with height in metres', () => {
    const male = 11.936 * 75 + 587.728 * 1.8 - 8.129 * 25 + 191.027 + 29.279;
    const female = 11.936 * 60 + 587.728 * 1.68 - 8.129 * 25 + 29.279;
    expect(Math.abs(tenHaafWeightKcalDay({ sex: 'male', ageYears: 25, heightM: 1.8, weightKg: 75 }) - male)).toBeLessThan(1e-9);
    expect(Math.abs(tenHaafWeightKcalDay({ sex: 'female', ageYears: 25, heightM: 1.68, weightKg: 60 }) - female)).toBeLessThan(1e-9);
  });

  it('regression: the router converts centimetres to metres (no centimetre input)', () => {
    const profile = makeProfile({ ageYears: 25, sexForEquation: 'male', heightCm: 180, currentWeightKg: 75, activities: [{ type: 'running', sessionsPerWeek: 4, durationMin: 90, intensity: 'moderate' }] });
    const routed = routeRee(profile, TODAY);
    expect(routed.method).toBe('ten_haaf_weight');
    const metres = tenHaafWeightKcalDay({ sex: 'male', ageYears: 25, heightM: 1.8, weightKg: 75 });
    const wrongCm = tenHaafWeightKcalDay({ sex: 'male', ageYears: 25, heightM: 180, weightKg: 75 });
    expect(routed.reeKcalDay).toBeCloseTo(metres, 9);
    expect(routed.reeKcalDay).toBeLessThan(3000);
    expect(wrongCm).toBeGreaterThan(100000);
  });

  it('FFM secondary equations', () => {
    expect(tenHaafFfmKcalDay(60)).toBeCloseTo(22.771 * 60 + 484.264, 9);
    expect(cunninghamKcalDay(60)).toBeCloseTo(500 + 22 * 60, 9);
  });
});

describe('router boundaries (06 s4)', () => {
  it('age domain 19-65 inclusive', () => {
    expect(validateAge(19)).toBeNull();
    expect(validateAge(65)).toBeNull();
    expect(validateAge(18)?.code).toBe('out_of_scope_age');
    expect(validateAge(66)?.code).toBe('out_of_scope_age');
    expect(validateProfile(makeProfile({ ageYears: 18 })).ok).toBe(false);
  });

  const rmr = { kcalPerDay: 1500, measuredAt: '2026-03-01', weightKgAtTest: 62, method: 'indirect_calorimetry' as const, conditionsKnown: true };

  it('valid indirect calorimetry is the primary anchor', () => {
    const r = routeRee(makeProfile({ measuredRmr: rmr }), TODAY);
    expect(r.method).toBe('measured_indirect_calorimetry');
    expect(r.reeKcalDay).toBe(1500);
  });

  it('test exactly 12 months old is valid, older falls back', () => {
    expect(evaluateMeasuredRmr({ ...rmr, measuredAt: '2025-09-13' }, 62, TODAY).kind).toBe('primary');
    const old = routeRee(makeProfile({ measuredRmr: { ...rmr, measuredAt: '2025-09-12' } }), TODAY);
    expect(old.method).toBe('mifflin_st_jeor');
    expect(old.measuredRmrStatus).toEqual({ kind: 'secondary', reasons: ['too_old'] });
  });

  it('weight change of 5 percent or more falls back', () => {
    const r = routeRee(makeProfile({ currentWeightKg: 65.5, measuredRmr: rmr }), TODAY);
    expect(r.method).toBe('mifflin_st_jeor');
    expect(evaluateMeasuredRmr(rmr, 62 * 1.049, TODAY).kind).toBe('primary');
    expect(evaluateMeasuredRmr(rmr, 62 * 1.05, TODAY).kind).toBe('secondary');
  });

  it('unknown method is stored as secondary reference only', () => {
    const r = routeRee(makeProfile({ measuredRmr: { ...rmr, method: 'unknown' } }), TODAY);
    expect(r.method).toBe('mifflin_st_jeor');
    expect(r.secondaryChecks.some((c) => c.equation === 'measured_rmr_secondary')).toBe(true);
  });

  const training = (hours: number, sessions: number) => [{ type: 'strength' as const, sessionsPerWeek: sessions, durationMin: (hours * 60) / sessions, intensity: 'moderate' as const }];

  it('athlete age 35, 6 h/week, 4 sessions routes to ten Haaf', () => {
    expect(routeRee(makeProfile({ ageYears: 35, activities: training(6, 4) }), TODAY).method).toBe('ten_haaf_weight');
  });
  it('athlete age 36 routes to Mifflin', () => {
    expect(routeRee(makeProfile({ ageYears: 36, activities: training(6, 4) }), TODAY).method).toBe('mifflin_st_jeor');
  });
  it('5.9 h/week does not activate athlete route', () => {
    expect(isAthleteLike(makeProfile({ ageYears: 30, activities: training(5.9, 4) }))).toBe(false);
  });
  it('3 sessions does not activate athlete route', () => {
    expect(isAthleteLike(makeProfile({ ageYears: 30, activities: training(8, 3) }))).toBe(false);
  });

  it('consumer BIA never activates an FFM route nor a secondary check', () => {
    const r = routeRee(makeProfile({ bodyFatPercent: 15, bodyFatMethod: 'consumer_bia' }), TODAY);
    expect(r.method).toBe('mifflin_st_jeor');
    expect(r.ffmKg).toBeNull();
    expect(r.secondaryChecks).toHaveLength(0);
    expect(r.reeModelDisagreement).toBe(false);
  });

  it('DXA FFM produces diagnostics and a disagreement flag above 10 percent, never averaging', () => {
    const lean = routeRee(makeProfile({ bodyFatPercent: 8, bodyFatMethod: 'dxa' }), TODAY);
    const mifflin = mifflinStJeorKcalDay({ sex: 'female', ageYears: 30, heightCm: 165, weightKg: 62 });
    expect(lean.method).toBe('mifflin_st_jeor');
    expect(lean.reeKcalDay).toBeCloseTo(mifflin, 9);
    const cunningham = 500 + 22 * 62 * 0.92;
    expect(lean.reeModelDisagreement).toBe(Math.abs(mifflin - cunningham) / mifflin > 0.1);
    expect(lean.reeModelDisagreement).toBe(true);
    const typical = routeRee(makeProfile({ bodyFatPercent: 32, bodyFatMethod: 'dxa' }), TODAY);
    expect(typical.reeModelDisagreement).toBe(false);
  });
});
