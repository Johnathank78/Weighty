import { useMemo, useState } from 'react';
import { useBackLabel, useNav } from '@/app/navigation';
import { planHistory } from '@/domain/planHistory';
import type { PlanHistoryEntry } from '@/domain/planHistory';
import { PLAN_HISTORY_MESSAGE } from '@/domain/planMessages';
import { useWheighty } from '@/store/StoreProvider';

/**
 * "Historique de mon plan" (report 50, UX pass 3, point 3), a page stacked above Plan (navigation model of 29/09), read only.
 * Everything it shows comes from the domain (`planHistory`), from the trace alone.
 */
export function PlanHistoryScreen() {
  const { back } = useNav();
  const backText = useBackLabel();
  const { store, today } = useWheighty();
  const entries = useMemo(() => planHistory(store, today), [store, today]);

  return (
    <main className="screen">
      <button type="button" className="back" onClick={back}>
        {backText}
      </button>
      <h1 className="h-page" style={{ marginBottom: 4 }}>
        {PLAN_HISTORY_MESSAGE.title}
      </h1>
      <p className="eyebrow" style={{ margin: '0 0 22px' }}>
        {PLAN_HISTORY_MESSAGE.lead}
      </p>
      {entries.length === 0 ? (
        <p className="body">{PLAN_HISTORY_MESSAGE.empty}</p>
      ) : (
        <ol className="rows" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {entries.map((e) => (
            <HistoryRow key={e.id} entry={e} />
          ))}
        </ol>
      )}
    </main>
  );
}

function HistoryRow({ entry }: { entry: PlanHistoryEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="row" style={{ display: 'block', padding: '14px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <span style={{ font: '500 12.5px var(--font)', color: 'var(--ink2)' }}>{entry.dateText}</span>
        {entry.targetText ? (
          <span className="tabular" style={{ font: '600 14.5px var(--font)', textAlign: 'right' }}>
            {entry.targetText}
          </span>
        ) : null}
      </div>
      <div style={{ font: '500 14px/1.4 var(--font)', marginTop: 4 }}>{entry.cause}</div>
      {entry.details.length > 0 ? (
        <>
          <button type="button" className="link" style={{ fontSize: 12.5, marginTop: 4 }} aria-expanded={open} onClick={() => setOpen(!open)}>
            {PLAN_HISTORY_MESSAGE.details}
          </button>
          {open ? (
            <p className="small" style={{ margin: '4px 0 0' }}>
              {entry.details.join(' ')}
            </p>
          ) : null}
        </>
      ) : null}
    </li>
  );
}
