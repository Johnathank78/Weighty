/**
 * Report 50, points 1b and 1c, on the verification profiles (synthetic, no real data), built for TODAY:
 * - 1b: the days between the last trend point (where A3 put "Auj." and day 0 of the projection) and today;
 * - 1c: the arrival drawn by the chart ("Tout", one sample a day) against the arrival the plan in force announces (its
 *   creation day + its weeks x 7, "~N sem."), and against where the weekly samples of A3 crossed the target weight.
 * Writes tests/experiments-journal/results/ux3/profiles-chart.json (ignored).
 * Run: node node_modules/vitest/vitest.mjs run -c vitest.journal.config.ts ux3/profilesChart
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { computeCalibrationState, planDateOf } from '@/domain/engine';
import { runDailyChecks } from '@/domain/planSafety';
import { projectionFromToday, trackingChart } from '@/domain/views';
import { addDays, daysBetween } from '@/science/dates';
import * as profiles from '../../helpers/verificationProfiles';

const TODAY = process.env.MANUAL_TODAY ?? '2026-11-20';

it('profiles: 1b gap and 1c arrival', () => {
  const rows: Array<Record<string, unknown>> = [];
  for (const [name, build] of Object.entries(profiles)) {
    if (!name.endsWith('Profile') || name === 'verificationProfile' || typeof build !== 'function') continue;
    const s = runDailyChecks((build as (t: string) => Parameters<typeof runDailyChecks>[0])(TODAY), TODAY, `${TODAY}T08:00:00.000Z`);
    const state = computeCalibrationState(s, TODAY, `${TODAY}T08:00:00.000Z`);
    const chart = trackingChart(s, TODAY, null, state);
    const lastTrend = chart?.trend[chart.trend.length - 1];
    const weekly = projectionFromToday(s, TODAY, state);
    const plan = s.plan;
    const target = plan?.targetWeightKg ?? s.profile?.targetWeightKg ?? null;
    // Where the polyline of weekly samples (A3) crosses the target weight, linear between two samples.
    let weeklyCross: number | null = null;
    if (weekly && target !== null && plan && plan.goal !== 'maintenance') {
      const t = weekly.trajectory;
      for (let i = 1; i < t.length; i++) {
        const a = t[i - 1] as { day: number; weightKg: number };
        const b = t[i] as { day: number; weightKg: number };
        const crossed = plan.goal === 'loss' ? b.weightKg <= target : b.weightKg >= target;
        if (crossed) {
          weeklyCross = b.weightKg === a.weightKg ? b.day : a.day + ((target - a.weightKg) / (b.weightKg - a.weightKg)) * (b.day - a.day);
          break;
        }
      }
    }
    const announced = plan?.projection.approximateWeeks !== undefined ? addDays(planDateOf(plan), plan.projection.approximateWeeks * 7) : null;
    rows.push({
      name,
      goal: plan?.goal ?? null,
      gapDays1b: chart && lastTrend ? chart.todayDay - lastTrend.day : null,
      projection: chart ? (chart.projection.length > 0 ? 'drawn' : chart.weighInNeeded ? 'weighInNeeded' : chart.projectionPending ? 'learning' : 'none') : null,
      arrivalDrawn: chart?.arrival?.date ?? null,
      daysToTargetFromToday: weekly?.daysToTarget ?? null,
      weeklyCrossDay: weeklyCross,
      drawnMinusWeeklyCrossDays: weekly?.daysToTarget != null && weeklyCross !== null ? weekly.daysToTarget - weeklyCross : null,
      planAnnounced: announced,
      drawnMinusAnnouncedDays: chart?.arrival && announced ? daysBetween(announced, chart.arrival.date) : null,
      windowAll: chart ? [chart.startDate, chart.endDate] : null,
    });
  }
  mkdirSync('tests/experiments-journal/results/ux3', { recursive: true });
  writeFileSync('tests/experiments-journal/results/ux3/profiles-chart.json', `${JSON.stringify(rows, null, 1)}\n`);
});
