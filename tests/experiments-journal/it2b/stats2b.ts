/**
 * Iteration 2b (prompt 38 s7): statistics of the tables, same definitions as iteration 2a (tables2a.experiment.ts):
 * bootstrap of users (2 000 resamples; a user keeps all his blocks, and all his arms for paired differences), Wilson 95 %.
 */
import { existsSync, readdirSync } from 'node:fs';
import { readCsvGz } from '../../helpers/journalExport';
import { createRng } from '../../helpers/random';

export type Row = Record<string, string>;
export const B = 2000;
export const SEED = 38_000_001;

export function readAll(dir: string, prefix: string): Row[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => new RegExp(`^${prefix}-shard\\d+\\.csv\\.gz$`).test(f))
    .sort()
    .flatMap((f) => readCsvGz(`${dir}/${f}`));
}

export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return (sorted[lo] as number) + ((sorted[hi] as number) - (sorted[lo] as number)) * (pos - lo);
}
export const sortNum = (v: readonly number[]) => [...v].sort((a, b) => a - b);
export const median = (v: readonly number[]) => quantile(sortNum(v), 0.5);

export type Stat = { n: number; users: number; value: number; lo: number; hi: number; p10: number; p90: number };

/** Statistic q of the pooled values (median: q = 0.5), with a bootstrap 95 % CI resampling users. */
export function bootstrapQuantile(byUser: ReadonlyArray<readonly number[]>, q: number, seed = SEED): Stat {
  const users = byUser.filter((u) => u.length > 0);
  const all = sortNum(users.flat());
  const rng = createRng(seed);
  const stats: number[] = [];
  if (users.length > 0) {
    for (let b = 0; b < B; b++) {
      const sample: number[] = [];
      for (let k = 0; k < users.length; k++) sample.push(...(users[Math.floor(rng.next() * users.length)] as readonly number[]));
      stats.push(quantile(sortNum(sample), q));
    }
  }
  const s = sortNum(stats);
  return { n: all.length, users: users.length, value: quantile(all, q), lo: quantile(s, 0.025), hi: quantile(s, 0.975), p10: quantile(all, 0.1), p90: quantile(all, 0.9) };
}

/** Paired difference of pooled medians (arm b - arm a), users resampled with both arms. */
export function pairedMedianDiff(pairs: ReadonlyArray<{ a: readonly number[]; b: readonly number[] }>, seed = SEED): { value: number; lo: number; hi: number } {
  const users = pairs.filter((p) => p.a.length > 0 && p.b.length > 0);
  const diff = (sample: ReadonlyArray<{ a: readonly number[]; b: readonly number[] }>) => median(sample.flatMap((p) => p.b)) - median(sample.flatMap((p) => p.a));
  const rng = createRng(seed);
  const stats: number[] = [];
  for (let k = 0; k < B && users.length > 0; k++) {
    const sample: Array<{ a: readonly number[]; b: readonly number[] }> = [];
    for (let j = 0; j < users.length; j++) sample.push(users[Math.floor(rng.next() * users.length)] as { a: readonly number[]; b: readonly number[] });
    stats.push(diff(sample));
  }
  const s = sortNum(stats);
  return { value: diff(users), lo: quantile(s, 0.025), hi: quantile(s, 0.975) };
}

/** Wilson score interval, 95 %. */
export function wilson(k: number, n: number): { p: number; lo: number; hi: number } {
  if (n === 0) return { p: Number.NaN, lo: Number.NaN, hi: Number.NaN };
  const z = 1.959963984540054;
  const p = k / n;
  const den = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return { p, lo: centre - half, hi: centre + half };
}

export const f3 = (v: number) => (Number.isFinite(v) ? v.toFixed(3).replace('.', ',') : '—');
export const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1).replace('.', ',') : '—');
export const f0 = (v: number) => (Number.isFinite(v) ? v.toFixed(0) : '—');
export const pc = (v: number) => (Number.isFinite(v) ? `${(100 * v).toFixed(2).replace('.', ',')} %` : '—');
export const goalFr = (g: string) => (g === 'loss' ? 'perte' : g === 'gain' ? 'prise' : 'maintien');
export const userKey = (r: Row) => `${r.job}:${r.job_index}`;

/** Paired users of two arms. */
export function paired(rows: readonly Row[], a: string, b: string): Array<{ ra: Row; rb: Row }> {
  const byKey = new Map<string, Record<string, Row>>();
  for (const r of rows) {
    const k = userKey(r);
    const m = byKey.get(k) ?? {};
    m[r.solver_arm as string] = r;
    byKey.set(k, m);
  }
  const out: Array<{ ra: Row; rb: Row }> = [];
  for (const m of byKey.values()) if (m[a] && m[b]) out.push({ ra: m[a] as Row, rb: m[b] as Row });
  return out;
}
