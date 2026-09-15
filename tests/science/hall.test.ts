import { describe, expect, it } from 'vitest';
import reference from '../fixtures/hall-reference.json';
import { readFileSync } from 'node:fs';
import { advance, baselineInput, constantInput, deltaClampBaselineIntakeKcal, derivatives, HallDomainError, initialState, initializeHall, isAdmissibleBaselineIntake, minAdmissibleBaselineIntakeKcal, simulateHall, stableSubsteps } from '@/science/hall/model';
import type { HallDailyInput } from '@/science/hall/model';
import { HALL_BETA_TEF, HALL_MIN_BASELINE_INTAKE_KCAL } from '@/science/constants';
import { assessBaseline, planContextFrom } from '@/science/assessment';
import { hallInputFor, hallParametersFor, weightAtDay } from '@/science/goals';
import { makeProfile } from '../helpers/profiles';

type RefScenario = (typeof reference.scenarios)[number];

const TOLERANCE_KG: Record<string, number> = { '90': 0.2, '180': 0.35, '365': 0.5 };

function runScenario(s: RefScenario, dtDays = 1) {
  const p = initializeHall({
    sex: s.sex === 'female' ? 'female' : 'male',
    ageYears: s.ageYears,
    heightM: s.heightM,
    bodyWeightKg: s.bodyWeightKg,
    baselineIntakeKcal: s.baselineIntakeKcal,
    baselineRmrKcal: s.baselineRmrKcal,
    baselineCarbFraction: s.baselineCarbFraction,
  });
  const intake = s.baselineIntakeKcal + s.intakeChangeKcal;
  const u: HallDailyInput = {
    intakeKcal: intake,
    carbKcal: s.carbFraction * intake,
    paDeltaKcalPerKgDay: s.paDeltaKcalPerKgDay,
    sodiumDeltaMg: 0,
  };
  return simulateHall(p, reference.horizonDays, constantInput(u), { dtDays });
}

describe('Hall model reference validation (06 s11, release blocking)', () => {
  it('has at least 12 reference scenarios spanning the required matrix', () => {
    const s = reference.scenarios;
    expect(s.length).toBeGreaterThanOrEqual(12);
    expect(s.some((x) => x.sex === 'female') && s.some((x) => x.sex === 'male')).toBe(true);
    expect(s.some((x) => x.ageYears < 30) && s.some((x) => x.ageYears >= 40 && x.ageYears < 50) && s.some((x) => x.ageYears >= 60)).toBe(true);
    const bmis = s.map((x) => x.bodyWeightKg / (x.heightM * x.heightM));
    expect(bmis.some((b) => b < 25) && bmis.some((b) => b >= 25 && b < 30) && bmis.some((b) => b >= 30)).toBe(true);
    expect(s.some((x) => x.intakeChangeKcal < 0) && s.some((x) => x.intakeChangeKcal > 0)).toBe(true);
    expect(s.some((x) => x.paDeltaKcalPerKgDay !== 0 && x.intakeChangeKcal === 0)).toBe(true);
  });

  for (const scenario of reference.scenarios) {
    it(`matches reference trajectory: ${scenario.id}`, () => {
      const result = runScenario(scenario);
      for (const [day, tol] of Object.entries(TOLERANCE_KG)) {
        const ours = result.days.find((d) => d.day === Number(day));
        const ref = scenario.weightKgByDay[day as keyof typeof scenario.weightKgByDay];
        expect(ours, `day ${day}`).toBeDefined();
        expect(Math.abs((ours?.bodyWeightKg ?? NaN) - ref), `${scenario.id} day ${day}`).toBeLessThanOrEqual(tol);
      }
    });
  }

  it('is insensitive to the integration step (dt 1 day vs 0.1 day)', () => {
    for (const scenario of reference.scenarios.slice(0, 4)) {
      const coarse = runScenario(scenario, 1);
      const fine = runScenario(scenario, 0.1);
      const c = coarse.days.find((d) => d.day === 365)?.bodyWeightKg ?? NaN;
      const f = fine.days.find((d) => d.day === 365)?.bodyWeightKg ?? NaN;
      expect(Math.abs(c - f)).toBeLessThan(0.05);
    }
  });
});

describe('Hall model baseline stability (04 s1)', () => {
  const profiles = [
    { sex: 'female' as const, ageYears: 30, heightM: 1.65, bodyWeightKg: 62, baselineIntakeKcal: 2200, baselineRmrKcal: 1380 },
    { sex: 'male' as const, ageYears: 50, heightM: 1.78, bodyWeightKg: 105, baselineIntakeKcal: 3000, baselineRmrKcal: 1960 },
    { sex: 'female' as const, ageYears: 64, heightM: 1.58, bodyWeightKg: 90, baselineIntakeKcal: 2000, baselineRmrKcal: 1500 },
  ];
  it('drifts less than 0.05 kg over 30 days at baseline (native Hall 2011 TEF)', () => {
    for (const prof of profiles) {
      const p = initializeHall({ ...prof, baselineCarbFraction: 0.5 });
      const u = baselineInput(p);
      const r = simulateHall(p, 30, constantInput(u));
      const last = r.days[r.days.length - 1];
      expect(Math.abs((last?.bodyWeightKg ?? NaN) - prof.bodyWeightKg)).toBeLessThan(0.05);
      expect(Math.abs((r.days[0]?.energyExpenditureKcal ?? NaN) - prof.baselineIntakeKcal)).toBeLessThan(1e-6);
    }
  });

  it('responds monotonically to intake', () => {
    const p = initializeHall({ ...profiles[0]!, baselineCarbFraction: 0.5 });
    const w = (dEi: number) => {
      const intake = 2200 + dEi;
      const r = simulateHall(p, 42, constantInput({ intakeKcal: intake, carbKcal: 0.5 * intake, paDeltaKcalPerKgDay: 0, sodiumDeltaMg: 0 }));
      return r.days[r.days.length - 1]?.bodyWeightKg ?? NaN;
    };
    expect(w(-500)).toBeLessThan(w(-250));
    expect(w(-250)).toBeLessThan(w(0));
    expect(w(0)).toBeLessThan(w(300));
  });
});

describe('TEF in the production Hall model (D-01, no double counting)', () => {
  const TODAY = '2026-09-13';

  it('the production mode is the validated native Hall 2011 TEF, beta = 0.10', () => {
    expect(HALL_BETA_TEF).toBe(0.1);
    const src = readFileSync('src/science/hall/model.ts', 'utf8');
    expect(src).not.toMatch(/macro_specific|tefMode|tefKcal|from '\.\.\/tef'/);
    expect(src).toMatch(/HALL_BETA_TEF \* \(u\.intakeKcal - p\.input\.baselineIntakeKcal\)/);
  });

  it('the daily input carries no TEF value, so macro-specific TEF cannot reach the trajectory', () => {
    const profile = makeProfile({ sexForEquation: 'male', ageYears: 35, heightCm: 180, currentWeightKg: 85, goal: 'loss', targetWeightKg: 78, weeklyRateTarget: 0.005 });
    const a = assessBaseline(profile, TODAY);
    const ctx = planContextFrom(profile, a, a.populationTdeeKcal);
    expect(Object.keys(hallInputFor(ctx, 'loss', { calorieTargetKcal: 2200, stepsPerDay: 7000 })).sort()).toEqual(['carbKcal', 'intakeKcal', 'paDeltaKcalPerKgDay', 'sodiumDeltaMg']);
    // @ts-expect-error tefKcal is not part of the Hall daily input any more.
    const withTef: HallDailyInput = { intakeKcal: 2200, carbKcal: 1000, paDeltaKcalPerKgDay: 0, sodiumDeltaMg: 0, tefKcal: 999 };
    const p = hallParametersFor(ctx, 'loss');
    const base = derivatives(p, initialState(p), { intakeKcal: 2200, carbKcal: 1000, paDeltaKcalPerKgDay: 0, sodiumDeltaMg: 0 });
    expect(derivatives(p, initialState(p), withTef)).toEqual(base);
  });

  it('protein-rich and protein-poor plans with equal calories and carbohydrate follow the same trajectory', () => {
    const sedentary = makeProfile({ ageYears: 30, heightCm: 168, currentWeightKg: 72, goal: 'loss', targetWeightKg: 66, weeklyRateTarget: 0.005 });
    const trained = { ...sedentary, activities: [{ type: 'strength' as const, sessionsPerWeek: 3, durationMin: 60, intensity: 'moderate' as const }] };
    const aS = assessBaseline(sedentary, TODAY);
    const aT = assessBaseline(trained, TODAY);
    const ctxS = planContextFrom(sedentary, aS, 2100);
    const ctxT = planContextFrom(trained, aT, 2100);
    const pS = hallParametersFor(ctxS, 'loss');
    const pT = hallParametersFor(ctxT, 'loss');
    const u = { intakeKcal: 1700, carbKcal: 700, paDeltaKcalPerKgDay: 0, sodiumDeltaMg: 0 };
    // Different macro rules (1.6 vs 1.8 g/kg protein) only matter through carbohydrate; with carbs equal the paths match.
    const baseline = { ...pT, carbIntakeBaselineKcal: pS.carbIntakeBaselineKcal, kG: pS.kG };
    const a = simulateHall(pS, 90, () => u).days.at(-1)?.bodyWeightKg;
    const b = simulateHall(baseline, 90, () => u).days.at(-1)?.bodyWeightKg;
    expect(a).toBeCloseTo(b as number, 9);
    expect(weightAtDay(ctxS, 'loss', { calorieTargetKcal: 2100, stepsPerDay: 7000 }, 60)).toBeCloseTo(72, 1);
  });
});

describe('admissible domain of the Hall initialisation (B1, D-28)', () => {
  const base = { sex: 'female' as const, ageYears: 30, heightM: 1.65, bodyWeightKg: 62, baselineIntakeKcal: 2200, baselineRmrKcal: 1380, baselineCarbFraction: 0.5 };
  const u = { intakeKcal: 1450, carbKcal: 725, paDeltaKcalPerKgDay: 0, sodiumDeltaMg: 0 };

  it('a baseline intake at or below the admissible minimum is a typed error, never a frozen trajectory', () => {
    expect(minAdmissibleBaselineIntakeKcal()).toBe(HALL_MIN_BASELINE_INTAKE_KCAL);
    for (const intake of [0, -50, -300, HALL_MIN_BASELINE_INTAKE_KCAL, Number.NaN]) {
      expect(isAdmissibleBaselineIntake(intake)).toBe(false);
      expect(() => initializeHall({ ...base, baselineIntakeKcal: intake })).toThrow(HallDomainError);
    }
    expect(isAdmissibleBaselineIntake(HALL_MIN_BASELINE_INTAKE_KCAL + 0.5)).toBe(true);
    const low = initializeHall({ ...base, baselineIntakeKcal: HALL_MIN_BASELINE_INTAKE_KCAL + 0.5 });
    // Just above the bound the model runs (absurd physiology, but no silent freeze).
    expect(simulateHall(low, 14, () => u).days.at(-1)?.bodyWeightKg).not.toBe(base.bodyWeightKg);
    expect(() => initializeHall({ ...base, baselineCarbFraction: 0 })).toThrow(HallDomainError);
  });

  it('kG <= 0 (the former freeze: stableSubsteps NaN, no integration step) now throws at every entry point', () => {
    const p = initializeHall(base);
    for (const kG of [0, -106.5]) {
      const broken = { ...p, kG };
      expect(() => stableSubsteps(broken, u, 1)).toThrow(HallDomainError);
      expect(() => advance(broken, initialState(broken), u, 1)).toThrow(HallDomainError);
      expect(() => simulateHall(broken, 14, () => u)).toThrow(HallDomainError);
    }
  });

  it('stableSubsteps is finite and at least 1 over the admissible range', () => {
    for (const intake of [HALL_MIN_BASELINE_INTAKE_KCAL + 0.5, 83, 400, 1200, 2200, 6000]) {
      const p = initializeHall({ ...base, baselineIntakeKcal: intake });
      for (const daily of [0, 800, 1450, 6000]) {
        const n = stableSubsteps(p, { ...u, intakeKcal: daily, carbKcal: 0.5 * daily }, 1);
        expect(Number.isFinite(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('exposes the delta-clamp threshold RMR / (1 - beta_TEF) as a diagnostic matching the clamp', () => {
    const threshold = deltaClampBaselineIntakeKcal(base.baselineRmrKcal);
    expect(threshold).toBeCloseTo(base.baselineRmrKcal / 0.9, 9);
    expect(initializeHall({ ...base, baselineIntakeKcal: threshold - 1 }).deltaClamped).toBe(true);
    expect(initializeHall({ ...base, baselineIntakeKcal: threshold + 1 }).deltaClamped).toBe(false);
  });
});

describe('numerical stability at high carbohydrate intake (N-01)', () => {
  const heavy = { sex: 'male' as const, ageYears: 27, heightM: 1.796, bodyWeightKg: 199, baselineIntakeKcal: 5800, baselineRmrKcal: 3430, baselineCarbFraction: 0.62 };
  const u = { intakeKcal: 7030, carbKcal: 0.62 * 7030 * 1.03, paDeltaKcalPerKgDay: 0, sodiumDeltaMg: 0 };

  it('ordinary intakes keep a single RK4 step per day (validated reference path unchanged)', () => {
    for (const scenario of reference.scenarios) {
      const p = initializeHall({ sex: scenario.sex === 'female' ? 'female' : 'male', ageYears: scenario.ageYears, heightM: scenario.heightM, bodyWeightKg: scenario.bodyWeightKg, baselineIntakeKcal: scenario.baselineIntakeKcal, baselineRmrKcal: scenario.baselineRmrKcal, baselineCarbFraction: scenario.baselineCarbFraction });
      const intake = scenario.baselineIntakeKcal + scenario.intakeChangeKcal;
      expect(stableSubsteps(p, { intakeKcal: intake, carbKcal: scenario.carbFraction * intake, paDeltaKcalPerKgDay: 0, sodiumDeltaMg: 0 }, 1)).toBe(1);
    }
  });

  it('sub-steps a stiff glycogen equation: glycogen stays positive, dt 1 day matches dt 0.1 day, and weight is continuous', () => {
    const p = initializeHall(heavy);
    expect(stableSubsteps(p, u, 1)).toBeGreaterThan(1);
    const coarse = simulateHall(p, 84, () => u).days.at(-1)!;
    const fine = simulateHall(p, 84, () => u, { dtDays: 0.1 }).days.at(-1)!;
    expect(coarse.glycogenKg).toBeGreaterThan(0);
    expect(Math.abs(coarse.bodyWeightKg - fine.bodyWeightKg)).toBeLessThan(0.02);
    let prev: number | null = null;
    for (let dw = 0; dw <= 0.1001; dw += 0.02) {
      const w = simulateHall(initializeHall({ ...heavy, bodyWeightKg: heavy.bodyWeightKg + dw }), 84, () => u).days.at(-1)!.bodyWeightKg;
      if (prev !== null) expect(Math.abs(w - prev - 0.02)).toBeLessThan(0.02);
      prev = w;
    }
  });
});
