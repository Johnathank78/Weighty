import { useMemo } from 'react';
import { useNav } from '@/app/navigation';
import { useWheighty } from '@/store/StoreProvider';
import { GOAL_LABEL, PROTEIN_RULE_TEXT, SPEED_LABEL } from '@/app/copy';
import { Mascot } from '@/components/Mascot';
import { formatGrams, formatKcal, formatNumber, formatRatePercent, formatSignedKcal, formatSteps, formatWeight, weightUnitLabel } from '@/domain/format';
import { currentWeightKg } from '@/domain/engine';
import { displayMacros, goalStatus, maintenanceZoneFor, planEnergyBalanceKcal, speedZone } from '@/domain/views';
import { sliderBoundsFor } from '@/domain/sliderView';

function BalancePreview() {
  const { openSheet } = useNav();
  const { store } = useWheighty();
  const plan = store.plan;
  if (!plan) return null;
  const b = sliderBoundsFor(plan);
  const pct = (v: number) => ((v - b.minSteps) / (b.maxSteps - b.minSteps || 1)) * 100;
  const pos = Math.max(0, Math.min(100, pct(plan.stepTarget)));
  return (
    <button type="button" onClick={() => openSheet('balance')} style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, padding: '16px 0 26px', color: 'var(--ink)' }} aria-label={`Équilibre alimentation et marche : ${formatSteps(plan.stepTarget)} pas. Ajuster`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ font: '500 12px var(--font)', color: 'var(--ink2)' }}>Équilibre alimentation / marche</span>
        <span style={{ font: '600 12.5px var(--font)', color: 'var(--acc)' }}>Ajuster</span>
      </div>
      <div style={{ position: 'relative', height: 22, display: 'flex', alignItems: 'center' }} aria-hidden="true">
        <div style={{ position: 'relative', width: '100%', height: 8, borderRadius: 5, background: 'var(--surf2)', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: `${pct(b.recommendedMinSteps)}%`, right: `${100 - pct(b.recommendedMaxSteps)}%`, top: 0, bottom: 0, background: 'var(--accl)' }} />
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pos}%`, borderRadius: 8, background: 'var(--grad)' }} />
        </div>
        <div style={{ position: 'absolute', left: `${pos}%`, top: '50%', width: 18, height: 18, marginLeft: -9, marginTop: -9, borderRadius: '50%', background: 'var(--knob)', boxShadow: '0 1px 6px rgba(32,32,30,.26)' }} />
      </div>
      <div className="range-legend" style={{ marginTop: 4, fontSize: 11 }}>
        <span>Manger</span>
        <span>Marcher</span>
      </div>
    </button>
  );
}

export function PlanScreen() {
  const { go, openSheet } = useNav();
  const { store, today } = useWheighty();
  const plan = store.plan;
  const balance = useMemo(() => (plan ? planEnergyBalanceKcal(store, today) : null), [plan, store, today]);
  if (!plan) return null;
  const units = store.preferences.units;
  const macros = displayMacros(plan);
  const weight = currentWeightKg(store);
  const target = plan.targetWeightKg ?? store.profile?.targetWeightKg ?? weight ?? 0;
  const zone = plan.goal === 'maintenance' ? maintenanceZoneFor(target) : null;
  const status = goalStatus(store);

  return (
    <main className="screen">
      <header style={{ padding: '8px 0 24px' }}>
        <div className="eyebrow">{GOAL_LABEL[plan.goal]}</div>
        <h1 className="h-screen">Ton plan</h1>
      </header>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22, marginBottom: 8 }}>
        <div>
          <div className="tabular" style={{ font: '600 62px/1 var(--font)', letterSpacing: '-0.05em' }}>
            {formatKcal(plan.calorieTarget)}
          </div>
          <div className="eyebrow" style={{ marginTop: 6 }}>
            kcal / jour
          </div>
        </div>
        <div style={{ paddingBottom: 4 }}>
          <div className="tabular" style={{ font: '600 34px/1 var(--font)', letterSpacing: '-0.04em' }}>
            {formatSteps(plan.stepTarget)}
          </div>
          <div className="eyebrow" style={{ marginTop: 6 }}>
            pas / jour
          </div>
        </div>
      </div>

      <BalancePreview />

      <div className="rows">
        <div className="row">
          <span className="row__label">Maintien estimé</span>
          <span className="row__value">{formatKcal(plan.maintenanceKcal)} kcal</span>
        </div>
        {plan.goal === 'maintenance' && zone ? (
          <div className="row">
            <span className="row__label">Zone de maintien</span>
            <span className="row__value accent">
              {formatWeight(zone.lowKg, units)} à {formatWeight(zone.highKg, units)} {weightUnitLabel(units)}
            </span>
          </div>
        ) : (
          <div className="row">
            <span className="row__label">{plan.goal === 'loss' ? 'Déficit initial' : 'Surplus initial'}</span>
            <span className="row__value accent">{balance === null ? '…' : `${formatSignedKcal(balance)} kcal`}</span>
          </div>
        )}
        <div className="row">
          <span className="row__label">Poids actuel</span>
          <span className="row__value">{weight === null ? '…' : `${formatWeight(weight, units)} ${weightUnitLabel(units)}`}</span>
        </div>
        <div className="row">
          <span className="row__label">{plan.goal === 'maintenance' ? 'Poids visé' : 'Poids cible'}</span>
          <span className="row__value">
            {formatWeight(target, units)} {weightUnitLabel(units)}
          </span>
        </div>
        {plan.goal !== 'maintenance' ? (
          <div className="row">
            <span className="row__label">Vitesse</span>
            <span className="row__value">
              {formatRatePercent(plan.weeklyRateTarget)} / sem. · {SPEED_LABEL[speedZone(plan.goal, plan.weeklyRateTarget)]}
            </span>
          </div>
        ) : null}
      </div>

      <button type="button" onClick={() => go('macros')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 0, padding: '22px 0 18px', color: 'var(--ink)' }}>
        <span style={{ font: '600 15px var(--font)' }}>Macros</span>
        <span className="tabular" style={{ font: '500 13.5px var(--font)', color: 'var(--ink2)' }}>
          {formatGrams(macros.proteinG)} · {formatGrams(macros.carbsG)} · {formatGrams(macros.fatG)} g&nbsp;&nbsp;›
        </span>
      </button>

      {/* Plan answers "what do I do?": no second projection block (Suivi shows the trajectory). */}
      <div className="rows">
        <div className="row">
          <span className="row__label">{plan.goal === 'maintenance' ? 'Zone de poids' : 'Échéance estimée'}</span>
          <span className="row__value">
            {plan.goal === 'maintenance'
              ? status.inMaintenanceZone === false
                ? 'Hors de la zone'
                : 'Zone tenue'
              : plan.projection.approximateWeeks !== undefined
                ? `~${plan.projection.approximateWeeks} sem.`
                : 'Au-delà de 2 ans'}
          </span>
        </div>
      </div>
      <button type="button" className="link" style={{ marginTop: 14 }} onClick={() => openSheet('why', 'estimate')}>
        Pourquoi ce résultat ?
      </button>
      {plan.warnings?.belowRee ? (
        <div className="note" style={{ marginTop: 16 }}>
          <Mascot variant="search" width={40} />
          <span>Apport sous ton métabolisme au repos estimé : rythme exigeant, reste attentif à la fatigue.</span>
        </div>
      ) : null}
      {store.preferences.showScientificDetails ? (
        <p className="small" style={{ marginTop: 16 }}>
          Plan {plan.source === 'recalibrated' ? 'recalibré' : plan.source === 'user_adjusted_slider' ? 'ajusté' : 'initial'} · rythme visé {formatNumber(plan.weeklyRateTarget * 100, 2)} % / sem. · {PROTEIN_RULE_TEXT[plan.proteinRule ?? ''] ?? ''}
        </p>
      ) : null}
    </main>
  );
}
