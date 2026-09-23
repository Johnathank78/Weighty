/** Journal battery N2, shard 14 of 16. Run: npx vitest run -c vitest.journal.config.ts n2-shard */
import { it } from 'vitest';
import { runN2Shard, runN2Stress, writeTiming } from './measures';

it('N2 shard 14', () => {
  const t0 = Date.now();
  runN2Shard(14, 16);
  runN2Stress(14, 16);
  writeTiming('n2-shard14', t0);
});
