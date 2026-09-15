/**
 * Calibration runner used by the store (IMPLEMENTATION_NOTES P-01): a Web Worker when available, a synchronous
 * fallback otherwise (tests, old browsers). Results carry the request id so late answers to older stores are ignored.
 */
import { computeCalibrationState } from '@/domain/engine';
import type { CalibrationState } from '@/domain/engine';
import type { WheightyStore } from '@/domain/types';

export type CalibrationRequest = { id: number; store: WheightyStore; today: string; nowIso: string };
export type CalibrationResponse = { id: number; ok: true; state: CalibrationState | null } | { id: number; ok: false; message: string };

export type CalibrationRunner = {
  run: (request: CalibrationRequest, onResult: (response: CalibrationResponse) => void) => void;
  dispose: () => void;
};

function synchronousRunner(): CalibrationRunner {
  return {
    run: (request, onResult) => {
      try {
        onResult({ id: request.id, ok: true, state: computeCalibrationState(request.store, request.today, request.nowIso) });
      } catch (error) {
        onResult({ id: request.id, ok: false, message: error instanceof Error ? error.message : String(error) });
      }
    },
    dispose: () => undefined,
  };
}

export function createCalibrationRunner(): CalibrationRunner {
  if (typeof Worker === 'undefined') return synchronousRunner();
  let worker: Worker;
  try {
    worker = new Worker(new URL('./calibration.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return synchronousRunner();
  }
  let listener: ((response: CalibrationResponse) => void) | null = null;
  worker.onmessage = (event: MessageEvent<CalibrationResponse>) => listener?.(event.data);
  return {
    run: (request, onResult) => {
      listener = onResult;
      worker.postMessage(request);
    },
    dispose: () => worker.terminate(),
  };
}

/**
 * Cheap fingerprint of every store field the calibration state depends on (FNV-1a over a compact serialisation),
 * instead of stringifying the whole daily log on each render.
 */
export function calibrationFingerprint(store: WheightyStore, today: string): string {
  let h = 0x811c9dc5;
  const feed = (value: string | number | undefined | null) => {
    const s = value === undefined || value === null ? '~' : String(value);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x7c;
    h = Math.imul(h, 0x01000193);
  };
  feed(today);
  for (const w of store.weights) {
    feed(w.id);
    feed(w.date);
    feed(w.weightKg);
    feed(w.createdAt);
  }
  for (const l of store.dailyLogs) {
    feed(l.date);
    feed(l.adherence);
    feed(l.actualSteps);
    feed(l.calorieTargetForDay);
    feed(l.stepTargetForDay);
    feed(l.macrosForDay?.carbsG);
  }
  feed(JSON.stringify(store.profile));
  feed(JSON.stringify(store.plan ? { createdAt: store.plan.createdAt, maintenanceKcal: store.plan.maintenanceKcal, interval: store.plan.maintenanceInterval80, goal: store.plan.goal, palCategory: store.plan.palCategory } : null));
  feed(JSON.stringify(store.meta.lastSurfacedCalibration));
  feed(store.meta.initialPalCategory);
  feed(JSON.stringify(store.historicalEvidence));
  for (const s of store.calibrationSnapshots) feed(`${s.createdAt}|${s.appliedAt ?? ''}|${s.confidence}`);
  return `${store.weights.length}:${store.dailyLogs.length}:${(h >>> 0).toString(36)}`;
}
