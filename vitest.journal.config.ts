/**
 * Journal battery, phase 1 (measurement only), excluded from `npm test`.
 * Run: npx vitest run -c vitest.journal.config.ts <filter>
 * Files: tests/experiments-journal/**\/*.experiment.ts. Outputs go to tests/experiments-journal/results/ (committed) or to
 * the path given by CAPTURE_OUT for the non-regression capture.
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
    include: ['tests/experiments-journal/**/*.experiment.ts'],
    testTimeout: 36_000_000,
    hookTimeout: 36_000_000,
    // Forks: the table reconstruction changes the working directory (not allowed in worker threads).
    pool: 'forks',
    maxWorkers: 16,
  },
});
