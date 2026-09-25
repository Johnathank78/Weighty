/**
 * Journal battery, iteration 2 (prompt 36): job definitions and raw export. Measurement only.
 *
 * A job is a deterministic list of (user spec, arms). `runJobShard` simulates the users i with i mod shards === shard and
 * writes one CSV row per user and arm (tests/experiments-journal/results/<dir>/<job>-shard<k>.csv.gz), the daily series
 * of the sampled users (<job>-daily-shard<k>.csv.gz) and the shard timing (<job>-timing-shard<k>.json). Tables are rebuilt
 * from these files only (tables2.experiment.ts).
 *
 * Declared seeds: tests/helpers/closedLoop.ts, SEED_BASES (all new, disjoint from phases 1 and 1b).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  POPULATIONS,
  PRINCIPAL,
  SEED_BASES,
  SIM_DAYS,
  armMetrics,
  athleteSlots,
  bmiOf,
  closedLoopSlots,
  journalArm,
  lhsSeed,
  makeSpec,
  simulateArmFromScratch,
  simulateUser,
} from '../../helpers/closedLoop';
import type { ArmConfig, CarbWorld, Population, ProfileSlot, SimState, SpecOptions, USchedule, UserSpec, World } from '../../helpers/closedLoop';
import { writeCsvGz } from '../../helpers/journalExport';
import type { CsvValue } from '../../helpers/journalExport';

export const RESULTS = 'tests/experiments-journal/results';

export type JobUser = { spec: UserSpec; arms: ArmConfig[]; daily: boolean; tags: Record<string, CsvValue> };
export type Job = { name: string; dir: string; count: number; user: (i: number) => JobUser | null };

const A: ArmConfig = { key: 'A', kind: 'A' };
const C: ArmConfig = { key: 'C', kind: 'C' };
const J = (x: number) => journalArm('J', x);
/** P00 control "logged = real kcal" (s5.4): NASEM prior, floor applied to the logged figure without the x 1.10. */
const JN = (x: number) => journalArm('JN', x, { prior: 'nasem', floorMultiplier: undefined });
const JG = (x: number) => journalArm('JG', x, { carbSource: 'logged' });

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

function spec(slot: ProfileSlot, base: number, index: number, o: SpecOptions): UserSpec {
  return makeSpec(slot, base, index, o);
}

/** Users per population block: index i of the job = block * n + j, j the user index inside the block. */
function blocks<T>(items: readonly T[], n: number, i: number): { item: T; j: number } | null {
  const b = Math.floor(i / n);
  const item = items[b];
  return item === undefined ? null : { item, j: i % n };
}

export function jobFor(name: string, x: number): Job {
  switch (name) {
    // 6.1: ideal world, 200 perfect followers, current method.
    case 'ideal': {
      const base = SEED_BASES.ideal;
      return {
        name,
        dir: 'controls2',
        count: 200,
        user: (i) => ({ spec: spec(slots(200, base)[i] as ProfileSlot, base, i, { pass: 'ideal', behavior: 'follower', population: POPULATIONS.P00 as Population, ideal: true }), arms: [A], daily: i < 20, tags: { population: 'ideal' } }),
      };
    }
    // 6.2: 120 non-followers of P10 (about 50 with a proposal), every arm; bifurcation compared with full replays.
    case 'pairing': {
      const base = SEED_BASES.pairing;
      return {
        name,
        dir: 'controls2',
        count: 120,
        user: (i) => ({ spec: spec(slots(120, base)[i] as ProfileSlot, base, i, { pass: 'pairing', behavior: 'nonfollower', population: POPULATIONS.P10 as Population }), arms: [A, J(x), C, JN(x), JG(x)], daily: false, tags: { population: 'P10' } }),
      };
    }
    // 6.3: cost pilot, 50 non-followers with every arm and 50 followers.
    case 'pilot2': {
      const base = SEED_BASES.pilot2;
      return {
        name,
        dir: 'pilot2',
        count: 100,
        user: (i) => {
          const behavior = i < 50 ? 'nonfollower' : 'follower';
          const j = i % 50;
          const arms = behavior === 'nonfollower' ? [A, journalArm('J100', 1), journalArm('J85', 0.85), journalArm('J70', 0.7), C, JN(0.85), JG(0.85)] : [A, J(0.85), C];
          return { spec: spec(slots(50, base + (i < 50 ? 0 : 50_000))[j] as ProfileSlot, base + (i < 50 ? 0 : 50_000), j, { pass: 'pilot2', behavior, population: POPULATIONS.P10 as Population }), arms, daily: false, tags: { population: 'P10' } };
        },
      };
    }
    // 7.1: training, 1 000 non-followers per principal population, J for each X (A for S5).
    case 'c1train': {
      const base = SEED_BASES.c1trainNonFollowers;
      const n = 1000;
      return {
        name,
        dir: 'c1train',
        count: n * PRINCIPAL.length,
        user: (i) => {
          const b = blocks(PRINCIPAL, n, i);
          if (!b) return null;
          const pop = POPULATIONS[b.item] as Population;
          return { spec: spec(slots(n, base)[b.j] as ProfileSlot, base, b.j, { pass: 'c1train', behavior: 'nonfollower', population: pop }), arms: [A, journalArm('J100', 1), journalArm('J85', 0.85), journalArm('J70', 0.7)], daily: false, tags: { population: pop.key } };
        },
      };
    }
    // 7.2: validation, 2 000 non-followers and 1 000 followers per principal population; A, J, C (+ J-NASEM for P00).
    case 'c1': {
      const nf = 2000;
      const fo = 1000;
      return {
        name,
        dir: 'c1',
        count: (nf + fo) * PRINCIPAL.length,
        user: (i) => {
          const perPop = nf + fo;
          const pop = POPULATIONS[PRINCIPAL[Math.floor(i / perPop)] as string] as Population | undefined;
          if (!pop) return null;
          const k = i % perPop;
          const follower = k >= nf;
          const base = follower ? SEED_BASES.c1Followers : SEED_BASES.c1NonFollowers;
          const j = follower ? k - nf : k;
          const n = follower ? fo : nf;
          const arms = pop.key === 'P00' ? [A, J(x), C, JN(x)] : [A, J(x), C];
          return { spec: spec(slots(n, base)[j] as ProfileSlot, base, j, { pass: 'c1', behavior: follower ? 'follower' : 'nonfollower', population: pop }), arms, daily: j < 100, tags: { population: pop.key } };
        },
      };
    }
    // 7.2 sensitivities [S]: the first 1 000 validation non-followers with the sensitivity laws of u, J only.
    case 'c1sens': {
      const base = SEED_BASES.c1NonFollowers;
      const keys = ['P10_sd20', 'P10_slope-5', 'P10_slope-10'];
      return {
        name,
        dir: 'c1',
        count: 1000 * keys.length,
        user: (i) => {
          const b = blocks(keys, 1000, i);
          if (!b) return null;
          const pop = POPULATIONS[b.item] as Population;
          return { spec: spec(slots(2000, base)[b.j] as ProfileSlot, base, b.j, { pass: 'c1', behavior: 'nonfollower', population: pop }), arms: [J(x)], daily: false, tags: { population: pop.key } };
        },
      };
    }
    // 7.2 robustness (500 non-followers of P10, J and C) and acceptance at 70 % (500, A, J and C).
    case 'c1robust':
    case 'c1accept': {
      const base = SEED_BASES.c1NonFollowers;
      const robust = name === 'c1robust';
      return {
        name,
        dir: 'c1',
        count: 500,
        user: (i) => ({
          spec: spec(slots(2000, base)[i] as ProfileSlot, base, i, { pass: 'c1', behavior: 'nonfollower', population: POPULATIONS.P10 as Population, ...(robust ? { robustness: true } : { acceptance: 0.7 }) }),
          arms: robust ? [J(x), C] : [A, J(x), C],
          daily: false,
          tags: { population: 'P10', variant: robust ? 'robustness' : 'acceptance70' },
        }),
      };
    }
    // 7.3: carbohydrates, 1 000 non-followers of P10 (validation seeds) per world, J and J-glucides.
    case 'carbs': {
      const base = SEED_BASES.c1NonFollowers;
      const worlds: CarbWorld[] = ['base', 'minus10', 'plus10', 'selective'];
      return {
        name,
        dir: 'carbs',
        count: 1000 * worlds.length,
        user: (i) => {
          const b = blocks(worlds, 1000, i);
          if (!b) return null;
          return { spec: spec(slots(2000, base)[b.j] as ProfileSlot, base, b.j, { pass: 'carbs', behavior: 'nonfollower', population: POPULATIONS.P10 as Population, carbWorld: b.item }), arms: [J(x), JG(x)], daily: b.j < 100, tags: { population: 'P10', carb_world: b.item } };
        },
      };
    }
    // 8.1: C2, bias drift from day 56, J only; non-followers drawn until the switch (journal mode) is reached by the sampler.
    case 'c2': {
      const base = SEED_BASES.c2;
      const motifs: Array<{ key: string; pop: Population; schedule: USchedule }> = [
        { key: 'rigour_ramp', pop: POPULATIONS.P20 as Population, schedule: { kind: 'ramp', delta: 0.15, startDay: 56, rampDays: 28 } },
        { key: 'rigour_step', pop: POPULATIONS.P20 as Population, schedule: { kind: 'step', delta: 0.15, startDay: 56, rampDays: 0 } },
        { key: 'relax', pop: POPULATIONS.P05 as Population, schedule: { kind: 'ramp', delta: -0.15, startDay: 56, rampDays: 28 } },
        { key: 'oscillation', pop: { key: 'P12.5', meanU: -0.125, sdU: 0.1, role: 'principal' }, schedule: { kind: 'oscillation', amplitude: 0.075, periodDays: 56, startDay: 56 } },
      ];
      const n = 3000;
      return {
        name,
        dir: 'c2',
        count: n * motifs.length,
        user: (i) => {
          const b = blocks(motifs, n, i);
          if (!b) return null;
          return { spec: spec(slots(n, base)[b.j] as ProfileSlot, base, b.j, { pass: 'c2', behavior: 'nonfollower', population: b.item.pop, uSchedule: b.item.schedule }), arms: [J(x)], daily: b.j < 100, tags: { population: b.item.pop.key, motif: b.item.key } };
        },
      };
    }
    // 8.2: C6 guardrails, two floor arms; over-reporters (u ~ U[0, 15 %]), small builds (floor active), athlete-like (DXA).
    case 'c6': {
      const base = SEED_BASES.c6;
      const n = 1200;
      const arms = [J(x), journalArm('Jfloor1', x, { floorMultiplier: undefined })];
      return {
        name,
        dir: 'c6',
        count: n * 3,
        user: (i) => {
          const group = Math.floor(i / n);
          const j = i % n;
          if (group === 0) {
            return { spec: spec(slots(n, base)[j] as ProfileSlot, base, j, { pass: 'c6', behavior: 'nonfollower', population: POPULATIONS.P10 as Population, uUniform: [0, 0.15] }), arms, daily: false, tags: { population: 'overreport', c6_group: 'overreport' } };
          }
          if (group === 1) {
            const s = smallSlots(n, base + 10_000)[j] as ProfileSlot;
            return { spec: spec(s, base + 10_000, j, { pass: 'c6', behavior: 'nonfollower', population: POPULATIONS.P10 as Population }), arms, daily: false, tags: { population: 'P10', c6_group: 'small' } };
          }
          const s = athleteSlots(n, lhsSeed(base + 20_000))[j] as ProfileSlot;
          return { spec: spec(s, base + 20_000, j, { pass: 'c6', behavior: 'nonfollower', population: POPULATIONS.P10 as Population }), arms, daily: false, tags: { population: 'P10', c6_group: 'athlete' } };
        },
      };
    }
    default:
      throw new Error(`unknown job ${name}`);
  }
}

/** C6 small builds: women 150 to 158 cm, BMI 21 or 26, sedentary, loss (floor active), from the LHS generator. */
function smallSlots(n: number, base: number): ProfileSlot[] {
  const key = `small:${n}:${base}`;
  let s = slotCache.get(key);
  if (!s) {
    s = closedLoopSlots(n, lhsSeed(base)).map((slot, i) => {
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
    slotCache.set(key, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

const r1 = (v: number) => Math.round(v * 10) / 10;

export function specColumns(spec: UserSpec, world: World): Record<string, CsvValue> {
  const p = spec.slot.profile;
  return {
    pass: spec.pass,
    index: spec.index,
    master: spec.master,
    behavior: spec.behavior,
    profile_key: spec.slot.key,
    sex: spec.slot.sex,
    bmi_class: spec.slot.bmiClass,
    bmi: bmiOf(p),
    activity: spec.slot.activity,
    goal: spec.slot.goal,
    age: p.ageYears,
    height: p.heightCm,
    weight: p.currentWeightKg,
    requested_rate: p.weeklyRateTarget,
    shift: spec.slot.shiftKcal,
    weigh_p: spec.slot.weighProbability,
    dev_freq: spec.slot.deviationFrequency,
    u: spec.u,
    u_schedule: spec.uSchedule.kind,
    true_offset: spec.trueOffsetKcal,
    hall_beta_at: spec.hall.betaAt,
    hall_eta_f: spec.hall.etaF,
    hall_eta_l: spec.hall.etaL,
    hall_forbes_c: spec.hall.forbesC,
    hall_glycogen_water: spec.hall.glycogenWater,
    carb_world: spec.carbWorld,
    acceptance: spec.acceptance,
    robustness: spec.robustness,
    true_start: world.trueStartKg,
    nasem_declared: world.nasemDeclaredKcal,
    base_carb_fraction: world.baseCarbFraction,
    onboarding_target: world.onboardingPlan.calorieTarget,
  };
}

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

export function stateColumns(st: SimState): Record<string, CsvValue> {
  return {
    proposal_day: st.proposalDay,
    accepted: st.accepted,
    switch_day: st.switchDay,
    first_switch_plan_day: st.firstSwitchPlanDay,
    final_mode: st.mode,
    recal_days: st.recalDays.join('/'),
    n_recal: st.recalDays.length,
    declined_recals: st.declinedRecals,
    plan_failures: st.planFailures.join('/'),
    tc_median14: st.tc?.median14 ?? null,
    tc_rounded: st.tc?.rounded ?? null,
    tc_final: st.tc?.final ?? null,
    tc_floor: st.tc?.floor ?? null,
    tc_replaced: st.tc?.replaced ?? null,
    true_w_end: st.trueW[SIM_DAYS] as number,
    evals: st.evals
      .map((e) => [e.day, e.mode, e.gateMet ? 1 : 0, r1(e.displayedMaintenanceKcal), e.offsetMedian === null ? '' : r1(e.offsetMedian), e.truthLogged === null ? '' : r1(e.truthLogged), r1(e.truthReal), e.surfaced ? 1 : 0, e.applied ? 1 : 0].join(':'))
      .join('|'),
    plans: st.plans.map((p) => [p.day, p.kind, r1(p.calorieTarget), p.weeklyRateTarget, r1(p.maintenanceKcal), r1(p.proteinG), r1(p.hardFloorKcal), p.lowEnergyAvailability ? 1 : 0, p.oracleTarget === undefined || p.oracleTarget === null ? '' : r1(p.oracleTarget)].join(':')).join('|'),
  };
}

export type ShardOutput = { rows: Array<Record<string, CsvValue>>; daily: Array<Record<string, CsvValue>>; users: number; proposals: number; ms: number[] };

export function runUser(job: Job, i: number, out: ShardOutput): void {
  const ju = job.user(i);
  if (!ju) return;
  const t0 = performance.now();
  const res = simulateUser(ju.spec, ju.arms);
  out.ms.push(performance.now() - t0);
  out.users++;
  if (res.proposalDay !== null) out.proposals++;
  const common = { job: job.name, ...ju.tags, ...specColumns(ju.spec, res.world), common_until: res.commonUntil };
  for (const { arm, state } of res.arms) {
    out.rows.push({ ...common, ...armColumns(arm), ...stateColumns(state), ...armMetrics(res.world, arm, state) });
    if (ju.daily) {
      for (let d = 0; d < SIM_DAYS; d++) {
        out.daily.push({
          job: job.name,
          population: ju.tags.population,
          ...(ju.tags.carb_world !== undefined ? { carb_world: ju.tags.carb_world } : {}),
          ...(ju.tags.motif !== undefined ? { motif: ju.tags.motif } : {}),
          behavior: ju.spec.behavior,
          index: ju.spec.index,
          arm: arm.key,
          day: d,
          true_w: Math.round((state.trueW[d] as number) * 1000) / 1000,
          real: r1(state.realKcal[d] as number),
          logged: r1(state.loggedKcal[d] as number),
          logged_carbs_g: r1(state.loggedCarbsG[d] as number),
          target: r1(state.planTarget[d] as number),
          targeting: state.targetingDay[d] as boolean,
          deviation: state.deviationDay[d] as boolean,
        });
      }
    }
  }
}

/** s6.2: the arms of the bifurcated run against full replays from day 0, compared value by value (JSON, round-trip doubles). */
export function pairingCheck(job: Job, i: number): { users: number; proposal: boolean; arms: number; mismatches: string[] } {
  const ju = job.user(i);
  if (!ju) return { users: 0, proposal: false, arms: 0, mismatches: [] };
  const res = simulateUser(ju.spec, ju.arms);
  const mismatches: string[] = [];
  const pick = (s: SimState) =>
    JSON.stringify({
      mode: s.mode,
      proposalDay: s.proposalDay,
      accepted: s.accepted,
      switchDay: s.switchDay,
      firstSwitchPlanDay: s.firstSwitchPlanDay,
      recalDays: s.recalDays,
      tc: s.tc,
      trueW: s.trueW,
      realKcal: s.realKcal,
      loggedKcal: s.loggedKcal,
      loggedCarbsG: s.loggedCarbsG,
      planTarget: s.planTarget,
      planRate: s.planRate,
      targetingDay: s.targetingDay,
      floorReal: s.floorReal,
      plans: s.plans,
      evals: s.evals,
      journalDiag: s.journalDiag,
      plan: s.store.plan,
      weights: s.store.weights.map((w) => [w.date, w.weightKg]),
      dailyLogs: s.store.dailyLogs,
      entries: s.store.foodJournal.entries.map((e) => [e.date, e.consumedTime, e.intake]),
    });
  for (const { arm, state } of res.arms) {
    const replay = simulateArmFromScratch(ju.spec, arm);
    if (pick(state) !== pick(replay)) mismatches.push(`${i}:${arm.key}`);
  }
  return { users: 1, proposal: res.proposalDay !== null, arms: res.arms.length, mismatches };
}

export function writeShard(job: Job, shard: number, out: ShardOutput, wallMs: number): void {
  const dir = `${RESULTS}/${job.dir}`;
  mkdirSync(dir, { recursive: true });
  const cols = (rows: ReadonlyArray<Record<string, CsvValue>>) => [...new Set(rows.flatMap((r) => Object.keys(r)))];
  writeCsvGz(`${dir}/${job.name}-shard${shard}.csv.gz`, cols(out.rows), out.rows);
  if (out.daily.length > 0) writeCsvGz(`${dir}/${job.name}-daily-shard${shard}.csv.gz`, cols(out.daily), out.daily);
  const sorted = [...out.ms].sort((a, b) => a - b);
  writeFileSync(
    `${dir}/${job.name}-timing-shard${shard}.json`,
    `${JSON.stringify({ job: job.name, shard, users: out.users, proposals: out.proposals, wallMs, userMsTotal: sorted.reduce((a, b) => a + b, 0), userMsP50: sorted[Math.floor(sorted.length / 2)] ?? null, userMsMax: sorted[sorted.length - 1] ?? null }, null, 2)}\n`,
  );
}
