/**
 * Report 49, points 1e, 1f and 6.6 on the real export (local experiment, never in `npm run check`): migration of the export
 * of 24/10 to schema 11 without loss, sizes (export before and after, activity log after a year, cost of a write), and the
 * round trip export, import, export. Skipped when the file is missing. Writes figures only, to
 * tests/experiments-journal/results/6a/ (ignored); never a name, never a food.
 * Run: npx vitest run -c vitest.journal.config.ts sixa/realExport
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { activityEntry, appendActivity, ACTIVITY_LOG_MAX_ENTRIES } from '@/domain/activityLog';
import { buildDiagnostics } from '@/domain/diagnostics';
import type { ActivityEntry, ActivityType, WheightyStore } from '@/domain/types';
import { exportStore, parseImport } from '@/persistence/exportImport';
import { validateStore } from '@/persistence/schema';
import { addDays } from '@/science/dates';

const FILES = [process.env.WHEIGHTY_REAL_EXPORT ?? 'prompt/donnees/sara-2026-10-24.json', process.env.WHEIGHTY_REAL_EXPORT_2].filter((f): f is string => typeof f === 'string');
const OUT = 'tests/experiments-journal/results/6a';

function stripIds(x: unknown): unknown {
  return JSON.parse(JSON.stringify(x));
}

for (const file of FILES) {
  it.runIf(existsSync(file))(`real export ${FILES.indexOf(file) + 1}: migration without loss, sizes, round trip`, () => {
    const text = readFileSync(file, 'utf8');
    const raw = JSON.parse(text) as { formatVersion: number; exportedAt: string; store: Record<string, unknown> };
    const before = raw.store as unknown as WheightyStore;
    const imported = parseImport(text);
    if (!imported.ok) throw new Error(imported.error);
    const s = imported.store;
    // 1e: nothing lost. Every field kept as it was; the trace gains only backfilled entries.
    const kept = (['profile', 'plan', 'weights', 'dailyLogs', 'calibrationSnapshots', 'historicalEvidence', 'foodJournal'] as const).map((k) => [k, JSON.stringify(s[k]) === JSON.stringify(before[k])]);
    const metaSame = JSON.stringify({ ...s.meta, planEvents: null }) === JSON.stringify({ ...before.meta, planEvents: null });
    const oldEvents = before.meta.planEvents;
    const newEvents = s.meta.planEvents;
    const oldKept = oldEvents.every((e) => newEvents.some((n) => JSON.stringify(n) === JSON.stringify(e)));
    const added = newEvents.filter((n) => !oldEvents.some((e) => e.id === n.id));
    const today = raw.exportedAt.slice(0, 10);
    const nowIso = raw.exportedAt;

    // 1f: sizes. The export as it was, then version 2 with its diagnostics (code in service, day of the export).
    const diagnostics = buildDiagnostics(s, today, nowIso);
    const v2 = exportStore(s, nowIso, { app: { build: { commit: 'dev', date: null }, scientificModelVersion: '-', schemaVersion: 11 }, device: { timeZone: 'Europe/Paris', utcOffsetMinutes: 120, language: 'fr-FR', userAgent: 'x', displayMode: 'standalone' }, diagnostics });
    const blockSizes = Object.fromEntries(Object.entries(diagnostics).map(([k, v]) => [k, JSON.stringify(v ?? null).length]));
    const errors = Object.entries(diagnostics).filter(([, v]) => JSON.stringify(v ?? null).includes('"error":')).map(([k]) => k);

    // Activity log after a year of daily use: an assumed day (3 openings, 2 returns to the foreground, 4 food entries, a
    // weigh-in every other day, 1 adherence, 1 steps, 2 calibration results, 1 daily check, 1 message shown) on the
    // real entries' shape. 15.5 entries a day: the cap (5 000) is reached in 323 days.
    const day = (d: string, i: number): ActivityEntry[] => {
      const at = new Date(`${d}T${String(7 + (i % 12)).padStart(2, '0')}:00:00.000Z`);
      const e = (type: ActivityType, data: Record<string, unknown>) => activityEntry(type, data, at);
      const out = [
        e('app_open', { reason: 'start', build: '71bc77e 2026-11-11T10:00:00.000Z', scientificModelVersion: '1.9.0', schemaVersion: 11 }),
        e('app_open', { reason: 'foreground', build: '71bc77e 2026-11-11T10:00:00.000Z', scientificModelVersion: '1.9.0', schemaVersion: 11 }),
        e('app_open', { reason: 'foreground', build: '71bc77e 2026-11-11T10:00:00.000Z', scientificModelVersion: '1.9.0', schemaVersion: 11 }),
        e('daily_checks', { deducedAdherence: [{ date: d, value: 'on_plan', source: 'journal' }], planEvents: [], by: 'daily_checks' }),
        e('calibration', { gate: { met: true, weighInCount: 40, spanDays: 120, cleanWeighInCount: 40, adherenceCoverage: 0.8123, periodStart: '2026-09-15', pauses: [] }, surfaced: false, blockedByStaleWeighIn: false, candidate: { medianOffsetKcal: -301.8, interval80: [-512.3, -91.1], confidence: 'medium', proposedMaintenanceKcal: 2093.4 } }),
        e('calibration', { gate: { met: true, weighInCount: 41, spanDays: 121, cleanWeighInCount: 41, adherenceCoverage: 0.8131, periodStart: '2026-09-15', pauses: [] }, surfaced: false, blockedByStaleWeighIn: false, candidate: { medianOffsetKcal: -300.2, interval80: [-510.3, -90.1], confidence: 'medium', proposedMaintenanceKcal: 2094.4 } }),
        e('message', { action: 'shown', kind: 'periodic_replan', eventId: 'e-20261024214130138-k3j2h1', by: 'user' }),
        e('adherence', { date: d, value: 'on_plan', source: 'user', previous: null, by: 'user' }),
        e('steps', { date: d, value: 9500, previous: null, by: 'user' }),
        e('app_open', { reason: 'foreground', build: '71bc77e 2026-11-11T10:00:00.000Z', scientificModelVersion: '1.9.0', schemaVersion: 11 }),
        e('app_open', { reason: 'foreground', build: '71bc77e 2026-11-11T10:00:00.000Z', scientificModelVersion: '1.9.0', schemaVersion: 11 }),
      ];
      for (let k = 0; k < 4; k++) out.push(e('food', { action: 'add', id: `j-20261024${k}-abcdef`, date: d, kcal: 412.5, consumedTime: '12:30', by: 'user' }));
      if (i % 2 === 0) out.push(e('weight', { action: 'add', id: 'w-20261024214130138-k3j2h1', before: null, after: { date: d, weightKg: 67.6 }, by: 'user' }));
      return out;
    };
    let year = { ...s, activityLog: { entries: [], droppedCount: 0 } } as WheightyStore;
    let perDay = 0;
    for (let i = 0; i < 365; i++) {
      const entries = day(addDays('2026-11-01', i), i);
      perDay += entries.length;
      year = appendActivity(year, entries);
    }
    const logBytes = JSON.stringify(year.activityLog).length;
    // Cost of one write: what the provider does on each change (validation, then serialisation), with a full log.
    const t0 = performance.now();
    const runs = 20;
    for (let r = 0; r < runs; r++) {
      const v = validateStore(year);
      if ('error' in v) throw new Error(v.error);
      JSON.stringify(year);
    }
    const writeMs = (performance.now() - t0) / runs;
    const t1 = performance.now();
    for (let r = 0; r < runs; r++) {
      const v = validateStore(s);
      if ('error' in v) throw new Error(v.error);
      JSON.stringify(s);
    }
    const writeMsNoLog = (performance.now() - t1) / runs;

    // 6.6: export, import, export again: the same store but the import entry and productSearchEnabled.
    const again = parseImport(exportStore(s, nowIso, { diagnostics }));
    if (!again.ok) throw new Error(again.error);
    const roundTrip = JSON.stringify(stripIds(again.store)) === JSON.stringify(stripIds({ ...s, preferences: { ...s.preferences, productSearchEnabled: false } }));

    const result = {
      file: FILES.indexOf(file) + 1,
      formatVersion: raw.formatVersion,
      schemaBefore: before.schemaVersion,
      schemaAfter: s.schemaVersion,
      kept,
      metaSame,
      oldEventsKept: oldKept,
      eventsBefore: oldEvents.length,
      eventsAfter: newEvents.length,
      added: added.map((e) => ({ rule: e.rule, date: e.date, backfilled: e.backfilled ?? false, offsetKcal: e.calibration?.offsetKcal ?? null, position: newEvents.indexOf(e) })),
      sizes: { exportV1Bytes: text.length, exportV2Bytes: v2.length, storeBytes: JSON.stringify(s).length, diagnosticsBytes: JSON.stringify(diagnostics).length, blockSizes },
      diagnosticsErrors: errors,
      year: { entriesPerDay: perDay / 365, entries: year.activityLog.entries.length, dropped: year.activityLog.droppedCount, cap: ACTIVITY_LOG_MAX_ENTRIES, logBytes, storeWithLogBytes: JSON.stringify(year).length, writeMs, writeMsNoLog },
      roundTrip,
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/real-export-${result.file}.json`, `${JSON.stringify(result, null, 2)}\n`);
    expect(kept.every(([, same]) => same)).toBe(true);
    expect(metaSame).toBe(true);
    expect(oldKept).toBe(true);
    expect(errors).toEqual([]);
    expect(roundTrip).toBe(true);
  });
}
