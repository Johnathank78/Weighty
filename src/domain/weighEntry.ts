/**
 * Entry of a weigh-in on the keypad of "Nouvelle pesée" (UX pass 2, point 6): the field opens empty, the last weigh-in shown
 * greyed as a hint (a placeholder, not a value), so the first key starts a new value; "Enregistrer" waits for a value.
 */
import { latestRawWeight } from './engine';
import { formatWeight } from './format';
import type { UnitPreference, WheightyStore } from './types';

/** The greyed hint of the empty field: the last weigh-in in the user's unit, "0" without any. */
export function weighHint(store: WheightyStore, units: UnitPreference): string {
  const last = latestRawWeight(store);
  return last ? formatWeight(last.weightKg, units).replace(/[\s\u202F]/g, '') : '0';
}

/** A key of the keypad ('0' to '9', ',', 'del') on the value typed so far (unchanged rules: one decimal, three digits). */
export function typeWeighKey(value: string, key: string): string {
  if (key === 'del') return value.slice(0, -1);
  if (key === ',') return value.includes(',') || value === '' ? value : `${value},`;
  const [int = '', frac] = value.split(',');
  if (frac !== undefined) return frac.length >= 1 ? value : `${value}${key}`;
  if (int.length >= 3) return value;
  return value === '0' ? key : `${value}${key}`;
}

/** "Enregistrer" is active once something is typed (the hint is not a value). */
export function weighSaveEnabled(value: string): boolean {
  return value !== '';
}
