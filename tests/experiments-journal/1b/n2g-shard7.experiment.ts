/** Journal battery phase 1b, N2 replayed with three grids (s4.1), shard 7 of 16. Run: npx vitest run -c vitest.journal.config.ts 1b/n2g-shard */
import { it } from 'vitest';
import { runN2gShard, runN2gStress, writeTiming1b } from '../measures1b';

it('N2g shard 7', () => {
  const t0 = Date.now();
  runN2gShard(7, 16);
  runN2gStress(7, 16);
  writeTiming1b('n2g-shard7', t0);
});
