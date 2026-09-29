import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { OnboardingDraft } from '@/domain/onboarding';
import { canGoBack, currentKey, currentScreen, initialNav, liveKeys, navBack, navCloseSheet, navGo, navOpenSheet, navSelectTab } from './navModel';
import type { NavState, NavTransition, ScreenId, SheetId, TabId } from './navModel';
import { createHistorySync } from './navHistory';
import type { HistorySync } from './navHistory';

export type { ScreenId, SheetId, TabId } from './navModel';

export type WhyTopic = 'estimate' | 'macros' | 'recalibration' | 'nodata';

type Toast = { id: number; text: string; action?: { label: string; run: () => void } };

type NavValue = {
  screen: ScreenId;
  sheet: SheetId | null;
  /** Tab on display, null outside the tabs (UX pass 1, E). */
  tab: TabId | null;
  /** Identity of the screen on display (its place in the stacks) and how it was reached, for its entrance animation. */
  screenKey: string;
  transition: NavTransition;
  whyTopic: WhyTopic;
  go: (screen: ScreenId, options?: { replace?: boolean }) => void;
  /** Bottom navigation: no history entry, each tab keeps its sub-screen and scroll position. */
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
 * Navigation on the browser history, without a router (UX pass 1, E): the state and its transitions live in navModel.ts,
 * the history holds at most one entry above the base (navHistory.ts), and each screen gets its scroll position back when
 * shown again.
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
      // The active tab, already at its root: back to the top of the page, as in a native app.
      if (s.mode === 'tabs' && s.tab === tab && s.stacks[tab].length === 0 && s.sheet === null) window.scrollTo({ top: 0, behavior: 'smooth' });
      else navigate((cur) => navSelectTab(cur, tab));
    },
    [navigate],
  );
  const back = useCallback(() => navigate(navBack), [navigate]);
  const openSheet = useCallback(
    (next: SheetId, topic?: WhyTopic) => {
      if (topic) setWhyTopic(topic);
      setState((s) => navOpenSheet(s, next));
    },
    [],
  );
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
      tab: state.mode === 'tabs' ? state.tab : null,
      screenKey: key,
      transition: state.transition,
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
    [state, key, whyTopic, go, selectTab, back, openSheet, closeSheet, toast, showToast, dismissToast, setDraft],
  );
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used inside NavigationProvider');
  return ctx;
}
