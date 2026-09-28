# 37 : itération 2a, correctif du solveur de plan (préalable à la reprise de l'itération 2)

Mesures seulement : aucune fonctionnalité visible, aucune sortie de production modifiée quand les options sont absentes. Branche `bench/journal-battery`, rien sur `main`, aucun merge. Seuils : `tests/experiments-journal/THRESHOLDS.md`, amendement 3. Tableaux : `tests/experiments-journal/results/solver/tables2a.md` et `verdicts2a.json`.

Conventions : **[lu]** chemin:lignes ; **[mesuré]** fichier de résultats ; **[déduit]** raisonnement.

## Synthèse

| Étape | Résultat |
|---|---|
| 3.5 non-régression, options absentes | **0 différence** sur 2 523 011 valeurs |
| Arrêt 2 (témoin S0 contre le rapport 36) | **reproduit** : 0,654 en perte, 0,703 en prise |
| 5.1 monde idéal, A3.1 (correctif FX) | **ÉCHEC** : en prise, semaines 5 à 12 = 1,077 [1,067 ; 1,087] ; bloc des semaines 5 à 8 = 1,103 [1,086 ; 1,119] ; IC du bloc des semaines 21 à 24 = [0,8997 ; 0,915]. En perte, tous les critères passent. |
| Arrêt | **Règle 6.3 : pas de 5.2** (monde réaliste non exécuté) |
| 5.3 premier plan et golden | rapporté, sans seuil |
| 5.4 invariants | 0 violation de monotonie (7 375 points), masse tissulaire du jour 42 à 0,003 kg au plus de la cible |
| 5.5 temps de calcul | P95 110,5 ms (S0) et 112,0 ms (FX) ; × 4 [déduit] : 442 et 448 ms, sous 1 s |

---

## 0. État de départ et commit de l'amendement 3

- **[mesuré]** `git status` au départ, branche `bench/journal-battery` :
  - `.gitignore` modifié hors de mes commits. Je n'y ai pas touché et ne l'ai pas commité ;
  - non suivis : `reports/31_…`, `33_…`, `34_…`, `35_…`, `36_…`, `tests/experiments-journal/results/results.zip`.
- **[mesuré]** `git log --oneline -3` : `b36a773 bench(journal): controls 6.1 and 6.2 of iteration 2, raw results and tables (s6)`, `994eb90 …`, `a45412a …`.
- **[mesuré]** `npm run check` au départ : **vert**. Typecheck et lint sans erreur, **526 / 526** tests (44 fichiers), 37 s.
- **Commit de l'amendement 3 : `0b92a47`**, fichier `THRESHOLDS.md` seul, avant toute exécution de mesure.
  - **[mesuré]** Le texte ajouté est identique aux lignes 147 à 166 du prompt (`diff` sans différence).
  - Comme aux amendements 1 et 2 : contenu du bloc ```` ```markdown ```` sans ses lignes de clôture, précédé d'une ligne vide, fins de ligne CRLF comme le reste du fichier.
- **[mesuré]** `npm run check` à la fin : **vert**, **533 / 533** tests (45 fichiers), 38 s.

Commits de l'itération :

| Commit | Contenu |
|---|---|
| `0b92a47` | amendement 3 (s2) |
| `a1aeea6` | options du prototype, tests, preuve de non-régression (s3) |
| `063aba2` | bras solveur du simulateur, non-suiveurs réguliers, lanceur (s4) |
| `b774261` | bruts de 5.1, script des tableaux, tableaux (s5) |
| `3e42eb6` | diagnostic de l'échec de A3.1, sans correction (s6) |
| `48c59f3` | 5.3, 5.4 et 5.5 : bruts et tableaux (s7) |

Ce rapport, sous `reports/`, n'est pas commité, comme les rapports 34 à 36.

## 1. Prototype

### Fichiers et signatures

- **`src/science/goals.ts`** **[lu]** :
  - `PlanContext.solver?: SolverOptions` (l. 97), absent par défaut ;
  - `SolverStart = 'equilibrium' | 'currentState'`, `RateDefinition = 'fortyTwoDayWeight' | 'sustainedTissue'` ;
  - `ModeledBody = { params, state, weightShiftKg, steps }` (l. 109) ;
  - `SolverOptions = { solverStart?, rateDefinition?, modeledBody?, modeledBodyAtOffsetDelta? }` (l. 118) ;
  - `solverOptionsActive(ctx)` (l. 263) : faux si aucune option ne change le solveur. Dans ce cas, chaque point d'entrée passe par son code de production d'origine, inchangé ;
  - `solverOrigin` (l. 285) : départ du solveur, soit le corps modélisé (currentState avec calibration), soit l'équilibre de production (`hallParametersFor`, `initialState`) ;
  - `simulateFromOrigin` (l. 305) : même intégration que `simulateHall` (même pas de temps, mêmes appels à `advance`), démarrée depuis un état donné. `src/science/hall/model.ts` n'est pas modifié ;
  - `horizonTarget` (l. 343) : `fortyTwoDayWeight` vise W × (1 ∓ r)^6 ; `sustainedTissue` vise masse tissulaire de départ + W × ((1 ∓ r)^6 − 1), W étant le poids de référence du plan ;
  - `solveCaloriesAtHorizon` (l. 351) : même bisection, mêmes bornes (400 à 9 000 kcal/j), mêmes tolérances (1 kcal, 0,01 kg), sur le poids ou sur la masse tissulaire (gras + maigre) au jour 42. `CalorieSolve.origin` (l. 236) est renseigné seulement quand une option est active.
- **`src/science/modeledBody.ts`** (nouveau) **[lu]** : `modeledBodyAt(input: CalibrationInput, offsetKcal, today): ModeledBodyResult | null` (l. 34).
- **`src/domain/engine.ts`** **[lu]** :
  - `SolverRequest = { solverStart?, rateDefinition? }` (l. 69) ;
  - `PlanBuildInput.solver?: SolverOptions` (l. 62). `buildPlan` ajoute `solver` au contexte seulement s'il est fourni (l. 83) ;
  - `RebuildOptions.solver?: SolverRequest` (l. 191) ;
  - `solverOptionsFor(store, today, snapshot, request)` (l. 199) construit le corps modélisé ;
  - dernier argument optionnel `solver?` de `previewInitialPlan` (l. 314), `completeOnboarding` (l. 342) et `applyRecalibration` (l. 726).

### Points d'entrée couverts

Toutes ces fonctions lisent les options dans `ctx.solver` :

| Point d'entrée | Effet des options |
|---|---|
| `evaluateWeeklyRate` | cible du jour 42 et solve depuis le départ choisi |
| `buildGoalPlan` et `maxSelectableWeeklyRate` | via `evaluateWeeklyRate` ; boucle des vitesses, planchers, plafonds et macros inchangés |
| `solveSliderPoint`, `solveRoundedSliderPoint`, `effectiveMinSliderSteps`, `baselineWeightAtHorizon` | cible = valeur au jour 42 du plan de base (poids ou masse tissulaire) ; dépense du jour 0 et variation hebdomadaire calculées depuis le départ choisi |
| `projectPlan` (projection vers la cible finale) | sous `currentState`, trajectoire centrale et bande à 80 % depuis les corps modélisés aux offsets de l'intervalle (`modeledBodyAtOffsetDelta`) ; la cible finale reste un poids |
| `weightAtDay` | sous `currentState`, depuis le corps modélisé |
| Domaine : `buildPlan`, `buildPlanFromStore`, `previewInitialPlan`, `completeOnboarding`, `applyRecalibration` | transmettent les options au contexte |

**Non couverts** [lu], et pourquoi :

- **`createSliderSession` et `applySliderSteps`** (`engine.ts`) : leur contexte vient de `contextForCurrentPlan`, reconstruit depuis le magasin, qui ne porte pas d'option. De plus, `createSliderSession` précalcule `baselineWeight42` par `weightAtDay`, c'est-à-dire un poids. Avec `sustainedTissue`, il faudrait une masse tissulaire.
  - Ce chemin n'est emprunté ni par le simulateur ni par les recalculs.
  - Les fonctions de science qu'il appelle sont couvertes.
- **`speedSliderModelFor`, `onboardingSpeedSliderModel`, `storeSpeedSliderModel`** : même raison (contextes reconstruits sans option). `maxSelectableWeeklyRate`, qu'elles appellent, est couverte.
- **`views.ts` et `explain.ts`** : ils appellent `projectPlan` et `hallParametersFor`, mais pour l'affichage, depuis un contexte reconstruit sans option. Ce ne sont pas des solveurs.
- **`journalGoalPlan`** (harness, bras J) : non mesuré dans cette itération.

### Construction de l'état actuel (3.1)

`modeledBodyAt` refait la simulation de la fenêtre de `fitCalibration` **[lu]** `src/science/modeledBody.ts:34-117` :

- **Paramètres.** `initializeHall` au premier poids valide w0, avec :
  - apport de base = NASEM au début de la fenêtre + l'offset retenu (`snapshot.posteriorMedianOffsetKcal`, médiane a posteriori) ;
  - REE du début de fenêtre, part glucidique de base, gras mesuré s'il existe.

  Le paramètre d'activité est donc résolu au début de la fenêtre, comme dans la calibration.
- **Jours.** `reconstructDays` de la calibration (apports, glucides du plan, pas), puis même entrée d'activité par kg.
- **Durée.** Simulation jusqu'à aujourd'hui : au-delà de la dernière pesée, les jours journalisés suivants sont ajoutés.
- **Poids de départ latent.** Médiane a posteriori de l'ordonnée à l'origine, conditionnelle à l'offset retenu :
  - a priori plat ;
  - même grille (± 3 kg par pas de 0,05 kg) ;
  - même vraisemblance Student-t, mêmes poids de preuve ;
  - chaque point de la grille est évalué exactement.
- **Aucun second modèle, aucun état reconstruit à l'équilibre.** L'état comprend l'adaptation thermique, le liquide extracellulaire, le glycogène et la masse maigre. La masse grasse suit la relation de Forbes du modèle.
- **Sans calibration** (premier plan) : aucun corps modélisé, donc départ à l'équilibre (test « onboarding », `tests/domain/solverPrototype.test.ts`).
- **Maintien affiché (D-17)** : inchangé. `plan.maintenanceKcal` est identique avec et sans option (même test, `applyRecalibration`).
- **Contrôle [mesuré].** Les 2 785 plans FX de perte et de prise du monde idéal, reconstruits depuis le magasin tronqué au jour du recalcul, redonnent des cibles identiques au bit près (`tables2a.md`, « Diagnostic »).

**Écart du poids de référence au poids de tendance [mesuré]** (monde idéal, bras FX, 4 008 plans, `tables2a.md`, « Autres constats ») :

- poids modélisé − poids de tendance : médiane −0,006 kg, P10 −0,931, P90 +0,350 ;
- poids modélisé − poids vrai : médiane +0,003 kg, P10 −0,048, P90 +0,067 ;
- 0 plan sans état.

### Écarts à ce prompt et leurs raisons

1. **Options portées par le contexte (`PlanContext.solver`)** plutôt que passées en argument à chaque fonction. Tous les points d'entrée de science reçoivent déjà le contexte : c'est ce qui garantit qu'ils agissent tous de la même façon. Côté domaine, les options arrivent par le dernier argument optionnel de `completeOnboarding` et `applyRecalibration`.
2. **Poids de départ latent.** La calibration traite l'ordonnée à l'origine comme un décalage additif du poids : son modèle démarre à w0 et prédit w0 + c + variation. Je garde cette convention. Le poids modélisé vaut le poids de Hall de l'état + c.
   - Le décalage entre dans le poids de référence W et dans la cible `fortyTwoDayWeight`.
   - Il n'entre pas dans la masse tissulaire.
3. **Entrée d'activité sous `currentState`** : celle de la calibration, c'est-à-dire l'énergie des pas par kg au poids w0, par rapport aux pas de maintien de la calibration. Ce n'est pas `paDeltaForSteps` au poids de tendance. Même modèle, mêmes paramètres.
4. **Intégration depuis un état donné** écrite dans `goals.ts` (`simulateFromOrigin`, même boucle que `simulateHall`), pour ne pas toucher `src/science/hall/model.ts`.
5. **`currentState` exige un snapshot appliqué et une fenêtre d'au moins deux pesées valides.** Un snapshot de démarrage à chaud sans pesée donne un corps modélisé nul, donc le départ à l'équilibre. Le simulateur n'utilise pas de démarrage à chaud.
6. **Bras solveur par utilisateur.** Le bras est une propriété de l'utilisateur simulé (`UserSpec.solver`) : tous ses plans l'utilisent, premier plan compris (définition (a)). Les bras d'un même utilisateur partagent la graine maître, donc le même monde et tous les tirages (appariement).
7. **Critère « bloc » de A3.1 jugé sur l'IC**, comme le veut la règle commune (« chaque critère est jugé sur l'IC 95 % »). La lecture sur la médiane seule est aussi rapportée ; elle échoue aussi (section 2).
8. **Arrêt 2** : le témoin est comparé sur les semaines 5 à 24, fenêtre des valeurs 0,65 et 0,70 du rapport 36.

### Isolement (3.4)

- **[mesuré]** Test `tests/domain/solverPrototype.test.ts`, « isolation » : aucun module de `src/store`, `src/app`, `src/screens`, `src/components`, `src/hooks` ni `src/main.tsx` ne mentionne les options, le corps modélisé ou `SolverRequest`.
- Les appels de production à `applyRecalibration` et `completeOnboarding` n'ont pas l'argument supplémentaire.
- Le worker n'importe pas `modeledBody.ts`.

### Preuve de non-régression (3.5)

- **Capture** : mêmes scripts que les itérations précédentes (`tests/experiments-journal/capture/`) : T-03, T-04, golden, R et S (view-model complet), `convergenceJourney`.
  - **Avant** : `0b92a47`, dont `src/` est identique à `b36a773`.
  - **Après** : options de la section 3, absentes.
- **[mesuré]** `tests/experiments-journal/results/solver/nonregression.txt` : **2 523 011 valeurs numériques, 0 différence**. Détail : T-03 1 003 779, T-04 1 497 006, golden 3 483, R/S 9 847, journey 8 896 ; 554 identifiants aléatoires masqués.
- **[mesuré]** T-03, T-04 et golden sont identiques à l'octet, avec les préfixes sha256 des phases précédentes : `3447793a…`, `c65c47cf…`, `e20b17f4…`.
- **[mesuré]** Options neutres (`equilibrium` + `fortyTwoDayWeight`, ou `currentState` sans corps modélisé) : plans, points du curseur et projections égaux à la production (test « neutral options »).

**Tests ajoutés** (`tests/domain/solverPrototype.test.ts`, 7 tests) :

- options neutres ;
- `sustainedTissue` : masse tissulaire du jour 42 à 0,01 kg de la cible, et déficit plus grand que la production ;
- `modeledBodyAt` sur pesées sans bruit : décalage < 0,01 kg, dernier poids retrouvé ;
- `currentState` par le domaine : poids de référence = poids modélisé, poids du jour 42 = W × (1 − r)^6, projection partant du poids modélisé, maintien inchangé ;
- premier plan ;
- invariants du curseur ;
- isolement.

## 2. Monde idéal : décomposition 2 × 2, verdict A3.1

**Monde.** Celui du contrôle 6.1 : Hall nominal, pesées sans bruit, u = 0, suiveurs parfaits.

- 500 utilisateurs : 194 en perte, 150 en prise, 156 en maintien (même hypercube qu'en 6.1).
- Graines 2,1·10⁹.
- Bras appariés :
  - S0 : témoin ;
  - CS : `currentState` seul ;
  - ST : `sustainedTissue` seul ;
  - FX : les deux, le correctif retenu.
- Ratio : définition 7.2 de l'itération 2.

**[mesuré]** `results/solver/ideal2a-shard*.csv.gz`, `tables2a.md`.

### Médianes par fenêtre [IC 95 %]

| Bras | Perte, sem. 5-12 | Perte, sem. 13-24 | Prise, sem. 5-12 | Prise, sem. 13-24 |
|---|---|---|---|---|
| S0 témoin | 0,696 [0,684 ; 0,704] | 0,628 [0,616 ; 0,637] | 0,780 [0,760 ; 0,793] | 0,669 [0,662 ; 0,683] |
| CS | 1,044 [1,038 ; 1,051] | 0,999 [0,995 ; 1,003] | 1,085 [1,073 ; 1,090] | 0,959 [0,955 ; 0,962] |
| ST | 0,926 [0,909 ; 0,941] | 0,832 [0,809 ; 0,855] | 0,978 [0,972 ; 0,985] | 0,868 [0,858 ; 0,878] |
| **FX** | **1,016 [1,010 ; 1,020]** | **0,981 [0,972 ; 0,985]** | **1,077 [1,067 ; 1,087]** | **0,966 [0,962 ; 0,970]** |

### Médianes par bloc de 4 semaines

| Bras | Objectif | Sem. 5-8 | 9-12 | 13-16 | 17-20 | 21-24 |
|---|---|---|---|---|---|---|
| S0 | perte | 0,715 | 0,673 | 0,647 | 0,628 | 0,594 |
| S0 | prise | 0,803 | 0,756 | 0,723 | 0,663 | 0,641 |
| CS | perte | 1,068 | 1,029 | 1,015 | 0,994 | 0,989 |
| CS | prise | 1,119 | 1,061 | 1,019 | 0,941 | 0,902 |
| ST | perte | 0,952 | 0,907 | 0,869 | 0,832 | 0,765 |
| ST | prise | 1,012 | 0,966 | 0,929 | 0,858 | 0,828 |
| FX | perte | 1,027 [1,020 ; 1,033] | 1,008 [1,005 ; 1,010] | 0,993 [0,989 ; 0,996] | 0,972 [0,965 ; 0,979] | 0,953 [0,931 ; 0,976] |
| FX | prise | 1,103 [1,086 ; 1,119] | 1,060 [1,055 ; 1,069] | 1,026 [1,022 ; 1,031] | 0,946 [0,936 ; 0,955] | 0,909 [0,8997 ; 0,915] |

**Différences appariées de médiane, FX − S0 [mesuré]** :

- perte : +0,320 [0,311 ; 0,331] sur les semaines 5 à 12, +0,353 [0,345 ; 0,361] sur les semaines 13 à 24 ;
- prise : +0,297 [0,286 ; 0,312] et +0,297 [0,285 ; 0,302].

Les autres différences (CS, ST) sont dans `tables2a.md`.

**Arrêt 2 [mesuré]** : témoin S0, semaines 5 à 24 : **0,654** en perte (attendu 0,65 ± 0,03) et **0,703** en prise (0,70 ± 0,03). Le rapport 36 est reproduit ; pas d'arrêt.

### Verdict A3.1 (FX) : **ÉCHEC**

| Critère | Perte | Prise |
|---|---|---|
| Fenêtre sem. 5-12, médiane et IC dans [0,95 ; 1,05] | passe | **échoue** : 1,077 [1,067 ; 1,087] |
| Fenêtre sem. 13-24 | passe | passe : 0,966 [0,962 ; 0,970] |
| Blocs, médiane et IC dans [0,90 ; 1,10] | passent tous | **échouent** : bloc des sem. 5-8, 1,103 [1,086 ; 1,119] ; bloc des sem. 21-24, borne basse 0,8997 |
| Lecture sur la médiane seule | passe | échoue : fenêtre des sem. 5-12 et bloc des sem. 5-8 |

**Autres constats [mesuré]** :

- Recalibrations appliquées : 8 en médiane dans chaque bras.
- Échecs `no_feasible_speed` (recalculs refusés, plan précédent maintenu) : 48 dans S0, 47 dans CS, 52 dans ST, 51 dans FX. Utilisateurs touchés : 8, 11, 8 et 10.
- Strates (sexe, classe d'IMC, activité, vitesse demandée) dans `tables2a.md`. En prise, FX dépasse 1,05 sur les semaines 5 à 12 dans toutes les strates, de 1,057 (IMC 31) à 1,115 (IMC 21).

### Diagnostic (sans correction)

**Méthode.** Script `tests/experiments-journal/it2a/diag2a.experiment.ts`, bruts `results/solver/diag2a-*.csv.gz`, tableau `tables2a.md`, « Diagnostic ».

- Les utilisateurs en perte et en prise sont rejoués avec les mêmes graines.
- Chaque plan FX est reconstruit (2 785 / 2 785 identiques).
- Depuis le corps modélisé du jour du recalcul, à l'apport constant du plan, le script mesure la trajectoire propre du modèle du solveur sur 70 jours.

**[mesuré] Le monde suit le modèle du solveur.** Sur les 28 premiers jours des plans qui durent au moins 28 jours :

| Objectif | Monde | Modèle du solveur (jours 0 à 28, médiane de tous les plans) |
|---|---|---|
| perte (n = 305) | 0,995 | 0,997 |
| prise (n = 189) | 1,035 | 1,028 |

Le poids modélisé est à +0,003 kg du poids vrai en médiane.

**[mesuré] Le modèle du solveur ne produit pas une vitesse constante sous un apport constant.** Pente propre / (vitesse appliquée × W), en médiane :

| Objectif | Jours 0-7 | 0-28 | 0-42 | 28-42 | 42-70 |
|---|---|---|---|---|---|
| perte | 1,014 | 0,997 | 0,984 | 0,953 | 0,913 |
| prise | 1,093 | 1,028 | 1,007 | 0,968 | 0,923 |

- **[mesuré]** État de départ médian des plans de prise : AT +44,6 kcal/j, glycogène +0,043 kg, LEC +0,239 kg au-dessus de la base.
- **[mesuré]** La cible monte de 10,5 kcal/j par recalcul en médiane. En perte, elle ne change pas en médiane.

**[mesuré] La cadence des recalibrations change au fil des mois**, avec un effet sur le ratio (médianes par utilisateur-bloc) :

| Bloc | Plans démarrés | Âge moyen du plan actif (j) |
|---|---|---|
| sem. 5-8 | 4 | 3 |
| sem. 9-12 | 1 | 10 |
| sem. 13-16 | 1 | 13,5 |
| sem. 17-20 | 0 | 41,5 |
| sem. 21-24, perte | 0 | 34,5 |
| sem. 21-24, prise | 0 | 62,5 |

Ratio FX selon l'âge moyen du plan actif :

| Âge | Perte | Prise |
|---|---|---|
| 0 à 7 j | 1,029 [1,021 ; 1,034] | 1,103 [1,086 ; 1,117] |
| 28 à 42 j | 0,974 | 0,964 |
| au-delà de 42 j | 0,884 [0,853 ; 0,899] | 0,900 [0,898 ; 0,907] |

**[déduit]** L'écart restant de FX ne vient ni de l'estimation ni de l'état de départ. Il vient de deux choses :

- la forme de la trajectoire que le solveur vise : un apport constant sur 42 jours, qui avance vite au début et ralentit ensuite ;
- la cadence des recalibrations (D-34) : hebdomadaire les premières semaines, donc les blocs mesurent surtout les premiers jours des plans ; puis rare, donc les plans vivent au-delà de l'horizon de 42 jours.

En prise, l'avance des premiers jours est plus forte (1,093 contre 1,014). Elle va avec la hausse de cible à chaque recalcul, qui ajoute glycogène et liquide extracellulaire. D'où l'échec en prise seulement.

Aucune correction n'a été faite : ni sur le solveur, ni sur la règle de recalibration, ni sur le simulateur.

## 3. Monde réaliste : verdicts A3.2, non-suiveurs réguliers

**Non exécuté** : règle d'arrêt 6.3, A3.1 a échoué.

- Le job `real2a` existe : 2 000 suiveurs (graines 2,2·10⁹) et 500 non-suiveurs réguliers (graines 2,3·10⁹, s = −270 pour les index pairs, +270 pour les impairs), bras S0 et FX.
- Le comportement « non-suiveur régulier » est dans le simulateur : plan en cours + s, « plan respecté » chaque jour.
- Les définitions de S1 à S4 et S7 sont codées dans `tables2a.experiment.ts`, avant tout résultat.
- Aucune de ces graines n'a été consommée.

## 4. Premier plan et golden (A3.4, sans seuil)

**[mesuré]** `results/solver/firstplan2a-shard*.csv.gz`, `golden2a-shard0.csv.gz`, `tables2a.md`.

Le premier plan n'a pas de calibration. FX y diffère de S0 seulement par `sustainedTissue`.

**Hypercube (1 000 profils, graines 2,4·10⁹), chaque vitesse de la grille, FX − S0 :**

| Objectif | Vitesse demandée | Δ cible médiane [P10 ; P90] (kcal/j) | Ralentis par le plancher, S0 → FX | Sans vitesse faisable |
|---|---|---|---|---|
| perte | 0,20 %/sem. | −47 [−76 ; −31] | 0 → 0 % | 0 → 0 % |
| perte | 0,50 %/sem. | −120 [−192 ; −39] | 0 → 0 % | 0 → 0 % |
| perte | 0,70 %/sem. | −168 [−272 ; −39] | 0 → 0,77 % | 0 → 0 % |
| perte | 0,80 %/sem. | −192 [−299 ; −39] | 0 → 8,25 % | 0 → 0 % |
| perte | 0,90 %/sem. | −205 [−318 ; −39] | 0 → 22,4 % | 0 → 0 % |
| perte | 1,00 %/sem. | −205 [−301 ; −37] | 1,03 → 35,1 % | 0 → 0 % |
| prise | 0,10 %/sem. | +26 [15 ; 37] | 0 → 0 % | 0 → 0 % |
| prise | 0,25 %/sem. | +65 [38 ; 93] | 0 → 0 % | 0 → 0 % |
| prise | 0,50 %/sem. | +131 [77 ; 186] | 0 → 0 % | 0 → 0 % |
| maintien | — | 0 [0 ; 0] | 0 → 0 % | 0 → 0 % |

- Toutes les vitesses sont dans `tables2a.md`.
- En perte, la vitesse retenue est plus lente sous FX pour 136 profils sur 388 à 1 %/semaine.
- **[lu]** Au-dessus du plafond IMC, les deux bras calculent à la vitesse plafonnée. Le P90 de −39 kcal/j, constant à partir de 0,30 %/semaine, vient des profils à IMC 21 plafonnés à 0,25 %/semaine.

**Golden, R et S [mesuré]** :

| Cas | Écart FX − S0 | Vitesse retenue |
|---|---|---|
| 12 golden, perte | −62 à −234 kcal/j | inchangée |
| 12 golden, prise | +13 et +39 kcal/j | inchangée |
| 12 golden, maintien | 0 | inchangée |
| R et S sans historique | −241 et −228 kcal/j | inchangée |
| S avec l'historique de la capture | −249 kcal/j | inchangée |
| R avec l'historique de la capture | −171 kcal/j | 1 % → 0,9 %/semaine |

Pour R avec historique, 1 % et 0,95 % sont rejetés par le plancher : `below_hard_floor`, cible FX 1 234 kcal/j.

**Raison des écarts [déduit]** :

- `sustainedTissue` retire de la cible du jour 42 la baisse (ou la hausse) rapide d'eau et de glycogène du début de plan. Le déficit (ou le surplus) augmente avec la vitesse et le poids.
- En maintien, les deux définitions visent un état stable, d'où l'écart nul.

## 5. Invariants (5.4)

**[mesuré]** `results/solver/invariants2a-shard*.csv.gz`, `tables2a.md`. Correctif FX, pas de 500 sur toute l'étendue du curseur :

| Source | Plans | Points | Violations de monotonie | Écart max \|masse tissulaire j42 − cible\| | Points non convergés |
|---|---|---|---|---|---|
| premiers plans de l'hypercube | 200 | 5 940 | **0** | 0,003 kg | 0 |
| utilisateurs simulés au jour 83, état actuel | 49 | 1 435 | **0** | 0,003 kg | 0 |

- Plus de pas donnent des calories autorisées non décroissantes ; moins de pas, des calories non croissantes.
- Un des 50 profils de 5.5 (femme, IMC 21, perte) n'a pas de plan recalculé au jour 83, dans les deux bras. La raison n'est pas enregistrée dans les bruts ; je ne l'ai pas vérifiée.
- **Hall contre `bw`** : `src/science/hall/` n'est pas modifié (`git diff b36a773 HEAD -- src/science/hall` vide). `tests/science/hall.test.ts` est vert dans `npm run check`.

## 6. Temps de calcul (5.5)

**[mesuré]** `results/solver/timing2a-shard0.csv.gz`.

- 50 profils, graines 2,5·10⁹, suiveurs réalistes pesés chaque jour, 84 pesées (jours 0 à 83).
- Mesure : `computeCalibrationState` + `applyRecalibration` (calibration, état actuel, solveur, projection).
- Un processus seul, un tour de chauffe, médiane de 3 mesures par profil.

| Bras | P50 | P95 | P95 × 4 [déduit] | Seuil 1 s |
|---|---|---|---|---|
| S0 | 100,3 ms | 110,5 ms | 442 ms | sous |
| FX | 102,1 ms | 112,0 ms | 448 ms | sous |

## 7. Arrêts déclenchés

- **Règle 3 (A3.1 échoue) : déclenchée après 5.1.** 5.2 n'a pas tourné. Seul le diagnostic de la section 2 a été exécuté après l'échec.
- Règles 1 (non-régression) et 2 (témoin) : non déclenchées.
- 5.3, 5.4 et 5.5 ont été exécutés après l'échec. La règle 3 n'exclut que 5.2, et ces mesures n'ont pas de seuil (5.3) ou ne dépendent pas du monde (5.4, 5.5).

**Temps réel** : de 18 h 28 à 19 h 15 environ, soit ≈ 50 min, sous le plafond de 4 h.

| Étape | Durée |
|---|---|
| captures « avant » et « après » | 44 et 42 s |
| pilote | 16 s |
| 5.1 | 495 s |
| diagnostic, deux passes (ajout des fenêtres de pente) | ≈ 1 et 3 min |
| 5.3 | 10 s |
| 5.5 | 110 s |
| `npm run check` | 37 et 38 s |

Détail : `results/solver/timing/launch-times.txt`.

## 8. Non fait, incertitudes, incohérences

**Non fait**

- 5.2 (verdict A3.2, non-suiveurs réguliers) : arrêt, règle 3.
- Aucune correction du solveur, de la règle de recalibration, de l'estimateur ni du simulateur après l'échec. Aucun seuil ni paramètre modifié.
- Entrées non couvertes : voir section 1 (session du curseur, modèles du curseur de vitesse, vues d'affichage).

**Incertitudes**

- **Pilote de mise au point.** Graines 2,6·10⁹, 12 utilisateurs × 4 bras, exécuté une fois avant les mesures pour vérifier le harness. Sorties supprimées, aucun résultat utilisé, aucun paramètre réglé ensuite.
- **Critère « bloc » de A3.1.** Je l'ai jugé sur l'IC, comme la règle commune. La lecture sur la médiane seule échoue aussi (bloc des semaines 5 à 8 en prise : 1,103), donc le verdict ne dépend pas de ce choix. La borne basse du bloc des semaines 21 à 24 en prise (0,8997) est à la limite.
- **Glucides du monde idéal** : comme en 6.1, le monde mange la part de base × apport ; le solveur et la calibration utilisent les glucides du plan. Leur part dans l'avance des premiers jours en prise n'a pas été isolée.
- **Population du monde réaliste** : j'ai déclaré P10, choix sans effet pour le bras A. Non exécuté.
- **Décalage latent** : traité comme un décalage additif du poids (écart 2). Sur le monde idéal, il est proche de 0 (poids modélisé − vrai : +0,003 kg en médiane). Dans un monde bruité, son effet sur `fortyTwoDayWeight` et sur W n'a pas été mesuré.

**Incohérences et constats**

- **[mesuré]** Dans les quatre bras, 8 à 11 utilisateurs sur 500 ont des recalculs refusés en `no_feasible_speed`, et le plan précédent reste en place. Même constat qu'au rapport 36.
- **[mesuré]** Au premier plan, FX rend le plancher actif pour 35 % des profils en perte à 1 %/semaine, contre 1 % pour S0. Aucun profil n'est sans vitesse faisable.
- Le `.gitignore` modifié et `results.zip` ne sont pas de mon fait ; je n'y ai pas touché.
- `tests/experiments-journal/it2/jobs.ts` : `specColumns` et `stateColumns` sont désormais exportés (réutilisation par `it2a`), sans autre changement.
