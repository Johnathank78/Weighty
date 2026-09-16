/**
 * Food journal use cases (IMPLEMENTATION_NOTES J-01). Pure functions over the store.
 *
 * The journal is display only: nothing here is read by the engine, the calibration, the
 * adherence, the warm start or the plan, and this module imports none of them. Entries freeze
 * the nutrient values resolved at save time, so a later change of a source (Ciqual update,
 * corrected Open Food Facts record) never rewrites a past day.
 */
import type { FoodEntry, FoodJournal, FoodNutrients, FoodSource, PersonalPortion, WheightyStore } from './types';
import { isFoodEntry, isPersonalPortion } from '@/persistence/schema';
import { addDays } from '@/science/dates';

/** A food whose values come from a reference source, ready to be logged. */
export type ResolvedFood = {
  source: Exclude<FoodSource, 'manual'>;
  sourceId: string;
  sourceVersion: string;
  resolvedAt: string;
  name: string;
  brand?: string;
  per100g: FoodNutrients;
};

export type ManualFood = {
  name: string;
  intake: FoodNutrients;
  grams: number | null;
};

/**
 * `date` is the consumption day and `localTime` the save time. `consumedTime` defaults to the save time
 * ("je viens de le manger"); use consumptionDate to attribute a past time to the right day.
 */
type EntryTiming = { date: string; localTime: string; consumedTime?: string };

export type NewEntryInput =
  | ({ kind: 'resolved'; food: ResolvedFood; grams: number; portion?: { id: string; label: string; count: number; gramsEach: number } } & EntryTiming)
  | ({ kind: 'manual'; food: ManualFood } & EntryTiming);

export type JournalResult = { ok: true; store: WheightyStore; id: string } | { ok: false; reason: 'invalid_entry' | 'invalid_portion' };

export const MANUAL_DEFAULT_NAME = 'Saisie libre';

export function foodKey(source: FoodSource, sourceId: string | null): string | null {
  return sourceId === null ? null : `${source}:${sourceId}`;
}

function journalId(prefix: string, nowIso: string): string {
  return `${prefix}-${nowIso.replace(/\D/g, '')}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Nutrients for `grams` of a food described per 100 g. */
export function nutrientsForGrams(per100g: FoodNutrients, grams: number): FoodNutrients {
  const f = grams / 100;
  const scale = (v: number | null) => (v === null ? null : round2(v * f));
  return { energyKcal: round2(per100g.energyKcal * f), proteinG: scale(per100g.proteinG), carbsG: scale(per100g.carbsG), fatG: scale(per100g.fatG) };
}

/** Local wall clock time, HH:MM. */
export function localTimeOf(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Consumption day of a food eaten at `consumedTime` (J-06). A time later than now on the selected day
 * cannot be in the future: it belongs to the day before (eaten at 23:00, saved at 00:30).
 */
export function consumptionDate(selectedDate: string, today: string, consumedTime: string, nowLocalTime: string): string {
  return selectedDate === today && consumedTime > nowLocalTime ? addDays(today, -1) : selectedDate;
}

export type IntakeGauge = {
  /** Filled share of the bar, 0 to 1. The bar stays full beyond the target, same colour. */
  fraction: number;
  /** Rounded kcal or grams left before the target, 0 once reached. */
  remaining: number;
  /** Rounded amount beyond the target, 0 until then. Neutral wording only (no alert, no failure colour). */
  beyond: number;
};

export function intakeGauge(logged: number, target: number): IntakeGauge {
  const diff = Math.round(target) - Math.round(logged);
  return { fraction: target > 0 ? Math.max(0, Math.min(1, logged / target)) : 0, remaining: Math.max(0, diff), beyond: Math.max(0, -diff) };
}

function withJournal(store: WheightyStore, journal: FoodJournal): WheightyStore {
  return { ...store, foodJournal: journal };
}

export function addFoodEntry(store: WheightyStore, input: NewEntryInput, nowIso: string): JournalResult {
  const id = journalId('f', nowIso);
  let entry: FoodEntry;
  if (input.kind === 'resolved') {
    const { food } = input;
    entry = {
      id,
      date: input.date,
      loggedAt: nowIso,
      localTime: input.localTime,
      consumedTime: input.consumedTime ?? input.localTime,
      name: food.name.trim(),
      ...(food.brand ? { brand: food.brand } : {}),
      source: food.source,
      sourceId: food.sourceId,
      sourceVersion: food.sourceVersion,
      resolvedAt: food.resolvedAt,
      per100g: { ...food.per100g },
      quantity: { grams: round2(input.grams), ...(input.portion ? { portion: { ...input.portion } } : {}) },
      intake: nutrientsForGrams(food.per100g, input.grams),
    };
  } else {
    const { food } = input;
    entry = {
      id,
      date: input.date,
      loggedAt: nowIso,
      localTime: input.localTime,
      consumedTime: input.consumedTime ?? input.localTime,
      name: food.name.trim() || MANUAL_DEFAULT_NAME,
      source: 'manual',
      sourceId: null,
      sourceVersion: null,
      resolvedAt: nowIso,
      per100g: null,
      quantity: food.grams === null ? null : { grams: round2(food.grams) },
      intake: { ...food.intake },
    };
  }
  if (!isFoodEntry(entry)) return { ok: false, reason: 'invalid_entry' };
  const journal = store.foodJournal;
  const startedOn = journal.startedOn === null || entry.date < journal.startedOn ? entry.date : journal.startedOn;
  return { ok: true, id, store: withJournal(store, { ...journal, startedOn, entries: [...journal.entries, entry] }) };
}

export function deleteFoodEntry(store: WheightyStore, id: string): WheightyStore {
  const journal = store.foodJournal;
  if (!journal.entries.some((e) => e.id === id)) return store;
  return withJournal(store, { ...journal, entries: journal.entries.filter((e) => e.id !== id) });
}

/** Puts back an entry removed by mistake, unchanged (same id, same snapshot). */
export function restoreFoodEntry(store: WheightyStore, entry: FoodEntry): WheightyStore {
  const journal = store.foodJournal;
  if (journal.entries.some((e) => e.id === entry.id) || !isFoodEntry(entry)) return store;
  return withJournal(store, { ...journal, entries: [...journal.entries, entry] });
}

export function addPortion(store: WheightyStore, input: { label: string; grams: number; foodKey: string | null }, nowIso: string): JournalResult {
  const portion: PersonalPortion = { id: journalId('p', nowIso), label: input.label.trim(), grams: round2(input.grams), foodKey: input.foodKey, createdAt: nowIso };
  if (!isPersonalPortion(portion)) return { ok: false, reason: 'invalid_portion' };
  const journal = store.foodJournal;
  return { ok: true, id: portion.id, store: withJournal(store, { ...journal, portions: [...journal.portions, portion] }) };
}

export function deletePortion(store: WheightyStore, id: string): WheightyStore {
  const journal = store.foodJournal;
  return withJournal(store, { ...journal, portions: journal.portions.filter((p) => p.id !== id) });
}

/** Portions usable for a food: its own first, then the generic ones. */
export function portionsFor(store: WheightyStore, key: string | null): PersonalPortion[] {
  const own = key === null ? [] : store.foodJournal.portions.filter((p) => p.foodKey === key);
  return [...own, ...store.foodJournal.portions.filter((p) => p.foodKey === null)];
}

export type JournalDay = {
  date: string;
  entries: FoodEntry[];
  /** Sum of the logged energy. Distinct from the plan target, which is never read or written here. */
  intakeLoggedKcal: number;
  intakeLoggedProteinG: number;
  intakeLoggedCarbsG: number;
  intakeLoggedFatG: number;
  /** False when at least one entry has no value for a macronutrient (sums then cover the known values only). */
  macrosComplete: boolean;
};

export function journalDay(store: WheightyStore, date: string): JournalDay {
  const entries = store.foodJournal.entries
    .filter((e) => e.date === date)
    .sort((a, b) => (a.consumedTime !== b.consumedTime ? (a.consumedTime < b.consumedTime ? -1 : 1) : a.loggedAt === b.loggedAt ? 0 : a.loggedAt < b.loggedAt ? -1 : 1));
  const sum = (pick: (n: FoodNutrients) => number | null) => round2(entries.reduce((acc, e) => acc + (pick(e.intake) ?? 0), 0));
  return {
    date,
    entries,
    intakeLoggedKcal: sum((n) => n.energyKcal),
    intakeLoggedProteinG: sum((n) => n.proteinG),
    intakeLoggedCarbsG: sum((n) => n.carbsG),
    intakeLoggedFatG: sum((n) => n.fatG),
    macrosComplete: entries.every((e) => e.intake.proteinG !== null && e.intake.carbsG !== null && e.intake.fatG !== null),
  };
}

export type RecentFood = { key: string; lastEntry: FoodEntry } & ({ kind: 'resolved'; food: ResolvedFood } | { kind: 'manual'; food: ManualFood });

/**
 * Distinct foods of the most recent entries, newest first. A resolved food is reused with the
 * snapshot of its last entry (values and resolution date unchanged), never re-read from a source.
 */
export function recentFoods(store: WheightyStore, limit = 12): RecentFood[] {
  const sorted = [...store.foodJournal.entries].sort((a, b) => (a.loggedAt === b.loggedAt ? 0 : a.loggedAt < b.loggedAt ? 1 : -1));
  const seen = new Set<string>();
  const out: RecentFood[] = [];
  for (const e of sorted) {
    const key = e.source === 'manual' ? `manual:${e.name}|${e.intake.energyKcal}|${e.quantity?.grams ?? ''}` : `${e.source}:${e.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (e.source !== 'manual' && e.sourceId !== null && e.sourceVersion !== null && e.per100g !== null) {
      const food: ResolvedFood = { source: e.source, sourceId: e.sourceId, sourceVersion: e.sourceVersion, resolvedAt: e.resolvedAt, name: e.name, per100g: { ...e.per100g }, ...(e.brand ? { brand: e.brand } : {}) };
      out.push({ key, lastEntry: e, kind: 'resolved', food });
    } else {
      out.push({ key, lastEntry: e, kind: 'manual', food: { name: e.name, intake: { ...e.intake }, grams: e.quantity?.grams ?? null } });
    }
    if (out.length >= limit) break;
  }
  return out;
}
