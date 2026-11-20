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
import { addDays } from '@/science/dates';
import { addWeight, setAdherence } from '@/domain/engine';
import * as profiles from '../helpers/verificationProfiles';
import { at, firstRecalibrationProfile, history, personalTargetRecalibrationProfile, recalibratedGateClosedProfile, verificationProfile } from '../helpers/verificationProfiles';

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
    expect(firstRecalibrationAutoOpenDue(store, TODAY, state, false)).toBe(true);
    // Still computing for the current store: it waits.
    expect(firstRecalibrationAutoOpenDue(store, TODAY, state, true)).toBe(false);
    // Opened (answered or not): never again by itself.
    const once = markFirstRecalibrationOpened(store, TODAY);
    expect(once.meta.firstRecalibrationOpenedOn).toBe(TODAY);
    expect(firstRecalibrationAutoOpenDue(once, addDays(TODAY, 1), state, false)).toBe(false);
    expect(markFirstRecalibrationOpened(once, addDays(TODAY, 3))).toBe(once);
  });

  it('later recalibrations stay discreet: none once a recalibration was applied', () => {
    const store = opened(recalibratedGateClosedProfile(TODAY));
    expect(hasAppliedRecalibration(store)).toBe(true);
    const fake = { ...(stateOf(store) as NonNullable<ReturnType<typeof stateOf>>), surfaced: true };
    expect(firstRecalibrationAutoOpenDue(store, TODAY, fake, false)).toBe(false);
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
    expect(firstRecalibrationAutoOpenDue(store, TODAY, state, false)).toBe(false);
    const taken = takeOverPersonalTarget(store, state, TODAY, at(TODAY));
    expect(taken.plan?.source).toBe('recalibrated');
    const event = taken.meta.planEvents[taken.meta.planEvents.length - 1];
    expect(event?.rule).toBe('personal_target_takeover');
    // After the takeover a recalibration was applied: nothing opens by itself either.
    expect(firstRecalibrationAutoOpenDue(taken, TODAY, state, false)).toBe(false);
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
