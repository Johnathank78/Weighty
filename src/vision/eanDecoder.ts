/**
 * Lightweight EAN-13 / UPC-A / EAN-8 reader from a camera frame (IMPLEMENTATION_NOTES J-10), used when the
 * native BarcodeDetector is missing (Safari iOS, Windows). Pure functions, no DOM, no dependency.
 *
 * Instead of recognising the printed digits (OCR, several MB), it reads the bars along a few scan lines:
 * band-averaged lines, 3-tap sharpening, sub-pixel edges on a local threshold, digits matched on edge-to-similar-edge
 * distances (robust to scale, blur and ink spread), guards, quiet zones, reading direction and check digit verified,
 * and two scan lines of the frame must agree. A read that fails any check returns null: the camera loop tries the
 * next frame.
 */

const L_CODES = ['3211', '2221', '2122', '1411', '1132', '1231', '1114', '1312', '1213', '3112'].map((s) => [...s].map(Number));
const G_CODES = L_CODES.map((p) => [...p].reverse());
/** Parity of the left half, giving the first EAN-13 digit. */
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
/** Maximum summed deviation, in modules, between measured and ideal widths of a digit. */
const MAX_DIGIT_ERROR = 1.3;
const MIN_CONTRAST = 40;
const MIN_AGREEING_LINES = 2;
/**
 * Strengths of the 3-tap sharpening tried on each line (J-10 bench): 0 for large modules, where sharpening splits
 * wide bars on sensor texture; 3 for small blurred modules. 4 gains little and amplifies noise.
 */
const SHARPEN_LEVELS = [0, 3] as const;

type DigitMatch = { digit: number; error: number };

/**
 * Matches a digit on edge-to-similar-edge distances (bar + space, space + bar), as the EAN specification
 * recommends: unlike single widths they do not depend on bars printed or blurred thicker. The pairs 1/7 and
 * 2/8 share these distances and are told apart by the total bar width. `barsAt` gives the bar positions in the
 * 4 runs: 1 and 3 on the left half (space first), 0 and 2 on the right half (bar first).
 */
function matchDigit(runs: readonly number[], at: number, table: readonly number[][], barsAt: 0 | 1): DigitMatch {
  const w0 = runs[at] ?? 0;
  const w1 = runs[at + 1] ?? 0;
  const w2 = runs[at + 2] ?? 0;
  const w3 = runs[at + 3] ?? 0;
  const unit = (w0 + w1 + w2 + w3) / 7;
  let best: DigitMatch = { digit: -1, error: Number.POSITIVE_INFINITY };
  if (unit <= 0) return best;
  const t1 = (w0 + w1) / unit;
  const t2 = (w1 + w2) / unit;
  const bars = (barsAt === 1 ? w1 + w3 : w0 + w2) / unit;
  table.forEach((p, digit) => {
    const p0 = p[0] as number;
    const p1 = p[1] as number;
    const p2 = p[2] as number;
    const p3 = p[3] as number;
    const pBars = barsAt === 1 ? p1 + p3 : p0 + p2;
    const error = Math.abs(t1 - (p0 + p1)) + Math.abs(t2 - (p1 + p2)) + Math.abs(bars - pBars) * 0.35;
    if (error < best.error) best = { digit, error };
  });
  return best;
}

const isModule = (width: number, module: number) => width > module * 0.45 && width < module * 1.75;

function checksumOk(digits: readonly number[]): boolean {
  const n = digits.length;
  let sum = 0;
  for (let i = 0; i < n - 1; i++) sum += (digits[i] as number) * ((n - 1 - i) % 2 === 1 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === digits[n - 1];
}

/** Guard and quiet zone checks around a candidate symbol of `count` runs and `modules` modules starting at run `s`. */
function frame(runs: readonly number[], s: number, count: number, modules: number, middleAt: number): number | null {
  let total = 0;
  for (let i = s; i < s + count; i++) total += runs[i] as number;
  const m = total / modules;
  const guards = [s, s + 1, s + 2, s + middleAt, s + middleAt + 1, s + middleAt + 2, s + middleAt + 3, s + middleAt + 4, s + count - 3, s + count - 2, s + count - 1];
  if (!guards.every((g) => isModule(runs[g] as number, m))) return null;
  const before = s > 0 ? (runs[s - 1] as number) : Number.POSITIVE_INFINITY;
  const after = s + count < runs.length ? (runs[s + count] as number) : Number.POSITIVE_INFINITY;
  return before >= m * 3 && after >= m * 3 ? m : null;
}

function decodeEan13(runs: readonly number[], s: number): string | null {
  if (s + 59 > runs.length || frame(runs, s, 59, 95, 27) === null) return null;
  const digits: number[] = [];
  let parity = '';
  for (let k = 0; k < 6; k++) {
    const l = matchDigit(runs, s + 3 + 4 * k, L_CODES, 1);
    const g = matchDigit(runs, s + 3 + 4 * k, G_CODES, 1);
    const best = l.error <= g.error ? l : g;
    if (best.error > MAX_DIGIT_ERROR) return null;
    digits.push(best.digit);
    parity += l.error <= g.error ? 'L' : 'G';
  }
  for (let k = 0; k < 6; k++) {
    const r = rightDigit(runs, s + 32 + 4 * k);
    if (r === null) return null;
    digits.push(r);
  }
  const first = PARITY.indexOf(parity);
  if (first < 0) return null;
  const all = [first, ...digits];
  return checksumOk(all) ? all.join('') : null;
}

function decodeEan8(runs: readonly number[], s: number): string | null {
  if (s + 43 > runs.length || frame(runs, s, 43, 67, 19) === null) return null;
  const digits: number[] = [];
  for (let k = 0; k < 4; k++) {
    const l = matchDigit(runs, s + 3 + 4 * k, L_CODES, 1);
    // EAN-8 has no G digits: a better G fit means the symbol is read in the wrong direction.
    if (l.error > MAX_DIGIT_ERROR || matchDigit(runs, s + 3 + 4 * k, G_CODES, 1).error < l.error) return null;
    digits.push(l.digit);
  }
  for (let k = 0; k < 4; k++) {
    const r = rightDigit(runs, s + 24 + 4 * k);
    if (r === null) return null;
    digits.push(r);
  }
  return checksumOk(digits) ? digits.join('') : null;
}

/** Right half digit (R code). Rejected when the mirrored pattern fits better, a sign of a reversed reading. */
function rightDigit(runs: readonly number[], at: number): number | null {
  const r = matchDigit(runs, at, L_CODES, 0);
  if (r.error > MAX_DIGIT_ERROR || matchDigit(runs, at, G_CODES, 0).error < r.error) return null;
  return r.digit;
}

/**
 * Run widths (fractional pixels) of a scan line, and whether the first run is a bar. Adaptive threshold
 * (moving average) with hysteresis; edges placed where the signal crosses the threshold.
 */
export function scanLineRuns(values: ArrayLike<number>, sharpen: number = SHARPEN_LEVELS[1]): { runs: number[]; firstIsBar: boolean } | null {
  const n = values.length;
  if (n < 60) return null;
  let min = 255;
  let max = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i] as number;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (range < MIN_CONTRAST) return null;
  // Light sharpening restores the contrast of one-module bars softened by focus blur.
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = values[i] as number;
    s[i] = v * (1 + sharpen) - sharpen * (((values[Math.max(0, i - 1)] as number) + (values[Math.min(n - 1, i + 1)] as number)) / 2);
  }
  const radius = Math.max(6, Math.round(n / 40));
  const prefix = new Float64Array(n + 1);
  const rawPrefix = new Float64Array(n + 1);
  const squarePrefix = new Float64Array(n + 1);
  const mid = (min + max) / 2;
  for (let i = 0; i < n; i++) {
    const v = values[i] as number;
    prefix[i + 1] = (prefix[i] as number) + (s[i] as number);
    rawPrefix[i + 1] = (rawPrefix[i] as number) + v;
    squarePrefix[i + 1] = (squarePrefix[i] as number) + v * v;
  }
  const window = (i: number) => [Math.max(0, i - radius), Math.min(n, i + radius + 1)] as const;
  const localMean = (i: number) => {
    const [a, b] = window(i);
    return ((prefix[b] as number) - (prefix[a] as number)) / (b - a);
  };
  // Local standard deviation of the raw signal: low in flat areas (quiet zone, background), high across bars.
  const localSpread = (i: number) => {
    const [a, b] = window(i);
    const k = b - a;
    const mean = ((rawPrefix[b] as number) - (rawPrefix[a] as number)) / k;
    return Math.sqrt(Math.max(0, ((squarePrefix[b] as number) - (squarePrefix[a] as number)) / k - mean * mean));
  };
  let dark = (s[0] as number) < localMean(0) && localSpread(0) > range * 0.12;
  const firstIsBar = dark;
  const runs: number[] = [];
  let lastEdge = 0;
  for (let i = 1; i < n; i++) {
    const t = localMean(i);
    const v = s[i] as number;
    const spread = localSpread(i);
    const hysteresis = spread * 0.05;
    // A flat bright area is light whatever its noise; a flat dark area keeps its state.
    const flat = spread < range * 0.12;
    const flip = dark ? v > t + hysteresis || (flat && (values[i] as number) > mid) : !flat && v < t - hysteresis;
    if (!flip) continue;
    const prev = s[i - 1] as number;
    const edge = prev === v ? i : i - 1 + Math.min(1, Math.max(0, (t - prev) / (v - prev)));
    runs.push(edge - lastEdge);
    lastEdge = edge;
    dark = !dark;
  }
  runs.push(n - lastEdge);
  return { runs, firstIsBar };
}

/**
 * Decodes one scan line of luminance values, in either direction. Two binarisations are tried: plain (large
 * modules, where sharpening would split wide bars on sensor texture) and sharpened (small blurred modules).
 */
export function decodeScanLine(values: ArrayLike<number>): string | null {
  for (const sharpen of SHARPEN_LEVELS) {
    const scanned = scanLineRuns(values, sharpen);
    if (!scanned) return null;
    const { runs, firstIsBar } = scanned;
    const attempt = (r: readonly number[], barFirst: boolean) => {
      // Symbols start with a bar: runs at even offsets are bars when the line starts with one.
      for (let s = barFirst ? 0 : 1; s + 43 <= r.length; s += 2) {
        const code = decodeEan13(r, s) ?? decodeEan8(r, s);
        if (code) return code;
      }
      return null;
    };
    const lastIsBar = runs.length % 2 === 1 ? firstIsBar : !firstIsBar;
    const code = attempt(runs, firstIsBar) ?? attempt([...runs].reverse(), lastIsBar);
    if (code) return code;
  }
  return null;
}

/** Relative positions of the scan lines, center first. */
export const SCAN_LINES = [0.5, 0.44, 0.56, 0.38, 0.62, 0.3, 0.7] as const;

/**
 * Decodes an RGBA frame (canvas ImageData layout). Horizontal lines first, then vertical ones for a barcode
 * held sideways. Returns the first valid code.
 */
export function decodeFrame(rgba: ArrayLike<number>, width: number, height: number): string | null {
  const luma = (p: number) => (rgba[p] as number) * 0.299 + (rgba[p + 1] as number) * 0.587 + (rgba[p + 2] as number) * 0.114;
  // Each scan line averages a thin band across the bars: sensor noise drops by the square root of the band size.
  const band = Math.max(1, Math.round(Math.min(width, height) / 60));
  // A code is only accepted when two different scan lines of the frame read it: the check digit alone lets
  // one random pattern in ten through, two independent lines agreeing does not happen by chance.
  const votes = new Map<string, number>();
  const vote = (code: string | null) => {
    if (!code) return false;
    const n = (votes.get(code) ?? 0) + 1;
    votes.set(code, n);
    return n >= MIN_AGREEING_LINES;
  };
  const row = new Float32Array(width);
  for (const f of SCAN_LINES) {
    const y0 = Math.max(0, Math.min(height - band, Math.round(height * f - band / 2)));
    row.fill(0);
    for (let y = y0; y < y0 + band; y++) for (let x = 0, p = y * width * 4; x < width; x++, p += 4) row[x] = (row[x] as number) + luma(p) / band;
    const code = decodeScanLine(row);
    if (vote(code)) return code;
  }
  votes.clear();
  const column = new Float32Array(height);
  for (const f of SCAN_LINES) {
    const x0 = Math.max(0, Math.min(width - band, Math.round(width * f - band / 2)));
    column.fill(0);
    for (let x = x0; x < x0 + band; x++) for (let y = 0, p = x * 4; y < height; y++, p += width * 4) column[y] = (column[y] as number) + luma(p) / band;
    const code = decodeScanLine(column);
    if (vote(code)) return code;
  }
  return null;
}
