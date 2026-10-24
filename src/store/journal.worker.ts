/**
 * Weekly evaluation of the journal path off the main thread (pass 5b): the journal fit of the measured habit on a long
 * history takes hundreds of milliseconds. Pure computation, no network, no storage. Kept apart from the calibration worker,
 * which never reaches the journal.
 */
import { evaluateJournalWeek } from '@/domain/journalPath';
import type { JournalWeekRequest, JournalWeekResponse } from './journalClient';

const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<JournalWeekRequest>) => void) | null; postMessage: (message: JournalWeekResponse) => void };

scope.onmessage = (event) => {
  const { id, store, today, nowIso } = event.data;
  try {
    scope.postMessage({ id, ok: true, week: evaluateJournalWeek(store, today, nowIso) });
  } catch (error) {
    scope.postMessage({ id, ok: false, message: error instanceof Error ? error.message : String(error) });
  }
};
