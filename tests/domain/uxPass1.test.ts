/**
 * UX pass 1 (report 44): interface only. Each block covers one request (A to G) of the pass: what the screens read comes
 * from pure domain selectors tested here; the science and the plan are untouched (bit-exact captures, see the report).
 */
import { describe, expect, it } from 'vitest';
import { JOURNAL_TEXT } from '@/app/copy';
import { intakeObservationsFrom } from '@/domain/intakeObservations';
import { addFoodEntry, hasNoMacros, journalDay, kcalWithoutMacros } from '@/domain/journal';
import type { ManualFood } from '@/domain/journal';
import type { FoodEntry, WheightyStore } from '@/domain/types';
import { emptyStore, isFoodEntry } from '@/persistence/schema';
import { loadStore, MemoryStorage, saveStore, STORE_KEY } from '@/persistence/storage';

const NOW = '2026-09-29T09:00:00.000Z';
const DAY = '2026-09-29';

function addManual(store: WheightyStore, food: ManualFood, consumedTime = '12:00', date = DAY): WheightyStore {
  const r = addFoodEntry(store, { kind: 'manual', date, localTime: consumedTime, consumedTime, food }, NOW);
  if (!r.ok) throw new Error(r.reason);
  return r.store;
}

const NO_MACROS = { proteinG: null, carbsG: null, fatG: null };

// ---------------------------------------------------------------------------
// A. Free entry without macros
// ---------------------------------------------------------------------------

/** Journal entries exactly as the base (schema 7, before this pass) writes them: free entries always carry three macros. */
const STORED_ENTRIES: FoodEntry[] = [
  { id: 'f-20260928120000000-abc', date: '2026-09-28', loggedAt: '2026-09-28T12:00:00.000Z', localTime: '14:00', consumedTime: '12:30', name: 'Repas du midi', source: 'manual', sourceId: null, sourceVersion: null, resolvedAt: '2026-09-28T12:00:00.000Z', per100g: null, quantity: { grams: 350 }, intake: { energyKcal: 640, proteinG: 32, carbsG: 70, fatG: 22.5 } },
  {
    id: 'f-20260928180000000-def',
    date: '2026-09-28',
    loggedAt: '2026-09-28T18:00:00.000Z',
    localTime: '20:00',
    consumedTime: '19:45',
    name: 'Pomme, crue',
    source: 'ciqual',
    sourceId: '13050',
    sourceVersion: 'Ciqual 2025 (2025-11-03)',
    resolvedAt: '2026-09-28T18:00:00.000Z',
    per100g: { energyKcal: 53.6, proteinG: 0.25, carbsG: 11.6, fatG: 0.25 },
    quantity: { grams: 150, portion: { id: 'p-1', label: 'Une pomme', count: 1, gramsEach: 150 } },
    intake: { energyKcal: 80.4, proteinG: 0.38, carbsG: 17.4, fatG: 0.38 },
  },
];

describe('A. free entry without macros', () => {
  it('data stored before this pass loads exactly as it was (no schema change)', () => {
    const before = emptyStore();
    before.foodJournal = { journalVersion: 1, startedOn: '2026-09-28', entries: STORED_ENTRIES, portions: [], library: [] };
    const raw = JSON.stringify(before);
    const storage = new MemoryStorage();
    storage.setItem(STORE_KEY, raw);
    const loaded = loadStore(storage, NOW);
    expect(loaded.status).toBe('loaded');
    expect(loaded.dropped).toEqual([]);
    expect(loaded.store).toEqual(JSON.parse(raw));
    expect(JSON.stringify(loaded.store)).toBe(raw);
  });

  it('an entry saved without macros is a valid entry of the same schema, and survives a save and a reload', () => {
    const s = addManual(emptyStore(), { name: 'Resto', intake: { energyKcal: 320, ...NO_MACROS }, grams: null });
    const entry = s.foodJournal.entries[0] as FoodEntry;
    expect(entry.intake).toEqual({ energyKcal: 320, proteinG: null, carbsG: null, fatG: null });
    expect(isFoodEntry(entry)).toBe(true);
    expect(hasNoMacros(entry)).toBe(true);
    const storage = new MemoryStorage();
    expect(saveStore(storage, s)).toEqual({ ok: true });
    const loaded = loadStore(storage, NOW);
    expect(loaded.status).toBe('loaded');
    expect(loaded.store.foodJournal).toEqual(s.foodJournal);
  });

  it('the day never presents partial macro totals as complete: known macros, and the kcal without detail', () => {
    let s = addManual(emptyStore(), { name: 'Salade', intake: { energyKcal: 400, proteinG: 20, carbsG: 30, fatG: 18 }, grams: null }, '12:10');
    s = addManual(s, { name: 'Resto', intake: { energyKcal: 320, ...NO_MACROS }, grams: null }, '20:00');
    const day = journalDay(s, DAY);
    expect(day.intakeLoggedKcal).toBe(720);
    expect(day.intakeLoggedProteinG).toBe(20);
    expect(day.intakeKcalWithoutMacros).toBe(320);
    expect(day.macrosComplete).toBe(false);
    expect(day.macrosMissing).toEqual({ proteinG: true, carbsG: true, fatG: true });
    expect(JOURNAL_TEXT.kcalWithoutMacros('320')).toBe('dont 320 kcal sans détail des macros');
    expect(JOURNAL_TEXT.partialMacros(['les protéines', 'les glucides', 'les lipides'])).toBe('Certains aliments n’ont pas le détail des macros : ces totaux sont des minimums.');
    // An entry that gives part of the macros (a product) is not counted as "without detail".
    const partial = { ...(s.foodJournal.entries[0] as FoodEntry), intake: { energyKcal: 100, proteinG: 3, carbsG: null, fatG: null } };
    expect(hasNoMacros(partial)).toBe(false);
    expect(kcalWithoutMacros([partial])).toBe(0);
  });

  it('the science never reads the macros of an entry: the journal observations depend on the kcal only', () => {
    const withMacros = addManual(emptyStore(), { name: 'Repas', intake: { energyKcal: 700, proteinG: 30, carbsG: 80, fatG: 25 }, grams: null });
    const without = addManual(emptyStore(), { name: 'Repas', intake: { energyKcal: 700, ...NO_MACROS }, grams: null });
    for (const rule of [{ kind: 'R0' } as const, { kind: 'R1', x: 0.5 } as const, { kind: 'R2', x: 0.5 } as const]) {
      expect(intakeObservationsFrom(without, '2026-09-20', DAY, rule)).toEqual(intakeObservationsFrom(withMacros, '2026-09-20', DAY, rule));
    }
  });
});
