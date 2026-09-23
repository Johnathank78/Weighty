/** Journal battery N3, shard 13 of 16. Run: npx vitest run -c vitest.journal.config.ts n3-shard */
import { it } from 'vitest';
import { runN3Shard, writeTiming } from './measures';

it('N3 shard 13', () => {
  const t0 = Date.now();
  runN3Shard(13, 16);
  writeTiming('n3-shard13', t0);
});
