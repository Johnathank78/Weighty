import { useMemo } from 'react';
import { useNav } from '@/app/navigation';
import { useWheighty } from '@/store/StoreProvider';
import { BottomSheet } from '@/components/BottomSheet';
import { Mascot } from '@/components/Mascot';
import { ResultExplanationView } from '@/components/ResultExplanationView';
import { explainCurrentPlan, explainPreview } from '@/domain/explain';
import { draftToEvidence, draftToProfile } from '@/domain/onboarding';

export function WhySheet() {
  const { sheet, closeSheet, whyTopic, draft } = useNav();
  const { store, today } = useWheighty();
  const open = sheet === 'why';
  const details = store.preferences.showScientificDetails;
  const units = store.preferences.units;
  // Explanation of the plan actually shown: the stored plan in the app, the draft preview on the Result screen.
  const explanation = useMemo(() => {
    if (!open || whyTopic !== 'estimate') return null;
    if (store.plan && store.profile) return explainCurrentPlan(store, today);
    const profile = draftToProfile(draft, units);
    return profile ? explainPreview(profile, today, draftToEvidence(draft, units, today)) : null;
  }, [open, whyTopic, store, today, draft, units]);

  const title = whyTopic === 'macros' ? 'Comment tes macros sont calculées ?' : whyTopic === 'recalibration' ? 'Pourquoi ce changement ?' : whyTopic === 'nodata' ? 'Comment Wheighty apprend ?' : 'Pourquoi ce résultat ?';

  return (
    <BottomSheet open={open} onClose={closeSheet} title={title} hideTitle>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 20 }}>
        <Mascot variant="search" width={52} />
        <h3 style={{ margin: 0, font: '700 20px/1.3 var(--font-display)', letterSpacing: '-0.02em' }} aria-hidden="true">
          {title}
        </h3>
      </div>

      {whyTopic === 'macros' ? (
        <>
          <p className="body" style={{ marginBottom: 16 }}>
            Les protéines dépendent de ton objectif et de ton entraînement, rapportées à ton poids. Au-delà du poids correspondant à un IMC de 25, seule une partie de l’excédent est comptée, pour éviter des quantités excessives, et Wheighty ne dépasse jamais 2,2 g par kg.
          </p>
          <p className="body" style={{ marginBottom: 16 }}>
            Les lipides visent 25 à 30 % de l’énergie, jamais sous 20 %. Les glucides complètent le reste de ton apport.
          </p>
          <p className="body" style={{ marginBottom: 20 }}>
            La digestion consomme une partie de l’énergie apportée. Le modèle dynamique du poids en tient compte avec sa valeur moyenne publiée ; l’écart entre protéines, glucides et lipides reste une information indicative.
          </p>
        </>
      ) : whyTopic === 'recalibration' || whyTopic === 'nodata' ? (
        <>
          <p className="body" style={{ marginBottom: 16 }}>
            Wheighty compare tes pesées réelles à ce qu’un modèle dynamique du poids prédit avec ton plan. Ce modèle tient compte de l’eau, du glycogène et de l’adaptation du corps, pas d’une règle fixe de calories par kilo.
          </p>
          <p className="body" style={{ marginBottom: 16 }}>
            Les journées notées « écart important » ne servent pas de preuve, les écarts légers comptent moins. Il faut au moins 5 pesées sur 14 jours et des journées notées pour qu’un premier ajustement soit fiable.
          </p>
          <p className="body" style={{ marginBottom: 20 }}>Plus tes pesées et tes journées notées sont régulières, plus l’estimation peut s’affiner.</p>
        </>
      ) : explanation ? (
        <ResultExplanationView x={explanation} units={units} details={details} />
      ) : (
        <p className="body" style={{ marginBottom: 20 }}>
          Complète ton profil pour voir le détail du calcul.
        </p>
      )}
      <button type="button" className="btn btn--outline" onClick={closeSheet}>
        Compris
      </button>
    </BottomSheet>
  );
}
