import { useEffect, useState } from 'react';
import { useNav } from '@/app/navigation';
import { useWheighty } from '@/store/StoreProvider';
import { ADHERENCE_LABEL, PERIOD_TEXT } from '@/app/copy';
import { BottomSheet } from '@/components/BottomSheet';
import { Range, Segmented } from '@/components/controls';
import { addWeight, setActualSteps, setAdherence } from '@/domain/engine';
import { formatInteger, formatWeight, lbToKg, weightUnitLabel } from '@/domain/format';
import { latestRawWeight } from '@/domain/engine';
import { todayLog } from '@/domain/views';
import { addDays } from '@/science/dates';
import { STEPS_MAX_PER_DAY, WEIGHT_MAX_KG, WEIGHT_MIN_KG } from '@/science/constants';
import type { DailyLog } from '@/science/types';

type DayChoice = 'today' | 'yesterday';

function DayPicker({ value, onChange }: { value: DayChoice; onChange: (v: DayChoice) => void }) {
  return (
    <Segmented
      label="Jour"
      options={[
        { value: 'today', label: 'Aujourd’hui' },
        { value: 'yesterday', label: 'Hier' },
      ]}
      value={value}
      onChange={onChange}
      className="day-picker"
    />
  );
}

export function WeighSheet() {
  const { sheet, closeSheet, showToast } = useNav();
  const { store, update, today, nowIso } = useWheighty();
  const open = sheet === 'weigh';
  const units = store.preferences.units;
  const [value, setValue] = useState('');
  const [day, setDay] = useState<DayChoice>('today');
  const [error, setError] = useState<string | null>(null);
  // C-01: noted with the weigh-in, journaling only. Unchecked on every opening.
  const [menstruating, setMenstruating] = useState(false);
  const asksPeriod = store.profile?.sexForEquation === 'female';

  useEffect(() => {
    if (!open) return;
    const last = latestRawWeight(store);
    setValue(last ? formatWeight(last.weightKg, units).replace(/[\s\u202F]/g, '') : '');
    setDay('today');
    setError(null);
    setMenstruating(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const key = (k: string) => {
    setError(null);
    setValue((v) => {
      if (k === 'del') return v.slice(0, -1);
      if (k === ',') return v.includes(',') || v === '' ? v : `${v},`;
      const [int = '', frac] = v.split(',');
      if (frac !== undefined) return frac.length >= 1 ? v : `${v}${k}`;
      if (int.length >= 3) return v;
      return v === '0' ? k : `${v}${k}`;
    });
  };

  const save = () => {
    const n = Number(value.replace(',', '.'));
    const kg = units === 'imperial' ? lbToKg(n) : n;
    if (!Number.isFinite(n) || value === '' || kg < WEIGHT_MIN_KG || kg > WEIGHT_MAX_KG) {
      setError('Ce poids semble incorrect.');
      return;
    }
    const date = day === 'today' ? today : addDays(today, -1);
    update((s) => addWeight(s, { date, weightKg: kg, ...(asksPeriod && menstruating ? { menstruating: true } : {}) }, nowIso()));
    closeSheet();
    showToast('Pesée enregistrée. Tendance mise à jour.');
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'];
  return (
    <BottomSheet open={open} onClose={closeSheet} title="Nouvelle pesée" lead="Le matin, à jeun, si possible.">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, padding: '6px 0 8px' }} aria-live="polite">
        <span className="tabular" style={{ font: '600 74px/1 var(--font)', letterSpacing: '-0.05em', color: value ? 'var(--ink)' : 'var(--ink2)' }}>
          {value || '0'}
        </span>
        <span className="unit" style={{ fontSize: 18 }}>
          {weightUnitLabel(units)}
        </span>
      </div>
      {/* D4: the slot is always there, so the panel keeps its height when the error appears. */}
      <p className="field-error field-error--slot" role="alert" style={{ textAlign: 'center' }}>
        {error ?? ''}
      </p>
      <div style={{ margin: '14px 0 18px' }}>
        <DayPicker value={day} onChange={setDay} />
      </div>
      {asksPeriod ? (
        <button type="button" role="checkbox" aria-checked={menstruating} className="checkbox" style={{ paddingTop: 0, marginBottom: 18 }} onClick={() => setMenstruating(!menstruating)}>
          <span className="checkbox__box" aria-hidden="true">
            {menstruating ? '✓' : ''}
          </span>
          <span>
            {PERIOD_TEXT.label}
            <span style={{ display: 'block', font: '400 12px var(--font)', color: 'var(--ink2)', marginTop: 2 }}>{PERIOD_TEXT.hint}</span>
          </span>
        </button>
      ) : null}
      <div className="keypad">
        {keys.map((k) => (
          <button key={k} type="button" onClick={() => key(k)} aria-label={k === 'del' ? 'Effacer' : k === ',' ? 'Virgule' : k}>
            {k === 'del' ? '⌫' : k}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn--primary" style={{ marginTop: 18 }} onClick={save}>
        Enregistrer
      </button>
    </BottomSheet>
  );
}

export function AdherenceSheet() {
  const { sheet, closeSheet, showToast } = useNav();
  const { store, update, today } = useWheighty();
  const open = sheet === 'adherence';
  const [day, setDay] = useState<DayChoice>('today');
  const date = day === 'today' ? today : addDays(today, -1);
  const current = store.dailyLogs.find((l) => l.date === date)?.adherence ?? null;
  const [choice, setChoice] = useState<NonNullable<DailyLog['adherence']> | null>(current);

  useEffect(() => {
    if (open) setChoice(store.dailyLogs.find((l) => l.date === date)?.adherence ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, date]);

  useEffect(() => {
    if (open) setDay('today');
  }, [open]);

  const options = (['on_plan', 'minor_deviation', 'major_deviation'] as const).map((v) => ({ value: v, label: ADHERENCE_LABEL[v] }));
  const onboardingDate = store.meta.onboardingDate;
  const yesterdayAllowed = onboardingDate !== null && addDays(today, -1) >= onboardingDate;

  return (
    <BottomSheet open={open} onClose={closeSheet} title="Ta journée" lead="Une seule question. Ça aide à recalibrer.">
      {yesterdayAllowed ? (
        <div style={{ marginBottom: 16 }}>
          <DayPicker value={day} onChange={setDay} />
        </div>
      ) : null}
      <div role="radiogroup" aria-label="Adhérence" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={choice === o.value} className="opt-row" onClick={() => setChoice(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="small" style={{ margin: '0 0 20px' }}>
        Aucun jugement : un écart noté vaut mieux qu’un écart ignoré, le modèle reste juste.
      </p>
      <button
        type="button"
        className="btn btn--primary"
        disabled={choice === null}
        onClick={() => {
          update((s) => setAdherence(s, date, choice));
          closeSheet();
          showToast('Journée notée.');
        }}
      >
        Valider
      </button>
      {/* D4: reserved slot, so switching to "Hier" never resizes the panel under the finger. */}
      <div className="ghost-slot">
        {current ? (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              update((s) => setAdherence(s, date, null));
              closeSheet();
            }}
          >
            Effacer la note
          </button>
        ) : null}
      </div>
    </BottomSheet>
  );
}

const STEPS_SHEET_MAX = 30000;

export function StepsSheet() {
  const { sheet, closeSheet, showToast } = useNav();
  const { store, update, today } = useWheighty();
  const open = sheet === 'steps';
  const [day, setDay] = useState<DayChoice>('today');
  const date = day === 'today' ? today : addDays(today, -1);
  const [steps, setSteps] = useState(0);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) return;
    const log = store.dailyLogs.find((l) => l.date === date);
    const initial = log?.actualSteps ?? todayLog(store, today)?.actualSteps ?? store.plan?.stepTarget ?? 0;
    setSteps(initial);
    setTyped(String(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, date]);
  useEffect(() => {
    if (open) setDay('today');
  }, [open]);

  const onboardingDate = store.meta.onboardingDate;
  const yesterdayAllowed = onboardingDate !== null && addDays(today, -1) >= onboardingDate;

  return (
    <BottomSheet open={open} onClose={closeSheet} title="Pas du jour" lead="Recopie le total de ton téléphone.">
      {yesterdayAllowed ? (
        <div style={{ marginBottom: 12 }}>
          <DayPicker value={day} onChange={setDay} />
        </div>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, padding: '10px 0 16px' }}>
        <label className="sr-only" htmlFor="steps-input">
          Nombre de pas
        </label>
        <input
          id="steps-input"
          inputMode="numeric"
          value={typed}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 5);
            setTyped(digits);
            const n = Number(digits || '0');
            setSteps(Math.min(STEPS_MAX_PER_DAY, n));
          }}
          style={{ width: 210, textAlign: 'right', border: 0, background: 'transparent', padding: 0, font: '600 64px/1 var(--font)', letterSpacing: '-0.05em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}
        />
        <span className="unit" style={{ fontSize: 17 }}>
          pas
        </span>
      </div>
      <Range
        value={Math.min(steps, STEPS_SHEET_MAX)}
        min={0}
        max={STEPS_SHEET_MAX}
        step={100}
        size="lg"
        onChange={(v) => {
          setSteps(v);
          setTyped(String(v));
        }}
        label="Pas du jour"
        valueText={`${formatInteger(steps)} pas`}
      />
      <button
        type="button"
        className="btn btn--primary"
        style={{ marginTop: 12 }}
        onClick={() => {
          update((s) => setActualSteps(s, date, steps));
          closeSheet();
          showToast('Pas enregistrés.');
        }}
      >
        Enregistrer
      </button>
    </BottomSheet>
  );
}
