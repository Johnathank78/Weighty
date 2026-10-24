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
 * Version 5: `FoodJournal.library`, the user's food library "Mes aliments" (J-09).
 * Version 6: `StoredWeight.menstruating`, journaling only, never read by the engine (C-01).
 * Version 7 (model 1.4.0, pass 5a): plan sources 'guardrail' and 'periodic_replan'; `AppMeta.planEvents` (persistent trace
 * of guardrails, periodic replans, target migration and underweight alerts), `periodicReplanCheckedOn` and
 * `guardrailMaintenanceSince`; loss targets below the BMI-20 weight raised to it.
 * Version 8 (model 1.5.0, pass 5b): `AppMeta.journalPath`, the journal path of the user (method in force, switch date,
 * refusals, gate and habit of the measured habit, offer awaiting confirmation, last return to the aligned target), and the
 * trace rules of the journal path. Loaded from schema 7 with the method 'assumed' (the target is assumed to be followed).
 * Version 9 (model 1.6.0, fixes of pass 5b): `StoredDailyLog.adherenceSource` (who gave the declaration: the user, or the
 * journal), plan source 'personal_target' and `CurrentPlan.personalTarget` (the target chosen by the user). The lock of the
 * aligned target is not stored: it is the plan in force being the aligned target itself (`chosenTargetActive`). Loaded from
 * schema 8 with every existing declaration from the user.
 * Version 10 (model 1.7.0, second fixes of pass 5b): the personal target keeps the rate estimated at the start, signed, and
 * whether it lies beyond the slider grid (`PersonalTarget`); the trace rules 'personal_target_set' and
 * 'personal_target_takeover', with their `PlanEvent.personalTarget`. Loaded from schema 9: the predicted rate becomes the
 * signed estimated rate, and the rates of the profile and of the plan are brought inside the range of the goal.
 */
export const SCHEMA_VERSION = 10;

/**
 * A weigh-in as this app stores it: the engine contract (`WeightEntry`, science) plus fields that are
 * journaling only. The engine receives these objects as `WeightEntry` and never looks at the extras.
 */
export type StoredWeight = WeightEntry & {
  /** Noted by the user on the weigh-in (C-01). Absent means not noted; only ever written when true. */
  menstruating?: boolean;
};

/**
 * Who gave the declared adherence of a day (schema 9): 'user' (declared, or imported), 'journal' (deduced from a day logged
 * in full, fixes of pass 5b, point 4). A declaration from the user is never replaced by the journal.
 */
export type AdherenceSource = 'user' | 'journal';
export const ADHERENCE_SOURCES: readonly AdherenceSource[] = ['user', 'journal'];

/** A daily log as this app stores it: the engine contract (`DailyLog`) plus the source of its declaration (schema 9). */
export type StoredDailyLog = DailyLog & {
  adherenceSource?: AdherenceSource;
};

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

/**
 * "Mes aliments" (schema 5, J-09): the user's own food library, filled automatically with the free entries
 * they named and the Open Food Facts products they fetched. It is a reuse aid only: journal entries keep
 * their own snapshot and never read the library back.
 */
export type LibraryFood = {
  /** `off:<barcode>` or `manual:<normalised name>`. */
  key: string;
  source: 'off' | 'manual';
  name: string;
  brand?: string;
  /** Barcode for a product, null for a free entry. */
  sourceId: string | null;
  /** Open Food Facts last_modified_t of the stored record, null for a free entry. */
  sourceVersion: string | null;
  /** Product values per 100 g (null when Open Food Facts gives no kcal, or for a free entry). */
  per100g: FoodNutrients | null;
  /** Free entry values as typed, for the grams given (null for a product). */
  manual: { intake: FoodNutrients; grams: number | null } | null;
  /** Serving and package weight announced by the product record, grams, when given. */
  servingGrams: number | null;
  packageGrams: number | null;
  /** ISO timestamps: when the values were stored (fetched or typed), and last use. */
  savedAt: string;
  lastUsedAt: string;
};

export type FoodJournal = {
  journalVersion: 1;
  /** Local day of the first entry ever saved, null before any use. */
  startedOn: string | null;
  entries: FoodEntry[];
  portions: PersonalPortion[];
  /** "Mes aliments" (schema 5). */
  library: LibraryFood[];
};

/**
 * Source of a plan. 'guardrail': rebuilt by a guardrail of the plan in force (BMI 20 or rate cap, pass 5a);
 * 'periodic_replan': rebuilt every 28 days from the day's state, without a new calibration (pass 5a); 'personal_target': the
 * target chosen by the user (schema 9, fixes of pass 5b, point 6).
 */
export type PlanSource = 'initial' | 'recalibrated' | 'user_adjusted_slider' | 'guardrail' | 'periodic_replan' | 'personal_target';
export const PLAN_SOURCES: readonly PlanSource[] = ['initial', 'recalibrated', 'user_adjusted_slider', 'guardrail', 'periodic_replan', 'personal_target'];

export type CurrentPlan = {
  createdAt: string;
  source: PlanSource;

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
  /** The target chosen by the user (schema 9, source 'personal_target'; shape of schema 10). */
  personalTarget?: PersonalTarget;
};

/**
 * The target chosen by the user (schema 10, second fixes of pass 5b, point 1): kcal/day, and the weekly rate the model
 * estimates with it at the start, for display only (fraction of body weight per week, signed: negative, a loss; positive, a
 * gain). `beyondGrid`: the target lies beyond the last notch of the slider grid ("plus de {max} %"), the rate is that notch's.
 * The rates requested and applied of the profile and of the plan stay inside the limits of the goal and of the BMI.
 */
export type PersonalTarget = { kcal: number; estimatedRate: number; beyondGrid: boolean };

/**
 * How the app takes a personal target over at its first recalibration (second fixes of pass 5b, point 1c), from the rate the
 * personal target gives on the new estimate: 'within' the limits of the goal and of the BMI (that rate, on the slider grid);
 * 'too_fast' (the allowed rate); 'too_slow' (slower than the minimum of the goal: the minimum); 'opposite' (the wrong
 * direction: the minimum); 'maintenance' (a maintenance goal: the maintenance plan). The same rule gives the rate of the
 * profile when the personal target is set.
 */
export type PersonalTargetCase = 'within' | 'too_fast' | 'too_slow' | 'opposite' | 'maintenance';
export const PERSONAL_TARGET_CASES: readonly PersonalTargetCase[] = ['within', 'too_fast', 'too_slow', 'opposite', 'maintenance'];

/** What the trace keeps of a plan (pass 5a): enough to say what changed, without the projection. */
export type PlanSummary = {
  createdAt: string;
  source: PlanSource;
  goal: Goal;
  calorieTarget: number;
  stepTarget: number;
  weeklyRateTarget: number;
  requestedWeeklyRate: number | null;
  maintenanceKcal: number;
  targetWeightKg: number | null;
};

/**
 * Rule behind a trace entry (pass 5a):
 * - 'G1': a loss plan under BMI 20 switched to maintenance; 'G2': a loss rate above the cap of the current BMI brought to it;
 * - 'periodic_replan': the plan rebuilt 28 days after the last solve;
 * - 'target_bmi_20': a stored loss target under the BMI-20 weight raised to it (migration to schema 7);
 * - 'underweight_bmi': trend under BMI 18.5; 'underweight_decline': trend down 4 weeks running in a maintenance imposed by G1;
 * - 'personal_target_set': the user set their own target (no message; schema 10);
 * - 'personal_target_takeover': the app took the personal target over at its first recalibration, with its message (schema
 *   10; failed: the build failed, the personal target stays, no message).
 */
export type PlanEventRule =
  | 'G1'
  | 'G2'
  | 'periodic_replan'
  | 'target_bmi_20'
  | 'underweight_bmi'
  | 'underweight_decline'
  | 'personal_target_set'
  | 'personal_target_takeover'
  | JournalEventRule;

/**
 * Rules of the journal path (pass 5b):
 * - 'journal_switch': the user aligned the target on the journal (message when the floor raised it);
 * - 'journal_proposal_declined': the automatic proposal was refused ("Garder ma cible");
 * - 'journal_log_more': deviations dominate but the journal is too short (invitation to log for two weeks);
 * - 'journal_weigh_daily': on the aligned target, the encouragement to weigh in every day;
 * - 'journal_measured_offer': a plan of the measured habit is offered for confirmation (failed: its build failed, silent);
 * - 'journal_measured_enter': the first plan of the measured habit was confirmed; 'journal_measured_update': a later one;
 * - 'journal_offer_declined': an offered plan of the measured habit was refused ("Plus tard");
 * - 'journal_measured_exit': back to the aligned target (reason 'weighins' or 'logging'), with its message.
 */
export type JournalEventRule =
  | 'journal_switch'
  | 'journal_proposal_declined'
  | 'journal_log_more'
  | 'journal_weigh_daily'
  | 'journal_measured_offer'
  | 'journal_measured_enter'
  | 'journal_measured_update'
  | 'journal_offer_declined'
  | 'journal_measured_exit';

export const PLAN_EVENT_RULES: readonly PlanEventRule[] = [
  'G1',
  'G2',
  'periodic_replan',
  'target_bmi_20',
  'underweight_bmi',
  'underweight_decline',
  'personal_target_set',
  'personal_target_takeover',
  'journal_switch',
  'journal_proposal_declined',
  'journal_log_more',
  'journal_weigh_daily',
  'journal_measured_offer',
  'journal_measured_enter',
  'journal_measured_update',
  'journal_offer_declined',
  'journal_measured_exit',
];

/** One entry of the persistent trace (pass 5a). `message`: the text shown, null when nothing is shown. */
export type PlanEvent = {
  id: string;
  /** Local day of the event. */
  date: string;
  rule: PlanEventRule;
  /** 'failed': the rule applied but the rebuild failed, the plan stayed (reason given). */
  status: 'applied' | 'failed';
  reason?: string;
  before: PlanSummary | null;
  after: PlanSummary | null;
  message: string | null;
  /** The user closed the message (always true when there is none). */
  seen: boolean;
  /**
   * Rules 'personal_target_set' and 'personal_target_takeover' (schema 10): the personal target and the rate it gives
   * (estimated at the start; read on the new estimate at the takeover), and the case the takeover retained.
   */
  personalTarget?: PersonalTarget & { case?: PersonalTargetCase };
};

// ---------------------------------------------------------------------------
// Journal path (pass 5b, schema 8)
// ---------------------------------------------------------------------------

/**
 * Method in force (pass 5b). 'assumed': "cible supposée tenue", the plan assumes the target is followed (every user until
 * a switch). 'aligned': "cible alignée sur le journal", the target became what the journal says the user eats, then the
 * same method with every target floored at the hard floor x 1.10. 'measured': "journal lu, habitude mesurée", the plan is
 * built from the journal and the weigh-ins, displayed target = intake to aim at / habit h.
 */
export type JournalMethod = 'assumed' | 'aligned' | 'measured';
export const JOURNAL_METHODS: readonly JournalMethod[] = ['assumed', 'aligned', 'measured'];

/** Journal estimate of the measured habit: posterior median offset and intervals (relative to NASEM), kcal/day. */
export type JournalEstimate = { offsetKcal: number; interval80: Interval; interval95: Interval };

/** Habit h: logged total / total of the displayed targets, bounded; raw ratio, bound applied, days of its window. */
export type HabitSummary = { h: number; raw: number; bound: 'low' | 'high' | null; days: number };

/** Aligned target of the switch: median of the logged days, rounded, final (raised to the floor x 1.10 when needed). */
export type AlignedTarget = { medianKcal: number; roundedKcal: number; finalKcal: number; floorKcal: number; raised: boolean };

/** Last evaluation of the gate of the measured habit (weekly). `missing`: criteria not met. */
export type JournalGateSummary = { date: string; met: boolean; missing: string[]; missedWeighIns: number; unusableDays: number };

/** A plan of the measured habit awaiting the user's confirmation ('first': entry into the habit; 'update': a later one). */
export type MeasuredOffer = {
  kind: 'first' | 'update';
  date: string;
  plan: CurrentPlan;
  estimate: JournalEstimate;
  habit: HabitSummary;
  /** Maintenance of the journal M (logged units) and the width of its 80 percent interval, kcal/day. */
  maintenanceKcal: number;
  interval80Width: number;
  /** Intake to aim at I*, logged units (the displayed target is I* / h). */
  intakeKcal: number;
};

export type JournalPathState = {
  method: JournalMethod;
  /** Day of the switch to the aligned target (kept through the measured habit and back). */
  switchedOn: string | null;
  alignedTarget: AlignedTarget | null;
  /** The plan in force is still the aligned target itself (no periodic replan, guardrail G1 only). */
  chosenTargetActive: boolean;
  /** An automatic proposal is open since this day, until the user answers it. */
  proposalOpenedOn: string | null;
  proposalDeclinedOn: string | null;
  firstPlanDeclinedOn: string | null;
  /** Day the first plan of the measured habit was confirmed (current stay in the habit). */
  measuredSince: string | null;
  /** Last weekly evaluation of the journal path. */
  lastEvaluatedOn: string | null;
  /** Last journal estimate applied and h of the plan in force (measured habit): base of the periodic replan and guardrails. */
  estimate: JournalEstimate | null;
  habit: HabitSummary | null;
  /** Surfacing reference of the measured habit: maintenance / h and 80 percent width / h of the last plan offered. */
  surfacingReference: { tdeeKcal: number; interval80Width: number; surfacedOn: string } | null;
  offer: MeasuredOffer | null;
  gate: JournalGateSummary | null;
  /** Last return to the aligned target and its reason. */
  lastExit: { date: string; reason: 'weighins' | 'logging' } | null;
};

export function defaultJournalPath(): JournalPathState {
  return {
    method: 'assumed',
    switchedOn: null,
    alignedTarget: null,
    chosenTargetActive: false,
    proposalOpenedOn: null,
    proposalDeclinedOn: null,
    firstPlanDeclinedOn: null,
    measuredSince: null,
    lastEvaluatedOn: null,
    estimate: null,
    habit: null,
    surfacingReference: null,
    offer: null,
    gate: null,
    lastExit: null,
  };
}

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
  /** Persistent trace of the automatic plan changes and safety messages (pass 5a), oldest first. */
  planEvents: PlanEvent[];
  /** Last day the periodic replan was evaluated (done, failed or without calibration): the next one is 28 days later. */
  periodicReplanCheckedOn: string | null;
  /** Day the BMI-20 guardrail imposed the maintenance in force; null once the user chooses a goal again. */
  guardrailMaintenanceSince: string | null;
  /** Journal path of the user (pass 5b, schema 8). */
  journalPath: JournalPathState;
};

export type WheightyStore = {
  schemaVersion: number;
  scientificModelVersion: string;
  profile: UserProfile | null;
  plan: CurrentPlan | null;
  weights: StoredWeight[];
  dailyLogs: StoredDailyLog[];
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
  return { journalVersion: 1, startedOn: null, entries: [], portions: [], library: [] };
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
  planEvents: [],
  periodicReplanCheckedOn: null,
  guardrailMaintenanceSince: null,
  journalPath: defaultJournalPath(),
};
