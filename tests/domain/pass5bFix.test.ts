/**
 * Pass 5b fixes (report 46): speed locked on the aligned target itself, preview and applied plan of the measured habit,
 * steps / calories slider in the measured habit, manual check profiles of the day, adherence deduced from the journal,
 * short messages, personal target, small points of report 45, schema 9.
 */
import { describe, expect, it } from 'vitest';
import { addWeight, applyRecalibration, completeOnboarding, computeCalibrationState, setAdherence } from '@/domain/engine';
import { addFoodEntry } from '@/domain/journal';
import {
  acceptMeasuredOffer,
  alignedLockLine,
  alignedTargetLocked,
  changeGoalOnPath,
  jstarPlanOf,
  measuredInput,
  habitOf,
  pathSpeedSliderModel,
  runJournalWeek,
  switchToAlignedTarget,
  updateProfileOnPath,
} from '@/domain/journalPath';
import { runDailyChecks } from '@/domain/planSafety';
import type { WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { PRODUCTION_SOLVER } from '@/domain/engine';
import { addDays } from '@/science/dates';
import { hardFloorKcal } from '@/science/goals';
import type { UserProfile } from '@/science/types';
import { makeProfile } from '../helpers/profiles';

const D0 = '2026-06-01';
const day = (i: number) => addDays(D0, i);
const at = (date: string) => `${date}T08:00:00.000Z`;

const LOSS: UserProfile = makeProfile({ sexForEquation: 'female', ageYears: 35, heightCm: 165, currentWeightKg: 75, goal: 'loss', targetWeightKg: 64, weeklyRateTarget: 0.005 });

function onboard(profile: UserProfile = LOSS): WheightyStore {
  const r = completeOnboarding(emptyStore(), profile, D0, at(D0));
  if (!r.ok) throw new Error(r.reason);
  return r.store;
}

function logFood(s: WheightyStore, date: string, kcal: number): WheightyStore {
  const r = addFoodEntry(s, { kind: 'manual', food: { name: 'Repas', intake: { energyKcal: kcal, proteinG: null, carbsG: null, fatG: null }, grams: null }, date, localTime: '12:00', consumedTime: '12:00' }, at(date));
  if (!r.ok) throw new Error(r.reason);
  return r.store;
}

type Day = { kcal?: number | null; kg?: number | null; adherence?: 'on_plan' | 'minor_deviation' | 'major_deviation' };

/** Days [from, to]: journal, weigh-in (not on day 0, weighed at onboarding), declared adherence. */
function live(store: WheightyStore, from: number, to: number, f: (i: number) => Day): WheightyStore {
  let s = store;
  for (let i = from; i <= to; i++) {
    const d = f(i);
    if (d.kg !== null && d.kg !== undefined && i > 0) s = addWeight(s, { date: day(i), weightKg: d.kg }, at(day(i)));
    if (d.kcal !== null && d.kcal !== undefined) s = logFood(s, day(i), d.kcal);
    if (d.adherence) s = setAdherence(s, day(i), d.adherence);
  }
  return s;
}

const nonFollower = (kcal = 1800) => (i: number): Day => ({ kcal, kg: 75 - 0.03 * i, adherence: 'major_deviation' });

/** Switched to the aligned target on day 14, then logging `kcal` and weighing in every day up to day `to`. */
function aligned(to: number, after: (i: number) => Day = (i) => ({ kcal: 1800, kg: 75 - 0.03 * i })): WheightyStore {
  const s = live(onboard(), 0, 13, nonFollower());
  const w = live(s, 14, 14, (i) => ({ kg: 75 - 0.03 * i }));
  const r = switchToAlignedTarget(w, day(14), at(day(14)));
  if (!r.ok) throw new Error(r.reason);
  const s2 = live(r.store, 14, 14, (i) => ({ kcal: after(i).kcal ?? null }));
  return live(s2, 15, to, after);
}

/** Aligned on day 14, first plan of the measured habit confirmed on day 28 (logging 10 percent over the target). */
function measured(): WheightyStore {
  const s = aligned(28, (i) => ({ kcal: 1980, kg: 75 - 0.03 * i }));
  const r = acceptMeasuredOffer(runJournalWeek(s, day(28), at(day(28))), day(28), at(day(28)));
  if (!r.ok) throw new Error('no offer');
  return r.store;
}

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

describe('point 1a: speed locked on the aligned target itself', () => {
  it('the speed of the goal in force does not change: the aligned target stays in force (before: about the old target came back)', () => {
    const s = aligned(16);
    const before = onboard().plan?.calorieTarget as number;
    expect(alignedTargetLocked(s)).toBe(true);
    expect(s.plan?.calorieTarget).toBe(1800);
    for (const rate of [0.003, 0.0075]) {
      const r = ok(changeGoalOnPath(s, day(16), { goal: 'loss', targetWeightKg: 66, weeklyRate: rate }));
      expect(r.store.plan?.calorieTarget).toBe(1800);
      expect(r.store.plan?.calorieTarget).not.toBeCloseTo(before, -1);
      expect(r.store.profile?.weeklyRateTarget).toBe(0.005);
      // The target weight is changed; the aligned target stays the plan in force.
      expect(r.store.profile?.targetWeightKg).toBe(66);
      expect(r.store.plan?.targetWeightKg).toBe(66);
      expect(r.store.meta.journalPath).toMatchObject({ method: 'aligned', chosenTargetActive: true });
      expect(r.store.dailyLogs.find((l) => l.date === day(16))?.calorieTargetForDay).toBe(1800);
    }
  });

  it('a profile edit with the same goal keeps the aligned target and its speed', () => {
    const s = aligned(16);
    const r = ok(updateProfileOnPath(s, day(16), { ...(s.profile as UserProfile), averageSteps7d: 9000, weeklyRateTarget: 0.008 }));
    expect(r.store.plan?.calorieTarget).toBe(1800);
    expect(r.store.profile).toMatchObject({ averageSteps7d: 9000, weeklyRateTarget: 0.005 });
    expect(r.store.meta.journalPath.chosenTargetActive).toBe(true);
  });

  it('a goal change stays possible and ends the aligned target', () => {
    const s = aligned(16);
    const r = ok(changeGoalOnPath(s, day(16), { goal: 'maintenance', targetWeightKg: 74.5, weeklyRate: 0 }));
    expect(r.store.plan?.goal).toBe('maintenance');
    expect(r.store.meta.journalPath).toMatchObject({ method: 'aligned', chosenTargetActive: false });
    expect(alignedLockLine(r.store, day(16))).toBeNull();
  });

  it('the line, with the days before the first recalibration; gone once a recalibration replaced the aligned target', () => {
    const s = aligned(16);
    // 7 days after the switch (day 21): 5 days left on day 16; the gate already has its span and enough weigh-ins.
    expect(alignedLockLine(s, day(16))).toBe('Ta cible suit ce que tu manges. Vitesse modifiable après la première recalibration, dans 5 jours.');
    expect(alignedLockLine(s, day(20))).toBe('Ta cible suit ce que tu manges. Vitesse modifiable après la première recalibration, dans 1 jour.');
    const later = live(s, 17, 24, (i) => ({ kcal: 1800, kg: 75 - 0.03 * i }));
    expect(alignedLockLine(later, day(24))).toBe('Ta cible suit ce que tu manges. Vitesse modifiable après la première recalibration.');
    const state = computeCalibrationState(later, day(24), at(day(24)));
    if (!state) throw new Error('no state');
    const r = ok(applyRecalibration(later, state, day(24), at(day(24))));
    expect(alignedTargetLocked(r.store)).toBe(false);
    expect(alignedLockLine(r.store, day(24))).toBeNull();
  });
});

describe('point 1b: speed change in the measured habit', () => {
  it('the slider limits are those of the plan of the habit, and the plan applied is the plan of the habit for the new speed', () => {
    const s = measured();
    const h = s.meta.journalPath.habit?.h as number;
    const model = pathSpeedSliderModel(s, day(29), 'loss');
    if (!model) throw new Error('no model');
    // Floor of the plans of the habit, shown in displayed kcal: hard floor x 1.10 (I* >= 1.10 x h x floor).
    const floor = hardFloorKcal(s.plan?.reeKcal as number, 'female') * 1.1;
    expect(model.floorKcal).toBeCloseTo(floor, 6);
    for (const rate of [0.003, 0.0075]) {
      const r = ok(changeGoalOnPath(s, day(29), { goal: 'loss', targetWeightKg: 64, weeklyRate: rate }));
      const plan = r.store.plan;
      expect(r.store.meta.journalPath.method).toBe('measured');
      expect(plan?.requestedWeeklyRate).toBe(rate);
      // The same plan as the habit builds on its own: I* from the journal maintenance, T = I* / h.
      const prepared = measuredInput(r.store, day(29));
      if (!prepared) throw new Error('no input');
      const habit = habitOf(r.store, prepared, day(14), day(29));
      const own = jstarPlanOf(r.store, day(29), r.store.meta.journalPath.estimate as never, habit?.h as number, { request: PRODUCTION_SOLVER, input: prepared.input });
      if (!own.ok) throw new Error(own.reason);
      expect(plan?.calorieTarget).toBe(own.plan.calorieTarget);
      expect((plan?.calorieTarget as number) * (habit?.h as number)).toBeGreaterThanOrEqual(1.1 * (habit?.h as number) * hardFloorKcal(plan?.reeKcal as number, 'female') - 1e-6);
      // The next day keeps it.
      const next = runDailyChecks(r.store, day(30), at(day(30)));
      expect(next.plan?.calorieTarget).toBe(plan?.calorieTarget);
      expect(h).toBeGreaterThan(1);
    }
  });

  it('the profile edit preview is the plan that is applied', () => {
    const s = measured();
    const profile = { ...(s.profile as UserProfile), weeklyRateTarget: 0.003 };
    const preview = ok(updateProfileOnPath(s, day(29), profile));
    const applied = ok(updateProfileOnPath(s, day(29), profile));
    expect(applied.store.plan).toEqual(preview.store.plan);
    expect(applied.store.plan?.requestedWeeklyRate).toBe(0.003);
  });
});
