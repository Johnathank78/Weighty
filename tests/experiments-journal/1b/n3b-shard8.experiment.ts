/** Journal battery phase 1b, over-confidence of the prototype (s6), shard 8 of 16. Run: npx vitest run -c vitest.journal.config.ts 1b/n3b-shard */
import { it } from 'vitest';
import { runN3bShard, writeTiming1b } from '../measures1b';

it('n3b shard 8', () => {
  const t0 = Date.now();
  runN3bShard(8, 16);
  writeTiming1b('n3b-shard8', t0);
});
