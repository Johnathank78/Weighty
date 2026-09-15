/**
 * Hall adult dynamic body-weight model (Hall et al. Lancet 2011, PMID 21872751;
 * Chow & Hall 2008; Hall 2010), deterministic pure TypeScript port.
 *
 * State: adaptive thermogenesis AT (kcal/d), extracellular fluid ECF (kg),
 * glycogen G (kg), lean tissue L (kg). Fat mass follows the Forbes relation
 * F = F0 * exp((L - L0) / 10.4 kg).
 *
 * TEF (IMPLEMENTATION_NOTES D-01): the native Hall 2011 term only,
 * TEF = beta_TEF * (EI - EI_baseline) with beta_TEF = 0.10. This is the model's
 * single TEF term, used in production and in reference validation. The daily
 * input carries no TEF value, so macro-specific TEF coefficients cannot reach
 * the trajectory and no TEF can be counted twice.
 */
import {
  HALL_BETA_AT,
  HALL_BETA_TEF,
  HALL_DT_DAYS,
  HALL_ETA_F_KCAL_PER_KG,
  HALL_ETA_L_KCAL_PER_KG,
  HALL_FORBES_C_KG,
  HALL_GAMMA_F_KCAL_PER_KG_DAY,
  HALL_GAMMA_L_KCAL_PER_KG_DAY,
  HALL_GLYCOGEN_BASELINE_KG,
  HALL_GLYCOGEN_WATER_MULTIPLIER,
  HALL_MIN_BASELINE_INTAKE_KCAL,
  HALL_MIN_INITIAL_FAT_FRACTION,
  HALL_RHO_F_KCAL_PER_KG,
  HALL_RHO_G_KCAL_PER_KG,
  HALL_RHO_L_KCAL_PER_KG,
  HALL_RK4_STIFFNESS_LIMIT,
  HALL_SODIUM_MG_PER_L,
  HALL_TAU_AT_DAYS,
  HALL_ZETA_CI_MG_PER_DAY,
  HALL_ZETA_NA_MG_PER_L_DAY,
  JACKSON_AGE_COEF,
  JACKSON_FEMALE_INTERCEPT,
  JACKSON_FEMALE_LN_BMI_COEF,
  JACKSON_MALE_INTERCEPT,
  JACKSON_MALE_LN_BMI_COEF,
  SILVA_FEMALE_HEIGHT_COEF,
  SILVA_FEMALE_INTERCEPT,
  SILVA_FEMALE_WEIGHT_COEF,
  SILVA_MALE_AGE_COEF,
  SILVA_MALE_HEIGHT_COEF,
  SILVA_MALE_INTERCEPT,
  SILVA_MALE_WEIGHT_COEF,
} from '../constants';
import type { SexForEquation } from '../types';

export type HallBaselineInput = {
  sex: SexForEquation;
  ageYears: number;
  heightM: number;
  bodyWeightKg: number;
  /** Steady-state intake that keeps weight stable at baseline (maintenance), kcal/day. */
  baselineIntakeKcal: number;
  /** Resting metabolic rate at baseline, kcal/day. */
  baselineRmrKcal: number;
  /** Measured initial fat mass; when omitted the Jackson et al. 2002 estimate is used. */
  initialFatKg?: number | undefined;
  /** Carbohydrate share of the baseline diet (energy fraction). */
  baselineCarbFraction: number;
};

export type HallParameters = {
  readonly input: HallBaselineInput;
  readonly fat0Kg: number;
  readonly lean0Kg: number;
  readonly ecf0Kg: number;
  readonly glycogen0Kg: number;
  readonly carbIntakeBaselineKcal: number;
  readonly kG: number;
  readonly deltaBaselineKcalPerKgDay: number;
  /** True when the solved baseline activity parameter was negative and clamped at zero. */
  readonly deltaClamped: boolean;
  readonly K: number;
  readonly initialFatSource: 'measured' | 'jackson_2002';
};

export type HallDailyInput = {
  intakeKcal: number;
  carbKcal: number;
  /** Change of the physical-activity parameter delta relative to baseline, kcal/kg/day. */
  paDeltaKcalPerKgDay: number;
  sodiumDeltaMg: number;
};

export type HallState = {
  at: number;
  ecf: number;
  glycogen: number;
  lean: number;
};

export type HallDayResult = {
  day: number;
  bodyWeightKg: number;
  fatKg: number;
  leanKg: number;
  glycogenKg: number;
  ecfKg: number;
  adaptiveThermogenesisKcal: number;
  /** Energy expenditure at the start of the day, kcal/day. */
  energyExpenditureKcal: number;
};

const FORBES_C = HALL_FORBES_C_KG * (HALL_RHO_L_KCAL_PER_KG / HALL_RHO_F_KCAL_PER_KG);
const ALPHA1 = -(1 + HALL_ETA_L_KCAL_PER_KG / HALL_RHO_L_KCAL_PER_KG) * FORBES_C;
const ALPHA2 = -(1 + HALL_ETA_F_KCAL_PER_KG / HALL_RHO_F_KCAL_PER_KG);

export function jacksonFatMassKg(sex: SexForEquation, ageYears: number, bodyWeightKg: number, heightM: number): number {
  const bmiValue = bodyWeightKg / (heightM * heightM);
  const percent =
    sex === 'male'
      ? JACKSON_AGE_COEF * ageYears + JACKSON_MALE_LN_BMI_COEF * Math.log(bmiValue) + JACKSON_MALE_INTERCEPT
      : JACKSON_AGE_COEF * ageYears + JACKSON_FEMALE_LN_BMI_COEF * Math.log(bmiValue) + JACKSON_FEMALE_INTERCEPT;
  return (bodyWeightKg * percent) / 100;
}

export function silvaEcfKg(sex: SexForEquation, ageYears: number, bodyWeightKg: number, heightM: number): number {
  return sex === 'male'
    ? SILVA_MALE_AGE_COEF * ageYears + SILVA_MALE_HEIGHT_COEF * heightM + SILVA_MALE_WEIGHT_COEF * bodyWeightKg + SILVA_MALE_INTERCEPT
    : SILVA_FEMALE_INTERCEPT + SILVA_FEMALE_HEIGHT_COEF * heightM + SILVA_FEMALE_WEIGHT_COEF * bodyWeightKg;
}

// ---------------------------------------------------------------------------
// Admissible domain of the initialisation (IMPLEMENTATION_NOTES D-28)
// ---------------------------------------------------------------------------

export type HallDomainErrorCode = 'baseline_intake_not_admissible' | 'glycogen_constant_not_positive' | 'non_finite_substeps';

/** Typed error: the Hall model is asked to run outside its admissible domain. Never a silently frozen trajectory. */
export class HallDomainError extends Error {
  readonly code: HallDomainErrorCode;
  readonly value: number;
  constructor(code: HallDomainErrorCode, value: number) {
    super(`Hall model outside its admissible domain: ${code} (${value})`);
    this.name = 'HallDomainError';
    this.code = code;
    this.value = value;
  }
}

/** Baseline intake must be strictly greater than this value (B1, numerical admissibility only), kcal/day. */
export function minAdmissibleBaselineIntakeKcal(): number {
  return HALL_MIN_BASELINE_INTAKE_KCAL;
}

export function isAdmissibleBaselineIntake(baselineIntakeKcal: number): boolean {
  return Number.isFinite(baselineIntakeKcal) && baselineIntakeKcal > HALL_MIN_BASELINE_INTAKE_KCAL;
}

/**
 * Diagnostic only (B2, never used as a filter): baseline intake below which the activity parameter delta of the
 * published initialisation is negative and clamped at 0, i.e. EI_b < RMR / (1 - beta_TEF).
 */
export function deltaClampBaselineIntakeKcal(baselineRmrKcal: number): number {
  return baselineRmrKcal / (1 - HALL_BETA_TEF);
}

export function initializeHall(input: HallBaselineInput): HallParameters {
  if (!isAdmissibleBaselineIntake(input.baselineIntakeKcal)) throw new HallDomainError('baseline_intake_not_admissible', input.baselineIntakeKcal);
  const bw = input.bodyWeightKg;
  const glycogen0Kg = HALL_GLYCOGEN_BASELINE_KG;
  const ecf0Kg = silvaEcfKg(input.sex, input.ageYears, bw, input.heightM);
  let fat0Kg: number;
  let initialFatSource: HallParameters['initialFatSource'];
  if (input.initialFatKg !== undefined) {
    fat0Kg = input.initialFatKg;
    initialFatSource = 'measured';
  } else {
    fat0Kg = Math.max(jacksonFatMassKg(input.sex, input.ageYears, bw, input.heightM), HALL_MIN_INITIAL_FAT_FRACTION * bw);
    initialFatSource = 'jackson_2002';
  }
  const lean0Kg = bw - (ecf0Kg + fat0Kg + HALL_GLYCOGEN_WATER_MULTIPLIER * glycogen0Kg);

  // Baseline steady state: EE = EI_b, with TEF_b = beta_TEF * EI_b folded into the activity term
  // exactly as in the published initialisation: delta = ((1 - beta_TEF) * EI_b - RMR) / BW.
  const rawDelta = ((1 - HALL_BETA_TEF) * input.baselineIntakeKcal - input.baselineRmrKcal) / bw;
  const deltaClamped = rawDelta < 0;
  const deltaBaselineKcalPerKgDay = Math.max(0, rawDelta);
  const K = input.baselineIntakeKcal - HALL_GAMMA_L_KCAL_PER_KG_DAY * lean0Kg - HALL_GAMMA_F_KCAL_PER_KG_DAY * fat0Kg - deltaBaselineKcalPerKgDay * bw;

  const carbIntakeBaselineKcal = input.baselineCarbFraction * input.baselineIntakeKcal;
  const kG = carbIntakeBaselineKcal / (glycogen0Kg * glycogen0Kg);
  // kG <= 0 made stableSubsteps return NaN, so the integration loop never ran and the weight stayed frozen.
  if (!(kG > 0)) throw new HallDomainError('glycogen_constant_not_positive', kG);

  return {
    input,
    fat0Kg,
    lean0Kg,
    ecf0Kg,
    glycogen0Kg,
    carbIntakeBaselineKcal,
    kG,
    deltaBaselineKcalPerKgDay,
    deltaClamped,
    K,
    initialFatSource,
  };
}

export function initialState(p: HallParameters): HallState {
  return { at: 0, ecf: p.ecf0Kg, glycogen: p.glycogen0Kg, lean: p.lean0Kg };
}

export function fatFromLean(p: HallParameters, leanKg: number): number {
  return p.fat0Kg * Math.exp((HALL_RHO_L_KCAL_PER_KG * (leanKg - p.lean0Kg)) / (HALL_RHO_F_KCAL_PER_KG * FORBES_C));
}

export function bodyWeightOf(p: HallParameters, s: HallState): number {
  return s.lean + fatFromLean(p, s.lean) + s.ecf + HALL_GLYCOGEN_WATER_MULTIPLIER * s.glycogen;
}

/** Native Hall 2011 thermic effect of feeding relative to baseline. */
function tefTerm(p: HallParameters, u: HallDailyInput): number {
  return HALL_BETA_TEF * (u.intakeKcal - p.input.baselineIntakeKcal);
}

type Derivatives = { dAt: number; dEcf: number; dGlycogen: number; dLean: number; energyExpenditureKcal: number };

export function derivatives(p: HallParameters, s: HallState, u: HallDailyInput): Derivatives {
  const deltaEi = u.intakeKcal - p.input.baselineIntakeKcal;
  const dAt = (HALL_BETA_AT * deltaEi - s.at) / HALL_TAU_AT_DAYS;
  const dEcf =
    (u.sodiumDeltaMg - HALL_ZETA_NA_MG_PER_L_DAY * (s.ecf - p.ecf0Kg) - HALL_ZETA_CI_MG_PER_DAY * (1 - u.carbKcal / p.carbIntakeBaselineKcal)) /
    HALL_SODIUM_MG_PER_L;
  const dGlycogen = (u.carbKcal - p.kG * s.glycogen * s.glycogen) / HALL_RHO_G_KCAL_PER_KG;

  const fat = fatFromLean(p, s.lean);
  const weight = s.lean + fat + s.ecf + HALL_GLYCOGEN_WATER_MULTIPLIER * s.glycogen;
  const delta = p.deltaBaselineKcalPerKgDay + u.paDeltaKcalPerKgDay;
  const r3 = p.K + delta * weight + tefTerm(p, u) + s.at - u.intakeKcal + HALL_RHO_G_KCAL_PER_KG * dGlycogen;
  const r = (r3 + HALL_GAMMA_L_KCAL_PER_KG_DAY * s.lean + HALL_GAMMA_F_KCAL_PER_KG_DAY * fat) / (ALPHA1 + ALPHA2 * fat);
  const dLean = (r * FORBES_C) / HALL_RHO_L_KCAL_PER_KG;
  // Tissue energy storage rate: rhoL*dL + rhoF*dF + rhoG*dG = r*(C + F) + rhoG*dG.
  const energyExpenditureKcal = u.intakeKcal - r * (FORBES_C + fat) - HALL_RHO_G_KCAL_PER_KG * dGlycogen;
  return { dAt, dEcf, dGlycogen, dLean, energyExpenditureKcal };
}

function addScaled(s: HallState, d: Derivatives, h: number): HallState {
  return { at: s.at + h * d.dAt, ecf: s.ecf + h * d.dEcf, glycogen: s.glycogen + h * d.dGlycogen, lean: s.lean + h * d.dLean };
}

/** One classical RK4 step of the coupled system with the day's input held constant. */
export function rk4Step(p: HallParameters, s: HallState, u: HallDailyInput, dt: number): HallState {
  const k1 = derivatives(p, s, u);
  const k2 = derivatives(p, addScaled(s, k1, dt / 2), u);
  const k3 = derivatives(p, addScaled(s, k2, dt / 2), u);
  const k4 = derivatives(p, addScaled(s, k3, dt), u);
  return {
    at: s.at + (dt / 6) * (k1.dAt + 2 * k2.dAt + 2 * k3.dAt + k4.dAt),
    ecf: s.ecf + (dt / 6) * (k1.dEcf + 2 * k2.dEcf + 2 * k3.dEcf + k4.dEcf),
    glycogen: s.glycogen + (dt / 6) * (k1.dGlycogen + 2 * k2.dGlycogen + 2 * k3.dGlycogen + k4.dGlycogen),
    lean: s.lean + (dt / 6) * (k1.dLean + 2 * k2.dLean + 2 * k3.dLean + k4.dLean),
  };
}

/**
 * Number of equal RK4 sub-steps needed to integrate `h` days stably (IMPLEMENTATION_NOTES N-01).
 * The glycogen equation dG/dt = (CI - kG G^2) / rhoG has local stiffness 2 kG G / rhoG, which grows
 * with the baseline carbohydrate intake. G stays below max(G0, sqrt(CI / kG)). Ordinary intakes need 1.
 */
export function stableSubsteps(p: HallParameters, u: HallDailyInput, h: number): number {
  const gMax = Math.max(p.glycogen0Kg, Math.sqrt(Math.max(0, u.carbKcal) / p.kG));
  const stiffness = (2 * p.kG * gMax) / HALL_RHO_G_KCAL_PER_KG;
  const n = Math.max(1, Math.ceil((stiffness * h) / HALL_RK4_STIFFNESS_LIMIT));
  // A non-finite count would skip the integration loop and leave the state unchanged without any error.
  if (!Number.isFinite(n)) throw new HallDomainError('non_finite_substeps', n);
  return n;
}

/** Advances `h` days with the input held constant, sub-stepping when the glycogen equation is stiff. */
export function advance(p: HallParameters, s: HallState, u: HallDailyInput, h: number): HallState {
  const n = stableSubsteps(p, u, h);
  let state = s;
  for (let i = 0; i < n; i++) state = rk4Step(p, state, u, h / n);
  return state;
}

export type SimulationOptions = {
  /** Integration step in days; the input is sampled once per whole day. */
  dtDays?: number;
  /** Record every n-th day in the output (the final day is always recorded). */
  recordEveryDays?: number;
  /** Optional early stop evaluated after each whole day. */
  stopWhen?: (result: HallDayResult) => boolean;
};

export type SimulationResult = {
  days: HallDayResult[];
  finalState: HallState;
  finalDay: number;
  stoppedEarly: boolean;
};

/**
 * Simulate `days` whole days. `inputForDay(d)` provides the constant input for day d (0-based).
 * Output day d describes the state at the start of day d (day 0 = baseline).
 */
export function simulateHall(p: HallParameters, days: number, inputForDay: (day: number) => HallDailyInput, options: SimulationOptions = {}): SimulationResult {
  const dt = options.dtDays ?? HALL_DT_DAYS;
  const stepsPerDay = Math.max(1, Math.round(1 / dt));
  const h = 1 / stepsPerDay;
  const record = options.recordEveryDays ?? 1;
  const out: HallDayResult[] = [];
  let s = initialState(p);

  const snapshot = (day: number, state: HallState, u: HallDailyInput): HallDayResult => {
    const fat = fatFromLean(p, state.lean);
    return {
      day,
      bodyWeightKg: state.lean + fat + state.ecf + HALL_GLYCOGEN_WATER_MULTIPLIER * state.glycogen,
      fatKg: fat,
      leanKg: state.lean,
      glycogenKg: state.glycogen,
      ecfKg: state.ecf,
      adaptiveThermogenesisKcal: state.at,
      energyExpenditureKcal: derivatives(p, state, u).energyExpenditureKcal,
    };
  };

  let u = inputForDay(0);
  out.push(snapshot(0, s, u));
  let stoppedAt: number | null = null;
  for (let day = 0; day < days; day++) {
    u = inputForDay(day);
    for (let i = 0; i < stepsPerDay; i++) s = advance(p, s, u, h);
    const next = day + 1;
    const nextInput = next < days ? inputForDay(next) : u;
    const result = snapshot(next, s, nextInput);
    if (next % record === 0 || next === days) out.push(result);
    if (options.stopWhen && options.stopWhen(result)) {
      if (out[out.length - 1]?.day !== next) out.push(result);
      stoppedAt = next;
      break;
    }
  }
  return { days: out, finalState: s, finalDay: stoppedAt ?? days, stoppedEarly: stoppedAt !== null };
}

/** Constant-input convenience wrapper. */
export function constantInput(u: HallDailyInput): (day: number) => HallDailyInput {
  return () => u;
}

/** Baseline input: holds intake, carbohydrate share and activity at baseline. */
export function baselineInput(p: HallParameters): HallDailyInput {
  const intake = p.input.baselineIntakeKcal;
  return {
    intakeKcal: intake,
    carbKcal: p.carbIntakeBaselineKcal,
    paDeltaKcalPerKgDay: 0,
    sodiumDeltaMg: 0,
  };
}
