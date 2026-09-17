/**
 * Open Food Facts adapter (IMPLEMENTATION_NOTES J-03). THE ONLY MODULE ALLOWED TO USE THE NETWORK
 * (tests/policy/static.test.ts). It never reads the store: a request carries a barcode or a search
 * term and nothing else, no identifier, no cookie, no referrer.
 *
 * Contract checked against the official documentation in force (openfoodfacts.github.io/openfoodfacts-server/api,
 * consulted 2026-09-16):
 * - product by barcode: GET /api/v3/product/{barcode} (v3 is the version recommended for new integrations),
 *   limit 15 requests per minute per IP;
 * - text search: GET /cgi/search.pl (search_terms, json=1), limit 10 requests per minute per IP, not for
 *   search-as-you-type. Search-a-licious is not used: its responses carry no CORS header for browser origins;
 * - apps identify themselves as "AppName/Version (contact)". Browsers do not let a page set User-Agent, so the
 *   value goes in X-User-Agent, which the API explicitly allows in its CORS headers.
 * Nutrients are read from the per 100 g fields only. Images are never requested.
 */
import type { FoodNutrients } from '@/domain/types';
import type { ResolvedFood } from '@/domain/journal';

export const OFF_HOST = 'https://world.openfoodfacts.org';
export const OFF_APP_ID = 'Wheighty/1.0.0 (https://github.com/Johnathank78/Weighty)';
/** Documented limits (requests per minute per IP address). */
export const OFF_RATE_LIMITS = { product: 15, search: 10 } as const;
export const OFF_TIMEOUT_MS = 8000;
const WINDOW_MS = 60_000;
const PRODUCT_FIELDS = 'code,product_name,product_name_fr,brands,nutriments,last_modified_t,serving_quantity,serving_quantity_unit,product_quantity,product_quantity_unit';

export type OffProduct = {
  barcode: string;
  name: string;
  brand?: string;
  /** last_modified_t of the record, as a string (traceability of the snapshot). */
  lastModified: string;
  /** Null when the energy in kcal per 100 g is missing or implausible: the product cannot be logged as is. */
  per100g: FoodNutrients | null;
  /**
   * Serving and package weight announced by the record, in grams. Collaborative data of uneven quality:
   * offered as suggestions only. Null when absent, not in grams (ml is not converted) or implausible.
   */
  servingGrams: number | null;
  packageGrams: number | null;
};

export type OffFailure =
  | { kind: 'disabled' }
  | { kind: 'invalid_input' }
  | { kind: 'offline' }
  | { kind: 'timeout' }
  | { kind: 'rate_limited'; retryAfterSec: number }
  | { kind: 'unavailable' };

export type OffLookupResult = { kind: 'found'; product: OffProduct } | { kind: 'not_found' } | OffFailure;
export type OffSearchResult = { kind: 'results'; products: OffProduct[] } | OffFailure;

export type OffClientOptions = {
  /** Read on every call: when it returns false, nothing is sent. */
  isEnabled: () => boolean;
  fetchImpl?: typeof fetch;
  isOnline?: () => boolean;
  now?: () => number;
  timeoutMs?: number;
};

export type OffClient = {
  lookupBarcode: (barcode: string) => Promise<OffLookupResult>;
  searchProducts: (terms: string) => Promise<OffSearchResult>;
};

/** EAN-8, UPC-A, EAN-13 or GTIN-14, digits only. */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '');
  return /^\d{8}$|^\d{12,14}$/.test(digits) ? digits : null;
}

export function normalizeSearchTerms(raw: string): string | null {
  const t = raw.replace(/\s+/g, ' ').trim();
  return t.length >= 2 && t.length <= 80 ? t : null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** A weight in grams between 1 g and 5 kg; the unit must be grams (absent unit is read as grams, the API default). */
function gramsField(quantity: unknown, unit: unknown): number | null {
  const n = num(quantity);
  const u = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
  if (n === null || (u !== '' && u !== 'g')) return null;
  return n >= 1 && n <= 5000 ? Math.round(n * 10) / 10 : null;
}

/** Maps a raw product record. Missing fields are a normal case, not an error. */
export function parseOffProduct(raw: unknown, fallbackBarcode = ''): OffProduct | null {
  if (!isRecord(raw)) return null;
  const barcode = text(raw.code) || fallbackBarcode;
  if (!barcode) return null;
  const nutriments = isRecord(raw.nutriments) ? raw.nutriments : {};
  const kcal = num(nutriments['energy-kcal_100g']);
  const macro = (key: string) => {
    const v = num(nutriments[key]);
    return v !== null && v >= 0 && v <= 100 ? Math.round(v * 100) / 100 : null;
  };
  const per100g = kcal !== null && kcal >= 0 && kcal <= 950 ? { energyKcal: Math.round(kcal * 100) / 100, proteinG: macro('proteins_100g'), carbsG: macro('carbohydrates_100g'), fatG: macro('fat_100g') } : null;
  const brand = text(raw.brands).split(',')[0]?.trim() ?? '';
  const name = (text(raw.product_name_fr) || text(raw.product_name)).slice(0, 200);
  const modified = num(raw.last_modified_t);
  return {
    barcode,
    name: name || `Produit ${barcode}`,
    ...(brand ? { brand: brand.slice(0, 200) } : {}),
    lastModified: modified === null ? 'unknown' : String(Math.trunc(modified)),
    per100g,
    servingGrams: gramsField(raw.serving_quantity, raw.serving_quantity_unit),
    packageGrams: gramsField(raw.product_quantity, raw.product_quantity_unit),
  };
}

/** A product becomes a loggable food only with its energy in kcal; the snapshot keeps the record version. */
export function offProductToFood(product: OffProduct, resolvedAt: string): ResolvedFood | null {
  if (!product.per100g) return null;
  return {
    source: 'off',
    sourceId: product.barcode,
    sourceVersion: product.lastModified,
    resolvedAt,
    name: product.name,
    ...(product.brand ? { brand: product.brand } : {}),
    per100g: { ...product.per100g },
    ...(product.servingGrams !== null ? { servingGrams: product.servingGrams } : {}),
    ...(product.packageGrams !== null ? { packageGrams: product.packageGrams } : {}),
  };
}

export function createOpenFoodFactsClient(options: OffClientOptions): OffClient {
  const fetchImpl = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  const isOnline = options.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const now = options.now ?? (() => Date.now());
  const timeoutMs = options.timeoutMs ?? OFF_TIMEOUT_MS;
  const sent: Record<keyof typeof OFF_RATE_LIMITS, number[]> = { product: [], search: [] };

  async function request(bucket: keyof typeof OFF_RATE_LIMITS, url: string): Promise<{ status: number; body: unknown } | OffFailure> {
    if (!options.isEnabled()) return { kind: 'disabled' };
    if (!isOnline()) return { kind: 'offline' };
    const t = now();
    const recent = sent[bucket].filter((s) => t - s < WINDOW_MS);
    sent[bucket] = recent;
    if (recent.length >= OFF_RATE_LIMITS[bucket]) {
      return { kind: 'rate_limited', retryAfterSec: Math.max(1, Math.ceil((WINDOW_MS - (t - (recent[0] as number))) / 1000)) };
    }
    recent.push(t);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: { Accept: 'application/json', 'X-User-Agent': OFF_APP_ID },
        signal: controller.signal,
      });
      if (response.status === 429 || response.status === 503) {
        const retry = num(response.headers.get('Retry-After'));
        return { kind: 'rate_limited', retryAfterSec: retry !== null && retry > 0 ? Math.ceil(retry) : 60 };
      }
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        return response.status === 404 ? { status: 404, body: null } : { kind: 'unavailable' };
      }
      return { status: response.status, body };
    } catch {
      if (controller.signal.aborted) return { kind: 'timeout' };
      return isOnline() ? { kind: 'unavailable' } : { kind: 'offline' };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async lookupBarcode(raw) {
      if (!options.isEnabled()) return { kind: 'disabled' };
      const barcode = normalizeBarcode(raw);
      if (!barcode) return { kind: 'invalid_input' };
      const r = await request('product', `${OFF_HOST}/api/v3/product/${barcode}?fields=${PRODUCT_FIELDS}`);
      if ('kind' in r) return r;
      const body = isRecord(r.body) ? r.body : {};
      const resultId = isRecord(body.result) ? body.result.id : undefined;
      if (r.status === 404 || resultId === 'product_not_found') return { kind: 'not_found' };
      if (r.status !== 200 || (body.status !== 'success' && body.status !== 'success_with_warnings')) return { kind: 'unavailable' };
      const product = parseOffProduct(body.product, barcode);
      return product ? { kind: 'found', product } : { kind: 'not_found' };
    },
    async searchProducts(raw) {
      if (!options.isEnabled()) return { kind: 'disabled' };
      const terms = normalizeSearchTerms(raw);
      if (!terms) return { kind: 'invalid_input' };
      const params = new URLSearchParams({ search_terms: terms, search_simple: '1', action: 'process', json: '1', page_size: '20', sort_by: 'unique_scans_n', fields: PRODUCT_FIELDS });
      const r = await request('search', `${OFF_HOST}/cgi/search.pl?${params.toString()}`);
      if ('kind' in r) return r;
      if (r.status !== 200 || !isRecord(r.body) || !Array.isArray(r.body.products)) return { kind: 'unavailable' };
      const products = r.body.products.map((p) => parseOffProduct(p)).filter((p): p is OffProduct => p !== null);
      return { kind: 'results', products };
    },
  };
}
