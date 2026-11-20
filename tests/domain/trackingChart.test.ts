/**
 * Suivi chart (A3, reworked by UX pass 3, point 1): the pure scale, one time scale for the window, "Auj." on today, the
 * projection from today joined to the last trend point, one sample per day, the pauses, and the weigh-in list when a day
 * carries several entries. No rendering here: `chartScale` maps data to pixels on its own.
 *
 * UX pass 3 replaced the fixed share of the width kept for the days ahead (`FUTURE_WIDTH_SHARE`, decision of A3) by a single
 * time scale (decision of the product owner of 11/11, E1): the tests of that share are replaced by the tests of the new rule.
 */
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WeightChart } from '@/components/WeightChart';
import { axisLabels, chartScale, clipBandFrom, splitAtPauses } from '@/domain/chartScale';
import type { DayPoint } from '@/domain/chartScale';
import { addWeight, completeOnboarding, computeCalibrationState, setAdherence } from '@/domain/engine';
import type { CalibrationState } from '@/domain/engine';
import { projectionFromToday, recentWeights, trackingChart, TRACKING_ALL_DAYS_AHEAD, TRACKING_ALL_MAX_DAYS_AHEAD, TRACKING_MONTH_DAYS_EACH_SIDE, TRACKING_RANGE_DAYS } from '@/domain/views';
import { chartSummary } from '@/screens/Tracking';
import type { WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { addDays, daysBetween } from '@/science/dates';
import { makeProfile } from '../helpers/profiles';

const TODAY = '2026-09-21';
const at = (date: string, time = '08:00') => `${date}T${time}:00.000Z`;
const W = 342;
const H = 168;
const PAD = 8;

function storeWith(weights: Array<{ date: string; kg: number; time?: string }>, start = addDays(TODAY, -1), profile = makeProfile({ goal: 'loss', currentWeightKg: 81, targetWeightKg: 76, weeklyRateTarget: 0.005 })): WheightyStore {
  const onboarded = completeOnboarding(emptyStore(), profile, start, at(start));
  if (!onboarded.ok) throw new Error(onboarded.reason);
  let s: WheightyStore = { ...onboarded.store, weights: [] };
  for (const w of weights) s = addWeight(s, { date: w.date, weightKg: w.kg }, at(w.date, w.time));
  return s;
}

/** Enough weigh-ins and noted days for the first calibration: without it nothing is drawn ahead. */
function calibratedStore(days = 77, lastWeighInDaysAgo = 0, profile?: ReturnType<typeof makeProfile>): { store: WheightyStore; state: CalibrationState } {
  const start = addDays(TODAY, -days);
  // A weigh-in every 7 days, and the last one `lastWeighInDaysAgo` days before today.
  const last = days - lastWeighInDaysAgo;
  const offsets = [...Array.from({ length: Math.ceil(last / 7) }, (_, i) => i * 7), last];
  let s = storeWith(
    offsets.map((d) => ({ date: addDays(start, d), kg: 81 - (d / 7) * 0.35 })),
    start,
    profile,
  );
  for (let d = 0; d <= days; d++) s = setAdherence(s, addDays(start, d), 'on_plan');
  const state = computeCalibrationState(s, TODAY, at(TODAY));
  if (!state) throw new Error('state');
  return { store: s, state };
}

describe('chart scale (UX pass 3, point 1a: one time scale)', () => {
  const trend: DayPoint[] = [
    { day: 20, kg: 81 },
    { day: 27, kg: 80.6 },
  ];
  const projection: DayPoint[] = [
    { day: 30, kg: 80.6 },
    { day: 31, kg: 80.5 },
    { day: 45, kg: 79.8 },
    { day: 60, kg: 79.5 },
  ];
  const band = projection.map((p) => ({ day: p.day, lo: p.kg - 0.7, hi: p.kg + 0.7 }));

  it('a day has the same width before and after today, and today sits at its real position', () => {
    const s = chartScale({ width: W, height: H, domainDays: [0, 60], todayDay: 30, trend, raw: trend, projection, band });
    if (!s) throw new Error('scale');
    const day = (W - 2 * PAD) / 60;
    expect(s.x(0)).toBeCloseTo(PAD, 9);
    expect(s.x(60)).toBeCloseTo(W - PAD, 9);
    expect(s.x(1) - s.x(0)).toBeCloseTo(day, 9);
    expect(s.x(31) - s.x(30)).toBeCloseTo(day, 9);
    expect(s.x(59) - s.x(58)).toBeCloseTo(day, 9);
    // "Ce mois-ci": today in the middle, whatever the amount of history.
    expect(s.todayX).toBeCloseTo(W / 2, 9);
    expect(s.todayRatio).toBeCloseTo(0.5, 9);
    expect(s.domainDays).toEqual([0, 60]);
  });

  it('joins the last trend point to the projection, which starts today', () => {
    const s = chartScale({ width: W, height: H, domainDays: [0, 60], todayDay: 30, trend, raw: trend, projection, band });
    if (!s) throw new Error('scale');
    const lastTrend = s.trend[s.trend.length - 1];
    // The dashed join: from the last trend point (day 27) to today (day 30), then the plan's samples.
    expect(s.projection[0]).toEqual(lastTrend);
    expect(s.projection[1]?.x).toBeCloseTo(s.x(30), 9);
    expect(s.projection).toHaveLength(projection.length + 1);
    // The band starts today, not on the last weigh-in.
    expect(s.band.top[0]?.x).toBeCloseTo(s.todayX, 9);
    // Weighed today: no join to draw, the projection starts on the trend point itself.
    const weighedToday = chartScale({ width: W, height: H, domainDays: [0, 60], todayDay: 30, trend: [{ day: 30, kg: 80.6 }], projection });
    expect(weighedToday?.projection).toHaveLength(projection.length);
    expect(weighedToday?.projection[0]).toEqual(weighedToday?.trend[0]);
  });

  it('interpolates the band on the segment that crosses the junction', () => {
    const clipped = clipBandFrom(
      [
        { day: 0, lo: 80, hi: 82 },
        { day: 7, lo: 79, hi: 81 },
      ],
      1,
    );
    expect(clipped[0]).toEqual({ day: 1, lo: 80 - 1 / 7, hi: 82 - 1 / 7 });
    expect(clipped).toHaveLength(2);
    expect(clipBandFrom([{ day: 7, lo: 79, hi: 81 }], 1)[0]).toEqual({ day: 1, lo: 79, hi: 81 });
    expect(clipBandFrom([], 1)).toEqual([]);
  });

  it('interrupts the trend over a pause and gives the pause its own span (point 1d)', () => {
    const points = [0, 5, 10, 32, 36].map((day) => ({ day, kg: 80 }));
    const pauses = [{ fromDay: 10, toDay: 32 }];
    expect(splitAtPauses(points, pauses).map((seg) => seg.map((p) => p.day))).toEqual([
      [0, 5, 10],
      [32, 36],
    ]);
    expect(splitAtPauses(points, [])).toHaveLength(1);
    const s = chartScale({ width: W, height: H, domainDays: [0, 60], todayDay: 36, trend: points, raw: points, pauses });
    if (!s) throw new Error('scale');
    expect(s.trendSegments).toHaveLength(2);
    expect(s.trend).toHaveLength(5);
    expect(s.pauses).toEqual([{ x0: s.x(10), x1: s.x(32) }]);
    // A pause that started before the window is cut at its left edge.
    const clipped = chartScale({ width: W, height: H, domainDays: [0, 60], todayDay: 36, trend: points, pauses: [{ fromDay: -8, toDay: 0 }] });
    expect(clipped?.pauses[0]?.x0).toBeCloseTo(PAD, 9);
  });

  it('a single weigh-in draws one point without a degenerate scale', () => {
    const one = chartScale({ width: W, height: H, trend: [{ day: 0, kg: 81 }], raw: [{ day: 0, kg: 81 }] });
    if (!one) throw new Error('scale');
    expect(one.trend).toHaveLength(1);
    expect(one.todayRatio).toBeCloseTo(0.5, 6);
    expect(one.domainKg[1] - one.domainKg[0]).toBeGreaterThan(1);
    expect(Number.isFinite(one.trend[0]?.x ?? Number.NaN)).toBe(true);
    expect(Number.isFinite(one.trend[0]?.y ?? Number.NaN)).toBe(true);
  });

  it('two points on the same day share one abscissa, a gap of days spreads them apart', () => {
    const sameDay = chartScale({ width: W, height: H, trend: [{ day: 3, kg: 81 }], raw: [{ day: 3, kg: 82 }, { day: 3, kg: 83 }], projection: [{ day: 10, kg: 80 }] });
    if (!sameDay) throw new Error('scale');
    expect(sameDay.raw[0]?.x).toBeCloseTo(sameDay.raw[1]?.x ?? -1, 6);
    expect(sameDay.raw[0]?.y).not.toBeCloseTo(sameDay.raw[1]?.y ?? -1, 6);
    const gap = chartScale({ width: W, height: H, trend: [{ day: 0, kg: 81 }, { day: 10, kg: 80.6 }, { day: 12, kg: 80.5 }] });
    if (!gap) throw new Error('scale');
    const span = (gap.trend[2]?.x ?? 0) - (gap.trend[0]?.x ?? 0);
    expect(((gap.trend[1]?.x ?? 0) - (gap.trend[0]?.x ?? 0)) / span).toBeCloseTo(10 / 12, 6);
  });

  it('returns nothing when there is nothing to draw', () => {
    expect(chartScale({ width: W, height: H })).toBeNull();
  });

  it('labels: the first date, "Auj." and the last date; an end label too close to "Auj." is left out', () => {
    expect(axisLabels(0.5)).toEqual({ start: true, end: true });
    expect(axisLabels(0.95)).toEqual({ start: true, end: false });
    expect(axisLabels(0.03)).toEqual({ start: false, end: true });
  });
});

describe('Suivi chart data (UX pass 3, point 1)', () => {
  /** The reported case of A3: first weigh-in yesterday, two more today. */
  const reported = storeWith([
    { date: addDays(TODAY, -1), kg: 81 },
    { date: TODAY, kg: 82, time: '07:10' },
    { date: TODAY, kg: 83, time: '09:40' },
  ]);

  it('"Ce mois-ci": 30 days before today and 30 after, today in the middle, even for a new user', () => {
    const chart = trackingChart(reported, TODAY, TRACKING_RANGE_DAYS.month, computeCalibrationState(reported, TODAY, at(TODAY)));
    if (!chart) throw new Error('chart');
    expect(TRACKING_MONTH_DAYS_EACH_SIDE).toBe(30);
    expect(chart.startDate).toBe(addDays(TODAY, -30));
    expect(chart.todayDay).toBe(30);
    expect(chart.endDay).toBe(60);
    expect(chart.endDate).toBe(addDays(TODAY, 30));
    // Learning (D3 of A3): nothing ahead, the window does not change.
    expect(chart.projectionPending).toBe(true);
    expect(chart.projection).toEqual([]);
    expect(chart.band).toEqual([]);
    const s = chartScale({ width: W, height: H, domainDays: [0, chart.endDay], todayDay: chart.todayDay, trend: chart.trend, raw: chart.raw });
    expect(s?.todayRatio).toBeCloseTo(0.5, 9);
  });

  it('"Tout": from the first weigh-in to the day the projection reaches the target weight', () => {
    const { store, state } = calibratedStore();
    const chart = trackingChart(store, TODAY, TRACKING_RANGE_DAYS.all, state);
    const live = projectionFromToday(store, TODAY, state);
    if (!chart || !live || live.daysToTarget === null) throw new Error('chart');
    expect(chart.startDate).toBe(store.weights[0]?.date);
    expect(chart.todayDay).toBe(daysBetween(chart.startDate, TODAY));
    expect(chart.endDay).toBe(chart.todayDay + Math.min(TRACKING_ALL_MAX_DAYS_AHEAD, live.daysToTarget));
    expect(chart.arrival?.date).toBe(addDays(TODAY, live.daysToTarget));
    expect(chart.arrival?.day).toBe(chart.endDay);
    // The projection is drawn to the arrival, never beyond the window.
    expect(chart.projection[chart.projection.length - 1]?.day).toBe(chart.endDay);
    expect(chart.projection.every((p) => p.day <= chart.endDay)).toBe(true);
  });

  it('"Tout" in maintenance: 30 days after today', () => {
    const { store, state } = calibratedStore(77, 0, makeProfile({ goal: 'maintenance', currentWeightKg: 81, targetWeightKg: 81, weeklyRateTarget: 0 }));
    const chart = trackingChart(store, TODAY, TRACKING_RANGE_DAYS.all, state);
    if (!chart) throw new Error('chart');
    expect(chart.endDay - chart.todayDay).toBe(TRACKING_ALL_DAYS_AHEAD);
    expect(chart.arrival).toBeNull();
    expect(chart.projection.length).toBeGreaterThan(1);
  });

  it('"Auj." and day 0 of the projection are on today, not on the last weigh-in; a dashed join fills the gap (point 1b)', () => {
    // Last weigh-in 3 days ago: A3 drew today and the start of the projection 3 days early.
    const { store, state } = calibratedStore(77, 3);
    const live = projectionFromToday(store, TODAY, state, undefined, 1);
    for (const range of [TRACKING_RANGE_DAYS.month, TRACKING_RANGE_DAYS.all]) {
      const chart = trackingChart(store, TODAY, range, state);
      if (!chart || !live) throw new Error('chart');
      const lastTrend = chart.trend[chart.trend.length - 1];
      if (!lastTrend) throw new Error('trend');
      expect(chart.todayDay - lastTrend.day).toBe(3);
      expect(chart.projection[0]?.day).toBe(chart.todayDay);
      // The display shift in service is kept as is: the projection starts at the height of the last trend point.
      const shift = lastTrend.kg - (live.trajectory[0]?.weightKg ?? Number.NaN);
      expect(chart.projection[0]?.kg).toBeCloseTo(lastTrend.kg, 9);
      expect(chart.projection[5]?.kg).toBeCloseTo((live.trajectory[5]?.weightKg ?? Number.NaN) + shift, 9);
      const s = chartScale({ width: W, height: H, domainDays: [0, chart.endDay], todayDay: chart.todayDay, trend: chart.trend, projection: chart.projection });
      if (!s) throw new Error('scale');
      expect(s.projection[0]?.x).toBeCloseTo(s.x(lastTrend.day), 9);
      expect(s.projection[1]?.x).toBeCloseTo(s.todayX, 9);
    }
  });

  it('the projection is drawn day by day; the plan announcement keeps its own sampling (point 1c)', () => {
    const { store, state } = calibratedStore();
    const chart = trackingChart(store, TODAY, TRACKING_RANGE_DAYS.all, state);
    if (!chart) throw new Error('chart');
    for (let i = 1; i < chart.projection.length; i++) expect((chart.projection[i]?.day ?? 0) - (chart.projection[i - 1]?.day ?? 0)).toBe(1);
    const weekly = projectionFromToday(store, TODAY, state);
    const daily = projectionFromToday(store, TODAY, state, undefined, 1);
    if (!weekly || !daily) throw new Error('projection');
    // Same day of arrival, same weeks, same horizon: only the samples in between are added.
    expect(daily.daysToTarget).toBe(weekly.daysToTarget);
    expect(daily.approximateWeeks).toBe(weekly.approximateWeeks);
    expect(daily.horizonDays).toBe(weekly.horizonDays);
    const sameDays = (list: typeof daily.trajectory) => list.filter((p) => weekly.trajectory.some((w) => w.day === p.day));
    expect(sameDays(daily.trajectory)).toEqual(weekly.trajectory);
    expect(sameDays(daily.lower80)).toEqual(weekly.lower80);
    expect(sameDays(daily.upper80)).toEqual(weekly.upper80);
  });

  it('pauses of the gate are passed as they are, clipped to the window (point 1d)', () => {
    const start = addDays(TODAY, -60);
    const s = storeWith(
      [0, 7, 14, 36, 43, 50, 57].map((d, i) => ({ date: addDays(start, d), kg: 81 - i * 0.2 })),
      start,
    );
    const all = trackingChart(s, TODAY, TRACKING_RANGE_DAYS.all, null);
    expect(all?.pauses).toEqual([{ fromDay: 14, toDay: 36, from: addDays(start, 14), to: addDays(start, 36) }]);
    // "Ce mois-ci" starts 30 days ago, inside the pause: the pause is kept, from before the left edge.
    expect(trackingChart(s, TODAY, TRACKING_RANGE_DAYS.month, null)?.pauses).toEqual([{ fromDay: -16, toDay: 6, from: addDays(start, 14), to: addDays(start, 36) }]);
    // A pause that ended before the window is left out.
    const old = storeWith([0, 20, 50, 57].map((d) => ({ date: addDays(start, d), kg: 81 })), start);
    expect(trackingChart(old, TODAY, TRACKING_RANGE_DAYS.month, null)?.pauses).toEqual([{ fromDay: -10, toDay: 20, from: addDays(start, 20), to: addDays(start, 50) }]);
    expect(trackingChart(old, TODAY, TRACKING_RANGE_DAYS.all, null)?.pauses).toHaveLength(2);
  });

  it('the plan stored in the store is never rewritten by what the chart draws', () => {
    const { store, state } = calibratedStore();
    const before = JSON.stringify(store.plan);
    trackingChart(store, TODAY, 30, state);
    trackingChart(store, TODAY, null, state);
    projectionFromToday(store, TODAY, state, undefined, 1);
    expect(JSON.stringify(store.plan)).toBe(before);
  });

  it('the weigh-in list tells apart two weigh-ins of the same day by their time', () => {
    const rows = recentWeights(reported, 8);
    const todayRows = rows.filter((r) => r.date === TODAY);
    expect(todayRows).toHaveLength(2);
    expect(todayRows.every((r) => r.time !== null)).toBe(true);
    expect(new Set(todayRows.map((r) => r.time)).size).toBe(2);
    expect(rows.find((r) => r.date === addDays(TODAY, -1))?.time).toBeNull();
  });

  it('the text alternative says the window, the pause and where the projection leads (point 1e)', () => {
    const { store, state } = calibratedStore();
    const chart = trackingChart(store, TODAY, TRACKING_RANGE_DAYS.all, state);
    if (!chart) throw new Error('chart');
    const summary = chartSummary(chart, 'metric');
    expect(summary).toMatch(/^Du \d+ \S+ au \d+ \S+ : \d+ pesées, tendance de .* à .* kg, projection du plan : poids cible atteint vers le \d+ \S+\.$/);
    const month = trackingChart(store, TODAY, TRACKING_RANGE_DAYS.month, state);
    if (!month) throw new Error('chart');
    expect(chartSummary(month, 'metric')).toMatch(/projection du plan : .* kg le \d+ \S+\.$/);
    const start = addDays(TODAY, -60);
    const paused = trackingChart(storeWith([0, 7, 14, 36, 43].map((d) => ({ date: addDays(start, d), kg: 81 })), start), TODAY, null, null);
    if (!paused) throw new Error('chart');
    expect(chartSummary(paused, 'metric')).toMatch(/pause du suivi du \d+ \S+ au \d+ \S+/);
    const html = renderToStaticMarkup(
      createElement(WeightChart, { height: H, domainDays: [0, chart.endDay], todayDay: chart.todayDay, trend: chart.trend, raw: chart.raw, projection: chart.projection, band: chart.band, pauses: chart.pauses, label: 'Évolution du poids', summary, axis: { start: '1 sept.', today: 'Auj.', end: '3 mars' } }),
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Évolution du poids"');
    expect(html).toContain(summary);
    expect(html).toContain('chart-axis__today');
    expect(html).toContain('3 mars');
  });

  it('no chart library, and the drawing reads its colours from the theme tokens', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: object; devDependencies: object };
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      expect(/chart|d3|recharts|victory|plotly|echarts/i.test(dep), dep).toBe(false);
    }
    const src = readFileSync('src/components/WeightChart.tsx', 'utf8');
    expect(src).toMatch(/getPropertyValue\('--coral'\)/);
    expect(src).toMatch(/data-theme/);
    expect(src).toMatch(/devicePixelRatio/);
    expect(src).not.toMatch(/<svg/);
  });

  it('the drawing depends on the content of the series, not on the identity of their arrays (point 1f)', () => {
    const src = readFileSync('src/components/WeightChart.tsx', 'utf8');
    expect(src).toMatch(/const dataKey = JSON\.stringify\(/);
    expect(src).toMatch(/\[width, height, dataKey\]/);
    expect(src).toMatch(/\[scale, theme, reveal\]/);
  });
});
