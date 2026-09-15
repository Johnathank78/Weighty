import { useEffect, useMemo, useRef, useState } from 'react';
import { useNav } from '@/app/navigation';
import { useWheighty } from '@/store/StoreProvider';
import { ADHERENCE_LABEL, CONFIDENCE_LABEL, GATE_CRITERION_LABEL } from '@/app/copy';
import { BottomSheet } from '@/components/BottomSheet';
import { Mascot } from '@/components/Mascot';
import { ConfidenceBar, ConfidenceGauge, Segmented } from '@/components/controls';
import { WeightChart } from '@/components/WeightChart';
import { applyRecalibration, buildPlanFromStore, deleteWeight, markRecalibrationSeen, trendOf } from '@/domain/engine';
import { formatDayMonth, formatInteger, formatKcal, formatKcalRange, formatShortMonth, formatSignedKcal, formatSignedWeight, formatSteps, formatWeight, weightUnitLabel } from '@/domain/format';
import { adherenceSummary, analysisView, averageLoggedSteps, gateCriterionValue, gateProgress, recentWeights, trackingChart, weeksOfTracking } from '@/domain/views';
import { addDays } from '@/science/dates';

type RangeChoice = '1m' | '3m' | 'all';

/** Duration of the maintenance count-up animation on the recalibration screen (visual only). */
const COUNT_UP_MS = 1100;

export function SuiviScreen() {
  const { openSheet } = useNav();
  const { store, today, update } = useWheighty();
  const [range, setRange] = useState<RangeChoice>('3m');
  const [pending, setPending] = useState<string | null>(null);
  const units = store.preferences.units;
  const trend = trendOf(store).summary;
  const chart = useMemo(() => trackingChart(store, today, range === '1m' ? 30 : range === '3m' ? 90 : null), [store, today, range]);
  const recent = recentWeights(store, 8);
  const weeks = weeksOfTracking(store, today);
  const pendingEntry = store.weights.find((w) => w.id === pending) ?? null;

  return (
    <main className="screen">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0 22px' }}>
        <div>
          <div className="eyebrow">{weeks > 0 ? `${weeks} semaine${weeks > 1 ? 's' : ''} de données` : 'Début du suivi'}</div>
          <h1 className="h-screen">Suivi</h1>
        </div>
        <button type="button" className="btn btn--primary btn--small" onClick={() => openSheet('weigh')}>
          + Pesée
        </button>
      </header>

      {trend.latest ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
            <span className="tabular" style={{ font: '600 64px/1 var(--font)', letterSpacing: '-0.05em' }}>
              {formatWeight(trend.latest.trendKg, units)}
            </span>
            <span className="unit" style={{ fontSize: 16 }}>
              {weightUnitLabel(units)}
            </span>
          </div>
          <div style={{ font: '500 13.5px var(--font)', color: trend.readable ? 'var(--acc)' : 'var(--ink2)', marginBottom: 22 }}>
            {trend.readable && trend.weeklyRateKg !== null ? `${formatSignedWeight(trend.weeklyRateKg, units)} ${weightUnitLabel(units)} cette semaine · tendance lissée` : 'Tendance lissée · encore quelques pesées'}
          </div>
        </>
      ) : null}

      {chart ? (
        <>
          <WeightChart
            width={342}
            height={168}
            raw={chart.raw}
            trend={chart.trend}
            projection={chart.projection}
            band={chart.band}
            markers={trend.latest ? [{ day: chart.trend[chart.trend.length - 1]?.day ?? chart.todayDay, kg: trend.latest.trendKg, kind: 'today' }] : []}
            label={`Évolution du poids en ${weightUnitLabel(units)} : pesées, tendance lissée et projection du plan`}
          />
          <div className="chart-axis">
            <span>{formatShortMonth(chart.startDate)}</span>
            <span>Auj.</span>
            <span style={{ opacity: 0.6 }}>Prévu</span>
          </div>
        </>
      ) : (
        <div style={{ display: 'grid', placeItems: 'center', padding: '20px 0 30px', textAlign: 'center' }}>
          <Mascot variant="empty" width={150} />
          <p className="body" style={{ marginTop: 10 }}>
            Aucune pesée pour le moment.
          </p>
        </div>
      )}

      <Segmented
        label="Période"
        options={[
          { value: '1m', label: '1 mois' },
          { value: '3m', label: '3 mois' },
          { value: 'all', label: 'Tout' },
        ]}
        value={range}
        onChange={setRange}
      />

      <div className="eyebrow" style={{ margin: '30px 0 14px' }}>
        Dernières pesées
      </div>
      <div className="rows">
        {recent.map((w) => (
          <button key={w.id} type="button" className="row" style={{ width: '100%', background: 'none', borderLeft: 0, borderRight: 0, borderBottom: 0, textAlign: 'left', color: 'var(--ink)' }} onClick={() => setPending(w.id)} aria-label={`Pesée du ${formatDayMonth(w.date)} : ${formatWeight(w.kg, units)} ${weightUnitLabel(units)}. Options`}>
            <span style={{ font: '500 14px var(--font)' }}>{w.date === today ? 'Aujourd’hui' : w.date === addDays(today, -1) ? 'Hier' : formatDayMonth(w.date)}</span>
            <span style={{ display: 'flex', gap: 14, alignItems: 'baseline', marginLeft: 'auto' }}>
              <span className="tabular" style={{ font: '500 12.5px var(--font)', color: 'var(--ink2)', textAlign: 'right' }}>{w.deltaKg === null ? '' : formatSignedWeight(w.deltaKg, units)}</span>
              <span className="tabular" style={{ font: '600 16px var(--font)', minWidth: 48, textAlign: 'right' }}>
                {formatWeight(w.kg, units)}
              </span>
            </span>
          </button>
        ))}
      </div>

      <BottomSheet open={pendingEntry !== null} onClose={() => setPending(null)} title="Cette pesée" lead={pendingEntry ? `${formatDayMonth(pendingEntry.date)} : ${formatWeight(pendingEntry.weightKg, units)} ${weightUnitLabel(units)}. Une erreur de saisie ? Tu peux la supprimer.` : ''}>
        <button
          type="button"
          className="btn btn--outline"
          style={{ color: 'var(--danger)' }}
          onClick={() => {
            if (pendingEntry) update((s) => deleteWeight(s, pendingEntry.id));
            setPending(null);
          }}
        >
          Supprimer cette pesée
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setPending(null)}>
          Annuler
        </button>
      </BottomSheet>
    </main>
  );
}

/** Display of one gate criterion (shared with the explanation panel). */
export { gateCriterionValue };

export function AnalyseScreen() {
  const { go, openSheet } = useNav();
  const { store, calibration, calibrationPending } = useWheighty();
  const view = analysisView(store, calibration);
  if (!view) return null;
  const units = store.preferences.units;
  const trend = trendOf(store).summary;
  const adherence = adherenceSummary(store);
  const avgSteps = averageLoggedSteps(store);
  const gate = gateProgress(calibration, store);
  const details = store.preferences.showScientificDetails;

  const header = (
    <header style={{ padding: '8px 0 26px' }}>
      <div className="eyebrow">Ce que Wheighty a appris</div>
      <h1 className="h-screen">Analyse</h1>
    </header>
  );

  if (!view.calibrated) {
    return (
      <main className="screen">
        {header}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '10px 10px 30px' }}>
          <Mascot variant="search" width={96} float />
          <h2 style={{ margin: '22px 0 10px', font: '700 20px/1.3 var(--font-display)', letterSpacing: '-0.02em' }}>J’observe encore</h2>
          <p className="body" style={{ maxWidth: 300 }}>
            Pour distinguer une vraie tendance des variations d’eau, toutes les conditions ci-dessous doivent être réunies.
          </p>
        </div>
        <div style={{ marginBottom: 30 }}>
          <ConfidenceGauge level={view.confidence} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <span className="eyebrow">Progression vers la première recalibration</span>
          <span className="small">
            {gate.metCount} / {gate.criteria.length}
          </span>
        </div>
        <div className="rows" style={{ marginBottom: 30 }}>
          {gate.criteria.map((c) => (
            <div key={c.key} className="gate-row" data-met={c.met}>
              <div className="gate-row__head">
                <span>{GATE_CRITERION_LABEL[c.key]}</span>
                <span className="tabular">{gateCriterionValue(c)}</span>
              </div>
              <div className="gate-row__bar" aria-hidden="true">
                <i style={{ width: `${Math.round(c.fill * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="rows" style={{ marginBottom: 26 }}>
          <div className="row">
            <span className="row__label">Maintien estimé</span>
            <span className="row__value" style={{ color: 'var(--ink2)' }}>
              {formatKcal(view.maintenanceKcal)} kcal · estimé
            </span>
          </div>
          <div className="row">
            <span className="row__label">Fourchette actuelle</span>
            <span className="row__value" style={{ fontSize: 14, whiteSpace: 'nowrap' }}>
              {formatKcalRange(view.interval80)} kcal
            </span>
          </div>
          <div className="row">
            <span className="row__label">Tendance</span>
            <span className="row__value" style={{ color: trend.readable ? 'var(--ink)' : 'var(--ink2)' }}>
              {trend.readable && trend.weeklyRateKg !== null ? `${formatSignedWeight(trend.weeklyRateKg, units, 2)} ${weightUnitLabel(units)} / sem.` : 'Pas encore lisible'}
            </span>
          </div>
        </div>

        <button type="button" className="btn btn--ghost" style={{ fontSize: 13.5 }} onClick={() => openSheet('why', 'nodata')}>
          Comment Wheighty apprend de mes données ?
        </button>
      </main>
    );
  }

  return (
    <main className="screen">
      {header}
      <div style={{ marginBottom: 30 }}>
        <ConfidenceGauge level={view.confidence} />
      </div>
      <div className="eyebrow" style={{ marginBottom: 2 }}>
        Maintien estimé aujourd’hui
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 10 }}>
        <span className="num-xl">{formatKcal(view.maintenanceKcal)}</span>
        <span className="unit">kcal</span>
      </div>
      {view.changeSinceInitialKcal !== null && view.initialMaintenanceKcal !== null ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: '500 13px var(--font)', color: 'var(--ink2)', marginBottom: 22 }}>
          <span style={{ color: 'var(--acc)', fontWeight: 600 }}>{formatSignedKcal(view.changeSinceInitialKcal)} kcal</span> depuis l’estimation initiale ({formatKcal(view.initialMaintenanceKcal)})
        </div>
      ) : null}
      <div className="row" style={{ marginBottom: 30, borderBottom: 0 }}>
        <span className="row__label" style={{ fontSize: 12.5 }}>
          Fourchette actuelle
        </span>
        <span className="row__value" style={{ fontSize: 14, whiteSpace: 'nowrap' }}>
          {formatKcalRange(view.interval80)} kcal
        </span>
      </div>

      <div className="rows" style={{ marginBottom: 26 }}>
        <div className="row">
          <span className="row__label">Tendance de poids</span>
          <span className="row__value">{trend.readable && trend.weeklyRateKg !== null ? `${formatSignedWeight(trend.weeklyRateKg, units, 2)} ${weightUnitLabel(units)} / sem.` : 'Pas encore lisible'}</span>
        </div>
        <div className="row">
          <span className="row__label">Pesées enregistrées</span>
          <span className="row__value">{formatInteger(view.weighInCount)}</span>
        </div>
        <div className="row">
          <span className="row__label">Adhérence la plus fréquente</span>
          <span className="row__value">{adherence.label ? ADHERENCE_LABEL[adherence.label] : 'Non notée'}</span>
        </div>
        <div className="row">
          <span className="row__label">Pas moyens réels</span>
          <span className="row__value">{avgSteps === null ? 'Non saisis' : formatSteps(avgSteps)}</span>
        </div>
        {details ? (
          <>
            <div className="row">
              <span className="row__label">Intervalle 95 %</span>
              <span className="row__value" style={{ fontSize: 14 }}>
                {formatKcalRange(view.interval95)} kcal
              </span>
            </div>
            <div className="row">
              <span className="row__label">Écart-type a posteriori</span>
              <span className="row__value">{view.posteriorSdKcal === null ? '…' : `${formatInteger(view.posteriorSdKcal)} kcal`}</span>
            </div>
            <div className="row">
              <span className="row__label">Période observée</span>
              <span className="row__value">{view.observationSpanDays} jours</span>
            </div>
          </>
        ) : null}
      </div>

      {view.surfaced && !calibrationPending ? (
        <>
          <div style={{ background: 'var(--grad-soft)', borderRadius: 24, padding: 20, display: 'flex', gap: 14, alignItems: 'center' }}>
            <Mascot variant="surpris" width={56} float />
            <div style={{ flex: 1 }}>
              <div style={{ font: '600 15px/1.35 var(--font)', marginBottom: 4 }}>Une recalibration est prête</div>
              <div style={{ font: '400 13px/1.45 var(--font)', color: 'var(--ink2)' }}>Tes dernières semaines de suivi suffisent pour affiner ton besoin.</div>
            </div>
          </div>
          <button type="button" className="btn btn--primary" style={{ marginTop: 14 }} onClick={() => go('recalibration')}>
            Voir la recalibration
          </button>
        </>
      ) : (
        <p className="small">Plus tes pesées et tes journées notées sont régulières, plus l’estimation peut s’affiner.</p>
      )}
      <button type="button" className="btn btn--ghost" style={{ fontSize: 13.5 }} onClick={() => openSheet('why', 'recalibration')}>
        Comment Wheighty apprend de mes données ?
      </button>
    </main>
  );
}

export function RecalibrationScreen() {
  const { go, openSheet, showToast } = useNav();
  const { store, calibration, calibrationPending, commit, today, nowIso } = useWheighty();
  const plan = store.plan;
  const state = calibration;
  const [shown, setShown] = useState(plan?.maintenanceKcal ?? 0);
  const marked = useRef(false);

  const preview = useMemo(() => {
    if (!state?.candidate) return null;
    const r = buildPlanFromStore(store, today, { source: 'recalibrated', snapshot: state.candidate, ...(plan ? { stepTarget: plan.stepTarget } : {}) });
    return r.ok ? r.plan : null;
  }, [state?.candidate, store, today, plan]);

  const target = state?.proposedMaintenanceKcal ?? null;
  useEffect(() => {
    if (target === null || !plan) return;
    const from = plan.maintenanceKcal;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / COUNT_UP_MS);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(from + (target - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, plan]);

  useEffect(() => {
    if (!marked.current && !calibrationPending && state?.surfaced && state.candidate) {
      marked.current = true;
      // Seen: surfacing thresholds now compare against this event (05 s12). The plan is unchanged until applied.
      commit(markRecalibrationSeen(store, state, today));
    }
  }, [state, calibrationPending, store, today, commit]);

  if (!plan || !state?.candidate || target === null) {
    return (
      <main className="screen--moment">
        <div style={{ display: 'grid', placeItems: 'center', marginTop: 40 }}>
          <Mascot variant="search" width={96} />
        </div>
        <h2 className="h-screen" style={{ textAlign: 'center', marginTop: 20 }}>
          Pas encore de recalibration
        </h2>
        <p className="body" style={{ textAlign: 'center', marginTop: 10 }}>
          Continue tes pesées et note tes journées : Wheighty te préviendra quand il en saura plus.
        </p>
        <div className="spacer" />
        <button type="button" className="btn btn--primary" onClick={() => go('analyse', { replace: true })}>
          Retour à l’analyse
        </button>
      </main>
    );
  }

  const apply = () => {
    const r = applyRecalibration(store, state, today, nowIso());
    if (!r.ok) {
      showToast('Recalibration impossible pour le moment.');
      return;
    }
    commit(r.store);
    showToast('Nouveau plan appliqué.');
    go('today', { replace: true });
  };

  return (
    <main className="screen--moment">
      <div style={{ display: 'grid', placeItems: 'center', margin: '26px 0 22px' }}>
        <Mascot variant="surpris" width={104} float />
      </div>
      <p className="eyebrow" style={{ textAlign: 'center', fontSize: 13, margin: 0 }}>
        Recalibration
      </p>
      <h2 style={{ margin: '6px 0 34px', textAlign: 'center', font: '700 27px/1.25 var(--font-display)', letterSpacing: '-0.03em' }}>
        Wheighty te connaît
        <br />
        mieux.
      </h2>
      <div style={{ textAlign: 'center' }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Estimation actuelle
        </div>
        <div className="tabular" style={{ font: '600 26px var(--font)', color: 'var(--ink2)', textDecoration: 'line-through', textDecorationThickness: '1.5px', opacity: 0.65 }}>
          {formatKcal(plan.maintenanceKcal)}
        </div>
        <div style={{ width: 1, height: 26, background: 'var(--line-strong)', margin: '14px auto' }} />
        <div className="eyebrow" style={{ marginBottom: 2 }}>
          Nouveau maintien estimé
        </div>
        <div className="tabular" style={{ font: '600 84px/1 var(--font)', letterSpacing: '-0.055em' }} aria-live="polite">
          {formatKcal(shown)}
        </div>
        <div className="eyebrow" style={{ fontSize: 14, marginTop: 8 }}>
          kcal
        </div>
      </div>

      <div className="card" style={{ margin: '34px 0 0', padding: 20, borderRadius: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ font: '500 13px var(--font)', color: 'var(--ink2)' }}>Confiance</span>
          <span style={{ font: '600 13.5px var(--font)' }}>{CONFIDENCE_LABEL[state.confidence]}</span>
        </div>
        <div style={{ marginBottom: 14 }}>
          <ConfidenceBar level={state.confidence} />
        </div>
        <p style={{ margin: 0, font: '400 13.5px/1.55 var(--font)', color: 'var(--ink2)' }}>
          Tes {state.gate.spanDays} derniers jours de suivi affinent ton maintien estimé, c’est-à-dire les calories qui stabilisent ton poids quand tu suis ton plan comme d’habitude (fourchette {formatKcalRange(state.currentInterval80)} kcal).
          {preview ? (
            <>
              {' '}
              Ton plan quotidien passerait à <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{formatKcal(preview.calorieTarget)} kcal</strong>.
            </>
          ) : null}
        </p>
      </div>
      <div className="spacer" />
      <button type="button" className="btn btn--primary" style={{ marginTop: 26 }} onClick={apply} disabled={!preview || calibrationPending}>
        {calibrationPending ? 'Mise à jour…' : 'Appliquer le nouveau plan'}
      </button>
      <button type="button" className="btn btn--ghost" onClick={() => openSheet('why', 'recalibration')}>
        Pourquoi ce changement ?
      </button>
      <button type="button" className="btn btn--ghost" style={{ paddingTop: 0 }} onClick={() => go('analyse', { replace: true })}>
        Plus tard
      </button>
    </main>
  );
}
