import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { OnboardingDraft, OnboardingScreenId } from '@/domain/onboarding';
import { activeTab, canGoBack, currentKey, currentScreen, initialNav, liveKeys, navBack, navCloseSheet, navGo, navOpenSheet, navSelectTab, navSwipe, screenUnder, swipeActions } from './navModel';
import { BACK_LABEL } from './copy';
import type { NavState, NavTransition, ScreenId, SheetId, SwipeAction, TabId } from './navModel';
import { createHistorySync } from './navHistory';
import type { HistorySync } from './navHistory';

export type { ScreenId, SheetId, SwipeAction, TabId } from './navModel';

export type WhyTopic = 'estimate' | 'macros' | 'recalibration' | 'nodata';

type Toast = { id: number; text: string; action?: { label: string; run: () => void } };

type NavValue = {
  screen: ScreenId;
  sheet: SheetId | null;
  /** Section lit in the bottom bar, null outside the sections. */
  tab: TabId | null;
  /** Identity of the screen on display and how it was reached, for its entrance animation. */
  screenKey: string;
  transition: NavTransition;
  /** What a horizontal swipe may do from the screen on display (SwipeView). */
  swipe: { right: SwipeAction | null; left: SwipeAction | null };
  /** A swipe carried through by the gesture layer. */
  completeSwipe: (action: SwipeAction) => void;
  /** Last scroll position of a screen, for drawing it in advance under a swipe. */
  scrollOf: (key: string) => number;
  /** Text of the back button of a stacked page: the page it restores ("‹ Aujourd’hui"). */
  backLabel: string;
  whyTopic: WhyTopic;
  go: (screen: ScreenId, options?: { replace?: boolean }) => void;
  /** Bottom bar: that section, at its root. */
  selectTab: (tab: TabId) => void;
  back: () => void;
  openSheet: (sheet: SheetId, topic?: WhyTopic) => void;
  closeSheet: () => void;
  toast: Toast | null;
  showToast: (text: string, action?: Toast['action']) => void;
  dismissToast: () => void;
  draft: OnboardingDraft;
  setDraft: (fn: (d: OnboardingDraft) => OnboardingDraft) => void;
};

const NavContext = createContext<NavValue | null>(null);

/**
 * iPhone and iPad: the installed app goes back through its own history with the system edge swipe, moving the whole page,
 * bottom bar included. The app therefore never adds a history entry there: the swipes are the app's own (SwipeView).
 * Elsewhere (Android), one history entry above the base catches the system back button while something can be closed.
 */
function systemSwipesHistory(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Navigation without a router (UX pass 1, E): the state and its transitions live in navModel.ts; each screen gets its
 * scroll position back when shown again; the history is used on Android only, for its back button (navHistory.ts).
 */
export function NavigationProvider({ initialScreen, children }: { initialScreen: ScreenId; children: ReactNode }) {
  const [state, setState] = useState<NavState>(() => initialNav(initialScreen));
  const [whyTopic, setWhyTopic] = useState<WhyTopic>('estimate');
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | null>(null);
  const stateRef = useRef(state);
  const scrolls = useRef(new Map<string, number>());
  const history = useRef<HistorySync | null>(null);

  /** Every navigation: the scroll position of the screen left is kept, then the state changes. */
  const navigate = useCallback((fn: (s: NavState) => NavState | null) => {
    scrolls.current.set(currentKey(stateRef.current), window.scrollY);
    setState((s) => fn(s) ?? s);
  }, []);

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    if (systemSwipesHistory()) {
      // The entry the app opens on stays alone: nothing for the system swipe to go back to.
      window.history.replaceState({ wheighty: 'base' }, '');
      return;
    }
    const sync = createHistorySync(window.history, () => navigate(navBack));
    history.current = sync;
    sync.init();
    sync.sync(canGoBack(stateRef.current));
    const onPop = (e: PopStateEvent) => sync.onPop(e.state);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [navigate]);

  const key = currentKey(state);
  // The screen shown again gets its scroll position back; a new one starts at the top. Closed screens are forgotten.
  useLayoutEffect(() => {
    stateRef.current = state;
    const live = new Set(liveKeys(state));
    for (const k of scrolls.current.keys()) if (!live.has(k)) scrolls.current.delete(k);
    window.scrollTo({ top: scrolls.current.get(key) ?? 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    stateRef.current = state;
    history.current?.sync(canGoBack(state));
  }, [state]);

  const go = useCallback((next: ScreenId, options?: { replace?: boolean }) => navigate((s) => navGo(s, next, options)), [navigate]);
  const selectTab = useCallback(
    (tab: TabId) => {
      const s = stateRef.current;
      // The section on display, at its root: back to the top of the page, as in a native app.
      if (s.mode === 'tabs' && s.tab === tab && s.stack.length === 0 && s.sheet === null) window.scrollTo({ top: 0, behavior: 'smooth' });
      else navigate((cur) => navSelectTab(cur, tab));
    },
    [navigate],
  );
  const back = useCallback(() => navigate(navBack), [navigate]);
  const completeSwipe = useCallback((action: SwipeAction) => navigate((s) => navSwipe(s, action)), [navigate]);
  const scrollOf = useCallback((k: string) => scrolls.current.get(k) ?? 0, []);
  const openSheet = useCallback((next: SheetId, topic?: WhyTopic) => {
    if (topic) setWhyTopic(topic);
    setState((s) => navOpenSheet(s, next));
  }, []);
  const closeSheet = useCallback(() => setState(navCloseSheet), []);

  const dismissToast = useCallback(() => setToast(null), []);
  const showToast = useCallback((text: string, action?: Toast['action']) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, ...(action ? { action } : {}) });
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 8000 : 2800);
  }, []);

  const setDraft = useCallback((fn: (d: OnboardingDraft) => OnboardingDraft) => setState((s) => ({ ...s, draft: fn(s.draft) })), []);

  const value = useMemo<NavValue>(
    () => ({
      screen: currentScreen(state),
      sheet: state.sheet,
      tab: activeTab(state),
      screenKey: key,
      transition: state.transition,
      swipe: swipeActions(state),
      completeSwipe,
      scrollOf,
      backLabel: backLabelFor(screenUnder(state)),
      whyTopic,
      go,
      selectTab,
      back,
      openSheet,
      closeSheet,
      toast,
      showToast,
      dismissToast,
      draft: state.draft,
      setDraft,
    }),
    [state, key, completeSwipe, scrollOf, whyTopic, go, selectTab, back, openSheet, closeSheet, toast, showToast, dismissToast, setDraft],
  );
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

/** Onboarding step shown by a copy drawn under a swipe (the previous step), in place of the live one. */
export const DraftStepContext = createContext<OnboardingScreenId | null>(null);

export function useNav(): NavValue {
  const ctx = useContext(NavContext);
  const step = useContext(DraftStepContext);
  if (!ctx) throw new Error('useNav must be used inside NavigationProvider');
  return step === null ? ctx : { ...ctx, draft: { ...ctx.draft, step } };
}

/**
 * Whether the screen being rendered is the live one, or a copy drawn under or beside it during a swipe (SwipeView). A copy
 * must not open portals (fixed footers) or have side effects.
 */
export const ViewActiveContext = createContext(true);

export function useViewActive(): boolean {
  return useContext(ViewActiveContext);
}

/** Back label of a copy drawn during a swipe (the page under it), in place of the live screen's. */
export const BackLabelContext = createContext<string | null>(null);

export function backLabelFor(under: ScreenId | null | undefined): string {
  return `‹ ${BACK_LABEL[under ?? ''] ?? 'Retour'}`;
}

/** The text of the back button of the screen being rendered. */
export function useBackLabel(): string {
  const copy = useContext(BackLabelContext);
  const { backLabel } = useNav();
  return copy ?? backLabel;
}
