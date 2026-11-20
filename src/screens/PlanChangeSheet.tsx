import { useEffect, useMemo, useState } from 'react';
import { useNav, useViewActive } from '@/app/navigation';
import { BottomSheet } from '@/components/BottomSheet';
import { previewAppPlanReturn, returnToAppPlan } from '@/domain/personalTarget';
import type { PlanChangeOption } from '@/domain/planChange';
import { PERSONAL_TARGET_MESSAGE, PLAN_CHANGE_MESSAGE, refusalReasonText } from '@/domain/planMessages';
import { useWheighty } from '@/store/StoreProvider';
import { useWeighFirstPending, WeighFirst } from '@/components/WeighFirst';

/**
 * "Changer de plan" (UX pass 2, points 3 and 4), opened by "Je souhaite changer de plan" in Plan: the ways to change the
 * target as cards, like the goal cards of the onboarding. "Choisir ma cible" opens the sheet of the personal target;
 * "Aligner ma cible sur ce que je mange" closes the sheet and shows the proposal in Plan (`onAlign`); greyed and inactive while
 * the journal is too short, with what it waits for. Report 50, point 4: on a personal target, "Revenir au plan de Wheighty"
 * shows what it would give ("Ton plan passerait de A à B kcal", the speed) before "Confirmer" or "Annuler".
 */
export function PlanChangeSheet({ options, onAlign }: { options: PlanChangeOption[] | null; onAlign: () => void }) {
  const { sheet, closeSheet, openSheet, showToast } = useNav();
  const { store, today, commit, nowIso, logActivity } = useWheighty();
  // A copy of Plan drawn during a swipe opens no sheet.
  const open = useViewActive() && sheet === 'planChange' && options !== null;
  const [confirming, setConfirming] = useState(false);
  // Report 50, point 5: the invitation to weigh in first, at each opening, until "Continuer" (or a fresh weigh-in).
  const [continued, setContinued] = useState(false);
  useEffect(() => {
    if (open) return;
    setConfirming(false);
    setContinued(false);
  }, [open]);
  const weighFirst = useWeighFirstPending(open, continued);
  const preview = useMemo(() => (open && confirming ? previewAppPlanReturn(store, today) : null), [open, confirming, store, today]);

  const choose = (option: PlanChangeOption) => {
    if (option.id === 'personal') {
      openSheet('personalTarget');
      return;
    }
    if (option.id === 'return') {
      setConfirming(true);
      return;
    }
    closeSheet();
    onAlign();
  };
  const confirm = () => {
    const r = returnToAppPlan(store, today, nowIso());
    logActivity('screen', { name: 'personal_target_return', choice: r.ok ? 'confirmed' : 'refused', ...(r.ok ? {} : { reason: r.reason }) });
    if (!r.ok) return;
    commit(r.store);
    closeSheet();
    showToast(PERSONAL_TARGET_MESSAGE.returnApplied);
  };

  return (
    <BottomSheet open={open} onClose={closeSheet} title={confirming ? PERSONAL_TARGET_MESSAGE.returnTitle : PLAN_CHANGE_MESSAGE.title}>
      {weighFirst ? (
        <WeighFirst sheet="planChange" onContinue={() => setContinued(true)} />
      ) : confirming ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 8 }}>
          {preview?.ok ? (
            <>
              <p className="body" style={{ margin: 0 }}>
                {PERSONAL_TARGET_MESSAGE.returnPreview(preview.beforeKcal, preview.plan.calorieTarget)}
              </p>
              <p className="small" style={{ margin: '0 0 8px' }}>
                {PERSONAL_TARGET_MESSAGE.returnSpeed(preview.plan.goal, preview.plan.weeklyRateTarget)}
              </p>
              <button type="button" className="btn btn--primary" onClick={confirm}>
                {PERSONAL_TARGET_MESSAGE.returnConfirm}
              </button>
            </>
          ) : preview ? (
            <p className="small" style={{ margin: 0 }}>
              {`${refusalReasonText(preview.reason, null).charAt(0).toLocaleUpperCase('fr-FR')}${refusalReasonText(preview.reason, null).slice(1)}.`}
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              logActivity('screen', { name: 'personal_target_return', choice: 'cancelled' });
              setConfirming(false);
            }}
          >
            {PERSONAL_TARGET_MESSAGE.returnCancel}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 8 }}>
          {(options ?? []).map((o) => (
            <button key={o.id} type="button" className="opt-card" disabled={!o.enabled} style={o.enabled ? undefined : { opacity: 0.5 }} onClick={() => choose(o)}>
              <span className="opt-card__title">{o.title}</span>
              <span className="opt-card__sub">{o.sub}</span>
            </button>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}
