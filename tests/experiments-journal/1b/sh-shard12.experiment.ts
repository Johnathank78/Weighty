/** Journal battery phase 1b, short-horizon bias of the current path (s5), shard 12 of 16. Run: npx vitest run -c vitest.journal.config.ts 1b/sh-shard */
import { it } from 'vitest';
import { runShShard, writeTiming1b } from '../measures1b';

it('sh shard 12', () => {
  const t0 = Date.now();
  runShShard(12, 16);
  writeTiming1b('sh-shard12', t0);
});
