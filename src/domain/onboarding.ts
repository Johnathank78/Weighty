/**
 * Onboarding draft, screen sequence and validation (units, bounds from 07 s8).
 * One main piece of information per screen; progress is shown per section.
 */
import {
  AGE_MAX_YEARS,
  AGE_MIN_YEARS,
  BMI_SANITY_MAX,
  BMI_SANITY_MIN,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  TRAINING_MAX_MIN_PER_WEEK,
  WARM_START_MAX_DAYS,
  WARM_START_MAX_INTAKE_KCAL,
  WARM_START_MIN_INTAKE_KCAL,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
} from '@/science/constants';
import { weeklyRateRange } from '@/science/goals';
import { bmi } from '@/science/macros';
import { structuredTrainingLoad } from '@/science/ree';
import type { HistoricalIntakeEvidence, TrackingQuality, UserProfile } from '@/science/types';
import { validateProfile } from '@/science/validation';
import { cmToFeetInches, feetInchesToCm, formatNumber, kgToLb, lbToKg } from './format';
import type { UnitPreference } from './types';

/** Grey placeholders only: never stored, never valid input. */
export const AGE_PLACEHOLDER = '22';
export const HEIGHT_PLACEHOLDER = { metric: '170', feet: '5', inches: '7' } as const;
export const WEIGHT_PLACEHOLDER = { metric: '70,0', imperial: '154' } as const;
/** Real initial values stored in a new draft. */
export const ONBOARDING_DEFAULT_SEX: UserProfile['sexForEquation'] = 'male';
export const ONBOARDING_DEFAULT_OCCUPATION: UserProfile['occupation'] = 'seated';
export const NAME_MAX_LENGTH = 60;

export type OnboardingSection = 'profil' | 'corps' | 'activite' | 'historique' | 'objectif';

export type OnboardingScreenId =
  | 'name'
  | 'age'
  | 'sex'
  | 'height'
  | 'weight'
  | 'body'
  | 'occupation'
  | 'steps'
  | 'training'
  | 'history'
  | 'historyDetails'
  | 'goal'
  | 'speed';

export const ONBOARDING_SCREENS: ReadonlyArray<{ id: OnboardingScreenId; section: OnboardingSection }> = [
  { id: 'name', section: 'profil' },
  { id: 'age', section: 'profil' },
  { id: 'sex', section: 'profil' },
  { id: 'height', section: 'profil' },
  { id: 'weight', section: 'profil' },
  { id: 'body', section: 'corps' },
  { id: 'occupation', section: 'activite' },
  { id: 'steps', section: 'activite' },
  { id: 'training', section: 'activite' },
  { id: 'history', section: 'historique' },
  { id: 'historyDetails', section: 'historique' },
  { id: 'goal', section: 'objectif' },
  { id: 'speed', section: 'objectif' },
];

export const ONBOARDING_SECTIONS: readonly OnboardingSection[] = ['profil', 'corps', 'activite', 'historique', 'objectif'];

/** Onboarding draft: numeric fields stay as raw strings until validated. */
export type OnboardingDraft = {
  mode: 'create' | 'edit';
  step: OnboardingScreenId;
  firstName: string;
  lastName: string;
  /** Empty until the user types or uses + / −; the placeholder is never a value. */
  age: string;
  sex: UserProfile['sexForEquation'] | null;
  height: string;
  heightFeet: string;
  heightInches: string;
  weight: string;
  knowsBodyFat: boolean;
  bodyFat: number;
  bodyFatMethod: UserProfile['bodyFatMethod'] | null;
  measuredRmr: UserProfile['measuredRmr'] | null;
  steps: number;
  pace: UserProfile['walkingPace'];
  occupation: UserProfile['occupation'] | null;
  activities: UserProfile['activities'];
  // Calorie history (warm start, optional). "Non" is the visible default.
  tracksCalories: boolean;
  historyCalories: string;
  /** Exact number of days, the single duration input. */
  historyDays: string;
  /** Empty when unknown: the engine then treats the start weight as absent. */
  historyStartWeight: string;
  /** Prefilled with the onboarding weight when the history details open. */
  historyEndWeight: string;
  historyQuality: TrackingQuality | null;
  historyActivityComparable: boolean | null;
  goal: UserProfile['goal'] | null;
  /** Loss and gain only; maintenance keeps the weight already entered. */
  targetWeight: number | null;
  /** Requested weekly rate, fraction of body weight per week (null until a loss or gain goal is chosen). */
  weeklyRate: number | null;
};

export function emptyDraft(): OnboardingDraft {
  return {
    mode: 'create',
    step: 'name',
    firstName: '',
    lastName: '',
    age: '',
    sex: ONBOARDING_DEFAULT_SEX,
    height: '',
    heightFeet: '',
    heightInches: '',
    weight: '',
    knowsBodyFat: false,
    bodyFat: 25,
    bodyFatMethod: null,
    measuredRmr: null,
    steps: 7000,
    pace: 'normal',
    occupation: ONBOARDING_DEFAULT_OCCUPATION,
    activities: [],
    tracksCalories: false,
    historyCalories: '',
    historyDays: '',
    historyStartWeight: '',
    historyEndWeight: '',
    historyQuality: null,
    historyActivityComparable: true,
    goal: null,
    targetWeight: null,
    weeklyRate: null,
  };
}

export type StepErrors = Partial<
  Record<
    | 'firstName'
    | 'lastName'
    | 'age'
    | 'sex'
    | 'height'
    | 'weight'
    | 'bodyFatMethod'
    | 'occupation'
    | 'activities'
    | 'goal'
    | 'target'
    | 'historyCalories'
    | 'historyDays'
    | 'historyStartWeight'
    | 'historyEndWeight'
    | 'historyQuality'
    | 'historyActivityComparable',
    string
  >
>;

function parse(raw: string): number | null {
  // \s also matches the narrow no-break space used as French thousands separator.
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  if (cleaned === '' || !/^\d*\.?\d*$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Age after pressing + or −. The draft string is the single source of truth. On an empty field the
 * first press initialises the real value to the placeholder age (no step applied), so the value shown
 * is always the value stored; later presses move that same value inside the supported range.
 */
export function bumpAge(raw: string, delta: number): string {
  const current = parse(raw);
  const next = current === null ? Number(AGE_PLACEHOLDER) : Math.round(current) + delta;
  return String(Math.max(AGE_MIN_YEARS, Math.min(AGE_MAX_YEARS, next)));
}

// ---------------------------------------------------------------------------
// Screen sequence and progress
// ---------------------------------------------------------------------------

export function isScreenVisible(draft: Pick<OnboardingDraft, 'mode' | 'tracksCalories' | 'goal'>, id: OnboardingScreenId): boolean {
  if ((id === 'history' || id === 'historyDetails') && draft.mode === 'edit') return false;
  if (id === 'historyDetails') return draft.tracksCalories;
  if (id === 'speed') return draft.goal === 'loss' || draft.goal === 'gain';
  return true;
}

export function visibleScreens(draft: Pick<OnboardingDraft, 'mode' | 'tracksCalories' | 'goal'>): OnboardingScreenId[] {
  return ONBOARDING_SCREENS.filter((s) => isScreenVisible(draft, s.id)).map((s) => s.id);
}

export function nextStep(draft: Pick<OnboardingDraft, 'step' | 'mode' | 'tracksCalories' | 'goal'>): OnboardingScreenId | 'result' {
  const screens = visibleScreens(draft);
  const i = screens.indexOf(draft.step);
  return screens[i + 1] ?? 'result';
}

export function previousStep(draft: Pick<OnboardingDraft, 'step' | 'mode' | 'tracksCalories' | 'goal'>): OnboardingScreenId | 'exit' {
  const screens = visibleScreens(draft);
  const i = screens.indexOf(draft.step);
  return i <= 0 ? 'exit' : (screens[i - 1] as OnboardingScreenId);
}

export function sectionOf(id: OnboardingScreenId): OnboardingSection {
  return ONBOARDING_SCREENS.find((s) => s.id === id)?.section ?? 'profil';
}

export type OnboardingProgress = {
  sections: Array<{ section: OnboardingSection; fill: number; current: boolean }>;
  current: OnboardingSection;
};

/** Progress by main section: completed sections are full, the current one fills screen by screen. */
export function onboardingProgress(draft: Pick<OnboardingDraft, 'step' | 'mode' | 'tracksCalories' | 'goal'>): OnboardingProgress {
  const screens = visibleScreens(draft);
  const current = sectionOf(draft.step);
  const currentIndex = ONBOARDING_SECTIONS.indexOf(current);
  const sections = ONBOARDING_SECTIONS.filter((s) => screens.some((id) => sectionOf(id) === s)).map((section) => {
    const own = screens.filter((id) => sectionOf(id) === section);
    const index = ONBOARDING_SECTIONS.indexOf(section);
    const fill = index < currentIndex ? 1 : index > currentIndex ? 0 : (own.indexOf(draft.step) + 1) / own.length;
    return { section, fill, current: section === current };
  });
  return { sections, current };
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export function draftHeightCm(draft: OnboardingDraft, units: UnitPreference): number | null {
  if (units === 'imperial') {
    const ft = parse(draft.heightFeet);
    const inches = parse(draft.heightInches || '0');
    if (ft === null || inches === null) return null;
    return feetInchesToCm(ft, inches);
  }
  return parse(draft.height);
}

function toKg(raw: string, units: UnitPreference): number | null {
  const v = parse(raw);
  if (v === null) return null;
  return units === 'imperial' ? lbToKg(v) : v;
}

export function draftWeightKg(draft: OnboardingDraft, units: UnitPreference): number | null {
  return toKg(draft.weight, units);
}

/** Weight string in the display unit, used to prefill the history end weight. */
export function weightInputString(kg: number, units: UnitPreference): string {
  return formatNumber(units === 'imperial' ? kgToLb(kg) : kg, 1);
}

const fmtKg = (kg: number, units: UnitPreference) => (units === 'imperial' ? `${formatNumber(kgToLb(kg), 0)} lb` : `${formatNumber(kg, 0)} kg`);

// ---------------------------------------------------------------------------
// Validation, one function per screen
// ---------------------------------------------------------------------------

export function validateName(draft: OnboardingDraft): StepErrors {
  const e: StepErrors = {};
  if (draft.firstName.trim().length > NAME_MAX_LENGTH) e.firstName = `${NAME_MAX_LENGTH} caractères au maximum.`;
  if (draft.lastName.trim().length > NAME_MAX_LENGTH) e.lastName = `${NAME_MAX_LENGTH} caractères au maximum.`;
  return e;
}

export function validateAge(draft: OnboardingDraft): StepErrors {
  const age = parse(draft.age);
  if (age === null || !Number.isInteger(age)) return { age: 'Indique ton âge en années.' };
  if (age < AGE_MIN_YEARS || age > AGE_MAX_YEARS) return { age: `Wheighty accompagne les adultes de ${AGE_MIN_YEARS} à ${AGE_MAX_YEARS} ans.` };
  return {};
}

export function validateHeight(draft: OnboardingDraft, units: UnitPreference): StepErrors {
  const h = draftHeightCm(draft, units);
  if (h === null) return { height: 'Indique ta taille.' };
  if (h < HEIGHT_MIN_CM || h > HEIGHT_MAX_CM) return { height: units === 'imperial' ? 'Taille hors des limites prises en charge.' : `Entre ${HEIGHT_MIN_CM} et ${HEIGHT_MAX_CM} cm.` };
  return {};
}

export function validateWeight(draft: OnboardingDraft, units: UnitPreference): StepErrors {
  const w = draftWeightKg(draft, units);
  if (w === null) return { weight: 'Indique ton poids.' };
  if (w < WEIGHT_MIN_KG || w > WEIGHT_MAX_KG) return { weight: `Entre ${fmtKg(WEIGHT_MIN_KG, units)} et ${fmtKg(WEIGHT_MAX_KG, units)}.` };
  const h = draftHeightCm(draft, units);
  if (h !== null) {
    const b = bmi(w, h);
    if (b < BMI_SANITY_MIN || b > BMI_SANITY_MAX) return { weight: 'Cette combinaison taille et poids semble incorrecte. Vérifie les valeurs.' };
  }
  return {};
}

/** All profile fields at once (used to guard the result screen). */
export function validateProfileScreens(draft: OnboardingDraft, units: UnitPreference): StepErrors {
  return { ...validateName(draft), ...validateAge(draft), ...(draft.sex ? {} : { sex: 'Choisis une option.' }), ...validateHeight(draft, units), ...validateWeight(draft, units) };
}

export function validateBody(draft: OnboardingDraft): StepErrors {
  if (draft.knowsBodyFat && !draft.bodyFatMethod) return { bodyFatMethod: 'Choisis la méthode de mesure.' };
  return {};
}

/**
 * The body-composition screen shows "Continuer" only when something valid was actually entered;
 * otherwise only "Ignorer cette étape" is offered.
 */
export function bodyScreenCanContinue(draft: OnboardingDraft): boolean {
  if (draft.knowsBodyFat) return draft.bodyFatMethod !== null;
  return draft.measuredRmr !== null;
}

/** Buttons at the bottom of an onboarding screen: primary label (null when hidden) and the skip link. */
export function onboardingActions(draft: OnboardingDraft): { primaryLabel: string | null; showSkip: boolean } {
  const isBody = draft.step === 'body';
  const last = nextStep(draft) === 'result';
  const label = last ? (draft.mode === 'edit' ? 'Recalculer mon plan' : 'Voir mon estimation') : 'Continuer';
  return { primaryLabel: !isBody || bodyScreenCanContinue(draft) ? label : null, showSkip: isBody };
}

export function validateTraining(draft: OnboardingDraft): StepErrors {
  if (structuredTrainingLoad(draft.activities).minutesPerWeek > TRAINING_MAX_MIN_PER_WEEK) return { activities: 'Le volume total d’entraînement dépasse la limite prise en charge.' };
  return {};
}

/** Calorie history details. Answering "Non" never reaches this screen. */
export function validateHistoryDetails(draft: OnboardingDraft, units: UnitPreference): StepErrors {
  const e: StepErrors = {};
  if (!draft.tracksCalories) return e;
  const kcal = parse(draft.historyCalories);
  if (kcal === null) e.historyCalories = 'Indique ton apport moyen.';
  else if (kcal < WARM_START_MIN_INTAKE_KCAL || kcal > WARM_START_MAX_INTAKE_KCAL) e.historyCalories = `Entre ${WARM_START_MIN_INTAKE_KCAL} et ${WARM_START_MAX_INTAKE_KCAL} kcal par jour.`;
  const days = parse(draft.historyDays);
  if (days === null || !Number.isInteger(days)) e.historyDays = 'Indique le nombre de jours.';
  else if (days < 1 || days > WARM_START_MAX_DAYS) e.historyDays = `Entre 1 et ${WARM_START_MAX_DAYS} jours.`;
  const range = (raw: string) => {
    const kg = toKg(raw, units);
    if (kg === null) return 'Indique ce poids.';
    if (kg < WEIGHT_MIN_KG || kg > WEIGHT_MAX_KG) return `Entre ${fmtKg(WEIGHT_MIN_KG, units)} et ${fmtKg(WEIGHT_MAX_KG, units)}.`;
    return null;
  };
  if (draft.historyStartWeight.trim() !== '') {
    const s = range(draft.historyStartWeight);
    if (s) e.historyStartWeight = s;
  }
  const end = range(draft.historyEndWeight);
  if (end) e.historyEndWeight = end;
  if (!draft.historyQuality) e.historyQuality = 'Choisis une option.';
  if (draft.historyActivityComparable === null) e.historyActivityComparable = 'Choisis une option.';
  return e;
}

export function validateGoal(draft: OnboardingDraft): StepErrors {
  if (!draft.goal) return { goal: 'Choisis un objectif.' };
  if (draft.goal !== 'maintenance' && draft.targetWeight === null) return { target: 'Choisis un poids cible.' };
  return {};
}

export function validateStep(draft: OnboardingDraft, units: UnitPreference): StepErrors {
  switch (draft.step) {
    case 'name':
      return validateName(draft);
    case 'age':
      return validateAge(draft);
    case 'sex':
      return draft.sex ? {} : { sex: 'Choisis une option.' };
    case 'height':
      return validateHeight(draft, units);
    case 'weight':
      return validateWeight(draft, units);
    case 'body':
      return validateBody(draft);
    case 'occupation':
      return draft.occupation ? {} : { occupation: 'Choisis une option.' };
    case 'steps':
    case 'history':
    case 'speed':
      return {};
    case 'training':
      return validateTraining(draft);
    case 'historyDetails':
      return validateHistoryDetails(draft, units);
    case 'goal':
      return validateGoal(draft);
  }
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/** Default rate when a goal is picked: the engine default, never above the profile's selectable maximum. */
export function defaultWeeklyRate(goal: UserProfile['goal'], maxSelectableRate: number | null): number {
  if (goal === 'maintenance') return 0;
  const r = weeklyRateRange(goal);
  return maxSelectableRate === null ? r.defaultRate : Math.min(r.defaultRate, maxSelectableRate);
}

export function draftToProfile(draft: OnboardingDraft, units: UnitPreference): UserProfile | null {
  const age = parse(draft.age);
  const heightCm = draftHeightCm(draft, units);
  const weightKg = draftWeightKg(draft, units);
  if (age === null || heightCm === null || weightKg === null || !draft.sex || !draft.occupation || !draft.goal) return null;
  if (Object.keys(validateName(draft)).length > 0) return null;
  const firstName = draft.firstName.trim();
  const lastName = draft.lastName.trim();
  const profile: UserProfile = {
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ageYears: age,
    sexForEquation: draft.sex,
    heightCm,
    currentWeightKg: weightKg,
    averageSteps7d: draft.steps,
    walkingPace: draft.pace,
    occupation: draft.occupation,
    activities: draft.activities,
    goal: draft.goal,
    // Maintenance keeps the weight already entered: no second target question.
    targetWeightKg: draft.goal === 'maintenance' ? weightKg : (draft.targetWeight ?? weightKg),
    weeklyRateTarget: draft.goal === 'maintenance' ? 0 : (draft.weeklyRate ?? weeklyRateRange(draft.goal).defaultRate),
    ...(draft.knowsBodyFat && draft.bodyFatMethod ? { bodyFatPercent: draft.bodyFat, bodyFatMethod: draft.bodyFatMethod } : {}),
    ...(draft.measuredRmr ? { measuredRmr: draft.measuredRmr } : {}),
  };
  return validateProfile(profile).ok ? profile : null;
}

/** Historical intake evidence from the draft; null when the user does not track calories or data are incomplete. */
export function draftToEvidence(draft: OnboardingDraft, units: UnitPreference, today: string): HistoricalIntakeEvidence | null {
  if (draft.mode !== 'create' || !draft.tracksCalories) return null;
  if (Object.keys(validateHistoryDetails(draft, units)).length > 0) return null;
  const kcal = parse(draft.historyCalories);
  const days = parse(draft.historyDays);
  const end = toKg(draft.historyEndWeight, units);
  // An empty start weight stays absent: never fabricated.
  const start = draft.historyStartWeight.trim() === '' ? null : toKg(draft.historyStartWeight, units);
  if (kcal === null || days === null || end === null || !draft.historyQuality || draft.historyActivityComparable === null) return null;
  return {
    evidenceVersion: 1,
    recordedOn: today,
    averageCaloriesKcal: kcal,
    durationDays: days,
    startWeightKg: start,
    endWeightKg: end,
    trackingQuality: draft.historyQuality,
    activityComparable: draft.historyActivityComparable,
  };
}

export function draftFromProfile(profile: UserProfile, units: UnitPreference): OnboardingDraft {
  const { feet, inches } = cmToFeetInches(profile.heightCm);
  return {
    ...emptyDraft(),
    mode: 'edit',
    step: 'name',
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    age: String(profile.ageYears),
    sex: profile.sexForEquation,
    height: String(Math.round(profile.heightCm)),
    heightFeet: String(feet),
    heightInches: String(inches),
    weight: weightInputString(profile.currentWeightKg, units),
    knowsBodyFat: profile.bodyFatPercent !== undefined,
    bodyFat: profile.bodyFatPercent ?? 25,
    bodyFatMethod: profile.bodyFatMethod ?? null,
    measuredRmr: profile.measuredRmr ?? null,
    steps: profile.averageSteps7d,
    pace: profile.walkingPace,
    occupation: profile.occupation,
    activities: profile.activities,
    goal: profile.goal,
    targetWeight: profile.goal === 'maintenance' ? null : profile.targetWeightKg,
    weeklyRate: profile.goal === 'maintenance' ? null : profile.weeklyRateTarget,
  };
}

/** Initials for the Today avatar: "Jean Dupont" -> "JD", "Lina" -> "L", nothing -> null (neutral fallback). */
export function profileInitials(profile: Pick<UserProfile, 'firstName' | 'lastName'> | null): string | null {
  const letter = (s: string | undefined) => s?.trim().charAt(0).toLocaleUpperCase('fr-FR') ?? '';
  const out = `${letter(profile?.firstName)}${letter(profile?.lastName)}`;
  return out === '' ? null : out;
}
