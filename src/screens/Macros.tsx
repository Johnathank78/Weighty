import { useNav } from '@/app/navigation';
import { useWheighty } from '@/store/StoreProvider';
import { PROTEIN_RULE_TEXT } from '@/app/copy';
import { formatGrams, formatNumber } from '@/domain/format';
import { displayMacros, macroEnergyShares } from '@/domain/views';

export function MacrosScreen() {
  const { back, openSheet } = useNav();
  const { store } = useWheighty();
  const plan = store.plan;
  const profile = store.profile;
  if (!plan || !profile) return null;
  const m = displayMacros(plan);
  const shares = macroEnergyShares(m);
  const refWeight = plan.planWeightKg ?? profile.currentWeightKg;
  const units = store.preferences.units;
  const perKg = units === 'imperial' ? null : formatNumber(m.proteinG / refWeight, 1);
  const warnings = plan.warnings;

  const items = [
    { color: 'var(--coral)', value: m.proteinG, label: 'g protéines', text: `${PROTEIN_RULE_TEXT[plan.proteinRule ?? ''] ?? ''}${perKg ? ` Environ ${perKg} g par kg de poids.` : ''}` },
    { color: 'var(--peach)', value: m.carbsG, label: 'g glucides', text: warnings?.lowCarbForEndurance || warnings?.lowCarbForResistance ? 'Ils complètent ton apport. Ce niveau est plutôt bas pour soutenir tes entraînements : garde-les autour des séances.' : 'Ils complètent ton apport une fois protéines et lipides fixés.' },
    { color: 'var(--sand)', value: m.fatG, label: 'g lipides', text: 'Entre 25 et 30 % de ton énergie, et jamais sous 20 %.' },
  ];

  return (
    <main className="screen">
      <button type="button" className="back" onClick={back}>
        ‹ Plan
      </button>
      <h1 className="h-page">Macros</h1>
      <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', marginBottom: 30 }} role="img" aria-label={`Répartition de l’énergie : protéines ${Math.round(shares.protein * 100)} %, glucides ${Math.round(shares.carbs * 100)} %, lipides ${Math.round(shares.fat * 100)} %`}>
        <div style={{ width: `${shares.protein * 100}%`, background: 'var(--coral)' }} />
        <div style={{ width: `${shares.carbs * 100}%`, background: 'var(--peach)' }} />
        <div style={{ width: `${shares.fat * 100}%`, background: 'var(--sand)' }} />
      </div>
      {items.map((it) => (
        <div key={it.label} style={{ paddingBottom: 18, borderBottom: '1px solid var(--line)', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: it.color }} aria-hidden="true" />
            <span className="tabular" style={{ font: '600 42px/1 var(--font)', letterSpacing: '-0.04em' }}>
              {formatGrams(it.value)}
            </span>
            <span style={{ font: '500 14px var(--font)', color: 'var(--ink2)' }}>{it.label}</span>
          </div>
          <p style={{ margin: '8px 0 0', font: '400 13px/1.5 var(--font)', color: 'var(--ink2)' }}>{it.text}</p>
        </div>
      ))}
      <button type="button" className="link" style={{ display: 'block', width: '100%', padding: '0 0 14px' }} onClick={() => openSheet('why', 'macros')}>
        Pourquoi autant de protéines ?
      </button>
      <button type="button" className="link" style={{ display: 'block', width: '100%' }} onClick={() => openSheet('why', 'macros')}>
        Comment cette répartition est calculée ?
      </button>
    </main>
  );
}
