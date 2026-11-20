import { useEffect, useRef } from 'react';
import { useNav } from '@/app/navigation';
import type { SheetId } from '@/app/navigation';
import { Mascot } from '@/components/Mascot';
import { WEIGH_FIRST_MESSAGE } from '@/domain/planMessages';
import { weighFirstInvitation } from '@/domain/weighFirst';
import { useWheighty } from '@/store/StoreProvider';

/**
 * "Se peser d'abord" (report 50, point 5): at the opening of a sheet that changes the plan, when the last weigh-in is more
 * than 7 days old, a short line and two buttons, in place of the choices until one is pressed. "Me peser d'abord" opens the
 * weigh-in, then comes back to the sheet `sheet`; "Continuer" shows the choices. Nothing is blocked. Logged: the invitation
 * shown, the choice made.
 */
export function WeighFirst({ sheet, onContinue }: { sheet: SheetId; onContinue: () => void }) {
  const { weighThen } = useNav();
  const { store, today, logActivity } = useWheighty();
  const invitation = weighFirstInvitation(store, today);
  const logged = useRef(false);
  useEffect(() => {
    if (!invitation || logged.current) return;
    logged.current = true;
    logActivity('screen', { name: 'weigh_first', event: 'shown', sheet, days: invitation.days });
  }, [invitation, sheet, logActivity]);
  if (!invitation) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 8 }}>
      <div className="note">
        <Mascot variant="search" width={36} />
        <span>
          <strong style={{ display: 'block', fontWeight: 600 }}>{invitation.title}</strong>
          {invitation.line}
        </span>
      </div>
      <button
        type="button"
        className="btn btn--primary"
        onClick={() => {
          logActivity('screen', { name: 'weigh_first', event: 'weigh', sheet });
          weighThen(sheet);
        }}
      >
        {WEIGH_FIRST_MESSAGE.weigh}
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => {
          logActivity('screen', { name: 'weigh_first', event: 'continue', sheet });
          onContinue();
        }}
      >
        {WEIGH_FIRST_MESSAGE.continue}
      </button>
    </div>
  );
}

/** Whether the invitation is to be shown at this opening of a sheet (it is, until "Continuer" or a fresh weigh-in). */
export function useWeighFirstPending(open: boolean, continued: boolean): boolean {
  const { store, today } = useWheighty();
  return open && !continued && weighFirstInvitation(store, today) !== null;
}
