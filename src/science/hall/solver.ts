/** Deterministic bisection root solver for monotone scalar functions. */

export type BisectionInput = {
  lo: number;
  hi: number;
  /** Monotone function of x. */
  f: (x: number) => number;
  target: number;
  increasing: boolean;
  maxIterations: number;
  /** Stop when the bracket is narrower than this (x units). */
  xTolerance: number;
  /** Stop when |f(x) - target| is below this (f units). */
  yTolerance: number;
};

export type BisectionResult = {
  x: number;
  y: number;
  iterations: number;
  converged: boolean;
  /** False when the target lies outside [f(lo), f(hi)]; x is then the nearest bound. */
  bracketed: boolean;
};

export function bisect(input: BisectionInput): BisectionResult {
  let lo = input.lo;
  let hi = input.hi;
  const sign = input.increasing ? 1 : -1;
  const g = (x: number): { y: number; r: number } => {
    const y = input.f(x);
    return { y, r: sign * (y - input.target) };
  };
  const gLo = g(lo);
  if (gLo.r >= 0) return { x: lo, y: gLo.y, iterations: 0, converged: Math.abs(gLo.y - input.target) <= input.yTolerance, bracketed: gLo.r === 0 };
  const gHi = g(hi);
  if (gHi.r <= 0) return { x: hi, y: gHi.y, iterations: 0, converged: Math.abs(gHi.y - input.target) <= input.yTolerance, bracketed: gHi.r === 0 };

  let mid = (lo + hi) / 2;
  let gMid = g(mid);
  let iterations = 1;
  // Stop once the output residual AND the bracket half-width are both inside tolerance.
  while (iterations < input.maxIterations && !(Math.abs(gMid.y - input.target) <= input.yTolerance && (hi - lo) / 2 <= input.xTolerance)) {
    if (gMid.r < 0) lo = mid;
    else hi = mid;
    mid = (lo + hi) / 2;
    gMid = g(mid);
    iterations++;
  }
  const converged = Math.abs(gMid.y - input.target) <= input.yTolerance;
  return { x: mid, y: gMid.y, iterations, converged, bracketed: true };
}
