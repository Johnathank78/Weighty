/**
 * Iteration 2c (prompt 39): tables and verdicts rebuilt from the raw exports only. Committed before any measurement.
 * Run: npx vitest run -c vitest.journal.config.ts it2c/tables2c
 * Reads tests/experiments-journal/results/guardrails2c/ and writes tables2c.md and verdicts2c.json there.
 *
 * Definitions (THRESHOLDS.md, amendments 4 and 5; prompt 39 s3.2), fixed before any result was read:
 * - Tissue ratio of a 4-week block (A4.1, raw column tratio_b<k>): OLS slope of the true tissue mass over the block /
 *   (rate of the active plan x true weight at the block start). Blocks where the goal of the plan in force changes within
 *   the block (raw goal_change_b<k>) are excluded from the rate ratios of S1, S2-NI and A3.1 (A5.4), counted and reported.
 * - A3.1 (ideal world, K2 + G, 4.2), unchanged: for loss and gain, in each window (weeks 5-12 = blocks 1-2, weeks 13-24 =
 *   blocks 3-5) median ratio and its 95 % CI inside [0.95 ; 1.05]; for each block, median and CI inside [0.90 ; 1.10].
 * - In-loop isolation (4.2): users of the ideal job where no guardrail event occurs under K2 + G (neither applied nor
 *   failed) have raw rows identical to K2 in every column but the arm name.
 * - Amended A3.2 (A5.4, realistic world, candidate K2 + G, control of S2-NI: S0 + G):
 *   - S1: median tissue ratio and CI inside [0.85 ; 1.15] per goal (loss, gain) and window (excluded blocks left out);
 *   - S3-P [S]: weekly evaluations after which the plan in force prescribes a loss under BMI 20 of the app weight, or a rate
 *     above the cap of that BMI (raw s3p_violations): invariant 0;
 *   - S3-D [S]: user-blocks (weeks 5 to 24, all goals, every block) whose delivered tissue rate exceeds 1.25 x the cap (raw
 *     s3d_over, s3d_blocks): share <= 5 %, upper bound of the bootstrap CI over users (A5.1);
 *   - S4-P [S]: days whose prescribed target is under the app floor of the plan in force (raw s4p_days): invariant 0;
 *   - S2-NI: in each cell goal x window x requested rate with at least 100 users having ratios in both arms, paired
 *     Delta(P90 / median) of the tissue ratio, candidate - control, upper bound of the paired bootstrap CI <= +0.05; the
 *     P90 - median gap is reported alongside.
 * - Original criteria (reported for every arm, no verdict), computed as in 2b (no block exclusion): S1, S2 (P90 of the
 *   tissue ratio, upper bound <= 1.25), S3 on the tissue mass (user-weeks; CI by bootstrap over users, A5.1), S4 (users with
 *   >= 7 days of real intake under the real floor, Wilson), S7 (maintenance, zone of the target at 8 weeks, Wilson); S7
 *   centred on the true starting weight; users whose target spends >= 7 days less than 10 % above the app floor; minimum
 *   gap target - real floor.
 * - Status of a criterion (common rule of THRESHOLDS.md, A5.1): band criteria pass when value and CI are inside the band,
 *   fail when the CI lies entirely outside, are INCONCLUSIF otherwise; upper-bound criteria pass when the upper bound is at
 *   most the threshold, fail when the lower bound exceeds it, are INCONCLUSIF otherwise; invariants pass at 0 and fail
 *   otherwise. A verdict fails when a criterion fails, is INCONCLUSIF when none fails and one is inconclusive. An
 *   INCONCLUSIF verdict gets one doubled pass with new seeds (ideal2cx2, real2cx2; A1.3, A5.1) and rests on it alone.
 * Bootstrap: 2 000 resamples of users, seed 39 000 001. Wilson 95 % for proportions of users.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { RESULTS } from '../it2/jobs';
import { bootstrapQuantile, f0, f1, f3, goalFr, median, paired, pairedMedianDiff, pc, quantile, readAll, sortNum, userKey, wilson } from '../it2b/stats2b';
import type { Row, Stat } from '../it2b/stats2b';
import { GUARD2C_DIR } from './jobs2c';
import { SEED_2C, bootstrapShare, pairedDispersionDiff } from './stats2c';
import type { Share } from './stats2c';

/** Results directory; IT2C_TABLES_DIR only redirects a debugging run on the pilot outputs (no result used). */
const DIR = process.env.IT2C_TABLES_DIR ?? `${RESULTS}/${GUARD2C_DIR}`;
const WINDOWS: Array<[string, string, number[]]> = [
  ['w1', 'semaines 5 à 12', [1, 2]],
  ['w2', 'semaines 13 à 24', [3, 4, 5]],
  ['all', 'semaines 5 à 24', [1, 2, 3, 4, 5]],
];
const ARM_ORDER = ['S0', 'K2', 'S0G', 'K2G'];
const armFr: Record<string, string> = { S0: 'S0', K2: 'K2', S0G: 'S0 + G', K2G: 'K2 + G' };
const STRATA: Array<[string, string]> = [
  ['sex', 'sexe'],
  ['bmi_class', 'classe d’IMC'],
  ['activity', 'activité'],
  ['goal', 'objectif'],
  ['requested_rate', 'vitesse demandée'],
];

const included = (r: Row, b: number) => r[`goal_change_b${b}`] !== '1';
/** Ratios of the given blocks; `exclude`: blocks with a goal change left out (A5.4). */
const blocksOf = (r: Row, blocks: readonly number[], metric = 'tratio', exclude = true) =>
  blocks
    .filter((b) => !exclude || included(r, b))
    .map((b) => r[`${metric}_b${b}`])
    .filter((v) => v !== '' && v !== undefined)
    .map(Number);
const num = (r: Row, k: string) => Number(r[k] ?? 0);
const q = (byUser: ReadonlyArray<readonly number[]>, p: number) => bootstrapQuantile(byUser, p, SEED_2C);
const inside = (s: Stat, lo: number, hi: number) => s.value >= lo && s.value <= hi && s.lo >= lo && s.hi <= hi;
const rateFr = (v: string) => `${(100 * Number(v)).toFixed(2).replace('.', ',')} %/sem.`;

type Status = 'pass' | 'inconclusive' | 'fail';
const bandStatus = (s: Stat, lo: number, hi: number): Status => (inside(s, lo, hi) ? 'pass' : s.lo > hi || s.hi < lo ? 'fail' : 'inconclusive');
const upperStatus = (value: number, lo: number, hi: number, t: number): Status => (hi <= t && value <= t ? 'pass' : lo > t ? 'fail' : 'inconclusive');
const zeroStatus = (n: number): Status => (n === 0 ? 'pass' : 'fail');
const combine = (s: readonly Status[]): Status => (s.includes('fail') ? 'fail' : s.includes('inconclusive') ? 'inconclusive' : 'pass');
const statusFr: Record<Status, string> = { pass: 'passe', inconclusive: '**INCONCLUSIF**', fail: '**échoue**' };
const verdictFr: Record<Status, string> = { pass: 'PASSÉ', inconclusive: 'INCONCLUSIF', fail: 'ÉCHOUÉ' };
const ci = (s: { value?: number; p?: number; lo: number; hi: number }, fmt = f3) => `${fmt((s.value ?? s.p) as number)} [${fmt(s.lo)} ; ${fmt(s.hi)}]`;
const share = (s: Share) => `${s.k} / ${s.n} = ${pc(s.p)} [${pc(s.lo)} ; ${pc(s.hi)}]`;
const wil = (k: number, n: number) => {
  const w = wilson(k, n);
  return { k, n, ...w, text: `${k} / ${n} = ${pc(w.p)} [${pc(w.lo)} ; ${pc(w.hi)}]` };
};
const armsOf = (rows: readonly Row[]) => ARM_ORDER.filter((a) => rows.some((r) => r.solver_arm === a));
const byArm = (rows: readonly Row[], arm: string) => rows.filter((r) => r.solver_arm === arm);
const byGoalCount = (rows: readonly Row[], g: string) => new Set(rows.filter((r) => r.goal === g).map(userKey)).size;

type Check = { criterion: string; goal: string; unit: string; stat: Stat; band: [number, number]; status: Status };

/** A3.1 criteria of one arm, tissue ratio, excluded blocks left out. */
function a31Checks(rows: readonly Row[], arm: string): Check[] {
  const checks: Check[] = [];
  for (const goal of ['loss', 'gain']) {
    const sel = rows.filter((r) => r.solver_arm === arm && r.goal === goal);
    for (const [wk, , blocks] of WINDOWS.slice(0, 2)) {
      const s = q(sel.map((r) => blocksOf(r, blocks)), 0.5);
      checks.push({ criterion: 'fenêtre', goal, unit: wk, stat: s, band: [0.95, 1.05], status: bandStatus(s, 0.95, 1.05) });
    }
    for (let b = 1; b <= 5; b++) {
      const s = q(sel.map((r) => blocksOf(r, [b])), 0.5);
      checks.push({ criterion: 'bloc', goal, unit: `b${b}`, stat: s, band: [0.9, 1.1], status: bandStatus(s, 0.9, 1.1) });
    }
  }
  return checks;
}

function checksTable(md: string[], title: string, checks: readonly Check[]): void {
  md.push(title, '', '| Critère | Objectif | Unité | Blocs (utilisateurs) | Médiane tissus [IC 95 %] | Bande | Statut |', '|---|---|---|---|---|---|---|');
  for (const c of checks) md.push(`| ${c.criterion} | ${goalFr(c.goal)} | ${c.unit} | ${c.stat.n} (${c.stat.users}) | ${ci(c.stat)} | [${f3(c.band[0])} ; ${f3(c.band[1])}] | ${statusFr[c.status]} |`);
  md.push('');
}

/** Medians per window and per block (tissue, total weight), paired differences, excluded blocks, strata. */
function ratioTables(md: string[], rows: readonly Row[], arms: readonly string[], pairs: ReadonlyArray<[string, string]>, out: Record<string, unknown>): void {
  md.push('### Médianes par fenêtre, blocs exclus retirés [IC 95 %]', '', '| Bras | Objectif | Fenêtre | Blocs (utilisateurs) | Tissus | P10 / P90 tissus | Poids total |', '|---|---|---|---|---|---|---|');
  for (const arm of arms) {
    for (const goal of ['loss', 'gain']) {
      const sel = rows.filter((r) => r.solver_arm === arm && r.goal === goal);
      for (const [wk, wname, blocks] of WINDOWS) {
        const t = q(sel.map((r) => blocksOf(r, blocks)), 0.5);
        const w = q(sel.map((r) => blocksOf(r, blocks, 'ratio')), 0.5);
        out[`${arm}_${goal}_${wk}`] = { tissue: t, weight: w };
        md.push(`| ${armFr[arm]} | ${goalFr(goal)} | ${wname} | ${t.n} (${t.users}) | ${ci(t)} | ${f3(t.p10)} / ${f3(t.p90)} | ${ci(w)} |`);
      }
    }
  }
  md.push('', '### Médianes par bloc de 4 semaines, tissus, blocs exclus retirés [IC 95 %]', '', '| Bras | Objectif | Semaines 5-8 | 9-12 | 13-16 | 17-20 | 21-24 |', '|---|---|---|---|---|---|---|');
  for (const arm of arms) {
    for (const goal of ['loss', 'gain']) {
      const cells: string[] = [];
      for (let b = 1; b <= 5; b++) cells.push(ci(q(rows.filter((r) => r.solver_arm === arm && r.goal === goal).map((r) => blocksOf(r, [b])), 0.5)));
      md.push(`| ${armFr[arm]} | ${goalFr(goal)} | ${cells.join(' | ')} |`);
    }
  }
  md.push('', '### Blocs exclus des ratios (changement d’objectif du plan en cours de bloc)', '', '| Bras | Objectif | Utilisateurs-blocs exclus | Utilisateurs concernés | Sem. 5-8 | 9-12 | 13-16 | 17-20 | 21-24 |', '|---|---|---|---|---|---|---|---|---|');
  for (const arm of arms) {
    for (const goal of ['loss', 'gain', 'maintenance']) {
      const sel = rows.filter((r) => r.solver_arm === arm && r.goal === goal);
      const perBlock = [1, 2, 3, 4, 5].map((b) => sel.filter((r) => !included(r, b)).length);
      const total = sel.reduce((s, r) => s + num(r, 'excluded_blocks'), 0);
      out[`excluded_${arm}_${goal}`] = { total, users: sel.filter((r) => num(r, 'excluded_blocks') > 0).length, perBlock };
      md.push(`| ${armFr[arm]} | ${goalFr(goal)} | ${total} | ${sel.filter((r) => num(r, 'excluded_blocks') > 0).length} | ${perBlock.join(' | ')} |`);
    }
  }
  md.push('', '### Différences appariées de médiane, tissus, blocs exclus retirés (bras b − bras a)', '', '| a → b | Objectif | Fenêtre | Δ médiane [IC 95 %] |', '|---|---|---|---|');
  for (const [a, b] of pairs) {
    for (const goal of ['loss', 'gain']) {
      for (const [wk, wname, blocks] of WINDOWS) {
        const d = pairedMedianDiff(paired(rows.filter((r) => r.goal === goal), a, b).map(({ ra, rb }) => ({ a: blocksOf(ra, blocks), b: blocksOf(rb, blocks) })), SEED_2C);
        out[`diff_${a}_${b}_${goal}_${wk}`] = d;
        md.push(`| ${armFr[a]} → ${armFr[b]} | ${goalFr(goal)} | ${wname} | ${ci(d)} |`);
      }
    }
  }
  md.push('');
}

/** Guardrail events of one arm: users, events, day and app BMI, failures one by one. */
function guardTable(md: string[], rows: readonly Row[], arms: readonly string[], out: Record<string, unknown>): void {
  md.push('### Événements des garde-fous (G1, G2)', '', '| Bras | Utilisateurs G1 | Événements G1 | Jour G1 médiane [P10 ; P90] (min – max) | IMC de l’app à G1 médiane (min – max) | Utilisateurs G2 | Événements G2 | Jour du premier G2 médiane [P10 ; P90] | IMC de l’app au premier G2 médiane (min – max) | Échecs de reconstruction |', '|---|---|---|---|---|---|---|---|---|---|');
  const failures: string[] = [];
  for (const arm of arms) {
    const sel = byArm(rows, arm);
    const g1 = sel.filter((r) => num(r, 'n_g1') > 0);
    const g2 = sel.filter((r) => num(r, 'n_g2') > 0);
    const d1 = sortNum(g1.map((r) => num(r, 'g1_day')));
    const b1 = sortNum(g1.map((r) => num(r, 'g1_bmi')));
    const d2 = sortNum(g2.map((r) => num(r, 'g2_first_day')));
    const b2 = sortNum(g2.map((r) => num(r, 'g2_first_bmi')));
    const nFailed = sel.reduce((s, r) => s + num(r, 'n_g_failed'), 0);
    for (const r of sel.filter((x) => num(x, 'n_g_failed') > 0)) {
      for (const e of (r.g_events ?? '').split('|').filter((x) => x.includes(':failed:'))) failures.push(`| ${armFr[arm]} | ${r.job} ${r.job_index} (graine ${r.master}) | ${goalFr(r.goal as string)} | ${r.bmi_class} | ${e} |`);
    }
    out[`guards_${arm}`] = {
      usersG1: g1.length,
      eventsG1: sel.reduce((s, r) => s + num(r, 'n_g1'), 0),
      dayG1: { median: quantile(d1, 0.5), p10: quantile(d1, 0.1), p90: quantile(d1, 0.9), min: d1[0] ?? null, max: d1[d1.length - 1] ?? null },
      bmiG1: { median: quantile(b1, 0.5), min: b1[0] ?? null, max: b1[b1.length - 1] ?? null },
      usersG2: g2.length,
      eventsG2: sel.reduce((s, r) => s + num(r, 'n_g2'), 0),
      dayG2: { median: quantile(d2, 0.5), p10: quantile(d2, 0.1), p90: quantile(d2, 0.9) },
      bmiG2: { median: quantile(b2, 0.5), min: b2[0] ?? null, max: b2[b2.length - 1] ?? null },
      failed: nFailed,
    };
    md.push(`| ${armFr[arm]} | ${g1.length} | ${sel.reduce((s, r) => s + num(r, 'n_g1'), 0)} | ${f0(quantile(d1, 0.5))} [${f0(quantile(d1, 0.1))} ; ${f0(quantile(d1, 0.9))}] (${d1[0] ?? '—'} – ${d1[d1.length - 1] ?? '—'}) | ${f3(quantile(b1, 0.5))} (${f3(b1[0] ?? Number.NaN)} – ${f3(b1[b1.length - 1] ?? Number.NaN)}) | ${g2.length} | ${sel.reduce((s, r) => s + num(r, 'n_g2'), 0)} | ${f0(quantile(d2, 0.5))} [${f0(quantile(d2, 0.1))} ; ${f0(quantile(d2, 0.9))}] | ${f3(quantile(b2, 0.5))} (${f3(b2[0] ?? Number.NaN)} – ${f3(b2[b2.length - 1] ?? Number.NaN)}) | ${nFailed} |`);
  }
  md.push('');
  if (failures.length > 0) md.push('Échecs de reconstruction, un par un (jour:règle:statut:IMC:raison:cible avant:cible après:vitesse avant:vitesse après) :', '', '| Bras | Utilisateur | Objectif | Classe d’IMC | Événement |', '|---|---|---|---|---|', ...failures, '');
  else md.push('Aucun échec de reconstruction d’un garde-fou.', '');
  out.guardFailures = failures;
}

/** 4.2 ideal world: in-loop isolation, A3.1 for K2 + G. */
function idealSection(md: string[], rows: readonly Row[], title: string): { isolation: boolean; a31: Status; out: Record<string, unknown> } {
  const out: Record<string, unknown> = {};
  md.push(`## ${title}`, '', `${new Set(rows.map(userKey)).size} utilisateurs (perte ${byGoalCount(rows, 'loss')}, prise ${byGoalCount(rows, 'gain')}, maintien ${byGoalCount(rows, 'maintenance')}), ${rows.length} lignes utilisateur × bras.`, '');
  // In-loop isolation: users without any guardrail event under K2 + G.
  let unfired = 0;
  let identical = 0;
  const differing: string[] = [];
  for (const { ra, rb } of paired(rows, 'K2', 'K2G')) {
    if ((rb.g_events ?? '') !== '') continue;
    unfired++;
    const keys = [...new Set([...Object.keys(ra), ...Object.keys(rb)])].filter((k) => k !== 'solver_arm');
    const diff = keys.filter((k) => (ra[k] ?? '') !== (rb[k] ?? ''));
    if (diff.length === 0) identical++;
    else differing.push(`${rb.job_index} (${diff.slice(0, 5).join(', ')})`);
  }
  const k2g = byArm(rows, 'K2G');
  const isolation = unfired === identical && byArm(rows, 'K2').every((r) => (r.g_events ?? '') === '');
  out.isolation = { unfired, identical, differing, pass: isolation, usersG1: k2g.filter((r) => num(r, 'n_g1') > 0).length, usersG2: k2g.filter((r) => num(r, 'n_g2') > 0).length, usersFailed: k2g.filter((r) => num(r, 'n_g_failed') > 0).length, usersAnyEvent: k2g.filter((r) => (r.g_events ?? '') !== '').length };
  md.push('### Contrôle d’isolement dans la boucle', '', `- Utilisateurs sans aucun événement de garde-fou sous K2 + G : ${unfired} ; lignes brutes identiques à K2 au bit près (toutes colonnes sauf le nom du bras) : **${identical} / ${unfired}**.`, `- Utilisateurs avec au moins un événement sous K2 + G : ${k2g.filter((r) => (r.g_events ?? '') !== '').length} ; G1 appliqué : ${k2g.filter((r) => num(r, 'n_g1') > 0).length} ; G2 appliqué : ${k2g.filter((r) => num(r, 'n_g2') > 0).length} ; échec : ${k2g.filter((r) => num(r, 'n_g_failed') > 0).length}.`, `- **Contrôle d’isolement : ${isolation ? 'PASSE' : 'ÉCHOUE'}**${differing.length > 0 ? ` (différences : ${differing.slice(0, 20).join(' ; ')})` : ''}.`, '');
  guardTable(md, rows, ['K2', 'K2G'], out);
  const checks = a31Checks(rows, 'K2G');
  const a31 = combine(checks.map((c) => c.status));
  checksTable(md, '### Verdict A3.1 (tissus, blocs exclus retirés selon A5.4), K2 + G', checks);
  md.push(`**A3.1, K2 + G : ${verdictFr[a31]}.**`, '');
  const ref = a31Checks(rows, 'K2');
  checksTable(md, '### Critères de A3.1 appliqués à K2 (rapporté, sans verdict)', ref);
  out.a31 = { status: a31, checks, k2: { status: combine(ref.map((c) => c.status)), checks: ref } };
  ratioTables(md, rows, ['K2', 'K2G'], [['K2', 'K2G']], out);
  strataTable(md, rows, ['K2', 'K2G'], out);
  return { isolation, a31, out };
}

/** S1 medians (excluded blocks left out), S3-D share and ends under BMI 20 per stratum. */
function strataTable(md: string[], rows: readonly Row[], arms: readonly string[], out: Record<string, unknown>): void {
  md.push('### Strates (médiane du ratio tissulaire, blocs exclus retirés ; S3-D ; fins sous IMC 20 vrai)', '', `| Strate | Valeur | Utilisateurs | ${arms.map((a) => `${armFr[a]} perte 5-12 / 13-24 | ${armFr[a]} prise 5-12 / 13-24 | ${armFr[a]} S3-D | ${armFr[a]} fins < IMC 20`).join(' | ')} |`, `|---|---|---|${arms.map(() => '---|---|---|---').join('|')}|`);
  const res: Record<string, unknown> = {};
  for (const [col, label] of STRATA) {
    for (const v of [...new Set(rows.map((r) => r[col] as string))].sort()) {
      const sel = rows.filter((r) => r[col] === v);
      const cells = arms.map((a) => {
        const s = sel.filter((r) => r.solver_arm === a);
        const m = (goal: string, blocks: number[]) => median(s.filter((r) => r.goal === goal).flatMap((r) => blocksOf(r, blocks)));
        const d = bootstrapShare(s.map((r) => [num(r, 's3d_over'), num(r, 's3d_blocks')] as const));
        const under = s.filter((r) => num(r, 'true_bmi_final') < 20).length;
        res[`${col}_${v}_${a}`] = { lossW1: m('loss', [1, 2]), lossW2: m('loss', [3, 4, 5]), gainW1: m('gain', [1, 2]), gainW2: m('gain', [3, 4, 5]), s3d: d, underBmi20: under, users: s.length };
        return `${f3(m('loss', [1, 2]))} / ${f3(m('loss', [3, 4, 5]))} | ${f3(m('gain', [1, 2]))} / ${f3(m('gain', [3, 4, 5]))} | ${pc(d.p)} [${pc(d.lo)} ; ${pc(d.hi)}] | ${under} / ${s.length}`;
      });
      md.push(`| ${label} | ${col === 'goal' ? goalFr(v) : col === 'requested_rate' ? rateFr(v) : v} | ${new Set(sel.map(userKey)).size} | ${cells.join(' | ')} |`);
    }
  }
  out.strata = res;
  md.push('');
}

type RealVerdict = { status: Status; checks: Record<string, unknown> };

/** 4.3 realistic world: amended A3.2 for K2 + G, the four arms reported. */
function realSection(md: string[], rows: readonly Row[], title: string): { a32: RealVerdict; out: Record<string, unknown> } {
  const out: Record<string, unknown> = {};
  const arms = armsOf(rows);
  md.push(`## ${title}`, '', `${new Set(rows.map(userKey)).size} suiveurs (perte ${byGoalCount(rows, 'loss')}, prise ${byGoalCount(rows, 'gain')}, maintien ${byGoalCount(rows, 'maintenance')}), bras ${arms.map((a) => armFr[a]).join(', ')}. Hall perturbé à ±20 %, pesées t + D + E, pas bruités.`, '');

  // Amended criteria, every arm.
  md.push('### Critères amendés (A5.4) : S1, S3-P, S3-D, S4-P', '', '| Bras | Objectif | Fenêtre | S1 tissus [IC 95 %] | Statut S1 |', '|---|---|---|---|---|');
  const amended: Record<string, Record<string, unknown>> = {};
  for (const arm of arms) {
    const a: Record<string, unknown> = {};
    for (const goal of ['loss', 'gain']) {
      for (const [wk, wname, blocks] of WINDOWS.slice(0, 2)) {
        const s = q(rows.filter((r) => r.solver_arm === arm && r.goal === goal).map((r) => blocksOf(r, blocks)), 0.5);
        const status = bandStatus(s, 0.85, 1.15);
        a[`S1_${goal}_${wk}`] = { stat: s, status };
        md.push(`| ${armFr[arm]} | ${goalFr(goal)} | ${wname} | ${ci(s)} | ${arm === 'K2G' ? statusFr[status] : `(info) ${statusFr[status]}`} |`);
      }
    }
    amended[arm] = a;
  }
  md.push('', '| Bras | S3-P : violations (évaluations contrôlées ; utilisateurs concernés) | S3-D : utilisateurs-blocs au-dessus de 1,25 × le plafond [IC bootstrap] | S4-P : jours sous le plancher de l’app (utilisateurs) | Statuts S3-P / S3-D / S4-P |', '|---|---|---|---|---|');
  for (const arm of arms) {
    const sel = byArm(rows, arm);
    const s3p = sel.reduce((s, r) => s + num(r, 's3p_violations'), 0);
    const s3pChecks = sel.reduce((s, r) => s + num(r, 's3p_checks'), 0);
    const s3pUsers = sel.filter((r) => num(r, 's3p_violations') > 0).length;
    const s3d = bootstrapShare(sel.map((r) => [num(r, 's3d_over'), num(r, 's3d_blocks')] as const));
    const s4p = sel.reduce((s, r) => s + num(r, 's4p_days'), 0);
    const s4pUsers = sel.filter((r) => num(r, 's4p_days') > 0).length;
    const st = { s3p: zeroStatus(s3p), s3d: upperStatus(s3d.p, s3d.lo, s3d.hi, 0.05), s4p: zeroStatus(s4p) };
    Object.assign(amended[arm] as Record<string, unknown>, { S3P: { violations: s3p, checks: s3pChecks, users: s3pUsers, status: st.s3p }, S3D: { ...s3d, status: st.s3d }, S4P: { days: s4p, users: s4pUsers, status: st.s4p } });
    const tag = (s: Status) => (arm === 'K2G' ? statusFr[s] : `(info) ${statusFr[s]}`);
    md.push(`| ${armFr[arm]} | ${s3p} (${s3pChecks} ; ${s3pUsers}) | ${share(s3d)} | ${s4p} (${s4pUsers}) | ${tag(st.s3p)} / ${tag(st.s3d)} / ${tag(st.s4p)} |`);
  }
  // S2-NI: candidate K2 + G against S0 + G (verdict); K2 against S0 (reported).
  md.push('', '### S2-NI : Δ(P90 / médiane) du ratio tissulaire, apparié (candidat − témoin), cellules objectif × fenêtre × vitesse demandée', '', '| Comparaison | Objectif | Fenêtre | Vitesse demandée | Utilisateurs appariés | P90 / médiane témoin | P90 / médiane candidat | Δ [IC 95 %] | Écart P90 − médiane témoin / candidat | Δ écart [IC 95 %] | Statut |', '|---|---|---|---|---|---|---|---|---|---|---|');
  const s2ni: Record<string, unknown> = {};
  const s2niStatuses: Status[] = [];
  for (const [ctrl, cand] of [
    ['S0G', 'K2G'],
    ['S0', 'K2'],
  ] as const) {
    if (!arms.includes(ctrl) || !arms.includes(cand)) continue;
    for (const goal of ['loss', 'gain']) {
      const rates = [...new Set(rows.filter((r) => r.goal === goal).map((r) => r.requested_rate as string))].sort((x, y) => Number(x) - Number(y));
      for (const rate of rates) {
        for (const [wk, wname, blocks] of WINDOWS.slice(0, 2)) {
          const pairs = paired(rows.filter((r) => r.goal === goal && r.requested_rate === rate), ctrl, cand).map(({ ra, rb }) => ({ a: blocksOf(ra, blocks), b: blocksOf(rb, blocks) }));
          const d = pairedDispersionDiff(pairs, SEED_2C);
          const judged = d.users >= 100;
          const status: Status | null = judged ? upperStatus(d.value, d.lo, d.hi, 0.05) : null;
          if (cand === 'K2G' && status) s2niStatuses.push(status);
          s2ni[`${cand}_${goal}_${rate}_${wk}`] = { ...d, judged, status };
          const tag = status === null ? 'non jugé (< 100 utilisateurs)' : cand === 'K2G' ? statusFr[status] : `(info) ${statusFr[status]}`;
          md.push(`| ${armFr[cand]} − ${armFr[ctrl]} | ${goalFr(goal)} | ${wname} | ${rateFr(rate)} | ${d.users} | ${f3(d.a.ratio)} | ${f3(d.b.ratio)} | ${ci(d)} | ${f3(d.a.gap)} / ${f3(d.b.gap)} | ${f3(d.gapValue)} [${f3(d.gapLo)} ; ${f3(d.gapHi)}] | ${tag} |`);
        }
      }
    }
  }
  const c = amended.K2G as Record<string, { status: Status }> | undefined;
  const statuses: Status[] = c ? [...['loss', 'gain'].flatMap((g) => ['w1', 'w2'].map((w) => (c[`S1_${g}_${w}`] as { status: Status }).status)), c.S3P?.status as Status, c.S3D?.status as Status, c.S4P?.status as Status, ...s2niStatuses] : ['fail'];
  const a32: RealVerdict = { status: combine(statuses), checks: { amended: amended.K2G, s2ni: Object.fromEntries(Object.entries(s2ni).filter(([k]) => k.startsWith('K2G_'))), s2niJudged: s2niStatuses.length } };
  md.push('', `**A3.2 amendé (A5.4), K2 + G : ${verdictFr[a32.status]}** (S1 ×4, S3-P, S3-D, S4-P, S2-NI sur ${s2niStatuses.length} cellules jugées).`, '');
  out.amended = amended;
  out.s2ni = s2ni;

  // Original criteria, every arm, no verdict.
  md.push('### Critères d’origine (sans verdict, calculés comme en 2b, sans exclusion de blocs)', '', '| Bras | Objectif | Fenêtre | S1 tissus [IC 95 %] | S2 P90 tissus [IC 95 %] (borne haute ≤ 1,25 ?) | S1 poids total | S2 P90 poids total |', '|---|---|---|---|---|---|---|');
  const original: Record<string, unknown> = {};
  for (const arm of arms) {
    for (const goal of ['loss', 'gain']) {
      for (const [wk, wname, blocks] of WINDOWS) {
        const sel = rows.filter((r) => r.solver_arm === arm && r.goal === goal);
        const s1 = q(sel.map((r) => blocksOf(r, blocks, 'tratio', false)), 0.5);
        const s2 = q(sel.map((r) => blocksOf(r, blocks, 'tratio', false)), 0.9);
        const w1 = q(sel.map((r) => blocksOf(r, blocks, 'ratio', false)), 0.5);
        const w2 = q(sel.map((r) => blocksOf(r, blocks, 'ratio', false)), 0.9);
        original[`${arm}_${goal}_${wk}`] = { s1, s2, s2Pass: s2.hi <= 1.25, weightS1: w1, weightS2: w2 };
        md.push(`| ${armFr[arm]} | ${goalFr(goal)} | ${wname} | ${ci(s1)} | ${ci(s2)} (${s2.hi <= 1.25 ? 'oui' : 'non'}) | ${ci(w1)} | ${ci(w2)} |`);
      }
    }
  }
  md.push('', '| Bras | S3 tissus : utilisateurs-semaines au-dessus du plafond [IC bootstrap] | S3 poids total [IC bootstrap] | S4 : utilisateurs ≥ 7 j sous le plancher réel [Wilson] | S7 : maintien dans la zone de la cible à 8 sem. [Wilson] | S7 centré sur le poids vrai de départ [Wilson] | Cible ≥ 7 j à moins de 10 % au-dessus du plancher de l’app [Wilson] | Écart min cible − plancher réel (kcal/j) : min ; P10 ; médiane ; utilisateurs < 0 | Écart min cible − plancher de l’app : min ; médiane |', '|---|---|---|---|---|---|---|---|---|');
  for (const arm of arms) {
    const sel = byArm(rows, arm);
    const s3 = bootstrapShare(sel.map((r) => [num(r, 's3t_above'), num(r, 's3t_weeks')] as const));
    const s3w = bootstrapShare(sel.map((r) => [num(r, 's3_above'), num(r, 's3_weeks')] as const));
    const s4 = wil(sel.filter((r) => num(r, 's4_below_floor_days') >= 7).length, sel.length);
    const maint = sel.filter((r) => r.goal === 'maintenance');
    const s7 = wil(maint.filter((r) => r.s7_in_zone_target === '1').length, maint.length);
    const s7t = wil(maint.filter((r) => r.s7_in_zone_true_start === '1').length, maint.length);
    const near = wil(sel.filter((r) => num(r, 'near_floor_days') >= 7).length, sel.length);
    const gr = sortNum(sel.map((r) => num(r, 'min_gap_real_floor')));
    const ga = sortNum(sel.map((r) => num(r, 'min_gap_app_floor')));
    original[`${arm}_other`] = { s3, s3w, s4, s7, s7TrueStart: s7t, nearFloor7: near, minGapReal: { min: gr[0], p10: quantile(gr, 0.1), median: quantile(gr, 0.5), negative: gr.filter((v) => v < 0).length }, minGapApp: { min: ga[0], median: quantile(ga, 0.5) } };
    md.push(`| ${armFr[arm]} | ${share(s3)} | ${share(s3w)} | ${s4.text} | ${s7.text} | ${s7t.text} | ${near.text} | ${f1(gr[0] ?? Number.NaN)} ; ${f1(quantile(gr, 0.1))} ; ${f1(quantile(gr, 0.5))} ; ${gr.filter((v) => v < 0).length} | ${f1(ga[0] ?? Number.NaN)} ; ${f1(quantile(ga, 0.5))} |`);
  }
  out.original = original;

  // Safety under BMI 20.
  md.push('', '### Sécurité sous IMC 20 (poids vrai)', '', '| Bras | Fins sous IMC 20 [Wilson] | dont perte | IMC vrai minimal : min ; P1 ; P5 ; P10 ; médiane | Utilisateurs dont l’IMC vrai passe sous 20 ; sous 18,5 | Plus bas (utilisateur, graine, IMC min, IMC final) |', '|---|---|---|---|---|---|');
  const safety: Record<string, unknown> = {};
  for (const arm of arms) {
    const sel = byArm(rows, arm);
    const under = wil(sel.filter((r) => num(r, 'true_bmi_final') < 20).length, sel.length);
    const underLoss = sel.filter((r) => r.goal === 'loss' && num(r, 'true_bmi_final') < 20).length;
    const mins = sortNum(sel.map((r) => num(r, 'true_bmi_min')));
    const lowest = [...sel].sort((x, y) => num(x, 'true_bmi_min') - num(y, 'true_bmi_min'))[0];
    safety[arm] = { under, underLoss, min: { min: mins[0], p1: quantile(mins, 0.01), p5: quantile(mins, 0.05), p10: quantile(mins, 0.1), median: quantile(mins, 0.5) }, below20: mins.filter((v) => v < 20).length, below185: mins.filter((v) => v < 18.5).length, lowest: lowest ? { index: lowest.job_index, master: lowest.master, min: num(lowest, 'true_bmi_min'), final: num(lowest, 'true_bmi_final'), goal: lowest.goal, bmiClass: lowest.bmi_class } : null };
    md.push(`| ${armFr[arm]} | ${under.text} | ${underLoss} | ${f3(mins[0] ?? Number.NaN)} ; ${f3(quantile(mins, 0.01))} ; ${f3(quantile(mins, 0.05))} ; ${f3(quantile(mins, 0.1))} ; ${f3(quantile(mins, 0.5))} | ${mins.filter((v) => v < 20).length} ; ${mins.filter((v) => v < 18.5).length} | ${lowest ? `${lowest.job_index}, ${lowest.master}, ${f3(num(lowest, 'true_bmi_min'))}, ${f3(num(lowest, 'true_bmi_final'))} (${goalFr(lowest.goal as string)}, IMC ${lowest.bmi_class})` : '—'} |`);
  }
  md.push('', '| Bras | Objectif | Classe d’IMC | Utilisateurs | Fins sous IMC 20 | IMC vrai minimal médian | IMC vrai final médian |', '|---|---|---|---|---|---|---|');
  for (const arm of arms) {
    for (const goal of ['loss', 'maintenance', 'gain']) {
      for (const bc of [...new Set(rows.map((r) => r.bmi_class as string))].sort()) {
        const s = rows.filter((r) => r.solver_arm === arm && r.goal === goal && r.bmi_class === bc);
        if (s.length === 0) continue;
        md.push(`| ${armFr[arm]} | ${goalFr(goal)} | ${bc} | ${s.length} | ${s.filter((r) => num(r, 'true_bmi_final') < 20).length} | ${f3(median(s.map((r) => num(r, 'true_bmi_min'))))} | ${f3(median(s.map((r) => num(r, 'true_bmi_final'))))} |`);
      }
    }
  }
  out.safety = safety;
  md.push('');
  guardTable(md, rows, arms, out);

  // Refused recalibrations and periodic replans, by reason.
  md.push('### Recalibrations et recalculs périodiques refusés, par raison', '', '| Bras | Recalibrations appliquées (médiane) | Recalibrations refusées (utilisateurs) : par raison | Recalculs périodiques faits | Recalculs refusés : par raison | Dus sans snapshot |', '|---|---|---|---|---|---|');
  const refusals: Record<string, unknown> = {};
  for (const arm of arms) {
    const sel = byArm(rows, arm);
    const recal = new Map<string, number>();
    for (const r of sel) for (const x of (r.plan_failures ?? '').split('/').filter((y) => y.length > 0)) recal.set(x.split(':')[1] ?? '', (recal.get(x.split(':')[1] ?? '') ?? 0) + 1);
    const replan = new Map<string, number>();
    let done = 0;
    let noSnap = 0;
    for (const r of sel)
      for (const item of (r.replans ?? '').split('|').filter((y) => y.length > 0)) {
        const [, status, , , , reason] = item.split(':');
        if (status === 'replanned') done++;
        else if (status === 'no_snapshot') noSnap++;
        else replan.set(reason ?? '', (replan.get(reason ?? '') ?? 0) + 1);
      }
    const fmt = (m: Map<string, number>) => ([...m.entries()].map(([k, v]) => `${k} ${v}`).join(', ') || '—');
    refusals[arm] = { recalApplied: median(sel.map((r) => num(r, 'n_recal'))), recalRefused: Object.fromEntries(recal), recalRefusedUsers: sel.filter((r) => (r.plan_failures ?? '') !== '').length, replans: done, replanRefused: Object.fromEntries(replan), noSnapshot: noSnap };
    md.push(`| ${armFr[arm]} | ${f1(median(sel.map((r) => num(r, 'n_recal'))))} | ${sel.filter((r) => (r.plan_failures ?? '') !== '').length} : ${fmt(recal)} | ${done} | ${fmt(replan)} | ${noSnap} |`);
  }
  out.refusals = refusals;

  // S3-D by goal, requested rate and BMI class; S3-P violations by goal and BMI class.
  md.push('', '### S3-D par objectif, vitesse demandée et classe d’IMC (utilisateurs-blocs au-dessus de 1,25 × le plafond [IC bootstrap])', '', `| Objectif | Vitesse demandée | Classe d’IMC | Utilisateurs | ${arms.map((a) => armFr[a]).join(' | ')} |`, `|---|---|---|---|${arms.map(() => '---').join('|')}|`);
  const s3dStrata: Record<string, unknown> = {};
  const cellsOf = (keys: Array<'goal' | 'requested_rate' | 'bmi_class'>) => [...new Set(rows.map((r) => keys.map((k) => r[k]).join('|')))].sort();
  for (const keys of [['goal'], ['goal', 'requested_rate'], ['goal', 'bmi_class'], ['goal', 'requested_rate', 'bmi_class']] as Array<Array<'goal' | 'requested_rate' | 'bmi_class'>>) {
    for (const cell of cellsOf(keys)) {
      const vals = cell.split('|');
      const sel = rows.filter((r) => keys.every((k, i) => r[k] === vals[i]));
      const get = (k: string) => (keys.includes(k as 'goal') ? vals[keys.indexOf(k as 'goal')] : undefined);
      const shares = arms.map((a) => bootstrapShare(sel.filter((r) => r.solver_arm === a).map((r) => [num(r, 's3d_over'), num(r, 's3d_blocks')] as const)));
      s3dStrata[`${keys.join('+')}:${cell}`] = Object.fromEntries(arms.map((a, i) => [a, shares[i]]));
      md.push(`| ${goalFr(get('goal') as string)} | ${get('requested_rate') !== undefined ? rateFr(get('requested_rate') as string) : 'toutes'} | ${get('bmi_class') ?? 'toutes'} | ${new Set(sel.map(userKey)).size} | ${shares.map((s) => `${s.k} / ${s.n} = ${pc(s.p)} [${pc(s.lo)} ; ${pc(s.hi)}]`).join(' | ')} |`);
    }
  }
  out.s3dStrata = s3dStrata;
  md.push('', '### S3-P : violations par objectif et classe d’IMC (évaluations hebdomadaires)', '', `| Objectif | Classe d’IMC | Utilisateurs | ${arms.map((a) => armFr[a]).join(' | ')} |`, `|---|---|---|${arms.map(() => '---').join('|')}|`);
  for (const cell of cellsOf(['goal', 'bmi_class'])) {
    const [goal, bc] = cell.split('|');
    const sel = rows.filter((r) => r.goal === goal && r.bmi_class === bc);
    md.push(`| ${goalFr(goal as string)} | ${bc} | ${new Set(sel.map(userKey)).size} | ${arms.map((a) => sel.filter((r) => r.solver_arm === a).reduce((s, r) => s + num(r, 's3p_violations'), 0)).join(' | ')} |`);
  }
  md.push('');
  const pairs: Array<[string, string]> = [];
  if (arms.includes('S0') && arms.includes('K2')) pairs.push(['S0', 'K2']);
  if (arms.includes('S0G') && arms.includes('K2G')) pairs.push(['S0G', 'K2G']);
  if (arms.includes('S0') && arms.includes('S0G')) pairs.push(['S0', 'S0G']);
  if (arms.includes('K2') && arms.includes('K2G')) pairs.push(['K2', 'K2G']);
  ratioTables(md, rows, arms, pairs, out);
  strataTable(md, rows, arms, out);
  return { a32, out };
}

/** Daily export: stratified sample and guardrail users (prompt 39 s3.2). */
function dailySummary(md: string[], job: string, out: Record<string, unknown>): void {
  const daily = readAll(DIR, `${job}-daily`);
  if (daily.length === 0) return;
  const users = new Map<string, boolean>();
  for (const r of daily) users.set(r.job_index as string, r.sampled === '1');
  const sampled = [...users.values()].filter((v) => v).length;
  out[`daily_${job}`] = { rows: daily.length, users: users.size, sampled, guardOnly: users.size - sampled };
  md.push(`- Export quotidien \`${job}\` : ${daily.length} lignes, ${users.size} utilisateurs (échantillon stratifié : ${sampled} ; hors échantillon, avec un garde-fou déclenché : ${users.size - sampled}).`);
}

it('iteration 2c tables', () => {
  const md: string[] = ['# Itération 2c : tableaux reconstruits depuis les bruts', '', 'Script : `tests/experiments-journal/it2c/tables2c.experiment.ts`. Bootstrap : 2 000 tirages d’utilisateurs, graine 39 000 001 ; Wilson pour les proportions d’utilisateurs. Ratio tissulaire (A4.1) ; blocs dont l’objectif du plan change en cours de bloc retirés des ratios de S1, S2-NI et A3.1 (A5.4).', ''];
  const verdicts: Record<string, unknown> = {};

  // 4.2 ideal world, then its doubled pass if any.
  const ideal = readAll(DIR, 'ideal2c');
  if (ideal.length > 0) {
    const first = idealSection(md, ideal, '4.2 Monde idéal (graines 3,6·10⁹) : isolement dans la boucle et A3.1 pour K2 + G');
    const x2 = readAll(DIR, 'ideal2cx2');
    const doubled = x2.length > 0 ? idealSection(md, x2, '4.2 bis Passe doublée du monde idéal (graines 3,9·10⁹, A1.3, A5.1)') : null;
    if (doubled && first.a31 !== 'inconclusive') throw new Error('doubled ideal pass without an inconclusive first pass');
    verdicts.ideal = { first: first.out, doubled: doubled?.out ?? null };
    verdicts.isolation = { first: first.isolation, doubled: doubled?.isolation ?? null, final: doubled ? doubled.isolation : first.isolation };
    verdicts.A31 = { first: first.a31, doubled: doubled?.a31 ?? null, final: doubled ? doubled.a31 : first.a31 };
    md.push(`**Synthèse 4.2 : isolement ${(doubled ? doubled.isolation : first.isolation) ? 'passe' : 'ÉCHOUE'} ; A3.1 (K2 + G) : ${verdictFr[doubled ? doubled.a31 : first.a31]}${doubled ? ' (passe doublée)' : ''}.**`, '');
  }

  // 4.3 realistic world, then its doubled pass if any.
  const real = readAll(DIR, 'real2c');
  if (real.length > 0) {
    const first = realSection(md, real, '4.3 Monde réaliste (graines 3,7·10⁹) : A3.2 amendé pour K2 + G, quatre bras');
    const x2 = readAll(DIR, 'real2cx2');
    const doubled = x2.length > 0 ? realSection(md, x2, '4.3 bis Passe doublée du monde réaliste (graines 4,0·10⁹, A1.3, A5.1)') : null;
    if (doubled && first.a32.status !== 'inconclusive') throw new Error('doubled realistic pass without an inconclusive first pass');
    verdicts.real = { first: first.out, doubled: doubled?.out ?? null };
    verdicts.A32 = { first: first.a32, doubled: doubled?.a32 ?? null, final: (doubled ?? first).a32.status };
    md.push(`**Synthèse 4.3 : A3.2 amendé (K2 + G) : ${verdictFr[(doubled ?? first).a32.status]}${doubled ? ' (passe doublée)' : ''}.**`, '');
  }

  md.push('## Exports quotidiens', '');
  const daily: Record<string, unknown> = {};
  for (const job of ['ideal2c', 'ideal2cx2', 'real2c', 'real2cx2']) dailySummary(md, job, daily);
  verdicts.daily = daily;
  md.push('');
  const launch = `${DIR}/timing/launch-times.txt`;
  if (existsSync(launch)) md.push('## Temps réel des lancements', '', '```', readFileSync(launch, 'utf8').trim(), '```', '');
  writeFileSync(`${DIR}/tables2c.md`, `${md.join('\n')}\n`);
  writeFileSync(`${DIR}/verdicts2c.json`, `${JSON.stringify(verdicts, null, 2)}\n`);
});
