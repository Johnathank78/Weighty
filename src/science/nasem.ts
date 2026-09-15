/** NASEM 2023 adult EER equations (instruct/01 section 7). Output kcal/day. */
import { NASEM_FEMALE, NASEM_MALE } from './constants';
import type { PalCategory, SexForEquation } from './types';

export type NasemInput = {
  sex: SexForEquation;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  palCategory: PalCategory;
};

export function nasemEerKcalDay(input: NasemInput): number {
  const table = input.sex === 'male' ? NASEM_MALE : NASEM_FEMALE;
  const c = table[input.palCategory];
  return c.intercept + c.age * input.ageYears + c.heightCm * input.heightCm + c.weightKg * input.weightKg;
}
