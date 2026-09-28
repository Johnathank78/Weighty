# 40 : reprise de l'itération 2, mode journal en boucle fermée avec K2 + G

Mesures seulement : aucune fonctionnalité visible, aucune sortie de production modifiée, rien sous `src/` n'a changé. Branche `bench/journal-battery`, rien sur `main`, aucun merge. Seuils : `tests/experiments-journal/THRESHOLDS.md`, amendements 1 à 6. Tableaux : `tests/experiments-journal/results/it2r/tables2r.md` et `verdicts2r.json`.

Conventions : **[lu]** chemin:lignes ; **[mesuré]** fichier de résultats ; **[déduit]** raisonnement.

## Synthèse

| Étape | Résultat |
|---|---|
| 2 amendement 6 | commité seul, `7b10e5a`, avant toute mesure |
| 4.5 non-régression, options absentes | **0 différence** sur 2 523 011 valeurs ; rejeu du shard 3 de `real2c` : **0 différence** sur 561 172 valeurs |
| 4.6 tests | 9 tests (garde-fous en mode journal et « cible choisie », ordre d'un jour) et 2 tests de graines, verts |
| 6.1 équivalence étendue | **passe** : `equiv2b` rejoué à l'identique (150 fixtures) ; 73 garde-fous du monde idéal (24 G1, 49 G2) : cibles identiques au bit près 73 / 73 |
| 6.2 appariement | **passe** : 350 bras, 0 différence |
| 6.3 pilote | projection 6,94 h, sous 8 h ; aucune réduction |
| 7.1 entraînement | J70 NO-GO, J85 NO-GO, J100 INCONCLUSIF (S1 en prise) → **X = 100 %** ; passe doublée non lancée (sans effet possible sur X, section 3) |
| 7.2 V1, P00, bras J | première passe : S1 prise INCONCLUSIF, le reste GO ; **passe doublée : tous les critères bloquants de C1 GO** (S1, S3-P, S3-D, S4-P, S4-J, S5, S6, P00) |
| 7.2 V1, P00, règle de A2.1 (S5b, J − C) | **ÉCHOUE** : les 12 cellules NO-GO, sur les deux passes ; le bras C fait mieux que le mode journal à 0, 15 et 30 % de jours d'écart |
| Arrêt | **Arrêt V1 (A6.3)** : pas de V2, ni glucides, ni C2, ni C6. Le mode journal n'est pas retenu comme forme d'intégration (A2.1). |
| Temps | ≈ 2 h 40 de temps réel |

---

## 0. État de départ et commit de l'amendement 6

- **[mesuré]** `git status` au départ, branche `bench/journal-battery` :
  - `.gitignore` modifié hors de mes commits (ligne `/reports` retirée) : non touché, non commité ;
  - non suivis : `proto2c.diff`, `reports/31_…`, `33_…` à `39_…`, `tests/experiments-journal/results/results.zip` (non commité).
- **[mesuré]** `git log --oneline -3` : `e2e44d8 bench(journal): iteration 2c realistic world, amended A3.2 passes for K2 + G, four arms reported (s6)`, `7a39407 …`, `7ad7fbb …`.
- **[mesuré]** `npm run check` au départ : **vert**. Typecheck et lint sans erreur, **548 / 548** tests (48 fichiers), 30 s.
- **Commit de l'amendement 6 : `7b10e5a`**, `THRESHOLDS.md` seul, avant toute exécution de mesure.
  - **[mesuré]** Les 25 lignes ajoutées sont identiques aux lignes 311 à 335 du prompt (le contenu du bloc ```` ```markdown ```` sans ses clôtures), comparées par `diff` : aucune différence.
  - Comme aux amendements précédents : une ligne vide avant, fins de ligne CRLF de la copie de travail.
- **[mesuré]** `npm run check` à la fin : **vert**, **559 / 559** tests (50 fichiers : +9 de `journalGuardrails2r.test.ts`, +2 de `seeds2r.test.ts`), 40 s.

Commits de l'itération :

| Commit | Contenu |
|---|---|
| `7b10e5a` | amendement 6 (s2) |
| `44bc91e` | prototype (simulateur), graines déclarées et leur test, tests de 4.6, preuve de non-régression, rejeu de `real2c` (s3) |
| `05ec875` | harness, contrôles 6.1 et 6.2, pilote de coût, script des tableaux, avant toute mesure (s4) |
| `e0f53e6` | entraînement : bruts, tableaux (s5) |
| `8eccbde` | V1, première passe : bruts, tableaux (s6) |
| `ffee4d2` | V1, passe doublée : bruts, tableaux ; tableau S5 et S5b par densité de pesée ajouté au script (s7) |

Ce rapport, sous `reports/`, n'est pas commité, comme les rapports 34 à 39.

## 1. Prototype

Rien sous `src/` n'a été modifié : les garde-fous du mode journal vivent dans le harness, à côté de `journalGoalPlan` (qui y est depuis le rapport 36). Aucune fonction du domaine n'a été nécessaire (4.1).

### Fichiers et signatures

**`tests/helpers/closedLoop.ts`** **[lu]** :

- **Facteur de 5.1** : `MAJOR_SHARES = [0.8, 0.95, 1]` (l. 89), `ProfileSlot.majorShare?` (l. 188). `closedLoopSlots(n, seed, majorShareSeed?)` (l. 232) ajoute une dimension latine tirée d'un générateur à part, après les autres : sans `majorShareSeed`, les profils sont ceux des itérations précédentes. Un non-suiveur déclare « écart important » si le tirage du jour est sous sa part, sinon « plan respecté » (l. 1406) ; sans part, 0,8 comme avant.
- **`journalGoalPlan(store, date, offset, floorMultiplier, solver?, overrides?)`** (l. 853) : `overrides` = objectif, poids cible et cible de pas du plan reconstruit ; absent, comportement inchangé.
- **`journalPlanOf`** (l. 890) : construction du plan du mode journal, extraite de `applyJournalPlan` sans changement (mêmes champs, même ordre), avec les surcharges.
- **`enforceJournalPlanGuardrails(store, date, base, floorMultiplier, solver?)`** (l. 939) : règles de `enforcePlanGuardrails` (même poids `currentWeightKg`, même IMC, mêmes seuils, même tolérance 1e-9), plan reconstruit en unités de saisie :
  - G1 : profil en maintien, cible = poids de l'app, vitesse 0 (comme `changeGoal`) ; plan de maintien par `journalGoalPlan` avec l'estimation du mode journal, le plancher du bras, la cible de pas du plan en cours et les options de solveur ;
  - G2 : `journalGoalPlan` avec la vitesse demandée du profil (plafonnée par `buildGoalPlan`), le plancher du bras, la cible de pas conservée ;
  - échec : le store (plan et profil) reste inchangé ; aucune règle : le store est rendu tel quel (même objet).
- **`guardStep(world, st, d, arm)`** (l. 1264), appelé le matin des jours d'évaluation avant l'évaluation de la calibration, **dans tous les modes** (l. 1457) :
  - `pre` et `A` : inchangé (`enforcePlanGuardrails`) ;
  - `J` : chemin de la méthode actuelle tant qu'aucun plan journal n'existe, puis `journalGuardStep` (l. 1306), à partir de la dernière estimation journal appliquée (offset et intervalles, `journalApplied`) et de l'entrée de calibration du mode journal du jour ;
  - `C` : G1 seulement tant que le plan en cours est la cible choisie (l. 1276) ; ensuite comme en `A`.
- **`SimState.chosenTargetActive`** (l. 678) : vrai de la bascule du bras C (l. 1192) jusqu'au remplacement de la cible choisie, par une recalibration de la méthode actuelle (l. 1043) ou par G1 (l. 1290).
- **`periodicStep`** (l. 1223) : dans le bras C, pas de recalcul périodique tant que `chosenTargetActive` (l. 1227), ensuite `periodicReplan` comme en `A` (4.2).
- **S3-P** : `s3pCheck` dans tous les modes ; la vérification d'un jour où le plan du bras C est la cible choisie est marquée `exempt` (l. 1353) et n'est pas comptée (4.3).
- **Sorties** : `SimState.modeDay` (l. 680, mode du jour), `GuardRecord.mode` et `path` (`current` ou `journal`), `S3pRecord.exempt`, durées de la partie commune et de chaque bras dans `UserOutcome.ms` (l. 1468, pour le pilote).
- **`simulateArmToMorning(spec, arm, day)`** (l. 1521) : un bras jusqu'au matin d'un jour, pesée comprise, avant ses garde-fous (contrôle 6.1).

**`tests/experiments-journal/it2r/`** **[lu]** :

- `jobs2r.ts` : graines (`SEED_BASES_2R`, l. 63), K2 + G (`K2G`, l. 86 : options de solveur et cadence de K2 de 2b, garde-fous de 2c), bras, tâches, échantillon quotidien, colonnes `columns2r` (l. 391) avec le jour de référence de A6.5 (`refDay2r`, l. 362) ;
- `run.experiment.ts`, `launch.sh` (16 processus), `stats2r.ts` (règles de statut), `tables2r.experiment.ts`, `projection.experiment.ts` ;
- contrôles : `repro2c.experiment.ts`, `equiv2r.experiment.ts`, `pairing2r.experiment.ts`.

### Écarts à ce prompt et lectures déclarées (fixées avant toute mesure)

1. **Garde-fous du mode journal avant le premier plan journal.** 3.13 fixe le point de départ de G1 à celui de la méthode actuelle. J'applique aussi G2 par le chemin de la méthode actuelle tant qu'aucune estimation journal n'a été appliquée : il n'y a pas d'estimation en unités de saisie à ce moment, et le plan en cours est un plan de la méthode actuelle.
2. **Estimation utilisée par G en mode journal** : la dernière estimation journal appliquée (offset et intervalles), avec le corps modélisé du jour, comme le recalcul périodique du mode journal (rapport 38, écart 3).
3. **Fin de la cible choisie (bras C)** : elle prend fin à la première recalibration de la méthode actuelle (3.10) ou quand G1 la remplace ; dans ce second cas, G2 et le recalcul périodique s'appliquent ensuite au plan de maintien prescrit par l'app. Un utilisateur « robustesse » du bras C garde T_c après G1, comme après une recalibration.
4. **Part déclarée « écart important »** : appliquée aux non-suiveurs pendant toute la simulation (avant la bascule, et après dans le bras A, où ils restent non-suiveurs). Dans les bras J et C, la déclaration d'après la bascule suit les règles de 5.3 du prompt d'origine (le mode journal ne lit pas l'adhérence ; le bras C déclare ses jours d'écart).
5. **Plancher du bras J en C1** : saisi × 1,10 (3.6). **J-NASEM** : prior NASEM, plancher saisi non relevé, grille ±2 000 (rapport 36).
6. **Jour de référence de A6.5** (colonne `ref2r`) : J, premier plan journal ; C, jour de la cible choisie ; A, jour 0. Un utilisateur basculé sans plan journal n'a aucune semaine, aucun bloc ni aucun jour dans S3-P, S3-D, S4-P et S4-J du bras J.
7. **S4-J** : périodes de plan = intervalles entre deux débuts de plan consécutifs (tous les plans : recalibrations, recalculs, garde-fous), d'au moins 7 jours, commençant au jour de référence ou après ; apport réel moyen de la période contre la moyenne du plancher réel (D-32 au poids vrai, mis à jour chaque semaine) sur les mêmes jours. Dénominateur : utilisateurs basculés ayant au moins une telle période.
8. **S1, S5, S5b, S6, P00 jugés par objectif (perte, prise) et par fenêtre** : lecture la plus stricte, chaque cellule doit passer ; les valeurs perte et prise regroupées sont rapportées. Les ratios portent sur tous les blocs des fenêtres (A6.5 ne restreint au premier plan que S3-P, S3-D, S4-P et S4-J).
9. **Règles de statut** (`stats2r.ts`) : GO si l'IC entier satisfait le seuil, NO-GO s'il est entier du mauvais côté, INCONCLUSIF sinon. Un critère sans utilisateur à juger est NON JUGEABLE et compte comme NO-GO. S4-J : GO si la part ≤ 1 % et la borne haute ≤ 2 % ; NO-GO si la borne basse dépasse 1 %.
10. **Graines** : même convention que 2c (bases de 20,2 millions, maîtresse = base + indice, flux ≤ 20). Comme dans les tâches de `it2/jobs.ts`, les mêmes utilisateurs (profils et graines maîtresses) sont utilisés dans chaque population d'une passe, u étant tiré selon la loi de la population.
11. **Pilote** : 50 non-suiveurs et 50 suiveurs par population (400 simulations au lieu de 200), pour chiffrer aussi le coût des suiveurs. Les mêmes graines jetées ont servi, avant le pilote, à chercher des cas de test (index 90 000 et au-delà, et une exploration sur les 200 non-suiveurs du pilote dont la sortie n'est pas conservée) ; aucun résultat n'en est utilisé.

### Isolement (4.4)

- **[mesuré]** Test « isolation » de `tests/domain/journalGuardrails2r.test.ts` : aucun module de `src/store`, `src/app`, `src/screens`, `src/components`, `src/hooks` ni `src/main.tsx` ne mentionne les identifiants nouveaux. Les tests d'isolement de 2a, 2b et 2c et le test statique D8 restent verts (`npm run check`).

### Preuve de non-régression, options absentes (4.5)

- Capture : scripts de `tests/experiments-journal/capture/` (T-03, T-04, golden, R et S, `convergenceJourney`). Avant : `7b10e5a` (`src/` identique à `e2e44d8`), dans un worktree. Après : prototype de s3.
- **[mesuré]** `results/it2r/controls/nonregression.txt` : **2 523 011 valeurs, 0 différence** (554 identifiants aléatoires masqués). T-03, T-04 et golden identiques à l'octet, préfixes sha256 `3447793a…`, `c65c47cf…`, `e20b17f4…`, les mêmes qu'aux itérations précédentes.
- **[mesuré]** `results/it2r/controls/repro2c.txt` : shard 3 de `real2c` (rapport 39 ; 125 suiveurs, bras S0, K2, S0 + G, K2 + G) rejoué avec le simulateur de cette itération dans la configuration de 2c : 500 lignes, **90 000 valeurs, 0 différence** ; 27 716 lignes quotidiennes, **471 172 valeurs, 0 différence**.

### Tests (`tests/domain/journalGuardrails2r.test.ts`, 9 tests ; `tests/domain/seeds2r.test.ts`, 2 tests)

- **G1 en mode journal** : sur un store construit (femme 165 cm, poids de l'app sous IMC 20, perte), profil et plan en maintien, cible = poids de l'app, plan identique au bit près à `journalGoalPlan` avec ces entrées (cible, macros), maintien = NASEM + offset journal, plancher = D-32 × 1,10 ; un nouveau contrôle rend le même store ; une reconstruction du mode journal donne un plan de maintien. En boucle fermée (utilisateurs 90 003 et 90 005 des graines du pilote, G1 par le chemin journal aux jours 70 et 98) : tous les plans suivants sont des plans de maintien jusqu'au jour 168, avec des recalibrations journal après G1, et aucune violation de S3-P.
- **G2 en mode journal** : le plan reconstruit respecte le plafond et est identique à `journalGoalPlan` avec la cible de pas conservée ; en boucle fermée, chaque G2 du chemin journal laisse une vitesse sous le plafond de l'IMC de l'app.
- **Plan journal conforme** : un plan de perte dans les deux règles, ou un plan de maintien sous IMC 20, ressort identique (même objet).
- **Bras C** (utilisateur 90 100) : le matin de sa première recalibration, le bras A applique G2 ; dans le bras C, la cible choisie est en place et `enforcePlanGuardrails` appliquerait G2, mais aucun garde-fou n'est enregistré ; aucun recalcul périodique et aucune vérification S3-P comptée sur la cible choisie ; après la première recalibration, recalculs périodiques (90 100) et G2 (90 101). G1 s'applique sur la cible choisie (90 001).
- **Ordre d'un jour d'évaluation** : sur 4 utilisateurs × 3 bras, les plans d'un même jour sont dans l'ordre garde-fou, calibration, recalcul périodique ; chaque vérification S3-P lit l'objectif et la vitesse du plan en vigueur à la fin de la matinée.
- **Graines** : section 2.

## 2. Contrôles

### Graines (s11)

- **Déclarées** **[lu]** `jobs2r.ts:1-33`, `:63-77` : 13 bases de 4,03·10⁹ à 4,2724·10⁹, espacées de 20,2 millions.
- **[mesuré]** `tests/domain/seeds2r.test.ts` (vert) : les enveloppes (maîtresses, flux k ≤ 20, graines d'hypercube, de la part déclarée et de l'échantillon) sont sous 2³², disjointes entre elles et de toutes les passes précédentes (phases 1 et 1b, itérations 2, 2a, 2b, 2c) ; chaque graine réellement consommée par les tâches, les sous-bases, les utilisateurs du contrôle 6.1 et les cas de test est dans l'enveloppe de sa base, et aucune ne coïncide avec une autre.

### 6.1 Équivalence étendue aux garde-fous

- **[mesuré]** `results/it2r/controls/equiv2b-rerun.txt` : les 150 fixtures de `equiv2b` rejouées avec le code de cette itération ; **0 différence** avec les lignes commitées du rapport 38 (4 350 valeurs). Tolérances du rapport 38 tenues : médiane a posteriori 0,0045 kcal/j, poids modélisé 1,4·10⁻⁵ kg, masse tissulaire 1,2·10⁻⁵ kg ; cibles FX et K2 identiques au bit près 150 / 150.
- **[mesuré]** `results/it2r/controls/equivG.txt`, `equivG.csv.gz` : 400 utilisateurs du monde idéal (sous-base 4 050 210 000), bras A avec K2 + G ; **73 garde-fous appliqués (24 G1, 49 G2), tous après un snapshot appliqué**, 73 utilisateurs.
  - Méthode : le matin du jour D du garde-fou, chemin de la méthode actuelle (`enforcePlanGuardrails`) contre chemin journal (`enforceJournalPlanGuardrails`, estimation journal du jour E du dernier snapshot, entrée de calibration journal du jour D, plancher de production).
  - Écarts max : médiane a posteriori du jour E 0,0039 kcal/j ; poids modélisé 3,4·10⁻⁵ kg ; masse tissulaire 5,2·10⁻⁵ kg. Même statut, même règle, même objectif et même vitesse 73 / 73 ; **cibles identiques au bit près 73 / 73**.
- **Verdict 6.1 : PASSE.**

### 6.2 Appariement

- **[mesuré]** `results/it2r/controls/pairing.txt` : 50 non-suiveurs de P10 (K2 + G), bras A, J100, J85, J70, C, J-NASEM, J-glucides ; 37 bifurqués ; 11 avec un garde-fou ; 137 bras J avec un plan journal. **350 bras comparés à leur rejeu intégral depuis le jour 0 : 0 différence** (JSON au caractère près : séries quotidiennes, plans, évaluations, recalculs, garde-fous, S3-P, plan et profil, pesées, journaux, entrées).
- **Verdict 6.2 : PASSE.**

### 6.3 Pilote de coût

- **[mesuré]** `results/it2r/pilot/projection.txt` et `pilot2r-timing-shard*.json` : 200 non-suiveurs (160 propositions) et 200 suiveurs (0 proposition), 16 processus, 309 s ; efficacité parallèle 0,82.
- Coûts moyens par non-suiveur (ms, un processus) : partie commune 449 ; A 886 ; J100 1 942 ; J85 3 119 ; J70 4 327 ; C 2 346 ; J-NASEM 3 294 ; J-glucides 3 079. Suiveur : 3 315 (sans proposition, simulé une fois).
- Projection (bras J au coût du X le plus cher) : entraînement 54,5 min ; V1 32,9 ; V2 73,7 ; sensibilités 18,2 ; acceptation à 70 % 5,1 ; robustesse 4,5 ; glucides 39,9 ; C6 41,6 ; C2 72,8 min. Avec 43 min déjà écoulées et 30 min de tableaux et de rapport : **6,94 h, sous le plafond de 8 h. Aucune réduction de la section 9.** Passes doublées éventuelles, hors projection : entraînement 109 min, V1 66, V2 147.
- Les sorties par utilisateur du pilote sont supprimées ; seuls les temps sont commités.

## 3. C1, entraînement : choix de X

Graines `c1train` (4 070 400 000), 1 000 non-suiveurs, les mêmes dans chaque population principale ; bras A, J100, J85, J70 (K2 + G). **[mesuré]** `results/it2r/c1train/c1train-shard*.csv.gz`, `results/it2r/tables2r-train.md`, `verdicts2r-train.json`. Durée : 2 847 s.

**Propositions [mesuré]** (identiques dans les quatre populations : la proposition précède toute lecture du journal) : 809 / 1 000 non-suiveurs, jour médian 14. Par part déclarée « écart important » : 80 %, 156 / 334 = 46,7 % [41,4 ; 52,1 %] ; 95 %, 320 / 333 = 96,1 % ; 100 %, 333 / 333.

**Critères de sélection (A6.5 : S1, S3-P, S3-D, S4-P, S4-J, S5), bras J de chaque X, non-suiveurs basculés [mesuré]** :

| X | Population | Critères non GO | S1 perte sem. 5-12 / 13-24 | S1 prise sem. 5-12 / 13-24 | Statut |
|---|---|---|---|---|---|
| 70 % | P00 | S1 prise (2 cellules NO-GO) | 0,922 / 0,908 | 1,387 [1,287 ; 1,494] / 1,350 | NO-GO |
| 70 % | P05 | S1 prise (2 NO-GO) | | | NO-GO |
| 70 % | P10 | S1 prise (2 NO-GO), S1 perte 5-12 (INC.) | | | NO-GO |
| 70 % | P20 | S1 perte 5-12 (NO-GO) et 13-24 (INC.), S1 prise (2 NO-GO) | 0,782 [0,749 ; 0,820] / 0,841 | 1,389 / 1,268 | NO-GO |
| 85 % | P00 | S1 prise 13-24 (NO-GO), 5-12 (INC.) | 0,923 / 0,910 | 1,204 / 1,225 [1,150 ; 1,306] | NO-GO |
| 85 % | P05 | S1 prise (2 INC.) | | | INCONCLUSIF |
| 85 % | P10 | S1 prise (2 INC.), S1 perte 5-12 (INC.) | | | INCONCLUSIF |
| 85 % | P20 | S1 perte 5-12 (NO-GO), 3 cellules INC., S5 perte 5-12 (INC.) | 0,794 [0,765 ; 0,834] / 0,840 | 1,211 / 1,170 | NO-GO |
| 100 % | P00 | S1 prise (2 INC.) | 0,939 / 0,934 | 0,884 [0,737 ; 1,037] / 0,847 [0,674 ; 0,990] | INCONCLUSIF |
| 100 % | P05 | S1 prise (2 INC.) | | | INCONCLUSIF |
| 100 % | P10 | S1 prise (2 INC.), S4-J (INC. : 1 / 275, borne haute 2,03 %) | | | INCONCLUSIF |
| 100 % | P20 | S1 perte (2 INC.), S1 prise (2 INC.), S5 perte 5-12 (INC.) | 0,849 [0,813 ; 0,906] / 0,878 | 0,857 / 0,797 | INCONCLUSIF |

- **[mesuré]** Dans les 12 combinaisons : S3-P 0 violation, S4-P 0 jour ; S3-D entre 1,9 et 2,1 %, bornes hautes ≤ 3,1 % ; S4-J GO sauf une (J100, P10).
- **[mesuré]** Utilisateurs jugés en S4-J (basculés avec un plan journal) en P00 : 281 (X = 100 %), 590 (85 %), 801 (70 %). La densité exigée écarte du mode journal les utilisateurs pesés moins souvent : ils gardent leurs habitudes jusqu'au jour 168 (3.8), et leurs blocs entrent dans S1 (écart 8).
- **[mesuré]** S5 (J − A) est GO dans toutes les cellules sauf « perte, sem. 5-12 » en P20 pour X = 85 % et 100 % (INCONCLUSIF).
- Toutes les valeurs, IC et strates : `tables2r-train.md`.

**Règle de sélection (7.1)** : statuts J70 NO-GO, J85 NO-GO, J100 INCONCLUSIF. **X retenu : 100 %.**

- La règle du script (fixée avant la mesure) appelait, sur un X INCONCLUSIF rencontré avant un X GO, la passe doublée de l'entraînement (A5.1).
- **Écart déclaré : cette passe doublée n'a pas été lancée.** [déduit] Elle ne peut pas changer X : J70 et J85 sont NO-GO ; si J100 passe sur la passe doublée, X = 100 % ; sinon aucun X ne passe et la règle de 7.1 donne X = 100 %. Son coût projeté (109 min) aurait porté la projection au-delà du plafond de 8 h.

## 4. C1, validation V1 : P00

Graines de validation `c1valNf` (4 110 800 000) et `c1valFo` (4 131 000 000), neuves et disjointes de l'entraînement ; X = 100 % ; bras A, J, C, J-NASEM (K2 + G). **[mesuré]** `results/it2r/c1v1/c1v1-shard*.csv.gz`, `results/it2r/tables2r-v1.md`, `verdicts2r-v1.json`. Durée : 1 168 s.

### 4.1 Première passe (`c1v1`)

**Population [mesuré]** : 2 000 non-suiveurs, dont **1 613 basculés** (proposition acceptée, 80,7 %) et 387 sans proposition ; 1 000 suiveurs, aucune proposition. Parmi les 1 613 basculés, **571 (35,4 %) reçoivent un plan journal** (jour médian 28) : avec X = 100 %, seuls les utilisateurs pesés chaque jour franchissent la porte (densité de pesée 1,00 : 543 sur 545 jugés en S4-J ; 0,90 : 28 ; 0,75 : 0). Les autres gardent leurs habitudes jusqu'au jour 168 (3.8).

**Bras J, critères avec verdict (A6.5) [mesuré]** :

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| S1 perte, sem. 5-12 | 0,976 [0,949 ; 1,006] (n = 590) ; poids total 0,976 | GO |
| S1 perte, sem. 13-24 | 0,944 [0,922 ; 0,974] (n = 563) ; poids total 0,956 | GO |
| S1 prise, sem. 5-12 | 0,910 [0,791 ; 1,007] (n = 497) ; poids total 0,900 | INCONCLUSIF |
| S1 prise, sem. 13-24 | 0,887 [0,785 ; 0,972] (n = 497) ; poids total 0,866 | INCONCLUSIF |
| S3-P [S] | 0 violation sur 11 394 évaluations | GO |
| S3-D [S] | 81 / 2 844 utilisateurs-blocs = 2,85 % [2,07 ; 3,69 %] | GO |
| S4-P [S] | 0 jour | GO |
| S4-J [S] | 1 / 571 = 0,18 % [0,03 ; 0,99 %] ; marge minimale −26,0 kcal/j | GO |

**Comparaisons avec verdict [mesuré]** (Δ de la médiane de |ratio − 1|, apparié) :

| Critère | Perte sem. 5-12 | Perte sem. 13-24 | Prise sem. 5-12 | Prise sem. 13-24 | Statut |
|---|---|---|---|---|---|
| S5 (J − A), borne haute < 0 | −0,090 [−0,123 ; −0,063] | −0,150 [−0,198 ; −0,103] | −0,184 [−0,249 ; −0,098] | −0,191 [−0,248 ; −0,121] | GO |
| S6 (suiveurs, J − A), ≤ +0,05 | 0,000 [0 ; 0] | 0,000 | 0,000 | 0,000 | GO |
| P00 (J − J-NASEM), ≤ +0,05 | +0,006 [−0,002 ; 0,017] | +0,013 [0,002 ; 0,026] | +0,003 [−0,020 ; 0,017] | +0,001 [−0,008 ; 0,009] | GO |

**S5b et règle de décision de A2.1 (J − C) [mesuré]** : médianes de |ratio − 1| C → J et Δ [IC 95 %].

| Fréquence des jours d'écart | Perte sem. 5-12 | Perte sem. 13-24 | Prise sem. 5-12 | Prise sem. 13-24 |
|---|---|---|---|---|
| 0 % (seuil ≤ +0,05) | 0,147 → 0,289 ; +0,142 [0,091 ; 0,211] | 0,069 → 0,288 ; +0,219 [0,138 ; 0,289] | 0,340 → 0,611 ; +0,271 [0,159 ; 0,372] | 0,171 → 0,458 ; +0,287 [0,162 ; 0,403] |
| 15 % (seuil < 0) | 0,153 → 0,284 ; +0,131 [0,088 ; 0,175] | 0,098 → 0,262 ; +0,164 [0,118 ; 0,234] | 0,420 → 0,731 ; +0,311 [0,168 ; 0,493] | 0,233 → 0,608 ; +0,375 [0,282 ; 0,458] |
| 30 % (seuil < 0) | 0,177 → 0,334 ; +0,158 [0,088 ; 0,204] | 0,103 → 0,348 ; +0,245 [0,185 ; 0,336] | 0,468 → 0,876 ; +0,408 [0,245 ; 0,616] | 0,229 → 0,778 ; +0,549 [0,461 ; 0,682] |

Les 12 cellules sont **NO-GO** (IC entier au-dessus du seuil). **Règle de A2.1 en P00 : ÉCHOUE.**

**Bras C, sans verdict [mesuré]** : S1 perte 0,984 [0,967 ; 1,003] et 0,984 [0,976 ; 0,992] ; prise 1,169 [1,121 ; 1,229] et 1,020 [1,004 ; 1,043] ; S3-P 0 violation (1 687 vérifications exemptées, cible choisie) ; S3-D 3,16 % [2,68 ; 3,66 %] ; **S4-P 126 jours** ; S4-J 146 / 1 613 = 9,05 % [7,75 ; 10,55 %]. T_c remplacées par le plancher : 154 / 1 613.

**Rapportés [mesuré]** (`tables2r-v1.md`) :

- **S2 (A6.4)**, P90 / médiane : J 1,91 et 2,54 en perte, 2,54 et 2,13 en prise ; C 1,37 et 1,20, 1,70 et 1,44 ; A 1,98 et 2,80, 3,89 et 3,60 (semaines 5-12 et 13-24).
- **S7** (maintien dans la zone à 8 semaines) : suiveurs 135 / 308 = 43,8 % dans tous les bras ; non-suiveurs A 16,7 %, J 22,9 %, C 32,3 %, J-NASEM 21,4 % (616).
- **Non-suiveurs sans proposition** (387, identiques dans tous les bras), ratio sous la méthode actuelle : perte 1,054 [0,987 ; 1,224] et 1,097 ; prise 0,706 [0,531 ; 0,892] et 0,626.
- **Propositions par part déclarée** : 80 %, 295 / 667 = 44,2 % [40,5 ; 48,0 %] ; 95 %, 652 / 667 = 97,8 % ; 100 %, 666 / 666 ; jour médian 14.
- **S5 et S5b par part déclarée** (perte et prise ensemble) : S5 −0,067 [−0,189 ; 0,002] (80 %, sem. 5-12) à −0,192 [−0,249 ; −0,132] (100 %, sem. 13-24) ; S5b de +0,144 à +0,444, toutes bornes basses > 0.
- **Garde-fous, basculés** : G1 chez 118 (A), 99 (J, dont 17 par le chemin journal), 92 (C), 99 (J-NASEM) ; G2 chez 226, 210 (53 événements par le chemin journal), 183, 220 ; 0 échec. Fins sous IMC 20 vrai : A 13,9 %, J 10,0 %, C 2,9 %, J-NASEM 10,0 % ; IMC vrai minimal 15,12 (A, J, J-NASEM), 19,44 (C).
- **7.4, médianes, basculés** : recalibrations A 2, J 0, C 11 ; variation hebdomadaire du maintien affiché A 15,0, J 30,1, C 49,9 kcal/j ; écart à l'oracle du plan journal −10,0 (signé) et 116,9 kcal/j (absolu).
- **J-NASEM** : S1 perte 0,982 et 0,950, prise 0,924 et 0,896 ; S4-J 32 / 573 = 5,58 % [3,98 ; 7,78 %] (plancher saisi non relevé).

### 4.2 Passe doublée (`c1v1x2`, verdict sur elle seule, A1.3)

- **Raison** : S1 en prise INCONCLUSIF sur la première passe (10.6). La passe doublée ne pouvait pas lever l'arrêt V1, acquis par l'échec de A2.1 (NO-GO, pas INCONCLUSIF) ; elle tranche S1 en P00. La projection restait sous le plafond.
- Graines déclarées `c1valx2Nf` (4 151 200 000) et `c1valx2Fo` (4 171 400 000) ; 4 000 non-suiveurs, 2 000 suiveurs ; X = 100 % ; mêmes bras. **[mesuré]** `results/it2r/c1v1/c1v1x2-shard*.csv.gz`, `results/it2r/tables2r.md` (section 4), `verdicts2r.json`. Durée : 2 374 s.
- **Population [mesuré]** : 3 232 basculés (80,8 %), 768 sans proposition ; **1 127 basculés avec un plan journal (34,9 %)**, jour médian 28.

**Bras J, verdict [mesuré]** :

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| S1 perte, sem. 5-12 | 0,962 [0,938 ; 0,990] (n = 1 188) ; poids total 0,965 | GO |
| S1 perte, sem. 13-24 | 0,946 [0,924 ; 0,970] (n = 1 132) ; poids total 0,954 | GO |
| S1 prise, sem. 5-12 | 1,000 [0,933 ; 1,068] (n = 1 003) ; poids total 1,016 | GO |
| S1 prise, sem. 13-24 | 0,972 [0,912 ; 1,023] (n = 1 003) ; poids total 0,974 | GO |
| S3-P [S] | 0 violation sur 22 499 évaluations | GO |
| S3-D [S] | 130 / 5 613 = 2,32 % [1,84 ; 2,87 %] | GO |
| S4-P [S] | 0 jour | GO |
| S4-J [S] | 3 / 1 127 = 0,27 % [0,09 ; 0,78 %] ; marge minimale −13,2 kcal/j | GO |
| S5 (J − A) | perte −0,107 [−0,137 ; −0,079] et −0,158 [−0,201 ; −0,129] ; prise −0,198 [−0,235 ; −0,145] et −0,204 [−0,251 ; −0,163] | GO |
| S6 (suiveurs, J − A) | 0,000 [0 ; 0] dans les 4 cellules (aucune proposition chez les 2 000 suiveurs) | GO |
| P00 (J − J-NASEM) | perte +0,009 [0,002 ; 0,017] et +0,004 [0,001 ; 0,011] ; prise +0,009 [0,001 ; 0,029] et −0,000 [−0,007 ; 0,003] | GO |

**Critères bloquants de C1 en P00 : GO.**

**S5b (J − C) [mesuré]** :

| Fréquence | Perte sem. 5-12 | Perte sem. 13-24 | Prise sem. 5-12 | Prise sem. 13-24 |
|---|---|---|---|---|
| 0 % (≤ +0,05) | 0,154 → 0,275 ; +0,122 [0,095 ; 0,152] | 0,073 → 0,225 ; +0,152 [0,117 ; 0,202] | 0,315 → 0,622 ; +0,306 [0,224 ; 0,379] | 0,156 → 0,435 ; +0,279 [0,202 ; 0,348] |
| 15 % (< 0) | 0,148 → 0,277 ; +0,129 [0,097 ; 0,167] | 0,091 → 0,320 ; +0,229 [0,180 ; 0,273] | 0,389 → 0,645 ; +0,256 [0,186 ; 0,343] | 0,207 → 0,539 ; +0,332 [0,288 ; 0,390] |
| 30 % (< 0) | 0,166 → 0,352 ; +0,186 [0,137 ; 0,248] | 0,103 → 0,379 ; +0,276 [0,247 ; 0,330] | 0,407 → 0,807 ; +0,400 [0,301 ; 0,481] | 0,243 → 0,762 ; +0,519 [0,431 ; 0,580] |

Les 12 cellules sont NO-GO. **Règle de A2.1 en P00 : ÉCHOUE** (passe doublée).

**Bras C, sans verdict [mesuré]** : S1 perte 0,993 [0,980 ; 1,005] et 0,987 [0,980 ; 0,993], prise 1,144 [1,120 ; 1,177] et 1,009 [0,995 ; 1,025] ; S3-P 0 violation (3 449 vérifications exemptées) ; S3-D 2,85 % [2,52 ; 3,18 %] ; **S4-P 294 jours** ; **S4-J 293 / 3 232 = 9,07 % [8,12 ; 10,10 %]** ; T_c remplacées par le plancher 291 / 3 232.

**Rapportés [mesuré]** :

- **S2**, P90 / médiane (sem. 5-12 / 13-24) : J perte 1,83 / 2,26, prise 2,24 / 2,01 ; C 1,34 / 1,18 et 1,72 / 1,42 ; A 1,98 / 2,66 et 3,55 / 3,59.
- **S7** : suiveurs 254 / 603 = 42,1 % dans tous les bras ; non-suiveurs (1 212) : A 17,5 %, J 21,1 %, C 34,1 %, J-NASEM 20,5 %.
- **S5 et S5b par densité de pesée** (perte et prise ensemble ; tableau ajouté après la mesure V1, voir section 10) :

| Densité | S5 (J − A), sem. 5-12 / 13-24 | S5b 0 % | S5b 15 % | S5b 30 % (sem. 5-12 / 13-24) |
|---|---|---|---|---|
| 1,00 | −0,358 [−0,413 ; −0,307] / −0,469 | −0,012 [−0,041 ; 0,013] / +0,001 [−0,010 ; 0,012] | +0,049 [0,013 ; 0,094] / +0,081 [0,055 ; 0,106] | +0,148 [0,090 ; 0,219] / +0,255 [0,208 ; 0,313] |
| 0,90 | −0,000 [−0,024 ; 0,015] / −0,005 | +0,370 / +0,494 | +0,262 / +0,394 | +0,319 / +0,421 |
| 0,75 | +0,001 [−0,002 ; 0,012] / +0,010 | +0,408 / +0,528 | +0,338 / +0,519 | +0,331 / +0,489 |

- **S5 et S5b par part déclarée « écart important »** : `tables2r.md`, section 4 (S5 négatif et S5b positif, IC compris, pour chaque part).
- **Propositions** : 80 %, 609 / 1 334 = 45,7 % [43,0 ; 48,3 %] ; 95 %, 1 290 / 1 333 = 96,8 % ; 100 %, 1 333 / 1 333 ; jour médian 14. **Non-suiveurs sans proposition** (768) sous la méthode actuelle : perte 1,092 [1,048 ; 1,164] et 1,104 ; prise 0,498 [0,290 ; 0,730] et 0,439.
- **Garde-fous, basculés** : G1 chez 241 (A), 188 (J, dont 27 par le chemin journal), 181 (C) ; G2 chez 453, 428 (123 événements par le chemin journal), 391 ; **0 échec de reconstruction**. Fins sous IMC 20 vrai : A 14,1 % [13,0 ; 15,4 %], J 9,5 % [8,5 ; 10,6 %], C 2,6 % [2,1 ; 3,2 %] ; IMC vrai minimal 12,88 (A), 13,56 (J), 18,95 (C).
- **7.4, médianes, basculés** : délai jusqu'à [0,85 ; 1,15] 14 j (A, J), 21 j (C) ; pic de ratio 1,35 (A), 1,37 (J), 1,54 (C) ; recalibrations 3 (A), 0 (J), 11 (C) ; variation hebdomadaire du maintien affiché 15,5 (A), 30,5 (J), 50,5 (C) kcal/j ; écart à l'oracle du plan journal −10,2 (signé) et 119,9 kcal/j (absolu).
- Strates (sexe, IMC, activité, objectif, s, densité, fréquence, part déclarée) : `tables2r.md`.

### 4.3 Arrêt V1

**Arrêt V1 (A6.3) déclenché** : la règle de A2.1 échoue en P00, sur la première passe comme sur la passe doublée. Les critères bloquants de C1 du bras J sont GO en P00 (passe doublée). V2, les glucides, C2 et C6 ne sont pas lancés.

## 5. C1, validation V2

Non exécutée (arrêt V1, 10.3) : ni P05, P10, P20, ni sensibilités, robustesse, acceptation à 70 %. La conclusion de A2.1 est acquise en P00 (A6.3) : **le mode journal n'est pas retenu comme forme d'intégration.**

## 6. Glucides

Non exécutés (arrêt V1 ; 10.5 : A2.1 conclut que le mode journal ne fait pas mieux que la cible choisie).

## 7. C2

Non exécuté (mêmes arrêts).

## 8. C6

Non exécuté (mêmes arrêts).

## 9. Arrêts déclenchés et temps de calcul

**Arrêts** :

- 10.1 : non déclenché (4.5, 4.6, 6.1, 6.2 passés).
- 10.2 : non déclenché (projection 6,94 h).
- **10.3, arrêt V1 : déclenché** après la validation V1 (A2.1 NO-GO en P00), confirmé par la passe doublée.
- 10.5 : la règle de A2.1 conclut que le mode journal ne fait pas mieux que la cible choisie (P00) : ni glucides, ni C2, ni C6.
- 10.6 : passe doublée de V1 exécutée (S1 prise INCONCLUSIF) ; passe doublée de l'entraînement non exécutée (section 3).

**Temps [mesuré]** (`results/it2r/timing/launch-times.txt`, journaux des commandes) :

| Étape | Durée réelle |
|---|---|
| `npm run check` (départ, après le prototype, fin) | 30 s, 41 s, 40 s |
| captures avant / après | 44 s / 44 s |
| exploration des cas de test (graines du pilote) | ≈ 3 min |
| rejeu de `real2c` (16 sous-shards) | 127 s |
| 6.1 équivalence | 130 s |
| 6.2 appariement | 172 s |
| 6.3 pilote | 312 s |
| entraînement | 2 847 s |
| V1 | 1 168 s |
| V1, passe doublée | 2 374 s |
| tableaux | ≈ 1 min par reconstruction |
| **Total** (amendement à 21 h 08, dernière mesure à 23 h 43, `npm run check` final vers 23 h 47) | **≈ 2 h 40**, sous le plafond de 8 h |

## 10. Non fait, incertitudes, incohérences

**Non fait**

- V2 (P05, P10, P20), sensibilités [S], robustesse, acceptation à 70 %, glucides (A1.1, A2.2), C2, C6 : arrêt V1.
- **Passe doublée de l'entraînement** : non exécutée, alors que la règle écrite dans `tables2r.experiment.ts` avant la mesure l'appelait. Raison, et absence d'effet sur X : section 3. C'est un écart à ma propre procédure pré-enregistrée, pas au prompt (7.1 donne X = 100 % si aucun X ne passe) ; à valider par le product owner.
- Aucun paramètre, seuil, prior, sigma, poids, tolérance ni définition modifié après un résultat. Aucune correction après l'échec de A2.1.

**Ajout après mesure**

- Le tableau « S5 et S5b par densité de pesée » a été ajouté au script des tableaux après la première passe de V1 (commit `ffee4d2`). La stratification par densité de pesée est demandée en s11 ; le premier script ne la donnait que dans la table des strates, en valeurs ponctuelles. Ce tableau n'a pas de verdict et ne change aucun critère.

**Incertitudes (lectures déclarées avant la mesure)**

- **Jugement par objectif** de S1, S5, S5b, S6 et P00 (écart 8) : lecture la plus stricte. Les valeurs perte et prise regroupées sont dans `tables2r.md` ; en S5b, elles sont aussi toutes NO-GO (par exemple 0 % : +0,192 [0,151 ; 0,233] et +0,205 [0,171 ; 0,257], passe doublée).
- **Population jugée du bras J** (A6.2) : tous les non-suiveurs basculés, y compris les deux tiers qui n'obtiennent jamais de plan journal avec X = 100 % et gardent leurs habitudes (3.8). Leurs blocs entrent dans S1, S5 et S5b ; ils n'entrent pas dans S3-P, S3-D, S4-P ni S4-J (pas de jour de référence). [mesuré] Chez les basculés pesés chaque jour, S5b vaut −0,012 [−0,041 ; 0,013] et +0,001 à 0 %, +0,049 et +0,081 à 15 %, +0,148 et +0,255 à 30 % (passe doublée, 4.2). [déduit, sans verdict] La règle de A2.1 n'y passerait pas non plus pour 15 % et 30 %.
- **Durée de la cible choisie** : dans le bras C, la première recalibration de la méthode actuelle arrive environ une semaine après la bascule (le bras C déclare « plan respecté » hors jours d'écart). [mesuré] 1 687 et 3 449 vérifications S3-P exemptées, soit environ une par basculé.
- **S4-P du bras C** (rapporté) : 126 et 294 jours où la cible est sous le plancher de l'app. [lu] `withChosenTarget` (`closedLoop.ts`) contrôle T_c au plancher D-32 recalculé le jour de la bascule (4.5) mais garde le champ `hardFloorKcal` du plan précédent, que S4-P lit. [déduit] Les jours comptés peuvent venir de cet écart ; non instruit plus loin (sans verdict).
- **S4-J du bras C** (9,1 %) et **de J-NASEM** (5,2 %, plancher saisi non relevé) sont rapportés sans verdict ; celui du bras J, avec le plancher × 1,10, est à 0,27 %.

**Incohérences et constats [mesuré]**

- La porte du mode journal avec X = 100 % n'est franchie que par 34,9 % des basculés (1 127 / 3 232), presque tous pesés chaque jour (1 066 des 1 127).
- Les propositions de révision dépendent fortement du facteur de 5.1 : 45,7 % des non-suiveurs qui déclarent 80 % de jours d'écart, 96,8 % à 95 %, 100 % à 100 %.
- Aucune proposition chez les 3 000 suiveurs (V1 et passe doublée) : S6 vaut exactement 0.
- Aucun échec de reconstruction de garde-fou, dans aucun bras.
- Le `.gitignore` modifié, `proto2c.diff` et `results.zip` ne sont pas de mon fait ; je n'y ai pas touché. Le worktree `Weighty-bench` existant n'est pas de mon fait.
