/**
 * Calibration cost versus history length (IMPLEMENTATION_NOTES P-01). Durations are reported in the test names; the only
 * assertion is a wide guard against a regression of the fit complexity. The UI runs the fit in a Web Worker.
 */
import { describe, expect, it } from 'vitest';
import { fitCalibration } from '@/science/calibration';
import { addDays } from '@/science/dates';
import type { CalibrationInput } from '@/science/calibration';
import type { DailyLog, WeightEntry } from '@/science/types';

const START = '2026-01-05';

function dailyHistory(days: number): CalibrationInput {
  const weights: WeightEntry[] = Array.from({ length: days + 1 }, (_, i) => ({ id: `w${i}`, date: addDays(START, i), weightKg: 80 - i * 0.04 + 0.4 * Math.sin(i * 1.7), createdAt: `${addDays(START, i)}T07:00:00Z` }));
  const dailyLogs: DailyLog[] = Array.from({ length: days }, (_, i) => ({ date: addDays(START, i), calorieTargetForDay: 1900, stepTargetForDay: 8000, adherence: i % 9 === 0 ? 'minor_deviation' : 'on_plan', ...(i % 3 === 0 ? { actualSteps: 7200 + (i % 5) * 400 } : {}) }));
  return { sex: 'male', ageYears: 38, heightCm: 178, walkingPace: 'normal', populationTdeeAtStartKcal: 2600, reeAtStartKcal: 1750, maintenanceStepsPerDay: 8000, priorSigmaKcal: 342, baselineCarbFraction: 0.5, weights, dailyLogs };
}

/** Best of two runs, to limit the noise of a busy test machine. */
function timedFit(input: CalibrationInput): number {
  let best = Number.POSITIVE_INFINITY;
  for (let run = 0; run < 2; run++) {
    const t0 = performance.now();
    fitCalibration(input);
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

describe('calibration cost with daily weigh-ins', () => {
  fitCalibration(dailyHistory(30)); // warm-up
  const timings = [84, 180, 365].map((days) => ({ days, ms: timedFit(dailyHistory(days)) }));
  for (const t of timings) {
    it(`${t.days} days: ${Math.round(t.ms)} ms`, () => {
      expect(t.ms).toBeGreaterThan(0);
    });
  }
  it('one year of daily weigh-ins stays under 2 s (regression guard)', () => {
    expect(timings[timings.length - 1]?.ms).toBeLessThan(2000);
  });
});
