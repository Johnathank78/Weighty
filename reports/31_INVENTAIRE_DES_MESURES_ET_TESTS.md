# Inventaire : tout ce qui a été testé, et comment

État du dépôt à la rédaction : branche `main`, dernier commit `54f6dd9`, modifications en cours non commitées sur `src/app/copy.ts`, `src/components/BottomSheet.tsx`, `src/screens/Account.tsx`, `src/screens/Journal.tsx`, `src/styles/app.css`.

Deux natures de vérification coexistent, à ne pas confondre :

| Nature | But | Où | Lancé par |
|---|---|---|---|
| **Mesures** (benchmarks 26 et 27) | répondre à une question scientifique par simulation, sans rien changer à l'app | `reports/26_*`, `reports/27_*`, `tests/experiments*/` | commande dédiée, **hors** `npm test` |
| **Tests automatiques** | empêcher une régression, vérifier une règle | `tests/**/*.test.ts` | `npm test` |

Total : **421 tests déclarés** dans 42 fichiers, plus **36 tests générés** par la suite mismatch (4 fichiers), soit 457.

---

# Partie A. Les mesures (simulation)

## A1. Benchmark 26 : la saisie alimentaire aide-t-elle la calibration ?

Rapport complet : [`26_INTAKE_LOGGING_BENCHMARK.md`](26_INTAKE_LOGGING_BENCHMARK.md). Tables : [`intake-logging/tables.md`](intake-logging/tables.md).

**Question.** Remplacer « calories cibles + pondération d'adhérence » par « apport saisi » améliore-t-il la calibration ?

**Comment.** Le monde simulé et l'estimateur de production (`fitCalibration`) sont identiques entre les bras ; **seule l'information transmise change**. L'apport saisi est passé par les champs existants du `DailyLog` (la cible du jour reçoit la valeur saisie, les macros sont mises à l'échelle, le jour compte pour un poids d'évidence plein). Aucune ligne de `src/` modifiée.

| Bras | Contenu |
|---|---|
| A | méthode actuelle : cibles + adhérence |
| B | journal parfait (plafond théorique, jamais une base de décision) |
| C | journal réaliste : `saisi = réel × (1 + biais) × (1 + 0,08 z)` sur une part des jours |
| C+σ | variante de C avec une marge d'incertitude déduite d'observables (sensibilité, non validée) |

**Plan.** 6 scénarios du benchmark mismatch (A dérive, B apport caché, C biais du podomètre, D eau autocorrélée, E épisodes hydriques, F combiné) plus 2 scénarios ajoutés hors prompt (Sara mangeant 270 kcal sous la cible, déclarant « plan respecté » ou « écart important »). Horizons 28 et 42 jours. Biais 0 / −10 / −20 %, couverture 100 / 85 / 70 %. **n = 210 par cellule** (5 réplications × 42 utilisateurs), seeds déterministes, masques de couverture emboîtés et bruit partagé pour que les cellules soient appariées.

**Mesuré contre deux vérités** : le maintien réel, et le maintien exprimé dans les unités de saisie. Métriques : erreur médiane, biais moyen, couvertures 80 et 95 % avec intervalle de Wilson, largeur médiane, différences appariées vs A (bootstrap de 2 000 tirages pour l'erreur).

**Résultat.** Défavorable au sens du prompt : le gain n'existe qu'avec un journal non biaisé et disparaît dès 10 % de sous-déclaration. Gain réel et isolé sur le cas Sara (première mise à jour débloquée de 0 % à 100 %).

## A2. Benchmark 27 : peut-on estimer le biais de saisie en même temps que le maintien ?

Rapport complet : [`27_JOINT_BIAS_ESTIMATION.md`](27_JOINT_BIAS_ESTIMATION.md). Tables : [`joint-bias/tables.md`](joint-bias/tables.md).

**Comment.** Grille en trois dimensions : offset (481 valeurs) × facteur de biais k (41 valeurs, de 1 à 1,667 par pas de 0,01) × poids initial (121 valeurs, marginalisé dans chaque cellule). Pour chaque k, la vraisemblance de production est **recalculée intégralement** (Hall n'est pas linéaire, aucune approximation). La copie de la boucle de `fitCalibration` est vérifiée **exactement égale** à la sortie de production par test.

| Bras | Contenu |
|---|---|
| A | méthode actuelle |
| C-exact | saisie traitée comme exacte (tranche k = 1 de la même grille) |
| D | estimation conjointe : k marginalisé sous un prior provisoire |

**Trois axes.**
1. **Identifiabilité** : variabilité intra-utilisateur de l'apport réel à 0, 5, 10 et 20 %, sur 28, 42 et 84 jours. Mesures : largeur du postérieur de k rapportée au prior, corrélation offset-k, erreur sur k, masse aux bornes.
2. **Performance** : 8 scénarios × 2 horizons × 3 couvertures.
3. **Robustesse** : priors délibérément faux (centres 0 à −20 %, écart-type divisé ou multiplié par 2) sur trois populations de biais réelles (−5, −10, −20 %).

**Sonde d'attribution** : la même mesure avec un prior d'offset plat, pour savoir si le resserrement de k vient des pesées ou du prior populationnel.

**Volume.** 92 cellules × 210 utilisateurs × 42 vraisemblances ≈ **811 000 calibrations complètes**, 20,2 h de CPU, 87 min réelles sur 16 threads.

**Résultat.** NO-GO identifiabilité : k n'est pas appris des pesées (corrélation jusqu'à −0,97, largeur inchangée quand la variabilité passe de 0 à 20 %, et 0,92-0,97 avec un prior plat).

## A3. Tests qui protègent ces mesures

Ce sont de vrais tests, dans `npm test`.

- `tests/science/intakeLoggingModel.test.ts` (10) : le biais s'applique bien multiplicativement, la couverture est respectée et les masques sont emboîtés, les tirages sont déterministes, le monde et l'entrée du bras A restent inchangés, **l'estimateur ne reçoit jamais le biais ni l'apport réel**, les définitions de vérité sont cohérentes.
- `tests/science/jointBiasModel.test.ts` (10) : égalité exacte avec le posterior de production, C-exact = tranche k = 1, support de k conforme, diagnostics de bornes, tirage du biais par profil et apparié entre populations, déterminisme, absence de fuite, effet du réglage de variabilité d'apport.

---

# Partie B. La suite automatique (`npm test`)

## B1. Science du moteur

| Fichier | Tests | Ce qui est vérifié, et comment |
|---|---:|---|
| `science/ree.test.ts` | 16 | équations de métabolisme de repos et routage entre elles, valeurs attendues codées en dur |
| `science/activity.test.ts` | 17 | énergie des pas, MET, allures, postures |
| `science/nasemTef.test.ts` | 7 | équations NASEM et effet thermique |
| `science/macros.test.ts` | 14 | protéines, lipides, glucides, règles et planchers |
| `science/goals.test.ts` | 21 | vitesses, plancher calorique sexué, faisabilité, slider pas |
| `science/hall.test.ts` | 14 | modèle de Hall comparé à une trajectoire de référence (`tests/fixtures/hall-reference.json`) |
| `science/constants.test.ts` | 11 | chaque constante publiée a une catégorie et une source déclarées |
| `science/golden.test.ts` | 4 | 12 profils de référence, sorties figées en snapshot |
| `science/propertyMatrix.part1-4.test.ts` | 4 | 10 000 profils aléatoires, propriétés invariantes (monotonie, continuité, bornes) |

## B2. Calibration

| Fichier | Tests | Ce qui est vérifié, et comment |
|---|---:|---|
| `science/calibration.test.ts` | 25 | porte de première recalibration, reconstruction des jours, posterior, plancher structurel, confiance, conditions d'affichage |
| `science/calibrationLongHorizon.test.ts` | 2 | comportement sur horizons longs |
| `science/calibrationMismatch.part1-4.test.ts` | 36 générés | **benchmark de référence T-04** : 6 scénarios où le monde ne suit pas les hypothèses de l'estimateur, 42 utilisateurs chacun, à 42 et 84 jours ; l'issue de chaque critère est enregistrée, donc toute évolution fait échouer le test |
| `science/calibrationPerf.test.ts` | 2 | coût du calcul à 84 / 180 / 365 jours, garde-fou large |
| `science/warmStartDomain.test.ts` | 11 | domaine admissible de Hall, offsets exclus |
| `science/warmStartExactRules.test.ts` | 10 | règles exactes de cohérence et de conflit du démarrage à chaud |
| `domain/warmStart.test.ts` | 12 | vraisemblance historique, fusion, confiance |
| `domain/warmStartReferenceCases.test.ts` | 5 | cas de référence figés en snapshot |
| `domain/convergenceJourney.test.ts` | 4 | **parcours de 84 jours** à travers le vrai moteur : onboarding, pesées, journées notées, recalibrations acceptées ; nombre de recalibrations et amplitude de la cible enregistrés |

## B3. Journal alimentaire (prompts 29 et 30)

| Fichier | Tests | Ce qui est vérifié, et comment |
|---|---:|---|
| `domain/foodJournal.test.ts` | 16 | les entrées **figent** les valeurs au moment de la saisie (une correction de source ne réécrit jamais un jour passé), entrées manuelles, portions, totaux du jour, macros manquantes signalées une par une, table Ciqual embarquée et recherche locale, et **cloisonnement** : le journal ne touche ni le plan, ni les journaux quotidiens, ni la calibration |
| `domain/journalLibrary.test.ts` | 23 | « Mes aliments » : stockage automatique, bornage par usage récent, fusion en une seule liste sans doublon, repères horaires, masquage à l'écran (état d'affichage seulement, jamais stocké), portions et poids unitaire |
| `domain/journalUiPass.test.ts` | 15 | heure de consommation distincte de l'heure de saisie, cas de minuit, migration de schéma 3 vers 4, jauges, détection de code-barres native |
| `domain/journalOfflineJourney.test.ts` | 2 | parcours complet **sans aucune requête réseau**, puis dégradation propre hors ligne avec l'option activée |
| `adapters/openFoodFacts.test.ts` | 16 | **verrou d'activation** (rien n'est envoyé tant que l'option est éteinte, relu à chaque appel), contenu exact des requêtes, dégradations (hors ligne, échec réseau, expiration, produit absent, limite de débit, réponse malformée) |
| `vision/eanDecoder.test.ts` | 4 | lecteur de code-barres léger : vitesse compatible caméra, lecture de biais, aucun code inventé, chiffre de contrôle |
| `persistence/foodJournalPersistence.test.ts` | 14 | migrations de schéma 2 à 6, aller-retour stockage et export, refus des fichiers invalides, récupération partielle, suppression locale totale |

## B4. Domaine, écrans, persistance et politiques

| Fichier | Tests | Ce qui est vérifié, et comment |
|---|---:|---|
| `domain/engine.test.ts` | 8 | cas d'usage du moteur (pesées, pas, adhérence, journaux) |
| `domain/onboarding.test.ts` | 27 | valeurs affichées contre valeurs stockées, validations |
| `domain/explainAndScreens.test.ts` | 13 | « Pourquoi ce résultat ? » contre les valeurs réelles du moteur, progression vers la porte |
| `domain/explanationPanel.test.ts` | 18 | détails scientifiques, **tests lexicaux** (le maintien n'est jamais présenté comme une dépense réelle) |
| `domain/trackingChart.test.ts` | 14 | échelle du graphique, jonction de la projection, fenêtres 1 mois / 3 mois / tout, alternative textuelle, aucune bibliothèque de graphiques |
| `domain/weighInNote.test.ts` | 7 | la note de pesée **ne change strictement rien** à la tendance, à la calibration ni au plan ; migration 5 vers 6 |
| `persistence/storage.test.ts` | 18 | aller-retour du store, migrations, import et export |
| `policy/static.test.ts` | 23 | contrôles statiques : aucun tiret cadratin dans l'interface, **aucun appel réseau ni URL distante** hors adaptateur, polices locales, frontières entre couches |
| `policy/genderAgreement.test.ts` | 4 | accords en genre conformes au profil, aucune forme genrée résiduelle |

---

# Partie C. Ce qui n'a pas été testé

Vérifié dans le code du simulateur : le modèle d'imperfection n'a que trois paramètres, **tous constants sur la fenêtre** (biais, couverture, bruit journalier).

| Sujet | État | Pourquoi ça manque |
|---|---|---|
| **Journées partielles** | non testé | un jour est saisi en entier ou pas du tout ; aucune troncature en cours de journée, et la corrélation « le repas oublié est le plus calorique » n'est pas modélisée |
| **Taux d'abandon** | non testé | la couverture est fixe et tirée au hasard, sans décrochage progressif ni effet week-end |
| **Règle d'exploitabilité et efficacité du filtre** | non testé | la règle « saisie < 50 % de la cible = journée incomplète » n'a jamais été mesurée (ni faux rejets, ni faux passages) |
| **Seuil de bascule sur écart persistant** | non testé | aucun taux de fausse bascule, aucun délai de déclenchement |
| **Hystérésis du retour** | non testé | tous les mondes sont stationnaires : personne ne revient vers sa cible |
| **Dérive de k** | non testé | le biais est tiré une fois par utilisateur et reste constant ; le NO-GO du 27 porte donc sur le cas le plus favorable |
| **Maintien réel en parallèle** (protéines, plancher, énergie disponible) | non testé, non représenté | les benchmarks ne mesurent que l'estimation du maintien ; si la cible est exprimée dans les unités de saisie, le plancher protège un nombre saisi, pas l'apport réel, ce qui est prudent chez un sous-déclarant mais permissif chez un sur-déclarant (12 à 37 % des utilisateurs simulés) |
| **Validation sur données humaines** | absente | le modèle de Hall est validé contre un portage numérique, jamais contre des mesures réelles ; les simulateurs utilisent ce même modèle, donc ils sont optimistes par construction |
| **Réduction du biais par une base d'aliments** | non mesurable en simulation | il faudrait des données réelles ou une source publiée |

---

# Comment rejouer

Suite automatique complète :

```bash
npm run check
```

Benchmark 26, environ 6 min :

```bash
npx vitest run -c vitest.experiments.config.ts
```

Benchmark 27, environ 87 min :

```bash
npx vitest run -c vitest.joint.config.ts
```

Sonde d'attribution de l'axe 1 seule, environ 5 min :

```bash
npx vitest run -c vitest.joint.config.ts tests/experiments-joint/flat-offset-prior.experiment.ts
```

Benchmark de référence de la calibration (T-04) seul :

```bash
npx vitest run tests/science/calibrationMismatch
```
