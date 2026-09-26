/**
 * Closed-loop simulator of the journal battery, iteration 2 (prompt 36 s5). Measurement only.
 *
 * A simulated user goes through the real domain use cases (onboarding, daily logs, adherence, steps, weigh-ins, food
 * journal, calibration state, recalibration) for 168 days; the plans he receives change what he eats.
 *
 * Arms (s5.4): A current method; J journal mode (prototype, flat prior, +-2 000 grid, logged-unit plan); C chosen target;
 * J-NASEM (P00 control); J-glucides (logged carbohydrates). All arms of one user share the world, the seeds and every
 * random draw (pre-drawn daily arrays). They are identical up to the revision proposal: the common part is simulated
 * once, then each arm continues from a copy of the state (bifurcation, s5.4). `simulateArmFromScratch` replays one arm
 * from day 0 with the same code, for the pairing control of s6.2.
 *
 * Day d: morning weigh-in (true weight + noise, when weighed), weekly evaluation on days 7, 14, ... (fixed day), then the
 * day's intake under the plan in force, the journal entries, the steps and the declared adherence, then one Hall day.
 */
import {
  addWeight,
  applyRecalibration,
  completeOnboarding,
  computeCalibrationState,
  currentWeightKg,
  enforcePlanGuardrails,
  ensureDailyLogs,
  markRecalibrationSeen,
  periodicReplan,
  planAgeDays,
  rebuildContextFromStore,
  setActualSteps,
  setAdherence,
  solverOptionsFor,
} from '@/domain/engine';
import type { SolverRequest } from '@/domain/engine';
import { addFoodEntry, journalDay } from '@/domain/journal';
import { evaluateJournalGate, journalCalibrationInputFromStore } from '@/domain/journalCalibration';
import type { JournalRegimeOptions } from '@/domain/journalCalibration';
import type { CurrentPlan, WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { netStepKcal } from '@/science/activity';
import { assessBaseline, planContextFrom } from '@/science/assessment';
import { buildSnapshot, evaluateGate, fitCalibration, shouldSurfaceRecalibration } from '@/science/calibration';
import type { CalibrationInput, GateStatus, SurfacingReference } from '@/science/calibration';
import { GAIN_RATE_HARD_MAX, KCAL_PER_G_CARB, KCAL_PER_G_FAT, KCAL_PER_G_PROTEIN, LOSS_UNAVAILABLE_BMI_BELOW } from '@/science/constants';
import { addDays } from '@/science/dates';
import { baselineCarbFractionFor, buildGoalPlan, guardrailMaxWeeklyRate, hardFloorKcal, macrosFor, maintenanceZone } from '@/science/goals';
import type { SolverOptions } from '@/science/goals';
import { bodyWeightOf } from '@/science/hall/model';
import type { HallState } from '@/science/hall/model';
import { bmi as bmiOfWeight } from '@/science/macros';
import { modeledBodyAt } from '@/science/modeledBody';
import type { Goal, UserProfile } from '@/science/types';
import { intervalWidth } from '@/science/uncertainty';
import { initWorldHall, NOMINAL_HALL_FACTORS, worldAdvance, worldBodyWeight, worldInitialState, worldTissueKg } from './closedLoopHall';
import type { HallFactors, WorldHall } from './closedLoopHall';
import { BATTERY_START, CASE_R, CASE_S } from './journalBattery';
import type { Activity, GoalKind } from './journalBattery';
import { makeProfile } from './profiles';
import { createRng } from './random';

export const SIM_START = BATTERY_START;
export const SIM_DAYS = 168;
export const EVAL_EVERY_DAYS = 7;
const iso = (date: string) => `${date}T07:00:00.000Z`;
const nowIsoOf = (date: string) => `${date}T08:00:00.000Z`;

// Fixed world and behaviour parameters (s5.1 to s5.3), declared before any measurement.
export const WEIGH_T_DF = 4;
export const WEIGH_T_SCALE_KG = 0.6;
/** Scenario D of the calibration benchmark (tests/helpers/mismatchBenchmark.ts): AR(1) water, phi 0.7, marginal SD 0.5 kg. */
export const AR_PHI = 0.7;
export const AR_MARGINAL_SD_KG = 0.5;
/** Scenario E: an episode starts with probability 0.08 a day, lasts 2 to 5 days, +/-0.5 to 1.0 kg. */
export const EPISODE_START_PROBABILITY = 0.08;
export const EPISODE_DAYS: readonly [number, number] = [2, 5];
export const EPISODE_KG: readonly [number, number] = [0.5, 1.0];
export const EATING_NOISE_SD = 0.08;
export const LOGGING_NOISE_SD = 0.08;
/** Real steps = target x (1 + 0.2 z), as in the mismatch generator (tests/helpers/mismatchWorld.ts). */
export const STEPS_NOISE_SD = 0.2;
export const DEVIATION_FACTOR = 1.25;
export const HALL_PERTURBATION = 0.2;
export const SHIFTS_KCAL = [-400, -270, -150, 150, 270] as const;
export const WEIGH_PROBABILITIES = [1, 0.9, 0.75] as const;
export const DEVIATION_FREQUENCIES = [0, 0.15, 0.3] as const;
export const LOSS_RATES = [0.005, 0.01] as const;
/**
 * Relaunch of iteration 2 (prompt 40 s5.1): share of the days a non-follower declares 'major_deviation' before the switch
 * (the other days are declared 'on_plan'). Absent from the slot: 0.8, the value of iterations 2 to 2c.
 */
export const MAJOR_SHARES = [0.8, 0.95, 1] as const;
export const DEFAULT_MAJOR_SHARE = 0.8;
const MEALS = [
  { time: '08:00', share: 0.25 },
  { time: '12:30', share: 0.4 },
  { time: '19:30', share: 0.35 },
] as const;
/** Ratio blocks (s7.2): weeks 5-8, 9-12 (window 1), 13-16, 17-20, 21-24 (window 2), [start, end] days of true weight. */
export const BLOCKS: ReadonlyArray<readonly [number, number]> = [
  [28, 56],
  [56, 84],
  [84, 112],
  [112, 140],
  [140, 168],
];

// ---------------------------------------------------------------------------
// Seeds
// ---------------------------------------------------------------------------

/**
 * Declared seed bases of iteration 2. User master seed = base + index (index < 100 000); derived streams = master +
 * k x 1 000 003 (k = 1 to 20); LHS seed = base + 999 983. Every value lies in [1.0e9, 2.6e9], disjoint from all the
 * seeds of phases 1 and 1b (all below 6.0e6 with their derived streams).
 */
export const SEED_BASES = {
  pilot2: 1_000_000_000,
  ideal: 1_050_000_000,
  pairing: 1_100_000_000,
  c1trainNonFollowers: 1_200_000_000,
  c1NonFollowers: 1_300_000_000,
  c1Followers: 1_400_000_000,
  c1x2NonFollowers: 1_500_000_000,
  c1x2Followers: 1_600_000_000,
  c2: 1_700_000_000,
  c6: 1_800_000_000,
  c2x2: 1_900_000_000,
  c6x2: 2_000_000_000,
} as const;
export const streamSeed = (master: number, k: number) => master + k * 1_000_003;
export const lhsSeed = (base: number) => base + 999_983;

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * 'steady' (iteration 2a, prompt 37 s4): regular non-follower, eats the target of the plan in force + s every day and
 * declares 'on_plan' every day.
 */
export type Behavior = 'follower' | 'nonfollower' | 'steady';
export type CarbWorld = 'base' | 'minus10' | 'plus10' | 'selective';
export type Population = { key: string; meanU: number; sdU: number; bmiSlope?: number; role: 'principal' | 'sensitivity' | 'c6' };

/** Populations of THRESHOLDS.md (identical to tests/experiments-journal/measures.ts), plus the C6 over-reporters. */
export const POPULATIONS: Record<string, Population> = {
  P00: { key: 'P00', meanU: 0, sdU: 0.03, role: 'principal' },
  P05: { key: 'P05', meanU: -0.05, sdU: 0.1, role: 'principal' },
  P10: { key: 'P10', meanU: -0.1, sdU: 0.1, role: 'principal' },
  P20: { key: 'P20', meanU: -0.2, sdU: 0.1, role: 'principal' },
  P10_sd20: { key: 'P10_sd20', meanU: -0.1, sdU: 0.2, role: 'sensitivity' },
  'P10_slope-5': { key: 'P10_slope-5', meanU: -0.1, sdU: 0.1, bmiSlope: -0.05, role: 'sensitivity' },
  'P10_slope-10': { key: 'P10_slope-10', meanU: -0.1, sdU: 0.1, bmiSlope: -0.1, role: 'sensitivity' },
};
export const PRINCIPAL = ['P00', 'P05', 'P10', 'P20'] as const;

export function drawU(pop: Population, bmi: number, z: number): number {
  const slope = pop.bmiSlope ?? 0;
  const position = Math.min(1, Math.max(0, (bmi - 22) / (35 - 22)));
  return pop.meanU + slope * position + pop.sdU * z;
}

/**
 * Bias drift of C2 (s8.1), as a change added to the user's own u from `startDay`: a ramp over `rampDays`, a step, or a
 * sine of the given amplitude and period.
 */
export type USchedule =
  | { kind: 'stable' }
  | { kind: 'ramp' | 'step'; delta: number; startDay: number; rampDays: number }
  | { kind: 'oscillation'; amplitude: number; periodDays: number; startDay: number };

export function uOn(schedule: USchedule, userU: number, d: number): number {
  if (schedule.kind === 'stable' || d < schedule.startDay) return userU;
  if (schedule.kind === 'oscillation') return userU + schedule.amplitude * Math.sin((2 * Math.PI * (d - schedule.startDay)) / schedule.periodDays);
  if (schedule.kind === 'step') return userU + schedule.delta;
  return userU + schedule.delta * Math.min(1, (d - schedule.startDay) / schedule.rampDays);
}

export type ProfileSlot = {
  key: string;
  sex: 'female' | 'male';
  bmiClass: string;
  activity: Activity | 'athlete';
  goal: GoalKind;
  profile: UserProfile;
  shiftKcal: number;
  weighProbability: number;
  deviationFrequency: number;
  /** Prompt 40 s5.1: share of the days declared 'major_deviation' by a non-follower. Absent: DEFAULT_MAJOR_SHARE. */
  majorShare?: number;
};

const BMIS = [21, 26, 31, 38] as const;
const GOALS: GoalKind[] = ['loss', 'maintenance', 'gain'];
export const bmiOf = (p: UserProfile) => p.currentWeightKg / (p.heightCm / 100) ** 2;
/** Loss target: the lowest weight allowed (BMI 18.5, TARGET_BMI_MIN), so that no target is reached within 168 days. */
const lossTargetKg = (heightCm: number) => Math.ceil(18.5 * (heightCm / 100) ** 2 * 10) / 10;

export function closedLoopProfile(sex: 'female' | 'male', bmi: number, activity: Activity, goal: GoalKind, ageYears: number, heightCm: number, lossRate: number): UserProfile {
  const h = Math.round(heightCm);
  const weight = Math.round(bmi * (h / 100) ** 2 * 10) / 10;
  return makeProfile({
    sexForEquation: sex,
    ageYears: Math.round(ageYears),
    heightCm: h,
    currentWeightKg: weight,
    averageSteps7d: activity === 'sedentary' ? 5000 : 7000,
    walkingPace: 'normal',
    occupation: 'seated',
    activities: activity === 'strength' ? [{ type: 'strength', sessionsPerWeek: 4, durationMin: 55, intensity: 'moderate' }] : [],
    goal,
    targetWeightKg: goal === 'loss' ? lossTargetKg(h) : goal === 'gain' ? Math.round(weight * 1.1 * 10) / 10 : weight,
    // BMI rule of s5.1: 0.25 %/week at BMI 21, 0.5 or 1.0 %/week from BMI 26; gain 0.25 %/week.
    weeklyRateTarget: goal === 'loss' ? (bmi < 22 ? 0.0025 : lossRate) : goal === 'gain' ? 0.0025 : 0,
  });
}

function permutation(n: number, rng: ReturnType<typeof createRng>): number[] {
  const p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [p[i], p[j]] = [p[j] as number, p[i] as number];
  }
  return p;
}

/**
 * Latin hypercube of n slots over sex, BMI, activity, goal, age, height (as in phase 1), plus the shift s, the weigh-in
 * probability, the deviation-day frequency and the loss rate (BMI 26 to 38). Every 25th slot is case R, then case S
 * (4 % each, loss at 1 %/week, no warm-start history), keeping the slot's s, weigh-in probability and deviation frequency.
 * `majorShareSeed` (prompt 40 s5.1): one more Latin dimension, the declared major-deviation share (MAJOR_SHARES), drawn
 * from its own generator after the others, so that every other dimension is unchanged; absent: no `majorShare`.
 */
export function closedLoopSlots(n: number, seed: number, majorShareSeed?: number): ProfileSlot[] {
  const rng = createRng(seed);
  const dims = Array.from({ length: 10 }, () => permutation(n, rng));
  const cell = (d: number, i: number, levels: number) => Math.floor(((dims[d] as number[])[i] as number) * levels / n);
  const unit = (d: number, i: number) => (((dims[d] as number[])[i] as number) + rng.next()) / n;
  const out: ProfileSlot[] = [];
  for (let i = 0; i < n; i++) {
    const sex = cell(0, i, 2) === 0 ? 'female' : 'male';
    const bmi = BMIS[cell(1, i, 4)] as number;
    const activity: Activity = cell(2, i, 2) === 0 ? 'sedentary' : 'strength';
    const goal = GOALS[cell(3, i, 3)] as GoalKind;
    const age = 19 + 46 * unit(4, i);
    const height = sex === 'female' ? 150 + 25 * unit(5, i) : 165 + 30 * unit(5, i);
    const shiftKcal = SHIFTS_KCAL[cell(6, i, 5)] as number;
    const weighProbability = WEIGH_PROBABILITIES[cell(7, i, 3)] as number;
    const deviationFrequency = DEVIATION_FREQUENCIES[cell(8, i, 3)] as number;
    const lossRate = LOSS_RATES[cell(9, i, 2)] as number;
    const common = { shiftKcal, weighProbability, deviationFrequency };
    if (i % 25 === 0 || i % 25 === 1) {
      const base = i % 25 === 0 ? CASE_R : CASE_S;
      const profile: UserProfile = { ...base, targetWeightKg: lossTargetKg(base.heightCm), weeklyRateTarget: 0.01 };
      out.push({ key: i % 25 === 0 ? 'R' : 'S', sex: 'female', bmiClass: i % 25 === 0 ? 'case_R' : 'case_S', activity: 'strength', goal: 'loss', profile, ...common });
    } else {
      out.push({ key: `lhs${i}`, sex, bmiClass: String(bmi), activity, goal, profile: closedLoopProfile(sex, bmi, activity, goal, age, height, lossRate), ...common });
    }
  }
  if (majorShareSeed === undefined) return out;
  const shares = permutation(n, createRng(majorShareSeed));
  return out.map((slot, i) => ({ ...slot, majorShare: MAJOR_SHARES[Math.floor(((shares[i] as number) * MAJOR_SHARES.length) / n)] as number }));
}

/**
 * C6 athlete-like slots (s8.2): age 19 to 35, strength 4 x 60 min plus running 2 x 60 min (6 h and 6 sessions a week),
 * body fat measured by DXA so that the energy availability can be computed.
 */
export function athleteSlots(n: number, seed: number): ProfileSlot[] {
  const rng = createRng(seed);
  const out: ProfileSlot[] = [];
  for (let i = 0; i < n; i++) {
    const sex = i % 2 === 0 ? 'female' : 'male';
    const goal = GOALS[i % 3] as GoalKind;
    const age = 19 + 16 * rng.next();
    const height = sex === 'female' ? 155 + 20 * rng.next() : 168 + 25 * rng.next();
    const bmi = 21 + 5 * rng.next();
    const h = Math.round(height);
    const weight = Math.round(bmi * (h / 100) ** 2 * 10) / 10;
    const lossRate = LOSS_RATES[i % 2] as number;
    const cap = bmi < 22 ? 0.0025 : bmi < 25 ? 0.005 : 0.01;
    const profile = makeProfile({
      sexForEquation: sex,
      ageYears: Math.round(age),
      heightCm: h,
      currentWeightKg: weight,
      averageSteps7d: 9000,
      walkingPace: 'normal',
      occupation: 'seated',
      bodyFatPercent: sex === 'female' ? 20 + 6 * rng.next() : 11 + 6 * rng.next(),
      bodyFatMethod: 'dxa',
      activities: [
        { type: 'strength', sessionsPerWeek: 4, durationMin: 60, intensity: 'vigorous' },
        { type: 'running', sessionsPerWeek: 2, durationMin: 60, intensity: 'moderate' },
      ],
      goal,
      targetWeightKg: goal === 'loss' ? lossTargetKg(h) : goal === 'gain' ? Math.round(weight * 1.1 * 10) / 10 : weight,
      // BMI rule of s5.1 (loss rate at most the BMI cap).
      weeklyRateTarget: goal === 'loss' ? Math.min(lossRate, cap) : goal === 'gain' ? 0.0025 : 0,
    });
    out.push({
      key: `ath${i}`,
      sex,
      bmiClass: 'athlete',
      activity: 'athlete',
      goal,
      profile,
      shiftKcal: SHIFTS_KCAL[i % 5] as number,
      weighProbability: WEIGH_PROBABILITIES[i % 3] as number,
      deviationFrequency: DEVIATION_FREQUENCIES[Math.floor(i / 3) % 3] as number,
    });
  }
  return out;
}

export type UserSpec = {
  pass: string;
  index: number;
  master: number;
  slot: ProfileSlot;
  behavior: Behavior;
  population: Population;
  /** u of the user (logged / eaten - 1), before any C2 drift. */
  u: number;
  uSchedule: USchedule;
  trueOffsetKcal: number;
  hall: HallFactors;
  carbWorld: CarbWorld;
  /** Acceptance probability of the revision proposal and of every surfaced recalibration (s3.7: 1, or 0.7 in sensitivity). */
  acceptance: number;
  /** After the switch the user keeps his habits (J) or T_c (C) to the end (s5.3, robustness). */
  robustness: boolean;
  /** Control 6.1: nominal Hall, noiseless weigh-ins, u = 0, perfect followers. */
  ideal: boolean;
  /** C6 over-reporters: u drawn from U(lo, hi) instead of the population law. */
  uUniform?: readonly [number, number];
  /** Iteration 2a (prompt 37): solver options of every plan of the user (onboarding and recalibrations). Absent: production solver. */
  solver?: SolverRequest;
  /** Iteration 2b (prompt 38 s3.1): periodic replan when the plan in force reaches this age, days (with `solver`). Absent: none. */
  replanEveryDays?: number;
  /**
   * Iteration 2c (prompt 39 s3.2): guardrails of the plan in force (`enforcePlanGuardrails`, G1 and G2) on every weekly
   * evaluation day, before the calibration evaluation, with the user's solver options. Absent: none.
   */
  planGuardrails?: boolean;
};

export type SpecOptions = {
  pass: string;
  behavior: Behavior;
  population: Population;
  carbWorld?: CarbWorld;
  acceptance?: number;
  robustness?: boolean;
  ideal?: boolean;
  uSchedule?: USchedule;
  uUniform?: readonly [number, number];
  solver?: SolverRequest;
  replanEveryDays?: number;
  planGuardrails?: boolean;
};

/** Offset ~ N(0, sigma of the profile prior), redrawn from the same stream while NASEM + offset is not admissible. */
export function makeSpec(slot: ProfileSlot, base: number, index: number, o: SpecOptions): UserSpec {
  const master = base + index;
  const assessment = assessBaseline(slot.profile, SIM_START);
  const sigma = assessment.sigma.sigmaKcal;
  const offsetRng = createRng(streamSeed(master, 11));
  let trueOffsetKcal = sigma * offsetRng.normal();
  while (!(assessment.populationTdeeKcal + trueOffsetKcal > 1)) trueOffsetKcal = sigma * offsetRng.normal();
  const uRng = createRng(streamSeed(master, 12));
  const uZ = uRng.normal();
  const uUniformDraw = uRng.next();
  const u = o.ideal ? 0 : o.uUniform ? o.uUniform[0] + (o.uUniform[1] - o.uUniform[0]) * uUniformDraw : drawU(o.population, bmiOf(slot.profile), uZ);
  const hRng = createRng(streamSeed(master, 13));
  const draw = () => 1 - HALL_PERTURBATION + 2 * HALL_PERTURBATION * hRng.next();
  const hall: HallFactors = o.ideal ? NOMINAL_HALL_FACTORS : { betaAt: draw(), etaF: draw(), etaL: draw(), forbesC: draw(), glycogenWater: draw() };
  return {
    pass: o.pass,
    index,
    master,
    slot,
    behavior: o.behavior,
    population: o.population,
    u,
    uSchedule: o.uSchedule ?? { kind: 'stable' },
    trueOffsetKcal,
    hall,
    carbWorld: o.carbWorld ?? 'base',
    acceptance: o.acceptance ?? 1,
    robustness: o.robustness ?? false,
    ideal: o.ideal ?? false,
    ...(o.uUniform ? { uUniform: o.uUniform } : {}),
    ...(o.solver ? { solver: o.solver } : {}),
    ...(o.replanEveryDays !== undefined ? { replanEveryDays: o.replanEveryDays } : {}),
    ...(o.planGuardrails ? { planGuardrails: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// Daily draws (shared by every arm of a user)
// ---------------------------------------------------------------------------

export type DailyDraws = {
  weighNoiseKg: number[];
  weighed: boolean[];
  zEat: number[];
  zLog: number[];
  zSteps: number[];
  adherenceU: number[];
  deviation: boolean[];
  proposalAcceptU: number;
  recalAcceptU: number[];
};

export function dailyDraws(spec: UserSpec): DailyDraws {
  const n = SIM_DAYS + 1;
  const s = (k: number) => createRng(streamSeed(spec.master, k));
  const t = s(1);
  const ar = s(2);
  const ep = s(3);
  const wg = s(4);
  const eat = s(5);
  const lg = s(6);
  const st = s(7);
  const ad = s(8);
  const dv = s(9);
  const acc = s(10);
  const weighNoiseKg: number[] = [];
  let arState = AR_MARGINAL_SD_KG * ar.normal();
  let episodeLeft = 0;
  let episodeKg = 0;
  for (let d = 0; d < n; d++) {
    if (d > 0) arState = AR_PHI * arState + AR_MARGINAL_SD_KG * Math.sqrt(1 - AR_PHI * AR_PHI) * ar.normal();
    if (episodeLeft === 0 && ep.chance(EPISODE_START_PROBABILITY)) {
      episodeLeft = ep.int(EPISODE_DAYS[0], EPISODE_DAYS[1]);
      episodeKg = (ep.chance(0.5) ? 1 : -1) * ep.uniform(EPISODE_KG[0], EPISODE_KG[1]);
    }
    const episode = episodeLeft > 0 ? episodeKg : 0;
    if (episodeLeft > 0) episodeLeft--;
    const tNoise = WEIGH_T_SCALE_KG * t.studentT(WEIGH_T_DF);
    weighNoiseKg.push(spec.ideal ? 0 : tNoise + arState + episode);
  }
  const weighed = Array.from({ length: n }, (_, d) => {
    const draw = wg.next();
    return d === 0 || spec.ideal || draw < spec.slot.weighProbability;
  });
  // Draws are always consumed, so the ideal world keeps the same streams.
  const normals = (rng: ReturnType<typeof createRng>) =>
    Array.from({ length: n }, () => {
      const z = rng.normal();
      return spec.ideal ? 0 : z;
    });
  const zEat = normals(eat);
  const zLog = normals(lg);
  const zSteps = normals(st);
  const adherenceU = Array.from({ length: n }, () => {
    const a = ad.next();
    return spec.ideal ? 0 : a;
  });
  const deviation = Array.from({ length: n }, () => dv.next() < spec.slot.deviationFrequency && !spec.ideal);
  const proposalAcceptU = acc.next();
  const recalAcceptU = Array.from({ length: 40 }, () => acc.next());
  return { weighNoiseKg, weighed, zEat, zLog, zSteps, adherenceU, deviation, proposalAcceptU, recalAcceptU };
}

// ---------------------------------------------------------------------------
// Arms
// ---------------------------------------------------------------------------

export type JournalArmSettings = {
  prior: 'flat' | 'nasem';
  gridHalfRangeKcal: number;
  /** Floor multiplier of the journal plan: 1.1 (raised) or undefined (floor applied to the logged figure, s3.6). */
  floorMultiplier: number | undefined;
  carbSource: 'baseline' | 'logged';
  /** X of s3.3. */
  densityX: number;
};
export type ArmConfig = { key: string; kind: 'A' } | { key: string; kind: 'C' } | { key: string; kind: 'J'; journal: JournalArmSettings };

export const journalArm = (key: string, densityX: number, over: Partial<JournalArmSettings> = {}): ArmConfig => ({
  key,
  kind: 'J',
  journal: { prior: 'flat', gridHalfRangeKcal: 2000, floorMultiplier: 1.1, carbSource: 'baseline', densityX, ...over },
});

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

export type World = {
  spec: UserSpec;
  draws: DailyDraws;
  initialStore: WheightyStore;
  onboardingPlan: CurrentPlan;
  hall: WorldHall;
  trueStartKg: number;
  nasemDeclaredKcal: number;
  /** Baseline carbohydrate share of the estimator (D5, D-16), at the declared weight. */
  baseCarbFraction: number;
  /** Carbohydrate share actually eaten (s5.2 and s7.3 worlds). */
  eatenCarbFraction: number;
  palCategory: CurrentPlan['palCategory'];
  maintenanceSteps: number;
  heightM: number;
};

export function buildWorld(spec: UserSpec): World {
  const profile = spec.slot.profile;
  const onboarding = completeOnboarding(emptyStore(), profile, SIM_START, iso(SIM_START), null, spec.solver);
  if (!onboarding.ok) throw new Error(`onboarding failed (${spec.slot.key}): ${onboarding.reason}`);
  const plan = onboarding.store.plan;
  if (!plan) throw new Error('no plan');
  const palCategory = onboarding.store.meta.initialPalCategory ?? plan.palCategory;
  const draws = dailyDraws(spec);
  const declared = profile.currentWeightKg;
  const declaredAssessment = assessBaseline(profile, SIM_START, { weightKg: declared, palCategory });
  const nasemDeclaredKcal = declaredAssessment.populationTdeeKcal;
  const baseCarbFraction = baselineCarbFractionFor(planContextFrom(profile, declaredAssessment, nasemDeclaredKcal), plan.goal);
  const eatenCarbFraction = baseCarbFraction + (spec.carbWorld === 'minus10' ? -0.1 : spec.carbWorld === 'plus10' ? 0.1 : 0);
  // The onboarding weight is a weigh-in of the true starting weight (phase 1 convention).
  const trueStartKg = declared - (draws.weighNoiseKg[0] as number);
  const trueAssessment = assessBaseline({ ...profile, currentWeightKg: trueStartKg }, SIM_START, { weightKg: trueStartKg, palCategory });
  const hq = profile.bodyFatMethod !== undefined && profile.bodyFatPercent !== undefined;
  const hall = initWorldHall(
    {
      sex: profile.sexForEquation,
      ageYears: profile.ageYears,
      heightM: profile.heightCm / 100,
      bodyWeightKg: trueStartKg,
      // True maintenance at the start = NASEM at the declared weight + offset (phase 1 convention).
      baselineIntakeKcal: nasemDeclaredKcal + spec.trueOffsetKcal,
      baselineRmrKcal: trueAssessment.ree.reeKcalDay,
      initialFatKg: hq ? (trueStartKg * (profile.bodyFatPercent as number)) / 100 : undefined,
      // Habitual diet before the program: the baseline share (the +/-10-point worlds change what is eaten from day 0).
      baselineCarbFraction: baseCarbFraction,
    },
    spec.hall,
  );
  return { spec, draws, initialStore: onboarding.store, onboardingPlan: plan, hall, trueStartKg, nasemDeclaredKcal, baseCarbFraction, eatenCarbFraction, palCategory, maintenanceSteps: profile.averageSteps7d, heightM: profile.heightCm / 100 };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type Mode = 'pre' | 'A' | 'J' | 'C';

export type PlanRecord = {
  day: number;
  kind: 'onboarding' | 'recal_current' | 'recal_journal' | 'chosen_target' | 'replan_periodic' | 'replan_periodic_journal' | 'guardrail_g1' | 'guardrail_g2';
  calorieTarget: number;
  weeklyRateTarget: number;
  requestedWeeklyRate: number;
  maintenanceKcal: number;
  proteinG: number;
  hardFloorKcal: number;
  lowEnergyAvailability: boolean;
  energyAvailability: number | null;
  /** Journal plans: target of the oracle plan (true maintenance in logged units), same solver and floor. */
  oracleTarget?: number | null;
  /** Iteration 2a: trend weight the plan was computed at, true weight of the day, and the modeled weight (currentState). */
  trendWeightKg?: number;
  trueWeightKg?: number;
  modeledWeightKg?: number | null;
};

export type EvalRecord = {
  day: number;
  mode: Mode;
  gateMet: boolean;
  displayedMaintenanceKcal: number;
  offsetMedian: number | null;
  width80: number | null;
  surfaced: boolean;
  applied: boolean;
  /** Offset truths (estimator reference): real units, and logged units (+ window mean of logged - real). */
  truthReal: number;
  truthLogged: number | null;
  windowEndDay: number | null;
  gate?: Record<string, number | boolean>;
};

/** Iteration 2b (prompt 38 s5.4): one due periodic replan, applied or not. */
export type ReplanRecord = {
  day: number;
  mode: Mode;
  status: 'replanned' | 'no_snapshot' | 'failed';
  ageDays: number;
  targetBefore: number;
  targetAfter: number | null;
  reason?: string;
};

/**
 * Iteration 2c (prompt 39 s3.2): one guardrail event (G1 or G2) of a weekly evaluation day, applied or failed. `bmi`: BMI
 * of the app weight (trend) the guardrail was checked on; `reason`: the trigger (applied) or the rebuild failure (failed).
 */
export type GuardRecord = {
  day: number;
  rule: 'G1' | 'G2';
  /** Prompt 40 s3.13: mode of the day, and rebuild path ('current': `enforcePlanGuardrails`; 'journal': journal plan). */
  mode?: Mode;
  path?: 'current' | 'journal';
  status: 'applied' | 'failed';
  bmi: number;
  reason: string;
  targetBefore: number;
  rateBefore: number;
  targetAfter: number | null;
  rateAfter: number | null;
};

/**
 * Iteration 2c (prompt 39 s3.2, amendment 5 A5.4): S3-P check of a weekly evaluation day, once every step of the day is
 * applied (guardrails, calibration evaluation, periodic replan): the plan in force against the BMI of the app weight.
 */
export type S3pRecord = {
  day: number;
  appWeightKg: number;
  bmi: number;
  goal: Goal;
  rate: number;
  violation: boolean;
  /** Prompt 40 s4.3: the plan in force is the chosen target of arm C (not prescribed by the app): not checked. */
  exempt?: boolean;
};

/** Iteration 2b (prompt 38 s3.3): last journal plan applied, the base of a periodic replan in journal mode. */
export type JournalApplied = { offsetKcal: number; interval80: readonly [number, number]; interval95: readonly [number, number]; settings: JournalArmSettings };

export type SimState = {
  mode: Mode;
  store: WheightyStore;
  hall: HallState;
  proposalDay: number | null;
  accepted: boolean | null;
  switchDay: number | null;
  firstSwitchPlanDay: number | null;
  targeting: boolean;
  journalLastSurfaced: SurfacingReference | null;
  recalDays: number[];
  declinedRecals: number;
  planFailures: string[];
  evalIndex: number;
  tc: { median14: number; rounded: number; final: number; floor: number; replaced: boolean } | null;
  trueW: number[];
  realKcal: number[];
  loggedKcal: number[];
  loggedCarbsG: number[];
  realCarbsG: number[];
  realProteinG: number[];
  planTarget: number[];
  planRate: number[];
  planRequested: number[];
  planProteinG: number[];
  targetingDay: boolean[];
  deviationDay: boolean[];
  floorReal: number[];
  plans: PlanRecord[];
  evals: EvalRecord[];
  journalDiag: Record<number, { offsetMedian: number; truthLogged: number; truthReal: number; gateMet: boolean; displayed: number }>;
  /** Iteration 2b: true tissue mass of the world (fat + lean), day 0 to SIM_DAYS. */
  trueTissue: number[];
  /** Iteration 2b: every due periodic replan. */
  replans: ReplanRecord[];
  journalApplied: JournalApplied | null;
  /** Iteration 2c: guardrail events, S3-P checks of the weekly evaluation days. */
  guards: GuardRecord[];
  s3p: S3pRecord[];
  /** Iteration 2c, day 0 to SIM_DAYS - 1: goal and app floor (D-32, `hardFloorKcal`) of the plan in force, app weight (trend). */
  planGoal: Goal[];
  planFloor: number[];
  appW: number[];
  /**
   * Prompt 40 s3.10: arm C, the plan in force is still the chosen target (from the switch until it is replaced by a
   * recalibration of the current method or by a guardrail): no G2, no periodic replan, no S3-P check.
   */
  chosenTargetActive: boolean;
  /** Prompt 40 s5.5, day 0 to SIM_DAYS - 1: mode of the day (after the morning steps). */
  modeDay: Mode[];
};

function cloneState(s: SimState): SimState {
  return {
    ...s,
    recalDays: [...s.recalDays],
    planFailures: [...s.planFailures],
    tc: s.tc ? { ...s.tc } : null,
    trueW: [...s.trueW],
    realKcal: [...s.realKcal],
    loggedKcal: [...s.loggedKcal],
    loggedCarbsG: [...s.loggedCarbsG],
    realCarbsG: [...s.realCarbsG],
    realProteinG: [...s.realProteinG],
    planTarget: [...s.planTarget],
    planRate: [...s.planRate],
    planRequested: [...s.planRequested],
    planProteinG: [...s.planProteinG],
    targetingDay: [...s.targetingDay],
    deviationDay: [...s.deviationDay],
    floorReal: [...s.floorReal],
    plans: [...s.plans],
    evals: [...s.evals],
    journalDiag: { ...s.journalDiag },
    trueTissue: [...s.trueTissue],
    replans: [...s.replans],
    guards: [...s.guards],
    s3p: [...s.s3p],
    planGoal: [...s.planGoal],
    planFloor: [...s.planFloor],
    appW: [...s.appW],
    modeDay: [...s.modeDay],
  };
}

function planRecord(world: World, plan: CurrentPlan, day: number, kind: PlanRecord['kind'], ea: number | null, lowEa: boolean, oracleTarget?: number | null): PlanRecord {
  return {
    day,
    kind,
    calorieTarget: plan.calorieTarget,
    weeklyRateTarget: plan.weeklyRateTarget,
    requestedWeeklyRate: plan.requestedWeeklyRate ?? world.spec.slot.profile.weeklyRateTarget,
    maintenanceKcal: plan.maintenanceKcal,
    proteinG: plan.macros.proteinG,
    hardFloorKcal: plan.hardFloorKcal ?? Number.NaN,
    lowEnergyAvailability: lowEa,
    energyAvailability: ea,
    ...(oracleTarget !== undefined ? { oracleTarget } : {}),
  };
}

export function initialState(world: World): SimState {
  const plan = world.onboardingPlan;
  const ctx = rebuildContextFromStore(world.initialStore, SIM_START);
  const ea = ctx && ctx.highQualityFfmKg !== null && (ctx.athleteLike || ctx.highTrainingLoad) ? (plan.calorieTarget - ctx.exerciseNetKcalDay) / ctx.highQualityFfmKg : null;
  return {
    mode: 'pre',
    store: world.initialStore,
    hall: worldInitialState(world.hall),
    proposalDay: null,
    accepted: null,
    switchDay: null,
    firstSwitchPlanDay: null,
    targeting: false,
    journalLastSurfaced: null,
    recalDays: [],
    declinedRecals: 0,
    planFailures: [],
    evalIndex: 0,
    tc: null,
    trueW: [worldBodyWeight(world.hall, worldInitialState(world.hall))],
    realKcal: [],
    loggedKcal: [],
    loggedCarbsG: [],
    realCarbsG: [],
    realProteinG: [],
    planTarget: [],
    planRate: [],
    planRequested: [],
    planProteinG: [],
    targetingDay: [],
    deviationDay: [],
    floorReal: [],
    plans: [planRecord(world, plan, 0, 'onboarding', ea, plan.warnings?.lowEnergyAvailability === true)],
    evals: [],
    journalDiag: {},
    trueTissue: [worldTissueKg(world.hall, worldInitialState(world.hall))],
    replans: [],
    journalApplied: null,
    guards: [],
    s3p: [],
    planGoal: [],
    planFloor: [],
    appW: [],
    chosenTargetActive: false,
    modeDay: [],
  };
}

const dateOf = (d: number) => addDays(SIM_START, d);

function syncTodayLog(store: WheightyStore, date: string): WheightyStore {
  const plan = store.plan;
  if (!plan) return store;
  const withLogs = ensureDailyLogs(store, date);
  return {
    ...withLogs,
    dailyLogs: withLogs.dailyLogs.map((l) =>
      l.date === date ? { ...l, calorieTargetForDay: plan.calorieTarget, stepTargetForDay: plan.stepTarget, macrosForDay: { proteinG: plan.macros.proteinG, carbsG: plan.macros.carbsG, fatG: plan.macros.fatG } } : l,
    ),
  };
}

// ---------------------------------------------------------------------------
// Proposal (s3.7, s4.3) and chosen target (s4.5): harness only
// ---------------------------------------------------------------------------

/**
 * s4.3 (test function, not production): the revision proposal is triggered when the current gate has enough weigh-ins
 * (>= 5) and span (>= 14 days) but fails because the weigh-ins are not clean (major-deviation days dominate, D-11).
 */
export function revisionProposalTriggered(gate: GateStatus): boolean {
  return !gate.met && gate.criteria.enoughWeighIns && gate.criteria.enoughSpan && !gate.criteria.enoughCleanWeighIns;
}

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = (s.length - 1) / 2;
  return ((s[Math.floor(mid)] as number) + (s[Math.ceil(mid)] as number)) / 2;
}

/**
 * s4.5: sets the plan target to `targetKcal` from `date`, with the production macro solver, and the same floor check as a
 * computed target (below the hard floor D-32: replaced by the floor, and counted). The current method is not modified.
 */
export function withChosenTarget(store: WheightyStore, date: string, targetKcal: number): { store: WheightyStore; final: number; floor: number; replaced: boolean } {
  const plan = store.plan;
  const ctx = rebuildContextFromStore(store, date);
  if (!plan || !ctx) throw new Error('no plan');
  const floor = hardFloorKcal(ctx.reeKcal, ctx.sex);
  const replaced = targetKcal < floor;
  const final = replaced ? floor : targetKcal;
  const macros = macrosFor(ctx, plan.goal, final);
  const next: CurrentPlan = { ...plan, calorieTarget: final, macros: { ...macros.exact }, macrosDisplay: { ...macros.display }, proteinRule: macros.proteinRule };
  return { store: syncTodayLog({ ...store, plan: next }, date), final, floor, replaced };
}

// ---------------------------------------------------------------------------
// Journal plan (s4.1): production goal solver, journal maintenance in logged units, floor of the arm
// ---------------------------------------------------------------------------

/**
 * Solver options of a journal plan (prompt 38 s3.3), as `solverOptionsFor` does for the current method: under
 * currentState, the modeled body today from the journal calibration input (days rebuilt by `reconstructJournalDays`) at
 * the journal offset.
 */
export function journalSolverOptions(request: SolverRequest, input: CalibrationInput, offsetKcal: number, today: string): SolverOptions {
  const out: SolverOptions = { ...request };
  if (request.solverStart === 'currentState') {
    const body = modeledBodyAt(input, offsetKcal, today);
    out.modeledBody = body;
    if (body) out.modeledBodyAtOffsetDelta = (delta) => modeledBodyAt(input, offsetKcal + delta, today);
  }
  return out;
}

/**
 * Journal plan: production goal solver on the journal maintenance. `solver` (prompt 38 s3.3): the solver options of the
 * user (FX, horizon) with the journal calibration input of the day; absent: production solver, unchanged. `overrides`
 * (prompt 40 s3.13, guardrails in journal mode): goal and target weight of the rebuilt plan (G1: maintenance at the app
 * weight) and the step target kept from the plan in force; absent: goal and target of the plan in force, baseline steps.
 */
export function journalGoalPlan(
  store: WheightyStore,
  date: string,
  offsetKcal: number,
  floorMultiplier: number | undefined,
  solver?: { request: SolverRequest; input: CalibrationInput },
  overrides?: JournalPlanOverrides,
) {
  const profile = store.profile;
  const plan = store.plan;
  if (!profile || !plan) throw new Error('no plan');
  const weight = currentWeightKg(store) ?? profile.currentWeightKg;
  const palCategory = store.meta.initialPalCategory ?? plan.palCategory;
  const assessment = assessBaseline(profile, date, { weightKg: weight, palCategory });
  const maintenance = assessment.populationTdeeKcal + offsetKcal;
  const ctx = {
    ...planContextFrom(profile, assessment, maintenance),
    ...(floorMultiplier !== undefined ? { hardFloorMultiplier: floorMultiplier } : {}),
    ...(solver ? { solver: journalSolverOptions(solver.request, solver.input, offsetKcal, date) } : {}),
  };
  const goalPlan = buildGoalPlan(ctx, {
    goal: overrides?.goal ?? plan.goal,
    weeklyRate: profile.weeklyRateTarget,
    targetWeightKg: overrides?.targetWeightKg ?? plan.targetWeightKg ?? profile.targetWeightKg,
    stepTarget: overrides?.stepTarget ?? profile.averageSteps7d,
  });
  return { goalPlan, assessment, ctx, weight, maintenance };
}

/** Prompt 40 s3.13: goal, target weight and step target of a journal plan rebuilt by a guardrail. */
export type JournalPlanOverrides = { goal?: Goal; targetWeightKg?: number; stepTarget?: number };
export type JournalEstimate = { offsetKcal: number; interval80: readonly [number, number]; interval95: readonly [number, number] };

/**
 * Journal plan (a `CurrentPlan`) from a solved goal plan, as the harness applies it since prompt 36: the plan in force with
 * the journal maintenance, intervals and targets. `overrides` (prompt 40 s3.13): goal, target weight and step target.
 */
function journalPlanOf(plan: CurrentPlan, profile: UserProfile, date: string, built: ReturnType<typeof journalGoalPlan>, base: JournalEstimate, overrides?: JournalPlanOverrides): CurrentPlan | null {
  const { goalPlan, assessment, weight: planWeight, maintenance } = built;
  if (goalPlan.status !== 'ok' || goalPlan.calorieTargetKcal === null || goalPlan.macros === null) return null;
  const i80 = base.interval80;
  const i95 = base.interval95;
  const next: CurrentPlan = {
    ...plan,
    createdAt: `${date}T00:00:00.000Z`,
    source: 'recalibrated',
    maintenanceKcal: maintenance,
    maintenanceInterval80: [assessment.populationTdeeKcal + i80[0], assessment.populationTdeeKcal + i80[1]],
    maintenanceInterval95: [assessment.populationTdeeKcal + i95[0], assessment.populationTdeeKcal + i95[1]],
    calorieTarget: goalPlan.calorieTargetKcal,
    stepTarget: overrides?.stepTarget ?? profile.averageSteps7d,
    macros: { ...goalPlan.macros.exact },
    macrosDisplay: { ...goalPlan.macros.display },
    reeKcal: assessment.ree.reeKcalDay,
    weeklyRateTarget: goalPlan.weeklyRateTarget,
    planWeightKg: planWeight,
    requestedWeeklyRate: goalPlan.requestedWeeklyRate,
    baselineStepTarget: profile.averageSteps7d,
    baselineCalorieTarget: goalPlan.calorieTargetKcal,
    populationTdeeKcal: assessment.populationTdeeKcal,
    personalOffsetKcal: base.offsetKcal,
    hardFloorKcal: goalPlan.hardFloorKcal,
    warnings: goalPlan.warnings,
    proteinRule: goalPlan.macros.proteinRule,
  };
  if (overrides?.goal !== undefined) next.goal = overrides.goal;
  if (overrides?.targetWeightKg !== undefined) next.targetWeightKg = overrides.targetWeightKg;
  return next;
}

export type JournalGuardrailResult =
  /** No rule applies: the store is returned unchanged (same object). */
  | { status: 'none'; bmi: number | null; store: WheightyStore }
  | { status: 'applied'; rule: 'G1' | 'G2'; bmi: number; store: WheightyStore; built: ReturnType<typeof journalGoalPlan> }
  | { status: 'failed'; rule: 'G1' | 'G2'; bmi: number; reason: string };

/**
 * Guardrails of the plan in force in journal mode (prompt 40 s3.13, amendment 6 A6.1; harness only, measurement): the rules
 * of `enforcePlanGuardrails` (same weight, BMI, thresholds and 1e-9 tolerance), the plan rebuilt in logged units by
 * `journalGoalPlan` from the journal estimate `base`, with the floor multiplier of the arm, the step target of the plan in
 * force and the solver options (`solver`: request and the journal calibration input of the day).
 * - G1: a loss plan with a BMI under LOSS_UNAVAILABLE_BMI_BELOW: the profile goal becomes maintenance, target = the app
 *   weight (as `changeGoal`), and the plan is the journal maintenance plan at that weight.
 * - G2: otherwise, a loss plan above the BMI cap: the journal plan rebuilt with the requested rate of the profile, capped.
 * A failed rebuild leaves the store (plan and profile) unchanged.
 */
export function enforceJournalPlanGuardrails(
  store: WheightyStore,
  date: string,
  base: JournalEstimate,
  floorMultiplier: number | undefined,
  solver?: { request: SolverRequest; input: CalibrationInput },
): JournalGuardrailResult {
  const plan = store.plan;
  const profile = store.profile;
  if (!plan || !profile) return { status: 'none', bmi: null, store };
  const weight = currentWeightKg(store) ?? profile.currentWeightKg;
  const currentBmi = bmiOfWeight(weight, profile.heightCm);
  if (plan.goal !== 'loss') return { status: 'none', bmi: currentBmi, store };
  const failure = (built: ReturnType<typeof journalGoalPlan>) => (built.goalPlan.status === 'ok' ? 'no_feasible_speed' : built.goalPlan.status);
  if (currentBmi < LOSS_UNAVAILABLE_BMI_BELOW) {
    const nextProfile: UserProfile = { ...profile, goal: 'maintenance', targetWeightKg: weight, weeklyRateTarget: 0 };
    const withLogs = ensureDailyLogs({ ...store, profile: nextProfile }, date);
    const overrides: JournalPlanOverrides = { goal: 'maintenance', targetWeightKg: weight, stepTarget: plan.stepTarget };
    const built = journalGoalPlan(withLogs, date, base.offsetKcal, floorMultiplier, solver, overrides);
    const next = journalPlanOf(plan, nextProfile, date, built, base, overrides);
    if (!next) return { status: 'failed', rule: 'G1', bmi: currentBmi, reason: failure(built) };
    return { status: 'applied', rule: 'G1', bmi: currentBmi, store: syncTodayLog({ ...withLogs, plan: next }, date), built };
  }
  const cap = guardrailMaxWeeklyRate('loss', currentBmi);
  if (cap === null || !(plan.weeklyRateTarget > cap + 1e-9)) return { status: 'none', bmi: currentBmi, store };
  const withLogs = ensureDailyLogs(store, date);
  const overrides: JournalPlanOverrides = { stepTarget: plan.stepTarget };
  const built = journalGoalPlan(withLogs, date, base.offsetKcal, floorMultiplier, solver, overrides);
  const next = journalPlanOf(plan, profile, date, built, base, overrides);
  if (!next) return { status: 'failed', rule: 'G2', bmi: currentBmi, reason: failure(built) };
  return { status: 'applied', rule: 'G2', bmi: currentBmi, store: syncTodayLog({ ...withLogs, plan: next }, date), built };
}

// ---------------------------------------------------------------------------
// Day steps
// ---------------------------------------------------------------------------

function weighInMorning(world: World, st: SimState, d: number): void {
  if (d === 0 || !world.draws.weighed[d]) return;
  const date = dateOf(d);
  st.store = addWeight(st.store, { date, weightKg: (st.trueW[d] as number) + (world.draws.weighNoiseKg[d] as number) }, iso(date));
}

function acceptDraw(world: World, st: SimState): boolean {
  const u = world.draws.recalAcceptU[st.evalIndex % world.draws.recalAcceptU.length] as number;
  st.evalIndex++;
  return u < world.spec.acceptance;
}

/** Window mean of (logged - real) over the Hall days of a window ending at `windowEndDay` (days [0, end)). */
function loggedMinusRealMean(st: SimState, windowEndDay: number): number | null {
  if (windowEndDay <= 0) return null;
  let sum = 0;
  for (let d = 0; d < windowEndDay; d++) sum += (st.loggedKcal[d] as number) - (st.realKcal[d] as number);
  return sum / windowEndDay;
}

function lastWeighInDay(st: SimState): number {
  let last = 0;
  for (const w of st.store.weights) {
    const d = Math.round((Date.parse(w.date) - Date.parse(SIM_START)) / 86_400_000);
    if (d > last) last = d;
  }
  return last;
}

function evaluateCurrent(world: World, st: SimState, d: number): 'proposal' | null {
  const date = dateOf(d);
  const gate = evaluateGate(st.store.weights, st.store.dailyLogs);
  if (st.mode === 'pre' && revisionProposalTriggered(gate)) return 'proposal';
  const plan = st.store.plan as CurrentPlan;
  const end = lastWeighInDay(st);
  const truthLogged = (() => {
    const m = loggedMinusRealMean(st, end);
    return m === null ? null : world.spec.trueOffsetKcal + m;
  })();
  const rec: EvalRecord = { day: d, mode: st.mode, gateMet: gate.met, displayedMaintenanceKcal: plan.maintenanceKcal, offsetMedian: null, width80: null, surfaced: false, applied: false, truthReal: world.spec.trueOffsetKcal, truthLogged, windowEndDay: end };
  if (gate.met) {
    const state = computeCalibrationState(st.store, date, nowIsoOf(date));
    if (state) {
      rec.displayedMaintenanceKcal = state.currentMaintenanceKcal;
      rec.offsetMedian = state.candidate?.posteriorMedianOffsetKcal ?? null;
      rec.width80 = state.candidate ? intervalWidth(state.candidate.interval80) : null;
      if (state.surfaced) {
        rec.surfaced = true;
        if (acceptDraw(world, st)) {
          const before = st.store;
          const r = applyRecalibration(st.store, state, date, nowIsoOf(date), world.spec.solver);
          if (r.ok) {
            st.store = r.store;
            rec.applied = true;
            st.recalDays.push(d);
            const p = st.store.plan as CurrentPlan;
            const ctx = rebuildContextFromStore(st.store, date);
            const ea = ctx && ctx.highQualityFfmKg !== null && (ctx.athleteLike || ctx.highTrainingLoad) ? (p.calorieTarget - ctx.exerciseNetKcalDay) / ctx.highQualityFfmKg : null;
            const planRec = planRecord(world, p, d, 'recal_current', ea, p.warnings?.lowEnergyAvailability === true);
            if (world.spec.solver) {
              // Iteration 2a: reference weight of the plan (modeled weight today under currentState) against the trend weight.
              const body = world.spec.solver.solverStart === 'currentState' ? (solverOptionsFor(ensureDailyLogs(before, date), date, state.candidate, world.spec.solver).modeledBody ?? null) : null;
              planRec.trendWeightKg = currentWeightKg(before) ?? Number.NaN;
              planRec.trueWeightKg = st.trueW[d] as number;
              planRec.modeledWeightKg = body ? bodyWeightOf(body.params, body.state) + body.weightShiftKg : null;
            }
            st.plans.push(planRec);
            if (st.mode === 'C') st.chosenTargetActive = false;
            if (st.mode === 'C' && world.spec.robustness) st.targeting = false;
          } else {
            st.planFailures.push(`${d}:${r.reason}`);
            st.store = markRecalibrationSeen(st.store, state, date);
          }
        } else {
          st.store = markRecalibrationSeen(st.store, state, date);
          st.declinedRecals++;
        }
      }
    }
  }
  st.evals.push(rec);
  return null;
}

function journalOptions(j: JournalArmSettings): JournalRegimeOptions {
  return {
    journalRegimeStart: SIM_START,
    usabilityRule: { kind: 'R0' },
    nonUsableDayWeight: 0.5,
    journalPrior: j.prior,
    offsetGridHalfRangeKcal: j.gridHalfRangeKcal,
    carbSource: j.carbSource,
    weighInDensity: { minSpanDays: 28, minWeighInDayFraction: j.densityX },
  };
}

const DIAG_DAYS = [28, 42];

function evaluateJournal(world: World, st: SimState, d: number, j: JournalArmSettings): void {
  const date = dateOf(d);
  const options = journalOptions(j);
  const prepared = journalCalibrationInputFromStore(st.store, date, options);
  const plan = st.store.plan as CurrentPlan;
  const end = lastWeighInDay(st);
  const m = loggedMinusRealMean(st, end);
  const truthReal = world.spec.trueOffsetKcal + (prepared ? world.nasemDeclaredKcal - prepared.input.populationTdeeAtStartKcal : 0);
  const truthLogged = m === null ? null : truthReal + m;
  const rec: EvalRecord = { day: d, mode: 'J', gateMet: false, displayedMaintenanceKcal: plan.maintenanceKcal, offsetMedian: null, width80: null, surfaced: false, applied: false, truthReal, truthLogged, windowEndDay: end };
  if (!prepared) {
    st.evals.push(rec);
    return;
  }
  const gate = evaluateJournalGate(prepared.input.weights, prepared.observations, options.weighInDensity);
  rec.gateMet = gate.met;
  rec.gate = { weighIns: gate.weighInCount, span: gate.spanDays, clean: gate.cleanWeighInCount, coverage: gate.adherenceCoverage, density: gate.density?.weighInDayFraction ?? Number.NaN };
  const diag = DIAG_DAYS.includes(d);
  const fit = gate.met || diag ? fitCalibration(prepared.input) : null;
  if (fit) {
    rec.offsetMedian = fit.posterior.medianKcal;
    rec.width80 = fit.posterior.interval80[1] - fit.posterior.interval80[0];
  }
  if (gate.met && fit) {
    const candidate = buildSnapshot(fit, gate, prepared.input.populationTdeeAtStartKcal, nowIsoOf(date));
    const profile = st.store.profile as UserProfile;
    const weight = currentWeightKg(st.store) ?? profile.currentWeightKg;
    const populationNow = assessBaseline(profile, date, { weightKg: weight, palCategory: st.store.meta.initialPalCategory ?? plan.palCategory }).populationTdeeKcal;
    const proposed = populationNow + candidate.posteriorMedianOffsetKcal;
    const width = intervalWidth(candidate.interval80);
    rec.displayedMaintenanceKcal = proposed;
    const surfaced = st.firstSwitchPlanDay === null || st.journalLastSurfaced === null ? true : shouldSurfaceRecalibration(gate, { tdeeKcal: proposed, interval80Width: width }, st.journalLastSurfaced, date);
    if (surfaced) {
      rec.surfaced = true;
      st.journalLastSurfaced = { tdeeKcal: proposed, interval80Width: width, surfacedOn: date };
      if (acceptDraw(world, st)) {
        const applied = applyJournalPlan(world, st, d, j, prepared.input, { offsetKcal: candidate.posteriorMedianOffsetKcal, interval80: candidate.interval80, interval95: candidate.interval95 }, 'recal_journal', truthLogged);
        if (applied.ok) {
          rec.applied = true;
          st.recalDays.push(d);
          if (st.firstSwitchPlanDay === null) {
            st.firstSwitchPlanDay = d;
            st.targeting = !world.spec.robustness;
          }
        } else {
          st.planFailures.push(`${d}:${applied.reason}`);
        }
      } else {
        st.declinedRecals++;
      }
    }
  }
  if (diag && rec.offsetMedian !== null && truthLogged !== null) st.journalDiag[d] = { offsetMedian: rec.offsetMedian, truthLogged, truthReal, gateMet: gate.met, displayed: rec.displayedMaintenanceKcal };
  st.evals.push(rec);
}

/**
 * Journal plan of day d from a journal offset and its intervals (prompt 36 s4.1), with the user's solver options when
 * set (prompt 38 s3.3). Applied: the store gets the plan, the plan record is kept and `journalApplied` is updated.
 */
function applyJournalPlan(
  world: World,
  st: SimState,
  d: number,
  j: JournalArmSettings,
  input: CalibrationInput,
  base: { offsetKcal: number; interval80: readonly [number, number]; interval95: readonly [number, number] },
  kind: 'recal_journal' | 'replan_periodic_journal',
  truthLogged: number | null,
): { ok: true } | { ok: false; reason: string } {
  const date = dateOf(d);
  const plan = st.store.plan as CurrentPlan;
  const profile = st.store.profile as UserProfile;
  const built = journalGoalPlan(st.store, date, base.offsetKcal, j.floorMultiplier, world.spec.solver ? { request: world.spec.solver, input } : undefined);
  const { goalPlan, assessment, ctx } = built;
  const next = journalPlanOf(plan, profile, date, built, base);
  if (!next) return { ok: false, reason: goalPlan.status };
  st.store = syncTodayLog({ ...st.store, plan: next }, date);
  // Oracle (s7.4): production solver and the arm's floor with the true maintenance in logged units.
  let oracleTarget: number | null = null;
  if (truthLogged !== null) {
    const { solver: _solver, ...oracleCtx } = ctx;
    const oracle = buildGoalPlan({ ...oracleCtx, maintenanceKcal: assessment.populationTdeeKcal + truthLogged }, { goal: plan.goal, weeklyRate: profile.weeklyRateTarget, targetWeightKg: plan.targetWeightKg ?? profile.targetWeightKg, stepTarget: profile.averageSteps7d });
    oracleTarget = oracle.status === 'ok' ? oracle.calorieTargetKcal : null;
  }
  st.plans.push(planRecord(world, next, d, kind, goalPlan.energyAvailabilityKcalPerKgFfm, goalPlan.warnings.lowEnergyAvailability, oracleTarget));
  st.journalApplied = { offsetKcal: base.offsetKcal, interval80: base.interval80, interval95: base.interval95, settings: j };
  return { ok: true };
}

function applySwitch(world: World, st: SimState, d: number, arm: ArmConfig): void {
  st.proposalDay = d;
  st.accepted = world.draws.proposalAcceptU < world.spec.acceptance;
  if (arm.kind === 'A' || !st.accepted) {
    st.mode = 'A';
    // The evaluation of the proposal day is completed as in the current method (gate not met: nothing to apply).
    st.evals.push(currentEvalAfterProposal(world, st, d));
    return;
  }
  st.switchDay = d;
  if (arm.kind === 'J') {
    st.mode = 'J';
    // Waiting period (s3.8): the current plan stays displayed and the user keeps his habits.
    st.targeting = false;
    evaluateJournal(world, st, d, arm.journal);
    return;
  }
  // Chosen target (s5.3): T_c = median of the logged totals of the last 14 days, rounded to 50 kcal, then checked (s4.5).
  st.mode = 'C';
  const date = dateOf(d);
  const totals: number[] = [];
  for (let k = 1; k <= 14; k++) totals.push(journalDay(st.store, dateOf(d - k)).intakeLoggedKcal);
  const med = median(totals);
  const rounded = Math.round(med / 50) * 50;
  const r = withChosenTarget(st.store, date, rounded);
  st.store = r.store;
  st.tc = { median14: med, rounded, final: r.final, floor: r.floor, replaced: r.replaced };
  st.targeting = true;
  st.chosenTargetActive = true;
  const p = st.store.plan as CurrentPlan;
  const ctx = rebuildContextFromStore(st.store, date);
  const ea = ctx && ctx.highQualityFfmKg !== null && (ctx.athleteLike || ctx.highTrainingLoad) ? (p.calorieTarget - ctx.exerciseNetKcalDay) / ctx.highQualityFfmKg : null;
  st.plans.push(planRecord(world, p, d, 'chosen_target', ea, ea !== null && ea < 30));
  st.evals.push(currentEvalAfterProposal(world, st, d));
}

function currentEvalAfterProposal(world: World, st: SimState, d: number): EvalRecord {
  const plan = st.store.plan as CurrentPlan;
  const end = lastWeighInDay(st);
  const m = loggedMinusRealMean(st, end);
  return { day: d, mode: st.mode, gateMet: false, displayedMaintenanceKcal: plan.maintenanceKcal, offsetMedian: null, width80: null, surfaced: false, applied: false, truthReal: world.spec.trueOffsetKcal, truthLogged: m === null ? null : world.spec.trueOffsetKcal + m, windowEndDay: end };
}

/** Real hard floor (THRESHOLDS.md, D-32) at the true weight, REE of the app's equation; refreshed weekly. */
function realFloorAt(world: World, weightKg: number, d: number): number {
  const profile = world.spec.slot.profile;
  const a = assessBaseline({ ...profile, currentWeightKg: weightKg }, dateOf(d), { weightKg, palCategory: world.palCategory });
  return hardFloorKcal(a.ree.reeKcalDay, profile.sexForEquation);
}

/**
 * Iteration 2b (prompt 38 s3.1): periodic replan, morning of day d after the weekly evaluation (a recalibration applied
 * this morning has reset the plan age). Current method (modes pre and A): the domain's `periodicReplan` from the latest
 * applied snapshot, with the user's solver options. Journal mode (s3.3, prepared, not measured): the same cadence from the
 * last journal plan applied (offset and intervals), with the journal calibration input of the day; before any journal
 * plan, counted as without snapshot. Chosen target (C, prompt 40 s3.10 and s4.2): no periodic replan while the plan in
 * force is the chosen target; once it is replaced (recalibration of the current method, or G1), as in mode A. Always
 * accepted by the simulated user; no acceptance draw is consumed.
 */
function periodicStep(world: World, st: SimState, d: number): void {
  const every = world.spec.replanEveryDays;
  const request = world.spec.solver;
  // Prompt 40 s3.10 and s4.2: arm C, no periodic replan on the chosen target; after it is replaced, as in mode A.
  if (every === undefined || !request || (st.mode === 'C' && st.chosenTargetActive)) return;
  const date = dateOf(d);
  const plan = st.store.plan as CurrentPlan;
  if (st.mode === 'J') {
    const ageDays = planAgeDays(plan, date);
    if (!(ageDays > 0 && ageDays % every === 0)) return;
    const base = st.journalApplied;
    if (!base) {
      st.replans.push({ day: d, mode: st.mode, status: 'no_snapshot', ageDays, targetBefore: plan.calorieTarget, targetAfter: null });
      return;
    }
    const prepared = journalCalibrationInputFromStore(st.store, date, journalOptions(base.settings));
    const applied = prepared ? applyJournalPlan(world, st, d, base.settings, prepared.input, base, 'replan_periodic_journal', null) : { ok: false as const, reason: 'no_journal_input' };
    st.replans.push({ day: d, mode: st.mode, status: applied.ok ? 'replanned' : 'failed', ageDays, targetBefore: plan.calorieTarget, targetAfter: applied.ok ? (st.store.plan as CurrentPlan).calorieTarget : null, ...(applied.ok ? {} : { reason: applied.reason }) });
    return;
  }
  const r = periodicReplan(st.store, date, { replanEveryDays: every, solver: request });
  if (r.status === 'not_due') return;
  if (r.status !== 'replanned') {
    st.replans.push({ day: d, mode: st.mode, status: r.status, ageDays: r.ageDays, targetBefore: plan.calorieTarget, targetAfter: null, ...(r.status === 'failed' ? { reason: r.reason } : {}) });
    return;
  }
  st.store = r.store;
  const next = st.store.plan as CurrentPlan;
  st.replans.push({ day: d, mode: st.mode, status: 'replanned', ageDays: r.ageDays, targetBefore: plan.calorieTarget, targetAfter: next.calorieTarget });
  const rec = planRecord(world, next, d, 'replan_periodic', null, next.warnings?.lowEnergyAvailability === true);
  rec.trueWeightKg = st.trueW[d] as number;
  st.plans.push(rec);
}

/**
 * Iteration 2c (prompt 39 s3.2): guardrails of the plan in force, morning of a weekly evaluation day, before the calibration
 * evaluation (modes pre and A: `enforcePlanGuardrails`). The new plan is applied like any plan of the harness (the
 * simulated user follows it); no acceptance draw is consumed. A failed rebuild leaves the plan in place and is recorded.
 * Prompt 40 (s3.10, s3.13, s4.1): mode J, the current method's path until the first journal plan, then the journal path
 * (`journalGuardStep`); mode C, G1 only while the plan in force is the chosen target, then as in mode A.
 */
function guardStep(world: World, st: SimState, d: number, arm: ArmConfig | null = null): void {
  if (!world.spec.planGuardrails) return;
  if (st.mode === 'J') {
    if (!arm || arm.kind !== 'J') throw new Error('journal mode without a journal arm');
    // Prompt 40 s3.13: before the first journal plan, the current method's path (as G1 in mode A); then the journal path.
    if (st.journalApplied) {
      journalGuardStep(world, st, d, arm.journal, st.journalApplied);
      return;
    }
  }
  const date = dateOf(d);
  const before = st.store.plan as CurrentPlan;
  if (st.mode === 'C' && st.chosenTargetActive) {
    // Prompt 40 s3.10: on the chosen target (not prescribed by the app), G1 only.
    const profile = st.store.profile as UserProfile;
    if (!(before.goal === 'loss' && bmiOfWeight(appWeightOf(st.store), profile.heightCm) < LOSS_UNAVAILABLE_BMI_BELOW)) return;
  }
  const r = enforcePlanGuardrails(st.store, date, world.spec.solver ? { solver: world.spec.solver } : {});
  if (r.status === 'none') return;
  const common = { day: d, rule: r.rule, ...(st.mode === 'J' || st.mode === 'C' ? { mode: st.mode, path: 'current' as const } : {}), bmi: r.bmi, targetBefore: before.calorieTarget, rateBefore: before.weeklyRateTarget };
  if (r.status === 'failed') {
    st.guards.push({ ...common, status: 'failed', reason: r.reason, targetAfter: null, rateAfter: null });
    return;
  }
  st.store = r.store;
  if (st.mode === 'C') {
    st.chosenTargetActive = false;
    // Robustness of C (s5.3): keeps T_c to the end, whatever the app prescribes.
    if (world.spec.robustness) st.targeting = false;
  }
  const next = st.store.plan as CurrentPlan;
  st.guards.push({ ...common, status: 'applied', reason: r.rule === 'G1' ? 'bmi_below_20' : 'rate_above_cap', targetAfter: next.calorieTarget, rateAfter: next.weeklyRateTarget });
  const rec = planRecord(world, next, d, r.rule === 'G1' ? 'guardrail_g1' : 'guardrail_g2', null, next.warnings?.lowEnergyAvailability === true);
  rec.trueWeightKg = st.trueW[d] as number;
  st.plans.push(rec);
}

/**
 * Prompt 40 s3.13: guardrails in journal mode once a journal plan exists (`enforceJournalPlanGuardrails`), from the last
 * journal estimate applied (offset and intervals), with the journal calibration input of the day for the solver options and
 * the floor multiplier of the arm. Applied: the user keeps aiming at the displayed target; no acceptance draw is consumed.
 */
function journalGuardStep(world: World, st: SimState, d: number, j: JournalArmSettings, base: JournalApplied): void {
  const date = dateOf(d);
  const before = st.store.plan as CurrentPlan;
  const request = world.spec.solver;
  const prepared = request ? journalCalibrationInputFromStore(st.store, date, journalOptions(base.settings)) : null;
  if (request && !prepared) throw new Error('no journal input');
  const r = enforceJournalPlanGuardrails(st.store, date, base, j.floorMultiplier, request && prepared ? { request, input: prepared.input } : undefined);
  if (r.status === 'none') return;
  const common = { day: d, rule: r.rule, mode: st.mode, path: 'journal' as const, bmi: r.bmi, targetBefore: before.calorieTarget, rateBefore: before.weeklyRateTarget };
  if (r.status === 'failed') {
    st.guards.push({ ...common, status: 'failed', reason: r.reason, targetAfter: null, rateAfter: null });
    return;
  }
  st.store = r.store;
  const next = st.store.plan as CurrentPlan;
  st.guards.push({ ...common, status: 'applied', reason: r.rule === 'G1' ? 'bmi_below_20' : 'rate_above_cap', targetAfter: next.calorieTarget, rateAfter: next.weeklyRateTarget });
  const rec = planRecord(world, next, d, r.rule === 'G1' ? 'guardrail_g1' : 'guardrail_g2', r.built.goalPlan.energyAvailabilityKcalPerKgFfm, r.built.goalPlan.warnings.lowEnergyAvailability);
  rec.trueWeightKg = st.trueW[d] as number;
  st.plans.push(rec);
}

/** App weight: the weight the domain rebuilds a plan at (`currentWeightKg`: latest trend weight, else the profile weight). */
function appWeightOf(store: WheightyStore): number {
  return currentWeightKg(store) ?? (store.profile as UserProfile).currentWeightKg;
}

/**
 * S3-P (amendment 5 A5.4): after the weekly evaluation, the plan in force prescribes a loss while the BMI of the app weight
 * is under LOSS_UNAVAILABLE_BMI_BELOW, or a rate above the cap of that BMI (`guardrailMaxWeeklyRate`; same 1e-9 tolerance
 * as `buildGoalPlan` and `enforcePlanGuardrails`).
 */
export function s3pCheck(store: WheightyStore, d: number): S3pRecord {
  const plan = store.plan as CurrentPlan;
  const profile = store.profile as UserProfile;
  const appWeightKg = appWeightOf(store);
  const bmi = bmiOfWeight(appWeightKg, profile.heightCm);
  let violation = false;
  if (plan.goal === 'loss') violation = bmi < LOSS_UNAVAILABLE_BMI_BELOW || plan.weeklyRateTarget > (guardrailMaxWeeklyRate('loss', bmi) as number) + 1e-9;
  else if (plan.goal === 'gain') violation = plan.weeklyRateTarget > (guardrailMaxWeeklyRate('gain', bmi) as number) + 1e-9;
  return { day: d, appWeightKg, bmi, goal: plan.goal, rate: plan.weeklyRateTarget, violation };
}

function eatAndLog(world: World, st: SimState, d: number): void {
  periodicStep(world, st, d);
  if (d > 0 && d % EVAL_EVERY_DAYS === 0) {
    const check = s3pCheck(st.store, d);
    // Prompt 40 s4.3: the chosen target of arm C is not checked.
    st.s3p.push(st.mode === 'C' && st.chosenTargetActive ? { ...check, exempt: true } : check);
  }
  const spec = world.spec;
  const draws = world.draws;
  const date = dateOf(d);
  const plan = st.store.plan as CurrentPlan;
  const u = uOn(spec.uSchedule, spec.u, d);
  const eatNoise = 1 + EATING_NOISE_SD * (draws.zEat[d] as number);
  const deviation = st.targeting && (draws.deviation[d] as boolean);
  // `targeting`: the user aims at the displayed target in his journal (logged units, after the switch plan).
  let real: number;
  let proteinG: number;
  if (st.targeting) {
    real = (plan.calorieTarget / (1 + u)) * eatNoise * (deviation ? DEVIATION_FACTOR : 1);
    proteinG = plan.macros.proteinG / (1 + u);
  } else if (st.mode === 'C' && st.tc) {
    // Robustness of C: keeps T_c to the end, aiming at it in the journal.
    real = (st.tc.final / (1 + u)) * eatNoise * ((draws.deviation[d] as boolean) ? DEVIATION_FACTOR : 1);
    proteinG = plan.macros.proteinG / (1 + u);
  } else if (spec.behavior === 'follower') {
    real = plan.calorieTarget * eatNoise;
    proteinG = plan.macros.proteinG;
  } else if (spec.behavior === 'steady') {
    // Regular non-follower (iteration 2a): the plan in force + s, every day.
    real = (plan.calorieTarget + spec.slot.shiftKcal) * eatNoise;
    proteinG = plan.macros.proteinG;
  } else {
    real = (world.onboardingPlan.calorieTarget + spec.slot.shiftKcal) * eatNoise;
    proteinG = plan.macros.proteinG;
  }
  let carbKcal = world.eatenCarbFraction * real;
  let proteinKcal = KCAL_PER_G_PROTEIN * proteinG;
  let fatKcal = real - proteinKcal - carbKcal;
  if (fatKcal < 0) {
    fatKcal = 0;
    carbKcal = Math.max(0, real - proteinKcal);
    if (real - proteinKcal < 0) proteinKcal = real;
  }
  const realP = proteinKcal / KCAL_PER_G_PROTEIN;
  const realC = carbKcal / KCAL_PER_G_CARB;
  const realF = fatKcal / KCAL_PER_G_FAT;
  const logNoise = 1 + LOGGING_NOISE_SD * (draws.zLog[d] as number);
  const loggedP = Math.max(0, realP * (1 + u) * logNoise);
  const loggedC = Math.max(0, realC * (1 + u) * logNoise);
  const loggedF = Math.max(0, realF * (spec.carbWorld === 'selective' ? 1 + u - 0.1 : 1 + u) * logNoise);
  const logged = KCAL_PER_G_PROTEIN * loggedP + KCAL_PER_G_CARB * loggedC + KCAL_PER_G_FAT * loggedF;

  // Declared adherence (read by the current method only).
  const a = draws.adherenceU[d] as number;
  let adherence: 'on_plan' | 'minor_deviation' | 'major_deviation';
  if (st.mode === 'C' && st.tc) adherence = (draws.deviation[d] as boolean) ? 'major_deviation' : 'on_plan';
  else if (spec.behavior === 'follower') adherence = a < 0.85 ? 'on_plan' : a < 0.95 ? 'minor_deviation' : 'major_deviation';
  else if (spec.behavior === 'steady') adherence = 'on_plan';
  else adherence = a < (spec.slot.majorShare ?? DEFAULT_MAJOR_SHARE) ? 'major_deviation' : 'on_plan';

  const steps = Math.max(0, Math.round(plan.stepTarget * (1 + STEPS_NOISE_SD * (draws.zSteps[d] as number))));
  let store = ensureDailyLogs(st.store, date);
  store = setAdherence(store, date, adherence);
  store = setActualSteps(store, date, steps);
  for (const meal of MEALS) {
    const r = addFoodEntry(
      store,
      { kind: 'manual', food: { name: 'Repas', intake: { energyKcal: logged * meal.share, proteinG: loggedP * meal.share, carbsG: loggedC * meal.share, fatG: loggedF * meal.share }, grams: null }, date, localTime: meal.time, consumedTime: meal.time },
      iso(date),
    );
    if (!r.ok) throw new Error(r.reason);
    store = r.store;
  }
  st.store = store;

  const profile = spec.slot.profile;
  const paDelta =
    (netStepKcal({ steps, pace: profile.walkingPace, weightKg: world.trueStartKg, ageYears: profile.ageYears }) -
      netStepKcal({ steps: world.maintenanceSteps, pace: profile.walkingPace, weightKg: world.trueStartKg, ageYears: profile.ageYears })) /
    world.trueStartKg;
  st.hall = worldAdvance(world.hall, st.hall, { intakeKcal: real, carbKcal, paDeltaKcalPerKgDay: paDelta, sodiumDeltaMg: 0 }, 1);
  st.trueW.push(worldBodyWeight(world.hall, st.hall));
  st.trueTissue.push(worldTissueKg(world.hall, st.hall));
  if (d % 7 === 0) st.floorReal.push(realFloorAt(world, st.trueW[d] as number, d));
  else st.floorReal.push(st.floorReal[st.floorReal.length - 1] as number);
  st.realKcal.push(real);
  st.loggedKcal.push(logged);
  st.loggedCarbsG.push(loggedC);
  st.realCarbsG.push(realC);
  st.realProteinG.push(realP);
  st.planTarget.push(plan.calorieTarget);
  st.planRate.push(plan.weeklyRateTarget);
  st.planRequested.push(plan.requestedWeeklyRate ?? profile.weeklyRateTarget);
  st.planProteinG.push(plan.macros.proteinG);
  st.planGoal.push(plan.goal);
  st.planFloor.push(plan.hardFloorKcal ?? Number.NaN);
  st.appW.push(appWeightOf(st.store));
  st.modeDay.push(st.mode);
  // Day counted by S4: the user aims at the displayed target (journal users after the switch plan; followers of the
  // current method before any switch).
  st.targetingDay.push(st.targeting || (spec.behavior === 'follower' && (st.mode === 'pre' || st.mode === 'A')));
  st.deviationDay.push(deviation);
}

/** Morning of day d: weigh-in, then the weekly evaluation. Returns 'proposal' when the revision proposal is triggered. */
function morning(world: World, st: SimState, d: number, arm: ArmConfig | null): 'proposal' | null {
  weighInMorning(world, st, d);
  if (d === 0 || d % EVAL_EVERY_DAYS !== 0) return null;
  // Prompt 40 s3.12: guardrails, then the calibration evaluation (the periodic replan and S3-P follow in eatAndLog).
  guardStep(world, st, d, arm);
  if (st.mode === 'J') {
    if (!arm || arm.kind !== 'J') throw new Error('journal mode without a journal arm');
    evaluateJournal(world, st, d, arm.journal);
    return null;
  }
  return evaluateCurrent(world, st, d);
}

export type ArmOutcome = { arm: ArmConfig; state: SimState };
/** `ms` (prompt 40 s6.3, cost pilot): wall time of the common part and of each arm's continuation, ms. */
export type UserOutcome = { world: World; commonUntil: number; proposalDay: number | null; arms: ArmOutcome[]; ms?: { common: number; arms: number[] } };

/**
 * Simulates all arms of one user (s5.4, bifurcation): the common part once, up to the proposal morning, then each arm
 * from a copy of that state. Without a proposal the user is simulated once and every arm shares the result.
 */
export function simulateUser(spec: UserSpec, arms: readonly ArmConfig[]): UserOutcome {
  const t0 = performance.now();
  const world = buildWorld(spec);
  const common = initialState(world);
  let proposalDay: number | null = null;
  for (let d = 0; d < SIM_DAYS; d++) {
    if (morning(world, common, d, null) === 'proposal') {
      proposalDay = d;
      break;
    }
    eatAndLog(world, common, d);
  }
  const msCommon = performance.now() - t0;
  if (proposalDay === null) {
    return { world, commonUntil: SIM_DAYS, proposalDay, arms: arms.map((arm) => ({ arm, state: common })), ms: { common: msCommon, arms: arms.map(() => 0) } };
  }
  const msArms: number[] = [];
  const outcomes: ArmOutcome[] = arms.map((arm) => {
    const t1 = performance.now();
    const st = cloneState(common);
    applySwitch(world, st, proposalDay as number, arm);
    eatAndLog(world, st, proposalDay as number);
    for (let d = (proposalDay as number) + 1; d < SIM_DAYS; d++) {
      morning(world, st, d, arm);
      eatAndLog(world, st, d);
    }
    msArms.push(performance.now() - t1);
    return { arm, state: st };
  });
  return { world, commonUntil: proposalDay, proposalDay, arms: outcomes, ms: { common: msCommon, arms: msArms } };
}

/** Iteration 2a timing (prompt 37 s5.5): one arm simulated from day 0 for the given number of days (no bifurcation). */
export function simulateArmDays(spec: UserSpec, arm: ArmConfig, days: number): { world: World; state: SimState } {
  const world = buildWorld(spec);
  const st = initialState(world);
  for (let d = 0; d < days; d++) {
    if (morning(world, st, d, arm) === 'proposal') applySwitch(world, st, d, arm);
    eatAndLog(world, st, d);
  }
  return { world, state: st };
}

/**
 * Prompt 40 s6.1 (equivalence extended to the guardrails): one arm from day 0 up to the morning of `day`, weigh-in of that
 * morning included, before its guardrails and evaluation (days 0 to day - 1 simulated in full, no bifurcation).
 */
export function simulateArmToMorning(spec: UserSpec, arm: ArmConfig, day: number): { world: World; state: SimState } {
  const { world, state } = simulateArmDays(spec, arm, day);
  weighInMorning(world, state, day);
  return { world, state };
}

/** s6.2: the same arm replayed from day 0 without bifurcation. */
export function simulateArmFromScratch(spec: UserSpec, arm: ArmConfig): SimState {
  const world = buildWorld(spec);
  const st = initialState(world);
  for (let d = 0; d < SIM_DAYS; d++) {
    if (morning(world, st, d, arm) === 'proposal') applySwitch(world, st, d, arm);
    eatAndLog(world, st, d);
  }
  return st;
}

// ---------------------------------------------------------------------------
// Per-user metrics
// ---------------------------------------------------------------------------

/** OLS slope of y over consecutive days, per day. */
export function olsSlope(y: readonly number[]): number {
  const n = y.length;
  const mx = (n - 1) / 2;
  let my = 0;
  for (const v of y) my += v;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (i - mx) * ((y[i] as number) - my);
    sxx += (i - mx) ** 2;
  }
  return sxy / sxx;
}

const goalSign = (goal: GoalKind) => (goal === 'loss' ? -1 : goal === 'gain' ? 1 : 0);

/** Ratio of a [a, b] day block: true-weight OLS slope (kg/week) / rate of the active plan x true weight at a (kg/week). */
export function blockRatio(st: SimState, goal: GoalKind, a: number, b: number, rates: readonly number[]): number | null {
  const sign = goalSign(goal);
  if (sign === 0) return null;
  const slope = olsSlope(st.trueW.slice(a, b + 1)) * 7;
  let rate = 0;
  for (let d = a; d < b; d++) rate += rates[d] as number;
  rate /= b - a;
  const requested = sign * rate * (st.trueW[a] as number);
  return requested === 0 ? null : slope / requested;
}

/**
 * Iteration 2b (prompt 38 s4, amendment 4 A4.1): ratio of a [a, b] day block on the true tissue mass (fat + lean): OLS slope
 * of the tissue mass (kg/week) / rate of the active plan x true body weight at a (kg/week).
 */
export function tissueBlockRatio(st: SimState, goal: GoalKind, a: number, b: number, rates: readonly number[]): number | null {
  const sign = goalSign(goal);
  if (sign === 0) return null;
  const slope = olsSlope(st.trueTissue.slice(a, b + 1)) * 7;
  let rate = 0;
  for (let d = a; d < b; d++) rate += rates[d] as number;
  rate /= b - a;
  const requested = sign * rate * (st.trueW[a] as number);
  return requested === 0 ? null : slope / requested;
}

/** Reference day of S3/S4 (s7.2): first plan issued from the switch (J: first journal plan; C: T_c), or 0 (A). */
export function referenceDay(arm: ArmConfig, st: SimState): number | null {
  if (arm.kind === 'A' || st.mode === 'A' || st.mode === 'pre') return 0;
  if (st.mode === 'J') return st.firstSwitchPlanDay;
  return st.switchDay;
}

export type ArmMetrics = Record<string, number | string | boolean | null>;

export function armMetrics(world: World, arm: ArmConfig, st: SimState): ArmMetrics {
  const spec = world.spec;
  const goal = spec.slot.goal;
  const out: ArmMetrics = {};
  BLOCKS.forEach(([a, b], i) => {
    out[`ratio_b${i + 1}`] = blockRatio(st, goal, a, b, st.planRate);
    out[`ratio_req_b${i + 1}`] = blockRatio(st, goal, a, b, st.planRequested);
  });
  const ref = referenceDay(arm, st);
  out.ref_day = ref;
  // S3: user-weeks at or after the reference day, weekly OLS slope of the true weight over 8 days vs the BMI cap.
  let weeks = 0;
  let above = 0;
  let maxWeeklyRate = 0;
  if (ref !== null) {
    for (let k = Math.ceil(ref / 7); k < SIM_DAYS / 7; k++) {
      const a = 7 * k;
      const w0 = st.trueW[a] as number;
      const rate = (olsSlope(st.trueW.slice(a, a + 8)) * 7) / w0;
      const bmi = w0 / world.heightM ** 2;
      const lossCap = guardrailMaxWeeklyRate('loss', bmi) ?? 0;
      const isAbove = rate < 0 ? -rate > lossCap : rate > GAIN_RATE_HARD_MAX;
      weeks++;
      if (isAbove) above++;
      if (Math.abs(rate) > Math.abs(maxWeeklyRate)) maxWeeklyRate = rate;
    }
  }
  out.s3_weeks = weeks;
  out.s3_above = above;
  out.max_weekly_rate = maxWeeklyRate;
  // S4: days aiming at the displayed target (deviation days included), real intake below the real floor.
  let targetDays = 0;
  let belowFloor = 0;
  let proteinSum = 0;
  let proteinRuleSum = 0;
  if (ref !== null) {
    for (let d = ref; d < SIM_DAYS; d++) {
      if (!st.targetingDay[d]) continue;
      targetDays++;
      if ((st.realKcal[d] as number) < (st.floorReal[d] as number)) belowFloor++;
      proteinSum += st.realProteinG[d] as number;
      proteinRuleSum += st.planProteinG[d] as number;
    }
  }
  out.s4_target_days = targetDays;
  out.s4_below_floor_days = belowFloor;
  out.protein_ratio = targetDays > 0 ? proteinSum / proteinRuleSum : null;
  // S7: maintenance goal, true weight at 8 weeks.
  if (goal === 'maintenance') {
    const target = spec.slot.profile.targetWeightKg;
    const zone = maintenanceZone(target);
    const w56 = st.trueW[56] as number;
    out.s7_w56 = w56;
    out.s7_in_zone_target = w56 >= zone.lowKg && w56 <= zone.highKg;
    out.s7_in_zone_true_start = Math.abs(w56 - world.trueStartKg) <= zone.halfWidthKg;
    out.s7_half_width = zone.halfWidthKg;
  }
  // Journal estimate bias at 28 and 42 days after the window start (s7.3), logged units.
  for (const day of DIAG_DAYS) {
    const diag = st.journalDiag[day];
    out[`bias${day}`] = diag ? diag.offsetMedian - diag.truthLogged : null;
    out[`bias${day}_gate`] = diag ? diag.gateMet : null;
  }
  // Displayed maintenance stability after the reference day: mean |week-to-week change|.
  const shown = st.evals.filter((e) => ref !== null && e.day >= ref).map((e) => e.displayedMaintenanceKcal);
  let dSum = 0;
  for (let i = 1; i < shown.length; i++) dSum += Math.abs((shown[i] as number) - (shown[i - 1] as number));
  out.display_mean_abs_change = shown.length > 1 ? dSum / (shown.length - 1) : null;
  // Rolling 4-week ratios after the reference day: delay to [0.85, 1.15] and peak.
  let delay: number | null = null;
  let peak: number | null = null;
  if (ref !== null && goalSign(goal) !== 0) {
    for (let k = Math.ceil(ref / 7); 7 * k + 28 <= SIM_DAYS; k++) {
      const r = blockRatio(st, goal, 7 * k, 7 * k + 28, st.planRate);
      if (r === null) continue;
      if (peak === null || r > peak) peak = r;
      if (delay === null && r >= 0.85 && r <= 1.15) delay = 7 * k - ref;
    }
  }
  out.delay_to_band = delay;
  out.peak_ratio = peak;
  // Oracle gap of the journal plans (mean |plan - oracle| target, kcal/day).
  const oracle = st.plans.filter((p) => p.kind === 'recal_journal' && p.oracleTarget !== undefined && p.oracleTarget !== null);
  out.oracle_gap_mean = oracle.length > 0 ? oracle.reduce((s, p) => s + ((p.calorieTarget - (p.oracleTarget as number)) as number), 0) / oracle.length : null;
  out.oracle_abs_gap_mean = oracle.length > 0 ? oracle.reduce((s, p) => s + Math.abs(p.calorieTarget - (p.oracleTarget as number)), 0) / oracle.length : null;
  // Energy availability (C6): mean real intake over targeting days of each plan period vs the plan warning.
  let eaCases = 0;
  let eaMissed = 0;
  const ffm = world.spec.slot.profile.bodyFatPercent !== undefined ? (world.spec.slot.profile.currentWeightKg * (100 - (world.spec.slot.profile.bodyFatPercent as number))) / 100 : null;
  const exercise = rebuildContextFromStore(world.initialStore, SIM_START)?.exerciseNetKcalDay ?? 0;
  if (ffm !== null && ref !== null) {
    st.plans.forEach((p, i) => {
      if (p.day < ref) return;
      const end = st.plans[i + 1]?.day ?? SIM_DAYS;
      let n = 0;
      let sum = 0;
      for (let d = p.day; d < end; d++) {
        if (!st.targetingDay[d]) continue;
        n++;
        sum += st.realKcal[d] as number;
      }
      if (n === 0) return;
      const eaReal = (sum / n - exercise) / ffm;
      if (eaReal < 30) {
        eaCases++;
        if (!p.lowEnergyAvailability) eaMissed++;
      }
    });
  }
  out.ea_cases = eaCases;
  out.ea_missed = eaMissed;
  out.plan_floor_hits = st.plans.filter((p) => p.day >= (ref ?? 0) && p.calorieTarget <= p.hardFloorKcal + 1e-6).length;
  return out;
}
