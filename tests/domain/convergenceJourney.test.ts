/**
 * Convergence journey through the real engine (IMPLEMENTATION_NOTES D-31, D-33, D-34), 84 days, recalibrations
 * accepted as soon as they are surfaced. Scenario A: true maintenance 300 kcal below NASEM; B: same body with
 * undeclared extra intake on 20 percent of days; C: 250 kcal above NASEM.
 */
import { describe, expect, it } from 'vitest';
import { RECAL_SURFACE_MIN_INTERVAL_DAYS } from '@/science/constants';
import { runJourney } from '../helpers/convergenceJourney';
import type { JourneyScenario } from '../helpers/convergenceJourney';

const SCENARIOS: JourneyScenario[] = [
  { key: 'A', trueOffsetKcal: -300, hiddenFraction: 0, hiddenKcal: 0, seed: 11 },
  { key: 'B', trueOffsetKcal: -300, hiddenFraction: 0.2, hiddenKcal: 400, seed: 11 },
  { key: 'C', trueOffsetKcal: 250, hiddenFraction: 0, hiddenKcal: 0, seed: 23 },
];
const DAYS = 84;

describe('convergence journey over 84 days', () => {
  for (const scenario of SCENARIOS) {
    const r = runJourney(scenario, DAYS);
    const final = r.finalState?.candidate;
    const window = r.calorieTargets.slice(r.firstGateDay ?? 0);
    const summary = {
      firstGateDay: r.firstGateDay,
      recalibrations: r.events.map((e) => ({ day: e.day, toKcal: Math.round(e.toKcal), confidence: e.confidence, width80: Math.round(e.width80Kcal) })),
      targetAmplitudeAfterGateKcal: Math.round(Math.max(...window) - Math.min(...window)),
      finalMedianOffsetKcal: final ? Math.round(final.posteriorMedianOffsetKcal) : null,
      finalInterval95: final ? final.interval95.map((x) => Math.round(x)) : null,
      apparentOffsetKcal: Math.round(r.apparentOffsetKcal),
    };

    describe(`scenario ${scenario.key}`, () => {
      it(`never surfaces two recalibrations within ${RECAL_SURFACE_MIN_INTERVAL_DAYS} days`, () => {
        expect(r.events.length).toBeGreaterThan(0);
        for (let i = 1; i < r.events.length; i++) expect((r.events[i]?.day as number) - (r.events[i - 1]?.day as number)).toBeGreaterThanOrEqual(RECAL_SURFACE_MIN_INTERVAL_DAYS);
      });

      it('keeps every calorie target at or above the hard floor', () => {
        for (const kcal of r.calorieTargets) expect(kcal).toBeGreaterThanOrEqual(r.hardFloorKcal - 1e-6);
      });

      if (scenario.key !== 'B') {
        it('covers the apparent offset with the final 95 percent interval', () => {
          expect(final).toBeDefined();
          const [lo, hi] = final?.interval95 ?? [0, 0];
          expect(r.apparentOffsetKcal).toBeGreaterThanOrEqual(lo);
          expect(r.apparentOffsetKcal).toBeLessThanOrEqual(hi);
        });
      }

      it(`records the trajectory (gate J${summary.firstGateDay}, ${summary.recalibrations.length} recalibrations, target amplitude ${summary.targetAmplitudeAfterGateKcal} kcal, final offset ${summary.finalMedianOffsetKcal} vs apparent ${summary.apparentOffsetKcal})`, () => {
        expect(summary).toMatchSnapshot();
      });
    });
  }
});
