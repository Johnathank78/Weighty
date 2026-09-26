/**
 * Relaunch of iteration 2 (prompt 40 s6.3, s9): projection of the compute time of the iteration from the cost pilot
 * (results/it2r/pilot/pilot2r-timing-shard*.json: per behaviour, total ms of the common parts, of each arm's continuation,
 * users and proposals). Run: IT2R_ELAPSED_S=<seconds already spent> npx vitest run -c vitest.journal.config.ts it2r/projection
 * Cost of a user with arms S = mean common part + sum over S of the mean continuation of the arm (zero without a proposal).
 * J arms of later steps are costed at the most expensive X of the pilot; JN, JG at their pilot cost; Jfloor1 as J. Wall time
 * = single-process time / (16 x the parallel efficiency of the pilot). Pre-registered reductions (s9), in order, until the
 * projection is under 8 h: acceptance at 70 %, robustness, C6, C2. Writes results/it2r/pilot/projection.txt.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { IT2R_DIR } from './jobs2r';

const CAP_S = 8 * 3600;
const SHARDS = 16;
type Timing = { wallMs: number; userMsTotal: number; cost: Record<string, number> };

it('relaunch cost projection', () => {
  const dir = `${IT2R_DIR}/pilot`;
  const files = readdirSync(dir).filter((f) => /^pilot2r-timing-shard\d+\.json$/.test(f));
  const t = files.map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as Timing);
  const cost: Record<string, number> = {};
  for (const x of t) for (const [k, v] of Object.entries(x.cost)) cost[k] = (cost[k] ?? 0) + v;
  const wall = Math.max(...t.map((x) => x.wallMs));
  const efficiency = t.reduce((s, x) => s + x.userMsTotal, 0) / (wall * SHARDS);
  const users = (b: string) => cost[`${b}:users`] ?? 0;
  const mean = (b: string, k: string) => (cost[`${b}:${k}`] ?? 0) / Math.max(1, users(b));
  // JN is present for P00 users only: mean over those users (a quarter of each behaviour in the pilot).
  const meanJN = (b: string) => (cost[`${b}:JN`] ?? 0) / Math.max(1, users(b) / 4);
  const jWorst = (b: string) => Math.max(...['J100', 'J85', 'J70'].map((k) => mean(b, k)));
  const arm = (b: string, a: string) => (a === 'A' ? mean(b, 'A') : a === 'C' ? mean(b, 'C') : a === 'JN' ? meanJN(b) : a === 'JG' ? mean(b, 'JG') : a === 'J' ? (b === 'follower' ? mean(b, 'J85') : jWorst(b)) : mean(b, a));
  const user = (b: string, arms: string[]) => mean(b, 'common') + arms.reduce((s, a) => s + arm(b, a), 0);
  const nf = 'nonfollower';
  const fo = 'follower';
  const steps: Array<{ key: string; label: string; ms: number; reducible: number | null }> = [
    { key: 'c1train', label: 'C1 entraînement (4 000 non-suiveurs, A + 3 J)', ms: 4000 * (mean(nf, 'common') + mean(nf, 'A') + mean(nf, 'J100') + mean(nf, 'J85') + mean(nf, 'J70')), reducible: null },
    { key: 'c1v1', label: 'C1 V1, P00 (2 000 + 1 000, A, J, C, JN)', ms: 2000 * user(nf, ['A', 'J', 'C', 'JN']) + 1000 * user(fo, ['A', 'J', 'C', 'JN']), reducible: null },
    { key: 'c1v2', label: 'C1 V2, P05, P10, P20 (3 x (2 000 + 1 000), A, J, C)', ms: 3 * (2000 * user(nf, ['A', 'J', 'C']) + 1000 * user(fo, ['A', 'J', 'C'])), reducible: null },
    { key: 'c1sens', label: 'Sensibilités [S] (3 x 1 000, J)', ms: 3000 * user(nf, ['J']), reducible: null },
    { key: 'c1accept', label: 'Acceptation à 70 % (500, A, J, C)', ms: 500 * user(nf, ['A', 'J', 'C']), reducible: 1 },
    { key: 'c1robust', label: 'Robustesse (500, J, C)', ms: 500 * user(nf, ['J', 'C']), reducible: 2 },
    { key: 'carbs', label: 'Glucides (4 x 1 000, J, JG)', ms: 4000 * user(nf, ['J', 'JG']), reducible: null },
    { key: 'c6', label: 'C6 (3 x 1 200, deux bras J)', ms: 3600 * user(nf, ['J', 'J']), reducible: 3 },
    { key: 'c2', label: 'C2 (4 x 3 000, J)', ms: 12000 * user(nf, ['J']), reducible: 4 },
  ];
  const wallOf = (ms: number) => ms / 1000 / (SHARDS * efficiency);
  const elapsed = Number(process.env.IT2R_ELAPSED_S ?? '0');
  const tablesAndChecks = 30 * 60;
  const total = (removed: Set<string>) => elapsed + tablesAndChecks + steps.filter((s) => !removed.has(s.key)).reduce((a, s) => a + wallOf(s.ms), 0);
  const removed = new Set<string>();
  const order = steps.filter((s) => s.reducible !== null).sort((a, b) => (a.reducible as number) - (b.reducible as number));
  for (const s of order) {
    if (total(removed) <= CAP_S) break;
    removed.add(s.key);
  }
  const lines = [
    `Relaunch of iteration 2 (prompt 40 s6.3): cost pilot, ${files.length} shards, ${users(nf)} non-followers and ${users(fo)} followers (proposals ${cost[`${nf}:proposals`] ?? 0} and ${cost[`${fo}:proposals`] ?? 0}), seeds pilot2r (discarded).`,
    `Pilot wall time ${(wall / 1000).toFixed(0)} s; parallel efficiency (sum of user times / (wall x ${SHARDS})) ${efficiency.toFixed(3)}.`,
    `Mean ms per non-follower: common ${mean(nf, 'common').toFixed(0)}, A ${mean(nf, 'A').toFixed(0)}, J100 ${mean(nf, 'J100').toFixed(0)}, J85 ${mean(nf, 'J85').toFixed(0)}, J70 ${mean(nf, 'J70').toFixed(0)}, C ${mean(nf, 'C').toFixed(0)}, JN (P00 users) ${meanJN(nf).toFixed(0)}, JG ${mean(nf, 'JG').toFixed(0)}.`,
    `Mean ms per follower: common ${mean(fo, 'common').toFixed(0)}, A ${mean(fo, 'A').toFixed(0)}, J85 ${mean(fo, 'J85').toFixed(0)}, C ${mean(fo, 'C').toFixed(0)}, JN (P00 users) ${meanJN(fo).toFixed(0)}.`,
    'Projected wall time per step (16 processes):',
    ...steps.map((s) => `- ${s.label}: ${(wallOf(s.ms) / 60).toFixed(1)} min${removed.has(s.key) ? ' (REMOVED, s9)' : ''}`),
    `Elapsed before the pilot projection: ${(elapsed / 60).toFixed(0)} min; tables, checks and report allowance: ${tablesAndChecks / 60} min.`,
    `Projected total, every step: ${(total(new Set()) / 3600).toFixed(2)} h; after the reductions of s9 (${removed.size ? [...removed].join(', ') : 'none'}): ${(total(removed) / 3600).toFixed(2)} h; cap 8 h.`,
    `Possible doubled passes (INCONCLUSIF, not in the projection): training ${(wallOf(steps[0]?.ms ?? 0) * 2 / 60).toFixed(0)} min, V1 ${(wallOf(steps[1]?.ms ?? 0) * 2 / 60).toFixed(0)} min, V2 ${(wallOf(steps[2]?.ms ?? 0) * 2 / 60).toFixed(0)} min.`,
    `STOP (s10.2): ${total(removed) > CAP_S ? 'YES' : 'no'}`,
  ];
  writeFileSync(`${dir}/projection.txt`, `${lines.join('\n')}\n`);
  expect(files.length).toBeGreaterThan(0);
});
