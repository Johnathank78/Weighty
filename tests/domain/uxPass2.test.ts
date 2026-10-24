/**
 * UX pass 2 (John's feedback of 24 October), the domain side: the steps / calories slider on a personal target, which holds
 * at the steps of the plan in force (point 2), with the bit-for-bit check of the targets at the steps of the profile against
 * the base 1209d49; the options of "Changer de plan" (points 3 and 4); the periods of Suivi (5), the entry of a weigh-in (6), the
 * confidence gauge (7), the adherence noted (8).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRACKING_RANGE_LABEL } from '@/app/copy';
import { DEFAULT_TRACKING_RANGE, trackingChart, TRACKING_RANGE_DAYS, TRACKING_RANGES } from '@/domain/views';
import { typeWeighKey, weighHint, weighSaveEnabled } from '@/domain/weighEntry';
import { addWeight, applySliderSteps, completeOnboarding, computeCalibrationState, createSliderSession, guardrailWeightKg, periodicReplan, rebuildContextFromStore, setAdherence } from '@/domain/engine';
import type { CalibrationState } from '@/domain/engine';
import { applyPathSliderSteps, balanceSliderAvailable, pathSliderSession } from '@/domain/journalPath';
import { checkPersonalTarget, choosePersonalTarget, computePersonalTakeover, personalTargetLine, personalTargetTable, readPersonalTarget, storePersonalTargetTable, takeOverPersonalTarget } from '@/domain/personalTarget';
import { addFoodEntry } from '@/domain/journal';
import { planChangeOptions } from '@/domain/planChange';
import { JOURNAL_MESSAGE, PERSONAL_TARGET_MESSAGE, PLAN_CHANGE_MESSAGE } from '@/domain/planMessages';
import { runDailyChecks } from '@/domain/planSafety';
import type { CurrentPlan, WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { addDays } from '@/science/dates';
import { planHardFloorKcal } from '@/science/goals';
import { bmi } from '@/science/macros';
import type { UserProfile } from '@/science/types';
import { personalTargetFixture } from '../helpers/personalTargetFixture';
import { makeProfile } from '../helpers/profiles';

const D0 = '2026-06-01';
const day = (i: number) => addDays(D0, i);
const at = (date: string) => `${date}T08:00:00.000Z`;

/** 75 kg, 165 cm, loss (the example of the review). */
const LOSS: UserProfile = makeProfile({ sexForEquation: 'female', ageYears: 35, heightCm: 165, currentWeightKg: 75, goal: 'loss', targetWeightKg: 64, weeklyRateTarget: 0.005 });

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};
const planOf = (s: WheightyStore) => s.plan as CurrentPlan;
const onboard = (): WheightyStore => ok(completeOnboarding(emptyStore(), LOSS, D0, at(D0))).store;
const personal = (kcal = 1700): WheightyStore => ok(choosePersonalTarget(onboard(), D0, kcal, at(D0))).store;

/** Weigh-ins every day (changing by `perDay` kg), declared on plan, from day 1 to day `to`. */
function weighed(s: WheightyStore, perDay: number, to = 21): WheightyStore {
  let out = s;
  for (let i = 1; i <= to; i++) {
    out = addWeight(out, { date: day(i), weightKg: LOSS.currentWeightKg + perDay * i }, at(day(i)));
    out = setAdherence(out, day(i), 'on_plan');
  }
  return out;
}

describe('2c. the slider on a personal target', () => {
  it('available in Plan and its sheet; the session is the existing one on the plan in force, around the target at its steps', () => {
    const s = personal();
    expect(balanceSliderAvailable(s)).toBe(true);
    const session = pathSliderSession(s, D0);
    const reference = createSliderSession(s, D0);
    if (!session || !reference) throw new Error('no session');
    expect(session.baseline).toEqual({ goal: 'loss', scenario: { calorieTargetKcal: 1700, stepsPerDay: 7000 } });
    for (const steps of [5000, 7000, 9000, 11000]) expect(session.pointAt(steps)).toEqual(reference.pointAt(steps));
    // The figures of the review: 1 608 kcal at 5 000 steps, 1 793 at 9 000, 1 884 at 11 000 (caution zone).
    expect(Math.round(session.pointAt(5000).calorieTargetKcal)).toBe(1608);
    expect(Math.round(session.pointAt(9000).calorieTargetKcal)).toBe(1793);
    expect(session.pointAt(11000)).toMatchObject({ zone: 'caution' });
    expect(Math.round(session.pointAt(11000).calorieTargetKcal)).toBe(1884);
  });

  it('saved: target, steps, macros and projection as the slider does; source, createdAt and the estimated rate kept; no trace entry', () => {
    const s = personal();
    const before = planOf(s);
    const point = (createSliderSession(s, D0) as NonNullable<ReturnType<typeof createSliderSession>>).pointAt(9000);
    const after = ok(applyPathSliderSteps(s, D0, 9000)).store;
    const plan = planOf(after);
    expect(plan).toMatchObject({ source: 'personal_target', createdAt: before.createdAt, stepTarget: 9000, calorieTarget: point.calorieTargetKcal, macros: point.macros.exact });
    expect(plan.personalTarget).toEqual({ ...before.personalTarget, kcal: point.calorieTargetKcal });
    expect(plan.personalTarget?.estimatedRate).toBe(before.personalTarget?.estimatedRate);
    expect(plan.personalTarget?.beyondGrid).toBe(before.personalTarget?.beyondGrid);
    expect(plan.projection).not.toEqual(before.projection);
    expect(after.meta.planEvents).toEqual(s.meta.planEvents);
    expect(after.dailyLogs.find((l) => l.date === D0)).toMatchObject({ calorieTargetForDay: plan.calorieTarget, stepTargetForDay: 9000 });
    // The line of the personal target in Plan gives the new target, with its text unchanged (point 2b).
    expect(personalTargetLine(after)).toBe(PERSONAL_TARGET_MESSAGE.inPlan(plan.calorieTarget));
    // Back at the steps of the target: the target the user set.
    expect(planOf(ok(applyPathSliderSteps(after, D0, 7000)).store)).toMatchObject({ source: 'personal_target', calorieTarget: 1700, stepTarget: 7000, personalTarget: before.personalTarget });
  });

  it('the hard floor blocks as for every plan', () => {
    const ctx = rebuildContextFromStore(onboard(), D0);
    if (!ctx) throw new Error('no context');
    const floor = Math.ceil(planHardFloorKcal(ctx) / 10) * 10;
    const s = personal(floor);
    const session = createSliderSession(s, D0);
    if (!session) throw new Error('no session');
    expect(session.pointAt(session.bounds.minSteps).belowHardFloor).toBe(true);
    const r = applySliderSteps(s, D0, session.bounds.minSteps);
    // Clamped to the lowest steps the floor allows, or blocked: never under the floor.
    if (r.ok) expect(planOf(r.store).calorieTarget).toBeGreaterThanOrEqual(planOf(s).hardFloorKcal ?? 0);
    else expect(r.reason).toBe('blocked');
  });
});

describe('2a. the steps of a personal target', () => {
  it('chosen after the slider was moved: the steps of the plan in force are kept (before: back to those of the profile)', () => {
    const moved = ok(applySliderSteps(onboard(), D0, 10000)).store;
    expect(planOf(moved).stepTarget).toBe(10000);
    const table = storePersonalTargetTable(moved, D0);
    const ctx = rebuildContextFromStore(moved, D0);
    if (!table || !ctx) throw new Error('no table');
    expect(table).toEqual(personalTargetTable(ctx, 'loss', 10000));
    const chosen = ok(choosePersonalTarget(moved, D0, 1700, at(D0))).store;
    const plan = planOf(chosen);
    expect(plan).toMatchObject({ source: 'personal_target', calorieTarget: 1700, stepTarget: 10000, baselineStepTarget: 10000, baselineCalorieTarget: 1700 });
    const check = checkPersonalTarget(table, 1700);
    if (!check.ok) throw new Error('refused');
    expect(plan.personalTarget).toEqual(check.target);
    // At more steps, the same target is a faster loss than at the steps of the profile.
    const atProfile = checkPersonalTarget(storePersonalTargetTable(onboard(), D0) as NonNullable<ReturnType<typeof storePersonalTargetTable>>, 1700);
    if (!atProfile.ok) throw new Error('refused');
    expect(check.target.estimatedRate).toBeLessThan(atProfile.target.estimatedRate);
    // Its slider is around the target at those steps.
    expect(createSliderSession(chosen, D0)?.baseline.scenario).toEqual({ calorieTargetKcal: 1700, stepsPerDay: 10000 });
  });

  it('the takeover reads the target at the steps of the plan, and its plan keeps them', () => {
    const s = weighed(ok(applyPathSliderSteps(personal(), D0, 9000)).store, -0.05);
    const kcal = planOf(s).calorieTarget;
    const state = computeCalibrationState(s, day(21), at(day(21))) as CalibrationState;
    const t = computePersonalTakeover(s, state, day(21), at(day(21)));
    if (!t || t.status !== 'applied') throw new Error('no takeover');
    const ctx = rebuildContextFromStore({ ...s, calibrationSnapshots: [...s.calibrationSnapshots, t.snapshot] }, day(21));
    if (!ctx) throw new Error('no context');
    const reading = readPersonalTarget(personalTargetTable(ctx, 'loss', 9000), kcal);
    expect(t.event.personalTarget).toMatchObject({ kcal, estimatedRate: -reading.rate, beyondGrid: reading.beyondGrid });
    expect(t.next).toMatchObject({ source: 'recalibrated', stepTarget: 9000 });
    expect(planOf(takeOverPersonalTarget(s, state, day(21), at(day(21))))).toMatchObject({ source: 'recalibrated', stepTarget: 9000 });
  });
});

describe('2d. unchanged while it is in force, after the slider', () => {
  it('no rate cap (G2), no periodic replan', () => {
    const s = ok(applyPathSliderSteps(personal(1450), D0, 9000)).store;
    const target = planOf(s).calorieTarget;
    let lighter = s;
    for (let i = 1; i <= 25; i++) lighter = addWeight(lighter, { date: day(i), weightKg: 63 }, at(day(i)));
    expect(bmi(guardrailWeightKg(lighter) as number, 165)).toBeLessThan(25);
    const after = runDailyChecks(lighter, day(25), at(day(25)));
    expect(planOf(after)).toMatchObject({ source: 'personal_target', calorieTarget: target, stepTarget: 9000 });
    expect(after.meta.planEvents.some((e) => e.rule === 'G2')).toBe(false);
    expect(periodicReplan(s, day(60), { nowIso: at(day(60)) }).status).toBe('not_due');
  });

  it('G1 under BMI 20, and the underweight alert', () => {
    let thin = ok(applyPathSliderSteps(personal(), D0, 9000)).store;
    for (let i = 1; i <= 25; i++) thin = addWeight(thin, { date: day(i), weightKg: 45 }, at(day(i)));
    const after = runDailyChecks(thin, day(25), at(day(25)));
    expect(planOf(after)).toMatchObject({ goal: 'maintenance', source: 'guardrail' });
    expect(after.meta.planEvents.some((e) => e.rule === 'G1' && e.status === 'applied')).toBe(true);
    expect(after.meta.planEvents.some((e) => e.rule === 'underweight_bmi')).toBe(true);
  });
});

describe('2e. a personal target at the steps of the profile: bit for bit the base 1209d49', () => {
  it('entry (onboarding and Plan), estimated rate, plan, trace entry and takeover', () => {
    const base = readFileSync('tests/fixtures/ux2-personal-target-base.json', 'utf8').trim();
    const now = JSON.stringify(personalTargetFixture());
    if (now !== base) {
      // Point at the first differing key, for the report.
      const a = JSON.parse(base) as Record<string, unknown>;
      const b = JSON.parse(now) as Record<string, unknown>;
      const key = Object.keys(a).find((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
      expect(key).toBeUndefined();
    }
    expect(now).toBe(base);
  });
});

describe('3 and 4. the options of "Changer de plan"', () => {
  /** `days` days logged in full among the 14 before `today` (day 14). */
  function logged(days: number): WheightyStore {
    let s = onboard();
    for (let i = 0; i < days; i++) {
      const r = addFoodEntry(s, { kind: 'manual', food: { name: 'Repas', intake: { energyKcal: 1800, proteinG: null, carbsG: null, fatG: null }, grams: null }, date: day(i), localTime: '12:00', consumedTime: '12:00' }, at(day(i)));
      if (!r.ok) throw new Error(r.reason);
      s = r.store;
    }
    return s;
  }
  const withMethod = (s: WheightyStore, method: 'aligned' | 'measured'): WheightyStore => ({ ...s, meta: { ...s.meta, journalPath: { ...s.meta.journalPath, method } } });
  const personalOption = { id: 'personal', title: PLAN_CHANGE_MESSAGE.personalTitle, sub: PLAN_CHANGE_MESSAGE.personalSub, enabled: true };

  it('target assumed to be followed, journal long enough: both, active', () => {
    expect(planChangeOptions(logged(14), day(14))).toEqual([personalOption, { id: 'align', title: PLAN_CHANGE_MESSAGE.alignTitle, sub: PLAN_CHANGE_MESSAGE.alignSub, enabled: true }]);
  });

  it('target assumed to be followed, journal too short: the alignment greyed, with the existing line', () => {
    expect(planChangeOptions(logged(6), day(14))).toEqual([personalOption, { id: 'align', title: PLAN_CHANGE_MESSAGE.alignTitle, sub: JOURNAL_MESSAGE.alignButtonDisabled(4), enabled: false }]);
    expect(PLAN_CHANGE_MESSAGE.alignTitle).toBe(JOURNAL_MESSAGE.alignButton);
    expect(PLAN_CHANGE_MESSAGE.personalTitle).toBe(PERSONAL_TARGET_MESSAGE.planAction);
  });

  it('aligned target, measured habit: no entry in Plan', () => {
    expect(planChangeOptions(withMethod(logged(14), 'aligned'), day(14))).toBeNull();
    expect(planChangeOptions(withMethod(logged(14), 'measured'), day(14))).toBeNull();
  });

  it('a personal target in force: both, as before (the method stays the target assumed to be followed)', () => {
    const s = personal();
    expect(planChangeOptions(s, D0)).toEqual([personalOption, { id: 'align', title: PLAN_CHANGE_MESSAGE.alignTitle, sub: JOURNAL_MESSAGE.alignButtonDisabled(10), enabled: false }]);
  });

  it('annex texts, without the em dash', () => {
    expect(PLAN_CHANGE_MESSAGE).toMatchObject({ button: 'Je souhaite changer de plan', title: 'Changer de plan', personalSub: 'Tu connais déjà les calories qui te conviennent.', alignSub: 'D’après les 14 derniers jours de ton journal.' });
    expect(JSON.stringify(PLAN_CHANGE_MESSAGE)).not.toContain('—');
  });
});

describe('5. Suivi: "Ce mois-ci" and "Tout"', () => {
  it('two periods, "Ce mois-ci" by default: the last 30 days (the former "1 mois"), and everything', () => {
    expect(TRACKING_RANGES).toEqual(['month', 'all']);
    expect(DEFAULT_TRACKING_RANGE).toBe('month');
    expect(TRACKING_RANGES.map((r) => TRACKING_RANGE_LABEL[r])).toEqual(['Ce mois-ci', 'Tout']);
    const s = weighed(onboard(), -0.05, 60);
    const month = trackingChart(s, day(60), TRACKING_RANGE_DAYS.month);
    const all = trackingChart(s, day(60), TRACKING_RANGE_DAYS.all);
    expect(month).toEqual(trackingChart(s, day(60), 30));
    expect(month?.startDate).toBe(day(30));
    expect(all?.startDate).toBe(D0);
  });
});

describe('6. new weigh-in: the last weight as a greyed hint', () => {
  it('the field starts empty: the first key starts a new value; the hint is the last weigh-in, "0" without any', () => {
    expect(['7', '4', ',', '6'].reduce(typeWeighKey, '')).toBe('74,6');
    expect(typeWeighKey('', ',')).toBe('');
    expect(typeWeighKey('', 'del')).toBe('');
    expect(weighHint(weighed(onboard(), -0.1, 3), 'metric')).toBe('74,7');
    expect(weighHint(emptyStore(), 'metric')).toBe('0');
  });

  it('"Enregistrer" is inactive while the value is empty', () => {
    expect(weighSaveEnabled('')).toBe(false);
    expect(weighSaveEnabled('7')).toBe(true);
  });
});
