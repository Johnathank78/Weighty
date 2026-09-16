/**
 * Measurement-only experiment of handoff prompt 27 (joint offset and logging bias), excluded from `npm test`.
 * Run: npx vitest run -c vitest.joint.config.ts
 * Each shard writes reports/joint-bias/cells/<cell>.json; the global teardown builds reports/joint-bias/tables.md.
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/experiments-joint/**/*.experiment.ts'],
    globalSetup: ['tests/experiments-joint/buildJointTables.ts'],
    testTimeout: 36_000_000,
    hookTimeout: 36_000_000,
    pool: 'threads',
    maxWorkers: 16,
  },
});
