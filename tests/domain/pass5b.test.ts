/**
 * Pass 5b (report 45): the journal path. Automatic proposal and button, aligned target, gate of the measured habit and its
 * tolerances, missed meal, missing day, first plan (confirmed, refused, offered again, failed), return to the aligned target
 * and back, surfacing on M / h, floor x 1.10 on the displayed target, suggested adherence, no declaration in the measured
 * habit, no "dépense" once the journal is read, loading of schema 7, correction of a past entry.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addWeight, applySliderSteps, completeOnboarding, periodicReplan, setAdherence } from '@/domain/engine';
import { addFoodEntry, replaceManualEntry } from '@/domain/journal';
import {
  acceptMeasuredOffer,
  adherenceAsked,
  alignButton,
  alignedTargetPreview,
  applyJournalWeek,
  balanceSliderAvailable,
  checkAlignProposal,
  continuousLoggingStart,
  declineAlignProposal,
  declineMeasuredOffer,
  evaluateJournalWeek,
  habitLine,
  habitOf,
  incompleteDayLine,
  journalBalanceLine,
  journalObservations,
  jstarPlanOf,
  jstarSurfaced,
  measuredGate,
  measuredInput,
  measuredOfferView,
  openAlignProposal,
  revisionProposalTriggered,
  runJournalWeek,
  suggestedAdherence,
  switchToAlignedTarget,
} from '@/domain/journalPath';
import { formatKcal, THIN_SPACE } from '@/domain/format';
import { JOURNAL_MESSAGE } from '@/domain/planMessages';
import { runDailyChecks } from '@/domain/planSafety';
import type { WheightyStore } from '@/domain/types';
import { defaultJournalPath, SCHEMA_VERSION } from '@/domain/types';
import { migrateToCurrent } from '@/persistence/migrations';
import { emptyStore, validateStore } from '@/persistence/schema';
import { PRODUCTION_SOLVER } from '@/domain/engine';
import { evaluateGate, shouldSurfaceRecalibration } from '@/science/calibration';
import type { GateStatus } from '@/science/calibration';
import { addDays } from '@/science/dates';
import { hardFloorKcal } from '@/science/goals';
import type { UserProfile } from '@/science/types';
import { makeProfile } from '../helpers/profiles';

const D0 = '2026-06-01';
const day = (i: number) => addDays(D0, i);
const at = (date: string) => `${date}T08:00:00.000Z`;
const nb = (text: string) => text.replace(/(\d) (\d{3})/g, `$1${THIN_SPACE}$2`);

const LOSS: UserProfile = makeProfile({ sexForEquation: 'female', ageYears: 35, heightCm: 165, currentWeightKg: 75, goal: 'loss', targetWeightKg: 64, weeklyRateTarget: 0.005 });

function onboard(profile: UserProfile = LOSS): WheightyStore {
  const r = completeOnboarding(emptyStore(), profile, D0, at(D0));
  if (!r.ok) throw new Error(r.reason);
  return r.store;
}

function logFood(s: WheightyStore, date: string, kcal: number): WheightyStore {
  const r = addFoodEntry(s, { kind: 'manual', food: { name: 'Repas', intake: { energyKcal: kcal, proteinG: null, carbsG: null, fatG: null }, grams: null }, date, localTime: '12:00', consumedTime: '12:00' }, at(date));
  if (!r.ok) throw new Error(r.reason);
  return r.store;
}

type Day = { kcal?: number | null; kg?: number | null; adherence?: 'on_plan' | 'minor_deviation' | 'major_deviation' };

/** Days [from, to]: journal, weigh-in (not on day 0, weighed at onboarding), declared adherence. */
function live(store: WheightyStore, from: number, to: number, f: (i: number) => Day): WheightyStore {
  let s = store;
  for (let i = from; i <= to; i++) {
    const d = f(i);
    if (d.kg !== null && d.kg !== undefined && i > 0) s = addWeight(s, { date: day(i), weightKg: d.kg }, at(day(i)));
    if (d.kcal !== null && d.kcal !== undefined) s = logFood(s, day(i), d.kcal);
    if (d.adherence) s = setAdherence(s, day(i), d.adherence);
  }
  return s;
}

/** A non-follower: logs `kcal` every day, weighs in every day (slow loss), declares major deviations. */
const nonFollower = (kcal = 1800) => (i: number): Day => ({ kcal, kg: 75 - 0.03 * i, adherence: 'major_deviation' });

/** Switched to the aligned target on day 14, then logging `kcal` and weighing in every day up to day `to`. */
function aligned(to: number, after: (i: number) => Day = (i) => ({ kcal: 1800, kg: 75 - 0.03 * i })): WheightyStore {
  const s = live(onboard(), 0, 13, nonFollower());
  const w = live(s, 14, 14, (i) => ({ kg: 75 - 0.03 * i }));
  const r = switchToAlignedTarget(w, day(14), at(day(14)));
  if (!r.ok) throw new Error(r.reason);
  const s2 = live(r.store, 14, 14, (i) => ({ kcal: after(i).kcal ?? null }));
  return live(s2, 15, to, after);
}

/** Aligned on day 14, first plan of the measured habit confirmed on day 28 (logging 10 percent over the target). */
function measured(): WheightyStore {
  const s = aligned(28, (i) => ({ kcal: 1980, kg: 75 - 0.03 * i }));
  const week = runJournalWeek(s, day(28), at(day(28)));
  const r = acceptMeasuredOffer(week, day(28), at(day(28)));
  if (!r.ok) throw new Error('no offer');
  return r.store;
}

describe('proposal to align the target (decision 3)', () => {
  it('automatic: deviations dominate the gate and 14 of 14 days are logged: the proposal opens, with the aligned target', () => {
    const s = live(onboard(), 0, 14, nonFollower());
    expect(revisionProposalTriggered(evaluateGate(s.weights, s.dailyLogs))).toBe(true);
    const opened = checkAlignProposal(s, day(14), at(day(14)));
    expect(opened.meta.journalPath.proposalOpenedOn).toBe(day(14));
    const p = openAlignProposal(opened, day(14));
    expect(p).toMatchObject({ title: 'Ta cible ne correspond pas à ce que tu manges', accept: nb('Viser 1 800 kcal'), decline: 'Garder ma cible' });
    expect(p?.text).toBe(nb('D’après ton journal, tu manges environ 1 800 kcal par jour. Veux-tu viser ça ? Ta cible sera ensuite ajustée pour tenir ta vitesse.'));
    // Nothing when the deviations do not dominate.
    const calm = live(onboard(), 0, 14, (i) => ({ kcal: 1800, kg: 75 - 0.03 * i, adherence: 'on_plan' }));
    expect(checkAlignProposal(calm, day(14), at(day(14))).meta.journalPath.proposalOpenedOn).toBeNull();
  });

  it('with too short a journal: the invitation to log for two weeks, at most once a week', () => {
    const s = live(onboard(), 0, 14, (i) => ({ ...nonFollower()(i), kcal: i >= 6 ? 1800 : null }));
    const a = checkAlignProposal(s, day(14), at(day(14)));
    expect(a.meta.journalPath.proposalOpenedOn).toBeNull();
    const msgs = (x: WheightyStore) => x.meta.planEvents.filter((e) => e.rule === 'journal_log_more');
    expect(msgs(a)).toHaveLength(1);
    expect(msgs(a)[0]?.message).toBe(JOURNAL_MESSAGE.logMore);
    expect(msgs(checkAlignProposal(a, day(20), at(day(20))))).toHaveLength(1);
    expect(msgs(checkAlignProposal(a, day(21), at(day(21))))).toHaveLength(2);
  });

  it('refusal: stays on the assumed target; the proposal may come back a week later', () => {
    const s = checkAlignProposal(live(onboard(), 0, 14, nonFollower()), day(14), at(day(14)));
    const refused = declineAlignProposal(s, day(14), at(day(14)));
    expect(refused.meta.journalPath).toMatchObject({ method: 'assumed', proposalOpenedOn: null, proposalDeclinedOn: day(14) });
    expect(refused.plan).toEqual(s.plan);
    const later = live(refused, 15, 21, nonFollower());
    expect(checkAlignProposal(later, day(20), at(day(20))).meta.journalPath.proposalOpenedOn).toBeNull();
    expect(checkAlignProposal(later, day(21), at(day(21))).meta.journalPath.proposalOpenedOn).toBe(day(21));
  });

  it('button: active from 10 logged days among the last 14, else disabled with the days missing', () => {
    const nine = live(onboard(), 0, 14, (i) => ({ kcal: i >= 5 ? 1800 : null, kg: 75 }));
    expect(alignButton(nine, day(14))).toEqual({ label: 'Aligner ma cible sur ce que je mange', enabled: false, hint: 'Disponible quand 10 des 14 derniers jours sont saisis (encore 1).' });
    const ten = live(onboard(), 0, 14, (i) => ({ kcal: i >= 4 ? 1800 : null, kg: 75 }));
    expect(alignButton(ten, day(14))).toMatchObject({ enabled: true, hint: null });
    // Shown on the assumed target only.
    expect(alignButton(aligned(15), day(15))).toBeNull();
  });
});

describe('aligned target (decision 5)', () => {
  it('median of the logged days only, rounded to 50 kcal', () => {
    // Ten logged days (1 700 to 2 150 by 50) and four days without an entry: the median of the ten, 1 925, rounds to 1 950.
    const s = live(onboard(), 0, 14, (i) => ({ kcal: i >= 4 && i <= 13 ? 1700 + 50 * (i - 4) : null, kg: 75 }));
    const p = alignedTargetPreview(s, day(14));
    expect(p).toMatchObject({ ok: true, loggedDays: 10, target: { medianKcal: 1925, roundedKcal: 1950, finalKcal: 1950, raised: false } });
  });

  it('raised to the hard floor x 1.10, with its message; every target after the switch is floored at x 1.10', () => {
    const s = live(onboard(), 0, 14, (i) => ({ kcal: 1000, kg: 75 - 0.03 * i, adherence: 'major_deviation' }));
    const r = switchToAlignedTarget(s, day(14), at(day(14)));
    if (!r.ok) throw new Error(r.reason);
    const floor = r.store.meta.journalPath.alignedTarget?.floorKcal as number;
    expect(floor).toBeCloseTo(1.1 * 1200, 9);
    expect(r.store.plan?.calorieTarget).toBe(floor);
    expect(r.store.plan?.hardFloorKcal).toBe(floor);
    const e = r.store.meta.planEvents.find((x) => x.rule === 'journal_switch');
    expect(e?.message).toBe(nb('Ton journal indique environ 1 000 kcal, sous ton minimum : on part de 1 320 kcal.'));
    expect(r.store.meta.journalPath).toMatchObject({ method: 'aligned', switchedOn: day(14), chosenTargetActive: true });
    // Today's log follows the aligned target; past targets are immutable.
    expect(r.store.dailyLogs.find((l) => l.date === day(14))?.calorieTargetForDay).toBe(floor);
    expect(r.store.dailyLogs.find((l) => l.date === day(13))?.calorieTargetForDay).toBe(s.dailyLogs.find((l) => l.date === day(13))?.calorieTargetForDay);
  });

  it('on the aligned target itself: no periodic replan, no slider; weigh-in encouragement at most once a week', () => {
    const s = aligned(20, (i) => ({ kcal: 1800, kg: i === 17 ? null : 75 - 0.03 * i }));
    expect(periodicReplan(s, day(60), { nowIso: at(day(60)) }).status).toBe('not_due');
    expect(balanceSliderAvailable(s)).toBe(false);
    expect(applySliderSteps(s, day(20), 9000)).toEqual({ ok: false, reason: 'journal_path' });
    const a = runDailyChecks(s, day(20), at(day(20)));
    const msgs = (x: WheightyStore) => x.meta.planEvents.filter((e) => e.rule === 'journal_weigh_daily');
    expect(msgs(a)).toHaveLength(1);
    expect(msgs(a)[0]?.message).toBe(JOURNAL_MESSAGE.weighDaily);
    expect(msgs(runDailyChecks(a, day(21), at(day(21))))).toHaveLength(1);
  });
});

describe('measured habit: gate and tolerances (decisions 4, 6, 7, 8)', () => {
  const gateAt = (s: WheightyStore, today: string) => {
    const prepared = measuredInput(s, today);
    if (!prepared) throw new Error('no input');
    return measuredGate(s, today, prepared).summary;
  };

  it('met with a weigh-in and a logged day every day, 28 days of journal and 14 days since the switch', () => {
    const s = aligned(28);
    expect(continuousLoggingStart(s, day(28))).toBe(D0);
    expect(gateAt(s, day(28))).toMatchObject({ met: true, missing: [], missedWeighIns: 0, unusableDays: 0 });
    expect(gateAt(aligned(27), day(27)).missing).toEqual(['span28', 'since_switch']);
  });

  it('2 missed weigh-ins over the last 28 days do not close it; 3 do', () => {
    expect(gateAt(aligned(28, (i) => ({ kcal: 1800, kg: i === 18 || i === 22 ? null : 75 - 0.03 * i })), day(28))).toMatchObject({ met: true, missedWeighIns: 2 });
    const three = gateAt(aligned(28, (i) => ({ kcal: 1800, kg: i === 18 || i === 22 || i === 25 ? null : 75 - 0.03 * i })), day(28));
    expect(three).toMatchObject({ met: false, missedWeighIns: 3, missing: ['missed_weighins'] });
  });

  it('2 days without a usable journal over the last 28 days do not close it; 3 do', () => {
    expect(gateAt(aligned(28, (i) => ({ kcal: i === 18 || i === 22 ? null : 1800, kg: 75 - 0.03 * i })), day(28))).toMatchObject({ met: true, unusableDays: 2 });
    const three = gateAt(aligned(28, (i) => ({ kcal: i === 18 || i === 22 || i === 25 ? null : 1800, kg: 75 - 0.03 * i })), day(28));
    expect(three).toMatchObject({ met: false, unusableDays: 3, missing: ['unlogged_days'] });
  });

  it('missed meal: a day under half the median of the previous logged days is not usable (49 %), at 51 % it is', () => {
    const s = aligned(28, (i) => ({ kcal: i === 20 ? 882 : i === 21 ? 918 : 1800, kg: 75 - 0.03 * i }));
    const [d20, d21] = journalObservations(s, day(20), day(21));
    expect(d20?.usable).toBe(false);
    expect(d21?.usable).toBe(true);
    expect(gateAt(s, day(28)).unusableDays).toBe(1);
    // A missed meal counts in the tolerance of the days not logged, and the day view says so (past days, journal read).
    expect(incompleteDayLine(s, day(20), day(28))).toBe('Journée incomplète ? Elle ne sera pas prise en compte dans ton plan.');
    expect(incompleteDayLine(s, day(21), day(28))).toBeNull();
    expect(incompleteDayLine(live(onboard(), 0, 14, (i) => ({ kcal: i === 10 ? 800 : 1800, kg: 75 })), day(10), day(14))).toBeNull();
  });

  it('missing day (decision A of 29/09, the prototype): imputed by the median of the 14 previous logged days, weight 0.5, counted in h', () => {
    const s = aligned(28, (i) => ({ kcal: i === 22 ? null : i % 2 === 0 ? 1900 : 2100, kg: 75 - 0.03 * i }));
    const prepared = measuredInput(s, day(28));
    if (!prepared) throw new Error('no input');
    const trace = prepared.observations.find((o) => o.date === day(22));
    expect(trace?.usable).toBe(false);
    const h = habitOf(s, prepared, day(14), day(28));
    // Days 14 to 27: 13 logged days (1 900 and 2 100 alternately) and day 22 imputed at the median of the 14 logged days
    // before it (days 8 to 21: six at 1 800 before the switch, four at 1 900, four at 2 100), 1 900 (report 34).
    const logged = [14, 15, 16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 27].reduce((sum, i) => sum + (i % 2 === 0 ? 1900 : 2100), 0);
    expect(h?.days).toBe(14);
    expect(h?.raw).toBeCloseTo((logged + 1900) / (14 * 1800), 12);
  });
});

describe('measured habit: first plan (decisions 4 and 9)', () => {
  it('offered for confirmation with the habit in plain words, then applied when confirmed', () => {
    const s = aligned(28, (i) => ({ kcal: 1980, kg: 75 - 0.03 * i }));
    const week = evaluateJournalWeek(s, day(28), at(day(28)));
    if (week.kind !== 'offer') throw new Error(week.kind);
    expect(week.offer.kind).toBe('first');
    expect(week.offer.habit.h).toBeCloseTo(1.1, 12);
    const offered = applyJournalWeek(s, week, day(28), at(day(28)));
    expect(offered.plan).toEqual(s.plan);
    const view = measuredOfferView(offered);
    expect(view).toMatchObject({ title: 'Ton journal permet un plan plus précis', accept: 'Utiliser ce plan', decline: 'Plus tard' });
    expect(view?.text).toBe(
      `Tu te pèses chaque jour et tu notes ce que tu manges : ton plan peut maintenant être calculé à partir de ton journal. En moyenne, tu manges 10 % de plus que ta cible ; ta nouvelle cible en tient compte : ${formatKcal(week.offer.plan.calorieTarget)} kcal par jour.`,
    );
    const r = acceptMeasuredOffer(offered, day(28), at(day(28)));
    if (!r.ok) throw new Error(r.reason);
    expect(r.store.plan).toBe(week.offer.plan);
    expect(r.store.meta.journalPath).toMatchObject({ method: 'measured', measuredSince: day(28), offer: null, estimate: week.offer.estimate, habit: week.offer.habit });
    expect(r.store.dailyLogs.find((l) => l.date === day(28))?.calorieTargetForDay).toBe(week.offer.plan.calorieTarget);
  });

  it('close habit: "Tu tiens ta cible de près" (under 2 %)', () => {
    expect(JOURNAL_MESSAGE.firstPlanText(1.015, 1850)).toBe(nb('Tu te pèses chaque jour et tu notes ce que tu manges : ton plan peut maintenant être calculé à partir de ton journal. Tu tiens ta cible de près. Ta nouvelle cible : 1 850 kcal par jour.'));
    expect(JOURNAL_MESSAGE.habitLine(0.88)).toBe('Ton habitude : tu manges en moyenne 12 % de moins que ta cible. Ta cible affichée en tient compte.');
  });

  it('refused: stays on the aligned target, offered again 4 weeks later at the earliest', () => {
    const s = runJournalWeek(aligned(28, (i) => ({ kcal: 1980, kg: 75 - 0.03 * i })), day(28), at(day(28)));
    const refused = declineMeasuredOffer(s, day(28), at(day(28)));
    expect(refused.meta.journalPath).toMatchObject({ method: 'aligned', offer: null, firstPlanDeclinedOn: day(28) });
    const later = live(refused, 29, 56, (i) => ({ kcal: 1980, kg: 75 - 0.03 * i }));
    expect(evaluateJournalWeek({ ...later, meta: { ...later.meta, journalPath: { ...later.meta.journalPath, lastEvaluatedOn: day(28) } } }, day(35), at(day(35)))).toEqual({ kind: 'evaluated', gate: null });
    expect(evaluateJournalWeek({ ...later, meta: { ...later.meta, journalPath: { ...later.meta.journalPath, lastEvaluatedOn: day(49) } } }, day(56), at(day(56))).kind).toBe('offer');
  });

  it('failed (floor blocking a strong under-reporter): stays on the aligned target without any message', () => {
    // 165 cm, 75 kg, logs 900 kcal and holds her weight: M in logged kcal under 1.10 x h x floor at any rate.
    const s = live(onboard(), 0, 13, () => ({ kcal: 900, kg: 75, adherence: 'major_deviation' }));
    const w = live(s, 14, 14, () => ({ kg: 75 }));
    const sw = switchToAlignedTarget(w, day(14), at(day(14)));
    if (!sw.ok) throw new Error(sw.reason);
    const t = live(live(sw.store, 14, 14, () => ({ kcal: 900 })), 15, 28, () => ({ kcal: 900, kg: 75 }));
    const week = evaluateJournalWeek(t, day(28), at(day(28)));
    expect(week).toMatchObject({ kind: 'failed', reason: 'no_feasible_speed' });
    const after = applyJournalWeek(t, week, day(28), at(day(28)));
    expect(after.meta.journalPath).toMatchObject({ method: 'aligned', offer: null });
    expect(after.plan).toEqual(t.plan);
    const e = after.meta.planEvents[after.meta.planEvents.length - 1];
    expect(e).toMatchObject({ rule: 'journal_measured_offer', status: 'failed', reason: 'no_feasible_speed', message: null, seen: true });
  });
});

describe('measured habit: in force, return to the aligned target and back (decisions 6 and 7)', () => {
  it('in force: balance of the journal, habit line, no declaration, no slider', () => {
    const s = measured();
    expect(journalBalanceLine(s)).toBe(`Équilibre d’après ton journal : ${formatKcal(s.plan?.maintenanceKcal ?? 0)} kcal par jour.`);
    expect(habitLine(s)).toBe('Ton habitude : tu manges en moyenne 10 % de plus que ta cible. Ta cible affichée en tient compte.');
    expect(adherenceAsked(s)).toBe(false);
    expect(suggestedAdherence(live(s, 29, 29, () => ({ kcal: 1980 })), day(29))).toBeNull();
    expect(balanceSliderAvailable(s)).toBe(false);
  });

  it('3 missed weigh-ins over 28 days: back to the aligned target with its message; back in the habit once the gate is met again, with a first-plan confirmation', () => {
    const s = live(measured(), 29, 35, (i) => ({ kcal: 1980, kg: i >= 31 && i <= 33 ? null : 75 - 0.03 * i }));
    const out = runJournalWeek(s, day(35), at(day(35)));
    expect(out.meta.journalPath).toMatchObject({ method: 'aligned', estimate: null, habit: null, lastExit: { date: day(35), reason: 'weighins' } });
    const e = out.meta.planEvents.find((x) => x.rule === 'journal_measured_exit');
    expect(e?.message).toBe('Il manque plusieurs pesées ces dernières semaines : ton plan repasse sur ta cible alignée. Il sera à nouveau calculé à partir de ton journal quand tu auras repris tes pesées quotidiennes.');
    expect(out.plan).toEqual(s.plan);
    // The gaps leave the 28-day window 28 days later: a first plan is offered again.
    const back = live(out, 36, 62, (i) => ({ kcal: 1980, kg: 75 - 0.03 * i }));
    const b1 = runJournalWeek({ ...back, meta: { ...back.meta, journalPath: { ...back.meta.journalPath, lastEvaluatedOn: day(55) } } }, day(62), at(day(62)));
    expect(b1.meta.journalPath.offer?.kind).toBe('first');
  });

  it('3 days without a usable journal: back to the aligned target with the logging message', () => {
    const s = live(measured(), 29, 35, (i) => ({ kcal: i === 30 || i === 32 || i === 34 ? null : 1980, kg: 75 - 0.03 * i }));
    const out = runJournalWeek(s, day(35), at(day(35)));
    expect(out.meta.journalPath.lastExit).toEqual({ date: day(35), reason: 'logging' });
    expect(out.meta.planEvents.find((x) => x.rule === 'journal_measured_exit')?.message).toBe(JOURNAL_MESSAGE.exitLogging);
  });

  it('later plans: surfaced by the rule of production applied to M / h, offered, confirmed or refused', () => {
    const gate = { met: true } as GateStatus;
    const ref = { tdeeKcal: 2000, interval80Width: 300, surfacedOn: day(0) };
    for (const [m, w, h] of [
      [2200, 330, 1.1],
      [2300, 330, 1.1],
      [2000, 200, 0.9],
    ] as const) {
      expect(jstarSurfaced(gate, m, w, h, ref, day(30))).toBe(shouldSurfaceRecalibration(gate, { tdeeKcal: m / h, interval80Width: w / h }, ref, day(30)));
    }
    expect(jstarSurfaced(gate, 2200, 330, 1.1, ref, day(30))).toBe(false);
    expect(jstarSurfaced(gate, 2300, 330, 1.1, ref, day(30))).toBe(true);
    // A refused later plan becomes the reference (as a seen recalibration): it is offered again only when it moves.
    const s = measured();
    const offer = { kind: 'update' as const, date: day(35), plan: s.plan as NonNullable<WheightyStore['plan']>, estimate: s.meta.journalPath.estimate as NonNullable<WheightyStore['meta']['journalPath']['estimate']>, habit: { h: 1.1, raw: 1.1, bound: null, days: 28 }, maintenanceKcal: 2310, interval80Width: 220, intakeKcal: 1900 };
    const refused = declineMeasuredOffer({ ...s, meta: { ...s.meta, journalPath: { ...s.meta.journalPath, offer } } }, day(35), at(day(35)));
    const ref2 = refused.meta.journalPath.surfacingReference;
    expect(ref2?.tdeeKcal).toBeCloseTo(2100, 9);
    expect(ref2?.interval80Width).toBeCloseTo(200, 9);
    expect(ref2?.surfacedOn).toBe(day(35));
    expect(refused.plan).toBe(s.plan);
  });

  it('floor x 1.10 on the displayed target: I* >= 1.10 x h x floor, T = I* / h', () => {
    const s = measured();
    const prepared = measuredInput(s, day(28));
    if (!prepared) throw new Error('no input');
    const floor = hardFloorKcal(s.plan?.reeKcal ?? 0, 'female');
    let found = false;
    for (let offset = 0; offset >= -1600 && !found; offset -= 100) {
      for (const h of [0.85, 1.2]) {
        const r = jstarPlanOf(s, day(28), { offsetKcal: offset, interval80: [offset - 100, offset + 100], interval95: [offset - 200, offset + 200] }, h, { request: PRODUCTION_SOLVER, input: prepared.input });
        if (!r.ok) continue;
        expect(r.iStar).toBeGreaterThanOrEqual(1.1 * h * floor - 1e-9);
        expect(r.target).toBeCloseTo(r.iStar / h, 12);
        expect(r.plan.calorieTarget).toBe(r.target);
        expect(r.plan.hardFloorKcal).toBeCloseTo(1.1 * floor, 9);
        if (r.floorActive) found = true;
      }
    }
    expect(found).toBe(true);
  });
});

describe('suggested adherence (decision 12)', () => {
  const at2000 = (kcal: number) => {
    const s = onboard(makeProfile({ goal: 'maintenance' }));
    const withTarget = { ...s, dailyLogs: s.dailyLogs.map((l) => ({ ...l, calorieTargetForDay: 2000 })) };
    return suggestedAdherence(logFood(withTarget, D0, kcal), D0)?.value ?? null;
  };
  it('under 10 %: plan respected; 10 to 25 %: minor; beyond 25 %: major, both ways', () => {
    expect([at2000(1810), at2000(2190)]).toEqual(['on_plan', 'on_plan']);
    expect([at2000(1800), at2000(2200), at2000(1500), at2000(2500)]).toEqual(['minor_deviation', 'minor_deviation', 'minor_deviation', 'minor_deviation']);
    expect([at2000(1490), at2000(2510)]).toEqual(['major_deviation', 'major_deviation']);
    expect(JOURNAL_MESSAGE.suggestedAdherence('minor_deviation')).toBe('D’après ton journal : écart léger. C’est bien ça ?');
    // No journal that day: nothing is suggested.
    expect(suggestedAdherence(onboard(), D0)).toBeNull();
  });
});

describe('interface of the journal path', () => {
  it('"ta dépense" is absent once the journal is read; the Plan tab hides the explanation of the current method', () => {
    for (const v of Object.values(JOURNAL_MESSAGE)) {
      const text = typeof v === 'function' ? (v as (...a: never[]) => string)(...([1.1, 1800] as never[])) : v;
      expect(text).not.toMatch(/dépense/);
    }
    const plan = readFileSync('src/screens/Plan.tsx', 'utf8');
    expect(plan).toMatch(/\{read \? null : \(\s*<button type="button" className="link" style=\{\{ marginTop: 14 \}\} onClick=\{\(\) => openSheet\('why', 'estimate'\)\}>/);
    expect(plan).toMatch(/balanceLine \? \(/);
    expect(readFileSync('src/screens/Tracking.tsx', 'utf8')).toMatch(/journalRead\(store\) \? JOURNAL_MESSAGE\.balanceLabel : 'Maintien estimé aujourd’hui'/);
    expect(readFileSync('src/screens/Today.tsx', 'utf8')).toMatch(/adherenceAsked\(store\) \? \(/);
  });
});

describe('versions and migration (schema 8)', () => {
  it('a schema-7 store loads without loss, with the method "cible supposée tenue"', () => {
    const s = aligned(20);
    const { journalPath: _p, ...meta7 } = s.meta;
    const raw7 = JSON.parse(JSON.stringify({ ...s, schemaVersion: 7, meta: meta7 })) as Record<string, unknown>;
    const m = migrateToCurrent(raw7, undefined, undefined, { nowIso: at(day(20)) });
    if (!m.ok) throw new Error(m.error);
    const v = validateStore(m.value);
    if ('error' in v) throw new Error(v.error);
    expect(v.clean).toBe(true);
    expect(v.store.schemaVersion).toBe(SCHEMA_VERSION);
    expect(v.store.meta.journalPath).toEqual(defaultJournalPath());
    const { meta, schemaVersion: _v, ...rest } = v.store;
    const { meta: _m, schemaVersion: _v7, ...rest7 } = s;
    expect(rest).toEqual(JSON.parse(JSON.stringify(rest7)));
    expect({ ...meta, journalPath: undefined }).toEqual({ ...JSON.parse(JSON.stringify(s.meta)), journalPath: undefined });
  });

  it('the journal path survives a save and a reload; an unreadable one is reported', () => {
    const s = measured();
    const v = validateStore(JSON.parse(JSON.stringify(s)));
    if ('error' in v) throw new Error(v.error);
    expect(v.clean).toBe(true);
    expect(v.store.meta.journalPath).toEqual(JSON.parse(JSON.stringify(s.meta.journalPath)));
    const bad = validateStore({ ...JSON.parse(JSON.stringify(s)), meta: { ...JSON.parse(JSON.stringify(s.meta)), journalPath: { method: 'other' } } });
    if ('error' in bad) throw new Error(bad.error);
    expect(bad.dropped).toContainEqual({ path: 'meta.journalPath', reason: 'invalid' });
    expect(bad.store.meta.journalPath).toEqual(defaultJournalPath());
  });
});

describe('correction of a past entry (decision D6)', () => {
  it('the next evaluation reads the corrected window; past targets stay as they were', () => {
    const s = live(onboard(), 0, 14, () => ({ kcal: 1800, kg: 75 }));
    const before = alignedTargetPreview(s, day(14));
    const entries = s.foodJournal.entries.filter((e) => e.date >= day(4) && e.date <= day(11));
    let c = s;
    for (const e of entries) {
      const r = replaceManualEntry(c, e.id, { date: e.date, consumedTime: e.consumedTime, food: { name: 'Repas', intake: { energyKcal: 2400, proteinG: null, carbsG: null, fatG: null }, grams: null } }, at(day(14)));
      if (!r.ok) throw new Error(r.reason);
      c = r.store;
    }
    expect(before).toMatchObject({ ok: true, target: { roundedKcal: 1800 } });
    expect(alignedTargetPreview(c, day(14))).toMatchObject({ ok: true, target: { medianKcal: 2400, roundedKcal: 2400 } });
    expect(c.dailyLogs).toEqual(s.dailyLogs);
    expect(c.plan).toEqual(s.plan);
  });
});
