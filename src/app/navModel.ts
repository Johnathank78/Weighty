/**
 * Navigation model (UX pass 1, E, reworked with John): pure state and transitions, no browser, no gesture. The provider
 * (navigation.tsx) keeps this state; the swipe layer (SwipeView.tsx) asks `swipeActions` what a horizontal swipe may do.
 *
 * - Sections (the five tabs) are side by side, like a carousel: on the root of a section, swiping moves to the section on
 *   its left or right; there is nothing left of Today. There is no "back" between sections.
 * - A page opened from a page A (journal from Today, Analyse from the status line of Today, Plan after a goal change...)
 *   is stacked above A, whatever its section: back, the app's back button or a swipe to the right, restores A.
 * - A sheet is closed by back or by a swipe to the right.
 * - Outside the sections (no plan yet), a flow: splash, intro, onboarding, result. Back in the onboarding goes to the
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
/** Order of the sections, left to right, as in the bottom bar. */
export const TABS: readonly TabId[] = ['today', 'plan', 'suivi', 'analyse', 'profil'];

/**
 * How the screen on display was reached, for its entrance animation: a page stacked ('push') or restored ('pop'), a
 * section on the right ('tab-next') or on the left ('tab-prev') chosen in the bar; 'none' after a swipe (the gesture has
 * already moved the screens) or at start.
 */
export type NavTransition = 'push' | 'pop' | 'tab-next' | 'tab-prev' | 'none';

export type NavState = {
  mode: 'flow' | 'tabs';
  /** Screens outside the sections, bottom first (mode 'flow'); empty in mode 'tabs'. */
  flow: ScreenId[];
  /** Section at the bottom of the stack. */
  tab: TabId;
  /** Pages stacked above the root of `tab`, bottom first. */
  stack: ScreenId[];
  sheet: SheetId | null;
  /** Onboarding answers and current step: the step is part of the navigation (back = previous step). */
  draft: OnboardingDraft;
  transition: NavTransition;
};

export function isTab(screen: ScreenId): screen is TabId {
  return (TABS as readonly ScreenId[]).includes(screen);
}

/** Screens that start the flow outside the sections afresh. */
const FLOW_ROOTS: readonly ScreenId[] = ['splash', 'intro'];

export function initialNav(screen: ScreenId = 'splash'): NavState {
  const base: NavState = { mode: 'flow', flow: [screen], tab: 'today', stack: [], sheet: null, draft: emptyDraft(), transition: 'none' };
  return isTab(screen) ? { ...base, mode: 'tabs', flow: [], tab: screen } : base;
}

/** The screen on display (under the sheet, if any). */
export function currentScreen(s: NavState): ScreenId {
  if (s.mode === 'flow') return s.flow[s.flow.length - 1] ?? 'splash';
  return s.stack[s.stack.length - 1] ?? s.tab;
}

/** Section lit in the bottom bar: the section shown, or the one the stacked pages were opened from. */
export function activeTab(s: NavState): TabId | null {
  if (s.mode === 'flow') return null;
  const screen = currentScreen(s);
  return isTab(screen) ? screen : s.tab;
}

/** Identity of a screen of the stack (index 0: the section's root), so each keeps its own scroll position. */
export function keyAt(s: NavState, index: number): string {
  if (s.mode === 'flow') return `f:${index}:${s.flow[index] ?? 'splash'}`;
  return index === 0 ? rootKey(s.tab) : `t:${s.tab}:${index}:${s.stack[index - 1] ?? s.tab}`;
}

export const rootKey = (tab: TabId): string => `t:${tab}:0:${tab}`;

export function currentKey(s: NavState): string {
  return keyAt(s, s.mode === 'flow' ? s.flow.length - 1 : s.stack.length);
}

/** Identities of every screen still open, plus every section root (their scroll positions are kept). */
export function liveKeys(s: NavState): string[] {
  if (s.mode === 'flow') return s.flow.map((_, i) => keyAt(s, i));
  return [...TABS.map(rootKey), ...s.stack.map((_, i) => keyAt(s, i + 1))];
}

const tabDirection = (from: TabId, to: TabId): NavTransition => (TABS.indexOf(to) > TABS.indexOf(from) ? 'tab-next' : 'tab-prev');

/**
 * Programmatic navigation (`go`), from the page on display.
 * - 'splash' and 'intro' restart the flow outside the sections.
 * - A screen already in the stack (the root included): back to it.
 * - A section root with `replace`: a path is finished (plan applied, onboarding done, data imported): that section alone.
 * - Otherwise the screen is stacked above the page on display (`replace`: in its place), sections included, so that back
 *   restores the page it was opened from.
 */
export function navGo(s: NavState, screen: ScreenId, options: { replace?: boolean } = {}): NavState {
  const base = { ...s, sheet: null };
  if (FLOW_ROOTS.includes(screen)) return { ...base, mode: 'flow', flow: [screen], tab: 'today', stack: [], transition: 'none' };
  if (s.mode === 'flow') {
    if (isTab(screen)) return { ...base, mode: 'tabs', flow: [], tab: screen, stack: [], transition: 'none' };
    const at = s.flow.indexOf(screen);
    if (at >= 0) return { ...base, flow: s.flow.slice(0, at + 1), transition: 'pop' };
    return { ...base, flow: options.replace && s.flow.length > 1 ? [...s.flow.slice(0, -1), screen] : [...s.flow, screen], transition: 'push' };
  }
  if (screen === s.tab) return { ...base, stack: [], transition: s.stack.length > 0 ? 'pop' : 'none' };
  const at = s.stack.indexOf(screen);
  if (at >= 0) return { ...base, stack: s.stack.slice(0, at + 1), transition: 'pop' };
  if (isTab(screen) && options.replace) return { ...base, tab: screen, stack: [], transition: tabDirection(s.tab, screen) };
  const stack = options.replace && s.stack.length > 0 ? [...s.stack.slice(0, -1), screen] : [...s.stack, screen];
  return { ...base, stack, transition: 'push' };
}

/** Bottom bar: that section, at its root; the stacked pages are closed. */
export function navSelectTab(s: NavState, tab: TabId): NavState {
  if (s.mode !== 'tabs') return navGo(s, tab);
  if (tab === s.tab && s.stack.length === 0) return { ...s, sheet: null };
  const lit = activeTab(s) ?? s.tab;
  return { ...s, sheet: null, tab, stack: [], transition: tab === lit ? 'pop' : tabDirection(lit, tab) };
}

export function navOpenSheet(s: NavState, sheet: SheetId): NavState {
  return { ...s, sheet };
}

export function navCloseSheet(s: NavState): NavState {
  return s.sheet === null ? s : { ...s, sheet: null };
}

/**
 * Back, whatever its origin (the app's back buttons, Android's back, a swipe to the right on a stacked page). Null:
 * nothing to go back to (the root of a section, the first screen of the flow): nothing happens.
 */
export function navBack(s: NavState): NavState | null {
  if (s.sheet !== null) return { ...s, sheet: null };
  if (currentScreen(s) === 'onboarding') {
    const prev = previousStep(s.draft);
    if (prev !== 'exit') return { ...s, draft: { ...s.draft, step: prev }, transition: 'pop' };
  }
  if (s.mode === 'flow') return s.flow.length > 1 ? { ...s, flow: s.flow.slice(0, -1), transition: 'pop' } : null;
  return s.stack.length > 0 ? { ...s, stack: s.stack.slice(0, -1), transition: 'pop' } : null;
}

/** The page a back would restore from a stacked page (for the label of its back button); null otherwise. */
export function screenUnder(s: NavState): ScreenId | null {
  if (s.mode !== 'tabs' || s.stack.length === 0) return null;
  return s.stack[s.stack.length - 2] ?? s.tab;
}

export function canGoBack(s: NavState): boolean {
  return navBack(s) !== null;
}

/**
 * What a horizontal swipe does from the screen on display (no sheet open: a sheet handles its own swipe).
 * `reveal`: the screen that slides in (drawn under or beside the one leaving), null when it cannot be drawn in advance
 * (an onboarding step, the flow outside the sections); `revealKey`: its identity, for its scroll position.
 */
export type SwipeAction =
  | { kind: 'back'; reveal: ScreenId | null; revealKey: string | null; /** The page under the revealed one (its back label). */ under?: ScreenId | null }
  | { kind: 'tab'; tab: TabId; reveal: ScreenId; revealKey: string };

export function swipeActions(s: NavState): { right: SwipeAction | null; left: SwipeAction | null } {
  if (s.sheet !== null) return { right: null, left: null };
  if (s.mode === 'flow' || currentScreen(s) === 'onboarding') return { right: canGoBack(s) ? { kind: 'back', reveal: null, revealKey: null } : null, left: null };
  if (s.stack.length > 0) {
    const reveal = s.stack[s.stack.length - 2] ?? s.tab;
    const under = s.stack.length >= 2 ? (s.stack[s.stack.length - 3] ?? s.tab) : null;
    return { right: { kind: 'back', reveal, revealKey: keyAt(s, s.stack.length - 1), under }, left: null };
  }
  const i = TABS.indexOf(s.tab);
  const side = (tab: TabId | undefined): SwipeAction | null => (tab ? { kind: 'tab', tab, reveal: tab, revealKey: rootKey(tab) } : null);
  return { right: side(TABS[i - 1]), left: side(TABS[i + 1]) };
}

/** A swipe carried through: the screens already moved under the finger, so no entrance animation. */
export function navSwipe(s: NavState, action: SwipeAction): NavState {
  if (action.kind === 'tab') return { ...s, sheet: null, tab: action.tab, stack: [], transition: 'none' };
  const back = navBack(s);
  if (!back) return s;
  // Without a screen drawn in advance (onboarding, flow), the previous one comes in from the left.
  return { ...back, transition: action.reveal === null ? 'pop' : 'none' };
}

/**
 * Whether a released swipe goes through: past a third of the width, or a flick. Otherwise the screen slides back.
 * `dx`: distance in the swipe's direction (px), `velocity`: px per ms in that direction.
 */
export function swipeCompletes(dx: number, velocity: number, width: number): boolean {
  return dx > width / 3 || (velocity > 0.45 && dx > 24);
}
