# Batterie journal, phase 1 : tableaux et verdicts

Généré par `tests/experiments-journal/tables.experiment.ts` depuis les exports bruts de `tests/experiments-journal/results/`. Seuils : `tests/experiments-journal/THRESHOLDS.md`.

## N1 : équivalence du chemin

52 fixtures (46 LHS, R et S à 28 et 42 j avec historique, « écart important » tous les jours, prise). Graines : profils 101 000, fixtures 110 000 + i.

| Comparaison | q10 max |Δ| | médiane max |Δ| | q90 max |Δ| | Seuil | Verdict |
|---|---|---|---|---|---|
| prototype (glucides harness) − harness 26 | 0.00e+0 | 0.00e+0 | 0.00e+0 | ≤ 1 kcal/j | GO |

### Effet de D5 (glucides de base − glucides harness), Δ de la médiane du posterior

| Objectif | n | Δ médian | Δ min | Δ max | écart glucidique médian (kcal/j) |
|---|---|---|---|---|---|
| loss | 21 | 9.3 | -0.2 | 42.9 | 90.8 |
| gain | 16 | -3.6 | -10.6 | -0.7 | -45.6 |
| maintenance | 15 | -0.0 | -0.0 | 0.0 | -0.0 |

Max |Δ| = 42.9 kcal/j ; fixtures au-delà de 25 : 3 / 52. Médiane des Δ 0.0 [-0.0 ; 1.0]. Corrélation Δ / écart glucidique : 0.836, pente 0.145 kcal/j d'offset par kcal/j de glucides.

Verdict D5 (seuil par fixture, |Δ médiane| ≤ 25) : **NO-GO**. Lecture sur l'IC de la médiane des Δ : GO.

<details><summary>Détail par fixture</summary>

| Fixture | Objectif | Horizon | Médiane harness | Δ équivalence | Δ D5 | Δ sans historique (R, S) | Écart glucidique |
|---|---|---|---|---|---|---|---|
| lhs0 | loss | 28 | -145.82 | 0.0e+0 | 14.5 | 0.0 | 66.0 |
| lhs1 | loss | 42 | 110.76 | 0.0e+0 | 5.7 | 0.0 | 81.0 |
| lhs2 | loss | 28 | 151.64 | 0.0e+0 | 6.4 | 0.0 | 25.7 |
| lhs3 | gain | 42 | 225.32 | 0.0e+0 | -1.6 | 0.0 | -51.9 |
| lhs4 | gain | 28 | 59.60 | 0.0e+0 | -2.9 | 0.0 | -31.5 |
| lhs5 | loss | 42 | -490.73 | 0.0e+0 | 6.2 | 0.0 | 101.2 |
| lhs6 | maintenance | 28 | 118.25 | 0.0e+0 | -0.0 | 0.0 | -0.1 |
| lhs7 | gain | 42 | 366.70 | 0.0e+0 | -4.3 | 0.0 | -60.4 |
| lhs8 | maintenance | 28 | -633.80 | 0.0e+0 | -0.0 | 0.0 | -0.1 |
| lhs9 | gain | 42 | -231.86 | 0.0e+0 | -1.1 | 0.0 | -20.5 |
| lhs10 | gain | 28 | -104.45 | 0.0e+0 | -8.7 | 0.0 | -35.0 |
| lhs11 | gain | 42 | -423.33 | 0.0e+0 | -9.6 | 0.0 | -47.1 |
| lhs12 | gain | 28 | -83.31 | 0.0e+0 | -10.4 | 0.0 | -46.4 |
| lhs13 | maintenance | 42 | -415.45 | 0.0e+0 | 0.0 | 0.0 | 0.1 |
| lhs14 | gain | 28 | -109.86 | 0.0e+0 | -9.3 | 0.0 | -35.1 |
| lhs15 | maintenance | 42 | -855.00 | 0.0e+0 | 0.0 | 0.0 | 0.0 |
| lhs16 | loss | 28 | 410.79 | 0.0e+0 | 28.5 | 0.0 | 173.0 |
| lhs17 | maintenance | 42 | -0.59 | 0.0e+0 | -0.0 | 0.0 | -0.1 |
| lhs18 | maintenance | 28 | -394.84 | 0.0e+0 | -0.0 | 0.0 | -0.0 |
| lhs19 | gain | 42 | -444.45 | 0.0e+0 | -10.6 | 0.0 | -44.8 |
| lhs20 | gain | 28 | -115.06 | 0.0e+0 | -6.0 | 0.0 | -46.5 |
| lhs21 | maintenance | 42 | 312.78 | 0.0e+0 | 0.0 | 0.0 | 0.0 |
| lhs22 | maintenance | 28 | 18.80 | 0.0e+0 | -0.0 | 0.0 | -0.0 |
| lhs23 | gain | 42 | -17.22 | 0.0e+0 | -1.8 | 0.0 | -73.5 |
| lhs24 | maintenance | 28 | -440.18 | 0.0e+0 | -0.0 | 0.0 | -0.0 |
| lhs25 | loss | 42 | -194.81 | 0.0e+0 | 6.5 | 0.0 | 95.4 |
| lhs26 | maintenance | 28 | -667.50 | 0.0e+0 | -0.0 | 0.0 | -0.0 |
| lhs27 | loss | 42 | -104.67 | 0.0e+0 | -0.2 | 0.0 | 90.8 |
| lhs28 | loss | 28 | -1130.84 | 0.0e+0 | 1.2 | 0.0 | 22.3 |
| lhs29 | maintenance | 42 | -313.26 | 0.0e+0 | -0.0 | 0.0 | -0.1 |
| lhs30 | loss | 28 | 195.28 | 0.0e+0 | 22.3 | 0.0 | 92.2 |
| lhs31 | gain | 42 | -1122.37 | 0.0e+0 | -0.7 | 0.0 | -51.5 |
| lhs32 | gain | 28 | 0.73 | 0.0e+0 | -8.6 | 0.0 | -62.2 |
| lhs33 | loss | 42 | -516.09 | 0.0e+0 | 5.8 | 0.0 | 27.8 |
| lhs34 | gain | 28 | -195.27 | 0.0e+0 | -0.7 | 0.0 | -24.0 |
| lhs35 | loss | 42 | -730.58 | 0.0e+0 | 6.0 | 0.0 | 30.6 |
| lhs36 | maintenance | 28 | -648.15 | 0.0e+0 | 0.0 | 0.0 | 0.0 |
| lhs37 | loss | 42 | 0.29 | 0.0e+0 | 12.8 | 0.0 | 116.3 |
| lhs38 | loss | 28 | -143.91 | 0.0e+0 | 21.2 | 0.0 | 58.5 |
| lhs39 | gain | 42 | 375.87 | 0.0e+0 | -2.7 | 0.0 | -26.4 |
| lhs40 | loss | 28 | -52.02 | 0.0e+0 | 7.2 | 0.0 | 70.8 |
| lhs41 | loss | 42 | -68.64 | 0.0e+0 | 0.8 | 0.0 | 26.1 |
| lhs42 | maintenance | 28 | -317.53 | 0.0e+0 | 0.0 | 0.0 | 0.1 |
| lhs43 | maintenance | 42 | 161.59 | 0.0e+0 | 0.0 | 0.0 | 0.0 |
| lhs44 | loss | 28 | -830.05 | 0.0e+0 | 21.9 | 0.0 | 97.8 |
| lhs45 | maintenance | 42 | -210.66 | 0.0e+0 | 0.0 | 0.0 | 0.1 |
| R-28 | loss | 28 | -211.26 | 0.0e+0 | 42.9 | 43.3 | 136.6 |
| R-42 | loss | 42 | -418.56 | 0.0e+0 | 9.8 | 9.9 | 138.2 |
| S-28 | loss | 28 | -361.36 | 0.0e+0 | 31.2 | 30.9 | 117.9 |
| S-42 | loss | 42 | -293.41 | 0.0e+0 | 18.2 | 15.1 | 148.0 |
| major-every-day | loss | 42 | -524.94 | 0.0e+0 | 9.3 | 0.0 | 88.3 |
| gain | gain | 42 | 212.74 | 0.0e+0 | -2.2 | 0.0 | -37.2 |

</details>

## N2 : support et masse aux bornes (prototype, prior NASEM), passe 1 (n)

n = 500 par population et par horizon (28 et 84 j), pesée quotidienne ou tous les 3 j en alternance. Graines : profils 200 000, utilisateurs 210 000 + i. Critère : part d'utilisateurs avec plus de 5 % de masse dans les 10 derniers points d'une borne de la grille d'offset (posterior avec plancher).

| Population | Rôle | Loi de l’offset | Horizon | n | Part > 5 % (10 pts) [Wilson] | Part > 5 % (5 pts) | Part sans plancher (10 pts) | Vérités hors grille | Retirages | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| P00 | principal | normal | 28 | 500 | 0.0 % [0.0 % ; 0.8 %] | 0.0 % | 0.0 % | 0 | 0 | GO |
| P00 | principal | normal | 84 | 500 | 0.0 % [0.0 % ; 0.8 %] | 0.0 % | 0.0 % | 0 | 0 | GO |
| P00 | principal | t3 | 28 | 500 | 4.4 % [2.9 % ; 6.6 %] | 2.4 % | 4.8 % | 20 | 1 | NO-GO |
| P00 | principal | t3 | 84 | 500 | 5.6 % [3.9 % ; 8.0 %] | 4.8 % | 5.2 % | 20 | 1 | NO-GO |
| P05 | principal | normal | 28 | 500 | 0.4 % [0.1 % ; 1.4 %] | 0.2 % | 0.8 % | 2 | 0 | GO |
| P05 | principal | normal | 84 | 500 | 1.6 % [0.8 % ; 3.1 %] | 1.2 % | 1.0 % | 2 | 0 | INCONCLUSIF |
| P05 | principal | t3 | 28 | 500 | 6.4 % [4.6 % ; 8.9 %] | 3.6 % | 6.6 % | 32 | 1 | NO-GO |
| P05 | principal | t3 | 84 | 500 | 8.4 % [6.3 % ; 11.2 %] | 7.8 % | 8.0 % | 32 | 1 | NO-GO |
| P10 | principal | normal | 28 | 500 | 1.6 % [0.8 % ; 3.1 %] | 0.6 % | 1.6 % | 5 | 0 | INCONCLUSIF |
| P10 | principal | normal | 84 | 500 | 1.8 % [0.9 % ; 3.4 %] | 1.4 % | 1.6 % | 5 | 0 | INCONCLUSIF |
| P10 | principal | t3 | 28 | 500 | 6.6 % [4.7 % ; 9.1 %] | 5.0 % | 7.0 % | 39 | 1 | NO-GO |
| P10 | principal | t3 | 84 | 500 | 8.6 % [6.4 % ; 11.4 %] | 8.4 % | 8.6 % | 39 | 1 | NO-GO |
| P10_sd20 | sensitivity | normal | 28 | 500 | 5.2 % [3.6 % ; 7.5 %] | 2.6 % | 5.2 % | 33 | 0 | NO-GO |
| P10_sd20 | sensitivity | normal | 84 | 500 | 8.8 % [6.6 % ; 11.6 %] | 8.0 % | 8.2 % | 33 | 0 | NO-GO |
| P10_slope-10 | sensitivity | normal | 28 | 500 | 2.8 % [1.7 % ; 4.6 %] | 1.0 % | 2.8 % | 12 | 0 | NO-GO |
| P10_slope-10 | sensitivity | normal | 84 | 500 | 4.2 % [2.8 % ; 6.3 %] | 3.8 % | 3.8 % | 12 | 0 | NO-GO |
| P10_slope-5 | sensitivity | normal | 28 | 500 | 2.0 % [1.1 % ; 3.6 %] | 0.8 % | 2.0 % | 9 | 0 | NO-GO |
| P10_slope-5 | sensitivity | normal | 84 | 500 | 2.6 % [1.5 % ; 4.4 %] | 2.4 % | 2.4 % | 9 | 0 | NO-GO |
| P20 | principal | normal | 28 | 500 | 3.4 % [2.1 % ; 5.4 %] | 1.6 % | 3.8 % | 23 | 0 | NO-GO |
| P20 | principal | normal | 84 | 500 | 6.2 % [4.4 % ; 8.7 %] | 5.6 % | 5.8 % | 23 | 0 | NO-GO |
| P20 | principal | t3 | 28 | 500 | 8.8 % [6.6 % ; 11.6 %] | 6.2 % | 9.6 % | 50 | 1 | NO-GO |
| P20 | principal | t3 | 84 | 500 | 12.8 % [10.2 % ; 16.0 %] | 12.0 % | 12.0 % | 50 | 1 | NO-GO |

Verdict N2, passe 1 (n) (principales + sensibilité [S], loi normale) : **NO-GO** (principales NO-GO, sensibilité NO-GO). Variante t(3) : NO-GO.

### Stratification (populations principales, loi normale, deux horizons)

| Strate | Niveau | n | Part > 5 % (10 pts) |
|---|---|---|---|
| sexe | female | 2152 | 0.5 % [0.3 % ; 0.9 %] |
| sexe | male | 1848 | 3.5 % [2.7 % ; 4.4 %] |
| classe IMC | case_R | 160 | 1.9 % [0.6 % ; 5.4 %] |
| classe IMC | 38 | 936 | 2.5 % [1.6 % ; 3.7 %] |
| classe IMC | 31 | 936 | 2.7 % [1.8 % ; 3.9 %] |
| classe IMC | 26 | 880 | 1.3 % [0.7 % ; 2.2 %] |
| classe IMC | 21 | 928 | 1.4 % [0.8 % ; 2.4 %] |
| classe IMC | case_S | 160 | 0.0 % [0.0 % ; 2.3 %] |
| activité | strength | 2176 | 1.7 % [1.3 % ; 2.4 %] |
| activité | sedentary | 1824 | 2.0 % [1.5 % ; 2.8 %] |
| objectif | loss | 1512 | 1.8 % [1.2 % ; 2.6 %] |
| objectif | gain | 1232 | 1.9 % [1.3 % ; 2.9 %] |
| objectif | maintenance | 1256 | 1.9 % [1.3 % ; 2.8 %] |
| fréquence de pesée | tous les 1 j | 2000 | 1.8 % [1.3 % ; 2.4 %] |
| fréquence de pesée | tous les 3 j | 2000 | 2.0 % [1.5 % ; 2.7 %] |
| complétude du journal | 100 % | 4000 | 1.9 % [1.5 % ; 2.3 %] |
| horizon | 28 j | 2000 | 1.4 % [0.9 % ; 2.0 %] |
| horizon | 84 j | 2000 | 2.4 % [1.8 % ; 3.2 %] |
| population | P00 | 1000 | 0.0 % [0.0 % ; 0.4 %] |
| population | P05 | 1000 | 1.0 % [0.5 % ; 1.8 %] |
| population | P10 | 1000 | 1.7 % [1.1 % ; 2.7 %] |
| population | P20 | 1000 | 4.8 % [3.6 % ; 6.3 %] |

### Stress (rapporté, sans seuil) : u de −40 % à +20 %, apport réel = cible ou 3 500 kcal/j

| Cellule | Horizon | n | Part > 5 % (10 pts) | Masse moyenne aux bornes (10 pts) | Vérité médiane | Erreur médiane signée |
|---|---|---|---|---|---|---|
| stress_u-0.4_target | 28 | 20 | 35.0 % | 0.056 | -1022 | 235 |
| stress_u-0.4_target | 84 | 20 | 50.0 % | 0.210 | -1022 | 42 |
| stress_u-0.4_3500 | 28 | 20 | 55.0 % | 0.114 | -1376 | 515 |
| stress_u-0.4_3500 | 84 | 20 | 70.0 % | 0.407 | -1376 | 215 |
| stress_u-0.3_target | 28 | 20 | 10.0 % | 0.011 | -829 | 180 |
| stress_u-0.3_target | 84 | 20 | 15.0 % | 0.026 | -829 | 0 |
| stress_u-0.3_3500 | 28 | 20 | 10.0 % | 0.039 | -1026 | 377 |
| stress_u-0.3_3500 | 84 | 20 | 40.0 % | 0.169 | -1026 | 114 |
| stress_u-0.2_target | 28 | 20 | 0.0 % | 0.001 | -584 | 136 |
| stress_u-0.2_target | 84 | 20 | 0.0 % | 0.000 | -584 | -5 |
| stress_u-0.2_3500 | 28 | 20 | 5.0 % | 0.004 | -676 | 213 |
| stress_u-0.2_3500 | 84 | 20 | 5.0 % | 0.004 | -676 | 76 |
| stress_u-0.1_target | 28 | 20 | 0.0 % | 0.000 | -283 | 85 |
| stress_u-0.1_target | 84 | 20 | 0.0 % | 0.000 | -283 | -10 |
| stress_u-0.1_3500 | 28 | 20 | 0.0 % | 0.000 | -326 | 111 |
| stress_u-0.1_3500 | 84 | 20 | 0.0 % | 0.000 | -326 | 31 |
| stress_u0_target | 28 | 20 | 0.0 % | 0.000 | 24 | 35 |
| stress_u0_target | 84 | 20 | 0.0 % | 0.000 | 24 | -7 |
| stress_u0_3500 | 28 | 20 | 0.0 % | 0.000 | 24 | 18 |
| stress_u0_3500 | 84 | 20 | 0.0 % | 0.000 | 24 | -2 |
| stress_u0.1_target | 28 | 20 | 5.0 % | 0.003 | 285 | -35 |
| stress_u0.1_target | 84 | 20 | 0.0 % | 0.000 | 285 | 0 |
| stress_u0.1_3500 | 28 | 20 | 5.0 % | 0.004 | 374 | -89 |
| stress_u0.1_3500 | 84 | 20 | 0.0 % | 0.002 | 374 | -38 |
| stress_u0.2_target | 28 | 20 | 10.0 % | 0.011 | 513 | -114 |
| stress_u0.2_target | 84 | 20 | 5.0 % | 0.008 | 513 | -3 |
| stress_u0.2_3500 | 28 | 20 | 10.0 % | 0.013 | 724 | -227 |
| stress_u0.2_3500 | 84 | 20 | 20.0 % | 0.055 | 724 | -61 |

## N2 : support et masse aux bornes (prototype, prior NASEM), passe 2 (2n, règle de doublement)

n = 1000 par population et par horizon (28 et 84 j), pesée quotidienne ou tous les 3 j en alternance. Graines : profils 200 000, utilisateurs 210 000 + i. Critère : part d'utilisateurs avec plus de 5 % de masse dans les 10 derniers points d'une borne de la grille d'offset (posterior avec plancher).

| Population | Rôle | Loi de l’offset | Horizon | n | Part > 5 % (10 pts) [Wilson] | Part > 5 % (5 pts) | Part sans plancher (10 pts) | Vérités hors grille | Retirages | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| P00 | principal | normal | 28 | 1000 | 0.2 % [0.1 % ; 0.7 %] | 0.0 % | 0.2 % | 2 | 0 | GO |
| P00 | principal | normal | 84 | 1000 | 0.3 % [0.1 % ; 0.9 %] | 0.2 % | 0.2 % | 2 | 0 | GO |
| P00 | principal | t3 | 28 | 1000 | 3.4 % [2.4 % ; 4.7 %] | 2.6 % | 3.5 % | 39 | 1 | NO-GO |
| P00 | principal | t3 | 84 | 1000 | 5.3 % [4.1 % ; 6.9 %] | 4.7 % | 4.8 % | 39 | 1 | NO-GO |
| P05 | principal | normal | 28 | 1000 | 0.8 % [0.4 % ; 1.6 %] | 0.3 % | 0.7 % | 4 | 0 | GO |
| P05 | principal | normal | 84 | 1000 | 1.7 % [1.1 % ; 2.7 %] | 1.0 % | 1.3 % | 4 | 0 | NO-GO |
| P05 | principal | t3 | 28 | 1000 | 4.9 % [3.7 % ; 6.4 %] | 3.4 % | 5.0 % | 48 | 1 | NO-GO |
| P05 | principal | t3 | 84 | 1000 | 6.1 % [4.8 % ; 7.8 %] | 5.8 % | 5.9 % | 48 | 1 | NO-GO |
| P10 | principal | normal | 28 | 1000 | 1.1 % [0.6 % ; 2.0 %] | 0.6 % | 1.4 % | 9 | 0 | INCONCLUSIF |
| P10 | principal | normal | 84 | 1000 | 1.9 % [1.2 % ; 2.9 %] | 1.6 % | 1.7 % | 9 | 0 | NO-GO |
| P10 | principal | t3 | 28 | 1000 | 5.5 % [4.2 % ; 7.1 %] | 4.0 % | 5.7 % | 59 | 1 | NO-GO |
| P10 | principal | t3 | 84 | 1000 | 8.0 % [6.5 % ; 9.8 %] | 6.9 % | 7.0 % | 59 | 1 | NO-GO |
| P10_sd20 | sensitivity | normal | 28 | 1000 | 4.8 % [3.6 % ; 6.3 %] | 2.7 % | 5.0 % | 50 | 0 | NO-GO |
| P10_sd20 | sensitivity | normal | 84 | 1000 | 7.9 % [6.4 % ; 9.7 %] | 6.4 % | 6.9 % | 50 | 0 | NO-GO |
| P10_slope-10 | sensitivity | normal | 28 | 1000 | 2.7 % [1.9 % ; 3.9 %] | 1.7 % | 2.9 % | 29 | 0 | NO-GO |
| P10_slope-10 | sensitivity | normal | 84 | 1000 | 4.7 % [3.6 % ; 6.2 %] | 4.2 % | 4.4 % | 29 | 0 | NO-GO |
| P10_slope-5 | sensitivity | normal | 28 | 1000 | 1.9 % [1.2 % ; 2.9 %] | 1.1 % | 2.0 % | 11 | 0 | NO-GO |
| P10_slope-5 | sensitivity | normal | 84 | 1000 | 3.0 % [2.1 % ; 4.3 %] | 2.7 % | 2.8 % | 11 | 0 | NO-GO |
| P20 | principal | normal | 28 | 1000 | 4.0 % [3.0 % ; 5.4 %] | 2.0 % | 4.2 % | 39 | 0 | NO-GO |
| P20 | principal | normal | 84 | 1000 | 6.8 % [5.4 % ; 8.5 %] | 5.6 % | 5.6 % | 39 | 0 | NO-GO |
| P20 | principal | t3 | 28 | 1000 | 8.8 % [7.2 % ; 10.7 %] | 6.3 % | 9.1 % | 106 | 1 | NO-GO |
| P20 | principal | t3 | 84 | 1000 | 12.9 % [11.0 % ; 15.1 %] | 12.0 % | 12.2 % | 106 | 1 | NO-GO |

Verdict N2, passe 2 (2n, règle de doublement) (principales + sensibilité [S], loi normale) : **NO-GO** (principales NO-GO, sensibilité NO-GO). Variante t(3) : NO-GO.

### Stratification (populations principales, loi normale, deux horizons)

| Strate | Niveau | n | Part > 5 % (10 pts) |
|---|---|---|---|
| sexe | female | 4296 | 0.5 % [0.4 % ; 0.8 %] |
| sexe | male | 3704 | 3.9 % [3.3 % ; 4.6 %] |
| classe IMC | case_R | 320 | 1.3 % [0.5 % ; 3.2 %] |
| classe IMC | 31 | 1808 | 1.7 % [1.2 % ; 2.4 %] |
| classe IMC | 26 | 1824 | 1.8 % [1.3 % ; 2.5 %] |
| classe IMC | 38 | 1872 | 3.5 % [2.8 % ; 4.5 %] |
| classe IMC | 21 | 1856 | 1.8 % [1.3 % ; 2.5 %] |
| classe IMC | case_S | 320 | 0.0 % [0.0 % ; 1.2 %] |
| activité | strength | 4296 | 2.0 % [1.6 % ; 2.5 %] |
| activité | sedentary | 3704 | 2.2 % [1.8 % ; 2.7 %] |
| objectif | loss | 3072 | 1.4 % [1.0 % ; 1.8 %] |
| objectif | maintenance | 2456 | 2.0 % [1.5 % ; 2.6 %] |
| objectif | gain | 2472 | 3.2 % [2.5 % ; 3.9 %] |
| fréquence de pesée | tous les 1 j | 4000 | 2.3 % [1.8 % ; 2.8 %] |
| fréquence de pesée | tous les 3 j | 4000 | 1.9 % [1.6 % ; 2.4 %] |
| complétude du journal | 100 % | 8000 | 2.1 % [1.8 % ; 2.4 %] |
| horizon | 28 j | 4000 | 1.5 % [1.2 % ; 2.0 %] |
| horizon | 84 j | 4000 | 2.7 % [2.2 % ; 3.2 %] |
| population | P00 | 2000 | 0.3 % [0.1 % ; 0.6 %] |
| population | P05 | 2000 | 1.3 % [0.8 % ; 1.8 %] |
| population | P10 | 2000 | 1.5 % [1.1 % ; 2.1 %] |
| population | P20 | 2000 | 5.4 % [4.5 % ; 6.5 %] |

### Stress (rapporté, sans seuil) : u de −40 % à +20 %, apport réel = cible ou 3 500 kcal/j

| Cellule | Horizon | n | Part > 5 % (10 pts) | Masse moyenne aux bornes (10 pts) | Vérité médiane | Erreur médiane signée |
|---|---|---|---|---|---|---|
| stress_u-0.4_target | 28 | 20 | 35.0 % | 0.056 | -1022 | 235 |
| stress_u-0.4_target | 84 | 20 | 50.0 % | 0.210 | -1022 | 42 |
| stress_u-0.4_3500 | 28 | 20 | 55.0 % | 0.114 | -1376 | 515 |
| stress_u-0.4_3500 | 84 | 20 | 70.0 % | 0.407 | -1376 | 215 |
| stress_u-0.3_target | 28 | 20 | 10.0 % | 0.011 | -829 | 180 |
| stress_u-0.3_target | 84 | 20 | 15.0 % | 0.026 | -829 | 0 |
| stress_u-0.3_3500 | 28 | 20 | 10.0 % | 0.039 | -1026 | 377 |
| stress_u-0.3_3500 | 84 | 20 | 40.0 % | 0.169 | -1026 | 114 |
| stress_u-0.2_target | 28 | 20 | 0.0 % | 0.001 | -584 | 136 |
| stress_u-0.2_target | 84 | 20 | 0.0 % | 0.000 | -584 | -5 |
| stress_u-0.2_3500 | 28 | 20 | 5.0 % | 0.004 | -676 | 213 |
| stress_u-0.2_3500 | 84 | 20 | 5.0 % | 0.004 | -676 | 76 |
| stress_u-0.1_target | 28 | 20 | 0.0 % | 0.000 | -283 | 85 |
| stress_u-0.1_target | 84 | 20 | 0.0 % | 0.000 | -283 | -10 |
| stress_u-0.1_3500 | 28 | 20 | 0.0 % | 0.000 | -326 | 111 |
| stress_u-0.1_3500 | 84 | 20 | 0.0 % | 0.000 | -326 | 31 |
| stress_u0_target | 28 | 20 | 0.0 % | 0.000 | 24 | 35 |
| stress_u0_target | 84 | 20 | 0.0 % | 0.000 | 24 | -7 |
| stress_u0_3500 | 28 | 20 | 0.0 % | 0.000 | 24 | 18 |
| stress_u0_3500 | 84 | 20 | 0.0 % | 0.000 | 24 | -2 |
| stress_u0.1_target | 28 | 20 | 5.0 % | 0.003 | 285 | -35 |
| stress_u0.1_target | 84 | 20 | 0.0 % | 0.000 | 285 | 0 |
| stress_u0.1_3500 | 28 | 20 | 5.0 % | 0.004 | 374 | -89 |
| stress_u0.1_3500 | 84 | 20 | 0.0 % | 0.002 | 374 | -38 |
| stress_u0.2_target | 28 | 20 | 10.0 % | 0.011 | 513 | -114 |
| stress_u0.2_target | 84 | 20 | 5.0 % | 0.008 | 513 | -3 |
| stress_u0.2_3500 | 28 | 20 | 10.0 % | 0.013 | 724 | -227 |
| stress_u0.2_3500 | 84 | 20 | 20.0 % | 0.055 | 724 | -61 |

## N3 : monde bien spécifié, passe 1 (n)

n = 250 par horizon × fréquence, sur le chemin actuel et sur le prototype (u = 0). Graines : profils 300 000, utilisateurs 310 000 + i. Sans plancher = posterior d'information (structuralSdKcal = 0).

| Chemin | Horizon | Pesée | n | Couv. 80 sans plancher [Wilson] | Couv. 95 sans plancher | Verdict sans plancher | Couv. 80 avec plancher | Couv. 95 avec plancher | Verdict avec plancher | Biais (sans plancher) | Erreur médiane | Largeur 80 sans plancher | Largeur 80 avec plancher | Porte |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| current | 14 | 1 j | 250 | 0.776 [0.720 ; 0.823] | 0.928 [0.889 ; 0.954] | GO | 0.788 [0.733 ; 0.834] | 0.936 [0.899 ; 0.960] | INCONCLUSIF | 11 | 141 | 531 | 546 | 100 % |
| current | 14 | 3 j | 250 | 0.780 [0.725 ; 0.827] | 0.932 [0.894 ; 0.957] | GO | 0.784 [0.729 ; 0.831] | 0.936 [0.899 ; 0.960] | INCONCLUSIF | 5 | 177 | 634 | 647 | 0 % |
| current | 28 | 1 j | 250 | 0.804 [0.750 ; 0.848] | 0.952 [0.918 ; 0.972] | GO | 0.820 [0.768 ; 0.863] | 0.968 [0.938 ; 0.984] | INCONCLUSIF | 15 | 84 | 317 | 343 | 100 % |
| current | 28 | 3 j | 250 | 0.764 [0.708 ; 0.812] | 0.928 [0.889 ; 0.954] | GO | 0.780 [0.725 ; 0.827] | 0.936 [0.899 ; 0.960] | INCONCLUSIF | 11 | 115 | 440 | 459 | 100 % |
| current | 42 | 1 j | 250 | 0.752 [0.695 ; 0.801] | 0.940 [0.903 ; 0.963] | GO | 0.860 [0.812 ; 0.898] | 0.976 [0.949 ; 0.989] | GO | 11 | 61 | 203 | 241 | 100 % |
| current | 42 | 3 j | 250 | 0.776 [0.720 ; 0.823] | 0.924 [0.884 ; 0.951] | GO | 0.816 [0.763 ; 0.859] | 0.952 [0.918 ; 0.972] | INCONCLUSIF | 9 | 87 | 306 | 332 | 100 % |
| current | 84 | 1 j | 250 | 0.832 [0.781 ; 0.873] | 0.968 [0.938 ; 0.984] | GO | 0.988 [0.965 ; 0.996] | 1.000 [0.985 ; 1.000] | GO | 4 | 20 | 85 | 154 | 100 % |
| current | 84 | 3 j | 250 | 0.804 [0.750 ; 0.848] | 0.932 [0.894 ; 0.957] | GO | 0.908 [0.866 ; 0.938] | 0.988 [0.965 ; 0.996] | GO | 2 | 34 | 139 | 189 | 100 % |
| prototype | 14 | 1 j | 250 | 0.744 [0.686 ; 0.794] | 0.920 [0.880 ; 0.948] | NO-GO | 0.764 [0.708 ; 0.812] | 0.928 [0.889 ; 0.954] | INCONCLUSIF | 20 | 147 | 523 | 538 | 100 % |
| prototype | 14 | 3 j | 250 | 0.756 [0.699 ; 0.805] | 0.928 [0.889 ; 0.954] | GO | 0.764 [0.708 ; 0.812] | 0.928 [0.889 ; 0.954] | INCONCLUSIF | 11 | 188 | 631 | 644 | 0 % |
| prototype | 28 | 1 j | 250 | 0.768 [0.712 ; 0.816] | 0.920 [0.880 ; 0.948] | NO-GO | 0.804 [0.750 ; 0.848] | 0.948 [0.913 ; 0.969] | INCONCLUSIF | 20 | 88 | 319 | 344 | 100 % |
| prototype | 28 | 3 j | 250 | 0.760 [0.703 ; 0.809] | 0.924 [0.884 ; 0.951] | GO | 0.768 [0.712 ; 0.816] | 0.940 [0.903 ; 0.963] | INCONCLUSIF | 16 | 128 | 441 | 460 | 100 % |
| prototype | 42 | 1 j | 250 | 0.712 [0.653 ; 0.765] | 0.896 [0.852 ; 0.928] | NO-GO | 0.776 [0.720 ; 0.823] | 0.952 [0.918 ; 0.972] | INCONCLUSIF | 16 | 63 | 205 | 242 | 100 % |
| prototype | 42 | 3 j | 250 | 0.744 [0.686 ; 0.794] | 0.916 [0.875 ; 0.944] | NO-GO | 0.784 [0.729 ; 0.831] | 0.940 [0.903 ; 0.963] | INCONCLUSIF | 11 | 86 | 306 | 332 | 100 % |
| prototype | 84 | 1 j | 250 | 0.684 [0.624 ; 0.738] | 0.884 [0.838 ; 0.918] | NO-GO | 0.924 [0.884 ; 0.951] | 0.992 [0.971 ; 0.998] | GO | 6 | 28 | 85 | 154 | 100 % |
| prototype | 84 | 3 j | 250 | 0.752 [0.695 ; 0.801] | 0.904 [0.861 ; 0.935] | NO-GO | 0.868 [0.820 ; 0.904] | 0.972 [0.943 ; 0.986] | GO | 3 | 39 | 140 | 190 | 100 % |

Verdict N3, passe 1 (n) : chemin actuel **INCONCLUSIF** (sans plancher GO, avec plancher INCONCLUSIF) ; prototype **NO-GO** (sans plancher NO-GO, avec plancher INCONCLUSIF).

### Histogramme des rangs du vrai offset dans le posterior sans plancher (10 classes, χ² à 9 ddl)

| Chemin | Horizon | Pesée | Effectifs par décile | χ² | p |
|---|---|---|---|---|---|
| current | 14 | 1 j | 31 / 26 / 20 / 26 / 26 / 19 / 26 / 26 / 25 / 25 | 4.1 | 9.06e-1 |
| current | 14 | 3 j | 31 / 30 / 18 / 19 / 28 / 30 / 14 / 25 / 31 / 24 | 13.5 | 1.40e-1 |
| current | 28 | 1 j | 27 / 35 / 26 / 28 / 30 / 20 / 21 / 22 / 19 / 22 | 9.4 | 4.05e-1 |
| current | 28 | 3 j | 33 / 20 / 23 / 34 / 28 / 16 / 20 / 27 / 23 / 26 | 11.9 | 2.18e-1 |
| current | 42 | 1 j | 36 / 29 / 35 / 16 / 25 / 26 / 15 / 19 / 23 / 26 | 18.4 | 3.08e-2 |
| current | 42 | 3 j | 32 / 27 / 21 / 25 / 29 / 20 / 24 / 22 / 26 / 24 | 4.9 | 8.45e-1 |
| current | 84 | 1 j | 27 / 30 / 27 / 24 / 28 / 27 / 30 / 17 / 25 / 15 | 9.4 | 3.98e-1 |
| current | 84 | 3 j | 26 / 27 / 27 / 22 / 23 / 27 / 29 / 24 / 22 / 23 | 2.2 | 9.87e-1 |
| prototype | 14 | 1 j | 38 / 23 / 28 / 24 / 25 / 15 / 26 / 22 / 23 / 26 | 11.9 | 2.18e-1 |
| prototype | 14 | 3 j | 32 / 28 / 25 / 17 / 27 / 27 / 15 / 23 / 27 / 29 | 10.2 | 3.38e-1 |
| prototype | 28 | 1 j | 35 / 32 / 30 / 27 / 19 / 19 / 24 / 19 / 22 / 23 | 12.0 | 2.13e-1 |
| prototype | 28 | 3 j | 35 / 24 / 27 / 24 / 27 / 22 / 16 / 21 / 29 / 25 | 9.3 | 4.12e-1 |
| prototype | 42 | 1 j | 44 / 25 / 31 / 19 / 23 / 22 / 20 / 17 / 21 / 28 | 22.4 | 7.69e-3 |
| prototype | 42 | 3 j | 38 / 27 / 21 / 26 / 24 / 17 / 22 / 27 / 22 / 26 | 11.1 | 2.68e-1 |
| prototype | 84 | 1 j | 48 / 26 / 23 / 19 / 14 / 25 / 22 / 22 / 20 / 31 | 30.8 | 3.20e-4 |
| prototype | 84 | 3 j | 38 / 19 / 23 / 16 / 19 / 27 / 31 / 25 / 28 / 24 | 15.0 | 8.98e-2 |

### Stratification (tous horizons confondus)

| Chemin | Strate | Niveau | n | Couv. 80 sans plancher | Couv. 95 sans plancher | Couv. 80 avec plancher |
|---|---|---|---|---|---|---|
| current | sexe | female | 1100 | 0.796 [0.772 ; 0.819] | 0.935 [0.918 ; 0.948] | 0.854 [0.832 ; 0.873] |
| current | sexe | male | 900 | 0.773 [0.745 ; 0.799] | 0.942 [0.925 ; 0.956] | 0.830 [0.804 ; 0.853] |
| current | classe IMC | case_R | 80 | 0.688 [0.579 ; 0.778] | 0.875 [0.785 ; 0.931] | 0.750 [0.645 ; 0.832] |
| current | classe IMC | 26 | 460 | 0.772 [0.731 ; 0.808] | 0.941 [0.916 ; 0.959] | 0.841 [0.805 ; 0.872] |
| current | classe IMC | 38 | 472 | 0.803 [0.765 ; 0.836] | 0.943 [0.918 ; 0.960] | 0.850 [0.815 ; 0.879] |
| current | classe IMC | 31 | 464 | 0.763 [0.722 ; 0.799] | 0.920 [0.892 ; 0.942] | 0.819 [0.781 ; 0.851] |
| current | classe IMC | 21 | 444 | 0.813 [0.774 ; 0.847] | 0.959 [0.937 ; 0.974] | 0.876 [0.842 ; 0.904] |
| current | classe IMC | case_S | 80 | 0.850 [0.756 ; 0.912] | 0.938 [0.862 ; 0.973] | 0.863 [0.770 ; 0.921] |
| current | activité | strength | 1088 | 0.800 [0.775 ; 0.822] | 0.938 [0.922 ; 0.950] | 0.842 [0.819 ; 0.862] |
| current | activité | sedentary | 912 | 0.770 [0.741 ; 0.796] | 0.939 [0.921 ; 0.952] | 0.844 [0.819 ; 0.866] |
| current | objectif | loss | 780 | 0.792 [0.762 ; 0.819] | 0.941 [0.922 ; 0.955] | 0.847 [0.821 ; 0.871] |
| current | objectif | gain | 604 | 0.785 [0.750 ; 0.816] | 0.932 [0.909 ; 0.950] | 0.839 [0.808 ; 0.867] |
| current | objectif | maintenance | 616 | 0.779 [0.745 ; 0.810] | 0.940 [0.918 ; 0.956] | 0.841 [0.810 ; 0.868] |
| current | fréquence de pesée | tous les 1 j | 1000 | 0.791 [0.765 ; 0.815] | 0.947 [0.931 ; 0.959] | 0.864 [0.841 ; 0.884] |
| current | fréquence de pesée | tous les 3 j | 1000 | 0.781 [0.754 ; 0.806] | 0.929 [0.911 ; 0.943] | 0.822 [0.797 ; 0.844] |
| current | complétude du journal | 100 % | 2000 | 0.786 [0.767 ; 0.803] | 0.938 [0.927 ; 0.948] | 0.843 [0.826 ; 0.858] |
| prototype | sexe | female | 1100 | 0.749 [0.723 ; 0.774] | 0.918 [0.900 ; 0.933] | 0.821 [0.797 ; 0.842] |
| prototype | sexe | male | 900 | 0.729 [0.699 ; 0.757] | 0.903 [0.882 ; 0.921] | 0.789 [0.761 ; 0.814] |
| prototype | classe IMC | case_R | 80 | 0.550 [0.441 ; 0.654] | 0.838 [0.742 ; 0.903] | 0.675 [0.566 ; 0.768] |
| prototype | classe IMC | 26 | 460 | 0.728 [0.686 ; 0.767] | 0.913 [0.884 ; 0.935] | 0.802 [0.763 ; 0.836] |
| prototype | classe IMC | 38 | 472 | 0.754 [0.713 ; 0.791] | 0.919 [0.891 ; 0.941] | 0.811 [0.774 ; 0.844] |
| prototype | classe IMC | 31 | 464 | 0.737 [0.695 ; 0.775] | 0.901 [0.870 ; 0.925] | 0.789 [0.749 ; 0.823] |
| prototype | classe IMC | 21 | 444 | 0.761 [0.719 ; 0.799] | 0.917 [0.887 ; 0.939] | 0.840 [0.803 ; 0.871] |
| prototype | classe IMC | case_S | 80 | 0.813 [0.713 ; 0.883] | 0.963 [0.895 ; 0.987] | 0.850 [0.756 ; 0.912] |
| prototype | activité | strength | 1088 | 0.749 [0.722 ; 0.774] | 0.909 [0.890 ; 0.925] | 0.807 [0.782 ; 0.829] |
| prototype | activité | sedentary | 912 | 0.729 [0.699 ; 0.757] | 0.914 [0.895 ; 0.931] | 0.806 [0.779 ; 0.830] |
| prototype | objectif | loss | 780 | 0.753 [0.721 ; 0.782] | 0.921 [0.899 ; 0.938] | 0.818 [0.789 ; 0.843] |
| prototype | objectif | gain | 604 | 0.730 [0.693 ; 0.764] | 0.902 [0.876 ; 0.924] | 0.808 [0.775 ; 0.837] |
| prototype | objectif | maintenance | 616 | 0.734 [0.697 ; 0.767] | 0.909 [0.884 ; 0.929] | 0.791 [0.757 ; 0.821] |
| prototype | fréquence de pesée | tous les 1 j | 1000 | 0.727 [0.699 ; 0.754] | 0.905 [0.885 ; 0.922] | 0.817 [0.792 ; 0.840] |
| prototype | fréquence de pesée | tous les 3 j | 1000 | 0.753 [0.725 ; 0.779] | 0.918 [0.899 ; 0.933] | 0.796 [0.770 ; 0.820] |
| prototype | complétude du journal | 100 % | 2000 | 0.740 [0.720 ; 0.759] | 0.911 [0.898 ; 0.923] | 0.806 [0.789 ; 0.823] |

## N3 : monde bien spécifié, passe 2 (2n, règle de doublement)

n = 500 par horizon × fréquence, sur le chemin actuel et sur le prototype (u = 0). Graines : profils 300 000, utilisateurs 310 000 + i. Sans plancher = posterior d'information (structuralSdKcal = 0).

| Chemin | Horizon | Pesée | n | Couv. 80 sans plancher [Wilson] | Couv. 95 sans plancher | Verdict sans plancher | Couv. 80 avec plancher | Couv. 95 avec plancher | Verdict avec plancher | Biais (sans plancher) | Erreur médiane | Largeur 80 sans plancher | Largeur 80 avec plancher | Porte |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| current | 14 | 1 j | 500 | 0.804 [0.767 ; 0.836] | 0.934 [0.909 ; 0.953] | GO | 0.822 [0.786 ; 0.853] | 0.938 [0.913 ; 0.956] | INCONCLUSIF | 10 | 137 | 531 | 546 | 100 % |
| current | 14 | 3 j | 500 | 0.782 [0.744 ; 0.816] | 0.944 [0.920 ; 0.961] | GO | 0.796 [0.758 ; 0.829] | 0.944 [0.920 ; 0.961] | INCONCLUSIF | 3 | 156 | 631 | 644 | 0 % |
| current | 28 | 1 j | 500 | 0.806 [0.769 ; 0.838] | 0.944 [0.920 ; 0.961] | GO | 0.842 [0.807 ; 0.871] | 0.956 [0.934 ; 0.971] | GO | 3 | 79 | 315 | 340 | 100 % |
| current | 28 | 3 j | 500 | 0.798 [0.761 ; 0.831] | 0.946 [0.923 ; 0.963] | GO | 0.822 [0.786 ; 0.853] | 0.952 [0.930 ; 0.968] | INCONCLUSIF | 9 | 109 | 437 | 455 | 100 % |
| current | 42 | 1 j | 500 | 0.776 [0.737 ; 0.810] | 0.930 [0.904 ; 0.949] | NO-GO | 0.846 [0.812 ; 0.875] | 0.976 [0.959 ; 0.986] | GO | 3 | 58 | 202 | 240 | 100 % |
| current | 42 | 3 j | 500 | 0.792 [0.754 ; 0.825] | 0.946 [0.923 ; 0.963] | GO | 0.830 [0.795 ; 0.860] | 0.968 [0.949 ; 0.980] | GO | 8 | 85 | 300 | 327 | 100 % |
| current | 84 | 1 j | 500 | 0.794 [0.756 ; 0.827] | 0.958 [0.937 ; 0.972] | GO | 0.980 [0.964 ; 0.989] | 0.994 [0.983 ; 0.998] | GO | 4 | 21 | 84 | 153 | 100 % |
| current | 84 | 3 j | 500 | 0.792 [0.754 ; 0.825] | 0.948 [0.925 ; 0.964] | GO | 0.914 [0.886 ; 0.936] | 0.990 [0.977 ; 0.996] | GO | 4 | 34 | 137 | 188 | 100 % |
| prototype | 14 | 1 j | 500 | 0.780 [0.742 ; 0.814] | 0.926 [0.900 ; 0.946] | NO-GO | 0.798 [0.761 ; 0.831] | 0.932 [0.906 ; 0.951] | INCONCLUSIF | 20 | 141 | 527 | 542 | 100 % |
| prototype | 14 | 3 j | 500 | 0.774 [0.735 ; 0.808] | 0.936 [0.911 ; 0.954] | GO | 0.786 [0.748 ; 0.820] | 0.944 [0.920 ; 0.961] | INCONCLUSIF | 10 | 165 | 627 | 640 | 0 % |
| prototype | 28 | 1 j | 500 | 0.764 [0.725 ; 0.799] | 0.934 [0.909 ; 0.953] | NO-GO | 0.816 [0.780 ; 0.848] | 0.956 [0.934 ; 0.971] | INCONCLUSIF | 8 | 89 | 315 | 340 | 100 % |
| prototype | 28 | 3 j | 500 | 0.784 [0.746 ; 0.818] | 0.942 [0.918 ; 0.959] | GO | 0.810 [0.773 ; 0.842] | 0.948 [0.925 ; 0.964] | INCONCLUSIF | 17 | 116 | 436 | 454 | 100 % |
| prototype | 42 | 1 j | 500 | 0.732 [0.692 ; 0.769] | 0.906 [0.877 ; 0.929] | NO-GO | 0.816 [0.780 ; 0.848] | 0.964 [0.944 ; 0.977] | INCONCLUSIF | 7 | 64 | 203 | 240 | 100 % |
| prototype | 42 | 3 j | 500 | 0.764 [0.725 ; 0.799] | 0.924 [0.897 ; 0.944] | NO-GO | 0.796 [0.758 ; 0.829] | 0.946 [0.923 ; 0.963] | INCONCLUSIF | 15 | 85 | 302 | 328 | 100 % |
| prototype | 84 | 1 j | 500 | 0.686 [0.644 ; 0.725] | 0.898 [0.868 ; 0.922] | NO-GO | 0.922 [0.895 ; 0.942] | 0.992 [0.980 ; 0.997] | GO | 5 | 27 | 85 | 154 | 100 % |
| prototype | 84 | 3 j | 500 | 0.756 [0.716 ; 0.792] | 0.912 [0.884 ; 0.934] | NO-GO | 0.876 [0.844 ; 0.902] | 0.976 [0.959 ; 0.986] | GO | 6 | 41 | 138 | 189 | 100 % |

Verdict N3, passe 2 (2n, règle de doublement) : chemin actuel **NO-GO** (sans plancher NO-GO, avec plancher INCONCLUSIF) ; prototype **NO-GO** (sans plancher NO-GO, avec plancher INCONCLUSIF).

### Histogramme des rangs du vrai offset dans le posterior sans plancher (10 classes, χ² à 9 ddl)

| Chemin | Horizon | Pesée | Effectifs par décile | χ² | p |
|---|---|---|---|---|---|
| current | 14 | 1 j | 56 / 53 / 51 / 46 / 47 / 48 / 52 / 58 / 47 / 42 | 4.3 | 8.89e-1 |
| current | 14 | 3 j | 58 / 43 / 47 / 49 / 53 / 62 / 42 / 46 / 49 / 51 | 7.2 | 6.20e-1 |
| current | 28 | 1 j | 52 / 55 / 45 / 50 / 44 / 57 / 63 / 45 / 44 / 45 | 7.9 | 5.46e-1 |
| current | 28 | 3 j | 61 / 45 / 44 / 69 / 52 / 43 / 39 / 57 / 50 / 40 | 17.3 | 4.39e-2 |
| current | 42 | 1 j | 56 / 54 / 62 / 45 / 43 / 46 / 48 / 36 / 54 / 56 | 10.8 | 2.93e-1 |
| current | 42 | 3 j | 62 / 58 / 41 / 54 / 47 / 52 / 42 / 48 / 54 / 42 | 9.3 | 4.08e-1 |
| current | 84 | 1 j | 65 / 49 / 59 / 45 / 56 / 59 / 47 / 34 / 48 / 38 | 17.2 | 4.51e-2 |
| current | 84 | 3 j | 58 / 52 / 50 / 49 / 56 / 53 / 45 / 50 / 41 / 46 | 4.7 | 8.58e-1 |
| prototype | 14 | 1 j | 68 / 49 / 54 / 57 / 39 / 44 / 49 / 50 / 48 / 42 | 12.3 | 1.96e-1 |
| prototype | 14 | 3 j | 58 / 50 / 57 / 34 / 57 / 57 / 48 / 42 / 42 / 55 | 12.5 | 1.88e-1 |
| prototype | 28 | 1 j | 69 / 51 / 45 / 48 / 40 / 42 / 61 / 43 / 52 / 49 | 14.6 | 1.03e-1 |
| prototype | 28 | 3 j | 64 / 51 / 52 / 56 / 56 / 41 / 41 / 49 / 46 / 44 | 9.8 | 3.70e-1 |
| prototype | 42 | 1 j | 72 / 58 / 45 / 44 / 37 / 54 / 44 / 36 / 48 / 62 | 23.5 | 5.20e-3 |
| prototype | 42 | 3 j | 71 / 54 / 53 / 52 / 47 / 46 / 42 / 42 / 46 / 47 | 13.0 | 1.64e-1 |
| prototype | 84 | 1 j | 95 / 45 / 44 / 43 / 45 / 34 / 46 / 37 / 49 / 62 | 54.9 | 1.26e-8 |
| prototype | 84 | 3 j | 76 / 58 / 39 / 43 / 58 / 35 / 46 / 53 / 46 / 46 | 25.1 | 2.84e-3 |

### Stratification (tous horizons confondus)

| Chemin | Strate | Niveau | n | Couv. 80 sans plancher | Couv. 95 sans plancher | Couv. 80 avec plancher |
|---|---|---|---|---|---|---|
| current | sexe | female | 2160 | 0.793 [0.775 ; 0.810] | 0.943 [0.932 ; 0.952] | 0.857 [0.842 ; 0.872] |
| current | sexe | male | 1840 | 0.793 [0.774 ; 0.811] | 0.945 [0.933 ; 0.954] | 0.855 [0.839 ; 0.871] |
| current | classe IMC | case_R | 160 | 0.738 [0.664 ; 0.800] | 0.900 [0.844 ; 0.938] | 0.787 [0.718 ; 0.844] |
| current | classe IMC | 21 | 936 | 0.778 [0.750 ; 0.803] | 0.942 [0.925 ; 0.956] | 0.859 [0.835 ; 0.880] |
| current | classe IMC | 26 | 912 | 0.800 [0.773 ; 0.825] | 0.957 [0.942 ; 0.969] | 0.873 [0.850 ; 0.893] |
| current | classe IMC | 31 | 904 | 0.790 [0.762 ; 0.815] | 0.939 [0.922 ; 0.953] | 0.853 [0.828 ; 0.874] |
| current | classe IMC | case_S | 160 | 0.856 [0.794 ; 0.902] | 0.950 [0.904 ; 0.974] | 0.875 [0.815 ; 0.918] |
| current | classe IMC | 38 | 928 | 0.803 [0.776 ; 0.827] | 0.943 [0.926 ; 0.956] | 0.850 [0.826 ; 0.872] |
| current | activité | strength | 2160 | 0.799 [0.781 ; 0.815] | 0.942 [0.931 ; 0.951] | 0.855 [0.839 ; 0.869] |
| current | activité | sedentary | 1840 | 0.786 [0.767 ; 0.805] | 0.946 [0.934 ; 0.955] | 0.859 [0.842 ; 0.874] |
| current | objectif | loss | 1544 | 0.796 [0.775 ; 0.815] | 0.936 [0.923 ; 0.947] | 0.861 [0.843 ; 0.878] |
| current | objectif | gain | 1248 | 0.783 [0.759 ; 0.805] | 0.941 [0.926 ; 0.953] | 0.844 [0.823 ; 0.863] |
| current | objectif | maintenance | 1208 | 0.800 [0.776 ; 0.821] | 0.957 [0.944 ; 0.967] | 0.863 [0.843 ; 0.882] |
| current | fréquence de pesée | tous les 1 j | 2000 | 0.795 [0.777 ; 0.812] | 0.942 [0.930 ; 0.951] | 0.873 [0.857 ; 0.886] |
| current | fréquence de pesée | tous les 3 j | 2000 | 0.791 [0.773 ; 0.808] | 0.946 [0.935 ; 0.955] | 0.841 [0.824 ; 0.856] |
| current | complétude du journal | 100 % | 4000 | 0.793 [0.780 ; 0.805] | 0.944 [0.936 ; 0.950] | 0.857 [0.845 ; 0.867] |
| prototype | sexe | female | 2160 | 0.762 [0.743 ; 0.779] | 0.926 [0.915 ; 0.937] | 0.831 [0.815 ; 0.847] |
| prototype | sexe | male | 1840 | 0.747 [0.727 ; 0.767] | 0.917 [0.904 ; 0.929] | 0.823 [0.805 ; 0.840] |
| prototype | classe IMC | case_R | 160 | 0.644 [0.567 ; 0.714] | 0.875 [0.815 ; 0.918] | 0.744 [0.671 ; 0.805] |
| prototype | classe IMC | 21 | 936 | 0.753 [0.725 ; 0.780] | 0.921 [0.902 ; 0.937] | 0.842 [0.817 ; 0.864] |
| prototype | classe IMC | 26 | 912 | 0.771 [0.742 ; 0.797] | 0.938 [0.920 ; 0.951] | 0.841 [0.816 ; 0.863] |
| prototype | classe IMC | 31 | 904 | 0.743 [0.714 ; 0.771] | 0.918 [0.898 ; 0.934] | 0.810 [0.783 ; 0.834] |
| prototype | classe IMC | case_S | 160 | 0.800 [0.731 ; 0.855] | 0.956 [0.912 ; 0.979] | 0.856 [0.794 ; 0.902] |
| prototype | classe IMC | 38 | 928 | 0.764 [0.736 ; 0.790] | 0.915 [0.895 ; 0.931] | 0.827 [0.801 ; 0.850] |
| prototype | activité | strength | 2160 | 0.748 [0.729 ; 0.766] | 0.918 [0.906 ; 0.929] | 0.821 [0.805 ; 0.837] |
| prototype | activité | sedentary | 1840 | 0.763 [0.743 ; 0.782] | 0.927 [0.914 ; 0.938] | 0.835 [0.817 ; 0.851] |
| prototype | objectif | loss | 1544 | 0.755 [0.732 ; 0.775] | 0.918 [0.904 ; 0.931] | 0.835 [0.815 ; 0.853] |
| prototype | objectif | gain | 1248 | 0.730 [0.705 ; 0.754] | 0.911 [0.894 ; 0.926] | 0.805 [0.782 ; 0.826] |
| prototype | objectif | maintenance | 1208 | 0.781 [0.757 ; 0.804] | 0.939 [0.924 ; 0.951] | 0.841 [0.819 ; 0.861] |
| prototype | fréquence de pesée | tous les 1 j | 2000 | 0.741 [0.721 ; 0.759] | 0.916 [0.903 ; 0.927] | 0.838 [0.821 ; 0.853] |
| prototype | fréquence de pesée | tous les 3 j | 2000 | 0.769 [0.751 ; 0.787] | 0.928 [0.916 ; 0.939] | 0.817 [0.799 ; 0.833] |
| prototype | complétude du journal | 100 % | 4000 | 0.755 [0.741 ; 0.768] | 0.922 [0.914 ; 0.930] | 0.828 [0.815 ; 0.839] |

## N4 : attribution du biais en unités de saisie (diagnostic, non bloquant), passe 1 (n)

n = 250 par population × horizon (mêmes utilisateurs pour les trois priors et les quatre populations). Graines : profils 400 000, utilisateurs 410 000 + i. Biais = moyenne de (médiane − vérité en unités de saisie), IC bootstrap.

| Population | Horizon | Prior | n | Biais signé [IC] | Erreur médiane [IC] | Couv. 80 [Wilson] | Couv. 95 | Largeur 80 (méd.) | Attribution (prior plat, |biais| ≤ 15) |
|---|---|---|---|---|---|---|---|---|---|
| P00 | 14 | flat | 250 | 76.8 [31.1 ; 122.5] | 222 [194 ; 281] | 0.752 [0.695 ; 0.801] | 0.960 [0.928 ; 0.978] | 843 | non attribué au prior |
| P00 | 14 | nasem | 250 | 14.9 [-15.8 ; 44.7] | 153 [135 ; 188] | 0.784 [0.729 ; 0.831] | 0.968 [0.938 ; 0.984] | 590 |  |
| P00 | 14 | widened | 250 | 26.4 [-7.1 ; 56.9] | 172 [139 ; 198] | 0.824 [0.772 ; 0.866] | 0.972 [0.943 ; 0.986] | 667 |  |
| P00 | 28 | flat | 250 | 21.8 [-3.6 ; 47.2] | 124 [104 ; 143] | 0.776 [0.720 ; 0.823] | 0.948 [0.913 ; 0.969] | 432 | INCONCLUSIF |
| P00 | 28 | nasem | 250 | 5.7 [-15.4 ; 26.3] | 100 [86 ; 121] | 0.788 [0.733 ; 0.834] | 0.944 [0.908 ; 0.966] | 390 |  |
| P00 | 28 | widened | 250 | 10.6 [-11.9 ; 32.6] | 104 [92 ; 125] | 0.768 [0.712 ; 0.816] | 0.956 [0.923 ; 0.975] | 408 |  |
| P00 | 42 | flat | 250 | 4.6 [-12.9 ; 20.5] | 80 [69 ; 92] | 0.812 [0.759 ; 0.856] | 0.952 [0.918 ; 0.972] | 281 | INCONCLUSIF |
| P00 | 42 | nasem | 250 | -0.6 [-15.6 ; 15.2] | 71 [62 ; 81] | 0.840 [0.789 ; 0.880] | 0.940 [0.903 ; 0.963] | 274 |  |
| P00 | 42 | widened | 250 | 1.3 [-15.5 ; 17.9] | 74 [62 ; 85] | 0.832 [0.781 ; 0.873] | 0.944 [0.908 ; 0.966] | 277 |  |
| P05 | 14 | flat | 250 | 88.4 [42.7 ; 133.2] | 218 [186 ; 289] | 0.748 [0.691 ; 0.798] | 0.944 [0.908 ; 0.966] | 819 | non attribué au prior |
| P05 | 14 | nasem | 250 | 71.5 [36.9 ; 106.5] | 208 [172 ; 232] | 0.680 [0.620 ; 0.735] | 0.900 [0.857 ; 0.931] | 593 |  |
| P05 | 14 | widened | 250 | 70.6 [35.6 ; 105.4] | 190 [171 ; 214] | 0.772 [0.716 ; 0.820] | 0.936 [0.899 ; 0.960] | 669 |  |
| P05 | 28 | flat | 250 | 26.7 [0.4 ; 53.7] | 122 [103 ; 143] | 0.760 [0.703 ; 0.809] | 0.940 [0.903 ; 0.963] | 427 | INCONCLUSIF |
| P05 | 28 | nasem | 250 | 31.5 [7.8 ; 54.0] | 114 [98 ; 136] | 0.756 [0.699 ; 0.805] | 0.916 [0.875 ; 0.944] | 391 |  |
| P05 | 28 | widened | 250 | 28.9 [5.2 ; 51.5] | 116 [100 ; 131] | 0.772 [0.716 ; 0.820] | 0.928 [0.889 ; 0.954] | 405 |  |
| P05 | 42 | flat | 250 | 6.7 [-9.6 ; 23.4] | 80 [70 ; 89] | 0.792 [0.737 ; 0.838] | 0.944 [0.908 ; 0.966] | 280 | INCONCLUSIF |
| P05 | 42 | nasem | 250 | 12.0 [-3.6 ; 27.5] | 75 [64 ; 86] | 0.808 [0.755 ; 0.852] | 0.932 [0.894 ; 0.957] | 273 |  |
| P05 | 42 | widened | 250 | 9.9 [-6.1 ; 25.2] | 74 [65 ; 87] | 0.820 [0.768 ; 0.863] | 0.928 [0.889 ; 0.954] | 276 |  |
| P10 | 14 | flat | 250 | 105.8 [61.6 ; 149.7] | 227 [187 ; 281] | 0.732 [0.674 ; 0.783] | 0.940 [0.903 ; 0.963] | 816 | non attribué au prior |
| P10 | 14 | nasem | 250 | 141.2 [104.5 ; 175.7] | 230 [193 ; 254] | 0.656 [0.595 ; 0.712] | 0.860 [0.812 ; 0.898] | 596 |  |
| P10 | 14 | widened | 250 | 125.2 [87.5 ; 162.3] | 219 [194 ; 241] | 0.724 [0.666 ; 0.776] | 0.904 [0.861 ; 0.935] | 673 |  |
| P10 | 28 | flat | 250 | 32.2 [7.2 ; 57.0] | 120 [99 ; 141] | 0.764 [0.708 ; 0.812] | 0.932 [0.894 ; 0.957] | 423 | INCONCLUSIF |
| P10 | 28 | nasem | 250 | 62.6 [39.5 ; 85.8] | 114 [103 ; 140] | 0.696 [0.636 ; 0.750] | 0.900 [0.857 ; 0.931] | 391 |  |
| P10 | 28 | widened | 250 | 50.7 [28.1 ; 73.2] | 110 [98 ; 131] | 0.764 [0.708 ; 0.812] | 0.904 [0.861 ; 0.935] | 400 |  |
| P10 | 42 | flat | 250 | 9.4 [-8.8 ; 26.7] | 77 [68 ; 89] | 0.800 [0.746 ; 0.845] | 0.940 [0.903 ; 0.963] | 278 | INCONCLUSIF |
| P10 | 42 | nasem | 250 | 26.6 [10.5 ; 43.6] | 81 [67 ; 94] | 0.804 [0.750 ; 0.848] | 0.920 [0.880 ; 0.948] | 270 |  |
| P10 | 42 | widened | 250 | 19.9 [2.9 ; 36.1] | 79 [66 ; 87] | 0.816 [0.763 ; 0.859] | 0.924 [0.884 ; 0.951] | 273 |  |
| P20 | 14 | flat | 250 | 143.2 [101.5 ; 187.6] | 240 [189 ; 296] | 0.680 [0.620 ; 0.735] | 0.884 [0.838 ; 0.918] | 797 | non attribué au prior |
| P20 | 14 | nasem | 250 | 282.1 [245.1 ; 321.3] | 293 [244 ; 333] | 0.492 [0.431 ; 0.554] | 0.712 [0.653 ; 0.765] | 604 |  |
| P20 | 14 | widened | 250 | 234.7 [198.0 ; 270.9] | 284 [245 ; 302] | 0.596 [0.534 ; 0.655] | 0.812 [0.759 ; 0.856] | 672 |  |
| P20 | 28 | flat | 250 | 47.9 [22.7 ; 73.0] | 131 [108 ; 152] | 0.720 [0.661 ; 0.772] | 0.876 [0.829 ; 0.911] | 406 | non attribué au prior |
| P20 | 28 | nasem | 250 | 127.6 [104.2 ; 152.2] | 142 [121 ; 178] | 0.612 [0.550 ; 0.670] | 0.788 [0.733 ; 0.834] | 388 |  |
| P20 | 28 | widened | 250 | 97.5 [73.3 ; 120.7] | 129 [105 ; 154] | 0.652 [0.591 ; 0.708] | 0.840 [0.789 ; 0.880] | 395 |  |
| P20 | 42 | flat | 250 | 21.0 [2.6 ; 39.6] | 82 [69 ; 96] | 0.764 [0.708 ; 0.812] | 0.892 [0.847 ; 0.925] | 274 | INCONCLUSIF |
| P20 | 42 | nasem | 250 | 60.7 [42.4 ; 78.3] | 84 [77 ; 101] | 0.724 [0.666 ; 0.776] | 0.868 [0.820 ; 0.904] | 267 |  |
| P20 | 42 | widened | 250 | 45.1 [26.7 ; 64.1] | 84 [72 ; 99] | 0.764 [0.708 ; 0.812] | 0.888 [0.843 ; 0.921] | 270 |  |

### Coût du prior élargi pour P00 (élargi − NASEM, apparié)

| Horizon | Δ largeur 80 médiane [IC] | Δ erreur médiane [IC] |
|---|---|---|
| 14 | 77 [66 ; 90] | 19.7 [-7.6 ; 32.0] |
| 28 | 19 [10 ; 23] | 3.7 [-5.9 ; 13.6] |

### Stratification (toutes populations et horizons confondus)

| Prior | Strate | Niveau | n | Biais signé | Erreur médiane | Couv. 80 |
|---|---|---|---|---|---|---|
| nasem | sexe | female | 1644 | 62.5 | 124 | 0.692 [0.669 ; 0.714] |
| nasem | sexe | male | 1356 | 78.3 | 114 | 0.754 [0.730 ; 0.776] |
| nasem | classe IMC | case_R | 120 | 55.8 | 94 | 0.792 [0.711 ; 0.855] |
| nasem | classe IMC | 31 | 648 | 135.1 | 143 | 0.645 [0.607 ; 0.681] |
| nasem | classe IMC | 21 | 720 | 52.4 | 97 | 0.764 [0.732 ; 0.793] |
| nasem | classe IMC | 26 | 732 | 77.9 | 119 | 0.749 [0.716 ; 0.779] |
| nasem | classe IMC | 38 | 660 | 46.5 | 122 | 0.738 [0.703 ; 0.770] |
| nasem | classe IMC | case_S | 120 | -89.6 | 227 | 0.517 [0.428 ; 0.604] |
| nasem | activité | strength | 1644 | 64.2 | 122 | 0.714 [0.692 ; 0.735] |
| nasem | activité | sedentary | 1356 | 76.3 | 115 | 0.727 [0.703 ; 0.750] |
| nasem | objectif | loss | 1152 | 47.7 | 120 | 0.713 [0.686 ; 0.738] |
| nasem | objectif | gain | 948 | 66.4 | 117 | 0.720 [0.691 ; 0.748] |
| nasem | objectif | maintenance | 900 | 101.3 | 120 | 0.729 [0.699 ; 0.757] |
| nasem | fréquence de pesée | tous les 1 j | 1500 | 58.7 | 102 | 0.720 [0.697 ; 0.742] |
| nasem | fréquence de pesée | tous les 3 j | 1500 | 80.6 | 137 | 0.720 [0.697 ; 0.742] |
| nasem | complétude du journal | 100 % | 3000 | 69.7 | 119 | 0.720 [0.704 ; 0.736] |
| flat | sexe | female | 1644 | 41.8 | 132 | 0.730 [0.708 ; 0.751] |
| flat | sexe | male | 1356 | 57.1 | 115 | 0.793 [0.770 ; 0.814] |
| flat | classe IMC | case_R | 120 | 114.5 | 121 | 0.792 [0.711 ; 0.855] |
| flat | classe IMC | 31 | 648 | 109.1 | 126 | 0.725 [0.690 ; 0.758] |
| flat | classe IMC | 21 | 720 | 24.6 | 109 | 0.799 [0.768 ; 0.826] |
| flat | classe IMC | 26 | 732 | 81.2 | 133 | 0.769 [0.737 ; 0.798] |
| flat | classe IMC | 38 | 660 | -9.5 | 120 | 0.752 [0.717 ; 0.783] |
| flat | classe IMC | case_S | 120 | -77.1 | 189 | 0.633 [0.544 ; 0.714] |
| flat | activité | strength | 1644 | 63.6 | 120 | 0.760 [0.739 ; 0.780] |
| flat | activité | sedentary | 1356 | 30.6 | 128 | 0.756 [0.732 ; 0.778] |
| flat | objectif | loss | 1152 | 57.4 | 139 | 0.709 [0.682 ; 0.735] |
| flat | objectif | gain | 948 | 9.5 | 116 | 0.808 [0.782 ; 0.832] |
| flat | objectif | maintenance | 900 | 78.9 | 115 | 0.769 [0.740 ; 0.795] |
| flat | fréquence de pesée | tous les 1 j | 1500 | 38.1 | 103 | 0.731 [0.708 ; 0.753] |
| flat | fréquence de pesée | tous les 3 j | 1500 | 59.3 | 149 | 0.786 [0.765 ; 0.806] |
| flat | complétude du journal | 100 % | 3000 | 48.7 | 124 | 0.758 [0.743 ; 0.773] |

## N4 : attribution du biais en unités de saisie (diagnostic, non bloquant), passe 2 (2n, règle de doublement)

n = 500 par population × horizon (mêmes utilisateurs pour les trois priors et les quatre populations). Graines : profils 400 000, utilisateurs 410 000 + i. Biais = moyenne de (médiane − vérité en unités de saisie), IC bootstrap.

| Population | Horizon | Prior | n | Biais signé [IC] | Erreur médiane [IC] | Couv. 80 [Wilson] | Couv. 95 | Largeur 80 (méd.) | Attribution (prior plat, |biais| ≤ 15) |
|---|---|---|---|---|---|---|---|---|---|
| P00 | 14 | flat | 500 | 71.6 [41.6 ; 101.1] | 225 [205 ; 242] | 0.792 [0.754 ; 0.825] | 0.952 [0.930 ; 0.968] | 844 | non attribué au prior |
| P00 | 14 | nasem | 500 | 14.6 [-5.3 ; 35.5] | 161 [144 ; 173] | 0.798 [0.761 ; 0.831] | 0.958 [0.937 ; 0.972] | 594 |  |
| P00 | 14 | widened | 500 | 24.4 [2.2 ; 45.1] | 167 [149 ; 185] | 0.838 [0.803 ; 0.868] | 0.976 [0.959 ; 0.986] | 677 |  |
| P00 | 28 | flat | 500 | 19.3 [1.3 ; 36.8] | 118 [104 ; 138] | 0.760 [0.721 ; 0.795] | 0.950 [0.927 ; 0.966] | 433 | INCONCLUSIF |
| P00 | 28 | nasem | 500 | 5.7 [-8.7 ; 19.8] | 102 [93 ; 112] | 0.790 [0.752 ; 0.823] | 0.954 [0.932 ; 0.969] | 390 |  |
| P00 | 28 | widened | 500 | 9.8 [-5.0 ; 25.5] | 102 [92 ; 112] | 0.786 [0.748 ; 0.820] | 0.954 [0.932 ; 0.969] | 404 |  |
| P00 | 42 | flat | 500 | 3.0 [-7.8 ; 14.5] | 70 [63 ; 78] | 0.822 [0.786 ; 0.853] | 0.948 [0.925 ; 0.964] | 280 | attribué au prior |
| P00 | 42 | nasem | 500 | -1.0 [-10.8 ; 8.3] | 65 [60 ; 75] | 0.830 [0.795 ; 0.860] | 0.950 [0.927 ; 0.966] | 272 |  |
| P00 | 42 | widened | 500 | 0.4 [-10.0 ; 10.6] | 68 [63 ; 76] | 0.832 [0.797 ; 0.862] | 0.948 [0.925 ; 0.964] | 275 |  |
| P05 | 14 | flat | 500 | 85.3 [56.1 ; 115.7] | 224 [199 ; 240] | 0.776 [0.737 ; 0.810] | 0.940 [0.916 ; 0.958] | 833 | non attribué au prior |
| P05 | 14 | nasem | 500 | 77.7 [53.8 ; 102.3] | 186 [166 ; 199] | 0.724 [0.683 ; 0.761] | 0.902 [0.873 ; 0.925] | 594 |  |
| P05 | 14 | widened | 500 | 73.3 [49.0 ; 96.0] | 182 [165 ; 195] | 0.780 [0.742 ; 0.814] | 0.932 [0.906 ; 0.951] | 676 |  |
| P05 | 28 | flat | 500 | 22.2 [5.0 ; 38.5] | 116 [102 ; 135] | 0.758 [0.719 ; 0.793] | 0.938 [0.913 ; 0.956] | 421 | INCONCLUSIF |
| P05 | 28 | nasem | 500 | 32.4 [16.4 ; 47.2] | 111 [100 ; 122] | 0.762 [0.723 ; 0.797] | 0.916 [0.888 ; 0.937] | 389 |  |
| P05 | 28 | widened | 500 | 28.0 [12.6 ; 43.0] | 108 [100 ; 117] | 0.774 [0.735 ; 0.808] | 0.934 [0.909 ; 0.953] | 402 |  |
| P05 | 42 | flat | 500 | 3.9 [-7.0 ; 14.9] | 70 [64 ; 77] | 0.816 [0.780 ; 0.848] | 0.938 [0.913 ; 0.956] | 279 | attribué au prior |
| P05 | 42 | nasem | 500 | 11.2 [0.5 ; 21.5] | 71 [63 ; 77] | 0.822 [0.786 ; 0.853] | 0.940 [0.916 ; 0.958] | 270 |  |
| P05 | 42 | widened | 500 | 8.3 [-2.6 ; 18.5] | 72 [63 ; 76] | 0.812 [0.775 ; 0.844] | 0.938 [0.913 ; 0.956] | 273 |  |
| P10 | 14 | flat | 500 | 101.8 [73.1 ; 131.6] | 220 [199 ; 242] | 0.776 [0.737 ; 0.810] | 0.936 [0.911 ; 0.954] | 816 | non attribué au prior |
| P10 | 14 | nasem | 500 | 147.1 [123.8 ; 170.9] | 200 [183 ; 226] | 0.672 [0.630 ; 0.712] | 0.866 [0.833 ; 0.893] | 597 |  |
| P10 | 14 | widened | 500 | 127.3 [102.5 ; 151.6] | 201 [187 ; 225] | 0.740 [0.700 ; 0.777] | 0.914 [0.886 ; 0.936] | 681 |  |
| P10 | 28 | flat | 500 | 26.9 [10.1 ; 44.6] | 115 [99 ; 128] | 0.760 [0.721 ; 0.795] | 0.938 [0.913 ; 0.956] | 416 | INCONCLUSIF |
| P10 | 28 | nasem | 500 | 62.9 [47.4 ; 77.9] | 114 [99 ; 126] | 0.724 [0.683 ; 0.761] | 0.904 [0.875 ; 0.927] | 388 |  |
| P10 | 28 | widened | 500 | 49.1 [33.3 ; 64.3] | 114 [96 ; 124] | 0.768 [0.729 ; 0.803] | 0.922 [0.895 ; 0.942] | 400 |  |
| P10 | 42 | flat | 500 | 6.6 [-4.7 ; 17.6] | 69 [63 ; 74] | 0.814 [0.778 ; 0.846] | 0.938 [0.913 ; 0.956] | 276 | INCONCLUSIF |
| P10 | 42 | nasem | 500 | 25.9 [15.6 ; 36.9] | 74 [67 ; 81] | 0.810 [0.773 ; 0.842] | 0.936 [0.911 ; 0.954] | 268 |  |
| P10 | 42 | widened | 500 | 18.3 [7.6 ; 29.3] | 69 [64 ; 77] | 0.830 [0.795 ; 0.860] | 0.934 [0.909 ; 0.953] | 272 |  |
| P20 | 14 | flat | 500 | 137.6 [108.7 ; 167.8] | 222 [195 ; 252] | 0.744 [0.704 ; 0.780] | 0.890 [0.860 ; 0.915] | 787 | non attribué au prior |
| P20 | 14 | nasem | 500 | 287.2 [261.2 ; 314.1] | 295 [264 ; 321] | 0.522 [0.478 ; 0.565] | 0.728 [0.687 ; 0.765] | 605 |  |
| P20 | 14 | widened | 500 | 236.3 [211.9 ; 261.3] | 257 [240 ; 279] | 0.604 [0.560 ; 0.646] | 0.824 [0.788 ; 0.855] | 687 |  |
| P20 | 28 | flat | 500 | 42.2 [25.6 ; 59.9] | 112 [99 ; 132] | 0.744 [0.704 ; 0.780] | 0.896 [0.866 ; 0.920] | 401 | non attribué au prior |
| P20 | 28 | nasem | 500 | 125.6 [108.9 ; 143.2] | 136 [125 ; 152] | 0.648 [0.605 ; 0.689] | 0.818 [0.782 ; 0.849] | 384 |  |
| P20 | 28 | widened | 500 | 93.9 [77.6 ; 111.2] | 122 [109 ; 137] | 0.700 [0.658 ; 0.739] | 0.866 [0.833 ; 0.893] | 390 |  |
| P20 | 42 | flat | 500 | 16.8 [4.5 ; 29.6] | 70 [61 ; 79] | 0.794 [0.756 ; 0.827] | 0.904 [0.875 ; 0.927] | 268 | INCONCLUSIF |
| P20 | 42 | nasem | 500 | 57.6 [45.6 ; 70.3] | 78 [69 ; 87] | 0.740 [0.700 ; 0.777] | 0.894 [0.864 ; 0.918] | 263 |  |
| P20 | 42 | widened | 500 | 41.5 [29.6 ; 54.2] | 78 [68 ; 85] | 0.790 [0.752 ; 0.823] | 0.906 [0.877 ; 0.929] | 266 |  |

### Coût du prior élargi pour P00 (élargi − NASEM, apparié)

| Horizon | Δ largeur 80 médiane [IC] | Δ erreur médiane [IC] |
|---|---|---|
| 14 | 83 [70 ; 94] | 6.0 [-5.0 ; 17.4] |
| 28 | 14 [10 ; 21] | -0.1 [-6.0 ; 6.4] |

### Stratification (toutes populations et horizons confondus)

| Prior | Strate | Niveau | n | Biais signé | Erreur médiane | Couv. 80 |
|---|---|---|---|---|---|---|
| nasem | sexe | female | 3288 | 56.6 | 107 | 0.746 [0.731 ; 0.761] |
| nasem | sexe | male | 2712 | 87.5 | 122 | 0.725 [0.708 ; 0.742] |
| nasem | classe IMC | case_R | 240 | 17.4 | 100 | 0.792 [0.736 ; 0.838] |
| nasem | classe IMC | 21 | 1416 | 55.9 | 98 | 0.792 [0.770 ; 0.812] |
| nasem | classe IMC | 38 | 1404 | 108.6 | 127 | 0.682 [0.658 ; 0.706] |
| nasem | classe IMC | 26 | 1356 | 75.4 | 113 | 0.747 [0.723 ; 0.769] |
| nasem | classe IMC | 31 | 1344 | 61.6 | 122 | 0.732 [0.708 ; 0.755] |
| nasem | classe IMC | case_S | 240 | 11.5 | 133 | 0.646 [0.583 ; 0.704] |
| nasem | activité | strength | 3276 | 65.9 | 113 | 0.748 [0.733 ; 0.763] |
| nasem | activité | sedentary | 2724 | 76.2 | 116 | 0.723 [0.706 ; 0.740] |
| nasem | objectif | loss | 2292 | 65.7 | 114 | 0.735 [0.717 ; 0.753] |
| nasem | objectif | maintenance | 1812 | 70.1 | 110 | 0.744 [0.724 ; 0.764] |
| nasem | objectif | gain | 1896 | 77.0 | 120 | 0.732 [0.711 ; 0.751] |
| nasem | fréquence de pesée | tous les 1 j | 3000 | 53.7 | 91 | 0.760 [0.744 ; 0.775] |
| nasem | fréquence de pesée | tous les 3 j | 3000 | 87.5 | 139 | 0.714 [0.698 ; 0.730] |
| nasem | complétude du journal | 100 % | 6000 | 70.6 | 115 | 0.737 [0.726 ; 0.748] |
| flat | sexe | female | 3288 | 34.4 | 114 | 0.780 [0.766 ; 0.794] |
| flat | sexe | male | 2712 | 57.3 | 123 | 0.779 [0.763 ; 0.794] |
| flat | classe IMC | case_R | 240 | 83.5 | 126 | 0.796 [0.740 ; 0.842] |
| flat | classe IMC | 21 | 1416 | 23.7 | 97 | 0.793 [0.771 ; 0.813] |
| flat | classe IMC | 38 | 1404 | 72.4 | 132 | 0.758 [0.735 ; 0.780] |
| flat | classe IMC | 26 | 1356 | 46.4 | 122 | 0.793 [0.770 ; 0.814] |
| flat | classe IMC | 31 | 1344 | 34.6 | 114 | 0.789 [0.767 ; 0.810] |
| flat | classe IMC | case_S | 240 | 16.0 | 180 | 0.683 [0.622 ; 0.739] |
| flat | activité | strength | 3276 | 39.3 | 119 | 0.790 [0.775 ; 0.803] |
| flat | activité | sedentary | 2724 | 51.4 | 119 | 0.768 [0.751 ; 0.783] |
| flat | objectif | loss | 2292 | 53.2 | 125 | 0.760 [0.742 ; 0.777] |
| flat | objectif | maintenance | 1812 | 37.8 | 108 | 0.795 [0.776 ; 0.813] |
| flat | objectif | gain | 1896 | 41.3 | 119 | 0.789 [0.770 ; 0.806] |
| flat | fréquence de pesée | tous les 1 j | 3000 | 32.1 | 94 | 0.779 [0.763 ; 0.793] |
| flat | fréquence de pesée | tous les 3 j | 3000 | 57.4 | 148 | 0.781 [0.766 ; 0.795] |
| flat | complétude du journal | 100 % | 6000 | 44.8 | 119 | 0.780 [0.769 ; 0.790] |

