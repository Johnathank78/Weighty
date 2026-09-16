/**
 * Local food search and the embedded Ciqual table (IMPLEMENTATION_NOTES J-02).
 * The table ships in its own lazily imported chunk, precached by the service worker: loading it
 * never touches the network at runtime and does not weigh on the first screen.
 */
import type { ResolvedFood } from './journal';

export type CiqualFood = {
  code: number;
  name: string;
  group: string;
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

export type CiqualTable = { version: string; doi: string; license: string; foods: CiqualFood[] };

type CiqualJson = {
  table: string;
  doi: string;
  license: string;
  groups: string[];
  foods: Array<[number, string, number, number, number | null, number | null, number | null]>;
};

/** Lower case, no accents, ligatures expanded, punctuation as spaces. */
export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export type SearchIndex<T> = { items: T[]; names: string[]; words: string[][] };

export function buildSearchIndex<T>(items: T[], nameOf: (item: T) => string): SearchIndex<T> {
  const names = items.map((i) => normalizeForSearch(nameOf(i)));
  return { items, names, words: names.map((n) => n.split(' ')) };
}

/**
 * Every query word must start a word of the name. Ranking: name starting with the query,
 * then earliest first match, then shorter names. Insensitive to case and accents.
 */
export function searchIndex<T>(index: SearchIndex<T>, query: string, limit = 30): T[] {
  const q = normalizeForSearch(query);
  if (q.length === 0) return [];
  const terms = q.split(' ');
  const hits: Array<{ i: number; score: number }> = [];
  index.words.forEach((words, i) => {
    let first = Number.POSITIVE_INFINITY;
    for (const t of terms) {
      const at = words.findIndex((w) => w.startsWith(t));
      if (at < 0) return;
      first = Math.min(first, at);
    }
    const name = index.names[i] as string;
    const score = (name.startsWith(q) ? 0 : 1000) + first * 100 + name.length;
    hits.push({ i, score });
  });
  hits.sort((a, b) => a.score - b.score || a.i - b.i);
  return hits.slice(0, limit).map((h) => index.items[h.i] as T);
}

export function parseCiqualTable(json: CiqualJson): CiqualTable {
  return {
    version: json.table,
    doi: json.doi,
    license: json.license,
    foods: json.foods.map(([code, name, group, kcal, proteinG, carbsG, fatG]) => ({ code, name, group: json.groups[group] ?? '', kcal, proteinG, carbsG, fatG })),
  };
}

let tablePromise: Promise<{ table: CiqualTable; index: SearchIndex<CiqualFood> }> | null = null;

/** Loads the embedded table once (local chunk, no runtime fetch). */
export function loadCiqual(): Promise<{ table: CiqualTable; index: SearchIndex<CiqualFood> }> {
  tablePromise ??= import('@/data/ciqual.json').then((m) => {
    const table = parseCiqualTable(m.default as unknown as CiqualJson);
    return { table, index: buildSearchIndex(table.foods, (f) => f.name) };
  });
  return tablePromise;
}

export function resolveCiqualFood(food: CiqualFood, table: Pick<CiqualTable, 'version'>, nowIso: string): ResolvedFood {
  return {
    source: 'ciqual',
    sourceId: String(food.code),
    sourceVersion: table.version,
    resolvedAt: nowIso,
    name: food.name,
    per100g: { energyKcal: food.kcal, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG },
  };
}
