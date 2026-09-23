/** Journal battery N4, shard 9 of 16. Run: npx vitest run -c vitest.journal.config.ts n4-shard */
import { it } from 'vitest';
import { runN4Shard, writeTiming } from './measures';

it('N4 shard 9', () => {
  const t0 = Date.now();
  runN4Shard(9, 16);
  writeTiming('n4-shard9', t0);
});
