import { describe, expect, it } from 'vitest';
import { confidenceLevel, convolveGridProbabilities, evaluateGate, fitCalibration, gridQuantile, offsetGrid, shouldSurfaceRecalibration, studentTLogDensityKernel, summarizeGridProbabilities } from '@/science/calibration';
import { CALIBRATION_STRUCTURAL_SD_KCAL } from '@/science/constants';
import type { GateStatus } from '@/science/calibration';
import { addDays } from '@/science/dates';
import { computeTrend, ewmaAlpha, summarizeTrend } from '@/science/trend';
import type { DailyLog, UserProfile, WeightEntry } from '@/science/types';
import { createRng } from '../helpers/random';
import { IDEAL_RECOVERY_USERS, runIdealRecovery } from '../helpers/idealRecovery';
import { simulateSyntheticUser, START_DATE } from '../helpers/syntheticUser';
import type { SimulationSettings } from '../helpers/syntheticUser';
import { formatMetrics, recoveryMetrics } from '../helpers/mismatchWorld';

const w = (date: string, kg: number, id = date): WeightEntry => ({ id, date, weightKg: kg, createdAt: `${date}T07:00:00Z` });
const log = (date: string, adherence?: DailyLog['adherence']): DailyLog => ({ date, calorieTargetForDay: 2000, stepTargetForDay: 8000, ...(adherence ? { adherence } : {}) });

describe('trend (05 s5)', () => {
  it('EWMA with 7-day half-life on irregular dates', () => {
    expect(ewmaAlpha(7)).toBeCloseTo(0.5, 12);
    const t = computeTrend([w('2026-01-01', 80), w('2026-01-08', 78)]);
    expect(t[1]?.trendKg).toBeCloseTo(79, 12);
    const t3 = computeTrend([w('2026-01-01', 80), w('2026-01-02', 78)]);
    expect(t3[1]?.trendKg).toBeCloseTo(80 - 2 * (1 - Math.exp(-Math.LN2 / 7)), 12);
  });

  it('keeps raw weights, dedupes by date, and needs 7 days for a readable rate', () => {
    const entries = [w('2026-01-01', 80), w('2026-01-03', 79.6), { ...w('2026-01-03', 79.4, 'b'), createdAt: '2026-01-03T09:00:00Z' }];
    const t = computeTrend(entries);
    expect(t).toHaveLength(2);
    expect(t[1]?.rawKg).toBe(79.4);
    expect(summarizeTrend(t).readable).toBe(false);
    const long = computeTrend([w('2026-01-01', 80), w('2026-01-04', 79.7), w('2026-01-08', 79.3), w('2026-01-11', 79.1)]);
    const s = summarizeTrend(long);
    expect(s.readable).toBe(true);
    expect(s.weeklyRateKg).toBeLessThan(0);
  });
});

describe('first recalibration gate (05 s8)', () => {
  const dates = (n: number, every: number) => Array.from({ length: n }, (_, i) => addDays('2026-01-01', i * every));

  it('requires 5 weigh-ins, 14 days, 4 clean weigh-ins and 50 percent adherence info', () => {
    const weights = dates(5, 4).map((d, i) => w(d, 80 - i * 0.1));
    const logs = Array.from({ length: 17 }, (_, i) => log(addDays('2026-01-01', i), i % 2 === 0 ? 'on_plan' : undefined));
    const g = evaluateGate(weights, logs);
    expect(g.spanDays).toBe(16);
    expect(g.criteria).toEqual({ enoughWeighIns: true, enoughSpan: true, enoughCleanWeighIns: true, enoughAdherenceInfo: true });
    expect(g.met).toBe(true);
  });

  it('is not met by the prototype rule of 3 weigh-ins over 2 weeks', () => {
    const weights = [w('2026-01-01', 80), w('2026-01-08', 79.8), w('2026-01-15', 79.5)];
    const logs = Array.from({ length: 15 }, (_, i) => log(addDays('2026-01-01', i), 'on_plan'));
    expect(evaluateGate(weights, logs).met).toBe(false);
  });

  it('fails when windows are dominated by major deviations or adherence is unreported', () => {
    const weights = dates(6, 3).map((d) => w(d, 80));
    const major = Array.from({ length: 16 }, (_, i) => log(addDays('2026-01-01', i), 'major_deviation'));
    const gMajor = evaluateGate(weights, major);
    expect(gMajor.cleanWeighInCount).toBe(1);
    expect(gMajor.met).toBe(false);
    const unreported = Array.from({ length: 16 }, (_, i) => log(addDays('2026-01-01', i)));
    expect(evaluateGate(weights, unreported).criteria.enoughAdherenceInfo).toBe(false);
  });
});

describe('confidence levels (05 s11, 06 s14)', () => {
  const gate = (overrides: Partial<GateStatus>): GateStatus => ({
    met: true,
    weighInCount: 10,
    spanDays: 30,
    cleanWeighInCount: 10,
    adherenceCoverage: 1,
    majorDeviationFraction: 0,
    trackedDays: 30,
    criteria: { enoughWeighIns: true, enoughSpan: true, enoughCleanWeighIns: true, enoughAdherenceInfo: true },
    ...overrides,
  });

  it('nobody is above low before the gate', () => {
    expect(confidenceLevel(gate({ met: false }), 100)).toBe('low');
    expect(confidenceLevel(gate({ spanDays: 13 }), 100)).toBe('low');
  });

  it('width thresholds map to medium, good, high', () => {
    expect(confidenceLevel(gate({}), 520)).toBe('medium');
    expect(confidenceLevel(gate({}), 500)).toBe('good');
    expect(confidenceLevel(gate({}), 301)).toBe('good');
    expect(confidenceLevel(gate({}), 300)).toBe('high');
  });

  it('high requires 28 days and 8 valid weigh-ins and < 25 percent major days', () => {
    expect(confidenceLevel(gate({ spanDays: 27 }), 250)).not.toBe('high');
    expect(confidenceLevel(gate({ weighInCount: 7 }), 250)).not.toBe('high');
    expect(confidenceLevel(gate({ majorDeviationFraction: 0.25 }), 250)).not.toBe('high');
  });

  it('narrower interval never lowers confidence when data gates are unchanged', () => {
    const order = ['low', 'medium', 'good', 'high'];
    for (const g of [gate({}), gate({ spanDays: 20 }), gate({ weighInCount: 6 })]) {
      let prev = -1;
      for (let width = 900; width >= 50; width -= 10) {
        const level = order.indexOf(confidenceLevel(g, width));
        expect(level).toBeGreaterThanOrEqual(prev);
        prev = level;
      }
    }
  });

  it('adding poor adherence can reduce confidence', () => {
    expect(confidenceLevel(gate({ majorDeviationFraction: 0 }), 250)).toBe('high');
    expect(confidenceLevel(gate({ majorDeviationFraction: 0.4 }), 250)).toBe('good');
  });
});

describe('posterior mechanics (05 s9-s10)', () => {
  it('grid spans -1200..+1200 by 5 kcal/day', () => {
    const g = offsetGrid();
    expect(g[0]).toBe(-1200);
    expect(g[g.length - 1]).toBe(1200);
    expect(g).toHaveLength(481);
  });

  it('Student-t kernel is heavier tailed than a Gaussian with the same scale', () => {
    const t = studentTLogDensityKernel(3, 4, 0.6);
    const gaussian = -0.5 * (3 / 0.6) ** 2;
    expect(t).toBeGreaterThan(gaussian);
  });

  it('grid quantiles are monotone and centred for a symmetric distribution', () => {
    const offsets = offsetGrid();
    const raw = offsets.map((o) => Math.exp(-0.5 * (o / 200) ** 2));
    const sum = raw.reduce((a, b) => a + b, 0);
    const p = raw.map((x) => x / sum);
    expect(gridQuantile(offsets, p, 0.5)).toBeCloseTo(0, 0);
    expect(gridQuantile(offsets, p, 0.9)).toBeCloseTo(1.2816 * 200, -1);
    expect(gridQuantile(offsets, p, 0.1)).toBeLessThan(gridQuantile(offsets, p, 0.9));
  });

  it('structural floor convolution keeps mass and centre, and adds its variance (D-33)', () => {
    const offsets = offsetGrid();
    const raw = offsets.map((o) => Math.exp(-0.5 * ((o - 100) / 60) ** 2));
    const sum = raw.reduce((a, b) => a + b, 0);
    const p = raw.map((x) => x / sum);
    const before = summarizeGridProbabilities(offsets, p);
    const q = convolveGridProbabilities(offsets, p, 50);
    const after = summarizeGridProbabilities(offsets, q);
    expect(q.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(after.meanKcal).toBeCloseTo(before.meanKcal, 6);
    expect(after.sdKcal ** 2).toBeCloseTo(before.sdKcal ** 2 + 50 ** 2, -1);
    expect(after.interval80[1] - after.interval80[0]).toBeGreaterThan(before.interval80[1] - before.interval80[0]);
  });

  it('the fitted posterior is the information posterior widened by the structural floor', () => {
    const profile: UserProfile = { ageYears: 30, sexForEquation: 'female', heightCm: 165, currentWeightKg: 65, averageSteps7d: 7000, walkingPace: 'normal', occupation: 'seated', activities: [], goal: 'loss', targetWeightKg: 60, weeklyRateTarget: 0.005 };
    const settings: SimulationSettings = { trueOffsetKcal: -200, weighEveryDays: 1, minorDeviationFraction: 0, majorDeviationFraction: 0, unreportedFraction: 0, stepLogProbability: 1, days: 60, noiseScaleKg: 0.3, minorExtraKcal: [150, 350], majorExtraKcal: [700, 1200] };
    const input = simulateSyntheticUser(profile, settings, createRng(9)).calibrationInputFor(60);
    const fit = fitCalibration(input);
    const raw = fitCalibration({ ...input, structuralSdKcal: 0 });
    expect(fit?.structuralSdKcal).toBe(CALIBRATION_STRUCTURAL_SD_KCAL);
    expect(raw?.posterior).toEqual(fit?.informationPosterior);
    expect((fit?.posterior.sdKcal ?? 0) ** 2).toBeCloseTo((raw?.posterior.sdKcal ?? 0) ** 2 + CALIBRATION_STRUCTURAL_SD_KCAL ** 2, -2);
  });

  it('returns the prior when there is nothing to learn, and is deterministic', () => {
    const profile: UserProfile = { ageYears: 30, sexForEquation: 'female', heightCm: 165, currentWeightKg: 65, averageSteps7d: 7000, walkingPace: 'normal', occupation: 'seated', activities: [], goal: 'loss', targetWeightKg: 60, weeklyRateTarget: 0.005 };
    const settings: SimulationSettings = { trueOffsetKcal: 200, weighEveryDays: 2, minorDeviationFraction: 0, majorDeviationFraction: 0, unreportedFraction: 0, stepLogProbability: 1, days: 30, noiseScaleKg: 0.3, minorExtraKcal: [150, 350], majorExtraKcal: [700, 1200] };
    const run = simulateSyntheticUser(profile, settings, createRng(5));
    const a = fitCalibration(run.calibrationInputFor(30));
    const b = fitCalibration(run.calibrationInputFor(30));
    expect(a?.posterior.medianKcal).toBe(b?.posterior.medianKcal);
    expect(fitCalibration({ ...run.calibrationInputFor(30), weights: [] })).toBeNull();
  });
});

describe('calibration simulation recovery at 28 and 42 days (06 s13, release blocking)', () => {
  const r = runIdealRecovery([28, 42]);
  const m28 = recoveryMetrics(r.rows[28] ?? []);
  const m42 = recoveryMetrics(r.rows[42] ?? []);

  it('uses at least 8 usable weights after 28 days', () => {
    expect(r.rows[28]?.length).toBe(IDEAL_RECOVERY_USERS);
    expect(Math.min(...(r.rows[28] ?? []).map((row) => row.weights))).toBeGreaterThanOrEqual(8);
  });

  it(`28 days vs apparent maintenance: median absolute error <= 125 kcal/day (${formatMetrics(m28)})`, () => {
    expect(m28.medianAbsErrorKcal).toBeLessThanOrEqual(125);
  });

  it('28 days: 80 percent interval covers the apparent offset in >= 70 percent of users', () => {
    expect(m28.coverage80).toBeGreaterThanOrEqual(0.7);
  });

  it('28 days: 95 percent interval covers the apparent offset in >= 90 percent of users', () => {
    expect(m28.coverage95).toBeGreaterThanOrEqual(0.9);
  });

  it(`42 days: same criteria hold (${formatMetrics(m42)})`, () => {
    expect(m42.medianAbsErrorKcal).toBeLessThanOrEqual(125);
    expect(m42.coverage80).toBeGreaterThanOrEqual(0.7);
    expect(m42.coverage95).toBeGreaterThanOrEqual(0.9);
  });

  it(`(reported only) 42 days vs metabolic offset: ${formatMetrics(recoveryMetrics(r.metabolicRows[42] ?? []))}`, () => {
    expect(r.metabolicRows[42]?.length).toBe(IDEAL_RECOVERY_USERS);
  });
});

describe('recalibration surfacing (05 s12)', () => {
  const metGate = { met: true } as GateStatus;
  it('surfaces on >= 75 kcal change, >= 10 percent narrowing, or >= 40 kcal after 7 days', () => {
    const first = { tdeeKcal: 2400, interval80Width: 600, surfacedOn: null };
    expect(shouldSurfaceRecalibration(metGate, { tdeeKcal: 2475, interval80Width: 600 }, first, '2026-01-11')).toBe(true);
    expect(shouldSurfaceRecalibration(metGate, { tdeeKcal: 2420, interval80Width: 540 }, first, '2026-01-11')).toBe(true);
    expect(shouldSurfaceRecalibration(metGate, { tdeeKcal: 2440, interval80Width: 590 }, first, '2026-01-11')).toBe(true);
    expect(shouldSurfaceRecalibration(metGate, { tdeeKcal: 2420, interval80Width: 590 }, first, '2026-01-11')).toBe(false);
    const last = { tdeeKcal: 2400, interval80Width: 600, surfacedOn: '2026-01-10' };
    expect(shouldSurfaceRecalibration(metGate, { tdeeKcal: 2475, interval80Width: 600 }, last, '2026-01-17')).toBe(true);
    expect(shouldSurfaceRecalibration(metGate, { tdeeKcal: 2420, interval80Width: 540 }, last, '2026-01-17')).toBe(true);
    expect(shouldSurfaceRecalibration(metGate, { tdeeKcal: 2440, interval80Width: 590 }, last, '2026-01-17')).toBe(true);
    expect(shouldSurfaceRecalibration(metGate, { tdeeKcal: 2430, interval80Width: 590 }, last, '2026-01-17')).toBe(false);
    expect(shouldSurfaceRecalibration({ met: false } as GateStatus, { tdeeKcal: 3000, interval80Width: 100 }, last, '2026-02-01')).toBe(false);
  });

  it('never surfaces twice within 7 days, even on a large change (D-34)', () => {
    const last = { tdeeKcal: 2400, interval80Width: 600, surfacedOn: '2026-01-10' };
    for (const today of ['2026-01-10', '2026-01-11', '2026-01-16']) {
      expect(shouldSurfaceRecalibration(metGate, { tdeeKcal: 2800, interval80Width: 200 }, last, today)).toBe(false);
    }
    expect(shouldSurfaceRecalibration(metGate, { tdeeKcal: 2800, interval80Width: 200 }, last, '2026-01-17')).toBe(true);
  });
});

it('synthetic start date is a valid ISO date', () => {
  expect(START_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
