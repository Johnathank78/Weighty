/**
 * Control of prompt 34 s4: the aggregated tables of benchmarks 26 and 27 rebuilt from the raw per-user export only,
 * with the unchanged metric code (`compareArms`, `armMetrics`, `summarizeCell`) and table builders, must equal the
 * published summaries and tables (reports/intake-logging, reports/joint-bias). Writes results/reconstruction.json.
 *
 * Run: npx vitest run -c vitest.journal.config.ts reconstruct
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { buildTables } from '../experiments/buildTables';
import { buildJointTables } from '../experiments-joint/buildJointTables';
import { armKeys, armMetrics, compareArms } from '../helpers/intakeLoggingExperiment';
import type { ArmComparison, ExperimentSummary, FitRow, Truth, UserRows } from '../helpers/intakeLoggingExperiment';
import { summarizeCell } from '../helpers/jointBiasExperiment';
import type { CellSummary, DRow, UserResult } from '../helpers/jointBiasExperiment';
import { JOURNAL_RESULTS_DIR, bool, num, readCsvGz } from '../helpers/journalExport';

const PUBLISHED_26 = 'reports/intake-logging';
const PUBLISHED_27 = 'reports/joint-bias';
const WORK = resolve(`${JOURNAL_RESULTS_DIR}/.reconstruction`);

/** Deep comparison with Object.is on numbers; returns the list of differing paths. */
function differences(a: unknown, b: unknown, path = '$', out: string[] = []): string[] {
  if (typeof a === 'number' || typeof b === 'number') {
    if (!Object.is(a, b)) out.push(`${path}: ${String(a)} != ${String(b)}`);
    return out;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    if (a !== b) out.push(`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
    return out;
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.join('|') !== kb.join('|')) out.push(`${path}: keys ${ka.join(',')} != ${kb.join(',')}`);
  for (const k of ka) differences((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out);
  return out;
}

const lf = (s: string) => s.replace(/\r\n/g, '\n');

function users26(file: string): UserRows[] {
  const users: UserRows[] = [];
  let current: UserRows | null = null;
  for (const r of readCsvGz(file)) {
    const key = `${r.replicate}|${r.user_index}`;
    if (!current || `${current.replicate}|${current.user?.index}` !== key) {
      current = { replicate: num(r.replicate), truthMetabolic: num(r.truth_metabolic), arms: {}, user: { index: num(r.user_index), seed: num(r.seed), profileIndex: num(r.profile), trueOffsetKcal: num(r.true_offset), weighEveryDays: num(r.weigh_every_days) } };
      users.push(current);
    }
    const row: FitRow = { median: num(r.q50), l80: num(r.q10), u80: num(r.q90), l95: num(r.q025), u95: num(r.q975), truthApparent: num(r.truth_logged_units), gateMet: bool(r.gate_met) };
    current.arms[r.arm as string] = row;
  }
  return users;
}

function users27(file: string): { cellId: string; users: UserResult[] } {
  const users: UserResult[] = [];
  let current: UserResult | null = null;
  let currentKey = '';
  let cellId = '';
  const interval = (r: Record<string, string>) => ({ median: num(r.q50), l80: num(r.q10), u80: num(r.q90), l95: num(r.q025), u95: num(r.q975) });
  for (const r of readCsvGz(file)) {
    cellId = r.cell as string;
    const key = `${r.replicate}|${r.user_index}`;
    if (!current || currentKey !== key) {
      current = {
        truthMetabolic: num(r.truth_metabolic),
        truthLoggedUnits: num(r.truth_logged_units),
        uTrue: num(r.u),
        kTrue: num(r.k_true),
        uOutsideSupport: bool(r.u_outside_support),
        declaredCv: num(r.declared_cv),
        gateA: false,
        gateLogged: false,
        A: interval(r),
        Cexact: interval(r),
        D: [],
      };
      currentKey = key;
      users.push(current);
    }
    if (r.arm === 'A') {
      current.A = interval(r);
      current.gateA = bool(r.gate_met);
    } else if (r.arm === 'C-exact') {
      current.Cexact = interval(r);
      current.gateLogged = bool(r.gate_met);
    } else {
      const d: DRow = {
        ...interval(r),
        kMedian: num(r.k_median),
        kWidthRatio: num(r.k_width_ratio),
        correlation: num(r.correlation),
        kIn80: bool(r.k_in80),
        edge: { kLowerBin: num(r.info_k_lower_bin), kUpperBin: num(r.info_k_upper_bin), kLower3: num(r.info_k_lower3), kUpper3: num(r.info_k_upper3), offsetLow5: num(r.info_offset_low5), offsetHigh5: num(r.info_offset_high5) },
      };
      current.D[num(r.prior_index)] = d;
    }
  }
  return { cellId, users };
}

it('rebuilds the published tables of benchmarks 26 and 27 from the raw export', () => {
  const report: Record<string, unknown> = {};
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(`${WORK}/reports/intake-logging`, { recursive: true });
  mkdirSync(`${WORK}/reports/joint-bias/cells`, { recursive: true });

  // Benchmark 26: summaries (results and replicate-0 reproduction) from the export.
  const diffs26: string[] = [];
  let rows26 = 0;
  const files26 = readdirSync(`${JOURNAL_RESULTS_DIR}/bench26`).filter((f) => f.endsWith('.csv.gz'));
  for (const f of files26) {
    const cell = f.replace('.csv.gz', '');
    const users = users26(`${JOURNAL_RESULTS_DIR}/bench26/${f}`);
    rows26 += users.length * armKeys().length;
    const published = JSON.parse(readFileSync(`${PUBLISHED_26}/${cell}.json`, 'utf8')) as ExperimentSummary;
    const results = { metabolic: {}, apparent: {} } as Record<Truth, Record<string, ArmComparison>>;
    for (const truth of ['metabolic', 'apparent'] as const) for (const arm of armKeys()) results[truth][arm] = compareArms(users, arm, truth);
    const rebuilt: ExperimentSummary = { ...published, results, reproductionReplicate0: armMetrics(users.filter((u) => u.replicate === 0), 'A', 'apparent') };
    diffs26.push(...differences(rebuilt, published, cell));
    writeFileSync(`${WORK}/reports/intake-logging/${cell}.json`, `${JSON.stringify(rebuilt, null, 2)}\n`);
  }

  // Benchmark 27: full cell summaries from the export (elapsed time copied from the published cell: a timing, not a result).
  const diffs27: string[] = [];
  let rows27 = 0;
  const files27 = existsSync(`${JOURNAL_RESULTS_DIR}/bench27`) ? readdirSync(`${JOURNAL_RESULTS_DIR}/bench27`).filter((f) => f.endsWith('.csv.gz')) : [];
  for (const f of files27) {
    const { cellId, users } = users27(`${JOURNAL_RESULTS_DIR}/bench27/${f}`);
    rows27 += users.length * (2 + (users[0]?.D.length ?? 0));
    const published = JSON.parse(readFileSync(`${PUBLISHED_27}/cells/${cellId}.json`, 'utf8')) as CellSummary;
    const rebuilt = summarizeCell(published.cell, users, published.elapsedMs);
    diffs27.push(...differences(rebuilt, published, cellId));
    writeFileSync(`${WORK}/reports/joint-bias/cells/${cellId}.json`, `${JSON.stringify(rebuilt, null, 2)}\n`);
  }

  // Tables rendered by the unchanged builders from the rebuilt summaries.
  const cwd = process.cwd();
  process.chdir(WORK);
  try {
    buildTables();
    buildJointTables();
  } finally {
    process.chdir(cwd);
  }
  const tables = (dir: string, published: string) => {
    const rebuilt = existsSync(`${WORK}/${dir}/tables.md`) ? lf(readFileSync(`${WORK}/${dir}/tables.md`, 'utf8')) : '';
    const reference = lf(readFileSync(`${published}/tables.md`, 'utf8'));
    return { identical: rebuilt === reference, rebuiltLines: rebuilt.split('\n').length, differingLines: rebuilt.split('\n').filter((l, i) => l !== reference.split('\n')[i]).length };
  };
  report.bench26 = { cells: files26.length, rows: rows26, summaryDifferences: diffs26.length, firstDifferences: diffs26.slice(0, 10), tables: tables('reports/intake-logging', PUBLISHED_26) };
  report.bench27 = { cells: files27.length, rows: rows27, summaryDifferences: diffs27.length, firstDifferences: diffs27.slice(0, 10), tables: tables('reports/joint-bias', PUBLISHED_27) };
  writeFileSync(`${JOURNAL_RESULTS_DIR}/reconstruction.json`, `${JSON.stringify(report, null, 2)}\n`);
  rmSync(WORK, { recursive: true, force: true });
  expect(files26.length).toBe(16);
});
