/**
 * Journal path (pass 5b, model 1.5.0): what a user lives through when the target does not match what they eat.
 *
 * Three methods (`JournalMethod`, stored in `AppMeta.journalPath`):
 * - 'assumed' ("cible supposée tenue"): the current method, every user until a switch;
 * - 'aligned' ("cible alignée sur le journal"): the target becomes what the journal says the user eats (median of the
 *   logged days of the last 14, rounded to 50 kcal, floored at the hard floor x 1.10), then the current method with the
 *   floor x 1.10 on every target (`pathSolverRequest`, engine);
 * - 'measured' ("journal lu, habitude mesurée", code JS of the prototype): the plan reads the journal and the weigh-ins,
 *   estimates the maintenance in logged kcal and the habit h; displayed target = intake to aim at / h.
 *
 * The science is the validated prototype of reports 40 and 41 (branch archive/bench-journal-battery,
 * tests/helpers/closedLoop.ts), ported function by function: `revisionProposalTriggered`, `withChosenTarget`,
 * `journalSolverOptions`, `journalGoalPlan`, `journalPlanOf`, `habitOf`, `jstarPlanOf`, `enforceJStarPlanGuardrails`,
 * `jstarSurfaced`, and the steps of `evaluateJStar` and `jstarPeriodicStep`. On top, the product rules of 28/09
 * (confirmation of the plans, refusals, tolerances of missed weigh-ins and days, missed meals, messages).
 *
 * The journal reaches this module through `intakeObservationsFrom` only (D8), directly or through `journalCalibration`.
 */
import { assessBaseline, planContextFrom } from '@/science/assessment';
import { buildSnapshot, evaluateGate, fitCalibration, reconstructDays, shouldSurfaceRecalibration, validWeights } from '@/science/calibration';
import type { CalibrationInput, GateStatus, IntakeObservation, SurfacingReference } from '@/science/calibration';
import {
  HABIT_MAX,
  HABIT_MIN,
  HABIT_WINDOW_DAYS,
  JOURNAL_ALIGN_MIN_LOGGED_DAYS,
  JOURNAL_ALIGN_ROUNDING_KCAL,
  JOURNAL_ALIGN_WINDOW_DAYS,
  JOURNAL_EVALUATION_EVERY_DAYS,
  JOURNAL_FLOOR_FACTOR,
  JOURNAL_MESSAGE_MIN_INTERVAL_DAYS,
  LOSS_UNAVAILABLE_BMI_BELOW,
  MEASURED_FIRST_PLAN_RETRY_DAYS,
  MEASURED_GRID_HALF_RANGE_KCAL,
  MEASURED_MIN_DAYS_SINCE_SWITCH,
  MEASURED_MIN_JOURNAL_SPAN_DAYS,
  MEASURED_NON_USABLE_DAY_WEIGHT,
  MEASURED_TOLERANCE_WINDOW_DAYS,
  MEASURED_TOLERATED_MISSED_WEIGHINS,
  MEASURED_TOLERATED_UNLOGGED_DAYS,
  MISSED_MEAL_FRACTION,
  PERIODIC_REPLAN_EVERY_DAYS,
  PERIODIC_REPLAN_NOTICE_MIN_KCAL,
  SUGGESTED_ADHERENCE_MINOR_UP_TO,
  SUGGESTED_ADHERENCE_ON_PLAN_BELOW,
} from '@/science/constants';
import { addDays, daysBetween } from '@/science/dates';
import { buildGoalPlan, guardrailMaxWeeklyRate, hardFloorKcal, macrosFor } from '@/science/goals';
import type { GoalPlan, PlanContext, SolverOptions } from '@/science/goals';
import { bmi as bmiOfWeight } from '@/science/macros';
import { modeledBodyAt } from '@/science/modeledBody';
import type { BaselineAssessment } from '@/science/assessment';
import type { DailyLog, Goal, Interval, UserProfile } from '@/science/types';
import { intervalWidth } from '@/science/uncertainty';
import {
  changeGoal,
  currentWeightKg,
  ensureDailyLogs,
  planDateOf,
  planSummary,
  PRODUCTION_SOLVER,
  rebuildContextFromStore,
  recordPlanEvent,
  switchToMaintenance,
  syncTodayLog,
  updateProfile,
} from './engine';
import type { SolverRequest } from './engine';
import { intakeObservationsFrom } from './intakeObservations';
import type { UsabilityRule } from './intakeObservations';
import { evaluateJournalGate, journalCalibrationInputFromStore } from './journalCalibration';
import type { JournalCalibrationInput, JournalRegimeOptions } from './journalCalibration';
import { JOURNAL_MESSAGE, PLAN_MESSAGE } from './planMessages';
import type { AlignedTarget, CurrentPlan, HabitSummary, JournalEstimate, JournalGateSummary, JournalPathState, MeasuredOffer, WheightyStore } from './types';


// ---------------------------------------------------------------------------
// Journal days: usability of a day (decision 8, missed meal)
// ---------------------------------------------------------------------------

/**
 * Usability of a journal day (decision 8 of 28/09): a day with at least one entry, unless its total is under
 * MISSED_MEAL_FRACTION (half) of the median of the previous logged days (rule R1 of prompt 34: the days of the 14 previous
 * calendar days that have an entry). Used everywhere the journal serves: aligned target, h, maintenance, gates.
 * The validated prototype used R0; the users it simulates log every day in full, so R1 never flags a day there.
 */
export const JOURNAL_USABILITY_RULE: UsabilityRule = { kind: 'R1', x: MISSED_MEAL_FRACTION };

/** Journal days of [from, to] as the science sees them (logged total, usability). */
export function journalObservations(store: WheightyStore, from: string, to: string): IntakeObservation[] {
  if (from > to) return [];
  return intakeObservationsFrom(store, from, to, JOURNAL_USABILITY_RULE);
}

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = (s.length - 1) / 2;
  return ((s[Math.floor(mid)] as number) + (s[Math.ceil(mid)] as number)) / 2;
}

const pathOf = (store: WheightyStore): JournalPathState => store.meta.journalPath;
const withPath = (store: WheightyStore, patch: Partial<JournalPathState>): WheightyStore => ({ ...store, meta: { ...store.meta, journalPath: { ...store.meta.journalPath, ...patch } } });

/** Day of the last trace entry of a rule, null when none. */
function lastEventDate(store: WheightyStore, rule: string): string | null {
  for (let i = store.meta.planEvents.length - 1; i >= 0; i--) {
    const e = store.meta.planEvents[i];
    if (e && e.rule === rule) return e.date;
  }
  return null;
}

const withinDays = (date: string | null, today: string, days: number) => date !== null && daysBetween(date, today) < days;

// ---------------------------------------------------------------------------
// Proposal (decision 3) and aligned target (decision 5)
// ---------------------------------------------------------------------------

/**
 * Prototype, report 40 s4.3: the revision proposal is triggered when the current gate has enough weigh-ins (>= 5) and span
 * (>= 14 days) but fails because the weigh-ins are not clean (major-deviation days dominate, D-11).
 */
export function revisionProposalTriggered(gate: GateStatus): boolean {
  return !gate.met && gate.criteria.enoughWeighIns && gate.criteria.enoughSpan && !gate.criteria.enoughCleanWeighIns;
}

export type AlignedPreview =
  | { ok: true; loggedDays: number; target: AlignedTarget }
  | { ok: false; loggedDays: number; missingDays: number };

/**
 * Aligned target of today (decision 5): median of the totals of the logged (usable) days among the last
 * JOURNAL_ALIGN_WINDOW_DAYS (14, today excluded, as the prototype: days d - 1 to d - 14), rounded to 50 kcal, raised to the
 * hard floor x JOURNAL_FLOOR_FACTOR when under it (`withChosenTarget`). Needs JOURNAL_ALIGN_MIN_LOGGED_DAYS (10) of them.
 */
export function alignedTargetPreview(store: WheightyStore, today: string): AlignedPreview {
  const days = journalObservations(store, addDays(today, -JOURNAL_ALIGN_WINDOW_DAYS), addDays(today, -1));
  const totals = days.filter((o) => o.usable).map((o) => o.loggedKcal);
  if (totals.length < JOURNAL_ALIGN_MIN_LOGGED_DAYS) return { ok: false, loggedDays: totals.length, missingDays: JOURNAL_ALIGN_MIN_LOGGED_DAYS - totals.length };
  const ctx = rebuildContextFromStore(store, today);
  if (!ctx) return { ok: false, loggedDays: totals.length, missingDays: 0 };
  const medianKcal = median(totals);
  const roundedKcal = Math.round(medianKcal / JOURNAL_ALIGN_ROUNDING_KCAL) * JOURNAL_ALIGN_ROUNDING_KCAL;
  const floorKcal = hardFloorKcal(ctx.reeKcal, ctx.sex) * JOURNAL_FLOOR_FACTOR;
  const raised = roundedKcal < floorKcal;
  return { ok: true, loggedDays: totals.length, target: { medianKcal, roundedKcal, finalKcal: raised ? floorKcal : roundedKcal, floorKcal, raised } };
}

/**
 * Prototype `withChosenTarget` (report 40 s4.5, prompt 41 s3.2, settings of iteration 2d: floor factor 1.10, plan floor
 * field set): the plan target becomes `targetKcal` from `date`, with the production macro solver and the floor check of a
 * computed target (under the hard floor x JOURNAL_FLOOR_FACTOR: replaced by it). Every other field of the plan is kept.
 */
export function withChosenTarget(store: WheightyStore, date: string, targetKcal: number): { store: WheightyStore; final: number; floor: number; replaced: boolean } {
  const plan = store.plan;
  const ctx = rebuildContextFromStore(store, date);
  if (!plan || !ctx) throw new Error('no plan');
  const floor = hardFloorKcal(ctx.reeKcal, ctx.sex) * JOURNAL_FLOOR_FACTOR;
  const replaced = targetKcal < floor;
  const final = replaced ? floor : targetKcal;
  const macros = macrosFor(ctx, plan.goal, final);
  const next: CurrentPlan = { ...plan, calorieTarget: final, macros: { ...macros.exact }, macrosDisplay: { ...macros.display }, proteinRule: macros.proteinRule };
  next.hardFloorKcal = floor;
  return { store: syncTodayLog({ ...store, plan: next }, date), final, floor, replaced };
}

/**
 * Switch to the aligned target (accepted proposal, or the button of the Plan tab): the plan target becomes the aligned
 * target; the method becomes 'aligned', the plan in force is the aligned target itself (no periodic replan, G1 only) until
 * a plan of the current method replaces it (the first recalibration can surface 7 days later). Trace entry, with the
 * message of the floor when it raised the target.
 */
export function switchToAlignedTarget(store: WheightyStore, today: string, nowIso: string): { ok: true; store: WheightyStore; target: AlignedTarget } | { ok: false; reason: 'no_plan' | 'not_enough_journal' | 'not_assumed' } {
  if (!store.plan || !store.profile) return { ok: false, reason: 'no_plan' };
  if (pathOf(store).method !== 'assumed') return { ok: false, reason: 'not_assumed' };
  const preview = alignedTargetPreview(store, today);
  if (!preview.ok) return { ok: false, reason: 'not_enough_journal' };
  const before = store.plan;
  const r = withChosenTarget(store, today, preview.target.roundedKcal);
  const t = preview.target;
  const switched = withPath(r.store, {
    method: 'aligned',
    switchedOn: today,
    alignedTarget: { ...t, finalKcal: r.final, floorKcal: r.floor, raised: r.replaced },
    chosenTargetActive: true,
    proposalOpenedOn: null,
    lastEvaluatedOn: null,
    offer: null,
    gate: null,
  });
  const message = r.replaced ? JOURNAL_MESSAGE.floorRaised(t.medianKcal, r.final) : null;
  const next = recordPlanEvent(switched, { date: today, rule: 'journal_switch', status: 'applied', before: planSummary(before), after: planSummary(switched.plan as CurrentPlan), message }, nowIso);
  return { ok: true, store: next, target: { ...t, finalKcal: r.final } };
}

/** The user refused the automatic proposal ("Garder ma cible"): stays on the assumed target; it may come back in a week. */
export function declineAlignProposal(store: WheightyStore, today: string, nowIso: string): WheightyStore {
  const next = withPath(store, { proposalOpenedOn: null, proposalDeclinedOn: today });
  return recordPlanEvent(next, { date: today, rule: 'journal_proposal_declined', status: 'applied', before: null, after: null, message: null }, nowIso);
}

/**
 * Day change, method 'assumed' (decision 3): when the recalibration gate fails because the major-deviation days dominate
 * (`revisionProposalTriggered`, the gate of the current method, `evaluateGate`), either the automatic proposal opens (10 of
 * the 14 last days logged; not within a week of a refusal), or, with too short a journal, the invitation to log for two
 * weeks (at most once a week). An open proposal stays until the user answers it.
 */
export function checkAlignProposal(store: WheightyStore, today: string, nowIso: string): WheightyStore {
  const path = pathOf(store);
  if (path.method !== 'assumed' || !store.plan || path.proposalOpenedOn !== null) return store;
  if (!revisionProposalTriggered(evaluateGate(store.weights, store.dailyLogs))) return store;
  const preview = alignedTargetPreview(store, today);
  if (preview.ok) {
    if (withinDays(path.proposalDeclinedOn, today, JOURNAL_MESSAGE_MIN_INTERVAL_DAYS)) return store;
    return withPath(store, { proposalOpenedOn: today });
  }
  if (withinDays(lastEventDate(store, 'journal_log_more'), today, JOURNAL_MESSAGE_MIN_INTERVAL_DAYS)) return store;
  return recordPlanEvent(store, { date: today, rule: 'journal_log_more', status: 'applied', before: null, after: null, message: JOURNAL_MESSAGE.logMore }, nowIso);
}

/** The open automatic proposal, with the aligned target of today; null when none is open or the journal no longer allows it. */
export function openAlignProposal(store: WheightyStore, today: string): { target: AlignedTarget; title: string; text: string; accept: string; decline: string } | null {
  const path = pathOf(store);
  if (path.method !== 'assumed' || path.proposalOpenedOn === null) return null;
  const preview = alignedTargetPreview(store, today);
  if (!preview.ok) return null;
  const kcal = preview.target.finalKcal;
  return { target: preview.target, title: JOURNAL_MESSAGE.proposalTitle, text: JOURNAL_MESSAGE.proposalText(kcal), accept: JOURNAL_MESSAGE.proposalAccept(kcal), decline: JOURNAL_MESSAGE.proposalDecline };
}

/** The button of the Plan tab (decision 3): shown on the assumed target, active from 10 logged days among the last 14. */
export function alignButton(store: WheightyStore, today: string): { label: string; enabled: boolean; hint: string | null } | null {
  if (pathOf(store).method !== 'assumed' || !store.plan) return null;
  const preview = alignedTargetPreview(store, today);
  return { label: JOURNAL_MESSAGE.alignButton, enabled: preview.ok, hint: preview.ok ? null : JOURNAL_MESSAGE.alignButtonDisabled(preview.missingDays) };
}

/** Days of [from, to] without a valid weigh-in. */
function missedWeighInDays(store: WheightyStore, from: string, to: string): number {
  if (from > to) return 0;
  const weighed = new Set(validWeights(store.weights).map((w) => w.date));
  let missed = 0;
  for (let d = 0; d <= daysBetween(from, to); d++) if (!weighed.has(addDays(from, d))) missed++;
  return missed;
}

/**
 * Day change, method 'aligned' (decision 5): when the user does not weigh in every day, the encouragement to do so, at most
 * once a week. Read on the days since the switch, at most the last 7, today excluded.
 */
export function checkWeighDaily(store: WheightyStore, today: string, nowIso: string): WheightyStore {
  const path = pathOf(store);
  if (path.method !== 'aligned' || path.switchedOn === null) return store;
  const from = maxDate(path.switchedOn, addDays(today, -JOURNAL_MESSAGE_MIN_INTERVAL_DAYS));
  if (missedWeighInDays(store, from, addDays(today, -1)) === 0) return store;
  if (withinDays(lastEventDate(store, 'journal_weigh_daily'), today, JOURNAL_MESSAGE_MIN_INTERVAL_DAYS)) return store;
  return recordPlanEvent(store, { date: today, rule: 'journal_weigh_daily', status: 'applied', before: null, after: null, message: JOURNAL_MESSAGE.weighDaily }, nowIso);
}

const maxDate = (a: string, b: string) => (a > b ? a : b);

// ---------------------------------------------------------------------------
// Measured habit: estimate options, window, gate (decisions 4, 6, 7)
// ---------------------------------------------------------------------------

/**
 * First day of continuous logging (the start of the window of the journal estimate): the day after the last run of more
 * than MEASURED_TOLERATED_UNLOGGED_DAYS (2) consecutive non-usable days, else the first usable day, from the onboarding
 * day, today excluded. Null when no day is usable. The prototype's users log from the onboarding day: it is their start.
 */
export function continuousLoggingStart(store: WheightyStore, today: string): string | null {
  const start = store.meta.onboardingDate;
  if (!start) return null;
  let out: string | null = null;
  let gap = 0;
  for (const o of journalObservations(store, start, addDays(today, -1))) {
    if (o.usable) {
      if (out === null) out = o.date;
      gap = 0;
    } else if (++gap > MEASURED_TOLERATED_UNLOGGED_DAYS) out = null;
  }
  return out;
}

/**
 * Options of the journal estimate (arm J of report 40, kept by J* in report 41): flat prior, +-2 000 kcal grid, baseline
 * carbohydrates, a non-usable day imputed by the median of the 14 previous logged days with weight 0.5 (prompt 34 s3.2;
 * decision A of 29/09), no warm-start history (as the prototype: `includeWarmStartHistory` absent).
 */
export function measuredEstimateOptions(regimeStart: string): JournalRegimeOptions {
  return {
    journalRegimeStart: regimeStart,
    usabilityRule: JOURNAL_USABILITY_RULE,
    nonUsableDayWeight: MEASURED_NON_USABLE_DAY_WEIGHT,
    journalPrior: 'flat',
    offsetGridHalfRangeKcal: MEASURED_GRID_HALF_RANGE_KCAL,
    carbSource: 'baseline',
  };
}

/** Journal calibration input of the day (window from the first day of continuous logging), null without one. */
export function measuredInput(store: WheightyStore, today: string): JournalCalibrationInput | null {
  const start = continuousLoggingStart(store, today);
  return start === null ? null : journalCalibrationInputFromStore(store, today, measuredEstimateOptions(start));
}

/**
 * Gate of the measured habit (decision 4), evaluated weekly: the journal gate of arm J (prompt 36 s3.4) on the window, a
 * journal span of at least 28 days (first to last weigh-in), at least 14 days since the switch, and the tolerances of
 * decisions 6 and 7 over the last 28 days (today excluded, within the window): at most 2 days without a weigh-in, at most
 * 2 non-usable days (unlogged, or a missed meal). With a weigh-in every day of the window, this is the gate of the
 * prototype (weigh-in density X = 100 %).
 */
export function measuredGate(store: WheightyStore, today: string, prepared: JournalCalibrationInput): { gate: GateStatus; summary: JournalGateSummary } {
  const path = pathOf(store);
  const gate = evaluateJournalGate(prepared.input.weights, prepared.observations);
  const from = maxDate(addDays(today, -MEASURED_TOLERANCE_WINDOW_DAYS), prepared.windowStart);
  const to = addDays(today, -1);
  const missedWeighIns = missedWeighInDays(store, from, to);
  const usable = new Map(prepared.observations.map((o) => [o.date, o.usable]));
  let unusableDays = 0;
  if (from <= to) for (let d = 0; d <= daysBetween(from, to); d++) if (usable.get(addDays(from, d)) !== true) unusableDays++;
  const missing: string[] = [];
  if (!gate.criteria.enoughWeighIns) missing.push('weighins');
  if (!gate.criteria.enoughSpan) missing.push('span');
  if (!gate.criteria.enoughCleanWeighIns) missing.push('clean');
  if (!gate.criteria.enoughAdherenceInfo) missing.push('coverage');
  if (gate.spanDays < MEASURED_MIN_JOURNAL_SPAN_DAYS) missing.push('span28');
  if (path.switchedOn === null || daysBetween(path.switchedOn, today) < MEASURED_MIN_DAYS_SINCE_SWITCH) missing.push('since_switch');
  if (missedWeighIns > MEASURED_TOLERATED_MISSED_WEIGHINS) missing.push('missed_weighins');
  if (unusableDays > MEASURED_TOLERATED_UNLOGGED_DAYS) missing.push('unlogged_days');
  return { gate, summary: { date: today, met: missing.length === 0, missing, missedWeighIns, unusableDays } };
}

// ---------------------------------------------------------------------------
// Measured habit: plans (prototype functions, ported)
// ---------------------------------------------------------------------------

/**
 * Prototype `journalSolverOptions` (prompt 38 s3.3): as `solverOptionsFor` does for the current method, under currentState
 * the modeled body today from the journal calibration input (days rebuilt by `reconstructJournalDays`) at the journal offset.
 */
export function journalSolverOptions(request: SolverRequest, input: CalibrationInput, offsetKcal: number, today: string): SolverOptions {
  const out: SolverOptions = { ...request };
  if (request.solverStart === 'currentState') {
    const body = modeledBodyAt(input, offsetKcal, today);
    out.modeledBody = body;
    if (body) out.modeledBodyAtOffsetDelta = (delta) => modeledBodyAt(input, offsetKcal + delta, today);
  }
  return out;
}

/** Prototype (prompt 40 s3.13): goal, target weight and step target of a journal plan rebuilt by a guardrail or a goal change. */
export type JournalPlanOverrides = { goal?: Goal; targetWeightKg?: number; stepTarget?: number };

export type JournalGoalPlan = { goalPlan: GoalPlan; assessment: BaselineAssessment; ctx: PlanContext; weight: number; maintenance: number };

/**
 * Prototype `journalGoalPlan`: production goal solver on the journal maintenance (population TDEE of the day + journal
 * offset), with the floor multiplier and the production solver options with the journal calibration input of the day.
 * `overrides`: goal and target weight of the rebuilt plan and the step target kept; absent: those of the plan in force,
 * baseline steps.
 */
export function journalGoalPlan(store: WheightyStore, date: string, offsetKcal: number, floorMultiplier: number | undefined, solver?: { request: SolverRequest; input: CalibrationInput }, overrides?: JournalPlanOverrides): JournalGoalPlan {
  const profile = store.profile;
  const plan = store.plan;
  if (!profile || !plan) throw new Error('no plan');
  const weight = currentWeightKg(store) ?? profile.currentWeightKg;
  const palCategory = store.meta.initialPalCategory ?? plan.palCategory;
  const assessment = assessBaseline(profile, date, { weightKg: weight, palCategory });
  const maintenance = assessment.populationTdeeKcal + offsetKcal;
  const ctx: PlanContext = {
    ...planContextFrom(profile, assessment, maintenance),
    ...(floorMultiplier !== undefined ? { hardFloorMultiplier: floorMultiplier } : {}),
    ...(solver ? { solver: journalSolverOptions(solver.request, solver.input, offsetKcal, date) } : {}),
  };
  const goalPlan = buildGoalPlan(ctx, {
    goal: overrides?.goal ?? plan.goal,
    weeklyRate: profile.weeklyRateTarget,
    targetWeightKg: overrides?.targetWeightKg ?? plan.targetWeightKg ?? profile.targetWeightKg,
    stepTarget: overrides?.stepTarget ?? profile.averageSteps7d,
  });
  return { goalPlan, assessment, ctx, weight, maintenance };
}

/**
 * Prototype `journalPlanOf`: the journal plan from a solved goal plan, the plan in force with the journal maintenance,
 * intervals and targets. The projection of the plan in force is kept, as in the prototype.
 */
export function journalPlanOf(plan: CurrentPlan, profile: UserProfile, date: string, built: JournalGoalPlan, base: JournalEstimate, overrides?: JournalPlanOverrides): CurrentPlan | null {
  const { goalPlan, assessment, weight: planWeight, maintenance } = built;
  if (goalPlan.status !== 'ok' || goalPlan.calorieTargetKcal === null || goalPlan.macros === null) return null;
  const i80 = base.interval80;
  const i95 = base.interval95;
  const next: CurrentPlan = {
    ...plan,
    createdAt: `${date}T00:00:00.000Z`,
    source: 'recalibrated',
    maintenanceKcal: maintenance,
    maintenanceInterval80: [assessment.populationTdeeKcal + i80[0], assessment.populationTdeeKcal + i80[1]],
    maintenanceInterval95: [assessment.populationTdeeKcal + i95[0], assessment.populationTdeeKcal + i95[1]],
    calorieTarget: goalPlan.calorieTargetKcal,
    stepTarget: overrides?.stepTarget ?? profile.averageSteps7d,
    macros: { ...goalPlan.macros.exact },
    macrosDisplay: { ...goalPlan.macros.display },
    reeKcal: assessment.ree.reeKcalDay,
    weeklyRateTarget: goalPlan.weeklyRateTarget,
    planWeightKg: planWeight,
    requestedWeeklyRate: goalPlan.requestedWeeklyRate,
    baselineStepTarget: profile.averageSteps7d,
    baselineCalorieTarget: goalPlan.calorieTargetKcal,
    populationTdeeKcal: assessment.populationTdeeKcal,
    personalOffsetKcal: base.offsetKcal,
    hardFloorKcal: goalPlan.hardFloorKcal,
    warnings: goalPlan.warnings,
    proteinRule: goalPlan.macros.proteinRule,
  };
  if (overrides?.goal !== undefined) next.goal = overrides.goal;
  if (overrides?.targetWeightKg !== undefined) next.targetWeightKg = overrides.targetWeightKg;
  return next;
}

/**
 * Prototype `habitOf` (prompt 41 s3.1.5): sum of I_d / sum of T_d over the days d of [max(switch day, D - windowDays),
 * D - 1]. I_d: the intake of the day as it enters the journal estimate (`reconstructDays` on the journal calibration input:
 * logged total of a usable day, else the imputed value), extended past the last weigh-in as `modeledBodyAt` does; T_d: the
 * target stored in the day's log (immutable). Bounded to [HABIT_MIN, HABIT_MAX]. Null when a log is missing or the window
 * is empty (the prototype throws).
 */
export function habitOf(store: WheightyStore, prepared: JournalCalibrationInput, switchDate: string, date: string, windowDays = HABIT_WINDOW_DAYS, bounds: readonly [number, number] = [HABIT_MIN, HABIT_MAX]): HabitSummary | null {
  const start = prepared.windowStart;
  const span = daysBetween(start, prepared.windowEnd);
  const total = daysBetween(start, date);
  const inWindow = reconstructDays(prepared.input, start, span);
  const days = total <= span ? inWindow.slice(0, Math.max(0, total)) : [...inWindow, ...reconstructDays(prepared.input, start, total).slice(span)];
  const windowFrom = addDays(date, -windowDays);
  const from = windowFrom > switchDate ? windowFrom : switchDate;
  const targets = new Map(store.dailyLogs.map((l: DailyLog) => [l.date, l.calorieTargetForDay]));
  let sumI = 0;
  let sumT = 0;
  let n = 0;
  for (const day of days) {
    if (day.date < from || day.date >= date) continue;
    const t = targets.get(day.date);
    if (t === undefined) return null;
    sumI += day.intakeKcal;
    sumT += t;
    n++;
  }
  if (n === 0 || !(sumT > 0)) return null;
  const raw = sumI / sumT;
  const bound = raw < bounds[0] ? 'low' : raw > bounds[1] ? 'high' : null;
  return { h: bound === 'low' ? bounds[0] : bound === 'high' ? bounds[1] : raw, raw, bound, days: n };
}

export type MeasuredPlanResult =
  | { ok: true; plan: CurrentPlan; built: JournalGoalPlan; iStar: number; target: number; floorActive: boolean }
  | { ok: false; reason: string; built: JournalGoalPlan };

/**
 * Prototype `jstarPlanOf` (prompt 41 s3.1.6): `journalGoalPlan` on M with the floor factor JOURNAL_FLOOR_FACTOR x h, so that
 * the solved intake I* >= h x hard floor x 1.10; displayed target T = I* / h; production macros for T; plan floor field =
 * hard floor of the day x 1.10; rate = the rate the solver retained for I*. Failure: the reason; the store is not touched.
 */
export function jstarPlanOf(store: WheightyStore, date: string, base: JournalEstimate, h: number, solver?: { request: SolverRequest; input: CalibrationInput }, overrides?: JournalPlanOverrides): MeasuredPlanResult {
  const built = journalGoalPlan(store, date, base.offsetKcal, JOURNAL_FLOOR_FACTOR * h, solver, overrides);
  const g = built.goalPlan;
  const next = journalPlanOf(store.plan as CurrentPlan, store.profile as UserProfile, date, built, base, overrides);
  if (!next || g.calorieTargetKcal === null) return { ok: false, reason: g.status === 'ok' ? 'no_feasible_speed' : g.status, built };
  const iStar = g.calorieTargetKcal;
  const target = iStar / h;
  const macros = macrosFor(built.ctx, g.goal, target);
  if (!macros.feasible) return { ok: false, reason: 'macro_infeasible_target', built };
  next.calorieTarget = target;
  next.baselineCalorieTarget = target;
  next.macros = { ...macros.exact };
  next.macrosDisplay = { ...macros.display };
  next.proteinRule = macros.proteinRule;
  next.hardFloorKcal = hardFloorKcal(built.ctx.reeKcal, built.ctx.sex) * JOURNAL_FLOOR_FACTOR;
  return { ok: true, plan: next, built, iStar, target, floorActive: g.rejections.some((r) => r.reason === 'below_hard_floor') };
}

/**
 * Prototype `jstarSurfaced` (prompt 41 s3.1.9): D-34 (`shouldSurfaceRecalibration`) on the estimate divided by h
 * (maintenance M / h and 80 percent width / h), against the reference of the last plan of the habit.
 */
export function jstarSurfaced(gate: GateStatus, m: number, width80: number, h: number, reference: SurfacingReference, today: string): boolean {
  return shouldSurfaceRecalibration(gate, { tdeeKcal: m / h, interval80Width: width80 / h }, reference, today);
}

export type MeasuredGuardrailResult =
  | { status: 'none'; bmi: number | null; store: WheightyStore }
  | { status: 'applied'; rule: 'G1' | 'G2'; bmi: number; store: WheightyStore; result: Extract<MeasuredPlanResult, { ok: true }> }
  | { status: 'failed'; rule: 'G1' | 'G2'; bmi: number; reason: string; result: Extract<MeasuredPlanResult, { ok: false }> };

/**
 * Prototype `enforceJStarPlanGuardrails` (prompt 41 s3.1.11): the rules of `enforcePlanGuardrails` (same weight, BMI,
 * thresholds and 1e-9 tolerance), the plan rebuilt by `jstarPlanOf` with h:
 * - G1: a loss plan with a BMI under 20: profile goal maintenance, target = the app weight, the J* maintenance plan at that
 *   weight, step target of the plan in force;
 * - G2: otherwise a loss plan above the BMI cap: the J* plan rebuilt with the requested rate of the profile, capped.
 * A failed rebuild leaves the store (plan and profile) unchanged.
 */
export function enforceJStarPlanGuardrails(store: WheightyStore, date: string, base: JournalEstimate, h: number, solver?: { request: SolverRequest; input: CalibrationInput }): MeasuredGuardrailResult {
  const plan = store.plan;
  const profile = store.profile;
  if (!plan || !profile) return { status: 'none', bmi: null, store };
  const weight = currentWeightKg(store) ?? profile.currentWeightKg;
  const currentBmi = bmiOfWeight(weight, profile.heightCm);
  if (plan.goal !== 'loss') return { status: 'none', bmi: currentBmi, store };
  if (currentBmi < LOSS_UNAVAILABLE_BMI_BELOW) {
    const nextProfile: UserProfile = { ...profile, goal: 'maintenance', targetWeightKg: weight, weeklyRateTarget: 0 };
    const withLogs = ensureDailyLogs({ ...store, profile: nextProfile }, date);
    const overrides: JournalPlanOverrides = { goal: 'maintenance', targetWeightKg: weight, stepTarget: plan.stepTarget };
    const r = jstarPlanOf(withLogs, date, base, h, solver, overrides);
    if (!r.ok) return { status: 'failed', rule: 'G1', bmi: currentBmi, reason: r.reason, result: r };
    return { status: 'applied', rule: 'G1', bmi: currentBmi, store: syncTodayLog({ ...withLogs, plan: r.plan }, date), result: r };
  }
  const cap = guardrailMaxWeeklyRate('loss', currentBmi);
  if (cap === null || !(plan.weeklyRateTarget > cap + 1e-9)) return { status: 'none', bmi: currentBmi, store };
  const withLogs = ensureDailyLogs(store, date);
  const r = jstarPlanOf(withLogs, date, base, h, solver, { stepTarget: plan.stepTarget });
  if (!r.ok) return { status: 'failed', rule: 'G2', bmi: currentBmi, reason: r.reason, result: r };
  return { status: 'applied', rule: 'G2', bmi: currentBmi, store: syncTodayLog({ ...withLogs, plan: r.plan }, date), result: r };
}

// ---------------------------------------------------------------------------
// Measured habit: weekly evaluation, offers, confirmation, return to the aligned target
// ---------------------------------------------------------------------------

/** Journal estimate of the day: the fit on the journal window, as the prototype builds its candidate (`evaluateJStar`). */
export type MeasuredEstimate = {
  estimate: JournalEstimate;
  /** Maintenance M of the day (population TDEE at the trend weight + offset), 80 percent width, logged units. */
  maintenanceKcal: number;
  interval80Width: number;
  interval80: Interval;
};

export function measuredEstimateOf(store: WheightyStore, today: string, nowIso: string, prepared: JournalCalibrationInput, gate: GateStatus): MeasuredEstimate | null {
  const fit = fitCalibration(prepared.input);
  if (!fit) return null;
  const candidate = buildSnapshot(fit, { ...gate, met: true }, prepared.input.populationTdeeAtStartKcal, nowIso);
  const plan = store.plan as CurrentPlan;
  const profile = store.profile as UserProfile;
  const weight = currentWeightKg(store) ?? profile.currentWeightKg;
  const populationNow = assessBaseline(profile, today, { weightKg: weight, palCategory: store.meta.initialPalCategory ?? plan.palCategory }).populationTdeeKcal;
  return {
    estimate: { offsetKcal: candidate.posteriorMedianOffsetKcal, interval80: candidate.interval80, interval95: candidate.interval95 },
    maintenanceKcal: populationNow + candidate.posteriorMedianOffsetKcal,
    interval80Width: intervalWidth(candidate.interval80),
    interval80: [populationNow + candidate.interval80[0], populationNow + candidate.interval80[1]],
  };
}

/** Result of a weekly evaluation of the journal path, before it is written into the store. */
export type JournalWeek =
  | { kind: 'not_due' }
  /** `measured`: the estimate and habit of the day when the gate was met but no plan was offered (not surfaced). */
  | { kind: 'evaluated'; gate: JournalGateSummary | null; measured?: { maintenanceKcal: number; habit: HabitSummary } }
  | { kind: 'exit'; gate: JournalGateSummary; reason: 'weighins' | 'logging' }
  | { kind: 'failed'; gate: JournalGateSummary; reason: string; offerKind: MeasuredOffer['kind'] }
  | { kind: 'offer'; gate: JournalGateSummary; offer: MeasuredOffer };

/** Due once every JOURNAL_EVALUATION_EVERY_DAYS (7) days from the switch (then from the last evaluation). */
export function journalWeekDue(store: WheightyStore, today: string): boolean {
  const path = pathOf(store);
  if (path.method === 'assumed' || path.switchedOn === null || !store.plan || !store.profile) return false;
  return daysBetween(path.lastEvaluatedOn ?? path.switchedOn, today) >= JOURNAL_EVALUATION_EVERY_DAYS;
}

/**
 * Weekly evaluation (prompt 41 s3.1.3 to s3.1.9; decisions 4, 6, 7, 9 of 28/09), the heavy part (the journal fit):
 * - aligned: from 14 days after the switch, not within 4 weeks of a refused first plan; gate met: estimate M, habit h, first
 *   plan (always offered, no surfacing rule, as the prototype applies it); a failed build stays silent (decision 9);
 * - measured: more than 2 missed weigh-ins or non-usable days over the last 28: back to the aligned target; gate met:
 *   estimate, h, and a new plan offered when the surfacing rule on M / h says so (`jstarSurfaced`).
 * Pure: `applyJournalWeek` writes the result.
 */
export function evaluateJournalWeek(store: WheightyStore, today: string, nowIso: string): JournalWeek {
  if (!journalWeekDue(store, today)) return { kind: 'not_due' };
  const path = pathOf(store);
  const switchedOn = path.switchedOn as string;
  const first = path.method === 'aligned';
  if (first && daysBetween(switchedOn, today) < MEASURED_MIN_DAYS_SINCE_SWITCH) return { kind: 'evaluated', gate: null };
  if (first && withinDays(path.firstPlanDeclinedOn, today, MEASURED_FIRST_PLAN_RETRY_DAYS)) return { kind: 'evaluated', gate: null };
  const withLogs = ensureDailyLogs(store, today);
  const prepared = measuredInput(withLogs, today);
  if (!prepared) {
    const summary: JournalGateSummary = { date: today, met: false, missing: ['no_journal'], missedWeighIns: 0, unusableDays: 0 };
    return first ? { kind: 'evaluated', gate: summary } : { kind: 'exit', gate: summary, reason: 'logging' };
  }
  const { gate, summary } = measuredGate(withLogs, today, prepared);
  if (!first) {
    if (summary.missedWeighIns > MEASURED_TOLERATED_MISSED_WEIGHINS) return { kind: 'exit', gate: summary, reason: 'weighins' };
    if (summary.unusableDays > MEASURED_TOLERATED_UNLOGGED_DAYS) return { kind: 'exit', gate: summary, reason: 'logging' };
  }
  if (!summary.met) return { kind: 'evaluated', gate: summary };
  const est = measuredEstimateOf(withLogs, today, nowIso, prepared, gate);
  const habit = habitOf(withLogs, prepared, switchedOn, today);
  if (!est || !habit) return { kind: 'evaluated', gate: summary };
  const levelGate: GateStatus = { ...gate, met: true };
  if (!first && path.surfacingReference !== null && !jstarSurfaced(levelGate, est.maintenanceKcal, est.interval80Width, habit.h, path.surfacingReference, today)) return { kind: 'evaluated', gate: summary, measured: { maintenanceKcal: est.maintenanceKcal, habit } };
  const r = jstarPlanOf(withLogs, today, est.estimate, habit.h, { request: PRODUCTION_SOLVER, input: prepared.input });
  const offerKind = first ? 'first' : 'update';
  if (!r.ok) return { kind: 'failed', gate: summary, reason: r.reason, offerKind };
  return {
    kind: 'offer',
    gate: summary,
    offer: { kind: offerKind, date: today, plan: r.plan, estimate: est.estimate, habit, maintenanceKcal: est.maintenanceKcal, interval80Width: est.interval80Width, intakeKcal: r.iStar },
  };
}

/** Writes a weekly evaluation into the store (cheap): evaluation date, gate, offer, silent failure, return to aligned. */
export function applyJournalWeek(store: WheightyStore, week: JournalWeek, today: string, nowIso: string): WheightyStore {
  if (week.kind === 'not_due') return store;
  const evaluated = withPath(store, { lastEvaluatedOn: today, gate: week.gate ?? pathOf(store).gate });
  if (week.kind === 'evaluated') return evaluated;
  if (week.kind === 'exit') return exitToAligned(evaluated, today, nowIso, week.reason);
  if (week.kind === 'failed') {
    const kept = withPath(evaluated, { offer: null });
    return recordPlanEvent(kept, { date: today, rule: 'journal_measured_offer', status: 'failed', reason: week.reason, before: kept.plan ? planSummary(kept.plan) : null, after: null, message: null }, nowIso);
  }
  const offered = withPath(evaluated, { offer: week.offer });
  return recordPlanEvent(offered, { date: today, rule: 'journal_measured_offer', status: 'applied', before: offered.plan ? planSummary(offered.plan) : null, after: planSummary(week.offer.plan), message: null }, nowIso);
}

/** Weekly evaluation, evaluated and written at once (the day change). */
export function runJournalWeek(store: WheightyStore, today: string, nowIso: string): WheightyStore {
  return applyJournalWeek(store, evaluateJournalWeek(store, today, nowIso), today, nowIso);
}

/**
 * Back to the aligned target (decisions 6 and 7): too many missed weigh-ins or non-usable days over the last 28. The plan in
 * force stays until the aligned method (the current method with the floor x 1.10) rebuilds it; the plans of the habit are
 * no longer computed. The habit comes back, with the confirmation of a first plan, once the gate is met again. Message.
 */
export function exitToAligned(store: WheightyStore, today: string, nowIso: string, reason: 'weighins' | 'logging'): WheightyStore {
  const next = withPath(store, { method: 'aligned', chosenTargetActive: false, measuredSince: null, offer: null, estimate: null, habit: null, surfacingReference: null, lastExit: { date: today, reason } });
  const message = reason === 'weighins' ? JOURNAL_MESSAGE.exitWeighIns : JOURNAL_MESSAGE.exitLogging;
  return recordPlanEvent(next, { date: today, rule: 'journal_measured_exit', status: 'applied', reason, before: null, after: null, message }, nowIso);
}

/**
 * The user confirms the offered plan of the measured habit ("Utiliser ce plan"): the plan applies (today's log follows it),
 * the method becomes 'measured' (first plan) and the estimate, h and surfacing reference (M / h, width / h) are those of
 * the offer.
 */
export function acceptMeasuredOffer(store: WheightyStore, today: string, nowIso: string): { ok: true; store: WheightyStore } | { ok: false; reason: 'no_offer' } {
  const path = pathOf(store);
  const offer = path.offer;
  if (!offer || !store.plan) return { ok: false, reason: 'no_offer' };
  const before = store.plan;
  const applied = syncTodayLog({ ...store, plan: offer.plan }, today);
  const h = offer.habit.h;
  const next = withPath(applied, {
    method: 'measured',
    chosenTargetActive: false,
    measuredSince: offer.kind === 'first' ? today : path.measuredSince,
    offer: null,
    estimate: offer.estimate,
    habit: offer.habit,
    surfacingReference: { tdeeKcal: offer.maintenanceKcal / h, interval80Width: offer.interval80Width / h, surfacedOn: offer.date },
  });
  const rule = offer.kind === 'first' ? 'journal_measured_enter' : 'journal_measured_update';
  return { ok: true, store: recordPlanEvent(next, { date: today, rule, status: 'applied', before: planSummary(before), after: planSummary(offer.plan), message: null }, nowIso) };
}

/**
 * The user refuses the offered plan ("Plus tard"). First plan: stays on the aligned target, offered again 4 weeks later at
 * the earliest. Later plan: the plan in force stays; the refused estimate becomes the surfacing reference, as a seen
 * recalibration of the current method does, so it is offered again only when it moves.
 */
export function declineMeasuredOffer(store: WheightyStore, today: string, nowIso: string): WheightyStore {
  const offer = pathOf(store).offer;
  if (!offer) return store;
  const h = offer.habit.h;
  const next =
    offer.kind === 'first'
      ? withPath(store, { offer: null, firstPlanDeclinedOn: today })
      : withPath(store, { offer: null, surfacingReference: { tdeeKcal: offer.maintenanceKcal / h, interval80Width: offer.interval80Width / h, surfacedOn: offer.date } });
  return recordPlanEvent(next, { date: today, rule: 'journal_offer_declined', status: 'applied', reason: offer.kind, before: null, after: null, message: null }, nowIso);
}

/** The offer awaiting confirmation, worded (annex texts), null when none. */
export function measuredOfferView(store: WheightyStore): { kind: MeasuredOffer['kind']; title: string; text: string; accept: string; decline: string; targetKcal: number } | null {
  const offer = pathOf(store).offer;
  if (!offer || !store.plan) return null;
  const target = offer.plan.calorieTarget;
  const text = offer.kind === 'first' ? JOURNAL_MESSAGE.firstPlanText(offer.habit.h, target) : JOURNAL_MESSAGE.updateText(store.plan.calorieTarget, target);
  return { kind: offer.kind, title: offer.kind === 'first' ? JOURNAL_MESSAGE.firstPlanTitle : JOURNAL_MESSAGE.updateTitle, text, accept: JOURNAL_MESSAGE.offerAccept, decline: JOURNAL_MESSAGE.offerDecline, targetKcal: target };
}

// ---------------------------------------------------------------------------
// Measured habit: periodic replan and guardrails of the plan in force
// ---------------------------------------------------------------------------

/** Journal input and h of the day for a rebuild of the plan in force (periodic replan, guardrails, goal change). */
function measuredRebuildBase(store: WheightyStore, today: string): { prepared: JournalCalibrationInput; habit: HabitSummary; base: JournalEstimate } | null {
  const path = pathOf(store);
  if (path.method !== 'measured' || !path.estimate || path.switchedOn === null) return null;
  const prepared = measuredInput(store, today);
  if (!prepared) return null;
  const habit = habitOf(store, prepared, path.switchedOn, today);
  return habit ? { prepared, habit, base: path.estimate } : null;
}

export type MeasuredPeriodicResult =
  | { status: 'not_due' }
  | { status: 'failed'; reason: string; store: WheightyStore }
  | { status: 'replanned'; store: WheightyStore };

/**
 * Prototype `jstarPeriodicStep` (prompt 41 s3.1.10) with the cadence of pass 5a: due 28 days after the plan in force or the
 * last evaluation that left it in place; the plan is rebuilt from the last estimate applied and h of the day, without
 * confirmation (as the periodic replan of the current method), source 'periodic_replan', message from 10 kcal/day.
 */
export function measuredPeriodicReplan(store: WheightyStore, today: string, nowIso: string): MeasuredPeriodicResult {
  const plan = store.plan;
  if (!plan || pathOf(store).method !== 'measured') return { status: 'not_due' };
  const checkedOn = store.meta.periodicReplanCheckedOn;
  const since = checkedOn !== null && checkedOn > planDateOf(plan) ? checkedOn : planDateOf(plan);
  if (daysBetween(since, today) < PERIODIC_REPLAN_EVERY_DAYS) return { status: 'not_due' };
  const withLogs = ensureDailyLogs(store, today);
  const checked: WheightyStore = { ...withLogs, meta: { ...withLogs.meta, periodicReplanCheckedOn: today } };
  const b = measuredRebuildBase(withLogs, today);
  const r = b ? jstarPlanOf(withLogs, today, b.base, b.habit.h, { request: PRODUCTION_SOLVER, input: b.prepared.input }) : null;
  if (!b || !r || !r.ok) {
    const reason = r && !r.ok ? r.reason : 'no_journal_input';
    return { status: 'failed', reason, store: recordPlanEvent(checked, { date: today, rule: 'periodic_replan', status: 'failed', reason, before: planSummary(plan), after: null, message: null }, nowIso) };
  }
  const next: CurrentPlan = { ...r.plan, source: 'periodic_replan' };
  const moved = Math.abs(next.calorieTarget - plan.calorieTarget) >= PERIODIC_REPLAN_NOTICE_MIN_KCAL;
  const message = moved ? PLAN_MESSAGE.periodicReplan(plan.calorieTarget, next.calorieTarget, next.goal) : null;
  const applied = withPath(syncTodayLog({ ...checked, plan: next }, today), { habit: b.habit });
  return { status: 'replanned', store: recordPlanEvent(applied, { date: today, rule: 'periodic_replan', status: 'applied', before: planSummary(plan), after: planSummary(next), message }, nowIso) };
}

/**
 * Prototype `jstarGuardStep` (prompt 41 s3.1.11): the guardrails of the plan in force in the measured habit, checked like
 * those of pass 5a (every day change and every weigh-in), rebuilt by `enforceJStarPlanGuardrails` from the last estimate
 * applied and h of the day, applied without confirmation, with the messages of pass 5a. G1 dates the imposed maintenance.
 */
export function enforceMeasuredGuardrails(store: WheightyStore, today: string, nowIso: string): WheightyStore {
  const plan = store.plan;
  const profile = store.profile;
  if (!plan || !profile || pathOf(store).method !== 'measured' || plan.goal !== 'loss') return store;
  const bmiNow = bmiOfWeight(currentWeightKg(store) ?? profile.currentWeightKg, profile.heightCm);
  const cap = guardrailMaxWeeklyRate('loss', bmiNow);
  if (!(bmiNow < LOSS_UNAVAILABLE_BMI_BELOW) && (cap === null || !(plan.weeklyRateTarget > cap + 1e-9))) return store;
  const b = measuredRebuildBase(store, today);
  const rule = bmiNow < LOSS_UNAVAILABLE_BMI_BELOW ? 'G1' : 'G2';
  const failed = (reason: string) =>
    store.meta.planEvents.some((e) => e.rule === rule && e.status === 'failed' && e.date === today)
      ? store
      : recordPlanEvent(store, { date: today, rule, status: 'failed', reason, before: planSummary(plan), after: null, message: null }, nowIso);
  if (!b) return failed('no_journal_input');
  const r = enforceJStarPlanGuardrails(store, today, b.base, b.habit.h, { request: PRODUCTION_SOLVER, input: b.prepared.input });
  if (r.status === 'none') return store;
  if (r.status === 'failed') return failed(r.reason);
  const after: CurrentPlan = { ...(r.store.plan as CurrentPlan), source: 'guardrail' };
  const meta = r.rule === 'G1' ? { ...r.store.meta, guardrailMaintenanceSince: today } : r.store.meta;
  const next = withPath({ ...r.store, meta, plan: after }, { habit: b.habit });
  const message = r.rule === 'G1' ? PLAN_MESSAGE.guardrailBmi20 : PLAN_MESSAGE.guardrailRateCap(after.weeklyRateTarget);
  return recordPlanEvent(next, { date: today, rule: r.rule, status: 'applied', before: planSummary(plan), after: planSummary(after), message }, nowIso);
}

// ---------------------------------------------------------------------------
// Goal and profile changes on the journal path
// ---------------------------------------------------------------------------

type ChangeResult = { ok: true; store: WheightyStore } | { ok: false; reason: string };

/**
 * Rebuild of the plan in force in the measured habit for a goal or profile change: `jstarPlanOf` from the last estimate
 * applied and h of the day, with the new profile (goal, target weight, rate) and the given step target.
 */
function measuredRebuild(store: WheightyStore, today: string, profile: UserProfile, overrides: JournalPlanOverrides): ChangeResult {
  const withLogs = ensureDailyLogs({ ...store, profile }, today);
  const b = measuredRebuildBase(withLogs, today);
  if (!b) return { ok: false, reason: 'no_journal_input' };
  const r = jstarPlanOf(withLogs, today, b.base, b.habit.h, { request: PRODUCTION_SOLVER, input: b.prepared.input }, overrides);
  if (!r.ok) return { ok: false, reason: r.reason };
  const plan: CurrentPlan = { ...r.plan, source: 'initial' };
  return { ok: true, store: withPath(syncTodayLog({ ...withLogs, plan }, today), { habit: b.habit, offer: null }) };
}

/** Goal change on the journal path: the measured habit rebuilds with its own method; else the engine (floor x 1.10 when aligned). */
export function changeGoalOnPath(store: WheightyStore, today: string, input: { goal: Goal; targetWeightKg: number; weeklyRate: number }, options?: { stepTarget?: number }): ChangeResult {
  if (pathOf(store).method !== 'measured' || !store.profile) return changeGoal(store, today, input, options);
  const profile: UserProfile = { ...store.profile, goal: input.goal, targetWeightKg: input.targetWeightKg, weeklyRateTarget: input.goal === 'maintenance' ? 0 : input.weeklyRate };
  const r = measuredRebuild(store, today, profile, { goal: input.goal, targetWeightKg: input.targetWeightKg, ...(options?.stepTarget !== undefined ? { stepTarget: options.stepTarget } : {}) });
  return r.ok ? { ok: true, store: { ...r.store, meta: { ...r.store.meta, guardrailMaintenanceSince: null } } } : r;
}

/** Profile change on the journal path (same rule as `changeGoalOnPath`). */
export function updateProfileOnPath(store: WheightyStore, today: string, profile: UserProfile): ChangeResult {
  if (pathOf(store).method !== 'measured') return updateProfile(store, today, profile);
  return measuredRebuild(store, today, profile, { goal: profile.goal, targetWeightKg: profile.targetWeightKg });
}

/** Maintenance at the current weight chosen by the user ("objectif atteint"), on the journal path. */
export function switchToMaintenanceOnPath(store: WheightyStore, today: string): ChangeResult {
  if (pathOf(store).method !== 'measured') return switchToMaintenance(store, today);
  const weight = currentWeightKg(store);
  if (weight === null) return { ok: false, reason: 'no_profile' };
  return changeGoalOnPath(store, today, { goal: 'maintenance', targetWeightKg: weight, weeklyRate: 0 }, store.plan ? { stepTarget: store.plan.stepTarget } : undefined);
}

// ---------------------------------------------------------------------------
// Day change
// ---------------------------------------------------------------------------

/** Day change on the journal path: automatic proposal (assumed), weigh-in encouragement (aligned), weekly evaluation. */
export function runJournalDailyChecks(store: WheightyStore, today: string, nowIso: string): WheightyStore {
  let s = checkAlignProposal(store, today, nowIso);
  s = checkWeighDaily(s, today, nowIso);
  return runJournalWeek(s, today, nowIso);
}

// ---------------------------------------------------------------------------
// Views of the journal path (display only)
// ---------------------------------------------------------------------------

/** The journal is read by the plan (measured habit): the interface speaks of the balance of the journal, not of expenditure. */
export function journalRead(store: WheightyStore): boolean {
  return pathOf(store).method === 'measured';
}

/** Adherence is declared every day, except in the measured habit, where the journal replaces it (decision D4). */
export function adherenceAsked(store: WheightyStore): boolean {
  return !journalRead(store);
}

/** "Équilibre d'après ton journal : {M} kcal par jour." in the measured habit, null otherwise. */
export function journalBalanceLine(store: WheightyStore): string | null {
  return journalRead(store) && store.plan ? JOURNAL_MESSAGE.balance(store.plan.maintenanceKcal) : null;
}

/** The habit of the Plan tab, in the measured habit. */
export function habitLine(store: WheightyStore): string | null {
  const habit = pathOf(store).habit;
  return journalRead(store) && habit ? JOURNAL_MESSAGE.habitLine(habit.h) : null;
}

/** h of the plan in force (measured habit), null otherwise: the intake the plan expects is the displayed target x h. */
export function habitInForce(store: WheightyStore): number | null {
  return journalRead(store) ? (pathOf(store).habit?.h ?? null) : null;
}

/** The steps / calories slider trades along the plan of the current method: not on the aligned target itself nor the habit. */
export function balanceSliderAvailable(store: WheightyStore): boolean {
  const path = pathOf(store);
  return path.method !== 'measured' && !path.chosenTargetActive;
}

export type SuggestedAdherence = { value: NonNullable<DailyLog['adherence']>; text: string };

/**
 * Adherence suggested by the journal (decision 12), not in the measured habit: for a usable journal day, the relative gap
 * of the logged total to the day's target: under 10 %: plan respected; 10 to 25 %: minor deviation; beyond 25 %, either way:
 * major deviation. The user confirms or corrects; the science reads the confirmed declaration only.
 */
export function suggestedAdherence(store: WheightyStore, date: string): SuggestedAdherence | null {
  if (!adherenceAsked(store) || !store.plan) return null;
  const day = journalObservations(store, date, date)[0];
  if (!day || !day.usable) return null;
  const target = store.dailyLogs.find((l) => l.date === date)?.calorieTargetForDay ?? store.plan.calorieTarget;
  if (!(target > 0)) return null;
  // Gap in kcal over the target, so that 10 and 25 percent fall exactly on their thresholds.
  const gap = Math.abs(day.loggedKcal - target) / target;
  const value = gap < SUGGESTED_ADHERENCE_ON_PLAN_BELOW ? 'on_plan' : gap <= SUGGESTED_ADHERENCE_MINOR_UP_TO ? 'minor_deviation' : 'major_deviation';
  return { value, text: JOURNAL_MESSAGE.suggestedAdherence(value) };
}

/**
 * Missed meal (decision 8), for the day view: a past day with entries that the journal path does not count (total under
 * half the median of the previous logged days). Shown once the journal serves the plan (aligned target or measured habit).
 */
export function incompleteDayLine(store: WheightyStore, date: string, today: string): string | null {
  if (pathOf(store).method === 'assumed' || date >= today) return null;
  const day = journalObservations(store, date, date)[0];
  return day && day.consumptionMoments > 0 && !day.usable ? JOURNAL_MESSAGE.incompleteDay : null;
}
