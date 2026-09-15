/**
 * Ideal-world calibration recovery at 84 and 120 days (IMPLEMENTATION_NOTES T-03, D-33, release blocking).
 * Before the structural uncertainty floor, intervals kept shrinking while the model error did not.
 */
import { describe, expect, it } from 'vitest';
import { IDEAL_RECOVERY_USERS, runIdealRecovery } from '../helpers/idealRecovery';
import { formatMetrics, recoveryMetrics } from '../helpers/mismatchWorld';

describe('calibration simulation recovery at 84 and 120 days (release blocking)', () => {
  const r = runIdealRecovery([84, 120]);
  for (const h of [84, 120]) {
    const m = recoveryMetrics(r.rows[h] ?? []);
    it(`${h} days vs apparent maintenance: MAE <= 125, coverage 80 >= 0.70, coverage 95 >= 0.90 (${formatMetrics(m)})`, () => {
      expect(m.n).toBe(IDEAL_RECOVERY_USERS);
      expect(m.medianAbsErrorKcal).toBeLessThanOrEqual(125);
      expect(m.coverage80).toBeGreaterThanOrEqual(0.7);
      expect(m.coverage95).toBeGreaterThanOrEqual(0.9);
    });
    it(`(reported only) ${h} days vs metabolic offset: ${formatMetrics(recoveryMetrics(r.metabolicRows[h] ?? []))}`, () => {
      expect(r.metabolicRows[h]?.length).toBe(IDEAL_RECOVERY_USERS);
    });
  }
});
