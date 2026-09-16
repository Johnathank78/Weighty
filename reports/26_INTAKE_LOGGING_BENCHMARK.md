# Benchmark : apport d'un journal alimentaire sur la calibration (prompt 26)

Tâche de **mesure uniquement**. Aucune sortie utilisateur ni aucune ligne de `src/` modifiée, pas de bump de `SCIENTIFIC_MODEL_VERSION` ni de `SCHEMA_VERSION`, aucun golden ni snapshot touché. Branche `bench/intake-logging`, non fusionnée.

Tables complètes générées : [`intake-logging/tables.md`](intake-logging/tables.md) (28 et 42 jours, deux vérités, grilles 9 cellules de C et C+σ).

---

## 1. Préconditions

| Point | Résultat |
|---|---|
| `git status` | propre sur `main` (`6ff11a7`) avant création de la branche |
| Correctif warm start / grille | présent : D-28 (trois usages de ±1 200 séparés) et D-29 (support d'évidence ±3 000, règles exactes). L'audit 15 a abandonné la grille adaptative au profit de supports séparés : c'est cette version qui est mergée |
| Benchmark mismatch rejoué tel quel | 36/36 tests OK, chiffres T-04 **reproduits à l'identique** (ex. B 42 j : erreur 57, biais +25, couv. 0,95 / 0,98, largeur 308) |

**Écart avec les chiffres du pack.** Le tableau du prompt (B 82 / 0,71 / 0,81 ; F 127 / 0,55 / 0,79) date du modèle 1.2.0, mesuré contre l'offset **métabolique** sans plancher structurel. En 1.3.0, contre la même vérité métabolique : B 82 / 0,79 / 0,95 et F 127 / 0,60 / 0,81. Contre l'estimande officiel (maintien apparent, D-31) : B 57 / 0,95 / 0,98 et F 77 / 0,79 / 0,88. Ce sont les valeurs de référence de cette session. La reproduction figure en tête de `tables.md`.

## 2. Méthode

**Monde simulé.** Il est inchangé : `simulateMismatchUser`, scénarios A à F, 3 profils × 7 offsets × 2 fréquences de pesée. S'y ajoute le scénario **S**, hors prompt, décrit en section 5. La seule modification du simulateur est non comportementale : l'apport réel est exposé et S est ajouté, sans tirage aléatoire supplémentaire. Le test de non-régression vérifie que les mondes et l'entrée du bras A sont identiques.

**Estimateur.** `fitCalibration` de production, sans modification. Voie d'entrée expérimentale : un jour loggé est transmis par les champs existants du `DailyLog` :
- `calorieTargetForDay` reçoit l'apport loggé ;
- les macros sont mises à l'échelle loggé / cible ;
- `adherence: 'on_plan'`, pour un poids d'évidence plein.

Les jours non loggés gardent le comportement du bras A.

**Bras.**
- **A, baseline** : calories cibles, l'adhérence module le poids de vraisemblance.
- **B, journal parfait** : apport réellement simulé, tous les jours, sans biais ni bruit. Contrôle haut uniquement.
- **C, journal réaliste** (bras décisionnel) : `loggé = réel × (1 + biais) × (1 + 0,08 z)` sur une part `couverture` des jours.
  - Biais ∈ {0, −10, −20 %}, **systématique par utilisateur**. Couverture ∈ {100, 85, 70 %}.
  - Masques de couverture emboîtés et bruit partagé entre cellules, tirés d'un générateur dédié : les cellules sont appariées.
  - L'estimateur ne reçoit ni le biais ni l'apport réel (vérifié par test).

**Sigma de l'apport loggé.** **Aucun sigma défendable n'est dérivable des observables** :
- le bruit journalier se moyenne sur la fenêtre (≈ 8 % / √n, négligeable) ;
- le biais systématique, qui domine, n'est pas identifiable à partir de la couverture ou de l'apport loggé.

Le bras C décisionnel traite donc l'apport loggé comme valeur centrale, avec le seul plancher structurel existant (σ 50). Pour information, **C+σ** est une sensibilité et **non un sigma validé** :
- σ = `WARM_START_INTAKE_REL_SD_HIGH` (10 %, qualité déclarée « élevée », constante existante) × apport loggé moyen × part de jours loggés ;
- ajouté en quadrature au plancher via le paramètre de test existant `structuralSdKcal`.

**Vérités.**
- **Métabolique** : offset réel moyen sur la fenêtre, soit la vérité des chiffres du pack et la question « est-ce le vrai TDEE ? ».
- **Apparente propre au bras** (D-31 généralisé) : offset métabolique − moyenne(apport réel − apport supposé par l'estimateur). Elle répond à « le plan est-il cohérent avec ce que l'utilisateur saisit ou suit ? ». Pour A, c'est l'estimande actuel. Pour B, elle égale la vérité métabolique.

**Réplications et incertitude.**
- 5 réplications × 42 utilisateurs, soit **n = 210 par cellule**.
- Seeds déterministes : la réplication 0 à 42 jours réutilise les seeds T-04, puis `+100 000 × r` ; générateur de logging `seed + 7 000 000`.
- Couvertures avec IC 95 de Wilson (± 0,04 à 0,07).
- Δ vs A **appariés** (même monde) : IC normal sur les différences d'indicatrices, bootstrap apparié de 2 000 tirages pour Δ erreur médiane.
- Largeur : médiane de l'intervalle 80 %.

## 3. Résultats sur les scénarios du prompt (B et F)

### Vérité métabolique, 42 jours

| Scénario | Bras | Méd. erreur | Biais | Couv. 80 % [IC] | Largeur 80 | Δ couv. 80 vs A [IC] |
|---|---|---:|---:|---|---:|---|
| B | A baseline | 107 | −102 | 0,70 [0,63-0,76] | 294 | |
| B | B parfait | 50 | −2 | 0,93 [0,89-0,96] | 275 | +0,23 [+0,17 ; +0,30] |
| B | C 0 %, 100 % | 61 | −4 | 0,92 [0,87-0,95] | 275 | +0,22 [+0,16 ; +0,28] |
| B | C −10 %, 85 % | 223 | | 0,20 | 276 | −0,50 |
| B | **C −20 %, 70 %** | **367** | **−361** | **0,06 [0,04-0,10]** | 273 | **−0,64 [−0,71 ; −0,57]** |
| B | C+σ −20 %, 70 % | 362 | −359 | 0,11 [0,08-0,16] | 464 | −0,59 |
| F | A baseline | 114 | −92 | 0,64 [0,58-0,70] | 297 | |
| F | B parfait | 83 | +8 | 0,71 [0,65-0,77] | 282 | +0,07 [−0,00 ; +0,15] |
| F | C 0 %, 100 % | 92 | +15 | 0,73 [0,66-0,78] | 282 | +0,09 [+0,01 ; +0,16] |
| F | C −10 %, 85 % | 204 | | 0,35 | 282 | −0,30 |
| F | **C −20 %, 70 %** | **349** | **−351** | **0,07 [0,04-0,11]** | 282 | **−0,58 [−0,65 ; −0,50]** |
| F | C+σ −20 %, 70 % | 348 | −348 | 0,22 [0,17-0,28] | 474 | −0,42 |

À 28 jours, même tableau : C −20 %, 70 % donne sur B une couverture de 0,25 (Δ −0,52) et une erreur de 330, sur F 0,33 (Δ −0,42) et 307.

### Vérité apparente propre au bras, 42 jours

| Scénario | A baseline | B parfait | C 0 %, 100 % | C −20 %, 70 % | C+σ −20 %, 70 % |
|---|---|---|---|---|---|
| B | 55 · 0,93 · 294 | 50 · 0,93 · 275 | 53 · 0,92 · 275 | 57 · 0,88 · 273 (Δ −0,05) | 57 · 0,97 · 464 |
| F | 82 · 0,72 · 297 | 83 · 0,71 · 282 | 92 · 0,72 · 282 | 92 · 0,68 · 282 (Δ −0,04) | 93 · 0,91 · 474 |

Chaque cellule se lit : erreur médiane · couverture 80 % · largeur.

### Lecture

1. **Le biais de sous-déclaration se transmet tel quel à l'estimation.** Le biais mesuré suit `biais × apport × couverture` : −20 % × ≈ 2 400 kcal × 70 % ≈ −340 kcal, pour −330 à −361 mesurés. Comme l'intervalle **rétrécit** (poids d'évidence plein sur les jours loggés, ratio de largeur 0,93-0,95), la couverture métabolique s'effondre.
2. **Le gain n'existe qu'avec un journal non biaisé.** B parfait et C sans biais améliorent B (+0,22 à +0,23) et, marginalement, F (+0,07 à +0,09, IC touchant 0). **Dès −10 % de biais, le gain disparaît et s'inverse** sur les 6 scénarios, aux deux horizons (grilles de `tables.md`).
3. **Sur F, même un journal parfait ne règle pas la couverture** (0,71 à 42 j, 0,73 à 28 j) : eau autocorrélée, épisodes et dérive dominent.
4. **Contre l'estimande apparent**, le problème de couverture de B est déjà traité par D-31 (0,93). Le journal ne l'améliore pas (Δ −0,05 à 0,00).
5. **C+σ** : la couverture monte seulement parce que la largeur est multipliée par 1,6 à 2,5. Selon le critère du prompt, ce gain ne compte pas. Et contre la vérité métabolique, il reste insuffisant (0,11 et 0,22).

## 4. Critère de décision du prompt 26

| Condition du signal favorable | Mesure | Verdict |
|---|---|---|
| C (−20 %, 70 %) améliore la couverture 80 % sur B et F | vérité métabolique : −0,64 et −0,58 (IC excluant 0) ; vérité apparente : −0,05 et −0,04 | **non** |
| Sans dégrader la médiane d'erreur ailleurs | +130 à +270 kcal sur A, C, D, E (métabolique) | **non** |
| Sans élargissement expliquant le gain | pas de gain en C ; en C+σ, gain entièrement dû à la largeur | **non** |

**Signal défavorable, dans ses deux formes.** Seul le journal sans biais améliore quelque chose, et le gain disparaît dès qu'une sous-déclaration de 10 % est présente.

**Conclusion demandée par le prompt : la saisie alimentaire ne règle pas le problème de couverture de la calibration.** Aucune configuration n'a été cherchée pour sauver l'hypothèse.

## 5. Scénario supplémentaire S (hors prompt 26) : l'utilisateur qui suit son propre objectif

Ajouté pour la question produit qui a motivé l'étude : l'utilisatrice mange **cible − 270 kcal tous les jours**. Elle déclare soit « Plan respecté » (S_on), soit « Écart important » (S_major). Même monde pour les deux déclarations, même protocole, bruit standard.

### Vérité métabolique, 42 jours

| Bras | S_on : erreur · biais · couv. 80 · largeur | S_major : erreur · biais · couv. 80 · largeur | Porte franchie (on / major) |
|---|---|---|---|
| **A baseline** | **252 · +254 · 0,12** · 276 | **300 · 0 · 0,90 · 1 011** | 100 % / **0 %** |
| B parfait | 58 · 0 · 0,92 · 273 | 58 · 0 · 0,92 · 273 | 100 % / 100 % |
| C 0 %, 100 % | 58 · +1 · 0,90 · 273 | 58 · +1 · 0,90 · 273 | 100 % / 100 % |
| C −10 %, 85 % | 134 · · 0,57 | 133 · · 0,57 | 100 % / 100 % |
| C −20 %, 70 % | 197 · −200 · 0,32 · 268 (Δ erreur −55 [−86 ; −27]) | 213 · −208 · 0,36 · 311 (Δ erreur −87 [−114 ; −61]) | 100 % / 100 % |

Contre la vérité apparente (maintien exprimé dans les unités de ce que l'utilisatrice saisit), C −20 %, 70 % donne 56 · 0,85 (S_on) et 65 · 0,89 (S_major).

### Lecture

- **S_major, bras A : aucun apprentissage.**
  - Les jours « écart important » ont un poids nul et la porte ne s'ouvre **jamais** (0 % à 28 et 42 j).
  - Le posterior reste le prior : largeur 1 011, et 0,90 de couverture uniquement par largeur.
  - Le journal rend la porte franchissable dans 100 % des cas et divise l'erreur par 1,4 (biais −20 %) à 5 (sans biais).
- **S_on, bras A : l'estimation est décalée de +254 kcal par rapport au maintien réel** (couverture 0,12). Elle reste cohérente avec l'estimande apparent (57 · 0,91), mais exprimée en « cible habituellement non suivie ». Un maintien affiché de 1 570 correspond à un maintien réel de 1 300.
- **Avec un journal biaisé**, l'erreur métabolique reste de ≈ 200 kcal : le chiffre est exprimé dans les unités de saisie (sous-déclaration comprise), pas en dépense réelle.
- **Non mesuré ici** : la boucle de recalibration. L'estimande apparent du bras A suppose un écart *relatif à la cible* stable. Une utilisatrice qui mange un montant *absolu* (1 300) quand la cible change après recalibration viole cette hypothèse. Cet effet ne se voit que dans un parcours longitudinal (`convergenceJourney`), qui n'a pas été lancé.

## 6. Ce que ces mesures impliquent pour le plan (constat, pas décision)

- **À ne pas promettre** : un TDEE réel plus juste ou des intervalles mieux calibrés grâce au journal. Les mesures montrent l'inverse dès 10 % de sous-déclaration, ce qui est courant en auto-déclaration.
- **Ce qui est mesuré en faveur du journal : un cas précis**, l'utilisateur qui ne suit pas la cible.
  - Il débloque la calibration là où elle est aujourd'hui bloquée (S_major : porte 0 % → 100 %).
  - Il ramène l'estimation vers ce que l'utilisateur mange réellement (S_on : erreur métabolique 252 → 58 à 197 selon le biais).
- **Si le plan D-35 est retenu**, l'estimande doit rester le maintien **apparent relatif à la saisie**, jamais présenté comme une dépense réelle. Le biais de saisie en fait partie.
- **Phase 3 du plan (mélange « historique confirmé »)** : elle repose sur un biais de saisie *partagé* entre historique et journal. Ce benchmark ne le teste pas.
- **Base d'aliments (CIQUAL / OFF)** : elle ne peut aider que si elle réduit le biais systématique. La grille montre la sensibilité : environ −(biais × apport × couverture) kcal sur l'estimation. Cette question n'est pas évaluée ici.

## 7. Rejouer

Baseline T-04 :

```bash
npx vitest run tests/science/calibrationMismatch
```

Expérience complète (16 cellules, ≈ 6 min sur 16 threads ; écrit `reports/intake-logging/*.json` et `tables.md`) :

```bash
npx vitest run -c vitest.experiments.config.ts
```

Tests du modèle d'imperfection (inclus dans `npm test`) :

```bash
npx vitest run tests/science/intakeLoggingModel.test.ts
```

Variable facultative `INTAKE_REPLICATES` (défaut 5) pour un essai rapide.

## 8. Fichiers touchés

| Fichier | Nature |
|---|---|
| `tests/helpers/mismatchWorld.ts` | ajout non comportemental : `trueIntakeKcal` exposé, réglages optionnels `plannedIntakeShiftKcal` / `shiftDeclaredAs` (scénario S). Sans eux, monde et flux RNG identiques |
| `tests/helpers/mismatchBenchmark.ts` | `PROFILES`, `OFFSETS`, `FREQUENCIES`, `BASE` exportés (aucun changement de valeur) |
| `tests/helpers/intakeLogging.ts` | nouveau : modèle d'imperfection, entrée expérimentale, vérité apparente par bras, sigma de sensibilité |
| `tests/helpers/intakeLoggingExperiment.ts` | nouveau : bras, réplications, métriques et IC |
| `tests/science/intakeLoggingModel.test.ts` | nouveau : 10 tests (biais, couverture, masques emboîtés, déterminisme, absence de fuite du biais, identités de vérité) |
| `tests/experiments/*.experiment.ts`, `tests/experiments/buildTables.ts` | nouveaux : 16 cellules et génération des tables, hors `npm test` |
| `vitest.experiments.config.ts` | nouveau : configuration des expériences |
| `reports/26_INTAKE_LOGGING_BENCHMARK.md`, `reports/intake-logging/` | rapport, tables et résumés JSON par cellule |

Non touchés : `src/`, fixtures, snapshots, constantes, Hall, priors, seuils, UI, persistance, schéma.
