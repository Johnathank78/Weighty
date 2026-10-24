/**
 * UX pass 2, point 2e: writes the fixture of the personal targets at the steps of the profile (tests/helpers/
 * personalTargetFixture.ts) as the code it runs on computes it. Produced on the base 1209d49, its source extracted apart
 * and `@` pointed at it: PT_OUT=<file> npx vitest run -c <config with @ -> base src> personalTargetBase.
 */
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { personalTargetFixture } from '../../helpers/personalTargetFixture';

// Only on demand: the non-regression capture (filter "capture") runs this folder without PT_OUT.
const file = process.env.PT_OUT;
it.runIf(file !== undefined)('personal target fixture', () => {
  writeFileSync(file as string,`${JSON.stringify(personalTargetFixture())}\n`);
});
