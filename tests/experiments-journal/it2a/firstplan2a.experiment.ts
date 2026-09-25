/**
 * Iteration 2a (prompt 37 s5.3 and s5.4): effect of the retained fix on the first plan, reported without threshold, and
 * the slider invariants on the first plans. Run: npx vitest run -c vitest.journal.config.ts it2a/firstplan2a
 *
 * First plan = onboarding preview (previewInitialPlan). No weigh-in calibration exists yet, so the fix FX (currentState
 * + sustainedTissue) starts at equilibrium and differs from the control S0 only through the rate definition.
 * Hypercube: 1 000 slots of closedLoopSlots (seed base firstplan2a = 2.4e9), every requested rate of the goal's slider
 * grid. Golden: the 12 golden profiles (copied verbatim from tests/science/golden.test.ts, as in the capture) and cases R
 * and S (with the capture's warm-start history, and without history).
 * Run on shards: IT2A_SHARD=<k> IT2A_SHARDS=<n> (profiles i mod n = k; golden on shard 0).
 * Raw files: results/solver/firstplan2a-shard<k>.csv.gz, invariants2a-shard<k>.csv.gz, golden2a-shard0.csv.gz.
 */
import { it } from 'vitest';
import { previewInitialPlan } from '@/domain/engine';
import type { SolverRequest } from '@/domain/engine';
import { buildGoalPlan, sliderBounds, snapWeeklyRate, solveSliderPoint, weeklyRateRange } from '@/science/goals';
import type { GoalPlan, PlanContext } from '@/science/goals';
import type { HistoricalIntakeEvidence, UserProfile } from '@/science/types';
import { closedLoopSlots, lhsSeed } from '../../helpers/closedLoop';
import { writeCsvGz } from '../../helpers/journalExport';
import type { CsvValue } from '../../helpers/journalExport';
import { makeProfile } from '../../helpers/profiles';
import { RESULTS } from '../it2/jobs';
import { SEED_BASES_2A, SOLVER_ARMS, SOLVER_DIR } from './jobs2a';

const DIR = `${RESULTS}/${SOLVER_DIR}`;
const TODAY = '2026-09-13';
const FX = SOLVER_ARMS.FX as SolverRequest;

function firstPlan(profile: UserProfile, solver: SolverRequest | undefined, evidence: HistoricalIntakeEvidence | null = null, today = TODAY): { goalPlan: GoalPlan | null; context: PlanContext | null; reason: string } {
  const r = previewInitialPlan(profile, today, evidence, solver);
  return { goalPlan: r.goalPlan, context: r.ok ? r.context : null, reason: r.ok ? 'ok' : r.reason };
}

const floorSlowed = (g: GoalPlan | null) => (g?.rejections ?? []).some((x) => x.reason === 'below_hard_floor');
const rejections = (g: GoalPlan | null) => (g?.rejections ?? []).map((x) => `${x.weeklyRate}:${x.reason}`).join('/');

function rateGrid(goal: UserProfile['goal']): number[] {
  if (goal === 'maintenance') return [0];
  const { minRate, maxRate, step } = weeklyRateRange(goal);
  const out: number[] = [];
  for (let r = minRate; r <= maxRate + 1e-9; r += step) out.push(snapWeeklyRate(r));
  return out;
}

/** Slider invariants of one plan under its context: monotone calories in steps, day-42 horizon value on its target. */
function invariants(ctx: PlanContext, goal: UserProfile['goal'], calorieTargetKcal: number, steps: number): { points: number; monotone: boolean; maxGap: number; notConverged: number } {
  const baseline = { goal, scenario: { calorieTargetKcal, stepsPerDay: steps } };
  const bounds = sliderBounds(steps);
  let previous = Number.NEGATIVE_INFINITY;
  let monotone = true;
  let maxGap = 0;
  let points = 0;
  let notConverged = 0;
  for (let s = bounds.minSteps; s <= bounds.maxSteps; s += 500) {
    const pt = solveSliderPoint(ctx, baseline, s);
    points++;
    if (!pt.converged) notConverged++;
    if (pt.calorieTargetKcal < previous - 1e-9) monotone = false;
    previous = pt.calorieTargetKcal;
    maxGap = Math.max(maxGap, Math.abs(pt.weightAtHorizonKg - pt.baselineWeightAtHorizonKg));
  }
  return { points, monotone, maxGap, notConverged };
}

it('iteration 2a first plan, golden, invariants on first plans', () => {
  const shard = Number(process.env.IT2A_SHARD ?? '0');
  const shards = Number(process.env.IT2A_SHARDS ?? '1');
  const slots = closedLoopSlots(1000, lhsSeed(SEED_BASES_2A.firstplan2a));
  const rows: Array<Record<string, CsvValue>> = [];
  const inv: Array<Record<string, CsvValue>> = [];
  slots.forEach((slot, i) => {
    if (i % shards !== shard) return;
    for (const requested of rateGrid(slot.goal)) {
      const profile: UserProfile = { ...slot.profile, weeklyRateTarget: requested };
      for (const arm of ['S0', 'FX'] as const) {
        const { goalPlan, reason } = firstPlan(profile, SOLVER_ARMS[arm]);
        rows.push({
          profile_index: i,
          profile_key: slot.key,
          sex: slot.sex,
          bmi_class: slot.bmiClass,
          activity: slot.activity,
          goal: slot.goal,
          weight: profile.currentWeightKg,
          requested,
          solver_arm: arm,
          status: goalPlan?.status === 'ok' && reason !== 'ok' ? reason : (goalPlan?.status ?? reason),
          target: goalPlan?.calorieTargetKcal ?? null,
          applied_rate: goalPlan?.weeklyRateTarget ?? null,
          floor_kcal: goalPlan?.hardFloorKcal ?? null,
          floor_slowed: floorSlowed(goalPlan),
          rejections: rejections(goalPlan),
          horizon_value: goalPlan?.solve?.weightAtHorizonKg ?? null,
          horizon_target: goalPlan?.solve?.targetWeightAtHorizonKg ?? null,
        });
      }
    }
    // 5.4 on the first plans: every 5th profile, its own requested rate, under FX.
    if (i % 5 === 0) {
      const { goalPlan, context } = firstPlan(slot.profile, FX);
      if (goalPlan?.status === 'ok' && context && goalPlan.calorieTargetKcal !== null) {
        const r = invariants(context, slot.goal, goalPlan.calorieTargetKcal, slot.profile.averageSteps7d);
        inv.push({ source: 'premier plan (hypercube)', profile_index: i, goal: slot.goal, points: r.points, monotone: r.monotone, max_abs_tissue_gap: r.maxGap, not_converged: r.notConverged });
      }
    }
  });
  const cols = (rs: ReadonlyArray<Record<string, CsvValue>>) => [...new Set(rs.flatMap((r) => Object.keys(r)))];
  writeCsvGz(`${DIR}/firstplan2a-shard${shard}.csv.gz`, cols(rows), rows);
  writeCsvGz(`${DIR}/invariants2a-shard${shard}.csv.gz`, cols(inv), inv);

  // Golden and cases R and S (shard 0 only).
  if (shard !== 0) return;
  const golden: Array<Record<string, CsvValue>> = [];
  for (const [name, profile, evidence, today] of GOLDEN_AND_RS) {
    const a = firstPlan(profile, undefined, evidence, today);
    const b = firstPlan(profile, FX, evidence, today);
    // Same context, production solver called directly: equality with the preview checks the path.
    if (a.context && a.goalPlan) {
      const direct = buildGoalPlan(a.context, { goal: profile.goal, weeklyRate: profile.weeklyRateTarget, targetWeightKg: profile.targetWeightKg, stepTarget: profile.averageSteps7d });
      if (direct.calorieTargetKcal !== a.goalPlan.calorieTargetKcal) throw new Error(`golden path mismatch ${name}`);
    }
    golden.push({
      case: name,
      goal: profile.goal,
      requested: profile.weeklyRateTarget,
      target_s0: a.goalPlan?.calorieTargetKcal ?? null,
      target_fx: b.goalPlan?.calorieTargetKcal ?? null,
      rate_s0: a.goalPlan?.weeklyRateTarget ?? null,
      rate_fx: b.goalPlan?.weeklyRateTarget ?? null,
      status_s0: a.goalPlan?.status ?? a.reason,
      status_fx: b.goalPlan?.status ?? b.reason,
      floor_kcal: b.goalPlan?.hardFloorKcal ?? null,
      rejections_s0: rejections(a.goalPlan),
      rejections_fx: rejections(b.goalPlan),
    });
  }
  writeCsvGz(`${DIR}/golden2a-shard0.csv.gz`, cols(golden), golden);
});

const RS_TODAY = '2026-09-14';
const history = (kcal: number): HistoricalIntakeEvidence => ({ evidenceVersion: 1, recordedOn: RS_TODAY, averageCaloriesKcal: kcal, durationDays: 14, startWeightKg: 68, endWeightKg: 68, trackingQuality: 'high', activityComparable: true });
const CASE_R: UserProfile = makeProfile({ sexForEquation: 'female', ageYears: 24, heightCm: 155, currentWeightKg: 68, averageSteps7d: 9400, walkingPace: 'normal', occupation: 'seated', activities: [{ type: 'strength', sessionsPerWeek: 4, durationMin: 55, intensity: 'moderate' }], goal: 'loss', targetWeightKg: 60, weeklyRateTarget: 0.01 });
const CASE_S: UserProfile = { ...CASE_R, activities: [{ type: 'strength', sessionsPerWeek: 5, durationMin: 55, intensity: 'moderate' }], targetWeightKg: 62 };

// Copied verbatim from tests/science/golden.test.ts (as in tests/experiments-journal/capture/golden.experiment.ts).
const GOLDEN: Array<[string, UserProfile]> = [
  ['01 female 25 sedentary normal BMI loss', makeProfile({ ageYears: 25, sexForEquation: 'female', heightCm: 165, currentWeightKg: 62, averageSteps7d: 4500, occupation: 'seated', goal: 'loss', targetWeightKg: 57, weeklyRateTarget: 0.005 })],
  ['02 male 30 low active normal BMI maintenance', makeProfile({ ageYears: 30, sexForEquation: 'male', heightCm: 180, currentWeightKg: 75, averageSteps7d: 8500, occupation: 'mixed', goal: 'maintenance', targetWeightKg: 75 })],
  ['03 female 35 resistance training loss', makeProfile({ ageYears: 35, sexForEquation: 'female', heightCm: 168, currentWeightKg: 70, averageSteps7d: 7000, activities: [{ type: 'strength', sessionsPerWeek: 3, durationMin: 60, intensity: 'moderate' }], goal: 'loss', targetWeightKg: 64, weeklyRateTarget: 0.005 })],
  [
    '04 male 28 athlete-like resistance + endurance maintenance',
    makeProfile({
      ageYears: 28,
      sexForEquation: 'male',
      heightCm: 182,
      currentWeightKg: 80,
      averageSteps7d: 11000,
      occupation: 'mixed',
      bodyFatPercent: 12,
      bodyFatMethod: 'dxa',
      activities: [
        { type: 'strength', sessionsPerWeek: 3, durationMin: 75, intensity: 'vigorous' },
        { type: 'running', sessionsPerWeek: 3, durationMin: 50, intensity: 'moderate' },
      ],
      goal: 'maintenance',
      targetWeightKg: 80,
    }),
  ],
  ['05 female 42 obesity low active loss', makeProfile({ ageYears: 42, sexForEquation: 'female', heightCm: 162, currentWeightKg: 95, averageSteps7d: 6500, occupation: 'mixed', goal: 'loss', targetWeightKg: 80, weeklyRateTarget: 0.005 })],
  ['06 male 45 obesity active loss', makeProfile({ ageYears: 45, sexForEquation: 'male', heightCm: 176, currentWeightKg: 112, averageSteps7d: 12000, occupation: 'physical', goal: 'loss', targetWeightKg: 95, weeklyRateTarget: 0.0075 })],
  ['07 female 55 active maintenance', makeProfile({ ageYears: 55, sexForEquation: 'female', heightCm: 164, currentWeightKg: 60, averageSteps7d: 12500, occupation: 'standing', activities: [{ type: 'cycling', sessionsPerWeek: 3, durationMin: 60, intensity: 'moderate' }], goal: 'maintenance', targetWeightKg: 60 })],
  ['08 male 60 moderate activity maintenance', makeProfile({ ageYears: 60, sexForEquation: 'male', heightCm: 175, currentWeightKg: 82, averageSteps7d: 8000, occupation: 'mixed', activities: [{ type: 'walking', sessionsPerWeek: 4, durationMin: 45, intensity: 'moderate' }], goal: 'maintenance', targetWeightKg: 82 })],
  ['09 female 65 resistance training maintenance', makeProfile({ ageYears: 65, sexForEquation: 'female', heightCm: 160, currentWeightKg: 63, averageSteps7d: 7000, activities: [{ type: 'strength', sessionsPerWeek: 2, durationMin: 45, intensity: 'moderate' }], goal: 'maintenance', targetWeightKg: 63 })],
  ['10 male 35 resistance training gain', makeProfile({ ageYears: 35, sexForEquation: 'male', heightCm: 178, currentWeightKg: 72, averageSteps7d: 9000, activities: [{ type: 'strength', sessionsPerWeek: 4, durationMin: 70, intensity: 'vigorous' }], goal: 'gain', targetWeightKg: 78, weeklyRateTarget: 0.0025 })],
  ['11 female 30 endurance heavy gain', makeProfile({ ageYears: 30, sexForEquation: 'female', heightCm: 170, currentWeightKg: 56, averageSteps7d: 14000, activities: [{ type: 'running', sessionsPerWeek: 5, durationMin: 60, intensity: 'moderate' }, { type: 'swimming', sessionsPerWeek: 2, durationMin: 45, intensity: 'moderate' }], goal: 'gain', targetWeightKg: 59, weeklyRateTarget: 0.001 })],
  [
    '12 valid indirect calorimetry',
    makeProfile({ ageYears: 40, sexForEquation: 'female', heightCm: 166, currentWeightKg: 68, averageSteps7d: 7500, measuredRmr: { kcalPerDay: 1420, measuredAt: '2026-06-01', weightKgAtTest: 67.5, method: 'indirect_calorimetry', conditionsKnown: true }, goal: 'loss', targetWeightKg: 63, weeklyRateTarget: 0.0025 }),
  ],
];

const GOLDEN_AND_RS: Array<[string, UserProfile, HistoricalIntakeEvidence | null, string]> = [
  ...GOLDEN.map(([n, p]) => [n, p, null, TODAY] as [string, UserProfile, null, string]),
  ['R (historique 1 450 kcal)', CASE_R, history(1450), RS_TODAY],
  ['S (historique 1 450 kcal)', CASE_S, history(1450), RS_TODAY],
  ['R (sans historique)', CASE_R, null, RS_TODAY],
  ['S (sans historique)', CASE_S, null, RS_TODAY],
];
