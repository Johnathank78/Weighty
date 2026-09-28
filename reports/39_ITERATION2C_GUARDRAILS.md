# 39 : itération 2c, garde-fous du plan en cours et verdict A3.2 selon l'amendement 5

Mesures seulement : aucune fonctionnalité visible, aucune sortie de production modifiée quand l'option est absente. Branche `bench/journal-battery`, rien sur `main`, aucun merge. Seuils : `tests/experiments-journal/THRESHOLDS.md`, amendements 4 et 5. Tableaux : `tests/experiments-journal/results/guardrails2c/tables2c.md` et `verdicts2c.json`.

Conventions : **[lu]** chemin:lignes ; **[mesuré]** fichier de résultats ; **[déduit]** raisonnement.

## Synthèse

| Étape | Résultat |
|---|---|
| 2 amendement 5 | commité seul, `9a856a1`, avant toute mesure |
| 3.5 non-régression, option absente | **0 différence** sur 2 523 011 valeurs ; rejeu du shard 14 de `real2b` : **0 différence** sur 61 776 valeurs |
| 3.3 tests, cas 478 | verts ; sans G, IMC final 16,5 retrouvé au bit près ; avec G, G1 au jour 21 (IMC de l'app 19,998) |
| 4.1 graines et pilote | graines disjointes et valides (test vert) ; durée projetée sous le plafond de 4 h |
| 4.2 isolement dans la boucle | **passe** : 389 / 389 utilisateurs sans garde-fou identiques à K2 au bit près ; G1 chez 32, G2 chez 79, 0 échec |
| 4.2 A3.1, K2 + G | **PASSÉ** |
| 4.3 A3.2 amendé, K2 + G | **PASSÉ** : S1 ×4, S3-P 0, S3-D 2,44 % [2,09 ; 2,82 %], S4-P 0, S2-NI sur 7 cellules jugées |
| 4.3 sécurité (rapporté) | fins sous IMC 20 vrai : S0 3,55 %, K2 6,80 %, S0 + G 1,25 %, K2 + G 3,65 % ; IMC vrai minimal : 18,77 / 17,39 / 19,54 / 19,34 |
| 4.4 inventaire | fait (section 4) |
| Arrêts | aucun déclenché ; passes doublées déclarées, non nécessaires |

---

## 0. État de départ et commit de l'amendement 5

- **[mesuré]** `git status` au départ, branche `bench/journal-battery` :
  - `.gitignore` modifié hors de mes commits : non touché, non commité ;
  - non suivis : `reports/31_…`, `33_…` à `38_…`, `tests/experiments-journal/results/results.zip` (non commité).
- **[mesuré]** `git log --oneline -3` : `8d60518 bench(journal): iteration 2b realistic world (A3.2 fails for K2), first plan of K2, tables (s8)`, `eb360b5 …`, `94e15a2 …`.
- **[mesuré]** `npm run check` au départ : **vert**. Typecheck et lint sans erreur, **539 / 539** tests (46 fichiers).
- **Commit de l'amendement 5 : `9a856a1`**, `THRESHOLDS.md` seul, avant toute exécution de mesure.
  - **[mesuré]** Les 50 lignes ajoutées sont identiques, octet pour octet, aux lignes 213 à 262 du prompt (le contenu du bloc ```` ```markdown ```` sans ses clôtures, comparé par script).
  - Comme aux amendements précédents : une ligne vide avant, fins de ligne CRLF de la copie de travail.
- **[mesuré]** `npm run check` à la fin : **vert**, **548 / 548** tests (48 fichiers : +7 tests de `planGuardrails2c.test.ts`, +2 de `seeds2c.test.ts`), 32 s.

Commits de l'itération :

| Commit | Contenu |
|---|---|
| `9a856a1` | amendement 5 (s2) |
| `48a0680` | prototype : `enforcePlanGuardrails`, options de `changeGoal`, option `planGuardrails` du simulateur, tests, preuve de non-régression, rejeu de `real2b` (s3) |
| `7ad7fbb` | harness 2c, graines déclarées et leur test, script des tableaux, avant toute mesure (s4) |
| `7a39407` | monde idéal : bruts, tableaux (s5) |
| `e2e44d8` | monde réaliste : bruts, tableaux (s6) |

Ce rapport, sous `reports/`, n'est pas commité, comme les rapports 34 à 38.

## 1. Prototype

### Fichiers et signatures

- **`src/domain/engine.ts`** **[lu]** :
  - `GoalChangeOptions = { stepTarget?, solver? }` (l. 609) et `changeGoal(store, today, input, options?)` (l. 611-627) : les deux options passent à `buildPlanFromStore` seulement quand elles sont présentes ; absentes, l'appel est celui de la production ;
  - `PlanGuardrailResult` (l. 798-806) : `none` (avec le store reçu, même objet), `applied` (règle, IMC, nouveau store), `failed` (règle, IMC, raison) ;
  - `enforcePlanGuardrails(store, today, options = { solver? })` (l. 821-839).
- **`tests/helpers/closedLoop.ts`** **[lu]** :
  - `UserSpec.planGuardrails` (l. 331) et `SpecOptions.planGuardrails` (l. 346) ;
  - `GuardRecord` (l. 586) et `S3pRecord` (l. 602) ; `SimState.guards`, `s3p`, `planGoal`, `planFloor`, `appW` ;
  - `guardStep` (l. 1143), appelé par `morning` avant `evaluateCurrent` (l. 1291) les jours d'évaluation, modes `pre` et `A` seulement ;
  - `s3pCheck` (l. 1172), appelé dans `eatAndLog` après `periodicStep` (l. 1185), les jours d'évaluation ;
  - séries quotidiennes de l'objectif, du plancher du plan et du poids de l'app (l. 1273-1275).
- **Harness 2c** **[lu]** `tests/experiments-journal/it2c/` : `jobs2c.ts` (graines, bras, colonnes `columns2c`, échantillon quotidien), `run.experiment.ts`, `launch.sh`, `stats2c.ts`, `tables2c.experiment.ts`, `repro2b.experiment.ts`.

### Poids utilisé

- **[lu]** `engine.ts:175-179` : `currentWeightKg(store)` rend le dernier point de tendance (`trendKg`), sinon `profile.currentWeightKg`.
- **[lu]** `enforcePlanGuardrails` prend `currentWeightKg(store) ?? profile.currentWeightKg`, l'expression de `buildPlanFromStore` (`engine.ts:217`), et l'IMC de `bmi` (`src/science/macros.ts:34`).
- **[lu]** `buildGoalPlan` calcule `bmi(ctx.currentWeightKg, ctx.heightCm)` (`goals.ts:593`) puis appelle `lossAvailability` (`goals.ts:437`) ; `ctx.currentWeightKg` est le poids de l'évaluation (`assessment.ts:112`), c'est-à-dire ce même poids.
- **[déduit]** G1 se déclenche donc exactement quand une reconstruction du plan de perte finirait en `loss_unavailable_low_bmi`, et G2 compare au plafond que cette reconstruction appliquerait.

### Chemins de reconstruction

- **G1** (`engine.ts:829-831`) : `changeGoal(store, today, { goal: 'maintenance', targetWeightKg: poids, weeklyRate: 0 }, { stepTarget: plan.stepTarget, solver })`.
  - `changeGoal` met le profil en maintien (cible = ce poids, vitesse 0), puis appelle `buildPlanFromStore({ …, profile }, today, { source: 'initial', stepTarget, solver })` et aligne le journal du jour.
  - Point de départ : `buildPlanFromStore` prend `latestAppliedSnapshot(store)` quand l'option `snapshot` est absente (`engine.ts:216`), sinon l'estimation de population. Sans snapshot, `solverOptionsFor` laisse le solveur partir de l'équilibre (`engine.ts:201-211`), comme un premier plan.
  - Les recalibrations et recalculs suivants lisent `profile.goal` (`buildPlan`, `engine.ts:86`) : l'objectif reste le maintien.
- **G2** (`engine.ts:833-838`) : si `plan.weeklyRateTarget > guardrailMaxWeeklyRate('loss', IMC) + 1e-9` (même tolérance que `buildGoalPlan`, `goals.ts:610`), `buildPlanFromStore(ensureDailyLogs(store), today, { source: 'recalibrated', stepTarget: plan.stepTarget, solver })`, puis `syncTodayLogTargets`.
  - Ce sont les règles d'un recalcul : vitesse demandée du profil plafonnée, plancher, faisabilité des macros (`goals.ts:573-640`) ; même point de départ que G1.
- **Âge du plan** : `buildPlan` écrit `createdAt = today` (`engine.ts:124`) ; un plan issu de G remet l'âge à zéro (`planAgeDays`, `engine.ts:760`).
- **Échec** : le store entier reste inchangé, profil compris ; le harness compte l'événement avec sa raison.

### Écarts à ce prompt et leurs raisons

1. **Source du plan.** G1 passe par `changeGoal`, qui écrit `'initial'` ; G2 écrit `'recalibrated'`, comme le recalcul périodique. Le schéma n'accepte que trois valeurs (`types.ts:145`, `schema.ts:119`). Le harness garde le type d'événement (G1, G2), le jour, l'IMC de l'app et la raison (`GuardRecord`).
2. **Poids cible de G1** : le poids de tendance non arrondi. L'écran « objectif atteint » passe en maintien avec le poids arrondi à 0,1 kg (`src/screens/Account.tsx:587`). J'ai suivi le prompt (« ce poids comme poids cible »).
3. **Modes du harness** : G est appelé en modes `pre` et `A` (méthode actuelle) seulement. Les modes journal et « cible choisie » ne sont ni couverts ni mesurés dans cette itération.
4. **S3-P en prise** : le contrôle compare aussi un plan de prise au plafond de prise (`guardrailMaxWeeklyRate('gain', …)`, 0,5 %/semaine). Aucun plan de prise ne peut le dépasser [déduit, `goals.ts:601-604`] ; ce volet ne compte donc jamais.
5. **Sens de S3-D.** En perte et en maintien, la vitesse de perte (−pente) est comparée à 1,25 × le plafond de l'IMC vrai (0,25 %/semaine sous IMC 20). En prise, la vitesse de prise est comparée à 1,25 × 0,5 %/semaine. Une prise rapide chez un utilisateur en maintien n'est pas comptée : l'amendement ne donne, en maintien, qu'un plafond de perte.
6. **Plancher de l'app pour S4-P** : `hardFloorKcal` du plan en cours, c'est-à-dire le plancher (D-32) calculé par l'app quand elle a construit ce plan.
7. **Effectif d'une cellule de S2-NI** : utilisateurs appariés qui ont au moins un ratio dans la fenêtre dans les deux bras.
8. **IC de S3 d'origine** : bootstrap par utilisateur (A5.1), au lieu de Wilson en 2b.
9. **Passes doublées** (`ideal2cx2`, `real2cx2`) : déclarées et commitées avec le harness, avant toute mesure, au lieu d'être déclarées après une première passe comme en 2b.
10. **Pilote** : j'ai aussi exécuté le script des tableaux sur les sorties du pilote, dans un dossier temporaire, pour le déboguer avant de le commiter (variable `IT2C_TABLES_DIR`). Une seule correction : le comptage des utilisateurs par strate. Sorties supprimées.

### Isolement (3.4)

- **[mesuré]** Test « isolation » de `tests/domain/planGuardrails2c.test.ts` : aucun module de `src/store`, `src/app`, `src/screens`, `src/components`, `src/hooks` ni `src/main.tsx` ne mentionne `planGuardrails`, `enforcePlanGuardrails`, `PlanGuardrail`, `GoalChangeOptions`, `guardStep`, `s3pCheck`, `GuardRecord` ni `S3pRecord`.
- Les tests d'isolement de 2a et 2b restent verts (`npm run check`).

### Preuve de non-régression, option absente (3.5)

- Capture : scripts de `tests/experiments-journal/capture/`, T-03, T-04, golden, R et S (view-model complet), `convergenceJourney`. Avant : `9a856a1` (`src/` identique à `8d60518`). Après : prototype de s3, option absente.
- **[mesuré]** `results/guardrails2c/nonregression.txt` : **2 523 011 valeurs, 0 différence** (554 identifiants aléatoires masqués). T-03, T-04 et golden identiques à l'octet : préfixes sha256 `3447793a…`, `c65c47cf…`, `e20b17f4…`, les mêmes qu'aux itérations précédentes.
- **[mesuré]** `results/guardrails2c/repro2b.txt` : shard 14 de `real2b` (156 utilisateurs, dont l'utilisateur 478 ; bras S0 et K2) rejoué avec le simulateur de 2c, sans G :
  - 312 lignes brutes, **41 496 valeurs, 0 différence** ;
  - 2 028 lignes quotidiennes, **20 280 valeurs, 0 différence**.

### Tests (`tests/domain/planGuardrails2c.test.ts`, 7 tests ; `tests/domain/seeds2c.test.ts`, 2 tests)

- option absente : `changeGoal` sans options, avec `undefined` et avec `{}` rend le même résultat ;
- G1 se déclenche sur un plan de perte sous IMC 20, et pas entre IMC 20 et 22 à 0,25 %/semaine ; profil en maintien, cible = poids de l'app, plan de maintien daté du jour, cible de pas conservée, identique au plan de `changeGoal` avec ces options ;
- G1 ne se déclenche jamais sur un plan de maintien ou de prise sous IMC 20 (store rendu, même objet) ;
- après G1, une recalibration (porte franchie) produit un plan de maintien, et un nouveau contrôle ne change rien ;
- G2 se déclenche quand la vitesse du plan dépasse le plafond de l'IMC actuel, avec et sans les options de K2 ; le nouveau plan respecte le plafond et est identique à `buildPlanFromStore` avec la cible de pas conservée ; plan au plafond, ou IMC au-dessus de 25 à 1 %/semaine : aucun effet, même objet ;
- cas 478 (ci-dessous) ; isolement ; graines (section 2).

**Cas de reproduction, utilisateur 478** (graine maîtresse 2 900 000 478, bras K2, monde réaliste de 2b) **[lu]** `planGuardrails2c.test.ts:154-191` :

- **sans G** : poids vrai au jour 168 = `40.74378401450273` kg, identique à la chaîne du brut commité de 2b (`real2b-shard14.csv.gz`), soit un **IMC final de 16,5** ; aucun événement G ; S3-P violé à plusieurs évaluations ;
- **avec G** : G1 appliqué au **jour 21**, premier jour d'évaluation où l'IMC de l'app est sous 20 (le même jour que dans le run sans G), avec un **IMC de l'app de 19,998** ; aucun G2 ; tous les plans suivants sont des plans de maintien ; aucune violation de S3-P.
- Ce test est une non-régression, pas une mesure. Lors de son premier passage, l'IMC vrai final avec G valait 19,92 et le minimum 19,67 (sortie de débogage, non conservée).

## 2. Monde idéal : contrôle d'isolement dans la boucle, verdict A3.1 pour K2 + G

### Graines et pilote (4.1)

- **Graines déclarées** **[lu]** `jobs2c.ts:1-24` : `ideal2c` 3,6·10⁹ ; `real2c` 3,7·10⁹ ; `pilot2c` 3,8·10⁹ ; `ideal2cx2` 3,9·10⁹ ; `real2cx2` 4,0·10⁹. Graine maîtresse = base + indice ; flux dérivés = maîtresse + k × 1 000 003 (k ≤ 20) ; hypercube = base + 999 983 ; échantillon quotidien = base + 999 991.
- **[mesuré]** `tests/domain/seeds2c.test.ts` (vert) :
  - chaque enveloppe (maîtresses, flux, hypercube, échantillon) est disjointe des passes précédentes (phases 1 et 1b sous 6·10⁶, itérations 2, 2a et 2b, flux compris) et des autres bases de 2c ;
  - chaque graine est un entier inférieur à 2³² : le générateur (`random.ts`, `seed >>> 0`) la prend telle quelle.
- **Pilote de coût** (graines 3,8·10⁹, 12 utilisateurs × 4 bras, 12 shards, sorties supprimées) **[mesuré]** `timing/launch-times.txt` : 19 s ; environ 3,5 s par utilisateur × bras.
- **Durée projetée [déduit]** :
  - d'après le pilote : 4.2 (1 000 simulations, 16 shards) ≈ 220 s ; 4.3 (8 000 simulations) ≈ 1 750 s ;
  - d'après 2b (valid2b : 1 000 simulations, 596 s ; real2b : 5 000, 1 416 s) : 4.2 ≈ 600 s ; 4.3 ≈ 2 270 s ;
  - avec les deux passes doublées éventuelles : environ 1 h 45 au pire, sous le plafond de 4 h. Arrêt 3 non déclenché.

### Monde idéal (4.2)

Hall nominal, pesées sans bruit, u = 0, suiveurs parfaits. Graines 3,6·10⁹, **500 utilisateurs (189 en perte, 158 en prise, 153 en maintien)**, bras appariés K2 et K2 + G. **[mesuré]** `results/guardrails2c/ideal2c-shard*.csv.gz`, `tables2c.md`, section 4.2.

**Contrôle d'isolement dans la boucle [mesuré]** :

- 389 utilisateurs sans aucun événement de garde-fou sous K2 + G : leurs lignes brutes sont **identiques à K2 au bit près (389 / 389)**, toutes colonnes sauf le nom du bras.
- 111 utilisateurs avec un événement : **G1 chez 32** (jour médian 126, de 84 à 154 ; IMC de l'app de 19,950 à 19,999), **G2 chez 79** (premier G2 au jour médian 84 [P10 28 ; P90 154] ; IMC de l'app de 24,722 à 24,999). **0 échec** de reconstruction.
- **Contrôle d'isolement : PASSE.**

**Verdict A3.1 (tissus, blocs exclus retirés selon A5.4), K2 + G [mesuré]** :

| Critère (tissus) | Perte | Prise |
|---|---|---|
| sem. 5-12, bande [0,95 ; 1,05] | 1,011 [1,007 ; 1,018] | 1,043 [1,037 ; 1,048] |
| sem. 13-24 | 0,988 [0,984 ; 0,992] | 1,011 [1,004 ; 1,014] |
| bloc 5-8, bande [0,90 ; 1,10] | 1,028 [1,023 ; 1,033] | 1,060 [1,055 ; 1,064] |
| blocs 9-12 à 21-24 | 0,983 à 1,001 | 1,009 à 1,025 |

**A3.1 (K2 + G) : PASSÉ.** Arrêt 2 non déclenché.

- Blocs exclus (changement d'objectif en cours de bloc) : 22 utilisateurs-blocs en perte (22 utilisateurs, les blocs 13 à 24), 0 en prise et en maintien.
- Utilisateurs en perte avec des ratios sur les semaines 13 à 24 : 184 sur 189. Les 5 autres n'ont, sur ces semaines, que des blocs de maintien (sans ratio) ou exclus.
- K2 (rapporté, mêmes utilisateurs) : 1,010 et 0,986 en perte ; 1,043 et 1,011 en prise.
- Différences appariées K2 + G − K2 (tissus) : +0,001 [0,000 ; 0,004] et +0,001 [0,000 ; 0,003] en perte ; 0,000 en prise.
- Strates : `tables2c.md`.

## 3. Monde réaliste : verdict A3.2 amendé

Hall perturbé à ±20 %, pesées t + D + E, pas bruités, suiveurs de 2b. Graines 3,7·10⁹, **2 000 suiveurs (764 en perte, 621 en prise, 615 en maintien)**, bras appariés S0, K2, S0 + G et K2 + G. **[mesuré]** `results/guardrails2c/real2c-shard*.csv.gz`, `tables2c.md`, section 4.3.

### Verdict A3.2 amendé (A5.4), K2 + G

| Critère | Valeur [IC 95 %] | Seuil | Statut |
|---|---|---|---|
| S1 perte, sem. 5-12 (tissus, blocs exclus retirés) | 1,025 [1,016 ; 1,037] | [0,85 ; 1,15] | passe |
| S1 perte, sem. 13-24 | 0,995 [0,988 ; 1,000] | idem | passe |
| S1 prise, sem. 5-12 | 1,053 [1,020 ; 1,088] | idem | passe |
| S1 prise, sem. 13-24 | 1,014 [1,000 ; 1,028] | idem | passe |
| S3-P [S] | 0 violation sur 46 000 évaluations hebdomadaires | 0 | passe |
| S3-D [S] | 244 / 10 000 utilisateurs-blocs = 2,44 % [2,09 ; 2,82 %] | borne haute ≤ 5 % | passe |
| S4-P [S] | 0 jour | 0 | passe |
| S2-NI, 7 cellules jugées | Δ(P90 / médiane) de −0,421 à −0,063 ; borne haute la plus haute : −0,037 | borne haute ≤ +0,05 | passe (7 / 7) |

**A3.2 amendé (K2 + G) : PASSÉ.** Pas de passe doublée (aucun critère INCONCLUSIF).

S2-NI, K2 + G − S0 + G **[mesuré]** :

| Objectif | Vitesse demandée | Fenêtre | Utilisateurs appariés | P90 / médiane S0 + G → K2 + G | Δ [IC 95 %] | Écart P90 − médiane S0 + G / K2 + G |
|---|---|---|---|---|---|---|
| perte | 0,25 %/sem. | 5-12 | 150 | 2,235 → 1,814 | −0,421 [−0,604 ; −0,198] | 0,869 / 0,858 |
| perte | 0,25 %/sem. | 13-24 | **96 (non jugée)** | 1,626 → 1,381 | −0,245 [−0,421 ; −0,132] | 0,387 / 0,371 |
| perte | 0,50 %/sem. | 5-12 | 218 | 1,412 → 1,309 | −0,103 [−0,195 ; −0,059] | 0,300 / 0,321 |
| perte | 0,50 %/sem. | 13-24 | 218 | 1,195 → 1,133 | −0,063 [−0,090 ; −0,040] | 0,134 / 0,134 |
| perte | 1,00 %/sem. | 5-12 | 386 | 1,275 → 1,207 | −0,069 [−0,092 ; −0,037] | 0,194 / 0,211 |
| perte | 1,00 %/sem. | 13-24 | 386 | 1,186 → 1,121 | −0,065 [−0,086 ; −0,044] | 0,116 / 0,120 |
| prise | 0,25 %/sem. | 5-12 | 621 | 1,792 → 1,538 | −0,254 [−0,303 ; −0,195] | 0,613 / 0,567 |
| prise | 0,25 %/sem. | 13-24 | 621 | 1,460 → 1,283 | −0,177 [−0,210 ; −0,146] | 0,318 / 0,287 |

- La cellule « perte, 0,25 %/semaine, semaines 13 à 24 » compte 96 utilisateurs appariés avec des ratios (160 sans G) : non jugée (section 6).
- Blocs exclus des ratios (changement d'objectif en cours de bloc) : 96 utilisateurs-blocs sous K2 + G (96 utilisateurs, tous en perte), 57 sous S0 + G, 0 sous S0 et K2.

### Critères amendés, quatre bras (rapportés ; verdict pour K2 + G seul)

| Bras | S1 perte 5-12 / 13-24 | S1 prise 5-12 / 13-24 | S3-P : violations (utilisateurs) | S3-D [IC bootstrap] | S4-P |
|---|---|---|---|---|---|
| S0 | 0,708 / 0,644 | 0,775 / 0,693 | 912 (204) | 1,47 % [1,20 ; 1,75 %] | 0 |
| K2 | 1,027 / 0,996 | 1,053 / 1,014 | 1 296 (247) | 3,75 % [3,25 ; 4,30 %] | 0 |
| S0 + G | 0,708 / 0,642 | 0,775 / 0,693 | 0 (0) | 1,02 % [0,81 ; 1,25 %] | 0 |
| K2 + G | 1,025 / 0,995 | 1,053 / 1,014 | 0 (0) | 2,44 % [2,09 ; 2,82 %] | 0 |

- S3-P sans G, par strate : en perte à IMC 21, 487 (S0) et 1 086 (K2) violations ; cas R et S : 212 + 192 (S0), 80 + 71 (K2) ; IMC 26 : 21 et 2 ; IMC 31 : 0 et 57 ; aucune en prise ni en maintien.
- S2-NI de K2 − S0 (rapporté) : les 8 cellules, dont « perte, 0,25 %/semaine, semaines 13 à 24 » avec 160 utilisateurs appariés (Δ −0,302 [−0,454 ; −0,199]), ont une borne haute sous +0,05.
- Différences appariées de médiane (tissus, blocs exclus retirés) : K2 + G − K2 : −0,002 et −0,001 en perte, 0,000 en prise ; S0 + G − S0 : −0,000 et −0,002 en perte, 0,000 en prise ; K2 + G − S0 + G : +0,317 et +0,351 en perte, +0,278 et +0,321 en prise.

### Critères d'origine (sans verdict, calculés comme en 2b)

| Bras | S2 P90 tissus : perte 5-12 / 13-24 | S2 : prise 5-12 / 13-24 | S3 tissus (utilisateurs-semaines) [IC bootstrap] | S4 (≥ 7 j sous le plancher réel) [Wilson] | S7 [Wilson] | S7 centré sur le poids vrai de départ |
|---|---|---|---|---|---|---|
| S0 | 1,057 / 0,814 | 1,389 / 1,011 | 8,33 % [7,71 ; 8,95 %] | 198 / 2 000 = 9,90 % [8,67 ; 11,29 %] | 295 / 615 = 47,97 % [44,04 ; 51,92 %] | 274 / 615 = 44,55 % |
| K2 | 1,389 / 1,172 | 1,620 / 1,301 | 17,42 % [16,25 ; 18,60 %] | 370 / 2 000 = 18,50 % [16,86 ; 20,26 %] | 304 / 615 = 49,43 % [45,50 ; 53,37 %] | 271 / 615 = 44,07 % |
| S0 + G | 1,050 / 0,798 | 1,389 / 1,011 | 6,88 % [6,38 ; 7,35 %] | 196 / 2 000 = 9,80 % [8,57 ; 11,18 %] | 295 / 615 = 47,97 % | 274 / 615 = 44,55 % |
| K2 + G | 1,385 / 1,155 | 1,620 / 1,301 | 15,59 % [14,57 ; 16,63 %] | 367 / 2 000 = 18,35 % [16,71 ; 20,11 %] | 304 / 615 = 49,43 % | 271 / 615 = 44,07 % |

- Bornes hautes de S2 (P90 ≤ 1,25 ?) sous K2 + G : perte 1,433 (non) et 1,171 (oui) ; prise 1,683 (non) et 1,325 (non). IC complets : `tables2c.md`.
- Cible au moins 7 jours à moins de 10 % au-dessus du plancher de l'app : S0 et S0 + G 245 / 2 000 = 12,25 % ; K2 et K2 + G 422 / 2 000 = 21,10 % [19,37 ; 22,94 %].
- Écart minimal cible − plancher réel : minimum 0,5 kcal/j dans les quatre bras, aucun utilisateur sous 0 ; P10 72,9 (S0) et 8,1 kcal/j (K2, K2 + G).

### Sécurité sous IMC 20 (poids vrai)

| Bras | Fins sous IMC 20 [Wilson] | dont perte à IMC 21 | IMC vrai minimal : min ; P1 ; P5 ; médiane | Passent sous IMC 20 ; sous 18,5 | IMC le plus bas (utilisateur, graine maîtresse) |
|---|---|---|---|---|---|
| S0 | 71 / 2 000 = 3,55 % [2,82 ; 4,45 %] | 67 / 160 | 18,767 ; 19,516 ; 20,082 ; 25,903 | 83 ; 0 | 18,767 (1555, 3 700 001 555, perte, IMC 21) |
| K2 | 136 / 2 000 = 6,80 % [5,78 ; 7,99 %] | 133 / 160 | 17,390 ; 19,107 ; 19,713 ; 25,866 | 144 ; 4 | 17,390 (1117, 3 700 001 117, perte, IMC 21) |
| S0 + G | 25 / 2 000 = 1,25 % [0,85 ; 1,84 %] | 21 / 160 | 19,538 ; 19,819 ; 20,096 ; 25,903 | 71 ; 0 | 19,538 (4, 3 700 000 004, maintien, IMC 21) |
| K2 + G | 73 / 2 000 = 3,65 % [2,91 ; 4,56 %] | 70 / 160 | 19,338 ; 19,695 ; 19,923 ; 25,866 | 128 ; 0 | 19,338 (1733, 3 700 001 733, perte, IMC 21) |

- Hors perte à IMC 21 : fins sous IMC 20 chez 4 (S0, S0 + G) et 3 (K2, K2 + G) utilisateurs en maintien partis d'IMC 21 ; aucune ailleurs.
- IMC vrai final médian, perte à IMC 21 : 20,091 (S0), 19,616 (K2), 20,029 (K2 + G).

**Événements G [mesuré]** :

| Bras | G1 : utilisateurs (événements) | Jour de G1, médiane [P10 ; P90] (min – max) | IMC de l'app à G1 (min – max) | G2 : utilisateurs (événements) | Jour du premier G2, médiane [P10 ; P90] | IMC de l'app au premier G2 (min – max) | Échecs |
|---|---|---|---|---|---|---|---|
| S0 + G | 67 (67) | 98 [60 ; 157] (28 – 161) | 19,755 – 19,999 | 214 (235) | 119 [35 ; 147] | 24,542 – 25,000 | 0 |
| K2 + G | 126 (126) | 105 [56 ; 147] (28 – 161) | 19,771 – 19,999 | 251 (260) | 84 [35 ; 147] | 21,954 – 25,000 | 0 |

(IMC arrondi au millième : « 25,000 » est un IMC juste sous 25.)

**Recalibrations et recalculs périodiques refusés, par raison [mesuré]** :

| Bras | Utilisateurs avec une recalibration refusée : raisons (événements) | Recalculs périodiques faits ; refusés : raisons |
|---|---|---|
| S0 | 54 : `loss_unavailable_low_bmi` 100, `no_feasible_speed` 36 | — |
| K2 | 106 : `loss_unavailable_low_bmi` 229, `no_feasible_speed` 67, `target_not_above_current` 3 | 2 299 ; `loss_unavailable_low_bmi` 252, `target_not_above_current` 7, `no_feasible_speed` 1 |
| S0 + G | 12 : `no_feasible_speed` 36 | — |
| K2 + G | 21 : `no_feasible_speed` 67, `target_not_above_current` 3 | 2 385 ; `target_not_above_current` 7, `no_feasible_speed` 1 |

Médiane des recalibrations appliquées : 11 dans les quatre bras.

### S3-D par objectif, vitesse demandée et classe d'IMC [mesuré]

| Objectif | Vitesse demandée | Classe d'IMC (utilisateurs) | S0 | K2 | S0 + G | K2 + G |
|---|---|---|---|---|---|---|
| prise | 0,25 %/sem. | toutes (621) | 0,16 % | 0,29 % | 0,16 % | 0,29 % |
| maintien | — | toutes (615) | 0,52 % | 0,36 % | 0,52 % | 0,36 % |
| maintien | — | 21 (137) | 2,34 % | 1,61 % | 2,34 % | 1,61 % |
| perte | toutes | toutes (764) | 3,30 % | 9,29 % | 2,12 % | 5,86 % [4,92 ; 6,75 %] |
| perte | 0,25 %/sem. | 21 (160) | 10,13 % | 28,38 % | 8,63 % | 18,13 % [15,38 ; 21,00 %] |
| perte | 0,50 %/sem. | 26 (73) | 0,27 % | 3,84 % | 0,27 % | 3,84 % |
| perte | 0,50 %/sem. | 31 et 38 (145) | 0 % | 0 % | 0 % | 0 % |
| perte | 1,00 %/sem. | 26 (65) | 3,38 % | 5,23 % | 2,77 % | 5,23 % |
| perte | 1,00 %/sem. | 31 (77) | 0 % | 5,97 % | 0 % | 2,08 % |
| perte | 1,00 %/sem. | 38 (84) | 0 % | 0 % | 0 % | 0 % |
| perte | 1,00 %/sem. | cas R (80) | 5,00 % | 8,75 % | 0,25 % | 3,50 % |
| perte | 1,00 %/sem. | cas S (80) | 3,25 % | 9,75 % | 0,25 % | 6,50 % |

Maintien aux IMC 26, 31 et 38 : 0 % dans les quatre bras. IC de chaque cellule : `tables2c.md`.

### Strates, K2 + G (extrait ; les quatre bras dans `tables2c.md`) [mesuré]

| Strate | Valeur | Utilisateurs | S1 perte 5-12 / 13-24 | S1 prise 5-12 / 13-24 | S3-D | Fins sous IMC 20 |
|---|---|---|---|---|---|---|
| sexe | femme | 1 080 | 1,030 / 0,997 | 1,026 / 1,011 | 2,48 % | 24 |
| sexe | homme | 920 | 1,016 / 0,990 | 1,080 / 1,016 | 2,39 % | 49 |
| IMC | 21 | 461 | 1,053 / 0,973 | 1,009 / 1,007 | 6,90 % | 73 |
| IMC | 26 | 455 | 1,013 / 0,982 | 1,065 / 0,997 | 1,54 % | 0 |
| IMC | 31 | 464 | 1,039 / 1,006 | 1,094 / 1,027 | 0,39 % | 0 |
| IMC | 38 | 460 | 1,027 / 0,998 | 1,043 / 1,016 | 0,04 % | 0 |
| IMC | cas R / cas S | 80 / 80 | 1,034 / 0,994 ; 1,012 / 0,985 | — | 3,50 % / 6,50 % | 0 |
| activité | sédentaire | 922 | 1,038 / 0,994 | 1,044 / 1,011 | 2,00 % | 34 |
| activité | force | 1 078 | 1,019 / 0,996 | 1,073 / 1,016 | 2,82 % | 39 |
| vitesse | 0,25 %/sem. | 781 | 1,053 / 0,973 | 1,053 / 1,014 | 3,94 % | 70 |
| vitesse | 0,50 %/sem. | 218 | 1,039 / 1,010 | — | 1,28 % | 0 |
| vitesse | 1,00 %/sem. | 386 | 1,019 / 0,989 | — | 3,37 % | 0 |

### Exports quotidiens [mesuré]

- `real2c-daily-shard*.csv.gz` : 375 180 lignes, 555 utilisateurs × 4 bras : échantillon stratifié de 206 utilisateurs (10,3 %), plus 349 utilisateurs hors échantillon chez qui un garde-fou s'est déclenché.
- `ideal2c-daily-shard*.csv.gz` : 52 052 lignes, 154 utilisateurs × 2 bras : 56 échantillonnés (11,2 %), 98 avec un garde-fou.
- Colonnes : celles de 2b, plus `app_w` (poids de tendance), `plan_goal`, `plan_floor`, `real_floor`, `g_event`, `sampled`, `stratum`.

## 4. Inventaire pour la mise en production (sans code)

### 4.1 G1 et G2

- **Où les appeler.**
  - **[lu]** Aujourd'hui, rien ne recalcule un plan sans action de l'utilisateur. `StoreProvider.tsx` suit le changement de jour (`useToday`, l. 36-46 : minuterie de 60 s et `visibilitychange`) et n'appelle que `ensureDailyLogs` (l. 70-72). Le worker (`calibration.worker.ts:11-13`) ne calcule que l'état de calibration.
  - [déduit] Le point naturel est l'effet de `StoreProvider.tsx` qui réagit au changement de jour (l. 70-72), ou l'ouverture de l'app : `enforcePlanGuardrails` coûte une reconstruction de plan, du même ordre que le recalcul périodique de 2b (P95 4,7 ms, rapport 38). Pas besoin du worker.
  - [déduit] Chaque écriture de pesée (`addWeight`, `engine.ts:513`) change le poids de tendance. Un contrôle après chaque pesée est plus proche du risque qu'un contrôle hebdomadaire ; le prompt mesure le contrôle hebdomadaire.
- **App non ouverte depuis plusieurs semaines** [déduit] :
  - sans nouvelle pesée, le poids de tendance ne bouge pas (`computeTrend`, `trend.ts:25-40`) : le contrôle à la réouverture donne le même verdict qu'au départ ;
  - un seul contrôle à la réouverture suffit (pas de rattrapage semaine par semaine) : G dépend de l'état présent, pas de l'historique ;
  - dans le harness, G tourne chaque semaine, même sans pesée : ce cas n'est pas mesuré.
- **Trace de l'événement.**
  - [lu] `AppMeta` (`types.ts:204-217`, valeurs par défaut l. 247-256) garde déjà `lastSurfacedCalibration`, validé dans `sanitizeMeta` (`schema.ts:222-239`).
  - [déduit] Il faudrait un champ du même type (type G1 ou G2, date, IMC, ancienne et nouvelle vitesse) pour dire à l'utilisateur ce qui a changé et ne pas le répéter. C'est un changement de schéma.
- **Source du plan** : une valeur propre (par exemple `guardrail`) change `types.ts:145` et `schema.ts:119`. Le prototype utilise `'initial'` (G1, via `changeGoal`) et `'recalibrated'` (G2).
- **Bump de `SCHEMA_VERSION`** (`types.ts:26`, valeur 6) et migration (`src/persistence/migrations.ts:84`) : à décider pour la trace et la source [déduit].
- **Présentation** (textes non rédigés) :
  - G1 : la perte s'arrête, le plan passe en maintien au poids actuel ; l'écran le plus proche existe déjà (`ReachedScreen`, `Account.tsx:539-595`, « On passe en maintien ? ») ;
  - G2 : la vitesse est ramenée au plafond de l'IMC actuel, avec l'ancienne et la nouvelle vitesse.
- **Choix à trancher** [déduit] : G1 est automatique dans le prototype, sans confirmation. L'invariant C5 de `THRESHOLDS.md` (« aucun plan appliqué sans confirmation ») porte sur le mode journal ; son application à G est à décider.
- **Cible de pas et arrondi** : G garde la cible de pas du plan ; l'écran « objectif atteint » repart de la cible de pas de base et arrondit le poids cible (`Account.tsx:587`). À harmoniser [déduit].

### 4.2 Message de recalibration refusée

- **[lu]** `Tracking.tsx:400-403` : `applyRecalibration` échoue et le toast dit « Recalibration impossible pour le moment. », sans la raison (`r.reason`).
- **[lu]** `src/app/copy.ts:118-128` : `PLAN_ERROR_TEXT` a déjà un texte pour `loss_unavailable_low_bmi` (l. 120 : « … Wheighty ne propose pas de perte de poids. Le maintien reste disponible. ») et pour `no_feasible_speed` (l. 124). D'autres écrans l'utilisent (`Account.tsx:139, 589`, `Result.tsx:48, 66, 76`, `BalanceSheet.tsx:51`), pas `Tracking.tsx`.
- **[lu]** L'aperçu (`Tracking.tsx:344-348`) appelle `buildPlanFromStore` et rend `null` en cas d'échec, sans la raison. Le bouton « appliquer » est alors désactivé (`Tracking.tsx:461`, `disabled={!preview || …}`) et le texte de l'aperçu n'est pas affiché (l. 452-455). L'utilisateur voit la nouvelle maintenance, sans savoir pourquoi il ne peut pas l'appliquer.
- **Ce qu'il faudrait** [déduit] :
  - garder `r.reason` dans l'aperçu (`useMemo`, l. 344-348) et l'afficher avec `PLAN_ERROR_TEXT` ;
  - pour `loss_unavailable_low_bmi` et `target_bmi_too_low`, proposer le maintien au poids actuel (même appel que `ReachedScreen`, `Account.tsx:587`) ;
  - pour `no_feasible_speed`, le texte existant renvoie au maintien ou à un objectif plus doux.
- Avec G1 en production, `loss_unavailable_low_bmi` ne devrait plus arriver à la recalibration après un contrôle G du jour [déduit] ; il reste possible entre deux contrôles.

### 4.3 Avertissement avant IMC 20

- **Deux projections [lu]** :
  - `projectPlan` (`goals.ts:681`) : appelée à la construction du plan (`buildPlan`, `engine.ts:115-121`) et par le curseur (`engine.ts:573`). Avec les options de solveur de K2, elle part du corps modélisé (`sampleTrajectory`, `goals.ts:667-679`, via `currentStateBody`). Le résultat est stocké dans `plan.projection` et n'est recalculé qu'à la prochaine reconstruction : jusqu'à 28 jours sous K2 ;
  - `projectionFromToday` (`views.ts:162-178`) : recalculée à chaque rendu depuis le poids de tendance, la maintenance calibrée (`state.currentMaintenanceKcal`) et les calories et pas du plan, avec un contexte sans options de solveur, donc depuis l'équilibre. Elle n'est tracée qu'après la première calibration (`views.ts:192-195`).
- **Une troisième entrée existe** [lu] : `summarizeTrend` (`trend.ts:50-64`) donne la pente de la tendance sur 7 jours (`weeklyRateKg`), sans modèle.
- **Laquelle** [déduit] :
  - pour un avertissement à 4 semaines recalculé à chaque pesée, `projectionFromToday` a les bonnes entrées : poids de tendance (celui de G), maintenance du jour, plan en cours. Il manque l'arrêt au franchissement : poids d'IMC 20 = `weightAtBmi(20, taille)` (`macros.ts:39`), en option `stopAt` de `sampleTrajectory` ou en premier point de trajectoire sous ce poids avec `day ≤ 28` ;
  - la trajectoire est échantillonnée tous les 7 jours (`PROJECTION_SAMPLE_EVERY_DAYS`, `constants.ts:228`) : il faudrait le jour exact ou un pas quotidien sur les 28 premiers jours ;
  - la bande 80 % (`lower80`) permettrait un avertissement prudent ;
  - partir de l'équilibre ignore l'eau et le glycogène des premiers jours de plan. Avec K2 en production, il faudrait passer les options de solveur à ce contexte (`solverOptionsFor`, `engine.ts:201`) pour partir du corps modélisé ;
  - `plan.projection` ne convient pas : elle date de la construction du plan.
- **Entrées** : poids de tendance, taille, maintenance calibrée et intervalle 80 %, calories et pas du plan, options de solveur, seuil `LOSS_UNAVAILABLE_BMI_BELOW` (`constants.ts:199`), horizon 28 jours.

### 4.4 Poids cible minimal à IMC 20

- **Constante** [lu] : `TARGET_BMI_MIN = 18.5` (`constants.ts:198`, métadonnée `product_safety_rule` l. 511). Seul usage : `buildGoalPlan` (`goals.ts:598`, statut `target_bmi_too_low`).
- **Validation** [lu] : `validation.ts:70` ne vérifie qu'une plage de poids (`WEIGHT_MIN_KG` à `WEIGHT_MAX_KG`) ; `onboarding.ts:364` vérifie seulement qu'un poids cible est choisi ; `schema.ts:55`, que c'est un nombre.
- **Onboarding** [lu] : le curseur du poids cible en perte va de max(35 kg ; 0,6 × poids) à poids − 0,5 kg (`Onboarding.tsx:652-654`), sans lien avec l'IMC. Une cible trop basse n'est refusée qu'au calcul du plan (`Result.tsx:48`, texte `target_bmi_too_low`).
- **Changement d'objectif** [lu] : même plage dans `GoalSheet` (`Account.tsx:132-133`) ; refus par `changeGoal` (`Account.tsx:137-139`).
- **Ce qu'il faudrait** [déduit] : borne basse des deux curseurs = `weightAtBmi(TARGET_BMI_MIN, taille)` (`macros.ts:39`) arrondie vers le haut ; même borne dans la validation du brouillon (`onboarding.ts`) ; `TARGET_BMI_MIN = 20`.
- **Profils déjà stockés** [déduit] :
  - une cible entre IMC 18,5 et 20 reste valide pour le schéma ; avec la nouvelle constante, la prochaine reconstruction d'un plan de perte (recalibration, recalcul, changement de profil) finirait en `target_bmi_too_low`. C'est le même blocage que `loss_unavailable_low_bmi` aujourd'hui : le plan ne serait plus corrigé ;
  - il faut donc une migration (cible relevée au poids d'IMC 20, avec une trace pour le dire) ou une règle de reconstruction qui borne la cible. C'est une décision produit ; une migration demande un bump de `SCHEMA_VERSION`.
- **Tests touchés** [lu] : `tests/science/goals.test.ts:77` (statut `target_bmi_too_low` à 53 kg), `:152` ; le harness en boucle fermée fixe la cible de perte à IMC 18,5 (`closedLoop.ts:187`, `lossTargetKg`) : avec IMC 20, chaque reconstruction de ces utilisateurs échouerait tant que la cible n'est pas relevée. Les 12 profils golden ont des cibles au-dessus d'IMC 20 (la plus basse : profil 01, 57 kg pour 165 cm, IMC 20,9) [déduit, `tests/experiments-journal/capture/golden.experiment.ts:22-56`].

### 4.5 Plancher expliqué

- **Ce que l'app sait déjà [lu]** :
  - `buildGoalPlan` (`goals.ts:573-640`) : `rateAdjusted` et la liste `rejections`, avec la raison de chaque vitesse refusée (`below_hard_floor`, `above_guardrail_cap`, `macro_infeasible`, `solver_not_converged`) ;
  - `maxSelectableWeeklyRate` (`goals.ts:559-571`) : `limitedBy`, repris par `speedSliderModelFor` (`engine.ts:408-424`) ;
  - le plan stocké ne garde que `requestedWeeklyRate` et `weeklyRateTarget`, pas la raison (`buildPlan`, `engine.ts:123-157`).
- **Où c'est affiché [lu]** :
  - « Pourquoi ce résultat ? » : `explain.ts:340` prend la première raison de rejet ; `ResultExplanationView.tsx:208-211` affiche `LIMITING_RULE_TEXT` (`copy.ts:157-163`, dont « Limité pour respecter ton plancher calorique. ») ;
  - quand le plafond d'IMC et le plancher limitent tous deux, la première raison est `above_guardrail_cap` (poussée avant la boucle des vitesses, `goals.ts:610`) : le plancher n'est pas cité [déduit] ;
  - `Result.tsx:158` : note générique « Vitesse ajustée … pour respecter les limites de sécurité » ;
  - `limitedBy` du modèle de curseur n'est affiché par aucun écran (seulement la ligne technique `ResultExplanationView.tsx:453`) ; `SpeedSlider.tsx:17` borne le curseur à `maxSelectableRate` sans dire pourquoi.
- **Où l'afficher** [déduit] : sous le curseur de vitesse (onboarding `Onboarding.tsx:727-728`, `GoalSheet` `Account.tsx:182`), sur l'écran du résultat (`Result.tsx:158`), dans l'aperçu de recalibration (`Tracking.tsx:452-455`) et après un G2.

### 4.6 Proposition de pas

- **Ce qui existe [lu]** :
  - `evaluateWeeklyRate(ctx, goal, vitesse, pas)` (`goals.ts:528-536`) résout les calories qui tiennent une vitesse **à un nombre de pas donné**, et signale `below_hard_floor` ;
  - `buildGoalPlan` accepte déjà `stepTarget` (`goals.ts:573`), mais `buildPlan` lui passe toujours les pas de base (`engine.ts:90`) ;
  - le curseur (`solveSliderPoint`, `goals.ts:775` ; `effectiveMinSliderSteps`, `goals.ts:819-838`) garde la cible à l'horizon d'un plan d'ancrage et cherche par bissection les pas les plus bas dont les calories restent au-dessus du plancher. Les calories sont croissantes en pas (invariant vérifié en 2a et 2b) ;
  - bornes : `sliderBounds` (`goals.ts:725-734`) : de max(2 000 ; base − 6 000) à min(30 000 ; min(20 000 ; base + 10 000)) pas (`constants.ts:230-235`).
- **Ce qui manquerait** [déduit] :
  - une fonction « pas qui tiennent la vitesse demandée au plancher » : bissection sur les pas avec `evaluateWeeklyRate` à la vitesse demandée, jusqu'aux premiers pas où la cible repasse au-dessus du plancher. `effectiveMinSliderSteps` le fait si on lui passe la cible à l'horizon de la vitesse demandée (`horizonTarget`, `goals.ts:357`, non exportée) ;
  - un cas « inatteignable » explicite : `effectiveMinSliderSteps` rend `maxSteps` même quand ce point est encore sous le plancher (`goals.ts:829`) ;
  - le chemin du plan : `buildPlan` ancre le curseur sur le plan à la vitesse retenue, plus lente (`engine.ts:105-114`). Un plan « vitesse demandée + pas proposés » demande de passer ces pas à `buildGoalPlan` ;
  - l'avertissement de pas hors de la zone recommandée (± 3 000, `constants.ts:235`) et les textes.

### 4.7 Version

- `SCIENTIFIC_MODEL_VERSION = '1.3.0'` (`constants.ts:12`) : à relever avec K2 (rapport 38, section 8), avec `TARGET_BMI_MIN = 20` (règle de sécurité produit) et avec G1 et G2 (les plans produits après le premier changent). Non fait (interdit dans cette itération).
- **Golden et tests** [lu, déduit] :
  - G1 et G2 ne changent pas le premier plan : `tests/science/golden.test.ts` et son instantané ne bougent pas pour G seul ;
  - les captures T-03, T-04, golden, R et S ne bougent pas pour G seul (preuve 3.5) ; `convergenceJourney` bougerait si un parcours passe sous IMC 20 en perte ou au-dessous d'une tranche d'IMC à une vitesse trop haute ;
  - `TARGET_BMI_MIN = 20` touche `tests/science/goals.test.ts` (l. 77, 152) et le harness de la batterie (cibles à IMC 18,5) ;
  - `tests/domain/planGuardrails2c.test.ts` serait à convertir en tests de production.

## 5. Arrêts déclenchés, le cas échéant, et temps de calcul

- **Arrêt 1** (3.5 ou un test de 3.3) : non déclenché. Non-régression 0 différence, rejeu de `real2b` 0 différence, tests verts.
- **Arrêt 2** (isolement de 4.2 ou A3.1 de K2 + G) : non déclenché. Isolement 389 / 389, A3.1 passé ; 4.3 a tourné.
- **Arrêt 3** (plafond de calcul) : non déclenché. Projection du pilote sous le plafond.
- **Arrêt 4** (INCONCLUSIF) : non déclenché. Aucun critère inconclusif en 4.2 ni en 4.3 ; `ideal2cx2` et `real2cx2`, déclarées, n'ont pas tourné.
- **Arrêt 5** (A3.2 amendé échoue) : non déclenché.
- **Arrêt 6** : 4.4 exécuté (section 4).

**Temps de calcul [mesuré]** (`timing/launch-times.txt` et journaux des commandes) : environ 54 min de calcul effectif (somme du tableau). Temps réel du début (11 h 05) à la fin des mesures (12 h 12) : environ 1 h 07, sous le plafond de 4 h.

| Étape | Durée |
|---|---|
| `npm run check` (départ, intermédiaire, fin) | 60 s, 42 s, 32 s |
| captures « avant » et « après » | 60 s et 61 s |
| rejeu du shard 14 de `real2b` | 718 s |
| pilote (graines 3,8·10⁹, sorties supprimées) | 19 s |
| monde idéal (`ideal2c`, 16 shards) | 265 s |
| monde réaliste (`real2c`, 16 shards) | 1 917 s |
| tableaux | moins de 2 min |

## 6. Non fait, incertitudes, incohérences

**Non fait**

- Rien de ce qui est décidé pour la mise en production : ni avertissement, ni poids cible minimal, ni message, ni explication du plancher, ni proposition de pas. Inventaire seulement (section 4).
- Aucune UI, aucun texte d'interface, aucun bump de `SCIENTIFIC_MODEL_VERSION` ni de `SCHEMA_VERSION`.
- Garde-fous en mode journal et en mode « cible choisie » : non implémentés, non mesurés.
- Aucun non-suiveur (prompt) ; rien de la section 6 du prompt n'a été recalculé.
- Passes doublées : déclarées, non exécutées (non nécessaires).

**Incertitudes (lectures de l'amendement, fixées avant la mesure)**

- **Effectif d'une cellule de S2-NI.** J'ai compté les utilisateurs appariés qui ont des ratios dans la fenêtre. La cellule « perte, 0,25 %/semaine, semaines 13 à 24 » en a 96 sous K2 + G et S0 + G (G1 met ces utilisateurs en maintien) et n'est pas jugée. Comptée sur les utilisateurs de la cellule (160), elle serait jugée : Δ = −0,245 [−0,421 ; −0,132], sous +0,05 [mesuré]. Le verdict est le même dans les deux lectures.
- **Sens de S3-D.** En maintien, seule une perte au-delà de 1,25 × le plafond de perte est comptée (écart 5, section 1). Une prise rapide en maintien ne l'est pas.
- **Plancher de S4-P** : celui que l'app a calculé à la construction du plan en cours (`hardFloorKcal`). Un plancher recalculé chaque jour au poids de l'app n'est pas mesuré. Aucune cible n'est non plus passée sous le plancher réel : écart minimal de 0,5 kcal/j [mesuré].
- **S3-P aux jours d'évaluation seulement** (prompt) : entre deux évaluations, un plan de perte peut rester en place jusqu'à 6 jours avec un IMC de l'app sous 20.
- **IMC de l'app contre IMC vrai.** G1 se déclenche sur le poids de tendance, à un IMC de l'app entre 19,771 et 19,999 sous K2 + G. Sous K2 + G, 128 utilisateurs passent sous IMC 20 vrai, 73 y finissent, le minimum est 19,338 [mesuré].
- **Cas 478** : l'IMC vrai final avec G (19,92) vient d'une sortie de débogage du test, non conservée.

**Incohérences et constats [mesuré]**

- Sous K2 + G, des reconstructions échouent encore, et le plan reste alors en place : recalibrations `no_feasible_speed` (67 événements, comme sous K2) et `target_not_above_current` (3) ; recalculs périodiques `target_not_above_current` (7) et `no_feasible_speed` (1). `target_not_above_current` concerne une prise dont la cible est atteinte.
- S4 d'origine ne bouge pas avec G : 18,50 % (K2) et 18,35 % (K2 + G).
- Le premier G2 le plus bas arrive à un IMC de l'app de 21,954 (franchissement d'IMC 22 à 0,5 %/semaine) ; tous les autres, juste sous 25.
- Dans le monde idéal, G1 arrive entre les jours 84 et 154, et G2 dès le jour 28.
- `tests/experiments-journal/it2b/` n'est pas modifié ; les bruts de 2b sont reproduits par le simulateur de 2c (section 1).
- Le `.gitignore` modifié et `results.zip` ne sont pas de mon fait ; je n'y ai pas touché.
