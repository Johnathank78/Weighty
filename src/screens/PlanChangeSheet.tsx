import { useNav, useViewActive } from '@/app/navigation';
import { BottomSheet } from '@/components/BottomSheet';
import type { PlanChangeOption } from '@/domain/planChange';
import { PLAN_CHANGE_MESSAGE } from '@/domain/planMessages';

/**
 * "Changer de plan" (UX pass 2, points 3 and 4), opened by "Je souhaite changer de plan" in Plan: the two ways to change the
 * target as cards, like the goal cards of the onboarding. "Choisir ma cible" opens the sheet of the personal target;
 * "Aligner ma cible sur ce que je mange" closes the sheet and shows the proposal in Plan (`onAlign`); greyed and inactive while
 * the journal is too short, with what it waits for.
 */
export function PlanChangeSheet({ options, onAlign }: { options: PlanChangeOption[] | null; onAlign: () => void }) {
  const { sheet, closeSheet, openSheet } = useNav();
  // A copy of Plan drawn during a swipe opens no sheet.
  const open = useViewActive() && sheet === 'planChange' && options !== null;
  const choose = (option: PlanChangeOption) => {
    if (option.id === 'personal') {
      openSheet('personalTarget');
      return;
    }
    closeSheet();
    onAlign();
  };
  return (
    <BottomSheet open={open} onClose={closeSheet} title={PLAN_CHANGE_MESSAGE.title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 8 }}>
        {(options ?? []).map((o) => (
          <button key={o.id} type="button" className="opt-card" disabled={!o.enabled} style={o.enabled ? undefined : { opacity: 0.5 }} onClick={() => choose(o)}>
            <span className="opt-card__title">{o.title}</span>
            <span className="opt-card__sub">{o.sub}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
