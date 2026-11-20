/**
 * Pass 5b and its fixes (reports 45 and 46): test profiles for the manual check, written to docs/verification-5b/ (import
 * them in the app: Profil > Mes données > Importer un fichier, then reload the page so that the day-change checks run).
 * Each file is checked here before it is written. The dates are relative to the day of the check: the files are built for
 * today by default (MANUAL_TODAY=AAAA-MM-JJ for another day), and are only valid that day.
 * Run: npm run verification:profils
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { alignButton, incompleteDayLine, measuredOfferView, openAlignProposal, suggestedAdherence } from '@/domain/journalPath';
import { THIN_SPACE } from '@/domain/format';
import { computeCalibrationState } from '@/domain/engine';
import { planEventShort } from '@/domain/planSafety';
import { takeOverPersonalTarget } from '@/domain/personalTarget';
import { runDailyChecks } from '@/domain/planSafety';
import type { WheightyStore } from '@/domain/types';
import { exportStore, parseImport } from '@/persistence/exportImport';
import { addDays, localIsoDate } from '@/science/dates';
import { at, backAfterPauseProfile, buttonProfile, deducedAdherenceProfile, eat, firstPlanProfile, firstRecalibrationProfile, personalTargetRecalibrationProfile, planHistoryProfile, oldWeighInChangeProfile, incompleteDayProfile, pauseWithoutWeighInProfile, personalTargetProfile, proposalProfile, pauseAndProjectionProfile, recalibratedGateClosedProfile, replanAndRecalibrationProfile, returnProfile, takeoverProfile } from '../../helpers/verificationProfiles';
import { hasAppliedRecalibration, periodicReplanDue, weighInStale } from '@/domain/engine';
import { staleWeighInNotice } from '@/domain/planSafety';
import { firstRecalibrationAutoOpenDue } from '@/domain/firstRecalibration';
import { planHistory } from '@/domain/planHistory';
import { previewAppPlanReturn } from '@/domain/personalTarget';
import { planChangeOptions } from '@/domain/planChange';
import { analysisView, gateProgress, todayStatusTitle, trackingChart, TRACKING_RANGE_DAYS } from '@/domain/views';

const TODAY = process.env.MANUAL_TODAY ?? localIsoDate(new Date());
const OUT = 'docs/verification-5b';

function write(name: string, store: WheightyStore): void {
  const text = exportStore(store, at(TODAY));
  const back = parseImport(text);
  expect(back.ok).toBe(true);
  writeFileSync(`${OUT}/${name}`, `${text}\n`);
}

it(`pass 5b manual check profiles, for ${TODAY}`, () => {
  mkdirSync(OUT, { recursive: true });

  const proposal = proposalProfile(TODAY);
  expect(openAlignProposal(proposal, TODAY)?.accept).toBe(`Viser 2${THIN_SPACE}150 kcal`);
  write('1-proposition.json', proposal);

  // No proposal, button off with "encore 1"; logging yesterday turns it on.
  const button = buttonProfile(TODAY);
  expect(openAlignProposal(button, TODAY)).toBeNull();
  expect(alignButton(button, TODAY)).toMatchObject({ enabled: false, hint: 'Disponible quand 10 des 14 derniers jours sont saisis (encore 1).' });
  expect(alignButton(eat(button, addDays(TODAY, -1), 1850), TODAY)?.enabled).toBe(true);
  write('2-bouton.json', button);

  const first = firstPlanProfile(TODAY);
  expect(measuredOfferView(first)?.kind).toBe('first');
  expect(measuredOfferView(first)?.text).toMatch(/En moyenne, tu manges 10 % de plus que ta cible/);
  write('3-premier-plan.json', first);

  const back = returnProfile(TODAY);
  expect(runDailyChecks(back, TODAY, at(TODAY)).meta.journalPath).toMatchObject({ method: 'aligned', lastExit: { date: TODAY, reason: 'weighins' } });
  write('4-retour-cible-alignee.json', back);

  const incomplete = incompleteDayProfile(TODAY);
  expect(incompleteDayLine(incomplete, addDays(TODAY, -1), TODAY)).toBe('Journée incomplète ? Elle ne sera pas prise en compte dans ton plan.');
  expect(suggestedAdherence(incomplete, TODAY)?.value).toBe('minor_deviation');
  write('5-journee-incomplete.json', incomplete);

  // Report 46, point 4: nothing declared in the file; the day change after the import records the past days.
  const deduced = deducedAdherenceProfile(TODAY);
  expect(deduced.dailyLogs.some((l) => l.adherence !== undefined)).toBe(false);
  const loaded = runDailyChecks(deduced, TODAY, at(TODAY));
  const on = (d: string) => loaded.dailyLogs.find((l) => l.date === d);
  expect(on(addDays(TODAY, -1))).toMatchObject({ adherence: 'minor_deviation', adherenceSource: 'journal' });
  expect(on(addDays(TODAY, -2))).toMatchObject({ adherence: 'major_deviation', adherenceSource: 'journal' });
  expect(on(TODAY)?.adherence).toBeUndefined();
  expect(suggestedAdherence(loaded, TODAY)?.text).toBe('Plan respecté, d’après ton journal');
  write('6-adherence-deduite.json', deduced);

  // Report 46, point 6, and report 47: the personal target in force, no recalibration yet.
  const personal = personalTargetProfile(TODAY);
  expect(personal.plan?.source).toBe('personal_target');
  expect(computeCalibrationState(runDailyChecks(personal, TODAY, at(TODAY)), TODAY, at(TODAY))?.surfaced).toBe(false);
  write('7-cible-personnelle.json', personal);

  // Report 47, point 1c: the first recalibration is ready at the opening; the app takes the target over by itself.
  const takeover = takeoverProfile(TODAY);
  const opened = runDailyChecks(takeover, TODAY, at(TODAY));
  expect(opened.plan?.source).toBe('personal_target');
  const taken = takeOverPersonalTarget(opened, computeCalibrationState(opened, TODAY, at(TODAY)), TODAY, at(TODAY));
  expect(taken.plan?.source).toBe('recalibrated');
  const event = taken.meta.planEvents[taken.meta.planEvents.length - 1];
  expect(event?.personalTarget?.case).toBe('too_fast');
  expect(event && planEventShort(event)?.title).toBe('Vitesse ajustée');
  write('8-reprise.json', takeover);

  // Report 49 (prompt 6a, 6.5): pauses and the life cycle of the recalibration.
  const pause = runDailyChecks(pauseWithoutWeighInProfile(TODAY), TODAY, at(TODAY));
  const pauseState = computeCalibrationState(pause, TODAY, at(TODAY));
  expect(weighInStale(pause, TODAY)).toBe(true);
  expect(staleWeighInNotice(pause, TODAY)?.title).toBe('Ton plan attend une pesée');
  expect(pauseState).toMatchObject({ surfaced: false, blockedByStaleWeighIn: true });
  expect(trackingChart(pause, TODAY, null, pauseState)).toMatchObject({ weighInNeeded: true, projection: [] });
  write('8-pause-sans-pesee.json', pauseWithoutWeighInProfile(TODAY));

  const backAfter = runDailyChecks(backAfterPauseProfile(TODAY), TODAY, at(TODAY));
  const backState = computeCalibrationState(backAfter, TODAY, at(TODAY));
  expect(backState?.gate).toMatchObject({ weighInCount: 1, periodStart: TODAY });
  expect(gateProgress(backState, backAfter).resumedOn).toBe(TODAY);
  expect(staleWeighInNotice(backAfter, TODAY)).toBeNull();
  write('9-retour-apres-pause.json', backAfterPauseProfile(TODAY));

  const closed = runDailyChecks(recalibratedGateClosedProfile(TODAY), TODAY, at(TODAY));
  const closedState = computeCalibrationState(closed, TODAY, at(TODAY));
  expect(hasAppliedRecalibration(closed)).toBe(true);
  expect(closedState?.gate.met).toBe(false);
  expect(analysisView(closed, closedState)?.nextUpdate).not.toBeNull();
  expect(todayStatusTitle(closed, TODAY, closedState, false)).toMatch(/prochaine mise à jour/);
  write('10-recalibree-porte-fermee.json', recalibratedGateClosedProfile(TODAY));

  const both = replanAndRecalibrationProfile(TODAY);
  expect(periodicReplanDue(both, TODAY)).toBe(true);
  const bothChecked = runDailyChecks(both, TODAY, at(TODAY));
  expect(computeCalibrationState(bothChecked, TODAY, at(TODAY))?.surfaced).toBe(true);
  expect(bothChecked.plan?.createdAt).toBe(both.plan?.createdAt);
  expect(bothChecked.meta.periodicReplanDeferredOn).toBe(TODAY);
  write('11-recalcul-et-recalibration.json', both);

  // Report 50 (UX pass 3, 4.5): synthetic profiles 12 to 16.
  const firstRecal = runDailyChecks(firstRecalibrationProfile(TODAY), TODAY, at(TODAY));
  expect(firstRecalibrationAutoOpenDue(firstRecal, computeCalibrationState(firstRecal, TODAY, at(TODAY)), false)).toBe(true);
  write('12-premiere-recalibration.json', firstRecalibrationProfile(TODAY));

  const personalRecal = runDailyChecks(personalTargetRecalibrationProfile(TODAY), TODAY, at(TODAY));
  const personalRecalState = computeCalibrationState(personalRecal, TODAY, at(TODAY));
  expect(personalRecalState?.surfaced).toBe(true);
  expect(firstRecalibrationAutoOpenDue(personalRecal, personalRecalState, false)).toBe(false);
  expect(takeOverPersonalTarget(personalRecal, personalRecalState, TODAY, at(TODAY)).plan?.source).toBe('recalibrated');
  write('13-cible-personnelle-recalibration.json', personalTargetRecalibrationProfile(TODAY));

  const historyStore = runDailyChecks(planHistoryProfile(TODAY), TODAY, at(TODAY));
  expect(planHistory(historyStore, TODAY).map((e) => e.cause)).toEqual(['Recalcul régulier', 'Tu as changé de vitesse ou d’objectif', 'Mise à jour avec tes pesées', 'Recalibration (détails non conservés)', 'Ton premier plan']);
  write('14-historique-du-plan.json', planHistoryProfile(TODAY));

  const paused = runDailyChecks(pauseAndProjectionProfile(TODAY), TODAY, at(TODAY));
  const pausedState = computeCalibrationState(paused, TODAY, at(TODAY));
  for (const range of [TRACKING_RANGE_DAYS.month, TRACKING_RANGE_DAYS.all]) {
    const chart = trackingChart(paused, TODAY, range, pausedState);
    expect(chart?.pauses).toHaveLength(1);
    expect(chart?.projection[0]?.day).toBe(chart?.todayDay);
    expect((chart?.todayDay ?? 0) - (chart?.trend[chart.trend.length - 1]?.day ?? 0)).toBe(3);
    expect(chart?.projection[1]?.day).toBe((chart?.todayDay ?? 0) + 1);
  }
  write('15-pause-et-projection.json', pauseAndProjectionProfile(TODAY));

  const oldWeighIn = runDailyChecks(oldWeighInChangeProfile(TODAY), TODAY, at(TODAY));
  expect(weighInStale(oldWeighIn, TODAY)).toBe(true);
  expect(planChangeOptions(oldWeighIn, TODAY)?.map((o) => o.id)).toContain('return');
  expect(previewAppPlanReturn(oldWeighIn, TODAY)?.ok).toBe(true);
  write('16-pesee-ancienne-changement.json', oldWeighInChangeProfile(TODAY));
});
