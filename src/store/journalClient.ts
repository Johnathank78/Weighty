/**
 * Runner of the weekly evaluation of the journal path (pass 5b): a Web Worker when available, a synchronous fallback
 * otherwise (tests, old browsers). Results carry the request id; the store applies them with `applyJournalWeek`.
 */
import { evaluateJournalWeek } from '@/domain/journalPath';
import type { JournalWeek } from '@/domain/journalPath';
import type { WheightyStore } from '@/domain/types';

export type JournalWeekRequest = { id: number; store: WheightyStore; today: string; nowIso: string };
export type JournalWeekResponse = { id: number; ok: true; week: JournalWeek } | { id: number; ok: false; message: string };

export type JournalWeekRunner = {
  run: (request: JournalWeekRequest, onResult: (response: JournalWeekResponse) => void) => void;
  dispose: () => void;
};

function synchronousRunner(): JournalWeekRunner {
  return {
    run: (request, onResult) => {
      try {
        onResult({ id: request.id, ok: true, week: evaluateJournalWeek(request.store, request.today, request.nowIso) });
      } catch (error) {
        onResult({ id: request.id, ok: false, message: error instanceof Error ? error.message : String(error) });
      }
    },
    dispose: () => undefined,
  };
}

export function createJournalWeekRunner(): JournalWeekRunner {
  if (typeof Worker === 'undefined') return synchronousRunner();
  let worker: Worker;
  try {
    worker = new Worker(new URL('./journal.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return synchronousRunner();
  }
  let listener: ((response: JournalWeekResponse) => void) | null = null;
  worker.onmessage = (event: MessageEvent<JournalWeekResponse>) => listener?.(event.data);
  return {
    run: (request, onResult) => {
      listener = onResult;
      worker.postMessage(request);
    },
    dispose: () => worker.terminate(),
  };
}
