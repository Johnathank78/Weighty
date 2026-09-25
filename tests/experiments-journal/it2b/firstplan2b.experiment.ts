/**
 * Iteration 2b (prompt 38 s5.5): first plan under K2 (horizon 28), compared with S0 and FX, reported without threshold.
 * Run only if K2 is retained: IT2B_SHARD=<k> IT2B_SHARDS=<n> npx vitest run -c vitest.journal.config.ts it2b/firstplan2b
 *
 * First plan = onboarding preview (previewInitialPlan): no weigh-in calibration, so the three arms start at equilibrium;
 * FX differs from S0 by the rate definition, K2 from FX by the horizon (the periodic replan does not act on the first plan).
 * Hypercube: 1 000 slots of closedLoopSlots (seed base firstplan2b = 3.1e9), every requested rate of the goal's slider
 * grid. Golden: the 12 golden profiles and cases R and S, with and without history (same list as firstplan2a).
 * Raw files: results/solver2b/firstplan2b-shard<k>.csv.gz, golden2b-shard0.csv.gz.
 */
import { it } from 'vitest';
import { previewInitialPlan } from '@/domain/engine';
import type { SolverRequest } from '@/domain/engine';
import { snapWeeklyRate, weeklyRateRange } from '@/science/goals';
import type { GoalPlan } from '@/science/goals';
import type { HistoricalIntakeEvidence, UserProfile } from '@/science/types';
import { closedLoopSlots, lhsSeed } from '../../helpers/closedLoop';
import { writeCsvGz } from '../../helpers/journalExport';
import type { CsvValue } from '../../helpers/journalExport';
import { makeProfile } from '../../helpers/profiles';
import { RESULTS } from '../it2/jobs';
import { ARMS_2B, SEED_BASES_2B, SOLVER2B_DIR } from './jobs2b';

const DIR = `${RESULTS}/${SOLVER2B_DIR}`;
const TODAY = '2026-09-13';
const ARMS: Array<['S0' | 'FX' | 'K2', SolverRequest | undefined]> = [
  ['S0', undefined],
  ['FX', ARMS_2B.FX.solver],
  ['K2', ARMS_2B.K2.solver],
];

function firstPlan(profile: UserProfile, solver: SolverRequest | undefined, evidence: HistoricalIntakeEvidence | null = null, today = TODAY): { goalPlan: GoalPlan | null; reason: string } {
  const r = previewInitialPlan(profile, today, evidence, solver);
  return { goalPlan: r.goalPlan, reason: r.ok ? 'ok' : r.reason };
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

it('iteration 2b first plan and golden under K2', () => {
  const shard = Number(process.env.IT2B_SHARD ?? '0');
  const shards = Number(process.env.IT2B_SHARDS ?? '1');
  const slots = closedLoopSlots(1000, lhsSeed(SEED_BASES_2B.firstplan2b));
  const rows: Array<Record<string, CsvValue>> = [];
  slots.forEach((slot, i) => {
    if (i % shards !== shard) return;
    for (const requested of rateGrid(slot.goal)) {
      const profile: UserProfile = { ...slot.profile, weeklyRateTarget: requested };
      for (const [arm, solver] of ARMS) {
        const { goalPlan, reason } = firstPlan(profile, solver);
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
  });
  const cols = (rs: ReadonlyArray<Record<string, CsvValue>>) => [...new Set(rs.flatMap((r) => Object.keys(r)))];
  writeCsvGz(`${DIR}/firstplan2b-shard${shard}.csv.gz`, cols(rows), rows);
  if (shard !== 0) return;
  const golden: Array<Record<string, CsvValue>> = [];
  for (const [name, profile, evidence, today] of GOLDEN_AND_RS) {
    const row: Record<string, CsvValue> = { case: name, goal: profile.goal, requested: profile.weeklyRateTarget };
    for (const [arm, solver] of ARMS) {
      const { goalPlan, reason } = firstPlan(profile, solver, evidence, today);
      const k = arm.toLowerCase();
      row[`target_${k}`] = goalPlan?.calorieTargetKcal ?? null;
      row[`rate_${k}`] = goalPlan?.weeklyRateTarget ?? null;
      row[`status_${k}`] = goalPlan?.status ?? reason;
      row[`rejections_${k}`] = rejections(goalPlan);
      row[`floor_${k}`] = goalPlan?.hardFloorKcal ?? null;
    }
    golden.push(row);
  }
  writeCsvGz(`${DIR}/golden2b-shard0.csv.gz`, cols(golden), golden);
});

const RS_TODAY = '2026-09-14';
const history = (kcal: number): HistoricalIntakeEvidence => ({ evidenceVersion: 1, recordedOn: RS_TODAY, averageCaloriesKcal: kcal, durationDays: 14, startWeightKg: 68, endWeightKg: 68, trackingQuality: 'high', activityComparable: true });
const CASE_R: UserProfile = makeProfile({ sexForEquation: 'female', ageYears: 24, heightCm: 155, currentWeightKg: 68, averageSteps7d: 9400, walkingPace: 'normal', occupation: 'seated', activities: [{ type: 'strength', sessionsPerWeek: 4, durationMin: 55, intensity: 'moderate' }], goal: 'loss', targetWeightKg: 60, weeklyRateTarget: 0.01 });
const CASE_S: UserProfile = { ...CASE_R, activities: [{ type: 'strength', sessionsPerWeek: 5, durationMin: 55, intensity: 'moderate' }], targetWeightKg: 62 };

// Copied verbatim from tests/experiments-journal/it2a/firstplan2a.experiment.ts (itself from tests/science/golden.test.ts).
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
