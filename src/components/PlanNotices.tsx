import { useMemo } from 'react';
import { Mascot } from '@/components/Mascot';
import { markPlanEventSeen, unseenPlanMessages } from '@/domain/engine';
import { bmi20Warning } from '@/domain/planSafety';
import { useWheighty } from '@/store/StoreProvider';

/**
 * Plan messages of pass 5a, shown where the user lands (Aujourd'hui, Suivi): the unread entries of the trace (guardrails,
 * periodic replan above 10 kcal/day, target migration, underweight alert), each closed once read, and the warning ahead
 * of the BMI-20 guardrail while the projection announces it. Minimal layout: the UX/UI pass will rework it.
 */
export function PlanNotices() {
  const { store, today, calibration, update } = useWheighty();
  const unseen = unseenPlanMessages(store);
  const warning = useMemo(() => bmi20Warning(store, today, calibration), [store, today, calibration]);
  if (unseen.length === 0 && !warning) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }} aria-live="polite">
      {unseen.map((e) => (
        <div key={e.id} className={`note ${e.rule === 'underweight_bmi' || e.rule === 'underweight_decline' || e.rule === 'G1' ? 'note--warn' : ''}`}>
          <Mascot variant="search" width={36} />
          <span style={{ flex: 1 }}>{e.message}</span>
          <button type="button" className="link" onClick={() => update((s) => markPlanEventSeen(s, e.id))} aria-label="Fermer ce message">
            OK
          </button>
        </div>
      ))}
      {warning ? (
        <div className="note note--warn">
          <Mascot variant="search" width={36} />
          <span>{warning.message}</span>
        </div>
      ) : null}
    </div>
  );
}
