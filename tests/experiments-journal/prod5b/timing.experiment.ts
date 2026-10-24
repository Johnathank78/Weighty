/**
 * Pass 5b (report 45), verification 4: time of the weekly evaluation of the measured habit (journal fit on the +-2 000 grid,
 * habit, plan; `evaluateJournalWeek`) on profiles with one year of data (a weigh-in and three meals logged every day,
 * aligned target from day 30, measured habit from day 58), and of the day change (`runDailyChecks`: nothing due; weekly
 * evaluation due, run here or, as the app does, in its worker; periodic replan of the habit due), of the weigh-in checks
 * and of the projection of the Suivi chart.
 * Reference of pass 5a: full recalculation of the current method P95 x 4 = 1 432 ms on one-year profiles.
 * Run: npx vitest run -c vitest.journal.config.ts prod5b/timing
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { addWeight, completeOnboarding, setActualSteps, setAdherence } from '@/domain/engine';
import { addFoodEntry } from '@/domain/journal';
import { acceptMeasuredOffer, evaluateJournalWeek, runJournalWeek, switchToAlignedTarget } from '@/domain/journalPath';
import type { WheightyStore } from '@/domain/types';
import { runDailyChecks, runWeighInChecks } from '@/domain/planSafety';
import { projectionFromToday } from '@/domain/views';
import { emptyStore } from '@/persistence/schema';
import { addDays } from '@/science/dates';
import type { UserProfile } from '@/science/types';
import { makeProfile } from '../../helpers/profiles';
import { createRng } from '../../helpers/random';

const D0 = '2025-09-01';
const DAYS = 365;
const at = (d: string) => `${d}T08:00:00.000Z`;
const MEALS = [
  ['08:00', 0.25],
  ['12:30', 0.4],
  ['19:30', 0.35],
] as const;

function eat(s: WheightyStore, date: string, kcal: number): WheightyStore {
  let out = s;
  for (const [time, share] of MEALS) {
    const r = addFoodEntry(out, { kind: 'manual', food: { name: 'Repas', intake: { energyKcal: Math.round(kcal * share), proteinG: null, carbsG: null, fatG: null }, grams: null }, date, localTime: time, consumedTime: time }, at(date));
    if (!r.ok) throw new Error(r.reason);
    out = r.store;
  }
  return out;
}

/** One year: journal and weigh-in every day; aligned target on day 30, first plan of the habit confirmed on day 58. */
function yearStore(profile: UserProfile, seed: number): WheightyStore {
  const rng = createRng(seed);
  const r = completeOnboarding(emptyStore(), profile, D0, at(D0));
  if (!r.ok) throw new Error(r.reason);
  let s = r.store;
  const rate = profile.goal === 'loss' ? -0.05 : profile.goal === 'gain' ? 0.02 : 0;
  const usual = (s.plan?.calorieTarget ?? 2000) + 250;
  for (let d = 0; d < DAYS; d++) {
    const date = addDays(D0, d);
    if (d > 0) s = addWeight(s, { date, weightKg: profile.currentWeightKg + rate * d * 0.5 + 0.4 * rng.normal() }, at(date));
    if (d === 30) {
      const sw = switchToAlignedTarget(s, date, at(date));
      if (!sw.ok) throw new Error(sw.reason);
      s = sw.store;
    }
    if (d === 58) {
      const offered = runJournalWeek(s, date, at(date));
      const a = acceptMeasuredOffer(offered, date, at(date));
      if (!a.ok) throw new Error('no first plan');
      s = a.store;
    }
    const target = s.plan?.calorieTarget ?? usual;
    s = eat(s, date, (d < 30 ? usual : target * 1.05) * (1 + 0.08 * rng.normal()));
    if (d < 30) s = setAdherence(s, date, 'major_deviation');
    s = setActualSteps(s, date, Math.round(profile.averageSteps7d * (1 + 0.1 * rng.normal())));
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

it('pass 5b timing on one-year profiles in the measured habit', () => {
  const profiles: UserProfile[] = [];
  for (let i = 0; i < 12; i++) {
    const goal = (['loss', 'maintenance', 'gain'] as const)[i % 3] as UserProfile['goal'];
    const w = 64 + 4 * i;
    profiles.push(makeProfile({ sexForEquation: i % 2 ? 'male' : 'female', heightCm: 160 + i * 2, currentWeightKg: w, ageYears: 25 + 3 * i, averageSteps7d: 5000 + 700 * i, goal, targetWeightKg: goal === 'loss' ? w - 8 : goal === 'gain' ? w + 5 : w, weeklyRateTarget: goal === 'loss' ? 0.005 : goal === 'gain' ? 0.0025 : 0 }));
  }
  const rows: Record<string, number[]> = { weeklyEvaluation: [], dayChangeNotDue: [], dayChangeWeekDue: [], dayChangeWeekDueApp: [], dayChangePeriodicDue: [], weighIn: [], projection: [] };
  let measured = 0;
  profiles.forEach((p, i) => {
    const s = yearStore(p, 7_000 + i);
    if (s.meta.journalPath.method === 'measured') measured++;
    const today = addDays(D0, DAYS - 1);
    const due: WheightyStore = { ...s, meta: { ...s.meta, journalPath: { ...s.meta.journalPath, lastEvaluatedOn: addDays(today, -7) } } };
    rows.weeklyEvaluation?.push(time(() => evaluateJournalWeek(due, today, at(today))));
    const checked = runDailyChecks({ ...due, meta: { ...due.meta, journalPath: { ...due.meta.journalPath, lastEvaluatedOn: today } } }, today, at(today));
    rows.dayChangeNotDue?.push(time(() => runDailyChecks(checked, today, at(today))));
    rows.dayChangeWeekDue?.push(time(() => runDailyChecks({ ...checked, meta: { ...checked.meta, journalPath: { ...checked.meta.journalPath, lastEvaluatedOn: addDays(today, -7) } } }, today, at(today))));
    // In the app the weekly evaluation runs in its worker: the day change on the main thread leaves it out.
    rows.dayChangeWeekDueApp?.push(time(() => runDailyChecks({ ...checked, meta: { ...checked.meta, journalPath: { ...checked.meta.journalPath, lastEvaluatedOn: addDays(today, -7) } } }, today, at(today), { journalWeek: false })));
    const periodic: WheightyStore = { ...checked, meta: { ...checked.meta, periodicReplanCheckedOn: null }, plan: checked.plan ? { ...checked.plan, createdAt: `${addDays(today, -28)}T00:00:00.000Z` } : null };
    rows.dayChangePeriodicDue?.push(time(() => runDailyChecks(periodic, today, at(today))));
    rows.weighIn?.push(time(() => runWeighInChecks(checked, today, at(today))));
    rows.projection?.push(time(() => projectionFromToday(checked, today, null)));
  });
  const lines = [`${profiles.length} profiles (${measured} in the measured habit), ${DAYS} days of data each, median of 3 runs per profile (after one warm-up), ms`];
  for (const [k, v] of Object.entries(rows)) lines.push(`${k}: P50 ${pct(v, 0.5).toFixed(1)}, P95 ${pct(v, 0.95).toFixed(1)}, P95 x 4 ${(4 * pct(v, 0.95)).toFixed(0)}, max ${Math.max(...v).toFixed(1)}`);
  mkdirSync('tests/experiments-journal/results/prod5b', { recursive: true });
  writeFileSync('tests/experiments-journal/results/prod5b/timing.txt', `${lines.join('\n')}\n`);
});
