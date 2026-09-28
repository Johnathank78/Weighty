/**
 * Pass 5a (report 43), verification 4: time of the full recalculation (computeCalibrationState + applyRecalibration,
 * reference of report 38: P95 x 4 about 425 ms) and of the day-change check (runDailyChecks, periodic replan due or not),
 * on profiles with one year of data (daily weigh-ins, noted days, a recalibration applied every 4 weeks).
 * Run: npx vitest run -c vitest.journal.config.ts prod5a/timing
 */
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { addWeight, applyRecalibration, completeOnboarding, computeCalibrationState, createSliderSession, setAdherence, setActualSteps } from '@/domain/engine';
import type { WheightyStore } from '@/domain/types';
import { bmi20Warning, runDailyChecks, runWeighInChecks } from '@/domain/planSafety';
import { emptyStore } from '@/persistence/schema';
import { addDays } from '@/science/dates';
import type { UserProfile } from '@/science/types';
import { makeProfile } from '../../helpers/profiles';
import { createRng } from '../../helpers/random';

const D0 = '2025-09-01';
const DAYS = 365;
const at = (d: string) => `${d}T08:00:00.000Z`;

function yearStore(profile: UserProfile, seed: number): WheightyStore {
  const rng = createRng(seed);
  const r = completeOnboarding(emptyStore(), profile, D0, at(D0));
  if (!r.ok) throw new Error(r.reason);
  let s = r.store;
  const rate = profile.goal === 'loss' ? -0.05 : profile.goal === 'gain' ? 0.02 : 0;
  for (let d = 1; d < DAYS; d++) {
    const date = addDays(D0, d);
    s = addWeight(s, { date, weightKg: profile.currentWeightKg + rate * d * 0.5 + 0.4 * rng.normal() }, at(date));
    s = setAdherence(s, date, 'on_plan');
    s = setActualSteps(s, date, Math.round(profile.averageSteps7d * (1 + 0.1 * rng.normal())));
    if (d % 28 === 0) {
      const st = computeCalibrationState(s, date, at(date));
      if (st?.gate.met) {
        const a = applyRecalibration(s, st, date, at(date));
        if (a.ok) s = a.store;
      }
    }
  }
  return s;
}

const pct = (xs: number[], q: number) => {
  const v = [...xs].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(q * (v.length - 1) + 0.5))] as number;
};
function time(fn: () => unknown): number {
  const out: number[] = [];
  fn();
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    fn();
    out.push(performance.now() - t);
  }
  return out.sort((a, b) => a - b)[1] as number;
}

it('pass 5a timing on one-year profiles', () => {
  const profiles: UserProfile[] = [];
  for (let i = 0; i < 12; i++) {
    const goal = (['loss', 'maintenance', 'gain'] as const)[i % 3] as UserProfile['goal'];
    const w = 60 + 4 * i;
    profiles.push(makeProfile({ sexForEquation: i % 2 ? 'male' : 'female', heightCm: 160 + i * 2, currentWeightKg: w, ageYears: 25 + 3 * i, averageSteps7d: 5000 + 700 * i, goal, targetWeightKg: goal === 'loss' ? w - 8 : goal === 'gain' ? w + 5 : w, weeklyRateTarget: goal === 'loss' ? 0.005 : goal === 'gain' ? 0.0025 : 0 }));
  }
  const rows: Record<string, number[]> = { recalculation: [], dayChangeNotDue: [], dayChangeDue: [], weighIn: [], bmi20Warning: [], sliderSession: [] };
  profiles.forEach((p, i) => {
    const s = yearStore(p, 5_000 + i);
    const today = addDays(D0, DAYS - 1);
    const state = computeCalibrationState(s, today, at(today));
    rows.recalculation?.push(
      time(() => {
        const st = computeCalibrationState(s, today, at(today));
        if (st?.gate.met) applyRecalibration(s, st, today, at(today));
      }),
    );
    const checked = runDailyChecks(s, today, at(today));
    rows.dayChangeNotDue?.push(time(() => runDailyChecks(checked, today, at(today))));
    const due: WheightyStore = { ...checked, meta: { ...checked.meta, periodicReplanCheckedOn: null }, plan: checked.plan ? { ...checked.plan, createdAt: `${addDays(today, -28)}T00:00:00.000Z` } : null };
    rows.dayChangeDue?.push(time(() => runDailyChecks(due, today, at(today))));
    rows.weighIn?.push(time(() => runWeighInChecks(checked, today, at(today))));
    rows.bmi20Warning?.push(time(() => bmi20Warning(checked, today, state)));
    rows.sliderSession?.push(time(() => createSliderSession(checked, today)));
  });
  const lines = [`${profiles.length} profiles, ${DAYS} days of data each, median of 3 runs per profile (after one warm-up), ms`];
  for (const [k, v] of Object.entries(rows)) lines.push(`${k}: P50 ${pct(v, 0.5).toFixed(1)}, P95 ${pct(v, 0.95).toFixed(1)}, P95 x 4 ${(4 * pct(v, 0.95)).toFixed(0)}, max ${Math.max(...v).toFixed(1)}`);
  writeFileSync('tests/experiments-journal/results/prod5a/timing.txt', `${lines.join('\n')}\n`);
});
