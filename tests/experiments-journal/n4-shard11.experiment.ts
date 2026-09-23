/** Journal battery N4, shard 11 of 16. Run: npx vitest run -c vitest.journal.config.ts n4-shard */
import { it } from 'vitest';
import { runN4Shard, writeTiming } from './measures';

it('N4 shard 11', () => {
  const t0 = Date.now();
  runN4Shard(11, 16);
  writeTiming('n4-shard11', t0);
});
