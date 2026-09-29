/**
 * Plan safety messages (pass 5a, annex of the prompt of report 43). French, "tu" as in the rest of the app, texts as given
 * (typographic apostrophe of the app). The domain writes them into the persistent trace (`AppMeta.planEvents`). UX pass 1
 * (G) reworded some of them; the triggers, thresholds and values are those of pass 5a. Never use the em dash character in
 * this file.
 */
import type { Goal } from '@/science/types';
import { formatKcal, formatNumber, formatRatePercent, formatSteps } from './format';

/** "{vitesse} % par semaine" with the app's rate formatting (0.005 -> "0,5 %"). */
const perWeek = (rate: number) => `${formatRatePercent(rate)} par semaine`;

export const PLAN_MESSAGE = {
  guardrailBmi20: 'Ton IMC atteint 20. Pour rester dans une zone sûre, ton plan passe en maintien : à partir de maintenant, on stabilise ton poids.',
  guardrailRateCap: (rate: number) => `Ta vitesse de perte dépasse ce qui est conseillé pour ton IMC actuel. Elle est ramenée à ${perWeek(rate)}.`,
  bmi20Warning: (weeks: number) => `À ce rythme, ton IMC pourrait passer sous 20 d’ici ${weeks} semaine${weeks > 1 ? 's' : ''}. Ton plan passera alors en maintien.`,
  /**
   * UX pass 1, G3: the replan starts from the modeled state of the day, not from the current weight. A maintenance plan has
   * no speed to hold: it keeps the weight stable.
   */
  periodicReplan: (before: number, after: number, goal: Goal) =>
    `Ton plan a été recalculé pour ${goal === 'maintenance' ? 'garder ton poids stable' : 'tenir ta vitesse'} : ${formatKcal(before)} → ${formatKcal(after)} kcal par jour.`,
  targetRaised: (weightKg: number) => `Pour ta sécurité, le poids cible minimal correspond maintenant à un IMC de 20. Ton objectif a été ajusté à ${formatNumber(weightKg, 1)} kg.`,
  floorLimit: (floorKcal: number) => `Ta vitesse est limitée par ton minimum de ${formatKcal(floorKcal)} kcal par jour.`,
  /** UX pass 1, G4: the one visible line under the speed slider when the floor limits it. */
  floorLimitLine: (floorKcal: number, maxRate: number) => `Limitée par ton minimum de ${formatKcal(floorKcal)} kcal par jour. Maximum : ${perWeek(maxRate)}.`,
  floorStepsLink: 'Et avec plus de pas ?',
  floorSteps: (rate: number, steps: number) => `Pour tenir ${perWeek(rate)}, il faudrait environ ${formatSteps(steps)} pas par jour.`,
  floorUnreachable: (maxRate: number | null) =>
    `Même en marchant davantage, cette vitesse n’est pas atteignable.${maxRate === null ? '' : ` Le maximum pour toi est ${perWeek(maxRate)}.`}`,
  underweight: 'Ton poids descend sous la zone habituellement recommandée. Si ce n’est pas voulu, parles-en à un professionnel de santé.',
} as const;

/**
 * Every reason for which a plan cannot be (re)built, as returned by the domain (`buildPlan`, `buildPlanFromStore`,
 * `applyRecalibration`), with the sentence that says why. `floorKcal` completes the infeasible-speed sentence.
 */
export type PlanRefusalReason =
  | 'loss_unavailable_low_bmi'
  | 'no_feasible_speed'
  | 'target_not_above_current'
  | 'target_not_below_current'
  | 'target_bmi_too_low'
  | 'invalid_profile'
  | 'no_profile'
  | 'gate_not_met';

export const PLAN_REFUSAL_REASONS: readonly PlanRefusalReason[] = [
  'loss_unavailable_low_bmi',
  'no_feasible_speed',
  'target_not_above_current',
  'target_not_below_current',
  'target_bmi_too_low',
  'invalid_profile',
  'no_profile',
  'gate_not_met',
];

export function refusalReasonText(reason: string, floorKcal: number | null): string {
  switch (reason) {
    case 'loss_unavailable_low_bmi':
      return 'ton IMC est sous 20, la perte n’est plus proposée';
    case 'no_feasible_speed':
      return floorKcal === null ? 'cette vitesse demanderait de manger sous ton minimum calorique' : `cette vitesse demanderait de manger sous ton minimum de ${formatKcal(floorKcal)} kcal par jour`;
    case 'target_not_above_current':
    case 'target_not_below_current':
      return 'tu as atteint ton poids cible';
    case 'target_bmi_too_low':
      return 'ton poids cible est sous le minimum, qui correspond à un IMC de 20';
    case 'invalid_profile':
      return 'certaines informations de ton profil sont hors des limites prises en charge';
    case 'no_profile':
      return 'ton profil est introuvable';
    case 'gate_not_met':
      return 'il n’y a pas encore assez de pesées pour recalibrer';
    default:
      return 'le calcul n’a pas abouti';
  }
}

/** "On n’a pas pu recalculer ton plan : {raison}. Tu peux passer en maintien." */
export function recalibrationRefusedText(reason: string, floorKcal: number | null): string {
  return `On n’a pas pu recalculer ton plan : ${refusalReasonText(reason, floorKcal)}. Tu peux passer en maintien.`;
}
