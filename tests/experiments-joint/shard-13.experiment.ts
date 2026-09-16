/** Joint bias benchmark (handoff prompt 27), shard 13 of 16. Run with vitest.joint.config.ts. */
import { expect, it } from 'vitest';
import { runShard } from '../helpers/jointBiasExperiment';

it('joint bias experiment shard 13', () => {
  expect(runShard(13, 16)).toBeGreaterThan(0);
});
