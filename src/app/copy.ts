/** French UI copy and label maps. Never use the em dash character in this file. */
import type { ActivityIntensity, BodyFatMethod, ConfidenceLevel, Goal, OccupationActivity, ReeMethod, SpeedZone, StructuredActivityType, TrackingQuality, WalkingPace } from '@/science/types';

export const GOAL_LABEL: Record<Goal, string> = { loss: 'Perte de poids', maintenance: 'Maintien', gain: 'Prise de poids' };
export const GOAL_SHORT: Record<Goal, string> = { loss: 'Perte', maintenance: 'Maintien', gain: 'Prise' };
/** Qualitative zones of the continuous speed slider. */
export const SPEED_LABEL: Record<SpeedZone, string> = { gentle: 'Douce', moderate: 'Modérée', fast: 'Rapide' };
export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = { low: 'Faible', medium: 'Moyenne', good: 'Bonne', high: 'Élevée' };
export const PACE_LABEL: Record<WalkingPace, string> = { slow: 'Lente', normal: 'Normale', brisk: 'Rapide' };
export const OCCUPATION_LABEL: Record<OccupationActivity, string> = { seated: 'Assis', mixed: 'Mixte', standing: 'Debout', physical: 'Physique' };
export const INTENSITY_LABEL: Record<ActivityIntensity, string> = { light: 'Légère', moderate: 'Modérée', vigorous: 'Intense' };
export const ACTIVITY_LABEL: Record<StructuredActivityType, string> = {
  strength: 'Musculation',
  running: 'Course',
  // No longer offered (daily steps already capture ordinary walking); kept for profiles created before model 1.1.0.
  walking: 'Marche structurée',
  hiking: 'Randonnée / marche sportive',
  cycling: 'Vélo',
  swimming: 'Natation',
  rowing: 'Rameur',
  team_sport: 'Sports collectifs',
  other: 'Autre',
};
export const BODY_FAT_METHOD_LABEL: Record<BodyFatMethod, { label: string; hint: string }> = {
  dxa: { label: 'DXA / scanner', hint: 'très fiable' },
  air_displacement_plethysmography: { label: 'BodPod (pléthysmographie)', hint: 'très fiable' },
  four_compartment: { label: 'Bilan 4 compartiments', hint: 'référence' },
  skinfold: { label: 'Pince à plis', hint: 'correct' },
  consumer_bia: { label: 'Balance impédancemètre', hint: 'approximatif' },
  self_estimate: { label: 'Estimation personnelle', hint: 'indicatif' },
};
export const REE_METHOD_LABEL: Record<ReeMethod, string> = {
  measured_indirect_calorimetry: 'mesure par calorimétrie indirecte',
  ten_haaf_weight: 'équation de ten Haaf (sportifs)',
  mifflin_st_jeor: 'équation de Mifflin-St Jeor',
};
export const PAL_LABEL = { inactive: 'inactif', low_active: 'peu actif', active: 'actif', very_active: 'très actif' } as const;
export const ADHERENCE_LABEL = { on_plan: 'Plan respecté', minor_deviation: 'Léger écart', major_deviation: 'Écart important' } as const;

export const SPEED_NOTE: Record<Goal, Record<SpeedZone, string>> = {
  loss: {
    gentle: 'Rythme confortable, quasi indolore au quotidien.',
    moderate: 'Équilibre recommandé entre progression et confort.',
    fast: 'Plus exigeant. À réserver à des périodes courtes.',
  },
  gain: {
    gentle: 'Surplus léger, pour une prise progressive.',
    moderate: 'Rythme courant pour une prise de poids suivie.',
    fast: 'Rythme soutenu. Le suivi du tour de taille devient utile.',
  },
  maintenance: { gentle: '', moderate: '', fast: '' },
};

export const speedCautionText = (percent: string) => `Au-delà de ${percent} par semaine, ce rythme est très exigeant. Garde-le pour une période courte.`;
export const SPEED_LIMIT_TEXT = 'Les vitesses plus rapides ne sont pas proposées pour ton profil.';

export const TRACKING_QUALITY_LABEL: Record<TrackingQuality, string> = {
  high: 'Je pèse et note la plupart de mes aliments',
  medium: 'Je note régulièrement mais j’estime certaines portions',
  low: 'C’est une approximation',
};

export const ONBOARDING_SECTION_LABEL = { profil: 'Profil', corps: 'Corps', activite: 'Activité', historique: 'Historique', objectif: 'Objectif' } as const;

export const WARM_START_TEXT = {
  used: 'Ton historique récent a été utilisé pour affiner cette première estimation.',
  conflict: 'Tes données récentes diffèrent de notre estimation théorique. Wheighty leur donne du poids, mais continuera à vérifier cette estimation avec tes prochaines pesées.',
  insufficient_duration: 'Ton historique couvre moins de 7 jours : Wheighty part de son estimation théorique et l’affinera avec tes pesées.',
  missing_start_weight: 'Sans le poids du début de la période, ton historique ne permet pas encore d’affiner l’estimation. Tes pesées prendront le relais.',
  invalid: 'Ton historique n’a pas pu être utilisé. Wheighty part de son estimation théorique.',
} as const;

export const PROTEIN_RULE_TEXT: Record<string, string> = {
  base_1_2: 'Un apport adapté à un quotidien sans entraînement régulier.',
  trained_1_6: 'Ajustées à tes entraînements réguliers.',
  loss_1_6: 'Un apport plus élevé aide à préserver ta masse maigre pendant la perte.',
  loss_resistance_1_8: 'Tes protéines sont ajustées à ton objectif et à ton entraînement de résistance.',
  athlete_loss_ffm_2_3: 'Ajustées à ta masse maigre mesurée et à ton entraînement de résistance.',
  capped_2_2_actual: 'Plafonnées volontairement pour rester dans une zone raisonnable.',
};

export const PLAN_ERROR_TEXT: Record<string, string> = {
  invalid_profile: 'Certaines informations sont hors des limites prises en charge. Vérifie ton profil.',
  loss_unavailable_low_bmi: 'Avec ton poids actuel, Wheighty ne propose pas de perte de poids. Le maintien reste disponible.',
  target_bmi_too_low: 'Ce poids cible est trop bas pour ta taille. Choisis un objectif plus élevé.',
  target_not_below_current: 'Pour une perte, le poids cible doit être inférieur à ton poids actuel.',
  target_not_above_current: 'Pour une prise, le poids cible doit être supérieur à ton poids actuel.',
  no_feasible_speed: 'Aucune vitesse ne respecte les limites de sécurité pour ce profil. Essaie le maintien ou un objectif plus doux.',
  no_profile: 'Profil introuvable.',
  blocked: 'Ce réglage dépasse les limites de sécurité.',
  gate_not_met: 'Pas encore assez de données pour recalibrer.',
};

export const VALIDATION_FIELD_LABEL: Record<string, string> = {
  ageYears: 'Âge',
  heightCm: 'Taille',
  currentWeightKg: 'Poids',
  targetWeightKg: 'Poids cible',
  averageSteps7d: 'Pas',
  bodyFatPercent: 'Masse grasse',
};

// "Pourquoi ce résultat ?" (explanation of the actual calculation path)
export const REE_REASON_TEXT = {
  valid_calorimetry: 'Ta mesure par calorimétrie indirecte est récente et ton poids a peu changé depuis : elle est utilisée directement.',
  athlete_profile: 'Ton profil sportif (19 à 35 ans, au moins 6 h et 4 séances par semaine) oriente vers l’équation de ten Haaf, conçue pour des sportifs.',
  general_adult: 'Sans mesure de calorimétrie valide ni profil sportif, Wheighty utilise Mifflin-St Jeor, l’équation de référence chez l’adulte.',
} as const;
export const PAL_CATEGORY_TITLE = { inactive: 'Inactive', low_active: 'Peu active', active: 'Active', very_active: 'Très active' } as const;
export const MAINTENANCE_SOURCE_TEXT = {
  population: 'Estimation théorique seule, en attendant tes pesées.',
  warm_start: 'Estimation théorique combinée à ton historique, chacun pesé selon sa précision.',
  calibrated: 'Estimation recalibrée à partir de tes pesées.',
} as const;
export const TRACKING_QUALITY_SHORT: Record<TrackingQuality, string> = { high: 'Suivi alimentaire précis', medium: 'Suivi régulier, portions estimées', low: 'Suivi approximatif' };
export const HISTORY_UNUSED_TEXT = {
  insufficient_duration: 'Moins de 7 jours : trop court pour produire une estimation utile.',
  missing_start_weight: 'Poids de départ non renseigné : la variation de poids est inconnue, l’historique ne peut pas produire d’estimation.',
  invalid: 'Valeurs hors des limites prises en charge : historique non utilisé.',
} as const;
export const LIMITING_RULE_TEXT = {
  above_guardrail_cap: 'Limité par le garde-fou lié à ton IMC actuel.',
  below_hard_floor: 'Limité pour respecter ton plancher calorique.',
  macro_infeasible: 'Limité car les macros minimales ne tiendraient plus dans les calories.',
  solver_not_converged: 'Limité car le calcul ne convergeait pas à cette vitesse.',
  bmi_guardrail: 'garde-fou lié à l’IMC',
} as const;

/** "Pourquoi ce résultat ?" digest (D-30). Copy of the sources and "pourquoi pas" blocks validated with the product owner. */
export const WHY_TEXT = {
  comparisonTitle: 'Ton maintien estimé',
  theoretical: 'Estimation théorique',
  history: 'Ton historique',
  retained: 'Maintien retenu',
  weighIns: 'Tes pesées',
  sourcesTitle: 'Ce qui compte dans ce résultat',
  gateTitle: 'Ce qui fera bouger ce chiffre',
  gateIntro: 'Tes pesées affineront cette estimation. Wheighty pourra la recalibrer dès que ces quatre repères seront atteints :',
  gateMet: 'Les quatre repères sont atteints : chaque nouvelle pesée continue d’affiner l’estimation.',
  /** Estimand of the calibration (IMPLEMENTATION_NOTES D-31): apparent maintenance, never a measured expenditure. */
  apparentMaintenance: 'Ton maintien estimé, c’est ce qui stabilise ton poids quand tu suis ton plan comme tu le fais d’habitude. Ce n’est pas une mesure de ta dépense.',
  palBoundary: 'Tu es proche d’un changement de niveau d’activité : ton estimation de départ est plus incertaine. Tes pesées la préciseront.',
} as const;

export function sourcesSentence(historyFraction: string): string {
  return `Ton historique compte pour environ ${historyFraction} de ce résultat. Le reste vient de l’estimation théorique.`;
}

/** Active signals listed in the scientific details only (never in the digest). */
export const SIGNAL_LABEL = {
  pal_boundary: 'PAL proche d’une frontière de catégorie',
  low_confidence: 'confiance faible',
  incoherent: 'historique hors borne de cohérence (signal sans effet sur le calcul)',
  conflict: 'conflit entre historique et estimation théorique',
  delta_clamped: 'paramètre d’activité de Hall ramené à 0',
  rate_adjusted: 'vitesse ajustée par un garde-fou',
} as const;

export const SIGMA_REASON_LABEL: Record<string, string> = {
  palBoundaryFlag: 'PAL proche d’une frontière',
  physicalOccupation: 'métier physique',
  reeModelDisagreement: 'désaccord entre équations de REE',
  defaultActivityCadence: 'cadence par défaut d’une activité',
};

export const GATE_CRITERION_LABEL = {
  weighIns: 'Pesées',
  span: 'Durée couverte',
  cleanWeighIns: 'Pesées hors écarts importants',
  adherence: 'Journées notées',
} as const;
