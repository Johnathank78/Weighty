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
 * intake evidence is stored explicitly.
 * Version 3 (food journal, no model change): `foodJournal` and the product search opt-in
 * preference. See persistence/migrations.ts and IMPLEMENTATION_NOTES J-01.
 * Version 4 (UI journal pass): `FoodEntry.consumedTime`, time of consumption distinct from the save time (J-06).
 */
export const SCHEMA_VERSION = 4;

export type ThemePreference = 'light' | 'dark' | 'system';
export type UnitPreference = 'metric' | 'imperial';

export type Preferences = {
  theme: ThemePreference;
  units: UnitPreference;
  /** In-app due state only; no OS notification is promised (07 s12). */
  weighInReminder: boolean;
  showScientificDetails: boolean;
  /**
   * Explicit opt-in for the Open Food Facts product lookup (J-03). Off by default; when off,
   * no network request is ever made. Never carried over by an import.
   */
  productSearchEnabled: boolean;
};

// ---------------------------------------------------------------------------
// Food journal (J-01). Display only: never read by the engine, the calibration or the plan.
// ---------------------------------------------------------------------------

export type FoodSource = 'ciqual' | 'off' | 'manual';

/** Nutrients for a given amount; null when the source does not give the constituent. */
export type FoodNutrients = {
  energyKcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

export type FoodEntry = {
  id: string;
  /**
   * Local day the food was EATEN (consumption day), never the save day: a snack eaten at 23:00 and
   * saved at 00:30 belongs to the previous day (J-06).
   */
  date: string;
  /** ISO timestamp of the entry creation (technical save time). */
  loggedAt: string;
  /** Local wall clock time (HH:MM) of the entry creation (save time), kept as a raw observable. */
  localTime: string;
  /** Local time (HH:MM) at which the food was eaten on `date` (schema 4). Drives the journal timeline. */
  consumedTime: string;
  name: string;
  brand?: string;
  source: FoodSource;
  /** Ciqual alim_code or Open Food Facts barcode; null for a manual entry. */
  sourceId: string | null;
  /** Ciqual table version or Open Food Facts last_modified_t; null for a manual entry. */
  sourceVersion: string | null;
  /** ISO timestamp at which the source values were resolved. */
  resolvedAt: string;
  /** Snapshot of the source values per 100 g at resolution time; null for a manual entry. */
  per100g: FoodNutrients | null;
  /** Amount eaten; null for a manual entry given as a total without weight. */
  quantity: { grams: number; portion?: { id: string; label: string; count: number; gramsEach: number } } | null;
  /** Resolved nutrients of this entry, frozen at save time. */
  intake: FoodNutrients;
};

/** Reusable personal portion. `foodKey` ties it to one food (`source:sourceId`), null for any food. */
export type PersonalPortion = {
  id: string;
  label: string;
  grams: number;
  foodKey: string | null;
  createdAt: string;
};

export type FoodJournal = {
  journalVersion: 1;
  /** Local day of the first entry ever saved, null before any use. */
  startedOn: string | null;
  entries: FoodEntry[];
  portions: PersonalPortion[];
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
  /** Optional food journal (schema 3, J-01). Kept apart from dailyLogs and the plan targets. */
  foodJournal: FoodJournal;
  preferences: Preferences;
  meta: AppMeta;
};

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'light',
  units: 'metric',
  weighInReminder: true,
  showScientificDetails: false,
  productSearchEnabled: false,
};

export function emptyFoodJournal(): FoodJournal {
  return { journalVersion: 1, startedOn: null, entries: [], portions: [] };
}

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
