/**
 * Tables of the journal battery, phase 1b (prompt 35), rebuilt from the raw per-user exports only
 * (tests/experiments-journal/results/{n2g,n4g,sh,n3b,timing1b}/, and n2x2, n4x2, n3x2 of phase 1 for the paired checks and
 * the after-the-fact re-reading). Writes results/tables1b.md and results/verdicts1b.json. No simulation, no fit.
 *
 * Statistics (prompt 35 s8, THRESHOLDS.md amendment 1): Wilson 95 % for simple proportions (one row per user in a cell);
 * bootstrap over users, 2 000 resamples, each resampled user drawn with all its rows (horizons, cells), percentile
 * interval, fixed seeds, for aggregated coverages, differences, means and medians.
 * Verdicts: N2 (THRESHOLDS.md) per grid; N3 amended by A1.2 for the current path and p1 (s6) and, after the fact, for the
 * phase 1 data (s7). N4 and s5 are diagnostics without verdict.
 *
 * Run: npx vitest run -c vitest.journal.config.ts 1b/tables1b
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { wilson } from '../../helpers/intakeLoggingExperiment';
import type { Proportion } from '../../helpers/intakeLoggingExperiment';
import { JOURNAL_RESULTS_DIR, readCsvGz } from '../../helpers/journalExport';
import { createRng } from '../../helpers/random';

type Row = Record<string, string>;
type Verdict = 'GO' | 'NO-GO' | 'INCONCLUSIF';
type Interval = { value: number; low: number; high: number };

const B = 2000;
const GRIDS = ['1200', '2000', '3000'] as const;
const n = (v: string | undefined) => Number(v);

function load(dir: string, prefix: string): Row[] {
  const path = `${JOURNAL_RESULTS_DIR}/${dir}`;
  if (!existsSync(path)) return [];
  return readdirSync(path)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.csv.gz'))
    .sort()
    .flatMap((f) => readCsvGz(`${path}/${f}`));
}

const sortedCopy = (v: ArrayLike<number>) => Float64Array.from(v).sort();
const medianSorted = (s: Float64Array) => {
  const m = (s.length - 1) / 2;
  return ((s[Math.floor(m)] as number) + (s[Math.ceil(m)] as number)) / 2;
};
const median = (v: ArrayLike<number>) => medianSorted(sortedCopy(v));
const mean = (v: readonly number[]) => v.reduce((a, b) => a + b, 0) / v.length;
function slopeOf(x: readonly number[], y: readonly number[]): number {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += ((x[i] as number) - mx) * ((y[i] as number) - my);
    sxx += ((x[i] as number) - mx) ** 2;
  }
  return sxy / sxx;
}

let seedCounter = 35_000;
/** Percentile bootstrap over units (users): `stat` receives the resampled units (each unit carries all its rows). */
function boot<T>(units: readonly T[], stat: (sample: readonly T[]) => number): Interval {
  const rng = createRng(seedCounter++);
  const values = new Float64Array(B);
  const sample: T[] = new Array<T>(units.length);
  for (let b = 0; b < B; b++) {
    for (let j = 0; j < units.length; j++) sample[j] = units[Math.floor(rng.next() * units.length)] as T;
    values[b] = stat(sample);
  }
  values.sort();
  return { value: stat(units), low: values[Math.floor(0.025 * B)] as number, high: values[Math.floor(0.975 * B)] as number };
}

/** Rows grouped by user (key: user id), in a stable order. */
function byUser(rows: readonly Row[]): Row[][] {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.user as string;
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return [...m.values()];
}

function groupBy(rows: readonly Row[], key: (r: Row) => string): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

/** Aggregated proportion over users (each user with all its rows), bootstrap interval. */
function bootProportion(rows: readonly Row[], hit: (r: Row) => boolean): Interval {
  const units = byUser(rows).map((rs) => ({ h: rs.filter(hit).length, t: rs.length }));
  return boot(units, (s) => {
    let h = 0;
    let t = 0;
    for (const u of s) {
      h += u.h;
      t += u.t;
    }
    return h / t;
  });
}
/** Mean of a per-row value over users, bootstrap interval. */
function bootMean(rows: readonly Row[], value: (r: Row) => number): Interval {
  const units = byUser(rows).map((rs) => ({ s: rs.reduce((a, r) => a + value(r), 0), t: rs.length }));
  return boot(units, (s) => {
    let a = 0;
    let t = 0;
    for (const u of s) {
      a += u.s;
      t += u.t;
    }
    return a / t;
  });
}
/** Median of a per-row value over users, bootstrap interval. */
function bootMedian(rows: readonly Row[], value: (r: Row) => number): Interval {
  const units = byUser(rows).map((rs) => rs.map(value));
  const total = units.reduce((a, u) => a + u.length, 0);
  const buf = new Float64Array(total);
  return boot(units, (s) => {
    let k = 0;
    for (const u of s) for (const v of u) buf[k++] = v;
    return medianSorted(buf.subarray(0, k).sort());
  });
}
/** Variance of a per-row value over users, bootstrap interval. */
function bootVariance(rows: readonly Row[], value: (r: Row) => number): Interval {
  const units = byUser(rows).map((rs) => {
    const v = rs.map(value);
    return { s: v.reduce((a, b) => a + b, 0), q: v.reduce((a, b) => a + b * b, 0), t: v.length };
  });
  return boot(units, (s) => {
    let a = 0;
    let q = 0;
    let t = 0;
    for (const u of s) {
      a += u.s;
      q += u.q;
      t += u.t;
    }
    const m = a / t;
    return (q - t * m * m) / (t - 1);
  });
}
/** OLS slope of y on x over rows, bootstrap over users. */
function bootSlope(rows: readonly Row[], x: (r: Row) => number, y: (r: Row) => number): Interval {
  const units = byUser(rows).map((rs) => rs.map((r) => [x(r), y(r)] as const));
  return boot(units, (s) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const u of s) for (const [a, b] of u) {
      xs.push(a);
      ys.push(b);
    }
    return slopeOf(xs, ys);
  });
}
/** Paired difference of an aggregated statistic between two arms (same users): stat(arm b) - stat(arm a). */
function bootPaired(rowsA: readonly Row[], rowsB: readonly Row[], agg: (rows: readonly Row[]) => number): Interval {
  const a = new Map(byUser(rowsA).map((rs) => [rs[0]?.user as string, rs]));
  const units = byUser(rowsB).map((rs) => ({ b: rs, a: a.get(rs[0]?.user as string) ?? [] }));
  return boot(units, (s) => agg(s.flatMap((u) => u.b)) - agg(s.flatMap((u) => u.a)));
}

const f0 = (v: number) => (Object.is(Math.round(v), -0) ? '0' : Math.round(v).toString());
const f1 = (v: number) => (Math.abs(v) < 0.05 ? '0,0' : v.toFixed(1).replace('.', ','));
const f2 = (v: number) => v.toFixed(2).replace('.', ',');
const f3 = (v: number) => v.toFixed(3).replace('.', ',');
const pct = (v: number, d = 1) => `${(100 * Math.max(0, v)).toFixed(d).replace('.', ',')} %`;
const prop = (p: Proportion | Interval) => `${f3(p.value)} [${f3(p.low)} ; ${f3(p.high)}]`;
const propPct = (p: Proportion) => `${pct(p.value)} [${pct(p.low)} ; ${pct(p.high)}]`;
const ci0 = (i: Interval) => `${f0(i.value)} [${f0(i.low)} ; ${f0(i.high)}]`;
const ci1 = (i: Interval) => `${f1(i.value)} [${f1(i.low)} ; ${f1(i.high)}]`;
const ci2 = (i: Interval) => `${f2(i.value)} [${f2(i.low)} ; ${f2(i.high)}]`;
const ci3 = (i: Interval) => `${f3(i.value)} [${f3(i.low)} ; ${f3(i.high)}]`;
const table = (header: string[], lines: string[][]) => [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...lines.map((l) => `| ${l.join(' | ')} |`)].join('\n');
const combine = (vs: readonly Verdict[]): Verdict => (vs.includes('NO-GO') ? 'NO-GO' : vs.includes('INCONCLUSIF') ? 'INCONCLUSIF' : 'GO');
const pad = (h: string | undefined) => (h ?? '').padStart(2, '0');

const inside = (r: Row, truthKey: string, tag: string, level: 80 | 95) => {
  const t = n(r[truthKey]);
  return level === 80 ? t >= n(r[`${tag}q10`]) && t <= n(r[`${tag}q90`]) : t >= n(r[`${tag}q025`]) && t <= n(r[`${tag}q975`]);
};
/** N2 flag: more than 5 % of the mass in the 10 last points of a bound; 'grid' = grid bounds (THRESHOLDS.md), 'support' = admissible-support bounds. */
const flaggedGrid = (r: Row) => n(r.low10) > 0.05 || n(r.high10) > 0.05;
const flaggedSupport = (r: Row) => n(r.slow10) > 0.05 || n(r.shigh10) > 0.05;
const n2Verdict = (p: Proportion): Verdict => (p.value <= 0.01 && p.high <= 0.02 ? 'GO' : p.low > 0.01 ? 'NO-GO' : 'INCONCLUSIF');

const TRUTH_BINS: Array<[string, number, number]> = [
  ['< −900', -Infinity, -900],
  ['−900 à −600', -900, -600],
  ['−600 à −300', -600, -300],
  ['−300 à 0', -300, 0],
  ['0 à 300', 0, 300],
  ['300 à 600', 300, 600],
  ['> 600', 600, Infinity],
];
const binOf = (t: number) => (TRUTH_BINS.find(([, lo, hi]) => t >= lo && t < hi) as [string, number, number])[0];

/** Columns of the phase 1 export compared bit for bit in the paired checks (grid 1 200 with the option vs phase 1 without it). */
const PHASE1_FIT_COLUMNS = ['q025', 'q10', 'q50', 'q90', 'q975', 'pit', 'low5', 'low10', 'high5', 'high10', 'nf_q025', 'nf_q10', 'nf_q50', 'nf_q90', 'nf_q975', 'nf_pit', 'nf_low5', 'nf_low10', 'nf_high5', 'nf_high10', 'truth_logged', 'truth_real', 'true_offset', 'u', 'real_intake'];
function pairedCheck(phase1: readonly Row[], replay: readonly Row[], key: (r: Row) => string): { compared: number; values: number; differences: number; missing: number } {
  const index = new Map(phase1.map((r) => [key(r), r]));
  let compared = 0;
  let values = 0;
  let differences = 0;
  let missing = 0;
  for (const r of replay) {
    const p = index.get(key(r));
    if (!p) {
      missing++;
      continue;
    }
    compared++;
    for (const c of PHASE1_FIT_COLUMNS) {
      values++;
      if (p[c] !== r[c]) differences++;
    }
  }
  return { compared, values, differences, missing };
}

it('builds the tables of phase 1b from the raw exports', () => {
  const md: string[] = ['# Batterie journal, phase 1b : tableaux', '', 'Généré par `tests/experiments-journal/1b/tables1b.experiment.ts` depuis les exports bruts de `tests/experiments-journal/results/` (n2g, n4g, sh, n3b, timing1b ; n2x2, n4x2, n3x2 de la phase 1). Seuils : `tests/experiments-journal/THRESHOLDS.md`, amendement 1 compris. IC : Wilson pour une proportion simple ; bootstrap par utilisateur (2 000 tirages, utilisateur tiré avec toutes ses lignes) pour les agrégats, moyennes, médianes, pentes et différences.', ''];
  const out: Record<string, unknown> = {};

  // ===========================================================================
  // s4.1 N2 by grid
  // ===========================================================================
  const n2g = load('n2g', 'n2g');
  const n2gStress = load('n2g', 'stress');
  if (n2g.length > 0) {
    const check = pairedCheck(load('n2x2', 'n2'), n2g.filter((r) => r.grid === '1200'), (r) => `${r.user}|${r.population}|${r.offset_law}|${r.horizon}`);
    const checkStress = pairedCheck(load('n2x2', 'stress'), n2gStress.filter((r) => r.grid === '1200'), (r) => `${r.user}|${r.population}|${r.horizon}`);
    out.n2gPairedCheck = { main: check, stress: checkStress };
    md.push('## Q1. N2 rejoué par grille (prototype, prior NASEM, utilisateurs de n2x2)', '', `Contrôle d'appariement : grille ±1 200 (option présente) contre n2x2 (phase 1, option absente), ${check.compared} lignes, ${check.values} valeurs comparées au caractère près, **${check.differences} différence(s)**, ${check.missing} ligne(s) sans correspondant. Stress : ${checkStress.compared} lignes, ${checkStress.differences} différence(s).`, '');
    const cellVerdicts: Array<{ grid: string; population: string; role: string; law: string; horizon: string; n: number; share: Proportion; verdict: Verdict; supportShare: Proportion; supportVerdict: Verdict }> = [];
    const lines: string[][] = [];
    for (const [key, rs] of groupBy(n2g, (r) => `${r.grid}|${r.role === 'principal' ? 0 : 1}|${r.population}|${r.offset_law}|${pad(r.horizon)}`)) {
      const [grid, , population, law, horizon] = key.split('|') as [string, string, string, string, string];
      const share = wilson(rs.filter(flaggedGrid).length, rs.length);
      const supportShare = wilson(rs.filter(flaggedSupport).length, rs.length);
      const c = { grid, population, role: rs[0]?.role as string, law, horizon: String(Number(horizon)), n: rs.length, share, verdict: n2Verdict(share), supportShare, supportVerdict: n2Verdict(supportShare) };
      cellVerdicts.push(c);
      const excluded = rs.map((r) => n(r.excluded_offsets));
      lines.push([`±${grid}`, population, c.role, law, c.horizon, String(rs.length), propPct(share), c.verdict, propPct(supportShare), c.supportVerdict, pct(rs.filter((r) => n(r.nf_low10) > 0.05 || n(r.nf_high10) > 0.05).length / rs.length), String(rs.filter((r) => Math.abs(n(r.truth_logged)) > n(grid)).length), `${f0(Math.min(...excluded))} / ${f0(median(excluded))} / ${f0(Math.max(...excluded))}`]);
    }
    lines.sort((a, b) => (a.join('|') < b.join('|') ? -1 : 1));
    md.push(table(['Grille', 'Population', 'Rôle', 'Loi', 'Horizon', 'n', 'Part signalée, bornes de la grille [Wilson]', 'Verdict', 'Part signalée, bornes du support admissible', 'Verdict (support)', 'Part sans plancher (grille)', 'Vérités hors grille', 'Offsets exclus min / méd. / max'], lines), '');
    const verdictsByGrid: Record<string, unknown> = {};
    const summary: string[][] = [];
    for (const grid of GRIDS) {
      const cs = cellVerdicts.filter((c) => c.grid === grid);
      const scope = (pred: (c: (typeof cs)[number]) => boolean, k: 'verdict' | 'supportVerdict' = 'verdict') => combine(cs.filter(pred).map((c) => c[k]));
      const principal = scope((c) => c.role === 'principal' && c.law === 'normal');
      const sensitivity = scope((c) => c.role === 'sensitivity');
      const t3 = scope((c) => c.law === 't3');
      const principalS = scope((c) => c.role === 'principal' && c.law === 'normal', 'supportVerdict');
      const sensitivityS = scope((c) => c.role === 'sensitivity', 'supportVerdict');
      const t3S = scope((c) => c.law === 't3', 'supportVerdict');
      verdictsByGrid[grid] = { principal, sensitivity, t3Variant: t3, verdict: combine([principal, sensitivity]), support: { principal: principalS, sensitivity: sensitivityS, t3Variant: t3S, verdict: combine([principalS, sensitivityS]) } };
      summary.push([`±${grid}`, principal, sensitivity, combine([principal, sensitivity]), t3, combine([principalS, sensitivityS]), t3S]);
    }
    out.N2g = { cells: cellVerdicts, byGrid: verdictsByGrid };
    md.push('### Verdict N2 par grille (loi normale, principales + sensibilité [S])', '', table(['Grille', 'Principales', 'Sensibilité [S]', 'Verdict N2', 'Variante t(3)', 'Verdict N2 (bornes du support)', 't(3) (support)'], summary), '');
    // Excluded offsets.
    const excl: string[][] = [];
    for (const grid of GRIDS) {
      const rs = n2g.filter((r) => r.grid === grid);
      const e = rs.map((r) => n(r.excluded_offsets));
      const supportMin = rs.map((r) => n(r.support_min));
      excl.push([`±${grid}`, String(rs.length), pct(e.filter((v) => v > 0).length / e.length), `${f0(Math.min(...e))} / ${f0(median(e))} / ${f0(Math.max(...e))}`, `${f0(Math.min(...supportMin))} / ${f0(median(supportMin))} / ${f0(Math.max(...supportMin))}`, f0(n(rs[0]?.grid_points))]);
    }
    md.push('### Offsets exclus par le domaine admissible (NASEM + offset ≤ 1 kcal/j, D-28), toutes lignes N2', '', table(['Grille', 'Lignes', 'Lignes avec ≥ 1 exclusion', 'Exclus min / méd. / max', 'Borne basse du support min / méd. / max', 'Points de grille'], excl), '');
    // Flagged users by grid.
    for (const grid of GRIDS) {
      const flagged = n2g.filter((r) => r.grid === grid && flaggedGrid(r));
      const flaggedS = n2g.filter((r) => r.grid === grid && flaggedSupport(r));
      const bound = (r: Row) => (n(r.low10) > 0.05 ? 'basse' : 'haute');
      const describe = (rs: Row[]) => {
        if (rs.length === 0) return 'aucun';
        const t = rs.map((r) => n(r.truth_logged));
        const it = rs.map((r) => n(r.real_intake));
        const u = rs.map((r) => n(r.u));
        const count = (k: string) => [...groupBy(rs, (r) => r[k] as string)].map(([v, x]) => `${v} ${x.length}`).join(', ');
        return `${rs.length} lignes (${new Set(rs.map((r) => r.user)).size} utilisateurs) ; vérité en unités de saisie de ${f0(Math.min(...t))} à ${f0(Math.max(...t))} (méd. ${f0(median(t))}) ; apport réel ${f0(Math.min(...it))} à ${f0(Math.max(...it))} ; u de ${f2(Math.min(...u))} à ${f2(Math.max(...u))} ; sexe : ${count('sex')} ; objectif : ${count('goal')} ; borne : ${[...groupBy(rs, bound)].map(([v, x]) => `${v} ${x.length}`).join(', ')}`;
      };
      out[`n2gFlagged${grid}`] = { gridBounds: flagged.length, supportBounds: flaggedS.length };
      md.push(`### Utilisateurs encore signalés, grille ±${grid}`, '', `- Bornes de la grille : ${describe(flagged)}.`, `- Bornes du support admissible : ${describe(flaggedS)}.`, '');
      const list = (rs: Row[]) => rs.sort((a, b) => n(a.truth_logged) - n(b.truth_logged)).map((r) => [r.population as string, r.offset_law as string, r.horizon as string, r.user as string, f0(n(r.truth_logged)), f0(n(r.true_offset)), f0(n(r.real_intake)), f3(n(r.u)), r.sex as string, r.goal as string, String(r.bmi_class), f3(n(r.low10)), f3(n(r.high10)), f3(n(r.slow10)), f3(n(r.shigh10)), f0(n(r.q50)), f0(n(r.support_min)), r.excluded_offsets as string]);
      const header = ['Population', 'Loi', 'Horizon', 'Utilisateur', 'Vérité (unités de saisie)', 'Offset vrai', 'Apport réel', 'u', 'Sexe', 'Objectif', 'IMC', 'Masse 10 pts basse (grille)', 'haute (grille)', 'basse (support)', 'haute (support)', 'Médiane', 'Borne basse du support', 'Offsets exclus'];
      const union = n2g.filter((r) => r.grid === grid && (flaggedGrid(r) || flaggedSupport(r)));
      if (union.length > 0) md.push('<details><summary>Liste</summary>', '', table(header, list(union)), '', '</details>', '');
    }
    // Stress.
    if (n2gStress.length > 0) {
      const sl = [...groupBy(n2gStress, (r) => `${r.population}|${pad(r.horizon)}|${r.grid}`)].map(([k, rs]) => {
        const [population, horizon, grid] = k.split('|') as [string, string, string];
        return [population, String(Number(horizon)), `±${grid}`, String(rs.length), pct(rs.filter(flaggedGrid).length / rs.length), pct(rs.filter(flaggedSupport).length / rs.length), f0(median(rs.map((r) => n(r.truth_logged)))), f0(median(rs.map((r) => n(r.q50) - n(r.truth_logged))))];
      });
      md.push('### Stress (sans seuil), trois grilles', '', table(['Cellule', 'Horizon', 'Grille', 'n', 'Part signalée (grille)', 'Part signalée (support)', 'Vérité médiane', 'Erreur médiane signée'], sl.sort((a, b) => (a.join('|') < b.join('|') ? -1 : 1))), '');
    }
  }

  // ===========================================================================
  // s4.2 N4 by grid
  // ===========================================================================
  const n4g = load('n4g', 'n4g');
  if (n4g.length > 0) {
    const check = pairedCheck(load('n4x2', 'n4'), n4g.filter((r) => r.grid === '1200'), (r) => `${r.user}|${r.population}|${r.horizon}|${r.prior}`);
    out.n4gPairedCheck = check;
    md.push('## Q1. N4 rejoué par grille (prototype, trois priors, utilisateurs de n4x2), diagnostic', '', `Contrôle d'appariement : grille ±1 200 (option présente) contre n4x2, ${check.compared} lignes, ${check.values} valeurs, **${check.differences} différence(s)**, ${check.missing} sans correspondant.`, '');
    const err = (r: Row) => n(r.q50) - n(r.truth_logged);
    const cells: unknown[] = [];
    const lines: string[][] = [];
    for (const [key, rs] of groupBy(n4g, (r) => `${r.population}|${pad(r.horizon)}|${r.prior}|${r.grid}`)) {
      const [population, horizon, prior, grid] = key.split('|') as [string, string, string, string];
      const bias = bootMean(rs, err);
      const medBias = bootMedian(rs, err);
      const mae = bootMedian(rs, (r) => Math.abs(err(r)));
      const c80 = wilson(rs.filter((r) => inside(r, 'truth_logged', '', 80)).length, rs.length);
      const c95 = wilson(rs.filter((r) => inside(r, 'truth_logged', '', 95)).length, rs.length);
      const width = median(rs.map((r) => n(r.q90) - n(r.q10)));
      const flags = [c80.high < 0.8 ? '80' : '', c95.high < 0.95 ? '95' : ''].filter(Boolean).join(', ');
      cells.push({ population, horizon: Number(horizon), prior, grid: Number(grid), n: rs.length, bias, medianBias: medBias, medianAbsError: mae, coverage80: c80, coverage95: c95, medianWidth80: width, flaggedUnderNominal: flags });
      lines.push([population, String(Number(horizon)), prior, `±${grid}`, String(rs.length), ci1(bias), ci1(medBias), ci0(mae), prop(c80), prop(c95), flags ? `**sous ${flags}**` : '', f0(width), pct(rs.filter(flaggedGrid).length / rs.length)]);
    }
    lines.sort((a, b) => (a.join('|') < b.join('|') ? -1 : 1));
    md.push('### Par population, horizon, prior et grille', '', 'Erreur = médiane du posterior (avec plancher) − vérité en unités de saisie. Couvertures par cellule : Wilson ; cellule signalée si la borne haute est sous le nominal (A1.2).', '', table(['Pop.', 'H', 'Prior', 'Grille', 'n', 'Biais moyen [IC]', 'Biais médian [IC]', 'Erreur médiane [IC]', 'Couv. 80 [Wilson]', 'Couv. 95 [Wilson]', 'Signal A1.2', 'Largeur 80 (méd.)', 'Part signalée N2 (grille)'], lines), '');
    // Aggregated coverage per (population, prior, grid) across horizons, A1.2 style (no verdict).
    const agg: string[][] = [];
    const aggData: unknown[] = [];
    for (const [key, rs] of groupBy(n4g, (r) => `${r.population}|${r.prior}|${r.grid}`)) {
      const [population, prior, grid] = key.split('|') as [string, string, string];
      const c80 = bootProportion(rs, (r) => inside(r, 'truth_logged', '', 80));
      const c95 = bootProportion(rs, (r) => inside(r, 'truth_logged', '', 95));
      aggData.push({ population, prior, grid: Number(grid), coverage80: c80, coverage95: c95 });
      agg.push([population, prior, `±${grid}`, String(rs.length), ci3(c80), ci3(c95)]);
    }
    md.push('### Couvertures agrégées sur les trois horizons (bootstrap par utilisateur, sans verdict)', '', table(['Pop.', 'Prior', 'Grille', 'Lignes', 'Couv. 80 [IC]', 'Couv. 95 [IC]'], agg.sort((a, b) => (a.join('|') < b.join('|') ? -1 : 1))), '');
    // Truth bins and slope, flat prior at 14 days.
    const binLines: string[][] = [];
    const slopeLines: string[][] = [];
    const binData: unknown[] = [];
    for (const pop of ['P00', 'P05', 'P10', 'P20']) {
      for (const grid of GRIDS) {
        const rs = n4g.filter((r) => r.population === pop && r.prior === 'flat' && r.horizon === '14' && r.grid === grid);
        const cellsB = TRUTH_BINS.map(([label]) => {
          const b = rs.filter((r) => binOf(n(r.truth_logged)) === label);
          return { label, n: b.length, bias: b.length > 0 ? mean(b.map(err)) : NaN };
        });
        const slope = bootSlope(rs, (r) => n(r.truth_logged), err);
        binData.push({ population: pop, grid: Number(grid), bins: cellsB, slope });
        binLines.push([pop, `±${grid}`, ...cellsB.map((c) => (c.n > 0 ? `${f0(c.bias)} (${c.n})` : '—'))]);
        slopeLines.push([pop, `±${grid}`, String(rs.length), ci3(slope)]);
      }
    }
    out.N4g = { cells, aggregated: aggData, flat14: binData };
    md.push('### Biais par tranche de vérité (unités de saisie), prior plat, 14 j', '', 'Biais moyen (effectif).', '', table(['Pop.', 'Grille', ...TRUTH_BINS.map(([l]) => l)], binLines), '');
    md.push('### Pente de la régression erreur ~ vérité, prior plat, 14 j', '', table(['Pop.', 'Grille', 'n', 'Pente [IC]'], slopeLines), '');
    // Recap (report s6): P10, P20, bias and coverage at 14, 28, 42 for each prior x grid.
    const recap: string[][] = [];
    for (const pop of ['P10', 'P20']) {
      for (const prior of ['nasem', 'flat', 'widened']) {
        for (const grid of GRIDS) {
          const row = [pop, prior, `±${grid}`];
          for (const h of ['14', '28', '42']) {
            const c = (cells as Array<{ population: string; horizon: number; prior: string; grid: number; bias: Interval; coverage80: Proportion; coverage95: Proportion }>).find((x) => x.population === pop && x.horizon === Number(h) && x.prior === prior && x.grid === Number(grid));
            row.push(c ? `${f0(c.bias.value)} [${f0(c.bias.low)} ; ${f0(c.bias.high)}] ; ${f2(c.coverage80.value)} / ${f2(c.coverage95.value)}` : '—');
          }
          recap.push(row);
        }
      }
    }
    md.push('### Récapitulatif P10 et P20 : biais moyen [IC] ; couverture 80 / 95, en unités de saisie', '', table(['Pop.', 'Prior', 'Grille', '14 j', '28 j', '42 j'], recap), '');
  }

  // ===========================================================================
  // s4.3 Timing
  // ===========================================================================
  const timing = load('timing1b', 'timing');
  if (timing.length > 0) {
    const q = (v: number[], p: number) => {
      const s = sortedCopy(v);
      const idx = p * (s.length - 1);
      return (s[Math.floor(idx)] as number) + ((s[Math.ceil(idx)] as number) - (s[Math.floor(idx)] as number)) * (idx - Math.floor(idx));
    };
    const tl: string[][] = [];
    const td: unknown[] = [];
    for (const grid of GRIDS) {
      const rs = timing.filter((r) => r.grid === grid);
      const call = rs.map((r) => n(r.call_ms));
      const fit = rs.map((r) => n(r.fit_ms));
      const d = { grid: Number(grid), n: rs.length, callP50: q(call, 0.5), callP95: q(call, 0.95), fitP50: q(fit, 0.5), fitP95: q(fit, 0.95), gridPointsMedian: median(rs.map((r) => n(r.grid_points))), excludedMedian: median(rs.map((r) => n(r.excluded_offsets))), weighIns: median(rs.map((r) => n(r.weigh_ins))) };
      td.push(d);
      tl.push([`±${grid}`, String(rs.length), f0(d.weighIns), `${f0(d.gridPointsMedian)} (${f0(d.excludedMedian)} exclus)`, f0(d.callP50), f0(d.callP95), f0(d.fitP50), f0(d.fitP95), f0(4 * d.callP50), f0(4 * d.callP95)]);
    }
    out.timing = td;
    md.push('## Q1. Temps de calcul d’un appel en régime journal (Node, un processus, rien d’autre en cours)', '', '84 jours, pesée quotidienne, journal complet, 50 profils du générateur (graines 700 000 / 710 000 + i). « Appel » = `computeJournalCalibration` (store → observations → porte → ajustement → snapshot). « Ajustement seul » = `fitCalibration` sur la même entrée.', '', table(['Grille', 'n', 'Pesées (méd.)', 'Points de grille (méd.)', 'Appel P50 (ms)', 'Appel P95 (ms)', 'Ajustement seul P50', 'Ajustement seul P95', 'Appel P50 × 4 [déduit]', 'Appel P95 × 4 [déduit]'], tl), '');
  }

  // ===========================================================================
  // s5 Short-horizon bias of the current path
  // ===========================================================================
  const sh = load('sh', 'sh');
  if (sh.length > 0) {
    const err = (r: Row) => n(r.q50) - n(r.truth_real);
    const ARMS = ['control', 'b1', 'b1p', 'b2', 'b3'];
    const armLabel: Record<string, string> = { control: 'témoin (NASEM, ±1 200)', b1: 'b1 (plat, ±1 200)', b1p: "b1' (plat, ±3 000)", b2: 'b2 (plat, ±3 000, 1re pesée exacte)', b3: 'b3 (plat, ±3 000, bruit 0,05 kg)' };
    const shift = sh.map((r) => Math.abs(n(r.reference_shift)));
    md.push('## Q2. Biais aux horizons courts, chemin actuel (monde N4, apport = cible, u = 0)', '', `Graines : profils 500 000, utilisateurs 510 000 + i ; ${new Set(sh.map((r) => r.user)).size} utilisateurs (pesée quotidienne pour i pair, tous les 3 j pour i impair). Erreur = médiane du posterior (avec plancher) − offset vrai (repère de l'estimateur). Écart de repère max : ${f3(Math.max(...shift))} kcal/j.`, '');
    const main: string[][] = [];
    const mainData: unknown[] = [];
    for (const arm of ARMS) {
      for (const h of ['14', '28', '42']) {
        const rs = sh.filter((r) => r.arm === arm && r.horizon === h);
        const bias = bootMean(rs, err);
        const med = bootMedian(rs, err);
        const nfBias = bootMean(rs, (r) => n(r.nf_q50) - n(r.truth_real));
        const meanBias = bootMean(rs, (r) => n(r.mean) - n(r.truth_real));
        const edge = wilson(rs.filter(flaggedGrid).length, rs.length);
        const edgeS = wilson(rs.filter(flaggedSupport).length, rs.length);
        mainData.push({ arm, horizon: Number(h), n: rs.length, bias, medianBias: med, biasNoFloorMedian: nfBias, biasPosteriorMean: meanBias, edgeGrid: edge, edgeSupport: edgeS });
        main.push([armLabel[arm] as string, h, String(rs.length), ci1(bias), ci1(med), ci1(nfBias), ci1(meanBias), f0(median(rs.map((r) => Math.abs(err(r))))), propPct(edge), propPct(edgeS)]);
      }
    }
    md.push('### Par bras et horizon', '', table(['Bras', 'H', 'n', 'Biais moyen [IC]', 'Biais médian [IC]', 'Biais moyen, médiane sans plancher', 'Biais moyen, moyenne du posterior', 'Erreur médiane', 'Masse aux bornes de la grille > 5 % [Wilson]', 'Masse aux bornes du support > 5 %'], main), '');
    // Paired differences.
    const diffs: string[][] = [];
    const diffData: unknown[] = [];
    const meanErr = (rows: readonly Row[]) => mean(rows.map(err));
    for (const [a, b, label] of [
      ['control', 'b1', 'b1 − témoin (prior plat)'],
      ['b1', 'b1p', "b1' − b1 (grille)"],
      ['b1p', 'b2', "b2 − b1' (1re pesée exacte)"],
      ['b1p', 'b3', "b3 − b1' (bruit 0,05 kg)"],
    ] as const) {
      for (const h of ['14', '28', '42']) {
        const d = bootPaired(
          sh.filter((r) => r.arm === a && r.horizon === h),
          sh.filter((r) => r.arm === b && r.horizon === h),
          meanErr,
        );
        diffData.push({ from: a, to: b, horizon: Number(h), deltaMeanBias: d });
        diffs.push([label, h, ci1(d)]);
      }
    }
    md.push('### Différences appariées de biais moyen', '', table(['Différence', 'H', 'Δ biais moyen [IC]'], diffs), '');
    // By frequency and goal.
    const strat: string[][] = [];
    for (const arm of ARMS) {
      for (const h of ['14', '28', '42']) {
        for (const [label, key] of [
          ['pesée', (r: Row) => `tous les ${r.weigh_every_days} j`],
          ['objectif', (r: Row) => r.goal as string],
        ] as Array<[string, (r: Row) => string]>) {
          for (const [k, rs] of groupBy(sh.filter((r) => r.arm === arm && r.horizon === h), key)) {
            strat.push([armLabel[arm] as string, h, label, k, String(rs.length), ci1(bootMean(rs, err)), ci1(bootMedian(rs, err))]);
          }
        }
      }
    }
    md.push('### Par fréquence de pesée et par objectif', '', table(['Bras', 'H', 'Strate', 'Niveau', 'n', 'Biais moyen [IC]', 'Biais médian [IC]'], strat), '');
    // Truth bins and slope.
    const bins: string[][] = [];
    const slopes: string[][] = [];
    const binData: unknown[] = [];
    for (const arm of ARMS) {
      for (const h of ['14', '28', '42']) {
        const rs = sh.filter((r) => r.arm === arm && r.horizon === h);
        const cellsB = TRUTH_BINS.map(([label]) => {
          const b = rs.filter((r) => binOf(n(r.truth_real)) === label);
          return { label, n: b.length, bias: b.length > 0 ? mean(b.map(err)) : NaN };
        });
        const slope = bootSlope(rs, (r) => n(r.truth_real), err);
        binData.push({ arm, horizon: Number(h), bins: cellsB, slope });
        bins.push([armLabel[arm] as string, h, ...cellsB.map((c) => (c.n > 0 ? `${f0(c.bias)} (${c.n})` : '—'))]);
        slopes.push([armLabel[arm] as string, h, ci3(slope)]);
      }
    }
    out.sh = { byArm: mainData, differences: diffData, truthBins: binData };
    md.push('### Biais par tranche de vérité (biais moyen, effectif)', '', table(['Bras', 'H', ...TRUTH_BINS.map(([l]) => l)], bins), '');
    md.push('### Pente erreur ~ vérité', '', table(['Bras', 'H', 'Pente [IC]'], slopes), '');
  }

  // ===========================================================================
  // s6 Over-confidence of the prototype, and s7 re-reading of phase 1 (after the fact)
  // ===========================================================================
  /** A1.2 verdicts on the pooled cells of one path or arm; per-cell Wilson with the under-nominal signal. */
  function coverageA12(rows: readonly Row[], truthKey: string) {
    const nf80 = bootProportion(rows, (r) => inside(r, truthKey, 'nf_', 80));
    const nf95 = bootProportion(rows, (r) => inside(r, truthKey, 'nf_', 95));
    const fl80 = bootProportion(rows, (r) => inside(r, truthKey, '', 80));
    const fl95 = bootProportion(rows, (r) => inside(r, truthKey, '', 95));
    const noFloor: Verdict = nf80.low <= 0.8 && nf80.high >= 0.8 && nf95.low <= 0.95 && nf95.high >= 0.95 ? 'GO' : 'NO-GO';
    const floor: Verdict = fl80.high >= 0.8 && fl95.high >= 0.95 ? 'GO' : 'NO-GO';
    return { users: byUser(rows).length, rows: rows.length, noFloor80: nf80, noFloor95: nf95, floor80: fl80, floor95: fl95, verdictNoFloor: noFloor, verdictFloor: floor, verdict: combine([noFloor, floor]) };
  }
  function cellLines(rows: readonly Row[], armKey: string, truthKey: string): { lines: string[][]; data: unknown[] } {
    const lines: string[][] = [];
    const data: unknown[] = [];
    for (const [key, rs] of groupBy(rows, (r) => `${r[armKey]}|${pad(r.horizon)}|${r.weigh_every_days}`)) {
      const [arm, horizon, freq] = key.split('|') as [string, string, string];
      const c = {
        nf80: wilson(rs.filter((r) => inside(r, truthKey, 'nf_', 80)).length, rs.length),
        nf95: wilson(rs.filter((r) => inside(r, truthKey, 'nf_', 95)).length, rs.length),
        fl80: wilson(rs.filter((r) => inside(r, truthKey, '', 80)).length, rs.length),
        fl95: wilson(rs.filter((r) => inside(r, truthKey, '', 95)).length, rs.length),
      };
      const sig = (p: Proportion, nominal: number) => (p.high < nominal ? ' **↓**' : '');
      data.push({ arm, horizon: Number(horizon), frequency: Number(freq), n: rs.length, ...c });
      lines.push([arm, String(Number(horizon)), `${freq} j`, String(rs.length), prop(c.nf80) + sig(c.nf80, 0.8), prop(c.nf95) + sig(c.nf95, 0.95), prop(c.fl80) + sig(c.fl80, 0.8), prop(c.fl95) + sig(c.fl95, 0.95), f0(mean(rs.map((r) => n(r.nf_q50) - n(r[truthKey])))), f0(median(rs.map((r) => n(r.nf_q90) - n(r.nf_q10))))]);
    }
    return { lines: lines.sort((a, b) => (a.join('|') < b.join('|') ? -1 : 1)), data };
  }
  const cellHeader = ['Bras', 'H', 'Pesée', 'n', 'Couv. 80 sans plancher [Wilson]', 'Couv. 95 sans plancher', 'Couv. 80 avec plancher', 'Couv. 95 avec plancher', 'Biais moyen (sans plancher)', 'Largeur 80 sans plancher (méd.)'];
  const aggHeader = ['Bras', 'Utilisateurs', 'Lignes', 'Couv. 80 sans plancher [IC]', 'Couv. 95 sans plancher [IC]', 'Verdict sans plancher', 'Couv. 80 avec plancher [IC]', 'Couv. 95 avec plancher [IC]', 'Verdict avec plancher', 'Verdict N3 (A1.2)'];
  const aggLine = (label: string, a: ReturnType<typeof coverageA12>, withVerdict: boolean) => [label, String(a.users), String(a.rows), ci3(a.noFloor80), ci3(a.noFloor95), withVerdict ? a.verdictNoFloor : '(diagnostic)', ci3(a.floor80), ci3(a.floor95), withVerdict ? a.verdictFloor : '(diagnostic)', withVerdict ? `**${a.verdict}**` : '—'];

  const n3b = load('n3b', 'n3b');
  if (n3b.length > 0) {
    const ARMS = ['current', 'p1', 'p2', 'p3', 'p4'];
    md.push('## Q3. Surconfiance du prototype (monde N3, u = 0)', '', `Graines : profils 600 000, utilisateurs 610 000 + i ; ${new Set(n3b.map((r) => r.user)).size} utilisateurs × 4 horizons. current = chemin actuel ; p1 = saisie exacte, glucides harness_scaled ; p2 = saisie exacte, glucides de base (D5) ; p3 = saisie bruitée 8 %, harness_scaled ; p4 = saisie bruitée, glucides de base (configuration de la phase 1). Critère N3 amendé par A1.2, verdict pour current et p1 seulement.`, '');
    const aggs: Record<string, ReturnType<typeof coverageA12>> = {};
    const aggL: string[][] = [];
    for (const arm of ARMS) {
      const a = coverageA12(n3b.filter((r) => r.arm === arm), 'truth_logged');
      aggs[arm] = a;
      aggL.push(aggLine(arm, a, arm === 'current' || arm === 'p1'));
    }
    md.push('### Couvertures agrégées sur les 8 cellules (bootstrap par utilisateur) et verdicts A1.2', '', table(aggHeader, aggL), '');
    const cl = cellLines(n3b, 'arm', 'truth_logged');
    md.push('### Cellules (sans verdict ; **↓** = borne haute de Wilson sous le nominal)', '', table(cellHeader, cl.lines), '');
    // Attribution: paired differences of pooled coverage vs p1.
    const cov = (tag: string, level: 80 | 95) => (rows: readonly Row[]) => rows.filter((r) => inside(r, 'truth_logged', tag, level)).length / rows.length;
    const attr: string[][] = [];
    const attrData: unknown[] = [];
    for (const [a, b, label] of [
      ['p1', 'p2', 'p2 − p1 (D5 seul)'],
      ['p1', 'p3', 'p3 − p1 (bruit de saisie seul)'],
      ['p1', 'p4', 'p4 − p1 (les deux)'],
      ['current', 'p1', 'p1 − chemin actuel'],
    ] as const) {
      const A = n3b.filter((r) => r.arm === a);
      const Bb = n3b.filter((r) => r.arm === b);
      const d = { nf80: bootPaired(A, Bb, cov('nf_', 80)), nf95: bootPaired(A, Bb, cov('nf_', 95)), fl80: bootPaired(A, Bb, cov('', 80)), fl95: bootPaired(A, Bb, cov('', 95)) };
      attrData.push({ from: a, to: b, ...d });
      attr.push([label, ci3(d.nf80), ci3(d.nf95), ci3(d.fl80), ci3(d.fl95)]);
    }
    md.push('### Attribution : différences appariées de couverture agrégée (diagnostic)', '', table(['Différence', 'Δ couv. 80 sans plancher [IC]', 'Δ couv. 95 sans plancher', 'Δ couv. 80 avec plancher', 'Δ couv. 95 avec plancher'], attr), '');
    // Normalised errors.
    const z = (tag: string) => (r: Row) => (n(r[`${tag}q50`]) - n(r.truth_logged)) / ((n(r[`${tag}q90`]) - n(r[`${tag}q10`])) / 2 / 1.2816);
    const zl: string[][] = [];
    const zData: unknown[] = [];
    for (const arm of ARMS) {
      for (const [key, rs] of groupBy(n3b.filter((r) => r.arm === arm), (r) => `${r.goal}|${pad(r.horizon)}`)) {
        const [goal, horizon] = key.split('|') as [string, string];
        const vNf = bootVariance(rs, z('nf_'));
        const vFl = bootVariance(rs, z(''));
        const mz = mean(rs.map(z('nf_')));
        zData.push({ arm, goal, horizon: Number(horizon), n: rs.length, varianceNoFloor: vNf, varianceFloor: vFl, meanNoFloor: mz });
        zl.push([arm, goal, String(Number(horizon)), String(rs.length), ci2(vNf), f2(mz), ci2(vFl)]);
      }
      const all = n3b.filter((r) => r.arm === arm);
      const vAll = bootVariance(all, z('nf_'));
      zData.push({ arm, goal: 'all', horizon: 'all', n: all.length, varianceNoFloor: vAll });
      zl.push([arm, 'tous', 'tous', String(all.length), ci2(vAll), f2(mean(all.map(z('nf_')))), ci2(bootVariance(all, z('')))]);
    }
    out.N3b = { aggregated: aggs, cells: cl.data, attribution: attrData, normalisedErrors: zData, verdicts: { current: aggs.current?.verdict, p1: aggs.p1?.verdict } };
    md.push('### Écarts normalisés (médiane − vérité) / (demi-largeur 80 % / 1,2816)', '', 'Variance attendue 1 si le posterior est calibré et gaussien.', '', table(['Bras', 'Objectif', 'H', 'n', 'Variance sans plancher [IC]', 'Moyenne sans plancher', 'Variance avec plancher [IC]'], zl), '');
  }

  const n3x2 = load('n3x2', 'n3');
  if (n3x2.length > 0) {
    md.push('## Relecture après coup de la phase 1 sous A1.2 (n3x2)', '', 'Relecture après coup : les règles de l’amendement 1 sont postérieures aux résultats de la phase 1. Aucun nouvel ajustement ; données `results/n3x2/`.', '');
    const aggL: string[][] = [];
    const data: Record<string, unknown> = {};
    for (const path of ['current', 'prototype']) {
      const a = coverageA12(n3x2.filter((r) => r.path === path), 'truth_logged');
      data[path] = a;
      aggL.push(aggLine(path, a, true));
    }
    const cl = cellLines(n3x2, 'path', 'truth_logged');
    out.N3x2AfterTheFact = { aggregated: data, cells: cl.data };
    md.push(table(aggHeader, aggL), '', '### Cellules (sans verdict ; **↓** = borne haute de Wilson sous le nominal)', '', table(cellHeader, cl.lines), '');
  }

  writeFileSync(`${JOURNAL_RESULTS_DIR}/tables1b.md`, `${md.join('\n')}\n`);
  writeFileSync(`${JOURNAL_RESULTS_DIR}/verdicts1b.json`, `${JSON.stringify(out, null, 2)}\n`);
  expect(md.length).toBeGreaterThan(3);
});
