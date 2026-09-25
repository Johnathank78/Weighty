/**
 * Solver prototype of iteration 2a (prompt 37 s3): options `solverStart` and `rateDefinition`, absent by default.
 * Neutral values reproduce the production solver exactly; `sustainedTissue` targets the tissue mass at day 42;
 * `currentState` starts from the calibration's modeled body today; the slider invariants hold with both options.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { posix } from 'node:path';
import { addWeight, applyRecalibration, buildPlanFromStore, calibrationInputFromStore, completeOnboarding, computeCalibrationState, ensureDailyLogs, setAdherence, solverOptionsFor } from '@/domain/engine';
import type { WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { assessBaseline, planContextFrom } from '@/science/assessment';
import { reconstructDays } from '@/science/calibration';
import { GOAL_SOLVER_HORIZON_DAYS } from '@/science/constants';
import { addDays } from '@/science/dates';
import { buildGoalPlan, hallInputFor, projectPlan, solveSliderPoint, solverOptionsActive, targetWeightAtHorizon, weightAtDay } from '@/science/goals';
import type { ModeledBody, PlanContext, SolverOptions } from '@/science/goals';
import { advance, bodyWeightOf, fatFromLean, initialState, initializeHall } from '@/science/hall/model';
import type { HallDailyInput, HallParameters, HallState } from '@/science/hall/model';
import { modeledBodyAt } from '@/science/modeledBody';
import type { Goal, UserProfile } from '@/science/types';
import { makeProfile } from '../helpers/profiles';
import { createRng } from '../helpers/random';

const TODAY = '2026-09-13';
const D0 = '2026-01-05';
const iso = (date: string) => `${date}T08:00:00.000Z`;

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
    const bmi = rng.uniform(22.5, 36);
    const weight = Math.round(bmi * (heightCm / 100) ** 2 * 10) / 10;
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

const tissue = (p: HallParameters, s: HallState) => s.lean + fatFromLean(p, s.lean);

/** Store of a user who followed the onboarding plan for `days` days, weighed daily with the calibration's own model at `offsetKcal`. */
function calibratedStore(profile: UserProfile, offsetKcal: number, days: number): { store: WheightyStore; today: string; weights: number[] } {
  const onboarding = completeOnboarding(emptyStore(), profile, D0, iso(D0));
  if (!onboarding.ok) throw new Error(onboarding.reason);
  const today = addDays(D0, days);
  let store = ensureDailyLogs(onboarding.store, today);
  for (let d = 0; d < days; d++) store = setAdherence(store, addDays(D0, d), 'on_plan');
  const input = calibrationInputFromStore(store, today);
  if (!input) throw new Error('no input');
  const recon = reconstructDays(input, D0, days);
  const p = initializeHall({
    sex: input.sex,
    ageYears: input.ageYears,
    heightM: input.heightCm / 100,
    bodyWeightKg: profile.currentWeightKg,
    baselineIntakeKcal: input.populationTdeeAtStartKcal + offsetKcal,
    baselineRmrKcal: input.reeAtStartKcal,
    baselineCarbFraction: input.baselineCarbFraction,
  });
  let s = initialState(p);
  const weights = [bodyWeightOf(p, s)];
  for (let d = 0; d < days; d++) {
    const r = recon[d] as (typeof recon)[number];
    s = advance(p, s, { intakeKcal: r.intakeKcal, carbKcal: r.carbKcal, paDeltaKcalPerKgDay: 0, sodiumDeltaMg: 0 }, 1);
    weights.push(bodyWeightOf(p, s));
    store = addWeight(store, { date: addDays(D0, d + 1), weightKg: bodyWeightOf(p, s) }, iso(addDays(D0, d + 1)));
  }
  return { store, today, weights };
}

/** A modeled body out of equilibrium: production parameters at the context weight, 56 days at the given intake. */
function driftedBody(ctx: PlanContext, goal: Goal, intakeKcal: number): ModeledBody {
  const a = 56;
  const base = initializeHall({
    sex: ctx.sex,
    ageYears: ctx.ageYears,
    heightM: ctx.heightCm / 100,
    bodyWeightKg: ctx.currentWeightKg,
    baselineIntakeKcal: ctx.maintenanceKcal,
    baselineRmrKcal: ctx.reeKcal,
    baselineCarbFraction: 0.45,
  });
  const u: HallDailyInput = { ...hallInputFor(ctx, goal, { calorieTargetKcal: intakeKcal, stepsPerDay: ctx.maintenanceStepsPerDay }), paDeltaKcalPerKgDay: 0 };
  let s = initialState(base);
  for (let d = 0; d < a; d++) s = advance(base, s, u, 1);
  return { params: base, state: s, weightShiftKg: 0.3, steps: { weightKg: ctx.currentWeightKg, ageYears: ctx.ageYears, pace: ctx.walkingPace, maintenanceStepsPerDay: ctx.maintenanceStepsPerDay } };
}

describe('solver prototype, neutral options (prompt 37 s3.5)', () => {
  it('equilibrium + fortyTwoDayWeight, and currentState without a calibration, give the production plan exactly', () => {
    const neutral: SolverOptions[] = [{ solverStart: 'equilibrium', rateDefinition: 'fortyTwoDayWeight' }, { solverStart: 'currentState' }, { solverStart: 'currentState', modeledBody: null }];
    for (const profile of randomProfiles(9, 37_001)) {
      const ctx = ctxFor(profile);
      const input = { goal: profile.goal, weeklyRate: profile.weeklyRateTarget, targetWeightKg: profile.targetWeightKg, stepTarget: profile.averageSteps7d };
      const reference = buildGoalPlan(ctx, input);
      for (const solver of neutral) {
        const c = { ...ctx, solver };
        expect(solverOptionsActive(c)).toBe(false);
        expect(buildGoalPlan(c, input)).toEqual(reference);
        if (reference.calorieTargetKcal === null) continue;
        const baseline = { goal: profile.goal, scenario: { calorieTargetKcal: reference.calorieTargetKcal, stepsPerDay: profile.averageSteps7d } };
        expect(solveSliderPoint(c, baseline, profile.averageSteps7d + 2000)).toEqual(solveSliderPoint(ctx, baseline, profile.averageSteps7d + 2000));
        const proj = { goal: profile.goal, scenario: baseline.scenario, targetWeightKg: profile.targetWeightKg, maintenanceOffsets80: [-150, 150] as [number, number], maintenanceHorizonDays: 84 };
        expect(projectPlan(c, proj)).toEqual(projectPlan(ctx, proj));
      }
    }
  });
});

describe('sustainedTissue (prompt 37 s3.2)', () => {
  it('the solved intake brings the tissue mass (fat + lean) to start - W x (1 - (1 -/+ r)^6) at day 42', () => {
    let checked = 0;
    let compared = 0;
    for (const profile of randomProfiles(12, 37_002)) {
      if (profile.goal === 'maintenance') continue;
      const ctx = { ...ctxFor(profile), solver: { rateDefinition: 'sustainedTissue' } satisfies SolverOptions };
      const plan = buildGoalPlan(ctx, { goal: profile.goal, weeklyRate: profile.weeklyRateTarget, targetWeightKg: profile.targetWeightKg, stepTarget: profile.averageSteps7d });
      if (plan.status !== 'ok' || !plan.solve) continue;
      checked++;
      const r = plan.weeklyRateTarget;
      const origin = plan.solve.origin;
      expect(origin?.solverStart).toBe('equilibrium');
      expect(origin?.referenceWeightKg).toBe(ctx.currentWeightKg);
      const expected = (origin?.startTissueKg as number) + (targetWeightAtHorizon(profile.goal, ctx.currentWeightKg, r) - ctx.currentWeightKg);
      expect(plan.solve.targetWeightAtHorizonKg).toBeCloseTo(expected, 9);
      expect(Math.abs(plan.solve.weightAtHorizonKg - expected)).toBeLessThanOrEqual(0.01);
      // Independent check with the Hall model at equilibrium.
      const p = initializeHall({ sex: ctx.sex, ageYears: ctx.ageYears, heightM: ctx.heightCm / 100, bodyWeightKg: ctx.currentWeightKg, baselineIntakeKcal: ctx.maintenanceKcal, baselineRmrKcal: ctx.reeKcal, baselineCarbFraction: hallInputFor(ctx, profile.goal, { calorieTargetKcal: ctx.maintenanceKcal, stepsPerDay: ctx.maintenanceStepsPerDay }).carbKcal / ctx.maintenanceKcal });
      expect(p.fat0Kg + p.lean0Kg).toBeCloseTo(origin?.startTissueKg as number, 9);
      // Without the early water and glycogen change, the deficit (surplus) is larger than the production one.
      const production = buildGoalPlan(ctxFor(profile), { goal: profile.goal, weeklyRate: r, targetWeightKg: profile.targetWeightKg, stepTarget: profile.averageSteps7d });
      if (production.calorieTargetKcal === null || production.weeklyRateTarget !== r) continue;
      compared++;
      if (profile.goal === 'loss') expect(plan.calorieTargetKcal as number).toBeLessThan(production.calorieTargetKcal);
      else expect(plan.calorieTargetKcal as number).toBeGreaterThan(production.calorieTargetKcal);
    }
    expect(checked).toBeGreaterThanOrEqual(6);
    expect(compared).toBeGreaterThanOrEqual(4);
  });
});

describe('modeled body and currentState (prompt 37 s3.1)', () => {
  it('modeledBodyAt reproduces the calibration model: noiseless weigh-ins give a zero intercept and the last weight', () => {
    const profile = makeProfile({ sexForEquation: 'female', ageYears: 41, heightCm: 166, currentWeightKg: 82, averageSteps7d: 6000, goal: 'loss', targetWeightKg: 68, weeklyRateTarget: 0.0075 });
    const { store, today, weights } = calibratedStore(profile, 120, 42);
    const input = calibrationInputFromStore(store, today);
    const body = modeledBodyAt(input as NonNullable<typeof input>, 120, today);
    expect(body).not.toBeNull();
    expect(Math.abs(body?.weightShiftKg as number)).toBeLessThan(0.01);
    expect(body?.modeledWeightKg as number).toBeCloseTo(weights[42] as number, 2);
    expect(body?.simulatedDays).toBe(42);
    // Out of equilibrium after six weeks of deficit: adaptive thermogenesis and glycogen below baseline.
    expect(body?.state.at as number).toBeLessThan(0);
    expect(body?.state.glycogen as number).toBeLessThan(body?.params.glycogen0Kg as number);
    // Today after the last weigh-in: the state continues with the logged days.
    const later = modeledBodyAt(input as NonNullable<typeof input>, 120, addDays(today, -3));
    expect(later?.simulatedDays).toBe(42);
    expect(modeledBodyAt({ ...(input as NonNullable<typeof input>), weights: [] }, 120, today)).toBeNull();
  });

  it('currentState: the plan starts from the modeled body, its reference weight is the modeled weight, the 42-day weight hits W x (1 - r)^6', () => {
    const profile = makeProfile({ sexForEquation: 'male', ageYears: 36, heightCm: 181, currentWeightKg: 98, averageSteps7d: 7000, goal: 'loss', targetWeightKg: 84, weeklyRateTarget: 0.0075 });
    const { store, today } = calibratedStore(profile, -80, 42);
    const state = computeCalibrationState(store, today, iso(today));
    expect(state?.gate.met).toBe(true);
    const snapshot = state?.candidate ?? null;
    const options = solverOptionsFor(store, today, snapshot, { solverStart: 'currentState' });
    expect(options.modeledBody).not.toBeNull();
    const result = buildPlanFromStore(store, today, { source: 'recalibrated', snapshot, solver: { solverStart: 'currentState' } });
    expect(result.ok).toBe(true);
    if (!result.ok || !('goalPlan' in result)) return;
    const solve = result.goalPlan.solve;
    const body = options.modeledBody as ModeledBody;
    const modeled = bodyWeightOf(body.params, body.state) + body.weightShiftKg;
    expect(solve?.origin?.solverStart).toBe('currentState');
    expect(solve?.origin?.referenceWeightKg).toBe(modeled);
    const r = result.goalPlan.weeklyRateTarget;
    expect(Math.abs((solve?.weightAtHorizonKg as number) - modeled * (1 - r) ** 6)).toBeLessThanOrEqual(0.01);
    expect(weightAtDay(result.context, 'loss', { calorieTargetKcal: result.plan.calorieTarget, stepsPerDay: result.plan.stepTarget }, GOAL_SOLVER_HORIZON_DAYS)).toBeCloseTo(solve?.weightAtHorizonKg as number, 9);
    // The projection starts at the modeled weight; its band comes from the modeled bodies at the interval offsets.
    expect(result.plan.projection.trajectory[0]?.weightKg).toBe(modeled);
    expect(result.plan.projection.lower80[5]?.weightKg).not.toBe(result.plan.projection.upper80[5]?.weightKg);
    // The same recalibration through the domain use case, with and without the option.
    const applied = applyRecalibration(store, state as NonNullable<typeof state>, today, iso(today), { solverStart: 'currentState' });
    const production = applyRecalibration(store, state as NonNullable<typeof state>, today, iso(today));
    expect(applied.ok && production.ok).toBe(true);
    if (!applied.ok || !production.ok) return;
    expect(applied.store.plan?.calorieTarget).toBe(result.plan.calorieTarget);
    expect(applied.store.plan?.maintenanceKcal).toBe(production.store.plan?.maintenanceKcal);
    expect(applied.store.plan?.calorieTarget).not.toBe(production.store.plan?.calorieTarget);
  });

  it('onboarding: no calibration, currentState keeps the equilibrium start (the first plan changes only with sustainedTissue)', () => {
    const profile = makeProfile({ sexForEquation: 'female', ageYears: 29, heightCm: 170, currentWeightKg: 80, goal: 'loss', targetWeightKg: 70, weeklyRateTarget: 0.005 });
    const base = completeOnboarding(emptyStore(), profile, D0, iso(D0));
    const current = completeOnboarding(emptyStore(), profile, D0, iso(D0), null, { solverStart: 'currentState' });
    const both = completeOnboarding(emptyStore(), profile, D0, iso(D0), null, { solverStart: 'currentState', rateDefinition: 'sustainedTissue' });
    expect(base.ok && current.ok && both.ok).toBe(true);
    if (!base.ok || !current.ok || !both.ok) return;
    expect(current.store.plan).toEqual(base.store.plan);
    expect(both.store.plan?.calorieTarget as number).toBeLessThan(base.store.plan?.calorieTarget as number);
  });
});

describe('slider invariants with the retained fix (prompt 37 s5.4, 08 s6)', () => {
  it('more steps never lower the allowed calories, fewer steps never raise them, and the day-42 tissue mass stays on target', () => {
    let checked = 0;
    for (const profile of randomProfiles(9, 37_003)) {
      const plain = ctxFor(profile);
      const goal = profile.goal;
      const drift = goal === 'loss' ? -450 : goal === 'gain' ? 250 : 0;
      const body = driftedBody(plain, goal, plain.maintenanceKcal + drift);
      const ctx: PlanContext = { ...plain, solver: { solverStart: 'currentState', rateDefinition: 'sustainedTissue', modeledBody: body } };
      const plan = buildGoalPlan(ctx, { goal, weeklyRate: profile.weeklyRateTarget, targetWeightKg: profile.targetWeightKg, stepTarget: profile.averageSteps7d });
      if (plan.status !== 'ok' || plan.calorieTargetKcal === null) continue;
      checked++;
      const baseline = { goal, scenario: { calorieTargetKcal: plan.calorieTargetKcal, stepsPerDay: profile.averageSteps7d } };
      let previous = Number.NEGATIVE_INFINITY;
      for (let steps = Math.max(1000, profile.averageSteps7d - 4000); steps <= profile.averageSteps7d + 6000; steps += 1000) {
        const pt = solveSliderPoint(ctx, baseline, steps);
        expect(pt.converged).toBe(true);
        expect(pt.calorieTargetKcal).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = pt.calorieTargetKcal;
        expect(Math.abs(pt.weightAtHorizonKg - pt.baselineWeightAtHorizonKg)).toBeLessThanOrEqual(0.01);
      }
      // The baseline tissue target itself is the plan's.
      expect(Math.abs(solveSliderPoint(ctx, baseline, profile.averageSteps7d).calorieTargetKcal - plan.calorieTargetKcal)).toBeLessThanOrEqual(2);
      expect(tissue(body.params, body.state)).toBeCloseTo(plan.solve?.origin?.startTissueKg as number, 9);
    }
    expect(checked).toBeGreaterThanOrEqual(6);
  });
});

describe('isolation (prompt 37 s3.4)', () => {
  it('no store, worker, hook, screen, component or app module passes a solver option or builds a modeled body', () => {
    const scope = ['src/store', 'src/app', 'src/screens', 'src/components', 'src/hooks'].flatMap(sourceFiles).concat(['src/main.tsx']);
    for (const f of scope) expect(readFileSync(f, 'utf8'), f).not.toMatch(/solverStart|rateDefinition|modeledBody|solverOptionsFor|SolverRequest|sustainedTissue|currentState/);
    // Production callers of the engine never pass the extra argument: every applyRecalibration / completeOnboarding call has at most 4 / 5 arguments.
    for (const f of scope) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/applyRecalibration\(([^()]*)\)/g)) expect((m[1] as string).split(',').length, f).toBeLessThanOrEqual(4);
      for (const m of src.matchAll(/completeOnboarding\(([^()]*)\)/g)) expect((m[1] as string).split(',').length, f).toBeLessThanOrEqual(5);
    }
    expect(importsOf('src/store/calibration.worker.ts')).not.toContain('src/science/modeledBody.ts');
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((f) => `${dir}/${f.replace(/\\/g, '/')}`)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .sort();
}

function importsOf(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  const specs = [...src.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*'([^']+)'/g)].map((m) => m[1] as string);
  const out: string[] = [];
  for (const spec of specs) {
    let base: string | null = null;
    if (spec.startsWith('@/')) base = `src/${spec.slice(2)}`;
    else if (spec.startsWith('.')) base = posix.normalize(posix.join(posix.dirname(file), spec));
    if (base === null) continue;
    const hit = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((p) => existsSync(p) && statSync(p).isFile());
    if (hit) out.push(hit);
  }
  return out;
}
