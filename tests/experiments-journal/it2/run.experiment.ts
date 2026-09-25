/**
 * Journal battery, iteration 2 (prompt 36): one shard of one job. Run through tests/experiments-journal/it2/launch.sh:
 * IT2_JOB=<job> IT2_SHARD=<k> IT2_SHARDS=<n> IT2_X=<density X> npx vitest run -c vitest.journal.config.ts it2/run
 */
import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { RESULTS, jobFor, pairingCheck, runUser, writeShard } from './jobs';
import type { ShardOutput } from './jobs';

it('iteration 2 shard', () => {
  const name = process.env.IT2_JOB ?? '';
  const shard = Number(process.env.IT2_SHARD ?? '0');
  const shards = Number(process.env.IT2_SHARDS ?? '1');
  const x = Number(process.env.IT2_X ?? 'NaN');
  const job = jobFor(name, x);
  const t0 = performance.now();
  if (name === 'pairing') {
    const mismatches: string[] = [];
    let users = 0;
    let proposals = 0;
    let arms = 0;
    for (let i = shard; i < job.count; i += shards) {
      const r = pairingCheck(job, i);
      users += r.users;
      if (r.proposal) proposals++;
      arms += r.arms;
      mismatches.push(...r.mismatches);
    }
    mkdirSync(`${RESULTS}/${job.dir}`, { recursive: true });
    writeFileSync(`${RESULTS}/${job.dir}/pairing-shard${shard}.json`, `${JSON.stringify({ shard, users, proposals, arms, mismatches, wallMs: performance.now() - t0 }, null, 2)}\n`);
    return;
  }
  const out: ShardOutput = { rows: [], daily: [], users: 0, proposals: 0, ms: [] };
  for (let i = shard; i < job.count; i += shards) runUser(job, i, out);
  writeShard(job, shard, out, performance.now() - t0);
});
