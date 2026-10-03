/**
 * Pass 5b fixes (report 46): speed locked on the aligned target itself, preview and applied plan of the measured habit,
 * steps / calories slider in the measured habit, manual check profiles of the day, adherence deduced from the journal,
 * short messages, personal target, small points of report 45, schema 9.
 */
import { describe, expect, it } from 'vitest';
import { addWeight, applyRecalibration, buildPlanFromStore, guardrailWeightKg, completeOnboarding, computeCalibrationState, ensureDailyLogs, markRecalibrationSeen, periodicReplan, rebuildContextFromStore, setAdherence } from '@/domain/engine';
import { checkPersonalTarget, choosePersonalTarget, completeOnboardingWithTarget, onboardingPersonalTargetTable, personalTargetAvailable, personalTargetLine, storePersonalTargetTable } from '@/domain/personalTarget';
import { addFoodEntry } from '@/domain/journal';
import {
  acceptMeasuredOffer,
  alignedStatusLine,
  alignButton,
  checkWeighDaily,
  deduceAdherenceFromJournal,
  measuredWhyText,
  suggestedAdherence,
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
import { JOURNAL_MESSAGE, PERSONAL_TARGET_MESSAGE, PLAN_MESSAGE, SHORT_MESSAGE, shortRefusalReason } from '@/domain/planMessages';
import type { ShortText } from '@/domain/planMessages';
import type { PlanEvent, PlanSummary } from '@/domain/types';
import type { WheightyStore } from '@/domain/types';
import { migrateToCurrent } from '@/persistence/migrations';
import { emptyStore, validateStore } from '@/persistence/schema';
import { PRODUCTION_SOLVER } from '@/domain/engine';
import { addDays } from '@/science/dates';
import { calorieTargetForRate, hardFloorKcal } from '@/science/goals';
import { bmi } from '@/science/macros';
import type { PlanContext } from '@/science/goals';
import type { UserProfile } from '@/science/types';
import { localIsoDate } from '@/science/dates';
import { formatKcal, formatRatePercent, THIN_SPACE } from '@/domain/format';
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

describe('point 7: small points of report 45 (section 5)', () => {
  it('point 2: on the aligned target itself, the deadline waits for the first recalibration', () => {
    const s = aligned(16);
    expect(alignedLockLine(s, day(16))).not.toBeNull();
    expect(JOURNAL_MESSAGE.deadlineLabel).toBe('Échéance');
    expect(JOURNAL_MESSAGE.deadlineAfterRecalibration).toBe('Après la première recalibration');
  });

  it('point 3: no weigh-in encouragement within 7 days of a return to the aligned target', () => {
    const s = live(measured(), 29, 35, (i) => ({ kcal: 1980, kg: i >= 31 && i <= 33 ? null : 75 - 0.03 * i }));
    const out = runJournalWeek(s, day(35), at(day(35)));
    expect(out.meta.journalPath.lastExit?.date).toBe(day(35));
    const weigh = (x: WheightyStore) => x.meta.planEvents.filter((e) => e.rule === 'journal_weigh_daily');
    const missed = live(out, 36, 42, (i) => ({ kcal: 1980, kg: i === 37 ? null : 75 - 0.03 * i }));
    expect(weigh(checkWeighDaily(missed, day(36), at(day(36))))).toHaveLength(weigh(out).length);
    expect(weigh(checkWeighDaily(missed, day(41), at(day(41))))).toHaveLength(weigh(out).length);
    expect(weigh(checkWeighDaily(missed, day(42), at(day(42))))).toHaveLength(weigh(out).length + 1);
  });

  it('point 5: "Pourquoi ce résultat ?" in the measured habit, a short explanation', () => {
    const s = measured();
    expect(measuredWhyText(s)).toBe(`Équilibre d’après ton journal : ${formatKcal(s.plan?.maintenanceKcal as number)} kcal par jour. Habitude : +10 %. Ta cible = apport à viser ÷ habitude.`);
    expect(JOURNAL_MESSAGE.whyMeasured(2470, 0.88)).toMatch(/Habitude : −12 %\. Ta cible = apport à viser ÷ habitude\.$/);
    expect(measuredWhyText(aligned(16))).toBeNull();
  });

  it('point 7: on the aligned target, "Prochaine recalibration dans {n} jours" rather than the deviation days', () => {
    const s = aligned(16);
    expect(alignedStatusLine(s, day(16))).toBe('Prochaine recalibration dans 5 jours.');
    expect(alignedStatusLine(s, day(20))).toBe('Prochaine recalibration dans 1 jour.');
    expect(alignedStatusLine(live(s, 17, 24, (i) => ({ kcal: 1800, kg: 75 - 0.03 * i })), day(24))).toBeNull();
    expect(alignedStatusLine(onboard(), D0)).toBeNull();
  });
});

describe('point 8: versions, schema 9', () => {
  it('a schema-8 store loads without loss: every existing declaration from the user, the journal path kept', () => {
    const current = measured();
    // The same store as written by schema 8: no source on the declarations.
    const raw = JSON.parse(JSON.stringify({ ...current, schemaVersion: 8, scientificModelVersion: '1.5.0', dailyLogs: current.dailyLogs.map(({ adherenceSource: _s, ...l }) => l) })) as Record<string, unknown>;
    const migrated = migrateToCurrent(raw);
    if (!migrated.ok) throw new Error(migrated.error);
    expect(migrated.fromVersion).toBe(8);
    const v = validateStore(migrated.value);
    if ('error' in v) throw new Error(v.error);
    expect(v.dropped).toEqual([]);
    expect(v.store.schemaVersion).toBe(9);
    expect(v.store.dailyLogs).toEqual(current.dailyLogs.map((l) => (l.adherence !== undefined ? { ...l, adherenceSource: 'user' } : l)));
    expect(v.store.dailyLogs.filter((l) => l.adherence !== undefined).every((l) => l.adherenceSource === 'user')).toBe(true);
    for (const key of ['profile', 'plan', 'weights', 'calibrationSnapshots', 'foodJournal', 'preferences', 'meta', 'historicalEvidence'] as const) expect(v.store[key]).toEqual(JSON.parse(JSON.stringify(current[key])));
    expect(v.store.scientificModelVersion).toBe('1.5.0');
  });

  it('a source without a declaration, or an unknown source, is reported; the personal target of a plan is read', () => {
    const s = onboard();
    const bad = { ...s, dailyLogs: [{ ...(s.dailyLogs[0] as object), adherenceSource: 'journal' }, { ...(s.dailyLogs[0] as object), date: day(1), adherence: 'on_plan', adherenceSource: 'robot' }] };
    const v = validateStore(JSON.parse(JSON.stringify(bad)));
    if ('error' in v) throw new Error(v.error);
    expect(v.dropped.map((d) => d.path)).toEqual(['dailyLogs.0', 'dailyLogs.1']);
    const plan = { ...(s.plan as object), source: 'personal_target', personalTarget: { kcal: 1700, predictedRate: 0.004 } };
    const w = validateStore(JSON.parse(JSON.stringify({ ...s, plan })));
    if ('error' in w) throw new Error(w.error);
    expect(w.clean).toBe(true);
    expect(w.store.plan?.personalTarget).toEqual({ kcal: 1700, predictedRate: 0.004 });
  });
});

describe('point 4: adherence deduced from the journal', () => {
  /** Maintenance profile, a target of 2 000 kcal every day up to day 12, logged totals `kcal(i)` (null: not logged). */
  const logged = (kcal: (i: number) => number | null, to = 11): WheightyStore => {
    const s = ensureDailyLogs(onboard(makeProfile({ goal: 'maintenance' })), day(to + 1));
    let out: WheightyStore = { ...s, dailyLogs: s.dailyLogs.map((l) => ({ ...l, calorieTargetForDay: 2000 })) };
    for (let i = 0; i <= to; i++) {
      const k = kcal(i);
      if (k !== null) out = logFood(out, day(i), k);
    }
    return out;
  };
  const adherenceOf = (s: WheightyStore, i: number) => s.dailyLogs.find((l) => l.date === day(i));

  it('a past day logged in full, not declared: recorded at the day change, at 10 % and 25 %, both ways, with its source', () => {
    const totals = [1810, 2190, 1800, 2200, 1500, 2500, 1490, 2510];
    const s = logged((i) => totals[i] ?? null, totals.length - 1);
    const after = runDailyChecks(s, day(totals.length), at(day(totals.length)));
    expect(totals.map((_, i) => adherenceOf(after, i)?.adherence)).toEqual(['on_plan', 'on_plan', 'minor_deviation', 'minor_deviation', 'minor_deviation', 'minor_deviation', 'major_deviation', 'major_deviation']);
    expect(totals.every((_, i) => adherenceOf(after, i)?.adherenceSource === 'journal')).toBe(true);
    // Nothing else changes, and a second run changes nothing.
    expect(deduceAdherenceFromJournal(after, day(totals.length))).toBe(after);
  });

  it('never over an existing declaration (manual, imported or already deduced); a manual choice always wins', () => {
    let s = logged(() => 2600, 3);
    s = setAdherence(s, day(1), 'on_plan');
    // An imported declaration: through the migration of schema 8, a declaration from the user.
    const raw = JSON.parse(JSON.stringify({ ...s, schemaVersion: 8, dailyLogs: s.dailyLogs.map((l) => (l.date === day(2) ? { date: l.date, calorieTargetForDay: l.calorieTargetForDay, stepTargetForDay: l.stepTargetForDay, adherence: 'on_plan' } : l)) }));
    const migrated = migrateToCurrent(raw);
    if (!migrated.ok) throw new Error(migrated.error);
    const v = validateStore(migrated.value);
    if ('error' in v) throw new Error(v.error);
    const after = deduceAdherenceFromJournal(v.store, day(4));
    expect(adherenceOf(after, 0)).toMatchObject({ adherence: 'major_deviation', adherenceSource: 'journal' });
    expect(adherenceOf(after, 1)).toMatchObject({ adherence: 'on_plan', adherenceSource: 'user' });
    expect(adherenceOf(after, 2)).toMatchObject({ adherence: 'on_plan', adherenceSource: 'user' });
    // The user changes a deduced day: their choice is kept by every later day change.
    const changed = setAdherence(after, day(0), 'minor_deviation');
    expect(adherenceOf(changed, 0)).toMatchObject({ adherence: 'minor_deviation', adherenceSource: 'user' });
    expect(adherenceOf(runDailyChecks(changed, day(5), at(day(5))), 0)).toMatchObject({ adherence: 'minor_deviation', adherenceSource: 'user' });
  });

  it('days not logged or incomplete, today and the measured habit: nothing recorded (manual declaration)', () => {
    // Day 5 is under half of the usual total (incomplete), day 6 is not logged; day 8 is today.
    const s = logged((i) => (i === 5 ? 900 : i === 6 ? null : 2000), 8);
    const after = deduceAdherenceFromJournal(s, day(8));
    expect(adherenceOf(after, 5)?.adherence).toBeUndefined();
    expect(adherenceOf(after, 6)?.adherence).toBeUndefined();
    expect(adherenceOf(after, 8)?.adherence).toBeUndefined();
    expect(adherenceOf(after, 7)).toMatchObject({ adherence: 'on_plan', adherenceSource: 'journal' });
    // Today: the provisional category, shown on the tile.
    expect(suggestedAdherence(after, day(8))).toEqual({ value: 'on_plan', text: 'Plan respecté, d’après ton journal' });
    // The measured habit reads the journal itself: no declaration is written.
    const m = live(measured(), 29, 31, (i) => ({ kcal: 1980, kg: 75 - 0.03 * i }));
    expect(deduceAdherenceFromJournal(m, day(32))).toBe(m);
  });
});

describe('point 6: personal target', () => {
  const tableOf = (s: WheightyStore) => {
    const t = storePersonalTargetTable(s, D0);
    if (!t) throw new Error('no table');
    return t;
  };

  it('refused under the floor, with the minimum; refused beyond the speed allowed, with the limit (accepted)', () => {
    const s = onboard();
    const t = tableOf(s);
    expect(t.floorKcal).toBe(1200);
    expect(checkPersonalTarget(t, 1150)).toMatchObject({ ok: false, reason: 'below_floor', text: `Ton minimum est de 1${THIN_SPACE}200 kcal par jour.` });
    // At 75 kg the floor itself is faster than 1 % a week: refused as too fast, the proposed limit is above the floor.
    expect(checkPersonalTarget(t, 1200)).toMatchObject({ ok: false, reason: 'too_fast' });
    // 75 kg, 165 cm (BMI 27.5): loss allowed up to 1 % a week. A target lower than the one of 1 % is too fast.
    const fastest = calorieTargetForRate(rebuildContextFromStore(s, D0) as PlanContext, 'loss', 0.01, 7000) as number;
    expect(fastest).toBeGreaterThan(1200);
    const r = checkPersonalTarget(t, fastest - 30);
    expect(r).toMatchObject({ ok: false, reason: 'too_fast' });
    if (r.ok) throw new Error('accepted');
    expect(r.text).toBe(`Trop rapide pour ton IMC : au moins ${formatKcal(r.limitKcal as number)} kcal par jour.`);
    expect(checkPersonalTarget(t, r.limitKcal as number).ok).toBe(true);
    // Under BMI 25 the cap is 0.5 % a week: the limit follows the BMI.
    const lighter = onboard(makeProfile({ sexForEquation: 'female', ageYears: 35, heightCm: 165, currentWeightKg: 66, goal: 'loss', targetWeightKg: 60, weeklyRateTarget: 0.004 }));
    const lt = tableOf(lighter);
    const at05 = calorieTargetForRate(rebuildContextFromStore(lighter, D0) as PlanContext, 'loss', 0.005, 7000) as number;
    expect(checkPersonalTarget(lt, at05 - 20)).toMatchObject({ ok: false, reason: 'too_fast' });
  });

  it('a target against the goal: said, with the way out', () => {
    const t = tableOf(onboard());
    expect(checkPersonalTarget(t, 3200)).toEqual({ ok: false, reason: 'contradicts', text: 'Avec cette cible, tu prendrais du poids : change ta cible ou ton objectif.' });
    const gain = tableOf(onboard(makeProfile({ sexForEquation: 'male', heightCm: 180, currentWeightKg: 70, goal: 'gain', targetWeightKg: 76, weeklyRateTarget: 0.0025 })));
    expect(checkPersonalTarget(gain, 1900)).toEqual({ ok: false, reason: 'contradicts', text: 'Avec cette cible, tu perdrais du poids : change ta cible ou ton objectif.' });
    const maint = tableOf(onboard(makeProfile({ goal: 'maintenance' })));
    expect(maint.sides).toHaveLength(2);
    expect(checkPersonalTarget(maint, 1300)).toMatchObject({ ok: false, reason: 'contradicts' });
    expect(checkPersonalTarget(maint, 3500)).toMatchObject({ ok: false, reason: 'contradicts' });
    const zero = maint.sides[0]?.notches[0]?.kcal as number;
    expect(checkPersonalTarget(maint, zero)).toMatchObject({ ok: true, predictedRate: 0 });
  });

  it('predicted speed: the correspondence of the speed slider read the other way, interpolated between two notches', () => {
    const s = onboard();
    const t = tableOf(s);
    const notches = t.sides[0]?.notches as Array<{ rate: number; kcal: number }>;
    // On a notch: its rate; the slider's own target for a rate gives that rate back.
    for (const n of notches.slice(1, 6)) expect((checkPersonalTarget(t, n.kcal) as { predictedRate: number }).predictedRate).toBeCloseTo(n.rate, 12);
    const built = buildPlanFromStore({ ...s, profile: { ...(s.profile as UserProfile), weeklyRateTarget: 0.0065 } }, D0, { source: 'initial' });
    if (!built.ok) throw new Error(built.reason);
    expect((checkPersonalTarget(t, built.plan.calorieTarget) as { predictedRate: number }).predictedRate).toBeCloseTo(0.0065, 6);
    // Between two notches: linear.
    const a = notches[4] as { rate: number; kcal: number };
    const b = notches[5] as { rate: number; kcal: number };
    const mid = checkPersonalTarget(t, (a.kcal + b.kcal) / 2);
    expect(mid).toMatchObject({ ok: true });
    expect((mid as { predictedRate: number }).predictedRate).toBeCloseTo((a.rate + b.rate) / 2, 9);
    expect((mid as { text: string }).text).toMatch(/^Avec .* kcal, vitesse prévue : .* par semaine\.$/);
  });

  it('the plan in force is the chosen target, own source, the predicted speed requested; method unchanged; no periodic replan; no slider', () => {
    const s = live(onboard(), 0, 10, (i) => ({ kg: 75 - 0.05 * i, adherence: 'on_plan' }));
    const r = choosePersonalTarget(s, day(10), 1650);
    if (!r.ok) throw new Error(r.reason);
    const plan = r.store.plan as NonNullable<WheightyStore['plan']>;
    const check = checkPersonalTarget(storePersonalTargetTable(s, day(10)) as never, 1650) as { predictedRate: number };
    expect(plan).toMatchObject({ source: 'personal_target', calorieTarget: 1650, weeklyRateTarget: check.predictedRate, requestedWeeklyRate: check.predictedRate, personalTarget: { kcal: 1650, predictedRate: check.predictedRate } });
    expect(r.store.profile?.weeklyRateTarget).toBe(check.predictedRate);
    expect(r.store.meta.journalPath.method).toBe('assumed');
    expect(r.store.dailyLogs.find((l) => l.date === day(10))?.calorieTargetForDay).toBe(1650);
    expect(personalTargetLine(r.store)).toBe(`Ta cible personnelle : 1${THIN_SPACE}650 kcal par jour. Vitesse prévue : ${formatRatePercent(check.predictedRate)} par semaine.`);
    expect(periodicReplan(r.store, day(60), { nowIso: at(day(60)) }).status).toBe('not_due');
    expect(runDailyChecks(r.store, day(60), at(day(60))).plan?.calorieTarget).toBe(1650);
    expect(balanceSliderAvailable(r.store)).toBe(false);
    expect(applyPathSliderSteps(r.store, day(10), 9000)).toEqual({ ok: false, reason: 'personal_target' });
    // Only on the target assumed to be followed.
    expect(personalTargetAvailable(aligned(16))).toBe(false);
    expect(choosePersonalTarget(aligned(16), day(16), 1650)).toMatchObject({ ok: false, reason: 'journal_path' });
  });

  it('the guardrails apply as for everyone (rate cap of the BMI, BMI 20)', () => {
    const s = onboard();
    const r = choosePersonalTarget(s, D0, 1450);
    if (!r.ok) throw new Error(r.reason);
    expect(r.store.plan?.weeklyRateTarget).toBeGreaterThan(0.005);
    // Under BMI 25 the cap becomes 0.5 % a week: G2 rebuilds the plan, the personal target ends.
    // (The guardrails read the trend weight, which follows the weigh-ins with a lag.)
    const lighter = live(r.store, 1, 25, () => ({ kg: 63 }));
    expect(bmi(guardrailWeightKg(lighter) as number, 165)).toBeLessThan(25);
    const g2 = runDailyChecks(lighter, day(25), at(day(25)));
    expect(g2.plan?.source).toBe('guardrail');
    expect(g2.meta.planEvents.some((e) => e.rule === 'G2' && e.status === 'applied')).toBe(true);
    // Under BMI 20: maintenance.
    const thin = live(r.store, 1, 25, () => ({ kg: 50 }));
    expect(bmi(guardrailWeightKg(thin) as number, 165)).toBeLessThan(20);
    const g1 = runDailyChecks(thin, day(25), at(day(25)));
    expect(g1.plan?.goal).toBe('maintenance');
    expect(g1.meta.planEvents.some((e) => e.rule === 'G1' && e.status === 'applied')).toBe(true);
  });

  it('a recalibration is offered as usual; "Garder ma cible" changes nothing', () => {
    const s = onboard();
    const r = choosePersonalTarget(s, D0, 1700);
    if (!r.ok) throw new Error(r.reason);
    // Weighs in every day, losing faster than predicted.
    const later = live(r.store, 1, 21, (i) => ({ kg: 75 - 0.12 * i, adherence: 'on_plan' }));
    const state = computeCalibrationState(later, day(21), at(day(21)));
    expect(state?.surfaced).toBe(true);
    // Seen (the screen marks it), then kept: the plan stays the chosen target.
    const kept = markRecalibrationSeen(later, state as NonNullable<typeof state>, day(21));
    expect(kept.plan).toBe(later.plan);
    expect(kept.plan?.source).toBe('personal_target');
    expect(computeCalibrationState(kept, day(21), at(day(21)))?.surfaced).toBe(false);
    expect(PERSONAL_TARGET_MESSAGE.keep).toBe('Garder ma cible');
  });

  it('at the onboarding: "J’ai déjà ma cible", checked on the first plan, applied with the onboarding', () => {
    const t = onboardingPersonalTargetTable(LOSS, D0, null);
    if (!t) throw new Error('no table');
    expect(checkPersonalTarget(t, 1100)).toMatchObject({ ok: false, reason: 'below_floor' });
    const r = completeOnboardingWithTarget(emptyStore(), LOSS, D0, at(D0), null, 1700);
    if (!r.ok) throw new Error(r.reason);
    const check = checkPersonalTarget(t, 1700) as { predictedRate: number };
    expect(r.store.plan).toMatchObject({ source: 'personal_target', calorieTarget: 1700, requestedWeeklyRate: check.predictedRate });
    expect(r.store.profile?.weeklyRateTarget).toBe(check.predictedRate);
    expect(r.store.dailyLogs.find((l) => l.date === D0)?.calorieTargetForDay).toBe(1700);
    expect(r.store.meta.onboardingDate).toBe(D0);
    expect(completeOnboardingWithTarget(emptyStore(), LOSS, D0, at(D0), null, 1100)).toMatchObject({ ok: false, reason: 'below_floor', text: `Ton minimum est de 1${THIN_SPACE}200 kcal par jour.` });
    expect(PERSONAL_TARGET_MESSAGE.action).toBe('J’ai déjà ma cible');
    expect(PERSONAL_TARGET_MESSAGE.field).toBe('Ma cible, en kcal par jour');
  });
});
