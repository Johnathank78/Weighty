/** Initial TDEE uncertainty prior and interval helpers (instruct/01 s9, 05 s2-s3). */
import {
  DEFAULT_CADENCE_SIGMA_MULTIPLIER,
  NASEM_SEPV_FEMALE_KCAL,
  NASEM_SEPV_MALE_KCAL,
  PAL_BOUNDARY_SIGMA_MULTIPLIER,
  PHYSICAL_JOB_SIGMA_MULTIPLIER,
  REE_DISAGREEMENT_SIGMA_MULTIPLIER,
  Z_80,
  Z_95,
} from './constants';
import type { Interval, SexForEquation } from './types';

export type SigmaFlags = {
  palBoundaryFlag: boolean;
  physicalOccupation: boolean;
  reeModelDisagreement: boolean;
  defaultActivityCadence: boolean;
};

export type SigmaBreakdown = {
  baseSigmaKcal: number;
  multipliers: Array<{ reason: keyof SigmaFlags; factor: number }>;
  sigmaKcal: number;
};

export function initialSigma(sex: SexForEquation, flags: SigmaFlags): SigmaBreakdown {
  const baseSigmaKcal = sex === 'male' ? NASEM_SEPV_MALE_KCAL : NASEM_SEPV_FEMALE_KCAL;
  const multipliers: SigmaBreakdown['multipliers'] = [];
  if (flags.palBoundaryFlag) multipliers.push({ reason: 'palBoundaryFlag', factor: PAL_BOUNDARY_SIGMA_MULTIPLIER });
  if (flags.physicalOccupation) multipliers.push({ reason: 'physicalOccupation', factor: PHYSICAL_JOB_SIGMA_MULTIPLIER });
  if (flags.reeModelDisagreement) multipliers.push({ reason: 'reeModelDisagreement', factor: REE_DISAGREEMENT_SIGMA_MULTIPLIER });
  if (flags.defaultActivityCadence) multipliers.push({ reason: 'defaultActivityCadence', factor: DEFAULT_CADENCE_SIGMA_MULTIPLIER });
  // Consumer BIA and unknown-quality measured RMR never reduce sigma: no multiplier below 1 exists.
  const sigmaKcal = multipliers.reduce((s, m) => s * m.factor, baseSigmaKcal);
  return { baseSigmaKcal, multipliers, sigmaKcal };
}

export function normalInterval80(mean: number, sigma: number): Interval {
  return [mean - Z_80 * sigma, mean + Z_80 * sigma];
}

export function normalInterval95(mean: number, sigma: number): Interval {
  return [mean - Z_95 * sigma, mean + Z_95 * sigma];
}

export function intervalWidth(interval: Interval): number {
  return interval[1] - interval[0];
}
