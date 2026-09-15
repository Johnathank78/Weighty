import { useEffect } from 'react';
import { Mascot } from '@/components/Mascot';
import { useNav } from '@/app/navigation';
import { emptyDraft } from '@/domain/onboarding';

export function SplashScreen({ next }: { next: 'intro' | 'today' }) {
  const { go } = useNav();
  useEffect(() => {
    const t = window.setTimeout(() => go(next, { replace: true }), 1100);
    return () => window.clearTimeout(t);
  }, [go, next]);
  return (
    <button type="button" className="screen--moment" onClick={() => go(next, { replace: true })} style={{ width: '100%', border: 0, background: 'none', alignItems: 'center', justifyContent: 'center', gap: 26 }} aria-label="Ouvrir Wheighty">
      <Mascot variant="normal" width={150} float alt="" />
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, font: '700 34px var(--font)', letterSpacing: '-0.03em', color: 'var(--ink)' }}>
        Wheighty<span className="accent">.</span>
      </span>
    </button>
  );
}

export function IntroScreen() {
  const { go, setDraft } = useNav();
  const steps = [
    'Estimer : 2 minutes de questions, pas un formulaire.',
    'Observer : une pesée tous les 3 jours suffit.',
    'Recalibrer : ton plan s’ajuste à ce que Wheighty observe.',
  ];
  return (
    <main className="screen--moment" style={{ paddingTop: 'calc(var(--safe-top) + 48px)' }}>
      {/* The free space above the text block centres the mascot; the text stays close to the button. */}
      <div className="intro-hero">
        <Mascot variant="normal" width={128} float />
      </div>
      <h1 style={{ margin: 0, font: '700 31px/1.15 var(--font-display)', letterSpacing: '-0.03em', color: 'var(--ink)' }}>
        Ton besoin
        <br />
        calorique, ajusté
        <br />à ton corps.
      </h1>
      <p style={{ margin: '16px 0 0', font: '400 15.5px/1.55 var(--font)', color: 'var(--ink2)' }}>
        On part d’une estimation, puis Wheighty observe ton poids et ton activité pour l’affiner semaine après semaine.
      </p>
      <ol style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '30px 0 0', padding: 0, listStyle: 'none' }}>
        {steps.map((s, i) => (
          <li key={s} style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}>
            <span style={{ flex: 'none', width: 26, height: 26, borderRadius: 9, background: 'var(--accl)', color: 'var(--acc)', display: 'grid', placeItems: 'center', font: '600 12px var(--font)' }}>{i + 1}</span>
            <span style={{ font: '500 14.5px/1.45 var(--font)', color: 'var(--ink)' }}>{s}</span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn btn--primary"
        style={{ marginTop: 32 }}
        onClick={() => {
          setDraft(() => emptyDraft());
          go('onboarding');
        }}
      >
        Commencer
      </button>
      <p style={{ margin: '14px 0 0', textAlign: 'center' }} className="small">
        Tes données restent sur cet appareil.
      </p>
      <p style={{ margin: '10px 0 0', textAlign: 'center', font: '400 11.5px/1.45 var(--font)', color: 'var(--ink2)' }}>
        Pour les adultes de 19 à 65 ans en bonne santé. Wheighty n’est pas un outil médical.
      </p>
    </main>
  );
}
