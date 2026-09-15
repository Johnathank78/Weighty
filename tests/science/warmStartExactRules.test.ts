/**
 * Warm start decision rules on the exact distribution (IMPLEMENTATION_NOTES D-29, model 1.2.0):
 * exact coherence rule, no numerical effect of the incoherent flag, prior predictive conflict z,
 * evidence support invariance, monotonicity in the declared intake, known rate-step behaviour.
 */
import { describe, expect, it } from 'vitest';
import { previewInitialPlan, warmStartFor } from '@/domain/engine';
import { offsetGrid, summarizeGridPosterior } from '@/science/calibration';
import { WARM_START_EVIDENCE_SUPPORT_HALF_WIDTH_KCAL, WARM_START_INCOHERENT_OFFSET_BOUND } from '@/science/constants';
import { logNormalCdf, normalQuantileFromLogCdf } from '@/science/normal';
import { endpointWeightSdKg, evidenceSupportOffsets, exactCoherence, predictiveConflictZ } from '@/science/warmStart';
import type { HistoricalIntakeEvidence, UserProfile } from '@/science/types';
import { makeProfile } from '../helpers/profiles';

const TODAY = '2026-09-14';
const history = (kcal: number, days = 14, start = 68, end = 68): HistoricalIntakeEvidence => ({ evidenceVersion: 1, recordedOn: TODAY, averageCaloriesKcal: kcal, durationDays: days, startWeightKg: start, endWeightKg: end, trackingQuality: 'high', activityComparable: true });
/** Case R: real reference profile (handoff 22_). */
const CASE_R: UserProfile = makeProfile({ sexForEquation: 'female', ageYears: 24, heightCm: 155, currentWeightKg: 68, averageSteps7d: 9400, walkingPace: 'normal', occupation: 'seated', activities: [{ type: 'strength', sessionsPerWeek: 4, durationMin: 55, intensity: 'moderate' }], goal: 'loss', targetWeightKg: 60, weeklyRateTarget: 0.01 });
/** Case S: synthetic 5-session variant. */
const CASE_S: UserProfile = { ...CASE_R, activities: [{ type: 'strength', sessionsPerWeek: 5, durationMin: 55, intensity: 'moderate' }], targetWeightKg: 62 };
const LEGIT: UserProfile = makeProfile({ sexForEquation: 'male', ageYears: 40, heightCm: 178, currentWeightKg: 92, goal: 'loss', targetWeightKg: 84, weeklyRateTarget: 0.005 });

describe('standard normal in log space', () => {
  it('matches reference values, including far tails', () => {
    expect(Math.exp(logNormalCdf(-1.96))).toBeCloseTo(0.0249979, 6);
    expect(Math.exp(logNormalCdf(1.2815515655))).toBeCloseTo(0.9, 6);
    expect(Math.exp(logNormalCdf(-8)) / 6.22096057427178e-16).toBeCloseTo(1, 5);
    expect(Number.isFinite(logNormalCdf(-60))).toBe(true);
  });

  it('the quantile inverts the log CDF over the whole range', () => {
    for (const z of [-40, -12, -3, -1.96, -0.5, 0, 0.3, 1.96, 5]) expect(normalQuantileFromLogCdf(logNormalCdf(z))).toBeCloseTo(z, 6);
  });
});

describe('exact coherence rule (C = 1 200 kcal/day)', () => {
  it('incoherent if and only if the observed change lies outside [predicted(+C), predicted(-C)]', () => {
    const cases: [UserProfile, HistoricalIntakeEvidence][] = [
      ...[900, 1000, 1050, 1060, 1300, 1450, 2000, 2500].map((k) => [CASE_R, history(k)] as [UserProfile, HistoricalIntakeEvidence]),
      [CASE_S, history(1350)],
      [LEGIT, history(1400, 28, 90, 92)],
    ];
    let seenIncoherent = 0;
    for (const [profile, e] of cases) {
      const l = warmStartFor(profile, e, TODAY).likelihood;
      const s = l.evidenceSupport;
      if (!s || !l.exactRoot || l.observedChangeKg === null) throw new Error('used');
      const pPlus = s.predictedChangeKg[s.offsetsKcal.indexOf(WARM_START_INCOHERENT_OFFSET_BOUND)] as number;
      const pMinus = s.predictedChangeKg[s.offsetsKcal.indexOf(-WARM_START_INCOHERENT_OFFSET_BOUND)] as number;
      const outside = l.observedChangeKg < Math.min(pPlus, pMinus) || l.observedChangeKg > Math.max(pPlus, pMinus);
      expect(l.incoherent).toBe(outside);
      expect(l.exactRoot.coherenceIntervalKg).toEqual([pPlus, pMinus]);
      if (l.exactRoot.rootOffsetKcal !== null) expect(Math.abs(l.exactRoot.rootOffsetKcal) > WARM_START_INCOHERENT_OFFSET_BOUND).toBe(l.incoherent);
      if (l.incoherent) seenIncoherent++;
    }
    expect(seenIncoherent).toBeGreaterThanOrEqual(2);
  });

  it('case S: no declared intake between 1 300 and 1 500 is incoherent any more (exact roots -1 095 to -945)', () => {
    const roots = [1300, 1350, 1380, 1450].map((k) => warmStartFor(CASE_S, history(k), TODAY).likelihood);
    for (const l of roots) expect(l.incoherent).toBe(false);
    expect(roots.map((l) => Math.round(l.exactRoot?.rootOffsetKcal ?? NaN))).toEqual([-1095, -1045, -1015, -945]);
  });
});

describe('the incoherent flag has no numerical effect', () => {
  it('flagged and unflagged histories use the same likelihood formula, without any factor', () => {
    const flagged = warmStartFor(CASE_R, history(950), TODAY).likelihood;
    const clean = warmStartFor(CASE_R, history(1450), TODAY).likelihood;
    expect(flagged.incoherent).toBe(true);
    expect(clean.incoherent).toBe(false);
    for (const l of [flagged, clean]) {
      const c = l.components;
      const sens = l.sensitivityKgPerKcal as number;
      if (!c) throw new Error('components');
      const sd = Math.sqrt(2 * endpointWeightSdKg() ** 2 + sens ** 2 * (c.intakeSdKcal ** 2 + c.activitySdKcal ** 2 + c.modelSdKcal ** 2));
      expect(l.likelihoodSdKg).toBe(sd);
      expect(l.historyOnlySdKcal).toBe(sd / Math.abs(sens));
      const ll = l.logLikelihood as number[];
      const pred = l.predictedChangeKg as number[];
      ll.forEach((v, i) => expect(v).toBe(-0.5 * (((l.observedChangeKg as number) - (pred[i] as number)) / sd) ** 2));
    }
  });
});

describe('linear model equivalence', () => {
  const offsets: number[] = [];
  for (let o = -6000; o <= 6000; o += 5) offsets.push(o);
  const a = -2.3;
  const s = -0.0025;
  const pred = offsets.map((o) => a + s * o);
  const sdKg = 1.3;
  const sigma = 277;

  it('predictive z equals the linearised z and the exact root equals the linearised offset', () => {
    for (const observed of [-6, -3.1, -2.3, 0, 0.9, 2.5, 6]) {
      const lin = (observed - a) / s;
      const linSd = sdKg / Math.abs(s);
      const linZ = lin / Math.sqrt(linSd ** 2 + sigma ** 2);
      expect(predictiveConflictZ(offsets, pred, sdKg, sigma, observed)).toBeCloseTo(linZ, 6);
      expect(exactCoherence(offsets, pred, observed, WARM_START_INCOHERENT_OFFSET_BOUND).root.rootOffsetKcal).toBeCloseTo(lin, 6);
    }
  });
});

describe('evidence support', () => {
  it('strictly contains the calibration grid, same step, bounded by the Hall domain', () => {
    const support = evidenceSupportOffsets(2256).offsetsKcal;
    const grid = offsetGrid();
    expect(support.length).toBeGreaterThan(grid.length);
    for (const o of grid) expect(support).toContain(o);
    expect(support[support.length - 1]).toBe(WARM_START_EVIDENCE_SUPPORT_HALF_WIDTH_KCAL);
    expect(support[0]).toBe(-2250);
  });

  it('the fused posterior is the same on the evidence support and on the calibration grid while the prior mass beyond is negligible', () => {
    for (const [profile, e] of [[CASE_R, history(1450)], [CASE_S, history(1450)], [CASE_R, history(950)]] as const) {
      const w = warmStartFor(profile, e, TODAY);
      const s = w.likelihood.evidenceSupport;
      if (!s) throw new Error('support');
      const priorBeyond = summarizeGridPosterior(s.offsetsKcal, s.offsetsKcal.map((o) => -0.5 * (o / w.priorSigmaKcal) ** 2));
      const massBeyond = priorBeyond.probabilities.reduce((m, p, i) => m + (Math.abs(s.offsetsKcal[i] as number) > 1200 ? p : 0), 0);
      expect(massBeyond).toBeLessThan(1e-4);
      const onSupport = summarizeGridPosterior(s.offsetsKcal, s.offsetsKcal.map((o, i) => -0.5 * (o / w.priorSigmaKcal) ** 2 + (s.logLikelihood[i] as number)));
      expect(onSupport.medianKcal).toBeCloseTo(w.posterior.medianKcal, 0);
      expect(onSupport.interval80[0]).toBeCloseTo(w.posterior.interval80[0], 0);
      expect(onSupport.interval95[1]).toBeCloseTo(w.posterior.interval95[1], 0);
    }
  });
});

describe('monotonicity in the declared intake (warm start alone, profile and goal rate fixed)', () => {
  // At fixed weights a higher declared intake implies a higher maintenance: the prescription is non-decreasing.
  // Model 1.1.0 failed between 1 370 and 1 380 on case S and between 1 250 and 1 260 on case R.
  for (const [name, profile] of [['R', CASE_R], ['S', CASE_S]] as const) {
    it(`case ${name}: maintenance and calories never decrease from 900 to 2 500 kcal/day`, () => {
      let prev: { maintenance: number; calories: number; rate: number } | null = null;
      for (let kcal = 900; kcal <= 2500; kcal += 10) {
        const p = previewInitialPlan(profile, TODAY, history(kcal));
        if (!p.ok) throw new Error(p.reason);
        const cur = { maintenance: p.plan.maintenanceKcal, calories: p.plan.calorieTarget, rate: p.plan.weeklyRateTarget };
        if (prev) {
          expect(cur.maintenance, `maintenance at ${kcal}`).toBeGreaterThanOrEqual(prev.maintenance);
          expect(cur.rate).toBe(prev.rate);
          // Solver tolerance: 1 kcal/day.
          expect(cur.calories, `calories at ${kcal}`).toBeGreaterThanOrEqual(prev.calories - 1);
        }
        prev = cur;
      }
    });
  }
});

describe('known second source of non-monotonicity, outside the warm start (not fixed)', () => {
  // Profile T1 of the P0 measurement pass. When the maintenance rises, a faster goal rate becomes feasible on the
  // 0.05 percent grid (floor and macro feasibility), and the calorie target drops by about 100 kcal/day.
  // Frozen as known behaviour of the goal engine: a separate topic, deliberately left untouched.
  const T1: UserProfile = { ageYears: 55, sexForEquation: 'female', heightCm: 164.6237430954352, currentWeightKg: 182.3285150830634, averageSteps7d: 9159, walkingPace: 'brisk', occupation: 'mixed', activities: [{ type: 'walking', sessionsPerWeek: 4, durationMin: 43.261827633250505, intensity: 'light' }, { type: 'cycling', sessionsPerWeek: 6, durationMin: 28.841218422167003, intensity: 'light' }], goal: 'loss', targetWeightKg: 164.09566357475705, weeklyRateTarget: 0.00965203395858407 };
  const at = (kcal: number) => {
    const w = T1.currentWeightKg;
    const p = previewInitialPlan(T1, TODAY, history(kcal, 14, w, w));
    if (!p.ok) throw new Error(p.reason);
    return p.plan;
  };

  it('rate steps 0.75 -> 0.80 percent at 1 100 -> 1 110 and 0.80 -> 0.85 percent at 2 130 -> 2 140 kcal/day', () => {
    for (const [lo, hi, rateLo, rateHi] of [[1100, 1110, 0.0075, 0.008], [2130, 2140, 0.008, 0.0085]] as const) {
      const a = at(lo);
      const b = at(hi);
      expect(b.maintenanceKcal).toBeGreaterThan(a.maintenanceKcal);
      expect([a.weeklyRateTarget, b.weeklyRateTarget]).toEqual([rateLo, rateHi]);
      expect(b.calorieTarget - a.calorieTarget).toBeLessThan(-100);
      expect(b.calorieTarget - a.calorieTarget).toBeGreaterThan(-105);
    }
  });
});
