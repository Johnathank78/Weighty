/**
 * Local persistence: one versioned root object in localStorage (07 section 2).
 * Writes serialise the complete validated object. Unreadable data is copied to a
 * recovery key before anything else is written, so valid history is never lost.
 */
import type { WheightyStore } from '@/domain/types';
import { migrateToCurrent } from './migrations';
import { emptyStore, validateStore } from './schema';

export const STORE_KEY = 'wheighty:store';
export const RECOVERY_KEY_PREFIX = 'wheighty:recovery:';

export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
};

export type LoadResult = {
  store: WheightyStore;
  status: 'empty' | 'loaded' | 'migrated' | 'recovered_partial' | 'recovered_corrupt' | 'unavailable';
  /** Recovery key holding the untouched original text, when one was written. */
  recoveryKey: string | null;
  dropped: Array<{ path: string; reason: string }>;
};

export class MemoryStorage implements KeyValueStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  get length(): number {
    return this.data.size;
  }
}

export function browserStorage(): KeyValueStorage | null {
  try {
    const s = globalThis.localStorage;
    const probe = '__wheighty_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function preserveRaw(storage: KeyValueStorage, raw: string, nowIso: string): string | null {
  const key = `${RECOVERY_KEY_PREFIX}${nowIso}`;
  try {
    storage.setItem(key, raw);
    return key;
  } catch {
    return null;
  }
}

export function loadStore(storage: KeyValueStorage | null, nowIso: string): LoadResult {
  if (!storage) return { store: emptyStore(), status: 'unavailable', recoveryKey: null, dropped: [] };
  const raw = storage.getItem(STORE_KEY);
  if (raw === null) return { store: emptyStore(), status: 'empty', recoveryKey: null, dropped: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const recoveryKey = preserveRaw(storage, raw, nowIso);
    const store = emptyStore();
    store.meta.recoveredCorruptData = recoveryKey ? { savedAt: nowIso, key: recoveryKey } : null;
    return { store, status: 'recovered_corrupt', recoveryKey, dropped: [{ path: '', reason: 'invalid_json' }] };
  }

  const migrated = migrateToCurrent(parsed);
  if (!migrated.ok) {
    const recoveryKey = preserveRaw(storage, raw, nowIso);
    const store = emptyStore();
    store.meta.recoveredCorruptData = recoveryKey ? { savedAt: nowIso, key: recoveryKey } : null;
    return { store, status: 'recovered_corrupt', recoveryKey, dropped: [{ path: '', reason: migrated.error }] };
  }

  const validated = validateStore(migrated.value);
  if ('error' in validated) {
    const recoveryKey = preserveRaw(storage, raw, nowIso);
    const store = emptyStore();
    store.meta.recoveredCorruptData = recoveryKey ? { savedAt: nowIso, key: recoveryKey } : null;
    return { store, status: 'recovered_corrupt', recoveryKey, dropped: [{ path: '', reason: validated.error }] };
  }
  if (!validated.clean) {
    const recoveryKey = preserveRaw(storage, raw, nowIso);
    const store = validated.store;
    store.meta.recoveredCorruptData = recoveryKey ? { savedAt: nowIso, key: recoveryKey } : null;
    return { store, status: 'recovered_partial', recoveryKey, dropped: validated.dropped };
  }
  return { store: validated.store, status: migrated.fromVersion === validated.store.schemaVersion ? 'loaded' : 'migrated', recoveryKey: null, dropped: [] };
}

export type SaveResult = { ok: true } | { ok: false; error: 'unavailable' | 'invalid_store' | 'write_failed' };

export function saveStore(storage: KeyValueStorage | null, store: WheightyStore): SaveResult {
  if (!storage) return { ok: false, error: 'unavailable' };
  const check = validateStore(store);
  if ('error' in check || !check.clean) return { ok: false, error: 'invalid_store' };
  const serialized = JSON.stringify(store);
  try {
    storage.setItem(STORE_KEY, serialized);
    return { ok: true };
  } catch {
    return { ok: false, error: 'write_failed' };
  }
}

/** Removes the store and every recovery copy (explicit user deletion only). */
export function deleteAllData(storage: KeyValueStorage | null): void {
  if (!storage) return;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k !== null && (k === STORE_KEY || k.startsWith(RECOVERY_KEY_PREFIX) || k.startsWith('wheighty:'))) keys.push(k);
  }
  for (const k of keys) storage.removeItem(k);
}
