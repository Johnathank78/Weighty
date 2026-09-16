/**
 * Food journal persistence (J-01, J-03): schema 2 -> 3 migration on a stored store and on an
 * exported file, validated import, rejection of invalid files, total local deletion including
 * the journal and the product cache.
 */
import { describe, expect, it } from 'vitest';
import type { OffProduct } from '@/adapters/openFoodFacts';
import { addFoodEntry, addPortion } from '@/domain/journal';
import type { WheightyStore } from '@/domain/types';
import { emptyFoodJournal, SCHEMA_VERSION } from '@/domain/types';
import { exportStore, parseImport } from '@/persistence/exportImport';
import { migrateToCurrent } from '@/persistence/migrations';
import { clearProductCache, getCachedProduct, PRODUCT_CACHE_KEY, PRODUCT_CACHE_MAX, putCachedProduct, readProductCache } from '@/persistence/productCache';
import { emptyStore } from '@/persistence/schema';
import { deleteAllData, loadStore, MemoryStorage, saveStore, STORE_KEY } from '@/persistence/storage';

const NOW = '2026-09-16T08:00:00.000Z';

function baseStore(): WheightyStore {
  const s = emptyStore();
  s.profile = {
    ageYears: 34,
    sexForEquation: 'female',
    heightCm: 172,
    currentWeightKg: 76.8,
    averageSteps7d: 8200,
    walkingPace: 'normal',
    occupation: 'mixed',
    activities: [],
    goal: 'loss',
    targetWeightKg: 72,
    weeklyRateTarget: 0.005,
  };
  s.weights = [{ id: 'a', date: '2026-09-01', weightKg: 77.2, createdAt: '2026-09-01T07:00:00Z' }];
  s.dailyLogs = [{ date: '2026-09-01', calorieTargetForDay: 2034.02, stepTargetForDay: 8200, adherence: 'on_plan', macrosForDay: { proteinG: 138, carbsG: 217, fatG: 68 } }];
  s.preferences = { ...s.preferences, theme: 'dark', showScientificDetails: true };
  return s;
}

/** A store exactly as schema 2 wrote it: no journal, no opt-in preference. */
function schema2Raw(): Record<string, unknown> {
  const s = baseStore() as unknown as Record<string, unknown>;
  const { foodJournal: _journal, ...rest } = s;
  const { productSearchEnabled: _optIn, ...preferences } = s.preferences as Record<string, unknown>;
  return { ...rest, schemaVersion: 2, preferences };
}

function storeWithJournal(): WheightyStore {
  let s = baseStore();
  const ciqual = addFoodEntry(
    s,
    {
      kind: 'resolved',
      date: '2026-09-15',
      localTime: '12:30',
      food: { source: 'ciqual', sourceId: '13050', sourceVersion: 'Ciqual 2025 (2025-11-03)', resolvedAt: NOW, name: 'Pomme, crue', per100g: { energyKcal: 53.6, proteinG: 0.25, carbsG: 11.6, fatG: 0.25 } },
      grams: 150,
      portion: { id: 'p-1', label: 'Une pomme', count: 1, gramsEach: 150 },
    },
    NOW,
  );
  if (!ciqual.ok) throw new Error(ciqual.reason);
  s = ciqual.store;
  const manual = addFoodEntry(s, { kind: 'manual', date: '2026-09-16', localTime: '08:05', food: { name: 'Petit déjeuner', intake: { energyKcal: 420, proteinG: null, carbsG: 50, fatG: null }, grams: null } }, NOW);
  if (!manual.ok) throw new Error(manual.reason);
  const portion = addPortion(manual.store, { label: 'Mon bol', grams: 250, foodKey: null }, NOW);
  if (!portion.ok) throw new Error(portion.reason);
  return portion.store;
}

const product = (barcode: string, kcal: number | null): OffProduct => ({ barcode, name: `Produit ${barcode}`, lastModified: '1785948506', per100g: kcal === null ? null : { energyKcal: kcal, proteinG: 1, carbsG: 2, fatG: 3 } });

describe('schema 2 -> current migration (food journal)', () => {
  it('schema version is 4 (3: journal, 4: time of consumption)', () => {
    expect(SCHEMA_VERSION).toBe(4);
  });

  it('migrates a stored schema 2 store: empty journal, opt-in off, everything else untouched', () => {
    const raw = schema2Raw();
    const storage = new MemoryStorage();
    storage.setItem(STORE_KEY, JSON.stringify(raw));
    const loaded = loadStore(storage, NOW);
    expect(loaded.status).toBe('migrated');
    expect(loaded.dropped).toEqual([]);
    expect(loaded.store.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.store.foodJournal).toEqual(emptyFoodJournal());
    expect(loaded.store.preferences).toEqual({ ...(raw.preferences as object), productSearchEnabled: false });
    expect(loaded.store.weights).toEqual(raw.weights);
    expect(loaded.store.dailyLogs).toEqual(raw.dailyLogs);
    expect(loaded.store.profile).toEqual(raw.profile);
    // Saved again, it now loads as a current store.
    expect(saveStore(storage, loaded.store)).toEqual({ ok: true });
    expect(loadStore(storage, NOW).status).toBe('loaded');
  });

  it('never adds journal data to dailyLogs or plan targets', () => {
    const migrated = migrateToCurrent(schema2Raw());
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.value.dailyLogs).toEqual(baseStore().dailyLogs);
  });

  it('imports a schema 2 export file through the same migration', () => {
    const text = JSON.stringify({ format: 'wheighty-export', formatVersion: 1, exportedAt: NOW, store: schema2Raw() });
    const imported = parseImport(text);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.store.schemaVersion).toBe(SCHEMA_VERSION);
    expect(imported.store.foodJournal).toEqual(emptyFoodJournal());
    expect(imported.summary.foodEntries).toBe(0);
    expect(imported.store.weights).toEqual(baseStore().weights);
  });
});

describe('journal persistence, export and import', () => {
  it('round-trips entries, portions and the start day through storage', () => {
    const s = storeWithJournal();
    const storage = new MemoryStorage();
    expect(saveStore(storage, s)).toEqual({ ok: true });
    const loaded = loadStore(storage, NOW);
    expect(loaded.status).toBe('loaded');
    expect(loaded.store.foodJournal).toEqual(s.foodJournal);
    expect(loaded.store.foodJournal.startedOn).toBe('2026-09-15');
    expect(loaded.store.foodJournal.entries).toHaveLength(2);
    expect(loaded.store.foodJournal.portions).toHaveLength(1);
  });

  it('round-trips the journal through export and import', () => {
    const s = storeWithJournal();
    const imported = parseImport(exportStore(s, NOW));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.store.foodJournal).toEqual(s.foodJournal);
    expect(imported.summary.foodEntries).toBe(2);
  });

  it('an imported file never switches the network opt-in on', () => {
    const s = storeWithJournal();
    s.preferences.productSearchEnabled = true;
    const imported = parseImport(exportStore(s, NOW));
    expect(imported.ok && imported.store.preferences.productSearchEnabled).toBe(false);
  });

  it('rejects a file with an invalid journal entry and changes nothing', () => {
    const s = storeWithJournal();
    const bad = JSON.parse(exportStore(s, NOW)) as { store: WheightyStore };
    const first = bad.store.foodJournal.entries[0] as unknown as Record<string, unknown>;
    first.intake = { energyKcal: -5, proteinG: null, carbsG: null, fatG: null };
    const result = parseImport(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid_content');
      expect(result.details).toEqual([{ path: 'foodJournal.entries.0', reason: 'invalid' }]);
    }
  });

  it('rejects resolved entries without their snapshot, and malformed journals', () => {
    const s = storeWithJournal();
    const noSnapshot = JSON.parse(exportStore(s, NOW)) as { store: Record<string, unknown> };
    const journal = noSnapshot.store.foodJournal as { entries: Array<Record<string, unknown>> };
    (journal.entries[0] as Record<string, unknown>).per100g = null;
    expect(parseImport(JSON.stringify(noSnapshot)).ok).toBe(false);

    const wrongShape = JSON.parse(exportStore(s, NOW)) as { store: Record<string, unknown> };
    wrongShape.store.foodJournal = { journalVersion: 99, entries: [] };
    const r = parseImport(JSON.stringify(wrongShape));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.details).toEqual([{ path: 'foodJournal', reason: 'invalid' }]);
  });

  it('salvages valid entries of a partially invalid stored journal and keeps the raw copy', () => {
    const s = storeWithJournal() as unknown as Record<string, unknown>;
    const journal = s.foodJournal as { entries: unknown[] };
    const raw = JSON.stringify({ ...s, foodJournal: { ...journal, entries: [...journal.entries, { id: 'x', date: 'hier' }] } });
    const storage = new MemoryStorage();
    storage.setItem(STORE_KEY, raw);
    const loaded = loadStore(storage, NOW);
    expect(loaded.status).toBe('recovered_partial');
    expect(loaded.store.foodJournal.entries).toHaveLength(2);
    expect(loaded.dropped).toEqual([{ path: 'foodJournal.entries.2', reason: 'invalid' }]);
    expect(storage.getItem(loaded.recoveryKey ?? '')).toBe(raw);
  });
});

describe('product cache and total deletion', () => {
  it('total local deletion removes the store, the journal and the product cache', () => {
    const storage = new MemoryStorage();
    saveStore(storage, storeWithJournal());
    putCachedProduct(storage, product('3017624010701', 539), NOW);
    storage.setItem('other-app', 'keep');
    expect(storage.getItem(PRODUCT_CACHE_KEY)).not.toBeNull();
    deleteAllData(storage);
    expect(storage.getItem(STORE_KEY)).toBeNull();
    expect(storage.getItem(PRODUCT_CACHE_KEY)).toBeNull();
    expect(loadStore(storage, NOW).store.foodJournal).toEqual(emptyFoodJournal());
    expect(storage.getItem('other-app')).toBe('keep');
  });

  it('is a bounded, most recently used usage cache, never part of the export', () => {
    const storage = new MemoryStorage();
    for (let i = 0; i < PRODUCT_CACHE_MAX + 20; i++) putCachedProduct(storage, product(String(10000000 + i), 100), NOW);
    const cached = readProductCache(storage);
    expect(cached).toHaveLength(PRODUCT_CACHE_MAX);
    expect(cached[0]?.product.barcode).toBe(String(10000000 + PRODUCT_CACHE_MAX + 19));
    putCachedProduct(storage, product('10000050', null), NOW);
    expect(readProductCache(storage)[0]?.product).toEqual(product('10000050', null));
    expect(exportStore(storeWithJournal(), NOW)).not.toContain('10000050');
    clearProductCache(storage);
    expect(getCachedProduct(storage, '10000050')).toBeNull();
  });

  it('treats an unreadable cache as empty', () => {
    const storage = new MemoryStorage();
    storage.setItem(PRODUCT_CACHE_KEY, '{broken');
    expect(readProductCache(storage)).toEqual([]);
    storage.setItem(PRODUCT_CACHE_KEY, JSON.stringify([{ product: { barcode: 1 }, fetchedAt: NOW }]));
    expect(readProductCache(storage)).toEqual([]);
  });
});
