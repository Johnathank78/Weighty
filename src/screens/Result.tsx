import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useNav } from '@/app/navigation';
import { useWheighty } from '@/store/StoreProvider';
import { CONFIDENCE_LABEL, PLAN_ERROR_TEXT, WARM_START_TEXT } from '@/app/copy';
import { Mascot } from '@/components/Mascot';
import { ConfidenceBar } from '@/components/controls';
import { completeOnboarding, previewInitialPlan, updateProfile } from '@/domain/engine';
import { formatGrams, formatKcal, formatKcalRange, formatRatePercent, formatSteps } from '@/domain/format';
import { draftToEvidence, draftToProfile } from '@/domain/onboarding';
import { displayMacros, warmStartView } from '@/domain/views';

export function ResultScreen() {
  const { draft, go, openSheet, showToast } = useNav();
  const { store, commit, today, nowIso } = useWheighty();
  const profile = useMemo(() => draftToProfile(draft, store.preferences.units), [draft, store.preferences.units]);
  const evidence = useMemo(() => draftToEvidence(draft, store.preferences.units, today), [draft, store.preferences.units, today]);
  const preview = useMemo(() => (profile ? previewInitialPlan(profile, today, evidence) : null), [profile, today, evidence]);

  if (!profile || !preview) {
    return (
      <main className="screen--moment">
        <Mascot variant="search" width={96} className="center" />
        <h2 className="h-screen" style={{ textAlign: 'center', marginTop: 20 }}>
          Il manque une information
        </h2>
        <p className="body" style={{ textAlign: 'center', marginTop: 10 }}>
          Reprends les étapes précédentes pour compléter ton profil.
        </p>
        <div className="spacer" />
        <button type="button" className="btn btn--primary" onClick={() => go('onboarding')}>
          Revenir au profil
        </button>
      </main>
    );
  }

  if (!preview.ok) {
    return (
      <main className="screen--moment">
        <div style={{ display: 'grid', placeItems: 'center', marginTop: 40 }}>
          <Mascot variant="search" width={96} />
        </div>
        <h2 className="h-screen" style={{ textAlign: 'center', marginTop: 20 }}>
          Ajustons ton objectif
        </h2>
        <p className="body" style={{ textAlign: 'center', marginTop: 10 }}>
          {PLAN_ERROR_TEXT[preview.reason] ?? PLAN_ERROR_TEXT.no_feasible_speed}
        </p>
        <div className="spacer" />
        <button type="button" className="btn btn--primary" onClick={() => go('onboarding')}>
          Modifier mon objectif
        </button>
      </main>
    );
  }

  const { plan, goalPlan } = preview;
  const macros = displayMacros(plan);
  const warm = warmStartView(preview.warmStart);

  const start = () => {
    if (draft.mode === 'edit') {
      const r = updateProfile(store, today, profile);
      if (!r.ok) {
        showToast(PLAN_ERROR_TEXT[r.reason] ?? 'Impossible de recalculer le plan.');
        return;
      }
      commit(r.store);
      showToast('Profil mis à jour. Ton plan a été recalculé.');
      go('plan', { replace: true });
      return;
    }
    const r = completeOnboarding(store, profile, today, nowIso(), evidence);
    if (!r.ok) {
      showToast(PLAN_ERROR_TEXT[r.reason] ?? 'Impossible de créer le plan.');
      return;
    }
    commit(r.store);
    go('today', { replace: true });
  };

  return (
    <main className="screen--moment screen--sticky-cta">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, padding: '6px 4px 0' }}>
        <div style={{ textAlign: 'right' }}>
          <p className="eyebrow" style={{ margin: 0 }}>
            {draft.mode === 'edit' ? 'Nouvelle estimation' : 'Première estimation'}
          </p>
          <h2 style={{ margin: 0, font: '700 21px/1.25 var(--font-display)', letterSpacing: '-0.02em' }}>Voilà ton point de départ</h2>
        </div>
        <Mascot variant="search" width={56} float />
      </header>

      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '28px 0' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="tabular" style={{ font: '600 68px/1 var(--font)', letterSpacing: '-0.05em' }}>
            {formatKcal(plan.calorieTarget)}
          </div>
          <div className="eyebrow" style={{ fontSize: 13, marginTop: 4 }}>
            kcal par jour
          </div>
        </div>
        <div style={{ display: 'flex', gap: 22, justifyContent: 'center', marginTop: 18 }}>
          <div style={{ textAlign: 'center' }}>
            <div className="tabular" style={{ font: '600 26px/1 var(--font)', letterSpacing: '-0.03em' }}>{formatSteps(plan.stepTarget)}</div>
            <div className="eyebrow" style={{ fontSize: 11.5, marginTop: 4 }}>
              pas / jour
            </div>
          </div>
          <div style={{ width: 1, background: 'var(--line)' }} />
          <div style={{ textAlign: 'center' }}>
            <div className="tabular" style={{ font: '600 26px/1 var(--font)', letterSpacing: '-0.03em' }}>{formatKcal(plan.maintenanceKcal)}</div>
            <div className="eyebrow" style={{ fontSize: 11.5, marginTop: 4 }}>
              maintien estimé
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {(
            [
              [macros.proteinG, 'g protéines'],
              [macros.carbsG, 'g glucides'],
              [macros.fatG, 'g lipides'],
            ] as const
          ).map(([v, l]) => (
            <div key={l} style={{ flex: 1, background: 'var(--surf)', border: '1px solid var(--line)', borderRadius: 16, padding: '9px 8px', textAlign: 'center' }}>
              <div className="tabular" style={{ font: '600 18px var(--font)' }}>
                {formatGrams(v)}
              </div>
              <div style={{ font: '500 10.5px var(--font)', color: 'var(--ink2)', marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginBottom: 12, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ font: '500 12.5px var(--font)', color: 'var(--ink2)' }}>Confiance du modèle</span>
            <span style={{ font: '600 12.5px var(--font)' }}>{CONFIDENCE_LABEL[preview.confidence]}</span>
          </div>
          <ConfidenceBar level={preview.confidence} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            <span style={{ font: '500 12.5px var(--font)', color: 'var(--ink2)' }}>Fourchette actuelle</span>
            <span className="tabular" style={{ font: '600 13px var(--font)', whiteSpace: 'nowrap' }}>
              {formatKcalRange(plan.maintenanceInterval80)} kcal
            </span>
          </div>
          <p style={{ margin: '8px 0 0', font: '400 12px/1.45 var(--font)', color: 'var(--ink2)' }}>
            Ton maintien réel a 8 chances sur 10 d’être dans cette fourchette. Tes pesées l’affineront.
            {warm.given ? ` ${warm.reason === 'used' ? WARM_START_TEXT.used : WARM_START_TEXT[warm.reason ?? 'invalid']}` : ''}
          </p>
        </div>

        {warm.conflict ? <ResultNote>{WARM_START_TEXT.conflict}</ResultNote> : null}
        {goalPlan.rateAdjusted ? <ResultNote warn>Vitesse ajustée à {formatRatePercent(goalPlan.weeklyRateTarget)} par semaine pour respecter les limites de sécurité.</ResultNote> : null}
        {goalPlan.warnings.belowRee ? <ResultNote>Cet apport est inférieur à ton métabolisme au repos estimé. Ce n’est pas dangereux en soi, mais c’est un rythme exigeant.</ResultNote> : null}
        {goalPlan.warnings.lowEnergyAvailability ? <ResultNote warn>Avec ton volume d’entraînement, l’énergie disponible serait basse. Préfère une vitesse plus douce et reste attentif à la fatigue.</ResultNote> : null}
        {goalPlan.warnings.gainWithoutResistance ? <ResultNote>Une prise de poids rapide sans entraînement de résistance favorise moins la prise de masse maigre.</ResultNote> : null}

        <button type="button" className="link" style={{ width: '100%', textAlign: 'center' }} onClick={() => openSheet('why', 'estimate')}>
          Pourquoi ce résultat ?
        </button>
        <div className="sticky-cta">
          <button type="button" className="btn btn--primary" onClick={start}>
            {draft.mode === 'edit' ? 'Appliquer ce plan' : 'C’est parti'}
          </button>
        </div>
      </footer>
    </main>
  );
}

function ResultNote({ children, warn = false }: { children: ReactNode; warn?: boolean }) {
  return (
    <div className={`note note--compact ${warn ? 'note--warn' : ''}`} style={{ marginBottom: 10 }}>
      <Mascot variant="search" width={32} />
      <span>{children}</span>
    </div>
  );
}
