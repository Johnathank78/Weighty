/**
 * UX pass 1, E, reworked with John (installed app on iPhone): sections side by side (carousel swipes, no back between
 * them), pages stacked above the page they were opened from (back and swipe to the right restore it), sheets closed by
 * back. Tested on the pure model (navModel.ts), and on the Android history reconciliation (navHistory.ts) with a
 * simulated browser history.
 */
import { describe, expect, it } from 'vitest';
import { activeTab, canGoBack, currentKey, currentScreen, initialNav, navBack, navCloseSheet, navGo, navOpenSheet, navSelectTab, navSwipe, rootKey, swipeActions, swipeCompletes, TABS } from '@/app/navModel';
import type { NavState, ScreenId, SwipeAction } from '@/app/navModel';
import { createHistorySync } from '@/app/navHistory';
import type { HistoryLike } from '@/app/navHistory';
import { nextStep, visibleScreens } from '@/domain/onboarding';

/** A signed-in user on Today (after the splash). */
const home = (): NavState => navGo(initialNav('splash'), 'today', { replace: true });

/** Back until nothing is left to go back to; the screens met on the way. */
function backTrail(s: NavState): ScreenId[] {
  const out: ScreenId[] = [];
  let cur: NavState | null = s;
  while ((cur = navBack(cur)) !== null) out.push(currentScreen(cur));
  return out;
}

/** Swipes to the right (finger moving right) carried through, until none is possible; the screens met. */
function swipeRightTrail(s: NavState): ScreenId[] {
  const out: ScreenId[] = [];
  let cur = s;
  for (let action = swipeActions(cur).right; action; action = swipeActions(cur).right) {
    cur = navSwipe(cur, action);
    out.push(currentScreen(cur));
  }
  return out;
}

class FakeHistory implements HistoryLike {
  entries: unknown[] = [null];
  index = 0;
  left = false;
  pending: unknown[] = [];
  get state() {
    return this.entries[this.index];
  }
  pushState(data: unknown) {
    this.entries = [...this.entries.slice(0, this.index + 1), data];
    this.index++;
  }
  replaceState(data: unknown) {
    this.entries[this.index] = data;
  }
  back() {
    if (this.index === 0) {
      this.left = true;
      return;
    }
    this.index--;
    this.pending.push(this.state);
  }
}

/** The provider's Android wiring, without React. */
function android(start: NavState) {
  const h = new FakeHistory();
  let state = start;
  const sync = createHistorySync(h, () => {
    state = navBack(state) ?? state;
    sync.sync(canGoBack(state));
  });
  const flush = () => {
    while (h.pending.length > 0) sync.onPop(h.pending.shift());
  };
  sync.init();
  sync.sync(canGoBack(state));
  return {
    h,
    get state() {
      return state;
    },
    act(fn: (s: NavState) => NavState | null) {
      state = fn(state) ?? state;
      sync.sync(canGoBack(state));
      flush();
    },
    systemBack() {
      h.back();
      flush();
    },
  };
}

describe('sections: a carousel, no back between them', () => {
  it('on the root of a section, a swipe goes to the section beside it; nothing left of Today, nothing right of Profil', () => {
    const at = (tab: (typeof TABS)[number]) => navSelectTab(home(), tab);
    expect(swipeActions(home()).right).toBeNull();
    expect(swipeActions(home()).left).toMatchObject({ kind: 'tab', tab: 'plan', reveal: 'plan', revealKey: rootKey('plan') });
    expect(swipeActions(at('plan')).right).toMatchObject({ kind: 'tab', tab: 'today' });
    expect(swipeActions(at('plan')).left).toMatchObject({ kind: 'tab', tab: 'suivi' });
    expect(swipeActions(at('profil')).left).toBeNull();
    // Swiping to the left all the way: every section in the bar's order.
    let s = home();
    const seen: ScreenId[] = [currentScreen(s)];
    for (let a = swipeActions(s).left; a; a = swipeActions(s).left) {
      s = navSwipe(s, a);
      seen.push(currentScreen(s));
    }
    expect(seen).toEqual([...TABS]);
  });

  it('back does nothing on the root of a section, Today included', () => {
    for (const tab of TABS) {
      const s = navSelectTab(home(), tab);
      expect(navBack(s)).toBeNull();
      expect(canGoBack(s)).toBe(false);
    }
  });

  it('a section chosen in the bar slides in from its side, and closes the pages stacked in the one left', () => {
    let s = navGo(home(), 'journal');
    s = navSelectTab(s, 'suivi');
    expect(s).toMatchObject({ tab: 'suivi', stack: [], transition: 'tab-next' });
    expect(navSelectTab(s, 'plan').transition).toBe('tab-prev');
    // The section on display, from one of its pages: back to its root.
    expect(navSelectTab(navGo(s, 'history'), 'suivi')).toMatchObject({ stack: [], transition: 'pop' });
  });

  it('each section root keeps its own scroll identity', () => {
    expect(currentKey(home())).toBe(rootKey('today'));
    expect(currentKey(navSelectTab(home(), 'suivi'))).toBe(rootKey('suivi'));
  });
});

describe('pages stacked above the page they were opened from', () => {
  it('"Détail" from Today: back or a swipe to the right restores Today; a swipe to the left does nothing', () => {
    const s = navGo(home(), 'macros');
    expect(currentScreen(s)).toBe('macros');
    expect(activeTab(s)).toBe('today');
    expect(swipeActions(s)).toEqual({ right: { kind: 'back', reveal: 'today', revealKey: rootKey('today'), under: null }, left: null });
    expect(navSwipe(s, swipeActions(s).right as SwipeAction)).toMatchObject({ tab: 'today', stack: [], transition: 'none' });
    expect(backTrail(s)).toEqual(['today']);
  });

  it('a page A opening a section B: back restores A, never the section on the left of B', () => {
    // Today, the status line: Analyse.
    const fromToday = navGo(home(), 'analyse');
    expect(currentScreen(fromToday)).toBe('analyse');
    expect(activeTab(fromToday)).toBe('analyse');
    expect(swipeActions(fromToday).right).toMatchObject({ kind: 'back', reveal: 'today' });
    expect(swipeRightTrail(fromToday)).toEqual(['today']);
    // The first swipe restores A; from A's root, the carousel goes on as usual.
    // Profil, a goal change applied: Plan. Back: Profil, not Today (the section on the left of Plan).
    const fromProfil = navGo(navSelectTab(home(), 'profil'), 'plan');
    expect(swipeRightTrail(fromProfil)[0]).toBe('profil');
    expect(swipeActions(fromProfil).right).toMatchObject({ kind: 'back', reveal: 'profil' });
    expect(backTrail(fromProfil)).toEqual(['profil']);
  });

  it('nested pages close one at a time, each swipe uncovering the one under it', () => {
    let s = navSelectTab(home(), 'profil');
    s = navGo(navGo(s, 'data'), 'delete');
    // The copy of "Mes données" drawn under the swipe names the page under it in its back button.
    expect(swipeActions(s).right).toMatchObject({ reveal: 'data', revealKey: currentKey(navBack(s) as NavState), under: 'profil' });
    expect(swipeRightTrail(s)).toEqual(['data', 'profil', 'analyse', 'suivi', 'plan', 'today']);
    expect(backTrail(s)).toEqual(['data', 'profil']);
    // "Annuler" on the deletion screen goes back to the data screen (already in the stack): no duplicate.
    expect(navGo(s, 'data', { replace: true }).stack).toEqual(['data']);
  });

  it('a finished path to a section root starts afresh on that section (recalibration applied, import)', () => {
    const s = navGo(navGo(navSelectTab(home(), 'analyse'), 'recalibration'), 'today', { replace: true });
    expect(s).toMatchObject({ tab: 'today', stack: [] });
    expect(canGoBack(s)).toBe(false);
  });

  it('Historique is stacked above Suivi', () => {
    const s = navGo(navSelectTab(home(), 'suivi'), 'history');
    expect(swipeRightTrail(s)[0]).toBe('suivi');
    expect(backTrail(s)).toEqual(['suivi']);
  });
});

describe('sheets', () => {
  it('back closes the sheet first; the page does not swipe while a sheet is open (the sheet takes the swipe)', () => {
    const s = navOpenSheet(navGo(home(), 'journal'), 'foodEdit');
    expect(swipeActions(s)).toEqual({ right: null, left: null });
    const closed = navBack(s) as NavState;
    expect(closed.sheet).toBeNull();
    expect(currentScreen(closed)).toBe('journal');
    expect(navCloseSheet(navOpenSheet(home(), 'weigh')).sheet).toBeNull();
  });
});

describe('onboarding', () => {
  function throughOnboarding(): NavState {
    let s = navGo(navGo(initialNav('splash'), 'intro', { replace: true }), 'onboarding');
    for (;;) {
      const next = nextStep(s.draft);
      if (next === 'result') break;
      s = { ...s, draft: { ...s.draft, step: next } };
    }
    return s;
  }

  it('back and the swipe to the right go to the previous step, then to the intro', () => {
    const s = throughOnboarding();
    const steps = visibleScreens(s.draft);
    const trail: string[] = [];
    let cur: NavState = s;
    for (let a = swipeActions(cur).right; a; a = swipeActions(cur).right) {
      expect(a).toEqual({ kind: 'back', reveal: null, revealKey: null });
      cur = navSwipe(cur, a);
      // Nothing drawn in advance there: the previous step comes in from the left.
      expect(cur.transition).toBe('pop');
      trail.push(currentScreen(cur) === 'onboarding' ? cur.draft.step : currentScreen(cur));
    }
    expect(trail).toEqual([...steps.slice(0, -1).reverse(), 'intro']);
  });

  it('once the plan is started, nothing leads back to the onboarding', () => {
    let s = navGo(navGo(navGo(initialNav('splash'), 'intro', { replace: true }), 'onboarding'), 'result');
    expect(currentScreen(navBack(s) as NavState)).toBe('onboarding');
    s = navGo(s, 'today', { replace: true });
    expect(s.flow).toEqual([]);
    expect(canGoBack(s)).toBe(false);
    expect(swipeActions(s).right).toBeNull();
  });

  it('editing the profile from Profil: stacked above Profil, and applying drops it', () => {
    let s = navSelectTab(home(), 'profil');
    s = navGo(navGo(s, 'onboarding'), 'result');
    s = navGo(s, 'plan', { replace: true });
    expect(s).toMatchObject({ tab: 'plan', stack: [] });
    expect(canGoBack(s)).toBe(false);
  });
});

describe('Android back button (history)', () => {
  it('sections create no entry; a stacked page or a sheet adds one, back closes it', () => {
    const app = android(home());
    for (const tab of ['plan', 'suivi', 'analyse', 'profil', 'today'] as const) app.act((s) => navSelectTab(s, tab));
    expect(app.h.entries).toHaveLength(1);
    app.act((s) => navGo(s, 'journal'));
    app.act((s) => navOpenSheet(s, 'food'));
    expect(app.h.entries).toHaveLength(2);
    app.systemBack();
    expect(app.state.sheet).toBeNull();
    expect(currentScreen(app.state)).toBe('journal');
    app.systemBack();
    expect(currentScreen(app.state)).toBe('today');
    expect(app.h.index).toBe(0);
    expect(app.h.left).toBe(false);
  });

  it('on a section root, the back button leaves the app (Android)', () => {
    const app = android(navSelectTab(home(), 'suivi'));
    app.systemBack();
    expect(app.h.left).toBe(true);
  });
});

describe('swipe release', () => {
  it('goes through past a third of the width or on a flick, slides back otherwise', () => {
    expect(swipeCompletes(130, 0.1, 375)).toBe(true);
    expect(swipeCompletes(110, 0.1, 375)).toBe(false);
    expect(swipeCompletes(40, 0.8, 375)).toBe(true);
    expect(swipeCompletes(10, 2, 375)).toBe(false);
  });
});
