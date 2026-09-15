/**
 * Runtime validation of persisted and imported data. Hand-written guards keep the
 * bundle small (no schema library). Each guard returns a list of problems.
 */
import { isIsoDate } from '@/science/dates';
import { SCIENTIFIC_MODEL_VERSION } from '@/science/constants';
import type { CalibrationSnapshot, DailyLog, HistoricalIntakeEvidence, StructuredActivity, UserProfile, WeightEntry } from '@/science/types';
import type { AppMeta, CurrentPlan, Preferences, WheightyStore } from '@/domain/types';
import { DEFAULT_META, DEFAULT_PREFERENCES, SCHEMA_VERSION } from '@/domain/types';

type Obj = Record<string, unknown>;

export function isObject(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const oneOf = <T extends string>(v: unknown, values: readonly T[]): v is T => isStr(v) && (values as readonly string[]).includes(v);
const isInterval = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);

const ACTIVITY_TYPES = ['strength', 'running', 'walking', 'hiking', 'cycling', 'swimming', 'rowing', 'team_sport', 'other'] as const;
const INTENSITIES = ['light', 'moderate', 'vigorous'] as const;
const BODY_FAT_METHODS = ['four_compartment', 'air_displacement_plethysmography', 'dxa', 'skinfold', 'consumer_bia', 'self_estimate'] as const;
const ADHERENCE = ['on_plan', 'minor_deviation', 'major_deviation'] as const;
const CONFIDENCE = ['low', 'medium', 'good', 'high'] as const;
const PAL = ['inactive', 'low_active', 'active', 'very_active'] as const;
const GOALS = ['loss', 'maintenance', 'gain'] as const;
const TRACKING_QUALITY = ['high', 'medium', 'low'] as const;
/** Display names are optional local strings; the bound only protects storage. */
export const NAME_MAX_LENGTH = 60;

export function isStructuredActivity(v: unknown): v is StructuredActivity {
  return isObject(v) && oneOf(v.type, ACTIVITY_TYPES) && isNum(v.sessionsPerWeek) && v.sessionsPerWeek >= 0 && isNum(v.durationMin) && v.durationMin >= 0 && oneOf(v.intensity, INTENSITIES);
}

export function isUserProfile(v: unknown): v is UserProfile {
  if (!isObject(v)) return false;
  if (!(isNum(v.ageYears) && oneOf(v.sexForEquation, ['female', 'male'] as const) && isNum(v.heightCm) && isNum(v.currentWeightKg))) return false;
  if (v.firstName !== undefined && !(isStr(v.firstName) && v.firstName.length <= NAME_MAX_LENGTH)) return false;
  if (v.lastName !== undefined && !(isStr(v.lastName) && v.lastName.length <= NAME_MAX_LENGTH)) return false;
  if (v.bodyFatPercent !== undefined && !isNum(v.bodyFatPercent)) return false;
  if (v.bodyFatMethod !== undefined && !oneOf(v.bodyFatMethod, BODY_FAT_METHODS)) return false;
  if (v.measuredRmr !== undefined) {
    const m = v.measuredRmr;
    if (!(isObject(m) && isNum(m.kcalPerDay) && isStr(m.measuredAt) && isIsoDate(m.measuredAt) && isNum(m.weightKgAtTest) && oneOf(m.method, ['indirect_calorimetry', 'unknown'] as const) && isBool(m.conditionsKnown))) return false;
  }
  return (
    isNum(v.averageSteps7d) &&
    oneOf(v.walkingPace, ['slow', 'normal', 'brisk'] as const) &&
    oneOf(v.occupation, ['seated', 'mixed', 'standing', 'physical'] as const) &&
    Array.isArray(v.activities) &&
    v.activities.every(isStructuredActivity) &&
    oneOf(v.goal, GOALS) &&
    isNum(v.targetWeightKg) &&
    isNum(v.weeklyRateTarget) &&
    v.weeklyRateTarget >= 0
  );
}

/** Structural guard; scientific bounds are checked by science/warmStart validateHistoricalEvidence. */
export function isHistoricalEvidence(v: unknown): v is HistoricalIntakeEvidence {
  return (
    isObject(v) &&
    v.evidenceVersion === 1 &&
    isStr(v.recordedOn) &&
    isIsoDate(v.recordedOn) &&
    isNum(v.averageCaloriesKcal) &&
    isNum(v.durationDays) &&
    (v.startWeightKg === null || isNum(v.startWeightKg)) &&
    isNum(v.endWeightKg) &&
    oneOf(v.trackingQuality, TRACKING_QUALITY) &&
    isBool(v.activityComparable)
  );
}

export function isWeightEntry(v: unknown): v is WeightEntry {
  return isObject(v) && isStr(v.id) && isStr(v.date) && isIsoDate(v.date) && isNum(v.weightKg) && v.weightKg > 0 && isStr(v.createdAt);
}

const isMacroGrams = (v: unknown): boolean => isObject(v) && isNum(v.proteinG) && isNum(v.carbsG) && isNum(v.fatG);

export function isDailyLog(v: unknown): v is DailyLog {
  if (!(isObject(v) && isStr(v.date) && isIsoDate(v.date) && isNum(v.calorieTargetForDay) && isNum(v.stepTargetForDay))) return false;
  if (v.actualSteps !== undefined && !(isNum(v.actualSteps) && v.actualSteps >= 0)) return false;
  if (v.adherence !== undefined && !oneOf(v.adherence, ADHERENCE)) return false;
  if (v.macrosForDay !== undefined && !isMacroGrams(v.macrosForDay)) return false;
  return true;
}

export function isCalibrationSnapshot(v: unknown): v is CalibrationSnapshot {
  return (
    isObject(v) &&
    isStr(v.scientificModelVersion) &&
    isStr(v.createdAt) &&
    isNum(v.posteriorMeanOffsetKcal) &&
    isNum(v.posteriorMedianOffsetKcal) &&
    isInterval(v.interval80) &&
    isInterval(v.interval95) &&
    isNum(v.calibratedTdeeMedian) &&
    isNum(v.validWeightCount) &&
    isNum(v.observationSpanDays) &&
    oneOf(v.confidence, CONFIDENCE) &&
    (v.populationTdeeKcal === undefined || isNum(v.populationTdeeKcal)) &&
    (v.appliedAt === undefined || isStr(v.appliedAt)) &&
    (v.source === undefined || oneOf(v.source, ['weights', 'warm_start'] as const))
  );
}

const isTrajectory = (v: unknown): boolean => Array.isArray(v) && v.every((p) => isObject(p) && isNum(p.day) && isNum(p.weightKg));

export function isCurrentPlan(v: unknown): v is CurrentPlan {
  if (!isObject(v)) return false;
  const proj = v.projection;
  return (
    isStr(v.createdAt) &&
    oneOf(v.source, ['initial', 'recalibrated', 'user_adjusted_slider'] as const) &&
    isNum(v.maintenanceKcal) &&
    isInterval(v.maintenanceInterval80) &&
    isInterval(v.maintenanceInterval95) &&
    isNum(v.calorieTarget) &&
    isNum(v.stepTarget) &&
    isMacroGrams(v.macros) &&
    isNum(v.reeKcal) &&
    isStr(v.reeMethod) &&
    oneOf(v.palCategory, PAL) &&
    isNum(v.provisionalPal) &&
    oneOf(v.goal, GOALS) &&
    isNum(v.weeklyRateTarget) &&
    isObject(proj) &&
    (proj.approximateWeeks === undefined || isNum(proj.approximateWeeks)) &&
    isTrajectory(proj.trajectory) &&
    isTrajectory(proj.lower80) &&
    isTrajectory(proj.upper80) &&
    isStr(v.scientificModelVersion) &&
    (v.macrosDisplay === undefined || isMacroGrams(v.macrosDisplay)) &&
    (v.requestedWeeklyRate === undefined || isNum(v.requestedWeeklyRate))
  );
}

export function isPreferences(v: unknown): v is Preferences {
  return isObject(v) && oneOf(v.theme, ['light', 'dark', 'system'] as const) && oneOf(v.units, ['metric', 'imperial'] as const) && isBool(v.weighInReminder) && isBool(v.showScientificDetails);
}

function sanitizeMeta(v: unknown): AppMeta {
  if (!isObject(v)) return { ...DEFAULT_META };
  const surfaced = v.lastSurfacedCalibration;
  const recovered = v.recoveredCorruptData;
  return {
    onboardingDate: isStr(v.onboardingDate) && isIsoDate(v.onboardingDate) ? v.onboardingDate : null,
    initialMaintenanceKcal: isNum(v.initialMaintenanceKcal) ? v.initialMaintenanceKcal : null,
    initialInterval80: isInterval(v.initialInterval80) ? v.initialInterval80 : null,
    initialPalCategory: oneOf(v.initialPalCategory, PAL) ? v.initialPalCategory : null,
    initialProvisionalPal: isNum(v.initialProvisionalPal) ? v.initialProvisionalPal : null,
    initialWeightKg: isNum(v.initialWeightKg) ? v.initialWeightKg : null,
    lastSurfacedCalibration:
      isObject(surfaced) && isNum(surfaced.tdeeKcal) && isNum(surfaced.interval80Width) && isStr(surfaced.surfacedOn)
        ? { tdeeKcal: surfaced.tdeeKcal, interval80Width: surfaced.interval80Width, surfacedOn: surfaced.surfacedOn }
        : null,
    recoveredCorruptData: isObject(recovered) && isStr(recovered.savedAt) && isStr(recovered.key) ? { savedAt: recovered.savedAt, key: recovered.key } : null,
  };
}

export type StoreValidation = {
  store: WheightyStore;
  /** Items that could not be kept, with the path and reason. */
  dropped: Array<{ path: string; reason: string }>;
  /** True when every field of the input was valid as-is. */
  clean: boolean;
};

/**
 * Validates a migrated (current schema) store object. Invalid individual records are
 * reported in `dropped`; callers must preserve the raw input before accepting a
 * non-clean result so history is never silently lost.
 */
export function validateStore(v: unknown): StoreValidation | { error: string } {
  if (!isObject(v)) return { error: 'not_an_object' };
  if (v.schemaVersion !== SCHEMA_VERSION) return { error: 'unsupported_schema_version' };
  const dropped: StoreValidation['dropped'] = [];

  const profile = v.profile === null || v.profile === undefined ? null : isUserProfile(v.profile) ? v.profile : null;
  if (v.profile !== null && v.profile !== undefined && profile === null) dropped.push({ path: 'profile', reason: 'invalid' });

  const plan = v.plan === null || v.plan === undefined ? null : isCurrentPlan(v.plan) ? v.plan : null;
  if (v.plan !== null && v.plan !== undefined && plan === null) dropped.push({ path: 'plan', reason: 'invalid' });

  const collect = <T>(key: string, guard: (x: unknown) => x is T): T[] => {
    const raw = v[key];
    if (!Array.isArray(raw)) {
      if (raw !== undefined) dropped.push({ path: key, reason: 'not_an_array' });
      return [];
    }
    const out: T[] = [];
    raw.forEach((item, i) => {
      if (guard(item)) out.push(item);
      else dropped.push({ path: `${key}.${i}`, reason: 'invalid' });
    });
    return out;
  };

  const weights = collect('weights', isWeightEntry);
  const dailyLogs = collect('dailyLogs', isDailyLog);
  const calibrationSnapshots = collect('calibrationSnapshots', isCalibrationSnapshot);
  const preferences = isPreferences(v.preferences) ? v.preferences : { ...DEFAULT_PREFERENCES };
  if (v.preferences !== undefined && !isPreferences(v.preferences)) dropped.push({ path: 'preferences', reason: 'invalid' });

  const historicalEvidence = v.historicalEvidence === null || v.historicalEvidence === undefined ? null : isHistoricalEvidence(v.historicalEvidence) ? v.historicalEvidence : null;
  if (v.historicalEvidence !== null && v.historicalEvidence !== undefined && historicalEvidence === null) dropped.push({ path: 'historicalEvidence', reason: 'invalid' });

  const store: WheightyStore = {
    schemaVersion: SCHEMA_VERSION,
    scientificModelVersion: isStr(v.scientificModelVersion) ? v.scientificModelVersion : SCIENTIFIC_MODEL_VERSION,
    profile,
    plan,
    weights,
    dailyLogs,
    calibrationSnapshots,
    historicalEvidence,
    preferences,
    meta: sanitizeMeta(v.meta),
  };
  return { store, dropped, clean: dropped.length === 0 };
}

export function emptyStore(): WheightyStore {
  return {
    schemaVersion: SCHEMA_VERSION,
    scientificModelVersion: SCIENTIFIC_MODEL_VERSION,
    profile: null,
    plan: null,
    weights: [],
    dailyLogs: [],
    calibrationSnapshots: [],
    historicalEvidence: null,
    preferences: { ...DEFAULT_PREFERENCES },
    meta: { ...DEFAULT_META },
  };
}
