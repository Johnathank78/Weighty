# 35 : batterie « journal dans la calibration », phase 1b

Mesures seulement : aucune fonctionnalité visible, aucune sortie de production modifiée. Branche `bench/journal-battery` (non fusionnée, rien sur `main`). Seuils : `tests/experiments-journal/THRESHOLDS.md`, amendement 1 compris. Tableaux complets : `tests/experiments-journal/results/tables1b.md` et `verdicts1b.json`.

Conventions : **[lu]** chemin:lignes ; **[mesuré]** fichier de résultats ; **[déduit]** raisonnement.

## Synthèse des verdicts

| Mesure | Verdict |
|---|---|
| Non-régression, options absentes | 2 523 011 valeurs, **0 différence** |
| N2 [S], grille ±1 200 (témoin) | **NO-GO** (identique à la passe 2 de la phase 1) |
| N2 [S], grille ±2 000 | **GO** (variante t(3) : NO-GO) |
| N2 [S], grille ±3 000 | **GO** (variante t(3) : GO) |
| N3 amendé (A1.2), chemin actuel, monde neuf | **GO** |
| N3 amendé (A1.2), prototype p1 (saisie exacte, glucides `harness_scaled`) | **GO** |
| N3 amendé, relecture après coup de n3x2 : chemin actuel / prototype | GO / NO-GO |
| N4, section 5 | diagnostics, sans verdict |

---

## 0. État de départ et commit de l'amendement

- **[mesuré]** `git status` : branche `bench/journal-battery`, un seul fichier modifié hors commit, `.gitignore`. Ce n'est pas mon changement : `/reports` y devient `reports/`, et `tests/` est ajouté. Je ne l'ai pas touché ni commité.
- **[mesuré]** `git log --oneline -3` : `5b17b73 bench(journal): N1 to N4 raw results, tables and verdicts (s5)`, `ca5f810 …`, `2d64c8d …`.
- **[mesuré]** `npm run check` au départ : **vert**. Typecheck et lint sans erreur, **517 / 517** tests (43 fichiers).
- **Commit de l'amendement : `ba8e60c`**. Il contient seulement `THRESHOLDS.md`, avant toute exécution de mesure. **[mesuré]** Le texte ajouté est identique aux lignes 129 à 148 du prompt (`diff` sans différence).
- **[mesuré]** `npm run check` à la fin : **vert**, **520 / 520** tests (43 fichiers). Les 3 tests ajoutés sont décrits en section 1.

Commits de la phase, dans l'ordre :

| Commit | Contenu |
|---|---|
| `ba8e60c` | amendement (s2) |
| `b6a39a0` | option de grille, tests et preuve de non-régression (s3) |
| `755d4fe` | runners de la phase 1b, avant toute mesure |
| `4d6afd7` | bruts N2g, N4g et temps (s4) |
| `91c65f9` | bruts de la section 5 |
| `0fe5674` | bruts de la section 6 |
| `1b79087` | script des tableaux, tableaux et verdicts (s4 à s7) |

## 1. Option de grille

### Fichiers et signatures

- **[lu]** `src/science/calibration.ts`, seule modification dans `src/science/` :
  - `CalibrationInput.offsetGridHalfRangeKcal?: number | undefined` (l. 103) ;
  - `widenedOffsetGrid(halfRangeKcal: number): number[]`, exportée (l. 446). Elle produit `k × CALIBRATION_GRID_STEP_KCAL` pour k de −n à +n et lève une erreur si la valeur n'est pas un multiple positif du pas ;
  - `fitCalibration` lève une erreur si l'option est combinée avec `historicalLogLikelihood` (l. 490), puis choisit `offsetGrid()` si l'option est absente et la grille élargie sinon (l. 491). Le reste de la fonction est inchangé :
    - exclusion D-28 (l. 513 à 515) ;
    - masque d'admissibilité passé au plancher (l. 574) ;
  - `offsetGrid()` (l. 436) et les constantes de grille ne sont pas modifiés.
- **[lu]** `src/domain/journalCalibration.ts` : `JournalRegimeOptions.offsetGridHalfRangeKcal?: number` (l. 51), transmis à l'entrée (l. 106).
- **[lu]** Harness, `tests/helpers/journalBattery.ts` :
  - `currentPathFit(store, today, structuralSdKcal?, overrides: CurrentPathOverrides = {})`, avec `CurrentPathOverrides = Partial<Pick<CalibrationInput, 'priorSigmaKcal' | 'offsetGridHalfRangeKcal'>>` (l. 281 à 283). Utilisé seulement par la section 5 ;
  - `WorldSettings` reçoit `weighNoiseScaleKg`, `firstWeighInExact` et `loggingNoiseSd` (l. 138 à 142). Les valeurs par défaut sont inchangées. Le tirage de bruit de la première pesée est toujours consommé, ce qui garde l'appariement.
- **Runners** : `tests/experiments-journal/measures1b.ts` et `tests/experiments-journal/1b/*.experiment.ts`. **Tableaux** : `tests/experiments-journal/1b/tables1b.experiment.ts`.
- **Tests ajoutés** (`tests/domain/journalCalibration.test.ts`, l. 144 à 190) :
  - ±1 200 avec l'option donne un `CalibrationFit` égal (`toEqual`) à celui obtenu sans l'option ;
  - ±3 000 : 1 201 points, les offsets inadmissibles valent 0 dans les deux posteriors, et `excludedOffsetCount` est exact ;
  - erreur avec l'historique, et avec une demi-largeur de 1 202 ou de 0.
- **[mesuré]** Aucun appel depuis le store, le worker ou l'UI : le test statique D8 (`tests/domain/foodJournal.test.ts`) reste vert dans `npm run check`.

### Écarts au prompt et raisons

1. **Texte de l'amendement** : j'ai copié le contenu du bloc ```` ```markdown ````, sans les lignes de clôture du bloc de code. Les copier aurait transformé l'amendement en bloc de code dans `THRESHOLDS.md`.
2. **Fonction exportée ajoutée** (`widenedOffsetGrid`), pour les tests. La grille est calculée par `k × pas` et non par accumulation. Pour ±1 200, les valeurs sont identiques à `offsetGrid()` : c'est testé, et les contrôles d'appariement de la section 2 le confirment au bit près.
3. **Validation de la demi-largeur** (multiple positif du pas), non demandée. Elle garantit que 0 reste sur la grille.
4. **L'erreur « option + historique » est levée dans `fitCalibration`.** Elle couvre donc aussi `includeWarmStartHistory: true` du prototype.
5. **Harness de la section 5** : il expose aussi `priorSigmaKcal` (σ = +∞ pour le prior plat), comme le prompt l'indique.
6. **Critère N2 sur grille élargie.** Avec ±2 000 et ±3 000, les premiers points de la grille peuvent être inadmissibles (NASEM + offset ≤ 1 kcal/j) et ont une masse nulle par construction. Je rapporte donc deux lectures, avec un verdict pour chacune :
   - la lecture littérale, sur les bornes de la grille ;
   - les 10 premiers et 10 derniers points **admissibles** (bornes du support).
   **[mesuré]** Les deux lectures donnent les mêmes verdicts.
7. **`.gitignore` modifié hors de mes commits** (ignore `tests/`). Les nouveaux fichiers sous `tests/` ont été ajoutés avec `git add -f`. Ce rapport, sous `reports/`, n'est pas commité, comme le rapport 34.

### Preuve de non-régression, options absentes (3.3)

- **Capture** : mêmes scripts que la phase 1 (`tests/experiments-journal/capture/`).
  - **Avant** : `ba8e60c`, dont `src/` est identique à `5b17b73`.
  - **Après** : l'option implémentée, sans l'utiliser.
- **[mesuré]** `tests/experiments-journal/results/nonregression1b.txt` : **2 523 011 valeurs numériques comparées, 0 différence**, dont T-03 1 003 779, T-04 1 497 006, golden 3 483, R/S 9 847 et journey 8 896. Les 554 identifiants aléatoires sont masqués.
- **[mesuré]** Les fichiers T-03, T-04 et golden sont identiques à l'octet avant et après, et identiques à la capture de la phase 1 (mêmes préfixes sha256 `3447793a…`, `c65c47cf…`, `e20b17f4…`).

## 2. Question 1 : la grille

### 2.1 N2 rejoué (prototype, prior NASEM, utilisateurs de n2x2)

- **Rejeu** : mêmes utilisateurs, mêmes graines et mêmes mondes que `results/n2x2`, soit 1 000 utilisateurs. Il couvre :
  - 4 populations principales avec loi normale et t(3) ;
  - 3 sensibilités ;
  - le stress (20 utilisateurs × 14 cellules) ;
  - les horizons 28 et 84 j.
- **[mesuré] Contrôle d'appariement** (`results/n2g/` contre `results/n2x2/`, `verdicts1b.json` → `n2gPairedCheck`). La grille ±1 200 avec l'option est comparée à n2x2 sans l'option :
  - 22 000 lignes et 550 000 valeurs comparées au caractère près : **0 différence** ;
  - stress : 560 lignes, 0 différence.

**[mesuré]** Part signalée (> 5 % de masse dans les 10 derniers points d'une borne), avec l'IC de Wilson, n = 1 000 par cellule (`tables1b.md`, section N2) :

| Population | H | ±1 200 | ±2 000 | ±3 000 |
|---|---|---|---|---|
| P00 | 28 / 84 | 0,2 / 0,3 % GO / GO | 0,0 / 0,0 % GO / GO | 0,0 / 0,0 % GO / GO |
| P05 | 28 / 84 | 0,8 % GO / 1,7 % [1,1 ; 2,7] NO-GO | 0,0 / 0,0 % GO / GO | 0,0 / 0,0 % GO / GO |
| P10 | 28 / 84 | 1,1 % [0,6 ; 2,0] INCONCL. / 1,9 % NO-GO | 0,0 / 0,0 % GO / GO | 0,0 / 0,0 % GO / GO |
| P20 | 28 / 84 | 4,0 / 6,8 % NO-GO / NO-GO | 0,0 / 0,0 % GO / GO | 0,0 / 0,0 % GO / GO |
| P10 σ 20 pts [S] | 28 / 84 | 4,8 / 7,9 % NO-GO / NO-GO | 0,0 / 0,6 % [0,3 ; 1,3] GO / GO | 0,0 / 0,0 % GO / GO |
| P10 pente −5 [S] | 28 / 84 | 1,9 / 3,0 % NO-GO / NO-GO | 0,0 / 0,0 % GO / GO | 0,0 / 0,0 % GO / GO |
| P10 pente −10 [S] | 28 / 84 | 2,7 / 4,7 % NO-GO / NO-GO | 0,0 / 0,0 % GO / GO | 0,0 / 0,0 % GO / GO |
| t(3), P00 à P20 | 28 / 84 | 3,4 à 12,9 % NO-GO | 0,4 à 2,2 % ; P05 et P10 à 84 j INCONCL., P20 à 84 j NO-GO (2,2 % [1,5 ; 3,3]) | 0,0 à 0,2 % GO |

- **Verdicts N2** (loi normale, principales et sensibilité [S]) **[mesuré]** :
  - **±1 200 : NO-GO** ;
  - **±2 000 : GO** ;
  - **±3 000 : GO**.
- **Variante t(3)** : NO-GO à ±1 200 et à ±2 000, GO à ±3 000.
- **Sur les bornes du support admissible** : mêmes verdicts dans les trois grilles.

**Utilisateurs encore signalés** (bornes de la grille) **[mesuré]**, liste complète dans `tables1b.md` :

- **±1 200** : 967 lignes, 219 utilisateurs.
  - Vérité en unités de saisie de −4 327 à +4 139 (médiane −1 282) ; apport réel de 1 562 à 4 443 kcal/j ; u de −0,79 à +0,48.
  - Hommes 732 lignes, femmes 235 ; perte 278, maintien 260, prise 429.
  - Borne basse 836 lignes, borne haute 131.
- **±2 000** : 82 lignes, 31 utilisateurs.
  - Vérité de −3 824 à +4 139 (médiane −2 173) ; apport de 1 562 à 3 566 kcal/j ; u de −0,72 à +0,41.
  - Hommes 61, femmes 21 ; prise 37, perte 29, maintien 16.
  - Borne basse 67, borne haute 15.
- **±3 000** : 8 lignes, 2 utilisateurs, tous deux dans la variante t(3) :
  - utilisateur 55 : homme, IMC 38, maintien, offset vrai −3 270, apport 3 348 kcal/j, vérité de −3 386 à −4 327 selon u ;
  - utilisateur 175 : cas R, offset vrai +4 030, vérité de +3 905 à +4 139.
- **±3 000, bornes du support** : 25 lignes, 5 utilisateurs, tous en t(3). Aux 2 précédents s'ajoutent 3 utilisateurs dont l'offset vrai (−2 624, −2 335, −2 181) est à 16, 220 et 59 kcal/j de la borne basse du support (−2 640, −2 555, −2 240). **[déduit]** Leur maintien vrai (NASEM + offset) vaut donc environ 20, 220 et 60 kcal/j.
- **Offsets exclus par le domaine admissible** (toutes lignes N2) **[mesuré]** :
  - ±1 200 : aucun ;
  - ±2 000 : 11,7 % des lignes ont au moins une exclusion (max 88) ;
  - ±3 000 : 82,8 % des lignes (médiane 109, max 288). La borne basse effective du support va de −3 000 à −1 560 (médiane −2 457).
- **Stress** (sans seuil) **[mesuré]** : à ±2 000 et ±3 000, la part signalée vaut 0 % dans les 28 cellules (u de −40 % à +20 %, cible ou 3 500 kcal/j). À ±1 200, elle montait jusqu'à 70 %.
  - Erreur médiane signée, u = −40 %, 3 500 kcal/j : à 28 j, +515 (±1 200) puis +427 (±2 000 et ±3 000) ; à 84 j, +215 puis +115.

### 2.2 N4 rejoué (utilisateurs de n4x2, trois priors × trois grilles)

- **[mesuré] Contrôle d'appariement** : ±1 200 contre n4x2, 18 000 lignes et 450 000 valeurs, **0 différence**.
- Les détails par cellule (biais moyen et médian avec leur IC, erreur médiane, couvertures 80 et 95, signal A1.2 et largeur) sont dans `tables1b.md` pour les 108 cellules. Extraits **[mesuré]** :

| Pop. | H | Prior | ±1 200 : biais moyen / médian ; couv. 80 / 95 | ±2 000 | ±3 000 |
|---|---|---|---|---|---|
| P00 | 14 | plat | 71,6 / 61,7 ; 0,79 / 0,95 | 102,1 / 77,2 ; 0,78 / 0,94 | 110,7 [75,6 ; 145,9] / 77,6 ; 0,78 / 0,94 |
| P00 | 14 | NASEM | 14,6 / 23,9 ; 0,80 / 0,96 | 14,3 / 24,0 ; identiques | 14,3 / 24,0 ; identiques |
| P10 | 14 | plat | 101,8 / 84,8 ; 0,78 / 0,94 | 108,5 / 74,2 ; 0,78 / 0,93 | 113,8 / 74,2 ; 0,78 / 0,93 |
| P10 | 14 | NASEM | 147,1 / 151,9 ; 0,67 / 0,87 ↓ | 146,2 / 151,9 ; 0,67 / 0,87 ↓ | 146,2 / 151,9 ; 0,67 / 0,87 ↓ |
| P20 | 14 | plat | 137,6 / 128,0 ; 0,74 / 0,89 ↓ | 112,8 / 77,9 ; 0,78 / 0,93 ↓95 | 115,6 / 76,2 ; 0,78 / 0,93 ↓95 |
| P20 | 28 | plat | 42,2 / 24,4 ; 0,74 / 0,90 ↓ | 24,7 / 11,8 ; 0,78 / 0,94 | 24,5 / 11,8 ; 0,78 / 0,94 |
| P20 | 42 | plat | 16,8 / 6,2 ; 0,79 / 0,90 ↓95 | 3,4 / 3,2 ; 0,83 / 0,95 | 3,3 / 3,0 ; 0,83 / 0,95 |
| P20 | 42 | NASEM | 57,6 / 44,5 ; 0,74 / 0,89 ↓ | 48,8 / 42,5 ; 0,76 / 0,92 ↓ | 48,8 / 42,5 ; 0,76 / 0,93 ↓ |

↓ : cellule dont la borne haute de Wilson est sous le nominal (A1.2, signalement sans verdict).

- **Biais par tranche de vérité et pente, prior plat, 14 j** **[mesuré]** (`tables1b.md`) :
  - la pente erreur ~ vérité passe de −0,114 [−0,199 ; −0,027] (P00), −0,132 (P05), −0,146 (P10) et −0,217 [−0,281 ; −0,150] (P20) à ±1 200 ;
  - à −0,007, −0,022, −0,030 et −0,053 à ±2 000 ;
  - à +0,016, −0,008, −0,018 et −0,041 à ±3 000. Aux deux grilles élargies, tous les IC contiennent 0.
- **Biais par tranche, P00, ±3 000** : de +41 (< −900, n = 4) à +193 (300 à 600, n = 63) et −179 (> 600, n = 13). À ±1 200 : de +132 à −257.
- **Couvertures agrégées sur les trois horizons** (bootstrap par utilisateur, sans verdict), P20 prior plat : 0,761 [0,733 ; 0,788] / 0,897 à ±1 200 ; 0,798 [0,775 ; 0,822] / 0,940 à ±3 000.
- **N4 reste un diagnostic** : pas de verdict.

### 2.3 Temps de calcul

**[mesuré]** `results/timing1b/timing.csv.gz`. Node, un seul processus, rien d'autre en cours. 50 profils du générateur (graines 700 000 / 710 000 + i), u tiré de P10, 84 jours, pesée quotidienne (85 pesées), journal complet. Un appel de chauffe par grille, puis un appel chronométré par grille.

| Grille | Points (exclus, médiane) | Appel P50 | Appel P95 | `fitCalibration` seul P95 | P95 × 4 **[déduit]** |
|---|---|---|---|---|---|
| ±1 200 | 481 (0) | 92 ms | 98 ms | 97 ms | 390 ms |
| ±2 000 | 801 (0) | 150 ms | 159 ms | 159 ms | 635 ms |
| ±3 000 | 1 201 (122) | 216 ms | 245 ms | 244 ms | 980 ms |

- **Mesure dans l'app construite : non faite.** Le régime journal n'est pas atteignable depuis le worker de l'app (D8, test statique). Le mesurer là exigerait de modifier l'app. Le facteur × 4 est donc appliqué au temps Node, et le résultat est marqué **[déduit]**.
- **Face au seuil de R2** (P95 ≤ 1 s par calibration avec rejeu), sans verdict car le rejeu n'est pas implémenté : P95 × 4 **[déduit]** de 390, 635 et 980 ms pour ±1 200, ±2 000 et ±3 000. **[déduit]** Le coût suit le nombre de points admissibles simulés : ×1,6 pour ±2 000 et ×2,5 pour ±3 000 au P95.

## 3. Question 2 : biais aux horizons courts (chemin actuel)

- **Monde** : générateur N4 avec u = 0 ; apport réel = cible ; vérité = offset dans le repère de l'estimateur. **[mesuré]** L'écart de repère maximal est de 0,000 kcal/j.
- **Graines neuves** : profils 500 000, utilisateurs 510 000 + i ; 1 000 utilisateurs, dont 500 pesés chaque jour et 500 tous les 3 jours.
- **Erreur** = médiane du posterior (avec plancher) − vérité.

**[mesuré]** `results/sh/`, `tables1b.md` section Q2 :

| Bras | Biais moyen 14 j [IC] | Biais médian 14 j | 28 j | 42 j | Masse aux bornes > 5 % à 14 j |
|---|---|---|---|---|---|
| témoin (NASEM, ±1 200) | +1,2 [−14,0 ; 16,6] | +10,4 | −3,0 | −2,1 | 0,3 % |
| b1 (plat, ±1 200) | **+35,4 [14,2 ; 57,9]** | +35,2 [16,7 ; 63,7] | +1,3 [−10,8 ; 12,6] | −0,5 | 4,6 % |
| b1' (plat, ±3 000) | **+65,1 [38,5 ; 91,8]** | +40,0 [20,4 ; 68,7] | +2,3 | −0,2 | 0,1 % |
| b2 (plat, ±3 000, première pesée exacte) | +45,4 [29,3 ; 60,9] | +24,4 [8,8 ; 38,4] | −1,6 | −1,8 | 0,0 % |
| b3 (plat, ±3 000, bruit des pesées 0,05 kg) | **+25,8 [23,3 ; 28,3]** | +22,6 [20,3 ; 25,0] | +2,3 [1,2 ; 3,3] | +0,8 [0,1 ; 1,4] | 0,0 % |

**Différences appariées de biais moyen à 14 j** **[mesuré]** :

| Différence | Δ biais moyen à 14 j [IC] |
|---|---|
| b1 − témoin (effet du prior plat) | +34,3 [20,3 ; 48,7] |
| b1' − b1 (effet de la grille) | +29,6 [21,2 ; 38,6] |
| b2 − b1' (première pesée exacte) | −19,6 [−39,9 ; +0,3] |
| b3 − b1' (bruit réduit) | −39,3 [−64,4 ; −15,1] |

À 28 et 42 j, tous les IC des différences contiennent 0.

- **Par fréquence, 14 j** :
  - b1 : +31,7 (quotidienne) contre +39,2 (tous les 3 j) ;
  - b1' : +39,3 contre +90,8 ;
  - b2 : +25,2 contre +65,7 ;
  - b3 : +11,6 [9,1 ; 14,1] contre +40,0 [36,0 ; 44,0].
- **Par objectif, 14 j** : les IC se chevauchent dans chaque bras (b1 : perte +27,9, maintien +43,3, prise +37,1 ; b3 : +25,8, +27,2, +24,4).
- **Par tranche de vérité, 14 j** :
  - b3 : biais de +12 à +33 dans les 7 tranches ;
  - b1 : de +129 (< −900) à −66 (> 600) ;
  - témoin : de +446 à −369.
- **Pente erreur ~ vérité, 14 j** : témoin −0,551 [−0,590 ; −0,512] ; b1 −0,138 [−0,201 ; −0,077] ; b1' −0,007 [−0,094 ; 0,086] ; b2 −0,040 ; b3 −0,008 [−0,017 ; 0,001].
- **Moyenne du posterior contre médiane, 14 j** : le biais de la moyenne dépasse celui de la médiane dans tous les bras à prior plat (b1' +84,3 contre +65,1 ; b3 +40,4 contre +25,8).
- **Réponse mesurée à la question** :
  - le biais positif à 14 j sous prior plat **existe dans l'estimateur de production** (b1 : +35,4 [14,2 ; 57,9]). Il est absent sous prior NASEM (témoin : +1,2) ;
  - élargir la grille **l'augmente** (+29,6) ;
  - rendre la première pesée exacte le réduit de −19,6 [−39,9 ; +0,3] ;
  - réduire le bruit de toutes les pesées à 0,05 kg le réduit de −39,3 ;
  - **il reste +25,8 [23,3 ; 28,3] avec des pesées quasi exactes**, uniforme sur les tranches de vérité et plus fort avec une pesée tous les 3 jours. L'origine de ce résidu n'est pas identifiée par ces bras (voir section 8).
- Pas de verdict, aucune correction.

## 4. Question 3 : surconfiance du prototype

- **Monde** : générateur N3, offset tiré du prior, u = 0, 84 jours.
- **Graines neuves** : profils 600 000, utilisateurs 610 000 + i ; 1 000 utilisateurs (500 pesés chaque jour, 500 tous les 3 jours), horizons 14, 28, 42 et 84 j.
- **Deux mondes par utilisateur** : saisie exacte et saisie bruitée à 8 %. Ils ont les mêmes pesées et le même offset, car les flux aléatoires sont séparés.
- **Critère** : N3 amendé par A1.2, sur les 8 cellules regroupées, avec un bootstrap par utilisateur (tous ses horizons).

**[mesuré]** `results/n3b/`, `tables1b.md` section Q3 :

| Bras | Couv. 80 sans plancher [IC] | Couv. 95 sans plancher [IC] | Couv. 80 avec plancher [IC] | Couv. 95 avec plancher [IC] | Verdict N3 (A1.2) |
|---|---|---|---|---|---|
| chemin actuel | 0,796 [0,780 ; 0,812] | 0,947 [0,938 ; 0,956] | 0,856 [0,842 ; 0,869] | 0,965 [0,956 ; 0,972] | **GO** (sans plancher GO, avec plancher GO) |
| p1 (saisie exacte, `harness_scaled`) | 0,796 [0,780 ; 0,811] | 0,947 [0,938 ; 0,957] | 0,856 [0,841 ; 0,869] | 0,965 [0,956 ; 0,972] | **GO** (GO, GO) |
| p2 (saisie exacte, base : D5 seul) | 0,793 [0,777 ; 0,809] | 0,947 [0,937 ; 0,956] | 0,851 | 0,966 | diagnostic |
| p3 (saisie bruitée, `harness_scaled`) | 0,765 [0,749 ; 0,781] | 0,928 [0,917 ; 0,938] | 0,836 | 0,958 | diagnostic |
| p4 (saisie bruitée, base : phase 1) | 0,762 [0,746 ; 0,778] | 0,925 [0,914 ; 0,936] | 0,836 | 0,957 | diagnostic |

**Attribution** (différences appariées de couverture regroupée, sans plancher) **[mesuré]** :

| Différence | Δ couv. 80 [IC] | Δ couv. 95 [IC] |
|---|---|---|
| p2 − p1 (D5 seul) | −0,003 [−0,007 ; +0,002] | −0,000 [−0,003 ; +0,002] |
| p3 − p1 (bruit de saisie seul) | −0,031 [−0,041 ; −0,020] | −0,019 [−0,025 ; −0,012] |
| p4 − p1 (les deux) | −0,033 [−0,045 ; −0,022] | −0,021 [−0,028 ; −0,015] |

- **[déduit]** Sur la couverture 80, la part du bruit de saisie vaut 0,031 / 0,033 de l'écart p4 − p1, et la part de D5 0,003 / 0,033, dont l'IC contient 0.
- **Cellules signalées** (borne haute de Wilson sous le nominal, sans verdict) :
  - chemin actuel, p1 et p2 : aucune ;
  - p3 : 8 signalements sur 5 cellules (28 j quotidien, 42 j quotidien et tous les 3 j, 84 j dans les deux fréquences) ;
  - p4 : 9 signalements sur 5 cellules.
- **p1 contre chemin actuel** **[mesuré]** : sur 32 000 quantiles comparés, aucun n'est égal au bit près, et l'écart maximal vaut 0,006 kcal/j. **[déduit]** Avec saisi = réel = cible et les glucides du plan, p1 reconstruit la même entrée que le chemin actuel, à l'arrondi de `journalDay` à 0,01 kcal près (poids d'adhérence « plan respecté » = 1, **[lu]** `src/science/constants.ts:301`).
- **Écarts normalisés** (médiane − vérité) / (demi-largeur 80 / 1,2816) **[mesuré]**, variance sans plancher, tous objectifs et horizons :
  - chemin actuel 1,44 [1,05 ; 2,02] ; p1 1,44 ; p2 1,43 ; p3 1,61 [1,20 ; 2,24] ; p4 1,61 ;
  - avec plancher : de 0,95 à 1,04.
  - Par objectif et horizon, la variance sans plancher va de 1,09 (perte, 14 j) à 2,77 (maintien, 84 j, p3 et p4) ; les IC du maintien sont très larges (par exemple [1,13 ; 5,76]).
  - Tableau complet dans `tables1b.md`.

## 5. Relecture après coup de la phase 1 (A1.2 appliqué à `results/n3x2`)

**Relecture après coup** : les règles de l'amendement sont postérieures aux résultats de la phase 1, et aucun nouvel ajustement n'a été lancé.

**[mesuré]** `tables1b.md` section « Relecture après coup » :

| Chemin | Couv. 80 sans plancher [IC] | Couv. 95 sans plancher [IC] | Verdict sans plancher | Couv. 80 avec plancher [IC] | Couv. 95 avec plancher [IC] | Verdict avec plancher | N3 (A1.2) |
|---|---|---|---|---|---|---|---|
| chemin actuel | 0,793 [0,778 ; 0,808] | 0,944 [0,934 ; 0,953] | GO | 0,857 [0,843 ; 0,870] | 0,965 [0,958 ; 0,972] | GO | **GO** (après coup) |
| prototype | 0,755 [0,739 ; 0,770] | 0,922 [0,912 ; 0,932] | NO-GO | 0,828 [0,813 ; 0,842] | 0,957 [0,950 ; 0,965] | GO | **NO-GO** (après coup) |

- **Cellules signalées** (sans verdict) :
  - chemin actuel : une seule, 42 j avec pesée quotidienne, couverture 95 = 0,930 [0,904 ; 0,949] ;
  - prototype : 10 signalements sur 6 cellules.

## 6. Récapitulatif pour P10 et P20 (N4 rejoué, unités de saisie)

**[mesuré]** `tables1b.md`, « Récapitulatif ». Chaque case donne le biais moyen [IC], puis la couverture 80 / 95.

| Pop. | Prior | Grille | 14 j | 28 j | 42 j |
|---|---|---|---|---|---|
| P10 | NASEM | ±1 200 | 147 [122 ; 173] ; 0,67 / 0,87 | 63 [47 ; 79] ; 0,72 / 0,90 | 26 [15 ; 37] ; 0,81 / 0,94 |
| P10 | NASEM | ±2 000 | 146 [122 ; 171] ; 0,67 / 0,87 | 61 [45 ; 78] ; 0,73 / 0,91 | 24 [13 ; 34] ; 0,82 / 0,95 |
| P10 | NASEM | ±3 000 | 146 [122 ; 172] ; 0,67 / 0,87 | 61 [46 ; 77] ; 0,73 / 0,91 | 24 [13 ; 34] ; 0,82 / 0,95 |
| P10 | plat | ±1 200 | 102 [71 ; 131] ; 0,78 / 0,94 | 27 [10 ; 44] ; 0,76 / 0,94 | 7 [−4 ; 18] ; 0,81 / 0,94 |
| P10 | plat | ±2 000 | 108 [74 ; 144] ; 0,78 / 0,93 | 23 [5 ; 41] ; 0,77 / 0,95 | 3 [−8 ; 15] ; 0,83 / 0,95 |
| P10 | plat | ±3 000 | 114 [77 ; 150] ; 0,78 / 0,93 | 23 [6 ; 41] ; 0,77 / 0,95 | 3 [−8 ; 14] ; 0,83 / 0,95 |
| P10 | élargi | ±1 200 | 127 [103 ; 152] ; 0,74 / 0,91 | 49 [34 ; 65] ; 0,77 / 0,92 | 18 [8 ; 29] ; 0,83 / 0,93 |
| P10 | élargi | ±2 000 | 125 [103 ; 150] ; 0,75 / 0,92 | 47 [31 ; 62] ; 0,78 / 0,93 | 16 [5 ; 26] ; 0,84 / 0,95 |
| P10 | élargi | ±3 000 | 125 [101 ; 148] ; 0,75 / 0,92 | 47 [32 ; 62] ; 0,78 / 0,93 | 16 [5 ; 25] ; 0,84 / 0,95 |
| P20 | NASEM | ±1 200 | 287 [261 ; 313] ; 0,52 / 0,73 | 126 [109 ; 142] ; 0,65 / 0,82 | 58 [45 ; 69] ; 0,74 / 0,89 |
| P20 | NASEM | ±2 000 | 285 [259 ; 310] ; 0,53 / 0,74 | 119 [102 ; 135] ; 0,66 / 0,85 | 49 [38 ; 60] ; 0,76 / 0,92 |
| P20 | NASEM | ±3 000 | 285 [258 ; 310] ; 0,53 / 0,74 | 119 [102 ; 135] ; 0,66 / 0,85 | 49 [38 ; 60] ; 0,76 / 0,93 |
| P20 | plat | ±1 200 | 138 [107 ; 170] ; 0,74 / 0,89 | 42 [25 ; 60] ; 0,74 / 0,90 | 17 [4 ; 30] ; 0,79 / 0,90 |
| P20 | plat | ±2 000 | 113 [81 ; 144] ; 0,78 / 0,93 | 25 [8 ; 42] ; 0,78 / 0,94 | 3 [−7 ; 15] ; 0,83 / 0,95 |
| P20 | plat | ±3 000 | 116 [82 ; 150] ; 0,78 / 0,93 | 24 [8 ; 43] ; 0,78 / 0,94 | 3 [−8 ; 14] ; 0,83 / 0,95 |
| P20 | élargi | ±1 200 | 236 [211 ; 261] ; 0,60 / 0,82 | 94 [76 ; 110] ; 0,70 / 0,87 | 42 [30 ; 54] ; 0,79 / 0,91 |
| P20 | élargi | ±2 000 | 229 [204 ; 253] ; 0,63 / 0,86 | 84 [68 ; 100] ; 0,73 / 0,90 | 31 [21 ; 41] ; 0,82 / 0,94 |
| P20 | élargi | ±3 000 | 228 [205 ; 255] ; 0,63 / 0,86 | 84 [68 ; 100] ; 0,73 / 0,90 | 31 [20 ; 41] ; 0,82 / 0,95 |

n = 500 utilisateurs par case, les mêmes dans toutes les cases (utilisateurs de n4x2), pesée alternée.

## 7. Temps de calcul par étape

Temps réel, machine à 16 threads. Aucune autre charge lourde pendant les mesures ; les étapes se sont suivies sans chevauchement.

| Étape | Durée réelle |
|---|---|
| `npm run check` de départ | ≈ 35 s |
| Amendement et commit | < 1 min |
| Capture « avant » / « après » et comparaison | 48 s / 44 s |
| Implémentation, tests, pilote de coût (≈ 5 s) | ≈ 3 min |
| N2g (16 shards, 3 grilles, stress compris) | 13 min 05 s |
| N4g | 6 min 22 s |
| Section 5 (sh) | 1 min 59 s |
| Section 6 (n3b) | 2 min 05 s |
| Temps de calcul (seul) | 1 min 11 s |
| Tableaux (partiels puis complets) | 6 s + 1 min 33 s |
| `npm run check` final | 36 s |
| **Total réel** (première commande ≈ 10 h 21, check final terminé à 10 h 56) | **≈ 36 min**, sous le plafond de 4 h |

## 8. Non fait, incertitudes, incohérences

**Non fait**

- Temps dans l'app construite (worker) avec ralentissement × 4 : non mesuré, car le régime journal n'est pas atteignable depuis le worker sans modifier l'app (D8). Les valeurs × 4 sont **[déduit]**.
- Aucune correction de l'estimateur, aucun changement de prior, de σ, de poids ni de seuil. Aucune recommandation.
- Rapport non commité (`reports/` est ignoré, comme pour le rapport 34).

**Incertitudes**

- **Critère N2 sur grille élargie.** La lecture littérale (bornes de la grille) peut être satisfaite trivialement quand les premiers points sont inadmissibles. La lecture sur les bornes du support est rapportée à côté, et les verdicts coïncident. À ±3 000, les 3 utilisateurs signalés seulement par la lecture « support » ont un maintien vrai d'environ 20 à 220 kcal/j **[déduit]** (monde t(3) admissible mais extrême).
- **N2 rejoué sur les utilisateurs de n2x2**, comme le demande le prompt (comparaison appariée). Ce n'est pas une passe doublée au sens de A1.3 : les graines ne sont pas neuves. Ce choix s'applique aussi à N4.
- **Section 5, résidu de b3** (+25,8 à 14 j avec pesées à 0,05 kg). Les bras testés ne l'expliquent pas. Deux éléments mesurés à ce sujet : le biais de la moyenne du posterior dépasse celui de la médiane (+40,4 contre +25,8), et le biais est plus fort avec la pesée tous les 3 jours (+40,0 contre +11,6). **[déduit, non testé]** Ces éléments sont compatibles avec un posterior asymétrique sous prior plat. L'estimateur garde son échelle de bruit de 0,6 kg, donc la vraisemblance reste large même avec des pesées exactes. Aucun bras n'a isolé cette hypothèse.
- **Q2, comparaison avec la phase 1.** Le +71,6 de la phase 1 (prototype, P00, prior plat, 14 j) et le +35,4 de b1 (chemin actuel) portent sur des utilisateurs différents. Le prototype ajoute aussi le bruit de saisie, D5 et u ~ N(0 ; 3 %). La différence n'est pas appariée.
- **A1.2 est binaire** (contient ou ne contient pas, borne haute au-dessus ou non) : aucun INCONCLUSIF n'est possible sous ce critère.
- **Variance des écarts normalisés.** Elle dépasse 1 sans plancher même quand la couverture regroupée passe (chemin actuel 1,44). Les IC du maintien sont très larges, ce qui indique quelques grands écarts. Rapporté, sans verdict.
- **Temps de calcul** : un appel chronométré par profil et par grille, après chauffe. Le P95 sur 50 valeurs repose sur les 2 à 3 appels les plus lents.

**Incohérences et constats**

- **[mesuré]** p1 et le chemin actuel diffèrent au plus de 0,006 kcal/j (arrondi des totaux du journal à 0,01 kcal). Leurs verdicts N3 sont identiques.
- **[mesuré]** Sous prior plat à 14 j, élargir la grille supprime la masse aux bornes et annule la pente erreur ~ vérité, mais augmente le biais moyen, en N4 (P00 : 71,6 → 110,7) comme en section 5 (b1 → b1' : +29,6). Sous prior NASEM, l'effet de la grille sur le biais à 14 j est inférieur à 3 kcal/j pour P00 à P20. Les IC figurent dans le tableau complet.
- **[lu]** `.gitignore` est modifié dans la copie de travail hors de mes commits (il ignore `tests/`). Tous les nouveaux fichiers de la phase ont été ajoutés avec `-f`. Ce changement non commité est à arbitrer par le product owner.
- **[mesuré]** Le worktree `../Weighty-bench` de la phase 1 n'a pas été touché.
