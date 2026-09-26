/**
 * Relaunch of iteration 2 (prompt 40): journal mode in closed loop with K2 + G in every arm. Job definitions and raw export.
 * Measurement only.
 *
 * Every simulated user carries the solver retained in iteration 2b (K2: FX + solver horizon 28 days + periodic replan every
 * 28 days, options unchanged) and the guardrails of iteration 2c (G1, G2), in every arm (s3.12): A current method; J journal
 * mode (flat prior, +-2 000 grid, floor x 1.10, baseline carbohydrates, weigh-in density X); C chosen target; JN J-NASEM
 * (P00 control: NASEM prior, floor on the logged figure); JG J-glucides (logged carbohydrates, carbohydrate worlds only).
 * The arms of one user share the world and every random draw; they bifurcate at the revision proposal (s5.4).
 *
 * Declared seeds (new bases, disjoint from every previous pass, derived streams included: phases 1 and 1b < 6e6, iteration
 * 2 in [1.0e9, 2.03e9], 2a in [2.1e9, 2.63e9], 2b in [2.7e9, 3.53e9], 2c in [3.6e9, 4.03e9]; checked, with the validity for
 * the generator (< 2^32), by tests/domain/seeds2r.test.ts before any measurement). For a base b: user master seed = b +
 * index (index < 100 000, sub-bases included); derived streams = master + k x 1 000 003 (k <= 20); LHS seed = b + 999 983;
 * seed of the declared major-deviation share (s5.1) = b + 999 979; stratified daily sample seed = b + 999 991.
 * - pilot2r    4 030 000 000  cost pilot (s6.3): 50 non-followers and 50 followers per principal population, every arm;
 *                             outputs deleted, no result used; also the fixtures of the unit tests (tests/domain)
 * - controls2r 4 050 200 000  controls: pairing (s6.2, 50 non-followers of P10, every arm) and, from the sub-base
 *                             b + 10 000, the ideal users of the equivalence extended to the guardrails (s6.1)
 * - c1train    4 070 400 000  training (s7.1), 1 000 non-followers, the same users in each principal population
 * - c1trainx2  4 090 600 000  doubled training pass (INCONCLUSIF, A1.3 and A5.1), 2 000 non-followers
 * - c1valNf    4 110 800 000  validation non-followers (s7.2, V1 and V2: 2 000, the same users in each population;
 *                             sensitivities, robustness, acceptance at 70 % and carbohydrates: the first 1 000 or 500)
 * - c1valFo    4 131 000 000  validation followers (1 000, the same users in each population)
 * - c1valx2Nf  4 151 200 000  doubled validation pass, non-followers (4 000; sensitivities doubled on the first 2 000)
 * - c1valx2Fo  4 171 400 000  doubled validation pass, followers (2 000)
 * - carbsx2    4 191 600 000  doubled carbohydrate pass (2 000 per world)
 * - c2         4 211 800 000  C2 (s8), 3 000 non-followers per motif
 * - c2x2       4 232 000 000  doubled C2 pass
 * - c6         4 252 200 000  C6 (s8), 1 200 per group (over-reporters, small builds from b + 10 000, athlete-like from b + 20 000)
 * - c6x2       4 272 400 000  doubled C6 pass
 * The doubled passes run only if the concerned step is INCONCLUSIF (s10.6); their verdict rests on the new pass alone.
 * Raw rows: tests/experiments-journal/results/it2r/<dir>/<job>-shard<k>.csv.gz (+ -daily- and -timing- files).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import type { SolverRequest } from '@/domain/engine';
import { GAIN_RATE_HARD_MAX } from '@/science/constants';
import {
  BLOCKS,
  POPULATIONS,
  PRINCIPAL,
  SIM_DAYS,
  armMetrics,
  athleteSlots,
  closedLoopSlots,
  journalArm,
  lhsSeed,
  makeSpec,
  olsSlope,
  simulateUser,
} from '../../helpers/closedLoop';
import type { ArmConfig, CarbWorld, Population, ProfileSlot, SimState, SpecOptions, USchedule, UserSpec, World } from '../../helpers/closedLoop';
import { writeCsvGz } from '../../helpers/journalExport';
import type { CsvValue } from '../../helpers/journalExport';
import { createRng } from '../../helpers/random';
import { RESULTS, specColumns, stateColumns } from '../it2/jobs';
import { ARMS_2B, columns2b } from '../it2b/jobs2b';
import { columns2c, s3dLossCap } from '../it2c/jobs2c';

export const IT2R_DIR = `${RESULTS}/it2r`;
export const SEED_BASES_2R = {
  pilot2r: 4_030_000_000,
  controls2r: 4_050_200_000,
  c1train: 4_070_400_000,
  c1trainx2: 4_090_600_000,
  c1valNf: 4_110_800_000,
  c1valFo: 4_131_000_000,
  c1valx2Nf: 4_151_200_000,
  c1valx2Fo: 4_171_400_000,
  carbsx2: 4_191_600_000,
  c2: 4_211_800_000,
  c2x2: 4_232_000_000,
  c6: 4_252_200_000,
  c6x2: 4_272_400_000,
} as const;
export const MAJOR_SHARE_SEED_OFFSET = 999_979;
export const SAMPLE_SEED_OFFSET = 999_991;
/** Share of each stratum in the daily sample (s5.5): at least 10 % (rounded up). */
export const DAILY_SAMPLE_SHARE = 0.1;
/** Sub-base of the ideal users of the extended equivalence (s6.1). */
export const EQUIV_G_SUB_BASE = SEED_BASES_2R.controls2r + 10_000;

/** K2 + G (s3.12): K2 of iteration 2b unchanged (solver options and replan cadence), guardrails of iteration 2c. */
export const K2G: { solver: SolverRequest; replanEveryDays: number; planGuardrails: true } = {
  solver: ARMS_2B.K2.solver as SolverRequest,
  replanEveryDays: ARMS_2B.K2.replanEveryDays as number,
  planGuardrails: true,
};

// Arms (s3, s5.4). J: flat prior, +-2 000 grid, floor x 1.10 (s3.6), baseline carbohydrates (D5).
export const ARM_A: ArmConfig = { key: 'A', kind: 'A' };
export const ARM_C: ArmConfig = { key: 'C', kind: 'C' };
export const armJ = (x: number, key = 'J') => journalArm(key, x);
/** P00 control "logged = real kcal": NASEM prior, floor on the logged figure (not raised), as in report 36. */
export const armJN = (x: number) => journalArm('JN', x, { prior: 'nasem', floorMultiplier: undefined });
/** J-glucides (s3.11): logged carbohydrates for Hall's glycogen on usable days. */
export const armJG = (x: number) => journalArm('JG', x, { carbSource: 'logged' });
/** C6 (s8): floor applied to the logged figure (x 1). */
export const armJfloor1 = (x: number) => journalArm('Jfloor1', x, { floorMultiplier: undefined });
export const X_CANDIDATES = [1, 0.85, 0.7] as const;
export const trainArm = (x: number) => armJ(x, `J${Math.round(x * 100)}`);

/** X retained by the training rule (s7.1), passed to every later job (IT2R_X). */
export function retainedX(): number {
  const x = Number(process.env.IT2R_X);
  if (!X_CANDIDATES.includes(x as (typeof X_CANDIDATES)[number])) throw new Error('IT2R_X must be 1, 0.85 or 0.7 (training rule s7.1)');
  return x;
}

export type JobUser2r = { slot: ProfileSlot; base: number; index: number; options: SpecOptions; arms: ArmConfig[]; tags: Record<string, CsvValue> };
export type Job2r = { name: string; dir: string; count: number; base: number; user: (i: number) => JobUser2r | null };

const slotCache = new Map<string, ProfileSlot[]>();
/** LHS slots of a base, with the declared major-deviation share (s5.1). */
export function slots2r(n: number, base: number): ProfileSlot[] {
  const key = `${n}:${base}`;
  let s = slotCache.get(key);
  if (!s) {
    s = closedLoopSlots(n, lhsSeed(base), base + MAJOR_SHARE_SEED_OFFSET);
    slotCache.set(key, s);
  }
  return s;
}

const opts = (pass: string, behavior: SpecOptions['behavior'], population: Population, extra: Partial<SpecOptions> = {}): SpecOptions => ({ pass, behavior, population, ...K2G, ...extra });
const pop = (key: string) => POPULATIONS[key] as Population;

/**
 * Validation users of one or more populations (s7.2): per population, `nf` non-followers (base `nfBase`) then `fo`
 * followers (base `foBase`); the same users (slots and master seeds) in every population, u drawn from its law.
 */
function validationJob(name: string, dir: string, pops: readonly string[], nfBase: number, foBase: number, nf: number, fo: number, armsOf: (popKey: string, follower: boolean) => ArmConfig[]): Job2r {
  const perPop = nf + fo;
  return {
    name,
    dir,
    count: perPop * pops.length,
    base: nfBase,
    user: (i) => {
      const key = pops[Math.floor(i / perPop)];
      if (key === undefined) return null;
      const k = i % perPop;
      const follower = k >= nf;
      const base = follower ? foBase : nfBase;
      const j = follower ? k - nf : k;
      const slot = slots2r(follower ? fo : nf, base)[j] as ProfileSlot;
      return { slot, base, index: j, options: opts(name, follower ? 'follower' : 'nonfollower', pop(key)), arms: armsOf(key, follower), tags: { population: key } };
    },
  };
}

/** Non-followers of the given population keys, the first n validation users (sensitivities, robustness, acceptance, carbs). */
function nfSubsetJob(name: string, dir: string, keys: readonly string[], base: number, pool: number, n: number, armsOf: () => ArmConfig[], extra: (key: string) => Partial<SpecOptions>, tagsOf: (key: string) => Record<string, CsvValue>): Job2r {
  return {
    name,
    dir,
    count: n * keys.length,
    base,
    user: (i) => {
      const key = keys[Math.floor(i / n)];
      if (key === undefined) return null;
      const j = i % n;
      const e = extra(key);
      const population = (e.population ?? pop(key)) as Population;
      return { slot: slots2r(pool, base)[j] as ProfileSlot, base, index: j, options: opts(name, 'nonfollower', population, e), arms: armsOf(), tags: tagsOf(key) };
    },
  };
}

export function jobFor2r(name: string): Job2r {
  const B = SEED_BASES_2R;
  switch (name) {
    // s6.3 cost pilot (discarded seeds): 50 non-followers (every arm) and 50 followers per principal population.
    case 'pilot2r':
      return {
        name,
        dir: 'pilot',
        count: 100 * PRINCIPAL.length,
        base: B.pilot2r,
        user: (i) => {
          const key = PRINCIPAL[Math.floor(i / 100)];
          if (key === undefined) return null;
          const j = i % 100;
          const follower = j >= 50;
          const p00 = key === 'P00';
          const arms = follower ? [ARM_A, armJ(0.85), ARM_C, ...(p00 ? [armJN(0.85)] : [])] : [ARM_A, trainArm(1), trainArm(0.85), trainArm(0.7), ARM_C, ...(p00 ? [armJN(0.85)] : []), armJG(0.85)];
          return { slot: slots2r(100, B.pilot2r)[j] as ProfileSlot, base: B.pilot2r, index: j, options: opts(name, follower ? 'follower' : 'nonfollower', pop(key)), arms, tags: { population: key } };
        },
      };
    // s6.2 pairing: 50 non-followers of P10, every arm (the three X, C, J-NASEM, J-glucides).
    case 'pairing2r':
      return {
        name,
        dir: 'controls',
        count: 50,
        base: B.controls2r,
        user: (i) => (i < 50 ? { slot: slots2r(50, B.controls2r)[i] as ProfileSlot, base: B.controls2r, index: i, options: opts(name, 'nonfollower', pop('P10')), arms: [ARM_A, trainArm(1), trainArm(0.85), trainArm(0.7), ARM_C, armJN(0.85), armJG(0.85)], tags: { population: 'P10' } } : null),
      };
    // s7.1 training: 1 000 non-followers per principal population, A and J for each X.
    case 'c1train':
    case 'c1trainx2': {
      const base = name === 'c1train' ? B.c1train : B.c1trainx2;
      const n = name === 'c1train' ? 1000 : 2000;
      return nfSubsetJob(name, 'c1train', PRINCIPAL, base, n, n, () => [ARM_A, ...X_CANDIDATES.map(trainArm)], () => ({}), (key) => ({ population: key }));
    }
    // s7.2 V1: P00, 2 000 non-followers and 1 000 followers; A, J, C, J-NASEM.
    case 'c1v1':
    case 'c1v1x2': {
      const x = retainedX();
      const x2 = name === 'c1v1x2';
      return validationJob(name, 'c1v1', ['P00'], x2 ? B.c1valx2Nf : B.c1valNf, x2 ? B.c1valx2Fo : B.c1valFo, x2 ? 4000 : 2000, x2 ? 2000 : 1000, () => [ARM_A, armJ(x), ARM_C, armJN(x)]);
    }
    // s7.2 V2: P05, P10, P20, same users; A, J, C.
    case 'c1v2':
    case 'c1v2x2': {
      const x = retainedX();
      const x2 = name === 'c1v2x2';
      return validationJob(name, 'c1v2', ['P05', 'P10', 'P20'], x2 ? B.c1valx2Nf : B.c1valNf, x2 ? B.c1valx2Fo : B.c1valFo, x2 ? 4000 : 2000, x2 ? 2000 : 1000, () => [ARM_A, armJ(x), ARM_C]);
    }
    // s7.2 sensitivities [S]: the first 1 000 validation non-followers (2 000 doubled) with the sensitivity laws of u, J only.
    case 'c1sens':
    case 'c1sensx2': {
      const x = retainedX();
      const x2 = name === 'c1sensx2';
      return nfSubsetJob(name, 'c1v2', ['P10_sd20', 'P10_slope-5', 'P10_slope-10'], x2 ? B.c1valx2Nf : B.c1valNf, x2 ? 4000 : 2000, x2 ? 2000 : 1000, () => [armJ(x)], () => ({}), (key) => ({ population: key }));
    }
    // s7.2 robustness (J and C) and acceptance at 70 % (A, J, C): the first 500 validation non-followers of P10.
    case 'c1robust':
    case 'c1accept': {
      const x = retainedX();
      const robust = name === 'c1robust';
      return nfSubsetJob(name, 'c1v2', ['P10'], B.c1valNf, 2000, 500, () => (robust ? [armJ(x), ARM_C] : [ARM_A, armJ(x), ARM_C]), () => (robust ? { robustness: true } : { acceptance: 0.7 }), () => ({ population: 'P10', variant: robust ? 'robustness' : 'acceptance70' }));
    }
    // s7.3 carbohydrates: P10 non-followers, validation seeds, 1 000 per world; J and J-glucides.
    case 'carbs':
    case 'carbsx2': {
      const x = retainedX();
      const x2 = name === 'carbsx2';
      const worlds: CarbWorld[] = ['base', 'minus10', 'plus10', 'selective'];
      const n = x2 ? 2000 : 1000;
      return nfSubsetJob(name, 'carbs', worlds, x2 ? B.carbsx2 : B.c1valNf, 2000, n, () => [armJ(x), armJG(x)], (w) => ({ population: pop('P10'), carbWorld: w as CarbWorld }), (w) => ({ population: 'P10', carb_world: w }));
    }
    // s8 C2: bias drift from day 56, J only (prompt 36 s8.1 motifs), 3 000 non-followers drawn per motif.
    case 'c2':
    case 'c2x2': {
      const x = retainedX();
      const base = name === 'c2' ? B.c2 : B.c2x2;
      const n = name === 'c2' ? 3000 : 6000;
      const motifs: Array<{ key: string; pop: Population; schedule: USchedule }> = [
        { key: 'rigour_ramp', pop: pop('P20'), schedule: { kind: 'ramp', delta: 0.15, startDay: 56, rampDays: 28 } },
        { key: 'rigour_step', pop: pop('P20'), schedule: { kind: 'step', delta: 0.15, startDay: 56, rampDays: 0 } },
        { key: 'relax', pop: pop('P05'), schedule: { kind: 'ramp', delta: -0.15, startDay: 56, rampDays: 28 } },
        { key: 'oscillation', pop: { key: 'P12.5', meanU: -0.125, sdU: 0.1, role: 'principal' }, schedule: { kind: 'oscillation', amplitude: 0.075, periodDays: 56, startDay: 56 } },
      ];
      return {
        name,
        dir: 'c2',
        count: n * motifs.length,
        base,
        user: (i) => {
          const m = motifs[Math.floor(i / n)];
          if (!m) return null;
          const j = i % n;
          return { slot: slots2r(n, base)[j] as ProfileSlot, base, index: j, options: opts(name, 'nonfollower', m.pop, { uSchedule: m.schedule }), arms: [armJ(x)], tags: { population: m.pop.key, motif: m.key } };
        },
      };
    }
    // s8 C6: two floor arms (x 1.10, x 1); over-reporters (u ~ U[0, 15 %]), small builds, athlete-like (DXA).
    case 'c6':
    case 'c6x2': {
      const x = retainedX();
      const base = name === 'c6' ? B.c6 : B.c6x2;
      const n = name === 'c6' ? 1200 : 2400;
      const arms = [armJ(x), armJfloor1(x)];
      return {
        name,
        dir: 'c6',
        count: n * 3,
        base,
        user: (i) => {
          const group = Math.floor(i / n);
          const j = i % n;
          if (group === 0) return { slot: slots2r(n, base)[j] as ProfileSlot, base, index: j, options: opts(name, 'nonfollower', pop('P10'), { uUniform: [0, 0.15] }), arms, tags: { population: 'overreport', c6_group: 'overreport' } };
          if (group === 1) return { slot: smallSlots(n, base + 10_000)[j] as ProfileSlot, base: base + 10_000, index: j, options: opts(name, 'nonfollower', pop('P10')), arms, tags: { population: 'P10', c6_group: 'small' } };
          if (group === 2) {
            const sub = base + 20_000;
            const a = athleteSlots(n, lhsSeed(sub));
            const shares = slots2r(n, sub);
            // Athlete-like slots, with the major-deviation share of the sub-base's Latin draw.
            return { slot: { ...(a[j] as ProfileSlot), majorShare: (shares[j] as ProfileSlot).majorShare as number }, base: sub, index: j, options: opts(name, 'nonfollower', pop('P10')), arms, tags: { population: 'P10', c6_group: 'athlete' } };
          }
          return null;
        },
      };
    }
    default:
      throw new Error(`unknown job ${name}`);
  }
}

/** C6 small builds (prompt 36 s8.2, it2/jobs.ts): women 150 to 158 cm, BMI 21 or 26, sedentary, loss (floor active). */
function smallSlots(n: number, base: number): ProfileSlot[] {
  return slots2r(n, base).map((slot, i) => {
    if (slot.key === 'R' || slot.key === 'S') return slot;
    const bmi = i % 2 === 0 ? 21 : 26;
    const height = 150 + (i % 9);
    const age = 45 + (i % 20);
    const weight = Math.round(bmi * (height / 100) ** 2 * 10) / 10;
    return {
      ...slot,
      sex: 'female',
      bmiClass: String(bmi),
      activity: 'sedentary',
      goal: 'loss',
      profile: { ...slot.profile, sexForEquation: 'female', heightCm: height, ageYears: age, currentWeightKg: weight, averageSteps7d: 5000, activities: [], goal: 'loss', targetWeightKg: Math.ceil(18.5 * (height / 100) ** 2 * 10) / 10, weeklyRateTarget: bmi < 22 ? 0.0025 : 0.01 },
    } satisfies ProfileSlot;
  });
}

export function specFor2r(u: JobUser2r): UserSpec {
  return makeSpec(u.slot, u.base, u.index, u.options);
}

// ---------------------------------------------------------------------------
// Daily sample (s5.5)
// ---------------------------------------------------------------------------

/** Stratum of the daily sample (s5.5): population x goal x BMI class x declared major-deviation share (x job tags). */
export const stratumOf2r = (u: JobUser2r) => `${String(u.tags.population)}|${String(u.tags.carb_world ?? u.tags.motif ?? u.tags.c6_group ?? '')}|${u.slot.goal}|${u.slot.bmiClass}|${u.slot.majorShare ?? ''}`;

/** Random ceil(10 %) of each stratum (strata in sorted order), drawn with the job's sample seed (base + 999 991). */
export function dailySample2r(job: Job2r): Set<number> {
  const strata = new Map<string, number[]>();
  for (let i = 0; i < job.count; i++) {
    const u = job.user(i);
    if (!u) continue;
    const k = stratumOf2r(u);
    const list = strata.get(k) ?? [];
    list.push(i);
    strata.set(k, list);
  }
  const rng = createRng(job.base + SAMPLE_SEED_OFFSET);
  const out = new Set<number>();
  for (const k of [...strata.keys()].sort()) {
    const ids = [...(strata.get(k) as number[])];
    for (let n = ids.length - 1; n > 0; n--) {
      const m = Math.floor(rng.next() * (n + 1));
      [ids[n], ids[m]] = [ids[m] as number, ids[n] as number];
    }
    for (const i of ids.slice(0, Math.ceil(DAILY_SAMPLE_SHARE * ids.length))) out.add(i);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Columns of the relaunch (s5.5, amendment 6 A6.5)
// ---------------------------------------------------------------------------

/** Reference day of A6.5: J, first plan issued from the switch (first journal plan); C, the chosen target (switch day); A, 0. */
export function refDay2r(arm: ArmConfig, st: SimState): number | null {
  if (st.accepted === true && st.switchDay !== null) {
    if (arm.kind === 'J') return st.firstSwitchPlanDay;
    if (arm.kind === 'C') return st.switchDay;
  }
  return 0;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Plan periods: [start, end) between consecutive plan start days (onboarding included), in day order. */
export function planPeriods(st: SimState): Array<[number, number]> {
  const starts = [...new Set(st.plans.map((p) => p.day))].sort((a, b) => a - b);
  return starts.map((s, i) => [s, starts[i + 1] ?? SIM_DAYS] as [number, number]).filter(([a, b]) => b > a);
}

/**
 * Columns of prompt 40 (s5.5), with the reference day of A6.5 (J: blocks, evaluations and days from the first journal plan;
 * C: from the chosen target; A: from day 0):
 * - S3-P from the reference day (evaluations on days >= ref; the chosen target of C is exempt and counted apart);
 * - S3-D on the blocks that start on or after the reference day (definition of 2c, columns2c);
 * - S4-P, days >= ref whose target is under the app floor of the plan in force (J: the arm's floor, x 1.10);
 * - S4-J (A5.5): each plan period of at least 7 days starting on or after ref, mean real intake over the period against the
 *   mean real floor (D-32 at the true weight, refreshed weekly) over the same days; periods, periods below, minimum margin;
 * - guardrail events by rule and path (current method, journal), days in journal mode, first day of the first switch plan;
 * - C2 (s8): days above 1.25 x the requested rate, on the tissues (weekly 8-day OLS slope of the true tissue mass from the
 *   reference day, in the goal direction, against 1.25 x the rate requested by the plan in force x the true weight).
 */
export function columns2r(world: World, arm: ArmConfig, st: SimState): Record<string, CsvValue> {
  const out: Record<string, CsvValue> = {};
  const spec = world.spec;
  const goal = spec.slot.goal;
  const ref = refDay2r(arm, st);
  out.major_share = spec.slot.majorShare ?? null;
  out.ref2r = ref;
  const h2 = world.heightM ** 2;
  let checks = 0;
  let viol = 0;
  let exempt = 0;
  let s3d = 0;
  let s3dOver = 0;
  let s4p = 0;
  let periods = 0;
  let below = 0;
  let minMargin: number | null = null;
  const detail: string[] = [];
  let aboveDays = 0;
  if (ref !== null) {
    for (const c of st.s3p) {
      if (c.day < ref) continue;
      if (c.exempt) {
        exempt++;
        continue;
      }
      checks++;
      if (c.violation) viol++;
    }
    BLOCKS.forEach(([a, b]) => {
      if (a < ref) return;
      const rate = (olsSlope(st.trueTissue.slice(a, b + 1)) * 7) / (st.trueW[a] as number);
      const bmi = (st.trueW[a] as number) / h2;
      const gain = goal === 'gain';
      const cap = gain ? GAIN_RATE_HARD_MAX : s3dLossCap(bmi);
      s3d++;
      if (gain ? rate > 1.25 * cap : -rate > 1.25 * cap) s3dOver++;
    });
    for (let d = ref; d < SIM_DAYS; d++) if ((st.planTarget[d] as number) < (st.planFloor[d] as number)) s4p++;
    for (const [a, b] of planPeriods(st)) {
      if (a < ref || b - a < 7) continue;
      let real = 0;
      let floor = 0;
      for (let d = a; d < b; d++) {
        real += st.realKcal[d] as number;
        floor += st.floorReal[d] as number;
      }
      const margin = (real - floor) / (b - a);
      periods++;
      if (margin < 0) below++;
      if (minMargin === null || margin < minMargin) minMargin = margin;
      detail.push(`${a}:${b - a}:${r1(real / (b - a))}:${r1(floor / (b - a))}`);
    }
    const sign = goal === 'loss' ? -1 : goal === 'gain' ? 1 : 0;
    if (sign !== 0) {
      for (let k = Math.ceil(ref / 7); 7 * k + 7 <= SIM_DAYS; k++) {
        const a = 7 * k;
        const rate = (olsSlope(st.trueTissue.slice(a, a + 8)) * 7) / (st.trueW[a] as number);
        let requested = 0;
        for (let d = a; d < a + 7; d++) requested += st.planRequested[d] as number;
        requested /= 7;
        if (requested > 0 && sign * rate > 1.25 * requested) aboveDays += 7;
      }
    }
  }
  out.s3p_checks_ref = checks;
  out.s3p_viol_ref = viol;
  out.s3p_exempt = exempt;
  out.s3d_blocks_ref = s3d;
  out.s3d_over_ref = s3dOver;
  out.s4p_days_ref = s4p;
  out.s4j_periods = periods;
  out.s4j_below = below;
  out.s4j_min_margin = minMargin;
  out.s4j_detail = detail.join('|');
  out.c2_above_days = aboveDays;
  const applied = st.guards.filter((g) => g.status === 'applied');
  out.n_g1_journal = applied.filter((g) => g.rule === 'G1' && g.path === 'journal').length;
  out.n_g2_journal = applied.filter((g) => g.rule === 'G2' && g.path === 'journal').length;
  out.n_g_after_switch = applied.filter((g) => st.switchDay !== null && g.day > st.switchDay).length;
  out.g_failed_reasons = st.guards.filter((g) => g.status === 'failed').map((g) => `${g.day}:${g.rule}:${g.reason}`).join('|');
  out.journal_days = st.modeDay.filter((m) => m === 'J').length;
  out.n_journal_plans = st.plans.filter((p) => p.kind === 'recal_journal').length;
  out.n_recal_current_after_switch = st.plans.filter((p) => p.kind === 'recal_current' && st.switchDay !== null && p.day >= st.switchDay).length;
  out.chosen_target_end = arm.kind === 'C' && st.switchDay !== null ? (st.plans.find((p) => p.day > (st.switchDay as number) && p.kind !== 'chosen_target')?.day ?? null) : null;
  out.true_bmi_ref = ref !== null ? (st.trueW[ref] as number) / h2 : null;
  return out;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function armColumns(arm: ArmConfig): Record<string, CsvValue> {
  return {
    arm: arm.key,
    arm_kind: arm.kind,
    density_x: arm.kind === 'J' ? arm.journal.densityX : null,
    prior: arm.kind === 'J' ? arm.journal.prior : null,
    floor_mult: arm.kind === 'J' ? (arm.journal.floorMultiplier ?? 1) : null,
    carb_source: arm.kind === 'J' ? arm.journal.carbSource : null,
  };
}

export type ShardOutput2r = {
  rows: Array<Record<string, CsvValue>>;
  daily: Array<Record<string, CsvValue>>;
  users: number;
  proposals: number;
  ms: number[];
  /** Cost pilot (s6.3): total ms of the common parts and of each arm's continuation, by behaviour. */
  cost: Record<string, number>;
};
export const emptyShard2r = (): ShardOutput2r => ({ rows: [], daily: [], users: 0, proposals: 0, ms: [], cost: {} });

/**
 * One user, all the arms of the job (bifurcation at the proposal): one raw row per arm (columns of it2, 2b, 2c and 2r);
 * the daily rows of every arm when the user is in the stratified sample or a guardrail fired in any arm (s5.5).
 */
export function runUser2r(job: Job2r, i: number, sample: ReadonlySet<number>, out: ShardOutput2r): void {
  const u = job.user(i);
  if (!u) return;
  const spec = specFor2r(u);
  const t0 = performance.now();
  const res = simulateUser(spec, u.arms);
  out.ms.push(performance.now() - t0);
  out.users++;
  if (res.proposalDay !== null) out.proposals++;
  const add = (k: string, v: number) => {
    out.cost[k] = (out.cost[k] ?? 0) + v;
  };
  add(`${spec.behavior}:common`, res.ms?.common ?? 0);
  add(`${spec.behavior}:users`, 1);
  if (res.proposalDay !== null) add(`${spec.behavior}:proposals`, 1);
  res.arms.forEach((a, k) => add(`${spec.behavior}:${a.arm.key}`, res.ms?.arms[k] ?? 0));
  const common = { job: job.name, job_index: i, ...u.tags, ...specColumns(spec, res.world), common_until: res.commonUntil };
  for (const { arm, state } of res.arms) {
    out.rows.push({ ...common, ...armColumns(arm), ...stateColumns(state), ...armMetrics(res.world, arm, state), ...columns2b(res.world, spec.slot.goal, state), ...columns2c(res.world, spec.slot.goal, state), ...columns2r(res.world, arm, state) });
  }
  const sampled = sample.has(i);
  const fired = res.arms.some((a) => a.state.guards.length > 0);
  if (!sampled && !fired) return;
  for (const { arm, state } of res.arms) {
    for (let d = 0; d <= SIM_DAYS; d++) {
      const events = state.guards.filter((g) => g.day === d).map((g) => `${g.rule}:${g.status}:${g.path ?? 'current'}`);
      const last = d < SIM_DAYS;
      out.daily.push({
        job: job.name,
        job_index: i,
        ...u.tags,
        behavior: spec.behavior,
        arm: arm.key,
        sampled,
        stratum: stratumOf2r(u),
        day: d,
        mode: last ? (state.modeDay[d] as string) : null,
        true_w: r3(state.trueW[d] as number),
        true_tissue: r3(state.trueTissue[d] as number),
        real: last ? r1(state.realKcal[d] as number) : null,
        logged: last ? r1(state.loggedKcal[d] as number) : null,
        logged_carbs_g: last ? r1(state.loggedCarbsG[d] as number) : null,
        target: last ? r1(state.planTarget[d] as number) : null,
        rate: last ? (state.planRate[d] as number) : null,
        app_w: last ? r3(state.appW[d] as number) : null,
        plan_goal: last ? (state.planGoal[d] as string) : null,
        plan_floor: last ? r1(state.planFloor[d] as number) : null,
        real_floor: last ? r1(state.floorReal[d] as number) : null,
        targeting: last ? (state.targetingDay[d] as boolean) : null,
        g_event: events.join('|'),
      });
    }
  }
}

export function writeShard2r(job: Job2r, shard: number, out: ShardOutput2r, wallMs: number, dir = `${IT2R_DIR}/${job.dir}`): void {
  mkdirSync(dir, { recursive: true });
  const cols = (rows: ReadonlyArray<Record<string, CsvValue>>) => [...new Set(rows.flatMap((r) => Object.keys(r)))];
  writeCsvGz(`${dir}/${job.name}-shard${shard}.csv.gz`, cols(out.rows), out.rows);
  if (out.daily.length > 0) writeCsvGz(`${dir}/${job.name}-daily-shard${shard}.csv.gz`, cols(out.daily), out.daily);
  const sorted = [...out.ms].sort((a, b) => a - b);
  writeFileSync(
    `${dir}/${job.name}-timing-shard${shard}.json`,
    `${JSON.stringify({ job: job.name, shard, users: out.users, proposals: out.proposals, wallMs, userMsTotal: sorted.reduce((a, b) => a + b, 0), userMsP50: sorted[Math.floor(sorted.length / 2)] ?? null, userMsMax: sorted[sorted.length - 1] ?? null, cost: out.cost }, null, 2)}\n`,
  );
}
