import { useMemo, useRef } from 'react';
import { createOpenFoodFactsClient, normalizeBarcode } from '@/adapters/openFoodFacts';
import type { OffClient, OffLookupResult, OffSearchResult } from '@/adapters/openFoodFacts';
import { isFreshProduct, libraryFoodToProduct } from '@/domain/foodLibrary';
import type { LibraryFood } from '@/domain/types';
import { useWheighty } from '@/store/StoreProvider';

/** `fromLibrary`: ISO time the values were stored in "Mes aliments", when they come from there. */
export type ProductLookup = OffLookupResult & { fromLibrary?: string };

/**
 * Barcode lookup through "Mes aliments" (J-09): a fresh stored product is used without the network; a stale one
 * is refreshed, and still used when Open Food Facts cannot be reached. Storing a fetched product is the caller's job.
 */
export async function lookupWithLibrary(client: OffClient, library: readonly LibraryFood[], raw: string, nowIso: string, isEnabled: () => boolean): Promise<ProductLookup> {
  if (!isEnabled()) return { kind: 'disabled' };
  const barcode = normalizeBarcode(raw);
  if (!barcode) return { kind: 'invalid_input' };
  const stored = library.find((f) => f.source === 'off' && f.sourceId === barcode) ?? null;
  const storedProduct = stored ? libraryFoodToProduct(stored) : null;
  if (stored && storedProduct && isFreshProduct(stored, nowIso)) return { kind: 'found', product: storedProduct, fromLibrary: stored.savedAt };
  const result = await client.lookupBarcode(barcode);
  if (stored && storedProduct && (result.kind === 'offline' || result.kind === 'timeout' || result.kind === 'unavailable' || result.kind === 'rate_limited')) {
    return { kind: 'found', product: storedProduct, fromLibrary: stored.savedAt };
  }
  return result;
}

/** Open Food Facts access gated, on every call, by the product search opt-in. */
export function useOpenFoodFacts() {
  const { store, nowIso } = useWheighty();
  const enabled = store.preferences.productSearchEnabled;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const libraryRef = useRef(store.foodJournal.library);
  libraryRef.current = store.foodJournal.library;
  return useMemo(() => {
    const isEnabled = () => enabledRef.current;
    const client = createOpenFoodFactsClient({ isEnabled });
    return {
      lookup: (barcode: string): Promise<ProductLookup> => lookupWithLibrary(client, libraryRef.current, barcode, nowIso(), isEnabled),
      search: (terms: string): Promise<OffSearchResult> => client.searchProducts(terms),
    };
  }, [nowIso]);
}
