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
import { at, buttonProfile, deducedAdherenceProfile, eat, firstPlanProfile, incompleteDayProfile, personalTargetProfile, proposalProfile, returnProfile, takeoverProfile } from '../../helpers/verificationProfiles';

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
});
