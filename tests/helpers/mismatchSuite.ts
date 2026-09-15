/**
 * Shared suite of the model-mismatch calibration benchmark (IMPLEMENTATION_NOTES T-04). Metrics are part of the test
 * names so they appear in the report. Criteria are Wheighty v1 criteria evaluated against the apparent maintenance
 * offset (D-31); unmet ones are documented, never hidden by tuning priors.
 */
import { describe, expect, it } from 'vitest';
import { formatMetrics } from './mismatchWorld';
import { DOCUMENTED_OUTCOME, criteriaOutcome, runMismatchScenario } from './mismatchBenchmark';
import type { MismatchHorizon, ScenarioKey } from './mismatchBenchmark';

export function describeMismatchScenarios(keys: readonly ScenarioKey[], days: MismatchHorizon, seedBase: number): void {
  describe(`calibration with model mismatch at ${days} days (${keys.join(', ')})`, () => {
    for (const [index, key] of keys.entries()) {
      const r = runMismatchScenario(key, seedBase + index * 1000, days);
      const outcome = criteriaOutcome(r.vsApparent);
      const status = Object.entries(outcome)
        .map(([k, ok]) => `${k} ${ok ? 'met' : 'NOT MET'}`)
        .join(', ');
      describe(r.label, () => {
        it(`vs apparent-maintenance truth: ${formatMetrics(r.vsApparent)} [${status}]`, () => {
          expect(outcome).toEqual(DOCUMENTED_OUTCOME[days][key]);
        });
        it(`(reported only) vs window-mean metabolic offset: ${formatMetrics(r.vsWindowMean)}`, () => {
          expect(r.vsWindowMean.n).toBe(42);
        });
        it(`(reported only) vs end-of-window metabolic offset: ${formatMetrics(r.vsEndOfWindow)}`, () => {
          expect(r.vsEndOfWindow.n).toBe(42);
        });
      });
    }
  });
}
