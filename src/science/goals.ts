/**
 * Goal engine, calorie solver, projection and Calories/Steps slider
 * (instruct/04). Every weight trajectory comes from the Hall dynamic model.
 */
import { netStepKcal } from './activity';
import {
  ABSOLUTE_MIN_CALORIES_FEMALE,
  ABSOLUTE_MIN_CALORIES_MALE,
  DAYS_PER_WEEK,
  DISPLAY_STEPS_ROUNDING,
  ENERGY_AVAILABILITY_CAUTION_KCAL_PER_KG_FFM,
  GAIN_RATE_DEFAULT,
  GAIN_RATE_GENTLE_ZONE_MAX,
  GAIN_RATE_HARD_MAX,
  GAIN_RATE_MIN,
  GAIN_RATE_MODERATE_ZONE_MAX,
  GAIN_RESISTANCE_CONTEXT_MIN_SESSIONS,
  GOAL_SOLVER_CALORIE_TOLERANCE_KCAL,
  GOAL_SOLVER_HORIZON_DAYS,
  GOAL_SOLVER_MAX_INTAKE_KCAL,
  GOAL_SOLVER_MAX_ITERATIONS,
  GOAL_SOLVER_MIN_INTAKE_KCAL,
  GOAL_SOLVER_WEIGHT_TOLERANCE_KG,
  HALL_BASELINE_CARB_FRACTION,
  HALL_BODY_FAT_MIN_QUALITY,
  KCAL_PER_G_CARB,
  LOSS_GENTLE_ONLY_BMI_BELOW,
  LOSS_MODERATE_MAX_BMI_BELOW,
  LOSS_RATE_DEFAULT,
  LOSS_RATE_GENTLE_ZONE_MAX,
  LOSS_RATE_HARD_MAX,
  LOSS_RATE_MAX_BMI_UNDER_22,
  LOSS_RATE_MAX_BMI_UNDER_25,
  LOSS_RATE_MIN,
  LOSS_RATE_MODERATE_ZONE_MAX,
  LOSS_UNAVAILABLE_BMI_BELOW,
  MAINTENANCE_ZONE_FRACTION,
  MAINTENANCE_ZONE_MAX_KG,
  MAINTENANCE_ZONE_MIN_KG,
  PROJECTION_MAX_DAYS,
  PROJECTION_SAMPLE_EVERY_DAYS,
  RELATIVE_MIN_CALORIES_REE_FRACTION,
  SLIDER_HARD_MAX_STEPS,
  SLIDER_MAX_STEPS_ABOVE_BASELINE,
  SLIDER_MAX_STEPS_CEILING,
  SLIDER_MIN_STEPS_BELOW_BASELINE,
  SLIDER_MIN_STEPS_FLOOR,
  SLIDER_RECOMMENDED_HALF_WIDTH_STEPS,
  TARGET_BMI_MIN,
  WEEKLY_RATE_STEP,
} from './constants';
import { bisect } from './hall/solver';
import { initializeHall, simulateHall } from './hall/model';
import type { HallDailyInput, HallParameters } from './hall/model';
import { bmi, computeMacros, roundToStep } from './macros';
import type { MacroResult } from './macros';
import { BODY_FAT_QUALITY } from './ree';
import type { BodyFatMethod, Goal, Interval, MacroActivityClass, SexForEquation, SpeedZone, StructuredActivity, TrajectoryPoint, WalkingPace } from './types';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type PlanContext = {
  sex: SexForEquation;
  ageYears: number;
  heightCm: number;
  /** Trend weight when available, onboarding weight otherwise. */
  currentWeightKg: number;
  /** Initial NASEM-based or calibrated maintenance, kcal/day. */
  maintenanceKcal: number;
  reeKcal: number;
  walkingPace: WalkingPace;
  /** Daily steps already represented inside maintenanceKcal. */
  maintenanceStepsPerDay: number;
  activities: readonly StructuredActivity[];
  activityClass: MacroActivityClass;
  athleteLike: boolean;
  bodyFatPercent?: number | undefined;
  bodyFatMethod?: BodyFatMethod | undefined;
  /** Plausible FFM from a high-quality method (4C, ADP, DXA), for energy availability. */
  highQualityFfmKg: number | null;
  /** Daily average net structured exercise energy, kcal/day. */
  exerciseNetKcalDay: number;
  /** Whether structured training load is high (energy availability guardrail). */
  highTrainingLoad: boolean;
};

export type Scenario = {
  calorieTargetKcal: number;
  stepsPerDay: number;
};

/** Hard calorie floor: max(sex-specific absolute floor, 0.7 x REE) (04 s3, IMPLEMENTATION_NOTES D-32). */
export function hardFloorKcal(reeKcal: number, sex: SexForEquation): number {
  const absolute = sex === 'male' ? ABSOLUTE_MIN_CALORIES_MALE : ABSOLUTE_MIN_CALORIES_FEMALE;
  return Math.max(absolute, RELATIVE_MIN_CALORIES_REE_FRACTION * reeKcal);
}

export function macrosFor(ctx: PlanContext, goal: Goal, calorieTargetKcal: number): MacroResult {
  return computeMacros({
    weightKg: ctx.currentWeightKg,
    heightCm: ctx.heightCm,
    bodyFatPercent: ctx.bodyFatPercent,
    bodyFatMethod: ctx.bodyFatMethod,
    athleteLike: ctx.athleteLike,
    activityClass: ctx.activityClass,
    goal,
    calorieTargetKcal,
  });
}

/**
 * Carbohydrate energy share of the plan diet at maintenance calories. Used as the Hall
 * baseline diet so that adopting the recommended macro split is not misread as a glycogen
 * and water shift (IMPLEMENTATION_NOTES D-16).
 */
export function baselineCarbFractionFor(ctx: PlanContext, goal: Goal): number {
  const m = macrosFor(ctx, goal, ctx.maintenanceKcal);
  const fraction = (Math.max(0, m.exact.carbsG) * KCAL_PER_G_CARB) / ctx.maintenanceKcal;
  return fraction > 0 ? fraction : HALL_BASELINE_CARB_FRACTION;
}

export function hallParametersFor(ctx: PlanContext, goal: Goal, maintenanceOffsetKcal = 0): HallParameters {
  const hqFat =
    ctx.bodyFatPercent !== undefined && ctx.bodyFatMethod !== undefined && BODY_FAT_QUALITY[ctx.bodyFatMethod] >= HALL_BODY_FAT_MIN_QUALITY
      ? (ctx.currentWeightKg * ctx.bodyFatPercent) / 100
      : undefined;
  return initializeHall({
    sex: ctx.sex,
    ageYears: ctx.ageYears,
    heightM: ctx.heightCm / 100,
    bodyWeightKg: ctx.currentWeightKg,
    baselineIntakeKcal: ctx.maintenanceKcal + maintenanceOffsetKcal,
    baselineRmrKcal: ctx.reeKcal,
    initialFatKg: hqFat,
    baselineCarbFraction: baselineCarbFractionFor(ctx, goal),
  });
}

/** Physical-activity parameter change produced by a step target different from the maintenance steps. */
export function paDeltaForSteps(ctx: PlanContext, stepsPerDay: number): number {
  const kcal =
    netStepKcal({ steps: stepsPerDay, pace: ctx.walkingPace, weightKg: ctx.currentWeightKg, ageYears: ctx.ageYears }) -
    netStepKcal({ steps: ctx.maintenanceStepsPerDay, pace: ctx.walkingPace, weightKg: ctx.currentWeightKg, ageYears: ctx.ageYears });
  return kcal / ctx.currentWeightKg;
}

/**
 * Daily Hall input for a plan. The macro composition reaches the model only through carbohydrate
 * (glycogen and water); TEF is the model's native beta_TEF term (D-01), never a macro-specific value.
 */
export function hallInputFor(ctx: PlanContext, goal: Goal, scenario: Scenario): HallDailyInput {
  const macros = macrosFor(ctx, goal, scenario.calorieTargetKcal);
  // Infeasible macro plans (negative carbohydrate) are never saved; for the solver we clamp carbohydrate at 0.
  const carbsG = Math.max(0, macros.exact.carbsG);
  return {
    intakeKcal: scenario.calorieTargetKcal,
    carbKcal: carbsG * KCAL_PER_G_CARB,
    paDeltaKcalPerKgDay: paDeltaForSteps(ctx, scenario.stepsPerDay),
    sodiumDeltaMg: 0,
  };
}

export function weightAtDay(ctx: PlanContext, goal: Goal, scenario: Scenario, day: number, maintenanceOffsetKcal = 0): number {
  const p = hallParametersFor(ctx, goal, maintenanceOffsetKcal);
  const u = hallInputFor(ctx, goal, scenario);
  const r = simulateHall(p, day, () => u, { recordEveryDays: day });
  return r.days[r.days.length - 1]?.bodyWeightKg ?? Number.NaN;
}

export type CalorieSolve = {
  calorieTargetKcal: number;
  weightAtHorizonKg: number;
  targetWeightAtHorizonKg: number;
  iterations: number;
  converged: boolean;
};

/** Constant daily intake giving the requested Hall-model weight at the 42-day horizon (04 s6). */
export function solveCaloriesForWeightAtHorizon(ctx: PlanContext, goal: Goal, stepsPerDay: number, targetWeightKg: number): CalorieSolve {
  const r = bisect({
    lo: GOAL_SOLVER_MIN_INTAKE_KCAL,
    hi: GOAL_SOLVER_MAX_INTAKE_KCAL,
    f: (kcal) => weightAtDay(ctx, goal, { calorieTargetKcal: kcal, stepsPerDay }, GOAL_SOLVER_HORIZON_DAYS),
    target: targetWeightKg,
    increasing: true,
    maxIterations: GOAL_SOLVER_MAX_ITERATIONS,
    xTolerance: GOAL_SOLVER_CALORIE_TOLERANCE_KCAL,
    yTolerance: GOAL_SOLVER_WEIGHT_TOLERANCE_KG,
  });
  return { calorieTargetKcal: r.x, weightAtHorizonKg: r.y, targetWeightAtHorizonKg: targetWeightKg, iterations: r.iterations, converged: r.converged && r.bracketed };
}

// ---------------------------------------------------------------------------
// Continuous weekly rate (percent of body weight per week) and guardrails (04 s2-s3, D-22)
// ---------------------------------------------------------------------------

export type WeeklyRateRange = { minRate: number; maxRate: number; defaultRate: number; step: number };

/** General v1 slider range for a goal, before profile guardrails. Maintenance has no speed. */
export function weeklyRateRange(goal: Goal): WeeklyRateRange {
  if (goal === 'loss') return { minRate: LOSS_RATE_MIN, maxRate: LOSS_RATE_HARD_MAX, defaultRate: LOSS_RATE_DEFAULT, step: WEEKLY_RATE_STEP };
  if (goal === 'gain') return { minRate: GAIN_RATE_MIN, maxRate: GAIN_RATE_HARD_MAX, defaultRate: GAIN_RATE_DEFAULT, step: WEEKLY_RATE_STEP };
  return { minRate: 0, maxRate: 0, defaultRate: 0, step: WEEKLY_RATE_STEP };
}

export function hardMaxWeeklyRate(goal: Goal): number {
  return weeklyRateRange(goal).maxRate;
}

/** Snaps a rate onto the slider grid (0.05 percent per week), removing floating noise. */
export function snapWeeklyRate(rate: number): number {
  return Math.round(Math.round(rate / WEEKLY_RATE_STEP) * WEEKLY_RATE_STEP * 1e6) / 1e6;
}

/** Qualitative zone of a rate: labels only, never presets. */
export function speedZoneFor(goal: Goal, rate: number): SpeedZone {
  const [gentleMax, moderateMax] = goal === 'gain' ? [GAIN_RATE_GENTLE_ZONE_MAX, GAIN_RATE_MODERATE_ZONE_MAX] : [LOSS_RATE_GENTLE_ZONE_MAX, LOSS_RATE_MODERATE_ZONE_MAX];
  if (rate < gentleMax) return 'gentle';
  if (rate < moderateMax) return 'moderate';
  return 'fast';
}

export type LossAvailability =
  | { available: false; reason: 'current_bmi_below_20' }
  | { available: true; maxRate: number };

export function lossAvailability(currentBmi: number): LossAvailability {
  if (currentBmi < LOSS_UNAVAILABLE_BMI_BELOW) return { available: false, reason: 'current_bmi_below_20' };
  if (currentBmi < LOSS_GENTLE_ONLY_BMI_BELOW) return { available: true, maxRate: LOSS_RATE_MAX_BMI_UNDER_22 };
  if (currentBmi < LOSS_MODERATE_MAX_BMI_BELOW) return { available: true, maxRate: LOSS_RATE_MAX_BMI_UNDER_25 };
  return { available: true, maxRate: LOSS_RATE_HARD_MAX };
}

/** Rate cap from BMI guardrails (loss) or the hard product maximum (gain). */
export function guardrailMaxWeeklyRate(goal: Goal, currentBmi: number): number | null {
  if (goal === 'maintenance') return 0;
  if (goal === 'gain') return GAIN_RATE_HARD_MAX;
  const a = lossAvailability(currentBmi);
  return a.available ? a.maxRate : null;
}

export function maintenanceZone(targetWeightKg: number): { lowKg: number; highKg: number; halfWidthKg: number } {
  const halfWidthKg = Math.min(MAINTENANCE_ZONE_MAX_KG, Math.max(MAINTENANCE_ZONE_MIN_KG, MAINTENANCE_ZONE_FRACTION * targetWeightKg));
  return { lowKg: targetWeightKg - halfWidthKg, highKg: targetWeightKg + halfWidthKg, halfWidthKg };
}

export function targetWeightAtHorizon(goal: Goal, currentWeightKg: number, weeklyRate: number): number {
  const weeks = GOAL_SOLVER_HORIZON_DAYS / DAYS_PER_WEEK;
  if (goal === 'loss') return currentWeightKg * Math.pow(1 - weeklyRate, weeks);
  if (goal === 'gain') return currentWeightKg * Math.pow(1 + weeklyRate, weeks);
  return currentWeightKg;
}

export type GoalPlanStatus =
  | 'ok'
  | 'loss_unavailable_low_bmi'
  | 'target_bmi_too_low'
  | 'target_not_below_current'
  | 'target_not_above_current'
  | 'no_feasible_speed';

export type RateRejectionReason = 'above_guardrail_cap' | 'below_hard_floor' | 'macro_infeasible' | 'solver_not_converged';

export type GoalPlanRejection = {
  weeklyRate: number;
  reason: RateRejectionReason;
};

export type GoalPlan = {
  status: GoalPlanStatus;
  goal: Goal;
  /** Rate requested by the user (fraction of body weight per week). */
  requestedWeeklyRate: number;
  /** True when the applied rate is slower than the requested one (guardrails), shown to the user. */
  rateAdjusted: boolean;
  rejections: GoalPlanRejection[];
  /** Applied rate (fraction of body weight per week), 0 for maintenance. */
  weeklyRateTarget: number;
  stepTarget: number;
  calorieTargetKcal: number | null;
  macros: MacroResult | null;
  solve: CalorieSolve | null;
  hardFloorKcal: number;
  /** BMI guardrail cap (loss) or hard maximum (gain), null when not applicable. */
  guardrailMaxRate: number | null;
  warnings: {
    belowRee: boolean;
    lowEnergyAvailability: boolean;
    gainWithoutResistance: boolean;
    lowCarbForEndurance: boolean;
    lowCarbForResistance: boolean;
  };
  energyAvailabilityKcalPerKgFfm: number | null;
};

function strengthSessions(activities: readonly StructuredActivity[]): number {
  return activities.filter((a) => a.type === 'strength').reduce((s, a) => s + a.sessionsPerWeek, 0);
}

export function energyAvailability(ctx: PlanContext, calorieTargetKcal: number): number | null {
  if (!(ctx.athleteLike || ctx.highTrainingLoad) || ctx.highQualityFfmKg === null) return null;
  return (calorieTargetKcal - ctx.exerciseNetKcalDay) / ctx.highQualityFfmKg;
}

export type RateEvaluation =
  | { ok: true; weeklyRate: number; solve: CalorieSolve; macros: MacroResult }
  | { ok: false; weeklyRate: number; reason: Exclude<RateRejectionReason, 'above_guardrail_cap'> };

/** Solves the 42-day calorie target for one weekly rate and checks the floor and macro feasibility. */
export function evaluateWeeklyRate(ctx: PlanContext, goal: Goal, weeklyRate: number, stepTarget: number): RateEvaluation {
  const target42 = targetWeightAtHorizon(goal, ctx.currentWeightKg, weeklyRate);
  const solve = solveCaloriesForWeightAtHorizon(ctx, goal, stepTarget, target42);
  if (!solve.converged) return { ok: false, weeklyRate, reason: 'solver_not_converged' };
  if (solve.calorieTargetKcal < hardFloorKcal(ctx.reeKcal, ctx.sex)) return { ok: false, weeklyRate, reason: 'below_hard_floor' };
  const macros = macrosFor(ctx, goal, solve.calorieTargetKcal);
  if (!macros.feasible) return { ok: false, weeklyRate, reason: 'macro_infeasible' };
  return { ok: true, weeklyRate, solve, macros };
}

/** Grid of candidate rates from `fromRate` down to the goal minimum, fastest first. */
function descendingRateGrid(goal: Goal, fromRate: number): number[] {
  const { minRate } = weeklyRateRange(goal);
  const out: number[] = [];
  for (let r = snapWeeklyRate(fromRate); r >= minRate - 1e-9; r = snapWeeklyRate(r - WEEKLY_RATE_STEP)) out.push(r);
  return out;
}

export type SelectableRateLimit = {
  /** Fastest selectable rate for this profile, null when no rate is feasible. */
  maxSelectableRate: number | null;
  /** What limits the slider below the general maximum. */
  limitedBy: 'bmi_guardrail' | RateRejectionReason | null;
  guardrailMaxRate: number | null;
};

/**
 * Fastest weekly rate on the slider grid that the goal engine will accept for this profile
 * (BMI guardrails, calorie floor, macro feasibility). Used to bound the speed slider so the
 * engine never silently refuses a selected speed (04 s2, D-22).
 */
export function maxSelectableWeeklyRate(ctx: PlanContext, goal: Goal, stepTarget: number): SelectableRateLimit {
  if (goal === 'maintenance') return { maxSelectableRate: 0, limitedBy: null, guardrailMaxRate: 0 };
  const general = weeklyRateRange(goal).maxRate;
  const cap = guardrailMaxWeeklyRate(goal, bmi(ctx.currentWeightKg, ctx.heightCm));
  if (cap === null) return { maxSelectableRate: null, limitedBy: 'bmi_guardrail', guardrailMaxRate: null };
  let limitedBy: SelectableRateLimit['limitedBy'] = cap < general - 1e-9 ? 'bmi_guardrail' : null;
  for (const rate of descendingRateGrid(goal, cap)) {
    const e = evaluateWeeklyRate(ctx, goal, rate, stepTarget);
    if (e.ok) return { maxSelectableRate: rate, limitedBy, guardrailMaxRate: cap };
    limitedBy = e.reason;
  }
  return { maxSelectableRate: null, limitedBy, guardrailMaxRate: cap };
}

export function buildGoalPlan(ctx: PlanContext, input: { goal: Goal; weeklyRate: number; targetWeightKg: number; stepTarget: number }): GoalPlan {
  const floor = hardFloorKcal(ctx.reeKcal, ctx.sex);
  const requested = input.goal === 'maintenance' ? 0 : snapWeeklyRate(input.weeklyRate);
  const base: GoalPlan = {
    status: 'ok',
    goal: input.goal,
    requestedWeeklyRate: requested,
    rateAdjusted: false,
    rejections: [],
    weeklyRateTarget: 0,
    stepTarget: input.stepTarget,
    calorieTargetKcal: null,
    macros: null,
    solve: null,
    hardFloorKcal: floor,
    guardrailMaxRate: null,
    warnings: { belowRee: false, lowEnergyAvailability: false, gainWithoutResistance: false, lowCarbForEndurance: false, lowCarbForResistance: false },
    energyAvailabilityKcalPerKgFfm: null,
  };

  const currentBmi = bmi(ctx.currentWeightKg, ctx.heightCm);
  let candidates: number[];
  if (input.goal === 'loss') {
    const availability = lossAvailability(currentBmi);
    if (!availability.available) return { ...base, status: 'loss_unavailable_low_bmi' };
    if (bmi(input.targetWeightKg, ctx.heightCm) < TARGET_BMI_MIN) return { ...base, status: 'target_bmi_too_low' };
    if (input.targetWeightKg >= ctx.currentWeightKg) return { ...base, status: 'target_not_below_current' };
    base.guardrailMaxRate = availability.maxRate;
  } else if (input.goal === 'gain') {
    if (input.targetWeightKg <= ctx.currentWeightKg) return { ...base, status: 'target_not_above_current' };
    base.guardrailMaxRate = GAIN_RATE_HARD_MAX;
  }
  if (input.goal === 'maintenance') {
    candidates = [0];
  } else {
    const { minRate } = weeklyRateRange(input.goal);
    const cap = base.guardrailMaxRate as number;
    if (requested > cap + 1e-9) base.rejections.push({ weeklyRate: requested, reason: 'above_guardrail_cap' });
    candidates = descendingRateGrid(input.goal, Math.max(minRate, Math.min(requested, cap)));
  }

  for (const rate of candidates) {
    const e = evaluateWeeklyRate(ctx, input.goal, rate, input.stepTarget);
    if (!e.ok) {
      base.rejections.push({ weeklyRate: rate, reason: e.reason });
      continue;
    }
    const { solve, macros } = e;
    const ea = energyAvailability(ctx, solve.calorieTargetKcal);
    return {
      ...base,
      status: 'ok',
      rateAdjusted: rate < requested - 1e-9,
      weeklyRateTarget: rate,
      calorieTargetKcal: solve.calorieTargetKcal,
      macros,
      solve,
      energyAvailabilityKcalPerKgFfm: ea,
      warnings: {
        belowRee: solve.calorieTargetKcal < ctx.reeKcal,
        lowEnergyAvailability: ea !== null && ea < ENERGY_AVAILABILITY_CAUTION_KCAL_PER_KG_FFM,
        gainWithoutResistance: input.goal === 'gain' && strengthSessions(ctx.activities) < GAIN_RESISTANCE_CONTEXT_MIN_SESSIONS,
        lowCarbForEndurance: macros.lowCarbForEndurance,
        lowCarbForResistance: macros.lowCarbForResistance,
      },
    };
  }
  return { ...base, status: 'no_feasible_speed' };
}

// ---------------------------------------------------------------------------
// Projection (04 s7, 05 s14)
// ---------------------------------------------------------------------------

export type Projection = {
  trajectory: TrajectoryPoint[];
  lower80: TrajectoryPoint[];
  upper80: TrajectoryPoint[];
  daysToTarget: number | null;
  approximateWeeks?: number;
  reachedWithinWindow: boolean;
  horizonDays: number;
};

export type ProjectionInput = {
  goal: Goal;
  scenario: Scenario;
  targetWeightKg: number;
  /** Maintenance offsets (kcal/day) at the lower and upper bounds of the current 80 percent interval, relative to the central maintenance. */
  maintenanceOffsets80: Interval;
  /** Horizon used for maintenance goals (no target to reach). */
  maintenanceHorizonDays: number;
};

function sampleTrajectory(ctx: PlanContext, goal: Goal, scenario: Scenario, days: number, offset: number, stopAt?: (w: number) => boolean) {
  const p = hallParametersFor(ctx, goal, offset);
  const u = hallInputFor(ctx, goal, scenario);
  return simulateHall(p, days, () => u, {
    recordEveryDays: PROJECTION_SAMPLE_EVERY_DAYS,
    ...(stopAt ? { stopWhen: (d) => stopAt(d.bodyWeightKg) } : {}),
  });
}

export function projectPlan(ctx: PlanContext, input: ProjectionInput): Projection {
  const { goal, scenario, targetWeightKg } = input;
  let horizonDays: number;
  let daysToTarget: number | null = null;
  if (goal === 'maintenance') {
    horizonDays = input.maintenanceHorizonDays;
  } else {
    const reached = (w: number) => (goal === 'loss' ? w <= targetWeightKg : w >= targetWeightKg);
    const central = sampleTrajectory(ctx, goal, scenario, PROJECTION_MAX_DAYS, 0, reached);
    if (central.stoppedEarly) {
      daysToTarget = central.finalDay;
      horizonDays = central.finalDay;
    } else {
      horizonDays = PROJECTION_MAX_DAYS;
    }
  }
  const central = sampleTrajectory(ctx, goal, scenario, horizonDays, 0);
  const a = sampleTrajectory(ctx, goal, scenario, horizonDays, input.maintenanceOffsets80[0]);
  const b = sampleTrajectory(ctx, goal, scenario, horizonDays, input.maintenanceOffsets80[1]);
  const trajectory = central.days.map((d) => ({ day: d.day, weightKg: d.bodyWeightKg }));
  const lower80: TrajectoryPoint[] = [];
  const upper80: TrajectoryPoint[] = [];
  central.days.forEach((d, i) => {
    const wa = a.days[i]?.bodyWeightKg ?? d.bodyWeightKg;
    const wb = b.days[i]?.bodyWeightKg ?? d.bodyWeightKg;
    lower80.push({ day: d.day, weightKg: Math.min(wa, wb) });
    upper80.push({ day: d.day, weightKg: Math.max(wa, wb) });
  });
  const projection: Projection = { trajectory, lower80, upper80, daysToTarget, reachedWithinWindow: daysToTarget !== null, horizonDays };
  if (daysToTarget !== null) projection.approximateWeeks = Math.max(1, Math.round(daysToTarget / DAYS_PER_WEEK));
  return projection;
}

// ---------------------------------------------------------------------------
// Calories / steps slider (04 s8 to s10)
// ---------------------------------------------------------------------------

export type SliderBounds = {
  minSteps: number;
  maxSteps: number;
  recommendedMinSteps: number;
  recommendedMaxSteps: number;
};

export function sliderBounds(baselineSteps: number): SliderBounds {
  const minSteps = Math.max(SLIDER_MIN_STEPS_FLOOR, baselineSteps - SLIDER_MIN_STEPS_BELOW_BASELINE);
  const maxSteps = Math.min(SLIDER_HARD_MAX_STEPS, Math.min(SLIDER_MAX_STEPS_CEILING, baselineSteps + SLIDER_MAX_STEPS_ABOVE_BASELINE));
  return {
    minSteps,
    maxSteps: Math.max(minSteps, maxSteps),
    recommendedMinSteps: Math.max(minSteps, baselineSteps - SLIDER_RECOMMENDED_HALF_WIDTH_STEPS),
    recommendedMaxSteps: Math.min(maxSteps, baselineSteps + SLIDER_RECOMMENDED_HALF_WIDTH_STEPS),
  };
}

export type SliderZone = 'recommended' | 'caution' | 'blocked';

export type SliderPoint = {
  stepsPerDay: number;
  calorieTargetKcal: number;
  weightAtHorizonKg: number;
  baselineWeightAtHorizonKg: number;
  zone: SliderZone;
  belowHardFloor: boolean;
  macroFeasible: boolean;
  macros: MacroResult;
  /** Hall-model energy balance on day 0 (intake minus expenditure), kcal/day. */
  initialEnergyBalanceKcal: number;
  /** Projected mean weekly change over the 42-day horizon, kg/week. */
  projectedWeeklyChangeKg: number;
  converged: boolean;
};

export type SliderBaseline = {
  goal: Goal;
  /** The plan the slider is anchored on (its trajectory is preserved). */
  scenario: Scenario;
};

export function baselineWeightAtHorizon(ctx: PlanContext, baseline: SliderBaseline): number {
  return weightAtDay(ctx, baseline.goal, baseline.scenario, GOAL_SOLVER_HORIZON_DAYS);
}

export function sliderZone(steps: number, bounds: SliderBounds, blocked: boolean): SliderZone {
  if (blocked || steps < bounds.minSteps || steps > bounds.maxSteps) return 'blocked';
  if (steps < bounds.recommendedMinSteps || steps > bounds.recommendedMaxSteps) return 'caution';
  return 'recommended';
}

export function solveSliderPoint(ctx: PlanContext, baseline: SliderBaseline, stepsPerDay: number, baselineWeight42?: number): SliderPoint {
  const target = baselineWeight42 ?? baselineWeightAtHorizon(ctx, baseline);
  const solve = solveCaloriesForWeightAtHorizon(ctx, baseline.goal, stepsPerDay, target);
  const macros = macrosFor(ctx, baseline.goal, solve.calorieTargetKcal);
  const floor = hardFloorKcal(ctx.reeKcal, ctx.sex);
  const belowHardFloor = solve.calorieTargetKcal < floor;
  const bounds = sliderBounds(baseline.scenario.stepsPerDay);
  const p = hallParametersFor(ctx, baseline.goal);
  const u = hallInputFor(ctx, baseline.goal, { calorieTargetKcal: solve.calorieTargetKcal, stepsPerDay });
  const sim = simulateHall(p, 0, () => u);
  const ee0 = sim.days[0]?.energyExpenditureKcal ?? Number.NaN;
  return {
    stepsPerDay,
    calorieTargetKcal: solve.calorieTargetKcal,
    weightAtHorizonKg: solve.weightAtHorizonKg,
    baselineWeightAtHorizonKg: target,
    zone: sliderZone(stepsPerDay, bounds, belowHardFloor || !macros.feasible),
    belowHardFloor,
    macroFeasible: macros.feasible,
    macros,
    initialEnergyBalanceKcal: solve.calorieTargetKcal - ee0,
    projectedWeeklyChangeKg: ((solve.weightAtHorizonKg - ctx.currentWeightKg) / GOAL_SOLVER_HORIZON_DAYS) * DAYS_PER_WEEK,
    converged: solve.converged,
  };
}

/**
 * Lowest step count (rounded up to 100) inside the slider range whose solved calories stay at or above
 * the hard floor with feasible macros. Allowed calories are monotone in steps.
 */
export function effectiveMinSliderSteps(ctx: PlanContext, baseline: SliderBaseline, baselineWeight42?: number): number {
  const bounds = sliderBounds(baseline.scenario.stepsPerDay);
  const target = baselineWeight42 ?? baselineWeightAtHorizon(ctx, baseline);
  const ok = (steps: number) => {
    const pt = solveSliderPoint(ctx, baseline, steps, target);
    return !pt.belowHardFloor && pt.macroFeasible;
  };
  if (ok(bounds.minSteps)) return bounds.minSteps;
  let lo = bounds.minSteps;
  let hi = bounds.maxSteps;
  if (!ok(hi)) return hi;
  while (hi - lo > DISPLAY_STEPS_ROUNDING) {
    const mid = roundToStep((lo + hi) / 2, DISPLAY_STEPS_ROUNDING);
    if (mid <= lo || mid >= hi) break;
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Rounded step target (nearest 100) with calories re-solved at the rounded value (04 s10). */
export function solveRoundedSliderPoint(ctx: PlanContext, baseline: SliderBaseline, rawSteps: number, baselineWeight42?: number): SliderPoint {
  const rounded = roundToStep(rawSteps, DISPLAY_STEPS_ROUNDING);
  return solveSliderPoint(ctx, baseline, rounded, baselineWeight42);
}
