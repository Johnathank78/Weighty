/**
 * Report 49 on the real case (local experiment, never in `npm run check`, skipped when the file is missing), figures only:
 * - V5 of amendment 8: the export of 24/10 with a weigh-in of 67.6 kg dated 25/10: |modeled weight of 25/10 - 67.6| for
 *   today's code ('sans') and the variants A and B (the retained one is judged, <= 0.3 kg);
 * - point 6: the gate after the weigh-in back (1 weigh-in counted);
 * - points 3, 4 and 5 on 24/10 as the code of this branch would have run it: deductions, periodic replan, recalibration,
 *   message, projection;
 * - point 4, reported without a fix: a change made by the user after more than 7 days without a weigh-in (the plan starts
 *   from the modeled body of the day, through the pause).
 * Writes tests/experiments-journal/results/6a/real-case-<n>.json (ignored).
 * Run: npx vitest run -c vitest.journal.config.ts sixa/realCase
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { addWeight, buildPlanFromStore, calibrationInputFromStore, computeCalibrationState, gateOf, periodicReplan, trendOf, weighInStale } from '@/domain/engine';
import { changeGoalOnPath } from '@/domain/journalPath';
import { deduceAdherenceFromJournal } from '@/domain/journalPath';
import { periodicReplanUnderRules, runDailyChecks, staleWeighInNotice } from '@/domain/planSafety';
import { RULES_6A } from '@/domain/ruleSwitches';
import type { WheightyStore } from '@/domain/types';
import { trackingChart } from '@/domain/views';
import { parseImport } from '@/persistence/exportImport';
import { fitCalibration } from '@/science/calibration';
import { modeledBodyAt } from '@/science/modeledBody';

const FILES = [process.env.WHEIGHTY_REAL_EXPORT ?? 'prompt/donnees/sara-2026-10-24.json', process.env.WHEIGHTY_REAL_EXPORT_2].filter((f): f is string => typeof f === 'string');
const OUT = 'tests/experiments-journal/results/6a';

function modeledOn(store: WheightyStore, day: string, mode: 'off' | 'A' | 'B') {
  RULES_6A.reanchor = mode;
  try {
    const input = calibrationInputFromStore(store, day);
    if (!input) return null;
    const fit = fitCalibration(input);
    if (!fit) return null;
    const body = modeledBodyAt(input, fit.posterior.medianKcal, day);
    return body ? { offsetKcal: fit.posterior.medianKcal, interval80: fit.posterior.interval80, modeledKg: body.modeledWeightKg, observationWeightBack: fit.observationWeights.at(-1) ?? null, reanchor: fit.reanchor ?? null } : null;
  } finally {
    RULES_6A.reanchor = null;
  }
}

for (const [n, file] of FILES.entries()) {
  it.runIf(existsSync(file))(`real case ${n + 1}`, () => {
    const imported = parseImport(readFileSync(file, 'utf8'));
    if (!imported.ok) throw new Error(imported.error);
    const s = imported.store;
    const exportDay = s.dailyLogs.reduce((a, l) => (l.date > a ? l.date : a), '');
    const back = '2026-10-25';
    const withBack = addWeight(s, { date: back, weightKg: 67.6 }, `${back}T07:00:00.000Z`);

    // V5 and the gate after the weigh-in back.
    const v5 = Object.fromEntries((['off', 'A', 'B'] as const).map((m) => {
      const r = modeledOn(withBack, back, m);
      return [m === 'off' ? 'sans' : m, r ? { ...r, gapKg: r.modeledKg - 67.6, absGapKg: Math.abs(r.modeledKg - 67.6) } : null];
    }));
    const gateBack = gateOf(withBack);
    const before = modeledOn(s, exportDay, 'off');

    // 24/10 as this branch runs it: on the store of the export, the days that the old code deduced are kept (never rewritten).
    const stateDay = computeCalibrationState(s, exportDay, `${exportDay}T21:41:00.000Z`);
    const replan = periodicReplanUnderRules(s, exportDay, `${exportDay}T21:41:00.000Z`, stateDay);
    const chart = trackingChart(s, exportDay, null, stateDay);
    // The deductions D6 would leave out on a store where none was recorded yet.
    const undeduced: WheightyStore = { ...s, dailyLogs: s.dailyLogs.map((l) => (l.adherenceSource === 'journal' ? (({ adherence: _a, adherenceSource: _s, ...rest }) => rest)(l) : l)) };
    const rededuced = deduceAdherenceFromJournal(undeduced, exportDay);
    const deduced = rededuced.dailyLogs.filter((l) => l.adherenceSource === 'journal').map((l) => ({ date: l.date, value: l.adherence }));
    const gateWindow = gateOf({ weights: rededuced.weights.filter((w) => w.date <= '2026-10-02'), dailyLogs: rededuced.dailyLogs });

    // Replay of 24/10 at 23:41 with the code of this branch, from the store as it was before that opening: the plan of
    // 15/09 rebuilt (warm start, weigh-ins of that day), no applied recalibration, the adherences the old code deduced on
    // 24/10 removed (the user's of 23/09 kept), the trace and the surfacing reference of 24/10 removed.
    const warm = s.calibrationSnapshots.filter((x) => x.source === 'warm_start');
    const at15: WheightyStore = { ...undeduced, weights: s.weights.filter((w) => w.date <= '2026-09-15'), calibrationSnapshots: warm };
    const plan15 = buildPlanFromStore(at15, '2026-09-15', { source: 'initial', snapshot: warm[0] ?? null });
    let replay24: Record<string, unknown> = { rebuilt: plan15.ok };
    if (plan15.ok) {
      const pre: WheightyStore = { ...undeduced, calibrationSnapshots: warm, plan: plan15.plan, meta: { ...undeduced.meta, planEvents: [], lastSurfacedCalibration: null, periodicReplanCheckedOn: null } };
      const after = runDailyChecks(pre, exportDay, `${exportDay}T21:41:00.000Z`);
      const st = computeCalibrationState(after, exportDay, `${exportDay}T21:41:57.000Z`);
      const ch = trackingChart(after, exportDay, null, st);
      replay24 = {
        rebuilt: true,
        plan15: { calorieTarget: plan15.plan.calorieTarget, maintenanceKcal: plan15.plan.maintenanceKcal },
        deduced: after.dailyLogs.filter((l) => l.adherenceSource === 'journal').map((l) => ({ date: l.date, value: l.adherence })),
        planAfter: { calorieTarget: after.plan?.calorieTarget ?? null, source: after.plan?.source ?? null, createdAt: after.plan?.createdAt ?? null },
        planEvents: after.meta.planEvents.map((e) => e.rule),
        periodic: periodicReplanUnderRules(after, exportDay, `${exportDay}T21:41:00.000Z`, st).status,
        gate: st ? { met: st.gate.met, weighInCount: st.gate.weighInCount, coverage: st.gate.adherenceCoverage, trackedDays: st.gate.trackedDays } : null,
        surfaced: st?.surfaced ?? null,
        blockedByStaleWeighIn: st?.blockedByStaleWeighIn ?? null,
        message: staleWeighInNotice(after, exportDay),
        projection: { weighInNeeded: ch?.weighInNeeded ?? null, pending: ch?.projectionPending ?? null, points: ch?.projection.length ?? null },
      };
    }

    // Point 4, reported: a change of rate made by the user on 24/10, 22 days after the last weigh-in.
    const trend = trendOf(s).summary.latest;
    const change = changeGoalOnPath(s, exportDay, { goal: 'loss', targetWeightKg: s.profile?.targetWeightKg ?? 60, weeklyRate: 0.005 });
    const changedPlan = change.ok ? change.store.plan : null;
    const result = {
      file: n + 1,
      exportDay,
      v5,
      gateBack: { weighInCount: gateBack.weighInCount, spanDays: gateBack.spanDays, met: gateBack.met, periodStart: gateBack.periodStart, pauses: gateBack.pauses },
      modeledBeforeBack: before,
      on24: {
        weighInStale: weighInStale(s, exportDay),
        message: staleWeighInNotice(s, exportDay),
        periodic: { status: replan.status, reason: 'reason' in replan ? replan.reason : null, plainStatus: periodicReplan(s, exportDay).status },
        recalibration: { surfaced: stateDay?.surfaced ?? null, blockedByStaleWeighIn: stateDay?.blockedByStaleWeighIn ?? null, gateMet: stateDay?.gate.met ?? null, weighInCount: stateDay?.gate.weighInCount ?? null, coverage: stateDay?.gate.adherenceCoverage ?? null },
        projection: { weighInNeeded: chart?.weighInNeeded ?? null, points: chart?.projection.length ?? null },
        deducedUnder1_9: deduced,
        gateWindowUnder1_9: { coverage: gateWindow.adherenceCoverage, trackedDays: gateWindow.trackedDays, met: gateWindow.met },
      },
      replay24,
      userChangeAfterAbsence: changedPlan
        ? { calorieTarget: changedPlan.calorieTarget, planWeightKg: changedPlan.planWeightKg ?? null, trendKg: trend?.trendKg ?? null, modeledKgUsed: modeledOn(s, exportDay, 'off')?.modeledKg ?? null, weeklyRateTarget: changedPlan.weeklyRateTarget, approximateWeeks: changedPlan.projection.approximateWeeks ?? null, firstProjectionKg: changedPlan.projection.trajectory[0]?.weightKg ?? null }
        : { failed: change.ok ? null : change.reason },
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/real-case-${n + 1}.json`, `${JSON.stringify(result, null, 2)}\n`);
  });
}
