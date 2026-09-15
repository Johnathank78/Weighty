/**
 * Calibration benchmark with model mismatch (patch s8, IMPLEMENTATION_NOTES T-04).
 *
 * Unlike syntheticUser.ts, the simulated world does NOT follow the estimator's assumptions:
 * - A: unmodelled energy drift, growing linearly to +/-100..150 kcal/day at the end of the window;
 * - B: hidden intake of +200..500 kcal on some days, declared "plan respecté" or not declared;
 * - C: systematic step-counter bias of +/-10..15 percent (onboarding average and logs alike);
 * - D: autocorrelated water fluctuations (AR(1)) instead of independent daily noise;
 * - E: water episodes of +/-0.5..1.0 kg lasting several days, without any energy change;
 * - F: all of the above combined.
 * The estimator is used exactly as in production (no knowledge of these perturbations).
 * Simulator parameters are fixed assumptions chosen before looking at results; they are not tuned.
 */
import { netStepKcal } from '@/science/activity';
import { assessBaseline, planContextFrom } from '@/science/assessment';
import type { CalibrationInput } from '@/science/calibration';
import { addDays } from '@/science/dates';
import { baselineCarbFractionFor, buildGoalPlan, hallInputFor, hallParametersFor } from '@/science/goals';
import { advance, bodyWeightOf, initialState } from '@/science/hall/model';
import type { DailyLog, UserProfile, WeightEntry } from '@/science/types';
import type { Rng } from './random';

export type MismatchSettings = {
  trueOffsetKcal: number;
  weighEveryDays: number;
  days: number;
  // Declared behaviour, as in the standard benchmark.
  minorDeviationFraction: number;
  majorDeviationFraction: number;
  unreportedFraction: number;
  stepLogProbability: number;
  // A. drift reached at the last day (kcal/day of extra expenditure, signed).
  driftAtEndKcal: number;
  // B. hidden intake.
  hiddenIntakeDayFraction: number;
  hiddenIntakeKcal: readonly [number, number];
  // C. counter reading = true steps * (1 + bias).
  stepCounterBias: number;
  // Weight noise: independent Student-t(4) measurement noise plus optional AR(1) water state.
  measurementScaleKg: number;
  arPhi: number;
  arMarginalSdKg: number;
  // E. water episodes.
  waterEpisodeStartProbability: number;
  waterEpisodeKg: readonly [number, number];
  waterEpisodeDays: readonly [number, number];
};

export const START_DATE = '2026-02-02';

export type MismatchRun = {
  calibrationInputFor: (throughDay: number) => CalibrationInput;
  /** Metabolic offset of the world averaged over days [0, throughDay) (reported only since D-31). */
  windowMeanOffsetKcal: (throughDay: number) => number;
  /** Metabolic offset of the world on the last day of the window (reported only since D-31). */
  endOffsetKcal: (throughDay: number) => number;
  /**
   * Estimand of the calibration (apparent maintenance, D-31): window-mean metabolic offset minus the mean intake eaten
   * above the day's target (declared deviations and hidden intake) over days [0, throughDay).
   */
  apparentOffsetKcal: (throughDay: number) => number;
};

export function simulateMismatchUser(profile: UserProfile, s: MismatchSettings, rng: Rng): MismatchRun {
  // The profile holds what the user reports, including a biased phone step average.
  const assessment = assessBaseline(profile, START_DATE);
  const ctx = planContextFrom(profile, assessment, assessment.populationTdeeKcal);
  const plan = buildGoalPlan(ctx, { goal: profile.goal, weeklyRate: profile.weeklyRateTarget, targetWeightKg: profile.targetWeightKg, stepTarget: profile.averageSteps7d });
  if (plan.status !== 'ok' || plan.calorieTargetKcal === null || plan.macros === null) throw new Error(`mismatch plan failed: ${plan.status}`);
  const calorieTarget = plan.calorieTargetKcal;
  const reportedStepTarget = profile.averageSteps7d;
  const trueBaselineSteps = reportedStepTarget / (1 + s.stepCounterBias);

  const p = hallParametersFor(ctx, profile.goal, s.trueOffsetKcal);
  const planInput = hallInputFor(ctx, profile.goal, { calorieTargetKcal: calorieTarget, stepsPerDay: reportedStepTarget });
  const w0 = profile.currentWeightKg;
  const drift = (d: number) => (s.driftAtEndKcal * d) / Math.max(1, s.days - 1);

  let state = initialState(p);
  const trueWeights: number[] = [];
  const logs: DailyLog[] = [];
  const extras: number[] = [];
  for (let d = 0; d <= s.days; d++) {
    trueWeights.push(bodyWeightOf(p, state));
    if (d === s.days) break;
    const r = rng.next();
    let adherence: DailyLog['adherence'];
    let declaredExtra = 0;
    if (r < s.majorDeviationFraction) {
      adherence = 'major_deviation';
      declaredExtra = rng.uniform(700, 1200);
    } else if (r < s.majorDeviationFraction + s.minorDeviationFraction) {
      adherence = 'minor_deviation';
      declaredExtra = rng.uniform(150, 350);
    } else {
      adherence = 'on_plan';
    }
    let reported = !rng.chance(s.unreportedFraction);
    let hidden = 0;
    if (rng.chance(s.hiddenIntakeDayFraction)) {
      hidden = rng.uniform(s.hiddenIntakeKcal[0], s.hiddenIntakeKcal[1]);
      // Either declared as on plan, or not declared at all (unknown adherence).
      if (rng.chance(0.5)) {
        adherence = 'on_plan';
        reported = true;
      } else {
        reported = false;
      }
    }
    const trueSteps = Math.max(0, trueBaselineSteps * (1 + 0.2 * rng.normal()));
    const loggedSteps = Math.round(trueSteps * (1 + s.stepCounterBias));
    const stepsLogged = rng.chance(s.stepLogProbability);
    extras.push(declaredExtra + hidden);
    const intake = calorieTarget + declaredExtra + hidden;
    const ratio = intake / calorieTarget;
    const stepDeltaKcal =
      netStepKcal({ steps: trueSteps, pace: profile.walkingPace, weightKg: w0, ageYears: profile.ageYears }) -
      netStepKcal({ steps: trueBaselineSteps, pace: profile.walkingPace, weightKg: w0, ageYears: profile.ageYears });
    state = advance(p, state, { intakeKcal: intake, carbKcal: planInput.carbKcal * ratio, paDeltaKcalPerKgDay: (stepDeltaKcal + drift(d)) / w0, sodiumDeltaMg: 0 }, 1);
    const log: DailyLog = { date: addDays(START_DATE, d), calorieTargetForDay: calorieTarget, stepTargetForDay: reportedStepTarget, macrosForDay: plan.macros.exact };
    if (stepsLogged) log.actualSteps = loggedSteps;
    if (reported) log.adherence = adherence;
    logs.push(log);
  }

  // Water state: AR(1) plus episodes, no energy involved.
  const water: number[] = [];
  let ar = s.arMarginalSdKg > 0 ? s.arMarginalSdKg * rng.normal() : 0;
  let episodeLeft = 0;
  let episodeKg = 0;
  for (let d = 0; d <= s.days; d++) {
    if (d > 0 && s.arMarginalSdKg > 0) ar = s.arPhi * ar + s.arMarginalSdKg * Math.sqrt(1 - s.arPhi * s.arPhi) * rng.normal();
    if (episodeLeft === 0 && rng.chance(s.waterEpisodeStartProbability)) {
      episodeLeft = rng.int(s.waterEpisodeDays[0], s.waterEpisodeDays[1]);
      episodeKg = (rng.chance(0.5) ? 1 : -1) * rng.uniform(s.waterEpisodeKg[0], s.waterEpisodeKg[1]);
    }
    const episode = episodeLeft > 0 ? episodeKg : 0;
    if (episodeLeft > 0) episodeLeft--;
    water.push(ar + episode);
  }

  const observed: WeightEntry[] = [];
  for (let d = 0; d <= s.days; d += s.weighEveryDays) {
    const noise = s.measurementScaleKg * rng.studentT(4);
    observed.push({ id: `w${d}`, date: addDays(START_DATE, d), weightKg: (trueWeights[d] as number) + (water[d] as number) + noise, createdAt: `${addDays(START_DATE, d)}T07:00:00Z` });
  }

  const windowMeanOffsetKcal = (throughDay: number) => {
    let sum = 0;
    for (let d = 0; d < throughDay; d++) sum += drift(d);
    return s.trueOffsetKcal + sum / throughDay;
  };

  return {
    calibrationInputFor: (throughDay) => ({
      sex: profile.sexForEquation,
      ageYears: profile.ageYears,
      heightCm: profile.heightCm,
      walkingPace: profile.walkingPace,
      populationTdeeAtStartKcal: assessment.populationTdeeKcal,
      reeAtStartKcal: assessment.ree.reeKcalDay,
      maintenanceStepsPerDay: reportedStepTarget,
      priorSigmaKcal: assessment.sigma.sigmaKcal,
      baselineCarbFraction: baselineCarbFractionFor(ctx, profile.goal),
      weights: observed.filter((w) => w.date <= addDays(START_DATE, throughDay)),
      dailyLogs: logs.filter((l) => l.date < addDays(START_DATE, throughDay)),
    }),
    windowMeanOffsetKcal,
    apparentOffsetKcal: (throughDay) => windowMeanOffsetKcal(throughDay) - extras.slice(0, throughDay).reduce((sum, x) => sum + x, 0) / throughDay,
    endOffsetKcal: (throughDay) => s.trueOffsetKcal + drift(throughDay - 1),
  };
}

export type RecoveryMetrics = { n: number; medianAbsErrorKcal: number; meanErrorKcal: number; coverage80: number; coverage95: number; meanWidth80Kcal: number };

export function recoveryMetrics(rows: ReadonlyArray<{ error: number; in80: boolean; in95: boolean; width80: number }>): RecoveryMetrics {
  const abs = rows.map((r) => Math.abs(r.error)).sort((a, b) => a - b);
  const mid = (abs.length - 1) / 2;
  return {
    n: rows.length,
    medianAbsErrorKcal: ((abs[Math.floor(mid)] as number) + (abs[Math.ceil(mid)] as number)) / 2,
    meanErrorKcal: rows.reduce((s, r) => s + r.error, 0) / rows.length,
    coverage80: rows.filter((r) => r.in80).length / rows.length,
    coverage95: rows.filter((r) => r.in95).length / rows.length,
    meanWidth80Kcal: rows.reduce((s, r) => s + r.width80, 0) / rows.length,
  };
}

export function formatMetrics(m: RecoveryMetrics): string {
  return `n=${m.n} MAE=${m.medianAbsErrorKcal.toFixed(0)} bias=${m.meanErrorKcal.toFixed(0)} cov80=${m.coverage80.toFixed(2)} cov95=${m.coverage95.toFixed(2)} width80=${m.meanWidth80Kcal.toFixed(0)}`;
}
