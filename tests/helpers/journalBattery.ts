/**
 * Generator and runners of the journal battery, phase 1 (prompt 34 s5, thresholds in
 * tests/experiments-journal/THRESHOLDS.md). Measurement only.
 *
 * World (N2 to N4), fixed before any measurement:
 * - profiles: latin hypercube over sex, BMI {21, 26, 31, 38}, activity {sedentary, strength 4 x 55 min}, age U(19, 65),
 *   height U(150, 175) F or U(165, 195) M, goal {loss 0.5 %/wk, maintenance, gain 0.25 %/wk}; plus cases R and S;
 * - true metabolic offset ~ N(0, sigma of the profile prior), or sigma x t(3) (N2 variant);
 * - real intake = calorie target of the initial plan, every day; logged = real x (1 + u) x (1 + 0.08 z_day) on 100 % of days;
 * - weigh-ins: nominal Hall, independent Student-t (df 4, scale 0.6 kg) noise, daily or every 3 days. The onboarding
 *   weight is itself a noisy weigh-in: the true starting weight is declared - noise, the true maintenance is
 *   NASEM(declared weight) + offset, so the offset truth is expressed in the estimator's reference (NASEM at the
 *   first weigh-in);
 * - truth in logged units = real offset + window mean of u x real intake.
 * The simulated user goes through the real domain use cases (onboarding, daily logs, adherence, steps, weigh-ins,
 * food journal); both calibration paths read the same store.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { addWeight, calibrationInputFromStore, completeOnboarding, ensureDailyLogs, setActualSteps, setAdherence } from '@/domain/engine';
import { computeJournalCalibration } from '@/domain/journalCalibration';
import type { JournalPrior, JournalRegimeOptions } from '@/domain/journalCalibration';
import { addFoodEntry } from '@/domain/journal';
import type { WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { assessBaseline, planContextFrom } from '@/science/assessment';
import { evaluateGate, fitCalibration } from '@/science/calibration';
import type { CalibrationFit, Posterior } from '@/science/calibration';
import { addDays } from '@/science/dates';
import { hallParametersFor, paDeltaForSteps } from '@/science/goals';
import { advance, bodyWeightOf, initialState } from '@/science/hall/model';
import type { HistoricalIntakeEvidence, UserProfile } from '@/science/types';
import { JOURNAL_RESULTS_DIR, edgeMass, writeCsvGz } from './journalExport';
import type { CsvValue } from './journalExport';
import { makeProfile } from './profiles';
import { createRng } from './random';
import type { Rng } from './random';

export const BATTERY_START = '2026-04-06';
export const WEIGH_NOISE_SCALE_KG = 0.6;
export const WEIGH_NOISE_DF = 4;
export const LOGGING_NOISE_SD = 0.08;

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export type Activity = 'sedentary' | 'strength';
export type GoalKind = 'loss' | 'maintenance' | 'gain';
export type BatteryProfile = { key: string; sex: 'female' | 'male'; bmi: number; activity: Activity; goal: GoalKind; profile: UserProfile; evidence: HistoricalIntakeEvidence | null };

const BMIS = [21, 26, 31, 38] as const;
const GOALS: GoalKind[] = ['loss', 'maintenance', 'gain'];

export const CASE_R: UserProfile = makeProfile({ sexForEquation: 'female', ageYears: 24, heightCm: 155, currentWeightKg: 68, averageSteps7d: 9400, walkingPace: 'normal', occupation: 'seated', activities: [{ type: 'strength', sessionsPerWeek: 4, durationMin: 55, intensity: 'moderate' }], goal: 'loss', targetWeightKg: 60, weeklyRateTarget: 0.01 });
export const CASE_S: UserProfile = { ...CASE_R, activities: [{ type: 'strength', sessionsPerWeek: 5, durationMin: 55, intensity: 'moderate' }], targetWeightKg: 62 };
/** History of the reference cases (tests/domain/warmStartReferenceCases.test.ts), recorded on the onboarding day. */
export const referenceHistory = (recordedOn: string): HistoricalIntakeEvidence => ({ evidenceVersion: 1, recordedOn, averageCaloriesKcal: 1450, durationDays: 14, startWeightKg: 68, endWeightKg: 68, trackingQuality: 'high', activityComparable: true });

export function profileFrom(sex: 'female' | 'male', bmi: number, activity: Activity, goal: GoalKind, ageYears: number, heightCm: number): UserProfile {
  const weight = Math.round(bmi * (heightCm / 100) ** 2 * 10) / 10;
  return makeProfile({
    sexForEquation: sex,
    ageYears: Math.round(ageYears),
    heightCm: Math.round(heightCm),
    currentWeightKg: weight,
    averageSteps7d: activity === 'sedentary' ? 5000 : 7000,
    walkingPace: 'normal',
    occupation: 'seated',
    activities: activity === 'strength' ? [{ type: 'strength', sessionsPerWeek: 4, durationMin: 55, intensity: 'moderate' }] : [],
    goal,
    targetWeightKg: goal === 'loss' ? Math.round(weight * 0.9 * 10) / 10 : goal === 'gain' ? Math.round(weight * 1.05 * 10) / 10 : weight,
    weeklyRateTarget: goal === 'loss' ? 0.005 : goal === 'gain' ? 0.0025 : 0,
  });
}

function permutation(n: number, rng: Rng): number[] {
  const p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [p[i], p[j]] = [p[j] as number, p[i] as number];
  }
  return p;
}

/** Latin hypercube of n profiles: each dimension is stratified in n strata (categorical levels by equal blocks). */
export function lhsProfiles(n: number, seed: number): BatteryProfile[] {
  const rng = createRng(seed);
  const dims = Array.from({ length: 6 }, () => permutation(n, rng));
  const cell = (d: number, i: number, levels: number) => Math.floor(((dims[d] as number[])[i] as number) * levels / n);
  const unit = (d: number, i: number) => (((dims[d] as number[])[i] as number) + rng.next()) / n;
  const out: BatteryProfile[] = [];
  for (let i = 0; i < n; i++) {
    const sex = cell(0, i, 2) === 0 ? 'female' : 'male';
    const bmi = BMIS[cell(1, i, 4)] as number;
    const activity: Activity = cell(2, i, 2) === 0 ? 'sedentary' : 'strength';
    const goal = GOALS[cell(3, i, 3)] as GoalKind;
    const age = 19 + 46 * unit(4, i);
    const height = sex === 'female' ? 150 + 25 * unit(5, i) : 165 + 30 * unit(5, i);
    out.push({ key: `lhs${i}`, sex, bmi, activity, goal, profile: profileFrom(sex, bmi, activity, goal, age, height), evidence: null });
  }
  return out;
}

const bmiOf = (p: UserProfile) => p.currentWeightKg / (p.heightCm / 100) ** 2;

export function referenceCase(key: 'R' | 'S', withHistory: boolean): BatteryProfile {
  const profile = key === 'R' ? CASE_R : CASE_S;
  return { key, sex: 'female', bmi: bmiOf(profile), activity: 'strength', goal: 'loss', profile, evidence: withHistory ? referenceHistory(BATTERY_START) : null };
}

/** n users: LHS profiles and, every 25th slot, case R then case S (4 % each), without warm-start history. */
export function batteryProfiles(n: number, seed: number): BatteryProfile[] {
  const lhs = lhsProfiles(n, seed);
  return lhs.map((p, i) => (i % 25 === 0 ? referenceCase('R', false) : i % 25 === 1 ? referenceCase('S', false) : p));
}

/** SD of the population prior of a profile (onboarding assessment), kcal/day. */
export function profileSigma(bp: BatteryProfile): number {
  return assessBaseline(bp.profile, BATTERY_START).sigma.sigmaKcal;
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

export type WorldSettings = {
  days: number;
  weighEveryDays: number;
  trueOffsetKcal: number;
  /** Systematic logging bias of the user (logged / eaten - 1). */
  u: number;
  /** Real intake override (stress); default: the calorie target of the initial plan. */
  realIntakeKcal?: number;
  /** Declared adherence every day (read by the current path only). */
  adherence?: 'on_plan' | 'major_deviation';
};

export type JournalWorld = {
  store: WheightyStore;
  profile: BatteryProfile;
  settings: WorldSettings;
  realIntakeKcal: number;
  /** Daily logged totals as generated (before the journal's 0.01 kcal rounding of day totals). */
  loggedKcal: number[];
  /** NASEM at the declared (onboarding) weight with the fixed PAL: the reference of the offset truth. */
  nasemDeclaredKcal: number;
  /** Profile prior SD, kcal/day. */
  sigmaKcal: number;
};

const iso = (date: string) => `${date}T07:00:00.000Z`;
const MEALS = [
  { time: '08:00', share: 0.25 },
  { time: '12:30', share: 0.4 },
  { time: '19:30', share: 0.35 },
] as const;

export type WorldRngs = { weigh: Rng; logging: Rng };

/** Separate streams so that, for one user, the weigh-in noise and the logging noise do not depend on u or the offset. */
export function worldRngs(seed: number): WorldRngs {
  return { weigh: createRng(seed + 1_000_003), logging: createRng(seed + 2_000_003) };
}

export function simulateJournalWorld(bp: BatteryProfile, s: WorldSettings, rngs: WorldRngs): JournalWorld {
  const onboarding = completeOnboarding(emptyStore(), bp.profile, BATTERY_START, iso(BATTERY_START), bp.evidence);
  if (!onboarding.ok) throw new Error(`onboarding failed: ${onboarding.reason}`);
  let store = onboarding.store;
  const plan = store.plan;
  if (!plan) throw new Error('no plan');
  const palCategory = store.meta.initialPalCategory ?? plan.palCategory;
  const declared = bp.profile.currentWeightKg;
  const declaredAssessment = assessBaseline(bp.profile, BATTERY_START, { weightKg: declared, palCategory });
  const nasemDeclaredKcal = declaredAssessment.populationTdeeKcal;
  // The onboarding weight is a noisy weigh-in of the true starting weight.
  const trueStart = declared - WEIGH_NOISE_SCALE_KG * rngs.weigh.studentT(WEIGH_NOISE_DF);
  const trueProfile: UserProfile = { ...bp.profile, currentWeightKg: trueStart };
  const trueAssessment = assessBaseline(trueProfile, BATTERY_START, { weightKg: trueStart, palCategory });
  const ctx = planContextFrom(trueProfile, trueAssessment, trueAssessment.populationTdeeKcal);
  const body = hallParametersFor(ctx, plan.goal, nasemDeclaredKcal + s.trueOffsetKcal - trueAssessment.populationTdeeKcal);
  const realIntakeKcal = s.realIntakeKcal ?? plan.calorieTarget;
  const hallInput = {
    intakeKcal: realIntakeKcal,
    carbKcal: plan.macros.carbsG * 4 * (realIntakeKcal / plan.calorieTarget),
    paDeltaKcalPerKgDay: paDeltaForSteps(ctx, plan.stepTarget),
    sodiumDeltaMg: 0,
  };
  let state = initialState(body);
  const loggedKcal: number[] = [];
  for (let d = 0; d < s.days; d++) {
    const date = addDays(BATTERY_START, d);
    store = ensureDailyLogs(store, date);
    store = setAdherence(store, date, s.adherence ?? 'on_plan');
    store = setActualSteps(store, date, plan.stepTarget);
    const logged = Math.max(0, realIntakeKcal * (1 + s.u) * (1 + LOGGING_NOISE_SD * rngs.logging.normal()));
    loggedKcal.push(logged);
    for (const meal of MEALS) {
      const r = addFoodEntry(store, { kind: 'manual', food: { name: 'Repas', intake: { energyKcal: logged * meal.share, proteinG: null, carbsG: null, fatG: null }, grams: null }, date, localTime: meal.time, consumedTime: meal.time }, iso(date));
      if (!r.ok) throw new Error(r.reason);
      store = r.store;
    }
    state = advance(body, state, hallInput, 1);
    const next = d + 1;
    if (next % s.weighEveryDays === 0) {
      const noise = WEIGH_NOISE_SCALE_KG * rngs.weigh.studentT(WEIGH_NOISE_DF);
      store = addWeight(store, { date: addDays(BATTERY_START, next), weightKg: bodyWeightOf(body, state) + noise }, iso(addDays(BATTERY_START, next)));
    }
  }
  return { store, profile: bp, settings: s, realIntakeKcal, loggedKcal, nasemDeclaredKcal, sigmaKcal: declaredAssessment.sigma.sigmaKcal };
}

/** Store as seen on day `h` (morning): weigh-ins up to h, daily logs and journal entries before h. */
export function storeAt(store: WheightyStore, h: number): WheightyStore {
  const today = addDays(BATTERY_START, h);
  return {
    ...store,
    weights: store.weights.filter((w) => w.date <= today),
    dailyLogs: store.dailyLogs.filter((l) => l.date < today),
    foodJournal: { ...store.foodJournal, entries: store.foodJournal.entries.filter((e) => e.date < today) },
  };
}

// ---------------------------------------------------------------------------
// Fits and rows
// ---------------------------------------------------------------------------

/** P(offset <= x) under the piecewise-linear grid CDF used by gridQuantile (cells centred on the offsets). */
export function gridCdf(p: Posterior, x: number): number {
  const offsets = p.offsetsKcal;
  const step = offsets.length > 1 ? (offsets[1] as number) - (offsets[0] as number) : 1;
  let cumulative = 0;
  for (let i = 0; i < offsets.length; i++) {
    const lo = (offsets[i] as number) - step / 2;
    const prob = p.probabilities[i] as number;
    if (x < lo) return cumulative;
    if (x < lo + step) return cumulative + (prob * (x - lo)) / step;
    cumulative += prob;
  }
  return cumulative;
}

export type PathKey = 'current' | 'prototype';

export type FitSummary = Record<string, CsvValue>;

/** Quantiles, widths, PIT of the truth, grid-bound masses, for the fitted posterior and the no-floor (information) one. */
export function summarizeFit(fit: CalibrationFit, truth: number, prefix = ''): FitSummary {
  const out: FitSummary = {};
  const put = (p: Posterior, tag: string) => {
    const e = edgeMass(p.probabilities);
    Object.assign(out, {
      [`${prefix}${tag}q025`]: p.interval95[0],
      [`${prefix}${tag}q10`]: p.interval80[0],
      [`${prefix}${tag}q50`]: p.medianKcal,
      [`${prefix}${tag}q90`]: p.interval80[1],
      [`${prefix}${tag}q975`]: p.interval95[1],
      [`${prefix}${tag}pit`]: gridCdf(p, truth),
      [`${prefix}${tag}low5`]: e.low5,
      [`${prefix}${tag}low10`]: e.low10,
      [`${prefix}${tag}high5`]: e.high5,
      [`${prefix}${tag}high10`]: e.high10,
    });
  };
  put(fit.posterior, '');
  put(fit.informationPosterior, 'nf_');
  return out;
}

export type CurrentPathResult = { fit: CalibrationFit; gateMet: boolean; nasemAtStartKcal: number };

export function currentPathFit(store: WheightyStore, today: string, structuralSdKcal?: number): CurrentPathResult {
  const input = calibrationInputFromStore(store, today);
  if (!input) throw new Error('no input');
  const fit = fitCalibration(structuralSdKcal === undefined ? input : { ...input, structuralSdKcal });
  if (!fit) throw new Error('fit failed');
  return { fit, gateMet: evaluateGate(store.weights, store.dailyLogs).met, nasemAtStartKcal: input.populationTdeeAtStartKcal };
}

export const REGIME_BASE: Omit<JournalRegimeOptions, 'journalRegimeStart'> = { usabilityRule: { kind: 'R0' }, nonUsableDayWeight: 0.5 };

export function prototypeFit(store: WheightyStore, today: string, extra: Partial<JournalRegimeOptions> = {}): CurrentPathResult & { trace: NonNullable<CalibrationFit['intakeTrace']> } {
  const state = computeJournalCalibration(store, today, `${today}T08:00:00.000Z`, { ...REGIME_BASE, journalRegimeStart: BATTERY_START, ...extra });
  if (!state?.fit?.intakeTrace) throw new Error('prototype fit failed');
  return { fit: state.fit, gateMet: state.gate.met, nasemAtStartKcal: state.prepared.input.populationTdeeAtStartKcal, trace: state.fit.intakeTrace };
}

/** Last weigh-in day on or before h (window end of the fit). */
export function windowEndDay(h: number, weighEveryDays: number): number {
  return Math.floor(h / weighEveryDays) * weighEveryDays;
}

/** Truths for a horizon: real offset in the estimator's reference, and in logged units (+ window mean of u x real intake). */
export function truthsAt(world: JournalWorld, h: number, nasemAtStartKcal: number): { real: number; logged: number; referenceShift: number } {
  if (windowEndDay(h, world.settings.weighEveryDays) <= 0) throw new Error('empty window');
  const referenceShift = world.nasemDeclaredKcal - nasemAtStartKcal;
  const real = world.settings.trueOffsetKcal + referenceShift;
  // Real intake is constant over the window, so the window mean of u x real intake is u x real intake.
  return { real, logged: real + world.settings.u * world.realIntakeKcal, referenceShift };
}

export function profileColumns(world: JournalWorld): FitSummary {
  const bp = world.profile;
  return {
    profile_key: bp.key,
    sex: bp.sex,
    bmi_class: bp.key === 'R' || bp.key === 'S' ? `case_${bp.key}` : bp.bmi,
    bmi: bmiOf(bp.profile),
    activity: bp.activity,
    goal: bp.goal,
    age: bp.profile.ageYears,
    height: bp.profile.heightCm,
    weight: bp.profile.currentWeightKg,
    weigh_every_days: world.settings.weighEveryDays,
    journal_completeness: 1,
    true_offset: world.settings.trueOffsetKcal,
    u: world.settings.u,
    real_intake: world.realIntakeKcal,
    sigma_prior: world.sigmaKcal,
  };
}

export function writeRows(name: string, rows: readonly FitSummary[]): void {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  writeCsvGz(`${JOURNAL_RESULTS_DIR}/${name}.csv.gz`, columns, rows);
}

export function writeJson(name: string, value: unknown): void {
  mkdirSync(dirname(`${JOURNAL_RESULTS_DIR}/${name}.json`), { recursive: true });
  writeFileSync(`${JOURNAL_RESULTS_DIR}/${name}.json`, `${JSON.stringify(value, null, 2)}\n`);
}

export type { JournalPrior };
