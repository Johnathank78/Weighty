/**
 * World-side Hall model of the iteration 2 simulator (tests/helpers/closedLoopHall.ts): with nominal factors, the
 * trajectory equals the repository model bit for bit (control 6.1 relies on it); perturbed factors change it.
 */
import { describe, expect, it } from 'vitest';
import { advance, bodyWeightOf, initialState, initializeHall } from '@/science/hall/model';
import type { HallBaselineInput, HallDailyInput } from '@/science/hall/model';
import { initWorldHall, NOMINAL_HALL_FACTORS, worldAdvance, worldBodyWeight, worldInitialState } from '../helpers/closedLoopHall';

const CASES: HallBaselineInput[] = [
  { sex: 'female', ageYears: 34, heightM: 1.64, bodyWeightKg: 71.3, baselineIntakeKcal: 2150, baselineRmrKcal: 1420, baselineCarbFraction: 0.46 },
  { sex: 'male', ageYears: 52, heightM: 1.81, bodyWeightKg: 104.2, baselineIntakeKcal: 2890, baselineRmrKcal: 1930, initialFatKg: 31.5, baselineCarbFraction: 0.41 },
  { sex: 'female', ageYears: 23, heightM: 1.55, bodyWeightKg: 50.1, baselineIntakeKcal: 1830, baselineRmrKcal: 1260, baselineCarbFraction: 0.52 },
];

function inputOn(base: HallBaselineInput, d: number): HallDailyInput {
  const intake = base.baselineIntakeKcal * (0.7 + 0.5 * ((d * 37) % 11) / 10);
  return { intakeKcal: intake, carbKcal: 0.45 * intake * (d % 5 === 0 ? 1.4 : 1), paDeltaKcalPerKgDay: ((d % 7) - 3) * 0.3, sodiumDeltaMg: 0 };
}

describe('closed-loop world Hall model', () => {
  it('nominal factors reproduce src/science/hall/model.ts bit for bit over 168 days', () => {
    for (const c of CASES) {
      const p = initializeHall(c);
      const w = initWorldHall(c, NOMINAL_HALL_FACTORS);
      let s = initialState(p);
      let sw = worldInitialState(w);
      expect(worldBodyWeight(w, sw)).toBe(bodyWeightOf(p, s));
      for (let d = 0; d < 168; d++) {
        const u = inputOn(c, d);
        s = advance(p, s, u, 1);
        sw = worldAdvance(w, sw, u, 1);
        expect(sw).toEqual(s);
        expect(Object.is(worldBodyWeight(w, sw), bodyWeightOf(p, s))).toBe(true);
      }
    }
  });

  it('each perturbed parameter changes the trajectory, the baseline stays a steady state', () => {
    const c = CASES[0] as HallBaselineInput;
    const keys = ['betaAt', 'etaF', 'etaL', 'forbesC', 'glycogenWater'] as const;
    for (const key of keys) {
      const w = initWorldHall(c, { ...NOMINAL_HALL_FACTORS, [key]: 1.2 });
      const n = initWorldHall(c, NOMINAL_HALL_FACTORS);
      let s = worldInitialState(w);
      let sn = worldInitialState(n);
      const steady = { intakeKcal: c.baselineIntakeKcal, carbKcal: c.baselineCarbFraction * c.baselineIntakeKcal, paDeltaKcalPerKgDay: 0, sodiumDeltaMg: 0 };
      const w0 = worldBodyWeight(w, s);
      expect(w0).toBeCloseTo(c.bodyWeightKg, 9);
      let st = s;
      for (let d = 0; d < 30; d++) st = worldAdvance(w, st, steady, 1);
      expect(worldBodyWeight(w, st)).toBeCloseTo(w0, 6);
      for (let d = 0; d < 60; d++) {
        s = worldAdvance(w, s, inputOn(c, d), 1);
        sn = worldAdvance(n, sn, inputOn(c, d), 1);
      }
      expect(worldBodyWeight(w, s)).not.toBe(worldBodyWeight(n, sn));
    }
  });
});
