# 34 : batterie « journal dans la calibration », phase 1

Mesures seulement : aucune fonctionnalité visible, aucune sortie de production modifiée. Branche `bench/journal-battery` (non fusionnée, rien sur `main`). Seuils gelés : `tests/experiments-journal/THRESHOLDS.md`. Tableaux complets : `tests/experiments-journal/results/tables.md` et `verdicts.json`.

Conventions : **[lu]** chemin:lignes ; **[mesuré]** fichier de résultats ; **[déduit]** raisonnement.

## Synthèse des verdicts

| Mesure | Verdict | Détail |
|---|---|---|
| N1 équivalence du chemin (drapeau désactivé) | **GO** | 0 différence au bit près sur 2 523 011 valeurs |
| N1 prototype (glucides du harness) contre harness 26 | **GO** | Δ = 0 exactement sur la médiane, q10 et q90, 52 fixtures |
| N1 effet de D5 | **NO-GO** | max \|Δ médiane\| = 42,9 kcal/j ; 3 fixtures sur 52 au-delà de 25 (toutes en perte) |
| N2 masse aux bornes [S] | **NO-GO** | P20 et les trois variantes de sensibilité NO-GO dès la passe 1 ; à 2n, P05 et P10 à 84 j NO-GO, P10 à 28 j INCONCLUSIF, P00 GO |
| N3 monde bien spécifié, chemin actuel | **NO-GO** (après doublement) | passe 1 INCONCLUSIF, passe 2 NO-GO sur une cellule |
| N3 monde bien spécifié, prototype | **NO-GO** | couverture sans plancher sous 0,80 / 0,95 dans 5 cellules sur 8 (passe 1) et 6 sur 8 (passe 2) |
| N4 attribution au prior (diagnostic) | non attribué à 14 j dans les 4 populations ; attribué à 42 j pour P00 et P05 ; autres cellules INCONCLUSIF ou non attribué | voir 4.4 |

---

## 0. État de départ et commit de seuils

- **[mesuré]** Au départ, sur `ac35cdf` : `git status` propre ; `git log --oneline -3` = `ac35cdf fix`, `54f6dd9 multiple fix`, `b83e5e9 feat(journal): …`.
- **[mesuré]** `npm run check` **rouge** au départ :
  - typecheck : 4 erreurs TS2339, `src/screens/Journal.tsx:794`, `:820`, `:823` (`PORTION_TEXT.createOpen/createClose/createSave/createCancel` absents de `src/app/copy.ts`) ;
  - lint vert ;
  - tests : 507 / 508, échec de `tests/policy/static.test.ts:213` (4 emplacements `field-error--slot` dans `Journal.tsx` au lieu de 2).
- Arrêt et rapport, puis **option 2 validée par le product owner** : correctif minimal isolé `fcfdd47`, avant le fichier de seuils. Il ajoute les 4 textes à `PORTION_TEXT` (« Créer une portion », « Fermer », « Enregistrer la portion », « Annuler », repris de l'ancienne UI et du commentaire de `Journal.tsx`, sauf « Fermer » qui est un choix de ma part). Il passe le compte attendu du test statique de 2 à 4 : les deux emplacements ajoutés par `ac35cdf` pour la création de portion et le poids d'une unité réservent bien leur place. `npm run check` vert ensuite : 508 / 508.
- **Commit de seuils : `5747032`**, fichier seul. Contenu identique à l'annexe A (comparaison `diff` sans différence).
- **[mesuré]** À la fin : `npm run check` vert, 517 / 517 (43 fichiers, 43 s) tests.

Commits de la branche, dans l'ordre : `fcfdd47` correctif (option 2) ; `5747032` seuils ; `7a56144` harness de capture (3.8) ; `7715d50` export des benchmarks 26/27 (4) ; `3bd91c0` prototype (3) ; `2d64c8d` générateur et scripts N1 à N4 (5) ; `ca5f810` exports bruts et reconstruction 26/27 (4) ; `5b17b73` résultats bruts, tableaux et verdicts N1 à N4 (5).

## 1. Prototype

### Fichiers et signatures

**[lu]** `src/science/calibration.ts`. C'est la seule modification dans `src/science/` :

- `CalibrationInput.intakeObservations?: IntakeObservationsInput | undefined` (l. 97) ;
- `type IntakeObservation = { date: string; loggedKcal: number; consumptionMoments: number; usable: boolean }` (l. 101) ;
- `type IntakeObservationsInput = { days: readonly IntakeObservation[]; nonUsableDayWeight: 0.5 | 0; carbSource?: 'baseline' | 'harness_scaled' }` (l. 111) ;
- `type IntakeTrace = { days: IntakeTraceDay[]; counts: { logged; median14; medianWindow; target } }`, où `IntakeTraceDay = { date, source: 'logged' | 'median_fallback' | 'target_fallback', medianScope?: '14d' | 'window', intakeKcal, weight }` ;
- `CalibrationFit.intakeTrace?: IntakeTrace` (l. 427), présent seulement si l'entrée porte des observations (l. 566) ;
- `reconstructDays` : premier embranchement `if (input.intakeObservations) return reconstructJournalDays(…)` (l. 173). Le chemin existant est intact en dessous ;
- `reconstructJournalDays` (l. 212) et `intakeTraceOf` (l. 272) sont privées.

**[lu]** `src/domain/intakeObservations.ts` (nouveau) :

- `type UsabilityRule = { kind: 'R0' } | { kind: 'R1'; x: number } | { kind: 'R2'; x: number }` ;
- `intakeObservationsFrom(store: WheightyStore, from: string, to: string, rule: UsabilityRule): IntakeObservation[]`. Seule fonction exportée, seul module de la chaîne science qui importe `./journal`.

**[lu]** `src/domain/journalCalibration.ts` (nouveau) :

- `type JournalRegimeOptions = { journalRegimeStart; usabilityRule; nonUsableDayWeight: 0.5 | 0; includeWarmStartHistory?; journalPrior?: 'nasem' | 'flat' | 'widened'; carbSource?; structuralSdKcal? }` ;
- `journalCalibrationInputFromStore(store, today, options): JournalCalibrationInput | null` ;
- `evaluateJournalGate(weights, observations): GateStatus` ;
- `computeJournalCalibration(store, today, nowIso, options): JournalCalibrationState | null`.

**Tests** : `tests/domain/journalCalibration.test.ts` (8 nouveaux) et `tests/domain/foodJournal.test.ts`. Dans ce dernier, le test d'isolation est remplacé par une version plus stricte et un test d'atteignabilité est ajouté.

### Ce qui est implémenté

- **3.1** Pour chaque jour de `[from, to]`, `intakeObservationsFrom` renvoie :
  - le total du jour, calculé par `journalDay` (somme des entrées dont `date` est le jour de consommation, J-06, arrondie à 0,01 kcal comme à l'affichage) ;
  - le nombre de `consumedTime` distincts ;
  - l'exploitabilité selon la règle :
    - R0 : au moins une entrée ;
    - R1 : R0, et total ≥ x × médiane des totaux des 14 jours précédents qui ont au moins une entrée ;
    - R2 : R1 et au moins 2 moments.
- **3.2** Dans `reconstructJournalDays` :
  - **jour exploitable** : apport = total saisi ; poids = 1 × 0,7 si les pas manquent ;
  - **jour non exploitable** : médiane des totaux exploitables des 14 jours précédents ; à défaut, médiane de la fenêtre ; à défaut, cible du jour (log du jour ou log antérieur, comme aujourd'hui). Poids = `nonUsableDayWeight` ;
  - l'adhérence n'est pas lue : le champ porte `'unknown'` ;
  - glucides = part de base × apport Hall (repli existant à 0,5 si la part vaut 0). Les macros saisies ne sont jamais lues ;
  - `harness_scaled` : `max(0, carbsG_plan × (apport / cible du jour)) × 4`, même ordre d'opérations que `withLoggedIntake` ;
  - trace et compteurs de replis dans `CalibrationFit.intakeTrace`.
- **3.3** Régime journal :
  - fenêtre depuis la première pesée **valide** (`validWeights` : dédoublonnée, bornée) datée du `journalRegimeStart` ou après ;
  - NASEM, REE, σ et masse grasse de départ au poids de cette pesée ;
  - `historicalLogLikelihood` ajoutée seulement si `includeWarmStartHistory === true` (défaut `false`) ;
  - observations demandées sur `[début − 14 j, dernière pesée]`.
- **3.4** `evaluateJournalGate` suit la structure de `evaluateGate` avec les constantes existantes (`GATE_MIN_*`, `GATE_MAJOR_DOMINATION_FRACTION`). Couverture = jours exploitables / jours de la première à la dernière pesée, bornes incluses comme la couverture d'adhérence actuelle. Une pesée est propre si au plus 50 % des jours de sa fenêtre sont non exploitables.
- **3.5** Les deux priors N4 sont implémentés par `priorSigmaKcal` seul, sans toucher `src/science/` :
  - `flat` : `priorSigmaKcal = +∞`, donc `−0,5 (o/σ)²` vaut exactement `−0` sur toute la grille (testé) ;
  - `widened` : `√(σ² + (0,10 × NASEM)²)`.
- **3.6** Rien dans `src/` n'importe `journalCalibration` ni `intakeObservations`, sauf `journalCalibration → intakeObservations`. Aucun des deux n'est dans la fermeture d'imports de `src/main.tsx` (test).
- **3.7** Le nouveau test (`foodJournal.test.ts`) vérifie :
  - dans `src/science/**`, le worker, `calibrationClient`, `engine`, `explain`, `journalCalibration` et `intakeObservations`, seul `intakeObservations.ts` importe `src/domain/journal.ts` ou contient `foodJournal|intakeLogged`. La résolution couvre les alias `@/`, les chemins relatifs, les imports dynamiques et les réexports ;
  - la passerelle n'exporte que `intakeObservationsFrom` ;
  - les fermetures transitives du worker, de `calibrationClient` et d'`engine` n'atteignent pas le journal ;
  - dans l'arbre de `journalCalibration`, seule la passerelle importe le journal ;
  - la liste exhaustive des modules de `src/` qui importent le journal est figée : `adapters/openFoodFacts.ts` (type), `domain/foodLibrary.ts`, `domain/foodSearch.ts` (type), `domain/intakeObservations.ts`, `domain/views.ts` (affichage, `localTimeOf`), `screens/Journal.tsx`, `screens/Today.tsx` ;
  - les anciennes assertions sont conservées.

### Écarts au prompt et raisons

1. **Commit correctif avant les seuils** (`fcfdd47`, UI) : option 2 validée. Rien d'autre dans l'UI n'est touché.
2. **Ordre des commits** : harness de capture et export 26/27 commités avant le prototype. Le rejeu du 27 (≈ 90 min) devait démarrer tôt, sur un code sans prototype, dans un worktree séparé (`../Weighty-bench`). Un commit par étape est respecté.
3. **Trace dans la valeur de retour** : 3.2 l'exige, donc `CalibrationFit.intakeTrace` (optionnel) s'ajoute au champ d'entrée. La lettre de « seule modification autorisée » est dépassée d'un champ de sortie, absent quand le drapeau est désactivé.
4. **Constante locale** `JOURNAL_IMPUTATION_LOOKBACK_DAYS = 14` (privée, `calibration.ts`) : c'est la fenêtre de 14 jours du prompt. Aucune constante n'est ajoutée pour la porte.
5. **Poids d'un jour non exploitable** : `nonUsableDayWeight` seul, sans facteur 0,7 pour pas manquants (lecture littérale de 3.2).
6. **R1** : la médiane de référence porte sur les jours des 14 précédents qui ont au moins une entrée. Sans aucun tel jour, R1 se réduit à R0. Le prompt ne précise pas le traitement des jours vides.
7. **`intakeObservationsFrom` prend le store**, et non le journal, pour que toute lecture de `foodJournal` reste dans la passerelle.
8. **Régime dans un module séparé** : `engine.ts` et `calibrationInputFromStore` ne sont pas modifiés. Le « drapeau » est l'appel explicite de `journalCalibration` depuis les tests.
9. **Porte** : `majorDeviationFraction` porte la part de jours non exploitables (lue par la confiance « élevée ») et `trackedDays` les jours exploitables.
10. **Config** `vitest.journal.config.ts` en `pool: 'forks'` : la reconstruction des tableaux change de répertoire courant.
11. **N1 avec `includeWarmStartHistory: true`**. Le harness passe par `calibrationInputFromStore`, qui inclut l'historique de R et S ; l'équivalence ne compare donc que le chemin d'apport. L'écart avec le défaut (`false`) est rapporté à part pour R et S.

## 2. Preuve de non-régression (drapeau désactivé)

- **Capture** : `tests/experiments-journal/capture/*.experiment.ts`, sérialisation au bit près (doubles à aller-retour exact, `NaN`, ±∞ et −0 distingués). Elle couvre :
  - T-03 : 504 calibrations, 126 utilisateurs × 28/42/84/120 j, `CalibrationFit` complet ;
  - T-04 : 6 scénarios × 42 utilisateurs sur six familles de graines (50k, 60k à 42 j ; 70k, 80k à 84 j ; 30k, 40k à 28 j, celles du 26) ;
  - les 12 golden (évaluation, plan et projection non arrondis) ;
  - R et S : view-model complet de l'aperçu, plus un store calibré avec historique (état de calibration, recalibration appliquée, explication, état suivant) ;
  - `convergenceJourney` : scénarios A, B et C, résultat complet, store compris.
- **Avant** : commit `7a56144`, `src/` identique à `fcfdd47`. **Après** : prototype `3bd91c0`. Comparaison par `tests/experiments-journal/capture/compare.mjs`.
- **[mesuré]** `tests/experiments-journal/results/nonregression.txt` : **2 523 011 valeurs numériques comparées, 0 différence** (T-03 1 003 779 ; T-04 1 497 006 ; golden 3 483 ; R/S 9 847 ; journey 8 896). T-03, T-04 et golden sont même identiques à l'octet près. Pour R/S et journey, 554 identifiants de store (`newId` → `Math.random`, non numériques) sont masqués avant comparaison.
- **[mesuré]** Les snapshots existants (golden, R/S, journey) passent dans `npm run check`.

## 3. Export des benchmarks 26 et 27 et contrôle des tableaux

- **Code et graines inchangés.** Seuls ajouts : `tests/helpers/journalExport.ts`, champs `edge`/`user`/`export`/`uProbabilities`, jamais lus par les métriques ; écriture CSV gzip.
- **Emplacement** : `tests/experiments-journal/results/bench26/*.csv.gz` (16 cellules, 67 200 lignes) et `bench27/*.csv.gz` (92 cellules, 143 640 lignes).
- **Colonnes** :
  - graine, profil, offset vrai, fréquence, scénario, horizon, u, taux de saisie ;
  - q2,5 / q10 / q50 / q90 / q97,5 ;
  - trois vérités : `truth_metabolic`, `truth_apparent` (définition du bras A, D-31), `truth_logged_units` (vérité propre au bras) ;
  - porte ;
  - masse dans les 5 et 10 derniers points de chaque borne de l'offset, et de k pour le 27 ;
  - largeurs 80 et 95.
- **Choix d'export** :
  - au 26, u et le taux de saisie sont des paramètres de cellule et ne sont pas tirés par utilisateur (bras A : vide / 0 ; B : 0 / 1) ;
  - les masses aux bornes sont prises sur le posterior final, plancher inclus ;
  - au 27, les masses historiques du rapport 27 (`edgeMass`, calculées avant plancher, 5 bins, bin et 3 bins de k) sont aussi exportées (`info_*`) pour la reconstruction.
- **Rejeu** :
  - **[mesuré]** 26 : les 16 JSON rejoués sont identiques aux JSON publiés, aux fins de ligne CRLF/LF près ;
  - **[mesuré]** 27 : les 92 JSON de cellule rejoués sont identiques aux publiés, hors `elapsedMs` (temps) ; `flat-offset-prior.json` est identique ; `tables.md` ne diffère que par la ligne de coût (21,34 h contre 20,23 h cumulées, 3 976 contre 3 770 ms par utilisateur), en raison de la contention CPU.
- **Contrôle** (`tests/experiments-journal/reconstruct-bench26-27.experiment.ts` → `results/reconstruction.json`). Les résumés sont reconstruits **depuis les seuls CSV**, avec le code de métriques inchangé (`compareArms`, `armMetrics`, `summarizeCell`), puis les tableaux sont rendus par les générateurs d'origine :
  - **[mesuré]** 26 : 0 différence sur les résumés (comparaison valeur par valeur, `Object.is`) ; `tables.md` identique (468 lignes, 0 ligne différente) ;
  - **[mesuré]** 27 : 0 différence sur les 92 résumés de cellule (143 640 lignes) ; `tables.md` identique (980 lignes, 0 ligne différente). `elapsedMs` est recopié du publié : c'est une mesure de temps, pas un résultat.

## 4. Mesures N1 à N4

### Générateur (fixé avant mesure, `tests/helpers/journalBattery.ts`, `tests/experiments-journal/measures.ts`)

- L'utilisateur simulé passe par les vrais cas d'usage du domaine : `completeOnboarding`, `ensureDailyLogs`, `setAdherence`, `setActualSteps`, `addWeight` et `addFoodEntry` (3 entrées par jour à 08:00, 12:30 et 19:30). Les deux chemins lisent le même store.
- **Profils** : hypercube latin (sexe, IMC {21, 26, 31, 38}, activité, objectif, âge U(19, 65), taille U(150, 175) pour F ou U(165, 195) pour H). Choix complémentaires :
  - sédentaire = 5 000 pas, musculation = 7 000 pas + 4 × 55 min modérée ;
  - cible de poids −10 % (perte) ou +5 % (prise) ;
  - R et S occupent 4 % des emplacements chacun, **sans historique** en N2 à N4 (sinon la vraisemblance historique, étrangère au monde simulé, entre dans le chemin actuel).
- **Monde** :
  - offset vrai ~ N(0, σ_profil) ; variante N2 σ × t(3), retirée seulement si NASEM + offset ≤ 1 kcal/j (domaine de Hall : 1 retirage par cellule t(3)) ;
  - le poids d'onboarding est lui-même une pesée bruitée : poids vrai = déclaré − bruit, maintien vrai = NASEM(déclaré) + offset. La vérité est donc exprimée dans le repère de l'estimateur (écart de repère mesuré : 0 partout) ;
  - apport réel = cible du plan ; glucides réels = glucides du plan ;
  - pas réels = cible, saisis chaque jour ; adhérence « plan respecté » tous les jours, lue par le chemin actuel seulement ;
  - saisi = réel × (1 + u) × (1 + 0,08 z), 100 % des jours ;
  - pesées : Hall + t(4) × 0,6 kg, quotidiennes ou tous les 3 jours en alternance ;
  - vérité en unités de saisie = offset + u × apport réel.
- **Populations de u** : `drawU` = moyenne + pente × clamp((IMC − 22)/13, 0, 1) + σ z. La pente 0 est P10 lui-même.
- **Prototype** : R0, `nonUsableDayWeight` 0,5 (sans effet : 100 % des jours saisis), `journalRegimeStart` = jour d'onboarding.
- **Graines déclarées** (graines de validation : aucune règle candidate n'est sélectionnée en phase 1, donc pas de graines d'entraînement) :
  - N1 : 101 000 et 110 000 + i ;
  - N2 : 200 000 / 210 000 + i ; stress : 250 000 / 260 000 + i ;
  - N3 : 300 000 / 310 000 + i ;
  - N4 : 400 000 / 410 000 + i.
  La passe doublée tire un nouvel hypercube de 2n avec les mêmes bases.

### 4.1 N1 : équivalence du chemin

- **Exécuté** : 52 fixtures (`results/n1/n1.csv.gz`) :
  - 46 LHS, à 28 ou 42 j, pesée quotidienne ou tous les 3 j, u ~ P10 ;
  - R et S avec historique, à 28 et 42 j ;
  - un profil déclarant « écart important » tous les jours (42 j) ;
  - un homme en prise (42 j).
- **Comparaisons** :
  - harness = `calibrationInputFromStore` → `withLoggedIntake` (totaux du journal) → `fitCalibration` ;
  - prototype `harness_scaled` ;
  - prototype `baseline`.
- **Drapeau désactivé** : section 2, 0 différence → **GO**.
- **Prototype (glucides du harness) contre harness** : **[mesuré]** max |Δ| = **0** exactement sur q10, médiane et q90, 52 / 52 fixtures. Seuil ≤ 1 kcal/j → **GO**.
- **Effet de D5** (base − harness, médiane du posterior) :
  - **[mesuré]** max |Δ| = **42,9** kcal/j (R-28) ; 3 fixtures sur 52 au-delà de 25 kcal/j, toutes en perte ;
  - par objectif : perte n = 21, Δ médian +9,3 [−0,2 ; +42,9] ; prise n = 16, −3,6 [−10,6 ; −0,7] ; maintien n = 15, 0,0 ;
  - médiane des Δ sur les fixtures : 0,0 [−0,0 ; +1,0] (bootstrap).
  - **Verdict par fixture (lecture retenue, comme la ligne d'équivalence) : NO-GO.** Sur l'IC de la médiane des Δ, ce serait GO.
- **Explication de l'écart** :
  - **[mesuré]** corrélation Δ / écart glucidique moyen (part de base − part du plan, × apport) = 0,836 ; pente 0,145 kcal/j d'offset par kcal/j de glucides ; écart glucidique médian +90,8 kcal/j en perte, −45,6 en prise, 0 en maintien ;
  - **[déduit]** en perte, les macros du plan sont plus pauvres en glucides que la diète de base (D-16, part au maintien). D5 prête donc au modèle plus de glycogène et d'eau que le plan réel. Pour une même courbe de poids, l'offset estimé monte. Effet inverse en prise, nul en maintien, où les deux parts coïncident.
- **Information, R et S sans historique** (`includeWarmStartHistory` au défaut `false`) : Δ médiane (défaut − avec historique) : R-28 +43,3 ; R-42 +9,9 ; S-28 +30,9 ; S-42 +15,1 kcal/j.

### 4.2 N2 : support et masse aux bornes (prototype, prior NASEM) [S]

- **Exécuté** (`results/n2/`, passe 2 dans `results/n2x2/`) : prototype, posterior avec plancher, horizons 28 et 84 j (choix déclaré : le prompt ne fixe pas d'horizon). Même utilisateur, mêmes bruits et même offset d'une population à l'autre : seul u change.
- **Critère** : part d'utilisateurs avec plus de 5 % de masse dans les 10 derniers points d'une borne ; GO si ≤ 1 % et borne haute de Wilson ≤ 2 % ; NO-GO si la borne basse dépasse 1 % ; INCONCLUSIF sinon.

Part signalée, [Wilson 95 %], verdict. Passe 1 : n = 500 par cellule. Passe 2 : n = 1 000.

| Population | Rôle | Horizon | Passe 1 | Verdict 1 | Passe 2 | Verdict 2 |
|---|---|---|---|---|---|---|
| P00 | principale | 28 | 0,0 % [0,0 ; 0,8] | GO | 0,2 % [0,1 ; 0,7] | GO |
| P00 | principale | 84 | 0,0 % [0,0 ; 0,8] | GO | 0,3 % [0,1 ; 0,9] | GO |
| P05 | principale | 28 | 0,4 % [0,1 ; 1,4] | GO | 0,8 % [0,4 ; 1,6] | GO |
| P05 | principale | 84 | 1,6 % [0,8 ; 3,1] | INCONCL. | 1,7 % [1,1 ; 2,7] | **NO-GO** |
| P10 | principale | 28 | 1,6 % [0,8 ; 3,1] | INCONCL. | 1,1 % [0,6 ; 2,0] | INCONCL. |
| P10 | principale | 84 | 1,8 % [0,9 ; 3,4] | INCONCL. | 1,9 % [1,2 ; 2,9] | **NO-GO** |
| P20 | principale | 28 | 3,4 % [2,1 ; 5,4] | **NO-GO** | 4,0 % [3,0 ; 5,4] | **NO-GO** |
| P20 | principale | 84 | 6,2 % [4,4 ; 8,7] | **NO-GO** | 6,8 % [5,4 ; 8,5] | **NO-GO** |
| P10 σ 20 pts | sensibilité [S] | 28 | 5,2 % [3,6 ; 7,5] | **NO-GO** | 4,8 % [3,6 ; 6,3] | **NO-GO** |
| P10 σ 20 pts | sensibilité [S] | 84 | 8,8 % [6,6 ; 11,6] | **NO-GO** | 7,9 % [6,4 ; 9,7] | **NO-GO** |
| P10 pente −5 | sensibilité [S] | 28 | 2,0 % [1,1 ; 3,6] | **NO-GO** | 1,9 % [1,2 ; 2,9] | **NO-GO** |
| P10 pente −5 | sensibilité [S] | 84 | 2,6 % [1,5 ; 4,4] | **NO-GO** | 3,0 % [2,1 ; 4,3] | **NO-GO** |
| P10 pente −10 | sensibilité [S] | 28 | 2,8 % [1,7 ; 4,6] | **NO-GO** | 2,7 % [1,9 ; 3,9] | **NO-GO** |
| P10 pente −10 | sensibilité [S] | 84 | 4,2 % [2,8 ; 6,3] | **NO-GO** | 4,7 % [3,6 ; 6,2] | **NO-GO** |
| P00 t(3) | variante | 28 / 84 | 4,4 / 5,6 % | NO-GO | 3,4 / 5,3 % | NO-GO |
| P05 t(3) | variante | 28 / 84 | 6,4 / 8,4 % | NO-GO | 4,9 / 6,1 % | NO-GO |
| P10 t(3) | variante | 28 / 84 | 6,6 / 8,6 % | NO-GO | 5,5 / 8,0 % | NO-GO |
| P20 t(3) | variante | 28 / 84 | 8,8 / 12,8 % | NO-GO | 8,8 / 12,9 % | NO-GO |

Même critère sur les 5 derniers points, ou sur le posterior sans plancher : ordres de grandeur identiques (`tables.md`). Utilisateurs dont la vérité en unités de saisie sort de ±1 200, passe 2 (sur 1 000 × 2 horizons) : P00 2, P05 4, P10 9, P20 39, σ 20 pts 50, pentes 11 et 29.

- **Stratification** (passe 1, populations principales, loi normale, deux horizons) :
  - hommes 3,5 % [2,7 ; 4,4] contre femmes 0,5 % [0,3 ; 0,9] ;
  - IMC 31 : 2,7 % ; IMC 38 : 2,5 % ; IMC 21 et 26 : 1,3 à 1,4 % ; S : 0 % ; R : 1,9 % ;
  - 84 j : 2,4 % contre 28 j : 1,4 % ;
  - P00 0,0 %, P05 1,0 %, P10 1,7 %, P20 4,8 % ;
  - activité, objectif et fréquence : 1,7 à 2,0 %.
- **[mesuré]** Les utilisateurs signalés ont une vérité en unités de saisie proche de −1 200 ou au-delà (par exemple −1 148, −1 245, −1 552, −1 689). Leur apport est élevé (2 170 à 4 430 kcal/j) et leur u fortement négatif, ou positif avec offset élevé côté +1 200. Colonne « vérités hors grille » du tableau.
- **Stress** (rapporté, sans seuil ; 20 utilisateurs par cellule) :
  - part signalée à 84 j : u = −40 % → 50 % (cible) et 70 % (3 500 kcal/j) ; u = −30 % → 15 % et 40 % ; u = −20 % → 0 et 5 % ; u de −10 % à +10 % → 0 % ; u = +20 % → 5 % et 20 % ;
  - erreur médiane signée à 28 j, u = −40 %, 3 500 kcal/j : +515 kcal/j.
- **Verdict N2 : NO-GO**, loi normale, populations principales et sensibilité [S], aux deux passes. La variante t(3) est NO-GO dans toutes ses cellules.

### 4.3 N3 : monde bien spécifié

- **Exécuté** (`results/n3/`, `results/n3x2/`) : n = 250 par horizon (14, 28, 42, 84) × fréquence (1 ou 3 j) ; chaque utilisateur est simulé 84 j et ajusté aux quatre horizons (comme T-03).
  - chemin actuel : `calibrationInputFromStore` + `fitCalibration` ;
  - prototype : u = 0 ;
  - « sans plancher » = `informationPosterior`, identique au posterior avec `structuralSdKcal = 0` **[lu]** `src/science/calibration.ts`, dernière ligne de `fitCalibration` (`posterior = structuralSdKcal > 0 ? … : informationPosterior`).
- **Critères** :
  - sans plancher : l'IC de Wilson doit contenir 0,80 et 0,95 ;
  - avec plancher : borne basse ≥ 0,78 et ≥ 0,93 (INCONCLUSIF si l'IC chevauche).

**Passe 1 (n = 250)**

| Chemin | Horizon | Pesée | Couv. 80 sans plancher | Couv. 95 sans plancher | Verdict | Couv. 80 avec | Couv. 95 avec | Verdict |
|---|---|---|---|---|---|---|---|---|
| actuel | 14 | 1 j | 0,776 [0,720 ; 0,823] | 0,928 [0,889 ; 0,954] | GO | 0,788 [0,733 ; 0,834] | 0,936 [0,899 ; 0,960] | INCONCL. |
| actuel | 14 | 3 j | 0,780 [0,725 ; 0,827] | 0,932 [0,894 ; 0,957] | GO | 0,784 [0,729 ; 0,831] | 0,936 [0,899 ; 0,960] | INCONCL. |
| actuel | 28 | 1 j | 0,804 [0,750 ; 0,848] | 0,952 [0,918 ; 0,972] | GO | 0,820 [0,768 ; 0,863] | 0,968 [0,938 ; 0,984] | INCONCL. |
| actuel | 28 | 3 j | 0,764 [0,708 ; 0,812] | 0,928 [0,889 ; 0,954] | GO | 0,780 [0,725 ; 0,827] | 0,936 [0,899 ; 0,960] | INCONCL. |
| actuel | 42 | 1 j | 0,752 [0,695 ; 0,801] | 0,940 [0,903 ; 0,963] | GO | 0,860 [0,812 ; 0,898] | 0,976 [0,949 ; 0,989] | GO |
| actuel | 42 | 3 j | 0,776 [0,720 ; 0,823] | 0,924 [0,884 ; 0,951] | GO | 0,816 [0,763 ; 0,859] | 0,952 [0,918 ; 0,972] | INCONCL. |
| actuel | 84 | 1 j | 0,832 [0,781 ; 0,873] | 0,968 [0,938 ; 0,984] | GO | 0,988 [0,965 ; 0,996] | 1,000 [0,985 ; 1,000] | GO |
| actuel | 84 | 3 j | 0,804 [0,750 ; 0,848] | 0,932 [0,894 ; 0,957] | GO | 0,908 [0,866 ; 0,938] | 0,988 [0,965 ; 0,996] | GO |
| prototype | 14 | 1 j | 0,744 [0,686 ; 0,794] | 0,920 [0,880 ; 0,948] | NO-GO | 0,764 [0,708 ; 0,812] | 0,928 [0,889 ; 0,954] | INCONCL. |
| prototype | 14 | 3 j | 0,756 [0,699 ; 0,805] | 0,928 [0,889 ; 0,954] | GO | 0,764 [0,708 ; 0,812] | 0,928 [0,889 ; 0,954] | INCONCL. |
| prototype | 28 | 1 j | 0,768 [0,712 ; 0,816] | 0,920 [0,880 ; 0,948] | NO-GO | 0,804 [0,750 ; 0,848] | 0,948 [0,913 ; 0,969] | INCONCL. |
| prototype | 28 | 3 j | 0,760 [0,703 ; 0,809] | 0,924 [0,884 ; 0,951] | GO | 0,768 [0,712 ; 0,816] | 0,940 [0,903 ; 0,963] | INCONCL. |
| prototype | 42 | 1 j | 0,712 [0,653 ; 0,765] | 0,896 [0,852 ; 0,928] | NO-GO | 0,776 [0,720 ; 0,823] | 0,952 [0,918 ; 0,972] | INCONCL. |
| prototype | 42 | 3 j | 0,744 [0,686 ; 0,794] | 0,916 [0,875 ; 0,944] | NO-GO | 0,784 [0,729 ; 0,831] | 0,940 [0,903 ; 0,963] | INCONCL. |
| prototype | 84 | 1 j | 0,684 [0,624 ; 0,738] | 0,884 [0,838 ; 0,918] | NO-GO | 0,924 [0,884 ; 0,951] | 0,992 [0,971 ; 0,998] | GO |
| prototype | 84 | 3 j | 0,752 [0,695 ; 0,801] | 0,904 [0,861 ; 0,935] | NO-GO | 0,868 [0,820 ; 0,904] | 0,972 [0,943 ; 0,986] | GO |

Passe 1 : chemin actuel **INCONCLUSIF** (sans plancher GO, avec plancher INCONCLUSIF) ; prototype **NO-GO**. Règle de doublement appliquée à N3.

**Passe 2 (n = 500, règle de doublement)**

| Chemin | Horizon | Pesée | Couv. 80 sans plancher | Couv. 95 sans plancher | Verdict | Couv. 80 avec | Couv. 95 avec | Verdict |
|---|---|---|---|---|---|---|---|---|
| actuel | 14 | 1 j | 0,804 [0,767 ; 0,836] | 0,934 [0,909 ; 0,953] | GO | 0,822 [0,786 ; 0,853] | 0,938 [0,913 ; 0,956] | INCONCL. |
| actuel | 14 | 3 j | 0,782 [0,744 ; 0,816] | 0,944 [0,920 ; 0,961] | GO | 0,796 [0,758 ; 0,829] | 0,944 [0,920 ; 0,961] | INCONCL. |
| actuel | 28 | 1 j | 0,806 [0,769 ; 0,838] | 0,944 [0,920 ; 0,961] | GO | 0,842 [0,807 ; 0,871] | 0,956 [0,934 ; 0,971] | GO |
| actuel | 28 | 3 j | 0,798 [0,761 ; 0,831] | 0,946 [0,923 ; 0,963] | GO | 0,822 [0,786 ; 0,853] | 0,952 [0,930 ; 0,968] | INCONCL. |
| actuel | 42 | 1 j | 0,776 [0,737 ; 0,810] | **0,930 [0,904 ; 0,949]** | **NO-GO** | 0,846 [0,812 ; 0,875] | 0,976 [0,959 ; 0,986] | GO |
| actuel | 42 | 3 j | 0,792 [0,754 ; 0,825] | 0,946 [0,923 ; 0,963] | GO | 0,830 [0,795 ; 0,860] | 0,968 [0,949 ; 0,980] | GO |
| actuel | 84 | 1 j | 0,794 [0,756 ; 0,827] | 0,958 [0,937 ; 0,972] | GO | 0,980 [0,964 ; 0,989] | 0,994 [0,983 ; 0,998] | GO |
| actuel | 84 | 3 j | 0,792 [0,754 ; 0,825] | 0,948 [0,925 ; 0,964] | GO | 0,914 [0,886 ; 0,936] | 0,990 [0,977 ; 0,996] | GO |
| prototype | 14 | 1 j | 0,780 [0,742 ; 0,814] | 0,926 [0,900 ; 0,946] | NO-GO | 0,798 [0,761 ; 0,831] | 0,932 [0,906 ; 0,951] | INCONCL. |
| prototype | 14 | 3 j | 0,774 [0,735 ; 0,808] | 0,936 [0,911 ; 0,954] | GO | 0,786 [0,748 ; 0,820] | 0,944 [0,920 ; 0,961] | INCONCL. |
| prototype | 28 | 1 j | 0,764 [0,725 ; 0,799] | 0,934 [0,909 ; 0,953] | NO-GO | 0,816 [0,780 ; 0,848] | 0,956 [0,934 ; 0,971] | INCONCL. |
| prototype | 28 | 3 j | 0,784 [0,746 ; 0,818] | 0,942 [0,918 ; 0,959] | GO | 0,810 [0,773 ; 0,842] | 0,948 [0,925 ; 0,964] | INCONCL. |
| prototype | 42 | 1 j | 0,732 [0,692 ; 0,769] | 0,906 [0,877 ; 0,929] | NO-GO | 0,816 [0,780 ; 0,848] | 0,964 [0,944 ; 0,977] | INCONCL. |
| prototype | 42 | 3 j | 0,764 [0,725 ; 0,799] | 0,924 [0,897 ; 0,944] | NO-GO | 0,796 [0,758 ; 0,829] | 0,946 [0,923 ; 0,963] | INCONCL. |
| prototype | 84 | 1 j | 0,686 [0,644 ; 0,725] | 0,898 [0,868 ; 0,922] | NO-GO | 0,922 [0,895 ; 0,942] | 0,992 [0,980 ; 0,997] | GO |
| prototype | 84 | 3 j | 0,756 [0,716 ; 0,792] | 0,912 [0,884 ; 0,934] | NO-GO | 0,876 [0,844 ; 0,902] | 0,976 [0,959 ; 0,986] | GO |

- **Verdict N3** (passe 2) :
  - **chemin actuel NO-GO** : sans plancher NO-GO sur une seule cellule, 42 j quotidien, couverture 95 = 0,930 [0,904 ; 0,949] ; avec plancher INCONCLUSIF ;
  - **prototype NO-GO** : sans plancher NO-GO dans 6 cellules sur 8 ; avec plancher INCONCLUSIF.
- **Rangs** (χ² à 9 ddl, posterior sans plancher, passe 2) :
  - chemin actuel : p de 0,044 à 0,89 ;
  - prototype : p = 1,3·10⁻⁸ (84 j, 1 j), 2,8·10⁻³ (84 j, 3 j), 5,2·10⁻³ (42 j, 1 j), autres cellules 0,10 à 0,37.
  Effectifs par décile dans `tables.md`.
- **Autres grandeurs** (passe 2) :
  - biais moyen sans plancher : actuel +3 à +10 kcal/j ; prototype +5 à +20 kcal/j ;
  - largeur 80 sans plancher identique entre chemins (531 → 84 kcal/j de 14 à 84 j en pesée quotidienne) ;
  - porte : 0 % à 14 j avec pesée tous les 3 j (5 pesées sur 12 j < 14 j), 100 % ailleurs.
- **Stratification** (passe 1, tous horizons ; passe 2 dans `tables.md`) :
  - chemin actuel, couverture 80 sans plancher : de 0,763 (IMC 31) à 0,813 (IMC 21) ; cas R 0,688 [0,579 ; 0,778] (n = 80) ; cas S 0,850 ;
  - prototype : de 0,727 (pesée quotidienne) à 0,761 (IMC 21) ; cas R 0,550 [0,441 ; 0,654].
- **Hypothèses de l'estimateur que le générateur ne reproduit pas exactement** (liste demandée) :
  1. *(les deux chemins)* L'estimateur initialise Hall au poids de la première pesée (déclarée), avec composition corporelle, REE et part glucidique de base à ce poids. Le monde démarre au poids vrai (déclaré − bruit), avec ses propres paramètres. Le niveau est marginalisé (D-10), pas la composition.
  2. *(les deux)* Le plancher structurel suppose une erreur de modèle que le monde ne contient pas : intervalles « avec plancher » conservateurs par construction.
  3. *(prototype)* **Bruit de saisie** de 8 % par jour traité comme exact : l'estimateur n'a pas de terme d'erreur sur l'apport.
  4. *(prototype)* **D5** : glucides = part de base × apport saisi, alors que le monde mange les glucides du plan. Écart nul en maintien, non nul en perte et en prise (voir N1).
  5. *(prototype)* Totaux du jour arrondis à 0,01 kcal par `journalDay` (négligeable).
  6. *(chemin actuel)* Aucun écart identifié au-delà de 1 et 2 : apport, glucides, pas, adhérence (poids 1), bruit t(4) × 0,6 et prior N(0, σ) au poids de la première pesée sont reproduits exactement.

### 4.4 N4 : attribution du biais en unités de saisie (diagnostic)

- **Exécuté** (`results/n4/`, `results/n4x2/`) : n = 250 (passe 1) et 500 (passe 2) par population × horizon. Mêmes utilisateurs pour les quatre populations et les trois priors ; pesée alternée ; simulation de 42 j, ajustée à 14, 28 et 42 j.
- **Biais** = moyenne (médiane − vérité en unités de saisie), IC bootstrap.
- **Attribution** (sous prior plat) : attribué au prior si l'IC du biais est inclus dans ±15 kcal/j ; non attribué si l'IC est entièrement hors de ±15 ; INCONCLUSIF sinon.

**Passe 2 (n = 500)** ; la passe 1 est dans `tables.md`.

| Pop. | H | Prior NASEM : biais [IC] | Plat : biais [IC] | Élargi : biais [IC] | Erreur méd. NASEM / plat / élargi | Couv. 80 NASEM / plat / élargi | Couv. 95 NASEM / plat / élargi | Largeur 80 NASEM / plat / élargi | Attribution |
|---|---|---|---|---|---|---|---|---|---|
| P00 | 14 | 14,6 [−5,3 ; 35,5] | 71,6 [41,6 ; 101,1] | 24,4 [2,2 ; 45,1] | 161 / 225 / 167 | 0,80 / 0,79 / 0,84 | 0,96 / 0,95 / 0,98 | 594 / 844 / 677 | non attribué |
| P00 | 28 | 5,7 [−8,7 ; 19,8] | 19,3 [1,3 ; 36,8] | 9,8 [−5,0 ; 25,5] | 102 / 118 / 102 | 0,79 / 0,76 / 0,79 | 0,95 / 0,95 / 0,95 | 390 / 433 / 404 | INCONCLUSIF |
| P00 | 42 | −1,0 [−10,8 ; 8,3] | 3,0 [−7,8 ; 14,5] | 0,4 [−10,0 ; 10,6] | 65 / 70 / 68 | 0,83 / 0,82 / 0,83 | 0,95 / 0,95 / 0,95 | 272 / 280 / 275 | attribué |
| P05 | 14 | 77,7 [53,8 ; 102,3] | 85,3 [56,1 ; 115,7] | 73,3 [49,0 ; 96,0] | 186 / 224 / 182 | 0,72 / 0,78 / 0,78 | 0,90 / 0,94 / 0,93 | 594 / 833 / 676 | non attribué |
| P05 | 28 | 32,4 [16,4 ; 47,2] | 22,2 [5,0 ; 38,5] | 28,0 [12,6 ; 43,0] | 111 / 116 / 108 | 0,76 / 0,76 / 0,77 | 0,92 / 0,94 / 0,93 | 389 / 421 / 402 | INCONCLUSIF |
| P05 | 42 | 11,2 [0,5 ; 21,5] | 3,9 [−7,0 ; 14,9] | 8,3 [−2,6 ; 18,5] | 71 / 70 / 72 | 0,82 / 0,82 / 0,81 | 0,94 / 0,94 / 0,94 | 270 / 279 / 273 | attribué |
| P10 | 14 | 147,1 [123,8 ; 170,9] | 101,8 [73,1 ; 131,6] | 127,3 [102,5 ; 151,6] | 200 / 220 / 201 | 0,67 / 0,78 / 0,74 | 0,87 / 0,94 / 0,91 | 597 / 816 / 681 | non attribué |
| P10 | 28 | 62,9 [47,4 ; 77,9] | 26,9 [10,1 ; 44,6] | 49,1 [33,3 ; 64,3] | 114 / 115 / 114 | 0,72 / 0,76 / 0,77 | 0,90 / 0,94 / 0,92 | 388 / 416 / 400 | INCONCLUSIF |
| P10 | 42 | 25,9 [15,6 ; 36,9] | 6,6 [−4,7 ; 17,6] | 18,3 [7,6 ; 29,3] | 74 / 69 / 69 | 0,81 / 0,81 / 0,83 | 0,94 / 0,94 / 0,93 | 268 / 276 / 272 | INCONCLUSIF |
| P20 | 14 | 287,2 [261,2 ; 314,1] | 137,6 [108,7 ; 167,8] | 236,3 [211,9 ; 261,3] | 295 / 222 / 257 | 0,52 / 0,74 / 0,60 | 0,73 / 0,89 / 0,82 | 605 / 787 / 687 | non attribué |
| P20 | 28 | 125,6 [108,9 ; 143,2] | 42,2 [25,6 ; 59,9] | 93,9 [77,6 ; 111,2] | 136 / 112 / 122 | 0,65 / 0,74 / 0,70 | 0,82 / 0,90 / 0,87 | 384 / 401 / 390 | non attribué |
| P20 | 42 | 57,6 [45,6 ; 70,3] | 16,8 [4,5 ; 29,6] | 41,5 [29,6 ; 54,2] | 78 / 70 / 78 | 0,74 / 0,79 / 0,79 | 0,89 / 0,90 / 0,91 | 263 / 268 / 266 | INCONCLUSIF |

- **Passe 1** (n = 250) : non attribué à 14 j dans les 4 populations, et pour P20 à 28 j ; INCONCLUSIF dans toutes les autres cellules. Le doublement fait passer P00 et P05 à 42 j en « attribué ».
- **Coût du prior élargi pour P00** (élargi − NASEM, apparié, bootstrap) :
  - passe 2 : largeur 80 médiane +83 [+70 ; +94] kcal/j à 14 j et +14 [+10 ; +21] à 28 j ; erreur médiane +6,0 [−5,0 ; +17,4] à 14 j et −0,1 [−6,0 ; +6,4] à 28 j ;
  - passe 1 : largeur +77 [+66 ; +90] et +19 [+10 ; +23] ; erreur +19,7 [−7,6 ; +32,0] et +3,7 [−5,9 ; +13,6].
- **Stratification** par sexe, IMC, activité, objectif et fréquence, sous NASEM et sous plat : `tables.md`.
- **Verdict** : diagnostic, sans verdict bloquant. Attributions comme dans le tableau.

## 5. Temps de calcul

Temps réel, machine à 16 threads. Plusieurs étapes ont tourné **en même temps que le rejeu du 27**, qui occupait les 16 threads : leurs durées sont gonflées par la contention. Plafond de 4 h interprété en temps réel. Le 27 publié affichait 20,2 h de CPU cumulé pour 86,6 min réelles : un plafond en temps CPU aurait interdit son rejeu.

| Étape | Durée réelle |
|---|---|
| `npm run check` de départ (échec au typecheck), puis lint et tests séparés | ≈ 6 s + 40 s |
| Correctif + `npm run check` | ≈ 35 s |
| Capture « avant » | 50 s |
| Rejeu 26 (+ export) | 5 min 53 s |
| Rejeu 27 (+ export), en contention | 1 h 42 min 23 s (publié : 86,6 min sans contention) |
| Capture « après » (en contention) | 2 min 04 s |
| `npm run check` après prototype (en contention) | 1 min 50 s |
| Reconstruction 26 / 27 | 1 min 56 s (26 seul) ; 2 min 37 s (26 + 27) |
| N1 | 26 s |
| N2 passe 1 (première exécution avec échec de la shard 7, puis réexécution propre) | 7 min 05 s + 1 min 35 s ; propre : 7 min 25 s |
| N2 passe 2 (en contention) | 8 min 52 s |
| N3 passe 1 / passe 2 | 2 min 06 s / 3 min 58 s |
| N4 passe 1 / passe 2 | 3 min 18 s / 5 min 10 s |
| Tableaux N1 à N4 | ≈ 15 s |
| `npm run check` final | 43 s |
| **Total réel de la phase** (première commande 20 h 36, dernière 22 h 43) | **2 h 07 min**, sous le plafond de 4 h |

## 6. Non fait, incertitudes, incohérences

**Non fait**

- R1 et R2 sont implémentés et testés unitairement, mais non mesurés (conformément au prompt). Aucun choix de règle, donc pas de graines d'entraînement.
- N2 : le verdict global était déjà NO-GO en passe 1, le doublement n'était donc pas requis pour le verdict. Il a été exécuté pour les cellules INCONCLUSIF (P05 84 j, P10 28 et 84 j) : P05 84 j et P10 84 j deviennent NO-GO, P10 28 j reste INCONCLUSIF (1,1 % [0,6 ; 2,0]).
- Pas d'interprétation au-delà des verdicts. Pas de proposition de correction (support de la grille, D5, modèle d'erreur de saisie), qui relèvent des phases suivantes.

**Incertitudes**

- N3 compte 8 cellules × 2 niveaux jugés chacun sur un IC à 95 %. **[déduit]** Environ 0,8 exclusion par chemin est attendue par hasard sans aucun défaut. Le NO-GO du chemin actuel tient à une seule cellule, dont la borne haute vaut 0,949. Le seuil est appliqué tel quel.
- Lecture du critère D5 de N1 : par fixture (retenue), contre l'IC de la médiane des Δ (GO). Les deux sont donnés.
- N2 : horizon non fixé par le prompt ; choix déclaré 28 et 84 j. Traitement de la variante t(3) non fixé : rapportée à part, et le verdict est NO-GO avec ou sans elle.
- Générateur : la pente IMC est bornée à [22 ; 35] ; R et S n'ont pas d'historique en N2 à N4 ; les pas et les poids cibles sont des choix déclarés (section 4).
- Le « sans plancher » de N3 est lu sur `informationPosterior`, et non sur un second ajustement avec `structuralSdKcal = 0`. L'équivalence est établie par le code **[lu]**, non par une mesure séparée.

**Incohérences 1 à 12 du rapport 33 (gelées, non corrigées)**, celles qui touchent une mesure :

- **1** (NASEM sur `sorted[0]` brut, Hall sur `validWeights[0]`) : le générateur n'a qu'une pesée par jour, donc aucun effet mesuré. Le prototype utilise `validWeights` pour les deux.
- **3** (référence de pas = `profile.averageSteps7d` courant) : reproduite par le prototype pour rester comparable. Aucun effet, le profil n'étant pas modifié en simulation.
- **7** (couverture incluant le jour de la dernière pesée) : la porte du régime journal suit la même convention.
- **11** (test d'isolation incomplet) : traitée par le remplacement demandé en 3.7. Constat supplémentaire **[mesuré]** : `explain.ts` atteint le journal transitivement via `views.ts` (`localTimeOf`, formatage d'heure). C'est documenté dans le test, non corrigé.
- **2, 4, 5, 6, 8, 9, 10, 12** : sans effet sur les mesures de cette phase.

**Autres constats**

- **[mesuré]** Le rejeu 26 écrit en LF, les fichiers publiés sont en CRLF (`core.autocrlf`) ; contenu identique.
- **[lu]** `reports/intake-logging` et `reports/joint-bias` sont suivis par git malgré `/reports` dans `.gitignore` (commits antérieurs). Le rejeu a eu lieu dans le worktree et les fichiers publiés du dépôt principal n'ont pas été modifiés.
- **Hors périmètre, constaté pendant la phase [mesuré]** : le site GitHub Pages sert depuis `ac35cdf` les sources brutes du dépôt (`./src/main.tsx`, sans manifeste ni `sw.js`, icônes en 404). L'application n'est donc plus installable. Deux déploiements tournent à chaque push : « pages build and deployment », qui publie la branche brute, et « Test and deploy », qui publie `dist`. Le second gagnait parce qu'il finissait après. Il a échoué sur `ac35cdf` (le `npm run check` rouge de la section 0), et seule la branche brute a été publiée. Le correctif `fcfdd47` rend le build vert sur cette branche, mais il n'est pas sur `main`.
- Le worktree `../Weighty-bench` (HEAD détachée sur `7715d50`) est à supprimer après relecture (`git worktree remove`).
