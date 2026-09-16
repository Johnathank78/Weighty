/**
 * Usage cache of the Open Food Facts products this user looked up (IMPLEMENTATION_NOTES J-03).
 * Bounded, local, never exported: it is not a redistributable subset of the database. Entries in
 * the journal do not depend on it (they keep their own snapshot). Removed by deleteAllData
 * through the "wheighty:" prefix, and on demand.
 */
import type { OffProduct } from '@/adapters/openFoodFacts';
import type { KeyValueStorage } from './storage';
import { isObject } from './schema';

export const PRODUCT_CACHE_KEY = 'wheighty:off-products';
export const PRODUCT_CACHE_MAX = 100;

export type CachedProduct = { product: OffProduct; fetchedAt: string };

const isNullableNumber = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);

function isCachedProduct(v: unknown): v is CachedProduct {
  if (!isObject(v) || typeof v.fetchedAt !== 'string' || !isObject(v.product)) return false;
  const p = v.product;
  if (typeof p.barcode !== 'string' || typeof p.name !== 'string' || typeof p.lastModified !== 'string') return false;
  if (p.brand !== undefined && typeof p.brand !== 'string') return false;
  if (p.per100g === null) return true;
  const n = p.per100g;
  return isObject(n) && typeof n.energyKcal === 'number' && Number.isFinite(n.energyKcal) && isNullableNumber(n.proteinG) && isNullableNumber(n.carbsG) && isNullableNumber(n.fatG);
}

/** Most recently used first. Unreadable content is treated as an empty cache (it is only a cache). */
export function readProductCache(storage: KeyValueStorage | null): CachedProduct[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(PRODUCT_CACHE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isCachedProduct) : [];
  } catch {
    return [];
  }
}

export function getCachedProduct(storage: KeyValueStorage | null, barcode: string): CachedProduct | null {
  return readProductCache(storage).find((c) => c.product.barcode === barcode) ?? null;
}

export function putCachedProduct(storage: KeyValueStorage | null, product: OffProduct, fetchedAt: string): void {
  if (!storage) return;
  const rest = readProductCache(storage).filter((c) => c.product.barcode !== product.barcode);
  const next = [{ product, fetchedAt }, ...rest].slice(0, PRODUCT_CACHE_MAX);
  try {
    storage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(next));
  } catch {
    // A full storage only loses the cache; the journal is saved independently.
  }
}

export function clearProductCache(storage: KeyValueStorage | null): void {
  storage?.removeItem(PRODUCT_CACHE_KEY);
}
