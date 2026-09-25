/**
 * Iteration 2b (prompt 38): the modified simulator reproduces the committed iteration 2a raw rows. Users of shard 0 of the
 * ideal2a job (i mod 16 = 0, 32 users), every 2a arm, replayed with the 2b code; every committed column is compared.
 * Run: npx vitest run -c vitest.journal.config.ts it2b/repro2a. Writes results/solver2b/repro2a.txt.
 */
import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { readCsvGz } from '../../helpers/journalExport';
import { RESULTS } from '../it2/jobs';
import { jobFor2a, runUser2a } from '../it2a/jobs2a';
import type { ShardOutput2a } from '../it2a/jobs2a';

it('iteration 2a rows reproduced by the 2b simulator', () => {
  const committed = readCsvGz(`${RESULTS}/solver/ideal2a-shard0.csv.gz`);
  const job = jobFor2a('ideal2a');
  const out: ShardOutput2a = { rows: [], daily: [], users: 0, ms: [] };
  for (let i = 0; i < job.count; i += 16) runUser2a(job, i, out);
  let values = 0;
  let diffs = 0;
  out.rows.forEach((row, k) => {
    const ref = committed[k] as Record<string, string>;
    for (const [key, v] of Object.entries(ref)) {
      values++;
      const mine = row[key];
      const s = mine === null || mine === undefined ? '' : typeof mine === 'boolean' ? (mine ? '1' : '0') : String(mine);
      if (s !== v) diffs++;
    }
  });
  const text = `Iteration 2a raw rows (ideal2a shard 0: ${out.rows.length} user x arm rows, committed ${committed.length}) replayed with the 2b simulator: ${values} values compared, ${diffs} differences.\n`;
  writeFileSync(`${RESULTS}/solver2b/repro2a.txt`, text);
  expect(out.rows.length).toBe(committed.length);
  expect(diffs).toBe(0);
});
