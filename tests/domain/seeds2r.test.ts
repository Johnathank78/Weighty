/**
 * Relaunch of iteration 2 (prompt 40 s11): the declared seed bases are disjoint from every previous pass (phases 1 and 1b,
 * iterations 2, 2a, 2b and 2c, derived streams included) and from each other, and valid for the generator
 * (tests/helpers/random.ts takes `seed >>> 0`: every seed must be an integer below 2^32). Every seed a job of the relaunch
 * consumes (masters, derived streams, LHS, major-deviation share and daily sample seeds, sub-bases and unit-test fixtures
 * included) is enumerated, lies in the envelope of its base, and no two of them coincide.
 */
import { describe, expect, it } from 'vitest';
import { SEED_BASES, lhsSeed, streamSeed } from '../helpers/closedLoop';
import { SEED_BASES_2A } from '../experiments-journal/it2a/jobs2a';
import { SEED_BASES_2B } from '../experiments-journal/it2b/jobs2b';
import { SEED_BASES_2C } from '../experiments-journal/it2c/jobs2c';
import { EQUIV_G_SUB_BASE, MAJOR_SHARE_SEED_OFFSET, SAMPLE_SEED_OFFSET, SEED_BASES_2R, jobFor2r } from '../experiments-journal/it2r/jobs2r';

const MAX_INDEX = 99_999;
const MAX_STREAM = 20;
/** Every seed a base can produce: masters (index < 100 000, sub-bases included), derived streams, LHS, share and sample seeds. */
const envelope = (base: number): [number, number] => [base, streamSeed(base + MAX_INDEX, MAX_STREAM)];
const JOBS = ['pilot2r', 'pairing2r', 'c1train', 'c1trainx2', 'c1v1', 'c1v1x2', 'c1v2', 'c1v2x2', 'c1sens', 'c1sensx2', 'c1robust', 'c1accept', 'carbs', 'carbsx2', 'c2', 'c2x2', 'c6', 'c6x2'];
/** Users outside the jobs: the ideal users of the extended equivalence (s6.1) and the unit-test fixtures (pilot base). */
const EQUIV_G_USERS = 400;
const UNIT_INDEXES = [90_001, 90_003, 90_005, 90_100, 90_101];

describe('seed bases of the relaunch of iteration 2 (prompt 40 s11)', () => {
  const previous: Array<[string, [number, number]]> = [
    ['phases 1 and 1b', [0, 6_000_000 - 1]],
    ...Object.entries(SEED_BASES).map(([k, b]) => [`it2 ${k}`, envelope(b)] as [string, [number, number]]),
    ...Object.entries(SEED_BASES_2A).map(([k, b]) => [`2a ${k}`, envelope(b)] as [string, [number, number]]),
    ...Object.entries(SEED_BASES_2B).map(([k, b]) => [`2b ${k}`, envelope(b)] as [string, [number, number]]),
    ...Object.entries(SEED_BASES_2C).map(([k, b]) => [`2c ${k}`, envelope(b)] as [string, [number, number]]),
  ];
  const fresh = Object.entries(SEED_BASES_2R).map(([k, b]) => [k, envelope(b)] as [string, [number, number]]);

  it('the envelopes are below 2^32, disjoint from each other and from every previous pass', () => {
    const overlap = (a: [number, number], b: [number, number]) => a[0] <= b[1] && b[0] <= a[1];
    for (const [name, env] of fresh) {
      expect(env[1]).toBeLessThan(2 ** 32);
      for (const [other, prev] of previous) expect(overlap(env, prev), `${name} vs ${other}`).toBe(false);
      for (const [other, env2] of fresh) if (other !== name) expect(overlap(env, env2), `${name} vs ${other}`).toBe(false);
    }
  });

  it('every seed consumed by the jobs lies in the envelope of its base, is valid for the generator, and none coincide', () => {
    process.env.IT2R_X = '0.85';
    const baseOf = (seed: number) => fresh.find(([, [lo, hi]]) => seed >= lo && seed <= hi)?.[0];
    const masters = new Set<number>();
    const special = new Set<number>();
    const subBases = new Set<number>();
    const addMaster = (master: number) => masters.add(master);
    for (const name of JOBS) {
      const job = jobFor2r(name);
      subBases.add(job.base);
      for (let i = 0; i < job.count; i++) {
        const u = job.user(i);
        if (!u) continue;
        subBases.add(u.base);
        addMaster(u.base + u.index);
      }
    }
    subBases.add(EQUIV_G_SUB_BASE);
    for (let i = 0; i < EQUIV_G_USERS; i++) addMaster(EQUIV_G_SUB_BASE + i);
    for (const i of UNIT_INDEXES) addMaster(SEED_BASES_2R.pilot2r + i);
    for (const b of subBases) {
      for (const s of [lhsSeed(b), b + MAJOR_SHARE_SEED_OFFSET, b + SAMPLE_SEED_OFFSET]) {
        expect(special.has(s), `special seed ${s} used twice`).toBe(false);
        special.add(s);
      }
    }
    const all = new Map<number, string>();
    const put = (seed: number, what: string) => {
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed >>> 0, what).toBe(seed);
      expect(baseOf(seed), `${what} ${seed} outside every declared envelope`).toBeDefined();
      const prev = all.get(seed);
      expect(prev, `${what} ${seed} collides with ${prev}`).toBeUndefined();
      all.set(seed, what);
    };
    for (const m of masters) {
      put(m, 'master');
      for (let k = 1; k <= MAX_STREAM; k++) put(streamSeed(m, k), `stream ${k} of ${m}`);
    }
    for (const s of special) put(s, 'LHS, share or sample seed');
    // Every master is at most MAX_INDEX above the base of its envelope (sub-bases included), so its streams stay inside.
    const declared = Object.fromEntries(Object.entries(SEED_BASES_2R)) as Record<string, number>;
    for (const m of masters) {
      const name = baseOf(m) as string;
      expect(m - (declared[name] as number), `master ${m}`).toBeLessThanOrEqual(MAX_INDEX);
      expect(baseOf(streamSeed(m, MAX_STREAM))).toBe(name);
    }
  });
});
