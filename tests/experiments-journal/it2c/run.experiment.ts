/**
 * Iteration 2c (prompt 39): one shard of one closed-loop job. Run through tests/experiments-journal/it2c/launch.sh:
 * IT2C_JOB=<job> IT2C_SHARD=<k> IT2C_SHARDS=<n> npx vitest run -c vitest.journal.config.ts it2c/run
 */
import { it } from 'vitest';
import { dailySample, jobFor2c, runUser2c, writeShard2c } from './jobs2c';
import type { ShardOutput2c } from './jobs2c';

it('iteration 2c shard', () => {
  const job = jobFor2c(process.env.IT2C_JOB ?? '');
  const shard = Number(process.env.IT2C_SHARD ?? '0');
  const shards = Number(process.env.IT2C_SHARDS ?? '1');
  const sample = dailySample(job);
  const t0 = performance.now();
  const out: ShardOutput2c = { rows: [], daily: [], users: 0, ms: [] };
  for (let i = shard; i < job.count; i += shards) runUser2c(job, i, sample, out);
  writeShard2c(job, shard, out, performance.now() - t0);
});
