/**
 * UX pass v2 (s10 to s19): "Pourquoi ce résultat ?" view model, the scientific details toggle,
 * the first-recalibration gate progress and the Analyse / Plan redundancy removal.
 */
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BottomNav } from '@/components/BottomNav';
import { ResultExplanationView } from '@/components/ResultExplanationView';
import { addWeight, completeOnboarding, previewInitialPlan, setAdherence } from '@/domain/engine';
import { explainCurrentPlan, explainPreview } from '@/domain/explain';
import type { ResultExplanation } from '@/domain/explain';
import { gateProgress } from '@/domain/views';
import type { WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { loadStore, MemoryStorage, saveStore } from '@/persistence/storage';
import { gateCriterionValue } from '@/screens/Tracking';
import { evaluateGate } from '@/science/calibration';
import { addDays } from '@/science/dates';
import type { HistoricalIntakeEvidence, UserProfile } from '@/science/types';
import { makeProfile } from '../helpers/profiles';

const TODAY = '2026-09-14';
const NOW = `${TODAY}T08:00:00.000Z`;

/** Practical case of the pass (s14), steps left at the onboarding default. */
const CASE_PROFILE: UserProfile = makeProfile({
  sexForEquation: 'female',
  ageYears: 24,
  heightCm: 155,
  currentWeightKg: 68,
  averageSteps7d: 7000,
  walkingPace: 'normal',
  occupation: 'seated',
  activities: [{ type: 'strength', sessionsPerWeek: 4, durationMin: 55, intensity: 'moderate' }],
  goal: 'loss',
  targetWeightKg: 62,
  weeklyRateTarget: 0.01,
});
const CASE_EVIDENCE: HistoricalIntakeEvidence = { evidenceVersion: 1, recordedOn: TODAY, averageCaloriesKcal: 1450, durationDays: 14, startWeightKg: 68, endWeightKg: 68, trackingQuality: 'high', activityComparable: true };

function caseExplanation(): ResultExplanation {
  const x = explainPreview(CASE_PROFILE, TODAY, CASE_EVIDENCE);
  if (!x) throw new Error('explanation');
  return x;
}

describe('result explanation view model (s11, s13)', () => {
  it('exposes the real calculation path of the practical case', () => {
    const x = caseExplanation();
    const preview = previewInitialPlan(CASE_PROFILE, TODAY, CASE_EVIDENCE);
    if (!preview.ok) throw new Error('preview');
    // REE route and value
    expect(x.ree.method).toBe(preview.assessment.ree.method);
    expect(x.ree.reason).toBe('general_adult');
    expect(x.ree.kcal).toBe(preview.assessment.ree.reeKcalDay);
    // PAL and population TDEE
    expect(x.population.palCategory).toBe(preview.assessment.palCategory);
    expect(x.activity.provisionalPal).toBe(preview.assessment.pal.provisionalPal);
    expect(x.population.tdeeKcal).toBe(preview.assessment.populationTdeeKcal);
    expect(x.population.interval80[0]).toBeLessThan(x.population.tdeeKcal);
    // History alone, then the fused posterior
    expect(x.history?.status).toBe('used');
    expect(x.history?.historyOnly).not.toBeNull();
    const h = x.history;
    if (!h?.historyOnly || !preview.warmStart?.historyOnly) throw new Error('history');
    expect(h.historyOnly.medianKcal).toBeCloseTo(preview.warmStart.populationTdeeAtStartKcal + preview.warmStart.historyOnly.medianKcal, 9);
    expect(h.historyOnly.interval80[0]).toBeLessThan(h.historyOnly.medianKcal);
    expect(h.fusedMedianKcal).toBeCloseTo(preview.assessment.populationTdeeKcal + preview.warmStart.posterior.medianKcal, 9);
    expect(x.maintenance.source).toBe('warm_start');
    expect(x.maintenance.kcal).toBe(preview.plan.maintenanceKcal);
    // Hall baseline, speeds, limiting rule, final calories
    expect(x.hall.baselineIntakeKcal).toBeGreaterThan(0);
    expect(x.goal.requestedWeeklyRate).toBe(0.01);
    expect(x.goal.appliedWeeklyRate).toBe(preview.goalPlan.weeklyRateTarget);
    expect(x.goal.rateAdjusted).toBe(preview.goalPlan.rateAdjusted);
    expect(x.goal.limitingRule).toBe(preview.goalPlan.rateAdjusted ? (preview.goalPlan.rejections[0]?.reason ?? null) : null);
    expect(x.prescription.calorieTargetKcal).toBe(preview.plan.calorieTarget);
    expect(x.prescription.stepTarget).toBe(preview.plan.stepTarget);
    expect(x.safety.hardFloorKcal).toBe(preview.goalPlan.hardFloorKcal);
    expect(x.solve?.calorieTargetKcal).toBe(preview.goalPlan.solve?.calorieTargetKcal);
  });

  it('without history: population source and no history block', () => {
    const x = explainPreview(CASE_PROFILE, TODAY, null);
    expect(x?.history).toBeNull();
    expect(x?.maintenance.source).toBe('population');
  });

  it('rebuilding the stored plan reproduces its calories', () => {
    const r = completeOnboarding(emptyStore(), CASE_PROFILE, TODAY, NOW, CASE_EVIDENCE);
    if (!r.ok) throw new Error(r.reason);
    const x = explainCurrentPlan(r.store, TODAY);
    expect(x?.matchesStoredPlan).toBe(true);
    expect(x?.prescription.calorieTargetKcal).toBeCloseTo(r.store.plan?.calorieTarget ?? 0, 6);
    expect(x?.maintenance.source).toBe('warm_start');
  });

  it('no science is recomputed in the explanation components', () => {
    const src = readFileSync('src/components/ResultExplanationView.tsx', 'utf8');
    expect(src).not.toMatch(/from '@\/science/);
    expect(src).not.toMatch(/from '@\/domain\/engine'/);
    expect(src).toMatch(/import type \{ ResultExplanation \} from '@\/domain\/explain'/);
  });
});

describe('"Détails scientifiques" toggle (s12, s16)', () => {
  const units = 'metric' as const;

  it('OFF: digest only, advanced values hidden', () => {
    const html = renderToStaticMarkup(createElement(ResultExplanationView, { x: caseExplanation(), units, details: false })).replaceAll(String.fromCharCode(0x202f), ' ');
    for (const title of ['Ton maintien estimé', 'Estimation théorique', 'Ton historique', 'Maintien retenu', 'Ce qui compte dans ce résultat', 'Métabolisme de repos', 'Activité prise en compte', 'Ton objectif', 'Prescription', 'Ce qui fera bouger ce chiffre']) expect(html).toContain(title);
    // Removed in P3: separate "Ce que ton historique suggère" section and the non-answer "chacun pesé selon sa précision".
    expect(html).not.toContain('Ce que ton historique suggère');
    expect(html).not.toContain('chacun pesé selon sa précision');
    expect(html).not.toContain('aria-label="Détails scientifiques"');
    expect(html).not.toContain('E. Fusion et confiance');
    expect(html).toContain('Active « Détails scientifiques »');
  });

  it('ON: technical values visible in six collapsible groups', () => {
    const html = renderToStaticMarkup(createElement(ResultExplanationView, { x: caseExplanation(), units, details: true }));
    expect(html).toContain('aria-label="Détails scientifiques"');
    for (const k of ['A. Intégrité', 'B. Métabolisme et activité', 'C. Prior populationnel', 'D. Évidence historique', 'E. Fusion et confiance', 'F. Plan', 'Route du REE', 'NASEM', 'Prior 80 %', 'Historique seul, support exact (source de vérité)', 'Offset linéarisé (approximation diagnostique', 'Racine exacte', 'Maintien retenu (posterior)', 'Vitesse demandée / appliquée', 'Plancher calorique', 'Faisabilité des macros', 'Disponibilité énergétique', 'Avertissements du plan', 'Signaux actifs', 'Calories finales (exactes)']) expect(html).toContain(k);
    expect((html.match(/<details class="why-group"/g) ?? []).length).toBe(6);
    // Merged or removed lines (P3 s3).
    for (const k of ['Hall baseline intake', 'Posterior fused', 'Garde-fou IMC (max)', 'Exercice après chevauchement']) expect(html).not.toContain(k);
    expect(html).not.toContain('Active « Détails scientifiques »');
  });

  it('the preference is persisted across a reload', () => {
    const storage = new MemoryStorage();
    const s: WheightyStore = { ...emptyStore(), preferences: { ...emptyStore().preferences, showScientificDetails: true } };
    saveStore(storage, s);
    expect(loadStore(storage, NOW).store.preferences.showScientificDetails).toBe(true);
    saveStore(storage, { ...s, preferences: { ...s.preferences, showScientificDetails: false } });
    expect(loadStore(storage, NOW).store.preferences.showScientificDetails).toBe(false);
  });

  it('the Why sheet reads the stored preference', () => {
    const src = readFileSync('src/screens/WhySheet.tsx', 'utf8');
    expect(src).toContain('store.preferences.showScientificDetails');
    expect(src).toContain('details={details}');
    expect(src).not.toContain('Comment c’est calculé');
  });
});

describe('first recalibration progress (s17)', () => {
  const DAY0 = '2026-06-01';
  const iso = (d: string) => `${d}T07:30:00.000Z`;

  function onboarded(): WheightyStore {
    const r = completeOnboarding(emptyStore(), makeProfile({ currentWeightKg: 80, goal: 'loss', targetWeightKg: 74, weeklyRateTarget: 0.005 }), DAY0, iso(DAY0));
    if (!r.ok) throw new Error(r.reason);
    return r.store;
  }

  function expectConsistent(s: WheightyStore) {
    const gate = evaluateGate(s.weights, s.dailyLogs);
    const p = gateProgress(null, s);
    expect(p.criteria.map((c) => c.key)).toEqual(['weighIns', 'span', 'cleanWeighIns', 'adherence']);
    expect(p.criteria.map((c) => c.met)).toEqual([gate.criteria.enoughWeighIns, gate.criteria.enoughSpan, gate.criteria.enoughCleanWeighIns, gate.criteria.enoughAdherenceInfo]);
    expect(p.met).toBe(gate.met);
    expect(p.met).toBe(p.criteria.every((c) => c.met));
    expect(p.metCount).toBe(p.criteria.filter((c) => c.met).length);
    for (const c of p.criteria) {
      expect(c.fill).toBeGreaterThanOrEqual(0);
      expect(c.fill).toBeLessThanOrEqual(1);
      if (c.met) expect(c.fill).toBe(1);
    }
    return p;
  }

  it('follows every real gate criterion, never a single arbitrary bar', () => {
    let s = onboarded();
    expect(expectConsistent(s).metCount).toBeLessThan(4);
    // Enough weigh-ins and span, but no noted days: not met because of adherence information only.
    for (let d = 3; d <= 18; d += 3) s = addWeight(s, { date: addDays(DAY0, d), weightKg: 80 - 0.05 * d }, iso(addDays(DAY0, d)));
    const noAdherence = expectConsistent(s);
    expect(noAdherence.criteria.find((c) => c.key === 'weighIns')?.met).toBe(true);
    expect(noAdherence.criteria.find((c) => c.key === 'adherence')?.met).toBe(false);
    expect(noAdherence.met).toBe(false);
    for (let d = 0; d <= 18; d++) s = setAdherence(s, addDays(DAY0, d), 'on_plan');
    expect(expectConsistent(s).met).toBe(true);
    // Major deviations remove clean weigh-ins even with the counts reached.
    for (let d = 0; d <= 18; d++) s = setAdherence(s, addDays(DAY0, d), 'major_deviation');
    expectConsistent(s);
  });

  it('criterion values are counts, days and the share of noted days', () => {
    expect(gateCriterionValue({ key: 'weighIns', have: 3, need: 5, met: false, fill: 0.6 })).toBe('3 / 5');
    expect(gateCriterionValue({ key: 'span', have: 20, need: 14, met: true, fill: 1 })).toBe('14 / 14 jours');
    expect(gateCriterionValue({ key: 'adherence', have: 0.25, need: 0.5, met: false, fill: 0.5 })).toBe('25 % / 50 %');
  });
});

describe('Analyse and Plan redundancy (s17, s18)', () => {
  const tracking = readFileSync('src/screens/Tracking.tsx', 'utf8');
  const analyse = tracking.slice(tracking.indexOf('export function AnalyseScreen'), tracking.indexOf('export function RecalibrationScreen') > 0 ? tracking.indexOf('export function RecalibrationScreen') : undefined);
  const plan = readFileSync('src/screens/Plan.tsx', 'utf8');
  const app = readFileSync('src/app/App.tsx', 'utf8');

  it('Analyse has no "Ajouter une pesée" button and shows the gate criteria', () => {
    expect(analyse.length).toBeGreaterThan(0);
    expect(analyse).not.toContain('Ajouter une pesée');
    expect(analyse).toContain('gate.criteria.map');
  });

  it('Plan has no detailed projection block and the projection screen is gone', () => {
    expect(plan).not.toContain('WeightChart');
    expect(plan).not.toMatch(/go\('projection'\)/);
    expect(app).not.toContain('projection');
    expect(readFileSync('src/app/navigation.tsx', 'utf8')).not.toContain("'projection'");
  });

  it('navigation to Suivi and Analyse still works from the tab bar', () => {
    const html = renderToStaticMarkup(createElement(BottomNav, { active: 'plan', onNavigate: () => undefined }));
    for (const label of ['Plan', 'Suivi', 'Analyse']) expect(html).toContain(`<span>${label}</span>`);
    expect(app).toMatch(/case 'suivi':\s*content = <SuiviScreen \/>/);
    expect(app).toMatch(/case 'analyse':\s*content = <AnalyseScreen \/>/);
  });
});
