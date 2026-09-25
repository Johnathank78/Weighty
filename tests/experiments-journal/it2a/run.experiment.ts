/**
 * Iteration 2a (prompt 37): one shard of one closed-loop job. Run through tests/experiments-journal/it2a/launch.sh:
 * IT2A_JOB=<job> IT2A_SHARD=<k> IT2A_SHARDS=<n> npx vitest run -c vitest.journal.config.ts it2a/run
 */
import { it } from 'vitest';
import { jobFor2a, runUser2a, writeShard2a } from './jobs2a';
import type { ShardOutput2a } from './jobs2a';

it('iteration 2a shard', () => {
  const job = jobFor2a(process.env.IT2A_JOB ?? '');
  const shard = Number(process.env.IT2A_SHARD ?? '0');
  const shards = Number(process.env.IT2A_SHARDS ?? '1');
  const limit = Number(process.env.IT2A_LIMIT ?? String(job.count));
  const t0 = performance.now();
  const out: ShardOutput2a = { rows: [], daily: [], users: 0, ms: [] };
  for (let i = shard; i < Math.min(job.count, limit); i += shards) runUser2a(job, i, out);
  writeShard2a(job, shard, out, performance.now() - t0);
});
