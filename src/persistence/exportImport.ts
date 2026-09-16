/** JSON export and validated import (07 sections 2 and 14). */
import type { WheightyStore } from '@/domain/types';
import { migrateToCurrent } from './migrations';
import { isObject, validateStore } from './schema';

export const EXPORT_FORMAT = 'wheighty-export';
export const EXPORT_FORMAT_VERSION = 1;

export type ExportEnvelope = {
  format: typeof EXPORT_FORMAT;
  formatVersion: number;
  exportedAt: string;
  store: WheightyStore;
};

export function exportStore(store: WheightyStore, nowIso: string): string {
  const envelope: ExportEnvelope = { format: EXPORT_FORMAT, formatVersion: EXPORT_FORMAT_VERSION, exportedAt: nowIso, store };
  return JSON.stringify(envelope, null, 2);
}

export function exportFileName(todayIso: string): string {
  return `wheighty-${todayIso}.json`;
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
