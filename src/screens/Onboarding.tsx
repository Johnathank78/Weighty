import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNav } from '@/app/navigation';
import { useWheighty } from '@/store/StoreProvider';
import { ACTIVITY_LABEL, BODY_FAT_METHOD_LABEL, INTENSITY_LABEL, OCCUPATION_LABEL, ONBOARDING_SECTION_LABEL, PACE_LABEL, TRACKING_QUALITY_LABEL, WARM_START_TEXT } from '@/app/copy';
import { BottomSheet } from '@/components/BottomSheet';
import { NumberField, OptionRows, Range, Segmented, Toggle, parseDecimal } from '@/components/controls';
import { SpeedSlider } from '@/components/SpeedSlider';
import { onboardingSpeedSliderModel } from '@/domain/engine';
import type { SpeedSliderModel } from '@/domain/engine';
import { KG_PER_LB, formatInteger, formatNumber, formatSignedWeight, formatWeight, kgToLb, lbToKg, weightUnitLabel } from '@/domain/format';
import {
  AGE_PLACEHOLDER,
  HEIGHT_PLACEHOLDER,
  WEIGHT_PLACEHOLDER,
  bumpAge,
  defaultWeeklyRate,
  draftHeightCm,
  draftToEvidence,
  draftToProfile,
  draftWeightKg,
  nextStep,
  onboardingActions,
  onboardingProgress,
  previousStep,
  validateStep,
  weightInputString,
} from '@/domain/onboarding';
import type { OnboardingDraft, StepErrors } from '@/domain/onboarding';
import type { UnitPreference } from '@/domain/types';
import { goalGuardrails } from '@/domain/views';
import { BODY_FAT_MIN_PERCENT, MEASURED_RMR_MAX_KCAL, MEASURED_RMR_MIN_KCAL, SESSION_DURATION_MAX_MIN, SESSIONS_MAX_PER_WEEK, STEPS_MAX_PER_DAY } from '@/science/constants';
import { isIsoDate } from '@/science/dates';
import type { ActivityIntensity, BodyFatMethod, Goal, MeasuredRmr, StructuredActivity, StructuredActivityType, TrackingQuality } from '@/science/types';

const ONB_STEPS_MAX = 25000;

/** Progress by main section; the current section fills screen by screen. */
export function SectionProgress({ draft }: { draft: OnboardingDraft }) {
  const progress = onboardingProgress(draft);
  const index = progress.sections.findIndex((s) => s.current);
  return (
    <div style={{ padding: '6px 0 26px' }}>
      <div className="onb-progress" role="progressbar" aria-label={`Étape ${index + 1} sur ${progress.sections.length} : ${ONBOARDING_SECTION_LABEL[progress.current]}`} aria-valuemin={1} aria-valuemax={progress.sections.length} aria-valuenow={index + 1}>
        {progress.sections.map((s) => (
          <span key={s.section} data-current={s.current}>
            <i style={{ width: `${Math.round(s.fill * 100)}%` }} />
          </span>
        ))}
      </div>
      <div className="onb-section">{ONBOARDING_SECTION_LABEL[progress.current]}</div>
    </div>
  );
}

function FieldError({ text }: { text: string | undefined }) {
  if (!text) return null;
  return (
    <p className="field-error" role="alert">
      {text}
    </p>
  );
}

export function OnboardingScreen() {
  const { draft, setDraft, go, back } = useNav();
  const { store, today } = useWheighty();
  const units = store.preferences.units;
  const [errors, setErrors] = useState<StepErrors>({});
  const [scopeOk, setScopeOk] = useState(draft.mode === 'edit');
  const [scopeError, setScopeError] = useState(false);
  const patch = (p: Partial<OnboardingDraft>) => setDraft((d) => ({ ...d, ...p }));
  const target = nextStep(draft);

  const goTo = (step: OnboardingDraft['step'] | 'result', extra: Partial<OnboardingDraft> = {}) => {
    setErrors({});
    if (step === 'result') {
      if (Object.keys(extra).length > 0) patch(extra);
      go('result');
      return;
    }
    const p: Partial<OnboardingDraft> = { ...extra, step };
    // "Poids aujourd'hui" of the calorie history is prefilled with the weight already entered.
    const weightKg = draftWeightKg(draft, units);
    if (step === 'historyDetails' && draft.historyEndWeight === '' && weightKg !== null) p.historyEndWeight = weightInputString(weightKg, units);
    // Entering the speed screen: keep the stored speed inside what the engine accepts for the current answers.
    if (step === 'speed' && draft.goal && draft.goal !== 'maintenance' && draft.weeklyRate !== null) {
      const profile = draftToProfile({ ...draft, ...p }, units);
      const model = profile ? onboardingSpeedSliderModel(profile, today, draftToEvidence({ ...draft, ...p }, units, today)) : null;
      if (model?.maxSelectableRate != null && draft.weeklyRate > model.maxSelectableRate) p.weeklyRate = model.maxSelectableRate;
    }
    patch(p);
    window.scrollTo({ top: 0 });
  };

  const next = () => {
    const e = validateStep(draft, units);
    const scopeMissing = draft.step === 'age' && !scopeOk;
    setErrors(e);
    setScopeError(scopeMissing);
    if (Object.values(e).some(Boolean) || scopeMissing) return;
    goTo(target);
  };
  const previous = () => {
    setErrors({});
    const prev = previousStep(draft);
    if (prev === 'exit') back();
    else patch({ step: prev });
  };

  const props = { draft, patch, errors, units };
  let content: ReactNode;
  switch (draft.step) {
    case 'name':
      content = <StepName {...props} />;
      break;
    case 'age':
      content = <StepAge {...props} scopeOk={scopeOk} setScopeOk={setScopeOk} scopeError={scopeError} />;
      break;
    case 'sex':
      content = <StepSex {...props} />;
      break;
    case 'height':
      content = <StepHeight {...props} />;
      break;
    case 'weight':
      content = <StepWeight {...props} />;
      break;
    case 'body':
      content = <StepBody {...props} />;
      break;
    case 'occupation':
      content = <StepOccupation {...props} />;
      break;
    case 'steps':
      content = <StepSteps {...props} />;
      break;
    case 'training':
      content = <StepTraining {...props} />;
      break;
    case 'history':
      content = <StepHistory {...props} />;
      break;
    case 'historyDetails':
      content = <StepHistoryDetails {...props} />;
      break;
    case 'goal':
      content = <StepGoal {...props} today={today} />;
      break;
    case 'speed':
      content = <StepSpeed {...props} today={today} />;
      break;
  }

  return (
    <main className="screen screen--flow" key={draft.step}>
      <button type="button" className="back" onClick={previous} style={{ paddingBottom: 4 }}>
        ‹ Retour
      </button>
      <SectionProgress draft={draft} />
      {content}
      <OnboardingActions draft={draft} onContinue={next} onSkip={() => goTo(target, { knowsBodyFat: false, bodyFatMethod: null, measuredRmr: null })} />
    </main>
  );
}

export function OnboardingActions({ draft, onContinue, onSkip }: { draft: OnboardingDraft; onContinue: () => void; onSkip: () => void }) {
  const { primaryLabel, showSkip } = onboardingActions(draft);
  return (
    <>
      {primaryLabel ? (
        <button type="button" className="btn btn--primary" style={{ marginTop: 34 }} onClick={onContinue}>
          {primaryLabel}
        </button>
      ) : null}
      {showSkip ? (
        <button type="button" className="btn btn--ghost" style={primaryLabel ? undefined : { marginTop: 34 }} onClick={onSkip}>
          Ignorer cette étape
        </button>
      ) : null}
    </>
  );
}

export type StepProps = { draft: OnboardingDraft; patch: (p: Partial<OnboardingDraft>) => void; errors: StepErrors; units: UnitPreference };

export function StepName({ draft, patch, errors }: StepProps) {
  return (
    <>
      <h2 className="h-flow">Comment tu t’appelles ?</h2>
      <p className="lead">Pour personnaliser l’app. Ces informations restent sur cet appareil.</p>
      <label className="label" htmlFor="onb-first-name">
        Prénom
      </label>
      <input id="onb-first-name" className="text-input" autoComplete="given-name" value={draft.firstName} maxLength={60} onChange={(e) => patch({ firstName: e.target.value })} />
      <FieldError text={errors.firstName} />
      <div style={{ height: 18 }} />
      <label className="label" htmlFor="onb-last-name">
        Nom
      </label>
      <input id="onb-last-name" className="text-input" autoComplete="family-name" value={draft.lastName} maxLength={60} onChange={(e) => patch({ lastName: e.target.value })} />
      <FieldError text={errors.lastName} />
      <p className="small" style={{ margin: '12px 0 0' }}>
        Facultatif.
      </p>
    </>
  );
}

export function StepAge({ draft, patch, errors, scopeOk, setScopeOk, scopeError }: StepProps & { scopeOk: boolean; setScopeOk: (v: boolean) => void; scopeError: boolean }) {
  return (
    <>
      <h2 className="h-flow">Quel âge as-tu ?</h2>
      <p className="lead">Les équations de dépense énergétique en tiennent compte.</p>
      <span className="label" id="age-label">
        Âge
      </span>
      <div className="stepper" style={{ marginBottom: errors.age ? 4 : 10 }}>
        <input
          aria-labelledby="age-label"
          inputMode="numeric"
          className="age-input"
          value={draft.age}
          placeholder={AGE_PLACEHOLDER}
          onChange={(e) => patch({ age: e.target.value.replace(/\D/g, '').slice(0, 2) })}
        />
        <span className="unit">ans</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="icon-btn" aria-label="Diminuer l’âge" onClick={() => patch({ age: bumpAge(draft.age, -1) })}>
          −
        </button>
        <button type="button" className="icon-btn" aria-label="Augmenter l’âge" onClick={() => patch({ age: bumpAge(draft.age, 1) })}>
          +
        </button>
      </div>
      <FieldError text={errors.age} />

      <button type="button" role="checkbox" aria-checked={scopeOk} className="checkbox checkbox--secondary" onClick={() => setScopeOk(!scopeOk)}>
        <span className="checkbox__box" aria-hidden="true">
          {scopeOk ? '✓' : ''}
        </span>
        <span>Je ne suis pas enceinte ni allaitante, et je n’ai pas de trouble alimentaire ou de condition médicale nécessitant un suivi nutritionnel spécifique.</span>
      </button>
      {scopeError && !scopeOk ? <FieldError text="Wheighty n’est pas adapté à ces situations. Parles-en plutôt à un professionnel de santé." /> : null}
    </>
  );
}

export function StepSex({ draft, patch, errors }: StepProps) {
  return (
    <>
      <h2 className="h-flow">Sexe physiologique</h2>
      <p className="lead">Utilisé uniquement dans les équations de dépense énergétique.</p>
      <Segmented
        label="Sexe physiologique"
        options={[
          { value: 'female', label: 'Femme' },
          { value: 'male', label: 'Homme' },
        ]}
        value={draft.sex}
        onChange={(v) => patch({ sex: v })}
      />
      <FieldError text={errors.sex} />
    </>
  );
}

export function StepHeight({ draft, patch, errors, units }: StepProps) {
  return (
    <>
      <h2 className="h-flow">Quelle est ta taille ?</h2>
      <p className="lead">Elle sert à l’estimation de ton métabolisme au repos.</p>
      {units === 'imperial' ? (
        <>
          <div style={{ display: 'flex', gap: 10 }}>
            <NumberField label="Pieds" value={draft.heightFeet} onChange={(v) => patch({ heightFeet: v })} unit="ft" inputMode="numeric" placeholder={HEIGHT_PLACEHOLDER.feet} />
            <NumberField label="Pouces" value={draft.heightInches} onChange={(v) => patch({ heightInches: v })} unit="in" inputMode="numeric" placeholder={HEIGHT_PLACEHOLDER.inches} />
          </div>
          <FieldError text={errors.height} />
        </>
      ) : (
        <NumberField label="Taille" value={draft.height} onChange={(v) => patch({ height: v })} unit="cm" inputMode="numeric" error={errors.height ?? null} placeholder={HEIGHT_PLACEHOLDER.metric} />
      )}
    </>
  );
}

export function StepWeight({ draft, patch, errors, units }: StepProps) {
  return (
    <>
      <h2 className="h-flow">Quel est ton poids actuel ?</h2>
      <p className="lead">Idéalement le matin, à jeun.</p>
      <NumberField label="Poids actuel" value={draft.weight} onChange={(v) => patch({ weight: v })} unit={weightUnitLabel(units)} error={errors.weight ?? null} placeholder={units === 'imperial' ? WEIGHT_PLACEHOLDER.imperial : WEIGHT_PLACEHOLDER.metric} />
    </>
  );
}

const METHODS: readonly BodyFatMethod[] = ['dxa', 'air_displacement_plethysmography', 'four_compartment', 'skinfold', 'consumer_bia', 'self_estimate'];

export function StepBody({ draft, patch, errors }: StepProps) {
  const [rmrOpen, setRmrOpen] = useState(false);
  return (
    <>
      <h2 className="h-flow">Composition corporelle</h2>
      <p className="lead">Optionnel. Une mesure fiable de masse grasse sert de contrôle et affine certains calculs.</p>

      <div className="row" style={{ borderTop: 0, alignItems: 'center', paddingTop: 0 }}>
        <span style={{ font: '600 14.5px var(--font)', color: 'var(--ink)' }}>Je connais ma masse grasse</span>
        <Toggle checked={draft.knowsBodyFat} onChange={(v) => patch({ knowsBodyFat: v })} label="Je connais ma masse grasse" />
      </div>

      {draft.knowsBodyFat ? (
        <div style={{ marginTop: 18 }}>
          <span className="label">Masse grasse</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
            <span style={{ font: '600 56px/1 var(--font)', letterSpacing: '-0.045em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(draft.bodyFat, 0)}</span>
            <span className="unit" style={{ fontSize: 18 }}>
              %
            </span>
          </div>
          <Range value={draft.bodyFat} min={BODY_FAT_MIN_PERCENT} max={50} step={1} onChange={(v) => patch({ bodyFat: v })} label="Masse grasse en pourcentage" valueText={`${draft.bodyFat} %`} />
          <div style={{ height: 22 }} />
          <span className="label">Méthode de mesure</span>
          <OptionRows
            label="Méthode de mesure"
            options={METHODS.map((m) => ({ value: m, label: BODY_FAT_METHOD_LABEL[m].label, hint: BODY_FAT_METHOD_LABEL[m].hint }))}
            value={draft.bodyFatMethod ?? null}
            onChange={(v) => patch({ bodyFatMethod: v })}
          />
          <FieldError text={errors.bodyFatMethod} />
          {draft.bodyFatMethod === 'consumer_bia' || draft.bodyFatMethod === 'self_estimate' ? (
            <p className="small" style={{ margin: '10px 0 0' }}>
              Noté pour ton suivi. Cette méthode est trop approximative pour modifier les calculs.
            </p>
          ) : null}
        </div>
      ) : null}

      <button type="button" className="link" style={{ width: '100%', marginTop: 22, padding: '12px 0', borderTop: '1px solid var(--line)' }} onClick={() => setRmrOpen(true)}>
        {draft.measuredRmr ? `Métabolisme mesuré : ${formatInteger(draft.measuredRmr.kcalPerDay)} kcal ›` : 'J’ai mesuré mon métabolisme de repos ›'}
      </button>
      <MeasuredRmrSheet open={rmrOpen} onClose={() => setRmrOpen(false)} value={draft.measuredRmr ?? null} onSave={(v) => patch({ measuredRmr: v })} defaultWeight={draft.weight} />
    </>
  );
}

function MeasuredRmrSheet({ open, onClose, value, onSave, defaultWeight }: { open: boolean; onClose: () => void; value: MeasuredRmr | null; onSave: (v: MeasuredRmr | null) => void; defaultWeight: string }) {
  const { store, today } = useWheighty();
  const units = store.preferences.units;
  const [kcal, setKcal] = useState(value ? String(value.kcalPerDay) : '');
  const [date, setDate] = useState(value?.measuredAt ?? today);
  const [weight, setWeight] = useState(value ? formatNumber(units === 'imperial' ? kgToLb(value.weightKgAtTest) : value.weightKgAtTest, 1) : defaultWeight);
  const [method, setMethod] = useState<MeasuredRmr['method']>(value?.method ?? 'indirect_calorimetry');
  const [conditions, setConditions] = useState(value?.conditionsKnown ?? true);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const k = parseDecimal(kcal);
    const w = parseDecimal(weight);
    if (k === null || k < MEASURED_RMR_MIN_KCAL || k > MEASURED_RMR_MAX_KCAL) return setError(`Indique une valeur entre ${formatInteger(MEASURED_RMR_MIN_KCAL)} et ${formatInteger(MEASURED_RMR_MAX_KCAL)} kcal.`);
    if (w === null) return setError('Indique ton poids le jour du test.');
    if (!isIsoDate(date) || date > today) return setError('Indique une date de test valide.');
    onSave({ kcalPerDay: k, measuredAt: date, weightKgAtTest: units === 'imperial' ? lbToKg(w) : w, method, conditionsKnown: conditions });
    setError(null);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Métabolisme mesuré" lead="Si ta calorimétrie indirecte est récente et ton poids stable depuis, elle sert de référence pour ton métabolisme au repos. Sinon, elle reste une information de contrôle.">
      <NumberField label="Résultat" value={kcal} onChange={setKcal} unit="kcal / jour" inputMode="numeric" />
      <div style={{ height: 14 }} />
      <label className="label" htmlFor="rmr-date">
        Date du test
      </label>
      <input id="rmr-date" type="date" className="text-input" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      <div style={{ height: 14 }} />
      <NumberField label="Poids le jour du test" value={weight} onChange={setWeight} unit={weightUnitLabel(units)} />
      <div style={{ height: 14 }} />
      <span className="label">Méthode</span>
      <Segmented
        label="Méthode"
        options={[
          { value: 'indirect_calorimetry', label: 'Calorimétrie indirecte' },
          { value: 'unknown', label: 'Je ne sais pas' },
        ]}
        value={method}
        onChange={setMethod}
      />
      <div className="row" style={{ alignItems: 'center', marginTop: 14 }}>
        <span className="row__label">À jeun et au repos lors du test</span>
        <Toggle checked={conditions} onChange={setConditions} label="Conditions du test connues" />
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className="btn btn--primary" style={{ marginTop: 20 }} onClick={save}>
        Utiliser cette valeur
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => {
          onSave(null);
          onClose();
        }}
      >
        Je n’ai pas fait de mesure
      </button>
    </BottomSheet>
  );
}

export function StepOccupation({ draft, patch, errors }: StepProps) {
  return (
    <>
      <h2 className="h-flow">Au travail, tu es surtout…</h2>
      <p className="lead">La posture de la journée compte, ta marche est gérée à part.</p>
      <Segmented label="Au travail, je suis surtout" options={(['seated', 'mixed', 'standing', 'physical'] as const).map((o) => ({ value: o, label: OCCUPATION_LABEL[o] }))} value={draft.occupation} onChange={(v) => patch({ occupation: v })} />
      <FieldError text={errors.occupation} />
      {draft.occupation === 'physical' ? (
        <p className="small" style={{ margin: '10px 0 0' }}>
          Métier physique : port de charges, chantier, manutention.
        </p>
      ) : null}
    </>
  );
}

export function StepSteps({ draft, patch }: StepProps) {
  return (
    <>
      <h2 className="h-flow">Combien de pas par jour ?</h2>
      <p className="lead">La moyenne des 7 derniers jours de ton téléphone, si tu l’as.</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
        <span style={{ font: '600 52px/1 var(--font)', letterSpacing: '-0.045em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{formatInteger(draft.steps)}</span>
        <span className="unit">pas</span>
      </div>
      <Range value={draft.steps} min={0} max={ONB_STEPS_MAX} step={100} onChange={(v) => patch({ steps: v })} label="Pas par jour en moyenne" valueText={`${formatInteger(draft.steps)} pas`} />
      <div className="range-legend" style={{ marginTop: 6 }}>
        <span>0</span>
        <span>{formatInteger(ONB_STEPS_MAX)}</span>
      </div>
      {draft.steps >= ONB_STEPS_MAX ? (
        <p className="small" style={{ margin: '10px 0 0' }}>
          Au-delà, saisis-la dans ton profil (jusqu’à {formatInteger(STEPS_MAX_PER_DAY)}).
        </p>
      ) : null}
      <div style={{ height: 26 }} />
      <span className="label">Allure de marche habituelle</span>
      <Segmented label="Allure de marche habituelle" options={(['slow', 'normal', 'brisk'] as const).map((p) => ({ value: p, label: PACE_LABEL[p] }))} value={draft.pace} onChange={(v) => patch({ pace: v })} />
    </>
  );
}

/**
 * Structured activities offered at onboarding. No walking or hiking choice: daily steps already
 * capture walking; an exceptional hike can go through "Autre". Existing walking or hiking entries
 * stay valid and keep the step and exercise overlap correction.
 */
export const ONBOARDING_ACTIVITY_TYPES: readonly StructuredActivityType[] = ['strength', 'running', 'cycling', 'swimming', 'team_sport', 'rowing', 'other'];

export function StepTraining({ draft, patch, errors }: StepProps) {
  const [editing, setEditing] = useState<{ index: number | null; activity: StructuredActivity } | null>(null);
  return (
    <>
      <h2 className="h-flow">Tes entraînements</h2>
      <p className="lead">Ajoute chaque sport pratiqué avec sa fréquence, sa durée et son intensité. Ta marche quotidienne est déjà comptée dans tes pas.</p>
      {draft.activities.length === 0 ? (
        <p className="small" style={{ margin: '0 0 12px' }}>
          Aucune activité pour l’instant.
        </p>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {draft.activities.map((a, i) => (
          <button key={`${a.type}-${i}`} type="button" className="opt-row" onClick={() => setEditing({ index: i, activity: a })}>
            <span>{ACTIVITY_LABEL[a.type]}</span>
            <span className="opt-row__hint">
              {a.sessionsPerWeek} × {a.durationMin} min · {INTENSITY_LABEL[a.intensity].toLowerCase()}
            </span>
          </button>
        ))}
      </div>
      <div className="chips">
        {ONBOARDING_ACTIVITY_TYPES.map((t) => (
          <button key={t} type="button" className="chip" onClick={() => setEditing({ index: null, activity: { type: t, sessionsPerWeek: 3, durationMin: 45, intensity: 'moderate' } })}>
            + {ACTIVITY_LABEL[t]}
          </button>
        ))}
      </div>
      <FieldError text={errors.activities} />
      {editing ? (
        <ActivitySheet
          key={`${editing.index ?? 'new'}-${editing.activity.type}`}
          initial={editing.activity}
          isNew={editing.index === null}
          onClose={() => setEditing(null)}
          onSave={(activity) => {
            if (!editing) return;
            const list = [...draft.activities];
            if (editing.index === null) list.push(activity);
            else list[editing.index] = activity;
            patch({ activities: list });
            setEditing(null);
          }}
          onDelete={() => {
            if (!editing || editing.index === null) return;
            patch({ activities: draft.activities.filter((_, i) => i !== editing.index) });
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

function Counter({ label, value, onChange, min, max, step, unit }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit: string }) {
  return (
    <div className="row" style={{ alignItems: 'center' }}>
      <span className="row__label">{label}</span>
      <span className="flex gap-8" style={{ alignItems: 'center' }}>
        <button type="button" className="icon-btn" aria-label={`Diminuer ${label}`} onClick={() => onChange(Math.max(min, value - step))}>
          −
        </button>
        <span className="row__value" style={{ minWidth: 64, textAlign: 'center' }} aria-live="polite">
          {value} {unit}
        </span>
        <button type="button" className="icon-btn" aria-label={`Augmenter ${label}`} onClick={() => onChange(Math.min(max, value + step))}>
          +
        </button>
      </span>
    </div>
  );
}

function ActivitySheet({ initial, isNew, onClose, onSave, onDelete }: { initial: StructuredActivity; isNew: boolean; onClose: () => void; onSave: (a: StructuredActivity) => void; onDelete: () => void }) {
  const [current, setCurrent] = useState<StructuredActivity>(initial);
  const set = (p: Partial<StructuredActivity>) => setCurrent((c) => ({ ...c, ...p }));
  return (
    <BottomSheet open onClose={onClose} title={ACTIVITY_LABEL[current.type]} lead="La fréquence seule ne suffit pas : la durée et l’intensité comptent autant.">
      <Counter label="Séances par semaine" value={current.sessionsPerWeek} onChange={(v) => set({ sessionsPerWeek: v })} min={1} max={SESSIONS_MAX_PER_WEEK} step={1} unit="" />
      <Counter label="Durée par séance" value={current.durationMin} onChange={(v) => set({ durationMin: v })} min={5} max={SESSION_DURATION_MAX_MIN} step={5} unit="min" />
      <div style={{ height: 18 }} />
      <span className="label">Intensité</span>
      <Segmented label="Intensité" options={(['light', 'moderate', 'vigorous'] as ActivityIntensity[]).map((i) => ({ value: i, label: INTENSITY_LABEL[i] }))} value={current.intensity} onChange={(v) => set({ intensity: v })} />
      <p className="small" style={{ margin: '10px 0 0' }}>
        Légère : tu parles facilement. Modérée : tu parles avec effort. Intense : quelques mots seulement.
      </p>
      <button type="button" className="btn btn--primary" style={{ marginTop: 22 }} onClick={() => onSave(current)}>
        Enregistrer
      </button>
      {!isNew ? (
        <button type="button" className="btn btn--ghost" style={{ color: 'var(--danger)' }} onClick={onDelete}>
          Retirer cette activité
        </button>
      ) : null}
    </BottomSheet>
  );
}

const QUALITIES: readonly TrackingQuality[] = ['high', 'medium', 'low'];

/** Optional calorie history (warm start). "Non" is selected by default. */
export function StepHistory({ draft, patch }: StepProps) {
  return (
    <>
      <h2 className="h-flow" style={{ marginBottom: 10 }}>
        Tu suis déjà tes calories ?
      </h2>
      <p className="optional-note">Facultatif. Si tu notes déjà ce que tu manges, ton historique récent peut affiner ta première estimation.</p>
      <Segmented
        label="Tu suis déjà tes calories ?"
        options={[
          { value: 'yes', label: 'Oui' },
          { value: 'no', label: 'Non' },
        ]}
        value={draft.tracksCalories ? 'yes' : 'no'}
        onChange={(v) => patch({ tracksCalories: v === 'yes' })}
      />
    </>
  );
}

export function StepHistoryDetails({ draft, patch, errors, units }: StepProps) {
  const days = parseDecimal(draft.historyDays);
  return (
    <>
      <h2 className="h-flow">Ton historique récent</h2>
      <p className="lead">Une moyenne suffit : Wheighty tient compte de l’incertitude.</p>
      <NumberField label="Apport moyen récent" value={draft.historyCalories} onChange={(v) => patch({ historyCalories: v })} unit="kcal / jour" inputMode="numeric" placeholder="1 650" error={errors.historyCalories ?? null} />
      <div style={{ height: 18 }} />
      <NumberField label="Sur combien de jours ?" value={draft.historyDays} onChange={(v) => patch({ historyDays: v.replace(/\D/g, '').slice(0, 3) })} unit="jours" inputMode="numeric" placeholder="14" error={errors.historyDays ?? null} />
      {days !== null && days >= 1 && days < 7 ? (
        <p className="small" style={{ margin: '8px 0 0' }}>
          {WARM_START_TEXT.insufficient_duration}
        </p>
      ) : null}
      <div style={{ height: 18 }} />
      <div style={{ display: 'flex', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <NumberField label="Poids au début" value={draft.historyStartWeight} onChange={(v) => patch({ historyStartWeight: v })} unit={weightUnitLabel(units)} placeholder={units === 'imperial' ? '155' : '70,2'} error={errors.historyStartWeight ?? null} />
        </div>
        <div style={{ flex: 1 }}>
          <NumberField label="Poids aujourd’hui" value={draft.historyEndWeight} onChange={(v) => patch({ historyEndWeight: v })} unit={weightUnitLabel(units)} error={errors.historyEndWeight ?? null} />
        </div>
      </div>
      <p className="small" style={{ margin: '8px 0 0' }}>
        Laisse vide si tu ne le connais pas.
      </p>
      <div style={{ height: 22 }} />
      <span className="label">Ton suivi alimentaire</span>
      <OptionRows label="Ton suivi alimentaire" options={QUALITIES.map((q) => ({ value: q, label: TRACKING_QUALITY_LABEL[q] }))} value={draft.historyQuality} onChange={(q) => patch({ historyQuality: q })} />
      <FieldError text={errors.historyQuality} />
      <div style={{ height: 22 }} />
      <span className="label">Ton activité était-elle proche de ton rythme actuel ?</span>
      <Segmented
        label="Ton activité était-elle proche de ton rythme actuel ?"
        options={[
          { value: 'yes', label: 'Oui' },
          { value: 'no', label: 'Non / pas vraiment' },
        ]}
        value={draft.historyActivityComparable === null ? null : draft.historyActivityComparable ? 'yes' : 'no'}
        onChange={(v) => patch({ historyActivityComparable: v === 'yes' })}
      />
      <FieldError text={errors.historyActivityComparable} />
    </>
  );
}

function speedModelFor(draft: OnboardingDraft, units: UnitPreference, today: string, goal: Goal): SpeedSliderModel | null {
  if (goal === 'maintenance') return null;
  const profile = draftToProfile({ ...draft, goal, targetWeight: draft.targetWeight ?? draftWeightKg(draft, units) }, units);
  return profile ? onboardingSpeedSliderModel(profile, today, draftToEvidence(draft, units, today)) : null;
}

function defaultTargetFor(goal: Goal, weightKg: number): number | null {
  return goal === 'maintenance' ? null : goal === 'loss' ? Math.round(weightKg * 0.93 * 2) / 2 : Math.round(weightKg * 1.05 * 2) / 2;
}

export function StepGoal({ draft, patch, errors, units, today }: StepProps & { today: string }) {
  const weightKg = draftWeightKg(draft, units) ?? 70;
  const heightCm = draftHeightCm(draft, units) ?? 170;
  const guard = goalGuardrails(heightCm, weightKg);
  const goal = draft.goal;
  const setGoal = (g: Goal) => {
    const targetWeight = defaultTargetFor(g, weightKg);
    const nextModel = g === 'maintenance' ? null : speedModelFor({ ...draft, targetWeight }, units, today, g);
    patch({ goal: g, targetWeight, weeklyRate: g === 'maintenance' ? null : defaultWeeklyRate(g, nextModel?.maxSelectableRate ?? null) });
  };
  const target = draft.targetWeight ?? weightKg;
  const range = goal === 'loss' ? [Math.max(35, weightKg * 0.6), weightKg - 0.5] : [weightKg + 0.5, weightKg * 1.35];
  const min = Math.round((range[0] as number) * 2) / 2;
  const max = Math.round((range[1] as number) * 2) / 2;

  return (
    <>
      <h2 className="h-flow">Ton objectif</h2>
      <p className="lead">Tu pourras le changer à tout moment.</p>
      <div role="radiogroup" aria-label="Objectif" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 30 }}>
        {(
          [
            ['loss', 'Déficit contrôlé, muscle préservé'],
            ['maintenance', 'Garder ton poids actuel'],
            ['gain', 'Surplus progressif'],
          ] as Array<[Goal, string]>
        ).map(([g, sub]) => {
          const unavailable = g === 'loss' && !guard.lossAvailable;
          return (
            <button key={g} type="button" role="radio" aria-checked={goal === g} className="opt-card" disabled={unavailable} style={unavailable ? { opacity: 0.5 } : undefined} onClick={() => setGoal(g)}>
              <span className="opt-card__title">{g === 'loss' ? 'Perdre du poids' : g === 'maintenance' ? 'Maintenir' : 'Prendre du poids'}</span>
              <span className="opt-card__sub">{unavailable ? 'Non proposé avec ton poids actuel' : sub}</span>
            </button>
          );
        })}
      </div>
      <FieldError text={errors.goal} />

      {goal === 'maintenance' ? (
        <p className="small" style={{ margin: 0 }}>
          Wheighty suit ta tendance dans une zone autour de {formatWeight(weightKg, units)} {weightUnitLabel(units)}.
        </p>
      ) : null}

      {goal === 'loss' || goal === 'gain' ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span className="label" style={{ margin: 0 }}>
              Poids cible
            </span>
            <span style={{ font: '600 20px var(--font)', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
              {formatWeight(target, units)} {weightUnitLabel(units)}
            </span>
          </div>
          <Range
            value={Math.min(max, Math.max(min, target))}
            min={min}
            max={max}
            step={units === 'imperial' ? KG_PER_LB : 0.5}
            onChange={(v) => patch({ targetWeight: v })}
            label="Poids cible"
            valueText={`${formatWeight(target, units)} ${weightUnitLabel(units)}`}
          />
          <p className="small" style={{ margin: '4px 0 0' }}>
            {formatSignedWeight(target - weightKg, units)} {weightUnitLabel(units)} par rapport à aujourd’hui.
          </p>
          <FieldError text={errors.target} />
        </>
      ) : null}
    </>
  );
}

export function StepSpeed({ draft, patch, units, today }: StepProps & { today: string }) {
  const goal = draft.goal;
  // The slider limit depends on the profile, activity and history answers, not on the current speed.
  const modelKey = JSON.stringify({ ...draft, step: '', weeklyRate: null });
  const model = useMemo(
    () => (goal === 'loss' || goal === 'gain' ? speedModelFor(draft, units, today, goal) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modelKey, units, today, goal],
  );
  return (
    <>
      <h2 className="h-flow">À quelle vitesse ?</h2>
      <p className="lead">En pourcentage de ton poids par semaine. Les limites s’adaptent à ton profil.</p>
      {model && model.maxSelectableRate !== null ? <SpeedSlider model={model} value={Math.min(draft.weeklyRate ?? model.defaultRate, model.maxSelectableRate)} onChange={(r) => patch({ weeklyRate: r })} units={units} /> : null}
      {model && model.maxSelectableRate === null ? (
        <p className="small" style={{ margin: 0 }}>
          Aucune vitesse ne respecte les limites de sécurité pour ce profil. Le maintien reste disponible.
        </p>
      ) : null}
    </>
  );
}
