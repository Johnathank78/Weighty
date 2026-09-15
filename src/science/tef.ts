/** Thermic effect of food (instruct/02 section 9). */
import { KCAL_PER_G_CARB, KCAL_PER_G_FAT, KCAL_PER_G_PROTEIN, REFERENCE_TEF_FRACTION, TEF_CARB, TEF_FAT, TEF_PROTEIN } from './constants';
import type { MacroGrams } from './types';

export type MacroEnergyKcal = {
  proteinKcal: number;
  carbKcal: number;
  fatKcal: number;
};

export function macroEnergyKcal(macros: MacroGrams): MacroEnergyKcal {
  return {
    proteinKcal: macros.proteinG * KCAL_PER_G_PROTEIN,
    carbKcal: macros.carbsG * KCAL_PER_G_CARB,
    fatKcal: macros.fatG * KCAL_PER_G_FAT,
  };
}

export function totalMacroKcal(macros: MacroGrams): number {
  const e = macroEnergyKcal(macros);
  return e.proteinKcal + e.carbKcal + e.fatKcal;
}

/** Full macro-specific TEF of a daily intake, kcal/day. */
export function tefKcalDay(macros: MacroGrams): number {
  const e = macroEnergyKcal(macros);
  return e.proteinKcal * TEF_PROTEIN + e.carbKcal * TEF_CARB + e.fatKcal * TEF_FAT;
}

/** TEF already contained in a free-living TEE such as NASEM EER. */
export function referenceTefKcalDay(baselineTdeeKcalDay: number): number {
  return REFERENCE_TEF_FRACTION * baselineTdeeKcalDay;
}

/** Only this delta may adjust an energy-balance scenario. Never add full TEF to EER. */
export function tefDeltaKcalDay(macros: MacroGrams, baselineTdeeKcalDay: number): number {
  return tefKcalDay(macros) - referenceTefKcalDay(baselineTdeeKcalDay);
}
