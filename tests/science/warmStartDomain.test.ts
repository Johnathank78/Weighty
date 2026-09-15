/**
 * Neutral warm-start fix (IMPLEMENTATION_NOTES D-28): grid contract between warm start and calibration,
 * loud sensitivity access, exclusion of offsets outside the Hall admissible domain, extreme valid profiles.
 */
import { describe, expect, it } from 'vitest';
import { warmStartFor } from '@/domain/engine';
import { assessBaseline, planContextFrom } from '@/science/assessment';
import { fitCalibration, offsetGrid } from '@/science/calibration';
import { HALL_MIN_BASELINE_INTAKE_KCAL, HALL_ZETA_CI_MG_PER_DAY, HALL_ZETA_NA_MG_PER_L_DAY } from '@/science/constants';
import { baselineCarbFractionFor } from '@/science/goals';
import { initializeHall, simulateHall } from '@/science/hall/model';
import { historicalLikelihood, populationPriorLogDensity, valueAtOffset, warmStartPosterior } from '@/science/warmStart';
import type { WarmStartModelInput } from '@/science/warmStart';
import type { HistoricalIntakeEvidence, UserProfile } from '@/science/types';
import { simulateSyntheticUser } from '../helpers/syntheticUser';
import { createRng } from '../helpers/random';
import { makeProfile } from '../helpers/profiles';

const TODAY = '2026-09-14';
const evidence = (kcal: number, days: number, start: number, end: number): HistoricalIntakeEvidence => ({ evidenceVersion: 1, recordedOn: TODAY, averageCaloriesKcal: kcal, durationDays: days, startWeightKg: start, endWeightKg: end, trackingQuality: 'high', activityComparable: true });
const CASE_A = makeProfile({ sexForEquation: 'female', ageYears: 24, heightCm: 155, currentWeightKg: 68, averageSteps7d: 9400, occupation: 'seated', activities: [{ type: 'strength', sessionsPerWeek: 5, durationMin: 55, intensity: 'moderate' }], goal: 'loss', targetWeightKg: 62, weeklyRateTarget: 0.01 });

describe('grid contract between warm start and calibration', () => {
  it('the historical log-likelihood is aligned with offsetGrid() and the population prior', () => {
    const w = warmStartFor(CASE_A, evidence(1450, 14, 68, 68), TODAY);
    expect(w.likelihood.logLikelihood).toHaveLength(offsetGrid().length);
    expect(w.likelihood.predictedChangeKg).toHaveLength(offsetGrid().length);
    expect(populationPriorLogDensity(277)).toHaveLength(offsetGrid().length);
    expect(w.posterior.offsetsKcal).toEqual(offsetGrid());
  });

  it('calibration throws explicitly on a misaligned historical log-likelihood', () => {
    const run = simulateSyntheticUser(CASE_A, { trueOffsetKcal: 0, weighEveryDays: 2, minorDeviationFraction: 0, majorDeviationFraction: 0, unreportedFraction: 0, stepLogProbability: 1, days: 21, noiseScaleKg: 0.3, minorExtraKcal: [150, 350], majorExtraKcal: [700, 1200] }, createRng(11));
    const input = run.calibrationInputFor(21);
    const aligned = new Array<number>(offsetGrid().length).fill(0);
    expect(fitCalibration({ ...input, historicalLogLikelihood: aligned })).not.toBeNull();
    expect(() => fitCalibration({ ...input, historicalLogLikelihood: aligned.slice(1) })).toThrow('historicalLogLikelihood must align with offsetGrid()');
    expect(() => fitCalibration({ ...input, historicalLogLikelihood: [...aligned, 0] })).toThrow('historicalLogLikelihood must align with offsetGrid()');
  });
});

describe('sensitivity access fails loudly', () => {
  const offsets = [-10, -5, 0, 5, 10];
  const values = [0.2, 0.1, 0, Number.NaN, -0.2];

  it('reads a present offset exactly', () => {
    expect(valueAtOffset(offsets, values, -5)).toBe(0.1);
  });

  it('throws instead of returning NaN when the offset is missing or excluded', () => {
    expect(() => valueAtOffset(offsets, values, 100)).toThrow('missing from the offset support');
    expect(() => valueAtOffset(offsets, values, 5)).toThrow('excluded from the offset support');
  });
});

describe('exclusion of offsets outside the Hall admissible domain (B1)', () => {
  // Artificial low population TDEE so that part of the grid is inadmissible: NASEM + offset <= 1 kcal/day.
  const input: WarmStartModelInput = { sex: 'female', ageYears: 40, heightCm: 160, populationTdeeAtStartKcal: 1000, reeAtStartKcal: 900, baselineCarbFraction: 0.5, priorSigmaKcal: 241, evidence: evidence(900, 28, 60, 59.5) };
  const expectedExcluded = offsetGrid().filter((o) => input.populationTdeeAtStartKcal + o <= HALL_MIN_BASELINE_INTAKE_KCAL).length;

  it('warm start: excluded points are counted, never simulated, and carry no probability', () => {
    expect(expectedExcluded).toBe(41);
    const l = historicalLikelihood(input);
    expect(l.hallDomain?.excludedOffsetCount).toBe(expectedExcluded);
    expect(l.hallDomain?.minAdmissibleBaselineIntakeKcal).toBe(HALL_MIN_BASELINE_INTAKE_KCAL);
    const ll = l.logLikelihood as number[];
    const pred = l.predictedChangeKg as number[];
    for (let i = 0; i < offsetGrid().length; i++) {
      if (i < expectedExcluded) {
        expect(ll[i]).toBe(Number.NEGATIVE_INFINITY);
        expect(pred[i]).toBeNaN();
      } else {
        expect(Number.isFinite(ll[i])).toBe(true);
        expect(Number.isFinite(pred[i])).toBe(true);
      }
    }
    const r = warmStartPosterior(input);
    expect(r.posterior.probabilities.slice(0, expectedExcluded).every((p) => p === 0)).toBe(true);
    expect(Number.isFinite(r.posterior.medianKcal)).toBe(true);
    // The evidence support (D-29) never contains an inadmissible offset: it starts at the lowest admissible one.
    const support = l.evidenceSupport;
    expect(support?.offsetsKcal[0]).toBe(-995);
    expect(support?.excludedByDomainCount).toBe((3000 - 995) / 5);
    expect(l.hallDomain?.supportExcludedOffsetCount).toBe(support?.excludedByDomainCount);
    expect(r.historyOnly?.offsetsKcal[0]).toBe(-995);
    expect(Number.isFinite(r.historyOnly?.medianKcal)).toBe(true);
    // The coherence interval uses the lowest admissible offset inside [-1200, +1200] when -1200 is excluded.
    expect(l.exactRoot?.coherenceIntervalKg[1]).toBe(support?.predictedChangeKg[0]);
  });

  it('calibration: excluded points are counted and carry no probability', () => {
    const run = simulateSyntheticUser(CASE_A, { trueOffsetKcal: 0, weighEveryDays: 2, minorDeviationFraction: 0, majorDeviationFraction: 0, unreportedFraction: 0, stepLogProbability: 1, days: 21, noiseScaleKg: 0.3, minorExtraKcal: [150, 350], majorExtraKcal: [700, 1200] }, createRng(12));
    const real = fitCalibration(run.calibrationInputFor(21));
    expect(real?.excludedOffsetCount).toBe(0);
    const fit = fitCalibration({ ...run.calibrationInputFor(21), populationTdeeAtStartKcal: 1000 });
    expect(fit?.excludedOffsetCount).toBe(expectedExcluded);
    expect(fit?.posterior.probabilities.slice(0, expectedExcluded).every((p) => p === 0)).toBe(true);
    expect(Number.isFinite(fit?.posterior.medianKcal)).toBe(true);
  });

  it('valid profiles exclude nothing today (reference case and the smallest NASEM of the valid domain)', () => {
    expect(warmStartFor(CASE_A, evidence(1450, 14, 68, 68), TODAY).likelihood.hallDomain?.excludedOffsetCount).toBe(0);
  });
});

describe('extreme valid profile: smallest NASEM of the valid domain (about 1 283 kcal/day)', () => {
  const corner: UserProfile = makeProfile({ sexForEquation: 'female', ageYears: 65, heightCm: 130, currentWeightKg: 35, averageSteps7d: 0, occupation: 'seated', activities: [], goal: 'maintenance', targetWeightKg: 35, weeklyRateTarget: 0 });

  it('is the documented corner (inactive, NASEM 1 282.7)', () => {
    const a = assessBaseline(corner, TODAY);
    expect(a.validation.ok).toBe(true);
    expect(a.palCategory).toBe('inactive');
    expect(a.populationTdeeKcal).toBeCloseTo(1282.7, 1);
  });

  it('every grid offset gives a finite predicted change, with nothing excluded, across intakes and durations', () => {
    for (const kcal of [800, 1450, 6000]) {
      for (const days of [7, 90]) {
        const w = warmStartFor(corner, evidence(kcal, days, 35, 35), TODAY);
        expect(w.status).toBe('used');
        expect(w.likelihood.hallDomain?.excludedOffsetCount).toBe(0);
        expect((w.likelihood.predictedChangeKg as number[]).every(Number.isFinite)).toBe(true);
        expect((w.likelihood.logLikelihood as number[]).every(Number.isFinite)).toBe(true);
        expect(Number.isFinite(w.posterior.medianKcal)).toBe(true);
      }
    }
  });

  it('ECF stays between its baseline and the steady state set by the carbohydrate ratio (no overshoot, no blow-up)', () => {
    const a = assessBaseline(corner, TODAY);
    const carb = baselineCarbFractionFor(planContextFrom(corner, a, a.populationTdeeKcal), 'maintenance');
    for (const offset of [-1200, -600, 0, 1200]) {
      const baseline = a.populationTdeeKcal + offset;
      const p = initializeHall({ sex: 'female', ageYears: 65, heightM: 1.3, bodyWeightKg: 35, baselineIntakeKcal: baseline, baselineRmrKcal: a.ree.reeKcalDay, baselineCarbFraction: carb });
      for (const kcal of [800, 6000]) {
        const steady = p.ecf0Kg + (HALL_ZETA_CI_MG_PER_DAY / HALL_ZETA_NA_MG_PER_L_DAY) * (kcal / baseline - 1);
        const lo = Math.min(p.ecf0Kg, steady) - 1e-9;
        const hi = Math.max(p.ecf0Kg, steady) + 1e-9;
        const days = simulateHall(p, 365, () => ({ intakeKcal: kcal, carbKcal: carb * kcal, paDeltaKcalPerKgDay: 0, sodiumDeltaMg: 0 })).days;
        for (const d of days) {
          expect(Number.isFinite(d.bodyWeightKg)).toBe(true);
          expect(d.ecfKg).toBeGreaterThanOrEqual(lo);
          expect(d.ecfKg).toBeLessThanOrEqual(hi);
        }
      }
    }
  });
});

describe('B2 delta-clamp diagnostic is exposed without acting', () => {
  it('reference case A: likelihood maximum at -945, below the clamp threshold at about -875', () => {
    const w = warmStartFor(CASE_A, evidence(1450, 14, 68, 68), TODAY);
    const d = w.likelihood.hallDomain;
    const a = assessBaseline(CASE_A, TODAY);
    expect(d?.deltaClampOffsetKcal).toBeCloseTo(a.ree.reeKcalDay / 0.9 - w.populationTdeeAtStartKcal, 9);
    expect(d?.deltaClampOffsetKcal).toBeCloseTo(-875.1, 1);
    expect(d?.likelihoodArgmaxOffsetKcal).toBe(-945);
    expect(d?.argmaxMinusDeltaClampKcal).toBeLessThan(0);
    // Diagnostic only: the likelihood is unchanged below the threshold (no exclusion, no truncation).
    const ll = w.likelihood.logLikelihood as number[];
    expect(ll.every(Number.isFinite)).toBe(true);
    expect(w.likelihood.hallDomain?.excludedOffsetCount).toBe(0);
  });
});
