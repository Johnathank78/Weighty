/**
 * Bench of the lightweight barcode reader (J-10): accuracy and speed on synthetic 640 x 480 camera frames
 * (module size, blur, sensor noise, uneven lighting, upside down and sideways), plus false positives on
 * frames without a barcode. Deterministic (seeded).
 */
import { describe, expect, it } from 'vitest';
import { decodeFrame, decodeScanLine } from '@/vision/eanDecoder';
import { createRng } from '../helpers/random';

const makeRng = (label: string) => {
  let seed = 7;
  for (let i = 0; i < label.length; i++) seed = (Math.imul(seed, 31) + label.charCodeAt(i)) >>> 0;
  return createRng(seed).next;
};

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = L.map((c) => [...c].map((b) => (b === '1' ? '0' : '1')).join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

function checkDigit(data: string): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += Number(data[i]) * ((data.length - i) % 2 === 1 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

/** Module string (1 = bar) of an EAN-13 or EAN-8 code, without quiet zones. */
function modules(code: string): string {
  if (code.length === 13) {
    const parity = PARITY[Number(code[0])] as string;
    let left = '';
    for (let i = 0; i < 6; i++) left += (parity[i] === 'L' ? L : G)[Number(code[i + 1])];
    let right = '';
    for (let i = 7; i < 13; i++) right += R[Number(code[i])];
    return `101${left}01010${right}101`;
  }
  let left = '';
  for (let i = 0; i < 4; i++) left += L[Number(code[i])];
  let right = '';
  for (let i = 4; i < 8; i++) right += R[Number(code[i])];
  return `101${left}01010${right}101`;
}

type Condition = { name: string; modulePx: number; blur: number; noise: number; gradient: number; texture?: number; rotate?: 'none' | 'flip' | 'sideways' };

/** Renders a frame: paper background, anti-aliased bars, box blur, lighting gradient, gaussian-like noise. */
function renderFrame(code: string, c: Condition, rng: () => number, width = 640, height = 480): Uint8ClampedArray {
  const bits = modules(code);
  const barcodeWidth = bits.length * c.modulePx;
  const line = new Float32Array(width).fill(232);
  const x0 = (width - barcodeWidth) / 2;
  for (let x = 0; x < width; x++) {
    // Coverage of pixel [x, x + 1) by bars.
    let dark = 0;
    const a = (x - x0) / c.modulePx;
    const b = (x + 1 - x0) / c.modulePx;
    for (let m = Math.max(0, Math.floor(a)); m < Math.min(bits.length, Math.ceil(b)); m++) {
      if (bits[m] === '1') dark += Math.max(0, Math.min(b, m + 1) - Math.max(a, m));
    }
    line[x] = 232 - (dark / (b - a)) * 200;
  }
  let blurred = line;
  for (let pass = 0; pass < 2 && c.blur > 0; pass++) {
    const out = new Float32Array(width);
    for (let x = 0; x < width; x++) {
      let s = 0;
      let k = 0;
      for (let d = -c.blur; d <= c.blur; d++) {
        const v = blurred[Math.min(width - 1, Math.max(0, x + d))] as number;
        s += v;
        k++;
      }
      out[x] = s / k;
    }
    blurred = out;
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  const top = Math.round(height * 0.2);
  const bottom = Math.round(height * 0.8);
  // Column-correlated texture (sensor pattern, compression): identical on every row, so band averaging keeps it.
  const ripple = Array.from({ length: width }, () => (rng() - 0.5) * (c.texture ?? 0));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inSymbol = y >= top && y <= bottom;
      const base = inSymbol ? (blurred[x] as number) + (ripple[x] as number) : 232;
      const light = 1 - c.gradient * (x / width);
      const noise = (rng() + rng() + rng() - 1.5) * c.noise;
      const v = base * light + noise;
      const p = (y * width + x) * 4;
      rgba[p] = v;
      rgba[p + 1] = v;
      rgba[p + 2] = v;
      rgba[p + 3] = 255;
    }
  }
  if (c.rotate === 'flip') return flip(rgba, width, height);
  return rgba;
}

function flip(rgba: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out.set(rgba.subarray((y * width + x) * 4, (y * width + x) * 4 + 4), ((height - 1 - y) * width + (width - 1 - x)) * 4);
  return out;
}

function transpose(rgba: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out.set(rgba.subarray((y * width + x) * 4, (y * width + x) * 4 + 4), (x * height + y) * 4);
  return out;
}

function randomCode(rng: () => number, length: 13 | 8): string {
  let data = '';
  for (let i = 0; i < length - 1; i++) data += Math.floor(rng() * 10);
  return data + checkDigit(data);
}

/**
 * A 37 mm EAN-13 filling half of a 640 px wide frame is about 3.4 px per module; `blur` is the radius of two box
 * filter passes (1 = slight focus blur, 2 = strong), `noise` the sensor noise amplitude in grey levels.
 */
const CONDITIONS: Condition[] = [
  { name: 'net, 3,4 px/module', modulePx: 3.4, blur: 0, noise: 4, gradient: 0 },
  { name: 'courant, 3 px/module, flou 1', modulePx: 3, blur: 1, noise: 10, gradient: 0.25 },
  { name: 'plus loin, 2,5 px/module, flou 1', modulePx: 2.5, blur: 1, noise: 10, gradient: 0.25 },
  { name: 'à l’envers, 3 px/module, flou 1', modulePx: 3, blur: 1, noise: 10, gradient: 0.2, rotate: 'flip' },
  { name: 'bruité, 3 px/module, flou 1', modulePx: 3, blur: 1, noise: 30, gradient: 0.3 },
  { name: 'texture, grands modules 5 px', modulePx: 5, blur: 1, noise: 12, gradient: 0.3, texture: 18 },
  { name: 'texture, 3 px/module', modulePx: 3, blur: 1, noise: 12, gradient: 0.3, texture: 18 },
  { name: 'extrême : 2,2 px/module, flou 1', modulePx: 2.2, blur: 1, noise: 12, gradient: 0.3 },
  { name: 'extrême : flou 2, 3 px/module', modulePx: 3, blur: 2, noise: 16, gradient: 0.4 },
];

const FRAMES = 60;

describe('lightweight EAN reader bench (J-10)', () => {
  it('reads synthetic frames fast enough for a camera loop, and reports accuracy per condition', () => {
    const rows: string[] = [];
    const timings: number[] = [];
    const accuracy: Record<string, number> = {};
    let wrongReads = 0;
    for (const c of CONDITIONS) {
      const rng = makeRng(`ean-${c.name}`);
      let ok = 0;
      let wrong = 0;
      for (let i = 0; i < FRAMES; i++) {
        const code = randomCode(rng, i % 5 === 4 ? 8 : 13);
        const frame = renderFrame(code, c, rng);
        const t0 = performance.now();
        const read = decodeFrame(frame, 640, 480);
        timings.push(performance.now() - t0);
        if (read === code) ok++;
        else if (read !== null) wrong++;
      }
      accuracy[c.name] = ok / FRAMES;
      rows.push(`${c.name.padEnd(34)} lus ${String(ok).padStart(2)}/${FRAMES}  erronés ${wrong}`);
      wrongReads += wrong;
    }
    const sorted = [...timings].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] as number;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] as number;
    console.log(['', 'Bench lecteur EAN (640 x 480, 7 lignes + 3 colonnes au pire)', ...rows, `temps par image : médiane ${median.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms`].join('\n'));

    // A wrong code is worse than no code: never accepted, even in extreme conditions.
    expect(wrongReads).toBe(0);
    expect(accuracy['net, 3,4 px/module']).toBe(1);
    expect(accuracy['courant, 3 px/module, flou 1']).toBeGreaterThanOrEqual(0.9);
    expect(accuracy['plus loin, 2,5 px/module, flou 1']).toBeGreaterThanOrEqual(0.9);
    // Regression: sharpening alone split wide bars on sensor texture (found on real canvas frames).
    expect(accuracy['texture, grands modules 5 px']).toBeGreaterThanOrEqual(0.9);
    expect(accuracy['à l’envers, 3 px/module, flou 1']).toBeGreaterThanOrEqual(0.9);
    // Generous bound so the suite stays stable on slow machines; the measured values are reported above.
    expect(median).toBeLessThan(15);
  });

  it('reads a barcode held sideways through the vertical scan lines', () => {
    const rng = makeRng('ean-sideways');
    const code = randomCode(rng, 13);
    const frame = transpose(renderFrame(code, { name: 'sideways', modulePx: 2.5, blur: 1, noise: 8, gradient: 0.1 }, rng, 480, 640), 480, 640);
    expect(decodeFrame(frame, 640, 480)).toBe(code);
  });

  it('never invents a code on frames without a barcode', () => {
    const rng = makeRng('ean-negatives');
    let falsePositives = 0;
    for (let i = 0; i < 300; i++) {
      const rgba = new Uint8ClampedArray(640 * 480 * 4);
      const stripes = i % 2 === 0;
      for (let y = 0; y < 480; y++) {
        for (let x = 0; x < 640; x++) {
          // Random texture or random stripes (text lines, packaging patterns).
          const v = stripes ? (Math.sin(x * (0.2 + (i % 7) * 0.13)) > 0.3 ? 40 : 220) + (rng() - 0.5) * 60 : rng() * 255;
          const p = (y * 640 + x) * 4;
          rgba[p] = v;
          rgba[p + 1] = v;
          rgba[p + 2] = v;
          rgba[p + 3] = 255;
        }
      }
      if (decodeFrame(rgba, 640, 480) !== null) falsePositives++;
    }
    expect(falsePositives).toBe(0);
  });

  it('rejects a line whose check digit is wrong, and flat lines', () => {
    const bits = `0000000000${modules('3017624010701')}0000000000`;
    const line = [...bits].flatMap((b) => [b === '1' ? 20 : 230, b === '1' ? 20 : 230, b === '1' ? 20 : 230]);
    expect(decodeScanLine(line)).toBe('3017624010701');
    const corrupted = `0000000000${modules('3017624010702')}0000000000`;
    expect(decodeScanLine([...corrupted].flatMap((b) => [b === '1' ? 20 : 230, b === '1' ? 20 : 230, b === '1' ? 20 : 230]))).toBeNull();
    expect(decodeScanLine(new Array(640).fill(128))).toBeNull();
  });
});
