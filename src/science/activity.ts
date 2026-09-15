/**
 * Step energy, structured exercise, overlap correction, posture and PAL classifier
 * (instruct/02 sections 2 to 7).
 */
import { ACTIVITY_MET_TABLE, STEP_PACE_PRESETS_ADULT, STEP_PACE_PRESETS_OLDER, WALKING_INTENSITY_TO_PACE } from './activityTable';
import {
  DAYS_PER_WEEK,
  MET_KCAL_DIVISOR,
  MET_REST_O2_ML_KG_MIN_ADULT,
  MET_REST_O2_ML_KG_MIN_OLDER_ADULT,
  OLDER_ADULT_COMPENDIUM_MIN_AGE,
  PAL_ACTIVE_MIN,
  PAL_ADL_PRIOR_FRACTION,
  PAL_BOUNDARY_DISTANCE,
  PAL_CLASSIFIER_REFERENCE_TEF_FRACTION,
  PAL_LOW_ACTIVE_MIN,
  PAL_OUTLIER_MIN,
  PAL_VERY_ACTIVE_MIN,
  POSTURE_KCAL_MIXED,
  POSTURE_KCAL_PHYSICAL,
  POSTURE_KCAL_SEATED,
  POSTURE_KCAL_STANDING,
} from './constants';
import type { OccupationActivity, PalCategory, StructuredActivity, WalkingPace } from './types';

export type CompendiumBasis = 'adult_3_5' | 'older_adult_2_7';

export function compendiumBasisForAge(ageYears: number): CompendiumBasis {
  return ageYears >= OLDER_ADULT_COMPENDIUM_MIN_AGE ? 'older_adult_2_7' : 'adult_3_5';
}

function restingO2(basis: CompendiumBasis): number {
  return basis === 'older_adult_2_7' ? MET_REST_O2_ML_KG_MIN_OLDER_ADULT : MET_REST_O2_ML_KG_MIN_ADULT;
}

/** Net (above rest) kcal per minute for a MET value on a given resting-oxygen basis. */
export function netKcalPerMin(met: number, weightKg: number, basis: CompendiumBasis): number {
  const o2 = restingO2(basis);
  const gross = (met * o2 * weightKg) / MET_KCAL_DIVISOR;
  const rest = (1.0 * o2 * weightKg) / MET_KCAL_DIVISOR;
  return Math.max(0, gross - rest);
}

export function grossKcalPerMin(met: number, weightKg: number, basis: CompendiumBasis): number {
  return (met * restingO2(basis) * weightKg) / MET_KCAL_DIVISOR;
}

export function stepPacePreset(pace: WalkingPace, ageYears: number): { cadenceStepsPerMin: number; met: number; basis: CompendiumBasis } {
  const basis = compendiumBasisForAge(ageYears);
  const preset = basis === 'older_adult_2_7' ? STEP_PACE_PRESETS_OLDER[pace] : STEP_PACE_PRESETS_ADULT[pace];
  return { cadenceStepsPerMin: preset.cadenceStepsPerMin, met: preset.met, basis };
}

export type StepEnergyInput = {
  steps: number;
  pace: WalkingPace;
  weightKg: number;
  ageYears: number;
};

/** Net step energy, kcal/day (02 section 2). Never exact: an estimate only. */
export function netStepKcal(input: StepEnergyInput): number {
  if (input.steps <= 0) return 0;
  const preset = stepPacePreset(input.pace, input.ageYears);
  const minutes = input.steps / preset.cadenceStepsPerMin;
  return netKcalPerMin(preset.met, input.weightKg, preset.basis) * minutes;
}

export type ActivityEnergy = {
  activity: StructuredActivity;
  met: number;
  basis: CompendiumBasis;
  metSource: string;
  stepDominant: boolean;
  sessionNetKcal: number;
  sessionGrossKcal: number;
  /** Steps assumed already counted by the phone for one session (0 for non step-dominant). */
  estimatedStepsPerSession: number;
  overlapStepKcalPerSession: number;
  sessionExtraKcalAfterOverlap: number;
  dailyAvgNetKcal: number;
  dailyAvgKcalAfterOverlap: number;
  usedDefaultCadence: boolean;
};

export function structuredActivityEnergy(activity: StructuredActivity, ctx: { weightKg: number; ageYears: number; usualPace: WalkingPace }): ActivityEnergy {
  const def = ACTIVITY_MET_TABLE[activity.type];
  const ageBasis = compendiumBasisForAge(ctx.ageYears);
  const olderEntry = ageBasis === 'older_adult_2_7' ? def.older[activity.intensity] : null;
  const entry = olderEntry ?? def.adult[activity.intensity];
  const basis: CompendiumBasis = olderEntry ? 'older_adult_2_7' : 'adult_3_5';

  const sessionNetKcal = netKcalPerMin(entry.met, ctx.weightKg, basis) * activity.durationMin;
  const sessionGrossKcal = grossKcalPerMin(entry.met, ctx.weightKg, basis) * activity.durationMin;

  let estimatedStepsPerSession = 0;
  let overlapStepKcalPerSession = 0;
  let usedDefaultCadence = false;
  if (def.stepDominant) {
    // Pace used to value the steps the phone already counted.
    const pace = activity.type === 'walking' ? WALKING_INTENSITY_TO_PACE[activity.intensity] : ctx.usualPace;
    let cadence: number;
    if (def.cadenceStepsPerMin !== null) {
      cadence = def.cadenceStepsPerMin;
    } else {
      cadence = stepPacePreset(pace, ctx.ageYears).cadenceStepsPerMin;
      usedDefaultCadence = activity.type !== 'walking';
    }
    estimatedStepsPerSession = activity.durationMin * cadence;
    overlapStepKcalPerSession = netStepKcal({ steps: estimatedStepsPerSession, pace, weightKg: ctx.weightKg, ageYears: ctx.ageYears });
  }
  const sessionExtraKcalAfterOverlap = def.stepDominant ? Math.max(0, sessionNetKcal - overlapStepKcalPerSession) : sessionNetKcal;

  return {
    activity,
    met: entry.met,
    basis,
    metSource: entry.source,
    stepDominant: def.stepDominant,
    sessionNetKcal,
    sessionGrossKcal,
    estimatedStepsPerSession,
    overlapStepKcalPerSession,
    sessionExtraKcalAfterOverlap,
    dailyAvgNetKcal: (sessionNetKcal * activity.sessionsPerWeek) / DAYS_PER_WEEK,
    dailyAvgKcalAfterOverlap: (sessionExtraKcalAfterOverlap * activity.sessionsPerWeek) / DAYS_PER_WEEK,
    usedDefaultCadence: usedDefaultCadence && activity.sessionsPerWeek > 0 && activity.durationMin > 0,
  };
}

export type ExerciseSummary = {
  perActivity: ActivityEnergy[];
  dailyAvgKcalAfterOverlap: number;
  dailyAvgNetKcalBeforeOverlap: number;
  anyDefaultCadence: boolean;
};

export function exerciseSummary(activities: readonly StructuredActivity[], ctx: { weightKg: number; ageYears: number; usualPace: WalkingPace }): ExerciseSummary {
  const perActivity = activities.map((a) => structuredActivityEnergy(a, ctx));
  return {
    perActivity,
    dailyAvgKcalAfterOverlap: perActivity.reduce((s, a) => s + a.dailyAvgKcalAfterOverlap, 0),
    dailyAvgNetKcalBeforeOverlap: perActivity.reduce((s, a) => s + a.dailyAvgNetKcal, 0),
    anyDefaultCadence: perActivity.some((a) => a.usedDefaultCadence),
  };
}

export const OCCUPATION_POSTURE_KCAL: Readonly<Record<OccupationActivity, number>> = {
  seated: POSTURE_KCAL_SEATED,
  mixed: POSTURE_KCAL_MIXED,
  standing: POSTURE_KCAL_STANDING,
  physical: POSTURE_KCAL_PHYSICAL,
};

const PAL_ORDER: readonly PalCategory[] = ['inactive', 'low_active', 'active', 'very_active'];

export function palCategoryFromValue(pal: number): PalCategory {
  if (pal < PAL_LOW_ACTIVE_MIN) return 'inactive';
  if (pal < PAL_ACTIVE_MIN) return 'low_active';
  if (pal < PAL_VERY_ACTIVE_MIN) return 'active';
  return 'very_active';
}

export function maxPalCategory(a: PalCategory, b: PalCategory): PalCategory {
  return PAL_ORDER.indexOf(a) >= PAL_ORDER.indexOf(b) ? a : b;
}

export function isNearPalBoundary(pal: number): boolean {
  const boundaries = [PAL_LOW_ACTIVE_MIN, PAL_ACTIVE_MIN, PAL_VERY_ACTIVE_MIN, PAL_OUTLIER_MIN];
  return boundaries.some((b) => Math.abs(pal - b) <= PAL_BOUNDARY_DISTANCE);
}

export type PalClassificationInput = {
  reeKcalDay: number;
  occupation: OccupationActivity;
  netStepKcalDay: number;
  exerciseKcalDayAfterOverlap: number;
};

export type PalClassification = {
  adlPriorKcal: number;
  postureKcal: number;
  provisionalTdeeKcal: number;
  provisionalPal: number;
  categoryFromProxy: PalCategory;
  palCategory: PalCategory;
  palBoundaryFlag: boolean;
  palOutlierFlag: boolean;
  physicalOccupationFloorApplied: boolean;
};

/** Factoral proxy used only to select the NASEM category (02 section 7). */
export function classifyPal(input: PalClassificationInput): PalClassification {
  const adlPriorKcal = PAL_ADL_PRIOR_FRACTION * input.reeKcalDay;
  const postureKcal = OCCUPATION_POSTURE_KCAL[input.occupation];
  const provisionalTdeeKcal =
    (input.reeKcalDay + adlPriorKcal + postureKcal + input.netStepKcalDay + input.exerciseKcalDayAfterOverlap) /
    (1 - PAL_CLASSIFIER_REFERENCE_TEF_FRACTION);
  const provisionalPal = provisionalTdeeKcal / input.reeKcalDay;
  const categoryFromProxy = palCategoryFromValue(provisionalPal);
  const physical = input.occupation === 'physical';
  const palCategory = physical ? maxPalCategory(categoryFromProxy, 'active') : categoryFromProxy;
  return {
    adlPriorKcal,
    postureKcal,
    provisionalTdeeKcal,
    provisionalPal,
    categoryFromProxy,
    palCategory,
    palBoundaryFlag: isNearPalBoundary(provisionalPal),
    palOutlierFlag: provisionalPal >= PAL_OUTLIER_MIN,
    physicalOccupationFloorApplied: physical && palCategory !== categoryFromProxy,
  };
}
