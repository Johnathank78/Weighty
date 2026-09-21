/**
 * Food journal domain (J-01, J-02): snapshots, immutability of past days, portions, totals kept apart
 * from the plan, embedded Ciqual table and local search, and independence from the engine.
 */
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { offProductToFood, parseOffProduct } from '@/adapters/openFoodFacts';
import { completeOnboarding, computeCalibrationState, addWeight, setAdherence } from '@/domain/engine';
import { buildSearchIndex, loadCiqual, normalizeForSearch, resolveCiqualFood, searchIndex } from '@/domain/foodSearch';
import { addFoodEntry, addPortion, deleteFoodEntry, deletePortion, journalDay, localTimeOf, MACRO_KEYS, MANUAL_DEFAULT_NAME, missingMacros, nutrientsForGrams, portionsFor, recentFoods, restoreFoodEntry } from '@/domain/journal';
import { JOURNAL_GAUGE_TEXT, JOURNAL_TEXT } from '@/app/copy';
import type { ResolvedFood } from '@/domain/journal';
import type { WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { calibrationFingerprint } from '@/store/calibrationClient';
import { addDays } from '@/science/dates';
import { makeProfile } from '../helpers/profiles';

const DAY0 = '2026-08-01';
const NOW = '2026-09-16T08:00:00.000Z';
const iso = (d: string) => `${d}T08:00:00.000Z`;

function onboarded(): WheightyStore {
  const profile = makeProfile({ ageYears: 34, heightCm: 172, currentWeightKg: 80, averageSteps7d: 8200, occupation: 'mixed', goal: 'loss', targetWeightKg: 72, weeklyRateTarget: 0.005 });
  const r = completeOnboarding(emptyStore(), profile, DAY0, iso(DAY0));
  if (!r.ok) throw new Error(r.reason);
  return r.store;
}

const APPLE: ResolvedFood = { source: 'ciqual', sourceId: '13050', sourceVersion: 'Ciqual 2025 (2025-11-03)', resolvedAt: NOW, name: 'Pomme, crue', per100g: { energyKcal: 53.6, proteinG: 0.25, carbsG: 11.6, fatG: 0.25 } };

function add(store: WheightyStore, food: ResolvedFood, date: string, grams: number, nowIso = NOW): WheightyStore {
  const r = addFoodEntry(store, { kind: 'resolved', date, localTime: '12:00', food, grams }, nowIso);
  if (!r.ok) throw new Error(r.reason);
  return r.store;
}

describe('entries freeze the resolved values (snapshot)', () => {
  it('stores the per 100 g snapshot, traceability and the resolved intake', () => {
    const s = add(emptyStore(), APPLE, '2026-09-16', 150);
    const e = s.foodJournal.entries[0];
    expect(e).toMatchObject({ source: 'ciqual', sourceId: '13050', sourceVersion: 'Ciqual 2025 (2025-11-03)', resolvedAt: NOW, loggedAt: NOW, localTime: '12:00', quantity: { grams: 150 } });
    expect(e?.per100g).toEqual(APPLE.per100g);
    expect(e?.intake).toEqual({ energyKcal: 80.4, proteinG: 0.38, carbsG: 17.4, fatG: 0.38 });
    expect(s.foodJournal.startedOn).toBe('2026-09-16');
  });

  it('a corrected Open Food Facts record never changes a past day', () => {
    const before = parseOffProduct({ code: '3017624010701', product_name: 'Pâte à tartiner', last_modified_t: 1700000000, nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 } });
    const after = parseOffProduct({ code: '3017624010701', product_name: 'Pâte à tartiner', last_modified_t: 1785948506, nutriments: { 'energy-kcal_100g': 480, proteins_100g: 7, carbohydrates_100g: 50, fat_100g: 25 } });
    if (!before || !after) throw new Error('parse');
    const foodBefore = offProductToFood(before, '2026-03-01T10:00:00.000Z');
    const foodAfter = offProductToFood(after, NOW);
    if (!foodBefore || !foodAfter) throw new Error('food');

    let s = add(emptyStore(), foodBefore, '2026-03-01', 20, '2026-03-01T10:00:00.000Z');
    const pastDay = journalDay(s, '2026-03-01');
    const pastJson = JSON.stringify(s.foodJournal.entries);
    // The record is corrected later and logged again today.
    s = add(s, foodAfter, '2026-09-16', 20);
    expect(journalDay(s, '2026-03-01')).toEqual(pastDay);
    expect(s.foodJournal.entries.filter((e) => e.date === '2026-03-01')).toEqual(JSON.parse(pastJson));
    expect(pastDay.intakeLoggedKcal).toBe(107.8);
    expect(journalDay(s, '2026-09-16').intakeLoggedKcal).toBe(96);
    expect(s.foodJournal.entries.map((e) => e.sourceVersion)).toEqual(['1700000000', '1785948506']);
  });

  it('a new Ciqual version never changes a past day either', () => {
    let s = add(emptyStore(), APPLE, '2026-01-10', 100);
    const past = journalDay(s, '2026-01-10');
    s = add(s, { ...APPLE, sourceVersion: 'Ciqual 2030', per100g: { ...APPLE.per100g, energyKcal: 60 } }, '2026-09-16', 100);
    expect(journalDay(s, '2026-01-10')).toEqual(past);
  });

  it('recent foods reuse the last snapshot, not a source', () => {
    let s = add(emptyStore(), APPLE, '2026-09-15', 100, '2026-09-15T12:00:00.000Z');
    s = add(s, { ...APPLE, sourceId: '20000', name: 'Riz cuit', per100g: { energyKcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 } }, '2026-09-16', 150, '2026-09-16T12:00:00.000Z');
    s = add(s, APPLE, '2026-09-16', 80, '2026-09-16T13:00:00.000Z');
    const recents = recentFoods(s);
    expect(recents.map((r) => r.food.name)).toEqual(['Pomme, crue', 'Riz cuit']);
    const apple = recents[0];
    expect(apple?.kind === 'resolved' && apple.food).toEqual(APPLE);
  });
});

describe('manual entries, portions and day totals', () => {
  it('logs a manual entry without source and with an optional weight', () => {
    const r = addFoodEntry(emptyStore(), { kind: 'manual', date: '2026-09-16', localTime: '19:40', food: { name: '  ', intake: { energyKcal: 650, proteinG: 30, carbsG: null, fatG: null }, grams: null } }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.store.foodJournal.entries[0]).toMatchObject({ name: MANUAL_DEFAULT_NAME, source: 'manual', sourceId: null, sourceVersion: null, per100g: null, quantity: null, intake: { energyKcal: 650, proteinG: 30, carbsG: null, fatG: null } });
    const day = journalDay(r.store, '2026-09-16');
    expect(day.intakeLoggedKcal).toBe(650);
    expect(day.macrosComplete).toBe(false);
  });

  it('refuses invalid amounts', () => {
    expect(addFoodEntry(emptyStore(), { kind: 'resolved', date: '2026-09-16', localTime: '12:00', food: APPLE, grams: 0 }, NOW).ok).toBe(false);
    expect(addFoodEntry(emptyStore(), { kind: 'resolved', date: '2026-09-16', localTime: '12:00', food: APPLE, grams: 9000 }, NOW).ok).toBe(false);
    expect(addFoodEntry(emptyStore(), { kind: 'manual', date: '2026-09-16', localTime: '25:00', food: { name: 'x', intake: { energyKcal: 10, proteinG: null, carbsG: null, fatG: null }, grams: null } }, NOW).ok).toBe(false);
    expect(addFoodEntry(emptyStore(), { kind: 'resolved', date: '2026-09-16', localTime: '12:00', food: { ...APPLE, per100g: { ...APPLE.per100g, energyKcal: 2000 } }, grams: 100 }, NOW).ok).toBe(false);
  });

  it('personal portions: food specific first, then generic; reusable and removable', () => {
    let s = emptyStore();
    const own = addPortion(s, { label: 'Une pomme', grams: 150, foodKey: 'ciqual:13050' }, NOW);
    if (!own.ok) throw new Error('portion');
    const generic = addPortion(own.store, { label: 'Mon bol', grams: 250, foodKey: null }, NOW);
    if (!generic.ok) throw new Error('portion');
    s = generic.store;
    expect(portionsFor(s, 'ciqual:13050').map((p) => p.label)).toEqual(['Une pomme', 'Mon bol']);
    expect(portionsFor(s, 'ciqual:20000').map((p) => p.label)).toEqual(['Mon bol']);
    expect(addPortion(s, { label: '', grams: 10, foodKey: null }, NOW).ok).toBe(false);
    const r = addFoodEntry(s, { kind: 'resolved', date: '2026-09-16', localTime: '10:00', food: APPLE, grams: 300, portion: { id: own.id, label: 'Une pomme', count: 2, gramsEach: 150 } }, NOW);
    expect(r.ok && r.store.foodJournal.entries[0]?.quantity).toEqual({ grams: 300, portion: { id: own.id, label: 'Une pomme', count: 2, gramsEach: 150 } });
    // Deleting a portion never changes entries that used it.
    if (r.ok) expect(deletePortion(r.store, own.id).foodJournal.entries).toEqual(r.store.foodJournal.entries);
  });

  it('day totals, chronological order, deletion and undo', () => {
    let s = emptyStore();
    const late = addFoodEntry(s, { kind: 'resolved', date: '2026-09-16', localTime: '20:00', food: APPLE, grams: 100 }, NOW);
    if (!late.ok) throw new Error('late');
    const early = addFoodEntry(late.store, { kind: 'resolved', date: '2026-09-16', localTime: '07:30', food: APPLE, grams: 200 }, NOW);
    if (!early.ok) throw new Error('early');
    s = early.store;
    const day = journalDay(s, '2026-09-16');
    expect(day.entries.map((e) => e.localTime)).toEqual(['07:30', '20:00']);
    expect(day).toMatchObject({ intakeLoggedKcal: 160.8, intakeLoggedCarbsG: 34.8, macrosComplete: true });
    const entry = s.foodJournal.entries[0];
    if (!entry) throw new Error('entry');
    const removed = deleteFoodEntry(s, entry.id);
    expect(journalDay(removed, '2026-09-16').entries).toHaveLength(1);
    expect(journalDay(restoreFoodEntry(removed, entry), '2026-09-16')).toEqual(day);
    expect(journalDay(s, '2026-09-17')).toMatchObject({ entries: [], intakeLoggedKcal: 0, macrosComplete: true });
  });

  it('flags the missing macros one by one, never globally (B3)', () => {
    // A free entry that gives the protein but neither the carbs nor the fat.
    const partial = addFoodEntry(emptyStore(), { kind: 'manual', date: '2026-09-16', localTime: '12:00', food: { name: 'Repas', intake: { energyKcal: 650, proteinG: 30, carbsG: null, fatG: null }, grams: null } }, NOW);
    if (!partial.ok) throw new Error('partial');
    const s = add(partial.store, APPLE, '2026-09-16', 100);
    const day = journalDay(s, '2026-09-16');
    expect(day.macrosMissing).toEqual({ proteinG: false, carbsG: true, fatG: true });
    expect(day.macrosComplete).toBe(false);
    // The protein total is exact (both entries give it); the other two are floors.
    expect(day.intakeLoggedProteinG).toBe(30.25);
    expect(day.intakeLoggedCarbsG).toBe(11.6);
    expect(MACRO_KEYS.filter((k) => day.macrosMissing[k]).map((k) => JOURNAL_GAUGE_TEXT.macrosLower[k])).toEqual(['les glucides', 'les lipides']);

    // Complete entries only: nothing is flagged, and the sentence never appears.
    const complete = journalDay(add(emptyStore(), APPLE, '2026-09-16', 100), '2026-09-16');
    expect(complete.macrosMissing).toEqual({ proteinG: false, carbsG: false, fatG: false });
    expect(complete.macrosComplete).toBe(true);
    expect(missingMacros([])).toEqual({ proteinG: false, carbsG: false, fatG: false });
  });

  it('names only the incomplete macros and marks their total as a floor (B3)', () => {
    expect(JOURNAL_TEXT.partialMacros(['les lipides'])).toBe('Certains aliments n’indiquent pas les lipides : ce total est un minimum.');
    expect(JOURNAL_TEXT.partialMacros(['les glucides', 'les lipides'])).toBe('Certains aliments n’indiquent pas les glucides ni les lipides : ces totaux sont des minimums.');
    // The screen reads the flags of the entries actually summed in the gauges (masking included).
    const src = readFileSync('src/screens/Journal.tsx', 'utf8');
    expect(src).toMatch(/const missing = missingMacros\(visibleEntries\)/);
    expect(src).toMatch(/missing\[key\] \? \(/);
    expect(src).toMatch(/JOURNAL_GAUGE_TEXT\.atLeast/);
  });

  it('nutrient scaling and local time format', () => {
    expect(nutrientsForGrams({ energyKcal: 100, proteinG: null, carbsG: 10, fatG: 0 }, 33)).toEqual({ energyKcal: 33, proteinG: null, carbsG: 3.3, fatG: 0 });
    expect(localTimeOf(new Date(2026, 8, 16, 7, 5))).toBe('07:05');
  });
});

describe('journal is kept apart from the plan and the engine', () => {
  it('logging food never modifies plan targets, daily logs or the calibration', () => {
    let s = onboarded();
    for (let d = 0; d < 21; d += 3) s = addWeight(s, { date: addDays(DAY0, d), weightKg: 80 - d * 0.05 }, iso(addDays(DAY0, d)));
    for (let d = 0; d < 21; d++) s = setAdherence(s, addDays(DAY0, d), 'on_plan');
    const today = addDays(DAY0, 21);
    const withJournal = add(add(s, APPLE, addDays(DAY0, 5), 150), APPLE, today, 400);

    expect(withJournal.plan).toEqual(s.plan);
    expect(withJournal.dailyLogs).toEqual(s.dailyLogs);
    expect(withJournal.calibrationSnapshots).toEqual(s.calibrationSnapshots);
    expect(calibrationFingerprint(withJournal, today)).toBe(calibrationFingerprint(s, today));
    expect(computeCalibrationState(withJournal, today, iso(today))).toEqual(computeCalibrationState(s, today, iso(today)));
  });

  it('no engine, science, worker or calibration module reads the journal', () => {
    const files = ['src/domain/engine.ts', 'src/domain/views.ts', 'src/domain/explain.ts', 'src/store/calibration.worker.ts', 'src/store/calibrationClient.ts'];
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/foodJournal|intakeLogged|@\/domain\/journal|@\/domain\/foodSearch/);
    const journal = readFileSync('src/domain/journal.ts', 'utf8');
    const imports = [...journal.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports).toEqual(['./types', '@/persistence/schema', '@/science/dates']);
  });
});

describe('embedded Ciqual table and local search (J-02)', () => {
  it('ships a reduced table with its version and the displayed constituents only', async () => {
    const { table } = await loadCiqual();
    expect(table.version).toBe('Ciqual 2025 (2025-11-03)');
    expect(table.doi).toBe('10.57745/RDMHWY');
    expect(table.license).toBe('Etalab 2.0');
    expect(table.foods.length).toBeGreaterThan(3000);
    const raw = JSON.parse(readFileSync('src/data/ciqual.json', 'utf8')) as { columns: string[] };
    expect(raw.columns).toEqual(['code', 'name', 'group', 'kcal', 'proteinG', 'carbsG', 'fatG']);
    for (const f of table.foods) {
      expect(f.kcal).toBeGreaterThanOrEqual(0);
      expect(f.kcal).toBeLessThanOrEqual(950);
    }
    // Size guard: the 74 constituents must never be embedded by mistake.
    expect(statSync('src/data/ciqual.json').size).toBeLessThan(350_000);
  });

  it('search ignores case and accents, ranks names starting with the query first', async () => {
    const { index, table } = await loadCiqual();
    const accents = searchIndex(index, 'PÂTES').map((f) => f.name);
    const plain = searchIndex(index, 'pates').map((f) => f.name);
    expect(accents.length).toBeGreaterThan(0);
    expect(accents).toEqual(plain);
    const apple = searchIndex(index, 'pomme crue');
    expect(apple.length).toBeGreaterThan(0);
    expect(normalizeForSearch(apple[0]?.name ?? '')).toMatch(/^pomme/);
    expect(searchIndex(index, 'oeuf').length).toBeGreaterThan(0);
    expect(searchIndex(index, '')).toEqual([]);
    expect(searchIndex(index, 'zzzzqqq')).toEqual([]);
    const food = apple[0];
    if (!food) throw new Error('apple');
    expect(resolveCiqualFood(food, table, NOW)).toMatchObject({ source: 'ciqual', sourceId: String(food.code), sourceVersion: table.version, resolvedAt: NOW });
  });

  it('generic index: every word must prefix a word of the name', () => {
    const index = buildSearchIndex([{ n: 'Œuf de poule, cru' }, { n: 'Crème fraîche' }, { n: 'Fraise' }], (x) => x.n);
    expect(searchIndex(index, 'oeuf cru').map((x) => x.n)).toEqual(['Œuf de poule, cru']);
    expect(searchIndex(index, 'fra').map((x) => x.n)).toEqual(['Fraise', 'Crème fraîche']);
    expect(searchIndex(index, 'raise')).toEqual([]);
  });
});
