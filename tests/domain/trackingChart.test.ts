/**
 * Suivi chart (A3): the pure scale, the projection joined to the last trend point, and the weigh-in list
 * when a day carries several entries. No rendering here: `chartScale` maps data to pixels on its own.
 */
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WeightChart } from '@/components/WeightChart';
import { chartScale, clipBandFrom, FUTURE_WIDTH_SHARE } from '@/domain/chartScale';
import type { DayPoint } from '@/domain/chartScale';
import { addWeight, completeOnboarding, computeCalibrationState, setAdherence } from '@/domain/engine';
import type { CalibrationState } from '@/domain/engine';
import { projectionFromToday, recentWeights, trackingChart } from '@/domain/views';
import { chartSummary } from '@/screens/Tracking';
import type { WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { addDays } from '@/science/dates';
import { makeProfile } from '../helpers/profiles';

const TODAY = '2026-09-21';
const at = (date: string, time = '08:00') => `${date}T${time}:00.000Z`;
const W = 342;
const H = 168;
const PAD = 8;

function storeWith(weights: Array<{ date: string; kg: number; time?: string }>, start = addDays(TODAY, -1)): WheightyStore {
  const onboarded = completeOnboarding(emptyStore(), makeProfile({ goal: 'loss', currentWeightKg: 81, targetWeightKg: 76, weeklyRateTarget: 0.005 }), start, at(start));
  if (!onboarded.ok) throw new Error(onboarded.reason);
  let s: WheightyStore = { ...onboarded.store, weights: [] };
  for (const w of weights) s = addWeight(s, { date: w.date, weightKg: w.kg }, at(w.date, w.time));
  return s;
}

/** Enough weigh-ins and noted days for the first calibration: without it nothing is drawn ahead. */
function calibratedStore(days = 77): { store: WheightyStore; state: CalibrationState } {
  const start = addDays(TODAY, -days);
  let s = storeWith(
    Array.from({ length: days / 7 + 1 }, (_, i) => ({ date: addDays(start, i * 7), kg: 81 - i * 0.35 })),
    start,
  );
  for (let d = 0; d <= days; d++) s = setAdherence(s, addDays(start, d), 'on_plan');
  const state = computeCalibrationState(s, TODAY, at(TODAY));
  if (!state) throw new Error('state');
  return { store: s, state };
}

describe('chart scale (A3)', () => {
  const trend: DayPoint[] = [
    { day: 0, kg: 81 },
    { day: 1, kg: 81.2 },
  ];
  const projection: DayPoint[] = [
    { day: 0, kg: 81 },
    { day: 7, kg: 80.2 },
    { day: 14, kg: 79.8 },
    { day: 21, kg: 79.5 },
  ];
  const band = projection.map((p) => ({ day: p.day, lo: p.kg - 0.7, hi: p.kg + 0.7 }));

  it('keeps a fixed share of the width for the days ahead, so today never lands on the left edge', () => {
    const s = chartScale({ width: W, height: H, trend, raw: trend, projection, band });
    if (!s) throw new Error('scale');
    // The reported case drew today at 5 % of the width, under the month label.
    expect(s.todayRatio).toBeGreaterThan(0.6);
    expect(s.todayX).toBeCloseTo(PAD + (1 - FUTURE_WIDTH_SHARE) * (W - 2 * PAD), 6);
    expect(s.x(0)).toBeCloseTo(PAD, 6);
    expect(s.x(1)).toBeCloseTo(s.todayX, 6);
    expect(s.x(21)).toBeCloseTo(W - PAD, 6);
    // Continuous and increasing across the junction.
    expect(s.x(0.999)).toBeLessThan(s.x(1));
    expect(s.x(1)).toBeLessThan(s.x(1.001));
  });

  it('joins the projection to the last trend point, and starts the band on that day', () => {
    const s = chartScale({ width: W, height: H, trend, raw: trend, projection, band });
    if (!s) throw new Error('scale');
    const lastTrend = s.trend[s.trend.length - 1];
    expect(s.projection[0]).toEqual(lastTrend);
    // Samples of the plan before the junction are dropped, never drawn back into the past.
    expect(s.projection).toHaveLength(4);
    expect(s.projection.every((p) => p.x >= (lastTrend?.x ?? 0) - 1e-9)).toBe(true);
    expect(s.band.top[0]?.x).toBeCloseTo(s.todayX, 6);
    expect(s.band.bottom[0]?.x).toBeCloseTo(s.todayX, 6);
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
    // A band that starts after the junction is extended flat back to it, so it never floats away.
    expect(clipBandFrom([{ day: 7, lo: 79, hi: 81 }], 1)[0]).toEqual({ day: 1, lo: 79, hi: 81 });
    expect(clipBandFrom([], 1)).toEqual([]);
  });

  it('a single weigh-in draws one point without a degenerate scale', () => {
    const one = chartScale({ width: W, height: H, trend: [{ day: 0, kg: 81 }], raw: [{ day: 0, kg: 81 }] });
    if (!one) throw new Error('scale');
    expect(one.trend).toHaveLength(1);
    expect(one.todayRatio).toBeCloseTo(0.5, 6);
    expect(one.domainKg[1] - one.domainKg[0]).toBeGreaterThan(1);
    expect(Number.isFinite(one.trend[0]?.x ?? Number.NaN)).toBe(true);
    expect(Number.isFinite(one.trend[0]?.y ?? Number.NaN)).toBe(true);
    // With a plan, that single point sits on the junction and the projection still starts on it.
    const withPlan = chartScale({ width: W, height: H, trend: [{ day: 0, kg: 81 }], projection: [{ day: 7, kg: 80.5 }] });
    expect(withPlan?.trend[0]?.x).toBeCloseTo(withPlan?.todayX ?? -1, 6);
    expect(withPlan?.projection[0]).toEqual(withPlan?.trend[0]);
  });

  it('gives the whole width to the history when there is nothing ahead', () => {
    const s = chartScale({ width: W, height: H, trend, raw: trend });
    if (!s) throw new Error('scale');
    expect(s.todayX).toBeCloseTo(W - PAD, 6);
    expect(s.x(0)).toBeCloseTo(PAD, 6);
    expect(s.band.top).toEqual([]);
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
});

describe('Suivi chart data (A3)', () => {
  /** The reported case: first weigh-in yesterday, two more today, 3 month window. */
  const reported = storeWith([
    { date: addDays(TODAY, -1), kg: 81 },
    { date: TODAY, kg: 82, time: '07:10' },
    { date: TODAY, kg: 83, time: '09:40' },
  ]);

  it('draws nothing ahead while Wheighty is still learning', () => {
    const chart = trackingChart(reported, TODAY, 90, computeCalibrationState(reported, TODAY, at(TODAY)));
    if (!chart) throw new Error('chart');
    expect(chart.projectionPending).toBe(true);
    expect(chart.projection).toEqual([]);
    expect(chart.band).toEqual([]);
    // The history then takes the whole width instead of leaving an empty third.
    const s = chartScale({ width: W, height: H, trend: chart.trend, raw: chart.raw });
    expect(s?.todayX).toBeCloseTo(W - PAD, 6);
  });

  it('the 1 month, 3 month and "Tout" windows all place today at the same spot', () => {
    const { store, state } = calibratedStore();
    for (const days of [30, 90, null]) {
      const chart = trackingChart(store, TODAY, days, state);
      if (!chart) throw new Error('chart');
      expect(chart.projectionPending).toBe(false);
      expect(chart.projection.length).toBeGreaterThan(1);
      const s = chartScale({ width: W, height: H, trend: chart.trend, raw: chart.raw, projection: chart.projection, band: chart.band });
      if (!s) throw new Error('scale');
      expect(s.todayRatio).toBeCloseTo((PAD + (1 - FUTURE_WIDTH_SHARE) * (W - 2 * PAD)) / W, 6);
      expect(s.projection[0]).toEqual(s.trend[s.trend.length - 1]);
    }
  });

  it('the projection starts on the current trend weight, not on the weight the plan was built with', () => {
    const { store, state } = calibratedStore();
    const chart = trackingChart(store, TODAY, 90, state);
    const live = projectionFromToday(store, TODAY, state);
    const plan = store.plan;
    if (!chart || !live || !plan) throw new Error('chart');
    const lastTrend = chart.trend[chart.trend.length - 1];
    if (!lastTrend) throw new Error('trend');
    // Day 0 of the fresh simulation is the trend point itself: no step at the junction.
    expect(live.trajectory[0]?.weightKg).toBeCloseTo(lastTrend.kg, 6);
    expect(chart.projection[0]?.day).toBe(lastTrend.day);
    expect(chart.projection[0]?.kg).toBeCloseTo(lastTrend.kg, 6);
    // The stored snapshot still says something else: it was computed for the starting weight, months ago.
    expect(plan.projection.trajectory[0]?.weightKg).not.toBeCloseTo(lastTrend.kg, 1);
    // The 80 % band opens from the junction instead of arriving already several kilos wide.
    const firstBand = chart.band[0];
    const lastBand = chart.band[chart.band.length - 1];
    if (!firstBand || !lastBand) throw new Error('band');
    expect(firstBand.hi - firstBand.lo).toBeLessThan(0.2);
    expect(lastBand.hi - lastBand.lo).toBeGreaterThan(firstBand.hi - firstBand.lo);
    expect(lastBand.hi - lastBand.lo).toBeLessThan(4);
  });

  it('the plan stored in the store is never rewritten by what the chart draws', () => {
    const { store, state } = calibratedStore();
    const before = JSON.stringify(store.plan);
    trackingChart(store, TODAY, 90, state);
    projectionFromToday(store, TODAY, state);
    expect(JSON.stringify(store.plan)).toBe(before);
  });

  it('the weigh-in list tells apart two weigh-ins of the same day by their time', () => {
    const rows = recentWeights(reported, 8);
    const todayRows = rows.filter((r) => r.date === TODAY);
    expect(todayRows).toHaveLength(2);
    expect(todayRows.every((r) => r.time !== null)).toBe(true);
    expect(new Set(todayRows.map((r) => r.time)).size).toBe(2);
    // A day with a single weigh-in keeps a plain label.
    expect(rows.find((r) => r.date === addDays(TODAY, -1))?.time).toBeNull();
  });

  it('the chart carries a text alternative for screen readers', () => {
    const { store, state } = calibratedStore();
    const chart = trackingChart(store, TODAY, 90, state);
    if (!chart) throw new Error('chart');
    const summary = chartSummary(chart, 'metric');
    expect(summary).toMatch(/pesées depuis le/);
    expect(summary).toMatch(/tendance de .* à .* kg/);
    expect(summary).toMatch(/projection du plan à .* kg dans \d+ jours/);
    const html = renderToStaticMarkup(createElement(WeightChart, { height: H, trend: chart.trend, raw: chart.raw, projection: chart.projection, band: chart.band, label: 'Évolution du poids', summary, axis: { start: 'Sept.', today: 'Auj.', future: 'Prévu' } }));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Évolution du poids"');
    expect(html).toContain(summary);
    expect(html).toContain('chart-axis__today');
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
});
