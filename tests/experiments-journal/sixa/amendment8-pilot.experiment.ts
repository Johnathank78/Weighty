/**
 * Amendment 8, pilot (report 49, point 7): one cell (G = 22 days, intake of the pause = the true maintenance), 10 repetitions, every
 * estimator and the reference, on training seeds. Its only use is the cost projection of the amendment ("Coût").
 * Run: npx vitest run -c vitest.journal.config.ts sixa/amendment8-pilot
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { CELLS, runUser, TRAINING_SEED } from './amendment8';

const OUT = 'tests/experiments-journal/results/6a';

it('pilot: cell 4 (22 days, maintenance), 10 repetitions', () => {
  mkdirSync(OUT, { recursive: true });
  const file = `${OUT}/pilot.jsonl`;
  writeFileSync(file, '');
  const cell = CELLS[4];
  if (!cell || cell.gap !== 22 || cell.intake !== 'maintenance') throw new Error(`cell ${JSON.stringify(cell)}`);
  for (let rep = 0; rep < 10; rep++) appendFileSync(file, `${JSON.stringify(runUser('pilot', cell, rep, TRAINING_SEED(cell.index, rep), ['sans', 'A', 'B'], true))}\n`);
});
