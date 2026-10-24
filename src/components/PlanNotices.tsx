import { useMemo, useState } from 'react';
import { PLAN_NOTICE_TEXT } from '@/app/copy';
import { JournalCards } from '@/components/JournalCards';
import { ShortNotice } from '@/components/ShortNotice';
import { markPlanEventSeen, unseenPlanMessages } from '@/domain/engine';
import { bmi20Warning, PLAN_NOTICES_VISIBLE, planNotices } from '@/domain/planSafety';
import { useWheighty } from '@/store/StoreProvider';

/**
 * The message zone of Aujourd'hui and Suivi (pass 5a messages, laid out by UX pass 1, G1): one zone per screen, ordered by
 * priority (underweight alert, guardrail, warning ahead of BMI 20, target migration, periodic replan), two messages at most
 * on display and the others behind "Voir les autres messages". Each message of the trace closes with "OK"; the warning
 * ahead of BMI 20 cannot be closed (no stored dismissal). Every message in the short format (pass 5b fixes, point 5).
 */
export function PlanNotices() {
  const { store, today, calibration, update } = useWheighty();
  const [expanded, setExpanded] = useState(false);
  const unseen = unseenPlanMessages(store);
  const warning = useMemo(() => bmi20Warning(store, today, calibration), [store, today, calibration]);
  const notices = planNotices(unseen, warning);
  if (notices.length === 0) {
    // Journal path (pass 5b): the proposal and the offered plans have their own buttons, above the messages.
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }} aria-live="polite">
        <JournalCards />
      </div>
    );
  }
  const shown = expanded ? notices : notices.slice(0, PLAN_NOTICES_VISIBLE);
  const hidden = notices.length - PLAN_NOTICES_VISIBLE;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }} aria-live="polite">
      <JournalCards />
      {shown.map((n) => (
        <ShortNotice
          key={n.eventId ?? n.kind}
          title={n.title}
          line={n.line}
          detail={n.text}
          tone={n.tone}
          onClose={n.eventId ? () => update((s) => markPlanEventSeen(s, n.eventId as string)) : null}
        />
      ))}
      {hidden > 0 ? (
        <button type="button" className="link" style={{ alignSelf: 'flex-start', fontSize: 13 }} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? PLAN_NOTICE_TEXT.less : PLAN_NOTICE_TEXT.more(hidden)}
        </button>
      ) : null}
    </div>
  );
}
