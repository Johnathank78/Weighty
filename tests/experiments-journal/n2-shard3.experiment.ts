/** Journal battery N2, shard 3 of 16. Run: npx vitest run -c vitest.journal.config.ts n2-shard */
import { it } from 'vitest';
import { runN2Shard, runN2Stress, writeTiming } from './measures';

it('N2 shard 3', () => {
  const t0 = Date.now();
  runN2Shard(3, 16);
  runN2Stress(3, 16);
  writeTiming('n2-shard3', t0);
});
