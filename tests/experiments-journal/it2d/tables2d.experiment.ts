/**
 * Iteration 2d (prompt 41 s11): tables and verdicts rebuilt from the raw exports only
 * (tests/experiments-journal/results/it2d/<dir>/<job>-shard<k>.csv.gz). Committed before any measurement.
 * Run: npx vitest run -c vitest.journal.config.ts it2d/tables2d   (IT2D_TABLES_DIR: another results directory)
 * Writes results/it2d/tables2d.md and results/it2d/verdicts2d.json. A section is written only when its raw files exist;
 * when the doubled pass of a step exists (A7.4, A1.3), the verdict rests on it alone and the first pass is reported.
 *
 * Definitions (THRESHOLDS.md, amendments 4 to 7; prompt 41), fixed before any measurement:
 * - judged population (A7.2): non-followers whose revision proposal was accepted (switched), weighed every day (density 1.00
 *   fixed by the jobs); users without a proposal are counted apart.
 * - ratio (A4.1): tissue ratio of each 4-week block (tratio_b1 to tratio_b5), windows weeks 5-12 (blocks 1-2) and 13-24
 *   (blocks 3-5); a block where the goal of the plan in force changes is excluded (A5.4) and counted; all blocks of the
 *   windows enter NI and S1 (A6.5).
 * - NI (A7.4): paired difference J* - C of the pooled medians of |ratio - 1| (bootstrap of users with ratios in both arms,
 *   2 000 resamples), upper bound <= +0.05, in each cell goal (loss, gain) x window x behaviour; H2a and H2b: weeks 13-24 only.
 * - Safety of J* (A7.4): S3-P, S3-D, S4-P (plan floor = floor x 1.10) and S4-J, on the period after the first J* plan (A6.5,
 *   columns *_ref with the reference day of arm JS = first J* plan), in each behaviour judged and each population (strictest
 *   reading of "dans chaque comportement jugé et chaque population"); V4: in each sensitivity x behaviour. S3-P and S4-P are
 *   invariants (0); S3-D bootstrap share of user-blocks, upper bound <= 5 %; S4-J Wilson on the users with a plan period of
 *   7 days or more, <= 1 % and upper bound <= 2 %.
 * - S1 of J* (A7.4): R0, R15 and R30 pooled, per goal and window, median ratio with its CI inside [0.85, 1.15].
 * - Statuses (A7.4, stats2r.ts): GO / NO-GO / INCONCLUSIF; a criterion without a user to judge is NON JUGEABLE = NO-GO. Step:
 *   NO-GO if a criterion is NO-GO, else INCONCLUSIF if one is, else GO. INCONCLUSIF: one doubled pass (2 x n, new seeds);
 *   still INCONCLUSIF: not GO. Decision (A7.5): J* retained if V1, V2, V3 and V4 are GO.
 * - Reported (A7.6, s8): cells where J* is better (upper bound of delta < 0); criteria of C (S1, S3-P, S3-D, S4-P, S4-J with
 *   the minimum margin); h (distribution at the first J* plan, bounds, error); M (error in logged units, weekly change of
 *   M / h); share of switched users past the level-2 gate and day of the first J* plan; S2, S7, guardrails, minimum true BMI,
 *   ends under BMI 20; stratification of delta (pooled goals) by sex, BMI class, activity, goal, requested rate, shift s,
 *   declared share, behaviour, population, quartile of h at the first J* plan.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { bootstrapQuantile, f0, f1, f3, goalFr, median, pairedMedianDiff, pc, quantile, readAll, sortNum, wilson } from '../it2b/stats2b';
import type { Row } from '../it2b/stats2b';
import { bootstrapShare, dispersion } from '../it2c/stats2c';
import { bandStatus, combine, invariantStatus, s4jStatus, upperStatus } from '../it2r/stats2r';
import type { Status } from '../it2r/stats2r';
import { IT2D_DIR } from './jobs2d';

export const SEED_2D = 41_000_001;
const DIR = process.env.IT2D_TABLES_DIR ?? IT2D_DIR;
const GOALS = ['loss', 'gain'] as const;
const WINDOWS = [
  { key: 'w1', label: 'sem. 5-12', blocks: [1, 2] },
  { key: 'w2', label: 'sem. 13-24', blocks: [3, 4, 5] },
] as const;
type Window = (typeof WINDOWS)[number];
const R_BEHAVIORS = ['R0', 'R15', 'R30'];
const H_BEHAVIORS = ['H1', 'H2a', 'H2b', 'H3'];
const windowsOf = (b: string): readonly Window[] => (b === 'H2a' || b === 'H2b' ? [WINDOWS[1]] : WINDOWS);

const md: string[] = [];
const verdicts: Record<string, unknown> = {};
const n = (r: Row, k: string) => (r[k] === undefined || r[k] === '' ? Number.NaN : Number(r[k]));
const ukey = (r: Row) => `${r.job}:${r.job_index}`;
const switched = (r: Row) => r.proposal_day !== '' && r.accepted === '1';
const ci = (s: { value: number; lo: number; hi: number }) => `${f3(s.value)} [${f3(s.lo)} ; ${f3(s.hi)}]`;
const pci = (s: { p: number; lo: number; hi: number }) => `${pc(s.p)} [${pc(s.lo)} ; ${pc(s.hi)}]`;
const table = (head: string[], rows: string[][]) => {
  md.push(`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`), '');
};

function ratios(r: Row, w: Window): number[] {
  const out: number[] = [];
  for (const k of w.blocks) {
    if (r[`goal_change_b${k}`] === '1') continue;
    const v = n(r, `tratio_b${k}`);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}
const absDev = (v: readonly number[]) => v.map((x) => Math.abs(x - 1));
const excludedBlocks = (rows: readonly Row[]) => rows.reduce((s, r) => s + [1, 2, 3, 4, 5].filter((k) => r[`goal_change_b${k}`] === '1').length, 0);

const load = (dir: string, job: string): Row[] => readAll(`${DIR}/${dir}`, job);
function judged(dir: string, job: string): { rows: Row[]; job: string; first: Row[] | null } {
  const x2 = load(dir, `${job}x2`);
  if (x2.length > 0) return { rows: x2, job: `${job}x2`, first: load(dir, job) };
  return { rows: load(dir, job), job, first: null };
}
const armRows = (rows: readonly Row[], arm: string, pred: (r: Row) => boolean = () => true) => rows.filter((r) => r.arm === arm && pred(r));
function pairs(rows: readonly Row[], a: string, b: string, pred: (r: Row) => boolean): Array<{ ra: Row; rb: Row }> {
  const byKey = new Map<string, Record<string, Row>>();
  for (const r of rows) {
    const m = byKey.get(ukey(r)) ?? {};
    m[r.arm as string] = r;
    byKey.set(ukey(r), m);
  }
  const out: Array<{ ra: Row; rb: Row }> = [];
  for (const m of byKey.values()) if (m[a] && m[b] && pred(m[a] as Row)) out.push({ ra: m[a] as Row, rb: m[b] as Row });
  return out;
}

// ---------------------------------------------------------------------------
// Criteria
// ---------------------------------------------------------------------------

type Crit = { name: string; value: string; status: Status | 'rapporté' };
const statuses = (crits: readonly Crit[]) => crits.map((c) => c.status).filter((s): s is Status => s !== 'rapporté');

function s1(rows: readonly Row[], goal: string, w: Window) {
  const st = bootstrapQuantile(
    rows.filter((r) => r.goal === goal).map((r) => ratios(r, w)),
    0.5,
    SEED_2D,
  );
  return { st, status: bandStatus(st, [0.85, 1.15], st.users) };
}
function s1Crits(rows: readonly Row[], label: string): Crit[] {
  const out: Crit[] = [];
  for (const goal of GOALS) {
    for (const w of WINDOWS) {
      const r = s1(rows, goal, w);
      out.push({ name: `S1 ${label} ${goalFr(goal)}, ${w.label}`, value: `${ci(r.st)} (n = ${r.st.users} ; P10 / P90 ${f3(r.st.p10)} / ${f3(r.st.p90)})`, status: r.status });
    }
  }
  return out;
}
/** S3-P, S3-D, S4-P, S4-J from the reference day (A6.5, A7.4). */
function safetyCrits(rows: readonly Row[], label: string): Crit[] {
  const checks = rows.reduce((s, r) => s + (n(r, 's3p_checks_ref') || 0), 0);
  const viol = rows.reduce((s, r) => s + (n(r, 's3p_viol_ref') || 0), 0);
  const exempt = rows.reduce((s, r) => s + (n(r, 's3p_exempt') || 0), 0);
  const withRef = rows.filter((r) => r.ref2r !== '');
  const share = bootstrapShare(rows.map((r) => [n(r, 's3d_over_ref') || 0, n(r, 's3d_blocks_ref') || 0] as const), SEED_2D);
  const days = rows.reduce((s, r) => s + (n(r, 's4p_days_ref') || 0), 0);
  const jr = rows.filter((r) => n(r, 's4j_periods') > 0);
  const k = jr.filter((r) => n(r, 's4j_below') > 0).length;
  const w = wilson(k, jr.length);
  const margins = sortNum(jr.map((r) => n(r, 's4j_min_margin')));
  return [
    { name: `S3-P [S] ${label}`, value: `${viol} violation(s) sur ${checks} évaluations (${withRef.length} utilisateurs) ; exemptées : ${exempt}`, status: invariantStatus(viol, checks) },
    { name: `S3-D [S] ${label}`, value: `${share.k} / ${share.n} utilisateurs-blocs = ${pci(share)} (${share.users} utilisateurs)`, status: upperStatus(share, 0.05, share.users) },
    { name: `S4-P [S] ${label}`, value: `${days} jour(s) (${withRef.length} utilisateurs)`, status: invariantStatus(days, withRef.length) },
    { name: `S4-J [S] ${label}`, value: `${k} / ${jr.length} = ${pci(w)} ; marge minimale ${f1(margins[0] ?? Number.NaN)} kcal/j, P1 ${f1(quantile(margins, 0.01))}`, status: s4jStatus(w, jr.length) },
  ];
}
function pairedAbs(ps: ReadonlyArray<{ ra: Row; rb: Row }>, goal: string | null, w: Window) {
  const sel = ps.filter((p) => goal === null || p.ra.goal === goal).map((p) => ({ a: absDev(ratios(p.ra, w)), b: absDev(ratios(p.rb, w)) }));
  const d = pairedMedianDiff(sel, SEED_2D);
  const users = sel.filter((p) => p.a.length > 0 && p.b.length > 0);
  return { ...d, users: users.length, medA: median(users.flatMap((p) => p.a)), medB: median(users.flatMap((p) => p.b)) };
}
/** NI (A7.4): cells goal x window of one behaviour; J* better (upper bound < 0) flagged. */
function niCrits(rows: readonly Row[], behavior: string, better: string[]): Crit[] {
  const ps = pairs(rows, 'C', 'JS', (r) => switched(r) && r.behavior_ps === behavior);
  const out: Crit[] = [];
  for (const goal of GOALS) {
    for (const w of windowsOf(behavior)) {
      const d = pairedAbs(ps, goal, w);
      const name = `NI ${behavior} ${goalFr(goal)}, ${w.label}`;
      if (d.users > 0 && d.hi < 0) better.push(name);
      out.push({ name, value: `C ${f3(d.medA)} → J* ${f3(d.medB)} ; Δ ${ci(d)} (n = ${d.users})${d.users > 0 && d.hi < 0 ? ' ; J* meilleur' : ''}`, status: upperStatus(d, 0.05, d.users) });
    }
  }
  return out;
}
function critTable(title: string, crits: readonly Crit[]) {
  md.push(`**${title}**`, '');
  table(
    ['Critère', 'Valeur [IC 95 %]', 'Statut'],
    crits.map((c) => [c.name, c.value, c.status]),
  );
}
const reported = (crits: readonly Crit[]) => crits.map((c) => ({ ...c, status: 'rapporté' as const }));

// ---------------------------------------------------------------------------
// Reported tables
// ---------------------------------------------------------------------------

function populationLine(rows: readonly Row[]) {
  const c = armRows(rows, 'C');
  const sw = c.filter(switched);
  const js = armRows(rows, 'JS', switched);
  const withPlan = js.filter((r) => r.js_first_day !== '');
  const cont = armRows(rows, 'JS').filter((r) => r.cont_mismatch !== '' && r.cont_mismatch !== undefined).length;
  md.push(
    `Non-suiveurs : ${c.length} ; basculés (proposition acceptée) : ${sw.length} ; sans proposition : ${c.filter((r) => r.proposal_day === '').length}. Basculés avec un plan J* : ${withPlan.length} (${pc(withPlan.length / Math.max(1, sw.length))}), jour médian du premier plan J* ${f0(median(withPlan.map((r) => n(r, 'js_first_day'))))}, délai médian depuis la bascule ${f0(median(withPlan.map((r) => n(r, 'js_first_day') - n(r, 'switch_day'))))} j. Contrôle continu (5.4) : ${cont} différence(s) sur ${armRows(rows, 'JS').filter((r) => r.proposal_day !== '').length} utilisateurs.`,
    '',
  );
  const cells: string[][] = [];
  for (const b of [...new Set(sw.map((r) => r.behavior_ps as string))].sort()) {
    for (const goal of ['loss', 'maintenance', 'gain']) {
      const s = sw.filter((r) => r.behavior_ps === b && r.goal === goal);
      cells.push([b, goalFr(goal), String(c.filter((r) => r.behavior_ps === b && r.goal === goal).length), String(s.length)]);
    }
  }
  md.push('**Basculés par comportement et objectif**', '');
  table(['Comportement', 'Objectif', 'Non-suiveurs', 'Basculés'], cells);
  const missing = new Map<string, number>();
  for (const r of js.filter((x) => x.js_first_day === '')) missing.set(r.js_gate_missing as string, (missing.get(r.js_gate_missing as string) ?? 0) + 1);
  if (missing.size) {
    md.push('**Basculés sans plan J* : critère de porte manquant à la dernière évaluation du repli**', '');
    table(['Critère(s) manquant(s)', 'Utilisateurs'], [...missing.entries()].sort().map(([k, v]) => [k || '(porte ouverte, plan en échec)', String(v)]));
  }
}

/** h, M and J* constructions (A7.6), switched users with a J* plan, by behaviour and all. */
function jstarTable(rows: readonly Row[]) {
  const js = armRows(rows, 'JS', (r) => switched(r) && r.js_first_day !== '');
  const lines: string[][] = [];
  const groups = [...new Set(js.map((r) => r.behavior_ps as string))].sort();
  for (const g of [...groups, 'tous']) {
    const sel = g === 'tous' ? js : js.filter((r) => r.behavior_ps === g);
    if (sel.length === 0) continue;
    const q = (k: string) => {
      const v = sortNum(sel.map((r) => n(r, k)).filter(Number.isFinite));
      return `${f3(quantile(v, 0.05))} / ${f3(quantile(v, 0.25))} / ${f3(quantile(v, 0.5))} / ${f3(quantile(v, 0.75))} / ${f3(quantile(v, 0.95))}`;
    };
    const herr = sortNum(sel.flatMap((r) => (r.h_err ? String(r.h_err).split('|').map(Number) : [])).filter(Number.isFinite));
    const merr = sortNum(sel.map((r) => n(r, 'm_err_first')).filter(Number.isFinite));
    const mabs = sortNum(sel.map((r) => n(r, 'm_abs_err_mean')).filter(Number.isFinite));
    const mh = sortNum(sel.map((r) => n(r, 'mh_weekly_abs_change')).filter(Number.isFinite));
    const sum = (k: string) => sel.reduce((s, r) => s + (n(r, k) || 0), 0);
    lines.push([
      g,
      String(sel.length),
      q('h_raw_first'),
      `${sel.filter((r) => n(r, 'n_js_bound_low') > 0).length} / ${sel.filter((r) => n(r, 'n_js_bound_high') > 0).length} (${sum('n_js_bound_low')} / ${sum('n_js_bound_high')})`,
      `${f3(quantile(herr, 0.5))} [${f3(quantile(herr, 0.1))} ; ${f3(quantile(herr, 0.9))}] (${herr.length} plans)`,
      `${f1(quantile(merr, 0.5))} [${f1(quantile(merr, 0.1))} ; ${f1(quantile(merr, 0.9))}] ; |écart| moyen médian ${f1(quantile(mabs, 0.5))}`,
      `${f1(quantile(mh, 0.5))} [${f1(quantile(mh, 0.1))} ; ${f1(quantile(mh, 0.9))}]`,
      `${f1(median(sel.map((r) => n(r, 'n_js_recal'))))} / ${f1(median(sel.map((r) => n(r, 'n_js_periodic'))))} ; G1 ${sum('n_js_g1')}, G2 ${sum('n_js_g2')}`,
      `${sum('n_js_failed')} ; plancher actif ${sum('n_js_floor_active')}`,
    ]);
  }
  md.push('**J* (A7.6), basculés avec un plan J***', '');
  table(['Comportement', 'Utilisateurs', 'h brut au premier plan : P5 / P25 / médiane / P75 / P95', 'Borne basse / haute atteinte : utilisateurs (constructions)', 'Erreur de h, tous plans : médiane [P10 ; P90]', 'Écart de M à la vérité (unités de saisie), premier plan : médiane [P10 ; P90]', 'Variation hebdomadaire de M / h (kcal/j) : médiane [P10 ; P90]', 'Recalibrations / recalculs, médianes ; garde-fous J*', 'Échecs de construction ; constructions à plancher actif'], lines);
  const reasons = new Map<string, number>();
  for (const r of js) for (const f of String(r.js_failed_reasons ?? '').split('|').filter(Boolean)) {
    const key = f.split(':').slice(1).join(':');
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  if (reasons.size) {
    md.push('**Échecs de construction J* par raison (plan laissé en place)**', '');
    table(['Type : raison', 'Constructions'], [...reasons.entries()].sort().map(([k, v]) => [k, String(v)]));
  }
}

/** Criteria of arm C (reported, A7.6), by behaviour and pooled, reference day = switch day. */
function cTable(rows: readonly Row[], behaviors: readonly string[], withS1: boolean) {
  const c = armRows(rows, 'C', switched);
  const crits: Crit[] = [];
  if (withS1) crits.push(...s1Crits(c.filter((r) => R_BEHAVIORS.includes(r.behavior_ps as string)), 'C'));
  for (const b of behaviors) crits.push(...safetyCrits(c.filter((r) => r.behavior_ps === b), `C ${b}`));
  crits.push(...safetyCrits(c, 'C tous'));
  critTable('Bras C, critères (rapportés, sans verdict ; référence : jour de la cible choisie)', reported(crits));
  md.push(`T_c remplacées par le plancher × 1,10 : ${c.filter((r) => r.tc_replaced === '1').length} / ${c.length}.`, '');
}

function s2s7GuardTable(rows: readonly Row[]) {
  const lines: string[][] = [];
  for (const arm of ['C', 'JS']) {
    const ar = armRows(rows, arm, switched);
    for (const goal of GOALS) {
      for (const w of WINDOWS) {
        const v = ar.filter((r) => r.goal === goal).flatMap((r) => ratios(r, w));
        if (v.length === 0) continue;
        const d = dispersion(v);
        lines.push([arm, goalFr(goal), w.label, String(v.length), f3(d.median), f3(d.p90), d.median > 0 ? f3(d.ratio) : '—', f3(d.gap)]);
      }
    }
  }
  md.push('**S2 (rapporté), basculés**', '');
  table(['Bras', 'Objectif', 'Fenêtre', 'Blocs', 'Médiane', 'P90', 'P90 / médiane', 'P90 − médiane'], lines);
  const s7: string[][] = [];
  const guards: string[][] = [];
  for (const arm of ['C', 'JS']) {
    const m = armRows(rows, arm, (r) => r.goal === 'maintenance');
    const k = m.filter((r) => r.s7_in_zone_target === '1').length;
    s7.push([arm, `${k} / ${m.length} = ${pci(wilson(k, m.length))}`, `${m.filter((r) => r.s7_in_zone_true_start === '1').length} / ${m.length}`]);
    const ar = armRows(rows, arm, switched);
    const sum = (key: string) => ar.reduce((s, r) => s + (n(r, key) || 0), 0);
    const bmiMin = sortNum(ar.map((r) => n(r, 'true_bmi_min')));
    const endUnder = ar.filter((r) => n(r, 'true_bmi_final') < 20).length;
    const jsPath = (rule: string) => ar.reduce((s, r) => s + String(r.g_events ?? '').split('|').filter((e) => e.split(':')[1] === rule && e.split(':')[2] === 'applied').length, 0);
    guards.push([arm, String(ar.length), `${ar.filter((r) => n(r, 'n_g1') > 0).length} (${sum('n_g1')})`, `${ar.filter((r) => n(r, 'n_g2') > 0).length} (${sum('n_g2')})`, arm === 'JS' ? `G1 ${sum('n_js_g1')}, G2 ${sum('n_js_g2')}` : `G1 ${jsPath('G1')}, G2 ${jsPath('G2')}`, String(sum('n_g_failed')), `${endUnder} = ${pci(wilson(endUnder, ar.length))}`, `${f3(bmiMin[0] ?? Number.NaN)} ; P1 ${f3(quantile(bmiMin, 0.01))} ; P5 ${f3(quantile(bmiMin, 0.05))}`]);
  }
  md.push('**S7 (rapporté) : maintien dans la zone à 8 semaines, tous les non-suiveurs en maintien**', '');
  table(['Bras', 'Dans la zone (cible)', 'Centrée sur le poids vrai de départ'], s7);
  md.push('**Garde-fous et IMC vrai, basculés**', '');
  table(['Bras', 'n', 'G1 : utilisateurs (événements)', 'G2 : utilisateurs (événements)', 'Événements (J* : chemin J* ; C : tous)', 'Échecs', 'Fins sous IMC 20 vrai', 'IMC vrai minimal : min ; P1 ; P5'], guards);
  md.push(`Blocs exclus (changement d'objectif) : C ${excludedBlocks(armRows(rows, 'C', switched))}, J* ${excludedBlocks(armRows(rows, 'JS', switched))}.`, '');
}

/** Stratification of delta (s8), pooled goals, per window. */
function strataTable(rows: readonly Row[]) {
  const ps = pairs(rows, 'C', 'JS', (r) => switched(r) && r.goal !== 'maintenance');
  const hq = sortNum(ps.map((p) => n(p.rb, 'h_raw_first')).filter(Number.isFinite));
  const qs = [quantile(hq, 0.25), quantile(hq, 0.5), quantile(hq, 0.75)];
  const hQuart = (r: Row) => {
    const h = n(r, 'h_raw_first');
    if (!Number.isFinite(h)) return 'sans plan J*';
    return h <= (qs[0] as number) ? 'Q1' : h <= (qs[1] as number) ? 'Q2' : h <= (qs[2] as number) ? 'Q3' : 'Q4';
  };
  const vars: Array<[string, (r: Row, js: Row) => string]> = [
    ['sexe', (r) => r.sex as string],
    ['classe d’IMC', (r) => r.bmi_class as string],
    ['activité', (r) => r.activity as string],
    ['objectif', (r) => r.goal as string],
    ['vitesse demandée', (r) => r.requested_rate as string],
    ['décalage s', (r) => r.shift as string],
    ['part déclarée', (r) => r.major_share as string],
    ['comportement', (r) => r.behavior_ps as string],
    ['population', (r) => r.population as string],
    [`quartile de h au premier plan J* (${qs.map(f3).join(' / ')})`, (_r, js) => hQuart(js)],
  ];
  const lines: string[][] = [];
  for (const [name, f] of vars) {
    const values = [...new Set(ps.map((p) => f(p.ra, p.rb)))].sort();
    if (values.length < 2 && name !== 'population') continue;
    for (const v of values) {
      const sel = ps.filter((p) => f(p.ra, p.rb) === v);
      const cells = WINDOWS.map((w) => {
        const d = pairedAbs(sel, null, w);
        return `${ci(d)} (n = ${d.users})`;
      });
      lines.push([name, v, String(sel.length), ...cells]);
    }
  }
  md.push('**Stratification de Δ (J* − C), perte et prise ensemble, basculés**', '');
  table(['Variable', 'Valeur', 'Utilisateurs', 'Δ sem. 5-12 [IC 95 %]', 'Δ sem. 13-24 [IC 95 %]'], lines);
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/** One population of a step: NI per behaviour, safety per behaviour, S1 (R behaviours). Returns the combined status. */
function judgePopulation(rows: readonly Row[], label: string, behaviors: readonly string[], withS1: boolean, better: string[]): Status {
  populationLine(rows);
  const js = armRows(rows, 'JS', switched);
  const ni: Crit[] = behaviors.flatMap((b) => niCrits(rows, b, better));
  critTable(`NI (J* − C), ${label} : ${combine(statuses(ni))}`, ni);
  const safety: Crit[] = behaviors.flatMap((b) => safetyCrits(js.filter((r) => r.behavior_ps === b), `J* ${b}`));
  critTable(`Sécurité de J* (période après le premier plan J*), ${label} : ${combine(statuses(safety))}`, safety);
  const s1c = withS1 ? s1Crits(js.filter((r) => R_BEHAVIORS.includes(r.behavior_ps as string)), 'J* (R0 à R30)') : [];
  if (withS1) critTable(`S1 de J*, ${label} : ${combine(statuses(s1c))}`, s1c);
  const all = [...ni, ...safety, ...s1c];
  verdicts[label] = Object.fromEntries(all.map((c) => [c.name, c.status]));
  const st = combine(statuses(all));
  md.push(`**${label} : ${st}.**`, '');
  jstarTable(rows);
  cTable(rows, behaviors, withS1);
  s2s7GuardTable(rows);
  strataTable(rows);
  return st;
}

function stepStatus(key: string, st: Status, job: string, first: Row[] | null) {
  verdicts[key] = { job, status: st, doubledNeeded: first === null && st === 'INCONCLUSIF', doubledPass: first !== null };
  md.push(`**Étape ${key} (${job}) : ${st}${first === null && st === 'INCONCLUSIF' ? ' → passe doublée (A7.4)' : ''}.**`, '');
}

function v1(): void {
  const { rows, job, first } = judged('v1', 'v1');
  if (rows.length === 0) return;
  md.push(`## 3. V1 : P00, R0, R15, R30 (${job}${first ? ', passe doublée : verdict sur elle seule' : ''})`, '');
  const better: string[] = [];
  const st = judgePopulation(rows, 'V1 P00', R_BEHAVIORS, true, better);
  verdicts['V1 better'] = better;
  md.push(`Cellules où J* fait mieux que C (borne haute < 0) : ${better.length ? better.join(' ; ') : 'aucune'}.`, '');
  stepStatus('V1', st, job, first);
}

function v2(): void {
  const { rows, job, first } = judged('v2', 'v2');
  if (rows.length === 0) return;
  md.push(`## 4. V2 : P00, H1, H2a, H2b, H3 (${job}${first ? ', passe doublée : verdict sur elle seule' : ''})`, '');
  const better: string[] = [];
  const st = judgePopulation(rows, 'V2 P00', H_BEHAVIORS, false, better);
  verdicts['V2 better'] = better;
  md.push(`Cellules où J* fait mieux que C (borne haute < 0) : ${better.length ? better.join(' ; ') : 'aucune'}.`, '');
  stepStatus('V2', st, job, first);
  const h4 = load('v2', 'v2h4');
  if (h4.length > 0) {
    md.push('### H4, robustesse (rapportée, sans verdict)', '');
    populationLine(h4);
    const js = armRows(h4, 'JS', switched);
    critTable('Sécurité de J* (rapportée)', reported(safetyCrits(js, 'J* H4')));
    const lines = ['C', 'JS'].map((arm) => {
      const v = sortNum(armRows(h4, arm, switched).map((r) => n(r, 'target_weekly_abs_change')).filter(Number.isFinite));
      return [arm, String(v.length), `${f1(quantile(v, 0.5))} [${f1(quantile(v, 0.1))} ; ${f1(quantile(v, 0.9))}]`];
    });
    md.push('**Stabilité de la cible affichée après le jour de référence : variation hebdomadaire |ΔT| (kcal/j)**', '');
    table(['Bras', 'Basculés', 'Médiane [P10 ; P90]'], lines);
    jstarTable(h4);
  }
}

function v3(): void {
  const { rows, job, first } = judged('v3', 'v3');
  if (rows.length === 0) return;
  md.push(`## 5. V3 : P05, P10, P20, R0, R15, R30 (${job}${first ? ', passe doublée : verdict sur elle seule' : ''})`, '');
  const per: Status[] = [];
  const better: string[] = [];
  for (const p of ['P05', 'P10', 'P20']) {
    md.push(`### ${p}`, '');
    per.push(judgePopulation(rows.filter((r) => r.population === p), `V3 ${p}`, R_BEHAVIORS, true, better));
  }
  verdicts['V3 better'] = better;
  md.push(`Cellules où J* fait mieux que C (borne haute < 0) : ${better.length ? better.join(' ; ') : 'aucune'}.`, '');
  stepStatus('V3', combine(per), job, first);
}

function v4(): void {
  const { rows, job, first } = judged('v4', 'v4');
  if (rows.length === 0) return;
  md.push(`## 6. V4 : sensibilités [S], R0, R15, R30 (${job}${first ? ', passe doublée : verdict sur elle seule' : ''})`, '');
  const per: Status[] = [];
  for (const p of ['P10_sd20', 'P10_slope-5', 'P10_slope-10']) {
    const pr = rows.filter((r) => r.population === p);
    md.push(`### ${p}`, '');
    populationLine(pr);
    const js = armRows(pr, 'JS', switched);
    const crits = R_BEHAVIORS.flatMap((b) => safetyCrits(js.filter((r) => r.behavior_ps === b), `J* ${b}`));
    const st = combine(statuses(crits));
    verdicts[`V4 ${p}`] = Object.fromEntries(crits.map((c) => [c.name, c.status]));
    critTable(`Sécurité de J*, ${p} : ${st}`, crits);
    critTable(`Bras C, ${p} (rapporté)`, reported(R_BEHAVIORS.flatMap((b) => safetyCrits(armRows(pr, 'C', switched).filter((r) => r.behavior_ps === b), `C ${b}`))));
    per.push(st);
  }
  stepStatus('V4', combine(per), job, first);
}

function decision(): void {
  const st = (k: string) => (verdicts[k] as { status?: Status } | undefined)?.status ?? 'non exécutée';
  const all = ['V1', 'V2', 'V3', 'V4'].map(st);
  const retained = all.every((s) => s === 'GO');
  verdicts.decision = { V1: all[0], V2: all[1], V3: all[2], V4: all[3], retained };
  md.push('## 7. Décision de A7.5', '', `V1 ${all[0]}, V2 ${all[1]}, V3 ${all[2]}, V4 ${all[3]} → J* ${retained ? 'RETENU' : 'NON RETENU'}.`, '');
}

function controls(): void {
  const rows = load('controls', 'fallback2d');
  if (rows.length === 0) return;
  md.push('## 2. Contrôle 6.1 : repli (densité 0,90 et 0,75)', '');
  const js = armRows(rows, 'JS', switched);
  const noPlan = js.filter((r) => r.js_first_day === '');
  const withPlan = js.filter((r) => r.js_first_day !== '');
  const mism = armRows(rows, 'JS').filter((r) => r.cont_mismatch !== '' && r.cont_mismatch !== undefined);
  const byDensity = ['0.9', '0.75'].map((d) => {
    const s = js.filter((r) => r.weigh_p === d);
    return `${d} : ${s.length} basculés, ${s.filter((r) => r.js_first_day !== '').length} avec un plan J*`;
  });
  md.push(`Basculés : ${js.length} (${byDensity.join(' ; ')}). Sans plan J* : ${noPlan.length}, identiques au bras C sur les 168 jours : ${noPlan.filter((r) => r.cont_mismatch === '').length}. Avec un plan J* malgré la densité : ${withPlan.length}, identiques jusqu'à la veille : ${withPlan.filter((r) => r.cont_mismatch === '').length}. Différences : ${mism.length}${mism.length ? ` (${mism.map((r) => `${r.job_index}:${r.cont_mismatch}`).join(', ')})` : ''}.`, '');
  verdicts.control61 = { switched: js.length, noPlan: noPlan.length, withPlan: withPlan.length, mismatches: mism.length, pass: js.length >= 200 && mism.length === 0 };
  md.push(`**Contrôle 6.1 : ${js.length >= 200 && mism.length === 0 ? 'PASSE' : 'ÉCHOUE'}.**`, '');
}

function timing(): void {
  const path = `${DIR}/timing/launch-times.txt`;
  if (!existsSync(path)) return;
  md.push('## 9. Temps de calcul (lancements)', '', '```', readFileSync(path, 'utf8').trim(), '```', '');
}

it('iteration 2d tables and verdicts', () => {
  md.push('# Itération 2d : J* contre « cible choisie », tableaux et verdicts (reconstruits depuis les bruts)', '', 'Script : tests/experiments-journal/it2d/tables2d.experiment.ts. Ratios sur la masse tissulaire (A4.1), blocs à changement d’objectif exclus (A5.4, A6.5). Seuils : THRESHOLDS.md, amendement 7.', '');
  controls();
  v1();
  v2();
  v3();
  v4();
  decision();
  timing();
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${DIR}/tables2d.md`, `${md.join('\n')}\n`);
  writeFileSync(`${DIR}/verdicts2d.json`, `${JSON.stringify(verdicts, null, 2)}\n`);
});
