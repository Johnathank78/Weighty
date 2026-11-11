/**
 * Activity log (schema 11, report 49, point 1c): what the app did and what the user did, to rebuild what happened and what
 * was seen. Never read by the engine, the calibration or the plan. Pure functions: the store provider writes the entries.
 *
 * Most entries come from the difference between two stores (`activityDiff`): weigh-ins, adherence, steps, food entries,
 * trace entries, closed messages, settings. The others are written where they happen (opening, daily checks, calibration,
 * recalibration screen, messages shown, decision screens, import, export).
 */
import { localIsoDate } from '@/science/dates';
import type { CalibrationState } from './engine';
import type { ActivityEntry, ActivityType, PlanEvent, PlanSummary, WheightyStore } from './types';

/** Entries kept at most; the oldest leave first (`droppedCount`). Not a scientific constant: never read by the engine. */
export const ACTIVITY_LOG_MAX_ENTRIES = 5000;

/** Who caused a change of the store. */
export type ActivityCause = 'user' | 'daily_checks' | 'calibration' | 'journal_week' | 'import';

export function activityEntry(type: ActivityType, data: Record<string, unknown>, now: Date): ActivityEntry {
  return { at: now.toISOString(), date: localIsoDate(now), type, data };
}

/** Appends entries, oldest out first beyond the cap. The same store when there is nothing to add. */
export function appendActivity(store: WheightyStore, entries: readonly ActivityEntry[], max = ACTIVITY_LOG_MAX_ENTRIES): WheightyStore {
  if (entries.length === 0) return store;
  const all = [...store.activityLog.entries, ...entries];
  const excess = Math.max(0, all.length - max);
  return { ...store, activityLog: { entries: excess > 0 ? all.slice(excess) : all, droppedCount: store.activityLog.droppedCount + excess } };
}

/** What the log keeps of a plan: enough to follow the target, without the projection. */
export function planBrief(p: PlanSummary | null | undefined): Record<string, unknown> | null {
  return p ? { source: p.source, goal: p.goal, calorieTarget: p.calorieTarget, stepTarget: p.stepTarget, weeklyRateTarget: p.weeklyRateTarget, maintenanceKcal: p.maintenanceKcal, createdAt: p.createdAt } : null;
}

function eventBrief(e: PlanEvent): Record<string, unknown> {
  return { id: e.id, rule: e.rule, status: e.status, ...(e.reason !== undefined ? { reason: e.reason } : {}), before: planBrief(e.before), after: planBrief(e.after), message: e.message !== null };
}

/**
 * Entries describing what changed between two stores. `cause` 'user': one entry per change; 'daily_checks': one summary
 * entry (days whose adherence was deduced, trace entries written), plus the user-level entries nobody else writes; other
 * causes: the trace entries written. Food entries are logged by identifier, day and kcal, never by name.
 */
export function activityDiff(before: WheightyStore, after: WheightyStore, cause: ActivityCause, now: Date): ActivityEntry[] {
  if (before === after) return [];
  const out: ActivityEntry[] = [];
  const add = (type: ActivityType, data: Record<string, unknown>) => out.push(activityEntry(type, { ...data, by: cause }, now));

  // Trace entries written, and messages closed.
  const known = new Map(before.meta.planEvents.map((e) => [e.id, e]));
  const written = after.meta.planEvents.filter((e) => !known.has(e.id));
  const closed = after.meta.planEvents.filter((e) => e.seen && known.get(e.id)?.seen === false);

  // Declared adherence (user or journal).
  const logsBefore = new Map(before.dailyLogs.map((l) => [l.date, l]));
  const adherence: Array<Record<string, unknown>> = [];
  const steps: Array<Record<string, unknown>> = [];
  if (before.dailyLogs !== after.dailyLogs) {
    for (const l of after.dailyLogs) {
      const b = logsBefore.get(l.date);
      if ((b?.adherence ?? null) !== (l.adherence ?? null) || (b?.adherenceSource ?? null) !== (l.adherenceSource ?? null)) {
        adherence.push({ date: l.date, value: l.adherence ?? null, source: l.adherenceSource ?? null, previous: b?.adherence ? { value: b.adherence, source: b.adherenceSource ?? null } : null });
      }
      if ((b?.actualSteps ?? null) !== (l.actualSteps ?? null)) steps.push({ date: l.date, value: l.actualSteps ?? null, previous: b?.actualSteps ?? null });
    }
  }

  if (cause === 'daily_checks') {
    if (adherence.length > 0 || written.length > 0) {
      add('daily_checks', { deducedAdherence: adherence.map((a) => ({ date: a.date, value: a.value, source: a.source })), planEvents: written.map(eventBrief) });
    }
  } else {
    for (const e of written) add('plan_event', eventBrief(e));
    for (const a of adherence) add('adherence', a);
  }
  for (const s of steps) add('steps', s);
  for (const e of closed) add('message', { action: 'closed', eventId: e.id, rule: e.rule });
  // The message asking for a weigh-in (report 49, point 4) is closed for the day.
  if (after.meta.staleWeighInNoticeClosedOn !== before.meta.staleWeighInNoticeClosedOn && after.meta.staleWeighInNoticeClosedOn !== null) add('message', { action: 'closed', kind: 'weigh_in', date: after.meta.staleWeighInNoticeClosedOn });

  // Weigh-ins, by identifier.
  if (before.weights !== after.weights) {
    const wb = new Map(before.weights.map((w) => [w.id, w]));
    const wa = new Map(after.weights.map((w) => [w.id, w]));
    const brief = (w: { date: string; weightKg: number; menstruating?: boolean }) => ({ date: w.date, weightKg: w.weightKg, ...(w.menstruating ? { menstruating: true } : {}) });
    for (const w of after.weights) {
      const b = wb.get(w.id);
      if (!b) add('weight', { action: 'add', id: w.id, before: null, after: brief(w) });
      else if (b.date !== w.date || b.weightKg !== w.weightKg || Boolean(b.menstruating) !== Boolean(w.menstruating)) add('weight', { action: 'edit', id: w.id, before: brief(b), after: brief(w) });
    }
    for (const b of before.weights) if (!wa.has(b.id)) add('weight', { action: 'delete', id: b.id, before: brief(b), after: null });
  }

  // Food entries, by identifier (no name).
  if (before.foodJournal.entries !== after.foodJournal.entries) {
    const fb = new Map(before.foodJournal.entries.map((e) => [e.id, e]));
    const fa = new Set(after.foodJournal.entries.map((e) => e.id));
    for (const e of after.foodJournal.entries) {
      const b = fb.get(e.id);
      if (!b) add('food', { action: 'add', id: e.id, date: e.date, kcal: e.intake.energyKcal, consumedTime: e.consumedTime });
      else if (b.date !== e.date || b.intake.energyKcal !== e.intake.energyKcal || b.consumedTime !== e.consumedTime) {
        add('food', { action: 'edit', id: e.id, date: e.date, kcal: e.intake.energyKcal, consumedTime: e.consumedTime, previous: { date: b.date, kcal: b.intake.energyKcal, consumedTime: b.consumedTime } });
      }
    }
    for (const b of before.foodJournal.entries) if (!fa.has(b.id)) add('food', { action: 'delete', id: b.id, date: b.date, kcal: b.intake.energyKcal });
  }

  // Settings.
  if (before.preferences !== after.preferences) {
    for (const key of Object.keys(after.preferences) as Array<keyof typeof after.preferences>) {
      if (before.preferences[key] !== after.preferences[key]) add('setting', { key, before: before.preferences[key], after: after.preferences[key] });
    }
  }
  return out;
}

/**
 * What the log keeps of a calibration result (report 49, point 1c): the gate (criteria, counted period), whether a
 * recalibration is shown, and the candidate. Two results with the same summary are one entry.
 */
export function calibrationSummary(state: CalibrationState | null): Record<string, unknown> {
  if (!state) return { state: null };
  const g = state.gate;
  const round = (x: number, digits: number) => Math.round(x * 10 ** digits) / 10 ** digits;
  return {
    gate: {
      met: g.met,
      weighInCount: g.weighInCount,
      spanDays: g.spanDays,
      cleanWeighInCount: g.cleanWeighInCount,
      adherenceCoverage: round(g.adherenceCoverage, 4),
      periodStart: g.periodStart,
      pauses: g.pauses,
    },
    surfaced: state.surfaced,
    blockedByStaleWeighIn: state.blockedByStaleWeighIn,
    candidate: state.candidate
      ? { medianOffsetKcal: round(state.candidate.posteriorMedianOffsetKcal, 1), interval80: state.candidate.interval80.map((x) => round(x, 1)), confidence: state.candidate.confidence, proposedMaintenanceKcal: state.proposedMaintenanceKcal === null ? null : round(state.proposedMaintenanceKcal, 1) }
      : null,
  };
}

/** The last entry of a kind, null when none. */
export function lastActivity(store: WheightyStore, type: ActivityType): ActivityEntry | null {
  const entries = store.activityLog.entries;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e && e.type === type) return e;
  }
  return null;
}

/** Same JSON (key order included). */
export function sameData(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
