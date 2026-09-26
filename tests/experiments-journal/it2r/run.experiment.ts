/**
 * Relaunch of iteration 2 (prompt 40): one shard of one closed-loop job. Run through tests/experiments-journal/it2r/launch.sh:
 * IT2R_JOB=<job> IT2R_SHARD=<k> IT2R_SHARDS=<n> [IT2R_X=<x>] npx vitest run -c vitest.journal.config.ts it2r/run
 * IT2R_OUT (optional): output directory instead of results/it2r/<job dir> (pilot and debugging outputs, deleted).
 */
import { it } from 'vitest';
import { dailySample2r, emptyShard2r, jobFor2r, runUser2r, writeShard2r } from './jobs2r';

it('iteration 2 relaunch shard', () => {
  const job = jobFor2r(process.env.IT2R_JOB ?? '');
  const shard = Number(process.env.IT2R_SHARD ?? '0');
  const shards = Number(process.env.IT2R_SHARDS ?? '1');
  const sample = dailySample2r(job);
  const t0 = performance.now();
  const out = emptyShard2r();
  for (let i = shard; i < job.count; i += shards) runUser2r(job, i, sample, out);
  writeShard2r(job, shard, out, performance.now() - t0, process.env.IT2R_OUT);
});
