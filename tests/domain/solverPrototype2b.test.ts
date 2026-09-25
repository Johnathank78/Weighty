/**
 * Solver prototype of iteration 2b (prompt 38 s3): `solverHorizonDays` (science) and the periodic replan (domain), both
 * absent by default; the journal-mode modeled body and plan (s3.3) are covered by the equivalence test of
 * tests/experiments-journal/it2b/equiv2b.experiment.ts and by the fixture below.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { addWeight, applyRecalibration, buildPlanFromStore, calibrationInputFromStore, completeOnboarding, computeCalibrationState, ensureDailyLogs, periodicReplan, planAgeDays, setAdherence } from '@/domain/engine';
import type { SolverRequest } from '@/domain/engine';
import { addFoodEntry } from '@/domain/journal';
import { journalCalibrationInputFromStore } from '@/domain/journalCalibration';
import type { WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { assessBaseline, planContextFrom } from '@/science/assessment';
import { buildSnapshot, fitCalibration, reconstructDays } from '@/science/calibration';
import { addDays } from '@/science/dates';
import { buildGoalPlan, projectPlan, solveSliderPoint, solverOptionsActive, targetWeightAtHorizon } from '@/science/goals';
import type { PlanContext, SolverOptions } from '@/science/goals';
import { advance, bodyWeightOf, fatFromLean, initialState, initializeHall } from '@/science/hall/model';
import { modeledBodyAt } from '@/science/modeledBody';
import type { Goal, UserProfile } from '@/science/types';
import { journalGoalPlan } from '../helpers/closedLoop';
import { makeProfile } from '../helpers/profiles';
import { createRng } from '../helpers/random';

const TODAY = '2026-09-13';
const D0 = '2026-01-05';
const iso = (date: string) => `${date}T08:00:00.000Z`;
const K2: SolverRequest = { solverStart: 'currentState', rateDefinition: 'sustainedTissue', solverHorizonDays: 28 };
const FX: SolverRequest = { solverStart: 'currentState', rateDefinition: 'sustainedTissue' };

function ctxFor(profile: UserProfile): PlanContext {
  const a = assessBaseline(profile, TODAY);
  return planContextFrom(profile, a, a.populationTdeeKcal);
}

function randomProfiles(n: number, seed: number): UserProfile[] {
  const rng = createRng(seed);
  const out: UserProfile[] = [];
  for (let i = 0; i < n; i++) {
    const sex = rng.chance(0.5) ? 'female' : 'male';
    const heightCm = Math.round(sex === 'female' ? rng.uniform(152, 178) : rng.uniform(165, 195));
    const weight = Math.round(rng.uniform(22.5, 36) * (heightCm / 100) ** 2 * 10) / 10;
    const goal: Goal = (['loss', 'gain', 'maintenance'] as const)[i % 3] as Goal;
    out.push(
      makeProfile({
        sexForEquation: sex,
        heightCm,
        ageYears: Math.round(rng.uniform(19, 70)),
        currentWeightKg: weight,
        averageSteps7d: Math.round(rng.uniform(3000, 12000) / 100) * 100,
        goal,
        targetWeightKg: goal === 'loss' ? Math.round(weight * 0.85) : goal === 'gain' ? Math.round(weight * 1.1) : weight,
        weeklyRateTarget: goal === 'loss' ? 0.0075 : goal === 'gain' ? 0.0025 : 0,
      }),
    );
  }
  return out;
}

/**
 * Store of a follower of the onboarding plan for `days` days, weighed daily with the calibration's own model at
 * `offsetKcal` plus Gaussian noise; with `journal`, each day's plan target and carbohydrates are also logged in one entry.
 */
function followerStore(profile: UserProfile, offsetKcal: number, days: number, noiseKg: number, seed: number, journal: boolean, solver?: SolverRequest): { store: WheightyStore; today: string } {
  const onboarding = completeOnboarding(emptyStore(), profile, D0, iso(D0), null, solver);
  if (!onboarding.ok) throw new Error(onboarding.reason);
  const today = addDays(D0, days);
  let store = ensureDailyLogs(onboarding.store, today);
  for (let d = 0; d < days; d++) store = setAdherence(store, addDays(D0, d), 'on_plan');
  const plan = store.plan;
  if (!plan) throw new Error('no plan');
  if (journal) {
    for (let d = 0; d < days; d++) {
      const r = addFoodEntry(store, { kind: 'manual', food: { name: 'Jour', intake: { energyKcal: plan.calorieTarget, proteinG: plan.macros.proteinG, carbsG: plan.macros.carbsG, fatG: plan.macros.fatG }, grams: null }, date: addDays(D0, d), localTime: '12:00', consumedTime: '12:00' }, iso(addDays(D0, d)));
      if (!r.ok) throw new Error(r.reason);
      store = r.store;
    }
  }
  const input = calibrationInputFromStore(store, today);
  if (!input) throw new Error('no input');
  const recon = reconstructDays(input, D0, days);
  const p = initializeHall({ sex: input.sex, ageYears: input.ageYears, heightM: input.heightCm / 100, bodyWeightKg: profile.currentWeightKg, baselineIntakeKcal: input.populationTdeeAtStartKcal + offsetKcal, baselineRmrKcal: input.reeAtStartKcal, baselineCarbFraction: input.baselineCarbFraction });
  const rng = createRng(seed);
  let s = initialState(p);
  for (let d = 0; d < days; d++) {
    const r = recon[d] as (typeof recon)[number];
    s = advance(p, s, { intakeKcal: r.intakeKcal, carbKcal: r.carbKcal, paDeltaKcalPerKgDay: 0, sodiumDeltaMg: 0 }, 1);
    store = addWeight(store, { date: addDays(D0, d + 1), weightKg: bodyWeightOf(p, s) + noiseKg * rng.normal() }, iso(addDays(D0, d + 1)));
  }
  return { store, today };
}

describe('solverHorizonDays (prompt 38 s3.2)', () => {
  it('absent or 42 is the production solver exactly; 42 with the fix is the iteration 2a fix exactly', () => {
    for (const profile of randomProfiles(9, 38_001)) {
      const ctx = ctxFor(profile);
      const input = { goal: profile.goal, weeklyRate: profile.weeklyRateTarget, targetWeightKg: profile.targetWeightKg, stepTarget: profile.averageSteps7d };
      const reference = buildGoalPlan(ctx, input);
      const c42 = { ...ctx, solver: { solverHorizonDays: 42 } satisfies SolverOptions };
      expect(solverOptionsActive(c42)).toBe(false);
      expect(buildGoalPlan(c42, input)).toEqual(reference);
      const fx = buildGoalPlan({ ...ctx, solver: { rateDefinition: 'sustainedTissue' } }, input);
      const fx42 = buildGoalPlan({ ...ctx, solver: { rateDefinition: 'sustainedTissue', solverHorizonDays: 42 } }, input);
      expect(fx42.calorieTargetKcal).toBe(fx.calorieTargetKcal);
      if (reference.calorieTargetKcal === null) continue;
      const baseline = { goal: profile.goal, scenario: { calorieTargetKcal: reference.calorieTargetKcal, stepsPerDay: profile.averageSteps7d } };
      expect(solveSliderPoint(c42, baseline, profile.averageSteps7d + 2000)).toEqual(solveSliderPoint(ctx, baseline, profile.averageSteps7d + 2000));
      const proj = { goal: profile.goal, scenario: baseline.scenario, targetWeightKg: profile.targetWeightKg, maintenanceOffsets80: [-150, 150] as [number, number], maintenanceHorizonDays: 84 };
      expect(projectPlan(c42, proj)).toEqual(projectPlan(ctx, proj));
    }
  });

  it('28 days with sustainedTissue: the tissue mass at day 28 is start + W x ((1 -/+ r)^4 - 1), and the slider keeps it', () => {
    let checked = 0;
    for (const profile of randomProfiles(12, 38_002)) {
      if (profile.goal === 'maintenance') continue;
      const ctx: PlanContext = { ...ctxFor(profile), solver: { rateDefinition: 'sustainedTissue', solverHorizonDays: 28 } };
      expect(solverOptionsActive(ctx)).toBe(true);
      const plan = buildGoalPlan(ctx, { goal: profile.goal, weeklyRate: profile.weeklyRateTarget, targetWeightKg: profile.targetWeightKg, stepTarget: profile.averageSteps7d });
      if (plan.status !== 'ok' || !plan.solve || plan.calorieTargetKcal === null) continue;
      checked++;
      const r = plan.weeklyRateTarget;
      const w = ctx.currentWeightKg;
      const sign = profile.goal === 'loss' ? -1 : 1;
      const expected = (plan.solve.origin?.startTissueKg as number) + w * ((1 + sign * r) ** 4 - 1);
      expect(plan.solve.origin?.horizonDays).toBe(28);
      expect(plan.solve.targetWeightAtHorizonKg).toBeCloseTo(expected, 9);
      expect(Math.abs(plan.solve.weightAtHorizonKg - expected)).toBeLessThanOrEqual(0.01);
      // Independent Hall run at the solved intake: tissue at day 28.
      const p = initializeHall({ sex: ctx.sex, ageYears: ctx.ageYears, heightM: ctx.heightCm / 100, bodyWeightKg: w, baselineIntakeKcal: ctx.maintenanceKcal, baselineRmrKcal: ctx.reeKcal, baselineCarbFraction: 0.5 });
      expect(p.fat0Kg + p.lean0Kg).toBeCloseTo(plan.solve.origin?.startTissueKg as number, 9);
      // The 42-day production target is W x (1 -/+ r)^6: the 28-day one is not the same quantity.
      expect(targetWeightAtHorizon(profile.goal, w, r)).toBeCloseTo(w * (1 + sign * r) ** 6, 9);
      const baseline = { goal: profile.goal, scenario: { calorieTargetKcal: plan.calorieTargetKcal, stepsPerDay: profile.averageSteps7d } };
      let previous = Number.NEGATIVE_INFINITY;
      for (let steps = Math.max(1000, profile.averageSteps7d - 4000); steps <= profile.averageSteps7d + 6000; steps += 1000) {
        const pt = solveSliderPoint(ctx, baseline, steps);
        expect(pt.converged).toBe(true);
        expect(pt.calorieTargetKcal).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = pt.calorieTargetKcal;
        expect(Math.abs(pt.weightAtHorizonKg - pt.baselineWeightAtHorizonKg)).toBeLessThanOrEqual(0.01);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(6);
  });
});

describe('periodic replan (prompt 38 s3.1)', () => {
  const profile = makeProfile({ sexForEquation: 'male', ageYears: 36, heightCm: 181, currentWeightKg: 98, averageSteps7d: 7000, goal: 'loss', targetWeightKg: 84, weeklyRateTarget: 0.0075 });

  it('due at 28, 56, ... days of plan age; without an applied snapshot the plan stays', () => {
    const { store } = followerStore(profile, -80, 28, 0, 1, false, FX);
    const plan = store.plan as NonNullable<WheightyStore['plan']>;
    expect(planAgeDays(plan, addDays(D0, 28))).toBe(28);
    expect(periodicReplan(store, addDays(D0, 27), { replanEveryDays: 28, solver: FX }).status).toBe('not_due');
    const r = periodicReplan(store, addDays(D0, 28), { replanEveryDays: 28, solver: FX });
    expect(r).toEqual({ status: 'no_snapshot', ageDays: 28 });
    expect(periodicReplan(store, addDays(D0, 29), { replanEveryDays: 28, solver: FX }).status).toBe('not_due');
    expect(periodicReplan(store, addDays(D0, 56), { replanEveryDays: 28, solver: FX }).status).toBe('no_snapshot');
  });

  it('rebuilds from the latest applied snapshot without a new calibration, resets the age and leaves the snapshots unchanged', () => {
    const { store, today } = followerStore(profile, -80, 42, 0.3, 2, false, FX);
    const state = computeCalibrationState(store, today, iso(today));
    const applied = applyRecalibration(store, state as NonNullable<typeof state>, today, iso(today), K2);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    let s = applied.store;
    // 28 more days of weigh-ins on the recalibrated plan.
    const plan0 = s.plan as NonNullable<WheightyStore['plan']>;
    for (let d = 1; d <= 28; d++) {
      const date = addDays(today, d);
      s = setAdherence(ensureDailyLogs(s, date), addDays(today, d - 1), 'on_plan');
      s = addWeight(s, { date, weightKg: 98 - 0.1 * (42 + d) / 7 }, iso(date));
    }
    const due = addDays(today, 28);
    const r = periodicReplan(s, due, { replanEveryDays: 28, solver: K2 });
    expect(r.status).toBe('replanned');
    if (r.status !== 'replanned') return;
    const next = r.store.plan as NonNullable<WheightyStore['plan']>;
    expect(next.createdAt.slice(0, 10)).toBe(due);
    expect(planAgeDays(next, due)).toBe(0);
    expect(r.store.calibrationSnapshots).toEqual(s.calibrationSnapshots);
    expect(r.store.meta.lastSurfacedCalibration).toEqual(s.meta.lastSurfacedCalibration);
    expect(next.personalOffsetKcal).toBe(plan0.personalOffsetKcal);
    expect(next.stepTarget).toBe(plan0.stepTarget);
    // Same plan as a rebuild from the store with the latest applied snapshot and the same options.
    const snapshot = s.calibrationSnapshots[s.calibrationSnapshots.length - 1] ?? null;
    const rebuilt = buildPlanFromStore(ensureDailyLogs(s, due), due, { source: 'recalibrated', snapshot, stepTarget: plan0.stepTarget, solver: K2 });
    expect(rebuilt.ok && rebuilt.plan.calorieTarget).toBe(next.calorieTarget);
    // Past logs unchanged, today's log follows the new plan.
    const before = s.dailyLogs.filter((l) => l.date < due);
    expect(r.store.dailyLogs.filter((l) => l.date < due)).toEqual(before);
    expect(r.store.dailyLogs.find((l) => l.date === due)?.calorieTargetForDay).toBe(next.calorieTarget);
  });
});

describe('journal-mode modeled body and plan (prompt 38 s3.3)', () => {
  it('exact logging with the harness carbohydrates: same posterior, modeled body and FX plan as the current method (declared tolerance)', () => {
    for (const [i, profile] of [
      makeProfile({ sexForEquation: 'female', ageYears: 41, heightCm: 166, currentWeightKg: 82, averageSteps7d: 6000, goal: 'loss', targetWeightKg: 68, weeklyRateTarget: 0.0075 }),
      makeProfile({ sexForEquation: 'male', ageYears: 27, heightCm: 178, currentWeightKg: 66, averageSteps7d: 8000, goal: 'gain', targetWeightKg: 72, weeklyRateTarget: 0.0025 }),
    ].entries()) {
      const { store, today } = followerStore(profile, 150 - 250 * i, 35, 0.4, 10 + i, true, FX);
      const current = calibrationInputFromStore(store, today);
      const journal = journalCalibrationInputFromStore(store, today, { journalRegimeStart: D0, usabilityRule: { kind: 'R0' }, nonUsableDayWeight: 0.5, carbSource: 'harness_scaled' });
      if (!current || !journal) throw new Error('no input');
      const fitA = fitCalibration(current);
      const fitJ = fitCalibration(journal.input);
      if (!fitA || !fitJ) throw new Error('no fit');
      expect(Math.abs(fitJ.posterior.medianKcal - fitA.posterior.medianKcal)).toBeLessThanOrEqual(1);
      const offset = fitA.posterior.medianKcal;
      const bodyA = modeledBodyAt(current, offset, today);
      const bodyJ = modeledBodyAt(journal.input, offset, today);
      if (!bodyA || !bodyJ) throw new Error('no body');
      expect(Math.abs(bodyJ.modeledWeightKg - bodyA.modeledWeightKg)).toBeLessThanOrEqual(0.001);
      expect(Math.abs(bodyJ.state.lean + fatFromLean(bodyJ.params, bodyJ.state.lean) - (bodyA.state.lean + fatFromLean(bodyA.params, bodyA.state.lean)))).toBeLessThanOrEqual(0.001);
      // Plans: the current method's rebuild and the journal harness plan, same offset, FX options.
      const snapshot = buildSnapshot(fitA, computeCalibrationState(store, today, iso(today))?.gate as NonNullable<ReturnType<typeof computeCalibrationState>>['gate'], current.populationTdeeAtStartKcal, iso(today));
      const a = buildPlanFromStore(store, today, { source: 'recalibrated', snapshot, solver: FX });
      const j = journalGoalPlan(store, today, snapshot.posteriorMedianOffsetKcal, undefined, { request: FX, input: journal.input });
      expect(a.ok).toBe(true);
      if (!a.ok || !('goalPlan' in a)) return;
      expect(j.goalPlan.weeklyRateTarget).toBe(a.goalPlan.weeklyRateTarget);
      expect(Math.abs((j.goalPlan.calorieTargetKcal as number) - (a.goalPlan.calorieTargetKcal as number))).toBeLessThanOrEqual(1);
    }
  });
});

describe('isolation (prompt 38 s3.4)', () => {
  it('no store, worker, hook, screen, component or app module reaches the 2b options', () => {
    const scope = ['src/store', 'src/app', 'src/screens', 'src/components', 'src/hooks'].flatMap(sourceFiles).concat(['src/main.tsx']);
    for (const f of scope) expect(readFileSync(f, 'utf8'), f).not.toMatch(/periodicReplan|planAgeDays|solverHorizonDays|replanEveryDays|journalSolverOptions/);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((f) => `${dir}/${f.replace(/\\/g, '/')}`)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .sort();
}
