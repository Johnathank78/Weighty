import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { emptyDraft } from '@/domain/onboarding';
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
  | 'journal';

export type SheetId = 'balance' | 'weigh' | 'adherence' | 'steps' | 'why' | 'goal' | 'food';

export type WhyTopic = 'estimate' | 'macros' | 'recalibration' | 'nodata';

type Toast = { id: number; text: string; action?: { label: string; run: () => void } };

type NavValue = {
  screen: ScreenId;
  sheet: SheetId | null;
  whyTopic: WhyTopic;
  go: (screen: ScreenId, options?: { replace?: boolean }) => void;
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

type HistoryState = { wheighty: true; screen: ScreenId; sheet: SheetId | null };

export function NavigationProvider({ initialScreen, children }: { initialScreen: ScreenId; children: ReactNode }) {
  const [screen, setScreen] = useState<ScreenId>(initialScreen);
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const [whyTopic, setWhyTopic] = useState<WhyTopic>('estimate');
  const [toast, setToast] = useState<Toast | null>(null);
  const [draft, setDraftState] = useState<OnboardingDraft>(emptyDraft);
  const toastTimer = useRef<number | null>(null);
  const stateRef = useRef({ screen, sheet });
  stateRef.current = { screen, sheet };

  useEffect(() => {
    const state: HistoryState = { wheighty: true, screen: initialScreen, sheet: null };
    window.history.replaceState(state, '');
    const onPop = (e: PopStateEvent) => {
      const s = e.state as HistoryState | null;
      if (!s || !s.wheighty) return;
      setSheet(s.sheet);
      setScreen(s.screen);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [initialScreen]);

  const go = useCallback((next: ScreenId, options?: { replace?: boolean }) => {
    const state: HistoryState = { wheighty: true, screen: next, sheet: null };
    if (options?.replace || stateRef.current.sheet) window.history.replaceState(state, '');
    else window.history.pushState(state, '');
    setSheet(null);
    setScreen(next);
    window.scrollTo({ top: 0 });
  }, []);

  const back = useCallback(() => window.history.back(), []);

  const openSheet = useCallback((next: SheetId, topic?: WhyTopic) => {
    if (topic) setWhyTopic(topic);
    const state: HistoryState = { wheighty: true, screen: stateRef.current.screen, sheet: next };
    if (stateRef.current.sheet) window.history.replaceState(state, '');
    else window.history.pushState(state, '');
    setSheet(next);
  }, []);

  const closeSheet = useCallback(() => {
    if (!stateRef.current.sheet) return;
    const current = window.history.state as HistoryState | null;
    if (current?.wheighty && current.sheet) window.history.back();
    else setSheet(null);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);
  const showToast = useCallback((text: string, action?: Toast['action']) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, ...(action ? { action } : {}) });
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 8000 : 2800);
  }, []);

  const setDraft = useCallback((fn: (d: OnboardingDraft) => OnboardingDraft) => setDraftState(fn), []);

  const value = useMemo<NavValue>(
    () => ({ screen, sheet, whyTopic, go, back, openSheet, closeSheet, toast, showToast, dismissToast, draft, setDraft }),
    [screen, sheet, whyTopic, go, back, openSheet, closeSheet, toast, showToast, dismissToast, draft, setDraft],
  );
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used inside NavigationProvider');
  return ctx;
}
