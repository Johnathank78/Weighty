import { useEffect, useMemo, useState } from 'react';
import { useNav } from '@/app/navigation';
import { useWheighty } from '@/store/StoreProvider';
import { BottomSheet } from '@/components/BottomSheet';
import { NumberField } from '@/components/controls';
import { draftToEvidence, draftToProfile } from '@/domain/onboarding';
import { checkPersonalTarget, choosePersonalTarget, onboardingPersonalTargetTable, storePersonalTargetTable } from '@/domain/personalTarget';
import { PERSONAL_TARGET_MESSAGE } from '@/domain/planMessages';

/** Digits typed in the field, as kcal/day (null while empty). */
function kcalOf(text: string): number | null {
  const digits = text.replace(/\D/g, '');
  return digits === '' ? null : Number(digits);
}

/**
 * The user's own target (fixes of pass 5b, point 6). On the first plan of the onboarding ("J'ai déjà ma cible"), checked on
 * the context of that plan and kept in the draft until "C'est parti"; in the Plan tab ("Choisir ma cible"), checked on the
 * context of the store and applied at once. As the user types: the predicted speed, or why the target is refused.
 */
export function PersonalTargetSheet() {
  const { sheet, closeSheet, showToast, draft, setDraft } = useNav();
  const { store, commit, today } = useWheighty();
  const open = sheet === 'personalTarget';
  const onboarding = store.plan === null;
  const units = store.preferences.units;
  const [text, setText] = useState('');

  useEffect(() => {
    if (!open) return;
    const current = onboarding ? draft.personalTargetKcal : store.plan?.personalTarget?.kcal;
    setText(current ? String(Math.round(current)) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The correspondence of the speed slider, computed once per opening.
  const table = useMemo(() => {
    if (!open) return null;
    if (!onboarding) return storePersonalTargetTable(store, today);
    const profile = draftToProfile(draft, units);
    return profile ? onboardingPersonalTargetTable(profile, today, draftToEvidence(draft, units, today)) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onboarding, today]);

  if (!open) return null;
  const kcal = kcalOf(text);
  const check = table && kcal !== null ? checkPersonalTarget(table, kcal) : null;

  const apply = () => {
    if (!check?.ok) return;
    if (onboarding) {
      setDraft((d) => ({ ...d, personalTargetKcal: check.kcal }));
      closeSheet();
      return;
    }
    const r = choosePersonalTarget(store, today, check.kcal);
    if (!r.ok) {
      showToast(r.text ?? 'Cible impossible.');
      return;
    }
    commit(r.store);
    closeSheet();
    showToast(PERSONAL_TARGET_MESSAGE.applied);
  };

  return (
    <BottomSheet open onClose={closeSheet} title={onboarding ? PERSONAL_TARGET_MESSAGE.action : PERSONAL_TARGET_MESSAGE.planAction}>
      <NumberField label={PERSONAL_TARGET_MESSAGE.field} value={text} onChange={(v) => setText(v.replace(/\D/g, '').slice(0, 5))} unit="kcal" inputMode="numeric" error={check && !check.ok ? check.text : null} />
      <p className="small" style={{ margin: '10px 0 22px', minHeight: 36 }} aria-live="polite">
        {check?.ok ? check.text : ''}
      </p>
      <button type="button" className="btn btn--primary" disabled={!check?.ok} onClick={apply}>
        {PERSONAL_TARGET_MESSAGE.apply}
      </button>
    </BottomSheet>
  );
}
