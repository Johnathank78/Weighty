/**
 * Joint bias benchmark (handoff prompt 27), axis 1 attribution probe: is the narrowing of the k posterior produced by
 * the weigh-ins, or by the population prior on the offset? Same estimator, 12 users per condition, offset prior either
 * the population prior or flat (sigma 1e7 kcal/day). Writes reports/joint-bias/flat-offset-prior.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { BASE, PROFILES } from '../helpers/mismatchBenchmark';
import { START_DATE, simulateMismatchUser } from '../helpers/mismatchWorld';
import { applyImperfection, drawLogging } from '../helpers/intakeLogging';
import { NOMINAL_BIAS_PRIOR, jointPosterior, jointSlices } from '../helpers/jointBias';
import { JOINT_OUTPUT_DIR } from '../helpers/jointBiasExperiment';
import { createRng } from '../helpers/random';

const USERS = 12;
const median = (a: readonly number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] as number;

it('flat offset prior probe', () => {
  const rows: Array<{ intakeCv: number; days: number; populationPrior: { kWidthRatio: number; correlation: number }; flatPrior: { kWidthRatio: number; correlation: number } }> = [];
  for (const intakeCv of [0, 0.2]) {
    for (const days of [42, 84] as const) {
      const acc = { popW: [] as number[], popC: [] as number[], flatW: [] as number[], flatC: [] as number[] };
      for (let i = 0; i < USERS; i++) {
        const rng = createRng(500 + i);
        const intakeFactors = intakeCv > 0 ? Array.from({ length: days }, () => Math.max(0.2, 1 + intakeCv * rng.normal())) : undefined;
        const profile = PROFILES[i % PROFILES.length];
        if (!profile) throw new Error('profile');
        const run = simulateMismatchUser(profile, { ...BASE, days, trueOffsetKcal: [-300, 0, 300][i % 3] as number, weighEveryDays: 1, ...(intakeFactors ? { intakeFactors } : {}) }, createRng(900 + i));
        const base = run.calibrationInputFor(days);
        const logged = applyImperfection(run.trueIntakeKcal, drawLogging(days, createRng(700 + i)), { underReportBias: -0.1 + 0.1 * createRng(800 + i).normal(), dailyCoverage: 1, residualNoiseSd: 0.08 });
        const pop = jointPosterior(jointSlices(base, START_DATE, logged), NOMINAL_BIAS_PRIOR);
        const flat = jointPosterior(jointSlices({ ...base, priorSigmaKcal: 1e7 }, START_DATE, logged), NOMINAL_BIAS_PRIOR);
        acc.popW.push(pop.kWidthRatio);
        acc.popC.push(pop.correlation);
        acc.flatW.push(flat.kWidthRatio);
        acc.flatC.push(flat.correlation);
      }
      rows.push({ intakeCv, days, populationPrior: { kWidthRatio: median(acc.popW), correlation: median(acc.popC) }, flatPrior: { kWidthRatio: median(acc.flatW), correlation: median(acc.flatC) } });
    }
  }
  mkdirSync(JOINT_OUTPUT_DIR, { recursive: true });
  writeFileSync(`${JOINT_OUTPUT_DIR}/flat-offset-prior.json`, `${JSON.stringify({ usersPerCondition: USERS, rows }, null, 2)}\n`);
  expect(rows).toHaveLength(4);
});
