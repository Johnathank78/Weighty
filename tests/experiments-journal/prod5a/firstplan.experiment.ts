/**
 * Pass 5a (report 43), verification 2: first plan of the production solver against the superseded one (legacy options),
 * on the 1 000 hypercube profiles of report 38 s5.5 (exported from the measurement branch into
 * results/prod5a/hypercube2b.json), every requested rate of the goal's grid. Loss targets are raised to the BMI-20 weight
 * (pass 5a rule; it does not change the calorie target). Expected (report 38): -56, -113 and -212 kcal/day (medians) at
 * 0.25, 0.5 and 1 percent per week in loss.
 * Run: npx vitest run -c vitest.journal.config.ts prod5a/firstplan
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { previewInitialPlan } from '@/domain/engine';
import { LEGACY_SOLVER_OPTIONS, snapWeeklyRate, weeklyRateRange } from '@/science/goals';
import type { GoalPlan } from '@/science/goals';
import { minimumTargetWeightKg } from '@/science/macros';
import type { Goal, UserProfile } from '@/science/types';

const DIR = process.env.FIX_DIR ?? 'tests/experiments-journal/results/prod5a';
const TODAY = '2026-09-13';

function rateGrid(goal: Goal): number[] {
  if (goal === 'maintenance') return [0];
  const { minRate, maxRate, step } = weeklyRateRange(goal);
  const out: number[] = [];
  for (let r = minRate; r <= maxRate + 1e-9; r += step) out.push(snapWeeklyRate(r));
  return out;
}

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return (s[lo] as number) + ((s[hi] as number) - (s[lo] as number)) * (i - lo);
};
const floorSlowed = (g: GoalPlan | null) => (g?.rejections ?? []).some((x) => x.reason === 'below_hard_floor');

it('pass 5a first plan: production against the superseded solver', () => {
  const slots = JSON.parse(readFileSync(`${DIR}/hypercube2b.json`, 'utf8')) as Array<{ goal: Goal; profile: UserProfile }>;
  const cells = new Map<string, { d: number[]; slowedNew: number; slowedOld: number; n: number; failedNew: number; slower: number }>();
  for (const slot of slots) {
    for (const requested of rateGrid(slot.goal)) {
      const base: UserProfile = { ...slot.profile, weeklyRateTarget: requested };
      const min = minimumTargetWeightKg(base.heightCm);
      const profile = base.goal === 'loss' && base.targetWeightKg < min ? { ...base, targetWeightKg: min } : base;
      const now = previewInitialPlan(profile, TODAY, null);
      const old = previewInitialPlan(profile, TODAY, null, LEGACY_SOLVER_OPTIONS);
      const key = `${slot.goal} ${requested}`;
      const c = cells.get(key) ?? { d: [], slowedNew: 0, slowedOld: 0, n: 0, failedNew: 0, slower: 0 };
      c.n++;
      if (floorSlowed(now.goalPlan)) c.slowedNew++;
      if (floorSlowed(old.goalPlan)) c.slowedOld++;
      if (!now.ok) c.failedNew++;
      if (now.ok && old.ok) {
        c.d.push(now.plan.calorieTarget - old.plan.calorieTarget);
        if (now.plan.weeklyRateTarget < old.plan.weeklyRateTarget - 1e-9) c.slower++;
      }
      cells.set(key, c);
    }
  }
  const lines = ['goal requested n | delta median [P10 ; P90] | floor-slowed old -> new | slower than old | no plan (new)'];
  for (const [key, c] of [...cells.entries()].sort()) {
    const pct = (k: number) => `${((100 * k) / c.n).toFixed(2)} %`;
    lines.push(`${key} ${c.n} | ${quantile(c.d, 0.5).toFixed(1)} [${quantile(c.d, 0.1).toFixed(1)} ; ${quantile(c.d, 0.9).toFixed(1)}] | ${pct(c.slowedOld)} -> ${pct(c.slowedNew)} | ${c.slower} | ${c.failedNew}`);
  }
  writeFileSync(`${DIR}/firstplan.txt`, `${lines.join('\n')}\n`);
});
