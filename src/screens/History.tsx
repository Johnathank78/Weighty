import { useMemo } from 'react';
import { useNav } from '@/app/navigation';
import { HISTORY_TEXT } from '@/app/copy';
import { historyView, HISTORY_WINDOW_DAYS } from '@/domain/history';
import { useWheighty } from '@/store/StoreProvider';

/**
 * "Historique" (UX pass 1, F), a sub-screen of Suivi: the last 90 days. This iteration: one section per data, saying on how
 * many of the 90 days it exists (read-only domain selector). The charts come with phase 2.
 */
export function HistoryScreen() {
  const { back } = useNav();
  const { store, today } = useWheighty();
  const view = useMemo(() => historyView(store, today), [store, today]);
  const sections = [
    { key: 'weighIns', title: HISTORY_TEXT.weighIns, days: view.counts.weighIns },
    { key: 'kcal', title: HISTORY_TEXT.kcal, days: view.counts.kcal },
    { key: 'macros', title: HISTORY_TEXT.macros, days: view.counts.macros },
    { key: 'steps', title: HISTORY_TEXT.steps, days: view.counts.steps },
  ] as const;

  return (
    <main className="screen">
      <button type="button" className="back" onClick={back}>
        ‹ Suivi
      </button>
      <h1 className="h-page" style={{ marginBottom: 4 }}>
        {HISTORY_TEXT.title}
      </h1>
      <p className="eyebrow" style={{ margin: '0 0 24px' }}>
        {HISTORY_TEXT.window(HISTORY_WINDOW_DAYS)}
      </p>
      <div className="rows">
        {sections.map((s) => (
          <section key={s.key} className="row" aria-label={s.title}>
            <span className="row__label">{s.title}</span>
            <span className="row__value" style={{ fontSize: 14, color: s.days > 0 ? 'var(--ink)' : 'var(--ink2)' }}>
              {HISTORY_TEXT.daysWith(s.days, HISTORY_WINDOW_DAYS)}
            </span>
          </section>
        ))}
      </div>
    </main>
  );
}
