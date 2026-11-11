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

## Note du 28/09/2026

Décision produit : journal lu, habitude mesurée, retenu malgré le NO-GO de V3 (semaine réelle sous le plancher en sous-déclaration légère), critère que la cible alignée échoue de la même façon (2,30 % contre 2,00 % sur la même période). Nouveau niveau d'exigence : app grand public.

## Amendement 8 du 2026-11-11 : réancrage après une pause (itération 6a)

Validé par le product owner le 2026-11-11, avant toute mesure. Les règles communes s'appliquent : IC 95 % par bootstrap à 2 000 tirages, unité = utilisateur simulé ; INCONCLUSIF n'est jamais GO (on double n une fois, puis on rapporte) ; sélection sur graines d'entraînement, verdict sur graines de validation distinctes.

Définitions
- Pause : deux pesées valides consécutives séparées de 15 jours ou plus. Période de suivi : les pesées entre deux pauses.
- Variantes : « sans » (code de 71bc77e) ; « A » : un niveau propre à chaque période, l'état du modèle de Hall continue à travers la pause ; « B » : comme A, et l'état de Hall repart de l'équilibre à la première pesée de chaque période après la première.
- Poids modélisé : poids de l'état modélisé du jour, à l'offset retenu par l'ajustement de ce jour.

Monde simulé (même modèle de Hall que l'estimateur : ce test valide le réancrage, pas la physiologie)
- Profil R (femme, 24 ans, 155 cm, 68 kg, musculation 4 séances par semaine), perte à 0,5 %/semaine, cible fixe du premier plan de production.
- Offset vrai tiré uniformément dans [−300 ; +300] kcal/j, une fois par répétition.
- Avant la pause : 21 jours, pesée quotidienne (bruit de Student à 4 degrés de liberté, échelle 0,5 kg), « plan respecté » déclaré chaque jour, apport vrai = cible, pas = cible.
- Pause : G ∈ {15 ; 22 ; 35} jours entre la dernière pesée et la pesée de retour ; ni pesée, ni adhérence, ni journal ; journaux quotidiens présents avec la cible, comme les crée l'app. Apport vrai pendant la pause : T ∈ {cible ; maintien vrai ; cible − 300 kcal}. Neuf cellules.
- Retour, au jour R : 14 jours, même suivi qu'avant la pause.
- Référence : même graine, sans pause (rapportée, non jugée).
- Graines : entraînement 6 100 000 000 + 10 000 × cellule + répétition ; validation 6 200 000 000 + 10 000 × cellule + répétition ; bootstrap 6 300 000 001. Disjointes de toute graine du dépôt, vérifié avant la mesure.

Mesures, aux jours R, R + 7 et R + 14
- m0, au jour R : |poids modélisé − pesée du jour R|.
- m1, aux jours R + 7 et R + 14 : |poids modélisé − poids vrai|.
- Rapportés : offset retenu ; cible que construirait le recalcul périodique aux jours R et R + 7 ; tous les plans construits.

Sélection (graines d'entraînement, 50 répétitions par cellule)
- Retenir la variante, A ou B, dont le maximum sur les neuf cellules de la médiane de m1 au jour R + 7 est le plus bas. Écart de moins de 0,05 kg : A.

Verdict (graines de validation, 100 répétitions par cellule, variante retenue seule ; « sans » et la référence rapportés)
- V1 : médiane de m0 ≤ 0,3 kg, borne haute de l'IC, dans chaque cellule.
- V2 : médiane de m1 ≤ 0,5 kg, borne haute de l'IC, aux jours R + 7 et R + 14, dans chaque cellule.
- V3 [S] : aucune cible sous le plancher et aucune vitesse interdite dans les plans construits.
- V4 : sans pause, 0 différence au bit près contre « sans » (captures T-03, T-04, golden, R et S, convergenceJourney ; équivalence de la 5b pour les utilisateurs sans pause).
- V5 : cas réel du 24/10, avec une pesée de 67,6 kg datée du 25/10 : |poids modélisé du 25/10 − 67,6| ≤ 0,3 kg.
- GO si V1 à V5 passent : la variante retenue est activée en production. Sinon, l'option reste sur « sans ».

Coût
- Pilote sur une cellule, 10 répétitions. Si la mesure complète est projetée au-delà de 2 h de calcul, l'entraînement passe à 25 répétitions par cellule et la validation garde 100. Au-delà encore : arrêt et rapport.
