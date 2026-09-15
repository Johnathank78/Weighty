/** Pure ISO local-date helpers (YYYY-MM-DD). No time zone conversions. */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  const [, y, mo, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(mo) - 1 && date.getUTCDate() === Number(d);
}

function toUtcMs(isoDate: string): number {
  const match = ISO_DATE_RE.exec(isoDate);
  if (!match) throw new Error(`Invalid ISO date: ${isoDate}`);
  const [, y, mo, d] = match;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d));
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(toUtcMs(isoDate) + days * MS_PER_DAY);
  return d.toISOString().slice(0, 10);
}

/** Calendar months between two dates, fractional part ignored when the day of month is not reached. */
export function monthsBetween(from: string, to: string): number {
  const a = new Date(toUtcMs(from));
  const b = new Date(toUtcMs(to));
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return months;
}

/** Calendar date `months` months after `isoDate`, clamped to the end of the target month. */
export function addMonths(isoDate: string, months: number): string {
  const a = new Date(toUtcMs(isoDate));
  const targetMonthIndex = a.getUTCMonth() + months;
  const y = a.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const mo = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const d = Math.min(a.getUTCDate(), lastDay);
  return new Date(Date.UTC(y, mo, d)).toISOString().slice(0, 10);
}

export function localIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
