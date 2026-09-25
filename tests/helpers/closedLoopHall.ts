/**
 * World-side Hall model of the closed-loop simulator (prompt 36 s5.2): the repository model (src/science/hall/model.ts),
 * with five parameters scaled per simulated user. The estimator keeps the nominal model; only the world is perturbed.
 *
 * Scaled parameters (name in src/science/constants.ts):
 * - adaptive thermogenesis: HALL_BETA_AT (factor `betaAt`);
 * - deposition costs of fat and lean tissue: HALL_ETA_F_KCAL_PER_KG (`etaF`), HALL_ETA_L_KCAL_PER_KG (`etaL`);
 * - fat/lean partition (Forbes) parameter: HALL_FORBES_C_KG (`forbesC`);
 * - water bound to glycogen: HALL_GLYCOGEN_WATER_MULTIPLIER (`glycogenWater`).
 * Energy densities (HALL_RHO_*) and every other constant stay nominal. With all factors at 1 the trajectory is identical
 * to the repository model bit for bit (tests/domain/closedLoopHall.test.ts): same expressions, same operation order.
 */
import {
  HALL_BETA_AT,
  HALL_BETA_TEF,
  HALL_ETA_F_KCAL_PER_KG,
  HALL_ETA_L_KCAL_PER_KG,
  HALL_FORBES_C_KG,
  HALL_GAMMA_F_KCAL_PER_KG_DAY,
  HALL_GAMMA_L_KCAL_PER_KG_DAY,
  HALL_GLYCOGEN_BASELINE_KG,
  HALL_GLYCOGEN_WATER_MULTIPLIER,
  HALL_MIN_INITIAL_FAT_FRACTION,
  HALL_RHO_F_KCAL_PER_KG,
  HALL_RHO_G_KCAL_PER_KG,
  HALL_RHO_L_KCAL_PER_KG,
  HALL_RK4_STIFFNESS_LIMIT,
  HALL_SODIUM_MG_PER_L,
  HALL_TAU_AT_DAYS,
  HALL_ZETA_CI_MG_PER_DAY,
  HALL_ZETA_NA_MG_PER_L_DAY,
} from '@/science/constants';
import { isAdmissibleBaselineIntake, jacksonFatMassKg, silvaEcfKg } from '@/science/hall/model';
import type { HallBaselineInput, HallDailyInput, HallState } from '@/science/hall/model';

export type HallFactors = { betaAt: number; etaF: number; etaL: number; forbesC: number; glycogenWater: number };
export const NOMINAL_HALL_FACTORS: HallFactors = { betaAt: 1, etaF: 1, etaL: 1, forbesC: 1, glycogenWater: 1 };

export type WorldHall = {
  readonly input: HallBaselineInput;
  readonly fat0Kg: number;
  readonly lean0Kg: number;
  readonly ecf0Kg: number;
  readonly glycogen0Kg: number;
  readonly carbIntakeBaselineKcal: number;
  readonly kG: number;
  readonly deltaBaselineKcalPerKgDay: number;
  readonly K: number;
  readonly betaAt: number;
  readonly forbesC: number;
  readonly alpha1: number;
  readonly alpha2: number;
  readonly glycogenWater: number;
};

export function initWorldHall(input: HallBaselineInput, f: HallFactors): WorldHall {
  if (!isAdmissibleBaselineIntake(input.baselineIntakeKcal)) throw new Error(`world baseline intake not admissible: ${input.baselineIntakeKcal}`);
  const glycogenWater = HALL_GLYCOGEN_WATER_MULTIPLIER * f.glycogenWater;
  const forbesC = HALL_FORBES_C_KG * f.forbesC * (HALL_RHO_L_KCAL_PER_KG / HALL_RHO_F_KCAL_PER_KG);
  const alpha1 = -(1 + (HALL_ETA_L_KCAL_PER_KG * f.etaL) / HALL_RHO_L_KCAL_PER_KG) * forbesC;
  const alpha2 = -(1 + (HALL_ETA_F_KCAL_PER_KG * f.etaF) / HALL_RHO_F_KCAL_PER_KG);
  const bw = input.bodyWeightKg;
  const glycogen0Kg = HALL_GLYCOGEN_BASELINE_KG;
  const ecf0Kg = silvaEcfKg(input.sex, input.ageYears, bw, input.heightM);
  const fat0Kg = input.initialFatKg !== undefined ? input.initialFatKg : Math.max(jacksonFatMassKg(input.sex, input.ageYears, bw, input.heightM), HALL_MIN_INITIAL_FAT_FRACTION * bw);
  const lean0Kg = bw - (ecf0Kg + fat0Kg + glycogenWater * glycogen0Kg);
  const rawDelta = ((1 - HALL_BETA_TEF) * input.baselineIntakeKcal - input.baselineRmrKcal) / bw;
  const deltaBaselineKcalPerKgDay = Math.max(0, rawDelta);
  const K = input.baselineIntakeKcal - HALL_GAMMA_L_KCAL_PER_KG_DAY * lean0Kg - HALL_GAMMA_F_KCAL_PER_KG_DAY * fat0Kg - deltaBaselineKcalPerKgDay * bw;
  const carbIntakeBaselineKcal = input.baselineCarbFraction * input.baselineIntakeKcal;
  const kG = carbIntakeBaselineKcal / (glycogen0Kg * glycogen0Kg);
  if (!(kG > 0)) throw new Error(`world glycogen constant not positive: ${kG}`);
  return { input, fat0Kg, lean0Kg, ecf0Kg, glycogen0Kg, carbIntakeBaselineKcal, kG, deltaBaselineKcalPerKgDay, K, betaAt: HALL_BETA_AT * f.betaAt, forbesC, alpha1, alpha2, glycogenWater };
}

export function worldInitialState(p: WorldHall): HallState {
  return { at: 0, ecf: p.ecf0Kg, glycogen: p.glycogen0Kg, lean: p.lean0Kg };
}

function fatFromLean(p: WorldHall, leanKg: number): number {
  return p.fat0Kg * Math.exp((HALL_RHO_L_KCAL_PER_KG * (leanKg - p.lean0Kg)) / (HALL_RHO_F_KCAL_PER_KG * p.forbesC));
}

export function worldBodyWeight(p: WorldHall, s: HallState): number {
  return s.lean + fatFromLean(p, s.lean) + s.ecf + p.glycogenWater * s.glycogen;
}

export function worldFatKg(p: WorldHall, s: HallState): number {
  return fatFromLean(p, s.lean);
}

type Derivatives = { dAt: number; dEcf: number; dGlycogen: number; dLean: number };

function derivatives(p: WorldHall, s: HallState, u: HallDailyInput): Derivatives {
  const deltaEi = u.intakeKcal - p.input.baselineIntakeKcal;
  const dAt = (p.betaAt * deltaEi - s.at) / HALL_TAU_AT_DAYS;
  const dEcf =
    (u.sodiumDeltaMg - HALL_ZETA_NA_MG_PER_L_DAY * (s.ecf - p.ecf0Kg) - HALL_ZETA_CI_MG_PER_DAY * (1 - u.carbKcal / p.carbIntakeBaselineKcal)) /
    HALL_SODIUM_MG_PER_L;
  const dGlycogen = (u.carbKcal - p.kG * s.glycogen * s.glycogen) / HALL_RHO_G_KCAL_PER_KG;
  const fat = fatFromLean(p, s.lean);
  const weight = s.lean + fat + s.ecf + p.glycogenWater * s.glycogen;
  const delta = p.deltaBaselineKcalPerKgDay + u.paDeltaKcalPerKgDay;
  const r3 = p.K + delta * weight + HALL_BETA_TEF * (u.intakeKcal - p.input.baselineIntakeKcal) + s.at - u.intakeKcal + HALL_RHO_G_KCAL_PER_KG * dGlycogen;
  const r = (r3 + HALL_GAMMA_L_KCAL_PER_KG_DAY * s.lean + HALL_GAMMA_F_KCAL_PER_KG_DAY * fat) / (p.alpha1 + p.alpha2 * fat);
  const dLean = (r * p.forbesC) / HALL_RHO_L_KCAL_PER_KG;
  return { dAt, dEcf, dGlycogen, dLean };
}

function addScaled(s: HallState, d: Derivatives, h: number): HallState {
  return { at: s.at + h * d.dAt, ecf: s.ecf + h * d.dEcf, glycogen: s.glycogen + h * d.dGlycogen, lean: s.lean + h * d.dLean };
}

function rk4Step(p: WorldHall, s: HallState, u: HallDailyInput, dt: number): HallState {
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

/** One day (or `h` days) with the input held constant, with the repository's RK4 sub-stepping rule (N-01). */
export function worldAdvance(p: WorldHall, s: HallState, u: HallDailyInput, h = 1): HallState {
  const gMax = Math.max(p.glycogen0Kg, Math.sqrt(Math.max(0, u.carbKcal) / p.kG));
  const stiffness = (2 * p.kG * gMax) / HALL_RHO_G_KCAL_PER_KG;
  const n = Math.max(1, Math.ceil((stiffness * h) / HALL_RK4_STIFFNESS_LIMIT));
  if (!Number.isFinite(n)) throw new Error('non finite sub-steps');
  let state = s;
  for (let i = 0; i < n; i++) state = rk4Step(p, state, u, h / n);
  return state;
}
