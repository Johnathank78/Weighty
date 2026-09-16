/** Joint bias benchmark (handoff prompt 27), shard 14 of 16. Run with vitest.joint.config.ts. */
import { expect, it } from 'vitest';
import { runShard } from '../helpers/jointBiasExperiment';

it('joint bias experiment shard 14', () => {
  expect(runShard(14, 16)).toBeGreaterThan(0);
});
