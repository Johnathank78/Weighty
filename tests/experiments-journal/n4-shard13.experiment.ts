/** Journal battery N4, shard 13 of 16. Run: npx vitest run -c vitest.journal.config.ts n4-shard */
import { it } from 'vitest';
import { runN4Shard, writeTiming } from './measures';

it('N4 shard 13', () => {
  const t0 = Date.now();
  runN4Shard(13, 16);
  writeTiming('n4-shard13', t0);
});
