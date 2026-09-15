/**
 * Synthetic users for calibration recovery simulations (instruct/06 section 13).
 * The "true" world uses the same Hall model with a known TDEE offset and noisy,
 * partially adherent behaviour; the calibration only sees what a real user logs.
 */
import { assessBaseline, planContextFrom } from '@/science/assessment';
import { addDays } from '@/science/dates';
import { baselineCarbFractionFor, buildGoalPlan, hallParametersFor, hallInputFor } from '@/science/goals';
import { advance, bodyWeightOf, initialState } from '@/science/hall/model';
import { netStepKcal } from '@/science/activity';
import type { CalibrationInput } from '@/science/calibration';
import type { DailyLog, UserProfile, WeightEntry } from '@/science/types';
import type { Rng } from './random';

export type SimulationSettings = {
  trueOffsetKcal: number;
  weighEveryDays: number;
  minorDeviationFraction: number;
  majorDeviationFraction: number;
  /** Share of days without any adherence report. */
  unreportedFraction: number;
  /** Probability that actual steps are logged on a given day. */
  stepLogProbability: number;
  days: number;
  /** Student-t (df 4) scale of day-to-day weight noise, kg. */
  noiseScaleKg: number;
  minorExtraKcal: readonly [number, number];
  majorExtraKcal: readonly [number, number];
};

export const START_DATE = '2026-01-05';

export type SyntheticRun = {
  profile: UserProfile;
  calibrationInputFor: (throughDay: number) => CalibrationInput;
  trueWeights: number[];
  populationTdeeKcal: number;
  /**
   * Estimand of the calibration (apparent maintenance, IMPLEMENTATION_NOTES D-31): the metabolic offset minus the
   * mean intake actually eaten above the day's target over days [0, throughDay). Feeding the targets to the Hall
   * model with this offset reproduces the energy balance of the true world.
   */
  apparentOffsetKcal: (throughDay: number) => number;
};

export function simulateSyntheticUser(profile: UserProfile, settings: SimulationSettings, rng: Rng): SyntheticRun {
  const assessment = assessBaseline(profile, START_DATE);
  const ctx = planContextFrom(profile, assessment, assessment.populationTdeeKcal);
  const plan = buildGoalPlan(ctx, { goal: profile.goal, weeklyRate: profile.weeklyRateTarget, targetWeightKg: profile.targetWeightKg, stepTarget: profile.averageSteps7d });
  if (plan.status !== 'ok' || plan.calorieTargetKcal === null || plan.macros === null) throw new Error(`synthetic plan failed: ${plan.status}`);
  const calorieTarget = plan.calorieTargetKcal;
  const stepTarget = profile.averageSteps7d;
  const macros = plan.macros.exact;

  // True world: maintenance shifted by the true offset.
  const p = hallParametersFor(ctx, profile.goal, settings.trueOffsetKcal);
  const planInput = hallInputFor(ctx, profile.goal, { calorieTargetKcal: calorieTarget, stepsPerDay: stepTarget });
  let state = initialState(p);
  const trueWeights: number[] = [];
  const logs: DailyLog[] = [];
  const extras: number[] = [];
  for (let d = 0; d <= settings.days; d++) {
    trueWeights.push(bodyWeightOf(p, state));
    if (d === settings.days) break;
    const r = rng.next();
    let adherence: DailyLog['adherence'];
    let extra = 0;
    if (r < settings.majorDeviationFraction) {
      adherence = 'major_deviation';
      extra = rng.uniform(settings.majorExtraKcal[0], settings.majorExtraKcal[1]);
    } else if (r < settings.majorDeviationFraction + settings.minorDeviationFraction) {
      adherence = 'minor_deviation';
      extra = rng.uniform(settings.minorExtraKcal[0], settings.minorExtraKcal[1]);
    } else {
      adherence = 'on_plan';
    }
    const reported = !rng.chance(settings.unreportedFraction);
    const actualSteps = Math.max(0, Math.round(stepTarget * (1 + 0.2 * rng.normal())));
    const stepsLogged = rng.chance(settings.stepLogProbability);
    extras.push(extra);
    const intake = calorieTarget + extra;
    const ratio = intake / calorieTarget;
    const stepDelta =
      netStepKcal({ steps: actualSteps, pace: profile.walkingPace, weightKg: profile.currentWeightKg, ageYears: profile.ageYears }) -
      netStepKcal({ steps: profile.averageSteps7d, pace: profile.walkingPace, weightKg: profile.currentWeightKg, ageYears: profile.ageYears });
    state = advance(
      p,
      state,
      {
        intakeKcal: intake,
        carbKcal: planInput.carbKcal * ratio,
        paDeltaKcalPerKgDay: stepDelta / profile.currentWeightKg,
        sodiumDeltaMg: 0,
      },
      1,
    );
    const log: DailyLog = { date: addDays(START_DATE, d), calorieTargetForDay: calorieTarget, stepTargetForDay: stepTarget, macrosForDay: macros };
    if (stepsLogged) log.actualSteps = actualSteps;
    if (reported && adherence) log.adherence = adherence;
    logs.push(log);
  }

  const observed: WeightEntry[] = [];
  for (let d = 0; d <= settings.days; d += settings.weighEveryDays) {
    const noise = settings.noiseScaleKg * rng.studentT(4);
    const w = trueWeights[d] as number;
    observed.push({ id: `w${d}`, date: addDays(START_DATE, d), weightKg: d === 0 ? profile.currentWeightKg + noise : w + noise, createdAt: `${addDays(START_DATE, d)}T07:00:00Z` });
  }

  return {
    profile,
    trueWeights,
    populationTdeeKcal: assessment.populationTdeeKcal,
    apparentOffsetKcal: (throughDay) => settings.trueOffsetKcal - extras.slice(0, throughDay).reduce((s, x) => s + x, 0) / throughDay,
    calibrationInputFor: (throughDay) => ({
      sex: profile.sexForEquation,
      ageYears: profile.ageYears,
      heightCm: profile.heightCm,
      walkingPace: profile.walkingPace,
      populationTdeeAtStartKcal: assessment.populationTdeeKcal,
      reeAtStartKcal: assessment.ree.reeKcalDay,
      maintenanceStepsPerDay: profile.averageSteps7d,
      priorSigmaKcal: assessment.sigma.sigmaKcal,
      baselineCarbFraction: baselineCarbFractionFor(ctx, profile.goal),
      weights: observed.filter((w) => w.date <= addDays(START_DATE, throughDay)),
      dailyLogs: logs.filter((l) => l.date < addDays(START_DATE, throughDay)),
    }),
  };
}
