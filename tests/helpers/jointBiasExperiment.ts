/**
 * Runner of the joint (offset, logging bias) benchmark, handoff prompt 27. Measurement only.
 *
 * Arms (same worlds, seeds, profiles and scenarios): A current method (targets + adherence, production fit),
 * C-exact logged intake treated as exact (k = 1 slice), D joint estimation with k marginalised under a prior.
 * The simulator draws one bias per simulated user from a population; the estimator never receives the population,
 * the drawn bias or the true intake (checked by test).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { evaluateGate, fitCalibration } from '@/science/calibration';
import type { Posterior } from '@/science/calibration';
import { BASE, FREQUENCIES, OFFSETS, PROFILES, SCENARIOS } from './mismatchBenchmark';
import type { ScenarioKey } from './mismatchBenchmark';
import { START_DATE, simulateMismatchUser } from './mismatchWorld';
import type { MismatchSettings } from './mismatchWorld';
import { PROMPT_26_RESIDUAL_NOISE_SD, applyImperfection, armApparentOffsetKcal, assumedIntakeKcal, drawLogging, withLoggedIntake } from './intakeLogging';
import { PERSONAL_TARGET_SHIFT_KCAL, pairedIndicatorDelta, pairedMedianDelta, seedBase, wilson } from './intakeLoggingExperiment';
import type { ExperimentScenario, PairedDelta, Proportion } from './intakeLoggingExperiment';
import { NOMINAL_BIAS_PRIOR, U_SUPPORT_MAX, U_SUPPORT_MIN, exactSlicePosterior, jointPosterior, jointSlices, kOf } from './jointBias';
import type { BiasPrior } from './jointBias';
import { JOURNAL_RESULTS_DIR, edgeMass, writeCsvGz } from './journalExport';
import type { CsvValue, EdgeMass } from './journalExport';
import { createRng } from './random';

export const REPLICATES = Number(process.env.JOINT_REPLICATES ?? 5);
const SEED_STRIDE = 100_000;
const LOGGING_SEED_OFFSET = 7_000_000;
const BIAS_SEED_OFFSET = 8_000_000;
const INTAKE_VARIATION_SEED_OFFSET = 9_000_000;

/** Simulated population of logging biases: u ~ Normal(meanU, sdU), drawn once per simulated user, unclipped. */
export type BiasPopulation = { label: string; meanU: number; sdU: number };
export const POPULATIONS = {
  P10: { label: 'vrai biais moyen -10 %, écart-type 10 pts', meanU: -0.1, sdU: 0.1 },
  P20: { label: 'vrai biais moyen -20 %, écart-type 10 pts', meanU: -0.2, sdU: 0.1 },
  P05: { label: 'vrai biais moyen -5 %, écart-type 10 pts', meanU: -0.05, sdU: 0.1 },
} as const satisfies Record<string, BiasPopulation>;
export type PopulationKey = keyof typeof POPULATIONS;

const prior = (label: string, meanU: number, sdU: number): BiasPrior => ({ label, meanU, sdU });

/** Priors evaluated on each population (fixed before measurement; only the combination of slices changes). */
export const PRIORS: Record<PopulationKey, BiasPrior[]> = {
  P10: [
    NOMINAL_BIAS_PRIOR,
    prior('trop étroit N(-10 %, 5 pts)', -0.1, 0.05),
    prior('trop large N(-10 %, 20 pts)', -0.1, 0.2),
    prior('centre 0 % (décalage +10)', 0, 0.1),
    prior('centre -5 % (décalage +5)', -0.05, 0.1),
    prior('centre -15 % (décalage -5)', -0.15, 0.1),
    prior('centre -20 % (décalage -10)', -0.2, 0.1),
  ],
  P20: [prior('centre -10 % (décalage +10, cas prompt 1)', -0.1, 0.1), prior('centre -20 % (bien spécifié)', -0.2, 0.1)],
  P05: [prior('centre -20 % (décalage -15, cas prompt 2)', -0.2, 0.1), prior('centre -10 % (décalage -5)', -0.1, 0.1), prior('centre -5 % (bien spécifié)', -0.05, 0.1)],
};

export type CellScenario = ExperimentScenario | 'ideal';
export type Axis = 'identifiability' | 'performance' | 'robustness';
export type Cell = { id: string; axis: Axis; scenario: CellScenario; days: 28 | 42 | 84; coverage: number; population: PopulationKey; intakeCv: number };

const SUPPLEMENTARY: Record<'S_on' | 'S_major', Partial<MismatchSettings>> = {
  S_on: { minorDeviationFraction: 0, majorDeviationFraction: 0, unreportedFraction: 0, plannedIntakeShiftKcal: PERSONAL_TARGET_SHIFT_KCAL, shiftDeclaredAs: 'on_plan' },
  S_major: { minorDeviationFraction: 0, majorDeviationFraction: 0, unreportedFraction: 0, plannedIntakeShiftKcal: PERSONAL_TARGET_SHIFT_KCAL, shiftDeclaredAs: 'major_deviation' },
};

const SCENARIO_KEYS: ExperimentScenario[] = ['A', 'B', 'C', 'D', 'E', 'F', 'S_on', 'S_major'];
export const INTAKE_CVS = [0, 0.05, 0.1, 0.2] as const;

export function allCells(): Cell[] {
  const cells: Cell[] = [];
  for (const intakeCv of INTAKE_CVS) for (const days of [28, 42, 84] as const) cells.push({ id: `ident-cv${intakeCv}-${days}`, axis: 'identifiability', scenario: 'ideal', days, coverage: 1, population: 'P10', intakeCv });
  for (const scenario of SCENARIO_KEYS) {
    for (const days of [28, 42] as const) {
      for (const coverage of [1, 0.85, 0.7]) cells.push({ id: `perf-${scenario}-${days}-c${coverage}`, axis: 'performance', scenario, days, coverage, population: 'P10', intakeCv: 0 });
      for (const population of ['P20', 'P05'] as const) cells.push({ id: `robust-${scenario}-${days}-${population}`, axis: 'robustness', scenario, days, coverage: 0.85, population, intakeCv: 0 });
    }
  }
  return cells;
}

function cellSeedBase(cell: Cell): number {
  return cell.scenario === 'ideal' ? (cell.days === 84 ? 22_000 : cell.days === 42 ? 21_000 : 20_000) : seedBase(cell.scenario, cell.days === 84 ? 42 : cell.days);
}

function settingsFor(cell: Cell, i: number): Partial<MismatchSettings> {
  if (cell.scenario === 'ideal') return {};
  if (cell.scenario === 'S_on' || cell.scenario === 'S_major') return SUPPLEMENTARY[cell.scenario];
  return SCENARIOS[cell.scenario as ScenarioKey].settings(i);
}

type Interval = { median: number; l80: number; u80: number; l95: number; u95: number };
const intervalOf = (p: Posterior): Interval => ({ median: p.medianKcal, l80: p.interval80[0], u80: p.interval80[1], l95: p.interval95[0], u95: p.interval95[1] });

export type DRow = Interval & { kMedian: number; kWidthRatio: number; correlation: number; kIn80: boolean; edge: { kLowerBin: number; kUpperBin: number; kLower3: number; kUpper3: number; offsetLow5: number; offsetHigh5: number } };

export type UserResult = {
  truthMetabolic: number;
  truthLoggedUnits: number;
  uTrue: number;
  kTrue: number;
  uOutsideSupport: boolean;
  declaredCv: number;
  gateA: boolean;
  gateLogged: boolean;
  A: Interval;
  Cexact: Interval;
  D: DRow[];
  /** Export only (prompt 34 s4), never read by the metrics: identity of the user and grid-bound masses of each arm. */
  export?: {
    replicate: number;
    index: number;
    seed: number;
    profileIndex: number;
    trueOffsetKcal: number;
    weighEveryDays: number;
    /** Apparent offset under arm A's assumed intake (targets), D-31. */
    truthApparent: number;
    edgeA: EdgeMass;
    edgeCexact: EdgeMass;
    edgeD: Array<{ offset: EdgeMass; k: EdgeMass }>;
  };
};

export function simulateCellUser(cell: Cell, r: number, i: number, trueOffsetKcal: number, weighEveryDays: number, profileIndex: number): UserResult {
  const seed = cellSeedBase(cell) + r * SEED_STRIDE + i;
  const profile = PROFILES[profileIndex];
  if (!profile) throw new Error('profile');
  const intakeFactorsRng = createRng(seed + INTAKE_VARIATION_SEED_OFFSET);
  const intakeFactors = cell.intakeCv > 0 ? Array.from({ length: cell.days }, () => Math.max(0.2, 1 + cell.intakeCv * intakeFactorsRng.normal())) : undefined;
  const run = simulateMismatchUser(profile, { ...BASE, days: cell.days, trueOffsetKcal, weighEveryDays, ...settingsFor(cell, i), ...(intakeFactors ? { intakeFactors } : {}) }, createRng(seed));
  const base = run.calibrationInputFor(cell.days);
  const metabolic = run.windowMeanOffsetKcal(cell.days);
  const population = POPULATIONS[cell.population];
  const uTrue = population.meanU + population.sdU * createRng(seed + BIAS_SEED_OFFSET).normal();
  const logged = applyImperfection(run.trueIntakeKcal, drawLogging(cell.days, createRng(seed + LOGGING_SEED_OFFSET)), { underReportBias: uTrue, dailyCoverage: cell.coverage, residualNoiseSd: PROMPT_26_RESIDUAL_NOISE_SD });
  const loggedInput = withLoggedIntake(base, START_DATE, logged);
  const aFit = fitCalibration(base);
  if (!aFit) throw new Error('fit failed');
  const slices = jointSlices(base, START_DATE, logged);
  const kTrue = kOf(uTrue);
  const values = logged.filter((v): v is number => v !== null);
  const mean = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, values.length - 1));
  const cExact = exactSlicePosterior(slices);
  const joints = PRIORS[cell.population].map((p) => jointPosterior(slices, p));
  return {
    truthMetabolic: metabolic,
    truthLoggedUnits: armApparentOffsetKcal(metabolic, run.trueIntakeKcal, assumedIntakeKcal(loggedInput, START_DATE, cell.days), cell.days),
    uTrue,
    kTrue,
    uOutsideSupport: uTrue > U_SUPPORT_MAX || uTrue < U_SUPPORT_MIN,
    declaredCv: mean > 0 ? sd / mean : 0,
    gateA: evaluateGate(base.weights, base.dailyLogs).met,
    gateLogged: evaluateGate(loggedInput.weights, loggedInput.dailyLogs).met,
    A: intervalOf(aFit.posterior),
    Cexact: intervalOf(cExact),
    D: joints.map((j) => ({ ...intervalOf(j.offset), kMedian: j.kMedian, kWidthRatio: j.kWidthRatio, correlation: j.correlation, kIn80: kTrue >= j.k80[0] && kTrue <= j.k80[1], edge: j.edgeMass })),
    export: {
      replicate: r,
      index: i,
      seed,
      profileIndex,
      trueOffsetKcal,
      weighEveryDays,
      truthApparent: armApparentOffsetKcal(metabolic, run.trueIntakeKcal, assumedIntakeKcal(base, START_DATE, cell.days), cell.days),
      edgeA: edgeMass(aFit.posterior.probabilities),
      edgeCexact: edgeMass(cExact.probabilities),
      edgeD: joints.map((j) => ({ offset: edgeMass(j.offset.probabilities), k: edgeMass(j.uProbabilities) })),
    },
  };
}

export function simulateCell(cell: Cell, replicates = REPLICATES): UserResult[] {
  const users: UserResult[] = [];
  for (let r = 0; r < replicates; r++) {
    let i = 0;
    for (const trueOffsetKcal of OFFSETS) for (const weighEveryDays of FREQUENCIES) for (let pi = 0; pi < PROFILES.length; pi++) users.push(simulateCellUser(cell, r, i++, trueOffsetKcal, weighEveryDays, pi));
  }
  return users;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

const median = (values: readonly number[]): number => {
  const s = [...values].sort((a, b) => a - b);
  const mid = (s.length - 1) / 2;
  return ((s[Math.floor(mid)] as number) + (s[Math.ceil(mid)] as number)) / 2;
};
const mean = (values: readonly number[]): number => values.reduce((s, v) => s + v, 0) / values.length;

export type Truth = 'metabolic' | 'loggedUnits';
export type ArmMetrics = { n: number; medianAbsErrorKcal: number; meanBiasKcal: number; coverage80: Proportion; coverage95: Proportion; medianWidth80Kcal: number; gateShare: number };
export type Comparison = ArmMetrics & { vsA: { coverage80: PairedDelta; coverage95: PairedDelta; medianAbsErrorKcal: PairedDelta; widthRatio: number } | null };
export type Identifiability = {
  priorLabel: string;
  medianKWidthRatio: number;
  medianCorrelation: number;
  medianAbsKError: number;
  /** Error on k when using the prior median alone, for comparison. */
  medianAbsKErrorPriorOnly: number;
  kCoverage80: Proportion;
  meanEdge: DRow['edge'];
  /** Share of users with more than 5 percent posterior mass in the boundary bin of k (lower, upper). */
  shareEdgeOver5: { kLower: number; kUpper: number; offsetLow5: number; offsetHigh5: number };
};

function metricsOf(users: readonly UserResult[], pick: (u: UserResult) => Interval, truth: Truth, gate: (u: UserResult) => boolean): { m: ArmMetrics; inside80: boolean[]; inside95: boolean[]; absErr: number[] } {
  const t = (u: UserResult) => (truth === 'metabolic' ? u.truthMetabolic : u.truthLoggedUnits);
  const errors = users.map((u) => pick(u).median - t(u));
  const inside80 = users.map((u) => t(u) >= pick(u).l80 && t(u) <= pick(u).u80);
  const inside95 = users.map((u) => t(u) >= pick(u).l95 && t(u) <= pick(u).u95);
  return {
    m: {
      n: users.length,
      medianAbsErrorKcal: median(errors.map(Math.abs)),
      meanBiasKcal: mean(errors),
      coverage80: wilson(inside80.filter(Boolean).length, users.length),
      coverage95: wilson(inside95.filter(Boolean).length, users.length),
      medianWidth80Kcal: median(users.map((u) => pick(u).u80 - pick(u).l80)),
      gateShare: users.filter(gate).length / users.length,
    },
    inside80,
    inside95,
    absErr: errors.map(Math.abs),
  };
}

export type CellSummary = {
  cell: Cell;
  replicates: number;
  n: number;
  populationLabel: string;
  priors: BiasPrior[];
  shareUOutsideSupport: number;
  medianDeclaredCv: number;
  results: Record<Truth, Record<string, Comparison>>;
  identifiability: Identifiability[];
  elapsedMs: number;
  fitsPerUser: number;
};

export function summarizeCell(cell: Cell, users: readonly UserResult[], elapsedMs: number): CellSummary {
  const results = { metabolic: {}, loggedUnits: {} } as Record<Truth, Record<string, Comparison>>;
  const priors = PRIORS[cell.population];
  for (const truth of ['metabolic', 'loggedUnits'] as const) {
    const a = metricsOf(users, (u) => u.A, truth, (u) => u.gateA);
    results[truth].A = { ...a.m, vsA: null };
    const arms: Array<[string, (u: UserResult) => Interval]> = [['C-exact', (u) => u.Cexact], ...priors.map((p, idx): [string, (u: UserResult) => Interval] => [`D ${p.label}`, (u) => u.D[idx] as DRow])];
    for (const [key, pick] of arms) {
      const b = metricsOf(users, pick, truth, (u) => u.gateLogged);
      results[truth][key] = {
        ...b.m,
        vsA: {
          coverage80: pairedIndicatorDelta(a.inside80, b.inside80),
          coverage95: pairedIndicatorDelta(a.inside95, b.inside95),
          medianAbsErrorKcal: pairedMedianDelta(a.absErr, b.absErr, 12_345),
          widthRatio: b.m.medianWidth80Kcal / a.m.medianWidth80Kcal,
        },
      };
    }
  }
  const identifiability: Identifiability[] = priors.map((p, idx) => {
    const rows = users.map((u) => u.D[idx] as DRow);
    const edgeKeys = ['kLowerBin', 'kUpperBin', 'kLower3', 'kUpper3', 'offsetLow5', 'offsetHigh5'] as const;
    const meanEdge = Object.fromEntries(edgeKeys.map((k) => [k, mean(rows.map((r) => r.edge[k]))])) as DRow['edge'];
    return {
      priorLabel: p.label,
      medianKWidthRatio: median(rows.map((r) => r.kWidthRatio)),
      medianCorrelation: median(rows.map((r) => r.correlation)),
      medianAbsKError: median(rows.map((r, j) => Math.abs(r.kMedian - (users[j] as UserResult).kTrue))),
      medianAbsKErrorPriorOnly: median(users.map((u) => Math.abs(kOf(Math.min(U_SUPPORT_MAX, Math.max(U_SUPPORT_MIN, p.meanU))) - u.kTrue))),
      kCoverage80: wilson(rows.filter((r) => r.kIn80).length, rows.length),
      meanEdge,
      shareEdgeOver5: {
        kLower: rows.filter((r) => r.edge.kLowerBin > 0.05).length / rows.length,
        kUpper: rows.filter((r) => r.edge.kUpperBin > 0.05).length / rows.length,
        offsetLow5: rows.filter((r) => r.edge.offsetLow5 > 0.05).length / rows.length,
        offsetHigh5: rows.filter((r) => r.edge.offsetHigh5 > 0.05).length / rows.length,
      },
    };
  });
  return {
    cell,
    replicates: REPLICATES,
    n: users.length,
    populationLabel: POPULATIONS[cell.population].label,
    priors,
    shareUOutsideSupport: users.filter((u) => u.uOutsideSupport).length / users.length,
    medianDeclaredCv: median(users.map((u) => u.declaredCv)),
    results,
    identifiability,
    elapsedMs,
    fitsPerUser: 1 + 41,
  };
}

export const JOINT_OUTPUT_DIR = 'reports/joint-bias';

export function runShard(shard: number, shardCount: number): number {
  const cells = allCells().filter((_, index) => index % shardCount === shard);
  mkdirSync(`${JOINT_OUTPUT_DIR}/cells`, { recursive: true });
  for (const cell of cells) {
    const t0 = performance.now();
    const users = simulateCell(cell);
    const summary = summarizeCell(cell, users, performance.now() - t0);
    writeFileSync(`${JOINT_OUTPUT_DIR}/cells/${cell.id}.json`, `${JSON.stringify(summary, null, 2)}\n`);
    exportCell(cell, users);
  }
  return cells.length;
}

// ---------------------------------------------------------------------------
// Raw export (prompt 34 s4): one row per simulated user and arm, read back by the table reconstruction
// ---------------------------------------------------------------------------

export const EXPORT_COLUMNS_27 = [
  'bench', 'cell', 'axis', 'scenario', 'horizon', 'logging_rate', 'population', 'intake_cv', 'replicate', 'user_index', 'seed', 'profile', 'true_offset', 'weigh_every_days',
  'arm', 'prior_index', 'u', 'k_true', 'u_outside_support', 'declared_cv',
  'q025', 'q10', 'q50', 'q90', 'q975', 'truth_metabolic', 'truth_apparent', 'truth_logged_units', 'gate_met',
  'offset_low5', 'offset_low10', 'offset_high5', 'offset_high10', 'k_low5', 'k_low10', 'k_high5', 'k_high10', 'width80', 'width95',
  'k_median', 'k_width_ratio', 'correlation', 'k_in80', 'info_k_lower_bin', 'info_k_upper_bin', 'info_k_lower3', 'info_k_upper3', 'info_offset_low5', 'info_offset_high5',
] as const;

function exportCell(cell: Cell, users: readonly UserResult[]): void {
  const rows: Array<Record<string, CsvValue>> = [];
  for (const u of users) {
    const x = u.export;
    if (!x) throw new Error('export needs the user identity');
    const common = {
      bench: 27, cell: cell.id, axis: cell.axis, scenario: cell.scenario, horizon: cell.days, logging_rate: cell.coverage, population: cell.population, intake_cv: cell.intakeCv,
      replicate: x.replicate, user_index: x.index, seed: x.seed, profile: x.profileIndex, true_offset: x.trueOffsetKcal, weigh_every_days: x.weighEveryDays,
      u: u.uTrue, k_true: u.kTrue, u_outside_support: u.uOutsideSupport, declared_cv: u.declaredCv,
      truth_metabolic: u.truthMetabolic, truth_apparent: x.truthApparent, truth_logged_units: u.truthLoggedUnits,
    };
    const interval = (v: Interval) => ({ q025: v.l95, q10: v.l80, q50: v.median, q90: v.u80, q975: v.u95, width80: v.u80 - v.l80, width95: v.u95 - v.l95 });
    const offsetEdge = (e: EdgeMass) => ({ offset_low5: e.low5, offset_low10: e.low10, offset_high5: e.high5, offset_high10: e.high10 });
    rows.push({ ...common, arm: 'A', prior_index: null, ...interval(u.A), gate_met: u.gateA, ...offsetEdge(x.edgeA) });
    rows.push({ ...common, arm: 'C-exact', prior_index: null, ...interval(u.Cexact), gate_met: u.gateLogged, ...offsetEdge(x.edgeCexact) });
    PRIORS[cell.population].forEach((p, idx) => {
      const d = u.D[idx] as DRow;
      const e = x.edgeD[idx];
      if (!e) throw new Error('edge');
      rows.push({
        ...common, arm: `D ${p.label}`, prior_index: idx, ...interval(d), gate_met: u.gateLogged, ...offsetEdge(e.offset),
        // u grid index 0 is u = -0.40, the upper bound of k: "k_high" is the low end of the u grid.
        k_low5: e.k.high5, k_low10: e.k.high10, k_high5: e.k.low5, k_high10: e.k.low10,
        k_median: d.kMedian, k_width_ratio: d.kWidthRatio, correlation: d.correlation, k_in80: d.kIn80,
        info_k_lower_bin: d.edge.kLowerBin, info_k_upper_bin: d.edge.kUpperBin, info_k_lower3: d.edge.kLower3, info_k_upper3: d.edge.kUpper3, info_offset_low5: d.edge.offsetLow5, info_offset_high5: d.edge.offsetHigh5,
      });
    });
  }
  writeCsvGz(`${JOURNAL_RESULTS_DIR}/bench27/${cell.id}.csv.gz`, EXPORT_COLUMNS_27, rows);
}
