/**
 * Iteration 2c (prompt 39 s7, amendment 5 A5.1): statistics added to those of 2b (stats2b.ts). Bootstrap of users (2 000
 * resamples; a user keeps all his units, and all his arms for paired statistics). Wilson only for proportions of users.
 */
import { B, quantile, sortNum } from '../it2b/stats2b';
import { createRng } from '../../helpers/random';

export const SEED_2C = 39_000_001;

export type Share = { k: number; n: number; users: number; p: number; lo: number; hi: number };

/** Proportion whose unit is not the user (user-weeks, user-blocks): sum k / sum n, users resampled (A5.1). */
export function bootstrapShare(byUser: ReadonlyArray<readonly [number, number]>, seed = SEED_2C): Share {
  const users = byUser.filter(([, n]) => n > 0);
  const total = (sample: ReadonlyArray<readonly [number, number]>) => {
    let k = 0;
    let n = 0;
    for (const [a, b] of sample) {
      k += a;
      n += b;
    }
    return { k, n };
  };
  const all = total(users);
  const rng = createRng(seed);
  const stats: number[] = [];
  for (let b = 0; b < B && users.length > 0; b++) {
    const sample: Array<readonly [number, number]> = [];
    for (let j = 0; j < users.length; j++) sample.push(users[Math.floor(rng.next() * users.length)] as readonly [number, number]);
    const t = total(sample);
    stats.push(t.n > 0 ? t.k / t.n : Number.NaN);
  }
  const s = sortNum(stats.filter((v) => Number.isFinite(v)));
  return { k: all.k, n: all.n, users: users.length, p: all.n > 0 ? all.k / all.n : Number.NaN, lo: quantile(s, 0.025), hi: quantile(s, 0.975) };
}

/** P90 / median of pooled values (A5.4, S2-NI), and the P90 - median gap. */
export function dispersion(values: readonly number[]): { median: number; p90: number; ratio: number; gap: number } {
  const s = sortNum(values);
  const median = quantile(s, 0.5);
  const p90 = quantile(s, 0.9);
  return { median, p90, ratio: p90 / median, gap: p90 - median };
}

export type PairedDispersion = { users: number; a: ReturnType<typeof dispersion>; b: ReturnType<typeof dispersion>; value: number; lo: number; hi: number; gapValue: number; gapLo: number; gapHi: number };

/** Paired difference of P90 / median (arm b - arm a), users resampled with both arms; the gap difference alongside. */
export function pairedDispersionDiff(pairs: ReadonlyArray<{ a: readonly number[]; b: readonly number[] }>, seed = SEED_2C): PairedDispersion {
  const users = pairs.filter((p) => p.a.length > 0 && p.b.length > 0);
  const stat = (sample: ReadonlyArray<{ a: readonly number[]; b: readonly number[] }>) => {
    const a = dispersion(sample.flatMap((p) => p.a));
    const b = dispersion(sample.flatMap((p) => p.b));
    return { a, b, ratio: b.ratio - a.ratio, gap: b.gap - a.gap };
  };
  const rng = createRng(seed);
  const ratios: number[] = [];
  const gaps: number[] = [];
  for (let k = 0; k < B && users.length > 0; k++) {
    const sample: Array<{ a: readonly number[]; b: readonly number[] }> = [];
    for (let j = 0; j < users.length; j++) sample.push(users[Math.floor(rng.next() * users.length)] as { a: readonly number[]; b: readonly number[] });
    const s = stat(sample);
    ratios.push(s.ratio);
    gaps.push(s.gap);
  }
  const all = stat(users);
  const r = sortNum(ratios);
  const g = sortNum(gaps);
  return { users: users.length, a: all.a, b: all.b, value: all.ratio, lo: quantile(r, 0.025), hi: quantile(r, 0.975), gapValue: all.gap, gapLo: quantile(g, 0.025), gapHi: quantile(g, 0.975) };
}
