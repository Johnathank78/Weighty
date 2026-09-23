/**
 * Raw per-user export of the journal battery (prompt 34 s4-s5). Measurement only: nothing here feeds an estimate.
 * One CSV row per simulated user, arm and cell, gzip-compressed; numbers are written with the shortest round-trip
 * representation so the aggregated tables can be rebuilt from the export bit for bit.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

/** Posterior mass in the first / last 5 and 10 points of a grid (lower and upper bounds). */
export type EdgeMass = { low5: number; low10: number; high5: number; high10: number };

export function edgeMass(probabilities: readonly number[]): EdgeMass {
  const n = probabilities.length;
  const sum = (from: number, to: number) => {
    let s = 0;
    for (let i = from; i < to; i++) s += probabilities[i] as number;
    return s;
  };
  return { low5: sum(0, 5), low10: sum(0, 10), high5: sum(n - 5, n), high10: sum(n - 10, n) };
}

export type CsvValue = string | number | boolean | null | undefined;

function cell(v: CsvValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'NaN';
    if (Object.is(v, -0)) return '-0';
    return String(v);
  }
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function writeCsvGz(path: string, columns: readonly string[], rows: ReadonlyArray<Record<string, CsvValue>>): void {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(','));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, gzipSync(`${lines.join('\n')}\n`, { level: 9 }));
}

function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Rows as string records (empty string = missing). */
export function readCsvGz(path: string): Array<Record<string, string>> {
  const text = gunzipSync(readFileSync(path)).toString('utf8');
  const [header, ...lines] = text.split('\n').filter((l) => l.length > 0);
  if (!header) return [];
  const columns = parseLine(header);
  return lines.map((l) => {
    const values = parseLine(l);
    return Object.fromEntries(columns.map((c, i) => [c, values[i] ?? '']));
  });
}

export const num = (v: string | undefined): number => (v === '-0' ? -0 : Number(v));
export const bool = (v: string | undefined): boolean => v === '1';

export const JOURNAL_RESULTS_DIR = 'tests/experiments-journal/results';
