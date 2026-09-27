/**
 * Iteration 2d (prompt 41): one shard of one closed-loop job. Run through tests/experiments-journal/it2d/launch.sh:
 * IT2D_JOB=<job> IT2D_SHARD=<k> IT2D_SHARDS=<n> npx vitest run -c vitest.journal.config.ts it2d/run
 * IT2D_OUT (optional): output directory instead of results/it2d/<job dir> (pilot and debugging outputs, deleted).
 * The continuous control of s5.4 is checked on every user: any difference fails the shard (after the raw files are written).
 */
import { expect, it } from 'vitest';
import { dailySample2d, emptyShard2d, jobFor2d, runUser2d, writeShard2d } from './jobs2d';

it('iteration 2d shard', () => {
  const job = jobFor2d(process.env.IT2D_JOB ?? '');
  const shard = Number(process.env.IT2D_SHARD ?? '0');
  const shards = Number(process.env.IT2D_SHARDS ?? '1');
  const sample = dailySample2d(job);
  const t0 = performance.now();
  const out = emptyShard2d();
  for (let i = shard; i < job.count; i += shards) runUser2d(job, i, sample, out);
  writeShard2d(job, shard, out, performance.now() - t0, process.env.IT2D_OUT);
  expect(out.contMismatches).toEqual([]);
});
