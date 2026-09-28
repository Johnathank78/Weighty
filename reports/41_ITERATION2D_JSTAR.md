# 41 : itération 2d, niveau 2 complet (J*) contre « cible choisie »

Mesures seulement : aucune fonctionnalité visible, aucune sortie de production modifiée quand les options sont absentes. Branche `bench/journal-battery`, rien sur `main`, aucun merge. Seuils : `tests/experiments-journal/THRESHOLDS.md`, amendements 1 à 7. Tableaux : `tests/experiments-journal/results/it2d/tables2d.md` et `verdicts2d.json`.

Conventions : **[lu]** chemin:lignes ; **[mesuré]** fichier de résultats ; **[déduit]** raisonnement.

## Synthèse

| Étape | Résultat |
|---|---|
| 2 amendement 7 | commité seul, `4d4346a`, avant toute mesure |
| 4.4 non-régression, options absentes | **0 différence** sur 2 523 011 valeurs ; rejeu du shard 5 de `c1v1x2` (rapport 40) : **0 différence** sur 1 918 176 valeurs |
| 4.5 tests | 14 tests (h, construction, surfaçage, G1 et G2 en J*, bras C, ordre, isolement) et 2 tests de graines, verts |
| 6.1 repli | **passe** : 235 basculés à densité 0,90 / 0,75 ; 229 sans plan J*, identiques à C sur 168 jours ; 6 avec un plan J*, identiques jusqu'à la veille |
| 6.2 appariement | **passe** : 100 bras, 0 différence |
| 6.4 pilote | projection 7,94 h, sous 8 h ; aucune réduction ; N inchangé (plus petite cellule attendue : 740 basculés) |
| 5.4 contrôle continu | 0 différence dans toutes les étapes (6 058 + 8 057 + 403 + 3 × 6 028 utilisateurs) |
| V1, P00, R0 à R30 | **GO** : NI GO dans les 12 cellules (J* meilleur dans 8), sécurité de J* GO par comportement, S1 GO |
| V2, P00, H1 à H3 | **GO** : NI GO dans les 12 cellules (J* meilleur dans 9), sécurité de J* GO par comportement ; H4 rapporté |
| V3, P05, P10, P20 | **NO-GO** : NI GO dans les 36 cellules, S1 GO ; sécurité de J* **NO-GO en P05** : S4-J chez R0 = 2,00 % [1,47 ; 2,71 %] ; P10 et P20 GO |
| V4 | non exécutée (arrêt 10.3) |
| Décision A7.5 | **J* n'est pas retenu** ; C reste la candidate (itération 4) |
| Temps | 5 h 36 décomptées sur le plafond de 8 h (7 h 48 de temps réel, moins 2 h 12 de session de jeu exclues par le product owner) |

---

## 0. État de départ et commit de l'amendement 7

- **[mesuré]** `git status` au départ, branche `bench/journal-battery` : `.gitignore` modifié hors de mes commits (non touché, non commité) ; non suivis : `reports/31_…`, `33_…` à `40_…`, `tests/experiments-journal/results/results.zip` (non commité).
- **[mesuré]** `git log --oneline -3` : `ffee4d2 bench(journal): iteration 2 relaunch, doubled V1 pass in P00 (s7) …`, `8eccbde …`, `e0f53e6 …`.
- **[mesuré]** `npm run check` au départ : **vert**, typecheck et lint sans erreur, **559 / 559** tests (50 fichiers), 41,5 s.
- **Commit de l'amendement 7 : `4d4346a`** (17 h 10), `THRESHOLDS.md` seul, avant toute exécution de mesure.
  - **[mesuré]** Les 62 lignes ajoutées sont identiques, par `diff`, aux lignes 288 à 349 du prompt (le contenu du bloc ```` ```markdown ````, sans les délimiteurs `DÉBUT` / `FIN` ni les clôtures du bloc).
  - Même convention qu'aux amendements précédents : une ligne vide avant, fins de ligne CRLF de la copie de travail.
- **[mesuré]** `npm run check` à la fin : **vert**, **575 / 575** tests (52 fichiers : +14 de `jstar2d.test.ts`, +2 de `seeds2d.test.ts`), 58 s.

Commits de l'itération :

| Commit | Contenu |
|---|---|
| `4d4346a` | amendement 7 (s2) |
| `ed30f5b` | prototype (option du domaine, bras J* et C amendé, comportements, plan d'expérience), graines déclarées et leur test, tests de 4.5, preuve de non-régression, rejeu de `c1v1x2` (s3) |
| `c63029e` | harness, contrôles 6.1 et 6.2, pilote de coût et projection, script des tableaux, avant toute mesure (s4) |
| `4dfbe8d` | V1 : bruts, tableaux (s5) |
| `b39efbe` | V2 et H4 : bruts, tableaux (s6) |
| `d19bd1e` | V3 : bruts, tableaux, verdict final (s7) |

Ce rapport, sous `reports/`, n'est pas commité, comme les rapports 34 à 40.

## 1. Prototype

### Fichiers et signatures

**`src/domain/engine.ts`** (seul fichier de `src/` modifié, derrière une option) **[lu]** :

- `SolverRequest.hardFloorMultiplier?` (l. 76-85) : facteur de plancher des plans reconstruits avec cette requête prototype (recalibration, recalcul périodique, garde-fous, changement d'objectif). `buildPlanFromStore` le passe à `buildPlan` (l. 253), qui le met dans le contexte du plan (`hardFloorMultiplier`, l. 99-100) ; `solverOptionsFor` le retire des options de solveur (l. 218). Absent : code et objets identiques à avant.
- `PlanBuildInput.hardFloorMultiplier?` (l. 65-69).
- C'est le seul chemin par lequel « plans de la méthode actuelle (`hardFloorMultiplier`) » (3.2) peut s'appliquer aux recalibrations, recalculs et garde-fous du domaine.

**`tests/helpers/closedLoop.ts`** **[lu]** :

- **Comportements (5.3)** : `PostSwitchBehavior`, `POST_SWITCH_DEVIATION` (fréquence des jours d'écart : R0 0, R15 0,15, R30/H1/H2a/H2b/H3 0,3, H4 0), `H2_SPLIT_DAY = 84`, `H1_EXCESS_TC_SHARE = 0,25`, `H3_UNLOGGED_PROBABILITY = 0,5`, flux dérivé `H3_STREAM = 14` (l. 90-103). `ProfileSlot.postSwitch?`.
- **Plan d'expérience (5.1)** : `SlotDesign` et `closedLoopSlots(n, seed, majorShareSeed?, design?)` (l. 256) : niveaux de la dimension objectif (5 niveaux perte, perte, maintien, prise, prise → 2/5, 1/5, 2/5), niveaux de densité de pesée, et une dimension latine de plus, le comportement après la bascule, tirée d'un générateur à part après toutes les autres. Sans `design` : plan d'expérience inchangé.
- **Bras** : `ChosenTargetSettings` (plancher × facteur, champ de plancher M3), `JStarSettings`, `ArmConfig` étendu (`C` avec `chosen?`, `JS`). Mode `'JS'`.
- **`withChosenTarget(store, date, target, chosen?)`** (l. 940) : avec `chosen`, contrôle au plancher D-32 du jour × 1,10 et champ `hardFloorKcal` du plan mis à cette valeur (correctif M3) ; sans : inchangé.
- **`habitOf(store, prepared, switchDate, date, windowDays, bounds)`** (l. 1108) : h(D) = Σ I_d / Σ T_d sur [max(bascule ; D − 28) ; D − 1] ; I_d par `reconstructDays` (calibration) sur l'entrée de calibration du mode journal ; T_d = `calorieTargetForDay` du journal quotidien ; bornes [0,80 ; 1,25] ; borne appliquée rendue.
- **`jstarPlanOf(store, date, base, h, floorFactor, solver?, overrides?)`** (l. 1146) : `journalGoalPlan` avec le facteur de plancher 1,10 × h, T = I* / h, macros `macrosFor` (la fonction du solveur de production) pour T dans le contexte du plan, champ de plancher = D-32 × 1,10, vitesse retenue pour I* ; échec : raison (`no_feasible_speed`, statut du solveur, ou `macro_infeasible_target`).
- **`enforceJStarPlanGuardrails(…)`** (l. 1185) : règles de `enforceJournalPlanGuardrails`, plan reconstruit par `jstarPlanOf` (G1 : maintien au poids de l'app ; G2 : vitesse demandée plafonnée, pas conservés).
- **`jstarSurfaced(gate, M, width80, h, reference, today)`** (l. 1219) : `shouldSurfaceRecalibration` sur M / h et largeur / h.
- **Boucle** : `solverFor` (l. 1596 : requête avec `hardFloorMultiplier` = 1,10 en mode C après la bascule, bras C et repli de J*), `evaluateJStar` (l. 1664 : porte de niveau 2, premier plan sans surfaçage, recalibrations), `jstarPeriodicStep` (l. 1732), `jstarGuardStep` (l. 1749), `deviationOn` (l. 1784 : fenêtres de H2a et H2b), comportements dans `eatAndLog` (l. 1829 et suivantes), ordre d'un jour d'évaluation dans `morning` (l. 1953 : G, puis porte ou évaluation J*, sinon la méthode actuelle ; recalcul périodique et S3-P ensuite).
- **Sorties** : `JStarEvalRecord`, `JStarBuildRecord`, `SimState.jsEvals`, `jsBuilds`, `hDay`, `iStarDay`, `chosenFloorFactor`, `jsRef`.

**`tests/experiments-journal/it2r/jobs2r.ts`** : `refDay2r` rend le premier plan J* pour le bras `JS` (comme pour J) ; les autres bras sont inchangés.

**`tests/experiments-journal/it2d/`** : `jobs2d.ts` (graines, tailles, bras `ARM_C2D` et `ARM_JS`, tâches, contrôle continu `continuityMismatch`, colonnes `columns2d`, échantillon quotidien), `run.experiment.ts` et `launch.sh` (16 processus ; une différence du contrôle continu fait échouer le shard), `repro2r.experiment.ts`, `pairing2d.experiment.ts`, `projection.experiment.ts`, `tables2d.experiment.ts`.

### Écarts à ce prompt et lectures déclarées (fixés avant toute mesure)

1. **Option du domaine** : le plancher × 1,10 des plans de la méthode actuelle du bras C passe par un champ optionnel de la requête prototype (`SolverRequest.hardFloorMultiplier`, `src/domain/engine.ts`) ; c'est « derrière une option » (4.1, 4.2). Absent : preuve au bit près (4.4).
2. **Ordre du jour d'ouverture de la porte** : pendant le repli, le jour d'évaluation fait G (règles de C), puis la porte de niveau 2 ; si elle est ouverte et que le premier plan J* est construit, la méthode actuelle n'évalue pas ce jour-là (« à partir de ce jour ») ; sinon, l'évaluation de la méthode actuelle a lieu comme en C. Un premier plan J* en échec laisse l'utilisateur en repli ; la porte est réévaluée la semaine suivante.
3. **Aucun tirage d'acceptation** n'est consommé par J* : le premier plan est appliqué sans surfaçage, et une recalibration surfacée est acceptée à 100 % (3.1.8, 3.1.9).
4. **Référence du surfaçage** : M / h et largeur / h de la dernière recalibration J* appliquée (premier plan compris), datée de son jour ; une recalibration surfacée mais en échec ne change pas la référence.
5. **I_d** : `reconstructDays` de `src/science/calibration.ts` (l'imputation des jours non exploitables vit là, appelée par le chemin journal) sur l'entrée de calibration du jour ; au-delà de la dernière pesée, prolongement comme `modeledBodyAt`. Avec la densité 1,00, la dernière pesée est celle du jour même : ce prolongement n'intervient pas [déduit].
6. **Champs du plan J*** autres que ceux de 3.1.6 : ceux du plan journal (`journalPlanOf`) ; maintien affiché = M (unités de saisie), intervalles de l'estimation, avertissements du solveur calculés à I*.
7. **Test 4.5.4 (« T = plancher × 1,10 à 1e-9 près »)** : inapplicable tel quel. Le solveur de production ne ramène pas la cible au plancher : il rejette une vitesse dont la cible est sous le plancher et descend la grille des vitesses [lu] `src/science/goals.ts:528-535`, `buildGoalPlan`. Avec le plancher actif, la cible retenue est au-dessus du plancher, sans l'égaler. Le test vérifie donc T ≥ plancher × 1,10 (à 1e-9), I* ≥ h × plancher × 1,10, le rejet `below_hard_floor` d'une vitesse plus rapide, la vitesse ralentie, et l'échec `no_feasible_speed` quand h relève le plancher au-delà de toute vitesse.
8. **Comportement** : dimension latine propre (graine b + 999 977), valeurs de l'étape en parts égales ; sa fréquence de jours d'écart remplace celle du profil ; les tirages des jours d'écart restent ceux du flux 9. H1 : T_c = la cible choisie finale (après contrôle au plancher). H3 : « saisie d'un jour normal » = la saisie calculée à partir de l'apport sans l'excès (mêmes bruits).
9. **Objectifs** : l'hypercube permet 2/5, 1/5, 2/5 ; mais les cas R et S (1 profil sur 25 chacun, en perte, « comme à la reprise ») remplacent 8 % des profils : proportions réalisées perte 44,8 %, maintien 18,4 %, prise 36,8 % [déduit]. N n'est pas augmenté : la plus petite cellule perte ou prise attendue reste au-dessus de 700 basculés (section 2).
10. **Populations de V3 et sensibilités de V4** : les mêmes utilisateurs (profils et graines maîtresses) dans chaque population, u tiré selon sa loi (convention de la reprise).
11. **Sécurité de J* « dans chaque comportement jugé et chaque population »** : jugée par comportement × population (V4 : par sensibilité × comportement), lecture stricte du texte d'A7.4.
12. **S1 de J*** : utilisateurs basculés du bras JS, avec ou sans plan J* (ceux sans plan sont identiques à C), tous les blocs des fenêtres (A6.5).
13. **Erreur de h** : le rapport réalisé utilise les totaux saisis ; chaque jour de la simulation est exploitable (trois repas saisis, règle R0), donc I_d = total saisi [déduit].
14. **Contrôle 6.1** : 300 non-suiveurs (graines de contrôle) pour obtenir au moins 200 basculés ; tous les comportements.
15. **Pilote** : 64 non-suiveurs par type d'étape (≈ 52 basculés) au lieu de 50 basculés exactement.

### Isolement (4.3)

- **[mesuré]** Test « isolation » de `tests/domain/jstar2d.test.ts` : aucun module de `src/store`, `src/app`, `src/screens`, `src/components`, `src/hooks` ni `src/main.tsx` ne mentionne les identifiants nouveaux (`jstar`, `JStar`, `habitOf`, `hardFloorMultiplier`, `postSwitch`, …). Les tests d'isolement précédents et le test statique D8 restent verts (`npm run check`).

### Preuve de non-régression, options absentes (4.4)

- Capture : scripts de `tests/experiments-journal/capture/` (T-03, T-04, golden, R et S, `convergenceJourney`). Avant : `4d4346a` (`src/` identique à `ffee4d2`), dans un worktree. Après : prototype de s3.
- **[mesuré]** `results/it2d/controls/nonregression.txt` : **2 523 011 valeurs, 0 différence** (554 identifiants aléatoires masqués). T-03, T-04 et golden identiques à l'octet (`3447793a…`, `c65c47cf…`, `e20b17f4…`, les mêmes qu'aux itérations précédentes).
- **[mesuré]** `results/it2d/controls/repro2r.txt` : shard 5 de `c1v1x2` (passe doublée de V1 du rapport 40 ; 375 utilisateurs, bras A, J, C, J-NASEM) rejoué avec le simulateur de cette itération dans la configuration du rapport 40 : 1 500 lignes, **312 000 valeurs, 0 différence** ; 73 008 lignes quotidiennes, **1 606 176 valeurs, 0 différence**.

### Tests (`tests/domain/jstar2d.test.ts`, 14 tests ; `tests/domain/seeds2d.test.ts`, 2 tests)

1. **h** : store construit (cibles 2 000 + 10 d, saisies 0,95 × cible + 3 d, jour 30 sans saisie) : le jour 30 est non exploitable ; h = la valeur calculée à la main, imputation du jour 30 par la médiane des 14 jours précédents comprise, à 1e-12 ; fenêtre coupée à la bascule (22 jours) et bornée à 28 jours ; borne basse (saisies 0,7 × cible → 0,80) et haute (1,4 → 1,25) appliquées et signalées.
2. **h = 1** : cible, vitesse, champ de plancher, macros (exactes et affichées) et règle de protéines identiques au bit près à `journalGoalPlan` avec le facteur 1,10. Les macros sont identiques : même fonction (`macrosFor`), même contexte.
3. **h ∈ {0,90 ; 1,12}, plancher inactif** : |T − I* / h| ≤ 1e-9 ; I* et vitesse identiques à h = 1 ; macros = `macrosFor` pour T.
4. **Plancher actif** (femme 152 cm, offset −150) : voir écart 7.
5. **Surfaçage** : M constant, h passant de 1 à la valeur qui déplace M / h de 76 kcal/j : proposé ; de 35 kcal/j : non proposé ; h inchangé : non proposé.
6. **G1 et G2 en J*** : stores construits : plans identiques à `jstarPlanOf` avec les surcharges de 3.1.11, T × h = I* à 1e-9, champ de plancher D-32 × 1,10, S3-P sans violation. En boucle fermée (fixtures 90 003, 90 005, 90 100, 90 101 des graines du pilote) : G1 et G2 par le chemin J* après le premier plan J*, S3-P sans violation.
7. **Bras C** (fixtures 90 200 et 90 201, T_c remplacée par le plancher × 1,10 ; 90 003 et 90 005) : champ de plancher du plan de la cible choisie = plancher × 1,10 ; T_c ≥ plancher × 1,10 ; toute cible ultérieure ≥ son champ de plancher ; aucun jour où la cible est sous le champ de plancher (S4-P) ; le plan final de la méthode actuelle a un champ = D-32 × 1,10.
8. **Ordre** : sur 4 utilisateurs × 2 bras, plans d'un même jour dans l'ordre garde-fou, calibration, recalcul ; chaque S3-P lit le plan en vigueur en fin de matinée ; aucune recalibration de la méthode actuelle à partir du premier plan J*.

## 2. Contrôles

### Graines

- **Déclarées** **[lu]** `tests/experiments-journal/it2d/jobs2d.ts:1-35`, `SEED_BASES_2D` : 10 bases de 100 000 000 à 281 800 000, espacées de 20,2 millions, dans l'intervalle libre entre les phases 1 et 1b (< 6·10⁶) et l'itération 2 (≥ 10⁹), hors des graines de bootstrap (38 à 41 millions).
- **[mesuré]** `tests/domain/seeds2d.test.ts` (vert) : enveloppes sous 2³², disjointes entre elles, de toutes les passes précédentes (phases 1 et 1b, itérations 2, 2a, 2b, 2c, reprise) et des graines de bootstrap ; chaque graine consommée (maîtresses, flux k ≤ 20, graines d'hypercube, de part déclarée, de comportement, d'échantillon, fixtures des tests) est dans l'enveloppe de sa base et unique.

### 6.1 Repli

- **[mesuré]** `results/it2d/controls/fallback2d-shard*.csv.gz`, `tables2d.md` section 2 : 300 non-suiveurs de P00 pesés avec une probabilité 0,90 ou 0,75, graines de contrôle, tous les comportements ; **235 basculés** (0,90 : 122 ; 0,75 : 113).
- **229 basculés sans plan J*** : bras J* **identique au bras C au bit près sur les 168 jours** (séries, plans, évaluations, recalculs, garde-fous, S3-P, plan et profil finaux).
- **6 basculés franchissent quand même la porte** (tous à 0,90, une série de 28 jours pesés) : identiques au bras C jusqu'à la veille de leur premier plan J*.
- **Verdict 6.1 : PASSE.**

### 6.2 Appariement

- **[mesuré]** `results/it2d/controls/pairing.txt` : 50 non-suiveurs de P00, densité 1,00, tous les comportements ; 42 bifurqués, 41 bras J* avec un plan J*, 10 utilisateurs avec un garde-fou. **100 bras comparés à leur rejeu intégral depuis le jour 0 : 0 différence** (état complet, J* compris, plan, profil, pesées, journaux, entrées).
- **Verdict 6.2 : PASSE.**

### 6.3 Tests et non-régression

4.4 et 4.5 passent (section 1).

### 6.4 Pilote de coût

- **[mesuré]** `results/it2d/pilot/projection.txt` et `pilot2d-timing-shard*.json` : 4 × 64 non-suiveurs (V1 : P00, R ; V2 : P00, H1 à H4 ; V3 : P10, R ; V4 : P10_sd20, R), 212 basculés, 16 processus, 139 s ; efficacité parallèle 0,914.
- Coût moyen par utilisateur (un processus) : V1 8,1 s (commun 0,48 ; C 2,64 ; J* 5,02), V2 7,8 s, V3 8,3 s, V4 7,6 s.
- Projection (sans passe doublée) : V1 69,6 min ; V2 89,0 ; H4 4,5 ; V3 213,6 ; V4 38,8. Avec 31 min écoulées depuis l'amendement et 30 min de tableaux et de rapport : **7,94 h, sous le plafond de 8 h. Aucune réduction de la section 9.**
- Avec une passe doublée de V1 et de V2 : 13,22 h. [déduit] Aucune passe doublée ne tient dans le plafond.
- **Taille des cellules (7)** : part de basculés du pilote, regroupée (la proposition précède toute lecture du journal et tout comportement d'après la bascule) : 0,828. Plus petite cellule perte ou prise attendue : V1 prise × R30, 912 utilisateurs → 755 basculés ; V2 prise × H3, 894 → 740 ; V3 prise × R0, 896 → 742 par population. Toutes ≥ 700 : **N inchangé**.
- Les sorties par utilisateur du pilote sont supprimées ; seuls les temps sont commités.

## 3. V1 : P00, R0, R15, R30

Graines `v1` (140 400 000), 7 500 non-suiveurs de P00, densité 1,00, 2 500 par comportement ; bras C et J* (K2 + G). **[mesuré]** `results/it2d/v1/v1-shard*.csv.gz`, `tables2d.md` section 3, `verdicts2d.json`. Durée : 3 814 s.

**Population [mesuré]** : **6 058 basculés** (80,8 %), 1 442 sans proposition. **6 020 basculés (99,4 %) reçoivent un plan J***, jour médian 28, 14 jours médians après la bascule ; les 38 autres ont la porte ouverte à la dernière évaluation mais un premier plan en échec (écart 2). Basculés par cellule perte ou prise : de 732 (prise × R0) à 924 (perte × R30). **Contrôle continu (5.4) : 0 différence sur 6 058 utilisateurs.**

**NI (J* − C), Δ de la médiane de |ratio − 1|, apparié, seuil : borne haute ≤ +0,05 [mesuré]** :

| Comportement | Perte sem. 5-12 | Perte sem. 13-24 | Prise sem. 5-12 | Prise sem. 13-24 |
|---|---|---|---|---|
| R0 | 0,163 → 0,136 ; −0,028 [−0,038 ; −0,012] * | 0,073 → 0,072 ; −0,001 [−0,006 ; 0,003] | 0,347 → 0,295 ; −0,052 [−0,076 ; −0,025] * | 0,167 → 0,165 ; −0,001 [−0,012 ; 0,007] |
| R15 | 0,164 → 0,146 ; −0,018 [−0,028 ; −0,007] * | 0,094 → 0,083 ; −0,010 [−0,016 ; −0,005] * | 0,383 → 0,314 ; −0,069 [−0,094 ; −0,044] * | 0,212 → 0,211 ; −0,001 [−0,016 ; 0,010] |
| R30 | 0,174 → 0,161 ; −0,013 [−0,024 ; −0,001] * | 0,110 → 0,103 ; −0,007 [−0,013 ; −0,002] * | 0,415 → 0,335 ; −0,081 [−0,107 ; −0,046] * | 0,232 → 0,231 ; −0,001 [−0,014 ; 0,013] |

C → J*, Δ [IC 95 %] ; n de 732 à 910 par cellule. **Les 12 cellules sont GO.** \* : J* fait mieux que C (borne haute < 0), 8 cellules sur 12.

**Sécurité de J*, période après le premier plan J* [mesuré]** :

| Comportement | S3-P | S3-D | S4-P | S4-J |
|---|---|---|---|---|
| R0 | 0 / 39 468 évaluations, GO | 2,37 % [2,01 ; 2,75 %], GO | 0 jour, GO | 3 / 1 979 = 0,15 % [0,05 ; 0,44 %], GO |
| R15 | 0 / 40 124, GO | 2,99 % [2,57 ; 3,41 %], GO | 0, GO | 5 / 2 017 = 0,25 % [0,11 ; 0,58 %], GO |
| R30 | 0 / 40 254, GO | 3,24 % [2,81 ; 3,68 %], GO | 0, GO | 1 / 2 024 = 0,05 % [0,01 ; 0,28 %], GO |

Marges minimales de S4-J : −42,5, −58,7 et −17,3 kcal/j.

**S1 de J* (R0 à R30 regroupés) [mesuré]** : perte 1,015 [1,009 ; 1,021] et 1,012 [1,008 ; 1,016] ; prise 1,041 [1,025 ; 1,061] et 1,038 [1,026 ; 1,046] (sem. 5-12 et 13-24) : **GO**.

**V1 : GO** (aucune passe doublée).

**Bras C, sans verdict [mesuré]** : S1 perte 0,989 [0,981 ; 0,996] et 0,986 [0,982 ; 0,990], prise 1,165 [1,142 ; 1,188] et 1,007 [0,996 ; 1,019] ; S3-P 0 violation (6 568 vérifications exemptées, cible choisie) ; S3-D 2,90 % [2,66 ; 3,14 %] ; **S4-P 0 jour** (126 et 294 aux passes du rapport 40, avant le correctif M3) ; **S4-J 13 / 6 058 = 0,21 % [0,13 ; 0,37 %]**, marge minimale −48,7 kcal/j (9,1 % au rapport 40, avec le plancher × 1,00) ; T_c remplacées par le plancher × 1,10 : 961 / 6 058.

## 4. V2 : P00, H1, H2a, H2b, H3 ; H4

Graines `v2` (180 800 000), 10 000 non-suiveurs de P00, densité 1,00, 2 500 par comportement ; H4 : 500 depuis la sous-base b + 50 000. **[mesuré]** `results/it2d/v2/v2-shard*.csv.gz`, `v2h4-shard*.csv.gz`, `tables2d.md` section 4. Durées : 4 967 s et 297 s.

**Population [mesuré]** : **8 057 basculés** (80,6 %), 1 943 sans proposition ; **7 998 avec un plan J*** (99,3 %), jour médian 28 ; 59 avec la porte ouverte et un premier plan en échec. Basculés par cellule perte ou prise : de 733 (prise × H2b, prise × H3) à 944 (perte × H3). **Contrôle continu : 0 différence sur 8 057 utilisateurs.**

**NI (J* − C), seuil : borne haute ≤ +0,05 [mesuré]** :

| Comportement | Perte sem. 5-12 | Perte sem. 13-24 | Prise sem. 5-12 | Prise sem. 13-24 |
|---|---|---|---|---|
| H1 | 0,171 → 0,156 ; −0,015 [−0,027 ; −0,001] * | 0,105 → 0,098 ; −0,008 [−0,015 ; −0,002] * | 0,417 → 0,332 ; −0,085 [−0,116 ; −0,057] * | 0,233 → 0,222 ; −0,012 [−0,026 ; 0,001] |
| H2a | — | 0,188 → 0,112 ; −0,076 [−0,085 ; −0,065] * | — | 0,509 → 0,304 ; −0,205 [−0,220 ; −0,184] * |
| H2b | — | 0,149 → 0,093 ; −0,055 [−0,063 ; −0,047] * | — | 0,424 → 0,219 ; −0,205 [−0,222 ; −0,187] * |
| H3 | 0,184 → 0,171 ; −0,013 [−0,025 ; 0,001] | 0,113 → 0,105 ; −0,008 [−0,014 ; −0,002] * | 0,425 → 0,356 ; −0,069 [−0,097 ; −0,042] * | 0,242 → 0,233 ; −0,009 [−0,021 ; 0,008] |

n de 733 à 925 par cellule. **Les 12 cellules sont GO.** \* : J* fait mieux (borne haute < 0), 9 cellules sur 12.

**Sécurité de J* [mesuré]** :

| Comportement | S3-P | S3-D | S4-P | S4-J |
|---|---|---|---|---|
| H1 | 0 / 40 087, GO | 2,80 % [2,40 ; 3,19 %], GO | 0, GO | 1 / 2 012 = 0,05 % [0,01 ; 0,28 %], GO |
| H2a | 0 / 39 647, GO | 2,64 % [2,25 ; 3,03 %], GO | 0, GO | 7 / 1 985 = 0,35 % [0,17 ; 0,73 %], GO |
| H2b | 0 / 39 660, GO | 4,08 % [3,62 ; 4,54 %], GO | 0, GO | 6 / 1 996 = 0,30 % [0,14 ; 0,65 %], GO |
| H3 | 0 / 39 923, GO | 3,39 % [2,97 ; 3,84 %], GO | 0, GO | 1 / 2 005 = 0,05 % [0,01 ; 0,28 %], GO |

**V2 : GO** (aucune passe doublée).

**Bras C, sans verdict [mesuré]** : S3-P 0 violation (8 663 exemptées) ; S3-D 3,90 % [3,67 ; 4,15 %] tous comportements, dont **H2b 6,35 % [5,73 ; 6,98 %]** ; S4-P 0 jour ; S4-J 21 / 8 057 = 0,26 % [0,17 ; 0,40 %] (H2a 0,60 % [0,34 ; 1,05 %]) ; T_c remplacées 1 298 / 8 057.

### H4, robustesse (rapportée, sans verdict) [mesuré]

- 403 basculés, 399 avec un plan J* ; contrôle continu : 0 différence.
- Sécurité de J* : S3-P 0 violation sur 7 977 évaluations ; **S3-D 16,72 % [13,33 ; 20,06 %]** ; S4-P 0 jour ; **S4-J 6 / 399 = 1,50 % [0,69 ; 3,24 %]**, marge minimale −27,0 kcal/j.
- Stabilité de la cible affichée (variation hebdomadaire |ΔT|, médiane [P10 ; P90]) : C 48,8 [23,5 ; 72,8], J* 35,3 [13,7 ; 62,2] kcal/j.
- Bornes de h : borne basse atteinte chez 218 des 399 utilisateurs (1 457 constructions), borne haute chez 95 (715) ; h brut au premier plan P5 / médiane / P95 : 0,843 / 0,980 / 1,121 ; erreur de h médiane +0,049 [P10 −0,134 ; P90 +0,172].

## 5. V3 : P05, P10, P20, R0, R15, R30

Graines `v3` (221 200 000), 7 500 non-suiveurs par population, les mêmes dans chaque population (u tiré selon sa loi), densité 1,00. **[mesuré]** `results/it2d/v3/v3-shard*.csv.gz`, `tables2d.md` section 5. Durée : 14 512 s, dont environ 2 h 12 en priorité basse pendant la session de jeu du product owner (section 9).

**Population [mesuré]** : 6 028 basculés dans chaque population (la proposition précède toute lecture du journal) ; avec un plan J* : P05 5 910 (98,0 %), P10 5 838 (96,8 %), P20 5 461 (90,6 %), jour médian 28 ; les autres ont une porte ouverte et un premier plan en échec (118, 190 et 567). **Contrôle continu : 0 différence sur 3 × 6 028 utilisateurs.**

**Verdicts par population [mesuré]** :

| Population | NI (12 cellules) | Sécurité de J* | S1 de J* | Population |
|---|---|---|---|---|
| P05 | GO (12 / 12) | **NO-GO** | GO | **NO-GO** |
| P10 | GO (12 / 12) | GO | GO | GO |
| P20 | GO (12 / 12) | GO | GO | GO |

**Critère en échec, P05 [mesuré]** :

| Comportement | S3-P | S3-D | S4-P | S4-J |
|---|---|---|---|---|
| R0 | 0 / 39 904, GO | 2,17 % [1,85 ; 2,53 %], GO | 0, GO | **40 / 2 002 = 2,00 % [1,47 ; 2,71 %], NO-GO** (borne basse > 1 %) ; marge minimale −207,3 kcal/j |
| R15 | 0 / 39 020, GO | 2,73 % [2,33 ; 3,11 %], GO | 0, GO | 27 / 1 965 = 1,37 % [0,95 ; 1,99 %], INCONCLUSIF |
| R30 | 0 / 38 576, GO | 2,86 % [2,47 ; 3,28 %], GO | 0, GO | 26 / 1 943 = 1,34 % [0,91 ; 1,95 %], INCONCLUSIF |

S4-J de J* en P10 : 0,85 % [0,53 ; 1,36 %] (R0), 0,47 % (R15), 0,47 % (R30), GO ; en P20 : 0,16 %, 0,05 %, 0,11 %, GO.

**NI [mesuré]** : GO dans les 36 cellules. J* fait mieux que C (borne haute < 0) dans 9 cellules en P05, 10 en P10, 11 en P20. Seules cellules à Δ positif : prise × R0, semaines 13 à 24, en P05 (+0,014 [0,004 ; 0,024]) et en P10 (+0,011 [0,001 ; 0,022]), sous le seuil de +0,05.

**S1 de J* [mesuré]** : P05 perte 0,991 [0,982 ; 1,000] et 1,000, prise 1,018 [0,999 ; 1,038] et 1,025 ; P10 perte 0,971 et 0,985, prise 1,007 et 1,015 ; P20 perte 0,890 [0,878 ; 0,904] et 0,933 [0,925 ; 0,941], prise 0,977 et 1,000 : GO partout.

**V3 : NO-GO** (P05, S4-J de J* chez R0). La règle d'A7.4 donne NO-GO, pas INCONCLUSIF : **aucune passe doublée**. **Arrêt (10.3) : V4 n'est pas lancé.**

**Bras C, sans verdict [mesuré]** (tous comportements) : S4-J P05 112 / 6 028 = 1,86 % [1,55 ; 2,23 %] (R0 2,92 % [2,27 ; 3,74 %]), P10 0,78 % [0,59 ; 1,04 %], P20 0,05 % ; S3-D 3,19 %, 3,16 %, 4,16 % [3,87 ; 4,46 %] (P20 × R30 5,38 % [4,81 ; 6,02 %]) ; S4-P 0 jour ; S1 perte sem. 5-12 : 0,946, 0,906, 0,773 [0,755 ; 0,790] ; prise sem. 5-12 : 1,209, 1,278, 1,442 [1,411 ; 1,469] ; T_c remplacées : 1 193, 1 440, 2 072 sur 6 028.

## 6. V4 : sensibilités [S]

**Non exécutée** (arrêt 10.3 : V3 NO-GO). Les graines `v4` (261 600 000) et `v4x2` restent déclarées et inutilisées.

## 7. Décision de A7.5

**[mesuré]** `verdicts2d.json`, `decision` : V1 GO, V2 GO, **V3 NO-GO**, V4 non exécutée.

**J* n'est pas retenu.** Selon A7.5, C reste la candidate, jugée en itération 4. C2 et C6 restent non lancés.

## 8. Métriques rapportées (section 8, A7.6)

Valeurs complètes, IC et strates : `tables2d.md`, sous chaque étape. Principales **[mesuré]** :

**Porte du niveau 2** : 99,4 % (V1), 99,3 % (V2), 98,0 % (P05), 96,8 % (P10), 90,6 % (P20, V3) des basculés reçoivent un plan J*, jour médian 28, 14 jours médians après la bascule. Les autres ont une porte ouverte et un premier plan en échec (`no_feasible_speed` le plus souvent) ; ils restent en C.

**h au premier plan J* (brut, P5 / médiane / P95)** : R0 0,951 / 1,000 / 1,049 ; R15 0,973 / 1,037 / 1,100 ; R30 1,004 / 1,076 / 1,148 ; H1 1,001 / 1,072 / 1,150 ; H2a 0,952 / 1,000 / 1,051 ; H2b 1,002 / 1,072 / 1,151 ; H3 0,975 / 1,037 / 1,105 ; H4 0,843 / 0,980 / 1,121. Bornes atteintes : 2 constructions en borne haute en V1 (R30), 3 en V2 (H1), 1 457 basses et 715 hautes en H4.

**Erreur de h** (h retenu − rapport saisi / cible réalisé sur les 28 jours suivants ou jusqu'au plan suivant, tous plans, médiane [P10 ; P90]) : V1 0,000 [−0,076 ; 0,074] (73 881 plans) ; V2 0,000 [−0,084 ; 0,079] (100 310 plans), H2a −0,009, H2b +0,011 ; H4 +0,049 [−0,134 ; 0,172].

**M** : écart à la vérité en unités de saisie au premier plan J*, médiane [P10 ; P90] : V1 −1,1 [−330,8 ; 351,1] kcal/j, V2 −2,3 [−317,5 ; 341,2] ; |écart| moyen par utilisateur, médiane ≈ 65 kcal/j. Variation hebdomadaire de M / h, médiane : V1 47,4, V2 49,3 kcal/j. Recalibrations J* par basculé, médiane : 12 ; recalculs périodiques : 0.

**Constructions J* en échec** (plan laissé en place) : V1 1 654 (1 341 recalibrations et 116 recalculs `no_feasible_speed`, 197 `target_not_above_current`), V2 2 649. Constructions à plancher actif : V1 10 455, V2 13 988.

**S2** (P90 / médiane, basculés) : V1 perte C 1,352 / 1,197, J* 1,351 / 1,186 ; prise C 1,662 / 1,402, J* 1,642 / 1,385 (sem. 5-12 / 13-24). V2 perte C 1,395 / 1,273, J* 1,386 / 1,222 ; prise C 1,716 / 1,706, J* 1,681 / 1,485.

**S7** (maintien dans la zone à 8 semaines, non-suiveurs en maintien) : V1 C 37,5 % [35,0 ; 40,1 %], J* 36,6 % [34,1 ; 39,2 %] ; V2 C 35,7 %, J* 34,6 %.

**Garde-fous, basculés** : V1 : G1 chez 354 (C) et 367 (J* ; 342 événements par le chemin J*), G2 chez 682 et 665 (625 par le chemin J*) ; V2 : G1 482 et 510 (464), G2 886 et 868 (809) ; **0 échec de reconstruction de garde-fou**. Fins sous IMC 20 vrai : V1 C 3,24 % [2,82 ; 3,71 %], J* 4,08 % [3,61 ; 4,61 %] ; V2 C 3,70 %, J* 3,86 %. IMC vrai minimal : 18,64 (V1, les deux bras), 18,14 (V2, les deux bras).

**V3 [mesuré]** : h au premier plan (P5 / médiane / P95) ≈ 0,965 / 1,03 / 1,12 dans les trois populations, aucune borne atteinte ; constructions en échec 2 687 (P05), 4 077 (P10), 7 949 (P20) ; S7 : C 33,1 % / 31,0 % / 24,1 % [21,9 ; 26,4 %], J* 34,4 % / 35,2 % / 34,2 % [31,7 ; 36,7 %] ; fins sous IMC 20 vrai : C 3,17 / 2,75 / 1,81 %, J* 3,70 / 3,20 / 2,36 % ; IMC vrai minimal 18,24 dans les deux bras.

**Stratification de Δ (J* − C), perte et prise ensemble** : en V1, Δ ≤ 0 en semaines 5 à 12 dans toutes les strates (de −0,063 en prise à −0,009 à 0,5 %/semaine) ; en semaines 13 à 24, entre −0,018 (cas R) et +0,006 (IMC 21). En V2, le Δ des semaines 13 à 24 vaut −0,118 (H2a) et −0,104 (H2b). Par quartile de h au premier plan J* : V1 de −0,045 à −0,024 (sem. 5-12). Tableaux complets : `tables2d.md`.

## 9. Arrêts déclenchés et temps de calcul

**Arrêts** :

- 10.1 : non déclenché (4.4, 4.5, 6.1, 6.2 et le contrôle continu de 5.4 passés à chaque étape).
- 10.2 : non déclenché (projection 7,94 h).
- **10.3 : déclenché après V3** (NO-GO en P05, S4-J de J* chez R0) : V4 n'est pas lancé. Une passe doublée n'était pas prévue : V3 est NO-GO et non INCONCLUSIF.
- 10.4 : non déclenché.

**Temps [mesuré]** (`results/it2d/timing/launch-times.txt`, journaux des commandes) :

| Étape | Durée réelle |
|---|---|
| `npm run check` (départ, après le prototype, fin) | 66 s, 47 s, 58 s |
| captures avant / après (en parallèle) | ≈ 1 min |
| rejeu de `c1v1x2` (16 sous-shards) | 178 s |
| 6.1 repli | 105 s |
| 6.2 appariement | 61 s |
| 6.4 pilote | 142 s |
| V1 | 3 814 s |
| V2 / H4 | 4 967 s / 297 s |
| V3 | 14 512 s, dont 2 h 12 en priorité basse (session de jeu) |
| tableaux | ≈ 5 min (V1) à ≈ 16 min (reconstruction complète) |

**Plafond de 8 h [mesuré]** : amendement à 17 h 10, dernier commit de mesure à 00 h 57 et `npm run check` final à 00 h 58, soit 7 h 48 de temps réel. Le product owner a interrompu la session de 21 h 20 à 23 h 40. Pendant sa session de jeu, de 21 h 25 à 23 h 37, les 48 processus de V3 sont passés en priorité basse ; V3 a continué, ralenti, sans effet sur ses résultats, qui sont déterministes. **Sur décision du product owner (23 h 40), ces 2 h 12 ne sont pas comptées** : 5 h 36 décomptées, sous le plafond. Sans cette exclusion, le plafond aurait été atteint vers 01 h 10, après la fin de V3 (00 h 29) : le verdict de V3 et l'arrêt de V4 auraient été les mêmes [déduit].

Pour éviter la mise en veille (plan d'alimentation : 30 min d'inactivité), un processus temporaire a demandé « système requis » (`SetThreadExecutionState`) de 23 h 45 à la fin des mesures. Aucun réglage d'alimentation n'a été modifié.

## 10. Non fait, incertitudes, incohérences

**Non fait**

- V4 (sensibilités [S]) : arrêt 10.3. Toute passe doublée : aucune étape INCONCLUSIVE.
- C2 et C6 : non lancés (A7.5).
- Aucun paramètre, seuil, prior, sigma, poids, tolérance, fenêtre ou borne de h, règle de surfaçage, facteur de plancher ni définition modifié après un résultat. Aucune correction après un résultat.

**Incertitudes et lectures**

- Écarts et lectures 1 à 15 de la section 1, fixés avant toute mesure.
- **Test 4.5.4** : l'égalité T = plancher × 1,10 n'est pas testable avec le solveur de production (écart 7) ; la propriété testée est l'inégalité, et le ralentissement.
- **Sécurité par comportement** (écart 11) : lecture stricte ; les valeurs regroupées du bras C sont rapportées, celles de J* se déduisent des lignes par comportement.
- **H4** : S3-D de J* 16,7 % et S4-J 1,50 % [0,69 ; 3,24 %] sont rapportés sans verdict (A7.3) ; H4 ne fait partie d'aucun critère de A7.5.
- **Proportions d'objectifs** : 44,8 / 18,4 / 36,8 % au lieu de 2/5, 1/5, 2/5, à cause des cas R et S (écart 9).

**Incohérences et constats**

- Le message du commit `4dfbe8d` annonce « J* better in 9 » cellules en V1 ; les tableaux en donnent **8** (R0 perte et prise sem. 5-12, R15 perte sem. 5-12 et 13-24, R15 prise sem. 5-12, R30 perte sem. 5-12 et 13-24, R30 prise sem. 5-12). L'historique n'est pas réécrit ; le chiffre juste est 8.
- **Session interrompue et priorité réduite** : section 9 ; la décision d'exclure la session de jeu du plafond est celle du product owner, pas une règle du prompt.
- **S4-J en P05, bras C (rapporté)** : 1,86 % [1,55 ; 2,23 %] (R0 2,92 %). Le critère NO-GO de J* se trouve donc dans une population où C dépasse aussi le seuil ; comme le veut A7.4, ce fait ne change pas le verdict de J*.
- **Lancement enchaîné** : la commande qui a lancé V3 enchaînait aussi V4 ; je l'ai interrompue avant la fin de V3 (processus parent arrêté, V3 laissé intact), pour que V4 ne parte qu'après le verdict de V3 (10.3). V3 n'en est pas affecté [lu] `timing/launch-times.txt`.
- **Contrôle 6.1** : 6 basculés pesés à 0,90 franchissent la porte (série de 28 jours pesés) ; identité avec C vérifiée jusqu'à la veille de leur premier plan J*.
- Le `.gitignore` modifié, `results.zip` et le worktree `Weighty-bench` ne sont pas de mon fait ; je n'y ai pas touché. Le worktree `Weighty-2d-before` (capture « avant ») est de mon fait : retiré après la capture (jonction `node_modules` supprimée d’abord, dossier réel intact).
