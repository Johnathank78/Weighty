/**
 * Guardrails of the plan in force, iteration 2c (prompt 39 s3.1 to s3.4): `enforcePlanGuardrails` (domain, measurement
 * only) and the `planGuardrails` option of the closed-loop simulator. G1: a loss plan under BMI 20 becomes a maintenance
 * plan at the app weight; G2: a loss plan faster than the cap of the current BMI is rebuilt at most at the cap.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addWeight, applyRecalibration, buildPlanFromStore, changeGoal, completeOnboarding, computeCalibrationState, currentWeightKg, enforcePlanGuardrails, ensureDailyLogs, setAdherence } from '@/domain/engine';
import type { SolverRequest } from '@/domain/engine';
import type { WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { LOSS_UNAVAILABLE_BMI_BELOW } from '@/science/constants';
import { addDays } from '@/science/dates';
import { guardrailMaxWeeklyRate } from '@/science/goals';
import { bmi } from '@/science/macros';
import type { UserProfile } from '@/science/types';
import { POPULATIONS, SIM_DAYS, closedLoopSlots, lhsSeed, makeSpec, simulateUser } from '../helpers/closedLoop';
import type { ArmConfig, Population, SimState } from '../helpers/closedLoop';
import { makeProfile } from '../helpers/profiles';
import { ARMS_2B, SEED_BASES_2B } from '../experiments-journal/it2b/jobs2b';

const D0 = '2026-01-05';
const iso = (date: string) => `${date}T08:00:00.000Z`;
const K2: SolverRequest = { solverStart: 'currentState', rateDefinition: 'sustainedTissue', solverHorizonDays: 28 };

/** Onboarding at D0, then a daily weigh-in on days 1 to n (linear from `from` to `to` kg) declared on plan. */
function storeWithWeights(profile: UserProfile, from: number, to: number, n: number, solver?: SolverRequest): { store: WheightyStore; today: string } {
  const onboarding = completeOnboarding(emptyStore(), profile, D0, iso(D0), null, solver);
  if (!onboarding.ok) throw new Error(onboarding.reason);
  const today = addDays(D0, n);
  let store = ensureDailyLogs(onboarding.store, today);
  for (let d = 0; d < n; d++) store = setAdherence(store, addDays(D0, d), 'on_plan');
  for (let d = 1; d <= n; d++) store = addWeight(store, { date: addDays(D0, d), weightKg: from + ((to - from) * d) / n }, iso(addDays(D0, d)));
  return { store, today };
}

const appBmi = (store: WheightyStore) => bmi(currentWeightKg(store) as number, (store.profile as UserProfile).heightCm);

// Female, 165 cm, BMI 21.0, loss at 0.25 %/week (cap of BMI 20 to 22) towards BMI 18.5.
const lean = makeProfile({ sexForEquation: 'female', ageYears: 30, heightCm: 165, currentWeightKg: 57.2, averageSteps7d: 7000, goal: 'loss', targetWeightKg: 50.4, weeklyRateTarget: 0.0025 });
// Male, 180 cm, BMI 26.0, loss at 1 %/week (cap from BMI 25) towards BMI 18.5.
const heavy = makeProfile({ sexForEquation: 'male', ageYears: 35, heightCm: 180, currentWeightKg: 84.2, averageSteps7d: 8000, goal: 'loss', targetWeightKg: 60, weeklyRateTarget: 0.01 });

describe('changeGoal options (prompt 39 s3.1)', () => {
  it('absent or empty: the production goal change exactly', () => {
    const { store, today } = storeWithWeights(heavy, 84, 83, 14);
    const input = { goal: 'maintenance' as const, targetWeightKg: 83, weeklyRate: 0 };
    const reference = changeGoal(store, today, input);
    expect(changeGoal(store, today, input, undefined)).toEqual(reference);
    expect(changeGoal(store, today, input, {})).toEqual(reference);
  });
});

describe('G1 (prompt 39 s3.1)', () => {
  it('fires on a loss plan whose app weight is under BMI 20, and only then', () => {
    const low = storeWithWeights(lean, 56.8, 52.0, 28);
    expect(low.store.plan?.goal).toBe('loss');
    expect(appBmi(low.store)).toBeLessThan(LOSS_UNAVAILABLE_BMI_BELOW);
    const r = enforcePlanGuardrails(low.store, low.today);
    expect(r.status).toBe('applied');
    if (r.status !== 'applied') return;
    expect(r.rule).toBe('G1');
    expect(r.bmi).toBe(appBmi(low.store));
    const weight = currentWeightKg(low.store) as number;
    expect(r.store.profile?.goal).toBe('maintenance');
    expect(r.store.profile?.targetWeightKg).toBe(weight);
    expect(r.store.profile?.weeklyRateTarget).toBe(0);
    expect(r.store.plan?.goal).toBe('maintenance');
    expect(r.store.plan?.targetWeightKg).toBe(weight);
    expect(r.store.plan?.createdAt.slice(0, 10)).toBe(low.today);
    expect(r.store.plan?.stepTarget).toBe(low.store.plan?.stepTarget);
    // Built by changeGoal with the step target of the plan in force.
    const viaChangeGoal = changeGoal(low.store, low.today, { goal: 'maintenance', targetWeightKg: weight, weeklyRate: 0 }, { stepTarget: low.store.plan?.stepTarget as number });
    expect(viaChangeGoal.ok && viaChangeGoal.store).toEqual(r.store);

    // BMI 20 to 22 at 0.25 %/week: neither G1 nor G2; the store comes back as the same object.
    const above = storeWithWeights(lean, 57.0, 55.6, 28);
    expect(appBmi(above.store)).toBeGreaterThanOrEqual(LOSS_UNAVAILABLE_BMI_BELOW);
    const none = enforcePlanGuardrails(above.store, above.today);
    expect(none.status).toBe('none');
    expect(none.status === 'none' && none.store).toBe(above.store);
  });

  it('never fires on a maintenance or gain plan under BMI 20', () => {
    for (const goal of ['maintenance', 'gain'] as const) {
      const profile = makeProfile({ sexForEquation: 'female', ageYears: 30, heightCm: 165, currentWeightKg: 51.7, averageSteps7d: 7000, goal, targetWeightKg: goal === 'gain' ? 55 : 51.7, weeklyRateTarget: goal === 'gain' ? 0.0025 : 0 });
      const { store, today } = storeWithWeights(profile, 51.6, 51.5, 21);
      expect(appBmi(store)).toBeLessThan(LOSS_UNAVAILABLE_BMI_BELOW);
      const r = enforcePlanGuardrails(store, today, { solver: K2 });
      expect(r.status).toBe('none');
      expect(r.status === 'none' && r.store).toBe(store);
    }
  });

  it('after G1, a later recalibration builds a maintenance plan (the loss is never restored)', () => {
    const low = storeWithWeights(lean, 56.8, 52.0, 28);
    const g1 = enforcePlanGuardrails(low.store, low.today, { solver: K2 });
    if (g1.status !== 'applied') throw new Error('G1 expected');
    // Two more weeks of weigh-ins at the new weight, then the calibration of the day.
    let store = g1.store;
    const today = addDays(low.today, 14);
    store = ensureDailyLogs(store, today);
    for (let d = 0; d < 14; d++) store = setAdherence(store, addDays(low.today, d), 'on_plan');
    for (let d = 1; d <= 14; d++) store = addWeight(store, { date: addDays(low.today, d), weightKg: 52.0 }, iso(addDays(low.today, d)));
    const state = computeCalibrationState(store, today, iso(today));
    expect(state?.gate.met).toBe(true);
    const recal = applyRecalibration(store, state as NonNullable<typeof state>, today, iso(today), K2);
    expect(recal.ok).toBe(true);
    if (!recal.ok) return;
    expect(recal.store.plan?.goal).toBe('maintenance');
    expect(recal.store.profile?.goal).toBe('maintenance');
    // A further guardrail check leaves the maintenance plan as it is.
    const again = enforcePlanGuardrails(recal.store, today, { solver: K2 });
    expect(again.status).toBe('none');
  });
});

describe('G2 (prompt 39 s3.1)', () => {
  it('fires when the plan rate exceeds the cap of the current BMI, and only then; the new plan respects the cap', () => {
    const fast = storeWithWeights(heavy, 84.0, 78.5, 28);
    const b = appBmi(fast.store);
    expect(b).toBeGreaterThanOrEqual(22);
    expect(b).toBeLessThan(25);
    const cap = guardrailMaxWeeklyRate('loss', b) as number;
    expect(fast.store.plan?.weeklyRateTarget).toBeGreaterThan(cap);
    for (const solver of [undefined, K2]) {
      const r = enforcePlanGuardrails(fast.store, fast.today, solver ? { solver } : {});
      expect(r.status).toBe('applied');
      if (r.status !== 'applied') return;
      expect(r.rule).toBe('G2');
      expect(r.store.plan?.goal).toBe('loss');
      expect(r.store.plan?.weeklyRateTarget).toBeLessThanOrEqual(cap + 1e-9);
      expect(r.store.plan?.createdAt.slice(0, 10)).toBe(fast.today);
      expect(r.store.plan?.stepTarget).toBe(fast.store.plan?.stepTarget);
      expect(r.store.plan?.source).toBe('recalibrated');
      expect(r.store.profile).toEqual(fast.store.profile);
      // Rules of a recalculation from the latest applied snapshot (none here: population estimate), user's solver options.
      const rebuilt = buildPlanFromStore(ensureDailyLogs(fast.store, fast.today), fast.today, { source: 'recalibrated', stepTarget: fast.store.plan?.stepTarget as number, ...(solver ? { solver } : {}) });
      expect(rebuilt.ok && rebuilt.plan).toEqual(r.store.plan);
    }
    // Same BMI, plan at the cap: no rule applies, same object.
    const atCap = storeWithWeights({ ...heavy, weeklyRateTarget: 0.005 }, 84.0, 78.5, 28);
    expect(atCap.store.plan?.weeklyRateTarget).toBeLessThanOrEqual(cap + 1e-9);
    const none = enforcePlanGuardrails(atCap.store, atCap.today);
    expect(none.status === 'none' && none.store).toBe(atCap.store);
    // Plan at 1 %/week while the BMI stays at or above 25: no rule applies.
    const stillHigh = storeWithWeights(heavy, 84.0, 82.5, 14);
    expect(appBmi(stillHigh.store)).toBeGreaterThanOrEqual(25);
    const kept = enforcePlanGuardrails(stillHigh.store, stillHigh.today, { solver: K2 });
    expect(kept.status === 'none' && kept.store).toBe(stillHigh.store);
  });
});

describe('reproduction case: user 478 of the 2b realistic world (prompt 39 s3.3)', () => {
  const A: ArmConfig = { key: 'A', kind: 'A' };
  const base = SEED_BASES_2B.followers2b;
  const slot = closedLoopSlots(2000, lhsSeed(base))[478];
  if (!slot) throw new Error('no slot');
  const run = (planGuardrails: boolean): SimState => {
    const spec = makeSpec(slot, base, 478, { pass: 'real2b', behavior: 'follower', population: POPULATIONS.P10 as Population, solver: ARMS_2B.K2.solver as SolverRequest, replanEveryDays: ARMS_2B.K2.replanEveryDays as number, planGuardrails });
    expect(spec.master).toBe(2_900_000_478);
    return (simulateUser(spec, [A]).arms[0] as { state: SimState }).state;
  };
  const h2 = (slot.profile.heightCm / 100) ** 2;

  it('without G: the committed final true weight of report 38 (BMI 16.5); with G: maintenance from the first evaluation under BMI 20', () => {
    const noG = run(false);
    // Committed raw of 2b (real2b-shard14.csv.gz, arm K2): true weight at day 168.
    expect(String(noG.trueW[SIM_DAYS])).toBe('40.74378401450273');
    expect(Math.round(((noG.trueW[SIM_DAYS] as number) / h2) * 10) / 10).toBe(16.5);
    expect(noG.guards).toEqual([]);
    const first = noG.s3p.find((c) => c.bmi < LOSS_UNAVAILABLE_BMI_BELOW);
    if (!first) throw new Error('no evaluation under BMI 20');

    const withG = run(true);
    const g1 = withG.guards[0];
    expect(g1?.rule).toBe('G1');
    expect(g1?.status).toBe('applied');
    expect(g1?.day).toBe(first.day);
    expect(g1?.bmi).toBe(first.bmi);
    // Pinned after the first run (non-regression, not a measurement).
    expect(g1?.day).toBe(21);
    expect(Math.round((g1?.bmi as number) * 1000) / 1000).toBe(19.998);
    expect(withG.guards.filter((g) => g.rule === 'G2')).toEqual([]);
    // Every later plan is a maintenance plan; no evaluation restores the loss; S3-P holds.
    expect(withG.plans.filter((p) => p.day >= first.day).every((p) => p.kind !== 'onboarding')).toBe(true);
    expect(withG.planGoal.slice(first.day).every((g) => g === 'maintenance')).toBe(true);
    expect(withG.s3p.filter((c) => c.violation)).toEqual([]);
    expect(noG.s3p.filter((c) => c.violation).length).toBeGreaterThan(0);
  });
});

describe('isolation (prompt 39 s3.4)', () => {
  it('no store, worker, hook, screen, component or app module reaches the 2c prototype', () => {
    const scope = ['src/store', 'src/app', 'src/screens', 'src/components', 'src/hooks'].flatMap(sourceFiles).concat(['src/main.tsx']);
    for (const f of scope) expect(readFileSync(f, 'utf8'), f).not.toMatch(/planGuardrails|enforcePlanGuardrails|PlanGuardrail|GoalChangeOptions|guardStep|s3pCheck|GuardRecord|S3pRecord/);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((f) => `${dir}/${f.replace(/\\/g, '/')}`)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .sort();
}
