/**
 * UX pass 1, E: native-like navigation, tested on the pure model (navModel.ts) and on the history reconciliation
 * (navHistory.ts) with a simulated browser history: entries, back, forward, and leaving the app below the first entry.
 */
import { describe, expect, it } from 'vitest';
import { canGoBack, currentKey, currentScreen, initialNav, liveKeys, navBack, navCloseSheet, navGo, navOpenSheet, navSelectTab } from '@/app/navModel';
import type { NavState, ScreenId } from '@/app/navModel';
import { createHistorySync } from '@/app/navHistory';
import type { HistoryLike } from '@/app/navHistory';
import { nextStep, visibleScreens } from '@/domain/onboarding';

/** A signed-in user on Today (after the splash). */
const home = (): NavState => navGo(initialNav('splash'), 'today', { replace: true });

/** Back until the app would be left; the screens met on the way. */
function backTrail(s: NavState): ScreenId[] {
  const out: ScreenId[] = [];
  let cur: NavState | null = s;
  while ((cur = navBack(cur)) !== null) out.push(currentScreen(cur));
  return out;
}

/**
 * Browser history as the app sees it: a list of entries, `back` fires popstate on the previous one, and a back from the
 * first entry leaves the app. The popstate is delivered when `flush` is called, as a browser delivers it later.
 */
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
  forward() {
    if (this.index < this.entries.length - 1) {
      this.index++;
      this.pending.push(this.state);
    }
  }
}

/** The provider's wiring, without React: state, history sync after each change, system back through popstate. */
function harness(start: NavState) {
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
    /** An in-app navigation. */
    act(fn: (s: NavState) => NavState | null) {
      state = fn(state) ?? state;
      sync.sync(canGoBack(state));
      flush();
    },
    /** The Android back button, or the browser's. */
    systemBack() {
      h.back();
      flush();
    },
  };
}

describe('E1. tabs', () => {
  it('changing tab creates no history entry', () => {
    const app = harness(home());
    for (const tab of ['plan', 'suivi', 'analyse', 'profil', 'suivi', 'plan'] as const) app.act((s) => navSelectTab(s, tab));
    // Base + one top entry, whatever the number of tab changes.
    expect(app.h.entries).toHaveLength(2);
    expect(currentScreen(app.state)).toBe('plan');
  });

  it('each tab keeps its open sub-screen and its own scroll identity', () => {
    let s = navGo(home(), 'journal');
    s = navSelectTab(s, 'plan');
    s = navGo(s, 'macros');
    const macrosKey = currentKey(s);
    s = navSelectTab(s, 'today');
    expect(currentScreen(s)).toBe('journal');
    s = navSelectTab(s, 'plan');
    expect(currentScreen(s)).toBe('macros');
    expect(currentKey(s)).toBe(macrosKey);
    expect(liveKeys(s)).toEqual(expect.arrayContaining(['t:today:0:today', 't:today:1:journal', 't:plan:0:plan', 't:plan:1:macros']));
    // The active tab again goes back to its root.
    expect(currentScreen(navSelectTab(s, 'plan'))).toBe('plan');
  });
});

describe('E2 and E3. sub-screens and sheets', () => {
  it('a sub-screen is closed by back, from the system button as from the app', () => {
    const app = harness(home());
    app.act((s) => navGo(s, 'journal'));
    expect(app.h.entries).toHaveLength(2);
    app.systemBack();
    expect(currentScreen(app.state)).toBe('today');
    expect(app.h.left).toBe(false);
    app.act((s) => navGo(s, 'journal'));
    app.act(navBack);
    expect(currentScreen(app.state)).toBe('today');
    // Nothing left to close: the top entry is removed, the next back leaves the app.
    expect(app.h.index).toBe(0);
  });

  it('a sheet is closed by back, before the screen under it', () => {
    const app = harness(home());
    app.act((s) => navGo(s, 'journal'));
    app.act((s) => navOpenSheet(s, 'foodEdit'));
    app.systemBack();
    expect(app.state.sheet).toBeNull();
    expect(currentScreen(app.state)).toBe('journal');
    app.systemBack();
    expect(currentScreen(app.state)).toBe('today');
    app.act((s) => navOpenSheet(s, 'weigh'));
    app.act(navCloseSheet);
    expect(app.state.sheet).toBeNull();
    expect(app.h.index).toBe(0);
  });

  it('nested sub-screens close one at a time', () => {
    let s = navSelectTab(home(), 'profil');
    s = navGo(navGo(s, 'data'), 'delete');
    expect(backTrail(s)).toEqual(['data', 'profil', 'today']);
    // "Annuler" on the deletion screen goes back to the data screen (already in the stack): no duplicate.
    expect(navGo(s, 'data', { replace: true }).stacks.profil).toEqual(['data']);
  });
});

describe('E4 and E5. roots', () => {
  it('back on the root of another tab goes to Today, as Today was left', () => {
    let s = navGo(home(), 'journal');
    s = navSelectTab(s, 'suivi');
    expect(backTrail(s)).toEqual(['journal', 'today']);
  });

  it('back on the root of Today leaves the app', () => {
    const app = harness(home());
    expect(canGoBack(app.state)).toBe(false);
    expect(app.h.entries).toHaveLength(1);
    app.systemBack();
    expect(app.h.left).toBe(true);
  });

  it('from any tab, back comes to Today and then leaves', () => {
    const app = harness(home());
    app.act((s) => navSelectTab(s, 'analyse'));
    app.systemBack();
    expect(currentScreen(app.state)).toBe('today');
    expect(app.h.left).toBe(false);
    app.systemBack();
    expect(app.h.left).toBe(true);
  });

  it('a forward after a back changes nothing', () => {
    const app = harness(home());
    app.act((s) => navGo(s, 'journal'));
    app.systemBack();
    app.h.forward();
    while (app.h.pending.length > 0) app.h.pending.shift();
    expect(currentScreen(app.state)).toBe('today');
  });
});

describe('E6. onboarding', () => {
  /** Intro, then the onboarding walked forward to its last step. */
  function throughOnboarding(): NavState {
    let s = navGo(navGo(initialNav('splash'), 'intro', { replace: true }), 'onboarding');
    for (;;) {
      const next = nextStep(s.draft);
      if (next === 'result') break;
      s = { ...s, draft: { ...s.draft, step: next } };
    }
    return s;
  }

  it('back goes to the previous step, then to the intro, then leaves', () => {
    const s = throughOnboarding();
    const steps = visibleScreens(s.draft);
    const trail: string[] = [];
    let cur: NavState | null = s;
    while ((cur = navBack(cur)) !== null) trail.push(currentScreen(cur) === 'onboarding' ? cur.draft.step : currentScreen(cur));
    expect(trail).toEqual([...steps.slice(0, -1).reverse(), 'intro']);
  });

  it('the result goes back to the last step; once the plan is started, back never leads to the onboarding again', () => {
    const app = harness(initialNav('splash'));
    app.act((s) => navGo(s, 'intro', { replace: true }));
    app.act((s) => navGo(s, 'onboarding'));
    app.act((s) => navGo(s, 'result'));
    app.systemBack();
    expect(currentScreen(app.state)).toBe('onboarding');
    app.act((s) => navGo(s, 'result'));
    // "Commencer": the plan is applied, Today replaces the flow.
    app.act((s) => navGo(s, 'today', { replace: true }));
    expect(app.state.flow).toEqual([]);
    expect(canGoBack(app.state)).toBe(false);
    app.systemBack();
    expect(app.h.left).toBe(true);
    expect(currentScreen(app.state)).toBe('today');
  });

  it('editing the profile from Profil: back walks the steps, then returns to Profil; applying drops the flow', () => {
    let s = navSelectTab(home(), 'profil');
    s = navGo({ ...s, draft: { ...s.draft, mode: 'edit', step: 'age' } }, 'onboarding');
    expect(currentScreen(s)).toBe('onboarding');
    const first = navBack(s);
    expect(first && currentScreen(first)).toBe(visibleScreens(s.draft).indexOf('age') > 0 ? 'onboarding' : 'profil');
    s = navGo(s, 'result');
    s = navGo(s, 'plan', { replace: true });
    expect(s.stacks.profil).toEqual([]);
    expect(backTrail(s)).toEqual(['today']);
  });
});
