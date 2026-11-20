/**
 * Profiles of the manual check of pass 5b and of its fixes (reports 45 and 46), built for a given day `today`. Shared by the
 * generator (tests/experiments-journal/prod5b/manualProfiles.experiment.ts, which writes docs/verification-5b/) and the unit
 * tests. Every date is relative to `today`: a file is only valid on the day it was built for (the windows of the journal
 * path slide with the days), hence the regeneration on the day of the check.
 */
import { addWeight, applyRecalibration, completeOnboarding, computeCalibrationState, setAdherence } from '@/domain/engine';
import { addFoodEntry } from '@/domain/journal';
import { acceptMeasuredOffer, changeGoalOnPath, runJournalWeek, switchToAlignedTarget } from '@/domain/journalPath';
import { backfillRecalibrations } from '@/persistence/migrations';
import { completeOnboardingWithTarget } from '@/domain/personalTarget';
import { runDailyChecks } from '@/domain/planSafety';
import type { WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { addDays } from '@/science/dates';
import type { UserProfile } from '@/science/types';
import { makeProfile } from './profiles';

export const at = (d: string) => `${d}T08:00:00.000Z`;
const MEALS = [
  { time: '08:00', share: 0.25 },
  { time: '12:30', share: 0.4 },
  { time: '19:30', share: 0.35 },
] as const;

export const verificationProfile = (firstName: string): UserProfile =>
  makeProfile({ firstName, sexForEquation: 'female', ageYears: 35, heightCm: 165, currentWeightKg: 75, goal: 'loss', targetWeightKg: 64, weeklyRateTarget: 0.005 });

/** Three meals summing to `kcal` on `date` (free entries, no macros). */
export function eat(s: WheightyStore, date: string, kcal: number): WheightyStore {
  let out = s;
  for (const m of MEALS) {
    const r = addFoodEntry(out, { kind: 'manual', food: { name: 'Repas', intake: { energyKcal: Math.round(kcal * m.share), proteinG: null, carbsG: null, fatG: null }, grams: null }, date, localTime: m.time, consumedTime: m.time }, at(date));
    if (!r.ok) throw new Error(r.reason);
    out = r.store;
  }
  return out;
}

export type VerificationDay = { kcal?: number | null; kg?: number | null; adherence?: 'on_plan' | 'minor_deviation' | 'major_deviation' };

/** Onboarding `days` days before `today`. */
export function history(p: UserProfile, today: string, days: number): { store: WheightyStore; start: string } {
  const start = addDays(today, -days);
  const r = completeOnboarding(emptyStore(), p, start, at(start));
  if (!r.ok) throw new Error(r.reason);
  return { store: r.store, start };
}

/** Days `from` to `to` (relative to the start): weigh-in (not on day 0), journal, declared adherence. */
export function live(s: WheightyStore, start: string, from: number, to: number, f: (i: number) => VerificationDay): WheightyStore {
  let out = s;
  for (let i = from; i <= to; i++) {
    const date = addDays(start, i);
    const d = f(i);
    if (d.kg !== null && d.kg !== undefined && i > 0) out = addWeight(out, { date, weightKg: Math.round(d.kg * 10) / 10 }, at(date));
    if (d.kcal !== null && d.kcal !== undefined) out = eat(out, date, d.kcal);
    if (d.adherence) out = setAdherence(out, date, d.adherence);
  }
  return out;
}

/** Aligned target on day `switchDay` (non-follower before), then `after` up to day `to`. */
export function alignedHistory(name: string, today: string, days: number, switchDay: number, to: number, after: (i: number) => VerificationDay): { store: WheightyStore; start: string } {
  const { store, start } = history(verificationProfile(name), today, days);
  let s = live(store, start, 0, switchDay - 1, (i) => ({ kcal: 2100, kg: 75 - 0.02 * i, adherence: 'major_deviation' }));
  s = live(s, start, switchDay, switchDay, (i) => ({ kg: 75 - 0.02 * i }));
  const r = switchToAlignedTarget(s, addDays(start, switchDay), at(addDays(start, switchDay)));
  if (!r.ok) throw new Error(r.reason);
  s = live(r.store, start, switchDay, switchDay, (i) => ({ kcal: after(i).kcal ?? null }));
  return { store: live(s, start, switchDay + 1, to, after), start };
}

/** 1. Automatic proposal: 20 days, a weigh-in and about 2 100 kcal logged every day, every day noted "Écart important". */
export function proposalProfile(today: string): WheightyStore {
  const { store, start } = history(verificationProfile('Test proposition'), today, 20);
  return runDailyChecks(live(store, start, 0, 19, (i) => ({ kcal: 2100 + (i % 3) * 40, kg: 75 - 0.02 * i, adherence: 'major_deviation' })), today, at(today));
}

/** 2. Button: 9 logged days among the 14 before `today` (yesterday not logged), days noted "Plan respecté". */
export function buttonProfile(today: string): WheightyStore {
  const { store, start } = history(verificationProfile('Test bouton'), today, 20);
  const logged = (i: number) => i < 6 || (i <= 18 && ![7, 10, 13, 16].includes(i));
  return runDailyChecks(live(store, start, 0, 19, (i) => ({ kcal: logged(i) && i !== 19 ? 1850 : null, kg: 75 - 0.02 * i, adherence: 'on_plan' })), today, at(today));
}

/** 3. First plan of the measured habit: aligned 21 days ago, 10 % over the target in the journal since, a weigh-in a day. */
export function firstPlanProfile(today: string): WheightyStore {
  const { store } = alignedHistory('Test premier plan', today, 35, 14, 34, (i) => ({ kcal: 2310, kg: 75 - 0.02 * i }));
  const w = addWeight(store, { date: today, weightKg: 74.3 }, at(today));
  return runDailyChecks(runJournalWeek(w, today, at(today)), today, at(today));
}

/**
 * 4. Return to the aligned target: in the measured habit since 14 days, no weigh-in on 3 of the last 7 days. The weekly
 * evaluation is due on `today`: it runs when the page is reloaded after the import.
 */
export function returnProfile(today: string): WheightyStore {
  const { store, start } = alignedHistory('Test retour', today, 49, 14, 34, (i) => ({ kcal: 2310, kg: 75 - 0.02 * i }));
  const d35 = addDays(start, 35);
  const entered = acceptMeasuredOffer(runJournalWeek(addWeight(store, { date: d35, weightKg: 74.3 }, at(d35)), d35, at(d35)), d35, at(d35));
  if (!entered.ok) throw new Error('offer');
  const s = live(entered.store, start, 35, 48, (i) => ({ kcal: 2100, kg: i === 35 || i === 43 || i === 45 || i === 47 ? null : 74.3 - 0.02 * (i - 35) }));
  return { ...s, meta: { ...s.meta, journalPath: { ...s.meta.journalPath, lastEvaluatedOn: addDays(today, -7) } } };
}

/**
 * 5. Incomplete day and adherence of today: aligned 10 days ago; yesterday only 600 kcal logged (under half the usual total);
 * today 15 % over the target in the journal, not noted yet.
 */
export function incompleteDayProfile(today: string): WheightyStore {
  const { store } = alignedHistory('Test journee', today, 24, 14, 23, (i) => ({ kcal: i === 23 ? 600 : 1900 + (i % 2) * 100, kg: 75 - 0.02 * i }));
  const target = store.plan?.calorieTarget as number;
  return runDailyChecks(eat(addWeight(store, { date: today, weightKg: 74.5 }, at(today)), today, Math.round(target * 1.15)), today, at(today));
}

/**
 * 6. Adherence deduced from the journal (fixes, point 4): 10 days on the assumed target, a weigh-in and the journal every day,
 * nothing declared; the day before yesterday 30 % over the target, yesterday 15 % over, today 5 % over. The day change after
 * the import records the past days (not done here, so that the check sees it happen).
 */
export function deducedAdherenceProfile(today: string): WheightyStore {
  const { store, start } = history(verificationProfile('Test adhérence'), today, 10);
  const target = store.plan?.calorieTarget as number;
  const s = live(store, start, 0, 9, (i) => ({ kg: 75 - 0.02 * i, kcal: Math.round(target * (i === 8 ? 1.3 : i === 9 ? 1.15 : 1)) }));
  return eat(addWeight(s, { date: today, weightKg: 74.8 }, at(today)), today, Math.round(target * 1.05));
}

/**
 * 7. Personal target in force (fixes, point 6; report 47): target of 1 700 kcal chosen at the onboarding, 7 days ago; a
 * weigh-in and "Plan respecté" every day; no recalibration yet.
 */
export function personalTargetProfile(today: string): WheightyStore {
  const start = addDays(today, -7);
  const r = completeOnboardingWithTarget(emptyStore(), verificationProfile('Test cible personnelle'), start, at(start), null, 1700);
  if (!r.ok) throw new Error(r.reason);
  return live(r.store, start, 1, 7, (i) => ({ kg: 75 - 0.08 * i, adherence: 'on_plan' }));
}

/**
 * 8. Takeover of a personal target (report 47, point 1c): 66 kg, 165 cm (BMI 24); target of 1 350 kcal chosen at the
 * onboarding 21 days ago (the population estimate would have refused it as too fast); a weigh-in and "Plan respecté" every
 * day, losing 0.1 kg a day: the first recalibration is ready when the file is opened, and the app takes the target over by
 * itself ("Vitesse ajustée", 1 350 -> about 1 560 kcal, 0.5 % a week, the maximum at this BMI).
 */
export function takeoverProfile(today: string): WheightyStore {
  const start = addDays(today, -21);
  const profile = makeProfile({ firstName: 'Test reprise', sexForEquation: 'female', ageYears: 35, heightCm: 165, currentWeightKg: 66, goal: 'loss', targetWeightKg: 60, weeklyRateTarget: 0.004 });
  const r = completeOnboardingWithTarget(emptyStore(), profile, start, at(start), null, 1350);
  if (!r.ok) throw new Error(r.reason);
  return live(r.store, start, 1, 21, (i) => ({ kg: 66 - 0.1 * i, adherence: 'on_plan' }));
}

// ---------------------------------------------------------------------------
// Report 49 (prompt 6a): pauses and the life cycle of the recalibration. No real data: synthetic stores of the same shape.
// ---------------------------------------------------------------------------

/** Days 1 to `to` of tracking from the start: a weigh-in a day losing 0.06 kg, "Plan respecté" on the days `noted` keeps. */
function tracked(s: WheightyStore, start: string, from: number, to: number, noted: (i: number) => boolean = () => true, kg: (i: number) => number = (i) => 75 - 0.06 * i): WheightyStore {
  return live(s, start, from, to, (i) => ({ kg: kg(i), ...(noted(i) ? { adherence: 'on_plan' as const } : {}) }));
}

/**
 * 8. Pause without a weigh-in (D3): 18 days of tracking (a weigh-in and "Plan respecté" every day), no recalibration applied,
 * the last weigh-in 22 days ago. Expected: the message "Ton plan attend une pesée", no recalibration shown, no projection.
 */
export function pauseWithoutWeighInProfile(today: string): WheightyStore {
  const { store, start } = history(verificationProfile('Test pause'), today, 40);
  return tracked(store, start, 0, 18);
}

/**
 * 9. Back after the pause (D4, D7): profile 8, and a weigh-in today. Expected: the gate counts since the return (1 weigh-in,
 * "Comptées depuis ta reprise du ..."); the projection is reanchored if D7 is on.
 */
export function backAfterPauseProfile(today: string): WheightyStore {
  return addWeight(pauseWithoutWeighInProfile(today), { date: today, weightKg: 74.2 }, at(today));
}

/**
 * 10. Recalibrated, gate closed (D2): a recalibration applied 10 days ago (gate met then: "Plan respecté" on 3 days out of 5),
 * then 10 days of weigh-ins without any adherence noted, so that today's coverage is under 50 %. Expected: the calibrated
 * layout of Analyse with "Vers la prochaine mise à jour", "prochaine mise à jour" on Aujourd'hui.
 */
export function recalibratedGateClosedProfile(today: string): WheightyStore {
  const { store, start } = history(verificationProfile('Test recalibrée'), today, 31);
  const s = tracked(store, start, 0, 21, (i) => i % 5 < 3);
  const day = addDays(start, 21);
  const state = computeCalibrationState(s, day, at(day));
  if (!state?.gate.met) throw new Error('gate of profile 10');
  const r = applyRecalibration(s, state, day, at(day));
  if (!r.ok) throw new Error(r.reason);
  return tracked(r.store, start, 22, 31, () => false, (i) => 75 - 0.06 * i);
}

/**
 * 11. Periodic replan and recalibration the same day (D5): a recalibration applied 40 days ago, then a weigh-in and "Plan
 * respecté" every day, the weight flat: the replan is due (more than 28 days) and a new recalibration is ready. Expected: one
 * change, the recalibration (the replan waits; it runs the next day if the recalibration is not applied).
 */
export function replanAndRecalibrationProfile(today: string): WheightyStore {
  const { store, start } = history(verificationProfile('Test un seul changement'), today, 61);
  const s = tracked(store, start, 0, 21);
  const day = addDays(start, 21);
  const state = computeCalibrationState(s, day, at(day));
  if (!state?.gate.met) throw new Error('gate of profile 11');
  const r = applyRecalibration(s, state, day, at(day));
  if (!r.ok) throw new Error(r.reason);
  return tracked(r.store, start, 22, 61, () => true, () => 75 - 0.06 * 21);
}

// ---------------------------------------------------------------------------
// UX pass 3 (report 50, section 4.5). No real data: synthetic stores.
// ---------------------------------------------------------------------------

/**
 * 15. Pause and projection (point 1): a weigh-in and "Plan respecté" a day for 21 days, a pause of 20 days without a weigh-in,
 * the return on day 42, a recalibration applied on day 60 (gate of the period met), then weigh-ins up to 3 days ago.
 * Expected in Suivi: a grey band over the pause, "Auj." on today, the dashed join from the last weigh-in, the projection drawn
 * day by day, on "Ce mois-ci" and on "Tout".
 */
export function pauseAndProjectionProfile(today: string): WheightyStore {
  const { store, start } = history(verificationProfile('Test pause et projection'), today, 70);
  const before = tracked(store, start, 0, 21);
  const back = tracked(before, start, 42, 60, () => true, (i) => 75 - 0.06 * i + 0.4);
  const day = addDays(start, 60);
  const state = computeCalibrationState(back, day, at(day));
  if (!state?.gate.met) throw new Error('gate of profile 15');
  const r = applyRecalibration(back, state, day, at(day));
  if (!r.ok) throw new Error(r.reason);
  return tracked(r.store, start, 61, 67, () => true, (i) => 75 - 0.06 * i + 0.4);
}

/**
 * 12. First recalibration (point 2): the target assumed to be followed, no recalibration applied, 21 days of a weigh-in and
 * "Plan respecté" a day, losing faster than the plan: a first recalibration is ready. Expected: its screen opens by itself
 * at the loading; after "Plus tard" the card stays in Analyse; after a reload the screen does not open again.
 */
export function firstRecalibrationProfile(today: string): WheightyStore {
  const { store, start } = history(verificationProfile('Test première recalibration'), today, 21);
  return tracked(store, start, 1, 21, () => true, (i) => 75 - 0.1 * i);
}

/**
 * 13. Personal target and first recalibration (point 2b): a target of 1 700 kcal chosen at the onboarding 21 days ago, a
 * weigh-in and "Plan respecté" a day, losing 0.1 kg a day: the first recalibration is ready. Expected: no screen; the app
 * takes the target over by itself, with its short message.
 */
export function personalTargetRecalibrationProfile(today: string): WheightyStore {
  const start = addDays(today, -21);
  const r = completeOnboardingWithTarget(emptyStore(), verificationProfile('Test cible et recalibration'), start, at(start), null, 1700);
  if (!r.ok) throw new Error(r.reason);
  return tracked(r.store, start, 1, 21, () => true, (i) => 75 - 0.1 * i);
}

/** A recalibration applied on day `day` of the tracking (the gate must be met). */
function recalibrateOn(s: WheightyStore, start: string, day: number): WheightyStore {
  const date = addDays(start, day);
  const state = computeCalibrationState(s, date, at(date));
  if (!state?.gate.met || !state.candidate) throw new Error(`gate on day ${day}`);
  const r = applyRecalibration(s, state, date, at(date));
  if (!r.ok) throw new Error(r.reason);
  return r.store;
}

/**
 * 14. History of the plan (point 3): onboarding 70 days ago; a recalibration on day 21 whose entry is the one the migration
 * 10 -> 11 rebuilds (backfilled, plans unknown); a second recalibration on day 35; the speed changed on day 40 (0.5 -> 0.75 %
 * a week); the periodic replan 28 days later (day 68). A weigh-in and "Plan respecté" a day. Expected: the page lists the
 * five changes, most recent first, the rebuilt one as "Recalibration (détails non conservés)".
 */
export function planHistoryProfile(today: string): WheightyStore {
  const { store, start } = history(verificationProfile('Test historique'), today, 70);
  let s = tracked(store, start, 0, 21, () => true, (i) => 75 - 0.1 * i);
  s = recalibrateOn(s, start, 21);
  // As if written before schema 11: the entry of that recalibration is the rebuilt one.
  const kept = s.meta.planEvents.filter((e) => e.rule !== 'recalibration');
  s = { ...s, meta: { ...s.meta, planEvents: backfillRecalibrations(kept, s.calibrationSnapshots) as typeof kept } };
  s = tracked(s, start, 22, 35, () => true, (i) => 75 - 0.1 * i);
  s = recalibrateOn(s, start, 35);
  s = tracked(s, start, 36, 40, () => true, (i) => 75 - 0.1 * i);
  const d40 = addDays(start, 40);
  const goal = changeGoalOnPath(s, d40, { goal: 'loss', targetWeightKg: 64, weeklyRate: 0.0075 });
  if (!goal.ok) throw new Error(goal.reason);
  s = tracked(goal.store, start, 41, 68, () => true, (i) => 75 - 0.1 * i);
  return runDailyChecks(s, addDays(start, 68), at(addDays(start, 68)));
}
