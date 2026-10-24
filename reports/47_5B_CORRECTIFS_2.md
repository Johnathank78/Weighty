# 47. Seconds correctifs de la 5b : la cible personnelle comme point de départ

Date : 24/10/2026. Branche `prod/5b-parcours-journal`, à la suite du rapport 46, non fusionnée. Marquage : [lu] lu dans un fichier ou une sortie, [mesuré] obtenu en lançant une commande, [déduit] conclusion tirée des deux.

## 1. Pour John, en 10 lignes

1. Les cinq constats de la revue sont justes ; je les ai lus dans le code, puis reproduits [mesuré].
2. Exemple de la revue reproduit : 66 kg, 165 cm, maintien estimé 2 056 kcal, une cible de 1 350 kcal était refusée « trop rapide » ; elle est acceptée [mesuré].
3. La cible personnelle n'est plus refusée que sous le plancher. L'app affiche la vitesse estimée au départ, ou « plus de 1 % », ou « tu prendrais du poids » [mesuré].
4. Le profil et le plan gardent toujours une vitesse valide pour l'objectif et l'IMC ; la vitesse estimée ne sert qu'à l'affichage [mesuré].
5. Tant qu'elle est en vigueur : pas de plafond de vitesse (G2), mais l'IMC 20 (G1) et l'alerte de sous-poids s'appliquent [mesuré].
6. À la première recalibration, l'app reprend la main toute seule : elle enregistre l'estimation, relit la vitesse, choisit une vitesse valide et applique le plan, avec un message court [mesuré].
7. Ça se passe sans ouvrir Suivi : le calcul part avec la calibration, dans son worker, à l'ouverture, au changement de jour ou après une pesée [mesuré, navigateur].
8. « Garder ma cible » a disparu, et l'aperçu de « Modifier mes informations » montre enfin le plan qui sera appliqué [mesuré, navigateur].
9. Utilisateurs sans cible personnelle : seules les versions changent (captures) ; équivalence de la 5b : 0 différence sur 17 275 appels [mesuré].
10. À faire : ta vérification (section 8, 15 minutes), puis ton accord pour la fusion.

## 2. Constats de la revue

| # | Constat | Verdict | Ce que fait le code (avant cette passe) |
|---|---|---|---|
| 1 | L'inscription contrôle la cible avec l'estimation de population | **Confirmé** [lu, mesuré] | `completeOnboardingWithTarget` passe le contexte de `previewInitialPlan` à `checkPersonalTarget`, qui refuse « trop rapide » au-delà de la vitesse autorisée et « contredit l'objectif » de l'autre côté. Mesuré : 66 kg, maintien 2 056 kcal, 1 350, 1 450 et 1 550 kcal refusés (« au moins 1 630 kcal ») ; objectif de prise à 2 100 kcal refusé (« tu perdrais du poids »). |
| 2 | « Garder ma cible » n'enregistre aucune estimation | **Confirmé** [lu, mesuré] | Le bouton revient à Aujourd'hui ; l'écran avait seulement appelé `markRecalibrationSeen` à l'affichage. Mesuré : recalibration prête au jour 21, 0 snapshot appliqué après. |
| 3 | G2 compare le plafond à la vitesse figée du jour du choix | **Confirmé** [lu, mesuré] | `enforcePlanGuardrails` lit `plan.weeklyRateTarget`, la vitesse prévue écrite par `withPersonalTarget`, jamais recalculée. |
| 4 | « Appliquer le nouveau plan » recalcule à la vitesse figée | **Confirmé** [lu, mesuré] | `applyRecalibration` reconstruit avec `profile.weeklyRateTarget` (la vitesse prévue). Mesuré : cible 1 500 kcal, maintien réel plus bas (−0,03 kg par jour) : nouveau plan à 1 224 kcal, près du plancher de 1 200. |
| 5 | Résultat de « Modifier mes informations » en cible supposée tenue | **Confirmé** [lu, mesuré] | `pathPreview` n'existait que hors méthode `assumed`. Mesuré après une calibration : aperçu 1 491 kcal (maintien 2 323), plan appliqué 1 216 kcal (maintien 1 845). |

Aucune règle d'arrêt n'a joué : la branche contenait le rapport 46 (`3284515`), les cinq constats sont justes, aucune science nouvelle [lu].

## 3. Ce qui a été fait

Commits sur `prod/5b-parcours-journal`, préfixés `5b-fix2:` [mesuré] :

| Commit | Contenu |
|---|---|
| `0705183` | Point 1 : saisie, règles en vigueur, reprise, fin de « Garder ma cible », règle 1e |
| `984c052` | Point 2 : aperçu de « Modifier mes informations » |
| `61e1989` | Point 3 : schéma 10, modèle 1.7.0, migration |
| `168384d` | Point 1 (suite) : pas de ligne « Vitesse » dans Plan sur une cible personnelle (vu au navigateur) |
| `c977b78` | Profils de vérification : 7 revu, 8 ajouté (la reprise) |
| ce rapport | |

Le schéma reste à 9 dans `0705183` et `984c052` : la forme de `personalTarget` y est déjà la nouvelle, la migration arrive au commit suivant. Les trois commits passent les types, le lint et leurs tests [mesuré].

### 3.1 Point 1a : saisie

`src/domain/personalTarget.ts` [lu] :
- `personalTargetTable` construit les deux côtés (perte, prise) quel que soit l'objectif, avec la même grille et `calorieTargetForRate` qu'avant ;
- `readPersonalTarget` lit la cible sur le côté de son sens (sous la cible de vitesse 0 : perte ; au-dessus : prise), par `rateOn` existant ; au-delà du dernier cran : `beyondGrid` ;
- `checkPersonalTarget` refuse **seulement** sous le plancher (message inchangé) ; sinon : la vitesse estimée (signée), la ligne de l'annexe, et la vitesse du profil `goalRateOf` ;
- `goalRateOf` est la règle du point 1c, étape 3, utilisée aussi à la saisie :

| Lecture | Vitesse du profil et du plan | Cas |
|---|---|---|
| objectif de maintien | 0 | `maintenance` |
| sens opposé à l'objectif | minimum de l'objectif | `opposite` |
| plus rapide que la vitesse autorisée (objectif, IMC), ou au-delà de la grille | vitesse autorisée | `too_fast` |
| plus lente que le minimum, ou vitesse nulle | minimum de l'objectif | `too_slow` |
| sinon | la vitesse lue, ramenée sur la grille (`snapWeeklyRate`) | `within` |

- `withPersonalTarget` écrit cette vitesse valide dans `weeklyRateTarget` et `requestedWeeklyRate` ; `personalTarget` garde `{ kcal, estimatedRate, beyondGrid }` pour l'affichage [lu].
- Trace : `personal_target_set`, sans message, avec la cible, la vitesse estimée et le cas [mesuré].
- Plan : « Ta cible personnelle : {cible} kcal par jour. L'app l'ajustera à ta première recalibration. » [mesuré, navigateur].

Mesuré sur une plage de cibles (1 200 à 3 600 kcal par pas de 100, trois profils dont BMI 24 et une prise) : aucune vitesse du profil ou du plan hors de [minimum de l'objectif, vitesse autorisée].

### 3.2 Point 1b : en vigueur

- G2 ne s'applique plus sur une cible personnelle : `enforcePlanGuardrails` sort avant le plafond, comme pour la cible alignée elle-même [lu, mesuré].
- G1, l'alerte de sous-poids et l'absence de recalcul périodique : inchangés, vérifiés [mesuré].

### 3.3 Point 1c : reprise par l'app

- `computePersonalTakeover` (calcul) et `applyPersonalTakeover` (écriture), dans `personalTarget.ts` [lu] :
  1. snapshot appliqué, référence d'affichage mise à jour (comme `applyRecalibration`) ;
  2. table refaite sur le contexte de la nouvelle estimation, cible relue ;
  3. `goalRateOf` ;
  4. plan de la méthode habituelle (`buildPlanFromStore`, source `recalibrated`, pas du plan en vigueur), vitesse du profil mise à jour ;
  5. la cible personnelle se termine (le plan n'en est plus une) ;
  6. entrée `personal_target_takeover` : avant, après (avec leurs maintiens, l'estimation de départ et la nouvelle), la vitesse relue, le cas ; le texte long dans `message`, le court formulé depuis l'entrée (`planEventShort`).
- **Où c'est branché** [lu, mesuré] : dans le worker de calibration. La réponse du worker contient, à côté de l'état, la reprise quand elle est due (`calibrationAnswer`). `StoreProvider` l'applique si le store n'a pas changé depuis la demande (même empreinte de calibration, même cible personnelle). La calibration se recalcule à l'ouverture, à chaque changement de jour (la date est dans l'empreinte) et après chaque pesée : la reprise arrive au plus tard à ce moment-là, sans ouvrir Suivi, et le calcul lourd ne touche pas le fil principal.
- **Échec** : la cible personnelle reste, l'estimation n'est pas enregistrée, une entrée `failed` est tracée (sans message), la recalibration est marquée vue ; l'app retente à la recalibration suivante [mesuré].
- Messages : les quatre lignes de l'annexe, et « Détails » [mesuré, navigateur].

### 3.4 Points 1d et 1e

- Plus de « Garder ma cible » : le texte et le bouton ont disparu. Sur une cible personnelle, Aujourd'hui et Suivi n'annoncent pas de recalibration, et l'écran de recalibration ne la marque pas vue (sinon la reprise attendrait la suivante) [lu, mesuré].
- `updateProfileKeepingPersonalTarget`, appelée par `updateProfileOnPath` : sans changement d'objectif ni de vitesse, la cible est gardée sur le nouveau contexte ; sous le nouveau plancher, elle y est relevée. Un changement de vitesse ou d'objectif la remplace par une cible calculée (inchangé) [mesuré].

### 3.5 Point 2 : aperçu

`Result.tsx` : en modification, l'aperçu est `updateProfileOnPath`, la fonction même que le bouton applique, pour toutes les méthodes. En cible supposée tenue, la note « Vitesse ajustée » est lue sur ce plan [lu, mesuré, navigateur].

### 3.6 Point 3 : versions

- Modèle 1.6.0 → 1.7.0 ; schéma 9 → 10 [lu].
- Migration 9 → 10 [lu, mesuré] :
  - `predictedRate` devient `estimatedRate` signé (négatif : une perte), `beyondGrid: false` (au schéma 9, une cible au-delà était refusée) ;
  - la vitesse du profil et celles du plan sont ramenées dans la plage de l'objectif (une vitesse prévue sous le minimum devient le minimum ; le plafond de l'IMC était contrôlé à la saisie) ;
  - la vitesse prévue reste dans `estimatedRate` : rien n'est perdu ;
  - un store sans cible personnelle passe tel quel, au numéro de schéma près.

## 4. Vérifications

### 4.1 Utilisateurs sans cible personnelle

Captures `tests/experiments-journal/capture/`, `4db5c8f` (worktree `../Weighty-5b-base`, déplacé de `165a656`) contre la branche finale, en priorité basse [mesuré] :

| Capture | Valeurs numériques | Différences |
|---|---|---|
| T-03 | 1 003 779 | 0 |
| T-04 | 1 497 006 | 0 |
| golden | 3 041 | 0 |
| R et S | 9 838 | 4 numériques, 24 autres |
| `convergenceJourney` | 8 716 | 3 numériques, 35 autres |

Les 66 différences, une à une [mesuré] : `schemaVersion` 9 → 10 (les 7 numériques) ; `scientificModelVersion` (53), `modelVersion` (4), `storedPlanModelVersion` (2) 1.6.0 → 1.7.0. Rien d'autre. Instantanés R et S des tests : seule la version change [mesuré].

### 4.2 Équivalence de la 5b

Méthode des rapports 45 et 46, une fois, sur le code final (`c977b78`) : même fixture (400 utilisateurs, 24 semaines, aucune cible personnelle), stores chargés par les migrations jusqu'au schéma 10, rejeu en 8 parties en priorité basse [lu, mesuré].
- **0 différence** sur 17 275 appels (400 utilisateurs, dont 323 basculent), tous les champs du plan comparés bit à bit [mesuré] ;
- adhérence déduite sur les stores rejoués : 0 jour ; tolérances : 0 pesée manquée, 0 jour non exploitable sur 6 460 évaluations de l'habitude [mesuré] ;
- contrôles négatifs : 80 sur 80 diffèrent [mesuré] ;
- durée : 275 à 344 s par partie, en parallèle [mesuré].

### 4.3 Tests unitaires

- 647 tests au rapport 46, **674** à la fin [mesuré].
- `tests/domain/pass5bFix2.test.ts` (28 tests), la liste du prompt [mesuré] :
  - saisie : la cible de 1 350 kcal acceptée (refusée avant), sous le plancher refusée, sens opposé (perte, prise, maintien), « plus de », lecture du curseur à l'envers, aucune vitesse hors limites (balayage), trace, ligne de Plan ;
  - en vigueur : G2 inactif sous IMC 25, G1 et l'alerte de sous-poids sous IMC 18,5, pas de recalcul périodique ;
  - reprise, les cinq cas : estimation enregistrée, source `recalibrated`, vitesse du profil, entrée de trace, message court et long, écart d'arrondi ;
  - reprise sans ouvrir Suivi : par le chemin du worker (son repli synchrone), à la pesée qui rend la porte remplie, et à l'ouverture quelques jours plus tard ; reprise calculée pour un autre plan ignorée ; échec de construction ;
  - plus de « Garder ma cible » ; changements (vitesse, objectif, profil, plancher relevé) ;
  - aperçu du point 2 après une calibration ; migration du schéma 9 (avec et sans cible personnelle) ; entrées de trace validées.
- Écarts observés de la reprise [mesuré] :

| Cas | Cible personnelle | Vitesse relue | Vitesse appliquée | Nouvelle cible |
|---|---|---|---|---|
| dans les limites | 1 700 | 0,381 % | 0,40 % | 1 681 (−19 kcal, l'arrondi de la grille) |
| trop rapide (IMC 24) | 1 350 | 0,755 % | 0,50 % | 1 560 |
| trop lente | 1 700 | 0,153 % | 0,20 % | 1 652 |
| sens opposé | 1 700 | prise de 0,013 % | perte de 0,20 % | 1 471 |
| maintien | 1 700 | perte de 0,260 % | 0 | 1 906 |

- Tests adaptés, avec la raison écrite dans le test [lu] : `pass5bFix` (point 6 : les refus et « Garder ma cible » disparaissent par décision du rapport 47 ; point 8 : schéma courant), `uxPass1` (ordre des messages), `explanationPanel`, `constants`, `foodJournalPersistence` (versions), instantanés R et S (version seule).

### 4.4 Build et hors ligne

- `npm run check` : types et lint sans erreur, 674 tests sur 674 [mesuré].
- `npm run build` : OK, 31 fichiers précachés (1 532 Kio), bundle principal 614,6 kB (609,6 kB au rapport 46), même avertissement « chunk > 500 kB » [mesuré].
- Hors ligne sous `/wheighty/` : service worker actif, les deux workers en cache ; serveur arrêté (requête hors cache : échec réseau), page rechargée : servie par le service worker, l'app s'affiche [mesuré].

### 4.5 Navigateur

Serveur de dev, profils régénérés pour le 24/10 [mesuré, navigateur] :
- inscription complète, 66 kg, 165 cm, perte : premier plan 1 620 kcal, maintien 2 060 ; « J'ai déjà ma cible » :
  - 1 100 : « Ton minimum est de 1 200 kcal par jour. », bouton grisé ;
  - 1 350 (refusé avant) : « Vitesse estimée au départ : 0,82 % par semaine. Tes pesées diront la vraie. », accepté ;
  - Résultat à 1 350 kcal ; après « C'est parti » : Plan montre la ligne de l'annexe ; stocké : vitesse du profil et du plan 0,5 %, vitesse estimée −0,82 % ;
- profil 8 : à l'ouverture, sans toucher Suivi, la carte « Vitesse ajustée », « 1 350 → 1 560 kcal : 0,5 % par semaine, le maximum pour toi. » ; « Détails » : « Tes pesées montrent un maintien d'environ 2 010 kcal par jour (estimation de départ : 2 060)… » ; plan `recalibrated` ;
- même profil, « Modifier mes informations » jusqu'au Résultat : 1 560 kcal, maintien 2 010 (la calibration, pas la moyenne) ; « Appliquer ce plan » : 1 560 kcal appliqués ;
- profil 7 : Plan montre la ligne de l'annexe, sans ligne « Vitesse » ;
- aucune erreur en console ; captures d'écran possibles cette fois.

## 5. Choix faits sans consigne

1. **Vitesse valide à la saisie** : la règle de la reprise (`goalRateOf`) appliquée à l'estimation de départ ; dans le profil, `weeklyRateTarget` et `requestedWeeklyRate` du plan.
2. **Au-delà de la grille** : traité comme « trop rapide » (la vraie vitesse dépasse le dernier cran, donc la vitesse autorisée).
3. **Vitesse nulle** (cible entre les cibles de vitesse 0 des deux côtés) : « trop lente » ; ligne « Vitesse estimée au départ : 0,0 % ».
4. **Objectif de maintien** : entre les premiers crans de perte et de prise, la ligne de vitesse estimée (sans signe, comme au rapport 46) ; au-delà, la ligne « sens opposé ».
5. **Inscription** : si le plan ne peut pas se construire à la vitesse valide, l'inscription se fait avec le profil tel quel, puis la cible.
6. **Échec de la reprise** : estimation non enregistrée, recalibration marquée vue, entrée sans message.
7. **Reprise et course** : appliquée seulement si le store n'a pas changé depuis la demande (empreinte de calibration) et si c'est la même cible personnelle ; sinon recalculée au passage suivant.
8. **Estimation de départ {M0}** : le maintien du plan de la cible personnelle.
9. **Messages** : genre « personal_target » dans la zone des messages, entre le parcours journal et le recalcul périodique ; ton calme.
10. **Règle 1e** : le poids cible n'est pas l'objectif (il peut changer sans terminer la cible) ; cible sous le nouveau plancher relevée au plancher arrondi à 10 kcal au-dessus ; vitesse estimée de départ gardée telle quelle.
11. **Plan** : pas de ligne « Vitesse » tant qu'une cible personnelle est en vigueur (la vitesse du plan n'est pas celle de l'utilisateur ; l'afficher à côté d'une projection à sa cible induisait en erreur).
12. **Aperçu du point 2** : sans carte de confiance (comme au rapport 46 sur le parcours journal) ; « Vitesse ajustée » lue sur le plan appliqué, sans le conseil des pas (il décrit l'estimation de population).
13. **Migration** : vitesses ramenées dans la plage de l'objectif sans recalcul (pas de science dans une migration) ; `beyondGrid: false`.
14. **Écran de recalibration** atteint par un retour arrière sur une cible personnelle : « Pas encore de recalibration ».

## 6. Limites connues

1. Si la vitesse autorisée est sous le minimum de l'objectif (perte sous IMC 20), la reprise échoue et G1 passe en maintien, comme pour tous [déduit].
2. Le cas « dans les limites » dit « On garde ce rythme » même si le plancher a réduit la vitesse appliquée ; la ligne donne la vitesse appliquée [lu].
3. Application fermée : la reprise se fait à la prochaine ouverture (la calibration ne tourne que l'app ouverte) [déduit].
4. Une modification du profil qui ne peut pas se reconstruire échoue comme pour tous, même avec une cible personnelle [lu].
5. Hors périmètre, trouvé en passant, non corrigé : l'en-tête de `manualProfiles.experiment.ts` ne cite que les rapports 45 et 46 [lu].

## 7. Git

- Commits par chemins explicites ; aucun brut ni archive (sorties des captures et de l'équivalence dans le dossier temporaire et dans `tests/experiments-journal/results/`, ignoré) ; `.gitignore` non touché [mesuré].
- Worktree `../Weighty-5b-base` déplacé de `165a656` à `4db5c8f` pour les captures [mesuré].
- Pas de fusion avant ton accord. Ensuite : fusion normale dans `main` (commit de fusion), puis tes commandes d'envoi, puis la suppression des worktrees de la 5b.

## 8. Liste de vérification (15 minutes)

C'est celle du rapport 46, mise à jour, avec trois points ajoutés (6, 8 et 9).

**0. Profils du jour.** Dans le dossier du dépôt :

```
npm run verification:profils
```

Puis `npm run dev`, ouvrir l'adresse affichée dans une fenêtre de navigation privée. Créer un profil quelconque. Pour chaque fichier : Profil > Mes données > Importer un fichier (dans `docs/verification-5b/`), puis **recharger la page**.

1. **Verrou de la cible alignée** : importer `1-proposition.json`, recharger, « Viser 2 150 kcal ».
   - Aujourd'hui : « Prochaine recalibration dans 7 jours. »
   - Plan : pas de curseur, la ligne « Ta cible suit ce que tu manges. Vitesse modifiable après la première recalibration, dans 7 jours. », « Échéance : Après la première recalibration ».
   - Profil > « Changer d'objectif ou de vitesse » : pas de curseur de vitesse, la même ligne ; « Recalculer mon plan » : la cible reste 2 150.
   - Rouvrir, choisir « Maintien », « Recalculer mon plan » : le plan passe en maintien.
2. **Curseur en habitude mesurée** : importer `3-premier-plan.json`, recharger.
   - Carte « Plan calé sur ton journal », « Tu manges 10 % de plus que ta cible. Nouvelle cible : 1 760 kcal. » ; « Détails » : le texte long. « Utiliser ce plan ».
   - Plan : « Ajuster » : 1 760 kcal à 7 000 pas ; plus de pas, plus de calories. Enregistrer.
   - « Pourquoi ce résultat ? » : « Équilibre d'après ton journal : 2 470 kcal par jour. Habitude : +10 %… ».
   - « Changer d'objectif ou de vitesse », vitesse 0,3 %, « Recalculer mon plan » : la cible monte, l'app ne revient pas à 2 100.
3. **Bouton** : importer `2-bouton.json`, recharger.
   - Plan : bouton grisé, « (encore 1) ».
   - Journal > Hier : saisie libre de 1 850 kcal. Retour sur Plan : le bouton est actif.
4. **Adhérence déduite** : importer `6-adherence-deduite.json`, recharger.
   - Tuile Adhérence : « Plan respecté, d'après ton journal », « Toucher pour changer ».
   - La toucher, « Hier » : « Écart léger, d'après ton journal ». Choisir « Plan respecté », « Valider » : ton choix reste après un rechargement.
5. **Message court** : importer `4-retour-cible-alignee.json`, recharger.
   - « Retour à ta cible alignée », « Trop de pesées manquées ces dernières semaines. » ; « Détails » déplie le texte long ; « OK » le ferme.
6. **Inscription avec une cible jugée trop rapide par la moyenne (nouveau)** : Profil > Mes données > supprimer les données (ou nouvelle fenêtre privée). Onboarding : femme, 35 ans, 165 cm, **66 kg**, travail assis, 7 000 pas, pas d'historique, perte, poids cible proposé.
   - Premier plan : environ 1 620 kcal, maintien estimé 2 060.
   - « J'ai déjà ma cible », taper 1100 : « Ton minimum est de 1 200 kcal par jour. », bouton grisé.
   - Taper **1350** : « Vitesse estimée au départ : 0,82 % par semaine. Tes pesées diront la vraie. », « Appliquer ma cible » actif (avant : refusé).
   - Résultat : 1 350 kcal. « C'est parti ». Plan : « Ta cible personnelle : 1 350 kcal par jour. L'app l'ajustera à ta première recalibration. », pas de ligne « Vitesse ».
7. **Cible personnelle en vigueur** : importer `7-cible-personnelle.json`, recharger.
   - Aujourd'hui : pas de « Une recalibration est prête ».
   - Plan : « Ta cible personnelle : 1 700 kcal par jour. L'app l'ajustera à ta première recalibration. »
8. **Reprise par l'app (nouveau)** : importer `8-reprise.json`, recharger, **sans ouvrir Suivi**.
   - Une ou deux secondes après : « Vitesse ajustée », « 1 350 → 1 560 kcal : 0,5 % par semaine, le maximum pour toi. ».
   - « Détails » : « Tes pesées montrent un maintien d'environ 2 010 kcal par jour (estimation de départ : 2 060)… » ; « OK » le ferme.
   - Plan : 1 560 kcal, plus de ligne « Ta cible personnelle ». Aucun écran de recalibration, aucun « Garder ma cible ».
9. **Aperçu de « Modifier mes informations » (nouveau)** : sur le même profil, Profil > « Modifier mes informations », « Continuer » jusqu'à « Recalculer mon plan ».
   - Résultat : 1 560 kcal, maintien estimé 2 010 (avant : la moyenne, environ 2 060, et une autre cible).
   - « Appliquer ce plan » : Plan montre bien 1 560 kcal.

## 9. Après ton accord

Fusion normale (pas de squash) dans `main`, selon `docs/GIT_POUR_JOHN.md`, puis :

```
git push origin main
```

```
git push origin prod/5b-parcours-journal
```

Puis la suppression des worktrees de la 5b : `../Weighty-5b-proto` après avoir annulé son instrumentation, et `../Weighty-5b-base` (commandes données si la suppression est bloquée).
