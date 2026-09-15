/**
 * Screen view models derived from the store and engine results.
 * Only selection, aggregation and display rounding: no scientific formulas.
 */
import { GATE_MIN_ADHERENCE_COVERAGE, GATE_MIN_CLEAN_WEIGHINS, GATE_MIN_SPAN_DAYS, GATE_MIN_WEIGHINS, KCAL_PER_G_CARB, KCAL_PER_G_FAT, KCAL_PER_G_PROTEIN, WEIGH_IN_REMINDER_INTERVAL_DAYS } from '@/science/constants';
import { addDays, daysBetween } from '@/science/dates';
import { lossAvailability, maintenanceZone } from '@/science/goals';
import { bmi } from '@/science/macros';
import type { DailyLog, Goal, MacroGrams, SpeedZone, TrajectoryPoint } from '@/science/types';
import { assessBaseline, planContextFrom } from '@/science/assessment';
import { simulateHall } from '@/science/hall/model';
import { evaluateGate } from '@/science/calibration';
import type { GateStatus } from '@/science/calibration';
import { formatInteger } from './format';
import { hallInputFor, hallParametersFor, snapWeeklyRate, speedZoneFor } from '@/science/goals';
import type { CalibrationState } from './engine';
import { goalStatus, latestAppliedSnapshot, latestRawWeight, trendOf, weighInDue } from './engine';
import type { CurrentPlan, WheightyStore } from './types';

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
};

/** First-recalibration progress, one entry per real gate criterion (weigh-ins, span, clean weigh-ins, adherence information). */
export function gateProgress(state: CalibrationState | null, store: WheightyStore): GateProgress {
  return gateProgressFromGate(state?.gate ?? evaluateGate(store.weights, store.dailyLogs));
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
  };
}

/** Display of one gate criterion: counts for weigh-ins and days, share of noted days for adherence. */
export function gateCriterionValue(c: GateCriterion): string {
  if (c.key === 'adherence') return `${Math.round(c.have * 100)} % / ${Math.round(c.need * 100)} %`;
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

/** Goal availability hints for the onboarding goal step (guardrails come from the engine). */
export function goalGuardrails(heightCm: number, weightKg: number): { lossAvailable: boolean; maxLossRate: number | null } {
  const a = lossAvailability(bmi(weightKg, heightCm));
  return a.available ? { lossAvailable: true, maxLossRate: a.maxRate } : { lossAvailable: false, maxLossRate: null };
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

export type ChartSeries = {
  raw: Array<{ day: number; kg: number; date: string }>;
  trend: Array<{ day: number; kg: number }>;
  projection: Array<{ day: number; kg: number }>;
  band: Array<{ day: number; lo: number; hi: number }>;
  todayDay: number;
  startDate: string;
};

/** Weight chart data for Suivi: raw points, trend, and the plan projection after today. */
export function trackingChart(store: WheightyStore, today: string, rangeDays: number | null): ChartSeries | null {
  const { points } = trendOf(store);
  const plan = store.plan;
  if (points.length === 0) return null;
  const first = points[0]?.date ?? today;
  const startDate = rangeDays === null ? first : addDays(today, -rangeDays) > first ? addDays(today, -rangeDays) : first;
  const visible = points.filter((p) => p.date >= startDate);
  const raw = visible.map((p) => ({ day: daysBetween(startDate, p.date), kg: p.rawKg, date: p.date }));
  const trend = visible.map((p) => ({ day: daysBetween(startDate, p.date), kg: p.trendKg }));
  const todayDay = daysBetween(startDate, today);
  // Based on the span actually shown, not the nominal range: ranges that clip to the same first weigh-in draw the same curve.
  const horizonAhead = Math.max(21, Math.round(Math.max(28, todayDay) / 3));
  let projection: ChartSeries['projection'] = [];
  let band: ChartSeries['band'] = [];
  if (plan) {
    const planStart = plan.createdAt.slice(0, 10);
    const offset = daysBetween(startDate, planStart);
    const lastTrend = trend[trend.length - 1];
    const shift = (pt: TrajectoryPoint) => ({ day: pt.day + offset, kg: pt.weightKg });
    projection = plan.projection.trajectory.map(shift).filter((p) => p.day >= (lastTrend?.day ?? todayDay) && p.day <= todayDay + horizonAhead);
    band = plan.projection.trajectory
      .map((pt, i) => ({ day: pt.day + offset, lo: plan.projection.lower80[i]?.weightKg ?? pt.weightKg, hi: plan.projection.upper80[i]?.weightKg ?? pt.weightKg }))
      .filter((p) => p.day >= (lastTrend?.day ?? todayDay) && p.day <= todayDay + horizonAhead);
  }
  return { raw, trend, projection, band, todayDay, startDate };
}

export type RecentWeight = { id: string; date: string; kg: number; deltaKg: number | null };

export function recentWeights(store: WheightyStore, limit: number): RecentWeight[] {
  const sorted = [...store.weights].sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
  return sorted.slice(0, limit).map((w, i) => {
    const prev = sorted[i + 1];
    return { id: w.id, date: w.date, kg: w.weightKg, deltaKg: prev ? w.weightKg - prev.weightKg : null };
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
  calibrated: boolean;
  maintenanceKcal: number;
  initialMaintenanceKcal: number | null;
  changeSinceInitialKcal: number | null;
  interval80: readonly [number, number];
  interval95: readonly [number, number];
  confidence: CalibrationState['confidence'];
  surfaced: boolean;
  weighInCount: number;
  appliedCalibrations: number;
  posteriorSdKcal: number | null;
  observationSpanDays: number;
};

export function analysisView(store: WheightyStore, state: CalibrationState | null): AnalysisView | null {
  const plan = store.plan;
  if (!plan) return null;
  const calibrated = Boolean(state?.gate.met && state.candidate);
  const maintenanceKcal = state?.currentMaintenanceKcal ?? plan.maintenanceKcal;
  const initial = store.meta.initialMaintenanceKcal;
  return {
    calibrated,
    maintenanceKcal,
    initialMaintenanceKcal: initial,
    changeSinceInitialKcal: initial === null ? null : maintenanceKcal - initial,
    interval80: state?.currentInterval80 ?? plan.maintenanceInterval80,
    interval95: state?.currentInterval95 ?? plan.maintenanceInterval95,
    confidence: state?.confidence ?? latestAppliedSnapshot(store)?.confidence ?? 'low',
    surfaced: state?.surfaced ?? false,
    weighInCount: state?.gate.weighInCount ?? store.weights.length,
    appliedCalibrations: appliedWeightCalibrations(store),
    posteriorSdKcal: state?.fit?.posterior.sdKcal ?? null,
    observationSpanDays: state?.gate.spanDays ?? 0,
  };
}

/** Day-0 energy balance of the current plan on the dynamic model (intake minus expenditure). */
export function planEnergyBalanceKcal(store: WheightyStore, today: string): number | null {
  const plan = store.plan;
  const profile = store.profile;
  if (!plan || !profile) return null;
  const weight = plan.planWeightKg ?? profile.currentWeightKg;
  const assessment = assessBaseline(profile, today, { weightKg: weight, palCategory: plan.palCategory });
  const ctx = planContextFrom(profile, assessment, plan.maintenanceKcal);
  const p = hallParametersFor(ctx, plan.goal);
  const u = hallInputFor(ctx, plan.goal, { calorieTargetKcal: plan.calorieTarget, stepsPerDay: plan.stepTarget });
  const sim = simulateHall(p, 0, () => u);
  const ee = sim.days[0]?.energyExpenditureKcal;
  return ee === undefined ? null : plan.calorieTarget - ee;
}

export { goalStatus };
