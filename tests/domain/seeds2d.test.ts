/**
 * Iteration 2d (prompt 41 s11): the declared seed bases are disjoint from every previous pass (phases 1 and 1b, iterations
 * 2, 2a, 2b, 2c and the relaunch, derived streams included) and from each other, avoid the bootstrap seeds of the tables,
 * and are valid for the generator (tests/helpers/random.ts takes `seed >>> 0`: every seed must be an integer below 2^32).
 * Every seed a job of iteration 2d consumes (masters, derived streams, LHS, major-deviation share, behaviour and daily sample
 * seeds, sub-bases and unit-test fixtures included) is enumerated, lies in the envelope of its base, and none coincide.
 */
import { describe, expect, it } from 'vitest';
import { SEED_BASES, lhsSeed, streamSeed } from '../helpers/closedLoop';
import { SEED_BASES_2A } from '../experiments-journal/it2a/jobs2a';
import { SEED_BASES_2B } from '../experiments-journal/it2b/jobs2b';
import { SEED_BASES_2C } from '../experiments-journal/it2c/jobs2c';
import { MAJOR_SHARE_SEED_OFFSET, SAMPLE_SEED_OFFSET, SEED_BASES_2R } from '../experiments-journal/it2r/jobs2r';
import { BEHAVIOR_SEED_OFFSET, SEED_BASES_2D, jobFor2d } from '../experiments-journal/it2d/jobs2d';

const MAX_INDEX = 99_999;
const MAX_STREAM = 20;
const envelope = (base: number): [number, number] => [base, streamSeed(base + MAX_INDEX, MAX_STREAM)];
const JOBS = ['pilot2d', 'fallback2d', 'pairing2d', 'v1', 'v1x2', 'v2', 'v2x2', 'v2h4', 'v3', 'v3x2', 'v4', 'v4x2'];
/** Unit-test fixtures (tests/domain/jstar2d.test.ts), pilot base. */
const UNIT_INDEXES = [90_003, 90_005, 90_100, 90_101, 90_200, 90_201];
/** Bootstrap seeds of the table scripts (stats2b, stats2c, stats2r, tables2d). */
const BOOTSTRAP = [38_000_001, 39_000_001, 40_000_001, 41_000_001];

describe('seed bases of iteration 2d (prompt 41 s11)', () => {
  const previous: Array<[string, [number, number]]> = [
    ['phases 1 and 1b', [0, 6_000_000 - 1]],
    ...Object.entries(SEED_BASES).map(([k, b]) => [`it2 ${k}`, envelope(b)] as [string, [number, number]]),
    ...Object.entries(SEED_BASES_2A).map(([k, b]) => [`2a ${k}`, envelope(b)] as [string, [number, number]]),
    ...Object.entries(SEED_BASES_2B).map(([k, b]) => [`2b ${k}`, envelope(b)] as [string, [number, number]]),
    ...Object.entries(SEED_BASES_2C).map(([k, b]) => [`2c ${k}`, envelope(b)] as [string, [number, number]]),
    ...Object.entries(SEED_BASES_2R).map(([k, b]) => [`2r ${k}`, envelope(b)] as [string, [number, number]]),
  ];
  const fresh = Object.entries(SEED_BASES_2D).map(([k, b]) => [k, envelope(b)] as [string, [number, number]]);

  it('the envelopes are below 2^32, disjoint from each other, from every previous pass and from the bootstrap seeds', () => {
    const overlap = (a: [number, number], b: [number, number]) => a[0] <= b[1] && b[0] <= a[1];
    for (const [name, env] of fresh) {
      expect(env[1]).toBeLessThan(2 ** 32);
      for (const [other, prev] of previous) expect(overlap(env, prev), `${name} vs ${other}`).toBe(false);
      for (const [other, env2] of fresh) if (other !== name) expect(overlap(env, env2), `${name} vs ${other}`).toBe(false);
      for (const s of BOOTSTRAP) expect(s >= env[0] && s <= env[1], `${name} vs bootstrap ${s}`).toBe(false);
    }
  });

  it('every seed consumed by the jobs lies in the envelope of its base, is valid for the generator, and none coincide', () => {
    const baseOf = (seed: number) => fresh.find(([, [lo, hi]]) => seed >= lo && seed <= hi)?.[0];
    const masters = new Set<number>();
    const subBases = new Set<number>();
    for (const name of JOBS) {
      const job = jobFor2d(name);
      subBases.add(job.base);
      for (let i = 0; i < job.count; i++) {
        const u = job.user(i);
        if (!u) continue;
        subBases.add(u.base);
        masters.add(u.base + u.index);
      }
    }
    for (const i of UNIT_INDEXES) masters.add(SEED_BASES_2D.pilot2d + i);
    const special = new Set<number>();
    for (const b of subBases) {
      for (const s of [lhsSeed(b), b + MAJOR_SHARE_SEED_OFFSET, b + BEHAVIOR_SEED_OFFSET, b + SAMPLE_SEED_OFFSET]) {
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
    for (const s of special) put(s, 'LHS, share, behaviour or sample seed');
    const declared = Object.fromEntries(Object.entries(SEED_BASES_2D)) as Record<string, number>;
    for (const m of masters) {
      const name = baseOf(m) as string;
      expect(m - (declared[name] as number), `master ${m}`).toBeLessThanOrEqual(MAX_INDEX);
      expect(baseOf(streamSeed(m, MAX_STREAM))).toBe(name);
    }
  });
});
