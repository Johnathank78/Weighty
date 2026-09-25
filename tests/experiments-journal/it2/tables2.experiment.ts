/**
 * Journal battery, iteration 2 (prompt 36): tables and verdicts rebuilt from the raw exports only.
 * Run: npx vitest run -c vitest.journal.config.ts it2/tables2
 * Reads tests/experiments-journal/results/{controls2,timing2}/ and writes results/tables2.md and results/verdicts2.json.
 * Bootstrap: 2 000 resamples of users (all blocks of a user together), fixed seed 36_000_001.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { it } from 'vitest';
import { createRng } from '../../helpers/random';
import { RESULTS } from './jobs';

type Row = Record<string, string>;

function readCsvGz(path: string): Row[] {
  const text = gunzipSync(readFileSync(path)).toString('utf8');
  const lines = text.split('\n').filter((l) => l.length > 0);
  const header = (lines[0] as string).split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: Row = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ''));
    return row;
  });
}

function readAll(dir: string, prefix: string): Row[] {
  const d = `${RESULTS}/${dir}`;
  return readdirSync(d)
    .filter((f) => new RegExp(`^${prefix}-shard\\d+\\.csv\\.gz$`).test(f))
    .sort()
    .flatMap((f) => readCsvGz(`${d}/${f}`));
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return (sorted[lo] as number) + ((sorted[hi] as number) - (sorted[lo] as number)) * (pos - lo);
}
const median = (v: readonly number[]) => quantile([...v].sort((a, b) => a - b), 0.5);

/** Median over pooled values, with a bootstrap 95 % CI resampling users (each user keeps all his values). */
function bootstrapMedian(byUser: ReadonlyArray<readonly number[]>, seed: number): { n: number; users: number; median: number; lo: number; hi: number; p10: number; p90: number } {
  const all = byUser.flat().sort((a, b) => a - b);
  const rng = createRng(seed);
  const stats: number[] = [];
  for (let b = 0; b < 2000; b++) {
    const sample: number[] = [];
    for (let k = 0; k < byUser.length; k++) sample.push(...(byUser[Math.floor(rng.next() * byUser.length)] as readonly number[]));
    stats.push(median(sample));
  }
  stats.sort((a, b) => a - b);
  return { n: all.length, users: byUser.length, median: quantile(all, 0.5), lo: quantile(stats, 0.025), hi: quantile(stats, 0.975), p10: quantile(all, 0.1), p90: quantile(all, 0.9) };
}

const f3 = (v: number) => (Number.isFinite(v) ? v.toFixed(3).replace('.', ',') : '—');
const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1).replace('.', ',') : '—');

it('iteration 2 tables', () => {
  const md: string[] = ['# Itération 2 : tableaux reconstruits depuis les bruts', '', 'Script : `tests/experiments-journal/it2/tables2.experiment.ts`. Bootstrap : 2 000 tirages d’utilisateurs, graine 36 000 001.', ''];
  const verdicts: Record<string, unknown> = {};

  // 6.1 ideal world
  const ideal = readAll('controls2', 'ideal');
  md.push('## 6.1 Monde idéal (critère : médiane du ratio dans [0,9 ; 1,1] en perte et en prise)', '');
  md.push(`${ideal.length} utilisateurs (suiveurs parfaits, Hall nominal, pesées sans bruit, u = 0), bras A. Ratio = pente du poids vrai sur le bloc / (vitesse du plan actif x poids vrai au début du bloc). Propositions de révision : ${ideal.filter((r) => r.proposal_day !== '').length}.`, '');
  md.push('| Objectif | Fenêtre | Vitesse de référence | Blocs (utilisateurs) | Médiane [IC 95 %] | P10 / P90 | Dans [0,9 ; 1,1] |', '|---|---|---|---|---|---|---|');
  const windows: Array<[string, number[]]> = [
    ['semaines 5 à 12', [1, 2]],
    ['semaines 13 à 24', [3, 4, 5]],
    ['semaines 5 à 24', [1, 2, 3, 4, 5]],
  ];
  const idealVerdict: Record<string, unknown> = {};
  let idealPass = true;
  for (const goal of ['loss', 'gain']) {
    for (const [wname, blocks] of windows) {
      for (const [ref, prefix] of [
        ['plan actif (weeklyRateTarget)', 'ratio_b'],
        ['demandée du profil (requestedWeeklyRate)', 'ratio_req_b'],
      ] as const) {
        const byUser = ideal.filter((r) => r.goal === goal).map((r) => blocks.map((b) => r[`${prefix}${b}`]).filter((v) => v !== '' && v !== undefined).map(Number));
        const s = bootstrapMedian(byUser, 36_000_001);
        const pass = s.median >= 0.9 && s.median <= 1.1;
        if (prefix === 'ratio_b' && wname === 'semaines 5 à 24') {
          idealVerdict[goal] = { ...s, pass };
          if (!pass) idealPass = false;
        }
        md.push(`| ${goal === 'loss' ? 'perte' : 'prise'} | ${wname} | ${ref} | ${s.n} (${s.users}) | ${f3(s.median)} [${f3(s.lo)} ; ${f3(s.hi)}] | ${f3(s.p10)} / ${f3(s.p90)} | ${pass ? 'oui' : '**non**'} |`);
      }
    }
  }
  verdicts.control61 = { pass: idealPass, byGoal: idealVerdict };
  md.push('', `**Contrôle 6.1 : ${idealPass ? 'passé' : 'ÉCHOUÉ'}** (fenêtre semaines 5 à 24, vitesse du plan actif).`, '');

  // 6.1 diagnostic
  const diag = readAll('controls2', 'ideal-diagnostic');
  if (diag.length > 0) {
    md.push('### Diagnostic de l’échec (sans critère)', '');
    md.push('Pour chaque utilisateur en perte ou en prise et chaque début de bloc D, plan actif au jour D. Médianes.', '');
    md.push('| Objectif | D | n | Ratio du monde (28 j) | Ratio implicite du solveur, équilibre frais, jours 7 à 35 | Part de la variation sur 42 j du solveur tombant en semaine 1 | Variation du poids vrai sur 42 j au maintien du plan (kg) | AT du monde au jour D (kcal/j) | Offset estimé − vrai (kcal/j) |', '|---|---|---|---|---|---|---|---|---|');
    const diagOut: Record<string, unknown> = {};
    for (const goal of ['loss', 'gain']) {
      for (const D of ['28', '56', '84', '112', '140', 'tous']) {
        const rr = diag.filter((r) => r.goal === goal && (D === 'tous' || r.block_start === D));
        const m = (k: string) => median(rr.map((r) => Number(r[k])));
        const err = median(rr.filter((r) => r.offset_estimate !== '').map((r) => Number(r.offset_estimate) - Number(r.offset_truth)));
        const line = { n: rr.length, ratioWorld: m('ratio_world'), ratioSolverFresh: m('ratio_solver_fresh'), week1Share: m('fresh_week1_share'), changeAtPlanMaintenance42d: m('world_change_at_plan_maintenance_42d'), atKcal: m('at_kcal'), offsetError: err };
        diagOut[`${goal}_${D}`] = line;
        md.push(`| ${goal === 'loss' ? 'perte' : 'prise'} | ${D} | ${line.n} | ${f3(line.ratioWorld)} | ${f3(line.ratioSolverFresh)} | ${f3(line.week1Share)} | ${f3(line.changeAtPlanMaintenance42d)} | ${f1(line.atKcal)} | ${f1(line.offsetError)} |`);
      }
    }
    verdicts.control61Diagnostic = diagOut;
    md.push('');
  }

  // 6.2 pairing
  const pairDir = `${RESULTS}/controls2`;
  const pairFiles = existsSync(pairDir) ? readdirSync(pairDir).filter((f) => /^pairing-shard\d+\.json$/.test(f)) : [];
  if (pairFiles.length > 0) {
    const objs = pairFiles.map((f) => JSON.parse(readFileSync(`${pairDir}/${f}`, 'utf8')) as { users: number; proposals: number; arms: number; mismatches: string[] });
    const sum = (k: 'users' | 'proposals' | 'arms') => objs.reduce((s, o) => s + o[k], 0);
    const mismatches = objs.flatMap((o) => o.mismatches);
    verdicts.control62 = { users: sum('users'), usersWithProposal: sum('proposals'), armComparisons: sum('arms'), mismatches: mismatches.length, pass: mismatches.length === 0 };
    md.push('## 6.2 Appariement (bifurcation contre rejeu complet depuis le jour 0)', '');
    md.push(`${sum('users')} utilisateurs (dont ${sum('proposals')} avec proposition, donc bifurqués), ${sum('arms')} bras comparés (A, J, C, J-NASEM, J-glucides) : **${mismatches.length} différence(s)**. Comparaison au caractère près du JSON (doubles à aller-retour exact) des séries quotidiennes, plans, évaluations, pesées, journaux quotidiens et entrées du journal.`, '');
  }

  // Timing
  const launch = `${RESULTS}/timing2/launch-times.txt`;
  if (existsSync(launch)) {
    md.push('## Temps réel des lancements', '', '```', readFileSync(launch, 'utf8').trim(), '```', '');
  }
  const timing: Array<Record<string, unknown>> = [];
  for (const dir of ['controls2']) {
    for (const f of readdirSync(`${RESULTS}/${dir}`).filter((x) => /-timing-shard\d+\.json$/.test(x))) timing.push(JSON.parse(readFileSync(`${RESULTS}/${dir}/${f}`, 'utf8')) as Record<string, unknown>);
  }
  if (timing.length > 0) {
    const users = timing.reduce((s, t) => s + (t.users as number), 0);
    const ms = timing.reduce((s, t) => s + (t.userMsTotal as number), 0);
    verdicts.timing = { users, userMsTotal: ms, msPerUser: ms / users };
    md.push(`Coût par utilisateur (6.1, bras A seul, 168 j) : ${f1(ms / users / 1000)} s de calcul en moyenne (${users} utilisateurs).`, '');
  }

  writeFileSync(`${RESULTS}/tables2.md`, `${md.join('\n')}\n`);
  writeFileSync(`${RESULTS}/verdicts2.json`, `${JSON.stringify(verdicts, null, 2)}\n`);
});
