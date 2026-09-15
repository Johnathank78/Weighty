/** Deterministic seeded PRNG utilities for simulation and property tests. */

export type Rng = {
  next: () => number;
  uniform: (min: number, max: number) => number;
  int: (min: number, maxInclusive: number) => number;
  normal: () => number;
  studentT: (df: number) => number;
  pick: <T>(items: readonly T[]) => T;
  chance: (p: number) => boolean;
};

export function createRng(seed: number): Rng {
  // mulberry32
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = (): number => {
    let u = 0;
    while (u === 0) u = next();
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const chiSquare = (df: number): number => {
    let s = 0;
    for (let i = 0; i < df; i++) s += normal() ** 2;
    return s;
  };
  return {
    next,
    uniform: (min, max) => min + (max - min) * next(),
    int: (min, maxInclusive) => min + Math.floor(next() * (maxInclusive - min + 1)),
    normal,
    studentT: (df) => normal() / Math.sqrt(chiSquare(df) / df),
    pick: (items) => {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error('pick from empty list');
      return item;
    },
    chance: (p) => next() < p,
  };
}
