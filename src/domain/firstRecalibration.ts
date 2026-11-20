/**
 * First recalibration (report 50, UX pass 3, point 2, decision E2 of the product owner): a recalibration shown (`surfaced`)
 * while no recalibration was ever applied (`hasAppliedRecalibration` false). At the next opening of the app (start or return
 * to the foreground), once the calibration of the day is ready, its screen opens by itself, once per store
 * (`AppMeta.firstRecalibrationOpenedOn`, schema 12). Not on a personal target: the app takes it over by itself, with its short
 * message (decision of 23/10). The later recalibrations stay discreet. Nothing here changes a threshold of 05 s12: only the
 * moment the recalibration is marked seen changes, on the screen opened by itself (`RecalibrationScreen`).
 */
import { hasAppliedRecalibration } from './engine';
import type { CalibrationState } from './engine';
import type { WheightyStore } from './types';

/** A first recalibration is shown: surfaced, a candidate, no recalibration applied yet, not on a personal target. */
export function firstRecalibrationShown(store: WheightyStore, state: CalibrationState | null): boolean {
  const plan = store.plan;
  if (!plan || !store.profile || plan.source === 'personal_target') return false;
  return state !== null && state.surfaced && state.candidate !== null && state.proposedMaintenanceKcal !== null && !hasAppliedRecalibration(store);
}

/**
 * The screen of the first recalibration opens by itself now: never opened by itself before, a first recalibration shown, and
 * the calibration computed for the current store (`pending` false). Where it may open on the navigation (no onboarding, no
 * sheet, no other decision screen) is the navigation's part (`autoOpenAllowed`). The decision cards of the journal path wait
 * while a recalibration is shown (point 6d, `journalCardsWait`): none is on display then.
 */
export function firstRecalibrationAutoOpenDue(store: WheightyStore, state: CalibrationState | null, pending: boolean): boolean {
  return store.meta.firstRecalibrationOpenedOn === null && !pending && firstRecalibrationShown(store, state);
}

/** The screen opened by itself on `today`: it never opens by itself again for this store, answered or not. */
export function markFirstRecalibrationOpened(store: WheightyStore, today: string): WheightyStore {
  return store.meta.firstRecalibrationOpenedOn === null ? { ...store, meta: { ...store.meta, firstRecalibrationOpenedOn: today } } : store;
}
