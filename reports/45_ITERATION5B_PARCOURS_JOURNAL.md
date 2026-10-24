# 45. Itération 5b : le parcours journal en production

Date : 29/09/2026. Branche `prod/5b-parcours-journal`, non fusionnée. Marquage : [lu] lu dans un fichier ou une sortie, [mesuré] obtenu en lançant une commande, [déduit] conclusion tirée des deux.

## 1. Pour John, en 10 lignes

1. Quand les journées « écart important » bloquent la recalibration et que le journal est bien tenu (10 des 14 derniers jours), l'app propose de viser ce que l'utilisateur mange déjà ; il peut refuser, la proposition peut revenir une semaine plus tard [mesuré].
2. Un bouton « Aligner ma cible sur ce que je mange » dans l'onglet Plan fait la même chose à la demande ; inactif, il dit combien de jours manquent [mesuré].
3. Cible alignée : médiane des jours saisis, arrondie à 50 kcal, jamais sous le plancher × 1,10 ; ensuite la méthode habituelle, avec ce plancher relevé sur toutes les cibles [mesuré].
4. Après 28 jours de journal et de pesées quotidiennes (14 jours au moins après la bascule), l'app propose un plan calculé à partir du journal, avec l'habitude en mots simples ; l'utilisateur confirme ou reporte (reproposé 4 semaines plus tard) [mesuré].
5. En habitude mesurée : plus de déclaration quotidienne, « Équilibre d'après ton journal » au lieu du maintien estimé, et la ligne « Ton habitude » dans Plan [mesuré].
6. Deux pesées ou deux journées oubliées sur 28 sont tolérées ; au-delà, retour en cible alignée avec un message, puis retour dans l'habitude quand la régularité revient [mesuré].
7. Une journée à moins de la moitié des journées habituelles est traitée comme incomplète ; la vue du jour le signale [mesuré].
8. Hors habitude mesurée, la déclaration du jour est préremplie d'après le journal ; l'utilisateur confirme [mesuré].
9. Équivalence avec le prototype validé : 0 différence sur 17 275 appels (400 utilisateurs, 24 semaines). Les utilisateurs sans journal sont inchangés au bit près [mesuré].
10. À faire : ta vérification manuelle (section 8), puis la fusion.

## 2. Ce qui a été fait, point par point

Commits, dans l'ordre [mesuré] : `a38ca44` (domaine, science, schéma 8, tests), `d3f1720` (écrans, profils de vérification), `ee0bb43` (note de THRESHOLDS.md), `11346b0` (équivalence et temps), `b6aca7c` (évaluation hebdomadaire dans un worker), puis ce rapport.

### 2.0 Arrêt au démarrage et décision A

- Le moteur traitait déjà les jours manquants, autrement que la décision 7 [lu] (`src/science/calibration.ts`, `reconstructJournalDays`) :
  - un jour non exploitable reçoit la médiane des totaux saisis des 14 jours précédents (à défaut, la médiane de la fenêtre ; à défaut, la cible du jour), avec un poids 0,5 ;
  - `habitOf` (prototype) le compte dans h (apport imputé au numérateur, cible au dénominateur).
- Arrêt et rapport (règle d'arrêt) ; ta décision du 29/09 : **A**, garder le mécanisme du prototype. La décision 7 se réduit à la tolérance de 2 jours sur 28 et au retour en cible alignée au-delà. Pourra être revu plus tard (changement de science : version du modèle, mesure) [lu].
- Les trois autres écarts signalés (médiane sur les jours saisis seulement, règle R1 pour le repas oublié, tolérance des pesées sur 28 jours) suivent le prompt ; aucun ne joue dans l'équivalence [mesuré, section 3.1].

### 2.1 Science portée (modèle 1.5.0)

- `src/science/goals.ts` : option `hardFloorMultiplier` du contexte et `planHardFloorKcal`, utilisées par `evaluateWeeklyRate`, `buildGoalPlan` et `solveSliderPoint`, à l'identique du prototype [lu, `git diff archive/bench-journal-battery`].
- `src/science/calibration.ts` : grille élargie `offsetGridHalfRangeKcal` et `widenedOffsetGrid`, à l'identique [lu].
- `src/science/constants.ts` : `SCIENTIFIC_MODEL_VERSION` 1.5.0 et les constantes du parcours (valeurs du bras 2d et du prompt), toutes avec leur catégorie. Aucun prior, sigma, grille de production, plancher, plafond ni borne de h modifié [lu].
- Non porté : le mode « journal lu, habitude ignorée » (bras J), les glucides saisis, la densité de pesées du prototype (remplacée par les tolérances du 28/09, identique quand l'utilisateur se pèse chaque jour) [lu].

### 2.2 Domaine

- `src/domain/engine.ts` :
  - `SolverRequest.hardFloorMultiplier`, transmis au contexte par `buildPlanFromStore` (comme le prototype) ;
  - `pathSolverRequest` : en cible alignée, toutes les reconstructions de la méthode habituelle (recalibration, recalcul périodique, garde-fous, changement d'objectif, curseurs) portent le plancher × 1,10 ; `rebuildContextFromStore` et `contextForCurrentPlan` aussi ;
  - tant que le plan en vigueur est la cible alignée elle-même : pas de recalcul périodique, G1 seulement (rapport 40) ; `endChosenTarget` la clôt dès qu'un plan la remplace ;
  - `currentMethodMaySurface` : pas de recalibration de la méthode habituelle en habitude mesurée ; en cible alignée, pas avant 7 jours après la bascule (première évaluation hebdomadaire du prototype) ;
  - curseur pas / calories refusé sur la cible alignée elle-même et en habitude mesurée.
- `src/domain/journalPath.ts` (nouveau) : portage fonction par fonction du harness : `revisionProposalTriggered`, `withChosenTarget`, `journalSolverOptions`, `journalGoalPlan`, `journalPlanOf`, `habitOf`, `jstarPlanOf`, `jstarSurfaced`, `enforceJStarPlanGuardrails`, et les étapes d'`evaluateJStar` et de `jstarPeriodicStep` ; puis les règles du 28/09 :
  - proposition automatique (`checkAlignProposal`), refus (`declineAlignProposal`), bouton (`alignButton`), bascule (`switchToAlignedTarget`) ;
  - fenêtre du journal : premier jour de saisie continue (`continuousLoggingStart`) ;
  - porte de l'habitude mesurée (`measuredGate`) et tolérances ;
  - évaluation hebdomadaire en deux temps : `evaluateJournalWeek` (lourde, pure) et `applyJournalWeek` (écriture) ;
  - offres à confirmer (`acceptMeasuredOffer`, `declineMeasuredOffer`), retour en cible alignée (`exitToAligned`) ;
  - recalcul périodique (`measuredPeriodicReplan`) et garde-fous (`enforceMeasuredGuardrails`) de l'habitude ;
  - changements d'objectif et de profil (`changeGoalOnPath`, `updateProfileOnPath`, `switchToMaintenanceOnPath`) ;
  - vues : équilibre, habitude, adhérence suggérée, journée incomplète, projection de l'habitude.
- Le journal n'atteint la science que par `intakeObservationsFrom` (D8) ; `journalPath.ts` n'importe pas `journal.ts` [mesuré, test statique].
- `src/domain/planSafety.ts` : `runDailyChecks` et `runWeighInChecks` passent par les garde-fous de la méthode en cours ; ajoutent la proposition, l'encouragement à la pesée et (hors app) l'évaluation hebdomadaire.
- `src/store/journal.worker.ts`, `journalClient.ts` (nouveaux) : l'évaluation hebdomadaire tourne dans un worker dédié, séparé du worker de calibration (section 3.4).

### 2.3 Écrans

- Zone de messages (Aujourd'hui, Suivi) : cartes de la proposition et du plan à confirmer, chacune avec ses deux boutons (`JournalCards.tsx`) ; messages du parcours fermés par « OK », comme ceux de la 5a.
- Onglet Plan : bouton « Aligner ma cible… » (et sa carte en place) ; en habitude mesurée, « Équilibre d'après ton journal : {M} kcal par jour. », « Ton habitude : … », sans « Pourquoi ce résultat ? » ni curseur manger / marcher.
- Aujourd'hui : en habitude mesurée, pas de tuile Adhérence, ligne « Ton plan suit ton journal et tes pesées. ».
- Déclaration du jour : préremplie d'après le journal, avec la phrase de l'annexe.
- Journal : « Journée incomplète ? … » sous le total d'un jour passé écarté.
- Analyse : « Équilibre d'après ton journal » en habitude mesurée.
- Changement d'objectif, « objectif atteint », modification du profil : via les fonctions du parcours.

### 2.4 Versions, schéma, trace

- Schéma 7 → 8 : `AppMeta.journalPath` (méthode, date de bascule, cible alignée, cible alignée en vigueur, proposition ouverte, dernier refus de la proposition, dernier refus du premier plan, entrée dans l'habitude, dernière évaluation, porte, estimation et h en vigueur, référence de surfaçage, offre en attente, dernier retour et son motif). Migration : méthode « supposée tenue », rien d'autre ne change ; un `journalPath` illisible est signalé, jamais remis à zéro en silence [mesuré].
- Trace `meta.planEvents` : bascule, refus de la proposition, invitation à noter, encouragement à la pesée, offre (et son échec silencieux), entrée, mise à jour, refus d'une offre, retour en cible alignée ; recalculs et garde-fous de l'habitude sous les règles de la 5a [lu].
- `THRESHOLDS.md` : note du 28/09 ajoutée [lu].

## 3. Vérifications

### 3.1 Équivalence avec le prototype validé

- **Méthode** [lu] : celle de la 5a (fixture).
  - Worktree `../Weighty-5b-proto` de `archive/bench-journal-battery` ; instrumentation non commitée de `tests/helpers/closedLoop.ts` (9 points d'appel, un bloc de fonctions `fix5b*` ; `git diff` : 124 lignes ajoutées, 1 modifiée pour un import).
  - Simulateur inchangé : bras C et JS de l'itération 2d (K2 + G, `jobs2d.ts`), 200 premiers utilisateurs de V1 (job `v1`) et 200 premiers de V3 en P10 (job `v3`, indices 7 500 à 7 699), 24 semaines.
  - Appels interceptés : proposition (déclenchée ou non), bascule et cible alignée, évaluations et recalibrations de la méthode habituelle en cible alignée, recalculs périodiques (et jours sautés sur la cible alignée elle-même), garde-fous, évaluations J* (premier plan et suivants, surfaçage, échecs), recalculs périodiques J*, garde-fous J*.
  - Règle IMC 20 de la 5a : la sortie attendue est recalculée par le prototype sur la même entrée, objectif de perte relevé au poids d'IMC 20 (pour les fonctions internes au harness, sur une copie de l'état). La simulation continue avec le résultat d'origine.
  - Stores réduits (pesées, journaux passés et saisies = préfixes du store final), chaque réduction vérifiée avant écriture : 0 conservé en entier.
  - Rejeu avec les fonctions de production par défaut, stores chargés par les migrations 6 → 7 → 8, état du parcours fixé d'après l'état du simulateur. Conservé du prototype : premier plan confirmé d'office, garde-fous chaque semaine, règle IMC 20.
  - Fichiers : `tests/experiments-journal/prod5b/fixture.bench.ts` (copie), `equivalence.experiment.ts` ; sorties dans `tests/experiments-journal/results/prod5b/` (ignoré par git).
- **Résultat [mesuré]** : **0 différence** sur 17 275 appels ; tous les champs du plan (et du profil pour G1) comparés bit à bit, sauf `source` et `scientificModelVersion`.

| Appels rejoués (V1 + V3 P10) | Nombre | Issues du prototype, toutes reproduites |
|---|---|---|
| proposition (déclenchée ou non) | 1 108 | 323 déclenchées, 785 non |
| bascule et cible alignée | 646 | 108 relevées au plancher × 1,10 |
| évaluations de la méthode habituelle en cible alignée | 4 892 | 3 949 recalibrations appliquées, 156 refusées (132 `no_feasible_speed`) |
| recalculs périodiques en cible alignée | 318 (+ 14 jours sautés) | 311 recalculés, 7 refusés |
| garde-fous en cible alignée | 1 828 | G1 21, G2 42 |
| évaluations J*, premier plan | 781 | 319 appliqués, 139 échecs (119 `no_feasible_speed`), 323 trop tôt |
| évaluations J*, habitude en vigueur | 6 002 | 3 328 plans appliqués, 86 échecs, 2 588 non surfacés |
| recalculs périodiques J* | 155 | 145 recalculés, 10 refusés |
| garde-fous J* | 1 531 | G1 20, G2 34 |
| **total** | **17 275** | **0 différence** |

- Tolérances et repas oubliés [mesuré] : sur 6 460 évaluations J* avec porte, 0 pesée manquée, 0 jour non exploitable, 0 jour écarté par la règle des repas oubliés, fenêtre toujours depuis l'inscription.
- Contrôle négatif [mesuré] : 80 sur 80 diffèrent (recalibration sans le plancher × 1,10 ; plan J* avec h = 1).
- Durée : génération 799 s (32 processus), rejeu 308 s (8 processus) ; refait sur le code final (`b6aca7c`) : 0 différence, 275 s [mesuré].

### 3.2 Utilisateurs sans journal inchangés

Captures `tests/experiments-journal/capture/` sur `main` (worktree `../Weighty-5b-base`) et sur la branche [mesuré, `results/prod5b/captures.txt`] :

| Capture | Valeurs numériques | Différences |
|---|---|---|
| T-03 | 1 003 779 | 0 |
| T-04 | 1 497 006 | 0 |
| golden | 3 041 | 0 |
| R et S | 9 838 | 32 |
| `convergenceJourney` | 8 716 | 41 |

- Les 73 différences, une par une [mesuré] : `schemaVersion` 7 → 8 (7), `scientificModelVersion` et `modelVersion` 1.4.0 → 1.5.0 (dans les stores, plans, snapshots, candidats et explications), et la clé `journalPath` ajoutée à `meta` (valeur par défaut). Aucune valeur de plan, de calibration ou de trajectoire ne change. Aucun utilisateur de ces captures ne bascule [déduit].

### 3.3 Tests unitaires

- Avant la passe : 590 tests. À la fin : 617 (47 fichiers) [mesuré].
- `tests/domain/pass5b.test.ts` (27 tests), qui couvre la liste du prompt :
  - proposition automatique avec et sans journal suffisant, invitation au plus une fois par semaine, refus et retour après 7 jours ; bouton actif, inactif, « encore 1 » ;
  - cible alignée (médiane des jours saisis seulement, arrondi, plancher × 1,10 et son message) ; sur la cible alignée : pas de recalcul périodique, pas de curseur, encouragement à la pesée une fois par semaine ;
  - porte : ouverte à 28 jours de journal et 14 jours après la bascule, 2 pesées manquées tolérées et 3 qui ferment, 2 jours non saisis tolérés et 3 qui ferment ;
  - repas oublié à 49 % (écarté) et 51 % (gardé), ligne de la vue du jour ;
  - jour manquant : imputé par la médiane des 14 jours saisis précédents et compté dans h (décision A) ;
  - premier plan : texte, confirmation, refus puis reproposition à 4 semaines, échec `no_feasible_speed` sans message ;
  - retour en cible alignée (pesées, saisies) et retour dans l'habitude ;
  - surfaçage sur M / h ; référence après un refus ;
  - I* ≥ 1,10 × h × plancher et T = I* / h, plancher actif compris ;
  - adhérence suggérée à 10 % et 25 %, dans les deux sens ;
  - habitude mesurée : pas de déclaration, équilibre et habitude affichés, « dépense » absent ;
  - schéma 7 chargé sans perte, `journalPath` illisible signalé ;
  - correction d'une saisie passée relue par l'évaluation suivante, cibles passées inchangées ;
  - évaluation hebdomadaire laissée au worker par le changement de jour de l'app, même résultat une fois écrite.
- Tests adaptés, avec la raison écrite dans le test [lu] : version 1.5.0 (`constants`, `explanationPanel`, instantanés R et S : seule la version change), schéma 8 (`foodJournalPersistence`), ordre des messages et clés de `meta` (`uxPass1`), isolation du journal (`foodJournal` : le régime journal n'est plus atteint que par `journalPath.ts`, jamais par le worker de calibration ni le moteur).

### 3.4 Temps

Sur 12 profils d'un an de données en habitude mesurée (pesée et trois repas saisis chaque jour, cible alignée au jour 30, habitude au jour 58), médiane de 3 mesures après un tour de chauffe, en ms [mesuré, `results/prod5b/timing.txt`] :

| Opération | P50 | P95 | P95 × 4 |
|---|---|---|---|
| évaluation hebdomadaire (`evaluateJournalWeek` : ajustement du journal, h, plan) | 582,2 | 615,8 | 2 463 |
| changement de jour dans l'app, évaluation due (elle part au worker) | 0,2 | 0,3 | 1 |
| changement de jour, rien de dû | 0,2 | 0,3 | 1 |
| changement de jour, recalcul périodique de l'habitude dû | 18,7 | 20,5 | 82 |
| contrôles après une pesée | 0,1 | 0,3 | 1 |
| projection de Suivi en habitude mesurée | 24,1 | 26,0 | 104 |

- L'évaluation hebdomadaire coûte 2,5 s au P95 × 4, au-dessus de la référence 5a (1 432 ms pour le recalcul complet de la méthode habituelle). Causes : grille de ±2 000 kcal (801 points contre 481) et reconstruction du journal sur un an [mesuré, déduit].
- Sur le fil principal, elle aurait figé l'app environ 0,6 s une fois par semaine (2,4 s avec le ralentissement × 4) [mesuré]. Elle tourne donc dans un worker dédié (`src/store/journal.worker.ts`), séparé de celui de la calibration ; le changement de jour reste sous 1 ms, et la proposition du plan apparaît dès que le calcul est fini [mesuré, vérifié dans le navigateur].

### 3.5 Build et PWA

- `npm run check` : types et lint sans erreur, 617 tests sur 617 [mesuré].
- `npm run build` : OK [mesuré].
  - 31 fichiers précachés (1 491 Kio), contre 30 (1 406 Kio) sur `main` : le worker du journal (54,7 kB) s'ajoute ;
  - bundle principal 593,2 kB contre 561,4 kB sur `main` (+31,8 kB) ; même avertissement « chunk > 500 kB » que sur `main`.
- Hors ligne sous `/wheighty/` [mesuré] : build servi par un serveur statique local, service worker actif (portée `/wheighty/`), worker du journal en cache ; serveur arrêté puis page rechargée : l'app s'affiche, servie par le service worker.

### 3.6 Vérifié dans le navigateur

Serveur de dev de la branche, profils de `docs/verification-5b/` chargés dans le stockage local [mesuré, texte des pages ; captures d'écran impossibles, fenêtre masquée] :
- proposition : carte et textes de l'annexe ; « Viser 2 150 kcal » bascule (cible 2 150, plancher du plan 1 320, méthode alignée) ;
- bouton : inactif avec « encore 1 », actif après une saisie d'hier, carte en place ;
- premier plan : carte, « 10 % de plus », cible 1 760 kcal ; après confirmation, Aujourd'hui sans tuile Adhérence, Plan avec l'équilibre et l'habitude, sans « Pourquoi ce résultat ? » ;
- retour en cible alignée : message des pesées ;
- déclaration préremplie « Léger écart » ; « Journée incomplète ? … » sur hier ;
- le retour en cible alignée passe par le worker du journal (le message apparaît une ou deux secondes après l'ouverture) ;
- aucune erreur en console au chargement.

## 4. Choix faits sans consigne

1. **Jours manquants** : mécanisme du prototype (décision A du 29/09).
2. **Repas oublié** : règle R1 existante, seuil 0,5, médiane des jours saisis parmi les 14 jours précédents ; aussi pour la cible alignée, la porte et h.
3. **Premier jour de saisie continue** : le lendemain du dernier trou de plus de 2 jours non exploitables consécutifs, sinon le premier jour exploitable depuis l'inscription.
4. **Tolérances** : comptées sur les 28 jours précédant le jour d'évaluation (le jour même exclu, pour ne pas compter une pesée du matin pas encore faite), dans la fenêtre du journal.
5. **Cadence** : évaluation du parcours tous les 7 jours depuis la bascule, puis depuis la dernière évaluation (une seule après plusieurs jours sans ouverture, comme la 5a).
6. **Première recalibration en cible alignée** : pas avant 7 jours après la bascule ; ensuite la cadence de production (continue), comme la 5a.
7. **Proposition** : ouverte au changement de jour quand elle se déclenche, elle reste jusqu'à la réponse ; la cible affichée est recalculée le jour de la réponse. Refus par le bouton de Plan : la carte se ferme, sans compter comme un refus de la proposition automatique.
8. **Bouton** : affiché seulement en cible supposée tenue.
9. **Offres de l'habitude** : un plan à confirmer reste jusqu'à la réponse ou jusqu'à l'évaluation suivante, qui le remplace ; appliqué tel que calculé (date de construction). Une offre est retirée par un changement d'objectif ou de profil.
10. **Plans suivants refusés** : l'estimation refusée devient la référence de surfaçage (comme une recalibration vue).
11. **Textes sans annexe** : titre et texte des plans suivants (« Ton plan peut être ajusté », « … ta cible passerait de {avant} à {après} kcal par jour. »), messages brefs (« Nouvelle cible appliquée. », « Nouveau plan appliqué. », « Ton plan suit ton journal et tes pesées. », indisponibilité du curseur).
12. **Retour pour saisies manquantes** : « Il y a plusieurs journées non saisies ces dernières semaines : … quand tu auras repris tes saisies. » La lecture littérale (« Il manque plusieurs journées non saisies ») dirait le contraire.
13. **Habitude « de près »** : sous 2 % d'écart, dans Plan aussi : « Ton habitude : tu tiens ta cible de près. »
14. **Retour en cible alignée** : le plan en vigueur reste jusqu'à ce que la méthode habituelle (plancher × 1,10) le reconstruise ; la cible alignée d'origine n'est pas réappliquée.
15. **Écart de l'adhérence suggérée** : |saisi − cible| / cible, pour que 10 et 25 % tombent exactement sur les seuils ; suggestion seulement pour un jour exploitable, et seulement si la journée n'est pas déjà déclarée.
16. **« Journée incomplète »** : jours passés seulement, et une fois le journal utilisé par le plan (cible alignée ou habitude).
17. **Sources des plans** : ceux de l'habitude gardent les sources existantes (`recalibrated` pour une offre, `periodic_replan`, `guardrail`, `initial` pour un changement d'objectif).
18. **G1 en habitude mesurée** : date le maintien imposé (`guardrailMaintenanceSince`), comme la 5a, pour l'alerte de sous-poids.
19. **Projection en habitude mesurée** (Suivi, avertissement IMC 20, déficit du jour 0) : maintien du journal du jour, corps modélisé du journal, apport attendu = cible × h.
20. **Évaluation hebdomadaire hors du fil principal** : worker dédié ; le résultat n'est écrit que si l'évaluation est toujours due et la méthode inchangée.

## 5. Points pour une prochaine passe UX

1. Cartes à deux boutons dans la zone de messages : forme, place, empilement avec les messages « OK ».
2. En cible alignée, l'échéance affichée reste celle du plan précédent (le prototype garde la projection) ; de même pour les plans de l'habitude.
3. Retour en cible alignée : l'encouragement à la pesée peut suivre le message de retour dès le lendemain.
4. Modification du profil en habitude mesurée : l'aperçu (écran Résultat) montre la méthode habituelle, le plan appliqué est celui de l'habitude.
5. « Pourquoi ce résultat ? » masqué en habitude mesurée : une explication propre à l'habitude manque.
6. Le texte des plans suivants et les messages brefs sont provisoires.
7. Aujourd'hui, en cible alignée : la ligne de la porte de recalibration parle des « journées d'écart » alors que la déclaration n'est plus le vrai sujet.
8. Le curseur manger / marcher disparaît sans explication dans Plan (seule la feuille l'explique).

## 6. Non fait, limites

- Rien sur les points reportés du prompt (glucides saisis, dérive du biais, alertes d'énergie disponible et de protéines, maintien déclaré au refus, déclenchement par l'écart journal / cible, chantier maintien) [lu].
- L'équivalence porte sur la cadence hebdomadaire du simulateur ; la production évalue la méthode habituelle en continu et les garde-fous chaque jour, comme en 5a [déduit].
- Nettoyage après la fusion : worktrees `../Weighty-5b-proto` (instrumentation non commitée à annuler par `git checkout`) et `../Weighty-5b-base`.

## 7. Git

- Branche `prod/5b-parcours-journal` depuis `main` (`46ad2bd`, 5a et passe UX 1 fusionnées).
- Ajouts par chemins explicites ; aucun brut, aucune archive (résultats dans `tests/experiments-journal/results/`, ignoré) [mesuré].

## 8. Liste de vérification manuelle (10 minutes)

Lancer `npm run dev`, ouvrir l'adresse affichée, de préférence dans une fenêtre de navigation privée : chaque import **remplace** les données de l'app locale.

- Créer d'abord un profil quelconque (l'import est dans Profil > Mes données > Importer un fichier).
- Après chaque import, **recharger la page** : les contrôles du changement de jour tournent au chargement.
- Les fichiers de `docs/verification-5b/` sont datés du 29/09/2026. Pour un autre jour, les régénérer : `MANUAL_TODAY=AAAA-MM-JJ npx vitest run -c vitest.journal.config.ts prod5b/manualProfiles`.

1. **Proposition automatique** : importer `1-proposition.json`.
   - Sur Aujourd'hui : « Ta cible ne correspond pas à ce que tu manges », « environ 2 150 kcal par jour », boutons « Viser 2 150 kcal » et « Garder ma cible ».
   - « Garder ma cible » : la carte disparaît, la cible reste 1 810 kcal.
2. **Cible alignée** : réimporter `1-proposition.json`, recharger, « Viser 2 150 kcal ».
   - À manger : 2 150 kcal. Onglet Plan : pas de curseur « Équilibre alimentation / marche », pas de bouton d'alignement.
3. **Bouton** : importer `2-bouton.json`.
   - Onglet Plan : « Aligner ma cible sur ce que je mange » grisé, « Disponible quand 10 des 14 derniers jours sont saisis (encore 1). ».
   - Journal > Hier : ajouter une saisie libre de 1 850 kcal. Retour sur Plan : le bouton est actif ; le toucher ouvre la carte « Viser 1 850 kcal ».
4. **Premier plan accepté** : importer `3-premier-plan.json`.
   - Sur Aujourd'hui : « Ton journal permet un plan plus précis », « tu manges 10 % de plus que ta cible », « 1 760 kcal par jour ».
   - « Utiliser ce plan » : À manger 1 760 kcal, plus de tuile Adhérence, ligne « Ton plan suit ton journal et tes pesées. ».
   - Onglet Plan : « Équilibre d'après ton journal : 2 470 kcal par jour. », « Ton habitude : tu manges en moyenne 10 % de plus que ta cible… », plus de « Pourquoi ce résultat ? ».
5. **Premier plan refusé** : réimporter `3-premier-plan.json`, recharger, « Plus tard ».
   - La carte disparaît ; la cible reste 2 100 kcal, la tuile Adhérence est là.
6. **Retour en cible alignée** (3 pesées manquées) : importer `4-retour-cible-alignee.json`.
   - Une ou deux secondes après le chargement : « Il manque plusieurs pesées ces dernières semaines : ton plan repasse sur ta cible alignée… ».
   - Onglet Plan : « Maintien estimé » revient, la ligne « Ton habitude » a disparu.
7. **Journée incomplète** : importer `5-journee-incomplete.json`.
   - Journal > Hier : « Journée incomplète ? Elle ne sera pas prise en compte dans ton plan. »
8. **Déclaration préremplie** : même profil, tuile Adhérence d'Aujourd'hui.
   - « D'après ton journal : écart léger. C'est bien ça ? », « Léger écart » déjà sélectionné ; « Valider » l'enregistre.
