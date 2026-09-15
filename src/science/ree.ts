/**
 * REE router (instruct/01 sections 3 to 6).
 * Canonical output variable: reeKcalDay.
 */
import {
  ATHLETE_AGE_MAX_YEARS,
  ATHLETE_AGE_MIN_YEARS,
  ATHLETE_MIN_SESSIONS_WEEK,
  ATHLETE_MIN_TRAINING_HOURS_WEEK,
  BODY_FAT_QUALITY_ADP,
  BODY_FAT_QUALITY_CONSUMER_BIA,
  BODY_FAT_QUALITY_DXA,
  BODY_FAT_QUALITY_FOUR_COMPARTMENT,
  BODY_FAT_QUALITY_SELF_ESTIMATE,
  BODY_FAT_QUALITY_SKINFOLD,
  CUNNINGHAM_FFM_COEF,
  CUNNINGHAM_INTERCEPT,
  FFM_PLAUSIBLE_MAX_FRACTION,
  FFM_PLAUSIBLE_MIN_FRACTION,
  MEASURED_RMR_MAX_AGE_MONTHS,
  MEASURED_RMR_MAX_KCAL,
  MEASURED_RMR_MAX_WEIGHT_CHANGE_FRACTION,
  MEASURED_RMR_MIN_KCAL,
  MIFFLIN_AGE_COEF,
  MIFFLIN_FEMALE_INTERCEPT,
  MIFFLIN_HEIGHT_COEF,
  MIFFLIN_MALE_INTERCEPT,
  MIFFLIN_WEIGHT_COEF,
  MINUTES_PER_HOUR,
  REE_DISAGREEMENT_THRESHOLD,
  TEN_HAAF_AGE_COEF,
  TEN_HAAF_FFM_COEF,
  TEN_HAAF_FFM_INTERCEPT,
  TEN_HAAF_HEIGHT_M_COEF,
  TEN_HAAF_INTERCEPT,
  TEN_HAAF_MALE_COEF,
  TEN_HAAF_WEIGHT_COEF,
} from './constants';
import { addMonths, daysBetween } from './dates';
import type { BodyFatMethod, MeasuredRmr, ReeMethod, SexForEquation, StructuredActivity, UserProfile } from './types';

export type AnthropometricInput = {
  sex: SexForEquation;
  ageYears: number;
  heightCm: number;
  weightKg: number;
};

export function mifflinStJeorKcalDay(input: AnthropometricInput): number {
  const base = MIFFLIN_WEIGHT_COEF * input.weightKg + MIFFLIN_HEIGHT_COEF * input.heightCm - MIFFLIN_AGE_COEF * input.ageYears;
  return base + (input.sex === 'male' ? MIFFLIN_MALE_INTERCEPT : MIFFLIN_FEMALE_INTERCEPT);
}

/** ten Haaf weight-based equation. Height must be given in metres. */
export function tenHaafWeightKcalDay(input: { sex: SexForEquation; ageYears: number; heightM: number; weightKg: number }): number {
  return (
    TEN_HAAF_WEIGHT_COEF * input.weightKg +
    TEN_HAAF_HEIGHT_M_COEF * input.heightM -
    TEN_HAAF_AGE_COEF * input.ageYears +
    TEN_HAAF_MALE_COEF * (input.sex === 'male' ? 1 : 0) +
    TEN_HAAF_INTERCEPT
  );
}

export function tenHaafFfmKcalDay(ffmKg: number): number {
  return TEN_HAAF_FFM_COEF * ffmKg + TEN_HAAF_FFM_INTERCEPT;
}

export function cunninghamKcalDay(ffmKg: number): number {
  return CUNNINGHAM_INTERCEPT + CUNNINGHAM_FFM_COEF * ffmKg;
}

export const BODY_FAT_QUALITY: Readonly<Record<BodyFatMethod, number>> = {
  four_compartment: BODY_FAT_QUALITY_FOUR_COMPARTMENT,
  air_displacement_plethysmography: BODY_FAT_QUALITY_ADP,
  dxa: BODY_FAT_QUALITY_DXA,
  skinfold: BODY_FAT_QUALITY_SKINFOLD,
  consumer_bia: BODY_FAT_QUALITY_CONSUMER_BIA,
  self_estimate: BODY_FAT_QUALITY_SELF_ESTIMATE,
};

/** 01 section 5 table: methods allowed to produce a secondary FFM check. */
export function ffmSecondaryCheckAllowed(method: BodyFatMethod): boolean {
  return method === 'four_compartment' || method === 'air_displacement_plethysmography' || method === 'dxa' || method === 'skinfold';
}

/** High-quality laboratory methods (4C, ADP/BodPod, DXA): used by macro athlete override and energy availability. */
export function isHighQualityBodyComposition(method: BodyFatMethod | undefined): boolean {
  return method === 'four_compartment' || method === 'air_displacement_plethysmography' || method === 'dxa';
}

export function fatFreeMassKg(weightKg: number, bodyFatPercent: number): number {
  return weightKg * (1 - bodyFatPercent / 100);
}

export function isPlausibleFfm(ffmKg: number, weightKg: number): boolean {
  const fraction = ffmKg / weightKg;
  return Number.isFinite(fraction) && fraction >= FFM_PLAUSIBLE_MIN_FRACTION && fraction <= FFM_PLAUSIBLE_MAX_FRACTION;
}

export type TrainingLoad = {
  hoursPerWeek: number;
  sessionsPerWeek: number;
  minutesPerWeek: number;
};

export function structuredTrainingLoad(activities: readonly StructuredActivity[]): TrainingLoad {
  let minutes = 0;
  let sessions = 0;
  for (const a of activities) {
    minutes += a.sessionsPerWeek * a.durationMin;
    sessions += a.sessionsPerWeek;
  }
  return { minutesPerWeek: minutes, hoursPerWeek: minutes / MINUTES_PER_HOUR, sessionsPerWeek: sessions };
}

export function isAthleteLike(profile: Pick<UserProfile, 'ageYears' | 'activities'>): boolean {
  const load = structuredTrainingLoad(profile.activities);
  return (
    profile.ageYears >= ATHLETE_AGE_MIN_YEARS &&
    profile.ageYears <= ATHLETE_AGE_MAX_YEARS &&
    load.hoursPerWeek >= ATHLETE_MIN_TRAINING_HOURS_WEEK &&
    load.sessionsPerWeek >= ATHLETE_MIN_SESSIONS_WEEK
  );
}

export type MeasuredRmrStatus =
  | { kind: 'absent' }
  | { kind: 'primary' }
  | { kind: 'secondary'; reasons: Array<'method_unknown' | 'too_old' | 'weight_changed' | 'implausible_value' | 'future_date'> };

export function evaluateMeasuredRmr(measured: MeasuredRmr | undefined, currentWeightKg: number, asOfDate: string): MeasuredRmrStatus {
  if (!measured) return { kind: 'absent' };
  const reasons: Array<'method_unknown' | 'too_old' | 'weight_changed' | 'implausible_value' | 'future_date'> = [];
  if (measured.method !== 'indirect_calorimetry') reasons.push('method_unknown');
  if (daysBetween(measured.measuredAt, asOfDate) < 0) reasons.push('future_date');
  // "test age is 12 months or less": a test exactly 12 calendar months old is still valid.
  if (daysBetween(addMonths(measured.measuredAt, MEASURED_RMR_MAX_AGE_MONTHS), asOfDate) > 0) reasons.push('too_old');
  const change = Math.abs(currentWeightKg - measured.weightKgAtTest) / measured.weightKgAtTest;
  // "differs by less than 5 percent"
  if (!(change < MEASURED_RMR_MAX_WEIGHT_CHANGE_FRACTION)) reasons.push('weight_changed');
  if (measured.kcalPerDay < MEASURED_RMR_MIN_KCAL || measured.kcalPerDay > MEASURED_RMR_MAX_KCAL) reasons.push('implausible_value');
  return reasons.length === 0 ? { kind: 'primary' } : { kind: 'secondary', reasons };
}

export type SecondaryReeCheck = {
  equation: 'ten_haaf_ffm' | 'cunningham' | 'measured_rmr_secondary';
  reeKcalDay: number;
  relativeDisagreement: number;
};

export type ReeRouting = {
  reeKcalDay: number;
  method: ReeMethod;
  athleteLike: boolean;
  measuredRmrStatus: MeasuredRmrStatus;
  /** Plausible FFM from a method allowed for secondary checks, else null. */
  ffmKg: number | null;
  secondaryChecks: SecondaryReeCheck[];
  reeModelDisagreement: boolean;
};

export function routeRee(profile: UserProfile, asOfDate: string): ReeRouting {
  const athleteLike = isAthleteLike(profile);
  const measuredRmrStatus = evaluateMeasuredRmr(profile.measuredRmr, profile.currentWeightKg, asOfDate);

  let reeKcalDay: number;
  let method: ReeMethod;
  if (measuredRmrStatus.kind === 'primary' && profile.measuredRmr) {
    reeKcalDay = profile.measuredRmr.kcalPerDay;
    method = 'measured_indirect_calorimetry';
  } else if (athleteLike) {
    reeKcalDay = tenHaafWeightKcalDay({
      sex: profile.sexForEquation,
      ageYears: profile.ageYears,
      heightM: profile.heightCm / 100,
      weightKg: profile.currentWeightKg,
    });
    method = 'ten_haaf_weight';
  } else {
    reeKcalDay = mifflinStJeorKcalDay({
      sex: profile.sexForEquation,
      ageYears: profile.ageYears,
      heightCm: profile.heightCm,
      weightKg: profile.currentWeightKg,
    });
    method = 'mifflin_st_jeor';
  }

  const secondaryChecks: SecondaryReeCheck[] = [];
  let ffmKg: number | null = null;
  if (profile.bodyFatPercent !== undefined && profile.bodyFatMethod !== undefined && ffmSecondaryCheckAllowed(profile.bodyFatMethod)) {
    const ffm = fatFreeMassKg(profile.currentWeightKg, profile.bodyFatPercent);
    if (isPlausibleFfm(ffm, profile.currentWeightKg)) {
      ffmKg = ffm;
      const th = tenHaafFfmKcalDay(ffm);
      const cu = cunninghamKcalDay(ffm);
      secondaryChecks.push({ equation: 'ten_haaf_ffm', reeKcalDay: th, relativeDisagreement: Math.abs(reeKcalDay - th) / reeKcalDay });
      secondaryChecks.push({ equation: 'cunningham', reeKcalDay: cu, relativeDisagreement: Math.abs(reeKcalDay - cu) / reeKcalDay });
    }
  }
  if (measuredRmrStatus.kind === 'secondary' && profile.measuredRmr && !measuredRmrStatus.reasons.includes('implausible_value')) {
    const value = profile.measuredRmr.kcalPerDay;
    secondaryChecks.push({ equation: 'measured_rmr_secondary', reeKcalDay: value, relativeDisagreement: Math.abs(reeKcalDay - value) / reeKcalDay });
  }

  // D-06: the flag uses the FFM equation matching the population of the primary route
  // (ten Haaf FFM for athlete-like users, Cunningham otherwise). Equations are never averaged.
  const flagEquation = athleteLike ? 'ten_haaf_ffm' : 'cunningham';
  const flagCheck = secondaryChecks.find((c) => c.equation === flagEquation);
  const reeModelDisagreement = flagCheck !== undefined && flagCheck.relativeDisagreement > REE_DISAGREEMENT_THRESHOLD;

  return { reeKcalDay, method, athleteLike, measuredRmrStatus, ffmKg, secondaryChecks, reeModelDisagreement };
}
