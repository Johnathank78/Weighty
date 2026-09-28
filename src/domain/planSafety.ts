/**
 * Safety checks of the plan in force (pass 5a): what runs at each day change and after each weigh-in, the underweight
 * alert, the warning ahead of the BMI-20 guardrail, and the floor advice. Pure functions over the store; the screens only
 * display their results.
 */
import {
  BMI20_WARNING_HORIZON_DAYS,
  DAYS_PER_WEEK,
  LOSS_UNAVAILABLE_BMI_BELOW,
  UNDERWEIGHT_ALERT_BMI_BELOW,
  UNDERWEIGHT_ALERT_DECLINE_WEEKS,
  UNDERWEIGHT_ALERT_MIN_INTERVAL_DAYS,
} from '@/science/constants';
import { addDays, daysBetween } from '@/science/dates';
import { fastestRateReachableWithSteps, guardrailMaxWeeklyRate, stepsToHoldRateAtFloor } from '@/science/goals';
import type { GoalPlan, PlanContext } from '@/science/goals';
import { bmi, weightAtBmi } from '@/science/macros';
import type { CalibrationState, PlanBuildResult } from './engine';
import { enforcePlanGuardrails, ensureDailyLogs, periodicReplan, recordPlanEvent, trendOf } from './engine';
import { PLAN_MESSAGE } from './planMessages';
import type { PlanEvent, WheightyStore } from './types';
import { projectionFromToday } from './views';

// ---------------------------------------------------------------------------
// Underweight alert (pass 5a s7)
// ---------------------------------------------------------------------------

/** Trend weight in force on a day: the latest trend point on or before it, null before the first weigh-in. */
function trendOn(points: ReadonlyArray<{ date: string; trendKg: number }>, date: string): number | null {
  let out: number | null = null;
  for (const p of points) {
    if (p.date > date) break;
    out = p.trendKg;
  }
  return out;
}

/**
 * True when the trend went down UNDERWEIGHT_ALERT_DECLINE_WEEKS (4) weeks running up to today: for each week, the trend of
 * its last day is lower than the trend 7 days earlier. All the weeks lie inside the maintenance imposed since `since`.
 */
export function trendDeclinedWeeks(store: WheightyStore, today: string, since: string, weeks = UNDERWEIGHT_ALERT_DECLINE_WEEKS): boolean {
  const start = addDays(today, -DAYS_PER_WEEK * weeks);
  if (start < since) return false;
  const points = trendOf(store).points;
  for (let k = 0; k < weeks; k++) {
    const end = trendOn(points, addDays(today, -DAYS_PER_WEEK * k));
    const begin = trendOn(points, addDays(today, -DAYS_PER_WEEK * (k + 1)));
    if (end === null || begin === null || !(end < begin)) return false;
  }
  return true;
}

/**
 * Underweight alert, for every user (pass 5a s7): the trend BMI under UNDERWEIGHT_ALERT_BMI_BELOW (18.5), or, during a
 * maintenance imposed by the BMI-20 guardrail, a trend down 4 weeks running. At most once every
 * UNDERWEIGHT_ALERT_MIN_INTERVAL_DAYS (7) days. Written into the trace with its message (non-judgemental, points to a health
 * professional).
 */
export function checkUnderweight(store: WheightyStore, today: string, nowIso: string): WheightyStore {
  const profile = store.profile;
  const latest = trendOf(store).summary.latest;
  if (!profile || !latest) return store;
  const last = [...store.meta.planEvents].reverse().find((e) => e.rule === 'underweight_bmi' || e.rule === 'underweight_decline');
  if (last && daysBetween(last.date, today) < UNDERWEIGHT_ALERT_MIN_INTERVAL_DAYS) return store;
  let rule: PlanEvent['rule'] | null = null;
  if (bmi(latest.trendKg, profile.heightCm) < UNDERWEIGHT_ALERT_BMI_BELOW) rule = 'underweight_bmi';
  else {
    const since = store.meta.guardrailMaintenanceSince;
    if (since !== null && store.plan?.goal === 'maintenance' && trendDeclinedWeeks(store, today, since)) rule = 'underweight_decline';
  }
  if (rule === null) return store;
  return recordPlanEvent(store, { date: today, rule, status: 'applied', before: null, after: null, message: PLAN_MESSAGE.underweight }, nowIso);
}

// ---------------------------------------------------------------------------
// Day change and weigh-in (pass 5a s1, s2, s7)
// ---------------------------------------------------------------------------

export type DailyCheckOptions = {
  /**
   * Check the guardrails of the plan in force (default true: every day change). The equivalence with the simulator of
   * reports 38 and 39, which checks them once a week, turns it off on the other days.
   */
  guardrails?: boolean;
};

/**
 * What runs when the day changes (opening of the app, return to the foreground; StoreProvider): the logs up to today, the
 * guardrails (G1, G2), the periodic replan when due, the underweight alert. Evaluated once on the day's state: after days
 * without opening nothing is replayed. Returns the same store when nothing changes.
 */
export function runDailyChecks(store: WheightyStore, today: string, nowIso: string, options: DailyCheckOptions = {}): WheightyStore {
  if (!store.plan || !store.profile) return store;
  let s = ensureDailyLogs(store, today);
  if (options.guardrails !== false) s = enforcePlanGuardrails(s, today, { nowIso }).store;
  const periodic = periodicReplan(s, today, { nowIso });
  if (periodic.status !== 'not_due') s = periodic.store;
  return checkUnderweight(s, today, nowIso);
}

/** What runs after each weigh-in: the guardrails and the underweight alert, on the new trend weight. */
export function runWeighInChecks(store: WheightyStore, today: string, nowIso: string): WheightyStore {
  if (!store.plan || !store.profile) return store;
  return checkUnderweight(enforcePlanGuardrails(store, today, { nowIso }).store, today, nowIso);
}

// ---------------------------------------------------------------------------
// Warning ahead of the BMI-20 guardrail (pass 5a s4)
// ---------------------------------------------------------------------------

/**
 * Weeks before the BMI could pass under 20 on a loss plan, from the fast bound of the projection from today (production
 * solver, daily step over BMI20_WARNING_HORIZON_DAYS, stop at the BMI-20 weight); null when it does not within 4 weeks.
 */
export function bmi20Warning(store: WheightyStore, today: string, state: CalibrationState | null): { weeks: number; message: string } | null {
  const plan = store.plan;
  const profile = store.profile;
  const latest = trendOf(store).summary.latest;
  if (!plan || !profile || !latest || plan.goal !== 'loss') return null;
  if (bmi(latest.trendKg, profile.heightCm) < LOSS_UNAVAILABLE_BMI_BELOW) return null;
  const threshold = weightAtBmi(LOSS_UNAVAILABLE_BMI_BELOW, profile.heightCm);
  const projection = projectionFromToday(store, today, state, { horizonDays: BMI20_WARNING_HORIZON_DAYS, sampleEveryDays: 1, stopBelowKg: threshold });
  // Loss: the fast bound is the lower bound of the 80 percent band.
  const crossing = projection?.lower80.find((p) => p.day > 0 && p.weightKg < threshold) ?? null;
  if (!crossing) return null;
  const weeks = Math.max(1, Math.ceil(crossing.day / DAYS_PER_WEEK));
  return { weeks, message: PLAN_MESSAGE.bmi20Warning(weeks) };
}

// ---------------------------------------------------------------------------
// Floor advice (pass 5a s6)
// ---------------------------------------------------------------------------

export type FloorAdvice = {
  floorKcal: number;
  /** Requested rate, within the BMI cap: the rate the advice is about. */
  rate: number;
  proposal: { kind: 'steps'; steps: number } | { kind: 'unreachable'; maxRate: number | null };
  /** Sentences to show: the floor, then the steps (or the unreachable case). */
  lines: string[];
};

/**
 * When the hard floor limits the speed (a slower rate applied, or no feasible speed), with or without the BMI cap limiting
 * too: the floor, and the daily steps that would hold the requested rate at the floor (`effectiveMinSliderSteps`). When no
 * step count of the slider range suffices, the unreachable case and the fastest rate reachable by walking more.
 */
export function floorAdvice(context: PlanContext, goalPlan: GoalPlan, baselineSteps: number): FloorAdvice | null {
  if (goalPlan.goal === 'maintenance') return null;
  const floorLimited = goalPlan.rejections.some((r) => r.reason === 'below_hard_floor');
  if (!floorLimited || !(goalPlan.status === 'no_feasible_speed' || (goalPlan.status === 'ok' && goalPlan.rateAdjusted))) return null;
  const cap = goalPlan.guardrailMaxRate ?? guardrailMaxWeeklyRate(goalPlan.goal, bmi(context.currentWeightKg, context.heightCm));
  const rate = cap === null ? goalPlan.requestedWeeklyRate : Math.min(goalPlan.requestedWeeklyRate, cap);
  const steps = stepsToHoldRateAtFloor(context, goalPlan.goal, rate, baselineSteps);
  const proposal: FloorAdvice['proposal'] = steps !== null ? { kind: 'steps', steps } : { kind: 'unreachable', maxRate: fastestRateReachableWithSteps(context, goalPlan.goal, rate, baselineSteps) };
  const lines = [PLAN_MESSAGE.floorLimit(goalPlan.hardFloorKcal), proposal.kind === 'steps' ? PLAN_MESSAGE.floorSteps(rate, proposal.steps) : PLAN_MESSAGE.floorUnreachable(proposal.maxRate)];
  return { floorKcal: goalPlan.hardFloorKcal, rate, proposal, lines };
}

/** Floor advice of a plan build (preview, recalibration, goal change), null when the floor does not limit it. */
export function floorAdviceOf(result: PlanBuildResult | { ok: false; reason: string }, baselineSteps: number): FloorAdvice | null {
  if (!('goalPlan' in result) || !result.goalPlan || !result.context) return null;
  return floorAdvice(result.context, result.goalPlan, baselineSteps);
}
