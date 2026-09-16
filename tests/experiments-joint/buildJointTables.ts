/** Global teardown of the joint bias experiment (handoff prompt 27): writes reports/joint-bias/tables.md from the cell summaries. */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { CellSummary, Comparison, Truth } from '../helpers/jointBiasExperiment';
import type { PairedDelta, Proportion } from '../helpers/intakeLoggingExperiment';

const DIR = 'reports/joint-bias';
const SCENARIOS = ['A', 'B', 'C', 'D', 'E', 'F', 'S_on', 'S_major'];

const f0 = (v: number) => (Object.is(Math.round(v), -0) ? '0' : Math.round(v).toString());
const f2 = (v: number) => v.toFixed(2);
const sg = (v: number, d = 2) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}`;
const prop = (p: Proportion) => `${f2(p.value)} [${f2(p.low)}-${f2(p.high)}]`;
const delta = (d: PairedDelta, digits = 2) => `${sg(d.mean, digits)} [${sg(d.low, digits)} ; ${sg(d.high, digits)}]`;
const pct = (v: number) => `${Math.round(v * 100)} %`;

function loadAll(): CellSummary[] {
  if (!existsSync(`${DIR}/cells`)) return [];
  return readdirSync(`${DIR}/cells`)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(`${DIR}/cells/${f}`, 'utf8')) as CellSummary);
}

const HEADER =
  '| Scénario | Couv. saisie | Bras | Méd. erreur | Biais | Couv. 80 % [IC 95] | Couv. 95 % [IC 95] | Largeur 80 (méd.) | Δ couv. 80 vs A [IC] | Δ couv. 95 vs A [IC] | Δ méd. erreur vs A [IC] | Ratio largeur | Porte |\n|---|---|---|---:|---:|---|---|---:|---|---|---|---:|---:|';

function row(s: CellSummary, arm: string, c: Comparison): string {
  const v = c.vsA;
  return `| ${s.cell.scenario} | ${pct(s.cell.coverage)} | ${arm} | ${f0(c.medianAbsErrorKcal)} | ${f0(c.meanBiasKcal)} | ${prop(c.coverage80)} | ${prop(c.coverage95)} | ${f0(c.medianWidth80Kcal)} | ${v ? delta(v.coverage80) : ''} | ${v ? delta(v.coverage95) : ''} | ${v ? delta(v.medianAbsErrorKcal, 0) : ''} | ${v ? f2(v.widthRatio) : ''} | ${pct(c.gateShare)} |`;
}

function sortCells(cells: CellSummary[]): CellSummary[] {
  return [...cells].sort((a, b) => SCENARIOS.indexOf(a.cell.scenario) - SCENARIOS.indexOf(b.cell.scenario) || b.cell.coverage - a.cell.coverage);
}

export function buildJointTables(): void {
  const all = loadAll();
  if (all.length === 0) return;
  const parts: string[] = ['# Tables : estimation conjointe (offset, biais de saisie), prompt 27', ''];
  const n = all[0]?.n ?? 0;
  const totalMs = all.reduce((s, c) => s + c.elapsedMs, 0);
  parts.push(
    `Généré par \`tests/experiments-joint/buildJointTables.ts\`. ${all.length} cellules, n = ${n} utilisateurs simulés par cellule (${all[0]?.replicates} réplications × 42), ${all[0]?.fitsPerUser} évaluations de vraisemblance complètes par utilisateur (1 bras A + 41 tranches de k).`,
    `Coût : ${(totalMs / 3_600_000).toFixed(2)} h de calcul cumulées sur les threads, soit ${(totalMs / all.length / n).toFixed(0)} ms par utilisateur en moyenne.`,
    'IC 95 : Wilson (couvertures), différence appariée (Δ couverture), bootstrap apparié 2 000 tirages (Δ erreur médiane).',
    '',
  );

  // Axis 1
  parts.push('## Axe 1 : identifiabilité de k (scénario idéal, couverture de saisie 100 %, population P10, prior nominal N(-10 %, 10 pts))', '');
  parts.push(
    '| CV apport réel | Horizon | CV déclaré (méd.) | Largeur 80 k post / prior (méd.) | Corrélation offset-u (méd.) | Méd. erreur k (postérieur) | Méd. erreur k (prior seul) | Couv. 80 % de k [IC] | Masse moy. borne k = 1 | Masse moy. borne k max | Utilisateurs > 5 % borne k = 1 | > 5 % borne k max | > 5 % bornes offset (bas / haut) | Vrai u hors support | Méd. erreur offset réel A / D |',
    '|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---|---:|---|',
  );
  for (const s of all.filter((c) => c.cell.axis === 'identifiability').sort((a, b) => a.cell.intakeCv - b.cell.intakeCv || a.cell.days - b.cell.days)) {
    const id = s.identifiability[0];
    if (!id) continue;
    const a = s.results.metabolic.A as Comparison;
    const d = s.results.metabolic[`D ${id.priorLabel}`] as Comparison;
    parts.push(
      `| ${pct(s.cell.intakeCv)} | ${s.cell.days} j | ${pct(s.medianDeclaredCv)} | ${f2(id.medianKWidthRatio)} | ${sg(id.medianCorrelation)} | ${id.medianAbsKError.toFixed(3)} | ${id.medianAbsKErrorPriorOnly.toFixed(3)} | ${prop(id.kCoverage80)} | ${f2(id.meanEdge.kLowerBin)} | ${f2(id.meanEdge.kUpperBin)} | ${pct(id.shareEdgeOver5.kLower)} | ${pct(id.shareEdgeOver5.kUpper)} | ${pct(id.shareEdgeOver5.offsetLow5)} / ${pct(id.shareEdgeOver5.offsetHigh5)} | ${pct(s.shareUOutsideSupport)} | ${f0(a.medianAbsErrorKcal)} / ${f0(d.medianAbsErrorKcal)} |`,
    );
  }

  // Axis 2
  for (const truth of ['metabolic', 'loggedUnits'] as const) {
    const label = truth === 'metabolic' ? 'référence 1, maintien réel' : 'référence 2, maintien dans les unités de saisie';
    for (const days of [28, 42]) {
      parts.push('', `## Axe 2 : performance, ${days} jours, ${label} (population P10, prior nominal)`, '', HEADER);
      for (const s of sortCells(all.filter((c) => c.cell.axis === 'performance' && c.cell.days === days))) {
        const r = s.results[truth as Truth];
        parts.push(row(s, 'A', r.A as Comparison), row(s, 'C-exact', r['C-exact'] as Comparison), row(s, 'D nominal', r[`D ${s.priors[0]?.label}`] as Comparison));
      }
    }
  }
  parts.push('', '## Axe 2 : diagnostics de k dans les cellules de performance (prior nominal)', '');
  parts.push('| Scénario | Horizon | Couv. saisie | Largeur k post / prior | Corrélation | Méd. erreur k (post / prior seul) | Couv. 80 k | > 5 % borne k = 1 / k max | > 5 % bornes offset | Vrai u hors support |', '|---|---:|---:|---:|---:|---|---|---|---|---:|');
  for (const s of sortCells(all.filter((c) => c.cell.axis === 'performance')).sort((a, b) => a.cell.days - b.cell.days)) {
    const id = s.identifiability[0];
    if (!id) continue;
    parts.push(
      `| ${s.cell.scenario} | ${s.cell.days} j | ${pct(s.cell.coverage)} | ${f2(id.medianKWidthRatio)} | ${sg(id.medianCorrelation)} | ${id.medianAbsKError.toFixed(3)} / ${id.medianAbsKErrorPriorOnly.toFixed(3)} | ${prop(id.kCoverage80)} | ${pct(id.shareEdgeOver5.kLower)} / ${pct(id.shareEdgeOver5.kUpper)} | ${pct(id.shareEdgeOver5.offsetLow5)} / ${pct(id.shareEdgeOver5.offsetHigh5)} | ${pct(s.shareUOutsideSupport)} |`,
    );
  }

  // Axis 3
  for (const truth of ['metabolic', 'loggedUnits'] as const) {
    const label = truth === 'metabolic' ? 'maintien réel' : 'unités de saisie';
    for (const days of [28, 42]) {
      parts.push('', `## Axe 3 : robustesse au prior, ${days} jours, ${label} (couverture de saisie 85 %)`, '');
      parts.push('| Population | Scénario | Bras / prior | Méd. erreur | Biais | Couv. 80 % [IC] | Couv. 95 % [IC] | Largeur 80 | Δ couv. 80 vs A [IC] | Δ méd. erreur vs A [IC] | Ratio largeur |', '|---|---|---|---:|---:|---|---|---:|---|---|---:|');
      const cells = all.filter((c) => c.cell.days === days && c.cell.coverage === 0.85 && (c.cell.axis === 'robustness' || c.cell.axis === 'performance'));
      for (const pop of ['P10', 'P20', 'P05']) {
        for (const s of sortCells(cells.filter((c) => c.cell.population === pop))) {
          const r = s.results[truth as Truth];
          const keys = ['A', 'C-exact', ...s.priors.map((p) => `D ${p.label}`)];
          for (const k of keys) {
            const c = r[k] as Comparison;
            const v = c.vsA;
            parts.push(`| ${pop} | ${s.cell.scenario} | ${k} | ${f0(c.medianAbsErrorKcal)} | ${f0(c.meanBiasKcal)} | ${prop(c.coverage80)} | ${prop(c.coverage95)} | ${f0(c.medianWidth80Kcal)} | ${v ? delta(v.coverage80) : ''} | ${v ? delta(v.medianAbsErrorKcal, 0) : ''} | ${v ? f2(v.widthRatio) : ''} |`);
          }
        }
      }
    }
  }
  writeFileSync(`${DIR}/tables.md`, `${parts.join('\n')}\n`);
}

export default function setup(): () => void {
  return () => buildJointTables();
}
