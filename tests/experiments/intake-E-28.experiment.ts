/** Intake logging benchmark (handoff prompt 26), scenario E at 28 days. Run with vitest.experiments.config.ts. */
import { expect, it } from 'vitest';
import { REPLICATES, runExperiment } from '../helpers/intakeLoggingExperiment';

it('intake logging experiment E at 28 days', () => {
  const summary = runExperiment('E', 28);
  expect(summary.results.metabolic.A?.metrics.n).toBe(REPLICATES * 42);
});
