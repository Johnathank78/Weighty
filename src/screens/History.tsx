import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useNav } from '@/app/navigation';
import { HISTORY_TEXT, JOURNAL_GAUGE_TEXT } from '@/app/copy';
import { HistoryChart } from '@/components/HistoryChart';
import { formatDayMonth, formatGrams, formatInteger, formatKcal, formatSignedWeight, formatSteps, weightUnitLabel } from '@/domain/format';
import { historySummary, historyView, HISTORY_WINDOW_DAYS } from '@/domain/history';
import { useWheighty } from '@/store/StoreProvider';

/** Same macro colours as the journal and the Macros screen. The journal itself is read by `historyView` only. */
const MACRO_COLOR = { proteinG: '--coral', carbsG: '--peach', fatG: '--sand' } as const;
const MACRO_KEYS = ['proteinG', 'carbsG', 'fatG'] as const;

/**
 * "Historique" (UX pass 1, F and phase 2), a sub-screen of Suivi: the last 90 days, read only. Four stacked blocks, each a
 * canvas chart (weigh-ins and trend; calories, macros and steps per day with the target of the plan in force as a dashed
 * line) and one line of summary. A day without data has no bar. Everything comes from the domain (`historyView`,
 * `historySummary`, `historyChart`).
 */
export function HistoryScreen() {
  const { back } = useNav();
  const { store, today } = useWheighty();
  const units = store.preferences.units;
  const view = useMemo(() => historyView(store, today), [store, today]);
  const summary = useMemo(() => historySummary(view), [view]);
  const series = useMemo(
    () => ({
      kcal: view.days.map((d) => d.kcalLogged),
      steps: view.days.map((d) => d.stepsWalked),
      faded: view.days.map((d) => d.macros !== null && !d.macrosComplete),
      macros: Object.fromEntries(MACRO_KEYS.map((k) => [k, view.days.map((d) => (d.macros ? d.macros[k] : null))])) as Record<(typeof MACRO_KEYS)[number], Array<number | null>>,
      weight: view.days.map((d) => ({ weighIns: d.weighIns, trendKg: d.trendKg })),
    }),
    [view],
  );
  const t = view.targets;
  const axis = <Axis start={formatDayMonth(view.from)} />;

  return (
    <main className="screen">
      <button type="button" className="back" onClick={back}>
        ‹ Suivi
      </button>
      <h1 className="h-page" style={{ marginBottom: 4 }}>
        {HISTORY_TEXT.title}
      </h1>
      <p className="eyebrow" style={{ margin: '0 0 26px' }}>
        {HISTORY_TEXT.window(HISTORY_WINDOW_DAYS)}
      </p>

      <Block title={HISTORY_TEXT.weighIns} days={view.counts.weighIns}>
        <HistoryChart kind="weight" height={132} days={series.weight} label={`${HISTORY_TEXT.weighIns}, ${HISTORY_TEXT.daysWith(view.counts.weighIns, HISTORY_WINDOW_DAYS)}`} />
        {axis}
        <p className="small history-line">{summary.trendChangeKg === null ? HISTORY_TEXT.trendPending : HISTORY_TEXT.trendChange(`${formatSignedWeight(summary.trendChangeKg, units)} ${weightUnitLabel(units)}`)}</p>
      </Block>

      <Block title={HISTORY_TEXT.kcal} days={view.counts.kcal}>
        <HistoryChart kind="bars" height={112} values={series.kcal} target={t?.calorieTargetKcal ?? null} color="--coral" label={`${HISTORY_TEXT.kcal}, ${HISTORY_TEXT.daysWith(view.counts.kcal, HISTORY_WINDOW_DAYS)}`} />
        {axis}
        {summary.kcalAverage === null ? null : <p className="small history-line">{HISTORY_TEXT.kcalAverage(formatInteger(Math.round(summary.kcalAverage)))}</p>}
        {t ? <TargetLine text={HISTORY_TEXT.target(`${formatKcal(t.calorieTargetKcal)} kcal`)} /> : null}
      </Block>

      <Block title={HISTORY_TEXT.macros} days={view.counts.macros}>
        {MACRO_KEYS.map((k) => (
          <div key={k} className="history-macro">
            <div className="history-macro__head">
              <span>
                <span className="history-macro__dot" style={{ background: `var(${MACRO_COLOR[k]})` }} aria-hidden="true" />
                {JOURNAL_GAUGE_TEXT.macros[k]}
              </span>
              <span className="tabular">
                {summary.macrosAverage ? HISTORY_TEXT.macroAverage(formatGrams(summary.macrosAverage[k]), summary.macrosAverage.floor) : ''}
                {summary.macrosAverage && t ? ' · ' : ''}
                {t ? HISTORY_TEXT.macroTarget(formatGrams(t.macros[k])) : ''}
              </span>
            </div>
            <HistoryChart kind="bars" height={52} values={series.macros[k]} faded={series.faded} target={t?.macros[k] ?? null} color={MACRO_COLOR[k]} label={`${JOURNAL_GAUGE_TEXT.macros[k]} saisis par jour`} />
          </div>
        ))}
        {axis}
        {summary.macrosAverage?.floor ? <p className="small history-line">{HISTORY_TEXT.macrosFloor}</p> : null}
      </Block>

      <Block title={HISTORY_TEXT.steps} days={view.counts.steps}>
        <HistoryChart kind="bars" height={112} values={series.steps} target={t?.stepTarget ?? null} color="--peach" label={`${HISTORY_TEXT.steps}, ${HISTORY_TEXT.daysWith(view.counts.steps, HISTORY_WINDOW_DAYS)}`} />
        {axis}
        {summary.stepsAverage === null ? null : <p className="small history-line">{HISTORY_TEXT.stepsAverage(formatSteps(Math.round(summary.stepsAverage)))}</p>}
        {t ? <TargetLine text={HISTORY_TEXT.target(`${formatSteps(t.stepTarget)} pas`)} /> : null}
      </Block>
    </main>
  );
}

/** One data of the history: its title, the number of days it exists on, and its chart (or a line saying there is none). */
function Block({ title, days, children }: { title: string; days: number; children: ReactNode }) {
  return (
    <section className="history-block" aria-label={title}>
      <div className="history-block__head">
        <h2 className="section-label" style={{ margin: 0 }}>
          {title}
        </h2>
        <span className="small tabular">{HISTORY_TEXT.daysWith(days, HISTORY_WINDOW_DAYS)}</span>
      </div>
      {days > 0 ? children : <p className="small history-line">{HISTORY_TEXT.noData}</p>}
    </section>
  );
}

function Axis({ start }: { start: string }) {
  return (
    <div className="chart-axis" style={{ marginBottom: 6 }} aria-hidden="true">
      <span>{start}</span>
      <span>{HISTORY_TEXT.axisToday}</span>
    </div>
  );
}

/** Legend of the dashed line of the charts: the target of the plan in force. */
function TargetLine({ text }: { text: string }) {
  return (
    <p className="small history-line">
      <span className="history-target-key" aria-hidden="true" />
      {text}
    </p>
  );
}
