import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNav, NavigationProvider } from './navigation';
import type { ScreenId } from './navigation';
import { StoreProvider, useWheighty } from '@/store/StoreProvider';
import { useTheme } from '@/hooks/useTheme';
import { usePwa } from '@/hooks/usePwa';
import { BottomNav } from '@/components/BottomNav';
import { SwipeView } from '@/components/SwipeView';
import { Toast } from '@/components/Toast';
import { IntroScreen, SplashScreen } from '@/screens/Welcome';
import { OnboardingScreen } from '@/screens/Onboarding';
import { ResultScreen } from '@/screens/Result';
import { TodayScreen } from '@/screens/Today';
import { PlanScreen } from '@/screens/Plan';
import { MacrosScreen } from '@/screens/Macros';
import { AnalyseScreen, RecalibrationScreen, SuiviScreen } from '@/screens/Tracking';
import { DataScreen, DeleteScreen, GoalSheet, ParamsScreen, ProfilScreen, ReachedScreen } from '@/screens/Account';
import { AdherenceSheet, StepsSheet, WeighSheet } from '@/screens/DailySheets';
import { BalanceSheet } from '@/screens/BalanceSheet';
import { WhySheet } from '@/screens/WhySheet';
import { PersonalTargetSheet } from '@/screens/PersonalTargetSheet';
import { JournalScreen } from '@/screens/Journal';
import { HistoryScreen } from '@/screens/History';
import { PlanHistoryScreen } from '@/screens/PlanHistory';
import { firstRecalibrationAutoOpenDue, markFirstRecalibrationOpened } from '@/domain/firstRecalibration';

/** Screens shown with the bottom navigation; the others (moments, onboarding, deletion) take the whole screen. */
const WITH_BOTTOM_NAV: ReadonlySet<ScreenId> = new Set(['today', 'journal', 'plan', 'macros', 'suivi', 'history', 'analyse', 'profil', 'params', 'data', 'planHistory']);

const NEEDS_PLAN: ReadonlySet<ScreenId> = new Set(['today', 'plan', 'macros', 'suivi', 'analyse', 'recalibration', 'profil', 'reached', 'journal', 'history', 'planHistory']);

/** The component of a screen: the live one, or a copy drawn under or beside it during a swipe. */
function renderScreen(screen: ScreenId, hasPlan: boolean): ReactNode {
  switch (screen) {
    case 'splash':
      return <SplashScreen next={hasPlan ? 'today' : 'intro'} />;
    case 'intro':
      return <IntroScreen />;
    case 'onboarding':
      return <OnboardingScreen />;
    case 'result':
      return <ResultScreen />;
    case 'today':
      return <TodayScreen />;
    case 'plan':
      return <PlanScreen />;
    case 'macros':
      return <MacrosScreen />;
    case 'suivi':
      return <SuiviScreen />;
    case 'analyse':
      return <AnalyseScreen />;
    case 'recalibration':
      return <RecalibrationScreen />;
    case 'profil':
      return <ProfilScreen />;
    case 'params':
      return <ParamsScreen />;
    case 'data':
      return <DataScreen />;
    case 'delete':
      return <DeleteScreen />;
    case 'reached':
      return <ReachedScreen />;
    case 'journal':
      return <JournalScreen />;
    case 'history':
      return <HistoryScreen />;
    case 'planHistory':
      return <PlanHistoryScreen />;
  }
}

/**
 * Report 50, point 2 (E2): at the next opening of the app (start, or return to the foreground), once the calibration of the
 * day is ready for the current store, the screen of the first recalibration opens by itself, stacked above the page on
 * display, once per store. Decided once per opening: if a sheet, the onboarding or another decision screen is on display at
 * that moment, it waits for the next opening. The splash screen is waited out.
 */
function useFirstRecalibrationAutoOpen(): void {
  const { screen, autoOpenAllowed, openAuto } = useNav();
  const { store, today, calibration, calibrationPending, update } = useWheighty();
  const [armed, setArmed] = useState(true);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setArmed(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  useEffect(() => {
    if (!armed || screen === 'splash' || calibrationPending) return;
    setArmed(false);
    if (!autoOpenAllowed || !firstRecalibrationAutoOpenDue(store, calibration, calibrationPending)) return;
    update((s) => markFirstRecalibrationOpened(s, today));
    openAuto('recalibration');
  }, [armed, screen, calibrationPending, autoOpenAllowed, store, today, calibration, update, openAuto]);
}

/** Decision sheets logged when they open (report 49, point 1c); the recalibration screen logs itself. */
const DECISION_SHEETS: ReadonlySet<string> = new Set(['planChange', 'personalTarget']);

function Screens() {
  const { screen, tab: activeTab, screenKey, transition, selectTab, toast, dismissToast, sheet } = useNav();
  const { store, logActivity } = useWheighty();
  useEffect(() => {
    if (sheet && DECISION_SHEETS.has(sheet)) logActivity('screen', { name: sheet });
  }, [sheet, logActivity]);
  useFirstRecalibrationAutoOpen();
  const pwa = usePwa();
  // Swiping the update notice away hides it for this session only.
  const [updateDismissed, setUpdateDismissed] = useState(false);
  useTheme(store.preferences.theme);
  const hasPlan = store.plan !== null && store.profile !== null;
  const effective: ScreenId = NEEDS_PLAN.has(screen) && !hasPlan ? 'intro' : screen;
  const tab = effective === screen && WITH_BOTTOM_NAV.has(effective) ? activeTab : null;

  const content = renderScreen(effective, hasPlan);

  return (
    <div className="shell">
      {/* UX pass 1, E: one view per screen instance, moved by the swipes; the bottom bar stays outside. */}
      <SwipeView viewKey={effective === screen ? screenKey : effective} content={content} transition={transition} render={(id) => renderScreen(id, hasPlan)} />
      {tab && hasPlan ? <BottomNav active={tab} onNavigate={selectTab} /> : null}
      {hasPlan ? (
        <>
          <BalanceSheet />
          <WeighSheet />
          <AdherenceSheet />
          <StepsSheet />
          <GoalSheet />
        </>
      ) : null}
      <WhySheet />
      {/* Fixes of pass 5b, point 6: also on the first plan of the onboarding, before any plan exists. */}
      <PersonalTargetSheet />
      {toast ? (
        <Toast
          key={toast.id}
          onDismiss={dismissToast}
          action={
            toast.action ? (
              <button
                type="button"
                className="link"
                onClick={() => {
                  toast.action?.run();
                  dismissToast();
                }}
              >
                {toast.action.label}
              </button>
            ) : undefined
          }
        >
          {toast.text}
        </Toast>
      ) : pwa.needRefresh && !updateDismissed ? (
        <Toast
          onDismiss={() => setUpdateDismissed(true)}
          action={
            <button type="button" className="link" onClick={pwa.applyUpdate}>
              Mettre à jour
            </button>
          }
        >
          Une nouvelle version est disponible.
        </Toast>
      ) : null}
    </div>
  );
}

function Root() {
  const { store } = useWheighty();
  return (
    <NavigationProvider initialScreen={store.plan && store.profile ? 'splash' : 'splash'}>
      <Screens />
    </NavigationProvider>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Root />
    </StoreProvider>
  );
}
