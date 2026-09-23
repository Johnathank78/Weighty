/**
 * Measurements N1 to N4 of the journal battery, phase 1 (prompt 34 s5), against the frozen thresholds of
 * tests/experiments-journal/THRESHOLDS.md. Each runner writes one raw CSV row per simulated user (and horizon, path,
 * prior) to tests/experiments-journal/results/; tables and verdicts are rebuilt from those files only (tables.experiment.ts).
 *
 * Declared seeds (validation seeds: no candidate rule is selected in phase 1, so no training seeds are used):
 * N1 101 000 (profiles) and 110 000 + i; N2 200 000 (profiles), 210 000 + i, stress 260 000 + i;
 * N3 300 000 (profiles), 310 000 + i; N4 400 000 (profiles), 410 000 + i. N_SCALE multiplies n (doubling rule).
 */
import { calibrationInputFromStore } from '@/domain/engine';
import { journalDay } from '@/domain/journal';
import { assessBaseline } from '@/science/assessment';
import { fitCalibration } from '@/science/calibration';
import { addDays } from '@/science/dates';
import { isAdmissibleBaselineIntake } from '@/science/hall/model';
import { withLoggedIntake } from '../helpers/intakeLogging';
import {
  BATTERY_START,
  batteryProfiles,
  currentPathFit,
  lhsProfiles,
  profileColumns,
  profileFrom,
  profileSigma,
  prototypeFit,
  referenceCase,
  simulateJournalWorld,
  storeAt,
  summarizeFit,
  truthsAt,
  worldRngs,
  writeJson,
  writeRows,
} from '../helpers/journalBattery';
import type { BatteryProfile, FitSummary, JournalPrior, JournalWorld } from '../helpers/journalBattery';
import { createRng } from '../helpers/random';

export const N_SCALE = Number(process.env.N_SCALE ?? 1);
/** Output folder suffix of a doubled pass (doubling rule): n2x2, n3x2, n4x2. */
const PASS = N_SCALE === 1 ? '' : `x${N_SCALE}`;

/** Logging-bias populations (THRESHOLDS.md, common rules). Slope: points of mean u between BMI 22 and 35 (clamped). */
export type Population = { key: string; meanU: number; sdU: number; bmiSlope?: number; role: 'principal' | 'sensitivity' };
export const POPULATIONS: Population[] = [
  { key: 'P00', meanU: 0, sdU: 0.03, role: 'principal' },
  { key: 'P05', meanU: -0.05, sdU: 0.1, role: 'principal' },
  { key: 'P10', meanU: -0.1, sdU: 0.1, role: 'principal' },
  { key: 'P20', meanU: -0.2, sdU: 0.1, role: 'principal' },
  { key: 'P10_sd20', meanU: -0.1, sdU: 0.2, role: 'sensitivity' },
  // Slope 0 is P10 itself.
  { key: 'P10_slope-5', meanU: -0.1, sdU: 0.1, bmiSlope: -0.05, role: 'sensitivity' },
  { key: 'P10_slope-10', meanU: -0.1, sdU: 0.1, bmiSlope: -0.1, role: 'sensitivity' },
];

export function drawU(pop: Population, bmi: number, z: number): number {
  const slope = pop.bmiSlope ?? 0;
  const position = Math.min(1, Math.max(0, (bmi - 22) / (35 - 22)));
  return pop.meanU + slope * position + pop.sdU * z;
}

type UserDraws = { offsetZ: number; offsetT3: number; uZ: number };
function userDraws(seed: number): UserDraws {
  return { offsetZ: createRng(seed + 3_000_007).normal(), offsetT3: createRng(seed + 4_000_007).studentT(3), uZ: createRng(seed + 5_000_011).normal() };
}

/**
 * Offset draw (same first draw as `userDraws`), redrawn from the same stream while the true maintenance
 * NASEM + offset is outside the Hall admissible domain (a non-physical world that cannot be simulated; heavy t(3) tail
 * only). The number of redraws is exported with the row.
 */
function admissibleOffset(law: 'normal' | 't3', seed: number, sigma: number, bp: BatteryProfile): { offset: number; redraws: number } {
  const rng = createRng(seed + (law === 'normal' ? 3_000_007 : 4_000_007));
  const nasem = assessBaseline(bp.profile, BATTERY_START).populationTdeeKcal;
  let redraws = 0;
  for (;;) {
    const offset = sigma * (law === 'normal' ? rng.normal() : rng.studentT(3));
    if (isAdmissibleBaselineIntake(nasem + offset)) return { offset, redraws };
    redraws++;
  }
}

const bmiOfProfile = (bp: BatteryProfile) => bp.profile.currentWeightKg / (bp.profile.heightCm / 100) ** 2;

// ---------------------------------------------------------------------------
// N1: path equivalence
// ---------------------------------------------------------------------------

export function runN1(): void {
  const fixtures: Array<{ id: string; bp: BatteryProfile; h: number; weighEveryDays: number; adherence?: 'major_deviation' }> = [];
  lhsProfiles(46, 101_000).forEach((bp, i) => fixtures.push({ id: `lhs${i}`, bp, h: i % 2 === 0 ? 28 : 42, weighEveryDays: i % 4 < 2 ? 1 : 3 }));
  for (const key of ['R', 'S'] as const) for (const h of [28, 42]) fixtures.push({ id: `${key}-${h}`, bp: referenceCase(key, true), h, weighEveryDays: 1 });
  fixtures.push({ id: 'major-every-day', bp: lhsProfiles(46, 101_000)[5] as BatteryProfile, h: 42, weighEveryDays: 1, adherence: 'major_deviation' });
  fixtures.push({ id: 'gain', bp: { key: 'gain', sex: 'male', bmi: 26, activity: 'strength', goal: 'gain', profile: profileFrom('male', 26, 'strength', 'gain', 30, 180), evidence: null }, h: 42, weighEveryDays: 1 });

  const rows: FitSummary[] = [];
  fixtures.forEach((fx, i) => {
    const seed = 110_000 + i;
    const draws = userDraws(seed);
    const sigma = profileSigma(fx.bp);
    const world = simulateJournalWorld(fx.bp, { days: fx.h, weighEveryDays: fx.weighEveryDays, trueOffsetKcal: sigma * draws.offsetZ, u: drawU(POPULATIONS[2] as Population, bmiOfProfile(fx.bp), draws.uZ), ...(fx.adherence ? { adherence: fx.adherence } : {}) }, worldRngs(seed));
    const today = addDays(BATTERY_START, fx.h);
    const store = storeAt(world.store, fx.h);
    // Harness of benchmark 26: production input, logged totals through withLoggedIntake, production fit.
    const base = calibrationInputFromStore(store, today);
    if (!base) throw new Error('base');
    const logged = Array.from({ length: fx.h }, (_, d) => journalDay(store, addDays(BATTERY_START, d)).intakeLoggedKcal);
    const harness = fitCalibration(withLoggedIntake(base, BATTERY_START, logged));
    if (!harness) throw new Error('harness');
    const scaled = prototypeFit(store, today, { carbSource: 'harness_scaled', includeWarmStartHistory: true });
    const baseline = prototypeFit(store, today, { includeWarmStartHistory: true });
    const defaults = prototypeFit(store, today);
    const plan = store.plan;
    if (!plan) throw new Error('plan');
    const window = scaled.trace.days;
    const meanLogged = window.reduce((s, d) => s + d.intakeKcal, 0) / window.length;
    const planCarbShare = (plan.macros.carbsG * 4) / plan.calorieTarget;
    rows.push({
      fixture: fx.id,
      seed,
      ...profileColumns(world),
      horizon: fx.h,
      adherence_declared: fx.adherence ?? 'on_plan',
      warm_start_history: fx.bp.evidence !== null,
      harness_q10: harness.posterior.interval80[0],
      harness_q50: harness.posterior.medianKcal,
      harness_q90: harness.posterior.interval80[1],
      scaled_q10: scaled.fit.posterior.interval80[0],
      scaled_q50: scaled.fit.posterior.medianKcal,
      scaled_q90: scaled.fit.posterior.interval80[1],
      baseline_q10: baseline.fit.posterior.interval80[0],
      baseline_q50: baseline.fit.posterior.medianKcal,
      baseline_q90: baseline.fit.posterior.interval80[1],
      default_q50: defaults.fit.posterior.medianKcal,
      logged_days: scaled.trace.counts.logged,
      window_days: window.length,
      mean_logged_kcal: meanLogged,
      plan_carb_share: planCarbShare,
      baseline_carb_share: base.baselineCarbFraction,
      // D5 gap: carbohydrate kcal/day of the baseline rule minus the harness scaling, window mean.
      carb_gap_kcal: meanLogged * (base.baselineCarbFraction - planCarbShare),
    });
  });
  writeRows('n1/n1', rows);
}

// ---------------------------------------------------------------------------
// N2: support and grid-bound mass (prototype, NASEM prior), horizons 28 and 84 days
// ---------------------------------------------------------------------------

export const N2_HORIZONS = [28, 84] as const;
const N2_USERS = 500;

function n2Row(world: JournalWorld, h: number, extra: FitSummary): FitSummary {
  const today = addDays(BATTERY_START, h);
  const proto = prototypeFit(storeAt(world.store, h), today);
  const truth = truthsAt(world, h, proto.nasemAtStartKcal);
  return { ...extra, ...profileColumns(world), horizon: h, gate_met: proto.gateMet, truth_real: truth.real, truth_logged: truth.logged, reference_shift: truth.referenceShift, ...summarizeFit(proto.fit, truth.logged) };
}

export function runN2Shard(shard: number, shardCount: number): void {
  const n = N2_USERS * N_SCALE;
  const profiles = batteryProfiles(n, 200_000);
  const rows: FitSummary[] = [];
  for (let i = shard; i < n; i += shardCount) {
    const bp = profiles[i] as BatteryProfile;
    const seed = 210_000 + i;
    const draws = userDraws(seed);
    const weighEveryDays = i % 2 === 0 ? 1 : 3;
    const sigma = profileSigma(bp);
    for (const pop of POPULATIONS) {
      const variants = pop.role === 'principal' ? (['normal', 't3'] as const) : (['normal'] as const);
      for (const variant of variants) {
        const { offset, redraws } = admissibleOffset(variant, seed, sigma, bp);
        const world = simulateJournalWorld(bp, { days: 84, weighEveryDays, trueOffsetKcal: offset, u: drawU(pop, bmiOfProfile(bp), draws.uZ) }, worldRngs(seed));
        for (const h of N2_HORIZONS) rows.push(n2Row(world, h, { user: i, seed, population: pop.key, role: pop.role, offset_law: variant, offset_redraws: redraws }));
      }
    }
  }
  writeRows(`n2${PASS}/n2-shard${shard}`, rows);
}

/** Stress (reported, no threshold): u from -40 % to +20 %, real intake up to 3 500 kcal/day. */
export function runN2Stress(shard: number, shardCount: number): void {
  const users = 20;
  const profiles = batteryProfiles(users, 250_000);
  const rows: FitSummary[] = [];
  let k = 0;
  for (const u of [-0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2]) {
    for (const intake of ['target', 3500] as const) {
      for (let i = 0; i < users; i++, k++) {
        if (k % shardCount !== shard) continue;
        const bp = profiles[i] as BatteryProfile;
        const seed = 260_000 + i;
        const draws = userDraws(seed);
        const sigma = profileSigma(bp);
        const world = simulateJournalWorld(bp, { days: 84, weighEveryDays: i % 2 === 0 ? 1 : 3, trueOffsetKcal: sigma * draws.offsetZ, u, ...(intake === 3500 ? { realIntakeKcal: 3500 } : {}) }, worldRngs(seed));
        for (const h of N2_HORIZONS) rows.push(n2Row(world, h, { user: i, seed, population: `stress_u${u}_${intake}`, role: 'stress', offset_law: 'normal' }));
      }
    }
  }
  writeRows(`n2${PASS}/stress-shard${shard}`, rows);
}

// ---------------------------------------------------------------------------
// N3: well-specified world, current path and prototype (u = 0), with and without the structural floor
// ---------------------------------------------------------------------------

export const N3_HORIZONS = [14, 28, 42, 84] as const;
const N3_USERS_PER_FREQUENCY = 250;

export function runN3Shard(shard: number, shardCount: number): void {
  const n = 2 * N3_USERS_PER_FREQUENCY * N_SCALE;
  const profiles = batteryProfiles(n, 300_000);
  const rows: FitSummary[] = [];
  for (let i = shard; i < n; i += shardCount) {
    const bp = profiles[i] as BatteryProfile;
    const seed = 310_000 + i;
    const draws = userDraws(seed);
    const sigma = profileSigma(bp);
    const world = simulateJournalWorld(bp, { days: 84, weighEveryDays: i % 2 === 0 ? 1 : 3, trueOffsetKcal: sigma * draws.offsetZ, u: 0 }, worldRngs(seed));
    for (const h of N3_HORIZONS) {
      const today = addDays(BATTERY_START, h);
      const store = storeAt(world.store, h);
      const current = currentPathFit(store, today);
      const proto = prototypeFit(store, today);
      for (const [path, r] of [
        ['current', current],
        ['prototype', proto],
      ] as const) {
        const truth = truthsAt(world, h, r.nasemAtStartKcal);
        // Without floor = information posterior = the fit with structuralSdKcal 0 (calibration.ts: posterior is the
        // information posterior when the SD is 0), so one fit gives both.
        rows.push({ user: i, seed, path, ...profileColumns(world), horizon: h, gate_met: r.gateMet, truth_real: truth.real, truth_logged: truth.logged, reference_shift: truth.referenceShift, ...summarizeFit(r.fit, truth.logged) });
      }
    }
  }
  writeRows(`n3${PASS}/n3-shard${shard}`, rows);
}

// ---------------------------------------------------------------------------
// N4: bias attribution in logged units, priors nasem / flat / widened
// ---------------------------------------------------------------------------

export const N4_HORIZONS = [14, 28, 42] as const;
const N4_USERS = 250;
const N4_PRIORS: JournalPrior[] = ['nasem', 'flat', 'widened'];

export function runN4Shard(shard: number, shardCount: number): void {
  const n = N4_USERS * N_SCALE;
  const profiles = batteryProfiles(n, 400_000);
  const rows: FitSummary[] = [];
  for (let i = shard; i < n; i += shardCount) {
    const bp = profiles[i] as BatteryProfile;
    const seed = 410_000 + i;
    const draws = userDraws(seed);
    const sigma = profileSigma(bp);
    for (const pop of POPULATIONS.filter((p) => p.role === 'principal')) {
      const world = simulateJournalWorld(bp, { days: 42, weighEveryDays: i % 2 === 0 ? 1 : 3, trueOffsetKcal: sigma * draws.offsetZ, u: drawU(pop, bmiOfProfile(bp), draws.uZ) }, worldRngs(seed));
      for (const h of N4_HORIZONS) {
        const today = addDays(BATTERY_START, h);
        const store = storeAt(world.store, h);
        for (const prior of N4_PRIORS) {
          const proto = prototypeFit(store, today, { journalPrior: prior });
          const truth = truthsAt(world, h, proto.nasemAtStartKcal);
          rows.push({ user: i, seed, population: pop.key, prior, ...profileColumns(world), horizon: h, gate_met: proto.gateMet, truth_real: truth.real, truth_logged: truth.logged, reference_shift: truth.referenceShift, ...summarizeFit(proto.fit, truth.logged) });
        }
      }
    }
  }
  writeRows(`n4${PASS}/n4-shard${shard}`, rows);
}

export function writeTiming(name: string, startedAt: number): void {
  writeJson(`timing/${name}${PASS}`, { ms: Date.now() - startedAt, nScale: N_SCALE });
}
