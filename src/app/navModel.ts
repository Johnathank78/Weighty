/**
 * Navigation model (UX pass 1, E): pure state and transitions, no browser. The provider (navigation.tsx) keeps this state
 * and mirrors it into the browser history (navHistory.ts); the system back button, the browser back and the app's back
 * buttons all go through `navBack`.
 *
 * - Tabs: each tab keeps its own stack of sub-screens above its root. Changing tab creates no history entry and keeps the
 *   sub-screen left open in each tab.
 * - Sub-screens (journal, macros, preferences...) and sheets are closed by back.
 * - Back on the root of a tab other than Today goes to Today; back on the root of Today leaves the app (`null`).
 * - Outside the tabs (no plan yet), a flow stack: splash, intro, onboarding, result. Back in the onboarding goes to the
 *   previous step. Once the onboarding is done the flow is dropped, so back never leads to it again.
 */
import { emptyDraft, previousStep } from '@/domain/onboarding';
import type { OnboardingDraft } from '@/domain/onboarding';

export type ScreenId =
  | 'splash'
  | 'intro'
  | 'onboarding'
  | 'result'
  | 'today'
  | 'plan'
  | 'macros'
  | 'suivi'
  | 'analyse'
  | 'recalibration'
  | 'profil'
  | 'params'
  | 'data'
  | 'delete'
  | 'reached'
  | 'journal'
  | 'history';

export type SheetId = 'balance' | 'weigh' | 'adherence' | 'steps' | 'why' | 'goal' | 'food' | 'foodEdit' | 'weighOptions' | 'productConsent' | 'productClear';

export type TabId = 'today' | 'plan' | 'suivi' | 'analyse' | 'profil';
export const TABS: readonly TabId[] = ['today', 'plan', 'suivi', 'analyse', 'profil'];

/** How the screen on display was reached, for its entrance animation. */
export type NavTransition = 'push' | 'pop' | 'tab' | 'none';

export type NavState = {
  mode: 'flow' | 'tabs';
  /** Screens outside the tabs, bottom first (mode 'flow'); empty in mode 'tabs'. */
  flow: ScreenId[];
  tab: TabId;
  /** Per tab, the sub-screens open above its root, bottom first. */
  stacks: Record<TabId, ScreenId[]>;
  sheet: SheetId | null;
  /** Onboarding answers and current step: the step is part of the navigation (back = previous step). */
  draft: OnboardingDraft;
  transition: NavTransition;
};

const EMPTY_STACKS = (): Record<TabId, ScreenId[]> => ({ today: [], plan: [], suivi: [], analyse: [], profil: [] });

export function isTab(screen: ScreenId): screen is TabId {
  return (TABS as readonly ScreenId[]).includes(screen);
}

/** Screens that start the flow outside the tabs afresh. */
const FLOW_ROOTS: readonly ScreenId[] = ['splash', 'intro'];

export function initialNav(screen: ScreenId = 'splash'): NavState {
  const base: NavState = { mode: 'flow', flow: [screen], tab: 'today', stacks: EMPTY_STACKS(), sheet: null, draft: emptyDraft(), transition: 'none' };
  return isTab(screen) ? { ...base, mode: 'tabs', flow: [], tab: screen } : base;
}

/** The screen on display (under the sheet, if any). */
export function currentScreen(s: NavState): ScreenId {
  if (s.mode === 'flow') return s.flow[s.flow.length - 1] ?? 'splash';
  const stack = s.stacks[s.tab];
  return stack[stack.length - 1] ?? s.tab;
}

/** Identity of the screen on display: its place in the stacks, so each keeps its own scroll position. */
export function currentKey(s: NavState): string {
  if (s.mode === 'flow') return `f:${s.flow.length - 1}:${currentScreen(s)}`;
  return `t:${s.tab}:${s.stacks[s.tab].length}:${currentScreen(s)}`;
}

/** Identities of every screen still open somewhere (the scroll positions worth keeping). */
export function liveKeys(s: NavState): string[] {
  if (s.mode === 'flow') return s.flow.map((screen, i) => `f:${i}:${screen}`);
  return TABS.flatMap((tab) => [`t:${tab}:0:${tab}`, ...s.stacks[tab].map((screen, i) => `t:${tab}:${i + 1}:${screen}`)]);
}

/**
 * Programmatic navigation (`go`). A tab root opens that tab at its root (with `replace`, the sub-screens of the tab left
 * are closed: that path is finished). 'splash' and 'intro' restart the flow outside the tabs. Any other screen is pushed
 * on the stack on display, or, when already in it, the stack is popped back to it; `replace` swaps the top instead.
 */
export function navGo(s: NavState, screen: ScreenId, options: { replace?: boolean } = {}): NavState {
  const base = { ...s, sheet: null };
  if (isTab(screen)) {
    const stacks = { ...s.stacks, [screen]: [] as ScreenId[] };
    if (options.replace && s.mode === 'tabs') stacks[s.tab] = [];
    const transition: NavTransition = s.mode === 'flow' ? 'none' : screen !== s.tab ? 'tab' : s.stacks[s.tab].length > 0 ? 'pop' : 'none';
    return { ...base, mode: 'tabs', flow: [], tab: screen, stacks, transition };
  }
  if (FLOW_ROOTS.includes(screen)) return { ...base, mode: 'flow', flow: [screen], stacks: EMPTY_STACKS(), tab: 'today', transition: 'none' };
  const list = s.mode === 'flow' ? s.flow : s.stacks[s.tab];
  const at = list.indexOf(screen);
  let next: ScreenId[];
  let transition: NavTransition = 'push';
  if (at >= 0) {
    next = list.slice(0, at + 1);
    transition = 'pop';
  } else if (options.replace && list.length > (s.mode === 'flow' ? 1 : 0)) next = [...list.slice(0, -1), screen];
  else next = [...list, screen];
  return s.mode === 'flow' ? { ...base, flow: next, transition } : { ...base, stacks: { ...s.stacks, [s.tab]: next }, transition };
}

/** Bottom navigation: another tab shows it as it was left; the active tab again goes back to its root. */
export function navSelectTab(s: NavState, tab: TabId): NavState {
  if (s.mode !== 'tabs') return navGo(s, tab);
  if (tab === s.tab) return { ...s, sheet: null, stacks: { ...s.stacks, [tab]: [] }, transition: s.stacks[tab].length > 0 ? 'pop' : 'none' };
  return { ...s, sheet: null, tab, transition: 'tab' };
}

export function navOpenSheet(s: NavState, sheet: SheetId): NavState {
  return { ...s, sheet };
}

export function navCloseSheet(s: NavState): NavState {
  return s.sheet === null ? s : { ...s, sheet: null };
}

/**
 * Back, whatever its origin (system button, browser, the app's own back buttons). Null: nothing is left to close inside
 * the app (root of Today, or first screen of the flow), the back leaves the app.
 */
export function navBack(s: NavState): NavState | null {
  if (s.sheet !== null) return { ...s, sheet: null };
  if (currentScreen(s) === 'onboarding') {
    const prev = previousStep(s.draft);
    if (prev !== 'exit') return { ...s, draft: { ...s.draft, step: prev }, transition: 'pop' };
  }
  if (s.mode === 'flow') return s.flow.length > 1 ? { ...s, flow: s.flow.slice(0, -1), transition: 'pop' } : null;
  const stack = s.stacks[s.tab];
  if (stack.length > 0) return { ...s, stacks: { ...s.stacks, [s.tab]: stack.slice(0, -1) }, transition: 'pop' };
  if (s.tab !== 'today') return { ...s, tab: 'today', transition: 'tab' };
  return null;
}

export function canGoBack(s: NavState): boolean {
  return navBack(s) !== null;
}
