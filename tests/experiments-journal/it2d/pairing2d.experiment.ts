/**
 * Iteration 2d (prompt 41 s6.2): pairing. The 50 users of the pairing2d job (non-followers of P00, density 1.00, every
 * behaviour, K2 + G), arms C and J*: each arm obtained by bifurcation is compared, value for value (JSON with round-trip
 * doubles), with the same arm replayed from day 0 (`simulateArmFromScratch`): mode, dates, T_c, every daily series (h and I*
 * included), plans, evaluations, J* evaluations and constructions, periodic replans, guardrail events, S3-P checks, the plan
 * and profile in force, the weigh-ins, the daily logs and the journal entries.
 * Sharded: PAIR_SHARD / PAIR_SHARDS (parts), then PAIR_SUMMARY=1 (results/it2d/controls/pairing.txt).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { simulateArmFromScratch, simulateUser } from '../../helpers/closedLoop';
import type { SimState } from '../../helpers/closedLoop';
import { ARMS_2D, IT2D_DIR, jobFor2d, specFor2d } from './jobs2d';

const DIR = `${IT2D_DIR}/controls`;
const pick = (s: SimState) => {
  const { store, ...rest } = s;
  return JSON.stringify({
    ...rest,
    plan: store.plan,
    profile: store.profile,
    weights: store.weights.map((w) => [w.date, w.weightKg]),
    dailyLogs: store.dailyLogs,
    entries: store.foodJournal.entries.map((e) => [e.date, e.consumedTime, e.intake]),
  });
};

type Part = { users: number; proposals: number; arms: number; mismatches: string[]; jstarArms: number; guardUsers: number };

it('iteration 2d pairing: bifurcated arms against full replays', () => {
  mkdirSync(DIR, { recursive: true });
  const job = jobFor2d('pairing2d');
  if (process.env.PAIR_SUMMARY) {
    const parts = readdirSync(DIR)
      .filter((f) => /^pairing-part\d+\.json$/.test(f))
      .map((f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as Part);
    const sum = (f: 'users' | 'proposals' | 'arms' | 'jstarArms' | 'guardUsers') => parts.reduce((s, p) => s + p[f], 0);
    const mismatches = parts.flatMap((p) => p.mismatches);
    const text = [
      `Iteration 2d (prompt 41 s6.2): pairing, job pairing2d (${job.count} non-followers of P00, density 1.00, every behaviour, K2 + G, arms C and JS), ${parts.length} parts.`,
      `Users: ${sum('users')}, with a proposal (bifurcated): ${sum('proposals')}; J* arms with a J* plan: ${sum('jstarArms')}; users with a guardrail event in some arm: ${sum('guardUsers')}.`,
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
  const part: Part = { users: 0, proposals: 0, arms: 0, mismatches: [], jstarArms: 0, guardUsers: 0 };
  for (let i = shard; i < job.count; i += shards) {
    const u = job.user(i);
    if (!u) continue;
    const spec = specFor2d(u);
    const res = simulateUser(spec, ARMS_2D);
    part.users++;
    if (res.proposalDay !== null) part.proposals++;
    if (res.arms.some((a) => a.state.guards.length > 0)) part.guardUsers++;
    for (const { arm, state } of res.arms) {
      part.arms++;
      if (arm.kind === 'JS' && state.firstSwitchPlanDay !== null) part.jstarArms++;
      if (pick(state) !== pick(simulateArmFromScratch(spec, arm))) part.mismatches.push(`${i}:${arm.key}`);
    }
  }
  writeFileSync(`${DIR}/pairing-part${shard}.json`, `${JSON.stringify(part)}\n`);
});
