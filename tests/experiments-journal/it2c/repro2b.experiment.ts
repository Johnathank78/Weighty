/**
 * Iteration 2c (prompt 39 s3.5): the 2c simulator, guardrails absent, reproduces the committed iteration 2b raw rows. Users
 * of shard 14 of the real2b job (i mod 16 = 14: 125 followers and 31 regular non-followers, among them user 478), arms S0
 * and K2, replayed with the 2c code through the 2b job code; every committed column of the per-user rows and of the daily
 * rows is compared. Run: npx vitest run -c vitest.journal.config.ts it2c/repro2b. Writes results/guardrails2c/repro2b.txt.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { readCsvGz } from '../../helpers/journalExport';
import type { CsvValue } from '../../helpers/journalExport';
import { RESULTS } from '../it2/jobs';
import { jobFor2b, runUser2b } from '../it2b/jobs2b';
import type { ShardOutput2b } from '../it2b/jobs2b';

const SHARD = 14;
const SHARDS = 16;
const asCsv = (v: CsvValue) => (v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? '1' : '0') : String(v));

function compare(mine: ReadonlyArray<Record<string, CsvValue>>, committed: ReadonlyArray<Record<string, string>>): { values: number; diffs: number; examples: string[] } {
  let values = 0;
  let diffs = 0;
  const examples: string[] = [];
  committed.forEach((ref, k) => {
    const row = mine[k] ?? {};
    for (const [key, v] of Object.entries(ref)) {
      values++;
      if (asCsv(row[key]) !== v) {
        diffs++;
        if (examples.length < 5) examples.push(`${k}:${key}: ${asCsv(row[key])} vs ${v}`);
      }
    }
  });
  return { values, diffs, examples };
}

it('iteration 2b real2b rows reproduced by the 2c simulator (guardrails absent)', () => {
  process.env.IT2B_CANDIDATE = 'K2';
  const job = jobFor2b('real2b');
  const out: ShardOutput2b = { rows: [], daily: [], users: 0, ms: [] };
  for (let i = SHARD; i < job.count; i += SHARDS) runUser2b(job, i, out);
  const rows = compare(out.rows, readCsvGz(`${RESULTS}/solver2b/real2b-shard${SHARD}.csv.gz`));
  const daily = compare(out.daily, readCsvGz(`${RESULTS}/solver2b/real2b-daily-shard${SHARD}.csv.gz`));
  const committedRows = readCsvGz(`${RESULTS}/solver2b/real2b-shard${SHARD}.csv.gz`).length;
  const committedDaily = readCsvGz(`${RESULTS}/solver2b/real2b-daily-shard${SHARD}.csv.gz`).length;
  const text = [
    `Iteration 2b raw rows (real2b shard ${SHARD}: ${out.users} users, ${out.rows.length} user x arm rows, committed ${committedRows}) replayed with the 2c simulator, guardrails absent: ${rows.values} values compared, ${rows.diffs} differences.${rows.examples.length ? ` ${rows.examples.join('; ')}` : ''}`,
    `Daily rows (${out.daily.length}, committed ${committedDaily}): ${daily.values} values compared, ${daily.diffs} differences.${daily.examples.length ? ` ${daily.examples.join('; ')}` : ''}`,
  ];
  mkdirSync(`${RESULTS}/guardrails2c`, { recursive: true });
  writeFileSync(`${RESULTS}/guardrails2c/repro2b.txt`, `${text.join('\n')}\n`);
  expect(out.rows.length).toBe(committedRows);
  expect(out.daily.length).toBe(committedDaily);
  expect(rows.diffs + daily.diffs).toBe(0);
});
