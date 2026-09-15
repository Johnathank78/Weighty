/**
 * Macronutrient engine (instruct/03).
 * Pure function of profile, activity class, objective and calorie target.
 */
import {
  DISPLAY_KCAL_ROUNDING,
  ENDURANCE_MIN_MINUTES_WEEK,
  FAT_AMDR_MIN_FRACTION,
  FAT_FLOOR_G_PER_KG_REFERENCE,
  FAT_FRACTION_DEFAULT,
  FAT_FRACTION_ENDURANCE,
  KCAL_PER_G_CARB,
  KCAL_PER_G_FAT,
  KCAL_PER_G_PROTEIN,
  LOW_CARB_ENDURANCE_G_PER_KG,
  LOW_CARB_RESISTANCE_G_PER_KG,
  MACRO_ENERGY_TOLERANCE_KCAL,
  NUTRITION_REFERENCE_BMI,
  NUTRITION_REFERENCE_EXCESS_FRACTION,
  PROTEIN_G_PER_KG_BASE,
  PROTEIN_G_PER_KG_FFM_ATHLETE_LOSS,
  PROTEIN_G_PER_KG_LOSS,
  PROTEIN_G_PER_KG_LOSS_RESISTANCE,
  PROTEIN_G_PER_KG_TRAINED,
  PROTEIN_MAX_G_PER_KG_ACTUAL,
  RESISTANCE_MIN_MINUTES_WEEK,
  RESISTANCE_MIN_SESSIONS_WEEK,
} from './constants';
import { fatFreeMassKg, isHighQualityBodyComposition, isPlausibleFfm } from './ree';
import type { BodyFatMethod, Goal, MacroActivityClass, MacroGrams, StructuredActivity } from './types';

const ENDURANCE_TYPES: ReadonlySet<StructuredActivity['type']> = new Set(['running', 'cycling', 'swimming', 'rowing', 'hiking']);

export function bmi(weightKg: number, heightCm: number): number {
  const h = heightCm / 100;
  return weightKg / (h * h);
}

export function weightAtBmi(targetBmi: number, heightCm: number): number {
  const h = heightCm / 100;
  return targetBmi * h * h;
}

/**
 * Continuous nutrition reference weight (03 s1, IMPLEMENTATION_NOTES D-21): actual weight up to the
 * BMI 25 weight, then the BMI 25 weight plus 0.33 of the excess. A normalisation for g/kg rules,
 * not an ideal body weight.
 */
export function nutritionReferenceWeightKg(weightKg: number, heightCm: number): number {
  const bmi25WeightKg = weightAtBmi(NUTRITION_REFERENCE_BMI, heightCm);
  if (weightKg <= bmi25WeightKg) return weightKg;
  return bmi25WeightKg + NUTRITION_REFERENCE_EXCESS_FRACTION * (weightKg - bmi25WeightKg);
}

export function classifyMacroActivity(activities: readonly StructuredActivity[]): MacroActivityClass {
  let strengthSessions = 0;
  let strengthMinutes = 0;
  let enduranceMinutes = 0;
  for (const a of activities) {
    const weekly = a.sessionsPerWeek * a.durationMin;
    if (a.type === 'strength') {
      strengthSessions += a.sessionsPerWeek;
      strengthMinutes += weekly;
    } else if (ENDURANCE_TYPES.has(a.type)) {
      enduranceMinutes += weekly;
    }
  }
  const resistance = strengthSessions >= RESISTANCE_MIN_SESSIONS_WEEK && strengthMinutes >= RESISTANCE_MIN_MINUTES_WEEK;
  // Official v1 definition (03 s5, IMPLEMENTATION_NOTES D-14): mixed = resistance criteria met AND
  // endurance volume >= 150 min/week; endurance additionally requires strength < 2 sessions/week.
  const enduranceVolume = enduranceMinutes >= ENDURANCE_MIN_MINUTES_WEEK;
  if (resistance && enduranceVolume) return 'mixed';
  if (resistance) return 'resistance';
  if (enduranceVolume && strengthSessions < RESISTANCE_MIN_SESSIONS_WEEK) return 'endurance';
  return 'sedentary';
}

export type MacroInput = {
  weightKg: number;
  heightCm: number;
  bodyFatPercent?: number | undefined;
  bodyFatMethod?: BodyFatMethod | undefined;
  athleteLike: boolean;
  activityClass: MacroActivityClass;
  goal: Goal;
  calorieTargetKcal: number;
};

export type ProteinRule =
  | 'base_1_2'
  | 'trained_1_6'
  | 'loss_1_6'
  | 'loss_resistance_1_8'
  | 'athlete_loss_ffm_2_3'
  | 'capped_2_2_actual';

export type MacroResult = {
  feasible: boolean;
  infeasibleReason: 'negative_carbohydrate' | null;
  nutritionReferenceWeightKg: number;
  ffmOverrideKg: number | null;
  proteinRule: ProteinRule;
  fatFraction: number;
  /** Full precision grams. */
  exact: MacroGrams;
  /** Rounded grams reconciled with the displayed (10 kcal) target. */
  display: MacroGrams;
  displayCalorieTargetKcal: number;
  displayMacroEnergyKcal: number;
  lowCarbForEndurance: boolean;
  lowCarbForResistance: boolean;
};

function proteinGrams(input: MacroInput, refWeightKg: number, ffmOverrideKg: number | null): { grams: number; rule: ProteinRule } {
  const resistanceTrained = input.activityClass === 'resistance' || input.activityClass === 'mixed';
  const trained = input.activityClass !== 'sedentary';
  let grams: number;
  let rule: ProteinRule;
  if (input.goal === 'loss') {
    if (resistanceTrained && ffmOverrideKg !== null) {
      grams = Math.max(PROTEIN_G_PER_KG_LOSS_RESISTANCE * refWeightKg, PROTEIN_G_PER_KG_FFM_ATHLETE_LOSS * ffmOverrideKg);
      rule = 'athlete_loss_ffm_2_3';
    } else if (resistanceTrained) {
      grams = PROTEIN_G_PER_KG_LOSS_RESISTANCE * refWeightKg;
      rule = 'loss_resistance_1_8';
    } else {
      grams = PROTEIN_G_PER_KG_LOSS * refWeightKg;
      rule = 'loss_1_6';
    }
  } else if (trained) {
    grams = PROTEIN_G_PER_KG_TRAINED * refWeightKg;
    rule = 'trained_1_6';
  } else {
    grams = PROTEIN_G_PER_KG_BASE * refWeightKg;
    rule = 'base_1_2';
  }
  const cap = PROTEIN_MAX_G_PER_KG_ACTUAL * input.weightKg;
  if (grams > cap) return { grams: cap, rule: 'capped_2_2_actual' };
  return { grams, rule };
}

export function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function computeMacros(input: MacroInput): MacroResult {
  const refWeight = nutritionReferenceWeightKg(input.weightKg, input.heightCm);

  let ffmOverrideKg: number | null = null;
  if (input.athleteLike && isHighQualityBodyComposition(input.bodyFatMethod) && input.bodyFatPercent !== undefined) {
    const ffm = fatFreeMassKg(input.weightKg, input.bodyFatPercent);
    if (isPlausibleFfm(ffm, input.weightKg)) ffmOverrideKg = ffm;
  }

  const protein = proteinGrams(input, refWeight, ffmOverrideKg);
  const endurance = input.activityClass === 'endurance' || input.activityClass === 'mixed';
  const fatFraction = endurance ? FAT_FRACTION_ENDURANCE : FAT_FRACTION_DEFAULT;
  const kcal = input.calorieTargetKcal;
  const fatG = Math.max((kcal * fatFraction) / KCAL_PER_G_FAT, FAT_FLOOR_G_PER_KG_REFERENCE * refWeight, (kcal * FAT_AMDR_MIN_FRACTION) / KCAL_PER_G_FAT);
  const remainingKcal = kcal - KCAL_PER_G_PROTEIN * protein.grams - KCAL_PER_G_FAT * fatG;
  const carbsG = remainingKcal / KCAL_PER_G_CARB;
  const feasible = carbsG >= 0;

  const exact: MacroGrams = { proteinG: protein.grams, carbsG, fatG };

  // Rounding algorithm, 03 section 6.
  const displayCalorieTargetKcal = roundToStep(kcal, DISPLAY_KCAL_ROUNDING);
  const pR = Math.round(protein.grams);
  const fR = Math.round(fatG);
  let cR = Math.max(0, Math.round((displayCalorieTargetKcal - KCAL_PER_G_PROTEIN * pR - KCAL_PER_G_FAT * fR) / KCAL_PER_G_CARB));
  let energy = KCAL_PER_G_PROTEIN * pR + KCAL_PER_G_CARB * cR + KCAL_PER_G_FAT * fR;
  const diff = energy - displayCalorieTargetKcal;
  if (Math.abs(diff) > MACRO_ENERGY_TOLERANCE_KCAL) {
    const correction = Math.ceil((Math.abs(diff) - MACRO_ENERGY_TOLERANCE_KCAL) / KCAL_PER_G_CARB);
    cR = Math.max(0, cR - Math.sign(diff) * correction);
    energy = KCAL_PER_G_PROTEIN * pR + KCAL_PER_G_CARB * cR + KCAL_PER_G_FAT * fR;
  }

  return {
    feasible,
    infeasibleReason: feasible ? null : 'negative_carbohydrate',
    nutritionReferenceWeightKg: refWeight,
    ffmOverrideKg,
    proteinRule: protein.rule,
    fatFraction,
    exact,
    display: { proteinG: pR, carbsG: cR, fatG: fR },
    displayCalorieTargetKcal,
    displayMacroEnergyKcal: energy,
    lowCarbForEndurance: endurance && carbsG < LOW_CARB_ENDURANCE_G_PER_KG * refWeight,
    lowCarbForResistance: (input.activityClass === 'resistance' || input.activityClass === 'mixed') && carbsG < LOW_CARB_RESISTANCE_G_PER_KG * refWeight,
  };
}
