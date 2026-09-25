/**
 * Iteration 2a (prompt 37): tables and verdicts rebuilt from the raw exports only.
 * Run: npx vitest run -c vitest.journal.config.ts it2a/tables2a
 * Reads tests/experiments-journal/results/solver/ and writes results/solver/tables2a.md and results/solver/verdicts2a.json.
 *
 * Criteria (THRESHOLDS.md, amendment 3 and C1), fixed before any result was read:
 * - A3.1 (ideal world, retained fix FX): for loss and gain, in each window (weeks 5-12 = blocks 1-2, weeks 13-24 =
 *   blocks 3-5), median ratio and its 95 % CI inside [0.95 ; 1.05]; for each 4-week block, median and its 95 % CI inside
 *   [0.90 ; 1.10] (common rule: every criterion is judged on its 95 % CI).
 * - Stop 2 (control S0): median over weeks 5-24 within 0.65 +/- 0.03 (loss) and 0.70 +/- 0.03 (gain).
 * - A3.2 (realistic world, followers, FX): S1 median ratio and CI inside [0.85 ; 1.15], per goal (loss, gain) and window;
 *   S2 upper CI bound of the P90 of the ratio <= 1.25, per goal and window; S3 Wilson upper bound of the share of
 *   user-weeks above the BMI rate cap <= 5 % (all followers); S4 share of followers with >= 7 days of real intake under
 *   the real floor <= 1 % and Wilson upper bound <= 2 %; S7 Wilson lower bound of the share of maintenance followers
 *   inside the maintenance zone of their target at 8 weeks >= 80 %.
 * Bootstrap: 2 000 resamples of users (a user keeps all his blocks, and all his arms for paired differences), seed 37_000_001.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { readCsvGz } from '../../helpers/journalExport';
import { createRng } from '../../helpers/random';
import { RESULTS } from '../it2/jobs';
import { SOLVER_DIR } from './jobs2a';

type Row = Record<string, string>;
const DIR = `${RESULTS}/${SOLVER_DIR}`;
const SEED = 37_000_001;
const B = 2000;

function readAll(prefix: string): Row[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => new RegExp(`^${prefix}-shard\\d+\\.csv\\.gz$`).test(f))
    .sort()
    .flatMap((f) => readCsvGz(`${DIR}/${f}`));
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return (sorted[lo] as number) + ((sorted[hi] as number) - (sorted[lo] as number)) * (pos - lo);
}
const sortNum = (v: readonly number[]) => [...v].sort((a, b) => a - b);
const median = (v: readonly number[]) => quantile(sortNum(v), 0.5);

type Stat = { n: number; users: number; value: number; lo: number; hi: number; p10: number; p90: number };

/** Statistic q of the pooled values (median: q = 0.5), with a bootstrap 95 % CI resampling users. */
function bootstrapQuantile(byUser: ReadonlyArray<readonly number[]>, q: number, seed = SEED): Stat {
  const users = byUser.filter((u) => u.length > 0);
  const all = sortNum(users.flat());
  const rng = createRng(seed);
  const stats: number[] = [];
  if (users.length > 0) {
    for (let b = 0; b < B; b++) {
      const sample: number[] = [];
      for (let k = 0; k < users.length; k++) sample.push(...(users[Math.floor(rng.next() * users.length)] as readonly number[]));
      stats.push(quantile(sortNum(sample), q));
    }
  }
  const s = sortNum(stats);
  return { n: all.length, users: users.length, value: quantile(all, q), lo: quantile(s, 0.025), hi: quantile(s, 0.975), p10: quantile(all, 0.1), p90: quantile(all, 0.9) };
}

/** Paired difference of pooled medians (arm b - arm a), users resampled with both arms. */
function pairedMedianDiff(pairs: ReadonlyArray<{ a: readonly number[]; b: readonly number[] }>, seed = SEED): { value: number; lo: number; hi: number } {
  const users = pairs.filter((p) => p.a.length > 0 && p.b.length > 0);
  const diff = (sample: ReadonlyArray<{ a: readonly number[]; b: readonly number[] }>) => median(sample.flatMap((p) => p.b)) - median(sample.flatMap((p) => p.a));
  const rng = createRng(seed);
  const stats: number[] = [];
  for (let k = 0; k < B && users.length > 0; k++) {
    const sample: Array<{ a: readonly number[]; b: readonly number[] }> = [];
    for (let j = 0; j < users.length; j++) sample.push(users[Math.floor(rng.next() * users.length)] as { a: readonly number[]; b: readonly number[] });
    stats.push(diff(sample));
  }
  const s = sortNum(stats);
  return { value: diff(users), lo: quantile(s, 0.025), hi: quantile(s, 0.975) };
}

/** Wilson score interval, 95 %. */
function wilson(k: number, n: number): { p: number; lo: number; hi: number } {
  if (n === 0) return { p: Number.NaN, lo: Number.NaN, hi: Number.NaN };
  const z = 1.959963984540054;
  const p = k / n;
  const den = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return { p, lo: centre - half, hi: centre + half };
}

const f3 = (v: number) => (Number.isFinite(v) ? v.toFixed(3).replace('.', ',') : '—');
const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1).replace('.', ',') : '—');
const f0 = (v: number) => (Number.isFinite(v) ? v.toFixed(0) : '—');
const pc = (v: number) => (Number.isFinite(v) ? `${(100 * v).toFixed(2).replace('.', ',')} %` : '—');
const goalFr = (g: string) => (g === 'loss' ? 'perte' : g === 'gain' ? 'prise' : 'maintien');

const WINDOWS: Array<[string, string, number[]]> = [
  ['w1', 'semaines 5 à 12', [1, 2]],
  ['w2', 'semaines 13 à 24', [3, 4, 5]],
  ['all', 'semaines 5 à 24', [1, 2, 3, 4, 5]],
];
const blocksOf = (r: Row, blocks: readonly number[]) => blocks.map((b) => r[`ratio_b${b}`]).filter((v) => v !== '' && v !== undefined).map(Number);
const inside = (s: Stat, lo: number, hi: number) => s.value >= lo && s.value <= hi && s.lo >= lo && s.hi <= hi;
const userKey = (r: Row) => `${r.job}:${r.job_index}`;

/** Paired users of two arms. */
function paired(rows: readonly Row[], a: string, b: string): Array<{ ra: Row; rb: Row }> {
  const byKey = new Map<string, Record<string, Row>>();
  for (const r of rows) {
    const k = userKey(r);
    const m = byKey.get(k) ?? {};
    m[r.solver_arm as string] = r;
    byKey.set(k, m);
  }
  const out: Array<{ ra: Row; rb: Row }> = [];
  for (const m of byKey.values()) if (m[a] && m[b]) out.push({ ra: m[a] as Row, rb: m[b] as Row });
  return out;
}

/** Per-plan gaps (modeled - trend, modeled - true) of the currentState arms, from the recal_modeled column. */
function modeledGaps(rows: readonly Row[]): { trend: number[]; truth: number[]; nullCount: number; plans: number } {
  const trend: number[] = [];
  const truth: number[] = [];
  let nullCount = 0;
  let plans = 0;
  for (const r of rows) {
    for (const item of (r.recal_modeled ?? '').split('|').filter((x) => x.length > 0)) {
      const [, t, w, m] = item.split(':');
      plans++;
      if (m === '' || m === undefined) {
        nullCount++;
        continue;
      }
      trend.push(Number(m) - Number(t));
      truth.push(Number(m) - Number(w));
    }
  }
  return { trend, truth, nullCount, plans };
}

const STRATA: Array<[string, string]> = [
  ['sex', 'sexe'],
  ['bmi_class', 'classe d’IMC'],
  ['activity', 'activité'],
  ['requested_rate', 'vitesse demandée'],
];

it('iteration 2a tables', () => {
  const md: string[] = ['# Itération 2a : tableaux reconstruits depuis les bruts', '', `Script : \`tests/experiments-journal/it2a/tables2a.experiment.ts\`. Bootstrap : ${B} tirages d’utilisateurs, graine ${SEED}. Ratio : pente du poids vrai sur un bloc de 4 semaines / (vitesse du plan actif × poids vrai au début du bloc).`, ''];
  const verdicts: Record<string, unknown> = {};

  // -------------------------------------------------------------------------
  // 5.1 ideal world, 2 x 2
  // -------------------------------------------------------------------------
  const ideal = readAll('ideal2a');
  if (ideal.length > 0) {
    const arms = ['S0', 'CS', 'ST', 'FX'];
    const armFr: Record<string, string> = { S0: 'S0 témoin (équilibre + poids j42)', CS: 'CS (état actuel seul)', ST: 'ST (masse tissulaire seule)', FX: 'FX correctif (les deux)' };
    const users = new Set(ideal.map(userKey)).size;
    const byGoal = (g: string) => new Set(ideal.filter((r) => r.goal === g).map(userKey)).size;
    md.push('## 5.1 Monde idéal : décomposition 2 × 2', '', `${users} utilisateurs (perte ${byGoal('loss')}, prise ${byGoal('gain')}, maintien ${byGoal('maintenance')}), ${ideal.length} lignes utilisateur × bras. Hall nominal, pesées sans bruit, u = 0, suiveurs parfaits, graines 2,1·10⁹.`, '');
    md.push('### Médianes par fenêtre', '', '| Bras | Objectif | Fenêtre | Blocs (utilisateurs) | Médiane [IC 95 %] | P10 / P90 |', '|---|---|---|---|---|---|');
    const idealOut: Record<string, unknown> = {};
    for (const arm of arms) {
      for (const goal of ['loss', 'gain']) {
        for (const [wk, wname, blocks] of WINDOWS) {
          const s = bootstrapQuantile(ideal.filter((r) => r.solver_arm === arm && r.goal === goal).map((r) => blocksOf(r, blocks)), 0.5);
          idealOut[`${arm}_${goal}_${wk}`] = s;
          md.push(`| ${armFr[arm]} | ${goalFr(goal)} | ${wname} | ${s.n} (${s.users}) | ${f3(s.value)} [${f3(s.lo)} ; ${f3(s.hi)}] | ${f3(s.p10)} / ${f3(s.p90)} |`);
        }
      }
    }
    md.push('', '### Médianes par bloc de 4 semaines', '', '| Bras | Objectif | Semaines 5-8 | 9-12 | 13-16 | 17-20 | 21-24 |', '|---|---|---|---|---|---|---|');
    for (const arm of arms) {
      for (const goal of ['loss', 'gain']) {
        const cells: string[] = [];
        for (let b = 1; b <= 5; b++) {
          const s = bootstrapQuantile(ideal.filter((r) => r.solver_arm === arm && r.goal === goal).map((r) => blocksOf(r, [b])), 0.5);
          idealOut[`${arm}_${goal}_b${b}`] = s;
          cells.push(`${f3(s.value)} [${f3(s.lo)} ; ${f3(s.hi)}]`);
        }
        md.push(`| ${armFr[arm]} | ${goalFr(goal)} | ${cells.join(' | ')} |`);
      }
    }
    // Paired differences against the control.
    md.push('', '### Différences appariées de médiane (bras − S0)', '', '| Bras | Objectif | Fenêtre | Δ médiane [IC 95 %] |', '|---|---|---|---|');
    for (const arm of ['CS', 'ST', 'FX']) {
      for (const goal of ['loss', 'gain']) {
        for (const [wk, wname, blocks] of WINDOWS) {
          const pairs = paired(ideal.filter((r) => r.goal === goal), 'S0', arm).map(({ ra, rb }) => ({ a: blocksOf(ra, blocks), b: blocksOf(rb, blocks) }));
          const d = pairedMedianDiff(pairs);
          idealOut[`diff_${arm}_${goal}_${wk}`] = d;
          md.push(`| ${arm} | ${goalFr(goal)} | ${wname} | ${f3(d.value)} [${f3(d.lo)} ; ${f3(d.hi)}] |`);
        }
      }
    }
    // Stop 2: the control must reproduce report 36.
    const s0loss = idealOut.S0_loss_all as Stat;
    const s0gain = idealOut.S0_gain_all as Stat;
    const stop2 = { loss: s0loss.value, gain: s0gain.value, reproduces: Math.abs(s0loss.value - 0.65) <= 0.03 && Math.abs(s0gain.value - 0.7) <= 0.03 };
    verdicts.stop2 = stop2;
    md.push('', `**Arrêt 2 (témoin S0 contre le rapport 36, semaines 5 à 24)** : perte ${f3(stop2.loss)} (attendu 0,65 ± 0,03), prise ${f3(stop2.gain)} (attendu 0,70 ± 0,03) : ${stop2.reproduces ? 'reproduit' : '**NON reproduit**'}.`, '');
    // A3.1 verdict, FX only.
    const checks: Array<{ criterion: string; goal: string; unit: string; stat: Stat; band: [number, number]; pass: boolean; pointPass: boolean }> = [];
    for (const goal of ['loss', 'gain']) {
      for (const wk of ['w1', 'w2']) {
        const s = idealOut[`FX_${goal}_${wk}`] as Stat;
        checks.push({ criterion: 'window', goal, unit: wk, stat: s, band: [0.95, 1.05], pass: inside(s, 0.95, 1.05), pointPass: s.value >= 0.95 && s.value <= 1.05 });
      }
      for (let b = 1; b <= 5; b++) {
        const s = idealOut[`FX_${goal}_b${b}`] as Stat;
        checks.push({ criterion: 'block', goal, unit: `b${b}`, stat: s, band: [0.9, 1.1], pass: inside(s, 0.9, 1.1), pointPass: s.value >= 0.9 && s.value <= 1.1 });
      }
    }
    const a31 = checks.every((c) => c.pass);
    verdicts.A31 = { pass: a31, checks };
    md.push('### Verdict A3.1 (correctif FX)', '', '| Critère | Objectif | Unité | Médiane [IC 95 %] | Bande | IC dans la bande | Médiane seule dans la bande |', '|---|---|---|---|---|---|---|');
    for (const c of checks) md.push(`| ${c.criterion === 'window' ? 'fenêtre' : 'bloc'} | ${goalFr(c.goal)} | ${c.unit} | ${f3(c.stat.value)} [${f3(c.stat.lo)} ; ${f3(c.stat.hi)}] | [${f3(c.band[0])} ; ${f3(c.band[1])}] | ${c.pass ? 'oui' : '**non**'} | ${c.pointPass ? 'oui' : 'non'} |`);
    md.push('', `**A3.1 : ${a31 ? 'PASSÉ' : 'ÉCHOUÉ'}.**`, '');
    // Other facts: recalibrations, failures, modeled gaps.
    md.push('### Autres constats', '', '| Bras | Recalibrations appliquées (médiane) | Utilisateurs avec échec de plan | Échecs `no_feasible_speed` | Plans (état actuel) | Écart poids modélisé − tendance, médiane [P10 ; P90] (kg) | Écart modélisé − vrai, médiane [P10 ; P90] (kg) |', '|---|---|---|---|---|---|---|');
    const other: Record<string, unknown> = {};
    for (const arm of arms) {
      const rows = ideal.filter((r) => r.solver_arm === arm);
      const nrec = median(rows.map((r) => Number(r.n_recal)));
      const failing = rows.filter((r) => (r.plan_failures ?? '') !== '').length;
      const nfs = rows.reduce((s, r) => s + (r.plan_failures ?? '').split('/').filter((x) => x.includes('no_feasible_speed')).length, 0);
      const g = arm === 'CS' || arm === 'FX' ? modeledGaps(rows) : null;
      const st = g ? sortNum(g.trend) : [];
      const sw = g ? sortNum(g.truth) : [];
      other[arm] = { medianRecalibrations: nrec, usersWithFailure: failing, noFeasibleSpeed: nfs, ...(g ? { plans: g.plans, modeledNull: g.nullCount, gapTrend: { median: quantile(st, 0.5), p10: quantile(st, 0.1), p90: quantile(st, 0.9) }, gapTrue: { median: quantile(sw, 0.5), p10: quantile(sw, 0.1), p90: quantile(sw, 0.9) } } : {}) };
      md.push(`| ${arm} | ${f1(nrec)} | ${failing} | ${nfs} | ${g ? `${g.plans} (sans état : ${g.nullCount})` : '—'} | ${g ? `${f3(quantile(st, 0.5))} [${f3(quantile(st, 0.1))} ; ${f3(quantile(st, 0.9))}]` : '—'} | ${g ? `${f3(quantile(sw, 0.5))} [${f3(quantile(sw, 0.1))} ; ${f3(quantile(sw, 0.9))}]` : '—'} |`);
    }
    verdicts.idealOther = other;
    // Strata, S0 and FX, all weeks 5-24 plus windows.
    md.push('', '### Strates (médiane du ratio, S0 → FX)', '', '| Strate | Valeur | Objectif | Utilisateurs | S0 sem. 5-12 | S0 sem. 13-24 | FX sem. 5-12 | FX sem. 13-24 |', '|---|---|---|---|---|---|---|---|');
    for (const [col, label] of STRATA) {
      const values = [...new Set(ideal.map((r) => r[col] as string))].sort();
      for (const v of values) {
        for (const goal of ['loss', 'gain']) {
          const sel = ideal.filter((r) => r[col] === v && r.goal === goal);
          if (sel.length === 0) continue;
          const m = (arm: string, blocks: number[]) => median(sel.filter((r) => r.solver_arm === arm).flatMap((r) => blocksOf(r, blocks)));
          md.push(`| ${label} | ${v} | ${goalFr(goal)} | ${sel.length / 4} | ${f3(m('S0', [1, 2]))} | ${f3(m('S0', [3, 4, 5]))} | ${f3(m('FX', [1, 2]))} | ${f3(m('FX', [3, 4, 5]))} |`);
        }
      }
    }
    md.push('');
    verdicts.ideal = idealOut;
  }

  // -------------------------------------------------------------------------
  // Diagnostic of A3.1 (no criterion): diag2a-plans / diag2a-blocks
  // -------------------------------------------------------------------------
  const dPlans = readAll('diag2a-plans');
  const dBlocks = readAll('diag2a-blocks');
  if (dPlans.length > 0 && dBlocks.length > 0) {
    const numOf = (rows: readonly Row[], k: string) => rows.map((r) => r[k]).filter((v) => v !== '' && v !== undefined).map(Number);
    const med = (rows: readonly Row[], k: string) => median(numOf(rows, k));
    const recal = dPlans.filter((r) => r.kind === 'recal');
    const diag: Record<string, unknown> = { recalPlans: recal.length, rebuiltMatches: recal.filter((r) => r.rebuilt_matches === '1').length };
    md.push('### Diagnostic de l’échec de A3.1 (sans critère)', '', `Script : \`it2a/diag2a.experiment.ts\`. Utilisateurs en perte et en prise de ideal2a, rejoués avec les mêmes graines. Chaque plan de recalibration FX est reconstruit depuis le magasin tronqué au jour D : ${diag.rebuiltMatches as number} / ${recal.length} cibles identiques au bit près à celles de la simulation.`, '');
    md.push('**Cadence des recalibrations et âge du plan actif** (médianes par utilisateur-bloc)', '', '| Bras | Objectif | Bloc | Ratio | Âge moyen du plan actif (j) | Plans démarrés dans le bloc |', '|---|---|---|---|---|---|');
    for (const arm of ['S0', 'FX']) {
      for (const goal of ['loss', 'gain']) {
        for (let b = 1; b <= 5; b++) {
          const rows = dBlocks.filter((r) => r.solver_arm === arm && r.goal === goal && r.block === String(b));
          diag[`cadence_${arm}_${goal}_b${b}`] = { ratio: med(rows, 'ratio'), age: med(rows, 'mean_plan_age'), started: med(rows, 'plans_started') };
          md.push(`| ${arm} | ${goalFr(goal)} | ${b} | ${f3(med(rows, 'ratio'))} | ${f1(med(rows, 'mean_plan_age'))} | ${f1(med(rows, 'plans_started'))} |`);
        }
      }
    }
    md.push('', '**Ratio du monde sous FX selon l’âge moyen du plan actif sur le bloc** (tous blocs)', '', '| Objectif | Âge (j) | Utilisateurs-blocs | Médiane [IC 95 %] |', '|---|---|---|---|');
    const ages: Array<[number, number]> = [
      [0, 7],
      [7, 14],
      [14, 21],
      [21, 28],
      [28, 42],
      [42, 1000],
    ];
    for (const goal of ['loss', 'gain']) {
      for (const [lo, hi] of ages) {
        const rows = dBlocks.filter((r) => r.solver_arm === 'FX' && r.goal === goal && Number(r.mean_plan_age) >= lo && Number(r.mean_plan_age) < hi && r.ratio !== '');
        const byUser = new Map<string, number[]>();
        for (const r of rows) byUser.set(r.job_index as string, [...(byUser.get(r.job_index as string) ?? []), Number(r.ratio)]);
        const s = bootstrapQuantile([...byUser.values()], 0.5);
        diag[`age_${goal}_${lo}_${hi}`] = s;
        md.push(`| ${goalFr(goal)} | ${lo} à ${hi === 1000 ? '…' : hi} | ${s.n} | ${f3(s.value)} [${f3(s.lo)} ; ${f3(s.hi)}] |`);
      }
    }
    md.push('', '**Trajectoire propre du modèle du solveur FX** (départ : corps modélisé du jour D, apport constant du plan ; pente MCO / (vitesse appliquée × poids de référence)), médianes sur les plans de recalibration', '', '| Objectif | Plans | Jours 0-7 | 0-28 | 7-35 | 0-42 | 28-42 | 42-70 | Monde, 28 premiers jours des plans de ≥ 28 j (n) | Durée de vie du plan (j) | AT de départ (kcal/j) | Glycogène − base (kg) | LEC − base (kg) | Cible − cible précédente (kcal/j) |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const goal of ['loss', 'gain']) {
      const rows = recal.filter((r) => r.goal === goal);
      const world = numOf(rows, 'world_ratio_0_28');
      const line = {
        plans: rows.length,
        own_0_7: med(rows, 'solver_weight_ratio_0_7'),
        own_0_28: med(rows, 'solver_weight_ratio_0_28'),
        own_7_35: med(rows, 'solver_weight_ratio_7_35'),
        own_0_42: med(rows, 'solver_weight_ratio_0_42'),
        own_28_42: med(rows, 'solver_weight_ratio_28_42'),
        own_42_70: med(rows, 'solver_weight_ratio_42_70'),
        world_0_28: median(world),
        world_0_28_n: world.length,
        duration: med(rows, 'duration'),
        at: med(rows, 'start_at_kcal'),
        glycogen: median(rows.map((r) => Number(r.start_glycogen_kg) - Number(r.start_glycogen_baseline_kg))),
        ecf: med(rows, 'start_ecf_minus_baseline_kg'),
        targetChange: median(rows.map((r) => Number(r.target) - Number(r.previous_target))),
      };
      diag[`own_${goal}`] = line;
      md.push(`| ${goalFr(goal)} | ${line.plans} | ${f3(line.own_0_7)} | ${f3(line.own_0_28)} | ${f3(line.own_7_35)} | ${f3(line.own_0_42)} | ${f3(line.own_28_42)} | ${f3(line.own_42_70)} | ${f3(line.world_0_28)} (${line.world_0_28_n}) | ${f1(line.duration)} | ${f1(line.at)} | ${f3(line.glycogen)} | ${f3(line.ecf)} | ${f1(line.targetChange)} |`);
    }
    md.push('');
    verdicts.idealDiagnostic = diag;
  }

  // -------------------------------------------------------------------------
  // 5.2 realistic world
  // -------------------------------------------------------------------------
  const real = readAll('real2a');
  if (real.length > 0) {
    const followers = real.filter((r) => r.behavior === 'follower');
    const steady = real.filter((r) => r.behavior === 'steady');
    md.push('## 5.2 Monde réaliste', '', `${new Set(followers.map(userKey)).size} suiveurs et ${new Set(steady.map(userKey)).size} non-suiveurs réguliers, bras S0 (témoin) et FX (correctif). Hall perturbé à ±20 %, pesées t + D + E, pas bruités.`, '');
    const realOut: Record<string, unknown> = {};
    const verdictChecks: Record<string, unknown> = {};
    let a32 = true;
    md.push('### Suiveurs : S1 et S2', '', '| Bras | Objectif | Fenêtre | S1 médiane [IC 95 %] | S1 dans [0,85 ; 1,15] | S2 P90 [IC 95 %] | S2 borne haute ≤ 1,25 |', '|---|---|---|---|---|---|---|');
    for (const arm of ['S0', 'FX']) {
      for (const goal of ['loss', 'gain']) {
        for (const [wk, wname, blocks] of WINDOWS) {
          const byUser = followers.filter((r) => r.solver_arm === arm && r.goal === goal).map((r) => blocksOf(r, blocks));
          const s1 = bootstrapQuantile(byUser, 0.5);
          const s2 = bootstrapQuantile(byUser, 0.9);
          const p1 = inside(s1, 0.85, 1.15);
          const p2 = s2.hi <= 1.25;
          realOut[`${arm}_${goal}_${wk}`] = { s1, s2, s1Pass: p1, s2Pass: p2 };
          if (arm === 'FX' && wk !== 'all') {
            verdictChecks[`S1_${goal}_${wk}`] = { stat: s1, pass: p1 };
            verdictChecks[`S2_${goal}_${wk}`] = { stat: s2, pass: p2 };
            if (!p1 || !p2) a32 = false;
          }
          md.push(`| ${arm} | ${goalFr(goal)} | ${wname} | ${f3(s1.value)} [${f3(s1.lo)} ; ${f3(s1.hi)}] | ${wk === 'all' ? '(info)' : p1 ? 'oui' : '**non**'} | ${f3(s2.value)} [${f3(s2.lo)} ; ${f3(s2.hi)}] | ${wk === 'all' ? '(info)' : p2 ? 'oui' : '**non**'} |`);
        }
      }
    }
    md.push('', '### Suiveurs : S3, S4, S7', '', '| Bras | S3 utilisateurs-semaines au-dessus du plafond [Wilson] | S4 utilisateurs ≥ 7 j sous le plancher réel [Wilson] | S7 maintien dans la zone à 8 semaines [Wilson] |', '|---|---|---|---|');
    for (const arm of ['S0', 'FX']) {
      const rows = followers.filter((r) => r.solver_arm === arm);
      const weeks = rows.reduce((s, r) => s + Number(r.s3_weeks), 0);
      const above = rows.reduce((s, r) => s + Number(r.s3_above), 0);
      const s3 = { k: above, n: weeks, ...wilson(above, weeks) };
      const s4k = rows.filter((r) => Number(r.s4_below_floor_days) >= 7).length;
      const s4 = { k: s4k, n: rows.length, ...wilson(s4k, rows.length) };
      const maint = rows.filter((r) => r.goal === 'maintenance');
      const s7k = maint.filter((r) => r.s7_in_zone_target === '1').length;
      const s7 = { k: s7k, n: maint.length, ...wilson(s7k, maint.length) };
      const s7startK = maint.filter((r) => r.s7_in_zone_true_start === '1').length;
      const p3 = s3.hi <= 0.05;
      const p4 = s4.p <= 0.01 && s4.hi <= 0.02;
      const p7 = s7.lo >= 0.8;
      realOut[`${arm}_S3`] = { ...s3, pass: p3 };
      realOut[`${arm}_S4`] = { ...s4, pass: p4 };
      realOut[`${arm}_S7`] = { ...s7, pass: p7, inZoneTrueStart: wilson(s7startK, maint.length) };
      if (arm === 'FX') {
        verdictChecks.S3 = { ...s3, pass: p3 };
        verdictChecks.S4 = { ...s4, pass: p4 };
        verdictChecks.S7 = { ...s7, pass: p7 };
        if (!p3 || !p4 || !p7) a32 = false;
      }
      md.push(`| ${arm} | ${above} / ${weeks} = ${pc(s3.p)} [${pc(s3.lo)} ; ${pc(s3.hi)}] ${p3 ? 'passe' : '**échoue**'} | ${s4k} / ${rows.length} = ${pc(s4.p)} [${pc(s4.lo)} ; ${pc(s4.hi)}] ${p4 ? 'passe' : '**échoue**'} | ${s7k} / ${maint.length} = ${pc(s7.p)} [${pc(s7.lo)} ; ${pc(s7.hi)}] ${p7 ? 'passe' : '**échoue**'} (zone autour du poids vrai de départ : ${s7startK} / ${maint.length}) |`);
    }
    verdicts.A32 = { pass: a32, checks: verdictChecks };
    md.push('', `**A3.2 (suiveurs, correctif FX, S1 à S4 et S7) : ${a32 ? 'PASSÉ' : 'ÉCHOUÉ'}.**`, '');
    // Paired differences followers.
    md.push('### Suiveurs : différences appariées de médiane (FX − S0)', '', '| Objectif | Fenêtre | Δ médiane [IC 95 %] |', '|---|---|---|');
    for (const goal of ['loss', 'gain']) {
      for (const [wk, wname, blocks] of WINDOWS) {
        const d = pairedMedianDiff(paired(followers.filter((r) => r.goal === goal), 'S0', 'FX').map(({ ra, rb }) => ({ a: blocksOf(ra, blocks), b: blocksOf(rb, blocks) })));
        realOut[`followers_diff_${goal}_${wk}`] = d;
        md.push(`| ${goalFr(goal)} | ${wname} | ${f3(d.value)} [${f3(d.lo)} ; ${f3(d.hi)}] |`);
      }
    }
    // Regular non-followers: no verdict.
    md.push('', '### Non-suiveurs réguliers (plan en cours + s), sans verdict', '', '| Bras | Objectif | s (kcal/j) | Fenêtre | Médiane [IC 95 %] | P10 / P90 |', '|---|---|---|---|---|---|');
    for (const arm of ['S0', 'FX']) {
      for (const goal of ['loss', 'gain']) {
        for (const shift of ['-270', '270', 'tous']) {
          for (const [wk, wname, blocks] of WINDOWS) {
            if (wk === 'all' && shift !== 'tous') continue;
            const s = bootstrapQuantile(steady.filter((r) => r.solver_arm === arm && r.goal === goal && (shift === 'tous' || r.shift === shift)).map((r) => blocksOf(r, blocks)), 0.5);
            realOut[`steady_${arm}_${goal}_${shift}_${wk}`] = s;
            md.push(`| ${arm} | ${goalFr(goal)} | ${shift} | ${wname} | ${f3(s.value)} [${f3(s.lo)} ; ${f3(s.hi)}] | ${f3(s.p10)} / ${f3(s.p90)} |`);
          }
        }
      }
    }
    const steadyMaint = (arm: string) => {
      const m = steady.filter((r) => r.solver_arm === arm && r.goal === 'maintenance');
      const k = m.filter((r) => r.s7_in_zone_target === '1').length;
      return { k, n: m.length, ...wilson(k, m.length) };
    };
    md.push('', `Non-suiveurs réguliers en maintien, dans la zone à 8 semaines : S0 ${steadyMaint('S0').k} / ${steadyMaint('S0').n}, FX ${steadyMaint('FX').k} / ${steadyMaint('FX').n}.`, '');
    realOut.steadyMaintenance = { S0: steadyMaint('S0'), FX: steadyMaint('FX') };
    // Other facts.
    md.push('### Autres constats (monde réaliste)', '', '| Population | Bras | Recalibrations appliquées (médiane) | Utilisateurs avec échec de plan | Échecs `no_feasible_speed` | Propositions de révision | Plans FX sans état | Écart poids modélisé − tendance, médiane [P10 ; P90] (kg) | Écart modélisé − vrai, médiane [P10 ; P90] (kg) |', '|---|---|---|---|---|---|---|---|---|');
    for (const [pop, rowsPop] of [
      ['suiveurs', followers],
      ['non-suiveurs réguliers', steady],
    ] as const) {
      for (const arm of ['S0', 'FX']) {
        const rows = rowsPop.filter((r) => r.solver_arm === arm);
        const g = arm === 'FX' ? modeledGaps(rows) : null;
        const st = g ? sortNum(g.trend) : [];
        const sw = g ? sortNum(g.truth) : [];
        const nfs = rows.reduce((s, r) => s + (r.plan_failures ?? '').split('/').filter((x) => x.includes('no_feasible_speed')).length, 0);
        realOut[`other_${pop}_${arm}`] = { medianRecalibrations: median(rows.map((r) => Number(r.n_recal))), usersWithFailure: rows.filter((r) => (r.plan_failures ?? '') !== '').length, noFeasibleSpeed: nfs, proposals: rows.filter((r) => r.proposal_day !== '').length, ...(g ? { plans: g.plans, modeledNull: g.nullCount, gapTrend: { median: quantile(st, 0.5), p10: quantile(st, 0.1), p90: quantile(st, 0.9) }, gapTrue: { median: quantile(sw, 0.5), p10: quantile(sw, 0.1), p90: quantile(sw, 0.9) } } : {}) };
        md.push(`| ${pop} | ${arm} | ${f1(median(rows.map((r) => Number(r.n_recal))))} | ${rows.filter((r) => (r.plan_failures ?? '') !== '').length} | ${nfs} | ${rows.filter((r) => r.proposal_day !== '').length} | ${g ? `${g.nullCount} / ${g.plans}` : '—'} | ${g ? `${f3(quantile(st, 0.5))} [${f3(quantile(st, 0.1))} ; ${f3(quantile(st, 0.9))}]` : '—'} | ${g ? `${f3(quantile(sw, 0.5))} [${f3(quantile(sw, 0.1))} ; ${f3(quantile(sw, 0.9))}]` : '—'} |`);
      }
    }
    // Strata of the followers.
    md.push('', '### Strates des suiveurs (médiane du ratio ; S7 en maintien)', '', '| Strate | Valeur | Objectif | Utilisateurs | S0 sem. 5-12 | S0 sem. 13-24 | FX sem. 5-12 | FX sem. 13-24 | S4 FX (≥ 7 j) |', '|---|---|---|---|---|---|---|---|---|');
    for (const [col, label] of [...STRATA, ['weigh_p', 'fréquence de pesée'] as [string, string]]) {
      const values = [...new Set(followers.map((r) => r[col] as string))].sort();
      for (const v of values) {
        for (const goal of ['loss', 'gain', 'maintenance']) {
          const sel = followers.filter((r) => r[col] === v && r.goal === goal);
          if (sel.length === 0) continue;
          const m = (arm: string, blocks: number[]) => median(sel.filter((r) => r.solver_arm === arm).flatMap((r) => blocksOf(r, blocks)));
          const fx = sel.filter((r) => r.solver_arm === 'FX');
          const s4 = fx.filter((r) => Number(r.s4_below_floor_days) >= 7).length;
          const s7 = goal === 'maintenance' ? ` ; S7 FX ${fx.filter((r) => r.s7_in_zone_target === '1').length} / ${fx.length}` : '';
          md.push(`| ${label} | ${v} | ${goalFr(goal)} | ${sel.length / 2} | ${goal === 'maintenance' ? '—' : f3(m('S0', [1, 2]))} | ${goal === 'maintenance' ? '—' : f3(m('S0', [3, 4, 5]))} | ${goal === 'maintenance' ? '—' : f3(m('FX', [1, 2]))} | ${goal === 'maintenance' ? '—' : f3(m('FX', [3, 4, 5]))} | ${s4} / ${fx.length}${s7} |`);
        }
      }
    }
    md.push('');
    verdicts.real = realOut;
  }

  // -------------------------------------------------------------------------
  // 5.3 first plan and golden, 5.4 invariants, 5.5 timing (own raw files)
  // -------------------------------------------------------------------------
  const first = readAll('firstplan2a');
  if (first.length > 0) {
    md.push('## 5.3 Premier plan (hypercube, sans seuil)', '', `${new Set(first.map((r) => r.profile_index)).size} profils. Pour chaque vitesse demandée : écart de cible FX − S0 sur les plans valides dans les deux bras, part des plans où le plancher ralentit la vitesse (rejet \`below_hard_floor\`), part sans vitesse faisable.`, '');
    md.push('| Objectif | Vitesse demandée (%/sem.) | Profils | Δ cible médiane [P10 ; P90] (kcal/j) | Ralentis par le plancher S0 → FX | Sans vitesse faisable S0 → FX | Vitesse retenue plus lente sous FX |', '|---|---|---|---|---|---|---|');
    const out: Record<string, unknown> = {};
    for (const goal of ['loss', 'gain', 'maintenance']) {
      const rates = [...new Set(first.filter((r) => r.goal === goal).map((r) => r.requested))].sort((a, b) => Number(a) - Number(b));
      for (const rate of rates) {
        const sel = first.filter((r) => r.goal === goal && r.requested === rate);
        const s0 = sel.filter((r) => r.solver_arm === 'S0');
        const fx = new Map(sel.filter((r) => r.solver_arm === 'FX').map((r) => [r.profile_index, r]));
        const diffs: number[] = [];
        let slower = 0;
        for (const a of s0) {
          const b = fx.get(a.profile_index);
          if (!b) continue;
          if (a.status === 'ok' && b.status === 'ok') diffs.push(Number(b.target) - Number(a.target));
          if (a.status === 'ok' && b.status === 'ok' && Number(b.applied_rate) < Number(a.applied_rate) - 1e-9) slower++;
        }
        const d = sortNum(diffs);
        const floorS0 = s0.filter((r) => r.floor_slowed === '1').length;
        const floorFx = [...fx.values()].filter((r) => r.floor_slowed === '1').length;
        const nfS0 = s0.filter((r) => r.status === 'no_feasible_speed').length;
        const nfFx = [...fx.values()].filter((r) => r.status === 'no_feasible_speed').length;
        const n = s0.length;
        out[`${goal}_${rate}`] = { n, diff: { median: quantile(d, 0.5), p10: quantile(d, 0.1), p90: quantile(d, 0.9) }, floorSlowed: { S0: wilson(floorS0, n), FX: wilson(floorFx, n) }, noFeasible: { S0: wilson(nfS0, n), FX: wilson(nfFx, n) }, slowerUnderFx: slower };
        md.push(`| ${goalFr(goal)} | ${(100 * Number(rate)).toFixed(2).replace('.', ',')} | ${n} | ${f0(quantile(d, 0.5))} [${f0(quantile(d, 0.1))} ; ${f0(quantile(d, 0.9))}] | ${pc(floorS0 / n)} → ${pc(floorFx / n)} | ${pc(nfS0 / n)} → ${pc(nfFx / n)} | ${slower} |`);
      }
    }
    verdicts.firstPlan = out;
    md.push('');
  }
  const golden = readAll('golden2a');
  if (golden.length > 0) {
    md.push('## 5.3 Golden et cas R et S (premier plan, S0 → FX)', '', '| Cas | Objectif | Vitesse demandée | Cible S0 | Cible FX | Δ (kcal/j) | Vitesse retenue S0 → FX | Statut S0 → FX | Rejets FX |', '|---|---|---|---|---|---|---|---|---|');
    for (const r of golden) md.push(`| ${r.case} | ${goalFr(r.goal as string)} | ${r.requested} | ${f0(Number(r.target_s0))} | ${f0(Number(r.target_fx))} | ${f0(Number(r.target_fx) - Number(r.target_s0))} | ${r.rate_s0} → ${r.rate_fx} | ${r.status_s0} → ${r.status_fx} | ${r.rejections_fx} |`);
    md.push('');
    verdicts.golden = golden;
  }
  const inv = readAll('invariants2a');
  if (inv.length > 0) {
    md.push('## 5.4 Invariants du curseur calories ↔ pas (correctif FX)', '');
    for (const src of [...new Set(inv.map((r) => r.source))]) {
      const rows = inv.filter((r) => r.source === src);
      const viol = rows.filter((r) => r.monotone === '0').length;
      const gaps = sortNum(rows.map((r) => Number(r.max_abs_tissue_gap)));
      const notConv = rows.reduce((s, r) => s + Number(r.not_converged), 0);
      md.push(`- ${src} : ${rows.length} plans, ${rows.reduce((s, r) => s + Number(r.points), 0)} points du curseur ; violations de monotonie : **${viol}** ; écart |masse tissulaire j42 − cible| max par plan : médiane ${f3(quantile(gaps, 0.5))} kg, max ${f3(gaps[gaps.length - 1] ?? Number.NaN)} kg ; points non convergés : ${notConv}.`);
      verdicts[`invariants_${src}`] = { plans: rows.length, violations: viol, maxTissueGap: gaps[gaps.length - 1] ?? null, notConverged: notConv };
    }
    md.push('');
  }
  const timing = readAll('timing2a');
  if (timing.length > 0) {
    md.push('## 5.5 Temps d’un recalcul complet (calibration + état actuel + solveur)', '', '| Bras | Profils | P50 (ms) | P95 (ms) | P95 × 4 [déduit] (ms) | Seuil 1 s |', '|---|---|---|---|---|---|');
    const out: Record<string, unknown> = {};
    for (const arm of ['S0', 'FX']) {
      const ms = sortNum(timing.filter((r) => r.solver_arm === arm).map((r) => Number(r.ms)));
      const p50 = quantile(ms, 0.5);
      const p95 = quantile(ms, 0.95);
      out[arm] = { n: ms.length, p50, p95, p95x4: 4 * p95, pass: 4 * p95 <= 1000 };
      md.push(`| ${arm} | ${ms.length} | ${f1(p50)} | ${f1(p95)} | ${f1(4 * p95)} | ${4 * p95 <= 1000 ? 'sous' : '**au-dessus**'} |`);
    }
    verdicts.timing = out;
    md.push('');
  }
  const launch = `${DIR}/timing/launch-times.txt`;
  if (existsSync(launch)) md.push('## Temps réel des lancements', '', '```', readFileSync(launch, 'utf8').trim(), '```', '');
  writeFileSync(`${DIR}/tables2a.md`, `${md.join('\n')}\n`);
  writeFileSync(`${DIR}/verdicts2a.json`, `${JSON.stringify(verdicts, null, 2)}\n`);
});
