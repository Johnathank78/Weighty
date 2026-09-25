/**
 * Iteration 2, control 6.1 failed: diagnostic of the ideal world (measurement only, no criterion). For each loss or gain
 * user of the ideal run and each block start D (28, 56, 84, 112, 140), with the plan active on day D:
 * - ratio_world: 28-day true-weight slope of the simulated world / (plan rate x true weight at D);
 * - ratio_solver_fresh: same slope, days 7 to 35, of the production solver's own Hall model started at a fresh equilibrium
 *   (hallParametersFor at the true weight, baseline = plan maintenance, input hallInputFor(plan target)), i.e. what the
 *   plan assumes once the first week's water and glycogen shift is past;
 * - fresh_week1_share: share of the solver's 42-day change that happens in its first 7 days;
 * - world_change_at_plan_maintenance_42d: change of the world's true weight over 42 days at the plan maintenance intake;
 * - at_kcal: adaptive thermogenesis of the world on day D.
 * Run: IT2_SHARD=k IT2_SHARDS=16 npx vitest run -c vitest.journal.config.ts it2/ideal-diagnostic
 */
import { it } from 'vitest';
import { assessBaseline, planContextFrom } from '@/science/assessment';
import { hallInputFor, hallParametersFor } from '@/science/goals';
import { simulateHall } from '@/science/hall/model';
import { addDays } from '@/science/dates';
import { POPULATIONS, SEED_BASES, SIM_START, buildWorld, closedLoopSlots, lhsSeed, makeSpec, olsSlope, simulateUser } from '../../helpers/closedLoop';
import { worldAdvance, worldBodyWeight, worldInitialState } from '../../helpers/closedLoopHall';
import { writeCsvGz } from '../../helpers/journalExport';
import type { CsvValue } from '../../helpers/journalExport';
import { RESULTS } from './jobs';

it('ideal-world diagnostic', () => {
  const shard = Number(process.env.IT2_SHARD ?? 0);
  const shards = Number(process.env.IT2_SHARDS ?? 1);
  const base = SEED_BASES.ideal;
  const slots = closedLoopSlots(200, lhsSeed(base));
  const rows: Array<Record<string, CsvValue>> = [];
  for (let i = shard; i < 200; i += shards) {
    const spec = makeSpec(slots[i]!, base, i, { pass: 'ideal', behavior: 'follower', population: POPULATIONS.P00!, ideal: true });
    const goal = spec.slot.goal;
    if (goal === 'maintenance') continue;
    const st = simulateUser(spec, [{ key: 'A', kind: 'A' }]).arms[0]!.state;
    const world = buildWorld(spec);
    const profile = spec.slot.profile;
    let s = worldInitialState(world.hall);
    const states = [s];
    for (let d = 0; d < 168; d++) {
      s = worldAdvance(world.hall, s, { intakeKcal: st.realKcal[d]!, carbKcal: st.realCarbsG[d]! * 4, paDeltaKcalPerKgDay: 0, sodiumDeltaMg: 0 }, 1);
      states.push(s);
    }
    for (const D of [28, 56, 84, 112, 140]) {
      const plan = [...st.plans].reverse().find((p) => p.day <= D)!;
      const wD = st.trueW[D]!;
      const sign = goal === 'loss' ? -1 : 1;
      const requestedPerDay = (sign * plan.weeklyRateTarget * wD) / 7;
      const ratioWorld = olsSlope(st.trueW.slice(D, D + 29)) / requestedPerDay;
      const a = assessBaseline({ ...profile, currentWeightKg: wD }, addDays(SIM_START, D), { weightKg: wD, palCategory: world.palCategory });
      const ctx = planContextFrom(profile, a, plan.maintenanceKcal);
      const hp = hallParametersFor(ctx, goal);
      const u = hallInputFor(ctx, goal, { calorieTargetKcal: plan.calorieTarget, stepsPerDay: profile.averageSteps7d });
      const fresh = simulateHall(hp, 42, () => u).days.map((x) => x.bodyWeightKg);
      const ratioSolverFresh = olsSlope(fresh.slice(7, 36)) / requestedPerDay;
      const week1Share = (fresh[7]! - fresh[0]!) / (fresh[42]! - fresh[0]!);
      let sm = states[D]!;
      for (let d = 0; d < 42; d++) sm = worldAdvance(world.hall, sm, { intakeKcal: plan.maintenanceKcal, carbKcal: world.baseCarbFraction * plan.maintenanceKcal, paDeltaKcalPerKgDay: 0, sodiumDeltaMg: 0 }, 1);
      rows.push({ index: i, goal, bmi_class: spec.slot.bmiClass, sex: spec.slot.sex, block_start: D, plan_day: plan.day, plan_rate: plan.weeklyRateTarget, ratio_world: ratioWorld, ratio_solver_fresh: ratioSolverFresh, fresh_week1_share: week1Share, world_change_at_plan_maintenance_42d: worldBodyWeight(world.hall, sm) - wD, at_kcal: states[D]!.at, offset_truth: spec.trueOffsetKcal, offset_estimate: [...st.evals].reverse().find((e) => e.day <= D && e.offsetMedian !== null)?.offsetMedian ?? null });
    }
  }
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  writeCsvGz(`${RESULTS}/controls2/ideal-diagnostic-shard${shard}.csv.gz`, cols, rows);
});
