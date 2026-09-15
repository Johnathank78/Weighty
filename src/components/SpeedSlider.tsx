import { SPEED_LABEL, SPEED_LIMIT_TEXT, SPEED_NOTE, speedCautionText } from '@/app/copy';
import { Mascot } from '@/components/Mascot';
import { Range } from '@/components/controls';
import type { SpeedSliderModel } from '@/domain/engine';
import { formatNumber, formatRatePercent, kgToLb, weightUnitLabel } from '@/domain/format';
import type { UnitPreference } from '@/domain/types';
import { snapRate, speedZone, weeklyChangeKg } from '@/domain/views';

/**
 * Continuous weekly speed, in percent of body weight per week, connected to the goal engine:
 * the thumb cannot pass the fastest rate the engine accepts for this profile.
 */
export function SpeedSlider({ model, value, onChange, units }: { model: SpeedSliderModel; value: number; onChange: (rate: number) => void; units: UnitPreference }) {
  const zone = speedZone(model.goal, value);
  const kg = weeklyChangeKg(value, model.weightKg);
  const equivalent = `${formatNumber(units === 'imperial' ? kgToLb(kg) : kg, 2)} ${weightUnitLabel(units)} / sem.`;
  const limit = model.maxSelectableRate ?? model.minRate;
  const limited = limit < model.maxRate - 1e-9;
  const span = model.maxRate - model.minRate || 1;
  const position = (rate: number) => ((rate - model.minRate) / span) * 100;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
        <span className="label" style={{ margin: 0 }}>
          Vitesse
        </span>
        <span style={{ font: '600 13px var(--font)', color: 'var(--acc)' }}>{SPEED_LABEL[zone]}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="tabular" style={{ font: '600 30px/1.1 var(--font)', letterSpacing: '-0.03em', color: 'var(--ink)' }}>
          {formatRatePercent(value)} <span className="unit">/ sem.</span>
        </span>
        <span className="tabular" style={{ font: '500 14px var(--font)', color: 'var(--ink2)' }}>
          ≈ {equivalent}
        </span>
      </div>
      <Range
        value={value}
        min={model.minRate}
        max={model.maxRate}
        step={model.step}
        upperLimit={limit}
        onChange={(v) => onChange(snapRate(v))}
        label="Vitesse, en pourcentage du poids par semaine"
        valueText={`${formatRatePercent(value)} par semaine, environ ${equivalent}, ${SPEED_LABEL[zone]}`}
      />
      <div className="speed-zones" aria-hidden="true">
        {model.zones.map((z, i) => {
          const edge = i === 0 ? { left: 0, transform: 'none' } : i === model.zones.length - 1 ? { left: 'auto', right: 0, transform: 'none' } : { left: `${position((z.from + z.to) / 2)}%` };
          return (
            <span key={z.zone} data-on={z.zone === zone} style={edge}>
              {SPEED_LABEL[z.zone]}
            </span>
          );
        })}
      </div>
      <div className="range-legend" style={{ marginTop: 4 }}>
        <span>{formatRatePercent(model.minRate)}</span>
        <span>{formatRatePercent(model.maxRate)}</span>
      </div>
      {limited ? (
        <p className="small" style={{ margin: '8px 0 0' }}>
          {SPEED_LIMIT_TEXT} Maximum : {formatRatePercent(limit)} par semaine.
        </p>
      ) : null}
      <div className={`note ${zone === 'fast' ? 'note--warn' : ''}`} style={{ marginTop: 14 }}>
        <Mascot variant="search" width={40} />
        <span>
          {SPEED_NOTE[model.goal][zone]}
          {model.cautionAboveRate !== null && value > model.cautionAboveRate + 1e-9 ? ` ${speedCautionText(formatRatePercent(model.cautionAboveRate))}` : ''}
        </span>
      </div>
    </div>
  );
}
