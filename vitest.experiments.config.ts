/**
 * Measurement-only experiments, excluded from `npm test` (handoff prompt 26, intake logging benchmark).
 * Run: npx vitest run -c vitest.experiments.config.ts
 * Each cell writes reports/intake-logging/<scenario>-<days>.json; the global teardown builds the tables.
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
    include: ['tests/experiments/**/*.experiment.ts'],
    globalSetup: ['tests/experiments/buildTables.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 3_600_000,
    pool: 'threads',
    maxWorkers: 16,
  },
});
