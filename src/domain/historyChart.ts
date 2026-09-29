/**
 * Charts of "Historique" (UX pass 1, phase 2): data to pixel coordinates. Pure, no DOM, no rendering; the canvas component
 * only paints what this returns (same split as `chartScale` for the Suivi chart). One slot per day of the window, oldest
 * on the left; a day without data has no bar and no point, never a zero.
 */
export type Pixel = { x: number; y: number };
export type HistoryBar = { day: number; x: number; width: number; y: number; height: number; faded: boolean };

/** Room kept above the tallest bar or the target line. */
const TOP_ROOM = 0.12;
/** Share of a day slot a bar takes. */
const BAR_SHARE = 0.66;
const PAD_Y = 6;
/** Smallest weight range drawn, so a flat period does not become a jagged line. */
const MIN_KG_SPAN = 1;
const KG_HEADROOM = 0.1;

export type HistoryBarsScale = {
  width: number;
  height: number;
  bars: HistoryBar[];
  /** Height of the target line ("objectif du moment"); null without a target. */
  targetY: number | null;
  /** Value at the top of the drawing. */
  max: number;
};

/**
 * Bars from the bottom of the drawing. `values[i]` is day i of the window (null: nothing that day); `faded[i]`: a floor
 * rather than a total (macros of a day with incomplete entries). The scale always shows the target.
 */
export function historyBarsScale(input: { width: number; height: number; values: ReadonlyArray<number | null>; faded?: ReadonlyArray<boolean>; target: number | null }): HistoryBarsScale {
  const { width, height, values, target } = input;
  const n = Math.max(1, values.length);
  const slot = width / n;
  const barWidth = Math.max(1, slot * BAR_SHARE);
  const highest = Math.max(0, target ?? 0, ...values.map((v) => v ?? 0));
  const max = highest > 0 ? highest * (1 + TOP_ROOM) : 1;
  const y = (v: number) => height - (Math.max(0, v) / max) * height;
  const bars: HistoryBar[] = [];
  values.forEach((v, day) => {
    if (v === null) return;
    const top = y(v);
    bars.push({ day, x: day * slot + (slot - barWidth) / 2, width: barWidth, y: top, height: height - top, faded: input.faded?.[day] ?? false });
  });
  return { width, height, bars, targetY: target !== null && target > 0 ? y(target) : null, max };
}

export type HistoryWeightScale = {
  width: number;
  height: number;
  /** Every weigh-in (several on a day share its slot). */
  raw: Pixel[];
  /** The smoothed trend on the days it has a point, joined in day order. */
  trend: Pixel[];
  domainKg: [number, number];
};

/** Weigh-ins and trend over the window, on a weight scale fitted to them. */
export function historyWeightScale(input: { width: number; height: number; days: ReadonlyArray<{ weighIns: readonly number[]; trendKg: number | null }> }): HistoryWeightScale {
  const { width, height, days } = input;
  const slot = width / Math.max(1, days.length);
  const all = days.flatMap((d) => [...d.weighIns, ...(d.trendKg === null ? [] : [d.trendKg])]);
  if (all.length === 0) return { width, height, raw: [], trend: [], domainKg: [0, 1] };
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi - lo < MIN_KG_SPAN) {
    const mid = (hi + lo) / 2;
    lo = mid - MIN_KG_SPAN / 2;
    hi = mid + MIN_KG_SPAN / 2;
  }
  const room = (hi - lo) * KG_HEADROOM;
  lo -= room;
  hi += room;
  const x = (day: number) => (day + 0.5) * slot;
  const y = (kg: number) => PAD_Y + ((hi - kg) / (hi - lo)) * (height - 2 * PAD_Y);
  const raw: Pixel[] = [];
  const trend: Pixel[] = [];
  days.forEach((d, day) => {
    for (const kg of d.weighIns) raw.push({ x: x(day), y: y(kg) });
    if (d.trendKg !== null) trend.push({ x: x(day), y: y(d.trendKg) });
  });
  return { width, height, raw, trend, domainKg: [lo, hi] };
}
