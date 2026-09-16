/** Logging imperfection model of the intake benchmark (handoff prompt 26): bias, coverage, determinism, no leakage. */
import { describe, expect, it } from 'vitest';
import { fitCalibration } from '@/science/calibration';
import { CALIBRATION_STRUCTURAL_SD_KCAL } from '@/science/constants';
import { addDays } from '@/science/dates';
import { BASE, PROFILES } from '../helpers/mismatchBenchmark';
import { START_DATE, simulateMismatchUser } from '../helpers/mismatchWorld';
import {
  PERFECT_LOGGING,
  applyImperfection,
  armApparentOffsetKcal,
  assumedIntakeKcal,
  drawLogging,
  observableLoggingSdKcal,
  withLoggedIntake,
  withLoggingSigma,
} from '../helpers/intakeLogging';
import { createRng } from '../helpers/random';

const profile = PROFILES[0]!;
const world = (seed: number, extra = {}) => simulateMismatchUser(profile, { ...BASE, days: 42, trueOffsetKcal: 150, weighEveryDays: 1, hiddenIntakeDayFraction: 0.15, ...extra }, createRng(seed));

describe('logging imperfection model', () => {
  it('applies the systematic bias multiplicatively and exactly without residual noise', () => {
    const intake = [2000, 1800, 2500];
    const draws = drawLogging(3, createRng(1));
    expect(applyImperfection(intake, draws, { underReportBias: -0.2, dailyCoverage: 1, residualNoiseSd: 0 })).toEqual([1600, 1440, 2000]);
  });

  it('keeps the mean logging error equal to the bias when residual noise is added', () => {
    const days = 20_000;
    const intake = new Array<number>(days).fill(2000);
    const logged = applyImperfection(intake, drawLogging(days, createRng(2)), { underReportBias: -0.1, dailyCoverage: 1, residualNoiseSd: 0.08 }) as number[];
    const meanRatio = logged.reduce((s, v) => s + v / 2000, 0) / days;
    const sd = Math.sqrt(logged.reduce((s, v) => s + (v / 2000 - meanRatio) ** 2, 0) / days);
    expect(meanRatio).toBeCloseTo(0.9, 2);
    expect(sd).toBeCloseTo(0.9 * 0.08, 2);
  });

  it('respects the daily coverage and nests coverage masks', () => {
    const days = 20_000;
    const intake = new Array<number>(days).fill(2000);
    const draws = drawLogging(days, createRng(3));
    const at = (c: number) => applyImperfection(intake, draws, { underReportBias: 0, dailyCoverage: c, residualNoiseSd: 0.08 });
    const share = (l: Array<number | null>) => l.filter((v) => v !== null).length / days;
    expect(share(at(1))).toBe(1);
    expect(share(at(0.85))).toBeCloseTo(0.85, 1);
    expect(share(at(0.7))).toBeCloseTo(0.7, 1);
    const low = at(0.7);
    const high = at(0.85);
    expect(low.every((v, d) => v === null || high[d] === v)).toBe(true);
  });

  it('is deterministic for a seed and differs across seeds', () => {
    expect(drawLogging(30, createRng(9))).toEqual(drawLogging(30, createRng(9)));
    expect(drawLogging(30, createRng(9))).not.toEqual(drawLogging(30, createRng(10)));
  });

  it('leaves the simulated world and the arm A input unchanged', () => {
    const a = world(77);
    const b = world(77);
    expect(b.calibrationInputFor(42)).toEqual(a.calibrationInputFor(42));
    expect(b.trueIntakeKcal).toEqual(a.trueIntakeKcal);
  });
});

describe('arm inputs handed to the estimator', () => {
  it('only daily logs change; the estimator never receives the bias or the true intake', () => {
    const run = world(11);
    const base = run.calibrationInputFor(42);
    const logged = applyImperfection(run.trueIntakeKcal, drawLogging(42, createRng(12)), { underReportBias: -0.2, dailyCoverage: 0.7, residualNoiseSd: 0.08 });
    const c = withLoggedIntake(base, START_DATE, logged);
    const { dailyLogs: _a, ...restBase } = base;
    const { dailyLogs: _c, ...restC } = c;
    expect(restC).toEqual(restBase);
    expect(c.structuralSdKcal).toBeUndefined();
    c.dailyLogs.forEach((log, d) => {
      const v = logged[d];
      if (v === null || v === undefined) expect(log).toEqual(base.dailyLogs[d]);
      else expect(log).toMatchObject({ calorieTargetForDay: v, adherence: 'on_plan', date: addDays(START_DATE, d) });
    });
  });

  it('a perfect log makes the arm apparent truth equal to the metabolic truth', () => {
    const run = world(21);
    const input = withLoggedIntake(run.calibrationInputFor(42), START_DATE, applyImperfection(run.trueIntakeKcal, drawLogging(42, createRng(22)), PERFECT_LOGGING));
    const truth = armApparentOffsetKcal(run.windowMeanOffsetKcal(42), run.trueIntakeKcal, assumedIntakeKcal(input, START_DATE, 42), 42);
    expect(truth).toBeCloseTo(run.windowMeanOffsetKcal(42), 6);
  });

  it('arm A apparent truth equals the documented apparent offset (D-31)', () => {
    const run = world(31);
    const base = run.calibrationInputFor(42);
    expect(armApparentOffsetKcal(run.windowMeanOffsetKcal(42), run.trueIntakeKcal, assumedIntakeKcal(base, START_DATE, 42), 42)).toBeCloseTo(run.apparentOffsetKcal(42), 6);
  });

  it('the sensitivity sigma uses observables only and widens the structural floor in quadrature', () => {
    const logged = [2000, null, 1800, null];
    expect(observableLoggingSdKcal(logged, 0.1)).toBeCloseTo(0.1 * 1900 * 0.5, 6);
    const run = world(41);
    const input = withLoggingSigma(run.calibrationInputFor(42), 120);
    expect(input.structuralSdKcal).toBeCloseTo(Math.hypot(CALIBRATION_STRUCTURAL_SD_KCAL, 120), 9);
    expect(fitCalibration(input)).not.toBeNull();
  });

  it('the supplementary personal-target world eats target + shift and declares the chosen adherence', () => {
    const run = simulateMismatchUser(profile, { ...BASE, days: 28, trueOffsetKcal: 0, weighEveryDays: 1, minorDeviationFraction: 0, majorDeviationFraction: 0, unreportedFraction: 0, plannedIntakeShiftKcal: -270, shiftDeclaredAs: 'major_deviation' }, createRng(5));
    const input = run.calibrationInputFor(28);
    input.dailyLogs.forEach((log, d) => {
      expect(run.trueIntakeKcal[d]).toBeCloseTo(log.calorieTargetForDay - 270, 6);
      expect(log.adherence).toBe('major_deviation');
    });
    expect(run.apparentOffsetKcal(28)).toBeCloseTo(run.windowMeanOffsetKcal(28) + 270, 6);
  });
});
