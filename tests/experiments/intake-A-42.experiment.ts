/** Intake logging benchmark (handoff prompt 26), scenario A at 42 days. Run with vitest.experiments.config.ts. */
import { expect, it } from 'vitest';
import { REPLICATES, runExperiment } from '../helpers/intakeLoggingExperiment';

it('intake logging experiment A at 42 days', () => {
  const summary = runExperiment('A', 42);
  expect(summary.results.metabolic.A?.metrics.n).toBe(REPLICATES * 42);
});
