/**
 * UX pass 3, point 1c: cost of `trackingChart` on one year of data, before and after the daily projection.
 * Run (low priority): node node_modules/vitest/vitest.mjs run -c vitest.journal.config.ts ux3/chartTiming
 * One synthetic user (no real data): onboarding 365 days ago, a weigh-in every day on a slow loss, every day noted; the
 * calibration state is computed once, outside the timing. Writes the median of 30 calls per window, after 5 warm-up calls,
 * to the file named by TIMING_OUT (else the console).
 */
import { appendFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { addWeight, applyRecalibration, completeOnboarding, computeCalibrationState, setAdherence } from '@/domain/engine';
import { trackingChart } from '@/domain/views';
import type { WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { addDays } from '@/science/dates';
import { makeProfile } from '../../helpers/profiles';

const TODAY = '2026-11-20';
const START = addDays(TODAY, -365);
const at = (date: string) => `${date}T08:00:00.000Z`;

function yearStore(): WheightyStore {
  const r = completeOnboarding(emptyStore(), makeProfile({ goal: 'loss', currentWeightKg: 92, targetWeightKg: 70, weeklyRateTarget: 0.005 }), START, at(START));
  if (!r.ok) throw new Error(r.reason);
  let s: WheightyStore = { ...r.store, weights: [] };
  for (let d = 0; d <= 365; d++) {
    const date = addDays(START, d);
    s = addWeight(s, { date, weightKg: 92 - d * 0.035 + Math.sin(d) * 0.3 }, at(date));
    s = setAdherence(s, date, 'on_plan');
  }
  const state = computeCalibrationState(s, TODAY, at(TODAY));
  if (state?.candidate) {
    const applied = applyRecalibration(s, state, TODAY, at(TODAY));
    if (applied.ok) s = applied.store;
  }
  return s;
}

const say = (line: string) => (process.env.TIMING_OUT ? appendFileSync(process.env.TIMING_OUT, `${line}\n`) : console.log(line));

it('times trackingChart on one year of data', () => {
  const store = yearStore();
  const state = computeCalibrationState(store, TODAY, at(TODAY));
  const out: Record<string, number> = {};
  for (const [name, range] of [['month', 30], ['all', null]] as const) {
    for (let i = 0; i < 5; i++) trackingChart(store, TODAY, range, state);
    const times: number[] = [];
    for (let i = 0; i < 30; i++) {
      const t0 = performance.now();
      const chart = trackingChart(store, TODAY, range, state);
      times.push(performance.now() - t0);
      expect(chart).not.toBeNull();
    }
    times.sort((a, b) => a - b);
    out[name] = times[15] as number;
    const chart = trackingChart(store, TODAY, range, state);
    say(`${name}: median ${(times[15] as number).toFixed(2)} ms, ${chart?.raw.length} raw, ${chart?.projection.length} projection points, ${chart?.band.length} band points`);
  }
  say(JSON.stringify(out));
});
