# 42. Nettoyage du dépôt git

Date : 28/09/2026. Marquage : [lu] lu dans un fichier ou une sortie, [mesuré] obtenu en lançant une commande, [déduit] conclusion tirée des deux.

## 1. Pour John, en 10 lignes

1. `main` n'était **pas** rouge : la CI est verte depuis le 23/09 (`eeb450e`). Seul `ac35cdf` avait échoué, et son correctif est déjà dans `main` [mesuré].
2. La branche de mesure avait été fusionnée une fois dans `main` (le 23/09, la phase 1) : 53 Mo de bruts s'y trouvaient [mesuré].
3. La branche de mesure n'avait **jamais été envoyée** sur GitHub : elle n'existait que sur ce PC [mesuré].
4. Fait : les rapports 31 et 33 à 41 sont enregistrés sur la branche de mesure, et l'étiquette `archive/bench-journal-battery` est posée [mesuré].
5. Fait : les bruts sont retirés de `main`, le `.gitignore` bloque bruts, zips et `prompt/`, et ce guide est écrit ; tests et build sont verts [mesuré].
6. Sauvegarde complète : `..\wheighty-sauvegarde-2026-09-28.bundle` et `..\wheighty-sauvegarde-2026-09-28-fichiers\`. Une restauration d'essai est réussie [mesuré].
7. **À faire par John** (les permissions de Claude Code ont bloqué ces opérations) : envoyer la branche de mesure et `main` sur GitHub, puis supprimer les branches obsolètes, les zips en double et l'ancien dossier `Weighty-bench`. Les commandes sont en section 3.
8. Sur GitHub : vérifier que *Settings > Pages > Source* est bien sur **GitHub Actions** (section 4).
9. Mettre le `.bundle` sur une clé USB ou dans un cloud : il est sur le même disque que le dépôt.
10. Guide à suivre ensuite : `docs/GIT_POUR_JOHN.md`.

## 2. L'audit (état avant nettoyage)

### 2.1 Branche courante et état de travail
- `git status` : branche `bench/journal-battery`, `.gitignore` modifié, 12 fichiers non suivis (rapports 31, 33 à 41, `it2d_revue.zip`, `tests/experiments-journal/results/results.zip`) [mesuré].
- `git stash list` : vide [mesuré].
- `git worktree list` : un second dossier `../Weighty-bench`, en HEAD détachée sur `7715d50` (23/09) [mesuré].
  - Ses 93 « modifications » ne sont que des fins de ligne : le contenu est identique une fois les CR retirés [mesuré].
  - Ses 108 bruts non suivis sont identiques octet par octet à ceux de la branche de mesure [mesuré].

### 2.2 Branches et tags (`git branch -a -vv`, `git ls-remote origin`)
| Branche | Pointe | Sur GitHub | Dans `main` |
|---|---|---|---|
| `main` | `eeb450e` (23/09) | oui | — |
| `bench/journal-battery` | `d19bd1e` (28/09) | **non** | non (44 commits en plus) |
| `feat/food-journal` | `1bcdac5` | non | oui |
| `feat/food-journal-ui` | `32f9267` | non | oui |
| `feat/journal-library` | `b83e5e9` | non | oui |
| `bench/intake-logging` | `5142df5` | non | oui |
| `bench/joint-bias` | `0ea4a93` | non | oui |

Aucun tag avant l'audit [mesuré]. Sur GitHub : uniquement `main` [mesuré].

### 2.3 Le graphe, en français simple
- L'historique est une seule ligne du 15/09 au 21/09 : premier envoi, journal alimentaire, benchmarks 26 et 27, puis `54f6dd9` et `ac35cdf` [mesuré].
- Le 23/09, deux chemins partent de `ac35cdf` [mesuré] :
  - la branche de mesure (`fcfdd47`, les seuils, le harness, les bruts N1 à N4, jusqu'à `5b17b73`) ;
  - sur `main`, une copie du même correctif (`5e4f5d8`).
- Le même soir, `eeb450e` réunit les deux chemins : c'est la fusion de la phase 1 dans `main` [mesuré].
- Ensuite, seule la branche de mesure avance : 44 commits, de la phase 1b à l'itération 2d [mesuré].

### 2.4 Fusions dans `main` (`git log --merges main`)
- Une seule : `eeb450e` « Merge branch 'bench/journal-battery': journal battery phase 1 », parents `5e4f5d8` et `5b17b73` [mesuré].
- Elle a apporté 406 fichiers [mesuré] :
  - `src/domain/intakeObservations.ts`, `src/domain/journalCalibration.ts` (prototype journal, derrière une option) et `src/science/calibration.ts` ;
  - le harness `tests/experiments-journal/` et `vitest.journal.config.ts` ;
  - `tests/helpers/journalBattery.ts` et `tests/helpers/journalExport.ts` ;
  - les tests `tests/domain/journalCalibration.test.ts` ;
  - les résultats `tests/experiments-journal/results/` : 337 fichiers, dont 237 `.csv.gz` (52,8 Mo).

### 2.5 La branche de mesure est-elle dans `main` ?
- `git merge-base --is-ancestor bench/journal-battery main` : non. La base commune est `5b17b73` [mesuré].
- Ce que la branche a en plus, côté app : `src/domain/engine.ts`, `src/science/goals.ts`, `src/science/modeledBody.ts` (nouveau), `src/domain/journalCalibration.ts`, `src/science/calibration.ts` et `src/domain/intakeObservations.ts`. Cela fait 616 lignes ajoutées [mesuré].

### 2.6 Taille (`git count-objects -vH`, parcours de `git rev-list --objects --all`)
- Pack local : 96,9 Mo ; dossier `.git` : 274 Mo ; dépôt sur GitHub : 57 Mo [mesuré].
- Blobs accessibles depuis `main` : 57,1 Mo sur disque [mesuré].
- Les 20 plus gros fichiers de l'historique sont tous des bruts de la branche de mesure, absents de l'historique de `main` [mesuré] :
  - `tests/experiments-journal/results/it2d/v3/v3-shard0.csv.gz` à `v3-shard15.csv.gz` : 3,11 à 3,16 Mo chacun ;
  - `it2d/v2/v2-shard1`, `v2-shard3`, `v2-shard8` et `v2-shard10.csv.gz` : environ 1,44 Mo chacun.
- `tests/experiments-journal/results/` pèse 266 Mo sur disque, toutes branches confondues [mesuré].

### 2.7 La CI de `main`
- Le workflow `.github/workflows/deploy.yml` [lu] :
  - il se déclenche sur un envoi (push) sur `main` ;
  - il lance, avec Node 22, `npm ci`, `typecheck`, `lint`, `npm test` et `build` ;
  - il publie ensuite `dist/` sur Pages.
- Historique des exécutions, lu via l'API publique de GitHub [mesuré] :
  - `ac35cdf` (21/09) : échec au typecheck, dans `src/screens/Journal.tsx` (lignes 794 à 823) ; les propriétés `PORTION_TEXT.createOpen`, `createClose`, `createSave` et `createCancel` n'existent pas ;
  - `eeb450e` (23/09) : build et déploiement réussis.
- Dans un worktree détaché sur `main` (`../Weighty-audit-main`), avec Node 24.19 [mesuré] :
  - `npm ci`, typecheck et lint : OK ;
  - `npm test` : 43 fichiers, 517 tests réussis, 37 s ;
  - `npm run build` : OK.
- Conclusion : `main` est verte, rien à réparer [déduit]. Seuls restent des avertissements de GitHub (Node 20 obsolète pour `actions/checkout@v4` et `actions/setup-node@v4`, migration d'`ubuntu-latest` le 19/10). Ils ne sont pas bloquants et sont laissés à la passe 5a [lu].

### 2.8 Le correctif `fcfdd47`
- Il touche `src/app/copy.ts` (ajout des quatre textes `create*`) et `tests/policy/static.test.ts` (4 emplacements d'erreur au lieu de 2) [lu].
- Il répare exactement l'échec de `ac35cdf` [déduit].
- Il est dans `main` deux fois [mesuré] :
  - via la fusion : `git merge-base --is-ancestor fcfdd47 main` renvoie oui ;
  - via sa copie `5e4f5d8`, dont le `patch-id` est identique.
- Aucun cherry-pick n'est nécessaire [déduit].

### 2.9 Pages
- Le déploiement passe par le workflow `deploy.yml` (actions `upload-pages-artifact` et `deploy-pages`). Il se déclenche depuis `main` [lu].
- Le dernier déploiement `github-pages` est celui de `eeb450e`, le 23/09 [mesuré].
- Jusqu'au 21/09, des exécutions « pages build and deployment » (déploiement depuis une branche) avaient lieu en parallèle. Il n'y en a plus depuis : la source est probablement passée sur « GitHub Actions » [déduit]. À vérifier par John.
- L'adresse est `https://johnathank78.github.io/Weighty/` (200). `/wheighty/` renvoie 404 [mesuré]. L'app utilise une base relative (`./`) : c'est donc sans effet [lu].

### 2.10 Le `.gitignore` local
- L'unique changement est la suppression de la ligne `/reports` [mesuré].
- Il a du sens : les rapports 26 et 27 sont déjà versionnés, et la ligne cachait les rapports 31 à 41 [déduit].

### 2.11 Ce qui appartient à la branche de mesure
- Les rapports 34 à 41. Les rapports 31 (21/09) et 33 (23/09) sont antérieurs : sur recommandation acceptée par John, ils sont rangés avec eux [lu].
- `results.zip` (48 fichiers) et `it2d_revue.zip` (272 fichiers) : tout leur contenu est déjà versionné sur la branche de mesure, à l'identique (comparaison par empreinte git) [mesuré].
- `prompt/` (ajouté par John pendant le nettoyage) : des prompts privés, jamais versionnés. Ils sont désormais ignorés [mesuré].

## 3. Le plan et les décisions de John

Sauvegarde, faite avant toute modification [mesuré] :
- `git bundle create ../wheighty-sauvegarde-2026-09-28.bundle --all` (283 Mo). `git bundle verify` : okay. Une restauration d'essai (`git clone` du paquet) retrouve les 7 branches aux mêmes commits, et `git fsck` est propre.
- `../wheighty-sauvegarde-2026-09-28-fichiers/` contient :
  - les fichiers non suivis ;
  - `reports/` en entier ;
  - `git diff` et le `.gitignore` modifié ;
  - les 285 fichiers ignorés hors `node_modules` et `dist` (journaux d'exécution, `.claude/`) ;
  - l'état et les bruts de `Weighty-bench` ;
  - `prompt/`.
- Des tags `sauvegarde/2026-09-28/<branche>` sur les 7 branches, en local.

John a répondu « oui pour tout », avec le rapport 31 et le rapport 33 sur la branche de mesure, et l'envoi de la branche de mesure accepté malgré le dépôt public.

| # | Opération | Décision | Résultat |
|---|---|---|---|
| 1 | Enregistrer les rapports 31, 33 à 41 sur la branche de mesure (`git add -f`) | acceptée | fait : `c6239d8` [mesuré] |
| 2 | Tag `archive/bench-journal-battery` | acceptée | fait en local, sur `c6239d8` [mesuré] |
| 3 | Envoyer la branche de mesure et le tag | acceptée | **bloquée par les permissions de Claude Code** : à faire par John |
| 4 | Retirer `tests/experiments-journal/results/` de `main` (option A, `git rm -r --cached`) | acceptée | fait : `8611803`. Les fichiers restent sur le disque, ignorés [mesuré] |
| 5 | `.gitignore` : `/reports` retirée ; `/prompt/`, `*.zip` et `tests/experiments-journal/results/` ajoutés | acceptée | fait : `8611803` [mesuré] |
| 6 | Guide et rapport 42, vérifications, fusion dans `main` | acceptée | fait en local [mesuré] |
| 7 | Envoyer `main` | acceptée | **bloquée** : à faire par John |
| 8 | Supprimer les 5 branches déjà dans `main` | acceptée | **bloquée** : à faire par John |
| 9 | Supprimer les deux zips en double | acceptée | **bloquée** : à faire par John |
| 10 | Retirer le worktree `../Weighty-bench` | acceptée | **bloquée** : à faire par John |
| 11 | Retirer le worktree d'audit `../Weighty-audit-main` | acceptée | non tentée après les refus : à faire par John |

Les étapes non proposées :
- **Option B** (réécriture de l'historique) : le dépôt fait 57 Mo, et le plus gros fichier 3,2 Mo [déduit].
- **Correctif de CI** : ce n'est pas nécessaire.

### Commandes à lancer par John, dans le dossier `Weighty`

Chaque bloc s'annule avec la commande indiquée en commentaire.

```
git push -u origin bench/journal-battery
git push origin archive/bench-journal-battery
git push origin main
```
Ces trois commandes publient : c'est normal, c'est l'objectif.

```
git branch -d feat/food-journal feat/food-journal-ui feat/journal-library bench/intake-logging bench/joint-bias chore/nettoyage-git
```
Pour annuler : `git branch <nom> sauvegarde/2026-09-28/<nom>`. `-d` refuse de supprimer une branche qui ne serait pas déjà dans `main`.

```
del it2d_revue.zip
del tests\experiments-journal\results\results.zip
```
Les copies sont dans `..\wheighty-sauvegarde-2026-09-28-fichiers\non-suivis\`.

```
git worktree remove --force ../Weighty-bench
git worktree remove --force ../Weighty-audit-main
```
Pour annuler : `git worktree add ../Weighty-bench 7715d50`.

## 4. État final

Au moment de l'écriture, avant les commandes de John [mesuré] :
- Branches locales :
  - `main` : pointe sur le commit qui contient ce rapport ;
  - `chore/nettoyage-git` : fusionnée dans `main` ;
  - `bench/journal-battery` : `c6239d8` ;
  - les 5 branches déjà fusionnées, en attendant leur suppression.
- Tags : `archive/bench-journal-battery` et les 7 `sauvegarde/2026-09-28/*`, en local.
- CI : verte sur `origin/main` (`eeb450e`). En local sur `main` : typecheck, lint, 517 tests (30 s) et build OK.
- Taille : 394 fichiers dans l'arbre de `main` au lieu de 731, sans aucun brut. L'historique garde les 57 Mo.
- Après l'envoi de la branche de mesure, le dépôt GitHub devrait peser environ 300 Mo. Cela reste sous les 500 Mo, avec aucun fichier au-dessus de 3,2 Mo [déduit].

Réglages GitHub à faire à la main :
1. **Pages** : Settings > Pages > « Build and deployment » > Source : choisir **GitHub Actions** (probablement déjà réglé). Laisser vide toute ligne « Branch ».
2. **Protection de `main`**, facultative mais conseillée :
   - aller dans Settings > Rules > Rulesets > New ruleset > New branch ruleset ;
   - nommer la règle `main` et mettre Enforcement status sur **Active** ;
   - dans Target branches, faire Add target > Include default branch ;
   - cocher **Restrict deletions** et **Block force pushes** ;
   - ne rien cocher d'autre, pour que John puisse continuer à envoyer directement sur `main` ;
   - cliquer sur Create.

## 5. Ce que la passe 5a doit savoir

- **Dans `main`** : le prototype de calibration en mode journal (phase 1), derrière une option [lu].
  - `src/domain/journalCalibration.ts`, `src/domain/intakeObservations.ts`, `src/science/calibration.ts` ;
  - le harness de la phase 1 (`tests/experiments-journal/*.experiment.ts`, `measures.ts`, `capture/`) ;
  - `tests/helpers/journalBattery.ts`, `tests/helpers/journalExport.ts` et `vitest.journal.config.ts`.
- **Pas dans `main`** : le solveur recalculé tous les 28 jours et les garde-fous. Ils sont sur `bench/journal-battery`, à `c6239d8`, tag `archive/bench-journal-battery` (le code est inchangé depuis `d19bd1e`) [mesuré] :
  - `src/domain/engine.ts:799`, `periodicReplan(store, today, { replanEveryDays, solver })` : le recalcul périodique ;
  - `src/domain/engine.ts:816` et `src/domain/engine.ts:839`, `PlanGuardrailRule` (`'G1' | 'G2'`) et `enforcePlanGuardrails` : les garde-fous du plan ;
  - `src/science/goals.ts:139`, `hardFloorKcal`, et `src/science/goals.ts:445`, `guardrailMaxWeeklyRate` ;
  - `src/science/modeledBody.ts` (nouveau fichier, 120 lignes) ;
  - les changements dans `journalCalibration.ts`, `calibration.ts` et `intakeObservations.ts` ;
  - les tests `tests/domain/solverPrototype2b.test.ts`, `tests/domain/planGuardrails2c.test.ts` ; le simulateur `tests/helpers/closedLoop.ts` ; les harness `tests/experiments-journal/it2*/`.
  - Tout cela est « measurement only » : ces fonctions ne sont appelées ni par le store, ni par le worker, ni par l'UI [lu].
  - Pour les amener dans `main`, il faut les recopier fichier par fichier ou par cherry-pick ciblé. **Jamais par une fusion de la branche** [déduit].
- **La commande de test par défaut** : `npm test`, soit `vitest run` avec `vitest.config.ts`, qui ne lance que `tests/**/*.test.ts` [lu].
  - Les expériences (`*.experiment.ts`) sont exclues ; elles ne tournent qu'avec `npx vitest run -c vitest.journal.config.ts` [lu].
  - Durée sur `main` : 517 tests en 30 à 37 s. Sur la branche de mesure : 575 tests en 42 s [mesuré].
- **Versions** : modèle scientifique `SCIENTIFIC_MODEL_VERSION = '1.3.0'` (`src/science/constants.ts:12`), schéma de données `SCHEMA_VERSION = 6` (`src/domain/types.ts:26`). Elles sont identiques sur `main` et sur la branche de mesure [mesuré].
