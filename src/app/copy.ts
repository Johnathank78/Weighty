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

/** Food journal (J-01 to J-04). Display only; nothing here judges the amounts logged. */
export const JOURNAL_TEXT = {
  title: 'Journal',
  eyebrow: 'Facultatif, pour information',
  meals: 'Mes repas',
  logged: 'Saisi',
  planTarget: 'Cible du plan',
  empty: 'Aucun aliment pour ce jour. Le journal est facultatif : rien ne change dans ton plan.',
  partialMacros: 'Certains aliments n’indiquent pas toutes les macros : les totaux couvrent les valeurs connues.',
  add: 'Ajouter un aliment',
  added: 'Ajouté au journal.',
  removed: 'Aliment retiré.',
  undo: 'Annuler',
  todayLink: 'Journal alimentaire',
  todayEmpty: 'Facultatif',
  /**
   * Guidance on how complete a food log should be: provided by the product owner, not written here.
   * The journal screen shows it as soon as it is set; while null, nothing is displayed.
   */
  completenessGuidance: null as string | null,
} as const;

/** Journal UI pass (J-05 to J-08): neutral gauges, time of consumption, merged search, barcode. */
export const JOURNAL_GAUGE_TEXT = {
  logged: (kcal: string) => `${kcal} kcal saisies`,
  target: (kcal: string) => `Cible ${kcal} kcal`,
  remaining: (kcal: string) => `${kcal} kcal restantes`,
  // Beyond the target: same bar, same colour, factual wording only.
  beyond: (kcal: string) => `${kcal} kcal au-delà de la cible`,
  macros: { proteinG: 'Protéines', carbsG: 'Glucides', fatG: 'Lipides' },
} as const;

/** Portions (J-12): suggested by the product record, or a unit weight typed once and remembered. */
export const PORTION_TEXT = {
  serving: 'Portion indiquée',
  package: 'Paquet entier',
  unit: '1 unité',
  sourceNote: 'Portions indiquées par Open Food Facts, à vérifier sur le paquet.',
  unitQuestion: 'Poids d’une unité ?',
  remember: 'Retenir',
} as const;

/** Masking entries on screen (J-11): display only, nothing is changed in the journal. */
export const JOURNAL_MASK_TEXT = {
  start: 'Masquer des aliments dans les jauges',
  done: 'Terminer le masquage',
  hint: 'Touche l’œil d’un aliment pour le masquer des jauges. Rien n’est modifié, tout réapparaît en quittant le journal.',
  hide: (name: string) => `Masquer ${name}`,
  show: (name: string) => `Afficher ${name}`,
  maskedKcal: (kcal: string) => `${kcal} kcal masquées`,
} as const;

export const JOURNAL_TIME_TEXT = {
  justAte: 'Je viens de le manger',
  eatenAt: 'Mangé à',
  savedYesterday: 'Ajouté au journal d’hier.',
} as const;

export const FOOD_SEARCH_TEXT = {
  tabs: { products: 'Produits', manual: 'Libre' },
  placeholder: 'Pomme, riz cuit, yaourt...',
  emptyQuery: 'Tape un aliment, même hors connexion.',
  emptyQueryOnline: 'Tape un aliment ou scanne un code-barres.',
  recents: 'Récents',
  mine: 'Mes aliments',
  noLocalResult: 'Aucun aliment générique trouvé.',
  searchOnline: 'Chercher aussi les produits emballés',
  searchingOnline: 'Recherche des produits emballés...',
  onlineOff: 'Produits emballés et code-barres : active la recherche en ligne dans les préférences.',
  loadingTable: 'Chargement de la table...',
  tableFailed: 'La table des aliments n’a pas pu être chargée. La saisie libre reste disponible.',
  offAttribution: 'Produits emballés : données Open Food Facts, licence ODbL.',
} as const;

export const BARCODE_TEXT = {
  open: 'Scanner un code-barres',
  close: 'Fermer le scanner',
  starting: 'Ouverture de la caméra...',
  scanning: 'Vise le code-barres du produit.',
  unsupported: 'La lecture par caméra n’est pas disponible sur ce navigateur. Tape le code-barres.',
  denied: 'La caméra n’est pas autorisée. Tu peux taper le code-barres, ou l’autoriser dans les réglages du navigateur.',
  error: 'La caméra n’a pas pu démarrer. Tape le code-barres.',
  manualLabel: 'Code-barres',
  manualPlaceholder: 'Chiffres sous les barres',
  lookup: 'Chercher',
  looking: 'Recherche du produit...',
} as const;

export const FOOD_SOURCE_LABEL ={ ciqual: 'Ciqual', off: 'Open Food Facts', manual: 'Saisie libre' } as const;

export const PRODUCT_SEARCH_TEXT = {
  settingTitle: 'Recherche de produits en ligne',
  settingHint: 'Produits emballés via Open Food Facts. Désactivée par défaut.',
  consentTitle: 'Activer la recherche de produits ?',
  consentLead: 'Pour trouver un produit emballé, Wheighty interroge Open Food Facts, une base collaborative en ligne. C’est la seule fonction de l’app qui utilise internet.',
  consentSent: 'Ce qui est envoyé : uniquement le code-barres ou les mots que tu recherches.',
  consentNeverSent: 'Ce qui n’est jamais envoyé : ton profil, ton poids, ton journal, ni aucun identifiant.',
  consentIp: 'Comme pour tout site web, Open Food Facts voit l’adresse IP de ta connexion.',
  consentOffline: 'Sans connexion, ou si tu la désactives, la table Ciqual et la saisie libre restent disponibles.',
  consentConfirm: 'Activer',
  consentCancel: 'Plus tard',
  clearCache: 'Vider « Mes aliments »',
  cacheCleared: '« Mes aliments » vidé. Ton journal ne change pas.',
  disabledNote: 'La recherche de produits emballés est désactivée. Tu peux l’activer dans les préférences.',
  openSettings: 'Ouvrir les préférences',
} as const;

export const OFF_RESULT_TEXT = {
  offline: 'Pas de connexion. La table Ciqual et la saisie libre restent disponibles.',
  timeout: 'Open Food Facts ne répond pas pour le moment. Réessaie plus tard ou utilise la saisie libre.',
  unavailable: 'Open Food Facts est indisponible pour le moment. Réessaie plus tard ou utilise la saisie libre.',
  rateLimited: (seconds: number) => `Trop de recherches d’affilée pour Open Food Facts. Réessaie dans ${seconds} s.`,
  notFound: 'Ce produit n’est pas dans Open Food Facts. Tu peux le saisir à la main.',
  noResults: 'Aucun produit trouvé.',
  invalidBarcode: 'Un code-barres compte 8, 12, 13 ou 14 chiffres.',
  invalidTerms: 'Tape au moins 2 caractères.',
  incomplete: 'Les calories de ce produit ne sont pas renseignées dans Open Food Facts : il ne peut pas être ajouté tel quel.',
  disabled: 'La recherche de produits est désactivée.',
} as const;

export const DATA_SOURCES_TEXT = {
  title: 'Sources des données',
  ciqual: 'Aliments génériques : Anses. 2025. Table de composition nutritionnelle des aliments Ciqual 2025 (doi 10.57745/RDMHWY), licence Etalab 2.0. Seules l’énergie et les macronutriments sont repris.',
  off: 'Produits emballés : Open Food Facts (openfoodfacts.org), base sous licence Open Database License (ODbL), contenus sous Database Contents License (DbCL). Les images des produits ne sont pas utilisées.',
} as const;
