/**
 * "Pourquoi ce résultat ?" redesign (P3, IMPLEMENTATION_NOTES D-30): digest blocks (comparison, weight of the sources,
 * goal, recalibration gate), grouped scientific details, distances to rules, stored-plan integrity.
 * No scientific value changes: the panel only reads the domain view model.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { sourcesSentence, WARM_START_TEXT, WHY_TEXT } from '@/app/copy';
import { ResultExplanationView } from '@/components/ResultExplanationView';
import { completeOnboarding, warmStartFor } from '@/domain/engine';
import { explainCurrentPlan, explainPreview } from '@/domain/explain';
import type { ResultExplanation } from '@/domain/explain';
import { formatApproximateFraction } from '@/domain/format';
import { emptyStore } from '@/persistence/schema';
import { evaluateGate } from '@/science/calibration';
import { SCIENTIFIC_MODEL_VERSION } from '@/science/constants';
import type { HistoricalIntakeEvidence, UserProfile } from '@/science/types';
import { makeProfile } from '../helpers/profiles';

const TODAY = '2026-09-14';
const NOW = `${TODAY}T08:00:00.000Z`;
const history = (kcal: number, days = 14, start = 68, end = 68): HistoricalIntakeEvidence => ({ evidenceVersion: 1, recordedOn: TODAY, averageCaloriesKcal: kcal, durationDays: days, startWeightKg: start, endWeightKg: end, trackingQuality: 'high', activityComparable: true });
const CASE_R: UserProfile = makeProfile({ sexForEquation: 'female', ageYears: 24, heightCm: 155, currentWeightKg: 68, averageSteps7d: 9400, walkingPace: 'normal', occupation: 'seated', activities: [{ type: 'strength', sessionsPerWeek: 4, durationMin: 55, intensity: 'moderate' }], goal: 'loss', targetWeightKg: 60, weeklyRateTarget: 0.01 });
const CASE_S: UserProfile = { ...CASE_R, activities: [{ type: 'strength', sessionsPerWeek: 5, durationMin: 55, intensity: 'moderate' }], targetWeightKg: 62 };
const ABERRANT_GAIN: UserProfile = makeProfile({ sexForEquation: 'female', ageYears: 30, heightCm: 165, currentWeightKg: 75, averageSteps7d: 6000, goal: 'loss', targetWeightKg: 65, weeklyRateTarget: 0.01 });
const LEGIT: UserProfile = makeProfile({ sexForEquation: 'male', ageYears: 40, heightCm: 178, currentWeightKg: 92, goal: 'loss', targetWeightKg: 84, weeklyRateTarget: 0.005 });

const explain = (p: UserProfile, e: HistoricalIntakeEvidence | null): ResultExplanation => {
  const x = explainPreview(p, TODAY, e);
  if (!x) throw new Error('explanation');
  return x;
};
const render = (x: ResultExplanation, details: boolean, units: 'metric' | 'imperial' = 'metric') => renderToStaticMarkup(createElement(ResultExplanationView, { x, units, details }));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const ACCUSATION = /sous-déclar|sous-estim|mens|trich|faux|fausse|mauvais|erreur de ta part|tu t’es trompé|tu t'es trompé|mal déclar|mal noté/i;

describe('digest: weight of each source (validated copy: bar and fraction)', () => {
  it('case R: history about 18 %, about one sixth, placed right after the comparison', () => {
    const x = explain(CASE_R, history(1450));
    expect(x.sources?.historyWeight).toBeCloseTo(0.1787, 3);
    expect((x.sources?.historyWeight ?? 0) + (x.sources?.theoreticalWeight ?? 0)).toBeCloseTo(1, 12);
    expect(formatApproximateFraction(x.sources?.historyWeight ?? 0)).toBe('un sixième');
    const t = text(render(x, false));
    expect(t).toContain('Estimation théorique 82 %');
    expect(t).toContain('Ton historique 18 %');
    expect(t).toContain(sourcesSentence('un sixième'));
    expect(t.indexOf(WHY_TEXT.sourcesTitle)).toBeLessThan(t.indexOf('Métabolisme de repos'));
    expect(t.indexOf(WHY_TEXT.comparisonTitle)).toBeLessThan(t.indexOf(WHY_TEXT.sourcesTitle));
  });

  it('the weight equals 1 - fused variance / prior variance and is absent without a used history', () => {
    const w = warmStartFor(CASE_R, history(1450), TODAY);
    const x = explain(CASE_R, history(1450));
    expect(x.sources?.historyWeight).toBeLessThan(1 - (w.posterior.sdKcal / w.priorSigmaKcal) ** 2 + 1e-3);
    expect(explain(CASE_R, null).sources).toBeNull();
    expect(explain(CASE_R, history(1450, 5)).sources).toBeNull();
  });
});

describe('digest: goal block and removed "pourquoi pas" section', () => {
  it('the "pourquoi pas" section is no longer shown', () => {
    const t = text(render(explain(CASE_R, history(1450)), false));
    expect(t).not.toContain('Pourquoi pas');
    expect(t).not.toContain('deux pesées ne suffisent pas');
  });

  it('rate applied as requested: a single applied rate, no requested / applied split and no callout', () => {
    const x = explain(CASE_R, history(1450));
    expect(x.goal.rateAdjusted).toBe(false);
    const t = text(render(x, false));
    expect(t).toContain('Ton objectif : perte de poids');
    expect(t).toContain('1,0 % par semaine');
    expect(t).not.toContain('Tu avais demandé');
    expect(t).not.toMatch(/Demandé|Appliqué/);
  });

  it('rate adjusted by a guardrail: an info callout gives the requested rate and the limiting rule', () => {
    const x = explain(ABERRANT_GAIN, history(800, 14, 72, 75));
    expect(x.goal.rateAdjusted).toBe(true);
    const html = render(x, false);
    const callout = html.slice(html.lastIndexOf('<div class="why-info">'));
    expect(text(callout)).toMatch(/^ Tu avais demandé 1,0\s%\spar semaine\. Limité pour respecter ton plancher calorique\./);
  });

  it('never suggests that the user was wrong or misreported (lexical test)', () => {
    for (const s of [sourcesSentence('un sixième'), ...Object.values(WHY_TEXT)]) expect(s).not.toMatch(ACCUSATION);
    for (const [p, e] of [[CASE_R, history(1450)], [LEGIT, history(1400, 28, 90, 92)], [ABERRANT_GAIN, history(800, 14, 72, 75)]] as const) expect(text(render(explain(p, e), false))).not.toMatch(ACCUSATION);
  });
});

describe('digest: estimand and PAL boundary (D-31, model 1.3.0)', () => {
  const PROFILES = [CASE_R, CASE_S, ABERRANT_GAIN, LEGIT];

  it('always states what the maintenance is: apparent, never a measured expenditure or a metabolism', () => {
    expect(WHY_TEXT.apparentMaintenance).not.toMatch(/(c’est|est) (ta|une|ton) (dépense réelle|métabolisme|dépense mesurée)/i);
    for (const p of PROFILES) for (const e of [null, history(1450)]) expect(text(render(explain(p, e), false))).toContain(WHY_TEXT.apparentMaintenance);
  });

  it('shows the PAL boundary note exactly when the provisional PAL is near a category boundary', () => {
    const flags = PROFILES.map((p) => explain(p, null).activity.palBoundaryFlag);
    expect(flags).toContain(true);
    for (const p of PROFILES) {
      const x = explain(p, null);
      expect(text(render(x, false)).includes(WHY_TEXT.palBoundary)).toBe(x.activity.palBoundaryFlag);
    }
  });
});

describe('digest: strict ban on the incoherent flag and excluded points', () => {
  it('an incoherent history shows the calibrated conflict message, never the incoherent flag, excluded points or technical wording', () => {
    const x = explain(ABERRANT_GAIN, history(800, 14, 72, 75));
    expect(x.history?.incoherent).toBe(true);
    expect(x.history?.conflict).toBe(true);
    const digest = text(render(x, false));
    expect(digest).toContain(WARM_START_TEXT.conflict);
    expect(digest).not.toMatch(/incoh|exclu|linéaris|racine|domaine|B2|support/i);
    // The details do show it, with its distance to the trigger and without numerical effect.
    const details = text(render(x, true));
    expect(details).toMatch(/Incohérent oui, \d+ kcal\/j au-delà du déclenchement ; signal sans effet numérique depuis 1\.2\.0/);
  });
});

describe('digest: comparison and rounding', () => {
  it('case R: theoretical, history and retained on one scale, interval bounds rounded to 50 kcal', () => {
    const t = text(render(explain(CASE_R, history(1450)), false));
    // text() normalises every space, the narrow no-break thousands separator included.
    const bounds = [...t.matchAll(/Fourchette 80 % : (\d{1,3}(?: \d{3})?) à (\d{1,3}(?: \d{3})?) kcal/g)].map((m) => [m[1], m[2]].map((s) => Number((s as string).replace(/ /g, ''))));
    expect(bounds).toHaveLength(3);
    for (const [lo, hi] of bounds) {
      expect((lo as number) % 50).toBe(0);
      expect((hi as number) % 50).toBe(0);
    }
    for (const label of ['Estimation théorique 2 260 kcal / jour', 'Ton historique 1 550 kcal / jour', 'Maintien retenu 2 070 kcal / jour']) expect(t).toContain(label);
  });

  it('without history: only the theoretical estimate, with its source line', () => {
    const t = text(render(explain(CASE_R, null), false));
    expect(t).not.toContain('Ton historique ');
    expect(t).toContain('Estimation théorique seule, en attendant tes pesées.');
  });
});

describe('digest: what will move this number (real gate criteria)', () => {
  it('preview: no weigh-in yet; stored plan: the onboarding weigh-in counts, exactly as evaluateGate', () => {
    const x = explain(CASE_R, history(1450));
    expect(x.gate.criteria.map((c) => c.have)).toEqual([0, 0, 0, 0]);
    const done = completeOnboarding(emptyStore(), CASE_R, TODAY, NOW, history(1450));
    if (!done.ok) throw new Error(done.reason);
    const y = explainCurrentPlan(done.store, TODAY);
    const gate = evaluateGate(done.store.weights, done.store.dailyLogs);
    expect(y?.gate.criteria.map((c) => c.met)).toEqual([gate.criteria.enoughWeighIns, gate.criteria.enoughSpan, gate.criteria.enoughCleanWeighIns, gate.criteria.enoughAdherenceInfo]);
    expect(y?.gate.criteria[0]?.have).toBe(1);
    const t = text(render(x, false));
    expect(t).toContain('Ce qui fera bouger ce chiffre');
    expect(t).toContain('Confiance actuelle Faible');
    for (const label of ['Pesées 0 / 5', 'Durée couverte 0 / 14 jours', 'Pesées hors écarts importants 0 / 4', 'Journées notées 0 % / 50 %']) expect(t).toContain(label);
  });
});

describe('details: distances to rules', () => {
  it('PAL distance to the nearest boundary, in PAL and in NASEM kcal (case R: 0.016, about 139 kcal)', () => {
    const r = explain(CASE_R, history(1450));
    const s = explain(CASE_S, history(1450));
    expect(r.activity.palBoundary.boundary).toBe(1.68);
    expect(r.activity.palBoundary.distancePal).toBeCloseTo(0.0163, 4);
    expect(r.activity.palBoundary.adjacentCategory).toBe('active');
    // Same anthropometrics: crossing the boundary gives exactly case S's NASEM.
    expect(r.activity.palBoundary.nasemDeltaKcal).toBeCloseTo(s.population.tdeeKcal - r.population.tdeeKcal, 9);
    expect(text(render(r, true))).toContain('Frontière la plus proche 1,68 : +0,016 PAL, soit +139 kcal/j de NASEM (active)');
  });

  it('confidence: the exact criterion not met, consistent with the engine rule', () => {
    const r = explain(CASE_R, history(1450));
    const legit = explain(LEGIT, history(1400, 28, 90, 92));
    for (const x of [r, legit]) {
      const c = x.confidenceDetail;
      if (c.kind !== 'warm_start') throw new Error('warm start');
      expect(c.mediumReached).toBe(x.maintenance.confidence === 'medium');
      expect(c.ratio <= c.maxRatio).toBe(c.mediumReached);
    }
    expect(text(render(r, true))).toMatch(/« moyenne » exige au plus 75 % \(533 kcal\/j\) : non atteint/);
    expect(explain(CASE_R, null).confidenceDetail.kind).toBe('population');
  });

  it('conflict z with its margin to the threshold, active signals and plan warnings kept separate', () => {
    const r = text(render(explain(CASE_R, history(1450)), true));
    expect(r).toMatch(/Conflit \(z prédictif\) non, z −1,45, seuil ±2 \(marge 0,55\)/);
    expect(r).toContain('Avertissements du plan aucun');
    expect(r).toContain('Signaux actifs PAL proche d’une frontière de catégorie, confiance faible');
    const aberrant = explain(ABERRANT_GAIN, history(800, 14, 72, 75));
    expect(aberrant.signals).toEqual(expect.arrayContaining(['incoherent', 'conflict', 'rate_adjusted', 'low_confidence']));
  });

  it('exercise line: no overlap line for strength only, overlap lines for a step-dominant activity', () => {
    const strength = text(render(explain(CASE_R, history(1450)), true));
    expect(strength).toContain('Exercice structuré (net) 94 kcal/j');
    expect(strength).not.toContain('Chevauchement retiré');
    const runner = explain({ ...CASE_R, activities: [{ type: 'running', sessionsPerWeek: 3, durationMin: 40, intensity: 'moderate' }] }, null);
    expect(runner.activity.anyStepDominant).toBe(true);
    expect(runner.activity.overlapRemovedKcal).toBeGreaterThan(0);
    expect(text(render(runner, true))).toContain('Chevauchement retiré (pas déjà comptés)');
  });
});

describe('details toggle is never dead', () => {
  it('the digest is identical in both modes and the details add the six groups', () => {
    const x = explain(CASE_S, history(1450));
    const off = render(x, false);
    const on = render(x, true);
    const digestOff = off.slice(0, off.lastIndexOf('<p class="small"'));
    expect(on.startsWith(digestOff)).toBe(true);
    expect(on.length).toBeGreaterThan(off.length + 2000);
    expect(on).toContain('<details class="why-group" data-group="history" open=""');
  });
});

describe('stored plan integrity (matchesStoredPlan, D-30)', () => {
  it('a fresh store matches; another model version is flagged even when the calories match', () => {
    const done = completeOnboarding(emptyStore(), CASE_R, TODAY, NOW, history(1450));
    if (!done.ok) throw new Error(done.reason);
    const fresh = explainCurrentPlan(done.store, TODAY);
    expect(fresh?.matchesStoredPlan).toBe(true);
    expect(fresh?.integrity).toMatchObject({ versionMatches: true, caloriesMatch: true, offset: { matches: true, diffKcal: 0 } });
    const plan = done.store.plan;
    if (!plan) throw new Error('plan');
    const older = explainCurrentPlan({ ...done.store, plan: { ...plan, scientificModelVersion: '1.1.0' } }, TODAY);
    expect(older?.matchesStoredPlan).toBe(false);
    expect(older?.integrity?.versionMatches).toBe(false);
    expect(older?.integrity?.caloriesMatch).toBe(true);
    expect(text(render(older as ResultExplanation, true))).toContain('Écart avec le plan enregistré');
    expect(text(render(fresh as ResultExplanation, true))).toContain('Recalcul conforme au plan enregistré');
    expect(SCIENTIFIC_MODEL_VERSION).toBe('1.3.0');
  });
});
