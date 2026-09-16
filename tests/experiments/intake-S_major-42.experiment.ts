/** Intake logging benchmark (handoff prompt 26), scenario S_major at 42 days. Run with vitest.experiments.config.ts. */
import { expect, it } from 'vitest';
import { REPLICATES, runExperiment } from '../helpers/intakeLoggingExperiment';

it('intake logging experiment S_major at 42 days', () => {
  const summary = runExperiment('S_major', 42);
  expect(summary.results.metabolic.A?.metrics.n).toBe(REPLICATES * 42);
});
