import { useEffect, useMemo, useState } from 'react';
import { useNav } from '@/app/navigation';
import { useWheighty } from '@/store/StoreProvider';
import { PLAN_ERROR_TEXT } from '@/app/copy';
import { BottomSheet } from '@/components/BottomSheet';
import { Mascot } from '@/components/Mascot';
import { Range } from '@/components/controls';
import { applySliderSteps, createSliderSession } from '@/domain/engine';
import { formatKcal, formatSignedKcal, formatSignedWeight, formatSteps, weightUnitLabel } from '@/domain/format';

export function BalanceSheet() {
  const { sheet, closeSheet, showToast } = useNav();
  const { store, commit, today } = useWheighty();
  const open = sheet === 'balance';
  const plan = store.plan;
  const units = store.preferences.units;
  // Heavy solve done once per opening; each position is then cached by the session.
  const session = useMemo(() => (open && plan ? createSliderSession(store, today) : null), [open, plan?.createdAt, plan?.maintenanceKcal, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const [steps, setSteps] = useState(plan?.stepTarget ?? 0);

  useEffect(() => {
    if (open && plan) setSteps(plan.stepTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !plan || !session) return null;

  const { bounds, effectiveMinSteps } = session;
  const clamped = Math.min(bounds.maxSteps, Math.max(effectiveMinSteps, steps));
  const point = session.pointAt(clamped);
  const atFloor = clamped <= effectiveMinSteps && effectiveMinSteps > bounds.minSteps;

  let warn: string;
  let tone: 'calm' | 'warn' = 'calm';
  if (atFloor) {
    warn = 'Impossible d’aller plus bas : les calories passeraient sous le plancher de sécurité.';
    tone = 'warn';
  } else if (point.zone === 'caution' && clamped < bounds.recommendedMinSteps) {
    warn = 'Moins de pas, donc moins de calories à manger. Ce réglage demande plus de rigueur à table.';
    tone = 'warn';
  } else if (point.zone === 'caution') {
    warn = `Plus de ${formatSteps(bounds.recommendedMaxSteps)} pas par jour, tous les jours : réalisable, mais peu tolérant aux semaines chargées.`;
    tone = 'warn';
  } else {
    warn = 'Réglage équilibré : ce compromis tient dans la durée.';
  }

  const save = () => {
    const r = applySliderSteps(store, today, clamped);
    if (!r.ok) {
      showToast(PLAN_ERROR_TEXT[r.reason] ?? 'Réglage impossible.');
      return;
    }
    commit(r.store);
    closeSheet();
    showToast('Réglage enregistré. Ta trajectoire reste la même.');
  };

  return (
    <BottomSheet open onClose={closeSheet} title="Manger ↔ Marcher" lead="Glisse pour arbitrer. Marcher plus t’autorise à manger plus, mais pas kcal pour kcal.">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 26 }} aria-live="polite">
        <div>
          <div className="tabular" style={{ font: '600 46px/1 var(--font)', letterSpacing: '-0.045em' }}>
            {formatKcal(point.calorieTargetKcal)}
          </div>
          <div className="eyebrow" style={{ fontSize: 12, marginTop: 5 }}>
            kcal / jour
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="tabular" style={{ font: '600 46px/1 var(--font)', letterSpacing: '-0.045em' }}>
            {formatSteps(clamped)}
          </div>
          <div className="eyebrow" style={{ fontSize: 12, marginTop: 5 }}>
            pas / jour
          </div>
        </div>
      </div>

      <Range
        size="lg"
        value={clamped}
        min={bounds.minSteps}
        max={bounds.maxSteps}
        step={100}
        lowerLimit={effectiveMinSteps}
        blockedBelow={effectiveMinSteps}
        zone={[bounds.recommendedMinSteps, bounds.recommendedMaxSteps]}
        onChange={setSteps}
        label="Équilibre entre calories et pas"
        valueText={`${formatSteps(clamped)} pas, ${formatKcal(point.calorieTargetKcal)} kilocalories`}
      />
      <div className="range-legend" style={{ marginBottom: 20 }}>
        <span>Manger moins</span>
        <span style={{ color: 'var(--acc)', fontWeight: 600 }}>Zone recommandée</span>
        <span>Marcher plus</span>
      </div>

      <div className={`note ${tone === 'warn' ? 'note--warn' : ''}`}>
        <Mascot variant="search" width={38} />
        <span>{warn}</span>
      </div>

      <div className="rows" style={{ marginTop: 22, marginBottom: 22 }}>
        <div className="row">
          <span className="row__label">{point.initialEnergyBalanceKcal <= 0 ? 'Déficit initial' : 'Surplus initial'}</span>
          <span className="row__value" style={{ fontSize: 15 }}>
            {formatSignedKcal(point.initialEnergyBalanceKcal)} kcal / j
          </span>
        </div>
        <div className="row">
          <span className="row__label">Évolution projetée sur 6 semaines</span>
          <span className="row__value" style={{ fontSize: 15 }}>
            {formatSignedWeight(point.projectedWeeklyChangeKg, units, 2)} {weightUnitLabel(units)} / sem.
          </span>
        </div>
      </div>

      <button type="button" className="btn btn--primary" onClick={save} disabled={!point.macroFeasible || point.belowHardFloor}>
        Enregistrer ce réglage
      </button>
    </BottomSheet>
  );
}
