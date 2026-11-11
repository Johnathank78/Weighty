/**
 * Diagnostics of the export (report 49, point 1b): what the code in service computes from the store at the moment of the
 * export, to rebuild what happened and what the user saw. Derived, never read back at import. Each block is computed apart:
 * an error writes its message and the export goes on (the export never fails because of the diagnostics).
 */
import * as SCIENCE_CONSTANTS from '@/science/constants';
import { CONSTANT_METADATA } from '@/science/constants';
import { reconstructDays, validWeights } from '@/science/calibration';
import { daysBetween } from '@/science/dates';
import { guardrailMaxWeeklyRate } from '@/science/goals';
import { bmi } from '@/science/macros';
import { modeledBodyAt } from '@/science/modeledBody';
import type { CalibrationState } from './engine';
import {
  calibrationInputFromStore,
  computeCalibrationState,
  currentWeightKg,
  daysSincePeriodicCheck,
  latestAppliedSnapshot,
  planAgeDays,
  trendOf,
  unseenPlanMessages,
  weighInStale,
} from './engine';
import { alignButton, alignedLockLine, balanceSliderAvailable, habitLine, journalBalanceLine, journalObservations, journalRead } from './journalPath';
import { personalTargetAvailable, personalTargetLine } from './personalTarget';
import { planChangeOptions } from './planChange';
import { bmi20Warning, planNotices, staleWeighInNotice } from './planSafety';
import type { WheightyStore } from './types';
import {
  adherenceSummary,
  analysisView,
  averageLoggedSteps,
  displayMacros,
  gateProgress,
  goalStatus,
  planEnergyBalanceKcal,
  recentWeights,
  reminderDue,
  todayStatusTitle,
  trackingChart,
  TRACKING_RANGE_DAYS,
  weeksOfTracking,
} from './views';

export type DiagnosticsBlock = Record<string, unknown>;

/** A block, or its error message: the export goes on whatever happens here. */
function guarded(fn: () => unknown): unknown {
  try {
    return fn();
  } catch (error) {
    return { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

/** Every constant of src/science/constants.ts with its label from CONSTANT_METADATA (null when it has none). */
export function constantsDump(): Record<string, { value: unknown; category: string | null; source: string | null }> {
  const out: Record<string, { value: unknown; category: string | null; source: string | null }> = {};
  for (const [name, value] of Object.entries(SCIENCE_CONSTANTS)) {
    if (name === 'CONSTANT_METADATA' || typeof value === 'function') continue;
    const meta = CONSTANT_METADATA[name];
    out[name] = { value, category: meta?.category ?? null, source: meta?.source ?? null };
  }
  return out;
}

/**
 * The diagnostics block, computed with the code in service. `state`: the calibration state of the day when the app holds
 * one for the current store; computed here otherwise.
 */
export function buildDiagnostics(store: WheightyStore, today: string, nowIso: string, state?: CalibrationState | null): DiagnosticsBlock {
  const calibration = guarded(() => (state === undefined ? computeCalibrationState(store, today, nowIso) : state)) as CalibrationState | null | { error: string };
  const st: CalibrationState | null = calibration && 'gate' in calibration ? calibration : null;
  const weights = validWeights(store.weights);
  const last = weights[weights.length - 1] ?? null;
  return {
    today,
    at: nowIso,
    gate: guarded(() => ({
      gate: st?.gate ?? null,
      lastValidWeighIn: last ? last.date : null,
      lastWeighInAgeDays: last ? daysBetween(last.date, today) : null,
      weighInStale: weighInStale(store, today),
    })),
    calibration: guarded(() => {
      if (!st) return calibration;
      const p = st.fit?.posterior ?? null;
      return {
        surfaced: st.surfaced,
        proposedMaintenanceKcal: st.proposedMaintenanceKcal,
        currentMaintenanceKcal: st.currentMaintenanceKcal,
        currentInterval80: st.currentInterval80,
        confidence: st.confidence,
        candidate: st.candidate,
        posterior: p ? { offsetsKcal: p.offsetsKcal, probabilities: p.probabilities, medianKcal: p.medianKcal, meanKcal: p.meanKcal, interval80: p.interval80, interval95: p.interval95, sdKcal: p.sdKcal } : null,
        window: st.fit ? { startDate: st.fit.startDate, endDate: st.fit.endDate, spanDays: st.fit.observationSpanDays, validWeightCount: st.fit.validWeightCount, observationWeights: st.fit.observationWeights, excludedOffsetCount: st.fit.excludedOffsetCount } : null,
        lastApplied: latestAppliedSnapshot(store),
        rest: Object.fromEntries(Object.entries(st).filter(([k]) => !['gate', 'fit', 'candidate', 'surfaced', 'proposedMaintenanceKcal', 'currentMaintenanceKcal', 'currentInterval80', 'currentInterval95', 'confidence'].includes(k))),
      };
    }),
    modeledBody: guarded(() => {
      const snapshot = latestAppliedSnapshot(store);
      const input = calibrationInputFromStore(store, today);
      if (!snapshot || !input) return null;
      const body = modeledBodyAt(input, snapshot.posteriorMedianOffsetKcal, today);
      const trend = trendOf(store).summary.latest;
      return body
        ? {
            offsetKcal: body.offsetKcal,
            modeledWeightKg: body.modeledWeightKg,
            trendKg: trend?.trendKg ?? null,
            gapToTrendKg: trend ? body.modeledWeightKg - trend.trendKg : null,
            weightShiftKg: body.weightShiftKg,
            windowStartDate: body.windowStartDate,
            windowEndDate: body.windowEndDate,
            simulatedDays: body.simulatedDays,
            reanchor: input.reanchorAfterPause ?? 'off',
            reanchorApplied: body.reanchor ?? null,
          }
        : null;
    }),
    fitDays: guarded(() => {
      const input = calibrationInputFromStore(store, today);
      const first = weights[0];
      if (!input || !first || !last) return [];
      const span = daysBetween(first.date, last.date);
      const exact = new Set(store.dailyLogs.map((l) => l.date));
      return reconstructDays(input, first.date, span).map((d) => ({
        date: d.date,
        intakeKcal: d.intakeKcal,
        intakeSource: exact.has(d.date) ? 'log' : 'nearest_log',
        carbKcal: d.carbKcal,
        steps: d.steps,
        stepsLogged: d.stepsLogged,
        adherence: d.adherence,
        weight: d.weight,
      }));
    }),
    journal: guarded(() => {
      const start = store.meta.onboardingDate;
      if (!start) return [];
      return journalObservations(store, start, today).map((o) => ({ date: o.date, loggedKcal: o.loggedKcal, consumptionMoments: o.consumptionMoments, usable: o.usable }));
    }),
    trend: guarded(() => {
      const t = trendOf(store);
      return { latest: t.summary.latest, weeklyRateKg: t.summary.weeklyRateKg, readable: t.summary.readable, points: t.points.length };
    }),
    periodic: guarded(() => {
      const plan = store.plan;
      if (!plan) return null;
      const since = daysSincePeriodicCheck(store, plan, today);
      return {
        planAgeDays: planAgeDays(plan, today),
        daysSinceCheck: since,
        due: since >= SCIENCE_CONSTANTS.PERIODIC_REPLAN_EVERY_DAYS,
        blockedByStaleWeighIn: since >= SCIENCE_CONSTANTS.PERIODIC_REPLAN_EVERY_DAYS && weighInStale(store, today),
        checkedOn: store.meta.periodicReplanCheckedOn,
        planSource: plan.source,
        chosenTargetActive: store.meta.journalPath.chosenTargetActive,
      };
    }),
    guardrails: guarded(() => {
      const profile = store.profile;
      const plan = store.plan;
      const weight = currentWeightKg(store);
      if (!profile || !plan || weight === null) return null;
      const b = bmi(weight, profile.heightCm);
      return {
        weightKg: weight,
        bmi: b,
        g1Due: plan.goal === 'loss' && b < SCIENCE_CONSTANTS.LOSS_UNAVAILABLE_BMI_BELOW,
        g2CapRate: plan.goal === 'loss' ? guardrailMaxWeeklyRate('loss', b) : null,
        planRate: plan.weeklyRateTarget,
        underweightBelowBmi: SCIENCE_CONSTANTS.UNDERWEIGHT_ALERT_BMI_BELOW,
        bmi20Warning: bmi20Warning(store, today, st),
      };
    }),
    journalPath: guarded(() => ({ state: store.meta.journalPath, journalRead: journalRead(store), personalTargetAvailable: personalTargetAvailable(store) })),
    chart: guarded(() => ({ month: trackingChart(store, today, TRACKING_RANGE_DAYS.month, st), all: trackingChart(store, today, TRACKING_RANGE_DAYS.all, st) })),
    screens: guarded(() => screenViewModels(store, today, st)),
    constants: guarded(() => constantsDump()),
  };
}

/** What the five sections show, from the same functions the screens call (not the pixels). */
export function screenViewModels(store: WheightyStore, today: string, state: CalibrationState | null): DiagnosticsBlock {
  const plan = store.plan;
  const ready = state?.surfaced === true && plan?.source !== 'personal_target';
  return {
    today: guarded(() => ({
      calorieTarget: plan?.calorieTarget ?? null,
      stepTarget: plan?.stepTarget ?? null,
      macros: plan ? displayMacros(plan) : null,
      statusTitle: todayStatusTitle(store, today, state, ready),
      confidence: state?.confidence ?? 'low',
      weighInReminderDue: reminderDue(store, today),
      goalReached: goalStatus(store).reached,
      notices: planNotices(unseenPlanMessages(store), bmi20Warning(store, today, state), staleWeighInNotice(store, today)),
    })),
    plan: guarded(() => ({
      plan: plan ? { source: plan.source, goal: plan.goal, calorieTarget: plan.calorieTarget, stepTarget: plan.stepTarget, weeklyRateTarget: plan.weeklyRateTarget, maintenanceKcal: plan.maintenanceKcal, createdAt: plan.createdAt, approximateWeeks: plan.projection.approximateWeeks ?? null } : null,
      energyBalanceKcal: planEnergyBalanceKcal(store, today),
      personalTargetLine: personalTargetLine(store),
      journalBalanceLine: journalBalanceLine(store),
      habitLine: habitLine(store),
      alignedLockLine: alignedLockLine(store, today),
      sliderAvailable: balanceSliderAvailable(store),
      planChangeOptions: planChangeOptions(store, today),
      alignButton: alignButton(store, today),
    })),
    suivi: guarded(() => ({
      trend: trendOf(store).summary,
      chart: trackingChart(store, today, TRACKING_RANGE_DAYS.month, state),
      recentWeights: recentWeights(store, 8),
      weeks: weeksOfTracking(store, today),
    })),
    analyse: guarded(() => ({
      view: analysisView(store, state),
      gate: gateProgress(state, store),
      adherence: adherenceSummary(store),
      averageLoggedSteps: averageLoggedSteps(store),
    })),
    profil: guarded(() => ({
      profile: store.profile,
      initialWeightKg: store.meta.initialWeightKg,
      weeks: weeksOfTracking(store, today),
      preferences: store.preferences,
      counts: { weights: store.weights.length, dailyLogs: store.dailyLogs.length, adherenceNoted: store.dailyLogs.filter((l) => l.adherence).length, foodEntries: store.foodJournal.entries.length, snapshots: store.calibrationSnapshots.length, planEvents: store.meta.planEvents.length, activity: store.activityLog.entries.length },
    })),
  };
}
