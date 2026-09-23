// Non-regression comparison (prompt 34 s3.8): node tests/experiments-journal/capture/compare.mjs <before> <after>.
// Random store ids (newId, Math.random) are masked; every number is compared with Object.is.
import { readFileSync } from 'node:fs';
const [,, a, b] = process.argv;
const files = ['t03', 't04', 'golden', 'cases-rs', 'journey'];
let totalNums = 0, totalDiff = 0, masked = 0;
for (const f of files) {
  const mask = (s) => s.replace(/"id":"[a-z]+-\d+-[0-9a-z]+"/g, () => { masked++; return '"id":"<masked>"'; });
  const A = JSON.parse(mask(readFileSync(`${a}/${f}.json`, 'utf8')));
  const B = JSON.parse(mask(readFileSync(`${b}/${f}.json`, 'utf8')));
  let nums = 0, diffs = 0, other = 0;
  const walk = (x, y, path) => {
    if (typeof x === 'number' || (typeof x === 'string' && /^(NaN|[+-]Infinity|-0)$/.test(x))) { nums++; if (!Object.is(x, y)) { diffs++; if (diffs < 5) console.log('DIFF', f, path, x, y); } return; }
    if (x === null || typeof x !== 'object') { if (x !== y) { other++; if (other < 5) console.log('DIFF(non-num)', f, path, x, y); } return; }
    const kx = Object.keys(x), ky = Object.keys(y ?? {});
    if (kx.join() !== ky.join()) { other++; console.log('KEYS', f, path, kx.length, ky.length); }
    for (const k of kx) walk(x[k], y?.[k], `${path}.${k}`);
  };
  walk(A, B, f);
  console.log(`${f}: ${nums} numeric values, ${diffs} numeric differences, ${other} other differences`);
  totalNums += nums; totalDiff += diffs + other;
}
console.log(`TOTAL ${totalNums} numeric values compared, ${totalDiff} differences, ${masked} random ids masked`);
