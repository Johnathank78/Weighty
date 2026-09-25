/**
 * Iteration 2b (prompt 38 s5.6): slider invariants (08 s6) of the retained candidate on first plans, and the tissue mass at
 * the horizon against its target. Run: IT2B_CANDIDATE=K1|K2 IT2B_SHARD=<k> IT2B_SHARDS=<n> npx vitest run -c
 * vitest.journal.config.ts it2b/invariants2b
 *
 * Every 5th slot of the first-plan hypercube (seed base firstplan2b = 3.1e9, 200 profiles), own requested rate, solver
 * options of the candidate (first plan: equilibrium start, rate definition and horizon of the candidate). Slider steps from
 * the minimum to the maximum of the slider range by 500. Raw file: results/solver2b/invariants2b<candidate>-shard<k>.csv.gz.
 * The invariants on modeled bodies (current state) are measured by timing2b (invariants2b<candidate>-shard99).
 */
import { it } from 'vitest';
import { previewInitialPlan } from '@/domain/engine';
import type { SolverRequest } from '@/domain/engine';
import { solverHorizonDaysOf } from '@/science/goals';
import { closedLoopSlots, lhsSeed } from '../../helpers/closedLoop';
import { writeCsvGz } from '../../helpers/journalExport';
import type { CsvValue } from '../../helpers/journalExport';
import { RESULTS } from '../it2/jobs';
import { ARMS_2B, SEED_BASES_2B, SOLVER2B_DIR, retainedCandidate, sliderInvariants } from './jobs2b';

const DIR = `${RESULTS}/${SOLVER2B_DIR}`;
const TODAY = '2026-09-13';

it('iteration 2b slider invariants on first plans (retained candidate)', () => {
  const candidate = retainedCandidate();
  const request = ARMS_2B[candidate].solver as SolverRequest;
  const shard = Number(process.env.IT2B_SHARD ?? '0');
  const shards = Number(process.env.IT2B_SHARDS ?? '1');
  const slots = closedLoopSlots(1000, lhsSeed(SEED_BASES_2B.firstplan2b));
  const rows: Array<Record<string, CsvValue>> = [];
  slots.forEach((slot, i) => {
    if (i % 5 !== 0 || (i / 5) % shards !== shard) return;
    const r = previewInitialPlan(slot.profile, TODAY, null, request);
    if (!r.ok || r.goalPlan.calorieTargetKcal === null || !r.goalPlan.solve) return;
    const inv = sliderInvariants(r.context, slot.goal, r.goalPlan.calorieTargetKcal, slot.profile.averageSteps7d);
    rows.push({ source: 'premiers plans (hypercube)', candidate, horizon: solverHorizonDaysOf(r.context), profile_index: i, goal: slot.goal, points: inv.points, monotone: inv.monotone, max_abs_tissue_gap: inv.maxGap, plan_tissue_gap: Math.abs(r.goalPlan.solve.weightAtHorizonKg - r.goalPlan.solve.targetWeightAtHorizonKg), not_converged: inv.notConverged });
  });
  writeCsvGz(`${DIR}/invariants2b${candidate}-shard${shard}.csv.gz`, [...new Set(rows.flatMap((r) => Object.keys(r)))], rows);
});
