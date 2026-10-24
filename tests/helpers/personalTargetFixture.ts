/**
 * UX pass 2, point 2e: what a personal target at the steps of the profile gives (the only kind stored before model 1.8.0),
 * computed by the code it runs on: the entry (onboarding and Plan tab, every line), the estimated rate kept in the plan, the
 * plan and its trace entry, and the takeover at the first recalibration. Produced on the base 1209d49
 * (tests/fixtures/ux2-personal-target-base.json, `personalTargetBase.experiment.ts`) and compared with the branch bit for bit
 * (tests/domain/uxPass2.test.ts), the model version and the random ids apart.
 */
import { addWeight, completeOnboarding, computeCalibrationState, setAdherence } from '@/domain/engine';
import type { CalibrationState } from '@/domain/engine';
import { checkPersonalTarget, choosePersonalTarget, completeOnboardingWithTarget, computePersonalTakeover, onboardingPersonalTargetTable, storePersonalTargetTable } from '@/domain/personalTarget';
import type { WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { addDays } from '@/science/dates';
import type { UserProfile } from '@/science/types';
import { makeProfile } from './profiles';

const D0 = '2026-06-01';
const day = (i: number) => addDays(D0, i);
const at = (date: string) => `${date}T08:00:00.000Z`;

/** The profiles of the tests of report 47 (loss BMI 27.5, loss BMI 24.2, gain, maintenance). */
const PROFILES: Record<string, UserProfile> = {
  loss: makeProfile({ sexForEquation: 'female', ageYears: 35, heightCm: 165, currentWeightKg: 75, goal: 'loss', targetWeightKg: 64, weeklyRateTarget: 0.005 }),
  light: makeProfile({ sexForEquation: 'female', ageYears: 35, heightCm: 165, currentWeightKg: 66, goal: 'loss', targetWeightKg: 60, weeklyRateTarget: 0.004 }),
  gain: makeProfile({ sexForEquation: 'male', heightCm: 180, currentWeightKg: 70, goal: 'gain', targetWeightKg: 76, weeklyRateTarget: 0.0025 }),
  maintenance: makeProfile({ goal: 'maintenance' }),
};
const ENTRIES = [900, 1350, 1608, 1700, 2000, 2200, 2800, 3200];
const TAKEOVERS: Array<{ profile: string; kcal: number; perDay: number }> = [
  { profile: 'loss', kcal: 1700, perDay: -0.05 },
  { profile: 'light', kcal: 1350, perDay: -0.1 },
  { profile: 'loss', kcal: 1700, perDay: -0.005 },
  { profile: 'loss', kcal: 1700, perDay: 0.03 },
  { profile: 'maintenance', kcal: 1700, perDay: -0.03 },
  { profile: 'gain', kcal: 2800, perDay: 0.02 },
];

const ok = (r: { ok: boolean }): WheightyStore => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return (r as { ok: true; store: WheightyStore }).store;
};

/**
 * The store without what is drawn at random (ids) and without the model version (1.7.0 on the base, 1.8.0 after); -0 and
 * the non-finite numbers kept apart, as in the captures.
 */
export function stable(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (key, v: unknown) => {
      if (typeof v === 'number' && (Object.is(v, -0) || !Number.isFinite(v))) return `<${String(Object.is(v, -0) ? '-0' : v)}>`;
      if (key === 'id' && typeof v === 'string') return '<id>';
      if ((key === 'scientificModelVersion' || key === 'modelVersion') && typeof v === 'string') return '<version>';
      return v;
    }),
  );
}

export function personalTargetFixture(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, profile] of Object.entries(PROFILES)) {
    const store = ok(completeOnboarding(emptyStore(), profile, D0, at(D0)));
    const planTable = storePersonalTargetTable(store, D0);
    const onboardingTable = onboardingPersonalTargetTable(profile, D0, null);
    out[`${name}:tables`] = stable({ plan: planTable, onboarding: onboardingTable });
    out[`${name}:entries`] = stable(
      ENTRIES.map((kcal) => ({
        kcal,
        plan: planTable ? checkPersonalTarget(planTable, kcal) : null,
        onboarding: onboardingTable ? checkPersonalTarget(onboardingTable, kcal) : null,
      })),
    );
    out[`${name}:chosen`] = ENTRIES.map((kcal) => {
      const r = choosePersonalTarget(store, D0, kcal, at(D0));
      return r.ok ? stable({ plan: r.store.plan, profile: r.store.profile, events: r.store.meta.planEvents, today: r.store.dailyLogs.at(-1) }) : r;
    });
    out[`${name}:onboarding`] = ENTRIES.map((kcal) => {
      const r = completeOnboardingWithTarget(emptyStore(), profile, D0, at(D0), null, kcal);
      return r.ok ? stable({ plan: r.store.plan, profile: r.store.profile, events: r.store.meta.planEvents }) : r;
    });
  }
  out.takeovers = TAKEOVERS.map((c) => {
    const profile = PROFILES[c.profile] as UserProfile;
    let s = ok(choosePersonalTarget(ok(completeOnboarding(emptyStore(), profile, D0, at(D0))), D0, c.kcal, at(D0)));
    for (let i = 1; i <= 21; i++) {
      s = addWeight(s, { date: day(i), weightKg: profile.currentWeightKg + c.perDay * i }, at(day(i)));
      s = setAdherence(s, day(i), 'on_plan');
    }
    const state = computeCalibrationState(s, day(21), at(day(21))) as CalibrationState;
    return { ...c, takeover: stable(computePersonalTakeover(s, state, day(21), at(day(21)))), table: stable(storePersonalTargetTable(s, day(21))) };
  });
  return out;
}
