# 38 : itération 2b, recalcul périodique et horizon du solveur (vitesse jugée sur les tissus)

Mesures seulement : aucune fonctionnalité visible, aucune sortie de production modifiée quand les options sont absentes. Branche `bench/journal-battery`, rien sur `main`, aucun merge. Seuils : `tests/experiments-journal/THRESHOLDS.md`, amendements 3 et 4. Tableaux : `tests/experiments-journal/results/solver2b/tables2b.md` et `verdicts2b.json`.

Conventions : **[lu]** chemin:lignes ; **[mesuré]** fichier de résultats ; **[déduit]** raisonnement.

## Synthèse

| Étape | Résultat |
|---|---|
| 3.5 non-régression, options absentes | **0 différence** sur 2 523 011 valeurs |
| 3.3 équivalence mode journal / méthode actuelle | **passe** : 150 fixtures, cibles de plan identiques au bit près, écarts d'état ≤ 1,4·10⁻⁵ kg |
| Arrêt 2 (témoin S0, poids total, sem. 5 à 24) | **reproduit** : 0,667 en perte, 0,700 en prise |
| 5.1 sélection, première passe (tissus) | K1 **échoue** (prise, sem. 5-12 : 1,068 [1,057 ; 1,074]) ; K2 **inconclusif** sur ce seul critère (1,047 [1,039 ; 1,053]) |
| 5.1 bis, passe doublée de K2 (règle commune INCONCLUSIF, A1.3) | K2 **passe tous les critères** ; candidat retenu selon A4.2 : **K2** |
| 5.2 validation, A3.1 sur les tissus | **PASSÉ** (K2) |
| 5.3 monde réaliste, A3.2 | **ÉCHOUÉ** (K2) : S1 passe ; S2, S3, S4, S7 échouent |
| 5.4 recalcul périodique | ≈ 1 à 2 recalculs par utilisateur ; écart de cible médian 0, P10 −16,8, P90 +27,3 kcal/j ; 43 % sous 10 kcal/j |
| 5.5 premier plan K2 | à 1 %/semaine en perte : plancher actif pour 35,6 % des profils (S0 : 1,3 %) |
| 5.6 invariants et temps | 0 violation ; P95 × 4 [déduit] : 425 ms (recalcul complet K2), sous 1 s |

Point à trancher par le product owner (section 9) : la passe doublée applique la règle commune « INCONCLUSIF » de `THRESHOLDS.md`. Sans elle, l'arrêt 3 s'appliquait après la première passe et ni 5.2 ni 5.3 n'auraient tourné.

---

## 0. État de départ et commit de l'amendement 4

- **[mesuré]** `git status` au départ, branche `bench/journal-battery` :
  - `.gitignore` modifié hors de mes commits : non touché, non commité ;
  - non suivis : `reports/31_…`, `33_…` à `37_…`, `tests/experiments-journal/results/results.zip` (non commité).
- **[mesuré]** `git log --oneline -3` : `48c59f3 bench(journal): iteration 2a first plan, golden, invariants and timing (s7)`, `3e42eb6 …`, `b774261 …`.
- **[mesuré]** `npm run check` au départ : **vert**. Typecheck et lint sans erreur, **533 / 533** tests (45 fichiers), 29 s.
- **Commit de l'amendement 4 : `3569052`**, `THRESHOLDS.md` seul, avant toute mesure.
  - **[mesuré]** Les 20 lignes ajoutées sont identiques aux lignes 163 à 182 du prompt (`diff` sans différence).
  - Comme aux amendements précédents : contenu du bloc ```` ```markdown ```` sans ses clôtures, précédé d'une ligne vide, fins de ligne CRLF.
- **[mesuré]** `npm run check` à la fin : **vert**, **539 / 539** tests (46 fichiers), 29 s.

Commits de l'itération :

| Commit | Contenu |
|---|---|
| `3569052` | amendement 4 (s2) |
| `81b87fe` | options du prototype, tests, preuve de non-régression (s3) |
| `3bcb100` | harness 2b, test d'équivalence (résultats), reproduction de 2a, script des tableaux, avant toute mesure (s4) |
| `35e5d09` | scripts de 5.5 et 5.6, avant leur exécution (s4) |
| `af7ed13` | bruts et tableaux de la sélection, première passe (s5) |
| `252dfa8` | sorties de 5.6 par candidat (s6) |
| `30e6a17` | déclaration de la passe doublée de K2, avant son exécution (s6) |
| `94e15a2` | passe doublée, invariants et temps de 5.6 (s6) |
| `eb360b5` | validation (s7) |
| `8d60518` | monde réaliste, premier plan de K2, tableaux (s8) |

Ce rapport, sous `reports/`, n'est pas commité, comme les rapports 34 à 37.

## 1. Prototype

### Fichiers et signatures

- **`src/science/goals.ts`** **[lu]** :
  - `SolverOptions.solverHorizonDays?: number` (l. 130), absent par défaut ;
  - `solverHorizonDaysOf(ctx)` (l. 271) : l'option, sinon `GOAL_SOLVER_HORIZON_DAYS` (42) ;
  - `solverOptionsActive` (l. 276) : vrai aussi quand l'horizon diffère de 42. Faux : chaque point d'entrée passe par son code de production, inchangé ;
  - `horizonTarget` (l. 357) : masse tissulaire de départ + W × ((1 ∓ r)^(H/7) − 1) sous `sustainedTissue`, W × (1 ∓ r)^(H/7) sinon, via `targetWeightAfterDays` (l. 465, même expression que `targetWeightAtHorizon`) ;
  - `solveCaloriesAtHorizon` (l. 365) : bisection au jour H ; `SolverOriginSummary.horizonDays` ajouté ;
  - curseur : `baselineWeightAtHorizon` (l. 764) et `solveSliderPoint` (l. 788) au jour H ; variation hebdomadaire projetée sur H jours.
- **`src/science/modeledBody.ts`** **[lu]** l. 45-50 : les jours de la fenêtre sont ceux de `fitCalibration`, les jours après la dernière pesée viennent de la reconstruction prolongée. `reconstructDays` (`calibration.ts:183`) renvoie déjà vers `reconstructJournalDays` quand l'entrée porte `intakeObservations` ; la médiane de fenêtre de cette reconstruction dépend du nombre de jours, d'où la conservation des jours de la fenêtre.
- **`src/domain/engine.ts`** **[lu]** :
  - `SolverRequest.solverHorizonDays?` (l. 69), transmis par `solverOptionsFor` ;
  - `planAgeDays(plan, today)` (l. 742) : jours depuis `plan.createdAt` ;
  - `PeriodicReplanResult` (l. 746) : `not_due`, `no_snapshot`, `failed` (avec la raison), `replanned` ;
  - `periodicReplan(store, today, { replanEveryDays, solver })` (l. 763) : reconstruit le plan depuis le dernier snapshot appliqué, sans calibration, par `buildPlanFromStore` (mêmes règles que tout recalcul), en gardant la cible de pas du plan. Snapshots, référence de surfaçage et journaux passés inchangés ; journal du jour aligné sur le nouveau plan.
- **Harness** **[lu]** `tests/helpers/closedLoop.ts` :
  - `UserSpec.replanEveryDays` (l. 324) ;
  - `periodicStep` (l. 1057), appelé chaque matin après l'évaluation hebdomadaire ;
  - `journalSolverOptions` (l. 755) et `journalGoalPlan(…, solver?)` (l. 769) : options de solveur du mode journal, corps modélisé depuis l'entrée de calibration du mode journal ;
  - `applyJournalPlan` (l. 947) : plan du mode journal, recalibration ou recalcul périodique ;
  - `tissueBlockRatio` (l. 1291) et `worldTissueKg` (`closedLoopHall.ts:93`) : masse tissulaire vraie du monde (gras + maigre).

### Points d'entrée couverts par l'horizon

Solveur, boucle des vitesses (`evaluateWeeklyRate`, `buildGoalPlan`, `maxSelectableWeeklyRate`), curseur (`solveSliderPoint`, `solveRoundedSliderPoint`, `effectiveMinSliderSteps`, `baselineWeightAtHorizon`). `projectPlan` (l. 681) ne dépend pas de l'horizon **[lu]** : elle projette jusqu'à la cible finale, depuis le corps modélisé sous `currentState` (inchangé depuis 2a).

### Écarts à ce prompt et leurs raisons

1. **Cadence après un échec.** Le recalcul est dû quand l'âge du plan est un multiple strictement positif de 28 (28, 56…). Un recalcul refusé ou sans snapshot laisse le plan en place, il est compté, puis retenté 28 jours plus tard, et non chaque jour.
2. **Source du plan recalculé** : `'recalibrated'`. Le schéma n'accepte que trois valeurs (`schema.ts:119`) ; une valeur propre demanderait un changement de schéma (section 8).
3. **Mode journal (3.3, sans mesure).** Recalcul périodique à partir du dernier plan du mode journal (offset et intervalles), avec l'entrée de calibration du mode journal du jour. Avant le premier plan journal, il est compté « sans snapshot ». Pas de recalcul périodique dans le bras C (cible choisie par l'utilisateur).
4. **S3 sur les tissus (A4.1)** : pente MCO de la masse tissulaire vraie sur 8 jours / poids vrai de début de semaine, contre le plafond IMC. S3 sur le poids est rapporté.
5. **Passe doublée de la sélection** et **5.6 mesuré pour K1 et K2** : voir sections 2, 7 et 9.

### Isolement (3.4)

- **[mesuré]** Test « isolation » de `tests/domain/solverPrototype2b.test.ts` : aucun module de `src/store`, `src/app`, `src/screens`, `src/components`, `src/hooks` ni `src/main.tsx` ne mentionne `periodicReplan`, `planAgeDays`, `solverHorizonDays`, `replanEveryDays` ni `journalSolverOptions`. Le test d'isolement de 2a reste vert.

### Preuve de non-régression (3.5)

- Capture : mêmes scripts qu'en 2a (`tests/experiments-journal/capture/`) : T-03, T-04, golden, R et S, `convergenceJourney`. Avant : `3569052` (même `src/` que `48c59f3`). Après : prototype de s3, options absentes.
- **[mesuré]** `results/solver2b/nonregression.txt` : **2 523 011 valeurs, 0 différence**. T-03, T-04 et golden identiques à l'octet : préfixes sha256 `3447793a…`, `c65c47cf…`, `e20b17f4…`, les mêmes qu'aux phases précédentes.
- **[mesuré]** `results/solver2b/repro2a.txt` : les 128 lignes brutes du shard 0 de `ideal2a` (32 utilisateurs × 4 bras) rejouées avec le simulateur de 2b : **12 160 valeurs, 0 différence**.

### Tests ajoutés (`tests/domain/solverPrototype2b.test.ts`, 6 tests)

- horizon absent ou égal à 42 : production exacte, et FX de 2a exact ;
- horizon 28 + `sustainedTissue` : masse tissulaire du jour 28 à 0,01 kg au plus de la cible ; invariants du curseur ;
- recalcul périodique : dû à 28 et 56 jours, pas à 27 ni 29 ; sans snapshot, le plan reste ;
- recalcul périodique : même plan qu'une reconstruction depuis le dernier snapshot, âge remis à zéro, snapshots, référence de surfaçage et journaux passés inchangés ;
- corps modélisé et plan du mode journal contre la méthode actuelle (2 fixtures) ;
- isolement.

### Test d'équivalence (3.3)

**[lu]** `tests/experiments-journal/it2b/equiv2b.experiment.ts` ; **[mesuré]** `results/solver2b/equiv2b.txt`, `equiv2b.csv.gz`.

- **Fixtures.** 50 utilisateurs du monde idéal (graines 3,3·10⁹ ; saisie exacte, u = 0, sans bruit ; suiveurs déclarant « plan respecté »), bras FX, simulés 28, 56 et 84 jours : **150 fixtures**.
- **Comparaison**, le dernier jour de chaque fixture :
  - méthode actuelle : entrée de calibration, ajustement, snapshot de `computeCalibrationState`, corps modélisé, plan par `buildPlanFromStore` ;
  - mode journal : `journalCalibrationInputFromStore` (régime dès le jour 0, R0, poids 0,5, prior NASEM, grille de production, glucides `harness_scaled`), ajustement, corps modélisé à sa propre médiane, plan par `journalGoalPlan` ;
  - mêmes options de solveur, FX puis K2 ; plancher de production (on compare le chemin, pas le plancher × 1,10 du bras).
- **Tolérance déclarée avant l'exécution** : médiane a posteriori et cible |Δ| ≤ 1 kcal/j (tolérance de N1), même vitesse appliquée, poids modélisé et masse tissulaire |Δ| ≤ 0,001 kg. Elle est nécessaire parce que les totaux du journal sont arrondis à 0,01 kcal (`journal.ts:218-220`).

| Grandeur | Écart max |
|---|---|
| médiane a posteriori | 0,0045 kcal/j |
| poids modélisé | 1,4·10⁻⁵ kg |
| masse tissulaire | 1,2·10⁻⁵ kg |
| AT / glycogène / LEC / ordonnée | 0,0007 kcal/j / 9·10⁻⁷ kg / 4,5·10⁻⁶ kg / 1,3·10⁻⁵ kg |
| cible du plan, FX et K2 | **0** : 150 / 150 identiques au bit près ; même statut 150 / 150 (2 fixtures sans plan dans les deux chemins) |

**Verdict : PASSE.** Arrêt 1 non déclenché.

## 2. Sélection

**Monde** : Hall nominal, pesées sans bruit, u = 0, suiveurs parfaits. Graines de sélection 2,7·10⁹, 500 utilisateurs (191 en perte, 156 en prise, 153 en maintien). Bras appariés S0, FX, K1, K2. **[mesuré]** `results/solver2b/select2b-shard*.csv.gz`, `tables2b.md`, section 5.1.

### Médianes par fenêtre, tissus [IC 95 %] (poids total entre parenthèses)

| Bras | Perte, sem. 5-12 | Perte, sem. 13-24 | Prise, sem. 5-12 | Prise, sem. 13-24 |
|---|---|---|---|---|
| S0 | 0,715 [0,709 ; 0,724] (0,709) | 0,640 [0,629 ; 0,652] (0,639) | 0,770 [0,755 ; 0,791] (0,774) | 0,673 [0,661 ; 0,680] (0,676) |
| FX | 1,021 [1,018 ; 1,029] (1,020) | 0,985 [0,980 ; 0,987] (0,987) | 1,068 [1,057 ; 1,074] (1,072) | 0,962 [0,958 ; 0,966] (0,966) |
| K1 | 1,021 [1,018 ; 1,029] (1,020) | 1,001 [0,998 ; 1,003] (1,005) | 1,068 [1,057 ; 1,074] (1,072) | 1,029 [1,022 ; 1,034] (1,044) |
| K2 | 1,015 [1,011 ; 1,020] (1,013) | 0,991 [0,988 ; 0,994] (0,996) | 1,047 [1,039 ; 1,053] (1,054) | 1,011 [1,005 ; 1,014] (1,025) |

### Médianes par bloc de 4 semaines, tissus

| Bras | Objectif | Sem. 5-8 | 9-12 | 13-16 | 17-20 | 21-24 |
|---|---|---|---|---|---|---|
| S0 | perte | 0,737 | 0,691 | 0,659 | 0,634 | 0,617 |
| S0 | prise | 0,792 | 0,753 | 0,724 | 0,671 | 0,644 |
| FX | perte | 1,037 | 1,007 | 0,996 | 0,980 | 0,976 |
| FX | prise | 1,080 | 1,047 | 1,021 | 0,941 | 0,912 |
| K1 | perte | 1,037 | 1,007 | 0,998 | 1,002 | 1,001 |
| K1 | prise | 1,080 | 1,047 | 1,029 | 1,027 | 1,031 |
| K2 | perte | 1,028 | 1,000 | 0,991 | 0,992 | 0,989 |
| K2 | prise | 1,060 | 1,027 | 1,011 | 1,009 | 1,012 |

Les IC et les blocs sur le poids total sont dans `tables2b.md`. Sur le poids total, K1 en prise dépasse les tissus de 0,015 à 0,018 sur les blocs 13 à 24 (1,040 à 1,049).

### Ratio selon l'âge moyen du plan actif, tissus (tous blocs)

| Âge | FX perte | FX prise | K1 perte | K1 prise | K2 perte | K2 prise |
|---|---|---|---|---|---|---|
| 0 à 7 j | 1,037 | 1,080 | 1,033 | 1,079 | 1,024 | 1,058 |
| 7 à 14 j | 1,001 | 1,034 | 1,002 | 1,031 | 0,994 | 1,012 |
| 28 à 42 j | 0,974 | 0,963 | 0,885 (n = 11) | — | 0,862 (n = 9) | — |
| au-delà de 42 j | 0,901 | 0,902 | 0,775 (n = 23) | — | 0,792 (n = 20) | — |

- **[mesuré]** Âge moyen du plan actif, médiane par bloc : FX 3 ; 10 ; 13,5 ; 41,5 ; 27,5 à 69,5 jours ; K1 et K2 : 3 ; 10 ; 13,5 ; 13,5 ; 13,5 jours.
- **[mesuré]** Sous K1 et K2, les rares blocs au-delà de 28 jours viennent des recalculs refusés (ci-dessous).

**Différences appariées [mesuré]** (tissus, IC 95 %) :

- FX → K1 : 0,000 [0 ; 0] sur les semaines 5 à 12 dans les deux objectifs ; +0,016 [0,013 ; 0,020] en perte et +0,067 [0,060 ; 0,072] en prise sur les semaines 13 à 24 ;
- FX → K2 : −0,006 en perte et −0,020 [−0,023 ; −0,017] en prise sur les semaines 5 à 12 ; +0,006 et +0,049 sur les semaines 13 à 24.

**Autres constats [mesuré]** : 8 recalibrations appliquées en médiane dans chaque bras. Recalculs périodiques faits : 995 (K1), 1 000 (K2). Dus sans snapshot : 5 et 5. Refusés : 53 et 49, dont 50 et 46 en `loss_unavailable_low_bmi` (IMC passé sous 20 en perte). Échecs `no_feasible_speed` des recalibrations : 5 (S0), 16 (FX, K1, K2).

**Arrêt 2 [mesuré]** : S0, poids total, semaines 5 à 24 : **0,667** en perte (0,654 ± 0,03) et **0,700** en prise (0,703 ± 0,03). Reproduit ; pas d'arrêt.

### Critères de A3.1 sur les tissus, première passe

| Candidat | Critères passés | Critère manqué | Statut |
|---|---|---|---|
| K1 | 13 / 14 | prise, sem. 5-12 : 1,068 [1,057 ; 1,074], IC entier au-dessus de 1,05 | **échoue** |
| K2 | 13 / 14 | prise, sem. 5-12 : 1,047 [1,039 ; 1,053], IC à cheval sur 1,05 | **inconclusif** |

Blocs de K1 et K2 : tous dans [0,90 ; 1,10], IC compris (bloc le plus haut : prise, sem. 5-8, K1 1,080 [1,076 ; 1,086]). FX (rapporté) : échoue sur le même critère que K1.

### Passe doublée de K2 (5.1 bis)

- **Règle appliquée [lu]** `THRESHOLDS.md`, règles communes : « INCONCLUSIF (IC qui chevauche le seuil) n'est jamais GO : on double n une fois, puis on rapporte », avec A1.3 (graines neuves, verdict sur la nouvelle passe seule).
- Déclarée et commitée (`30e6a17`) après la première passe et avant son exécution : graines 3,5·10⁹, 1 000 utilisateurs (392 en perte, 306 en prise, 302 en maintien), bras S0 et K2. K1, en échec franc, n'est pas relancé.
- **[mesuré]** `results/solver2b/select2bx2-shard*.csv.gz`, `tables2b.md`, section 5.1 bis.

| K2, passe doublée | Perte | Prise |
|---|---|---|
| sem. 5-12 | 1,014 [1,011 ; 1,017] | **1,044 [1,042 ; 1,049]** |
| sem. 13-24 | 0,988 [0,986 ; 0,990] | 1,010 [1,007 ; 1,012] |
| blocs (min – max) | 0,987 – 1,028 | 1,009 – 1,062 |

Les 14 critères passent, IC compris. S0 de cette passe, poids total, semaines 5 à 24 : 0,658 en perte, 0,704 en prise.

**Règle A4.2 : K1 échoue, K2 passe (passe doublée) ; candidat retenu : K2.**

## 3. Validation : verdict A3.1

Graines de validation 2,8·10⁹, 500 utilisateurs (196 en perte, 152 en prise, 152 en maintien), bras S0 et K2. **[mesuré]** `results/solver2b/valid2b-shard*.csv.gz`, `tables2b.md`, section 5.2.

| Critère (tissus) | Perte | Prise |
|---|---|---|
| sem. 5-12, bande [0,95 ; 1,05] | 1,016 [1,010 ; 1,020] | 1,045 [1,040 ; 1,049] |
| sem. 13-24 | 0,990 [0,987 ; 0,993] | 1,008 [1,005 ; 1,011] |
| bloc 5-8, bande [0,90 ; 1,10] | 1,031 | 1,064 [1,057 ; 1,067] |
| blocs 9-12 à 21-24 | 0,989 à 1,002 | 1,007 à 1,026 |

**A3.1 (K2, validation) : PASSÉ.**

- Poids total (rapporté) : perte 1,013 et 0,994 ; prise 1,053 [1,049 ; 1,062] et 1,025 [1,020 ; 1,028].
- Témoin S0, tissus : perte 0,718 et 0,638 ; prise 0,766 et 0,668.
- Différences appariées K2 − S0 : +0,298 et +0,353 en perte, +0,278 et +0,340 en prise.
- Ratio de K2 selon l'âge du plan : 0 à 7 jours, 1,028 en perte et 1,060 en prise ; 7 à 14 jours, 0,993 et 1,011.
- Strates (sexe, IMC, activité, vitesse, objectif) : `tables2b.md`.

## 4. Monde réaliste : verdicts A3.2, non-suiveurs réguliers

Hall perturbé à ±20 %, pesées t + D + E, pas bruités. 2 000 suiveurs (graines 2,9·10⁹) et 500 non-suiveurs réguliers (graines 3,0·10⁹, s = −270 / +270, « plan respecté » chaque jour). Bras S0 et K2. **[mesuré]** `results/solver2b/real2b-shard*.csv.gz`, `tables2b.md`, section 5.3.

### Suiveurs, verdict A3.2 (K2)

| Critère | Valeur [IC 95 %] | Seuil | Verdict |
|---|---|---|---|
| S1 perte, sem. 5-12 (tissus) | 1,013 [1,001 ; 1,027] | [0,85 ; 1,15] | passe |
| S1 perte, sem. 13-24 | 0,993 [0,987 ; 1,000] | idem | passe |
| S1 prise, sem. 5-12 | 1,042 [1,002 ; 1,079] | idem | passe |
| S1 prise, sem. 13-24 | 1,023 [1,007 ; 1,034] | idem | passe |
| S2 perte, sem. 5-12 (P90 tissus) | 1,361 [1,324 ; 1,412] | borne haute ≤ 1,25 | **échoue** |
| S2 perte, sem. 13-24 | 1,167 [1,153 ; 1,193] | idem | passe |
| S2 prise, sem. 5-12 | 1,644 [1,593 ; 1,707] | idem | **échoue** |
| S2 prise, sem. 13-24 | 1,311 [1,288 ; 1,337] | idem | **échoue** |
| S3 (tissus), utilisateurs-semaines au-dessus du plafond | 8 089 / 48 000 = 16,85 % [16,52 ; 17,19 %] | borne haute ≤ 5 % | **échoue** |
| S4, utilisateurs ≥ 7 j sous le plancher réel | 370 / 2 000 = 18,50 % [16,86 ; 20,26 %] | ≤ 1 %, borne haute ≤ 2 % | **échoue** |
| S7, maintien dans la zone à 8 semaines | 310 / 620 = 50,0 % [46,1 ; 53,9 %] | borne basse ≥ 80 % | **échoue** |

**A3.2 (K2) : ÉCHOUÉ.**

### Témoin S0 (rapporté, sans verdict) et poids total

| Critère | S0 | K2, poids total (rapporté) |
|---|---|---|
| S1 perte / prise, sem. 5-12 | 0,703 / 0,761 | 1,015 / 1,060 |
| S1 perte / prise, sem. 13-24 | 0,645 / 0,699 | 0,996 / 1,049 |
| S2 perte / prise, sem. 5-12 | 1,026 / 1,407 | 1,371 / 1,689 |
| S2 perte / prise, sem. 13-24 | 0,821 / 1,020 | 1,198 / 1,397 |
| S3 tissus (S0) ; poids total (K2) | 8,11 % [7,87 ; 8,36 %] | 25,50 % [25,11 ; 25,89 %] |
| S4 | 204 / 2 000 = 10,20 % [8,95 ; 11,60 %] | — |
| S7 | 306 / 620 = 49,4 % [45,4 ; 53,3 %] | — |

- **[mesuré]** S3 sur le poids total de S0 : 17,69 % [17,35 ; 18,03 %].
- **[mesuré]** Différences appariées K2 − S0 (tissus) : +0,311 et +0,349 en perte, +0,280 et +0,324 en prise.
- **[mesuré] S4 par strate (K2)** : 361 des 370 utilisateurs sont en perte. À 1 %/semaine : 291 / 386 ; à 0,5 %/semaine : 52 / 227 ; à 0,25 %/semaine : 18 / 158. En prise, 2 / 609 ; en maintien, 7 / 620.
- **[mesuré] S7 par strate (K2)** : de 60 / 152 (IMC 21) à 91 / 157 (IMC 38).
- **[mesuré]** Recalibrations appliquées : 11 en médiane dans les deux bras. Utilisateurs avec une recalibration refusée : 49 (S0) et 95 (K2) ; `no_feasible_speed` : 43 et 65. Aucune proposition de révision.

### Non-suiveurs réguliers (sans verdict)

| Bras | Perte, sem. 5-12 | Perte, sem. 13-24 | Prise, sem. 5-12 | Prise, sem. 13-24 |
|---|---|---|---|---|
| S0, tissus | 0,702 [0,663 ; 0,728] | 0,629 [0,609 ; 0,652] | 0,739 [0,630 ; 0,824] | 0,706 [0,672 ; 0,740] |
| K2, tissus | 1,015 [0,993 ; 1,053] | 0,997 [0,984 ; 1,011] | 1,030 [0,925 ; 1,096] | 1,019 [0,992 ; 1,041] |
| K2, poids total | 1,019 | 0,996 | 1,069 | 1,052 |

- Par s (−270 / +270) : `tables2b.md`. P10 / P90 de K2, tissus, semaines 5 à 24 : 0,720 / 1,284 en perte, 0,625 / 1,438 en prise.
- Maintien dans la zone à 8 semaines : S0 82 / 159, K2 81 / 159.

## 5. Recalcul périodique, vu par l'utilisateur (5.4)

Candidat K2, monde réaliste. **[mesuré]** colonne `replans` de `real2b-shard*.csv.gz`, `tables2b.md`.

| | Suiveurs (2 000) | Non-suiveurs réguliers (500) |
|---|---|---|
| Recalculs faits | 2 307 | 602 |
| Par utilisateur, médiane [P10 ; P90], max | 1 [0 ; 2], 5 | 1 [0 ; 2], 5 |
| Utilisateurs sans recalcul | 252 | 68 |
| Écart de cible (nouvelle − ancienne), médiane [P10 ; P90] | 0,0 [−16,8 ; +27,3] kcal/j | +0,5 [−15,8 ; +28,2] kcal/j |
| \|écart\| médian ; P90 | 13,6 ; 28,4 kcal/j | 12,6 ; 29,4 kcal/j |
| Part avec \|écart\| < 10 kcal/j [Wilson] | 991 / 2 307 = 42,96 % [40,95 ; 44,99 %] | 270 / 602 = 44,85 % [40,92 ; 48,84 %] |
| Dus sans snapshot (non faits) | 15 | 12 |
| Refusés, plan laissé en place | 246 : `loss_unavailable_low_bmi` 234, `target_not_above_current` 6, `no_feasible_speed` 6 | 74 : 67, 2, 5 |

Écarts de cible par objectif (suiveurs) :

- perte : médiane −13,6 kcal/j [P10 −24,2 ; P90 −2,1], 187 / 742 sous 10 kcal/j ;
- prise : +22,1 [15,7 ; 31,5], 3 / 763 sous 10 ;
- maintien : 0,0 [−2,1 ; 2,1], 801 / 802 sous 10.

Dans le monde idéal (validation, K2) : 981 recalculs, écart médian 0,0 [−16,8 ; +27,3], 42,81 % sous 10 kcal/j, 5 sans snapshot, 61 refusés.

## 6. Premier plan (K2)

**[mesuré]** `results/solver2b/firstplan2b-shard*.csv.gz`, `golden2b-shard0.csv.gz`, `tables2b.md`, section 5.5. 1 000 profils de l'hypercube (graines 3,1·10⁹), chaque vitesse de la grille. Premier plan sans calibration : les trois bras partent de l'équilibre. K2 diffère de FX par l'horizon seul.

| Objectif | Vitesse | Δ cible K2 − S0, médiane [P10 ; P90] | Δ cible K2 − FX | Ralentis par le plancher S0 → FX → K2 | Sans vitesse faisable |
|---|---|---|---|---|---|
| perte | 0,25 %/sem. | −56 [−88 ; −36] | +6 [5 ; 9] | 0 → 0 → 0 % | 0 % partout |
| perte | 0,50 %/sem. | −113 [−180 ; −36] | +10 [6 ; 16] | 0 → 0 → 0 % | 0 % |
| perte | 0,75 %/sem. | −171 [−275 ; −36] | +12 [6 ; 18] | 0 → 3,32 → 2,56 % | 0 % |
| perte | 1,00 %/sem. | −212 [−298 ; −31] | +13 [4 ; 18] | 1,28 → 37,60 → 35,55 % | 0 % |
| prise | 0,25 %/sem. | +55 [29 ; 79] | −9 [−14 ; −7] | 0 % | 0 % |
| prise | 0,50 %/sem. | +108 [59 ; 154] | −20 [−30 ; −16] | 0 % | 0 % |
| maintien | — | 0 | 0 | 0 % | 0 % |

- Toutes les vitesses sont dans `tables2b.md`.
- À 1 %/semaine en perte : 139 profils sur 391 ont une vitesse retenue plus lente sous K2 que sous S0 ; aucun n'est plus lent sous K2 que sous FX.

**Golden, R et S [mesuré]** :

| Cas | K2 − S0 (kcal/j) | K2 − FX | Vitesse retenue S0 → FX → K2 |
|---|---|---|---|
| 12 golden, perte | −58 à −211 | +4 à +23 | inchangée |
| 12 golden, prise | +10 et +28 | −2 et −10 | inchangée |
| 12 golden, maintien | 0 | 0 | inchangée |
| R et S sans historique | −229 et −213 | +13 et +15 | inchangée |
| S avec historique | −238 | +10 | inchangée |
| R avec historique | −163 | +8 | 1 % → 0,9 % → 0,9 %/sem. (1 % et 0,95 % en `below_hard_floor`) |

## 7. Invariants et temps de calcul (5.6)

Mesurés pour K1 et K2, avant la passe doublée, à un moment où aucun candidat n'était retenu. Les lignes de K2 sont celles du candidat retenu.

**Invariants du curseur [mesuré]** (`invariants2bK2-shard*.csv.gz`, pas de 500 sur toute l'étendue du curseur) :

| Source (K2, horizon 28 j) | Plans | Points | Violations de monotonie | \|masse tissulaire j28 − cible\| max (curseur ; plan) | Non convergés |
|---|---|---|---|---|---|
| premiers plans de l'hypercube (graines 3,1·10⁹) | 200 | 5 936 | **0** | 0,002 kg ; 0,002 kg | 0 |
| utilisateurs simulés au jour 83, état actuel (graines 3,2·10⁹) | 50 | 1 466 | **0** | 0,002 kg ; 0,002 kg | 0 |

K1 (horizon 42 jours) : 0 violation, écart max 0,003 kg.

**Temps [mesuré]** (`timing2bK2-shard0.csv.gz`) :

- 50 profils, suiveurs réalistes pesés chaque jour, 84 pesées.
- Un processus seul, un tour de chauffe, médiane de 3 mesures par profil.
- « Recalcul complet » : `computeCalibrationState` + `applyRecalibration`.
- « Recalcul périodique » : `buildPlanFromStore` depuis le snapshot appliqué (état actuel + solveur, sans calibration).

| Bras | Opération | P50 | P95 | P95 × 4 [déduit] | Seuil 1 s |
|---|---|---|---|---|---|
| S0 | recalcul complet | 94,8 ms | 103,4 ms | 414 ms | sous |
| K2 | recalcul complet | 96,9 ms | 106,3 ms | 425 ms | sous |
| K2 | recalcul périodique | 2,9 ms | 4,7 ms | 19 ms | sous |

Lancement K1 : S0 107,5 ms, K1 107,1 ms (P95).

## 8. Inventaire pour la mise en production (K2, sans code)

**Points d'entrée à couvrir** [lu] :

- **Science** (`src/science/goals.ts`) : déjà couverts par les options. En production, l'horizon deviendrait `GOAL_SOLVER_HORIZON_DAYS = 28` (`constants.ts:220`, métadonnées l. 525), et `targetWeightAtHorizon` (l. 457) suivrait.
- **Domaine** (`src/domain/engine.ts`) :
  - `buildPlan`, `buildPlanFromStore`, `previewInitialPlan`, `completeOnboarding`, `applyRecalibration` : les options par défaut au lieu d'un argument ;
  - `changeGoal` et `updateProfile` (l. 602, 611) : reconstruisent par `buildPlanFromStore` sans option ;
  - `rebuildContextFromStore` (l. 241) et `contextForCurrentPlan` (l. 251) : contextes sans corps modélisé.
- **Curseur (non couvert en 2a)** : `createSliderSession` (l. 534) calcule `baselineWeight42 = weightAtDay(…, GOAL_SOLVER_HORIZON_DAYS)`, un poids. Il faudrait la masse tissulaire au jour H et le corps modélisé. `applySliderSteps` (l. 561) en dépend ; appelés depuis `src/screens/BalanceSheet.tsx:18,49`.
- **Modèles du curseur de vitesse (non couverts)** : `speedSliderModelFor` (l. 406), `onboardingSpeedSliderModel` (l. 425), `storeSpeedSliderModel` (l. 435) : `maxSelectableWeeklyRate` sur des contextes sans option. Appelés depuis `src/screens/Onboarding.tsx:89,634` et `src/screens/Account.tsx:113,129`.
- **Vues** : `projectionFromToday` (`src/domain/views.ts:162-178`) projette depuis l'équilibre au poids de tendance, pas depuis le corps modélisé.
- **Explications** :
  - `src/domain/explain.ts:452` écrit `horizonDays: GOAL_SOLVER_HORIZON_DAYS` au lieu de l'horizon du solve (`solve.origin.horizonDays`) ;
  - `explain.ts:484` appelle `previewInitialPlan` ;
  - `src/components/ResultExplanationView.tsx:458` affiche le libellé fixe « Cible à 42 j / poids du modèle ».
- **Écrans qui recalculent** : `src/screens/Tracking.tsx:346` (aperçu du recalcul, `buildPlanFromStore`) et `:400` (`applyRecalibration`), `src/screens/Result.tsx:18,64,74`, `src/screens/Account.tsx:137,587`.
- **Recalcul périodique** : aucun déclencheur en production. Il faudrait un point d'appel à l'ouverture ou au changement de jour (store ou `Tracking.tsx`), une présentation à l'utilisateur, l'acceptation et le refus.
- **Worker** : `src/store/calibration.worker.ts` ne calcule que l'état de calibration. Le recalcul périodique coûte 5 ms au P95 **[mesuré]** ; le placer ou non dans le worker est une question d'ingénierie [déduit].

**Stockage de l'âge du plan et du recalcul périodique** :

- **Âge** : dérivable de `CurrentPlan.createdAt`, déjà stocké et validé (`schema.ts:118`). Aucun changement de schéma pour l'âge lui-même [lu].
  - `applySliderSteps` conserve `createdAt` (`engine.ts:579-593`), donc un ajustement du curseur ne remet pas l'âge à zéro. À trancher [déduit].
- **Refus d'un recalcul présenté** : pour ne pas le représenter chaque jour, il faudrait une trace, par exemple dans `AppMeta` (`types.ts:214-254`, comme `lastSurfacedCalibration`) avec son validateur dans `schema.ts`. C'est un changement de schéma [déduit].
- **Source du plan** : une valeur propre (par exemple « recalcul périodique ») change `types.ts:145` et `schema.ts:119`. Le prototype utilise `'recalibrated'`.
- Le besoin d'un bump de `SCHEMA_VERSION` pour ces deux changements est à décider [déduit].

**Golden et tests à mettre à jour** [lu] :

- `tests/science/golden.test.ts` et `tests/science/__snapshots__/golden.test.ts.snap` : premier plan de −58 à −211 kcal/j en perte, +10 à +28 en prise (section 6) ;
- captures T-03, T-04, golden, R et S, `convergenceJourney` (`tests/experiments-journal/capture/`) : nouvelles références ;
- `tests/science/goals.test.ts`, `tests/domain/engine.test.ts`, `tests/domain/convergenceJourney.test.ts`, `tests/domain/explainAndScreens.test.ts`, `tests/science/propertyMatrix.part*.test.ts` : tout ce qui fixe une cible, l'horizon de 42 jours ou la trajectoire ;
- `tests/domain/solverPrototype.test.ts` et `solverPrototype2b.test.ts` : à convertir en tests de production.

**Version scientifique** : `SCIENTIFIC_MODEL_VERSION = '1.3.0'` (`constants.ts:12`) à relever. Non fait dans cette itération (interdit).

**Textes d'interface nécessaires** (listés, non rédigés) :

1. départ plus rapide sur la balance dû à l'eau et au glycogène (poids total au-dessus des tissus en prise : 1,053 contre 1,045 sur les semaines 5 à 12 en validation) ;
2. recalcul du plan toutes les 4 semaines, présenté à l'utilisateur, même sans nouvelle calibration ;
3. vitesse maximale possible selon le profil : plancher actif pour 35,6 % des profils à 1 %/semaine en perte (S0 : 1,3 %) ;
4. libellé de l'horizon du solveur dans l'explication (« Cible à 42 j » devient 28 j) ;
5. recalcul non fait parce que la perte n'est plus disponible (IMC sous 20) : cas le plus fréquent des recalculs refusés.

## 9. Arrêts déclenchés, le cas échéant

- **Règles 1 et 2** : non déclenchées (non-régression 0 différence, équivalence passée ; témoin reproduit).
- **Règle 3 (aucun candidat ne passe la sélection)** :
  - Après la **première passe** : K1 en échec franc, K2 inconclusif sur un seul critère.
  - **J'ai appliqué la règle commune de `THRESHOLDS.md`** (INCONCLUSIF → n doublé une fois, graines neuves A1.3, verdict sur la nouvelle passe seule) avant de conclure. Sur la passe doublée, K2 passe ; la règle 3 n'est donc pas déclenchée.
  - **À trancher par le product owner.** Ni A4.2 ni le prompt ne mentionnent la passe doublée. Si A4.2 devait être lue sans la règle commune, la conclusion serait « aucun candidat, arrêt 3 », et les sections 3, 4 et 6 n'existeraient pas.
  - Le rapport 37 jugeait déjà « chaque critère sur l'IC 95 % » (règle commune). Il n'avait pas eu à doubler : ses échecs étaient francs.
- **Règle 4** : non déclenchée (A3.1 passe en validation), donc 5.3 a tourné.
- **A3.2 échoue.** Aucune règle d'arrêt ne s'y attache dans le prompt. Rapporté, sans correction ni diagnostic au-delà des chiffres.
- **Règle 5** : 5.4 à 5.7 exécutés. 5.6 a été mesuré pour K1 et K2 parce qu'aucun candidat n'était retenu au moment de la mesure.

**Temps de calcul** : ≈ 1 h 50 de calcul effectif, sous le plafond de 4 h.

| Étape | Durée |
|---|---|
| captures « avant » et « après » | 56 et 52 s |
| pilote (graines 3,4·10⁹, sorties supprimées, aucun résultat utilisé) | 35 s |
| reproduction de 2a | 300 s |
| équivalence | 106 s |
| sélection | 519 s |
| passe doublée | 508 s |
| invariants | 6 s |
| temps de calcul (K1, K2) | 107 + 105 s |
| validation | 596 s |
| monde réaliste | 1 416 s |
| premier plan | 12 s |
| `npm run check` | 29 s et 29 s |

- Le travail a été interrompu de 20 h 16 à 23 h 31 (limite d'usage de la session), sans calcul en cours.
- Temps réel total : de 19 h 31 à 0 h 20 environ.
- Détail : `results/solver2b/timing/launch-times.txt`.

## 10. Non fait, incertitudes, incohérences

**Non fait**

- Aucune correction après l'échec de A3.2 : ni solveur, ni recalcul, ni plancher, ni simulateur.
- Aucun seuil, paramètre, cadence ni horizon modifié. Seules valeurs mesurées : cadence 28, horizons 42 et 28.
- Recalcul périodique du mode journal : implémenté (3.3), non mesuré, comme demandé.
- Inventaire 5.7 sans code.

**Incertitudes**

- **Passe doublée** (section 9) : c'est ma lecture des règles communes ; la décision appartient au product owner.
- **Critère S3 sur les tissus** : pente sur 8 jours de la masse tissulaire vraie. Le monde réaliste mange la cible × (1 + 0,08 z) chaque jour, ce qui bruite les pentes hebdomadaires ; S0 dépasse aussi le seuil (8,11 %). La mesure suit la définition de 2a appliquée aux tissus ; je n'ai pas isolé la part du bruit d'apport [déduit].
- **Équivalence** : tolérance déclarée plutôt que bit près pour l'état (totaux du journal arrondis à 0,01 kcal). Les cibles de plan sont identiques au bit près.
- **Glucides du monde idéal** : comme en 2a, le monde mange la part de base × apport. Leur rôle dans l'avance des premiers jours de plan en prise (1,058 sur les tissus à 0-7 jours sous K2) n'est pas isolé.
- **Âge du plan** : les recalculs sont dus seulement aux multiples de 28. Avec des recalibrations hebdomadaires, le premier recalcul périodique n'arrive qu'autour du jour 112 ; K1 est donc identique à FX sur les semaines 5 à 12 (différence appariée 0,000).

**Incohérences et constats**

- **[mesuré]** Dans le monde réaliste, le témoin S0 échoue aussi S3 (tissus 8,11 %), S4 (10,20 %) et S7 (49,4 %), sans verdict. S4 double sous K2 (18,50 %), surtout en perte à 1 %/semaine (291 / 386).
- **[mesuré]** Recalculs refusés : surtout `loss_unavailable_low_bmi` (IMC passé sous 20 en perte), 234 des 246 refus chez les suiveurs réalistes.
- **[mesuré]** Recalibrations refusées (`no_feasible_speed`) plus fréquentes sous K2 que sous S0 : 65 contre 43 chez les suiveurs réalistes.
- `tests/experiments-journal/it2a/` n'a pas été modifié. Les bruts de 2a sont reproduits à l'identique par le simulateur modifié (section 1).
- Le `.gitignore` modifié et `results.zip` ne sont pas de mon fait ; je n'y ai pas touché.
