# Seuils pré-enregistrés : batterie « journal dans la calibration »

Validés par le product owner le 2026-09-23. Toute modification exige une justification écrite et une nouvelle validation, avant l'exécution de la mesure concernée.

## Règles communes
- Biais de saisie u = saisi / mangé − 1 : proportionnel, stable par utilisateur sauf mention contraire.
- Populations principales : P00 N(0 ; 3 points), P05 N(−5 ; 10), P10 N(−10 ; 10), P20 N(−20 ; 10).
- Sensibilité :
  - P10 avec un écart-type de 20 points ;
  - P10 avec une pente IMC de 0, −5 et −10 points entre IMC 22 et 35.
- Chaque critère est jugé sur l'IC 95 % :
  - Wilson pour les proportions ;
  - bootstrap apparié à 2 000 tirages, unité = utilisateur simulé, pour les différences et les médianes.
- Un test bloquant est GO si chaque seuil passe dans chaque population principale. Les critères marqués [S] (sécurité) doivent aussi passer dans les variantes de sensibilité. Les autres critères en sensibilité sont seulement rapportés.
- INCONCLUSIF (IC qui chevauche le seuil) n'est jamais GO : on double n une fois, puis on rapporte.
- Rapport stratifié par sexe, classe d'IMC, activité, fréquence de pesée, complétude du journal, horizon et population.
- Les règles candidates sont sélectionnées sur des graines d'entraînement ; le verdict est rendu sur des graines de validation distinctes.
- Plancher réel = max(1 200 kcal pour une femme ou 1 500 kcal pour un homme ; 0,7 × REE) (D-32).

## Phase 1

### N1 : équivalence du chemin (bloquant)
- Drapeau désactivé : 0 différence au bit près (T-03, T-04, golden, R, S, convergenceJourney).
- Prototype avec les glucides du harness contre harness du benchmark 26 : |Δ| ≤ 1 kcal/j sur la médiane et les quantiles 10 et 90, sur au moins 50 fixtures (ingénierie, tolérance numérique).
- Effet de D5 : |Δ médiane| ≤ 25 kcal/j, et l'écart doit être expliqué (ingénierie).

### N2 : support et masse aux bornes (bloquant) [S]
- Part d'utilisateurs avec plus de 5 % de masse dans les 10 derniers points d'une borne de la grille d'offset : ≤ 1 %, avec une borne haute de l'IC ≤ 2 % (ingénierie).
- n = 500 par population.
- Stress (u de −40 % à +20 %, apports jusqu'à 3 500 kcal) : rapporté, sans seuil.

### N3 : monde bien spécifié (bloquant)
- Sans plancher structurel : l'IC de la couverture contient 0,80 et 0,95 (définition statistique).
- Avec plancher : borne basse de l'IC ≥ 0,78 pour l'intervalle 80 % et ≥ 0,93 pour l'intervalle 95 % (ingénierie).
- n = 250 par horizon (14, 28, 42, 84 j) × fréquence (quotidienne, tous les 3 jours), sur le chemin actuel et sur le prototype.

### N4 : attribution du biais en unités de saisie (diagnostic, non bloquant)
- Le biais est attribué au prior si |biais signé| ≤ 15 kcal/j sous prior plat (ingénierie).
- n = 250 par population × horizon (14, 28, 42 j).
- Rapporter le coût du prior élargi pour P00 : largeur et erreur à 14 et 28 j.

## Phases suivantes (seuils figés maintenant, mesures plus tard)

### C1 : boucle fermée (bloquant)
- S1 : médiane du ratio vitesse obtenue / vitesse demandée dans [0,85 ; 1,15], IC inclus (produit).
- S2 : P90 du ratio ≤ 1,25 [S] (produit).
- S3 : part des utilisateurs-semaines au-dessus du plafond de vitesse IMC ≤ 5 %, borne haute de l'IC [S] (produit).
- S4 : part des utilisateurs avec au moins 7 jours d'apport réel sous le plancher réel ≤ 1 %, borne haute ≤ 2 % [S] (produit).
- S5 : non-suiveurs : médiane de |ratio − 1| plus basse en régime journal qu'avec la méthode actuelle ; IC de la différence appariée < 0 (objectif du chantier).
- S6 : suiveurs : Δ de la médiane de |ratio − 1| ≤ +0,05, borne haute (ingénierie).
- S7 : maintien : au moins 80 % des utilisateurs dans la zone de maintien à 8 semaines, borne basse (produit).
- P00 : régime journal non inférieur à « saisi = kcal réelles » : Δ |ratio − 1| ≤ +0,05, borne haute (ingénierie).

### C2 : dérive du biais (bloquant)
- S3 et S4 tenus.
- Durée médiane au-dessus de 1,25 × la vitesse demandée ≤ 21 j [S] (produit).

### C3 : journées partielles (bloquant)
- Faux passages ≤ 10 % et faux rejets ≤ 10 %, bornes hautes (ingénierie).
- Perte ≤ 0,05 sur le ratio médian de C1, par rapport à des journées complètes (ingénierie).
- Candidats : R0 ; R1 avec x ∈ {0,5 ; 0,6 ; 0,7} ; R2 ; R3 (marqueur « journée terminée » en oracle).
- Jours non exploitables : médiane des 14 jours précédents, avec un poids de 0,5 ou 0 ; la cible sert seulement de témoin.

### C5 : retour, transitions, proposition de révision (bloquant)
- Au moins 3 bascules en 168 j chez ≤ 2 % des utilisateurs, borne haute (produit).
- Aucun plan appliqué sans confirmation (invariant) [S].
- Temps médian passé dans le mauvais régime ≤ 21 j (produit).
- Proposition de révision (règle D-11) déclenchée chez ≤ 5 % des suiveurs sur 168 j, borne haute (produit).

### C6 : garde-fous en régime journal (bloquant)
- S4 [S].
- Alerte EA manquée dans ≤ 10 % des cas concernés (produit).
- Protéines réelles < 90 % de la règle chez ≤ 5 % des utilisateurs (produit).
- Bras comparés : plancher appliqué sur le saisi ; plancher saisi × 1,10.

### C7 : maintien déclaré au refus (bloquant pour la porte refus)
- Le σ retenu tient S2 à S4 sur toute la grille d'erreur de déclaration, avec μ ∈ {−15 ; 0 ; +15 %} et σ ∈ {10 ; 20 %} [S] (produit).

### C8 : rejeu
- Invariants : cibles passées et snapshots inchangés au bit près, 0 violation [S].
- Amplitude des sauts : rapportée face au seuil de 75 kcal/j.

### C9 : bruit de pesée (bloquant, non-infériorité)
Face à la méthode actuelle (ingénierie) :
- Δ couverture 80 % ≥ −0,05, borne basse ;
- Δ erreur médiane ≤ +25 kcal/j, borne haute.

### C10 : D4 hors régime journal
- Non-infériorité, avec les seuils de C9.
- Supériorité sur l'apport caché : rapportée.

### R1 : régressions (bloquant)
- 0 échec.
- Tout écart de golden est expliqué.

### R2 : performance (bloquant)
- P95 ≤ 1 s par calibration avec rejeu, pour 84 jours de pesées quotidiennes et un journal complet.
- Mesuré sur un appareil de référence, ou avec un ralentissement du CPU × 4 (produit).

## Amendement 1

Validé par le product owner le 2026-09-24, après la relecture de la phase 1 (rapport 34). Ces règles sont postérieures aux résultats de la phase 1 : toute relecture de la phase 1 sous ces règles est marquée « après coup ».

### A1.1 N1, effet de D5
- Le critère « effet de D5 : |Δ médiane| ≤ 25 kcal/j » devient un diagnostic, non bloquant.
- Justification : le monde de N1 fait manger à l'utilisateur les macros de son plan. Le critère mesure donc D5 chez quelqu'un qui suit son plan, ce qui n'est pas la population du régime journal.
- Compensation : C1 inclut une sensibilité où la part glucidique réellement mangée vaut la part de base moins 10 points, puis plus 10 points. S1 à S4 doivent y passer ; S2 à S4 restent [S].

### A1.2 Critères de couverture
S'applique à N3, à C9 et à tout critère de couverture, absolu ou en différence.
- Le critère est jugé sur l'ensemble des cellules d'un même chemin ou d'un même bras, avec un IC 95 % par bootstrap sur les utilisateurs (2 000 tirages, chaque utilisateur tiré avec tous ses horizons).
- Sans plancher structurel : l'IC de la couverture contient 0,80 et 0,95.
- Avec plancher structurel : la borne haute de l'IC est ≥ 0,80 et ≥ 0,95 (pas de sous-couverture significative).
- Les cellules sont rapportées sans verdict. Une cellule dont la borne haute est sous le nominal est signalée.
- Le critère « borne basse de l'IC ≥ 0,78 et ≥ 0,93 par cellule » est supprimé.

### A1.3 Passe doublée
- Toute passe doublée utilise des graines neuves, disjointes de toutes les passes précédentes.
- Le verdict porte sur la nouvelle passe seule.

## Amendement 2

Validé par le product owner le 2026-09-25, avant toute exécution de l'itération 2.

### A2.1 Comparaison à la solution « cible choisie » (S5b)
- Bras C : à la proposition de révision, l'utilisateur indique la cible qu'il vise, et la méthode actuelle continue, inchangée, avec cette cible.
- S5b compare le mode journal (bras J) au bras C chez les non-suiveurs en perte et en prise, par fréquence de jours d'écart après la bascule (0 %, 15 %, 30 %), avec un IC apparié, dans les deux fenêtres de C1.
- Règle de décision : le mode journal est retenu comme forme d'intégration si
  - pour les fréquences 15 % et 30 % : la médiane de |ratio − 1| est plus basse sous J que sous C, borne haute de l'IC de la différence < 0 ;
  - pour la fréquence 0 % : Δ médiane de |ratio − 1| (J − C) ≤ +0,05, borne haute (ingénierie).
- Sinon, le mode journal n'est pas poursuivi. L'intégration du journal passe alors par le niveau qualitatif (D4, itération 3), et C2 et C6 ne sont pas lancés.
- S5b n'arrête pas le chantier : il décide de la forme de l'intégration.

### A2.2 Glucides saisis
- Bras J-glucides : les glucides du glycogène de Hall sont les glucides saisis du jour, pour chaque jour exploitable.
- Règle de décision : les glucides saisis remplacent la part de base (D5) si
  - S1 à S4 passent pour J-glucides dans les quatre mondes (base, base −10, base +10, sélectif) ;
  - le |biais| moyen du maintien affiché, à 28 et 42 jours, est plus bas sous J-glucides dans les mondes −10 et +10 (borne haute de l'IC de la différence appariée < 0) ;
  - et il n'est pas plus haut de plus de 10 kcal/j (borne haute) dans les mondes base et sélectif (ingénierie).
- Sinon, D5 est conservé.

## Amendement 3 : correctif du solveur de plan

Validé par le product owner le 2026-09-25, avant toute exécution de l'itération 2a. Ces critères portent sur la méthode actuelle (bras A, sans journal) et conditionnent la reprise de l'itération 2.

Définition de la vitesse demandée retenue : (a), une vitesse tenue dans la durée, hors eau et glycogène des premiers jours. Correctif mesuré : départ du solveur à l'état actuel du corps modélisé, et cible sur la masse tissulaire.

### A3.1 Monde idéal (bloquant)
Hall nominal, pesées sans bruit, u = 0, suiveurs parfaits ; 500 utilisateurs.
- En perte et en prise, dans chacune des fenêtres (semaines 5 à 12 et 13 à 24) : médiane du ratio vitesse obtenue / vitesse demandée dans [0,95 ; 1,05], IC 95 % inclus (ingénierie : le monde est celui du solveur, l'écart attendu ne vient que de l'estimation).
- Médiane de chaque bloc de 4 semaines dans [0,90 ; 1,10] : pas de dérive au fil des mois (ingénierie).

### A3.2 Monde réaliste (bloquant)
Hall perturbé à ±20 %, pesées t + D + E, pas bruités ; 2 000 suiveurs.
- S1 à S4 et S7 de C1, avec leurs seuils. Population unique : la méthode actuelle ne lit pas le journal, le biais de saisie est donc sans effet.

### A3.3 Témoin
Le solveur actuel est mesuré sur les mêmes utilisateurs, rapporté sans verdict.

### A3.4 Premier plan (rapporté, sans seuil)
Écart de la cible du premier plan, part des plans ralentis par le plancher, part sans vitesse faisable, écarts sur les golden et les cas R et S. Le product owner confirme la définition (a) au vu de ces chiffres avant toute mise en production.

## Amendement 4 : vitesse mesurée sur les tissus, recalcul périodique

Validé par le product owner le 2026-09-25, après la lecture du rapport 37 et avant toute exécution de l'itération 2b.

### A4.1 Mesure de la vitesse
- Décidé après avoir vu les résultats de l'itération 2a, et marqué comme tel. Justification : la définition (a) de la vitesse demandée, retenue avant l'itération 2a, porte sur la masse tissulaire (hors eau et glycogène). Mesurer le poids total ne mesurait pas la quantité que le solveur doit tenir.
- Tout critère fondé sur le ratio vitesse obtenue / vitesse demandée (A3.1, A3.2, et S1, S2, S3, S5 et S5b de C1) est jugé sur la masse tissulaire vraie (gras + maigre) : pente sur le bloc, divisée par la vitesse du plan actif × le poids vrai de début de bloc.
- Le ratio sur le poids total est toujours rapporté à côté, sans verdict.
- S4 (apport sous le plancher) et S7 (zone de maintien, sur le poids) sont inchangés.
- Relecture de l'itération 2a sous cette règle : permise, marquée « après coup ».

### A4.2 Recalcul périodique et choix de l'horizon
- Candidats, tous deux avec le correctif FX (départ à l'état actuel + cible tissulaire) et un recalcul du plan tous les 28 jours :
  - K1 : horizon du solveur de 42 jours ;
  - K2 : horizon du solveur de 28 jours.
- Règle de sélection, sur des graines de sélection distinctes des graines de validation :
  - on retient le candidat qui passe tous les critères de A3.1 (sur les tissus) ;
  - si les deux passent, K1, qui change moins la production ;
  - si aucun ne passe, arrêt et diagnostic.
- Le verdict A3.1 est ensuite rendu sur les graines de validation, pour le candidat retenu seul.

## Amendement 5 : critères de A3.2 redéfinis, garde-fous du plan en cours

Validé par le product owner le 2026-09-26, après la lecture du rapport 38 et avant toute exécution de l'itération 2c.

Décidé après avoir vu les résultats de A3.2 (rapport 38), et marqué comme tel. Le verdict ÉCHOUÉ de A3.2 pour K2 au rapport 38 reste acquis. Les critères d'origine S2, S3, S4 et S7 restent calculés et rapportés à chaque mesure, sans verdict.

### A5.1 Clarifications
- La règle commune INCONCLUSIF (une passe doublée, graines neuves, A1.3) s'applique aussi aux règles de sélection, dont A4.2.
- Une proportion dont l'unité n'est pas l'utilisateur (utilisateurs-semaines, utilisateurs-blocs) a son IC 95 % par bootstrap sur les utilisateurs (2 000 tirages), et non par Wilson.

### A5.2 Justification
- S3 contredit S1 : pour un utilisateur qui demande exactement son plafond de vitesse, un solveur qui tient la vitesse demandée dépasse le plafond environ une semaine sur deux (rapport 38 : environ 9 des 16,85 points).
- S4 ne mesure pas la règle produit : le plancher (D-32) porte sur la prescription. Au rapport 38, aucune cible prescrite n'est sous le plancher, et les jours d'apport sous le plancher s'expliquent entièrement par la variation quotidienne autour de la cible (15 138 jours prédits, 15 013 observés).
- S2 mesure la précision de la calibration rapportée à la vitesse demandée : à vitesse égale, la dispersion est du même ordre sous S0 et sous K2. Son volet sécurité est porté par S3-D.
- S7 mesure la conception du maintien (zone centrée sur la première pesée, poids courant tenu), pas le solveur. Il relève d'un chantier séparé.

### A5.3 Objet mesuré : garde-fous du plan en cours (G)
Vérifiés à chaque évaluation hebdomadaire, avant l'évaluation de la calibration, sur le poids de tendance que l'app utilise :
- G1 : un plan de perte avec un IMC sous 20 est remplacé par un plan de maintien au poids actuel ; l'objectif reste ensuite le maintien.
- G2 : un plan de perte dont la vitesse dépasse le plafond IMC actuel est reconstruit, avec une vitesse au plus égale au plafond.

### A5.4 A3.2 amendé (méthode actuelle ; candidat : K2 + G)
Préalable : A3.1, inchangé, est vérifié pour K2 + G dans le monde idéal, sur graines neuves.

Monde réaliste de A3.2, 2 000 suiveurs, graines neuves. Tous les critères suivants doivent passer.
- S1 : inchangé (A4.1).
- S3-P [S] (prescription) : aucune évaluation hebdomadaire après laquelle le plan en cours prescrit une perte alors que l'IMC du poids de l'app est sous 20, ou une vitesse au-dessus du plafond IMC de ce poids. Invariant : 0 violation.
- S3-D [S] (vitesse délivrée) : part des utilisateurs-blocs (blocs de 4 semaines, semaines 5 à 24, tous objectifs) où la vitesse tissulaire délivrée dépasse 1,25 fois le plafond ≤ 5 %, borne haute de l'IC (produit).
  - En perte et en maintien, le plafond est celui de l'IMC vrai au début du bloc. Sous IMC 20, on prend celui de la tranche 20 à 22 (0,25 %/semaine) : au-delà de 1,25 fois cette valeur sur 4 semaines, la perte continue, et ce n'est plus une dérive de maintien.
  - En prise, le plafond est 0,5 %/semaine.
- S4-P [S] (plancher prescrit) : aucun jour où la cible prescrite est sous le plancher calculé par l'app (D-32). Invariant : 0.
- S2-NI (ingénierie) : dans chaque cellule objectif × fenêtre × vitesse demandée d'au moins 100 utilisateurs, Δ(P90 / médiane) du ratio tissulaire, candidat moins témoin S0 + G, ≤ +0,05, borne haute de l'IC apparié.
  - Justification du rapport P90 / médiane : le solveur actuel réduit la vitesse de façon multiplicative (environ 0,7), et une comparaison de dispersion doit être indépendante de l'échelle.
  - L'écart P90 − médiane est rapporté à côté.
- Blocs : un bloc n'entre dans les ratios de vitesse (S1, S2-NI, A3.1) que si le plan en cours garde le même objectif sur tout le bloc. Les blocs exclus sont comptés et rapportés. S3-D porte sur tous les blocs.
- Rapportés, sans verdict :
  - S2, S3, S4 et S7 d'origine ;
  - S7 centré sur le poids vrai de départ ;
  - part des utilisateurs dont la cible passe au moins 7 jours à moins de 10 % au-dessus du plancher ;
  - écart minimal entre la cible et le plancher réel.

### A5.5 Report sur C1, C2, C6 et C7 (mode journal)
Applicable dès l'itération 2, pour le bras journal :
- S3 est remplacé par S3-P et S3-D, avec les définitions de A5.4.
- S4 est remplacé par :
  - S4-P, sur le plancher du bras (plancher saisi × 1,10) ;
  - S4-J [S] : part des utilisateurs dont l'apport réel moyen, sur au moins une période de plan d'au moins 7 jours, est sous le plancher réel ≤ 1 %, avec une borne haute ≤ 2 % (produit).
- S2 est remplacé par S2-NI, le témoin étant la méthode actuelle (bras A) sur les mêmes utilisateurs.
- S7 est rapporté, sans verdict.
- Dans C2 (« S3 et S4 tenus ») et dans C7 (« S2 à S4 »), les critères remplacés se lisent de la même façon.
