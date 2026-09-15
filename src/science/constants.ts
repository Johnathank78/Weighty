/**
 * Wheighty scientific and product constants.
 *
 * Every non-trivial number used by the scientific engine lives here and is
 * registered in CONSTANT_METADATA with one of the categories required by
 * instruct/07_DATA_CONTRACT_AND_DEV_RULES.md section 7.
 *
 * Changing any engineering_prior, product_safety_rule or
 * statistical_robustness_parameter requires a SCIENTIFIC_MODEL_VERSION bump.
 */

export const SCIENTIFIC_MODEL_VERSION = '1.3.0';

export type ConstantCategory =
  | 'published_constant'
  | 'published_range_midpoint'
  | 'product_safety_rule'
  | 'engineering_prior'
  | 'statistical_robustness_parameter'
  | 'ui_rounding_rule';

export type ConstantMetadata = {
  readonly category: ConstantCategory;
  readonly source: string;
};

// ---------------------------------------------------------------------------
// Domain and input sanity bounds (07 section 8, 00 product target)
// ---------------------------------------------------------------------------
export const AGE_MIN_YEARS = 19; // product_safety_rule
export const AGE_MAX_YEARS = 65; // product_safety_rule
export const HEIGHT_MIN_CM = 130; // product_safety_rule
export const HEIGHT_MAX_CM = 220; // product_safety_rule
export const WEIGHT_MIN_KG = 35; // product_safety_rule
export const WEIGHT_MAX_KG = 300; // product_safety_rule
export const BODY_FAT_MIN_PERCENT = 3; // product_safety_rule
export const BODY_FAT_MAX_PERCENT = 65; // product_safety_rule
export const STEPS_MIN_PER_DAY = 0; // product_safety_rule
export const STEPS_MAX_PER_DAY = 50000; // product_safety_rule
export const TRAINING_MAX_MIN_PER_WEEK = 1800; // product_safety_rule
export const MEASURED_RMR_MIN_KCAL = 700; // product_safety_rule
export const MEASURED_RMR_MAX_KCAL = 4500; // product_safety_rule
/** BMI plausibility bounds for the dynamic model (Jackson body-fat equation turns negative below ~15 in young men). */
export const BMI_SANITY_MIN = 16; // product_safety_rule
export const BMI_SANITY_MAX = 70; // product_safety_rule
export const SESSIONS_MAX_PER_WEEK = 21; // product_safety_rule
export const SESSION_DURATION_MAX_MIN = 360; // product_safety_rule

// ---------------------------------------------------------------------------
// REE router (01)
// ---------------------------------------------------------------------------
export const MIFFLIN_WEIGHT_COEF = 10; // published_constant
export const MIFFLIN_HEIGHT_COEF = 6.25; // published_constant
export const MIFFLIN_AGE_COEF = 5; // published_constant
export const MIFFLIN_MALE_INTERCEPT = 5; // published_constant
export const MIFFLIN_FEMALE_INTERCEPT = -161; // published_constant

export const TEN_HAAF_WEIGHT_COEF = 11.936; // published_constant
export const TEN_HAAF_HEIGHT_M_COEF = 587.728; // published_constant
export const TEN_HAAF_AGE_COEF = 8.129; // published_constant
export const TEN_HAAF_MALE_COEF = 191.027; // published_constant
export const TEN_HAAF_INTERCEPT = 29.279; // published_constant

export const TEN_HAAF_FFM_COEF = 22.771; // published_constant
export const TEN_HAAF_FFM_INTERCEPT = 484.264; // published_constant
export const CUNNINGHAM_FFM_COEF = 22; // published_constant
export const CUNNINGHAM_INTERCEPT = 500; // published_constant

export const MEASURED_RMR_MAX_AGE_MONTHS = 12; // engineering_prior
export const MEASURED_RMR_MAX_WEIGHT_CHANGE_FRACTION = 0.05; // engineering_prior

export const ATHLETE_AGE_MIN_YEARS = 19; // engineering_prior
export const ATHLETE_AGE_MAX_YEARS = 35; // engineering_prior
export const ATHLETE_MIN_TRAINING_HOURS_WEEK = 6; // engineering_prior
export const ATHLETE_MIN_SESSIONS_WEEK = 4; // engineering_prior

export const BODY_FAT_QUALITY_FOUR_COMPARTMENT = 1.0; // engineering_prior
export const BODY_FAT_QUALITY_ADP = 0.9; // engineering_prior
export const BODY_FAT_QUALITY_DXA = 0.85; // engineering_prior
export const BODY_FAT_QUALITY_SKINFOLD = 0.6; // engineering_prior
export const BODY_FAT_QUALITY_CONSUMER_BIA = 0.3; // engineering_prior
export const BODY_FAT_QUALITY_SELF_ESTIMATE = 0.1; // engineering_prior

export const REE_DISAGREEMENT_THRESHOLD = 0.1; // engineering_prior

// ---------------------------------------------------------------------------
// NASEM 2023 EER (01 section 7)
// ---------------------------------------------------------------------------
export const NASEM_MALE = {
  inactive: { intercept: 753.07, age: -10.83, heightCm: 6.5, weightKg: 14.1 },
  low_active: { intercept: 581.47, age: -10.83, heightCm: 8.3, weightKg: 14.94 },
  active: { intercept: 1004.82, age: -10.83, heightCm: 6.52, weightKg: 15.91 },
  very_active: { intercept: -517.88, age: -10.83, heightCm: 15.61, weightKg: 19.11 },
} as const; // published_constant

export const NASEM_FEMALE = {
  inactive: { intercept: 584.9, age: -7.01, heightCm: 5.72, weightKg: 11.71 },
  low_active: { intercept: 575.77, age: -7.01, heightCm: 6.6, weightKg: 12.14 },
  active: { intercept: 710.25, age: -7.01, heightCm: 6.54, weightKg: 12.34 },
  very_active: { intercept: 511.83, age: -7.01, heightCm: 9.07, weightKg: 12.56 },
} as const; // published_constant

export const PAL_LOW_ACTIVE_MIN = 1.53; // published_constant
export const PAL_ACTIVE_MIN = 1.68; // published_constant
export const PAL_VERY_ACTIVE_MIN = 1.85; // published_constant
export const PAL_OUTLIER_MIN = 2.5; // published_constant

export const NASEM_SEPV_FEMALE_KCAL = 241; // published_constant
export const NASEM_SEPV_MALE_KCAL = 342; // published_constant

// ---------------------------------------------------------------------------
// Activity, steps, NEAT (02)
// ---------------------------------------------------------------------------
export const MET_REST_O2_ML_KG_MIN_ADULT = 3.5; // published_constant
export const MET_REST_O2_ML_KG_MIN_OLDER_ADULT = 2.7; // published_constant
/** kcal/min = MET * O2(ml/kg/min) * kg / 200 (standard conversion). */
export const MET_KCAL_DIVISOR = 200; // published_constant
export const OLDER_ADULT_COMPENDIUM_MIN_AGE = 60; // published_constant

export const PAL_ADL_PRIOR_FRACTION = 0.2; // engineering_prior
export const PAL_CLASSIFIER_REFERENCE_TEF_FRACTION = 0.1; // engineering_prior
export const PAL_BOUNDARY_DISTANCE = 0.05; // engineering_prior
export const PAL_BOUNDARY_SIGMA_MULTIPLIER = 1.15; // engineering_prior
export const PHYSICAL_JOB_SIGMA_MULTIPLIER = 1.15; // engineering_prior
export const REE_DISAGREEMENT_SIGMA_MULTIPLIER = 1.15; // engineering_prior
/** Sigma multiplier when a step-dominant activity has no specific cadence (02 section 5 "widen uncertainty"). */
export const DEFAULT_CADENCE_SIGMA_MULTIPLIER = 1.15; // engineering_prior
/** Typical recreational running cadence used for step/exercise overlap. */
export const RUNNING_CADENCE_STEPS_PER_MIN = 160; // engineering_prior

export const POSTURE_KCAL_SEATED = 0; // engineering_prior
export const POSTURE_KCAL_MIXED = 18; // engineering_prior
export const POSTURE_KCAL_STANDING = 54; // engineering_prior
export const POSTURE_KCAL_PHYSICAL = 54; // engineering_prior

export const MINUTES_PER_HOUR = 60; // published_constant
export const DAYS_PER_WEEK = 7; // published_constant

// ---------------------------------------------------------------------------
// TEF (02 section 9)
// ---------------------------------------------------------------------------
export const KCAL_PER_G_PROTEIN = 4; // published_constant
export const KCAL_PER_G_CARB = 4; // published_constant
export const KCAL_PER_G_FAT = 9; // published_constant
export const TEF_PROTEIN = 0.25; // published_range_midpoint
export const TEF_CARB = 0.075; // published_range_midpoint
export const TEF_FAT = 0.025; // published_constant (inside 0-3 percent)
/** Reference TEF share of a free-living TEE (decomposition and PAL classifier only; the Hall model uses HALL_BETA_TEF). */
export const REFERENCE_TEF_FRACTION = 0.1; // engineering_prior

// ---------------------------------------------------------------------------
// Macros (03)
// ---------------------------------------------------------------------------
export const NUTRITION_REFERENCE_BMI = 25; // engineering_prior
/**
 * Share of the weight above the BMI 25 weight kept in the nutrition reference weight
 * (continuous rule, IMPLEMENTATION_NOTES D-21). Normalisation factor, not an "ideal weight".
 */
export const NUTRITION_REFERENCE_EXCESS_FRACTION = 0.33; // engineering_prior
export const PROTEIN_G_PER_KG_BASE = 1.2; // published_range_midpoint
export const PROTEIN_G_PER_KG_TRAINED = 1.6; // published_range_midpoint
export const PROTEIN_G_PER_KG_LOSS = 1.6; // published_range_midpoint
export const PROTEIN_G_PER_KG_LOSS_RESISTANCE = 1.8; // published_range_midpoint
export const PROTEIN_G_PER_KG_FFM_ATHLETE_LOSS = 2.3; // published_range_midpoint
export const PROTEIN_MAX_G_PER_KG_ACTUAL = 2.2; // product_safety_rule
export const FAT_FRACTION_DEFAULT = 0.3; // engineering_prior
export const FAT_FRACTION_ENDURANCE = 0.25; // engineering_prior
export const FAT_FLOOR_G_PER_KG_REFERENCE = 0.6; // engineering_prior
export const FAT_AMDR_MIN_FRACTION = 0.2; // published_constant
export const LOW_CARB_ENDURANCE_G_PER_KG = 3.0; // published_range_midpoint
export const LOW_CARB_RESISTANCE_G_PER_KG = 2.0; // engineering_prior
export const RESISTANCE_MIN_SESSIONS_WEEK = 2; // engineering_prior
export const RESISTANCE_MIN_MINUTES_WEEK = 60; // engineering_prior
export const ENDURANCE_MIN_MINUTES_WEEK = 150; // engineering_prior
export const MACRO_ENERGY_TOLERANCE_KCAL = 5; // ui_rounding_rule
export const FFM_PLAUSIBLE_MIN_FRACTION = 0.35; // product_safety_rule
export const FFM_PLAUSIBLE_MAX_FRACTION = 0.97; // product_safety_rule

// ---------------------------------------------------------------------------
// Goals, guardrails, slider (04)
// ---------------------------------------------------------------------------
// Weekly rates are fractions of current body weight per week (continuous speed slider, D-22).
export const LOSS_RATE_MIN = 0.002; // engineering_prior
export const LOSS_RATE_DEFAULT = 0.005; // engineering_prior
/** Qualitative zone boundaries of the loss slider: Douce < 0.375 % <= Modérée < 0.625 % <= Rapide. */
export const LOSS_RATE_GENTLE_ZONE_MAX = 0.00375; // ui_rounding_rule
export const LOSS_RATE_MODERATE_ZONE_MAX = 0.00625; // ui_rounding_rule
export const LOSS_RATE_HARD_MAX = 0.01; // product_safety_rule
export const GAIN_RATE_MIN = 0.001; // engineering_prior
export const GAIN_RATE_DEFAULT = 0.0025; // engineering_prior
/** Qualitative zone boundaries of the gain slider: Douce < 0.175 % <= Modérée < 0.325 % <= Rapide. */
export const GAIN_RATE_GENTLE_ZONE_MAX = 0.00175; // ui_rounding_rule
export const GAIN_RATE_MODERATE_ZONE_MAX = 0.00325; // ui_rounding_rule
export const GAIN_RATE_HARD_MAX = 0.005; // product_safety_rule
/** Slider resolution: 0.05 percent of body weight per week. */
export const WEEKLY_RATE_STEP = 0.0005; // ui_rounding_rule

export const TARGET_BMI_MIN = 18.5; // product_safety_rule
export const LOSS_UNAVAILABLE_BMI_BELOW = 20; // product_safety_rule
export const LOSS_GENTLE_ONLY_BMI_BELOW = 22; // product_safety_rule
export const LOSS_MODERATE_MAX_BMI_BELOW = 25; // product_safety_rule
/** Maximum loss rate for 20 <= BMI < 22. */
export const LOSS_RATE_MAX_BMI_UNDER_22 = 0.0025; // product_safety_rule
/** Maximum loss rate for 22 <= BMI < 25. */
export const LOSS_RATE_MAX_BMI_UNDER_25 = 0.005; // product_safety_rule
/** Former "max selectable default" for BMI >= 25: faster loss rates stay selectable up to the hard max but show a caution note. */
export const LOSS_RATE_CAUTION_ABOVE = 0.0075; // product_safety_rule

/** Absolute calorie floor by sex, without medical supervision (NIDDK). Always combined with 0.7 x REE. */
export const ABSOLUTE_MIN_CALORIES_FEMALE = 1200; // product_safety_rule
export const ABSOLUTE_MIN_CALORIES_MALE = 1500; // product_safety_rule
export const RELATIVE_MIN_CALORIES_REE_FRACTION = 0.7; // product_safety_rule

export const ENERGY_AVAILABILITY_CAUTION_KCAL_PER_KG_FFM = 30; // product_safety_rule

export const MAINTENANCE_ZONE_FRACTION = 0.0075; // engineering_prior
export const MAINTENANCE_ZONE_MIN_KG = 0.5; // engineering_prior
export const MAINTENANCE_ZONE_MAX_KG = 1.0; // engineering_prior

export const GOAL_SOLVER_HORIZON_DAYS = 42; // engineering_prior
export const GOAL_SOLVER_MAX_ITERATIONS = 60; // engineering_prior
export const GOAL_SOLVER_CALORIE_TOLERANCE_KCAL = 1; // engineering_prior
export const GOAL_SOLVER_WEIGHT_TOLERANCE_KG = 0.01; // engineering_prior
export const GOAL_SOLVER_MIN_INTAKE_KCAL = 400; // engineering_prior (search bracket only, never a recommendation)
export const GOAL_SOLVER_MAX_INTAKE_KCAL = 9000; // engineering_prior (search bracket only)

export const PROJECTION_MAX_DAYS = 730; // engineering_prior
export const PROJECTION_SAMPLE_EVERY_DAYS = 7; // ui_rounding_rule

export const SLIDER_MIN_STEPS_FLOOR = 2000; // engineering_prior
export const SLIDER_MIN_STEPS_BELOW_BASELINE = 6000; // engineering_prior
export const SLIDER_MAX_STEPS_CEILING = 20000; // engineering_prior
export const SLIDER_MAX_STEPS_ABOVE_BASELINE = 10000; // engineering_prior
export const SLIDER_HARD_MAX_STEPS = 30000; // product_safety_rule
export const SLIDER_RECOMMENDED_HALF_WIDTH_STEPS = 3000; // engineering_prior

export const GAIN_RESISTANCE_CONTEXT_MIN_SESSIONS = 2; // engineering_prior

// ---------------------------------------------------------------------------
// Hall adult dynamic model (Hall 2011 Lancet; Chow & Hall 2008; Hall 2010)
// kJ values converted with 0.23900573614 kcal/kJ as in the published model.
// ---------------------------------------------------------------------------
export const HALL_RHO_G_KCAL_PER_KG = 4206.501; // published_constant (17.6 MJ/kg)
export const HALL_RHO_F_KCAL_PER_KG = 9440.727; // published_constant (39.5 MJ/kg)
export const HALL_RHO_L_KCAL_PER_KG = 1816.444; // published_constant (7.6 MJ/kg)
export const HALL_GAMMA_F_KCAL_PER_KG_DAY = 3.107075; // published_constant (13 kJ/kg/d)
export const HALL_GAMMA_L_KCAL_PER_KG_DAY = 21.98853; // published_constant (92 kJ/kg/d)
export const HALL_ETA_F_KCAL_PER_KG = 179.2543; // published_constant (750 kJ/kg)
export const HALL_ETA_L_KCAL_PER_KG = 229.4455; // published_constant (960 kJ/kg)
export const HALL_BETA_TEF = 0.1; // published_constant
export const HALL_BETA_AT = 0.14; // published_constant
export const HALL_TAU_AT_DAYS = 14; // published_constant
export const HALL_FORBES_C_KG = 10.4; // published_constant
export const HALL_GLYCOGEN_BASELINE_KG = 0.5; // published_constant
export const HALL_GLYCOGEN_WATER_MULTIPLIER = 3.7; // published_constant (glycogen + 2.7 g water per g)
export const HALL_SODIUM_MG_PER_L = 3220; // published_constant
export const HALL_ZETA_NA_MG_PER_L_DAY = 3000; // published_constant
export const HALL_ZETA_CI_MG_PER_DAY = 4000; // published_constant
/** Fallback only: the Hall baseline diet uses the maintenance plan composition (D-16). */
export const HALL_BASELINE_CARB_FRACTION = 0.5; // engineering_prior (Hall / bw default baseline diet)
/** Numerical safety floor for the Jackson initial fat estimate at very low BMI. */
export const HALL_MIN_INITIAL_FAT_FRACTION = 0.02; // engineering_prior
export const HALL_DT_DAYS = 1; // engineering_prior
/**
 * Admissible domain of the Hall initialisation (concept B, IMPLEMENTATION_NOTES D-28): the baseline intake must be
 * strictly greater than this value. Numerical admissibility only (B1): a baseline intake <= 0 gives a non-positive
 * glycogen constant kG, which used to freeze the integration silently. Not a physiological threshold.
 */
export const HALL_MIN_BASELINE_INTAKE_KCAL = 1; // engineering_prior
/**
 * Numerical safety: largest glycogen stiffness * step accepted by RK4 before the day is split in sub-steps
 * (classical RK4 is unstable beyond about 2.785 on the negative real axis). Numerical only, not physiology.
 */
export const HALL_RK4_STIFFNESS_LIMIT = 2; // engineering_prior

// Jackson et al. 2002 body-fat-from-BMI equation used by Hall for initial fat mass.
export const JACKSON_AGE_COEF = 0.14; // published_constant
export const JACKSON_MALE_LN_BMI_COEF = 37.31; // published_constant
export const JACKSON_MALE_INTERCEPT = -103.94; // published_constant
export const JACKSON_FEMALE_LN_BMI_COEF = 39.96; // published_constant
export const JACKSON_FEMALE_INTERCEPT = -102.01; // published_constant

// Silva et al. extracellular fluid equation used by Hall (height in m).
export const SILVA_MALE_AGE_COEF = 0.025; // published_constant
export const SILVA_MALE_HEIGHT_COEF = 9.57; // published_constant
export const SILVA_MALE_WEIGHT_COEF = 0.191; // published_constant
export const SILVA_MALE_INTERCEPT = -12.4; // published_constant
export const SILVA_FEMALE_HEIGHT_COEF = 5.98; // published_constant
export const SILVA_FEMALE_WEIGHT_COEF = 0.167; // published_constant
export const SILVA_FEMALE_INTERCEPT = -4.0; // published_constant

/** Body fat methods whose FFM may initialise the Hall model instead of the Jackson estimate. */
export const HALL_BODY_FAT_MIN_QUALITY = 0.85; // engineering_prior

// ---------------------------------------------------------------------------
// Calibration and uncertainty (05)
// ---------------------------------------------------------------------------
export const Z_80 = 1.2815515655; // published_constant
export const Z_95 = 1.96; // published_constant

export const ADHERENCE_WEIGHT_ON_PLAN = 1.0; // statistical_robustness_parameter
export const ADHERENCE_WEIGHT_MINOR = 0.35; // statistical_robustness_parameter
export const ADHERENCE_WEIGHT_MAJOR = 0.0; // statistical_robustness_parameter
export const ADHERENCE_WEIGHT_UNKNOWN = 0.5; // statistical_robustness_parameter
export const MISSING_STEPS_WEIGHT_FACTOR = 0.7; // statistical_robustness_parameter

export const GATE_MIN_WEIGHINS = 5; // engineering_prior
export const GATE_MIN_SPAN_DAYS = 14; // engineering_prior
export const GATE_MIN_CLEAN_WEIGHINS = 4; // engineering_prior
export const GATE_MIN_ADHERENCE_COVERAGE = 0.5; // engineering_prior
/** A weigh-in window is "dominated" by major deviations when more than this share of its days are major. */
export const GATE_MAJOR_DOMINATION_FRACTION = 0.5; // engineering_prior

/**
 * Numerical support of the offset posterior (concept A, IMPLEMENTATION_NOTES D-28), shared by the warm start and the
 * weigh-in calibration. Support only: neither the Hall admissible domain (HALL_MIN_BASELINE_INTAKE_KCAL) nor the
 * warm-start coherence rule (WARM_START_INCOHERENT_OFFSET_BOUND) may read these values.
 */
export const CALIBRATION_GRID_MIN_KCAL = -1200; // statistical_robustness_parameter
export const CALIBRATION_GRID_MAX_KCAL = 1200; // statistical_robustness_parameter
export const CALIBRATION_GRID_STEP_KCAL = 5; // statistical_robustness_parameter
export const CALIBRATION_T_DF = 4; // statistical_robustness_parameter
export const CALIBRATION_T_SCALE_KG = 0.6; // statistical_robustness_parameter
/**
 * Structural uncertainty floor of the weigh-in calibration (IMPLEMENTATION_NOTES D-33): SD of the model error convolved
 * into the offset posterior, so the interval cannot shrink below what the model itself can know.
 */
export const CALIBRATION_STRUCTURAL_SD_KCAL = 50; // statistical_robustness_parameter
/** Grid over the unknown true starting weight, marginalised under a flat prior (see IMPLEMENTATION_NOTES). */
export const CALIBRATION_INTERCEPT_HALF_RANGE_KG = 3; // statistical_robustness_parameter
export const CALIBRATION_INTERCEPT_STEP_KG = 0.05; // statistical_robustness_parameter

export const CONFIDENCE_MEDIUM_MIN_WIDTH_KCAL = 500; // engineering_prior
export const CONFIDENCE_GOOD_MIN_WIDTH_KCAL = 300; // engineering_prior
export const CONFIDENCE_HIGH_MIN_SPAN_DAYS = 28; // engineering_prior
export const CONFIDENCE_HIGH_MIN_WEIGHINS = 8; // engineering_prior
export const CONFIDENCE_HIGH_MAX_MAJOR_FRACTION = 0.25; // engineering_prior

export const RECAL_SURFACE_MIN_CHANGE_KCAL = 75; // engineering_prior
export const RECAL_SURFACE_MIN_WIDTH_SHRINK = 0.1; // engineering_prior
export const RECAL_SURFACE_MIN_DAYS = 7; // engineering_prior
export const RECAL_SURFACE_MIN_CHANGE_AFTER_DAYS_KCAL = 40; // engineering_prior
/** Minimum days between two surfaced recalibrations, whatever the criteria (D-34). */
export const RECAL_SURFACE_MIN_INTERVAL_DAYS = 7; // engineering_prior

// ---------------------------------------------------------------------------
// Warm start from historical intake evidence (IMPLEMENTATION_NOTES D-23)
// ---------------------------------------------------------------------------
/** Below this duration the history is stored but not used (the population prior is kept). */
export const WARM_START_MIN_DAYS = 7; // engineering_prior
export const WARM_START_MAX_DAYS = 365; // product_safety_rule
export const WARM_START_MIN_INTAKE_KCAL = 800; // product_safety_rule
export const WARM_START_MAX_INTAKE_KCAL = 6000; // product_safety_rule
/** Relative SD of the declared average intake, by tracking quality (random plus systematic reporting error). */
export const WARM_START_INTAKE_REL_SD_HIGH = 0.1; // engineering_prior
export const WARM_START_INTAKE_REL_SD_MEDIUM = 0.2; // engineering_prior
export const WARM_START_INTAKE_REL_SD_LOW = 0.3; // engineering_prior
/** Extra SD when activity during the history period was not comparable to the current routine. */
export const WARM_START_ACTIVITY_CHANGE_SD_KCAL = 200; // engineering_prior
/** Structural SD floor: model mismatch and non-constant personal offset during the history period. */
export const WARM_START_MODEL_SD_KCAL = 100; // engineering_prior
/**
 * Coherence rule of the warm start (concept C, IMPLEMENTATION_NOTES D-28, D-29): the history is flagged incoherent when
 * the exact root of predicted(offset) = observed lies outside [-bound, +bound] kcal/day. Display and diagnostic signal
 * only, without any numerical effect since model 1.2.0. Value inherited from the numerical support of the offset grid,
 * without a physiological justification of its own: to be sourced. Kept separate from the grid support.
 */
export const WARM_START_INCOHERENT_OFFSET_BOUND = 1200; // product_safety_rule
/**
 * Half-width of the dedicated evidence support of the historical likelihood (D-29), kcal/day, same step as the
 * calibration grid and bounded below by the Hall admissible domain. Numerical support only: the fused posterior and
 * the calibration handoff stay on the calibration grid, so this value has no effect on the plan.
 */
export const WARM_START_EVIDENCE_SUPPORT_HALF_WIDTH_KCAL = 3000; // statistical_robustness_parameter
/** Standardised distance between history-only estimate and population prior that is reported as a conflict. */
export const WARM_START_CONFLICT_Z = 2; // engineering_prior
/** Warm start reaches "medium" confidence when the 80 percent width is at most this share of the prior width. */
export const WARM_START_MEDIUM_MAX_WIDTH_RATIO = 0.75; // engineering_prior

export const TREND_HALF_LIFE_DAYS = 7; // engineering_prior
export const TREND_RATE_WINDOW_DAYS = 7; // ui_rounding_rule
export const TREND_MIN_WEIGHINS = 3; // ui_rounding_rule
/** In-app weigh-in due state (07 s12), no OS notification. */
export const WEIGH_IN_REMINDER_INTERVAL_DAYS = 3; // engineering_prior

// ---------------------------------------------------------------------------
// Display precision (00, 07 section 9)
// ---------------------------------------------------------------------------
export const DISPLAY_KCAL_ROUNDING = 10; // ui_rounding_rule
export const DISPLAY_STEPS_ROUNDING = 100; // ui_rounding_rule
export const DISPLAY_WEIGHT_DECIMALS = 1; // ui_rounding_rule
/** "Pourquoi ce résultat ?" digest: interval bounds rounded to 50 kcal so a bound near 1 200 is not read as the safety floor. */
export const EXPLANATION_RANGE_ROUNDING_KCAL = 50; // ui_rounding_rule
/** Scale variation used as an example in the digest ("0,5 kg d'écart représente environ X kcal par jour"). Display only. */
export const EXPLANATION_SCALE_VARIATION_EXAMPLE_KG = 0.5; // ui_rounding_rule
/** Tolerance of the stored-plan integrity check on the warm-start offset (diagnostic display only, D-30). */
export const STORED_PLAN_OFFSET_MATCH_TOLERANCE_KCAL = 10; // ui_rounding_rule

// ---------------------------------------------------------------------------
// Metadata registry (every exported numeric constant must be listed)
// ---------------------------------------------------------------------------
const m = (category: ConstantCategory, source: string): ConstantMetadata => ({ category, source });

export const CONSTANT_METADATA: Readonly<Record<string, ConstantMetadata>> = {
  AGE_MIN_YEARS: m('product_safety_rule', '00 product target'),
  AGE_MAX_YEARS: m('product_safety_rule', '00 product target'),
  HEIGHT_MIN_CM: m('product_safety_rule', '07 s8'),
  HEIGHT_MAX_CM: m('product_safety_rule', '07 s8'),
  WEIGHT_MIN_KG: m('product_safety_rule', '07 s8'),
  WEIGHT_MAX_KG: m('product_safety_rule', '07 s8'),
  BODY_FAT_MIN_PERCENT: m('product_safety_rule', '07 s8'),
  BODY_FAT_MAX_PERCENT: m('product_safety_rule', '07 s8'),
  STEPS_MIN_PER_DAY: m('product_safety_rule', '07 s8'),
  STEPS_MAX_PER_DAY: m('product_safety_rule', '07 s8'),
  TRAINING_MAX_MIN_PER_WEEK: m('product_safety_rule', '07 s8'),
  MEASURED_RMR_MIN_KCAL: m('product_safety_rule', '01 s3 / 07 s8'),
  MEASURED_RMR_MAX_KCAL: m('product_safety_rule', '01 s3 / 07 s8'),
  BMI_SANITY_MIN: m('product_safety_rule', 'IMPLEMENTATION_NOTES D-07'),
  BMI_SANITY_MAX: m('product_safety_rule', 'IMPLEMENTATION_NOTES D-07'),
  SESSIONS_MAX_PER_WEEK: m('product_safety_rule', 'IMPLEMENTATION_NOTES D-07'),
  SESSION_DURATION_MAX_MIN: m('product_safety_rule', 'IMPLEMENTATION_NOTES D-07'),
  MIFFLIN_WEIGHT_COEF: m('published_constant', 'Mifflin 1990 PMID 2305711'),
  MIFFLIN_HEIGHT_COEF: m('published_constant', 'Mifflin 1990 PMID 2305711'),
  MIFFLIN_AGE_COEF: m('published_constant', 'Mifflin 1990 PMID 2305711'),
  MIFFLIN_MALE_INTERCEPT: m('published_constant', 'Mifflin 1990 PMID 2305711'),
  MIFFLIN_FEMALE_INTERCEPT: m('published_constant', 'Mifflin 1990 PMID 2305711'),
  TEN_HAAF_WEIGHT_COEF: m('published_constant', 'ten Haaf 2014 PMID 25275434'),
  TEN_HAAF_HEIGHT_M_COEF: m('published_constant', 'ten Haaf 2014 PMID 25275434'),
  TEN_HAAF_AGE_COEF: m('published_constant', 'ten Haaf 2014 PMID 25275434'),
  TEN_HAAF_MALE_COEF: m('published_constant', 'ten Haaf 2014 PMID 25275434'),
  TEN_HAAF_INTERCEPT: m('published_constant', 'ten Haaf 2014 PMID 25275434'),
  TEN_HAAF_FFM_COEF: m('published_constant', 'ten Haaf 2014 PMID 25275434'),
  TEN_HAAF_FFM_INTERCEPT: m('published_constant', 'ten Haaf 2014 PMID 25275434'),
  CUNNINGHAM_FFM_COEF: m('published_constant', 'Cunningham 1980'),
  CUNNINGHAM_INTERCEPT: m('published_constant', 'Cunningham 1980'),
  MEASURED_RMR_MAX_AGE_MONTHS: m('engineering_prior', '01 s3 route A'),
  MEASURED_RMR_MAX_WEIGHT_CHANGE_FRACTION: m('engineering_prior', '01 s3 route A'),
  ATHLETE_AGE_MIN_YEARS: m('engineering_prior', '01 s3 route B'),
  ATHLETE_AGE_MAX_YEARS: m('engineering_prior', '01 s3 route B'),
  ATHLETE_MIN_TRAINING_HOURS_WEEK: m('engineering_prior', '01 s3 route B'),
  ATHLETE_MIN_SESSIONS_WEEK: m('engineering_prior', '01 s3 route B'),
  BODY_FAT_QUALITY_FOUR_COMPARTMENT: m('engineering_prior', '01 s5'),
  BODY_FAT_QUALITY_ADP: m('engineering_prior', '01 s5'),
  BODY_FAT_QUALITY_DXA: m('engineering_prior', '01 s5'),
  BODY_FAT_QUALITY_SKINFOLD: m('engineering_prior', '01 s5'),
  BODY_FAT_QUALITY_CONSUMER_BIA: m('engineering_prior', '01 s5'),
  BODY_FAT_QUALITY_SELF_ESTIMATE: m('engineering_prior', '01 s5'),
  REE_DISAGREEMENT_THRESHOLD: m('engineering_prior', '01 s6'),
  PAL_LOW_ACTIVE_MIN: m('published_constant', 'NASEM 2023'),
  PAL_ACTIVE_MIN: m('published_constant', 'NASEM 2023'),
  PAL_VERY_ACTIVE_MIN: m('published_constant', 'NASEM 2023'),
  PAL_OUTLIER_MIN: m('published_constant', 'NASEM 2023'),
  NASEM_SEPV_FEMALE_KCAL: m('published_constant', 'NASEM 2023 SEPV'),
  NASEM_SEPV_MALE_KCAL: m('published_constant', 'NASEM 2023 SEPV'),
  MET_REST_O2_ML_KG_MIN_ADULT: m('published_constant', '2024 Adult Compendium'),
  MET_REST_O2_ML_KG_MIN_OLDER_ADULT: m('published_constant', 'Older Adult Compendium MET60'),
  MET_KCAL_DIVISOR: m('published_constant', 'standard MET conversion'),
  OLDER_ADULT_COMPENDIUM_MIN_AGE: m('published_constant', 'Older Adult Compendium'),
  PAL_ADL_PRIOR_FRACTION: m('engineering_prior', '02 s7'),
  PAL_CLASSIFIER_REFERENCE_TEF_FRACTION: m('engineering_prior', '02 s7'),
  PAL_BOUNDARY_DISTANCE: m('engineering_prior', '02 s7'),
  PAL_BOUNDARY_SIGMA_MULTIPLIER: m('engineering_prior', '02 s7 / 05 s2'),
  PHYSICAL_JOB_SIGMA_MULTIPLIER: m('engineering_prior', '02 s6 / 05 s2'),
  REE_DISAGREEMENT_SIGMA_MULTIPLIER: m('engineering_prior', '05 s2'),
  DEFAULT_CADENCE_SIGMA_MULTIPLIER: m('engineering_prior', 'IMPLEMENTATION_NOTES D-05'),
  RUNNING_CADENCE_STEPS_PER_MIN: m('engineering_prior', 'IMPLEMENTATION_NOTES D-05'),
  POSTURE_KCAL_SEATED: m('engineering_prior', '02 s6'),
  POSTURE_KCAL_MIXED: m('engineering_prior', '02 s6 (Saeidifard 2018)'),
  POSTURE_KCAL_STANDING: m('engineering_prior', '02 s6 (Saeidifard 2018)'),
  POSTURE_KCAL_PHYSICAL: m('engineering_prior', '02 s6'),
  MINUTES_PER_HOUR: m('published_constant', 'unit conversion'),
  DAYS_PER_WEEK: m('published_constant', 'unit conversion'),
  KCAL_PER_G_PROTEIN: m('published_constant', 'Atwater'),
  KCAL_PER_G_CARB: m('published_constant', 'Atwater'),
  KCAL_PER_G_FAT: m('published_constant', 'Atwater'),
  TEF_PROTEIN: m('published_range_midpoint', '02 s9 (20-30 percent)'),
  TEF_CARB: m('published_range_midpoint', '02 s9 (5-10 percent)'),
  TEF_FAT: m('published_constant', '02 s9 (0-3 percent), display and decomposition only'),
  REFERENCE_TEF_FRACTION: m('engineering_prior', '02 s8-s9 decomposition and PAL classifier'),
  NUTRITION_REFERENCE_BMI: m('engineering_prior', '03 s1'),
  NUTRITION_REFERENCE_EXCESS_FRACTION: m('engineering_prior', '03 s1 continuous reference weight, IMPLEMENTATION_NOTES D-21 (not an ideal weight)'),
  PROTEIN_G_PER_KG_BASE: m('published_range_midpoint', '03 s2'),
  PROTEIN_G_PER_KG_TRAINED: m('published_range_midpoint', '03 s2 (ISSN 2017)'),
  PROTEIN_G_PER_KG_LOSS: m('published_range_midpoint', '03 s2'),
  PROTEIN_G_PER_KG_LOSS_RESISTANCE: m('published_range_midpoint', '03 s2'),
  PROTEIN_G_PER_KG_FFM_ATHLETE_LOSS: m('published_range_midpoint', '03 s2 (Helms 2014)'),
  PROTEIN_MAX_G_PER_KG_ACTUAL: m('product_safety_rule', '03 s2'),
  FAT_FRACTION_DEFAULT: m('engineering_prior', '03 s3'),
  FAT_FRACTION_ENDURANCE: m('engineering_prior', '03 s3'),
  FAT_FLOOR_G_PER_KG_REFERENCE: m('engineering_prior', '03 s3'),
  FAT_AMDR_MIN_FRACTION: m('published_constant', 'IOM AMDR'),
  LOW_CARB_ENDURANCE_G_PER_KG: m('published_range_midpoint', '03 s4'),
  LOW_CARB_RESISTANCE_G_PER_KG: m('engineering_prior', '03 s4'),
  RESISTANCE_MIN_SESSIONS_WEEK: m('engineering_prior', '03 s5'),
  RESISTANCE_MIN_MINUTES_WEEK: m('engineering_prior', '03 s5'),
  ENDURANCE_MIN_MINUTES_WEEK: m('engineering_prior', '03 s5'),
  MACRO_ENERGY_TOLERANCE_KCAL: m('ui_rounding_rule', '03 s6'),
  FFM_PLAUSIBLE_MIN_FRACTION: m('product_safety_rule', 'IMPLEMENTATION_NOTES D-08'),
  FFM_PLAUSIBLE_MAX_FRACTION: m('product_safety_rule', 'IMPLEMENTATION_NOTES D-08'),
  LOSS_RATE_MIN: m('engineering_prior', '04 s2 continuous slider'),
  LOSS_RATE_DEFAULT: m('engineering_prior', '04 s2 continuous slider'),
  LOSS_RATE_GENTLE_ZONE_MAX: m('ui_rounding_rule', '04 s2 qualitative zones'),
  LOSS_RATE_MODERATE_ZONE_MAX: m('ui_rounding_rule', '04 s2 qualitative zones'),
  LOSS_RATE_HARD_MAX: m('product_safety_rule', '04 s2'),
  GAIN_RATE_MIN: m('engineering_prior', '04 s2 continuous slider'),
  GAIN_RATE_DEFAULT: m('engineering_prior', '04 s2 continuous slider'),
  GAIN_RATE_GENTLE_ZONE_MAX: m('ui_rounding_rule', '04 s2 qualitative zones'),
  GAIN_RATE_MODERATE_ZONE_MAX: m('ui_rounding_rule', '04 s2 qualitative zones'),
  GAIN_RATE_HARD_MAX: m('product_safety_rule', '04 s2'),
  WEEKLY_RATE_STEP: m('ui_rounding_rule', '04 s2 slider resolution'),
  TARGET_BMI_MIN: m('product_safety_rule', '04 s3'),
  LOSS_UNAVAILABLE_BMI_BELOW: m('product_safety_rule', '04 s3'),
  LOSS_GENTLE_ONLY_BMI_BELOW: m('product_safety_rule', '04 s3'),
  LOSS_MODERATE_MAX_BMI_BELOW: m('product_safety_rule', '04 s3'),
  LOSS_RATE_MAX_BMI_UNDER_22: m('product_safety_rule', '04 s3'),
  LOSS_RATE_MAX_BMI_UNDER_25: m('product_safety_rule', '04 s3'),
  LOSS_RATE_CAUTION_ABOVE: m('product_safety_rule', '04 s3 (former max selectable default), IMPLEMENTATION_NOTES D-22'),
  ABSOLUTE_MIN_CALORIES_FEMALE: m('product_safety_rule', '04 s3 (NIDDK, 1 200 kcal women), IMPLEMENTATION_NOTES D-32'),
  ABSOLUTE_MIN_CALORIES_MALE: m('product_safety_rule', '04 s3 (NIDDK, 1 500 kcal men), IMPLEMENTATION_NOTES D-32'),
  RELATIVE_MIN_CALORIES_REE_FRACTION: m('product_safety_rule', '04 s3'),
  ENERGY_AVAILABILITY_CAUTION_KCAL_PER_KG_FFM: m('product_safety_rule', '04 s4 (IOC 2023)'),
  MAINTENANCE_ZONE_FRACTION: m('engineering_prior', '04 s5'),
  MAINTENANCE_ZONE_MIN_KG: m('engineering_prior', '04 s5'),
  MAINTENANCE_ZONE_MAX_KG: m('engineering_prior', '04 s5'),
  GOAL_SOLVER_HORIZON_DAYS: m('engineering_prior', '04 s6'),
  GOAL_SOLVER_MAX_ITERATIONS: m('engineering_prior', '04 s6'),
  GOAL_SOLVER_CALORIE_TOLERANCE_KCAL: m('engineering_prior', '04 s6'),
  GOAL_SOLVER_WEIGHT_TOLERANCE_KG: m('engineering_prior', '04 s6'),
  GOAL_SOLVER_MIN_INTAKE_KCAL: m('engineering_prior', 'solver bracket, IMPLEMENTATION_NOTES'),
  GOAL_SOLVER_MAX_INTAKE_KCAL: m('engineering_prior', 'solver bracket, IMPLEMENTATION_NOTES'),
  PROJECTION_MAX_DAYS: m('engineering_prior', '04 s7'),
  PROJECTION_SAMPLE_EVERY_DAYS: m('ui_rounding_rule', 'storage of projection samples'),
  SLIDER_MIN_STEPS_FLOOR: m('engineering_prior', '04 s9'),
  SLIDER_MIN_STEPS_BELOW_BASELINE: m('engineering_prior', '04 s9'),
  SLIDER_MAX_STEPS_CEILING: m('engineering_prior', '04 s9'),
  SLIDER_MAX_STEPS_ABOVE_BASELINE: m('engineering_prior', '04 s9'),
  SLIDER_HARD_MAX_STEPS: m('product_safety_rule', '04 s9'),
  SLIDER_RECOMMENDED_HALF_WIDTH_STEPS: m('engineering_prior', '04 s9'),
  GAIN_RESISTANCE_CONTEXT_MIN_SESSIONS: m('engineering_prior', '04 s11'),
  HALL_RHO_G_KCAL_PER_KG: m('published_constant', 'Hall 2011 Lancet appendix'),
  HALL_RHO_F_KCAL_PER_KG: m('published_constant', 'Hall 2011 Lancet appendix'),
  HALL_RHO_L_KCAL_PER_KG: m('published_constant', 'Hall 2011 Lancet appendix'),
  HALL_GAMMA_F_KCAL_PER_KG_DAY: m('published_constant', 'Hall 2011 Lancet appendix'),
  HALL_GAMMA_L_KCAL_PER_KG_DAY: m('published_constant', 'Hall 2011 Lancet appendix'),
  HALL_ETA_F_KCAL_PER_KG: m('published_constant', 'Hall 2011 Lancet appendix'),
  HALL_ETA_L_KCAL_PER_KG: m('published_constant', 'Hall 2011 Lancet appendix'),
  HALL_BETA_TEF: m('published_constant', 'Hall 2011 Lancet appendix'),
  HALL_BETA_AT: m('published_constant', 'Hall 2011 Lancet appendix'),
  HALL_TAU_AT_DAYS: m('published_constant', 'Hall 2011 Lancet appendix'),
  HALL_FORBES_C_KG: m('published_constant', 'Forbes / Hall 2011'),
  HALL_GLYCOGEN_BASELINE_KG: m('published_constant', 'Hall 2011 Lancet appendix'),
  HALL_GLYCOGEN_WATER_MULTIPLIER: m('published_constant', 'Hall 2011 Lancet appendix'),
  HALL_SODIUM_MG_PER_L: m('published_constant', 'Hall 2011 Lancet appendix'),
  HALL_ZETA_NA_MG_PER_L_DAY: m('published_constant', 'Hall 2011 Lancet appendix'),
  HALL_ZETA_CI_MG_PER_DAY: m('published_constant', 'Hall 2011 Lancet appendix'),
  HALL_BASELINE_CARB_FRACTION: m('engineering_prior', 'bw package default, fallback only (D-16)'),
  HALL_MIN_INITIAL_FAT_FRACTION: m('engineering_prior', 'IMPLEMENTATION_NOTES D-07'),
  HALL_DT_DAYS: m('engineering_prior', 'integration step'),
  HALL_MIN_BASELINE_INTAKE_KCAL: m('engineering_prior', 'numerical admissibility of the Hall initialisation (B1, kG > 0), not physiology, IMPLEMENTATION_NOTES D-28'),
  HALL_RK4_STIFFNESS_LIMIT: m('engineering_prior', 'numerical stability of RK4 sub-stepping, IMPLEMENTATION_NOTES N-01'),
  JACKSON_AGE_COEF: m('published_constant', 'Jackson 2002 IJO'),
  JACKSON_MALE_LN_BMI_COEF: m('published_constant', 'Jackson 2002 IJO'),
  JACKSON_MALE_INTERCEPT: m('published_constant', 'Jackson 2002 IJO'),
  JACKSON_FEMALE_LN_BMI_COEF: m('published_constant', 'Jackson 2002 IJO'),
  JACKSON_FEMALE_INTERCEPT: m('published_constant', 'Jackson 2002 IJO'),
  SILVA_MALE_AGE_COEF: m('published_constant', 'Silva 2007 ECF'),
  SILVA_MALE_HEIGHT_COEF: m('published_constant', 'Silva 2007 ECF'),
  SILVA_MALE_WEIGHT_COEF: m('published_constant', 'Silva 2007 ECF'),
  SILVA_MALE_INTERCEPT: m('published_constant', 'Silva 2007 ECF'),
  SILVA_FEMALE_HEIGHT_COEF: m('published_constant', 'Silva 2007 ECF'),
  SILVA_FEMALE_WEIGHT_COEF: m('published_constant', 'Silva 2007 ECF'),
  SILVA_FEMALE_INTERCEPT: m('published_constant', 'Silva 2007 ECF'),
  HALL_BODY_FAT_MIN_QUALITY: m('engineering_prior', 'IMPLEMENTATION_NOTES D-09'),
  Z_80: m('published_constant', 'normal quantile'),
  Z_95: m('published_constant', 'normal quantile'),
  ADHERENCE_WEIGHT_ON_PLAN: m('statistical_robustness_parameter', '05 s6'),
  ADHERENCE_WEIGHT_MINOR: m('statistical_robustness_parameter', '05 s6'),
  ADHERENCE_WEIGHT_MAJOR: m('statistical_robustness_parameter', '05 s6'),
  ADHERENCE_WEIGHT_UNKNOWN: m('statistical_robustness_parameter', '05 s6'),
  MISSING_STEPS_WEIGHT_FACTOR: m('statistical_robustness_parameter', '05 s7'),
  GATE_MIN_WEIGHINS: m('engineering_prior', '05 s8'),
  GATE_MIN_SPAN_DAYS: m('engineering_prior', '05 s8'),
  GATE_MIN_CLEAN_WEIGHINS: m('engineering_prior', '05 s8'),
  GATE_MIN_ADHERENCE_COVERAGE: m('engineering_prior', '05 s8'),
  GATE_MAJOR_DOMINATION_FRACTION: m('engineering_prior', 'IMPLEMENTATION_NOTES D-11'),
  CALIBRATION_GRID_MIN_KCAL: m('statistical_robustness_parameter', '05 s9'),
  CALIBRATION_GRID_MAX_KCAL: m('statistical_robustness_parameter', '05 s9'),
  CALIBRATION_GRID_STEP_KCAL: m('statistical_robustness_parameter', '05 s9'),
  CALIBRATION_T_DF: m('statistical_robustness_parameter', '05 s9'),
  CALIBRATION_T_SCALE_KG: m('statistical_robustness_parameter', '05 s9'),
  CALIBRATION_STRUCTURAL_SD_KCAL: m('statistical_robustness_parameter', '05 s9 structural uncertainty floor, chosen on the extended benchmarks, IMPLEMENTATION_NOTES D-33'),
  CALIBRATION_INTERCEPT_HALF_RANGE_KG: m('statistical_robustness_parameter', 'IMPLEMENTATION_NOTES D-10'),
  CALIBRATION_INTERCEPT_STEP_KG: m('statistical_robustness_parameter', 'IMPLEMENTATION_NOTES D-10'),
  CONFIDENCE_MEDIUM_MIN_WIDTH_KCAL: m('engineering_prior', '05 s11'),
  CONFIDENCE_GOOD_MIN_WIDTH_KCAL: m('engineering_prior', '05 s11'),
  CONFIDENCE_HIGH_MIN_SPAN_DAYS: m('engineering_prior', '05 s11'),
  CONFIDENCE_HIGH_MIN_WEIGHINS: m('engineering_prior', '05 s11'),
  CONFIDENCE_HIGH_MAX_MAJOR_FRACTION: m('engineering_prior', '05 s11'),
  RECAL_SURFACE_MIN_CHANGE_KCAL: m('engineering_prior', '05 s12'),
  RECAL_SURFACE_MIN_WIDTH_SHRINK: m('engineering_prior', '05 s12'),
  RECAL_SURFACE_MIN_DAYS: m('engineering_prior', '05 s12'),
  RECAL_SURFACE_MIN_CHANGE_AFTER_DAYS_KCAL: m('engineering_prior', '05 s12'),
  RECAL_SURFACE_MIN_INTERVAL_DAYS: m('engineering_prior', '05 s12 minimum spacing of surfaced recalibrations, IMPLEMENTATION_NOTES D-34'),
  WARM_START_MIN_DAYS: m('engineering_prior', '05 s17 warm start, IMPLEMENTATION_NOTES D-23'),
  WARM_START_MAX_DAYS: m('product_safety_rule', '05 s17 warm start input bound'),
  WARM_START_MIN_INTAKE_KCAL: m('product_safety_rule', '05 s17 warm start input bound'),
  WARM_START_MAX_INTAKE_KCAL: m('product_safety_rule', '05 s17 warm start input bound'),
  WARM_START_INTAKE_REL_SD_HIGH: m('engineering_prior', '05 s17 warm start, to validate'),
  WARM_START_INTAKE_REL_SD_MEDIUM: m('engineering_prior', '05 s17 warm start, to validate'),
  WARM_START_INTAKE_REL_SD_LOW: m('engineering_prior', '05 s17 warm start, to validate'),
  WARM_START_ACTIVITY_CHANGE_SD_KCAL: m('engineering_prior', '05 s17 warm start, to validate'),
  WARM_START_MODEL_SD_KCAL: m('engineering_prior', '05 s17 warm start, to validate'),
  WARM_START_INCOHERENT_OFFSET_BOUND: m('product_safety_rule', 'value inherited from the offset grid support, no physiological justification of its own, to be sourced (IMPLEMENTATION_NOTES D-28)'),
  WARM_START_EVIDENCE_SUPPORT_HALF_WIDTH_KCAL: m('statistical_robustness_parameter', 'numerical evidence support of the historical likelihood, no effect on the plan (IMPLEMENTATION_NOTES D-29)'),
  WARM_START_CONFLICT_Z: m('engineering_prior', '05 s17 warm start'),
  WARM_START_MEDIUM_MAX_WIDTH_RATIO: m('engineering_prior', '05 s17 warm start confidence'),
  TREND_HALF_LIFE_DAYS: m('engineering_prior', '05 s5'),
  TREND_RATE_WINDOW_DAYS: m('ui_rounding_rule', 'IMPLEMENTATION_NOTES D-12'),
  TREND_MIN_WEIGHINS: m('ui_rounding_rule', 'IMPLEMENTATION_NOTES D-12'),
  WEIGH_IN_REMINDER_INTERVAL_DAYS: m('engineering_prior', 'prototype copy: une pesée tous les 3 jours'),
  DISPLAY_KCAL_ROUNDING: m('ui_rounding_rule', '00 / 07 s9'),
  DISPLAY_STEPS_ROUNDING: m('ui_rounding_rule', '00 / 07 s9'),
  DISPLAY_WEIGHT_DECIMALS: m('ui_rounding_rule', '00 / 07 s9'),
  EXPLANATION_RANGE_ROUNDING_KCAL: m('ui_rounding_rule', 'explanation digest interval rounding, IMPLEMENTATION_NOTES D-30'),
  EXPLANATION_SCALE_VARIATION_EXAMPLE_KG: m('ui_rounding_rule', 'explanation digest example, IMPLEMENTATION_NOTES D-30'),
  STORED_PLAN_OFFSET_MATCH_TOLERANCE_KCAL: m('ui_rounding_rule', 'stored plan integrity check tolerance, display only, IMPLEMENTATION_NOTES D-30'),
  NASEM_MALE: m('published_constant', 'NASEM 2023 adult EER'),
  NASEM_FEMALE: m('published_constant', 'NASEM 2023 adult EER'),
};
