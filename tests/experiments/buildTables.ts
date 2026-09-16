/**
 * Global teardown of the intake logging experiments (handoff prompt 26): reads every cell summary and writes
 * reports/intake-logging/tables.md (readable before/after tables, no raw dump).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { ArmComparison, ExperimentHorizon, ExperimentScenario, ExperimentSummary, PairedDelta, Proportion, Truth } from '../helpers/intakeLoggingExperiment';

const OUTPUT_DIR = 'reports/intake-logging';
const SCENARIOS: ExperimentScenario[] = ['A', 'B', 'C', 'D', 'E', 'F', 'S_on', 'S_major'];
const HORIZONS: ExperimentHorizon[] = [28, 42];
const BIASES = [0, -0.1, -0.2];
const COVERAGES = [1, 0.85, 0.7];

const f0 = (v: number) => (Object.is(Math.round(v), -0) ? '0' : Math.round(v).toString());
const f2 = (v: number) => v.toFixed(2);
const signed = (v: number, digits = 2) => `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;
const prop = (p: Proportion) => `${f2(p.value)} [${f2(p.low)}-${f2(p.high)}]`;
const delta = (d: PairedDelta, digits = 2) => `${signed(d.mean, digits)} [${signed(d.low, digits)} ; ${signed(d.high, digits)}]`;
const pct = (v: number) => `${Math.round(v * 100)} %`;

function load(scenario: ExperimentScenario, days: ExperimentHorizon): ExperimentSummary | null {
  const path = `${OUTPUT_DIR}/${scenario}-${days}.json`;
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as ExperimentSummary) : null;
}

const armLabel = (key: string) => {
  if (key === 'A') return 'A baseline';
  if (key === 'B') return 'B journal parfait';
  const [kind, b, c] = key.split('|');
  return `${kind === 'Cs' ? 'C+σ' : 'C'} biais ${pct(Number(b))}, couv. ${pct(Number(c))}`;
};

function armRow(scenario: string, key: string, r: ArmComparison): string {
  const m = r.metrics;
  const v = r.vsA;
  return `| ${scenario} | ${armLabel(key)} | ${f0(m.medianAbsErrorKcal)} | ${f0(m.meanBiasKcal)} | ${prop(m.coverage80)} | ${prop(m.coverage95)} | ${f0(m.medianWidth80Kcal)} | ${v ? delta(v.coverage80) : ''} | ${v ? delta(v.medianAbsErrorKcal, 0) : ''} | ${v ? f2(v.widthRatio) : ''} | ${pct(m.gateMetShare)} |`;
}

function mainTable(days: ExperimentHorizon, truth: Truth, keys: string[]): string {
  const lines = [
    '| Scénario | Bras | Méd. erreur | Biais | Couv. 80 % [IC 95] | Couv. 95 % [IC 95] | Largeur 80 % (méd.) | Δ couv. 80 vs A [IC 95 apparié] | Δ méd. erreur vs A [IC bootstrap] | Ratio largeur | Porte franchie |',
    '|---|---|---:|---:|---|---|---:|---|---|---:|---:|',
  ];
  for (const s of SCENARIOS) {
    const summary = load(s, days);
    if (!summary) continue;
    for (const k of keys) lines.push(armRow(s, k, summary.results[truth][k] as ArmComparison));
  }
  return lines.join('\n');
}

function gridTable(days: ExperimentHorizon, truth: Truth, kind: 'C' | 'Cs'): string {
  const lines = [
    `| Scénario | Biais | ${COVERAGES.map((c) => `couv. ${pct(c)} : couv. 80 (Δ vs A) · erreur · largeur`).join(' | ')} |`,
    `|---|---|${COVERAGES.map(() => '---').join('|')}|`,
  ];
  for (const s of SCENARIOS) {
    const summary = load(s, days);
    if (!summary) continue;
    for (const b of BIASES) {
      const cells = COVERAGES.map((c) => {
        const r = summary.results[truth][`${kind}|${b}|${c}`] as ArmComparison;
        return `${f2(r.metrics.coverage80.value)} (${signed(r.vsA?.coverage80.mean ?? 0)}) · ${f0(r.metrics.medianAbsErrorKcal)} · ${f0(r.metrics.medianWidth80Kcal)}`;
      });
      lines.push(`| ${s} | ${pct(b)} | ${cells.join(' | ')} |`);
    }
  }
  return lines.join('\n');
}

function reproductionTable(): string {
  const lines = ['| Scénario | n | Méd. erreur | Biais | Couv. 80 % | Couv. 95 % |', '|---|---:|---:|---:|---:|---:|'];
  for (const s of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
    const summary = load(s, 42);
    if (!summary) continue;
    const m = summary.reproductionReplicate0;
    lines.push(`| ${s} | ${m.n} | ${f0(m.medianAbsErrorKcal)} | ${f0(m.meanBiasKcal)} | ${f2(m.coverage80.value)} | ${f2(m.coverage95.value)} |`);
  }
  return lines.join('\n');
}

export function buildTables(): void {
  const first = load('A', 42);
  if (!first) return;
  const decisionKeys = ['A', 'B', 'C|0|1', 'C|-0.2|0.7', 'Cs|0|1', 'Cs|-0.2|0.7'];
  const parts: string[] = [
    '# Tables : benchmark journal alimentaire (prompt 26)',
    '',
    `Généré automatiquement par \`tests/experiments/buildTables.ts\`. ${first.replicates} réplications × 42 utilisateurs = n ${first.results.metabolic.A?.metrics.n} par cellule.`,
    'IC 95 : Wilson pour les couvertures ; différence appariée (même monde, même seed) pour Δ couverture ; bootstrap apparié (2 000 tirages) pour Δ erreur médiane.',
    '',
    '## Reproduction de la baseline T-04 (bras A, réplication 0, 42 jours, vérité apparente)',
    '',
    reproductionTable(),
  ];
  for (const truth of ['metabolic', 'apparent'] as const) {
    const truthLabel = truth === 'metabolic' ? 'vérité métabolique (maintien réel, moyenne de fenêtre)' : 'vérité apparente propre au bras (maintien relatif à l’apport que l’estimateur suppose)';
    for (const days of HORIZONS) {
      parts.push('', `## ${days} jours, ${truthLabel}`, '', '### Bras décisionnels', '', mainTable(days, truth, decisionKeys));
      parts.push('', '### Grille complète du bras C (σ = plancher structurel seul)', '', gridTable(days, truth, 'C'));
      parts.push('', '### Grille complète du bras C+σ (sensibilité, σ observable, qualité déclarée « élevée »)', '', gridTable(days, truth, 'Cs'));
    }
  }
  writeFileSync(`${OUTPUT_DIR}/tables.md`, `${parts.join('\n')}\n`);
}

export default function setup(): () => void {
  return () => buildTables();
}
