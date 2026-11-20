/**
 * Weight chart: data to pixel coordinates (A3). Pure, no DOM, no rendering. The chart component only
 * draws what this returns, so the scales can be tested on their own.
 *
 * Horizontal rule (UX pass 3, point 1a, decision of the product owner of 11/11 and 20/11): one time scale for the whole
 * window, a day has the same width before and after today. The window comes from the data (`trackingChart`): "Ce mois-ci",
 * 30 days on each side of today; "Tout", from the first weigh-in to the arrival of the projection. "Aujourd'hui" sits at its
 * real position; the vertical line drawn there no longer marks a change of scale.
 *
 * Projection rule (UX pass 3, point 1b): the projection starts today. A dashed join, in the style of the projection, goes from
 * the last trend point to it; the values of the projection are never shifted or recomputed here.
 *
 * Pauses (UX pass 3, point 1d): the trend line is interrupted over a pause, and the pause gets a band of its own.
 */

export type DayPoint = { day: number; kg: number };
export type DayBand = { day: number; lo: number; hi: number };
export type DaySpan = { fromDay: number; toDay: number };
export type Pixel = { x: number; y: number };
export type MarkerKind = 'start' | 'today' | 'target';
export type Marker = DayPoint & { kind: MarkerKind };

const PAD = 8;
/** Smallest weight range displayed, so a flat series does not become a jagged line. */
const MIN_KG_SPAN = 1;
const KG_HEADROOM = 0.08;

export type ChartScaleInput = {
  width: number;
  height: number;
  /** First and last day of the window. Absent: the days of the data. */
  domainDays?: readonly [number, number];
  /** Day of "aujourd'hui". Absent: the last trend point (or raw point). */
  todayDay?: number;
  trend?: readonly DayPoint[];
  raw?: readonly DayPoint[];
  /** Where the plan leads, from today. */
  projection?: readonly DayPoint[];
  band?: readonly DayBand[];
  markers?: readonly Marker[];
  pauses?: readonly DaySpan[];
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
  todayDay: number;
  todayX: number;
  /** Horizontal position of "aujourd'hui" as a share of the full width, for the axis labels. */
  todayRatio: number;
  /** Every trend point (for the area under the line). */
  trend: Pixel[];
  /** The trend line, cut at each pause: one polyline per tracking period. */
  trendSegments: Pixel[][];
  raw: Pixel[];
  /** The projection, starting on the last trend point when there is one (the dashed join to today, then the plan). */
  projection: Pixel[];
  band: { top: Pixel[]; bottom: Pixel[] };
  /** The pauses within the window, as horizontal spans of pixels. */
  pauses: Array<{ x0: number; x1: number }>;
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

/** The trend cut between two consecutive points on either side of a pause (the line is interrupted there). */
export function splitAtPauses<T extends { day: number }>(points: readonly T[], pauses: readonly DaySpan[]): T[][] {
  const segments: T[][] = [];
  let current: T[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i] as T;
    const prev = points[i - 1];
    if (prev && pauses.some((g) => prev.day <= g.fromDay && p.day >= g.toDay)) {
      segments.push(current);
      current = [];
    }
    current.push(p);
  }
  if (current.length > 0) segments.push(current);
  return segments.filter((s) => s.length > 0);
}

export function chartScale(input: ChartScaleInput): ChartScale | null {
  const { width, height } = input;
  const pad = input.pad ?? PAD;
  const trend = input.trend ?? [];
  const raw = input.raw ?? [];
  const markers = input.markers ?? [];
  const lastTrend = lastOf(trend) ?? lastOf(raw);
  const todayDay = input.todayDay ?? lastTrend?.day ?? input.projection?.[0]?.day ?? 0;
  const ahead = input.projection ?? [];
  // The join: from the last trend point to the first day of the projection (today), in the projection's style.
  const projection = lastTrend && ahead.length > 0 && (ahead[0] as DayPoint).day > lastTrend.day ? [lastTrend, ...ahead] : lastTrend && ahead.length > 0 ? [lastTrend, ...ahead.slice(1)] : [...ahead];
  const band = ahead.length > 0 ? clipBandFrom(input.band ?? [], todayDay) : [];

  const dataDays = [...trend, ...raw, ...markers, ...ahead].map((p) => p.day);
  const d0 = input.domainDays?.[0] ?? (dataDays.length > 0 ? Math.min(...dataDays, todayDay) : todayDay);
  const d1 = input.domainDays?.[1] ?? (dataDays.length > 0 ? Math.max(...dataDays, todayDay) : todayDay);
  const inWindow = (day: number) => day >= d0 && day <= d1;

  const kgs = [
    ...trend.filter((p) => inWindow(p.day)).map((p) => p.kg),
    ...raw.filter((p) => inWindow(p.day)).map((p) => p.kg),
    ...projection.filter((p) => inWindow(p.day)).map((p) => p.kg),
    ...band.filter((b) => inWindow(b.day)).flatMap((b) => [b.lo, b.hi]),
    ...markers.map((m) => m.kg),
  ];
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
  const span = d1 - d0;
  // One scale: a single day (span 0) is drawn in the middle.
  const x = (day: number): number => (span <= 0 ? (left + right) / 2 : left + ((day - d0) / span) * (right - left));
  const y = (kg: number): number => pad + ((maxKg - kg) / (maxKg - minKg)) * (height - 2 * pad);
  const toPixels = (points: readonly DayPoint[]): Pixel[] => points.map((p) => ({ x: x(p.day), y: y(p.kg) }));
  const todayX = x(todayDay);
  const pauses = (input.pauses ?? []).filter((p) => p.toDay >= d0 && p.fromDay <= d1);

  return {
    width,
    height,
    x,
    y,
    domainDays: [d0, d1],
    domainKg: [minKg, maxKg],
    todayDay,
    todayX,
    todayRatio: width > 0 ? todayX / width : 0,
    trend: toPixels(trend),
    trendSegments: splitAtPauses(trend, pauses).map(toPixels),
    raw: toPixels(raw),
    projection: toPixels(projection),
    band: { top: band.map((b) => ({ x: x(b.day), y: y(b.hi) })), bottom: band.map((b) => ({ x: x(b.day), y: y(b.lo) })) },
    pauses: pauses.map((p) => ({ x0: Math.max(left, x(p.fromDay)), x1: Math.min(right, x(p.toDay)) })),
    markers: markers.map((m) => ({ x: x(m.day), y: y(m.kg), kind: m.kind })),
  };
}

/**
 * Labels under the chart (UX pass 3, point 1a): the first date, "Auj." at its real position, the last date. An edge label too
 * close to "Auj." is left out rather than overlapping it (`minGap`: share of the width).
 */
export function axisLabels(todayRatio: number, minGap = 0.16): { start: boolean; end: boolean } {
  return { start: todayRatio >= minGap, end: todayRatio <= 1 - minGap };
}
