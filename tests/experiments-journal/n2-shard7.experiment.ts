/** Journal battery N2, shard 7 of 16. Run: npx vitest run -c vitest.journal.config.ts n2-shard */
import { it } from 'vitest';
import { runN2Shard, runN2Stress, writeTiming } from './measures';

it('N2 shard 7', () => {
  const t0 = Date.now();
  runN2Shard(7, 16);
  runN2Stress(7, 16);
  writeTiming('n2-shard7', t0);
});
