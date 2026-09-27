/**
 * Iteration 2d (prompt 41 s4.5): J* (full level 2) and the amended arm C, harness only (measurement).
 * 1. h: exact value on a built store (window bounds, cut at the switch day, an imputed day, both bounds).
 * 2. Construction, h = 1: target, rate and floor field bit-identical to `journalGoalPlan` with the floor factor 1.10; macros too.
 * 3. Construction, h != 1, no active floor: T = I* / h, production macros for T, rate unchanged.
 * 4. Construction, active floor: T >= floor D-32 x 1.10, rate slowed (the equality of s4.5.4 is discussed in report 41).
 * 5. Surfacing: M constant and h changing are enough to surface when |delta(M / h)| >= the D-34 threshold; nothing below.
 * 6. G1 and G2 in J* mode: plans rebuilt by `jstarPlanOf`; S3-P respected.
 * 7. Arm C: T_c and later plans respect the floor x 1.10; floor field corrected; no S4-P day when T_c is replaced.
 * 8. Order of an evaluation day (s3.1.12). Isolation (s4.3).
 * Fixtures: hand-built stores, and closed-loop users on the discarded pilot seeds (base pilot2d, indexes 90 000 and up,
 * declared in it2d/jobs2d.ts).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addWeight, completeOnboarding, currentWeightKg, ensureDailyLogs } from '@/domain/engine';
import type { SolverRequest } from '@/domain/engine';
import { addFoodEntry, journalDay } from '@/domain/journal';
import { evaluateJournalGate, journalCalibrationInputFromStore } from '@/domain/journalCalibration';
import type { JournalRegimeOptions } from '@/domain/journalCalibration';
import type { WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { assessBaseline } from '@/science/assessment';
import { RECAL_SURFACE_MIN_CHANGE_KCAL, LOSS_UNAVAILABLE_BMI_BELOW } from '@/science/constants';
import { addDays } from '@/science/dates';
import { guardrailMaxWeeklyRate, hardFloorKcal, macrosFor } from '@/science/goals';
import { bmi } from '@/science/macros';
import type { UserProfile } from '@/science/types';
import {
  POPULATIONS,
  closedLoopProfile,
  enforceJStarPlanGuardrails,
  habitOf,
  journalGoalPlan,
  jstarPlanOf,
  jstarSurfaced,
  makeSpec,
  s3pCheck,
  simulateUser,
} from '../helpers/closedLoop';
import type { ArmConfig, Population, PostSwitchBehavior, ProfileSlot, SimState, UserSpec } from '../helpers/closedLoop';
import { makeProfile } from '../helpers/profiles';
import { K2G } from '../experiments-journal/it2r/jobs2r';
import { ARM_C2D, ARM_JS, SEED_BASES_2D } from '../experiments-journal/it2d/jobs2d';

const D0 = '2026-01-05';
const iso = (date: string) => `${date}T08:00:00.000Z`;
const K2: SolverRequest = K2G.solver;
const JOURNAL: JournalRegimeOptions = { journalRegimeStart: D0, usabilityRule: { kind: 'R0' }, nonUsableDayWeight: 0.5, journalPrior: 'flat', offsetGridHalfRangeKcal: 2000, carbSource: 'baseline' };
const BASE = { offsetKcal: -80, interval80: [-180, 20] as const, interval95: [-260, 100] as const };
const BOUNDS = [0.8, 1.25] as const;

/**
 * Onboarding at D0 (K2), then n days: day d logged `logged(d)` kcal in one meal (none on the days of `skip`), target of the
 * day's log set to `target(d)`, a daily weigh-in from `from` to `to` kg.
 */
function builtStore(profile: UserProfile, n: number, o: { logged?: (d: number, t: number) => number; target?: (d: number, t: number) => number; skip?: readonly number[]; from?: number; to?: number } = {}): { store: WheightyStore; today: string } {
  const onboarding = completeOnboarding(emptyStore(), profile, D0, iso(D0), null, K2);
  if (!onboarding.ok) throw new Error(onboarding.reason);
  const today = addDays(D0, n);
  let store = ensureDailyLogs(onboarding.store, today);
  const base = store.plan?.calorieTarget as number;
  const target = o.target ?? (() => base);
  const logged = o.logged ?? ((_d: number, t: number) => t);
  store = { ...store, dailyLogs: store.dailyLogs.map((l) => ({ ...l, calorieTargetForDay: target(Math.round((Date.parse(l.date) - Date.parse(D0)) / 86_400_000), base) })) };
  for (let d = 0; d < n; d++) {
    if (o.skip?.includes(d)) continue;
    const date = addDays(D0, d);
    const kcal = logged(d, target(d, base));
    const r = addFoodEntry(store, { kind: 'manual', food: { name: 'Repas', intake: { energyKcal: kcal, proteinG: 100, carbsG: (kcal * 0.45) / 4, fatG: (kcal - 400 - kcal * 0.45) / 9 }, grams: null }, date, localTime: '12:30', consumedTime: '12:30' }, iso(date));
    if (!r.ok) throw new Error(r.reason);
    store = r.store;
  }
  const from = o.from ?? profile.currentWeightKg;
  const to = o.to ?? profile.currentWeightKg - 1;
  for (let d = 1; d <= n; d++) store = addWeight(store, { date: addDays(D0, d), weightKg: from + ((to - from) * d) / n }, iso(addDays(D0, d)));
  return { store, today };
}
const prep = (store: WheightyStore, today: string) => {
  const p = journalCalibrationInputFromStore(store, today, JOURNAL);
  if (!p) throw new Error('no journal input');
  return p;
};
const solverOf = (store: WheightyStore, today: string) => ({ request: K2, input: prep(store, today).input });
const median = (v: readonly number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = (s.length - 1) / 2;
  return ((s[Math.floor(m)] as number) + (s[Math.ceil(m)] as number)) / 2;
};

const heavy = makeProfile({ sexForEquation: 'male', ageYears: 35, heightCm: 180, currentWeightKg: 90, averageSteps7d: 8000, goal: 'loss', targetWeightKg: 70, weeklyRateTarget: 0.005 });
const lean = makeProfile({ sexForEquation: 'female', ageYears: 30, heightCm: 165, currentWeightKg: 57.2, averageSteps7d: 7000, goal: 'loss', targetWeightKg: 50.4, weeklyRateTarget: 0.0025 });
const small = makeProfile({ sexForEquation: 'female', ageYears: 55, heightCm: 152, currentWeightKg: 60, averageSteps7d: 5000, goal: 'loss', targetWeightKg: 45, weeklyRateTarget: 0.01 });

describe('1. habit h (prompt 41 s3.1.5)', () => {
  // Targets 2 000 + 10 d, logged 0.95 x target + 3 d; day 30 has no entry (not usable: imputed by the journal estimate).
  const target = (d: number) => 2000 + 10 * d;
  const logged = (d: number) => 0.95 * target(d) + 3 * d;
  const { store, today } = builtStore(heavy, 42, { target, logged, skip: [30] });
  const prepared = prep(store, today);
  const expected = (from: number) => {
    let i = 0;
    let t = 0;
    for (let d = from; d < 42; d++) {
      // Imputation of a non-usable day: median of the logged totals of the 14 previous usable days.
      const intake = d === 30 ? median(Array.from({ length: 14 }, (_, k) => logged(30 - 1 - k))) : logged(d);
      i += intake;
      t += target(d);
    }
    return i / t;
  };

  it('the imputed day is the one of the journal estimate', () => {
    expect(journalDay(store, addDays(D0, 30)).entries).toHaveLength(0);
    expect(prepared.observations.find((o) => o.date === addDays(D0, 30))?.usable).toBe(false);
  });

  it('window cut at the switch day: [switch, D - 1]', () => {
    const h = habitOf(store, prepared, addDays(D0, 20), today, 28, BOUNDS);
    expect(h.days).toBe(22);
    expect(h.raw).toBeCloseTo(expected(20), 12);
    expect(h.h).toBe(h.raw);
    expect(h.bound).toBeNull();
  });

  it('window bounded to 28 days: [D - 28, D - 1]', () => {
    const h = habitOf(store, prepared, addDays(D0, 5), today, 28, BOUNDS);
    expect(h.days).toBe(28);
    expect(h.raw).toBeCloseTo(expected(14), 12);
  });

  it('each bound is applied and reported', () => {
    const low = builtStore(heavy, 35, { logged: (_d, t) => 0.7 * t });
    const hl = habitOf(low.store, prep(low.store, low.today), addDays(D0, 14), low.today, 28, BOUNDS);
    expect(hl.raw).toBeCloseTo(0.7, 4);
    expect(hl.h).toBe(0.8);
    expect(hl.bound).toBe('low');
    const high = builtStore(heavy, 35, { logged: (_d, t) => 1.4 * t });
    const hh = habitOf(high.store, prep(high.store, high.today), addDays(D0, 14), high.today, 28, BOUNDS);
    expect(hh.raw).toBeCloseTo(1.4, 4);
    expect(hh.h).toBe(1.25);
    expect(hh.bound).toBe('high');
  });
});

describe('2-4. J* plan construction (prompt 41 s3.1.6)', () => {
  const { store, today } = builtStore(heavy, 35, { from: 89.5, to: 87.5 });
  const solver = solverOf(store, today);

  it('2. h = 1: target, rate, floor field and macros bit-identical to journalGoalPlan with the floor factor 1.10', () => {
    const r = jstarPlanOf(store, today, BASE, 1, 1.1, solver);
    const ref = journalGoalPlan(store, today, BASE.offsetKcal, 1.1, solver);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ref.goalPlan.status).toBe('ok');
    expect(r.target).toBe(ref.goalPlan.calorieTargetKcal);
    expect(r.plan.calorieTarget).toBe(ref.goalPlan.calorieTargetKcal);
    expect(r.plan.weeklyRateTarget).toBe(ref.goalPlan.weeklyRateTarget);
    expect(r.plan.hardFloorKcal).toBe(ref.goalPlan.hardFloorKcal);
    expect(r.plan.macros).toEqual(ref.goalPlan.macros?.exact);
    expect(r.plan.macrosDisplay).toEqual(ref.goalPlan.macros?.display);
    expect(r.plan.proteinRule).toBe(ref.goalPlan.macros?.proteinRule);
    expect(r.plan.maintenanceKcal).toBe(ref.maintenance);
  });

  it('3. h != 1 without an active floor: T = I* / h, production macros for T, rate and I* unchanged', () => {
    const one = jstarPlanOf(store, today, BASE, 1, 1.1, solver);
    if (!one.ok) throw new Error('h = 1 failed');
    for (const h of [0.9, 1.12]) {
      const r = jstarPlanOf(store, today, BASE, h, 1.1, solver);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.floorActive).toBe(false);
      expect(Math.abs(r.plan.calorieTarget - r.iStar / h)).toBeLessThanOrEqual(1e-9);
      expect(r.iStar).toBe(one.iStar);
      expect(r.plan.weeklyRateTarget).toBe(one.plan.weeklyRateTarget);
      const m = macrosFor(r.built.ctx, r.built.goalPlan.goal, r.plan.calorieTarget);
      expect(r.plan.macros).toEqual(m.exact);
      expect(r.plan.macrosDisplay).toEqual(m.display);
      expect(r.plan.hardFloorKcal).toBe(hardFloorKcal(r.built.ctx.reeKcal, r.built.ctx.sex) * 1.1);
    }
  });

  it('4. active floor: I* >= h x floor x 1.10, T >= floor x 1.10, rate slowed below the requested one', () => {
    const s = builtStore(small, 35, { from: 59.8, to: 58.8 });
    const sv = solverOf(s.store, s.today);
    const low = { ...BASE, offsetKcal: -150 };
    for (const h of [1, 0.95]) {
      const r = jstarPlanOf(s.store, s.today, low, h, 1.1, sv);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const floor = hardFloorKcal(r.built.ctx.reeKcal, r.built.ctx.sex) * 1.1;
      expect(r.floorActive).toBe(true);
      expect(r.built.goalPlan.rejections.some((x) => x.reason === 'below_hard_floor')).toBe(true);
      expect(r.iStar).toBeGreaterThanOrEqual(h * floor - 1e-9);
      expect(r.plan.calorieTarget).toBeGreaterThanOrEqual(floor - 1e-9);
      expect(r.plan.hardFloorKcal).toBe(floor);
      expect(r.plan.weeklyRateTarget).toBeLessThan(small.weeklyRateTarget);
    }
    // With h = 0.95, the floor on I* is lower: the rate is not slower than with h = 1; with h = 1.1 no rate is feasible.
    const r1 = jstarPlanOf(s.store, s.today, low, 1, 1.1, sv);
    const r2 = jstarPlanOf(s.store, s.today, low, 0.95, 1.1, sv);
    if (!r1.ok || !r2.ok) throw new Error('floor case failed');
    expect(r2.plan.weeklyRateTarget).toBeGreaterThanOrEqual(r1.plan.weeklyRateTarget);
    const r3 = jstarPlanOf(s.store, s.today, low, 1.1, 1.1, sv);
    expect(r3.ok === false && r3.reason).toBe('no_feasible_speed');
  });
});

describe('5. surfacing on M / h (prompt 41 s3.1.9)', () => {
  const { store, today } = builtStore(heavy, 35);
  const p = prep(store, today);
  const gate = { ...evaluateJournalGate(p.input.weights, p.observations), met: true };
  const m = 2600;
  const width = 200;
  const h0 = 1;
  // 7 days after the reference (minimum interval met, below RECAL_SURFACE_MIN_DAYS + 1 so only the change criteria apply).
  const reference = { tdeeKcal: m / h0, interval80Width: width / h0, surfacedOn: addDays(today, -7) };
  it('M constant, h changing: surfaced when |delta(M / h)| >= the D-34 threshold, not below', () => {
    // h slightly above 1: M / h drops by just more than the threshold; the width / h shrinks by less than 10 %.
    const hAbove = m / (m - RECAL_SURFACE_MIN_CHANGE_KCAL - 1);
    const hBelow = m / (m - RECAL_SURFACE_MIN_CHANGE_KCAL + 40);
    expect(1 - 1 / hAbove).toBeLessThan(0.1);
    expect(jstarSurfaced(gate, m, width, hAbove, reference, today)).toBe(true);
    // Below the 75 kcal criterion; the 40 kcal after 7 days criterion is not met either (change 35 kcal).
    expect(Math.abs(m / hBelow - m)).toBeLessThan(40);
    expect(jstarSurfaced(gate, m, width, hBelow, reference, today)).toBe(false);
    expect(jstarSurfaced(gate, m, width, h0, reference, today)).toBe(false);
  });
});

/** Closed-loop fixture on the pilot seeds (index 90 000 and up): a non-follower who declares 'major_deviation' every day. */
function fixtureSpec(index: number, c: { sex: 'female' | 'male'; bmi: number; heightCm: number; rate: number; shift: number; behavior: PostSwitchBehavior }): UserSpec {
  const profile = closedLoopProfile(c.sex, c.bmi, 'sedentary', 'loss', 35, c.heightCm, c.rate);
  const slot: ProfileSlot = { key: `unit${index}`, sex: c.sex, bmiClass: 'unit', activity: 'sedentary', goal: 'loss', profile, shiftKcal: c.shift, weighProbability: 1, deviationFrequency: 0, majorShare: 1, postSwitch: c.behavior };
  const fixed: ProfileSlot = { ...slot, deviationFrequency: c.behavior === 'R30' ? 0.3 : 0 };
  return makeSpec(fixed, SEED_BASES_2D.pilot2d, index, { pass: 'unit2d', behavior: 'nonfollower', population: POPULATIONS.P00 as Population, ...K2G });
}
const ARMS: ArmConfig[] = [ARM_C2D, ARM_JS];
const stateOf = (res: ReturnType<typeof simulateUser>, key: string) => (res.arms.find((a) => a.arm.key === key) as { state: SimState }).state;
const LEAN = [fixtureSpec(90_003, { sex: 'female', bmi: 20.6, heightCm: 165, rate: 0.0025, shift: -270, behavior: 'R0' }), fixtureSpec(90_005, { sex: 'female', bmi: 20.9, heightCm: 165, rate: 0.0025, shift: -270, behavior: 'R30' })];
const FAST = [fixtureSpec(90_100, { sex: 'male', bmi: 25.15, heightCm: 180, rate: 0.01, shift: -400, behavior: 'R0' }), fixtureSpec(90_101, { sex: 'male', bmi: 25.15, heightCm: 180, rate: 0.01, shift: -270, behavior: 'R30' })];
const runs = new Map<UserSpec, ReturnType<typeof simulateUser>>();
const run = (spec: UserSpec) => {
  let r = runs.get(spec);
  if (!r) {
    r = simulateUser(spec, ARMS);
    runs.set(spec, r);
  }
  return r;
};

describe('6. G1 and G2 in J* mode (prompt 41 s3.1.11)', () => {
  it('G1: maintenance plan rebuilt by jstarPlanOf at the app weight; S3-P respected', () => {
    const { store, today } = builtStore(lean, 28, { from: 56.8, to: 52.0 });
    expect(bmi(currentWeightKg(store) as number, lean.heightCm)).toBeLessThan(LOSS_UNAVAILABLE_BMI_BELOW);
    const solver = solverOf(store, today);
    const h = 1.08;
    const r = enforceJStarPlanGuardrails(store, today, BASE, h, 1.1, solver);
    expect(r.status).toBe('applied');
    if (r.status !== 'applied') return;
    expect(r.rule).toBe('G1');
    const weight = currentWeightKg(store) as number;
    const profile = r.store.profile as UserProfile;
    expect(profile.goal).toBe('maintenance');
    const ref = jstarPlanOf(ensureDailyLogs({ ...store, profile }, today), today, BASE, h, 1.1, solver, { goal: 'maintenance', targetWeightKg: weight, stepTarget: store.plan?.stepTarget as number });
    if (!ref.ok) throw new Error('reference failed');
    const plan = r.store.plan;
    if (!plan) throw new Error('no plan');
    expect(plan.goal).toBe('maintenance');
    expect(plan.weeklyRateTarget).toBe(0);
    expect(plan.calorieTarget).toBe(ref.target);
    expect(Math.abs(plan.calorieTarget * h - ref.iStar)).toBeLessThanOrEqual(1e-9);
    expect(plan.macros).toEqual(ref.plan.macros);
    const assessment = assessBaseline(profile, today, { weightKg: weight, palCategory: store.meta.initialPalCategory ?? plan.palCategory });
    expect(plan.hardFloorKcal).toBe(hardFloorKcal(assessment.ree.reeKcalDay, profile.sexForEquation) * 1.1);
    expect(s3pCheck(r.store, 28).violation).toBe(false);
  });

  it('G2: the rebuilt plan respects the cap and is jstarPlanOf with the steps kept; S3-P respected', () => {
    const fast = makeProfile({ ...heavy, currentWeightKg: 84.2, weeklyRateTarget: 0.01 });
    const { store, today } = builtStore(fast, 28, { from: 84.0, to: 78.5 });
    const b = bmi(currentWeightKg(store) as number, fast.heightCm);
    const cap = guardrailMaxWeeklyRate('loss', b) as number;
    expect(store.plan?.weeklyRateTarget).toBeGreaterThan(cap);
    const solver = solverOf(store, today);
    const r = enforceJStarPlanGuardrails(store, today, BASE, 0.93, 1.1, solver);
    expect(r.status).toBe('applied');
    if (r.status !== 'applied') return;
    expect(r.rule).toBe('G2');
    const ref = jstarPlanOf(ensureDailyLogs(store, today), today, BASE, 0.93, 1.1, solver, { stepTarget: store.plan?.stepTarget as number });
    if (!ref.ok) throw new Error('reference failed');
    expect(r.store.plan?.calorieTarget).toBe(ref.target);
    expect(r.store.plan?.weeklyRateTarget).toBe(ref.plan.weeklyRateTarget);
    expect(r.store.plan?.weeklyRateTarget as number).toBeLessThanOrEqual(cap + 1e-9);
    expect(s3pCheck(r.store, 28).violation).toBe(false);
  });

  it('closed loop: J*-path G1 and G2 keep S3-P after the first J* plan', () => {
    let g1 = 0;
    let g2 = 0;
    for (const spec of [...LEAN, ...FAST]) {
      const st = stateOf(run(spec), 'JS');
      expect(st.firstSwitchPlanDay).not.toBeNull();
      for (const g of st.guards.filter((x) => x.path === 'jstar' && x.status === 'applied')) {
        expect(g.day).toBeGreaterThan(st.firstSwitchPlanDay as number);
        if (g.rule === 'G1') {
          g1++;
          expect(st.planGoal.slice(g.day).every((x) => x === 'maintenance')).toBe(true);
        } else {
          g2++;
          expect(g.rateAfter as number).toBeLessThanOrEqual((guardrailMaxWeeklyRate('loss', g.bmi) as number) + 1e-9);
        }
        const b = st.jsBuilds.find((x) => x.day === g.day && x.kind === (g.rule === 'G1' ? 'guardrail_g1' : 'guardrail_g2'));
        expect(b?.ok).toBe(true);
        expect(Math.abs((g.targetAfter as number) * (b?.h as number) - (b?.iStar as number))).toBeLessThanOrEqual(1e-9);
      }
      expect(st.s3p.filter((c) => c.day >= (st.firstSwitchPlanDay as number) && c.violation)).toEqual([]);
    }
    expect(g1).toBeGreaterThan(0);
    expect(g2).toBeGreaterThan(0);
  });
});

describe('7. arm C (prompt 41 s3.2)', () => {
  // Lean users with a negative shift: the median of the logged totals is under the floor x 1.10, T_c is replaced.
  const REPLACED = [fixtureSpec(90_200, { sex: 'female', bmi: 21, heightCm: 155, rate: 0.0025, shift: -400, behavior: 'R0' }), fixtureSpec(90_201, { sex: 'female', bmi: 21, heightCm: 158, rate: 0.0025, shift: -400, behavior: 'R30' })];
  it('T_c and every later plan respect the floor x 1.10, the floor field is corrected, no S4-P day', () => {
    let replaced = 0;
    for (const spec of [...REPLACED, ...LEAN]) {
      const c = stateOf(run(spec), 'C');
      const sw = c.switchDay as number;
      const tc = c.tc;
      if (!tc) throw new Error('no T_c');
      const chosen = c.plans.find((p) => p.kind === 'chosen_target');
      expect(chosen?.hardFloorKcal).toBe(tc.floor);
      if (tc.replaced) {
        replaced++;
        expect(tc.final).toBe(tc.floor);
      }
      expect(tc.final).toBeGreaterThanOrEqual(tc.floor);
      for (const p of c.plans.filter((x) => x.day >= sw)) expect(p.calorieTarget).toBeGreaterThanOrEqual(p.hardFloorKcal - 1e-9);
      for (let d = sw; d < c.planTarget.length; d++) expect(c.planTarget[d] as number).toBeGreaterThanOrEqual(c.planFloor[d] as number);
      const plan = c.store.plan;
      if (!plan) throw new Error('no plan');
      if (c.plans[c.plans.length - 1]?.kind !== 'chosen_target') expect(plan.hardFloorKcal).toBe(hardFloorKcal(plan.reeKcal, (c.store.profile as UserProfile).sexForEquation) * 1.1);
    }
    expect(replaced).toBeGreaterThan(0);
  });
});

describe('8. order of an evaluation day (prompt 41 s3.1.12)', () => {
  it('guardrail plans, then calibration plans, then periodic replans; S3-P reads the plan in force after all of them', () => {
    const rank: Record<string, number> = { guardrail_g1: 0, guardrail_g2: 0, chosen_target: 1, recal_current: 1, recal_jstar: 1, replan_periodic: 2, replan_periodic_jstar: 2 };
    let sameDay = 0;
    for (const spec of [...LEAN, ...FAST]) {
      for (const { state: st } of run(spec).arms) {
        for (let k = 1; k < st.plans.length; k++) {
          const p = st.plans[k - 1] as { day: number; kind: string };
          const q = st.plans[k] as { day: number; kind: string };
          if (p.day !== q.day) continue;
          sameDay++;
          expect(rank[p.kind] as number, `${spec.index} day ${q.day}: ${p.kind} then ${q.kind}`).toBeLessThanOrEqual(rank[q.kind] as number);
        }
        for (const c of st.s3p) {
          expect(c.goal).toBe(st.planGoal[c.day]);
          expect(c.rate).toBe(st.planRate[c.day]);
        }
        // The first J* plan replaces the current method's evaluation of its day: no current recalibration from that day on.
        if (st.firstSwitchPlanDay !== null && st.mode === 'JS') expect(st.plans.filter((p) => p.day >= (st.firstSwitchPlanDay as number) && p.kind === 'recal_current')).toEqual([]);
      }
    }
    expect(sameDay).toBeGreaterThan(0);
  });
});

describe('isolation (prompt 41 s4.3)', () => {
  it('no store, worker, hook, screen, component or app module reaches the iteration 2d prototype', () => {
    const scope = ['src/store', 'src/app', 'src/screens', 'src/components', 'src/hooks'].flatMap(sourceFiles).concat(['src/main.tsx']);
    for (const f of scope) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/jstar|JStar|habitOf|chosenFloorFactor|ChosenTargetSettings|hardFloorMultiplier|postSwitch|PostSwitchBehavior|SlotDesign|columns2d|jobs2d|ARM_JS|CHOSEN_2D/);
    }
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((f) => `${dir}/${f.replace(/\\/g, '/')}`)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .sort();
}
