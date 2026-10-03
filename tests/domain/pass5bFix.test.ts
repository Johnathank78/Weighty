/**
 * Pass 5b fixes (report 46): speed locked on the aligned target itself, preview and applied plan of the measured habit,
 * steps / calories slider in the measured habit, manual check profiles of the day, adherence deduced from the journal,
 * short messages, personal target, small points of report 45, schema 9.
 */
import { describe, expect, it } from 'vitest';
import { addWeight, applyRecalibration, completeOnboarding, computeCalibrationState, setAdherence } from '@/domain/engine';
import { addFoodEntry } from '@/domain/journal';
import {
  acceptMeasuredOffer,
  alignButton,
  alignedLockLine,
  applyPathSliderSteps,
  balanceSliderAvailable,
  measuredPeriodicReplan,
  pathSliderSession,
  alignedTargetLocked,
  changeGoalOnPath,
  jstarPlanOf,
  measuredInput,
  measuredOfferView,
  habitOf,
  pathSpeedSliderModel,
  runJournalWeek,
  switchToAlignedTarget,
  updateProfileOnPath,
} from '@/domain/journalPath';
import { planEventShort, planNotices, runDailyChecks } from '@/domain/planSafety';
import { JOURNAL_MESSAGE, PLAN_MESSAGE, SHORT_MESSAGE, shortRefusalReason } from '@/domain/planMessages';
import type { ShortText } from '@/domain/planMessages';
import type { PlanEvent, PlanSummary } from '@/domain/types';
import type { WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { PRODUCTION_SOLVER } from '@/domain/engine';
import { addDays } from '@/science/dates';
import { hardFloorKcal } from '@/science/goals';
import type { UserProfile } from '@/science/types';
import { localIsoDate } from '@/science/dates';
import { THIN_SPACE } from '@/domain/format';
import { makeProfile } from '../helpers/profiles';
import { at as atProfile, buttonProfile, eat } from '../helpers/verificationProfiles';

const D0 = '2026-06-01';
const day = (i: number) => addDays(D0, i);
const at = (date: string) => `${date}T08:00:00.000Z`;

const LOSS: UserProfile = makeProfile({ sexForEquation: 'female', ageYears: 35, heightCm: 165, currentWeightKg: 75, goal: 'loss', targetWeightKg: 64, weeklyRateTarget: 0.005 });

function onboard(profile: UserProfile = LOSS): WheightyStore {
  const r = completeOnboarding(emptyStore(), profile, D0, at(D0));
  if (!r.ok) throw new Error(r.reason);
  return r.store;
}

function logFood(s: WheightyStore, date: string, kcal: number): WheightyStore {
  const r = addFoodEntry(s, { kind: 'manual', food: { name: 'Repas', intake: { energyKcal: kcal, proteinG: null, carbsG: null, fatG: null }, grams: null }, date, localTime: '12:00', consumedTime: '12:00' }, at(date));
  if (!r.ok) throw new Error(r.reason);
  return r.store;
}

type Day = { kcal?: number | null; kg?: number | null; adherence?: 'on_plan' | 'minor_deviation' | 'major_deviation' };

/** Days [from, to]: journal, weigh-in (not on day 0, weighed at onboarding), declared adherence. */
function live(store: WheightyStore, from: number, to: number, f: (i: number) => Day): WheightyStore {
  let s = store;
  for (let i = from; i <= to; i++) {
    const d = f(i);
    if (d.kg !== null && d.kg !== undefined && i > 0) s = addWeight(s, { date: day(i), weightKg: d.kg }, at(day(i)));
    if (d.kcal !== null && d.kcal !== undefined) s = logFood(s, day(i), d.kcal);
    if (d.adherence) s = setAdherence(s, day(i), d.adherence);
  }
  return s;
}

const nonFollower = (kcal = 1800) => (i: number): Day => ({ kcal, kg: 75 - 0.03 * i, adherence: 'major_deviation' });

/** Switched to the aligned target on day 14, then logging `kcal` and weighing in every day up to day `to`. */
function aligned(to: number, after: (i: number) => Day = (i) => ({ kcal: 1800, kg: 75 - 0.03 * i })): WheightyStore {
  const s = live(onboard(), 0, 13, nonFollower());
  const w = live(s, 14, 14, (i) => ({ kg: 75 - 0.03 * i }));
  const r = switchToAlignedTarget(w, day(14), at(day(14)));
  if (!r.ok) throw new Error(r.reason);
  const s2 = live(r.store, 14, 14, (i) => ({ kcal: after(i).kcal ?? null }));
  return live(s2, 15, to, after);
}

/** Aligned on day 14, first plan of the measured habit confirmed on day 28 (logging 10 percent over the target). */
function measured(): WheightyStore {
  const s = aligned(28, (i) => ({ kcal: 1980, kg: 75 - 0.03 * i }));
  const r = acceptMeasuredOffer(runJournalWeek(s, day(28), at(day(28))), day(28), at(day(28)));
  if (!r.ok) throw new Error('no offer');
  return r.store;
}

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

describe('point 1a: speed locked on the aligned target itself', () => {
  it('the speed of the goal in force does not change: the aligned target stays in force (before: about the old target came back)', () => {
    const s = aligned(16);
    const before = onboard().plan?.calorieTarget as number;
    expect(alignedTargetLocked(s)).toBe(true);
    expect(s.plan?.calorieTarget).toBe(1800);
    for (const rate of [0.003, 0.0075]) {
      const r = ok(changeGoalOnPath(s, day(16), { goal: 'loss', targetWeightKg: 66, weeklyRate: rate }));
      expect(r.store.plan?.calorieTarget).toBe(1800);
      expect(r.store.plan?.calorieTarget).not.toBeCloseTo(before, -1);
      expect(r.store.profile?.weeklyRateTarget).toBe(0.005);
      // The target weight is changed; the aligned target stays the plan in force.
      expect(r.store.profile?.targetWeightKg).toBe(66);
      expect(r.store.plan?.targetWeightKg).toBe(66);
      expect(r.store.meta.journalPath).toMatchObject({ method: 'aligned', chosenTargetActive: true });
      expect(r.store.dailyLogs.find((l) => l.date === day(16))?.calorieTargetForDay).toBe(1800);
    }
  });

  it('a profile edit with the same goal keeps the aligned target and its speed', () => {
    const s = aligned(16);
    const r = ok(updateProfileOnPath(s, day(16), { ...(s.profile as UserProfile), averageSteps7d: 9000, weeklyRateTarget: 0.008 }));
    expect(r.store.plan?.calorieTarget).toBe(1800);
    expect(r.store.profile).toMatchObject({ averageSteps7d: 9000, weeklyRateTarget: 0.005 });
    expect(r.store.meta.journalPath.chosenTargetActive).toBe(true);
  });

  it('a goal change stays possible and ends the aligned target', () => {
    const s = aligned(16);
    const r = ok(changeGoalOnPath(s, day(16), { goal: 'maintenance', targetWeightKg: 74.5, weeklyRate: 0 }));
    expect(r.store.plan?.goal).toBe('maintenance');
    expect(r.store.meta.journalPath).toMatchObject({ method: 'aligned', chosenTargetActive: false });
    expect(alignedLockLine(r.store, day(16))).toBeNull();
  });

  it('the line, with the days before the first recalibration; gone once a recalibration replaced the aligned target', () => {
    const s = aligned(16);
    // 7 days after the switch (day 21): 5 days left on day 16; the gate already has its span and enough weigh-ins.
    expect(alignedLockLine(s, day(16))).toBe('Ta cible suit ce que tu manges. Vitesse modifiable après la première recalibration, dans 5 jours.');
    expect(alignedLockLine(s, day(20))).toBe('Ta cible suit ce que tu manges. Vitesse modifiable après la première recalibration, dans 1 jour.');
    const later = live(s, 17, 24, (i) => ({ kcal: 1800, kg: 75 - 0.03 * i }));
    expect(alignedLockLine(later, day(24))).toBe('Ta cible suit ce que tu manges. Vitesse modifiable après la première recalibration.');
    const state = computeCalibrationState(later, day(24), at(day(24)));
    if (!state) throw new Error('no state');
    const r = ok(applyRecalibration(later, state, day(24), at(day(24))));
    expect(alignedTargetLocked(r.store)).toBe(false);
    expect(alignedLockLine(r.store, day(24))).toBeNull();
  });
});

describe('point 1b: speed change in the measured habit', () => {
  it('the slider limits are those of the plan of the habit, and the plan applied is the plan of the habit for the new speed', () => {
    const s = measured();
    const h = s.meta.journalPath.habit?.h as number;
    const model = pathSpeedSliderModel(s, day(29), 'loss');
    if (!model) throw new Error('no model');
    // Floor of the plans of the habit, shown in displayed kcal: hard floor x 1.10 (I* >= 1.10 x h x floor).
    const floor = hardFloorKcal(s.plan?.reeKcal as number, 'female') * 1.1;
    expect(model.floorKcal).toBeCloseTo(floor, 6);
    for (const rate of [0.003, 0.0075]) {
      const r = ok(changeGoalOnPath(s, day(29), { goal: 'loss', targetWeightKg: 64, weeklyRate: rate }));
      const plan = r.store.plan;
      expect(r.store.meta.journalPath.method).toBe('measured');
      expect(plan?.requestedWeeklyRate).toBe(rate);
      // The same plan as the habit builds on its own: I* from the journal maintenance, T = I* / h.
      const prepared = measuredInput(r.store, day(29));
      if (!prepared) throw new Error('no input');
      const habit = habitOf(r.store, prepared, day(14), day(29));
      const own = jstarPlanOf(r.store, day(29), r.store.meta.journalPath.estimate as never, habit?.h as number, { request: PRODUCTION_SOLVER, input: prepared.input });
      if (!own.ok) throw new Error(own.reason);
      expect(plan?.calorieTarget).toBe(own.plan.calorieTarget);
      expect((plan?.calorieTarget as number) * (habit?.h as number)).toBeGreaterThanOrEqual(1.1 * (habit?.h as number) * hardFloorKcal(plan?.reeKcal as number, 'female') - 1e-6);
      // The next day keeps it.
      const next = runDailyChecks(r.store, day(30), at(day(30)));
      expect(next.plan?.calorieTarget).toBe(plan?.calorieTarget);
      expect(h).toBeGreaterThan(1);
    }
  });

  it('the profile edit preview is the plan that is applied', () => {
    const s = measured();
    const profile = { ...(s.profile as UserProfile), weeklyRateTarget: 0.003 };
    const preview = ok(updateProfileOnPath(s, day(29), profile));
    const applied = ok(updateProfileOnPath(s, day(29), profile));
    expect(applied.store.plan).toEqual(preview.store.plan);
    expect(applied.store.plan?.requestedWeeklyRate).toBe(0.003);
  });
});

describe('point 2: steps / calories slider in the measured habit', () => {
  it('reactivated on the context of the plan of the habit: I* traded with the steps, displayed target = I* / h, floor I* >= 1.10 x h x floor', () => {
    const s = measured();
    const plan = s.plan as NonNullable<WheightyStore['plan']>;
    const h = s.meta.journalPath.habit?.h as number;
    expect(balanceSliderAvailable(s)).toBe(true);
    const session = pathSliderSession(s, day(29));
    if (!session) throw new Error('no session');
    expect(session.habit).toBe(h);
    // At the baseline steps: the plan of the habit (I* rounded to 10 kcal by the slider).
    expect(Math.abs(session.pointAt(plan.stepTarget).calorieTargetKcal - plan.calorieTarget * h)).toBeLessThanOrEqual(5);
    const floorI = 1.1 * h * hardFloorKcal(plan.reeKcal, 'female');
    for (const steps of [plan.stepTarget - 3000, plan.stepTarget + 3000]) {
      const p = session.pointAt(steps);
      if (p.belowHardFloor) {
        expect(p.calorieTargetKcal).toBeLessThan(floorI);
        expect(applyPathSliderSteps(s, day(29), steps).ok).toBe(true); // clamped to the lowest step count above the floor
        continue;
      }
      const r = ok(applyPathSliderSteps(s, day(29), steps));
      expect(r.store.plan?.stepTarget).toBe(p.stepsPerDay);
      expect(r.store.plan?.calorieTarget).toBeCloseTo(p.calorieTargetKcal / h, 9);
      expect((r.store.plan?.calorieTarget as number) * h).toBeGreaterThanOrEqual(floorI - 1e-6);
      expect(r.store.plan?.source).toBe('user_adjusted_slider');
      expect(r.store.meta.journalPath.method).toBe('measured');
    }
    // More steps, more to eat; back to the baseline steps gives the plan's own target.
    const more = ok(applyPathSliderSteps(s, day(29), plan.stepTarget + 2000));
    expect(more.store.plan?.calorieTarget).toBeGreaterThan(plan.calorieTarget);
    const back = ok(applyPathSliderSteps(more.store, day(29), plan.stepTarget));
    expect(back.store.plan?.calorieTarget).toBe(plan.calorieTarget);
    // The lowest step count stops at the floor of the habit.
    const low = session.pointAt(session.effectiveMinSteps);
    expect(low.calorieTargetKcal).toBeGreaterThanOrEqual(floorI - 10);
  });

  it('the steps chosen are kept by the next plans of the habit (periodic replan)', () => {
    const s = measured();
    const plan = s.plan as NonNullable<WheightyStore['plan']>;
    const moved = ok(applyPathSliderSteps(s, day(29), plan.stepTarget + 2000)).store;
    const later = live(moved, 29, 56, (i) => ({ kcal: 1980, kg: 75 - 0.03 * i }));
    const r = measuredPeriodicReplan(later, day(56), at(day(56)));
    if (r.status !== 'replanned') throw new Error(r.status);
    expect(r.store.plan?.stepTarget).toBe(plan.stepTarget + 2000);
    // The slider of the new plan starts from it.
    const session = pathSliderSession(r.store, day(56));
    expect(session?.pointAt(plan.stepTarget + 2000).calorieTargetKcal).toBeCloseTo((r.store.plan?.calorieTarget as number) * (r.store.meta.journalPath.habit?.h as number), -1);
  });

  it('on the aligned target itself: no slider, the line of point 1a instead', () => {
    const s = aligned(16);
    expect(balanceSliderAvailable(s)).toBe(false);
    expect(applyPathSliderSteps(s, day(16), 9000)).toEqual({ ok: false, reason: 'journal_path' });
    expect(alignedLockLine(s, day(16))).toMatch(/^Ta cible suit ce que tu manges/);
  });
});

describe('point 3: button of the Plan tab on the profile of the day', () => {
  it('a profile built for today: the button turns on once yesterday is logged', () => {
    for (const today of [localIsoDate(new Date()), '2026-09-29', '2026-10-03']) {
      const s = buttonProfile(today);
      expect(alignButton(s, today)).toMatchObject({ enabled: false, hint: 'Disponible quand 10 des 14 derniers jours sont saisis (encore 1).' });
      expect(alignButton(eat(s, addDays(today, -1), 1850), today)?.enabled).toBe(true);
    }
  });

  it('the cause seen by John: the same file opened on a later day, the 14-day window slid and one entry is no longer enough', () => {
    const s = buttonProfile('2026-09-29');
    const later = runDailyChecks(s, '2026-10-01', atProfile('2026-10-01'));
    expect(alignButton(later, '2026-10-01')?.hint).toBe('Disponible quand 10 des 14 derniers jours sont saisis (encore 2).');
    expect(alignButton(eat(later, '2026-09-30', 1850), '2026-10-01')?.enabled).toBe(false);
  });
});

describe('point 5: short messages', () => {
  const words = (t: string) => t.trim().split(/\s+/).length;
  const short = (x: ShortText) => {
    expect(words(x.title)).toBeLessThanOrEqual(6);
    expect(x.line.length).toBeLessThanOrEqual(90);
    expect(x.line).not.toContain('—');
    return x;
  };
  const summary = (calorieTarget: number, goal: 'loss' | 'maintenance' = 'loss', weeklyRateTarget = 0.005): PlanSummary => ({ createdAt: at(D0), source: 'initial', goal, calorieTarget, stepTarget: 8000, weeklyRateTarget, requestedWeeklyRate: 0.005, maintenanceKcal: 2300, targetWeightKg: 60 });
  const event = (rule: PlanEvent['rule'], message: string, before: PlanSummary | null = null, after: PlanSummary | null = null, reason?: string): PlanEvent => ({ id: rule, date: D0, rule, status: 'applied', ...(reason ? { reason } : {}), before, after, message, seen: false });

  it('the texts of the annex, at most 6 words of title and 90 characters of line, with the figures', () => {
    expect(short(SHORT_MESSAGE.guardrailBmi20)).toEqual({ title: 'Passage en maintien', line: 'Ton IMC atteint 20 : on stabilise ton poids.' });
    expect(short(SHORT_MESSAGE.guardrailRateCap(0.0075)).line).toBe(`Ramenée à 0,75${THIN_SPACE}% par semaine, le maximum pour ton IMC.`);
    expect(short(SHORT_MESSAGE.bmi20Warning(12))).toEqual({ title: 'IMC 20 dans 12 sem.', line: 'Ton plan passera alors en maintien.' });
    expect(short(SHORT_MESSAGE.periodicReplan(12340, 12310, 'maintenance')).line).toMatch(/12.340 → 12.310 kcal par jour, pour garder ton poids stable\.$/);
    expect(short(SHORT_MESSAGE.periodicReplan(1800, 1750, 'loss')).line).toMatch(/1.800 → 1.750 kcal par jour, pour tenir ta vitesse\.$/);
    expect(short(SHORT_MESSAGE.targetRaised(55.3))).toEqual({ title: 'Objectif ajusté', line: 'Poids cible minimal : 55,3 kg (IMC 20).' });
    for (const r of ['loss_unavailable_low_bmi', 'no_feasible_speed', 'target_not_above_current', 'target_not_below_current', 'target_bmi_too_low', 'invalid_profile', 'no_profile', 'gate_not_met', 'other']) short(SHORT_MESSAGE.recalibrationRefused(r, 12000));
    expect(SHORT_MESSAGE.recalibrationRefused('no_feasible_speed', 1200).line).toMatch(/^Vitesse sous ton minimum de 1.200 kcal\. Tu peux passer en maintien\.$/);
    expect(shortRefusalReason('gate_not_met', null)).toBe('pas encore assez de pesées');
    expect(short(SHORT_MESSAGE.underweight)).toEqual({ title: 'Poids bas', line: 'Si ce n’est pas voulu, parles-en à un professionnel de santé.' });
    expect(short(SHORT_MESSAGE.proposal(12150))).toMatchObject({ title: 'Viser ce que tu manges ?' });
    expect(SHORT_MESSAGE.floorRaisedLine(1320)).toMatch(/^On part de 1.320 kcal, ton minimum\.$/);
    short(SHORT_MESSAGE.floorRaised(1320));
    expect(short(SHORT_MESSAGE.logMore)).toEqual({ title: 'Note tes repas 2 semaines', line: 'Pour caler ta cible sur tes habitudes.' });
    expect(short(SHORT_MESSAGE.weighDaily)).toEqual({ title: 'Pèse-toi chaque jour', line: 'Dans 4 semaines, ton plan pourra suivre ton journal.' });
    expect(short(SHORT_MESSAGE.firstPlan(1.1, 1760)).line).toMatch(/^Tu manges 10 % de plus que ta cible\. Nouvelle cible : 1.760 kcal\.$/);
    expect(short(SHORT_MESSAGE.firstPlan(0.78, 11760)).line).toMatch(/^Tu manges 22 % de moins que ta cible\./);
    expect(short(SHORT_MESSAGE.firstPlan(1.01, 1760)).line).toMatch(/^Tu tiens ta cible de près\. Nouvelle cible/);
    expect(short(SHORT_MESSAGE.updatePlan(12100, 11950)).title).toBe('Plan à ajuster');
    expect(short(SHORT_MESSAGE.exitWeighIns)).toEqual({ title: 'Retour à ta cible alignée', line: 'Trop de pesées manquées ces dernières semaines.' });
    expect(short(SHORT_MESSAGE.exitLogging)).toEqual({ title: 'Retour à ta cible alignée', line: 'Trop de journées non saisies ces dernières semaines.' });
  });

  it('every message of the trace is shown short, its long text behind "Détails" (entries written before the fixes too)', () => {
    const unseen = [
      event('G1', PLAN_MESSAGE.guardrailBmi20, summary(1800), summary(2100, 'maintenance', 0)),
      event('G2', PLAN_MESSAGE.guardrailRateCap(0.0075), summary(1500, 'loss', 0.01), summary(1650, 'loss', 0.0075)),
      event('periodic_replan', 'Ton plan a été recalculé à partir de ton poids actuel : 1 800 → 1 750 kcal par jour.', summary(1800), summary(1750)),
      event('target_bmi_20', PLAN_MESSAGE.targetRaised(55.3)),
      event('underweight_bmi', PLAN_MESSAGE.underweight),
      event('journal_switch', JOURNAL_MESSAGE.floorRaised(1000, 1320), summary(1800), summary(1320)),
      event('journal_log_more', JOURNAL_MESSAGE.logMore),
      event('journal_weigh_daily', JOURNAL_MESSAGE.weighDaily),
      event('journal_measured_exit', JOURNAL_MESSAGE.exitWeighIns, null, null, 'weighins'),
      event('journal_measured_exit', JOURNAL_MESSAGE.exitLogging, null, null, 'logging'),
    ];
    for (const e of unseen) expect(planEventShort(e)).not.toBeNull();
    const notices = planNotices(unseen, { weeks: 3, message: PLAN_MESSAGE.bmi20Warning(3) });
    expect(notices).toHaveLength(unseen.length + 1);
    for (const n of notices) {
      short({ title: n.title, line: n.line });
      expect(n.text.length).toBeGreaterThan(n.line.length);
    }
    expect(planEventShort(unseen[1] as PlanEvent)?.line).toBe(`Ramenée à 0,75${THIN_SPACE}% par semaine, le maximum pour ton IMC.`);
    expect(planEventShort(unseen[3] as PlanEvent)?.line).toBe('Poids cible minimal : 55,3 kg (IMC 20).');
    expect(planEventShort(unseen[9] as PlanEvent)?.line).toBe('Trop de journées non saisies ces dernières semaines.');
    expect(notices.find((n) => n.eventId === 'G1')?.text).toBe(PLAN_MESSAGE.guardrailBmi20);
  });

  it('the cards of the journal path: offers in the short format, the long text of pass 5b behind "Détails"', () => {
    const offered = runJournalWeek(aligned(28, (i) => ({ kcal: 1980, kg: 75 - 0.03 * i })), day(28), at(day(28)));
    const view = measuredOfferView(offered);
    if (!view) throw new Error('no offer');
    expect(short(view.short).title).toBe('Plan calé sur ton journal');
    expect(view.short.line).toMatch(/^Tu manges 10 % de plus que ta cible\. Nouvelle cible : /);
    expect(view.text).toMatch(/^Tu te pèses chaque jour et tu notes ce que tu manges/);
  });
});
