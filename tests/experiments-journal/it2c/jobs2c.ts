/**
 * Iteration 2c (prompt 39): guardrails of the plan in force (G1, G2), closed-loop jobs. Measurement only.
 *
 * Current method only (arm A, no journal, followers only). The solver and the guardrails are properties of the simulated
 * user (`UserSpec.solver`, `replanEveryDays`, `planGuardrails`): S0 production; K2 retained in iteration 2b (FX + solver
 * horizon 28 days + periodic replan every 28 days, options unchanged); S0 + G and K2 + G the same with the guardrails. The
 * arms of one user share the master seed, hence the same world and every random draw (paired arms). Raw rows:
 * tests/experiments-journal/results/guardrails2c/<job>-shard<k>.csv.gz (+ -daily- and -timing- files).
 *
 * Declared seeds (new bases, disjoint from every previous pass, derived streams included: phases 1 and 1b < 6e6, iteration
 * 2 in [1.0e9, 2.03e9], 2a in [2.1e9, 2.63e9], 2b in [2.7e9, 3.53e9]; checked by tests/domain/seeds2c.test.ts). User master
 * seed = base + index (index < 100 000); derived streams = master + k x 1 000 003 (k <= 20); LHS seed = base + 999 983;
 * stratified daily sample seed = base + 999 991. Every value stays below 2^32 (the generator takes `seed >>> 0`).
 * - ideal2c    3 600 000 000 (4.2, 500 ideal users, arms K2 and K2 + G)
 * - real2c     3 700 000 000 (4.3, 2 000 realistic followers, arms S0, K2, S0 + G, K2 + G)
 * - pilot2c    3 800 000 000 (4.1 cost pilot, outputs deleted, no result used)
 * - ideal2cx2  3 900 000 000 (INCONCLUSIF of A3.1 for K2 + G: doubled pass, 1 000 ideal users, K2 and K2 + G, A1.3 and A5.1)
 * - real2cx2   4 000 000 000 (INCONCLUSIF of amended A3.2: doubled pass, 4 000 followers, S0 + G and K2 + G, A1.3 and A5.1)
 * The doubled passes run only if the first pass is INCONCLUSIF; their verdict rests on the new pass alone.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import type { SolverRequest } from '@/domain/engine';
import { GAIN_RATE_HARD_MAX, LOSS_RATE_MAX_BMI_UNDER_22 } from '@/science/constants';
import { guardrailMaxWeeklyRate } from '@/science/goals';
import { BLOCKS, POPULATIONS, SIM_DAYS, armMetrics, closedLoopSlots, lhsSeed, makeSpec, olsSlope, simulateUser } from '../../helpers/closedLoop';
import type { ArmConfig, Behavior, Population, ProfileSlot, SimState, UserSpec, World } from '../../helpers/closedLoop';
import { writeCsvGz } from '../../helpers/journalExport';
import type { CsvValue } from '../../helpers/journalExport';
import { createRng } from '../../helpers/random';
import { RESULTS, specColumns, stateColumns } from '../it2/jobs';
import { ARMS_2B, columns2b } from '../it2b/jobs2b';

export const GUARD2C_DIR = 'guardrails2c';
export const SEED_BASES_2C = {
  ideal2c: 3_600_000_000,
  real2c: 3_700_000_000,
  pilot2c: 3_800_000_000,
  ideal2cx2: 3_900_000_000,
  real2cx2: 4_000_000_000,
} as const;
export const SAMPLE_SEED_OFFSET = 999_991;
/** Share of users of the stratified daily sample (prompt 39 s3.2): at least 10 % of each stratum (rounded up). */
export const DAILY_SAMPLE_SHARE = 0.1;

/** Arms of prompt 39: K2 of iteration 2b unchanged (solver options and replan cadence), with or without the guardrails. */
export const ARMS_2C: Record<'S0' | 'K2' | 'S0G' | 'K2G', { solver?: SolverRequest; replanEveryDays?: number; planGuardrails?: boolean }> = {
  S0: {},
  K2: { ...ARMS_2B.K2 },
  S0G: { planGuardrails: true },
  K2G: { ...ARMS_2B.K2, planGuardrails: true },
};
export type Arm2cKey = keyof typeof ARMS_2C;

export type Job2c = {
  name: string;
  count: number;
  base: number;
  arms: Arm2cKey[];
  user: (i: number) => { slot: ProfileSlot; base: number; index: number; behavior: Behavior; ideal: boolean; tags: Record<string, CsvValue> } | null;
};

const slotCache = new Map<string, ProfileSlot[]>();
function slots(n: number, base: number): ProfileSlot[] {
  const key = `${n}:${base}`;
  let s = slotCache.get(key);
  if (!s) {
    s = closedLoopSlots(n, lhsSeed(base));
    slotCache.set(key, s);
  }
  return s;
}

function job(name: string, base: number, count: number, arms: Arm2cKey[], ideal: boolean): Job2c {
  return {
    name,
    count,
    base,
    arms,
    user: (i) => (i < count ? { slot: slots(count, base)[i] as ProfileSlot, base, index: i, behavior: 'follower', ideal, tags: { population: ideal ? 'ideal' : 'P10', world: ideal ? 'ideal' : 'realistic' } } : null),
  };
}

export function jobFor2c(name: string): Job2c {
  switch (name) {
    // 4.2: ideal world of control 6.1 (nominal Hall, noiseless weigh-ins, u = 0, perfect followers), 500 users as in 2b.
    case 'ideal2c':
      return job(name, SEED_BASES_2C.ideal2c, 500, ['K2', 'K2G'], true);
    case 'ideal2cx2':
      return job(name, SEED_BASES_2C.ideal2cx2, 1000, ['K2', 'K2G'], true);
    // 4.3: realistic world of 2b (Hall +-20 %, weigh-ins t + D + E, noisy steps, followers of 2b), no non-followers.
    case 'real2c':
      return job(name, SEED_BASES_2C.real2c, 2000, ['S0', 'K2', 'S0G', 'K2G'], false);
    case 'real2cx2':
      return job(name, SEED_BASES_2C.real2cx2, 4000, ['S0G', 'K2G'], false);
    // 4.1 cost pilot (outputs deleted): 4 ideal and 8 realistic followers, every arm.
    case 'pilot2c': {
      const base = SEED_BASES_2C.pilot2c;
      return {
        name,
        count: 12,
        base,
        arms: ['S0', 'K2', 'S0G', 'K2G'],
        user: (i) => (i < 12 ? { slot: slots(12, base)[i] as ProfileSlot, base, index: i, behavior: 'follower', ideal: i < 4, tags: { population: 'pilot', world: i < 4 ? 'ideal' : 'realistic' } } : null),
      };
    }
    default:
      throw new Error(`unknown job ${name}`);
  }
}

export function specFor2c(j: Job2c, i: number, arm: Arm2cKey): UserSpec | null {
  const u = j.user(i);
  if (!u) return null;
  const a = ARMS_2C[arm];
  return makeSpec(u.slot, u.base, u.index, {
    pass: j.name,
    behavior: u.behavior,
    population: POPULATIONS.P10 as Population,
    ...(u.ideal ? { ideal: true } : {}),
    ...(a.solver ? { solver: a.solver } : {}),
    ...(a.replanEveryDays !== undefined ? { replanEveryDays: a.replanEveryDays } : {}),
    ...(a.planGuardrails ? { planGuardrails: true } : {}),
  });
}

/** Stratum of the daily sample: goal x BMI class x requested rate. */
export const stratumOf = (slot: ProfileSlot) => `${slot.goal}|${slot.bmiClass}|${slot.profile.weeklyRateTarget}`;

/**
 * Stratified random daily sample (prompt 39 s3.2): in each stratum (goal x BMI class x requested rate, strata in sorted
 * order), a random ceil(10 %) of the users, drawn with the declared sample seed (base + 999 991).
 */
export function dailySample(j: Job2c): Set<number> {
  const strata = new Map<string, number[]>();
  for (let i = 0; i < j.count; i++) {
    const u = j.user(i);
    if (!u) continue;
    const k = stratumOf(u.slot);
    strata.set(k, [...(strata.get(k) ?? []), i]);
  }
  const rng = createRng(j.base + SAMPLE_SEED_OFFSET);
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

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Loss cap of S3-D at a true BMI (A5.4): the BMI cap, and the 20-22 band (0.25 %/week) under BMI 20. */
export const s3dLossCap = (bmi: number) => guardrailMaxWeeklyRate('loss', bmi) ?? LOSS_RATE_MAX_BMI_UNDER_22;

/**
 * Iteration 2c columns (prompt 39 s3.2, amendment 5 A5.4):
 * - guardrail events (type, day, app BMI, status, reason, target and rate before and after);
 * - true BMI: minimum (and its day) and final;
 * - S3-P: weekly evaluations checked and violations (day, app BMI, goal of the plan, rate);
 * - S3-D, per 4-week block (weeks 5 to 24): delivered tissue rate = OLS slope of the true tissue mass over the block (kg/week)
 *   / true weight at the block start (signed), the cap (loss and maintenance: BMI cap of the true BMI at the block start,
 *   0.25 %/week under BMI 20, compared with the loss speed; gain: 0.5 %/week, compared with the gain speed) and the
 *   exceedance (above 1.25 x the cap);
 * - S4-P: days whose prescribed target is under the app floor of the plan in force (`hardFloorKcal`, D-32);
 * - minimum gap target - app floor and target - real floor (D-32 at the true weight), days with the target less than 10 %
 *   above the app floor;
 * - blocks where the goal of the plan in force changes within the block (excluded from the rate ratios, A5.4).
 */
export function columns2c(world: World, goal: string, st: SimState): Record<string, CsvValue> {
  const out: Record<string, CsvValue> = {};
  const h2 = world.heightM ** 2;
  const applied = st.guards.filter((g) => g.status === 'applied');
  const g1 = applied.find((g) => g.rule === 'G1');
  const g2 = applied.find((g) => g.rule === 'G2');
  out.g_events = st.guards
    .map((g) => [g.day, g.rule, g.status, r4(g.bmi), g.reason, r1(g.targetBefore), g.targetAfter === null ? '' : r1(g.targetAfter), g.rateBefore, g.rateAfter ?? ''].join(':'))
    .join('|');
  out.n_g1 = applied.filter((g) => g.rule === 'G1').length;
  out.n_g2 = applied.filter((g) => g.rule === 'G2').length;
  out.n_g_failed = st.guards.filter((g) => g.status === 'failed').length;
  out.g1_day = g1?.day ?? null;
  out.g1_bmi = g1?.bmi ?? null;
  out.g2_first_day = g2?.day ?? null;
  out.g2_first_bmi = g2?.bmi ?? null;
  let minW = Number.POSITIVE_INFINITY;
  let minDay = 0;
  st.trueW.forEach((w, d) => {
    if (w < minW) {
      minW = w;
      minDay = d;
    }
  });
  out.true_bmi_min = minW / h2;
  out.true_bmi_min_day = minDay;
  out.true_bmi_final = (st.trueW[SIM_DAYS] as number) / h2;
  out.s3p_checks = st.s3p.length;
  out.s3p_violations = st.s3p.filter((c) => c.violation).length;
  out.s3p_violation_days = st.s3p
    .filter((c) => c.violation)
    .map((c) => [c.day, r4(c.bmi), c.goal, c.rate].join(':'))
    .join('|');
  let over = 0;
  let excluded = 0;
  BLOCKS.forEach(([a, b], i) => {
    const k = i + 1;
    const rate = (olsSlope(st.trueTissue.slice(a, b + 1)) * 7) / (st.trueW[a] as number);
    const bmi = (st.trueW[a] as number) / h2;
    const gain = goal === 'gain';
    const cap = gain ? GAIN_RATE_HARD_MAX : s3dLossCap(bmi);
    const isOver = gain ? rate > 1.25 * cap : -rate > 1.25 * cap;
    out[`s3d_rate_b${k}`] = rate;
    out[`s3d_bmi_b${k}`] = bmi;
    out[`s3d_cap_b${k}`] = cap;
    out[`s3d_over_b${k}`] = isOver;
    if (isOver) over++;
    const goals = new Set(st.planGoal.slice(a, b));
    out[`goal_change_b${k}`] = goals.size > 1;
    if (goals.size > 1) excluded++;
  });
  out.s3d_blocks = BLOCKS.length;
  out.s3d_over = over;
  out.excluded_blocks = excluded;
  let s4p = 0;
  let near = 0;
  let minApp = Number.POSITIVE_INFINITY;
  let minReal = Number.POSITIVE_INFINITY;
  for (let d = 0; d < SIM_DAYS; d++) {
    const target = st.planTarget[d] as number;
    const floor = st.planFloor[d] as number;
    if (target < floor) s4p++;
    if (target < 1.1 * floor) near++;
    minApp = Math.min(minApp, target - floor);
    minReal = Math.min(minReal, target - (st.floorReal[d] as number));
  }
  out.s4p_days = s4p;
  out.near_floor_days = near;
  out.min_gap_app_floor = minApp;
  out.min_gap_real_floor = minReal;
  out.final_plan_goal = st.planGoal[SIM_DAYS - 1] ?? null;
  return out;
}

export type ShardOutput2c = { rows: Array<Record<string, CsvValue>>; daily: Array<Record<string, CsvValue>>; users: number; ms: number[] };

const A: ArmConfig = { key: 'A', kind: 'A' };
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * One user, every arm of the job: raw row per arm (2b columns + 2c columns); daily rows of every arm when the user is in the
 * stratified sample or when a guardrail fired in any arm.
 */
export function runUser2c(j: Job2c, i: number, sample: ReadonlySet<number>, out: ShardOutput2c): void {
  const u = j.user(i);
  if (!u) return;
  out.users++;
  const states: Array<{ arm: Arm2cKey; spec: UserSpec; state: SimState }> = [];
  for (const arm of j.arms) {
    const spec = specFor2c(j, i, arm) as UserSpec;
    const t0 = performance.now();
    const res = simulateUser(spec, [A]);
    out.ms.push(performance.now() - t0);
    const state = (res.arms[0] as { state: SimState }).state;
    states.push({ arm, spec, state });
    out.rows.push({
      job: j.name,
      job_index: i,
      solver_arm: arm,
      ...u.tags,
      ...specColumns(spec, res.world),
      common_until: res.commonUntil,
      ...stateColumns(state),
      ...armMetrics(res.world, A, state),
      ...columns2b(res.world, spec.slot.goal, state),
      ...columns2c(res.world, spec.slot.goal, state),
    });
  }
  const sampled = sample.has(i);
  const fired = states.some((s) => s.state.guards.length > 0);
  if (!sampled && !fired) return;
  for (const { arm, spec, state } of states) {
    for (let d = 0; d <= SIM_DAYS; d++) {
      const events = state.guards.filter((g) => g.day === d).map((g) => `${g.rule}:${g.status}`);
      out.daily.push({
        job: j.name,
        job_index: i,
        solver_arm: arm,
        behavior: spec.behavior,
        sampled,
        stratum: stratumOf(spec.slot),
        day: d,
        true_w: r3(state.trueW[d] as number),
        true_tissue: r3(state.trueTissue[d] as number),
        real: d < SIM_DAYS ? r1(state.realKcal[d] as number) : null,
        target: d < SIM_DAYS ? r1(state.planTarget[d] as number) : null,
        rate: d < SIM_DAYS ? (state.planRate[d] as number) : null,
        app_w: d < SIM_DAYS ? r3(state.appW[d] as number) : null,
        plan_goal: d < SIM_DAYS ? (state.planGoal[d] as string) : null,
        plan_floor: d < SIM_DAYS ? r1(state.planFloor[d] as number) : null,
        real_floor: d < SIM_DAYS ? r1(state.floorReal[d] as number) : null,
        g_event: events.join('|'),
      });
    }
  }
}

export function writeShard2c(j: Job2c, shard: number, out: ShardOutput2c, wallMs: number): void {
  const dir = `${RESULTS}/${GUARD2C_DIR}`;
  mkdirSync(dir, { recursive: true });
  const cols = (rows: ReadonlyArray<Record<string, CsvValue>>) => [...new Set(rows.flatMap((r) => Object.keys(r)))];
  writeCsvGz(`${dir}/${j.name}-shard${shard}.csv.gz`, cols(out.rows), out.rows);
  if (out.daily.length > 0) writeCsvGz(`${dir}/${j.name}-daily-shard${shard}.csv.gz`, cols(out.daily), out.daily);
  const sorted = [...out.ms].sort((a, b) => a - b);
  writeFileSync(`${dir}/${j.name}-timing-shard${shard}.json`, `${JSON.stringify({ job: j.name, shard, users: out.users, runs: out.ms.length, wallMs, runMsTotal: sorted.reduce((a, b) => a + b, 0), runMsP50: sorted[Math.floor(sorted.length / 2)] ?? null, runMsMax: sorted[sorted.length - 1] ?? null }, null, 2)}\n`);
}
