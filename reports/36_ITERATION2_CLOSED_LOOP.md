# 36 : batterie « journal dans la calibration », itération 2 (boucle fermée)

Mesures seulement : aucune fonctionnalité visible, aucune sortie de production modifiée quand les options sont absentes. Branche `bench/journal-battery`, rien sur `main`, aucun merge. Seuils : `tests/experiments-journal/THRESHOLDS.md`, amendements 1 et 2. Tableaux : `tests/experiments-journal/results/tables2.md` et `verdicts2.json`.

Conventions : **[lu]** chemin:lignes ; **[mesuré]** fichier de résultats ; **[déduit]** raisonnement.

## Synthèse

| Étape | Résultat |
|---|---|
| 4.7 non-régression, options absentes | **0 différence** sur 2 523 011 valeurs |
| 6.1 monde idéal | **ÉCHEC** : médiane du ratio 0,653 en perte et 0,700 en prise, hors de [0,9 ; 1,1] |
| 6.2 appariement | 0 différence (120 utilisateurs, dont 48 bifurqués ; 600 bras) |
| Arrêt | **Règle 9.1 : arrêt immédiat après 6.1.** Pas de pilote de coût (6.3), pas de C1, pas de glucides (7.3), pas de C2 ni de C6. |

L'échec de 6.1 a été instruit avant l'arrêt pour savoir s'il venait du simulateur. Aucun défaut du simulateur n'a été trouvé. L'écart apparaît dès le modèle du solveur de production lui-même (section 2.4).

---

## 0. État de départ et commit de l'amendement 2

- **[mesuré]** `git status` au départ, branche `bench/journal-battery` :
  - `.gitignore` modifié hors de mes commits : la ligne `/reports` est retirée. Je n'y ai pas touché et ne l'ai pas commité ;
  - non suivis : `reports/31_…`, `33_…`, `34_…`, `35_…`, `tests/experiments-journal/results/results.zip`.
- **[mesuré]** `git log --oneline -3` : `1b79087 bench(journal): phase 1b tables and verdicts rebuilt from the raw exports (s4 to s7)`, `0fe5674 …`, `91c65f9 …`.
- **[mesuré]** `npm run check` au départ : **vert**. Typecheck et lint sans erreur, **520 / 520** tests (43 fichiers), 51 s.
- **Commit de l'amendement 2 : `b8a8fbd`**, fichier `THRESHOLDS.md` seul, avant toute exécution de mesure.
  - **[mesuré]** Le texte ajouté est identique aux lignes 263 à 282 du prompt (`diff` sans différence).
  - Comme en 1b, j'ai copié le contenu du bloc ```` ```markdown ```` sans ses lignes de clôture, précédé d'une ligne vide.
- **[mesuré]** `npm run check` à la fin : **vert**, **526 / 526** tests (44 fichiers), 41 s.

Commits de l'itération :

| Commit | Contenu |
|---|---|
| `b8a8fbd` | amendement 2 (s2) |
| `a45412a` | options du prototype, tests, preuve de non-régression (s4) |
| `994eb90` | simulateur en boucle fermée et lanceur de tâches (s5) |
| `b36a773` | bruts des contrôles 6.1 et 6.2, diagnostic de 6.1, script des tableaux, tableaux (s6) |

Ce rapport, sous `reports/`, n'est pas commité, comme les rapports 34 et 35.

## 1. Prototype complété

### Fichiers et signatures

- **`src/science/calibration.ts`** **[lu]** :
  - `IntakeObservation.loggedCarbsG?: number` (l. 115-116) ;
  - `IntakeObservationsInput.carbSource?: 'baseline' | 'harness_scaled' | 'logged'` (l. 130) ;
  - dans `reconstructJournalDays`, pour un jour exploitable avec `'logged'`, glucides Hall = `max(0, loggedCarbsG) × 4`. Un jour non exploitable garde part de base × apport imputé (l. 274-276). Si la valeur manque sur un jour exploitable, une erreur est levée : pas de repli silencieux.
- **`src/domain/intakeObservations.ts`** **[lu]** : `intakeObservationsFrom(store, from, to, rule, options: IntakeObservationOptions = {})`, avec `IntakeObservationOptions = { withCarbs?: boolean }` (l. 30-37). Avec `withCarbs`, chaque jour porte `loggedCarbsG` = `journalDay(…).intakeLoggedCarbsG` (l. 61). La passerelle reste la seule lecture du journal (D8).
- **`src/domain/journalCalibration.ts`** **[lu]** :
  - `JournalRegimeOptions.weighInDensity?: JournalGateDensity`, avec `JournalGateDensity = { minSpanDays; minWeighInDayFraction }` (l. 53, 61) ;
  - `carbSource: 'logged'` demande les glucides à la passerelle (l. 98) ;
  - `evaluateJournalGate(weights, observations, density?) : JournalGateStatus` (l. 133). Avec `density`, `met` exige en plus `spanDays ≥ minSpanDays` et une fraction de jours pesés ≥ X, détaillées dans `density` (l. 181-185). La fraction vaut : pesées valides (une par jour) / jours de la première à la dernière pesée, bornes incluses (convention de la couverture d'adhérence, D-11).
- **`src/science/goals.ts`** **[lu]** :
  - `PlanContext.hardFloorMultiplier?: number` (l. 91) ;
  - `planHardFloorKcal(ctx)` = plancher D-32, × le facteur s'il est présent (l. 106-108) ;
  - utilisé à la place de `hardFloorKcal(ctx.reeKcal, ctx.sex)` dans `evaluateWeeklyRate`, `buildGoalPlan` et `solveSliderPoint` (l. 327, 369, 564). Le solveur n'est pas réécrit.
- **Harness** (`tests/helpers/closedLoop.ts`) **[lu]** :
  - `revisionProposalTriggered(gate)` (4.3, l. 673) : `!met && enoughWeighIns && enoughSpan && !enoughCleanWeighIns` ;
  - `withChosenTarget(store, date, targetKcal)` (4.5, l. 687) : plancher D-32 au poids de tendance courant, macros par `macrosFor` (solveur de production), remplacement compté ;
  - `journalGoalPlan` (4.1, l. 703) : `buildGoalPlan` avec maintien = NASEM(poids de tendance) + médiane du mode journal, et le facteur de plancher du bras.
- **Tests ajoutés** (`tests/domain/journalCalibration.test.ts`) :
  - 4.2 : pour X ∈ {100 ; 85 ; 70 %}, une pesée tous les 3 jours ou chaque semaine ne franchit jamais la porte, pour toute durée de 14 à 364 jours ;
  - pesée quotidienne : porte franchie à partir de 28 jours d'écart seulement ; sans l'option, porte inchangée ;
  - 25 pesées sur 29 jours passent 85 % et 70 %, pas 100 % ;
  - 4.4 : les glucides saisis ne sont lus que sur les jours exploitables et via la passerelle ;
  - plancher × 1,10 : absent par défaut, et il réduit la vitesse retenue quand il mord.
- **Test du monde** : `tests/domain/closedLoopHall.test.ts` (section 2.1).
- **Isolement (4.6)** **[mesuré]** : aucun appel depuis le store, le worker ou l'UI. Le test statique D8 (`tests/domain/foodJournal.test.ts`) reste vert dans `npm run check`.

### Écarts au prompt et raisons

1. **Plancher × 1,10 dans `src/science/goals.ts`.** Le plancher agit dans la boucle des vitesses : une vitesse dont la cible passe sous le plancher est rejetée, et la suivante, plus lente, est essayée (`evaluateWeeklyRate`). L'appliquer après coup dans le harness aurait réécrit cette boucle. Une option absente par défaut a été ajoutée, couverte par la preuve 4.7.
2. **Plancher du bras J en C1** : j'applique le plancher saisi × 1,10. **Lecture de 5.4** : le bras J-NASEM est décrit « comme J, avec prior NASEM et plancher saisi non relevé », ce qui implique que J a un plancher relevé. C6 compare ensuite × 1 et × 1,10. Choix déclaré, sans effet sur cette itération puisque C1 n'a pas tourné.
3. **Plan du mode journal construit dans le harness**, sans la projection d'affichage. Mêmes entrées que `buildPlanFromStore` (objectif, vitesse et cible du profil, pas de référence ; **[lu]** `src/domain/engine.ts:72-78`, `:694-699`), avec le solveur et le solveur de macros de production.
4. **Première recalibration du mode journal** : proposée dès que la porte est franchie, sans le critère de changement de D-34. Les suivantes suivent `shouldSurfaceRecalibration`, avec la dernière recalibration du mode journal comme référence.
5. **`evaluateJournalGate`** renvoie un sur-type `JournalGateStatus` de `GateStatus`, avec un champ `density` optionnel.

### Preuve de non-régression (4.7)

- **Capture** : mêmes scripts que les phases 1 et 1b (`tests/experiments-journal/capture/`) : T-03, T-04, golden, R et S (view-model complet), `convergenceJourney`.
  - **Avant** : `b8a8fbd`, dont `src/` est identique à `1b79087`.
  - **Après** : options de la section 4, absentes.
- **[mesuré]** `tests/experiments-journal/results/nonregression2.txt` : **2 523 011 valeurs numériques, 0 différence**. Détail : T-03 1 003 779, T-04 1 497 006, golden 3 483, R/S 9 847, journey 8 896 ; 554 identifiants aléatoires masqués.
- **[mesuré]** T-03, T-04 et golden sont identiques à l'octet. Leurs préfixes sha256 sont ceux des phases 1 et 1b : `3447793a…`, `c65c47cf…`, `e20b17f4…`.

## 2. Simulateur

Code : `tests/helpers/closedLoop.ts`, `tests/helpers/closedLoopHall.ts`, `tests/experiments-journal/it2/jobs.ts`. L'utilisateur simulé passe par les cas d'usage réels du domaine :

- `completeOnboarding`, `ensureDailyLogs`, `setAdherence`, `setActualSteps`, `addWeight`, `addFoodEntry` (3 repas) ;
- `computeCalibrationState`, `applyRecalibration`, `markRecalibrationSeen` ;
- côté journal, `journalCalibrationInputFromStore`, `evaluateJournalGate` et `fitCalibration`.

Déroulé d'un jour d : pesée du matin, puis évaluation hebdomadaire (jours 7, 14, …), puis apport et saisie du jour, puis un jour de Hall.

### 2.1 Monde physique (paramètres effectifs)

**Hall perturbé**, par utilisateur, chaque facteur tiré dans U(0,8 ; 1,2) **[lu]** `tests/helpers/closedLoopHall.ts:1-14`.

| Paramètre du prompt | Nom dans le code |
|---|---|
| adaptation thermique | `HALL_BETA_AT` |
| coût de dépôt du gras / du maigre | `HALL_ETA_F_KCAL_PER_KG` / `HALL_ETA_L_KCAL_PER_KG` |
| partition gras / maigre | `HALL_FORBES_C_KG` |
| eau liée au glycogène | `HALL_GLYCOGEN_WATER_MULTIPLIER` |

- Densités (`HALL_RHO_*`) et autres constantes : nominales.
- **[mesuré]** Avec les facteurs à 1, la trajectoire est identique au bit près à `src/science/hall/model.ts` sur 3 profils × 168 jours (test `closedLoopHall.test.ts`, vert). Chaque facteur à 1,2 modifie la trajectoire et garde l'état de base stationnaire.

**Départ du monde** (convention de la phase 1) **[lu]** `closedLoop.ts:467-495` :

- le poids d'onboarding est une pesée bruitée : poids vrai = déclaré − bruit du jour 0 ;
- maintien vrai de départ = NASEM(poids déclaré) + offset, offset ~ N(0, σ du profil) ;
- régime habituel = part glucidique de base (celle de l'estimateur).

**Pesées** : Student-t (4 ddl, échelle 0,6 kg), plus les composantes des scénarios existants **[lu]** `tests/helpers/mismatchBenchmark.ts`.

| Composante | Paramètres |
|---|---|
| D (eau autocorrélée) | AR(1), φ = 0,7, écart-type marginal 0,5 kg |
| E (épisodes hydriques) | début avec une probabilité de 0,08 par jour, durée 2 à 5 jours, ±0,5 à 1,0 kg |

- Au benchmark de calibration, D réduisait l'échelle t à 0,3 kg. Ici, conformément à 5.2, t reste à 0,6 kg et D et E s'ajoutent.
- Jours pesés : Bernoulli(p), p ∈ {1 ; 0,9 ; 0,75}. Le jour 0 est toujours pesé.

**Pas** : réels = cible × (1 + 0,2 z), comme `tests/helpers/mismatchWorld.ts` ; l'estimateur reçoit les pas réels.

**Macros mangées** : protéines = protéines du plan en vigueur ; glucides = part × apport réel ; lipides = reste. La part est celle de base, ou base ± 10 points dans les mondes 7.3.

**Saisie** : macro × (1 + u) × (1 + 0,08 z_jour) ; monde sélectif : lipides × (1 + u − 0,10). Total saisi = 4 P + 4 G + 9 L.

**Comportements** (5.3), avec ces choix déclarés :

- **Non-suiveurs** : les 20 % de jours sans « écart important » sont déclarés « plan respecté » (l. 993).
- **Jours d'écart (× 1,25)** : seulement quand l'utilisateur vise une cible après la bascule.
- **Utilisateur qui vise une cible dans son journal** : apport réel = cible / (1 + u) × (1 + 0,08 z) ; protéines = protéines affichées / (1 + u).

**Profils** : hypercube latin comme en phase 1, plus 4 dimensions (s, p, fréquence des jours d'écart, vitesse de perte {0,5 ; 1 %}), et R et S (4 % chacun). Choix déclarés :

- cible de perte = poids à IMC 18,5 (`TARGET_BMI_MIN`), pour qu'aucune cible ne soit atteinte en 168 jours ;
- cible de prise = + 10 % ;
- R et S reçoivent la même cible de perte, à 1 %/semaine.

**Graines** : bases à partir de 1,0·10⁹ (`SEED_BASES`, l. 99), flux dérivés maître + k × 1 000 003. Elles sont disjointes de toutes les graines des phases 1 et 1b (toutes < 6·10⁶). Graines consommées dans cette itération :

- idéal : 1,05·10⁹ ;
- appariement : 1,10·10⁹ ;
- pilote : 1,0·10⁹, mise au point seulement.

Les graines d'entraînement et de validation n'ont pas été utilisées.

### 2.2 Contrôle 6.1 : monde idéal

- **Monde** : Hall nominal, pesées sans bruit, u = 0, suiveurs parfaits (plan respecté chaque jour, apport = cible, pas = cible, aucun jour d'écart). Graines 1,05·10⁹, 200 utilisateurs (79 en perte, 61 en prise, 60 en maintien), bras A.
- **Ratio** : définition de 7.2. Pente du poids vrai sur chaque bloc de 4 semaines (semaines 5 à 24), divisée par la vitesse du plan actif × le poids vrai au début du bloc. Blocs regroupés, IC par bootstrap sur les utilisateurs.

**[mesuré]** `results/controls2/ideal-shard*.csv.gz`, `tables2.md` :

| Objectif | Fenêtre | Médiane [IC 95 %] | P10 / P90 |
|---|---|---|---|
| perte | semaines 5 à 12 | 0,693 [0,673 ; 0,707] | 0,550 / 0,794 |
| perte | semaines 13 à 24 | 0,630 [0,607 ; 0,650] | 0,473 / 0,730 |
| **perte** | **semaines 5 à 24** | **0,653 [0,635 ; 0,672]** | 0,493 / 0,755 |
| prise | semaines 5 à 12 | 0,768 [0,747 ; 0,790] | 0,614 / 0,883 |
| prise | semaines 13 à 24 | 0,669 [0,657 ; 0,682] | 0,550 / 0,757 |
| **prise** | **semaines 5 à 24** | **0,700 [0,682 ; 0,716]** | 0,562 / 0,831 |

- **Autre lecture** : avec la vitesse demandée du profil (`requestedWeeklyRate`) au lieu de celle du plan actif, 0,644 en perte et 0,700 en prise. Même verdict.
- **Verdict 6.1 : ÉCHEC**, dans les deux objectifs et les deux fenêtres.
- **Autres constats [mesuré]** :
  - 0 proposition de révision ;
  - 8 recalibrations appliquées en médiane ;
  - 3 utilisateurs dont les recalibrations échouent en `no_feasible_speed` : deux en perte (femme IMC 21, 64 ans ; homme IMC 26, 63 ans), et une femme de 150 cm en maintien. Pour eux, même la vitesse minimale donne une cible sous le plancher. Le plan en cours reste en place.

### 2.3 Contrôle 6.2 : appariement

**[mesuré]** `results/controls2/pairing-shard*.json`. 120 non-suiveurs de P10 (graines 1,10·10⁹), dont 48 avec une proposition, donc bifurqués.

- Bras A, J, C, J-NASEM et J-glucides : chacun est comparé à son rejeu intégral depuis le jour 0 (`simulateArmFromScratch`), soit **600 comparaisons, 0 différence**.
- Comparaison au caractère près du JSON (doubles à aller-retour exact), sur :
  - les séries quotidiennes (poids vrai, apports réel et saisi, glucides saisis, cible, vitesse, plancher réel, jours visés) ;
  - les plans, les évaluations et les diagnostics ;
  - les pesées, les journaux quotidiens et les entrées du journal.
- **Contrôle 6.2 : passé.**

### 2.4 Instruction de l'échec de 6.1 (diagnostic, sans critère)

**Script** : `tests/experiments-journal/it2/ideal-diagnostic.experiment.ts`. **Résultats** : `results/controls2/ideal-diagnostic-shard*.csv.gz`.

**Méthode.** Pour chaque utilisateur en perte ou en prise du monde idéal, et chaque début de bloc D (28, 56, 84, 112, 140), avec le plan actif au jour D, le script calcule :

1. le **ratio du monde** sur 28 jours ;
2. le **ratio implicite du solveur de production** : pente des jours 7 à 35 de son propre modèle de Hall démarré à l'équilibre au poids vrai, avec comme apport de base le maintien du plan (`hallParametersFor`, `hallInputFor`) ;
3. la part, dans ce modèle, de la variation sur 42 jours qui tombe en première semaine ;
4. la variation du poids vrai du monde sur 42 jours, en mangeant le maintien du plan ;
5. l'adaptation thermique (AT) du monde au jour D ;
6. l'erreur de l'offset estimé.

**[mesuré]** Médianes, tous blocs (`tables2.md`, « Diagnostic ») :

| Objectif | Ratio du monde | Ratio implicite du solveur (jours 7 à 35) | Part de la semaine 1 dans les 42 j du solveur | Poids vrai sur 42 j au maintien du plan | AT du monde | Offset estimé − vrai |
|---|---|---|---|---|---|---|
| perte (n = 395) | 0,653 | 0,779 | 0,364 | +0,755 kg | −74,7 kcal/j | +1,6 kcal/j |
| prise (n = 305) | 0,700 | 0,779 | 0,360 | −0,336 kg | +33,5 kcal/j | +1,0 kcal/j |

Sur deux utilisateurs examinés en détail au jour 84 (sortie de mise au point, non commitée) : le Hall recalé à l'équilibre au poids vrai reproduit la prédiction du solveur à 0,011 kg près sur 42 jours (3,645 contre 3,634 kg).

**Constats :**

- **[mesuré]** L'estimation n'est pas en cause : l'erreur médiane de l'offset vaut +1,6 kcal/j en perte et +1,0 kcal/j en prise.
- **[mesuré]** Le modèle du solveur lui-même ne donne que 0,78 de la vitesse visée une fois sa première semaine passée : 36 % de sa variation sur 42 jours tombe dans cette semaine.
- **[lu]** Le solveur vise le poids W × (1 − r)^6 au jour 42 (`src/science/goals.ts:260`, horizon `GOAL_SOLVER_HORIZON_DAYS = 42`, `constants.ts:220`). Il part d'un état initial à l'équilibre : AT = 0, glycogène et liquide extracellulaire de base (`src/science/hall/model.ts:205-207`, via `hallParametersFor`, `goals.ts:135` et `:177`). Le maintien du plan recalculé vaut NASEM(poids de tendance) + offset (`src/domain/engine.ts:72`).
- **[déduit]** Chaque plan compte donc sur une perte (ou un gain) rapide d'eau et de glycogène en début de plan. Un corps déjà en déficit ou en surplus depuis des semaines ne la produit pas. Les blocs mesurés commencent à la semaine 5.
- **[mesuré]** L'écart restant, de 0,78 à 0,65, va avec une dérive du monde au maintien du plan (+0,76 kg sur 42 j en perte) et une AT accumulée de −75 kcal/j que ce maintien ne contient pas.
- **[mesuré]** Le ratio du monde baisse au fil des blocs : en perte, 0,704 au jour 28, puis 0,675, 0,652, 0,623, 0,605.
- **[déduit]** La cause de l'échec est dans la chaîne de production (solveur et règle de maintien), pas dans le simulateur. Elle s'appliquerait aussi aux bras J et C, qui utilisent le même solveur (4.1).

Pas de correction : l'estimateur et le solveur de production n'ont pas été modifiés.

### 2.5 Pilote de coût (6.3)

Non exécuté : l'arrêt de 9.1 intervient avant.

**[mesuré]** Coûts observés pendant les contrôles, machine à 16 threads, 16 processus en parallèle :

- 6.1 : 200 utilisateurs (bras A, 168 jours) en 52 s réelles, 3,8 s de calcul par utilisateur en moyenne ;
- 6.2 : 120 utilisateurs × 5 bras, avec rejeux complets, en 206 s ;
- mise au point, un seul processus : environ 1,2 s par utilisateur sans proposition, 5 à 6 s avec proposition et trois bras A, J, C.

## 3. à 7. C1 entraînement, C1 validation, glucides, C2, C6

Non exécutés (arrêt 9.1). Les définitions de ces tâches existent dans `tests/experiments-journal/it2/jobs.ts`, mais aucune n'a tourné, et aucune graine d'entraînement ni de validation n'a été consommée.

## 8. Arrêts déclenchés

- **Règle 9.1 déclenchée après le contrôle 6.1** : médiane du ratio hors de [0,9 ; 1,1] en perte (0,653) et en prise (0,700).
- 4.7 et 6.2 sont passés.
- 6.1 et 6.2 ont été lancés l'un après l'autre avant l'analyse de 6.1. Seul le diagnostic de la section 2.4 a été exécuté après l'échec.

## 9. Temps de calcul par étape

Temps réel, machine à 16 threads.

| Étape | Durée réelle |
|---|---|
| `npm run check` de départ | 51 s |
| Amendement et commit | < 1 min |
| Capture « avant » / « après » et comparaison | 43 s / 45 s |
| `npm run check` après le prototype | non chronométré (vert, 524 / 524) |
| Mise au point du simulateur (essais sur les graines pilote) | ≈ 2 min de calcul |
| 6.1 monde idéal | 52 s |
| 6.2 appariement | 206 s |
| Diagnostic de 6.1 | 45 s |
| Tableaux | < 1 s |
| `npm run check` final | 41 s |
| **Total de l'itération** (première commande vers 16 h 46, fin vers 17 h 35) | **≈ 50 min**, très en dessous du plafond de 8 h |

Détail des lancements : `results/timing2/launch-times.txt`. Les journaux par shard (`*.log`) sont ignorés par `.gitignore` et ne sont pas commités.

## 10. Non fait, incertitudes, incohérences

**Non fait**

- 6.3, C1 (entraînement et validation, S1 à S7, P00, S5b, sensibilités, robustesse, acceptation à 70 %), 7.3, C2, C6 : arrêt 9.1.
- Aucune correction du solveur, de l'estimateur ni du simulateur après l'échec. Aucun seuil ni paramètre modifié.

**Incertitudes**

- **Définition du ratio de 6.1.** J'ai appliqué la définition de 7.2 (blocs des semaines 5 à 24), le prompt n'en donnant pas d'autre pour 6.1. Le seul bloc qui contient la première semaine du plan d'onboarding (semaines 1 à 4) donnait 0,92 et 0,66 sur les deux cas examinés en détail. Cette lecture n'est pas retenue, pour ne pas choisir la fenêtre après avoir vu le résultat.
- **Glucides du monde idéal** : le monde mange la part de base × apport (D5 exact, 5.2), et non les glucides du plan.
  - **[mesuré]** Le ratio implicite du solveur (0,78) est calculé avec les glucides du plan (`hallInputFor`) : il ne dépend pas de ce choix.
  - Sa part dans l'écart restant (de 0,78 à 0,65) n'a pas été isolée par un bras dédié.
- **Taux de déclenchement de la proposition** (utile pour la suite) :
  - **[mesuré]** 48 sur 120 non-suiveurs de P10 dans les graines d'appariement ;
  - 141 sur 320 (44 %) dans un essai de mise au point sur les graines pilote, dont le script et la sortie ne sont pas commités ;
  - **[déduit]** la porte actuelle compte la première pesée comme propre. Avec 20 % de jours sans « écart important », 4 pesées propres sont souvent atteintes dès le jour 14, et la règle 3.7 (« premier moment ») ne se déclenche alors jamais.
- **Choix du simulateur non encore éprouvés**, parce que C1 n'a pas tourné :
  - déclarations des 20 % de jours restants des non-suiveurs ;
  - cibles de poids à IMC 18,5 et + 10 % ;
  - sélection des utilisateurs basculés en C2 et C6 ;
  - groupes de C6.

**Incohérences et constats**

- **[mesuré]** Dans le monde idéal, 3 utilisateurs sur 200 ont un maintien vrai si bas que la vitesse minimale donne une cible sous le plancher : `no_feasible_speed` à chaque recalibration, plan précédent maintenu.
- Le `.gitignore` modifié et `results.zip` ne sont pas de mon fait ; je n'y ai pas touché.
- Les sous-dossiers du prompt (`c1train/`, `c1/`, `carbs/`, `c2/`, `c6/`, `pilot2/`) n'ont pas été créés, faute d'exécution. Les contrôles sont dans `results/controls2/`.
