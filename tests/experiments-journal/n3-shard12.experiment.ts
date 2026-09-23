/** Journal battery N3, shard 12 of 16. Run: npx vitest run -c vitest.journal.config.ts n3-shard */
import { it } from 'vitest';
import { runN3Shard, writeTiming } from './measures';

it('N3 shard 12', () => {
  const t0 = Date.now();
  runN3Shard(12, 16);
  writeTiming('n3-shard12', t0);
});
