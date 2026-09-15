/**
 * Standard normal distribution in log space, for tail probabilities that must not underflow
 * (predictive conflict statistic of the warm start, IMPLEMENTATION_NOTES D-29).
 *
 * erfc uses the Chebyshev fit of Press et al., Numerical Recipes (erfcc), fractional error below 1.2e-7
 * for every argument. Its form t * exp(-u^2 + P(t)) gives log erfc directly, so extreme tails stay finite.
 * The coefficients are a published numerical approximation, not model parameters.
 */

const LOG_HALF = Math.log(0.5);
const LOG_SQRT_2PI = 0.5 * Math.log(2 * Math.PI);

/** log erfc(u) for u >= 0. */
function logErfcNonNegative(u: number): number {
  const t = 1 / (1 + 0.5 * u);
  const poly =
    -1.26551223 +
    t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))));
  return Math.log(t) - u * u + poly;
}

/** log Phi(x), accurate in both tails. */
export function logNormalCdf(x: number): number {
  const u = x / Math.SQRT2;
  if (u <= 0) return LOG_HALF + logErfcNonNegative(-u);
  // Phi(x) = 1 - erfc(u) / 2 for u > 0.
  return Math.log1p(-0.5 * Math.exp(logErfcNonNegative(u)));
}

/** log of the standard normal density. */
function logNormalPdf(x: number): number {
  return -0.5 * x * x - LOG_SQRT_2PI;
}

/**
 * Quantile of the standard normal from a log probability: returns z with log Phi(z) = logP.
 * Newton iterations on the concave log Phi converge monotonically after the first step.
 */
export function normalQuantileFromLogCdf(logP: number): number {
  if (logP >= 0) return Number.POSITIVE_INFINITY;
  if (logP === Number.NEGATIVE_INFINITY) return Number.NEGATIVE_INFINITY;
  if (logP > LOG_HALF) {
    // Upper half: use the complement to keep precision near 1.
    return -normalQuantileFromLogCdf(Math.log(-Math.expm1(logP)));
  }
  let z = 0;
  for (let i = 0; i < 200; i++) {
    const lc = logNormalCdf(z);
    const step = (lc - logP) / Math.exp(logNormalPdf(z) - lc);
    z -= step;
    if (Math.abs(step) < 1e-12 * Math.max(1, Math.abs(z))) break;
  }
  return z;
}

/** log(sum(exp(values))), stable; -Infinity for an empty or all -Infinity input. */
export function logSumExp(values: readonly number[]): number {
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) if (v > max) max = v;
  if (!Number.isFinite(max)) return max;
  let sum = 0;
  for (const v of values) sum += Math.exp(v - max);
  return max + Math.log(sum);
}
