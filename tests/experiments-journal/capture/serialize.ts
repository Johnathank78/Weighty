/** Bit-exact serialisation for the non-regression capture: shortest round-trip doubles, non-finite and -0 kept apart. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function exactJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (typeof v === 'number') {
      if (Number.isNaN(v)) return 'NaN';
      if (v === Number.POSITIVE_INFINITY) return '+Infinity';
      if (v === Number.NEGATIVE_INFINITY) return '-Infinity';
      if (Object.is(v, -0)) return '-0';
    }
    if (v instanceof Float64Array) return Array.from(v);
    return v;
  });
}

export function writeCapture(name: string, value: unknown): void {
  const root = process.env.CAPTURE_OUT;
  if (!root) throw new Error('CAPTURE_OUT is required');
  const file = `${root}/${name}.json`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, exactJson(value));
}
