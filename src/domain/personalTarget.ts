/**
 * Personal target (fixes of pass 5b, point 6): a user who already computes their target with other tools keeps it, from the
 * onboarding ("J'ai déjà ma cible") or from the Plan tab ("Choisir ma cible", on the target assumed to be followed only).
 *
 * No new science: the predicted speed is the correspondence rate -> target of the speed slider (`calorieTargetForRate`, the
 * production solver, rate held on the tissue mass) read the other way, with a linear interpolation between two notches of
 * the slider. The plan in force is the chosen target (source 'personal_target'); the method stays the target assumed to be
 * followed; the requested speed recorded is the predicted one. No periodic replan while it is in force (engine); the
 * guardrails apply as for everyone; a recalibration is offered as usual, with "Garder ma cible".
 */
import { calorieTargetForRate, guardrailMaxWeeklyRate, macrosFor, planHardFloorKcal, projectPlan, snapWeeklyRate, weeklyRateRange } from '@/science/goals';
import type { PlanContext } from '@/science/goals';
import { bmi } from '@/science/macros';
import type { Goal, HistoricalIntakeEvidence, UserProfile } from '@/science/types';
import { buildPlanFromStore, completeOnboarding, ensureDailyLogs, MAINTENANCE_PROJECTION_DAYS, previewInitialPlan, rebuildContextFromStore, syncTodayLog } from './engine';
import type { SolverRequest } from './engine';
import { PERSONAL_TARGET_MESSAGE } from './planMessages';
import type { CurrentPlan, WheightyStore } from './types';

type Notch = { rate: number; kcal: number };
type Side = { goal: 'loss' | 'gain'; notches: Notch[]; allowedRate: number; allowedKcal: number | null };

/** The correspondence rate -> target of the speed slider for a context, on both sides that the goal needs. */
export type PersonalTargetTable = { goal: Goal; floorKcal: number; sides: Side[] };

const ceil10 = (kcal: number) => Math.ceil(kcal / 10) * 10;
const floor10 = (kcal: number) => Math.floor(kcal / 10) * 10;

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

/** Table of a context: the side of the goal (both sides for a maintenance goal), and the floor of the plan. */
export function personalTargetTable(ctx: PlanContext, goal: Goal, steps: number): PersonalTargetTable {
  const sides = goal === 'maintenance' ? [sideOf(ctx, 'loss', steps), sideOf(ctx, 'gain', steps)] : [sideOf(ctx, goal, steps)];
  return { goal, floorKcal: planHardFloorKcal(ctx), sides };
}

/**
 * Rate of a target on a side, interpolated linearly between the two notches around it (the target falls when the loss rate
 * grows, rises when the gain rate grows). Beyond the last notch: that notch's rate (the caller refuses it as too fast).
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
const firstNotchKcal = (side: Side) => (side.notches[1] ?? side.notches[0] as Notch).kcal;

export type PersonalTargetCheck =
  | { ok: true; kcal: number; predictedRate: number; text: string }
  | { ok: false; reason: 'invalid' | 'below_floor' | 'too_fast' | 'contradicts'; text: string; limitKcal?: number };

/**
 * Check of a personal target, in this order: under the floor of the plan (refused, the minimum shown); against the goal (a
 * target that would gain with a loss goal, or lose with a gain goal; a maintenance goal accepts the targets between the
 * first notches of loss and gain); faster than the rate allowed for the goal and the BMI (refused, the limit proposed);
 * otherwise the predicted rate (fraction of body weight per week, in the direction of the goal; signed for maintenance,
 * negative: a loss).
 */
export function checkPersonalTarget(table: PersonalTargetTable, kcal: number): PersonalTargetCheck {
  if (!Number.isFinite(kcal) || kcal <= 0) return { ok: false, reason: 'invalid', text: PERSONAL_TARGET_MESSAGE.belowFloor(ceil10(table.floorKcal)) };
  if (kcal < table.floorKcal) return { ok: false, reason: 'below_floor', text: PERSONAL_TARGET_MESSAGE.belowFloor(ceil10(table.floorKcal)), limitKcal: ceil10(table.floorKcal) };
  const loss = table.sides.find((s) => s.goal === 'loss');
  const gain = table.sides.find((s) => s.goal === 'gain');
  if (table.goal === 'maintenance' && loss && gain) {
    if (kcal < firstNotchKcal(loss)) return { ok: false, reason: 'contradicts', text: PERSONAL_TARGET_MESSAGE.contradicts('loss') };
    if (kcal > firstNotchKcal(gain)) return { ok: false, reason: 'contradicts', text: PERSONAL_TARGET_MESSAGE.contradicts('gain') };
    const rate = kcal < zeroKcal(loss) ? -rateOn(loss, kcal) : kcal > zeroKcal(gain) ? rateOn(gain, kcal) : 0;
    return { ok: true, kcal, predictedRate: rate, text: PERSONAL_TARGET_MESSAGE.predicted(kcal, rate) };
  }
  const side = (table.goal === 'loss' ? loss : gain) as Side;
  if (table.goal === 'loss' ? kcal > zeroKcal(side) : kcal < zeroKcal(side)) return { ok: false, reason: 'contradicts', text: PERSONAL_TARGET_MESSAGE.contradicts(table.goal === 'loss' ? 'gain' : 'loss') };
  const limit = side.allowedKcal;
  if (limit !== null && (table.goal === 'loss' ? kcal < limit : kcal > limit)) {
    const proposed = table.goal === 'loss' ? Math.max(ceil10(limit), ceil10(table.floorKcal)) : floor10(limit);
    return { ok: false, reason: 'too_fast', text: table.goal === 'loss' ? PERSONAL_TARGET_MESSAGE.tooFastLoss(proposed) : PERSONAL_TARGET_MESSAGE.tooFastGain(proposed), limitKcal: proposed };
  }
  const rate = rateOn(side, kcal);
  return { ok: true, kcal, predictedRate: rate, text: PERSONAL_TARGET_MESSAGE.predicted(kcal, rate) };
}

/**
 * The plan in force becomes the chosen target: its target, the macros of that target, the projection at that target, the
 * predicted rate as the rate requested and applied (0 for a maintenance goal), source 'personal_target'. Every other field
 * (maintenance, intervals, floor, steps) is the plan built for the same context.
 */
export function withPersonalTarget(plan: CurrentPlan, ctx: PlanContext, goal: Goal, targetWeightKg: number, kcal: number, predictedRate: number): CurrentPlan {
  const macros = macrosFor(ctx, goal, kcal);
  const projection = projectPlan(ctx, {
    goal,
    scenario: { calorieTargetKcal: kcal, stepsPerDay: plan.stepTarget },
    targetWeightKg,
    maintenanceOffsets80: [plan.maintenanceInterval80[0] - plan.maintenanceKcal, plan.maintenanceInterval80[1] - plan.maintenanceKcal],
    maintenanceHorizonDays: MAINTENANCE_PROJECTION_DAYS,
  });
  const rate = goal === 'maintenance' ? 0 : predictedRate;
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
    personalTarget: { kcal, predictedRate },
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

/** "Ta cible personnelle : ... Vitesse prévue : ..." of the Plan tab, null when the plan in force is not a personal target. */
export function personalTargetLine(store: WheightyStore): string | null {
  const t = store.plan?.source === 'personal_target' ? store.plan.personalTarget : undefined;
  return t ? PERSONAL_TARGET_MESSAGE.inPlan(t.kcal, t.predictedRate) : null;
}

type ChooseResult = { ok: true; store: WheightyStore } | { ok: false; reason: string; text?: string };

/**
 * The plan built for the chosen target, on the store's context: the plan of the profile's goal at the predicted rate (its
 * goal checks: target weight, BMI), or, when no rate of the grid passes its floor check (a target near the floor at a rate
 * slower than the slider's minimum), the plan of a maintenance goal on the same context, every goal field then set.
 */
function personalPlan(store: WheightyStore, today: string, profile: UserProfile, kcal: number, rate: number, solver?: SolverRequest): { ok: true; plan: CurrentPlan } | { ok: false; reason: string } {
  const goal = profile.goal;
  const options = { source: 'personal_target' as const, ...(solver ? { solver } : {}) };
  let r = buildPlanFromStore({ ...store, profile }, today, options);
  if (!r.ok && r.reason === 'no_feasible_speed') r = buildPlanFromStore({ ...store, profile }, today, { ...options, goal: 'maintenance', targetWeightKg: profile.targetWeightKg });
  if (!r.ok) return { ok: false, reason: r.reason };
  return { ok: true, plan: withPersonalTarget(r.plan, r.context, goal, profile.targetWeightKg, kcal, rate) };
}

/** "Choisir ma cible" (Plan tab): checked on the context of the store, then the plan in force. */
export function choosePersonalTarget(store: WheightyStore, today: string, kcal: number): ChooseResult {
  if (!store.profile || !store.plan) return { ok: false, reason: 'no_profile' };
  if (!personalTargetAvailable(store)) return { ok: false, reason: 'journal_path' };
  const table = storePersonalTargetTable(store, today);
  if (!table) return { ok: false, reason: 'no_profile' };
  const check = checkPersonalTarget(table, kcal);
  if (!check.ok) return { ok: false, reason: check.reason, text: check.text };
  const profile: UserProfile = { ...store.profile, weeklyRateTarget: store.profile.goal === 'maintenance' ? 0 : check.predictedRate };
  const withLogs = ensureDailyLogs(store, today);
  const built = personalPlan(withLogs, today, profile, kcal, check.predictedRate);
  if (!built.ok) return built;
  // A target the user chooses ends a maintenance imposed by the BMI-20 guardrail, as a goal change does.
  return { ok: true, store: syncTodayLog({ ...withLogs, profile, plan: built.plan, meta: { ...withLogs.meta, guardrailMaintenanceSince: null } }, today) };
}

/** Table of the onboarding: the context of the first plan shown (`previewInitialPlan`), null when it cannot be built. */
export function onboardingPersonalTargetTable(profile: UserProfile, today: string, evidence: HistoricalIntakeEvidence | null): PersonalTargetTable | null {
  const preview = previewInitialPlan(profile, today, evidence);
  return preview.context ? personalTargetTable(preview.context, profile.goal, profile.averageSteps7d) : null;
}

/**
 * Onboarding with "J'ai déjà ma cible": the onboarding as usual, then the chosen target on the context of the first plan
 * (the one the check used), the predicted rate in the profile.
 */
export function completeOnboardingWithTarget(store: WheightyStore, profile: UserProfile, today: string, nowIso: string, evidence: HistoricalIntakeEvidence | null, kcal: number): ChooseResult {
  const preview = previewInitialPlan(profile, today, evidence);
  if (!preview.ok) return { ok: false, reason: preview.reason };
  const check = checkPersonalTarget(personalTargetTable(preview.context, profile.goal, profile.averageSteps7d), kcal);
  if (!check.ok) return { ok: false, reason: check.reason, text: check.text };
  // The onboarding of the profile as given (its first plan is the one shown), then the chosen target and its rate.
  const r = completeOnboarding(store, profile, today, nowIso, evidence);
  if (!r.ok) return r;
  const chosen: UserProfile = { ...profile, weeklyRateTarget: profile.goal === 'maintenance' ? 0 : check.predictedRate };
  const plan = withPersonalTarget(r.store.plan as CurrentPlan, preview.context, profile.goal, profile.targetWeightKg, kcal, check.predictedRate);
  return { ok: true, store: syncTodayLog({ ...r.store, profile: chosen, plan }, today) };
}
