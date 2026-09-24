/** Journal battery phase 1b, timing of one journal-regime calibration call per grid (s4.3). Run alone: npx vitest run -c vitest.journal.config.ts 1b/timing */
import { it } from 'vitest';
import { runTiming, writeTiming1b } from '../measures1b';

it('timing of the journal-regime call', () => {
  const t0 = Date.now();
  runTiming();
  writeTiming1b('timing-run', t0);
});
