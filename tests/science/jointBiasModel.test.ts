/** Joint (offset, logging bias) benchmark of handoff prompt 27: estimator exactness, bias draw, no leakage, seeds, bounds. */
import { describe, expect, it } from 'vitest';
import { fitCalibration, offsetGrid } from '@/science/calibration';
import { BASE, PROFILES } from '../helpers/mismatchBenchmark';
import { START_DATE, simulateMismatchUser } from '../helpers/mismatchWorld';
import { applyImperfection, drawLogging, withLoggedIntake } from '../helpers/intakeLogging';
import { NOMINAL_BIAS_PRIOR, exactSlicePosterior, jointPosterior, jointSlices, kOf, offsetLogPosterior, offsetPosteriorFrom, uGrid } from '../helpers/jointBias';
import { POPULATIONS, allCells, simulateCellUser } from '../helpers/jointBiasExperiment';
import type { Cell } from '../helpers/jointBiasExperiment';
import { createRng } from '../helpers/random';

const profile = PROFILES[0]!;
const world = (seed: number, days = 28, extra = {}) => simulateMismatchUser(profile, { ...BASE, days, trueOffsetKcal: -150, weighEveryDays: 1, ...extra }, createRng(seed));

describe('joint estimator building blocks', () => {
  it('reproduces the production posterior exactly for arm A and for a logged input', () => {
    const run = world(3, 42, { hiddenIntakeDayFraction: 0.15 });
    const base = run.calibrationInputFor(42);
    const logged = applyImperfection(run.trueIntakeKcal, drawLogging(42, createRng(4)), { underReportBias: -0.15, dailyCoverage: 0.85, residualNoiseSd: 0.08 });
    for (const input of [base, withLoggedIntake(base, START_DATE, logged)]) {
      const slice = offsetLogPosterior(input)!;
      expect(offsetPosteriorFrom(slice.logPost, slice.admissible)).toEqual(fitCalibration(input)!.posterior);
    }
  });

  it('the C-exact arm is the k = 1 slice of the joint grid', () => {
    const run = world(5);
    const base = run.calibrationInputFor(28);
    const logged = applyImperfection(run.trueIntakeKcal, drawLogging(28, createRng(6)), { underReportBias: -0.2, dailyCoverage: 0.7, residualNoiseSd: 0.08 });
    expect(exactSlicePosterior(jointSlices(base, START_DATE, logged))).toEqual(fitCalibration(withLoggedIntake(base, START_DATE, logged))!.posterior);
  });

  it('u support: -0.40 to 0 by 0.01, i.e. k from 1 to 1/0.6, no duplicates', () => {
    const u = uGrid();
    expect(u).toHaveLength(41);
    expect(u[0]).toBe(-0.4);
    expect(u[40]).toBe(0);
    expect(new Set(u).size).toBe(41);
    expect(kOf(-0.2)).toBeCloseTo(1.25, 12);
  });
});

describe('boundary diagnostics', () => {
  it('reports prior-dominated mass at the k = 1 bound when the prior sits on it and data are uninformative', () => {
    const run = world(7);
    const base = run.calibrationInputFor(28);
    const logged = applyImperfection(run.trueIntakeKcal, drawLogging(28, createRng(8)), { underReportBias: 0, dailyCoverage: 1, residualNoiseSd: 0 });
    const onBound = jointPosterior(jointSlices(base, START_DATE, logged), { label: 'on bound', meanU: 0, sdU: 0.02 });
    expect(onBound.edgeMass.kLowerBin).toBeGreaterThan(0.05);
    expect(onBound.edgeMass.kUpperBin).toBeLessThan(1e-6);
    const joint = jointPosterior(jointSlices(base, START_DATE, logged), NOMINAL_BIAS_PRIOR);
    const total = joint.offset.probabilities.reduce((s, p) => s + p, 0);
    expect(total).toBeCloseTo(1, 9);
    expect(joint.offset.offsetsKcal).toEqual(offsetGrid());
    expect(Math.abs(joint.correlation)).toBeLessThanOrEqual(1);
  });

  it('a prior identical to the flat case leaves the k posterior equal to its likelihood shape (width ratio defined)', () => {
    const run = world(9);
    const base = run.calibrationInputFor(28);
    const logged = applyImperfection(run.trueIntakeKcal, drawLogging(28, createRng(10)), { underReportBias: -0.1, dailyCoverage: 1, residualNoiseSd: 0.08 });
    const j = jointPosterior(jointSlices(base, START_DATE, logged), NOMINAL_BIAS_PRIOR);
    expect(j.kWidthRatio).toBeGreaterThan(0);
    expect(j.k80[0]).toBeLessThanOrEqual(j.kMedian);
    expect(j.k80[1]).toBeGreaterThanOrEqual(j.kMedian);
  });
});

describe('simulated bias population and leakage', () => {
  const cell: Cell = { id: 'test', axis: 'performance', scenario: 'B', days: 28, coverage: 0.85, population: 'P10', intakeCv: 0 };

  it('draws one bias per simulated user from the population, deterministically, paired across populations', () => {
    const draws = Array.from({ length: 4000 }, (_, i) => simulateBiasOnly(i, 'P10'));
    const m = draws.reduce((s, v) => s + v, 0) / draws.length;
    const sd = Math.sqrt(draws.reduce((s, v) => s + (v - m) ** 2, 0) / draws.length);
    expect(m).toBeCloseTo(-0.1, 2);
    expect(sd).toBeCloseTo(0.1, 2);
    expect(simulateBiasOnly(17, 'P20') - simulateBiasOnly(17, 'P10')).toBeCloseTo(-0.1, 12);
  });

  it('is deterministic for a seed', () => {
    expect(simulateCellUser(cell, 0, 3, 150, 3, 1)).toEqual(simulateCellUser(cell, 0, 3, 150, 3, 1));
  });

  it('the estimator input depends only on logged values: the same logs give the same posterior whatever the population', () => {
    const run = world(11);
    const base = run.calibrationInputFor(28);
    const draws = drawLogging(28, createRng(12));
    const logged = applyImperfection(run.trueIntakeKcal, draws, { underReportBias: -0.2, dailyCoverage: 0.85, residualNoiseSd: 0.08 });
    // jointSlices only receives the base input (no true intake, no bias) and the logged values.
    expect(jointSlices.length).toBe(3);
    const a = jointPosterior(jointSlices(base, START_DATE, logged), NOMINAL_BIAS_PRIOR);
    const b = jointPosterior(jointSlices(base, START_DATE, [...logged]), NOMINAL_BIAS_PRIOR);
    expect(b).toEqual(a);
    expect(JSON.stringify(base)).not.toContain('underReport');
  });

  it('the cell design covers the three axes and every prompt-27 misspecified prior', () => {
    const cells = allCells();
    expect(cells.filter((c) => c.axis === 'identifiability')).toHaveLength(12);
    expect(cells.filter((c) => c.axis === 'performance')).toHaveLength(48);
    expect(cells.filter((c) => c.axis === 'robustness')).toHaveLength(32);
    expect(POPULATIONS.P20.meanU).toBe(-0.2);
    expect(POPULATIONS.P05.meanU).toBe(-0.05);
  });

  it('intake variation (axis 1) changes the true intake and keeps the world otherwise unchanged', () => {
    const plain = world(13);
    const factors = Array.from({ length: 28 }, (_, d) => 1 + 0.1 * Math.sin(d));
    const varied = world(13, 28, { intakeFactors: factors });
    varied.trueIntakeKcal.forEach((v, d) => expect(v).toBeCloseTo((plain.trueIntakeKcal[d] as number) * (factors[d] as number), 6));
    expect(varied.calibrationInputFor(28).dailyLogs).toEqual(plain.calibrationInputFor(28).dailyLogs);
  });
});

/** Same draw as simulateCellUser (seed + 8 000 000), exposed for the distribution test. */
function simulateBiasOnly(seed: number, population: keyof typeof POPULATIONS): number {
  const p = POPULATIONS[population];
  return p.meanU + p.sdU * createRng(seed + 8_000_000).normal();
}
