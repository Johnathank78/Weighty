/**
 * Population prior assessment: profile -> REE router -> activity classifier ->
 * NASEM 2023 EER -> initial uncertainty (instruct/00 core architecture).
 */
import { classifyPal, exerciseSummary, netStepKcal, OCCUPATION_POSTURE_KCAL } from './activity';
import type { ExerciseSummary, PalClassification } from './activity';
import { ATHLETE_MIN_TRAINING_HOURS_WEEK } from './constants';
import type { PlanContext } from './goals';
import { classifyMacroActivity } from './macros';
import { nasemEerKcalDay } from './nasem';
import { decomposeExpenditure } from './neat';
import type { ExpenditureDecomposition } from './neat';
import { fatFreeMassKg, isHighQualityBodyComposition, isPlausibleFfm, routeRee, structuredTrainingLoad } from './ree';
import type { ReeRouting } from './ree';
import type { Interval, MacroActivityClass, PalCategory, UserProfile } from './types';
import { initialSigma, normalInterval80, normalInterval95 } from './uncertainty';
import type { SigmaBreakdown } from './uncertainty';
import { validateProfile } from './validation';
import type { ValidationResult } from './validation';

export type BaselineAssessment = {
  validation: ValidationResult;
  weightKg: number;
  ree: ReeRouting;
  netStepKcal: number;
  exercise: ExerciseSummary;
  pal: PalClassification;
  /** PAL category used for NASEM (fixed when re-assessing at a new weight). */
  palCategory: PalCategory;
  populationTdeeKcal: number;
  sigma: SigmaBreakdown;
  interval80: Interval;
  interval95: Interval;
  decomposition: ExpenditureDecomposition;
  activityClass: MacroActivityClass;
  highQualityFfmKg: number | null;
  highTrainingLoad: boolean;
};

export type AssessmentOptions = {
  /** Assess at this body weight instead of the profile weight (e.g. current trend weight). */
  weightKg?: number;
  /** Keep a previously selected NASEM PAL category (no reclassification). */
  palCategory?: PalCategory;
};

export function assessBaseline(profile: UserProfile, asOfDate: string, options: AssessmentOptions = {}): BaselineAssessment {
  const weightKg = options.weightKg ?? profile.currentWeightKg;
  const atWeight: UserProfile = { ...profile, currentWeightKg: weightKg };
  const validation = validateProfile(profile);
  const ree = routeRee(atWeight, asOfDate);
  const steps = netStepKcal({ steps: profile.averageSteps7d, pace: profile.walkingPace, weightKg, ageYears: profile.ageYears });
  const exercise = exerciseSummary(profile.activities, { weightKg, ageYears: profile.ageYears, usualPace: profile.walkingPace });
  const pal = classifyPal({
    reeKcalDay: ree.reeKcalDay,
    occupation: profile.occupation,
    netStepKcalDay: steps,
    exerciseKcalDayAfterOverlap: exercise.dailyAvgKcalAfterOverlap,
  });
  const palCategory = options.palCategory ?? pal.palCategory;
  const populationTdeeKcal = nasemEerKcalDay({
    sex: profile.sexForEquation,
    ageYears: profile.ageYears,
    heightCm: profile.heightCm,
    weightKg,
    palCategory,
  });
  const sigma = initialSigma(profile.sexForEquation, {
    palBoundaryFlag: pal.palBoundaryFlag,
    physicalOccupation: profile.occupation === 'physical',
    reeModelDisagreement: ree.reeModelDisagreement,
    defaultActivityCadence: exercise.anyDefaultCadence,
  });
  const decomposition = decomposeExpenditure({
    initialTdeeKcal: populationTdeeKcal,
    reeKcal: ree.reeKcalDay,
    netStepKcal: steps,
    exerciseKcalAfterOverlap: exercise.dailyAvgKcalAfterOverlap,
    occupationPostureKcal: OCCUPATION_POSTURE_KCAL[profile.occupation],
  });

  let highQualityFfmKg: number | null = null;
  if (isHighQualityBodyComposition(profile.bodyFatMethod) && profile.bodyFatPercent !== undefined) {
    const ffm = fatFreeMassKg(weightKg, profile.bodyFatPercent);
    if (isPlausibleFfm(ffm, weightKg)) highQualityFfmKg = ffm;
  }

  return {
    validation,
    weightKg,
    ree,
    netStepKcal: steps,
    exercise,
    pal,
    palCategory,
    populationTdeeKcal,
    sigma,
    interval80: normalInterval80(populationTdeeKcal, sigma.sigmaKcal),
    interval95: normalInterval95(populationTdeeKcal, sigma.sigmaKcal),
    decomposition,
    activityClass: classifyMacroActivity(profile.activities),
    highQualityFfmKg,
    highTrainingLoad: ree.athleteLike || structuredTrainingLoad(profile.activities).hoursPerWeek >= ATHLETE_MIN_TRAINING_HOURS_WEEK,
  };
}

export function planContextFrom(profile: UserProfile, assessment: BaselineAssessment, maintenanceKcal: number): PlanContext {
  return {
    sex: profile.sexForEquation,
    ageYears: profile.ageYears,
    heightCm: profile.heightCm,
    currentWeightKg: assessment.weightKg,
    maintenanceKcal,
    reeKcal: assessment.ree.reeKcalDay,
    walkingPace: profile.walkingPace,
    maintenanceStepsPerDay: profile.averageSteps7d,
    activities: profile.activities,
    activityClass: assessment.activityClass,
    athleteLike: assessment.ree.athleteLike,
    bodyFatPercent: profile.bodyFatPercent,
    bodyFatMethod: profile.bodyFatMethod,
    highQualityFfmKg: assessment.highQualityFfmKg,
    exerciseNetKcalDay: assessment.exercise.dailyAvgNetKcalBeforeOverlap,
    highTrainingLoad: assessment.highTrainingLoad,
  };
}
