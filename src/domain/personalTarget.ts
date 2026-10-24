/**
 * Personal target (fixes of pass 5b, point 6; second fixes, report 47, point 1): a user who already knows their target sets
 * it as a starting point, from the onboarding ("J'ai déjà ma cible") or from the Plan tab ("Choisir ma cible", on the target
 * assumed to be followed only). The weigh-ins then bring the app back to reality: at the first recalibration, the app takes
 * the target over by itself (`computePersonalTakeover`).
 *
 * No new science: the estimated rate is the correspondence rate -> target of the speed slider (`calorieTargetForRate`, the
 * production solver, rate held on the tissue mass) read the other way, with a linear interpolation between two notches, on
 * the side (loss or gain) of the direction of the target. The target is refused only under the floor. The plan in force is
 * the chosen target (source 'personal_target'); the method stays the target assumed to be followed; the rates of the profile
 * and of the plan stay inside the limits of the goal and of the BMI (`goalRateOf`), the estimated rate lives in
 * `CurrentPlan.personalTarget`, for display. No periodic replan and no rate cap (G2) while it is in force (engine); G1 and the
 * underweight alert apply as for everyone.
 */
import { calorieTargetForRate, guardrailMaxWeeklyRate, macrosFor, planHardFloorKcal, projectPlan, snapWeeklyRate, weeklyRateRange } from '@/science/goals';
import type { PlanContext } from '@/science/goals';
import { bmi } from '@/science/macros';
import type { CalibrationSnapshot, Goal, HistoricalIntakeEvidence, UserProfile } from '@/science/types';
import {
  buildPlanFromStore,
  completeOnboarding,
  ensureDailyLogs,
  MAINTENANCE_PROJECTION_DAYS,
  markRecalibrationSeen,
  pathSolverRequest,
  planSummary,
  previewInitialPlan,
  rebuildContextFromStore,
  recordPlanEvent,
  syncTodayLog,
  updateProfile,
} from './engine';
import type { CalibrationState, SolverRequest } from './engine';
import { PERSONAL_TARGET_MESSAGE } from './planMessages';
import type { AppMeta, CurrentPlan, PersonalTarget, PersonalTargetCase, PlanEvent, WheightyStore } from './types';

type Notch = { rate: number; kcal: number };
type Side = { goal: 'loss' | 'gain'; notches: Notch[]; allowedRate: number; allowedKcal: number | null };

/** The correspondence rate -> target of the speed slider for a context, on both sides (loss and gain), whatever the goal. */
export type PersonalTargetTable = { goal: Goal; floorKcal: number; sides: Side[] };

const ceil10 = (kcal: number) => Math.ceil(kcal / 10) * 10;

/**
 * Notches of the slider of a side (0, then the slider grid from its minimum to its general maximum), each with the target
 * that holds it at `steps`, and the target at the fastest rate allowed for the goal and the BMI (the cap of the guardrails).
 */
function sideOf(ctx: PlanContext, goal: 'loss' | 'gain', steps: number): Side {
  const range = weeklyRateRange(goal);
  const rates = [0];
  for (let r = range.minRate; r <= range.maxRate + 1e-9; r = snapWeeklyRate(r + range.step)) rates.push(snapWeeklyRate(r));
  const notches: Notch[] = [];
  for (const rate of rates) {
    const kcal = calorieTargetForRate(ctx, goal, rate, steps);
    if (kcal !== null) notches.push({ rate, kcal });
  }
  const cap = guardrailMaxWeeklyRate(goal, bmi(ctx.currentWeightKg, ctx.heightCm));
  const allowedRate = cap === null ? 0 : Math.min(range.maxRate, cap);
  return { goal, notches, allowedRate, allowedKcal: calorieTargetForRate(ctx, goal, allowedRate, steps) };
}

/** Table of a context: both sides, whatever the goal (report 47, point 1a), and the floor of the plan. */
export function personalTargetTable(ctx: PlanContext, goal: Goal, steps: number): PersonalTargetTable {
  return { goal, floorKcal: planHardFloorKcal(ctx), sides: [sideOf(ctx, 'loss', steps), sideOf(ctx, 'gain', steps)] };
}

/**
 * Rate of a target on a side, interpolated linearly between the two notches around it (the target falls when the loss rate
 * grows, rises when the gain rate grows). Beyond the last notch: that notch's rate.
 */
function rateOn(side: Side, kcal: number): number {
  const n = side.notches;
  const sign = side.goal === 'loss' ? -1 : 1;
  for (let i = 0; i + 1 < n.length; i++) {
    const a = n[i] as Notch;
    const b = n[i + 1] as Notch;
    if (sign * (kcal - a.kcal) >= 0 && sign * (kcal - b.kcal) <= 0) return b.kcal === a.kcal ? a.rate : a.rate + ((b.rate - a.rate) * (kcal - a.kcal)) / (b.kcal - a.kcal);
  }
  return (n[n.length - 1] as Notch).rate;
}

/** Target at rate 0 and at the slider's minimum rate of a side (the zone of a maintenance goal). */
const zeroKcal = (side: Side) => (side.notches[0] as Notch).kcal;
const firstNotchKcal = (side: Side) => (side.notches[1] ?? (side.notches[0] as Notch)).kcal;
const sideOfGoal = (table: PersonalTargetTable, goal: 'loss' | 'gain') => table.sides.find((s) => s.goal === goal) as Side;

/**
 * What the model estimates with a target, on the side of its direction: loss under the target of rate 0 of the loss side,
 * gain above the one of the gain side, neither between the two (rate 0). `rate` is unsigned; `beyondGrid`: past the last
 * notch of that side, `maxRate` its rate.
 */
export type PersonalTargetReading = { direction: 'loss' | 'gain' | null; rate: number; beyondGrid: boolean; maxRate: number };

export function readPersonalTarget(table: PersonalTargetTable, kcal: number): PersonalTargetReading {
  const loss = sideOfGoal(table, 'loss');
  const gain = sideOfGoal(table, 'gain');
  const side = kcal < zeroKcal(loss) ? loss : kcal > zeroKcal(gain) ? gain : null;
  if (!side) return { direction: null, rate: 0, beyondGrid: false, maxRate: 0 };
  const last = side.notches[side.notches.length - 1] as Notch;
  const beyondGrid = side.goal === 'loss' ? kcal < last.kcal : kcal > last.kcal;
  return { direction: side.goal, rate: rateOn(side, kcal), beyondGrid, maxRate: last.rate };
}

/** The estimate kept in the plan: signed rate (negative, a loss). */
function estimateOf(kcal: number, reading: PersonalTargetReading): PersonalTarget {
  return { kcal, estimatedRate: reading.direction === 'loss' ? -reading.rate : reading.rate, beyondGrid: reading.beyondGrid };
}

/**
 * The rate inside the limits of the goal and of the BMI that a reading gives (report 47, point 1c, step 3), the rule of the
 * takeover and of the rate of the profile when the target is set:
 * - a maintenance goal: 0 ('maintenance');
 * - the direction of the goal, within its limits: that rate on the slider grid ('within');
 * - faster than the rate allowed for the goal and the BMI, or beyond the slider grid: the allowed rate ('too_fast');
 * - slower than the minimum of the goal: the minimum ('too_slow'); the wrong direction: the minimum ('opposite').
 */
export function goalRateOf(table: PersonalTargetTable, reading: PersonalTargetReading): { rate: number; case: PersonalTargetCase } {
  const goal = table.goal;
  if (goal === 'maintenance') return { rate: 0, case: 'maintenance' };
  const range = weeklyRateRange(goal);
  const allowed = sideOfGoal(table, goal).allowedRate;
  if (reading.direction !== null && reading.direction !== goal) return { rate: range.minRate, case: 'opposite' };
  if (reading.beyondGrid || reading.rate > allowed + 1e-9) return { rate: allowed, case: 'too_fast' };
  if (reading.direction === null || reading.rate < range.minRate - 1e-9) return { rate: range.minRate, case: 'too_slow' };
  return { rate: Math.min(allowed, Math.max(range.minRate, snapWeeklyRate(reading.rate))), case: 'within' };
}

/** Line of the field (annex): the estimated rate, beyond the grid, or the other direction. */
function estimateText(table: PersonalTargetTable, reading: PersonalTargetReading, kcal: number): string {
  if (reading.direction === null) return PERSONAL_TARGET_MESSAGE.estimated(0);
  // A maintenance goal: the zone between the first notches of loss and gain is a stable weight.
  if (table.goal === 'maintenance') {
    const side = sideOfGoal(table, reading.direction);
    const inZone = reading.direction === 'loss' ? kcal >= firstNotchKcal(side) : kcal <= firstNotchKcal(side);
    return inZone ? PERSONAL_TARGET_MESSAGE.estimated(reading.rate) : PERSONAL_TARGET_MESSAGE.opposite(reading.direction);
  }
  if (reading.direction !== table.goal) return PERSONAL_TARGET_MESSAGE.opposite(reading.direction);
  return reading.beyondGrid ? PERSONAL_TARGET_MESSAGE.beyondGrid(reading.maxRate) : PERSONAL_TARGET_MESSAGE.estimated(reading.rate);
}

export type PersonalTargetCheck =
  | { ok: true; kcal: number; target: PersonalTarget; goalRate: number; case: PersonalTargetCase; text: string }
  | { ok: false; reason: 'invalid' | 'below_floor'; text: string; limitKcal?: number };

/**
 * Check of a personal target (report 47, point 1a): refused only under the floor of the plan (the minimum shown). Otherwise
 * the estimate (signed rate, beyond the grid), its line, and the rate of the profile inside the limits (`goalRateOf`).
 */
export function checkPersonalTarget(table: PersonalTargetTable, kcal: number): PersonalTargetCheck {
  if (!Number.isFinite(kcal) || kcal <= 0) return { ok: false, reason: 'invalid', text: PERSONAL_TARGET_MESSAGE.belowFloor(ceil10(table.floorKcal)) };
  if (kcal < table.floorKcal) return { ok: false, reason: 'below_floor', text: PERSONAL_TARGET_MESSAGE.belowFloor(ceil10(table.floorKcal)), limitKcal: ceil10(table.floorKcal) };
  const reading = readPersonalTarget(table, kcal);
  const rate = goalRateOf(table, reading);
  return { ok: true, kcal, target: estimateOf(kcal, reading), goalRate: rate.rate, case: rate.case, text: estimateText(table, reading, kcal) };
}

/**
 * The plan in force becomes the chosen target: its target, the macros of that target, the projection at that target, the
 * rate `goalRate` (inside the limits; 0 for a maintenance goal) as the rate requested and applied, source
 * 'personal_target'. Every other field (maintenance, intervals, floor, steps) is the plan built for the same context.
 */
export function withPersonalTarget(plan: CurrentPlan, ctx: PlanContext, goal: Goal, targetWeightKg: number, target: PersonalTarget, goalRate: number): CurrentPlan {
  const kcal = target.kcal;
  const macros = macrosFor(ctx, goal, kcal);
  const projection = projectPlan(ctx, {
    goal,
    scenario: { calorieTargetKcal: kcal, stepsPerDay: plan.stepTarget },
    targetWeightKg,
    maintenanceOffsets80: [plan.maintenanceInterval80[0] - plan.maintenanceKcal, plan.maintenanceInterval80[1] - plan.maintenanceKcal],
    maintenanceHorizonDays: MAINTENANCE_PROJECTION_DAYS,
  });
  const rate = goal === 'maintenance' ? 0 : goalRate;
  return {
    ...plan,
    source: 'personal_target',
    goal,
    targetWeightKg,
    calorieTarget: kcal,
    baselineCalorieTarget: kcal,
    macros: { ...macros.exact },
    macrosDisplay: { ...macros.display },
    proteinRule: macros.proteinRule,
    weeklyRateTarget: rate,
    requestedWeeklyRate: rate,
    projection: {
      ...(projection.approximateWeeks !== undefined ? { approximateWeeks: projection.approximateWeeks } : {}),
      trajectory: projection.trajectory,
      lower80: projection.lower80,
      upper80: projection.upper80,
    },
    ...(plan.warnings ? { warnings: { ...plan.warnings, belowRee: kcal < plan.reeKcal } } : {}),
    personalTarget: { ...target },
  };
}

/** The plan in force is the chosen target. */
export function personalTargetActive(store: WheightyStore): boolean {
  return store.plan?.source === 'personal_target';
}

/** "Choisir ma cible" is offered on the target assumed to be followed only. */
export function personalTargetAvailable(store: WheightyStore): boolean {
  return store.plan !== null && store.meta.journalPath.method === 'assumed';
}

/** Table of the Plan tab: the context of a rebuild from the store (the one of a goal change and of its speed slider). */
export function storePersonalTargetTable(store: WheightyStore, today: string): PersonalTargetTable | null {
  const ctx = rebuildContextFromStore(store, today);
  return ctx && store.profile ? personalTargetTable(ctx, store.profile.goal, store.profile.averageSteps7d) : null;
}

/** "Ta cible personnelle : ... L'app l'ajustera à ta première recalibration." (Plan tab), null without a personal target. */
export function personalTargetLine(store: WheightyStore): string | null {
  const t = store.plan?.source === 'personal_target' ? store.plan.personalTarget : undefined;
  return t ? PERSONAL_TARGET_MESSAGE.inPlan(t.kcal) : null;
}

type ChooseResult = { ok: true; store: WheightyStore } | { ok: false; reason: string; text?: string };

/**
 * The plan built for the chosen target, on the store's context: the plan of the profile's goal at the rate of the profile
 * (its goal checks: target weight, BMI), or, when no rate of the grid passes its floor check, the plan of a maintenance goal
 * on the same context, every goal field then set.
 */
function personalPlan(store: WheightyStore, today: string, profile: UserProfile, target: PersonalTarget, solver?: SolverRequest): { ok: true; plan: CurrentPlan } | { ok: false; reason: string } {
  const goal = profile.goal;
  const options = { source: 'personal_target' as const, ...(solver ? { solver } : {}) };
  let r = buildPlanFromStore({ ...store, profile }, today, options);
  if (!r.ok && r.reason === 'no_feasible_speed') r = buildPlanFromStore({ ...store, profile }, today, { ...options, goal: 'maintenance', targetWeightKg: profile.targetWeightKg });
  if (!r.ok) return { ok: false, reason: r.reason };
  return { ok: true, plan: withPersonalTarget(r.plan, r.context, goal, profile.targetWeightKg, target, profile.weeklyRateTarget) };
}

/** Trace entry of a personal target set by the user (no message): the target and the rate estimated at the start. */
function recordSet(store: WheightyStore, before: CurrentPlan | null, check: Extract<PersonalTargetCheck, { ok: true }>, today: string, nowIso: string): WheightyStore {
  const after = store.plan as CurrentPlan;
  return recordPlanEvent(
    store,
    { date: today, rule: 'personal_target_set', status: 'applied', before: before ? planSummary(before) : null, after: planSummary(after), message: null, personalTarget: { ...check.target, case: check.case } },
    nowIso,
  );
}

/** "Choisir ma cible" (Plan tab): checked on the context of the store, then the plan in force. */
export function choosePersonalTarget(store: WheightyStore, today: string, kcal: number, nowIso = `${today}T00:00:00.000Z`): ChooseResult {
  if (!store.profile || !store.plan) return { ok: false, reason: 'no_profile' };
  if (!personalTargetAvailable(store)) return { ok: false, reason: 'journal_path' };
  const table = storePersonalTargetTable(store, today);
  if (!table) return { ok: false, reason: 'no_profile' };
  const check = checkPersonalTarget(table, kcal);
  if (!check.ok) return { ok: false, reason: check.reason, text: check.text };
  const profile: UserProfile = { ...store.profile, weeklyRateTarget: check.goalRate };
  const withLogs = ensureDailyLogs(store, today);
  const built = personalPlan(withLogs, today, profile, check.target);
  if (!built.ok) return built;
  // A target the user chooses ends a maintenance imposed by the BMI-20 guardrail, as a goal change does.
  const next = syncTodayLog({ ...withLogs, profile, plan: built.plan, meta: { ...withLogs.meta, guardrailMaintenanceSince: null } }, today);
  return { ok: true, store: recordSet(next, store.plan, check, today, nowIso) };
}

/** Table of the onboarding: the context of the first plan shown (`previewInitialPlan`), null when it cannot be built. */
export function onboardingPersonalTargetTable(profile: UserProfile, today: string, evidence: HistoricalIntakeEvidence | null): PersonalTargetTable | null {
  const preview = previewInitialPlan(profile, today, evidence);
  return preview.context ? personalTargetTable(preview.context, profile.goal, profile.averageSteps7d) : null;
}

/**
 * Onboarding with "J'ai déjà ma cible": checked on the context of the first plan (refused only under its floor), the
 * onboarding of the profile at the rate inside the limits (`goalRateOf`; the profile as given when that rate cannot be built),
 * then the chosen target.
 */
export function completeOnboardingWithTarget(store: WheightyStore, profile: UserProfile, today: string, nowIso: string, evidence: HistoricalIntakeEvidence | null, kcal: number): ChooseResult {
  const preview = previewInitialPlan(profile, today, evidence);
  if (!preview.ok) return { ok: false, reason: preview.reason };
  const check = checkPersonalTarget(personalTargetTable(preview.context, profile.goal, profile.averageSteps7d), kcal);
  if (!check.ok) return { ok: false, reason: check.reason, text: check.text };
  const chosen: UserProfile = { ...profile, weeklyRateTarget: check.goalRate };
  let r = completeOnboarding(store, chosen, today, nowIso, evidence);
  if (!r.ok) r = completeOnboarding(store, profile, today, nowIso, evidence);
  if (!r.ok) return r;
  const plan = withPersonalTarget(r.store.plan as CurrentPlan, preview.context, profile.goal, profile.targetWeightKg, check.target, check.goalRate);
  const next = syncTodayLog({ ...r.store, profile: chosen, plan }, today);
  return { ok: true, store: recordSet(next, null, check, today, nowIso) };
}

/**
 * Profile edit while a personal target is in force (report 47, point 1e): without a change of goal or of rate, it is kept on
 * the new context (its macros, its projection); the floor is checked again, a target under the new floor is raised to it.
 * Null when the rule does not apply (no personal target, or the goal or the rate changes: a computed target replaces it).
 */
export function updateProfileKeepingPersonalTarget(store: WheightyStore, today: string, profile: UserProfile): ChooseResult | null {
  const t = store.plan?.source === 'personal_target' ? store.plan.personalTarget : undefined;
  const before = store.profile;
  if (!t || !before || profile.goal !== before.goal || Math.abs(profile.weeklyRateTarget - before.weeklyRateTarget) > 1e-9) return null;
  const r = updateProfile(store, today, profile);
  if (!r.ok) return r;
  const ctx = rebuildContextFromStore(r.store, today);
  if (!ctx) return { ok: false, reason: 'no_profile' };
  const floor = planHardFloorKcal(ctx);
  const target: PersonalTarget = t.kcal < floor ? { ...t, kcal: ceil10(floor) } : t;
  const plan = withPersonalTarget(r.store.plan as CurrentPlan, ctx, profile.goal, profile.targetWeightKg, target, profile.weeklyRateTarget);
  return { ok: true, store: syncTodayLog({ ...r.store, plan }, today) };
}

// ---------------------------------------------------------------------------
// Takeover by the app at the first recalibration (report 47, point 1c)
// ---------------------------------------------------------------------------

/** The first recalibration of a personal target is ready: a candidate, its gate met, and it would be shown (`surfaced`). */
export function personalTakeoverDue(store: WheightyStore, state: CalibrationState | null): state is CalibrationState & { candidate: CalibrationSnapshot } {
  return personalTargetActive(store) && state !== null && state.surfaced && state.gate.met && state.candidate !== null && state.proposedMaintenanceKcal !== null;
}

/**
 * What the takeover changes, computed apart from the store of the moment (the calibration worker computes it next to the
 * state): applied with `applyPersonalTakeover` to the store it was computed for. `plan` identifies the personal target it
 * replaces.
 */
export type PersonalTakeover = {
  plan: { createdAt: string; kcal: number };
  /** Surfacing reference: the recalibration is seen (a failed takeover waits for the next one). */
  seen: AppMeta['lastSurfacedCalibration'];
  event: Omit<PlanEvent, 'id' | 'seen'>;
} & ({ status: 'applied'; snapshot: CalibrationSnapshot; profile: UserProfile; next: CurrentPlan } | { status: 'failed' });

/**
 * Takeover of a personal target (report 47, point 1c), without any action of the user:
 * 1. the estimate is recorded as `applyRecalibration` does (snapshot applied, surfacing reference updated);
 * 2. the rate the personal target gives is read on the context of the new estimate (same table, both sides);
 * 3. the rate inside the limits of the goal and of the BMI (`goalRateOf`);
 * 4. the plan of the current method at that rate, with the steps of the plan in force (source 'recalibrated'); the rate of
 *    the profile becomes that rate;
 * 5. the personal target ends (the plan in force is no longer one);
 * 6. a trace entry 'personal_target_takeover' (before, after, the estimates in their plans, the rate read, the case), with
 *    the long text behind "Détails" (the short one is worded from the entry, `planEventShort`).
 * When the build fails, the personal target stays: a failed entry, the recalibration seen, the next one tries again.
 * Null when the takeover is not due.
 */
export function computePersonalTakeover(store: WheightyStore, state: CalibrationState | null, today: string, nowIso: string): PersonalTakeover | null {
  if (!personalTakeoverDue(store, state)) return null;
  const plan = store.plan as CurrentPlan;
  const profile = store.profile as UserProfile;
  const kcal = plan.personalTarget?.kcal ?? plan.calorieTarget;
  const seen = markRecalibrationSeen(store, state, today).meta.lastSurfacedCalibration;
  const id = { plan: { createdAt: plan.createdAt, kcal }, seen };
  const snapshot: CalibrationSnapshot = { ...state.candidate, appliedAt: nowIso };
  const withSnapshot: WheightyStore = { ...ensureDailyLogs(store, today), calibrationSnapshots: [...store.calibrationSnapshots, snapshot] };
  const table = storePersonalTargetTable(withSnapshot, today);
  const failed = (reason: string, detail?: PlanEvent['personalTarget']): PersonalTakeover => ({
    ...id,
    status: 'failed',
    event: { date: today, rule: 'personal_target_takeover', status: 'failed', reason, before: planSummary(plan), after: null, message: null, ...(detail ? { personalTarget: detail } : {}) },
  });
  if (!table) return failed('no_profile');
  const reading = readPersonalTarget(table, kcal);
  const choice = goalRateOf(table, reading);
  const detail = { ...estimateOf(kcal, reading), case: choice.case };
  const nextProfile: UserProfile = { ...profile, weeklyRateTarget: choice.rate };
  const r = buildPlanFromStore({ ...withSnapshot, profile: nextProfile }, today, { source: 'recalibrated', snapshot, stepTarget: plan.stepTarget, solver: pathSolverRequest(store) });
  if (!r.ok) return failed(r.reason, detail);
  return {
    ...id,
    status: 'applied',
    snapshot,
    profile: nextProfile,
    next: r.plan,
    event: {
      date: today,
      rule: 'personal_target_takeover',
      status: 'applied',
      before: planSummary(plan),
      after: planSummary(r.plan),
      message: PERSONAL_TARGET_MESSAGE.takeoverDetails(r.plan.maintenanceKcal, plan.maintenanceKcal),
      personalTarget: detail,
    },
  };
}

/**
 * Applies a takeover to the store, when the personal target it was computed for is still in force (same plan, same target);
 * otherwise the store comes back unchanged (the next calibration computes it again).
 */
export function applyPersonalTakeover(store: WheightyStore, takeover: PersonalTakeover, today: string, nowIso: string): WheightyStore {
  const plan = store.plan;
  if (!plan || plan.source !== 'personal_target' || plan.createdAt !== takeover.plan.createdAt || (plan.personalTarget?.kcal ?? plan.calorieTarget) !== takeover.plan.kcal) return store;
  const withLogs = ensureDailyLogs(store, today);
  const seen: WheightyStore = { ...withLogs, meta: { ...withLogs.meta, lastSurfacedCalibration: takeover.seen } };
  const next =
    takeover.status === 'applied'
      ? syncTodayLog({ ...seen, profile: takeover.profile, plan: takeover.next, calibrationSnapshots: [...seen.calibrationSnapshots, takeover.snapshot] }, today)
      : seen;
  return recordPlanEvent(next, takeover.event, nowIso);
}

/** Takeover computed and applied at once (tests, and the synchronous fallback of the calibration). */
export function takeOverPersonalTarget(store: WheightyStore, state: CalibrationState | null, today: string, nowIso: string): WheightyStore {
  const t = computePersonalTakeover(store, state, today, nowIso);
  return t ? applyPersonalTakeover(store, t, today, nowIso) : store;
}
