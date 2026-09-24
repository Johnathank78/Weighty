/** Journal battery phase 1b, N2 replayed with three grids (s4.1), shard 12 of 16. Run: npx vitest run -c vitest.journal.config.ts 1b/n2g-shard */
import { it } from 'vitest';
import { runN2gShard, runN2gStress, writeTiming1b } from '../measures1b';

it('N2g shard 12', () => {
  const t0 = Date.now();
  runN2gShard(12, 16);
  runN2gStress(12, 16);
  writeTiming1b('n2g-shard12', t0);
});
