# Itération 2 : tableaux reconstruits depuis les bruts

Script : `tests/experiments-journal/it2/tables2.experiment.ts`. Bootstrap : 2 000 tirages d’utilisateurs, graine 36 000 001.

## 6.1 Monde idéal (critère : médiane du ratio dans [0,9 ; 1,1] en perte et en prise)

200 utilisateurs (suiveurs parfaits, Hall nominal, pesées sans bruit, u = 0), bras A. Ratio = pente du poids vrai sur le bloc / (vitesse du plan actif x poids vrai au début du bloc). Propositions de révision : 0.

| Objectif | Fenêtre | Vitesse de référence | Blocs (utilisateurs) | Médiane [IC 95 %] | P10 / P90 | Dans [0,9 ; 1,1] |
|---|---|---|---|---|---|---|
| perte | semaines 5 à 12 | plan actif (weeklyRateTarget) | 158 (79) | 0,693 [0,673 ; 0,707] | 0,550 / 0,794 | **non** |
| perte | semaines 5 à 12 | demandée du profil (requestedWeeklyRate) | 158 (79) | 0,683 [0,664 ; 0,701] | 0,307 / 0,793 | **non** |
| perte | semaines 13 à 24 | plan actif (weeklyRateTarget) | 237 (79) | 0,630 [0,607 ; 0,650] | 0,473 / 0,730 | **non** |
| perte | semaines 13 à 24 | demandée du profil (requestedWeeklyRate) | 237 (79) | 0,621 [0,580 ; 0,643] | 0,259 / 0,726 | **non** |
| perte | semaines 5 à 24 | plan actif (weeklyRateTarget) | 395 (79) | 0,653 [0,635 ; 0,672] | 0,493 / 0,755 | **non** |
| perte | semaines 5 à 24 | demandée du profil (requestedWeeklyRate) | 395 (79) | 0,644 [0,623 ; 0,661] | 0,272 / 0,751 | **non** |
| prise | semaines 5 à 12 | plan actif (weeklyRateTarget) | 122 (61) | 0,768 [0,747 ; 0,790] | 0,614 / 0,883 | **non** |
| prise | semaines 5 à 12 | demandée du profil (requestedWeeklyRate) | 122 (61) | 0,768 [0,747 ; 0,790] | 0,614 / 0,883 | **non** |
| prise | semaines 13 à 24 | plan actif (weeklyRateTarget) | 183 (61) | 0,669 [0,657 ; 0,682] | 0,550 / 0,757 | **non** |
| prise | semaines 13 à 24 | demandée du profil (requestedWeeklyRate) | 183 (61) | 0,669 [0,657 ; 0,682] | 0,550 / 0,757 | **non** |
| prise | semaines 5 à 24 | plan actif (weeklyRateTarget) | 305 (61) | 0,700 [0,682 ; 0,716] | 0,562 / 0,831 | **non** |
| prise | semaines 5 à 24 | demandée du profil (requestedWeeklyRate) | 305 (61) | 0,700 [0,682 ; 0,716] | 0,562 / 0,831 | **non** |

**Contrôle 6.1 : ÉCHOUÉ** (fenêtre semaines 5 à 24, vitesse du plan actif).

### Diagnostic de l’échec (sans critère)

Pour chaque utilisateur en perte ou en prise et chaque début de bloc D, plan actif au jour D. Médianes.

| Objectif | D | n | Ratio du monde (28 j) | Ratio implicite du solveur, équilibre frais, jours 7 à 35 | Part de la variation sur 42 j du solveur tombant en semaine 1 | Variation du poids vrai sur 42 j au maintien du plan (kg) | AT du monde au jour D (kcal/j) | Offset estimé − vrai (kcal/j) |
|---|---|---|---|---|---|---|---|---|
| perte | 28 | 79 | 0,704 | 0,766 | 0,368 | 0,563 | -81,2 | -26,5 |
| perte | 56 | 79 | 0,675 | 0,772 | 0,365 | 0,697 | -74,6 | 3,5 |
| perte | 84 | 79 | 0,652 | 0,771 | 0,363 | 0,732 | -73,4 | 5,9 |
| perte | 112 | 79 | 0,623 | 0,786 | 0,362 | 0,830 | -74,3 | 5,1 |
| perte | 140 | 79 | 0,605 | 0,798 | 0,360 | 0,894 | -74,4 | 4,2 |
| perte | tous | 395 | 0,653 | 0,779 | 0,364 | 0,755 | -74,7 | 1,6 |
| prise | 28 | 61 | 0,794 | 0,780 | 0,360 | -0,246 | 26,1 | 4,1 |
| prise | 56 | 61 | 0,747 | 0,782 | 0,360 | -0,296 | 33,3 | 2,7 |
| prise | 84 | 61 | 0,718 | 0,782 | 0,360 | -0,327 | 35,2 | 0,5 |
| prise | 112 | 61 | 0,665 | 0,773 | 0,360 | -0,379 | 36,1 | -0,0 |
| prise | 140 | 61 | 0,646 | 0,772 | 0,360 | -0,433 | 36,6 | -0,2 |
| prise | tous | 305 | 0,700 | 0,779 | 0,360 | -0,336 | 33,5 | 1,0 |

## 6.2 Appariement (bifurcation contre rejeu complet depuis le jour 0)

120 utilisateurs (dont 48 avec proposition, donc bifurqués), 600 bras comparés (A, J, C, J-NASEM, J-glucides) : **0 différence(s)**. Comparaison au caractère près du JSON (doubles à aller-retour exact) des séries quotidiennes, plans, évaluations, pesées, journaux quotidiens et entrées du journal.

## Temps réel des lancements

```
2026-09-25T17:14:53+02:00 start ideal X=NaN shards=16
2026-09-25T17:15:45+02:00 end ideal X=NaN wall_s=52 failed_shards=0
2026-09-25T17:15:45+02:00 start pairing X=0.85 shards=16
2026-09-25T17:19:11+02:00 end pairing X=0.85 wall_s=206 failed_shards=0
ideal-diagnostic: 16 shards launched by a shell loop outside launch.sh, real 44.987 s (bash time), failed_shards=0
```

Coût par utilisateur (6.1, bras A seul, 168 j) : 3,8 s de calcul en moyenne (200 utilisateurs).

