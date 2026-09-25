/**
 * Iteration 2b (prompt 38): one shard of one closed-loop job. Run through tests/experiments-journal/it2b/launch.sh:
 * IT2B_JOB=<job> IT2B_SHARD=<k> IT2B_SHARDS=<n> [IT2B_CANDIDATE=K1|K2] npx vitest run -c vitest.journal.config.ts it2b/run
 */
import { it } from 'vitest';
import { jobFor2b, runUser2b, writeShard2b } from './jobs2b';
import type { ShardOutput2b } from './jobs2b';

it('iteration 2b shard', () => {
  const job = jobFor2b(process.env.IT2B_JOB ?? '');
  const shard = Number(process.env.IT2B_SHARD ?? '0');
  const shards = Number(process.env.IT2B_SHARDS ?? '1');
  const limit = Number(process.env.IT2B_LIMIT ?? String(job.count));
  const t0 = performance.now();
  const out: ShardOutput2b = { rows: [], daily: [], users: 0, ms: [] };
  for (let i = shard; i < Math.min(job.count, limit); i += shards) runUser2b(job, i, out);
  writeShard2b(job, shard, out, performance.now() - t0);
});
