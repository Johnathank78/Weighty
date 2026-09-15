/**
 * Input validation (instruct/07 section 8, 00 product target).
 * Invalid input is rejected with a reason, never silently clamped.
 */
import {
  AGE_MAX_YEARS,
  AGE_MIN_YEARS,
  BMI_SANITY_MAX,
  BMI_SANITY_MIN,
  BODY_FAT_MAX_PERCENT,
  BODY_FAT_MIN_PERCENT,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  MEASURED_RMR_MAX_KCAL,
  MEASURED_RMR_MIN_KCAL,
  SESSION_DURATION_MAX_MIN,
  SESSIONS_MAX_PER_WEEK,
  STEPS_MAX_PER_DAY,
  STEPS_MIN_PER_DAY,
  TRAINING_MAX_MIN_PER_WEEK,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
} from './constants';
import { isIsoDate } from './dates';
import { bmi } from './macros';
import { structuredTrainingLoad } from './ree';
import type { UserProfile } from './types';

export type ValidationIssue = {
  field: string;
  code:
    | 'out_of_scope_age'
    | 'out_of_range'
    | 'not_finite'
    | 'not_integer'
    | 'missing'
    | 'invalid_date'
    | 'implausible_combination';
  min?: number;
  max?: number;
};

export type ValidationResult = { ok: true } | { ok: false; issues: ValidationIssue[] };

function checkRange(issues: ValidationIssue[], field: string, value: number | undefined, min: number, max: number): void {
  if (value === undefined) {
    issues.push({ field, code: 'missing' });
    return;
  }
  if (!Number.isFinite(value)) {
    issues.push({ field, code: 'not_finite' });
    return;
  }
  if (value < min || value > max) issues.push({ field, code: 'out_of_range', min, max });
}

export function validateAge(ageYears: number): ValidationIssue | null {
  if (!Number.isFinite(ageYears)) return { field: 'ageYears', code: 'not_finite' };
  if (!Number.isInteger(ageYears)) return { field: 'ageYears', code: 'not_integer' };
  if (ageYears < AGE_MIN_YEARS || ageYears > AGE_MAX_YEARS) return { field: 'ageYears', code: 'out_of_scope_age', min: AGE_MIN_YEARS, max: AGE_MAX_YEARS };
  return null;
}

export function validateProfile(profile: UserProfile): ValidationResult {
  const issues: ValidationIssue[] = [];
  const age = validateAge(profile.ageYears);
  if (age) issues.push(age);
  checkRange(issues, 'heightCm', profile.heightCm, HEIGHT_MIN_CM, HEIGHT_MAX_CM);
  checkRange(issues, 'currentWeightKg', profile.currentWeightKg, WEIGHT_MIN_KG, WEIGHT_MAX_KG);
  checkRange(issues, 'targetWeightKg', profile.targetWeightKg, WEIGHT_MIN_KG, WEIGHT_MAX_KG);
  checkRange(issues, 'averageSteps7d', profile.averageSteps7d, STEPS_MIN_PER_DAY, STEPS_MAX_PER_DAY);

  if (profile.bodyFatPercent !== undefined) {
    checkRange(issues, 'bodyFatPercent', profile.bodyFatPercent, BODY_FAT_MIN_PERCENT, BODY_FAT_MAX_PERCENT);
    if (profile.bodyFatMethod === undefined) issues.push({ field: 'bodyFatMethod', code: 'missing' });
  }

  if (profile.measuredRmr) {
    checkRange(issues, 'measuredRmr.kcalPerDay', profile.measuredRmr.kcalPerDay, MEASURED_RMR_MIN_KCAL, MEASURED_RMR_MAX_KCAL);
    checkRange(issues, 'measuredRmr.weightKgAtTest', profile.measuredRmr.weightKgAtTest, WEIGHT_MIN_KG, WEIGHT_MAX_KG);
    if (!isIsoDate(profile.measuredRmr.measuredAt)) issues.push({ field: 'measuredRmr.measuredAt', code: 'invalid_date' });
  }

  profile.activities.forEach((a, i) => {
    checkRange(issues, `activities.${i}.sessionsPerWeek`, a.sessionsPerWeek, 0, SESSIONS_MAX_PER_WEEK);
    checkRange(issues, `activities.${i}.durationMin`, a.durationMin, 0, SESSION_DURATION_MAX_MIN);
  });
  const load = structuredTrainingLoad(profile.activities);
  if (load.minutesPerWeek > TRAINING_MAX_MIN_PER_WEEK) {
    issues.push({ field: 'activities', code: 'out_of_range', min: 0, max: TRAINING_MAX_MIN_PER_WEEK });
  }

  if (issues.length === 0) {
    const b = bmi(profile.currentWeightKg, profile.heightCm);
    if (b < BMI_SANITY_MIN || b > BMI_SANITY_MAX) issues.push({ field: 'currentWeightKg', code: 'implausible_combination', min: BMI_SANITY_MIN, max: BMI_SANITY_MAX });
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
