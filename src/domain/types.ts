/**
 * Persisted application state (instruct/07 sections 2 to 5).
 * Extensions to the contract are optional fields, documented in IMPLEMENTATION_NOTES D-13.
 */
import type {
  CalibrationSnapshot,
  DailyLog,
  Goal,
  HistoricalIntakeEvidence,
  Interval,
  PalCategory,
  TrajectoryPoint,
  UserProfile,
  WeightEntry,
} from '@/science/types';

/**
 * Version 2 (model 1.1.0): continuous weekly rate replaces speed presets, and historical
 * intake evidence is stored explicitly. See persistence/migrations.ts.
 */
export const SCHEMA_VERSION = 2;

export type ThemePreference = 'light' | 'dark' | 'system';
export type UnitPreference = 'metric' | 'imperial';

export type Preferences = {
  theme: ThemePreference;
  units: UnitPreference;
  /** In-app due state only; no OS notification is promised (07 s12). */
  weighInReminder: boolean;
  showScientificDetails: boolean;
};

export type CurrentPlan = {
  createdAt: string;
  source: 'initial' | 'recalibrated' | 'user_adjusted_slider';

  maintenanceKcal: number;
  maintenanceInterval80: Interval;
  maintenanceInterval95: Interval;

  calorieTarget: number;
  stepTarget: number;

  macros: {
    proteinG: number;
    carbsG: number;
    fatG: number;
  };

  reeKcal: number;
  reeMethod: string;
  palCategory: PalCategory;
  provisionalPal: number;

  goal: Goal;
  weeklyRateTarget: number;

  projection: {
    approximateWeeks?: number;
    trajectory: TrajectoryPoint[];
    lower80: TrajectoryPoint[];
    upper80: TrajectoryPoint[];
  };

  scientificModelVersion: string;

  // Extensions (D-13)
  /** Rounded grams reconciled with the displayed 10 kcal target by the macro engine (03 s6). */
  macrosDisplay?: { proteinG: number; carbsG: number; fatG: number };
  /** Body weight the plan was computed at (trend or onboarding), kg. */
  planWeightKg?: number;
  targetWeightKg?: number;
  /** Weekly rate requested by the user (fraction of body weight per week); weeklyRateTarget is the applied rate. */
  requestedWeeklyRate?: number;
  /** Steps represented in maintenanceKcal. */
  maintenanceStepsPerDay?: number;
  /** Step target of the goal plan before any slider adjustment. */
  baselineStepTarget?: number;
  /** Calorie target of the goal plan before any slider adjustment. */
  baselineCalorieTarget?: number;
  populationTdeeKcal?: number;
  personalOffsetKcal?: number;
  hardFloorKcal?: number;
  warnings?: {
    belowRee: boolean;
    lowEnergyAvailability: boolean;
    gainWithoutResistance: boolean;
    lowCarbForEndurance: boolean;
    lowCarbForResistance: boolean;
  };
  proteinRule?: string;
};

export type AppMeta = {
  /** ISO date of onboarding completion. */
  onboardingDate: string | null;
  /** First population estimate, kept to show evolution vs the initial prior. */
  initialMaintenanceKcal: number | null;
  initialInterval80: Interval | null;
  initialPalCategory: PalCategory | null;
  initialProvisionalPal: number | null;
  initialWeightKg: number | null;
  /** Last surfaced (shown) recalibration, used for surfacing thresholds (05 s12). */
  lastSurfacedCalibration: { tdeeKcal: number; interval80Width: number; surfacedOn: string } | null;
  /** Raw data preserved when stored JSON could not be read (never silently discarded). */
  recoveredCorruptData: { savedAt: string; key: string } | null;
};

export type WheightyStore = {
  schemaVersion: number;
  scientificModelVersion: string;
  profile: UserProfile | null;
  plan: CurrentPlan | null;
  weights: WeightEntry[];
  dailyLogs: DailyLog[];
  calibrationSnapshots: CalibrationSnapshot[];
  /** Historical intake evidence given at onboarding (warm start), null when none (D-23). */
  historicalEvidence: HistoricalIntakeEvidence | null;
  preferences: Preferences;
  meta: AppMeta;
};

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'light',
  units: 'metric',
  weighInReminder: true,
  showScientificDetails: false,
};

export const DEFAULT_META: AppMeta = {
  onboardingDate: null,
  initialMaintenanceKcal: null,
  initialInterval80: null,
  initialPalCategory: null,
  initialProvisionalPal: null,
  initialWeightKg: null,
  lastSurfacedCalibration: null,
  recoveredCorruptData: null,
};
