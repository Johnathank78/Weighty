/** Journal battery N1 (path equivalence). Run: npx vitest run -c vitest.journal.config.ts n1 */
import { it } from 'vitest';
import { runN1, writeTiming } from './measures';

it('N1', () => {
  const t0 = Date.now();
  runN1();
  writeTiming('n1', t0);
});
