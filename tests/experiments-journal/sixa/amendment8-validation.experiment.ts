/**
 * Amendment 8, validation (report 49, point 7): 9 cells x 100 repetitions on the validation seeds, the variant retained on
 * the training seeds (results/6a/selection.json, written by tables8.mjs), today's code ('sans') and the reference without a
 * pause. One JSON line per user in tests/experiments-journal/results/6a/validation.jsonl (ignored).
 * Verdict: node tests/experiments-journal/sixa/tables8.mjs validation
 * Run: npx vitest run -c vitest.journal.config.ts sixa/amendment8-validation
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { CELLS, runUser, VALIDATION_SEED } from './amendment8';

const OUT = 'tests/experiments-journal/results/6a';
const REPS = Number(process.env.A8_VALIDATION_REPS ?? 100);

it(`validation: 9 cells x ${REPS} repetitions, the retained variant, today's code and the reference`, () => {
  const selection = JSON.parse(readFileSync(`${OUT}/selection.json`, 'utf8')) as { retained: 'A' | 'B' };
  if (selection.retained !== 'A' && selection.retained !== 'B') throw new Error('no variant retained');
  mkdirSync(OUT, { recursive: true });
  const file = `${OUT}/validation${REPS === 100 ? '' : `-${REPS}`}.jsonl`;
  writeFileSync(file, '');
  for (const cell of CELLS) for (let rep = 0; rep < REPS; rep++) appendFileSync(file, `${JSON.stringify(runUser('validation', cell, rep, VALIDATION_SEED(cell.index, rep), [selection.retained, 'sans'], true))}\n`);
});
