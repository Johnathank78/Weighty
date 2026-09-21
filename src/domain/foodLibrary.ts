/**
 * "Mes aliments" (IMPLEMENTATION_NOTES J-09): the user's food library inside the journal. Filled automatically
 * with the free entries the user named and the Open Food Facts products fetched for them, so they can be found
 * again offline. Pure functions; like the journal, never read by the engine. Journal entries keep their own
 * snapshot: updating or removing a library food never changes a logged day.
 */
import type { FoodNutrients, LibraryFood, WheightyStore } from './types';
import type { ManualFood, RecentFood, ResolvedFood } from './journal';
import { MANUAL_DEFAULT_NAME, recentFoods } from './journal';
import { normalizeForSearch } from './foodSearch';
import { isLibraryFood } from '@/persistence/schema';

export const LIBRARY_MAX = 500;
/** A stored product younger than this is reused without asking Open Food Facts again. */
export const LIBRARY_PRODUCT_FRESH_MS = 7 * 24 * 3600 * 1000;

/** Product values as the Open Food Facts adapter returns them (structural, no import of the network module). */
export type ProductRecord = {
  barcode: string;
  name: string;
  brand?: string;
  lastModified: string;
  per100g: FoodNutrients | null;
  servingGrams: number | null;
  packageGrams: number | null;
};

export const manualLibraryKey = (name: string) => `manual:${normalizeForSearch(name)}`;
export const productLibraryKey = (barcode: string) => `off:${barcode}`;

function withLibrary(store: WheightyStore, library: LibraryFood[]): WheightyStore {
  const bounded = library.length > LIBRARY_MAX ? [...library].sort((a, b) => (a.lastUsedAt < b.lastUsedAt ? 1 : a.lastUsedAt > b.lastUsedAt ? -1 : 0)).slice(0, LIBRARY_MAX) : library;
  return { ...store, foodJournal: { ...store.foodJournal, library: bounded } };
}

function upsert(store: WheightyStore, food: LibraryFood): WheightyStore {
  if (!isLibraryFood(food)) return store;
  const rest = store.foodJournal.library.filter((f) => f.key !== food.key);
  return withLibrary(store, [food, ...rest]);
}

/** Stores (or refreshes) a fetched product. Records without kcal are kept too: the user may still find them. */
export function rememberProduct(store: WheightyStore, product: ProductRecord, nowIso: string): WheightyStore {
  const key = productLibraryKey(product.barcode);
  const previous = store.foodJournal.library.find((f) => f.key === key);
  return upsert(store, {
    key,
    source: 'off',
    name: product.name,
    ...(product.brand ? { brand: product.brand } : {}),
    sourceId: product.barcode,
    sourceVersion: product.lastModified,
    per100g: product.per100g ? { ...product.per100g } : null,
    manual: null,
    servingGrams: product.servingGrams,
    packageGrams: product.packageGrams,
    savedAt: nowIso,
    lastUsedAt: previous?.lastUsedAt ?? nowIso,
  });
}

/** Stores a free entry the user named. Unnamed entries have nothing to be found by and are not stored. */
export function rememberManualFood(store: WheightyStore, food: ManualFood, nowIso: string): WheightyStore {
  const name = food.name.trim();
  if (!name || name === MANUAL_DEFAULT_NAME || !normalizeForSearch(name)) return store;
  return upsert(store, {
    key: manualLibraryKey(name),
    source: 'manual',
    name,
    sourceId: null,
    sourceVersion: null,
    per100g: null,
    manual: { intake: { ...food.intake }, grams: food.grams },
    servingGrams: null,
    packageGrams: null,
    savedAt: nowIso,
    lastUsedAt: nowIso,
  });
}

export function touchLibraryFood(store: WheightyStore, key: string, nowIso: string): WheightyStore {
  const found = store.foodJournal.library.find((f) => f.key === key);
  return found ? upsert(store, { ...found, lastUsedAt: nowIso }) : store;
}

export function removeLibraryFood(store: WheightyStore, key: string): WheightyStore {
  return withLibrary(store, store.foodJournal.library.filter((f) => f.key !== key));
}

export function clearLibrary(store: WheightyStore): WheightyStore {
  return withLibrary(store, []);
}

export function libraryProduct(store: WheightyStore, barcode: string): LibraryFood | null {
  return store.foodJournal.library.find((f) => f.key === productLibraryKey(barcode)) ?? null;
}

export function libraryFoodToProduct(food: LibraryFood): ProductRecord | null {
  if (food.source !== 'off' || food.sourceId === null) return null;
  return { barcode: food.sourceId, name: food.name, ...(food.brand ? { brand: food.brand } : {}), lastModified: food.sourceVersion ?? 'unknown', per100g: food.per100g, servingGrams: food.servingGrams, packageGrams: food.packageGrams };
}

/** A stored product becomes a loggable food with the values stored when it was fetched. */
export function libraryFoodToResolved(food: LibraryFood): ResolvedFood | null {
  if (food.source !== 'off' || food.sourceId === null || food.sourceVersion === null || food.per100g === null) return null;
  return {
    source: 'off',
    sourceId: food.sourceId,
    sourceVersion: food.sourceVersion,
    resolvedAt: food.savedAt,
    name: food.name,
    ...(food.brand ? { brand: food.brand } : {}),
    per100g: { ...food.per100g },
    ...(food.servingGrams !== null ? { servingGrams: food.servingGrams } : {}),
    ...(food.packageGrams !== null ? { packageGrams: food.packageGrams } : {}),
  };
}

export function libraryFoodToManual(food: LibraryFood): ManualFood | null {
  return food.source === 'manual' && food.manual ? { name: food.name, intake: { ...food.manual.intake }, grams: food.manual.grams } : null;
}

export const isFreshProduct = (food: LibraryFood, nowIso: string) => Date.parse(nowIso) - Date.parse(food.savedAt) < LIBRARY_PRODUCT_FRESH_MS;

/**
 * One list of everything already used (B5): the foods of the last journal entries and the products stored
 * automatically when they were scanned or fetched, merged and deduplicated, most recently used first.
 * Available offline. A food logged from the journal wins over its stored copy: it carries the values and
 * the portion actually used.
 */
export type PreviousFood = { key: string; usedAt: string } & ({ kind: 'recent'; food: RecentFood } | { kind: 'stored'; food: LibraryFood });

export function previousFoods(store: WheightyStore, limit = 12): PreviousFood[] {
  const out: PreviousFood[] = [];
  const seen = new Set<string>();
  for (const r of recentFoods(store, limit)) {
    // Journal keys already match the library ones for products (`off:<barcode>`); free entries are keyed
    // by their name so the same dish typed twice with different values is one row.
    const key = r.kind === 'manual' ? manualLibraryKey(r.food.name) : r.key;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, usedAt: r.lastEntry.loggedAt, kind: 'recent', food: r });
  }
  for (const f of store.foodJournal.library) {
    if (seen.has(f.key)) continue;
    // A stored product without values cannot be logged: it stays out of the list.
    if (f.source === 'off' && f.per100g === null) continue;
    seen.add(f.key);
    out.push({ key: f.key, usedAt: f.lastUsedAt, kind: 'stored', food: f });
  }
  return out.sort((a, b) => (a.usedAt < b.usedAt ? 1 : a.usedAt > b.usedAt ? -1 : 0)).slice(0, limit);
}
