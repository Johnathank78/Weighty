/** Journal battery phase 1b, over-confidence of the prototype (s6), shard 6 of 16. Run: npx vitest run -c vitest.journal.config.ts 1b/n3b-shard */
import { it } from 'vitest';
import { runN3bShard, writeTiming1b } from '../measures1b';

it('n3b shard 6', () => {
  const t0 = Date.now();
  runN3bShard(6, 16);
  writeTiming1b('n3b-shard6', t0);
});
