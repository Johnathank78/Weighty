import { useNav } from '@/app/navigation';
import { useWheighty } from '@/store/StoreProvider';
import { ADHERENCE_LABEL, CONFIDENCE_LABEL, JOURNAL_TEXT } from '@/app/copy';
import { journalDay } from '@/domain/journal';
import { Mascot } from '@/components/Mascot';
import { formatDayMonth, formatGrams, formatInteger, formatKcal, formatLongDate, formatSignedWeight, formatSteps, formatWeight, weightUnitLabel } from '@/domain/format';
import { displayMacros, gateProgress, goalStatus, nextWeighInDate, reminderDue, todayLog } from '@/domain/views';
import { trendOf } from '@/domain/engine';
import { profileInitials } from '@/domain/onboarding';

export function TodayScreen() {
  const { go, openSheet } = useNav();
  const { store, today, calibration, calibrationPending } = useWheighty();
  const plan = store.plan;
  if (!plan) return null;
  const units = store.preferences.units;
  const macros = displayMacros(plan);
  const log = todayLog(store, today);
  const logged = log?.actualSteps ?? null;
  const progress = logged === null ? 0 : Math.min(1, logged / plan.stepTarget);
  const trend = trendOf(store).summary;
  const gate = gateProgress(calibration, store);
  const due = reminderDue(store, today);
  const reached = goalStatus(store).reached;
  const initials = profileInitials(store.profile);
  const journal = journalDay(store, today);
  // A result computed for an older store never announces a recalibration.
  const recalibrationReady = calibration?.surfaced === true && !calibrationPending;

  let statusTitle: string;
  if (recalibrationReady) statusTitle = 'Une recalibration est prête.';
  else if (!gate.met && gate.remainingWeighIns > 0) statusTitle = `Encore ${gate.remainingWeighIns} pesée${gate.remainingWeighIns > 1 ? 's' : ''} avant la première mise à jour.`;
  else if (!gate.met && gate.remainingDays > 0) statusTitle = `Encore ${gate.remainingDays} jour${gate.remainingDays > 1 ? 's' : ''} de suivi avant la première mise à jour.`;
  else if (!gate.met && gate.criteria.some((c) => c.key === 'cleanWeighIns' && !c.met)) statusTitle = 'Encore quelques pesées en dehors des journées d’écart important.';
  else if (!gate.met) statusTitle = 'Note tes journées pour débloquer la première mise à jour.';
  else statusTitle = 'Ton estimation suit tes pesées.';

  return (
    <main className="screen">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 26px' }}>
        <div>
          <div className="eyebrow">{formatLongDate(today)}</div>
          <h1 className="h-screen">Aujourd’hui</h1>
        </div>
        <button type="button" className="avatar" onClick={() => go('profil')} aria-label="Ouvrir le profil">
          {initials ? (
            <span aria-hidden="true">{initials}</span>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="10" cy="7" r="3.2" />
              <path d="M3.8 17c.9-3.1 3.3-4.8 6.2-4.8s5.3 1.7 6.2 4.8" />
            </svg>
          )}
        </button>
      </header>

      {reached ? (
        <button type="button" className="note note--warn" style={{ width: '100%', border: 0, textAlign: 'left', marginBottom: 22 }} onClick={() => go('reached')}>
          <Mascot variant="heureux" width={40} />
          <span style={{ flex: 1 }}>Ta tendance a atteint ton poids cible. On fait le point ?</span>
          <span className="chevron">›</span>
        </button>
      ) : null}

      <section aria-label="À manger">
        <div className="eyebrow" style={{ fontSize: 13, marginBottom: 2 }}>
          À manger
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
          <span className="num-xxl">{formatKcal(plan.calorieTarget)}</span>
          <span className="unit" style={{ fontSize: 17 }}>
            kcal
          </span>
        </div>
        <div style={{ display: 'flex', gap: 20, margin: '18px 0 30px', alignItems: 'baseline' }}>
          {(
            [
              [macros.proteinG, 'g prot.'],
              [macros.carbsG, 'g gluc.'],
              [macros.fatG, 'g lip.'],
            ] as const
          ).map(([v, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span className="tabular" style={{ font: '600 17px var(--font)' }}>
                {formatGrams(v)}
              </span>
              <span style={{ font: '500 12px var(--font)', color: 'var(--ink2)' }}>{l}</span>
            </div>
          ))}
          <button type="button" className="link" style={{ marginLeft: 'auto', fontSize: 12.5 }} onClick={() => go('macros')}>
            Détail
          </button>
        </div>
        <button
          type="button"
          onClick={() => go('journal')}
          style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 0, padding: '0 0 24px', margin: '-12px 0 0', color: 'var(--ink)', textAlign: 'left' }}
        >
          <span style={{ font: '500 13px var(--font)', color: 'var(--ink2)' }}>{JOURNAL_TEXT.todayLink}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, font: '500 13px var(--font)' }}>
            {journal.entries.length > 0 ? <span className="tabular">{formatInteger(Math.round(journal.intakeLoggedKcal))} kcal saisies</span> : <span style={{ color: 'var(--ink2)' }}>{JOURNAL_TEXT.todayEmpty}</span>}
            <span className="chevron" aria-hidden="true">
              ›
            </span>
          </span>
        </button>
      </section>

      <div className="divider" style={{ marginBottom: 26 }} />

      <section aria-label="À marcher">
        <div className="eyebrow" style={{ fontSize: 13, marginBottom: 2 }}>
          À marcher
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 14 }}>
          <span className="num-l">{formatSteps(plan.stepTarget)}</span>
          <span className="unit">pas</span>
        </div>
        <div className="progress" style={{ marginBottom: 8 }} role="progressbar" aria-label="Pas saisis aujourd’hui" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className="progress__bar" style={{ width: `${progress * 100}%` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', font: '400 12px var(--font)', color: 'var(--ink2)', marginBottom: 30 }}>
          <span>{logged === null ? 'Pas encore saisis' : `${formatInteger(logged)} pas saisis`}</span>
          <button type="button" className="link" style={{ fontSize: 12.5 }} onClick={() => openSheet('steps')}>
            Mettre à jour
          </button>
        </div>
      </section>

      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        <button type="button" className="tile" onClick={() => openSheet('weigh')}>
          <div style={{ font: '500 11.5px var(--font)', color: 'var(--ink2)', marginBottom: 6 }}>Poids</div>
          {trend.latest ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span className="tabular" style={{ font: '600 27px var(--font)', letterSpacing: '-0.03em' }}>
                  {formatWeight(trend.latest.trendKg, units)}
                </span>
                <span style={{ font: '500 12px var(--font)', color: 'var(--ink2)' }}>{weightUnitLabel(units)}</span>
              </div>
              <div style={{ font: '500 12px var(--font)', color: due ? 'var(--acc)' : trend.readable ? 'var(--acc)' : 'var(--ink2)', marginTop: 5 }}>
                {due ? 'Pesée recommandée' : trend.readable && trend.weeklyRateKg !== null ? `${formatSignedWeight(trend.weeklyRateKg, units)} ${weightUnitLabel(units)} / sem.` : 'Tendance en cours'}
              </div>
            </>
          ) : (
            <div style={{ font: '600 16px/1.25 var(--font)' }}>Ajouter</div>
          )}
        </button>
        <button type="button" className="tile" onClick={() => openSheet('adherence')}>
          <div style={{ font: '500 11.5px var(--font)', color: 'var(--ink2)', marginBottom: 6 }}>Adhérence</div>
          <div style={{ font: '600 16px/1.25 var(--font)' }}>{log?.adherence ? ADHERENCE_LABEL[log.adherence] : 'À noter'}</div>
          <div style={{ font: '500 12px var(--font)', color: 'var(--ink2)', marginTop: 5 }}>Toucher pour noter</div>
        </button>
      </div>

      {due && store.preferences.weighInReminder ? (
        <p className="small" style={{ margin: '-14px 0 22px' }}>
          Prochaine pesée recommandée : {nextWeighInDate(store, today) === today ? 'aujourd’hui' : formatDayMonth(nextWeighInDate(store, today))}, le matin, à jeun.
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => go(recalibrationReady ? 'recalibration' : 'analyse')}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', background: 'none', border: 0, borderTop: '1px solid var(--line)', padding: '20px 0 0', color: 'var(--ink)' }}
      >
        <Mascot variant={recalibrationReady ? 'surpris' : 'normal'} width={44} />
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', font: '500 13.5px/1.4 var(--font)' }}>{statusTitle}</span>
          <span style={{ display: 'block', font: '400 12.5px var(--font)', color: 'var(--ink2)', marginTop: 3 }}>Confiance : {CONFIDENCE_LABEL[calibration?.confidence ?? 'low']}</span>
        </span>
        <span className="chevron" aria-hidden="true">
          ›
        </span>
      </button>
    </main>
  );
}
