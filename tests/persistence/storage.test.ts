import { describe, expect, it } from 'vitest';
import { deleteAllData, loadStore, MemoryStorage, RECOVERY_KEY_PREFIX, saveStore, STORE_KEY } from '@/persistence/storage';
import { emptyStore } from '@/persistence/schema';
import { migrateToCurrent } from '@/persistence/migrations';
import { exportStore, parseImport } from '@/persistence/exportImport';
import type { WheightyStore } from '@/domain/types';
import { SCHEMA_VERSION } from '@/domain/types';
import { SCIENTIFIC_MODEL_VERSION } from '@/science/constants';

const NOW = '2026-09-13T08:00:00.000Z';

function sampleStore(): WheightyStore {
  const s = emptyStore();
  s.profile = {
    ageYears: 34,
    sexForEquation: 'female',
    heightCm: 172,
    currentWeightKg: 76.8,
    averageSteps7d: 8200,
    walkingPace: 'normal',
    occupation: 'mixed',
    activities: [{ type: 'strength', sessionsPerWeek: 3, durationMin: 60, intensity: 'moderate' }],
    goal: 'loss',
    targetWeightKg: 72,
    weeklyRateTarget: 0.005,
  };
  s.weights = [
    { id: 'a', date: '2026-09-01', weightKg: 77.2, createdAt: '2026-09-01T07:00:00Z' },
    { id: 'b', date: '2026-09-04', weightKg: 76.9, createdAt: '2026-09-04T07:00:00Z' },
  ];
  s.dailyLogs = [{ date: '2026-09-01', calorieTargetForDay: 2034.02, stepTargetForDay: 8200, adherence: 'on_plan', actualSteps: 9100, macrosForDay: { proteinG: 138, carbsG: 217, fatG: 68 } }];
  s.calibrationSnapshots = [
    {
      scientificModelVersion: '1.0.0',
      createdAt: NOW,
      posteriorMeanOffsetKcal: 40,
      posteriorMedianOffsetKcal: 38,
      interval80: [-100, 180],
      interval95: [-170, 250],
      calibratedTdeeMedian: 2443,
      validWeightCount: 9,
      observationSpanDays: 21,
      confidence: 'good',
    },
  ];
  return s;
}

describe('versioned local persistence (07 s2)', () => {
  it('starts empty and round-trips a complete store', () => {
    const storage = new MemoryStorage();
    expect(loadStore(storage, NOW).status).toBe('empty');
    const s = sampleStore();
    expect(saveStore(storage, s)).toEqual({ ok: true });
    const loaded = loadStore(storage, NOW);
    expect(loaded.status).toBe('loaded');
    expect(loaded.store).toEqual(s);
    expect(loaded.store.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.store.scientificModelVersion).toBe(SCIENTIFIC_MODEL_VERSION);
  });

  it('round-trips historical intake evidence explicitly, including an unknown start weight', () => {
    const storage = new MemoryStorage();
    const s = sampleStore();
    s.historicalEvidence = { evidenceVersion: 1, recordedOn: '2026-09-01', averageCaloriesKcal: 1650, durationDays: 21, startWeightKg: null, endWeightKg: 77.2, trackingQuality: 'medium', activityComparable: false };
    saveStore(storage, s);
    expect(loadStore(storage, NOW).store.historicalEvidence).toEqual(s.historicalEvidence);
    const bad = { ...sampleStore(), historicalEvidence: { evidenceVersion: 1, recordedOn: 'yesterday', averageCaloriesKcal: 1650 } };
    storage.setItem(STORE_KEY, JSON.stringify(bad));
    const partial = loadStore(storage, NOW);
    expect(partial.status).toBe('recovered_partial');
    expect(partial.dropped).toEqual([{ path: 'historicalEvidence', reason: 'invalid' }]);
  });

  it('keeps full precision values', () => {
    const storage = new MemoryStorage();
    const s = sampleStore();
    saveStore(storage, s);
    expect(loadStore(storage, NOW).store.dailyLogs[0]?.calorieTargetForDay).toBe(2034.02);
  });

  it('recovers from invalid JSON without losing the raw data', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORE_KEY, '{"schemaVersion":1, "weights": [ broken');
    const result = loadStore(storage, NOW);
    expect(result.status).toBe('recovered_corrupt');
    expect(result.store.profile).toBeNull();
    expect(result.recoveryKey).toMatch(new RegExp(`^${RECOVERY_KEY_PREFIX}`));
    expect(storage.getItem(result.recoveryKey ?? '')).toBe('{"schemaVersion":1, "weights": [ broken');
    expect(result.store.meta.recoveredCorruptData?.key).toBe(result.recoveryKey);
  });

  it('salvages valid records from a partially invalid store and preserves the original', () => {
    const storage = new MemoryStorage();
    const s = sampleStore() as unknown as Record<string, unknown>;
    const weights = [...(s.weights as unknown[]), { id: 'bad', date: 'not-a-date', weightKg: 'heavy', createdAt: NOW }];
    const raw = JSON.stringify({ ...s, weights });
    storage.setItem(STORE_KEY, raw);
    const result = loadStore(storage, NOW);
    expect(result.status).toBe('recovered_partial');
    expect(result.store.weights).toHaveLength(2);
    expect(result.dropped).toEqual([{ path: 'weights.2', reason: 'invalid' }]);
    expect(storage.getItem(result.recoveryKey ?? '')).toBe(raw);
  });

  it('refuses to save an invalid store', () => {
    const storage = new MemoryStorage();
    const s = sampleStore();
    (s.weights[0] as { weightKg: number }).weightKg = Number.NaN;
    expect(saveStore(storage, s)).toEqual({ ok: false, error: 'invalid_store' });
    expect(storage.getItem(STORE_KEY)).toBeNull();
  });

  it('reports storage write failures', () => {
    const storage = new MemoryStorage();
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(saveStore(storage, sampleStore())).toEqual({ ok: false, error: 'write_failed' });
  });

  it('handles unavailable storage', () => {
    expect(loadStore(null, NOW).status).toBe('unavailable');
    expect(saveStore(null, sampleStore())).toEqual({ ok: false, error: 'unavailable' });
  });

  it('deletes the store and recovery copies only', () => {
    const storage = new MemoryStorage();
    saveStore(storage, sampleStore());
    storage.setItem(`${RECOVERY_KEY_PREFIX}x`, 'old');
    storage.setItem('other-app', 'keep');
    deleteAllData(storage);
    expect(storage.getItem(STORE_KEY)).toBeNull();
    expect(storage.getItem(`${RECOVERY_KEY_PREFIX}x`)).toBeNull();
    expect(storage.getItem('other-app')).toBe('keep');
  });
});

describe('migrations', () => {
  it('upgrades a version-less object to the current schema', () => {
    const legacy = { profile: null, weights: [{ id: 'a', date: '2026-01-01', weightKg: 70, createdAt: NOW }] };
    const result = migrateToCurrent(legacy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.schemaVersion).toBe(SCHEMA_VERSION);
      expect(result.value.weights).toEqual(legacy.weights);
      expect(result.fromVersion).toBe(0);
    }
  });

  it('rejects a future schema version and preserves raw data on load', () => {
    const storage = new MemoryStorage();
    const raw = JSON.stringify({ ...sampleStore(), schemaVersion: 99 });
    storage.setItem(STORE_KEY, raw);
    const result = loadStore(storage, NOW);
    expect(result.status).toBe('recovered_corrupt');
    expect(storage.getItem(result.recoveryKey ?? '')).toBe(raw);
  });

  it('migrates a schema 1 store (speed presets) to schema 2 without losing any data', () => {
    const v1 = sampleStore() as unknown as Record<string, unknown>;
    const { weeklyRateTarget: _rate, ...profileV1 } = v1.profile as Record<string, unknown>;
    const plan = {
      createdAt: '2026-09-01T00:00:00.000Z',
      source: 'recalibrated',
      maintenanceKcal: 2400,
      maintenanceInterval80: [2200, 2600],
      maintenanceInterval95: [2100, 2700],
      calorieTarget: 2034.02,
      stepTarget: 8200,
      macros: { proteinG: 138, carbsG: 217, fatG: 68 },
      reeKcal: 1480,
      reeMethod: 'mifflin_st_jeor',
      palCategory: 'low_active',
      provisionalPal: 1.6,
      goal: 'loss',
      weeklyRateTarget: 0.0025,
      projection: { trajectory: [{ day: 0, weightKg: 76.8 }], lower80: [{ day: 0, weightKg: 76.8 }], upper80: [{ day: 0, weightKg: 76.8 }] },
      scientificModelVersion: '1.0.0',
      speedPreset: 'fast',
      appliedSpeed: 'gentle',
      personalOffsetKcal: 38,
    };
    const legacy = { ...v1, schemaVersion: 1, scientificModelVersion: '1.0.0', profile: { ...profileV1, speedPreset: 'fast' }, plan };
    delete (legacy as Record<string, unknown>).historicalEvidence;

    const storage = new MemoryStorage();
    storage.setItem(STORE_KEY, JSON.stringify(legacy));
    const loaded = loadStore(storage, NOW);
    expect(loaded.status).toBe('migrated');
    expect(loaded.dropped).toEqual([]);
    const s = loaded.store;
    // Loading runs every migration: 1 -> 2 here, then 2 -> 3 (food journal, covered in foodJournalPersistence.test.ts).
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.profile?.weeklyRateTarget).toBe(0.0075);
    expect(s.profile).not.toHaveProperty('speedPreset');
    expect(s.plan).toMatchObject({ requestedWeeklyRate: 0.0075, weeklyRateTarget: 0.0025, personalOffsetKcal: 38, scientificModelVersion: '1.0.0', calorieTarget: 2034.02 });
    expect(s.plan).not.toHaveProperty('speedPreset');
    expect(s.plan).not.toHaveProperty('appliedSpeed');
    expect(s.historicalEvidence).toBeNull();
    expect(s.weights).toEqual(v1.weights);
    expect(s.dailyLogs).toEqual(v1.dailyLogs);
    expect(s.calibrationSnapshots).toEqual(v1.calibrationSnapshots);
    expect(s.preferences).toEqual(v1.preferences);
    expect(s.scientificModelVersion).toBe('1.0.0');

    const maintenance = migrateToCurrent({ ...legacy, profile: { ...profileV1, goal: 'maintenance', speedPreset: 'moderate' }, plan: null });
    expect(maintenance.ok && (maintenance.value.profile as Record<string, unknown>).weeklyRateTarget).toBe(0);
    const gain = migrateToCurrent({ ...legacy, profile: { ...profileV1, goal: 'gain', speedPreset: 'gentle' }, plan: null });
    expect(gain.ok && (gain.value.profile as Record<string, unknown>).weeklyRateTarget).toBe(0.001);
  });

  it('imports a schema 1 export file through the same migration', () => {
    const v1 = sampleStore() as unknown as Record<string, unknown>;
    const { weeklyRateTarget: _rate, ...profileV1 } = v1.profile as Record<string, unknown>;
    const text = JSON.stringify({ format: 'wheighty-export', formatVersion: 1, exportedAt: NOW, store: { ...v1, schemaVersion: 1, profile: { ...profileV1, speedPreset: 'moderate' }, historicalEvidence: undefined } });
    const imported = parseImport(text);
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.store.profile?.weeklyRateTarget).toBe(0.005);
      expect(imported.store.weights).toEqual(v1.weights);
    }
  });

  it('fails explicitly when a migration step is missing', () => {
    expect(migrateToCurrent({ schemaVersion: 0 }, {}, 1)).toEqual({ ok: false, error: 'missing_migration' });
  });
});

describe('JSON export / import (07 s14)', () => {
  it('round-trips through export and import', () => {
    const s = sampleStore();
    const text = exportStore(s, NOW);
    const imported = parseImport(text);
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.store).toEqual(s);
      expect(imported.summary).toEqual({ weights: 2, dailyLogs: 1, calibrations: 1, hasProfile: true, foodEntries: 0 });
    }
  });

  it('rejects invalid JSON, foreign files and invalid content', () => {
    expect(parseImport('nope')).toEqual({ ok: false, error: 'invalid_json' });
    expect(parseImport('{"hello":"world"}')).toEqual({ ok: false, error: 'not_wheighty_export' });
    const s = sampleStore() as unknown as Record<string, unknown>;
    const bad = exportStore({ ...(s as unknown as WheightyStore), weights: [{ id: 'x', date: '2026-02-30', weightKg: 70, createdAt: NOW }] }, NOW);
    const result = parseImport(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_content');
  });

  it('rejects exports from a newer format', () => {
    const text = JSON.stringify({ format: 'wheighty-export', formatVersion: 2, exportedAt: NOW, store: sampleStore() });
    expect(parseImport(text)).toEqual({ ok: false, error: 'unsupported_version' });
  });

  it('never carries a recovery marker from the imported file', () => {
    const s = sampleStore();
    s.meta.recoveredCorruptData = { savedAt: NOW, key: 'wheighty:recovery:x' };
    const imported = parseImport(exportStore(s, NOW));
    expect(imported.ok && imported.store.meta.recoveredCorruptData).toBe(null);
  });
});
