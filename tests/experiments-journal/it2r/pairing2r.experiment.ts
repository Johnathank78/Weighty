/**
 * Relaunch of iteration 2 (prompt 40 s6.2): pairing. The 50 users of the pairing2r job (non-followers of P10, K2 + G), every
 * arm (A, J for each X, C, J-NASEM, J-glucides): each arm obtained by bifurcation is compared, value for value (JSON with
 * round-trip doubles), with the same arm replayed from day 0 (`simulateArmFromScratch`). Compared: mode, dates, T_c, every
 * daily series (true weight and tissue, intakes, logged carbohydrates, plan target, rate, requested rate, goal, floors, app
 * weight, mode, targeting), the plans, evaluations, periodic replans, guardrail events and S3-P checks, the journal
 * diagnostics, the plan and profile in force, the weigh-ins, the daily logs and the journal entries.
 * Sharded: PAIR_SHARD / PAIR_SHARDS (parts), then PAIR_SUMMARY=1 (results/it2r/controls/pairing.txt).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { simulateArmFromScratch, simulateUser } from '../../helpers/closedLoop';
import type { SimState } from '../../helpers/closedLoop';
import { IT2R_DIR, jobFor2r, specFor2r } from './jobs2r';

const DIR = `${IT2R_DIR}/controls`;

const pick = (s: SimState) =>
  JSON.stringify({
    mode: s.mode,
    proposalDay: s.proposalDay,
    accepted: s.accepted,
    switchDay: s.switchDay,
    firstSwitchPlanDay: s.firstSwitchPlanDay,
    chosenTargetActive: s.chosenTargetActive,
    recalDays: s.recalDays,
    declinedRecals: s.declinedRecals,
    planFailures: s.planFailures,
    tc: s.tc,
    trueW: s.trueW,
    trueTissue: s.trueTissue,
    realKcal: s.realKcal,
    loggedKcal: s.loggedKcal,
    loggedCarbsG: s.loggedCarbsG,
    realCarbsG: s.realCarbsG,
    realProteinG: s.realProteinG,
    planTarget: s.planTarget,
    planRate: s.planRate,
    planRequested: s.planRequested,
    planProteinG: s.planProteinG,
    planGoal: s.planGoal,
    planFloor: s.planFloor,
    appW: s.appW,
    modeDay: s.modeDay,
    targetingDay: s.targetingDay,
    deviationDay: s.deviationDay,
    floorReal: s.floorReal,
    plans: s.plans,
    evals: s.evals,
    replans: s.replans,
    guards: s.guards,
    s3p: s.s3p,
    journalDiag: s.journalDiag,
    journalApplied: s.journalApplied,
    plan: s.store.plan,
    profile: s.store.profile,
    weights: s.store.weights.map((w) => [w.date, w.weightKg]),
    dailyLogs: s.store.dailyLogs,
    entries: s.store.foodJournal.entries.map((e) => [e.date, e.consumedTime, e.intake]),
  });

type Part = { users: number; proposals: number; arms: number; mismatches: string[]; guardUsers: number; journalPlanArms: number };

it('relaunch pairing: bifurcated arms against full replays', () => {
  mkdirSync(DIR, { recursive: true });
  const job = jobFor2r('pairing2r');
  if (process.env.PAIR_SUMMARY) {
    const parts = readdirSync(DIR)
      .filter((f) => /^pairing-part\d+\.json$/.test(f))
      .map((f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as Part);
    const sum = (f: 'users' | 'proposals' | 'arms' | 'guardUsers' | 'journalPlanArms') => parts.reduce((s, p) => s + p[f], 0);
    const mismatches = parts.flatMap((p) => p.mismatches);
    const text = [
      `Relaunch of iteration 2 (prompt 40 s6.2): pairing, job pairing2r (${job.count} non-followers of P10, K2 + G, arms A, J100, J85, J70, C, JN, JG), ${parts.length} parts.`,
      `Users: ${sum('users')}, with a proposal (bifurcated): ${sum('proposals')}; users with a guardrail event in some arm: ${sum('guardUsers')}; J arms with a journal plan: ${sum('journalPlanArms')}.`,
      `Arms compared with their full replay from day 0: ${sum('arms')}; differences: ${mismatches.length}${mismatches.length ? ` (${mismatches.join(', ')})` : ''}.`,
      `VERDICT: ${mismatches.length === 0 && sum('users') === job.count ? 'PASS' : 'FAIL'}`,
    ];
    writeFileSync(`${DIR}/pairing.txt`, `${text.join('\n')}\n`);
    expect(sum('users')).toBe(job.count);
    expect(mismatches).toEqual([]);
    return;
  }
  const shard = Number(process.env.PAIR_SHARD ?? '0');
  const shards = Number(process.env.PAIR_SHARDS ?? '1');
  const part: Part = { users: 0, proposals: 0, arms: 0, mismatches: [], guardUsers: 0, journalPlanArms: 0 };
  for (let i = shard; i < job.count; i += shards) {
    const u = job.user(i);
    if (!u) continue;
    const spec = specFor2r(u);
    const res = simulateUser(spec, u.arms);
    part.users++;
    if (res.proposalDay !== null) part.proposals++;
    if (res.arms.some((a) => a.state.guards.length > 0)) part.guardUsers++;
    for (const { arm, state } of res.arms) {
      part.arms++;
      if (arm.kind === 'J' && state.firstSwitchPlanDay !== null) part.journalPlanArms++;
      if (pick(state) !== pick(simulateArmFromScratch(spec, arm))) part.mismatches.push(`${i}:${arm.key}`);
    }
  }
  writeFileSync(`${DIR}/pairing-part${shard}.json`, `${JSON.stringify(part)}\n`);
});
