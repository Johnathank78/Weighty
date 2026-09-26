/**
 * Relaunch of iteration 2 (prompt 40 s4.5): the simulator of this iteration, in the configuration of 2c (2c job code, arms
 * S0, K2, S0 + G, K2 + G), reproduces the committed raw rows of shard 3 of real2c (report 39). Every committed column of
 * the per-user rows and of the daily rows is compared, rows matched by user, arm (and day).
 * Run in sub-shards (the users of the shard, i mod 16 = 3, split k mod SUBS = SUB):
 *   REPRO_SUB=<k> REPRO_SUBS=<n> npx vitest run -c vitest.journal.config.ts it2r/repro2c   (writes a part)
 *   REPRO_SUMMARY=1 REPRO_SUBS=<n> npx vitest run -c vitest.journal.config.ts it2r/repro2c (writes results/it2r/controls/repro2c.txt)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { readCsvGz } from '../../helpers/journalExport';
import type { CsvValue } from '../../helpers/journalExport';
import { RESULTS } from '../it2/jobs';
import { dailySample, jobFor2c, runUser2c } from '../it2c/jobs2c';
import type { ShardOutput2c } from '../it2c/jobs2c';
import { IT2R_DIR } from './jobs2r';

const SHARD = 3;
const SHARDS = 16;
const DIR = `${IT2R_DIR}/controls`;
const asCsv = (v: CsvValue) => (v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
const rowKey = (r: Record<string, CsvValue>) => `${asCsv(r.job_index)}:${asCsv(r.solver_arm)}`;
const dayKey = (r: Record<string, CsvValue>) => `${rowKey(r)}:${asCsv(r.day)}`;

type Part = { users: number; rows: number; daily: number; values: number; diffs: number; dailyValues: number; dailyDiffs: number; missing: number; examples: string[] };

it('real2c shard reproduced by the simulator of the relaunch (2c configuration)', () => {
  const subs = Number(process.env.REPRO_SUBS ?? '1');
  const committedRows = readCsvGz(`${RESULTS}/guardrails2c/real2c-shard${SHARD}.csv.gz`);
  const committedDaily = readCsvGz(`${RESULTS}/guardrails2c/real2c-daily-shard${SHARD}.csv.gz`);
  mkdirSync(DIR, { recursive: true });
  if (process.env.REPRO_SUMMARY) {
    const parts: Part[] = Array.from({ length: subs }, (_, k) => JSON.parse(readFileSync(`${DIR}/repro2c-part${k}.json`, 'utf8')) as Part);
    const sum = (f: keyof Omit<Part, 'examples'>) => parts.reduce((s, p) => s + p[f], 0);
    const text = [
      `Relaunch of iteration 2 (prompt 40 s4.5): real2c shard ${SHARD} (report 39) replayed with the simulator of this iteration in the 2c configuration (jobs2c.ts, arms S0, K2, S0 + G, K2 + G), ${subs} sub-shards.`,
      `Users: ${sum('users')}. Per-user rows: ${sum('rows')} produced, ${committedRows.length} committed; ${sum('values')} values compared, ${sum('diffs')} differences.`,
      `Daily rows: ${sum('daily')} produced, ${committedDaily.length} committed; ${sum('dailyValues')} values compared, ${sum('dailyDiffs')} differences; committed rows without a counterpart: ${sum('missing')}.`,
      ...parts.flatMap((p) => p.examples).slice(0, 10),
    ];
    writeFileSync(`${DIR}/repro2c.txt`, `${text.join('\n')}\n`);
    expect(sum('rows')).toBe(committedRows.length);
    expect(sum('daily')).toBe(committedDaily.length);
    expect(sum('diffs') + sum('dailyDiffs') + sum('missing')).toBe(0);
    return;
  }
  const sub = Number(process.env.REPRO_SUB ?? '0');
  const job = jobFor2c('real2c');
  const sample = dailySample(job);
  const out: ShardOutput2c = { rows: [], daily: [], users: 0, ms: [] };
  let k = 0;
  for (let i = SHARD; i < job.count; i += SHARDS) {
    if (k++ % subs === sub) runUser2c(job, i, sample, out);
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
  writeFileSync(`${DIR}/repro2c-part${sub}.json`, `${JSON.stringify(part)}\n`);
});
