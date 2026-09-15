/**
 * Calibration off the main thread (IMPLEMENTATION_NOTES P-01). The full weigh-in history is re-fitted on every change;
 * running it here keeps typing and navigation fluid with a long history. Pure computation, no network, no storage.
 */
import { computeCalibrationState } from '@/domain/engine';
import type { CalibrationRequest, CalibrationResponse } from './calibrationClient';

const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<CalibrationRequest>) => void) | null; postMessage: (message: CalibrationResponse) => void };

scope.onmessage = (event) => {
  const { id, store, today, nowIso } = event.data;
  try {
    scope.postMessage({ id, ok: true, state: computeCalibrationState(store, today, nowIso) });
  } catch (error) {
    scope.postMessage({ id, ok: false, message: error instanceof Error ? error.message : String(error) });
  }
};
