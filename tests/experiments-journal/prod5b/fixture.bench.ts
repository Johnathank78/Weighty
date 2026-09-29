/**
 * Pass 5b (prompt of report 45), equivalence fixture. Copy of the file run on the measurement branch
 * (archive/bench-journal-battery, as tests/experiments-journal/prod5b/fixture.experiment.ts, never committed there), with
 * the instrumentation of tests/helpers/closedLoop.ts described in the report (hooks `FIX5B`, never committed either):
 *   FIX_JOB=v1|v3 FIX_SHARD=<k> FIX_SHARDS=<n> FIX_OUT=<dir> npx vitest run -c vitest.journal.config.ts prod5b/fixture
 *
 * The validated simulator of report 41 (iteration 2d, arms C and JS, K2 + G) runs unchanged on the first 200 users of step
 * V1 (P00, behaviours R0, R15, R30; job v1, indices 0 to 199) or of step V3 in the P10 population (job v3, indices 7 500 to
 * 7 699), over 24 weeks. Each hooked call keeps its input store and the prototype's output on the same input with the loss
 * target raised to the BMI-20 weight (rule of pass 5a). Stores are written without their weigh-ins, past logs and journal
 * entries, which are prefixes of the arm's final store: each reduction is checked against the full store before writing.
 * On main, the hook object and its types are declared here and imported dynamically (the simulator is not on main); the
 * file that ran imported them statically from '../../helpers/closedLoop'. Nothing else differs.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { it } from 'vitest';
import type { WheightyStore } from '@/domain/types';

/** Hook object of the instrumented simulator (tests/helpers/closedLoop.ts of the measurement branch). */
type Fix5bEvent = { kind: string; arm: 'common' | 'C' | 'JS'; day: number; date: string; store: WheightyStore; ctx: Record<string, unknown>; expected: Record<string, unknown> };
type Fix5bHooks = { on: ((e: Fix5bEvent) => void) | null; busy: boolean; noneSeen: number };

/** JSON with sorted keys: equality of content, whatever the key order of the rebuilt object. */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));

type Arrays = { weights: WheightyStore['weights']; dailyLogs: WheightyStore['dailyLogs']; entries: WheightyStore['foodJournal']['entries'] };

/** Reduced store: the arrays that are prefixes of the final store are replaced by their lengths (logs: the date split). */
function reduce(store: WheightyStore, date: string): Record<string, unknown> {
  const { weights, dailyLogs, foodJournal, ...rest } = store;
  return { ...rest, foodJournal: { ...foodJournal, entries: [] }, dailyLogs: dailyLogs.filter((l) => l.date >= date), counts: { weights: weights.length, entries: foodJournal.entries.length } };
}

/** Inverse of `reduce` with the final arrays of the arm (same code as the replay on main). */
export function restore(reduced: Record<string, unknown>, date: string, final: Arrays): WheightyStore {
  const { counts, dailyLogs, foodJournal, ...rest } = reduced as { counts: { weights: number; entries: number }; dailyLogs: WheightyStore['dailyLogs']; foodJournal: WheightyStore['foodJournal'] } & Record<string, unknown>;
  const logs = [...final.dailyLogs.filter((l) => l.date < date), ...dailyLogs];
  return { ...(rest as unknown as WheightyStore), weights: final.weights.slice(0, counts.weights), dailyLogs: logs, foodJournal: { ...foodJournal, entries: final.entries.slice(0, counts.entries) } };
}

it('pass 5b equivalence fixture', async () => {
  const jobsPath = '../it2d/jobs2d';
  const loopPath = '../../helpers/closedLoop';
  const { jobFor2d, specFor2d, ARMS_2D } = (await import(/* @vite-ignore */ jobsPath)) as {
    jobFor2d: (n: string) => { name: string; count: number; user: (i: number) => unknown };
    specFor2d: (u: unknown) => { slot: { goal: string; postSwitch?: string }; population: { key: string } };
    ARMS_2D: unknown[];
  };
  const { simulateUser, FIX5B } = (await import(/* @vite-ignore */ loopPath)) as { FIX5B: Fix5bHooks; simulateUser: (spec: unknown, arms: unknown[]) => { proposalDay: number | null; arms: Array<{ arm: { key: string }; state: { store: WheightyStore } }> } };
  const jobName = process.env.FIX_JOB ?? '';
  const job = jobFor2d(jobName);
  const first = jobName === 'v3' ? 7500 : 0;
  const users = Number(process.env.FIX_USERS ?? '200');
  const shard = Number(process.env.FIX_SHARD ?? '0');
  const shards = Number(process.env.FIX_SHARDS ?? '1');
  const outDir = process.env.FIX_OUT ?? '';
  if (!outDir) throw new Error('FIX_OUT');
  mkdirSync(outDir, { recursive: true });
  const lines: string[] = [];
  let events: Fix5bEvent[] = [];
  FIX5B.on = (e) => events.push(e);
  const t0 = performance.now();
  let mismatches = 0;
  for (let k = shard; k < users; k += shards) {
    const i = first + k;
    events = [];
    FIX5B.noneSeen = 0;
    const u = job.user(i);
    if (!u) continue;
    const spec = specFor2d(u);
    const res = simulateUser(spec, ARMS_2D);
    const finals: Record<string, Arrays> = {};
    for (const a of res.arms) finals[a.arm.key] = { weights: a.state.store.weights, dailyLogs: a.state.store.dailyLogs, entries: a.state.store.foodJournal.entries };
    const out = events.map((e) => {
      const final = finals[e.arm === 'common' ? 'C' : e.arm] as Arrays;
      const reduced = reduce(e.store, e.date);
      const ok = canon(restore(JSON.parse(JSON.stringify(reduced)) as Record<string, unknown>, e.date, final)) === canon(e.store);
      if (!ok) mismatches++;
      return { kind: e.kind, arm: e.arm, day: e.day, date: e.date, ctx: e.ctx, expected: e.expected, store: ok ? reduced : e.store, reduced: ok };
    });
    lines.push(JSON.stringify({ job: job.name, index: i, goal: spec.slot.goal, behavior: spec.slot.postSwitch ?? null, population: spec.population.key, proposalDay: res.proposalDay, finals, events: out }));
  }
  FIX5B.on = null;
  writeFileSync(`${outDir}/${job.name}-shard${shard}.jsonl.gz`, gzipSync(lines.join('\n') + '\n'));
  writeFileSync(`${outDir}/${job.name}-shard${shard}.time.txt`, `${Math.round(performance.now() - t0)} ms, ${lines.length} users, ${mismatches} reductions kept in full\n`);
});
