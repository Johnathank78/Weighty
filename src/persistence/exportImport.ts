/** JSON export and validated import (07 sections 2 and 14). */
import type { WheightyStore } from '@/domain/types';
import { migrateToCurrent } from './migrations';
import { isObject, validateStore } from './schema';

export const EXPORT_FORMAT = 'wheighty-export';
/**
 * Version 2 (report 49, point 1a): `app` (build, model, schema), `device` (time zone, offset, language, user agent, display
 * mode) and `diagnostics` (derived at the export, never read back) around the whole store. Version 1 files still import.
 */
export const EXPORT_FORMAT_VERSION = 2;

/** Build of the code in service: short commit and date, injected at build time (`__WHEIGHTY_BUILD__`, vite.config.ts). */
export type BuildInfo = { commit: string; date: string | null };
export type AppInfo = { build: BuildInfo; scientificModelVersion: string; schemaVersion: number };
export type DeviceInfo = { timeZone: string | null; utcOffsetMinutes: number; language: string | null; userAgent: string | null; displayMode: 'standalone' | 'browser' | null };

export type ExportEnvelope = {
  format: typeof EXPORT_FORMAT;
  formatVersion: number;
  exportedAt: string;
  app?: AppInfo;
  device?: DeviceInfo;
  store: WheightyStore;
  diagnostics?: unknown;
};

/**
 * Keeps the non-finite numbers and -0 of the diagnostics apart (as the serializer of the captures R and S); the store never
 * holds such values, so it is written as before.
 */
function exactReplacer(_key: string, v: unknown): unknown {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'NaN';
    if (v === Number.POSITIVE_INFINITY) return '+Infinity';
    if (v === Number.NEGATIVE_INFINITY) return '-Infinity';
    if (Object.is(v, -0)) return '-0';
  }
  if (v instanceof Float64Array) return Array.from(v);
  return v;
}

export function exportStore(store: WheightyStore, nowIso: string, extras: { app?: AppInfo; device?: DeviceInfo; diagnostics?: unknown } = {}): string {
  const envelope: ExportEnvelope = {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: nowIso,
    ...(extras.app ? { app: extras.app } : {}),
    ...(extras.device ? { device: extras.device } : {}),
    store,
    ...(extras.diagnostics !== undefined ? { diagnostics: extras.diagnostics } : {}),
  };
  return JSON.stringify(envelope, exactReplacer, 2);
}

/** File name with the local day and time of the export: `wheighty-2026-10-24-2344.json`. */
export function exportFileName(todayIso: string, localTime?: string): string {
  return localTime ? `wheighty-${todayIso}-${localTime.replace(':', '')}.json` : `wheighty-${todayIso}.json`;
}

export type ImportResult =
  | { ok: true; store: WheightyStore; summary: { weights: number; dailyLogs: number; calibrations: number; hasProfile: boolean; foodEntries: number } }
  | { ok: false; error: 'invalid_json' | 'not_wheighty_export' | 'unsupported_version' | 'invalid_content'; details?: Array<{ path: string; reason: string }> };

/**
 * Parses and validates an export file. Import is all-or-nothing: any invalid record
 * rejects the file so the current data is never replaced by a partially broken copy.
 */
export function parseImport(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
  if (!isObject(parsed)) return { ok: false, error: 'not_wheighty_export' };
  // The diagnostics, the app and the device blocks (version 2) are never read back: only the store is imported.
  const rawStore = parsed.format === EXPORT_FORMAT ? parsed.store : parsed;
  if (parsed.format === EXPORT_FORMAT && (typeof parsed.formatVersion !== 'number' || parsed.formatVersion > EXPORT_FORMAT_VERSION)) {
    return { ok: false, error: 'unsupported_version' };
  }
  if (!isObject(rawStore) || !('weights' in rawStore || 'profile' in rawStore)) return { ok: false, error: 'not_wheighty_export' };
  const migrated = migrateToCurrent(rawStore);
  if (!migrated.ok) return { ok: false, error: migrated.error === 'future_schema_version' ? 'unsupported_version' : 'invalid_content' };
  const validated = validateStore(migrated.value);
  if ('error' in validated) return { ok: false, error: 'invalid_content', details: [{ path: '', reason: validated.error }] };
  if (!validated.clean) return { ok: false, error: 'invalid_content', details: validated.dropped };
  const s = validated.store;
  s.meta.recoveredCorruptData = null;
  // Network access is a per-device consent (J-03): a file never switches it on.
  s.preferences.productSearchEnabled = false;
  return {
    ok: true,
    store: s,
    summary: { weights: s.weights.length, dailyLogs: s.dailyLogs.length, calibrations: s.calibrationSnapshots.length, hasProfile: s.profile !== null, foodEntries: s.foodJournal.entries.length },
  };
}
