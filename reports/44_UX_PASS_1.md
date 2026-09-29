# Rapport 44 : passe UX 1 (journal, navigation native, curseurs, Historique, messages de la 5a)

Passe d'interface uniquement. Aucune science, aucun solveur, aucun seuil ni déclencheur de la 5a n'a changé. Les sorties scientifiques capturées sont identiques au bit près avant et après chaque demande.

Étiquettes : [lu] lu dans le code ou un document, [mesuré] sortie d'une commande ou d'un test, [déduit] raisonnement.

## 1. Git

- Base : `origin/main` = `b976a737546ea88208b5c6df6894548bedb65c18` (merge de `prod/5a-solveur-garde-fous`) [mesuré].
- 5a présente dans la base : `git merge-base --is-ancestor 63c1be3 origin/main` réussit, `reports/43_ITERATION5A_PRODUCTION.md` est suivi [mesuré].
- Branche `ux/pass-1` créée depuis `origin/main` ; elle n'existait pas [mesuré]. Aucun commit sur `main`, aucune fusion.
- Scripts de capture déjà présents sur la base (`tests/experiments-journal/capture/`) : pas de commit d'outillage [mesuré].

| Commit | Demande |
|---|---|
| `5cd6c76` | A. Aliment libre sans macros |
| `2c3e351` | B. Modifier un aliment libre |
| `d041b94` | C. Calories de chaque tranche horaire |
| `4393ae0` | D. Curseurs plus précis |
| `0fd274b` | E. Navigation native |
| `bab78fd` | G. Messages et explications de la 5a |
| `b2be80a` | F. Page Historique (squelette et accès) |
| (ce commit) | Rapport |

SHA final avant le rapport : `b2be80a20baecc6976e8aa426473df275df6222c` [mesuré]. F a été fait après G : John a demandé qu'on se concerte avant de construire la page (section 9).

## 2. Inventaire (base `b976a73`)

### 2.1 Saisie d'un aliment libre [lu]

- **Type** : `FoodEntry` (`src/domain/types.ts:70`), nutriments `FoodNutrients` (`types.ts:63`) avec `proteinG`, `carbsG`, `fatG` en `number | null` (`types.ts:65-67`). Une saisie libre est `source: 'manual'`, `sourceId`, `sourceVersion` et `per100g` à `null`, `quantity` facultative.
- **Validation stockage** : `isFoodEntry` (`src/persistence/schema.ts:177`) accepte des macros nulles (`isFoodNutrients`, `schema.ts:166-167`, `isNullableNonNegative`).
- **Obligation des macros** : seulement dans l'UI. `ManualTab` refuse une saisie sans les trois macros (`src/screens/Journal.tsx:895-906`, `manualMacrosRequired`). Ni le type ni la validation ne les exigent.

### 2.2 Lectures des macros d'une saisie [lu]

| Lecture | Fichier | Sans macros |
|---|---|---|
| Totaux du jour | `intakeTotals` (`src/domain/journal.ts:218`) | macro inconnue comptée 0 |
| Signal de total partiel | `missingMacros` (`journal.ts:181`), `journalDay` (`journal.ts:199`) | la macro est signalée « ≥ » |
| Jauges du journal | `Journal.tsx:56-59`, `119-148` | minimum affiché, phrase `partialMacros` |
| Aliments récents, « Mes aliments » | `recentFoods` (`journal.ts:252`), `rememberManualFood` (`foodLibrary.ts:63`) | recopie telle quelle (null) |
| Science | `intakeObservationsFrom` (`src/domain/intakeObservations.ts:40-41`) | lit **uniquement** `intakeLoggedKcal`, jamais les macros |
| Moteur, calibration | `StoreProvider.tsx:108` vide le journal avant le worker ; `calibration.ts:185`, `264` lisent `macrosForDay` du **plan** (`DailyLog`), pas les saisies | sans objet |

Aucun calcul scientifique ne lit les macros d'une saisie : A pouvait continuer [lu] [mesuré, test « the science never reads the macros of an entry »].

### 2.3 Modification d'une saisie [lu]

Aucun chemin de modification. Il existe l'ajout `addFoodEntry` (`journal.ts:95`), la suppression `deleteFoodEntry` (`journal.ts:140`) et la restauration après « Annuler » `restoreFoodEntry` (`journal.ts:147`). Aucun ne déclenche de recalcul, de rejeu, de snapshot ni de trace : le journal est hors du moteur (`StoreProvider.tsx:108`, et `calibrationFingerprint` ne lit pas le journal, `src/store/calibrationClient.ts:53-78`).

### 2.4 Totaux [lu]

Domaine : `intakeTotals` somme puis arrondit au centième (`round2`, `journal.ts:219`). L'UI arrondit à l'entier pour l'affichage (`formatInteger(Math.round(...))`, `Journal.tsx:107`). Pas de total par tranche horaire dans la base ; les tranches viennent de `hourGroups` (`journal.ts:224`).

### 2.5 Curseurs [lu, pixels mesurés ou déduits]

Un seul composant, `Range` (`src/components/controls.tsx`), linéaire : valeur = min + p × (max − min), puis arrondi à la grille `min + k × pas`. Pistes à 360 px : 312 px dans les écrans et les feuilles (marges 24 px) [mesuré sur « Pas du jour » et « Manger ↔ Marcher »], 308 px dans l'onboarding (marges 26 px) [déduit du CSS].

| Curseur | Où | Bornes, pas, zone désactivée | Valeurs |
|---|---|---|---|
| Vitesse (perte) | onboarding, « Ton objectif » | 0,2 à 1,0 %/sem., pas 0,05 %, au-delà de `maxSelectableRate` hachuré | 17 |
| Vitesse (prise) | idem | 0,1 à 0,5 %/sem., pas 0,05 % | 9 |
| Poids cible | onboarding (`Onboarding.tsx:653-656`) | perte : IMC 20 arrondi au demi-kilo supérieur à poids − 0,5 ; prise : poids + 0,5 à poids × 1,35 ; pas 0,5 kg (1 lb en impérial) | ex. 43 (78 kg, 168 cm) |
| Poids cible | « Ton objectif » (`Account.tsx:130-131`) | perte : IMC 20 **au dixième**, non arrondi, crans décalés (55,3 / 55,8…) | ex. 43 |
| Masse grasse | onboarding | 3 à 50 %, pas 1 | 48 |
| Pas moyens | onboarding | 0 à 25 000, pas 100 | 251 |
| Manger ↔ Marcher | feuille équilibre | `sliderBounds` (ex. 2 000 à 17 500), pas 100, sous le plancher hachuré | ex. 156 |
| Pas du jour | feuille pas | 0 à 30 000, pas 100 | 301 |

Pixels par valeur : tableau de la section 5.

### 2.6 Navigation (base) [lu]

- Mécanisme : `pushState` / `replaceState` / `popstate` sur `history.state = { screen, sheet }` (`src/app/navigation.tsx:61-94`).
- Entrées créées : **chaque** `go()` (y compris les changements d'onglet, `navigation.tsx:74-75`) et chaque ouverture de feuille (`navigation.tsx:86-87`).
- Retour depuis un onglet : onglet précédent visité (pile du navigateur). Sous-écran : écran précédent. Feuille de navigation : fermée. Feuilles locales (options d'une pesée dans Suivi, consentement et effacement Open Food Facts) : **pas** fermées par le retour. Étape d'onboarding : sort de l'onboarding (les étapes ne sont pas dans l'historique). Fin d'onboarding : `go('today', { replace: true })`, mais les entrées d'intro restent dessous, le retour pouvait y ramener.
- Défilement : remis en haut à chaque `go()` (`navigation.tsx:78`), jamais restauré.
- Transitions : fondu montant de 0,35 s sur chaque écran (`app.css:179`, `wFade`), identique pour onglets et sous-écrans.

### 2.7 Données disponibles pour l'Historique [lu]

| Donnée | Stockée ? | Forme | Sélecteur |
|---|---|---|---|
| Calories saisies | oui (journal facultatif) | `foodJournal.entries[].intake.energyKcal` | `journalDay` (`journal.ts:199`) |
| Macros saisies | oui, nullables | `intake.proteinG/carbsG/fatG` | `journalDay` |
| Pesées | oui | `store.weights` (`StoredWeight`, `types.ts:35`), plusieurs par jour possibles | aucun sur fenêtre ; `recentWeights` (`views.ts:253`) |
| Tendance du poids | non, recalculée | `computeTrend` (`science/trend.ts:25`) | `trendOf` (`engine.ts:189`) |
| Pas **effectués** | oui, jours saisis seulement | `DailyLog.actualSteps` (`science/types.ts:131`), `setActualSteps` (`engine.ts:551`) | aucun sur fenêtre |
| Pas **cibles** | oui, figés par jour | `DailyLog.stepTargetForDay` (`science/types.ts:134`) | distincts des pas effectués |
| Adhérence déclarée | oui | `DailyLog.adherence` (`science/types.ts:132`) | `adherenceSummary` (agrégat) |

### 2.8 Messages de la 5a [lu]

| Message | Produit | Texte défini | Affiché, fermeture | Trace `meta.planEvents` |
|---|---|---|---|---|
| Garde-fou IMC 20 (G1) | `enforcePlanGuardrails` (`engine.ts:993`) | `PLAN_MESSAGE.guardrailBmi20` (`planMessages.ts`) | `PlanNotices` (Aujourd'hui `Today.tsx:60`, Suivi `Tracking.tsx:54`), « OK » | oui, message stocké |
| Garde-fou vitesse (G2) | `engine.ts:1004` | `guardrailRateCap` | idem | oui |
| Avertissement avant IMC 20 | `bmi20Warning` (`planSafety.ts:116`), calculé à l'affichage | `bmi20Warning(weeks)` | `PlanNotices.tsx:29-33`, **non fermable** | non |
| Recalcul périodique | `periodicReplan` (`engine.ts:916`), message si écart ≥ 10 kcal/j | `periodicReplan` | `PlanNotices`, « OK » | oui |
| Migration du poids cible | `migrations.ts:38` (schéma 6 → 7) | `targetRaised` | `PlanNotices`, « OK » | oui |
| Recalibration refusée (8 motifs) | `buildPlanFromStore`, `applyRecalibration` | `refusalReasonText`, `recalibrationRefusedText` | `Tracking.tsx:480-488` (note), toasts `410`, `422` | non |
| Plancher et proposition de pas | `speedSliderModelFor` (`engine.ts:462`), `floorAdvice` (`planSafety.ts:157`) | `floorLimit`, `floorSteps`, `floorUnreachable` | sous le curseur (`SpeedSlider.tsx:66-67`), aperçu de recalibration | non |
| Alerte de sous-poids | `checkUnderweight` (`planSafety.ts:73`) | `underweight` | `PlanNotices`, « OK » | oui |

Déclencheurs : `runDailyChecks` au changement de jour (`StoreProvider.tsx:75`), `runWeighInChecks` après chaque pesée (`DailySheets.tsx:77`) [lu].

Fichiers de la 5a touchés par G : `planMessages.ts` (textes), `engine.ts` (un argument de texte à la ligne du message périodique), `planSafety.ts` (sélecteur d'ordre ajouté), `explain.ts` (sélecteur de notes ajouté), `PlanNotices.tsx`, `SpeedSlider.tsx`, `Tracking.tsx`, `ResultExplanationView.tsx`, `WeightChart.tsx`. `StoreProvider.tsx` (`runDailyChecks`) et `Account.tsx` n'ont pas été modifiés pour G [lu].

## 3. Par demande

### A. Aliment libre sans macros : fait

- Case « Je ne connais pas les macros » dans la saisie libre : les champs de macros disparaissent, la saisie est enregistrée avec ses kcal et `null` pour les trois macros. Sans la case, validation inchangée (les trois macros exigées).
- Aucun bump de schéma : les macros nulles étaient déjà admises par le type et la validation (2.1). Données anciennes chargées à l'identique, octet pour octet [mesuré, test].
- Affichage du jour : sous le total, « dont 320 kcal sans détail des macros » ; les jauges de macros restent des minimums (« ≥ ») et la phrase devient « Certains aliments n'ont pas le détail des macros : ces totaux sont des minimums. » quand les trois manquent.
- Sélecteurs purs `hasNoMacros`, `kcalWithoutMacros` ; `JournalDay.intakeKcalWithoutMacros`.
- Une saisie réutilisée ou modifiée qui n'avait pas de macros rouvre la case cochée.
- Fichiers : `src/domain/journal.ts`, `src/screens/Journal.tsx`, `src/app/copy.ts`.

### B. Modifier un aliment libre : fait

- Lien « Modifier » sur chaque saisie libre (pas sur les produits Ciqual et Open Food Facts). Feuille « Modifier la saisie » : nom, kcal, case de A, macros, poids, heure de consommation.
- Aucun chemin de modification n'existait (2.3) : `replaceManualEntry` est exactement `deleteFoodEntry` puis `addFoodEntry` (même validation, même règle de jour, saisie déplacée en fin de liste), avec les mêmes effets de bord que l'ajout depuis l'UI (`rememberManualFood`). La saisie garde son identité : `id`, `loggedAt`, `localTime`.
- Rien d'autre n'est déclenché : plan, `dailyLogs`, `meta` et empreinte de calibration inchangés [mesuré, test]. Aucune cible passée ne bouge.
- Comportement hérité de l'ajout, à connaître : une saisie du jour remise à une heure postérieure à l'heure actuelle passe à la veille (règle J-06). Le toast le dit.
- Fichiers : `journal.ts`, `Journal.tsx`, `copy.ts`, `navigation.tsx` (feuille `foodEdit`).

### C. Calories par tranche horaire : fait

- Total kcal au bout de chaque en-tête de tranche (« 8 h ········ 381 kcal »).
- Sélecteur `hourGroupKcal` : kcal entiers, même arrondi que le total du jour, et somme des tranches toujours égale au total affiché. L'arrondi indépendant de chaque tranche ne le garantissait pas (100,4 + 100,4 → 100 + 100 ≠ 201) : la méthode des plus forts restes répartit les kcal d'arrondi. Avec des aliments masqués, seules les saisies visibles comptent, comme le total.
- Fichiers : `journal.ts`, `Journal.tsx`, `app.css`.

### D. Curseurs plus précis : fait

- Boutons − et + de part et d'autre de chaque curseur, cible tactile 44 × 44 px [mesuré], un pas exactement [mesuré : 7 500 → 7 600], maintien pour répéter (0,42 s puis un pas toutes les 70 ms ; 1 s de maintien = 9 pas [mesuré]), désactivés en butée.
- Même gestionnaire que le glissement : `rangeMath.ts` (`snapToGrid`, `stepValue`, `valueAtPosition`) sert au glissement, aux flèches du clavier et aux boutons ; le curseur de vitesse applique toujours `snapRate` derrière.
- Glissement : prise relative (toucher le curseur à moins de 22 px de son centre ne le fait plus sauter ; toucher ailleurs sur la piste l'y amène, comme avant), curseur 28 px au lieu de 26. Correspondance position → valeur toujours linéaire.
- Bornes, pas, zones bloquées et résolution inchangés (test statique des props et des bornes du domaine).
- Poids cible harmonisé (ton choix) : `targetWeightSliderBounds` (domaine) pour les deux écrans, règle de l'onboarding : minimum = IMC 20 (`minimumTargetWeightKg`) arrondi au demi-kilo supérieur, crans ronds de 0,5 kg. L'onboarding est inchangé au bit près sur une grille de 21 tailles × 329 poids, sauf un cas limite de la base : juste au-dessus du poids d'IMC 20, l'arrondi pouvait donner un curseur inversé (min 47 > max 46,5) ; le max est alors ramené au min. Dans « Ton objectif », la valeur affichée est celle appliquée : une cible stockée au dixième (55,3 kg, migration 5a) s'affiche et s'applique à 55,5 kg si on recalcule.
- En livres (pas de 0,4536 kg sur une plage en kg), la borne haute n'est atteinte que par + ou les flèches, pas par le glissement : comportement de la base, non modifié ; + et − ne sautent plus de cran depuis cette borne.
- Fichiers : `src/components/rangeMath.ts` (nouveau), `controls.tsx`, `app.css`, `src/domain/views.ts`, `Onboarding.tsx`, `Account.tsx`.

### E. Navigation native : fait

- Modèle pur `src/app/navModel.ts` : une pile de sous-écrans par onglet, un flux hors onglets (splash, intro, onboarding, résultat), la feuille ouverte, le brouillon d'onboarding. `navBack` : feuille, puis sous-écran, puis étape précédente de l'onboarding, puis Aujourd'hui ; `null` à la racine d'Aujourd'hui (on quitte l'app).
- Historique `src/app/navHistory.ts` : une entrée « base » et au plus une entrée « top », présente exactement quand le retour peut agir dans l'app. Le retour système atterrit sur la base, l'app applique `navBack` et remet « top » si besoin. Toujours sur l'historique du navigateur, sans bibliothèque.
- Points 1 à 6 : changer d'onglet ne crée aucune entrée [mesuré : une seule entrée ajoutée pour un sous-écran ouvert puis quatre changements d'onglet] ; chaque onglet garde son sous-écran [mesuré : Journal retrouvé] et son défilement [mesuré : Suivi 274 px → Plan → Suivi 274 px] ; sous-écrans et feuilles (y compris les trois feuilles locales, désormais dans la navigation) fermés par le retour [mesuré] ; racine d'un autre onglet → Aujourd'hui [mesuré] ; racine d'Aujourd'hui → sortie ; onboarding : étape précédente puis intro [mesuré : âge → prénom → intro] ; après « Commencer », le flux est vidé, le retour n'y ramène jamais.
- En plus : toucher l'onglet actif revient à sa racine, puis en haut de page.
- Transitions : glissement horizontal court (36 px, 0,24 s) à l'ouverture d'un sous-écran, depuis la gauche à sa fermeture ; fondu de 0,14 s entre onglets ; tout est coupé par `prefers-reduced-motion` (règle globale existante).
- Finitions : `overscroll-behavior: none` ajouté sur `html` (il n'était que sur `body`), pas de sélection ni de menu contextuel sur les contrôles (curseurs, groupes radio, barre d'onglets, `-webkit-touch-callout`), états actifs visibles (opacité ou léger enfoncement) sur liens, lignes, cartes, puces, onglets. Le surlignage bleu était déjà supprimé.
- Fichiers : `navModel.ts`, `navHistory.ts` (nouveaux), `navigation.tsx`, `App.tsx`, `BottomNav.tsx`, `Onboarding.tsx`, `Tracking.tsx`, `Account.tsx`, `app.css`.

### F. Page Historique : squelette fait

- Entrée « Historique · 90 jours › » dans Suivi, sous le sélecteur de période. Sous-écran de Suivi : le retour revient à Suivi, et l'onglet Suivi le garde ouvert.
- Fenêtre fixe des 90 derniers jours. Quatre sections (Pesées, Calories saisies, Macros saisies, Pas effectués) avec le nombre de jours sur 90 où la donnée existe, via `historyView` (domaine, lecture seule). Les quatre données sont stockées : aucune section « non enregistrée ».
- `historyView` fournit déjà, jour par jour : kcal saisies, macros (et complétude), pesées brutes, tendance, pas effectués, adhérence, et les cibles du plan en cours. Rien n'est ajouté au stockage.
- `history.ts` lit le journal : il est déclaré dans la liste explicite des modules lecteurs du journal (`foodJournal.test.ts`), comme affichage.
- Fichiers : `src/domain/history.ts`, `src/screens/History.tsx` (nouveaux), `App.tsx`, `navModel.ts`, `Tracking.tsx`, `copy.ts`.

### G. Messages de la 5a : fait, sauf le masquage de l'avertissement

1. Une zone par écran (Aujourd'hui, Suivi), triée : sous-poids, garde-fou, avertissement avant IMC 20, migration du poids cible, recalcul périodique ; ordre de la trace à l'intérieur d'un type. Deux visibles, les autres derrière « Voir les autres messages (n) ». « OK » inchangé. Sélecteur pur `planNotices`.
2. Avertissement avant IMC 20 : **non fermable**. `meta` est reconstruit clé par clé au chargement (`sanitizeMeta`, `schema.ts:256`) et perdrait une date de masquage ; toute autre place aurait demandé un bump de schéma ou un stockage hors du store. Ton choix : compact, une ligne (« IMC sous 20 possible d'ici 3 semaines › »), phrase complète dépliable.
3. Recalcul périodique : « Ton plan a été recalculé pour tenir ta vitesse : 1 900 → 1 850 kcal par jour. » En maintien, il n'y a pas de vitesse à tenir : « … pour garder ton poids stable : … » (mon choix, à valider). Les entrées déjà tracées avec l'ancien texte s'affichent avec le nouveau (texte recalculé depuis `before` et `after` de l'entrée).
4. Sous le curseur de vitesse limité par le plancher : « Limitée par ton minimum de 1 250 kcal par jour. Maximum : 0,9 % par semaine. », puis le lien « Et avec plus de pas ? » qui déplie la proposition de pas de la 5a. Pas de bouton « Passer à {pas} pas » (ton choix) : `applySliderSteps` modifie le plan en cours, or ce curseur n'apparaît qu'en onboarding (pas de plan) et dans « Ton objectif » (plan pas encore recalculé).
5. Aperçu de recalibration refusé : titre « Recalibration impossible pour l'instant ».
6. « Pourquoi ce résultat ? » en mots simples (textes en 7.3). Seuil de 20 kcal/j pour la phrase de maintien : `MAINTENANCE_GAP_NOTE_MIN_KCAL`, seuil d'affichage, dans `explain.ts` (sélecteur `explanationNotes`, hors view-model).
7. Graphique de Suivi : légende « zone probable » sous l'axe. Raccord tendance et projection vérifié à l'écran : la projection part du point de tendance du jour, sans saut ; la bande s'ouvre dès aujourd'hui (incertitude de l'état du jour, rapport 43) [mesuré, capture d'écran].

Déclenchements et trace inchangés : les 23 tests de `pass5a.test.ts` passent ; un seul a changé, celui qui comparait le texte du message périodique (même déclenchement, mêmes valeurs, nouveau texte).

## 4. Preuves

### 4.1 Captures au bit près

Commandes (depuis la racine du dépôt) :

```
CAPTURE_OUT=<dossier> npx vitest run -c vitest.journal.config.ts tests/experiments-journal/capture/
node tests/experiments-journal/capture/compare.mjs <dossier de base> <dossier après>
```

Base capturée deux fois : 0 différence entre les deux exécutions (déterminisme) [mesuré].

| Après | T-03 | T-04 | golden | R et S | journey | Total |
|---|---|---|---|---|---|---|
| valeurs comparées | 1 003 779 | 1 497 006 | 3 041 | 9 838 | 8 716 | 2 522 380 |
| A | 0 | 0 | 0 | 0 | 0 | 0 différence |
| B | 0 | 0 | 0 | 0 | 0 | 0 |
| C | 0 | 0 | 0 | 0 | 0 | 0 |
| D | 0 | 0 | 0 | 0 | 0 | 0 |
| E | 0 | 0 | 0 | 0 | 0 | 0 |
| G | 0 | 0 | 0 | 0 | 0 | 0 |
| F (final) | 0 | 0 | 0 | 0 | 0 | 0 |

Les différences non numériques (textes, clés, champs de décision) sont comptées aussi : 0 partout [mesuré]. Les captures ne contiennent aucun des textes modifiés par G (la vue R et S porte le view-model, les phrases sont dans les composants ; `journey` ne contient aucun message de recalcul) : aucune différence de texte n'y apparaît. Les changements de texte de G sont listés en 7.3.

### 4.2 Suite de tests

`npm run check` (typecheck, lint, tests) : base **542 sur 542** (44 fichiers) ; final **584 sur 584** (46 fichiers) [mesuré]. Nouveaux tests : 42.

| Demande | Tests (fichier) |
|---|---|
| A | données anciennes chargées octet pour octet ; saisie sans macros valide et persistée ; total partiel jamais présenté comme complet ; observations du journal identiques avec ou sans macros (`tests/domain/uxPass1.test.ts`) |
| B | équivalence avec suppression puis ajout, hors id et horodatages ; plan, logs, meta et empreinte de calibration intacts ; refus identiques |
| C | somme des tranches = total affiché, avec saisies sans macros, tranches masquées et 300 jours aléatoires |
| D | pour 10 curseurs, − et + atteignent chaque valeur autorisée dans les deux sens, et chaque cran de grille est aussi une position de glissement ; bornes et pas de la base ; même fonction de poids cible aux deux endroits, égale à la règle d'onboarding de la base |
| E | points 1 à 6 sur le modèle et sur un faux historique de navigateur (entrées, retour, avancer, sortie de l'app) (`tests/app/navigation.test.ts`) |
| F | fenêtre de 90 jours exacte, décomptes, lecture seule, Historique sous-écran de Suivi |
| G | ordre de priorité, deux visibles, avertissement non fermable, nouveau texte aussi pour une ancienne entrée, message absent sous 10 kcal/j inchangé, notes de l'explication |

### 4.3 Build

`npm run build` : OK [mesuré]. Avertissement de Vite sur un chunk de plus de 500 ko (548 ko, 168 ko gzip), sans effet sur le fonctionnement.

## 5. Curseurs : pixels par valeur à 360 px

Piste avant : 312 px (écrans, feuilles) [mesuré], 308 px (onboarding) [déduit]. Après : 216 px [mesuré] et 212 px [déduit] : les boutons − et + prennent 96 px.

| Curseur | Intervalles | Avant (px/valeur) | Après (px/valeur) | Chaque valeur atteignable |
|---|---|---|---|---|
| Vitesse perte (onboarding / objectif) | 16 | 19,3 / 19,5 | 13,3 / 13,5 | oui, − et + |
| Vitesse prise | 8 | 38,5 / 39,0 | 26,5 / 27,0 | oui |
| Poids cible perte (78 kg, 168 cm) | 42 | 7,3 / 7,4 | 5,0 / 5,1 | oui |
| Poids cible prise (78 kg) | 54 | 5,7 / 5,8 | 3,9 / 4,0 | oui |
| Masse grasse | 47 | 6,6 | 4,5 | oui |
| Pas moyens (onboarding) | 250 | 1,23 | 0,85 | oui |
| Manger ↔ Marcher (7 500 pas de base) | 155 | 2,0 | 1,4 | oui |
| Pas du jour | 300 | 1,04 | 0,72 | oui (et champ texte) |

Le glissement perd environ 30 % de résolution, mais aucune valeur n'en dépend plus : − et + donnent chaque valeur, et la prise relative supprime le saut au toucher [déduit]. Sous 3 px par valeur (pas, équilibre), le doigt ne peut pas viser une valeur précise ; c'est vrai avant comme après.

**Proposition (non appliquée, à ton accord)** : un glissement « fin » à la façon d'iOS. Quand le doigt s'éloigne verticalement de la piste (plus de 40 px), la valeur avance 4 fois moins vite que le doigt. Ce n'est plus une correspondance linéaire position → valeur. Alternative sans non-linéarité : afficher un champ de saisie au toucher long sur la valeur.

## 6. Navigation en mode app installée

- Le manifeste déclare `display: 'standalone'` (`vite.config.ts:36`) [lu].
- **Android, app installée** : le bouton ou le geste retour du système envoie `popstate` à la page. Avec la sentinelle, il ferme feuille, sous-écran, étape, ramène à Aujourd'hui, puis quitte l'app à la racine d'Aujourd'hui [déduit du comportement standard de Chrome ; vérifié dans le navigateur de bureau, pas sur un téléphone].
- **iOS, app installée** : pas de bouton retour système ni de geste de balayage pour revenir en mode standalone ; seuls les boutons « ‹ » de l'app servent de retour [déduit].
- Non vérifié ici : le comportement réel sur téléphone, l'app installée (Android et iOS), la sortie de l'app à la racine d'Aujourd'hui.
- **Coût d'un geste de balayage pour revenir** (hors périmètre) : un détecteur de bord gauche (départ dans les 16 premiers px, mouvement horizontal au-delà d'un seuil) qui appelle `navBack` coûterait environ 100 lignes et des tests. Conflits : les curseurs capturent le pointeur, mais leur bouton − commence à 24 px du bord, donc peu de conflit si la zone de bord fait moins de 16 px ; les feuilles (glisser vers le bas) et les rangées de puces qui défilent horizontalement devraient être exclues. Un balayage qui suit le doigt en montrant l'écran du dessous demanderait de rendre deux écrans à la fois : refonte de l'affichage, coût nettement plus élevé [déduit].

## 7. Formulations

### 7.1 A (proposées et appliquées)

- Case : « Je ne connais pas les macros ». Sous la case : « Seules les calories seront enregistrées. Les totaux de macros du jour l'indiqueront. »
- Sous le total du jour : « dont 320 kcal sans détail des macros ».
- Sous les jauges, si les trois macros manquent pour au moins un aliment : « Certains aliments n'ont pas le détail des macros : ces totaux sont des minimums. » (sinon la phrase de la base, qui nomme la ou les macros manquantes).

### 7.2 F (proposées et appliquées)

- Entrée dans Suivi : « Historique », détail « 90 jours ». Titre : « Historique », sous-titre « Tes 90 derniers jours ».
- Sections : « Pesées », « Calories saisies », « Macros saisies », « Pas effectués ». Décompte : « 62 jours sur 90 », « 1 jour sur 90 », « Aucun jour ».

### 7.3 G (appliquées) : différences de texte

| Où | Avant | Après |
|---|---|---|
| Recalcul périodique (trace et affichage) | « Ton plan a été recalculé à partir de ton poids actuel : X → Y kcal par jour. » | « Ton plan a été recalculé pour tenir ta vitesse : X → Y kcal par jour. » ; en maintien « … pour garder ton poids stable : … » |
| Zone de messages | aucun | « Voir les autres messages (n) », « Masquer les autres messages » |
| Avertissement avant IMC 20 | phrase entière, toujours affichée | ligne « IMC sous 20 possible d'ici N semaine(s) › », la phrase de la base se déplie |
| Sous le curseur de vitesse (plancher) | « Ta vitesse est limitée par ton minimum de X kcal par jour. Maximum : Y par semaine. Pour tenir Y par semaine, il faudrait environ Z pas par jour. » | « Limitée par ton minimum de X kcal par jour. Maximum : Y par semaine. » + lien « Et avec plus de pas ? » qui déplie la phrase de pas |
| Titre de recalibration refusée | « Wheighty te connaît mieux. » | « Recalibration impossible pour l'instant » |
| Pourquoi ce résultat ? (prescription, perte ou prise) | « C'est l'apport constant qui tient ta vitesse sur 28 jours dans le modèle dynamique : il amène ta masse de tissus (graisse et masse maigre, hors eau et glycogène) à X kg au jour 28. » | « Ton plan vise les 4 prochaines semaines, puis il est recalculé. C'est l'apport constant qui tient ta vitesse pendant ces 4 semaines : il amène ta masse de graisse et de muscle, sans l'eau, à X kg. » |
| idem, maintien | « … à X kg au jour 28, c'est-à-dire à son niveau actuel. » | « Ton plan vise les 4 prochaines semaines, puis il est recalculé. C'est l'apport constant qui garde ta masse de graisse et de muscle, sans l'eau, à son niveau actuel (X kg) pendant ces 4 semaines. » |
| idem, perte (ajout) | aucun | « Les premiers jours, la balance descend plus vite : c'est surtout de l'eau. » |
| idem, maintien si écart ≥ 20 kcal/j (ajout) | aucun | « Ton corps n'est pas encore tout à fait stable : ta cible de maintien en tient compte pendant les prochaines semaines. » |
| Détails scientifiques | « Cible à 28 j / masse de tissus du modèle » | « Cible dans 4 semaines, graisse et muscle sans l'eau / modèle » |
| Graphique de Suivi | aucun | légende « zone probable » |

Proposition : la masse de graisse et de muscle sans l'eau (55,5 kg pour un poids de 75,8 kg dans le store de démonstration) peut dérouter à côté du poids. On pourrait ne garder ce chiffre que dans les détails scientifiques.

## 8. Défauts vus hors périmètre, non corrigés

1. L'écran Macros affiche « ‹ Plan » même ouvert depuis Aujourd'hui ; le retour ramène à Aujourd'hui (même comportement que la base).
2. Après un retour système dans l'onboarding, les messages d'erreur de l'étape quittée ne sont pas effacés (les champs diffèrent d'une étape à l'autre, l'effet est peu visible).
3. Une feuille fermée par le retour disparaît sans son glissement de sortie (le glissement n'existe que pour la fermeture par le geste, le fond ou Échap).
4. Curseur de poids cible en livres : la borne haute n'est pas atteignable par glissement (voir D).
5. Build : chunk principal de 548 ko (avertissement de Vite).
6. Décision d'architecture « graphiques SVG faits main » : John préfère le canvas, déjà utilisé par le graphique de Suivi ; la phase 2 suit ce choix.

## 9. Tester sur ton téléphone

Depuis la racine du dépôt, sur la branche `ux/pass-1` :

```
npm run build
npx vite preview --host --port 4173
```

Puis, téléphone sur le même Wi-Fi, ouvre `http://<adresse IP du PC>:4173` (l'adresse IPv4 donnée par `ipconfig`). Windows peut demander d'autoriser Node dans le pare-feu.

Limites : en HTTP sur une adresse du réseau local, la page n'est pas un contexte sécurisé. Pas de service worker, donc pas de mode hors ligne, et l'installation en app n'est pas proposée (Chrome Android l'exige ; iOS peut ajouter un raccourci à l'écran d'accueil, sans garantie d'un vrai mode app) [déduit]. Pour E, cela veut dire :
- testable : le retour dans un onglet de navigateur (bouton retour d'Android dans Chrome), onglets, sous-écrans, feuilles, onboarding, défilement, transitions, finitions tactiles ;
- non testable ainsi : la sortie de l'app à la racine d'Aujourd'hui en mode installé (dans un onglet, le retour quitte la page).

Pour tester le mode installé sur Android sans rien publier : câble USB, débogage USB activé, puis dans Chrome sur le PC `chrome://inspect`, « Port forwarding » `4173 → localhost:4173`. Sur le téléphone, `http://localhost:4173` est alors un contexte sécurisé : l'installation et le service worker fonctionnent. Sur iOS, le vrai mode app ne sera testable qu'une fois servi en HTTPS (Pages, après fusion).

## 10. Phase 2 : Historique

### 29/09/2026, graphiques de l'Historique

Décisions de John avant F [lu, conversation] : quatre blocs empilés sur une seule page ; graphiques en **canvas JS** comme celui de Suivi, pas en SVG (cela remplace la décision d'architecture « graphiques SVG faits main » pour cette page) ; fenêtre fixe de 90 jours ; comme repère, une ligne horizontale pointillée à l'objectif du plan en cours (« objectif du moment »), autour de laquelle on voit évoluer les données réelles ; pour les pesées, « le centre de l'intervalle de confiance, ou rien » : rien, car il n'existe pas d'intervalle sur les jours passés (la bande n'existe que pour la projection) ; lecture seule, pas de détail au toucher.

Fait :
- **Pesées** : chaque pesée (points gris) et la tendance lissée (ligne dégradée), échelle ajustée aux données. Ligne de résumé : « Tendance sur la période : −2,2 kg ».
- **Calories saisies** : une barre par jour saisi, aucune barre les jours sans saisie (jamais un zéro), ligne pointillée à la cible de calories du plan en cours. Résumé : moyenne des jours renseignés, puis « Objectif du moment : 1 850 kcal ».
- **Macros saisies** : trois petits graphiques (protéines, glucides, lipides) aux couleurs du journal, chacun avec la cible du plan en cours. Barres claires les jours où des aliments n'ont pas le détail des macros (le total est un minimum), moyenne notée « ≥ » dans ce cas.
- **Pas effectués** : les pas saisis (jamais la cible de pas), ligne pointillée à la cible de pas du plan en cours.
- Une section sans donnée affiche « Rien d'enregistré sur ces 90 jours. » au lieu du graphique.
- Géométrie pure et testée (`src/domain/historyChart.ts`), résumés purs (`historySummary`, `src/domain/history.ts`), peinture seule dans `src/components/HistoryChart.tsx`. Le journal reste lu par `history.ts` seul (test de politique).

Vérifications [mesuré] : captures T-03, T-04, golden, R et S, `convergenceJourney` : 0 différence sur 2 522 380 valeurs ; `npm run check` : **587 sur 587** (46 fichiers) ; rendu contrôlé à 360 px dans le navigateur avec le store de démonstration (60 jours de pesées et de pas, 30 jours de journal).

Choix faits sans consigne, à valider : barres pleines à 85 % d'opacité, dans une seule couleur par donnée, sans couleur d'alerte au-dessus de la cible (même neutralité que les jauges du journal) ; libellés d'axe « date du premier jour » et « Auj. ».

### 29/09/2026, navigation reprise avec John (iPhone, app installée)

Retour de John après essai sur iPhone, app installée : « tu as tout cassé ». Ce qu'il a vu venait de l'historique du navigateur. En app installée, iOS fait revenir en arrière par un balayage depuis le bord gauche **dès qu'il existe une entrée d'historique**, et ce geste fait glisser toute la page, barre du bas comprise. Ma navigation E créait ces entrées. La section 6 disait l'inverse (« pas de geste de balayage en mode standalone » [déduit]) : c'était faux.

Comportement demandé par John, qui remplace les points 1, 4 et 5 de E :
- **Sections côte à côte, en carrousel** : sur la racine d'une section, glisser le doigt vers la gauche ou la droite passe à la section voisine, la page suit le doigt. Rien à gauche d'Aujourd'hui, rien à droite de Profil. Aucun « retour » entre sections : sur une racine, le retour ne fait rien.
- **Page B ouverte depuis une page A** (Détail depuis Aujourd'hui, Analyse depuis la ligne d'état d'Aujourd'hui, Plan après un changement d'objectif depuis Profil…) : B est empilée au-dessus de A, même si B est une section. Glisser vers la droite, ou le bouton retour, rétablit A, jamais la section à gauche de B. Glisser vers la gauche ne fait rien.
- **Pendant le geste, seule la vue bouge** : A est dessinée dessous avec un léger décalage, comme sur iOS, et la barre du bas reste fixe. Le bouton « Ajouter un aliment » du journal suit sa page.
- **Panneau ouvert** : glisser vers la droite le ferme (il suit le doigt et sort par la droite).
- Un geste qui part d'un bouton ne déclenche pas ce bouton. Les curseurs, les champs et tout ce qui défile horizontalement gardent leur glissement.
- Un geste relâché aboutit au-delà d'un tiers de la largeur ou sur un geste vif ; sinon la page revient en place.
- Toucher une section dans la barre la fait glisser depuis son côté et ferme les pages empilées.
- Les boutons retour nomment la page qu'ils rétablissent (« ‹ Aujourd'hui » sur Macros ouvert depuis Aujourd'hui, « ‹ Plan » depuis Plan).

Réalisation :
- **Modèle** : `navModel.ts` réécrit. Une section de base et une pile de pages au-dessus ; `swipeActions` dit ce qu'un glissement peut faire, `navSwipe` l'applique, `swipeCompletes` décide au relâchement. Tout est pur et testé.
- **Geste** : `src/components/SwipeView.tsx`, en événements pointer tactiles (`touch-action: pan-y` sur la vue, le défilement vertical reste au navigateur). La page découverte est une copie dessinée à sa position de défilement ; sans portail ni effet de bord (`useViewActive`).
- **Panneaux** : `BottomSheet.tsx` gère le glissement vers la droite.
- **Historique du navigateur** : jamais d'entrée sur iPhone et iPad, pour que le geste système n'ait rien à faire. Sur Android, une entrée tant qu'une page ou un panneau peut être fermé, pour le bouton retour. Sur une racine de section, le bouton retour d'Android quitte l'app.
- **Abandonné** : chaque section gardait son sous-écran ouvert en changeant d'onglet. Changer de section ferme maintenant les pages empilées ; seules les positions de défilement des racines sont gardées.

Vérifications [mesuré] :
- captures : 0 différence sur 2 522 380 valeurs ;
- `npm run check` : **590 sur 590** (46 fichiers). `tests/app/navigation.test.ts` a été réécrit (16 tests). Le test de `explainAndScreens.test.ts` qui lisait `App.tsx` a été adapté à `renderScreen`, même intention ;
- dans le navigateur, en 375 px avec des gestes tactiles simulés : glissement vers la droite sur Aujourd'hui sans effet ; carrousel Aujourd'hui → Plan → Suivi → Plan ; Détail rétabli sur Aujourd'hui, avec Aujourd'hui visible dessous pendant le geste et la barre du bas immobile (capture d'écran) ; Analyse ouverte depuis Aujourd'hui rétablie sur Aujourd'hui ; panneau des pas fermé par glissement ; glissement parti du bouton « Détail » sans ouvrir Détail.

Non vérifié : un vrai iPhone. Les gestes ont été simulés par des événements pointer, pas par un doigt sur Safari iOS.
