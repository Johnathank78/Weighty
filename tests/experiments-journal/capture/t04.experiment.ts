/**
 * Non-regression capture (prompt 34 s3.8), T-04: every fit of the mismatch benchmark, six scenarios, all seed families
 * (T-04 test parts 50k/60k at 42 days and 70k/80k at 84 days, plus the 30k/40k families of benchmark 26 at 28 days).
 */
import { expect, it } from 'vitest';
import { fitCalibration } from '@/science/calibration';
import { BASE, FREQUENCIES, OFFSETS, PROFILES, SCENARIOS } from '../../helpers/mismatchBenchmark';
import type { ScenarioKey } from '../../helpers/mismatchBenchmark';
import { simulateMismatchUser } from '../../helpers/mismatchWorld';
import { createRng } from '../../helpers/random';
import { writeCapture } from './serialize';

const FAMILIES: Array<{ days: number; keys: ScenarioKey[]; seedBase: number }> = [
  { days: 42, keys: ['A', 'B', 'C'], seedBase: 50_000 },
  { days: 42, keys: ['D', 'E', 'F'], seedBase: 60_000 },
  { days: 84, keys: ['A', 'B', 'C'], seedBase: 70_000 },
  { days: 84, keys: ['D', 'E', 'F'], seedBase: 80_000 },
  { days: 28, keys: ['A', 'B', 'C'], seedBase: 30_000 },
  { days: 28, keys: ['D', 'E', 'F'], seedBase: 40_000 },
];

it('captures T-04', () => {
  const out: unknown[] = [];
  for (const family of FAMILIES) {
    for (const [index, key] of family.keys.entries()) {
      const seedBase = family.seedBase + index * 1000;
      let i = 0;
      for (const trueOffsetKcal of OFFSETS) {
        for (const weighEveryDays of FREQUENCIES) {
          for (const profile of PROFILES) {
            const run = simulateMismatchUser(profile, { ...BASE, days: family.days, trueOffsetKcal, weighEveryDays, ...SCENARIOS[key].settings(i) }, createRng(seedBase + i));
            out.push({ key, days: family.days, seed: seedBase + i, fit: fitCalibration(run.calibrationInputFor(family.days)), apparent: run.apparentOffsetKcal(family.days) });
            i++;
          }
        }
      }
    }
  }
  writeCapture('t04', out);
  expect(out).toHaveLength(6 * 3 * 42);
});
