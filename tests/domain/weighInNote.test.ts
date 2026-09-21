/**
 * "J'ai mes règles" noted with a weigh-in (C-01): schema 6, migration 5 -> 6 on a stored store and on an
 * exported file, and the guarantee that the note is journaling only. The engine receives the weigh-ins as
 * they are stored, so the invariance is checked on the real calibration path, not on a mock.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { addWeight, applyRecalibration, completeOnboarding, computeCalibrationState, setAdherence, trendOf } from '@/domain/engine';
import { SCHEMA_VERSION } from '@/domain/types';
import type { StoredWeight, WheightyStore } from '@/domain/types';
import { exportStore, parseImport } from '@/persistence/exportImport';
import { migrateToCurrent } from '@/persistence/migrations';
import { emptyStore, isWeightEntry } from '@/persistence/schema';
import { loadStore, MemoryStorage, saveStore, STORE_KEY } from '@/persistence/storage';
import { addDays } from '@/science/dates';
import { makeProfile } from '../helpers/profiles';
import { createRng } from '../helpers/random';

const DAY0 = '2026-06-01';
const iso = (date: string) => `${date}T07:30:00.000Z`;

/** A female profile (the box is only offered then), weighed every three days for 84 days. */
function journey(noted: boolean): WheightyStore {
  const profile = makeProfile({ ageYears: 34, sexForEquation: 'female', heightCm: 168, currentWeightKg: 72, averageSteps7d: 8200, occupation: 'mixed', goal: 'loss', targetWeightKg: 66, weeklyRateTarget: 0.005 });
  const created = completeOnboarding(emptyStore(), profile, DAY0, iso(DAY0));
  if (!created.ok) throw new Error(created.reason);
  let s = created.store;
  const rng = createRng(7);
  for (let d = 1; d <= 84; d++) {
    const date = addDays(DAY0, d);
    s = setAdherence(s, addDays(date, -1), 'on_plan');
    // Noted on the days of a simulated cycle, so the flag is present on some weigh-ins and absent on others.
    if (d % 3 === 0) s = addWeight(s, { date, weightKg: 72 - 0.08 * d + 0.3 * rng.normal(), ...(noted && d % 28 < 5 ? { menstruating: true } : {}) }, iso(date));
  }
  return s;
}

describe('the weigh-in note never reaches the engine (C-01)', () => {
  const today = addDays(DAY0, 84);
  const plain = journey(false);
  const noted = journey(true);

  it('is stored on the weigh-ins of the noted journey only', () => {
    expect(plain.weights.some((w) => w.menstruating !== undefined)).toBe(false);
    expect(noted.weights.filter((w) => w.menstruating === true).length).toBeGreaterThan(0);
    // Only ever written when true: an unnoted weigh-in carries no key at all.
    expect(noted.weights.filter((w) => w.menstruating === false)).toEqual([]);
    // Same weigh-ins otherwise (ids are random, so they are left out of the comparison).
    const body = (w: StoredWeight) => ({ date: w.date, weightKg: w.weightKg, createdAt: w.createdAt });
    expect(plain.weights.map(body)).toEqual(noted.weights.map(body));
  });

  it('leaves the trend and the calibration outputs strictly identical', () => {
    expect(trendOf(noted)).toEqual(trendOf(plain));
    const before = computeCalibrationState(plain, today, iso(today));
    const after = computeCalibrationState(noted, today, iso(today));
    expect(before?.gate.met).toBe(true);
    expect(after).toEqual(before);
  });

  it('leaves the recalibrated plan strictly identical', () => {
    const state = computeCalibrationState(noted, today, iso(today));
    const other = computeCalibrationState(plain, today, iso(today));
    if (!state || !other) throw new Error('state');
    const a = applyRecalibration(noted, state, today, iso(today));
    const b = applyRecalibration(plain, other, today, iso(today));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.store.plan).toEqual(b.store.plan);
    expect(a.store.calibrationSnapshots).toEqual(b.store.calibrationSnapshots);
  });

  it('is never read outside the weigh-in sheet and its storage', () => {
    // The science layer knows nothing about it: its weigh-in type is the engine contract, unchanged.
    for (const f of ['src/science/calibration.ts', 'src/science/trend.ts', 'src/science/types.ts', 'src/domain/views.ts']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/menstruating/);
    }
    expect(readFileSync('src/screens/DailySheets.tsx', 'utf8')).toMatch(/sexForEquation === 'female'/);
  });
});

describe('schema 5 -> 6 migration (weigh-in note, C-01)', () => {
  /** A store exactly as schema 5 wrote it: weigh-ins without the note. */
  function schema5Raw(): Record<string, unknown> {
    const created = completeOnboarding(emptyStore(), makeProfile({ sexForEquation: 'female', currentWeightKg: 72, targetWeightKg: 66, goal: 'loss', weeklyRateTarget: 0.005 }), DAY0, iso(DAY0));
    if (!created.ok) throw new Error(created.reason);
    const s = addWeight(created.store, { date: addDays(DAY0, 3), weightKg: 71.4 }, iso(addDays(DAY0, 3))) as unknown as Record<string, unknown>;
    return { ...s, schemaVersion: 5 };
  }

  it('migrates a stored schema 5 store, weigh-ins left exactly as they were', () => {
    const raw = schema5Raw();
    const storage = new MemoryStorage();
    storage.setItem(STORE_KEY, JSON.stringify(raw));
    const loaded = loadStore(storage, iso(DAY0));
    expect(loaded.status).toBe('migrated');
    expect(loaded.dropped).toEqual([]);
    expect(loaded.store.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.store.weights).toEqual(raw.weights);
    expect(loaded.store.weights.some((w) => 'menstruating' in w)).toBe(false);
    expect(loaded.store.plan).toEqual(raw.plan);
    expect(loaded.store.dailyLogs).toEqual(raw.dailyLogs);
    // Saved again, it now loads as a current store.
    expect(saveStore(storage, loaded.store)).toEqual({ ok: true });
    expect(loadStore(storage, iso(DAY0)).status).toBe('loaded');
  });

  it('imports a schema 5 export file through the same migration', () => {
    const raw = schema5Raw();
    const imported = parseImport(JSON.stringify({ format: 'wheighty-export', formatVersion: 1, exportedAt: iso(DAY0), store: raw }));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.store.schemaVersion).toBe(SCHEMA_VERSION);
    expect(imported.store.weights).toEqual(raw.weights);
    expect(migrateToCurrent(raw)).toMatchObject({ ok: true, fromVersion: 5 });
  });

  it('round-trips the note through storage and export, and refuses a non boolean', () => {
    const created = completeOnboarding(emptyStore(), makeProfile({ sexForEquation: 'female' }), DAY0, iso(DAY0));
    if (!created.ok) throw new Error(created.reason);
    const s = addWeight(created.store, { date: addDays(DAY0, 1), weightKg: 71.4, menstruating: true }, iso(addDays(DAY0, 1)));
    const storage = new MemoryStorage();
    expect(saveStore(storage, s)).toEqual({ ok: true });
    expect(loadStore(storage, iso(DAY0)).store.weights).toEqual(s.weights);
    const imported = parseImport(exportStore(s, iso(DAY0)));
    expect(imported.ok && imported.store.weights).toEqual(s.weights);

    const last = s.weights[s.weights.length - 1] as StoredWeight;
    expect(isWeightEntry({ ...last, menstruating: 'oui' })).toBe(false);
    expect(isWeightEntry({ ...last, menstruating: false })).toBe(true);
    const bad = JSON.parse(exportStore(s, iso(DAY0))) as { store: { weights: Array<Record<string, unknown>> } };
    const broken = bad.store.weights[bad.store.weights.length - 1];
    if (broken) broken.menstruating = 'oui';
    expect(parseImport(JSON.stringify(bad)).ok).toBe(false);
  });
});
