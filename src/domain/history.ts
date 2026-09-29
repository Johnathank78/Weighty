/**
 * "Historique" (UX pass 1, F): the last 90 days, day by day, read from what the store already keeps. Read only: nothing
 * here writes, and nothing is added to the storage for this page.
 *
 * - Calories and macros logged: the food journal entries of each day (optional journal, display only).
 * - Weigh-ins: the raw weigh-ins of each day, and the smoothed trend on the days it has a point (`trendOf`, not stored).
 * - Steps walked: the steps the user entered for a day (`DailyLog.actualSteps`), never the step target of the plan.
 * - Targets: those of the plan in force ("l'objectif du moment"), for a horizontal reference line.
 */
import { addDays } from '@/science/dates';
import type { DailyLog, MacroGrams } from '@/science/types';
import { trendOf } from './engine';
import { journalDay, MACRO_KEYS } from './journal';
import type { WheightyStore } from './types';
import { displayMacros } from './views';

export const HISTORY_WINDOW_DAYS = 90;

export type HistoryDay = {
  date: string;
  /** Sum of the day's journal entries; null when nothing was logged that day. */
  kcalLogged: number | null;
  /** Known macros of the day's entries (unknown ones count as 0); null when no entry gives any macro. */
  macros: MacroGrams | null;
  /** True when every entry of the day gives its three macros (the sums are then complete, not floors). */
  macrosComplete: boolean;
  /** Raw weigh-ins of the day, in the order they were saved. */
  weighIns: number[];
  /** Smoothed trend on that day, when it has a point. */
  trendKg: number | null;
  /** Steps the user entered for the day; null when not entered. */
  stepsWalked: number | null;
  adherence: NonNullable<DailyLog['adherence']> | null;
};

export type HistoryView = {
  from: string;
  to: string;
  /** Oldest first, one per calendar day, `HISTORY_WINDOW_DAYS` of them. */
  days: HistoryDay[];
  /** Days of the window on which each data exists. */
  counts: { kcal: number; macros: number; weighIns: number; steps: number };
  /** Targets of the plan in force; null without a plan. */
  targets: { calorieTargetKcal: number; macros: MacroGrams; stepTarget: number } | null;
};

export type HistorySummary = {
  /** Mean of the days with calories logged; null without any. */
  kcalAverage: number | null;
  /** Mean known macros of the days that give some; null without any. True when a day of the mean is incomplete. */
  macrosAverage: (MacroGrams & { floor: boolean }) | null;
  stepsAverage: number | null;
  /** Trend change over the window, from its first trend point to its last; null with fewer than two. */
  trendChangeKg: number | null;
};

/** What each section says in one line under its chart (phase 2): means over the days that have the data. */
export function historySummary(v: HistoryView): HistorySummary {
  const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
  const withMacros = v.days.filter((d) => d.macros !== null);
  const trend = v.days.filter((d) => d.trendKg !== null);
  const first = trend[0]?.trendKg ?? null;
  const last = trend[trend.length - 1]?.trendKg ?? null;
  return {
    kcalAverage: mean(v.days.flatMap((d) => (d.kcalLogged === null ? [] : [d.kcalLogged]))),
    macrosAverage:
      withMacros.length === 0
        ? null
        : {
            proteinG: mean(withMacros.map((d) => (d.macros as MacroGrams).proteinG)) as number,
            carbsG: mean(withMacros.map((d) => (d.macros as MacroGrams).carbsG)) as number,
            fatG: mean(withMacros.map((d) => (d.macros as MacroGrams).fatG)) as number,
            floor: withMacros.some((d) => !d.macrosComplete),
          },
    stepsAverage: mean(v.days.flatMap((d) => (d.stepsWalked === null ? [] : [d.stepsWalked]))),
    trendChangeKg: trend.length >= 2 && first !== null && last !== null ? last - first : null,
  };
}

export function historyView(store: WheightyStore, today: string, windowDays = HISTORY_WINDOW_DAYS): HistoryView {
  const from = addDays(today, -(windowDays - 1));
  const trend = new Map(trendOf(store).points.map((p) => [p.date, p.trendKg]));
  const logs = new Map(store.dailyLogs.map((l) => [l.date, l]));
  const weighIns = new Map<string, number[]>();
  for (const w of [...store.weights].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))) {
    if (w.date < from || w.date > today) continue;
    weighIns.set(w.date, [...(weighIns.get(w.date) ?? []), w.weightKg]);
  }
  const days: HistoryDay[] = [];
  for (let i = 0; i < windowDays; i++) {
    const date = addDays(from, i);
    const journal = journalDay(store, date);
    const hasEntries = journal.entries.length > 0;
    const anyMacro = journal.entries.some((e) => MACRO_KEYS.some((k) => e.intake[k] !== null));
    const log = logs.get(date);
    days.push({
      date,
      kcalLogged: hasEntries ? journal.intakeLoggedKcal : null,
      macros: anyMacro ? { proteinG: journal.intakeLoggedProteinG, carbsG: journal.intakeLoggedCarbsG, fatG: journal.intakeLoggedFatG } : null,
      macrosComplete: hasEntries && journal.macrosComplete,
      weighIns: weighIns.get(date) ?? [],
      trendKg: trend.get(date) ?? null,
      stepsWalked: log?.actualSteps ?? null,
      adherence: log?.adherence ?? null,
    });
  }
  const count = (has: (d: HistoryDay) => boolean) => days.filter(has).length;
  const plan = store.plan;
  return {
    from,
    to: today,
    days,
    counts: { kcal: count((d) => d.kcalLogged !== null), macros: count((d) => d.macros !== null), weighIns: count((d) => d.weighIns.length > 0), steps: count((d) => d.stepsWalked !== null) },
    targets: plan ? { calorieTargetKcal: plan.calorieTarget, macros: displayMacros(plan), stepTarget: plan.stepTarget } : null,
  };
}
