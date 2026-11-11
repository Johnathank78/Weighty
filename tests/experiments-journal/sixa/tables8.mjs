// Amendment 8 (report 49, point 7): tables rebuilt from the raw JSON lines of tests/experiments-journal/results/6a/.
//   node tests/experiments-journal/sixa/tables8.mjs training     -> selection (writes results/6a/selection.json)
//   node tests/experiments-journal/sixa/tables8.mjs validation   -> verdict V1 to V3 (writes results/6a/verdict.json)
// Optional third argument: another raw file (e.g. validation-200.jsonl after doubling n).
// Bootstrap: 2 000 draws, unit = simulated user, percentile interval 95 %, seed 6 300 000 001 (mulberry32 as
// tests/helpers/random.ts, which reads `seed >>> 0`), consumed in the order of the tables below.
import { readFileSync, writeFileSync } from 'node:fs';

const DIR = 'tests/experiments-journal/results/6a';
const [, , phase = 'validation', rawFile] = process.argv;
const BOOTSTRAP_SEED = 6_300_000_001;
const DRAWS = 2000;

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = createRng(BOOTSTRAP_SEED);

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = (s.length - 1) / 2;
  return (s[Math.floor(mid)] + s[Math.ceil(mid)]) / 2;
}

/** Median and its 95 % percentile bootstrap interval (users resampled with replacement). */
function medianCI(values) {
  const n = values.length;
  const meds = [];
  const sample = new Array(n);
  for (let b = 0; b < DRAWS; b++) {
    for (let i = 0; i < n; i++) sample[i] = values[Math.floor(rng() * n)];
    meds.push(median(sample));
  }
  meds.sort((a, b) => a - b);
  return { n, median: median(values), lo: meds[Math.round(0.025 * (DRAWS - 1))], hi: meds[Math.round(0.975 * (DRAWS - 1))] };
}

/** PASS: upper bound within the threshold; FAIL: lower bound beyond it; otherwise INCONCLUSIVE (never GO). */
function judge(ci, threshold) {
  if (ci.hi <= threshold) return 'PASS';
  if (ci.lo > threshold) return 'FAIL';
  return 'INCONCLUSIVE';
}

const f2 = (x) => (x === null || x === undefined ? '-' : x.toFixed(2).replace('.', ','));
const f0 = (x) => (x === null || x === undefined ? '-' : Math.round(x).toLocaleString('fr-FR').replace(/ | /g, ' '));
const ciText = (c) => `${f2(c.median)} [${f2(c.lo)} ; ${f2(c.hi)}]`;
const INTAKE = { target: 'cible', maintenance: 'maintien vrai', target_minus_300: 'cible - 300' };

const users = readFileSync(`${DIR}/${rawFile ?? `${phase}.jsonl`}`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const cells = [...new Set(users.map((u) => u.cell))].sort((a, b) => a - b);
const ofCell = (c) => users.filter((u) => u.cell === c);
const label = (c) => {
  const u = ofCell(c)[0];
  return `G = ${u.gap} j, ${INTAKE[u.intake]}`;
};
const out = [];

if (phase === 'training') {
  const variants = ['A', 'B'];
  const rows = [];
  const max = {};
  for (const v of variants) max[v] = -Infinity;
  out.push('| Cellule | A : m1 à R + 7, médiane [IC 95 %] | B : m1 à R + 7, médiane [IC 95 %] | n |', '|---|---|---|---|');
  for (const c of cells) {
    const row = { cell: c, label: label(c) };
    for (const v of variants) {
      row[v] = medianCI(ofCell(c).map((u) => u.estimators[v][1].m));
      max[v] = Math.max(max[v], row[v].median);
    }
    rows.push(row);
    out.push(`| ${c} (${row.label}) | ${ciText(row.A)} | ${ciText(row.B)} | ${row.A.n} |`);
  }
  // Selection rule of the amendment: the lowest maximum over the nine cells of the median of m1 at R + 7; within 0.05 kg: A.
  const retained = Math.abs(max.A - max.B) < 0.05 ? 'A' : max.A < max.B ? 'A' : 'B';
  out.push('', `Maximum sur les neuf cellules de la médiane de m1 à R + 7 : A ${f2(max.A)} kg, B ${f2(max.B)} kg. Écart ${f2(Math.abs(max.A - max.B))} kg. Variante retenue : ${retained}.`);
  writeFileSync(`${DIR}/selection.json`, `${JSON.stringify({ retained, maxA: max.A, maxB: max.B, rows }, null, 2)}\n`);
} else {
  const retained = Object.keys(users[0].estimators).find((e) => e !== 'sans');
  const verdict = { retained, cells: [], V1: 'PASS', V2: 'PASS', V3: 'PASS', plans: { built: 0, failed: 0, underFloor: 0, forbiddenRate: 0 } };
  const worst = (a, b) => (a === 'FAIL' || b === 'FAIL' ? 'FAIL' : a === 'INCONCLUSIVE' || b === 'INCONCLUSIVE' ? 'INCONCLUSIVE' : 'PASS');
  out.push(`Variante retenue : ${retained}. Médianes en kg [IC 95 % bootstrap].`, '');
  out.push(`| Cellule | n | m0 à R, ${retained} (V1 ≤ 0,3) | m1 à R + 7, ${retained} (V2 ≤ 0,5) | m1 à R + 14, ${retained} (V2 ≤ 0,5) | V1 | V2 |`, '|---|---|---|---|---|---|---|');
  for (const c of cells) {
    const us = ofCell(c);
    const m0 = medianCI(us.map((u) => u.estimators[retained][0].m));
    const m7 = medianCI(us.map((u) => u.estimators[retained][1].m));
    const m14 = medianCI(us.map((u) => u.estimators[retained][2].m));
    const v1 = judge(m0, 0.3);
    const v2 = worst(judge(m7, 0.5), judge(m14, 0.5));
    verdict.V1 = worst(verdict.V1, v1);
    verdict.V2 = worst(verdict.V2, v2);
    verdict.cells.push({ cell: c, label: label(c), n: us.length, m0, m7, m14, v1, v2 });
    out.push(`| ${c} (${label(c)}) | ${us.length} | ${ciText(m0)} | ${ciText(m7)} | ${ciText(m14)} | ${v1} | ${v2} |`);
  }
  out.push('', 'Rapportés, non jugés : le code de 71bc77e (« sans ») et la référence sans pause (même graine), médianes [IC 95 %].', '');
  out.push('| Cellule | sans : m0 à R | sans : m1 à R + 7 | sans : m1 à R + 14 | référence : m0 à R | référence : m1 à R + 7 | référence : m1 à R + 14 |', '|---|---|---|---|---|---|---|');
  for (const c of cells) {
    const us = ofCell(c);
    const s = [0, 1, 2].map((k) => medianCI(us.map((u) => u.estimators.sans[k].m)));
    const r = [0, 1, 2].map((k) => medianCI(us.map((u) => u.reference[k].m)));
    out.push(`| ${c} (${label(c)}) | ${s.map(ciText).join(' | ')} | ${r.map(ciText).join(' | ')} |`);
  }
  // Offsets retained and the targets of the periodic replan (medians), every plan built checked (V3).
  out.push('', 'Offset retenu (kcal/j, médiane) et cible que construirait le recalcul périodique (kcal/j, médiane), aux jours R et R + 7.', '');
  out.push(`| Cellule | offset vrai | offset ${retained} à R / R + 7 / R + 14 | offset sans à R / R + 7 / R + 14 | cible ${retained} à R / R + 7 | cible sans à R / R + 7 | cible du premier plan |`, '|---|---|---|---|---|---|---|');
  for (const c of cells) {
    const us = ofCell(c);
    const med = (fn) => median(us.map(fn));
    const offs = (e) => [0, 1, 2].map((k) => f0(med((u) => u.estimators[e][k].offsetKcal))).join(' / ');
    const targets = (e) => [0, 1].map((k) => f0(med((u) => u.estimators[e][k].plan?.calorieTargetKcal ?? Number.NaN))).join(' / ');
    out.push(`| ${c} (${label(c)}) | ${f0(med((u) => u.trueOffsetKcal))} | ${offs(retained)} | ${offs('sans')} | ${targets(retained)} | ${targets('sans')} | ${f0(us[0].targetKcal)} |`);
  }
  // V3 is judged on the plans of the retained variant; those of today's code are reported beside.
  const sansPlans = { built: 0, failed: 0, underFloor: 0, forbiddenRate: 0 };
  for (const u of users) {
    for (const [e, count] of [[retained, verdict.plans], ['sans', sansPlans]]) {
      for (const m of u.estimators[e]) {
        if (!m.plan) continue;
        if (!m.plan.ok) count.failed++;
        else {
          count.built++;
          if (m.plan.underFloor) count.underFloor++;
          if (m.plan.forbiddenRate) count.forbiddenRate++;
        }
      }
    }
  }
  verdict.sansPlans = sansPlans;
  verdict.V3 = verdict.plans.underFloor === 0 && verdict.plans.forbiddenRate === 0 ? 'PASS' : 'FAIL';
  out.push('', `V3 : ${verdict.plans.built} plans construits par ${retained} (jours R et R + 7), ${verdict.plans.failed} refusés ; sous le plancher : ${verdict.plans.underFloor} ; vitesse interdite : ${verdict.plans.forbiddenRate}. ${verdict.V3}. Code de 71bc77e, rapporté : ${sansPlans.built} construits, ${sansPlans.failed} refusés, ${sansPlans.underFloor} sous le plancher, ${sansPlans.forbiddenRate} à vitesse interdite.`);
  out.push('', `V1 : ${verdict.V1}. V2 : ${verdict.V2}. V3 : ${verdict.V3}. V4 et V5 : rapportés à part.`);
  writeFileSync(`${DIR}/verdict${rawFile ? `-${rawFile.replace(/\.jsonl$/, '')}` : ''}.json`, `${JSON.stringify(verdict, null, 2)}\n`);
}
const text = `${out.join('\n')}\n`;
writeFileSync(`${DIR}/tables8-${phase}${rawFile ? `-${rawFile.replace(/\.jsonl$/, '')}` : ''}.md`, text);
process.stdout.write(text);
