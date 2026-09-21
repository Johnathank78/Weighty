/**
 * Weight chart: data to pixel coordinates (A3). Pure, no DOM, no rendering. The chart component only
 * draws what this returns, so the scales can be tested on their own.
 *
 * Horizontal rule (decided with the product owner): the drawing starts at the first weigh-in shown and a
 * fixed share of the width is kept for the days ahead. "Aujourd'hui" therefore always sits at the same
 * place, whatever the amount of history, and the axis labels share the mapping instead of guessing it.
 * The two zones do not have the same days per pixel: the junction is marked on the chart.
 *
 * Projection rule: the projected line starts on the last trend point ("raccord"), then joins the plan's
 * own samples. Their values are never shifted or recomputed here.
 */

export type DayPoint = { day: number; kg: number };
export type DayBand = { day: number; lo: number; hi: number };
export type Pixel = { x: number; y: number };
export type MarkerKind = 'start' | 'today' | 'target';
export type Marker = DayPoint & { kind: MarkerKind };

/** Share of the width kept for the days ahead when there is a projection to draw. */
export const FUTURE_WIDTH_SHARE = 0.3;
const PAD = 8;
/** Smallest weight range displayed, so a flat series does not become a jagged line. */
const MIN_KG_SPAN = 1;
const KG_HEADROOM = 0.08;

export type ChartScaleInput = {
  width: number;
  height: number;
  trend?: readonly DayPoint[];
  raw?: readonly DayPoint[];
  projection?: readonly DayPoint[];
  band?: readonly DayBand[];
  markers?: readonly Marker[];
  futureShare?: number;
  pad?: number;
};

export type ChartScale = {
  width: number;
  height: number;
  x: (day: number) => number;
  y: (kg: number) => number;
  /** [first day drawn, last day drawn]. */
  domainDays: [number, number];
  domainKg: [number, number];
  /** Day of the junction between history and projection: the last trend point. */
  todayDay: number;
  todayX: number;
  /** Horizontal position of "aujourd'hui" as a share of the full width, for the axis labels. */
  todayRatio: number;
  trend: Pixel[];
  raw: Pixel[];
  /** Starts on the last trend point when there is one. */
  projection: Pixel[];
  band: { top: Pixel[]; bottom: Pixel[] };
  markers: Array<Pixel & { kind: MarkerKind }>;
};

const lastOf = <T>(list: readonly T[]): T | null => (list.length > 0 ? (list[list.length - 1] as T) : null);

/** Keeps what happens from `day` on, interpolating the segment that crosses it. */
export function clipBandFrom(band: readonly DayBand[], day: number): DayBand[] {
  const out: DayBand[] = [];
  for (let i = 0; i < band.length; i++) {
    const b = band[i] as DayBand;
    if (b.day >= day) {
      // Nothing before the cut: the band is extended flat back to it, so it starts at the junction.
      if (out.length === 0 && b.day > day) out.push({ day, lo: b.lo, hi: b.hi });
      out.push(b);
      continue;
    }
    const next = band[i + 1];
    if (next && next.day > day) {
      const t = (day - b.day) / (next.day - b.day);
      out.push({ day, lo: b.lo + (next.lo - b.lo) * t, hi: b.hi + (next.hi - b.hi) * t });
    }
  }
  return out;
}

export function chartScale(input: ChartScaleInput): ChartScale | null {
  const { width, height } = input;
  const pad = input.pad ?? PAD;
  const trend = input.trend ?? [];
  const raw = input.raw ?? [];
  const markers = input.markers ?? [];
  const anchor = lastOf(trend) ?? lastOf(raw);
  const anchorDay = anchor?.day ?? input.projection?.[0]?.day ?? 0;

  // Only what happens from the junction on is drawn ahead; the plan's own past samples are dropped.
  const ahead = (input.projection ?? []).filter((p) => p.day > anchorDay);
  const projection = anchor ? [anchor, ...ahead] : ahead;
  const band = ahead.length > 0 ? clipBandFrom(input.band ?? [], anchorDay) : [];

  const days = [...trend, ...raw, ...markers].map((p) => p.day);
  const first = days.length > 0 ? Math.min(...days) : anchorDay;
  const lastAhead = Math.max(lastOf(ahead)?.day ?? anchorDay, lastOf(band)?.day ?? anchorDay);
  const historySpan = Math.max(0, anchorDay - first);
  const futureSpan = Math.max(0, lastAhead - anchorDay);

  const kgs = [...trend.map((p) => p.kg), ...raw.map((p) => p.kg), ...projection.map((p) => p.kg), ...band.flatMap((b) => [b.lo, b.hi]), ...markers.map((m) => m.kg)];
  if (kgs.length === 0) return null;
  let minKg = Math.min(...kgs);
  let maxKg = Math.max(...kgs);
  if (maxKg - minKg < MIN_KG_SPAN) {
    const mid = (maxKg + minKg) / 2;
    minKg = mid - MIN_KG_SPAN / 2;
    maxKg = mid + MIN_KG_SPAN / 2;
  }
  const headroom = (maxKg - minKg) * KG_HEADROOM;
  minKg -= headroom;
  maxKg += headroom;

  const left = pad;
  const right = width - pad;
  const share = futureSpan === 0 ? (historySpan === 0 ? 0.5 : 0) : (input.futureShare ?? FUTURE_WIDTH_SHARE);
  const todayX = left + (1 - share) * (right - left);
  const x = (day: number): number => {
    if (day <= anchorDay) return historySpan === 0 ? todayX : left + ((day - first) / historySpan) * (todayX - left);
    return futureSpan === 0 ? todayX : todayX + ((day - anchorDay) / futureSpan) * (right - todayX);
  };
  const y = (kg: number): number => pad + ((maxKg - kg) / (maxKg - minKg)) * (height - 2 * pad);
  const toPixels = (points: readonly DayPoint[]): Pixel[] => points.map((p) => ({ x: x(p.day), y: y(p.kg) }));

  return {
    width,
    height,
    x,
    y,
    domainDays: [first, Math.max(first, lastAhead)],
    domainKg: [minKg, maxKg],
    todayDay: anchorDay,
    todayX,
    todayRatio: width > 0 ? todayX / width : 0,
    trend: toPixels(trend),
    raw: toPixels(raw),
    projection: toPixels(projection),
    band: { top: band.map((b) => ({ x: x(b.day), y: y(b.hi) })), bottom: band.map((b) => ({ x: x(b.day), y: y(b.lo) })) },
    markers: markers.map((m) => ({ x: x(m.day), y: y(m.kg), kind: m.kind })),
  };
}
