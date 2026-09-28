/**
 * Application use cases: the only bridge between persisted state and the
 * scientific engine. Pure functions (no React, no storage access).
 * UI components consume the typed results; they never compute science.
 */
import { assessBaseline, planContextFrom } from '@/science/assessment';
import type { BaselineAssessment } from '@/science/assessment';
import { buildSnapshot, evaluateGate, fitCalibration, shouldSurfaceRecalibration } from '@/science/calibration';
import type { CalibrationFit, CalibrationInput, GateStatus } from '@/science/calibration';
import {
  GOAL_SOLVER_HORIZON_DAYS,
  HALL_BODY_FAT_MIN_QUALITY,
  LOSS_RATE_CAUTION_ABOVE,
  LOSS_UNAVAILABLE_BMI_BELOW,
  PERIODIC_REPLAN_EVERY_DAYS,
  PERIODIC_REPLAN_NOTICE_MIN_KCAL,
  SCIENTIFIC_MODEL_VERSION,
} from '@/science/constants';
import { addDays, daysBetween } from '@/science/dates';
import {
  baselineCarbFractionFor,
  buildGoalPlan,
  effectiveMinSliderSteps,
  guardrailMaxWeeklyRate,
  maintenanceZone,
  maxSelectableWeeklyRate,
  projectPlan,
  sliderBounds,
  snapWeeklyRate,
  solveRoundedSliderPoint,
  speedZoneFor,
  weeklyRateRange,
  baselineWeightAtHorizon,
} from '@/science/goals';
import type { GoalPlan, PlanContext, RateDefinition, SelectableRateLimit, SliderBaseline, SliderBounds, SliderPoint, SolverOptions, SolverStart } from '@/science/goals';
import { bmi } from '@/science/macros';
import { modeledBodyAt } from '@/science/modeledBody';
import { BODY_FAT_QUALITY } from '@/science/ree';
import { computeTrend, summarizeTrend } from '@/science/trend';
import type { TrendPoint, TrendSummary } from '@/science/trend';
import type { CalibrationSnapshot, ConfidenceLevel, DailyLog, Goal, HistoricalIntakeEvidence, Interval, PalCategory, SpeedZone, UserProfile, WeightEntry } from '@/science/types';
import { intervalWidth } from '@/science/uncertainty';
import { buildWarmStartSnapshot, validateHistoricalEvidence, warmStartPosterior } from '@/science/warmStart';
import type { WarmStartResult } from '@/science/warmStart';
import { PLAN_MESSAGE } from './planMessages';
import type { CurrentPlan, PlanEvent, PlanSummary, StoredWeight, WheightyStore } from './types';

export const MAINTENANCE_PROJECTION_DAYS = 84;

// ---------------------------------------------------------------------------
// Assessment and plan construction
// ---------------------------------------------------------------------------

export type PlanBuildInput = {
  profile: UserProfile;
  today: string;
  /** Weight the plan is computed at (trend or onboarding). */
  weightKg: number;
  /** Fixed NASEM category after onboarding (no silent reclassification). */
  palCategory?: BaselineAssessment['palCategory'];
  /** Personal offset from an applied calibration, kcal/day. */
  personalOffsetKcal?: number;
  /** Posterior offset intervals (relative), replacing the population prior when calibrated. */
  offsetInterval80?: Interval;
  offsetInterval95?: Interval;
  stepTarget?: number;
  source: CurrentPlan['source'];
  goal?: Goal;
  targetWeightKg?: number;
  /** Requested weekly rate (fraction of body weight per week); defaults to the profile value. */
  weeklyRate?: number;
  /** Solver options of the plan context (modeled body included). Absent: the production request, without a modeled body. */
  solver?: SolverOptions;
};

/** Solver request (K2 of report 38): start, rate definition and horizon. The domain adds the modeled body. */
export type SolverRequest = {
  solverStart?: SolverStart;
  rateDefinition?: RateDefinition;
  solverHorizonDays?: number;
};

/**
 * Production solver (model 1.4.0, K2 validated in reports 37 to 39): the Hall model starts from the modeled body of the
 * latest applied calibration (equilibrium before any), the requested rate is held on the tissue mass (definition (a)),
 * over a 28-day horizon. Every plan-building path passes it by default.
 */
export const PRODUCTION_SOLVER: Readonly<Required<SolverRequest>> = { solverStart: 'currentState', rateDefinition: 'sustainedTissue', solverHorizonDays: GOAL_SOLVER_HORIZON_DAYS };

export type PlanBuildResult =
  | { ok: true; plan: CurrentPlan; assessment: BaselineAssessment; goalPlan: GoalPlan; context: PlanContext }
  | { ok: false; reason: 'invalid_profile' | GoalPlan['status']; assessment: BaselineAssessment; goalPlan: GoalPlan | null; context: PlanContext | null };

export function buildPlan(input: PlanBuildInput): PlanBuildResult {
  const { profile } = input;
  const assessment = assessBaseline(profile, input.today, { weightKg: input.weightKg, ...(input.palCategory ? { palCategory: input.palCategory } : {}) });
  if (!assessment.validation.ok) return { ok: false, reason: 'invalid_profile', assessment, goalPlan: null, context: null };

  const offset = input.personalOffsetKcal ?? 0;
  const maintenanceKcal = assessment.populationTdeeKcal + offset;
  const context: PlanContext = { ...planContextFrom(profile, assessment, maintenanceKcal), solver: input.solver ?? { ...PRODUCTION_SOLVER } };
  const goal = input.goal ?? profile.goal;
  const targetWeightKg = goal === 'maintenance' ? (input.targetWeightKg ?? profile.targetWeightKg) : (input.targetWeightKg ?? profile.targetWeightKg);
  const weeklyRate = goal === 'maintenance' ? 0 : (input.weeklyRate ?? profile.weeklyRateTarget);
  const baselineSteps = profile.averageSteps7d;
  const goalPlan = buildGoalPlan(context, { goal, weeklyRate, targetWeightKg, stepTarget: baselineSteps });
  if (goalPlan.status !== 'ok' || goalPlan.calorieTargetKcal === null || goalPlan.macros === null) {
    return { ok: false, reason: goalPlan.status === 'ok' ? 'no_feasible_speed' : goalPlan.status, assessment, goalPlan, context };
  }

  const interval80: Interval = input.offsetInterval80
    ? [assessment.populationTdeeKcal + input.offsetInterval80[0], assessment.populationTdeeKcal + input.offsetInterval80[1]]
    : assessment.interval80;
  const interval95: Interval = input.offsetInterval95
    ? [assessment.populationTdeeKcal + input.offsetInterval95[0], assessment.populationTdeeKcal + input.offsetInterval95[1]]
    : assessment.interval95;

  let calorieTarget = goalPlan.calorieTargetKcal;
  let macros = goalPlan.macros;
  let stepTarget = baselineSteps;
  if (input.stepTarget !== undefined && input.stepTarget !== baselineSteps) {
    const baseline: SliderBaseline = { goal, scenario: { calorieTargetKcal: goalPlan.calorieTargetKcal, stepsPerDay: baselineSteps } };
    const point = solveRoundedSliderPoint(context, baseline, input.stepTarget);
    if (!point.belowHardFloor && point.macroFeasible && point.converged) {
      calorieTarget = point.calorieTargetKcal;
      macros = point.macros;
      stepTarget = point.stepsPerDay;
    }
  }

  const projection = projectPlan(context, {
    goal,
    scenario: { calorieTargetKcal: calorieTarget, stepsPerDay: stepTarget },
    targetWeightKg,
    maintenanceOffsets80: [interval80[0] - maintenanceKcal, interval80[1] - maintenanceKcal],
    maintenanceHorizonDays: MAINTENANCE_PROJECTION_DAYS,
  });

  const plan: CurrentPlan = {
    createdAt: `${input.today}T00:00:00.000Z`,
    source: input.source,
    maintenanceKcal,
    maintenanceInterval80: interval80,
    maintenanceInterval95: interval95,
    calorieTarget,
    stepTarget,
    macros: { ...macros.exact },
    macrosDisplay: { ...macros.display },
    reeKcal: assessment.ree.reeKcalDay,
    reeMethod: assessment.ree.method,
    palCategory: assessment.palCategory,
    provisionalPal: assessment.pal.provisionalPal,
    goal,
    weeklyRateTarget: goalPlan.weeklyRateTarget,
    projection: {
      ...(projection.approximateWeeks !== undefined ? { approximateWeeks: projection.approximateWeeks } : {}),
      trajectory: projection.trajectory,
      lower80: projection.lower80,
      upper80: projection.upper80,
    },
    scientificModelVersion: SCIENTIFIC_MODEL_VERSION,
    planWeightKg: input.weightKg,
    targetWeightKg,
    requestedWeeklyRate: goalPlan.requestedWeeklyRate,
    maintenanceStepsPerDay: baselineSteps,
    baselineStepTarget: baselineSteps,
    baselineCalorieTarget: goalPlan.calorieTargetKcal,
    populationTdeeKcal: assessment.populationTdeeKcal,
    personalOffsetKcal: offset,
    hardFloorKcal: goalPlan.hardFloorKcal,
    warnings: goalPlan.warnings,
    proteinRule: macros.proteinRule,
  };
  return { ok: true, plan, assessment, goalPlan, context };
}

// ---------------------------------------------------------------------------
// Store-level helpers
// ---------------------------------------------------------------------------

export function latestAppliedSnapshot(store: WheightyStore): CalibrationSnapshot | null {
  const applied = store.calibrationSnapshots.filter((s) => s.appliedAt !== undefined);
  return applied[applied.length - 1] ?? null;
}

export function trendOf(store: WheightyStore): { points: TrendPoint[]; summary: TrendSummary } {
  const points = computeTrend(store.weights);
  return { points, summary: summarizeTrend(points) };
}

export function currentWeightKg(store: WheightyStore): number | null {
  const t = trendOf(store).summary.latest;
  if (t) return t.trendKg;
  return store.profile?.currentWeightKg ?? null;
}

export function latestRawWeight(store: WheightyStore): StoredWeight | null {
  const sorted = [...store.weights].sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? -1 : 1) : a.date < b.date ? -1 : 1));
  return sorted[sorted.length - 1] ?? null;
}

type RebuildOptions = {
  source: CurrentPlan['source'];
  stepTarget?: number;
  goal?: Goal;
  targetWeightKg?: number;
  weeklyRate?: number;
  snapshot?: CalibrationSnapshot | null;
  solver?: SolverRequest;
};

/**
 * Solver options of a rebuilt plan (prompt 37). currentState with an applied calibration: the modeled body today, from the
 * calibration input of the store at the snapshot's posterior median offset. Without a calibration window the modeled body
 * is null and the solver keeps the equilibrium start.
 */
export function solverOptionsFor(store: WheightyStore, today: string, snapshot: CalibrationSnapshot | null, request: SolverRequest = PRODUCTION_SOLVER): SolverOptions {
  const out: SolverOptions = { ...request };
  if (request.solverStart === 'currentState' && snapshot) {
    const input = calibrationInputFromStore(store, today);
    const median = snapshot.posteriorMedianOffsetKcal;
    const body = input ? modeledBodyAt(input, median, today) : null;
    out.modeledBody = body;
    if (input && body) out.modeledBodyAtOffsetDelta = (delta) => modeledBodyAt(input, median + delta, today);
  }
  return out;
}

export function buildPlanFromStore(store: WheightyStore, today: string, options: RebuildOptions): PlanBuildResult | { ok: false; reason: 'no_profile' } {
  const profile = store.profile;
  if (!profile) return { ok: false, reason: 'no_profile' };
  const snapshot = options.snapshot === undefined ? latestAppliedSnapshot(store) : options.snapshot;
  const weight = currentWeightKg(store) ?? profile.currentWeightKg;
  return buildPlan({
    profile,
    today,
    weightKg: weight,
    ...(store.meta.initialPalCategory ? { palCategory: store.meta.initialPalCategory } : {}),
    ...(snapshot
      ? {
          personalOffsetKcal: snapshot.posteriorMedianOffsetKcal,
          offsetInterval80: [snapshot.interval80[0], snapshot.interval80[1]] as Interval,
          offsetInterval95: [snapshot.interval95[0], snapshot.interval95[1]] as Interval,
        }
      : {}),
    ...(options.stepTarget !== undefined ? { stepTarget: options.stepTarget } : {}),
    source: options.source,
    ...(options.goal ? { goal: options.goal } : {}),
    ...(options.targetWeightKg !== undefined ? { targetWeightKg: options.targetWeightKg } : {}),
    ...(options.weeklyRate !== undefined ? { weeklyRate: options.weeklyRate } : {}),
    solver: solverOptionsFor(store, today, snapshot, options.solver ?? PRODUCTION_SOLVER),
  });
}

/**
 * Plan context used when the plan is rebuilt from the store (goal change, profile edit):
 * current trend weight, fixed PAL category, applied personal offset, production solver from today's modeled body.
 * Same inputs as buildPlanFromStore.
 */
export function rebuildContextFromStore(store: WheightyStore, today: string): PlanContext | null {
  const profile = store.profile;
  if (!profile) return null;
  const weight = currentWeightKg(store) ?? profile.currentWeightKg;
  const palCategory = store.meta.initialPalCategory ?? undefined;
  const assessment = assessBaseline(profile, today, { weightKg: weight, ...(palCategory ? { palCategory } : {}) });
  const snapshot = latestAppliedSnapshot(store);
  const offset = snapshot?.posteriorMedianOffsetKcal ?? 0;
  return { ...planContextFrom(profile, assessment, assessment.populationTdeeKcal + offset), solver: solverOptionsFor(store, today, snapshot) };
}

/** Day the plan in force was built (its `createdAt` date). */
export function planDateOf(plan: CurrentPlan): string {
  return plan.createdAt.slice(0, 10);
}

/**
 * Production solver options of the plan in force, as they were on the day it was built: weigh-ins and logs up to that day,
 * the modeled body of that day. Lets the slider and the explanation work on the plan's own solve (its start state and
 * horizon) rather than on today's. The latest applied calibration is the plan's own: applying one always rebuilds the plan.
 */
export function planSolverOptions(store: WheightyStore, plan: CurrentPlan): SolverOptions {
  const date = planDateOf(plan);
  const asOf: WheightyStore = { ...store, weights: store.weights.filter((w) => w.date <= date), dailyLogs: store.dailyLogs.filter((l) => l.date <= date) };
  return solverOptionsFor(asOf, date, latestAppliedSnapshot(store));
}

/** Context of the plan in force: its weight, its maintenance, and its solver options (`planSolverOptions`). */
export function contextForCurrentPlan(store: WheightyStore, today: string): PlanContext | null {
  const profile = store.profile;
  const plan = store.plan;
  if (!profile || !plan) return null;
  const weight = plan.planWeightKg ?? profile.currentWeightKg;
  const assessment = assessBaseline(profile, today, { weightKg: weight, palCategory: plan.palCategory });
  return { ...planContextFrom(profile, assessment, plan.maintenanceKcal), solver: planSolverOptions(store, plan) };
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Warm start (D-23)
// ---------------------------------------------------------------------------

let warmStartMemo: { key: string; value: WarmStartResult } | null = null;

/**
 * Initial personalised posterior from historical intake evidence. The history is modelled at its
 * start weight with the PAL category fixed at onboarding; the offset is the same personal offset
 * that weigh-in calibration later refines.
 */
export function warmStartFor(profile: UserProfile, evidence: HistoricalIntakeEvidence, today: string, palCategory?: PalCategory | null): WarmStartResult {
  const key = JSON.stringify([profile, evidence, today, palCategory ?? null]);
  if (warmStartMemo?.key === key) return warmStartMemo.value;
  const atOnboarding = assessBaseline(profile, today, palCategory ? { palCategory } : {});
  const fixedPal = palCategory ?? atOnboarding.palCategory;
  const startWeightKg = evidence.startWeightKg ?? profile.currentWeightKg;
  const atStart = assessBaseline(profile, today, { weightKg: startWeightKg, palCategory: fixedPal });
  const ctx = planContextFrom(profile, atStart, atStart.populationTdeeKcal);
  const hq = profile.bodyFatMethod !== undefined && profile.bodyFatPercent !== undefined && BODY_FAT_QUALITY[profile.bodyFatMethod] >= HALL_BODY_FAT_MIN_QUALITY;
  const value = warmStartPosterior({
    sex: profile.sexForEquation,
    ageYears: profile.ageYears,
    heightCm: profile.heightCm,
    populationTdeeAtStartKcal: atStart.populationTdeeKcal,
    reeAtStartKcal: atStart.ree.reeKcalDay,
    // The history diet is unknown: the maintenance plan composition is its reference (goal-independent, D-16).
    baselineCarbFraction: baselineCarbFractionFor(ctx, 'maintenance'),
    ...(hq ? { initialFatKg: (startWeightKg * (profile.bodyFatPercent as number)) / 100 } : {}),
    priorSigmaKcal: atOnboarding.sigma.sigmaKcal,
    evidence,
  });
  warmStartMemo = { key, value };
  return value;
}

/** Warm start of the stored evidence (evaluated as of its onboarding day), null when the user gave no history. */
export function storedWarmStart(store: WheightyStore): WarmStartResult | null {
  if (!store.profile || !store.historicalEvidence) return null;
  return warmStartFor(store.profile, store.historicalEvidence, store.historicalEvidence.recordedOn, store.meta.initialPalCategory);
}

export type InitialPreview = PlanBuildResult & {
  /** Null when the user does not track calories. */
  warmStart: WarmStartResult | null;
  /** Confidence shown on the first result. */
  confidence: ConfidenceLevel;
};

/** Initial assessment preview for the Result screen, before anything is saved. */
export function previewInitialPlan(profile: UserProfile, today: string, evidence: HistoricalIntakeEvidence | null = null, solver: SolverRequest = PRODUCTION_SOLVER): InitialPreview {
  const usable = evidence !== null && validateHistoricalEvidence(evidence).ok ? evidence : null;
  const warmStart = usable ? warmStartFor(profile, usable, today) : null;
  const applied = warmStart?.status === 'used' ? warmStart : null;
  const result = buildPlan({
    profile,
    today,
    weightKg: profile.currentWeightKg,
    source: 'initial',
    // No weigh-in calibration before onboarding: the solver start stays at equilibrium (prompt 37 s3.1).
    solver: { ...solver },
    ...(applied
      ? {
          personalOffsetKcal: applied.posterior.medianKcal,
          offsetInterval80: [applied.posterior.interval80[0], applied.posterior.interval80[1]] as Interval,
          offsetInterval95: [applied.posterior.interval95[0], applied.posterior.interval95[1]] as Interval,
        }
      : {}),
  });
  return { ...result, warmStart, confidence: applied?.confidence ?? 'low' };
}

export function completeOnboarding(
  store: WheightyStore,
  profile: UserProfile,
  today: string,
  nowIso: string,
  evidence: HistoricalIntakeEvidence | null = null,
  solver: SolverRequest = PRODUCTION_SOLVER,
): { ok: true; store: WheightyStore } | { ok: false; reason: string } {
  const preview = previewInitialPlan(profile, today, evidence, solver);
  if (!preview.ok) return { ok: false, reason: preview.reason };
  const { plan, assessment, warmStart } = preview;
  const weightEntry: WeightEntry = { id: newId(nowIso, 'w'), date: today, weightKg: profile.currentWeightKg, createdAt: nowIso };
  const hasSameDay = store.weights.some((w) => w.date === today);
  const warmSnapshot = warmStart?.status === 'used' ? buildWarmStartSnapshot(warmStart, assessment.populationTdeeKcal, nowIso) : null;
  const next: WheightyStore = {
    ...store,
    profile,
    plan,
    weights: hasSameDay ? store.weights : [...store.weights, weightEntry],
    calibrationSnapshots: warmSnapshot ? [...store.calibrationSnapshots, warmSnapshot] : store.calibrationSnapshots,
    // Valid evidence is kept explicitly even when it is too short to be used.
    historicalEvidence: warmStart ? (evidence as HistoricalIntakeEvidence) : store.historicalEvidence,
    meta: {
      ...store.meta,
      onboardingDate: store.meta.onboardingDate ?? today,
      initialMaintenanceKcal: store.meta.initialMaintenanceKcal ?? plan.maintenanceKcal,
      initialInterval80: store.meta.initialInterval80 ?? plan.maintenanceInterval80,
      initialPalCategory: assessment.palCategory,
      initialProvisionalPal: assessment.pal.provisionalPal,
      initialWeightKg: store.meta.initialWeightKg ?? profile.currentWeightKg,
    },
  };
  return { ok: true, store: ensureDailyLogs(next, today) };
}

// ---------------------------------------------------------------------------
// Speed slider model (04 s2, D-22)
// ---------------------------------------------------------------------------

export type SpeedSliderModel = {
  goal: 'loss' | 'gain';
  minRate: number;
  /** General v1 maximum for the goal. */
  maxRate: number;
  step: number;
  defaultRate: number;
  /** Fastest rate the goal engine accepts for this profile; null when none. */
  maxSelectableRate: number | null;
  limitedBy: SelectableRateLimit['limitedBy'];
  /** Loss rates above this value stay selectable but show a caution note. */
  cautionAboveRate: number | null;
  zones: Array<{ zone: SpeedZone; from: number; to: number }>;
  /** Weight used for the kg/week equivalent. */
  weightKg: number;
};

/** Consecutive slider grid positions grouped by qualitative zone, so labels match speedZoneFor exactly. */
function zonesFor(goal: 'loss' | 'gain', minRate: number, maxRate: number, step: number): SpeedSliderModel['zones'] {
  const out: SpeedSliderModel['zones'] = [];
  const count = Math.round((maxRate - minRate) / step);
  for (let i = 0; i <= count; i++) {
    const rate = snapWeeklyRate(minRate + i * step);
    const zone = speedZoneFor(goal, rate);
    const last = out[out.length - 1];
    if (last && last.zone === zone) last.to = rate;
    else out.push({ zone, from: rate, to: rate });
  }
  return out;
}

export function speedSliderModelFor(ctx: PlanContext, goal: Goal): SpeedSliderModel | null {
  if (goal === 'maintenance') return null;
  const range = weeklyRateRange(goal);
  const limit = maxSelectableWeeklyRate(ctx, goal, ctx.maintenanceStepsPerDay);
  return {
    goal,
    minRate: range.minRate,
    maxRate: range.maxRate,
    step: range.step,
    defaultRate: limit.maxSelectableRate === null ? range.defaultRate : Math.min(range.defaultRate, limit.maxSelectableRate),
    maxSelectableRate: limit.maxSelectableRate,
    limitedBy: limit.limitedBy,
    cautionAboveRate: goal === 'loss' ? LOSS_RATE_CAUTION_ABOVE : null,
    zones: zonesFor(goal, range.minRate, range.maxRate, range.step),
    weightKg: ctx.currentWeightKg,
  };
}

/** Speed slider for onboarding: population prior, or the warm-start posterior when history is used. */
export function onboardingSpeedSliderModel(profile: UserProfile, today: string, evidence: HistoricalIntakeEvidence | null): SpeedSliderModel | null {
  if (profile.goal === 'maintenance') return null;
  const assessment = assessBaseline(profile, today);
  if (!assessment.validation.ok) return null;
  const warm = evidence !== null && validateHistoricalEvidence(evidence).ok ? warmStartFor(profile, evidence, today) : null;
  const offset = warm?.status === 'used' ? warm.posterior.medianKcal : 0;
  // No weigh-in calibration before onboarding: production solver from the equilibrium start (prompt 37 s3.1).
  return speedSliderModelFor({ ...planContextFrom(profile, assessment, assessment.populationTdeeKcal + offset), solver: { ...PRODUCTION_SOLVER } }, profile.goal);
}

/** Speed slider for a goal change on an existing plan (same context as the rebuild). */
export function storeSpeedSliderModel(store: WheightyStore, today: string, goal: Goal): SpeedSliderModel | null {
  const ctx = rebuildContextFromStore(store, today);
  return ctx ? speedSliderModelFor(ctx, goal) : null;
}

// ---------------------------------------------------------------------------
// Daily logs (07 s5: preserve historical targets)
// ---------------------------------------------------------------------------

function macrosForLog(store: WheightyStore): DailyLog['macrosForDay'] {
  const plan = store.plan;
  if (!plan) return undefined;
  return { proteinG: plan.macros.proteinG, carbsG: plan.macros.carbsG, fatG: plan.macros.fatG };
}

/** Creates missing logs from the last logged day (or onboarding) through today, with the plan in force. */
export function ensureDailyLogs(store: WheightyStore, today: string): WheightyStore {
  const plan = store.plan;
  const start = store.meta.onboardingDate;
  if (!plan || !start) return store;
  const existing = new Set(store.dailyLogs.map((l) => l.date));
  const lastDate = store.dailyLogs.reduce<string | null>((acc, l) => (acc === null || l.date > acc ? l.date : acc), null);
  const from = lastDate ? addDays(lastDate, 1) : start;
  const days = daysBetween(from, today);
  if (days < 0) return store;
  const added: DailyLog[] = [];
  const macros = macrosForLog(store);
  for (let d = 0; d <= days; d++) {
    const date = addDays(from, d);
    if (existing.has(date)) continue;
    added.push({ date, calorieTargetForDay: plan.calorieTarget, stepTargetForDay: plan.stepTarget, ...(macros ? { macrosForDay: macros } : {}) });
  }
  if (added.length === 0) return store;
  return { ...store, dailyLogs: [...store.dailyLogs, ...added].sort((a, b) => (a.date < b.date ? -1 : 1)) };
}

/** Today's log follows the plan in force; past days are never rewritten. */
function syncTodayLogTargets(store: WheightyStore, today: string): WheightyStore {
  const plan = store.plan;
  if (!plan) return store;
  const macros = macrosForLog(store);
  return {
    ...store,
    dailyLogs: store.dailyLogs.map((l) => (l.date === today ? { ...l, calorieTargetForDay: plan.calorieTarget, stepTargetForDay: plan.stepTarget, ...(macros ? { macrosForDay: macros } : {}) } : l)),
  };
}

export function setAdherence(store: WheightyStore, date: string, adherence: DailyLog['adherence'] | null): WheightyStore {
  const withLogs = ensureDailyLogs(store, date);
  return {
    ...withLogs,
    dailyLogs: withLogs.dailyLogs.map((l) => {
      if (l.date !== date) return l;
      const { adherence: _previous, ...rest } = l;
      return adherence ? { ...rest, adherence } : rest;
    }),
  };
}

export function setActualSteps(store: WheightyStore, date: string, steps: number | null): WheightyStore {
  const withLogs = ensureDailyLogs(store, date);
  return {
    ...withLogs,
    dailyLogs: withLogs.dailyLogs.map((l) => {
      if (l.date !== date) return l;
      const { actualSteps: _previous, ...rest } = l;
      return steps === null ? rest : { ...rest, actualSteps: steps };
    }),
  };
}

export function newId(nowIso: string, prefix: string): string {
  const random = Math.floor(Math.random() * 1e9).toString(36);
  return `${prefix}-${nowIso.replace(/\D/g, '')}-${random}`;
}

export function addWeight(store: WheightyStore, entry: { date: string; weightKg: number; menstruating?: boolean }, nowIso: string): WheightyStore {
  // `menstruating` is journaling only (C-01): stored with the weigh-in, never read by the engine.
  const weight: StoredWeight = { id: newId(nowIso, 'w'), date: entry.date, weightKg: entry.weightKg, createdAt: nowIso, ...(entry.menstruating ? { menstruating: true } : {}) };
  return ensureDailyLogs({ ...store, weights: [...store.weights, weight] }, entry.date);
}

export function deleteWeight(store: WheightyStore, id: string): WheightyStore {
  return { ...store, weights: store.weights.filter((w) => w.id !== id) };
}

// ---------------------------------------------------------------------------
// Slider (04 s8-s10)
// ---------------------------------------------------------------------------

export type SliderSession = {
  context: PlanContext;
  baseline: SliderBaseline;
  /** Horizon value of the baseline plan (tissue mass at the solver horizon, K2), held by every point of the slider. */
  baselineAtHorizon: number;
  bounds: SliderBounds;
  effectiveMinSteps: number;
  pointAt: (steps: number) => SliderPoint;
};

export function createSliderSession(store: WheightyStore, today: string): SliderSession | null {
  const plan = store.plan;
  const context = contextForCurrentPlan(store, today);
  if (!plan || !context) return null;
  const baselineSteps = plan.baselineStepTarget ?? plan.stepTarget;
  const baselineCalories = plan.baselineCalorieTarget ?? plan.calorieTarget;
  const baseline: SliderBaseline = { goal: plan.goal, scenario: { calorieTargetKcal: baselineCalories, stepsPerDay: baselineSteps } };
  const baselineAtHorizon = baselineWeightAtHorizon(context, baseline);
  const cache = new Map<number, SliderPoint>();
  const pointAt = (steps: number): SliderPoint => {
    const key = Math.round(steps / 100) * 100;
    const hit = cache.get(key);
    if (hit) return hit;
    const p = solveRoundedSliderPoint(context, baseline, key, baselineAtHorizon);
    cache.set(key, p);
    return p;
  };
  return {
    context,
    baseline,
    baselineAtHorizon,
    bounds: sliderBounds(baselineSteps),
    effectiveMinSteps: effectiveMinSliderSteps(context, baseline, baselineAtHorizon),
    pointAt,
  };
}

/**
 * Steps and calories traded along the plan in force (04 s8-s10). The adjusted plan keeps `createdAt` (decision of pass 5a):
 * the slider re-solves the calories on the plan's own solve (its context and modeled body of the day it was built, same
 * tissue mass at the same horizon); it does not refresh the rate from today's state. The periodic replan, which does, keeps
 * its 28-day cadence from that solve, and carries the chosen steps over (`periodicReplan` keeps the step target).
 */
export function applySliderSteps(store: WheightyStore, today: string, steps: number): { ok: true; store: WheightyStore } | { ok: false; reason: string } {
  const plan = store.plan;
  const profile = store.profile;
  if (!plan || !profile) return { ok: false, reason: 'no_plan' };
  const session = createSliderSession(store, today);
  if (!session) return { ok: false, reason: 'no_plan' };
  const clamped = Math.min(session.bounds.maxSteps, Math.max(session.effectiveMinSteps, steps));
  const point = session.pointAt(clamped);
  if (point.belowHardFloor || !point.macroFeasible || !point.converged) return { ok: false, reason: 'blocked' };
  const context = session.context;
  const projection = projectPlan(context, {
    goal: plan.goal,
    scenario: { calorieTargetKcal: point.calorieTargetKcal, stepsPerDay: point.stepsPerDay },
    targetWeightKg: plan.targetWeightKg ?? profile.targetWeightKg,
    maintenanceOffsets80: [plan.maintenanceInterval80[0] - plan.maintenanceKcal, plan.maintenanceInterval80[1] - plan.maintenanceKcal],
    maintenanceHorizonDays: MAINTENANCE_PROJECTION_DAYS,
  });
  const isBaseline = point.stepsPerDay === (plan.baselineStepTarget ?? plan.stepTarget);
  const nextPlan: CurrentPlan = {
    ...plan,
    source: isBaseline ? plan.source : 'user_adjusted_slider',
    calorieTarget: isBaseline ? (plan.baselineCalorieTarget ?? point.calorieTargetKcal) : point.calorieTargetKcal,
    stepTarget: point.stepsPerDay,
    macros: { ...point.macros.exact },
    macrosDisplay: { ...point.macros.display },
    projection: {
      ...(projection.approximateWeeks !== undefined ? { approximateWeeks: projection.approximateWeeks } : {}),
      trajectory: projection.trajectory,
      lower80: projection.lower80,
      upper80: projection.upper80,
    },
    proteinRule: point.macros.proteinRule,
  };
  const withLogs = ensureDailyLogs(store, today);
  return { ok: true, store: syncTodayLogTargets({ ...withLogs, plan: nextPlan }, today) };
}

// ---------------------------------------------------------------------------
// Goal and profile changes
// ---------------------------------------------------------------------------

/**
 * Options of a goal change (prompt 39 s3.1): the step target kept from the plan in force, the solver request (production by
 * default) and the source of the new plan ('initial' by default: a goal chosen by the user).
 */
export type GoalChangeOptions = { stepTarget?: number; solver?: SolverRequest; source?: CurrentPlan['source'] };

export function changeGoal(
  store: WheightyStore,
  today: string,
  input: { goal: Goal; targetWeightKg: number; weeklyRate: number },
  options?: GoalChangeOptions,
): { ok: true; store: WheightyStore } | { ok: false; reason: string } {
  if (!store.profile) return { ok: false, reason: 'no_profile' };
  const profile: UserProfile = { ...store.profile, goal: input.goal, targetWeightKg: input.targetWeightKg, weeklyRateTarget: input.goal === 'maintenance' ? 0 : input.weeklyRate };
  const withLogs = ensureDailyLogs(store, today);
  const result = buildPlanFromStore({ ...withLogs, profile }, today, {
    source: options?.source ?? 'initial',
    ...(options?.stepTarget !== undefined ? { stepTarget: options.stepTarget } : {}),
    ...(options?.solver ? { solver: options.solver } : {}),
  });
  if (!result.ok) return { ok: false, reason: result.reason };
  // A maintenance imposed by the BMI-20 guardrail is dated; any goal the user chooses ends it (underweight alert, pass 5a).
  const meta = { ...withLogs.meta, guardrailMaintenanceSince: options?.source === 'guardrail' ? today : null };
  return { ok: true, store: syncTodayLogTargets({ ...withLogs, profile, meta, plan: result.plan }, today) };
}

export function updateProfile(store: WheightyStore, today: string, profile: UserProfile): { ok: true; store: WheightyStore } | { ok: false; reason: string } {
  const withLogs = ensureDailyLogs(store, today);
  const activityChanged =
    !store.profile ||
    JSON.stringify(store.profile.activities) !== JSON.stringify(profile.activities) ||
    store.profile.occupation !== profile.occupation ||
    store.profile.averageSteps7d !== profile.averageSteps7d ||
    store.profile.walkingPace !== profile.walkingPace;
  const assessment = assessBaseline(profile, today);
  const meta = activityChanged ? { ...withLogs.meta, initialPalCategory: assessment.palCategory, initialProvisionalPal: assessment.pal.provisionalPal } : withLogs.meta;
  const next: WheightyStore = { ...withLogs, profile, meta };
  const result = buildPlanFromStore(next, today, { source: 'initial' });
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, store: syncTodayLogTargets({ ...next, plan: result.plan }, today) };
}

// ---------------------------------------------------------------------------
// Calibration state (05)
// ---------------------------------------------------------------------------

export type CalibrationState = {
  gate: GateStatus;
  fit: CalibrationFit | null;
  candidate: CalibrationSnapshot | null;
  /** Maintenance displayed on Analysis: calibrated when the gate is met, the plan prior otherwise. */
  currentMaintenanceKcal: number;
  currentInterval80: Interval;
  currentInterval95: Interval;
  confidence: ConfidenceLevel;
  /** A recalibration is ready to be shown to the user. */
  surfaced: boolean;
  /** Maintenance the new plan would use (NASEM at the current weight plus the posterior offset). */
  proposedMaintenanceKcal: number | null;
};

export function calibrationInputFromStore(store: WheightyStore, today: string): CalibrationInput | null {
  const profile = store.profile;
  if (!profile || store.weights.length === 0) return null;
  const sorted = [...store.weights].sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = sorted[0];
  if (!first) return null;
  const palCategory = store.meta.initialPalCategory ?? store.plan?.palCategory;
  const assessment = assessBaseline(profile, today, { weightKg: first.weightKg, ...(palCategory ? { palCategory } : {}) });
  const context = planContextFrom(profile, { ...assessment }, assessment.populationTdeeKcal);
  const hq = profile.bodyFatMethod !== undefined && profile.bodyFatPercent !== undefined && BODY_FAT_QUALITY[profile.bodyFatMethod] >= HALL_BODY_FAT_MIN_QUALITY;
  const history = storedWarmStart(store);
  return {
    sex: profile.sexForEquation,
    ageYears: profile.ageYears,
    heightCm: profile.heightCm,
    walkingPace: profile.walkingPace,
    populationTdeeAtStartKcal: assessment.populationTdeeKcal,
    reeAtStartKcal: assessment.ree.reeKcalDay,
    maintenanceStepsPerDay: profile.averageSteps7d,
    ...(hq ? { initialFatKg: (first.weightKg * (profile.bodyFatPercent as number)) / 100 } : {}),
    priorSigmaKcal: assessment.sigma.sigmaKcal,
    baselineCarbFraction: baselineCarbFractionFor(context, store.plan?.goal ?? profile.goal),
    weights: store.weights,
    dailyLogs: store.dailyLogs,
    // Warm start evidence (history before onboarding) keeps informing the posterior (D-23).
    ...(history?.likelihood.logLikelihood ? { historicalLogLikelihood: history.likelihood.logLikelihood } : {}),
  };
}

export function computeCalibrationState(store: WheightyStore, today: string, nowIso: string): CalibrationState | null {
  const plan = store.plan;
  const profile = store.profile;
  if (!plan || !profile) return null;
  const gate = evaluateGate(store.weights, store.dailyLogs);
  const input = calibrationInputFromStore(store, today);
  const fit = input && gate.weighInCount >= 2 ? fitCalibration(input) : null;
  const candidate = fit && input ? buildSnapshot(fit, gate, input.populationTdeeAtStartKcal, nowIso) : null;

  const weight = currentWeightKg(store) ?? profile.currentWeightKg;
  const palCategory = store.meta.initialPalCategory ?? plan.palCategory;
  const populationNow = assessBaseline(profile, today, { weightKg: weight, palCategory }).populationTdeeKcal;

  if (!gate.met || !candidate) {
    return {
      gate,
      fit,
      candidate,
      currentMaintenanceKcal: plan.maintenanceKcal,
      currentInterval80: plan.maintenanceInterval80,
      currentInterval95: plan.maintenanceInterval95,
      confidence: latestAppliedSnapshot(store)?.confidence ?? 'low',
      surfaced: false,
      proposedMaintenanceKcal: null,
    };
  }

  const proposedMaintenanceKcal = populationNow + candidate.posteriorMedianOffsetKcal;
  const reference = store.meta.lastSurfacedCalibration ?? { tdeeKcal: plan.maintenanceKcal, interval80Width: intervalWidth(plan.maintenanceInterval80), surfacedOn: null };
  const surfaced = shouldSurfaceRecalibration(gate, { tdeeKcal: proposedMaintenanceKcal, interval80Width: intervalWidth(candidate.interval80) }, reference, today);
  return {
    gate,
    fit,
    candidate,
    currentMaintenanceKcal: proposedMaintenanceKcal,
    currentInterval80: [populationNow + candidate.interval80[0], populationNow + candidate.interval80[1]],
    currentInterval95: [populationNow + candidate.interval95[0], populationNow + candidate.interval95[1]],
    confidence: candidate.confidence,
    surfaced,
    proposedMaintenanceKcal,
  };
}

export function markRecalibrationSeen(store: WheightyStore, state: CalibrationState, today: string): WheightyStore {
  if (!state.candidate || state.proposedMaintenanceKcal === null) return store;
  return {
    ...store,
    meta: { ...store.meta, lastSurfacedCalibration: { tdeeKcal: state.proposedMaintenanceKcal, interval80Width: intervalWidth(state.candidate.interval80), surfacedOn: today } },
  };
}

export function applyRecalibration(store: WheightyStore, state: CalibrationState, today: string, nowIso: string, solver: SolverRequest = PRODUCTION_SOLVER): { ok: true; store: WheightyStore } | { ok: false; reason: string } {
  if (!state.candidate || !state.gate.met) return { ok: false, reason: 'gate_not_met' };
  const snapshot: CalibrationSnapshot = { ...state.candidate, appliedAt: nowIso };
  const withLogs = ensureDailyLogs(store, today);
  const withSnapshot: WheightyStore = { ...withLogs, calibrationSnapshots: [...withLogs.calibrationSnapshots, snapshot] };
  const result = buildPlanFromStore(withSnapshot, today, { source: 'recalibrated', snapshot, ...(store.plan ? { stepTarget: store.plan.stepTarget } : {}), solver });
  if (!result.ok) return { ok: false, reason: result.reason };
  const seen = markRecalibrationSeen(withSnapshot, state, today);
  return { ok: true, store: syncTodayLogTargets({ ...seen, plan: result.plan }, today) };
}

// ---------------------------------------------------------------------------
// Trace of the automatic plan changes (pass 5a)
// ---------------------------------------------------------------------------

export function planSummary(plan: CurrentPlan): PlanSummary {
  return {
    createdAt: plan.createdAt,
    source: plan.source,
    goal: plan.goal,
    calorieTarget: plan.calorieTarget,
    stepTarget: plan.stepTarget,
    weeklyRateTarget: plan.weeklyRateTarget,
    requestedWeeklyRate: plan.requestedWeeklyRate ?? null,
    maintenanceKcal: plan.maintenanceKcal,
    targetWeightKg: plan.targetWeightKg ?? null,
  };
}

/** Appends one entry to the persistent trace. An entry without a message is born seen. */
export function recordPlanEvent(store: WheightyStore, event: Omit<PlanEvent, 'id' | 'seen'>, nowIso: string): WheightyStore {
  const entry: PlanEvent = { ...event, id: newId(nowIso, 'e'), seen: event.message === null };
  return { ...store, meta: { ...store.meta, planEvents: [...store.meta.planEvents, entry] } };
}

/** Messages of the trace still to show, oldest first. */
export function unseenPlanMessages(store: WheightyStore): PlanEvent[] {
  return store.meta.planEvents.filter((e) => !e.seen && e.message !== null);
}

/** The user closed a message: it is not shown again (the entry stays in the trace). */
export function markPlanEventSeen(store: WheightyStore, id: string): WheightyStore {
  return { ...store, meta: { ...store.meta, planEvents: store.meta.planEvents.map((e) => (e.id === id ? { ...e, seen: true } : e)) } };
}

// ---------------------------------------------------------------------------
// Periodic replan (prompt 38 s3.1, K2; production since model 1.4.0)
// ---------------------------------------------------------------------------

/** Age of the plan in force, days since it was applied (its `createdAt` date). */
export function planAgeDays(plan: CurrentPlan, today: string): number {
  return daysBetween(planDateOf(plan), today);
}

export type PeriodicReplanResult =
  | { status: 'not_due'; ageDays: number }
  /** Due, but no applied calibration snapshot: the plan stays; the check date moves. */
  | { status: 'no_snapshot'; ageDays: number; store: WheightyStore }
  /** Due, but the rebuild failed (e.g. no feasible speed): the plan stays; the check date moves, the trace keeps the reason. */
  | { status: 'failed'; ageDays: number; reason: string; store: WheightyStore }
  | { status: 'replanned'; ageDays: number; store: WheightyStore; event: PlanEvent };

/**
 * Days since the last periodic evaluation: from the plan's solve, or from the last evaluation that left the plan in place
 * (`periodicReplanCheckedOn`), whichever is later.
 */
function daysSincePeriodicCheck(store: WheightyStore, plan: CurrentPlan, today: string): number {
  const checked = store.meta.periodicReplanCheckedOn;
  const since = checked !== null && checked > planDateOf(plan) ? checked : planDateOf(plan);
  return daysBetween(since, today);
}

/**
 * Periodic replan (prompt 38 s3.1, K2 of report 38). Due when PERIODIC_REPLAN_EVERY_DAYS (28) days have passed since the
 * plan was solved, or since the last evaluation that left it in place. The app is local: after days without opening, the
 * evaluation runs once, on the day's state, without replaying the missed days. The plan is rebuilt from the latest applied
 * calibration snapshot, without a new calibration, with the production solver (modeled body of the day at that snapshot's
 * offset); same rules as any rebuild (requested rate of the profile, BMI caps, floors, macro feasibility); the step target
 * is kept, as in `applyRecalibration`. Applied without confirmation (the estimated maintenance does not change, only the
 * start state): source 'periodic_replan', `createdAt` = today, a trace entry whose message is shown when the target moves
 * by PERIODIC_REPLAN_NOTICE_MIN_KCAL (10) kcal/day or more. Snapshots, surfacing reference and past logs are unchanged.
 */
export function periodicReplan(store: WheightyStore, today: string, options: { nowIso?: string; solver?: SolverRequest } = {}): PeriodicReplanResult {
  const plan = store.plan;
  if (!plan || !store.profile) return { status: 'not_due', ageDays: 0 };
  const ageDays = planAgeDays(plan, today);
  if (daysSincePeriodicCheck(store, plan, today) < PERIODIC_REPLAN_EVERY_DAYS) return { status: 'not_due', ageDays };
  const nowIso = options.nowIso ?? `${today}T00:00:00.000Z`;
  const withLogs = ensureDailyLogs(store, today);
  const checked: WheightyStore = { ...withLogs, meta: { ...withLogs.meta, periodicReplanCheckedOn: today } };
  const snapshot = latestAppliedSnapshot(store);
  if (!snapshot) return { status: 'no_snapshot', ageDays, store: checked };
  const result = buildPlanFromStore(withLogs, today, { source: 'periodic_replan', snapshot, stepTarget: plan.stepTarget, solver: options.solver ?? PRODUCTION_SOLVER });
  if (!result.ok) {
    const failed = recordPlanEvent(checked, { date: today, rule: 'periodic_replan', status: 'failed', reason: result.reason, before: planSummary(plan), after: null, message: null }, nowIso);
    return { status: 'failed', ageDays, reason: result.reason, store: failed };
  }
  const moved = Math.abs(result.plan.calorieTarget - plan.calorieTarget) >= PERIODIC_REPLAN_NOTICE_MIN_KCAL;
  const message = moved ? PLAN_MESSAGE.periodicReplan(plan.calorieTarget, result.plan.calorieTarget) : null;
  const next = recordPlanEvent(
    syncTodayLogTargets({ ...checked, plan: result.plan }, today),
    { date: today, rule: 'periodic_replan', status: 'applied', before: planSummary(plan), after: planSummary(result.plan), message },
    nowIso,
  );
  return { status: 'replanned', ageDays, store: next, event: next.meta.planEvents[next.meta.planEvents.length - 1] as PlanEvent };
}

// ---------------------------------------------------------------------------
// Guardrails of the plan in force (prompt 39 s3.1, G1 and G2; production since model 1.4.0)
// ---------------------------------------------------------------------------

export type PlanGuardrailRule = 'G1' | 'G2';

export type PlanGuardrailResult =
  /** No rule applies: the store is returned unchanged (same object). */
  | { status: 'none'; bmi: number | null; store: WheightyStore }
  /** A rule applies and the plan was rebuilt; the new plan resets the age (`createdAt` = today). */
  | { status: 'applied'; rule: PlanGuardrailRule; bmi: number; store: WheightyStore }
  /** A rule applies but the rebuild failed: the plan (and the profile) stay in place; the trace keeps the reason. */
  | { status: 'failed'; rule: PlanGuardrailRule; bmi: number; reason: string; store: WheightyStore };

/** Weight the guardrails read: the weight the domain rebuilds plans at (latest trend weight, else the profile's). */
export function guardrailWeightKg(store: WheightyStore): number | null {
  return store.profile ? (currentWeightKg(store) ?? store.profile.currentWeightKg) : null;
}

/**
 * Switch to maintenance at the current weight, with the step target of the plan in force: the path of the BMI-20 guardrail
 * (G1) and of the "objectif atteint" screen, so both agree (target = the weight the domain rebuilds at, unrounded; same
 * steps). `source`: 'guardrail' for G1, 'initial' when the user chooses it.
 */
export function switchToMaintenance(
  store: WheightyStore,
  today: string,
  source: CurrentPlan['source'] = 'initial',
  solver: SolverRequest = PRODUCTION_SOLVER,
): { ok: true; store: WheightyStore } | { ok: false; reason: string } {
  const weight = guardrailWeightKg(store);
  if (weight === null) return { ok: false, reason: 'no_profile' };
  return changeGoal(store, today, { goal: 'maintenance', targetWeightKg: weight, weeklyRate: 0 }, { ...(store.plan ? { stepTarget: store.plan.stepTarget } : {}), solver, source });
}

/**
 * Guardrails of the plan in force (prompt 39 s3.1, amendment 5 A5.3). Checked at every day change and after every weigh-in,
 * on the weight the domain uses when it rebuilds a plan (`guardrailWeightKg`: latest trend weight, else the profile
 * weight), the BMI of `bmi` (science):
 * - G1: a loss plan with a BMI under LOSS_UNAVAILABLE_BMI_BELOW (20) is replaced by a maintenance plan at that weight
 *   (`switchToMaintenance`: the profile goal becomes maintenance, target = that weight), with the step target of the plan
 *   in force. The goal then stays maintenance: every later rebuild reads the profile goal.
 * - G2: otherwise, a loss plan whose `weeklyRateTarget` exceeds `guardrailMaxWeeklyRate('loss', BMI)` is rebuilt with the
 *   rules of a recalculation (`buildPlanFromStore`: requested rate of the profile capped, floors, macro feasibility), with
 *   the step target of the plan in force.
 * Both use the production solver from the latest applied calibration snapshot (the population estimate before any), are
 * applied without confirmation (source 'guardrail'), and leave a trace entry with the message shown. A maintenance or gain
 * plan, or a loss plan within both rules, comes back unchanged (same object).
 */
export function enforcePlanGuardrails(store: WheightyStore, today: string, options: { nowIso?: string; solver?: SolverRequest } = {}): PlanGuardrailResult {
  const plan = store.plan;
  const profile = store.profile;
  const weight = guardrailWeightKg(store);
  if (!plan || !profile || weight === null) return { status: 'none', bmi: null, store };
  const currentBmi = bmi(weight, profile.heightCm);
  if (plan.goal !== 'loss') return { status: 'none', bmi: currentBmi, store };
  const nowIso = options.nowIso ?? `${today}T00:00:00.000Z`;
  const solver = options.solver ?? PRODUCTION_SOLVER;
  const failed = (rule: PlanGuardrailRule, reason: string): PlanGuardrailResult => {
    // A rebuild that keeps failing is recorded once a day.
    const known = store.meta.planEvents.some((e) => e.rule === rule && e.status === 'failed' && e.date === today);
    const next = known ? store : recordPlanEvent(store, { date: today, rule, status: 'failed', reason, before: planSummary(plan), after: null, message: null }, nowIso);
    return { status: 'failed', rule, bmi: currentBmi, reason, store: next };
  };
  if (currentBmi < LOSS_UNAVAILABLE_BMI_BELOW) {
    const r = switchToMaintenance(store, today, 'guardrail', solver);
    if (!r.ok) return failed('G1', r.reason);
    const after = r.store.plan as CurrentPlan;
    const next = recordPlanEvent(r.store, { date: today, rule: 'G1', status: 'applied', before: planSummary(plan), after: planSummary(after), message: PLAN_MESSAGE.guardrailBmi20 }, nowIso);
    return { status: 'applied', rule: 'G1', bmi: currentBmi, store: next };
  }
  const cap = guardrailMaxWeeklyRate('loss', currentBmi);
  if (cap === null || !(plan.weeklyRateTarget > cap + 1e-9)) return { status: 'none', bmi: currentBmi, store };
  const withLogs = ensureDailyLogs(store, today);
  const result = buildPlanFromStore(withLogs, today, { source: 'guardrail', stepTarget: plan.stepTarget, solver });
  if (!result.ok) return failed('G2', result.reason);
  const rebuilt = syncTodayLogTargets({ ...withLogs, plan: result.plan }, today);
  const next = recordPlanEvent(
    rebuilt,
    { date: today, rule: 'G2', status: 'applied', before: planSummary(plan), after: planSummary(result.plan), message: PLAN_MESSAGE.guardrailRateCap(result.plan.weeklyRateTarget) },
    nowIso,
  );
  return { status: 'applied', rule: 'G2', bmi: currentBmi, store: next };
}

// ---------------------------------------------------------------------------
// Goal status
// ---------------------------------------------------------------------------

export type GoalStatus = {
  reached: boolean;
  inMaintenanceZone: boolean | null;
  zone: { lowKg: number; highKg: number } | null;
};

export function goalStatus(store: WheightyStore): GoalStatus {
  const plan = store.plan;
  const trend = trendOf(store).summary.latest;
  if (!plan || !trend) return { reached: false, inMaintenanceZone: null, zone: null };
  const target = plan.targetWeightKg ?? store.profile?.targetWeightKg ?? trend.trendKg;
  if (plan.goal === 'maintenance') {
    const z = maintenanceZone(target);
    return { reached: false, inMaintenanceZone: trend.trendKg >= z.lowKg && trend.trendKg <= z.highKg, zone: { lowKg: z.lowKg, highKg: z.highKg } };
  }
  const reached = plan.goal === 'loss' ? trend.trendKg <= target : trend.trendKg >= target;
  return { reached, inMaintenanceZone: null, zone: null };
}

export function weighInDue(store: WheightyStore, today: string, everyDays: number): boolean {
  const last = latestRawWeight(store);
  if (!last) return true;
  return daysBetween(last.date, today) >= everyDays;
}
