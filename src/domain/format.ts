/**
 * Display formatting (instruct/00 and 07 s9 precision rules). No science here:
 * only rounding for display and unit conversion.
 */
import { DISPLAY_KCAL_ROUNDING, DISPLAY_STEPS_ROUNDING, DISPLAY_WEIGHT_DECIMALS } from '@/science/constants';
import type { UnitPreference } from './types';

/** Narrow no-break space used as French thousands separator. */
export const THIN_SPACE = ' ';
/** Typographic minus sign for negative values (the em dash is forbidden in UI copy). */
export const MINUS = '−';

export const KG_PER_LB = 0.45359237;
export const CM_PER_INCH = 2.54;
export const INCHES_PER_FOOT = 12;

function groupThousands(integer: number): string {
  return Math.abs(integer).toString().replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
}

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function formatKcal(kcal: number): string {
  const r = roundTo(kcal, DISPLAY_KCAL_ROUNDING);
  return (r < 0 ? MINUS : '') + groupThousands(r);
}

export function formatSignedKcal(kcal: number): string {
  const r = roundTo(kcal, DISPLAY_KCAL_ROUNDING);
  if (r === 0) return '0';
  return (r > 0 ? '+' : MINUS) + groupThousands(r);
}

export function formatSteps(steps: number): string {
  return groupThousands(roundTo(steps, DISPLAY_STEPS_ROUNDING));
}

/** Raw integer with grouping (e.g. logged steps, counts). */
export function formatInteger(n: number): string {
  return (n < 0 ? MINUS : '') + groupThousands(Math.round(n));
}

export function formatGrams(g: number): string {
  return groupThousands(Math.round(g));
}

function decimal(value: number, decimals: number): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const grouped = groupThousands(Number(int));
  return frac ? `${grouped},${frac}` : grouped;
}

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}
export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function weightUnitLabel(units: UnitPreference): string {
  return units === 'imperial' ? 'lb' : 'kg';
}

/** Weight value in the preferred unit, 0.1 precision, French decimal comma. */
export function formatWeight(kg: number, units: UnitPreference): string {
  const value = units === 'imperial' ? kgToLb(kg) : kg;
  return (value < 0 ? MINUS : '') + decimal(value, DISPLAY_WEIGHT_DECIMALS);
}

export function formatSignedWeight(kg: number, units: UnitPreference, decimals = DISPLAY_WEIGHT_DECIMALS): string {
  const value = units === 'imperial' ? kgToLb(kg) : kg;
  const rounded = Number(value.toFixed(decimals));
  if (rounded === 0) return decimal(0, decimals);
  return (rounded > 0 ? '+' : MINUS) + decimal(rounded, decimals);
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(totalInches / INCHES_PER_FOOT), inches: totalInches % INCHES_PER_FOOT };
}

export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * INCHES_PER_FOOT + inches) * CM_PER_INCH;
}

export function formatHeight(cm: number, units: UnitPreference): string {
  if (units === 'imperial') {
    const { feet, inches } = cmToFeetInches(cm);
    return `${feet} ft ${inches} in`;
  }
  return `${Math.round(cm)} cm`;
}

export function formatKcalRange(interval: readonly [number, number]): string {
  return `${formatKcal(interval[0])} à ${formatKcal(interval[1])}`;
}

/** Interval with both bounds rounded to a coarser step (explanation digest: 50 kcal). */
export function formatKcalRangeRounded(interval: readonly [number, number], step: number): string {
  const bound = (v: number) => {
    const r = roundTo(v, step);
    return (r < 0 ? MINUS : '') + groupThousands(r);
  };
  return `${bound(interval[0])} à ${bound(interval[1])}`;
}

/** Value rounded to a coarser step, with thousands grouping. */
export function formatKcalRounded(kcal: number, step: number): string {
  const r = roundTo(kcal, step);
  return (r < 0 ? MINUS : '') + groupThousands(r);
}

const FRACTION_WORDS: ReadonlyArray<readonly [number, string]> = [
  [1 / 20, 'un vingtième'],
  [1 / 10, 'un dixième'],
  [1 / 8, 'un huitième'],
  [1 / 6, 'un sixième'],
  [1 / 5, 'un cinquième'],
  [1 / 4, 'un quart'],
  [1 / 3, 'un tiers'],
  [2 / 5, 'deux cinquièmes'],
  [1 / 2, 'la moitié'],
  [3 / 5, 'trois cinquièmes'],
  [2 / 3, 'deux tiers'],
  [3 / 4, 'trois quarts'],
  [4 / 5, 'quatre cinquièmes'],
  [9 / 10, 'neuf dixièmes'],
];

/** Closest simple French fraction of a share in [0, 1] ("un sixième", "un tiers", "la moitié"). */
export function formatApproximateFraction(share: number): string {
  let best = FRACTION_WORDS[0] as readonly [number, string];
  for (const f of FRACTION_WORDS) if (Math.abs(f[0] - share) < Math.abs(best[0] - share)) best = f;
  return best[1];
}

export function formatPercent(fraction: number, decimals = 0): string {
  return `${decimal(fraction * 100, decimals)}${THIN_SPACE}%`;
}

/** Weekly rate (fraction of body weight) as a French percent: 0.005 -> "0,5 %", 0.0025 -> "0,25 %". */
export function formatRatePercent(rate: number): string {
  const hundredths = Math.round(rate * 10000);
  return `${decimal(hundredths / 100, hundredths % 10 === 0 ? 1 : 2)}${THIN_SPACE}%`;
}

export function formatNumber(value: number, decimals: number): string {
  return (value < 0 ? MINUS : '') + decimal(value, decimals);
}

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function parts(isoDate: string): { y: number; m: number; d: number; weekday: number } {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, weekday };
}

export function formatLongDate(isoDate: string): string {
  const p = parts(isoDate);
  const wd = WEEKDAYS[p.weekday] ?? '';
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${p.d} ${MONTHS[p.m - 1] ?? ''}`;
}

export function formatDayMonth(isoDate: string): string {
  const p = parts(isoDate);
  return `${p.d} ${MONTHS[p.m - 1] ?? ''}`;
}

export function formatShortMonth(isoDate: string): string {
  const p = parts(isoDate);
  const label = MONTHS_SHORT[p.m - 1] ?? '';
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatFullDate(isoDate: string): string {
  const p = parts(isoDate);
  return `${p.d} ${MONTHS[p.m - 1] ?? ''} ${p.y}`;
}

export function initials(label: string): string {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}
