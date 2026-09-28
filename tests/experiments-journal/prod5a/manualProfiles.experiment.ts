/**
 * Pass 5a (report 43): test profiles for the manual check, written to docs/verification-5a/ (import them in the app:
 * Profil > Mes données > Importer). Each file is checked here before it is written.
 * Run: MANUAL_TODAY=2026-09-28 npx vitest run -c vitest.journal.config.ts prod5a/manualProfiles
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { addWeight, buildPlanFromStore, completeOnboarding, computeCalibrationState, previewInitialPlan, setAdherence } from '@/domain/engine';
import { bmi20Warning, floorAdviceOf, runDailyChecks, runWeighInChecks } from '@/domain/planSafety';
import type { WheightyStore } from '@/domain/types';
import { exportStore, parseImport } from '@/persistence/exportImport';
import { emptyStore } from '@/persistence/schema';
import { addDays } from '@/science/dates';
import type { UserProfile } from '@/science/types';
import { makeProfile } from '../../helpers/profiles';

const TODAY = process.env.MANUAL_TODAY ?? '2026-09-28';
const OUT = 'docs/verification-5a';
const at = (d: string) => `${d}T08:00:00.000Z`;

function history(profile: UserProfile, days: number, kg: (d: number) => number | null, note = true): WheightyStore {
  const start = addDays(TODAY, -days);
  const r = completeOnboarding(emptyStore(), profile, start, at(start));
  if (!r.ok) throw new Error(r.reason);
  let s = r.store;
  for (let d = 1; d < days; d++) {
    const date = addDays(start, d);
    const w = kg(d);
    if (w !== null) s = addWeight(s, { date, weightKg: Math.round(w * 10) / 10 }, at(date));
    if (note) s = setAdherence(s, date, 'on_plan');
  }
  return s;
}

function write(name: string, store: WheightyStore): void {
  const text = exportStore(store, at(TODAY));
  expect(parseImport(text).ok).toBe(true);
  writeFileSync(`${OUT}/${name}`, `${text}\n`);
}

it('pass 5a manual check profiles', () => {
  mkdirSync(OUT, { recursive: true });

  // 1. BMI-20 guardrail: loss plan, trend just above BMI 20 (165 cm: BMI 20 at 54.45 kg), last weigh-in 3 days ago. A weigh-in at 53 kg today crosses it.
  const g1Profile = makeProfile({ firstName: 'Test IMC 20', heightCm: 165, currentWeightKg: 56, goal: 'loss', targetWeightKg: 54.5, weeklyRateTarget: 0.0025 });
  const g1 = runDailyChecks(history(g1Profile, 21, (d) => (d > 18 ? null : d < 10 ? 56 - (1.6 * d) / 10 : 54.4)), TODAY, at(TODAY));
  expect(g1.plan?.goal).toBe('loss');
  expect(bmi20Warning(g1, TODAY, null)).not.toBeNull();
  const crossed = runWeighInChecks(addWeight(g1, { date: TODAY, weightKg: 53 }, at(TODAY)), TODAY, at(TODAY));
  expect(crossed.plan).toMatchObject({ goal: 'maintenance', source: 'guardrail' });
  write('1-garde-fou-imc20.json', g1);

  // 2. Refused recalibration: gain whose trend has passed the target; the recalibration is ready and cannot be rebuilt.
  const gainProfile = makeProfile({ firstName: 'Test recalibration', sexForEquation: 'male', heightCm: 178, currentWeightKg: 66, averageSteps7d: 8000, goal: 'gain', targetWeightKg: 67, weeklyRateTarget: 0.0025 });
  const gain = runDailyChecks(history(gainProfile, 24, (d) => 66 + (1.6 * d) / 23), TODAY, at(TODAY));
  const state = computeCalibrationState(gain, TODAY, at(TODAY));
  expect(state?.surfaced).toBe(true);
  const rebuild = buildPlanFromStore(gain, TODAY, { source: 'recalibrated', ...(state?.candidate ? { snapshot: state.candidate } : {}), stepTarget: gain.plan?.stepTarget as number });
  expect(rebuild.ok ? 'ok' : rebuild.reason).toBe('target_not_above_current');
  write('2-recalibration-refusee.json', gain);

  // 3. Migration: a schema 6 export whose loss target (52.5 kg at 165 cm, BMI 19.3) is under the BMI-20 weight.
  const old = history(makeProfile({ firstName: 'Test migration', heightCm: 165, currentWeightKg: 62, goal: 'loss', targetWeightKg: 57, weeklyRateTarget: 0.005 }), 10, (d) => 62 - 0.05 * d);
  const { planEvents: _e, periodicReplanCheckedOn: _p, guardrailMaintenanceSince: _g, ...meta } = old.meta;
  const v6 = JSON.parse(JSON.stringify({ ...old, schemaVersion: 6, scientificModelVersion: '1.3.0', meta })) as Record<string, Record<string, unknown>>;
  (v6.profile as Record<string, unknown>).targetWeightKg = 52.5;
  (v6.plan as Record<string, unknown>).targetWeightKg = 52.5;
  (v6.plan as Record<string, unknown>).scientificModelVersion = '1.3.0';
  const v6Text = JSON.stringify({ format: 'wheighty-export', formatVersion: 1, exportedAt: at(TODAY), store: v6 }, null, 2);
  const imported = parseImport(v6Text);
  expect(imported.ok && imported.store.profile?.targetWeightKg).toBe(54.5);
  writeFileSync(`${OUT}/3-migration-poids-cible.json`, `${v6Text}\n`);

  // 4. Floor with steps: the onboarding values below give the expected speed and steps; the same profile as a file, for the
  // speed slider of the goal change (Profil > Changer d'objectif).
  const floor = makeProfile({ sexForEquation: 'female', ageYears: 60, heightCm: 155, currentWeightKg: 60.5, averageSteps7d: 3000, goal: 'loss', targetWeightKg: 55, weeklyRateTarget: 0.01 });
  const preview = previewInitialPlan(floor, TODAY, null);
  const advice = floorAdviceOf(preview, 3000);
  writeFileSync(`${OUT}/4-plancher-attendu.txt`, `vitesse ${preview.ok ? preview.plan.weeklyRateTarget : preview.reason}\n${advice?.lines.join('\n') ?? 'aucun conseil'}\n`);
  expect(advice?.proposal.kind).toBe('steps');
  const floorStore = history({ ...floor, firstName: 'Test plancher', weeklyRateTarget: 0.005 }, 3, () => 60.5);
  write('4-plancher.json', floorStore);
});
