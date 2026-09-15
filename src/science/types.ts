/**
 * Shared scientific and domain types.
 * Units are part of the field names: Kg, Cm, M, Kcal, Min, Years, Days.
 */

export type SexForEquation = 'female' | 'male';

export type BodyFatMethod =
  | 'four_compartment'
  | 'air_displacement_plethysmography'
  | 'dxa'
  | 'skinfold'
  | 'consumer_bia'
  | 'self_estimate';

export type MeasuredRmr = {
  kcalPerDay: number;
  /** ISO local date YYYY-MM-DD */
  measuredAt: string;
  weightKgAtTest: number;
  method: 'indirect_calorimetry' | 'unknown';
  conditionsKnown: boolean;
};

export type WalkingPace = 'slow' | 'normal' | 'brisk';
export type OccupationActivity = 'seated' | 'mixed' | 'standing' | 'physical';

export type StructuredActivityType =
  | 'strength'
  | 'running'
  | 'walking'
  | 'hiking'
  | 'cycling'
  | 'swimming'
  | 'rowing'
  | 'team_sport'
  | 'other';

export type ActivityIntensity = 'light' | 'moderate' | 'vigorous';

export type StructuredActivity = {
  type: StructuredActivityType;
  sessionsPerWeek: number;
  durationMin: number;
  intensity: ActivityIntensity;
};

export type Goal = 'loss' | 'maintenance' | 'gain';
/** Qualitative zone of the continuous speed slider (labels Douce, Modérée, Rapide). Not a preset. */
export type SpeedZone = 'gentle' | 'moderate' | 'fast';

export type UserProfile = {
  /** Local display only (initials, light personalisation). Never used by the engine, never sent anywhere. */
  firstName?: string;
  lastName?: string;

  ageYears: number;
  sexForEquation: SexForEquation;
  heightCm: number;
  currentWeightKg: number;

  bodyFatPercent?: number;
  bodyFatMethod?: BodyFatMethod;

  measuredRmr?: MeasuredRmr;

  averageSteps7d: number;
  walkingPace: WalkingPace;
  occupation: OccupationActivity;
  activities: StructuredActivity[];

  goal: Goal;
  targetWeightKg: number;
  /**
   * Requested weekly rate of change as a fraction of current body weight per week
   * (0.005 = 0.5 percent per week). 0 for maintenance. Replaces the v1 speed presets (D-22).
   */
  weeklyRateTarget: number;
};

export type TrackingQuality = 'high' | 'medium' | 'low';

/**
 * Historical intake evidence supplied at onboarding by users who already track calories
 * (warm start, IMPLEMENTATION_NOTES D-23). A summary, never expanded into fake daily logs.
 */
export type HistoricalIntakeEvidence = {
  /** Version of this evidence record format. */
  evidenceVersion: 1;
  /** ISO local date the history ends (onboarding day). */
  recordedOn: string;
  averageCaloriesKcal: number;
  durationDays: number;
  /** Weight at the start of the period, null when unknown (evidence then not usable). */
  startWeightKg: number | null;
  endWeightKg: number;
  trackingQuality: TrackingQuality;
  activityComparable: boolean;
};

export type PalCategory = 'inactive' | 'low_active' | 'active' | 'very_active';

export type ReeMethod = 'measured_indirect_calorimetry' | 'ten_haaf_weight' | 'mifflin_st_jeor';

export type MacroActivityClass = 'sedentary' | 'endurance' | 'resistance' | 'mixed';

export type Adherence = 'on_plan' | 'minor_deviation' | 'major_deviation' | 'unknown';

export type ConfidenceLevel = 'low' | 'medium' | 'good' | 'high';

export type Interval = readonly [number, number];

export type MacroGrams = {
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type WeightEntry = {
  id: string;
  /** ISO local date YYYY-MM-DD */
  date: string;
  weightKg: number;
  /** ISO timestamp */
  createdAt: string;
};

export type DailyLog = {
  /** ISO local date YYYY-MM-DD */
  date: string;
  actualSteps?: number;
  adherence?: 'on_plan' | 'minor_deviation' | 'major_deviation';
  calorieTargetForDay: number;
  stepTargetForDay: number;
  /**
   * Extension to the 07 data contract (IMPLEMENTATION_NOTES D-13): macro targets
   * in force that day, so historical TEF can be reconstructed without using
   * today's plan.
   */
  macrosForDay?: MacroGrams;
};

export type TrajectoryPoint = { day: number; weightKg: number };

export type CalibrationSnapshot = {
  scientificModelVersion: string;
  createdAt: string;
  posteriorMeanOffsetKcal: number;
  posteriorMedianOffsetKcal: number;
  interval80: Interval;
  interval95: Interval;
  calibratedTdeeMedian: number;
  validWeightCount: number;
  observationSpanDays: number;
  confidence: ConfidenceLevel;
  /** Extension: population TDEE the offset refers to, and whether the snapshot was applied to the plan. */
  populationTdeeKcal?: number;
  appliedAt?: string;
  /** Extension: 'warm_start' when the posterior comes from historical intake evidence only (no weigh-in yet). Absent means weigh-in calibration. */
  source?: 'weights' | 'warm_start';
};
