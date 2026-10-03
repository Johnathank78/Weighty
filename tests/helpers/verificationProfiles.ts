/**
 * Profiles of the manual check of pass 5b and of its fixes (reports 45 and 46), built for a given day `today`. Shared by the
 * generator (tests/experiments-journal/prod5b/manualProfiles.experiment.ts, which writes docs/verification-5b/) and the unit
 * tests. Every date is relative to `today`: a file is only valid on the day it was built for (the windows of the journal
 * path slide with the days), hence the regeneration on the day of the check.
 */
import { addWeight, completeOnboarding, setAdherence } from '@/domain/engine';
import { addFoodEntry } from '@/domain/journal';
import { acceptMeasuredOffer, runJournalWeek, switchToAlignedTarget } from '@/domain/journalPath';
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
