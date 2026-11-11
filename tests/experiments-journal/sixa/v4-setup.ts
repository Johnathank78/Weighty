/**
 * Amendment 8, V4 (report 49, point 7): the non-regression capture run with a variant of the reanchoring turned on
 * (A8_REANCHOR = 'A' or 'B'), through the domain (RULES_6A.reanchor) and on every direct call of fitCalibration (T-03, T-04).
 * Users without a pause must give the capture of the variant off, bit for bit.
 */
import { vi } from 'vitest';
import { RULES_6A } from '@/domain/ruleSwitches';
import type * as Calibration from '@/science/calibration';

const mode = process.env.A8_REANCHOR;
if (mode !== 'A' && mode !== 'B') throw new Error('A8_REANCHOR must be A or B');
RULES_6A.reanchor = mode;

vi.mock('@/science/calibration', async (importOriginal) => {
  const m = await importOriginal<typeof Calibration>();
  return { ...m, fitCalibration: (input: Parameters<typeof m.fitCalibration>[0]) => m.fitCalibration({ ...input, reanchorAfterPause: mode }) };
});
