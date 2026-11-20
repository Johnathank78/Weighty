/**
 * Screen view models derived from the store and engine results.
 * Only selection, aggregation and display rounding: no scientific formulas.
 */
import { GATE_MIN_ADHERENCE_COVERAGE, GATE_MIN_CLEAN_WEIGHINS, GATE_MIN_SPAN_DAYS, GATE_MIN_WEIGHINS, KCAL_PER_G_CARB, KCAL_PER_G_FAT, KCAL_PER_G_PROTEIN, WEIGH_IN_REMINDER_INTERVAL_DAYS } from '@/science/constants';
import { addDays, daysBetween } from '@/science/dates';
import { initialEnergyBalanceKcal, lossAvailability, maintenanceZone, projectPlan, projectPlanWindow } from '@/science/goals';
import type { Projection, ProjectionWindow } from '@/science/goals';
import { bmi, minimumTargetWeightKg } from '@/science/macros';
import type { DailyLog, Goal, MacroGrams, SpeedZone } from '@/science/types';
import { assessBaseline, planContextFrom } from '@/science/assessment';
import { trackingPauses, validWeights } from '@/science/calibration';
import type { GateStatus } from '@/science/calibration';
import { formatInteger, formatWeight, weightUnitLabel } from './format';
import { snapWeeklyRate, speedZoneFor } from '@/science/goals';
import type { CalibrationState } from './engine';
import { contextForCurrentPlan, currentWeightKg, gateOf, goalStatus, hasAppliedRecalibration, latestAppliedSnapshot, weighInStale, latestRawWeight, MAINTENANCE_PROJECTION_DAYS, solverOptionsFor, trendOf, weighInDue } from './engine';
import { alignedStatusLine, journalRead, measuredProjectionContext } from './journalPath';
import { JOURNAL_MESSAGE, maintenancePair, SHORT_MESSAGE } from './planMessages';
import type { MaintenanceAt } from './planMessages';
import { localTimeOf } from './journal';
import type { CurrentPlan, UnitPreference, WheightyStore } from './types';

export function displayMacros(plan: CurrentPlan): MacroGrams {
  return plan.macrosDisplay ?? { proteinG: Math.round(plan.macros.proteinG), carbsG: Math.round(plan.macros.carbsG), fatG: Math.round(plan.macros.fatG) };
}

export function macroEnergyShares(m: MacroGrams): { protein: number; carbs: number; fat: number } {
  const p = m.proteinG * KCAL_PER_G_PROTEIN;
  const c = m.carbsG * KCAL_PER_G_CARB;
  const f = m.fatG * KCAL_PER_G_FAT;
  const total = p + c + f || 1;
  return { protein: p / total, carbs: c / total, fat: f / total };
}

export function todayLog(store: WheightyStore, today: string): DailyLog | undefined {
  return store.dailyLogs.find((l) => l.date === today);
}

export type GateCriterion = {
  key: 'weighIns' | 'span' | 'cleanWeighIns' | 'adherence';
  have: number;
  need: number;
  /** Exactly the engine's criterion (05 s8), never recomputed here. */
  met: boolean;
  /** Share of the requirement reached, capped at 1, for the per-criterion bar. */
  fill: number;
};

export type GateProgress = {
  criteria: GateCriterion[];
  metCount: number;
  remainingWeighIns: number;
  remainingDays: number;
  /** True only when every criterion is met, as in evaluateGate. */
  met: boolean;
  /** Report 49, point 6 (D4): first weigh-in counted after a pause ("Comptées depuis ta reprise du {date}."), null without. */
  resumedOn: string | null;
};

/** First-recalibration progress, one entry per real gate criterion (weigh-ins, span, clean weigh-ins, adherence information). */
export function gateProgress(state: CalibrationState | null, store: WheightyStore): GateProgress {
  return gateProgressFromGate(state?.gate ?? gateOf(store));
}

/** Same progress from an evaluated gate (also used by the explanation view model). */
export function gateProgressFromGate(gate: GateStatus): GateProgress {
  const fill = (have: number, need: number) => (need > 0 ? Math.max(0, Math.min(1, have / need)) : 1);
  const criteria: GateCriterion[] = [
    { key: 'weighIns', have: gate.weighInCount, need: GATE_MIN_WEIGHINS, met: gate.criteria.enoughWeighIns, fill: fill(gate.weighInCount, GATE_MIN_WEIGHINS) },
    { key: 'span', have: gate.spanDays, need: GATE_MIN_SPAN_DAYS, met: gate.criteria.enoughSpan, fill: fill(gate.spanDays, GATE_MIN_SPAN_DAYS) },
    { key: 'cleanWeighIns', have: gate.cleanWeighInCount, need: GATE_MIN_CLEAN_WEIGHINS, met: gate.criteria.enoughCleanWeighIns, fill: fill(gate.cleanWeighInCount, GATE_MIN_CLEAN_WEIGHINS) },
    { key: 'adherence', have: gate.adherenceCoverage, need: GATE_MIN_ADHERENCE_COVERAGE, met: gate.criteria.enoughAdherenceInfo, fill: fill(gate.adherenceCoverage, GATE_MIN_ADHERENCE_COVERAGE) },
  ];
  return {
    criteria,
    metCount: criteria.filter((c) => c.met).length,
    remainingWeighIns: Math.max(0, GATE_MIN_WEIGHINS - gate.weighInCount),
    remainingDays: Math.max(0, GATE_MIN_SPAN_DAYS - gate.spanDays),
    met: gate.met,
    resumedOn: gate.pauses.length > 0 ? gate.periodStart : null,
  };
}

/** Share of the days of the window with an adherence noted (declared, or deduced from the journal) the gate requires, in %. */
export function gateAdherencePercent(): number {
  return Math.round(GATE_MIN_ADHERENCE_COVERAGE * 100);
}

/**
 * Display of one gate criterion: counts for weigh-ins and days; for adherence, the share of the days of the window with an
 * adherence noted, and the share required (UX pass 2, point 8).
 */
export function gateCriterionValue(c: GateCriterion): string {
  if (c.key === 'adherence') return `${Math.round(c.have * 100)} % des jours, ${Math.round(c.need * 100)} % requis`;
  if (c.key === 'span') return `${formatInteger(Math.min(c.have, c.need))} / ${formatInteger(c.need)} jours`;
  return `${formatInteger(Math.min(c.have, c.need))} / ${formatInteger(c.need)}`;
}

export type AdherenceSummary ={ label: NonNullable<DailyLog['adherence']> | null; trackedDays: number; majorDays: number };

export function adherenceSummary(store: WheightyStore): AdherenceSummary {
  const counts = { on_plan: 0, minor_deviation: 0, major_deviation: 0 };
  for (const l of store.dailyLogs) if (l.adherence) counts[l.adherence]++;
  const tracked = counts.on_plan + counts.minor_deviation + counts.major_deviation;
  if (tracked === 0) return { label: null, trackedDays: 0, majorDays: 0 };
  const label = (Object.keys(counts) as Array<keyof typeof counts>).reduce((best, k) => (counts[k] > counts[best] ? k : best), 'on_plan');
  return { label, trackedDays: tracked, majorDays: counts.major_deviation };
}

export function averageLoggedSteps(store: WheightyStore): number | null {
  const logged = store.dailyLogs.filter((l) => l.actualSteps !== undefined);
  if (logged.length === 0) return null;
  return logged.reduce((s, l) => s + (l.actualSteps ?? 0), 0) / logged.length;
}

export function weeksOfTracking(store: WheightyStore, today: string): number {
  const start = store.meta.onboardingDate;
  if (!start) return 0;
  return Math.max(0, Math.floor(daysBetween(start, today) / 7));
}

export function reminderDue(store: WheightyStore, today: string): boolean {
  return store.preferences.weighInReminder && weighInDue(store, today, WEIGH_IN_REMINDER_INTERVAL_DAYS);
}

export function nextWeighInDate(store: WheightyStore, today: string): string {
  const last = latestRawWeight(store);
  if (!last) return today;
  const next = addDays(last.date, WEIGH_IN_REMINDER_INTERVAL_DAYS);
  return next < today ? today : next;
}

/**
 * Goal availability hints for the goal screens (guardrails come from the engine). `minTargetKg` (pass 5a): lowest loss
 * target, the BMI-20 weight; loss is not offered when it leaves less than half a kilo below the current weight.
 */
export function goalGuardrails(heightCm: number, weightKg: number): { lossAvailable: boolean; maxLossRate: number | null; minTargetKg: number } {
  const minTargetKg = minimumTargetWeightKg(heightCm);
  const a = lossAvailability(bmi(weightKg, heightCm));
  return a.available && minTargetKg <= weightKg - LOSS_TARGET_MIN_GAP_KG ? { lossAvailable: true, maxLossRate: a.maxRate, minTargetKg } : { lossAvailable: false, maxLossRate: null, minTargetKg };
}

/** Smallest gap between the current weight and a loss target offered by the target sliders, kg. */
export const LOSS_TARGET_MIN_GAP_KG = 0.5;

/** Resolution of the target weight sliders, kg (metric). */
export const TARGET_WEIGHT_STEP_KG = 0.5;

/**
 * Bounds of the target weight slider (UX pass 1, D), the same at onboarding and in the goal change. Loss: from the BMI-20
 * weight (`minimumTargetWeightKg`, through `goalGuardrails`) rounded up to the half kilo, so the lowest position never
 * falls under BMI 20, to half a kilo under the current weight. Gain: from half a kilo above the current weight to 35 %
 * above it. The rule of the onboarding slider, now shared.
 */
export function targetWeightSliderBounds(goal: 'loss' | 'gain', weightKg: number, heightCm: number): { minKg: number; maxKg: number } {
  const half = (kg: number, round: (x: number) => number) => round(kg / TARGET_WEIGHT_STEP_KG) * TARGET_WEIGHT_STEP_KG;
  if (goal === 'loss') {
    const minKg = half(Math.max(35, weightKg * 0.6, goalGuardrails(heightCm, weightKg).minTargetKg), Math.ceil);
    return { minKg, maxKg: Math.max(minKg, half(weightKg - LOSS_TARGET_MIN_GAP_KG, Math.round)) };
  }
  const minKg = half(weightKg + 0.5, Math.round);
  return { minKg, maxKg: Math.max(minKg, half(weightKg * 1.35, Math.round)) };
}

/** Estimated kg per week equivalent of a weekly rate at the given weight (display only). */
export function weeklyChangeKg(weeklyRate: number, weightKg: number): number {
  return weeklyRate * weightKg;
}

export function speedZone(goal: Goal, weeklyRate: number): SpeedZone {
  return speedZoneFor(goal, weeklyRate);
}

/** Snaps a slider value onto the 0.05 percent grid. */
export function snapRate(weeklyRate: number): number {
  return snapWeeklyRate(weeklyRate);
}

export function maintenanceZoneFor(targetWeightKg: number): { lowKg: number; highKg: number } {
  const z = maintenanceZone(targetWeightKg);
  return { lowKg: z.lowKg, highKg: z.highKg };
}

/**
 * Data of the Suivi chart. Days count from `startDate` (day 0, the left edge of the window). UX pass 3, point 1: one time
 * scale for the window, a day has the same width before and after today.
 */
export type ChartSeries = {
  raw: Array<{ day: number; kg: number; date: string }>;
  trend: Array<{ day: number; kg: number }>;
  /** Where the plan leads, from today (day `todayDay`), one point per day, within the window. */
  projection: Array<{ day: number; kg: number }>;
  band: Array<{ day: number; lo: number; hi: number }>;
  todayDay: number;
  startDate: string;
  /** Last day of the window (right edge), and its date. */
  endDay: number;
  endDate: string;
  /** Tracking pauses (report 49, D4: two valid weigh-ins 15 days apart or more) that touch the window, in days and dates. */
  pauses: Array<{ fromDay: number; toDay: number; from: string; to: string }>;
  /** Where the projection reaches the target weight (day and date), when it does within the window; null otherwise. */
  arrival: { day: number; date: string; kg: number } | null;
  /** Nothing is drawn ahead yet: Wheighty is still learning (A3). */
  projectionPending: boolean;
  /** D3 (report 49, point 4): nothing is drawn ahead because the last weigh-in is more than 7 days old. */
  weighInNeeded: boolean;
};

/** "Ce mois-ci" (UX pass 3, point 1a): the days shown before today, and as many after. */
export const TRACKING_MONTH_DAYS_EACH_SIDE = 30;
/** "Tout": the days shown after today when the projection does not reach the target (maintenance, or never reached). */
export const TRACKING_ALL_DAYS_AHEAD = 30;
/** "Tout": the window never goes further than this after today. */
export const TRACKING_ALL_MAX_DAYS_AHEAD = 365;
/** The chart asks for one sample of the projection per day (UX pass 3, point 1c). */
export const TRACKING_PROJECTION_SAMPLE_DAYS = 1;

/**
 * Where the plan leads from today (A3): the same model as the plan, restarted from the current trend
 * weight and from the maintenance Wheighty estimates now, not the snapshot frozen when the plan was
 * created. Nothing is stored and no engine output changes: this is what the Suivi chart draws.
 * Production solver (pass 5a): the Hall model starts from the modeled body of the day, at the offset of the calibration
 * shown (the candidate when the gate is met, else the latest applied one); equilibrium before any calibration.
 * `frame` (pass 5a s4, warning ahead of BMI 20): fixed horizon, daily step, stop under a weight, instead of the plan's
 * projection to its target.
 * `sampleEveryDays` (UX pass 3, point 1c): sampling of the trajectory to the target (the chart of Suivi asks for 1); absent,
 * the plan's own sampling. The day the target is reached does not depend on it.
 */
export function projectionFromToday(store: WheightyStore, today: string, state: CalibrationState | null, frame?: ProjectionWindow, sampleEveryDays?: number): Projection | null {
  const plan = store.plan;
  const profile = store.profile;
  const latest = trendOf(store).summary.latest;
  if (!plan || !profile || !latest) return null;
  if (measuredHabit(store) !== null) {
    // Measured habit (pass 5b): the journal maintenance of the day, the modeled body of the journal, the intake the plan
    // expects (displayed target x h), as the plans of the habit are solved.
    const m = measuredProjectionContext(store, today);
    if (!m) return null;
    const baseM = { goal: plan.goal, scenario: { calorieTargetKcal: m.calorieTargetKcal, stepsPerDay: plan.stepTarget }, maintenanceOffsets80: m.maintenanceOffsets80 };
    if (frame) return projectPlanWindow(m.context, baseM, frame);
    return projectPlan(m.context, { ...baseM, targetWeightKg: plan.targetWeightKg ?? profile.targetWeightKg, maintenanceHorizonDays: MAINTENANCE_PROJECTION_DAYS, ...(sampleEveryDays !== undefined ? { sampleEveryDays } : {}) });
  }
  const maintenanceKcal = state?.currentMaintenanceKcal ?? plan.maintenanceKcal;
  const interval80 = state?.currentInterval80 ?? plan.maintenanceInterval80;
  const assessment = assessBaseline(profile, today, { weightKg: latest.trendKg, palCategory: plan.palCategory });
  const snapshot = state?.gate.met && state.candidate ? state.candidate : latestAppliedSnapshot(store);
  const context = { ...planContextFrom(profile, assessment, maintenanceKcal), solver: solverOptionsFor(store, today, snapshot) };
  const base = {
    goal: plan.goal,
    scenario: { calorieTargetKcal: plan.calorieTarget, stepsPerDay: plan.stepTarget },
    maintenanceOffsets80: [interval80[0] - maintenanceKcal, interval80[1] - maintenanceKcal] as const,
  };
  if (frame) return projectPlanWindow(context, base, frame);
  return projectPlan(context, { ...base, targetWeightKg: plan.targetWeightKg ?? profile.targetWeightKg, maintenanceHorizonDays: MAINTENANCE_PROJECTION_DAYS, ...(sampleEveryDays !== undefined ? { sampleEveryDays } : {}) });
}

/**
 * Periods of the Suivi chart (UX pass 2, point 5): "Ce mois-ci", the default, and "Tout". UX pass 3, point 1a: "Ce mois-ci" is
 * a fixed window of 30 days before today and 30 after (today in the middle); "Tout" runs from the first weigh-in to the day
 * the projection reaches the target weight (30 days after today without one, 365 at most).
 */
export type TrackingRange = 'month' | 'all';
export const TRACKING_RANGES: readonly TrackingRange[] = ['month', 'all'];
export const DEFAULT_TRACKING_RANGE: TrackingRange = 'month';
export const TRACKING_RANGE_DAYS: Readonly<Record<TrackingRange, number | null>> = { month: 30, all: null };

/**
 * Weight chart data for Suivi: raw points, trend, pauses, and where the plan leads from today, on one time scale.
 * `rangeDays`: "Ce mois-ci" (the days on each side of today), or null for "Tout".
 */
export function trackingChart(store: WheightyStore, today: string, rangeDays: number | null, state: CalibrationState | null = null): ChartSeries | null {
  const { points } = trendOf(store);
  if (points.length === 0) return null;
  const first = points[0]?.date ?? today;
  // "Ce mois-ci": a fixed window around today, partly empty for a new user. "Tout": from the first weigh-in.
  const startDate = rangeDays === null ? (first < today ? first : today) : addDays(today, -rangeDays);
  const visible = points.filter((p) => p.date >= startDate);
  const raw = visible.map((p) => ({ day: daysBetween(startDate, p.date), kg: p.rawKg, date: p.date }));
  const trend = visible.map((p) => ({ day: daysBetween(startDate, p.date), kg: p.trendKg }));
  const todayDay = daysBetween(startDate, today);
  // While the first calibration is not reached, the estimate is still the onboarding prior: no curve is
  // drawn ahead rather than a confident looking one (decision of the product owner). Once a recalibration was applied, the
  // projection stays whatever the gate of the day (report 49, point 2, D2).
  const learning = measuredHabit(store) === null && !(state?.gate.met && state.candidate) && !hasAppliedRecalibration(store);
  // D3 (report 49, point 4): no projection without a recent weigh-in (the measured habit has its own weigh-in rules).
  const weighInNeeded = measuredHabit(store) === null && weighInStale(store, today);
  // UX pass 3, point 1c: one sample per day for the drawing only; the day of arrival is the model's (daily stop).
  const live = learning || weighInNeeded ? null : projectionFromToday(store, today, state, undefined, TRACKING_PROJECTION_SAMPLE_DAYS);
  // Right edge: "Ce mois-ci", as many days after today as before; "Tout", the arrival of the projection (30 days after today
  // without one: maintenance, never reached, nothing projected), at most 365 days after today.
  const daysAhead =
    rangeDays !== null ? rangeDays : live?.daysToTarget != null ? Math.min(TRACKING_ALL_MAX_DAYS_AHEAD, Math.max(1, live.daysToTarget)) : TRACKING_ALL_DAYS_AHEAD;
  const endDay = todayDay + daysAhead;
  let projection: ChartSeries['projection'] = [];
  let band: ChartSeries['band'] = [];
  let arrival: ChartSeries['arrival'] = null;
  if (live) {
    // UX pass 3, point 1b: day 0 of the simulation is today. Since model 1.4.0 the simulation starts from the modeled weight
    // of the day, a few hundred grams off the smoothed trend: the curve and its band are moved by the gap to the last trend
    // point (display choice in service, kept as is), so the dashed join from the last trend point to today has no step.
    const last = trend[trend.length - 1];
    const shift = last && live.trajectory[0] ? last.kg - live.trajectory[0].weightKg : 0;
    const within = (day: number) => day <= endDay;
    projection = live.trajectory.map((pt) => ({ day: todayDay + pt.day, kg: pt.weightKg + shift })).filter((p) => within(p.day));
    band = live.trajectory
      .map((pt, i) => ({ day: todayDay + pt.day, lo: (live.lower80[i]?.weightKg ?? pt.weightKg) + shift, hi: (live.upper80[i]?.weightKg ?? pt.weightKg) + shift }))
      .filter((p) => within(p.day));
    if (live.daysToTarget !== null && todayDay + live.daysToTarget <= endDay) {
      const at = live.trajectory.find((pt) => pt.day === live.daysToTarget) ?? live.trajectory[live.trajectory.length - 1];
      arrival = { day: todayDay + live.daysToTarget, date: addDays(today, live.daysToTarget), kg: (at?.weightKg ?? Number.NaN) + shift };
    }
  }
  // UX pass 3, point 1d: the pauses of the gate (trackingPauses, report 49), as they are, clipped to the window.
  const pauses = trackingPauses(validWeights(store.weights))
    .pauses.filter((p) => p.to >= startDate)
    .map((p) => ({ fromDay: daysBetween(startDate, p.from), toDay: daysBetween(startDate, p.to), from: p.from, to: p.to }));
  return {
    raw,
    trend,
    projection,
    band,
    todayDay,
    startDate,
    endDay,
    endDate: addDays(today, daysAhead),
    pauses,
    arrival,
    projectionPending: learning && !weighInNeeded,
    weighInNeeded,
  };
}

export type RecentWeight = {
  id: string;
  date: string;
  kg: number;
  deltaKg: number | null;
  /** Local time of the entry, only when the day carries several weigh-ins (A3). */
  time: string | null;
};

export function recentWeights(store: WheightyStore, limit: number): RecentWeight[] {
  const sorted = [...store.weights].sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
  const perDate = new Map<string, number>();
  for (const w of store.weights) perDate.set(w.date, (perDate.get(w.date) ?? 0) + 1);
  return sorted.slice(0, limit).map((w, i) => {
    const prev = sorted[i + 1];
    const several = (perDate.get(w.date) ?? 0) > 1;
    const at = new Date(w.createdAt);
    return { id: w.id, date: w.date, kg: w.weightKg, deltaKg: prev ? w.weightKg - prev.weightKg : null, time: several && !Number.isNaN(at.getTime()) ? localTimeOf(at) : null };
  });
}

/** Recalibrations from weigh-ins applied to the plan (the onboarding warm start is not counted). */
export function appliedWeightCalibrations(store: WheightyStore): number {
  return store.calibrationSnapshots.filter((s) => s.appliedAt && s.source !== 'warm_start').length;
}

export type WarmStartView = {
  /** Historical evidence was given at onboarding. */
  given: boolean;
  used: boolean;
  reason: 'used' | 'invalid' | 'insufficient_duration' | 'missing_start_weight' | null;
  conflict: boolean;
};

export function warmStartView(result: { status: WarmStartView['reason'] & string; conflict: boolean } | null): WarmStartView {
  if (!result) return { given: false, used: false, reason: null, conflict: false };
  return { given: true, used: result.status === 'used', reason: result.status, conflict: result.status === 'used' && result.conflict };
}

export type AnalysisView = {
  /** The calibrated layout: the gate of the day is met, or a recalibration was applied (report 49, point 2, D2). */
  calibrated: boolean;
  /**
   * Report 49, point 2: a recalibration was applied and the gate of the day is closed: the block "Vers la prochaine mise à
   * jour" with the criteria of the counted period; null otherwise.
   */
  nextUpdate: GateProgress | null;
  maintenanceKcal: number;
  initialMaintenanceKcal: number | null;
  /**
   * Report 50, point 6e: each maintenance with the weight it holds at, never their difference (it mixes the weight lost and
   * what the weigh-ins corrected): the estimate of the start at the weight of the start, the one shown at its weight (the
   * current trend weight when the calibration of the day is shown, else the weight of the plan in force). Null without the
   * estimate of the start.
   */
  startAndToday: { start: MaintenanceAt; today: MaintenanceAt } | null;
  interval80: readonly [number, number];
  interval95: readonly [number, number];
  confidence: CalibrationState['confidence'];
  surfaced: boolean;
  weighInCount: number;
  appliedCalibrations: number;
  posteriorSdKcal: number | null;
  observationSpanDays: number;
};

/** Report 50, point 6e: the line of Analyse, each maintenance at its weight, in the unit of the user. */
export function maintenanceComparisonText(view: AnalysisView, units: UnitPreference): string | null {
  return view.startAndToday ? maintenancePair(view.startAndToday.start, view.startAndToday.today, (kg) => `${formatWeight(kg, units)} ${weightUnitLabel(units)}`) : null;
}

export function analysisView(store: WheightyStore, state: CalibrationState | null): AnalysisView | null {
  const plan = store.plan;
  if (!plan) return null;
  if (measuredHabit(store) !== null) {
    // Measured habit (pass 5b): the balance of the journal of the plan in force; no recalibration of the current method.
    return {
      calibrated: true,
      nextUpdate: null,
      maintenanceKcal: plan.maintenanceKcal,
      initialMaintenanceKcal: null,
      startAndToday: null,
      interval80: plan.maintenanceInterval80,
      interval95: plan.maintenanceInterval95,
      confidence: state?.confidence ?? latestAppliedSnapshot(store)?.confidence ?? 'low',
      surfaced: false,
      weighInCount: store.weights.length,
      appliedCalibrations: appliedWeightCalibrations(store),
      posteriorSdKcal: null,
      observationSpanDays: 0,
    };
  }
  const gateMet = Boolean(state?.gate.met && state.candidate);
  // Report 49, point 2 (D2): after a recalibration, the calibrated layout even with the gate closed (the estimate applied and
  // its confidence: the state then carries the plan's maintenance and the confidence of the last applied snapshot).
  const applied = hasAppliedRecalibration(store);
  const calibrated = gateMet || applied;
  const maintenanceKcal = state?.currentMaintenanceKcal ?? plan.maintenanceKcal;
  const initial = store.meta.initialMaintenanceKcal;
  return {
    calibrated,
    nextUpdate: applied && !gateMet ? gateProgress(state, store) : null,
    maintenanceKcal,
    initialMaintenanceKcal: initial,
    startAndToday:
      initial === null
        ? null
        : {
            start: { kcal: initial, kg: store.meta.initialWeightKg },
            today: { kcal: maintenanceKcal, kg: gateMet ? currentWeightKg(store) : (plan.planWeightKg ?? null) },
          },
    interval80: state?.currentInterval80 ?? plan.maintenanceInterval80,
    interval95: state?.currentInterval95 ?? plan.maintenanceInterval95,
    confidence: state?.confidence ?? latestAppliedSnapshot(store)?.confidence ?? 'low',
    // A personal target is taken over by the app at its first recalibration, without a screen (report 47, point 1d).
    surfaced: (state?.surfaced ?? false) && plan.source !== 'personal_target',
    weighInCount: state?.gate.weighInCount ?? store.weights.length,
    appliedCalibrations: appliedWeightCalibrations(store),
    posteriorSdKcal: state?.fit?.posterior.sdKcal ?? null,
    observationSpanDays: state?.gate.spanDays ?? 0,
  };
}

/** Day-0 energy balance of the current plan on the dynamic model (intake minus expenditure), from the plan's own solve start. */
export function planEnergyBalanceKcal(store: WheightyStore, today: string): number | null {
  const plan = store.plan;
  // Measured habit (pass 5b): the intake the plan expects (displayed target x h) against the journal model of the day.
  const m = measuredHabit(store) !== null ? measuredProjectionContext(store, today) : null;
  const ctx = m?.context ?? contextForCurrentPlan(store, today);
  if (!plan || !ctx) return null;
  const balance = initialEnergyBalanceKcal(ctx, plan.goal, { calorieTargetKcal: m?.calorieTargetKcal ?? plan.calorieTarget, stepsPerDay: plan.stepTarget });
  return Number.isFinite(balance) ? balance : null;
}

/** h of the plan in force in the measured habit (pass 5b), null otherwise. */
export function measuredHabit(store: WheightyStore): number | null {
  const path = store.meta.journalPath;
  return path.method === 'measured' ? (path.habit?.h ?? null) : null;
}

/**
 * A recalibration may be announced on Aujourd'hui (its status line and mascot): shown, computed for the current store, not
 * on a personal target, which the app takes over by itself at its first recalibration (report 47, point 1d).
 */
export function recalibrationReady(store: WheightyStore, state: CalibrationState | null, pending: boolean): boolean {
  return state?.surfaced === true && !pending && store.plan?.source !== 'personal_target';
}

/**
 * Report 50, point 6d: one message at a time. While a recalibration is shown (it asks for an action), the decision cards of
 * the journal path (the proposal to align the target, a plan of the measured habit to confirm) wait: they stay in the store,
 * unanswered, and come back once the recalibration is applied or no longer shown. The last known state is read, so that a
 * card does not flash while the calibration of a new store is computed.
 */
export function journalCardsWait(store: WheightyStore, state: CalibrationState | null): boolean {
  // The measured habit never shows a recalibration of the current method (`surfaced` stays false there).
  return state?.surfaced === true && store.plan?.source !== 'personal_target';
}

/**
 * Status line of Aujourd'hui under the tiles (the recalibration line). `recalibrationReady`: a recalibration may be announced
 * (shown, not pending, not on a personal target).
 */
export function todayStatusTitle(store: WheightyStore, today: string, state: CalibrationState | null, recalibrationReady: boolean): string {
  const gate = gateProgress(state, store);
  // Report 49, point 2 (D2): after a recalibration, the next update, never the first one again.
  const update = hasAppliedRecalibration(store) ? 'la prochaine mise à jour' : 'la première mise à jour';
  // Measured habit (pass 5b): the plan follows the journal; the gate of the current method does not apply.
  if (journalRead(store)) return JOURNAL_MESSAGE.statusMeasured;
  if (recalibrationReady) return 'Une recalibration est prête.';
  // Pass 5b fixes, point 7: on the aligned target, the days before the next recalibration rather than the deviation days.
  const alignedLine = alignedStatusLine(store, today);
  if (alignedLine !== null) return alignedLine;
  if (!gate.met && gate.remainingWeighIns > 0) return `Encore ${gate.remainingWeighIns} pesée${gate.remainingWeighIns > 1 ? 's' : ''} avant ${update}.`;
  if (!gate.met && gate.remainingDays > 0) return `Encore ${gate.remainingDays} jour${gate.remainingDays > 1 ? 's' : ''} de suivi avant ${update}.`;
  if (!gate.met && gate.criteria.some((c) => c.key === 'cleanWeighIns' && !c.met)) return 'Encore quelques pesées en dehors des journées d’écart important.';
  if (!gate.met) return `Note tes journées pour débloquer ${update}.`;
  // Report 50, point 6c: an update held back for want of a recent weigh-in (D3) is not "following the weigh-ins": the line
  // says what the message of D3 says.
  if (weighInStale(store, today)) return `${SHORT_MESSAGE.weighInNeeded.title}.`;
  return 'Ton estimation suit tes pesées.';
}

export { goalStatus };
