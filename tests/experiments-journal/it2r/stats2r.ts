/**
 * Relaunch of iteration 2 (prompt 40 s11): statistics and verdict rules added to those of 2b and 2c (stats2b.ts,
 * stats2c.ts). Bootstrap of users (2 000 resamples; a user keeps all his units, and all his arms for paired statistics);
 * Wilson only for proportions of users (A5.1).
 *
 * Verdict of one criterion on its 95 % CI (THRESHOLDS.md, common rules): GO when the whole CI satisfies the threshold,
 * NO-GO when the whole CI is on the wrong side, INCONCLUSIF when the CI overlaps the threshold (never GO; one doubled pass
 * with new seeds, A1.3). An invariant (count required to be 0) is GO or NO-GO. A criterion with no user to judge is
 * NON JUGEABLE and counts as NO-GO in every combination (strictest reading, declared before any measurement).
 */
import { B, quantile, sortNum } from '../it2b/stats2b';
import { createRng } from '../../helpers/random';

export const SEED_2R = 40_000_001;
export type Status = 'GO' | 'NO-GO' | 'INCONCLUSIF' | 'NON JUGEABLE';

/** Combination of several criteria: NO-GO (or NON JUGEABLE) wins, then INCONCLUSIF, else GO. */
export function combine(statuses: readonly Status[]): Status {
  if (statuses.some((s) => s === 'NO-GO' || s === 'NON JUGEABLE')) return 'NO-GO';
  if (statuses.some((s) => s === 'INCONCLUSIF')) return 'INCONCLUSIF';
  return 'GO';
}

/** CI inside [lo, hi] band. */
export function bandStatus(ci: { lo: number; hi: number }, band: readonly [number, number], n: number): Status {
  if (n === 0 || !Number.isFinite(ci.lo) || !Number.isFinite(ci.hi)) return 'NON JUGEABLE';
  if (ci.lo >= band[0] && ci.hi <= band[1]) return 'GO';
  if (ci.hi < band[0] || ci.lo > band[1]) return 'NO-GO';
  return 'INCONCLUSIF';
}

/** Upper bound of the CI at most `max` (GO), strictly below `max` when `strict` (difference < 0). */
export function upperStatus(ci: { lo: number; hi: number }, max: number, n: number, strict = false): Status {
  if (n === 0 || !Number.isFinite(ci.lo) || !Number.isFinite(ci.hi)) return 'NON JUGEABLE';
  if (strict ? ci.hi < max : ci.hi <= max) return 'GO';
  if (strict ? ci.lo >= max : ci.lo > max) return 'NO-GO';
  return 'INCONCLUSIF';
}

/** S4-J (A5.5): share <= 1 % with an upper bound <= 2 %. */
export function s4jStatus(w: { p: number; lo: number; hi: number }, n: number): Status {
  if (n === 0) return 'NON JUGEABLE';
  if (w.p <= 0.01 && w.hi <= 0.02) return 'GO';
  if (w.lo > 0.02 || w.lo > 0.01) return 'NO-GO';
  return 'INCONCLUSIF';
}

export const invariantStatus = (count: number, n: number): Status => (n === 0 ? 'NON JUGEABLE' : count === 0 ? 'GO' : 'NO-GO');

/** Paired difference of means (arm b - arm a) of one value per user, users resampled with both arms. */
export function pairedMeanDiff(pairs: ReadonlyArray<{ a: number; b: number }>, seed = SEED_2R): { users: number; meanA: number; meanB: number; value: number; lo: number; hi: number } {
  const users = pairs.filter((p) => Number.isFinite(p.a) && Number.isFinite(p.b));
  const mean = (v: readonly number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const diff = (s: ReadonlyArray<{ a: number; b: number }>) => mean(s.map((p) => p.b)) - mean(s.map((p) => p.a));
  const rng = createRng(seed);
  const stats: number[] = [];
  for (let k = 0; k < B && users.length > 0; k++) {
    const sample: Array<{ a: number; b: number }> = [];
    for (let j = 0; j < users.length; j++) sample.push(users[Math.floor(rng.next() * users.length)] as { a: number; b: number });
    stats.push(diff(sample));
  }
  const s = sortNum(stats);
  return { users: users.length, meanA: mean(users.map((p) => p.a)), meanB: mean(users.map((p) => p.b)), value: users.length ? diff(users) : Number.NaN, lo: quantile(s, 0.025), hi: quantile(s, 0.975) };
}
