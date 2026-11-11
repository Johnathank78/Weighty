# 49. Prompt 6a : les pauses de suivi et le cycle de vie de la recalibration

Date : 11/11/2026. Branche `prod/6a-pauses`, partie de `71bc77e`, non fusionnée, non envoyée. Marquage : [lu] lu dans un fichier ou une sortie, [mesuré] obtenu en lançant une commande ou dans le navigateur, [déduit] conclusion tirée des deux.

## 1. Pour John, en 10 lignes

1. L'export passe au format 2, avec le build, l'appareil et un bloc de diagnostic complet. Un journal d'activité de 5 000 entrées et la trace de tous les changements de plan entrent dans le schéma 11, sans perte [mesuré].
2. Après une recalibration, Analyse, Suivi et Aujourd'hui ne reviennent plus jamais à « première recalibration » [mesuré, navigateur].
3. Un jour saisi à plus de 25 % sous la cible n'est plus déduit « écart important » ; il reste non noté. Le modèle passe en 1.9.0 [mesuré].
4. Sans pesée depuis plus de 7 jours, rien ne met le plan à jour tout seul et Suivi ne projette rien. « Ton plan attend une pesée » s'affiche à la place [mesuré, navigateur].
5. Quand une recalibration est prête le jour où le recalcul périodique est dû, celui-ci attend : un seul changement par jour [mesuré, navigateur].
6. La porte compte depuis la dernière pause (deux pesées à 15 jours ou plus). Sur ton cas réel, elle compte 1 pesée après la pesée de retour [mesuré].
7. Amendement 8 : la variante A (un niveau par période de suivi) est retenue, GO sur V1 à V5. Elle est activée dans un commit séparé, le modèle reste en 1.9.0 [mesuré].
8. Rejoué avec ce code, le 24/10 n'aurait rien changé au plan : porte fermée, recalcul retenu par D3, message de pesée affiché [mesuré].
9. Captures : T-03, T-04 et golden sont identiques au bit près ; les autres différences sont toutes attribuées à une règle. Équivalence de la 5b : 0 échec sur 17 275 appels. 697 → 737 tests [mesuré].
10. À faire : ta vérification (section 9, 20 minutes), puis ton accord pour la fusion.

## 2. Git

Base vérifiée : `main` = `71bc77e` [mesuré]. Branche `prod/6a-pauses` créée depuis ce commit [mesuré].

| Commit | Contenu |
|---|---|
| `d733ba0` | point 1 : export format 2, diagnostics, journal d'activité, trace complète, schéma 11 |
| `e009de4` | point 2 : état « recalibré » (D2) |
| `a3f0853` | point 3 : pas d'écart important déduit sous la cible (D6), modèle 1.9.0 |
| `6ebe71f` | point 4 : pas de mise à jour automatique sans pesée récente (D3) |
| `a3ff54e` | point 5 : un seul changement de plan à la fois (D5) |
| `7a74e3b` | point 6 : porte par période de suivi (D4) |
| `db9d009` | point 7 : amendement 8, mot pour mot, seul, avant toute mesure |
| `fafee3c` | point 7 : variantes A et B derrière l'option, sur `'off'` |
| `863f313` | point 7 : scripts de mesure (bruts ignorés) |
| `ad1f4de` | profils de vérification 8 à 11 (6.5) |
| `aacdcd5` | point 5, correctif trouvé au navigateur : le recalcul attend toute la journée |
| `2856225` | point 1, correctif trouvé au navigateur : un commit calculé sur un store ancien garde le journal |
| `22957a6` | point 7 : variante A activée en production (GO) |
| `8423f6e` | `IMPLEMENTATION_NOTES.md` |
| ce rapport | rapport seul, en dernier |

- Les commits sont faits par chemins explicites. Le `.gitignore` n'est pas touché. Aucun brut, archive ni donnée réelle n'est commité : les bruts sont dans `tests/experiments-journal/results/6a/` et `results-6a.zip`, tous deux ignorés [mesuré].
- Chaque commit passe le typage seul, vérifié sur son arbre dans un worktree [mesuré]. `npm run check` a été lancé avant chaque commit de point [mesuré].
- Deux commits locaux (le correctif du point 5 et celui du point 1) ont été refaits avant tout envoi. Le premier embarquait des tests qui dépendaient des profils 8 à 11, alors pas encore commités. L'arbre n'a pas été touché (`git reset --soft`) [mesuré].
- Les fichiers suivis de `docs/verification-5b/` ont été régénérés pour mes vérifications ; ils ne sont pas commités (section 9).

## 3. Les points

### Point 1 : export complet et journal d'activité (D1)

**Diagnostic.** L'export de 24/10 ne contenait que le store [lu]. La recalibration appliquée à 23:42:45 n'avait pas d'entrée dans `meta.planEvents`, parce qu'`applyRecalibration` n'écrivait rien dans la trace [lu].

**Changement.**
- **1a, format 2** : `app`, `device`, `store` et `diagnostics`.
  - Le build est injecté par `vite.config.ts` (`__WHEIGHTY_BUILD__`) : commit court, « + » si l'arbre est modifié, et date.
  - L'import lit les formats 1 et 2 et ignore `diagnostics`.
  - Le nom de fichier porte l'heure : `wheighty-2026-11-11-1157.json` [mesuré, navigateur].
- **1b, diagnostics** (`src/domain/diagnostics.ts`) : un bloc par rubrique du prompt, chacun protégé. Une erreur écrit son message et l'export continue (testé avec un état qui lève une erreur).
  - Les view-models des cinq sections sont calculés par les mêmes fonctions que les écrans.
  - Les nombres non finis sont gardés comme dans le sérialiseur des captures R et S.
  - La ligne d'état d'Aujourd'hui a été sortie de `Today.tsx` vers `todayStatusTitle` (views), pour être exportable.
- **1c, journal d'activité** (`src/domain/activityLog.ts`, `activityLog` dans le store) :
  - Plafond de 5 000 entrées ; les plus anciennes sortent, comptées dans `droppedCount`.
  - Seul `StoreProvider` écrit le journal, toujours sur le dernier store.
  - Les saisies sont journalisées par différence de store : pesées avant et après, adhérence avec sa source et la valeur précédente, pas, aliments par identifiant, date et kcal (jamais le nom), messages fermés, réglages, entrées de trace.
  - Le reste est écrit là où ça se passe : ouverture et retour au premier plan, changement de build, contrôles du jour (un résumé), résultat de calibration quand son résumé change, recalibration (prête, retenue par D3, écran ouvert, appliquée, en maintien, « Plus tard »), recalcul périodique (appliqué, échoué, sans snapshot, retenu, en attente), message affiché et « Détails », écrans de décision, import et export.
- **1d, trace complète, sans message** : règles `recalibration`, `recalibration_maintenance`, `onboarding`, `user_goal` (objectif ou vitesse), `user_slider` et `user_profile`, avec les plans avant et après.
  - Pour les recalibrations, la trace garde en plus les maintiens et les intervalles avant et après, et la calibration appliquée.
  - La cible personnelle avait déjà sa règle (`personal_target_set`).
- **1e, migration 10 → 11** :
  - Le journal démarre vide.
  - Chaque snapshot appliqué (hors warm start) reçoit une entrée `recalibration` marquée `backfilled`, plans et maintiens à `null`, placée après les entrées de son jour.
  - Aucune entrée n'est ajoutée pour un snapshot déjà tracé par une reprise de cible personnelle.

**Mesuré.**
- Export réel :
  - Aucune donnée perdue : profil, plan, pesées, journaux, snapshots, historique, journal alimentaire et `meta` hors trace sont identiques.
  - L'entrée existante est gardée, et une entrée `recalibration` ajoutée en position 2 (offset −301,8 kcal/j).
  - Aller-retour export, import, export : identique.
- Profils de vérification et store du schéma 7 (méthode du rapport 47) : sans perte (tests).
- **Tailles (1f)** :

| Mesure | Valeur |
|---|---|
| Export réel, format 1 | 121 842 octets |
| Le même, format 2 avec diagnostics | 213 431 octets (store 72 506, diagnostics 55 676, dont constantes 27 432 et loi a posteriori 14 343) |
| Journal après un an (15,5 entrées par jour supposées) | plafond atteint au jour 323 ; 5 000 entrées, 658 sorties ; 1 063 631 caractères |
| Écriture (validation + sérialisation), Node, PC | 5,0 ms avec un journal plein, 0,3 ms sans |
| Écriture (sérialisation + `setItem`), navigateur intégré | 1,7 ms pour un store de 931 115 caractères |
| Stockage local libre, navigateur intégré | au moins 20 M caractères (la borne de ma sonde) ; quota annoncé 6 268 Mo |

Le journal reste dans le store : le coût d'écriture mesuré ne justifiait pas une clé à part [déduit]. La limite de Safari (environ 5 Mo par origine) ne se mesure que sur l'iPhone (section 9).

**Fichiers** :
- `src/domain/{types,activityLog,diagnostics,engine,journalPath,planSafety,views}.ts` ;
- `src/persistence/{schema,migrations,exportImport}.ts`, `src/app/build.ts`, `vite.config.ts`, `src/store/StoreProvider.tsx` ;
- `src/screens/{Account,Today,Tracking}.tsx`, `src/components/{ShortNotice,PlanNotices,JournalCards}.tsx`, `src/app/App.tsx`.

**Tests** (`tests/domain/pass6a.test.ts`, bloc 1, 14 tests) : enveloppe, import des formats 1 et 2, bloc en erreur, plafond, différences journalisées, entrées de trace, migration (placement, `null`, schéma 7).

Tests existants adaptés, chaque fois avec la raison écrite dans le test :
- `pass5a` : l'entrée `onboarding`, et la migration du schéma 6 qui reçoit son entrée rétroactive ;
- `pass5bFix2` : schéma 11, l'entrée `onboarding` ;
- `uxPass2` : le curseur laisse maintenant une entrée `user_slider` ; la fixture de 1209d49 écarte les nouvelles règles et reste comparée au bit près ;
- `foodJournalPersistence` et `storage` : schéma 11 et format 2.

**Correctif trouvé au navigateur (`2856225`).** L'écran de recalibration fait un `commit` d'un store calculé à son rendu : l'entrée « écran ouvert » écrite juste avant se perdait. Le store commité garde maintenant le dernier journal [mesuré, navigateur].

### Point 2 : état « recalibré » (D2)

**Changement.**
- `hasAppliedRecalibration` : vrai s'il existe un snapshot appliqué hors warm start.
- **Analyse** : mise en page calibrée dès qu'une recalibration a été appliquée, avec l'estimation appliquée et sa confiance. Quand la porte est fermée s'y ajoute le bloc « Vers la prochaine mise à jour », avec les critères.
- **Suivi** : la projection reste dessinée.
- **Aujourd'hui** et feuille « Comment Wheighty apprend » : « prochaine mise à jour ».

Dans « Pourquoi ce résultat ? », aucun texte ne disait « première mise à jour » [lu] : rien à changer.

**Fichiers** : `src/domain/{engine,views}.ts`, `src/app/copy.ts`, `src/screens/{Tracking,WhySheet}.tsx`.

**Tests** : 4. Le même store, avec et sans le snapshot appliqué, donne les deux états ; avant toute recalibration, warm start compris, rien ne change.

**Captures** : 0 différence contre le point 1 [mesuré]. Les captures ne contiennent pas les view-models d'Analyse, de Suivi ni d'Aujourd'hui ; les différences de view-model sont listées par les tests :
- `analysisView` : `calibrated` passe de faux à vrai, et `nextUpdate` est présent ;
- `trackingChart` : `projectionPending` passe de vrai à faux, et la projection est dessinée ;
- `todayStatusTitle` : « première » devient « prochaine ».

Elles ne concernent que les stores qui ont une recalibration appliquée et une porte fermée.

### Point 3 : pas d'écart important déduit sous la cible (D6)

**Changement.**
- `adherenceFromJournal` renvoie `null` au-delà de 25 % sous la cible. Ni `deduceAdherenceFromJournal` ni `suggestedAdherence` n'écrivent ou ne proposent alors quoi que ce soit.
- Au-dessus de la cible : inchangé. Les adhérences déjà enregistrées ne sont jamais réécrites.
- Modèle 1.9.0.
- `src/domain/ruleSwitches.ts` : interrupteurs des règles D3 à D6, réservés aux tests.

**Cas réel** [mesuré] : sur les 10 jours déduits le 24/10, 4 ne le seraient plus :
- les 3 jours incomplets du 30/09 (885 kcal, 2 moments), du 01/10 (643 kcal, 2 moments) et du 02/10 (935 kcal, 4 moments) ;
- et aussi le 27/09 (1 137 kcal pour une cible de 1 560, soit −27 %, 11 moments).

La couverture de la fenêtre du 15/09 au 02/10 tombe à 6 jours sur 18 (33 %). La revue donnait 7 sur 18 en ne retirant que les 3 jours incomplets.

**Tests** : 3, plus 2 tests existants adaptés (`pass5b`, `pass5bFix` : 1 490 kcal pour 2 000 ne donne plus rien). Instantanés R et S : seule la version change.

**Captures** : +59 différences, toutes des chaînes de version 1.8.0 → 1.9.0 (`scientificModelVersion`, `modelVersion`, `storedPlanModelVersion`), le même compte qu'au rapport 48 [mesuré].

### Point 4 : pas de mise à jour automatique sans pesée récente (D3)

**Changement.** Nouvelle constante `AUTO_UPDATE_MAX_WEIGHIN_AGE_DAYS = 7` (`engineering_prior`). « Plus de 7 jours » se lit : âge de la dernière pesée valide strictement supérieur à 7. Une fois ce seuil dépassé :
- `periodicReplan` renvoie `blocked`, et la date de contrôle ne bouge pas ;
- l'état de calibration ne propose rien (`surfaced` faux, `blockedByStaleWeighIn` vrai), donc la reprise d'une cible personnelle attend ;
- `trackingChart` ne projette pas (`weighInNeeded`) et Suivi affiche « Pèse-toi pour voir où mène ton plan. » ;
- le message court « Ton plan attend une pesée » / « Pèse-toi : je mettrai ton plan à jour avec ton poids du jour. » s'affiche. Fermé, il revient le lendemain (`meta.staleWeighInNoticeClosedOn`) ; il disparaît avec la pesée.

Après la pesée suivante, ce qui était dû s'exécute aussitôt (`runWeighInChecks`, sous D5). G1, G2, l'alerte de sous-poids, l'avertissement IMC 20 et les changements faits par l'utilisateur ne sont pas touchés (testé).

**Rapporté sans corriger : un changement fait par l'utilisateur après plus de 7 jours sans pesée** [mesuré]. Sur ton cas réel, le 24/10, choisir 0,5 %/semaine construit un plan à 1 586 kcal. Sa projection part du poids modélisé de 65,73 kg, alors que la tendance est à 67,61 kg : c'est la perte fantôme du 24/10. Elle ne disparaîtrait qu'avec le réancrage, une fois une pesée revenue.

**Tests** : 6, plus 3 tests existants de `pass5a` adaptés (une pesée récente ajoutée, sans laquelle rien ne s'applique) et l'ordre des messages dans `uxPass1`.

**Captures** : +14 différences, deux nouvelles clés (`meta.staleWeighInNoticeClosedOn` à `null`, `blockedByStaleWeighIn` à `false`). Aucune valeur ne change [mesuré].

### Point 5 : un seul changement de plan à la fois (D5)

**Mécanisme choisi.**
- Les contrôles du jour et ceux d'une pesée restent synchrones. Dans l'app, ils laissent le recalcul de côté (`periodic: 'after_calibration'`).
- `StoreProvider` l'exécute quand la calibration du jour revient de son worker, après la reprise éventuelle d'une cible personnelle, sur le store pour lequel elle a été calculée (même empreinte). C'est `periodicReplanUnderRules`.
- Si le worker échoue, le recalcul s'exécute sans état de calibration.
- Dans les tests et les simulateurs, il reste exécuté en ligne : l'état est calculé seulement quand le recalcul est dû.

**Règle.**
- Dû le jour où une recalibration est prête, le recalcul attend toute la journée (`meta.periodicReplanDeferredOn`), même si la recalibration est vue sans être appliquée.
- Il s'exécute dès le jour suivant de son cycle.
- Une recalibration appliquée reconstruit le plan, ce qui clôt le cycle.
- L'écran de recalibration montre le seul changement : « Ton plan quotidien passerait de A à B kcal. »

**Correctif trouvé au navigateur (`aacdcd5`).** Profil 11 : une fois l'écran ouvert, la recalibration est marquée vue et n'est plus proposée. Le recalcul en attente partait alors le jour même (1 710 → 1 670 kcal), avant la recalibration. Corrigé et testé [mesuré, navigateur].

**Tests de l'ordre** (4, plus 1 test statique adapté dans `pass5b`) :
- app fermée plusieurs jours ;
- pesée qui rend une recalibration prête ;
- reprise d'une cible personnelle ;
- sans recalibration prête, et l'interrupteur.

**Captures** : +7 différences, la clé `meta.periodicReplanDeferredOn` à `null` [mesuré].

### Point 6 : la porte compte la période de suivi en cours (D4)

**Changement.**
- Nouvelle constante `TRACKING_PAUSE_MIN_GAP_DAYS = 15` (`engineering_prior`) et fonction `trackingPauses`.
- `evaluateGate` ne compte que depuis la première pesée après la dernière pause, et renvoie `periodStart` et `pauses`.
- Tous les lecteurs de la porte de la méthode courante passent par `gateOf` : état de calibration, confiance du candidat, proposition de révision, jours restants de la cible alignée, explication, Analyse.
- La porte du journal (habitude mesurée) n'est pas concernée ; elle renvoie `pauses: []`.
- « Comptées depuis ta reprise du {date}. » s'affiche sous le bloc de progression d'Analyse (les deux mises en page) et d'Aujourd'hui.

**Mesuré.**
- Sans pause : la porte est identique au bit près sur 200 historiques aléatoires.
- Cas réel avec la pesée de 67,6 kg du 25/10 : 1 pesée, 0 jour, porte fermée, période depuis le 25/10, pause du 02/10 au 25/10.
- Différences de lecture : après une pause, la confiance du candidat est « faible » tant que la porte de la période est fermée, et la proposition de révision ne se déclenche pas (testé).

**Tests** : 4. Instantanés R et S : la nouvelle clé `resumedOn` (`null`).

**Captures** : +18 différences, les clés `gate.periodStart`, `gate.pauses` (vide) et `resumedOn` (`null`) [mesuré].

### Point 7 : réancrage après une pause (D7)

**Code** (`src/science/reanchor.ts`).
- Les variantes A et B sont écrites comme le prompt les définit.
- Seuls `fitCalibration` et `modeledBodyAt` sont branchés.
- Sans pause, ou avec `'off'`, c'est le code de 71bc77e, inchangé.
- Le régime « journal lu » ignore l'option.
- Pour la variante B, l'entrée de calibration porte `populationAt`, le maintien de population à un poids donné.

**Le régime « journal lu » peut-il être atteint par une pause ?** Oui en principe [déduit] : sa fenêtre part du premier jour de saisie continue, mais un utilisateur qui saisit sans se peser pendant 15 jours ou plus y crée une pause de pesées. Aucune règle ne l'a ici.

Mesure : section 4.

## 4. Amendement 8

**Déroulé.** L'amendement est commité seul (`db9d009`) avant toute mesure. Graines vérifiées avant la mesure :
- `createRng` lit `seed >>> 0`. Les graines effectives sont donc 1 805 032 704 à 1 805 122 803 (entraînement), 1 905 032 704 à 1 905 112 803 (validation) et 2 005 032 705 (bootstrap). Chaque utilisateur simulé garde la sienne.
- Les graines du dépôt, sur `main`, l'archive de banc et les autres branches, restent sous 4·10⁷ [mesuré].

**Monde simulé.** C'est celui de l'amendement (`tests/experiments-journal/sixa/amendment8.ts`), avec ces choix :
- première cible de production : 1 790 kcal ;
- pesée du jour 0 : celle de l'inscription (68 kg) ;
- pesées affichées au 0,1 kg ;
- pas non saisis ;
- maintien vrai : maintien de population au poids vrai de la veille de la pause, plus l'offset vrai ;
- retour : pesées de R à R + 14 inclus.

**Pilote** (cellule 4 : 22 jours, maintien vrai ; 10 répétitions) : 8,6 s de calcul. Projection pour la mesure complète : environ 15 minutes, très en dessous de 2 heures, donc l'entraînement garde 50 répétitions [mesuré]. Coût réel : 229 s (entraînement) et 571 s (validation) [mesuré].

**Entraînement et sélection** (50 répétitions par cellule ; m1 à R + 7, médiane en kg [IC 95 %]) [mesuré] :

| Cellule | A | B |
|---|---|---|
| 0 (15 j, cible) | 0,13 [0,10 ; 0,17] | 0,21 [0,16 ; 0,23] |
| 1 (15 j, maintien vrai) | 0,18 [0,13 ; 0,21] | 0,12 [0,07 ; 0,19] |
| 2 (15 j, cible − 300) | 0,14 [0,10 ; 0,22] | 0,18 [0,15 ; 0,27] |
| 3 (22 j, cible) | 0,13 [0,10 ; 0,17] | 0,14 [0,10 ; 0,19] |
| 4 (22 j, maintien vrai) | 0,18 [0,13 ; 0,24] | 0,16 [0,11 ; 0,21] |
| 5 (22 j, cible − 300) | 0,15 [0,10 ; 0,24] | 0,23 [0,15 ; 0,30] |
| 6 (35 j, cible) | 0,14 [0,09 ; 0,19] | 0,19 [0,13 ; 0,24] |
| 7 (35 j, maintien vrai) | 0,20 [0,13 ; 0,26] | 0,13 [0,10 ; 0,21] |
| 8 (35 j, cible − 300) | 0,19 [0,14 ; 0,26] | 0,26 [0,24 ; 0,35] |

Maximum sur les neuf cellules : A 0,20 kg, B 0,26 kg, soit un écart de 0,06 kg. **A est retenue** [mesuré].

**Validation** (100 répétitions par cellule ; A seule est jugée) [mesuré] :

| Cellule | m0 à R | m1 à R + 7 | m1 à R + 14 | V1 | V2 |
|---|---|---|---|---|---|
| 0 (15 j, cible) | 0,00 [0,00 ; 0,00] | 0,13 [0,10 ; 0,18] | 0,12 [0,08 ; 0,14] | PASS | PASS |
| 1 (15 j, maintien vrai) | 0,00 [0,00 ; 0,00] | 0,17 [0,14 ; 0,18] | 0,14 [0,11 ; 0,17] | PASS | PASS |
| 2 (15 j, cible − 300) | 0,00 [0,00 ; 0,00] | 0,14 [0,11 ; 0,19] | 0,11 [0,09 ; 0,14] | PASS | PASS |
| 3 (22 j, cible) | 0,00 [0,00 ; 0,00] | 0,12 [0,09 ; 0,17] | 0,11 [0,09 ; 0,13] | PASS | PASS |
| 4 (22 j, maintien vrai) | 0,00 [0,00 ; 0,00] | 0,23 [0,17 ; 0,25] | 0,11 [0,09 ; 0,14] | PASS | PASS |
| 5 (22 j, cible − 300) | 0,00 [0,00 ; 0,00] | 0,19 [0,13 ; 0,22] | 0,14 [0,10 ; 0,18] | PASS | PASS |
| 6 (35 j, cible) | 0,00 [0,00 ; 0,00] | 0,17 [0,15 ; 0,20] | 0,11 [0,08 ; 0,14] | PASS | PASS |
| 7 (35 j, maintien vrai) | 0,00 [0,00 ; 0,00] | 0,16 [0,13 ; 0,20] | 0,11 [0,09 ; 0,15] | PASS | PASS |
| 8 (35 j, cible − 300) | 0,00 [0,00 ; 0,00] | 0,19 [0,15 ; 0,23] | 0,11 [0,08 ; 0,14] | PASS | PASS |

Rapportés, non jugés : le code de 71bc77e (« sans ») et la référence sans pause (même graine) [mesuré].

| Cellule | sans : m0 | sans : m1 R + 7 | sans : m1 R + 14 | référence : m0 | référence : m1 R + 7 | référence : m1 R + 14 |
|---|---|---|---|---|---|---|
| 0 | 0,40 [0,25 ; 0,51] | 0,13 [0,09 ; 0,17] | 0,11 [0,10 ; 0,13] | 0,34 [0,25 ; 0,41] | 0,09 [0,07 ; 0,11] | 0,10 [0,07 ; 0,12] |
| 1 | 0,71 [0,66 ; 0,83] | 0,11 [0,09 ; 0,15] | 0,15 [0,12 ; 0,17] | 0,41 [0,31 ; 0,46] | 0,10 [0,08 ; 0,12] | 0,11 [0,08 ; 0,11] |
| 2 | 0,54 [0,41 ; 0,64] | 0,11 [0,10 ; 0,15] | 0,11 [0,07 ; 0,14] | 0,34 [0,31 ; 0,41] | 0,10 [0,08 ; 0,14] | 0,10 [0,08 ; 0,12] |
| 3 | 0,36 [0,27 ; 0,47] | 0,10 [0,08 ; 0,13] | 0,11 [0,08 ; 0,14] | 0,34 [0,25 ; 0,45] | 0,10 [0,08 ; 0,12] | 0,12 [0,09 ; 0,13] |
| 4 | 1,28 [1,12 ; 1,37] | 0,13 [0,10 ; 0,17] | 0,12 [0,10 ; 0,15] | 0,36 [0,26 ; 0,42] | 0,11 [0,08 ; 0,13] | 0,11 [0,07 ; 0,13] |
| 5 | 0,88 [0,69 ; 1,00] | 0,16 [0,13 ; 0,18] | 0,13 [0,10 ; 0,17] | 0,35 [0,26 ; 0,44] | 0,11 [0,06 ; 0,12] | 0,10 [0,08 ; 0,12] |
| 6 | 0,45 [0,37 ; 0,50] | 0,15 [0,14 ; 0,21] | 0,10 [0,09 ; 0,13] | 0,32 [0,26 ; 0,42] | 0,08 [0,07 ; 0,11] | 0,09 [0,08 ; 0,10] |
| 7 | 1,77 [1,42 ; 1,99] | 0,13 [0,11 ; 0,16] | 0,15 [0,12 ; 0,18] | 0,35 [0,27 ; 0,40] | 0,07 [0,06 ; 0,09] | 0,07 [0,06 ; 0,10] |
| 8 | 0,95 [0,80 ; 1,07] | 0,14 [0,10 ; 0,19] | 0,13 [0,11 ; 0,17] | 0,37 [0,29 ; 0,44] | 0,10 [0,08 ; 0,12] | 0,07 [0,05 ; 0,08] |

Offset retenu et cible du recalcul périodique (médianes, kcal/j) [mesuré] :

| Cellule | offset vrai | offset A (R / R + 7 / R + 14) | offset sans | cible A (R / R + 7) | cible sans |
|---|---|---|---|---|---|
| 0 | 13 | −5 / −20 / −8 | 3 / −1 / −9 | 1 744 / 1 734 | 1 756 / 1 746 |
| 1 | 31 | −9 / −5 / 17 | −44 / −160 / −133 | 1 743 / 1 736 | 1 715 / 1 612 |
| 2 | −15 | 2 / −12 / −27 | 25 / 92 / 89 | 1 762 / 1 742 | 1 777 / 1 826 |
| 3 | −18 | 11 / 3 / 6 | 9 / −18 / −12 | 1 753 / 1 747 | 1 755 / 1 728 |
| 4 | −35 | −17 / −1 / 26 | −81 / −237 / −225 | 1 723 / 1 735 | 1 679 / 1 540 |
| 5 | 52 | 11 / −7 / −12 | 65 / 176 / 174 | 1 768 / 1 750 | 1 804 / 1 887 |
| 6 | 69 | 33 / 24 / 33 | 43 / 58 / 60 | 1 772 / 1 759 | 1 774 / 1 780 |
| 7 | 47 | 25 / 40 / 63 | −51 / −261 / −251 | 1 747 / 1 755 | 1 698 / 1 517 |
| 8 | 13 | 22 / 6 / −10 | 97 / 207 / 187 | 1 769 / 1 747 | 1 818 / 1 897 |

**Lecture** [déduit]. Sans réancrage, le poids modélisé recolle vite aux pesées : m1 reste bas. Mais l'offset retenu absorbe la pause : jusqu'à −261 kcal/j pour un offset vrai de +47 quand la pause s'est faite au maintien, et +207 pour un offset vrai de +13 quand elle s'est faite sous la cible. Le recalcul périodique viserait alors 1 517 au lieu de 1 755 kcal, ou 1 897 au lieu de 1 747. A garde l'offset proche de l'offset vrai dans toutes les cellules.

**Verdict** [mesuré] :
- **V1** : PASS dans les 9 cellules. C'est par construction : avec une seule pesée dans la dernière période, le niveau de la période est cette pesée, et m0 vaut 0.
- **V2** : PASS ; la borne haute la plus élevée vaut 0,25 kg à R + 7 et 0,18 kg à R + 14.
- **V3** : PASS. A construit 1 800 plans ; aucun n'est refusé, sous le plancher ou à vitesse interdite (le code de 71bc77e : pareil).
- **V4** :
  - Captures T-03, T-04, golden, R et S, `convergenceJourney` avec A activée, à la fois dans le domaine et sur chaque appel direct de `fitCalibration` : 0 différence sur 2 522 380 valeurs. Un contrôle négatif confirme que la variante était bien active.
  - Équivalence de la 5b avec A activée : 0 échec sur 17 275 appels (6.2).
- **V5** : cas réel avec la pesée de 67,6 kg du 25/10. Poids modélisé : 67,60 kg avec A (écart 0), contre 65,71 kg avec le code de 71bc77e (écart 1,89 kg). PASS, mais par construction, comme V1.

**GO** : A est activée (`REANCHOR_AFTER_PAUSE = 'A'`) dans un commit séparé ; le modèle reste en 1.9.0.

**Bruts.** `results-6a.zip`, à la racine, est ignoré. Il contient :
- les JSON Lines du pilote, de l'entraînement et de la validation (un utilisateur par ligne) ;
- `selection.json`, `verdict.json` et les tableaux ;
- les résultats chiffrés du cas réel ;
- les classements de captures.

Pour reconstruire les tableaux : `node tests/experiments-journal/sixa/tables8.mjs training`, puis `node tests/experiments-journal/sixa/tables8.mjs validation`.

**Rejeu du 24/10 à 23:41 avec ce code** [mesuré] :
- 6 jours déduits au lieu de 10 ;
- porte fermée (couverture 33 %), donc aucune recalibration ;
- recalcul périodique retenu par D3 ;
- message « Ton plan attend une pesée » ;
- Suivi : « Pèse-toi pour voir où mène ton plan. »

Rien n'aurait changé ton plan. Une réserve : le plan du 15/09 a dû être recalculé avec le code d'aujourd'hui, ce qui donne 1 331 kcal au lieu des 1 560 d'origine. Cela ne joue pas sur ces décisions.

## 5. Arrêts

Aucune règle d'arrêt n'a joué [mesuré] :
- la migration ne perd rien, ni sur l'export réel, ni sur les profils, ni sur le store du schéma 7 ;
- chaque différence de capture est attribuée à une règle ;
- aucune exigence absolue n'est violée (plancher, vitesse, G1 et G2 testés) ;
- V4 passe ;
- le coût reste dans la limite.

## 6. Vérifications

### 6.1 Captures

Base `71bc77e`, puis chaque commit dans un worktree, en priorité basse. Toutes les différences sont listées une à une par `tests/experiments-journal/sixa/classifyCaptures.mjs`. T-03 (1 003 779 valeurs), T-04 (1 497 006) et golden (3 041) : 0 différence à chaque commit [mesuré].

| Commit | Différences (R et S, parcours) | Attribution |
|---|---|---|
| point 1 | 56, dont 7 numériques | `schemaVersion` 10 → 11 (7), `activityLog` (7), trace : longueurs (7), `onboarding` (7), `recalibration` (28) |
| point 2 | 56 | aucune nouvelle |
| point 3 | 115 | + 59 versions 1.8.0 → 1.9.0 |
| point 4 | 129 | + `staleWeighInNoticeClosedOn` (7), `blockedByStaleWeighIn: false` (7) |
| point 5 | 136 | + `periodicReplanDeferredOn` (7) |
| point 6 | 154 | + `gate.periodStart` (7), `gate.pauses: []` (7), `resumedOn: null` (4) |
| code de D7 (`'off'`) | 154 | aucune nouvelle |
| A activée (`22957a6`, final) | 154 | aucune nouvelle ; 0 différence contre le code de D7 sur « off » (V4) |

### 6.2 Équivalence de la 5b

Méthode des rapports 45 à 48, une seule fois, sur le code final (variante A activée, D3 à D6 actifs), en 8 parties en priorité basse (245 à 315 s chacune), puis la fusion [mesuré] :
- **0 échec** sur 17 275 appels (400 utilisateurs, dont 323 basculent) ;
- tolérances : 0 pesée manquée et 0 jour non exploitable sur 6 460 évaluations ; adhérence déduite : 0 jour ;
- contrôles négatifs : 80 sur 80 diffèrent.

Aucune différence, donc aucune à attribuer : les utilisateurs simulés se pèsent et notent chaque jour, si bien qu'aucune pause, aucune pesée ancienne et aucun jour sous la cible ne s'y présentent [déduit]. Le harnais appelle `periodicReplan` directement, donc D5 n'y est pas exercé [lu] ; D5 est couvert par les tests du point 5 et par le profil 11.

### 6.3 Tests

697 tests au départ, **737** à la fin, tous verts ; `npm run check` est propre [mesuré]. Ajoutés dans `tests/domain/pass6a.test.ts` : 40 tests, un bloc par point et un bloc pour les profils et l'aller-retour.

### 6.4 Build et hors ligne

- `npm run build` sans erreur ; 31 fichiers en précache (1 595 Kio) [mesuré].
- Bundle principal : 670,0 kB (202,4 kB compressé), contre 616,5 kB (188,0 kB) à 71bc77e [mesuré]. Une bonne part vient du registre `CONSTANT_METADATA`, désormais embarqué pour les diagnostics [déduit].
- `dist/` servi sous `/wheighty/` : service worker actif, serveur arrêté, requête hors cache en échec, page rechargée et servie par le service worker [mesuré, navigateur].

### 6.5 Navigateur, à 375 px

Serveur de dev, profils régénérés pour le 11/11, captures d'écran prises [mesuré, navigateur].

| Profil | Ce qu'on voit |
|---|---|
| 8, pause sans pesée | Aujourd'hui et Suivi : « Ton plan attend une pesée » ; pas de recalibration (retenue, journalisée) ; Suivi sans projection, « Pèse-toi pour voir où mène ton plan. » ; « OK » le ferme pour la journée (journalisé) |
| 9, retour après pause | Aujourd'hui : « Encore 4 pesées avant la première mise à jour. », « Comptées depuis ta reprise du 11 novembre. » ; Analyse : 1 / 5 pesées, la même ligne. Pas de projection (aucune recalibration appliquée, porte de la période fermée) : le réancrage n'y est pas visible |
| 10, recalibrée porte fermée | Analyse calibrée, 2 240 kcal, « Vers la prochaine mise à jour » 3 / 4, adhérence 44 % ; Aujourd'hui : « Note tes journées pour débloquer la prochaine mise à jour. » ; la feuille dit « prochaine mise à jour » ; projection dessinée |
| 11, recalcul et recalibration | Plan inchangé, recalcul en attente, « Une recalibration est prête. » ; l'écran : « passerait de 1 710 à 1 360 kcal » ; appliquée : une seule entrée de trace ce jour-là, la recalibration |

Console : une erreur « useWheighty must be used inside StoreProvider », apparue pendant le rechargement à chaud qui a suivi ma modification de `StoreProvider`. Elle n'est pas revenue après deux rechargements complets et un parcours des cinq sections [mesuré].

### 6.6 Export

Aller-retour export, import, export :
- **Profils 7, 8 (reprise) et 8 à 11** : le store est identique ; la seule différence est `productSearchEnabled`, que l'import remet à faux, comme toujours (test commité) [mesuré].
- **Cas réel** : identique [mesuré].
- **Navigateur, profil 10** : identique, hors l'entrée `import` du journal [mesuré].

## 7. Choix faits sans consigne

1. **Journal d'activité** : dans le store, pas sous une clé à part (coût mesuré en 1f). Il est retiré du store envoyé aux workers.
2. **Ce qui est journalisé** : les saisies par différence de stores, plutôt qu'à chaque écran. Un message affiché est journalisé une fois par message et par ouverture.
3. **Écrans de décision** :
   - « Changer de plan » et la cible personnelle sont journalisés à l'ouverture de leur feuille ;
   - la proposition d'alignement et l'offre de l'habitude mesurée, quand leur carte s'affiche ;
   - « Plus tard » sur l'écran de recalibration compte comme un refus.
4. **Trace** : une seule règle, `user_goal`, pour l'objectif et la vitesse ; le maintien choisi depuis « objectif atteint » compte aussi comme `user_goal`.
5. **Message D3** : ce n'est pas une entrée de trace (sinon une par jour d'absence) mais une notice calculée, avec une date de fermeture dans `meta`. Il se place après la migration de cible et avant le parcours journal. Il n'a pas de « Détails ».
6. **D3** : « plus de 7 jours » veut dire âge > 7. Sans aucune pesée, le plan est considéré en attente.
7. **D5** : l'attente vaut pour toute la journée, et une fois par cycle de recalcul.
8. **Schéma 11** : les deux dates de `meta` des points 4 et 5 ont été ajoutées à la migration 10 → 11 écrite au point 1, puisque la branche n'est pas publiée.
9. **Amendement 8** : les choix du monde simulé sont listés en section 4. La référence est mesurée avec le code de 71bc77e.
10. **V3** : il est jugé sur les plans de la variante retenue ; ceux du code de 71bc77e sont rapportés à côté.
11. **D4** : la porte du journal (habitude mesurée) ne compte pas par période.
12. **Variante B** : à un redémarrage, la masse grasse mesurée, quand le profil en a une, est ramenée au nouveau poids, à pourcentage égal.

## 8. Défauts vus hors périmètre, non corrigés

1. `IMPLEMENTATION_NOTES.md` n'avait pas été mis à jour depuis le modèle 1.3.0 et le schéma 6 [lu]. J'ai mis l'en-tête au jour et renvoyé aux rapports 37 à 48 pour les modèles 1.4.0 à 1.8.0.
2. Dans la migration 6 → 7, l'identifiant de l'entrée `target_bmi_20` est construit avec `replace(/D/g, '')` au lieu de `\D` : les chiffres de la date ne sont pas isolés [lu]. Cela n'a pas d'effet sur les calculs.
3. Plan : « L'app l'ajustera à ta première recalibration » (cible personnelle) et « après la première recalibration » (cible alignée) restent écrits même quand une recalibration a déjà été appliquée [lu]. D2 ne visait que les écrans listés.
4. Un `commit` fait depuis un écran avec un store calculé à son rendu peut écraser un changement concurrent du store, par exemple une reprise arrivée entre-temps [déduit]. Je ne l'ai corrigé que pour le journal d'activité.
5. Aujourd'hui affiche la cible arrondie à 10 kcal (« 1 810 ») et le reste du journal à l'unité (« 1 808 kcal restantes ») [mesuré, navigateur].
6. Sur Aujourd'hui, la ligne d'état dit « Ton estimation suit tes pesées. » pendant qu'une recalibration est retenue par D3 (profil 8) [mesuré, navigateur]. Le message D3 couvre ce cas.
7. Le marqueur « Auj. » de Suivi reste sur la dernière pesée pendant une absence (profil 8) : c'est réservé à la passe UX 3.

## 9. Vérification pour John (20 minutes au plus)

```
git switch prod/6a-pauses
npm run verification:profils
npm run dev
```

`npm run verification:profils` réécrit les fichiers suivis de `docs/verification-5b/` et crée les profils 8 à 11. Avant de changer de branche : `git restore docs/verification-5b`, puis supprime les quatre fichiers `8-pause-sans-pesee.json`, `9-…`, `10-…` et `11-…`.

Pour charger un profil, dans la console du navigateur : `fetch('/docs/verification-5b/<profil>.json').then(r => r.json()).then(j => { localStorage.setItem('wheighty:store', JSON.stringify(j.store)); location.reload(); })`.

1. **`8-pause-sans-pesee`** :
   - Aujourd'hui, « Ton plan attend une pesée » en haut ;
   - Suivi : pas de courbe de projection, « Pèse-toi pour voir où mène ton plan. » ;
   - « OK » ferme le message, qui ne revient pas avant demain ;
   - ajoute une pesée : le message disparaît.
2. **`9-retour-apres-pause`** : Aujourd'hui et Analyse disent « Comptées depuis ta reprise du 11 novembre », et Analyse compte 1 pesée sur 5.
3. **`10-recalibree-porte-fermee`** :
   - Analyse : maintien estimé, confiance, puis « Vers la prochaine mise à jour » ;
   - Aujourd'hui : « … la prochaine mise à jour » ;
   - Suivi : la courbe de projection est là.
4. **`11-recalcul-et-recalibration`** :
   - « Une recalibration est prête. » ;
   - touche-la : « Ton plan quotidien passerait de 1 710 à 1 360 kcal » ;
   - « Plus tard », puis retour sur Plan : la cible est toujours 1 710.
5. **Export** : Profil > Mes données > Exporter. Le fichier s'appelle `wheighty-AAAA-MM-JJ-HHMM.json` ; on y trouve `app`, `device` et `diagnostics`, et dans `store`, `activityLog`.

Sur l'iPhone, après déploiement seulement :
- Ouvre l'app installée et exporte : `device.displayMode` doit valoir `standalone`, et `app.build` le commit déployé.
- Ouvre et ferme l'app quelques fois, puis exporte : `activityLog` contient les `app_open` (`start` et `foreground`).
- La place libre du stockage de Safari ne se voit que là : si un jour l'enregistrement échoue, l'app affiche déjà le bandeau d'erreur d'enregistrement de Mes données.

Ensuite, si tout va bien, dis-le-moi : je fusionne (`git merge --no-ff prod/6a-pauses` dans `main`), je relance `npm run check`, et je te donne les commandes d'envoi :

```
git push origin main
```

## 10. Mises à jour de `IMPLEMENTATION_NOTES.md`

- **En-tête** : modèle 1.9.0, schéma 11 (les modèles 1.4.0 à 1.8.0 renvoient aux rapports 37 à 48).
- **Nouvelles décisions** :
  - D-35 : export et journal d'activité ;
  - D-36 : état « recalibré » ;
  - D-37 : D6 ;
  - D-38 : D3 ;
  - D-39 : D5 ;
  - D-40 : D4 ;
  - D-41 : réancrage, avec son verdict.
- **Section 6, constantes** : `AUTO_UPDATE_MAX_WEIGHIN_AGE_DAYS = 7`, `TRACKING_PAUSE_MIN_GAP_DAYS = 15` et `REANCHOR_AFTER_PAUSE = 'A'`, toutes `engineering_prior`, décisions du 11/11.
- **Section 12** : changements du modèle 1.9.0 par rapport à 1.8.0 et du schéma 11.
