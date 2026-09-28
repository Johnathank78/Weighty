# 33 : état du contrat d'entrée de la calibration (extraction en lecture seule)

Extraction factuelle, faite le 2026-09-23 sur le dépôt `Weighty`. Rien n'a été modifié, exécuté ni commité. Seule écriture : ce fichier.

**Conventions**
- **[lu]** : chemin et lignes, puis extrait exact (copié par `sed -n` depuis le fichier, jamais retapé).
- **[déduit]** : raisonnement, avec les lignes sur lesquelles il s'appuie.
- Les résumés d'une ligne (section 1.2) sont des reformulations demandées. Le titre copié et les lignes sources sont donnés à côté.
- Les numéros de ligne correspondent au commit `ac35cdf`, avec l'arbre de travail propre.
- Outils : lecture de fichiers, `git`, `grep`. Aucun test ni benchmark lancé.

---

## 0. État du repo

**[lu]** Sorties des commandes, capturées avant la création de ce fichier.

`git status`

```text
On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean
```

`git branch --show-current`

```text
main
```

`git log --oneline -10`

```text
ac35cdf fix
54f6dd9 multiple fix
b83e5e9 feat(journal): Mes aliments, light barcode reader, hour checkpoints, masking
32f9267 fix(journal): "Mes repas" heading and macro colours on the gauges
88b6924 fix(journal): placeholders, shorter hint, kcal bar on Today, layout tweaks
d742998 feat: journal UI pass, gauges, timeline, fixed add sheet, barcode (prompt 30)
1bcdac5 feat: food journal with embedded Ciqual and opt-in Open Food Facts (prompt 29)
0ea4a93 bench: joint estimation of TDEE offset and intake logging bias (prompt 27)
5142df5 bench: measure intake logging vs target+adherence calibration (prompt 26)
6ff11a7 Update README.md
```

Autres faits utiles sur le dépôt :
- **[lu]** `git branch -a` : `bench/intake-logging`, `bench/joint-bias`, `feat/food-journal`, `feat/food-journal-ui`, `feat/journal-library`, `main`, `remotes/origin/main`. `git stash list` ne renvoie rien.
- **[lu]** `.gitignore:18` contient `/reports`, ajouté par `ac35cdf` (`git show ac35cdf -- .gitignore`). Les fichiers `reports/26_*` et `reports/27_*` restent suivis. `reports/31_INVENTAIRE_DES_MESURES_ET_TESTS.md` n'est pas suivi (`git check-ignore -v` → `.gitignore:18:/reports`). Ce fichier 33 ne l'est pas non plus.

### Versions

**[lu]** `src/science/constants.ts:12`

```ts
export const SCIENTIFIC_MODEL_VERSION = '1.3.0';
```

**[lu]** `src/domain/types.ts:26`

```ts
export const SCHEMA_VERSION = 6;
```

**[lu]** `IMPLEMENTATION_NOTES.md:5-6`

````markdown
- Modèle scientifique : `SCIENTIFIC_MODEL_VERSION = "1.3.0"` (`src/science/constants.ts`) : maintien apparent comme estimande (D-31), plancher calorique sexué (D-32), plancher d'incertitude structurelle de la calibration (D-33), recalibrations espacées d'au moins 7 jours (D-34), calibration hors du fil principal (P-01)
- Schéma de stockage : `SCHEMA_VERSION = 6` (`src/domain/types.ts`), migrations 1 → 2, 2 → 3 (journal alimentaire, J-01), 3 → 4 (heure de consommation, J-06), 4 → 5 (« Mes aliments », J-09) et 5 → 6 (note de pesée, C-01) dans `src/persistence/migrations.ts`
````

**[lu]** Valeurs dans chaque commit (`git show <c>:src/domain/types.ts` et `git show <c>:src/science/constants.ts`) :

| Commit | `SCHEMA_VERSION` | `SCIENTIFIC_MODEL_VERSION` |
|---|---|---|
| `877e302` first push | 2 | 1.3.0 |
| `5142df5` prompt 26 | 2 | 1.3.0 |
| `0ea4a93` prompt 27 | 2 | 1.3.0 |
| `1bcdac5` prompt 29 | 3 | 1.3.0 |
| `d742998` prompt 30 | 4 | 1.3.0 |
| `b83e5e9` | 5 | 1.3.0 |
| `54f6dd9` | 6 | 1.3.0 |
| `ac35cdf` (HEAD) | 6 | 1.3.0 |

**[lu]** `git diff 877e302 HEAD --stat -- src/science src/domain/engine.ts src/store` ne touche que `src/domain/engine.ts` (9 lignes, type `StoredWeight` et champ `menstruating` dans `addWeight`, commit `54f6dd9`) et `src/store/StoreProvider.tsx` (5 lignes). **`src/science/` est identique depuis le premier push.**

---

## 1. IMPLEMENTATION_NOTES.md

### 1.1 D-31, D-33 et D-34 (copie intégrale)

**[lu]** `IMPLEMENTATION_NOTES.md:487-499` (D-31)

````markdown
### D-31 Estimande de la calibration : le maintien apparent (décision validée, modèle 1.3.0)

**Définition.** Le chiffre que la calibration fait converger est le **maintien apparent** : les calories qui stabilisent le poids *quand l'utilisateur suit sa cible comme il le fait d'habitude*. Formellement, l'offset apparent vaut l'offset métabolique moins l'apport excédentaire moyen réellement consommé au-dessus des cibles du jour sur la fenêtre (écarts déclarés et apport non déclaré). Dans le modèle de Hall, manger la cible avec un maintien abaissé de X, ou manger la cible + X avec le maintien vrai, donne le même bilan, parce que le TEF et l'adaptation dépendent tous deux de l'écart à l'apport de base. L'estimande est donc bien défini.

**Ce que ce chiffre n'est pas.** Ni le métabolisme de repos (le REE reste une équation et n'est jamais recalibré), ni une dépense mesurée. Un utilisateur qui mange en moyenne 80 kcal/j de plus que ce qu'il note aura un maintien affiché environ 80 kcal plus bas que sa physiologie.

**Pourquoi ce choix.** Le plan est construit à partir de ce maintien et appliqué au même comportement : la trajectoire prévue reste cohérente avec ce que l'utilisateur fait réellement, sans a priori non validé sur la taille des écarts. Le moteur ne change pas : l'apport de chaque jour reste la cible du jour (D-10).

**Conséquences mesurées.** Le « biais structurel » de −47 à −76 kcal/j rapporté en 1.1.0 et 1.2.0 était exactement l'apport moyen des écarts déclarés du simulateur. Contre l'offset apparent, le biais du monde idéal tombe entre −2 et +9 kcal/j à tous les horizons (T-03). Les benchmarks mesurent désormais contre l'offset apparent et rapportent l'offset métabolique à titre d'information (`apparentOffsetKcal` dans `tests/helpers/syntheticUser.ts` et `mismatchWorld.ts`).

**Interface.** Phrase ajoutée sous « Ton maintien estimé » dans « Pourquoi ce résultat ? » (`WHY_TEXT.apparentMaintenance`) et définition reprise sur l'écran de recalibration. Test lexical : jamais présenté comme une dépense réelle ou un métabolisme (`tests/domain/explanationPanel.test.ts`).

**Vérification annexe.** L'énergie des pas en calibration est évaluée au poids de la première pesée, mais convertie en kcal/kg (`paDeltaKcalPerKgDay`) puis multipliée par le poids courant dans le modèle de Hall : elle suit bien le poids. Ce n'est pas une limite.
````

**[lu]** `IMPLEMENTATION_NOTES.md:507-522` (D-33)

````markdown
### D-33 Plancher d'incertitude structurelle de la calibration (décision validée, modèle 1.3.0)

**Problème.** La vraisemblance suppose un modèle parfait et des pesées indépendantes : la fourchette rétrécissait comme 1/√n alors que l'erreur de modèle (eau autocorrélée, dérive, podomètre) ne diminue pas. Avec l'ancienne vérité métabolique, la couverture 80 % tombait à 0,48 à 84 jours et 0,21 à 120 jours ; avec la vérité apparente, le scénario D (eau autocorrélée) tombait à 0,52 / 0,81 à 84 jours.

**Mécanisme.** Le posterior de l'offset calculé sur la grille (`informationPosterior`) est convolué avec N(0, σ_struct), noyau tronqué à 6 σ, puis renormalisé (`convolveGridProbabilities`, `summarizeGridProbabilities` dans `science/calibration.ts`). Les offsets exclus par le domaine admissible de Hall (D-28) gardent une probabilité nulle. La variance ajoutée vaut σ² ; la médiane d'un posterior symétrique ne bouge pas. `CALIBRATION_STRUCTURAL_SD_KCAL = 50` (`statistical_robustness_parameter`). Non appliqué au warm start, qui a déjà `WARM_START_MODEL_SD_KCAL` dans sa vraisemblance ; le handoff reste la log-vraisemblance brute.

**Choix de σ, protocole fixé avant mesure.** Plus petite valeur parmi {50, 75, 100} qui passe T-03 à 84 et 120 jours et le scénario D ; vérification ensuite, sans retouche, sur les autres scénarios.

| σ (kcal/j) | T-03 84 j couv. 80 / 95 (largeur) | T-03 120 j couv. 80 / 95 | D 42 j couv. 80 / 95 | D 84 j couv. 80 / 95 |
|---|---|---|---|---|
| 0 | 0,82 / 0,95 (122) | 0,83 / 0,95 | 0,69 / 0,88 | 0,52 / 0,81 |
| **50** | **0,96 / 1,00 (178)** | **0,99 / 1,00** | **0,74 / 0,93** | **0,86 / 0,95** |
| 75 | 0,99 / 1,00 (229) | 1,00 / 1,00 | 0,76 / 0,98 | 0,93 / 1,00 |
| 100 | 1,00 / 1,00 (285) | 1,00 / 1,00 | 0,86 / 1,00 | 1,00 / 1,00 |

Mesure de protocole faite avec des mondes D simulés sur 84 jours pour les deux horizons ; les tests enregistrés simulent la durée de chaque horizon (T-04). Le tempérage des pesées rapprochées prévu en repli n'a pas été nécessaire. Conséquence assumée : dans le monde idéal, les intervalles sont un peu conservateurs (couverture 80 % de 0,96 à 84 jours). La confiance « élevée » (largeur 80 % ≤ 300) reste atteinte : dès J35 dans le parcours A. Tests : conservation de la masse, du centre et de la variance, posterior fitté égal au posterior d'information élargi (`calibration.test.ts`), horizons longs (`calibrationLongHorizon.test.ts`), offsets exclus à probabilité nulle (`warmStartDomain.test.ts`).
````

**[lu]** `IMPLEMENTATION_NOTES.md:524-538` (D-34)

````markdown
### D-34 Espacement minimal des recalibrations proposées (décision validée, modèle 1.3.0)

**Problème.** Parcours A de la revue (modèle 1.2.0) : 14 recalibrations en 84 jours, dont 3 en 5 jours (J14, J16, J19) qui emmenaient la cible de 1 940 à 1 458 kcal. Le critère « fourchette 80 % rétrécie d'au moins 10 % » se déclenchait presque tous les 2 à 3 jours.

**Règle.** `RECAL_SURFACE_MIN_INTERVAL_DAYS = 7` (`engineering_prior`) : aucune nouvelle proposition moins de 7 jours après la dernière proposition vue, quels que soient les critères. La première proposition après la porte n'est pas concernée. Les critères de 05 s12 s'appliquent ensuite sans changement. Pas de changement de schéma (`meta.lastSurfacedCalibration.surfacedOn`).

**Parcours mesurés** (`tests/domain/convergenceJourney.test.ts`, `tests/helpers/convergenceJourney.ts` : utilisatrice virtuelle de 32 ans, 72 kg, pesée 6 jours sur 7, 85 % de journées notées, eau autocorrélée, chaque recalibration acceptée, 84 jours) :

| Scénario | Recalibrations (1.2.0 → 1.3.0) | Amplitude de la cible après la porte | Offset final / apparent (kcal/j) | Fourchette 95 % finale |
|---|---|---|---|---|
| A, maintien 300 kcal sous NASEM | 14 → 9 | 251 kcal (minimum 1 414 à J21) | −385 / −362 | −509 à −259 |
| B, A + 20 % de jours à +400 kcal non notés | 15 → 9 | 294 kcal | −514 / −477 | −640 à −388 |
| C, maintien 250 kcal au-dessus de NASEM | 15 → 8 | 286 kcal | +160 / +157 | contient +157 |

Limite qui reste : la baisse de la cible entre J14 et J21 dans A (une variation d'eau lue comme un maintien plus bas) est toujours là. L'espacement la rend visible une fois au lieu de trois, et elle se corrige à partir de J44. Aucune règle de lissage de la cible n'est ajoutée sans données réelles.
````

### 1.2 Entrées postérieures à D-20

**[lu]** Titres copiés depuis `grep '^### '` sur `IMPLEMENTATION_NOTES.md:234-778`, dans l'ordre du fichier. Les résumés sont des reformulations d'une ligne. Les sections 5 à 11 du fichier (T-03, T-04, hypothèses, limites, vérifications, changements de modèle) ne portent pas d'identifiant d'entrée. Les parties pertinentes sont copiées en 1.3.

| Ligne | Titre exact | Résumé |
|---:|---|---|
| 234 | D-21 Poids nutritionnel de référence continu (décision validée, modèle 1.1.0) | Poids de référence nutritionnel continu (IMC 25 + 0,33 de l'excédent), à la place de la marche à IMC 30. |
| 250 | D-22 Vitesse continue en pourcentage du poids (décision validée, modèle 1.1.0) | Slider de vitesse continu en % du poids par semaine, bornes IMC et plancher, remplace les trois presets. |
| 261 | D-23 Warm start depuis l'historique calorique (décision validée, modèle 1.1.0) | Warm start : l'historique calorique déclaré donne une vraisemblance sur l'offset, fusionnée au prior, puis réutilisée à chaque calibration. |
| 296 | D-24 Onboarding (UX, patch 1.1.0, révisé par la passe UX v2) | Onboarding à un écran par information, placeholders jamais stockés, liste d'activités révisée. Aucune règle scientifique changée. |
| 312 | D-25 « Pourquoi ce résultat ? » et détails scientifiques (observabilité, passe UX v2) | View-model « Pourquoi ce résultat ? » qui collecte des valeurs existantes, sans formule nouvelle. Structure remplacée par D-30. |
| 324 | D-26 Progression vers la première recalibration (affichage, passe UX v2) | Progression vers la porte : une barre par critère réel de evaluateGate, dont la couverture d'adhérence. |
| 328 | D-27 Plan sans projection détaillée (passe UX v2) | Écran Plan sans bloc de projection. |
| 332 | D-28 Correctif neutre du warm start : trois usages de ±1 200 séparés, gel de Hall supprimé (P1, sorties inchangées) | Séparation nominale des trois usages de ±1 200 et exclusion typée des offsets hors domaine de Hall. Sorties identiques. |
| 374 | D-29 Règles de décision du warm start sur la distribution exacte (décision validée, modèle 1.2.0) | Modèle 1.2.0 : cohérence exacte du warm start sans effet numérique, z prédictif, support d'évidence ±3 000. |
| 445 | D-30 Refonte de « Pourquoi ce résultat ? » (affichage, passe P3, aucune science modifiée) | Refonte du panneau explicatif (poids des sources, seuils, intégrité du plan). Science inchangée. |
| 479 | W-01 Cas pratique de la passe UX v2 (retiré) | Cas pratique W-01 retiré, remplacé par les cas R et S. |
| 483 | N-01 Stabilité numérique du glycogène (correction numérique, modèle 1.1.0) | Sous-pas RK4 quand la raideur du glycogène dépasse la limite. Correction numérique. |
| 487 | D-31 Estimande de la calibration : le maintien apparent (décision validée, modèle 1.3.0) | L'estimande de la calibration est le maintien apparent, écarts habituels compris. Intégralement copié en 1.1. |
| 501 | D-32 Plancher calorique sexué (décision validée, modèle 1.3.0) | Plancher calorique : 1 200 kcal (femmes) ou 1 500 kcal (hommes), et au moins 0,7 × REE. |
| 507 | D-33 Plancher d'incertitude structurelle de la calibration (décision validée, modèle 1.3.0) | Posterior de calibration convolué avec N(0, 50 kcal/j). Intégralement copié en 1.1. |
| 524 | D-34 Espacement minimal des recalibrations proposées (décision validée, modèle 1.3.0) | Au moins 7 jours entre deux recalibrations proposées. Intégralement copié en 1.1. |
| 540 | P-01 Calibration hors du fil principal et optimisation exacte (performance, modèle 1.3.0) | fitCalibration optimisée sans changement de sortie, exécutée dans un Web Worker. |
| 546 | M-01 Confiance « moyenne » du warm start : mesure et règle conservée (D-23, D-29) | Mesure de la confiance « moyenne » du warm start. Règle conservée. |
| 550 | J-01 Journal alimentaire : contrat de données (schéma 3, aucun changement de modèle) | Contrat de données du journal (schéma 3), séparé de dailyLogs et du plan, hors de tout calcul. |
| 569 | J-02 Table Ciqual embarquée | Table Ciqual 2025 embarquée, recherche locale. |
| 577 | J-03 Open Food Facts : exception réseau unique, opt-in | Open Food Facts, seule exception réseau, opt-in, relu à chaque appel. |
| 592 | J-04 Journal : UX de la première passe | Première UX du journal, affichée à côté de la cible du jour. |
| 598 | J-05 Code-barres : détection native seule, replis mesurés et non embarqués (passe UI 30) | Code-barres par détection native. Replis WASM et OCR mesurés, non embarqués. |
| 615 | J-06 Heure de consommation (schéma 4) | Heure de consommation distincte de l'heure de saisie, rattachement du jour (schéma 4). |
| 624 | J-07 Feuille d'ajout à hauteur fixe et clavier logiciel | Feuille d'ajout à hauteur fixe, comportement avec le clavier logiciel. |
| 631 | J-08 Jauges (décisions du product owner, 2026-09-16) | Jauges kcal et macros du journal : pleines au-delà de la cible, sans alerte. |
| 638 | Hors périmètre, notés pour plus tard (passe 30) | Points reportés de la passe 30. |
| 644 | J-09 « Mes aliments » : base personnelle d'aliments (schéma 5) | « Mes aliments » : base personnelle stockée dans le journal (schéma 5). |
| 654 | J-10 Lecteur code-barres léger, sans OCR (remplace l'étape 2 de J-05) | Lecteur EAN léger en fonctions pures, sans OCR. |
| 680 | J-11 Trame horaire et masquage à l'écran | Regroupement des entrées par heure, masquage à l'écran seulement. |
| 686 | J-12 Poids d'une unité et portions | Poids d'une unité et portions (Ciqual sans portion, OFF serving/package). |
| 695 | A-01 Fond de la feuille d'ajout jusqu'au clavier (point A1, corrige J-07) | Fond de la feuille d'ajout prolongé jusqu'au clavier. |
| 701 | A-02 Œil principal et sélection masquée (point A2, corrige J-11) | Quitter le mode masquage vide la sélection. |
| 707 | A-03 Graphique de Suivi : échelle pure puis rendu canvas (point A3) | Graphique de Suivi : échelle pure, projection recalculée depuis aujourd'hui avec le maintien courant, rien avant la première calibration. |
| 716 | A-04 Zoom refusé (point D1, demande explicite du product owner) | Zoom gestuel refusé. |
| 722 | B-04 Liste masquée en mode scan (point B4) | Liste « Déjà utilisés » masquée pendant le scan. |
| 726 | B-05 Liste unique « Déjà utilisés » (point B5, remplace « Récents » + « Mes aliments » à vide) | Liste unique « Déjà utilisés », dédoublonnée. |
| 732 | B-01 La barre des heures ne décale plus les aliments (point B1) | L'heure devient un en-tête au-dessus de ses aliments. |
| 736 | B-03 Un drapeau par macro, et les chiffres marqués comme des planchers (point B3) | Un drapeau de macro manquante par macro, valeurs marquées « au moins ». |
| 743 | C-01 « J'ai mes règles » noté avec la pesée (point C1, schéma 6) | Case « J'ai mes règles » stockée avec la pesée, jamais lue par le moteur (schéma 6). |
| 750 | D-02 Bande de status bar à la couleur de l'app (point D2) | Bande de status bar peinte en --bg. Identifiant D-02 réutilisé. |
| 754 | D-03 Rebond élastique seulement là où ça défile (point D3) | Rebond élastique seulement là où ça défile. Identifiant D-03 réutilisé. |
| 758 | D-04 Hauteur des panels stable (point D4) | Emplacements réservés pour que la mise en page ne bouge pas. Identifiant D-04 réutilisé. |
| 762 | E-01 « Vider Mes aliments » avec confirmation (point E1) | Vider « Mes aliments » avec confirmation, journal inchangé. |
| 766 | E-02 « Détails scientifiques » en dernier (point E2) | « Détails scientifiques » en fin de préférences. |
| 770 | F-01 Accord en genre (lot F) | Accord en genre des quatre chaînes genrées, via agree(). |

### 1.3 Autres entrées qui mentionnent le journal, la saisie alimentaire, l'adhérence, les pas en calibration ou la calibration

**Critère de sélection.** Tout bloc `###` du fichier contenant au moins un de ces termes : « journal », « calibration » (y compris « recalibration »), « adhérence », « saisi » dans un contexte alimentaire. S'y ajoutent les entrées de la chaîne de saisie alimentaire (J-xx et points UI du journal).
- Recherche faite avec `awk` par bloc et `grep -n "adhérence\|saisi"`.
- Exclues, sans aucun de ces termes : D-02 à D-09 (Hall, MET, REE), D-14, D-15, D-18 à D-22, D-24, D-25, D-27, W-01, N-01, D-32, M-01, A-04, D-02/D-03 (UI) et E-02.
- Pour les sections 1 et 2, qui ne sont pas des entrées, seules les lignes concernées sont copiées. Les sections 5 à 11 sont copiées en entier, car la calibration y revient à presque chaque paragraphe.

**[lu]** `IMPLEMENTATION_NOTES.md:34` (architecture)

````markdown
  store/          Provider React (état + sauvegarde), calibration dans un Web Worker avec repli synchrone (P-01)
````

**[lu]** `IMPLEMENTATION_NOTES.md:91-95` (table des modules)

````markdown
| 05 s5 tendance | `science/trend.ts` | `calibration.test.ts` |
| 05 s6 à s13 calibration | `science/calibration.ts` | `calibration.test.ts` (récupération idéale à 28 et 42 jours), `calibrationMismatch.part1/2.test.ts` |
| 05 s11 confiance | `science/calibration.ts` | `calibration.test.ts` |
| 05 s17 warm start | `science/warmStart.ts`, `science/normal.ts`, `domain/engine.ts` | `domain/warmStart.test.ts`, `science/warmStartDomain.test.ts`, `science/warmStartExactRules.test.ts`, `domain/warmStartReferenceCases.test.ts` |
| Explication du résultat, porte de recalibration (affichage) | `domain/explain.ts`, `domain/views.ts` (`gateProgress`, `gateCriterionValue`), `components/ResultExplanationView.tsx` | `domain/explainAndScreens.test.ts`, `domain/explanationPanel.test.ts` |
````

**[lu]** `IMPLEMENTATION_NOTES.md:100-107`, Résultats de validation mesurés

````markdown
### Résultats de validation mesurés (modèle 1.3.0)

- **Modèle de Hall** (validation du portage numérique contre `bw`, pas une validation biologique indépendante, D-02) : écart maximal sur 14 scénarios de 0,0097 kg à 90 jours, 0,0085 kg à 180 jours, 0,0064 kg à 365 jours (tolérances 0,20 / 0,35 / 0,50 kg). Le mode validé est exactement le mode de production. Dérive à l'équilibre inférieure à 0,05 kg sur 30 jours.
- **Récupération de calibration, monde idéal** (T-03, 126 utilisateurs synthétiques, vérité = offset apparent, D-31) : erreur médiane 92 / 46 / 30 / 17 kcal/j à 28 / 42 / 84 / 120 jours, biais entre −2 et +9, couvertures 80 % de 0,91 à 0,99 et 95 % de 0,98 à 1,00. Tous les critères sont atteints, y compris aux horizons longs ajoutés en 1.3.0.
- **Benchmark avec model mismatch** (T-04, 42 et 84 jours) : 11 cas sur 12 atteignent les trois critères ; seul le scénario combiné F à 42 jours manque la couverture 95 % (0,88). Documenté, sans réglage.
- **Parcours de convergence** (`tests/domain/convergenceJourney.test.ts`, D-34) : au plus une recalibration par semaine, cible jamais sous le plancher, offset apparent dans la fourchette 95 % finale.
- **Matrice de propriétés** : 10 000 profils acceptés, aucun NaN ni Infinity, aucune cible sous le plancher, macros réconciliées à ±5 kcal, continuité de la projection sous perturbation de 0,1 kg **sans aucune exemption** (l'ancienne exclusion autour d'IMC 30 a disparu).
- **Warm start** (profils de `domain/warmStart.test.ts`, historiques générés avec le modèle de production) : voir D-23.
````

**[lu]** `IMPLEMENTATION_NOTES.md:115-124`, D-01

````markdown
### D-01 TEF dans le modèle de Hall (décision validée, modèle 1.1.0)

Le modèle adulte de Hall et al. 2011 (NIDDK Body Weight Planner, package `bw`) représente la thermogenèse alimentaire par son terme natif `β_TEF × (EI − EI_baseline)` avec β_TEF = 0,10. C'est l'unique mode de production pour la résolution d'objectif, les projections, le slider calories / pas et la calibration.

- Le mode `macro_specific` du modèle 1.0.0 (TEF par macro greffé sur la structure 2011) est **supprimé** du code, pas seulement désactivé : `HallDailyInput` ne contient plus aucun champ TEF et `hall/model.ts` n'importe pas `tef.ts`. Aucun double comptage n'est possible ; des tests le vérifient (structure de l'entrée, source du modèle, trajectoires identiques pour des plans de mêmes calories et glucides mais de protéines différentes).
- Les coefficients 0,25 / 0,075 / 0,025 restent dans `tef.ts` pour l'affichage explicatif, la décomposition énergétique, les diagnostics et les tests isolés. Ils ne modifient plus la trajectoire.
- La composition en macros n'agit sur le modèle qu'à travers les glucides (glycogène et eau).
- Le modèle macronutriments complet de Hall 2006/2010 n'est pas porté.

Conséquences mesurées : un plan de maintien vaut maintenant exactement le maintien (avant, un TEF par macro inférieur à 10 % abaissait la cible de 20 à 50 kcal/j) ; les cibles de perte ou de prise bougent de −10 à +53 kcal/j sur les profils golden.
````

**[lu]** `IMPLEMENTATION_NOTES.md:169-180`, D-10

````markdown
### D-10 Poids de départ inconnu dans la calibration (décision validée)

Le poids réel au début de la fenêtre est un paramètre de nuisance, marginalisé sous un prior plat sur une grille de ±3 kg par pas de 0,05 kg (`CALIBRATION_INTERCEPT_*`). La première pesée brute n'est pas traitée comme une vérité exacte et aucun second prior ne la compte deux fois. Le posterior reste en une dimension sur l'offset. Ce mécanisme est inchangé et désormais écrit dans `instruct/05` s9.

Détails de la fenêtre :

- elle va de la première à la dernière pesée valide (une pesée par jour, la plus récente) ;
- chaque jour utilise la cible calorique, les glucides et les pas du log du jour ; à défaut, le log antérieur le plus proche ;
- pas pris en compte : pas réels si saisis, sinon cible du jour (05 s7) ;
- poids d'une observation : moyenne des poids journaliers sur les jours qui la précèdent (du jour de la pesée précédente inclus au jour de la pesée exclu) ;
- poids journalier : adhérence × 0,7 si les pas manquent. La première pesée a un poids de 1 ;
- un jour sans macros stockées garde la part de glucides de la diète de base (D-16). En 1.0.0, ce cas (qui ne se produit pas dans l'app) utilisait 50 % ; il est aligné sur D-16.
````

**[lu]** `IMPLEMENTATION_NOTES.md:182-184`, D-11

````markdown
### D-11 Fenêtre « dominée par des écarts importants » (interprétation)

Une pesée est « propre » si au plus 50 % des jours de sa fenêtre sont notés « écart important » (`GATE_MAJOR_DOMINATION_FRACTION`). La couverture d'adhérence se calcule sur les jours compris entre la première et la dernière pesée, bornes incluses.
````

**[lu]** `IMPLEMENTATION_NOTES.md:186-188`, D-12

````markdown
### D-12 Taux de tendance affiché (complément UI)

`kg / semaine` = différence entre la tendance EWMA actuelle et la dernière valeur de tendance datant d'au moins 7 jours, ramenée à la semaine. Il faut au moins 3 pesées. Affichage seulement, jamais utilisé pour la calibration.
````

**[lu]** `IMPLEMENTATION_NOTES.md:190-204`, D-13

````markdown
### D-13 Extensions du contrat de données (complément, schéma 2)

Champs optionnels ou ajoutés, validés à l'import :

- `DailyLog.macrosForDay` : macros exactes du jour, pour reconstruire les glucides historiques sans le plan du jour ;
- `UserProfile.firstName` / `lastName` (passe UX v2, sans changement de schéma) : chaînes facultatives de 60 caractères au plus, affichage local seulement (initiales, titre du profil), jamais lues par le moteur ni envoyées. Pas de montée de schéma : le champ est facultatif, un store sans nom reste valide, et un lecteur de schéma 2 antérieur valide le profil sans retirer les clés inconnues (`isUserProfile` ne reconstruit pas l'objet) ;
- `UserProfile.weeklyRateTarget` (schéma 2) remplace `speedPreset` : vitesse demandée en fraction du poids par semaine, 0 en maintien (D-22) ;
- `CurrentPlan` : `macrosDisplay`, `planWeightKg`, `targetWeightKg`, `requestedWeeklyRate` (schéma 2, remplace `speedPreset`/`appliedSpeed`), `maintenanceStepsPerDay`, `baselineStepTarget`, `baselineCalorieTarget`, `populationTdeeKcal`, `personalOffsetKcal`, `hardFloorKcal`, `warnings`, `proteinRule`. `macros` reste en pleine précision (07 s4) ;
- `CalibrationSnapshot` : `populationTdeeKcal`, `appliedAt`, `source` (`'warm_start'` pour le posterior issu de l'historique, absent pour les pesées) ;
- `WheightyStore.historicalEvidence` (schéma 2) : évidence historique du warm start, `null` sinon (D-23) ;
- `WheightyStore.meta` : estimation initiale affichée (population ou warm start, pour « depuis l'estimation initiale »), catégorie PAL figée, dernière recalibration montrée, trace des données illisibles récupérées.

Des logs sont créés pour chaque jour depuis l'onboarding, avec les cibles du plan en vigueur. Un changement de plan n'actualise que le jour courant, jamais les jours passés (07 s5).

**Migration 1 → 2** : `speedPreset` du profil devient `weeklyRateTarget` via la table figée des anciens presets (perte 0,25 / 0,5 / 0,75 %, prise 0,10 / 0,25 / 0,40 %, maintien 0) ; `speedPreset`/`appliedSpeed` du plan deviennent `requestedWeeklyRate` (la vitesse réellement appliquée était déjà dans `weeklyRateTarget`) ; `historicalEvidence: null` est ajouté. Pesées, logs, snapshots, préférences, méta et version scientifique des plans existants sont conservés tels quels. Le changement de schéma est nécessaire : l'ancien moteur ne connaît pas la vitesse continue, et un lecteur de schéma 1 supprimerait silencieusement `historicalEvidence` en revalidant le store ; avec le schéma 2, il refuse la version future et préserve les données brutes. Tests : migration d'un store, import d'un export de schéma 1, maintien et prise.
````

**[lu]** `IMPLEMENTATION_NOTES.md:214-216`, D-16

````markdown
### D-16 Part de glucides de la diète de base du modèle de Hall (décision validée)

Le modèle suit le glycogène et l'eau selon l'apport glucidique relatif à la diète de base. Avec une base fixe à 50 %, adopter la répartition recommandée (souvent 55 à 60 %) ferait prendre de l'eau, que le solveur à 42 jours compenserait comme du tissu (environ −40 kcal/j sur un plan de maintien). La part de glucides de base est donc celle des macros du plan au niveau du maintien (même règle en calibration). Pour l'historique du warm start, dont la composition est inconnue, c'est la composition du plan de maintien (indépendante de l'objectif). Décision reportée dans `instruct/04` s1. `HALL_BASELINE_CARB_FRACTION = 0,5` ne sert plus que de repli.
````

**[lu]** `IMPLEMENTATION_NOTES.md:218-220`, D-17

````markdown
### D-17 Maintien après calibration (interprétation)

L'offset personnel est estimé par rapport au NASEM au poids de début de fenêtre. Le plan recalibré utilise `NASEM(poids tendance actuel, catégorie PAL figée) + offset médian`, et l'intervalle 80 % correspond aux quantiles du posterior décalés de la même façon. `CalibrationSnapshot.calibratedTdeeMedian` suit la formule de 05 s10 (NASEM de début + médiane). La recalibration n'est jamais appliquée sans confirmation, et une recalibration montrée sert de référence aux seuils d'affichage (05 s12). L'offset du warm start (D-23) est le même paramètre, référencé au NASEM du poids de début d'historique.
````

**[lu]** `IMPLEMENTATION_NOTES.md:261-294`, D-23

````markdown
### D-23 Warm start depuis l'historique calorique (décision validée, modèle 1.1.0)

Question facultative de l'onboarding « Tu suis déjà tes calories ? » (« Non » affiché et stocké par défaut). Non : comportement inchangé. Oui (écran suivant) : apport moyen, nombre exact de jours (un seul champ depuis la passe UX v2, plus de catégories de durée), poids au début (champ laissé vide s'il est inconnu, note « Laisse vide si tu ne le connais pas. », `startWeightKg: null`, jamais de valeur fabriquée), poids aujourd'hui (prérempli), qualité du suivi, activité comparable.

Principe : `prior populationnel + évidence personnelle historique = posterior initial`. La moyenne déclarée n'est jamais prise comme maintien.

- **Vraisemblance** : pour chaque offset du support d'évidence (depuis 1.2.0, D-29 : pas de 5, −3 000 à +3 000 borné par le domaine admissible de Hall ; la grille de calibration −1 200 à +1 200 en est un sous-ensemble et reçoit les mêmes valeurs), le modèle de Hall de production est initialisé à l'équilibre au poids de début avec `maintien = NASEM(poids de début, PAL figée) + offset`, nourri de l'apport moyen déclaré pendant la durée déclarée (glucides : part de la diète de maintien, pas en plus des pas habituels), puis la variation prédite est comparée à la variation déclarée. Vraisemblance gaussienne de variance `2 σ_pesée² + s² (σ_apport² + σ_activité² + σ_modèle²)`, `s` étant la sensibilité du modèle (kg par kcal/j).
- **Incertitudes** (`engineering_prior`, **à valider**) : pesée ponctuelle σ = 0,85 kg (écart-type du bruit Student-t de la calibration) à chaque extrémité ; apport : 10 % (pesée des aliments), 20 % (portions estimées), 30 % (approximation) de l'apport déclaré, erreurs aléatoires et systématiques confondues ; activité non comparable : +200 kcal/j ; plancher structurel du modèle : 100 kcal/j. Durée : son effet passe par la sensibilité du modèle (plus la période est longue, plus la variation de poids informe).
- **Données insuffisantes** : moins de 7 jours ou poids de début inconnu : évidence conservée mais non utilisée (prior populationnel, message explicite). Valeurs hors bornes : refusées à la saisie, ignorées par le moteur.
- **Cohérence** (modifiée en 1.2.0, D-29) : l'historique est signalé `incoherent` si et seulement si la racine exacte de `prédit(offset) = observé` sort de ±1 200 kcal/j (borne `WARM_START_INCOHERENT_OFFSET_BOUND`, D-28), c'est-à-dire si la variation observée sort de `[prédit(+1 200), prédit(−1 200)]`. **Le flag n'a plus aucun effet numérique** : signal d'affichage et de diagnostic seulement, sans effet sur la variance de la vraisemblance, la fusion, la confiance ou le handoff calibration. En 1.1.0, le critère portait sur l'offset linéarisé et multipliait la variance par 4 (écart-type × 2) ; cette règle est abandonnée : elle reposait sur un intervalle sans signification physiologique, via une quantité linéarisée qui surestime l'écart, avec un facteur non validé, et se déclenchait sur 21,5 % de cas conformes au modèle (mesure P0).
- **Conflit** (modifié en 1.2.0, D-29) : statistique prédictive du prior, `z = Φ⁻¹(P(variation ≥ observée))` sous le mélange `Σ prior(o) · N(prédit(o), sd_kg²)` sur le support d'évidence. Signe identique à l'ancien z (négatif quand l'historique indique un maintien plus bas) ; pour un modèle linéaire, égal à l'ancien `offset_historique / √(σ_historique² + σ_prior²)` (test). `|z| ≥ 2` affiche « Tes données récentes diffèrent de notre estimation théorique… ». Aucun message n'accuse l'utilisateur (test lexical).
- **Confiance initiale** : « moyenne » si l'historique est utilisé et que la largeur 80 % ne dépasse pas 75 % de celle du prior ; sinon « faible ». Jamais au-delà de « moyenne » sans pesées Wheighty. Règle inchangée en 1.2.0, **à réarbitrer** : taux de « moyenne » de 2,4 % sur le benchmark de couverture (D-29).
- **Plan** : maintien = NASEM + médiane du posterior, intervalles 80/95 % = quantiles du posterior. Un `CalibrationSnapshot` `source: 'warm_start'` est appliqué, ce qui garde l'offset lors des reconstructions du plan (changement d'objectif, profil). Il n'est pas compté comme recalibration.
- **Recalibration ultérieure** : la log-vraisemblance historique est ajoutée au prior de la calibration sur la même grille (le posterior n'est pas réutilisé comme prior, ce qui éviterait de compter l'historique deux fois). La période historique précède la première pesée ; seule la pesée d'onboarding sert à la fois d'extrémité de l'historique et de niveau de la calibration, où le niveau est marginalisé (D-10) : le bruit de cette pesée tire les deux pentes en sens opposés, ce qui rend la combinaison légèrement conservatrice.
- **Stockage** : `HistoricalIntakeEvidence` versionnée (`evidenceVersion: 1`) dans `WheightyStore.historicalEvidence`, jamais transformée en faux `DailyLog`. Export/import et migrations testés.
- **Provenance** : « Ton historique récent a été utilisé pour affiner cette première estimation. » sur le résultat ; le bloc « Ton historique » et « Ce que ton historique suggère » de « Pourquoi ce résultat ? » (D-25) montrent l'évidence et son estimation seule.

Comportement mesuré (historiques générés avec le modèle de production, offset vrai +250 kcal/j, apport = NASEM − 400) :

| Cas | Offset historique seul | Médiane posterior | Largeur 80 % (prior) | Confiance |
|---|---|---|---|---|
| Femme, 5 jours | non utilisé | 0 | 710 (710) | faible |
| Femme, 14 j, approximation | 241 ± 726 | +33 | 660 (710) | faible |
| Femme, 28 j, pesée des aliments | 244 ± 370 | +91 | 568 (710) | faible |
| Homme, 28 j, pesée des aliments | 246 ± 408 | +123 | 726 (1 008) | moyenne |
| Homme, 28 j, activité non comparable | 246 ± 454 | +110 | 761 (1 008) | faible |
| Homme, 28 j, offset vrai 0 | 0 ± 408 | +5 | 724 (1 008) | moyenne |
| Femme, 28 j, offset vrai −1 000 | environ −1 070 | < −350 | | conflit affiché |
| Homme 90 → 92 kg à 1 400 kcal sur 28 j (modèle 1.1.0) | −2 098 ± 778 (incohérent) | −436 | 889 | faible, conflit affiché |
| Homme 90 → 92 kg à 1 400 kcal sur 28 j (modèle 1.2.0) | −2 098 ± 389 linéarisé, racine exacte −1 737 (incohérent) | −983 | 463 | moyenne, conflit affiché (z −3,60) |

Lignes mesurées avec le modèle 1.1.0 ; en 1.2.0 seule la dernière ligne change (les autres historiques ne sont pas incohérents).

Point à valider : un historique impliquant −700 kcal/j sur 28 jours bien suivis déplace nettement l'estimation (−283 à −357) mais ne déclenche pas le message de conflit (z = −1,7 et −1,3), car l'historique seul reste incertain à ±370–410 kcal/j.
````

**[lu]** `IMPLEMENTATION_NOTES.md:324-326`, D-26

````markdown
### D-26 Progression vers la première recalibration (affichage, passe UX v2)

La barre unique moyennait quatre fractions, dont une ne correspondait pas au critère réel ; elle pouvait paraître presque pleine sans que la porte soit franchie. `gateProgress` lit maintenant le résultat de `evaluateGate` (celui de l'état de calibration, ou une évaluation directe) et renvoie un critère par condition réelle de 05 s8 : pesées (5), durée couverte (14 jours), pesées hors écarts importants (4, D-11), journées notées (50 %). Chaque critère a sa propre barre ; `met` est exactement celui du moteur et la porte n'est franchie que si les quatre le sont (test de cohérence). Le bouton « Ajouter une pesée » est retiré d'Analyse (la saisie existe dans Aujourd'hui et Suivi) ; Aujourd'hui tient compte du critère des pesées propres dans son message.
````

**[lu]** `IMPLEMENTATION_NOTES.md:332-372`, D-28

````markdown
### D-28 Correctif neutre du warm start : trois usages de ±1 200 séparés, gel de Hall supprimé (P1, sorties inchangées)

Suite de l'audit `15_AUDIT_WARM_START_GRILLE.md` et des mesures `20_P0_MESURES_WARM_START.md`, arbitrées dans `21_P1_CORRECTIF_NEUTRE_WARMSTART.md` (documents de handoff numérotés, conservés hors dépôt, comme ceux cités en D-29 et D-30). Aucune sortie ne change : pas de bump de `SCIENTIFIC_MODEL_VERSION`, `SCHEMA_VERSION` inchangé.

**Trois concepts, trois constantes, valeurs identiques.** La borne ±1 200 kcal/j servait à trois choses. Elle est séparée nominalement :

| Concept | Constante | Catégorie | Rôle |
|---|---|---|---|
| A. Support numérique du posterior | `CALIBRATION_GRID_MIN_KCAL` / `MAX` (−1 200 / +1 200, pas de 5) | `statistical_robustness_parameter` | grille partagée par le warm start et la calibration ; inchangée |
| B. Domaine admissible d'initialisation de Hall | `HALL_MIN_BASELINE_INTAKE_KCAL = 1` (borne exclusive) | `engineering_prior` | B1 : `EI_b > 1 kcal/j`, admissibilité numérique seulement, pas un seuil physiologique |
| C. Règle de cohérence du warm start | `WARM_START_INCOHERENT_OFFSET_BOUND = 1 200` | `product_safety_rule` | déclenche le flag `incoherent` |

C n'est pas un paramètre statistique : c'est une règle de décision produit sur ce qu'on accepte d'expliquer par le modèle, pas un réglage de la représentation numérique du posterior. Sa valeur est héritée du support de la grille, sans justification physiologique propre, et reste à sourcer. `warmStart.ts` ne lit plus `CALIBRATION_GRID_*` (test statique).

**Gel silencieux de Hall corrigé.** Mécanisme : un apport de base `EI_b <= 0` (ou une part de glucides nulle) donne `kG = CI_b / G0² <= 0` ; `stableSubsteps` calculait alors `sqrt(CI / kG)` non fini, `Math.max(1, NaN)` renvoyait `NaN`, la boucle `for (i < NaN)` ne s'exécutait jamais et l'état restait figé : poids de départ inchangé, sans erreur ni valeur non finie visible. Désormais :

- `initializeHall` lève une `HallDomainError` typée si `EI_b` n'est pas admissible (`isAdmissibleBaselineIntake`, borne B) ou si `kG <= 0` ;
- `stableSubsteps` lève une `HallDomainError` si le nombre de sous-pas n'est pas fini (défense pour des paramètres construits à la main) ;
- le warm start (`historicalLikelihood`) et la calibration (`fitCalibration`) excluent du support les offsets dont `NASEM + offset` n'est pas admissible : jamais simulés, log-vraisemblance `-Infinity`, probabilité nulle. Le nombre de points exclus est compté (`HistoricalLikelihood.hallDomain.excludedOffsetCount`, `CalibrationFit.excludedOffsetCount`) et remonté dans le view-model (`explain.ts`, `history.hallDomain`, non affiché avant P3).

Ce cas est inatteignable sur le domaine valide : l'EI_b minimal vaut 628 kcal/j sur la matrice de stress et 83 kcal/j au coin théorique (femme, 65 ans, 130 cm, 35 kg, inactive, NASEM 1 282,7). Le correctif est un no-op fonctionnel strict (preuve ci-dessous).

**Diagnostic B2 exposé sans agir.** `deltaClampBaselineIntakeKcal(RMR) = RMR / (1 − β_TEF)` : sous ce seuil, le paramètre d'activité δ de l'initialisation publiée est négatif et ramené à 0 (D-03). `hallDomain` expose l'offset correspondant, l'offset du maximum de vraisemblance et leur écart (cas A : maximum −945, seuil −875,1). Aucun filtre, aucun effet sur le calcul. B2 en exclusion a été écarté (P0 : il couperait la distribution historique d'environ 10 % des utilisateurs pour moins de 0,5 % d'effet sur le plan, et créerait des maximums collés au bord) ; B3 et B4 ne sont pas retenus.

**Sensibilité fiabilisée.** La sensibilité du warm start lit les offsets 0 et ±100 via `valueAtOffset`, qui lève une erreur si l'offset est absent du support ou exclu, au lieu de lire `undefined` et de propager un `NaN` silencieux (ancien `offsets.indexOf`).

**Borne PAL confirmée.** `PAL_ACTIVE_MIN = 1.68` est conforme à la Table 7-1 de NASEM 2023 (chapitre 7) : inactive 1,0 ≤ PAL < 1,53 ; low active 1,53 ≤ PAL < 1,68 ; active 1,68 ≤ PAL < 1,85 ; very active 1,85 ≤ PAL < 2,50. Les cas A (1,683, `active`) et B (1,664, `low_active`) sont correctement classés. **Régression interdite** : la borne 1,60 est celle de l'IOM 2002/2005, encore reprise par de nombreuses sources secondaires ; elle ne doit pas être réintroduite (test de non-régression). Le 1,69 relevé en P0 était un artefact d'outil de résumé.

**Décalages hors périmètre mesurés en P0.** Référence NASEM au poids de début d'historique (warm start) contre première pesée (calibration) : conforme à D-17 et D-23 (offset additif), effet < 21 kcal/j, `DO_NOT_TOUCH`. Part de glucides de maintien (warm start) contre objectif (calibration) : 2 à 8 kcal/j, reporté.

**Preuve de non-régression** (capture complète avant et après, comparaison au bit près, 2 175 354 valeurs, 0 différence) :

- 12 golden : sorties non arrondies, projection complète ; snapshot golden inchangé ;
- T-03 : chaque posterior des 126 simulations à 28 et 42 jours ; T-04 : les six scénarios, deux familles de graines ;
- cas A et B : view-model complet, HTML rendu du panneau « Pourquoi ce résultat ? » en mode digeste et détaillé (métrique et impérial), store d'onboarding, plan enregistré réexpliqué ;
- balayage d'apport déclaré de 900 à 2 500 kcal/j par pas de 10 sur les cas A et B : plans, warm starts, discontinuité comprise (1 370 → 1 380 sur A, 1 250 → 1 260 sur B) ;
- 300 warm starts et plans de la matrice de stress (7 à 365 jours, apports 800 à 6 000, poids de début ±4 kg).

Tests ajoutés : `tests/science/warmStartDomain.test.ts` (contrat de grille, throw sur désalignement, accès à la sensibilité, exclusion comptée côté warm start et calibration, profil au NASEM minimal : changement prédit fini partout, ECF borné entre sa base et l'état stationnaire fixé par le ratio glucidique sur 365 jours, diagnostic B2), `tests/science/hall.test.ts` (domaine B1, erreur typée à la place du gel, `stableSubsteps` fini et ≥ 1), `tests/science/constants.test.ts` (A, B et C séparées, catégorie de C, `PAL_ACTIVE_MIN = 1.68`), `tests/domain/warmStartReferenceCases.test.ts` (snapshot complet des cas A et B, poids cible 62 kg figé pour A).

**Passe suivante réalisée** : modèle 1.2.0, voir D-29.
````

**[lu]** `IMPLEMENTATION_NOTES.md:374-443`, D-29

````markdown
### D-29 Règles de décision du warm start sur la distribution exacte (décision validée, modèle 1.2.0)

Arbitrée dans `22_P2_REGLES_EXACTES_WARMSTART.md` (handoff), sur la base de l'audit 15 et des mesures P0 (`20_`). Bump `SCIENTIFIC_MODEL_VERSION` 1.1.0 → **1.2.0**. `SCHEMA_VERSION` inchangé : l'évidence reste stockée brute (`evidenceVersion: 1`) et la vraisemblance est recalculée.

**Nomenclature des cas de référence.**

| Cas | Profil | Statut |
|---|---|---|
| **R** (primaire) | femme, 24 ans, 155 cm, 68,0 kg, composition non mesurée, assis, 9 400 pas, musculation 4 × 55 min modérée ; historique 14 j à 1 450 kcal/j, aliments pesés, activité comparable, 68,0 → 68,0 kg ; perte à 1,0 %/sem. (vitesse maximale sélectionnable), **cible 60,0 kg** | profil utilisateur réel (ex-« cas B ») |
| **S** | identique à R mais 5 séances, cible 62 kg | variante synthétique (ex-« cas A » de l'audit 15, de P0 et de P1), sans valeur d'usage réel |
| W-01 | 7 000 pas par défaut | **non représentatif**, ne plus utiliser comme référence (section retirée, voir W-01) |

Fixtures et snapshots : `tests/domain/warmStartReferenceCases.test.ts` (R et S). Le 62 kg reste attaché à S seul.

**Diagnostics préalables.**

- **1 450 saisi contre 1 452 affiché** : aucune transformation dans le code. Aller-retour testé (`"1450"`, `"1 450"` avec espace fine, `"1450,0"` → évidence 1 450 → store sauvegardé puis rechargé 1 450 → panneau « 1 450 »). Les valeurs rapportées pour le panneau (médiane historique 1 595, linéarisé −930 ± 568, fusionné 2 074, offset −180, 1 406,2 kcal/j) ne sont reproduites qu'avec un apport de **1 452** (à 1 450 : 1 593, −930 ± 568, 2 074, −180, **1 405,2**). La valeur vue par le moteur dans cette session était donc 1 452 (saisie ou transcription), pas un bug de contrat. Note : la prescription avance par paliers de 1 kcal (tolérance du solveur), d'où 1 405,2 pour 1 448 à 1 451 et 1 406,2 pour 1 452 à 1 454.
- **Cible 60 kg contre 62 kg (cas R)** : calories identiques (1 405,2 kcal/j, le solveur à 42 jours vise la vitesse hebdomadaire), cible atteinte au jour 110 (environ 16 semaines) contre 75 (environ 11 semaines). Le snapshot de P1 faisait porter 62 kg à l'ex-cas B ; corrigé.

**Changements.**

1. **Suppression de l'effet numérique du flag `incoherent`** (D-23 point Cohérence). `WARM_START_INCOHERENT_SIGMA_MULTIPLIER` est supprimée. La SD de la vraisemblance est toujours `√(2 σ_pesée² + s² (σ_apport² + σ_activité² + σ_modèle²))`.
2. **Règle de cohérence exacte** : `exactCoherence` (`warmStart.ts`) ; `incoherent ⇔ observé ∉ [prédit(+C), prédit(−C)]`, C = 1 200 inchangé. Si ±C sort du domaine admissible de Hall, l'offset admissible le plus proche à l'intérieur de [−C, +C] est utilisé (inatteignable sur le domaine valide). La racine exacte est interpolée linéairement entre deux points du support. Cas S : racines −1 095, −1 045, −1 015 et −945 à 1 300, 1 350, 1 380 et 1 450 kcal/j, aucune incohérente.
3. **z de conflit prédictif** : `predictiveConflictZ` ; log-probabilités de queue calculées dans `science/normal.ts` (erfc de Numerical Recipes, erreur relative < 1,2·10⁻⁷, en espace logarithmique pour ne jamais sous-déborder ; quantile par Newton sur log Φ). Seuil 2 inchangé.
4. **Support d'évidence** : `evidenceSupportOffsets`, multiples de 5 dans [−3 000, +3 000] (`WARM_START_EVIDENCE_SUPPORT_HALF_WIDTH_KCAL`, `statistical_robustness_parameter`, nouveau) dont `NASEM + offset` est admissible (domaine B de D-28). Contient strictement la grille. « Historique seul », règle de cohérence et z prédictif y sont calculés ; le posterior fusionné et `historicalLogLikelihood` restent sur la grille de calibration (481 valeurs, contrat inchangé, mêmes valeurs aux offsets communs). Choix de la demi-largeur : valeur fixe plutôt qu'un support adaptatif, pour un coût prévisible ; sans effet sur le plan, **à valider**.
5. **Exposition pour P3** (view-model `history`, non affichée) : `exactRoot` (racine, position, distance à C, intervalle de cohérence), `historyOnlyEdgeMass` (masse dans les 5 et 10 derniers bins de chaque côté, grille et support), `hallDomain` (points exclus sur la grille et sur le support, seuil B2 et position du maximum de vraisemblance sur le support). L'offset linéarisé reste exposé comme approximation diagnostique ; aucune décision ne l'utilise.

**Deltas mesurés (avant 1.1.0 → après 1.2.0).**

| Grandeur | R (1 450 kcal/j) | S (1 450 kcal/j) |
|---|---|---|
| Historique seul, médiane (offset) | −663,0 → −706,7 | −752,7 → −846,1 |
| Historique seul, 80 % | [−1 061 ; −64] → [−1 170 ; −88] | [−1 104 ; −174] → [−1 308 ; −230] |
| Historique seul, 95 % | [−1 162 ; +313] → [−1 354 ; +296] | [−1 176 ; +198] → [−1 491 ; +153] |
| Masse aux 10 derniers bins bas (grille → support) | 3,1 % → ≈ 0 | 4,9 % → ≈ 0 |
| `incoherent` / z | non / −1,47 → non / −1,45 | non / −1,70 → non / −1,68 |
| Posterior fusionné, offset, confiance | inchangés (−182,0 ; faible) | inchangés (−206,6 ; faible) |
| Prescription, macros | inchangées (1 405,2 kcal/j ; 112,8 / 133,1 / 46,8 g) | inchangées (1 502,8 ; 112,8 / 150,2 / 50,1 g) |

Explication : ni R ni S ne sont incohérents à leur apport de référence, donc la vraisemblance sur la grille est identique au bit près et le plan ne bouge pas. Seul l'affichage « historique seul » change (support élargi : la troncature à −1 200 disparaît) et z change de 0,02 (distribution exacte au lieu de la linéarisation).

Garde-fou légitime et saisies aberrantes :

| Cas | Racine exacte / incohérent | z (avant → après) | Posterior (avant → après) | Confiance | Prescription (avant → après) | Signaux après |
|---|---|---|---|---|---|---|
| D-23, homme 90 → 92 kg à 1 400 kcal sur 28 j (NASEM 2 774) | −1 737 / oui | −2,41 → **−3,60** | −436 → **−983** | faible → **moyenne** | 1 869 → **1 396** | conflit, sous le REE |
| Apport déclaré divisé par 3 (homme 88 kg, NASEM 3 028, 1 009 kcal, poids stable 14 j) | −2 019 / oui | −1,90 → −3,33 | −220 → −699 | faible | 2 116 → 1 687 | **conflit (absent en 1.1.0)**, sous le REE |
| Prise de 3 kg en 14 j à 800 kcal (femme 75 kg, NASEM 2 197) | −1 795 / oui | −2,63 → −4,82 | −167 → −644 | faible | 1 297 → 1 207, vitesse 1,0 → 0,55 %/sem. (plancher 1 200) | conflit, sous le REE, vitesse ajustée |

Aucune saisie absurde ne produit de plan sans signal : conflit affiché dans les trois cas, plancher respecté. Mais le posterior du cas D-23 descend de 547 kcal/j et la règle de confiance relative, inchangée, le classe « moyenne » : **à arbitrer**. Le maximum de vraisemblance de ces cas se situe loin sous le seuil B2 (δ ramené à 0) : la vraisemblance exacte y est plus étroite que la linéarisation (SD historique 233 contre 389 pour D-23), en partie à cause des termes eau et glycogène de Hall à faible apport de base.

**Mesures exigées.**

*6.1 Poids de l'historique* (poids = 1 − variance fusionnée / variance du prior sur la grille ; moyenne sur les points du balayage 900 à 2 500 kcal/j où l'ancien flag était actif) : 3,8 % → 15,1 % (R), 3,7 % → 14,6 % (S) ; profils de la matrice : 1,8 % à 12,4 % → 6,9 % à 53,9 % (T2 : 29,9 % → 77,2 %). Écart-type linéarisé divisé par 2, largeur 80 % fusionnée −20 à −445 kcal. Les points non flaggés sont identiques au bit près. L'attendu « environ 10 % → environ 30 % » est **infirmé en niveau** : le poids part de 2 à 6 % et arrive à 9 à 15 % dans la majorité des profils (facteur environ 4, conforme au quadruplement de la variance), 24 à 77 % seulement pour les historiques les plus informatifs.

*6.2 Confiance « moyenne »* (benchmark de couverture P0, 2 016 simulations par scénario) : 1,8 % → 2,4 % (idéal) ; 7 j 0,0 → 0,2 %, 14 j 0,2 → 0,8 %, 21 j 2,6 → 2,8 %, 28 j 4,4 → 5,8 % ; suivi précis 4,6 → 5,2 %, portions estimées 0,4 → 0,9 %, approximation 0,3 → 1,0 %. La règle reste presque inopérante.

*6.3 Couverture* (idéal ; scénarios A à F dans le même sens) : 80 % 0,761 → 0,755 ; 95 % 0,949 → 0,945 ; biais −11 → −24 ; largeur 80 % 791 → 781 ; erreur médiane 246 → 235 kcal/j ; conflit 0,9 → 5,4 % (proche des 4,6 % attendus d'un test |z| ≥ 2 bien calibré). Récupération de l'écart (1 − biais / offset) : −500 : 13 % → 23 % ; −300 : 10 → 14 % ; −150 : 24 → 40 % ; +150 : 3 → −5 % ; +300 : 4 → 4 % ; +500 : 7 → 10 %. Le gain est **asymétrique** : réel sur les offsets négatifs, nul sur les positifs. Scénario F (combiné) : −500 : 15 → 25 %, +500 : 5 → 8 %.

*6.4 Monotonie* (balayage 900 à 2 500 kcal/j, cas R, S et 20 profils de la matrice) : discontinuités > 50 kcal/j dues au warm start 13 profils → **0**, sur le plan complet comme sur le maintien seul. Seul reste le saut de cran de vitesse du profil T1 (moteur d'objectif, hors warm start) : 1 100 → 1 110 kcal/j (−101,8, 0,75 → 0,80 %/sem.) et 2 130 → 2 140 (−102,9, 0,80 → 0,85 %/sem.), figé par un test comme comportement connu non traité.

**Coût du support élargi** (une fois par évidence, résultat mémoïsé) : cas R 14 j 12 → 17 ms, 365 j 138 → 348 ms ; NASEM maximal du domaine (8 444 kcal/j) 14 j 14 → 32 ms, 365 j 337 → 840 ms.

**Plans enregistrés en 1.1.0.** Aucun plan n'est reconstruit au chargement : reconstruction seulement sur action (objectif, profil, recalibration). `explainCurrentPlan` expose `modelVersion` 1.2.0 et `storedPlanModelVersion` 1.1.0. **Limite constatée** : `matchesStoredPlan` recalcule les calories à l'offset enregistré et reste donc `true` même quand le warm start 1.2.0 donnerait un autre offset ; dans ce cas (D-23), le bloc historique recalculé ne correspond plus au maintien enregistré (écart de −547 kcal/j). La prochaine recalibration d'un utilisateur existant utilisera la vraisemblance 1.2.0. Tests : `warmStartReferenceCases.test.ts`.

**Handoff calibration** : T-03, T-04 et les 12 golden sont identiques au bit près (aucun n'utilise d'historique ; capture complète comparée).

**Documentation `instruct/`** : non mise à jour dans cette passe (hors périmètre annoncé), réalignée en P3 (D-30) : `instruct/05_CALIBRATION_UNCERTAINTY.md` s17 (support d'évidence, règle de cohérence exacte sans effet numérique, z prédictif, panneau) et `instruct/08_REFERENCE_NOTES.md` (borne de cohérence, support, z prédictif).

Tests : `tests/science/warmStartExactRules.test.ts` (loi normale en espace log, règle C exacte, cas S sans incohérence entre 1 300 et 1 500, absence de facteur, équivalence linéaire du z et de la racine, support contenant strictement la grille, invariance du posterior fusionné, monotonie non décroissante sur R et S, saut de vitesse de T1 figé), `tests/domain/warmStart.test.ts` (cas D-23 réécrit), `tests/domain/warmStartReferenceCases.test.ts` (R, S, store 1.1.0), `tests/science/constants.test.ts` (1.2.0, multiplicateur supprimé, support).
````

**[lu]** `IMPLEMENTATION_NOTES.md:445-477`, D-30

````markdown
### D-30 Refonte de « Pourquoi ce résultat ? » (affichage, passe P3, aucune science modifiée)

Arbitrée dans `25_P3_REFONTE_PANNEAU.md` (handoff). `SCIENTIFIC_MODEL_VERSION` reste **1.2.0**, `SCHEMA_VERSION` inchangé. Remplace la structure décrite en D-25 (vue digeste et liste plate de détails). Question visée : « je mange 1 450 kcal pendant 14 jours, mon poids ne bouge pas, pourquoi l'app me dit 2 074 ? ». Deux principes : toute valeur issue d'une règle à seuil affiche sa distance au seuil ; le poids réel de chaque source est affiché.

**Vue digeste** (ordre d'affichage) :

1. **Ton maintien estimé** : bloc comparatif unique, estimation théorique, ton historique (support exact) et maintien retenu sur une même échelle (barre de fourchette et point médian), fourchettes 80 % arrondies à 50 kcal (`EXPLANATION_RANGE_ROUNDING_KCAL`) pour qu'une borne proche de 1 200 ne soit pas confondue avec le plancher. Remplace les sections « Estimation théorique » et « Ce que ton historique suggère » ainsi que la phrase « chacun pesé selon sa précision ». Le message de conflit calibré (z ≥ 2) y reste affiché.
2. **Ce qui compte dans ce résultat** (warm start utilisé) : barre à deux segments avec pourcentages et phrase en fraction arrondie, copy validée : « Ton historique compte pour environ un sixième de ce résultat. Le reste vient de l'estimation théorique. » Poids = `1 − variance fusionnée / variance du prior` sur la grille (mesure 6.1 de P2). Cas R : 17,9 %, « un sixième ».
3. ~~**Pourquoi pas X kcal ?**~~ **Retiré de la vue digeste** (retour produit, passe UI suivante) ; `scaleVariationKcalPerDay` reste exposé par le view-model. Copy d'origine, pour mémoire : « Ton poids n'a pas bougé sur 14 jours, mais deux pesées ne suffisent pas à prouver une stabilité réelle. Une balance varie facilement de 0,5 à 1 kg d'un jour à l'autre, selon l'eau et la digestion. Ici, 0,5 kg d'écart représente déjà environ 250 kcal par jour sur 14 jours. Wheighty tient donc compte de ton historique, sans le traiter comme une mesure exacte. » Première phrase adaptée si le poids a changé, unités impériales gérées. Les « 250 kcal » valent `0,5 kg / |sensibilité du modèle|` arrondi à 50 (cas R : 225,2 → 250). Test lexical : aucune formulation qui suggère une erreur de déclaration.
4. Métabolisme de repos, activité prise en compte (tuiles : pas, travail, catégorie d'activité, entraînements, historique saisi), **ton objectif** (vitesse appliquée seule ; si un garde-fou l'a modifiée, info-bulle « Tu avais demandé X % par semaine » suivie de la règle limitante), prescription (calories et pas côte à côte).
5. **Ce qui fera bouger ce chiffre** : confiance actuelle et les quatre critères réels de la porte de recalibration avec leur état (même calcul que Suivi ; aperçu : aucune pesée encore comptée).

**Interdiction stricte** : le flag `incoherent`, les points exclus et tout vocabulaire technique (linéarisé, racine, domaine, support) n'apparaissent jamais en vue digeste (test).

**Détails scientifiques** : six groupes repliables (`<details>`) ; A, B, C et F repliés par défaut, D et E ouverts.

- **A. Intégrité** : badge en tête (« Recalcul conforme au plan enregistré », « Écart avec le plan enregistré » ou « Aperçu »), versions, calories recalculées, offset du warm start enregistré et recalculé.
- **B. Métabolisme et activité** : REE et route, pas, « Exercice structuré (net) » (ligne « Chevauchement retiré » seulement pour les activités step-dominantes ; cas R : 93,5 kcal/j sans soustraction), posture, PAL provisoire et **distance à la frontière la plus proche** en PAL et en kcal de NASEM (cas R : 1,68, +0,016 PAL, +139 kcal/j vers `active`).
- **C. Prior populationnel** : NASEM, sigma de base et multiplicateurs avec leur raison, intervalles.
- **D. Évidence historique** : historique seul sur support exact (source de vérité, 80 et 95 %), offset linéarisé étiqueté « approximation diagnostique, aucune décision ne l'utilise depuis 1.2.0 », écart exact moins linéarisé, masses aux bords (grille et support), racine exacte et distance à la borne ±1 200, `incoherent` avec distance au déclenchement et mention « sans effet numérique », z prédictif et marge au seuil, maximum de vraisemblance par rapport au seuil B2, points exclus par le domaine de Hall, incertitudes. `NASEM au poids de début d'historique` seulement s'il diffère.
- **E. Fusion et confiance** : maintien retenu, offset, 80 et 95 %, poids des sources, confiance et **critère précis** (warm start : largeur 80 % rapportée à celle du prior contre 75 % ; recalibré : porte, largeurs 500 / 300, durée, pesées, écarts importants ; population : aucune évidence personnelle).
- **F. Plan** : vitesses, garde-fou IMC et vitesse sélectionnable **fusionnés**, rejets, solveur, initialisation de Hall, plancher avec marge, macros, règle protéines, disponibilité énergétique avec marge au seuil, « **Avertissements du plan** » (`GoalPlan.warnings` seuls) et « **Signaux actifs** » (frontière PAL, confiance faible, `incoherent`, conflit, δ ramené à 0, vitesse ajustée).
- Supprimé : `Hall baseline intake` (identique au maintien retenu), `Posterior fused` (dupliquait le maintien 80 / 95 %).

**`matchesStoredPlan` corrigé** (`BUG_CODE` constaté en P2) : faux si la version du modèle du plan enregistré diffère, si les calories recalculées à l'offset enregistré diffèrent de plus de 1 kcal, ou, pour un warm start, si l'offset recalculé diffère de l'offset enregistré de plus de `STORED_PLAN_OFFSET_MATCH_TOLERANCE_KCAL` = 10 kcal/j (tolérance d'affichage, égale à l'arrondi des kcal). Détail exposé dans `integrity`. Store 1.1.0 du cas D-23 : `false` (version et offset −547 kcal/j). Aucun plan n'est remplacé : reconstruction sur action seulement. Les snapshots recalibrés ne sont pas recomparés (l'offset dépend des pesées accumulées).

**Valeurs ajoutées au view-model** (`domain/explain.ts`, aucune formule scientifique nouvelle, fonctions et constantes existantes) : `thresholds`, `sources` (poids), `scaleVariationKcalPerDay` (exemple / sensibilité), `confidenceDetail`, `gate` (`gateProgressFromGate`), `signals`, `integrity`, `activity.exerciseNetKcalBeforeOverlap`, `activity.overlapRemovedKcal`, `activity.anyStepDominant`, `activity.palBoundary` (NASEM de la catégorie adjacente par `nasemEerKcalDay`), `population.baseSigmaKcal`, `population.sigmaMultipliers`, `history.historyOnly.interval95`, `history.exactMinusLinearisedKcal`, `safety.floorMarginKcal`. Constantes d'affichage nouvelles (`ui_rounding_rule`, sans bump) : `EXPLANATION_RANGE_ROUNDING_KCAL = 50`, `EXPLANATION_SCALE_VARIATION_EXAMPLE_KG = 0,5`, `STORED_PLAN_OFFSET_MATCH_TOLERANCE_KCAL = 10`. `gateCriterionValue` déplacée dans `domain/views.ts` (réexportée par `Suivi`).

**Non-régression scientifique** : golden, T-03, T-04, cas de référence, balayages et matrice de stress comparés au bit près avec l'état P2 (plus de 5 millions de valeurs, 0 différence hors view-model et HTML du panneau) ; valeurs existantes du view-model inchangées sur R, S, D-23 et un cas aberrant (seuls des champs sont ajoutés). Snapshots R et S mis à jour pour ces seuls ajouts.

**Documentation** : `instruct/05` s17 et `instruct/08` réalignés sur 1.2.0 ; `12_CURRENT_DEBUG_CASE_WARMSTART_1450.md` (handoff) marqué cas synthétique S, avec le cas R documenté comme référence.

Tests : `tests/domain/explanationPanel.test.ts` (poids et fraction, copy « pourquoi pas » métrique et impériale, poids qui change, test lexical, interdiction du flag en digeste, arrondi à 50, porte, distance PAL recoupée avec le cas S, critère de confiance cohérent avec le moteur, marge du z, signaux, ligne d'exercice, toggle non mort, intégrité), `tests/domain/explainAndScreens.test.ts` et `tests/domain/warmStartReferenceCases.test.ts` mis à jour.
````

**[lu]** `IMPLEMENTATION_NOTES.md:540-544`, P-01

````markdown
### P-01 Calibration hors du fil principal et optimisation exacte (performance, modèle 1.3.0)

**Optimisation sans changement de sortie.** Dans `fitCalibration`, la marginalisation du poids de départ (121 intercepts × pesées × 481 offsets) domine. Passe grossière d'abord (1 intercept sur 4), puis évaluation exacte de tous les intercepts voisins d'une valeur grossière située à moins de 60 unités de log de la meilleure ; les autres ont une masse relative inférieure à exp(−40). Les entrées de Hall sont précalculées une fois par jour au lieu d'une fois par offset et par jour. Comparaison à l'implémentation 1.2.0 sur 79 historiques (14 à 365 jours, mondes idéal et avec mismatch, pesée aberrante de +5 kg) : **différence maximale 0** sur chaque probabilité, la médiane et les intervalles. Coût à 365 pesées quotidiennes : 830 → 350 ms (Node, PC). `tests/science/calibrationPerf.test.ts` rapporte 84 / 180 / 365 jours et garde un seuil large (365 jours < 2 s).

**Web Worker.** `src/store/calibration.worker.ts` exécute `computeCalibrationState`. `src/store/calibrationClient.ts` choisit le worker ou un repli synchrone (tests, navigateurs sans Worker), numérote les requêtes et calcule une empreinte FNV des champs utiles du store à la place de `JSON.stringify(dailyLogs)`. `StoreProvider` applique un anti-rebond de 300 ms, ignore les réponses périmées et expose `calibrationPending`. Tant qu'un calcul est en cours, Aujourd'hui et Analyse n'annoncent pas de recalibration, l'écran de recalibration ne marque rien comme vu et le bouton « Appliquer » affiche « Mise à jour… ». Test statique : le worker n'importe que le moteur de domaine et n'utilise ni stockage ni réseau.
````

**[lu]** `IMPLEMENTATION_NOTES.md:550-714`, J-01 à A-03 (suite continue : J-01 à J-12, « Hors périmètre », A-01 à A-03)

````markdown
### J-01 Journal alimentaire : contrat de données (schéma 3, aucun changement de modèle)

Le journal collecte et affiche. **Il n'entre dans aucun calcul** : ni calibration, ni adhérence, ni warm start, ni Hall, ni plan. La façon de s'en servir sera décidée après les benchmarks 26 et 28.

- `WheightyStore.foodJournal = { journalVersion: 1, startedOn, entries, portions }`, **séparé** de `dailyLogs` et de `CurrentPlan`. Les totaux du jour (`intakeLoggedKcal`, `intakeLoggedProteinG/CarbsG/FatG`) sont calculés à l'affichage par `domain/journal.ts journalDay`, jamais stockés, et n'écrivent jamais `calorieTargetForDay` ni les macros du plan.
- `FoodEntry` : `date` (jour local de rattachement), `loggedAt` (horodatage ISO de création), `localTime` (HH:MM local de création), nom, marque, `source` (`ciqual` / `off` / `manual`), `sourceId` (alim_code ou code-barres), `sourceVersion` (version de la table Ciqual ou `last_modified_t` OFF), `resolvedAt`, `per100g` (snapshot), `quantity` (grammes, portion éventuelle), `intake` (valeurs résolues de l'entrée).
- **Snapshot obligatoire** : les valeurs sont figées à l'enregistrement. Une fiche OFF corrigée ou une nouvelle table Ciqual ne réécrit jamais un jour passé (même principe que D-13). Les récents réutilisent le snapshot de la dernière entrée, jamais une source. Supprimer une portion ne modifie pas les entrées qui l'ont utilisée.
- Saisie libre : `sourceId`, `sourceVersion` et `per100g` à `null`, poids facultatif, macros facultatives (`null` = inconnu, les totaux couvrent les valeurs connues et l'écran le dit).
- Portions personnelles : `{ id, label, grams, foodKey, createdAt }`, `foodKey = "source:sourceId"` ou `null` (utilisable pour tout aliment).
- Observables bruts conservés sans aucune dérivation : entrées horodatées (`loggedAt`, `localTime`), `startedOn` (premier jour avec une entrée) qui permet plus tard de compter les jours sans saisie. **Aucun score de qualité ou de complétude.**
- Bornes de stockage seulement : kcal pour 100 g ≤ 950, entrée ≤ 5 000 g et ≤ 20 000 kcal, nom ≤ 200 caractères.
- `Preferences.productSearchEnabled` (J-03), `false` par défaut.

**Migration 2 → 3** : ajoute `foodJournal` vide et `productSearchEnabled: false`. Rien d'existant n'est modifié. Nécessaire : un lecteur de schéma 2 supprimerait silencieusement le journal en revalidant le store ; avec le schéma 3, il refuse la version future et préserve les données brutes. Tests : store existant, fichier exporté de schéma 2, round-trip, rejet d'une entrée invalide, récupération partielle.

**Import** : tout ou rien comme avant ; un fichier importé **ne réactive jamais** la recherche en ligne (consentement propre à l'appareil). **Suppression totale** : `deleteAllData` efface le store (donc le journal) et le cache produits (préfixe `wheighty:`).

**Isolation du moteur** : `StoreProvider` retire le journal avant d'envoyer le store au worker de calibration ; l'empreinte de calibration ne lit pas le journal. Tests : empreinte et `computeCalibrationState` identiques avec et sans journal, et aucun module moteur/worker ne référence le journal.

### J-02 Table Ciqual embarquée

- Source : Anses. 2025. Table de composition nutritionnelle des aliments Ciqual 2025, doi 10.57745/RDMHWY, licence Etalab 2.0, fichier `Table Ciqual 2025_FR_2025_11_03.xlsx` (sha256 `5555c572…fbb0`, 1 541 998 o). Le fichier brut n'est pas versionné ; `tools/build-ciqual.mjs` régénère `src/data/ciqual.json` sans dépendance.
- Champs retenus : code, nom, groupe, énergie kcal (règlement UE 1169/2011), protéines (N × facteur de Jones), glucides, lipides, pour 100 g. Les 74 constituants ne sont pas embarqués (garde de taille en test : < 350 000 o).
- Conversions : `traces` et `< x` → 0 (quantités sous la limite de quantification), `-` → `null` (inconnu). 3 484 aliments, **143 exclus faute d'énergie en kcal**, 3 341 conservés, 18 avec une macro inconnue.
- Poids : JSON 244 871 o brut, 71 531 o gzip ; chunk de build `ciqual-*.js` 243,32 kB (73,83 kB gzip). Chargé par `import()` à l'ouverture de la recherche : **aucun impact sur le premier écran**, précaché par le service worker comme tout script, aucun fetch au runtime.
- Recherche locale (`domain/foodSearch.ts`) : minuscules, sans accents, ligatures œ/æ développées ; chaque mot doit commencer un mot du nom ; tri par nom commençant par la requête, puis position, puis longueur. Aucune dépendance.

### J-03 Open Food Facts : exception réseau unique, opt-in

Ce contrat casse volontairement « aucune API au runtime » (02, 03 s4), de façon assumée et bornée.

- **Un seul module réseau** : `src/adapters/openFoodFacts.ts`. Le test de politique statique n'est pas supprimé mais restreint : `fetch`/XHR/WebSocket/EventSource/beacon et URL distantes sont interdits partout ailleurs, le dossier `adapters/` ne contient que ce fichier, l'adaptateur n'importe que des types et ne lit ni store, ni stockage, ni profil.
- **Opt-in** dans Préférences, désactivé par défaut, activé via une feuille de consentement qui dit ce qui part (code-barres ou mots recherchés), ce qui ne part jamais (profil, poids, journal, identifiant) et que l'adresse IP est visible par OFF. L'opt-in est relu à **chaque appel** : désactivé, rien n'est envoyé (testé avec un `fetch` espion).
- **Requêtes** : `GET /api/v3/product/{code}?fields=…` (v3 recommandée) et `GET /cgi/search.pl?search_terms=…&json=1…`, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, aucun cookie, aucune image demandée.
- **Documentation OFF consultée le 2026-09-16**, écarts par rapport aux hypothèses du prompt :
  - limites documentées : 15 requêtes/min/IP pour les fiches produit, 10/min pour la recherche, « pas de recherche à la frappe ». L'adaptateur applique ces limites côté client (fenêtre glissante de 60 s) et la recherche se lance à la validation ;
  - la recherche plein texte n'est pas dans l'API v2 ; la doc renvoie à Search-a-licious, mais ses réponses **n'ont pas d'en-tête CORS** pour une origine navigateur (vérifié). La recherche utilise donc `/cgi/search.pl` ;
  - la convention `User-Agent: AppName/Version (contact)` ne peut pas être appliquée depuis un navigateur (en-tête interdit). La valeur part dans `X-User-Agent`, explicitement autorisé par les en-têtes CORS d'OFF (vérifié). Contact actuel : l'URL du dépôt ; **une adresse de contact produit reste à fournir**.
- **Dégradation** : hors ligne (aucune requête), échec réseau/CORS → indisponible, timeout 8 s (requête annulée, jamais de spinner infini), 404 / `product_not_found`, 429 ou 503 → limite de débit avec délai, réponse illisible → indisponible. Fiche sans kcal pour 100 g : cas normal, produit affiché comme non ajoutable avec renvoi vers la saisie libre (pas de conversion depuis les kJ). Ciqual et la saisie libre restent intégralement disponibles.
- **Cache d'usage** (remplacé par « Mes aliments », J-09) (`persistence/productCache.ts`, clé `wheighty:off-products`) : 100 produits consultés au plus, les plus récents d'abord, frais 7 jours, réutilisé périmé en cas d'échec réseau. Jamais exporté. Effaçable depuis les Préférences et par la suppression totale. Le service worker ne met aucune réponse tierce en cache (`runtimeCaching: []` inchangé).
- **Attributions** visibles dans Préférences, section « Sources des données » (Ciqual, Etalab 2.0 ; OFF, ODbL/DbCL, images non utilisées).

### J-04 Journal : UX de la première passe

Écran `journal` depuis Aujourd'hui (lien discret sous les macros, « Facultatif » quand rien n'est saisi), saisi **à côté** de la cible du plan du jour, sans couleur ni jugement. Ajout par feuille : recherche Ciqual et récents, produits OFF (si activé), saisie libre ; quantité en grammes ou en portions personnelles. Suppression avec annulation. Emplacement prévu pour la copy du product owner sur l'exhaustivité (`JOURNAL_TEXT.completenessGuidance`, `null` : rien n'est affiché tant qu'elle n'est pas fournie).

**Scan caméra non livré dans la passe 29** : voir J-05 (passe 30) pour la mesure des replis.

### J-05 Code-barres : détection native seule, replis mesurés et non embarqués (passe UI 30)

Chaîne livrée : **1** détection native (`BarcodeDetector`, formats EAN-13, EAN-8, UPC-A, UPC-E), **3** correspondance automatique Open Food Facts, **4** saisie du code au clavier, toujours visible sous l'aperçu. L'étape **2** (extraction du texte du code sur l'image) est une passe séparée.

Coûts mesurés le 2026-09-16 (tailles des fichiers publiés, rien n'a été installé), à comparer au précache complet de l'app (1 318 Kio après la passe 29) :

| Repli | Fichiers nécessaires | Poids brut |
|---|---|---|
| Détection WASM (`zxing-wasm` 3.1.4, moteur du polyfill `barcode-detector`) | `zxing_reader.wasm` 953 527 o + JS ~40 Ko | ~1 Mo, chargé par défaut depuis un CDN, à héberger soi-même |
| OCR (`tesseract.js` 7.0.0) | cœur wasm LSTM 2 855 361 o + modèle `eng` best_int 2 952 873 o gzip + worker | ≥ 5,8 Mo |

L'OCR représente plus de 4 fois l'app entière : **disproportionné, non intégré**. Le repli WASM de détection (~1 Mo, surtout utile à Safari iOS) reste une **décision produit ouverte** ; sans lui, iOS passe par la saisie du code au clavier.

Caméra : demandée uniquement quand l'utilisateur ouvre le scanner (`useBarcodeScanner`, dans l'effet), flux arrêté dès qu'un code est lu ou que le panneau se ferme. Refus, absence de caméra ou d'API : message et saisie au clavier, jamais bloquant. Sans l'opt-in réseau (J-03), le bouton code-barres n'ouvre pas la caméra et renvoie vers les préférences, puisque la correspondance exige Open Food Facts.

Vérification : sur Windows l'API native est absente ; les captures de l'aperçu ont été faites avec une caméra simulée et un `BarcodeDetector` de substitution injecté par le script de capture (harnais de test, pas dans l'app). **Lecture réelle à valider sur Android.**

### J-06 Heure de consommation (schéma 4)

- `FoodEntry.consumedTime` (HH:MM local) : heure à laquelle l'aliment a été **mangé**, distincte de `localTime` / `loggedAt` (heure technique de saisie), conservées toutes les deux. La trame du journal trie et affiche `consumedTime`.
- `FoodEntry.date` = **jour de consommation**, jamais le jour d'enregistrement. Règle de passage de minuit (`consumptionDate`) : sur le journal du jour, une heure postérieure à l'heure actuelle ne peut pas être dans le futur et rattache l'entrée à la veille (mangé à 23 h, saisi à 0 h 30 → veille). Sur le journal d'hier, le jour choisi est conservé.
- Interaction : « Je viens de le manger » coché par défaut (heure de consommation = instant d'enregistrement, aucune étape de plus). Décoché, un champ d'heure apparaît et devient la valeur retenue. Sur le journal d'hier, la case n'existe pas (on ne peut pas « venir de manger » hier) et l'heure est demandée.
- État de la case et dernière heure tapée : mémorisés pour la visite de l'écran journal (plusieurs ajouts rétroactifs d'affilée), remis à « coché » en quittant le journal ou au changement de jour. **Jamais persistés** (test statique).
- **Migration 3 → 4** : `consumedTime = localTime` pour les entrées existantes (seule valeur connue), jour et valeurs inchangés. Testée sur store existant, fichier exporté de schéma 3 et round-trip.
- Aucune statistique, catégorisation ni dérivation : stocké, non interprété.

### J-07 Feuille d'ajout à hauteur fixe et clavier logiciel

- `BottomSheet size="fixed"` : hauteur `min(75dvh, hauteur du viewport visuel − 12 px)`, en-tête fixe (sélecteur, recherche, aperçu caméra), seule la liste défile. `--vv-height` et `--kb-inset` suivent `visualViewport` (iOS : la mise en page reste, le clavier recouvre, la feuille est remontée de l'encart ; Android : les deux viewports rétrécissent, encart nul). Zones sûres via `--safe-bottom`.
- **Point remonté, captures à l'appui** : sur petit écran, **75 % ne tient pas clavier ouvert**. 375 × 667 : clavier ≈ 40 %, zone visible ≈ 400 px < 500 px (75 %). Même constat à 360 × 640. Plutôt qu'une feuille tronquée, la hauteur est plafonnée à la zone visible et le titre visible est masqué tant que le clavier est ouvert (il reste annoncé aux lecteurs d'écran) : champ de recherche et premiers résultats visibles, le reste défile. À arbitrer par le product owner ; à valider sur appareils réels iOS et Android (clavier simulé ici par réduction du viewport).
- Deux sélecteurs : **Produits** et **Libre**. Produits fusionne Ciqual (local, filtré à la frappe) et Open Food Facts (sur validation ou bouton « Chercher aussi les produits emballés », car la limite documentée de 10 recherches/min interdit la recherche à la frappe) dans une seule liste ; la source reste stockée et apparaît en détail de ligne, plus comme catégorie. Recherche vide : message gris explicatif, suivi des récents s'il y en a (réutilisation exigée par la passe 29), jamais de liste vide ni de squelette. Icône code-barres dans la barre de recherche ; aperçu caméra pleine largeur sous le sélecteur.
- Action d'ajout en footer fixe au-dessus de la navigation, rendue par portail (le conteneur animé de l'écran ancrait sinon l'élément fixe en bas de page).

### J-08 Jauges (décisions du product owner, 2026-09-16)

- Composant existant réutilisé : barre `.progress` / `.progress__bar` (pas saisis sur Aujourd'hui). Aucun nouveau composant de jauge.
- kcal : remplissage saisi / cible du jour, kcal restantes. **Au-delà de la cible** : la barre reste pleine, même couleur, et le texte devient « N kcal au-delà de la cible ». Ni nombre négatif, ni rouge, ni alerte.
- Macros : **trois jauges identiques** (option retenue). La nuance « plancher » de la cible de protéines n'est pas représentée, choix assumé.
- `intakeGauge` (domaine) : fraction bornée à 1, restantes et au-delà arrondis, jamais négatifs.

### Hors périmètre, notés pour plus tard (passe 30)

- Révision du parcours d'entrée dans le journal (lien depuis Aujourd'hui).
- Icône par famille d'aliment (céréales, liquides, plats cuisinés), quand une entrée de base stable existe (les groupes Ciqual en sont une piste).
- ~~Étape 2 de la chaîne code-barres (OCR) et repli WASM de détection pour iOS (J-05).~~ Traité par le lecteur léger (J-10), sans OCR ni WASM.

### J-09 « Mes aliments » : base personnelle d'aliments (schéma 5)

- `FoodJournal.library: LibraryFood[]`, dans le journal : exportée avec lui, effacée avec lui, retirée du store envoyé au moteur comme le reste du journal. Nom UI : « Mes aliments ».
- **Enregistrement automatique** : chaque produit Open Food Facts récupéré (scan ou choix dans les résultats en ligne, y compris sans kcal) et chaque saisie libre **nommée** (une saisie sans nom n'a rien par quoi la retrouver). Clés : `off:<code-barres>`, `manual:<nom normalisé>` (sans casse ni accents) ; une nouvelle saisie du même nom remplace les valeurs.
- Réutilisation : les aliments enregistrés apparaissent en tête de la recherche (hors ligne), marqués « Mes aliments ». Un produit repris garde ses valeurs et sa date d'enregistrement ; au scan, un produit de moins de 7 jours est servi sans réseau, un plus ancien est rafraîchi, et reste servi si Open Food Facts est injoignable.
- **Remplace le cache d'usage** `persistence/productCache.ts` (J-03), supprimé : une seule source locale au lieu de deux. Ce cache n'a jamais été déployé (la passe 29 n'a pas été poussée), aucune clé orpheline à nettoyer.
- Borne : 500 aliments ; au-delà, les moins récemment utilisés partent. Préférences : « Vider « Mes aliments » » (le journal ne change pas).
- **Snapshot inchangé** : les entrées gardent leurs propres valeurs ; rafraîchir, retirer ou vider un aliment enregistré ne modifie aucun jour.
- **Migration 4 → 5** : `library: []`, entrées et portions intactes. Testée sur store existant et fichier importé.

### J-10 Lecteur code-barres léger, sans OCR (remplace l'étape 2 de J-05)

Demande : « mini OCR si le lecteur code-barres ne marche pas ». **Choix : lire les barres, pas les chiffres.** Un OCR des chiffres imprimés sous le code exigerait un moteur de reconnaissance (≥ 5,8 Mo mesurés en J-05) ou des gabarits de police OCR-B, et resterait moins fiable. Lire les barres résout le même problème (pas de `BarcodeDetector` sur Safari iOS et Windows) en quelques ko, avec la clé de contrôle du code comme garde-fou.

`src/vision/eanDecoder.ts` (fonctions pures, EAN-13, UPC-A via EAN-13, EAN-8) : 7 lignes horizontales puis 7 verticales, chacune moyennée sur une bande ; deux binarisations (brute, puis renforcement 3 points) ; bords sous-pixel sur seuil local, zones plates forcées en clair ; chiffres reconnus sur les distances bord à bord semblable (norme EAN, insensibles au flou et à l'engraissement), 1/7 et 2/8 départagés par la largeur des barres ; gardes, zones de silence, sens de lecture et clé de contrôle vérifiés ; **deux lignes de l'image doivent donner le même code**. `useBarcodeScanner` : détecteur natif s'il existe, sinon ce lecteur sur une image réduite à 640 px de large, toutes les 250 ms. Caméra toujours demandée à l'ouverture seulement.

**Bench** (`tests/vision/eanDecoder.test.ts`, images 640 × 480 synthétiques, 60 codes par condition, dont 1 sur 5 en EAN-8) :

| Condition | Lus | Erronés |
|---|---|---|
| net, 3,4 px/module | 60/60 | 0 |
| courant, 3 px/module, flou 1 | 60/60 | 0 |
| plus loin, 2,5 px/module, flou 1 | 60/60 | 0 |
| à l'envers, 3 px/module, flou 1 | 60/60 | 0 |
| bruité (±30), 3 px/module | 24/60 | 0 |
| texture de capteur, modules 5 px | 60/60 | 0 |
| texture de capteur, 3 px/module | 33/60 | 0 |
| extrême : 2,2 px/module, flou 1 | 23/60 | 0 |
| extrême : flou 2 | 0/60 | 0 |

Temps par image : **médiane 0,11 ms, p95 0,56 ms** (Node, PC). Faux positifs : **0 sur 300 images sans code** (bruit et rayures). Les taux sont **par image** : à 4 images par seconde, un taux de 40 % lit en moins d'une seconde dans la grande majorité des cas.

**Vérification en navigateur** (Edge, pipeline réel canvas → pixels → lecteur, 45 images 1280 × 720 réduites à 640 × 360 : 5 tailles, 3 flous, droit, incliné de 2,5°, à l'envers, dégradé d'éclairage, texture et bruit) : **42/45, 0 erroné, 0,28 ms par image**. Ce test a révélé un défaut que le bench synthétique masquait : le renforcement seul coupait les barres larges sur la texture de capteur (26/45) ; sans renforcement, les petits modules échouaient (21/45). D'où les deux binarisations, et une condition « texture » ajoutée au bench.

**Non vérifié** : lecture sur de vrais téléphones (iOS Safari en priorité), angles au-delà de quelques degrés, codes courbés (bouteilles), reflets. À valider sur appareil.

### J-11 Trame horaire et masquage à l'écran

- **Trame** : les entrées de la même heure (HH) sont regroupées sous un seul point « 12 h » ; l'heure exacte de consommation reste sur chaque ligne (`hourGroups`).
- **Masquage** (œil en haut à droite) : active un mode où chaque aliment a un œil ; un aliment masqué est grisé. Les jauges (kcal et macros) montrent en couleur la part des aliments visibles, puis en gris strié de blanc la part des aliments masqués (`maskedGaugeParts`, bornée à la barre). Les textes suivent les aliments visibles, avec « N kcal masquées ».
- **Affichage seulement** : état React de l'écran, jamais écrit dans le store (test statique), remis à zéro en quittant le journal. L'œil du haut reste coloré tant qu'un aliment est masqué.

### J-12 Poids d'une unité et portions

- **Ciqual** : aucun poids d'unité ni de portion dans la table 2025 (feuilles « composition nutritionnelle » et « codes INFOODS » seulement, vérifié). Pour un aliment sans aucun poids connu, l'écran de quantité demande une fois « Poids d'une unité ? » ; la valeur devient une portion personnelle « 1 unité » liée à cet aliment et est reproposée ensuite.
- **Open Food Facts** : `serving_quantity` et `product_quantity` (grammes seulement, 1 à 5 000 g ; `ml` non converti) deviennent les puces « Portion indiquée » et « Paquet entier », avec la mention « à vérifier sur le paquet » : données collaboratives de qualité variable (relevé : biscuits Prince, portion de 250 g annoncée pour un paquet de 300 g).
- Ces poids voyagent avec l'aliment (`ResolvedFood.servingGrams` / `packageGrams`, stockés dans « Mes aliments ») ; l'entrée du journal ne garde que la portion choisie, comme avant.

> Les entrées A-01 et suivantes viennent du document « Wheighty : corrections et ajouts UI » ; le point du
> document est rappelé dans le titre.

### A-01 Fond de la feuille d'ajout jusqu'au clavier (point A1, corrige J-07)

- **Constat** : clavier ouvert, une bande entre le bas de la feuille et le clavier laissait voir la page (le voile est translucide). Cause : `margin-bottom: var(--kb-inset)` remontait la feuille au-dessus du clavier ; dès que l'encart calculé dépasse la hauteur réelle du clavier (iOS Safari compte la zone derrière la barre d'URL dans `window.innerHeight`), la marge devient une bande transparente.
- **Correctif** : plus de marge. L'encart clavier est ajouté à la **hauteur** et au **remplissage bas** de la feuille : le contenu reste au-dessus du clavier, le fond continue jusqu'au bas du viewport de mise en page. Un encart trop grand ne peut plus ouvrir de bande, quel que soit le modèle de viewport (iOS ou Android) et quel que soit le thème.
- Vérifié en clavier simulé (encart exact et encart surestimé de 56 px) ; à confirmer sur iOS Safari et PWA installée.

### A-02 Œil principal et sélection masquée (point A2, corrige J-11)

- **Constat reproduit** : masquer N aliments puis toucher l'œil principal quittait le mode **sans vider la sélection**. Les aliments restaient hors des jauges (barre striée, « N kcal masquées », ligne grisée) alors que les yeux par aliment avaient disparu : plus aucun moyen de les réafficher sans quitter l'écran, et l'œil du haut affichait l'état « barré » avec `aria-pressed="false"`.
- **Règle retenue** : l'œil principal active et désactive le mode ; quitter le mode réaffiche tout et vide la sélection. Changer de jour quitte aussi le mode (les identifiants masqués appartiennent au jour choisi).
- Transitions extraites dans `src/screens/journalMask.ts` (pur, testé) : `toggleMaskMode`, `toggleMasked` (sans effet hors mode), `resetMask`. Invariant inchangé : affichage seulement, rien n'est écrit, les sorties du domaine sont strictement identiques avant et après la séquence (testé).

### A-03 Graphique de Suivi : échelle pure puis rendu canvas (point A3)

- **Diagnostic** (cas signalé : 1 pesée hier, 2 aujourd'hui, vue 3 mois) : `WeightChart` calculait un domaine X unique sur toutes les séries, projection comprise (`d0 = 0`, `d1 = 21`), donc 1 jour d'historique occupait 5 % de la largeur ; les libellés `.chart-axis` étaient un flex `space-between` à trois cellules, c'est-à-dire une **seconde échelle implicite en tiers égaux** sans rapport avec le tracé ; la projection était la trajectoire du plan **filtrée** à `jour ≥ dernier point de tendance`, donc elle démarrait sur l'échantillon hebdomadaire suivant (jour 7 pour une tendance qui s'arrête au jour 1) et à la valeur prévue par le plan, d'où le décrochage.
- **`domain/chartScale.ts`** (pur, testé, sans DOM) : mapping données → pixels. Règle horizontale retenue avec le product owner : départ à la première pesée affichée, **30 % de la largeur réservés aux jours à venir** (`FUTURE_WIDTH_SHARE`). « Aujourd'hui » est donc toujours au même endroit et les libellés reçoivent la position réelle (`todayRatio`) au lieu de la deviner. Les deux zones n'ont pas la même densité de jours : la jonction est marquée par un trait pointillé vertical. Cas dégénérés : une seule pesée sans plan → point centré ; pas de projection → l'historique prend toute la largeur. La polyligne de projection commence sur le dernier point de tendance ; la bande est coupée sur ce jour par interpolation du segment qui le traverse.
- **Projection recalculée depuis aujourd'hui** (`views.projectionFromToday`, décision du product owner). Le snapshot `plan.projection` restait figé au jour de la création du plan : au bout de 90 jours sa valeur du jour avait dérivé de 0,9 kg de la tendance réelle (falaise d'un kilo en un jour à la jonction) et son intervalle 80 %, ouvert sur 90 jours, faisait 10 kg de haut. La courbe affichée repart donc du **poids de tendance actuel**, avec la cible calorique et les pas du plan en cours et le **maintien estimé courant** (`CalibrationState.currentMaintenanceKcal`, sinon celui du plan), via `assessBaseline` + `planContextFrom` + `projectPlan`, les fonctions que le domaine appelait déjà. `science/` n'est pas modifié, aucun modèle nouveau, rien n'est stocké, `plan.projection` reste la référence du plan (testé). Jour 0 de la simulation = le dernier point de tendance, donc le raccord est exact et la bande s'ouvre à partir de là (< 0,2 kg à la jonction). Coût mesuré : 0,03 ms par appel sur un historique de 11 semaines.
- **Rien devant pendant l'apprentissage** (décision du product owner) : tant que la première calibration n'est pas atteinte (`gate.met && candidate`, le même prédicat que l'écran Analyse), aucune courbe ni bande ne sont dessinées, `projectionPending` est vrai, l'historique prend toute la largeur et une ligne grise l'explique. Avant ce seuil l'estimation de maintien est encore l'a priori de l'onboarding : une courbe donnerait une fausse impression de précision.
- **Rendu canvas** (`components/WeightChart.tsx`) : `devicePixelRatio` (plafonné à 3), couleurs lues sur les tokens (`--coral`, `--peach`, `--ink2`, `--line-strong`) et redessinées quand `data-theme` change, révélation progressive respectant `prefers-reduced-motion`, largeur suivie par `ResizeObserver`. Alternative accessible : `role="img"` + `aria-label`, plus un résumé en toutes lettres (nombre de pesées, tendance de … à …, projection à … dans N jours) en contenu de repli et en texte masqué. Aucune librairie graphique.
- **Pesées multiples le même jour** : `computeTrend` déduplique par date (dernière pesée du jour), le graphique montre donc un point pour deux pesées. Inchangé, c'est du `science/`. La liste « Dernières pesées » affiche maintenant l'heure quand le jour porte plusieurs pesées (`RecentWeight.time`, dérivé de `createdAt`, rien de persisté en plus).
````

**[lu]** `IMPLEMENTATION_NOTES.md:722-748`, B-04, B-05, B-01, B-03, C-01

````markdown
### B-04 Liste masquée en mode scan (point B4)

Caméra ouverte, seuls le cadre de visée, le champ code-barres et son message restent à l'écran : la liste « Déjà utilisés » est retirée tant que le scanner est ouvert (`!scanOpen && previous.length > 0`). Rien n'est perdu, la liste revient à la fermeture du scanner.

### B-05 Liste unique « Déjà utilisés » (point B5, remplace « Récents » + « Mes aliments » à vide)

- **Constat** : deux listes séparées montraient souvent le même aliment deux fois (l'entrée de journal et le produit enregistré automatiquement à sa récupération), avec des valeurs et des libellés différents.
- **Règle** : `domain/foodLibrary.previousFoods` fusionne les deux sources et dédoublonne sur la clé (`off:<code-barres>` pour un produit, `manual:<nom normalisé>` pour une saisie libre). **Une entrée du journal l'emporte sur sa copie enregistrée** : elle porte les valeurs et la portion réellement utilisées. Tri par dernier usage (`loggedAt` d'un côté, `lastUsedAt` de l'autre), 12 lignes au plus. Un produit enregistré sans calories reste hors de la liste : il ne peut pas être journalisé tel quel.
- Disponible hors connexion, comme les deux listes qu'elle remplace. Fusion, dédoublonnage, ordre et bornes testés.

### B-01 La barre des heures ne décale plus les aliments (point B1)

L'heure était un rail vertical de gauche (`grid-template-columns: 44px 22px 1fr` plus un trait en `::before`) : chaque aliment du journal commençait 66 px plus à droite que le reste de l'écran. L'heure devient un **en-tête au-dessus de ses aliments** (point, heure, filet horizontal) ; les aliments occupent toute la largeur, alignés sur les jauges et les titres. Le repère horaire est conservé, le retrait disparaît. Aucun changement de données : `hourGroups` est inchangé.

### B-03 Un drapeau par macro, et les chiffres marqués comme des planchers (point B3)

- **Déjà vrai avant cette passe** (relecture du code) : les kcal sont obligatoires, les macros facultatives, une macro absente est stockée à `null` et jamais à 0, et le journal signalait déjà l'incomplétude.
- **Ce qui manquait** : le signalement était global (`macrosComplete`) alors qu'une entrée peut donner les protéines sans les lipides, et les chiffres des jauges se lisaient comme des totaux exacts.
- **Règle** : `domain/journal.missingMacros` renvoie un drapeau **par macro** (`JournalDay.macrosMissing`), vrai dès qu'une entrée de l'ensemble ne donne pas cette macro. L'écran marque alors la valeur d'un `≥` (« au moins » pour les lecteurs d'écran) et ne nomme dans la phrase que les macros réellement incomplètes. `macrosComplete` reste dérivé des trois drapeaux, pour les appels existants.
- L'ensemble lu est celui **réellement sommé dans les jauges**, masquage compris (J-11) : marques et phrase restent cohérentes avec les chiffres affichés. Aucune valeur n'est inventée pour une macro absente, elle n'est simplement pas comptée.

### C-01 « J'ai mes règles » noté avec la pesée (point C1, schéma 6)

- **Champ** : `StoredWeight.menstruating`, facultatif, écrit **seulement quand il est vrai** (l'absence vaut « non noté », ce qui est la vérité de toutes les pesées antérieures à la case). `StoredWeight` = le contrat moteur `WeightEntry` plus ce qui relève du carnet ; le moteur reçoit ces objets comme des `WeightEntry` et ne regarde jamais l'extra.
- **Journal seulement** : aucune sortie scientifique ne change. Vérifié sur le chemin réel (`tests/domain/weighInNote.test.ts`) : deux parcours de 84 jours identiques à la case près donnent une tendance, un `CalibrationState` et un plan recalibré **strictement égaux**. `science/` ne contient pas le mot.
- **Case** visible seulement si le sexe physiologique du profil est féminin, décochée à chaque ouverture de la feuille, incluse dans l'export et supprimée avec les données.
- **Migration 5 → 6** : les pesées existantes sont laissées telles quelles. La montée de schéma sert à empêcher qu'un export de version 6 soit lu par une version antérieure, et à lire ici un fichier de version 5. Migration testée sur store existant et sur export/réimport ; une valeur non booléenne est refusée à l'import.
````

**[lu]** `IMPLEMENTATION_NOTES.md:758-764`, D-04 (point D4, UI) et E-01

````markdown
### D-04 Hauteur des panels stable (point D4)

Un emplacement est réservé pour tout ce qui apparaît et disparaît au fil d'une interaction, pour que la mise en page ne bouge plus sous le doigt : message de validation (`.field-error--slot`, pesée, quantité et portions, saisie libre, métabolisme mesuré), action secondaire conditionnelle (`.ghost-slot`, « Effacer la note » de la feuille d'adhérence, qui apparaît en passant à « Hier »), ligne d'état d'une caméra (`.hint-slot`), champ d'heure révélé en décochant « Je viens de le manger » (`.time-slot`). Mesuré : le bouton principal de la feuille d'ajout ne bouge pas d'un pixel quand la case change d'état ou qu'un message d'erreur s'affiche. **Non traité volontairement** : les changements d'étape (le champ « poids d'une unité » qui disparaît une fois renseigné, la carte de création de portion qui remplace son lien) ; ce sont des changements d'état voulus, pas des sauts de mise en page.

### E-01 « Vider Mes aliments » avec confirmation (point E1)

Dans « Mes données ». Périmètre annoncé et respecté : **la bibliothèque seule**. Les journées déjà enregistrées ne changent pas, chaque aliment du journal garde son propre instantané (J-09). Le nombre d'aliments enregistrés est affiché avant confirmation.
````

**[lu]** `IMPLEMENTATION_NOTES.md:770-777`, F-01

````markdown
### F-01 Accord en genre (lot F)

- **Inventaire des chaînes genrées visant l'utilisateur**, app entière et onboarding : quatre, pas davantage. 1. `OCCUPATION_LABEL.seated` = « Assis » (réponse à « Au travail, tu es surtout… », ligne « Emploi » du profil, tuile « Travail » des détails) ; 2. la case de périmètre de l'écran âge, « Je ne suis pas **enceinte** ni **allaitante**… » ; 3. et 4. « reste **attentif** à la fatigue » (Plan, Résultat). Les autres formes en apparence genrées s'accordent avec un nom, pas avec la lectrice ou le lecteur : « Ton profil sportif » (profil), « Une recalibration est prête » (recalibration), « Export prêt » (export), `PAL_CATEGORY_TITLE` « Peu active » (catégorie). `PAL_LABEL` (« inactif », « actif »…) est du code mort, non affiché : signalé sur place pour qu'il ne soit pas branché tel quel.
- **Avant que le sexe soit connu** (écran âge, qui précède l'écran sexe) : formulation épicène. La case devient « Je ne suis dans aucune de ces situations : grossesse, allaitement, trouble alimentaire, condition médicale nécessitant un suivi nutritionnel spécifique. » Les situations sont nommées comme des situations, donc rien n'a à s'accorder avec qui lit.
- **Reformulation épicène préférée à l'accord quand elle est naturelle** (règle 4) : « reste attentif à la fatigue » devient « surveille ta fatigue » aux deux endroits. Plus court, et plus rien à accorder.
- **Accord après** : `agree(sex, masculin, féminin)` dans `app/copy.ts`, une fonction, pas une couche i18n. Seul `occupationLabel` l'utilise : « Assis » / « Assise ». `OCCUPATION_LABEL` n'est plus exporté, pour qu'aucun écran ne puisse afficher la forme masculine par accident. L'écran sexe précède l'écran travail (testé), donc l'accord a toujours une valeur ; `SexForCopy` admet `null` (profil sans sexe) et retombe alors sur la forme masculine, cas qui ne doit pas se produire puisque la copie de cette phase est épicène.
- **Jamais de point médian ni de parenthèse d'accord** : un test statique refuse `·e` et `é(e)` dans l'interface, en plus des quatre formes corrigées.
- Seul ajout au view-model : `Explanation.sex`, pour que l'écran de détails puisse accorder la tuile « Travail ». Aucune valeur scientifique ne change (snapshots de référence : une ligne ajoutée, aucun nombre modifié).
````

**[lu]** `IMPLEMENTATION_NOTES.md:791-954`, Sections 5 à 11 (T-03, T-04, hypothèses, limites, vérifications, changements des modèles 1.1.0, 1.2.0, 1.3.0)

````markdown
## 5. Hypothèses des simulateurs de calibration

### T-03 Benchmark idéal (`tests/helpers/syntheticUser.ts`, `idealRecovery.ts`)

Les critères de 06 s13 dépendent du bruit simulé. Hypothèses :

- bruit de pesée Student-t à 4 degrés de liberté, échelle 0,5 kg (écart-type environ 0,71 kg), indépendant d'un jour à l'autre ;
- écarts légers de +150 à +350 kcal, notés « léger écart » ; 4 % de jours d'écart important à +700 à +1 200 kcal ;
- 20 % de jours sans adhérence notée ; pas saisis 60 % des jours, pas réels = cible × (1 + 0,2 × N(0,1)) ;
- le « monde réel » utilise le même modèle de Hall avec un maintien décalé de l'offset vrai ;
- 126 utilisateurs (7 offsets × 2 fréquences × 3 taux d'écart léger × 3 profils), simulés sur 120 jours ; **vérité = offset apparent** (D-31), offset métabolique rapporté.

Critères bloquants à 28, 42, 84 et 120 jours : erreur médiane ≤ 125 kcal/j, couverture 80 % ≥ 0,70, couverture 95 % ≥ 0,90 (`calibration.test.ts`, `calibrationLongHorizon.test.ts`).

| Horizon | Erreur médiane | Biais | Couv. 80 % | Couv. 95 % | Largeur 80 % | Contre l'offset métabolique (rapport) : erreur, biais, couv. 80 / 95 |
|---|---|---|---|---|---|---|
| 28 j | 92 | +9 | 0,91 | 0,98 | 436 | non rapporté |
| 42 j | 46 | −2 | 0,95 | 1,00 | 303 | 68, −69, 0,84 / 0,95 |
| 84 j | 30 | +4 | 0,96 | 1,00 | 178 | 60, −61, 0,67 / 0,92 |
| 120 j | 17 | 0 | 0,99 | 1,00 | 151 | 62, −66, 0,60 / 0,87 |

Limite : un simulateur fondé sur le même modèle surestime la qualité de récupération (voir T-04). Les intervalles y sont un peu conservateurs à cause du plancher structurel (D-33).

### T-04 Benchmark avec model mismatch (`tests/helpers/mismatchWorld.ts`, `mismatchBenchmark.ts`, `mismatchSuite.ts`)

Distinct du benchmark idéal. Le monde simulé ne suit pas les hypothèses de l'estimateur ; l'estimateur est utilisé tel quel. 42 utilisateurs par scénario (7 offsets × 2 fréquences × 3 profils), comportement déclaré identique à T-03 (10 % d'écarts légers), simulés sur la durée de l'horizon (42 ou 84 jours, `calibrationMismatch.part1` à `part4`). Paramètres fixés avant de regarder les résultats, non ajustés :

- **A** dérive énergétique non modélisée, linéaire jusqu'à ±100 ou ±150 kcal/j au dernier jour ;
- **B** apport caché de +200 à +500 kcal sur 15 % des jours, déclaré « plan respecté » ou non déclaré ;
- **C** biais du podomètre de ±10 ou ±15 % (moyenne d'onboarding et logs) ;
- **D** eau autocorrélée AR(1), φ = 0,7, écart-type marginal 0,5 kg, plus bruit de mesure Student-t(4) d'échelle 0,3 kg ;
- **E** épisodes hydriques de ±0,5 à 1,0 kg pendant 2 à 5 jours, démarrant environ 1 jour sur 12, sans effet énergétique ;
- **F** combinaison A + B + C + D + E.

Vérité de référence depuis 1.3.0 : **offset apparent** (offset métabolique moyen sur la fenêtre moins l'apport excédentaire moyen, D-31). L'offset métabolique moyen et celui du dernier jour sont rapportés. Critères Wheighty v1 (critères produit, pas des constantes publiées) : erreur absolue médiane ≤ 175 kcal/j, couverture 80 % ≥ 0,70, couverture 95 % ≥ 0,90.

| Scénario | 42 j : erreur, biais, couv. 80 / 95, largeur | 84 j : erreur, biais, couv. 80 / 95, largeur | Critères |
|---|---|---|---|
| A dérive | 44, +17, 0,93 / 1,00, 308 | 34, +1, 0,98 / 1,00, 177 | tous atteints |
| B apport caché | 57, +25, 0,95 / 0,98, 309 | 30, −1, 1,00 / 1,00, 177 | tous atteints |
| C biais des pas | 63, +16, 0,90 / 1,00, 299 | 30, +6, 0,98 / 1,00, 177 | tous atteints |
| D eau autocorrélée | 80, +26, 0,88 / 0,95, 305 | 34, 0, 0,79 / 1,00, 175 | tous atteints |
| E épisodes hydriques | 62, −1, 0,88 / 0,98, 307 | 26, +4, 0,88 / 0,98, 180 | tous atteints |
| F combiné | 77, +13, 0,79 / **0,88**, 314 | 44, −5, 0,81 / 1,00, 183 | couverture 95 % non atteinte à 42 j |

Rapport contre l'offset métabolique moyen (erreur et biais à 42 j, puis à 84 j) : A 52 / −45 et 59 / −61 ; B 82 / −87 et 116 / −118 ; C 84 / −50 et 66 / −59 ; D 77 / −32 et 74 / −63 ; E 79 / −64 et 52 / −57 ; F 127 / −101 et 123 / −124. Ce biais négatif est l'apport excédentaire moyen : il est attendu pour l'estimande apparent.

Avec 42 utilisateurs, l'erreur d'échantillonnage d'une couverture est d'environ ±0,06. Historique : en 1.1.0 et 1.2.0, contre l'offset métabolique et sans plancher structurel, 4 scénarios sur 6 manquaient au moins un critère de couverture à 42 jours. Causes identifiées alors et traitement en 1.3.0 :

1. **Biais négatif** (−47 à −52 kcal/j dès le monde idéal) : c'était l'apport des écarts déclarés, que le moteur suppose mangés à la cible. Absorbé par la définition de l'estimande (D-31).
2. **Apport caché (B)** : même mécanisme, sans possibilité de pondération. Même traitement.
3. **Intervalles trop étroits face au bruit autocorrélé (D)** : la vraisemblance Student-t suppose des pesées indépendantes. Traité par le plancher structurel (D-33) ; le tempérage des pesées rapprochées n'a pas été nécessaire.
4. **Biais des pas (C)** : l'écart entre pas enregistrés et pas réels change l'énergie attribuée aux variations de pas. Couvert par D-33.
5. **Combinaison (F)** : seul cas encore non atteint (couverture 95 % à 42 jours), documenté sans réglage.

Le test enregistre l'issue de chaque critère : un changement (amélioration ou dégradation) le fait échouer et oblige à mettre ce tableau à jour.

---

## 6. Hypothèses d'ingénierie et règles produit (pas des constantes publiées)

Registre complet dans `CONSTANT_METADATA`. Principales :

- routage sportif : 19 à 35 ans, ≥ 6 h et ≥ 4 séances par semaine ;
- validité de la calorimétrie : 12 mois et 5 % de variation de poids ;
- scores de qualité de composition corporelle ; seuil de désaccord REE à 10 % ;
- prior ADL = 0,20 × REE ; TEF de référence du classifieur et de la décomposition à 10 % ; distance de frontière PAL 0,05 ;
- multiplicateurs d'incertitude 1,15 (frontière PAL, métier physique, désaccord REE, cadence par défaut) ;
- posture : 0 / 18 / 54 / 54 kcal ; cadences d'allure ; cadence de course 160 pas/min ;
- poids nutritionnel de référence : IMC 25 + 0,33 de l'excédent (D-21) ; centres protéiques ; plancher de lipides 0,6 g/kg ; parts de lipides 25 à 30 % ;
- vitesses : plages 0,2 à 1,0 % (perte) et 0,1 à 0,5 % (prise), valeurs initiales 0,5 et 0,25 %, zones qualitatives, pas de 0,05 %, bornes IMC 0,25 / 0,5 / 1,0 %, seuil de prudence 0,75 % (D-22) ;
- plancher de 1 200 kcal (femmes) ou 1 500 kcal (hommes) et de 0,70 × REE (D-32) ;
- zone de maintien ; horizon de 42 jours ; tolérances du solveur ; bornes de recherche de 400 à 9 000 kcal ;
- limites du slider pas ;
- calibration : Student-t df 4, échelle 0,6 kg, grille de −1 200 à +1 200 par pas de 5 (support numérique seulement, D-28), poids d'adhérence, facteur 0,7 pour pas manquants, grille du poids de départ ±3 kg par 0,05 kg, plancher d'incertitude structurelle σ = 50 kcal/j (D-33) ;
- porte de première recalibration ; seuils de confiance ; seuils d'affichage de recalibration, dont 7 jours minimum entre deux propositions (D-34) ;
- warm start : 7 jours minimum, bornes de saisie, incertitudes d'apport 10 / 20 / 30 %, activité +200 kcal/j, plancher de modèle 100 kcal/j, borne de cohérence ±1 200 kcal/j (`product_safety_rule` à sourcer, D-28, signal sans effet numérique depuis 1.2.0), support d'évidence ±3 000 kcal/j (D-29), seuil de conflit z = 2 (statistique prédictive), confiance moyenne si largeur ≤ 75 % du prior (D-23) ;
- demi-vie de la tendance de 7 jours ; rappel de pesée tous les 3 jours ;
- part de glucides de base (D-16), plancher de masse grasse initiale de 2 %, bornes IMC 16 à 70, limite de raideur RK4 (N-01), apport de base minimal admissible de Hall 1 kcal/j (B1, D-28).

Tout changement de ces valeurs impose de monter `SCIENTIFIC_MODEL_VERSION`.

Constantes retirées parce qu'aucun code ne les lisait (sorties inchangées, pas de bump) : `SOLVER_ENERGY_RESIDUAL_KCAL` et `SOLVER_TEF_MAX_ITERATIONS` (itération TEF/macros devenue sans objet avec le TEF natif, S-01), `SLIDER_TRAJECTORY_TOLERANCE_KG` (la tolérance de 0,05 kg du slider est vérifiée directement par `goals.test.ts`).

---

## 7. Limites connues

- Le modèle de Hall est validé contre une transcription de `bw` (portage numérique), pas contre le Planner NIDDK officiel (D-02), et jamais contre des données humaines. Les simulateurs utilisent ce même modèle : ils sont optimistes par construction. La bêta ne collecte aucune donnée : cette limite reste ouverte.
- Modèle macronutriments complet de Hall 2006/2010 non porté ; la composition n'agit que par les glucides (D-01).
- La calibration estime un maintien apparent (D-31) : il inclut les écarts habituels, déclarés ou non, et ne décrit pas la physiologie d'un utilisateur qui note mal ses journées.
- Un seul offset constant sur toute la fenêtre, sans fenêtre glissante ; pour les historiques très longs ou une dérive, l'offset représente une moyenne. À réévaluer si une dérive devient visible chez les testeurs.
- À chaque replanification, le modèle de Hall repart à l'équilibre au poids actuel : l'adaptation métabolique accumulée pendant la fenêtre est effacée. Effet côté prudent (maintien légèrement surestimé, perte un peu plus lente que prévu), non traité en bêta.
- Les 4 équations NASEM sont discrètes : quelques centaines de pas peuvent déplacer le maintien initial de 150 à 370 kcal au passage d'une catégorie. L'incertitude est élargie près des frontières, la vue digeste le signale depuis 1.3.0 et la calibration corrige ensuite. Pas d'interpolation, qui s'écarterait des équations publiées.
- L'énergie des pas ignore la taille (longueur de foulée) : la cadence est fixée par allure (02 s2).
- Après la porte, une variation d'eau peut encore faire baisser la cible pendant la première semaine de calibration (parcours A, D-34) ; elle se corrige ensuite.
- Warm start : incertitudes d'apport et seuils non validés sur données réelles ; l'historique est supposé à activité et offset constants (D-23). La confiance « moyenne » est rare par construction (M-01).
- Troubles du comportement alimentaire : exclusion déclarative seulement (case à cocher), sans dépistage ni alerte de perte rapide ou de plancher répété. Mis de côté par décision produit pour la bêta.
- Les unités impériales ne concernent que l'affichage et la saisie : le stockage reste en kg et cm.
- Pas de notification système : rappel de pesée dans l'app seulement.
- Les écrans sont pensés pour le mobile ; sur desktop, l'app s'affiche dans une colonne centrée de 430 px.
- Un plan enregistré avec un modèle antérieur garde ses valeurs et sa version jusqu'à la prochaine reconstruction (changement d'objectif, profil, slider, recalibration) ; `matchesStoredPlan` signale l'écart de version.

---

## 8. Vérifications effectuées

- Passe bêta, modèle 1.3.0 : `npm run typecheck`, `npm run lint`, `npm test` (30 fichiers, 363 tests), `npm run build`. Optimisation de `fitCalibration` comparée au bit près à 1.2.0 sur 79 historiques (P-01). Benchmarks T-03 et T-04 réenregistrés, parcours de convergence ajouté. Golden : seuls les planchers masculins changent (D-32). Cas de référence R et S du warm start : seule la version du modèle change dans leur snapshot.
- `npm run typecheck`, `npm run lint`, `npm test` (25 fichiers, 312 tests), `npm run build`.
- Panneau « Pourquoi ce résultat ? » (D-30) : captures des deux modes sur les cas R et S, métrique et impérial, clair et sombre, viewport mobile 375 px (Edge headless) ; aucune sortie scientifique modifiée.
- Modèle 1.2.0 (D-29) : golden, T-03 et T-04 identiques au bit près à 1.1.0 ; deltas des cas R, S, D-23 et aberrants, balayages et benchmark de couverture rejoués (D-29).
- Correctif neutre du warm start (D-28) : capture avant/après comparée au bit près (golden, T-03, T-04, panneau des cas A et B, balayages, matrice de stress), aucune différence.
- Navigateur (serveur de dev, viewport mobile 375 × 812), passe UX v2 : intro descendue et titres en Bricolage Grotesque ; écran prénom / nom ; âge vide avec placeholder 22, premier + à 22 puis 24 ; composition corporelle (« Ignorer » seul, « Continuer » avec DXA, masqué à la désactivation) ; activités sans randonnée ; « Non » par défaut et « Facultatif » secondaire ; historique à champ de jours unique et poids de départ vide ; maintien sans cible ni vitesse ; vitesse 1,0 % ; Point de départ sans scroll (1 440 kcal, 7 000 pas, maintien 2 110) ; « Pourquoi ce résultat ? » digeste, puis détails après activation et rechargement (recalcul identique au plan enregistré) ; avatar « LT » ; Analyse avec 4 critères et sans « Ajouter une pesée » ; Plan sans projection. Nom, évidence et préférence persistés. Aucune erreur console.
- Navigateur (serveur de dev, viewport mobile), passe 1.1.0 : splash sans points ; profil (âge 22 stocké, + et − synchronisés avec la valeur affichée, Homme présélectionné, placeholders gris non enregistrés, bloc de sécurité à 10,5 px en `--ink2`) ; activité (sous-texte retiré, Assis présélectionné, puce « Randonnée / marche sportive », pas de « Marche ») ; historique (apparition progressive, poids du jour prérempli, 28 jours ajustables) ; objectif (0,5 % ≈ 0,34 kg / sem. pour 68 kg, borne 0,5 % imposée par l'IMC et non franchissable au clavier, zones qualitatives) ; résultat avec warm start (maintien personnalisé, fourchette plus étroite, confiance « Moyenne », provenance dans le résultat et dans « Comment c'est calculé ? ») ; persistance en schéma 2 avec l'évidence et le snapshot `warm_start`, rechargement ; écran Plan (vitesse en %) ; feuille d'objectif (plage de prise 0,1 à 0,5 %, pas de slider en maintien). Aucune erreur console.
- Passe 1.0.0 (inchangé) : onboarding complet, recalibration appliquée, Suivi, Projection, Profil, mode sombre, build sous `/wheighty/` avec service worker et fonctionnement hors ligne.

---

## 9. Changements du modèle 1.1.0 par rapport à 1.0.0

| Domaine | 1.0.0 | 1.1.0 |
|---|---|---|
| TEF dans Hall | TEF par macro greffé (`macro_specific`) | TEF natif β = 0,10 uniquement (D-01) |
| Poids de référence | marche à IMC 30 | continu, IMC 25 + 0,33 × excédent (D-21) |
| Vitesse | 3 presets | slider continu en % du poids, borné par le moteur (D-22) |
| Démarrage | prior populationnel seul | warm start facultatif depuis l'historique (D-23) |
| Calibration | inchangée | log-vraisemblance historique ajoutée si warm start ; sous-pas RK4 si raide (N-01) |
| Validation | benchmark idéal à 28 j | idéal à 28 et 42 j + benchmark model mismatch (T-04) |
| Schéma | 1 | 2 (vitesse continue, évidence historique), migration testée |
| Onboarding | presets, âge et sexe sans valeur réelle | un écran par information, âge vide à placeholder, noms locaux (D-24) |
| Explication | « Comment c'est calculé ? » générique | « Pourquoi ce résultat ? » personnalisé, détails scientifiques réels (D-25, sans effet sur le calcul) |

Profils golden modifiés (tous les 12) : calories de −10,5 à +52,5 kcal/j (01 +2 ; 02 +52 ; 03 −10 ; 04 +30 ; 05 +10 ; 06 +17 ; 07 +22 ; 08 +35 ; 09 +6 ; 10 +45 ; 11 +26 ; 12 −1) ; protéines changées pour 05 (105 → 120 g), 06 (124 → 142 g) et 08 (98 → 94 g) ; jours jusqu'à la cible : 03 178 → 180, 05 377 → 381, 06 200 → 201, 12 390 → 391 ; champ `appliedSpeed` remplacé par `rateAdjusted`. Les vitesses des profils golden reprennent exactement les anciens presets.

---

## 10. Changements du modèle 1.2.0 par rapport à 1.1.0

| Domaine | 1.1.0 | 1.2.0 |
|---|---|---|
| Flag `incoherent` | offset linéarisé hors ±1 200, écart-type de la vraisemblance × 2 | racine exacte hors ±1 200, signal sans effet numérique (D-29) |
| z de conflit | offset linéarisé / √(σ_historique² + σ_prior²) | statistique prédictive du prior sur la distribution exacte, seuil 2 inchangé |
| « Historique seul » | grille de calibration ±1 200, tronquée | support d'évidence ±3 000 borné par le domaine de Hall |
| Posterior fusionné, handoff calibration | grille de calibration | inchangés (grille), identiques sauf historiques anciennement incohérents |
| Constantes | `WARM_START_INCOHERENT_SIGMA_MULTIPLIER = 2` | supprimée ; `WARM_START_EVIDENCE_SUPPORT_HALF_WIDTH_KCAL = 3000` ajoutée |
| Golden, T-03, T-04 | | identiques au bit près |

---

## 11. Changements du modèle 1.3.0 par rapport à 1.2.0 (passe bêta)

| Domaine | 1.2.0 | 1.3.0 |
|---|---|---|
| Estimande de la calibration | implicite (« maintien ») | maintien apparent, défini et affiché (D-31) |
| Plancher calorique | max(1 200, 0,7 × REE) | max(1 200 femmes ou 1 500 hommes, 0,7 × REE) (D-32) |
| Posterior de calibration | grille, sans erreur de modèle | convolué avec N(0, 50 kcal/j) (D-33) |
| Recalibrations proposées | critères 05 s12 seuls | au plus une par 7 jours (D-34) |
| Calcul | fil principal, 830 ms à 365 pesées | Web Worker, 350 ms, sorties identiques (P-01) |
| Vue digeste | | définition du maintien, note de frontière PAL |
| Confiance du warm start | règle relative à réarbitrer | mesurée et conservée (M-01) |
| Benchmarks | T-03 à 28 et 42 j, T-04 à 42 j, vérité métabolique | T-03 à 28, 42, 84 et 120 j ; T-04 à 42 et 84 j ; vérité apparente ; parcours de convergence |
| Constantes | `ABSOLUTE_MIN_CALORIES` | `ABSOLUTE_MIN_CALORIES_FEMALE`, `ABSOLUTE_MIN_CALORIES_MALE`, `CALIBRATION_STRUCTURAL_SD_KCAL`, `RECAL_SURFACE_MIN_INTERVAL_DAYS` |
| Schéma | 2 | 2 (inchangé) |
````

### 1.4 Historique de `SCIENTIFIC_MODEL_VERSION`, de 1.1.0 à 1.3.0

**Git.** **[lu]** Aucun commit du dépôt ne contient de bump.
- `git log --all -S "SCIENTIFIC_MODEL_VERSION = '" -- src/science/constants.ts` ne renvoie qu'un commit : `877e302 2026-09-15 23:07:30 +0200 first push`, où la valeur vaut déjà `'1.3.0'`.
- Le commit précédent, `428919e` (Initial commit), ne contient que `README.md`.
- `IMPLEMENTATION_NOTES.md:48` cite le commit `37fa35d`. `git cat-file -t 37fa35d` renvoie `fatal: Not a valid object name 37fa35d`.
- Les commits et les dates des bumps sont donc **non trouvés** dans ce dépôt.

| Bump | Commit | Date | Raison documentée |
|---|---|---|---|
| 1.0.0 → 1.1.0 | non trouvé | non documentée | citations ci-dessous (en-têtes de D-01, D-21, D-22, D-23, N-01 et section 9) |
| 1.1.0 → 1.2.0 | non trouvé | non documentée | citation D-29 ci-dessous |
| 1.2.0 → 1.3.0 | non trouvé | non documentée | citations de l'en-tête et de la section 11 ci-dessous |

**1.1.0.** **[lu]** `IMPLEMENTATION_NOTES.md:8`

````markdown
Depuis la passe « science + onboarding + warm start » (modèle 1.1.0), les fichiers `instruct/` ont été mis à jour pour refléter les décisions finales ; ils ne contredisent plus ces notes (`instruct/05` s17 et `instruct/08` réalignés sur le modèle 1.2.0 en P3, D-30). La section 9 résume ce qui a changé par rapport au modèle 1.0.0, la section 10 par rapport au modèle 1.1.0, la section 11 par rapport au modèle 1.2.0 (passe bêta).
````

**[lu]** `IMPLEMENTATION_NOTES.md:909-923` (section 9)

````markdown
## 9. Changements du modèle 1.1.0 par rapport à 1.0.0

| Domaine | 1.0.0 | 1.1.0 |
|---|---|---|
| TEF dans Hall | TEF par macro greffé (`macro_specific`) | TEF natif β = 0,10 uniquement (D-01) |
| Poids de référence | marche à IMC 30 | continu, IMC 25 + 0,33 × excédent (D-21) |
| Vitesse | 3 presets | slider continu en % du poids, borné par le moteur (D-22) |
| Démarrage | prior populationnel seul | warm start facultatif depuis l'historique (D-23) |
| Calibration | inchangée | log-vraisemblance historique ajoutée si warm start ; sous-pas RK4 si raide (N-01) |
| Validation | benchmark idéal à 28 j | idéal à 28 et 42 j + benchmark model mismatch (T-04) |
| Schéma | 1 | 2 (vitesse continue, évidence historique), migration testée |
| Onboarding | presets, âge et sexe sans valeur réelle | un écran par information, âge vide à placeholder, noms locaux (D-24) |
| Explication | « Comment c'est calculé ? » générique | « Pourquoi ce résultat ? » personnalisé, détails scientifiques réels (D-25, sans effet sur le calcul) |

Profils golden modifiés (tous les 12) : calories de −10,5 à +52,5 kcal/j (01 +2 ; 02 +52 ; 03 −10 ; 04 +30 ; 05 +10 ; 06 +17 ; 07 +22 ; 08 +35 ; 09 +6 ; 10 +45 ; 11 +26 ; 12 −1) ; protéines changées pour 05 (105 → 120 g), 06 (124 → 142 g) et 08 (98 → 94 g) ; jours jusqu'à la cible : 03 178 → 180, 05 377 → 381, 06 200 → 201, 12 390 → 391 ; champ `appliedSpeed` remplacé par `rateAdjusted`. Les vitesses des profils golden reprennent exactement les anciens presets.
````

**1.2.0.** **[lu]** `IMPLEMENTATION_NOTES.md:376`

````markdown
Arbitrée dans `22_P2_REGLES_EXACTES_WARMSTART.md` (handoff), sur la base de l'audit 15 et des mesures P0 (`20_`). Bump `SCIENTIFIC_MODEL_VERSION` 1.1.0 → **1.2.0**. `SCHEMA_VERSION` inchangé : l'évidence reste stockée brute (`evidenceVersion: 1`) et la vraisemblance est recalculée.
````

**[lu]** `IMPLEMENTATION_NOTES.md:927-936` (section 10)

````markdown
## 10. Changements du modèle 1.2.0 par rapport à 1.1.0

| Domaine | 1.1.0 | 1.2.0 |
|---|---|---|
| Flag `incoherent` | offset linéarisé hors ±1 200, écart-type de la vraisemblance × 2 | racine exacte hors ±1 200, signal sans effet numérique (D-29) |
| z de conflit | offset linéarisé / √(σ_historique² + σ_prior²) | statistique prédictive du prior sur la distribution exacte, seuil 2 inchangé |
| « Historique seul » | grille de calibration ±1 200, tronquée | support d'évidence ±3 000 borné par le domaine de Hall |
| Posterior fusionné, handoff calibration | grille de calibration | inchangés (grille), identiques sauf historiques anciennement incohérents |
| Constantes | `WARM_START_INCOHERENT_SIGMA_MULTIPLIER = 2` | supprimée ; `WARM_START_EVIDENCE_SUPPORT_HALF_WIDTH_KCAL = 3000` ajoutée |
| Golden, T-03, T-04 | | identiques au bit près |
````

**1.3.0.** **[lu]** `IMPLEMENTATION_NOTES.md:5`

````markdown
- Modèle scientifique : `SCIENTIFIC_MODEL_VERSION = "1.3.0"` (`src/science/constants.ts`) : maintien apparent comme estimande (D-31), plancher calorique sexué (D-32), plancher d'incertitude structurelle de la calibration (D-33), recalibrations espacées d'au moins 7 jours (D-34), calibration hors du fil principal (P-01)
````

**[lu]** `IMPLEMENTATION_NOTES.md:940-953` (section 11)

````markdown
## 11. Changements du modèle 1.3.0 par rapport à 1.2.0 (passe bêta)

| Domaine | 1.2.0 | 1.3.0 |
|---|---|---|
| Estimande de la calibration | implicite (« maintien ») | maintien apparent, défini et affiché (D-31) |
| Plancher calorique | max(1 200, 0,7 × REE) | max(1 200 femmes ou 1 500 hommes, 0,7 × REE) (D-32) |
| Posterior de calibration | grille, sans erreur de modèle | convolué avec N(0, 50 kcal/j) (D-33) |
| Recalibrations proposées | critères 05 s12 seuls | au plus une par 7 jours (D-34) |
| Calcul | fil principal, 830 ms à 365 pesées | Web Worker, 350 ms, sorties identiques (P-01) |
| Vue digeste | | définition du maintien, note de frontière PAL |
| Confiance du warm start | règle relative à réarbitrer | mesurée et conservée (M-01) |
| Benchmarks | T-03 à 28 et 42 j, T-04 à 42 j, vérité métabolique | T-03 à 28, 42, 84 et 120 j ; T-04 à 42 et 84 j ; vérité apparente ; parcours de convergence |
| Constantes | `ABSOLUTE_MIN_CALORIES` | `ABSOLUTE_MIN_CALORIES_FEMALE`, `ABSOLUTE_MIN_CALORIES_MALE`, `CALIBRATION_STRUCTURAL_SD_KCAL`, `RECAL_SURFACE_MIN_INTERVAL_DAYS` |
| Schéma | 2 | 2 (inchangé) |
````

**[lu]** Règle de bump, `IMPLEMENTATION_NOTES.md:871` et `src/science/constants.ts:8-9`

````markdown
Tout changement de ces valeurs impose de monter `SCIENTIFIC_MODEL_VERSION`.
````

```ts
 * Changing any engineering_prior, product_safety_rule or
 * statistical_robustness_parameter requires a SCIENTIFIC_MODEL_VERSION bump.
```

---

## 2. Contrat d'entrée de la calibration

### 2.1 Signature et appelants

**Signature.** **[lu]** `src/science/calibration.ts:292`

```ts
export function fitCalibration(input: CalibrationInput): CalibrationFit | null {
```

**[lu]** Paramètre, `src/science/calibration.ts:67-92`

```ts
export type CalibrationInput = {
  sex: SexForEquation;
  ageYears: number;
  heightCm: number;
  walkingPace: WalkingPace;
  /** Population (NASEM) TDEE for the window-start weight, kcal/day. */
  populationTdeeAtStartKcal: number;
  /** REE for the window-start weight, kcal/day. */
  reeAtStartKcal: number;
  /** Steps represented inside the population TDEE. */
  maintenanceStepsPerDay: number;
  /** Measured initial fat mass for the Hall model (high-quality methods only). */
  initialFatKg?: number | undefined;
  priorSigmaKcal: number;
  /** Carbohydrate share of the Hall baseline diet (same rule as planning, D-16). */
  baselineCarbFraction: number;
  weights: readonly WeightEntry[];
  dailyLogs: readonly DailyLog[];
  /**
   * Optional log-likelihood of historical intake evidence, aligned with offsetGrid() (warm start, D-23).
   * Added to the population prior; never a second prior on the weigh-ins.
   */
  historicalLogLikelihood?: readonly number[] | undefined;
  /** Benchmarks and tests only: overrides CALIBRATION_STRUCTURAL_SD_KCAL (D-33). */
  structuralSdKcal?: number | undefined;
};
```

**[lu]** Retour, `src/science/calibration.ts:271-284` et `246-254`

```ts
export type CalibrationFit = {
  posterior: Posterior;
  startDate: string;
  endDate: string;
  observationSpanDays: number;
  validWeightCount: number;
  observationWeights: number[];
  /** Grid offsets excluded because NASEM + offset is outside the Hall admissible domain (D-28). */
  excludedOffsetCount: number;
  /** Posterior before the structural uncertainty floor (weigh-in and prior information only). */
  informationPosterior: Posterior;
  /** SD of the structural model error convolved into the posterior, kcal/day (D-33). */
  structuralSdKcal: number;
};
```

```ts
export type Posterior = {
  offsetsKcal: number[];
  probabilities: number[];
  meanKcal: number;
  medianKcal: number;
  interval80: Interval;
  interval95: Interval;
  sdKcal: number;
};
```

**[lu]** Types référencés, `src/science/types.ts:6`, `25`, `107`, `111`, `113-117`, `119-126`, `128-141`

```ts
export type SexForEquation = 'female' | 'male';
export type WalkingPace = 'slow' | 'normal' | 'brisk';
export type Adherence = 'on_plan' | 'minor_deviation' | 'major_deviation' | 'unknown';
export type Interval = readonly [number, number];
export type MacroGrams = {
  proteinG: number;
  carbsG: number;
  fatG: number;
};
export type WeightEntry = {
  id: string;
  /** ISO local date YYYY-MM-DD */
  date: string;
  weightKg: number;
  /** ISO timestamp */
  createdAt: string;
};
export type DailyLog = {
  /** ISO local date YYYY-MM-DD */
  date: string;
  actualSteps?: number;
  adherence?: 'on_plan' | 'minor_deviation' | 'major_deviation';
  calorieTargetForDay: number;
  stepTargetForDay: number;
  /**
   * Extension to the 07 data contract (IMPLEMENTATION_NOTES D-13): macro targets
   * in force that day, so historical TEF can be reconstructed without using
   * today's plan.
   */
  macrosForDay?: MacroGrams;
};
```

**Appelants en production.** **[lu]** `grep -rn "fitCalibration" src` : un seul appel, dans `src/domain/engine.ts:649`. `computeCalibrationState` est appelé par le worker et par le repli synchrone, jamais directement par `StoreProvider` (test `tests/policy/static.test.ts:136`).

**[lu]** Domaine, `src/domain/engine.ts:643-650`

```ts
export function computeCalibrationState(store: WheightyStore, today: string, nowIso: string): CalibrationState | null {
  const plan = store.plan;
  const profile = store.profile;
  if (!plan || !profile) return null;
  const gate = evaluateGate(store.weights, store.dailyLogs);
  const input = calibrationInputFromStore(store, today);
  const fit = input && gate.weighInCount >= 2 ? fitCalibration(input) : null;
  const candidate = fit && input ? buildSnapshot(fit, gate, input.populationTdeeAtStartKcal, nowIso) : null;
```

**[lu]** Construction de l'argument, `src/domain/engine.ts:614-641`

```ts
export function calibrationInputFromStore(store: WheightyStore, today: string): CalibrationInput | null {
  const profile = store.profile;
  if (!profile || store.weights.length === 0) return null;
  const sorted = [...store.weights].sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = sorted[0];
  if (!first) return null;
  const palCategory = store.meta.initialPalCategory ?? store.plan?.palCategory;
  const assessment = assessBaseline(profile, today, { weightKg: first.weightKg, ...(palCategory ? { palCategory } : {}) });
  const context = planContextFrom(profile, { ...assessment }, assessment.populationTdeeKcal);
  const hq = profile.bodyFatMethod !== undefined && profile.bodyFatPercent !== undefined && BODY_FAT_QUALITY[profile.bodyFatMethod] >= HALL_BODY_FAT_MIN_QUALITY;
  const history = storedWarmStart(store);
  return {
    sex: profile.sexForEquation,
    ageYears: profile.ageYears,
    heightCm: profile.heightCm,
    walkingPace: profile.walkingPace,
    populationTdeeAtStartKcal: assessment.populationTdeeKcal,
    reeAtStartKcal: assessment.ree.reeKcalDay,
    maintenanceStepsPerDay: profile.averageSteps7d,
    ...(hq ? { initialFatKg: (first.weightKg * (profile.bodyFatPercent as number)) / 100 } : {}),
    priorSigmaKcal: assessment.sigma.sigmaKcal,
    baselineCarbFraction: baselineCarbFractionFor(context, store.plan?.goal ?? profile.goal),
    weights: store.weights,
    dailyLogs: store.dailyLogs,
    // Warm start evidence (history before onboarding) keeps informing the posterior (D-23).
    ...(history?.likelihood.logLikelihood ? { historicalLogLikelihood: history.likelihood.logLikelihood } : {}),
  };
}
```

**[lu]** `storedWarmStart`, `src/domain/engine.ts:271-275`

```ts
/** Warm start of the stored evidence (evaluated as of its onboarding day), null when the user gave no history. */
export function storedWarmStart(store: WheightyStore): WarmStartResult | null {
  if (!store.profile || !store.historicalEvidence) return null;
  return warmStartFor(store.profile, store.historicalEvidence, store.historicalEvidence.recordedOn, store.meta.initialPalCategory);
}
```

**[lu]** `baselineCarbFractionFor`, `src/science/goals.ts:113-122`

```ts
/**
 * Carbohydrate energy share of the plan diet at maintenance calories. Used as the Hall
 * baseline diet so that adopting the recommended macro split is not misread as a glycogen
 * and water shift (IMPLEMENTATION_NOTES D-16).
 */
export function baselineCarbFractionFor(ctx: PlanContext, goal: Goal): number {
  const m = macrosFor(ctx, goal, ctx.maintenanceKcal);
  const fraction = (Math.max(0, m.exact.carbsG) * KCAL_PER_G_CARB) / ctx.maintenanceKcal;
  return fraction > 0 ? fraction : HALL_BASELINE_CARB_FRACTION;
}
```

**[lu]** Worker, `src/store/calibration.worker.ts:10-17`

```ts
scope.onmessage = (event) => {
  const { id, store, today, nowIso } = event.data;
  try {
    scope.postMessage({ id, ok: true, state: computeCalibrationState(store, today, nowIso) });
  } catch (error) {
    scope.postMessage({ id, ok: false, message: error instanceof Error ? error.message : String(error) });
  }
};
```

**[lu]** Choix du worker ou du repli synchrone, `src/store/calibrationClient.ts:34-64`

```ts
    worker = new Worker(new URL('./calibration.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return synchronousRunner();
  }
  let listener: ((response: CalibrationResponse) => void) | null = null;
  worker.onmessage = (event: MessageEvent<CalibrationResponse>) => listener?.(event.data);
  return {
    run: (request, onResult) => {
      listener = onResult;
      worker.postMessage(request);
    },
    dispose: () => worker.terminate(),
  };
}

/**
 * Cheap fingerprint of every store field the calibration state depends on (FNV-1a over a compact serialisation),
 * instead of stringifying the whole daily log on each render.
 */
export function calibrationFingerprint(store: WheightyStore, today: string): string {
  let h = 0x811c9dc5;
  const feed = (value: string | number | undefined | null) => {
    const s = value === undefined || value === null ? '~' : String(value);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x7c;
    h = Math.imul(h, 0x01000193);
  };
  feed(today);
```

**[lu]** Envoi depuis le store, `src/store/StoreProvider.tsx:86-87` et `99-113`

```tsx
  const needsCalibration = store.plan !== null && store.profile !== null;
  const calibrationKey = needsCalibration ? calibrationFingerprint(store, today) : 'none';
```

```tsx
  useEffect(() => {
    if (!needsCalibration) return;
    const id = ++requestId.current;
    const timer = window.setTimeout(() => {
      // The food journal never reaches the engine (J-01): it is removed before the store is sent.
      const engineStore = { ...latestStore.current, foodJournal: emptyFoodJournal() };
      runner.current?.run({ id, store: engineStore, today, nowIso: new Date().toISOString() }, (response) => {
        // Answers to an older store are ignored: only the latest request may update the state.
        if (response.id !== requestId.current) return;
        if (response.ok) setCalibration({ key: calibrationKey, state: response.state });
        else console.error('Calibration failed:', response.message);
      });
    }, CALIBRATION_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [calibrationKey, needsCalibration, today]);
```

**[déduit] Origine de chaque champ de l'argument en production** (`engine.ts:614-641`) :

| Champ | Origine |
|---|---|
| `sex`, `ageYears`, `heightCm`, `walkingPace` | profil **courant** (`626-629`) |
| `populationTdeeAtStartKcal`, `reeAtStartKcal`, `priorSigmaKcal` | `assessBaseline` au poids de `sorted[0]`, première pesée brute triée par date (`617-621`, `630-634`), avec la catégorie PAL `meta.initialPalCategory ?? plan.palCategory` (`620`) |
| `maintenanceStepsPerDay` | `profile.averageSteps7d` du profil courant (`632`), pas `plan.maintenanceStepsPerDay` |
| `initialFatKg` | seulement si la méthode a une qualité ≥ `HALL_BODY_FAT_MIN_QUALITY` (0,85), calculé sur `first.weightKg` (`623`, `633`) |
| `baselineCarbFraction` | part glucidique des macros de l'**objectif** (`store.plan?.goal ?? profile.goal`), évaluées aux calories de maintien de `context`, soit le NASEM à la première pesée, sans offset (`622`, `635` ; `goals.ts:118-122`) |
| `weights` | `store.weights` en entier, brut (`636`) ; déduplication et bornes appliquées dans `fitCalibration` |
| `dailyLogs` | `store.dailyLogs` en entier (`637`) |
| `historicalLogLikelihood` | vraisemblance du warm start stocké, seulement si elle est non nulle (`639`) |
| `structuralSdKcal` | jamais fourni en production : la valeur par défaut `CALIBRATION_STRUCTURAL_SD_KCAL` s'applique (`calibration.ts:409`) |

**Appelants dans les tests.** **[lu]** `grep -rn "fitCalibration\|computeCalibrationState" tests` :
- `computeCalibrationState` : `tests/domain/engine.test.ts:96,111,125`, `foodJournal.test.ts:186`, `trackingChart.test.ts:43,149`, `warmStart.test.ts:177,197`, `warmStartReferenceCases.test.ts:110`, `weighInNote.test.ts:55,56,62,63`, `tests/helpers/convergenceJourney.ts:99`.
- `fitCalibration` : `tests/domain/warmStart.test.ts:206`, `tests/helpers/idealRecovery.ts:48`, `intakeLoggingExperiment.ts:76`, `jointBiasExperiment.ts:121`, `mismatchBenchmark.ts:114`, `tests/science/calibration.test.ts:159,160,170,171,173`, `calibrationPerf.test.ts:24,31`, `intakeLoggingModel.test.ts:103`, `jointBiasModel.test.ts:22,30`, `warmStartDomain.test.ts:36-38,93,95`.
- Dans les harnais de benchmark, l'argument est construit par `run.calibrationInputFor(days)` (`tests/helpers/mismatchWorld.ts:176-187`), non par le domaine.

**Déclencheur.** **[lu]** Empreinte `calibrationFingerprint`, `src/store/calibrationClient.ts:53-86`

```ts
export function calibrationFingerprint(store: WheightyStore, today: string): string {
  let h = 0x811c9dc5;
  const feed = (value: string | number | undefined | null) => {
    const s = value === undefined || value === null ? '~' : String(value);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x7c;
    h = Math.imul(h, 0x01000193);
  };
  feed(today);
  for (const w of store.weights) {
    feed(w.id);
    feed(w.date);
    feed(w.weightKg);
    feed(w.createdAt);
  }
  for (const l of store.dailyLogs) {
    feed(l.date);
    feed(l.adherence);
    feed(l.actualSteps);
    feed(l.calorieTargetForDay);
    feed(l.stepTargetForDay);
    feed(l.macrosForDay?.carbsG);
  }
  feed(JSON.stringify(store.profile));
  feed(JSON.stringify(store.plan ? { createdAt: store.plan.createdAt, maintenanceKcal: store.plan.maintenanceKcal, interval: store.plan.maintenanceInterval80, goal: store.plan.goal, palCategory: store.plan.palCategory } : null));
  feed(JSON.stringify(store.meta.lastSurfacedCalibration));
  feed(store.meta.initialPalCategory);
  feed(JSON.stringify(store.historicalEvidence));
  for (const s of store.calibrationSnapshots) feed(`${s.createdAt}|${s.appliedAt ?? ''}|${s.confidence}`);
  return `${store.weights.length}:${store.dailyLogs.length}:${(h >>> 0).toString(36)}`;
}
```

**[lu]** Création des logs au chargement et au changement de jour, `src/store/StoreProvider.tsx:53` et `70-72`

```tsx
  const [store, setStore] = useState<WheightyStore>(() => (initial.store.plan ? ensureDailyLogs(initial.store, localIsoDate(new Date())) : initial.store));
```

```tsx
  useEffect(() => {
    setStore((s) => (s.plan ? ensureDailyLogs(s, today) : s));
  }, [today]);
```

**[déduit]** La calibration **ne dépend pas d'un événement « pesée »**. Elle est relancée, avec un anti-rebond de 300 ms, dès que l'une de ces valeurs change (`StoreProvider.tsx:99-113`, dépendances `[calibrationKey, needsCalibration, today]`) :
- l'empreinte : pesées (id, date, poids, `createdAt`) ; logs (date, adhérence, pas réels, cible kcal, cible pas, glucides) ; profil ; sous-ensemble du plan ; `meta.lastSurfacedCalibration` ; `meta.initialPalCategory` ; évidence historique ; snapshots ; `today` ;
- `needsCalibration` (plan et profil présents) ;
- `today`.

En pratique : au montage, donc à l'ouverture de l'app (un effet s'exécute au montage) ; à chaque pesée ajoutée ou supprimée ; à chaque adhérence ou pas saisis ; à chaque création de log par `ensureDailyLogs` ; au changement de jour (`useToday` : intervalle de 60 s et `visibilitychange`, `StoreProvider.tsx:35-47`) ; à chaque changement de plan, de profil, de snapshot ou de proposition vue. Cela correspond à `instruct/05_CALIBRATION_UNCERTAINTY.md:355` : « The internal posterior can update whenever a new valid weigh-in is saved. »

**Fenêtre de données.** **[lu]** `src/science/calibration.ts:293-302`, `104-106`, et `src/science/trend.ts:12-19`

```ts
  const weights = validWeights(input.weights);
  const first = weights[0];
  const last = weights[weights.length - 1];
  if (!first || !last || weights.length < 2) return null;
  const startDate = first.date;
  const endDate = last.date;
  const spanDays = daysBetween(startDate, endDate);
  if (spanDays <= 0) return null;

  const days = reconstructDays(input, startDate, spanDays);
```

```ts
export function validWeights(weights: readonly WeightEntry[]): WeightEntry[] {
  return dedupeWeightsByDate(weights).filter((w) => Number.isFinite(w.weightKg) && w.weightKg >= WEIGHT_MIN_KG && w.weightKg <= WEIGHT_MAX_KG);
}
```

```ts
export function dedupeWeightsByDate(weights: readonly WeightEntry[]): WeightEntry[] {
  const byDate = new Map<string, WeightEntry>();
  for (const w of weights) {
    const existing = byDate.get(w.date);
    if (!existing || existing.createdAt <= w.createdAt) byDate.set(w.date, w);
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
```

**[déduit]** La fenêtre va de la **première** à la **dernière** pesée valide de tout l'historique : une pesée par date (la plus récente par `createdAt`), avec un poids compris entre 35 et 300 kg. Il n'y a ni fenêtre glissante ni départ au plan en cours. Le Hall est simulé du jour 0 au jour `spanDays`, et l'apport du jour de la dernière pesée n'entre pas (`calibration.ts:368-375`). La première pesée est celle de l'onboarding (`engine.ts:315-322`), sauf si des pesées sont datées plus tôt.

**[lu]** `IMPLEMENTATION_NOTES.md:882`

````markdown
- Un seul offset constant sur toute la fenêtre, sans fenêtre glissante ; pour les historiques très longs ou une dérive, l'offset représente une moyenne. À réévaluer si une dérive devient visible chez les testeurs.
````

### 2.2 Apport supposé par jour

**Source de l'apport.** **[lu]** `src/science/calibration.ts:108-141`

```ts
function logForDate(logs: readonly DailyLog[], sortedLogs: readonly DailyLog[], date: string): { log: DailyLog | undefined; fallback: DailyLog | undefined } {
  const exact = logs.find((l) => l.date === date);
  if (exact) return { log: exact, fallback: exact };
  // Nearest earlier log carries the plan in force; else the earliest later one.
  let fallback: DailyLog | undefined;
  for (const l of sortedLogs) {
    if (l.date <= date) fallback = l;
    else break;
  }
  return { log: undefined, fallback: fallback ?? sortedLogs[0] };
}

/** Day-level reconstruction of intake, activity and evidence weight (05 s6-s7). */
export function reconstructDays(input: Pick<CalibrationInput, 'dailyLogs' | 'populationTdeeAtStartKcal' | 'maintenanceStepsPerDay' | 'baselineCarbFraction'>, startDate: string, dayCount: number): ReconstructedDay[] {
  const sortedLogs = [...input.dailyLogs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const days: ReconstructedDay[] = [];
  for (let d = 0; d < dayCount; d++) {
    const date = addDays(startDate, d);
    const { log, fallback } = logForDate(input.dailyLogs, sortedLogs, date);
    const source = log ?? fallback;
    const intakeKcal = source?.calorieTargetForDay ?? input.populationTdeeAtStartKcal;
    const macros = source?.macrosForDay;
    // Macros only set the carbohydrate intake (glycogen); TEF is the Hall model's native term (D-01).
    // Without stored macros the day keeps the baseline carbohydrate share.
    const carbFraction = input.baselineCarbFraction > 0 ? input.baselineCarbFraction : HALL_BASELINE_CARB_FRACTION;
    const carbKcal = macros ? Math.max(0, macros.carbsG) * KCAL_PER_G_CARB : carbFraction * intakeKcal;
    const stepsLogged = log?.actualSteps !== undefined;
    const steps = log?.actualSteps ?? source?.stepTargetForDay ?? input.maintenanceStepsPerDay;
    const adherence: Adherence = log?.adherence ?? 'unknown';
    const weight = ADHERENCE_WEIGHTS[adherence] * (stepsLogged ? 1 : MISSING_STEPS_WEIGHT_FACTOR);
    days.push({ date, intakeKcal, carbKcal, steps, stepsLogged, adherence, weight });
  }
  return days;
}
```

**[lu]** Passage à Hall, `src/science/calibration.ts:315-323`

```ts
  const hallInputs: HallDailyInput[] = days.map((day) => ({
    intakeKcal: day.intakeKcal,
    carbKcal: day.carbKcal,
    sodiumDeltaMg: 0,
    paDeltaKcalPerKgDay:
      (netStepKcal({ steps: day.steps, pace: input.walkingPace, weightKg: w0, ageYears: input.ageYears }) -
        netStepKcal({ steps: input.maintenanceStepsPerDay, pace: input.walkingPace, weightKg: w0, ageYears: input.ageYears })) /
      w0,
  }));
```

**[déduit]** L'apport kcal d'un jour passé dans la trajectoire Hall est `DailyLog.calorieTargetForDay` (`calibration.ts:128`, puis `316`), lu dans le log de ce jour. Aucun champ du plan ni du snapshot n'est lu. Le plan n'intervient qu'au moment où le log est écrit (voir plus bas).

**Jours sans `DailyLog`.** **[déduit]** d'après `calibration.ts:108-118`, `126-137` :
- apport, glucides et cible de pas : log **antérieur le plus proche** ; à défaut, le **premier log postérieur** (`sortedLogs[0]`) ;
- sans aucun log, l'apport vaut `populationTdeeAtStartKcal` (NASEM à la première pesée, **sans** offset), les glucides valent `baselineCarbFraction × apport`, les pas valent `maintenanceStepsPerDay` ;
- adhérence `'unknown'`, car `log` est `undefined` (`136`) ;
- `stepsLogged = false`, car `log?.actualSteps` est `undefined` (`134`) ;
- poids du jour : `0,5 × 0,7 = 0,35` (`137`).

Quand des jours sans log se produisent : **[déduit]** `ensureDailyLogs` crée les logs du jour qui suit le dernier log (ou de l'onboarding) jusqu'à `today` (`engine.ts:419-437`). Il est appelé au chargement, au changement de jour, dans `addWeight`, `setAdherence`, `setActualSteps`, `changeGoal`, `updateProfile` et `applyRecalibration`. Une pesée datée avant `meta.onboardingDate` ouvre donc la fenêtre sur des jours sans log (`425-427` : `days < 0` → aucun ajout). **[lu]** L'UI le permet : la feuille de pesée propose « aujourd'hui » ou « hier », `src/screens/DailySheets.tsx:73` : `const date = day === 'today' ? today : addDays(today, -1);`. **[déduit]** Une pesée « hier » saisie le jour de l'onboarding tombe avant le premier log. Pour ce jour, `reconstructDays` prend alors le premier log postérieur (`calibration.ts:117`).

**Origine des macros et entrée des glucides dans Hall.** **[lu]** Écriture des macros dans le log, `src/domain/engine.ts:412-437`

```ts
function macrosForLog(store: WheightyStore): DailyLog['macrosForDay'] {
  const plan = store.plan;
  if (!plan) return undefined;
  return { proteinG: plan.macros.proteinG, carbsG: plan.macros.carbsG, fatG: plan.macros.fatG };
}

/** Creates missing logs from the last logged day (or onboarding) through today, with the plan in force. */
export function ensureDailyLogs(store: WheightyStore, today: string): WheightyStore {
  const plan = store.plan;
  const start = store.meta.onboardingDate;
  if (!plan || !start) return store;
  const existing = new Set(store.dailyLogs.map((l) => l.date));
  const lastDate = store.dailyLogs.reduce<string | null>((acc, l) => (acc === null || l.date > acc ? l.date : acc), null);
  const from = lastDate ? addDays(lastDate, 1) : start;
  const days = daysBetween(from, today);
  if (days < 0) return store;
  const added: DailyLog[] = [];
  const macros = macrosForLog(store);
  for (let d = 0; d <= days; d++) {
    const date = addDays(from, d);
    if (existing.has(date)) continue;
    added.push({ date, calorieTargetForDay: plan.calorieTarget, stepTargetForDay: plan.stepTarget, ...(macros ? { macrosForDay: macros } : {}) });
  }
  if (added.length === 0) return store;
  return { ...store, dailyLogs: [...store.dailyLogs, ...added].sort((a, b) => (a.date < b.date ? -1 : 1)) };
}
```

**[lu]** Usage des glucides par Hall, `src/science/hall/model.ts:185-186` (initialisation) et `224-230` (dérivées)

```ts
  const carbIntakeBaselineKcal = input.baselineCarbFraction * input.baselineIntakeKcal;
  const kG = carbIntakeBaselineKcal / (glycogen0Kg * glycogen0Kg);
```

```ts
export function derivatives(p: HallParameters, s: HallState, u: HallDailyInput): Derivatives {
  const deltaEi = u.intakeKcal - p.input.baselineIntakeKcal;
  const dAt = (HALL_BETA_AT * deltaEi - s.at) / HALL_TAU_AT_DAYS;
  const dEcf =
    (u.sodiumDeltaMg - HALL_ZETA_NA_MG_PER_L_DAY * (s.ecf - p.ecf0Kg) - HALL_ZETA_CI_MG_PER_DAY * (1 - u.carbKcal / p.carbIntakeBaselineKcal)) /
    HALL_SODIUM_MG_PER_L;
  const dGlycogen = (u.carbKcal - p.kG * s.glycogen * s.glycogen) / HALL_RHO_G_KCAL_PER_KG;
```

**[déduit]**
- Les macros d'un jour sont `plan.macros` (grammes exacts) du plan en vigueur au moment où le log a été créé ou resynchronisé (`engine.ts:412-416`, `433`, `446`).
- La calibration n'en lit que `carbsG`, converti en kcal × 4 (`calibration.ts:133`). Protéines et lipides ne sont pas lus.
- Sans `macrosForDay`, `carbKcal = baselineCarbFraction × apport` (`calibration.ts:132-133`).
- Dans Hall, les glucides n'agissent que par l'écart `carbKcal` / `carbIntakeBaselineKcal` :
  - eau extracellulaire (`model.ts:228`) ;
  - glycogène (`model.ts:230`) ;
  - base = `baselineCarbFraction × (NASEM_début + offset)` (`model.ts:185`, avec `baselineIntakeKcal` = `populationTdeeAtStartKcal + offset`, `calibration.ts:361`) ;
  - le TEF est `β_TEF × (apport − apport de base)`, sans les macros (`model.ts:218-220`).
- `baselineCarbFraction` est celle de l'objectif du plan (tableau 2.1).

**[lu]** D-16, `IMPLEMENTATION_NOTES.md:216` (copié en 1.3), et `IMPLEMENTATION_NOTES.md:360`

````markdown
**Décalages hors périmètre mesurés en P0.** Référence NASEM au poids de début d'historique (warm start) contre première pesée (calibration) : conforme à D-17 et D-23 (offset additif), effet < 21 kcal/j, `DO_NOT_TOUCH`. Part de glucides de maintien (warm start) contre objectif (calibration) : 2 à 8 kcal/j, reporté.
````

**Stockage des cibles passées et protection.** **[lu]** `src/domain/engine.ts:439-448` (jour courant seulement)

```ts
/** Today's log follows the plan in force; past days are never rewritten. */
function syncTodayLogTargets(store: WheightyStore, today: string): WheightyStore {
  const plan = store.plan;
  if (!plan) return store;
  const macros = macrosForLog(store);
  return {
    ...store,
    dailyLogs: store.dailyLogs.map((l) => (l.date === today ? { ...l, calorieTargetForDay: plan.calorieTarget, stepTargetForDay: plan.stepTarget, ...(macros ? { macrosForDay: macros } : {}) } : l)),
  };
}
```

**[lu]** Adhérence et pas, `src/domain/engine.ts:450-472`

```ts
export function setAdherence(store: WheightyStore, date: string, adherence: DailyLog['adherence'] | null): WheightyStore {
  const withLogs = ensureDailyLogs(store, date);
  return {
    ...withLogs,
    dailyLogs: withLogs.dailyLogs.map((l) => {
      if (l.date !== date) return l;
      const { adherence: _previous, ...rest } = l;
      return adherence ? { ...rest, adherence } : rest;
    }),
  };
}

export function setActualSteps(store: WheightyStore, date: string, steps: number | null): WheightyStore {
  const withLogs = ensureDailyLogs(store, date);
  return {
    ...withLogs,
    dailyLogs: withLogs.dailyLogs.map((l) => {
      if (l.date !== date) return l;
      const { actualSteps: _previous, ...rest } = l;
      return steps === null ? rest : { ...rest, actualSteps: steps };
    }),
  };
}
```

**[déduit]** Les cibles passées sont stockées dans chaque `DailyLog` (`calorieTargetForDay`, `stepTargetForDay`, `macrosForDay`). La protection tient à **la construction des fonctions du domaine** :
- `ensureDailyLogs` saute les dates existantes (`engine.ts:432`) ;
- `syncTodayLogTargets` ne réécrit que `l.date === today` (`446`) ;
- `setAdherence` et `setActualSteps` ne touchent qu'à leur champ (`454-458`, `466-470`).

Aucun mécanisme d'immutabilité au niveau du stockage n'a été trouvé (`grep -rn "Object.freeze" src` : aucun résultat). Test : **[lu]** `tests/domain/engine.test.ts:55-70`

```ts
  it('backfills daily logs with the plan in force and never rewrites past days after a plan change', () => {
    let s = onboarded();
    const firstTarget = s.plan?.calorieTarget;
    s = ensureDailyLogs(s, addDays(DAY0, 3));
    expect(s.dailyLogs.map((l) => l.date)).toEqual([DAY0, addDays(DAY0, 1), addDays(DAY0, 2), addDays(DAY0, 3)]);
    const moved = applySliderSteps(s, addDays(DAY0, 3), 11200);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    s = moved.store;
    expect(s.plan?.source).toBe('user_adjusted_slider');
    expect(s.plan?.stepTarget).toBe(11200);
    expect(s.plan?.calorieTarget).toBeGreaterThan(firstTarget as number);
    expect(s.dailyLogs[0]?.calorieTargetForDay).toBe(firstTarget);
    expect(s.dailyLogs[3]?.calorieTargetForDay).toBe(s.plan?.calorieTarget);
    expect(s.dailyLogs[3]?.stepTargetForDay).toBe(11200);
  });
```

### 2.3 Adhérence

**Catégories, poids, constantes.** **[lu]** `src/science/constants.ts:301-305` et `576-580` (catégories)

```ts
export const ADHERENCE_WEIGHT_ON_PLAN = 1.0; // statistical_robustness_parameter
export const ADHERENCE_WEIGHT_MINOR = 0.35; // statistical_robustness_parameter
export const ADHERENCE_WEIGHT_MAJOR = 0.0; // statistical_robustness_parameter
export const ADHERENCE_WEIGHT_UNKNOWN = 0.5; // statistical_robustness_parameter
export const MISSING_STEPS_WEIGHT_FACTOR = 0.7; // statistical_robustness_parameter
```

```ts
  ADHERENCE_WEIGHT_ON_PLAN: m('statistical_robustness_parameter', '05 s6'),
  ADHERENCE_WEIGHT_MINOR: m('statistical_robustness_parameter', '05 s6'),
  ADHERENCE_WEIGHT_MAJOR: m('statistical_robustness_parameter', '05 s6'),
  ADHERENCE_WEIGHT_UNKNOWN: m('statistical_robustness_parameter', '05 s6'),
  MISSING_STEPS_WEIGHT_FACTOR: m('statistical_robustness_parameter', '05 s7'),
```

**[lu]** `src/science/calibration.ts:60-65`

```ts
export const ADHERENCE_WEIGHTS: Readonly<Record<Adherence, number>> = {
  on_plan: ADHERENCE_WEIGHT_ON_PLAN,
  minor_deviation: ADHERENCE_WEIGHT_MINOR,
  major_deviation: ADHERENCE_WEIGHT_MAJOR,
  unknown: ADHERENCE_WEIGHT_UNKNOWN,
};
```

| Catégorie | Poids | Constante | `ConstantCategory` |
|---|---:|---|---|
| `on_plan` | 1,0 | `ADHERENCE_WEIGHT_ON_PLAN` | `statistical_robustness_parameter` |
| `minor_deviation` | 0,35 | `ADHERENCE_WEIGHT_MINOR` | `statistical_robustness_parameter` |
| `major_deviation` | 0,0 | `ADHERENCE_WEIGHT_MAJOR` | `statistical_robustness_parameter` |
| `unknown` | 0,5 | `ADHERENCE_WEIGHT_UNKNOWN` | `statistical_robustness_parameter` |
| (pas manquants) | × 0,7 | `MISSING_STEPS_WEIGHT_FACTOR` | `statistical_robustness_parameter` |

**[lu]** `'unknown'` n'est jamais stocké. Le type de `DailyLog.adherence` l'exclut (`src/science/types.ts:132`), et `setAdherence(…, null)` retire le champ (`engine.ts:456-457`). `'unknown'` n'apparaît que dans `reconstructDays`, quand le log du jour est absent ou n'a pas d'adhérence (`calibration.ts:136`).

**Où s'appliquent les poids.** **[lu]** Poids du jour, `calibration.ts:136-137` (voir 2.2). Poids de la pesée, `calibration.ts:303-311` :

```ts
  const obsDays = weights.map((w) => daysBetween(startDate, w.date));
  const obsWeights = weights.map((_, i) => {
    if (i === 0) return 1;
    const from = obsDays[i - 1] as number;
    const to = obsDays[i] as number;
    let sum = 0;
    for (let d = from; d < to; d++) sum += (days[d] as ReconstructedDay).weight;
    return to > from ? sum / (to - from) : 0;
  });
```

**[lu]** Pesées actives et terme de vraisemblance, `calibration.ts:336-347` et `376-384`

```ts
  // Weigh-ins with a positive evidence weight, in their original order.
  const activeIndex: number[] = [];
  const activeKg: number[] = [];
  const activeWeight: number[] = [];
  weights.forEach((w, i) => {
    const wi = obsWeights[i] as number;
    if (wi <= 0) return;
    activeIndex.push(i);
    activeKg.push(w.weightKg);
    activeWeight.push(wi);
  });
  const activeCount = activeIndex.length;
```

```ts
    const interceptAt = (ci: number): number => {
      const c = intercepts[ci] as number;
      let ll = 0;
      for (let k = 0; k < activeCount; k++) {
        const i = activeIndex[k] as number;
        ll += (activeWeight[k] as number) * studentTLogDensityKernel((activeKg[k] as number) - (w0 + c) - (predicted[i] as number), CALIBRATION_T_DF, CALIBRATION_T_SCALE_KG);
      }
      return ll;
    };
```

**[déduit]**
- Un poids **journalier** est calculé : adhérence × (1 ou 0,7 selon les pas) (`137`).
- Le poids d'une **pesée** i ≥ 1 est la **moyenne arithmétique** des poids journaliers des jours `[jour de la pesée i−1 ; jour de la pesée i[` (`306-310`). La première pesée vaut 1 (`305`).
- Ce poids multiplie le **log-noyau Student-t** de la pesée, ce qui revient à élever sa vraisemblance à cette puissance (`381`). Les pesées de poids ≤ 0 sont retirées (`341-342`).
- Les jours ne portent pas de terme de vraisemblance : ils n'agissent qu'à travers ce poids, et à travers l'apport et les pas simulés.

**Pesée « propre ».** **[lu]** `src/science/calibration.ts:170-185` et `src/science/constants.ts:311-312`

```ts
  let cleanWeighInCount = 0;
  valid.forEach((w, i) => {
    if (i === 0) {
      cleanWeighInCount++;
      return;
    }
    const prev = valid[i - 1];
    if (!prev) return;
    const windowDays = daysBetween(prev.date, w.date);
    let major = 0;
    // Intake of the weigh-in day itself happens after the (morning) weigh-in.
    for (let d = 0; d < windowDays; d++) {
      if (logByDate.get(addDays(prev.date, d))?.adherence === 'major_deviation') major++;
    }
    if (!(windowDays > 0 && major / windowDays > GATE_MAJOR_DOMINATION_FRACTION)) cleanWeighInCount++;
  });
```

```ts
/** A weigh-in window is "dominated" by major deviations when more than this share of its days are major. */
export const GATE_MAJOR_DOMINATION_FRACTION = 0.5; // engineering_prior
```

**[déduit]**
- La première pesée valide est toujours propre.
- Une pesée i ≥ 1 n'est **pas** propre si la part de jours `major_deviation` parmi `[jour i−1 ; jour i[` dépasse **strictement** 0,5. Une égalité à 0,5 laisse la pesée propre.
- Le décompte lit les logs stockés (`logByDate`) sans repli : un jour sans log compte comme non majeur.
- Seuil de la porte : `GATE_MIN_CLEAN_WEIGHINS = 4` (`constants.ts:309`, `engineering_prior`).

**Couverture d'adhérence (porte à 50 %).** **[lu]** `src/science/calibration.ts:187-205` et `src/science/constants.ts:310`

```ts
  let totalDays = 0;
  let adherenceDays = 0;
  let majorDays = 0;
  if (first && last) {
    for (let d = 0; d <= spanDays; d++) {
      totalDays++;
      const adherence = logByDate.get(addDays(first.date, d))?.adherence;
      if (adherence !== undefined) {
        adherenceDays++;
        if (adherence === 'major_deviation') majorDays++;
      }
    }
  }
  const adherenceCoverage = totalDays > 0 ? adherenceDays / totalDays : 0;
  const criteria = {
    enoughWeighIns: valid.length >= GATE_MIN_WEIGHINS,
    enoughSpan: spanDays >= GATE_MIN_SPAN_DAYS,
    enoughCleanWeighIns: cleanWeighInCount >= GATE_MIN_CLEAN_WEIGHINS,
    enoughAdherenceInfo: adherenceCoverage >= GATE_MIN_ADHERENCE_COVERAGE,
```

```ts
export const GATE_MIN_ADHERENCE_COVERAGE = 0.5; // engineering_prior
```

**[déduit]**
- **Dénominateur** : tous les jours calendaires de la première à la dernière pesée valide, **bornes incluses** (`spanDays + 1`).
- **Numérateur** : les jours dont le log stocké porte une `adherence` définie (`on_plan`, `minor_deviation` ou `major_deviation`).
- Un jour **sans log** ou avec un log **sans adhérence** compte au dénominateur, pas au numérateur. Les deux cas sont indistinguables : `'unknown'` n'est pas stocké.
- La condition est `≥ 0,5`.
- Écart de fenêtre : la couverture inclut le jour de la dernière pesée, alors que les poids de vraisemblance s'arrêtent la veille (`reconstructDays(…, spanDays)`, `calibration.ts:302`).

**[lu]** `instruct/05_CALIBRATION_UNCERTAINTY.md:204`

```text
at least 50 percent of days have adherence information or an explicit "plan respected" confirmation
```

### 2.4 Pas

**[lu]** `src/science/calibration.ts:134-137` (voir 2.2) et `315-323`. Fonction `netStepKcal`, `src/science/activity.ts:36-42`, `47-67` :

```ts
/** Net (above rest) kcal per minute for a MET value on a given resting-oxygen basis. */
export function netKcalPerMin(met: number, weightKg: number, basis: CompendiumBasis): number {
  const o2 = restingO2(basis);
  const gross = (met * o2 * weightKg) / MET_KCAL_DIVISOR;
  const rest = (1.0 * o2 * weightKg) / MET_KCAL_DIVISOR;
  return Math.max(0, gross - rest);
}
```

```ts

export function stepPacePreset(pace: WalkingPace, ageYears: number): { cadenceStepsPerMin: number; met: number; basis: CompendiumBasis } {
  const basis = compendiumBasisForAge(ageYears);
  const preset = basis === 'older_adult_2_7' ? STEP_PACE_PRESETS_OLDER[pace] : STEP_PACE_PRESETS_ADULT[pace];
  return { cadenceStepsPerMin: preset.cadenceStepsPerMin, met: preset.met, basis };
}

export type StepEnergyInput = {
  steps: number;
  pace: WalkingPace;
  weightKg: number;
  ageYears: number;
};

/** Net step energy, kcal/day (02 section 2). Never exact: an estimate only. */
export function netStepKcal(input: StepEnergyInput): number {
  if (input.steps <= 0) return 0;
  const preset = stepPacePreset(input.pace, input.ageYears);
  const minutes = input.steps / preset.cadenceStepsPerMin;
  return netKcalPerMin(preset.met, input.weightKg, preset.basis) * minutes;
}
```

**[lu]** Allures, `src/science/activityTable.ts:33-43`

```ts
export const STEP_PACE_PRESETS_ADULT: Readonly<Record<WalkingPace, { cadenceStepsPerMin: number; met: number; source: string }>> = {
  slow: { cadenceStepsPerMin: 80, met: 2.8, source: '02 s2; Adult 17152 walking 2.0-2.4 mph' },
  normal: { cadenceStepsPerMin: 100, met: 3.8, source: '02 s2; Adult 17190 walking 2.8-3.4 mph' },
  brisk: { cadenceStepsPerMin: 120, met: 4.8, source: '02 s2; Adult 17200 walking 3.5-3.9 mph' },
};

export const STEP_PACE_PRESETS_OLDER: Readonly<Record<WalkingPace, { cadenceStepsPerMin: number; met: number; source: string }>> = {
  slow: { cadenceStepsPerMin: 80, met: 4.0, source: '02 s2; Older 1715260 walking 1.0-1.9 mph' },
  normal: { cadenceStepsPerMin: 100, met: 5.3, source: '02 s2; Older 1719060 walking 2.8-3.2 mph' },
  brisk: { cadenceStepsPerMin: 115, met: 6.0, source: '02 s2; Older 1720060 walking 3.3-3.7 mph' },
};
```

**[lu]** Usage dans Hall, `src/science/hall/model.ts:232-235`

```ts
  const fat = fatFromLean(p, s.lean);
  const weight = s.lean + fat + s.ecf + HALL_GLYCOGEN_WATER_MULTIPLIER * s.glycogen;
  const delta = p.deltaBaselineKcalPerKgDay + u.paDeltaKcalPerKgDay;
  const r3 = p.K + delta * weight + tefTerm(p, u) + s.at - u.intakeKcal + HALL_RHO_G_KCAL_PER_KG * dGlycogen;
```

**[déduit] Formule.**
- `paDelta_jour = (netStep(pas_jour, w0) − netStep(maintenanceStepsPerDay, w0)) / w0`, en kcal/kg/j, avec :
  - `netStep(n, w) = max(0, (MET − 1) × O2 × w / 200) × n / cadence` ;
  - `w0` = première pesée valide ;
  - `O2` = 3,5, ou 2,7 à partir de 60 ans.
- Hall l'ajoute à `δ` et le multiplie par le poids courant simulé (`model.ts:234-235`).
- **Référence du delta** : `maintenanceStepsPerDay`, c'est-à-dire `profile.averageSteps7d` du **profil courant** (`engine.ts:632`), pas la valeur figée dans le plan (`CurrentPlan.maintenanceStepsPerDay`, `engine.ts:137`).
- `pas_jour` = `log.actualSteps` si le log du jour en a, sinon `stepTargetForDay` du log du jour ou du log de repli, sinon `maintenanceStepsPerDay` (`calibration.ts:135`).

**Repli et facteur 0,70.** **[lu]** `MISSING_STEPS_WEIGHT_FACTOR = 0.7` (`constants.ts:305`), catégorie `statistical_robustness_parameter`, source `'05 s7'` (`constants.ts:580`).

**[déduit]** Le facteur multiplie le **poids d'évidence du jour** quand le log du jour n'a pas `actualSteps` (`calibration.ts:134`, `137`). Il ne touche pas les pas simulés : ceux-ci prennent la cible du jour. Il s'applique aussi aux jours sans log.

**[lu]** `instruct/05_CALIBRATION_UNCERTAINTY.md:177-188`

```text
For each calendar day in the fit window, use:

```text
actual steps if user logged them
otherwise current step target
```

If actual steps are missing, reduce that day's effective calibration weight by:

```text
0.70
```
```

**Catégorie d'activité NASEM après l'onboarding.** **[lu]** Fixée à l'onboarding, `src/domain/engine.ts:331`. Recalculée à l'édition du profil, `engine.ts:579-588`. Lue par la calibration, `engine.ts:620-621`.

```ts
      initialPalCategory: assessment.palCategory,
```

```ts
export function updateProfile(store: WheightyStore, today: string, profile: UserProfile): { ok: true; store: WheightyStore } | { ok: false; reason: string } {
  const withLogs = ensureDailyLogs(store, today);
  const activityChanged =
    !store.profile ||
    JSON.stringify(store.profile.activities) !== JSON.stringify(profile.activities) ||
    store.profile.occupation !== profile.occupation ||
    store.profile.averageSteps7d !== profile.averageSteps7d ||
    store.profile.walkingPace !== profile.walkingPace;
  const assessment = assessBaseline(profile, today);
  const meta = activityChanged ? { ...withLogs.meta, initialPalCategory: assessment.palCategory, initialProvisionalPal: assessment.pal.provisionalPal } : withLogs.meta;
```

```ts
  const palCategory = store.meta.initialPalCategory ?? store.plan?.palCategory;
  const assessment = assessBaseline(profile, today, { weightKg: first.weightKg, ...(palCategory ? { palCategory } : {}) });
```

**[déduit]**
- La catégorie reste figée tant que le profil ne change pas d'activités, de métier, de `averageSteps7d` ou d'allure.
- Une telle édition la **reclasse** : `meta.initialPalCategory` est réécrit (`engine.ts:588`), et la calibration suivante l'utilise pour le NASEM de début de fenêtre, y compris pour les jours passés.
- Les pas réels quotidiens ne reclassent jamais la catégorie : ils passent par `paDelta` seulement.
- `assessBaseline` n'utilise la classification recalculée que si `options.palCategory` est absent (`src/science/assessment.ts:60`).

### 2.5 Prior, grilles et incertitude

**Prior de l'offset.** **[lu]** `src/science/calibration.ts:404`, `src/science/uncertainty.ts:27-37`, `src/science/assessment.ts:68-73`, `src/science/constants.ts:108-109`, `122-127`

```ts
    const logPrior = -0.5 * (offset / input.priorSigmaKcal) ** 2 + (history ? (history[gridIndex] as number) : 0);
```

```ts
export function initialSigma(sex: SexForEquation, flags: SigmaFlags): SigmaBreakdown {
  const baseSigmaKcal = sex === 'male' ? NASEM_SEPV_MALE_KCAL : NASEM_SEPV_FEMALE_KCAL;
  const multipliers: SigmaBreakdown['multipliers'] = [];
  if (flags.palBoundaryFlag) multipliers.push({ reason: 'palBoundaryFlag', factor: PAL_BOUNDARY_SIGMA_MULTIPLIER });
  if (flags.physicalOccupation) multipliers.push({ reason: 'physicalOccupation', factor: PHYSICAL_JOB_SIGMA_MULTIPLIER });
  if (flags.reeModelDisagreement) multipliers.push({ reason: 'reeModelDisagreement', factor: REE_DISAGREEMENT_SIGMA_MULTIPLIER });
  if (flags.defaultActivityCadence) multipliers.push({ reason: 'defaultActivityCadence', factor: DEFAULT_CADENCE_SIGMA_MULTIPLIER });
  // Consumer BIA and unknown-quality measured RMR never reduce sigma: no multiplier below 1 exists.
  const sigmaKcal = multipliers.reduce((s, m) => s * m.factor, baseSigmaKcal);
  return { baseSigmaKcal, multipliers, sigmaKcal };
}
```

```ts
  const sigma = initialSigma(profile.sexForEquation, {
    palBoundaryFlag: pal.palBoundaryFlag,
    physicalOccupation: profile.occupation === 'physical',
    reeModelDisagreement: ree.reeModelDisagreement,
    defaultActivityCadence: exercise.anyDefaultCadence,
  });
```

```ts
export const NASEM_SEPV_FEMALE_KCAL = 241; // published_constant
export const NASEM_SEPV_MALE_KCAL = 342; // published_constant
```

```ts
export const PAL_BOUNDARY_DISTANCE = 0.05; // engineering_prior
export const PAL_BOUNDARY_SIGMA_MULTIPLIER = 1.15; // engineering_prior
export const PHYSICAL_JOB_SIGMA_MULTIPLIER = 1.15; // engineering_prior
export const REE_DISAGREEMENT_SIGMA_MULTIPLIER = 1.15; // engineering_prior
/** Sigma multiplier when a step-dominant activity has no specific cadence (02 section 5 "widen uncertainty"). */
export const DEFAULT_CADENCE_SIGMA_MULTIPLIER = 1.15; // engineering_prior
```

**[déduit]**
- Le prior est `N(0, σ)` sur l'offset en kcal/j, avec :
  - **centre 0**, c'est-à-dire le NASEM au poids de la première pesée (`sorted[0]`, `engine.ts:621`) et à la catégorie PAL retenue ;
  - σ de base **241** (femme) ou **342** (homme) kcal/j (`NASEM_SEPV_*`, `published_constant`) ;
  - facteurs **× 1,15** cumulables : frontière PAL, métier physique, désaccord REE, cadence par défaut (`engineering_prior`).
- σ est recalculé à chaque calibration à partir du profil courant (`engine.ts:621`, `634`).
- Le prior n'est jamais remplacé par un posterior antérieur : un snapshot appliqué n'est pas relu par `calibrationInputFromStore`.

**Warm start dans la calibration longitudinale.** **[lu]** `src/science/calibration.ts:328-330` et `404` ; `src/science/warmStart.ts:305-310` ; `src/domain/engine.ts:246-253` et `639`

```ts
  const offsets = offsetGrid();
  const history = input.historicalLogLikelihood;
  if (history !== undefined && history.length !== offsets.length) throw new Error('historicalLogLikelihood must align with offsetGrid()');
```

```ts
  const logLikelihoodOnSupport = predictedOnSupport.map((pred) => -0.5 * ((observedChangeKg - pred) / sdKg) ** 2);
  // Calibration grid handoff: same values sampled at the grid offsets (grid and support share the step and the origin).
  const indexOf = new Map(offsets.map((o, i) => [o, i]));
  const grid = offsetGrid();
  const gridIndices = grid.map((o) => indexOf.get(o));
  const logLikelihood = gridIndices.map((i) => (i === undefined ? Number.NEGATIVE_INFINITY : (logLikelihoodOnSupport[i] as number)));
```

```ts
export function warmStartFor(profile: UserProfile, evidence: HistoricalIntakeEvidence, today: string, palCategory?: PalCategory | null): WarmStartResult {
  const key = JSON.stringify([profile, evidence, today, palCategory ?? null]);
  if (warmStartMemo?.key === key) return warmStartMemo.value;
  const atOnboarding = assessBaseline(profile, today, palCategory ? { palCategory } : {});
  const fixedPal = palCategory ?? atOnboarding.palCategory;
  const startWeightKg = evidence.startWeightKg ?? profile.currentWeightKg;
  const atStart = assessBaseline(profile, today, { weightKg: startWeightKg, palCategory: fixedPal });
  const ctx = planContextFrom(profile, atStart, atStart.populationTdeeKcal);
```

**[déduit]**
- `historicalLogLikelihood` est la log-vraisemblance gaussienne de la variation de poids déclarée, échantillonnée sur `offsetGrid()`. Elle vaut `-Infinity` hors support.
- Elle est **ajoutée au log-prior**, à chaque calibration, pour chaque offset de la grille (`calibration.ts:404`).
- **Contrat de longueur** : égalité stricte avec `offsetGrid().length`, sinon `throw` (`330`) ; testé en `tests/science/warmStartDomain.test.ts:36-38`.
- **Grille partagée** : oui, `offsetGrid()` des deux côtés (`warmStart.ts:308`).
- Fournie seulement si le warm start a le statut `used`, donc `logLikelihood` non nul (`engine.ts:639`).
- Elle est recalculée à partir du **profil courant**, à la date `evidence.recordedOn` et avec `meta.initialPalCategory` (`engine.ts:272-274`).
- L'offset du warm start est référencé au NASEM du **poids de début d'historique** (`engine.ts:251-252`). Celui de la calibration l'est au NASEM de la **première pesée** (`engine.ts:621`). Les deux sont additionnés indice par indice. Écart documenté : `IMPLEMENTATION_NOTES.md:360`, cité en 2.2.

**Grilles.** **[lu]** `src/science/constants.ts:319-331`, `src/science/calibration.ts:286-290` et `325-326`

```ts
export const CALIBRATION_GRID_MIN_KCAL = -1200; // statistical_robustness_parameter
export const CALIBRATION_GRID_MAX_KCAL = 1200; // statistical_robustness_parameter
export const CALIBRATION_GRID_STEP_KCAL = 5; // statistical_robustness_parameter
export const CALIBRATION_T_DF = 4; // statistical_robustness_parameter
export const CALIBRATION_T_SCALE_KG = 0.6; // statistical_robustness_parameter
/**
 * Structural uncertainty floor of the weigh-in calibration (IMPLEMENTATION_NOTES D-33): SD of the model error convolved
 * into the offset posterior, so the interval cannot shrink below what the model itself can know.
 */
export const CALIBRATION_STRUCTURAL_SD_KCAL = 50; // statistical_robustness_parameter
/** Grid over the unknown true starting weight, marginalised under a flat prior (see IMPLEMENTATION_NOTES). */
export const CALIBRATION_INTERCEPT_HALF_RANGE_KG = 3; // statistical_robustness_parameter
export const CALIBRATION_INTERCEPT_STEP_KG = 0.05; // statistical_robustness_parameter
```

```ts
export function offsetGrid(): number[] {
  const out: number[] = [];
  for (let o = CALIBRATION_GRID_MIN_KCAL; o <= CALIBRATION_GRID_MAX_KCAL + 1e-9; o += CALIBRATION_GRID_STEP_KCAL) out.push(o);
  return out;
}
```

```ts
  const intercepts: number[] = [];
  for (let c = -CALIBRATION_INTERCEPT_HALF_RANGE_KG; c <= CALIBRATION_INTERCEPT_HALF_RANGE_KG + 1e-9; c += CALIBRATION_INTERCEPT_STEP_KG) intercepts.push(c);
```

| Grille | Bornes | Pas | Points | Constantes | Catégorie |
|---|---|---|---:|---|---|
| Offset | −1 200 à +1 200 kcal/j | 5 | 481 **[déduit]** | `CALIBRATION_GRID_MIN_KCAL`, `_MAX_KCAL`, `_STEP_KCAL` | `statistical_robustness_parameter` |
| Poids de départ latent (intercept `c`, autour de la première pesée) | −3 à +3 kg | 0,05 | 121 **[déduit]** | `CALIBRATION_INTERCEPT_HALF_RANGE_KG`, `_STEP_KG` | `statistical_robustness_parameter` |

**[déduit]**
- L'intercept suit un prior plat : `logSumExp` sans poids (`calibration.ts:403`).
- Passe grossière (1 intercept sur 4), puis passe exacte autour des valeurs à moins de 60 unités de log du meilleur (`237-244`, `385-402`). Constantes privées `INTERCEPT_COARSE_STRIDE = 4` et `INTERCEPT_PRUNE_LOG_MARGIN = 60` (`238`, `244`), absentes de `CONSTANT_METADATA`.
- Offsets hors domaine de Hall (`NASEM + offset ≤ 1`) : `-Infinity`, jamais simulés (`350-355`).

**Vraisemblance.** **[lu]** `src/science/calibration.ts:223-226` et `381` ; `src/science/constants.ts:322-323`

```ts
export function studentTLogDensityKernel(residualKg: number, df: number, scaleKg: number): number {
  const z = residualKg / scaleKg;
  return (-(df + 1) / 2) * Math.log(1 + (z * z) / df);
}
```

```ts
export const CALIBRATION_T_DF = 4; // statistical_robustness_parameter
export const CALIBRATION_T_SCALE_KG = 0.6; // statistical_robustness_parameter
```

**[déduit]**
- Loi de **Student-t**, **df = 4**, **échelle = 0,6 kg** (`statistical_robustness_parameter`).
- Seul le noyau non normalisé est calculé. La constante ne dépend ni de l'offset ni de l'intercept, donc elle s'élimine à la normalisation.
- Résidu : `poids observé − (w0 + c) − (poids simulé − w0)`.
- Terme pondéré par le poids de la pesée (2.3).
- Écart-type implicite : `0,6 × √(4/2) ≈ 0,85 kg`, réutilisé par le warm start (`warmStart.ts:241-243`).

**Plancher structurel (D-33).** **[lu]** `src/science/calibration.ts:408-411` et `421-438` ; `src/science/constants.ts:328`

```ts
  const informationPosterior = summarizeGridPosterior(offsets, logPost);
  const structuralSdKcal = input.structuralSdKcal ?? CALIBRATION_STRUCTURAL_SD_KCAL;
  const admissible = logPost.map((lp) => lp !== Number.NEGATIVE_INFINITY);
  const posterior = structuralSdKcal > 0 ? summarizeGridProbabilities(offsets, convolveGridProbabilities(offsets, informationPosterior.probabilities, structuralSdKcal, admissible)) : informationPosterior;
```

```ts
export function convolveGridProbabilities(offsets: readonly number[], probabilities: readonly number[], sdKcal: number, admissible?: readonly boolean[]): number[] {
  const step = offsets.length > 1 ? (offsets[1] as number) - (offsets[0] as number) : 1;
  const half = Math.ceil((6 * sdKcal) / step);
  const kernel: number[] = [];
  for (let j = -half; j <= half; j++) kernel.push(Math.exp(-0.5 * ((j * step) / sdKcal) ** 2));
  const n = probabilities.length;
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const p = probabilities[i] as number;
    if (p === 0) continue;
    for (let j = -half; j <= half; j++) {
      const k = i + j;
      if (k >= 0 && k < n && admissible?.[k] !== false) out[k] = (out[k] as number) + p * (kernel[j + half] as number);
    }
  }
  const total = out.reduce((s, v) => s + v, 0);
  return out.map((v) => v / total);
}
```

**[déduit]**
- Posterior rapporté = posterior d'information convolué avec `N(0, 50 kcal/j)`, puis renormalisé.
- Noyau tronqué à ±6 σ, soit `half = ceil(300 / 5) = 60` pas de grille.
- Masse poussée hors de la grille ou sur un offset non admissible : perdue, avant renormalisation.
- `σ = CALIBRATION_STRUCTURAL_SD_KCAL = 50`, `statistical_robustness_parameter`. Surchargeable par `structuralSdKcal`, réservé aux tests (`calibration.ts:90-91`).
- `informationPosterior` reste exposé dans `CalibrationFit`.

**Règle de surfacing (D-34).** **[lu]** `src/science/calibration.ts:501-517` ; `src/science/constants.ts:339-344` ; `src/domain/engine.ts:670-672`

```ts
export type SurfacingReference = {
  tdeeKcal: number;
  interval80Width: number;
  /** ISO date of the previous surfaced recalibration, null when none. */
  surfacedOn: string | null;
};

export function shouldSurfaceRecalibration(gate: GateStatus, candidate: { tdeeKcal: number; interval80Width: number }, last: SurfacingReference, today: string): boolean {
  if (!gate.met) return false;
  const daysSince = last.surfacedOn === null ? Number.POSITIVE_INFINITY : daysBetween(last.surfacedOn, today);
  // At most one proposal per interval, whatever the criteria (IMPLEMENTATION_NOTES D-34). The first one after the gate is free.
  if (daysSince < RECAL_SURFACE_MIN_INTERVAL_DAYS) return false;
  const change = Math.abs(candidate.tdeeKcal - last.tdeeKcal);
  if (change >= RECAL_SURFACE_MIN_CHANGE_KCAL) return true;
  if (last.interval80Width > 0 && (last.interval80Width - candidate.interval80Width) / last.interval80Width >= RECAL_SURFACE_MIN_WIDTH_SHRINK) return true;
  return daysSince >= RECAL_SURFACE_MIN_DAYS && change >= RECAL_SURFACE_MIN_CHANGE_AFTER_DAYS_KCAL;
}
```

```ts
export const RECAL_SURFACE_MIN_CHANGE_KCAL = 75; // engineering_prior
export const RECAL_SURFACE_MIN_WIDTH_SHRINK = 0.1; // engineering_prior
export const RECAL_SURFACE_MIN_DAYS = 7; // engineering_prior
export const RECAL_SURFACE_MIN_CHANGE_AFTER_DAYS_KCAL = 40; // engineering_prior
/** Minimum days between two surfaced recalibrations, whatever the criteria (D-34). */
export const RECAL_SURFACE_MIN_INTERVAL_DAYS = 7; // engineering_prior
```

```ts
  const proposedMaintenanceKcal = populationNow + candidate.posteriorMedianOffsetKcal;
  const reference = store.meta.lastSurfacedCalibration ?? { tdeeKcal: plan.maintenanceKcal, interval80Width: intervalWidth(plan.maintenanceInterval80), surfacedOn: null };
  const surfaced = shouldSurfaceRecalibration(gate, { tdeeKcal: proposedMaintenanceKcal, interval80Width: intervalWidth(candidate.interval80) }, reference, today);
```

**[déduit]** Une recalibration est proposée si, dans cet ordre :
1. la porte est franchie ;
2. au moins 7 jours séparent `today` de la dernière proposition **vue** (`surfacedOn`), la première étant exemptée ;
3. puis l'une de ces conditions est vraie :
   - |Δ maintien| ≥ 75 ;
   - largeur 80 % rétrécie d'au moins 10 % ;
   - au moins 7 jours écoulés et |Δ| ≥ 40.

Précisions :
- La référence est `meta.lastSurfacedCalibration`, à défaut le maintien et la fourchette du plan.
- Le candidat est `NASEM(poids de tendance actuel, PAL retenue) + médiane de l'offset` (`engine.ts:652-654`, `670`).
- Une proposition devient « vue » quand l'écran de recalibration s'affiche : `markRecalibrationSeen` (`src/screens/Tracking.tsx:371-377`).

**Application d'un nouveau plan.** **[lu]** `src/domain/engine.ts:686-703` et `src/screens/Tracking.tsx:371-377`, `399-407`

```ts
export function markRecalibrationSeen(store: WheightyStore, state: CalibrationState, today: string): WheightyStore {
  if (!state.candidate || state.proposedMaintenanceKcal === null) return store;
  return {
    ...store,
    meta: { ...store.meta, lastSurfacedCalibration: { tdeeKcal: state.proposedMaintenanceKcal, interval80Width: intervalWidth(state.candidate.interval80), surfacedOn: today } },
  };
}

export function applyRecalibration(store: WheightyStore, state: CalibrationState, today: string, nowIso: string): { ok: true; store: WheightyStore } | { ok: false; reason: string } {
  if (!state.candidate || !state.gate.met) return { ok: false, reason: 'gate_not_met' };
  const snapshot: CalibrationSnapshot = { ...state.candidate, appliedAt: nowIso };
  const withLogs = ensureDailyLogs(store, today);
  const withSnapshot: WheightyStore = { ...withLogs, calibrationSnapshots: [...withLogs.calibrationSnapshots, snapshot] };
  const result = buildPlanFromStore(withSnapshot, today, { source: 'recalibrated', snapshot, ...(store.plan ? { stepTarget: store.plan.stepTarget } : {}) });
  if (!result.ok) return { ok: false, reason: result.reason };
  const seen = markRecalibrationSeen(withSnapshot, state, today);
  return { ok: true, store: syncTodayLogTargets({ ...seen, plan: result.plan }, today) };
}
```

```tsx
  useEffect(() => {
    if (!marked.current && !calibrationPending && state?.surfaced && state.candidate) {
      marked.current = true;
      // Seen: surfacing thresholds now compare against this event (05 s12). The plan is unchanged until applied.
      commit(markRecalibrationSeen(store, state, today));
    }
  }, [state, calibrationPending, store, today, commit]);
```

```tsx
  const apply = () => {
    const r = applyRecalibration(store, state, today, nowIso());
    if (!r.ok) {
      showToast('Recalibration impossible pour le moment.');
      return;
    }
    commit(r.store);
    showToast('Nouveau plan appliqué.');
    go('today', { replace: true });
```

**[déduit]**
- Le plan n'est remplacé que par `applyRecalibration`, dont le seul appelant est le bouton `apply` de l'écran de recalibration (`grep -rn "applyRecalibration" src`) : il faut donc une action de l'utilisateur.
- `applyRecalibration` vérifie `state.gate.met`, pas `state.surfaced` (`engine.ts:695`).
- Le nouveau plan est reconstruit au poids de tendance actuel, avec l'offset médian du snapshot et le `stepTarget` du plan en cours (`699`, `buildPlanFromStore`, `engine.ts:183-205`).

**[lu]** `instruct/05_CALIBRATION_UNCERTAINTY.md:369`

```text
The new plan is not silently applied before the user confirms it on the recalibration screen.
```

### 2.6 Sorties persistées

**[lu]** `src/science/types.ts:145-161` et `src/science/calibration.ts:484-499`

```ts
export type CalibrationSnapshot = {
  scientificModelVersion: string;
  createdAt: string;
  posteriorMeanOffsetKcal: number;
  posteriorMedianOffsetKcal: number;
  interval80: Interval;
  interval95: Interval;
  calibratedTdeeMedian: number;
  validWeightCount: number;
  observationSpanDays: number;
  confidence: ConfidenceLevel;
  /** Extension: population TDEE the offset refers to, and whether the snapshot was applied to the plan. */
  populationTdeeKcal?: number;
  appliedAt?: string;
  /** Extension: 'warm_start' when the posterior comes from historical intake evidence only (no weigh-in yet). Absent means weigh-in calibration. */
  source?: 'weights' | 'warm_start';
};
```

```ts
export function buildSnapshot(fit: CalibrationFit, gate: GateStatus, populationTdeeKcal: number, createdAt: string): CalibrationSnapshot {
  const p = fit.posterior;
  return {
    scientificModelVersion: SCIENTIFIC_MODEL_VERSION,
    createdAt,
    posteriorMeanOffsetKcal: p.meanKcal,
    posteriorMedianOffsetKcal: p.medianKcal,
    interval80: p.interval80,
    interval95: p.interval95,
    calibratedTdeeMedian: populationTdeeKcal + p.medianKcal,
    validWeightCount: fit.validWeightCount,
    observationSpanDays: fit.observationSpanDays,
    confidence: confidenceLevel(gate, p.interval80[1] - p.interval80[0]),
    populationTdeeKcal,
  };
}
```

**[lu]** Métadonnée écrite, `src/domain/types.ts:213-214`

```ts
  /** Last surfaced (shown) recalibration, used for surfacing thresholds (05 s12). */
  lastSurfacedCalibration: { tdeeKcal: number; interval80Width: number; surfacedOn: string } | null;
```

**[déduit] Écritures après une calibration** :
- `computeCalibrationState` n'écrit rien : il renvoie un `CalibrationState` en mémoire (`engine.ts:599-612`).
- `markRecalibrationSeen` écrit `meta.lastSurfacedCalibration = { tdeeKcal, interval80Width, surfacedOn }` (`engine.ts:686-692`).
- `applyRecalibration` :
  - ajoute un `CalibrationSnapshot` avec `appliedAt` à `store.calibrationSnapshots`. `source` reste absent : `buildSnapshot` ne le renseigne pas ;
  - remplace `store.plan` par un `CurrentPlan` de `source: 'recalibrated'`, qui porte `personalOffsetKcal`, `populationTdeeKcal` et les intervalles ;
  - écrit `meta.lastSurfacedCalibration` ;
  - resynchronise les cibles du log **du jour** (`engine.ts:696-702`).
- Un candidat non appliqué n'est jamais persisté.

**Traçage jour par jour** : **aucun**. **[déduit]**
- `CalibrationSnapshot` ne contient que des agrégats (`types.ts:145-161`).
- Les jours reconstruits (`ReconstructedDay`) et les poids des pesées (`CalibrationFit.observationWeights`) restent en mémoire.
- `CalibrationState` (`fit` compris) est renvoyé par le worker, jamais écrit dans le store (`StoreProvider.tsx:105-110`, `setCalibration`).

---

## 3. `intakeObservationsFrom` et passerelles journal → science

### 3.1 Recherches effectuées

| Commande | Résultat |
|---|---|
| `grep -rniE "intakeObservation\|observedIntake\|loggedIntake\|intake_observation\|withLoggedIntake"` sur tout le dépôt, `*.ts *.tsx *.md *.mjs *.json`, sans `node_modules` ni `dist` | 6 fichiers, tous sous `tests/` (voir 3.2). Aucun dans `src/`, `instruct/`, `IMPLEMENTATION_NOTES.md`, `README.md`, `reports/*.md` ou `tools/` |
| `git grep -nliE "intakeObservation\|observedIntake\|loggedIntake"` sur chaque branche locale et distante | même jeu de fichiers `tests/` sur `bench/joint-bias`, `feat/*`, `main` et `origin/main`. Sur `bench/intake-logging` : seulement `tests/helpers/intakeLogging.ts`, `intakeLoggingExperiment.ts`, `tests/science/intakeLoggingModel.test.ts` |
| `git log --all -S intakeObservationsFrom` | aucun commit |
| `git log --all -S intakeObservation` | aucun commit |
| `git log --all -S observedIntake` | aucun commit |
| `git log --all -S withLoggedIntake` | `0ea4a93` (prompt 27), `5142df5` (prompt 26) |
| `git stash list` | vide |
| `grep -rn -i "journal\|intakeLogged" src/science src/store src/domain/engine.ts src/domain/views.ts src/domain/explain.ts` | `src/store/StoreProvider.tsx:4` et `:103-104` (retrait du journal), `src/domain/engine.ts:480` (commentaire `menstruating`), `src/domain/views.ts:19` (`import { localTimeOf } from './journal'`). Aucune lecture du journal |

**[lu] `intakeObservationsFrom` : non trouvé**, ni dans le code, ni dans les branches, les stashes, l'historique, les tests ou les docs (commandes ci-dessus).

### 3.2 Occurrences trouvées (variantes)

| Nom | Fichier:lignes | Statut | Appelants | Tests |
|---|---|---|---|---|
| `withLoggedIntake` | `tests/helpers/intakeLogging.ts:59-73` | implémenté, **harnais de test uniquement** | `tests/helpers/intakeLoggingExperiment.ts:98,102`, `tests/helpers/jointBias.ts:177`, `tests/helpers/jointBiasExperiment.ts:120` | `tests/science/intakeLoggingModel.test.ts:72,86`, `tests/science/jointBiasModel.test.ts:20,30` |
| `assumedIntakeKcal` | `tests/helpers/intakeLogging.ts:76-83` | implémenté, harnais | `intakeLoggingExperiment.ts:96`, `jointBiasExperiment.ts:130` | via les mêmes fichiers de test |
| `offsetLogPosterior` (copie de la boucle de `fitCalibration`) | `tests/helpers/jointBias.ts:32-134` | implémenté, harnais | `jointBias.ts:177` (`jointSlices`) | `tests/science/jointBiasModel.test.ts:22,30` (égalité exacte avec `fitCalibration`) |
| `jointSlices` | `tests/helpers/jointBias.ts:171-183` | implémenté, harnais | `jointBiasExperiment.ts:123` | `jointBiasModel.test.ts:30` |

**[lu]** `grep -rn "tests/\|helpers/" src` ne renvoie qu'une ligne, un commentaire : `src/adapters/openFoodFacts.ts:3` cite `tests/policy/static.test.ts`. Aucun fichier de `src/` n'importe `tests/helpers`. **[déduit]** Aucune passerelle journal → science n'existe dans le code de production.

### 3.3 Injection de la valeur saisie dans l'estimateur (benchmarks 26 et 27)

**Benchmark 26.** **[lu]** `tests/helpers/intakeLogging.ts:1-12`, `50-73`

```ts
/**
 * Intake logging benchmark (handoff prompt 26): what the calibration estimator would receive if users logged their
 * real daily intake. Measurement only: the production estimator (`fitCalibration`) is used unchanged.
 *
 * Experimental input path: a logged day is handed to the estimator through the existing DailyLog fields
 * (`calorieTargetForDay` = logged intake, macros scaled by logged / target, `adherence: 'on_plan'` so the day keeps
 * full evidence weight). Unlogged days keep arm A behaviour (target + declared adherence). No production line changes.
 *
 * Imperfection model (arm C), every parameter explicit:
 *   logged = true intake x (1 + underReportBias) x (1 + residualNoiseSd x z_day), on a share `dailyCoverage` of days.
 * The bias is systematic per simulated user; the estimator never receives it.
 */
```

```ts
/** Logged intake per day (null when the day is not logged). */
export function applyImperfection(trueIntakeKcal: readonly number[], draws: LoggingDraws, imp: LoggingImperfection): Array<number | null> {
  return trueIntakeKcal.map((kcal, d) => {
    if ((draws.coverageU[d] as number) >= imp.dailyCoverage) return null;
    return Math.max(0, kcal * (1 + imp.underReportBias) * (1 + imp.residualNoiseSd * (draws.noiseZ[d] as number)));
  });
}

/** Calibration input where logged days carry the logged intake; unlogged days are left untouched (arm A behaviour). */
export function withLoggedIntake(input: CalibrationInput, startDate: string, logged: ReadonlyArray<number | null>): CalibrationInput {
  const dailyLogs: DailyLog[] = input.dailyLogs.map((log) => {
    const kcal = logged[daysBetween(startDate, log.date)];
    if (kcal === null || kcal === undefined) return log;
    const ratio = kcal / log.calorieTargetForDay;
    const macros = log.macrosForDay;
    return {
      ...log,
      calorieTargetForDay: kcal,
      adherence: 'on_plan',
      ...(macros ? { macrosForDay: { proteinG: macros.proteinG * ratio, carbsG: macros.carbsG * ratio, fatG: macros.fatG * ratio } } : {}),
    };
  });
  return { ...input, dailyLogs };
}
```

**[lu]** Construction des bras, `tests/helpers/intakeLoggingExperiment.ts:92-105`

```ts
          const base = run.calibrationInputFor(days);
          const metabolic = run.windowMeanOffsetKcal(days);
          const draws = drawLogging(days, createRng(seed + LOGGING_SEED_OFFSET));
          const arms: Record<ArmKey, FitRow> = {};
          const armFor = (input: CalibrationInput) => fitRow(input, armApparentOffsetKcal(metabolic, run.trueIntakeKcal, assumedIntakeKcal(input, START_DATE, days), days));
          arms.A = armFor(base);
          arms.B = armFor(withLoggedIntake(base, START_DATE, applyImperfection(run.trueIntakeKcal, draws, PERFECT_LOGGING)));
          for (const underReportBias of PROMPT_26_BIASES) {
            for (const dailyCoverage of PROMPT_26_COVERAGES) {
              const logged = applyImperfection(run.trueIntakeKcal, draws, { underReportBias, dailyCoverage, residualNoiseSd: PROMPT_26_RESIDUAL_NOISE_SD });
              const input = withLoggedIntake(base, START_DATE, logged);
              arms[`C|${underReportBias}|${dailyCoverage}`] = armFor(input);
              arms[`Cs|${underReportBias}|${dailyCoverage}`] = armFor(withLoggingSigma(input, observableLoggingSdKcal(logged, WARM_START_INTAKE_REL_SD_HIGH)));
            }
```

**[lu]** Logs du monde simulé, un par jour, `tests/helpers/mismatchWorld.ts:141-143`

```ts
    const log: DailyLog = { date: addDays(START_DATE, d), calorieTargetForDay: calorieTarget, stepTargetForDay: reportedStepTarget, macrosForDay: plan.macros.exact };
    if (stepsLogged) log.actualSteps = loggedSteps;
    if (reported) log.adherence = adherence;
```

**[déduit] Mécanisme du 26.**
- **Fonction** : `withLoggedIntake(input, startDate, logged)`, puis `fitCalibration` de production sans modification.
- **Champ modifié** : `DailyLog.calorieTargetForDay` reçoit l'apport saisi.
- **Macros** : les trois grammes de `macrosForDay` sont multipliés par `ratio = saisi / cible` (`intakeLogging.ts:63`, `69`). Seul `carbsG` est lu par la calibration (2.2).
- **Poids d'évidence** : `adherence: 'on_plan'` est forcé (`68`), soit un poids de 1,0, × 0,7 si le jour n'a pas `actualSteps`. `actualSteps` n'est pas modifié.
- Jours non saisis (`null`) : log inchangé, donc comportement du bras A.
- Variante C+σ : `withLoggingSigma` remplace `structuralSdKcal` par `√(50² + σ_log²)` (`intakeLogging.ts:108-110`).

**Benchmark 27.** **[lu]** `tests/helpers/jointBias.ts:1-14`, `148-183`

```ts
/**
 * Joint estimation of (personal TDEE offset, intake logging bias) for the benchmark of handoff prompt 27.
 * Measurement only: nothing here is used by the application.
 *
 * Bias parametrisation (prompt 27 s3):
 *   EI(day) = logged(day) x k   when the day is logged,   k = 1 / (1 + u) >= 1
 *           = target(day)       otherwise (adherence unchanged, no imputation from logged days)
 * u is the under-reporting fraction (u = -0.20 means 20 percent under-reported, k = 1.25). The support is a grid on u.
 *
 * The bias is a nuisance parameter marginalised on a grid, the same pattern as the latent starting weight (D-10):
 * the posterior is computed on offset x u, with the starting weight marginalised inside each cell, i.e. three
 * dimensions. `offsetLogPosterior` reproduces the production likelihood of `fitCalibration` exactly (checked by test)
 * and returns the unnormalised log posterior over the offset grid, which the production function does not expose.
 */
```

```ts
/** Support of u (under-reporting fraction): -0.40 to 0 by 0.01, i.e. k from 1 to 1.667. Prompt 27: k >= 1. */
export const U_SUPPORT_MIN = -0.4;
export const U_SUPPORT_MAX = 0;
export const U_SUPPORT_STEP = 0.01;

export function uGrid(): number[] {
  const n = Math.round((U_SUPPORT_MAX - U_SUPPORT_MIN) / U_SUPPORT_STEP);
  return Array.from({ length: n + 1 }, (_, i) => Math.round((U_SUPPORT_MIN + i * U_SUPPORT_STEP) * 100) / 100);
}

export const kOf = (u: number): number => 1 / (1 + u);

/**
 * Prior on u: Normal(meanU, sdU) restricted to the support (engineering_prior, PROVISIONAL, pending literature sourcing).
 * Input parameter of the benchmark; never tuned on a metric.
 */
export type BiasPrior = { label: string; meanU: number; sdU: number };

export const NOMINAL_BIAS_PRIOR: BiasPrior = { label: 'nominal N(-10 %, 10 pts)', meanU: -0.1, sdU: 0.1 };

export type JointSlices = { u: number[]; logPost: number[][]; admissible: boolean[] };

/** One production-likelihood slice per u: logged days scaled by k = 1 / (1 + u). */
export function jointSlices(base: CalibrationInput, startDate: string, logged: ReadonlyArray<number | null>): JointSlices {
  const u = uGrid();
  const logPost: number[][] = [];
  let admissible: boolean[] = [];
  for (const ui of u) {
    const k = kOf(ui);
    const slice = offsetLogPosterior(withLoggedIntake(base, startDate, logged.map((v) => (v === null ? null : v * k))));
    if (!slice) throw new Error('joint slice failed');
    logPost.push(slice.logPost);
    admissible = slice.admissible;
  }
  return { u, logPost, admissible };
}
```

**[lu]** `tests/helpers/jointBiasExperiment.ts:117-123`

```ts
  const population = POPULATIONS[cell.population];
  const uTrue = population.meanU + population.sdU * createRng(seed + BIAS_SEED_OFFSET).normal();
  const logged = applyImperfection(run.trueIntakeKcal, drawLogging(cell.days, createRng(seed + LOGGING_SEED_OFFSET)), { underReportBias: uTrue, dailyCoverage: cell.coverage, residualNoiseSd: PROMPT_26_RESIDUAL_NOISE_SD });
  const loggedInput = withLoggedIntake(base, START_DATE, logged);
  const aFit = fitCalibration(base);
  if (!aFit) throw new Error('fit failed');
  const slices = jointSlices(base, START_DATE, logged);
```

**[déduit] Mécanisme du 27.**
- Même voie d'entrée (`withLoggedIntake`), appliquée aux valeurs saisies × `k = 1 / (1 + u)`, pour chaque `u` de −0,40 à 0 par 0,01 (41 tranches).
- Chaque tranche est une vraisemblance de production complète, recalculée par `offsetLogPosterior`, copie de la boucle de `fitCalibration` vérifiée égale au bit près (`tests/science/jointBiasModel.test.ts:16-24`).
- Le bras C-exact est la tranche `k = 1`.
- Le bras D marginalise `u` sous le prior `N(−0,10 ; 0,10)` restreint au support (`jointBias.ts:161-166`, `196-200`).
- Macros mises à l'échelle et poids `on_plan` : comme au 26.

### 3.4 Tests qui garantissent que le moteur ne lit pas le journal

**[lu]** `tests/domain/foodJournal.test.ts:174-196`

```ts
describe('journal is kept apart from the plan and the engine', () => {
  it('logging food never modifies plan targets, daily logs or the calibration', () => {
    let s = onboarded();
    for (let d = 0; d < 21; d += 3) s = addWeight(s, { date: addDays(DAY0, d), weightKg: 80 - d * 0.05 }, iso(addDays(DAY0, d)));
    for (let d = 0; d < 21; d++) s = setAdherence(s, addDays(DAY0, d), 'on_plan');
    const today = addDays(DAY0, 21);
    const withJournal = add(add(s, APPLE, addDays(DAY0, 5), 150), APPLE, today, 400);

    expect(withJournal.plan).toEqual(s.plan);
    expect(withJournal.dailyLogs).toEqual(s.dailyLogs);
    expect(withJournal.calibrationSnapshots).toEqual(s.calibrationSnapshots);
    expect(calibrationFingerprint(withJournal, today)).toBe(calibrationFingerprint(s, today));
    expect(computeCalibrationState(withJournal, today, iso(today))).toEqual(computeCalibrationState(s, today, iso(today)));
  });

  it('no engine, science, worker or calibration module reads the journal', () => {
    const files = ['src/domain/engine.ts', 'src/domain/views.ts', 'src/domain/explain.ts', 'src/store/calibration.worker.ts', 'src/store/calibrationClient.ts'];
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/foodJournal|intakeLogged|@\/domain\/journal|@\/domain\/foodSearch/);
    const journal = readFileSync('src/domain/journal.ts', 'utf8');
    const imports = [...journal.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports).toEqual(['./types', '@/persistence/schema', '@/science/dates']);
  });
});
```

**[lu]** `tests/domain/journalLibrary.test.ts:119-124`

```ts
  it('the journal screen stores products on fetch and named free entries on save', () => {
    const src = readFileSync('src/screens/Journal.tsx', 'utf8');
    expect(src).toMatch(/rememberProduct\(/);
    expect(src).toMatch(/rememberManualFood\(/);
    expect(readFileSync('src/store/StoreProvider.tsx', 'utf8')).toMatch(/foodJournal: emptyFoodJournal\(\)/);
  });
```

**[lu]** `tests/policy/static.test.ts:131-137` (worker)

```ts
  it('the calibration worker only runs the domain engine: no React, storage or network (P-01)', () => {
    const worker = read('src/store/calibration.worker.ts');
    const imports = [...worker.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports.every((m) => m === '@/domain/engine' || m === './calibrationClient')).toBe(true);
    expect(worker).not.toMatch(/localStorage|indexedDB|fetch\s*\(|XMLHttpRequest|importScripts/);
    expect(read('src/store/StoreProvider.tsx')).not.toMatch(/computeCalibrationState/);
  });
```

**[déduit] Mécanismes de vérification.**

| Test | Fichier:lignes | Mécanisme |
|---|---|---|
| `logging food never modifies plan targets, daily logs or the calibration` | `tests/domain/foodJournal.test.ts:175-187` | **dynamique** : même store avec et sans deux entrées de journal. Égalité de `plan`, `dailyLogs`, `calibrationSnapshots`, `calibrationFingerprint` et `computeCalibrationState` complet (`toEqual`) |
| `no engine, science, worker or calibration module reads the journal` | `tests/domain/foodJournal.test.ts:189-195` | **statique** : regex `/foodJournal\|intakeLogged\|@\/domain\/journal\|@\/domain\/foodSearch/` absente de 5 fichiers (`engine.ts`, `views.ts`, `explain.ts`, `calibration.worker.ts`, `calibrationClient.ts`). Imports de `src/domain/journal.ts` limités à trois modules |
| `the journal screen stores products on fetch and named free entries on save` | `tests/domain/journalLibrary.test.ts:119-124` | **statique** : `StoreProvider.tsx` doit contenir `foodJournal: emptyFoodJournal()` |
| `the calibration worker only runs the domain engine…` | `tests/policy/static.test.ts:131-137` | **statique** : le worker n'importe que `@/domain/engine` ou `./calibrationClient` ; `StoreProvider` n'appelle pas `computeCalibrationState` |

Limites de couverture constatées (**[lu]**, faits sur le texte des tests) :
- Le test statique de `foodJournal.test.ts:190` ne liste **aucun fichier de `src/science/`**.
- Sa regex cible `@\/domain\/journal` : l'import relatif `import { localTimeOf } from './journal'` de `src/domain/views.ts:19` n'est pas capté. **[lu]** `localTimeOf` (`src/domain/journal.ts:65-67`) formate une heure et ne lit pas le journal.

---

## 4. Secondaire (déjà dans le repo)

### 4.1 Prompts ou spécifications des benchmarks 26 et 27

**Non trouvé.** Recherches :
- `ls reports instruct` : pas de prompt 26 ou 27 ;
- `ls -la` à la racine : `.instruct/`, ignoré par `.gitignore:17`, n'existe pas localement ;
- `git log --all -- reports/ instruct/` : seulement `877e302`, `5142df5` et `0ea4a93` ;
- `grep -rn "32_\|rapport 32\|prompt 32"` : aucun fichier.

Les seuils de GO ne sont disponibles que **tels que reformulés par les rapports**.

**[lu]** Ajout des rapports (`git log --all --diff-filter=A`) :

| Fichier | Commit | Date |
|---|---|---|
| `reports/26_INTAKE_LOGGING_BENCHMARK.md` | `5142df5` | 2026-09-16 12:33:25 +0200 |
| `reports/27_JOINT_BIAS_ESTIMATION.md` | `0ea4a93` | 2026-09-16 17:07:05 +0200 |
| `reports/31_INVENTAIRE_DES_MESURES_ET_TESTS.md` | non suivi par git (`/reports` ignoré) | non documentée (date de fichier locale : 21 sept. 17:47, `ls -la reports`) |

**[lu]** Critères du prompt 26, tels que le rapport les cite : `reports/26_INTAKE_LOGGING_BENCHMARK.md:95-105`

````markdown
## 4. Critère de décision du prompt 26

| Condition du signal favorable | Mesure | Verdict |
|---|---|---|
| C (−20 %, 70 %) améliore la couverture 80 % sur B et F | vérité métabolique : −0,64 et −0,58 (IC excluant 0) ; vérité apparente : −0,05 et −0,04 | **non** |
| Sans dégrader la médiane d'erreur ailleurs | +130 à +270 kcal sur A, C, D, E (métabolique) | **non** |
| Sans élargissement expliquant le gain | pas de gain en C ; en C+σ, gain entièrement dû à la largeur | **non** |

**Signal défavorable, dans ses deux formes.** Seul le journal sans biais améliore quelque chose, et le gain disparaît dès qu'une sous-déclaration de 10 % est présente.

**Conclusion demandée par le prompt : la saisie alimentaire ne règle pas le problème de couverture de la calibration.** Aucune configuration n'a été cherchée pour sauver l'hypothèse.
````

**[lu]** Conditions de GO du prompt 27, telles que le rapport les cite : `reports/27_JOINT_BIAS_ESTIMATION.md:9-26`

````markdown
## 0. Verdict selon la grille de la section 10

**NO-GO identifiabilité.**

- **k n'est pas appris des pesées.** Son postérieur ne décolle du prior que sous l'effet du prior populationnel sur l'offset, jamais sous l'effet de la variation de l'apport. Avec un prior d'offset plat, le rapport de largeur postérieur / prior vaut **0,92 à 0,97**, et ce **quel que soit le CV** (0 ou 20 %) et à 42 comme à 84 jours. La corrélation offset-k atteint **−0,93 à −0,98**.
- Conséquence : **D se comporte comme un k fixé au centre du prior, avec une incertitude élargie**. On retombe sur la décision distincte prévue par le prompt : un k figé issu de la littérature.

Les deux autres conditions du GO échouent aussi, et le rapport les chiffre :

| Condition du GO | Mesure (maintien réel) | Résultat |
|---|---|---|
| k identifiable à un CV d'apport réaliste | largeur k post / prior : 0,75-0,79 sans variation avec le CV ; 0,92-0,97 avec un prior d'offset plat | **non** |
| D améliore la couverture sur B et F, sans dégrader la médiane ailleurs ni gagner par simple élargissement | B : +0,11 à +0,12 à 42 j, avec une largeur ×1,4 à ×1,6 ; B à 28 j : ≈ 0. F : +0,01 à +0,06, jamais significatif. Médiane d'erreur dégradée de **+16 à +115 kcal** sur A, C, D, E | **non** |
| D reste meilleur que A avec un prior décalé de 10 points | scénarios standards : non, même avec un prior exact, en erreur médiane ; Sara : oui | **non** (sauf Sara) |

**Réponse en une phrase à l'axe 3.** Sur les scénarios standards, D n'est meilleur que A pour **aucun** décalage de prior, prior exact compris, en erreur médiane. Sur le cas Sara, que A ne sait pas traiter, D reste meilleur que A **jusqu'à 10 points de décalage** et perd son avantage à 15 points.

**Zone grise à reporter telle quelle.** Sur B à 42 jours, D augmente la couverture du maintien réel (+0,11 [+0,03 ; +0,20]) **uniquement par élargissement honnête** (largeur 468 contre 294). L'erreur médiane ne s'améliore pas (+13 [−7 ; +50]). C'est un intervalle plus large et mieux calibré, **pas un gain de précision**.
````

### 4.2 Origine du « seuil de rentabilité ≈ 4 à 5 % » du rapport 32

**Non trouvé.** Aucun rapport 32 dans le dépôt (`ls -la reports` : 26, 27, 31 et les dossiers `intake-logging/`, `joint-bias/`). `grep -rniE "rentabilit|break.?even|4 à 5|4 a 5 ?%|4–5|4-5 ?%"` sur `reports`, `instruct`, `IMPLEMENTATION_NOTES.md`, `README.md` et `tests` : aucun résultat. Le calcul et ses lignes ne peuvent pas être établis.

### 4.3 « 1,7 » ou « 2,2 » associés au cas Sara

**[lu]** `grep -rn "1,7\|2,2\|1\.7\b\|2\.2\b"` sur `reports/*.md` et les deux `tables.md` : deux occurrences, toutes deux dans le rapport 27.

`reports/27_JOINT_BIAS_ESTIMATION.md:202`

````markdown
- Le seul gain réel concerne les utilisateurs qui ne suivent pas la cible : **Sara, erreur divisée par 1,7 à 2,2 et porte débloquée**. Sur ce cas, C-exact et D ont des erreurs comparables. D a de meilleurs intervalles vis-à-vis du maintien réel, C-exact vis-à-vis des unités de saisie.
````

`reports/27_JOINT_BIAS_ESTIMATION.md:246`

````markdown
- **Pour les utilisateurs qui ne suivent pas la cible (Sara)**, le journal apporte un gain net et robuste jusqu'à ±10 points d'erreur sur le k supposé : erreur ÷ 1,7 à 2,2, calibration débloquée.
````

**[lu]** Tables sources dans le même rapport, `reports/27_JOINT_BIAS_ESTIMATION.md:151-156` et `179-188`

````markdown
| S_on (Sara, « plan respecté ») | A | 252 | 0,12 [0,08-0,17] | 0,31 | 276 | | | 100 % |
| | C-exact | 162 | 0,48 | 0,66 | 271 | +0,36 | −90 | 100 % |
| | **D** | 144 | 0,70 [0,63-0,75] | 0,87 | 448 | **+0,58 [+0,50 ; +0,65]** | **−108 [−138 ; −94]** | 100 % |
| S_major (Sara, « écart important ») | A | 300 | 0,90 [0,86-0,94] | 1,00 | **1 011** | | | **0 %** |
| | C-exact | 162 | 0,49 | 0,67 | 289 | −0,42 | −138 | 100 % |
| | **D** | 138 | 0,72 [0,66-0,78] | 0,89 | 466 | −0,18 [−0,25 ; −0,11] | **−162 [−184 ; −121]** | **100 %** |
````

````markdown
### Sara, toutes cellules (D vs A, maintien réel)

| Scénario | Horizon | Couv. saisie 100 / 85 / 70 % : erreur D (A) · couv. 80 D (A) | Porte A → D |
|---|---:|---|---|
| S_on | 28 j | 165 (226) · 0,78 (0,42) / 159 · 0,75 / 157 · 0,71 | 100 % → 100 % |
| S_on | 42 j | 143 (252) · 0,74 (0,12) / 144 · 0,70 / 152 · 0,62 | 100 % → 100 % |
| S_major | 28 j | 165 (300) · 0,78 (0,90*) / 157 · 0,78 / 163 · 0,76 | **0 % → 100 %** |
| S_major | 42 j | 143 (300) · 0,74 (0,90*) / 138 · 0,72 / 149 · 0,69 | **0 % → 100 %** |

\* Couverture du prior : aucun apprentissage.
````

**[déduit]** Le rapport ne montre pas le calcul. Les ratios « erreur A / erreur D » tirés de ces tables :
- **42 j, saisie 85 %** (lignes 151-156) : S_on 252 / 144 = **1,75** ; S_major 300 / 138 = **2,17**. C'est la plage « 1,7 à 2,2 ».
- Toutes cellules (lignes 183-186) :
  - S_on 42 j : 1,76 / 1,75 / 1,66 ;
  - S_major 42 j : 2,10 / 2,17 / 2,01 ;
  - S_major 28 j : 1,82 / 1,91 / 1,84 ;
  - **S_on 28 j : 1,37 / 1,42 / 1,44**, hors de la plage annoncée.

Occurrence voisine, sans « 1,7 » ni « 2,2 » : `reports/26_INTAKE_LOGGING_BENCHMARK.md:128` (« divise l'erreur par 1,4 (biais −20 %) à 5 (sans biais) »).

---

## Non trouvé et incertitudes

### Non trouvé

| Point | Recherches |
|---|---|
| `intakeObservationsFrom`, ou toute passerelle journal → science en production | 3.1 : `grep` sur l'arbre, `git grep` sur toutes les branches, `git log --all -S`, `git stash list` |
| Commit et date de chaque bump de `SCIENTIFIC_MODEL_VERSION` (1.1.0, 1.2.0, 1.3.0) | `git log --all -S "SCIENTIFIC_MODEL_VERSION = '"` → seul `877e302`, déjà en 1.3.0. Le commit `37fa35d` cité par `IMPLEMENTATION_NOTES.md:48` est absent (`git cat-file -t`) |
| Prompts ou spécifications originaux des benchmarks 26 et 27, et leurs seuils de GO verbatim | `ls reports instruct`, `ls -la` (pas de `.instruct/`), `git log --all -- reports/ instruct/`. Seules les reformulations des rapports existent (4.1) |
| Rapport 32 et « seuil de rentabilité ≈ 4 à 5 % » | 4.2 |
| Règle « saisie < 50 % de la cible = journée incomplète » citée par `reports/31_INVENTAIRE_DES_MESURES_ET_TESTS.md:137` | `grep -rniE "incompl\|exploitab\|< ?0\.5" src` : aucune implémentation, seulement des textes sur les macros ou fiches incomplètes (`src/app/copy.ts`, `src/screens/Journal.tsx`) |
| « plan D-35 » cité par `reports/26_INTAKE_LOGGING_BENCHMARK.md:139` | `grep -rn "D-35"` : aucune autre occurrence, absent de `IMPLEMENTATION_NOTES.md` |
| Date de création de `reports/31_*` | fichier non suivi (`.gitignore:18`). Seule la date locale du fichier est connue |

### Incertitudes

- **Exécution nécessaire, non faite** : fréquence réelle des jours sans `DailyLog` ou sans adhérence dans des stores utilisateurs ; poids effectifs des pesées ; effet numérique de chacun des écarts listés ci-dessous. Rien n'a été exécuté.
- Le lancement au montage de l'app (2.1) est déduit de la sémantique des effets React (`StoreProvider.tsx:99-113`), pas observé.
- `git fetch` n'a pas été lancé : `origin/*` reflète le dernier fetch local.
- Les résumés de la section 1.2 sont des reformulations. Seuls les titres sont exacts.

### Incohérences relevées (une ligne chacune)

1. NASEM, REE, σ et masse grasse de départ sont calculés sur `sorted[0]`, pesée brute triée par date, sans déduplication ni bornes (`src/domain/engine.ts:617-621`, `633`). Hall démarre sur `w0 = validWeights(...)[0]`, la plus récente du jour, entre 35 et 300 kg (`src/science/calibration.ts:293`, `313`). Les deux diffèrent quand le premier jour porte plusieurs pesées.
2. La vraisemblance du warm start est référencée au NASEM du poids de début d'historique (`src/domain/engine.ts:251-253`). Elle est additionnée indice par indice à une grille référencée au NASEM de la première pesée (`engine.ts:621`, `calibration.ts:404`). Écart documenté et laissé tel quel, `IMPLEMENTATION_NOTES.md:360`.
3. La référence de pas de la calibration est `profile.averageSteps7d` courant (`engine.ts:632`), pas `CurrentPlan.maintenanceStepsPerDay` stocké (`engine.ts:137`). Une édition du profil déplace la référence pour toute la fenêtre passée.
4. La catégorie PAL est dite « figée » (`IMPLEMENTATION_NOTES.md:200`, `220` ; `engine.ts:47`), mais `updateProfile` réécrit `meta.initialPalCategory` quand l'activité change (`engine.ts:581-588`). La calibration l'applique alors au début de fenêtre (`engine.ts:620-621`).
5. D-10 ne décrit que le repli sur le log antérieur (`IMPLEMENTATION_NOTES.md:176`). Le code replie aussi sur le premier log postérieur, et sur `populationTdeeAtStartKcal` sans offset en l'absence de tout log (`calibration.ts:111-117`, `128`).
6. `instruct/05_CALIBRATION_UNCERTAINTY.md:181` dit « current step target ». Le code prend la cible stockée du jour (`calibration.ts:135`), ce qu'écrit D-10 (`IMPLEMENTATION_NOTES.md:177`).
7. La couverture d'adhérence inclut le jour de la dernière pesée (`calibration.ts:191`, `d <= spanDays`). Les poids de vraisemblance s'arrêtent la veille (`calibration.ts:302`, `309`).
8. Le commentaire de `DailyLog.macrosForDay` justifie le champ par le TEF historique (`src/science/types.ts:135-139`), alors que le TEF ne dépend plus des macros (`IMPLEMENTATION_NOTES.md:119`, `src/science/calibration.ts:130`).
9. Identifiants dupliqués D-02, D-03 et D-04 dans `IMPLEMENTATION_NOTES.md` (lignes `126`, `132`, `139` et `750`, `754`, `758`).
10. La section 11 indique « Schéma | 2 | 2 (inchangé) » (`IMPLEMENTATION_NOTES.md:953`), alors que l'en-tête et le code donnent 6 (`IMPLEMENTATION_NOTES.md:6`, `src/domain/types.ts:26`).
11. Le test d'isolation statique ne couvre pas `src/science/` et ne capte pas l'import relatif `./journal` de `src/domain/views.ts:19` (`tests/domain/foodJournal.test.ts:190-191`).
12. Le rapport 27 annonce une erreur « ÷ 1,7 à 2,2 » sur Sara (`reports/27_JOINT_BIAS_ESTIMATION.md:202`, `246`). Ses propres cellules S_on à 28 j donnent 226 / 165, 159 et 157, soit 1,37 à 1,44 (`reports/27_JOINT_BIAS_ESTIMATION.md:183`).
