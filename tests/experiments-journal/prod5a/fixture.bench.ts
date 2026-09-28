/**
 * Pass 5a (prompt of report 43), equivalence fixture. Copy of the file run on the measurement branch
 * (archive/bench-journal-battery, as tests/experiments-journal/prod5a/fixture.experiment.ts, never committed there):
 *   FIX_JOB=ideal2c|real2c FIX_SHARD=<k> FIX_SHARDS=<n> FIX_USERS=200 FIX_OUT=<dir> npx vitest run -c vitest.journal.config.ts prod5a/fixture
 *
 * The validated simulator of reports 38 and 39 (arm K2 + G of iteration 2c, first FIX_USERS users of the job) runs
 * unchanged. Every call it makes to a plan-producing domain function is intercepted (vi.mock): completeOnboarding,
 * applyRecalibration, periodicReplan (due calls only) and enforcePlanGuardrails (every applied or failed call, and a sample
 * of the calls without effect). For each call the fixture keeps the input store (food journal removed: the engine never
 * reads it) and the output of the prototype.
 *
 * Product rule of pass 5a (minimal target at BMI 20): the simulated loss targets sit at BMI 18.5. The expected output is
 * therefore computed by the prototype a second time, on the same input with the loss target raised to the BMI-20 weight
 * (smallest 0.1 kg multiple at BMI >= 20, same rule as the production migration). The simulation itself continues with
 * the unmodified result, so the simulated users are exactly those of reports 38 and 39.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { it, vi } from 'vitest';
import type * as Engine from '@/domain/engine';
import type { WheightyStore } from '@/domain/types';
import { emptyFoodJournal } from '@/domain/types';
import { bmi, weightAtBmi } from '@/science/macros';
import type { UserProfile } from '@/science/types';

type Captured = { kind: string; date: string; input: unknown; expected: unknown; simulated: unknown };
const events: Captured[] = [];
let guardNoneSeen = 0;

const MIN_TARGET_BMI = 20;
export function minimumTargetWeightKg(heightCm: number): number {
  let t = Math.ceil(weightAtBmi(MIN_TARGET_BMI, heightCm) * 10) / 10;
  while (bmi(t, heightCm) < MIN_TARGET_BMI) t = Math.round((t + 0.1) * 10) / 10;
  return t;
}
function raiseProfile(p: UserProfile): UserProfile {
  if (p.goal !== 'loss') return p;
  const min = minimumTargetWeightKg(p.heightCm);
  return p.targetWeightKg < min ? { ...p, targetWeightKg: min } : p;
}
function strip(store: WheightyStore): WheightyStore {
  return { ...store, foodJournal: emptyFoodJournal() };
}
function raise(store: WheightyStore): WheightyStore {
  const s = strip(store);
  if (!s.profile) return s;
  const profile = raiseProfile(s.profile);
  if (profile === s.profile) return s;
  const plan = s.plan && s.plan.goal === 'loss' && s.plan.targetWeightKg !== undefined && s.plan.targetWeightKg < profile.targetWeightKg ? { ...s.plan, targetWeightKg: profile.targetWeightKg } : s.plan;
  return { ...s, profile, plan };
}
const outcome = (r: { ok: boolean; store?: WheightyStore; reason?: string }) => (r.ok ? { ok: true, plan: r.store?.plan ?? null, profile: r.store?.profile ?? null } : { ok: false, reason: r.reason });

vi.mock('@/domain/engine', async (importOriginal) => {
  const m = await importOriginal<typeof Engine>();
  return {
    ...m,
    completeOnboarding: (...args: Parameters<typeof m.completeOnboarding>) => {
      const r = m.completeOnboarding(...args);
      const [store, profile, today, nowIso, evidence, solver] = args;
      const raised = raiseProfile(profile);
      const expected = raised === profile ? r : m.completeOnboarding(strip(store), raised, today, nowIso, evidence, solver);
      events.push({ kind: 'onboarding', date: today, input: { profile, today, nowIso }, expected: outcome(expected), simulated: outcome(r) });
      return r;
    },
    applyRecalibration: (...args: Parameters<typeof m.applyRecalibration>) => {
      const r = m.applyRecalibration(...args);
      const [store, state, today, nowIso, solver] = args;
      const expected = m.applyRecalibration(raise(store), state, today, nowIso, solver);
      events.push({ kind: 'recal', date: today, input: { store: strip(store), today, nowIso, candidateMedian: state.candidate?.posteriorMedianOffsetKcal ?? null }, expected: outcome(expected), simulated: outcome(r) });
      return r;
    },
    periodicReplan: (...args: Parameters<typeof m.periodicReplan>) => {
      const r = m.periodicReplan(...args);
      if (r.status === 'not_due') return r;
      const [store, today, options] = args;
      const e = m.periodicReplan(raise(store), today, options);
      events.push({
        kind: 'periodic',
        date: today,
        input: { store: strip(store), today },
        expected: { status: e.status, ...(e.status === 'failed' ? { reason: e.reason } : {}), plan: e.status === 'replanned' ? e.store.plan : null },
        simulated: { status: r.status },
      });
      return r;
    },
    enforcePlanGuardrails: (...args: Parameters<typeof m.enforcePlanGuardrails>) => {
      const r = m.enforcePlanGuardrails(...args);
      const [store, today, options] = args;
      // Calls without effect: one in four is kept.
      if (r.status === 'none' && guardNoneSeen++ % 4 !== 0) return r;
      const e = m.enforcePlanGuardrails(raise(store), today, options);
      events.push({
        kind: 'guard',
        date: today,
        input: { store: strip(store), today },
        expected: {
          status: e.status,
          ...(e.status !== 'none' ? { rule: e.rule } : {}),
          ...(e.status === 'failed' ? { reason: e.reason } : {}),
          plan: e.status === 'applied' ? e.store.plan : null,
          profile: e.status === 'applied' ? e.store.profile : null,
        },
        simulated: { status: r.status },
      });
      return r;
    },
  };
});

it('pass 5a equivalence fixture', async () => {
  // Modules of the measurement branch only (not on main): resolved at run time there.
  const jobsPath = '../it2c/jobs2c';
  const loopPath = '../../helpers/closedLoop';
  const { jobFor2c, specFor2c } = (await import(/* @vite-ignore */ jobsPath)) as { jobFor2c: (n: string) => { name: string; count: number }; specFor2c: (j: unknown, i: number, arm: string) => { slot: { goal: string } } | null };
  const { simulateUser } = (await import(/* @vite-ignore */ loopPath)) as { simulateUser: (spec: unknown, arms: unknown[]) => unknown };
  const job = jobFor2c(process.env.FIX_JOB ?? '');
  const shard = Number(process.env.FIX_SHARD ?? '0');
  const shards = Number(process.env.FIX_SHARDS ?? '1');
  const users = Number(process.env.FIX_USERS ?? '200');
  const outDir = process.env.FIX_OUT ?? '';
  if (!outDir) throw new Error('FIX_OUT');
  mkdirSync(outDir, { recursive: true });
  const lines: string[] = [];
  const t0 = performance.now();
  for (let i = shard; i < Math.min(users, job.count); i += shards) {
    events.length = 0;
    guardNoneSeen = 0;
    const spec = specFor2c(job, i, 'K2G');
    if (!spec) continue;
    simulateUser(spec, [{ key: 'A', kind: 'A' }]);
    lines.push(JSON.stringify({ job: job.name, index: i, goal: spec.slot.goal, events }));
  }
  writeFileSync(`${outDir}/${job.name}-shard${shard}.jsonl.gz`, gzipSync(lines.join('\n') + '\n'));
  writeFileSync(`${outDir}/${job.name}-shard${shard}.time.txt`, `${Math.round(performance.now() - t0)} ms, ${lines.length} users\n`);
});
