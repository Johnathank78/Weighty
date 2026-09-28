/**
 * Pass 5a (report 43): production solver checks, guardrails, periodic replan, target migration, warning ahead of BMI 20,
 * refusal messages, floor advice, underweight alert, persistent trace, loading of schema 6.
 */
import { describe, expect, it } from 'vitest';
import {
  addWeight,
  applyRecalibration,
  buildPlan,
  buildPlanFromStore,
  completeOnboarding,
  computeCalibrationState,
  enforcePlanGuardrails,
  ensureDailyLogs,
  markPlanEventSeen,
  onboardingSpeedSliderModel,
  periodicReplan,
  setAdherence,
  switchToMaintenance,
  unseenPlanMessages,
} from '@/domain/engine';
import { explainPreview } from '@/domain/explain';
import { PLAN_MESSAGE, PLAN_REFUSAL_REASONS, recalibrationRefusedText, refusalReasonText } from '@/domain/planMessages';
import { bmi20Warning, checkUnderweight, floorAdviceOf, runDailyChecks, runWeighInChecks, trendDeclinedWeeks } from '@/domain/planSafety';
import type { WheightyStore } from '@/domain/types';
import { SCHEMA_VERSION } from '@/domain/types';
import { migrateToCurrent } from '@/persistence/migrations';
import { emptyStore, validateStore } from '@/persistence/schema';
import { loadStore, MemoryStorage, saveStore, STORE_KEY } from '@/persistence/storage';
import { THIN_SPACE } from '@/domain/format';
import { addDays } from '@/science/dates';
import { maxSelectableWeeklyRate } from '@/science/goals';
import type { GoalPlanStatus } from '@/science/goals';
import { bmi, minimumTargetWeightKg, weightAtBmi } from '@/science/macros';
import type { UserProfile } from '@/science/types';
import { makeProfile } from '../helpers/profiles';

const D0 = '2026-06-01';
const at = (date: string) => `${date}T08:00:00.000Z`;

function onboard(profile: UserProfile, date = D0): WheightyStore {
  const r = completeOnboarding(emptyStore(), profile, date, at(date));
  if (!r.ok) throw new Error(r.reason);
  return r.store;
}

/** Weigh-ins without any check (as the simulator of reports 38 and 39 does between two evaluations). */
function weigh(store: WheightyStore, from: string, kgs: readonly number[], everyDays = 1): WheightyStore {
  let s = store;
  kgs.forEach((kg, i) => {
    const date = addDays(from, i * everyDays);
    s = addWeight(s, { date, weightKg: kg }, at(date));
  });
  return s;
}

/** Store with an applied recalibration on D0 + 21 (daily weigh-ins, days noted "plan respecté"). */
function recalibrated(): { store: WheightyStore; recalDay: string } {
  const profile = makeProfile({ sexForEquation: 'male', ageYears: 40, heightCm: 180, currentWeightKg: 92, goal: 'loss', targetWeightKg: 82, weeklyRateTarget: 0.005 });
  let s = onboard(profile);
  const days = 21;
  s = weigh(s, addDays(D0, 1), Array.from({ length: days }, (_, i) => 92 - 0.06 * (i + 1)));
  for (let d = 0; d <= days; d++) s = setAdherence(s, addDays(D0, d), 'on_plan');
  const recalDay = addDays(D0, days);
  const state = computeCalibrationState(s, recalDay, at(recalDay));
  if (!state?.gate.met) throw new Error('gate');
  const r = applyRecalibration(s, state, recalDay, at(recalDay));
  if (!r.ok) throw new Error(r.reason);
  return { store: r.store, recalDay };
}

describe('guardrail G1 (BMI 20): at the day change and after a weigh-in', () => {
  // 165 cm: BMI 20 at 54.45 kg; minimal target 54.5 kg.
  const profile = makeProfile({ heightCm: 165, currentWeightKg: 55, goal: 'loss', targetWeightKg: 54.5, weeklyRateTarget: 0.0025 });
  const under = () => weigh(onboard(profile), addDays(D0, 1), [53.6, 53.5, 53.4, 53.4, 53.3, 53.3, 53.2]);

  it('after a weigh-in: loss plan under BMI 20 switched to maintenance, own source, trace and message', () => {
    const s = under();
    expect(s.plan?.goal).toBe('loss');
    const day = addDays(D0, 7);
    const next = runWeighInChecks(s, day, at(day));
    expect(next.plan).toMatchObject({ goal: 'maintenance', source: 'guardrail', createdAt: `${day}T00:00:00.000Z`, stepTarget: s.plan?.stepTarget });
    expect(next.profile?.goal).toBe('maintenance');
    expect(next.meta.guardrailMaintenanceSince).toBe(day);
    const events = next.meta.planEvents.filter((e) => e.rule === 'G1');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ date: day, status: 'applied', message: PLAN_MESSAGE.guardrailBmi20, seen: false, before: { goal: 'loss' }, after: { goal: 'maintenance', source: 'guardrail' } });
    // The maintenance target is the weight the guardrail read (trend, unrounded).
    expect(next.profile?.targetWeightKg).toBeLessThan(weightAtBmi(20, 165));
    // Checked again: nothing more happens (same store).
    expect(runWeighInChecks(next, day, at(day)).meta.planEvents.filter((e) => e.rule === 'G1')).toHaveLength(1);
  });

  it('at the day change: the same switch, and the "objectif atteint" path gives the same plan (target, steps)', () => {
    const s = under();
    const day = addDays(D0, 8);
    const next = runDailyChecks(s, day, at(day));
    expect(next.plan).toMatchObject({ goal: 'maintenance', source: 'guardrail' });
    const reached = switchToMaintenance(s, day);
    if (!reached.ok) throw new Error(reached.reason);
    const { source: _a, ...g1 } = next.plan as NonNullable<WheightyStore['plan']>;
    const { source: _b, ...user } = reached.store.plan as NonNullable<WheightyStore['plan']>;
    expect(user).toEqual(g1);
    expect(reached.store.profile?.targetWeightKg).toBe(next.profile?.targetWeightKg);
    expect(reached.store.meta.guardrailMaintenanceSince).toBeNull();
  });

  it('never acts on a maintenance or gain plan, nor above BMI 20', () => {
    const s = weigh(onboard(profile), addDays(D0, 1), [55, 55.1]);
    const day = addDays(D0, 2);
    expect(enforcePlanGuardrails(s, day).status).toBe('none');
    const maintenance = weigh(onboard({ ...profile, currentWeightKg: 53, goal: 'maintenance', targetWeightKg: 53 }), addDays(D0, 1), [52.5]);
    const r = enforcePlanGuardrails(maintenance, day);
    expect(r.status).toBe('none');
    expect(r.store).toBe(maintenance);
  });
});

describe('guardrail G2 (rate cap of the current BMI)', () => {
  // 180 cm: BMI 25 at 81 kg. Plan at 1 %/week at BMI 25.2, then a trend under BMI 25 (cap 0.5 %/week).
  const profile = makeProfile({ sexForEquation: 'male', ageYears: 35, heightCm: 180, currentWeightKg: 81.6, averageSteps7d: 9000, goal: 'loss', targetWeightKg: 75, weeklyRateTarget: 0.01 });
  const under = () => weigh(onboard(profile), addDays(D0, 1), [80.2, 80.1, 80, 80, 79.9, 79.9, 79.8]);

  it('after a weigh-in and at the day change: the rate is brought to the cap, with the message', () => {
    const s = under();
    expect(s.plan?.weeklyRateTarget).toBeGreaterThan(0.005);
    for (const run of [runWeighInChecks, runDailyChecks]) {
      const day = addDays(D0, 7);
      const next = run(s, day, at(day));
      expect(next.plan?.source).toBe('guardrail');
      expect(next.plan?.goal).toBe('loss');
      expect(next.plan?.weeklyRateTarget).toBeLessThanOrEqual(0.005);
      const e = next.meta.planEvents.find((x) => x.rule === 'G2');
      expect(e?.message).toBe(PLAN_MESSAGE.guardrailRateCap(next.plan?.weeklyRateTarget as number));
      expect(e?.before?.weeklyRateTarget).toBe(s.plan?.weeklyRateTarget);
      expect(e?.after?.weeklyRateTarget).toBe(next.plan?.weeklyRateTarget);
    }
  });
});

describe('periodic replan (28 days, K2)', () => {
  it('due 28 days after the solve, not before; own source; the step target is kept', () => {
    const { store, recalDay } = recalibrated();
    const s = weigh(store, addDays(recalDay, 1), Array.from({ length: 28 }, (_, i) => 90.6 - 0.06 * i));
    expect(periodicReplan(s, addDays(recalDay, 27)).status).toBe('not_due');
    const r = periodicReplan(s, addDays(recalDay, 28));
    if (r.status !== 'replanned') throw new Error(r.status);
    expect(r.store.plan).toMatchObject({ source: 'periodic_replan', createdAt: `${addDays(recalDay, 28)}T00:00:00.000Z`, stepTarget: store.plan?.stepTarget });
    expect(r.store.meta.periodicReplanCheckedOn).toBe(addDays(recalDay, 28));
    // Same plan as a rebuild from the latest applied snapshot (production solver).
    const rebuilt = buildPlanFromStore(s, addDays(recalDay, 28), { source: 'periodic_replan', stepTarget: store.plan?.stepTarget as number });
    expect(rebuilt.ok && rebuilt.plan.calorieTarget).toBe(r.store.plan?.calorieTarget);
    expect(periodicReplan(r.store, addDays(recalDay, 55)).status).toBe('not_due');
  });

  it('a message at 10 kcal/day or more, none under', () => {
    const { store: recal, recalDay } = recalibrated();
    const day = addDays(recalDay, 28);
    // Logs up to the day first: the rebuild reads them (their targets are the intake the calibration assumes).
    const store = ensureDailyLogs(recal, day);
    const dry = periodicReplan(store, day);
    if (dry.status !== 'replanned') throw new Error(dry.status);
    const target = dry.store.plan?.calorieTarget as number;
    const withTarget = (kcal: number): WheightyStore => ({ ...store, plan: { ...(store.plan as NonNullable<WheightyStore['plan']>), calorieTarget: kcal } });
    const small = periodicReplan(withTarget(target + 9.9), day);
    const large = periodicReplan(withTarget(target - 10), day);
    if (small.status !== 'replanned' || large.status !== 'replanned') throw new Error('replan');
    expect(small.event).toMatchObject({ rule: 'periodic_replan', message: null, seen: true });
    expect(unseenPlanMessages(small.store)).toEqual([]);
    expect(large.event.message).toBe(PLAN_MESSAGE.periodicReplan(target - 10, target));
    expect(unseenPlanMessages(large.store).map((e) => e.id)).toEqual([large.event.id]);
  });

  it('app not opened for several days: one evaluation on the day, nothing replayed', () => {
    const { store, recalDay } = recalibrated();
    const day = addDays(recalDay, 40);
    const next = runDailyChecks(store, day, at(day));
    const replans = next.meta.planEvents.filter((e) => e.rule === 'periodic_replan');
    expect(replans).toHaveLength(1);
    expect(replans[0]?.date).toBe(day);
    expect(next.plan?.createdAt).toBe(`${day}T00:00:00.000Z`);
    // Missing days are filled with the plan that was in force, the day itself with the new plan.
    expect(next.dailyLogs.find((l) => l.date === addDays(recalDay, 20))?.calorieTargetForDay).toBe(store.plan?.calorieTarget);
    expect(next.dailyLogs.find((l) => l.date === day)?.calorieTargetForDay).toBe(next.plan?.calorieTarget);
    // The next evaluation is 28 days after this one.
    expect(periodicReplan(next, addDays(day, 27)).status).toBe('not_due');
  });

  it('without an applied calibration: no replan, the next evaluation 28 days later', () => {
    const s = onboard(makeProfile({ goal: 'maintenance' }));
    const r = periodicReplan(s, addDays(D0, 30));
    if (r.status !== 'no_snapshot') throw new Error(r.status);
    expect(r.store.plan).toBe(s.plan);
    expect(periodicReplan(r.store, addDays(D0, 57)).status).toBe('not_due');
    expect(periodicReplan(r.store, addDays(D0, 58)).status).toBe('no_snapshot');
  });
});

describe('minimal target at BMI 20: migration of stored profiles (schema 6 -> 7)', () => {
  function v6(targetKg: number, goal: UserProfile['goal'] = 'loss'): Record<string, unknown> {
    const s = onboard(makeProfile({ heightCm: 165, currentWeightKg: 62, goal, targetWeightKg: goal === 'loss' ? 57 : 62, weeklyRateTarget: goal === 'loss' ? 0.005 : 0 }));
    const { planEvents: _e, periodicReplanCheckedOn: _p, guardrailMaintenanceSince: _g, ...meta } = s.meta;
    const raw = JSON.parse(JSON.stringify({ ...s, schemaVersion: 6, meta })) as Record<string, unknown>;
    (raw.profile as Record<string, unknown>).targetWeightKg = targetKg;
    (raw.plan as Record<string, unknown>).targetWeightKg = targetKg;
    return raw;
  }

  it('a loss target between BMI 18.5 and 20 is raised to the BMI-20 weight, announced once', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORE_KEY, JSON.stringify(v6(52)));
    const loaded = loadStore(storage, '2026-09-28T10:00:00.000Z');
    expect(loaded.status).toBe('migrated');
    const s = loaded.store;
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.profile?.targetWeightKg).toBe(minimumTargetWeightKg(165));
    expect(s.profile?.targetWeightKg).toBe(54.5);
    expect(bmi(54.5, 165)).toBeGreaterThanOrEqual(20);
    expect(s.plan?.targetWeightKg).toBe(54.5);
    const messages = unseenPlanMessages(s);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ rule: 'target_bmi_20', date: '2026-09-28', message: PLAN_MESSAGE.targetRaised(54.5) });
    expect(messages[0]?.message).toContain('54,5 kg');
    // Closed once: saved, reloaded, never shown again and never added again.
    const closed = markPlanEventSeen(s, messages[0]?.id as string);
    saveStore(storage, closed);
    const again = loadStore(storage, '2026-09-29T10:00:00.000Z').store;
    expect(unseenPlanMessages(again)).toEqual([]);
    expect(again.meta.planEvents.filter((e) => e.rule === 'target_bmi_20')).toHaveLength(1);
  });

  it('targets at BMI 20 or more, and maintenance targets, are left as they are', () => {
    for (const raw of [v6(57), v6(54.5), v6(53, 'maintenance')]) {
      const m = migrateToCurrent(raw, undefined, undefined, { nowIso: '2026-09-28T10:00:00.000Z' });
      if (!m.ok) throw new Error(m.error);
      const v = validateStore(m.value);
      if ('error' in v) throw new Error(v.error);
      expect(v.store.profile?.targetWeightKg).toBe((raw.profile as { targetWeightKg: number }).targetWeightKg);
      expect(v.store.meta.planEvents).toEqual([]);
    }
  });

  it('a schema 6 store loads without loss: weigh-ins, logs, snapshots, journal, preferences and meta kept', () => {
    const { store } = recalibrated();
    const { planEvents: _e, periodicReplanCheckedOn: _p, guardrailMaintenanceSince: _g, ...meta } = store.meta;
    const raw = JSON.parse(JSON.stringify({ ...store, schemaVersion: 6, meta })) as Record<string, unknown>;
    const m = migrateToCurrent(raw, undefined, undefined, { nowIso: '2026-09-28T10:00:00.000Z' });
    if (!m.ok) throw new Error(m.error);
    const v = validateStore(m.value);
    if ('error' in v) throw new Error(v.error);
    expect(v.clean).toBe(true);
    const s = v.store;
    for (const k of ['profile', 'plan', 'weights', 'dailyLogs', 'calibrationSnapshots', 'historicalEvidence', 'foodJournal', 'preferences'] as const) expect(s[k]).toEqual(store[k]);
    expect({ ...s.meta, planEvents: undefined, periodicReplanCheckedOn: undefined, guardrailMaintenanceSince: undefined }).toEqual({ ...meta, planEvents: undefined, periodicReplanCheckedOn: undefined, guardrailMaintenanceSince: undefined });
    expect(s.meta).toMatchObject({ planEvents: [], periodicReplanCheckedOn: null, guardrailMaintenanceSince: null });
  });
});

describe('warning ahead of BMI 20 (4 weeks, fast bound, daily step)', () => {
  const profile = makeProfile({ heightCm: 165, currentWeightKg: 56, goal: 'loss', targetWeightKg: 54.5, weeklyRateTarget: 0.0025 });

  it('announced when the fast bound crosses BMI 20 within 4 weeks, with the number of weeks', () => {
    const s = onboard(profile);
    const plan = s.plan as NonNullable<WheightyStore['plan']>;
    // A deficit much larger than the plan's (e.g. eating well under the target): the crossing comes within 4 weeks.
    const fast: WheightyStore = { ...s, plan: { ...plan, calorieTarget: plan.calorieTarget - 450 } };
    const w = bmi20Warning(fast, D0, null);
    expect(w).not.toBeNull();
    expect(w?.weeks).toBeGreaterThanOrEqual(1);
    expect(w?.weeks).toBeLessThanOrEqual(4);
    expect(w?.message).toBe(PLAN_MESSAGE.bmi20Warning(w?.weeks as number));
  });

  it('not announced at the plan speed far from BMI 20, nor on a maintenance plan', () => {
    const far = onboard({ ...profile, currentWeightKg: 75, targetWeightKg: 65, weeklyRateTarget: 0.005 });
    expect(bmi20Warning(far, D0, null)).toBeNull();
    expect(bmi20Warning(onboard({ ...profile, goal: 'maintenance', targetWeightKg: 56 }), D0, null)).toBeNull();
  });
});

describe('refused recalibration: one sentence per reason', () => {
  it('every reason the code can return has its own sentence, in the annex form, with the maintenance offer', () => {
    const statuses: GoalPlanStatus[] = ['loss_unavailable_low_bmi', 'target_bmi_too_low', 'target_not_below_current', 'target_not_above_current', 'no_feasible_speed'];
    for (const r of [...statuses, 'invalid_profile', 'no_profile', 'gate_not_met']) expect(PLAN_REFUSAL_REASONS).toContain(r);
    for (const r of PLAN_REFUSAL_REASONS) {
      const t = recalibrationRefusedText(r, 1200);
      expect(t).toBe(`On n’a pas pu recalculer ton plan : ${refusalReasonText(r, 1200)}. Tu peux passer en maintien.`);
      expect(refusalReasonText(r, 1200)).not.toBe(refusalReasonText('unknown', 1200));
    }
    expect(refusalReasonText('loss_unavailable_low_bmi', null)).toBe('ton IMC est sous 20, la perte n’est plus proposée');
    expect(refusalReasonText('no_feasible_speed', 1200)).toBe(`cette vitesse demanderait de manger sous ton minimum de 1${THIN_SPACE}200 kcal par jour`);
    expect(refusalReasonText('target_not_above_current', null)).toBe('tu as atteint ton poids cible');
  });
});

describe('floor explained, steps proposal', () => {
  const base = { sexForEquation: 'female' as const, heightCm: 155, ageYears: 60, goal: 'loss' as const, targetWeightKg: 50, weeklyRateTarget: 0.01 };
  const w = Math.round(23.5 * 1.55 ** 2 * 10) / 10;
  const build = (steps: number, offset: number) => buildPlan({ profile: makeProfile({ ...base, currentWeightKg: w, averageSteps7d: steps }), today: D0, weightKg: w, personalOffsetKcal: offset, source: 'initial' });

  it('BMI cap and floor both limit: the floor is named, the steps hold the capped rate at the floor', () => {
    const r = build(6000, -500);
    if (!r.ok) throw new Error(r.reason);
    expect(r.goalPlan.rejections[0]?.reason).toBe('above_guardrail_cap');
    const a = floorAdviceOf(r, 6000);
    expect(a?.rate).toBe(0.005);
    expect(a?.proposal).toEqual({ kind: 'steps', steps: 10900 });
    expect(a?.lines).toEqual([PLAN_MESSAGE.floorLimit(r.goalPlan.hardFloorKcal), PLAN_MESSAGE.floorSteps(0.005, 10900)]);
    // Independent check with the engine's slider limit: 0.5 %/week is selectable at 10 900 steps, not at 10 800.
    expect(maxSelectableWeeklyRate(r.context, 'loss', 10900).maxSelectableRate).toBe(0.005);
    expect(maxSelectableWeeklyRate(r.context, 'loss', 10800).maxSelectableRate).toBeLessThan(0.005);
  });

  it('no feasible speed: the steps are proposed too', () => {
    const r = build(6000, -700);
    expect(r.ok ? 'ok' : r.reason).toBe('no_feasible_speed');
    expect(floorAdviceOf(r, 6000)?.proposal).toEqual({ kind: 'steps', steps: 15500 });
  });

  it('unreachable: explicit, with the fastest rate walking more allows, or without one', () => {
    const partial = floorAdviceOf(build(6000, -900), 6000);
    expect(partial?.proposal).toEqual({ kind: 'unreachable', maxRate: 0.0025 });
    expect(partial?.lines[1]).toBe(PLAN_MESSAGE.floorUnreachable(0.0025));
    expect(partial?.lines[1]).toContain('Le maximum pour toi est 0,25');
    const none = floorAdviceOf(build(20000, -900), 20000);
    expect(none?.proposal).toEqual({ kind: 'unreachable', maxRate: null });
    expect(none?.lines[1]).toBe('Même en marchant davantage, cette vitesse n’est pas atteignable.');
  });

  it('speed slider limited by the floor: the floor is named with the steps for the fastest rate the BMI cap allows', () => {
    const p = makeProfile({ sexForEquation: 'female', ageYears: 60, heightCm: 155, currentWeightKg: 60.5, averageSteps7d: 3000, goal: 'loss', targetWeightKg: 55, weeklyRateTarget: 0.005 });
    const model = onboardingSpeedSliderModel(p, D0, null);
    expect(model?.limitedBy).toBe('below_hard_floor');
    expect(model?.maxSelectableRate).toBe(0.0065);
    expect(model?.floorKcal).toBe(1200);
    expect(model?.floorSteps).toEqual({ rate: 0.01, proposal: { kind: 'steps', steps: 8700 }, text: PLAN_MESSAGE.floorSteps(0.01, 8700) });
    const notLimited = onboardingSpeedSliderModel({ ...p, ageYears: 30, averageSteps7d: 9000 }, D0, null);
    expect(notLimited?.floorSteps ?? null).toBeNull();
  });

  it('no advice when the floor does not limit, and the explanation names the floor when it does', () => {
    expect(floorAdviceOf(build(6000, 0), 6000)).toBeNull();
    const caseR = makeProfile({ sexForEquation: 'female', ageYears: 24, heightCm: 155, currentWeightKg: 68, averageSteps7d: 9400, activities: [{ type: 'strength', sessionsPerWeek: 4, durationMin: 55, intensity: 'moderate' }], goal: 'loss', targetWeightKg: 60, weeklyRateTarget: 0.01 });
    const x = explainPreview(caseR, '2026-09-14', { evidenceVersion: 1, recordedOn: '2026-09-14', averageCaloriesKcal: 1450, durationDays: 14, startWeightKg: 68, endWeightKg: 68, trackingQuality: 'high', activityComparable: true });
    expect(x?.goal.limitingRule).toBe('below_hard_floor');
  });
});

describe('underweight alert', () => {
  it('trend under BMI 18.5: shown, at most once a week', () => {
    // 165 cm: BMI 18.5 at 50.4 kg.
    const s = weigh(onboard(makeProfile({ heightCm: 165, currentWeightKg: 50, goal: 'maintenance', targetWeightKg: 50 })), addDays(D0, 1), [49.8]);
    const day1 = addDays(D0, 1);
    const a = checkUnderweight(s, day1, at(day1));
    expect(unseenPlanMessages(a).map((e) => [e.rule, e.message])).toEqual([['underweight_bmi', PLAN_MESSAGE.underweight]]);
    expect(checkUnderweight(a, addDays(day1, 6), at(addDays(day1, 6)))).toBe(a);
    expect(checkUnderweight(a, addDays(day1, 7), at(addDays(day1, 7))).meta.planEvents).toHaveLength(2);
  });

  it('G1 maintenance: four weekly declines of the trend trigger it, three do not, outside G1 never', () => {
    // 175 cm: BMI 20 at 61.25 kg; imposed maintenance from D0, then a weigh-in every week, each lower.
    const profile = makeProfile({ heightCm: 175, currentWeightKg: 61, goal: 'maintenance', targetWeightKg: 61 });
    const base = weigh(onboard(profile), addDays(D0, 7), [60.8, 60.6, 60.4, 60.2], 7);
    const imposed: WheightyStore = { ...base, meta: { ...base.meta, guardrailMaintenanceSince: D0 } };
    const day28 = addDays(D0, 28);
    expect(trendDeclinedWeeks(imposed, day28, D0)).toBe(true);
    expect(checkUnderweight(imposed, day28, at(day28)).meta.planEvents.map((e) => e.rule)).toEqual(['underweight_decline']);
    expect(trendDeclinedWeeks(imposed, addDays(D0, 21), D0)).toBe(false);
    expect(checkUnderweight(imposed, addDays(D0, 21), at(addDays(D0, 21)))).toBe(imposed);
    expect(checkUnderweight(base, day28, at(day28))).toBe(base);
    // A goal chosen by the user ends the imposed maintenance.
    const reached = switchToMaintenance(imposed, day28);
    expect(reached.ok && reached.store.meta.guardrailMaintenanceSince).toBeNull();
  });
});

describe('persistent trace', () => {
  it('each entry keeps date, rule, plan before, plan after and the message shown, across save and load', () => {
    const profile = makeProfile({ heightCm: 165, currentWeightKg: 55, goal: 'loss', targetWeightKg: 54.5, weeklyRateTarget: 0.0025 });
    const s = weigh(onboard(profile), addDays(D0, 1), [53.6, 53.5, 53.4, 53.4, 53.3, 53.3, 53.2]);
    const day = addDays(D0, 7);
    const next = runWeighInChecks(s, day, at(day));
    const storage = new MemoryStorage();
    saveStore(storage, next);
    const loaded = loadStore(storage, at(day));
    expect(loaded.status).toBe('loaded');
    expect(loaded.store.meta.planEvents).toEqual(next.meta.planEvents);
    const e = loaded.store.meta.planEvents[0];
    expect(Object.keys(e ?? {}).sort()).toEqual(['after', 'before', 'date', 'id', 'message', 'rule', 'seen', 'status']);
  });

  it('an unreadable entry is reported as dropped, never silently', () => {
    const s = onboard(makeProfile());
    const v = validateStore({ ...s, meta: { ...s.meta, planEvents: [{ id: 'x', date: 'not-a-date' }] } });
    if ('error' in v) throw new Error(v.error);
    expect(v.clean).toBe(false);
    expect(v.dropped).toEqual([{ path: 'meta.planEvents.0', reason: 'invalid' }]);
  });
});
