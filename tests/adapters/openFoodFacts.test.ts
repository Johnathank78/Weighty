/**
 * Open Food Facts adapter (J-03): opt-in gate, request content, degradation (offline, timeout,
 * not found, incomplete record, rate limit) and the usage cache. No real network is used.
 */
import { describe, expect, it, vi } from 'vitest';
import { createOpenFoodFactsClient, normalizeBarcode, OFF_APP_ID, OFF_HOST, OFF_RATE_LIMITS, offProductToFood, parseOffProduct } from '@/adapters/openFoodFacts';
import type { OffClientOptions } from '@/adapters/openFoodFacts';
import { lookupWithCache } from '@/hooks/useOpenFoodFacts';
import { getCachedProduct, putCachedProduct } from '@/persistence/productCache';
import { MemoryStorage } from '@/persistence/storage';

const NOW = '2026-09-16T08:00:00.000Z';
const NUTELLA = { code: '3017624010701', product_name: 'Nutella', brands: 'Ferrero, Other', last_modified_t: 1785948506, nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 } };

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function client(fetchImpl: unknown, extra: Partial<Pick<OffClientOptions, 'isOnline' | 'now' | 'timeoutMs'>> = {}) {
  return createOpenFoodFactsClient({ isEnabled: () => true, isOnline: () => true, fetchImpl: fetchImpl as typeof fetch, ...extra });
}

describe('opt-in gate: nothing is sent while product search is off', () => {
  it('never calls the network when disabled, for barcodes, searches and the cached lookup', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { status: 'success', product: NUTELLA }));
    const off = createOpenFoodFactsClient({ isEnabled: () => false, isOnline: () => true, fetchImpl });
    expect(await off.lookupBarcode('3017624010701')).toEqual({ kind: 'disabled' });
    expect(await off.searchProducts('nutella')).toEqual({ kind: 'disabled' });
    const storage = new MemoryStorage();
    expect(await lookupWithCache(off, storage, '3017624010701', NOW, () => false)).toEqual({ kind: 'disabled' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reads the opt-in on every call', async () => {
    let enabled = true;
    const fetchImpl = vi.fn(async () => jsonResponse(200, { status: 'success', product: NUTELLA }));
    const off = createOpenFoodFactsClient({ isEnabled: () => enabled, isOnline: () => true, fetchImpl });
    expect((await off.lookupBarcode('3017624010701')).kind).toBe('found');
    enabled = false;
    expect((await off.lookupBarcode('3017624010701')).kind).toBe('disabled');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('request content: a barcode or search terms, nothing else', () => {
  it('barcode lookup sends only the barcode, no credentials, no referrer, the app identification', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse(200, { status: 'success', product: NUTELLA }));
    await client(fetchImpl).lookupBarcode(' 3017624010701 ');
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    const u = new URL(String(url));
    expect(u.origin).toBe(OFF_HOST);
    expect(u.pathname).toBe('/api/v3/product/3017624010701');
    expect([...u.searchParams.keys()]).toEqual(['fields']);
    expect(init).toMatchObject({ method: 'GET', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
    expect(init?.headers).toEqual({ Accept: 'application/json', 'X-User-Agent': OFF_APP_ID });
    expect(OFF_APP_ID).toMatch(/^Wheighty\/\d+\.\d+\.\d+ \(/);
    expect(init?.body).toBeUndefined();
  });

  it('search sends the terms and fixed parameters only', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse(200, { count: 1, products: [NUTELLA] }));
    const r = await client(fetchImpl).searchProducts('  pâte   à tartiner ');
    expect(r.kind).toBe('results');
    const u = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(u.origin + u.pathname).toBe(`${OFF_HOST}/cgi/search.pl`);
    expect(u.searchParams.get('search_terms')).toBe('pâte à tartiner');
    expect([...u.searchParams.keys()].sort()).toEqual(['action', 'fields', 'json', 'page_size', 'search_simple', 'search_terms', 'sort_by']);
  });

  it('rejects invalid input locally', async () => {
    const fetchImpl = vi.fn();
    const off = client(fetchImpl);
    expect(await off.lookupBarcode('12ab')).toEqual({ kind: 'invalid_input' });
    expect(await off.lookupBarcode('123456789')).toEqual({ kind: 'invalid_input' });
    expect(await off.searchProducts('a')).toEqual({ kind: 'invalid_input' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(normalizeBarcode('3017-6240 10701')).toBe('3017624010701');
    expect(normalizeBarcode('12345670')).toBe('12345670');
  });
});

describe('degradation', () => {
  it('offline: no request at all', async () => {
    const fetchImpl = vi.fn();
    const off = client(fetchImpl, { isOnline: () => false });
    expect(await off.lookupBarcode('3017624010701')).toEqual({ kind: 'offline' });
    expect(await off.searchProducts('nutella')).toEqual({ kind: 'offline' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('network failure: offline when the connection dropped, unavailable otherwise (CORS, DNS)', async () => {
    let online = true;
    const fetchImpl = vi.fn(async () => {
      online = false;
      throw new TypeError('Failed to fetch');
    });
    expect(await client(fetchImpl, { isOnline: () => online }).lookupBarcode('3017624010701')).toEqual({ kind: 'offline' });
    const failing = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await client(failing).searchProducts('nutella')).toEqual({ kind: 'unavailable' });
  });

  it('timeout: the request is aborted and reported, never left pending', async () => {
    const fetchImpl = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    expect(await client(fetchImpl, { timeoutMs: 20 }).lookupBarcode('3017624010701')).toEqual({ kind: 'timeout' });
  });

  it('product not found (v3 404 with failure body, or empty body)', async () => {
    const body = { status: 'failure', result: { id: 'product_not_found' }, errors: [{ message: { id: 'product_not_found' } }] };
    expect(await client(async () => jsonResponse(404, body)).lookupBarcode('3017624010701')).toEqual({ kind: 'not_found' });
    expect(await client(async () => new Response('not json', { status: 404 })).lookupBarcode('3017624010701')).toEqual({ kind: 'not_found' });
    expect(await client(async () => jsonResponse(200, { products: [] })).searchProducts('xyz')).toEqual({ kind: 'results', products: [] });
  });

  it('missing nutrients are a normal case: no kcal means not loggable as is', async () => {
    const noKcal = { code: '5000000000001', product_name: 'Mystère', last_modified_t: 1, nutriments: { proteins_100g: 3 } };
    const r = await client(async () => jsonResponse(200, { status: 'success_with_warnings', product: noKcal })).lookupBarcode('5000000000001');
    expect(r.kind).toBe('found');
    if (r.kind !== 'found') return;
    expect(r.product.per100g).toBeNull();
    expect(offProductToFood(r.product, NOW)).toBeNull();

    const partial = parseOffProduct({ code: '5000000000002', nutriments: { 'energy-kcal_100g': '120', fat_100g: -1 } });
    expect(partial).toEqual({ barcode: '5000000000002', name: 'Produit 5000000000002', lastModified: 'unknown', per100g: { energyKcal: 120, proteinG: null, carbsG: null, fatG: null } });
    expect(parseOffProduct({ code: '5000000000003', nutriments: { 'energy-kcal_100g': 4000 } })?.per100g).toBeNull();
    expect(parseOffProduct('garbage')).toBeNull();
    expect(parseOffProduct({ product_name: 'no code' })).toBeNull();
  });

  it('a found product becomes a traceable food snapshot', async () => {
    const r = await client(async () => jsonResponse(200, { status: 'success', product: NUTELLA })).lookupBarcode('3017624010701');
    if (r.kind !== 'found') throw new Error(r.kind);
    expect(offProductToFood(r.product, NOW)).toEqual({ source: 'off', sourceId: '3017624010701', sourceVersion: '1785948506', resolvedAt: NOW, name: 'Nutella', brand: 'Ferrero', per100g: { energyKcal: 539, proteinG: 6.3, carbsG: 57.5, fatG: 30.9 } });
  });

  it('server rate limit (429 with Retry-After, 503) and malformed responses', async () => {
    expect(await client(async () => jsonResponse(429, {}, { 'Retry-After': '42' })).lookupBarcode('3017624010701')).toEqual({ kind: 'rate_limited', retryAfterSec: 42 });
    expect(await client(async () => new Response('<html>', { status: 503 })).searchProducts('nutella')).toEqual({ kind: 'rate_limited', retryAfterSec: 60 });
    expect(await client(async () => new Response('<html>', { status: 200 })).searchProducts('nutella')).toEqual({ kind: 'unavailable' });
    expect(await client(async () => jsonResponse(500, { status: 'failure' })).lookupBarcode('3017624010701')).toEqual({ kind: 'unavailable' });
  });

  it('client-side limit follows the documented rates and refuses before sending', async () => {
    let t = 1_000_000;
    const fetchImpl = vi.fn(async () => jsonResponse(200, { products: [] }));
    const off = client(fetchImpl, { now: () => t });
    for (let i = 0; i < OFF_RATE_LIMITS.search; i++) expect((await off.searchProducts('nutella')).kind).toBe('results');
    const limited = await off.searchProducts('nutella');
    expect(limited.kind).toBe('rate_limited');
    expect(fetchImpl).toHaveBeenCalledTimes(OFF_RATE_LIMITS.search);
    // Barcode lookups have their own budget.
    fetchImpl.mockImplementation(async () => jsonResponse(200, { status: 'success', product: NUTELLA }));
    expect((await off.lookupBarcode('3017624010701')).kind).toBe('found');
    t += 60_000;
    fetchImpl.mockImplementation(async () => jsonResponse(200, { products: [] }));
    expect((await off.searchProducts('nutella')).kind).toBe('results');
    expect(OFF_RATE_LIMITS).toEqual({ product: 15, search: 10 });
  });
});

describe('usage cache', () => {
  it('stores found products, reuses a fresh copy without the network, falls back to a stale copy offline', async () => {
    const storage = new MemoryStorage();
    const fetchImpl = vi.fn(async () => jsonResponse(200, { status: 'success', product: NUTELLA }));
    let online = true;
    const off = client(fetchImpl, { isOnline: () => online });
    const first = await lookupWithCache(off, storage, '3017624010701', NOW, () => true);
    expect(first.kind).toBe('found');
    expect(getCachedProduct(storage, '3017624010701')?.fetchedAt).toBe(NOW);

    const again = await lookupWithCache(off, storage, '3017624010701', '2026-09-18T08:00:00.000Z', () => true);
    expect(again).toMatchObject({ kind: 'found', fromCache: NOW });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    online = false;
    const stale = await lookupWithCache(off, storage, '3017624010701', '2026-12-01T08:00:00.000Z', () => true);
    expect(stale).toMatchObject({ kind: 'found', fromCache: NOW });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await lookupWithCache(off, storage, '5000000000001', NOW, () => true)).toEqual({ kind: 'offline' });
  });

  it('a not found answer is not cached', async () => {
    const storage = new MemoryStorage();
    putCachedProduct(storage, { barcode: '1', name: 'x', lastModified: '1', per100g: null }, NOW);
    const off = client(async () => jsonResponse(404, { status: 'failure', result: { id: 'product_not_found' } }));
    expect(await lookupWithCache(off, storage, '5000000000001', NOW, () => true)).toEqual({ kind: 'not_found' });
    expect(getCachedProduct(storage, '5000000000001')).toBeNull();
  });
});
