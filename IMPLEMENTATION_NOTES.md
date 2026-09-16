# Wheighty v1, notes d'implémentation

Journal technique et scientifique de l'implémentation. Toute décision qui n'est pas écrite telle quelle dans `instruct/` est listée ici avec sa justification. Aucune déviation scientifique n'est silencieuse.

- Modèle scientifique : `SCIENTIFIC_MODEL_VERSION = "1.3.0"` (`src/science/constants.ts`) : maintien apparent comme estimande (D-31), plancher calorique sexué (D-32), plancher d'incertitude structurelle de la calibration (D-33), recalibrations espacées d'au moins 7 jours (D-34), calibration hors du fil principal (P-01)
- Schéma de stockage : `SCHEMA_VERSION = 3` (`src/domain/types.ts`), migrations 1 → 2 et 2 → 3 (journal alimentaire, J-01) dans `src/persistence/migrations.ts`

Depuis la passe « science + onboarding + warm start » (modèle 1.1.0), les fichiers `instruct/` ont été mis à jour pour refléter les décisions finales ; ils ne contredisent plus ces notes (`instruct/05` s17 et `instruct/08` réalignés sur le modèle 1.2.0 en P3, D-30). La section 9 résume ce qui a changé par rapport au modèle 1.0.0, la section 10 par rapport au modèle 1.1.0, la section 11 par rapport au modèle 1.2.0 (passe bêta).

---

## 1. Architecture

```text
src/
  science/        Fonctions pures, sans React ni stockage. Toute la science est ici.
    constants.ts    Constantes catégorisées + registre CONSTANT_METADATA
    types.ts        Types du contrat de données (07)
    activityTable.ts Table MET embarquée (Compendium 2024 adulte et 60+)
    ree.ts nasem.ts activity.ts neat.ts tef.ts macros.ts
    goals.ts        Moteur d'objectifs, vitesse continue, solveur 42 jours, projection, slider
    hall/model.ts   Modèle dynamique adulte de Hall 2011 (TEF natif, sous-pas RK4 si raide)
    hall/solver.ts  Bissection déterministe
    trend.ts calibration.ts uncertainty.ts validation.ts assessment.ts dates.ts
    warmStart.ts    Démarrage à chaud : historique calorique déclaré -> posterior initial
  domain/         Cas d'usage purs : pont unique entre stockage et science
    engine.ts       Onboarding (avec warm start), logs, pesées, slider pas, modèle du slider de vitesse, calibration
    views.ts        View-models d'écran (sélection, agrégation, arrondi d'affichage, progression de la porte)
    explain.ts      View-model « Pourquoi ce résultat ? » : chemin de calcul réel, sans formule nouvelle (D-25)
    format.ts       Arrondis d'affichage, unités, dates françaises
    onboarding.ts   Brouillon d'onboarding (un écran par information, sections), validation, évidence historique
    types.ts        Store persisté (WheightyStore, CurrentPlan, Preferences, AppMeta)
  persistence/    localStorage versionné, migrations, validation, export/import
  store/          Provider React (état + sauvegarde), calibration dans un Web Worker avec repli synchrone (P-01)
  app/            Navigation (historique navigateur), copy français, App
  screens/        Écrans et bottom sheets
  components/     Contrôles accessibles, slider de vitesse, bottom sheet, navigation, graphique SVG, mascotte
  hooks/          Thème, PWA (service worker, installation)
  styles/         Tokens Warm Precision (clair/sombre) et styles
tests/
  science/ domain/ persistence/ policy/ helpers/ fixtures/
tools/
  prepare-mascots.mjs         Images web de la mascotte (assets/web/) dérivées des sources canoniques de assets/
  generate-icons.mjs          Icônes PWA dérivées de assets/web/mascot-normal.png
  hall-reference/bw_reference.py  Référence de validation du modèle de Hall
```

La maquette Claude Design d'origine (`reference/claude-design/`), le prompt d'implémentation initial (`instruct/CLAUDE_CODE_PROMPT.md`), et le manifeste `instruct/MANIFEST.md` ont été retirés du dépôt ; ils restent dans l'historique Git (commit `37fa35d`).

Frontières garanties par test (`tests/policy/static.test.ts`) :

- les couches UI (`screens`, `components`, `app`, `hooks`, `store`) n'importent de `science/` que `types`, `constants` et `dates` ;
- `science/` n'importe ni React, ni le DOM, ni la persistance ;
- aucun `fetch`, XHR, WebSocket, beacon, URL distante, Google Fonts, cloud ou plateforme santé, **sauf** dans l'adaptateur nommé `src/adapters/openFoodFacts.ts`, opt-in (J-03).

### Décisions techniques

| Sujet | Choix | Raison |
|---|---|---|
| Build | Vite 8, React 19, TypeScript 6 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) | Stack demandée, typage strict des unités |
| Tests | Vitest 5, environnement node ; écrans d'onboarding rendus en HTML statique avec `react-dom/server` | Tests purs et rapides, sans dépendance DOM supplémentaire |
| PWA | vite-plugin-pwa (generateSW, `registerType: prompt`) | Précache complet, mise à jour proposée dans l'app |
| GitHub Pages | `base: './'`, manifest `start_url`/`scope` `./`, SW relatif | Fonctionne sous `https://<user>.github.io/<repo>/` sans configuration ; `WHEIGHTY_BASE` permet un base absolu |
| Navigation | État React + `history.pushState` (bouton retour Android), pas de routeur ni d'URL profonde | Aucune 404 possible sur Pages, bundle léger |
| État | Contexte React + fonctions de domaine pures | Pas de gestionnaire d'état lourd |
| Graphiques | SVG écrit à la main | Pas de librairie de graphiques |
| Police | Inter variable via `@fontsource-variable/inter` pour le texte ; Bricolage Grotesque variable via `@fontsource-variable/bricolage-grotesque` (`--font-display`) pour les titres d'écran seulement (`.h-screen`, `.h-page`, `.h-flow`). Sous-ensembles latin et latin-ext, fichiers locaux précachés | Fidélité à la maquette, personnalité des titres, fonctionnement hors ligne sans ressource distante |
| Mascotte | Sources canoniques dans `assets/` (jeu refait : normal, heureux, search, surpris, clin, sleepy, empty, celebrate). `tools/prepare-mascots.mjs` en dérive `assets/web/` : recadrage sur un cadre transparent commun, corps à la même taille et à la même position dans chaque variante (hauteur de l'illustration pour `search`, dont la base est plus large), 480 px de large. `focus` et `curieux`, non reconduites, sont remplacées par `search` (sens le plus proche : observer, chercher). Plus de légende intégrée, donc plus de recadrage CSS | Pas de redessin ; 19 à 44 Ko par image au lieu de 280 à 955 Ko pour les sources, précache PWA de 1 502 à 1 048 Kio |
| Icônes PWA | `tools/generate-icons.mjs` centre `assets/web/mascot-normal.png` sur le fond `#F8F5F1` | Icônes carrées requises par le manifest, illustration inchangée |
| Contraste | `--ink2` passe de `#77716B` à `#736D67` en clair | Contraste AA du texte secondaire, écart visuel imperceptible |
| Rappel de pesée | État « pesée recommandée » dans l'app, sans notification | 07 s12 |

---

## 2. Modules scientifiques

| Spec | Fichier | Tests |
|---|---|---|
| 01 s1, 07 s8 domaine et bornes | `science/validation.ts` | `ree.test.ts`, matrice de propriétés |
| 01 s3 à s6 routeur REE | `science/ree.ts` | `ree.test.ts` |
| 01 s7 NASEM 2023 | `science/nasem.ts` | `nasemTef.test.ts` (8 équations, exemples officiels 2275 et ~3041) |
| 01 s9, 05 s2-s3 incertitude initiale | `science/uncertainty.ts` | golden, matrice de propriétés |
| 02 s2 à s7 pas, exercice, chevauchement, posture, PAL | `science/activity.ts`, `activityTable.ts` | `activity.test.ts`, `domain/onboarding.test.ts` (activités proposées, chevauchement) |
| 02 s8 NEAT résiduel | `science/neat.ts` | `activity.test.ts` |
| 02 s9 TEF (affichage, décomposition) | `science/tef.ts` | `nasemTef.test.ts` (250,75 kcal, régression « pas de TEF complet sur EER ») |
| 03 macros, poids de référence continu | `science/macros.ts` | `macros.test.ts` (400 profils, continuité IMC 25 et 30, classe mixte) |
| 04 s1 modèle de Hall, TEF natif | `science/hall/model.ts` | `hall.test.ts` (14 scénarios de référence, stabilité, TEF, raideur) |
| 04 s2 à s6 vitesse continue, garde-fous, solveur | `science/goals.ts`, `hall/solver.ts` | `goals.test.ts`, `domain/onboarding.test.ts` |
| 04 s7 projection | `science/goals.ts` (`projectPlan`) | `goals.test.ts`, golden |
| 04 s8 à s10 slider pas | `science/goals.ts` (`solveSliderPoint`, `effectiveMinSliderSteps`) | `goals.test.ts`, `domain/engine.test.ts` |
| 05 s5 tendance | `science/trend.ts` | `calibration.test.ts` |
| 05 s6 à s13 calibration | `science/calibration.ts` | `calibration.test.ts` (récupération idéale à 28 et 42 jours), `calibrationMismatch.part1/2.test.ts` |
| 05 s11 confiance | `science/calibration.ts` | `calibration.test.ts` |
| 05 s17 warm start | `science/warmStart.ts`, `science/normal.ts`, `domain/engine.ts` | `domain/warmStart.test.ts`, `science/warmStartDomain.test.ts`, `science/warmStartExactRules.test.ts`, `domain/warmStartReferenceCases.test.ts` |
| Explication du résultat, porte de recalibration (affichage) | `domain/explain.ts`, `domain/views.ts` (`gateProgress`, `gateCriterionValue`), `components/ResultExplanationView.tsx` | `domain/explainAndScreens.test.ts`, `domain/explanationPanel.test.ts` |
| 06 s15 matrice aléatoire | `tests/helpers/propertyMatrix.ts` | 4 fichiers × 2 500 profils acceptés, sans exemption |
| 06 s16 golden | `tests/science/golden.test.ts` | 12 profils, snapshot de chaque couche |
| 07 s7 constantes | `science/constants.ts` | `constants.test.ts` (registre complet + non-régression) |

### Résultats de validation mesurés (modèle 1.3.0)

- **Modèle de Hall** (validation du portage numérique contre `bw`, pas une validation biologique indépendante, D-02) : écart maximal sur 14 scénarios de 0,0097 kg à 90 jours, 0,0085 kg à 180 jours, 0,0064 kg à 365 jours (tolérances 0,20 / 0,35 / 0,50 kg). Le mode validé est exactement le mode de production. Dérive à l'équilibre inférieure à 0,05 kg sur 30 jours.
- **Récupération de calibration, monde idéal** (T-03, 126 utilisateurs synthétiques, vérité = offset apparent, D-31) : erreur médiane 92 / 46 / 30 / 17 kcal/j à 28 / 42 / 84 / 120 jours, biais entre −2 et +9, couvertures 80 % de 0,91 à 0,99 et 95 % de 0,98 à 1,00. Tous les critères sont atteints, y compris aux horizons longs ajoutés en 1.3.0.
- **Benchmark avec model mismatch** (T-04, 42 et 84 jours) : 11 cas sur 12 atteignent les trois critères ; seul le scénario combiné F à 42 jours manque la couverture 95 % (0,88). Documenté, sans réglage.
- **Parcours de convergence** (`tests/domain/convergenceJourney.test.ts`, D-34) : au plus une recalibration par semaine, cible jamais sous le plancher, offset apparent dans la fourchette 95 % finale.
- **Matrice de propriétés** : 10 000 profils acceptés, aucun NaN ni Infinity, aucune cible sous le plancher, macros réconciliées à ±5 kcal, continuité de la projection sous perturbation de 0,1 kg **sans aucune exemption** (l'ancienne exclusion autour d'IMC 30 a disparu).
- **Warm start** (profils de `domain/warmStart.test.ts`, historiques générés avec le modèle de production) : voir D-23.

---

## 3. Décisions et déviations documentées

Chaque entrée indique si c'est une **déviation** (écart assumé à la lettre de la spec d'origine), une **interprétation** (spec muette ou ambiguë), un **complément** (valeur absente de la spec, sourcée) ou une **décision validée** (tranchée par le patch 1.1.0 et reportée dans `instruct/`).

### D-01 TEF dans le modèle de Hall (décision validée, modèle 1.1.0)

Le modèle adulte de Hall et al. 2011 (NIDDK Body Weight Planner, package `bw`) représente la thermogenèse alimentaire par son terme natif `β_TEF × (EI − EI_baseline)` avec β_TEF = 0,10. C'est l'unique mode de production pour la résolution d'objectif, les projections, le slider calories / pas et la calibration.

- Le mode `macro_specific` du modèle 1.0.0 (TEF par macro greffé sur la structure 2011) est **supprimé** du code, pas seulement désactivé : `HallDailyInput` ne contient plus aucun champ TEF et `hall/model.ts` n'importe pas `tef.ts`. Aucun double comptage n'est possible ; des tests le vérifient (structure de l'entrée, source du modèle, trajectoires identiques pour des plans de mêmes calories et glucides mais de protéines différentes).
- Les coefficients 0,25 / 0,075 / 0,025 restent dans `tef.ts` pour l'affichage explicatif, la décomposition énergétique, les diagnostics et les tests isolés. Ils ne modifient plus la trajectoire.
- La composition en macros n'agit sur le modèle qu'à travers les glucides (glycogène et eau).
- Le modèle macronutriments complet de Hall 2006/2010 n'est pas porté.

Conséquences mesurées : un plan de maintien vaut maintenant exactement le maintien (avant, un TEF par macro inférieur à 10 % abaissait la cible de 20 à 50 kcal/j) ; les cibles de perte ou de prise bougent de −10 à +53 kcal/j sur les profils golden.

### D-02 Référence de validation du modèle de Hall (complément)

Aucune sortie faisant autorité n'est exploitable hors ligne (le Planner NIDDK n'est pas scriptable, R n'était pas installé). La référence est `tools/hall-reference/bw_reference.py`, transcription ligne à ligne de `adult_weight.cpp` du package `bw` (INSP-RH, licence MIT, fondé sur Chow & Hall 2008, Hall 2010, Hall et al. 2011), avec son schéma numérique propre (RK4 séquentiel). La licence MIT est reproduite dans le fichier. `bw` ne permet pas de changer l'activité physique : les scénarios de changement d'activité utilisent une extension unique et documentée (`pa_delta` ajouté au paramètre δ). Les fixtures sont dans `tests/fixtures/hall-reference.json` et se régénèrent avec `python tools/hall-reference/bw_reference.py > tests/fixtures/hall-reference.json`.

Limite assumée : la référence partage les équations publiques avec le port. C'est une validation du portage numérique, pas une validation biologique indépendante. `instruct/06` s11 prévoit une section pour ajouter plus tard des comparaisons manuelles au Body Weight Planner du NIDDK ; cette passe n'en dépend pas.

### D-03 Initialisation du modèle de Hall en production (interprétation)

- Apport de base = maintien Wheighty (NASEM, warm start ou calibré), RMR de base = REE du routeur, poids = tendance ou poids d'onboarding (04 s1).
- `δ = ((1 − β_TEF) × EI_b − RMR) / BW`, comme l'initialisation publiée. Si δ est négatif (maintien × 0,9 < REE), il est ramené à 0 et `K` absorbe l'écart pour garder l'équilibre exact.
- Masse grasse initiale : équation de Jackson et al. 2002 (celle du modèle), avec un plancher numérique de 2 % du poids. Une mesure de masse grasse de qualité ≥ 0,85 (4C, BodPod, DXA, D-09) la remplace.
- ECF initial : équation de Silva utilisée par le modèle. Sodium constant.

### D-04 Table MET et valeurs 60 à 65 ans (complément)

Valeurs de 02 s3 reprises telles quelles quand la spec les donne. Valeurs absentes (rameur, randonnée, sports collectifs, autre, marche structurée) extraites du PDF officiel **2024 Adult Compendium** (codes cités dans `activityTable.ts`). Pour 60 à 65 ans, valeurs MET60 extraites du **2024 Older Adult Compendium** quand l'entrée existe ; sinon la valeur adulte est utilisée avec la base 3,5 ml/kg/min. Remarque : la spec suggère 9,3 MET pour le vélo intense ; l'entrée 2024 la plus proche (01017) vaut 9,0. La valeur de la spec est conservée. « Autre » est routé vers une catégorie générique documentée (exercice en club).

### D-05 Cadences des activités à dominante de pas (décision validée pour la v1)

- Course : 160 pas/min, `RUNNING_CADENCE_STEPS_PER_MIN`, **engineering_prior**.
- Marche structurée (anciens profils seulement, voir D-24) : cadence de l'allure correspondant à l'intensité (80 / 100 / 120, ou 80 / 100 / 115 après 60 ans).
- Randonnée / marche sportive (anciens profils seulement depuis la passe UX v2, D-24) et sports collectifs : pas de cadence spécifique, on prend celle de l'allure habituelle et on élargit l'incertitude (02 s5) avec `DEFAULT_CADENCE_SIGMA_MULTIPLIER = 1,15`, **engineering_prior**.

Ces valeurs ne sont jamais présentées comme des constantes physiologiques universelles (test sur leur catégorie). Aucun champ « cadence de course » n'est demandé à l'onboarding. **À valider** ultérieurement.

### D-06 Drapeau de désaccord REE (interprétation)

Deux équations FFM sont calculées (ten Haaf FFM et Cunningham) quand la méthode l'autorise (4C, BodPod, DXA, pli cutané). Le drapeau utilise l'équation qui correspond à la population de la route principale : ten Haaf FFM pour un profil sportif, Cunningham sinon. Aucune moyenne. Une calorimétrie non valide est gardée comme référence secondaire, sans déclencher le drapeau.

### D-07 Bornes de plausibilité supplémentaires (complément)

- IMC entre 16 et 70 : l'équation de Jackson devient négative sous 15 chez l'homme jeune.
- 21 séances/semaine et 360 min/séance au maximum par activité (en plus des 1 800 min/semaine de 07 s8).
Ce sont des bornes logicielles, pas des normes de santé.

### D-08 Plausibilité de la masse maigre (complément)

La masse maigre est jugée plausible entre 35 et 97 % du poids avant tout usage (contrôle REE, surcharge protéines, disponibilité énergétique).

### D-09 Masse grasse dans le modèle de Hall (interprétation)

Seules les méthodes de qualité ≥ 0,85 (4C, BodPod, DXA) initialisent la masse grasse du modèle. Le pli cutané, l'impédancemètre et l'estimation personnelle laissent l'équation de Jackson.

### D-10 Poids de départ inconnu dans la calibration (décision validée)

Le poids réel au début de la fenêtre est un paramètre de nuisance, marginalisé sous un prior plat sur une grille de ±3 kg par pas de 0,05 kg (`CALIBRATION_INTERCEPT_*`). La première pesée brute n'est pas traitée comme une vérité exacte et aucun second prior ne la compte deux fois. Le posterior reste en une dimension sur l'offset. Ce mécanisme est inchangé et désormais écrit dans `instruct/05` s9.

Détails de la fenêtre :

- elle va de la première à la dernière pesée valide (une pesée par jour, la plus récente) ;
- chaque jour utilise la cible calorique, les glucides et les pas du log du jour ; à défaut, le log antérieur le plus proche ;
- pas pris en compte : pas réels si saisis, sinon cible du jour (05 s7) ;
- poids d'une observation : moyenne des poids journaliers sur les jours qui la précèdent (du jour de la pesée précédente inclus au jour de la pesée exclu) ;
- poids journalier : adhérence × 0,7 si les pas manquent. La première pesée a un poids de 1 ;
- un jour sans macros stockées garde la part de glucides de la diète de base (D-16). En 1.0.0, ce cas (qui ne se produit pas dans l'app) utilisait 50 % ; il est aligné sur D-16.

### D-11 Fenêtre « dominée par des écarts importants » (interprétation)

Une pesée est « propre » si au plus 50 % des jours de sa fenêtre sont notés « écart important » (`GATE_MAJOR_DOMINATION_FRACTION`). La couverture d'adhérence se calcule sur les jours compris entre la première et la dernière pesée, bornes incluses.

### D-12 Taux de tendance affiché (complément UI)

`kg / semaine` = différence entre la tendance EWMA actuelle et la dernière valeur de tendance datant d'au moins 7 jours, ramenée à la semaine. Il faut au moins 3 pesées. Affichage seulement, jamais utilisé pour la calibration.

### D-13 Extensions du contrat de données (complément, schéma 2)

Champs optionnels ou ajoutés, validés à l'import :

- `DailyLog.macrosForDay` : macros exactes du jour, pour reconstruire les glucides historiques sans le plan du jour ;
- `UserProfile.firstName` / `lastName` (passe UX v2, sans changement de schéma) : chaînes facultatives de 60 caractères au plus, affichage local seulement (initiales, titre du profil), jamais lues par le moteur ni envoyées. Pas de montée de schéma : le champ est facultatif, un store sans nom reste valide, et un lecteur de schéma 2 antérieur valide le profil sans retirer les clés inconnues (`isUserProfile` ne reconstruit pas l'objet) ;
- `UserProfile.weeklyRateTarget` (schéma 2) remplace `speedPreset` : vitesse demandée en fraction du poids par semaine, 0 en maintien (D-22) ;
- `CurrentPlan` : `macrosDisplay`, `planWeightKg`, `targetWeightKg`, `requestedWeeklyRate` (schéma 2, remplace `speedPreset`/`appliedSpeed`), `maintenanceStepsPerDay`, `baselineStepTarget`, `baselineCalorieTarget`, `populationTdeeKcal`, `personalOffsetKcal`, `hardFloorKcal`, `warnings`, `proteinRule`. `macros` reste en pleine précision (07 s4) ;
- `CalibrationSnapshot` : `populationTdeeKcal`, `appliedAt`, `source` (`'warm_start'` pour le posterior issu de l'historique, absent pour les pesées) ;
- `WheightyStore.historicalEvidence` (schéma 2) : évidence historique du warm start, `null` sinon (D-23) ;
- `WheightyStore.meta` : estimation initiale affichée (population ou warm start, pour « depuis l'estimation initiale »), catégorie PAL figée, dernière recalibration montrée, trace des données illisibles récupérées.

Des logs sont créés pour chaque jour depuis l'onboarding, avec les cibles du plan en vigueur. Un changement de plan n'actualise que le jour courant, jamais les jours passés (07 s5).

**Migration 1 → 2** : `speedPreset` du profil devient `weeklyRateTarget` via la table figée des anciens presets (perte 0,25 / 0,5 / 0,75 %, prise 0,10 / 0,25 / 0,40 %, maintien 0) ; `speedPreset`/`appliedSpeed` du plan deviennent `requestedWeeklyRate` (la vitesse réellement appliquée était déjà dans `weeklyRateTarget`) ; `historicalEvidence: null` est ajouté. Pesées, logs, snapshots, préférences, méta et version scientifique des plans existants sont conservés tels quels. Le changement de schéma est nécessaire : l'ancien moteur ne connaît pas la vitesse continue, et un lecteur de schéma 1 supprimerait silencieusement `historicalEvidence` en revalidant le store ; avec le schéma 2, il refuse la version future et préserve les données brutes. Tests : migration d'un store, import d'un export de schéma 1, maintien et prise.

### D-14 Classe « mixte » des macros (décision validée)

Définition officielle v1 : `mixed = critère de résistance rempli ET volume d'endurance ≥ 150 min/semaine`. `endurance` exige en plus moins de 2 séances de force par semaine. Le code appliquait déjà exactement cette règle ; seule la documentation (03 s5) a été corrigée.

### D-15 Confiance pour une largeur ≤ 300 kcal sans les critères « élevée » (interprétation)

05 s11 ne classe pas le cas « porte franchie, largeur 80 % ≤ 300 kcal, mais moins de 28 jours ou 8 pesées ». Il est classé « bonne », ce qui garde la monotonie exigée par 06 s14.

### D-16 Part de glucides de la diète de base du modèle de Hall (décision validée)

Le modèle suit le glycogène et l'eau selon l'apport glucidique relatif à la diète de base. Avec une base fixe à 50 %, adopter la répartition recommandée (souvent 55 à 60 %) ferait prendre de l'eau, que le solveur à 42 jours compenserait comme du tissu (environ −40 kcal/j sur un plan de maintien). La part de glucides de base est donc celle des macros du plan au niveau du maintien (même règle en calibration). Pour l'historique du warm start, dont la composition est inconnue, c'est la composition du plan de maintien (indépendante de l'objectif). Décision reportée dans `instruct/04` s1. `HALL_BASELINE_CARB_FRACTION = 0,5` ne sert plus que de repli.

### D-17 Maintien après calibration (interprétation)

L'offset personnel est estimé par rapport au NASEM au poids de début de fenêtre. Le plan recalibré utilise `NASEM(poids tendance actuel, catégorie PAL figée) + offset médian`, et l'intervalle 80 % correspond aux quantiles du posterior décalés de la même façon. `CalibrationSnapshot.calibratedTdeeMedian` suit la formule de 05 s10 (NASEM de début + médiane). La recalibration n'est jamais appliquée sans confirmation, et une recalibration montrée sert de référence aux seuils d'affichage (05 s12). L'offset du warm start (D-23) est le même paramètre, référencé au NASEM du poids de début d'historique.

### D-18 Disponibilité énergétique (interprétation)

« Charge d'entraînement élevée » = profil sportif, ou au moins 6 h/semaine d'entraînement structuré. La dépense d'exercice retenue est l'énergie nette moyenne quotidienne avant correction du chevauchement. Signal de prudence seulement, jamais un diagnostic.

### D-19 Plans infaisables (interprétation)

Si aucune vitesse ne passe le plancher, ne rend les macros faisables ou ne converge, aucun plan n'est enregistré. L'interface propose de modifier l'objectif ou de passer en maintien.

### D-20 Arrondi du slider pas (conforme 04 s10)

Le slider travaille par pas de 100. Chaque position est résolue sur la valeur arrondie, puis enregistrée en pleine précision. La borne basse effective est le plus petit nombre de pas dont les calories restent au-dessus du plancher avec des macros faisables.

### D-21 Poids nutritionnel de référence continu (décision validée, modèle 1.1.0)

L'ancienne règle discontinue (poids réel sous IMC 30, poids d'IMC 25 au-delà) est supprimée. Nouvelle règle :

```text
bmi25_weight = 25 × taille_m²
reference = poids                                        si poids ≤ bmi25_weight
reference = bmi25_weight + 0,33 × (poids − bmi25_weight) sinon
```

- Utilisée partout où l'ancien poids de référence l'était : protéines, plancher de lipides (0,6 g/kg), drapeaux glucides endurance et résistance.
- La surcharge FFM de haute qualité (profil sportif, 4C/BodPod/DXA, perte avec résistance) garde sa priorité telle que prévue par 03 s2.
- `NUTRITION_REFERENCE_EXCESS_FRACTION = 0,33` est un **engineering_prior** documenté dans `CONSTANT_METADATA`, jamais présenté comme un « poids idéal ». Sa forme rappelle les poids ajustés utilisés en nutrition clinique, mais la valeur 0,33 est un choix Wheighty **à valider**.
- Continuité et monotonie testées autour d'IMC 25 et 30 pour 5 tailles ; continuité des protéines, lipides et glucides à ±0,01 kg ; la dérogation de la matrice de propriétés a disparu.
- Changement de comportement : entre IMC 25 et 30 la référence est désormais inférieure au poids réel (ex. golden 08 : 98,4 → 94,0 g de protéines), au-delà d'IMC 30 elle est supérieure à l'ancien poids d'IMC 25 (golden 05 : 105 → 120 g ; 06 : 124 → 142 g).

### D-22 Vitesse continue en pourcentage du poids (décision validée, modèle 1.1.0)

Les trois presets Douce / Modérée / Rapide sont remplacés par un slider continu dont la variable est la fraction du poids par semaine (pas de 0,05 %).

- Perte : 0,2 à 1,0 % / semaine, valeur initiale 0,5 %. Prise : 0,1 à 0,5 % / semaine (plage de prise existante de 04 s2), valeur initiale 0,25 %. Maintien : pas de slider, zone de maintien inchangée.
- Douce / Modérée / Rapide deviennent des zones qualitatives : perte < 0,375 % ≤ Modérée < 0,625 % ≤ Rapide ; prise < 0,175 % ≤ Modérée < 0,325 % ≤ Rapide (milieux entre les anciens presets, `ui_rounding_rule`).
- Garde-fous IMC existants traduits en bornes de vitesse : IMC < 20 perte indisponible ; 20 à 22 : 0,25 % max ; 22 à 25 : 0,5 % max ; ≥ 25 : maximum produit 1,0 %. Pour IMC ≥ 25, l'ancien « maximum sélectionnable par défaut » de 0,75 % devient un seuil de prudence : au-delà, la vitesse reste sélectionnable jusqu'au maximum produit mais une note « très exigeant » s'affiche (`LOSS_RATE_CAUTION_ABOVE`). **Décision d'interprétation à valider.**
- Le slider est connecté au moteur : `maxSelectableWeeklyRate` cherche la vitesse la plus rapide de la grille acceptée par le moteur (garde-fou IMC, plancher calorique, macros faisables, convergence) avec le maintien réellement utilisé (y compris le warm start). La zone au-delà est hachurée et inatteignable. Le moteur garde un repli explicite (`rateAdjusted`, message « Vitesse ajustée à X % ») si une vitesse enregistrée devient infaisable plus tard (poids de tendance différent).
- L'équivalent affiché `≈ kg / semaine` = vitesse × poids actuel (affichage seulement ; la cible à 42 jours reste `poids × (1 ± r)^6`).
- Même composant dans l'onboarding et dans la feuille « Changer d'objectif ».

### D-23 Warm start depuis l'historique calorique (décision validée, modèle 1.1.0)

Question facultative de l'onboarding « Tu suis déjà tes calories ? » (« Non » affiché et stocké par défaut). Non : comportement inchangé. Oui (écran suivant) : apport moyen, nombre exact de jours (un seul champ depuis la passe UX v2, plus de catégories de durée), poids au début (champ laissé vide s'il est inconnu, note « Laisse vide si tu ne le connais pas. », `startWeightKg: null`, jamais de valeur fabriquée), poids aujourd'hui (prérempli), qualité du suivi, activité comparable.

Principe : `prior populationnel + évidence personnelle historique = posterior initial`. La moyenne déclarée n'est jamais prise comme maintien.

- **Vraisemblance** : pour chaque offset du support d'évidence (depuis 1.2.0, D-29 : pas de 5, −3 000 à +3 000 borné par le domaine admissible de Hall ; la grille de calibration −1 200 à +1 200 en est un sous-ensemble et reçoit les mêmes valeurs), le modèle de Hall de production est initialisé à l'équilibre au poids de début avec `maintien = NASEM(poids de début, PAL figée) + offset`, nourri de l'apport moyen déclaré pendant la durée déclarée (glucides : part de la diète de maintien, pas en plus des pas habituels), puis la variation prédite est comparée à la variation déclarée. Vraisemblance gaussienne de variance `2 σ_pesée² + s² (σ_apport² + σ_activité² + σ_modèle²)`, `s` étant la sensibilité du modèle (kg par kcal/j).
- **Incertitudes** (`engineering_prior`, **à valider**) : pesée ponctuelle σ = 0,85 kg (écart-type du bruit Student-t de la calibration) à chaque extrémité ; apport : 10 % (pesée des aliments), 20 % (portions estimées), 30 % (approximation) de l'apport déclaré, erreurs aléatoires et systématiques confondues ; activité non comparable : +200 kcal/j ; plancher structurel du modèle : 100 kcal/j. Durée : son effet passe par la sensibilité du modèle (plus la période est longue, plus la variation de poids informe).
- **Données insuffisantes** : moins de 7 jours ou poids de début inconnu : évidence conservée mais non utilisée (prior populationnel, message explicite). Valeurs hors bornes : refusées à la saisie, ignorées par le moteur.
- **Cohérence** (modifiée en 1.2.0, D-29) : l'historique est signalé `incoherent` si et seulement si la racine exacte de `prédit(offset) = observé` sort de ±1 200 kcal/j (borne `WARM_START_INCOHERENT_OFFSET_BOUND`, D-28), c'est-à-dire si la variation observée sort de `[prédit(+1 200), prédit(−1 200)]`. **Le flag n'a plus aucun effet numérique** : signal d'affichage et de diagnostic seulement, sans effet sur la variance de la vraisemblance, la fusion, la confiance ou le handoff calibration. En 1.1.0, le critère portait sur l'offset linéarisé et multipliait la variance par 4 (écart-type × 2) ; cette règle est abandonnée : elle reposait sur un intervalle sans signification physiologique, via une quantité linéarisée qui surestime l'écart, avec un facteur non validé, et se déclenchait sur 21,5 % de cas conformes au modèle (mesure P0).
- **Conflit** (modifié en 1.2.0, D-29) : statistique prédictive du prior, `z = Φ⁻¹(P(variation ≥ observée))` sous le mélange `Σ prior(o) · N(prédit(o), sd_kg²)` sur le support d'évidence. Signe identique à l'ancien z (négatif quand l'historique indique un maintien plus bas) ; pour un modèle linéaire, égal à l'ancien `offset_historique / √(σ_historique² + σ_prior²)` (test). `|z| ≥ 2` affiche « Tes données récentes diffèrent de notre estimation théorique… ». Aucun message n'accuse l'utilisateur (test lexical).
- **Confiance initiale** : « moyenne » si l'historique est utilisé et que la largeur 80 % ne dépasse pas 75 % de celle du prior ; sinon « faible ». Jamais au-delà de « moyenne » sans pesées Wheighty. Règle inchangée en 1.2.0, **à réarbitrer** : taux de « moyenne » de 2,4 % sur le benchmark de couverture (D-29).
- **Plan** : maintien = NASEM + médiane du posterior, intervalles 80/95 % = quantiles du posterior. Un `CalibrationSnapshot` `source: 'warm_start'` est appliqué, ce qui garde l'offset lors des reconstructions du plan (changement d'objectif, profil). Il n'est pas compté comme recalibration.
- **Recalibration ultérieure** : la log-vraisemblance historique est ajoutée au prior de la calibration sur la même grille (le posterior n'est pas réutilisé comme prior, ce qui éviterait de compter l'historique deux fois). La période historique précède la première pesée ; seule la pesée d'onboarding sert à la fois d'extrémité de l'historique et de niveau de la calibration, où le niveau est marginalisé (D-10) : le bruit de cette pesée tire les deux pentes en sens opposés, ce qui rend la combinaison légèrement conservatrice.
- **Stockage** : `HistoricalIntakeEvidence` versionnée (`evidenceVersion: 1`) dans `WheightyStore.historicalEvidence`, jamais transformée en faux `DailyLog`. Export/import et migrations testés.
- **Provenance** : « Ton historique récent a été utilisé pour affiner cette première estimation. » sur le résultat ; le bloc « Ton historique » et « Ce que ton historique suggère » de « Pourquoi ce résultat ? » (D-25) montrent l'évidence et son estimation seule.

Comportement mesuré (historiques générés avec le modèle de production, offset vrai +250 kcal/j, apport = NASEM − 400) :

| Cas | Offset historique seul | Médiane posterior | Largeur 80 % (prior) | Confiance |
|---|---|---|---|---|
| Femme, 5 jours | non utilisé | 0 | 710 (710) | faible |
| Femme, 14 j, approximation | 241 ± 726 | +33 | 660 (710) | faible |
| Femme, 28 j, pesée des aliments | 244 ± 370 | +91 | 568 (710) | faible |
| Homme, 28 j, pesée des aliments | 246 ± 408 | +123 | 726 (1 008) | moyenne |
| Homme, 28 j, activité non comparable | 246 ± 454 | +110 | 761 (1 008) | faible |
| Homme, 28 j, offset vrai 0 | 0 ± 408 | +5 | 724 (1 008) | moyenne |
| Femme, 28 j, offset vrai −1 000 | environ −1 070 | < −350 | | conflit affiché |
| Homme 90 → 92 kg à 1 400 kcal sur 28 j (modèle 1.1.0) | −2 098 ± 778 (incohérent) | −436 | 889 | faible, conflit affiché |
| Homme 90 → 92 kg à 1 400 kcal sur 28 j (modèle 1.2.0) | −2 098 ± 389 linéarisé, racine exacte −1 737 (incohérent) | −983 | 463 | moyenne, conflit affiché (z −3,60) |

Lignes mesurées avec le modèle 1.1.0 ; en 1.2.0 seule la dernière ligne change (les autres historiques ne sont pas incohérents).

Point à valider : un historique impliquant −700 kcal/j sur 28 jours bien suivis déplace nettement l'estimation (−283 à −357) mais ne déclenche pas le message de conflit (z = −1,7 et −1,3), car l'historique seul reste incertain à ±370–410 kcal/j.

### D-24 Onboarding (UX, patch 1.1.0, révisé par la passe UX v2)

Aucune règle scientifique n'est modifiée par cette section.

- Splash : inchangé (les trois points restent supprimés). L'écran d'introduction qui suit descend son contenu pour laisser de l'air au logo.
- **Un écran par information**, dans cet ordre : prénom et nom, âge, sexe, taille, poids (section Profil) ; composition corporelle (Corps) ; travail, pas, entraînements (Activité) ; « Tu suis déjà tes calories ? », détails de l'historique (Historique, création seulement, détails seulement si « Oui ») ; objectif, vitesse (Objectif, vitesse seulement en perte ou prise). La barre de progression a un segment par section : les sections passées sont pleines, la section courante se remplit écran par écran (`onboardingProgress`).
- Prénom et nom : facultatifs, 60 caractères au plus, stockés dans le profil (D-13), affichés en titre du Profil et en initiales dans l'avatar d'Aujourd'hui (`profileInitials` : « Jean Dupont » → JD, « Lina » → L ; icône neutre sans nom).
- **Âge** (remplace la décision 1.1.0 « 22 stocké ») : le brouillon démarre vide, `22` n'est qu'un placeholder gris, jamais stocké ; la validation refuse un champ vide. + et − agissent sur la même chaîne via `bumpAge` : sur un champ vide, le premier appui met la vraie valeur 22 (sans appliquer le pas), puis ± 1 dans les bornes 19 à 65. La case de périmètre (grossesse, allaitement, troubles alimentaires, suivi médical) est sur l'écran âge.
- Sexe initial Homme (valeur réelle stockée) ; taille et poids vides avec placeholders gris 170 cm et 70,0 kg (5 ft / 7 in et 154 lb en impérial), jamais enregistrés.
- **Composition corporelle** : sans donnée activée, seul « Ignorer cette étape » est visible ; « Continuer » n'apparaît qu'avec une donnée valide (masse grasse avec sa méthode, ou métabolisme mesuré) (`onboardingActions`, `bodyScreenCanContinue`).
- **Activités proposées** : Musculation, Course, Vélo, Natation, Sports collectifs, Rameur, Autre. « Marche » et « Randonnée / marche sportive » ne sont plus proposées : les pas couvrent la marche, une randonnée exceptionnelle passe par « Autre ». Les types `walking` et `hiking` restent valides dans le contrat de données et au calcul pour les profils existants (libellés conservés), avec la même correction de chevauchement pas / exercice.
- **Historique calorique** : voir D-23 (« Non » par défaut, « Facultatif » en note grise secondaire, nombre de jours unique, poids de départ vide si inconnu).
- **Maintien** : ni poids cible ni vitesse ; la cible est le poids saisi, la vitesse vaut 0. Même règle dans la feuille « Changer d'objectif ».
- Point de départ : blocs compactés pour tenir dans un viewport mobile standard ; bouton principal collant en bas (`.sticky-cta`, safe area iOS).
- L'historique précède l'objectif pour que la borne du slider de vitesse utilise le maintien du warm start.

### D-25 « Pourquoi ce résultat ? » et détails scientifiques (observabilité, passe UX v2)

> Structure de la vue digeste et des détails **remplacée par D-30** (passe P3). Le principe du view-model sans formule nouvelle reste valable.

« Comment c'est calculé ? » (texte générique) est remplacé par « Pourquoi ce résultat ? », personnalisé, sur le Point de départ et depuis le Plan.

- **View-model** `domain/explain.ts` : `explainPreview(profile, today, evidence)` pour le résultat avant enregistrement, `explainCurrentPlan(store, today)` pour le plan enregistré (reconstruit avec ses propres entrées ; `matchesStoredPlan` signale un écart, par exemple un plan d'une version antérieure du modèle). Il ne fait que collecter des valeurs déjà produites : évaluation de base (REE, PAL, NASEM, intervalles), warm start, plan d'objectif (vitesses, rejets, solveur, plancher, avertissements, disponibilité énergétique), paramètres d'initialisation de Hall, macros. Aucune formule nouvelle. Le composant `components/ResultExplanationView.tsx` n'importe que le type du view-model (test statique).
- **Seul ajout dans `science/`** (exposition, sans effet sur le plan) : `WarmStartResult.historyOnly` (la vraisemblance historique normalisée sous prior plat sur la même grille, résumée comme un posterior) et `populationTdeeAtStartKcal` (NASEM au poids de début d'historique, référence des offsets).
- **Vue digeste** (réglage « Détails scientifiques » désactivé) : métabolisme de repos (valeur, route, raison du routeur), activité prise en compte, estimation théorique (NASEM, catégorie PAL, fourchette 80 %), ton historique et ce qu'il suggère (médiane et fourchette 80 %, ou raison explicite s'il n'est pas utilisé), maintien retenu (valeur envoyée au solveur, fourchette 80 %), objectif demandé, objectif réellement appliqué (règle limitante réelle, ou « aucun garde-fou »), prescription (calories, pas, poids du modèle au jour 42).
- **Détails** (réglage activé, persisté dans `preferences.showScientificDetails`) : toutes les valeurs techniques du chemin (route REE, calorimétrie, désaccord, énergie des pas, exercice après chevauchement, posture, PAL provisoire, sigma et intervalles du prior, statut, médiane, intervalle et SD de l'historique seul, offset linéarisé utilisé pour le conflit, composantes d'incertitude, z, posterior fusionné, offset, confiance, entrées de Hall, vitesses, garde-fous, rejets, solveur, plancher, faisabilité des macros, règle protéines, disponibilité énergétique, avertissements, calories exactes, version du modèle).
- La raison affichée pour le REE est celle du routeur (`valid_calorimetry`, `athlete_profile`, `general_adult`), pas une phrase générique sur la masse grasse.

### D-26 Progression vers la première recalibration (affichage, passe UX v2)

La barre unique moyennait quatre fractions, dont une ne correspondait pas au critère réel ; elle pouvait paraître presque pleine sans que la porte soit franchie. `gateProgress` lit maintenant le résultat de `evaluateGate` (celui de l'état de calibration, ou une évaluation directe) et renvoie un critère par condition réelle de 05 s8 : pesées (5), durée couverte (14 jours), pesées hors écarts importants (4, D-11), journées notées (50 %). Chaque critère a sa propre barre ; `met` est exactement celui du moteur et la porte n'est franchie que si les quatre le sont (test de cohérence). Le bouton « Ajouter une pesée » est retiré d'Analyse (la saisie existe dans Aujourd'hui et Suivi) ; Aujourd'hui tient compte du critère des pesées propres dans son message.

### D-27 Plan sans projection détaillée (passe UX v2)

Plan répond à « Que dois-je faire ? » : calories, pas, équilibre, macros, règles pratiques. Le bloc de projection et l'écran Projection sont supprimés (la trajectoire du poids vit dans Suivi) ; il reste une ligne « Échéance estimée » et le lien « Pourquoi ce résultat ? ». `MacrosProjection.tsx` devient `Macros.tsx` et la route `projection` disparaît de la navigation.

### D-28 Correctif neutre du warm start : trois usages de ±1 200 séparés, gel de Hall supprimé (P1, sorties inchangées)

Suite de l'audit `15_AUDIT_WARM_START_GRILLE.md` et des mesures `20_P0_MESURES_WARM_START.md`, arbitrées dans `21_P1_CORRECTIF_NEUTRE_WARMSTART.md` (documents de handoff numérotés, conservés hors dépôt, comme ceux cités en D-29 et D-30). Aucune sortie ne change : pas de bump de `SCIENTIFIC_MODEL_VERSION`, `SCHEMA_VERSION` inchangé.

**Trois concepts, trois constantes, valeurs identiques.** La borne ±1 200 kcal/j servait à trois choses. Elle est séparée nominalement :

| Concept | Constante | Catégorie | Rôle |
|---|---|---|---|
| A. Support numérique du posterior | `CALIBRATION_GRID_MIN_KCAL` / `MAX` (−1 200 / +1 200, pas de 5) | `statistical_robustness_parameter` | grille partagée par le warm start et la calibration ; inchangée |
| B. Domaine admissible d'initialisation de Hall | `HALL_MIN_BASELINE_INTAKE_KCAL = 1` (borne exclusive) | `engineering_prior` | B1 : `EI_b > 1 kcal/j`, admissibilité numérique seulement, pas un seuil physiologique |
| C. Règle de cohérence du warm start | `WARM_START_INCOHERENT_OFFSET_BOUND = 1 200` | `product_safety_rule` | déclenche le flag `incoherent` |

C n'est pas un paramètre statistique : c'est une règle de décision produit sur ce qu'on accepte d'expliquer par le modèle, pas un réglage de la représentation numérique du posterior. Sa valeur est héritée du support de la grille, sans justification physiologique propre, et reste à sourcer. `warmStart.ts` ne lit plus `CALIBRATION_GRID_*` (test statique).

**Gel silencieux de Hall corrigé.** Mécanisme : un apport de base `EI_b <= 0` (ou une part de glucides nulle) donne `kG = CI_b / G0² <= 0` ; `stableSubsteps` calculait alors `sqrt(CI / kG)` non fini, `Math.max(1, NaN)` renvoyait `NaN`, la boucle `for (i < NaN)` ne s'exécutait jamais et l'état restait figé : poids de départ inchangé, sans erreur ni valeur non finie visible. Désormais :

- `initializeHall` lève une `HallDomainError` typée si `EI_b` n'est pas admissible (`isAdmissibleBaselineIntake`, borne B) ou si `kG <= 0` ;
- `stableSubsteps` lève une `HallDomainError` si le nombre de sous-pas n'est pas fini (défense pour des paramètres construits à la main) ;
- le warm start (`historicalLikelihood`) et la calibration (`fitCalibration`) excluent du support les offsets dont `NASEM + offset` n'est pas admissible : jamais simulés, log-vraisemblance `-Infinity`, probabilité nulle. Le nombre de points exclus est compté (`HistoricalLikelihood.hallDomain.excludedOffsetCount`, `CalibrationFit.excludedOffsetCount`) et remonté dans le view-model (`explain.ts`, `history.hallDomain`, non affiché avant P3).

Ce cas est inatteignable sur le domaine valide : l'EI_b minimal vaut 628 kcal/j sur la matrice de stress et 83 kcal/j au coin théorique (femme, 65 ans, 130 cm, 35 kg, inactive, NASEM 1 282,7). Le correctif est un no-op fonctionnel strict (preuve ci-dessous).

**Diagnostic B2 exposé sans agir.** `deltaClampBaselineIntakeKcal(RMR) = RMR / (1 − β_TEF)` : sous ce seuil, le paramètre d'activité δ de l'initialisation publiée est négatif et ramené à 0 (D-03). `hallDomain` expose l'offset correspondant, l'offset du maximum de vraisemblance et leur écart (cas A : maximum −945, seuil −875,1). Aucun filtre, aucun effet sur le calcul. B2 en exclusion a été écarté (P0 : il couperait la distribution historique d'environ 10 % des utilisateurs pour moins de 0,5 % d'effet sur le plan, et créerait des maximums collés au bord) ; B3 et B4 ne sont pas retenus.

**Sensibilité fiabilisée.** La sensibilité du warm start lit les offsets 0 et ±100 via `valueAtOffset`, qui lève une erreur si l'offset est absent du support ou exclu, au lieu de lire `undefined` et de propager un `NaN` silencieux (ancien `offsets.indexOf`).

**Borne PAL confirmée.** `PAL_ACTIVE_MIN = 1.68` est conforme à la Table 7-1 de NASEM 2023 (chapitre 7) : inactive 1,0 ≤ PAL < 1,53 ; low active 1,53 ≤ PAL < 1,68 ; active 1,68 ≤ PAL < 1,85 ; very active 1,85 ≤ PAL < 2,50. Les cas A (1,683, `active`) et B (1,664, `low_active`) sont correctement classés. **Régression interdite** : la borne 1,60 est celle de l'IOM 2002/2005, encore reprise par de nombreuses sources secondaires ; elle ne doit pas être réintroduite (test de non-régression). Le 1,69 relevé en P0 était un artefact d'outil de résumé.

**Décalages hors périmètre mesurés en P0.** Référence NASEM au poids de début d'historique (warm start) contre première pesée (calibration) : conforme à D-17 et D-23 (offset additif), effet < 21 kcal/j, `DO_NOT_TOUCH`. Part de glucides de maintien (warm start) contre objectif (calibration) : 2 à 8 kcal/j, reporté.

**Preuve de non-régression** (capture complète avant et après, comparaison au bit près, 2 175 354 valeurs, 0 différence) :

- 12 golden : sorties non arrondies, projection complète ; snapshot golden inchangé ;
- T-03 : chaque posterior des 126 simulations à 28 et 42 jours ; T-04 : les six scénarios, deux familles de graines ;
- cas A et B : view-model complet, HTML rendu du panneau « Pourquoi ce résultat ? » en mode digeste et détaillé (métrique et impérial), store d'onboarding, plan enregistré réexpliqué ;
- balayage d'apport déclaré de 900 à 2 500 kcal/j par pas de 10 sur les cas A et B : plans, warm starts, discontinuité comprise (1 370 → 1 380 sur A, 1 250 → 1 260 sur B) ;
- 300 warm starts et plans de la matrice de stress (7 à 365 jours, apports 800 à 6 000, poids de début ±4 kg).

Tests ajoutés : `tests/science/warmStartDomain.test.ts` (contrat de grille, throw sur désalignement, accès à la sensibilité, exclusion comptée côté warm start et calibration, profil au NASEM minimal : changement prédit fini partout, ECF borné entre sa base et l'état stationnaire fixé par le ratio glucidique sur 365 jours, diagnostic B2), `tests/science/hall.test.ts` (domaine B1, erreur typée à la place du gel, `stableSubsteps` fini et ≥ 1), `tests/science/constants.test.ts` (A, B et C séparées, catégorie de C, `PAL_ACTIVE_MIN = 1.68`), `tests/domain/warmStartReferenceCases.test.ts` (snapshot complet des cas A et B, poids cible 62 kg figé pour A).

**Passe suivante réalisée** : modèle 1.2.0, voir D-29.

### D-29 Règles de décision du warm start sur la distribution exacte (décision validée, modèle 1.2.0)

Arbitrée dans `22_P2_REGLES_EXACTES_WARMSTART.md` (handoff), sur la base de l'audit 15 et des mesures P0 (`20_`). Bump `SCIENTIFIC_MODEL_VERSION` 1.1.0 → **1.2.0**. `SCHEMA_VERSION` inchangé : l'évidence reste stockée brute (`evidenceVersion: 1`) et la vraisemblance est recalculée.

**Nomenclature des cas de référence.**

| Cas | Profil | Statut |
|---|---|---|
| **R** (primaire) | femme, 24 ans, 155 cm, 68,0 kg, composition non mesurée, assis, 9 400 pas, musculation 4 × 55 min modérée ; historique 14 j à 1 450 kcal/j, aliments pesés, activité comparable, 68,0 → 68,0 kg ; perte à 1,0 %/sem. (vitesse maximale sélectionnable), **cible 60,0 kg** | profil utilisateur réel (ex-« cas B ») |
| **S** | identique à R mais 5 séances, cible 62 kg | variante synthétique (ex-« cas A » de l'audit 15, de P0 et de P1), sans valeur d'usage réel |
| W-01 | 7 000 pas par défaut | **non représentatif**, ne plus utiliser comme référence (section retirée, voir W-01) |

Fixtures et snapshots : `tests/domain/warmStartReferenceCases.test.ts` (R et S). Le 62 kg reste attaché à S seul.

**Diagnostics préalables.**

- **1 450 saisi contre 1 452 affiché** : aucune transformation dans le code. Aller-retour testé (`"1450"`, `"1 450"` avec espace fine, `"1450,0"` → évidence 1 450 → store sauvegardé puis rechargé 1 450 → panneau « 1 450 »). Les valeurs rapportées pour le panneau (médiane historique 1 595, linéarisé −930 ± 568, fusionné 2 074, offset −180, 1 406,2 kcal/j) ne sont reproduites qu'avec un apport de **1 452** (à 1 450 : 1 593, −930 ± 568, 2 074, −180, **1 405,2**). La valeur vue par le moteur dans cette session était donc 1 452 (saisie ou transcription), pas un bug de contrat. Note : la prescription avance par paliers de 1 kcal (tolérance du solveur), d'où 1 405,2 pour 1 448 à 1 451 et 1 406,2 pour 1 452 à 1 454.
- **Cible 60 kg contre 62 kg (cas R)** : calories identiques (1 405,2 kcal/j, le solveur à 42 jours vise la vitesse hebdomadaire), cible atteinte au jour 110 (environ 16 semaines) contre 75 (environ 11 semaines). Le snapshot de P1 faisait porter 62 kg à l'ex-cas B ; corrigé.

**Changements.**

1. **Suppression de l'effet numérique du flag `incoherent`** (D-23 point Cohérence). `WARM_START_INCOHERENT_SIGMA_MULTIPLIER` est supprimée. La SD de la vraisemblance est toujours `√(2 σ_pesée² + s² (σ_apport² + σ_activité² + σ_modèle²))`.
2. **Règle de cohérence exacte** : `exactCoherence` (`warmStart.ts`) ; `incoherent ⇔ observé ∉ [prédit(+C), prédit(−C)]`, C = 1 200 inchangé. Si ±C sort du domaine admissible de Hall, l'offset admissible le plus proche à l'intérieur de [−C, +C] est utilisé (inatteignable sur le domaine valide). La racine exacte est interpolée linéairement entre deux points du support. Cas S : racines −1 095, −1 045, −1 015 et −945 à 1 300, 1 350, 1 380 et 1 450 kcal/j, aucune incohérente.
3. **z de conflit prédictif** : `predictiveConflictZ` ; log-probabilités de queue calculées dans `science/normal.ts` (erfc de Numerical Recipes, erreur relative < 1,2·10⁻⁷, en espace logarithmique pour ne jamais sous-déborder ; quantile par Newton sur log Φ). Seuil 2 inchangé.
4. **Support d'évidence** : `evidenceSupportOffsets`, multiples de 5 dans [−3 000, +3 000] (`WARM_START_EVIDENCE_SUPPORT_HALF_WIDTH_KCAL`, `statistical_robustness_parameter`, nouveau) dont `NASEM + offset` est admissible (domaine B de D-28). Contient strictement la grille. « Historique seul », règle de cohérence et z prédictif y sont calculés ; le posterior fusionné et `historicalLogLikelihood` restent sur la grille de calibration (481 valeurs, contrat inchangé, mêmes valeurs aux offsets communs). Choix de la demi-largeur : valeur fixe plutôt qu'un support adaptatif, pour un coût prévisible ; sans effet sur le plan, **à valider**.
5. **Exposition pour P3** (view-model `history`, non affichée) : `exactRoot` (racine, position, distance à C, intervalle de cohérence), `historyOnlyEdgeMass` (masse dans les 5 et 10 derniers bins de chaque côté, grille et support), `hallDomain` (points exclus sur la grille et sur le support, seuil B2 et position du maximum de vraisemblance sur le support). L'offset linéarisé reste exposé comme approximation diagnostique ; aucune décision ne l'utilise.

**Deltas mesurés (avant 1.1.0 → après 1.2.0).**

| Grandeur | R (1 450 kcal/j) | S (1 450 kcal/j) |
|---|---|---|
| Historique seul, médiane (offset) | −663,0 → −706,7 | −752,7 → −846,1 |
| Historique seul, 80 % | [−1 061 ; −64] → [−1 170 ; −88] | [−1 104 ; −174] → [−1 308 ; −230] |
| Historique seul, 95 % | [−1 162 ; +313] → [−1 354 ; +296] | [−1 176 ; +198] → [−1 491 ; +153] |
| Masse aux 10 derniers bins bas (grille → support) | 3,1 % → ≈ 0 | 4,9 % → ≈ 0 |
| `incoherent` / z | non / −1,47 → non / −1,45 | non / −1,70 → non / −1,68 |
| Posterior fusionné, offset, confiance | inchangés (−182,0 ; faible) | inchangés (−206,6 ; faible) |
| Prescription, macros | inchangées (1 405,2 kcal/j ; 112,8 / 133,1 / 46,8 g) | inchangées (1 502,8 ; 112,8 / 150,2 / 50,1 g) |

Explication : ni R ni S ne sont incohérents à leur apport de référence, donc la vraisemblance sur la grille est identique au bit près et le plan ne bouge pas. Seul l'affichage « historique seul » change (support élargi : la troncature à −1 200 disparaît) et z change de 0,02 (distribution exacte au lieu de la linéarisation).

Garde-fou légitime et saisies aberrantes :

| Cas | Racine exacte / incohérent | z (avant → après) | Posterior (avant → après) | Confiance | Prescription (avant → après) | Signaux après |
|---|---|---|---|---|---|---|
| D-23, homme 90 → 92 kg à 1 400 kcal sur 28 j (NASEM 2 774) | −1 737 / oui | −2,41 → **−3,60** | −436 → **−983** | faible → **moyenne** | 1 869 → **1 396** | conflit, sous le REE |
| Apport déclaré divisé par 3 (homme 88 kg, NASEM 3 028, 1 009 kcal, poids stable 14 j) | −2 019 / oui | −1,90 → −3,33 | −220 → −699 | faible | 2 116 → 1 687 | **conflit (absent en 1.1.0)**, sous le REE |
| Prise de 3 kg en 14 j à 800 kcal (femme 75 kg, NASEM 2 197) | −1 795 / oui | −2,63 → −4,82 | −167 → −644 | faible | 1 297 → 1 207, vitesse 1,0 → 0,55 %/sem. (plancher 1 200) | conflit, sous le REE, vitesse ajustée |

Aucune saisie absurde ne produit de plan sans signal : conflit affiché dans les trois cas, plancher respecté. Mais le posterior du cas D-23 descend de 547 kcal/j et la règle de confiance relative, inchangée, le classe « moyenne » : **à arbitrer**. Le maximum de vraisemblance de ces cas se situe loin sous le seuil B2 (δ ramené à 0) : la vraisemblance exacte y est plus étroite que la linéarisation (SD historique 233 contre 389 pour D-23), en partie à cause des termes eau et glycogène de Hall à faible apport de base.

**Mesures exigées.**

*6.1 Poids de l'historique* (poids = 1 − variance fusionnée / variance du prior sur la grille ; moyenne sur les points du balayage 900 à 2 500 kcal/j où l'ancien flag était actif) : 3,8 % → 15,1 % (R), 3,7 % → 14,6 % (S) ; profils de la matrice : 1,8 % à 12,4 % → 6,9 % à 53,9 % (T2 : 29,9 % → 77,2 %). Écart-type linéarisé divisé par 2, largeur 80 % fusionnée −20 à −445 kcal. Les points non flaggés sont identiques au bit près. L'attendu « environ 10 % → environ 30 % » est **infirmé en niveau** : le poids part de 2 à 6 % et arrive à 9 à 15 % dans la majorité des profils (facteur environ 4, conforme au quadruplement de la variance), 24 à 77 % seulement pour les historiques les plus informatifs.

*6.2 Confiance « moyenne »* (benchmark de couverture P0, 2 016 simulations par scénario) : 1,8 % → 2,4 % (idéal) ; 7 j 0,0 → 0,2 %, 14 j 0,2 → 0,8 %, 21 j 2,6 → 2,8 %, 28 j 4,4 → 5,8 % ; suivi précis 4,6 → 5,2 %, portions estimées 0,4 → 0,9 %, approximation 0,3 → 1,0 %. La règle reste presque inopérante.

*6.3 Couverture* (idéal ; scénarios A à F dans le même sens) : 80 % 0,761 → 0,755 ; 95 % 0,949 → 0,945 ; biais −11 → −24 ; largeur 80 % 791 → 781 ; erreur médiane 246 → 235 kcal/j ; conflit 0,9 → 5,4 % (proche des 4,6 % attendus d'un test |z| ≥ 2 bien calibré). Récupération de l'écart (1 − biais / offset) : −500 : 13 % → 23 % ; −300 : 10 → 14 % ; −150 : 24 → 40 % ; +150 : 3 → −5 % ; +300 : 4 → 4 % ; +500 : 7 → 10 %. Le gain est **asymétrique** : réel sur les offsets négatifs, nul sur les positifs. Scénario F (combiné) : −500 : 15 → 25 %, +500 : 5 → 8 %.

*6.4 Monotonie* (balayage 900 à 2 500 kcal/j, cas R, S et 20 profils de la matrice) : discontinuités > 50 kcal/j dues au warm start 13 profils → **0**, sur le plan complet comme sur le maintien seul. Seul reste le saut de cran de vitesse du profil T1 (moteur d'objectif, hors warm start) : 1 100 → 1 110 kcal/j (−101,8, 0,75 → 0,80 %/sem.) et 2 130 → 2 140 (−102,9, 0,80 → 0,85 %/sem.), figé par un test comme comportement connu non traité.

**Coût du support élargi** (une fois par évidence, résultat mémoïsé) : cas R 14 j 12 → 17 ms, 365 j 138 → 348 ms ; NASEM maximal du domaine (8 444 kcal/j) 14 j 14 → 32 ms, 365 j 337 → 840 ms.

**Plans enregistrés en 1.1.0.** Aucun plan n'est reconstruit au chargement : reconstruction seulement sur action (objectif, profil, recalibration). `explainCurrentPlan` expose `modelVersion` 1.2.0 et `storedPlanModelVersion` 1.1.0. **Limite constatée** : `matchesStoredPlan` recalcule les calories à l'offset enregistré et reste donc `true` même quand le warm start 1.2.0 donnerait un autre offset ; dans ce cas (D-23), le bloc historique recalculé ne correspond plus au maintien enregistré (écart de −547 kcal/j). La prochaine recalibration d'un utilisateur existant utilisera la vraisemblance 1.2.0. Tests : `warmStartReferenceCases.test.ts`.

**Handoff calibration** : T-03, T-04 et les 12 golden sont identiques au bit près (aucun n'utilise d'historique ; capture complète comparée).

**Documentation `instruct/`** : non mise à jour dans cette passe (hors périmètre annoncé), réalignée en P3 (D-30) : `instruct/05_CALIBRATION_UNCERTAINTY.md` s17 (support d'évidence, règle de cohérence exacte sans effet numérique, z prédictif, panneau) et `instruct/08_REFERENCE_NOTES.md` (borne de cohérence, support, z prédictif).

Tests : `tests/science/warmStartExactRules.test.ts` (loi normale en espace log, règle C exacte, cas S sans incohérence entre 1 300 et 1 500, absence de facteur, équivalence linéaire du z et de la racine, support contenant strictement la grille, invariance du posterior fusionné, monotonie non décroissante sur R et S, saut de vitesse de T1 figé), `tests/domain/warmStart.test.ts` (cas D-23 réécrit), `tests/domain/warmStartReferenceCases.test.ts` (R, S, store 1.1.0), `tests/science/constants.test.ts` (1.2.0, multiplicateur supprimé, support).

### D-30 Refonte de « Pourquoi ce résultat ? » (affichage, passe P3, aucune science modifiée)

Arbitrée dans `25_P3_REFONTE_PANNEAU.md` (handoff). `SCIENTIFIC_MODEL_VERSION` reste **1.2.0**, `SCHEMA_VERSION` inchangé. Remplace la structure décrite en D-25 (vue digeste et liste plate de détails). Question visée : « je mange 1 450 kcal pendant 14 jours, mon poids ne bouge pas, pourquoi l'app me dit 2 074 ? ». Deux principes : toute valeur issue d'une règle à seuil affiche sa distance au seuil ; le poids réel de chaque source est affiché.

**Vue digeste** (ordre d'affichage) :

1. **Ton maintien estimé** : bloc comparatif unique, estimation théorique, ton historique (support exact) et maintien retenu sur une même échelle (barre de fourchette et point médian), fourchettes 80 % arrondies à 50 kcal (`EXPLANATION_RANGE_ROUNDING_KCAL`) pour qu'une borne proche de 1 200 ne soit pas confondue avec le plancher. Remplace les sections « Estimation théorique » et « Ce que ton historique suggère » ainsi que la phrase « chacun pesé selon sa précision ». Le message de conflit calibré (z ≥ 2) y reste affiché.
2. **Ce qui compte dans ce résultat** (warm start utilisé) : barre à deux segments avec pourcentages et phrase en fraction arrondie, copy validée : « Ton historique compte pour environ un sixième de ce résultat. Le reste vient de l'estimation théorique. » Poids = `1 − variance fusionnée / variance du prior` sur la grille (mesure 6.1 de P2). Cas R : 17,9 %, « un sixième ».
3. ~~**Pourquoi pas X kcal ?**~~ **Retiré de la vue digeste** (retour produit, passe UI suivante) ; `scaleVariationKcalPerDay` reste exposé par le view-model. Copy d'origine, pour mémoire : « Ton poids n'a pas bougé sur 14 jours, mais deux pesées ne suffisent pas à prouver une stabilité réelle. Une balance varie facilement de 0,5 à 1 kg d'un jour à l'autre, selon l'eau et la digestion. Ici, 0,5 kg d'écart représente déjà environ 250 kcal par jour sur 14 jours. Wheighty tient donc compte de ton historique, sans le traiter comme une mesure exacte. » Première phrase adaptée si le poids a changé, unités impériales gérées. Les « 250 kcal » valent `0,5 kg / |sensibilité du modèle|` arrondi à 50 (cas R : 225,2 → 250). Test lexical : aucune formulation qui suggère une erreur de déclaration.
4. Métabolisme de repos, activité prise en compte (tuiles : pas, travail, catégorie d'activité, entraînements, historique saisi), **ton objectif** (vitesse appliquée seule ; si un garde-fou l'a modifiée, info-bulle « Tu avais demandé X % par semaine » suivie de la règle limitante), prescription (calories et pas côte à côte).
5. **Ce qui fera bouger ce chiffre** : confiance actuelle et les quatre critères réels de la porte de recalibration avec leur état (même calcul que Suivi ; aperçu : aucune pesée encore comptée).

**Interdiction stricte** : le flag `incoherent`, les points exclus et tout vocabulaire technique (linéarisé, racine, domaine, support) n'apparaissent jamais en vue digeste (test).

**Détails scientifiques** : six groupes repliables (`<details>`) ; A, B, C et F repliés par défaut, D et E ouverts.

- **A. Intégrité** : badge en tête (« Recalcul conforme au plan enregistré », « Écart avec le plan enregistré » ou « Aperçu »), versions, calories recalculées, offset du warm start enregistré et recalculé.
- **B. Métabolisme et activité** : REE et route, pas, « Exercice structuré (net) » (ligne « Chevauchement retiré » seulement pour les activités step-dominantes ; cas R : 93,5 kcal/j sans soustraction), posture, PAL provisoire et **distance à la frontière la plus proche** en PAL et en kcal de NASEM (cas R : 1,68, +0,016 PAL, +139 kcal/j vers `active`).
- **C. Prior populationnel** : NASEM, sigma de base et multiplicateurs avec leur raison, intervalles.
- **D. Évidence historique** : historique seul sur support exact (source de vérité, 80 et 95 %), offset linéarisé étiqueté « approximation diagnostique, aucune décision ne l'utilise depuis 1.2.0 », écart exact moins linéarisé, masses aux bords (grille et support), racine exacte et distance à la borne ±1 200, `incoherent` avec distance au déclenchement et mention « sans effet numérique », z prédictif et marge au seuil, maximum de vraisemblance par rapport au seuil B2, points exclus par le domaine de Hall, incertitudes. `NASEM au poids de début d'historique` seulement s'il diffère.
- **E. Fusion et confiance** : maintien retenu, offset, 80 et 95 %, poids des sources, confiance et **critère précis** (warm start : largeur 80 % rapportée à celle du prior contre 75 % ; recalibré : porte, largeurs 500 / 300, durée, pesées, écarts importants ; population : aucune évidence personnelle).
- **F. Plan** : vitesses, garde-fou IMC et vitesse sélectionnable **fusionnés**, rejets, solveur, initialisation de Hall, plancher avec marge, macros, règle protéines, disponibilité énergétique avec marge au seuil, « **Avertissements du plan** » (`GoalPlan.warnings` seuls) et « **Signaux actifs** » (frontière PAL, confiance faible, `incoherent`, conflit, δ ramené à 0, vitesse ajustée).
- Supprimé : `Hall baseline intake` (identique au maintien retenu), `Posterior fused` (dupliquait le maintien 80 / 95 %).

**`matchesStoredPlan` corrigé** (`BUG_CODE` constaté en P2) : faux si la version du modèle du plan enregistré diffère, si les calories recalculées à l'offset enregistré diffèrent de plus de 1 kcal, ou, pour un warm start, si l'offset recalculé diffère de l'offset enregistré de plus de `STORED_PLAN_OFFSET_MATCH_TOLERANCE_KCAL` = 10 kcal/j (tolérance d'affichage, égale à l'arrondi des kcal). Détail exposé dans `integrity`. Store 1.1.0 du cas D-23 : `false` (version et offset −547 kcal/j). Aucun plan n'est remplacé : reconstruction sur action seulement. Les snapshots recalibrés ne sont pas recomparés (l'offset dépend des pesées accumulées).

**Valeurs ajoutées au view-model** (`domain/explain.ts`, aucune formule scientifique nouvelle, fonctions et constantes existantes) : `thresholds`, `sources` (poids), `scaleVariationKcalPerDay` (exemple / sensibilité), `confidenceDetail`, `gate` (`gateProgressFromGate`), `signals`, `integrity`, `activity.exerciseNetKcalBeforeOverlap`, `activity.overlapRemovedKcal`, `activity.anyStepDominant`, `activity.palBoundary` (NASEM de la catégorie adjacente par `nasemEerKcalDay`), `population.baseSigmaKcal`, `population.sigmaMultipliers`, `history.historyOnly.interval95`, `history.exactMinusLinearisedKcal`, `safety.floorMarginKcal`. Constantes d'affichage nouvelles (`ui_rounding_rule`, sans bump) : `EXPLANATION_RANGE_ROUNDING_KCAL = 50`, `EXPLANATION_SCALE_VARIATION_EXAMPLE_KG = 0,5`, `STORED_PLAN_OFFSET_MATCH_TOLERANCE_KCAL = 10`. `gateCriterionValue` déplacée dans `domain/views.ts` (réexportée par `Suivi`).

**Non-régression scientifique** : golden, T-03, T-04, cas de référence, balayages et matrice de stress comparés au bit près avec l'état P2 (plus de 5 millions de valeurs, 0 différence hors view-model et HTML du panneau) ; valeurs existantes du view-model inchangées sur R, S, D-23 et un cas aberrant (seuls des champs sont ajoutés). Snapshots R et S mis à jour pour ces seuls ajouts.

**Documentation** : `instruct/05` s17 et `instruct/08` réalignés sur 1.2.0 ; `12_CURRENT_DEBUG_CASE_WARMSTART_1450.md` (handoff) marqué cas synthétique S, avec le cas R documenté comme référence.

Tests : `tests/domain/explanationPanel.test.ts` (poids et fraction, copy « pourquoi pas » métrique et impériale, poids qui change, test lexical, interdiction du flag en digeste, arrondi à 50, porte, distance PAL recoupée avec le cas S, critère de confiance cohérent avec le moteur, marge du z, signaux, ligne d'exercice, toggle non mort, intégrité), `tests/domain/explainAndScreens.test.ts` et `tests/domain/warmStartReferenceCases.test.ts` mis à jour.

### W-01 Cas pratique de la passe UX v2 (retiré)

Cas non représentatif (7 000 pas par défaut jamais saisis), remplacé par les cas R et S de D-29. Ses deux premiers points à arbitrer (offset linéarisé contre grille, asymétrie de l'historique seul tronqué à −1 200) sont résolus par D-28 et D-29. Reste ouvert, pour la lisibilité seulement : le « Déficit initial » du Plan est le déséquilibre du jour 0 du modèle de Hall (la dépense réagit immédiatement via le TEF natif) et diffère donc de maintien − cible. Le détail complet reste dans l'historique Git.

### N-01 Stabilité numérique du glycogène (correction numérique, modèle 1.1.0)

La suppression de l'exemption IMC 30 a fait apparaître, sur un profil aléatoire extrême (199 kg, maintien environ 5 800 kcal), une instabilité préexistante : l'équation du glycogène `dG/dt = (CI − k_G G²)/ρ_G` a une raideur locale `2 k_G G / ρ_G` qui dépasse la limite de stabilité du RK4 à pas d'un jour quand l'apport glucidique de base dépasse environ 2 900 kcal/j (glycogène négatif, poids qui oscille). Correction purement numérique : chaque jour est découpé en sous-pas égaux quand `raideur × pas > 2` (`HALL_RK4_STIFFNESS_LIMIT`). Les équations ne changent pas ; pour les apports ordinaires (dont les 14 scénarios de référence) il reste exactement un pas par jour (testé). Test : pas d'un jour et pas de 0,1 jour concordent à 0,02 kg, glycogène positif, continuité du poids.

### D-31 Estimande de la calibration : le maintien apparent (décision validée, modèle 1.3.0)

**Définition.** Le chiffre que la calibration fait converger est le **maintien apparent** : les calories qui stabilisent le poids *quand l'utilisateur suit sa cible comme il le fait d'habitude*. Formellement, l'offset apparent vaut l'offset métabolique moins l'apport excédentaire moyen réellement consommé au-dessus des cibles du jour sur la fenêtre (écarts déclarés et apport non déclaré). Dans le modèle de Hall, manger la cible avec un maintien abaissé de X, ou manger la cible + X avec le maintien vrai, donne le même bilan, parce que le TEF et l'adaptation dépendent tous deux de l'écart à l'apport de base. L'estimande est donc bien défini.

**Ce que ce chiffre n'est pas.** Ni le métabolisme de repos (le REE reste une équation et n'est jamais recalibré), ni une dépense mesurée. Un utilisateur qui mange en moyenne 80 kcal/j de plus que ce qu'il note aura un maintien affiché environ 80 kcal plus bas que sa physiologie.

**Pourquoi ce choix.** Le plan est construit à partir de ce maintien et appliqué au même comportement : la trajectoire prévue reste cohérente avec ce que l'utilisateur fait réellement, sans a priori non validé sur la taille des écarts. Le moteur ne change pas : l'apport de chaque jour reste la cible du jour (D-10).

**Conséquences mesurées.** Le « biais structurel » de −47 à −76 kcal/j rapporté en 1.1.0 et 1.2.0 était exactement l'apport moyen des écarts déclarés du simulateur. Contre l'offset apparent, le biais du monde idéal tombe entre −2 et +9 kcal/j à tous les horizons (T-03). Les benchmarks mesurent désormais contre l'offset apparent et rapportent l'offset métabolique à titre d'information (`apparentOffsetKcal` dans `tests/helpers/syntheticUser.ts` et `mismatchWorld.ts`).

**Interface.** Phrase ajoutée sous « Ton maintien estimé » dans « Pourquoi ce résultat ? » (`WHY_TEXT.apparentMaintenance`) et définition reprise sur l'écran de recalibration. Test lexical : jamais présenté comme une dépense réelle ou un métabolisme (`tests/domain/explanationPanel.test.ts`).

**Vérification annexe.** L'énergie des pas en calibration est évaluée au poids de la première pesée, mais convertie en kcal/kg (`paDeltaKcalPerKgDay`) puis multipliée par le poids courant dans le modèle de Hall : elle suit bien le poids. Ce n'est pas une limite.

### D-32 Plancher calorique sexué (décision validée, modèle 1.3.0)

`ABSOLUTE_MIN_CALORIES` est remplacé par `ABSOLUTE_MIN_CALORIES_FEMALE = 1 200` et `ABSOLUTE_MIN_CALORIES_MALE = 1 500` (`product_safety_rule`, recommandation courante sans suivi médical). Le plancher reste `max(plancher absolu, 0,7 × REE)` : `hardFloorKcal(reeKcal, sex)` dans `science/goals.ts`, utilisé par l'évaluation des vitesses, le plan et le slider pas. Un homme dont la vitesse demandée passerait sous 1 500 kcal obtient la vitesse la plus rapide qui respecte le plancher, avec « Vitesse ajustée » (D-19, D-22).

Golden : seul le champ `hardFloor` des 5 profils masculins change (02 : 1 211 → 1 500 ; 04 : 1 412 → 1 500 ; 06 : 1 400 → 1 500 ; 08 et 10 : 1 200 → 1 500) ; calories, macros et projections sont identiques. Tests : `goals.test.ts` (valeurs, petit homme en perte rapide ramené au plancher, femme de même gabarit à 1 200) et matrice de propriétés avec le plancher sexué.

### D-33 Plancher d'incertitude structurelle de la calibration (décision validée, modèle 1.3.0)

**Problème.** La vraisemblance suppose un modèle parfait et des pesées indépendantes : la fourchette rétrécissait comme 1/√n alors que l'erreur de modèle (eau autocorrélée, dérive, podomètre) ne diminue pas. Avec l'ancienne vérité métabolique, la couverture 80 % tombait à 0,48 à 84 jours et 0,21 à 120 jours ; avec la vérité apparente, le scénario D (eau autocorrélée) tombait à 0,52 / 0,81 à 84 jours.

**Mécanisme.** Le posterior de l'offset calculé sur la grille (`informationPosterior`) est convolué avec N(0, σ_struct), noyau tronqué à 6 σ, puis renormalisé (`convolveGridProbabilities`, `summarizeGridProbabilities` dans `science/calibration.ts`). Les offsets exclus par le domaine admissible de Hall (D-28) gardent une probabilité nulle. La variance ajoutée vaut σ² ; la médiane d'un posterior symétrique ne bouge pas. `CALIBRATION_STRUCTURAL_SD_KCAL = 50` (`statistical_robustness_parameter`). Non appliqué au warm start, qui a déjà `WARM_START_MODEL_SD_KCAL` dans sa vraisemblance ; le handoff reste la log-vraisemblance brute.

**Choix de σ, protocole fixé avant mesure.** Plus petite valeur parmi {50, 75, 100} qui passe T-03 à 84 et 120 jours et le scénario D ; vérification ensuite, sans retouche, sur les autres scénarios.

| σ (kcal/j) | T-03 84 j couv. 80 / 95 (largeur) | T-03 120 j couv. 80 / 95 | D 42 j couv. 80 / 95 | D 84 j couv. 80 / 95 |
|---|---|---|---|---|
| 0 | 0,82 / 0,95 (122) | 0,83 / 0,95 | 0,69 / 0,88 | 0,52 / 0,81 |
| **50** | **0,96 / 1,00 (178)** | **0,99 / 1,00** | **0,74 / 0,93** | **0,86 / 0,95** |
| 75 | 0,99 / 1,00 (229) | 1,00 / 1,00 | 0,76 / 0,98 | 0,93 / 1,00 |
| 100 | 1,00 / 1,00 (285) | 1,00 / 1,00 | 0,86 / 1,00 | 1,00 / 1,00 |

Mesure de protocole faite avec des mondes D simulés sur 84 jours pour les deux horizons ; les tests enregistrés simulent la durée de chaque horizon (T-04). Le tempérage des pesées rapprochées prévu en repli n'a pas été nécessaire. Conséquence assumée : dans le monde idéal, les intervalles sont un peu conservateurs (couverture 80 % de 0,96 à 84 jours). La confiance « élevée » (largeur 80 % ≤ 300) reste atteinte : dès J35 dans le parcours A. Tests : conservation de la masse, du centre et de la variance, posterior fitté égal au posterior d'information élargi (`calibration.test.ts`), horizons longs (`calibrationLongHorizon.test.ts`), offsets exclus à probabilité nulle (`warmStartDomain.test.ts`).

### D-34 Espacement minimal des recalibrations proposées (décision validée, modèle 1.3.0)

**Problème.** Parcours A de la revue (modèle 1.2.0) : 14 recalibrations en 84 jours, dont 3 en 5 jours (J14, J16, J19) qui emmenaient la cible de 1 940 à 1 458 kcal. Le critère « fourchette 80 % rétrécie d'au moins 10 % » se déclenchait presque tous les 2 à 3 jours.

**Règle.** `RECAL_SURFACE_MIN_INTERVAL_DAYS = 7` (`engineering_prior`) : aucune nouvelle proposition moins de 7 jours après la dernière proposition vue, quels que soient les critères. La première proposition après la porte n'est pas concernée. Les critères de 05 s12 s'appliquent ensuite sans changement. Pas de changement de schéma (`meta.lastSurfacedCalibration.surfacedOn`).

**Parcours mesurés** (`tests/domain/convergenceJourney.test.ts`, `tests/helpers/convergenceJourney.ts` : utilisatrice virtuelle de 32 ans, 72 kg, pesée 6 jours sur 7, 85 % de journées notées, eau autocorrélée, chaque recalibration acceptée, 84 jours) :

| Scénario | Recalibrations (1.2.0 → 1.3.0) | Amplitude de la cible après la porte | Offset final / apparent (kcal/j) | Fourchette 95 % finale |
|---|---|---|---|---|
| A, maintien 300 kcal sous NASEM | 14 → 9 | 251 kcal (minimum 1 414 à J21) | −385 / −362 | −509 à −259 |
| B, A + 20 % de jours à +400 kcal non notés | 15 → 9 | 294 kcal | −514 / −477 | −640 à −388 |
| C, maintien 250 kcal au-dessus de NASEM | 15 → 8 | 286 kcal | +160 / +157 | contient +157 |

Limite qui reste : la baisse de la cible entre J14 et J21 dans A (une variation d'eau lue comme un maintien plus bas) est toujours là. L'espacement la rend visible une fois au lieu de trois, et elle se corrige à partir de J44. Aucune règle de lissage de la cible n'est ajoutée sans données réelles.

### P-01 Calibration hors du fil principal et optimisation exacte (performance, modèle 1.3.0)

**Optimisation sans changement de sortie.** Dans `fitCalibration`, la marginalisation du poids de départ (121 intercepts × pesées × 481 offsets) domine. Passe grossière d'abord (1 intercept sur 4), puis évaluation exacte de tous les intercepts voisins d'une valeur grossière située à moins de 60 unités de log de la meilleure ; les autres ont une masse relative inférieure à exp(−40). Les entrées de Hall sont précalculées une fois par jour au lieu d'une fois par offset et par jour. Comparaison à l'implémentation 1.2.0 sur 79 historiques (14 à 365 jours, mondes idéal et avec mismatch, pesée aberrante de +5 kg) : **différence maximale 0** sur chaque probabilité, la médiane et les intervalles. Coût à 365 pesées quotidiennes : 830 → 350 ms (Node, PC). `tests/science/calibrationPerf.test.ts` rapporte 84 / 180 / 365 jours et garde un seuil large (365 jours < 2 s).

**Web Worker.** `src/store/calibration.worker.ts` exécute `computeCalibrationState`. `src/store/calibrationClient.ts` choisit le worker ou un repli synchrone (tests, navigateurs sans Worker), numérote les requêtes et calcule une empreinte FNV des champs utiles du store à la place de `JSON.stringify(dailyLogs)`. `StoreProvider` applique un anti-rebond de 300 ms, ignore les réponses périmées et expose `calibrationPending`. Tant qu'un calcul est en cours, Aujourd'hui et Analyse n'annoncent pas de recalibration, l'écran de recalibration ne marque rien comme vu et le bouton « Appliquer » affiche « Mise à jour… ». Test statique : le worker n'importe que le moteur de domaine et n'utilise ni stockage ni réseau.

### M-01 Confiance « moyenne » du warm start : mesure et règle conservée (D-23, D-29)

La règle relative (largeur 80 % ≤ 75 % de celle du prior) était à réarbitrer. Mesure sur 432 warm starts (3 profils, 7 à 90 jours, 3 qualités de suivi, activité comparable ou non, 4 variations de poids) : « moyenne » dans 8,6 % des cas (26 % avec aliments pesés, 0 % sinon ; 0 % jusqu'à 21 jours, 6 % à 28 jours, 21 % à 60 jours, 25 % à 90 jours). Le critère absolu envisagé (largeur ≤ 500 kcal) donnerait 4,4 %, et 0 % pour les hommes, dont le prior est plus large. La rareté reflète une évidence réellement faible (deux pesées ponctuelles, erreur d'apport déclaré), pas un défaut de la règle : **règle conservée**, sans changement de sortie.

### J-01 Journal alimentaire : contrat de données (schéma 3, aucun changement de modèle)

Le journal collecte et affiche. **Il n'entre dans aucun calcul** : ni calibration, ni adhérence, ni warm start, ni Hall, ni plan. La façon de s'en servir sera décidée après les benchmarks 26 et 28.

- `WheightyStore.foodJournal = { journalVersion: 1, startedOn, entries, portions }`, **séparé** de `dailyLogs` et de `CurrentPlan`. Les totaux du jour (`intakeLoggedKcal`, `intakeLoggedProteinG/CarbsG/FatG`) sont calculés à l'affichage par `domain/journal.ts journalDay`, jamais stockés, et n'écrivent jamais `calorieTargetForDay` ni les macros du plan.
- `FoodEntry` : `date` (jour local de rattachement), `loggedAt` (horodatage ISO de création), `localTime` (HH:MM local de création), nom, marque, `source` (`ciqual` / `off` / `manual`), `sourceId` (alim_code ou code-barres), `sourceVersion` (version de la table Ciqual ou `last_modified_t` OFF), `resolvedAt`, `per100g` (snapshot), `quantity` (grammes, portion éventuelle), `intake` (valeurs résolues de l'entrée).
- **Snapshot obligatoire** : les valeurs sont figées à l'enregistrement. Une fiche OFF corrigée ou une nouvelle table Ciqual ne réécrit jamais un jour passé (même principe que D-13). Les récents réutilisent le snapshot de la dernière entrée, jamais une source. Supprimer une portion ne modifie pas les entrées qui l'ont utilisée.
- Saisie libre : `sourceId`, `sourceVersion` et `per100g` à `null`, poids facultatif, macros facultatives (`null` = inconnu, les totaux couvrent les valeurs connues et l'écran le dit).
- Portions personnelles : `{ id, label, grams, foodKey, createdAt }`, `foodKey = "source:sourceId"` ou `null` (utilisable pour tout aliment).
- Observables bruts conservés sans aucune dérivation : entrées horodatées (`loggedAt`, `localTime`), `startedOn` (premier jour avec une entrée) qui permet plus tard de compter les jours sans saisie. **Aucun score de qualité ou de complétude.**
- Bornes de stockage seulement : kcal pour 100 g ≤ 950, entrée ≤ 5 000 g et ≤ 20 000 kcal, nom ≤ 200 caractères.
- `Preferences.productSearchEnabled` (J-03), `false` par défaut.

**Migration 2 → 3** : ajoute `foodJournal` vide et `productSearchEnabled: false`. Rien d'existant n'est modifié. Nécessaire : un lecteur de schéma 2 supprimerait silencieusement le journal en revalidant le store ; avec le schéma 3, il refuse la version future et préserve les données brutes. Tests : store existant, fichier exporté de schéma 2, round-trip, rejet d'une entrée invalide, récupération partielle.

**Import** : tout ou rien comme avant ; un fichier importé **ne réactive jamais** la recherche en ligne (consentement propre à l'appareil). **Suppression totale** : `deleteAllData` efface le store (donc le journal) et le cache produits (préfixe `wheighty:`).

**Isolation du moteur** : `StoreProvider` retire le journal avant d'envoyer le store au worker de calibration ; l'empreinte de calibration ne lit pas le journal. Tests : empreinte et `computeCalibrationState` identiques avec et sans journal, et aucun module moteur/worker ne référence le journal.

### J-02 Table Ciqual embarquée

- Source : Anses. 2025. Table de composition nutritionnelle des aliments Ciqual 2025, doi 10.57745/RDMHWY, licence Etalab 2.0, fichier `Table Ciqual 2025_FR_2025_11_03.xlsx` (sha256 `5555c572…fbb0`, 1 541 998 o). Le fichier brut n'est pas versionné ; `tools/build-ciqual.mjs` régénère `src/data/ciqual.json` sans dépendance.
- Champs retenus : code, nom, groupe, énergie kcal (règlement UE 1169/2011), protéines (N × facteur de Jones), glucides, lipides, pour 100 g. Les 74 constituants ne sont pas embarqués (garde de taille en test : < 350 000 o).
- Conversions : `traces` et `< x` → 0 (quantités sous la limite de quantification), `-` → `null` (inconnu). 3 484 aliments, **143 exclus faute d'énergie en kcal**, 3 341 conservés, 18 avec une macro inconnue.
- Poids : JSON 244 871 o brut, 71 531 o gzip ; chunk de build `ciqual-*.js` 243,32 kB (73,83 kB gzip). Chargé par `import()` à l'ouverture de la recherche : **aucun impact sur le premier écran**, précaché par le service worker comme tout script, aucun fetch au runtime.
- Recherche locale (`domain/foodSearch.ts`) : minuscules, sans accents, ligatures œ/æ développées ; chaque mot doit commencer un mot du nom ; tri par nom commençant par la requête, puis position, puis longueur. Aucune dépendance.

### J-03 Open Food Facts : exception réseau unique, opt-in

Ce contrat casse volontairement « aucune API au runtime » (02, 03 s4), de façon assumée et bornée.

- **Un seul module réseau** : `src/adapters/openFoodFacts.ts`. Le test de politique statique n'est pas supprimé mais restreint : `fetch`/XHR/WebSocket/EventSource/beacon et URL distantes sont interdits partout ailleurs, le dossier `adapters/` ne contient que ce fichier, l'adaptateur n'importe que des types et ne lit ni store, ni stockage, ni profil.
- **Opt-in** dans Préférences, désactivé par défaut, activé via une feuille de consentement qui dit ce qui part (code-barres ou mots recherchés), ce qui ne part jamais (profil, poids, journal, identifiant) et que l'adresse IP est visible par OFF. L'opt-in est relu à **chaque appel** : désactivé, rien n'est envoyé (testé avec un `fetch` espion).
- **Requêtes** : `GET /api/v3/product/{code}?fields=…` (v3 recommandée) et `GET /cgi/search.pl?search_terms=…&json=1…`, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, aucun cookie, aucune image demandée.
- **Documentation OFF consultée le 2026-09-16**, écarts par rapport aux hypothèses du prompt :
  - limites documentées : 15 requêtes/min/IP pour les fiches produit, 10/min pour la recherche, « pas de recherche à la frappe ». L'adaptateur applique ces limites côté client (fenêtre glissante de 60 s) et la recherche se lance à la validation ;
  - la recherche plein texte n'est pas dans l'API v2 ; la doc renvoie à Search-a-licious, mais ses réponses **n'ont pas d'en-tête CORS** pour une origine navigateur (vérifié). La recherche utilise donc `/cgi/search.pl` ;
  - la convention `User-Agent: AppName/Version (contact)` ne peut pas être appliquée depuis un navigateur (en-tête interdit). La valeur part dans `X-User-Agent`, explicitement autorisé par les en-têtes CORS d'OFF (vérifié). Contact actuel : l'URL du dépôt ; **une adresse de contact produit reste à fournir**.
- **Dégradation** : hors ligne (aucune requête), échec réseau/CORS → indisponible, timeout 8 s (requête annulée, jamais de spinner infini), 404 / `product_not_found`, 429 ou 503 → limite de débit avec délai, réponse illisible → indisponible. Fiche sans kcal pour 100 g : cas normal, produit affiché comme non ajoutable avec renvoi vers la saisie libre (pas de conversion depuis les kJ). Ciqual et la saisie libre restent intégralement disponibles.
- **Cache d'usage** (`persistence/productCache.ts`, clé `wheighty:off-products`) : 100 produits consultés au plus, les plus récents d'abord, frais 7 jours, réutilisé périmé en cas d'échec réseau. Jamais exporté. Effaçable depuis les Préférences et par la suppression totale. Le service worker ne met aucune réponse tierce en cache (`runtimeCaching: []` inchangé).
- **Attributions** visibles dans Préférences, section « Sources des données » (Ciqual, Etalab 2.0 ; OFF, ODbL/DbCL, images non utilisées).

### J-04 Journal : UX de la première passe

Écran `journal` depuis Aujourd'hui (lien discret sous les macros, « Facultatif » quand rien n'est saisi), saisi **à côté** de la cible du plan du jour, sans couleur ni jugement. Ajout par feuille : recherche Ciqual et récents, produits OFF (si activé), saisie libre ; quantité en grammes ou en portions personnelles. Suppression avec annulation. Emplacement prévu pour la copy du product owner sur l'exhaustivité (`JOURNAL_TEXT.completenessGuidance`, `null` : rien n'est affiché tant qu'elle n'est pas fournie).

**Scan caméra non livré dans la passe 29** : voir J-05 (passe 30) pour la mesure des replis.

---

## 4. Tensions relevées dans la spec

- **S-01** 02 s10 demande une itération TEF/macros jusqu'à convergence. Avec le TEF natif de Hall, seule la part de glucides dépend des macros ; chaque évaluation de la bissection recalcule les macros et le résidu sur le poids à 42 jours sert de critère.
- **S-02** 03 s5 : incohérence mixte/endurance, résolue par D-14.
- **S-03** Copy de la maquette contraire à la spec, corrigé : « Katch-McArdle » (routage réel affiché), « Jamais sous 0,8 g/kg, pour tes hormones » (formulation interdite par 03 s3), « 3 pesées sur 2 semaines » (porte 05 s8), formule linéaire du slider, « Balance impédancemètre » présentée comme influençant le calcul.
- **S-04** (résolue en 1.1.0) La marche du poids de référence à IMC 30 empêchait la continuité exigée par 06 s15. Supprimée par D-21 ; la matrice teste désormais tous les profils.
- **S-05** 04 s1 d'origine demandait le « variant qui accepte les macronutriments ». Résolu par D-01 : le modèle de production est le Hall 2011 natif.

---

## 5. Hypothèses des simulateurs de calibration

### T-03 Benchmark idéal (`tests/helpers/syntheticUser.ts`, `idealRecovery.ts`)

Les critères de 06 s13 dépendent du bruit simulé. Hypothèses :

- bruit de pesée Student-t à 4 degrés de liberté, échelle 0,5 kg (écart-type environ 0,71 kg), indépendant d'un jour à l'autre ;
- écarts légers de +150 à +350 kcal, notés « léger écart » ; 4 % de jours d'écart important à +700 à +1 200 kcal ;
- 20 % de jours sans adhérence notée ; pas saisis 60 % des jours, pas réels = cible × (1 + 0,2 × N(0,1)) ;
- le « monde réel » utilise le même modèle de Hall avec un maintien décalé de l'offset vrai ;
- 126 utilisateurs (7 offsets × 2 fréquences × 3 taux d'écart léger × 3 profils), simulés sur 120 jours ; **vérité = offset apparent** (D-31), offset métabolique rapporté.

Critères bloquants à 28, 42, 84 et 120 jours : erreur médiane ≤ 125 kcal/j, couverture 80 % ≥ 0,70, couverture 95 % ≥ 0,90 (`calibration.test.ts`, `calibrationLongHorizon.test.ts`).

| Horizon | Erreur médiane | Biais | Couv. 80 % | Couv. 95 % | Largeur 80 % | Contre l'offset métabolique (rapport) : erreur, biais, couv. 80 / 95 |
|---|---|---|---|---|---|---|
| 28 j | 92 | +9 | 0,91 | 0,98 | 436 | non rapporté |
| 42 j | 46 | −2 | 0,95 | 1,00 | 303 | 68, −69, 0,84 / 0,95 |
| 84 j | 30 | +4 | 0,96 | 1,00 | 178 | 60, −61, 0,67 / 0,92 |
| 120 j | 17 | 0 | 0,99 | 1,00 | 151 | 62, −66, 0,60 / 0,87 |

Limite : un simulateur fondé sur le même modèle surestime la qualité de récupération (voir T-04). Les intervalles y sont un peu conservateurs à cause du plancher structurel (D-33).

### T-04 Benchmark avec model mismatch (`tests/helpers/mismatchWorld.ts`, `mismatchBenchmark.ts`, `mismatchSuite.ts`)

Distinct du benchmark idéal. Le monde simulé ne suit pas les hypothèses de l'estimateur ; l'estimateur est utilisé tel quel. 42 utilisateurs par scénario (7 offsets × 2 fréquences × 3 profils), comportement déclaré identique à T-03 (10 % d'écarts légers), simulés sur la durée de l'horizon (42 ou 84 jours, `calibrationMismatch.part1` à `part4`). Paramètres fixés avant de regarder les résultats, non ajustés :

- **A** dérive énergétique non modélisée, linéaire jusqu'à ±100 ou ±150 kcal/j au dernier jour ;
- **B** apport caché de +200 à +500 kcal sur 15 % des jours, déclaré « plan respecté » ou non déclaré ;
- **C** biais du podomètre de ±10 ou ±15 % (moyenne d'onboarding et logs) ;
- **D** eau autocorrélée AR(1), φ = 0,7, écart-type marginal 0,5 kg, plus bruit de mesure Student-t(4) d'échelle 0,3 kg ;
- **E** épisodes hydriques de ±0,5 à 1,0 kg pendant 2 à 5 jours, démarrant environ 1 jour sur 12, sans effet énergétique ;
- **F** combinaison A + B + C + D + E.

Vérité de référence depuis 1.3.0 : **offset apparent** (offset métabolique moyen sur la fenêtre moins l'apport excédentaire moyen, D-31). L'offset métabolique moyen et celui du dernier jour sont rapportés. Critères Wheighty v1 (critères produit, pas des constantes publiées) : erreur absolue médiane ≤ 175 kcal/j, couverture 80 % ≥ 0,70, couverture 95 % ≥ 0,90.

| Scénario | 42 j : erreur, biais, couv. 80 / 95, largeur | 84 j : erreur, biais, couv. 80 / 95, largeur | Critères |
|---|---|---|---|
| A dérive | 44, +17, 0,93 / 1,00, 308 | 34, +1, 0,98 / 1,00, 177 | tous atteints |
| B apport caché | 57, +25, 0,95 / 0,98, 309 | 30, −1, 1,00 / 1,00, 177 | tous atteints |
| C biais des pas | 63, +16, 0,90 / 1,00, 299 | 30, +6, 0,98 / 1,00, 177 | tous atteints |
| D eau autocorrélée | 80, +26, 0,88 / 0,95, 305 | 34, 0, 0,79 / 1,00, 175 | tous atteints |
| E épisodes hydriques | 62, −1, 0,88 / 0,98, 307 | 26, +4, 0,88 / 0,98, 180 | tous atteints |
| F combiné | 77, +13, 0,79 / **0,88**, 314 | 44, −5, 0,81 / 1,00, 183 | couverture 95 % non atteinte à 42 j |

Rapport contre l'offset métabolique moyen (erreur et biais à 42 j, puis à 84 j) : A 52 / −45 et 59 / −61 ; B 82 / −87 et 116 / −118 ; C 84 / −50 et 66 / −59 ; D 77 / −32 et 74 / −63 ; E 79 / −64 et 52 / −57 ; F 127 / −101 et 123 / −124. Ce biais négatif est l'apport excédentaire moyen : il est attendu pour l'estimande apparent.

Avec 42 utilisateurs, l'erreur d'échantillonnage d'une couverture est d'environ ±0,06. Historique : en 1.1.0 et 1.2.0, contre l'offset métabolique et sans plancher structurel, 4 scénarios sur 6 manquaient au moins un critère de couverture à 42 jours. Causes identifiées alors et traitement en 1.3.0 :

1. **Biais négatif** (−47 à −52 kcal/j dès le monde idéal) : c'était l'apport des écarts déclarés, que le moteur suppose mangés à la cible. Absorbé par la définition de l'estimande (D-31).
2. **Apport caché (B)** : même mécanisme, sans possibilité de pondération. Même traitement.
3. **Intervalles trop étroits face au bruit autocorrélé (D)** : la vraisemblance Student-t suppose des pesées indépendantes. Traité par le plancher structurel (D-33) ; le tempérage des pesées rapprochées n'a pas été nécessaire.
4. **Biais des pas (C)** : l'écart entre pas enregistrés et pas réels change l'énergie attribuée aux variations de pas. Couvert par D-33.
5. **Combinaison (F)** : seul cas encore non atteint (couverture 95 % à 42 jours), documenté sans réglage.

Le test enregistre l'issue de chaque critère : un changement (amélioration ou dégradation) le fait échouer et oblige à mettre ce tableau à jour.

---

## 6. Hypothèses d'ingénierie et règles produit (pas des constantes publiées)

Registre complet dans `CONSTANT_METADATA`. Principales :

- routage sportif : 19 à 35 ans, ≥ 6 h et ≥ 4 séances par semaine ;
- validité de la calorimétrie : 12 mois et 5 % de variation de poids ;
- scores de qualité de composition corporelle ; seuil de désaccord REE à 10 % ;
- prior ADL = 0,20 × REE ; TEF de référence du classifieur et de la décomposition à 10 % ; distance de frontière PAL 0,05 ;
- multiplicateurs d'incertitude 1,15 (frontière PAL, métier physique, désaccord REE, cadence par défaut) ;
- posture : 0 / 18 / 54 / 54 kcal ; cadences d'allure ; cadence de course 160 pas/min ;
- poids nutritionnel de référence : IMC 25 + 0,33 de l'excédent (D-21) ; centres protéiques ; plancher de lipides 0,6 g/kg ; parts de lipides 25 à 30 % ;
- vitesses : plages 0,2 à 1,0 % (perte) et 0,1 à 0,5 % (prise), valeurs initiales 0,5 et 0,25 %, zones qualitatives, pas de 0,05 %, bornes IMC 0,25 / 0,5 / 1,0 %, seuil de prudence 0,75 % (D-22) ;
- plancher de 1 200 kcal (femmes) ou 1 500 kcal (hommes) et de 0,70 × REE (D-32) ;
- zone de maintien ; horizon de 42 jours ; tolérances du solveur ; bornes de recherche de 400 à 9 000 kcal ;
- limites du slider pas ;
- calibration : Student-t df 4, échelle 0,6 kg, grille de −1 200 à +1 200 par pas de 5 (support numérique seulement, D-28), poids d'adhérence, facteur 0,7 pour pas manquants, grille du poids de départ ±3 kg par 0,05 kg, plancher d'incertitude structurelle σ = 50 kcal/j (D-33) ;
- porte de première recalibration ; seuils de confiance ; seuils d'affichage de recalibration, dont 7 jours minimum entre deux propositions (D-34) ;
- warm start : 7 jours minimum, bornes de saisie, incertitudes d'apport 10 / 20 / 30 %, activité +200 kcal/j, plancher de modèle 100 kcal/j, borne de cohérence ±1 200 kcal/j (`product_safety_rule` à sourcer, D-28, signal sans effet numérique depuis 1.2.0), support d'évidence ±3 000 kcal/j (D-29), seuil de conflit z = 2 (statistique prédictive), confiance moyenne si largeur ≤ 75 % du prior (D-23) ;
- demi-vie de la tendance de 7 jours ; rappel de pesée tous les 3 jours ;
- part de glucides de base (D-16), plancher de masse grasse initiale de 2 %, bornes IMC 16 à 70, limite de raideur RK4 (N-01), apport de base minimal admissible de Hall 1 kcal/j (B1, D-28).

Tout changement de ces valeurs impose de monter `SCIENTIFIC_MODEL_VERSION`.

Constantes retirées parce qu'aucun code ne les lisait (sorties inchangées, pas de bump) : `SOLVER_ENERGY_RESIDUAL_KCAL` et `SOLVER_TEF_MAX_ITERATIONS` (itération TEF/macros devenue sans objet avec le TEF natif, S-01), `SLIDER_TRAJECTORY_TOLERANCE_KG` (la tolérance de 0,05 kg du slider est vérifiée directement par `goals.test.ts`).

---

## 7. Limites connues

- Le modèle de Hall est validé contre une transcription de `bw` (portage numérique), pas contre le Planner NIDDK officiel (D-02), et jamais contre des données humaines. Les simulateurs utilisent ce même modèle : ils sont optimistes par construction. La bêta ne collecte aucune donnée : cette limite reste ouverte.
- Modèle macronutriments complet de Hall 2006/2010 non porté ; la composition n'agit que par les glucides (D-01).
- La calibration estime un maintien apparent (D-31) : il inclut les écarts habituels, déclarés ou non, et ne décrit pas la physiologie d'un utilisateur qui note mal ses journées.
- Un seul offset constant sur toute la fenêtre, sans fenêtre glissante ; pour les historiques très longs ou une dérive, l'offset représente une moyenne. À réévaluer si une dérive devient visible chez les testeurs.
- À chaque replanification, le modèle de Hall repart à l'équilibre au poids actuel : l'adaptation métabolique accumulée pendant la fenêtre est effacée. Effet côté prudent (maintien légèrement surestimé, perte un peu plus lente que prévu), non traité en bêta.
- Les 4 équations NASEM sont discrètes : quelques centaines de pas peuvent déplacer le maintien initial de 150 à 370 kcal au passage d'une catégorie. L'incertitude est élargie près des frontières, la vue digeste le signale depuis 1.3.0 et la calibration corrige ensuite. Pas d'interpolation, qui s'écarterait des équations publiées.
- L'énergie des pas ignore la taille (longueur de foulée) : la cadence est fixée par allure (02 s2).
- Après la porte, une variation d'eau peut encore faire baisser la cible pendant la première semaine de calibration (parcours A, D-34) ; elle se corrige ensuite.
- Warm start : incertitudes d'apport et seuils non validés sur données réelles ; l'historique est supposé à activité et offset constants (D-23). La confiance « moyenne » est rare par construction (M-01).
- Troubles du comportement alimentaire : exclusion déclarative seulement (case à cocher), sans dépistage ni alerte de perte rapide ou de plancher répété. Mis de côté par décision produit pour la bêta.
- Les unités impériales ne concernent que l'affichage et la saisie : le stockage reste en kg et cm.
- Pas de notification système : rappel de pesée dans l'app seulement.
- Les écrans sont pensés pour le mobile ; sur desktop, l'app s'affiche dans une colonne centrée de 430 px.
- Un plan enregistré avec un modèle antérieur garde ses valeurs et sa version jusqu'à la prochaine reconstruction (changement d'objectif, profil, slider, recalibration) ; `matchesStoredPlan` signale l'écart de version.

---

## 8. Vérifications effectuées

- Passe bêta, modèle 1.3.0 : `npm run typecheck`, `npm run lint`, `npm test` (30 fichiers, 363 tests), `npm run build`. Optimisation de `fitCalibration` comparée au bit près à 1.2.0 sur 79 historiques (P-01). Benchmarks T-03 et T-04 réenregistrés, parcours de convergence ajouté. Golden : seuls les planchers masculins changent (D-32). Cas de référence R et S du warm start : seule la version du modèle change dans leur snapshot.
- `npm run typecheck`, `npm run lint`, `npm test` (25 fichiers, 312 tests), `npm run build`.
- Panneau « Pourquoi ce résultat ? » (D-30) : captures des deux modes sur les cas R et S, métrique et impérial, clair et sombre, viewport mobile 375 px (Edge headless) ; aucune sortie scientifique modifiée.
- Modèle 1.2.0 (D-29) : golden, T-03 et T-04 identiques au bit près à 1.1.0 ; deltas des cas R, S, D-23 et aberrants, balayages et benchmark de couverture rejoués (D-29).
- Correctif neutre du warm start (D-28) : capture avant/après comparée au bit près (golden, T-03, T-04, panneau des cas A et B, balayages, matrice de stress), aucune différence.
- Navigateur (serveur de dev, viewport mobile 375 × 812), passe UX v2 : intro descendue et titres en Bricolage Grotesque ; écran prénom / nom ; âge vide avec placeholder 22, premier + à 22 puis 24 ; composition corporelle (« Ignorer » seul, « Continuer » avec DXA, masqué à la désactivation) ; activités sans randonnée ; « Non » par défaut et « Facultatif » secondaire ; historique à champ de jours unique et poids de départ vide ; maintien sans cible ni vitesse ; vitesse 1,0 % ; Point de départ sans scroll (1 440 kcal, 7 000 pas, maintien 2 110) ; « Pourquoi ce résultat ? » digeste, puis détails après activation et rechargement (recalcul identique au plan enregistré) ; avatar « LT » ; Analyse avec 4 critères et sans « Ajouter une pesée » ; Plan sans projection. Nom, évidence et préférence persistés. Aucune erreur console.
- Navigateur (serveur de dev, viewport mobile), passe 1.1.0 : splash sans points ; profil (âge 22 stocké, + et − synchronisés avec la valeur affichée, Homme présélectionné, placeholders gris non enregistrés, bloc de sécurité à 10,5 px en `--ink2`) ; activité (sous-texte retiré, Assis présélectionné, puce « Randonnée / marche sportive », pas de « Marche ») ; historique (apparition progressive, poids du jour prérempli, 28 jours ajustables) ; objectif (0,5 % ≈ 0,34 kg / sem. pour 68 kg, borne 0,5 % imposée par l'IMC et non franchissable au clavier, zones qualitatives) ; résultat avec warm start (maintien personnalisé, fourchette plus étroite, confiance « Moyenne », provenance dans le résultat et dans « Comment c'est calculé ? ») ; persistance en schéma 2 avec l'évidence et le snapshot `warm_start`, rechargement ; écran Plan (vitesse en %) ; feuille d'objectif (plage de prise 0,1 à 0,5 %, pas de slider en maintien). Aucune erreur console.
- Passe 1.0.0 (inchangé) : onboarding complet, recalibration appliquée, Suivi, Projection, Profil, mode sombre, build sous `/wheighty/` avec service worker et fonctionnement hors ligne.

---

## 9. Changements du modèle 1.1.0 par rapport à 1.0.0

| Domaine | 1.0.0 | 1.1.0 |
|---|---|---|
| TEF dans Hall | TEF par macro greffé (`macro_specific`) | TEF natif β = 0,10 uniquement (D-01) |
| Poids de référence | marche à IMC 30 | continu, IMC 25 + 0,33 × excédent (D-21) |
| Vitesse | 3 presets | slider continu en % du poids, borné par le moteur (D-22) |
| Démarrage | prior populationnel seul | warm start facultatif depuis l'historique (D-23) |
| Calibration | inchangée | log-vraisemblance historique ajoutée si warm start ; sous-pas RK4 si raide (N-01) |
| Validation | benchmark idéal à 28 j | idéal à 28 et 42 j + benchmark model mismatch (T-04) |
| Schéma | 1 | 2 (vitesse continue, évidence historique), migration testée |
| Onboarding | presets, âge et sexe sans valeur réelle | un écran par information, âge vide à placeholder, noms locaux (D-24) |
| Explication | « Comment c'est calculé ? » générique | « Pourquoi ce résultat ? » personnalisé, détails scientifiques réels (D-25, sans effet sur le calcul) |

Profils golden modifiés (tous les 12) : calories de −10,5 à +52,5 kcal/j (01 +2 ; 02 +52 ; 03 −10 ; 04 +30 ; 05 +10 ; 06 +17 ; 07 +22 ; 08 +35 ; 09 +6 ; 10 +45 ; 11 +26 ; 12 −1) ; protéines changées pour 05 (105 → 120 g), 06 (124 → 142 g) et 08 (98 → 94 g) ; jours jusqu'à la cible : 03 178 → 180, 05 377 → 381, 06 200 → 201, 12 390 → 391 ; champ `appliedSpeed` remplacé par `rateAdjusted`. Les vitesses des profils golden reprennent exactement les anciens presets.

---

## 10. Changements du modèle 1.2.0 par rapport à 1.1.0

| Domaine | 1.1.0 | 1.2.0 |
|---|---|---|
| Flag `incoherent` | offset linéarisé hors ±1 200, écart-type de la vraisemblance × 2 | racine exacte hors ±1 200, signal sans effet numérique (D-29) |
| z de conflit | offset linéarisé / √(σ_historique² + σ_prior²) | statistique prédictive du prior sur la distribution exacte, seuil 2 inchangé |
| « Historique seul » | grille de calibration ±1 200, tronquée | support d'évidence ±3 000 borné par le domaine de Hall |
| Posterior fusionné, handoff calibration | grille de calibration | inchangés (grille), identiques sauf historiques anciennement incohérents |
| Constantes | `WARM_START_INCOHERENT_SIGMA_MULTIPLIER = 2` | supprimée ; `WARM_START_EVIDENCE_SUPPORT_HALF_WIDTH_KCAL = 3000` ajoutée |
| Golden, T-03, T-04 | | identiques au bit près |

---

## 11. Changements du modèle 1.3.0 par rapport à 1.2.0 (passe bêta)

| Domaine | 1.2.0 | 1.3.0 |
|---|---|---|
| Estimande de la calibration | implicite (« maintien ») | maintien apparent, défini et affiché (D-31) |
| Plancher calorique | max(1 200, 0,7 × REE) | max(1 200 femmes ou 1 500 hommes, 0,7 × REE) (D-32) |
| Posterior de calibration | grille, sans erreur de modèle | convolué avec N(0, 50 kcal/j) (D-33) |
| Recalibrations proposées | critères 05 s12 seuls | au plus une par 7 jours (D-34) |
| Calcul | fil principal, 830 ms à 365 pesées | Web Worker, 350 ms, sorties identiques (P-01) |
| Vue digeste | | définition du maintien, note de frontière PAL |
| Confiance du warm start | règle relative à réarbitrer | mesurée et conservée (M-01) |
| Benchmarks | T-03 à 28 et 42 j, T-04 à 42 j, vérité métabolique | T-03 à 28, 42, 84 et 120 j ; T-04 à 42 et 84 j ; vérité apparente ; parcours de convergence |
| Constantes | `ABSOLUTE_MIN_CALORIES` | `ABSOLUTE_MIN_CALORIES_FEMALE`, `ABSOLUTE_MIN_CALORIES_MALE`, `CALIBRATION_STRUCTURAL_SD_KCAL`, `RECAL_SURFACE_MIN_INTERVAL_DAYS` |
| Schéma | 2 | 2 (inchangé) |
