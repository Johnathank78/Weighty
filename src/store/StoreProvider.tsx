import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { WheightyStore } from '@/domain/types';
import { ensureDailyLogs } from '@/domain/engine';
import type { CalibrationState } from '@/domain/engine';
import { calibrationFingerprint, createCalibrationRunner } from './calibrationClient';
import type { CalibrationRunner } from './calibrationClient';
import { browserStorage, deleteAllData, loadStore, saveStore } from '@/persistence/storage';
import type { KeyValueStorage, LoadResult } from '@/persistence/storage';
import { emptyStore } from '@/persistence/schema';
import { localIsoDate } from '@/science/dates';

type StoreContextValue = {
  store: WheightyStore;
  today: string;
  nowIso: () => string;
  loadStatus: LoadResult['status'];
  saveError: boolean;
  /** Replace the whole store (validated domain results only). */
  commit: (next: WheightyStore) => void;
  update: (fn: (current: WheightyStore) => WheightyStore) => void;
  wipe: () => void;
  /** Last computed calibration state; it may describe the previous store while calibrationPending is true. */
  calibration: CalibrationState | null;
  /** A calibration for the current store is being computed (off the main thread). */
  calibrationPending: boolean;
};

/** Debounce of the calibration after a store change, so a burst of edits runs a single fit. */
const CALIBRATION_DEBOUNCE_MS = 300;

const StoreContext = createContext<StoreContextValue | null>(null);

function useToday(): string {
  const [today, setToday] = useState(() => localIsoDate(new Date()));
  useEffect(() => {
    const refresh = () => setToday(localIsoDate(new Date()));
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return today;
}

export function StoreProvider({ children, storage: injected }: { children: ReactNode; storage?: KeyValueStorage | null }) {
  const storageRef = useRef<KeyValueStorage | null>(injected === undefined ? browserStorage() : injected);
  const today = useToday();
  const [initial] = useState(() => loadStore(storageRef.current, new Date().toISOString()));
  const [store, setStore] = useState<WheightyStore>(() => (initial.store.plan ? ensureDailyLogs(initial.store, localIsoDate(new Date())) : initial.store));
  const [saveError, setSaveError] = useState(false);
  const skipFirstSave = useRef(initial.status === 'loaded' || initial.status === 'empty');
  const wiped = useRef(false);

  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      if (initial.store === store) return;
    }
    // After a full deletion nothing is written back until the user creates new data.
    if (wiped.current && store.profile === null && store.weights.length === 0) return;
    wiped.current = false;
    const result = saveStore(storageRef.current, store);
    setSaveError(!result.ok && result.error !== 'unavailable');
  }, [store, initial.store]);

  useEffect(() => {
    setStore((s) => (s.plan ? ensureDailyLogs(s, today) : s));
  }, [today]);

  const commit = useCallback((next: WheightyStore) => setStore(next), []);
  const update = useCallback((fn: (current: WheightyStore) => WheightyStore) => setStore((s) => fn(s)), []);
  const wipe = useCallback(() => {
    deleteAllData(storageRef.current);
    wiped.current = true;
    setStore(emptyStore());
  }, []);
  const nowIso = useCallback(() => new Date().toISOString(), []);

  const runner = useRef<CalibrationRunner | null>(null);
  const requestId = useRef(0);
  const [calibration, setCalibration] = useState<{ key: string; state: CalibrationState | null } | null>(null);
  const needsCalibration = store.plan !== null && store.profile !== null;
  const calibrationKey = needsCalibration ? calibrationFingerprint(store, today) : 'none';
  const latestStore = useRef(store);
  latestStore.current = store;

  useEffect(() => {
    runner.current = createCalibrationRunner();
    return () => {
      runner.current?.dispose();
      runner.current = null;
    };
  }, []);

  useEffect(() => {
    if (!needsCalibration) return;
    const id = ++requestId.current;
    const timer = window.setTimeout(() => {
      runner.current?.run({ id, store: latestStore.current, today, nowIso: new Date().toISOString() }, (response) => {
        // Answers to an older store are ignored: only the latest request may update the state.
        if (response.id !== requestId.current) return;
        if (response.ok) setCalibration({ key: calibrationKey, state: response.state });
        else console.error('Calibration failed:', response.message);
      });
    }, CALIBRATION_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [calibrationKey, needsCalibration, today]);

  const calibrationState = needsCalibration ? (calibration?.state ?? null) : null;
  const calibrationPending = needsCalibration && calibration?.key !== calibrationKey;

  const value = useMemo<StoreContextValue>(
    () => ({ store, today, nowIso, loadStatus: initial.status, saveError, commit, update, wipe, calibration: calibrationState, calibrationPending }),
    [store, today, nowIso, initial.status, saveError, commit, update, wipe, calibrationState, calibrationPending],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useWheighty(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useWheighty must be used inside StoreProvider');
  return ctx;
}
