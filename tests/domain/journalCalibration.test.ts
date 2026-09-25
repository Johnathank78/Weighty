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
import { fitCalibration, offsetGrid, reconstructDays, widenedOffsetGrid } from '@/science/calibration';
import type { IntakeObservation } from '@/science/calibration';
import { assessBaseline, planContextFrom } from '@/science/assessment';
import { addDays } from '@/science/dates';
import { buildGoalPlan, hardFloorKcal, planHardFloorKcal } from '@/science/goals';
import type { WeightEntry } from '@/science/types';
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

describe('widened offset grid, measurement option (prompt 35 s3)', () => {
  it('+-1 200 reproduces the production fit exactly; the default grid is unchanged', () => {
    const prepared = journalCalibrationInputFromStore(store(), TODAY, OPTIONS);
    if (!prepared) throw new Error('prepared');
    expect(offsetGrid()).toEqual(widenedOffsetGrid(1200));
    expect(offsetGrid()).toHaveLength(481);
    expect(fitCalibration({ ...prepared.input, offsetGridHalfRangeKcal: 1200 })).toEqual(fitCalibration(prepared.input));
  });

  it('+-3 000: step 5, inadmissible offsets excluded and kept at zero probability through the floor', () => {
    const prepared = journalCalibrationInputFromStore(store(), TODAY, { ...OPTIONS, offsetGridHalfRangeKcal: 3000 });
    if (!prepared) throw new Error('prepared');
    const fit = fitCalibration(prepared.input);
    if (!fit) throw new Error('fit');
    expect(fit.posterior.offsetsKcal).toEqual(widenedOffsetGrid(3000));
    expect(fit.posterior.offsetsKcal).toHaveLength(1201);
    const nasem = prepared.input.populationTdeeAtStartKcal;
    const excluded = fit.posterior.offsetsKcal.filter((o) => nasem + o <= 1).length;
    expect(excluded).toBeGreaterThan(0);
    expect(fit.excludedOffsetCount).toBe(excluded);
    fit.posterior.offsetsKcal.forEach((o, i) => {
      if (nasem + o <= 1) {
        expect(fit.posterior.probabilities[i]).toBe(0);
        expect(fit.informationPosterior.probabilities[i]).toBe(0);
      }
    });
    expect(fit.posterior.probabilities.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it('throws with the warm-start history and on a half-range that is not a multiple of the step', () => {
    const prepared = journalCalibrationInputFromStore(store(), TODAY, OPTIONS);
    if (!prepared) throw new Error('prepared');
    const history = offsetGrid().map(() => 0);
    expect(() => fitCalibration({ ...prepared.input, historicalLogLikelihood: history, offsetGridHalfRangeKcal: 2000 })).toThrow(/historicalLogLikelihood/);
    expect(() => fitCalibration({ ...prepared.input, offsetGridHalfRangeKcal: 1202 })).toThrow(/multiple/);
    expect(() => fitCalibration({ ...prepared.input, offsetGridHalfRangeKcal: 0 })).toThrow(/multiple/);
  });
});

describe('iteration 2 prototype (prompt 36 s4)', () => {
  const X_CANDIDATES = [1, 0.85, 0.7] as const;
  const DENSITY = (x: number) => ({ minSpanDays: 28, minWeighInDayFraction: x });
  /** Weigh-ins every `every` days over `days` days, every day logged (usable), so only span and density can fail. */
  function schedule(every: number, days: number): { weights: WeightEntry[]; observations: IntakeObservation[] } {
    const weights: WeightEntry[] = [];
    for (let d = 0; d <= days; d += every) weights.push({ id: `w${d}`, date: addDays(DAY0, d), weightKg: 70, createdAt: iso(addDays(DAY0, d)) });
    const observations: IntakeObservation[] = Array.from({ length: days + 1 }, (_, d) => ({ date: addDays(DAY0, d), loggedKcal: 1800, consumptionMoments: 3, usable: true }));
    return { weights, observations };
  }

  it('s4.2: weighed every 3 days or once a week, the journal gate is never met, whatever X and the duration', () => {
    for (const x of X_CANDIDATES) {
      for (const every of [3, 7]) {
        for (let days = 14; days <= 364; days += 1) {
          const { weights, observations } = schedule(every, days);
          const gate = evaluateJournalGate(weights, observations, DENSITY(x));
          expect(gate.met).toBe(false);
          expect(gate.density?.enoughWeighInDensity).toBe(false);
        }
      }
    }
  });

  it('s4.2: daily weigh-ins pass from a 28-day span only; without the option the gate is unchanged', () => {
    for (const x of X_CANDIDATES) {
      const short = schedule(1, 27);
      const long = schedule(1, 28);
      expect(evaluateJournalGate(short.weights, short.observations, DENSITY(x)).met).toBe(false);
      expect(evaluateJournalGate(short.weights, short.observations).met).toBe(true);
      const gate = evaluateJournalGate(long.weights, long.observations, DENSITY(x));
      expect(gate.met).toBe(true);
      expect(gate.density).toEqual({ weighInDays: 29, windowDays: 29, weighInDayFraction: 1, enoughJournalSpan: true, enoughWeighInDensity: true });
    }
    // 25 weigh-ins over 29 window days (0.862): passes 85 % and 70 %, not 100 %.
    const { weights, observations } = schedule(1, 28);
    const sparse = weights.filter((_, i) => ![3, 9, 15, 21].includes(i));
    expect([1, 0.85, 0.7].map((x) => evaluateJournalGate(sparse, observations, DENSITY(x)).met)).toEqual([false, true, true]);
    expect(evaluateJournalGate(sparse, observations).density).toBeUndefined();
  });

  it("s4.4: carbSource 'logged' reads the logged carbohydrates of usable days only, through the bridge", () => {
    let s = store([4]);
    const date = addDays(DAY0, 3);
    const r = addFoodEntry(s, { kind: 'manual', food: { name: 'Pain', intake: { energyKcal: 250, proteinG: 8, carbsG: 45.5, fatG: 3 }, grams: null }, date, localTime: '10:00', consumedTime: '10:00' }, iso(date));
    if (!r.ok) throw new Error(r.reason);
    s = r.store;
    expect(intakeObservationsFrom(s, date, date, { kind: 'R0' })[0]).not.toHaveProperty('loggedCarbsG');
    expect(intakeObservationsFrom(s, date, date, { kind: 'R0' }, { withCarbs: true })[0]?.loggedCarbsG).toBe(45.5);
    const baseline = journalCalibrationInputFromStore(s, TODAY, OPTIONS);
    const logged = journalCalibrationInputFromStore(s, TODAY, { ...OPTIONS, carbSource: 'logged' });
    if (!baseline || !logged) throw new Error('prepared');
    expect(baseline.observations.every((o) => o.loggedCarbsG === undefined)).toBe(true);
    const days = reconstructDays(logged.input, logged.windowStart, 10);
    const base = reconstructDays(baseline.input, baseline.windowStart, 10);
    // Day 3 carries 45.5 g of logged carbohydrates; other usable days log none (manual kcal entries); day 4 is not usable.
    expect(days[3]?.carbKcal).toBe(45.5 * 4);
    expect(days[2]?.carbKcal).toBe(0);
    expect(days[4]?.intake?.source).toBe('median_fallback');
    expect(days[4]?.carbKcal).toBe(base[4]?.carbKcal);
    expect(days.map((d) => d.intakeKcal)).toEqual(base.map((d) => d.intakeKcal));
    expect(() => fitCalibration({ ...logged.input, intakeObservations: { ...logged.input.intakeObservations!, days: logged.observations.map(({ loggedCarbsG: _c, ...o }) => o) } })).toThrow(/loggedCarbsG/);
  });

  it('s3.6: the floor multiplier is absent by default and raises the floor the solved target is checked against', () => {
    const profile = makeProfile({ sexForEquation: 'female', ageYears: 60, heightCm: 152, currentWeightKg: 60, averageSteps7d: 5000, goal: 'loss', targetWeightKg: 45, weeklyRateTarget: 0.01 });
    const assessment = assessBaseline(profile, DAY0);
    const ctx = planContextFrom(profile, assessment, assessment.populationTdeeKcal);
    expect(planHardFloorKcal(ctx)).toBe(hardFloorKcal(ctx.reeKcal, ctx.sex));
    expect(planHardFloorKcal({ ...ctx, hardFloorMultiplier: 1.1 })).toBe(hardFloorKcal(ctx.reeKcal, ctx.sex) * 1.1);
    const input = { goal: 'loss' as const, weeklyRate: 0.01, targetWeightKg: 45, stepTarget: 5000 };
    const plain = buildGoalPlan(ctx, input);
    const raised = buildGoalPlan({ ...ctx, hardFloorMultiplier: 1.1 }, input);
    expect(plain.status).toBe('ok');
    expect(raised.status).toBe('ok');
    expect(plain.calorieTargetKcal as number).toBeGreaterThanOrEqual(plain.hardFloorKcal);
    expect(raised.hardFloorKcal).toBe(plain.hardFloorKcal * 1.1);
    expect(raised.calorieTargetKcal as number).toBeGreaterThanOrEqual(raised.hardFloorKcal);
    expect(raised.weeklyRateTarget).toBeLessThan(plain.weeklyRateTarget);
  });
});
