/**
 * Iteration 2d (prompt 41 s6.4, s9): projection of the compute time from the cost pilot (results/it2d/pilot/pilot2d-timing-
 * shard*.json: per step type V1, V2, V3, V4, total ms of the common parts and of arms C and JS, users and proposals).
 * Run: IT2D_ELAPSED_S=<seconds since the amendment commit> npx vitest run -c vitest.journal.config.ts it2d/projection
 * Cost of a user of a type = mean common part + mean continuation of C and JS (zero without a proposal). Wall time = single-
 * process time / (16 x the parallel efficiency of the pilot). Steps: V1 (7 500 x P00), V2 (10 000) + H4 (500, V2 type),
 * V3 (3 x 7 500), V4 (3 x 1 500), sizes of jobs2d.ts (SIZES_2D, scaled when s7 requires it). Pre-registered reductions (s9),
 * in order, until the projection without doubled pass is under 8 h: H4, then V4. Also (s7): the switched users expected in each
 * loss or gain cell (goal x behaviour) = users of the cell in the design of the step (cases R and S included) x the share of
 * switched users of the pilot, pooled over the 256 users (the proposal precedes any reading of the journal and any behaviour
 * after the switch), against 700; below, the scaling factor of N.
 * Writes results/it2d/pilot/projection.txt.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { IT2D_DIR, SIZES_2D, jobFor2d } from './jobs2d';

const CAP_S = 8 * 3600;
const SHARDS = 16;
type Timing = { wallMs: number; userMsTotal: number; cost: Record<string, number> };

it('iteration 2d cost projection', () => {
  const dir = `${IT2D_DIR}/pilot`;
  const files = readdirSync(dir).filter((f) => /^pilot2d-timing-shard\d+\.json$/.test(f));
  const t = files.map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as Timing);
  const cost: Record<string, number> = {};
  for (const x of t) for (const [k, v] of Object.entries(x.cost)) cost[k] = (cost[k] ?? 0) + v;
  const wall = Math.max(...t.map((x) => x.wallMs));
  const efficiency = t.reduce((s, x) => s + x.userMsTotal, 0) / (wall * SHARDS);
  const users = (type: string) => cost[`${type}:users`] ?? 0;
  const mean = (type: string, k: string) => (cost[`${type}:${k}`] ?? 0) / Math.max(1, users(type));
  const perUser = (type: string) => mean(type, 'common') + mean(type, 'C') + mean(type, 'JS');
  const share = (type: string) => (cost[`${type}:proposals`] ?? 0) / Math.max(1, users(type));
  const wallOf = (ms: number) => ms / 1000 / (SHARDS * efficiency);
  const S = SIZES_2D;
  const steps: Array<{ key: string; label: string; ms: number; reducible: number | null }> = [
    { key: 'v1', label: `V1, P00, R0 à R30 (${S.v1})`, ms: S.v1 * perUser('V1'), reducible: null },
    { key: 'v2', label: `V2, P00, H1 à H3 (${S.v2})`, ms: S.v2 * perUser('V2'), reducible: null },
    { key: 'h4', label: `H4 (${S.h4})`, ms: S.h4 * perUser('V2'), reducible: 1 },
    { key: 'v3', label: `V3, P05, P10, P20 (3 x ${S.v3})`, ms: 3 * S.v3 * perUser('V3'), reducible: null },
    { key: 'v4', label: `V4, sensibilités (3 x ${S.v4})`, ms: 3 * S.v4 * perUser('V4'), reducible: 2 },
  ];
  const elapsed = Number(process.env.IT2D_ELAPSED_S ?? '0');
  const tablesAndReport = 30 * 60;
  const total = (removed: Set<string>, extra = 0) => elapsed + tablesAndReport + extra + steps.filter((s) => !removed.has(s.key)).reduce((a, s) => a + wallOf(s.ms), 0);
  const removed = new Set<string>();
  for (const s of steps.filter((x) => x.reducible !== null).sort((a, b) => (a.reducible as number) - (b.reducible as number))) {
    if (total(removed) <= CAP_S) break;
    removed.add(s.key);
  }
  const doubled = wallOf(2 * ((steps[0] as { ms: number }).ms + (steps[1] as { ms: number }).ms));
  // s7: switched users expected per loss or gain cell (goal x behaviour) of a step, first population of the step.
  const pooled = ['V1', 'V2', 'V3', 'V4'].reduce((a, k) => a + (cost[`${k}:proposals`] ?? 0), 0) / Math.max(1, ['V1', 'V2', 'V3', 'V4'].reduce((a, k) => a + users(k), 0));
  const cellMin = (name: string) => {
    const job = jobFor2d(name);
    const counts = new Map<string, number>();
    for (let i = 0; i < job.count; i++) {
      const u = job.user(i);
      if (!u || u.tags.population !== job.user(0)?.tags.population || u.slot.goal === 'maintenance') continue;
      const k = `${u.slot.goal}|${u.slot.postSwitch ?? ''}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const [k, v] = [...counts.entries()].sort((a, b) => a[1] - b[1])[0] as [string, number];
    return { cell: k, users: v, expected: v * pooled, factor: Math.max(1, 700 / (v * pooled)) };
  };
  const lines = [
    `Iteration 2d (prompt 41 s6.4): cost pilot, ${files.length} shards, ${Object.keys(cost).filter((k) => k.endsWith(':users')).map((k) => `${k.split(':')[0]} ${cost[k]} users (${cost[`${k.split(':')[0]}:proposals`] ?? 0} switched)`).join(', ')}; seeds pilot2d (discarded).`,
    `Pilot wall time ${(wall / 1000).toFixed(0)} s; parallel efficiency (sum of user times / (wall x ${SHARDS})) ${efficiency.toFixed(3)}.`,
    ...['V1', 'V2', 'V3', 'V4'].map((k) => `Mean ms per user, ${k}: common ${mean(k, 'common').toFixed(0)}, C ${mean(k, 'C').toFixed(0)}, JS ${mean(k, 'JS').toFixed(0)}; total ${perUser(k).toFixed(0)}; switched share ${share(k).toFixed(3)}.`),
    'Projected wall time per step (16 processes), without doubled pass:',
    ...steps.map((s) => `- ${s.label}: ${(wallOf(s.ms) / 60).toFixed(1)} min${removed.has(s.key) ? ' (REMOVED, s9)' : ''}`),
    `Elapsed since the amendment commit: ${(elapsed / 60).toFixed(0)} min; tables and report allowance: ${tablesAndReport / 60} min.`,
    `Projected total, every step: ${(total(new Set()) / 3600).toFixed(2)} h; after the reductions of s9 (${removed.size ? [...removed].join(', ') : 'none'}): ${(total(removed) / 3600).toFixed(2)} h; cap 8 h.`,
    `With a doubled pass of V1 and of V2: ${(total(removed, doubled) / 3600).toFixed(2)} h (doubled V1 ${(wallOf(2 * (steps[0] as { ms: number }).ms) / 60).toFixed(0)} min, doubled V2 ${(wallOf(2 * (steps[1] as { ms: number }).ms) / 60).toFixed(0)} min).`,
    `Pooled share of switched users in the pilot: ${pooled.toFixed(3)}. Smallest loss or gain cell (goal x behaviour), users of the design and expected switched users (s7, threshold 700): ${['v1', 'v2', 'v3'].map((k) => {
      const c = cellMin(k);
      return `${k} ${c.cell} ${c.users} -> ${c.expected.toFixed(0)}${c.factor > 1 ? ` (UNDER 700: N x ${c.factor.toFixed(3)})` : ''}`;
    }).join('; ')}.`,
    `V4 REMOVED (J* cannot be retained in this iteration, s9): ${removed.has('v4') ? 'YES' : 'no'}`,
    `STOP before V1 (s10.2): ${total(removed) > CAP_S ? 'YES' : 'no'}`,
  ];
  writeFileSync(`${dir}/projection.txt`, `${lines.join('\n')}\n`);
  expect(files.length).toBeGreaterThan(0);
});
