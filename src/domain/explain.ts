/**
 * "Pourquoi ce résultat ?" view model: the actual calculation path of a plan, for users and for
 * scientific debugging. It only collects values the engine already produced (assessment, warm start,
 * goal plan, Hall initialisation, macros); it never introduces a new formula. Components format it.
 */
import { maxPalCategory, palCategoryFromValue } from '@/science/activity';
import type { BaselineAssessment } from '@/science/assessment';
import { evaluateGate, offsetGrid, summarizeGridPosterior } from '@/science/calibration';
import type { GateStatus } from '@/science/calibration';
import {
  CONFIDENCE_GOOD_MIN_WIDTH_KCAL,
  CONFIDENCE_HIGH_MAX_MAJOR_FRACTION,
  CONFIDENCE_HIGH_MIN_SPAN_DAYS,
  CONFIDENCE_HIGH_MIN_WEIGHINS,
  CONFIDENCE_MEDIUM_MIN_WIDTH_KCAL,
  ENERGY_AVAILABILITY_CAUTION_KCAL_PER_KG_FFM,
  EXPLANATION_RANGE_ROUNDING_KCAL,
  EXPLANATION_SCALE_VARIATION_EXAMPLE_KG,
  GOAL_SOLVER_HORIZON_DAYS,
  PAL_ACTIVE_MIN,
  PAL_LOW_ACTIVE_MIN,
  PAL_OUTLIER_MIN,
  PAL_VERY_ACTIVE_MIN,
  SCIENTIFIC_MODEL_VERSION,
  STORED_PLAN_OFFSET_MATCH_TOLERANCE_KCAL,
  WARM_START_CONFLICT_Z,
  WARM_START_INCOHERENT_OFFSET_BOUND,
  WARM_START_MEDIUM_MAX_WIDTH_RATIO,
  Z_80,
} from '@/science/constants';
import { hallParametersFor, maxSelectableWeeklyRate } from '@/science/goals';
import { nasemEerKcalDay } from '@/science/nasem';
import { populationPriorLogDensity } from '@/science/warmStart';
import type { GoalPlan, PlanContext, RateRejectionReason, SelectableRateLimit } from '@/science/goals';
import type { MeasuredRmrStatus } from '@/science/ree';
import type {
  CalibrationSnapshot,
  ConfidenceLevel,
  Goal,
  HistoricalIntakeEvidence,
  Interval,
  MacroGrams,
  OccupationActivity,
  PalCategory,
  ReeMethod,
  StructuredActivity,
  UserProfile,
  WalkingPace,
} from '@/science/types';
import type { ExactRoot, HistoricalHallDomain, WarmStartResult, WarmStartStatus } from '@/science/warmStart';
import { buildPlan, latestAppliedSnapshot, previewInitialPlan, storedWarmStart } from './engine';
import type { PlanBuildResult } from './engine';
import type { CurrentPlan, WheightyStore } from './types';
import { gateProgressFromGate } from './views';
import type { GateProgress } from './views';

export type ReeReason = 'valid_calorimetry' | 'athlete_profile' | 'general_adult';

/** Distance of the provisional PAL to the nearest category boundary, and what crossing it would change in NASEM. */
export type PalBoundaryDistance = {
  boundary: number;
  /** boundary - provisional PAL (positive: boundary above). */
  distancePal: number;
  /** Category on the other side of the boundary (occupation floor included); null when crossing changes nothing. */
  adjacentCategory: PalCategory | null;
  /** NASEM of the adjacent category minus the NASEM used, kcal/day; null when crossing changes nothing. */
  nasemDeltaKcal: number | null;
};

export type ConfidenceDetail =
  | { kind: 'population' }
  | { kind: 'warm_start'; widthKcal: number; priorWidthKcal: number; ratio: number; maxRatio: number; mediumReached: boolean }
  | {
      kind: 'calibrated';
      widthKcal: number;
      gateMet: boolean;
      goodMaxWidthKcal: number;
      highMaxWidthKcal: number;
      spanDays: number;
      highMinSpanDays: number;
      weighInCount: number;
      highMinWeighIns: number;
      majorDeviationFraction: number;
      highMaxMajorFraction: number;
    };

export type ActiveSignal = 'pal_boundary' | 'low_confidence' | 'incoherent' | 'conflict' | 'delta_clamped' | 'rate_adjusted';

export type ResultExplanation = {
  modelVersion: string;
  /** Display thresholds, so that components show distances to rules without importing science. */
  thresholds: {
    conflictZ: number;
    incoherentOffsetBoundKcal: number;
    energyAvailabilityKcalPerKgFfm: number;
    rangeRoundingKcal: number;
    scaleVariationExampleKg: number;
  };
  /** Weight of each source in the fused warm-start posterior (1 - fused variance / prior variance); null without a used history. */
  sources: null | { historyWeight: number; theoreticalWeight: number };
  /** Kcal/day equivalent of the example scale variation over the history duration (example / model sensitivity); null without a used history. */
  scaleVariationKcalPerDay: number | null;
  confidenceDetail: ConfidenceDetail;
  /** First-recalibration gate, one entry per real criterion (preview: no weigh-in yet). */
  gate: GateProgress;
  signals: ActiveSignal[];
  /** Stored-plan integrity: model version, calories at the stored offset and, for a warm start, the recomputed offset. */
  integrity: null | {
    versionMatches: boolean;
    caloriesMatch: boolean;
    calorieDiffKcal: number;
    offset: null | { storedKcal: number; recomputedKcal: number; diffKcal: number; toleranceKcal: number; matches: boolean };
  };
  ree: {
    kcal: number;
    method: ReeMethod;
    reason: ReeReason;
    measuredRmr: MeasuredRmrStatus['kind'];
    athleteLike: boolean;
    disagreementFlag: boolean;
  };
  activity: {
    stepsPerDay: number;
    walkingPace: WalkingPace;
    occupation: OccupationActivity;
    activities: StructuredActivity[];
    netStepKcal: number;
    exerciseKcalAfterOverlap: number;
    exerciseNetKcalBeforeOverlap: number;
    /** Step energy already counted by the phone and removed from step-dominant activities, kcal/day. */
    overlapRemovedKcal: number;
    /** True when at least one activity is step-dominant (only those have steps removed). */
    anyStepDominant: boolean;
    postureKcal: number;
    provisionalPal: number;
    palBoundaryFlag: boolean;
    palBoundary: PalBoundaryDistance;
    physicalOccupationFloorApplied: boolean;
  };
  population: {
    tdeeKcal: number;
    palCategory: PalCategory;
    weightKg: number;
    sigmaKcal: number;
    baseSigmaKcal: number;
    sigmaReasons: string[];
    sigmaMultipliers: Array<{ reason: string; factor: number }>;
    interval80: Interval;
    interval95: Interval;
  };
  history: null | {
    evidence: HistoricalIntakeEvidence;
    status: WarmStartStatus;
    /** NASEM at the history start weight; offsets below are converted to maintenance with it. */
    populationTdeeAtStartKcal: number;
    /** What the history suggests on its own (flat prior on the evidence support), as maintenance kcal/day. */
    historyOnly: { medianKcal: number; interval80: Interval; interval95: Interval; sdKcal: number } | null;
    /** Exact history-only median offset minus the linearised offset, kcal/day. */
    exactMinusLinearisedKcal: number | null;
    /** Linearised history-only offset: diagnostic approximation only, no decision uses it since model 1.2.0 (D-29). */
    linearised: { offsetKcal: number; sdKcal: number } | null;
    /** Exact root of predicted(offset) = observed and the coherence interval (source of the incoherent flag, D-29), not displayed yet. */
    exactRoot: ExactRoot | null;
    /** Edge probability mass of the history-only distribution on the calibration grid and on the evidence support, not displayed yet. */
    historyOnlyEdgeMass: WarmStartResult['historyOnlyEdgeMass'];
    uncertainty: { endpointWeightSdKg: number; intakeSdKcal: number; activitySdKcal: number; modelSdKcal: number } | null;
    incoherent: boolean;
    conflict: boolean;
    conflictZ: number | null;
    /** Hall admissible domain (excluded offsets) and delta-clamp diagnostic of the likelihood maximum (D-28), not displayed yet. */
    hallDomain: HistoricalHallDomain | null;
    /** Posterior after combining prior and history, as maintenance at the onboarding weight. */
    fusedMedianKcal: number;
    fusedInterval80: Interval;
  };
  maintenance: {
    source: 'population' | 'warm_start' | 'calibrated';
    kcal: number;
    personalOffsetKcal: number;
    interval80: Interval;
    interval95: Interval;
    confidence: ConfidenceLevel;
  };
  hall: {
    baselineIntakeKcal: number;
    baselineRmrKcal: number;
    bodyWeightKg: number;
    baselineCarbFraction: number;
    initialFatSource: 'measured' | 'jackson_2002';
    activityParameterKcalPerKgDay: number;
    activityParameterClamped: boolean;
  };
  goal: {
    goal: Goal;
    targetWeightKg: number;
    requestedWeeklyRate: number;
    appliedWeeklyRate: number;
    requestedKgPerWeek: number;
    appliedKgPerWeek: number;
    rateAdjusted: boolean;
    /** Rule that refused the requested rate, when the engine had to slow it down. */
    limitingRule: RateRejectionReason | null;
    rejections: GoalPlan['rejections'];
    guardrailMaxRate: number | null;
    selectableLimit: SelectableRateLimit | null;
  };
  solve: null | {
    horizonDays: number;
    targetWeightAtHorizonKg: number;
    weightAtHorizonKg: number;
    iterations: number;
    converged: boolean;
    /** Constant intake found by the solver before any steps adjustment. */
    calorieTargetKcal: number;
  };
  prescription: {
    calorieTargetKcal: number;
    stepTarget: number;
    stepsAdjusted: boolean;
    macros: MacroGrams;
    macrosDisplay: MacroGrams;
    proteinRule: string;
    macroFeasible: boolean;
  };
  safety: {
    hardFloorKcal: number;
    atHardFloor: boolean;
    belowRee: boolean;
    /** Calorie target minus the hard floor, kcal/day. */
    floorMarginKcal: number;
    energyAvailability: { status: 'not_applicable' | 'ok' | 'low'; kcalPerKgFfm: number | null };
    warnings: GoalPlan['warnings'];
  };
  /**
   * False when the stored plan was built with another model version, when rebuilding it no longer gives the stored
   * calories, or when the recomputed warm-start offset differs from the stored one beyond the tolerance (D-30).
   */
  matchesStoredPlan: boolean | null;
  storedPlanModelVersion: string | null;
};

function reeReason(a: BaselineAssessment): ReeReason {
  if (a.ree.method === 'measured_indirect_calorimetry') return 'valid_calorimetry';
  if (a.ree.method === 'ten_haaf_weight') return 'athlete_profile';
  return 'general_adult';
}

/** Nearest PAL category boundary and the NASEM of the category on its other side (same equations, no new formula). */
function palBoundaryDistance(profile: UserProfile, a: BaselineAssessment): PalBoundaryDistance {
  const pal = a.pal.provisionalPal;
  const boundaries = [PAL_LOW_ACTIVE_MIN, PAL_ACTIVE_MIN, PAL_VERY_ACTIVE_MIN, PAL_OUTLIER_MIN];
  let boundary = boundaries[0] as number;
  for (const b of boundaries) if (Math.abs(b - pal) < Math.abs(boundary - pal)) boundary = b;
  // Category just across the boundary: at the boundary itself when it lies above, just below it otherwise.
  const across = pal < boundary ? palCategoryFromValue(boundary) : palCategoryFromValue(boundary - 1e-9);
  const adjacent = profile.occupation === 'physical' ? maxPalCategory(across, 'active') : across;
  const changes = adjacent !== a.palCategory;
  return {
    boundary,
    distancePal: boundary - pal,
    adjacentCategory: changes ? adjacent : null,
    nasemDeltaKcal: changes ? nasemEerKcalDay({ sex: profile.sexForEquation, ageYears: profile.ageYears, heightCm: profile.heightCm, weightKg: a.weightKg, palCategory: adjacent }) - a.populationTdeeKcal : null,
  };
}

function confidenceDetail(source: ResultExplanation['maintenance']['source'], w: WarmStartResult | null, maintenanceInterval80: Interval, gate: GateStatus): ConfidenceDetail {
  const widthKcal = maintenanceInterval80[1] - maintenanceInterval80[0];
  if (source === 'warm_start' && w) {
    // Same quantities as the warm-start confidence rule (D-23).
    const fusedWidth = w.posterior.interval80[1] - w.posterior.interval80[0];
    const priorWidthKcal = 2 * Z_80 * w.priorSigmaKcal;
    return { kind: 'warm_start', widthKcal: fusedWidth, priorWidthKcal, ratio: fusedWidth / priorWidthKcal, maxRatio: WARM_START_MEDIUM_MAX_WIDTH_RATIO, mediumReached: w.confidence === 'medium' };
  }
  if (source === 'calibrated') {
    return {
      kind: 'calibrated',
      widthKcal,
      gateMet: gate.met,
      goodMaxWidthKcal: CONFIDENCE_MEDIUM_MIN_WIDTH_KCAL,
      highMaxWidthKcal: CONFIDENCE_GOOD_MIN_WIDTH_KCAL,
      spanDays: gate.spanDays,
      highMinSpanDays: CONFIDENCE_HIGH_MIN_SPAN_DAYS,
      weighInCount: gate.weighInCount,
      highMinWeighIns: CONFIDENCE_HIGH_MIN_WEIGHINS,
      majorDeviationFraction: gate.majorDeviationFraction,
      highMaxMajorFraction: CONFIDENCE_HIGH_MAX_MAJOR_FRACTION,
    };
  }
  return { kind: 'population' };
}

function build(
  result: Extract<PlanBuildResult, { ok: true }>,
  profile: UserProfile,
  options: {
    warmStart: WarmStartResult | null;
    evidence: HistoricalIntakeEvidence | null;
    source: ResultExplanation['maintenance']['source'];
    confidence: ConfidenceLevel;
    stored: CurrentPlan | null;
    snapshot: CalibrationSnapshot | null;
    gate: GateStatus;
  },
): ResultExplanation {
  const { assessment: a, goalPlan: g, plan, context } = result;
  const ctx: PlanContext = context;
  const hall = hallParametersFor(ctx, plan.goal);
  const w = options.warmStart;
  const used = w?.status === 'used' ? w : null;
  const history: ResultExplanation['history'] =
    options.evidence && w
      ? {
          evidence: options.evidence,
          status: w.status,
          populationTdeeAtStartKcal: w.populationTdeeAtStartKcal,
          historyOnly: w.historyOnly
            ? {
                medianKcal: w.populationTdeeAtStartKcal + w.historyOnly.medianKcal,
                interval80: [w.populationTdeeAtStartKcal + w.historyOnly.interval80[0], w.populationTdeeAtStartKcal + w.historyOnly.interval80[1]],
                interval95: [w.populationTdeeAtStartKcal + w.historyOnly.interval95[0], w.populationTdeeAtStartKcal + w.historyOnly.interval95[1]],
                sdKcal: w.historyOnly.sdKcal,
              }
            : null,
          exactMinusLinearisedKcal: w.historyOnly && w.likelihood.historyOnlyOffsetKcal !== null ? w.historyOnly.medianKcal - w.likelihood.historyOnlyOffsetKcal : null,
          linearised: w.likelihood.historyOnlyOffsetKcal !== null && w.likelihood.historyOnlySdKcal !== null ? { offsetKcal: w.likelihood.historyOnlyOffsetKcal, sdKcal: w.likelihood.historyOnlySdKcal } : null,
          exactRoot: w.likelihood.exactRoot,
          historyOnlyEdgeMass: w.historyOnlyEdgeMass,
          uncertainty: w.likelihood.components,
          incoherent: w.likelihood.incoherent,
          conflict: w.conflict,
          conflictZ: w.conflictZ,
          hallDomain: w.likelihood.hallDomain,
          fusedMedianKcal: a.populationTdeeKcal + w.posterior.medianKcal,
          fusedInterval80: [a.populationTdeeKcal + w.posterior.interval80[0], a.populationTdeeKcal + w.posterior.interval80[1]],
        }
      : null;
  const ea = g.energyAvailabilityKcalPerKgFfm;
  const limiting = g.rateAdjusted ? (g.rejections[0]?.reason ?? null) : null;
  const weight = a.weightKg;

  // Weight of each source in the fused warm-start posterior: 1 - fused variance / prior variance, both on the grid (P2 measure 6.1).
  let sources: ResultExplanation['sources'] = null;
  if (used && options.source === 'warm_start') {
    const prior = summarizeGridPosterior(offsetGrid(), populationPriorLogDensity(used.priorSigmaKcal));
    const historyWeight = Math.min(1, Math.max(0, 1 - (used.posterior.sdKcal * used.posterior.sdKcal) / (prior.sdKcal * prior.sdKcal)));
    sources = { historyWeight, theoreticalWeight: 1 - historyWeight };
  }
  const sensitivity = used?.likelihood.sensitivityKgPerKcal ?? null;
  const confidence = confidenceDetail(options.source, used, plan.maintenanceInterval80, options.gate);

  const signals: ActiveSignal[] = [];
  if (a.pal.palBoundaryFlag) signals.push('pal_boundary');
  if (options.confidence === 'low') signals.push('low_confidence');
  if (used?.likelihood.incoherent) signals.push('incoherent');
  if (used?.conflict) signals.push('conflict');
  if (hall.deltaClamped) signals.push('delta_clamped');
  if (g.rateAdjusted) signals.push('rate_adjusted');

  let integrity: ResultExplanation['integrity'] = null;
  if (options.stored) {
    const calorieDiffKcal = plan.calorieTarget - options.stored.calorieTarget;
    const snap = options.snapshot;
    const offset =
      snap?.source === 'warm_start' && used
        ? (() => {
            const diffKcal = used.posterior.medianKcal - snap.posteriorMedianOffsetKcal;
            return { storedKcal: snap.posteriorMedianOffsetKcal, recomputedKcal: used.posterior.medianKcal, diffKcal, toleranceKcal: STORED_PLAN_OFFSET_MATCH_TOLERANCE_KCAL, matches: Math.abs(diffKcal) <= STORED_PLAN_OFFSET_MATCH_TOLERANCE_KCAL };
          })()
        : null;
    integrity = { versionMatches: options.stored.scientificModelVersion === SCIENTIFIC_MODEL_VERSION, caloriesMatch: Math.abs(calorieDiffKcal) < 1, calorieDiffKcal, offset };
  }

  return {
    modelVersion: SCIENTIFIC_MODEL_VERSION,
    thresholds: {
      conflictZ: WARM_START_CONFLICT_Z,
      incoherentOffsetBoundKcal: WARM_START_INCOHERENT_OFFSET_BOUND,
      energyAvailabilityKcalPerKgFfm: ENERGY_AVAILABILITY_CAUTION_KCAL_PER_KG_FFM,
      rangeRoundingKcal: EXPLANATION_RANGE_ROUNDING_KCAL,
      scaleVariationExampleKg: EXPLANATION_SCALE_VARIATION_EXAMPLE_KG,
    },
    sources,
    scaleVariationKcalPerDay: sensitivity ? EXPLANATION_SCALE_VARIATION_EXAMPLE_KG / Math.abs(sensitivity) : null,
    confidenceDetail: confidence,
    gate: gateProgressFromGate(options.gate),
    signals,
    integrity,
    ree: { kcal: a.ree.reeKcalDay, method: a.ree.method, reason: reeReason(a), measuredRmr: a.ree.measuredRmrStatus.kind, athleteLike: a.ree.athleteLike, disagreementFlag: a.ree.reeModelDisagreement },
    activity: {
      stepsPerDay: profile.averageSteps7d,
      walkingPace: profile.walkingPace,
      occupation: profile.occupation,
      activities: profile.activities,
      netStepKcal: a.netStepKcal,
      exerciseKcalAfterOverlap: a.exercise.dailyAvgKcalAfterOverlap,
      exerciseNetKcalBeforeOverlap: a.exercise.dailyAvgNetKcalBeforeOverlap,
      overlapRemovedKcal: a.exercise.dailyAvgNetKcalBeforeOverlap - a.exercise.dailyAvgKcalAfterOverlap,
      anyStepDominant: a.exercise.perActivity.some((e) => e.stepDominant),
      postureKcal: a.pal.postureKcal,
      provisionalPal: a.pal.provisionalPal,
      palBoundaryFlag: a.pal.palBoundaryFlag,
      palBoundary: palBoundaryDistance(profile, a),
      physicalOccupationFloorApplied: a.pal.physicalOccupationFloorApplied,
    },
    population: {
      tdeeKcal: a.populationTdeeKcal,
      palCategory: a.palCategory,
      weightKg: weight,
      sigmaKcal: a.sigma.sigmaKcal,
      baseSigmaKcal: a.sigma.baseSigmaKcal,
      sigmaReasons: a.sigma.multipliers.map((m) => m.reason),
      sigmaMultipliers: a.sigma.multipliers.map((m) => ({ reason: m.reason, factor: m.factor })),
      interval80: a.interval80,
      interval95: a.interval95,
    },
    history,
    maintenance: {
      source: options.source,
      kcal: plan.maintenanceKcal,
      personalOffsetKcal: plan.personalOffsetKcal ?? 0,
      interval80: plan.maintenanceInterval80,
      interval95: plan.maintenanceInterval95,
      confidence: options.confidence,
    },
    hall: {
      baselineIntakeKcal: hall.input.baselineIntakeKcal,
      baselineRmrKcal: hall.input.baselineRmrKcal,
      bodyWeightKg: hall.input.bodyWeightKg,
      baselineCarbFraction: hall.input.baselineCarbFraction,
      initialFatSource: hall.initialFatSource,
      activityParameterKcalPerKgDay: hall.deltaBaselineKcalPerKgDay,
      activityParameterClamped: hall.deltaClamped,
    },
    goal: {
      goal: plan.goal,
      targetWeightKg: plan.targetWeightKg ?? profile.targetWeightKg,
      requestedWeeklyRate: g.requestedWeeklyRate,
      appliedWeeklyRate: g.weeklyRateTarget,
      requestedKgPerWeek: g.requestedWeeklyRate * weight,
      appliedKgPerWeek: g.weeklyRateTarget * weight,
      rateAdjusted: g.rateAdjusted,
      limitingRule: limiting,
      rejections: g.rejections,
      guardrailMaxRate: g.guardrailMaxRate,
      selectableLimit: plan.goal === 'maintenance' ? null : maxSelectableWeeklyRate(ctx, plan.goal, ctx.maintenanceStepsPerDay),
    },
    solve: g.solve
      ? {
          horizonDays: GOAL_SOLVER_HORIZON_DAYS,
          targetWeightAtHorizonKg: g.solve.targetWeightAtHorizonKg,
          weightAtHorizonKg: g.solve.weightAtHorizonKg,
          iterations: g.solve.iterations,
          converged: g.solve.converged,
          calorieTargetKcal: g.solve.calorieTargetKcal,
        }
      : null,
    prescription: {
      calorieTargetKcal: plan.calorieTarget,
      stepTarget: plan.stepTarget,
      stepsAdjusted: plan.stepTarget !== (plan.baselineStepTarget ?? plan.stepTarget),
      macros: plan.macros,
      macrosDisplay: plan.macrosDisplay ?? plan.macros,
      proteinRule: plan.proteinRule ?? '',
      macroFeasible: g.macros?.feasible ?? false,
    },
    safety: {
      hardFloorKcal: g.hardFloorKcal,
      atHardFloor: Math.abs(plan.calorieTarget - g.hardFloorKcal) < 1,
      belowRee: g.warnings.belowRee,
      floorMarginKcal: plan.calorieTarget - g.hardFloorKcal,
      energyAvailability: { status: ea === null ? 'not_applicable' : g.warnings.lowEnergyAvailability ? 'low' : 'ok', kcalPerKgFfm: ea },
      warnings: g.warnings,
    },
    matchesStoredPlan: integrity ? integrity.versionMatches && integrity.caloriesMatch && (integrity.offset?.matches ?? true) : null,
    storedPlanModelVersion: options.stored?.scientificModelVersion ?? null,
  };
}

/** Explanation of the Result screen preview (before anything is saved). */
export function explainPreview(profile: UserProfile, today: string, evidence: HistoricalIntakeEvidence | null): ResultExplanation | null {
  const preview = previewInitialPlan(profile, today, evidence);
  if (!preview.ok) return null;
  const used = preview.warmStart?.status === 'used';
  // Before onboarding nothing is stored: no weigh-in yet counts towards the recalibration gate.
  return build(preview, profile, { warmStart: preview.warmStart, evidence: preview.warmStart ? evidence : null, source: used ? 'warm_start' : 'population', confidence: preview.confidence, stored: null, snapshot: null, gate: evaluateGate([], []) });
}

/**
 * Explanation of the stored plan, rebuilt with the inputs it was built from (plan weight, fixed PAL,
 * applied offset, requested rate, steps). `matchesStoredPlan` reports whether the rebuild reproduces it.
 */
export function explainCurrentPlan(store: WheightyStore, today: string): ResultExplanation | null {
  const profile = store.profile;
  const plan = store.plan;
  if (!profile || !plan) return null;
  const snapshot = latestAppliedSnapshot(store);
  const result = buildPlan({
    profile,
    today,
    weightKg: plan.planWeightKg ?? profile.currentWeightKg,
    palCategory: plan.palCategory,
    personalOffsetKcal: plan.personalOffsetKcal ?? 0,
    ...(snapshot ? { offsetInterval80: [snapshot.interval80[0], snapshot.interval80[1]] as Interval, offsetInterval95: [snapshot.interval95[0], snapshot.interval95[1]] as Interval } : {}),
    stepTarget: plan.stepTarget,
    source: plan.source,
    goal: plan.goal,
    ...(plan.targetWeightKg !== undefined ? { targetWeightKg: plan.targetWeightKg } : {}),
    weeklyRate: plan.requestedWeeklyRate ?? plan.weeklyRateTarget,
  });
  if (!result.ok) return null;
  const warm = storedWarmStart(store);
  const source: ResultExplanation['maintenance']['source'] = snapshot === null ? 'population' : snapshot.source === 'warm_start' ? 'warm_start' : 'calibrated';
  return build(result, profile, { warmStart: warm, evidence: store.historicalEvidence, source, confidence: snapshot?.confidence ?? 'low', stored: plan, snapshot, gate: evaluateGate(store.weights, store.dailyLogs) });
}

