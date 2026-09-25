/**
 * Iteration 2b (prompt 38): tables and verdicts rebuilt from the raw exports only.
 * Run: npx vitest run -c vitest.journal.config.ts it2b/tables2b
 * Reads tests/experiments-journal/results/solver2b/ and writes results/solver2b/tables2b.md and verdicts2b.json.
 *
 * Ratios (s4). Tissue (verdict, amendment 4 A4.1): OLS slope of the true tissue mass (fat + lean) over a 4-week block /
 * (rate of the active plan x true weight at the block start). Total weight (reported): definition of 2a, unchanged.
 *
 * Criteria (THRESHOLDS.md, amendments 3 and 4, and C1), fixed before any result was read:
 * - A3.1 on the tissue mass (A4.1): for loss and gain, in each window (weeks 5-12 = blocks 1-2, weeks 13-24 = blocks 3-5),
 *   median ratio and its 95 % CI inside [0.95 ; 1.05]; for each 4-week block, median and its 95 % CI inside [0.90 ; 1.10]
 *   (common rule: every criterion is judged on its 95 % CI, as in 2a).
 * - Selection A4.2 (selection seeds): retained = the candidate (K1, K2) passing every A3.1 criterion; both: K1; none: stop.
 * - Stop 2: control S0, total weight, weeks 5-24: 0.654 +/- 0.03 (loss) and 0.703 +/- 0.03 (gain), report 37.
 * - A3.2 (realistic world, followers, retained candidate): S1 median tissue ratio and CI inside [0.85 ; 1.15] per goal and
 *   window; S2 upper CI bound of the P90 of the tissue ratio <= 1.25 per goal and window; S3 Wilson upper bound of the share
 *   of user-weeks whose tissue slope / true weight exceeds the BMI rate cap <= 5 %; S4 share of followers with >= 7 days
 *   of real intake under the real floor <= 1 % and Wilson upper bound <= 2 %; S7 (on the weight, unchanged) Wilson lower
 *   bound of the share of maintenance followers inside the maintenance zone of their target at 8 weeks >= 80 %.
 * Bootstrap: 2 000 resamples of users, seed 38 000 001.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { RESULTS } from '../it2/jobs';
import { SOLVER2B_DIR } from './jobs2b';
import { B, SEED, bootstrapQuantile, f0, f1, f3, goalFr, median, paired, pairedMedianDiff, pc, quantile, readAll, sortNum, userKey, wilson } from './stats2b';
import type { Row, Stat } from './stats2b';

const DIR = `${RESULTS}/${SOLVER2B_DIR}`;
const WINDOWS: Array<[string, string, number[]]> = [
  ['w1', 'semaines 5 à 12', [1, 2]],
  ['w2', 'semaines 13 à 24', [3, 4, 5]],
  ['all', 'semaines 5 à 24', [1, 2, 3, 4, 5]],
];
const METRICS: Array<[string, string]> = [
  ['tratio', 'tissus'],
  ['ratio', 'poids total'],
];
const blocksOf = (r: Row, blocks: readonly number[], metric = 'tratio') => blocks.map((b) => r[`${metric}_b${b}`]).filter((v) => v !== '' && v !== undefined).map(Number);
const inside = (s: Stat, lo: number, hi: number) => s.value >= lo && s.value <= hi && s.lo >= lo && s.hi <= hi;
const armFr: Record<string, string> = { S0: 'S0 témoin', FX: 'FX (2a, sans recalcul)', K1: 'K1 (recalcul 28 j, horizon 42 j)', K2: 'K2 (recalcul 28 j, horizon 28 j)' };
const AGES: Array<[number, number]> = [
  [0, 7],
  [7, 14],
  [14, 21],
  [21, 28],
  [28, 42],
  [42, 1000],
];
const STRATA: Array<[string, string]> = [
  ['sex', 'sexe'],
  ['bmi_class', 'classe d’IMC'],
  ['activity', 'activité'],
  ['requested_rate', 'vitesse demandée'],
];

type Check = { criterion: string; goal: string; unit: string; stat: Stat; band: [number, number]; pass: boolean; pointPass: boolean };

/** A3.1 criteria of one arm on the tissue ratio (A4.1). */
function a31Checks(rows: readonly Row[], arm: string): Check[] {
  const checks: Check[] = [];
  for (const goal of ['loss', 'gain']) {
    const sel = rows.filter((r) => r.solver_arm === arm && r.goal === goal);
    for (const [wk, , blocks] of WINDOWS.slice(0, 2)) {
      const s = bootstrapQuantile(sel.map((r) => blocksOf(r, blocks)), 0.5);
      checks.push({ criterion: 'window', goal, unit: wk, stat: s, band: [0.95, 1.05], pass: inside(s, 0.95, 1.05), pointPass: s.value >= 0.95 && s.value <= 1.05 });
    }
    for (let b = 1; b <= 5; b++) {
      const s = bootstrapQuantile(sel.map((r) => blocksOf(r, [b])), 0.5);
      checks.push({ criterion: 'block', goal, unit: `b${b}`, stat: s, band: [0.9, 1.1], pass: inside(s, 0.9, 1.1), pointPass: s.value >= 0.9 && s.value <= 1.1 });
    }
  }
  return checks;
}

function checksTable(md: string[], title: string, checks: readonly Check[]): void {
  md.push(title, '', '| Critère | Objectif | Unité | Médiane tissus [IC 95 %] | Bande | IC dans la bande | Médiane seule dans la bande |', '|---|---|---|---|---|---|---|');
  for (const c of checks) md.push(`| ${c.criterion === 'window' ? 'fenêtre' : 'bloc'} | ${goalFr(c.goal)} | ${c.unit} | ${f3(c.stat.value)} [${f3(c.stat.lo)} ; ${f3(c.stat.hi)}] | [${f3(c.band[0])} ; ${f3(c.band[1])}] | ${c.pass ? 'oui' : '**non**'} | ${c.pointPass ? 'oui' : 'non'} |`);
  md.push('');
}

/** Windows, blocks, plan age, paired differences and strata of an ideal-world job (tissue and total weight). */
function idealTables(md: string[], rows: readonly Row[], arms: readonly string[], out: Record<string, unknown>): void {
  md.push('### Médianes par fenêtre [IC 95 %]', '', '| Bras | Objectif | Fenêtre | Blocs (utilisateurs) | Tissus | P10 / P90 tissus | Poids total | P10 / P90 poids |', '|---|---|---|---|---|---|---|---|');
  for (const arm of arms) {
    for (const goal of ['loss', 'gain']) {
      const sel = rows.filter((r) => r.solver_arm === arm && r.goal === goal);
      for (const [wk, wname, blocks] of WINDOWS) {
        const t = bootstrapQuantile(sel.map((r) => blocksOf(r, blocks, 'tratio')), 0.5);
        const w = bootstrapQuantile(sel.map((r) => blocksOf(r, blocks, 'ratio')), 0.5);
        out[`${arm}_${goal}_${wk}_tissue`] = t;
        out[`${arm}_${goal}_${wk}_weight`] = w;
        md.push(`| ${armFr[arm]} | ${goalFr(goal)} | ${wname} | ${t.n} (${t.users}) | ${f3(t.value)} [${f3(t.lo)} ; ${f3(t.hi)}] | ${f3(t.p10)} / ${f3(t.p90)} | ${f3(w.value)} [${f3(w.lo)} ; ${f3(w.hi)}] | ${f3(w.p10)} / ${f3(w.p90)} |`);
      }
    }
  }
  for (const [metric, label] of METRICS) {
    md.push('', `### Médianes par bloc de 4 semaines, ${label} [IC 95 %]`, '', '| Bras | Objectif | Semaines 5-8 | 9-12 | 13-16 | 17-20 | 21-24 |', '|---|---|---|---|---|---|---|');
    for (const arm of arms) {
      for (const goal of ['loss', 'gain']) {
        const cells: string[] = [];
        for (let b = 1; b <= 5; b++) {
          const s = bootstrapQuantile(rows.filter((r) => r.solver_arm === arm && r.goal === goal).map((r) => blocksOf(r, [b], metric)), 0.5);
          out[`${arm}_${goal}_b${b}_${metric}`] = s;
          cells.push(`${f3(s.value)} [${f3(s.lo)} ; ${f3(s.hi)}]`);
        }
        md.push(`| ${armFr[arm]} | ${goalFr(goal)} | ${cells.join(' | ')} |`);
      }
    }
  }
  // Ratio by mean age of the active plan over the block (as in report 37).
  md.push('', '### Ratio selon l’âge moyen du plan actif sur le bloc (tous blocs, médiane [IC 95 %])', '', '| Bras | Objectif | Âge (j) | Utilisateurs-blocs | Tissus | Poids total |', '|---|---|---|---|---|---|');
  for (const arm of arms) {
    for (const goal of ['loss', 'gain']) {
      for (const [lo, hi] of AGES) {
        const byUser = (metric: string) =>
          rows
            .filter((r) => r.solver_arm === arm && r.goal === goal)
            .map((r) => [1, 2, 3, 4, 5].filter((b) => Number(r[`age_b${b}`]) >= lo && Number(r[`age_b${b}`]) < hi).flatMap((b) => blocksOf(r, [b], metric)));
        const t = bootstrapQuantile(byUser('tratio'), 0.5);
        const w = bootstrapQuantile(byUser('ratio'), 0.5);
        out[`age_${arm}_${goal}_${lo}_${hi}`] = { tissue: t, weight: w };
        if (t.n === 0) continue;
        md.push(`| ${arm} | ${goalFr(goal)} | ${lo} à ${hi === 1000 ? '…' : hi} | ${t.n} | ${f3(t.value)} [${f3(t.lo)} ; ${f3(t.hi)}] | ${f3(w.value)} [${f3(w.lo)} ; ${f3(w.hi)}] |`);
      }
    }
  }
  md.push('', '### Âge moyen du plan actif et plans démarrés, par bloc (médianes par utilisateur-bloc)', '', '| Bras | Objectif | Semaines 5-8 | 9-12 | 13-16 | 17-20 | 21-24 |', '|---|---|---|---|---|---|---|');
  for (const arm of arms) {
    for (const goal of ['loss', 'gain']) {
      const sel = rows.filter((r) => r.solver_arm === arm && r.goal === goal);
      const cells = [1, 2, 3, 4, 5].map((b) => `${f1(median(sel.map((r) => Number(r[`age_b${b}`]))))} j ; ${f1(median(sel.map((r) => Number(r[`started_b${b}`]))))}`);
      md.push(`| ${arm} | ${goalFr(goal)} | ${cells.join(' | ')} |`);
    }
  }
  // Paired differences.
  const pairsOf: Array<[string, string]> = arms.filter((a) => a !== 'S0').map((a) => ['S0', a] as [string, string]);
  if (arms.includes('FX')) for (const a of arms.filter((x) => x === 'K1' || x === 'K2')) pairsOf.push(['FX', a]);
  md.push('', '### Différences appariées de médiane, tissus (bras b − bras a)', '', '| a → b | Objectif | Fenêtre | Δ médiane [IC 95 %] |', '|---|---|---|---|');
  for (const [a, b] of pairsOf) {
    for (const goal of ['loss', 'gain']) {
      for (const [wk, wname, blocks] of WINDOWS) {
        const d = pairedMedianDiff(paired(rows.filter((r) => r.goal === goal), a, b).map(({ ra, rb }) => ({ a: blocksOf(ra, blocks), b: blocksOf(rb, blocks) })));
        out[`diff_${a}_${b}_${goal}_${wk}`] = d;
        md.push(`| ${a} → ${b} | ${goalFr(goal)} | ${wname} | ${f3(d.value)} [${f3(d.lo)} ; ${f3(d.hi)}] |`);
      }
    }
  }
  // Other facts.
  md.push('', '### Autres constats', '', '| Bras | Recalibrations appliquées (médiane) | Recalculs périodiques faits (médiane ; total) | Dus sans snapshot (total) | Refusés (total) | Utilisateurs avec échec de recalibration | Échecs `no_feasible_speed` des recalibrations |', '|---|---|---|---|---|---|---|');
  for (const arm of arms) {
    const sel = rows.filter((r) => r.solver_arm === arm);
    const sum = (k: string) => sel.reduce((s, r) => s + Number(r[k] ?? 0), 0);
    const nfs = sel.reduce((s, r) => s + (r.plan_failures ?? '').split('/').filter((x) => x.includes('no_feasible_speed')).length, 0);
    out[`other_${arm}`] = { recal: median(sel.map((r) => Number(r.n_recal))), replans: sum('n_replan'), noSnapshot: sum('n_replan_no_snapshot'), failed: sum('n_replan_failed'), usersWithFailure: sel.filter((r) => (r.plan_failures ?? '') !== '').length, noFeasibleSpeed: nfs };
    md.push(`| ${arm} | ${f1(median(sel.map((r) => Number(r.n_recal))))} | ${f1(median(sel.map((r) => Number(r.n_replan))))} ; ${sum('n_replan')} | ${sum('n_replan_no_snapshot')} | ${sum('n_replan_failed')} | ${sel.filter((r) => (r.plan_failures ?? '') !== '').length} | ${nfs} |`);
  }
  // Strata.
  md.push('', '### Strates (médiane du ratio sur les tissus ; poids total entre parenthèses)', '', `| Strate | Valeur | Objectif | Utilisateurs | ${arms.map((a) => `${a} sem. 5-12 | ${a} sem. 13-24`).join(' | ')} |`, `|---|---|---|---|${arms.map(() => '---|---').join('|')}|`);
  for (const [col, label] of [...STRATA, ['goal', 'objectif'] as [string, string]]) {
    const values = [...new Set(rows.map((r) => r[col] as string))].sort();
    for (const v of values) {
      for (const goal of ['loss', 'gain']) {
        const sel = rows.filter((r) => r[col] === v && r.goal === goal);
        if (sel.length === 0) continue;
        const m = (arm: string, blocks: number[], metric: string) => median(sel.filter((r) => r.solver_arm === arm).flatMap((r) => blocksOf(r, blocks, metric)));
        const cells = arms.map((a) => `${f3(m(a, [1, 2], 'tratio'))} (${f3(m(a, [1, 2], 'ratio'))}) | ${f3(m(a, [3, 4, 5], 'tratio'))} (${f3(m(a, [3, 4, 5], 'ratio'))})`);
        md.push(`| ${label} | ${v} | ${goalFr(goal)} | ${sel.length / arms.length} | ${cells.join(' | ')} |`);
      }
    }
  }
  md.push('');
}

/** 5.4: the periodic replans as the user lives them (arm with a replan cadence). */
function replanTable(md: string[], rows: readonly Row[], arm: string, label: string, out: Record<string, unknown>): void {
  const sel = rows.filter((r) => r.solver_arm === arm);
  if (sel.length === 0) return;
  const deltas: number[] = [];
  let noSnapshot = 0;
  let failed = 0;
  const reasons = new Map<string, number>();
  const perUser: number[] = [];
  for (const r of sel) {
    let n = 0;
    for (const item of (r.replans ?? '').split('|').filter((x) => x.length > 0)) {
      const [, status, , before, after, reason] = item.split(':');
      if (status === 'replanned') {
        n++;
        deltas.push(Number(after) - Number(before));
      } else if (status === 'no_snapshot') noSnapshot++;
      else {
        failed++;
        reasons.set(reason ?? '', (reasons.get(reason ?? '') ?? 0) + 1);
      }
    }
    perUser.push(n);
  }
  const d = sortNum(deltas);
  const abs = sortNum(deltas.map(Math.abs));
  const small = deltas.filter((x) => Math.abs(x) < 10).length;
  const byGoal = (goal: string) => {
    const g: number[] = [];
    for (const r of sel.filter((x) => x.goal === goal)) for (const item of (r.replans ?? '').split('|').filter((x) => x.length > 0)) {
      const [, status, , before, after] = item.split(':');
      if (status === 'replanned') g.push(Number(after) - Number(before));
    }
    return sortNum(g);
  };
  const pu = sortNum(perUser);
  const res = { users: sel.length, replans: deltas.length, perUser: { median: quantile(pu, 0.5), p10: quantile(pu, 0.1), p90: quantile(pu, 0.9), max: pu[pu.length - 1] ?? null, zero: perUser.filter((x) => x === 0).length }, delta: { median: quantile(d, 0.5), p10: quantile(d, 0.1), p90: quantile(d, 0.9) }, absDelta: { median: quantile(abs, 0.5), p90: quantile(abs, 0.9) }, below10: { k: small, n: deltas.length, ...wilson(small, deltas.length) }, noSnapshot, failed, reasons: Object.fromEntries(reasons) };
  out[`replan_${label}_${arm}`] = res;
  md.push(`### ${label} : bras ${arm}`, '', `- Utilisateurs : ${sel.length}. Recalculs périodiques faits : ${deltas.length} ; par utilisateur, médiane ${f1(res.perUser.median)} [P10 ${f1(res.perUser.p10)} ; P90 ${f1(res.perUser.p90)}], max ${res.perUser.max ?? '—'}, ${res.perUser.zero} utilisateurs sans recalcul.`, `- Écart de cible (nouvelle − ancienne), kcal/j : médiane ${f1(res.delta.median)} [P10 ${f1(res.delta.p10)} ; P90 ${f1(res.delta.p90)}] ; |écart| médian ${f1(res.absDelta.median)}, P90 ${f1(res.absDelta.p90)}.`, `- Part des recalculs avec |écart| < 10 kcal/j : ${small} / ${deltas.length} = ${pc(res.below10.p)} [${pc(res.below10.lo)} ; ${pc(res.below10.hi)}].`, `- Recalculs dus mais non faits sans snapshot appliqué : ${noSnapshot}. Refusés (plan laissé en place) : ${failed}${failed > 0 ? ` (${[...reasons.entries()].map(([k, v]) => `${k} : ${v}`).join(', ')})` : ''}.`);
  for (const goal of ['loss', 'gain', 'maintenance']) {
    const g = byGoal(goal);
    if (g.length > 0) md.push(`- ${goalFr(goal)} : ${g.length} recalculs, écart médian ${f1(quantile(g, 0.5))} [P10 ${f1(quantile(g, 0.1))} ; P90 ${f1(quantile(g, 0.9))}] kcal/j, |écart| < 10 : ${g.filter((x) => Math.abs(x) < 10).length}.`);
  }
  md.push('');
}

it('iteration 2b tables', () => {
  const md: string[] = ['# Itération 2b : tableaux reconstruits depuis les bruts', '', `Script : \`tests/experiments-journal/it2b/tables2b.experiment.ts\`. Bootstrap : ${B} tirages d’utilisateurs, graine ${SEED}. Ratio **tissus** (verdict, A4.1) : pente de la masse tissulaire vraie (gras + maigre) sur un bloc de 4 semaines / (vitesse du plan actif × poids vrai au début du bloc). Ratio **poids total** (rapporté) : définition de 2a.`, ''];
  const verdicts: Record<string, unknown> = {};

  // 5.1 selection
  const select = readAll(DIR, 'select2b');
  if (select.length > 0) {
    const arms = ['S0', 'FX', 'K1', 'K2'];
    const byGoal = (g: string) => new Set(select.filter((r) => r.goal === g).map(userKey)).size;
    md.push('## 5.1 Sélection (monde idéal, graines de sélection 2,7·10⁹)', '', `${new Set(select.map(userKey)).size} utilisateurs (perte ${byGoal('loss')}, prise ${byGoal('gain')}, maintien ${byGoal('maintenance')}), ${select.length} lignes utilisateur × bras.`, '');
    const out: Record<string, unknown> = {};
    idealTables(md, select, arms, out);
    const s0l = out.S0_loss_all_weight as Stat;
    const s0g = out.S0_gain_all_weight as Stat;
    const stop2 = { loss: s0l.value, gain: s0g.value, reproduces: Math.abs(s0l.value - 0.654) <= 0.03 && Math.abs(s0g.value - 0.703) <= 0.03 };
    verdicts.stop2 = stop2;
    md.push(`**Arrêt 2 (témoin S0, poids total, semaines 5 à 24, contre le rapport 37)** : perte ${f3(stop2.loss)} (attendu 0,654 ± 0,03), prise ${f3(stop2.gain)} (attendu 0,703 ± 0,03) : ${stop2.reproduces ? 'reproduit' : '**NON reproduit**'}.`, '');
    const sel: Record<string, { pass: boolean; checks: Check[] }> = {};
    for (const arm of arms) {
      const checks = a31Checks(select, arm);
      sel[arm] = { pass: checks.every((c) => c.pass), checks };
      checksTable(md, `### Critères de A3.1 sur les tissus, bras ${arm}${arm === 'K1' || arm === 'K2' ? ' (candidat)' : ' (rapporté, hors sélection)'}`, checks);
      md.push(`**${arm} : ${sel[arm].pass ? 'passe tous les critères' : 'échoue'}.**`, '');
    }
    const k1 = (sel.K1 as { pass: boolean }).pass;
    const k2 = (sel.K2 as { pass: boolean }).pass;
    const retained = k1 ? 'K1' : k2 ? 'K2' : null;
    verdicts.selection = { K1: k1, K2: k2, retained, checks: sel, stop2 };
    md.push(`**Règle A4.2 : K1 ${k1 ? 'passe' : 'échoue'}, K2 ${k2 ? 'passe' : 'échoue'} ; candidat retenu : ${retained ?? 'aucun (arrêt 3)'}.**`, '');
    verdicts.select = out;
    for (const arm of ['K1', 'K2']) replanTable(md, select, arm, 'Recalculs périodiques, sélection', verdicts);
  }

  // 5.2 validation
  const valid = readAll(DIR, 'valid2b');
  if (valid.length > 0) {
    const cand = [...new Set(valid.map((r) => r.solver_arm as string))].find((a) => a !== 'S0') as string;
    const byGoal = (g: string) => new Set(valid.filter((r) => r.goal === g).map(userKey)).size;
    md.push('## 5.2 Validation (monde idéal, graines de validation 2,8·10⁹)', '', `${new Set(valid.map(userKey)).size} utilisateurs (perte ${byGoal('loss')}, prise ${byGoal('gain')}, maintien ${byGoal('maintenance')}), bras S0 et ${cand}.`, '');
    const out: Record<string, unknown> = {};
    idealTables(md, valid, ['S0', cand], out);
    const checks = a31Checks(valid, cand);
    const pass = checks.every((c) => c.pass);
    checksTable(md, `### Verdict A3.1 sur les tissus (A4.1), candidat ${cand}`, checks);
    md.push(`**A3.1 (validation, ${cand}) : ${pass ? 'PASSÉ' : 'ÉCHOUÉ'}.**`, '');
    checksTable(md, '### Critères de A3.1 appliqués au témoin S0 (rapporté, sans verdict)', a31Checks(valid, 'S0'));
    verdicts.A31 = { candidate: cand, pass, checks };
    verdicts.valid = out;
    replanTable(md, valid, cand, 'Recalculs périodiques, validation', verdicts);
  }

  // 5.3 realistic world
  const real = readAll(DIR, 'real2b');
  if (real.length > 0) {
    const cand = [...new Set(real.map((r) => r.solver_arm as string))].find((a) => a !== 'S0') as string;
    const arms = ['S0', cand];
    const followers = real.filter((r) => r.behavior === 'follower');
    const steady = real.filter((r) => r.behavior === 'steady');
    md.push('## 5.3 Monde réaliste', '', `${new Set(followers.map(userKey)).size} suiveurs (graines 2,9·10⁹) et ${new Set(steady.map(userKey)).size} non-suiveurs réguliers (graines 3,0·10⁹, s = −270 / +270), bras S0 et ${cand}. Hall perturbé à ±20 %, pesées t + D + E, pas bruités.`, '');
    const out: Record<string, unknown> = {};
    const checks: Record<string, unknown> = {};
    let a32 = true;
    md.push('### Suiveurs : S1 et S2 (tissus, verdict ; poids total rapporté)', '', '| Bras | Objectif | Fenêtre | S1 tissus [IC 95 %] | S1 dans [0,85 ; 1,15] | S2 P90 tissus [IC 95 %] | S2 borne haute ≤ 1,25 | S1 poids total | S2 P90 poids total |', '|---|---|---|---|---|---|---|---|---|');
    for (const arm of arms) {
      for (const goal of ['loss', 'gain']) {
        for (const [wk, wname, blocks] of WINDOWS) {
          const sel = followers.filter((r) => r.solver_arm === arm && r.goal === goal);
          const s1 = bootstrapQuantile(sel.map((r) => blocksOf(r, blocks)), 0.5);
          const s2 = bootstrapQuantile(sel.map((r) => blocksOf(r, blocks)), 0.9);
          const w1 = bootstrapQuantile(sel.map((r) => blocksOf(r, blocks, 'ratio')), 0.5);
          const w2 = bootstrapQuantile(sel.map((r) => blocksOf(r, blocks, 'ratio')), 0.9);
          const p1 = inside(s1, 0.85, 1.15);
          const p2 = s2.hi <= 1.25;
          out[`${arm}_${goal}_${wk}`] = { s1, s2, s1Pass: p1, s2Pass: p2, weightS1: w1, weightS2: w2 };
          if (arm === cand && wk !== 'all') {
            checks[`S1_${goal}_${wk}`] = { stat: s1, pass: p1 };
            checks[`S2_${goal}_${wk}`] = { stat: s2, pass: p2 };
            if (!p1 || !p2) a32 = false;
          }
          const info = wk === 'all' || arm !== cand;
          md.push(`| ${arm} | ${goalFr(goal)} | ${wname} | ${f3(s1.value)} [${f3(s1.lo)} ; ${f3(s1.hi)}] | ${info ? `(info) ${p1 ? 'oui' : 'non'}` : p1 ? 'oui' : '**non**'} | ${f3(s2.value)} [${f3(s2.lo)} ; ${f3(s2.hi)}] | ${info ? `(info) ${p2 ? 'oui' : 'non'}` : p2 ? 'oui' : '**non**'} | ${f3(w1.value)} [${f3(w1.lo)} ; ${f3(w1.hi)}] | ${f3(w2.value)} [${f3(w2.lo)} ; ${f3(w2.hi)}] |`);
        }
      }
    }
    md.push('', '### Suiveurs : S3 (tissus), S4, S7 (poids, inchangés)', '', '| Bras | S3 tissus : utilisateurs-semaines au-dessus du plafond [Wilson] | S3 poids total (rapporté) | S4 utilisateurs ≥ 7 j sous le plancher réel [Wilson] | S7 maintien dans la zone à 8 semaines [Wilson] |', '|---|---|---|---|---|');
    for (const arm of arms) {
      const rows = followers.filter((r) => r.solver_arm === arm);
      const sum = (k: string) => rows.reduce((s, r) => s + Number(r[k]), 0);
      const s3 = { k: sum('s3t_above'), n: sum('s3t_weeks'), ...wilson(sum('s3t_above'), sum('s3t_weeks')) };
      const s3w = { k: sum('s3_above'), n: sum('s3_weeks'), ...wilson(sum('s3_above'), sum('s3_weeks')) };
      const s4k = rows.filter((r) => Number(r.s4_below_floor_days) >= 7).length;
      const s4 = { k: s4k, n: rows.length, ...wilson(s4k, rows.length) };
      const maint = rows.filter((r) => r.goal === 'maintenance');
      const s7k = maint.filter((r) => r.s7_in_zone_target === '1').length;
      const s7 = { k: s7k, n: maint.length, ...wilson(s7k, maint.length) };
      const p3 = s3.hi <= 0.05;
      const p4 = s4.p <= 0.01 && s4.hi <= 0.02;
      const p7 = s7.lo >= 0.8;
      out[`${arm}_S3`] = { ...s3, pass: p3, weight: s3w };
      out[`${arm}_S4`] = { ...s4, pass: p4 };
      out[`${arm}_S7`] = { ...s7, pass: p7 };
      if (arm === cand) {
        checks.S3 = { ...s3, pass: p3 };
        checks.S4 = { ...s4, pass: p4 };
        checks.S7 = { ...s7, pass: p7 };
        if (!p3 || !p4 || !p7) a32 = false;
      }
      const tag = (p: boolean) => (arm === cand ? (p ? 'passe' : '**échoue**') : `(info) ${p ? 'passe' : 'échoue'}`);
      md.push(`| ${arm} | ${s3.k} / ${s3.n} = ${pc(s3.p)} [${pc(s3.lo)} ; ${pc(s3.hi)}] ${tag(p3)} | ${s3w.k} / ${s3w.n} = ${pc(s3w.p)} [${pc(s3w.lo)} ; ${pc(s3w.hi)}] | ${s4k} / ${rows.length} = ${pc(s4.p)} [${pc(s4.lo)} ; ${pc(s4.hi)}] ${tag(p4)} | ${s7k} / ${maint.length} = ${pc(s7.p)} [${pc(s7.lo)} ; ${pc(s7.hi)}] ${tag(p7)} |`);
    }
    verdicts.A32 = { candidate: cand, pass: a32, checks };
    md.push('', `**A3.2 (suiveurs, ${cand}, S1 à S4 et S7 selon A4.1) : ${a32 ? 'PASSÉ' : 'ÉCHOUÉ'}.**`, '');
    md.push('### Suiveurs : différences appariées de médiane, tissus (candidat − S0)', '', '| Objectif | Fenêtre | Δ médiane [IC 95 %] |', '|---|---|---|');
    for (const goal of ['loss', 'gain']) {
      for (const [wk, wname, blocks] of WINDOWS) {
        const d = pairedMedianDiff(paired(followers.filter((r) => r.goal === goal), 'S0', cand).map(({ ra, rb }) => ({ a: blocksOf(ra, blocks), b: blocksOf(rb, blocks) })));
        out[`followers_diff_${goal}_${wk}`] = d;
        md.push(`| ${goalFr(goal)} | ${wname} | ${f3(d.value)} [${f3(d.lo)} ; ${f3(d.hi)}] |`);
      }
    }
    md.push('', '### Non-suiveurs réguliers (plan en cours + s), sans verdict', '', '| Bras | Objectif | s (kcal/j) | Fenêtre | Tissus [IC 95 %] | P10 / P90 tissus | Poids total [IC 95 %] |', '|---|---|---|---|---|---|---|');
    for (const arm of arms) {
      for (const goal of ['loss', 'gain']) {
        for (const shift of ['-270', '270', 'tous']) {
          for (const [wk, wname, blocks] of WINDOWS) {
            if (wk === 'all' && shift !== 'tous') continue;
            const sel = steady.filter((r) => r.solver_arm === arm && r.goal === goal && (shift === 'tous' || r.shift === shift));
            const t = bootstrapQuantile(sel.map((r) => blocksOf(r, blocks)), 0.5);
            const w = bootstrapQuantile(sel.map((r) => blocksOf(r, blocks, 'ratio')), 0.5);
            out[`steady_${arm}_${goal}_${shift}_${wk}`] = { tissue: t, weight: w };
            md.push(`| ${arm} | ${goalFr(goal)} | ${shift} | ${wname} | ${f3(t.value)} [${f3(t.lo)} ; ${f3(t.hi)}] | ${f3(t.p10)} / ${f3(t.p90)} | ${f3(w.value)} [${f3(w.lo)} ; ${f3(w.hi)}] |`);
          }
        }
      }
    }
    const steadyMaint = (arm: string) => {
      const m = steady.filter((r) => r.solver_arm === arm && r.goal === 'maintenance');
      const k = m.filter((r) => r.s7_in_zone_target === '1').length;
      return { k, n: m.length, ...wilson(k, m.length) };
    };
    out.steadyMaintenance = { S0: steadyMaint('S0'), [cand]: steadyMaint(cand) };
    md.push('', `Non-suiveurs réguliers en maintien, dans la zone à 8 semaines : S0 ${steadyMaint('S0').k} / ${steadyMaint('S0').n}, ${cand} ${steadyMaint(cand).k} / ${steadyMaint(cand).n}.`, '');
    md.push('### Autres constats (monde réaliste)', '', '| Population | Bras | Recalibrations appliquées (médiane) | Recalculs périodiques faits (total) | Dus sans snapshot | Refusés | Utilisateurs avec échec de recalibration | Échecs `no_feasible_speed` des recalibrations | Propositions de révision |', '|---|---|---|---|---|---|---|---|---|');
    for (const [pop, rowsPop] of [
      ['suiveurs', followers],
      ['non-suiveurs réguliers', steady],
    ] as const) {
      for (const arm of arms) {
        const rows = rowsPop.filter((r) => r.solver_arm === arm);
        const sum = (k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
        const nfs = rows.reduce((s, r) => s + (r.plan_failures ?? '').split('/').filter((x) => x.includes('no_feasible_speed')).length, 0);
        out[`other_${pop}_${arm}`] = { recal: median(rows.map((r) => Number(r.n_recal))), replans: sum('n_replan'), noSnapshot: sum('n_replan_no_snapshot'), failed: sum('n_replan_failed'), usersWithFailure: rows.filter((r) => (r.plan_failures ?? '') !== '').length, noFeasibleSpeed: nfs, proposals: rows.filter((r) => r.proposal_day !== '').length };
        md.push(`| ${pop} | ${arm} | ${f1(median(rows.map((r) => Number(r.n_recal))))} | ${sum('n_replan')} | ${sum('n_replan_no_snapshot')} | ${sum('n_replan_failed')} | ${rows.filter((r) => (r.plan_failures ?? '') !== '').length} | ${nfs} | ${rows.filter((r) => r.proposal_day !== '').length} |`);
      }
    }
    md.push('', '### Strates des suiveurs (médiane du ratio sur les tissus, poids total entre parenthèses ; S4 et S7 du candidat)', '', `| Strate | Valeur | Objectif | Utilisateurs | S0 sem. 5-12 | S0 sem. 13-24 | ${cand} sem. 5-12 | ${cand} sem. 13-24 | S4 ${cand} (≥ 7 j) |`, '|---|---|---|---|---|---|---|---|---|');
    for (const [col, label] of [...STRATA, ['weigh_p', 'fréquence de pesée'] as [string, string]]) {
      const values = [...new Set(followers.map((r) => r[col] as string))].sort();
      for (const v of values) {
        for (const goal of ['loss', 'gain', 'maintenance']) {
          const sel = followers.filter((r) => r[col] === v && r.goal === goal);
          if (sel.length === 0) continue;
          const m = (arm: string, blocks: number[], metric: string) => median(sel.filter((r) => r.solver_arm === arm).flatMap((r) => blocksOf(r, blocks, metric)));
          const cell = (arm: string, blocks: number[]) => (goal === 'maintenance' ? '—' : `${f3(m(arm, blocks, 'tratio'))} (${f3(m(arm, blocks, 'ratio'))})`);
          const c = sel.filter((r) => r.solver_arm === cand);
          const s4 = c.filter((r) => Number(r.s4_below_floor_days) >= 7).length;
          const s7 = goal === 'maintenance' ? ` ; S7 ${c.filter((r) => r.s7_in_zone_target === '1').length} / ${c.length}` : '';
          md.push(`| ${label} | ${v} | ${goalFr(goal)} | ${sel.length / 2} | ${cell('S0', [1, 2])} | ${cell('S0', [3, 4, 5])} | ${cell(cand, [1, 2])} | ${cell(cand, [3, 4, 5])} | ${s4} / ${c.length}${s7} |`);
        }
      }
    }
    md.push('');
    verdicts.real = out;
    replanTable(md, followers, cand, 'Recalculs périodiques, monde réaliste, suiveurs', verdicts);
    replanTable(md, steady, cand, 'Recalculs périodiques, monde réaliste, non-suiveurs réguliers', verdicts);
  }

  // 5.5 first plan (K2 only), 5.6 invariants and timing: own raw files.
  const first = readAll(DIR, 'firstplan2b');
  if (first.length > 0) {
    md.push('## 5.5 Premier plan (hypercube, sans seuil) : K2 contre S0 et contre FX', '', `${new Set(first.map((r) => r.profile_index)).size} profils (graines 3,1·10⁹), chaque vitesse de la grille.`, '');
    md.push('| Objectif | Vitesse demandée (%/sem.) | Profils | Δ cible K2 − S0 médiane [P10 ; P90] | Δ cible K2 − FX médiane [P10 ; P90] | Ralentis par le plancher S0 → FX → K2 | Sans vitesse faisable S0 → FX → K2 | Plus lente sous K2 que S0 / que FX |', '|---|---|---|---|---|---|---|---|');
    const out: Record<string, unknown> = {};
    for (const goal of ['loss', 'gain', 'maintenance']) {
      const rates = [...new Set(first.filter((r) => r.goal === goal).map((r) => r.requested as string))].sort((a, b) => Number(a) - Number(b));
      for (const rate of rates) {
        const sel = first.filter((r) => r.goal === goal && r.requested === rate);
        const by = (arm: string) => new Map(sel.filter((r) => r.solver_arm === arm).map((r) => [r.profile_index as string, r]));
        const s0 = by('S0');
        const fx = by('FX');
        const k2 = by('K2');
        const dS0: number[] = [];
        const dFx: number[] = [];
        let slowerS0 = 0;
        let slowerFx = 0;
        for (const [k, r] of k2) {
          const a = s0.get(k);
          const f = fx.get(k);
          if (a && a.status === 'ok' && r.status === 'ok') {
            dS0.push(Number(r.target) - Number(a.target));
            if (Number(r.applied_rate) < Number(a.applied_rate) - 1e-9) slowerS0++;
          }
          if (f && f.status === 'ok' && r.status === 'ok') {
            dFx.push(Number(r.target) - Number(f.target));
            if (Number(r.applied_rate) < Number(f.applied_rate) - 1e-9) slowerFx++;
          }
        }
        const n = k2.size;
        const share = (m: Map<string, Row>, pred: (r: Row) => boolean) => [...m.values()].filter(pred).length / n;
        const a = sortNum(dS0);
        const b = sortNum(dFx);
        const floor = (m: Map<string, Row>) => share(m, (r) => r.floor_slowed === '1');
        const nf = (m: Map<string, Row>) => share(m, (r) => r.status === 'no_feasible_speed');
        out[`${goal}_${rate}`] = { n, dS0: { median: quantile(a, 0.5), p10: quantile(a, 0.1), p90: quantile(a, 0.9) }, dFx: { median: quantile(b, 0.5), p10: quantile(b, 0.1), p90: quantile(b, 0.9) }, floorSlowed: { S0: floor(s0), FX: floor(fx), K2: floor(k2) }, noFeasible: { S0: nf(s0), FX: nf(fx), K2: nf(k2) }, slowerS0, slowerFx };
        md.push(`| ${goalFr(goal)} | ${(100 * Number(rate)).toFixed(2).replace('.', ',')} | ${n} | ${f0(quantile(a, 0.5))} [${f0(quantile(a, 0.1))} ; ${f0(quantile(a, 0.9))}] | ${f0(quantile(b, 0.5))} [${f0(quantile(b, 0.1))} ; ${f0(quantile(b, 0.9))}] | ${pc(floor(s0))} → ${pc(floor(fx))} → ${pc(floor(k2))} | ${pc(nf(s0))} → ${pc(nf(fx))} → ${pc(nf(k2))} | ${slowerS0} / ${slowerFx} |`);
      }
    }
    verdicts.firstPlan = out;
    md.push('');
  }
  const golden = readAll(DIR, 'golden2b');
  if (golden.length > 0) {
    md.push('## 5.5 Golden et cas R et S (premier plan)', '', '| Cas | Objectif | Vitesse demandée | Cible S0 | Cible FX | Cible K2 | K2 − S0 | K2 − FX | Vitesse retenue S0 → FX → K2 | Statut K2 | Rejets K2 |', '|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of golden) md.push(`| ${r.case} | ${goalFr(r.goal as string)} | ${r.requested} | ${f0(Number(r.target_s0))} | ${f0(Number(r.target_fx))} | ${f0(Number(r.target_k2))} | ${f0(Number(r.target_k2) - Number(r.target_s0))} | ${f0(Number(r.target_k2) - Number(r.target_fx))} | ${r.rate_s0} → ${r.rate_fx} → ${r.rate_k2} | ${r.status_k2} | ${r.rejections_k2} |`);
    md.push('');
    verdicts.golden = golden;
  }
  const inv = readAll(DIR, 'invariants2b');
  if (inv.length > 0) {
    md.push('## 5.6 Invariants du curseur calories ↔ pas (candidat retenu)', '');
    for (const src of [...new Set(inv.map((r) => r.source))]) {
      const rows = inv.filter((r) => r.source === src);
      const viol = rows.filter((r) => r.monotone === '0').length;
      const gaps = sortNum(rows.map((r) => Number(r.max_abs_tissue_gap)));
      const plan = sortNum(rows.map((r) => Number(r.plan_tissue_gap)).filter((v) => Number.isFinite(v)));
      const notConv = rows.reduce((s, r) => s + Number(r.not_converged), 0);
      md.push(`- ${src} (${rows[0]?.candidate ?? ''}, horizon ${rows[0]?.horizon ?? ''} j) : ${rows.length} plans, ${rows.reduce((s, r) => s + Number(r.points), 0)} points du curseur ; violations de monotonie : **${viol}** ; écart |masse tissulaire à l’horizon − cible| max par plan (curseur) : médiane ${f3(quantile(gaps, 0.5))} kg, max ${f3(gaps[gaps.length - 1] ?? Number.NaN)} kg ; plan lui-même : max ${f3(plan[plan.length - 1] ?? Number.NaN)} kg ; points non convergés : ${notConv}.`);
      verdicts[`invariants_${src}`] = { plans: rows.length, violations: viol, maxTissueGap: gaps[gaps.length - 1] ?? null, planMaxGap: plan[plan.length - 1] ?? null, notConverged: notConv };
    }
    md.push('');
  }
  const timing = readAll(DIR, 'timing2b');
  if (timing.length > 0) {
    md.push('## 5.6 Temps d’un recalcul complet (calibration + état actuel + solveur)', '', '| Bras | Opération | Profils | P50 (ms) | P95 (ms) | P95 × 4 [déduit] (ms) | Seuil 1 s |', '|---|---|---|---|---|---|---|');
    const out: Record<string, unknown> = {};
    for (const arm of [...new Set(timing.map((r) => r.solver_arm as string))]) {
      for (const op of [...new Set(timing.map((r) => r.operation as string))]) {
        const ms = sortNum(timing.filter((r) => r.solver_arm === arm && r.operation === op).map((r) => Number(r.ms)));
        if (ms.length === 0) continue;
        const p50 = quantile(ms, 0.5);
        const p95 = quantile(ms, 0.95);
        out[`${arm}_${op}`] = { n: ms.length, p50, p95, p95x4: 4 * p95, pass: 4 * p95 <= 1000 };
        md.push(`| ${arm} | ${op} | ${ms.length} | ${f1(p50)} | ${f1(p95)} | ${f1(4 * p95)} | ${4 * p95 <= 1000 ? 'sous' : '**au-dessus**'} |`);
      }
    }
    verdicts.timing = out;
    md.push('');
  }
  const launch = `${DIR}/timing/launch-times.txt`;
  if (existsSync(launch)) md.push('## Temps réel des lancements', '', '```', readFileSync(launch, 'utf8').trim(), '```', '');
  writeFileSync(`${DIR}/tables2b.md`, `${md.join('\n')}\n`);
  writeFileSync(`${DIR}/verdicts2b.json`, `${JSON.stringify(verdicts, null, 2)}\n`);
});
