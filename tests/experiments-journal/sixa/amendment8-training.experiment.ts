/**
 * Amendment 8, training (report 49, point 7): 9 cells x 50 repetitions on the training seeds, variants A and B on the same
 * simulated users. One JSON line per user in tests/experiments-journal/results/6a/training.jsonl (ignored).
 * Selection: node tests/experiments-journal/sixa/tables8.mjs training
 * Run: npx vitest run -c vitest.journal.config.ts sixa/amendment8-training
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { CELLS, runUser, TRAINING_SEED } from './amendment8';

const OUT = 'tests/experiments-journal/results/6a';
const REPS = Number(process.env.A8_TRAINING_REPS ?? 50);

it(`training: 9 cells x ${REPS} repetitions, A and B`, () => {
  mkdirSync(OUT, { recursive: true });
  const file = `${OUT}/training.jsonl`;
  writeFileSync(file, '');
  for (const cell of CELLS) for (let rep = 0; rep < REPS; rep++) appendFileSync(file, `${JSON.stringify(runUser('training', cell, rep, TRAINING_SEED(cell.index, rep), ['A', 'B'], false))}\n`);
});
