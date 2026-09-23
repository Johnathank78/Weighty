/**
 * Journal regime prototype (prompt 34, phase 1): usability rules, imputation of non-usable days with its trace,
 * regime window, gate and priors. Measurement-only code path, reachable from tests only.
 */
import { describe, expect, it } from 'vitest';
import { addWeight, completeOnboarding, ensureDailyLogs, setActualSteps, setAdherence } from '@/domain/engine';
import { intakeObservationsFrom } from '@/domain/intakeObservations';
import { computeJournalCalibration, evaluateJournalGate, journalCalibrationInputFromStore } from '@/domain/journalCalibration';
import type { JournalRegimeOptions } from '@/domain/journalCalibration';
import { addFoodEntry } from '@/domain/journal';
import type { WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { fitCalibration } from '@/science/calibration';
import { addDays } from '@/science/dates';
import { makeProfile } from '../helpers/profiles';

const DAY0 = '2026-03-02';
const iso = (d: string) => `${d}T08:00:00.000Z`;
const PROFILE = makeProfile({ sexForEquation: 'female', ageYears: 35, heightCm: 165, currentWeightKg: 70, averageSteps7d: 7000, goal: 'loss', targetWeightKg: 64, weeklyRateTarget: 0.005 });

function log(s: WheightyStore, date: string, kcal: number, time = '12:00'): WheightyStore {
  const r = addFoodEntry(s, { kind: 'manual', food: { name: 'Repas', intake: { energyKcal: kcal, proteinG: null, carbsG: null, fatG: null }, grams: null }, date, localTime: time, consumedTime: time }, iso(date));
  if (!r.ok) throw new Error(r.reason);
  return r.store;
}

/** 28 days, weigh-in every 2 days, steps logged, one or two entries a day except the listed empty days. */
function store(emptyDays: readonly number[] = []): WheightyStore {
  const onboarding = completeOnboarding(emptyStore(), PROFILE, DAY0, iso(DAY0));
  if (!onboarding.ok) throw new Error(onboarding.reason);
  let s = onboarding.store;
  for (let d = 1; d <= 28; d++) {
    const date = addDays(DAY0, d);
    const prev = addDays(date, -1);
    s = ensureDailyLogs(s, date);
    s = setAdherence(s, prev, 'major_deviation');
    s = setActualSteps(s, prev, 7000);
    if (!emptyDays.includes(d - 1)) {
      s = log(s, prev, 900 + d, '08:30');
      if (d % 2 === 0) s = log(s, prev, 700, '19:00');
    }
    if (d % 2 === 0) s = addWeight(s, { date, weightKg: 70 - 0.03 * d }, iso(date));
  }
  return s;
}

const OPTIONS: JournalRegimeOptions = { journalRegimeStart: DAY0, usabilityRule: { kind: 'R0' }, nonUsableDayWeight: 0.5 };
const TODAY = addDays(DAY0, 28);

describe('intakeObservationsFrom (D8, s3.1)', () => {
  it('returns the day total, the distinct consumption times and R0 usability', () => {
    const obs = intakeObservationsFrom(store([3]), DAY0, addDays(DAY0, 4), { kind: 'R0' });
    expect(obs.map((o) => o.date)).toEqual([0, 1, 2, 3, 4].map((d) => addDays(DAY0, d)));
    expect(obs[1]).toEqual({ date: addDays(DAY0, 1), loggedKcal: 902 + 700, consumptionMoments: 2, usable: true });
    expect(obs[0]).toEqual({ date: DAY0, loggedKcal: 901, consumptionMoments: 1, usable: true });
    expect(obs[3]?.usable).toBe(false);
  });

  it('R1 rejects a day below x times the 14-day median, R2 also needs two consumption times', () => {
    let s = store();
    s = log(s, TODAY, 100);
    const r1 = intakeObservationsFrom(s, TODAY, TODAY, { kind: 'R1', x: 0.5 });
    expect(r1[0]?.usable).toBe(false);
    const r1Low = intakeObservationsFrom(s, addDays(DAY0, 20), addDays(DAY0, 20), { kind: 'R1', x: 0.5 });
    expect(r1Low[0]?.usable).toBe(true);
    const r2 = intakeObservationsFrom(s, addDays(DAY0, 20), addDays(DAY0, 21), { kind: 'R2', x: 0.5 });
    expect(r2.map((o) => [o.consumptionMoments, o.usable])).toEqual([
      [1, false],
      [2, true],
    ]);
  });
});

describe('journal regime calibration (s3.2 to s3.5)', () => {
  it('uses the logged totals, imputes non-usable days by the 14-day median and traces every day', () => {
    const s = store([5, 6]);
    const state = computeJournalCalibration(s, TODAY, iso(TODAY), OPTIONS);
    const trace = state?.fit?.intakeTrace;
    expect(trace).toBeDefined();
    if (!trace) return;
    expect(trace.days).toHaveLength(state?.fit?.observationSpanDays ?? 0);
    expect(trace.counts).toEqual({ logged: trace.days.length - 2, median14: 2, medianWindow: 0, target: 0 });
    const day5 = trace.days[5];
    expect(day5?.source).toBe('median_fallback');
    expect(day5?.weight).toBe(0.5);
    // Median of the usable totals of the previous days (days 0 to 4: 901, 1602, 903, 1604, 905); day 5 is not usable.
    expect(day5?.intakeKcal).toBe(905);
    expect(trace.days[6]).toMatchObject({ source: 'median_fallback', medianScope: '14d', intakeKcal: 905, weight: 0.5 });
    expect(trace.days[7]).toMatchObject({ source: 'logged', intakeKcal: 908 + 700, weight: 1 });
  });

  it('falls back to the window median, then to the target, and counts each fallback', () => {
    const s = store([0, 1, 2]);
    const prepared = journalCalibrationInputFromStore(s, TODAY, OPTIONS);
    if (!prepared) throw new Error('prepared');
    const fit = fitCalibration(prepared.input);
    expect(fit?.intakeTrace?.counts.medianWindow).toBe(3);
    const none = fitCalibration({ ...prepared.input, intakeObservations: { days: prepared.observations.map((o) => ({ ...o, usable: false })), nonUsableDayWeight: 0 } });
    expect(none?.intakeTrace?.counts.target).toBe(none?.observationSpanDays);
    expect(none?.intakeTrace?.days[0]?.intakeKcal).toBe(s.plan?.calorieTarget);
  });

  it('never reads the declared adherence and gives usable days a weight of 1 (x 0.7 without steps)', () => {
    const s = store();
    const onPlan: WheightyStore = { ...s, dailyLogs: s.dailyLogs.map((l) => ({ ...l, adherence: 'on_plan' as const })) };
    const a = computeJournalCalibration(s, TODAY, iso(TODAY), OPTIONS);
    const b = computeJournalCalibration(onPlan, TODAY, iso(TODAY), OPTIONS);
    expect(a?.fit?.posterior).toEqual(b?.fit?.posterior);
    expect(a?.fit?.intakeTrace?.days.every((d) => d.weight === 1)).toBe(true);
  });

  it('starts the window at the first valid weigh-in on or after the regime start, without the warm-start history', () => {
    const s = store();
    const start = addDays(DAY0, 5);
    const prepared = journalCalibrationInputFromStore(s, TODAY, { ...OPTIONS, journalRegimeStart: start });
    expect(prepared?.windowStart).toBe(addDays(DAY0, 6));
    expect(prepared?.input.weights.every((w) => w.date >= addDays(DAY0, 6))).toBe(true);
    expect(prepared?.input.historicalLogLikelihood).toBeUndefined();
  });

  it('flat and widened priors (N4 only)', () => {
    const s = store();
    const nasem = journalCalibrationInputFromStore(s, TODAY, OPTIONS);
    const flat = journalCalibrationInputFromStore(s, TODAY, { ...OPTIONS, journalPrior: 'flat' });
    const widened = journalCalibrationInputFromStore(s, TODAY, { ...OPTIONS, journalPrior: 'widened' });
    if (!nasem || !flat || !widened) throw new Error('prepared');
    expect(flat.input.priorSigmaKcal).toBe(Number.POSITIVE_INFINITY);
    expect(-0.5 * (600 / flat.input.priorSigmaKcal) ** 2).toBe(-0);
    expect(widened.input.priorSigmaKcal).toBeCloseTo(Math.sqrt(nasem.input.priorSigmaKcal ** 2 + (0.1 * nasem.input.populationTdeeAtStartKcal) ** 2), 9);
  });

  it('gate: usable-day coverage and clean weigh-ins judged on non-usable days (s3.4)', () => {
    const s = store([2, 3]);
    const prepared = journalCalibrationInputFromStore(s, TODAY, OPTIONS);
    if (!prepared) throw new Error('prepared');
    const gate = evaluateJournalGate(prepared.input.weights, prepared.observations);
    expect(gate.met).toBe(true);
    // Window days 2 and 3 are the whole window of the day-4 weigh-in: 100 percent non-usable, not clean.
    expect(gate.cleanWeighInCount).toBe(gate.weighInCount - 1);
    expect(gate.trackedDays).toBe(gate.spanDays + 1 - 2 - 1);
  });
});
