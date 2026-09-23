/** Journal battery N2, shard 11 of 16. Run: npx vitest run -c vitest.journal.config.ts n2-shard */
import { it } from 'vitest';
import { runN2Shard, runN2Stress, writeTiming } from './measures';

it('N2 shard 11', () => {
  const t0 = Date.now();
  runN2Shard(11, 16);
  runN2Stress(11, 16);
  writeTiming('n2-shard11', t0);
});
