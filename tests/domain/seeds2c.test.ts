/**
 * Iteration 2c (prompt 39 s4.1): the declared seed bases are disjoint from every previous pass, derived streams included,
 * and valid for the generator (tests/helpers/random.ts takes `seed >>> 0`: every seed must be an integer below 2^32).
 */
import { describe, expect, it } from 'vitest';
import { SEED_BASES, lhsSeed, streamSeed } from '../helpers/closedLoop';
import { SEED_BASES_2A } from '../experiments-journal/it2a/jobs2a';
import { SEED_BASES_2B } from '../experiments-journal/it2b/jobs2b';
import { SAMPLE_SEED_OFFSET, SEED_BASES_2C, jobFor2c } from '../experiments-journal/it2c/jobs2c';

const MAX_INDEX = 99_999;
const MAX_STREAM = 20;
/** Every seed a base can produce: masters, derived streams, LHS (and, in 2c, the sample seed). */
const envelope = (base: number): [number, number] => [base, streamSeed(base + MAX_INDEX, MAX_STREAM)];

describe('seed bases of iteration 2c (prompt 39 s4.1)', () => {
  const previous: Array<[string, [number, number]]> = [
    ['phases 1 and 1b', [0, 6_000_000 - 1]],
    ...Object.entries(SEED_BASES).map(([k, b]) => [`it2 ${k}`, envelope(b)] as [string, [number, number]]),
    ...Object.entries(SEED_BASES_2A).map(([k, b]) => [`2a ${k}`, envelope(b)] as [string, [number, number]]),
    ...Object.entries(SEED_BASES_2B).map(([k, b]) => [`2b ${k}`, envelope(b)] as [string, [number, number]]),
  ];
  const fresh = Object.entries(SEED_BASES_2C).map(([k, b]) => [k, envelope(b)] as [string, [number, number]]);

  it('every seed of every 2c base (masters, streams, LHS, sample) lies in its envelope and below 2^32', () => {
    for (const [name, base] of Object.entries(SEED_BASES_2C)) {
      const [lo, hi] = envelope(base);
      const job = jobFor2c(name);
      expect(job.base).toBe(base);
      expect(job.count - 1).toBeLessThanOrEqual(MAX_INDEX);
      for (const seed of [base, base + job.count - 1, streamSeed(base + job.count - 1, MAX_STREAM), lhsSeed(base), base + SAMPLE_SEED_OFFSET]) {
        expect(seed).toBeGreaterThanOrEqual(lo);
        expect(seed).toBeLessThanOrEqual(hi);
        expect(Number.isInteger(seed)).toBe(true);
        expect(seed >>> 0).toBe(seed);
      }
      // LHS and sample seeds sit between the masters and the first derived stream.
      expect(lhsSeed(base)).toBeGreaterThan(base + MAX_INDEX);
      expect(base + SAMPLE_SEED_OFFSET).toBeGreaterThan(base + MAX_INDEX);
      expect(base + SAMPLE_SEED_OFFSET).toBeLessThan(streamSeed(base, 1));
      expect(base + SAMPLE_SEED_OFFSET).not.toBe(lhsSeed(base));
      expect(hi).toBeLessThan(2 ** 32);
    }
  });

  it('the 2c envelopes are disjoint from each other and from every previous pass', () => {
    const overlap = (a: [number, number], b: [number, number]) => a[0] <= b[1] && b[0] <= a[1];
    for (const [name, env] of fresh) {
      for (const [other, prev] of previous) expect(overlap(env, prev), `${name} vs ${other}`).toBe(false);
      for (const [other, env2] of fresh) if (other !== name) expect(overlap(env, env2), `${name} vs ${other}`).toBe(false);
    }
  });
});
