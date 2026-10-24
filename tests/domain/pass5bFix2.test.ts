/**
 * Second fixes of pass 5b (report 47): the personal target as a starting point (refused only under the floor, both sides,
 * rates inside the limits), its rules while in force (G1 without G2, underweight alert, no periodic replan), its takeover by
 * the app at the first recalibration (five cases, without opening Suivi, failure), no "Garder ma cible", profile and goal
 * changes, the preview of a profile edit on the target assumed to be followed, schema 10.
 */
import { describe, expect, it } from 'vitest';
import {
  addWeight,
  applyRecalibration,
  changeGoal,
  completeOnboarding,
  computeCalibrationState,
  guardrailWeightKg,
  latestAppliedSnapshot,
  periodicReplan,
  previewInitialPlan,
  rebuildContextFromStore,
  setAdherence,
} from '@/domain/engine';
import type { CalibrationState } from '@/domain/engine';
import {
  applyPersonalTakeover,
  checkPersonalTarget,
  choosePersonalTarget,
  completeOnboardingWithTarget,
  computePersonalTakeover,
  goalRateOf,
  onboardingPersonalTargetTable,
  personalTargetLine,
  readPersonalTarget,
  storePersonalTargetTable,
  takeOverPersonalTarget,
} from '@/domain/personalTarget';
import { updateProfileOnPath } from '@/domain/journalPath';
import { planEventShort, planNotices, runDailyChecks } from '@/domain/planSafety';
import { PERSONAL_TARGET_MESSAGE } from '@/domain/planMessages';
import { analysisView } from '@/domain/views';
import { formatKcal, formatRatePercent, THIN_SPACE } from '@/domain/format';
import type { CurrentPlan, PlanEvent, WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { calibrationAnswer, calibrationFingerprint, createCalibrationRunner } from '@/store/calibrationClient';
import type { CalibrationResponse } from '@/store/calibrationClient';
import { addDays } from '@/science/dates';
import { calorieTargetForRate, planHardFloorKcal, weeklyRateRange } from '@/science/goals';
import type { PlanContext } from '@/science/goals';
import { bmi } from '@/science/macros';
import type { UserProfile } from '@/science/types';
import { makeProfile } from '../helpers/profiles';

const D0 = '2026-06-01';
const day = (i: number) => addDays(D0, i);
const at = (date: string) => `${date}T08:00:00.000Z`;

/** BMI 27.5: loss allowed up to 1 % a week. */
const LOSS: UserProfile = makeProfile({ sexForEquation: 'female', ageYears: 35, heightCm: 165, currentWeightKg: 75, goal: 'loss', targetWeightKg: 64, weeklyRateTarget: 0.005 });
/** BMI 24.2: loss allowed up to 0.5 % a week; the population estimate gives a maintenance of about 2 060 kcal. */
const LIGHT: UserProfile = makeProfile({ sexForEquation: 'female', ageYears: 35, heightCm: 165, currentWeightKg: 66, goal: 'loss', targetWeightKg: 60, weeklyRateTarget: 0.004 });
const GAIN: UserProfile = makeProfile({ sexForEquation: 'male', heightCm: 180, currentWeightKg: 70, goal: 'gain', targetWeightKg: 76, weeklyRateTarget: 0.0025 });
const MAINT: UserProfile = makeProfile({ goal: 'maintenance' });

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};
const planOf = (s: WheightyStore) => s.plan as CurrentPlan;
const lastEvent = (s: WheightyStore) => s.meta.planEvents[s.meta.planEvents.length - 1] as PlanEvent;

function onboard(profile: UserProfile = LOSS): WheightyStore {
  return ok(completeOnboarding(emptyStore(), profile, D0, at(D0))).store;
}

/** Personal target chosen on day 0, then a weigh-in every day (changing by `perDay` kg) declared on plan, up to day `to`. */
function personal(profile: UserProfile, kcal: number, perDay: number, to = 21, from = 1): WheightyStore {
  let s = ok(choosePersonalTarget(onboard(profile), D0, kcal, at(D0))).store;
  for (let i = from; i <= to; i++) {
    s = addWeight(s, { date: day(i), weightKg: profile.currentWeightKg + perDay * i }, at(day(i)));
    s = setAdherence(s, day(i), 'on_plan');
  }
  return s;
}

const stateOn = (s: WheightyStore, i: number) => computeCalibrationState(s, day(i), at(day(i))) as CalibrationState;

describe('1a. entry of the personal target', () => {
  it('a target the population estimate judged too fast is accepted, at the onboarding and in the Plan tab (before: refused)', () => {
    const t = onboardingPersonalTargetTable(LIGHT, D0, null);
    if (!t) throw new Error('no table');
    const preview = previewInitialPlan(LIGHT, D0);
    expect(preview.ok && Math.round(preview.plan.maintenanceKcal)).toBe(2056);
    const check = checkPersonalTarget(t, 1350);
    // 0.82 % a week estimated, faster than the 0.5 % allowed at BMI 24: the profile keeps 0.5 %.
    expect(check).toMatchObject({ ok: true, kcal: 1350, case: 'too_fast', goalRate: 0.005, target: { kcal: 1350, beyondGrid: false } });
    if (!check.ok) throw new Error('refused');
    expect(check.target.estimatedRate).toBeLessThan(-0.005);
    expect(check.text).toBe(PERSONAL_TARGET_MESSAGE.estimated(check.target.estimatedRate));
    expect(check.text).toBe(`Vitesse estimée au départ : ${formatRatePercent(-check.target.estimatedRate)} par semaine. Tes pesées diront la vraie.`);
    const r = ok(completeOnboardingWithTarget(emptyStore(), LIGHT, D0, at(D0), null, 1350));
    expect(planOf(r.store)).toMatchObject({ source: 'personal_target', calorieTarget: 1350, weeklyRateTarget: 0.005, requestedWeeklyRate: 0.005, personalTarget: check.target });
    expect(r.store.profile?.weeklyRateTarget).toBe(0.005);
    expect(r.store.dailyLogs.find((l) => l.date === D0)?.calorieTargetForDay).toBe(1350);
    const p = ok(choosePersonalTarget(onboard(LIGHT), D0, 1350, at(D0)));
    expect(planOf(p.store)).toMatchObject({ calorieTarget: 1350, requestedWeeklyRate: 0.005 });
  });

  it('under the floor: refused, with the minimum (unchanged)', () => {
    const t = storePersonalTargetTable(onboard(), D0);
    if (!t) throw new Error('no table');
    expect(t.floorKcal).toBe(1200);
    expect(checkPersonalTarget(t, 1190)).toEqual({ ok: false, reason: 'below_floor', text: `Ton minimum est de 1${THIN_SPACE}200 kcal par jour.`, limitKcal: 1200 });
    expect(choosePersonalTarget(onboard(), D0, 1190)).toMatchObject({ ok: false, reason: 'below_floor' });
    expect(completeOnboardingWithTarget(emptyStore(), LOSS, D0, at(D0), null, 1100)).toMatchObject({ ok: false, reason: 'below_floor' });
    expect(checkPersonalTarget(t, 1200).ok).toBe(true);
  });

  it('the table covers both sides; a target in the other direction than the goal is accepted with its line', () => {
    const t = storePersonalTargetTable(onboard(), D0);
    if (!t) throw new Error('no table');
    expect(t.sides.map((s) => s.goal)).toEqual(['loss', 'gain']);
    const up = checkPersonalTarget(t, 3200);
    expect(up).toMatchObject({ ok: true, case: 'opposite', goalRate: weeklyRateRange('loss').minRate, text: 'Au départ, l’app estime que tu prendrais du poids avec cette cible. Tes pesées diront la vraie.' });
    expect(up.ok && up.target.estimatedRate).toBeGreaterThan(0);
    const g = storePersonalTargetTable(onboard(GAIN), D0);
    if (!g) throw new Error('no table');
    expect(checkPersonalTarget(g, 1900)).toMatchObject({ ok: true, case: 'opposite', goalRate: weeklyRateRange('gain').minRate, text: 'Au départ, l’app estime que tu perdrais du poids avec cette cible. Tes pesées diront la vraie.' });
    const s = ok(choosePersonalTarget(onboard(), D0, 3200, at(D0))).store;
    expect(planOf(s)).toMatchObject({ calorieTarget: 3200, goal: 'loss', requestedWeeklyRate: 0.002, weeklyRateTarget: 0.002 });
    // A maintenance goal: the zone between the first notches is a stable weight, beyond it the other direction.
    const m = storePersonalTargetTable(onboard(MAINT), D0);
    if (!m) throw new Error('no table');
    const zero = m.sides[0]?.notches[0]?.kcal as number;
    expect(checkPersonalTarget(m, zero)).toMatchObject({ ok: true, case: 'maintenance', goalRate: 0, text: PERSONAL_TARGET_MESSAGE.estimated(0) });
    expect(checkPersonalTarget(m, 1300)).toMatchObject({ ok: true, case: 'maintenance', text: PERSONAL_TARGET_MESSAGE.opposite('loss') });
  });

  it('beyond the slider grid: the line "plus de"', () => {
    const s = onboard();
    const t = storePersonalTargetTable(s, D0);
    if (!t) throw new Error('no table');
    const fastest = calorieTargetForRate(rebuildContextFromStore(s, D0) as PlanContext, 'loss', 0.01, 7000) as number;
    expect(fastest).toBeGreaterThan(1250);
    const r = checkPersonalTarget(t, 1250);
    expect(r).toMatchObject({ ok: true, case: 'too_fast', goalRate: 0.01, target: { beyondGrid: true, estimatedRate: -0.01 } });
    expect(r.ok && r.text).toBe(`Vitesse estimée au départ : plus de ${formatRatePercent(0.01)} par semaine. Tes pesées diront la vraie.`);
  });

  it('the estimated rate is the speed slider read the other way (notches, interpolation)', () => {
    const s = onboard();
    const t = storePersonalTargetTable(s, D0);
    if (!t) throw new Error('no table');
    const notches = t.sides[0]?.notches as Array<{ rate: number; kcal: number }>;
    for (const n of notches.slice(1, 6)) expect(readPersonalTarget(t, n.kcal - 1e-9).rate).toBeCloseTo(n.rate, 6);
    const a = notches[4] as { rate: number; kcal: number };
    const b = notches[5] as { rate: number; kcal: number };
    expect(readPersonalTarget(t, (a.kcal + b.kcal) / 2)).toMatchObject({ direction: 'loss', beyondGrid: false });
    expect(readPersonalTarget(t, (a.kcal + b.kcal) / 2).rate).toBeCloseTo((a.rate + b.rate) / 2, 9);
  });

  it('no rate outside the limits of the goal and of the BMI is recorded as requested, in the profile or in the plan', () => {
    for (const [profile, cap] of [
      [LOSS, 0.01],
      [LIGHT, 0.005],
      [GAIN, 0.005],
    ] as const) {
      const range = weeklyRateRange(profile.goal);
      for (let kcal = 1200; kcal <= 3600; kcal += 100) {
        const r = choosePersonalTarget(onboard(profile), D0, kcal, at(D0));
        if (!r.ok) {
          expect(r.reason).toBe('below_floor');
          continue;
        }
        const plan = planOf(r.store);
        for (const rate of [r.store.profile?.weeklyRateTarget as number, plan.requestedWeeklyRate as number, plan.weeklyRateTarget]) {
          expect(rate).toBeGreaterThanOrEqual(range.minRate - 1e-12);
          expect(rate).toBeLessThanOrEqual(cap + 1e-12);
        }
      }
    }
    const m = ok(choosePersonalTarget(onboard(MAINT), D0, 1500, at(D0))).store;
    expect([m.profile?.weeklyRateTarget, planOf(m).weeklyRateTarget, planOf(m).requestedWeeklyRate]).toEqual([0, 0, 0]);
  });

  it('trace: a "personal_target_set" entry without message, with the target and the estimated rate', () => {
    const s = ok(choosePersonalTarget(onboard(LIGHT), D0, 1350, at(D0))).store;
    const e = lastEvent(s);
    expect(e).toMatchObject({ rule: 'personal_target_set', status: 'applied', message: null, seen: true, after: { calorieTarget: 1350, source: 'personal_target' } });
    expect(e.personalTarget).toEqual({ ...planOf(s).personalTarget, case: 'too_fast' });
    expect(lastEvent(ok(completeOnboardingWithTarget(emptyStore(), LIGHT, D0, at(D0), null, 1350)).store)).toMatchObject({ rule: 'personal_target_set', before: null, message: null });
    expect(planNotices(s.meta.planEvents.filter((x) => !x.seen), null)).toEqual([]);
  });

  it('Plan tab: the line of the annex', () => {
    const s = ok(choosePersonalTarget(onboard(), D0, 1700, at(D0))).store;
    expect(personalTargetLine(s)).toBe(`Ta cible personnelle : 1${THIN_SPACE}700 kcal par jour. L’app l’ajustera à ta première recalibration.`);
  });
});

describe('1b. while it is in force', () => {
  it('no rate cap (G2): the plan stays the personal target under BMI 25 (before: G2 rebuilt it)', () => {
    const s = ok(choosePersonalTarget(onboard(), D0, 1450, at(D0))).store;
    let lighter = s;
    for (let i = 1; i <= 25; i++) lighter = addWeight(lighter, { date: day(i), weightKg: 63 }, at(day(i)));
    expect(bmi(guardrailWeightKg(lighter) as number, 165)).toBeLessThan(25);
    const after = runDailyChecks(lighter, day(25), at(day(25)));
    expect(planOf(after)).toMatchObject({ source: 'personal_target', calorieTarget: 1450 });
    expect(after.meta.planEvents.some((e) => e.rule === 'G2')).toBe(false);
  });

  it('G1 on a loss plan under BMI 20, and the underweight alert, as for everyone', () => {
    const s = ok(choosePersonalTarget(onboard(), D0, 1700, at(D0))).store;
    let thin = s;
    for (let i = 1; i <= 25; i++) thin = addWeight(thin, { date: day(i), weightKg: 45 }, at(day(i)));
    expect(bmi(guardrailWeightKg(thin) as number, 165)).toBeLessThan(18.5);
    const after = runDailyChecks(thin, day(25), at(day(25)));
    expect(planOf(after)).toMatchObject({ goal: 'maintenance', source: 'guardrail' });
    expect(after.meta.planEvents.some((e) => e.rule === 'G1' && e.status === 'applied')).toBe(true);
    expect(after.meta.planEvents.some((e) => e.rule === 'underweight_bmi')).toBe(true);
  });

  it('no periodic replan', () => {
    const s = ok(choosePersonalTarget(onboard(), D0, 1700, at(D0))).store;
    expect(periodicReplan(s, day(60), { nowIso: at(day(60)) }).status).toBe('not_due');
    expect(planOf(runDailyChecks(s, day(60), at(day(60))))).toMatchObject({ source: 'personal_target', calorieTarget: 1700 });
  });
});

describe('1c. takeover by the app at the first recalibration', () => {
  type Case = { label: string; profile: UserProfile; kcal: number; perDay: number; expected: string };
  const CASES: Case[] = [
    { label: 'within the limits', profile: LOSS, kcal: 1700, perDay: -0.05, expected: 'within' },
    { label: 'too fast', profile: LIGHT, kcal: 1350, perDay: -0.1, expected: 'too_fast' },
    { label: 'too slow', profile: LOSS, kcal: 1700, perDay: -0.005, expected: 'too_slow' },
    { label: 'opposite direction', profile: LOSS, kcal: 1700, perDay: 0.03, expected: 'opposite' },
    { label: 'maintenance', profile: MAINT, kcal: 1700, perDay: -0.03, expected: 'maintenance' },
  ];

  for (const c of CASES) {
    it(`${c.label}: estimate recorded, source 'recalibrated', rate of the profile, trace entry and message`, () => {
      const s = personal(c.profile, c.kcal, c.perDay);
      const state = stateOn(s, 21);
      expect(state.surfaced).toBe(true);
      const t = takeOverPersonalTarget(s, state, day(21), at(day(21)));
      // 1. the estimate is recorded as applyRecalibration does.
      expect(t.calibrationSnapshots.length).toBe(s.calibrationSnapshots.length + 1);
      expect(latestAppliedSnapshot(t)).toMatchObject({ posteriorMedianOffsetKcal: state.candidate?.posteriorMedianOffsetKcal, appliedAt: at(day(21)) });
      expect(t.meta.lastSurfacedCalibration).toMatchObject({ tdeeKcal: state.proposedMaintenanceKcal, surfacedOn: day(21) });
      expect(computeCalibrationState(t, day(21), at(day(21)))?.surfaced).toBe(false);
      // 2-3. the rate read on the new estimate, and the case.
      const table = storePersonalTargetTable({ ...s, calibrationSnapshots: t.calibrationSnapshots }, day(21));
      if (!table) throw new Error('no table');
      const choice = goalRateOf(table, readPersonalTarget(table, c.kcal));
      expect(choice.case).toBe(c.expected);
      // 4-5. the plan of the current method at that rate; the personal target ends.
      const plan = planOf(t);
      expect(plan.source).toBe('recalibrated');
      expect(plan.personalTarget).toBeUndefined();
      expect(t.profile?.weeklyRateTarget).toBe(choice.rate);
      expect(plan.requestedWeeklyRate).toBe(choice.rate);
      expect(plan.maintenanceKcal).toBeCloseTo(state.proposedMaintenanceKcal as number, 0);
      expect(t.dailyLogs.find((l) => l.date === day(21))?.calorieTargetForDay).toBe(plan.calorieTarget);
      // 6. the trace entry and its message.
      const e = lastEvent(t);
      expect(e).toMatchObject({ rule: 'personal_target_takeover', status: 'applied', seen: false, before: { calorieTarget: c.kcal, source: 'personal_target' }, after: { source: 'recalibrated' } });
      expect(e.personalTarget).toMatchObject({ kcal: c.kcal, case: c.expected });
      expect(e.message).toBe(PERSONAL_TARGET_MESSAGE.takeoverDetails(plan.maintenanceKcal, planOf(s).maintenanceKcal));
      const short = planEventShort(e);
      if (!short) throw new Error('no short text');
      expect(short.title.split(' ').length).toBeLessThanOrEqual(6);
      expect(short.line.length).toBeLessThanOrEqual(90);
      const [before, after, v] = [formatKcal(c.kcal), formatKcal(plan.calorieTarget), formatRatePercent(plan.weeklyRateTarget)];
      const expectedShort = {
        within: { title: 'Ta cible, recalibrée', line: `À ${after} kcal, tu perds ${v} par semaine. On garde ce rythme.` },
        too_fast: { title: 'Vitesse ajustée', line: `${before} → ${after} kcal : ${v} par semaine, le maximum pour toi.` },
        too_slow: { title: 'Cible ajustée', line: `${before} → ${after} kcal, pour perdre ${v} par semaine.` },
        opposite: { title: 'Cible ajustée', line: `${before} → ${after} kcal, pour perdre ${v} par semaine.` },
        maintenance: { title: 'Cible ajustée', line: `${before} → ${after} kcal par jour, pour garder ton poids stable.` },
      }[c.expected];
      expect(short).toEqual(expectedShort);
      expect(planNotices([e], null)).toMatchObject([{ kind: 'personal_target', title: short.title, line: short.line, text: e.message }]);
      // Rounding gap of the target (reported): the plan at the rate on the slider grid against the personal target.
      console.log(`[report 47] takeover ${c.expected}: ${c.kcal} -> ${Math.round(plan.calorieTarget)} kcal, rate read ${(readPersonalTarget(table, c.kcal).rate * 100).toFixed(3)} %, applied ${(plan.weeklyRateTarget * 100).toFixed(2)} %`);
      if (c.expected === 'within') expect(Math.abs(plan.calorieTarget - c.kcal)).toBeLessThan(40);
    });
  }

  it('without opening Suivi: computed with the calibration (worker, here its synchronous fallback), applied on the next weigh-in', () => {
    const s = personal(LOSS, 1700, -0.05, 30);
    // The first day the takeover is due, from the weigh-ins only.
    let first = -1;
    for (let i = 5; i <= 30 && first < 0; i++) {
      const upTo: WheightyStore = { ...s, weights: s.weights.filter((w) => w.date <= day(i)), dailyLogs: s.dailyLogs.filter((l) => l.date <= day(i)) };
      if (calibrationAnswer({ id: 1, store: upTo, today: day(i), nowIso: at(day(i)) }).takeover) first = i;
    }
    expect(first).toBeGreaterThan(5);
    const before: WheightyStore = { ...s, weights: s.weights.filter((w) => w.date < day(first)), dailyLogs: s.dailyLogs.filter((l) => l.date < day(first)) };
    expect(calibrationAnswer({ id: 1, store: before, today: day(first), nowIso: at(day(first)) }).takeover).toBeNull();
    // The weigh-in of that day changes the store: the calibration runs again (StoreProvider), the takeover comes with it.
    const weighed = setAdherence(addWeight(before, { date: day(first), weightKg: 75 - 0.05 * first }, at(day(first))), day(first), 'on_plan');
    const runner = createCalibrationRunner();
    let response: CalibrationResponse | null = null;
    runner.run({ id: 7, store: weighed, today: day(first), nowIso: at(day(first)) }, (r) => (response = r));
    const answer = response as CalibrationResponse | null;
    if (!answer?.ok || !answer.takeover) throw new Error('no takeover');
    // What StoreProvider does: applied to the store it was computed for (same fingerprint).
    const key = calibrationFingerprint(weighed, day(first));
    const applied = calibrationFingerprint(weighed, day(first)) === key ? applyPersonalTakeover(weighed, answer.takeover, day(first), at(day(first))) : weighed;
    expect(planOf(applied).source).toBe('recalibrated');
    expect(lastEvent(applied).rule).toBe('personal_target_takeover');
  });

  it('at the opening of the app (day change), after days away', () => {
    const s = personal(LOSS, 1700, -0.05, 21);
    const later = calibrationAnswer({ id: 1, store: s, today: day(24), nowIso: at(day(24)) });
    if (!later.takeover) throw new Error('no takeover');
    const t = applyPersonalTakeover(s, later.takeover, day(24), at(day(24)));
    expect(planOf(t).source).toBe('recalibrated');
    expect(t.dailyLogs.find((l) => l.date === day(24))?.calorieTargetForDay).toBe(planOf(t).calorieTarget);
  });

  it('a takeover computed for another plan is not applied (the store changed meanwhile)', () => {
    const s = personal(LOSS, 1700, -0.05);
    const t = computePersonalTakeover(s, stateOn(s, 21), day(21), at(day(21)));
    if (!t) throw new Error('no takeover');
    const changed = ok(choosePersonalTarget(s, day(21), 1750, at(day(21)))).store;
    expect(applyPersonalTakeover(changed, t, day(21), at(day(21)))).toBe(changed);
  });

  it('failed build: the personal target stays, a failed entry, the next recalibration tries again', () => {
    const s0 = personal(LOSS, 1700, -0.05);
    // A target weight above the current weight: the loss plan cannot be built.
    const s: WheightyStore = { ...s0, profile: { ...(s0.profile as UserProfile), targetWeightKg: 76 } };
    const state = stateOn(s, 21);
    const t = takeOverPersonalTarget(s, state, day(21), at(day(21)));
    expect(planOf(t)).toBe(s.plan);
    expect(t.calibrationSnapshots).toEqual(s.calibrationSnapshots);
    expect(lastEvent(t)).toMatchObject({ rule: 'personal_target_takeover', status: 'failed', reason: 'target_not_below_current', after: null, message: null, seen: true });
    // Seen: not again on the same estimate; again when a next recalibration surfaces.
    expect(computePersonalTakeover(t, stateOn(t, 21), day(21), at(day(21)))).toBeNull();
    let next = t;
    for (let i = 22; i <= 50; i++) next = setAdherence(addWeight(next, { date: day(i), weightKg: 75 - 0.05 * 21 - 0.12 * (i - 21) }, at(day(i))), day(i), 'on_plan');
    const again = stateOn(next, 50);
    expect(again.surfaced).toBe(true);
    expect(computePersonalTakeover(next, again, day(50), at(day(50)))?.status).toBe('failed');
  });
});

describe('1d. no more "Garder ma cible"', () => {
  it('no recalibration is offered while a personal target is in force: the text is gone, Suivi does not announce it', () => {
    expect('keep' in PERSONAL_TARGET_MESSAGE).toBe(false);
    const s = personal(LOSS, 1700, -0.05);
    const state = stateOn(s, 21);
    expect(state.surfaced).toBe(true);
    expect(analysisView(s, state)?.surfaced).toBe(false);
    // Another user with the same weigh-ins sees it.
    const plain: WheightyStore = { ...s, plan: { ...planOf(s), source: 'initial' } };
    expect(analysisView(plain, state)?.surfaced).toBe(true);
  });
});

describe('1e. changes while it is in force', () => {
  it('a change of rate or of goal ends it with a computed target', () => {
    const s = ok(choosePersonalTarget(onboard(), D0, 1700, at(D0))).store;
    expect(planOf(ok(changeGoal(s, D0, { goal: 'loss', targetWeightKg: 64, weeklyRate: 0.003 })).store).source).toBe('initial');
    expect(planOf(ok(changeGoal(s, D0, { goal: 'maintenance', targetWeightKg: 75, weeklyRate: 0 })).store).source).toBe('initial');
    const edited = ok(updateProfileOnPath(s, D0, { ...(s.profile as UserProfile), weeklyRateTarget: 0.003 })).store;
    expect(planOf(edited).source).toBe('initial');
  });

  it('a profile edit without a change of rate or goal keeps it; the floor is checked again', () => {
    const s = ok(choosePersonalTarget(onboard(), D0, 1700, at(D0))).store;
    const edited = ok(updateProfileOnPath(s, D0, { ...(s.profile as UserProfile), ageYears: 40, targetWeightKg: 62 })).store;
    expect(planOf(edited)).toMatchObject({ source: 'personal_target', calorieTarget: 1700, targetWeightKg: 62, personalTarget: planOf(s).personalTarget });
    // A target at the floor of a tall man: taller, a higher floor; the target is raised to it.
    const tall = makeProfile({ sexForEquation: 'male', ageYears: 25, heightCm: 185, currentWeightKg: 110, goal: 'loss', targetWeightKg: 90, weeklyRateTarget: 0.005 });
    const base = onboard(tall);
    const floor = Math.ceil(planHardFloorKcal(rebuildContextFromStore(base, D0) as PlanContext) / 10) * 10;
    const m = ok(choosePersonalTarget(base, D0, floor, at(D0))).store;
    const taller = { ...(m.profile as UserProfile), heightCm: 200 };
    const newFloor = planHardFloorKcal(rebuildContextFromStore({ ...m, profile: taller }, D0) as PlanContext);
    expect(newFloor).toBeGreaterThan(floor);
    const raised = ok(updateProfileOnPath(m, D0, taller)).store;
    expect(planOf(raised)).toMatchObject({ source: 'personal_target', calorieTarget: Math.ceil(newFloor / 10) * 10 });
  });
});

describe('2. preview of a profile edit on the target assumed to be followed', () => {
  it('with a calibration applied, the preview is the plan that will be applied (before: the population estimate)', () => {
    let s = onboard();
    for (let i = 1; i <= 21; i++) s = setAdherence(addWeight(s, { date: day(i), weightKg: 75 - 0.03 * i }, at(day(i))), day(i), 'on_plan');
    s = ok(applyRecalibration(s, stateOn(s, 21), day(21), at(day(21)))).store;
    const edited = { ...(s.profile as UserProfile), ageYears: 36 };
    // The Result screen of "Modifier mes informations" shows `updateProfileOnPath`, the function its button applies.
    const preview = ok(updateProfileOnPath(s, day(21), edited)).store.plan as CurrentPlan;
    const population = previewInitialPlan(edited, day(21));
    if (!population.ok) throw new Error(population.reason);
    expect(preview.personalOffsetKcal).toBe(latestAppliedSnapshot(s)?.posteriorMedianOffsetKcal);
    expect(Math.abs(preview.maintenanceKcal - population.plan.maintenanceKcal)).toBeGreaterThan(100);
  });
});
