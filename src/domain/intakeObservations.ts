/**
 * Journal -> calibration bridge (prompt 34 s3.1, D8): the ONLY function allowed to read the food journal for the
 * science. Prototype behind an explicit option: nothing in the store, the worker or the UI calls it (static test).
 *
 * Per day: consumption date (entries are attached to the day they were eaten, J-06), logged kcal total of the day
 * (sum of its entries, never a window average, D1), number of distinct consumption times, and usability by rule.
 */
import type { IntakeObservation } from '@/science/calibration';
import { addDays, daysBetween } from '@/science/dates';
import { journalDay } from './journal';
import type { WheightyStore } from './types';

/**
 * R0: any day with at least one entry is usable.
 * R1: R0, and not usable when the total is below x times the median of the totals of the 14 previous days.
 * R2: R1, and at least 2 distinct consumption times.
 * R1 and R2 are implemented for later phases; they are not measured in phase 1.
 */
export type UsabilityRule = { kind: 'R0' } | { kind: 'R1'; x: number } | { kind: 'R2'; x: number };

const R1_LOOKBACK_DAYS = 14;

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = (s.length - 1) / 2;
  return ((s[Math.floor(mid)] as number) + (s[Math.ceil(mid)] as number)) / 2;
}

/**
 * Observations for every day of [from, to] (inclusive). R1's reference median uses the previous 14 calendar days that
 * have at least one entry; with none, the day is judged by R0 alone.
 */
export function intakeObservationsFrom(store: WheightyStore, from: string, to: string, rule: UsabilityRule): IntakeObservation[] {
  const dayCount = daysBetween(from, to) + 1;
  const lookBack = rule.kind === 'R0' ? 0 : R1_LOOKBACK_DAYS;
  const totals = new Map<string, { kcal: number; moments: number; entries: number }>();
  for (let d = -lookBack; d < dayCount; d++) {
    const date = addDays(from, d);
    const day = journalDay(store, date);
    totals.set(date, { kcal: day.intakeLoggedKcal, moments: new Set(day.entries.map((e) => e.consumedTime)).size, entries: day.entries.length });
  }
  const out: IntakeObservation[] = [];
  for (let d = 0; d < dayCount; d++) {
    const date = addDays(from, d);
    const t = totals.get(date) as { kcal: number; moments: number; entries: number };
    let usable = t.entries > 0;
    if (usable && rule.kind !== 'R0') {
      const previous: number[] = [];
      for (let k = 1; k <= R1_LOOKBACK_DAYS; k++) {
        const p = totals.get(addDays(date, -k));
        if (p && p.entries > 0) previous.push(p.kcal);
      }
      const reference = median(previous);
      if (reference !== null && t.kcal < rule.x * reference) usable = false;
      if (rule.kind === 'R2' && t.moments < 2) usable = false;
    }
    out.push({ date, loggedKcal: t.kcal, consumptionMoments: t.moments, usable });
  }
  return out;
}
