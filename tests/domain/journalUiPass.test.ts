/**
 * Journal UI pass (J-05 to J-08): time of consumption and its day, schema 3 -> 4 migration, neutral gauges,
 * native barcode detection helpers, and the boundaries of the new UI (no persisted session state, camera
 * requested only by the scanner hook).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addFoodEntry, consumptionDate, intakeGauge, journalDay } from '@/domain/journal';
import type { ResolvedFood } from '@/domain/journal';
import type { WheightyStore } from '@/domain/types';
import { SCHEMA_VERSION } from '@/domain/types';
import { exportStore, parseImport } from '@/persistence/exportImport';
import { emptyStore, isFoodEntry } from '@/persistence/schema';
import { loadStore, MemoryStorage, saveStore, STORE_KEY } from '@/persistence/storage';
import { nativeRetailFormats, pickBarcode, RETAIL_BARCODE_FORMATS } from '@/hooks/useBarcodeScanner';

const NOW = '2026-09-16T22:30:00.000Z';
const APPLE: ResolvedFood = { source: 'ciqual', sourceId: '13050', sourceVersion: 'Ciqual 2025 (2025-11-03)', resolvedAt: NOW, name: 'Pomme, crue', per100g: { energyKcal: 53.6, proteinG: 0.25, carbsG: 11.6, fatG: 0.25 } };

function entryStore(): WheightyStore {
  let s = emptyStore();
  const a = addFoodEntry(s, { kind: 'resolved', date: '2026-09-16', localTime: '21:05', consumedTime: '12:40', food: APPLE, grams: 150 }, NOW);
  if (!a.ok) throw new Error(a.reason);
  s = a.store;
  const b = addFoodEntry(s, { kind: 'resolved', date: '2026-09-16', localTime: '21:06', food: APPLE, grams: 100 }, NOW);
  if (!b.ok) throw new Error(b.reason);
  return b.store;
}

describe('time of consumption (J-06)', () => {
  it('stores the consumption time apart from the save time; "just ate" means both are equal', () => {
    const [lunch, now] = entryStore().foodJournal.entries;
    expect(lunch).toMatchObject({ localTime: '21:05', consumedTime: '12:40', loggedAt: NOW, date: '2026-09-16' });
    expect(now).toMatchObject({ localTime: '21:06', consumedTime: '21:06' });
  });

  it('the day timeline follows the consumption time, not the save order', () => {
    let s = entryStore();
    const breakfast = addFoodEntry(s, { kind: 'resolved', date: '2026-09-16', localTime: '21:10', consumedTime: '07:45', food: APPLE, grams: 80 }, '2026-09-16T22:40:00.000Z');
    if (!breakfast.ok) throw new Error(breakfast.reason);
    s = breakfast.store;
    expect(journalDay(s, '2026-09-16').entries.map((e) => e.consumedTime)).toEqual(['07:45', '12:40', '21:06']);
  });

  it('midnight: a time later than now on today belongs to yesterday', () => {
    // Eaten at 23:00, saved at 00:30 on the 17th while looking at "today".
    expect(consumptionDate('2026-09-17', '2026-09-17', '23:00', '00:30')).toBe('2026-09-16');
    expect(consumptionDate('2026-09-17', '2026-09-17', '00:10', '00:30')).toBe('2026-09-17');
    expect(consumptionDate('2026-09-17', '2026-09-17', '00:30', '00:30')).toBe('2026-09-17');
    // An explicit past day is kept as chosen.
    expect(consumptionDate('2026-09-16', '2026-09-17', '23:00', '00:30')).toBe('2026-09-16');
    const r = addFoodEntry(emptyStore(), { kind: 'manual', date: consumptionDate('2026-09-17', '2026-09-17', '23:00', '00:30'), localTime: '00:30', consumedTime: '23:00', food: { name: 'Tisane et biscuits', intake: { energyKcal: 120, proteinG: null, carbsG: null, fatG: null }, grams: null } }, '2026-09-16T22:30:00.000Z');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(journalDay(r.store, '2026-09-16').intakeLoggedKcal).toBe(120);
    expect(journalDay(r.store, '2026-09-17').entries).toEqual([]);
  });

  it('rejects an entry without a valid consumption time', () => {
    const e = entryStore().foodJournal.entries[0] as unknown as Record<string, unknown>;
    expect(isFoodEntry(e)).toBe(true);
    expect(isFoodEntry({ ...e, consumedTime: '24:10' })).toBe(false);
    const { consumedTime: _t, ...withoutTime } = e;
    expect(isFoodEntry(withoutTime)).toBe(false);
  });

  it('the add session state ("je viens de le manger", typed time) is never persisted', () => {
    for (const f of ['src/domain/types.ts', 'src/persistence/schema.ts', 'src/persistence/migrations.ts', 'src/store/StoreProvider.tsx']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/justAte|TimingSession/);
    }
    expect(readFileSync('src/screens/Journal.tsx', 'utf8')).not.toMatch(/localStorage|sessionStorage|preferences\.[a-zA-Z]*(justAte|time)/);
  });
});

describe('schema 3 -> 4 migration', () => {
  /** A store as schema 3 wrote it: entries without consumedTime. */
  function schema3Raw(): Record<string, unknown> {
    const s = entryStore() as unknown as Record<string, unknown>;
    const journal = s.foodJournal as { entries: Array<Record<string, unknown>> };
    const entries = journal.entries.map(({ consumedTime: _c, ...rest }) => rest);
    return { ...s, schemaVersion: 3, foodJournal: { ...journal, entries } };
  }

  it('migrates a stored schema 3 store: consumption time = save time, day and values unchanged', () => {
    const raw = schema3Raw();
    const storage = new MemoryStorage();
    storage.setItem(STORE_KEY, JSON.stringify(raw));
    const loaded = loadStore(storage, NOW);
    expect(loaded.status).toBe('migrated');
    expect(loaded.dropped).toEqual([]);
    expect(loaded.store.schemaVersion).toBe(SCHEMA_VERSION);
    const rawEntries = (raw.foodJournal as { entries: Array<Record<string, unknown>> }).entries;
    loaded.store.foodJournal.entries.forEach((e, i) => {
      expect(e.consumedTime).toBe(e.localTime);
      expect({ ...e, consumedTime: undefined }).toEqual({ ...rawEntries[i], consumedTime: undefined });
    });
    expect(saveStore(storage, loaded.store)).toEqual({ ok: true });
    expect(loadStore(storage, NOW).status).toBe('loaded');
  });

  it('imports a schema 3 export file through the same migration', () => {
    const imported = parseImport(JSON.stringify({ format: 'wheighty-export', formatVersion: 1, exportedAt: NOW, store: schema3Raw() }));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.store.schemaVersion).toBe(SCHEMA_VERSION);
    expect(imported.store.foodJournal.entries.map((e) => [e.localTime, e.consumedTime])).toEqual([
      ['21:05', '21:05'],
      ['21:06', '21:06'],
    ]);
  });

  it('keeps an explicit consumption time through export and import', () => {
    const s = entryStore();
    const imported = parseImport(exportStore(s, NOW));
    expect(imported.ok && imported.store.foodJournal.entries.map((e) => e.consumedTime)).toEqual(['12:40', '21:06']);
  });

  it('never touches non journal data', () => {
    const raw = { ...schema3Raw(), weights: [{ id: 'w', date: '2026-09-01', weightKg: 70, createdAt: NOW }] };
    const imported = parseImport(JSON.stringify(raw));
    expect(imported.ok && imported.store.weights).toEqual(raw.weights);
  });
});

describe('neutral gauges (J-08)', () => {
  it('fills up to the target, then stays full with an amount beyond, never negative', () => {
    expect(intakeGauge(0, 1780)).toEqual({ fraction: 0, remaining: 1780, beyond: 0 });
    expect(intakeGauge(1287, 1780)).toMatchObject({ remaining: 493, beyond: 0 });
    expect(intakeGauge(1287, 1780).fraction).toBeCloseTo(0.723, 3);
    expect(intakeGauge(1780.4, 1780)).toEqual({ fraction: 1, remaining: 0, beyond: 0 });
    expect(intakeGauge(2187, 1780)).toEqual({ fraction: 1, remaining: 0, beyond: 407 });
    expect(intakeGauge(50, 0)).toEqual({ fraction: 0, remaining: 0, beyond: 50 });
  });

  it('the same gauge is used for the three macros and for kcal, with the existing progress style only', () => {
    const src = readFileSync('src/screens/Journal.tsx', 'utf8');
    expect(src.match(/intakeGauge\(/g)).toHaveLength(2);
    expect(src.match(/className="progress"/g)).toHaveLength(2);
    expect(src).not.toMatch(/--danger|danger|#[0-9a-f]{3,6}|échec|dépass|trop mangé|excès/i);
    const copy = readFileSync('src/app/copy.ts', 'utf8');
    const gaugeCopy = copy.slice(copy.indexOf('JOURNAL_GAUGE_TEXT'), copy.indexOf('JOURNAL_TIME_TEXT'));
    expect(gaugeCopy).not.toMatch(/dépass|excès|trop|attention|alerte|−|-\$\{/i);
  });
});

describe('native barcode detection (J-05)', () => {
  const camera = { mediaDevices: { getUserMedia: () => undefined } };

  it('no camera reading without the native detector, getUserMedia, or retail formats', async () => {
    expect(await nativeRetailFormats({ navigator: camera })).toEqual([]);
    expect(await nativeRetailFormats({ BarcodeDetector: class {}, navigator: {} })).toEqual([]);
    const qrOnly = class {
      static async getSupportedFormats() {
        return ['qr_code'];
      }
    };
    expect(await nativeRetailFormats({ BarcodeDetector: qrOnly, navigator: camera })).toEqual([]);
    const throwing = class {
      static async getSupportedFormats(): Promise<string[]> {
        throw new Error('not supported on this platform');
      }
    };
    expect(await nativeRetailFormats({ BarcodeDetector: throwing, navigator: camera })).toEqual([]);
  });

  it('keeps the retail formats the platform supports', async () => {
    const detector = class {
      static async getSupportedFormats() {
        return ['qr_code', 'ean_13', 'upc_a'];
      }
    };
    expect(await nativeRetailFormats({ BarcodeDetector: detector, navigator: camera })).toEqual(['ean_13', 'upc_a']);
    expect(RETAIL_BARCODE_FORMATS).toEqual(['ean_13', 'ean_8', 'upc_a', 'upc_e']);
  });

  it('picks the first valid retail code among detections', () => {
    expect(pickBarcode([])).toBeNull();
    expect(pickBarcode([{ rawValue: 'https://example.test' }, { rawValue: '3017624010701' }])).toBe('3017624010701');
    expect(pickBarcode([{ rawValue: '1234' }])).toBeNull();
  });

  it('the camera is only requested by the scanner hook, inside its effect, and released on cleanup', () => {
    const hook = readFileSync('src/hooks/useBarcodeScanner.ts', 'utf8');
    expect(hook).toMatch(/getUserMedia/);
    expect(hook).toMatch(/getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/);
    expect(hook.indexOf('getUserMedia(')).toBeGreaterThan(hook.indexOf('useEffect('));
    for (const f of ['src/screens/Journal.tsx', 'src/app/App.tsx', 'src/main.tsx', 'src/adapters/openFoodFacts.ts']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/getUserMedia|mediaDevices/);
    }
    // No OCR engine and no WASM detection fallback are bundled (J-05).
    const pkg = readFileSync('package.json', 'utf8');
    expect(pkg).not.toMatch(/tesseract|zxing|quagga|barcode-detector/);
  });
});
