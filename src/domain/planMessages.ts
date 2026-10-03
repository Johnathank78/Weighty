/**
 * Plan safety messages (pass 5a, annex of the prompt of report 43). French, "tu" as in the rest of the app, texts as given
 * (typographic apostrophe of the app). The domain writes them into the persistent trace (`AppMeta.planEvents`). UX pass 1
 * (G) reworded some of them; the triggers, thresholds and values are those of pass 5a. Never use the em dash character in
 * this file.
 */
import type { DailyLog, Goal } from '@/science/types';
import { formatKcal, formatNumber, formatRatePercent, formatSteps, MINUS } from './format';

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
 * Short format of the messages that update the plan (pass 5b fixes, point 5): a title of 6 words at most and one line of
 * 90 characters at most, with the figures; the long text above stays behind "Détails". Texts of the annex of the prompt of
 * report 46; the others in the same style (listed in the report). Never use the em dash character in this file.
 */
export type ShortText = { title: string; line: string };

/** Short reasons of a refused recalibration (annex), lower case: the line capitalises the first letter. */
export function shortRefusalReason(reason: string, floorKcal: number | null): string {
  switch (reason) {
    case 'loss_unavailable_low_bmi':
      return 'IMC sous 20';
    case 'no_feasible_speed':
      return floorKcal === null ? 'vitesse sous ton minimum calorique' : `vitesse sous ton minimum de ${formatKcal(floorKcal)} kcal`;
    case 'target_not_above_current':
    case 'target_not_below_current':
      return 'poids cible atteint';
    case 'target_bmi_too_low':
      return 'poids cible sous le minimum (IMC 20)';
    case 'invalid_profile':
      return 'profil incomplet';
    case 'no_profile':
      return 'profil introuvable';
    case 'gate_not_met':
      return 'pas encore assez de pesées';
    default:
      return 'calcul impossible';
  }
}

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase('fr-FR') + text.slice(1);

export const SHORT_MESSAGE = {
  guardrailBmi20: { title: 'Passage en maintien', line: 'Ton IMC atteint 20 : on stabilise ton poids.' } as ShortText,
  guardrailRateCap: (rate: number): ShortText => ({ title: 'Vitesse ajustée', line: `Ramenée à ${perWeek(rate)}, le maximum pour ton IMC.` }),
  bmi20Warning: (weeks: number): ShortText => ({ title: `IMC 20 dans ${weeks} sem.`, line: 'Ton plan passera alors en maintien.' }),
  periodicReplan: (before: number, after: number, goal: Goal): ShortText => ({
    title: 'Plan recalculé',
    line: `${formatKcal(before)} → ${formatKcal(after)} kcal par jour, ${goal === 'maintenance' ? 'pour garder ton poids stable' : 'pour tenir ta vitesse'}.`,
  }),
  targetRaised: (weightKg: number): ShortText => ({ title: 'Objectif ajusté', line: `Poids cible minimal : ${formatNumber(weightKg, 1)} kg (IMC 20).` }),
  recalibrationRefused: (reason: string, floorKcal: number | null): ShortText => ({ title: 'Recalibration impossible', line: `${capitalize(shortRefusalReason(reason, floorKcal))}. Tu peux passer en maintien.` }),
  underweight: { title: 'Poids bas', line: 'Si ce n’est pas voulu, parles-en à un professionnel de santé.' } as ShortText,
  proposal: (kcal: number): ShortText => ({ title: 'Viser ce que tu manges ?', line: `D’après ton journal : environ ${formatKcal(kcal)} kcal par jour.` }),
  /** Under the proposal when the floor raises the aligned target. */
  floorRaisedLine: (kcal: number) => `On part de ${formatKcal(kcal)} kcal, ton minimum.`,
  /** The trace message of the switch when the floor raised the target (no annex text: same line, own title). */
  floorRaised: (kcal: number): ShortText => ({ title: 'Cible relevée au minimum', line: `On part de ${formatKcal(kcal)} kcal, ton minimum.` }),
  logMore: { title: 'Note tes repas 2 semaines', line: 'Pour caler ta cible sur tes habitudes.' } as ShortText,
  weighDaily: { title: 'Pèse-toi chaque jour', line: 'Dans 4 semaines, ton plan pourra suivre ton journal.' } as ShortText,
  firstPlan: (h: number, targetKcal: number): ShortText => {
    const g = habitGap(h);
    const first = g.close ? 'Tu tiens ta cible de près.' : `Tu manges ${g.percent} % ${g.more ? 'de plus' : 'de moins'} que ta cible.`;
    return { title: 'Plan calé sur ton journal', line: `${first} Nouvelle cible : ${formatKcal(targetKcal)} kcal.` };
  },
  updatePlan: (beforeKcal: number, afterKcal: number): ShortText => ({ title: 'Plan à ajuster', line: `${formatKcal(beforeKcal)} → ${formatKcal(afterKcal)} kcal par jour.` }),
  exitWeighIns: { title: 'Retour à ta cible alignée', line: 'Trop de pesées manquées ces dernières semaines.' } as ShortText,
  exitLogging: { title: 'Retour à ta cible alignée', line: 'Trop de journées non saisies ces dernières semaines.' } as ShortText,
} as const;

/** Relative gap of the habit h to the target, rounded percent, and its direction. */
function habitGap(h: number): { percent: number; more: boolean; close: boolean } {
  const gap = Math.abs(h - 1);
  return { percent: Math.round(gap * 100), more: h > 1, close: gap < 0.02 };
}

const ADHERENCE_WORDS: Record<NonNullable<DailyLog['adherence']>, string> = { on_plan: 'plan respecté', minor_deviation: 'écart léger', major_deviation: 'écart important' };

/** Journal path (pass 5b, annex of the prompt). Never use the em dash character in this file. */
export const JOURNAL_MESSAGE = {
  proposalTitle: 'Ta cible ne correspond pas à ce que tu manges',
  proposalText: (kcal: number) => `D’après ton journal, tu manges environ ${formatKcal(kcal)} kcal par jour. Veux-tu viser ça ? Ta cible sera ensuite ajustée pour tenir ta vitesse.`,
  proposalAccept: (kcal: number) => `Viser ${formatKcal(kcal)} kcal`,
  proposalDecline: 'Garder ma cible',
  floorRaised: (medianKcal: number, finalKcal: number) => `Ton journal indique environ ${formatKcal(medianKcal)} kcal, sous ton minimum : on part de ${formatKcal(finalKcal)} kcal.`,
  logMore: 'Tes journées s’écartent souvent de ta cible. Note ce que tu manges pendant deux semaines : on pourra caler ta cible sur tes habitudes.',
  alignButton: 'Aligner ma cible sur ce que je mange',
  alignButtonDisabled: (missing: number) => `Disponible quand 10 des 14 derniers jours sont saisis (encore ${missing}).`,
  weighDaily: 'Pèse-toi chaque jour : après 4 semaines, ton plan pourra être calculé directement à partir de ton journal, et il sera plus précis.',
  firstPlanTitle: 'Ton journal permet un plan plus précis',
  firstPlanText: (h: number, targetKcal: number) => {
    const g = habitGap(h);
    const second = g.close
      ? `Tu tiens ta cible de près. Ta nouvelle cible : ${formatKcal(targetKcal)} kcal par jour.`
      : `En moyenne, tu manges ${g.percent} % ${g.more ? 'de plus' : 'de moins'} que ta cible ; ta nouvelle cible en tient compte : ${formatKcal(targetKcal)} kcal par jour.`;
    return `Tu te pèses chaque jour et tu notes ce que tu manges : ton plan peut maintenant être calculé à partir de ton journal. ${second}`;
  },
  /** Later plans of the measured habit (no annex text): same buttons as the first plan. */
  updateTitle: 'Ton plan peut être ajusté',
  updateText: (beforeKcal: number, afterKcal: number) => `D’après ton journal et tes pesées, ta cible passerait de ${formatKcal(beforeKcal)} à ${formatKcal(afterKcal)} kcal par jour.`,
  offerAccept: 'Utiliser ce plan',
  offerDecline: 'Plus tard',
  habitLine: (h: number) => {
    const g = habitGap(h);
    return g.close ? 'Ton habitude : tu tiens ta cible de près.' : `Ton habitude : tu manges en moyenne ${g.percent} % ${g.more ? 'de plus' : 'de moins'} que ta cible. Ta cible affichée en tient compte.`;
  },
  balance: (maintenanceKcal: number) => `Équilibre d’après ton journal : ${formatKcal(maintenanceKcal)} kcal par jour.`,
  exitWeighIns: 'Il manque plusieurs pesées ces dernières semaines : ton plan repasse sur ta cible alignée. Il sera à nouveau calculé à partir de ton journal quand tu auras repris tes pesées quotidiennes.',
  exitLogging: 'Il y a plusieurs journées non saisies ces dernières semaines : ton plan repasse sur ta cible alignée. Il sera à nouveau calculé à partir de ton journal quand tu auras repris tes saisies.',
  incompleteDay: 'Journée incomplète ? Elle ne sera pas prise en compte dans ton plan.',
  /** Pass 5b fixes, point 4 (annex): the adherence read in the journal, on the tile of Aujourd'hui and in its sheet. */
  deducedAdherence: (value: NonNullable<DailyLog['adherence']>) => `${capitalize(ADHERENCE_WORDS[value])}, d’après ton journal`,
  deducedAdherenceHint: 'Toucher pour changer',
  /** No annex text: short lines of the screens (choices of pass 5b). */
  switchedToast: 'Nouvelle cible appliquée.',
  offerAcceptedToast: 'Nouveau plan appliqué.',
  statusMeasured: 'Ton plan suit ton journal et tes pesées.',
  balanceLabel: 'Équilibre d’après ton journal',
  /** Annex of the fixes (point 2): the slider when the measured habit cannot build it (no journal input). */
  sliderUnavailable: 'En mode journal, ta cible suit ton journal et tes pesées.',
  /** Pass 5b fixes, point 7 (report 45 s5, point 2): the deadline of the aligned target itself, Plan tab. */
  deadlineLabel: 'Échéance',
  deadlineAfterRecalibration: 'Après la première recalibration',
  /** Point 7 (report 45 s5, point 7): the recalibration line of Aujourd'hui on the aligned target. */
  nextRecalibration: (days: number) => `Prochaine recalibration dans ${days} jour${days > 1 ? 's' : ''}.`,
  /** Point 7 (report 45 s5, point 5): "Pourquoi ce résultat ?" in the measured habit (annex); the habit as a signed percent. */
  whyMeasured: (maintenanceKcal: number, h: number) => {
    const g = habitGap(h);
    return `Équilibre d’après ton journal : ${formatKcal(maintenanceKcal)} kcal par jour. Habitude : ${g.percent === 0 ? '0' : `${g.more ? '+' : MINUS}${g.percent}`} %. Ta cible = apport à viser ÷ habitude.`;
  },
  /**
   * Pass 5b fixes, point 1a: on the aligned target itself, the speed (and the steps / calories slider) waits for the first
   * recalibration. `days`: days before it can come (0: it may come any day, the count is left out).
   */
  alignedLock: (days: number) =>
    days > 0
      ? `Ta cible suit ce que tu manges. Vitesse modifiable après la première recalibration, dans ${days} jour${days > 1 ? 's' : ''}.`
      : 'Ta cible suit ce que tu manges. Vitesse modifiable après la première recalibration.',
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
