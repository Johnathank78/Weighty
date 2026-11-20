# 50. Passe UX 3 : graphique de Suivi, première recalibration, historique du plan

Date : 20/11/2026. Branche `ux/pass-3`, partie de `292d617`, non fusionnée, non envoyée. Marquage : [lu] lu dans un fichier ou une sortie, [mesuré] obtenu en lançant une commande ou dans le navigateur, [déduit] conclusion tirée des deux.

## 1. Pour John, en 10 lignes

1. Suivi n'a plus qu'une échelle de temps. « Ce mois-ci » montre 30 jours de chaque côté d'aujourd'hui. « Tout » va de la première pesée à l'arrivée au poids cible [mesuré, navigateur].
2. « Auj. » et le départ de la projection sont sur aujourd'hui, avec un raccord en pointillés. La projection est tracée jour par jour, et une pause apparaît en gris [mesuré, navigateur].
3. Le dessin ne repart plus à chaque écriture du store : 0 relance pour 5 écritures, contre 5 sur `292d617` [mesuré, navigateur].
4. La première recalibration ouvre son écran d'elle-même, une seule fois. « Plus tard » la laisse prête dans Analyse et sur Aujourd'hui. Sur une cible personnelle, rien ne change [mesuré, navigateur].
5. Plan a une page « Historique de mon plan », lue dans la trace seule [mesuré, navigateur].
6. Depuis une cible personnelle, « Revenir au plan de Wheighty » montre un aperçu avant de confirmer. Avant toute recalibration, il change peu : 1 700 → 1 700 kcal sur le profil 16 [mesuré].
7. Avec une pesée de plus de 7 jours, un changement de plan propose « Me peser d'abord ». Sur ton cas du 24/10 : 1 586 kcal sans pesée, 1 573 avec, et la projection part du vrai poids [mesuré].
8. Textes : « prochaine » après une recalibration, reste du jour arrondi, ligne d'état pendant D3, un seul message à la fois, chaque maintien avec son poids. Les deux défauts du rapport 48 sont corrigés [mesuré].
9. Aucune sortie scientifique ne change : T-03, T-04 et golden sont identiques au bit près, R, S et parcours ne diffèrent que par le schéma 12. Équivalence de la 5b : 0 échec sur 17 275 appels. Les tests passent de 737 à 767 [mesuré].
10. À faire : ta vérification (section 8, 20 minutes), puis ton accord pour la fusion.

## 2. Git

Base vérifiée : `main` = `origin/main` = `292d617` [mesuré]. Branche `ux/pass-3` créée depuis ce commit [mesuré].

| Commit | Contenu |
|---|---|
| `7696d66` | point 1 : graphique de Suivi, profil 15, script de mesure du temps |
| `30dd2fb` | point 2 : première recalibration, schéma 12, profils 12 et 13 |
| `0f7625d` | point 3 : historique du plan, profil 14 |
| `09d6a5e` | point 4 : « Revenir au plan de Wheighty », profil 16 |
| `df549e8` | point 5 : se peser d'abord, script du cas réel |
| `90e7b8e` | point 6 : textes |
| `d6a1539` | point 7 : défauts du rapport 48 |
| `371a614` | vérifications : aller-retour des profils 12 à 16 (4.6), script des mesures 1b et 1c |
| `8b73a31` | `IMPLEMENTATION_NOTES.md` |
| ce rapport | rapport seul, en dernier |

- Les commits sont faits par chemins explicites. Le `.gitignore` n'est pas touché. Aucun brut, archive ni donnée réelle n'est commité : les bruts sont dans `tests/experiments-journal/results/ux3/`, ignoré [mesuré].
- Chaque commit passe le typage seul, vérifié sur son arbre dans un worktree [mesuré]. `npm run check` a été lancé avant chaque commit de point [mesuré].
- **Un écart à la règle.** Le commit du point 4 est d'abord parti avec un test de la passe UX 2 en échec : ce test attendait deux options dans la feuille, il y en a trois. Il a été corrigé par `--amend` avant tout envoi.
- Les fichiers suivis de `docs/verification-5b/` ont été régénérés pour mes vérifications ; ils ne sont pas commités (section 8).

## 3. Les points

### Point 1 : le graphique de Suivi (E1)

**Diagnostic** [lu dans `292d617`, confirmé] :
- `chartScale` réservait 30 % de la largeur au futur (`FUTURE_WIDTH_SHARE`) et plaçait la jonction sur le dernier point de tendance.
- `trackingChart` dessinait le jour 0 de la projection sur le jour du dernier point de tendance (`anchor + pt.day`). Or `projectionFromToday` simule à partir d'aujourd'hui.
- `projectPlan` échantillonnait tous les 7 jours, et la projection était coupée à un horizon de 21 jours au moins.

**1a, échelle commune.**
- `chartScale` prend la fenêtre (`domainDays`) et le jour d'aujourd'hui, avec une seule échelle linéaire.
- La fenêtre est calculée dans le domaine (`trackingChart`) :
  - « Ce mois-ci » : 30 jours avant aujourd'hui et 30 après ;
  - « Tout » : de la première pesée au jour d'arrivée de la projection, 30 jours après aujourd'hui sans arrivée, 365 jours au plus.
- Sans projection, la fenêtre ne change pas.
- Libellés : date de début, « Auj. » à sa position réelle, date de fin. Un libellé de bord à moins de 16 % de la largeur de « Auj. » est masqué (`axisLabels`).
- Le trait vertical d'aujourd'hui est toujours dessiné, discret.

**1b, « Auj. » et la projection depuis aujourd'hui.**
- Le jour 0 de la projection est aujourd'hui.
- Le décalage vertical d'affichage existant est gardé tel quel. La projection est donc translatée pour partir de la hauteur du dernier point de tendance, et le raccord en pointillés du dernier point à aujourd'hui est horizontal.
- Écart corrigé, en jours, entre le dernier point de tendance et aujourd'hui [mesuré, `profiles-chart.json`] :
  - 0 à 3 jours sur les profils qui ont une projection (3 jours sur le profil 15, 2 sur le profil 14, 1 sur les profils 1, 2 et 4) ;
  - 22 jours (profil 8) et 10 jours (profil 16) sur les profils sans projection (D3), où « Auj. » restait jusqu'ici sur la dernière pesée.

**1c, projection jour par jour.**
- `ProjectionInput.sampleEveryDays`, optionnel, ne sert qu'aux trois trajectoires dessinées (centrale et bornes 80 %).
- La recherche du jour d'arrivée garde l'échantillonnage par défaut, et elle s'arrête au jour près de toute façon [lu]. `daysToTarget`, les semaines annoncées et l'horizon ne changent donc pas : c'est testé, et les échantillons hebdomadaires sont identiques au bit près dans la trajectoire quotidienne.
- Seul `trackingChart` passe 1.
- La baisse plus forte de la première semaine (glycogène) reste dessinée. Avec le solveur de production, qui part de l'état modélisé du jour, elle n'apparaît qu'après un départ récent, pas sur un suivi déjà long : je n'en ai donc pas fait un test général [déduit].
- **Écart d'arrivée** [mesuré, `profiles-chart.json`] :
  - entre le jour d'arrivée (arrêt quotidien du modèle, celui que le graphique dessine désormais) et le croisement de la cible par l'ancienne polyligne hebdomadaire : de 0,1 à 0,8 jour, sur les 13 profils dont la projection du jour atteint la cible ;
  - entre le jour d'arrivée dessiné et celui qu'annonce le plan (date de création + semaines × 7) : de −57 à +14 jours, sur les 6 profils où l'arrivée est dessinée. Cet écart ne vient pas de l'échantillonnage : la projection du jour repart de l'estimation et du poids actuels, celle du plan de leur valeur à sa création [déduit].
- **Coût de `trackingChart`** sur un an de pesées quotidiennes (médiane de 30 appels, Node, PC, priorité basse) [mesuré] : « Ce mois-ci » 11,9 → 12,3 ms (4 → 31 points de projection), « Tout » 11,8 → 11,9 ms (18 → 195 points).

**1d, pause visible.**
- Les pauses viennent de `trackingPauses` telles quelles, coupées à la fenêtre.
- La ligne de tendance et l'aire sous elle sont interrompues sur une pause (`splitAtPauses`), sous une bande grise sans texte ; les pesées restent des points.

**1e, accessibilité.** Le résumé dit la fenêtre, puis les pesées et la tendance, chaque pause, et où mène la projection (« poids cible atteint vers le … », ou le poids à la fin de la fenêtre). Exemple sur le profil 15 : « Du 21 octobre au 20 décembre : 26 pesées, tendance de 73,1 à 71,9 kg, pause du suivi du 2 octobre au 23 octobre, projection du plan : 70,4 kg le 20 décembre. » [mesuré, navigateur].

**1f, redessins.**
- La géométrie et le dessin dépendent d'une clé de contenu (`JSON.stringify` des séries), plus de l'identité des tableaux.
- Volet du navigateur masqué, donc sans images d'animation. J'ai compté les relances du dessin, chacune réaffectant `canvas.width` [mesuré, profil 15] :
  - `292d617` : 1 relance par entrée sur Suivi, et 5 relances pour 5 écritures du store pendant qu'on regarde Suivi (une par entrée du journal d'activité) ;
  - branche : 1 par entrée, et 0 pour ces 5 écritures.
- Volet visible : 29 effacements du canvas par entrée sur Suivi, soit un seul dessin progressif de 900 ms [mesuré]. Les 163 du rapport 48 venaient de ces relances [déduit].

**Fichiers** : `src/domain/{chartScale,views,format}.ts`, `src/science/goals.ts` (paramètre optionnel seulement), `src/components/WeightChart.tsx`, `src/screens/Tracking.tsx`.

**Tests** : `trackingChart.test.ts` réécrit. Les tests de la part fixe de 30 % sont remplacés par ceux de la nouvelle règle, avec la raison écrite en tête du fichier. 19 tests.

**Captures** : 0 différence contre `292d617` [mesuré].

### Point 2 : la première recalibration (E2)

**Parcours où la recalibration passe par l'écran** [lu] :
- **cible supposée tenue** : l'écran ; c'est le parcours visé ;
- **cible alignée** : l'écran aussi, à partir de 7 jours après l'alignement (`currentMethodMaySurface`) ;
- **habitude mesurée** : jamais d'écran, son évaluation hebdomadaire le remplace (`surfaced` reste faux) ;
- **cible personnelle** : la reprise automatique, sans écran (2b).

**2a.**
- `firstRecalibrationShown` : recalibration proposée, un candidat, aucune recalibration appliquée, hors cible personnelle.
- `firstRecalibrationAutoOpenDue` ajoute deux conditions : `meta.firstRecalibrationOpenedOn` à `null`, et la calibration calculée pour le store en cours.
- Dans `App.tsx`, la décision est armée au démarrage et à chaque retour au premier plan, puis prise une fois, dès que la calibration est prête et l'écran d'accueil passé.
- Si l'onboarding, une feuille ou un écran de décision est affiché à ce moment, elle attend l'ouverture suivante. Les écrans de décision sont recalibration, objectif atteint, suppression et onboarding (`autoOpenAllowed`, pur, testé).
- L'écran est empilé au-dessus de la page affichée (`openAuto`). La date est écrite à l'ouverture, répondue ou non.
- Schéma 12, migration 11 → 12 à `null`.

**2b.** Pas d'écran sur une cible personnelle : la reprise et son message court, inchangés (profil 13) [mesuré, navigateur].

**2c.**
- Sur l'écran ouvert de lui-même (`autoOpened`, retenu tant que cet écran reste affiché), ni l'ouverture ni « Plus tard » n'appellent `markRecalibrationSeen`.
- Rouvert par l'utilisateur, la règle actuelle s'applique : marquée vue à l'ouverture. « Appliquer » est inchangé.
- Le seuil de 05 s12 ne change pas.

**2d, rapporté sans corriger** [mesuré, test « 2d »]. Inscription il y a 28 jours, sans historique de départ, une pesée et « Plan respecté » par jour :
- **Jour J** : la première recalibration devient prête le jour où le recalcul périodique est dû. Le recalcul attend (`periodicReplanDeferredOn` = J).
- **J + 1** : le recalcul s'exécute dans son cycle. Sans recalibration appliquée, il finit en `no_snapshot` : le plan ne change pas, la date de contrôle passe à J + 1, et le prochain recalcul est dû 28 jours plus tard.
- **J + 1 à J + 3** : la première recalibration reste proposée, puisqu'elle n'est jamais marquée vue.

Avec un historique de départ appliqué (warm start), le recalcul de J + 1 reconstruirait le plan à partir de cette estimation : deux changements à un jour d'écart, puis un troisième si la recalibration est appliquée ensuite [déduit, non mesuré].

**Journal d'activité** : `screen_opened` et `later` portent `auto: true` [mesuré, navigateur].

**Fichiers** :
- `src/domain/{firstRecalibration,types}.ts` ;
- `src/persistence/{schema,migrations}.ts` ;
- `src/app/{App.tsx,navModel.ts,navigation.tsx}`, `src/screens/Tracking.tsx`.

**Tests** : 9. Schéma et migration, ouverture unique, recalibrations suivantes, cible personnelle, « Plus tard », navigation, journal, 2d. Plus la migration 11 → 12 sur tous les profils (4.6). Tests existants adaptés au schéma 12, chaque fois avec la raison : `pass5bFix2`, `pass6a`, `uxPass1`, `foodJournalPersistence`.

**Captures** : 14 différences, toutes de schéma : `schemaVersion` 11 → 12 (7) et `meta.firstRecalibrationOpenedOn` ajoutée à `null` (7) [mesuré].

### Point 3 : l'historique des changements du plan (E3)

**Règles retenues**, entrées `applied` qui portent un plan `after` [lu, testé règle par règle] :

| Règle | Cause affichée |
|---|---|
| `onboarding` | Ton premier plan |
| `recalibration` | Mise à jour avec tes pesées |
| `recalibration_maintenance` | Mise à jour avec tes pesées, passage en maintien |
| `user_goal` | Tu as changé de vitesse ou d'objectif |
| `user_slider` | Tu as ajusté l'équilibre manger / marcher |
| `user_profile` | Tu as modifié tes informations |
| `periodic_replan` | Recalcul régulier |
| `G1` | Sécurité : IMC 20 |
| `G2` | Sécurité : vitesse ramenée au maximum |
| `personal_target_set` | Tu as choisi ta cible |
| `personal_target_takeover` | Ta cible, reprise après tes pesées |
| `personal_target_return` (point 4) | Retour au plan de Wheighty |
| `journal_switch` | Cible alignée sur ton journal |
| `journal_measured_enter` | Plan calé sur ton journal |
| `journal_measured_update` | Plan mis à jour avec ton journal |
| `recalibration` reconstituée (`backfilled`) | Recalibration (détails non conservés) |

**Écartées :**
- toute entrée `failed` ;
- `journal_measured_offer`, qui porte le plan proposé, pas appliqué ;
- `journal_measured_exit` et `target_bmi_20`, qui changent le plan sans garder le plan après ;
- `underweight_bmi`, `underweight_decline`, `journal_proposal_declined`, `journal_log_more`, `journal_weigh_daily` et `journal_offer_declined`, qui ne changent pas le plan.

Chaque entrée affiche la date (avec l'année si ce n'est pas l'année en cours), la cible avant → après en kcal par jour (la cible seule pour le premier plan) et la cause. Derrière « Détails » : le maintien avant → après (celui de la trace d'une recalibration, sinon ceux des plans) et la vitesse avant → après. La plus récente est en haut. Page vide : « Ton plan n'a pas encore changé. »

**Profil 14** [mesuré, navigateur] :

| Date | Cible | Cause |
|---|---|---|
| 20 novembre | 1 870 → 1 850 kcal | Recalcul régulier |
| 21 octobre | 2 130 → 1 870 kcal | Tu as changé de vitesse ou d'objectif (détails : maintien 2 720 → 2 710 kcal, vitesse 0,5 % → 0,75 % par semaine) |
| 16 octobre | 1 920 → 2 130 kcal | Mise à jour avec tes pesées |
| 2 octobre | | Recalibration (détails non conservés) |
| 11 septembre | 1 810 kcal | Ton premier plan |

La page tient dans 375 px (bord droit des cibles à 351 px).

**Fichiers** : `src/domain/{planHistory,planMessages}.ts`, `src/screens/{PlanHistory,Plan}.tsx`, `src/app/{App.tsx,navModel.ts,copy.ts}`.

**Tests** : 3.

**Captures** : rien de nouveau.

### Point 4 : « Revenir au plan de Wheighty » (E4)

**La fonction existante ne s'y prêtait pas telle quelle** [lu] :
- `computePersonalTakeover` exige une recalibration proposée (`personalTakeoverDue`) ;
- elle enregistre un nouveau snapshot appliqué, puisque c'est elle qui applique l'estimation.

Ses étapes 2 à 4 (vitesse que donne la cible, ramenée dans les limites par `goalRateOf`, puis plan de la méthode habituelle aux pas du plan en vigueur) sont déplacées dans `appPlanOfPersonalTarget`. La reprise l'appelle comme avant : même résultat au bit près, vérifié par la fixture de la passe UX 2 (6 reprises) et les tests de la 5b. Le retour l'appelle sur l'estimation en vigueur, sans nouveau snapshot. Aucune autre règle n'est inventée.

Ce que dit le prompt (« vitesse actuelle du profil ramenée à une vitesse valide ») et ce que fait la reprise (la vitesse que donne la cible, lue sur l'estimation, ramenée dans les limites) diffèrent un peu. J'ai suivi la reprise. Les deux coïncident tant que le contexte n'a pas bougé depuis le choix de la cible [déduit].

**Équivalence avec la reprise** (testée) : avec l'estimation de la reprise déjà appliquée, le retour donne le plan de la reprise, champ par champ, sauf la source.

**Source `initial`**, comme un plan demandé par l'utilisateur (changement d'objectif).

**Nom de la règle : `personal_target_return`.** Il va avec `personal_target_set` et `personal_target_takeover`, et garde le détail de la cible (kcal, vitesse lue, cas). Il est distinct de la reprise : pas de nouvelle estimation, et un geste de l'utilisateur.

**Aperçu** : « Ton plan passerait de A à B kcal par jour. », la vitesse, puis « Confirmer » et « Annuler ». Un refus de construction affiche la raison.

**Après confirmation** :
- la cible personnelle prend fin ;
- `periodicReplanDue` est faux à J + 27 et vrai à J + 28, et G2 s'applique de nouveau (source non personnelle) ;
- une entrée de trace sans message.

**Profil 16** [mesuré, navigateur] : « Ton plan passerait de 1 700 à 1 700 kcal par jour. Vitesse : 0,6 % par semaine. ». Confirmé : 1 704,4 kcal, source `initial`, cas `within`. Avant toute recalibration, la vitesse est lue sur la cible elle-même : le retour change donc peu [déduit].

**Fichiers** : `src/domain/{personalTarget,planChange,planMessages,planHistory,planSafety,types}.ts`, `src/screens/PlanChangeSheet.tsx`.

**Tests** : 3, plus le test des options de la passe UX 2 adapté (une troisième option sur une cible personnelle).

### Point 5 : se peser d'abord (E5)

- `weighFirstInvitation` : âge de la dernière pesée valide strictement supérieur à 7 jours, ou aucune pesée (même lecture que D3).
- L'invitation remplace les choix de la feuille jusqu'à ce que l'utilisateur appuie sur un bouton :
  - « Me peser d'abord » ouvre la saisie de pesée, puis revient à la feuille d'origine une fois la pesée enregistrée (`weighThen`, `weighSaved`) ;
  - « Continuer » affiche les choix.
- Elle concerne les feuilles « Changer de plan » et objectif / vitesse.
- Journal : `weigh_first` avec `shown` (et l'âge de la pesée), `weigh` ou `continue`.
- Titre de 3 mots ; ligne de 80 caractères au plus.

**Cas réel du rapport 49** (24/10, 0,5 %/semaine) [mesuré, `ux3/realCaseE5`, données non commitées] :
- **Ce que voit l'utilisateur** : « Pèse-toi d'abord ? Dernière pesée il y a 22 jours : ton nouveau plan partira de ton poids du jour. »
- **« Continuer »** : 1 586 kcal, projection partant de 65,73 kg (la perte fantôme du rapport 49), environ 20 semaines.
- **« Me peser d'abord »**, avec la pesée de 67,6 kg du 25/10 saisie le 24/10 : 1 573 kcal, projection partant de 67,6 kg, environ 27 semaines.

**Profil 16 au navigateur** [mesuré] :
- l'invitation s'affiche ; « Me peser d'abord », pesée de 73,9 kg, puis retour au choix sans invitation ;
- la pesée a levé D3, et la reprise automatique a aussitôt remplacé la cible personnelle (règle existante) : l'option « Revenir » n'est donc plus proposée ;
- sur la feuille d'objectif, « Continuer » affiche le contenu habituel.

**Fichiers** : `src/domain/weighFirst.ts`, `src/components/WeighFirst.tsx`, `src/screens/{PlanChangeSheet,Account,DailySheets}.tsx`, `src/app/navigation.tsx`.

**Tests** : 3.

### Point 6 : textes (E6)

**6a. Les textes « première » du code** [lu] :

| Texte | Juste ? |
|---|---|
| « L'app l'ajustera à ta première recalibration » (cible personnelle) | faux après une recalibration : « prochaine » |
| « Vitesse modifiable après la première recalibration » (cible alignée) | faux après une recalibration appliquée avant l'alignement : « prochaine » |
| « Après la première recalibration » (échéance de la cible alignée) | même cas : « prochaine » |
| « Progression vers la première recalibration » (Analyse) | juste : seulement dans la mise en page non recalibrée (D2) |
| `todayStatusTitle` « la première mise à jour » | juste : déjà « prochaine » après une recalibration (D2) |
| « … pour qu'un premier ajustement soit fiable » (feuille « Comment Wheighty apprend ») | juste : remplacé par `nextAdjustment` après une recalibration (D2) |
| « … jusqu'à la première recalibration » (détails de « Pourquoi ce résultat ? ») | juste : n'apparaît que sans évidence personnelle |
| « première estimation » (onboarding, historique de départ) | juste : onboarding |
| « Les premiers jours, la balance descend plus vite » | sans rapport avec la recalibration |
| « Ton premier plan » (historique) | juste |

**6b.** Le reste du jour d'Aujourd'hui est formaté comme la cible (`formatKcal`, arrondi à 10). Profil 13 : « 1 690 » et « 1 690 kcal restantes », contre « 1 689 » avant [mesuré, navigateur].

**6c.** Porte atteinte et dernière pesée de plus de 7 jours : la ligne dit « Ton plan attend une pesée. », le titre du message D3, au lieu de « Ton estimation suit tes pesées. » (profil 8, testé).

**6d.** Diagnostic du profil 3 [mesuré] :
- **les deux états sont vrais** :
  - côté recalibration : méthode alignée depuis 21 jours, porte atteinte (36 pesées, couverture 97 %), maintien proposé 2 194 contre 2 330 kcal, donc une recalibration proposée ;
  - côté journal : l'évaluation hebdomadaire a proposé un premier plan de l'habitude mesurée.
- **changement** : tant qu'une recalibration est proposée, les cartes de décision du parcours journal (offre et proposition d'alignement) attendent, sans réponse (`journalCardsWait`). Elles reviennent une fois la recalibration appliquée ou plus proposée (testé).
- **conséquence sur le point 2** : la condition qui faisait attendre l'ouverture automatique devant ces cartes est retirée, puisqu'aucune n'est affichée pendant une recalibration proposée.
- **profil 3 au navigateur** : l'écran s'ouvre de lui-même ; après « Plus tard », Aujourd'hui affiche « Une recalibration est prête. » sans la carte « Plan calé sur ton journal » [mesuré].

**6e.** Plus aucune phrase ne présente l'écart entre les deux maintiens comme une correction. Chaque maintien est donné avec son poids :
- **texte long de la reprise** : « Au départ : 2 330 kcal à 75,0 kg. Aujourd'hui : 2 380 kcal à 73,7 kg. À partir de maintenant, l'app ajuste ta cible pour tenir ce rythme. » ; « Tes pesées montrent… (estimation de départ : …) » est retiré ;
- **Analyse** : la même ligne, dans l'unité de l'utilisateur, à la place de « +X kcal depuis l'estimation initiale » [mesuré, navigateur, profil 13].

Le poids d'aujourd'hui est le poids de tendance quand la calibration du jour est affichée, sinon celui du plan en vigueur, ce qui correspond au maintien affiché. Rien n'est calculé de nouveau.

**Fichiers** :
- `src/domain/{planMessages,personalTarget,journalPath,views,firstRecalibration}.ts` ;
- `src/components/JournalCards.tsx`, `src/screens/{Plan,Today,Tracking}.tsx`, `src/app/App.tsx`.

**Tests** : 5, plus deux tests existants adaptés, chaque fois avec la raison :
- `pass5bFix` : l'échéance est maintenant une fonction ;
- `uxPass2` : le texte de la reprise est masqué des deux côtés dans la fixture ; tout le reste y reste comparé au bit près.

### Point 7 : défauts du rapport 48 (E7)

Les points 1 à 6 étant faits et vérifiés, les deux défauts sont traités :
- **onboarding** : une étape qui avance (`setDraft` qui change l'étape) prend la transition `push`. Mesure au navigateur : après le bouton retour (`pop`), « Continuer » joue `push`, contre `pop` au rapport 48 [mesuré, navigateur].
- **feuilles** : le focus initial va au dialogue (`role="dialog"`, `tabIndex = -1`), plus à son premier contrôle, la poignée. Elle n'a plus de contour orange à l'ouverture ; Tab l'atteint comme avant [mesuré, navigateur].

**Tests** : 2, statiques.

## 4. Arrêts

Aucune règle d'arrêt n'a joué [mesuré] :
- T-03, T-04 et golden sont à 0 différence à chaque commit ;
- toutes les différences de R, S et parcours sont attribuées au schéma 12 ;
- aucune sortie scientifique ne change ;
- aucun plancher ni aucune vitesse n'est violé (testé sur le retour au plan) ;
- G1 et G2 sont inchangés ;
- la migration ne perd rien (tous les profils) ;
- équivalence : section 5.2.

## 5. Vérifications

### 5.1 Captures

Base : `292d617` capturé dans un worktree, en priorité basse. Il est identique au bit près à la capture finale de la 6a (2 523 073 valeurs) [mesuré]. Chaque commit de point a été capturé ensuite, et chaque différence classée une à une par `classifyCaptures.mjs` [mesuré].

| Commit | T-03 (1 003 779) | T-04 (1 497 006) | golden (3 041) | R, S et parcours |
|---|---|---|---|---|
| point 1 | 0 | 0 | 0 | 0 |
| points 2 à 7 | 0 | 0 | 0 | 14 : `schemaVersion` 11 → 12 (R et S : 4, parcours : 3), `meta.firstRecalibrationOpenedOn` ajoutée à `null` (4 + 3) |

### 5.2 Équivalence de la 5b

Méthode des rapports 45 à 49, une seule fois, sur le code final (`8b73a31`). 8 parties en priorité basse, en deux séries de quatre, puis la fusion [mesuré] :
- **0 échec** sur 17 275 appels (400 utilisateurs, dont 323 basculent) ;
- tolérances : 0 pesée manquée et 0 jour non exploitable sur 6 460 évaluations ; adhérence déduite : 0 jour ;
- contrôles négatifs : 80 sur 80 diffèrent ;
- 2 031 s de rejeu au total (210 à 288 s par partie).

Le harnais appelle les fonctions du domaine. Aucune de cette passe n'y change de sortie : le paramètre optionnel de `projectPlan` y est absent, et le retour au plan comme l'invitation à se peser n'y sont pas exercés [lu].

### 5.3 Tests

737 tests au départ, **767** à la fin, tous verts ; `npm run check` est propre [mesuré].
- Ajoutés : 26 dans `tests/domain/uxPass3.test.ts`, un bloc par point et l'aller-retour.
- `trackingChart.test.ts` est réécrit (19 tests).
- Huit tests existants, dans six fichiers, sont adaptés, chaque fois avec la raison écrite dans le test : `pass5bFix2` (2), `uxPass2` (2), `pass6a`, `uxPass1`, `foodJournalPersistence`, `pass5bFix`.

Chaque lancement complet réécrit `tests/domain/__snapshots__/warmStartReferenceCases.test.ts.snap` en fins de ligne LF, sans changer son contenu. Il est remis en l'état avant chaque commit et n'est jamais commité [mesuré].

### 5.4 Build et hors ligne

- `npm run build` sans erreur ; 31 fichiers en précache (1 595,6 → 1 608,4 Kio) [mesuré].
- Bundle principal : 670,0 kB (202,4 kB compressé) à `292d617`, 682,3 kB (206,1 kB) sur la branche [mesuré].
- `dist/` servi sous `/wheighty/` [mesuré, navigateur] :
  - service worker actif ;
  - serveur arrêté, une requête hors cache échoue ;
  - la page rechargée est servie par le service worker.

### 5.5 Navigateur, à 375 px

Serveur de dev, profils régénérés pour le 20/11 [mesuré, navigateur]. Le volet du navigateur était souvent masqué : j'ai piloté par le DOM et lu le texte affiché, et les captures d'écran prises là y sont rognées.

| Profil | Ce qu'on voit |
|---|---|
| 12, première recalibration | l'écran s'ouvre au chargement (`screen_opened` avec `auto`) ; « Plus tard » : la carte reste dans Analyse, « Une recalibration est prête. » sur Aujourd'hui, rien n'est marqué vu ; au rechargement, l'écran ne se rouvre pas ; rouvert depuis Analyse, il est marqué vu |
| 13, cible personnelle | pas d'écran ; « Ta cible, recalibrée / À 1 690 kcal, tu perds 0,65 % par semaine. » ; « Détails » : les deux maintiens avec leur poids |
| 14, historique | les cinq entrées de la section 3 |
| 15, pause et projection | « Ce mois-ci » : bande grise du 21 au 23 octobre, « Auj. » au milieu, raccord, projection quotidienne jusqu'au 20 décembre ; « Tout » : du 11 septembre au 4 mai, « Auj. » à 30,8 %, les deux périodes séparées par la bande |
| 16, pesée ancienne | invitation à l'ouverture de « Je souhaite changer de plan » ; option « Revenir » et son aperçu |

- **Console** : des erreurs pendant les rechargements à chaud qui ont suivi mes modifications. Le serveur de dev avait gardé des versions intermédiaires de fichiers écrits en plusieurs passes ; elles ont disparu après un redémarrage et des rechargements complets. Aucune erreur sur le parcours final [mesuré].
- **Point 1f** : voir la section 3.

### 5.6 Export

- **Aller-retour export, import, export** sur les profils 12 à 16 (test commité) : le store revient identique, hors `productSearchEnabled`, que l'import remet à faux comme toujours [mesuré].
- **Migration 11 → 12** sur un export de chacun des 17 profils de vérification (1 à 16, avec les deux profils numérotés 8) : sans perte, store identique au champ près (test commité) [mesuré].

## 6. Choix faits sans consigne

1. **Point marquant la tendance** : le point coloré reste sur le dernier point de tendance, qui est le poids affiché en grand au-dessus. « Auj. », le trait vertical et le départ de la projection sont sur aujourd'hui.
2. **« Tout » sans projection** (apprentissage, D3) : 30 jours après aujourd'hui, comme en maintien.
3. **Libellés de bord** : masqués à moins de 16 % de la largeur de « Auj. » pour ne pas le chevaucher.
4. **Pause commencée avant la fenêtre** : bande coupée au bord gauche ; une pause terminée avant la fenêtre n'est pas montrée.
5. **Première recalibration, moment de la décision** :
   - décidée une fois par ouverture, après l'écran d'accueil, dès que la calibration du store en cours est prête ;
   - « Plus tard » mène à Analyse, comme avant ;
   - les écrans de décision sont recalibration, objectif atteint, suppression et onboarding.
6. **Retour au plan** : source `initial`, règle `personal_target_return` (section 3). Le calcul suit la reprise, pas la lecture littérale « vitesse actuelle du profil ».
7. **Se peser d'abord** : l'invitation remplace les choix jusqu'à « Continuer ». Le retour à la feuille ne se fait qu'après une pesée enregistrée ; fermée sans pesée, la feuille reste fermée.
8. **Historique** : textes des causes non donnés par le prompt (tableau de la section 3) ; année affichée hors année en cours ; « Détails » seulement quand la trace garde les plans.
9. **6d** : la règle « la recalibration d'abord » vaut aussi pour la proposition d'alignement automatique, pas seulement pour l'offre de l'habitude mesurée.
10. **6e** : le poids d'aujourd'hui est celui qui correspond au maintien affiché (tendance si la calibration du jour est affichée, sinon le poids du plan).
11. **Point 7** : le focus initial va au dialogue plutôt que de masquer le contour de focus, qui reste visible au clavier.

## 7. Défauts vus hors périmètre, non corrigés

1. **Projections qui n'arrivent pas** : sur 4 profils (2, 3, 5, 11), la projection du jour n'atteint pas le poids cible en 730 jours, alors que Plan annonce une échéance (« ~N sem. »). « Tout » s'arrête donc à 30 jours [mesuré, `profiles-chart.json`]. La cause n'est pas cherchée : probablement l'estimation actuelle, plus basse que celle du plan, pour une cible inchangée [déduit].
2. **Offre périmée** : `applyRecalibration` n'efface pas une offre de l'habitude mesurée en attente (`journalPath.offer`), contrairement à un changement d'objectif [lu]. Avec 6d, l'offre calculée pour le plan d'avant reviendra après la recalibration [déduit].
3. **Journal alimentaire** : il affiche encore le reste du jour à l'unité [lu]. 6b ne visait qu'Aujourd'hui.
4. **« au-delà de la cible »** : sur Aujourd'hui, ce montant reste à l'unité [lu].
5. **Profil 16** : une pesée faite depuis « Me peser d'abord » peut déclencher aussitôt la reprise de la cible personnelle (D3 levé). L'option « Revenir » disparaît alors du choix d'où l'on venait [mesuré]. C'est la règle de la 6a ; à juger côté produit.
6. **Défaut n° 4 du rapport 49** (`commit` d'un store calculé au rendu) et mise à jour de `deploy.yml` : réservés à une passe technique, non touchés.

## 8. Vérification pour John (20 minutes au plus)

```
git switch ux/pass-3
npm run verification:profils
npm run dev
```

`npm run verification:profils` réécrit les fichiers suivis de `docs/verification-5b/` et crée les profils 8 à 16. Avant de changer de branche : `git restore docs/verification-5b`, puis supprime les fichiers `8-pause-sans-pesee.json`, `9-…` à `16-…`.

Pour charger un profil, dans la console du navigateur : `fetch('/docs/verification-5b/<profil>.json').then(r => r.json()).then(j => { localStorage.setItem('wheighty:store', JSON.stringify(j.store)); location.reload(); })`.

1. **`15-pause-et-projection`**, Suivi :
   - « Ce mois-ci » : « Auj. » au milieu, une bande grise à gauche, un pointillé du dernier point à « Auj. », puis la projection ;
   - « Tout » : la tendance coupée par la bande grise, et la projection jusqu'au 4 mai.
2. **`12-premiere-recalibration`** :
   - au chargement, l'écran « Recalibration » s'ouvre seul ;
   - « Plus tard » : Analyse montre la carte « Une recalibration est prête » ;
   - recharge : l'écran ne revient pas.
3. **`13-cible-personnelle-recalibration`** : pas d'écran ; « Ta cible, recalibrée » ; « Détails » : « Au départ : … à 75,0 kg. Aujourd'hui : … » ; Aujourd'hui : « 1 690 » et « 1 690 kcal restantes ».
4. **`14-historique-du-plan`** : Plan, « Historique de mon plan » : cinq entrées, la plus récente en haut, une « Recalibration (détails non conservés) ».
5. **`16-pesee-ancienne-changement`** :
   - Plan, « Je souhaite changer de plan » : « Pèse-toi d'abord ? » ;
   - « Continuer » : trois cartes ; « Revenir au plan de Wheighty » : l'aperçu et « Confirmer ».
6. **Point 7** : une feuille s'ouvre sans contour orange sur sa poignée.

Sur l'iPhone, après déploiement seulement :
- **Retour au premier plan** : après avoir quitté l'app (profil d'un nouveau compte qui atteint sa première recalibration), l'écran s'ouvre au retour.
- **Glissements** sur le graphique « Tout » d'un long historique : le dessin ne repart pas quand on revient sur Suivi par un glissement.
- **Feuilles** : la poignée sans contour au toucher.

Ensuite, si tout va bien, dis-le-moi. Je fusionne (`git merge --no-ff ux/pass-3` dans `main`), je relance `npm run check`, et je te donne les commandes d'envoi :

```
git push origin main
```

## 9. Mises à jour de `IMPLEMENTATION_NOTES.md`

- **En-tête** : schéma 12, migration 11 → 12 (D-43) ; section 13.
- **A-03** : la règle horizontale est marquée remplacée par D-42.
- **Nouvelles entrées** :
  - D-42 : graphique de Suivi ;
  - D-43 : première recalibration, schéma 12 ;
  - D-44 : historique du plan ;
  - D-45 : retour au plan ;
  - D-46 : se peser d'abord ;
  - D-47 : textes ;
  - D-48 : défauts du rapport 48.
- **Section 13** : passe UX 3, écrans seulement, modèle 1.9.0 inchangé.
- **Rien sur la science**, hormis le paramètre optionnel `sampleEveryDays` de `projectPlan`, sans effet quand il est absent.
