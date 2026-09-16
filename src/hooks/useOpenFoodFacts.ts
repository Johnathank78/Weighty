import { useMemo, useRef } from 'react';
import { createOpenFoodFactsClient, normalizeBarcode } from '@/adapters/openFoodFacts';
import type { OffClient, OffLookupResult, OffSearchResult } from '@/adapters/openFoodFacts';
import { getCachedProduct, putCachedProduct } from '@/persistence/productCache';
import type { KeyValueStorage } from '@/persistence/storage';
import { useWheighty } from '@/store/StoreProvider';

/** A cached product younger than this is reused without asking the network again. */
const CACHE_FRESH_MS = 7 * 24 * 3600 * 1000;

export type ProductLookup = OffLookupResult & { fromCache?: string };

/** Barcode lookup through the usage cache: fresh cache first, stale cache when the network fails. */
export async function lookupWithCache(client: OffClient, storage: KeyValueStorage | null, raw: string, nowIso: string, isEnabled: () => boolean): Promise<ProductLookup> {
  if (!isEnabled()) return { kind: 'disabled' };
  const barcode = normalizeBarcode(raw);
  if (!barcode) return { kind: 'invalid_input' };
  const cached = getCachedProduct(storage, barcode);
  if (cached && Date.parse(nowIso) - Date.parse(cached.fetchedAt) < CACHE_FRESH_MS) return { kind: 'found', product: cached.product, fromCache: cached.fetchedAt };
  const result = await client.lookupBarcode(barcode);
  if (result.kind === 'found') putCachedProduct(storage, result.product, nowIso);
  else if (cached && (result.kind === 'offline' || result.kind === 'timeout' || result.kind === 'unavailable' || result.kind === 'rate_limited')) {
    return { kind: 'found', product: cached.product, fromCache: cached.fetchedAt };
  }
  return result;
}

/** Open Food Facts access gated, on every call, by the product search opt-in. */
export function useOpenFoodFacts() {
  const { store, storage, nowIso } = useWheighty();
  const enabled = store.preferences.productSearchEnabled;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  return useMemo(() => {
    const isEnabled = () => enabledRef.current;
    const client = createOpenFoodFactsClient({ isEnabled });
    return {
      lookup: (barcode: string): Promise<ProductLookup> => lookupWithCache(client, storage, barcode, nowIso(), isEnabled),
      search: (terms: string): Promise<OffSearchResult> => client.searchProducts(terms),
    };
  }, [storage, nowIso]);
}
