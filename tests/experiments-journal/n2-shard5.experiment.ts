/** Journal battery N2, shard 5 of 16. Run: npx vitest run -c vitest.journal.config.ts n2-shard */
import { it } from 'vitest';
import { runN2Shard, runN2Stress, writeTiming } from './measures';

it('N2 shard 5', () => {
  const t0 = Date.now();
  runN2Shard(5, 16);
  runN2Stress(5, 16);
  writeTiming('n2-shard5', t0);
});
