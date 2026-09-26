/**
 * Relaunch of iteration 2 (prompt 40 s4.6): guardrails in journal mode and in chosen-target mode, harness only (measurement).
 * - G1 in journal mode: maintenance plan in logged units, identical to `journalGoalPlan` with these inputs; no later
 *   evaluation restores the loss.
 * - G2 in journal mode: the rebuilt plan respects the cap of the current BMI.
 * - A compliant journal plan comes back unchanged (same object).
 * - Arm C: neither G2 nor the periodic replan on the chosen target; both apply after the first recalibration.
 * - Order of an evaluation day (s3.12): G, calibration evaluation, periodic replan, S3-P.
 * Fixtures: hand-built stores, and closed-loop users on the discarded pilot seeds (base pilot2r, indexes 90 000 and up,
 * declared in it2r/jobs2r.ts).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addWeight, completeOnboarding, currentWeightKg, enforcePlanGuardrails, ensureDailyLogs, setAdherence } from '@/domain/engine';
import type { SolverRequest } from '@/domain/engine';
import { addFoodEntry } from '@/domain/journal';
import { journalCalibrationInputFromStore } from '@/domain/journalCalibration';
import type { JournalRegimeOptions } from '@/domain/journalCalibration';
import type { WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { assessBaseline } from '@/science/assessment';
import { LOSS_UNAVAILABLE_BMI_BELOW } from '@/science/constants';
import { addDays } from '@/science/dates';
import { guardrailMaxWeeklyRate, hardFloorKcal } from '@/science/goals';
import { bmi } from '@/science/macros';
import type { UserProfile } from '@/science/types';
import { POPULATIONS, SIM_START, closedLoopProfile, enforceJournalPlanGuardrails, journalGoalPlan, makeSpec, simulateArmToMorning, simulateUser } from '../helpers/closedLoop';
import type { ArmConfig, Population, ProfileSlot, SimState, UserSpec } from '../helpers/closedLoop';
import { makeProfile } from '../helpers/profiles';
import { ARM_A, ARM_C, K2G, SEED_BASES_2R, armJ } from '../experiments-journal/it2r/jobs2r';

const D0 = '2026-01-05';
const iso = (date: string) => `${date}T08:00:00.000Z`;
const K2: SolverRequest = K2G.solver;
const JOURNAL: JournalRegimeOptions = { journalRegimeStart: D0, usabilityRule: { kind: 'R0' }, nonUsableDayWeight: 0.5, journalPrior: 'flat', offsetGridHalfRangeKcal: 2000, carbSource: 'baseline' };
const BASE = { offsetKcal: -80, interval80: [-180, 20] as const, interval95: [-260, 100] as const };

/** Onboarding at D0, then n days: declared on plan, the plan target logged in one meal, a daily weigh-in from `from` to `to` kg. */
function journalStore(profile: UserProfile, from: number, to: number, n: number): { store: WheightyStore; today: string } {
  const onboarding = completeOnboarding(emptyStore(), profile, D0, iso(D0), null, K2);
  if (!onboarding.ok) throw new Error(onboarding.reason);
  const today = addDays(D0, n);
  let store = ensureDailyLogs(onboarding.store, today);
  const target = store.plan?.calorieTarget as number;
  for (let d = 0; d < n; d++) {
    const date = addDays(D0, d);
    store = setAdherence(store, date, 'on_plan');
    const r = addFoodEntry(store, { kind: 'manual', food: { name: 'Repas', intake: { energyKcal: target, proteinG: 100, carbsG: (target * 0.45) / 4, fatG: (target - 400 - target * 0.45) / 9 }, grams: null }, date, localTime: '12:30', consumedTime: '12:30' }, iso(date));
    if (!r.ok) throw new Error(r.reason);
    store = r.store;
  }
  for (let d = 1; d <= n; d++) store = addWeight(store, { date: addDays(D0, d), weightKg: from + ((to - from) * d) / n }, iso(addDays(D0, d)));
  return { store, today };
}

const appBmi = (store: WheightyStore) => bmi(currentWeightKg(store) as number, (store.profile as UserProfile).heightCm);
const solverOf = (store: WheightyStore, today: string) => {
  const prepared = journalCalibrationInputFromStore(store, today, JOURNAL);
  if (!prepared) throw new Error('no journal input');
  return { request: K2, input: prepared.input };
};

// Female, 165 cm, BMI 21.0, loss at 0.25 %/week towards BMI 18.5; male, 180 cm, BMI 26.0, loss at 1 %/week.
const lean = makeProfile({ sexForEquation: 'female', ageYears: 30, heightCm: 165, currentWeightKg: 57.2, averageSteps7d: 7000, goal: 'loss', targetWeightKg: 50.4, weeklyRateTarget: 0.0025 });
const heavy = makeProfile({ sexForEquation: 'male', ageYears: 35, heightCm: 180, currentWeightKg: 84.2, averageSteps7d: 8000, goal: 'loss', targetWeightKg: 60, weeklyRateTarget: 0.01 });

/** Closed-loop fixture on the pilot seeds (index 90 000 and up): a non-follower who declares 'major_deviation' every day. */
function fixtureSpec(index: number, c: { sex: 'female' | 'male'; bmi: number; heightCm: number; rate: number; shift: number }): UserSpec {
  const profile = closedLoopProfile(c.sex, c.bmi, 'sedentary', 'loss', 35, c.heightCm, c.rate);
  const slot: ProfileSlot = { key: `unit${index}`, sex: c.sex, bmiClass: 'unit', activity: 'sedentary', goal: 'loss', profile, shiftKcal: c.shift, weighProbability: 1, deviationFrequency: 0, majorShare: 1 };
  return makeSpec(slot, SEED_BASES_2R.pilot2r, index, { pass: 'unit2r', behavior: 'nonfollower', population: POPULATIONS.P00 as Population, ...K2G });
}
const J85 = armJ(0.85);
const ARMS: ArmConfig[] = [ARM_A, J85, ARM_C];
const stateOf = (res: ReturnType<typeof simulateUser>, key: string) => (res.arms.find((a) => a.arm.key === key) as { state: SimState }).state;
// Lean loss users (journal-path G1 at days 70 and 98) and users just above BMI 25 at 1 %/week (G2).
const LEAN_G1 = [fixtureSpec(90_003, { sex: 'female', bmi: 20.6, heightCm: 165, rate: 0.0025, shift: -270 }), fixtureSpec(90_005, { sex: 'female', bmi: 20.9, heightCm: 165, rate: 0.0025, shift: -270 })];
const FAST_G2 = [fixtureSpec(90_100, { sex: 'male', bmi: 25.15, heightCm: 180, rate: 0.01, shift: -400 }), fixtureSpec(90_101, { sex: 'male', bmi: 25.15, heightCm: 180, rate: 0.01, shift: -270 })];
const runs = new Map<UserSpec, ReturnType<typeof simulateUser>>();
const run = (spec: UserSpec) => {
  let r = runs.get(spec);
  if (!r) {
    r = simulateUser(spec, ARMS);
    runs.set(spec, r);
  }
  return r;
};

describe('G1 in journal mode (prompt 40 s3.13)', () => {
  it('maintenance plan in logged units, identical to journalGoalPlan with these inputs; a further check and a journal rebuild keep maintenance', () => {
    const { store, today } = journalStore(lean, 56.8, 52.0, 28);
    expect(store.plan?.goal).toBe('loss');
    expect(appBmi(store)).toBeLessThan(LOSS_UNAVAILABLE_BMI_BELOW);
    const solver = solverOf(store, today);
    const r = enforceJournalPlanGuardrails(store, today, BASE, 1.1, solver);
    expect(r.status).toBe('applied');
    if (r.status !== 'applied') return;
    expect(r.rule).toBe('G1');
    expect(r.bmi).toBe(appBmi(store));
    const weight = currentWeightKg(store) as number;
    const profile = r.store.profile as UserProfile;
    expect(profile.goal).toBe('maintenance');
    expect(profile.targetWeightKg).toBe(weight);
    expect(profile.weeklyRateTarget).toBe(0);
    const plan = r.store.plan;
    if (!plan) throw new Error('no plan');
    expect(plan.goal).toBe('maintenance');
    expect(plan.targetWeightKg).toBe(weight);
    expect(plan.weeklyRateTarget).toBe(0);
    expect(plan.createdAt.slice(0, 10)).toBe(today);
    expect(plan.stepTarget).toBe(store.plan?.stepTarget);
    // Identical to journalGoalPlan with these inputs: maintenance profile, journal offset, floor x 1.10, steps kept, K2.
    const reference = journalGoalPlan({ ...store, profile }, today, BASE.offsetKcal, 1.1, solver, { goal: 'maintenance', targetWeightKg: weight, stepTarget: store.plan?.stepTarget as number });
    expect(reference.goalPlan.status).toBe('ok');
    expect(plan.calorieTarget).toBe(reference.goalPlan.calorieTargetKcal);
    expect(plan.macros).toEqual(reference.goalPlan.macros?.exact);
    // Logged units: NASEM at the app weight + the journal offset; floor of the arm (D-32 x 1.10).
    const assessment = assessBaseline(profile, today, { weightKg: weight, palCategory: store.meta.initialPalCategory ?? plan.palCategory });
    expect(plan.maintenanceKcal).toBe(assessment.populationTdeeKcal + BASE.offsetKcal);
    expect(plan.personalOffsetKcal).toBe(BASE.offsetKcal);
    expect(plan.hardFloorKcal).toBe(hardFloorKcal(assessment.ree.reeKcalDay, profile.sexForEquation) * 1.1);
    // Nothing restores the loss: a further check returns the same store, a journal rebuild (evaluation) is a maintenance plan.
    const again = enforceJournalPlanGuardrails(r.store, today, BASE, 1.1, solver);
    expect(again.status === 'none' && again.store).toBe(r.store);
    const rebuilt = journalGoalPlan(r.store, today, BASE.offsetKcal - 50, 1.1, solverOf(r.store, today));
    expect(rebuilt.goalPlan.status).toBe('ok');
    expect(rebuilt.goalPlan.weeklyRateTarget).toBe(0);
    expect(rebuilt.goalPlan.goal).toBe('maintenance');
  });

  it('closed loop: after a journal-path G1, every plan is a maintenance plan to day 168', () => {
    for (const spec of LEAN_G1) {
      const st = stateOf(run(spec), 'J');
      const g1 = st.guards.find((g) => g.rule === 'G1' && g.path === 'journal' && g.status === 'applied');
      if (!g1) throw new Error(`no journal G1 (${spec.index})`);
      expect(st.firstSwitchPlanDay).not.toBeNull();
      expect(g1.day).toBeGreaterThan(st.firstSwitchPlanDay as number);
      expect(g1.mode).toBe('J');
      expect(st.planGoal.slice(g1.day).every((g) => g === 'maintenance')).toBe(true);
      expect(st.plans.filter((p) => p.day >= g1.day).every((p) => p.weeklyRateTarget === 0)).toBe(true);
      expect(st.plans.filter((p) => p.day > g1.day && p.kind === 'recal_journal').length).toBeGreaterThan(0);
      expect(st.store.profile?.goal).toBe('maintenance');
      expect(st.s3p.filter((c) => c.day >= g1.day && c.violation)).toEqual([]);
    }
  });
});

describe('G2 in journal mode (prompt 40 s3.13)', () => {
  it('fires above the cap of the current BMI; the rebuilt plan respects the cap and is journalGoalPlan with the steps kept', () => {
    const { store, today } = journalStore(heavy, 84.0, 78.5, 28);
    const b = appBmi(store);
    expect(b).toBeGreaterThanOrEqual(22);
    expect(b).toBeLessThan(25);
    const cap = guardrailMaxWeeklyRate('loss', b) as number;
    expect(store.plan?.weeklyRateTarget).toBeGreaterThan(cap);
    const solver = solverOf(store, today);
    const r = enforceJournalPlanGuardrails(store, today, BASE, 1.1, solver);
    expect(r.status).toBe('applied');
    if (r.status !== 'applied') return;
    expect(r.rule).toBe('G2');
    const plan = r.store.plan;
    if (!plan) throw new Error('no plan');
    expect(plan.goal).toBe('loss');
    expect(plan.weeklyRateTarget).toBeLessThanOrEqual(cap + 1e-9);
    expect(plan.createdAt.slice(0, 10)).toBe(today);
    expect(plan.stepTarget).toBe(store.plan?.stepTarget);
    expect(r.store.profile).toEqual(store.profile);
    const reference = journalGoalPlan(store, today, BASE.offsetKcal, 1.1, solver, { stepTarget: store.plan?.stepTarget as number });
    expect(plan.calorieTarget).toBe(reference.goalPlan.calorieTargetKcal);
    expect(plan.weeklyRateTarget).toBe(reference.goalPlan.weeklyRateTarget);
  });

  it('closed loop: every journal-path G2 leaves a plan within the cap of the app BMI of that day', () => {
    let seen = 0;
    for (const spec of FAST_G2) {
      const st = stateOf(run(spec), 'J');
      for (const g of st.guards.filter((x) => x.rule === 'G2' && x.path === 'journal' && x.status === 'applied')) {
        seen++;
        expect(g.rateAfter as number).toBeLessThanOrEqual((guardrailMaxWeeklyRate('loss', g.bmi) as number) + 1e-9);
        expect(g.rateBefore).toBeGreaterThan(guardrailMaxWeeklyRate('loss', g.bmi) as number);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('compliant journal plan (prompt 40 s4.6)', () => {
  it('a loss plan within both rules, and a maintenance plan under BMI 20, come back as the same object', () => {
    const within = journalStore(heavy, 84.0, 82.5, 14);
    expect(appBmi(within.store)).toBeGreaterThanOrEqual(25);
    const r = enforceJournalPlanGuardrails(within.store, within.today, BASE, 1.1, solverOf(within.store, within.today));
    expect(r.status === 'none' && r.store).toBe(within.store);
    const maintenance = makeProfile({ ...lean, currentWeightKg: 51.7, goal: 'maintenance', targetWeightKg: 51.7, weeklyRateTarget: 0 });
    const low = journalStore(maintenance, 51.6, 51.5, 21);
    expect(appBmi(low.store)).toBeLessThan(LOSS_UNAVAILABLE_BMI_BELOW);
    const m = enforceJournalPlanGuardrails(low.store, low.today, BASE, 1.1, solverOf(low.store, low.today));
    expect(m.status === 'none' && m.store).toBe(low.store);
  });
});

describe('arm C (prompt 40 s3.10, s4.2, s4.3)', () => {
  it('no G2, no periodic replan and no S3-P check on the chosen target; after the first recalibration, as in arm A', () => {
    const spec = FAST_G2[0] as UserSpec;
    const res = run(spec);
    const c = stateOf(res, 'C');
    const a = stateOf(res, 'A');
    const switchDay = c.switchDay as number;
    expect(res.proposalDay).toBe(switchDay);
    const firstRecal = c.plans.find((p) => p.day > switchDay && p.kind === 'recal_current');
    if (!firstRecal) throw new Error('no recalibration in C');
    // The G2 condition holds on the chosen target the morning of the first recalibration: A applies G2 that day, C does not.
    expect(a.guards.some((g) => g.day === firstRecal.day && g.rule === 'G2' && g.status === 'applied')).toBe(true);
    const morning = simulateArmToMorning(spec, ARM_C, firstRecal.day).state;
    expect(morning.chosenTargetActive).toBe(true);
    expect(morning.store.plan?.calorieTarget).toBe(c.tc?.final);
    const wouldBe = enforcePlanGuardrails(morning.store, addDays(SIM_START, firstRecal.day), { solver: K2 });
    expect(wouldBe.status === 'applied' && wouldBe.rule).toBe('G2');
    expect(c.guards.filter((g) => g.day <= firstRecal.day)).toEqual([]);
    // No periodic replan and no checked S3-P while the chosen target is in force; exempt checks on those days only.
    expect(c.replans.filter((r) => r.day >= switchDay && r.day < firstRecal.day)).toEqual([]);
    expect(c.s3p.filter((q) => q.exempt).map((q) => q.day)).toEqual(c.s3p.filter((q) => q.day >= switchDay && q.day < firstRecal.day).map((q) => q.day));
    // After the first recalibration: periodic replans (both fixtures) and G2 (second fixture), as in arm A.
    expect(c.replans.filter((r) => r.day > firstRecal.day && r.status === 'replanned').length).toBeGreaterThan(0);
    const c2 = stateOf(run(FAST_G2[1] as UserSpec), 'C');
    const firstRecal2 = c2.plans.find((p) => p.day > (c2.switchDay as number) && p.kind === 'recal_current') as { day: number };
    expect(c2.guards.some((g) => g.day > firstRecal2.day && g.rule === 'G2' && g.status === 'applied' && g.mode === 'C' && g.path === 'current')).toBe(true);
    expect([...c.s3p, ...c2.s3p].filter((q) => !q.exempt && q.violation)).toEqual([]);
  });

  it('G1 applies on the chosen target', () => {
    // Lean user 90 001: the chosen target is replaced by G1 the morning after the switch week.
    const spec = fixtureSpec(90_001, { sex: 'female', bmi: 20.3, heightCm: 165, rate: 0.0025, shift: -270 });
    const c = stateOf(simulateUser(spec, [ARM_C]), 'C');
    const g1 = c.guards.find((g) => g.rule === 'G1' && g.status === 'applied');
    if (!g1) throw new Error('no G1 in C');
    expect(g1.mode).toBe('C');
    expect(g1.day).toBeGreaterThan(c.switchDay as number);
    const before = c.plans.filter((p) => p.day < g1.day).pop();
    expect(before?.kind).toBe('chosen_target');
    expect(c.planGoal.slice(g1.day).every((g) => g === 'maintenance')).toBe(true);
  });
});

describe('order of an evaluation day (prompt 40 s3.12)', () => {
  it('guardrail plans, then calibration plans, then periodic replans; S3-P reads the plan in force after all of them', () => {
    const rank: Record<string, number> = { guardrail_g1: 0, guardrail_g2: 0, chosen_target: 1, recal_current: 1, recal_journal: 1, replan_periodic: 2, replan_periodic_journal: 2 };
    let sameDay = 0;
    for (const spec of [...LEAN_G1, ...FAST_G2]) {
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
      }
    }
    expect(sameDay).toBeGreaterThan(0);
  });
});

describe('isolation (prompt 40 s4.4)', () => {
  it('no store, worker, hook, screen, component or app module reaches the relaunch prototype', () => {
    const scope = ['src/store', 'src/app', 'src/screens', 'src/components', 'src/hooks'].flatMap(sourceFiles).concat(['src/main.tsx']);
    for (const f of scope) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/enforceJournalPlanGuardrails|journalGuardStep|JournalGuardrailResult|JournalPlanOverrides|journalPlanOf|chosenTargetActive|majorShare|MAJOR_SHARES|columns2r|simulateArmToMorning|refDay2r|K2G/);
    }
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((f) => `${dir}/${f.replace(/\\/g, '/')}`)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .sort();
}
