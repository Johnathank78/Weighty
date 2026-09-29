/**
 * Value grid of the app's sliders (UX pass 1, D): one function snaps every value, whether it comes from a drag, a key or
 * the − and + buttons, so all of them land on exactly the same values. Linear: a position maps to min + p × (max − min).
 */
export type RangeGrid = {
  min: number;
  max: number;
  step: number;
  /** Lowest value the thumb may reach (defaults to min). */
  lowerLimit?: number;
  /** Highest value the thumb may reach (defaults to max). */
  upperLimit?: number;
};

/** Nearest grid value (min + k × step), kept within the limits. */
export function snapToGrid(value: number, g: RangeGrid): number {
  const stepped = Math.round((value - g.min) / g.step) * g.step + g.min;
  return Math.max(g.lowerLimit ?? g.min, Math.min(g.upperLimit ?? g.max, stepped));
}

/** Value for a position along the track, 0 (left) to 1 (right). */
export function valueAtPosition(p: number, g: RangeGrid): number {
  return snapToGrid(g.min + Math.max(0, Math.min(1, p)) * (g.max - g.min || 1), g);
}

/**
 * One step down (−1) or up (+1), exactly: the − and + buttons and the arrow keys. From a grid value, the next one; from a
 * value off the grid (a limit the step does not divide), the nearest grid value on that side, so no value is skipped.
 */
export function stepValue(value: number, direction: -1 | 1, g: RangeGrid): number {
  const k = (value - g.min) / g.step;
  const next = direction > 0 ? Math.floor(k + 1e-9) + 1 : Math.ceil(k - 1e-9) - 1;
  return snapToGrid(g.min + next * g.step, g);
}

/**
 * Whether a step in that direction moves the value that way. False at the limits, including when the step does not divide
 * the range (pounds on a kilogram range) and the limit itself is the last value.
 */
export function canStep(value: number, direction: -1 | 1, g: RangeGrid): boolean {
  return direction * (stepValue(value, direction, g) - value) > 1e-9;
}
