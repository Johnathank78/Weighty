/**
 * UI weight trend (instruct/05 section 5): EWMA with a 7-day half-life on irregular dates.
 * The trend is for display only and is never used as the calibration target.
 */
import { DAYS_PER_WEEK, TREND_HALF_LIFE_DAYS, TREND_MIN_WEIGHINS, TREND_RATE_WINDOW_DAYS } from './constants';
import { daysBetween } from './dates';
import type { WeightEntry } from './types';

export type TrendPoint = { date: string; rawKg: number; trendKg: number };

/** One weight per calendar date: the most recently created entry wins. */
export function dedupeWeightsByDate(weights: readonly WeightEntry[]): WeightEntry[] {
  const byDate = new Map<string, WeightEntry>();
  for (const w of weights) {
    const existing = byDate.get(w.date);
    if (!existing || existing.createdAt <= w.createdAt) byDate.set(w.date, w);
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function ewmaAlpha(dtDays: number): number {
  return 1 - Math.exp((-Math.LN2 * dtDays) / TREND_HALF_LIFE_DAYS);
}

export function computeTrend(weights: readonly WeightEntry[]): TrendPoint[] {
  const sorted = dedupeWeightsByDate(weights);
  const out: TrendPoint[] = [];
  let trend = Number.NaN;
  let prevDate = '';
  for (const w of sorted) {
    if (out.length === 0) {
      trend = w.weightKg;
    } else {
      const dt = daysBetween(prevDate, w.date);
      trend = trend + ewmaAlpha(dt) * (w.weightKg - trend);
    }
    prevDate = w.date;
    out.push({ date: w.date, rawKg: w.weightKg, trendKg: trend });
  }
  return out;
}

export type TrendSummary = {
  latest: TrendPoint | null;
  /** kg per week, null while the trend is not readable yet. */
  weeklyRateKg: number | null;
  readable: boolean;
};

export function summarizeTrend(points: readonly TrendPoint[]): TrendSummary {
  const latest = points[points.length - 1] ?? null;
  if (!latest || points.length < TREND_MIN_WEIGHINS) return { latest, weeklyRateKg: null, readable: false };
  let reference: TrendPoint | null = null;
  for (let i = points.length - 2; i >= 0; i--) {
    const p = points[i];
    if (p && daysBetween(p.date, latest.date) >= TREND_RATE_WINDOW_DAYS) {
      reference = p;
      break;
    }
  }
  if (!reference) return { latest, weeklyRateKg: null, readable: false };
  const days = daysBetween(reference.date, latest.date);
  return { latest, weeklyRateKg: ((latest.trendKg - reference.trendKg) / days) * DAYS_PER_WEEK, readable: true };
}
