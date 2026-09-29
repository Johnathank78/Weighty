import { useMemo, useState } from 'react';
import { PLAN_NOTICE_TEXT } from '@/app/copy';
import { Mascot } from '@/components/Mascot';
import { markPlanEventSeen, unseenPlanMessages } from '@/domain/engine';
import { bmi20Warning, PLAN_NOTICES_VISIBLE, planNotices } from '@/domain/planSafety';
import type { PlanNotice } from '@/domain/planSafety';
import { useWheighty } from '@/store/StoreProvider';

/**
 * The message zone of Aujourd'hui and Suivi (pass 5a messages, laid out by UX pass 1, G1): one zone per screen, ordered by
 * priority (underweight alert, guardrail, warning ahead of BMI 20, target migration, periodic replan), two messages at most
 * on display and the others behind "Voir les autres messages". Each message of the trace closes with "OK"; the warning
 * ahead of BMI 20 cannot be closed (no stored dismissal without a schema change) and holds on one line.
 */
export function PlanNotices() {
  const { store, today, calibration, update } = useWheighty();
  const [expanded, setExpanded] = useState(false);
  const unseen = unseenPlanMessages(store);
  const warning = useMemo(() => bmi20Warning(store, today, calibration), [store, today, calibration]);
  const notices = planNotices(unseen, warning);
  if (notices.length === 0) return null;
  const shown = expanded ? notices : notices.slice(0, PLAN_NOTICES_VISIBLE);
  const hidden = notices.length - PLAN_NOTICES_VISIBLE;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }} aria-live="polite">
      {shown.map((n) =>
        n.kind === 'bmi20_warning' ? (
          <Bmi20Line key="bmi20" notice={n} />
        ) : (
          <div key={n.eventId} className={`note ${n.tone === 'warn' ? 'note--warn' : ''}`}>
            <Mascot variant="search" width={36} />
            <span style={{ flex: 1 }}>{n.text}</span>
            <button type="button" className="link" onClick={() => n.eventId && update((s) => markPlanEventSeen(s, n.eventId as string))} aria-label={PLAN_NOTICE_TEXT.closeLabel}>
              {PLAN_NOTICE_TEXT.close}
            </button>
          </div>
        ),
      )}
      {hidden > 0 ? (
        <button type="button" className="link" style={{ alignSelf: 'flex-start', fontSize: 13 }} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? PLAN_NOTICE_TEXT.less : PLAN_NOTICE_TEXT.more(hidden)}
        </button>
      ) : null}
    </div>
  );
}

/** The warning ahead of BMI 20 on one line; the full sentence unfolds on demand. */
function Bmi20Line({ notice }: { notice: PlanNotice }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="note note--warn note--compact">
      <button type="button" className="note__line" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="note__line-text">{PLAN_NOTICE_TEXT.bmi20Short(notice.weeks ?? 1)}</span>
        <span className="chevron" aria-hidden="true" data-open={open}>
          ›
        </span>
        <span className="sr-only">{PLAN_NOTICE_TEXT.bmi20Expand}</span>
      </button>
      {open ? <p className="note__detail">{notice.text}</p> : null}
    </div>
  );
}
