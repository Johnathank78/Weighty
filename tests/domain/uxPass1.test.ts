/**
 * UX pass 1 (report 44): interface only. Each block covers one request (A to G) of the pass: what the screens read comes
 * from pure domain selectors tested here; the science and the plan are untouched (bit-exact captures, see the report).
 */
import { describe, expect, it } from 'vitest';
import { JOURNAL_TEXT } from '@/app/copy';
import { intakeObservationsFrom } from '@/domain/intakeObservations';
import { completeOnboarding } from '@/domain/engine';
import { addFoodEntry, deleteFoodEntry, hasNoMacros, hourGroupKcal, hourGroups, intakeTotals, journalDay, kcalWithoutMacros, replaceManualEntry } from '@/domain/journal';
import type { ManualFood } from '@/domain/journal';
import type { FoodEntry, WheightyStore } from '@/domain/types';
import { emptyStore, isFoodEntry } from '@/persistence/schema';
import { loadStore, MemoryStorage, saveStore, STORE_KEY } from '@/persistence/storage';
import { calibrationFingerprint } from '@/store/calibrationClient';
import { makeProfile } from '../helpers/profiles';

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

// ---------------------------------------------------------------------------
// B. Edit of a free entry
// ---------------------------------------------------------------------------

function onboardedWithJournal(): WheightyStore {
  const profile = makeProfile({ ageYears: 34, heightCm: 172, currentWeightKg: 80, averageSteps7d: 8200, occupation: 'mixed', goal: 'loss', targetWeightKg: 72, weeklyRateTarget: 0.005 });
  const r = completeOnboarding(emptyStore(), profile, '2026-09-01', '2026-09-01T08:00:00.000Z');
  if (!r.ok) throw new Error(r.reason);
  let s = addManual(r.store, { name: 'Petit déjeuner', intake: { energyKcal: 420, proteinG: 18, carbsG: 50, fatG: 14 }, grams: 300 }, '08:00', '2026-09-28');
  s = addManual(s, { name: 'Déjeuner', intake: { energyKcal: 700, proteinG: 35, carbsG: 70, fatG: 25 }, grams: null }, '12:30', '2026-09-28');
  s = addManual(s, { name: 'Dîner', intake: { energyKcal: 650, proteinG: 30, carbsG: 60, fatG: 20 }, grams: null }, '19:30', '2026-09-28');
  return s;
}

/** The entry fields that are neither identifiers nor timestamps. */
const content = (e: FoodEntry) => {
  const { id: _id, loggedAt: _logged, localTime: _local, resolvedAt: _resolved, ...rest } = e;
  return rest;
};

describe('B. edit of a free entry', () => {
  const EDITED: ManualFood = { name: 'Déjeuner au resto', intake: { energyKcal: 910, ...NO_MACROS }, grams: null };

  it('gives the same state as a deletion followed by an addition, identifiers and timestamps aside', () => {
    const s = onboardedWithJournal();
    const target = s.foodJournal.entries[1] as FoodEntry;
    const later = '2026-09-29T10:00:00.000Z';
    const edited = replaceManualEntry(s, target.id, { date: '2026-09-28', consumedTime: '13:15', food: EDITED }, later);
    const viaDeleteAdd = addFoodEntry(deleteFoodEntry(s, target.id), { kind: 'manual', date: '2026-09-28', localTime: '10:00', consumedTime: '13:15', food: EDITED }, later);
    if (!edited.ok || !viaDeleteAdd.ok) throw new Error('edit');
    const { foodJournal: jA, ...restA } = edited.store;
    const { foodJournal: jB, ...restB } = viaDeleteAdd.store;
    expect(restA).toEqual(restB);
    expect(restA).toEqual((({ foodJournal: _j, ...rest }) => rest)(s));
    expect({ ...jA, entries: jA.entries.map(content) }).toEqual({ ...jB, entries: jB.entries.map(content) });
    // Same position as an addition (end of the list), same identity as before.
    const last = jA.entries[jA.entries.length - 1] as FoodEntry;
    expect(last.id).toBe(target.id);
    expect(last.loggedAt).toBe(target.loggedAt);
    expect(last.localTime).toBe(target.localTime);
    expect(last.intake).toEqual({ energyKcal: 910, proteinG: null, carbsG: null, fatG: null });
    expect(journalDay(edited.store, '2026-09-28').intakeLoggedKcal).toBe(420 + 910 + 650);
  });

  it('can move the entry to another time and day, and leaves the plan, the past targets and the calibration input alone', () => {
    const s = onboardedWithJournal();
    const target = s.foodJournal.entries[2] as FoodEntry;
    const r = replaceManualEntry(s, target.id, { date: '2026-09-27', consumedTime: '23:10', food: { name: 'Dîner', intake: { energyKcal: 650, proteinG: 30, carbsG: 60, fatG: 20 }, grams: 400 } }, NOW);
    if (!r.ok) throw new Error(r.reason);
    expect(journalDay(r.store, '2026-09-27').entries.map((e) => e.id)).toEqual([target.id]);
    expect(journalDay(r.store, '2026-09-28').entries).toHaveLength(2);
    expect(r.store.plan).toBe(s.plan);
    expect(r.store.dailyLogs).toBe(s.dailyLogs);
    expect(r.store.meta).toBe(s.meta);
    expect(calibrationFingerprint(r.store, DAY)).toBe(calibrationFingerprint(s, DAY));
  });

  it('refuses what an addition refuses, and never edits a product entry', () => {
    const s = onboardedWithJournal();
    const target = s.foodJournal.entries[0] as FoodEntry;
    expect(replaceManualEntry(s, target.id, { date: '2026-09-28', consumedTime: '08:00', food: { name: 'x', intake: { energyKcal: -5, ...NO_MACROS }, grams: null } }, NOW)).toEqual({ ok: false, reason: 'invalid_entry' });
    expect(replaceManualEntry(s, 'unknown', { date: '2026-09-28', consumedTime: '08:00', food: EDITED }, NOW)).toEqual({ ok: false, reason: 'invalid_entry' });
    const withProduct = addFoodEntry(s, { kind: 'resolved', date: DAY, localTime: '10:00', food: { source: 'ciqual', sourceId: '13050', sourceVersion: 'Ciqual 2025', resolvedAt: NOW, name: 'Pomme', per100g: { energyKcal: 53.6, proteinG: 0.25, carbsG: 11.6, fatG: 0.25 } }, grams: 150 }, NOW);
    if (!withProduct.ok) throw new Error('add');
    expect(replaceManualEntry(withProduct.store, withProduct.id, { date: DAY, consumedTime: '10:00', food: EDITED }, NOW)).toEqual({ ok: false, reason: 'invalid_entry' });
  });
});

// ---------------------------------------------------------------------------
// C. Kcal of each hour group
// ---------------------------------------------------------------------------

describe('C. kcal of each hour group', () => {
  const food = (kcal: number, p: number | null = 1): ManualFood => ({ name: 'x', intake: { energyKcal: kcal, proteinG: p, carbsG: p, fatG: p }, grams: null });
  const displayedDayTotal = (s: WheightyStore, counted: (e: FoodEntry) => boolean = () => true) => Math.round(journalDay(s, DAY).entries.filter(counted).reduce((a, e) => a + e.intake.energyKcal, 0) * 100) / 100;

  it('the groups add up to the day total as displayed, rounding included, with entries without macros', () => {
    let s = emptyStore();
    s = addManual(s, food(100.4), '08:05');
    s = addManual(s, food(100.4, null), '08:40');
    s = addManual(s, food(100.4), '12:00');
    s = addManual(s, food(0.6, null), '16:30');
    s = addManual(s, food(250.2), '20:15');
    const groups = hourGroups(journalDay(s, DAY).entries);
    const kcal = hourGroupKcal(groups);
    expect(groups.map((g) => g.hour)).toEqual(['08', '12', '16', '20']);
    expect(kcal).toEqual([201, 100, 1, 250]);
    expect(kcal.reduce((a, b) => a + b, 0)).toBe(Math.round(journalDay(s, DAY).intakeLoggedKcal));
    expect(Math.round(journalDay(s, DAY).intakeLoggedKcal)).toBe(Math.round(displayedDayTotal(s)));
  });

  it('holds on random days, with masked (not counted) entries and empty groups', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let run = 0; run < 300; run++) {
      let s = emptyStore();
      const n = Math.floor(rand() * 9);
      for (let k = 0; k < n; k++) {
        const t = `${String(Math.floor(rand() * 24)).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}`;
        s = addManual(s, food(Math.round(rand() * 90000) / 100, rand() < 0.3 ? null : 2), t);
      }
      const entries = journalDay(s, DAY).entries;
      const masked = new Set(entries.filter(() => rand() < 0.25).map((e) => e.id));
      const counted = (e: FoodEntry) => !masked.has(e.id);
      const kcal = hourGroupKcal(hourGroups(entries), counted);
      expect(kcal.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
      expect(kcal.reduce((a, b) => a + b, 0)).toBe(Math.round(intakeTotals(entries.filter(counted)).energyKcal));
    }
    expect(hourGroupKcal([])).toEqual([]);
  });
});
