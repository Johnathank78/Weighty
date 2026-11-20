/**
 * Report 50, point 5 (E5), on the real case of report 49 (local experiment, never in `npm run check`, skipped when the file
 * is missing), figures only: on 24/10, the user asks for 0.5 % a week after 22 days without a weigh-in. What the invitation
 * says, and the target the change gives without the weigh-in ("Continuer") and with it ("Me peser d'abord", the weigh-in of
 * 67.6 kg that came on 25/10, entered on 24/10).
 * Writes tests/experiments-journal/results/ux3/real-case-e5.json (ignored).
 * Run: node node_modules/vitest/vitest.mjs run -c vitest.journal.config.ts ux3/realCaseE5
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { addWeight, trendOf } from '@/domain/engine';
import { changeGoalOnPath } from '@/domain/journalPath';
import { runWeighInChecks } from '@/domain/planSafety';
import { weighFirstInvitation } from '@/domain/weighFirst';
import type { WheightyStore } from '@/domain/types';
import { parseImport } from '@/persistence/exportImport';

const FILE = process.env.WHEIGHTY_REAL_EXPORT ?? 'prompt/donnees/sara-2026-10-24.json';
const OUT = 'tests/experiments-journal/results/ux3';

it.runIf(existsSync(FILE))('real case, E5', () => {
  const imported = parseImport(readFileSync(FILE, 'utf8'));
  if (!imported.ok) throw new Error(imported.error);
  const s = imported.store;
  const day = s.dailyLogs.reduce((a, l) => (l.date > a ? l.date : a), '');
  const goal = { goal: 'loss' as const, targetWeightKg: s.profile?.targetWeightKg ?? 60, weeklyRate: 0.005 };
  const summary = (store: WheightyStore) => {
    const r = changeGoalOnPath(store, day, goal);
    const p = r.ok ? r.store.plan : null;
    return p
      ? { calorieTarget: p.calorieTarget, weeklyRateTarget: p.weeklyRateTarget, maintenanceKcal: p.maintenanceKcal, planWeightKg: p.planWeightKg ?? null, firstProjectionKg: p.projection.trajectory[0]?.weightKg ?? null, approximateWeeks: p.projection.approximateWeeks ?? null, trendKg: trendOf(store).summary.latest?.trendKg ?? null }
      : { failed: r.ok ? null : r.reason };
  };
  const at = `${day}T21:41:00.000Z`;
  const weighed = runWeighInChecks(addWeight(s, { date: day, weightKg: 67.6 }, at), day, at);
  const result = {
    day,
    planBefore: { calorieTarget: s.plan?.calorieTarget ?? null, weeklyRateTarget: s.plan?.weeklyRateTarget ?? null },
    invitation: weighFirstInvitation(s, day),
    withoutWeighIn: summary(s),
    withWeighIn: { invitationAfter: weighFirstInvitation(weighed, day), planAfterWeighIn: weighed.plan?.calorieTarget ?? null, ...summary(weighed) },
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/real-case-e5.json`, `${JSON.stringify(result, null, 2)}\n`);
});
