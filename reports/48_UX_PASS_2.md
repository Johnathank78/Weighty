# 48. Passe UX 2 : les retours de John du 24/10

Date : 24/10/2026. Branche `ux/pass-2`, partie de `origin/main` (`1209d49`), non fusionnée. Marquage : [lu] lu dans un fichier ou une sortie, [mesuré] obtenu en lançant une commande ou dans le navigateur, [déduit] conclusion tirée des deux.

## 1. Pour John, en 10 lignes

1. Glisser d'une section à l'autre ne rejoue plus rien : 0 animation et 0 dessin progressif sur tous les gestes ; les touchers dans la barre animent comme avant [mesuré].
2. Avec une cible personnelle, le curseur pas / calories marche : à 9 000 pas, ta cible passe de 1 700 à 1 790 kcal, la ligne « Ta cible personnelle » suit [mesuré, navigateur].
3. Une cible personnelle vaut désormais aux pas du plan en vigueur : la choisir après avoir réglé le curseur garde tes pas [mesuré].
4. Pour toutes les cibles personnelles existantes (aux pas du profil), rien ne change, au bit près, contre `1209d49` [mesuré].
5. Plan n'a plus qu'un bouton, « Je souhaite changer de plan », qui ouvre une feuille à deux cartes ; l'alignement est grisé avec sa ligne d'aide quand le journal est trop court [mesuré, navigateur].
6. Suivi : « Ce mois-ci » (par défaut) et « Tout » [mesuré].
7. Nouvelle pesée : le champ s'ouvre vide, la dernière pesée en gris ; « Enregistrer » est inactif à vide [mesuré, navigateur].
8. Jauge de confiance : plus de mot à droite du titre ; « Élevée » s'écrit sous le troisième cran [mesuré].
9. « Journées notées » devient « Adhérence notée » partout, seuil lu dans la constante : « 91 % des jours, 50 % requis » tient sur une ligne à 360 px [mesuré, navigateur].
10. Captures : seules les versions changent (1.7.0 → 1.8.0) ; équivalence de la 5b : 0 échec sur 17 275 appels ; 697 tests passent. À faire : ta vérification (section 9), puis ton accord pour la fusion.

## 2. Git

- Base : `1209d49` (`origin/main`, contient `7a8c8ba`, le rapport 47) [mesuré]. `ux/pass-2` n'existait pas [mesuré].
- Commits, un par point, préfixés `ux2:` [mesuré] :

| Commit | Point |
|---|---|
| `7831b31` | 1. l'écran d'arrivée d'un glissement s'affiche dans son état final |
| `1d6c0f6` | 2. curseur sur une cible personnelle, cible aux pas du plan (modèle 1.8.0) |
| `759f8d8` | 3 et 4. « Je souhaite changer de plan » et sa feuille ; `.btn--outline` désactivé |
| `56c34b6` | 5. « Ce mois-ci » et « Tout » |
| `dde76da` | 6. pesée : champ vide, dernière pesée en gris |
| `cf68bea` | 7. jauge sans mot à droite, « Élevée » au troisième cran |
| `15e84c4` | 8. « Adhérence notée » |
| `e129080` | 2. le générateur de la fixture ne tourne qu'à la demande (la commande des captures restait en échec, section 6.1) |
| `ba67be5` | 7 et 8. le test du panneau d'explication lit la jauge et le critère tels qu'ils sont |
| ce rapport | rapport seul, en dernier |

- Les commits 5 à 7 partagent des fichiers avec le point 8 : leurs versions intermédiaires ont été mises dans l'index fichier par fichier. Chacun type sans erreur et passe ses tests, vérifié sur l'arbre exporté de chaque commit [mesuré].
- `git add` par chemins explicites ; `.gitignore` non touché ; aucun brut ni archive commité (sorties des captures et de l'équivalence dans le dossier temporaire et dans `tests/experiments-journal/results/`, ignoré) [mesuré]. Une seule fixture commitée, voulue par le prompt : `tests/fixtures/ux2-personal-target-base.json` (580 Ko) [mesuré].
- `docs/verification-5b/` régénéré pour mes vérifications, puis remis en l'état par `git restore` [mesuré].

## 3. Point 1 : l'écran d'arrivée se rejouait

### Diagnostic

La cause de la revue est confirmée [lu, mesuré] : la copie dessinée sous le doigt (`.nav-layer`) et l'écran réel sont deux instances. Les règles qui coupent l'animation après un glissement (`.nav-layer > div > *`, `.nav-view[data-transition='none'] > *`) ne visent que l'enfant direct. Les animations d'entrée imbriquées jouaient donc deux fois :
- `wGrow` de `.gauge__bar` (jauge de confiance, Analyse), de `.progress__bar` (barres de macros, Aujourd'hui) et de `.conf__seg` [lu] ;
- le dessin progressif de `WeightChart` (900 ms, Suivi), relancé au montage de la copie puis à celui de l'écran [mesuré]. `HistoryChart` n'a pas de dessin progressif [lu].

Aucune autre cause trouvée [mesuré].

### Correction

- `navModel.ts` : `displayKey` (l'écran affiché, et l'étape sur l'onboarding), `swipeArrival` (ce sur quoi atterrit un glissement mené à son terme), `keptArrival` (oublié dès qu'autre chose s'affiche), `entryAnimated`. Fonctions pures, testées. `swipeActions`, `navSwipe`, `swipeCompletes` et les seuils ne changent pas [lu].
- `navigation.tsx` : le fournisseur retient l'arrivée du dernier glissement et expose `entryMotion` ; `EntryMotionContext` pour les animations en script.
- `SwipeView.tsx` : la copie est toujours sans animation d'entrée ; l'écran réel reçoit `data-entry="settled"` quand un glissement l'a amené.
- `app.css` : `animation: none` sur ces trois animations imbriquées, dans la copie et dans l'écran « settled ».
- `WeightChart.tsx` : dessin immédiat (progression 1) quand `useEntryMotion()` est faux.

`prefers-reduced-motion` : chemins inchangés (la règle globale et le test `reduced` du graphique restent) [lu].

### Mesures

Dev, 375 px, profil `6-adherence-deduite`, gestes tactiles simulés par des événements pointer (220 px, relâchés), volet du navigateur visible. Comptés par geste, sur 1,6 s : les `animationstart` (hors `wFloat`, boucle infinie de la mascotte) et les dessins progressifs (un canvas effacé plus de 3 fois) [mesuré].

| Geste | Avant : animations (copie + écran) | Avant : dessins progressifs | Après : animations | Après : dessins progressifs |
|---|---|---|---|---|
| Aujourd'hui → Plan | 0 | 0 | 0 | 0 |
| Plan → Suivi | 0 | 2 (copie + écran) | 0 | 0 |
| Suivi → Analyse | 2 (1 + 1) | 0 | 0 | 0 |
| Analyse → Profil | 0 | 0 | 0 | 0 |
| Profil → Analyse | 2 (1 + 1) | 0 | 0 | 0 |
| Analyse → Suivi | 0 | 2 (copie + écran) | 0 | 0 |
| Suivi → Plan | 0 | 0 | 0 | 0 |
| Plan → Aujourd'hui | 4 (2 + 2) | 0 | 0 | 0 |
| Détail → Aujourd'hui (retour) | 4 (2 + 2) | 0 | 0 | 0 |
| Historique → Suivi (retour) | 0 | 2 (copie + écran) | 0 | 0 |
| Onboarding, étape 2 → étape 1 | 0 | 0 | 0 | 0 |
| Onboarding, étape 1 → intro | non mesuré | non mesuré | 0 | 0 |
| Glissement relâché (Détail, 60 px) | 2 (copie seule) | 0 | 0 | 0 |

Après correction, les dessins de Suivi restent présents mais immédiats (1 effacement par canvas) [mesuré].

Touchers dans la barre, après correction, identiques à avant : Plan 1 (`wNavTabNext`), Suivi 1 + 1 dessin progressif, Analyse 2 (`wGrow` de la jauge + `wNavTabNext`), Profil 1, Aujourd'hui 3 (`wGrow` × 2 + `wNavTabPrev`) ; ouvrir Détail ou Historique : 1 (`wNavPush`) ; bouton retour de Détail : 3 [mesuré]. Après un glissement vers Suivi, partir sur Analyse puis revenir à Suivi par la barre rejoue bien l'entrée (1 animation + 1 dessin progressif) [mesuré].

La revue mesurait 5 animations sur Suivi → Analyse : son profil avait plus de crans allumés ; le mien en a un (« Faible ») [déduit].

Fichiers : `src/app/navModel.ts`, `src/app/navigation.tsx`, `src/components/SwipeView.tsx`, `src/components/WeightChart.tsx`, `src/styles/app.css`, `tests/app/navigation.test.ts`.

## 4. Les autres points

### Point 2 : le curseur sur une cible personnelle

Fait [lu, mesuré] :
- `balanceSliderAvailable` : vrai sur une cible personnelle (seule la cible alignée elle-même le bloque encore).
- `applySliderSteps` : la garde ne refuse plus `personal_target` ; sur une cible personnelle, la source reste `personal_target` et `personalTarget.kcal` prend la nouvelle cible ; `estimatedRate` et `beyondGrid` gardés ; `createdAt` gardé ; pas d'entrée de trace. Le reste (cible, pas, macros, projection, plancher bloquant) est le chemin habituel.
- La cible vaut aux pas du plan en vigueur : `storePersonalTargetTable` lit `plan.stepTarget` (les pas du profil sans plan) ; `choosePersonalTarget` construit le plan à ces pas, qui deviennent aussi la référence du curseur (`baselineStepTarget`). À l'inscription, rien ne change : ce sont les pas du premier plan. La reprise lit la cible à ces pas et son plan les garde. Aucun champ nouveau, schéma 10 inchangé.
- Plan : la ligne de la cible personnelle reste, au-dessus de l'aperçu « Équilibre alimentation / marche ». Aucun texte nouveau.
- Modèle 1.7.0 → 1.8.0.

Les cibles personnelles stockées aujourd'hui sont toutes aux pas du profil [lu] : les trois chemins qui en créent une construisent le plan sans `stepTarget`, donc à `profile.averageSteps7d` (`choosePersonalTarget` via `buildPlanFromStore`, `completeOnboardingWithTarget` via `completeOnboarding`, `updateProfileKeepingPersonalTarget` via `updateProfile`) ; `applySliderSteps` les refusait ; `averageSteps7d` ne s'écrit qu'à l'onboarding et à l'édition du profil, qui reconstruit le plan.

Non-régression au bit près : `tests/helpers/personalTargetFixture.ts` calcule, pour 4 profils (perte IMC 27,5, perte IMC 24,2, prise, maintien) et 8 cibles de 900 à 3 200 kcal, la saisie (Plan et onboarding, avec chaque ligne), la vitesse estimée, le plan et l'entrée de trace, et 6 reprises au jour 21. Fixture produite sur `1209d49` (source extraite à part, `@` pointé dessus), comparée en chaîne exacte, ids et versions masqués : identique [mesuré]. Contrôle négatif : un pas de plus dans la table fait échouer le test [mesuré].

Exemple de la revue reproduit : 1 700 kcal à 7 000 pas (75 kg, 165 cm) donne 1 608 kcal à 5 000, 1 793 à 9 000, 1 884 à 11 000 en zone « prudence » [mesuré].

Fichiers : `src/domain/engine.ts`, `src/domain/journalPath.ts`, `src/domain/personalTarget.ts`, `src/science/constants.ts`, `src/screens/Plan.tsx`, tests (`uxPass2.test.ts`, fixture et son générateur, versions dans 4 tests existants, instantanés R et S), et `tests/domain/pass5bFix.test.ts`, qui vérifiait « pas de curseur » : il vérifie maintenant le curseur.

### Points 3 et 4 : « Je souhaite changer de plan »

Fait [lu, mesuré] : un sélecteur pur `planChangeOptions` (`src/domain/planChange.ts`) rassemble les deux options et leur état depuis `personalTargetAvailable` et `alignButton`, inchangés ; null quand aucune n'est proposée. Dans Plan, les deux boutons et la ligne d'aide sont remplacés par « Je souhaite changer de plan », qui ouvre la feuille « Changer de plan » (`planChange`, nouvelle feuille de la navigation) : deux cartes `opt-card`, comme les objectifs de l'onboarding. « Choisir ma cible » ouvre la feuille de la cible personnelle ; « Aligner ma cible sur ce que je mange » ferme la feuille et affiche la proposition dans Plan ; grisée et inactive quand le journal est trop court, avec « Disponible quand 10 des 14 derniers jours sont saisis (encore {n}). » [mesuré, navigateur].

`.btn--outline:disabled` : fond `--surf2`, texte `--ink2`, comme `.btn--primary:disabled`. Autres boutons concernés [lu] : « Chercher » du code-barres (`Journal.tsx`, inactif pendant la recherche) et « Retenir » de l'unité d'une portion (`Journal.tsx`, inactif à vide). Le bouton d'alignement de Plan, qui posait le problème, n'existe plus.

Fichiers : `src/domain/planChange.ts`, `src/domain/planMessages.ts`, `src/screens/PlanChangeSheet.tsx`, `src/screens/Plan.tsx`, `src/app/navModel.ts` (identifiant de feuille), `src/styles/app.css`.

### Point 5 : « Ce mois-ci » et « Tout »

Fait : `TRACKING_RANGES`, `DEFAULT_TRACKING_RANGE` et `TRACKING_RANGE_DAYS` (30 jours, ou tout) dans `views.ts`, libellés dans `copy.ts` ; « Ce mois-ci » par défaut ; « Historique · 90 jours » inchangé [mesuré, navigateur]. Fichiers : `src/domain/views.ts`, `src/app/copy.ts`, `src/screens/Tracking.tsx`.

### Point 6 : la nouvelle pesée

Fait : `src/domain/weighEntry.ts` (indication `weighHint`, saisie `typeWeighKey` aux règles inchangées, `weighSaveEnabled`). À l'ouverture la valeur est vide, la dernière pesée s'affiche en gris (« 0 » sans pesée), la première touche commence une nouvelle valeur, « Enregistrer » est inactif à vide. Validation, messages, jour et case des règles inchangés [mesuré, navigateur]. Fichiers : `src/domain/weighEntry.ts`, `src/screens/DailySheets.tsx`.

Autres champs qui s'ouvrent avec une valeur à effacer, non modifiés [lu] :
- « Pas » (`StepsSheet`, `DailySheets.tsx`) : les pas du jour, sinon la cible du plan ;
- la feuille de la cible personnelle : la cible en vigueur ;
- la portion du journal : « 100 » g et « 1 » unité ;
- le formulaire d'un aliment saisi à la main, en modification : les valeurs de l'aliment (voulu).

### Point 7 : la jauge de confiance

Fait : le mot à droite du titre disparaît dans `ConfidenceGauge`, donc dans Analyse (deux usages) et dans « Pourquoi ce résultat ? » (« Confiance actuelle »). Le niveau reste annoncé par un texte masqué « : {niveau} » après le titre ; la jauge reste `aria-hidden`. Au niveau « Élevée », la légende du troisième cran dit « Élevée ». `ConfidenceBar` inchangé ; la règle `.gauge__value`, sans usage, est retirée [lu, mesuré]. Fichiers : `src/components/controls.tsx`, `src/styles/app.css`.

### Point 8 : « Adhérence notée »

Vérifié [lu] : le critère de `evaluateGate` (`calibration.ts`) est la part des jours de la fenêtre, de la première à la dernière pesée valide, qui ont une adhérence dans le journal quotidien, déclarée ou déduite du journal (la déduction écrit `adherence` avec `adherenceSource: 'journal'`). C'est ce que dit l'annexe : textes repris tels quels.

Fait : libellé « Adhérence notée » ; valeur « {x} % des jours, {seuil} % requis » ; phrases d'Analyse et de « Pourquoi ce résultat ? » ; `WhySheet` ; « adhérences notées » dans Mes données. Seuil lu par `gateAdherencePercent()` depuis `GATE_MIN_ADHERENCE_COVERAGE`. À 360 px, « 91 % des jours, 50 % requis » tient sur une ligne et la carte de Mes données ne déborde pas [mesuré, navigateur]. Fichiers : `src/app/copy.ts`, `src/domain/views.ts`, `src/screens/Tracking.tsx`, `src/screens/WhySheet.tsx`, `src/screens/Account.tsx`, deux tests existants.

## 5. Rien d'arrêté

Aucune règle d'arrêt n'a joué : aucune valeur ni décision de capture ne change ; le point 2 n'a demandé ni champ, ni schéma, ni science, et sa non-régression est au bit près ; le point 1 n'a pas touché aux règles de la navigation [mesuré].

## 6. Vérifications

### 6.1 Captures

T-03, T-04, golden, R et S, `convergenceJourney`, `1209d49` contre la branche, en priorité basse [mesuré] :

| Capture | Valeurs numériques | Différences |
|---|---|---|
| T-03 | 1 003 779 | 0 |
| T-04 | 1 497 006 | 0 |
| golden | 3 041 | 0 |
| R et S | 9 838 | 24 autres |
| `convergenceJourney` | 8 716 | 35 autres |

Les 59 différences, une à une : `scientificModelVersion` (53), `modelVersion` (4), `storedPlanModelVersion` (2), toutes 1.7.0 → 1.8.0 [mesuré]. Instantanés R et S des tests : seule la version change [mesuré].

La première capture de la branche a fini en échec : mon générateur de fixture, rangé dans le dossier des captures, exigeait `PT_OUT`. Il ne tourne plus qu'à la demande (`e129080`), et redonne la fixture commitée à l'octet près [mesuré].

### 6.2 Équivalence de la 5b

Relancée une fois, par prudence : mon diff touche `applySliderSteps` un peu au-delà de sa seule garde (source et `personalTarget` du plan suivant, sous condition de cible personnelle) et `journalPath.ts` (seulement `balanceSliderAvailable`). Méthode des rapports 45 à 47, sur `1d6c0f6` : 8 parties en priorité basse (204 à 272 s chacune), puis la fusion [mesuré] :
- **0 échec** sur 17 275 appels (400 utilisateurs, 323 basculent) ;
- tolérances : 0 pesée manquée, 0 jour non exploitable sur 6 460 évaluations ; adhérence déduite : 0 jour ;
- contrôles négatifs : 80 sur 80 diffèrent.

### 6.3 Tests

674 au départ, **697** à la fin, tous verts ; `npm run check` (types, lint, tests) propre [mesuré]. Ajoutés :
- `tests/app/navigation.test.ts` (4) : arrivée d'un glissement sur chaque section et dans les deux sens, retour de page et d'étape d'onboarding, barre et pages gardent l'animation, arrivée oubliée ensuite ;
- `tests/domain/uxPass2.test.ts` (19) : point 2 (mêmes points que `createSliderSession`, chiffres de la revue, enregistrement, plancher, pas gardés, reprise aux pas du plan, G1, pas de G2, pas de recalcul périodique, non-régression au bit près), points 3 et 4 (quatre états de méthode), 5, 6, 7 (rendu statique de la jauge), 8.

### 6.4 Build et hors ligne

`npm run build` sans erreur, 31 fichiers en précache [mesuré]. `dist/` servi en local, service worker actif, serveur arrêté, page rechargée : l'app s'affiche [mesuré, navigateur].

### 6.5 Navigateur

À 375 px (360 px pour le point 8), captures d'écran prises dans le volet [mesuré] :
- point 2, profil `7-cible-personnelle` : Plan à 1 700 kcal et 7 000 pas, ligne de la cible au-dessus de l'aperçu ; curseur à 9 000 pas (1 790 kcal), enregistré : haut de Plan à 1 790 kcal et 9 000 pas, ligne « Ta cible personnelle : 1 790 kcal par jour », source `personal_target`, `createdAt` gardé, aucune entrée de trace ; puis « Choisir ma cible » à 1 650 kcal : plan à 9 000 pas ;
- points 3 et 4 : feuille aux deux cartes, alignement grisé (« encore 10 ») ; profil `1-proposition` : alignement actif, la proposition s'affiche dans Plan ;
- points 5 à 8 : comme décrit en section 4 ;
- console : après un rechargement complet, un parcours des cinq sections, du curseur, de « Changer de plan », de la cible personnelle et de la pesée ne produit aucun message. Les erreurs relevées plus tôt venaient des rechargements à chaud pendant mes modifications (fichiers à moitié écrits) [mesuré].

## 7. Choix faits sans consigne

1. Point 1 : l'arrivée d'un glissement est retenue par le fournisseur de navigation (pas par `navSwipe`), avec l'étape pour l'onboarding ; elle s'oublie dès qu'autre chose s'affiche.
2. Point 1 : seules les animations d'entrée imbriquées sont coupées (`wGrow` des trois barres, dessin de `WeightChart`). La mascotte flottante (boucle), les feuilles et le compteur de l'écran de recalibration ne sont pas touchés.
3. Point 2 : après un réglage du curseur, `personalTarget.kcal` est la cible du curseur, non arrondie, comme `calorieTarget`. Plan affiche 1 790 ; la feuille de la cible s'ouvre sur 1 793 (elle arrondit à l'unité).
4. Point 2 : modifier son profil avec une cible personnelle garde la règle d'avant : plan reconstruit aux pas du profil, comme pour tout le monde.
5. Points 3 et 4 : avec une cible personnelle en vigueur, les deux options restent, comme avant (règles inchangées). La feuille est rendue par Plan, qui tient l'état de la proposition. Carte grisée par une opacité de 0,5, comme l'objectif indisponible de l'onboarding.
6. Point 6 : l'indication suit l'unité de l'utilisateur (lb en impérial).
7. Point 7 : le niveau est lu après le titre, « Confiance du modèle : Faible ».
8. Point 8 : les « 5 pesées sur 14 jours » de `WhySheet` restent écrites en dur (hors de l'annexe).

## 8. Défauts vus hors périmètre, non corrigés

1. Onboarding : avancer d'une étape garde la transition du geste précédent. Après un glissement retour, « Continuer » n'anime pas ; après le bouton retour, « Continuer » joue l'entrée de retour (`wNavPop`) [mesuré]. Cause : l'étape avance par `setDraft`, qui ne touche pas `transition` [lu, déduit].
2. `WeightChart` : sur un toucher vers Suivi, le canvas est effacé 163 fois en 1,6 s pour un dessin de 900 ms [mesuré]. Le dessin repart probablement plusieurs fois, l'effet se relançant à chaque rendu (tableaux recréés) [déduit].
3. À l'ouverture d'une feuille, la poignée reçoit le focus et montre un contour orange [mesuré, capture].

## 9. Vérification pour John (15 minutes)

Sur la branche :

```
git switch ux/pass-2
npm run verification:profils
npm run dev
```

`npm run verification:profils` réécrit les fichiers suivis de `docs/verification-5b/` (identifiants aléatoires). Avant de changer de branche : `git restore docs/verification-5b`.

Charger un profil : dans la console du navigateur, `fetch('/docs/verification-5b/<profil>.json').then(r => r.json()).then(j => { localStorage.setItem('wheighty:store', JSON.stringify(j.store)); location.reload(); })`.

1. Point 1 (profil 6, en vue téléphone, ou mieux sur l'iPhone, plus bas) : glisse Suivi → Analyse : la jauge est déjà pleine, rien ne repousse. Analyse → Suivi : la courbe est déjà dessinée. Puis touche Analyse dans la barre : la jauge pousse, comme avant.
2. Point 2 (profil 7) : Plan, la ligne de ta cible au-dessus du curseur ; « Ajuster », 9 000 pas, enregistre : 1 790 kcal et 9 000 pas en haut, la ligne dit 1 790. Puis « Je souhaite changer de plan », « Choisir ma cible », 1 650 : les pas restent à 9 000.
3. Points 3 et 4 (profil 7 puis 1) : une seule entrée ; dans la feuille, l'alignement grisé avec « encore … » (profil 7), actif sur le profil 1 : la proposition apparaît dans Plan. Retour ou glissement : la feuille se ferme.
4. Point 5 : Suivi, « Ce mois-ci » sélectionné, « Tout » à côté.
5. Point 6 : « + Pesée » : dernier poids en gris, « Enregistrer » grisé ; tape 7 : le chiffre remplace le gris.
6. Point 7 : Analyse, « Confiance du modèle » sans mot à droite.
7. Point 8 : Analyse avant recalibration (profil 6), « Adhérence notée · 91 % des jours, 50 % requis » ; « Comment Wheighty apprend de mes données ? » ; Profil, Mes données : « adhérences notées ».

Sur l'iPhone (rapport 44, section 9), PC et téléphone sur le même Wi-Fi :

```
npm run build
npx vite preview --host --port 4173
```

Ouvre `http://<adresse IPv4 du PC>:4173` dans Safari (`ipconfig`). Sans console sur l'iPhone, pas de profil à charger : fais l'onboarding rapidement, ajoute deux ou trois pesées, puis glisse entre Suivi et Analyse. Testable ainsi : les glissements dans la page (hors bord de l'écran, que Safari garde pour son propre retour). Testable seulement après déploiement (HTTPS, Pages) : l'app installée sur l'écran d'accueil, sans barre de Safari, où le glissement du bord n'est plus celui du navigateur.

Ensuite, si tout va bien, dis-le-moi : je fusionne (`git merge --no-ff ux/pass-2` dans `main`, comme pour la 5a et la 5b), je relance `npm run check`, et je te donne les commandes d'envoi :

```
git push origin main
```

Et, si tu veux garder la branche sur GitHub : `git push origin ux/pass-2`.

## 10. Ménage de la 5b

État [mesuré] : les deux worktrees n'existent plus. `../Weighty-5b-proto` et `../Weighty-5b-base` sont absents du disque, `git worktree list` ne montre que le dépôt principal, et `git worktree prune --dry-run` n'a rien à nettoyer. Les branches `prod/5b-parcours-journal` et `ux/pass-1` sont fusionnées dans `main` (`git branch --merged main`).

Commande à lancer par toi (les worktrees n'ont plus besoin de rien) :

```
git branch -d prod/5b-parcours-journal ux/pass-1
```
