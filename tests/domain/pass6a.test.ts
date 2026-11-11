/**
 * Prompt 6a (report 49): the tracking pauses and the life cycle of the recalibration. One block per point.
 * Point 1: complete export (format 2, diagnostics), activity log and full trace of the plan changes (schema 11).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADHERENCE_NOTED_TEXT } from '@/app/copy';
import { activityDiff, activityEntry, ACTIVITY_LOG_MAX_ENTRIES, appendActivity, calibrationSummary, lastActivity, sameData } from '@/domain/activityLog';
import { buildDiagnostics, constantsDump } from '@/domain/diagnostics';
import {
  addWeight,
  applyRecalibration,
  applyRecalibrationAsMaintenance,
  completeOnboarding,
  computeCalibrationState,
  deleteWeight,
  hasAppliedRecalibration,
  latestAppliedSnapshot,
  markPlanEventSeen,
  setActualSteps,
  setAdherence,
  unseenPlanMessages,
} from '@/domain/engine';
import type { CalibrationState } from '@/domain/engine';
import { addFoodEntry } from '@/domain/journal';
import { adherenceFromJournal, applyPathSliderSteps, changeGoalOnPath, suggestedAdherence, updateProfileOnPath } from '@/domain/journalPath';
import { planNotices, runDailyChecks } from '@/domain/planSafety';
import { RULES_6A } from '@/domain/ruleSwitches';
import { analysisView, todayStatusTitle, trackingChart } from '@/domain/views';
import type { PlanEvent, WheightyStore } from '@/domain/types';
import { emptyActivityLog, PLAN_CHANGE_RULES, SCHEMA_VERSION } from '@/domain/types';
import { EXPORT_FORMAT_VERSION, exportFileName, exportStore, parseImport } from '@/persistence/exportImport';
import { backfillRecalibrations, migrateToCurrent } from '@/persistence/migrations';
import { emptyStore, validateStore } from '@/persistence/schema';
import { CONSTANT_METADATA, SCIENTIFIC_MODEL_VERSION } from '@/science/constants';
import { addDays } from '@/science/dates';
import type { UserProfile } from '@/science/types';
import { makeProfile } from '../helpers/profiles';

const D0 = '2026-06-01';
const at = (date: string) => `${date}T08:00:00.000Z`;
const PROFILE: UserProfile = makeProfile({ sexForEquation: 'male', ageYears: 40, heightCm: 180, currentWeightKg: 92, goal: 'loss', targetWeightKg: 82, weeklyRateTarget: 0.005 });

function onboard(profile: UserProfile = PROFILE, date = D0): WheightyStore {
  const r = completeOnboarding(emptyStore(), profile, date, at(date));
  if (!r.ok) throw new Error(r.reason);
  return r.store;
}

/** Daily weigh-ins from D0 + 1 for `days` days, every day noted "plan respecté". */
function tracked(days: number, store = onboard()): WheightyStore {
  let s = store;
  for (let i = 1; i <= days; i++) s = addWeight(s, { date: addDays(D0, i), weightKg: 92 - 0.06 * i }, at(addDays(D0, i)));
  for (let d = 0; d <= days; d++) s = setAdherence(s, addDays(D0, d), 'on_plan');
  return s;
}

function stateOn(store: WheightyStore, day: string): CalibrationState {
  const state = computeCalibrationState(store, day, at(day));
  if (!state) throw new Error('no state');
  return state;
}

function recalibrated(days = 21): { store: WheightyStore; day: string } {
  const s = tracked(days);
  const day = addDays(D0, days);
  const r = applyRecalibration(s, stateOn(s, day), day, at(day));
  if (!r.ok) throw new Error(r.reason);
  return { store: r.store, day };
}

describe('1a. export, format 2', () => {
  it('envelope: app, device, the whole store, diagnostics; the file name carries the local time', () => {
    const { store, day } = recalibrated();
    const text = exportStore(store, at(day), {
      app: { build: { commit: 'abc1234', date: '2026-11-11T10:00:00.000Z' }, scientificModelVersion: SCIENTIFIC_MODEL_VERSION, schemaVersion: SCHEMA_VERSION },
      device: { timeZone: 'Europe/Paris', utcOffsetMinutes: 60, language: 'fr-FR', userAgent: 'test', displayMode: 'standalone' },
      diagnostics: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
    });
    const json = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(json)).toEqual(['format', 'formatVersion', 'exportedAt', 'app', 'device', 'store', 'diagnostics']);
    expect(json.formatVersion).toBe(2);
    expect(EXPORT_FORMAT_VERSION).toBe(2);
    // Non-finite numbers of the diagnostics are kept apart, as in the captures R and S.
    expect(json.diagnostics).toEqual({ x: 'NaN', y: '+Infinity' });
    expect(exportFileName('2026-10-24', '23:44')).toBe('wheighty-2026-10-24-2344.json');
    expect(exportFileName('2026-10-24', '2344')).toBe('wheighty-2026-10-24-2344.json');
  });

  it('import reads formats 1 and 2, ignores the diagnostics; export, import, export again: the same store', () => {
    const { store, day } = recalibrated();
    const v2 = exportStore(store, at(day), { diagnostics: { broken: true } });
    const a = parseImport(v2);
    if (!a.ok) throw new Error(a.error);
    expect(a.store).toEqual({ ...store, preferences: { ...store.preferences, productSearchEnabled: false } });
    const b = parseImport(exportStore(a.store, at(day)));
    if (!b.ok) throw new Error(b.error);
    expect(b.store).toEqual(a.store);
    const v1 = JSON.stringify({ format: 'wheighty-export', formatVersion: 1, exportedAt: at(day), store: { ...store, schemaVersion: 10 } });
    const c = parseImport(v1);
    expect(c.ok).toBe(true);
  });
});

describe('1b. diagnostics', () => {
  it('every block is there, with the code in service; the constants with their label', () => {
    const { store, day } = recalibrated();
    const d = buildDiagnostics(store, day, at(day));
    for (const key of ['today', 'at', 'gate', 'calibration', 'modeledBody', 'fitDays', 'journal', 'trend', 'periodic', 'guardrails', 'journalPath', 'chart', 'screens', 'constants']) expect(d).toHaveProperty(key);
    const json = JSON.stringify(d);
    expect(json).not.toMatch(/"error":/);
    const constants = constantsDump();
    for (const name of Object.keys(CONSTANT_METADATA)) expect(constants[name]?.category).toBe(CONSTANT_METADATA[name]?.category);
    expect(constants.SCIENTIFIC_MODEL_VERSION?.value).toBe(SCIENTIFIC_MODEL_VERSION);
    const screens = d.screens as Record<string, unknown>;
    expect(Object.keys(screens)).toEqual(['today', 'plan', 'suivi', 'analyse', 'profil']);
    expect((d.modeledBody as { modeledWeightKg: number }).modeledWeightKg).toBeGreaterThan(80);
  });

  it('a block that fails writes its message; the others are still computed', () => {
    const { store, day } = recalibrated();
    const throwing = new Proxy({} as CalibrationState, {
      get: () => {
        throw new Error('boom');
      },
      has: () => true,
    });
    const d = buildDiagnostics(store, day, at(day), throwing);
    expect(JSON.stringify(d.calibration)).toMatch(/boom/);
    expect(Array.isArray(d.fitDays)).toBe(true);
    expect((d.trend as { points: number }).points).toBe(store.weights.length);
  });
});

describe('1c. activity log', () => {
  it('capped: the oldest leave first, and are counted', () => {
    const s = onboard();
    const now = new Date('2026-06-02T08:00:00.000Z');
    const many = Array.from({ length: 7 }, (_, i) => activityEntry('screen', { i }, now));
    const a = appendActivity(s, many, 5);
    expect(a.activityLog.entries.map((e) => e.data.i)).toEqual([2, 3, 4, 5, 6]);
    expect(a.activityLog.droppedCount).toBe(2);
    const b = appendActivity(a, [activityEntry('screen', { i: 7 }, now)], 5);
    expect(b.activityLog.entries.map((e) => e.data.i)).toEqual([3, 4, 5, 6, 7]);
    expect(b.activityLog.droppedCount).toBe(3);
    expect(appendActivity(b, [])).toBe(b);
    expect(ACTIVITY_LOG_MAX_ENTRIES).toBe(5000);
  });

  it('what the user changed: weigh-ins (before and after), adherence with its source and previous value, steps, food by id and kcal, closed messages, settings', () => {
    const now = new Date('2026-06-03T08:00:00.000Z');
    const s0 = tracked(2);
    const s1 = addWeight(s0, { date: addDays(D0, 3), weightKg: 91.5 }, at(addDays(D0, 3)));
    const added = activityDiff(s0, s1, 'user', now);
    expect(added.map((e) => [e.type, e.data.action, e.data.by])).toEqual([['weight', 'add', 'user']]);
    expect(added[0]?.data.after).toEqual({ date: addDays(D0, 3), weightKg: 91.5 });
    const id = s1.weights.at(-1)?.id as string;
    const s2 = { ...s1, weights: s1.weights.map((w) => (w.id === id ? { ...w, weightKg: 91.7 } : w)) };
    expect(activityDiff(s1, s2, 'user', now).map((e) => [e.type, e.data.action, (e.data.before as { weightKg: number }).weightKg, (e.data.after as { weightKg: number }).weightKg])).toEqual([['weight', 'edit', 91.5, 91.7]]);
    expect(activityDiff(s2, deleteWeight(s2, id), 'user', now).map((e) => [e.type, e.data.action])).toEqual([['weight', 'delete']]);
    const s3 = setAdherence(s2, addDays(D0, 1), 'minor_deviation');
    expect(activityDiff(s2, s3, 'user', now).map((e) => e.data)).toEqual([{ date: addDays(D0, 1), value: 'minor_deviation', source: 'user', previous: { value: 'on_plan', source: 'user' }, by: 'user' }]);
    const s4 = setActualSteps(s3, addDays(D0, 1), 8000);
    expect(activityDiff(s3, s4, 'user', now).map((e) => [e.type, e.data.value, e.data.previous])).toEqual([['steps', 8000, null]]);
    const r = addFoodEntry(s4, { kind: 'manual', date: addDays(D0, 2), localTime: '12:31', consumedTime: '12:30', food: { name: 'Plat secret', grams: null, intake: { energyKcal: 640, proteinG: null, carbsG: null, fatG: null } } }, at(addDays(D0, 2)));
    if (!r.ok) throw new Error(r.reason);
    const food = activityDiff(s4, r.store, 'user', now);
    expect(food.map((e) => [e.type, e.data.action, e.data.kcal, e.data.date])).toEqual([['food', 'add', 640, addDays(D0, 2)]]);
    expect(JSON.stringify(food)).not.toMatch(/secret/);
    const s5 = { ...s4, preferences: { ...s4.preferences, units: 'imperial' as const } };
    expect(activityDiff(s4, s5, 'user', now).map((e) => e.data)).toEqual([{ key: 'units', before: 'metric', after: 'imperial', by: 'user' }]);
  });

  it('a message closed, and the trace entries written; the daily checks as one summary entry', () => {
    const now = new Date('2026-06-03T08:00:00.000Z');
    const s = onboard();
    const withEvent: WheightyStore = { ...s, meta: { ...s.meta, planEvents: [...s.meta.planEvents, { id: 'e-1-a', date: D0, rule: 'underweight_bmi', status: 'applied', before: null, after: null, message: 'x', seen: false }] } };
    expect(activityDiff(s, withEvent, 'user', now).map((e) => [e.type, e.data.rule])).toEqual([['plan_event', 'underweight_bmi']]);
    expect(activityDiff(withEvent, markPlanEventSeen(withEvent, 'e-1-a'), 'user', now).map((e) => [e.type, e.data.action, e.data.rule])).toEqual([['message', 'closed', 'underweight_bmi']]);
    const deduced = setAdherence(withEvent, D0, 'on_plan', 'journal');
    const daily = activityDiff(withEvent, deduced, 'daily_checks', now);
    expect(daily.map((e) => e.type)).toEqual(['daily_checks']);
    expect(daily[0]?.data.deducedAdherence).toEqual([{ date: D0, value: 'on_plan', source: 'journal' }]);
    expect(activityDiff(s, s, 'user', now)).toEqual([]);
  });

  it('a calibration result is one entry per summary: the same result twice is one entry', () => {
    const { store, day } = recalibrated();
    const state = stateOn(store, day);
    const summary = calibrationSummary(state);
    expect(summary).toMatchObject({ gate: { met: true }, surfaced: false });
    expect(sameData(summary, calibrationSummary(stateOn(store, day)))).toBe(true);
    const logged = appendActivity(store, [activityEntry('calibration', summary, new Date())]);
    expect(lastActivity(logged, 'calibration')?.data).toEqual(summary);
    expect(lastActivity(logged, 'export')).toBeNull();
  });

  it('the store carries its log: saved, validated and exported with it; the engine never reads it', () => {
    const s = appendActivity(onboard(), [activityEntry('app_open', { reason: 'start', build: 'dev' }, new Date('2026-06-01T08:00:00.000Z'))]);
    const v = validateStore(JSON.parse(JSON.stringify(s)));
    if ('error' in v) throw new Error(v.error);
    expect(v.clean).toBe(true);
    expect(v.store.activityLog).toEqual(s.activityLog);
    const bad = validateStore(JSON.parse(JSON.stringify({ ...s, activityLog: { entries: [{ at: 'x', date: 'nope', type: 'app_open', data: {} }], droppedCount: 0 } })));
    if ('error' in bad) throw new Error(bad.error);
    expect(bad.dropped.map((d) => d.path)).toEqual(['activityLog.entries.0']);
    // Same calibration with and without a log.
    const day = addDays(D0, 21);
    const t = tracked(21);
    const withLog = appendActivity(t, Array.from({ length: 50 }, (_, i) => activityEntry('screen', { i }, new Date())));
    expect(computeCalibrationState(withLog, day, at(day))?.candidate).toEqual(computeCalibrationState(t, day, at(day))?.candidate);
  });
});

describe('1d. full trace of the plan changes, without a message', () => {
  const noMessage = (e: PlanEvent | undefined) => expect(e).toMatchObject({ message: null, seen: true, status: 'applied' });

  it('the first plan, a recalibration (plans, maintenances and intervals before and after, the calibration applied)', () => {
    const s = tracked(21);
    expect(s.meta.planEvents.map((e) => e.rule)).toEqual(['onboarding']);
    noMessage(s.meta.planEvents[0]);
    expect(s.meta.planEvents[0]?.before).toBeNull();
    expect(s.meta.planEvents[0]?.after?.calorieTarget).toBe(onboard().plan?.calorieTarget);
    const day = addDays(D0, 21);
    const state = stateOn(s, day);
    const r = applyRecalibration(s, state, day, at(day));
    if (!r.ok) throw new Error(r.reason);
    const e = r.store.meta.planEvents.at(-1);
    noMessage(e);
    expect(e?.rule).toBe('recalibration');
    expect(e?.before?.calorieTarget).toBe(s.plan?.calorieTarget);
    expect(e?.after?.calorieTarget).toBe(r.store.plan?.calorieTarget);
    expect(e?.maintenance).toEqual({ before: s.plan?.maintenanceKcal, after: r.store.plan?.maintenanceKcal, interval80Before: s.plan?.maintenanceInterval80, interval80After: r.store.plan?.maintenanceInterval80 });
    expect(e?.calibration).toMatchObject({ offsetKcal: state.candidate?.posteriorMedianOffsetKcal, interval80: state.candidate?.interval80, appliedAt: at(day) });
    const m = applyRecalibrationAsMaintenance(s, state, day, at(day));
    if (!m.ok) throw new Error(m.reason);
    expect(m.store.meta.planEvents.map((x) => x.rule)).toEqual(['onboarding', 'recalibration_maintenance']);
    expect(m.store.meta.planEvents.at(-1)?.after?.goal).toBe('maintenance');
  });

  it('goal, rate, slider and profile changed by the user; a failed change leaves nothing; nothing new is shown', () => {
    const s = onboard();
    const goal = changeGoalOnPath(s, D0, { goal: 'loss', targetWeightKg: 82, weeklyRate: 0.004 });
    if (!goal.ok) throw new Error(goal.reason);
    expect(goal.store.meta.planEvents.map((e) => e.rule)).toEqual(['onboarding', 'user_goal']);
    expect(goal.store.meta.planEvents.at(-1)?.after?.weeklyRateTarget).toBe(goal.store.plan?.weeklyRateTarget);
    const slider = applyPathSliderSteps(goal.store, D0, 9000);
    if (!slider.ok) throw new Error(slider.reason);
    expect(slider.store.meta.planEvents.at(-1)).toMatchObject({ rule: 'user_slider', after: { stepTarget: 9000 } });
    const profile = updateProfileOnPath(slider.store, D0, { ...PROFILE, ageYears: 41 });
    if (!profile.ok) throw new Error(profile.reason);
    expect(profile.store.meta.planEvents.at(-1)?.rule).toBe('user_profile');
    for (const e of profile.store.meta.planEvents) noMessage(e);
    expect(unseenPlanMessages(profile.store)).toEqual([]);
    expect(planNotices(profile.store.meta.planEvents, null)).toEqual([]);
    const failed = updateProfileOnPath(slider.store, D0, { ...PROFILE, ageYears: 5 });
    expect(failed.ok).toBe(false);
  });
});

describe('1e. migration 10 -> 11, without loss', () => {
  it('empty log; one backfilled entry per applied snapshot from the weigh-ins, after the entries of its day; unknown fields at null', () => {
    const { store } = recalibrated();
    const events10 = store.meta.planEvents.filter((e) => !(PLAN_CHANGE_RULES as readonly string[]).includes(e.rule));
    const later: PlanEvent = { id: 'e-9-late', date: addDays(D0, 40), rule: 'underweight_bmi', status: 'applied', before: null, after: null, message: 'x', seen: true };
    const sameDay: PlanEvent = { id: 'e-9-same', date: addDays(D0, 21), rule: 'periodic_replan', status: 'applied', before: null, after: null, message: null, seen: true };
    const { activityLog: _log, ...rest } = store;
    const raw = JSON.parse(JSON.stringify({ ...rest, schemaVersion: 10, meta: { ...store.meta, planEvents: [...events10, sameDay, later] } })) as Record<string, unknown>;
    const m = migrateToCurrent(raw, undefined, undefined, { nowIso: at(addDays(D0, 41)) });
    if (!m.ok) throw new Error(m.error);
    const v = validateStore(m.value);
    if ('error' in v) throw new Error(v.error);
    expect(v.clean).toBe(true);
    expect(v.store.activityLog).toEqual(emptyActivityLog());
    expect(v.store.meta.planEvents.map((e) => e.id)).toEqual(['e-9-same', expect.stringMatching(/backfill$/), 'e-9-late']);
    const b = v.store.meta.planEvents[1];
    const snapshot = store.calibrationSnapshots.find((x) => x.appliedAt && x.source !== 'warm_start');
    expect(b).toMatchObject({ rule: 'recalibration', backfilled: true, before: null, after: null, message: null, seen: true, maintenance: { before: null, after: null, interval80Before: null, interval80After: null } });
    expect(b?.calibration).toEqual({ offsetKcal: snapshot?.posteriorMedianOffsetKcal, interval80: snapshot?.interval80, interval95: snapshot?.interval95, confidence: snapshot?.confidence, createdAt: snapshot?.createdAt, appliedAt: snapshot?.appliedAt });
    // Nothing else changes.
    for (const k of ['profile', 'plan', 'weights', 'dailyLogs', 'calibrationSnapshots', 'historicalEvidence', 'foodJournal', 'preferences'] as const) expect(v.store[k]).toEqual(JSON.parse(JSON.stringify(store[k])));
    expect({ ...v.store.meta, planEvents: null }).toEqual({ ...JSON.parse(JSON.stringify(store.meta)), planEvents: null });
  });

  it('no entry for the warm start, for a snapshot not applied, nor for a takeover of a personal target already traced', () => {
    const snaps = [
      { source: 'warm_start', appliedAt: '2026-06-01T08:00:00.000Z', posteriorMedianOffsetKcal: 1, interval80: [0, 1], interval95: [0, 1], createdAt: 'x', confidence: 'low' },
      { appliedAt: undefined, posteriorMedianOffsetKcal: 1, interval80: [0, 1], interval95: [0, 1], createdAt: 'x', confidence: 'low' },
      { appliedAt: '2026-06-22T08:00:00.000Z', posteriorMedianOffsetKcal: 1, interval80: [0, 1], interval95: [0, 1], createdAt: 'x', confidence: 'low' },
    ];
    const takeover = { id: 'e-t', date: '2026-06-22', rule: 'personal_target_takeover', status: 'applied' };
    expect(backfillRecalibrations([takeover], snaps)).toEqual([takeover]);
    expect(backfillRecalibrations([], snaps)).toHaveLength(1);
  });

  it('a schema-7 store (pass 5a, as in report 47) loads without loss up to schema 11', () => {
    const { store } = recalibrated();
    const { journalPath: _p, ...meta7 } = store.meta;
    const { activityLog: _l, ...rest } = store;
    const logs7 = store.dailyLogs.map(({ adherenceSource: _s, ...l }) => l);
    const events7 = store.meta.planEvents.filter((e) => !(PLAN_CHANGE_RULES as readonly string[]).includes(e.rule));
    const raw7 = JSON.parse(JSON.stringify({ ...rest, schemaVersion: 7, dailyLogs: logs7, meta: { ...meta7, planEvents: events7 } })) as Record<string, unknown>;
    const m = migrateToCurrent(raw7, undefined, undefined, { nowIso: at(addDays(D0, 30)) });
    if (!m.ok) throw new Error(m.error);
    const v = validateStore(m.value);
    if ('error' in v) throw new Error(v.error);
    expect(v.clean).toBe(true);
    expect(v.store.schemaVersion).toBe(11);
    for (const k of ['profile', 'plan', 'weights', 'calibrationSnapshots', 'historicalEvidence', 'foodJournal', 'preferences'] as const) expect(v.store[k]).toEqual(JSON.parse(JSON.stringify(store[k])));
    expect(v.store.dailyLogs).toEqual(JSON.parse(JSON.stringify(store.dailyLogs)));
    expect(v.store.meta.planEvents.map((e) => e.rule)).toEqual(['recalibration']);
  });
});

describe('2. the recalibrated state no longer depends on the gate of the day (D2)', () => {
  /** Recalibrated on day 21, then 30 days of weigh-ins without any adherence noted: the gate of the day closes (coverage). */
  function closedAfterRecalibration(): { store: WheightyStore; day: string; state: CalibrationState } {
    let { store } = recalibrated();
    for (let i = 22; i <= 52; i++) store = addWeight(store, { date: addDays(D0, i), weightKg: 92 - 0.06 * i }, at(addDays(D0, i)));
    const day = addDays(D0, 52);
    return { store, day, state: stateOn(store, day) };
  }
  const withoutApplied = (s: WheightyStore): WheightyStore => ({ ...s, calibrationSnapshots: s.calibrationSnapshots.filter((x) => !x.appliedAt || x.source === 'warm_start') });

  it('hasAppliedRecalibration: an applied snapshot from the weigh-ins; not the warm start, not a candidate', () => {
    expect(hasAppliedRecalibration(tracked(21))).toBe(false);
    expect(hasAppliedRecalibration(recalibrated().store)).toBe(true);
    const warm = onboard(PROFILE);
    const withWarm: WheightyStore = { ...warm, calibrationSnapshots: [{ ...(recalibrated().store.calibrationSnapshots.at(-1) as NonNullable<WheightyStore['calibrationSnapshots'][number]>), source: 'warm_start' }] };
    expect(hasAppliedRecalibration(withWarm)).toBe(false);
  });

  it('Analyse: the calibrated layout with the gate closed, the estimate applied and its confidence, and the block towards the next update', () => {
    const { store, state } = closedAfterRecalibration();
    expect(state.gate.met).toBe(false);
    const v = analysisView(store, state);
    expect(v?.calibrated).toBe(true);
    expect(v?.maintenanceKcal).toBe(store.plan?.maintenanceKcal);
    expect(v?.confidence).toBe(latestAppliedSnapshot(store)?.confidence);
    expect(v?.nextUpdate?.criteria.find((c) => c.key === 'adherence')?.met).toBe(false);
    // Without the applied recalibration, the same store is back to "J'observe encore".
    const before = analysisView(withoutApplied(store), stateOn(withoutApplied(store), addDays(D0, 52)));
    expect(before?.calibrated).toBe(false);
    expect(before?.nextUpdate).toBeNull();
    // Gate open: the calibrated layout as before, without the block.
    const open = recalibrated();
    expect(analysisView(open.store, stateOn(open.store, open.day))?.nextUpdate).toBeNull();
  });

  it('Suivi keeps drawing the projection; Aujourd\'hui and the sheet speak of the next update', () => {
    const { store, day, state } = closedAfterRecalibration();
    const chart = trackingChart(store, day, null, state);
    expect(chart?.projectionPending).toBe(false);
    expect(chart?.projection.length).toBeGreaterThan(0);
    const bare = withoutApplied(store);
    const chartBefore = trackingChart(bare, day, null, stateOn(bare, day));
    expect(chartBefore?.projectionPending).toBe(true);
    expect(chartBefore?.projection).toEqual([]);
    expect(todayStatusTitle(store, day, state, false)).toBe('Note tes journées pour débloquer la prochaine mise à jour.');
    expect(todayStatusTitle(bare, day, stateOn(bare, day), false)).toBe('Note tes journées pour débloquer la première mise à jour.');
    expect(ADHERENCE_NOTED_TEXT.nextAdjustment(50)).toMatch(/prochaine mise à jour/);
    expect(readFileSync('src/screens/WhySheet.tsx', 'utf8')).toMatch(/hasAppliedRecalibration\(store\) \? ADHERENCE_NOTED_TEXT\.nextAdjustment/);
  });

  it('before any recalibration, with or without a warm start: nothing changes', () => {
    const s = tracked(10);
    const day = addDays(D0, 10);
    const state = stateOn(s, day);
    expect(analysisView(s, state)).toMatchObject({ calibrated: false, nextUpdate: null });
    expect(trackingChart(s, day, null, state)?.projectionPending).toBe(true);
    expect(todayStatusTitle(s, day, state, false)).toMatch(/première mise à jour/);
  });
});

describe('3. no major deviation deduced under the target (D6), model 1.9.0', () => {
  /** Maintenance at 2 000 kcal a day; day i logged with `kcal(i)` in one entry (null: not logged). */
  const logged = (kcal: (i: number) => number | null, to: number): WheightyStore => {
    const s0 = onboard(makeProfile({ goal: 'maintenance' }));
    let s: WheightyStore = { ...s0, dailyLogs: s0.dailyLogs.map((l) => ({ ...l, calorieTargetForDay: 2000 })) };
    for (let i = 0; i <= to; i++) {
      s = { ...s, dailyLogs: [...s.dailyLogs.filter((l) => l.date !== addDays(D0, i)), { date: addDays(D0, i), calorieTargetForDay: 2000, stepTargetForDay: 7000 }].sort((a, b) => (a.date < b.date ? -1 : 1)) };
      const k = kcal(i);
      if (k === null) continue;
      const r = addFoodEntry(s, { kind: 'manual', date: addDays(D0, i), localTime: '12:00', consumedTime: '12:00', food: { name: 'x', grams: null, intake: { energyKcal: k, proteinG: null, carbsG: null, fatG: null } } }, at(addDays(D0, i)));
      if (!r.ok) throw new Error(r.reason);
      s = r.store;
    }
    return s;
  };

  it('the category: under 10 %, 10 to 25 %, beyond 25 % above (major); beyond 25 % under: nothing', () => {
    expect([1810, 2190, 1800, 2200, 1500, 2500, 2510].map((k) => adherenceFromJournal(k, 2000))).toEqual(['on_plan', 'on_plan', 'minor_deviation', 'minor_deviation', 'minor_deviation', 'minor_deviation', 'major_deviation']);
    expect([1490, 800, 0].map((k) => adherenceFromJournal(k, 2000))).toEqual([null, null, null]);
    expect(SCIENTIFIC_MODEL_VERSION).toBe('1.9.0');
  });

  it('nothing written at the day change, nothing suggested on the tile; the user can still note the day; a stored one is never rewritten', () => {
    const totals = [1490, 2510, 1800, 600];
    const s = logged((i) => totals[i] ?? null, totals.length - 1);
    const day = addDays(D0, totals.length);
    const after = runDailyChecks(s, day, at(day));
    const of = (st: WheightyStore, i: number) => st.dailyLogs.find((l) => l.date === addDays(D0, i));
    expect(totals.map((_, i) => of(after, i)?.adherence)).toEqual([undefined, 'major_deviation', 'minor_deviation', undefined]);
    expect(suggestedAdherence(s, D0)).toBeNull();
    expect(suggestedAdherence(s, addDays(D0, 1))?.value).toBe('major_deviation');
    const noted = setAdherence(after, D0, 'major_deviation');
    expect(of(noted, 0)).toMatchObject({ adherence: 'major_deviation', adherenceSource: 'user' });
    // An adherence already deduced (before 1.9.0) stays as it is.
    const old = setAdherence(s, addDays(D0, 3), 'major_deviation', 'journal');
    expect(of(runDailyChecks(old, day, at(day)), 3)).toMatchObject({ adherence: 'major_deviation', adherenceSource: 'journal' });
  });

  it('the switch reserved to the tests gives back the rule of 03/10', () => {
    RULES_6A.d6 = false;
    try {
      expect(adherenceFromJournal(1490, 2000)).toBe('major_deviation');
    } finally {
      RULES_6A.d6 = true;
    }
    expect(adherenceFromJournal(1490, 2000)).toBeNull();
  });
});
