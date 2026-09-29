/**
 * Pass 5b (report 45): test profiles for the manual check, written to docs/verification-5b/ (import them in the app:
 * Profil > Mes données > Importer un fichier, then reload the page so that the day-change checks run). Each file is checked
 * here before it is written. The dates are relative to MANUAL_TODAY: regenerate the files for the day of the check.
 * Run: MANUAL_TODAY=2026-09-29 npx vitest run -c vitest.journal.config.ts prod5b/manualProfiles
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { addWeight, completeOnboarding, setAdherence } from '@/domain/engine';
import { addFoodEntry } from '@/domain/journal';
import { acceptMeasuredOffer, alignButton, incompleteDayLine, measuredOfferView, openAlignProposal, runJournalWeek, suggestedAdherence, switchToAlignedTarget } from '@/domain/journalPath';
import { runDailyChecks } from '@/domain/planSafety';
import type { WheightyStore } from '@/domain/types';
import { exportStore, parseImport } from '@/persistence/exportImport';
import { emptyStore } from '@/persistence/schema';
import { addDays } from '@/science/dates';
import type { UserProfile } from '@/science/types';
import { makeProfile } from '../../helpers/profiles';

const TODAY = process.env.MANUAL_TODAY ?? '2026-09-29';
const OUT = 'docs/verification-5b';
const at = (d: string) => `${d}T08:00:00.000Z`;
const MEALS = [
  { time: '08:00', share: 0.25 },
  { time: '12:30', share: 0.4 },
  { time: '19:30', share: 0.35 },
] as const;

const profile = (firstName: string): UserProfile =>
  makeProfile({ firstName, sexForEquation: 'female', ageYears: 35, heightCm: 165, currentWeightKg: 75, goal: 'loss', targetWeightKg: 64, weeklyRateTarget: 0.005 });

/** Three meals summing to `kcal` on `date` (free entries, no macros). */
function eat(s: WheightyStore, date: string, kcal: number): WheightyStore {
  let out = s;
  for (const m of MEALS) {
    const r = addFoodEntry(out, { kind: 'manual', food: { name: 'Repas', intake: { energyKcal: Math.round(kcal * m.share), proteinG: null, carbsG: null, fatG: null }, grams: null }, date, localTime: m.time, consumedTime: m.time }, at(date));
    if (!r.ok) throw new Error(r.reason);
    out = r.store;
  }
  return out;
}

type Day = { kcal?: number | null; kg?: number | null; adherence?: 'on_plan' | 'major_deviation' };

/** Onboarding `days` days before today, then days 1 to `to` (relative to the start). */
function history(p: UserProfile, days: number): { store: WheightyStore; start: string } {
  const start = addDays(TODAY, -days);
  const r = completeOnboarding(emptyStore(), p, start, at(start));
  if (!r.ok) throw new Error(r.reason);
  return { store: r.store, start };
}
function live(s: WheightyStore, start: string, from: number, to: number, f: (i: number) => Day): WheightyStore {
  let out = s;
  for (let i = from; i <= to; i++) {
    const date = addDays(start, i);
    const d = f(i);
    if (d.kg !== null && d.kg !== undefined && i > 0) out = addWeight(out, { date, weightKg: Math.round(d.kg * 10) / 10 }, at(date));
    if (d.kcal !== null && d.kcal !== undefined) out = eat(out, date, d.kcal);
    if (d.adherence) out = setAdherence(out, date, d.adherence);
  }
  return out;
}

function write(name: string, store: WheightyStore): void {
  const text = exportStore(store, at(TODAY));
  const back = parseImport(text);
  expect(back.ok).toBe(true);
  writeFileSync(`${OUT}/${name}`, `${text}\n`);
}

/** Aligned target on day `switchDay` (non-follower before), then `after` up to day `to`. */
function alignedHistory(name: string, days: number, switchDay: number, to: number, after: (i: number) => Day): { store: WheightyStore; start: string } {
  const { store, start } = history(profile(name), days);
  let s = live(store, start, 0, switchDay - 1, (i) => ({ kcal: 2100, kg: 75 - 0.02 * i, adherence: 'major_deviation' }));
  s = live(s, start, switchDay, switchDay, (i) => ({ kg: 75 - 0.02 * i }));
  const r = switchToAlignedTarget(s, addDays(start, switchDay), at(addDays(start, switchDay)));
  if (!r.ok) throw new Error(r.reason);
  s = live(r.store, start, switchDay, switchDay, (i) => ({ kcal: after(i).kcal ?? null }));
  return { store: live(s, start, switchDay + 1, to, after), start };
}

it('pass 5b manual check profiles', () => {
  mkdirSync(OUT, { recursive: true });

  // 1. Automatic proposal: 20 days, a weigh-in and about 2 100 kcal logged every day, every day noted "Écart important".
  {
    const { store, start } = history(profile('Test proposition'), 20);
    const s = runDailyChecks(live(store, start, 0, 19, (i) => ({ kcal: 2100 + (i % 3) * 40, kg: 75 - 0.02 * i, adherence: 'major_deviation' })), TODAY, at(TODAY));
    expect(openAlignProposal(s, TODAY)?.accept).toBe('Viser 2 150 kcal');
    write('1-proposition.json', s);
  }

  // 2. Button: 9 logged days among the last 14 (yesterday not logged), days noted "Plan respecté": no proposal, button off.
  {
    const { store, start } = history(profile('Test bouton'), 20);
    const logged = (i: number) => i < 6 || (i <= 18 && ![7, 10, 13, 16].includes(i));
    const s = runDailyChecks(live(store, start, 0, 19, (i) => ({ kcal: logged(i) && i !== 19 ? 1850 : null, kg: 75 - 0.02 * i, adherence: 'on_plan' })), TODAY, at(TODAY));
    expect(openAlignProposal(s, TODAY)).toBeNull();
    expect(alignButton(s, TODAY)).toMatchObject({ enabled: false, hint: 'Disponible quand 10 des 14 derniers jours sont saisis (encore 1).' });
    // Logging yesterday turns it on.
    expect(alignButton(eat(s, addDays(TODAY, -1), 1850), TODAY)?.enabled).toBe(true);
    write('2-bouton.json', s);
  }

  // 3. First plan of the measured habit: aligned 21 days ago, 10 % over the target in the journal since, a weigh-in a day.
  {
    const { store } = alignedHistory('Test premier plan', 35, 14, 34, (i) => ({ kcal: 2310, kg: 75 - 0.02 * i }));
    const w = addWeight(store, { date: TODAY, weightKg: 74.3 }, at(TODAY));
    const s = runDailyChecks(runJournalWeek(w, TODAY, at(TODAY)), TODAY, at(TODAY));
    const offer = measuredOfferView(s);
    expect(offer?.kind).toBe('first');
    expect(offer?.text).toMatch(/En moyenne, tu manges 10 % de plus que ta cible/);
    write('3-premier-plan.json', s);
  }

  // 4. Return to the aligned target: in the measured habit since 14 days, no weigh-in on 3 of the last 7 days. The weekly
  // evaluation is due today: it runs when the page is reloaded after the import.
  {
    const { store, start } = alignedHistory('Test retour', 49, 14, 34, (i) => ({ kcal: 2310, kg: 75 - 0.02 * i }));
    const entered = acceptMeasuredOffer(runJournalWeek(addWeight(store, { date: addDays(start, 35), weightKg: 74.3 }, at(addDays(start, 35))), addDays(start, 35), at(addDays(start, 35))), addDays(start, 35), at(addDays(start, 35)));
    if (!entered.ok) throw new Error('offer');
    const s = live(entered.store, start, 35, 48, (i) => ({ kcal: 2100, kg: i === 35 || i === 43 || i === 45 || i === 47 ? null : 74.3 - 0.02 * (i - 35) }));
    const withPath = { ...s, meta: { ...s.meta, journalPath: { ...s.meta.journalPath, lastEvaluatedOn: addDays(TODAY, -7) } } };
    const after = runDailyChecks(withPath, TODAY, at(TODAY));
    expect(after.meta.journalPath).toMatchObject({ method: 'aligned', lastExit: { date: TODAY, reason: 'weighins' } });
    write('4-retour-cible-alignee.json', withPath);
  }

  // 5. Incomplete day and prefilled declaration: aligned 10 days ago; yesterday only 600 kcal logged (under half the usual
  // total); today 15 % over the target in the journal, not noted yet.
  {
    const { store } = alignedHistory('Test journee', 24, 14, 23, (i) => ({ kcal: i === 23 ? 600 : 1900 + (i % 2) * 100, kg: 75 - 0.02 * i }));
    const target = store.plan?.calorieTarget as number;
    const s = runDailyChecks(eat(addWeight(store, { date: TODAY, weightKg: 74.5 }, at(TODAY)), TODAY, Math.round(target * 1.15)), TODAY, at(TODAY));
    expect(incompleteDayLine(s, addDays(TODAY, -1), TODAY)).toBe('Journée incomplète ? Elle ne sera pas prise en compte dans ton plan.');
    expect(suggestedAdherence(s, TODAY)?.text).toBe('D’après ton journal : écart léger. C’est bien ça ?');
    write('5-journee-incomplete.json', s);
  }
});
