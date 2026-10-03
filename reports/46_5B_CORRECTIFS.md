# 46. Correctifs de la 5b et cible personnelle

Date : 03/10/2026. Branche `prod/5b-parcours-journal`, à la suite du rapport 45, non fusionnée. Marquage : [lu] lu dans un fichier ou une sortie, [mesuré] obtenu en lançant une commande, [déduit] conclusion tirée des deux.

## 1. Pour John, en 10 lignes

1. Ce que tu as vu (point 1) venait de la cible alignée : sans nouvelle estimation, changer la vitesse recalculait le plan depuis l'estimation d'avant la bascule, donc à peu près l'ancienne cible [mesuré].
2. Sur la cible alignée, la vitesse et le curseur pas / calories sont maintenant verrouillés jusqu'à la première recalibration, avec une ligne qui dit dans combien de jours ; changer d'objectif reste possible [mesuré].
3. En habitude mesurée, le plan appliqué était déjà le bon ; l'aperçu (limites du curseur de vitesse, écran Résultat) montre maintenant le même plan [mesuré].
4. Le curseur pas / calories revient en habitude mesurée : c'est le curseur existant, sur le contexte du plan de l'habitude [mesuré].
5. Le bouton « Aligner ma cible » n'avait pas de bug : tes profils dataient du 29/09. Ils se régénèrent maintenant pour le jour même avec `npm run verification:profils` [mesuré].
6. L'adhérence d'un jour passé saisi en entier est déduite du journal, sans question ; une déclaration existante n'est jamais remplacée, un choix manuel l'emporte toujours [mesuré].
7. Les messages de mise à jour du plan sont courts (titre, une ligne avec les chiffres) ; le texte long est derrière « Détails » [mesuré].
8. Cible personnelle : « J'ai déjà ma cible » à l'onboarding et « Choisir ma cible » dans Plan, avec la vitesse prévue, les refus (plancher, trop rapide, objectif contredit) et « Garder ma cible » sur une recalibration [mesuré].
9. Équivalence de la 5b : 0 différence sur 17 275 appels ; captures sans journal : seules les versions et la source des déclarations changent [mesuré].
10. À faire : ta vérification (section 8, 10 minutes), puis ton accord pour la fusion.

## 2. Diagnostic des points 1 et 3

### 2.1 Point 1 : changer de vitesse remet l'ancien plan

Reproduit sur les profils de vérification datés du 29/09, avec les fonctions de l'app (`changeGoalOnPath`, celle de « Recalculer mon plan ») [mesuré] :

| Cas | Plan avant le changement | Vitesse 0,3 % | Vitesse 0,75 % |
|---|---|---|---|
| a. cible alignée elle-même (`1-proposition.json`, « Viser 2 150 kcal ») | 2 150 kcal (avant la bascule : 1 808) | 2 014 kcal | 1 551 kcal |
| b. habitude mesurée (`3-premier-plan.json`, « Utiliser ce plan », h = 1,10) | 1 756 kcal | 1 943 kcal (méthode habituelle : 2 013) | 1 524 kcal (méthode habituelle : 1 551) |

- **Cas a, celui que tu as vu** [déduit] : la nouvelle cible est calculée par la méthode habituelle sur la dernière estimation appliquée, celle d'avant la bascule ; à vitesse égale, elle redonne 1 808 kcal. C'est l'hypothèse du prompt [mesuré].
- **Cas b** : le plan appliqué est bien celui de l'habitude pour la nouvelle vitesse (1 943 kcal, pas 2 013) ; il tient le lendemain [mesuré]. L'aperçu, lui, ne l'était pas [lu, mesuré] :
  - le curseur de vitesse de « Ton objectif » prenait ses limites dans la méthode habituelle (plancher 1 200 kcal, maximum 1 %), au lieu de celles de l'habitude (plancher 1 320 kcal en cible affichée) ;
  - l'écran Résultat de « Modifier mes informations » montrait l'estimation de population (point 4 de la section 5 du rapport 45).
- Trouvé en lisant le code [lu] : le calcul hebdomadaire du worker pouvait écrire une offre calculée pour l'ancien plan, si la vitesse changeait pendant le calcul (environ 0,6 s). Corrigé aussi (section 3.1).

### 2.2 Point 3 : le bouton ne s'active pas

- Le profil `2-bouton.json` du 29/09 : 9 jours saisis parmi les 14 d'avant le 29/09, hier non saisi [lu].
- Ouvert un autre jour, la fenêtre glisse [mesuré] :

| Jour d'ouverture | Indication du bouton | Après une saisie de 1 850 kcal sur hier |
|---|---|---|
| 29/09 | « encore 1 » | actif |
| 30/09 | « encore 2 » | inactif |
| 01/10 | « encore 2 » | inactif |
| 03/10 | « encore 4 » | inactif |

- Profils régénérés pour le 03/10 : « encore 1 », puis actif après la saisie d'hier. **Cause confirmée, rien à corriger dans l'app** [mesuré].
- La commande `npm run verification:profils` construit les profils pour la date du jour, par défaut [mesuré].

## 3. Ce qui a été fait

Commits, un par point, dans l'ordre [mesuré] : `9e6b652` (1), `1fadcd8` (2), `4b8b73d` (3), `289e9ff` (5), `c657bc4` (7), `399a9b5` (8), `35563e9` (4), `4db5c8f` (6), puis ce rapport. Le point 8 passe avant 4 et 6, qui utilisent le schéma 9.

### 3.1 Point 1

- `alignedTargetLocked`, `alignedRecalibrationDays`, `alignedLockLine` (`src/domain/journalPath.ts`) [lu].
- Sur la cible alignée elle-même, avec le même objectif :
  - « Ton objectif » n'affiche plus le curseur de vitesse, mais la ligne de l'annexe ;
  - l'étape vitesse de « Modifier mes informations » aussi ;
  - « Recalculer mon plan » et la modification du profil gardent la vitesse du profil et remettent la cible alignée en vigueur (`keepAlignedTarget`) ;
  - le poids cible, lui, change.
- Un autre objectif termine la cible alignée, comme avant [mesuré].
- Habitude mesurée :
  - le curseur de vitesse prend le contexte des plans de l'habitude (`pathSpeedSliderModel` : maintien du journal, plancher × 1,10 × h, corps modélisé du journal) ; le plancher est affiché en cible affichée (÷ h) ;
  - l'écran Résultat de « Modifier mes informations » montre, hors cible supposée tenue, le plan qui sera appliqué [lu, mesuré].
- Worker du journal : la clé de la demande contient le plan et l'objectif ; une réponse calculée pour l'ancien plan est ignorée, et une nouvelle demande part [lu].

### 3.2 Point 2 : curseur en habitude mesurée, réactivé

- Réutilisation directe : `createSliderSession` et `applySliderSteps` acceptent un contexte, celui du plan de l'habitude en vigueur, au jour de sa construction (`measuredSliderContext`) [lu].
  - Le curseur échange l'apport à viser I\* contre des pas.
  - La cible affichée est I\* ÷ h, avec les macros de cette cible.
  - Le plancher du contexte (× 1,10 × h) garantit I\* ≥ 1,10 × h × plancher.
  - Aux pas de base, on retrouve exactement le plan [mesuré].
- Les pas choisis sont gardés par les plans suivants de l'habitude (offre, recalcul périodique), avec le mécanisme du prototype déjà utilisé par ses garde-fous ; aux pas de base rien ne change, l'équivalence le confirme [mesuré].
- Cible alignée elle-même : curseur masqué, ligne du point 1a. Sans entrée journal en habitude : « En mode journal, ta cible suit ton journal et tes pesées. » [lu].

### 3.3 Point 3

- `tests/helpers/verificationProfiles.ts` : les constructeurs des profils, partagés par le générateur et les tests unitaires [lu].
- `tests/experiments-journal/prod5b/manualProfiles.experiment.ts` : date du jour par défaut, `MANUAL_TODAY` pour une autre date ; commande `npm run verification:profils` [lu].
- Deux profils ajoutés : `6-adherence-deduite.json`, `7-cible-personnelle.json` [mesuré].

### 3.4 Point 4 : adhérence déduite du journal

- `deduceAdherenceFromJournal`, premier contrôle du changement de jour (`runDailyChecks`) [lu] :
  - hors habitude mesurée ;
  - pour chaque jour passé saisi et exploitable (règle des repas oubliés), sans déclaration ;
  - la catégorie de |saisi − cible| ÷ cible (cible du jour) : sous 10 % « plan respecté », de 10 à 25 % « écart léger », au-delà « écart important » ;
  - enregistrée avec la source `journal`.
- Une déclaration existante (manuelle, importée ou déjà déduite) n'est jamais touchée ; une déclaration manuelle est enregistrée avec la source `user` [mesuré].
- Aujourd'hui : la tuile affiche « {catégorie}, d'après ton journal » et « Toucher pour changer » ; la feuille montre la même ligne, aussi pour un jour passé déduit [mesuré, navigateur].
- La déclaration préremplie à confirmer (décision 12) disparaît [lu].

### 3.5 Point 5 : messages courts

Textes de l'annexe pour [lu] :
- les garde-fous IMC 20 et plafond de vitesse ;
- l'avertissement avant IMC 20 ;
- le recalcul périodique ;
- la migration du poids cible ;
- la recalibration refusée et ses raisons courtes ;
- l'alerte de sous-poids ;
- la proposition et la cible relevée au plancher ;
- l'invitation au journal et l'encouragement à la pesée ;
- les plans de l'habitude ;
- les deux retours en cible alignée.

Mise en œuvre [lu] :
- `SHORT_MESSAGE` et `planEventShort` (`src/domain/planMessages.ts`, `planSafety.ts`) ; composant `ShortNotice` : titre, ligne, « Détails » (texte long), « OK ».
- Les entrées de la trace sont formulées d'après leur règle et leurs plans : une entrée écrite avant les correctifs s'affiche pareil [mesuré].
- Autres messages mis au même style (sans annexe) : section 6.

### 3.6 Point 6 : cible personnelle

- `calorieTargetForRate` (`src/science/goals.ts`) expose la résolution existante de `evaluateWeeklyRate`, sans ses contrôles de plancher et de macros. Aucune constante ni formule nouvelle [lu].
- `src/domain/personalTarget.ts` [lu] :
  - table des crans du curseur de vitesse (0, puis la grille du minimum au maximum général) avec la cible de chaque cran, aux pas de base ;
  - lecture à l'envers avec interpolation linéaire entre deux crans ;
  - refus, dans cet ordre : sous le plancher (minimum affiché), contre l'objectif, au-delà de la vitesse autorisée pour l'objectif et l'IMC (limite proposée, arrondie pour être acceptée).
- Plan en vigueur [mesuré] :
  - source `personal_target`, cible choisie, macros de cette cible, projection à cette cible ;
  - vitesse demandée et appliquée = vitesse prévue, aussi dans le profil ;
  - méthode inchangée (supposée tenue).
- Pas de recalcul périodique (`periodicReplan`), pas de curseur pas / calories tant que la cible choisie est en vigueur ; garde-fous G1, G2 et alerte de sous-poids comme pour tous [mesuré].
- Recalibration [mesuré] :
  - proposée comme d'habitude ;
  - « Garder ma cible » remplace « Plus tard » et revient à Aujourd'hui ;
  - la recalibration a été marquée vue à l'affichage, le plan ne change pas.
- Écrans [mesuré, navigateur] :
  - Résultat de l'onboarding : « J'ai déjà ma cible », la cible et ses macros, la vitesse prévue, « Revenir à la cible proposée » ;
  - Plan : « Ta cible personnelle : … Vitesse prévue : … » et « Choisir ma cible » (cible supposée tenue seulement) ;
  - feuille commune avec le champ de l'annexe.

### 3.7 Point 7 : petits points du rapport 45

- Point 2 : sur la cible alignée elle-même, « Échéance : Après la première recalibration » [mesuré, navigateur].
- Point 3 : pas d'encouragement à la pesée dans les 7 jours qui suivent un retour en cible alignée [mesuré].
- Point 5 : « Pourquoi ce résultat ? » en habitude mesurée : « Équilibre d'après ton journal : 2 470 kcal par jour. Habitude : +10 %. Ta cible = apport à viser ÷ habitude. » [mesuré, navigateur].
- Point 7 : sur la cible alignée, Aujourd'hui dit « Prochaine recalibration dans {n} jours. » [mesuré, navigateur].

### 3.8 Point 8 : versions

- Schéma 8 → 9 [lu] :
  - `StoredDailyLog.adherenceSource` (`user` ou `journal`) ;
  - source de plan `personal_target` et `CurrentPlan.personalTarget` ;
  - le verrou de la cible alignée n'a pas besoin d'état : c'est la cible alignée elle-même en vigueur.
- Migration 8 → 9 [mesuré] :
  - chaque déclaration existante reçoit la source `user`, pour que le journal ne la remplace jamais ;
  - rien d'autre ne change ;
  - un store du schéma 8 se charge sans perte (test).
- Modèle 1.5.0 → 1.6.0 [lu].

## 4. Vérifications

### 4.1 Utilisateurs sans journal et sans cible choisie

Captures `tests/experiments-journal/capture/`, branche avant les correctifs (`165a656`, worktree `../Weighty-5b-base`) contre la branche finale [mesuré] :

| Capture | Valeurs numériques | Différences |
|---|---|---|
| T-03 | 1 003 779 | 0 |
| T-04 | 1 497 006 | 0 |
| golden | 3 041 | 0 |
| R et S | 9 838 | 4 numériques, 164 autres |
| `convergenceJourney` | 8 716 | 3 numériques, 249 autres |

Toutes les différences, une à une [mesuré] :
- `schemaVersion` 8 → 9 (les 7 numériques) ;
- `scientificModelVersion`, `modelVersion`, `storedPlanModelVersion` 1.5.0 → 1.6.0 (59) ;
- la clé `adherenceSource: 'user'` ajoutée aux 354 journées déclarées, et à aucune autre.

Aucune capture ne contient de saisie de journal : aucune source `journal`, aucune différence due au point 4 [mesuré]. Instantanés R et S des tests : seule la version change [mesuré].

### 4.2 Équivalence de la 5b

- Méthode du rapport 45 [lu] :
  - même fixture : 400 utilisateurs, 24 semaines ;
  - stores chargés par les migrations jusqu'au schéma 9 ;
  - rejeu en 8 parties en priorité basse.
- Vérification ajoutée : la déduction de l'adhérence, appliquée à chaque store rejoué, n'écrit rien [lu].
- **Résultat sur le code final (`4db5c8f`)** [mesuré] :
  - **0 différence** sur 17 275 appels (400 utilisateurs, dont 323 basculent), tous les champs du plan comparés bit à bit comme au rapport 45 ;
  - adhérence déduite sur les stores rejoués : 0 jour (chaque utilisateur simulé déclare chaque jour) ;
  - tolérances : 0 pesée manquée, 0 jour non exploitable sur 6 460 évaluations de l'habitude ;
  - contrôles négatifs : 80 sur 80 diffèrent ;
  - durée : 232 à 298 s par partie, en parallèle et en priorité basse.
- Un premier rejeu après les points 1, 2 et 4 donnait déjà 0 différence [mesuré].

### 4.3 Tests unitaires

- 617 tests avant la passe, 647 à la fin [mesuré].
- `tests/domain/pass5bFix.test.ts` (30 tests) couvre la liste du prompt :
  - verrou de la cible alignée : vitesse, profil, ligne, jours restants, changement d'objectif, fin après une recalibration ;
  - aperçu et plan appliqué identiques en habitude mesurée, pour deux vitesses, et le lendemain ;
  - curseur en habitude mesurée : plan aux pas de base, plancher, pas gardés par le recalcul périodique ;
  - bouton actif après la saisie manquante, sur un profil daté du jour, et la cause du 29/09 ;
  - adhérence déduite :
    - aux seuils 10 % et 25 %, dans les deux sens ;
    - jamais par-dessus une déclaration (manuelle, importée) ;
    - source enregistrée, choix manuel prioritaire ;
    - rien pour un jour non saisi, incomplet, aujourd'hui, ou en habitude mesurée ;
  - format court : longueurs, mots du titre, texte long derrière « Détails », entrées anciennes ;
  - cible personnelle : refus sous le plancher, refus au-delà de la vitesse autorisée (et suivant l'IMC), contradiction (perte, prise, maintien), vitesse prévue (crans, plan du curseur, interpolation), plan en vigueur, pas de recalcul périodique, pas de curseur, G1 et G2, « Garder ma cible », onboarding ;
  - les quatre petits points ;
  - store du schéma 8 chargé sans perte, sources invalides signalées.
- Tests adaptés, avec la raison écrite dans le test [lu] :
  - `pass5b` : curseur réactivé en habitude, « Pourquoi ce résultat ? » revenu, texte de l'adhérence ;
  - `uxPass1` : avertissement IMC 20 au format court, titre de la recalibration refusée ;
  - `foodJournalPersistence` et `storage` : schéma 9, source des déclarations ;
  - `explanationPanel` et `constants` : version 1.6.0 ;
  - instantanés R et S : seule la version change.

### 4.4 Build et hors ligne

- `npm run check` : types et lint sans erreur, 647 tests sur 647 [mesuré].
- `npm run build` : OK [mesuré].
  - 31 fichiers précachés (1 507 Kio) ;
  - bundle principal 609,6 kB contre 593,2 kB au rapport 45 ;
  - même avertissement « chunk > 500 kB ».
- Hors ligne sous `/wheighty/` [mesuré] :
  - build servi par un serveur statique local ;
  - service worker actif (portée `/wheighty/`), worker du journal en cache ;
  - serveur arrêté (une requête hors cache échoue), page rechargée : servie par le service worker, l'app s'affiche.

### 4.5 Vérifié dans le navigateur

Serveur de dev, profils régénérés pour le 03/10 chargés dans le stockage local, boutons actionnés par le DOM (fenêtre masquée, captures d'écran impossibles, comme au rapport 45) [mesuré] :
- profil 1 : carte courte « Viser ce que tu manges ? » ; après « Viser 2 150 kcal » :
  - Aujourd'hui dit « Prochaine recalibration dans 7 jours. » ;
  - Plan montre la ligne du verrou et « Échéance : Après la première recalibration » ;
  - « Ton objectif » montre la ligne du verrou ; « Recalculer mon plan » garde 2 150 kcal ;
- profil 3 : carte « Plan calé sur ton journal » et ses « Détails » ; après « Utiliser ce plan » :
  - curseur pas / calories à 1 760 kcal pour 7 000 pas, 1 840 kcal à 9 000 pas, enregistré ;
  - « Pourquoi ce résultat ? » avec l'explication de l'habitude ;
- profil 4 : « Retour à ta cible alignée » et « Trop de pesées manquées… », texte long derrière « Détails » ;
- profil 6 : au rechargement, avant-hier « écart important » et hier « écart léger », source `journal` ; tuile « Plan respecté, d'après ton journal » ; feuille « Hier » : « Écart léger, d'après ton journal » ;
- profil 7 : « Une recalibration est prête. », écran avec « Garder ma cible » ; après l'avoir touché, le plan reste 1 700 kcal, source `personal_target` ;
- onboarding complet : « J'ai déjà ma cible » ;
  - 1 100 refusé, « Ton minimum est de 1 200 kcal par jour. », bouton désactivé ;
  - 1 700 : « Avec 1 700 kcal, vitesse prévue : 0,6 % par semaine. » ;
  - Résultat à 1 700 kcal avec ses macros ; après « C'est parti », Plan montre « Ta cible personnelle : 1 700 kcal par jour. Vitesse prévue : 0,6 % par semaine. » ;
- aucune erreur en console.

## 5. Points pour plus tard

1. En cible supposée tenue, l'écran Résultat de « Modifier mes informations » montre encore l'estimation de population, alors que le plan appliqué part de la calibration (écart d'avant la 5b, de la même famille que le point 1). Non touché : hors du périmètre [lu].
2. Le nombre de jours du verrou est une estimation : il suppose une pesée par jour ; à 0, la ligne s'affiche sans durée [lu].
3. En habitude mesurée, les plans suivants gardent les pas choisis au curseur en résolvant directement à ces pas (mécanisme des garde-fous du prototype) : écart d'arrondi possible avec le curseur (10 kcal) [déduit].

## 6. Choix faits sans consigne

1. **Verrou (1a)**, avec le même objectif :
   - « Recalculer mon plan » et la modification du profil gardent la cible alignée en vigueur et la vitesse du profil ;
   - le poids cible et les autres réponses changent ;
   - l'étape vitesse de la modification du profil est verrouillée aussi.
2. **Jours restants** : le plus grand de « 7 jours après la bascule » et des manques de la porte de recalibration (jours d'écart de pesées, pesées, pesées propres), avec une pesée par jour ; à 0, « Vitesse modifiable après la première recalibration. » sans durée.
3. **Aperçu (1b)** :
   - hors cible supposée tenue, l'écran Résultat de « Modifier mes informations » montre le plan qui sera appliqué ;
   - sans carte de confiance (elle décrit l'estimation de population) ;
   - avec « équilibre d'après ton journal » en habitude mesurée.
4. **Course du worker** : la demande hebdomadaire est refaite si le plan ou l'objectif change pendant le calcul.
5. **Curseur de l'habitude** :
   - contexte du plan en vigueur au jour de sa construction ;
   - les pas choisis sont gardés par les plans suivants de l'habitude.
6. **Adhérence déduite** :
   - tous les jours passés concernés, y compris l'historique, au premier changement de jour après la mise à jour ;
   - la ligne « d'après ton journal » aussi dans la feuille, pour un jour passé déduit ;
   - texte de la tuile en 14 px pour tenir.
7. **Textes courts sans annexe** :
   - cible relevée au plancher, message de la trace : « Cible relevée au minimum » / « On part de {cible} kcal, ton minimum. » ;
   - recalcul périodique en maintien : « … kcal par jour, pour garder ton poids stable. » ;
   - plan de l'habitude, habitude sous 2 % : « Tu tiens ta cible de près. Nouvelle cible : {cible} kcal. » ;
   - raisons courtes : « vitesse sous ton minimum calorique » sans plancher connu, « calcul impossible » pour une raison inconnue ;
   - refus d'une recalibration en toast : la ligne courte ;
   - titre de l'écran de recalibration refusée : « Recalibration impossible » ;
   - la forme sur une ligne de l'avertissement IMC 20 disparaît au profit du format court ;
   - le poids d'une ancienne migration du poids cible est relu dans son message.
8. **Cible personnelle** :
   - **maintien** : accepté entre les premiers crans de perte et de prise ; vitesse prévue affichée sans signe ; vitesse enregistrée 0 dans le plan ;
   - **prise trop rapide** (sans annexe) : « Trop rapide : au plus {cible} kcal par jour. », le plafond de prise ne dépend pas de l'IMC ;
   - **arrondis** : minimum affiché arrondi à 10 kcal au-dessus, limite proposée arrondie pour être acceptée ;
   - **construction du plan** : plan de l'objectif à la vitesse prévue ; si aucun cran ne passe le plancher, plan de maintien sur le même contexte, puis les champs de l'objectif ;
   - **pas de curseur** pas / calories tant qu'elle est en vigueur (la ligne « Ta cible personnelle » à sa place) ; pas de « Pourquoi ce résultat ? » ;
   - **changement de vitesse ou d'objectif** : il remplace la cible personnelle par une cible calculée, sans message de plus ;
   - **libellés** : « Garder ma cible » à la place de « Plus tard », retour à Aujourd'hui ; « Revenir à la cible proposée », « Appliquer ma cible » et le message « Ta cible est appliquée. ».
9. **« Pourquoi ce résultat ? » de l'habitude** : habitude signée, « +10 % ».
10. **Migration** : les déclarations existantes deviennent `user`, aucun état du verrou.

## 7. Git

- Commits sur `prod/5b-parcours-journal`, préfixés `5b-fix:`, ajouts par chemins explicites ; aucun brut ni archive (sorties dans `tests/experiments-journal/results/`, ignoré) [mesuré].
- Pas de fusion avant ton accord. Ensuite : fusion normale dans `main` (commit de fusion, comme la 5a), puis tes commandes d'envoi.

## 8. Liste de vérification (10 minutes)

**0. Profils du jour.** Dans le dossier du dépôt :

```
npm run verification:profils
```

Puis `npm run dev`, ouvrir l'adresse affichée dans une fenêtre de navigation privée. Créer un profil quelconque. Pour chaque fichier : Profil > Mes données > Importer un fichier (dans `docs/verification-5b/`), puis **recharger la page**.

1. **Point 1, verrou** : importer `1-proposition.json`, recharger, « Viser 2 150 kcal ».
   - Aujourd'hui : « Prochaine recalibration dans 7 jours. »
   - Plan : pas de curseur, la ligne « Ta cible suit ce que tu manges. Vitesse modifiable après la première recalibration, dans 7 jours. », « Échéance : Après la première recalibration ».
   - Profil > « Changer d'objectif ou de vitesse » : pas de curseur de vitesse, la même ligne ; « Recalculer mon plan » : la cible reste 2 150.
   - Rouvrir, choisir « Maintien », « Recalculer mon plan » : le plan passe en maintien.
2. **Curseur en habitude mesurée** : importer `3-premier-plan.json`, recharger.
   - Carte « Plan calé sur ton journal », « Tu manges 10 % de plus que ta cible. Nouvelle cible : 1 760 kcal. » ; toucher « Détails » : le texte long. « Utiliser ce plan ».
   - Plan : « Ajuster » : 1 760 kcal à 7 000 pas ; plus de pas, plus de calories. Enregistrer.
   - « Pourquoi ce résultat ? » : « Équilibre d'après ton journal : 2 470 kcal par jour. Habitude : +10 %… ».
   - « Changer d'objectif ou de vitesse », vitesse 0,3 %, « Recalculer mon plan » : la cible monte, l'app ne revient pas à 2 100.
3. **Bouton** : importer `2-bouton.json`, recharger.
   - Plan : bouton grisé, « (encore 1) ».
   - Journal > Hier : saisie libre de 1 850 kcal. Retour sur Plan : le bouton est actif.
4. **Adhérence déduite** : importer `6-adherence-deduite.json`, recharger.
   - Tuile Adhérence : « Plan respecté, d'après ton journal », « Toucher pour changer ».
   - La toucher, « Hier » : « Écart léger, d'après ton journal », « Léger écart » sélectionné. Choisir « Plan respecté », « Valider » : ton choix reste après un rechargement.
5. **Message court** : importer `4-retour-cible-alignee.json`, recharger.
   - Une ou deux secondes après : « Retour à ta cible alignée », « Trop de pesées manquées ces dernières semaines. » ; « Détails » déplie le texte long ; « OK » le ferme.
6. **Cible personnelle à l'onboarding** : Profil > Mes données > supprimer les données (ou nouvelle fenêtre privée), refaire l'onboarding jusqu'à « Voilà ton point de départ ».
   - « J'ai déjà ma cible », taper 1100 : « Ton minimum est de 1 200 kcal par jour. », bouton grisé.
   - Taper 1700 : « Avec 1 700 kcal, vitesse prévue : … % par semaine. », « Appliquer ma cible ».
   - Résultat : 1 700 kcal. « C'est parti ». Plan : « Ta cible personnelle : 1 700 kcal par jour. Vitesse prévue : … ».
7. **« Garder ma cible »** : importer `7-cible-personnelle.json`, recharger.
   - Aujourd'hui : « Une recalibration est prête. » ; la toucher : l'écran propose « Appliquer le nouveau plan » et « Garder ma cible ».
   - « Garder ma cible » : retour sur Aujourd'hui, la cible reste 1 700 kcal ; Plan montre toujours « Ta cible personnelle ».
