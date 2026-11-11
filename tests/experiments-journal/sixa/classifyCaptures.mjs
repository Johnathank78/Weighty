// Report 49, 6.1: every difference between two captures of tests/experiments-journal/capture/, one by one, grouped by path
// (array indices as [*]) and by change, so that each group can be attributed to a rule.
//   node tests/experiments-journal/sixa/classifyCaptures.mjs <before dir> <after dir>
// Random store ids are masked as in compare.mjs. A key present on one side only is a difference ("added" / "removed"),
// listed with its value when it is a scalar; numbers are compared with Object.is.
import { readFileSync } from 'node:fs';

const [, , a, b] = process.argv;
const files = ['t03', 't04', 'golden', 'cases-rs', 'journey'];
const mask = (s) => s.replace(/"id":"[a-z]+-\d+-[0-9a-z]+"/g, '"id":"<masked>"');
const groups = new Map();
let total = 0;
let numeric = 0;
const add = (file, path, kind, x, y) => {
  const norm = path.replace(/\.\d+(?=\.|$)/g, '[*]');
  const show = (v) => (v !== null && typeof v === 'object' ? (Array.isArray(v) ? `array(${v.length})` : 'object') : JSON.stringify(v));
  const key = `${file} | ${norm} | ${kind} | ${show(x)} -> ${show(y)}`;
  groups.set(key, (groups.get(key) ?? 0) + 1);
  total++;
  if (kind === 'changed' && typeof x === 'number') numeric++;
};
for (const f of files) {
  const A = JSON.parse(mask(readFileSync(`${a}/${f}.json`, 'utf8')));
  const B = JSON.parse(mask(readFileSync(`${b}/${f}.json`, 'utf8')));
  const walk = (x, y, path) => {
    if (x === null || y === null || typeof x !== 'object' || typeof y !== 'object') {
      if (!Object.is(x, y)) add(f, path, 'changed', x, y);
      return;
    }
    if (Array.isArray(x) && Array.isArray(y) && x.length !== y.length) {
      add(f, path, 'length', x.length, y.length);
      for (let i = 0; i < Math.min(x.length, y.length); i++) walk(x[i], y[i], `${path}.${i}`);
      for (let i = x.length; i < y.length; i++) add(f, `${path}.${i}`, 'added', undefined, y[i]?.rule ?? y[i]);
      return;
    }
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of keys) {
      if (!(k in y)) add(f, `${path}.${k}`, 'removed', x[k], undefined);
      else if (!(k in x)) add(f, `${path}.${k}`, 'added', undefined, y[k]);
      else walk(x[k], y[k], `${path}.${k}`);
    }
  };
  walk(A, B, f);
}
for (const [k, n] of [...groups.entries()].sort()) console.log(`${String(n).padStart(5)}  ${k}`);
console.log(`TOTAL ${total} differences (${numeric} numeric values changed), ${groups.size} groups`);
