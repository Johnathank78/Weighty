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
import { runDailyChecks } from '@/domain/planSafety';
import type { WheightyStore } from '@/domain/types';
import { exportStore, parseImport } from '@/persistence/exportImport';
import { addDays, localIsoDate } from '@/science/dates';
import { at, buttonProfile, eat, firstPlanProfile, incompleteDayProfile, proposalProfile, returnProfile } from '../../helpers/verificationProfiles';

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
});
