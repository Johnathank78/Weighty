/**
 * Onboarding (UX pass v2 s1 to s9, s19): draft state is the single source of truth. The real step
 * components are rendered to static markup (react-dom/server) from a draft, so what the UI shows
 * is checked against what the draft stores.
 */
import { createElement } from 'react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NavigationProvider } from '@/app/navigation';
import { SpeedSlider } from '@/components/SpeedSlider';
import { completeOnboarding, onboardingSpeedSliderModel, previewInitialPlan } from '@/domain/engine';
import {
  AGE_PLACEHOLDER,
  bodyScreenCanContinue,
  bumpAge,
  draftFromProfile,
  draftToEvidence,
  draftToProfile,
  emptyDraft,
  nextStep,
  onboardingActions,
  onboardingProgress,
  previousStep,
  profileInitials,
  validateAge,
  validateGoal,
  validateHeight,
  validateHistoryDetails,
  validateWeight,
  visibleScreens,
} from '@/domain/onboarding';
import type { OnboardingDraft } from '@/domain/onboarding';
import { weeklyChangeKg } from '@/domain/views';
import { exportStore, parseImport } from '@/persistence/exportImport';
import { emptyStore } from '@/persistence/schema';
import { loadStore, MemoryStorage, saveStore } from '@/persistence/storage';
import { ONBOARDING_ACTIVITY_TYPES, OnboardingActions, StepAge, StepGoal, StepHeight, StepHistory, StepHistoryDetails, StepName, StepOccupation, StepSex, StepTraining, StepWeight } from '@/screens/Onboarding';
import { IntroScreen, SplashScreen } from '@/screens/Welcome';
import { exerciseSummary, structuredActivityEnergy, netStepKcal } from '@/science/activity';
import type { UserProfile } from '@/science/types';
import { makeProfile } from '../helpers/profiles';

const TODAY = '2026-09-14';
const NOW = `${TODAY}T08:00:00.000Z`;
const noop = () => undefined;

type Units = 'metric' | 'imperial';

function render(component: (props: never) => ReactElement | null, draft: OnboardingDraft, units: Units = 'metric', extra: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(createElement(component as never, { draft, patch: noop, errors: {}, units, ...extra }));
}

const ageMarkup = (draft: OnboardingDraft) => render(StepAge, draft, 'metric', { scopeOk: false, setScopeOk: noop, scopeError: false });

function inputTag(html: string, labelledBy: string): string {
  return html.match(new RegExp(`<input[^>]*aria-labelledby="${labelledBy}"[^>]*>`))?.[0] ?? '';
}

/** A complete create-mode draft (Result screen reachable). */
function filled(overrides: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return { ...emptyDraft(), age: '30', sex: 'female', height: '165', weight: '62', goal: 'maintenance', ...overrides };
}

describe('splash and intro (s1)', () => {
  it('splash keeps mascot and wordmark, without the three carousel-like dots', () => {
    const html = renderToStaticMarkup(createElement(NavigationProvider, { initialScreen: 'splash', children: createElement(SplashScreen, { next: 'intro' }) }));
    expect(html).toContain('Wheighty');
    expect(html).toContain('<img');
    expect(html).toContain('mascot-float');
    expect(html).not.toMatch(/width:7px;height:7px/);
  });

  it('intro content starts lower and titles use the display font', () => {
    const html = renderToStaticMarkup(createElement(NavigationProvider, { initialScreen: 'intro', children: createElement(IntroScreen) }));
    expect(html).toContain('padding-top:calc(var(--safe-top) + 48px)');
    expect(html).toContain('var(--font-display)');
    expect(html).not.toMatch(/width:7px;height:7px/);
  });
});

describe('screen sequence and section progress (s3)', () => {
  it('one information per screen, grouped in five sections', () => {
    expect(visibleScreens(emptyDraft())).toEqual(['name', 'age', 'sex', 'height', 'weight', 'body', 'occupation', 'steps', 'training', 'history', 'goal']);
    expect(visibleScreens({ ...emptyDraft(), tracksCalories: true, goal: 'loss' })).toEqual(['name', 'age', 'sex', 'height', 'weight', 'body', 'occupation', 'steps', 'training', 'history', 'historyDetails', 'goal', 'speed']);
    expect(visibleScreens({ ...emptyDraft(), mode: 'edit', tracksCalories: true, goal: 'gain' })).not.toContain('history');
  });

  it('progress fills the current section screen by screen and completed sections fully', () => {
    const p = onboardingProgress({ ...emptyDraft(), step: 'sex' });
    expect(p.current).toBe('profil');
    expect(p.sections.map((s) => s.section)).toEqual(['profil', 'corps', 'activite', 'historique', 'objectif']);
    expect(p.sections[0]?.fill).toBeCloseTo(3 / 5, 12);
    expect(p.sections.slice(1).every((s) => s.fill === 0)).toBe(true);
    const later = onboardingProgress({ ...emptyDraft(), step: 'steps' });
    expect(later.sections.map((s) => s.fill)).toEqual([1, 1, 2 / 3, 0, 0]);
  });

  it('navigation: history before goal, speed only for loss and gain, result at the end', () => {
    expect(nextStep({ ...emptyDraft(), step: 'training' })).toBe('history');
    expect(nextStep({ ...emptyDraft(), step: 'history' })).toBe('goal');
    expect(nextStep({ ...emptyDraft(), step: 'history', tracksCalories: true })).toBe('historyDetails');
    expect(nextStep({ ...emptyDraft(), step: 'goal', goal: 'maintenance' })).toBe('result');
    expect(nextStep({ ...emptyDraft(), step: 'goal', goal: 'loss' })).toBe('speed');
    expect(nextStep({ ...emptyDraft(), step: 'training', mode: 'edit' })).toBe('goal');
    expect(previousStep({ ...emptyDraft(), step: 'goal', mode: 'edit' })).toBe('training');
    expect(previousStep({ ...emptyDraft(), step: 'name' })).toBe('exit');
  });
});

describe('first and last name (s3)', () => {
  it('optional, trimmed, stored in the profile only when given', () => {
    const html = render(StepName, emptyDraft());
    expect(html).toContain('Prénom');
    expect(html).toContain('Nom');
    expect(html).toContain('restent sur cet appareil');
    expect(draftToProfile(filled(), 'metric')).not.toHaveProperty('firstName');
    const profile = draftToProfile(filled({ firstName: '  Jean ', lastName: 'Dupont ' }), 'metric');
    expect(profile).toMatchObject({ firstName: 'Jean', lastName: 'Dupont' });
    expect(draftToProfile(filled({ firstName: 'x'.repeat(61) }), 'metric')).toBeNull();
  });

  it('persisted locally, exported and imported, and restored when editing', () => {
    const profile = draftToProfile(filled({ firstName: 'Lina', lastName: 'Martin' }), 'metric');
    if (!profile) throw new Error('profile');
    const r = completeOnboarding(emptyStore(), profile, TODAY, NOW);
    if (!r.ok) throw new Error(r.reason);
    const storage = new MemoryStorage();
    saveStore(storage, r.store);
    const loaded = loadStore(storage, NOW);
    expect(loaded.status).toBe('loaded');
    expect(loaded.store.profile).toMatchObject({ firstName: 'Lina', lastName: 'Martin' });
    const imported = parseImport(exportStore(r.store, NOW));
    expect(imported.ok && imported.store.profile).toMatchObject({ firstName: 'Lina', lastName: 'Martin' });
    expect(draftFromProfile(profile, 'metric')).toMatchObject({ firstName: 'Lina', lastName: 'Martin', mode: 'edit' });
  });

  it('initials for the Today avatar, neutral fallback without a name', () => {
    expect(profileInitials({ firstName: 'Jean', lastName: 'Dupont' })).toBe('JD');
    expect(profileInitials({ firstName: 'Lina' })).toBe('L');
    expect(profileInitials({ firstName: 'élodie', lastName: 'ávila' })).toBe('ÉÁ');
    expect(profileInitials({})).toBeNull();
    expect(profileInitials(null)).toBeNull();
  });
});

describe('age (s4)', () => {
  it('empty at start, 22 only as a grey placeholder, never stored', () => {
    const draft = emptyDraft();
    expect(draft.age).toBe('');
    const input = inputTag(ageMarkup(draft), 'age-label');
    expect(input).toContain('value=""');
    expect(input).toContain(`placeholder="${AGE_PLACEHOLDER}"`);
    expect(validateAge(draft).age).toBeDefined();
    expect(draftToProfile({ ...filled(), age: '' }, 'metric')).toBeNull();
  });

  it('+ and − start from 22 on an empty field, then move the same stored value', () => {
    let draft = emptyDraft();
    draft = { ...draft, age: bumpAge(draft.age, 1) };
    expect(draft.age).toBe('22');
    expect(inputTag(ageMarkup(draft), 'age-label')).toContain('value="22"');
    expect(bumpAge('', -1)).toBe('22');
    draft = { ...draft, age: bumpAge(draft.age, 1) };
    expect(draft.age).toBe('23');
    draft = { ...draft, age: bumpAge(bumpAge(draft.age, -1), -1) };
    expect(draft.age).toBe('21');
    expect(bumpAge('40', 1)).toBe('41');
    expect(bumpAge('19', -1)).toBe('19');
    expect(bumpAge('65', 1)).toBe('65');
    expect(bumpAge('70', -1)).toBe('65');
    expect(validateAge(draft)).toEqual({});
  });

  it('scope notice stays on the age screen, secondary style, worded for everyone', () => {
    const html = ageMarkup(emptyDraft());
    expect(html).toMatch(/role="checkbox"[^>]*class="checkbox checkbox--secondary"/);
    // Lot F: this screen comes before the sex screen, so the wording names situations, not a reader.
    expect(html).toContain('Je ne suis dans aucune de ces situations');
    expect(html).toContain('grossesse');
    expect(html).not.toMatch(/enceinte|allaitante/);
  });
});

describe('sex, height, weight, occupation', () => {
  it('sex: Homme selected on open and stored, Femme persists once chosen', () => {
    const draft = emptyDraft();
    expect(draft.sex).toBe('male');
    expect(render(StepSex, draft)).toMatch(/aria-checked="true"[^>]*>Homme</);
    expect(render(StepSex, { ...draft, sex: 'female' })).toMatch(/aria-checked="true"[^>]*>Femme</);
  });

  it('height and weight: grey placeholders only, empty values, validation refuses to continue', () => {
    const draft = emptyDraft();
    expect([draft.height, draft.weight]).toEqual(['', '']);
    expect(render(StepHeight, draft)).toMatch(/placeholder="170"[^>]*value=""/);
    expect(render(StepWeight, draft)).toMatch(/placeholder="70,0"[^>]*value=""/);
    expect(validateHeight(draft, 'metric').height).toBeDefined();
    expect(validateWeight(draft, 'metric').weight).toBeDefined();
    expect(validateHeight({ ...draft, height: '172' }, 'metric')).toEqual({});
    expect(validateWeight({ ...draft, height: '172', weight: '68,4' }, 'metric')).toEqual({});
    expect(render(StepHeight, draft, 'imperial')).toMatch(/placeholder="5"/);
    expect(render(StepWeight, draft, 'imperial')).toMatch(/placeholder="154"/);
  });

  it('occupation: Assis selected by default', () => {
    expect(render(StepOccupation, emptyDraft())).toMatch(/aria-checked="true"[^>]*>Assis</);
  });
});

describe('body composition (s5)', () => {
  const actions = (draft: OnboardingDraft) => renderToStaticMarkup(createElement(OnboardingActions, { draft, onContinue: noop, onSkip: noop }));

  it('nothing entered: Continuer hidden, only "Ignorer cette étape"', () => {
    const draft: OnboardingDraft = { ...emptyDraft(), step: 'body' };
    expect(bodyScreenCanContinue(draft)).toBe(false);
    expect(onboardingActions(draft)).toEqual({ primaryLabel: null, showSkip: true });
    const html = actions(draft);
    expect(html).not.toContain('Continuer');
    expect(html).toContain('Ignorer cette étape');
    // Toggle on without a method is not valid data yet.
    expect(onboardingActions({ ...draft, knowsBodyFat: true }).primaryLabel).toBeNull();
  });

  it('valid body fat or measured metabolism: Continuer visible, skip still offered', () => {
    const withFat: OnboardingDraft = { ...emptyDraft(), step: 'body', knowsBodyFat: true, bodyFatMethod: 'dxa' };
    expect(onboardingActions(withFat)).toEqual({ primaryLabel: 'Continuer', showSkip: true });
    expect(actions(withFat)).toContain('Continuer');
    const withRmr: OnboardingDraft = { ...emptyDraft(), step: 'body', measuredRmr: { kcalPerDay: 1500, measuredAt: TODAY, weightKgAtTest: 62, method: 'indirect_calorimetry', conditionsKnown: true } };
    expect(onboardingActions(withRmr).primaryLabel).toBe('Continuer');
  });

  it('other screens always show their primary button, labelled for the result at the end', () => {
    expect(onboardingActions({ ...emptyDraft(), step: 'name' })).toEqual({ primaryLabel: 'Continuer', showSkip: false });
    expect(onboardingActions({ ...emptyDraft(), step: 'goal', goal: 'maintenance' }).primaryLabel).toBe('Voir mon estimation');
    expect(onboardingActions({ ...emptyDraft(), step: 'goal', goal: 'maintenance', mode: 'edit' }).primaryLabel).toBe('Recalculer mon plan');
  });
});

describe('structured activities (s6)', () => {
  it('no walking or hiking chip; the other sports stay', () => {
    const html = render(StepTraining, emptyDraft());
    expect(ONBOARDING_ACTIVITY_TYPES).not.toContain('walking');
    expect(ONBOARDING_ACTIVITY_TYPES).not.toContain('hiking');
    expect(html).not.toContain('Randonnée');
    expect(html).not.toMatch(/>\+ Marche</);
    for (const label of ['Musculation', 'Course', 'Vélo', 'Natation', 'Sports collectifs', 'Autre']) expect(html).toContain(`+ ${label}`);
  });

  it('existing hiking entries keep the step overlap correction', () => {
    const ctx = { weightKg: 75, ageYears: 40, usualPace: 'normal' as const };
    const hike = structuredActivityEnergy({ type: 'hiking', sessionsPerWeek: 2, durationMin: 90, intensity: 'moderate' }, ctx);
    expect(hike.stepDominant).toBe(true);
    expect(hike.overlapStepKcalPerSession).toBeCloseTo(netStepKcal({ steps: 9000, pace: 'normal', weightKg: 75, ageYears: 40 }), 9);
    expect(hike.sessionExtraKcalAfterOverlap).toBeLessThan(hike.sessionNetKcal);
    expect(exerciseSummary([{ type: 'hiking', sessionsPerWeek: 2, durationMin: 90, intensity: 'moderate' }], ctx).anyDefaultCadence).toBe(true);
  });
});

describe('calorie history (s7)', () => {
  const details = (overrides: Partial<OnboardingDraft> = {}): OnboardingDraft => ({
    ...filled(),
    step: 'historyDetails',
    tracksCalories: true,
    historyCalories: '1 650',
    historyDays: '21',
    historyStartWeight: '63,4',
    historyEndWeight: '62,0',
    historyQuality: 'medium',
    historyActivityComparable: false,
    ...overrides,
  });

  it('"Non" selected by default, Facultatif shown as a small note, nothing sent to the engine', () => {
    const draft = emptyDraft();
    expect(draft.tracksCalories).toBe(false);
    const html = render(StepHistory, draft);
    expect(html).toMatch(/aria-checked="true"[^>]*>Non</);
    expect(html).toMatch(/aria-checked="false"[^>]*>Oui</);
    expect(html).toMatch(/class="optional-note">Facultatif\./);
    expect(draftToEvidence(filled(), 'metric', TODAY)).toBeNull();
  });

  it('duration asked once, as an exact number of days', () => {
    const html = render(StepHistoryDetails, details({ historyDays: '' }));
    expect(html.match(/Sur combien de jours/g)).toHaveLength(1);
    expect(html).not.toContain('Sur quelle durée');
    expect(html).toMatch(/placeholder="14"[^>]*value=""/);
    expect(emptyDraft()).not.toHaveProperty('historyDuration');
    expect(validateHistoryDetails(details({ historyDays: '' }), 'metric').historyDays).toBeDefined();
    expect(validateHistoryDetails(details({ historyDays: '10,5' }), 'metric').historyDays).toBeDefined();
    expect(validateHistoryDetails(details({ historyDays: '400' }), 'metric').historyDays).toBeDefined();
    expect(draftToEvidence(details({ historyDays: '14' }), 'metric', TODAY)?.durationDays).toBe(14);
  });

  it('empty start weight accepted and kept absent, with the explicit note and no checkbox', () => {
    const html = render(StepHistoryDetails, details({ historyStartWeight: '' }));
    expect(html).toContain('Laisse vide si tu ne le connais pas.');
    expect(html).not.toContain('Je ne connais pas mon poids de départ');
    expect(validateHistoryDetails(details({ historyStartWeight: '' }), 'metric')).toEqual({});
    expect(draftToEvidence(details({ historyStartWeight: '' }), 'metric', TODAY)?.startWeightKg).toBeNull();
    expect(draftToEvidence(details(), 'metric', TODAY)).toEqual({ evidenceVersion: 1, recordedOn: TODAY, averageCaloriesKcal: 1650, durationDays: 21, startWeightKg: 63.4, endWeightKg: 62, trackingQuality: 'medium', activityComparable: false });
  });

  it('invalid answers block the step instead of reaching the engine; never used when editing', () => {
    const bad = details({ historyCalories: '250', historyDays: '', historyStartWeight: '5', historyEndWeight: '', historyQuality: null, historyActivityComparable: null });
    expect(Object.keys(validateHistoryDetails(bad, 'metric')).sort()).toEqual(['historyActivityComparable', 'historyCalories', 'historyDays', 'historyEndWeight', 'historyQuality', 'historyStartWeight']);
    expect(draftToEvidence(bad, 'metric', TODAY)).toBeNull();
    expect(draftToEvidence({ ...details(), mode: 'edit' }, 'metric', TODAY)).toBeNull();
  });
});

describe('goal (s8)', () => {
  const loss = (overrides: Partial<UserProfile> = {}) => makeProfile({ sexForEquation: 'male', ageYears: 35, heightCm: 178, currentWeightKg: 85, goal: 'loss', targetWeightKg: 78, weeklyRateTarget: 0.005, ...overrides });

  it('maintenance: no speed slider, no second target weight, target is the weight entered', () => {
    const draft = filled({ step: 'goal', goal: 'maintenance', targetWeight: null, weeklyRate: null });
    const html = render(StepGoal, draft, 'metric', { today: TODAY });
    expect(html).not.toContain('role="slider"');
    expect(html).not.toContain('Poids cible');
    expect(visibleScreens(draft)).not.toContain('speed');
    expect(validateGoal(draft)).toEqual({});
    expect(draftToProfile(draft, 'metric')).toMatchObject({ goal: 'maintenance', targetWeightKg: 62, weeklyRateTarget: 0 });
    expect(draftFromProfile(loss({ goal: 'maintenance', targetWeightKg: 85, weeklyRateTarget: 0 }), 'metric')).toMatchObject({ targetWeight: null, weeklyRate: null });
    expect(onboardingSpeedSliderModel(loss({ goal: 'maintenance', targetWeightKg: 85, weeklyRateTarget: 0 }), TODAY, null)).toBeNull();
  });

  it('loss and gain: target weight slider, then the speed screen', () => {
    const draft = filled({ step: 'goal', goal: 'loss', targetWeight: 58, weeklyRate: 0.005 });
    const html = render(StepGoal, draft, 'metric', { today: TODAY });
    expect(html).toContain('role="slider"');
    expect(html).toContain('Poids cible');
    expect(validateGoal({ ...draft, targetWeight: null }).target).toBeDefined();
    expect(nextStep(draft)).toBe('speed');
  });

  it('speed slider: engine defaults, precise percent and kg per week', () => {
    expect(onboardingSpeedSliderModel(loss(), TODAY, null)).toMatchObject({ goal: 'loss', minRate: 0.002, maxRate: 0.01, defaultRate: 0.005, step: 0.0005 });
    expect(onboardingSpeedSliderModel(loss({ goal: 'gain', targetWeightKg: 90, weeklyRateTarget: 0.0025 }), TODAY, null)).toMatchObject({ goal: 'gain', minRate: 0.001, maxRate: 0.005, defaultRate: 0.0025 });
    const model = onboardingSpeedSliderModel(loss({ currentWeightKg: 68, heightCm: 165, targetWeightKg: 62 }), TODAY, null);
    if (!model) throw new Error('model');
    expect(weeklyChangeKg(0.005, 68)).toBeCloseTo(0.34, 12);
    const html = renderToStaticMarkup(createElement(SpeedSlider, { model, value: 0.005, onChange: noop, units: 'metric' }));
    expect(html).toMatch(/0,5\s%/);
    expect(html).toContain('≈ 0,34 kg / sem.');
    for (const zone of ['Douce', 'Modérée', 'Rapide']) expect(html).toContain(zone);
  });

  it('upper limit follows the profile and the engine accepts every selectable value', () => {
    const lean = loss({ currentWeightKg: 72, heightCm: 178 });
    const model = onboardingSpeedSliderModel(lean, TODAY, null);
    expect(model).toMatchObject({ maxSelectableRate: 0.005, limitedBy: 'bmi_guardrail' });
    for (const rate of [0.002, 0.0035, 0.005]) {
      const preview = previewInitialPlan({ ...lean, targetWeightKg: 66, weeklyRateTarget: rate }, TODAY, null);
      expect(preview.ok && preview.goalPlan.rateAdjusted).toBe(false);
      expect(preview.ok && preview.plan.weeklyRateTarget).toBeCloseTo(rate, 9);
    }
    expect(onboardingSpeedSliderModel(loss({ currentWeightKg: 100 }), TODAY, null)?.maxSelectableRate).toBe(0.01);
  });
});
