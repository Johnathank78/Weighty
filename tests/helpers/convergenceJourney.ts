/**
 * End-to-end convergence journey (IMPLEMENTATION_NOTES D-34): a virtual user goes through the real domain engine,
 * onboarding, weigh-ins, adherence and steps, and accepts every surfaced recalibration. The true body is the Hall model
 * with a maintenance shifted by a hidden offset, plus autocorrelated water and scale noise.
 */
import { netStepKcal } from '@/science/activity';
import { assessBaseline, planContextFrom } from '@/science/assessment';
import { addDays } from '@/science/dates';
import { baselineCarbFractionFor } from '@/science/goals';
import { advance, bodyWeightOf, initialState, initializeHall } from '@/science/hall/model';
import type { UserProfile } from '@/science/types';
import { addWeight, applyRecalibration, completeOnboarding, computeCalibrationState, setActualSteps, setAdherence } from '@/domain/engine';
import type { CalibrationState } from '@/domain/engine';
import type { WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { createRng } from './random';

export const JOURNEY_START = '2026-01-05';

export const JOURNEY_PROFILE: UserProfile = {
  ageYears: 32,
  sexForEquation: 'female',
  heightCm: 165,
  currentWeightKg: 72,
  averageSteps7d: 7000,
  walkingPace: 'normal',
  occupation: 'seated',
  activities: [{ type: 'strength', sessionsPerWeek: 2, durationMin: 45, intensity: 'moderate' }],
  goal: 'loss',
  targetWeightKg: 64,
  weeklyRateTarget: 0.005,
};

export type JourneyScenario = {
  key: string;
  /** Metabolic offset of the true body relative to NASEM at the start weight, kcal/day. */
  trueOffsetKcal: number;
  /** Share of days with undeclared extra intake, and its amount. */
  hiddenFraction: number;
  hiddenKcal: number;
  seed: number;
};

export type JourneyEvent = { day: number; fromKcal: number; toKcal: number; maintenanceKcal: number; confidence: string; width80Kcal: number };

export type JourneyResult = {
  store: WheightyStore;
  events: JourneyEvent[];
  /** Calorie target in force at the start of each day (index = day). */
  calorieTargets: number[];
  hardFloorKcal: number;
  firstGateDay: number | null;
  finalState: CalibrationState | null;
  /** Apparent offset over the observation window (D-31): metabolic offset minus mean extra intake eaten. */
  apparentOffsetKcal: number;
};

export type JourneyOptions = {
  /** Compute the calibration state every n days only (long stores for performance checks). */
  calibrationEveryDays?: number;
  /** First day of the journey (defaults to JOURNEY_START). */
  startDate?: string;
};

export function runJourney(scenario: JourneyScenario, days: number, options: JourneyOptions = {}): JourneyResult {
  const rng = createRng(scenario.seed);
  const start = options.startDate ?? JOURNEY_START;
  const profile = JOURNEY_PROFILE;
  const onboarding = completeOnboarding(emptyStore(), profile, start, `${start}T07:00:00.000Z`);
  if (!onboarding.ok) throw new Error(onboarding.reason);
  let store = onboarding.store;
  const assessment = assessBaseline(profile, start);
  const ctx = planContextFrom(profile, assessment, assessment.populationTdeeKcal);
  const body = initializeHall({
    sex: profile.sexForEquation,
    ageYears: profile.ageYears,
    heightM: profile.heightCm / 100,
    bodyWeightKg: profile.currentWeightKg,
    baselineIntakeKcal: assessment.populationTdeeKcal + scenario.trueOffsetKcal,
    baselineRmrKcal: assessment.ree.reeKcalDay,
    baselineCarbFraction: baselineCarbFractionFor(ctx, profile.goal),
  });
  let state = initialState(body);
  let water = 0;
  let extraSum = 0;
  const events: JourneyEvent[] = [];
  const calorieTargets: number[] = [];
  let firstGateDay: number | null = null;
  let finalState: CalibrationState | null = null;
  const every = options.calibrationEveryDays ?? 1;

  for (let d = 0; d <= days; d++) {
    const date = addDays(start, d);
    const trueWeight = bodyWeightOf(body, state) + water;
    if (d > 0 && rng.next() < 6 / 7) {
      store = addWeight(store, { date, weightKg: Math.round((trueWeight + 0.25 * rng.studentT(4)) * 10) / 10 }, `${date}T07:00:00.000Z`);
    }
    if (d % every === 0 || d === days) {
      const calibration = computeCalibrationState(store, date, `${date}T08:00:00.000Z`);
      if (calibration?.gate.met && firstGateDay === null) firstGateDay = d;
      finalState = calibration;
      if (calibration?.surfaced && calibration.candidate) {
        const from = store.plan?.calorieTarget ?? 0;
        const applied = applyRecalibration(store, calibration, date, `${date}T08:00:00.000Z`);
        if (applied.ok) {
          store = applied.store;
          const [lo, hi] = calibration.candidate.interval80;
          events.push({ day: d, fromKcal: from, toKcal: store.plan?.calorieTarget ?? 0, maintenanceKcal: store.plan?.maintenanceKcal ?? 0, confidence: calibration.candidate.confidence, width80Kcal: hi - lo });
        }
      }
    }
    const plan = store.plan;
    if (!plan) throw new Error('journey lost its plan');
    calorieTargets.push(plan.calorieTarget);
    if (d === days) break;

    const r = rng.next();
    let adherence: 'on_plan' | 'minor_deviation' | 'major_deviation' = 'on_plan';
    let extra = 0;
    if (r < 0.03) {
      adherence = 'major_deviation';
      extra = rng.uniform(700, 1100);
    } else if (r < 0.18) {
      adherence = 'minor_deviation';
      extra = rng.uniform(150, 350);
    }
    if (rng.next() < scenario.hiddenFraction) extra += scenario.hiddenKcal;
    extraSum += extra;
    if (rng.next() < 0.85) store = setAdherence(store, date, adherence);
    const steps = Math.max(0, Math.round(plan.stepTarget * (1 + 0.15 * rng.normal())));
    if (rng.next() < 0.6) store = setActualSteps(store, date, steps);
    const intake = plan.calorieTarget + extra;
    const stepDelta =
      netStepKcal({ steps, pace: profile.walkingPace, weightKg: profile.currentWeightKg, ageYears: profile.ageYears }) -
      netStepKcal({ steps: profile.averageSteps7d, pace: profile.walkingPace, weightKg: profile.currentWeightKg, ageYears: profile.ageYears });
    state = advance(body, state, { intakeKcal: intake, carbKcal: plan.macros.carbsG * 4 * (intake / plan.calorieTarget), paDeltaKcalPerKgDay: stepDelta / profile.currentWeightKg, sodiumDeltaMg: 0 }, 1);
    water = 0.7 * water + Math.sqrt(1 - 0.49) * 0.35 * rng.normal();
  }

  return {
    store,
    events,
    calorieTargets,
    hardFloorKcal: store.plan?.hardFloorKcal ?? 0,
    firstGateDay,
    finalState,
    apparentOffsetKcal: scenario.trueOffsetKcal - extraSum / days,
  };
}
