/**
 * Amendment 8, V4 (report 49, point 7): the capture of tests/experiments-journal/capture/ with a variant on (v4-setup.ts).
 * Run: CAPTURE_OUT=<dir> A8_REANCHOR=A npx vitest run -c tests/experiments-journal/sixa/v4.config.ts
 * then: node tests/experiments-journal/capture/compare.mjs <capture of the same commit, variant off> <dir>
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('../../../src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/experiments-journal/capture/*.experiment.ts'],
    setupFiles: ['tests/experiments-journal/sixa/v4-setup.ts'],
    testTimeout: 36_000_000,
    pool: 'forks',
    maxWorkers: 4,
  },
});
