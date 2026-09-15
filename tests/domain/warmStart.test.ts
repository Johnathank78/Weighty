import { describe, expect, it } from 'vitest';
import { WARM_START_TEXT } from '@/app/copy';
import { addWeight, applyRecalibration, calibrationInputFromStore, completeOnboarding, computeCalibrationState, ensureDailyLogs, latestAppliedSnapshot, previewInitialPlan, setActualSteps, setAdherence, storedWarmStart, warmStartFor } from '@/domain/engine';
import { analysisView, appliedWeightCalibrations } from '@/domain/views';
import { emptyStore } from '@/persistence/schema';
import { MemoryStorage, loadStore, saveStore } from '@/persistence/storage';
import { exportStore, parseImport } from '@/persistence/exportImport';
import { assessBaseline } from '@/science/assessment';
import { fitCalibration } from '@/science/calibration';
import { addDays } from '@/science/dates';
import { validateHistoricalEvidence } from '@/science/warmStart';
import type { HistoricalIntakeEvidence, UserProfile } from '@/science/types';
import { makeHistory } from '../helpers/history';
import { makeProfile } from '../helpers/profiles';
import { createRng } from '../helpers/random';

const TODAY = '2026-09-14';
const iso = (date: string) => `${date}T08:00:00.000Z`;

const woman = makeProfile({ sexForEquation: 'female', ageYears: 32, heightCm: 166, currentWeightKg: 70, goal: 'loss', targetWeightKg: 64, weeklyRateTarget: 0.005 });
const man = makeProfile({ sexForEquation: 'male', ageYears: 32, heightCm: 180, currentWeightKg: 85, goal: 'loss', targetWeightKg: 79, weeklyRateTarget: 0.005 });
const nasemAt = (p: UserProfile, w: number) => assessBaseline(p, TODAY, { weightKg: w }).populationTdeeKcal;
const width = (i: readonly [number, number]) => i[1] - i[0];

describe('warm start from historical intake (D-23)', () => {
  it('without history: nothing changes (population prior, low confidence)', () => {
    const preview = previewInitialPlan(woman, TODAY, null);
    expect(preview.ok).toBe(true);
    expect(preview.warmStart).toBeNull();
    expect(preview.confidence).toBe('low');
    if (!preview.ok) return;
    expect(preview.plan.maintenanceKcal).toBe(preview.assessment.populationTdeeKcal);
    expect(preview.plan.maintenanceInterval80).toEqual(preview.assessment.interval80);
  });

  it('under 7 days: evidence kept but not used, the population prior is unchanged', () => {
    const { profile, evidence } = makeHistory(woman, TODAY, { startWeightKg: 71, trueOffsetKcal: 250, intakeKcal: nasemAt(woman, 71) - 400, days: 5, quality: 'high' });
    const withHistory = previewInitialPlan(profile, TODAY, evidence);
    const without = previewInitialPlan(profile, TODAY, null);
    expect(withHistory.warmStart?.status).toBe('insufficient_duration');
    expect(withHistory.confidence).toBe('low');
    expect(withHistory.ok && without.ok && withHistory.plan.maintenanceKcal).toBe(without.ok ? without.plan.maintenanceKcal : NaN);
    const done = completeOnboarding(emptyStore(), profile, TODAY, iso(TODAY), evidence);
    expect(done.ok && done.store.historicalEvidence).toEqual(evidence);
    expect(done.ok && done.store.calibrationSnapshots).toEqual([]);
  });

  it('14 days, low quality: used as weak evidence only (small shift, interval barely narrower, confidence stays low)', () => {
    const { profile, evidence } = makeHistory(woman, TODAY, { startWeightKg: 71, trueOffsetKcal: 250, intakeKcal: nasemAt(woman, 71) - 400, days: 14, quality: 'low' });
    const r = warmStartFor(profile, evidence, TODAY);
    expect(r.status).toBe('used');
    expect(r.likelihood.historyOnlySdKcal as number).toBeGreaterThan(600);
    expect(Math.abs(r.posterior.medianKcal)).toBeLessThan(80);
    const preview = previewInitialPlan(profile, TODAY, evidence);
    expect(preview.confidence).toBe('low');
    if (!preview.ok) throw new Error('plan');
    expect(width(preview.plan.maintenanceInterval80)).toBeLessThan(width(preview.assessment.interval80));
    expect(width(preview.plan.maintenanceInterval80)).toBeGreaterThan(0.85 * width(preview.assessment.interval80));
  });

  it('28 days, high quality: personalised maintenance, narrower range, better confidence when the gain is large enough', () => {
    const { profile, evidence } = makeHistory(man, TODAY, { startWeightKg: 86, trueOffsetKcal: 250, intakeKcal: nasemAt(man, 86) - 400, days: 28, quality: 'high' });
    const r = warmStartFor(profile, evidence, TODAY);
    expect(r.status).toBe('used');
    expect(r.likelihood.historyOnlyOffsetKcal as number).toBeGreaterThan(150);
    expect(r.likelihood.historyOnlyOffsetKcal as number).toBeLessThan(350);
    // Pulled towards the history but still shrunk towards the population prior: never average intake = maintenance.
    expect(r.posterior.medianKcal).toBeGreaterThan(60);
    expect(r.posterior.medianKcal).toBeLessThan(r.likelihood.historyOnlyOffsetKcal as number);
    const preview = previewInitialPlan(profile, TODAY, evidence);
    if (!preview.ok) throw new Error('plan');
    expect(preview.confidence).toBe('medium');
    expect(preview.plan.maintenanceKcal).toBeCloseTo(preview.assessment.populationTdeeKcal + r.posterior.medianKcal, 6);
    expect(preview.plan.maintenanceKcal).not.toBeCloseTo(evidence.averageCaloriesKcal, -2);
    expect(width(preview.plan.maintenanceInterval80)).toBeLessThan(0.75 * width(preview.assessment.interval80));
    expect(r.conflict).toBe(false);
  });

  it('history close to the prior: estimate stays near the population value, no conflict', () => {
    const { profile, evidence } = makeHistory(woman, TODAY, { startWeightKg: 71, trueOffsetKcal: 0, intakeKcal: nasemAt(woman, 71) - 400, days: 28, quality: 'high' });
    const r = warmStartFor(profile, evidence, TODAY);
    expect(Math.abs(r.posterior.medianKcal)).toBeLessThan(40);
    expect(r.conflict).toBe(false);
  });

  it('history very far from the prior: conflict surfaced with a neutral message, data still given weight', () => {
    const { profile, evidence } = makeHistory(woman, TODAY, { startWeightKg: 69, trueOffsetKcal: -1000, intakeKcal: nasemAt(woman, 69) - 400, days: 28, quality: 'high' });
    const r = warmStartFor(profile, evidence, TODAY);
    expect(r.status).toBe('used');
    expect(r.likelihood.incoherent).toBe(false);
    expect(r.conflict).toBe(true);
    expect(r.posterior.medianKcal).toBeLessThan(-350);
    expect(WARM_START_TEXT.conflict).toBe('Tes données récentes diffèrent de notre estimation théorique. Wheighty leur donne du poids, mais continuera à vérifier cette estimation avec tes prochaines pesées.');
    for (const text of Object.values(WARM_START_TEXT)) expect(text).not.toMatch(/sous-déclar|sous-estim|mens|tricn|faux|mauvais|erreur de ta part/i);
  });

  it('declared intake incompatible with the weight change: flagged incoherent (exact rule), conflict shown, no down-weighting (D-29)', () => {
    const evidence: HistoricalIntakeEvidence = { evidenceVersion: 1, recordedOn: TODAY, averageCaloriesKcal: 1400, durationDays: 28, startWeightKg: 90, endWeightKg: 92, trackingQuality: 'high', activityComparable: true };
    const profile = makeProfile({ sexForEquation: 'male', ageYears: 40, heightCm: 178, currentWeightKg: 92, goal: 'loss', targetWeightKg: 84, weeklyRateTarget: 0.005 });
    const r = warmStartFor(profile, evidence, TODAY);
    expect(r.likelihood.historyOnlyOffsetKcal as number).toBeLessThan(-1200);
    expect(r.likelihood.exactRoot?.rootOffsetKcal as number).toBeLessThan(-1200);
    expect(r.likelihood.incoherent).toBe(true);
    // The legitimate guard of D-23 still holds without the former x2: the conflict is far beyond the threshold.
    expect(r.conflict).toBe(true);
    expect(r.conflictZ as number).toBeLessThan(-3);
    // Measured consequence, reported for arbitration (model 1.1.0: posterior -436, confidence low, 1 869 kcal/day):
    // the history is no longer divided in weight, the posterior moves to about -983 and the unchanged relative
    // confidence rule of D-23 now reports "medium".
    expect(r.posterior.medianKcal).toBeGreaterThan(-1200);
    expect(r.posterior.medianKcal).toBeLessThan(-900);
    expect(r.confidence).toBe('medium');
    const preview = previewInitialPlan(profile, TODAY, evidence);
    expect(preview.ok).toBe(true);
    expect(preview.ok && preview.goalPlan.warnings.belowRee).toBe(true);
  });

  it('activity not comparable: extra uncertainty, smaller shift and wider range', () => {
    const opts = { startWeightKg: 86, trueOffsetKcal: 250, intakeKcal: nasemAt(man, 86) - 400, days: 28, quality: 'high' as const };
    const a = makeHistory(man, TODAY, opts);
    const b = makeHistory(man, TODAY, { ...opts, activityComparable: false });
    const ra = warmStartFor(a.profile, a.evidence, TODAY);
    const rb = warmStartFor(b.profile, b.evidence, TODAY);
    expect(rb.likelihood.components?.activitySdKcal).toBe(200);
    expect(rb.likelihood.historyOnlySdKcal as number).toBeGreaterThan(ra.likelihood.historyOnlySdKcal as number);
    expect(width(rb.posterior.interval80)).toBeGreaterThan(width(ra.posterior.interval80));
    expect(rb.posterior.medianKcal).toBeLessThan(ra.posterior.medianKcal);
  });

  it('unknown start weight: stored but not used (the change in weight is required)', () => {
    const evidence: HistoricalIntakeEvidence = { evidenceVersion: 1, recordedOn: TODAY, averageCaloriesKcal: 1700, durationDays: 28, startWeightKg: null, endWeightKg: 70, trackingQuality: 'high', activityComparable: true };
    expect(warmStartFor(woman, evidence, TODAY).status).toBe('missing_start_weight');
    expect(previewInitialPlan(woman, TODAY, evidence).confidence).toBe('low');
  });

  it('invalid values are rejected and never reach the plan or the store', () => {
    const valid: HistoricalIntakeEvidence = { evidenceVersion: 1, recordedOn: TODAY, averageCaloriesKcal: 1700, durationDays: 28, startWeightKg: 71, endWeightKg: 70, trackingQuality: 'high', activityComparable: true };
    const invalid: HistoricalIntakeEvidence[] = [
      { ...valid, averageCaloriesKcal: 300 },
      { ...valid, averageCaloriesKcal: Number.NaN },
      { ...valid, durationDays: 0 },
      { ...valid, durationDays: 10.5 },
      { ...valid, durationDays: 400 },
      { ...valid, startWeightKg: 20 },
      { ...valid, endWeightKg: 400 },
      { ...valid, recordedOn: '2026-02-30' },
    ];
    for (const e of invalid) {
      expect(validateHistoricalEvidence(e).ok).toBe(false);
      expect(warmStartFor(woman, e, TODAY).status).toBe('invalid');
      const preview = previewInitialPlan(woman, TODAY, e);
      expect(preview.warmStart).toBeNull();
      const done = completeOnboarding(emptyStore(), woman, TODAY, iso(TODAY), e);
      expect(done.ok && done.store.historicalEvidence).toBeNull();
    }
  });

  it('persists, exports and imports the evidence and the warm-start snapshot explicitly', () => {
    const { profile, evidence } = makeHistory(man, TODAY, { startWeightKg: 86, trueOffsetKcal: 250, intakeKcal: nasemAt(man, 86) - 400, days: 28, quality: 'high' });
    const done = completeOnboarding(emptyStore(), profile, TODAY, iso(TODAY), evidence);
    if (!done.ok) throw new Error(done.reason);
    const s = done.store;
    expect(s.historicalEvidence).toEqual(evidence);
    expect(s.dailyLogs).toHaveLength(1);
    expect(s.calibrationSnapshots).toHaveLength(1);
    expect(s.calibrationSnapshots[0]).toMatchObject({ source: 'warm_start', validWeightCount: 0, confidence: 'medium', appliedAt: iso(TODAY) });
    expect(s.plan?.maintenanceKcal).toBeCloseTo((s.calibrationSnapshots[0]?.populationTdeeKcal ?? 0) + (s.calibrationSnapshots[0]?.posteriorMedianOffsetKcal ?? 0), 6);
    expect(s.meta.initialMaintenanceKcal).toBe(s.plan?.maintenanceKcal);
    expect(appliedWeightCalibrations(s)).toBe(0);
    const storage = new MemoryStorage();
    expect(saveStore(storage, s).ok).toBe(true);
    expect(loadStore(storage, iso(TODAY)).store).toEqual(s);
    const imported = parseImport(exportStore(s, iso(TODAY)));
    expect(imported.ok && imported.store).toEqual(s);
    expect(storedWarmStart(s)?.posterior.medianKcal).toBeCloseTo(s.calibrationSnapshots[0]?.posteriorMedianOffsetKcal ?? NaN, 9);
    // Before the first weigh-in gate the Analysis view shows the warm-start estimate and confidence.
    const state = computeCalibrationState(s, TODAY, iso(TODAY));
    expect(state?.confidence).toBe('medium');
    expect(analysisView(s, state)?.appliedCalibrations).toBe(0);
  });

  it('later recalibration keeps the history as evidence (no double counting of weigh-ins) and can be applied', () => {
    const { profile, evidence } = makeHistory(man, TODAY, { startWeightKg: 86, trueOffsetKcal: 250, intakeKcal: nasemAt(man, 86) - 400, days: 28, quality: 'high' });
    const done = completeOnboarding(emptyStore(), profile, TODAY, iso(TODAY), evidence);
    if (!done.ok) throw new Error(done.reason);
    let s = done.store;
    const rng = createRng(17);
    const start = s.weights[0]?.weightKg as number;
    for (let d = 1; d <= 35; d++) {
      const date = addDays(TODAY, d);
      s = ensureDailyLogs(s, date);
      s = setAdherence(s, addDays(date, -1), 'on_plan');
      s = setActualSteps(s, addDays(date, -1), profile.averageSteps7d);
      if (d % 3 === 0) s = addWeight(s, { date, weightKg: start - 0.09 * d + 0.3 * rng.normal() }, iso(date));
    }
    const today = addDays(TODAY, 35);
    const state = computeCalibrationState(s, today, iso(today));
    expect(state?.gate.met).toBe(true);
    expect(state?.fit).not.toBeNull();
    if (!state?.fit) return;
    // Same weigh-ins without the history: the history only adds information.
    const history = storedWarmStart(s)?.likelihood.logLikelihood;
    expect(history).toBeTruthy();
    const input = calibrationInputFromStore(s, today);
    expect(input?.historicalLogLikelihood).toEqual(history);
    const withoutHistory = fitCalibration({ ...(input as NonNullable<typeof input>), historicalLogLikelihood: undefined });
    expect(width(state.fit.posterior.interval80)).toBeLessThanOrEqual(width(withoutHistory?.posterior.interval80 ?? [0, 0]) + 1e-9);
    // Exactly one warm-start snapshot; recalibration adds a weights snapshot on top.
    const applied = applyRecalibration(s, state, today, iso(today));
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.store.calibrationSnapshots.map((x) => x.source ?? 'weights')).toEqual(['warm_start', 'weights']);
    expect(latestAppliedSnapshot(applied.store)?.source).toBeUndefined();
    expect(appliedWeightCalibrations(applied.store)).toBe(1);
    expect(applied.store.historicalEvidence).toEqual(evidence);
  });
});
