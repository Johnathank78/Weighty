/**
 * History of the plan (report 50, UX pass 3, point 3, decision E3): the changes of the plan in force, read in the trace
 * (`AppMeta.planEvents`) and nowhere else, most recent first. Read only.
 *
 * Kept: the entries with the status 'applied' that carry the plan after the change (`after`), for the rules that change the
 * plan in force (`PLAN_HISTORY_RULES`); and the 'recalibration' entries rebuilt by the migration 10 -> 11 (`backfilled`, plans
 * at null), shown as "Recalibration (détails non conservés)". Left out (listed in report 50): the failed entries, the offers
 * (a plan of the measured habit offered, not applied: 'journal_measured_offer' carries the plan offered), the messages and
 * refusals without a plan change, and the changes whose plan the trace does not keep ('journal_measured_exit',
 * 'target_bmi_20').
 */
import { formatDayMonth } from './format';
import { PLAN_HISTORY_MESSAGE } from './planMessages';
import type { PlanEvent, PlanEventRule, PlanSummary, WheightyStore } from './types';

/** Rules of the trace whose applied entries change the plan in force, with the plan after the change. */
export const PLAN_HISTORY_RULES = [
  'onboarding',
  'recalibration',
  'recalibration_maintenance',
  'user_goal',
  'user_slider',
  'user_profile',
  'periodic_replan',
  'G1',
  'G2',
  'personal_target_set',
  'personal_target_takeover',
  'personal_target_return',
  'journal_switch',
  'journal_measured_enter',
  'journal_measured_update',
] as const satisfies readonly PlanEventRule[];

export type PlanHistoryRule = (typeof PLAN_HISTORY_RULES)[number];

export type PlanHistoryEntry = {
  id: string;
  date: string;
  /** "20 novembre", with the year when it is not the year of `today`. */
  dateText: string;
  /** Target before and after, kcal per day; `before` null for the first plan; both null for a backfilled entry. */
  beforeKcal: number | null;
  afterKcal: number | null;
  /** "1 810 → 1 920 kcal par jour" (or the first target alone); null for a backfilled entry. */
  targetText: string | null;
  /** The cause in plain words, one per rule. */
  cause: string;
  /** Behind "Détails", when the trace keeps them: the maintenance before and after, and the speed. Empty otherwise. */
  details: string[];
  backfilled: boolean;
};

const isHistoryRule = (rule: PlanEventRule): rule is PlanHistoryRule => (PLAN_HISTORY_RULES as readonly PlanEventRule[]).includes(rule);

/** Whether a trace entry is a change of the plan shown in the history. */
export function inPlanHistory(e: PlanEvent): boolean {
  if (e.status !== 'applied') return false;
  if (e.backfilled === true && e.rule === 'recalibration') return true;
  return e.after !== null && isHistoryRule(e.rule);
}

/** The speed of a plan: its weekly rate, or the maintenance of the weight. */
function speedOf(p: PlanSummary): string {
  return p.goal === 'maintenance' ? PLAN_HISTORY_MESSAGE.maintenanceGoal : PLAN_HISTORY_MESSAGE.perWeek(p.weeklyRateTarget);
}

function detailsOf(e: PlanEvent): string[] {
  const after = e.after;
  if (!after) return [];
  const before = e.before;
  // The maintenances of a recalibration entry (schema 11), else those of the plans before and after.
  const mBefore = e.maintenance?.before ?? before?.maintenanceKcal ?? null;
  const mAfter = e.maintenance?.after ?? after.maintenanceKcal;
  const out = [PLAN_HISTORY_MESSAGE.maintenance(mBefore, mAfter)];
  out.push(before ? PLAN_HISTORY_MESSAGE.speedChange(speedOf(before), speedOf(after)) : PLAN_HISTORY_MESSAGE.speed(speedOf(after)));
  return out;
}

function targetText(before: number | null, after: number | null): string | null {
  if (after === null) return null;
  return before === null ? PLAN_HISTORY_MESSAGE.firstTarget(after) : PLAN_HISTORY_MESSAGE.target(before, after);
}

/** The entries of the history, most recent first (the trace is kept oldest first). */
export function planHistory(store: WheightyStore, today: string): PlanHistoryEntry[] {
  const year = today.slice(0, 4);
  return store.meta.planEvents
    .filter(inPlanHistory)
    .reverse()
    .map((e) => {
      const backfilled = e.backfilled === true;
      const beforeKcal = backfilled ? null : (e.before?.calorieTarget ?? null);
      const afterKcal = backfilled ? null : (e.after?.calorieTarget ?? null);
      return {
        id: e.id,
        date: e.date,
        dateText: e.date.slice(0, 4) === year ? formatDayMonth(e.date) : `${formatDayMonth(e.date)} ${e.date.slice(0, 4)}`,
        beforeKcal,
        afterKcal,
        targetText: backfilled ? null : targetText(beforeKcal, afterKcal),
        cause: backfilled ? PLAN_HISTORY_MESSAGE.backfilled : PLAN_HISTORY_MESSAGE.cause[e.rule as PlanHistoryRule],
        details: backfilled ? [] : detailsOf(e),
        backfilled,
      };
    });
}
