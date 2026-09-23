/** Journal battery N2, shard 1 of 16. Run: npx vitest run -c vitest.journal.config.ts n2-shard */
import { it } from 'vitest';
import { runN2Shard, runN2Stress, writeTiming } from './measures';

it('N2 shard 1', () => {
  const t0 = Date.now();
  runN2Shard(1, 16);
  runN2Stress(1, 16);
  writeTiming('n2-shard1', t0);
});
