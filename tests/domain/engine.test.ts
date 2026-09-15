import { describe, expect, it } from 'vitest';
import {
  addWeight,
  applyRecalibration,
  applySliderSteps,
  changeGoal,
  completeOnboarding,
  computeCalibrationState,
  createSliderSession,
  ensureDailyLogs,
  goalStatus,
  markRecalibrationSeen,
  setActualSteps,
  setAdherence,
} from '@/domain/engine';
import { formatKcal, formatSignedWeight, formatSteps, formatWeight, MINUS } from '@/domain/format';
import { emptyStore } from '@/persistence/schema';
import { MemoryStorage, loadStore, saveStore } from '@/persistence/storage';
import { exportStore, parseImport } from '@/persistence/exportImport';
import { addDays } from '@/science/dates';
import type { WheightyStore } from '@/domain/types';
import { makeProfile } from '../helpers/profiles';
import { createRng } from '../helpers/random';

const DAY0 = '2026-06-01';
const iso = (date: string) => `${date}T07:30:00.000Z`;

function onboarded(): WheightyStore {
  const profile = makeProfile({ ageYears: 34, heightCm: 172, currentWeightKg: 80, averageSteps7d: 8200, occupation: 'mixed', goal: 'loss', targetWeightKg: 72, weeklyRateTarget: 0.005, activities: [{ type: 'strength', sessionsPerWeek: 3, durationMin: 60, intensity: 'moderate' }] });
  const r = completeOnboarding(emptyStore(), profile, DAY0, iso(DAY0));
  if (!r.ok) throw new Error(r.reason);
  return r.store;
}

describe('end-to-end scenario: onboarding to recalibration (06 s1)', () => {
  it('creates the initial plan, a first weight and today log', () => {
    const s = onboarded();
    expect(s.plan?.source).toBe('initial');
    expect(s.plan?.calorieTarget).toBeGreaterThan(1200);
    expect(s.plan?.stepTarget).toBe(8200);
    expect(s.weights).toHaveLength(1);
    expect(s.dailyLogs).toEqual([{ date: DAY0, calorieTargetForDay: s.plan?.calorieTarget, stepTargetForDay: 8200, macrosForDay: s.plan?.macros }]);
    expect(s.meta.initialMaintenanceKcal).toBe(s.plan?.maintenanceKcal);
    expect(s.plan?.macrosDisplay).toBeDefined();
    expect(s.plan?.projection.trajectory.length).toBeGreaterThan(2);
  });

  it('persists and reloads exactly', () => {
    const storage = new MemoryStorage();
    const s = onboarded();
    expect(saveStore(storage, s).ok).toBe(true);
    expect(loadStore(storage, iso(DAY0)).store).toEqual(s);
  });

  it('backfills daily logs with the plan in force and never rewrites past days after a plan change', () => {
    let s = onboarded();
    const firstTarget = s.plan?.calorieTarget;
    s = ensureDailyLogs(s, addDays(DAY0, 3));
    expect(s.dailyLogs.map((l) => l.date)).toEqual([DAY0, addDays(DAY0, 1), addDays(DAY0, 2), addDays(DAY0, 3)]);
    const moved = applySliderSteps(s, addDays(DAY0, 3), 11200);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    s = moved.store;
    expect(s.plan?.source).toBe('user_adjusted_slider');
    expect(s.plan?.stepTarget).toBe(11200);
    expect(s.plan?.calorieTarget).toBeGreaterThan(firstTarget as number);
    expect(s.dailyLogs[0]?.calorieTargetForDay).toBe(firstTarget);
    expect(s.dailyLogs[3]?.calorieTargetForDay).toBe(s.plan?.calorieTarget);
    expect(s.dailyLogs[3]?.stepTargetForDay).toBe(11200);
  });

  it('slider session stays inside bounds and respects the floor', () => {
    const s = onboarded();
    const session = createSliderSession(s, DAY0);
    expect(session).not.toBeNull();
    if (!session) return;
    expect(session.effectiveMinSteps).toBeGreaterThanOrEqual(session.bounds.minSteps);
    const low = session.pointAt(session.effectiveMinSteps);
    expect(low.belowHardFloor).toBe(false);
    const applied = applySliderSteps(s, DAY0, 1000);
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(applied.store.plan?.stepTarget).toBeGreaterThanOrEqual(session.effectiveMinSteps);
  });

  it('stores adherence and actual steps on the day log', () => {
    let s = onboarded();
    s = setAdherence(s, DAY0, 'minor_deviation');
    s = setActualSteps(s, DAY0, 9350);
    expect(s.dailyLogs[0]).toMatchObject({ adherence: 'minor_deviation', actualSteps: 9350 });
    s = setAdherence(s, DAY0, null);
    expect(s.dailyLogs[0]?.adherence).toBeUndefined();
  });

  it('does not surface a recalibration before the gate, then applies a real posterior', () => {
    let s = onboarded();
    const early = computeCalibrationState(s, DAY0, iso(DAY0));
    expect(early?.gate.met).toBe(false);
    expect(early?.confidence).toBe('low');
    expect(early?.surfaced).toBe(false);

    // Simulated user losing faster than planned: true maintenance higher than the prior.
    const rng = createRng(3);
    for (let d = 1; d <= 35; d++) {
      const date = addDays(DAY0, d);
      s = ensureDailyLogs(s, date);
      s = setAdherence(s, addDays(date, -1), 'on_plan');
      s = setActualSteps(s, addDays(date, -1), 8200);
      if (d % 3 === 0) s = addWeight(s, { date, weightKg: 80 - 0.11 * d + 0.3 * rng.normal() }, iso(date));
    }
    const today = addDays(DAY0, 35);
    const state = computeCalibrationState(s, today, iso(today));
    expect(state?.gate.met).toBe(true);
    expect(state?.candidate).not.toBeNull();
    expect(state?.confidence).not.toBe('low');
    expect(state?.proposedMaintenanceKcal).toBeGreaterThan((s.plan?.maintenanceKcal ?? 0) + 75);
    expect(state?.surfaced).toBe(true);
    if (!state) return;
    const [lo, hi] = state.currentInterval80;
    expect(lo).toBeLessThan(state.currentMaintenanceKcal);
    expect(hi).toBeGreaterThan(state.currentMaintenanceKcal);
    const initialWidth = (s.meta.initialInterval80?.[1] ?? 0) - (s.meta.initialInterval80?.[0] ?? 0);
    expect(hi - lo).toBeLessThan(initialWidth);

    const seen = markRecalibrationSeen(s, state, today);
    expect(computeCalibrationState(seen, today, iso(today))?.surfaced).toBe(false);

    const applied = applyRecalibration(s, state, today, iso(today));
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.store.plan?.source).toBe('recalibrated');
    expect(applied.store.calibrationSnapshots).toHaveLength(1);
    expect(applied.store.calibrationSnapshots[0]?.appliedAt).toBe(iso(today));
    expect(applied.store.plan?.maintenanceKcal).toBeCloseTo(state.proposedMaintenanceKcal as number, 6);
    // History before today keeps its targets.
    expect(applied.store.dailyLogs[0]?.calorieTargetForDay).toBe(s.dailyLogs[0]?.calorieTargetForDay);

    const roundTrip = parseImport(exportStore(applied.store, iso(today)));
    expect(roundTrip.ok && roundTrip.store).toEqual(applied.store);
  });

  it('changes goal to maintenance and reports maintenance zone status', () => {
    const s = onboarded();
    const r = changeGoal(s, DAY0, { goal: 'maintenance', targetWeightKg: 80, weeklyRate: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.store.plan?.goal).toBe('maintenance');
    expect(r.store.plan?.weeklyRateTarget).toBe(0);
    expect(goalStatus(r.store).inMaintenanceZone).toBe(true);
  });
});

describe('display formatting (00 precision rules)', () => {
  it('rounds kcal to 10, steps to 100, weight to 0.1 with French formatting', () => {
    expect(formatKcal(2034.02)).toBe('2 030');
    expect(formatSteps(8249)).toBe('8 200');
    expect(formatWeight(76.84, 'metric')).toBe('76,8');
    expect(formatSignedWeight(-0.41, 'metric')).toBe(`${MINUS}0,4`);
    expect(formatWeight(76.8, 'imperial')).toBe('169,3');
  });
});
