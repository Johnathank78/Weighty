/**
 * Tables and verdicts of N1 to N4 (prompt 34 s5), rebuilt from the raw per-user exports only
 * (tests/experiments-journal/results/n1..n4/*.csv.gz), against the frozen thresholds of THRESHOLDS.md.
 * Writes results/tables.md and results/verdicts.json. No simulation, no fit.
 *
 * Statistics (THRESHOLDS.md, common rules): Wilson 95 % for proportions; paired bootstrap, 2 000 resamples, unit =
 * simulated user, percentile interval, fixed seed, for differences and medians (and for the mean signed bias).
 * Verdicts: GO / NO-GO / INCONCLUSIF (interval overlapping the threshold), never GO when inconclusive.
 *
 * Run: npx vitest run -c vitest.journal.config.ts tables
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { wilson } from '../helpers/intakeLoggingExperiment';
import type { Proportion } from '../helpers/intakeLoggingExperiment';
import { JOURNAL_RESULTS_DIR, readCsvGz } from '../helpers/journalExport';
import { createRng } from '../helpers/random';

type Row = Record<string, string>;
type Verdict = 'GO' | 'NO-GO' | 'INCONCLUSIF';
type Interval = { value: number; low: number; high: number };

const B = 2000;
/** First pass (n) and the doubled pass (2n) of the doubling rule, when it was run. */
const PASSES = [
  { suffix: '', label: 'passe 1 (n)' },
  { suffix: 'x2', label: 'passe 2 (2n, règle de doublement)' },
] as const;
const n = (v: string | undefined) => Number(v);

function load(dir: string, prefix: string): Row[] {
  const path = `${JOURNAL_RESULTS_DIR}/${dir}`;
  if (!existsSync(path)) return [];
  return readdirSync(path)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.csv.gz'))
    .sort()
    .flatMap((f) => readCsvGz(`${path}/${f}`));
}

const median = (v: readonly number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = (s.length - 1) / 2;
  return ((s[Math.floor(m)] as number) + (s[Math.ceil(m)] as number)) / 2;
};
const mean = (v: readonly number[]) => v.reduce((a, b) => a + b, 0) / v.length;

/** Percentile bootstrap of a statistic over users (paired: the statistic receives the resampled indices). */
function bootstrap(count: number, stat: (idx: readonly number[]) => number, seed: number): Interval {
  const rng = createRng(seed);
  const all = Array.from({ length: count }, (_, i) => i);
  const values: number[] = [];
  for (let b = 0; b < B; b++) {
    const idx: number[] = [];
    for (let j = 0; j < count; j++) idx.push(Math.floor(rng.next() * count));
    values.push(stat(idx));
  }
  values.sort((a, b) => a - b);
  return { value: stat(all), low: values[Math.floor(0.025 * B)] as number, high: values[Math.floor(0.975 * B)] as number };
}

/** Regularised upper incomplete gamma Q(a, x) (Numerical Recipes), for the chi-square p-value. */
function gammaQ(a: number, x: number): number {
  const lnGamma = (z: number) => {
    const c = [76.1800917294715, -86.5053203294168, 24.0140982408309, -1.23173957245015, 0.00120865097386618, -0.000005395239384953];
    let y = z;
    const t = z + 5.5 - (z + 0.5) * Math.log(z + 5.5);
    let s = 1.00000000019;
    for (const k of c) s += k / ++y;
    return -t + Math.log((2.506628274631 * s) / z);
  };
  if (x < a + 1) {
    let sum = 1 / a;
    let del = sum;
    let ap = a;
    for (let i = 0; i < 500; i++) {
      del *= x / ++ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  let b = x + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

const f0 = (v: number) => (Object.is(Math.round(v), -0) ? '0' : Math.round(v).toString());
const f1 = (v: number) => v.toFixed(1);
const f2 = (v: number) => v.toFixed(2);
const f3 = (v: number) => v.toFixed(3);
const pct = (v: number, d = 1) => `${(100 * v).toFixed(d)} %`;
const prop = (p: Proportion) => `${f3(p.value)} [${f3(p.low)} ; ${f3(p.high)}]`;
const propPct = (p: Proportion) => `${pct(p.value)} [${pct(p.low)} ; ${pct(p.high)}]`;
const ci0 = (i: Interval) => `${f0(i.value)} [${f0(i.low)} ; ${f0(i.high)}]`;
const ci1 = (i: Interval) => `${f1(i.value)} [${f1(i.low)} ; ${f1(i.high)}]`;
const table = (header: string[], lines: string[][]) => [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...lines.map((l) => `| ${l.join(' | ')} |`)].join('\n');

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

const combine = (vs: readonly Verdict[]): Verdict => (vs.includes('NO-GO') ? 'NO-GO' : vs.includes('INCONCLUSIF') ? 'INCONCLUSIF' : 'GO');

const STRATA: Array<[string, (r: Row) => string]> = [
  ['sexe', (r) => r.sex as string],
  ['classe IMC', (r) => r.bmi_class as string],
  ['activité', (r) => r.activity as string],
  ['objectif', (r) => r.goal as string],
  ['fréquence de pesée', (r) => `tous les ${r.weigh_every_days} j`],
  ['complétude du journal', (r) => pct(n(r.journal_completeness), 0)],
];

it('builds the tables and verdicts of N1 to N4 from the raw exports', () => {
  const md: string[] = ['# Batterie journal, phase 1 : tableaux et verdicts', '', 'Généré par `tests/experiments-journal/tables.experiment.ts` depuis les exports bruts de `tests/experiments-journal/results/`. Seuils : `tests/experiments-journal/THRESHOLDS.md`.', ''];
  const verdicts: Record<string, unknown> = {};

  // -------------------------------------------------------------------------
  // N1
  // -------------------------------------------------------------------------
  const n1 = load('n1', 'n1');
  if (n1.length > 0) {
    const d = (r: Row, a: string, b: string, q: string) => n(r[`${a}_${q}`]) - n(r[`${b}_${q}`]);
    const eq = ['q10', 'q50', 'q90'].map((q) => ({ q, maxAbs: Math.max(...n1.map((r) => Math.abs(d(r, 'scaled', 'harness', q)))) }));
    const eqMax = Math.max(...eq.map((e) => e.maxAbs));
    const eqVerdict: Verdict = eqMax <= 1 ? 'GO' : 'NO-GO';
    const d5 = n1.map((r) => d(r, 'baseline', 'scaled', 'q50'));
    const d5Abs = d5.map(Math.abs);
    const d5Max = Math.max(...d5Abs);
    const d5Over = d5Abs.filter((v) => v > 25).length;
    const d5Median = bootstrap(n1.length, (idx) => median(idx.map((i) => d5[i] as number)), 101);
    const gap = n1.map((r) => n(r.carb_gap_kcal));
    const mg = mean(gap);
    const md5 = mean(d5);
    const cov = mean(gap.map((g, i) => (g - mg) * ((d5[i] as number) - md5)));
    const slope = cov / mean(gap.map((g) => (g - mg) ** 2));
    const corr = cov / Math.sqrt(mean(gap.map((g) => (g - mg) ** 2)) * mean(d5.map((v) => (v - md5) ** 2)));
    const d5Verdict: Verdict = d5Max <= 25 ? 'GO' : 'NO-GO';
    const d5CiVerdict: Verdict = d5Median.low >= -25 && d5Median.high <= 25 ? 'GO' : d5Median.high < -25 || d5Median.low > 25 ? 'NO-GO' : 'INCONCLUSIF';
    verdicts.N1 = { fixtures: n1.length, equivalence: { maxAbsDeltaKcal: eqMax, byQuantile: eq, verdict: eqVerdict }, d5: { maxAbsDeltaMedianKcal: d5Max, fixturesOver25: d5Over, medianOfDeltas: d5Median, verdictPerFixture: d5Verdict, verdictOnMedianCi: d5CiVerdict, carbGapCorrelation: corr, slopeKcalPerCarbKcal: slope } };
    md.push('## N1 : équivalence du chemin', '', `${n1.length} fixtures (46 LHS, R et S à 28 et 42 j avec historique, « écart important » tous les jours, prise). Graines : profils 101 000, fixtures 110 000 + i.`, '');
    md.push(table(['Comparaison', 'q10 max |Δ|', 'médiane max |Δ|', 'q90 max |Δ|', 'Seuil', 'Verdict'], [['prototype (glucides harness) − harness 26', ...eq.map((e) => e.maxAbs.toExponential(2)), '≤ 1 kcal/j', eqVerdict]]), '');
    const byGoal = [...groupBy(n1, (r) => r.goal as string)].map(([g, rs]) => {
      const v = rs.map((r) => d(r, 'baseline', 'scaled', 'q50'));
      const gp = rs.map((r) => n(r.carb_gap_kcal));
      return [g, String(rs.length), f1(median(v)), f1(Math.min(...v)), f1(Math.max(...v)), f1(median(gp))];
    });
    md.push('### Effet de D5 (glucides de base − glucides harness), Δ de la médiane du posterior', '');
    md.push(table(['Objectif', 'n', 'Δ médian', 'Δ min', 'Δ max', 'écart glucidique médian (kcal/j)'], byGoal), '');
    md.push(`Max |Δ| = ${f1(d5Max)} kcal/j ; fixtures au-delà de 25 : ${d5Over} / ${n1.length}. Médiane des Δ ${ci1(d5Median)}. Corrélation Δ / écart glucidique : ${f3(corr)}, pente ${f3(slope)} kcal/j d'offset par kcal/j de glucides.`, '');
    md.push(`Verdict D5 (seuil par fixture, |Δ médiane| ≤ 25) : **${d5Verdict}**. Lecture sur l'IC de la médiane des Δ : ${d5CiVerdict}.`, '');
    const lines = n1.map((r) => [r.fixture as string, r.goal as string, r.horizon as string, f2(n(r.harness_q50)), (n(r.scaled_q50) - n(r.harness_q50)).toExponential(1), f1(n(r.baseline_q50) - n(r.scaled_q50)), f1(n(r.default_q50) - n(r.baseline_q50)), f1(n(r.carb_gap_kcal))]);
    md.push('<details><summary>Détail par fixture</summary>', '', table(['Fixture', 'Objectif', 'Horizon', 'Médiane harness', 'Δ équivalence', 'Δ D5', 'Δ sans historique (R, S)', 'Écart glucidique'], lines), '', '</details>', '');
  }

  // -------------------------------------------------------------------------
  // N2
  // -------------------------------------------------------------------------
  for (const pass of PASSES) {
  const n2 = load(`n2${pass.suffix}`, 'n2');
  const stress = load(`n2${pass.suffix}`, 'stress');
  if (n2.length > 0) {
    const V = `N2${pass.suffix}`;
    const flagged = (r: Row, tag = '') => n(r[`${tag}low10`]) > 0.05 || n(r[`${tag}high10`]) > 0.05;
    const flagged5 = (r: Row) => n(r.low5) > 0.05 || n(r.high5) > 0.05;
    const n2Verdict = (p: Proportion): Verdict => (p.value <= 0.01 && p.high <= 0.02 ? 'GO' : p.low > 0.01 ? 'NO-GO' : 'INCONCLUSIF');
    const cells: string[][] = [];
    const cellVerdicts: Array<{ population: string; role: string; law: string; horizon: string; n: number; share: Proportion; verdict: Verdict }> = [];
    for (const [key, rs] of groupBy(n2, (r) => `${r.population}|${r.offset_law}|${r.horizon}`)) {
      const [population, law, horizon] = key.split('|') as [string, string, string];
      const share = wilson(rs.filter((r) => flagged(r)).length, rs.length);
      const verdict = n2Verdict(share);
      cellVerdicts.push({ population, role: rs[0]?.role as string, law, horizon, n: rs.length, share, verdict });
      cells.push([population, rs[0]?.role as string, law, horizon, String(rs.length), propPct(share), pct(rs.filter(flagged5).length / rs.length), pct(rs.filter((r) => flagged(r, 'nf_')).length / rs.length), String(rs.filter((r) => Math.abs(n(r.truth_logged)) > 1200).length), String(rs.reduce((s, r) => s + n(r.offset_redraws ?? '0'), 0)), verdict]);
    }
    const scope = (pred: (c: (typeof cellVerdicts)[number]) => boolean) => combine(cellVerdicts.filter(pred).map((c) => c.verdict));
    const principal = scope((c) => c.role === 'principal' && c.law === 'normal');
    const sensitivity = scope((c) => c.role === 'sensitivity');
    const t3 = scope((c) => c.law === 't3');
    verdicts[V] = { pass: pass.label, cells: cellVerdicts, principal, sensitivity, t3Variant: t3, verdict: combine([principal, sensitivity]), verdictIncludingT3: combine([principal, sensitivity, t3]) };
    md.push(`## N2 : support et masse aux bornes (prototype, prior NASEM), ${pass.label}`, '', `n = ${n2.filter((r) => r.population === 'P00' && r.offset_law === 'normal' && r.horizon === '28').length} par population et par horizon (28 et 84 j), pesée quotidienne ou tous les 3 j en alternance. Graines : profils 200 000, utilisateurs 210 000 + i. Critère : part d'utilisateurs avec plus de 5 % de masse dans les 10 derniers points d'une borne de la grille d'offset (posterior avec plancher).`, '');
    md.push(table(['Population', 'Rôle', 'Loi de l’offset', 'Horizon', 'n', 'Part > 5 % (10 pts) [Wilson]', 'Part > 5 % (5 pts)', 'Part sans plancher (10 pts)', 'Vérités hors grille', 'Retirages', 'Verdict'], cells.sort()), '');
    md.push(`Verdict N2, ${pass.label} (principales + sensibilité [S], loi normale) : **${String((verdicts[V] as { verdict: Verdict }).verdict)}** (principales ${principal}, sensibilité ${sensitivity}). Variante t(3) : ${t3}.`, '');
    const strat: string[][] = [];
    const base = n2.filter((r) => r.role === 'principal' && r.offset_law === 'normal');
    for (const [label, key] of [...STRATA, ['horizon', (r: Row) => `${r.horizon} j`] as [string, (r: Row) => string], ['population', (r: Row) => r.population as string] as [string, (r: Row) => string]]) {
      for (const [k, rs] of groupBy(base, key)) strat.push([label, k, String(rs.length), propPct(wilson(rs.filter((r) => flagged(r)).length, rs.length))]);
    }
    md.push('### Stratification (populations principales, loi normale, deux horizons)', '', table(['Strate', 'Niveau', 'n', 'Part > 5 % (10 pts)'], strat), '');
    if (stress.length > 0) {
      const lines = [...groupBy(stress, (r) => `${r.population}|${r.horizon}`)].map(([k, rs]) => {
        const [population, horizon] = k.split('|') as [string, string];
        return [population, horizon, String(rs.length), pct(rs.filter((r) => flagged(r)).length / rs.length), f3(mean(rs.map((r) => n(r.low10) + n(r.high10)))), f0(median(rs.map((r) => n(r.truth_logged)))), f0(median(rs.map((r) => n(r.q50) - n(r.truth_logged))))];
      });
      md.push('### Stress (rapporté, sans seuil) : u de −40 % à +20 %, apport réel = cible ou 3 500 kcal/j', '', table(['Cellule', 'Horizon', 'n', 'Part > 5 % (10 pts)', 'Masse moyenne aux bornes (10 pts)', 'Vérité médiane', 'Erreur médiane signée'], lines), '');
    }
  }
  }

  // -------------------------------------------------------------------------
  // N3
  // -------------------------------------------------------------------------
  for (const pass of PASSES) {
  const n3 = load(`n3${pass.suffix}`, 'n3');
  if (n3.length > 0) {
    const V = `N3${pass.suffix}`;
    const inside = (r: Row, tag: string, level: 80 | 95) => {
      const t = n(r.truth_logged);
      return level === 80 ? t >= n(r[`${tag}q10`]) && t <= n(r[`${tag}q90`]) : t >= n(r[`${tag}q025`]) && t <= n(r[`${tag}q975`]);
    };
    const cellRows: string[][] = [];
    const pitRows: string[][] = [];
    const cells: Array<{ path: string; horizon: string; frequency: string; n: number; noFloor80: Proportion; noFloor95: Proportion; floor80: Proportion; floor95: Proportion; verdictNoFloor: Verdict; verdictFloor: Verdict; chi2: { statistic: number; p: number } }> = [];
    for (const [key, rs] of groupBy(n3, (r) => `${r.path}|${(r.horizon ?? '').padStart(2, '0')}|${r.weigh_every_days}`)) {
      const [path, horizon, frequency] = key.split('|') as [string, string, string];
      const nf80 = wilson(rs.filter((r) => inside(r, 'nf_', 80)).length, rs.length);
      const nf95 = wilson(rs.filter((r) => inside(r, 'nf_', 95)).length, rs.length);
      const fl80 = wilson(rs.filter((r) => inside(r, '', 80)).length, rs.length);
      const fl95 = wilson(rs.filter((r) => inside(r, '', 95)).length, rs.length);
      const verdictNoFloor: Verdict = nf80.low <= 0.8 && nf80.high >= 0.8 && nf95.low <= 0.95 && nf95.high >= 0.95 ? 'GO' : 'NO-GO';
      const floorOne = (p: Proportion, thr: number): Verdict => (p.low >= thr ? 'GO' : p.high < thr ? 'NO-GO' : 'INCONCLUSIF');
      const verdictFloor = combine([floorOne(fl80, 0.78), floorOne(fl95, 0.93)]);
      const bins = new Array<number>(10).fill(0);
      for (const r of rs) {
        const b = Math.min(9, Math.floor(n(r.nf_pit) * 10));
        bins[b] = (bins[b] as number) + 1;
      }
      const expected = rs.length / 10;
      const statistic = bins.reduce((s, o) => s + (o - expected) ** 2 / expected, 0);
      const chi2 = { statistic, p: gammaQ(4.5, statistic / 2) };
      cells.push({ path, horizon: String(Number(horizon)), frequency, n: rs.length, noFloor80: nf80, noFloor95: nf95, floor80: fl80, floor95: fl95, verdictNoFloor, verdictFloor, chi2 });
      const errors = rs.map((r) => n(r.nf_q50) - n(r.truth_logged));
      cellRows.push([path, String(Number(horizon)), `${frequency} j`, String(rs.length), prop(nf80), prop(nf95), verdictNoFloor, prop(fl80), prop(fl95), verdictFloor, f0(mean(errors)), f0(median(errors.map(Math.abs))), f0(median(rs.map((r) => n(r.nf_q90) - n(r.nf_q10)))), f0(median(rs.map((r) => n(r.q90) - n(r.q10)))), pct(rs.filter((r) => r.gate_met === '1').length / rs.length, 0)]);
      pitRows.push([path, String(Number(horizon)), `${frequency} j`, bins.join(' / '), f1(statistic), chi2.p.toExponential(2)]);
    }
    const byPath = (path: string) => ({ noFloor: combine(cells.filter((c) => c.path === path).map((c) => c.verdictNoFloor)), floor: combine(cells.filter((c) => c.path === path).map((c) => c.verdictFloor)) });
    const current = byPath('current');
    const prototype = byPath('prototype');
    verdicts[V] = { pass: pass.label, cells, current: { ...current, verdict: combine([current.noFloor, current.floor]) }, prototype: { ...prototype, verdict: combine([prototype.noFloor, prototype.floor]) } };
    md.push(`## N3 : monde bien spécifié, ${pass.label}`, '', `n = ${n3.filter((r) => r.path === 'current' && r.horizon === '14' && r.weigh_every_days === '1').length} par horizon × fréquence, sur le chemin actuel et sur le prototype (u = 0). Graines : profils 300 000, utilisateurs 310 000 + i. Sans plancher = posterior d'information (structuralSdKcal = 0).`, '');
    md.push(table(['Chemin', 'Horizon', 'Pesée', 'n', 'Couv. 80 sans plancher [Wilson]', 'Couv. 95 sans plancher', 'Verdict sans plancher', 'Couv. 80 avec plancher', 'Couv. 95 avec plancher', 'Verdict avec plancher', 'Biais (sans plancher)', 'Erreur médiane', 'Largeur 80 sans plancher', 'Largeur 80 avec plancher', 'Porte'], cellRows.sort()), '');
    md.push(`Verdict N3, ${pass.label} : chemin actuel **${combine([current.noFloor, current.floor])}** (sans plancher ${current.noFloor}, avec plancher ${current.floor}) ; prototype **${combine([prototype.noFloor, prototype.floor])}** (sans plancher ${prototype.noFloor}, avec plancher ${prototype.floor}).`, '');
    md.push('### Histogramme des rangs du vrai offset dans le posterior sans plancher (10 classes, χ² à 9 ddl)', '', table(['Chemin', 'Horizon', 'Pesée', 'Effectifs par décile', 'χ²', 'p'], pitRows.sort()), '');
    const strat: string[][] = [];
    for (const path of ['current', 'prototype']) {
      for (const [label, key] of STRATA) {
        for (const [k, rs] of groupBy(n3.filter((r) => r.path === path), key)) strat.push([path, label, k, String(rs.length), prop(wilson(rs.filter((r) => inside(r, 'nf_', 80)).length, rs.length)), prop(wilson(rs.filter((r) => inside(r, 'nf_', 95)).length, rs.length)), prop(wilson(rs.filter((r) => inside(r, '', 80)).length, rs.length))]);
      }
    }
    md.push('### Stratification (tous horizons confondus)', '', table(['Chemin', 'Strate', 'Niveau', 'n', 'Couv. 80 sans plancher', 'Couv. 95 sans plancher', 'Couv. 80 avec plancher'], strat), '');
  }
  }

  // -------------------------------------------------------------------------
  // N4
  // -------------------------------------------------------------------------
  for (const pass of PASSES) {
  const n4 = load(`n4${pass.suffix}`, 'n4');
  if (n4.length > 0) {
    const V = `N4${pass.suffix}`;
    const lines: string[][] = [];
    const cells: Array<{ population: string; horizon: string; prior: string; n: number; bias: Interval; medianAbsError: Interval; coverage80: Proportion; coverage95: Proportion; medianWidth80: number; attribution?: string }> = [];
    let seed = 400;
    for (const [key, rs] of groupBy(n4, (r) => `${r.population}|${(r.horizon ?? '').padStart(2, '0')}|${r.prior}`)) {
      const [population, horizon, prior] = key.split('|') as [string, string, string];
      const err = rs.map((r) => n(r.q50) - n(r.truth_logged));
      const bias = bootstrap(rs.length, (idx) => mean(idx.map((i) => err[i] as number)), seed++);
      const mae = bootstrap(rs.length, (idx) => median(idx.map((i) => Math.abs(err[i] as number))), seed++);
      const t = (r: Row) => n(r.truth_logged);
      const c80 = wilson(rs.filter((r) => t(r) >= n(r.q10) && t(r) <= n(r.q90)).length, rs.length);
      const c95 = wilson(rs.filter((r) => t(r) >= n(r.q025) && t(r) <= n(r.q975)).length, rs.length);
      const width = median(rs.map((r) => n(r.q90) - n(r.q10)));
      const attribution = prior === 'flat' ? (bias.low >= -15 && bias.high <= 15 ? 'attribué au prior' : bias.high < -15 || bias.low > 15 ? 'non attribué au prior' : 'INCONCLUSIF') : undefined;
      cells.push({ population, horizon: String(Number(horizon)), prior, n: rs.length, bias, medianAbsError: mae, coverage80: c80, coverage95: c95, medianWidth80: width, ...(attribution ? { attribution } : {}) });
      lines.push([population, String(Number(horizon)), prior, String(rs.length), ci1(bias), ci0(mae), prop(c80), prop(c95), f0(width), attribution ?? '']);
    }
    // Cost of the widened prior for P00 at 14 and 28 days (paired by user).
    const cost: string[][] = [];
    const costData: unknown[] = [];
    for (const h of ['14', '28']) {
      const pick = (prior: string) => n4.filter((r) => r.population === 'P00' && r.horizon === h && r.prior === prior).sort((a, b) => n(a.user) - n(b.user));
      const nasem = pick('nasem');
      const wide = pick('widened');
      const w = (r: Row) => n(r.q90) - n(r.q10);
      const e = (r: Row) => Math.abs(n(r.q50) - n(r.truth_logged));
      const dWidth = bootstrap(nasem.length, (idx) => median(idx.map((i) => w(wide[i] as Row))) - median(idx.map((i) => w(nasem[i] as Row))), 900 + Number(h));
      const dErr = bootstrap(nasem.length, (idx) => median(idx.map((i) => e(wide[i] as Row))) - median(idx.map((i) => e(nasem[i] as Row))), 950 + Number(h));
      costData.push({ horizon: Number(h), deltaMedianWidth80: dWidth, deltaMedianAbsError: dErr });
      cost.push([h, ci0(dWidth), ci1(dErr)]);
    }
    verdicts[V] = { pass: pass.label, cells, widenedPriorCostP00: costData };
    md.push(`## N4 : attribution du biais en unités de saisie (diagnostic, non bloquant), ${pass.label}`, '', `n = ${n4.filter((r) => r.population === 'P00' && r.horizon === '14' && r.prior === 'nasem').length} par population × horizon (mêmes utilisateurs pour les trois priors et les quatre populations). Graines : profils 400 000, utilisateurs 410 000 + i. Biais = moyenne de (médiane − vérité en unités de saisie), IC bootstrap.`, '');
    md.push(table(['Population', 'Horizon', 'Prior', 'n', 'Biais signé [IC]', 'Erreur médiane [IC]', 'Couv. 80 [Wilson]', 'Couv. 95', 'Largeur 80 (méd.)', 'Attribution (prior plat, |biais| ≤ 15)'], lines.sort()), '');
    md.push('### Coût du prior élargi pour P00 (élargi − NASEM, apparié)', '', table(['Horizon', 'Δ largeur 80 médiane [IC]', 'Δ erreur médiane [IC]'], cost), '');
    const strat: string[][] = [];
    for (const prior of ['nasem', 'flat']) {
      for (const [label, key] of STRATA) {
        for (const [k, rs] of groupBy(n4.filter((r) => r.prior === prior), key)) {
          const err = rs.map((r) => n(r.q50) - n(r.truth_logged));
          strat.push([prior, label, k, String(rs.length), f1(mean(err)), f0(median(err.map(Math.abs))), prop(wilson(rs.filter((r) => n(r.truth_logged) >= n(r.q10) && n(r.truth_logged) <= n(r.q90)).length, rs.length))]);
        }
      }
    }
    md.push('### Stratification (toutes populations et horizons confondus)', '', table(['Prior', 'Strate', 'Niveau', 'n', 'Biais signé', 'Erreur médiane', 'Couv. 80'], strat), '');
  }
  }

  writeFileSync(`${JOURNAL_RESULTS_DIR}/tables.md`, `${md.join('\n')}\n`);
  writeFileSync(`${JOURNAL_RESULTS_DIR}/verdicts.json`, `${JSON.stringify(verdicts, null, 2)}\n`);
  expect(md.length).toBeGreaterThan(3);
});
