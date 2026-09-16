/** Scenario definitions and runner of the model-mismatch calibration benchmark (42 and 84 days). */
import { fitCalibration } from '@/science/calibration';
import type { UserProfile } from '@/science/types';
import { recoveryMetrics, simulateMismatchUser } from './mismatchWorld';
import type { MismatchSettings, RecoveryMetrics } from './mismatchWorld';
import { createRng } from './random';

/** Wheighty v1 criteria at 42 and 84 days (product criteria, not published physiological constants). */
export const MISMATCH_CRITERIA = { maxMedianAbsErrorKcal: 175, minCoverage80: 0.7, minCoverage95: 0.9 } as const;
export const MISMATCH_HORIZONS = [42, 84] as const;
export type MismatchHorizon = (typeof MISMATCH_HORIZONS)[number];

export const PROFILES: UserProfile[] = [
  { ageYears: 34, sexForEquation: 'female', heightCm: 168, currentWeightKg: 74, averageSteps7d: 7500, walkingPace: 'normal', occupation: 'seated', activities: [], goal: 'loss', targetWeightKg: 66, weeklyRateTarget: 0.005 },
  { ageYears: 45, sexForEquation: 'male', heightCm: 180, currentWeightKg: 95, averageSteps7d: 6000, walkingPace: 'normal', occupation: 'mixed', activities: [{ type: 'running', sessionsPerWeek: 2, durationMin: 40, intensity: 'moderate' }], goal: 'loss', targetWeightKg: 85, weeklyRateTarget: 0.005 },
  { ageYears: 27, sexForEquation: 'male', heightCm: 176, currentWeightKg: 70, averageSteps7d: 9000, walkingPace: 'brisk', occupation: 'standing', activities: [{ type: 'strength', sessionsPerWeek: 3, durationMin: 60, intensity: 'moderate' }], goal: 'gain', targetWeightKg: 75, weeklyRateTarget: 0.0025 },
];
export const OFFSETS = [-500, -300, -150, 0, 150, 300, 500];
export const FREQUENCIES = [1, 3];
const DRIFTS = [100, -150, 150, -100];
const STEP_BIASES = [0.1, -0.15, 0.15, -0.1];

/** Same declared behaviour and independent noise as the standard benchmark, no mismatch. */
export const BASE: Omit<MismatchSettings, 'trueOffsetKcal' | 'weighEveryDays' | 'days'> = {
  minorDeviationFraction: 0.1,
  majorDeviationFraction: 0.04,
  unreportedFraction: 0.2,
  stepLogProbability: 0.6,
  driftAtEndKcal: 0,
  hiddenIntakeDayFraction: 0,
  hiddenIntakeKcal: [200, 500],
  stepCounterBias: 0,
  measurementScaleKg: 0.5,
  arPhi: 0,
  arMarginalSdKg: 0,
  waterEpisodeStartProbability: 0,
  waterEpisodeKg: [0.5, 1],
  waterEpisodeDays: [2, 5],
};

// D and F replace part of the independent noise by an AR(1) water state (phi 0.7, marginal SD 0.5 kg)
// with a smaller measurement noise (Student-t(4) scale 0.3 kg): total SD close to the standard 0.71 kg,
// but deviations persist for several days.
const AUTOCORRELATED = { measurementScaleKg: 0.3, arPhi: 0.7, arMarginalSdKg: 0.5 } as const;
// E: an episode starts on about 1 day in 12 and lasts 2 to 5 days.
const EPISODES = { waterEpisodeStartProbability: 0.08 } as const;
// B: hidden intake on 15 percent of days.
const HIDDEN = { hiddenIntakeDayFraction: 0.15 } as const;

export type ScenarioKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export const SCENARIOS: Record<ScenarioKey, { label: string; settings: (i: number) => Partial<MismatchSettings> }> = {
  A: { label: 'A drift +/-100..150 kcal/day', settings: (i) => ({ driftAtEndKcal: DRIFTS[i % DRIFTS.length] as number }) },
  B: { label: 'B hidden intake +200..500 kcal on 15 percent of days', settings: () => HIDDEN },
  C: { label: 'C step counter bias +/-10..15 percent', settings: (i) => ({ stepCounterBias: STEP_BIASES[i % STEP_BIASES.length] as number }) },
  D: { label: 'D autocorrelated water noise AR(1)', settings: () => AUTOCORRELATED },
  E: { label: 'E water episodes +/-0.5..1.0 kg', settings: () => EPISODES },
  F: { label: 'F combined A+B+C+D+E', settings: (i) => ({ driftAtEndKcal: DRIFTS[i % DRIFTS.length] as number, stepCounterBias: STEP_BIASES[(i + 1) % STEP_BIASES.length] as number, ...HIDDEN, ...AUTOCORRELATED, ...EPISODES }) },
};

/**
 * Measured outcome of each v1 criterion with the fixed seeds (model 1.3.0, apparent-maintenance truth, D-31),
 * reported in IMPLEMENTATION_NOTES T-04. Unmet criteria are NOT fixed by tuning priors: the test checks that the
 * outcome still matches this record, so any change (better or worse) must be re-documented.
 */
export const DOCUMENTED_OUTCOME: Record<MismatchHorizon, Record<ScenarioKey, { mae: boolean; coverage80: boolean; coverage95: boolean }>> = {
  42: {
    A: { mae: true, coverage80: true, coverage95: true },
    B: { mae: true, coverage80: true, coverage95: true },
    C: { mae: true, coverage80: true, coverage95: true },
    D: { mae: true, coverage80: true, coverage95: true },
    E: { mae: true, coverage80: true, coverage95: true },
    F: { mae: true, coverage80: true, coverage95: false },
  },
  84: {
    A: { mae: true, coverage80: true, coverage95: true },
    B: { mae: true, coverage80: true, coverage95: true },
    C: { mae: true, coverage80: true, coverage95: true },
    D: { mae: true, coverage80: true, coverage95: true },
    E: { mae: true, coverage80: true, coverage95: true },
    F: { mae: true, coverage80: true, coverage95: true },
  },
};

export function criteriaOutcome(m: RecoveryMetrics): { mae: boolean; coverage80: boolean; coverage95: boolean } {
  return {
    mae: m.medianAbsErrorKcal <= MISMATCH_CRITERIA.maxMedianAbsErrorKcal,
    coverage80: m.coverage80 >= MISMATCH_CRITERIA.minCoverage80,
    coverage95: m.coverage95 >= MISMATCH_CRITERIA.minCoverage95,
  };
}

export type ScenarioResult = {
  key: ScenarioKey;
  label: string;
  days: MismatchHorizon;
  /** Criteria are evaluated against the estimand, the apparent maintenance offset (D-31). */
  vsApparent: RecoveryMetrics;
  /** Reported only: window-mean and end-of-window metabolic offsets. */
  vsWindowMean: RecoveryMetrics;
  vsEndOfWindow: RecoveryMetrics;
};

export function runMismatchScenario(key: ScenarioKey, seedBase: number, days: MismatchHorizon): ScenarioResult {
  const scenario = SCENARIOS[key];
  const rowsApparent: Array<{ error: number; in80: boolean; in95: boolean; width80: number }> = [];
  const rowsMean: typeof rowsApparent = [];
  const rowsEnd: typeof rowsApparent = [];
  let i = 0;
  for (const trueOffsetKcal of OFFSETS) {
    for (const weighEveryDays of FREQUENCIES) {
      for (const profile of PROFILES) {
        const run = simulateMismatchUser(profile, { ...BASE, days, trueOffsetKcal, weighEveryDays, ...scenario.settings(i) }, createRng(seedBase + i));
        const fit = fitCalibration(run.calibrationInputFor(days));
        if (!fit) throw new Error('fit failed');
        const [l80, u80] = fit.posterior.interval80;
        const [l95, u95] = fit.posterior.interval95;
        for (const [rows, truth] of [
          [rowsApparent, run.apparentOffsetKcal(days)],
          [rowsMean, run.windowMeanOffsetKcal(days)],
          [rowsEnd, run.endOffsetKcal(days)],
        ] as const) {
          rows.push({ error: fit.posterior.medianKcal - truth, in80: truth >= l80 && truth <= u80, in95: truth >= l95 && truth <= u95, width80: u80 - l80 });
        }
        i++;
      }
    }
  }
  return { key, label: scenario.label, days, vsApparent: recoveryMetrics(rowsApparent), vsWindowMean: recoveryMetrics(rowsMean), vsEndOfWindow: recoveryMetrics(rowsEnd) };
}
