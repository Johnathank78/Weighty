# 43. Itération 5a : le solveur recalculé tous les 28 jours et les garde-fous en production

Date : 28/09/2026. Branche `prod/5a-solveur-garde-fous`, non fusionnée. Marquage : [lu] lu dans un fichier ou une sortie, [mesuré] obtenu en lançant une commande, [déduit] conclusion tirée des deux.

## 1. Pour John, en 10 lignes

1. Le plan tient enfin la vitesse demandée : le solveur K2 validé aux rapports 37 à 39 est le solveur de l'app, partout [mesuré].
2. Conséquence visible : le premier plan de perte est plus bas qu'avant, de 56, 113 et 212 kcal/j (médianes) à 0,25, 0,5 et 1 %/semaine [mesuré].
3. Le plan est recalculé seul tous les 28 jours ; un message discret l'annonce si la cible bouge d'au moins 10 kcal/j [mesuré].
4. Si l'IMC passe sous 20 en perte, le plan passe en maintien ; si la vitesse dépasse le plafond de l'IMC, elle est ramenée au plafond. Avec un message, sans confirmation [mesuré].
5. Un avertissement prévient quand l'IMC pourrait passer sous 20 dans les 4 semaines [mesuré].
6. Le poids cible minimal est désormais à IMC 20 ; les objectifs déjà enregistrés plus bas sont relevés, avec un message unique [mesuré].
7. Quand le plancher calorique limite la vitesse, l'app le dit et propose un nombre de pas, ou dit que c'est inatteignable [mesuré].
8. Une recalibration refusée dit pourquoi et propose le maintien [mesuré].
9. Une alerte de sous-poids, bienveillante, oriente vers un professionnel de santé ; au plus une fois par semaine [mesuré].
10. Équivalence avec le prototype : 0 différence sur 7 344 calculs de plan (400 utilisateurs, 24 semaines). À faire : ta vérification manuelle (section 8), puis la fusion [mesuré].

## 2. Ce qui a été fait, point par point

Commits, dans l'ordre [mesuré] : `508f9aa` (science, domaine, schéma, outils d'équivalence), `94c4139` (tests de référence), `c35c742` (intégration dans l'app), `9dbd4bc` (tests de la passe et temps), `63c1be3` (proposition de pas sous le curseur, profils de test), puis ce rapport.

### 2.1 Le solveur recalculé tous les 28 jours devient le solveur de production

- **Porté tel quel** depuis `archive/bench-journal-battery` [lu] :
  - `src/science/goals.ts` : options du solveur, départ depuis le corps modélisé, vitesse sur la masse tissulaire (définition (a)), horizon ;
  - `src/science/modeledBody.ts` : nouveau fichier, identique à la branche de mesure hors en-tête ;
  - `src/domain/engine.ts` : `solverOptionsFor`, `periodicReplan`, `enforcePlanGuardrails`, options de `changeGoal`.
  - Non porté : l'option `hardFloorMultiplier` (plancher × facteur), qui appartient au mode journal (hors périmètre).
- **Le défaut, c'est K2** [lu] : dans la science, des options absentes valent désormais `currentState`, `sustainedTissue`, 28 jours. Le domaine passe partout `PRODUCTION_SOLVER` et ajoute le corps modélisé. L'ancien solveur ne tourne plus qu'avec `LEGACY_SOLVER_OPTIONS`, utilisé seulement par les tests de comparaison.
- **Chemins couverts** [lu] :
  - premier plan (`previewInitialPlan`, `completeOnboarding`) : départ à l'équilibre, faute de calibration, comme le prototype ;
  - recalibration (`applyRecalibration`), changement d'objectif (`changeGoal`), modification du profil (`updateProfile`) : par `buildPlanFromStore`, qui passe toujours le solveur de production ;
  - curseur de vitesse : `onboardingSpeedSliderModel`, `storeSpeedSliderModel` (via `rebuildContextFromStore`, corps modélisé du jour) ;
  - sessions du curseur pas / calories et `applySliderSteps` : le contexte du plan en vigueur avec son corps modélisé du jour de sa construction (`planSolverOptions`) ; la cible tenue est la masse tissulaire à 28 jours ;
  - projection (`projectionFromToday`) : corps modélisé à l'offset de la calibration affichée ;
  - bilan énergétique du jour 0 (`planEnergyBalanceKcal`) et explication (`explainCurrentPlan`).
- **`explain.ts`** annonce l'horizon réel du solve (28 jours) et la grandeur tenue (masse tissulaire) ; le libellé technique « Cible à 42 j » devient « Cible à 28 j / masse de tissus du modèle » [lu].
- **`applySliderSteps` garde `createdAt`** : c'est un choix (section 5, choix 7).
- **Recalcul périodique** (`periodicReplan`, appelé par `runDailyChecks` depuis `StoreProvider.tsx`) [lu] :
  - dû quand 28 jours se sont écoulés depuis le solve du plan, ou depuis la dernière évaluation qui l'a laissé en place ;
  - appliqué sans confirmation, source `'periodic_replan'`, `createdAt` = aujourd'hui, cible de pas conservée ;
  - message si `|nouvelle − ancienne| ≥ 10 kcal/j`, rien en dessous (mais toujours une trace) ;
  - après plusieurs jours sans ouverture : une seule évaluation, sur l'état du jour ; les journaux manquants sont remplis avec le plan qui était en vigueur.
- **Recalibrations** : règle de surfaçage et confirmation inchangées [lu].

### 2.2 Les garde-fous

- G1 (IMC < 20 en perte → maintien au poids actuel) et G2 (vitesse > plafond de l'IMC actuel → recalcul plafonné) [lu] :
  - vérifiés à chaque changement de jour (`runDailyChecks`) et après chaque pesée (`runWeighInChecks`, feuille de pesée) ;
  - **poids utilisé** : celui du prototype, `currentWeightKg(store)`, c'est-à-dire le dernier point de la **tendance lissée** (à défaut, le poids du profil) ;
  - source propre `'guardrail'` ; la règle (G1 ou G2) est dans la trace.
- **Trace persistante** `meta.planEvents` : identifiant, date, règle, statut (`applied` ou `failed`, avec la raison), plan avant, plan après (résumés sans la projection), message affiché, et un indicateur « vu » [lu]. Elle couvre aussi le recalcul périodique, la migration du poids cible et l'alerte de sous-poids.

### 2.3 Poids cible minimal à IMC 20

- `TARGET_BMI_MIN = 20` (constante de sécurité produit) ; `minimumTargetWeightKg` = le plus petit multiple de 0,1 kg d'IMC ≥ 20 [lu].
- Onboarding : borne basse du curseur, poids cible par défaut, validation de l'étape. Changement d'objectif : borne basse et valeur par défaut [lu].
- Écran « objectif atteint » : il passe par `switchToMaintenance`, le même chemin que G1 (poids de tendance non arrondi, cible de pas du plan en vigueur) [lu].
- **Migration 6 → 7** : un objectif de perte sous IMC 20 est relevé au poids d'IMC 20, dans le profil et dans le plan en vigueur, avec une entrée de trace dont le message s'affiche une fois [mesuré].

### 2.4 Avertissement avant IMC 20

`bmi20Warning` : `projectionFromToday` reçoit les options du solveur, une fenêtre de 28 jours au pas quotidien et un arrêt au poids d'IMC 20 ; on lit la **borne rapide** (borne basse de l'intervalle à 80 % en perte). Affiché sur Aujourd'hui et Suivi tant que la projection l'annonce [lu, mesuré].

### 2.5 Recalibration refusée

- Les 8 motifs trouvés dans le code, avec leur phrase [lu] :

| Motif | Phrase (« On n'a pas pu recalculer ton plan : {raison}. Tu peux passer en maintien. ») |
|---|---|
| `loss_unavailable_low_bmi` | ton IMC est sous 20, la perte n'est plus proposée |
| `no_feasible_speed` | cette vitesse demanderait de manger sous ton minimum de {plancher} kcal par jour (+ la phrase des pas) |
| `target_not_above_current` | tu as atteint ton poids cible |
| `target_not_below_current` | tu as atteint ton poids cible |
| `target_bmi_too_low` | ton poids cible est sous le minimum, qui correspond à un IMC de 20 |
| `invalid_profile` | certaines informations de ton profil sont hors des limites prises en charge |
| `no_profile` | ton profil est introuvable |
| `gate_not_met` | il n'y a pas encore assez de pesées pour recalibrer |

- L'aperçu de recalibration (`Tracking.tsx`) garde la raison d'un échec, l'affiche, et remplace « Appliquer » par « Passer en maintien ». Ce bouton applique la nouvelle estimation, puis passe en maintien (`applyRecalibrationAsMaintenance`) [lu, mesuré dans le navigateur].

### 2.6 Plancher expliqué et proposition de pas

- `floorAdvice` : dès qu'un rejet `below_hard_floor` existe (vitesse ralentie ou aucune vitesse faisable), y compris quand le plafond d'IMC limite aussi [lu].
- Pas proposés : `stepsToHoldRateAtFloor`, c'est-à-dire `effectiveMinSliderSteps` avec la cible à l'horizon de la vitesse demandée (plafonnée par l'IMC). Si même le haut de la plage du curseur ne suffit pas : cas « inatteignable » explicite, avec la vitesse la plus rapide qu'on atteint en marchant davantage (`fastestRateReachableWithSteps`), ou sans vitesse si aucune [lu].
- Affiché : sous le curseur de vitesse (onboarding et changement d'objectif), sur l'écran du premier plan, dans l'aperçu de recalibration ; l'explication « Pourquoi ce résultat ? » cite le plancher en priorité [lu].

### 2.7 Alerte de sous-poids

- Tendance sous IMC 18,5, pour tous ; ou, pendant un maintien imposé par G1 (`meta.guardrailMaintenanceSince`), 4 baisses hebdomadaires de suite de la tendance (tendance du jour < tendance d'il y a 7 jours, 4 fois) [lu].
- Au plus une fois par 7 jours ; vérifiée au changement de jour et après chaque pesée [mesuré].

### 2.8 Versions et migration

`SCIENTIFIC_MODEL_VERSION` 1.3.0 → **1.4.0** ; `SCHEMA_VERSION` 6 → **7**. La migration garde tout, ajoute la trace et les deux dates (`periodicReplanCheckedOn`, `guardrailMaintenanceSince`), et relève les objectifs de perte sous IMC 20 [lu, mesuré].

## 3. Résultats des vérifications

### 3.1 Équivalence avec le prototype validé

- **Méthode** [lu] : le harness n'est pas sur `main`, donc fixture.
  - Sur un worktree de `archive/bench-journal-battery` (rien commité là-bas), le simulateur validé tourne sans modification : bras K2 + G de l'itération 2c, les 200 premiers utilisateurs de `ideal2c` et de `real2c`, 24 semaines.
  - Chaque appel du simulateur à `completeOnboarding`, `applyRecalibration`, `periodicReplan` (appels dus) et `enforcePlanGuardrails` (tous les déclenchements, et un contrôle sans effet sur quatre) est intercepté : on garde le store d'entrée et la sortie du prototype.
  - Règle IMC 20 : les objectifs de perte du simulateur sont à IMC 18,5. La sortie attendue est donc recalculée par le prototype sur la même entrée, objectif relevé au poids d'IMC 20 (même règle que la migration). La simulation continue avec le résultat d'origine : ce sont bien les utilisateurs des rapports 38 et 39.
  - Sur la branche, chaque appel est rejoué avec les fonctions de production **par défaut**, stores chargés par la migration 6 → 7. Les garde-fous sont appelés aux jours du simulateur (une fois par semaine) : c'est la configuration hebdomadaire demandée.
  - Fichiers : générateur `tests/experiments-journal/prod5a/fixture.bench.ts` (copie de ce qui a tourné sur la branche de mesure), test `tests/experiments-journal/prod5a/equivalence.experiment.ts`, fixture et sorties dans `tests/experiments-journal/results/prod5a/` (36 Mo, ignoré par git).
- **Résultat [mesuré]** : **0 différence**, sur tous les champs du plan (et du profil pour G1), nombres comparés bit à bit. Seuls sont exclus, par construction, `source` et `scientificModelVersion`.

| Appels rejoués | Monde idéal | Monde réaliste |
|---|---|---|
| premiers plans | 200 | 200 |
| recalibrations | 1 630 | 2 189 (dont 6 refus `no_feasible_speed`, 1 `target_not_below_current`) |
| recalculs périodiques dus | 401 (2 refusés) | 241 (1 refusé) |
| contrôles de garde-fous | 1 245 (G1 : 13, G2 : 32) | 1 238 (G1 : 8, G2 : 30) |

- Contrôle négatif [mesuré] : le même rejeu avec l'ancien solveur diffère sur chacune des 5 recalibrations testées. Le test n'est donc pas aveugle.
- Écarts de fixture dus à la règle IMC 20 (attendus, et reproduits en production) [mesuré] : 3 recalculs périodiques et 1 recalibration qui réussissaient avec l'objectif à IMC 18,5 échouent avec l'objectif relevé (`target_not_below_current` : la tendance est déjà sous le nouvel objectif).
- Durée : 358 s pour le rejeu, 2 min pour la génération [mesuré].

### 3.2 Changements attendus, vérifiés

Premier plan, sur les 1 000 profils de l'hypercube du rapport 38 (exportés de la branche de mesure), production contre `LEGACY_SOLVER_OPTIONS` [mesuré, `results/prod5a/firstplan.txt`] :

| Objectif, vitesse | Écart de cible, médiane [P10 ; P90] | Rapport 38 | Plancher actif, ancien → nouveau |
|---|---|---|---|
| perte 0,25 %/sem. | −55,6 [−88,2 ; −35,7] | −56 [−88 ; −36] | 0 → 0 % |
| perte 0,5 %/sem. | −113,4 [−179,5 ; −35,7] | −113 [−180 ; −36] | 0 → 0 % |
| perte 1 %/sem. | −212,1 [−298,1 ; −31,5] | −212 [−298 ; −31] | 1,28 → 35,55 % |
| prise 0,25 %/sem. | +54,6 [29,4 ; 78,7] | +55 [29 ; 79] | 0 % |
| prise 0,5 %/sem. | +108,1 [58,8 ; 154,3] | +108 [59 ; 154] | 0 % |
| maintien | 0 | 0 | 0 % |

- À 1 %/semaine, 139 profils sur 391 ont une vitesse retenue plus lente qu'avant (rapport 38 : 139) [mesuré].
- R passe de 1 % à 0,9 %/semaine à cause du plancher, −162,7 kcal/j (rapport 38 : −163) [mesuré].
- Aucun écart notable à expliquer [déduit].

### 3.3 Tests

- Avant la passe : 517 tests. À la fin : 542 [mesuré].
- Nouveau fichier `tests/domain/pass5a.test.ts` (23 tests) [mesuré]. Il couvre les dix points demandés :
  - G1 après une pesée et au changement de jour ; G1 = chemin de l'écran « objectif atteint » (même plan, même poids cible) ; aucun effet en maintien, en prise ou au-dessus d'IMC 20 ;
  - G2 après une pesée et au changement de jour, avec le message et la trace ;
  - recalcul périodique : dû à 28 jours et pas à 27 ; message à 10 kcal/j et pas à 9,9 ; app non ouverte 40 jours (une seule évaluation, journaux remplis, prochaine évaluation 28 jours plus tard) ; sans calibration ;
  - migration du poids cible : relevé à 54,5 kg pour 165 cm, un seul message, qui ne revient pas après sauvegarde et rechargement ; rien pour les objectifs déjà ≥ IMC 20 ni pour le maintien ;
  - chargement d'un store du schéma 6 sans perte (profil, plan, pesées, journaux, snapshots, historique, journal alimentaire, préférences, méta) ;
  - avertissement à 4 semaines : annoncé (1 à 4 semaines) et non annoncé loin d'IMC 20 ou en maintien ;
  - une phrase par motif de refus, dans la forme de l'annexe ;
  - plancher : plafond + plancher (10 900 pas, confirmés indépendamment par le curseur), aucune vitesse faisable (15 500 pas), inatteignable avec et sans vitesse maximale, curseur de vitesse (8 700 pas pour 1 %/sem.), explication qui cite le plancher ;
  - alerte de sous-poids : les deux déclencheurs, au plus une fois par semaine, fin du maintien imposé quand l'utilisateur choisit un objectif ;
  - trace : champs, sauvegarde et rechargement, entrée illisible signalée comme perdue et non silencieusement supprimée.

### 3.4 Temps

Sur 12 profils d'un an de données (365 pesées, journées notées, recalibration toutes les 4 semaines), médiane de 3 mesures après un tour de chauffe, en ms [mesuré, `results/prod5a/timing.txt`, `timing-main.txt`] :

| Opération | P50 | P95 | P95 × 4 | `main`, P95 |
|---|---|---|---|---|
| recalcul complet (`computeCalibrationState` + `applyRecalibration`) | 322,6 | 357,9 | 1 432 | 338,5 |
| changement de jour, rien de dû | 0,3 | 0,3 | 1 | — |
| changement de jour, recalcul périodique dû | 9,3 | 10,0 | 40 | — |
| contrôles après une pesée | 0,3 | 0,3 | 1 | — |
| avertissement avant IMC 20 | 0,1 | 9,0 | 36 | — |
| session du curseur pas / calories | 3,5 | 6,0 | 24 | 4,6 |

- La référence de 425 ms (P95 × 4) portait sur 84 pesées. Sur un an, le recalcul complet coûte 1,4 s au P95 × 4, **mais `main` en coûte déjà 1,35 s** : le coût vient de la calibration sur un long historique, pas de la passe 5a, qui ajoute 19 ms (+6 %) [mesuré, déduit].
- La calibration tourne dans le worker, hors du fil principal ; le changement de jour reste sous 10 ms [lu, mesuré].

### 3.5 Build et PWA

- `npm run build` : OK [mesuré].
  - 30 fichiers précachés (1 375 Kio) ;
  - bundle principal 533 kB contre 514 kB sur `main` (+19 kB). Même avertissement « chunk > 500 kB » que sur `main`.
- Hors ligne sous `/wheighty/` [mesuré] :
  - build servi sous `http://localhost:8085/wheighty/` par un serveur statique local ;
  - service worker actif (portée `/wheighty/`) ;
  - serveur arrêté, puis page rechargée : l'app s'affiche, servie par le service worker.
- Rappel [lu, rapport 42] : GitHub Pages sert l'app sous `/Weighty/`, pas `/wheighty/`. La base relative (`./`) la rend indépendante du sous-chemin.
- Vérifié dans le navigateur, sur le build [mesuré] :
  - l'avertissement avant IMC 20, puis G1 déclenché par une pesée à 53 kg (message, maintien, trace en schéma 7) ;
  - la recalibration refusée « tu as atteint ton poids cible », puis « Passer en maintien » ;
  - le message de migration, qui ne revient pas après rechargement ;
  - le curseur de poids cible borné à IMC 20 ;
  - le curseur de vitesse limité par le plancher, avec la proposition de pas.

### 3.6 Vérification finale

Sur le code final (`63c1be3`) [mesuré] :
- `npm run check` : typecheck et lint sans erreur, **542 tests sur 542** (44 fichiers) ;
- l'équivalence refaite sur ce code : 400 utilisateurs, 7 344 appels, **0 différence** (280 s) ;
- `npm run build` : OK.

## 4. Différences des tests de référence, expliquées

Captures complètes avant (`main`) et après (branche), scripts de `tests/experiments-journal/capture/` [mesuré] :

| Capture | Valeurs numériques | Différentes | Cause |
|---|---|---|---|
| T-03 | 1 003 779 | 491 614 | l'utilisateur synthétique mange la cible du plan : premier plan différent, donc pesées différentes, donc ajustements différents |
| T-04 | 1 497 006 | 737 856 | même cause |
| golden | 3 483 | 1 550 | cibles, solve (horizon 28 j, masse tissulaire), projection |
| R et S (view-model) | 9 847 | 4 696 | plan et explication (voir ci-dessous) |
| `convergenceJourney` | 8 896 | 5 050 | cibles du plan, donc apports saisis, donc trajectoire |

- **T-03 et T-04 : la qualité de calibration est inchangée** [mesuré]. Erreur médiane |offset estimé − offset apparent| :
  - T-03 : 92,5 → 93,0 (28 j), 46,3 → 46,2 (42 j), 30,1 → 28,9 (84 j), 17,3 → 17,2 kcal/j (120 j) ;
  - T-04 : 57,0 → 57,7 kcal/j ;
  - les tests bloquants (`calibrationLongHorizon`, `calibrationMismatch.part1` à `part4`) passent sans modification.
- **Golden** (instantané régénéré) : perte −89, −112, −169, −211 et −58 kcal/j ; prise +28 et +11 ; maintien 0 ; vitesses inchangées ; temps jusqu'à la cible raccourcis (par exemple 24 → 16 semaines) parce que le plan tient la vitesse. Identique au rapport 38 (−58 à −211, +10 et +28) [mesuré].
- **R et S** :
  - aperçu avec historique : R 1 405,2 → 1 242,5 kcal/j à 0,9 %/sem. (plancher) ; S 1 502,8 → 1 264,5 kcal/j à 1 %/sem. ;
  - seuls les champs du plan changent (cible, macros, solve, avertissements `belowRee` et `lowCarbForResistance`, rejets, `limitingRule`) ; l'estimation du maintien est identique [mesuré] ;
  - dans le store calibré de la capture, l'offset change (R −270 → −412 kcal/j). La capture garde des pesées fixes alors que les journaux reprennent les nouvelles cibles comme apport supposé. C'est un artefact de la capture, pas du modèle [déduit].
- **`convergenceJourney`** : même porte (J14), même nombre de recalibrations (9, 9, 8), estimation finale quasi identique (−385 → −389, −514 → −518, 158 → 160 kcal/j, apparent −362, −477, 157). Les cibles sont 130 à 170 kcal/j plus basses en perte (A, B) et plus hautes en prise (C) [mesuré].
  - Le titre du test contient des valeurs calculées : vitesse avait écrit de nouvelles entrées au lieu d'échouer. Les anciennes entrées sont supprimées.
- **Tests adaptés, avec raison écrite dans le test** [lu] :
  - `constants.test.ts` : version 1.4.0, horizon 28 (legacy 42), IMC cible 20, nouvelles constantes ;
  - `foodJournalPersistence.test.ts` : schéma 7 ;
  - `goals.test.ts` : le solve tient la masse tissulaire au jour 28 (et les options legacy donnent toujours le poids au jour 42) ; invariants du curseur sur la masse tissulaire ; test IMC cible 20 ;
  - `warmStartExactRules.test.ts` : pour R et S à 1 %/sem., le plancher limite les faibles apports déclarés. La maintenance et la vitesse ne baissent jamais ; les calories ne baissent qu'aux marches de vitesse (R : 1 090, 1 280, 1 470, 1 660 kcal ; S : 970, 1 170), sans passer sous le plancher. T1 : une seule marche (0,60 → 0,65 % à 1 820 → 1 830 kcal, −149 kcal/j) au lieu de deux ;
  - `explanationPanel.test.ts` : R limité par le plancher (0,9 %/sem.), le test « vitesse appliquée comme demandée » passe à 0,5 %/sem. ; avertissements du plan de R ; version 1.4.0 ;
  - `trackingChart.test.ts` : la projection part du poids modélisé du jour (77,30 kg pour une tendance à 77,50) ; le graphique la translate pour partir du point de tendance ; la bande à 80 % s'ouvre dès aujourd'hui (0,86 kg), car l'état du jour est lui aussi incertain.

## 5. Choix faits sans consigne

1. **K2 est le défaut de la science** : options absentes = K2. L'ancien solveur ne sert qu'aux comparaisons, via `LEGACY_SOLVER_OPTIONS`. `GOAL_SOLVER_HORIZON_DAYS` vaut 28 ; `LEGACY_SOLVER_HORIZON_DAYS` garde 42.
2. **Option de plancher du journal non portée** (`hardFloorMultiplier`, hors périmètre).
3. **Sources** : une seule source `'guardrail'` pour G1 et G2 (la règle est dans la trace), et `'periodic_replan'`.
4. **Trace** : dans `meta.planEvents`, plans résumés (sans projection), indicateur « vu ». Les échecs y figurent aussi, sans message (G1/G2 : au plus une entrée d'échec par jour).
5. **Cadence du recalcul** : dû à 28 jours depuis le solve du plan ou depuis la dernière évaluation laissée sans effet. Avec une ouverture quotidienne, c'est exactement la cadence du prototype (28, 56…).
6. **Ordre au changement de jour** : journaux, garde-fous, recalcul périodique, alerte de sous-poids. Un garde-fou déclenché remet l'âge du plan à zéro.
7. **`applySliderSteps` garde `createdAt`**. Le curseur échange pas et calories le long du solve du plan (même contexte, même corps modélisé du jour de construction, même masse tissulaire à 28 jours) ; il ne recalcule pas la vitesse depuis l'état du jour. Remettre l'âge à zéro repousserait le recalcul périodique indéfiniment chez un utilisateur qui bouge souvent le curseur. Le recalcul périodique garde les pas choisis.
8. **G1 et « objectif atteint »** : poids de tendance non arrondi, cible de pas du plan en vigueur. Avant, l'écran arrondissait à 0,1 kg et repartait des pas de base.
9. **Migration du poids cible** : seulement pour l'objectif de perte (le maintien imposé par G1 peut légitimement être sous IMC 20). Le poids cible du plan en vigueur est relevé aussi. Sa projection (semaines jusqu'à l'objectif) reste celle d'avant jusqu'au prochain recalcul (au plus 28 jours). Le message est daté du jour du chargement.
10. **Curseurs de poids cible** : l'onboarding arrondit la borne IMC 20 au demi-kilo supérieur (48,5 kg pour 155 cm) ; le changement d'objectif garde la valeur exacte (48,1 kg). La perte n'est pas proposée si le poids cible minimal laisse moins de 0,5 kg sous le poids actuel.
11. **Avertissement avant IMC 20** : plans de perte, IMC de tendance ≥ 20. Calibration de référence : le candidat si la porte est franchie, sinon le dernier snapshot appliqué. Semaines = arrondi supérieur de jour / 7. Non enregistré dans la trace (ce n'est pas un déclenchement) et non fermable : il reste tant que la projection l'annonce.
12. **Alerte de sous-poids** : les 4 semaines de baisse doivent tenir dans la période de maintien imposé. La tendance d'un jour est le dernier point de tendance à cette date. Tout objectif choisi par l'utilisateur met fin au maintien imposé ; une modification du profil ne le fait pas.
13. **Textes** : ceux de l'annexe, avec l'apostrophe typographique de l'app, les vitesses au format de l'app (« 0,5 % »), les calories arrondies à 10 comme ailleurs, et « semaine(s) » accordé.
14. **Seuil du message du recalcul** : sur les cibles exactes (≥ 10 kcal/j). Dans un cas limite, l'affichage arrondi à 10 peut montrer un écart de 10 kcal/j pour 9,9 réels, ou l'inverse.
15. **« Passer en maintien » après un refus** : applique d'abord la nouvelle estimation, puis bascule en maintien.
16. **Nombre de pas « raisonnable »** : la plage du curseur de pas (jusqu'à base + 10 000, sans dépasser 20 000). La vitesse visée est la vitesse demandée, plafonnée par l'IMC.
17. **Sous le curseur de vitesse**, le curseur ne dépasse pas la vitesse maximale : la proposition de pas vise la vitesse la plus rapide que le plafond d'IMC autorise.
18. **Graphique de Suivi** : la courbe du modèle part du point de tendance, translatée de l'écart (affichage seulement). L'avertissement utilise la projection non translatée.
19. **Messages** : cartes sur Aujourd'hui et Suivi, fermées par « OK ».
20. **`explainCurrentPlan`** reconstruit le plan avec son corps modélisé du jour de construction. Si le plan a été construit au moment même d'un changement d'objectif, la part de glucides de base de la calibration peut différer, et le badge peut alors signaler un écart [déduit, non observé].

## 6. Points pour la passe UX/UI

1. Forme, ton et empilement des messages (plusieurs cartes possibles) ; l'avertissement IMC 20 n'est pas fermable.
2. Texte long sous le curseur de vitesse (plancher, maximum, pas) ; pas d'action directe « régler mes pas » depuis la proposition.
3. Le message du recalcul dit « à partir de ton poids actuel » ; le recalcul part en fait de l'état modélisé du jour.
4. En maintien K2, la cible peut différer du « maintien estimé » (exemple observé : 2 340 kcal pour 2 300 estimés) : à expliquer.
5. Graphique : translation de la courbe au raccord ; bande qui s'ouvre dès aujourd'hui.
6. Écran de recalibration refusée : le titre « Wheighty te connaît mieux » cohabite avec le refus.
7. Onboarding : le curseur de poids cible commence au demi-kilo supérieur d'IMC 20, le changement d'objectif à 0,1 kg près.
8. Projection (semaines jusqu'à l'objectif) périmée après une migration de poids cible, jusqu'au prochain recalcul.
9. Écran « Pourquoi ce résultat ? » : les phrases sur la masse tissulaire sont techniques.
10. Taille du bundle (avertissement déjà présent sur `main`).

## 7. Non fait, limites

- Rien sur le journal (passe 5b), aucune modification de prior, sigma, grille, plancher, plafond ou seuil scientifique. Les incohérences 1 à 12 du rapport 33 ne sont pas touchées [lu].
- La cadence des garde-fous en production (quotidienne et après chaque pesée) n'est pas mesurée en boucle fermée : l'équivalence porte sur la cadence hebdomadaire du simulateur [déduit].
- Nettoyage à faire après la fusion : les worktrees temporaires `../Weighty-5a-fixture` (branche de mesure, non modifiée) et `../Weighty-5a-main`.

## 8. Liste de vérification manuelle (10 minutes)

Lancer `npm run dev`, ouvrir l'adresse affichée, de préférence dans une fenêtre de navigation privée : chaque import **remplace** les données de l'app locale. Commencer par le point 1, qui crée un profil. Les profils de test de `docs/verification-5a/` se chargent ensuite par Profil > Mes données > Importer un fichier.

1. **Premier plan** : Commencer ; femme, 60 ans, 155 cm, 60,5 kg, assise, 3 000 pas, allure normale, pas d'entraînement, pas d'historique ; objectif Perdre du poids.
   - Le poids cible ne descend pas sous 48,5 kg.
   - À l'étape vitesse, lire sous le curseur : « Ta vitesse est limitée par ton minimum de 1 200 kcal par jour. Maximum : 0,65 % par semaine. Pour tenir 1,0 % par semaine, il faudrait environ 8 700 pas par jour. »
   - Voir mon estimation : un plan s'affiche.
2. **Curseur de vitesse** : importer `4-plancher.json`, Profil > Changer d'objectif ou de vitesse.
   - Même texte de plancher sous le curseur ; le curseur de poids cible commence à 48,1 kg.
3. **Plancher qui limite, avec la proposition de pas** : couvert par les points 1 et 2 (texte de `4-plancher-attendu.txt`).
4. **Garde-fou IMC 20** : importer `1-garde-fou-imc20.json`.
   - Sur Aujourd'hui : « À ce rythme, ton IMC pourrait passer sous 20 d'ici 1 semaine… ».
   - Ajouter une pesée à 53 kg aujourd'hui : « Ton IMC atteint 20. Pour rester dans une zone sûre, ton plan passe en maintien… ».
   - L'onglet Plan affiche un maintien ; avec Préférences > Détails scientifiques, la ligne « Plan ajusté par un garde-fou ». « OK » ferme le message.
5. **Recalibration refusée** : importer `2-recalibration-refusee.json`, toucher « Une recalibration est prête ».
   - Lire : « On n'a pas pu recalculer ton plan : tu as atteint ton poids cible. Tu peux passer en maintien. »
   - Le bouton « Passer en maintien » mène au plan en maintien.
6. **Migration du poids cible** : importer `3-migration-poids-cible.json` (fichier de l'ancienne version, objectif 52,5 kg pour 165 cm).
   - Sur Aujourd'hui : « Pour ta sécurité, le poids cible minimal correspond maintenant à un IMC de 20. Ton objectif a été ajusté à 54,5 kg. »
   - Après « OK » et un rechargement, il ne revient pas.
