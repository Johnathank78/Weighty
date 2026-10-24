/**
 * Calibration off the main thread (IMPLEMENTATION_NOTES P-01). The full weigh-in history is re-fitted on every change;
 * running it here keeps typing and navigation fluid with a long history. Pure computation, no network, no storage.
 */
import { calibrationAnswer } from './calibrationClient';
import type { CalibrationRequest, CalibrationResponse } from './calibrationClient';

const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<CalibrationRequest>) => void) | null; postMessage: (message: CalibrationResponse) => void };

scope.onmessage = (event) => {
  const { id } = event.data;
  try {
    // The takeover of a personal target (report 47, point 1c) is computed here too, so that it never blocks the interface.
    scope.postMessage({ id, ok: true, ...calibrationAnswer(event.data) });
  } catch (error) {
    scope.postMessage({ id, ok: false, message: error instanceof Error ? error.message : String(error) });
  }
};
