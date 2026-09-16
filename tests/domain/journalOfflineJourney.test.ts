/**
 * Complete offline journey (J-04): with any network access trapped, a user searches the embedded Ciqual
 * table, logs a food with a personal portion, logs a manual entry, and the journal survives a reload and
 * an export/import. Product search stays off by default and sends nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenFoodFactsClient } from '@/adapters/openFoodFacts';
import { completeOnboarding } from '@/domain/engine';
import { loadCiqual, resolveCiqualFood, searchIndex } from '@/domain/foodSearch';
import { addFoodEntry, addPortion, foodKey, journalDay, portionsFor, recentFoods } from '@/domain/journal';
import { exportStore, parseImport } from '@/persistence/exportImport';
import { emptyStore } from '@/persistence/schema';
import { loadStore, MemoryStorage, saveStore } from '@/persistence/storage';
import { lookupWithCache } from '@/hooks/useOpenFoodFacts';
import { makeProfile } from '../helpers/profiles';

const TODAY = '2026-09-16';
const NOW = `${TODAY}T12:30:00.000Z`;

describe('offline food journal journey', () => {
  const trapped = vi.fn();
  const original = globalThis.fetch;

  beforeEach(() => {
    trapped.mockReset();
    globalThis.fetch = ((...args: unknown[]) => {
      trapped(...args);
      return Promise.reject(new TypeError('offline'));
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = original;
  });

  it('Ciqual food with a portion, manual entry, persistence and export, without any request', async () => {
    const onboarded = completeOnboarding(emptyStore(), makeProfile({ goal: 'maintenance', targetWeightKg: 70, currentWeightKg: 70, weeklyRateTarget: 0 }), TODAY, NOW);
    if (!onboarded.ok) throw new Error(onboarded.reason);
    let store = onboarded.store;
    expect(store.preferences.productSearchEnabled).toBe(false);
    const planBefore = store.plan;
    const logsBefore = store.dailyLogs;

    // 1. Local search in the embedded table.
    const { index, table } = await loadCiqual();
    const hit = searchIndex(index, 'riz blanc cuit')[0];
    expect(hit).toBeDefined();
    if (!hit) return;
    const food = resolveCiqualFood(hit, table, NOW);

    // 2. A personal portion for this food, then an entry of 1.5 portions.
    const portion = addPortion(store, { label: 'Mon bol', grams: 180, foodKey: foodKey(food.source, food.sourceId) }, NOW);
    if (!portion.ok) throw new Error(portion.reason);
    store = portion.store;
    const [bowl] = portionsFor(store, foodKey(food.source, food.sourceId));
    if (!bowl) throw new Error('portion');
    const entry = addFoodEntry(store, { kind: 'resolved', date: TODAY, localTime: '12:30', food, grams: 1.5 * bowl.grams, portion: { id: bowl.id, label: bowl.label, count: 1.5, gramsEach: bowl.grams } }, NOW);
    if (!entry.ok) throw new Error(entry.reason);
    store = entry.store;

    // 3. Manual entry.
    const manual = addFoodEntry(store, { kind: 'manual', date: TODAY, localTime: '16:00', food: { name: 'Goûter', intake: { energyKcal: 210, proteinG: 4, carbsG: 30, fatG: 8 }, grams: null } }, `${TODAY}T16:00:00.000Z`);
    if (!manual.ok) throw new Error(manual.reason);
    store = manual.store;

    const day = journalDay(store, TODAY);
    expect(day.entries).toHaveLength(2);
    expect(day.intakeLoggedKcal).toBeCloseTo((hit.kcal * 270) / 100 + 210, 1);
    expect(recentFoods(store).map((r) => r.food.name)).toEqual(['Goûter', hit.name]);

    // 4. Plan and daily targets untouched.
    expect(store.plan).toEqual(planBefore);
    expect(store.dailyLogs).toEqual(logsBefore);

    // 5. Persistence (reload) and export / import.
    const storage = new MemoryStorage();
    expect(saveStore(storage, store)).toEqual({ ok: true });
    const reloaded = loadStore(storage, NOW);
    expect(reloaded.status).toBe('loaded');
    expect(reloaded.store.foodJournal).toEqual(store.foodJournal);
    const imported = parseImport(exportStore(reloaded.store, NOW));
    expect(imported.ok && imported.store.foodJournal).toEqual(store.foodJournal);

    // 6. Product search is off: even an explicit lookup sends nothing.
    const off = createOpenFoodFactsClient({ isEnabled: () => store.preferences.productSearchEnabled });
    expect(await lookupWithCache(off, storage, '3017624010701', NOW, () => store.preferences.productSearchEnabled)).toEqual({ kind: 'disabled' });
    expect(await off.searchProducts('riz')).toEqual({ kind: 'disabled' });

    expect(trapped).not.toHaveBeenCalled();
  });

  it('when enabled but offline, the adapter degrades cleanly and the journal keeps working', async () => {
    const off = createOpenFoodFactsClient({ isEnabled: () => true, isOnline: () => false });
    expect(await off.lookupBarcode('3017624010701')).toEqual({ kind: 'offline' });
    expect(trapped).not.toHaveBeenCalled();
    const connectedButFailing = createOpenFoodFactsClient({ isEnabled: () => true, isOnline: () => true });
    expect(await connectedButFailing.searchProducts('riz')).toEqual({ kind: 'unavailable' });
    expect(trapped).toHaveBeenCalledTimes(1);
    const r = addFoodEntry(emptyStore(), { kind: 'manual', date: TODAY, localTime: '09:00', food: { name: 'Café', intake: { energyKcal: 5, proteinG: null, carbsG: null, fatG: null }, grams: null } }, NOW);
    expect(r.ok).toBe(true);
  });
});
