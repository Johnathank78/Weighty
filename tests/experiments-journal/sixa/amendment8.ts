/**
 * Amendment 8 of tests/experiments-journal/THRESHOLDS.md (report 49, point 7): reanchoring after a pause. Simulated world,
 * measures and the plans of the periodic replan, as the amendment describes them; one JSON line per simulated user.
 *
 * World (same Hall model as the estimator: this validates the reanchoring, not the physiology):
 * - profile R (female, 24, 155 cm, 68 kg, strength 4 x 55 min), loss at 0.5 %/week, the fixed target of the first plan of
 *   production (onboarding without history), its steps;
 * - true offset uniform in [-300; +300] kcal/day, drawn first, once per repetition; the true body is the Hall model at 68 kg
 *   with the population maintenance + that offset (as tests/helpers/convergenceJourney.ts), carbohydrates of the plan scaled
 *   to the intake;
 * - before the pause, days 0 to 20: a weigh-in every day (day 0: the onboarding weigh-in, 68 kg as typed; then the morning
 *   true weight + 0.5 x Student t with 4 degrees of freedom, shown to 0.1 kg), "plan respecté" declared every day, true
 *   intake = target, steps = target (not entered);
 * - pause of G days between the last weigh-in (day 20) and the weigh-in back (day R = 20 + G): no weigh-in, no adherence,
 *   no journal; the daily logs exist with the target, as the app creates them. True intake during the pause: the target, the
 *   true maintenance (population maintenance at the true weight of the last day before the pause + the true offset), or the
 *   target - 300;
 * - back from day R: the same tracking up to day R + 14 included;
 * - reference: the same seed without a pause (tracking every day from day 0 to R + 14, intake = target), reported only.
 *
 * Measures at R, R + 7 and R + 14, for each estimator ('sans' = today's code, 'A', 'B'), on the store of that day: the fit of
 * the day, its median offset (the offset retained), the modeled weight of the day at that offset; m0 (day R) =
 * |modeled - weigh-in of day R|; m1 (R + 7, R + 14) = |modeled - true weight|. At R and R + 7, the plan the periodic replan
 * would build from that fit (snapshot applied that day, production solver with the estimator's modeled body).
 */
import { buildPlanFromStore, calibrationInputFromStore, completeOnboarding, gateOf, addWeight, ensureDailyLogs, setAdherence } from '@/domain/engine';
import { RULES_6A } from '@/domain/ruleSwitches';
import type { WheightyStore } from '@/domain/types';
import { emptyStore } from '@/persistence/schema';
import { assessBaseline, planContextFrom } from '@/science/assessment';
import { buildSnapshot, fitCalibration } from '@/science/calibration';
import { LOSS_RATE_HARD_MAX } from '@/science/constants';
import { addDays } from '@/science/dates';
import { baselineCarbFractionFor, guardrailMaxWeeklyRate } from '@/science/goals';
import { advance, bodyWeightOf, initialState, initializeHall } from '@/science/hall/model';
import { bmi } from '@/science/macros';
import { modeledBodyAt } from '@/science/modeledBody';
import { netStepKcal } from '@/science/activity';
import type { UserProfile } from '@/science/types';
import { createRng } from '../../helpers/random';
import { makeProfile } from '../../helpers/profiles';

export const START = '2026-09-15';
export const PROFILE_R: UserProfile = makeProfile({
  sexForEquation: 'female',
  ageYears: 24,
  heightCm: 155,
  currentWeightKg: 68,
  averageSteps7d: 9400,
  walkingPace: 'normal',
  occupation: 'seated',
  activities: [{ type: 'strength', sessionsPerWeek: 4, durationMin: 55, intensity: 'moderate' }],
  goal: 'loss',
  targetWeightKg: 60,
  weeklyRateTarget: 0.005,
});

export const GAPS = [15, 22, 35] as const;
export const PAUSE_INTAKES = ['target', 'maintenance', 'target_minus_300'] as const;
export type PauseIntake = (typeof PAUSE_INTAKES)[number];
export type Cell = { index: number; gap: number; intake: PauseIntake };
export const CELLS: Cell[] = GAPS.flatMap((gap, gi) => PAUSE_INTAKES.map((intake, ti) => ({ index: gi * 3 + ti, gap, intake })));

/** Seeds of the amendment (declared). createRng reads `seed >>> 0`: the effective seeds are reported with them. */
export const TRAINING_SEED = (cell: number, rep: number) => 6_100_000_000 + 10_000 * cell + rep;
export const VALIDATION_SEED = (cell: number, rep: number) => 6_200_000_000 + 10_000 * cell + rep;
export const BOOTSTRAP_SEED = 6_300_000_001;

const PRE_DAYS = 20;
const BACK_DAYS = 14;
const iso = (date: string) => `${date}T07:00:00.000Z`;

export type Estimator = 'sans' | 'A' | 'B';
export type PlanBrief = { ok: boolean; reason?: string; calorieTargetKcal?: number; weeklyRateTarget?: number; hardFloorKcal?: number; goal?: string; underFloor?: boolean; forbiddenRate?: boolean; rateCap?: number | null };
export type Measure = { day: number; date: string; offsetKcal: number; modeledKg: number; weighInKg: number | null; trueKg: number; m: number; plan?: PlanBrief };
export type UserRecord = {
  phase: 'pilot' | 'training' | 'validation';
  cell: number;
  gap: number;
  intake: PauseIntake;
  rep: number;
  seed: number;
  effectiveSeed: number;
  trueOffsetKcal: number;
  targetKcal: number;
  returnDay: number;
  pauseIntakeKcal: number;
  estimators: Partial<Record<Estimator, Measure[]>>;
  reference?: Measure[];
  ms: number;
};

type World = { store: WheightyStore; trueKgByDay: number[]; weighInByDay: Map<number, number>; targetKcal: number; pauseIntakeKcal: number; returnDay: number; trueOffsetKcal: number };

/**
 * The simulated user of one repetition, with a pause of `gap` days; null: the reference, without a pause, tracked every day up
 * to `referenceReturnDay` + 14 (the days of the cell it is the reference of).
 */
export function simulate(seed: number, gap: number | null, intake: PauseIntake, referenceReturnDay?: number): World {
  const rng = createRng(seed);
  const trueOffsetKcal = rng.uniform(-300, 300);
  const profile = PROFILE_R;
  const onboarding = completeOnboarding(emptyStore(), profile, START, iso(START));
  if (!onboarding.ok) throw new Error(onboarding.reason);
  let store = onboarding.store;
  const plan = store.plan;
  if (!plan) throw new Error('no plan');
  const targetKcal = plan.calorieTarget;
  const steps = plan.stepTarget;
  const assessment = assessBaseline(profile, START);
  const ctx = planContextFrom(profile, assessment, assessment.populationTdeeKcal);
  const body = initializeHall({
    sex: profile.sexForEquation,
    ageYears: profile.ageYears,
    heightM: profile.heightCm / 100,
    bodyWeightKg: profile.currentWeightKg,
    baselineIntakeKcal: assessment.populationTdeeKcal + trueOffsetKcal,
    baselineRmrKcal: assessment.ree.reeKcalDay,
    baselineCarbFraction: baselineCarbFractionFor(ctx, profile.goal),
  });
  let state = initialState(body);
  const returnDay = gap === null ? (referenceReturnDay ?? PRE_DAYS) : PRE_DAYS + gap;
  const lastDay = returnDay + BACK_DAYS;
  const pauseRef = gap === null ? null : { from: PRE_DAYS + 1, to: returnDay - 1 };
  const stepDelta =
    (netStepKcal({ steps, pace: profile.walkingPace, weightKg: profile.currentWeightKg, ageYears: profile.ageYears }) -
      netStepKcal({ steps: profile.averageSteps7d, pace: profile.walkingPace, weightKg: profile.currentWeightKg, ageYears: profile.ageYears })) /
    profile.currentWeightKg;
  const trueKgByDay: number[] = [];
  const weighInByDay = new Map<number, number>();
  let pauseIntakeKcal = targetKcal;
  for (let d = 0; d <= lastDay; d++) {
    const date = addDays(START, d);
    const trueKg = bodyWeightOf(body, state);
    trueKgByDay.push(trueKg);
    const inPause = pauseRef !== null && d >= pauseRef.from && d <= pauseRef.to;
    store = ensureDailyLogs(store, date);
    if (d > 0 && !inPause) {
      const kg = Math.round((trueKg + 0.5 * rng.studentT(4)) * 10) / 10;
      weighInByDay.set(d, kg);
      store = addWeight(store, { date, weightKg: kg }, iso(date));
    } else if (d === 0) {
      weighInByDay.set(0, profile.currentWeightKg);
    }
    if (!inPause) store = setAdherence(store, date, 'on_plan');
    if (d === lastDay) break;
    if (pauseRef !== null && d === pauseRef.from) {
      // True intake of the pause, fixed on its first day.
      const atPause = assessBaseline(profile, START, { weightKg: trueKg, palCategory: assessment.palCategory });
      pauseIntakeKcal = intake === 'target' ? targetKcal : intake === 'maintenance' ? atPause.populationTdeeKcal + trueOffsetKcal : targetKcal - 300;
    }
    const eaten = inPause ? pauseIntakeKcal : targetKcal;
    state = advance(body, state, { intakeKcal: eaten, carbKcal: plan.macros.carbsG * 4 * (eaten / targetKcal), paDeltaKcalPerKgDay: stepDelta, sodiumDeltaMg: 0 }, 1);
  }
  return { store, trueKgByDay, weighInByDay, targetKcal, pauseIntakeKcal, returnDay, trueOffsetKcal };
}

/** The store as it was on day `day` (weigh-ins and logs up to that day). */
function asOf(store: WheightyStore, date: string): WheightyStore {
  return { ...store, weights: store.weights.filter((w) => w.date <= date), dailyLogs: store.dailyLogs.filter((l) => l.date <= date) };
}

function withEstimator<T>(e: Estimator, fn: () => T): T {
  const previous = RULES_6A.reanchor;
  RULES_6A.reanchor = e === 'sans' ? 'off' : e;
  try {
    return fn();
  } finally {
    RULES_6A.reanchor = previous;
  }
}

/** Plan the periodic replan would build on `date` from the fit of that day (snapshot applied that day). */
function replanBrief(store: WheightyStore, date: string, fit: NonNullable<ReturnType<typeof fitCalibration>>, populationTdeeAtStartKcal: number): PlanBrief {
  const snapshot = { ...buildSnapshot(fit, gateOf(store), populationTdeeAtStartKcal, iso(date)), appliedAt: iso(date) };
  const withSnapshot: WheightyStore = { ...store, calibrationSnapshots: [...store.calibrationSnapshots, snapshot] };
  const r = buildPlanFromStore(withSnapshot, date, { source: 'periodic_replan', snapshot, stepTarget: store.plan?.stepTarget ?? PROFILE_R.averageSteps7d });
  if (!r.ok) return { ok: false, reason: r.reason };
  const p = r.plan;
  const cap = guardrailMaxWeeklyRate(p.goal, bmi(p.planWeightKg ?? PROFILE_R.currentWeightKg, PROFILE_R.heightCm));
  const floor = p.hardFloorKcal ?? 0;
  return {
    ok: true,
    calorieTargetKcal: p.calorieTarget,
    weeklyRateTarget: p.weeklyRateTarget,
    hardFloorKcal: floor,
    goal: p.goal,
    rateCap: cap,
    underFloor: p.calorieTarget < floor - 1e-9,
    forbiddenRate: p.goal === 'loss' ? p.weeklyRateTarget > Math.min(LOSS_RATE_HARD_MAX, cap ?? 0) + 1e-9 : false,
  };
}

/** Measures of one estimator on a simulated user, at R, R + 7 and R + 14. */
export function measure(world: World, e: Estimator, withPlans: boolean): Measure[] {
  return withEstimator(e, () =>
    [0, 7, 14].map((k) => {
      const day = world.returnDay + k;
      const date = addDays(START, day);
      const store = asOf(world.store, date);
      const input = calibrationInputFromStore(store, date);
      if (!input) throw new Error('no input');
      const fit = fitCalibration(input);
      if (!fit) throw new Error('no fit');
      const offset = fit.posterior.medianKcal;
      const body = modeledBodyAt(input, offset, date);
      if (!body) throw new Error('no body');
      const weighIn = world.weighInByDay.get(day) ?? null;
      const trueKg = world.trueKgByDay[day] as number;
      const m = k === 0 ? Math.abs(body.modeledWeightKg - (weighIn as number)) : Math.abs(body.modeledWeightKg - trueKg);
      const out: Measure = { day, date, offsetKcal: offset, modeledKg: body.modeledWeightKg, weighInKg: weighIn, trueKg, m };
      if (withPlans && k < 14) out.plan = replanBrief(store, date, fit, input.populationTdeeAtStartKcal);
      return out;
    }),
  );
}

/** One simulated user: the estimators asked on the store with the pause, and the reference without a pause when asked. */
export function runUser(phase: UserRecord['phase'], cell: Cell, rep: number, seed: number, estimators: readonly Estimator[], reference: boolean): UserRecord {
  const t0 = performance.now();
  const world = simulate(seed, cell.gap, cell.intake);
  const record: UserRecord = {
    phase,
    cell: cell.index,
    gap: cell.gap,
    intake: cell.intake,
    rep,
    seed,
    effectiveSeed: seed >>> 0,
    trueOffsetKcal: world.trueOffsetKcal,
    targetKcal: world.targetKcal,
    returnDay: world.returnDay,
    pauseIntakeKcal: world.pauseIntakeKcal,
    estimators: {},
    ms: 0,
  };
  for (const e of estimators) record.estimators[e] = measure(world, e, true);
  if (reference) {
    // Same seed, no pause: tracking every day; measured with today's code at the same days.
    record.reference = measure(simulate(seed, null, cell.intake, world.returnDay), 'sans', false);
  }
  record.ms = performance.now() - t0;
  return record;
}
