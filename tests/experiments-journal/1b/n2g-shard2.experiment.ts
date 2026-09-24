/** Journal battery phase 1b, N2 replayed with three grids (s4.1), shard 2 of 16. Run: npx vitest run -c vitest.journal.config.ts 1b/n2g-shard */
import { it } from 'vitest';
import { runN2gShard, runN2gStress, writeTiming1b } from '../measures1b';

it('N2g shard 2', () => {
  const t0 = Date.now();
  runN2gShard(2, 16);
  runN2gStress(2, 16);
  writeTiming1b('n2g-shard2', t0);
});
