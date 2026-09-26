/**
 * Relaunch of iteration 2 (prompt 40 s11): tables and verdicts rebuilt from the raw exports only
 * (tests/experiments-journal/results/it2r/<dir>/<job>-shard<k>.csv.gz). Committed before any measurement.
 * Run: npx vitest run -c vitest.journal.config.ts it2r/tables2r   (IT2R_TABLES_DIR: another results directory)
 * Writes results/it2r/tables2r.md and results/it2r/verdicts2r.json. A section is written only when its raw files exist; when
 * the doubled pass of a step exists (A1.3), the verdict rests on it alone and the first pass is reported.
 *
 * Definitions (THRESHOLDS.md, amendments 4 to 6; prompt 40), fixed before any measurement:
 * - judged population of arm J, S5, S5b and P00 (A6.2): non-followers whose revision proposal was accepted (switched);
 *   non-followers without a proposal are reported apart; S6: followers; S7: maintenance users of every behaviour.
 * - ratio (A4.1): tissue ratio of each 4-week block (tratio_b1 to tratio_b5), windows weeks 5-12 (blocks 1-2) and 13-24
 *   (blocks 3-5); a block where the goal of the plan in force changes is excluded (A5.4, A6.5) and counted. The ratio on the
 *   total weight (ratio_b*) is reported alongside, same exclusions.
 * - S1: median ratio of the pooled user-blocks, per goal (loss, gain) and window, CI inside [0.85, 1.15].
 * - S3-P, S3-D, S4-P, S4-J: from the reference day of A6.5 (J: first journal plan; C: chosen target; A: day 0), columns
 *   s3p_*_ref, s3d_*_ref, s4p_days_ref, s4j_* of jobs2r.ts. S3-P and S4-P invariants (0); S3-D bootstrap share of
 *   user-blocks, upper bound <= 5 %; S4-J Wilson on the users with at least one plan period of 7 days or more, <= 1 % and
 *   upper bound <= 2 %.
 * - S5, S5b, S6, P00: paired difference of the pooled medians of |ratio - 1| (bootstrap of users having ratios in both arms),
 *   per goal and window (strictest reading: each cell must pass); the pooled goals are reported. S5 (J - A): upper bound < 0.
 *   S5b (J - C, by deviation frequency): 15 % and 30 %, upper bound < 0; 0 %, upper bound <= +0.05 (A2.1). S6 (followers,
 *   J - A) and P00 (J - J-NASEM): upper bound <= +0.05.
 * - S2 (A6.4, reported): P90, P90 / median (when the median is positive) and P90 - median of the ratios, arms J, C, A.
 * - Training (s7.1): per X, S1, S3-P, S3-D, S4-P, S4-J and S5 in each principal population; status of X = combination.
 *   Rule: from the most permissive X (70 %) up, the first GO X is retained; an INCONCLUSIF X met before a GO one calls the
 *   doubled training pass (A5.1); if every X is NO-GO, X = 100 %.
 * - V1 stop (A6.3): a blocking criterion of C1 NO-GO in P00, or the rule of A2.1 failing in P00. Blocking criteria of C1:
 *   S1, S3-P, S3-D, S4-P, S4-J, S5, S6, P00 (P00 only), and the sensitivities [S] (S3-P, S3-D, S4-P, S4-J of arm J).
 * - Carbohydrates (A1.1, A2.2): criteria of A6.5 per arm and world; |bias| of the displayed maintenance at 28 and 42 days
 *   (bias28, bias42, logged units), paired mean difference JG - J over the users with the value in both arms.
 * - C2: per motif, median of the days above 1.25 x the requested rate on the tissues (c2_above_days), upper bound <= 21 days
 *   [S]; S3-P, S3-D, S4-P, S4-J. C6: per floor arm, S4-P and S4-J [S]; missed EA alerts <= 10 % of the concerned plan
 *   periods (bootstrap share, upper bound); real protein < 90 % of the rule <= 5 % of the users (Wilson, upper bound);
 *   false EA alerts reported.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { bootstrapQuantile, f0, f1, f3, goalFr, median, pairedMedianDiff, pc, quantile, readAll, sortNum, wilson } from '../it2b/stats2b';
import type { Row } from '../it2b/stats2b';
import { bootstrapShare, dispersion } from '../it2c/stats2c';
import { IT2R_DIR } from './jobs2r';
import { SEED_2R, bandStatus, combine, invariantStatus, pairedMeanDiff, s4jStatus, upperStatus } from './stats2r';
import type { Status } from './stats2r';

const DIR = process.env.IT2R_TABLES_DIR ?? IT2R_DIR;
const PRINCIPAL = ['P00', 'P05', 'P10', 'P20'];
const GOALS = ['loss', 'gain'] as const;
const WINDOWS = [
  { key: 'w1', label: 'sem. 5-12', blocks: [1, 2] },
  { key: 'w2', label: 'sem. 13-24', blocks: [3, 4, 5] },
] as const;
type Window = (typeof WINDOWS)[number];
const DEV_FREQS = ['0', '0.15', '0.3'];
const SHARES = ['0.8', '0.95', '1'];

const md: string[] = [];
const verdicts: Record<string, unknown> = {};
const n = (r: Row, k: string) => (r[k] === undefined || r[k] === '' ? Number.NaN : Number(r[k]));
const ukey = (r: Row) => `${r.job}:${r.job_index}`;
const switched = (r: Row) => r.behavior === 'nonfollower' && r.proposal_day !== '' && r.accepted === '1';
const noProposal = (r: Row) => r.behavior === 'nonfollower' && r.proposal_day === '';
const ci = (s: { value: number; lo: number; hi: number }) => `${f3(s.value)} [${f3(s.lo)} ; ${f3(s.hi)}]`;
const pci = (s: { p: number; lo: number; hi: number }) => `${pc(s.p)} [${pc(s.lo)} ; ${pc(s.hi)}]`;
const table = (head: string[], rows: string[][]) => {
  md.push(`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`), '');
};

/** Tissue (or total-weight) ratios of the window, blocks with a goal change excluded. */
function ratios(r: Row, w: Window, total = false): number[] {
  const out: number[] = [];
  for (const k of w.blocks) {
    if (r[`goal_change_b${k}`] === '1') continue;
    const v = n(r, total ? `ratio_b${k}` : `tratio_b${k}`);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}
const absDev = (v: readonly number[]) => v.map((x) => Math.abs(x - 1));
const excludedBlocks = (rows: readonly Row[]) => rows.reduce((s, r) => s + [1, 2, 3, 4, 5].filter((k) => r[`goal_change_b${k}`] === '1').length, 0);

function load(dir: string, job: string): Row[] {
  return readAll(`${DIR}/${dir}`, job);
}
/** Doubled pass (A1.3): the verdict rests on it alone when it exists. */
function judged(dir: string, job: string): { rows: Row[]; job: string; first: Row[] | null } {
  const x2 = load(dir, `${job}x2`);
  if (x2.length > 0) return { rows: x2, job: `${job}x2`, first: load(dir, job) };
  return { rows: load(dir, job), job, first: null };
}
function armRows(rows: readonly Row[], arm: string, pred: (r: Row) => boolean = () => true): Row[] {
  return rows.filter((r) => r.arm === arm && pred(r));
}
/** Paired users of two arms (by user key), restricted by a predicate on the arm-a row. */
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

type Crit = { name: string; value: string; status: Status | 'rapporté'; n?: number };

function s1(rows: readonly Row[], goal: string, w: Window, total = false) {
  const st = bootstrapQuantile(
    rows.filter((r) => r.goal === goal).map((r) => ratios(r, w, total)),
    0.5,
    SEED_2R,
  );
  return { st, status: bandStatus(st, [0.85, 1.15], st.users) };
}
function s3p(rows: readonly Row[]) {
  const checks = rows.reduce((s, r) => s + n(r, 's3p_checks_ref'), 0);
  const viol = rows.reduce((s, r) => s + n(r, 's3p_viol_ref'), 0);
  const exempt = rows.reduce((s, r) => s + (n(r, 's3p_exempt') || 0), 0);
  return { checks, viol, exempt, users: rows.filter((r) => n(r, 's3p_viol_ref') > 0).length, status: invariantStatus(viol, checks) };
}
function s3d(rows: readonly Row[]) {
  const share = bootstrapShare(rows.map((r) => [n(r, 's3d_over_ref'), n(r, 's3d_blocks_ref')] as const), SEED_2R);
  return { share, status: upperStatus(share, 0.05, share.users) };
}
function s4p(rows: readonly Row[]) {
  const days = rows.reduce((s, r) => s + n(r, 's4p_days_ref'), 0);
  const users = rows.filter((r) => r.ref2r !== '').length;
  return { days, users, status: invariantStatus(days, users) };
}
function s4j(rows: readonly Row[]) {
  const judgedRows = rows.filter((r) => n(r, 's4j_periods') > 0);
  const k = judgedRows.filter((r) => n(r, 's4j_below') > 0).length;
  const w = wilson(k, judgedRows.length);
  const margins = sortNum(judgedRows.map((r) => n(r, 's4j_min_margin')));
  return { k, n: judgedRows.length, w, minMargin: margins[0] ?? Number.NaN, p1: quantile(margins, 0.01), status: s4jStatus(w, judgedRows.length) };
}
function pairedAbs(ps: ReadonlyArray<{ ra: Row; rb: Row }>, goal: string | null, w: Window) {
  const sel = ps.filter((p) => goal === null || p.ra.goal === goal).map((p) => ({ a: absDev(ratios(p.ra, w)), b: absDev(ratios(p.rb, w)) }));
  const d = pairedMedianDiff(sel, SEED_2R);
  const users = sel.filter((p) => p.a.length > 0 && p.b.length > 0);
  return { ...d, users: users.length, medA: median(users.flatMap((p) => p.a)), medB: median(users.flatMap((p) => p.b)) };
}

/** S1, S3-P, S3-D, S4-P, S4-J of one arm on one population (A6.5). */
function criteriaA65(rows: readonly Row[], label: string, withTotal = true): { crits: Crit[]; status: Status } {
  const crits: Crit[] = [];
  for (const goal of GOALS) {
    for (const w of WINDOWS) {
      const r = s1(rows, goal, w);
      const t = withTotal ? s1(rows, goal, w, true).st : null;
      crits.push({ name: `S1 ${goalFr(goal)}, ${w.label}`, value: `${ci(r.st)} (n = ${r.st.users} ; P10 / P90 ${f3(r.st.p10)} / ${f3(r.st.p90)})${t ? ` ; poids total ${f3(t.value)}` : ''}`, status: r.status, n: r.st.users });
    }
  }
  const p = s3p(rows);
  crits.push({ name: 'S3-P [S]', value: `${p.viol} violation(s) sur ${p.checks} évaluations (${p.users} utilisateurs) ; exemptées (cible choisie) : ${p.exempt}`, status: p.status });
  const d = s3d(rows);
  crits.push({ name: 'S3-D [S]', value: `${d.share.k} / ${d.share.n} utilisateurs-blocs = ${pci(d.share)} (${d.share.users} utilisateurs)`, status: d.status });
  const q = s4p(rows);
  crits.push({ name: 'S4-P [S]', value: `${q.days} jour(s) (${q.users} utilisateurs)`, status: q.status });
  const j = s4j(rows);
  crits.push({ name: 'S4-J [S]', value: `${j.k} / ${j.n} = ${pci(j.w)} ; marge minimale ${f1(j.minMargin)} kcal/j, P1 ${f1(j.p1)}`, status: j.status });
  verdicts[label] = Object.fromEntries(crits.map((c) => [c.name, c.status]));
  return { crits, status: combine(crits.map((c) => c.status).filter((s): s is Status => s !== 'rapporté')) };
}

function pairedCrit(ps: ReadonlyArray<{ ra: Row; rb: Row }>, name: string, rule: (d: { lo: number; hi: number }, users: number) => Status, label: string): { crits: Crit[]; status: Status } {
  const crits: Crit[] = [];
  for (const goal of GOALS) {
    for (const w of WINDOWS) {
      const d = pairedAbs(ps, goal, w);
      crits.push({ name: `${name} ${goalFr(goal)}, ${w.label}`, value: `${f3(d.medA)} → ${f3(d.medB)} ; Δ ${ci(d)} (n = ${d.users})`, status: rule(d, d.users), n: d.users });
    }
  }
  for (const w of WINDOWS) {
    const d = pairedAbs(ps, null, w);
    crits.push({ name: `${name} perte et prise, ${w.label}`, value: `${f3(d.medA)} → ${f3(d.medB)} ; Δ ${ci(d)} (n = ${d.users})`, status: 'rapporté' });
  }
  verdicts[label] = Object.fromEntries(crits.map((c) => [c.name, c.status]));
  return { crits, status: combine(crits.map((c) => c.status).filter((s): s is Status => s !== 'rapporté')) };
}
const lt0 = (d: { lo: number; hi: number }, users: number) => upperStatus(d, 0, users, true);
const le005 = (d: { lo: number; hi: number }, users: number) => upperStatus(d, 0.05, users);

/** S5b and the rule of A2.1 (J - C by deviation frequency), per goal and window. */
function s5b(rows: readonly Row[], label: string): { crits: Crit[]; status: Status } {
  const crits: Crit[] = [];
  for (const f of DEV_FREQS) {
    const ps = pairs(rows, 'C', 'J', (r) => switched(r) && r.dev_freq === f);
    const res = pairedCrit(ps, `S5b ${pc(Number(f)).replace(',00', '')}`, f === '0' ? le005 : lt0, `${label} S5b ${f}`);
    crits.push(...res.crits);
  }
  verdicts[`${label} A2.1`] = combine(crits.map((c) => c.status).filter((s): s is Status => s !== 'rapporté'));
  return { crits, status: verdicts[`${label} A2.1`] as Status };
}

function critTable(title: string, crits: readonly Crit[]) {
  md.push(`**${title}**`, '');
  table(
    ['Critère', 'Valeur [IC 95 %]', 'Statut'],
    crits.map((c) => [c.name, c.value, c.status]),
  );
}

/** S2 (A6.4), reported: P90, P90 / median, P90 - median of the tissue ratios. */
function s2Table(rows: readonly Row[], arms: readonly string[]) {
  const lines: string[][] = [];
  for (const arm of arms) {
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
  md.push('**S2 (A6.4, rapporté sans verdict)**', '');
  table(['Bras', 'Objectif', 'Fenêtre', 'Blocs', 'Médiane', 'P90', 'P90 / médiane', 'P90 − médiane'], lines);
}

/** Reported metrics of 7.4 and of the original prompt, per arm, switched non-followers. */
function reportedTable(rows: readonly Row[], arms: readonly string[]) {
  const lines: string[][] = [];
  for (const arm of arms) {
    const ar = armRows(rows, arm, switched);
    if (ar.length === 0) continue;
    const med = (k: string) => median(ar.map((r) => n(r, k)).filter((v) => Number.isFinite(v)));
    const fsp = ar.filter((r) => r.first_switch_plan_day !== '');
    lines.push([
      arm,
      String(ar.length),
      f1(med('delay_to_band')),
      f3(med('peak_ratio')),
      f1(med('n_recal')),
      f1(med('display_mean_abs_change')),
      arm.startsWith('J') ? `${fsp.length} (${pc(fsp.length / ar.length)}), jour médian ${f0(median(fsp.map((r) => n(r, 'first_switch_plan_day'))))}` : '—',
      arm.startsWith('J') ? `${f1(med('oracle_gap_mean'))} / ${f1(med('oracle_abs_gap_mean'))}` : '—',
      arm === 'C' ? `${ar.filter((r) => r.tc_replaced === '1').length} / ${ar.length}` : '—',
      String(excludedBlocks(ar)),
    ]);
  }
  md.push('**Métriques rapportées (7.4), non-suiveurs basculés, médianes**', '');
  table(['Bras', 'Utilisateurs', 'Délai jusqu’à [0,85 ; 1,15] (j)', 'Pic de ratio', 'Recalibrations', 'Variation du maintien affiché (kcal/j)', 'Premier plan journal', 'Écart à l’oracle signé / absolu (kcal/j)', 'T_c remplacées', 'Blocs exclus'], lines);
}

/** Guardrails and safety under BMI 20 (7.4), per arm, switched non-followers and all users. */
function guardTable(rows: readonly Row[], arms: readonly string[]) {
  const lines: string[][] = [];
  for (const arm of arms) {
    for (const [who, pred] of [
      ['basculés', switched],
      ['tous', () => true],
    ] as const) {
      const ar = armRows(rows, arm, pred);
      if (ar.length === 0) continue;
      const sum = (k: string) => ar.reduce((s, r) => s + (n(r, k) || 0), 0);
      const bmiMin = sortNum(ar.map((r) => n(r, 'true_bmi_min')));
      const endUnder = ar.filter((r) => n(r, 'true_bmi_final') < 20).length;
      lines.push([
        arm,
        who,
        String(ar.length),
        `${ar.filter((r) => n(r, 'n_g1') > 0).length} (${sum('n_g1')}) ; journal ${sum('n_g1_journal')}`,
        `${ar.filter((r) => n(r, 'n_g2') > 0).length} (${sum('n_g2')}) ; journal ${sum('n_g2_journal')}`,
        String(sum('n_g_failed')),
        `${endUnder} = ${pci(wilson(endUnder, ar.length))}`,
        `${f3(bmiMin[0] ?? Number.NaN)} ; P1 ${f3(quantile(bmiMin, 0.01))} ; P5 ${f3(quantile(bmiMin, 0.05))}`,
      ]);
    }
  }
  md.push('**Garde-fous et IMC vrai (7.4)**', '');
  table(['Bras', 'Groupe', 'n', 'G1 : utilisateurs (événements)', 'G2 : utilisateurs (événements)', 'Échecs', 'Fins sous IMC 20 vrai', 'IMC vrai minimal : min ; P1 ; P5'], lines);
}

/** Proposals by population and declared major-deviation share; non-followers without a proposal (7.4). */
function proposalTable(rows: readonly Row[], pops: readonly string[]) {
  const lines: string[][] = [];
  const noProp: string[][] = [];
  for (const p of pops) {
    const nf = armRows(rows, 'A', (r) => r.behavior === 'nonfollower' && r.population === p);
    for (const s of [...SHARES, 'toutes']) {
      const sel = s === 'toutes' ? nf : nf.filter((r) => r.major_share === s);
      const withP = sel.filter((r) => r.proposal_day !== '');
      lines.push([p, s === 'toutes' ? s : pc(Number(s)).replace(',00', ''), String(sel.length), `${withP.length} = ${pci(wilson(withP.length, sel.length))}`, f0(median(withP.map((r) => n(r, 'proposal_day'))))]);
    }
    const np = nf.filter(noProposal);
    const cells = GOALS.flatMap((g) => WINDOWS.map((w) => {
      const st = bootstrapQuantile(np.filter((r) => r.goal === g).map((r) => ratios(r, w)), 0.5, SEED_2R);
      return `${goalFr(g)} ${w.label} : ${st.users ? ci(st) : '—'} (n = ${st.users})`;
    }));
    noProp.push([p, String(np.length), cells.join(' ; ')]);
  }
  md.push('**Propositions de révision chez les non-suiveurs, par part déclarée « écart important » (facteur de 5.1)**', '');
  table(['Population', 'Part déclarée', 'Non-suiveurs', 'Avec proposition [Wilson]', 'Jour médian'], lines);
  md.push('**Non-suiveurs sans proposition (identiques dans tous les bras), ratio tissulaire sous la méthode actuelle**', '');
  table(['Population', 'Utilisateurs', 'Médiane [IC 95 %]'], noProp);
}

/** S5 and S5b by declared major-deviation share (reported, 7.4). */
function factorTable(rows: readonly Row[]) {
  const lines: string[][] = [];
  for (const s of SHARES) {
    for (const [name, a, b, pred] of [
      ['S5 (J − A)', 'A', 'J', (r: Row) => switched(r) && r.major_share === s],
      ['S5b 0 % (J − C)', 'C', 'J', (r: Row) => switched(r) && r.major_share === s && r.dev_freq === '0'],
      ['S5b 15 % (J − C)', 'C', 'J', (r: Row) => switched(r) && r.major_share === s && r.dev_freq === '0.15'],
      ['S5b 30 % (J − C)', 'C', 'J', (r: Row) => switched(r) && r.major_share === s && r.dev_freq === '0.3'],
    ] as const) {
      const ps = pairs(rows, a, b, pred);
      for (const w of WINDOWS) {
        const d = pairedAbs(ps, null, w);
        lines.push([pc(Number(s)).replace(',00', ''), name, w.label, String(d.users), `${f3(d.medA)} → ${f3(d.medB)}`, ci(d)]);
      }
    }
  }
  md.push('**S5 et S5b par part déclarée « écart important » (rapportés, perte et prise ensemble)**', '');
  table(['Part déclarée', 'Comparaison', 'Fenêtre', 'Utilisateurs', 'Médiane |ratio − 1|', 'Δ [IC 95 %]'], lines);
}

/** Strata of arm J (switched non-followers), point values (s11). */
function strataTable(rows: readonly Row[], label: string) {
  const vars: Array<[string, string]> = [
    ['sexe', 'sex'],
    ['classe d’IMC', 'bmi_class'],
    ['activité', 'activity'],
    ['objectif', 'goal'],
    ['décalage s', 'shift'],
    ['densité de pesée', 'weigh_p'],
    ['fréquence des jours d’écart', 'dev_freq'],
    ['part déclarée « écart important »', 'major_share'],
  ];
  const lines: string[][] = [];
  const ps = pairs(rows, 'A', 'J', switched);
  for (const [name, col] of vars) {
    const values = [...new Set(ps.map((p) => p.ra[col] as string))].sort();
    for (const v of values) {
      const sel = ps.filter((p) => p.ra[col] === v);
      const j = sel.map((p) => p.rb);
      const cells = WINDOWS.map((w) => `${f3(median(j.filter((r) => r.goal !== 'maintenance').flatMap((r) => ratios(r, w))))}`);
      const abs = WINDOWS.map((w) => `${f3(median(sel.flatMap((p) => absDev(ratios(p.ra, w)))))} → ${f3(median(sel.flatMap((p) => absDev(ratios(p.rb, w)))))}`);
      const d = j.reduce((s, r) => s + n(r, 's3d_over_ref'), 0) / Math.max(1, j.reduce((s, r) => s + n(r, 's3d_blocks_ref'), 0));
      const s4 = j.filter((r) => n(r, 's4j_periods') > 0);
      lines.push([name, v, String(sel.length), cells.join(' / '), abs.join(' / '), pc(d), `${s4.filter((r) => n(r, 's4j_below') > 0).length} / ${s4.length}`]);
    }
  }
  md.push(`**Strates, bras J, non-suiveurs basculés (${label}), valeurs ponctuelles**`, '');
  table(['Variable', 'Valeur', 'Utilisateurs', 'Médiane ratio J (sem. 5-12 / 13-24, perte et prise)', 'Médiane |ratio − 1| A → J (sem. 5-12 / 13-24)', 'S3-D', 'S4-J'], lines);
}

/** S7 (reported): maintenance users in the zone at 8 weeks, per behaviour and arm. */
function s7Table(rows: readonly Row[], arms: readonly string[]) {
  const lines: string[][] = [];
  for (const arm of arms) {
    for (const b of ['follower', 'nonfollower']) {
      const ar = armRows(rows, arm, (r) => r.goal === 'maintenance' && r.behavior === b);
      if (ar.length === 0) continue;
      const k = ar.filter((r) => r.s7_in_zone_target === '1').length;
      const k2 = ar.filter((r) => r.s7_in_zone_true_start === '1').length;
      lines.push([arm, b === 'follower' ? 'suiveurs' : 'non-suiveurs', `${k} / ${ar.length} = ${pci(wilson(k, ar.length))}`, `${k2} / ${ar.length}`]);
    }
  }
  md.push('**S7 (rapporté) : maintien dans la zone à 8 semaines**', '');
  table(['Bras', 'Comportement', 'Dans la zone (cible)', 'Centrée sur le poids vrai de départ'], lines);
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function training(): void {
  const { rows, job, first } = judged('c1train', 'c1train');
  if (rows.length === 0) return;
  md.push(`## 3. C1, entraînement (${job}${first ? ', passe doublée : verdict sur elle seule (A1.3)' : ''})`, '');
  const xs = [
    ['J70', 0.7],
    ['J85', 0.85],
    ['J100', 1],
  ] as const;
  const status: Record<string, Status> = {};
  for (const [arm, x] of xs) {
    const perPop: Status[] = [];
    for (const p of PRINCIPAL) {
      const popRows = rows.filter((r) => r.population === p);
      const jr = armRows(popRows, arm, switched);
      const a = criteriaA65(jr, `train ${arm} ${p}`);
      const s5 = pairedCrit(pairs(popRows, 'A', arm, switched), 'S5', lt0, `train ${arm} ${p} S5`);
      const st = combine([a.status, s5.status]);
      perPop.push(st);
      critTable(`X = ${pc(x).replace(',00', '')}, ${p} : ${st}`, [...a.crits, ...s5.crits]);
    }
    status[arm] = combine(perPop);
  }
  let retained: number | 'doubled' = 1;
  for (const [arm, x] of xs) {
    if (status[arm] === 'GO') {
      retained = x;
      break;
    }
    if (status[arm] === 'INCONCLUSIF') {
      retained = 'doubled';
      break;
    }
  }
  verdicts.training = { status, retained, judgedJob: job };
  md.push(`**Règle de sélection (7.1)** : statuts J70 ${status.J70}, J85 ${status.J85}, J100 ${status.J100} → ${retained === 'doubled' ? 'passe doublée de l’entraînement nécessaire (A5.1)' : `X retenu = ${pc(retained).replace(',00', '')}`}.`, '');
  proposalTable(armRows(rows, 'A').length ? rows : [], PRINCIPAL);
  if (first) md.push('Première passe : bruts conservés (c1train), rapportée au moment de son exécution ; le verdict repose sur la passe doublée seule.', '');
}

/** One validation population: criteria of J with verdict, C without, comparisons, reported tables. Returns the blocking status. */
function validationPopulation(rows: readonly Row[], p: string, withP00: boolean, step: string): { blocking: Status; a21: Status } {
  const popRows = rows.filter((r) => r.population === p);
  md.push(`### ${p}`, '');
  const nf = armRows(popRows, 'A', (r) => r.behavior === 'nonfollower');
  const sw = nf.filter(switched);
  md.push(`Non-suiveurs : ${nf.length}, basculés (proposition acceptée) : ${sw.length}, sans proposition : ${nf.filter(noProposal).length}. Suiveurs : ${armRows(popRows, 'A', (r) => r.behavior === 'follower').length}.`, '');
  const j = criteriaA65(armRows(popRows, 'J', switched), `${step} ${p} J`);
  critTable(`Bras J, critères de A6.5 (verdict) : ${j.status}`, j.crits);
  const s5 = pairedCrit(pairs(popRows, 'A', 'J', switched), 'S5 (J − A)', lt0, `${step} ${p} S5`);
  critTable(`S5 : ${s5.status}`, s5.crits);
  const s6 = pairedCrit(pairs(popRows, 'A', 'J', (r) => r.behavior === 'follower'), 'S6 (suiveurs, J − A)', le005, `${step} ${p} S6`);
  critTable(`S6 : ${s6.status}`, s6.crits);
  const statuses: Status[] = [j.status, s5.status, s6.status];
  if (withP00) {
    const p00 = pairedCrit(pairs(popRows, 'JN', 'J', switched), 'P00 (J − J-NASEM)', le005, `${step} ${p} P00`);
    critTable(`P00 : ${p00.status}`, p00.crits);
    statuses.push(p00.status);
    const jn = criteriaA65(armRows(popRows, 'JN', switched), `${step} ${p} JN (rapporté)`, false);
    critTable('Bras J-NASEM, critères de A6.5 (rapportés, sans verdict)', jn.crits.map((c) => ({ ...c, status: 'rapporté' as const })));
  }
  const b = s5b(popRows, `${step} ${p}`);
  critTable(`S5b, règle de décision de A2.1 : ${b.status}`, b.crits);
  const c = criteriaA65(armRows(popRows, 'C', switched), `${step} ${p} C (rapporté)`);
  critTable('Bras C, critères de A6.5 (rapportés, sans verdict)', c.crits.map((x) => ({ ...x, status: 'rapporté' as const })));
  const aRep = criteriaA65(armRows(popRows, 'A', switched), `${step} ${p} A (rapporté)`);
  critTable('Bras A, non-suiveurs basculés (rapportés, sans verdict)', aRep.crits.map((x) => ({ ...x, status: 'rapporté' as const })));
  s2Table(popRows, withP00 ? ['J', 'C', 'A', 'JN'] : ['J', 'C', 'A']);
  s7Table(popRows, withP00 ? ['A', 'J', 'C', 'JN'] : ['A', 'J', 'C']);
  reportedTable(popRows, withP00 ? ['A', 'J', 'C', 'JN'] : ['A', 'J', 'C']);
  guardTable(popRows, withP00 ? ['A', 'J', 'C', 'JN'] : ['A', 'J', 'C']);
  proposalTable(popRows, [p]);
  factorTable(popRows);
  strataTable(popRows, p);
  const blocking = combine(statuses);
  verdicts[`${step} ${p} blocking`] = blocking;
  md.push(`**${p} : critères bloquants de C1 ${blocking} ; règle de A2.1 ${b.status}.**`, '');
  return { blocking, a21: b.status };
}

function validationV1(): void {
  const { rows, job, first } = judged('c1v1', 'c1v1');
  if (rows.length === 0) return;
  md.push(`## 4. C1, validation V1 : P00 (${job}${first ? ', passe doublée : verdict sur elle seule (A1.3)' : ''})`, '');
  const r = validationPopulation(rows, 'P00', true, 'V1');
  const stop = r.blocking !== 'GO' || r.a21 !== 'GO';
  verdicts.V1 = { job, blocking: r.blocking, a21: r.a21, stop, doubledNeeded: !first && (r.blocking === 'INCONCLUSIF' || r.a21 === 'INCONCLUSIF') && r.blocking !== 'NO-GO' && r.a21 !== 'NO-GO' };
  md.push(`**Arrêt V1 (A6.3)** : ${stop ? 'OUI' : 'non'} (critères bloquants ${r.blocking}, A2.1 ${r.a21}).`, '');
}

function validationV2(): void {
  const { rows, job, first } = judged('c1v2', 'c1v2');
  if (rows.length === 0) return;
  md.push(`## 5. C1, validation V2 : P05, P10, P20 (${job}${first ? ', passe doublée : verdict sur elle seule (A1.3)' : ''})`, '');
  const out: Record<string, { blocking: Status; a21: Status }> = {};
  for (const p of ['P05', 'P10', 'P20']) out[p] = validationPopulation(rows, p, false, 'V2');
  const sens = judged('c1v2', 'c1sens');
  const sensStatus: Record<string, Status> = {};
  if (sens.rows.length > 0) {
    md.push(`### Sensibilités [S] (${sens.job})`, '');
    for (const p of ['P10_sd20', 'P10_slope-5', 'P10_slope-10']) {
      const jr = armRows(sens.rows.filter((r) => r.population === p), 'J', switched);
      const a = criteriaA65(jr, `sens ${p}`);
      const safety = a.crits.filter((c) => c.name.startsWith('S3') || c.name.startsWith('S4'));
      sensStatus[p] = combine(safety.map((c) => c.status as Status));
      critTable(`${p} (${jr.length} basculés) : [S] ${sensStatus[p]} ; S1 rapporté`, a.crits.map((c) => (c.name.startsWith('S1') ? { ...c, status: 'rapporté' as const } : c)));
    }
  }
  const robust = load('c1v2', 'c1robust');
  if (robust.length > 0) {
    md.push('### Robustesse (rapportée) : stabilité du maintien affiché', '');
    table(
      ['Bras', 'Basculés', 'Variation hebdomadaire médiane du maintien affiché (kcal/j) [P10 ; P90]'],
      ['J', 'C'].map((arm) => {
        const v = sortNum(armRows(robust, arm, switched).map((r) => n(r, 'display_mean_abs_change')).filter(Number.isFinite));
        return [arm, String(v.length), `${f1(quantile(v, 0.5))} [${f1(quantile(v, 0.1))} ; ${f1(quantile(v, 0.9))}]`];
      }),
    );
  }
  const accept = load('c1v2', 'c1accept');
  if (accept.length > 0) {
    md.push('### Acceptation à 70 % (rapportée, sans verdict)', '');
    const nfA = armRows(accept, 'A', (r) => r.behavior === 'nonfollower');
    md.push(`Propositions : ${nfA.filter((r) => r.proposal_day !== '').length} / ${nfA.length} ; acceptées : ${nfA.filter(switched).length}.`, '');
    const j = criteriaA65(armRows(accept, 'J', switched), 'accept70 J (rapporté)');
    critTable('Bras J (rapporté)', j.crits.map((c) => ({ ...c, status: 'rapporté' as const })));
    const s5 = pairedCrit(pairs(accept, 'A', 'J', switched), 'S5 (J − A)', lt0, 'accept70 S5 (rapporté)');
    critTable('S5 (rapporté)', s5.crits.map((c) => ({ ...c, status: 'rapporté' as const })));
  }
  const v1 = verdicts.V1 as { blocking: Status; a21: Status } | undefined;
  const allA21 = combine([v1?.a21 ?? 'NON JUGEABLE', ...Object.values(out).map((o) => o.a21)]);
  const allBlocking = combine([v1?.blocking ?? 'NON JUGEABLE', ...Object.values(out).map((o) => o.blocking), ...Object.values(sensStatus)]);
  verdicts.V2 = { job, populations: out, sensitivities: sensStatus, sensJob: sens.job, c1: allBlocking, a21: allA21 };
  md.push(`**C1 (quatre populations et sensibilités [S]) : ${allBlocking}. Règle de A2.1 dans les quatre populations : ${allA21}.**`, '');
}

function carbs(): void {
  const { rows, job, first } = judged('carbs', 'carbs');
  if (rows.length === 0) return;
  md.push(`## 6. Glucides (${job}${first ? ', passe doublée' : ''})`, '');
  const worlds = ['base', 'minus10', 'plus10', 'selective'];
  const st: Record<string, Status> = {};
  for (const w of worlds) {
    for (const arm of ['J', 'JG']) {
      const a = criteriaA65(armRows(rows.filter((r) => r.carb_world === w), arm, switched), `carbs ${w} ${arm}`);
      st[`${w} ${arm}`] = a.status;
      critTable(`Monde ${w}, bras ${arm} : ${a.status}`, a.crits);
    }
  }
  const biasLines: string[][] = [];
  const a22: Status[] = [];
  for (const w of worlds) {
    for (const day of ['28', '42']) {
      const ps = pairs(rows, 'J', 'JG', (r) => switched(r) && r.carb_world === w)
        .map((p) => ({ a: Math.abs(n(p.ra, `bias${day}`)), b: Math.abs(n(p.rb, `bias${day}`)), sa: n(p.ra, `bias${day}`), sb: n(p.rb, `bias${day}`) }))
        .filter((p) => Number.isFinite(p.a) && Number.isFinite(p.b));
      const d = pairedMeanDiff(ps, SEED_2R);
      const signedJ = ps.reduce((s, p) => s + p.sa, 0) / ps.length;
      const signedG = ps.reduce((s, p) => s + p.sb, 0) / ps.length;
      const rule = w === 'minus10' || w === 'plus10' ? upperStatus(d, 0, d.users, true) : upperStatus(d, 10, d.users);
      a22.push(rule);
      biasLines.push([w, day, String(d.users), `${f1(signedJ)} / ${f1(signedG)}`, `${f1(d.meanA)} / ${f1(d.meanB)}`, `${f1(d.value)} [${f1(d.lo)} ; ${f1(d.hi)}]`, w === 'minus10' || w === 'plus10' ? '< 0' : '≤ +10', rule]);
    }
  }
  md.push('**Biais du maintien affiché (unités de saisie), J et J-glucides appariés**', '');
  table(['Monde', 'Jour', 'Utilisateurs', 'Biais moyen J / JG', '|Biais| moyen J / JG', 'Δ |biais| JG − J [IC 95 %]', 'Seuil (borne haute)', 'Statut'], biasLines);
  const a11 = combine([st['minus10 J'] as Status, st['plus10 J'] as Status]);
  const a22s = combine([...worlds.map((w) => st[`${w} JG`] as Status), ...a22]);
  verdicts.carbs = { job, a11, a22: a22s, worlds: st };
  md.push(`**A1.1 (bras J, mondes −10 et +10) : ${a11}. A2.2 (glucides saisis retenus) : ${a22s}.**`, '');
}

function c2(): void {
  const { rows, job } = judged('c2', 'c2');
  if (rows.length === 0) return;
  md.push(`## 7. C2 (${job})`, '');
  const out: Record<string, Status> = {};
  for (const m of ['rigour_ramp', 'rigour_step', 'relax', 'oscillation']) {
    const jr = armRows(rows.filter((r) => r.motif === m), 'J', (r) => switched(r) && r.ref2r !== '');
    const dur = bootstrapQuantile(jr.map((r) => [n(r, 'c2_above_days')]), 0.5, SEED_2R);
    const durStatus = upperStatus(dur, 21, dur.users);
    const a = criteriaA65(jr, `c2 ${m}`, false);
    const crits = [{ name: 'Durée médiane au-dessus de 1,25 × la vitesse demandée (tissus) [S]', value: `${ci(dur)} j (n = ${dur.users})`, status: durStatus } as Crit, ...a.crits.filter((c) => !c.name.startsWith('S1'))];
    out[m] = combine(crits.map((c) => c.status as Status));
    critTable(`Motif ${m} : ${out[m]}`, crits);
  }
  verdicts.c2 = { job, motifs: out, status: combine(Object.values(out)) };
}

function c6(): void {
  const { rows, job } = judged('c6', 'c6');
  if (rows.length === 0) return;
  md.push(`## 8. C6 (${job})`, '');
  const out: Record<string, Status> = {};
  for (const arm of ['J', 'Jfloor1']) {
    const jr = armRows(rows, arm, (r) => switched(r) && r.ref2r !== '');
    const p = s4p(jr);
    const j = s4j(jr);
    const ea = bootstrapShare(jr.map((r) => [n(r, 'ea_missed'), n(r, 'ea_cases')] as const), SEED_2R);
    const prot = jr.filter((r) => Number.isFinite(n(r, 'protein_ratio')));
    const k = prot.filter((r) => n(r, 'protein_ratio') < 0.9).length;
    const w = wilson(k, prot.length);
    const falseA = jr.reduce((s, r) => s + n(r, 'ea_false_alerts'), 0);
    const warned = jr.reduce((s, r) => s + n(r, 'ea_warned'), 0);
    const crits: Crit[] = [
      { name: 'S4-P [S]', value: `${p.days} jour(s)`, status: p.status },
      { name: 'S4-J [S]', value: `${j.k} / ${j.n} = ${pci(j.w)}`, status: j.status },
      { name: 'Alertes EA manquées ≤ 10 %', value: `${ea.k} / ${ea.n} périodes = ${pci(ea)}`, status: upperStatus(ea, 0.1, ea.users) },
      { name: 'Protéines réelles < 90 % de la règle ≤ 5 %', value: `${k} / ${prot.length} = ${pci(w)}`, status: upperStatus(w, 0.05, prot.length) },
      { name: 'Faux déclenchements EA', value: `${falseA} / ${warned} périodes averties`, status: 'rapporté' },
    ];
    out[arm] = combine(crits.map((c) => c.status).filter((s): s is Status => s !== 'rapporté'));
    critTable(`Bras ${arm} (${jr.length} basculés) : ${out[arm]}`, crits);
  }
  verdicts.c6 = { job, arms: out };
}

function timing(): void {
  const path = `${DIR}/timing/launch-times.txt`;
  if (!existsSync(path)) return;
  md.push('## 9. Temps de calcul (lancements)', '', '```', readFileSync(path, 'utf8').trim(), '```', '');
}

it('relaunch tables and verdicts', () => {
  md.push('# Reprise de l’itération 2 : tableaux et verdicts (reconstruits depuis les bruts)', '', 'Script : tests/experiments-journal/it2r/tables2r.experiment.ts. Ratios sur la masse tissulaire (A4.1), blocs à changement d’objectif exclus (A5.4, A6.5).', '');
  training();
  validationV1();
  validationV2();
  carbs();
  c2();
  c6();
  timing();
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${DIR}/tables2r.md`, `${md.join('\n')}\n`);
  writeFileSync(`${DIR}/verdicts2r.json`, `${JSON.stringify(verdicts, null, 2)}\n`);
});
