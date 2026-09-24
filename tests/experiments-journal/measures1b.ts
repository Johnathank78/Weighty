/**
 * Journal battery, phase 1b (prompt 35): measurements of the widened offset grid (N2 and N4 replayed), of the
 * short-horizon bias of the current path (s5) and of the over-confidence of the prototype (s6), plus the call timing
 * (s4.3). Measurement only. Each runner writes one raw CSV row per simulated user, arm and cell to
 * tests/experiments-journal/results/{n2g,n4g,sh,n3b,timing1b}/; tables are rebuilt from those files only (tables1b.experiment.ts).
 *
 * Declared seeds:
 * - n2g: the users of the phase 1 doubled pass n2x2 (profiles 200 000, n = 1 000, users 210 000 + i; stress 250 000 /
 *   260 000 + i), for a paired comparison;
 * - n4g: the users of n4x2 (profiles 400 000, n = 500, users 410 000 + i);
 * - sh (s5): new seeds, profiles 500 000, users 510 000 + i, n = 1 000;
 * - n3b (s6): new seeds, profiles 600 000, users 610 000 + i, n = 1 000;
 * - timing1b: profiles 700 000, users 710 000 + i, n = 50.
 * None of the new bases, nor their derived streams (+1 000 003, +2 000 003, +3 000 007, +4 000 007, +5 000 011), meets a
 * seed of a previous pass.
 */
import { performance } from 'node:perf_hooks';
import { computeJournalCalibration } from '@/domain/journalCalibration';
import { fitCalibration } from '@/science/calibration';
import type { CalibrationFit, Posterior } from '@/science/calibration';
import { addDays } from '@/science/dates';
import { assessBaseline } from '@/science/assessment';
import { isAdmissibleBaselineIntake } from '@/science/hall/model';
import {
  BATTERY_START,
  REGIME_BASE,
  batteryProfiles,
  currentPathFit,
  profileColumns,
  profileSigma,
  prototypeFit,
  simulateJournalWorld,
  storeAt,
  summarizeFit,
  truthsAt,
  worldRngs,
  writeJson,
  writeRows,
} from '../helpers/journalBattery';
import type { BatteryProfile, FitSummary, JournalPrior, JournalWorld, WorldSettings } from '../helpers/journalBattery';
import { createRng } from '../helpers/random';
import { POPULATIONS, drawU } from './measures';
import type { Population } from './measures';

/** Grid half-ranges measured (s3.2): +-1 200 is the control (production grid), +-2 000 and +-3 000 are widened. */
export const GRIDS = [1200, 2000, 3000] as const;

// Same draws as phase 1 (measures.ts): kept private there, reproduced verbatim here for the paired replays.
type UserDraws = { offsetZ: number; offsetT3: number; uZ: number };
function userDraws(seed: number): UserDraws {
  return { offsetZ: createRng(seed + 3_000_007).normal(), offsetT3: createRng(seed + 4_000_007).studentT(3), uZ: createRng(seed + 5_000_011).normal() };
}
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

/**
 * Masses at the bounds of the admissible support (first / last grid points with a finite log posterior, D-28): equal to
 * the grid-bound masses when no offset is excluded. With a widened grid the lowest grid points can be inadmissible
 * (NASEM + offset <= 1 kcal/day) and hold a zero mass by construction.
 */
function supportEdgeMass(p: Posterior, admissible: readonly boolean[]): { slow5: number; slow10: number; shigh5: number; shigh10: number; support_min: number; support_max: number } {
  const first = admissible.indexOf(true);
  const last = admissible.lastIndexOf(true);
  const sum = (from: number, to: number) => {
    let s = 0;
    for (let i = Math.max(first, from); i <= Math.min(last, to); i++) s += p.probabilities[i] as number;
    return s;
  };
  return { slow5: sum(first, first + 4), slow10: sum(first, first + 9), shigh5: sum(last - 4, last), shigh10: sum(last - 9, last), support_min: p.offsetsKcal[first] as number, support_max: p.offsetsKcal[last] as number };
}

/** Phase 1 summary (quantiles, PIT, grid-bound masses, with and without floor) plus means, SDs, support-bound masses, exclusions. */
export function summarizeFit1b(fit: CalibrationFit, truth: number, nasemAtStartKcal: number): FitSummary {
  const admissible = fit.posterior.offsetsKcal.map((o) => isAdmissibleBaselineIntake(nasemAtStartKcal + o));
  const withFloor = supportEdgeMass(fit.posterior, admissible);
  const noFloor = supportEdgeMass(fit.informationPosterior, admissible);
  return {
    ...summarizeFit(fit, truth),
    mean: fit.posterior.meanKcal,
    sd: fit.posterior.sdKcal,
    nf_mean: fit.informationPosterior.meanKcal,
    nf_sd: fit.informationPosterior.sdKcal,
    slow5: withFloor.slow5,
    slow10: withFloor.slow10,
    shigh5: withFloor.shigh5,
    shigh10: withFloor.shigh10,
    nf_slow10: noFloor.slow10,
    nf_shigh10: noFloor.shigh10,
    support_min: withFloor.support_min,
    support_max: withFloor.support_max,
    grid_points: fit.posterior.offsetsKcal.length,
    excluded_offsets: fit.excludedOffsetCount,
  };
}

// ---------------------------------------------------------------------------
// s4.1 N2 replayed on the users of n2x2, three grids
// ---------------------------------------------------------------------------

const N2_HORIZONS = [28, 84] as const;
const N2X2_USERS = 1000;

function n2gRows(world: JournalWorld, extra: FitSummary): FitSummary[] {
  const rows: FitSummary[] = [];
  for (const h of N2_HORIZONS) {
    const today = addDays(BATTERY_START, h);
    const store = storeAt(world.store, h);
    for (const grid of GRIDS) {
      const proto = prototypeFit(store, today, { offsetGridHalfRangeKcal: grid });
      const truth = truthsAt(world, h, proto.nasemAtStartKcal);
      rows.push({ ...extra, grid, ...profileColumns(world), horizon: h, gate_met: proto.gateMet, truth_real: truth.real, truth_logged: truth.logged, reference_shift: truth.referenceShift, nasem_start: proto.nasemAtStartKcal, ...summarizeFit1b(proto.fit, truth.logged, proto.nasemAtStartKcal) });
    }
  }
  return rows;
}

export function runN2gShard(shard: number, shardCount: number): void {
  const profiles = batteryProfiles(N2X2_USERS, 200_000);
  const rows: FitSummary[] = [];
  for (let i = shard; i < N2X2_USERS; i += shardCount) {
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
        rows.push(...n2gRows(world, { user: i, seed, population: pop.key, role: pop.role, offset_law: variant, offset_redraws: redraws }));
      }
    }
  }
  writeRows(`n2g/n2g-shard${shard}`, rows);
}

/** Stress of phase 1 (same 20 users, 250 000 / 260 000 + i), three grids. */
export function runN2gStress(shard: number, shardCount: number): void {
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
        rows.push(...n2gRows(world, { user: i, seed, population: `stress_u${u}_${intake}`, role: 'stress', offset_law: 'normal' }));
      }
    }
  }
  writeRows(`n2g/stress-shard${shard}`, rows);
}

// ---------------------------------------------------------------------------
// s4.2 N4 replayed on the users of n4x2, three priors x three grids
// ---------------------------------------------------------------------------

const N4_HORIZONS = [14, 28, 42] as const;
const N4X2_USERS = 500;
const N4_PRIORS: JournalPrior[] = ['nasem', 'flat', 'widened'];

export function runN4gShard(shard: number, shardCount: number): void {
  const profiles = batteryProfiles(N4X2_USERS, 400_000);
  const rows: FitSummary[] = [];
  for (let i = shard; i < N4X2_USERS; i += shardCount) {
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
          for (const grid of GRIDS) {
            const proto = prototypeFit(store, today, { journalPrior: prior, offsetGridHalfRangeKcal: grid });
            const truth = truthsAt(world, h, proto.nasemAtStartKcal);
            rows.push({ user: i, seed, population: pop.key, prior, grid, ...profileColumns(world), horizon: h, gate_met: proto.gateMet, truth_real: truth.real, truth_logged: truth.logged, reference_shift: truth.referenceShift, nasem_start: proto.nasemAtStartKcal, ...summarizeFit1b(proto.fit, truth.logged, proto.nasemAtStartKcal) });
          }
        }
      }
    }
  }
  writeRows(`n4g/n4g-shard${shard}`, rows);
}

// ---------------------------------------------------------------------------
// s5 Short-horizon bias of the current path, flat prior
// ---------------------------------------------------------------------------

const SH_USERS = 1000;
const SH_HORIZONS = [14, 28, 42] as const;

/**
 * World of N4 with u = 0: the user eats exactly the plan target, which the current path assumes, so the truth is the
 * offset (in the estimator's reference). Arms, paired on the same users, current path:
 * b1 flat prior, grid +-1 200; b1p flat, +-3 000; b2 flat, +-3 000, noiseless onboarding weigh-in; b3 flat, +-3 000,
 * every weigh-in with a noise scale of 0.05 kg; control: NASEM prior, production grid (no option), nominal world.
 */
export function runShShard(shard: number, shardCount: number): void {
  const profiles = batteryProfiles(SH_USERS, 500_000);
  const rows: FitSummary[] = [];
  for (let i = shard; i < SH_USERS; i += shardCount) {
    const bp = profiles[i] as BatteryProfile;
    const seed = 510_000 + i;
    const draws = userDraws(seed);
    const sigma = profileSigma(bp);
    const base: WorldSettings = { days: 42, weighEveryDays: i % 2 === 0 ? 1 : 3, trueOffsetKcal: sigma * draws.offsetZ, u: 0 };
    const nominal = simulateJournalWorld(bp, base, worldRngs(seed));
    const exactFirst = simulateJournalWorld(bp, { ...base, firstWeighInExact: true }, worldRngs(seed));
    const lowNoise = simulateJournalWorld(bp, { ...base, weighNoiseScaleKg: 0.05 }, worldRngs(seed));
    const arms: Array<{ arm: string; world: JournalWorld; overrides: { priorSigmaKcal?: number; offsetGridHalfRangeKcal?: number } }> = [
      { arm: 'b1', world: nominal, overrides: { priorSigmaKcal: Number.POSITIVE_INFINITY, offsetGridHalfRangeKcal: 1200 } },
      { arm: 'b1p', world: nominal, overrides: { priorSigmaKcal: Number.POSITIVE_INFINITY, offsetGridHalfRangeKcal: 3000 } },
      { arm: 'b2', world: exactFirst, overrides: { priorSigmaKcal: Number.POSITIVE_INFINITY, offsetGridHalfRangeKcal: 3000 } },
      { arm: 'b3', world: lowNoise, overrides: { priorSigmaKcal: Number.POSITIVE_INFINITY, offsetGridHalfRangeKcal: 3000 } },
      { arm: 'control', world: nominal, overrides: {} },
    ];
    for (const h of SH_HORIZONS) {
      const today = addDays(BATTERY_START, h);
      for (const { arm, world, overrides } of arms) {
        const r = currentPathFit(storeAt(world.store, h), today, undefined, overrides);
        const truth = truthsAt(world, h, r.nasemAtStartKcal);
        rows.push({ user: i, seed, arm, ...profileColumns(world), horizon: h, gate_met: r.gateMet, truth_real: truth.real, truth_logged: truth.logged, reference_shift: truth.referenceShift, nasem_start: r.nasemAtStartKcal, ...summarizeFit1b(r.fit, truth.real, r.nasemAtStartKcal) });
      }
    }
  }
  writeRows(`sh/sh-shard${shard}`, rows);
}

// ---------------------------------------------------------------------------
// s6 Over-confidence of the prototype: N3 world, logging noise and D5 separated
// ---------------------------------------------------------------------------

const N3B_USERS = 1000;
const N3B_HORIZONS = [14, 28, 42, 84] as const;

/**
 * N3 world (offset drawn from the prior, u = 0), 84 days. Arms, paired: current path; p1 prototype, exact logging
 * (logged = real, no noise), carbohydrates 'harness_scaled'; p2 exact logging, baseline carbohydrates (D5 only);
 * p3 logging noise 8 %, 'harness_scaled' (noise only); p4 noisy logging, baseline carbohydrates (phase 1 configuration).
 * The two worlds differ by the logging noise only (separate streams: same weigh-ins, same offset).
 */
export function runN3bShard(shard: number, shardCount: number): void {
  const profiles = batteryProfiles(N3B_USERS, 600_000);
  const rows: FitSummary[] = [];
  for (let i = shard; i < N3B_USERS; i += shardCount) {
    const bp = profiles[i] as BatteryProfile;
    const seed = 610_000 + i;
    const draws = userDraws(seed);
    const sigma = profileSigma(bp);
    const base: WorldSettings = { days: 84, weighEveryDays: i % 2 === 0 ? 1 : 3, trueOffsetKcal: sigma * draws.offsetZ, u: 0 };
    const noisy = simulateJournalWorld(bp, base, worldRngs(seed));
    const exact = simulateJournalWorld(bp, { ...base, loggingNoiseSd: 0 }, worldRngs(seed));
    for (const h of N3B_HORIZONS) {
      const today = addDays(BATTERY_START, h);
      const noisyStore = storeAt(noisy.store, h);
      const exactStore = storeAt(exact.store, h);
      const arms = [
        { arm: 'current', world: noisy, r: currentPathFit(noisyStore, today) },
        { arm: 'p1', world: exact, r: prototypeFit(exactStore, today, { carbSource: 'harness_scaled' }) },
        { arm: 'p2', world: exact, r: prototypeFit(exactStore, today) },
        { arm: 'p3', world: noisy, r: prototypeFit(noisyStore, today, { carbSource: 'harness_scaled' }) },
        { arm: 'p4', world: noisy, r: prototypeFit(noisyStore, today) },
      ];
      for (const { arm, world, r } of arms) {
        const truth = truthsAt(world, h, r.nasemAtStartKcal);
        rows.push({ user: i, seed, arm, ...profileColumns(world), logging_noise_sd: world === exact ? 0 : 0.08, horizon: h, gate_met: r.gateMet, truth_real: truth.real, truth_logged: truth.logged, reference_shift: truth.referenceShift, nasem_start: r.nasemAtStartKcal, ...summarizeFit1b(r.fit, truth.logged, r.nasemAtStartKcal) });
      }
    }
  }
  writeRows(`n3b/n3b-shard${shard}`, rows);
}

// ---------------------------------------------------------------------------
// s4.3 Timing of one journal-regime calibration call, 84 days of daily weigh-ins, full journal
// ---------------------------------------------------------------------------

const TIMING_USERS = 50;

/**
 * One process, nothing else running. For each of the 50 generator profiles (P10 logging bias, daily weigh-ins, 84 days,
 * full journal): one untimed warm-up call per grid, then one timed call per grid in the order 1 200, 2 000, 3 000.
 * Timed: `computeJournalCalibration` (store -> observations -> gate -> fit -> snapshot), and `fitCalibration` alone.
 */
export function runTiming(): void {
  const profiles = batteryProfiles(TIMING_USERS, 700_000);
  const today = addDays(BATTERY_START, 84);
  const rows: FitSummary[] = [];
  const p10 = POPULATIONS[2] as Population;
  for (let i = 0; i < TIMING_USERS; i++) {
    const bp = profiles[i] as BatteryProfile;
    const seed = 710_000 + i;
    const draws = userDraws(seed);
    const world = simulateJournalWorld(bp, { days: 84, weighEveryDays: 1, trueOffsetKcal: profileSigma(bp) * draws.offsetZ, u: drawU(p10, bmiOfProfile(bp), draws.uZ) }, worldRngs(seed));
    const store = storeAt(world.store, 84);
    const options = (grid: number) => ({ ...REGIME_BASE, journalRegimeStart: BATTERY_START, offsetGridHalfRangeKcal: grid });
    for (const grid of GRIDS) computeJournalCalibration(store, today, `${today}T08:00:00.000Z`, options(grid));
    for (const grid of GRIDS) {
      const t0 = performance.now();
      const state = computeJournalCalibration(store, today, `${today}T08:00:00.000Z`, options(grid));
      const t1 = performance.now();
      if (!state?.fit) throw new Error('timing fit');
      const t2 = performance.now();
      const refit = fitCalibration(state.prepared.input);
      const t3 = performance.now();
      if (!refit || refit.posterior.medianKcal !== state.fit.posterior.medianKcal) throw new Error('timing refit');
      rows.push({ user: i, seed, ...profileColumns(world), grid, weigh_ins: state.gate.weighInCount, window_days: state.fit.observationSpanDays, grid_points: state.fit.posterior.offsetsKcal.length, excluded_offsets: state.fit.excludedOffsetCount, call_ms: t1 - t0, fit_ms: t3 - t2 });
    }
  }
  writeRows('timing1b/timing', rows);
}

export function writeTiming1b(name: string, startedAt: number): void {
  writeJson(`timing1b/${name}`, { ms: Date.now() - startedAt });
}
