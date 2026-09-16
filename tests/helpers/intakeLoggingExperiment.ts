/**
 * Runner of the intake logging benchmark (handoff prompt 26). Same simulator, seeds, profiles and scenarios for every
 * arm; only the information handed to the unchanged production estimator differs.
 *
 * Arms: A baseline (targets + adherence weights), B perfect log (upper control, never a product basis),
 * C realistic log (9 cells bias x coverage, logged value treated as central value, no invented sigma),
 * Cs sensitivity of C with an observable-derived sigma (declared quality "high", not a validated value).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { evaluateGate, fitCalibration } from '@/science/calibration';
import type { CalibrationInput } from '@/science/calibration';
import { WARM_START_INTAKE_REL_SD_HIGH } from '@/science/constants';
import { BASE, FREQUENCIES, OFFSETS, PROFILES, SCENARIOS } from './mismatchBenchmark';
import type { ScenarioKey } from './mismatchBenchmark';
import { START_DATE, simulateMismatchUser } from './mismatchWorld';
import type { MismatchSettings } from './mismatchWorld';
import {
  PERFECT_LOGGING,
  PROMPT_26_BIASES,
  PROMPT_26_COVERAGES,
  PROMPT_26_RESIDUAL_NOISE_SD,
  applyImperfection,
  armApparentOffsetKcal,
  assumedIntakeKcal,
  drawLogging,
  observableLoggingSdKcal,
  withLoggedIntake,
  withLoggingSigma,
} from './intakeLogging';
import { createRng } from './random';

export type ExperimentScenario = ScenarioKey | 'S_on' | 'S_major';
export type ExperimentHorizon = 28 | 42;

/** Supplementary scenario (not in prompt 26): personal target 270 kcal/day below the plan, declared on plan or major. */
export const PERSONAL_TARGET_SHIFT_KCAL = -270;

const SUPPLEMENTARY: Record<'S_on' | 'S_major', { label: string; settings: Partial<MismatchSettings> }> = {
  S_on: {
    label: 'S personal target -270 kcal/day, declared "Plan respecte"',
    settings: { minorDeviationFraction: 0, majorDeviationFraction: 0, unreportedFraction: 0, plannedIntakeShiftKcal: PERSONAL_TARGET_SHIFT_KCAL, shiftDeclaredAs: 'on_plan' },
  },
  S_major: {
    label: 'S personal target -270 kcal/day, declared "Ecart important"',
    settings: { minorDeviationFraction: 0, majorDeviationFraction: 0, unreportedFraction: 0, plannedIntakeShiftKcal: PERSONAL_TARGET_SHIFT_KCAL, shiftDeclaredAs: 'major_deviation' },
  },
};

export const REPLICATES = Number(process.env.INTAKE_REPLICATES ?? 5);
const SEED_STRIDE = 100_000;
const LOGGING_SEED_OFFSET = 7_000_000;
const BOOTSTRAP_RESAMPLES = 2000;

/** Seed bases. Replicate 0 at 42 days reuses the documented T-04 seeds, so arm A reproduces the recorded baseline. */
export function seedBase(scenario: ExperimentScenario, days: ExperimentHorizon): number {
  if (scenario === 'S_on' || scenario === 'S_major') return days === 42 ? 90_000 : 91_000; // same worlds for both declarations
  const index = (['A', 'B', 'C', 'D', 'E', 'F'] as const).indexOf(scenario);
  const group = index < 3 ? 0 : 1;
  const base = days === 42 ? [50_000, 60_000][group] : [30_000, 40_000][group];
  return (base as number) + (index % 3) * 1000;
}

export type ArmKey = string;

export function armKeys(): ArmKey[] {
  const keys: ArmKey[] = ['A', 'B'];
  for (const b of PROMPT_26_BIASES) for (const c of PROMPT_26_COVERAGES) keys.push(`C|${b}|${c}`);
  for (const b of PROMPT_26_BIASES) for (const c of PROMPT_26_COVERAGES) keys.push(`Cs|${b}|${c}`);
  return keys;
}

type FitRow = { median: number; l80: number; u80: number; l95: number; u95: number; truthApparent: number; gateMet: boolean };
export type UserRows = { replicate: number; truthMetabolic: number; arms: Record<ArmKey, FitRow> };

function fitRow(input: CalibrationInput, truthApparent: number): FitRow {
  const fit = fitCalibration(input);
  if (!fit) throw new Error('fit failed');
  const p = fit.posterior;
  return { median: p.medianKcal, l80: p.interval80[0], u80: p.interval80[1], l95: p.interval95[0], u95: p.interval95[1], truthApparent, gateMet: evaluateGate(input.weights, input.dailyLogs).met };
}

export function simulateUsers(scenario: ExperimentScenario, days: ExperimentHorizon, replicates = REPLICATES): UserRows[] {
  const scenarioSettings = scenario === 'S_on' || scenario === 'S_major' ? () => SUPPLEMENTARY[scenario].settings : SCENARIOS[scenario].settings;
  const users: UserRows[] = [];
  for (let r = 0; r < replicates; r++) {
    let i = 0;
    for (const trueOffsetKcal of OFFSETS) {
      for (const weighEveryDays of FREQUENCIES) {
        for (const profile of PROFILES) {
          const seed = seedBase(scenario, days) + r * SEED_STRIDE + i;
          const run = simulateMismatchUser(profile, { ...BASE, days, trueOffsetKcal, weighEveryDays, ...scenarioSettings(i) }, createRng(seed));
          const base = run.calibrationInputFor(days);
          const metabolic = run.windowMeanOffsetKcal(days);
          const draws = drawLogging(days, createRng(seed + LOGGING_SEED_OFFSET));
          const arms: Record<ArmKey, FitRow> = {};
          const armFor = (input: CalibrationInput) => fitRow(input, armApparentOffsetKcal(metabolic, run.trueIntakeKcal, assumedIntakeKcal(input, START_DATE, days), days));
          arms.A = armFor(base);
          arms.B = armFor(withLoggedIntake(base, START_DATE, applyImperfection(run.trueIntakeKcal, draws, PERFECT_LOGGING)));
          for (const underReportBias of PROMPT_26_BIASES) {
            for (const dailyCoverage of PROMPT_26_COVERAGES) {
              const logged = applyImperfection(run.trueIntakeKcal, draws, { underReportBias, dailyCoverage, residualNoiseSd: PROMPT_26_RESIDUAL_NOISE_SD });
              const input = withLoggedIntake(base, START_DATE, logged);
              arms[`C|${underReportBias}|${dailyCoverage}`] = armFor(input);
              arms[`Cs|${underReportBias}|${dailyCoverage}`] = armFor(withLoggingSigma(input, observableLoggingSdKcal(logged, WARM_START_INTAKE_REL_SD_HIGH)));
            }
          }
          users.push({ replicate: r, truthMetabolic: metabolic, arms });
          i++;
        }
      }
    }
  }
  return users;
}

// ---------------------------------------------------------------------------
// Metrics with measurement uncertainty
// ---------------------------------------------------------------------------

export type Proportion = { value: number; low: number; high: number };

/** Wilson score interval at 95 percent. */
export function wilson(successes: number, n: number): Proportion {
  const z = 1.96;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { value: p, low: centre - half, high: centre + half };
}

const median = (values: readonly number[]): number => {
  const s = [...values].sort((a, b) => a - b);
  const mid = (s.length - 1) / 2;
  return ((s[Math.floor(mid)] as number) + (s[Math.ceil(mid)] as number)) / 2;
};

export type Truth = 'metabolic' | 'apparent';

export type ArmMetrics = {
  n: number;
  medianAbsErrorKcal: number;
  meanBiasKcal: number;
  coverage80: Proportion;
  coverage95: Proportion;
  medianWidth80Kcal: number;
  gateMetShare: number;
};

export type PairedDelta = { mean: number; low: number; high: number };

export type ArmComparison = { metrics: ArmMetrics; vsA: { coverage80: PairedDelta; coverage95: PairedDelta; medianAbsErrorKcal: PairedDelta; widthRatio: number } | null };

const truthOf = (u: UserRows, arm: ArmKey, truth: Truth) => (truth === 'metabolic' ? u.truthMetabolic : (u.arms[arm] as FitRow).truthApparent);

export function armMetrics(users: readonly UserRows[], arm: ArmKey, truth: Truth): ArmMetrics {
  const rows = users.map((u) => ({ row: u.arms[arm] as FitRow, t: truthOf(u, arm, truth) }));
  const errors = rows.map(({ row, t }) => row.median - t);
  return {
    n: rows.length,
    medianAbsErrorKcal: median(errors.map(Math.abs)),
    meanBiasKcal: errors.reduce((s, e) => s + e, 0) / rows.length,
    coverage80: wilson(rows.filter(({ row, t }) => t >= row.l80 && t <= row.u80).length, rows.length),
    coverage95: wilson(rows.filter(({ row, t }) => t >= row.l95 && t <= row.u95).length, rows.length),
    medianWidth80Kcal: median(rows.map(({ row }) => row.u80 - row.l80)),
    gateMetShare: rows.filter(({ row }) => row.gateMet).length / rows.length,
  };
}

function pairedIndicatorDelta(a: readonly boolean[], b: readonly boolean[]): PairedDelta {
  const d = a.map((x, i) => (b[i] ? 1 : 0) - (x ? 1 : 0));
  const mean = d.reduce((s, v) => s + v, 0) / d.length;
  const sd = Math.sqrt(d.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, d.length - 1));
  const half = (1.96 * sd) / Math.sqrt(d.length);
  return { mean, low: mean - half, high: mean + half };
}

/** Paired bootstrap percentile interval of median(|err B|) - median(|err A|). Deterministic seed. */
function pairedMedianDelta(absA: readonly number[], absB: readonly number[], seed: number): PairedDelta {
  const rng = createRng(seed);
  const n = absA.length;
  const deltas: number[] = [];
  for (let k = 0; k < BOOTSTRAP_RESAMPLES; k++) {
    const ia: number[] = [];
    const ib: number[] = [];
    for (let j = 0; j < n; j++) {
      const pick = Math.floor(rng.next() * n);
      ia.push(absA[pick] as number);
      ib.push(absB[pick] as number);
    }
    deltas.push(median(ib) - median(ia));
  }
  deltas.sort((x, y) => x - y);
  return { mean: median(absB) - median(absA), low: deltas[Math.floor(0.025 * BOOTSTRAP_RESAMPLES)] as number, high: deltas[Math.floor(0.975 * BOOTSTRAP_RESAMPLES)] as number };
}

export function compareArms(users: readonly UserRows[], arm: ArmKey, truth: Truth): ArmComparison {
  const metrics = armMetrics(users, arm, truth);
  if (arm === 'A') return { metrics, vsA: null };
  const inside = (a: ArmKey, level: 80 | 95) =>
    users.map((u) => {
      const row = u.arms[a] as FitRow;
      const t = truthOf(u, a, truth);
      return level === 80 ? t >= row.l80 && t <= row.u80 : t >= row.l95 && t <= row.u95;
    });
  const absErr = (a: ArmKey) => users.map((u) => Math.abs((u.arms[a] as FitRow).median - truthOf(u, a, truth)));
  const baseline = armMetrics(users, 'A', truth);
  return {
    metrics,
    vsA: {
      coverage80: pairedIndicatorDelta(inside('A', 80), inside(arm, 80)),
      coverage95: pairedIndicatorDelta(inside('A', 95), inside(arm, 95)),
      medianAbsErrorKcal: pairedMedianDelta(absErr('A'), absErr(arm), 12_345),
      widthRatio: metrics.medianWidth80Kcal / baseline.medianWidth80Kcal,
    },
  };
}

export type ExperimentSummary = {
  scenario: ExperimentScenario;
  label: string;
  days: ExperimentHorizon;
  replicates: number;
  seedBase: number;
  results: Record<Truth, Record<ArmKey, ArmComparison>>;
  /** Arm A on replicate 0 against the apparent truth: at 42 days it must reproduce the documented T-04 baseline. */
  reproductionReplicate0: ArmMetrics;
};

export const OUTPUT_DIR = 'reports/intake-logging';

export function runExperiment(scenario: ExperimentScenario, days: ExperimentHorizon): ExperimentSummary {
  const users = simulateUsers(scenario, days);
  const results = { metabolic: {}, apparent: {} } as Record<Truth, Record<ArmKey, ArmComparison>>;
  for (const truth of ['metabolic', 'apparent'] as const) for (const arm of armKeys()) results[truth][arm] = compareArms(users, arm, truth);
  const label = scenario === 'S_on' || scenario === 'S_major' ? SUPPLEMENTARY[scenario].label : SCENARIOS[scenario].label;
  const summary: ExperimentSummary = {
    scenario,
    label,
    days,
    replicates: REPLICATES,
    seedBase: seedBase(scenario, days),
    results,
    reproductionReplicate0: armMetrics(
      users.filter((u) => u.replicate === 0),
      'A',
      'apparent',
    ),
  };
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(`${OUTPUT_DIR}/${scenario}-${days}.json`, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}
