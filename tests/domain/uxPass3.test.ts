/**
 * UX pass 3 (report 50): one block per point. Point 1 (the Suivi chart) is tested in trackingChart.test.ts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { autoOpenAllowed, initialNav, navGo, navOpenSheet } from '@/app/navModel';
import { applyRecalibration, computeCalibrationState, hasAppliedRecalibration, markRecalibrationSeen } from '@/domain/engine';
import { firstRecalibrationAutoOpenDue, firstRecalibrationShown, markFirstRecalibrationOpened } from '@/domain/firstRecalibration';
import { runDailyChecks } from '@/domain/planSafety';
import { takeOverPersonalTarget } from '@/domain/personalTarget';
import { DEFAULT_META, SCHEMA_VERSION } from '@/domain/types';
import type { WheightyStore } from '@/domain/types';
import { migrateToCurrent } from '@/persistence/migrations';
import { validateStore } from '@/persistence/schema';
import { exportStore, parseImport } from '@/persistence/exportImport';
import { addDays } from '@/science/dates';
import { addWeight, setAdherence } from '@/domain/engine';
import * as profiles from '../helpers/verificationProfiles';
import { computePersonalTakeover, previewAppPlanReturn, returnToAppPlan } from '@/domain/personalTarget';
import { planChangeOptions } from '@/domain/planChange';
import { periodicReplanDue } from '@/domain/engine';
import { weighFirstInvitation } from '@/domain/weighFirst';
import { WEIGH_FIRST_MESSAGE } from '@/domain/planMessages';
import { journalCardsWait, maintenanceComparisonText, recalibrationReady, todayStatusTitle, analysisView } from '@/domain/views';
import { personalTargetLine, choosePersonalTarget } from '@/domain/personalTarget';
import { measuredOfferView } from '@/domain/journalPath';
import { formatKcal } from '@/domain/format';
import { JOURNAL_MESSAGE } from '@/domain/planMessages';
import { inPlanHistory, planHistory, PLAN_HISTORY_RULES } from '@/domain/planHistory';
import { PLAN_EVENT_RULES } from '@/domain/types';
import type { PlanEvent } from '@/domain/types';
import { at, firstPlanProfile, pauseWithoutWeighInProfile, firstRecalibrationProfile, history, oldWeighInChangeProfile, personalTargetProfile, planHistoryProfile, personalTargetRecalibrationProfile, recalibratedGateClosedProfile, verificationProfile } from '../helpers/verificationProfiles';

/** Every verification profile (1 to 11 of reports 45 to 49, and those of this pass), for the migration and the round trip. */
const ALL_PROFILES = Object.entries(profiles).filter(([name, f]) => name.endsWith('Profile') && name !== 'verificationProfile' && typeof f === 'function') as Array<[string, (today: string) => WheightyStore]>;

const TODAY = '2026-11-20';
const opened = (s: WheightyStore, day = TODAY) => runDailyChecks(s, day, at(day));
const stateOf = (s: WheightyStore, day = TODAY) => computeCalibrationState(s, day, at(day));

describe('2. the first recalibration (E2)', () => {
  it('schema 12: a date in meta, null by default; migration 11 -> 12 without loss', () => {
    expect(SCHEMA_VERSION).toBe(12);
    expect(DEFAULT_META.firstRecalibrationOpenedOn).toBeNull();
    const store = opened(firstRecalibrationProfile(TODAY));
    const { firstRecalibrationOpenedOn: _, ...meta11 } = store.meta;
    const v11 = JSON.parse(JSON.stringify({ ...store, schemaVersion: 11, meta: meta11 })) as Record<string, unknown>;
    const migrated = migrateToCurrent(v11);
    if (!migrated.ok) throw new Error(migrated.error);
    expect(migrated.fromVersion).toBe(11);
    const v = validateStore(migrated.value);
    if ('error' in v) throw new Error(v.error);
    expect(v.clean).toBe(true);
    expect(v.store).toEqual(JSON.parse(JSON.stringify(store)));
    // The date round-trips once set.
    const marked = markFirstRecalibrationOpened(store, TODAY);
    const back = validateStore(JSON.parse(JSON.stringify(marked)));
    expect('store' in back && back.store.meta.firstRecalibrationOpenedOn).toBe(TODAY);
  });

  it('4.6: migration 11 -> 12 without loss on every verification profile', () => {
    expect(ALL_PROFILES.length).toBeGreaterThanOrEqual(15);
    for (const [name, build] of ALL_PROFILES) {
      const store = build(TODAY);
      const { firstRecalibrationOpenedOn: _, ...meta11 } = store.meta;
      const migrated = migrateToCurrent(JSON.parse(JSON.stringify({ ...store, schemaVersion: 11, meta: meta11 })));
      if (!migrated.ok) throw new Error(`${name}: ${migrated.error}`);
      const v = validateStore(migrated.value);
      if ('error' in v) throw new Error(`${name}: ${v.error}`);
      expect(v.clean, name).toBe(true);
      expect(v.store, name).toEqual(JSON.parse(JSON.stringify(store)));
    }
  });

  it('opens by itself once per store, when a first recalibration is shown and the calibration is ready', () => {
    const store = opened(firstRecalibrationProfile(TODAY));
    const state = stateOf(store);
    expect(hasAppliedRecalibration(store)).toBe(false);
    expect(state?.surfaced).toBe(true);
    expect(firstRecalibrationShown(store, state)).toBe(true);
    expect(firstRecalibrationAutoOpenDue(store, state, false)).toBe(true);
    // Still computing for the current store: it waits.
    expect(firstRecalibrationAutoOpenDue(store, state, true)).toBe(false);
    // Opened (answered or not): never again by itself.
    const once = markFirstRecalibrationOpened(store, TODAY);
    expect(once.meta.firstRecalibrationOpenedOn).toBe(TODAY);
    expect(firstRecalibrationAutoOpenDue(once, state, false)).toBe(false);
    expect(markFirstRecalibrationOpened(once, addDays(TODAY, 3))).toBe(once);
  });

  it('later recalibrations stay discreet: none once a recalibration was applied', () => {
    const store = opened(recalibratedGateClosedProfile(TODAY));
    expect(hasAppliedRecalibration(store)).toBe(true);
    const fake = { ...(stateOf(store) as NonNullable<ReturnType<typeof stateOf>>), surfaced: true };
    expect(firstRecalibrationAutoOpenDue(store, fake, false)).toBe(false);
    // The first recalibration applied: the next one is no longer "first".
    const first = opened(firstRecalibrationProfile(TODAY));
    const st = stateOf(first);
    if (!st) throw new Error('state');
    const applied = applyRecalibration(first, st, TODAY, at(TODAY));
    if (!applied.ok) throw new Error(applied.reason);
    expect(firstRecalibrationShown(applied.store, { ...st, surfaced: true })).toBe(false);
  });

  it('2b: on a personal target, no screen: the takeover and its short message', () => {
    const store = opened(personalTargetRecalibrationProfile(TODAY));
    const state = stateOf(store);
    expect(store.plan?.source).toBe('personal_target');
    expect(state?.surfaced).toBe(true);
    expect(firstRecalibrationAutoOpenDue(store, state, false)).toBe(false);
    const taken = takeOverPersonalTarget(store, state, TODAY, at(TODAY));
    expect(taken.plan?.source).toBe('recalibrated');
    const event = taken.meta.planEvents[taken.meta.planEvents.length - 1];
    expect(event?.rule).toBe('personal_target_takeover');
    // After the takeover a recalibration was applied: nothing opens by itself either.
    expect(firstRecalibrationAutoOpenDue(taken, state, false)).toBe(false);
  });

  it('2c: not marked seen, the recalibration stays shown the next days; marked seen, it is not shown again (05 s12 unchanged)', () => {
    let s = opened(firstRecalibrationProfile(TODAY));
    const state = stateOf(s);
    if (!state) throw new Error('state');
    const seen = markRecalibrationSeen(s, state, TODAY);
    for (let d = 1; d <= 2; d++) {
      const day = addDays(TODAY, d);
      s = opened(setAdherence(addWeight(s, { date: day, weightKg: 72.9 - 0.1 * d }, at(day)), day, 'on_plan'), day);
      expect(stateOf(s, day)?.surfaced).toBe(true);
    }
    expect(stateOf(seen)?.surfaced).toBe(false);
  });

  it('where it may open: in the sections, no sheet, no decision screen, never over the onboarding', () => {
    expect(autoOpenAllowed(initialNav('splash'))).toBe(false);
    expect(autoOpenAllowed(navGo(initialNav('splash'), 'onboarding'))).toBe(false);
    const today = initialNav('today');
    expect(autoOpenAllowed(today)).toBe(true);
    expect(autoOpenAllowed(navGo(today, 'history'))).toBe(true);
    expect(autoOpenAllowed(navOpenSheet(today, 'weigh'))).toBe(false);
    for (const screen of ['recalibration', 'reached', 'delete', 'onboarding'] as const) expect(autoOpenAllowed(navGo(today, screen))).toBe(false);
    // Stacked above the section in progress (navigation model of 29/09): back restores it.
    const stacked = navGo(today, 'recalibration');
    expect(stacked).toMatchObject({ tab: 'today', stack: ['recalibration'] });
  });

  it('the screen opened by itself: no mark at its opening nor at "Plus tard", both logged with auto: true', () => {
    const src = readFileSync('src/screens/Tracking.tsx', 'utf8');
    expect(src).toMatch(/const auto = live && autoOpened;/);
    expect(src).toMatch(/if \(live && !auto && !personal && !marked\.current/);
    expect(src).toMatch(/event: 'screen_opened', \.\.\.\(auto \? \{ auto: true \} : \{\}\)/);
    expect(src).toMatch(/event: 'later', \.\.\.\(auto \? \{ auto: true \} : \{\}\)/);
    const app = readFileSync('src/app/App.tsx', 'utf8');
    expect(app).toMatch(/markFirstRecalibrationOpened\(s, today\)/);
    expect(app).toMatch(/openAuto\('recalibration'\)/);
  });

  it('2d (reported, not corrected): D5 when the first recalibration stays shown several days without being applied', () => {
    // Onboarding 28 days ago without a warm start, a weigh-in and "Plan respecté" a day: on day 28 the periodic replan is due
    // and the first recalibration is ready. The screen opened by itself, "Plus tard": it is never marked seen.
    const { store, start } = history(verificationProfile('Test D5'), TODAY, 28);
    let s = store;
    for (let i = 1; i <= 28; i++) s = setAdherence(addWeight(s, { date: addDays(start, i), weightKg: 75 - 0.1 * i }, at(addDays(start, i))), addDays(start, i), 'on_plan');
    const createdAt = s.plan?.createdAt;
    const target = s.plan?.calorieTarget;
    const days: Array<{ day: number; surfaced: boolean | undefined; deferredOn: string | null; checkedOn: string | null; target: number | undefined; sameplan: boolean }> = [];
    for (let d = 0; d <= 3; d++) {
      const day = addDays(TODAY, d);
      if (d > 0) s = setAdherence(addWeight(s, { date: day, weightKg: 72.2 - 0.1 * d }, at(day)), day, 'on_plan');
      s = opened(s, day);
      days.push({ day: d, surfaced: stateOf(s, day)?.surfaced, deferredOn: s.meta.periodicReplanDeferredOn, checkedOn: s.meta.periodicReplanCheckedOn, target: s.plan?.calorieTarget, sameplan: s.plan?.createdAt === createdAt });
    }
    // Day 0: the replan waits (D5). Day 1: it runs on its cycle, without an applied estimate ('no_snapshot'): the plan stays,
    // the check date moves, so the next replan is due 28 days later. Days 1 to 3: the first recalibration is still shown.
    expect(days[0]).toMatchObject({ surfaced: true, deferredOn: TODAY, checkedOn: null, sameplan: true, target });
    expect(days[1]).toMatchObject({ surfaced: true, deferredOn: TODAY, checkedOn: addDays(TODAY, 1), sameplan: true, target });
    expect(days[2]).toMatchObject({ surfaced: true, checkedOn: addDays(TODAY, 1), sameplan: true, target });
    expect(days[3]).toMatchObject({ surfaced: true, checkedOn: addDays(TODAY, 1), sameplan: true, target });
  });
});

describe('3. the history of the plan (E3)', () => {
  it('lists the changes of the trace, most recent first, with the date, the target before -> after and the cause', () => {
    const store = opened(planHistoryProfile(TODAY));
    const entries = planHistory(store, TODAY);
    expect(entries.map((e) => e.cause)).toEqual(['Recalcul régulier', 'Tu as changé de vitesse ou d’objectif', 'Mise à jour avec tes pesées', 'Recalibration (détails non conservés)', 'Ton premier plan']);
    // Most recent first: the dates never increase down the list.
    for (let i = 1; i < entries.length; i++) expect((entries[i]?.date ?? '') <= (entries[i - 1]?.date ?? '')).toBe(true);
    const [replan, speed, recal, rebuilt, first] = entries;
    expect(first).toMatchObject({ beforeKcal: null, backfilled: false });
    expect(first?.targetText).toMatch(/^\d[\d\s]* kcal par jour$/);
    expect(speed?.targetText).toMatch(/→/);
    expect(speed?.details[1]?.replace(/\s/g, ' ')).toMatch(/^Vitesse : 0,5 % par semaine → 0,75 % par semaine\.$/);
    expect(recal?.details[0]).toMatch(/^Maintien estimé : .* → .* kcal par jour\.$/);
    expect(replan?.beforeKcal).toBe(speed?.afterKcal);
    // The entry rebuilt by the migration: no plans, no details.
    expect(rebuilt).toMatchObject({ backfilled: true, beforeKcal: null, afterKcal: null, targetText: null, details: [] });
    // The source is the trace alone: the same list from the trace, whatever the rest of the store.
    expect(planHistory({ ...store, weights: [], calibrationSnapshots: [], dailyLogs: [] }, TODAY)).toEqual(entries);
  });

  it('kept and left out, rule by rule', () => {
    const summary = { createdAt: 'x', source: 'initial', goal: 'loss', calorieTarget: 1800, stepTarget: 7000, weeklyRateTarget: 0.005, requestedWeeklyRate: 0.005, maintenanceKcal: 2300, targetWeightKg: 64 } as const;
    const entry = (rule: PlanEvent['rule'], over: Partial<PlanEvent> = {}): PlanEvent => ({ id: rule, date: TODAY, rule, status: 'applied', before: summary, after: summary, message: null, seen: true, ...over });
    for (const rule of PLAN_EVENT_RULES) expect(inPlanHistory(entry(rule)), rule).toBe((PLAN_HISTORY_RULES as readonly string[]).includes(rule));
    expect(inPlanHistory(entry('recalibration', { status: 'failed' }))).toBe(false);
    expect(inPlanHistory(entry('periodic_replan', { after: null }))).toBe(false);
    expect(inPlanHistory(entry('recalibration', { before: null, after: null, backfilled: true }))).toBe(true);
    // An offer of the measured habit carries the plan offered, not applied: left out.
    expect(inPlanHistory(entry('journal_measured_offer'))).toBe(false);
  });

  it('empty: a short sentence; a date of another year carries the year', () => {
    const store = opened(firstRecalibrationProfile(TODAY));
    const onlyOther = { ...store, meta: { ...store.meta, planEvents: store.meta.planEvents.filter((e) => e.rule !== 'onboarding') } };
    expect(planHistory(onlyOther, TODAY)).toEqual([]);
    const old = { ...store, meta: { ...store.meta, planEvents: store.meta.planEvents.map((e) => ({ ...e, date: '2025-12-31' })) } };
    expect(planHistory(old, TODAY)[0]?.dateText).toBe('31 décembre 2025');
    const src = readFileSync('src/screens/PlanHistory.tsx', 'utf8');
    expect(src).toMatch(/PLAN_HISTORY_MESSAGE\.empty/);
    expect(src).toMatch(/planHistory\(store, today\)/);
  });
});

describe('4. "Revenir au plan de Wheighty" (E4)', () => {
  it('offered in "Changer de plan" only while a personal target is in force', () => {
    const personal = opened(personalTargetProfile(TODAY));
    expect(planChangeOptions(personal, TODAY)?.map((o) => o.id)).toContain('return');
    expect(planChangeOptions(opened(firstRecalibrationProfile(TODAY)), TODAY)?.map((o) => o.id) ?? []).not.toContain('return');
    expect(previewAppPlanReturn(opened(firstRecalibrationProfile(TODAY)), TODAY)).toBeNull();
  });

  it('the computation of the takeover, on the estimate in force (no new rule)', () => {
    // The takeover profile: its first recalibration is ready. The same estimate applied beforehand, the return gives the plan
    // the takeover gives (the plan of the usual method, at the rate the personal target gives, brought within the limits).
    const store = opened(personalTargetRecalibrationProfile(TODAY));
    const state = stateOf(store);
    const takeover = computePersonalTakeover(store, state, TODAY, at(TODAY));
    if (!takeover || takeover.status !== 'applied') throw new Error('takeover');
    const withEstimate: WheightyStore = { ...store, calibrationSnapshots: [...store.calibrationSnapshots, takeover.snapshot] };
    const preview = previewAppPlanReturn(withEstimate, TODAY);
    if (!preview?.ok) throw new Error('preview');
    expect({ ...preview.plan, source: 'recalibrated' }).toEqual(takeover.next);
    expect(preview.profile).toEqual(takeover.profile);
    expect(preview.detail).toEqual(takeover.event.personalTarget);
    // Before any recalibration: the estimate of the onboarding (no snapshot applied, the population prior).
    const early = opened(personalTargetProfile(TODAY));
    const p = previewAppPlanReturn(early, TODAY);
    if (!p?.ok) throw new Error('preview');
    // No snapshot applied: the population estimate, rebuilt at the current trend weight (a few kcal from the onboarding's).
    expect(early.calibrationSnapshots.some((x) => x.appliedAt !== undefined)).toBe(false);
    expect(Math.abs(p.plan.maintenanceKcal - (early.plan?.maintenanceKcal ?? 0))).toBeLessThan(30);
    expect(p.beforeKcal).toBe(early.plan?.calorieTarget);
    expect(p.plan.source).toBe('initial');
    // A valid speed and never under the floor.
    expect(p.plan.calorieTarget).toBeGreaterThanOrEqual(p.plan.hardFloorKcal ?? 0);
    expect(p.plan.weeklyRateTarget).toBeGreaterThanOrEqual(0.002);
    expect(p.plan.weeklyRateTarget).toBeLessThanOrEqual(0.01);
  });

  it('confirmed: the personal target ends, G2 and the replan every 28 days apply again, one trace entry', () => {
    const store = opened(personalTargetProfile(TODAY));
    expect(periodicReplanDue({ ...store, weights: store.weights }, addDays(TODAY, 40))).toBe(false);
    const r = returnToAppPlan(store, TODAY, at(TODAY));
    if (!r.ok) throw new Error(r.reason);
    expect(r.store.plan?.source).toBe('initial');
    expect(r.store.plan?.personalTarget).toBeUndefined();
    expect(periodicReplanDue(r.store, addDays(TODAY, 27))).toBe(false);
    expect(periodicReplanDue(r.store, addDays(TODAY, 28))).toBe(true);
    const event = r.store.meta.planEvents[r.store.meta.planEvents.length - 1];
    expect(event).toMatchObject({ rule: 'personal_target_return', status: 'applied', message: null, seen: true });
    expect(event?.before?.calorieTarget).toBe(store.plan?.calorieTarget);
    expect(event?.after?.calorieTarget).toBe(r.store.plan?.calorieTarget);
    expect(planHistory(r.store, TODAY)[0]?.cause).toBe('Retour au plan de Wheighty');
    // Twice: nothing to go back from.
    expect(returnToAppPlan(r.store, TODAY, at(TODAY))).toMatchObject({ ok: false, reason: 'no_personal_target' });
  });
});

describe('5. weigh in first (E5)', () => {
  it('invites to weigh in when the last valid weigh-in is more than 7 days old (the reading of D3), never otherwise', () => {
    const store = opened(oldWeighInChangeProfile(TODAY));
    const invitation = weighFirstInvitation(store, TODAY);
    expect(invitation).toMatchObject({ title: 'Pèse-toi d’abord ?', days: 10 });
    // 8 days: invited; 7 days: not (age strictly over 7).
    const last = store.weights[store.weights.length - 1]?.date as string;
    expect(weighFirstInvitation(store, addDays(last, 8))?.days).toBe(8);
    expect(weighFirstInvitation(store, addDays(last, 7))).toBeNull();
    // A weigh-in today: no invitation any more (back to the choice after "Me peser d'abord").
    expect(weighFirstInvitation(addWeight(store, { date: TODAY, weightKg: 73.9 }, at(TODAY)), TODAY)).toBeNull();
    // No weigh-in at all: invited.
    expect(weighFirstInvitation({ ...store, weights: [] }, TODAY)?.days).toBeNull();
  });

  it('the rule of 03/10: a title of 6 words at most, a line of 90 characters at most, no em dash', () => {
    for (const days of [null, 8, 10, 365]) {
      const i = weighFirstInvitation({ ...opened(oldWeighInChangeProfile(TODAY)), ...(days === null ? { weights: [] } : {}) }, days === null ? TODAY : addDays(TODAY, days - 10));
      expect(i?.title.split(/\s+/).length).toBeLessThanOrEqual(6);
      expect(i?.line.length ?? 0).toBeLessThanOrEqual(90);
    }
    expect(JSON.stringify(WEIGH_FIRST_MESSAGE)).not.toContain('—');
    expect(readFileSync('src/domain/planMessages.ts', 'utf8')).not.toContain('—');
  });

  it('nothing is blocked: the sheets of "Je souhaite changer de plan" and of the goal show it, "Continuer" goes on', () => {
    for (const file of ['src/screens/PlanChangeSheet.tsx', 'src/screens/Account.tsx']) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).toMatch(/<WeighFirst sheet="(planChange|goal)" onContinue=\{\(\) => setContinued\(true\)\} \/>/);
    }
    // The weigh-in comes back to the choice once saved.
    expect(readFileSync('src/screens/DailySheets.tsx', 'utf8')).toMatch(/weighSaved\(\);/);
    const first = readFileSync('src/components/WeighFirst.tsx', 'utf8');
    expect(first).toMatch(/event: 'shown'/);
    expect(first).toMatch(/event: 'weigh'/);
    expect(first).toMatch(/event: 'continue'/);
  });
});

describe('6. texts (E6)', () => {
  it('6a: "première" becomes "prochaine" once a recalibration was applied (personal target, aligned target)', () => {
    const base = opened(firstRecalibrationProfile(TODAY));
    const st = stateOf(base);
    if (!st) throw new Error('state');
    const applied = applyRecalibration(base, st, TODAY, at(TODAY));
    if (!applied.ok) throw new Error(applied.reason);
    const before = choosePersonalTarget(base, TODAY, 1700, at(TODAY));
    const after = choosePersonalTarget(applied.store, TODAY, 1700, at(TODAY));
    if (!before.ok || !after.ok) throw new Error('choose');
    expect(personalTargetLine(before.store)).toMatch(/à ta première recalibration\.$/);
    expect(personalTargetLine(after.store)).toMatch(/à ta prochaine recalibration\.$/);
    expect(JOURNAL_MESSAGE.alignedLock(3)).toMatch(/après la première recalibration, dans 3 jours/);
    expect(JOURNAL_MESSAGE.alignedLock(3, true)).toMatch(/après la prochaine recalibration, dans 3 jours/);
    expect(JOURNAL_MESSAGE.alignedLock(0, true)).toMatch(/après la prochaine recalibration\.$/);
  });

  it('6b: the rest of the day of Aujourd’hui is rounded as the target (display only)', () => {
    expect(formatKcal(1808.4)).toBe(formatKcal(1810));
    expect(formatKcal(1689.4)).toBe(formatKcal(1690));
    expect(readFileSync('src/screens/Today.tsx', 'utf8')).toMatch(/JOURNAL_GAUGE_TEXT\.remaining\(formatKcal\(kcalGauge\.remaining\)\)/);
  });

  it('6c: held back by D3, the status line says what the message of D3 says', () => {
    const pause = opened(pauseWithoutWeighInProfile(TODAY));
    const state = stateOf(pause);
    expect(state?.blockedByStaleWeighIn).toBe(true);
    expect(todayStatusTitle(pause, TODAY, state, false)).toBe('Ton plan attend une pesée.');
    // With a recent weigh-in, as before.
    const fresh = opened(addWeight(pause, { date: TODAY, weightKg: 73.8 }, at(TODAY)));
    expect(todayStatusTitle(fresh, TODAY, stateOf(fresh), false)).not.toBe('Ton plan attend une pesée.');
  });

  it('6d: profile 3, both true at once: one message at a time, the recalibration first', () => {
    const store = opened(firstPlanProfile(TODAY));
    const state = stateOf(store);
    expect(state?.surfaced).toBe(true);
    expect(measuredOfferView(store)?.short.title).toBe('Plan calé sur ton journal');
    expect(recalibrationReady(store, state, false)).toBe(true);
    expect(journalCardsWait(store, state)).toBe(true);
    // Seen (no longer shown), the offer comes back, still unanswered.
    const seen = markRecalibrationSeen(store, state as NonNullable<typeof state>, TODAY);
    expect(journalCardsWait(seen, stateOf(seen))).toBe(false);
    expect(measuredOfferView(seen)?.short.title).toBe('Plan calé sur ton journal');
  });

  it('6e: each maintenance with its weight, no sentence presenting their difference as a correction', () => {
    const store = opened(firstRecalibrationProfile(TODAY));
    const view = analysisView(store, stateOf(store));
    if (!view) throw new Error('view');
    expect(view.startAndToday?.start).toEqual({ kcal: store.meta.initialMaintenanceKcal, kg: store.meta.initialWeightKg });
    const text = maintenanceComparisonText(view, 'metric')?.replace(/\s/g, ' ');
    expect(text).toMatch(/^Au départ : [\d ]+ kcal à \d+,\d kg\. Aujourd’hui : [\d ]+ kcal à \d+,\d kg\.$/);
    expect(readFileSync('src/screens/Tracking.tsx', 'utf8')).not.toMatch(/depuis l’estimation initiale/);
    const takeover = takeOverPersonalTarget(opened(personalTargetRecalibrationProfile(TODAY)), stateOf(opened(personalTargetRecalibrationProfile(TODAY))), TODAY, at(TODAY));
    const message = takeover.meta.planEvents.at(-1)?.message?.replace(/\s/g, ' ') ?? '';
    expect(message).toMatch(/^Au départ : [\d ]+ kcal à \d+,\d kg\. Aujourd’hui : [\d ]+ kcal à \d+,\d kg\. À partir de maintenant/);
    expect(message).not.toMatch(/montrent|estimation de départ/);
  });
});

describe('7. defects of report 48 (E7)', () => {
  it('a step forward of the onboarding is a page pushed, whatever the previous gesture', () => {
    const src = readFileSync('src/app/navigation.tsx', 'utf8');
    expect(src).toMatch(/return draft\.step !== s\.draft\.step \? \{ \.\.\.s, draft, transition: 'push' \} : \{ \.\.\.s, draft \};/);
  });

  it('a sheet gives the focus to its dialog, not to its handle', () => {
    const src = readFileSync('src/components/BottomSheet.tsx', 'utf8');
    expect(src).toMatch(/window\.setTimeout\(\(\) => sheetRef\.current\?\.focus\(\{ preventScroll: true \}\), 50\)/);
    expect(src).toMatch(/role="dialog"/);
  });
});

describe('4.6 export, import, export on profiles 12 to 16', () => {
  it('the store comes back identical (productSearchEnabled is set to false by the import, as always)', () => {
    const NEW = [firstRecalibrationProfile, personalTargetRecalibrationProfile, planHistoryProfile, profiles.pauseAndProjectionProfile, oldWeighInChangeProfile];
    for (const build of NEW) {
      const store = opened(build(TODAY));
      const text = exportStore(store, at(TODAY));
      const back = parseImport(text);
      if (!back.ok) throw new Error(`${build.name}: ${back.error}`);
      expect(back.store, build.name).toEqual({ ...JSON.parse(JSON.stringify(store)), preferences: { ...store.preferences, productSearchEnabled: false } });
      expect(exportStore(back.store, at(TODAY)), build.name).toBe(exportStore({ ...store, preferences: { ...store.preferences, productSearchEnabled: false } }, at(TODAY)));
    }
  });
});
