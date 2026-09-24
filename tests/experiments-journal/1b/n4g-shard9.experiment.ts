/** Journal battery phase 1b, N4 replayed with three priors x three grids (s4.2), shard 9 of 16. Run: npx vitest run -c vitest.journal.config.ts 1b/n4g-shard */
import { it } from 'vitest';
import { runN4gShard, writeTiming1b } from '../measures1b';

it('n4g shard 9', () => {
  const t0 = Date.now();
  runN4gShard(9, 16);
  writeTiming1b('n4g-shard9', t0);
});
