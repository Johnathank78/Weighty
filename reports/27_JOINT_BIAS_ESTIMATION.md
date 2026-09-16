# Benchmark : estimation conjointe (offset TDEE, biais de saisie), prompt 27

Tâche de **mesure uniquement**. Aucune ligne de `src/` modifiée, aucun golden ni snapshot touché, pas de bump de `SCIENTIFIC_MODEL_VERSION` (1.3.0) ni de `SCHEMA_VERSION` (2). Branche `bench/joint-bias`, créée depuis `bench/intake-logging`, non fusionnée et non poussée.

Tables complètes générées : [`joint-bias/tables.md`](joint-bias/tables.md) (92 cellules, deux références, trois axes).

---

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

---

## 1. Préconditions et versions

| Point | Résultat |
|---|---|
| `git status` | propre sur `bench/intake-logging` (`5142df5`) |
| Rejeu du prompt 26 | 16/16 cellules ; **sorties identiques octet pour octet** (aucun diff sous `reports/intake-logging/`) |
| Modèle scientifique | `SCIENTIFIC_MODEL_VERSION = 1.3.0`, `SCHEMA_VERSION = 2` |
| Estimateur de référence | `fitCalibration` de production : grille d'offset −1 200 à +1 200 par 5, poids initial marginalisé (±3 kg par 0,05), Student-t (df 4, échelle 0,6 kg), plancher structurel σ 50 (D-33) |
| Référence 1 | maintien réel : offset métabolique moyen sur la fenêtre |
| Référence 2 | maintien dans les unités de saisie : offset métabolique − moyenne(apport réel − apport supposé), avec l'apport saisi brut les jours saisis et la cible sinon |

Les références A et C-exact de **cette session** figurent dans les tables des sections 4 et 5. Les chiffres du prompt 26 ne sont pas réutilisés : les populations de biais sont désormais tirées par utilisateur.

## 2. Méthode

### Paramétrage et estimateur

- `EI = saisi × k` les jours saisis, `EI = cible` sinon (adhérence inchangée). **Aucune imputation.**
- `k = 1 / (1 + u)`, où u est la fraction de sous-déclaration.
- **Support de u** : −0,40 à 0 par 0,01 (41 valeurs), soit **k ∈ [1 ; 1,667]**, conformément à `k ≥ 1`.
- **Marginalisation en trois dimensions** : offset (481) × k (41) × poids initial (121, dans chaque cellule).
  - Pour chaque k, les jours saisis sont multipliés par k et la vraisemblance de production est recalculée intégralement : Hall n'est pas linéaire, et aucune approximation n'est introduite.
  - `tests/helpers/jointBias.ts` recopie la boucle de `fitCalibration` pour exposer le log-postérieur non normalisé. Un test vérifie l'**égalité exacte** avec le postérieur de production.
- **C-exact** : tranche k = 1 de la même grille (égalité exacte vérifiée par test).
- **Prior sur k** (`engineering_prior`, **provisoire**, en attente de sourcing) : u ~ Normal(−10 %, 10 points), restreint au support. C'est un paramètre d'entrée du benchmark, fixé avant mesure et jamais ajusté. Les priors mal spécifiés ne changent que la recombinaison des tranches : les pesées ne sont pas recalculées.
- Plancher structurel σ 50 appliqué au marginal d'offset, comme en production.

### Simulateur

- Mondes du benchmark mismatch inchangés (scénarios A à F) et scénarios Sara S_on / S_major du prompt 26 (cible − 270 kcal/j, déclaré « plan respecté » ou « écart important »).
- **Biais tiré une fois par utilisateur simulé** : u ~ Normal(μ, σ), non tronqué. Populations fixées avant mesure :
  - P10 : μ −10 %, σ 10 points ;
  - P20 : μ −20 %, σ 10 points ;
  - P05 : μ −5 %, σ 10 points.
- Couverture de saisie 100 / 85 / 70 %, bruit résiduel 8 % par jour.
- **Axe 1** : variation intra-utilisateur de l'apport réel, CV ∈ {0, 5, 10, 20} %, via un facteur journalier tiré d'un générateur dédié. Le CV déclaré effectivement mesuré est reporté ; il inclut le bruit de 8 % et les écarts déclarés du monde de base.
- **Absence de fuite** : l'estimateur ne reçoit que l'entrée de base et les valeurs saisies. Ni μ, ni σ, ni le biais tiré, ni l'apport réel. C'est vérifié par test.

### Plan d'expérience

| Axe | Cellules | Contenu |
|---|---|---|
| 1 identifiabilité | 12 | CV 0 / 5 / 10 / 20 % × 28 / 42 / 84 j, scénario idéal, couverture 100 %, P10, prior nominal |
| 2 performance | 48 | 8 scénarios × 28 / 42 j × couverture 100 / 85 / 70 %, P10, prior nominal |
| 3 robustesse | 32 + réutilisation des cellules P10 à 85 % | 8 scénarios × 28 / 42 j × P20 / P05, couverture 85 % |

Priors évalués :
- sur P10 : nominal, σ/2, σ×2, centres 0 / −5 / −15 / −20 % ;
- sur P20 : −10 % (cas 1 du prompt), −20 % (bien spécifié) ;
- sur P05 : −20 % (cas 2 du prompt), −10 %, −5 % (bien spécifié).

- **n = 210 par cellule** (5 réplications × 42 utilisateurs).
- Seeds : mondes = seeds T-04 / prompt 26 (`+100 000 × r`), idéal 20 000 / 21 000 / 22 000 ; biais `seed + 8 000 000` (apparié entre populations), saisie `seed + 7 000 000`, variation d'apport `seed + 9 000 000`.
- IC 95 : Wilson pour les couvertures ; Δ appariés vs A (différence d'indicatrices, bootstrap de 2 000 tirages pour l'erreur médiane).

**Coût** : 92 cellules × 210 utilisateurs × 42 vraisemblances ≈ 811 000 calibrations complètes, soit **20,2 h de CPU cumulées et 86,6 min de temps réel** sur 16 threads (3,8 s par utilisateur en moyenne). Le plan est faisable sans réduire ni la grille ni le support.

**Coût en production, si cette voie était retenue** : 41 calibrations par recalcul. Avec le test de performance actuel (365 pesées quotidiennes : 350 ms), cela ferait **≈ 14 s dans le Web Worker**.

## 3. Axe 1 : identifiabilité

Scénario idéal, couverture de saisie 100 %, population P10, prior nominal.

| CV apport réel | Horizon | CV déclaré | Largeur k post / prior | Corrélation offset-u | Erreur médiane k (post / prior seul) | Couv. 80 % de k | > 5 % de masse à k = 1 | Offset réel : erreur A / C / D | Couv. 80 A / C / D | Largeur A / D |
|---:|---:|---:|---:|---:|---|---:|---:|---|---|---|
| 0 % | 28 j | 11 % | 0,79 | −0,71 | 0,067 / 0,074 | 0,71 | 24 % | 97 / 216 / 140 | 0,85 / 0,49 / 0,80 | 427 / 588 |
| 0 % | 42 j | 11 % | 0,76 | −0,87 | 0,066 / 0,085 | 0,71 | 26 % | 82 / 263 / 156 | 0,81 / 0,28 / 0,73 | 295 / 533 |
| 0 % | 84 j | 11 % | 0,75 | −0,97 | 0,064 / 0,084 | 0,69 | 27 % | 67 / 223 / 164 | 0,69 / 0,20 / 0,73 | 169 / 498 |
| 5 % | 28 j | 12 % | 0,79 | −0,71 | 0,067 / 0,074 | 0,71 | 25 % | 95 / 216 / 141 | 0,88 / 0,49 / 0,80 | 430 / 591 |
| 5 % | 42 j | 12 % | 0,76 | −0,87 | 0,065 / 0,085 | 0,71 | 25 % | 85 / 263 / 155 | 0,80 / 0,29 / 0,74 | 294 / 532 |
| 5 % | 84 j | 12 % | 0,75 | −0,97 | 0,066 / 0,084 | 0,69 | 27 % | 67 / 222 / 169 | 0,64 / 0,19 / 0,74 | 170 / 498 |
| 10 % | 28 j | 15 % | 0,79 | −0,71 | 0,067 / 0,074 | 0,71 | 25 % | 108 / 219 / 140 | 0,83 / 0,50 / 0,80 | 431 / 594 |
| 10 % | 42 j | 15 % | 0,76 | −0,87 | 0,064 / 0,085 | 0,71 | 25 % | 89 / 261 / 154 | 0,75 / 0,29 / 0,74 | 294 / 531 |
| 10 % | 84 j | 15 % | 0,75 | −0,97 | 0,065 / 0,084 | 0,69 | 28 % | 69 / 222 / 168 | 0,62 / 0,19 / 0,74 | 172 / 495 |
| 20 % | 28 j | 23 % | 0,78 | −0,70 | 0,068 / 0,074 | 0,72 | 25 % | 122 / 216 / 138 | 0,77 / 0,49 / 0,80 | 441 / 596 |
| 20 % | 42 j | 23 % | 0,77 | −0,87 | 0,065 / 0,085 | 0,71 | 25 % | 103 / 265 / 155 | 0,71 / 0,28 / 0,74 | 299 / 529 |
| 20 % | 84 j | 23 % | 0,75 | −0,97 | 0,063 / 0,084 | 0,68 | 28 % | 72 / 221 / 168 | 0,57 / 0,19 / 0,74 | 177 / 489 |

Aucune masse > 5 % à la borne supérieure de k ni aux bornes d'offset. Vrai u hors support : 15 à 16 % des utilisateurs (sur-déclarants, u > 0).

**Attribution du resserrement** (`flat-offset-prior.json`, 12 utilisateurs par condition) :

| CV | Horizon | Largeur k post / prior, prior d'offset populationnel | Idem, prior d'offset plat | Corrélation (populationnel / plat) |
|---:|---:|---:|---:|---|
| 0 % | 42 j | 0,76 | **0,97** | −0,90 / −0,93 |
| 0 % | 84 j | 0,78 | **0,93** | −0,98 / −0,98 |
| 20 % | 42 j | 0,77 | **0,94** | −0,89 / −0,93 |
| 20 % | 84 j | 0,76 | **0,92** | −0,98 / −0,98 |

**Lecture**

1. Le rapport de largeur ne bouge pas quand le CV passe de 0 à 20 %, ni quand l'horizon double. La corrélation offset-k *augmente* avec l'horizon, jusqu'à −0,97 : plus il y a de pesées, mieux la **combinaison** `offset − (k − 1) × apport` est connue, sans que les deux termes se séparent.
2. Le resserrement résiduel (≈ 0,76) disparaît presque entièrement avec un prior d'offset plat (0,92 à 0,97). **Il vient du prior NASEM**, qui borne l'offset et donc, par la corrélation, k. Ce ne sont pas les pesées. Le reliquat (≈ 0,05) est compatible avec l'effet de la troncature à k = 1.
3. Ordre de grandeur physique : ±10 % de variation d'un apport de ≈ 2 000 kcal s'intègre en ≈ 0,2 kg d'écart aléatoire sur 42 jours. Une erreur de 0,1 sur k modifie cet écart d'environ 20 g, noyés dans un bruit de pesée de 0,3 à 0,7 kg.

**Conclusion de l'axe 1 : le postérieur de k ne décolle de son prior pour aucun CV testé, jusqu'à 20 % (déclaré 23 %) et 84 jours.** k n'est pas apprenable dans ce cadre.

## 4. Axe 2 : performance (population P10, prior nominal)

### 42 jours, couverture de saisie 85 %, référence 1 (maintien réel)

| Scénario | Bras | Erreur médiane | Couv. 80 % [IC] | Couv. 95 % | Largeur 80 | Δ couv. 80 vs A [IC] | Δ erreur vs A [IC] | Porte |
|---|---|---:|---|---:|---:|---|---|---:|
| A dérive | A | 71 | 0,83 [0,78-0,88] | 0,96 | 294 | | | 100 % |
| | C-exact | 205 | 0,37 | 0,51 | 276 | −0,46 | +134 | 100 % |
| | **D** | 146 | 0,73 [0,67-0,79] | 0,90 | 486 | **−0,10 [−0,18 ; −0,02]** | **+75 [+49 ; +97]** | 100 % |
| B apport caché | A | 107 | 0,70 [0,63-0,76] | 0,90 | 294 | | | 100 % |
| | C-exact | 227 | 0,31 | 0,49 | 274 | −0,39 | +119 | 100 % |
| | **D** | 121 | 0,81 [0,76-0,86] | 0,95 | 468 | **+0,11 [+0,03 ; +0,20]** | +13 [−7 ; +50] | 100 % |
| C podomètre | A | 71 | 0,82 [0,76-0,87] | 0,97 | 294 | | | 100 % |
| | C-exact | 207 | 0,40 | 0,53 | 261 | −0,42 | +136 | 100 % |
| | **D** | 149 | 0,68 [0,62-0,74] | 0,88 | 483 | **−0,14 [−0,21 ; −0,06]** | **+79 [+56 ; +110]** | 100 % |
| D eau AR(1) | A | 79 | 0,71 [0,65-0,77] | 0,92 | 294 | | | 100 % |
| | C-exact | 186 | 0,37 | 0,55 | 277 | −0,34 | +107 | 100 % |
| | **D** | 161 | 0,68 [0,62-0,74] | 0,86 | 478 | −0,03 [−0,12 ; +0,05] | **+82 [+52 ; +109]** | 100 % |
| E épisodes | A | 96 | 0,75 [0,69-0,81] | 0,94 | 300 | | | 100 % |
| | C-exact | 238 | 0,31 | 0,50 | 280 | −0,44 | +142 | 100 % |
| | **D** | 153 | 0,72 [0,65-0,78] | 0,89 | 490 | −0,03 [−0,12 ; +0,05] | **+58 [+29 ; +86]** | 100 % |
| F combiné | A | 114 | 0,64 [0,58-0,70] | 0,82 | 297 | | | 100 % |
| | C-exact | 276 | 0,29 | 0,43 | 279 | −0,36 | +162 | 100 % |
| | **D** | 165 | 0,69 [0,62-0,75] | 0,88 | 487 | +0,05 [−0,04 ; +0,13] | **+51 [+23 ; +79]** | 100 % |
| S_on (Sara, « plan respecté ») | A | 252 | 0,12 [0,08-0,17] | 0,31 | 276 | | | 100 % |
| | C-exact | 162 | 0,48 | 0,66 | 271 | +0,36 | −90 | 100 % |
| | **D** | 144 | 0,70 [0,63-0,75] | 0,87 | 448 | **+0,58 [+0,50 ; +0,65]** | **−108 [−138 ; −94]** | 100 % |
| S_major (Sara, « écart important ») | A | 300 | 0,90 [0,86-0,94] | 1,00 | **1 011** | | | **0 %** |
| | C-exact | 162 | 0,49 | 0,67 | 289 | −0,42 | −138 | 100 % |
| | **D** | 138 | 0,72 [0,66-0,78] | 0,89 | 466 | −0,18 [−0,25 ; −0,11] | **−162 [−184 ; −121]** | **100 %** |

Pour S_major, la couverture de 0,90 du bras A est celle du prior : largeur 1 011 et porte jamais franchie, donc aucun apprentissage.

### B et F sur toutes les cellules (D vs A, maintien réel)

| Scénario | Horizon | Couv. saisie | Δ couv. 80 [IC] | Δ erreur médiane [IC] | Ratio largeur |
|---|---:|---:|---|---|---:|
| B | 28 j | 100 % | −0,05 [−0,13 ; +0,03] | +62 [+31 ; +94] | 1,37 |
| B | 28 j | 85 % | −0,01 [−0,09 ; +0,06] | +65 [+30 ; +87] | 1,28 |
| B | 28 j | 70 % | −0,01 [−0,08 ; +0,05] | +42 [+8 ; +71] | 1,20 |
| B | 42 j | 100 % | +0,07 [−0,02 ; +0,15] | +43 [+14 ; +72] | 1,82 |
| B | 42 j | 85 % | +0,11 [+0,03 ; +0,20] | +13 [−7 ; +50] | 1,59 |
| B | 42 j | 70 % | +0,12 [+0,04 ; +0,20] | +0 [−21 ; +26] | 1,44 |
| F | 28 j | 100 % | +0,01 [−0,07 ; +0,09] | +31 [+6 ; +64] | 1,35 |
| F | 28 j | 85 % | +0,01 [−0,06 ; +0,08] | +31 [+7 ; +57] | 1,28 |
| F | 28 j | 70 % | +0,01 [−0,06 ; +0,08] | +21 [−8 ; +50] | 1,18 |
| F | 42 j | 100 % | +0,06 [−0,02 ; +0,15] | +65 [+30 ; +100] | 1,82 |
| F | 42 j | 85 % | +0,05 [−0,04 ; +0,13] | +51 [+23 ; +79] | 1,64 |
| F | 42 j | 70 % | +0,03 [−0,05 ; +0,12] | +30 [+7 ; +65] | 1,49 |

**Autres scénarios, toutes cellules** : erreur médiane de D supérieure à A de +16 à +115 kcal, et couverture 80 % de −0,16 à +0,01.

### Sara, toutes cellules (D vs A, maintien réel)

| Scénario | Horizon | Couv. saisie 100 / 85 / 70 % : erreur D (A) · couv. 80 D (A) | Porte A → D |
|---|---:|---|---|
| S_on | 28 j | 165 (226) · 0,78 (0,42) / 159 · 0,75 / 157 · 0,71 | 100 % → 100 % |
| S_on | 42 j | 143 (252) · 0,74 (0,12) / 144 · 0,70 / 152 · 0,62 | 100 % → 100 % |
| S_major | 28 j | 165 (300) · 0,78 (0,90*) / 157 · 0,78 / 163 · 0,76 | **0 % → 100 %** |
| S_major | 42 j | 143 (300) · 0,74 (0,90*) / 138 · 0,72 / 149 · 0,69 | **0 % → 100 %** |

\* Couverture du prior : aucun apprentissage.

### Référence 2 (maintien dans les unités de saisie), 42 jours, couverture 85 %

Couverture 80 % A / C-exact / D :

| B | F | S_on | S_major |
|---|---|---|---|
| 0,44 / **0,90** / 0,41 | 0,37 / **0,70** / 0,39 | 0,10 / **0,87** / 0,46 | 0,72 / **0,89** / 0,49 |

D vise le maintien réel et se trompe logiquement dans les unités de saisie (biais de +200 à +300 kcal). C-exact est le bon estimateur de cette référence : sur les 48 cellules, il gagne de +0,10 à +0,83 de couverture sur A.

**Lecture de l'axe 2**
- La marginalisation de k **répare l'effondrement de C-exact** face au maintien réel : couverture ≈ 0,30 à 0,50 → ≈ 0,70 à 0,80. Mais elle ne fait que **revenir au niveau de A**, avec un intervalle 1,2 à 1,8 fois plus large et une erreur médiane plus grande sur tous les scénarios standards.
- Le seul gain réel concerne les utilisateurs qui ne suivent pas la cible : **Sara, erreur divisée par 1,7 à 2,2 et porte débloquée**. Sur ce cas, C-exact et D ont des erreurs comparables. D a de meilleurs intervalles vis-à-vis du maintien réel, C-exact vis-à-vis des unités de saisie.

## 5. Axe 3 : robustesse au prior (42 jours, couverture de saisie 85 %, maintien réel)

Référence A : B 107 / 0,70 ; F 114 / 0,64 ; S_on 252 ; S_major 300.

| Population réelle | Prior de D | Décalage (points) | B : Δ couv. 80 · Δ erreur · largeur | F : Δ couv. 80 · Δ erreur · largeur | A, C, D, E : Δ erreur | S_on : Δ erreur | S_major : Δ erreur |
|---|---|---:|---|---|---|---:|---:|
| P10 (−10 %) | N(−10, 10) nominal | 0 | +0,11 · +13 · 468 | +0,05 · +51 · 487 | +58 à +82 | −108 | −162 |
| P10 | N(−10, **5**) trop étroit | 0 | −0,05 · +25 · 384 | −0,08 · +57 · 385 | +62 à +98 (couv. −0,15 à −0,25) | −118 | −158 |
| P10 | N(−10, **20**) trop large | 0 | +0,16 · +16 · 536 | +0,11 · +58 · 539 | +67 à +93 | −91 | −149 |
| P10 | N(0, 10) | +10 | +0,00 · +28 · 414 | −0,02 · +62 · 425 | +63 à +89 | −133 | −179 |
| P10 | N(−5, 10) | +5 | +0,03 · +17 · 444 | +0,02 · +49 · 455 | +59 à +94 | −125 | −174 |
| P10 | N(−15, 10) | −5 | +0,11 · +29 · 495 | +0,04 · +59 · 513 | +59 à +97 | −84 | −136 |
| P10 | N(−20, 10) | −10 | +0,06 · +35 · 521 | +0,02 · +62 · 533 | +66 à +128 | −39 | −100 |
| P20 (−20 %) | N(−20, 10) bien spécifié | 0 | +0,12 · +32 · 529 | +0,10 · +57 · 542 | +61 à +94 | −130 | −172 |
| P20 | **N(−10, 10), cas 1 du prompt** | **+10** | **−0,03 · +84 · 482** | **−0,03 · +79 · 497** | **+87 à +108** | **−129** | **−170** |
| P05 (−5 %) | N(−5, 10) bien spécifié | 0 | +0,06 · +27 · 433 | −0,00 · +55 · 443 | +58 à +98 | −90 | −148 |
| P05 | N(−10, 10) | −5 | +0,07 · +33 · 460 | −0,01 · +60 · 475 | +66 à +115 | −66 | −120 |
| P05 | **N(−20, 10), cas 2 du prompt** | **−15** | **−0,08 · +75 · 511** | **−0,06 · +88 · 524** | **+101 à +179** | **+16 [−7 ; +42]** | **−35 [−71 ; +1]** |

À 28 jours, le même motif s'observe, avec des Δ de couverture proches de 0 sur B et F quel que soit le prior. C-exact, pour comparaison : P20 → couverture 0,07 à 0,18 à 42 j ; P05 → 0,34 à 0,53.

**Lecture de l'axe 3**
- **Pas d'effondrement brutal** (ce n'est pas un NO-GO robustesse au sens strict). La dégradation est progressive, et un prior trop large reste le choix le moins risqué.
- **Un prior trop étroit est nuisible partout** : couverture en baisse sur les 8 scénarios.
- **L'avantage sur Sara résiste à 10 points de décalage** (−100 à −179 kcal). **Il disparaît à 15 points** (S_on +16, S_major −35, IC touchant 0).
- **Sur les scénarios standards, aucun prior ne rend D meilleur que A en erreur médiane**. Le meilleur cas (B, prior large) gagne +0,16 de couverture pour une largeur ×1,8.

## 6. Diagnostics de bornes

| Borne | P10 (axes 1-2) | P20 / P05 (axe 3, prior mal spécifié) |
|---|---|---|
| Utilisateurs avec > 5 % de masse à **k = 1** | 15 à 30 % | 2 à 12 % |
| Utilisateurs avec > 5 % de masse à **k max** (1,667) | 0 % | 0 % |
| Utilisateurs avec > 5 % de masse aux **5 bornes d'offset** (bas / haut) | 0 à 1 % | 0 à 1 % |
| Vrai u **hors support** (surtout u > 0, sur-déclarants) | 12 à 21 % | P20 : 2 à 8 % ; P05 : 26 à 37 % |

La borne k = 1 imposée par le prompt tronque effectivement le support pour les sur-déclarants, avec ≈ 16 % de la population P10 et ≈ 30 % de P05. Cette troncature est **signalée, pas silencieuse**. L'élargir sous k = 1 changerait le paramétrage demandé (`k ≥ 1`) : **décision non prise**, à arbitrer si la voie est poursuivie.

## 7. Ce que ces mesures impliquent (constat, pas décision)

- **L'estimation conjointe n'apprend pas le biais** : elle le **suppose**, au centre du prior. Une version produit devrait donc assumer un **k figé** sourcé dans la littérature, avec une incertitude affichée. C'est la décision distincte prévue par le prompt, et ce benchmark ne peut pas fournir la source.
- **Pour les utilisateurs qui suivent la cible (A à F)**, la méthode actuelle reste meilleure : erreur plus faible et intervalle plus étroit. Le journal n'apporte rien au maintien réel, quelle que soit l'option.
- **Pour les utilisateurs qui ne suivent pas la cible (Sara)**, le journal apporte un gain net et robuste jusqu'à ±10 points d'erreur sur le k supposé : erreur ÷ 1,7 à 2,2, calibration débloquée.
  - Pour exprimer le maintien dans les unités de saisie, C-exact suffit (couverture 0,87 à 0,90), sans k.
  - Pour un maintien réel, D avec un k figé et large est nécessaire.
- **Coût** : environ 41 calibrations par recalcul, soit ≈ 14 s dans le worker pour un an de pesées quotidiennes, contre 350 ms aujourd'hui. Avec un k figé, le coût redevient celui d'une seule calibration.

## 8. Rejouer

Rejeu du prompt 26 (précondition) :

```bash
npx vitest run -c vitest.experiments.config.ts
```

Expérience complète (92 cellules, ≈ 87 min sur 16 threads ; écrit `reports/joint-bias/cells/*.json` et `tables.md`) :

```bash
npx vitest run -c vitest.joint.config.ts
```

Sonde d'attribution de l'axe 1 seule (≈ 5 min) :

```bash
npx vitest run -c vitest.joint.config.ts tests/experiments-joint/flat-offset-prior.experiment.ts
```

Tests ciblés (inclus dans `npm test`) :

```bash
npx vitest run tests/science/jointBiasModel.test.ts
```

Variable facultative `JOINT_REPLICATES` (défaut 5) pour un essai rapide.

## 9. Fichiers touchés

| Fichier | Nature |
|---|---|
| `tests/helpers/jointBias.ts` | nouveau : vraisemblance de production exposée (copie vérifiée exacte), support de k, prior, postérieur conjoint, diagnostics de bornes |
| `tests/helpers/jointBiasExperiment.ts` | nouveau : populations, priors, cellules, bras A / C-exact / D, métriques et IC, shards |
| `tests/science/jointBiasModel.test.ts` | nouveau : 11 tests (exactitude vs production, tranche C-exact, support, bornes, tirage du biais par profil, déterminisme, absence de fuite, variation d'apport) |
| `tests/experiments-joint/shard-*.experiment.ts`, `flat-offset-prior.experiment.ts`, `buildJointTables.ts` | nouveaux : exécution et tables, hors `npm test` |
| `vitest.joint.config.ts` | nouveau : configuration de l'expérience |
| `tests/helpers/mismatchWorld.ts` | ajout non comportemental : réglage optionnel `intakeFactors`. Absent, monde et flux RNG identiques (même expression qu'avant, suite T-04 au vert) |
| `tests/helpers/intakeLoggingExperiment.ts` | `pairedIndicatorDelta` et `pairedMedianDelta` exportés, sans changement de code |
| `reports/27_JOINT_BIAS_ESTIMATION.md`, `reports/joint-bias/` | rapport, tables, 92 résumés de cellule, sonde |

Non touchés : `src/`, Hall, priors warm start, seuils de confiance, constantes, fixtures, snapshots, UI, persistance, schéma, macros dans Hall.
