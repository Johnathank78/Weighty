/**
 * Iteration 2d (prompt 41 s4.4): the simulator of this iteration, in the configuration of report 40 (relaunch job code,
 * it2r/jobs2r.ts, X = 100 %, arms A, J, C, J-NASEM; options of 2d absent), reproduces the committed raw rows of shard 5 of
 * the doubled V1 pass `c1v1x2` (report 40). Every committed column of the per-user rows and of the daily rows is compared,
 * rows matched by user, arm (and day).
 * Run in sub-shards (the users of the shard, i mod 16 = 5, split k mod SUBS = SUB):
 *   REPRO_SUB=<k> REPRO_SUBS=<n> npx vitest run -c vitest.journal.config.ts it2d/repro2r   (writes a part)
 *   REPRO_SUMMARY=1 REPRO_SUBS=<n> npx vitest run -c vitest.journal.config.ts it2d/repro2r (writes results/it2d/controls/repro2r.txt)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { readCsvGz } from '../../helpers/journalExport';
import type { CsvValue } from '../../helpers/journalExport';
import { IT2R_DIR, dailySample2r, emptyShard2r, jobFor2r, runUser2r } from '../it2r/jobs2r';
import { IT2D_DIR } from './jobs2d';

const SHARD = 5;
const SHARDS = 16;
const DIR = `${IT2D_DIR}/controls`;
const asCsv = (v: CsvValue) => (v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
const rowKey = (r: Record<string, CsvValue>) => `${asCsv(r.job_index)}:${asCsv(r.arm)}`;
const dayKey = (r: Record<string, CsvValue>) => `${rowKey(r)}:${asCsv(r.day)}`;

type Part = { users: number; rows: number; daily: number; values: number; diffs: number; dailyValues: number; dailyDiffs: number; missing: number; examples: string[] };

it('c1v1x2 shard reproduced by the simulator of iteration 2d (report 40 configuration)', () => {
  process.env.IT2R_X = '1';
  const subs = Number(process.env.REPRO_SUBS ?? '1');
  const committedRows = readCsvGz(`${IT2R_DIR}/c1v1/c1v1x2-shard${SHARD}.csv.gz`);
  const committedDaily = readCsvGz(`${IT2R_DIR}/c1v1/c1v1x2-daily-shard${SHARD}.csv.gz`);
  mkdirSync(DIR, { recursive: true });
  if (process.env.REPRO_SUMMARY) {
    const parts: Part[] = Array.from({ length: subs }, (_, k) => JSON.parse(readFileSync(`${DIR}/repro2r-part${k}.json`, 'utf8')) as Part);
    const sum = (f: keyof Omit<Part, 'examples'>) => parts.reduce((s, p) => s + p[f], 0);
    const text = [
      `Iteration 2d (prompt 41 s4.4): c1v1x2 shard ${SHARD} (report 40, doubled V1 pass) replayed with the simulator of this iteration in the configuration of report 40 (it2r/jobs2r.ts, X = 100 %, arms A, J, C, JN, options of 2d absent), ${subs} sub-shards.`,
      `Users: ${sum('users')}. Per-user rows: ${sum('rows')} produced, ${committedRows.length} committed; ${sum('values')} values compared, ${sum('diffs')} differences.`,
      `Daily rows: ${sum('daily')} produced, ${committedDaily.length} committed; ${sum('dailyValues')} values compared, ${sum('dailyDiffs')} differences; committed rows without a counterpart: ${sum('missing')}.`,
      ...parts.flatMap((p) => p.examples).slice(0, 10),
    ];
    writeFileSync(`${DIR}/repro2r.txt`, `${text.join('\n')}\n`);
    expect(sum('rows')).toBe(committedRows.length);
    expect(sum('daily')).toBe(committedDaily.length);
    expect(sum('diffs') + sum('dailyDiffs') + sum('missing')).toBe(0);
    return;
  }
  const sub = Number(process.env.REPRO_SUB ?? '0');
  const job = jobFor2r('c1v1x2');
  const sample = dailySample2r(job);
  const out = emptyShard2r();
  let k = 0;
  for (let i = SHARD; i < job.count; i += SHARDS) {
    if (k++ % subs === sub) runUser2r(job, i, sample, out);
  }
  const refRows = new Map(committedRows.map((r) => [rowKey(r), r]));
  const refDaily = new Map(committedDaily.map((r) => [dayKey(r), r]));
  const part: Part = { users: out.users, rows: out.rows.length, daily: out.daily.length, values: 0, diffs: 0, dailyValues: 0, dailyDiffs: 0, missing: 0, examples: [] };
  const compare = (mine: Record<string, CsvValue>, ref: Record<string, string> | undefined, daily: boolean) => {
    if (!ref) {
      part.missing++;
      return;
    }
    for (const [key, v] of Object.entries(ref)) {
      if (daily) part.dailyValues++;
      else part.values++;
      if (asCsv(mine[key]) !== v) {
        if (daily) part.dailyDiffs++;
        else part.diffs++;
        if (part.examples.length < 5) part.examples.push(`${daily ? dayKey(mine) : rowKey(mine)}:${key}: ${asCsv(mine[key])} vs ${v}`);
      }
    }
  };
  for (const r of out.rows) compare(r, refRows.get(rowKey(r)), false);
  for (const r of out.daily) compare(r, refDaily.get(dayKey(r)), true);
  writeFileSync(`${DIR}/repro2r-part${sub}.json`, `${JSON.stringify(part)}\n`);
});
