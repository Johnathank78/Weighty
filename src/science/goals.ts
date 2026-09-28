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
  LEGACY_SOLVER_HORIZON_DAYS,
  GOAL_SOLVER_MAX_INTAKE_KCAL,
  GOAL_SOLVER_MAX_ITERATIONS,
  GOAL_SOLVER_MIN_INTAKE_KCAL,
  GOAL_SOLVER_WEIGHT_TOLERANCE_KG,
  HALL_BASELINE_CARB_FRACTION,
  HALL_DT_DAYS,
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
import { advance, bodyWeightOf, derivatives, fatFromLean, initialState, initializeHall, simulateHall } from './hall/model';
import type { HallDailyInput, HallParameters, HallState } from './hall/model';
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
  /**
   * Solver options (validated as K2, reports 37 and 38; production since model 1.4.0). Absent fields take the production
   * values: start from the modeled body when one is given, rate on the tissue mass, 28-day horizon. The domain supplies the
   * modeled body (src/domain/engine.ts, solverOptionsFor). The superseded solver runs only with LEGACY_SOLVER_OPTIONS.
   */
  solver?: SolverOptions | undefined;
};

/** Where the solver starts the Hall model (prompt 37 s3.1). */
export type SolverStart = 'equilibrium' | 'currentState';
/** What the requested rate constrains at the solver horizon (prompt 37 s3.2): the tissue mass (fat + lean) in production. */
export type RateDefinition = 'fortyTwoDayWeight' | 'sustainedTissue';

/**
 * Modeled body today (prompt 37 s3.1): the calibration's own Hall model (window-start parameters, retained offset) run over
 * the window up to today. Built by `modeledBodyAt` (src/science/modeledBody.ts).
 */
export type ModeledBody = {
  params: HallParameters;
  state: HallState;
  /** Latent starting-weight intercept of the calibration (conditional posterior median), kg: modeled weight = Hall weight + shift. */
  weightShiftKg: number;
  /** Activity input of the calibration: per-kg step energy at the window-start weight, relative to its maintenance steps. */
  steps: { weightKg: number; ageYears: number; pace: WalkingPace; maintenanceStepsPerDay: number };
};

export type SolverOptions = {
  solverStart?: SolverStart | undefined;
  rateDefinition?: RateDefinition | undefined;
  /** currentState: the modeled body today. Null or absent (no calibration yet): the solver keeps the equilibrium start. */
  modeledBody?: ModeledBody | null | undefined;
  /** currentState projection band: the modeled body at the retained offset + delta (kcal/day). */
  modeledBodyAtOffsetDelta?: ((deltaKcal: number) => ModeledBody | null) | undefined;
  /**
   * Solver horizon, days (prompt 38 s3.2). Absent: the production horizon GOAL_SOLVER_HORIZON_DAYS (28). It sets the
   * horizon of the target, of the solve and of the slider: W x (1 -/+ r)^(H/7) (weight) or start tissue +
   * W x ((1 -/+ r)^(H/7) - 1) (sustainedTissue).
   */
  solverHorizonDays?: number | undefined;
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
  if (currentStateBody(ctx) !== null) {
    const o = solverOrigin(ctx, goal, maintenanceOffsetKcal);
    return bodyWeightOf(o.p, simulateFromOrigin(o, day, originInput(ctx, goal, o, scenario)).finalState) + o.shiftKg;
  }
  const p = hallParametersFor(ctx, goal, maintenanceOffsetKcal);
  const u = hallInputFor(ctx, goal, scenario);
  const r = simulateHall(p, day, () => u, { recordEveryDays: day });
  return r.days[r.days.length - 1]?.bodyWeightKg ?? Number.NaN;
}

export type CalorieSolve = {
  calorieTargetKcal: number;
  /** Model value at the horizon: the body weight, or the tissue mass (fat + lean) under `sustainedTissue`. */
  weightAtHorizonKg: number;
  /** Target of that value (same unit). */
  targetWeightAtHorizonKg: number;
  iterations: number;
  converged: boolean;
  /** Production solver (K2): start, rate definition and horizon of the solve. Absent under the legacy options. */
  origin?: SolverOriginSummary;
};

// ---------------------------------------------------------------------------
// Solver (K2, prompts 37 and 38, production since model 1.4.0): start state, rate definition, horizon
// ---------------------------------------------------------------------------

export type SolverOriginSummary = {
  solverStart: SolverStart;
  rateDefinition: RateDefinition;
  /** Horizon of the solve, days (prompt 38 s3.2). */
  horizonDays: number;
  /** Reference weight of the plan: modeled weight today (currentState) or the context weight (equilibrium), kg. */
  referenceWeightKg: number;
  /** Tissue mass (fat + lean) of the start state, kg. */
  startTissueKg: number;
};

type SolverOrigin = {
  p: HallParameters;
  s0: HallState;
  shiftKg: number;
  referenceWeightKg: number;
  paDelta: (stepsPerDay: number) => number;
  start: SolverStart;
};

/**
 * Options of the superseded solver (models up to 1.3.0: equilibrium start, body weight at 42 days). Comparison only
 * (tests, reports): the app never passes them.
 */
export const LEGACY_SOLVER_OPTIONS = { solverStart: 'equilibrium', rateDefinition: 'fortyTwoDayWeight', solverHorizonDays: LEGACY_SOLVER_HORIZON_DAYS } as const satisfies SolverOptions;

function currentStateBody(ctx: PlanContext): ModeledBody | null {
  return (ctx.solver?.solverStart ?? 'currentState') === 'currentState' ? (ctx.solver?.modeledBody ?? null) : null;
}

function rateDefinitionOf(ctx: PlanContext): RateDefinition {
  return ctx.solver?.rateDefinition ?? 'sustainedTissue';
}

/** Horizon of the solver, days: the option `solverHorizonDays` (prompt 38), else the production 28 days. */
export function solverHorizonDaysOf(ctx: PlanContext): number {
  return ctx.solver?.solverHorizonDays ?? GOAL_SOLVER_HORIZON_DAYS;
}

/**
 * True for the production solver (K2). False only under the superseded solver's options (LEGACY_SOLVER_OPTIONS, or any
 * equivalent: no modeled body, weight at 42 days): its code paths run unchanged, bit for bit.
 */
export function solverOptionsActive(ctx: PlanContext): boolean {
  return currentStateBody(ctx) !== null || rateDefinitionOf(ctx) === 'sustainedTissue' || solverHorizonDaysOf(ctx) !== LEGACY_SOLVER_HORIZON_DAYS;
}

function originFromBody(body: ModeledBody): SolverOrigin {
  const s = body.steps;
  const net = (steps: number) => netStepKcal({ steps, pace: s.pace, weightKg: s.weightKg, ageYears: s.ageYears });
  return {
    p: body.params,
    s0: body.state,
    shiftKg: body.weightShiftKg,
    referenceWeightKg: bodyWeightOf(body.params, body.state) + body.weightShiftKg,
    // Same expression as the calibration's Hall input (src/science/calibration.ts, fitCalibration).
    paDelta: (steps) => (net(steps) - net(s.maintenanceStepsPerDay)) / s.weightKg,
    start: 'currentState',
  };
}

/**
 * Start of the solver: the modeled body today (currentState with a calibration), else the production equilibrium at the
 * context weight and maintenance (+ offset).
 */
function solverOrigin(ctx: PlanContext, goal: Goal, maintenanceOffsetKcal = 0): SolverOrigin {
  const body = currentStateBody(ctx);
  if (body !== null) {
    if (maintenanceOffsetKcal === 0) return originFromBody(body);
    const shifted = ctx.solver?.modeledBodyAtOffsetDelta?.(maintenanceOffsetKcal) ?? null;
    if (shifted === null) throw new Error(`currentState: no modeled body at offset delta ${maintenanceOffsetKcal}`);
    return originFromBody(shifted);
  }
  const p = hallParametersFor(ctx, goal, maintenanceOffsetKcal);
  return { p, s0: initialState(p), shiftKg: 0, referenceWeightKg: ctx.currentWeightKg, paDelta: (steps) => paDeltaForSteps(ctx, steps), start: 'equilibrium' };
}

function originInput(ctx: PlanContext, goal: Goal, o: SolverOrigin, scenario: Scenario): HallDailyInput {
  const u = hallInputFor(ctx, goal, scenario);
  return o.start === 'equilibrium' ? u : { ...u, paDeltaKcalPerKgDay: o.paDelta(scenario.stepsPerDay) };
}

type OriginDay = { day: number; weightKg: number; energyExpenditureKcal: number };

/** simulateHall (src/science/hall/model.ts) started from the origin state instead of the baseline state; same integration. */
function simulateFromOrigin(o: SolverOrigin, days: number, u: HallDailyInput, options: { recordEveryDays?: number; stopWhen?: (weightKg: number) => boolean } = {}) {
  const stepsPerDay = Math.max(1, Math.round(1 / HALL_DT_DAYS));
  const h = 1 / stepsPerDay;
  const record = options.recordEveryDays ?? 1;
  const snapshot = (day: number, s: HallState): OriginDay => ({ day, weightKg: bodyWeightOf(o.p, s) + o.shiftKg, energyExpenditureKcal: derivatives(o.p, s, u).energyExpenditureKcal });
  let s = o.s0;
  const out: OriginDay[] = [snapshot(0, s)];
  let stoppedAt: number | null = null;
  for (let day = 0; day < days; day++) {
    for (let i = 0; i < stepsPerDay; i++) s = advance(o.p, s, u, h);
    const next = day + 1;
    const result = snapshot(next, s);
    if (next % record === 0 || next === days) out.push(result);
    if (options.stopWhen && options.stopWhen(result.weightKg)) {
      if (out[out.length - 1]?.day !== next) out.push(result);
      stoppedAt = next;
      break;
    }
  }
  return { days: out, finalState: s, finalDay: stoppedAt ?? days, stoppedEarly: stoppedAt !== null };
}

function tissueOf(p: HallParameters, s: HallState): number {
  return s.lean + fatFromLean(p, s.lean);
}

function metricOf(ctx: PlanContext, o: SolverOrigin, s: HallState): number {
  return rateDefinitionOf(ctx) === 'sustainedTissue' ? tissueOf(o.p, s) : bodyWeightOf(o.p, s) + o.shiftKg;
}

function metricAtDay(ctx: PlanContext, goal: Goal, o: SolverOrigin, scenario: Scenario, day: number): number {
  return metricOf(ctx, o, simulateFromOrigin(o, day, originInput(ctx, goal, o, scenario)).finalState);
}

/**
 * Horizon target of a weekly rate, horizon H (28 days in production).
 * sustainedTissue (definition (a), production): start tissue mass + W x ((1 -/+ r)^(H/7) - 1).
 * fortyTwoDayWeight (legacy options, H = 42): W x (1 -/+ r)^(H/7). W: reference weight of the plan.
 */
function horizonTarget(ctx: PlanContext, goal: Goal, weeklyRate: number): number {
  if (!solverOptionsActive(ctx)) return targetWeightAtHorizon(goal, ctx.currentWeightKg, weeklyRate);
  const o = solverOrigin(ctx, goal);
  const wH = targetWeightAfterDays(goal, o.referenceWeightKg, weeklyRate, solverHorizonDaysOf(ctx));
  return rateDefinitionOf(ctx) === 'sustainedTissue' ? tissueOf(o.p, o.s0) + (wH - o.referenceWeightKg) : wH;
}

/** Constant daily intake giving the horizon target of the active rate definition, from the solver start (prompt 37). */
export function solveCaloriesAtHorizon(ctx: PlanContext, goal: Goal, stepsPerDay: number, target: number): CalorieSolve {
  if (!solverOptionsActive(ctx)) return solveCaloriesForWeightAtHorizon(ctx, goal, stepsPerDay, target);
  const o = solverOrigin(ctx, goal);
  const r = bisect({
    lo: GOAL_SOLVER_MIN_INTAKE_KCAL,
    hi: GOAL_SOLVER_MAX_INTAKE_KCAL,
    f: (kcal) => metricAtDay(ctx, goal, o, { calorieTargetKcal: kcal, stepsPerDay }, solverHorizonDaysOf(ctx)),
    target,
    increasing: true,
    maxIterations: GOAL_SOLVER_MAX_ITERATIONS,
    xTolerance: GOAL_SOLVER_CALORIE_TOLERANCE_KCAL,
    yTolerance: GOAL_SOLVER_WEIGHT_TOLERANCE_KG,
  });
  return {
    calorieTargetKcal: r.x,
    weightAtHorizonKg: r.y,
    targetWeightAtHorizonKg: target,
    iterations: r.iterations,
    converged: r.converged && r.bracketed,
    origin: { solverStart: o.start, rateDefinition: rateDefinitionOf(ctx), horizonDays: solverHorizonDaysOf(ctx), referenceWeightKg: o.referenceWeightKg, startTissueKg: tissueOf(o.p, o.s0) },
  };
}

/** Legacy solver (models up to 1.3.0): constant daily intake giving the requested Hall-model weight at 42 days (04 s6). */
export function solveCaloriesForWeightAtHorizon(ctx: PlanContext, goal: Goal, stepsPerDay: number, targetWeightKg: number): CalorieSolve {
  const r = bisect({
    lo: GOAL_SOLVER_MIN_INTAKE_KCAL,
    hi: GOAL_SOLVER_MAX_INTAKE_KCAL,
    f: (kcal) => weightAtDay(ctx, goal, { calorieTargetKcal: kcal, stepsPerDay }, LEGACY_SOLVER_HORIZON_DAYS),
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

/** Legacy solver (models up to 1.3.0): body weight after 42 days at the requested rate. */
export function targetWeightAtHorizon(goal: Goal, currentWeightKg: number, weeklyRate: number): number {
  const weeks = LEGACY_SOLVER_HORIZON_DAYS / DAYS_PER_WEEK;
  if (goal === 'loss') return currentWeightKg * Math.pow(1 - weeklyRate, weeks);
  if (goal === 'gain') return currentWeightKg * Math.pow(1 + weeklyRate, weeks);
  return currentWeightKg;
}

/** Prompt 38 s3.2: `targetWeightAtHorizon` at a horizon of `days` (same expression; 42 gives the same value). */
function targetWeightAfterDays(goal: Goal, currentWeightKg: number, weeklyRate: number, days: number): number {
  const weeks = days / DAYS_PER_WEEK;
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

/** Solves the calorie target at the solver horizon for one weekly rate and checks the floor and macro feasibility. */
export function evaluateWeeklyRate(ctx: PlanContext, goal: Goal, weeklyRate: number, stepTarget: number): RateEvaluation {
  const target42 = horizonTarget(ctx, goal, weeklyRate);
  const solve = solveCaloriesAtHorizon(ctx, goal, stepTarget, target42);
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

function sampleTrajectory(ctx: PlanContext, goal: Goal, scenario: Scenario, days: number, offset: number, stopAt?: (w: number) => boolean, everyDays = PROJECTION_SAMPLE_EVERY_DAYS) {
  if (currentStateBody(ctx) !== null) {
    const o = solverOrigin(ctx, goal, offset);
    const r = simulateFromOrigin(o, days, originInput(ctx, goal, o, scenario), { recordEveryDays: everyDays, ...(stopAt ? { stopWhen: stopAt } : {}) });
    return { ...r, days: r.days.map((d) => ({ day: d.day, bodyWeightKg: d.weightKg })) };
  }
  const p = hallParametersFor(ctx, goal, offset);
  const u = hallInputFor(ctx, goal, scenario);
  return simulateHall(p, days, () => u, {
    recordEveryDays: everyDays,
    ...(stopAt ? { stopWhen: (d) => stopAt(d.bodyWeightKg) } : {}),
  });
}

/** Short projection window (pass 5a, warning ahead of the BMI-20 guardrail): fixed horizon, sampling step, optional stop. */
export type ProjectionWindow = {
  horizonDays: number;
  sampleEveryDays: number;
  /** Each trajectory stops on the first sampled day under this weight (kept as its last point). */
  stopBelowKg?: number;
};

/**
 * The plan's projection over a fixed window (pass 5a): same model, same start and same 80 percent band as `projectPlan`,
 * without the stop at the target, sampled every `sampleEveryDays`, each trajectory cut at `stopBelowKg` when given.
 */
export function projectPlanWindow(ctx: PlanContext, input: Pick<ProjectionInput, 'goal' | 'scenario' | 'maintenanceOffsets80'>, frame: ProjectionWindow): Projection {
  const stop = frame.stopBelowKg === undefined ? undefined : (w: number) => w < (frame.stopBelowKg as number);
  const run = (offset: number) => sampleTrajectory(ctx, input.goal, input.scenario, frame.horizonDays, offset, stop, frame.sampleEveryDays);
  const central = run(0);
  const a = run(input.maintenanceOffsets80[0]);
  const b = run(input.maintenanceOffsets80[1]);
  const trajectory = central.days.map((d) => ({ day: d.day, weightKg: d.bodyWeightKg }));
  const lower80: TrajectoryPoint[] = [];
  const upper80: TrajectoryPoint[] = [];
  const longest = a.days.length >= b.days.length ? a.days : b.days;
  longest.forEach((d, i) => {
    const wa = a.days[i]?.bodyWeightKg ?? d.bodyWeightKg;
    const wb = b.days[i]?.bodyWeightKg ?? d.bodyWeightKg;
    lower80.push({ day: d.day, weightKg: Math.min(wa, wb) });
    upper80.push({ day: d.day, weightKg: Math.max(wa, wb) });
  });
  return { trajectory, lower80, upper80, daysToTarget: null, reachedWithinWindow: false, horizonDays: frame.horizonDays };
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
  /** Projected mean weekly change of the modeled weight over the solver horizon, kg/week. */
  projectedWeeklyChangeKg: number;
  converged: boolean;
};

export type SliderBaseline = {
  goal: Goal;
  /** The plan the slider is anchored on (its trajectory is preserved). */
  scenario: Scenario;
};

/**
 * Horizon value of the baseline plan: tissue mass (production, prompt 37), or body weight under the legacy options, at the
 * solver horizon (`solverHorizonDays`, prompt 38).
 */
export function baselineWeightAtHorizon(ctx: PlanContext, baseline: SliderBaseline): number {
  if (solverOptionsActive(ctx)) return metricAtDay(ctx, baseline.goal, solverOrigin(ctx, baseline.goal), baseline.scenario, solverHorizonDaysOf(ctx));
  return weightAtDay(ctx, baseline.goal, baseline.scenario, LEGACY_SOLVER_HORIZON_DAYS);
}

export function sliderZone(steps: number, bounds: SliderBounds, blocked: boolean): SliderZone {
  if (blocked || steps < bounds.minSteps || steps > bounds.maxSteps) return 'blocked';
  if (steps < bounds.recommendedMinSteps || steps > bounds.recommendedMaxSteps) return 'caution';
  return 'recommended';
}

export function solveSliderPoint(ctx: PlanContext, baseline: SliderBaseline, stepsPerDay: number, baselineWeight42?: number): SliderPoint {
  const target = baselineWeight42 ?? baselineWeightAtHorizon(ctx, baseline);
  const solve = solveCaloriesAtHorizon(ctx, baseline.goal, stepsPerDay, target);
  const macros = macrosFor(ctx, baseline.goal, solve.calorieTargetKcal);
  const floor = hardFloorKcal(ctx.reeKcal, ctx.sex);
  const belowHardFloor = solve.calorieTargetKcal < floor;
  const bounds = sliderBounds(baseline.scenario.stepsPerDay);
  let ee0: number;
  let projectedWeeklyChangeKg: number;
  if (solverOptionsActive(ctx)) {
    // Production (prompts 37, 38): expenditure at the solver start; weekly change from the modeled weight at the horizon H.
    const o = solverOrigin(ctx, baseline.goal);
    const u = originInput(ctx, baseline.goal, o, { calorieTargetKcal: solve.calorieTargetKcal, stepsPerDay });
    const horizon = solverHorizonDaysOf(ctx);
    const sim = simulateFromOrigin(o, horizon, u, { recordEveryDays: horizon });
    ee0 = sim.days[0]?.energyExpenditureKcal ?? Number.NaN;
    const wH = sim.days[sim.days.length - 1]?.weightKg ?? Number.NaN;
    projectedWeeklyChangeKg = ((wH - o.referenceWeightKg) / horizon) * DAYS_PER_WEEK;
  } else {
    const p = hallParametersFor(ctx, baseline.goal);
    const u = hallInputFor(ctx, baseline.goal, { calorieTargetKcal: solve.calorieTargetKcal, stepsPerDay });
    const sim = simulateHall(p, 0, () => u);
    ee0 = sim.days[0]?.energyExpenditureKcal ?? Number.NaN;
    projectedWeeklyChangeKg = ((solve.weightAtHorizonKg - ctx.currentWeightKg) / LEGACY_SOLVER_HORIZON_DAYS) * DAYS_PER_WEEK;
  }
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
    projectedWeeklyChangeKg,
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

/**
 * Floor advice (pass 5a): lowest step count (rounded to 100, within the slider range of `baselineSteps`) at which the
 * calorie target holding `weeklyRate` stays at or above the hard floor with feasible macros; null when no step count of the
 * range suffices. `effectiveMinSliderSteps` with the horizon target of that rate.
 */
export function stepsToHoldRateAtFloor(ctx: PlanContext, goal: Goal, weeklyRate: number, baselineSteps: number): number | null {
  const target = horizonTarget(ctx, goal, weeklyRate);
  const baseline: SliderBaseline = { goal, scenario: { calorieTargetKcal: 0, stepsPerDay: baselineSteps } };
  const steps = effectiveMinSliderSteps(ctx, baseline, target);
  const point = solveSliderPoint(ctx, baseline, steps, target);
  return !point.belowHardFloor && point.macroFeasible && point.converged ? steps : null;
}

/**
 * Floor advice (pass 5a): fastest rate of the slider grid, at or below `fromRate`, that the most steps of the slider range
 * hold at or above the hard floor with feasible macros; null when none does.
 */
export function fastestRateReachableWithSteps(ctx: PlanContext, goal: Goal, fromRate: number, baselineSteps: number): number | null {
  const maxSteps = sliderBounds(baselineSteps).maxSteps;
  const baseline: SliderBaseline = { goal, scenario: { calorieTargetKcal: 0, stepsPerDay: baselineSteps } };
  for (const rate of descendingRateGrid(goal, fromRate)) {
    const point = solveSliderPoint(ctx, baseline, maxSteps, horizonTarget(ctx, goal, rate));
    if (!point.belowHardFloor && point.macroFeasible && point.converged) return rate;
  }
  return null;
}

/** Energy balance on day 0 of a scenario (intake minus the model's expenditure at the solver start), kcal/day. */
export function initialEnergyBalanceKcal(ctx: PlanContext, goal: Goal, scenario: Scenario): number {
  if (solverOptionsActive(ctx)) {
    const o = solverOrigin(ctx, goal);
    return scenario.calorieTargetKcal - derivatives(o.p, o.s0, originInput(ctx, goal, o, scenario)).energyExpenditureKcal;
  }
  const sim = simulateHall(hallParametersFor(ctx, goal), 0, () => hallInputFor(ctx, goal, scenario));
  return scenario.calorieTargetKcal - (sim.days[0]?.energyExpenditureKcal ?? Number.NaN);
}

/** Rounded step target (nearest 100) with calories re-solved at the rounded value (04 s10). */
export function solveRoundedSliderPoint(ctx: PlanContext, baseline: SliderBaseline, rawSteps: number, baselineWeight42?: number): SliderPoint {
  const rounded = roundToStep(rawSteps, DISPLAY_STEPS_ROUNDING);
  return solveSliderPoint(ctx, baseline, rounded, baselineWeight42);
}
