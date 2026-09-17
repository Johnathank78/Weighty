/**
 * "Mes aliments" (J-09), timeline checkpoints per hour and on-screen masking (J-11), portions and unit weight (J-12).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { offProductToFood, parseOffProduct } from '@/adapters/openFoodFacts';
import {
  clearLibrary,
  isFreshProduct,
  LIBRARY_MAX,
  libraryFoodToManual,
  libraryFoodToResolved,
  libraryProduct,
  manualLibraryKey,
  rememberManualFood,
  rememberProduct,
  removeLibraryFood,
  touchLibraryFood,
} from '@/domain/foodLibrary';
import type { ProductRecord } from '@/domain/foodLibrary';
import { addFoodEntry, addPortion, hourGroups, intakeTotals, journalDay, maskedGaugeParts, MANUAL_DEFAULT_NAME, portionsFor } from '@/domain/journal';
import type { ResolvedFood } from '@/domain/journal';
import type { WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';

const NOW = '2026-09-17T08:00:00.000Z';
const product = (barcode: string, kcal: number | null, extra: Partial<ProductRecord> = {}): ProductRecord => ({
  barcode,
  name: `Produit ${barcode}`,
  lastModified: '1785948506',
  per100g: kcal === null ? null : { energyKcal: kcal, proteinG: 7, carbsG: 3, fatG: 0.2 },
  servingGrams: null,
  packageGrams: null,
  ...extra,
});
const APPLE: ResolvedFood = { source: 'ciqual', sourceId: '13050', sourceVersion: 'Ciqual 2025 (2025-11-03)', resolvedAt: NOW, name: 'Pomme, crue', per100g: { energyKcal: 53.6, proteinG: 0.25, carbsG: 11.6, fatG: 0.25 } };

function logAt(store: WheightyStore, consumedTime: string, grams = 100): WheightyStore {
  const r = addFoodEntry(store, { kind: 'resolved', date: '2026-09-17', localTime: '21:00', consumedTime, food: APPLE, grams }, NOW);
  if (!r.ok) throw new Error(r.reason);
  return r.store;
}

describe('"Mes aliments": automatic storage (J-09)', () => {
  it('stores fetched products, including those without kcal, and refreshes them in place', () => {
    let s = rememberProduct(emptyStore(), product('3033490004743', 47.9, { servingGrams: 140, packageGrams: 140 }), NOW);
    s = rememberProduct(s, product('5000000000001', null), NOW);
    expect(s.foodJournal.library.map((f) => f.key)).toEqual(['off:5000000000001', 'off:3033490004743']);
    const later = '2026-10-01T08:00:00.000Z';
    s = rememberProduct(s, product('3033490004743', 52), later);
    expect(s.foodJournal.library).toHaveLength(2);
    expect(libraryProduct(s, '3033490004743')).toMatchObject({ savedAt: later, per100g: { energyKcal: 52 }, lastUsedAt: NOW });
  });

  it('stores named free entries, keyed by their name without case or accents; unnamed ones are not stored', () => {
    const food = { name: '  Gratin de Mamie ', intake: { energyKcal: 420, proteinG: 18, carbsG: null, fatG: 20 }, grams: 250 };
    let s = rememberManualFood(emptyStore(), food, NOW);
    s = rememberManualFood(s, { ...food, name: 'GRATIN de mamie', intake: { ...food.intake, energyKcal: 400 } }, NOW);
    expect(s.foodJournal.library).toHaveLength(1);
    expect(s.foodJournal.library[0]).toMatchObject({ key: manualLibraryKey('gratin de mamie'), name: 'GRATIN de mamie', manual: { intake: { energyKcal: 400 }, grams: 250 } });
    expect(rememberManualFood(emptyStore(), { ...food, name: '' }, NOW).foodJournal.library).toEqual([]);
    expect(rememberManualFood(emptyStore(), { ...food, name: MANUAL_DEFAULT_NAME }, NOW).foodJournal.library).toEqual([]);
    expect(rememberManualFood(emptyStore(), { ...food, name: '!!!' }, NOW).foodJournal.library).toEqual([]);
  });

  it('reuses stored values as they were stored, and a later refresh never changes a logged day', () => {
    let s = rememberProduct(emptyStore(), product('3033490004743', 47.9, { servingGrams: 140 }), NOW);
    const stored = libraryProduct(s, '3033490004743');
    if (!stored) throw new Error('stored');
    const food = libraryFoodToResolved(stored);
    expect(food).toEqual({ source: 'off', sourceId: '3033490004743', sourceVersion: '1785948506', resolvedAt: NOW, name: 'Produit 3033490004743', per100g: { energyKcal: 47.9, proteinG: 7, carbsG: 3, fatG: 0.2 }, servingGrams: 140 });
    if (!food) return;
    const r = addFoodEntry(s, { kind: 'resolved', date: '2026-09-17', localTime: '08:00', food, grams: 140 }, NOW);
    if (!r.ok) throw new Error(r.reason);
    s = r.store;
    const day = journalDay(s, '2026-09-17');
    s = rememberProduct(s, product('3033490004743', 80), '2026-12-01T08:00:00.000Z');
    expect(journalDay(s, '2026-09-17')).toEqual(day);
    s = clearLibrary(s);
    expect(journalDay(s, '2026-09-17')).toEqual(day);
    expect(libraryFoodToResolved({ ...stored, per100g: null })).toBeNull();
  });

  it('free entries come back as editable manual values', () => {
    const s = rememberManualFood(emptyStore(), { name: 'Soupe', intake: { energyKcal: 180, proteinG: null, carbsG: null, fatG: null }, grams: null }, NOW);
    const stored = s.foodJournal.library[0];
    if (!stored) throw new Error('stored');
    expect(libraryFoodToManual(stored)).toEqual({ name: 'Soupe', intake: { energyKcal: 180, proteinG: null, carbsG: null, fatG: null }, grams: null });
    expect(libraryFoodToResolved(stored)).toBeNull();
  });

  it('is bounded: beyond the limit, the least recently used foods leave first', () => {
    let s = emptyStore();
    const at = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString();
    for (let i = 0; i < LIBRARY_MAX; i++) s = rememberProduct(s, product(String(10000000 + i), 100), at(i));
    // The oldest food is used again, so it is no longer the least recently used one.
    s = touchLibraryFood(s, 'off:10000000', at(LIBRARY_MAX));
    for (let i = LIBRARY_MAX; i < LIBRARY_MAX + 5; i++) s = rememberProduct(s, product(String(10000000 + i), 100), at(i + 1));
    s = rememberProduct(s, product('20000000', 100), at(LIBRARY_MAX + 10));
    const keys = s.foodJournal.library.map((f) => f.key);
    expect(keys).toHaveLength(LIBRARY_MAX);
    expect(keys).toContain('off:10000000');
    expect(keys).toContain('off:20000000');
    expect(keys).not.toContain('off:10000001');
    expect(removeLibraryFood(s, 'off:20000000').foodJournal.library).toHaveLength(LIBRARY_MAX - 1);
  });

  it('freshness of a stored product follows its save date', () => {
    const s = rememberProduct(emptyStore(), product('3033490004743', 47.9), NOW);
    const stored = libraryProduct(s, '3033490004743');
    if (!stored) throw new Error('stored');
    expect(isFreshProduct(stored, '2026-09-20T08:00:00.000Z')).toBe(true);
    expect(isFreshProduct(stored, '2026-09-30T08:00:00.000Z')).toBe(false);
  });

  it('the journal screen stores products on fetch and named free entries on save', () => {
    const src = readFileSync('src/screens/Journal.tsx', 'utf8');
    expect(src).toMatch(/rememberProduct\(/);
    expect(src).toMatch(/rememberManualFood\(/);
    expect(readFileSync('src/store/StoreProvider.tsx', 'utf8')).toMatch(/foodJournal: emptyFoodJournal\(\)/);
  });
});

describe('timeline checkpoints per hour (J-11)', () => {
  it('puts every entry of the same hour under one checkpoint, in day order', () => {
    let s = emptyStore();
    for (const t of ['12:40', '08:05', '12:05', '12:59', '13:00', '08:50']) s = logAt(s, t);
    const groups = hourGroups(journalDay(s, '2026-09-17').entries);
    expect(groups.map((g) => [g.hour, g.entries.map((e) => e.consumedTime)])).toEqual([
      ['08', ['08:05', '08:50']],
      ['12', ['12:05', '12:40', '12:59']],
      ['13', ['13:00']],
    ]);
    expect(hourGroups([])).toEqual([]);
  });
});

describe('masking entries on screen (J-11)', () => {
  it('splits a gauge into a visible part and a masked part, never beyond the bar', () => {
    const split = maskedGaugeParts(500, 800, 2000);
    expect(split.visible).toBe(0.25);
    expect(split.masked).toBeCloseTo(0.15, 10);
    expect(maskedGaugeParts(800, 800, 2000)).toEqual({ visible: 0.4, masked: 0 });
    expect(maskedGaugeParts(1500, 2600, 2000)).toEqual({ visible: 0.75, masked: 0.25 });
    expect(maskedGaugeParts(2100, 2600, 2000)).toEqual({ visible: 1, masked: 0 });
    expect(maskedGaugeParts(0, 300, 0)).toEqual({ visible: 0, masked: 0 });
  });

  it('visible totals exclude masked entries without touching the stored day', () => {
    const s = logAt(logAt(emptyStore(), '08:00', 200), '12:00', 100);
    const day = journalDay(s, '2026-09-17');
    const [first] = day.entries;
    if (!first) throw new Error('entry');
    const visible = intakeTotals(day.entries.filter((e) => e.id !== first.id));
    expect(visible.energyKcal).toBe(53.6);
    expect(journalDay(s, '2026-09-17')).toEqual(day);
  });

  it('masking is screen state only: never stored, reset when the journal is left', () => {
    const src = readFileSync('src/screens/Journal.tsx', 'utf8');
    expect(src).toMatch(/const \[hidden, setHidden\] = useState/);
    for (const f of ['src/domain/types.ts', 'src/persistence/schema.ts', 'src/domain/journal.ts', 'src/store/StoreProvider.tsx']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/hidden|masked(Ids|Entries)/i);
    }
    const css = readFileSync('src/styles/app.css', 'utf8');
    expect(css).toMatch(/\.progress__masked \{[^}]*repeating-linear-gradient/);
  });
});

describe('portions and unit weight (J-12)', () => {
  it('Open Food Facts serving and package weights reach the food as suggestions', () => {
    const p = parseOffProduct({ code: '3033490004743', product_name: 'Skyr', nutriments: { 'energy-kcal_100g': 47.9 }, serving_quantity: 140, serving_quantity_unit: 'g', product_quantity: 450, product_quantity_unit: 'g' });
    if (!p) throw new Error('parse');
    expect(offProductToFood(p, NOW)).toMatchObject({ servingGrams: 140, packageGrams: 450 });
    const stored = libraryProduct(rememberProduct(emptyStore(), p, NOW), '3033490004743');
    expect(stored && libraryFoodToResolved(stored)).toMatchObject({ servingGrams: 140, packageGrams: 450 });
  });

  it('a unit weight typed once for a Ciqual food is remembered for that food only', () => {
    const r = addPortion(emptyStore(), { label: '1 unité', grams: 60, foodKey: 'ciqual:22000' }, NOW);
    if (!r.ok) throw new Error(r.reason);
    expect(portionsFor(r.store, 'ciqual:22000')).toMatchObject([{ label: '1 unité', grams: 60 }]);
    expect(portionsFor(r.store, 'ciqual:13050')).toEqual([]);
    const src = readFileSync('src/screens/Journal.tsx', 'utf8');
    expect(src).toMatch(/knowsUnit/);
  });
});
