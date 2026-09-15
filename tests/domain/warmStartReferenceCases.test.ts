/**
 * Reference warm-start cases (handoff 22_): full snapshot of the "Pourquoi ce résultat ?" view model, model 1.2.0.
 * Case R is the real user profile and the primary case; case S is a synthetic 5-session variant kept for continuity
 * with the audit and the P0 / P1 passes. Case W-01 (7 000 steps) is not a reference any more.
 */
import { describe, expect, it } from 'vitest';
import { buildPlan, completeOnboarding, computeCalibrationState } from '@/domain/engine';
import { explainCurrentPlan, explainPreview } from '@/domain/explain';
import type { WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { loadStore, MemoryStorage, saveStore } from '@/persistence/storage';
import { SCIENTIFIC_MODEL_VERSION } from '@/science/constants';
import type { HistoricalIntakeEvidence, UserProfile } from '@/science/types';
import { makeProfile } from '../helpers/profiles';

const TODAY = '2026-09-14';
const NOW = `${TODAY}T08:00:00.000Z`;
const history = (kcal: number, days = 14, start = 68, end = 68): HistoricalIntakeEvidence => ({ evidenceVersion: 1, recordedOn: TODAY, averageCaloriesKcal: kcal, durationDays: days, startWeightKg: start, endWeightKg: end, trackingQuality: 'high', activityComparable: true });

/** Case R, real profile: 4 strength sessions of 55 min, 1 450 kcal/day over 14 days, loss at 1.0 %/week, target 60.0 kg as entered. */
const CASE_R: UserProfile = makeProfile({ sexForEquation: 'female', ageYears: 24, heightCm: 155, currentWeightKg: 68, averageSteps7d: 9400, walkingPace: 'normal', occupation: 'seated', activities: [{ type: 'strength', sessionsPerWeek: 4, durationMin: 55, intensity: 'moderate' }], goal: 'loss', targetWeightKg: 60, weeklyRateTarget: 0.01 });
/** Case S, synthetic: identical except 5 sessions; its 62 kg target belongs to S only. */
const CASE_S: UserProfile = { ...CASE_R, activities: [{ type: 'strength', sessionsPerWeek: 5, durationMin: 55, intensity: 'moderate' }], targetWeightKg: 62 };

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
function roundDeep(value: unknown): unknown {
  if (typeof value === 'number') return Number.isFinite(value) ? r6(value) : String(value);
  if (Array.isArray(value)) return value.map(roundDeep);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, roundDeep(v)]));
  return value;
}

describe('warm start reference cases (model 1.2.0)', () => {
  it('case R (real profile)', () => {
    const x = explainPreview(CASE_R, TODAY, history(1450));
    if (!x?.history) throw new Error('case R');
    const h = x.history;
    expect(x.goal.targetWeightKg).toBe(60);
    expect(x.activity.provisionalPal).toBeCloseTo(1.6637, 4);
    expect(x.population.palCategory).toBe('low_active');
    expect(x.population.tdeeKcal).toBeCloseTo(2256.1, 1);
    expect((h.historyOnly?.medianKcal ?? NaN) - h.populationTdeeAtStartKcal).toBeCloseTo(-706.7, 1);
    expect(h.linearised?.offsetKcal).toBeCloseTo(-929.6, 1);
    expect(h.linearised?.sdKcal).toBeCloseTo(568.4, 1);
    expect(h.exactRoot?.rootOffsetKcal).toBeCloseTo(-806, 0);
    expect(h.incoherent).toBe(false);
    expect(h.conflictZ).toBeCloseTo(-1.45, 2);
    expect(h.fusedMedianKcal).toBeCloseTo(2074.0, 1);
    expect(x.maintenance.personalOffsetKcal).toBeCloseTo(-182.0, 1);
    expect(x.maintenance.confidence).toBe('low');
    expect(x.prescription.calorieTargetKcal).toBeCloseTo(1405.2, 1);
    expect(roundDeep(x)).toMatchSnapshot();
  });

  it('case S (synthetic 5-session variant)', () => {
    const x = explainPreview(CASE_S, TODAY, history(1450));
    if (!x?.history) throw new Error('case S');
    const h = x.history;
    expect(x.goal.targetWeightKg).toBe(62);
    expect(x.activity.provisionalPal).toBeCloseTo(1.6827, 4);
    expect(x.population.palCategory).toBe('active');
    expect(x.population.tdeeKcal).toBeCloseTo(2394.8, 1);
    expect(x.population.sigmaKcal).toBeCloseTo(241 * 1.15, 9);
    expect((h.historyOnly?.medianKcal ?? NaN) - h.populationTdeeAtStartKcal).toBeCloseTo(-846.1, 1);
    expect(h.linearised?.offsetKcal).toBeCloseTo(-1102.3, 1);
    expect(h.linearised?.sdKcal).toBeCloseTo(585.9, 1);
    expect(h.exactRoot?.rootOffsetKcal).toBeCloseTo(-944.8, 1);
    expect(h.incoherent).toBe(false);
    expect(h.conflictZ).toBeCloseTo(-1.68, 2);
    expect(x.maintenance.personalOffsetKcal).toBeCloseTo(-206.6, 1);
    expect(x.prescription.calorieTargetKcal).toBeCloseTo(1502.8, 1);
    expect(roundDeep(x)).toMatchSnapshot();
  });

  it('the target weight changes the time to target, not the 42-day calorie solve (R 60 kg vs 62 kg)', () => {
    const r60 = explainPreview(CASE_R, TODAY, history(1450));
    const r62 = explainPreview({ ...CASE_R, targetWeightKg: 62 }, TODAY, history(1450));
    expect(r60?.prescription.calorieTargetKcal).toBe(r62?.prescription.calorieTargetKcal);
  });
});

describe('store created with model 1.1.0 (D-23 legitimate case, changed by 1.2.0)', () => {
  const profile = makeProfile({ sexForEquation: 'male', ageYears: 40, heightCm: 178, currentWeightKg: 92, goal: 'loss', targetWeightKg: 84, weeklyRateTarget: 0.005 });
  const evidence = history(1400, 28, 90, 92);
  // Warm-start posterior produced by model 1.1.0 for this evidence (x2 inflation), recorded before the change.
  const OFFSET_110 = { median: -435.88839874271133, interval80: [-870.5350506070471, 18.45336417888674] as [number, number], interval95: [-1060.9787175549025, 261.12428195034033] as [number, number] };

  function storeFrom110(): WheightyStore {
    const done = completeOnboarding(emptyStore(), profile, TODAY, NOW, evidence);
    if (!done.ok) throw new Error(done.reason);
    const old = buildPlan({ profile, today: TODAY, weightKg: 92, source: 'initial', personalOffsetKcal: OFFSET_110.median, offsetInterval80: OFFSET_110.interval80, offsetInterval95: OFFSET_110.interval95 });
    if (!old.ok) throw new Error(old.reason);
    const snapshot = done.store.calibrationSnapshots[0];
    if (!snapshot) throw new Error('snapshot');
    return {
      ...done.store,
      plan: { ...old.plan, scientificModelVersion: '1.1.0' },
      calibrationSnapshots: [{ ...snapshot, scientificModelVersion: '1.1.0', posteriorMedianOffsetKcal: OFFSET_110.median, interval80: OFFSET_110.interval80, interval95: OFFSET_110.interval95, calibratedTdeeMedian: (snapshot.populationTdeeKcal ?? 0) + OFFSET_110.median, confidence: 'low' }],
      meta: { ...done.store.meta, initialMaintenanceKcal: old.plan.maintenanceKcal, initialInterval80: old.plan.maintenanceInterval80 },
    };
  }

  it('the stored plan is never silently replaced (load, calibration state)', () => {
    const s = storeFrom110();
    const storage = new MemoryStorage();
    saveStore(storage, s);
    const loaded = loadStore(storage, NOW).store;
    expect(loaded.plan).toEqual(s.plan);
    expect(loaded.plan?.scientificModelVersion).toBe('1.1.0');
    const state = computeCalibrationState(loaded, TODAY, NOW);
    expect(state?.currentMaintenanceKcal).toBe(s.plan?.maintenanceKcal);
    expect(state?.surfaced).toBe(false);
  });

  it('the explanation shows both versions and flags the mismatch (version and recomputed warm-start offset, D-30)', () => {
    const s = storeFrom110();
    const x = explainCurrentPlan(s, TODAY);
    expect(x?.modelVersion).toBe(SCIENTIFIC_MODEL_VERSION);
    expect(x?.storedPlanModelVersion).toBe('1.1.0');
    expect(x?.maintenance.personalOffsetKcal).toBeCloseTo(OFFSET_110.median, 9);
    expect((x?.history?.fusedMedianKcal ?? 0) - (x?.maintenance.kcal ?? 0)).toBeLessThan(-500);
    // Since P3 the integrity check no longer stops at the calories rebuilt at the stored offset.
    expect(x?.matchesStoredPlan).toBe(false);
    expect(x?.integrity?.versionMatches).toBe(false);
    expect(x?.integrity?.caloriesMatch).toBe(true);
    expect(x?.integrity?.offset?.matches).toBe(false);
    expect(x?.integrity?.offset?.diffKcal).toBeLessThan(-500);
  });
});
