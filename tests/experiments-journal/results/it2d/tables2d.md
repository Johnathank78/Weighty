# Itération 2d : J* contre « cible choisie », tableaux et verdicts (reconstruits depuis les bruts)

Script : tests/experiments-journal/it2d/tables2d.experiment.ts. Ratios sur la masse tissulaire (A4.1), blocs à changement d’objectif exclus (A5.4, A6.5). Seuils : THRESHOLDS.md, amendement 7.

## 2. Contrôle 6.1 : repli (densité 0,90 et 0,75)

Basculés : 235 (0.9 : 122 basculés, 6 avec un plan J* ; 0.75 : 113 basculés, 0 avec un plan J*). Sans plan J* : 229, identiques au bras C sur les 168 jours : 229. Avec un plan J* malgré la densité : 6, identiques jusqu'à la veille : 6. Différences : 0.

**Contrôle 6.1 : PASSE.**

## 3. V1 : P00, R0, R15, R30 (v1)

Non-suiveurs : 7500 ; basculés (proposition acceptée) : 6058 ; sans proposition : 1442. Basculés avec un plan J* : 6020 (99,37 %), jour médian du premier plan J* 28, délai médian depuis la bascule 14 j. Contrôle continu (5.4) : 0 différence(s) sur 6058 utilisateurs.

**Basculés par comportement et objectif**

| Comportement | Objectif | Non-suiveurs | Basculés |
|---|---|---|---|
| R0 | perte | 1123 | 884 |
| R0 | maintien | 456 | 371 |
| R0 | prise | 921 | 732 |
| R15 | perte | 1124 | 908 |
| R15 | maintien | 458 | 366 |
| R15 | prise | 918 | 753 |
| R30 | perte | 1119 | 924 |
| R30 | maintien | 469 | 385 |
| R30 | prise | 912 | 735 |

**Basculés sans plan J* : critère de porte manquant à la dernière évaluation du repli**

| Critère(s) manquant(s) | Utilisateurs |
|---|---|
| (porte ouverte, plan en échec) | 38 |

**NI (J* − C), V1 P00 : GO**

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| NI R0 perte, sem. 5-12 | C 0,163 → J* 0,136 ; Δ -0,028 [-0,038 ; -0,012] (n = 853) ; J* meilleur | GO |
| NI R0 perte, sem. 13-24 | C 0,073 → J* 0,072 ; Δ -0,001 [-0,006 ; 0,003] (n = 794) | GO |
| NI R0 prise, sem. 5-12 | C 0,347 → J* 0,295 ; Δ -0,052 [-0,076 ; -0,025] (n = 732) ; J* meilleur | GO |
| NI R0 prise, sem. 13-24 | C 0,167 → J* 0,165 ; Δ -0,001 [-0,012 ; 0,007] (n = 732) | GO |
| NI R15 perte, sem. 5-12 | C 0,164 → J* 0,146 ; Δ -0,018 [-0,028 ; -0,007] (n = 895) ; J* meilleur | GO |
| NI R15 perte, sem. 13-24 | C 0,094 → J* 0,083 ; Δ -0,010 [-0,016 ; -0,005] (n = 844) ; J* meilleur | GO |
| NI R15 prise, sem. 5-12 | C 0,383 → J* 0,314 ; Δ -0,069 [-0,094 ; -0,044] (n = 753) ; J* meilleur | GO |
| NI R15 prise, sem. 13-24 | C 0,212 → J* 0,211 ; Δ -0,001 [-0,016 ; 0,010] (n = 753) | GO |
| NI R30 perte, sem. 5-12 | C 0,174 → J* 0,161 ; Δ -0,013 [-0,024 ; -0,001] (n = 910) ; J* meilleur | GO |
| NI R30 perte, sem. 13-24 | C 0,110 → J* 0,103 ; Δ -0,007 [-0,013 ; -0,002] (n = 849) ; J* meilleur | GO |
| NI R30 prise, sem. 5-12 | C 0,415 → J* 0,335 ; Δ -0,081 [-0,107 ; -0,046] (n = 735) ; J* meilleur | GO |
| NI R30 prise, sem. 13-24 | C 0,232 → J* 0,231 ; Δ -0,001 [-0,014 ; 0,013] (n = 735) | GO |

**Sécurité de J* (période après le premier plan J*), V1 P00 : GO**

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| S3-P [S] J* R0 | 0 violation(s) sur 39468 évaluations (1979 utilisateurs) ; exemptées : 0 | GO |
| S3-D [S] J* R0 | 233 / 9847 utilisateurs-blocs = 2,37 % [2,01 % ; 2,75 %] (1979 utilisateurs) | GO |
| S4-P [S] J* R0 | 0 jour(s) (1979 utilisateurs) | GO |
| S4-J [S] J* R0 | 3 / 1979 = 0,15 % [0,05 % ; 0,44 %] ; marge minimale -42,5 kcal/j, P1 22,0 | GO |
| S3-P [S] J* R15 | 0 violation(s) sur 40124 évaluations (2017 utilisateurs) ; exemptées : 0 | GO |
| S3-D [S] J* R15 | 299 / 10000 utilisateurs-blocs = 2,99 % [2,57 % ; 3,41 %] (2015 utilisateurs) | GO |
| S4-P [S] J* R15 | 0 jour(s) (2017 utilisateurs) | GO |
| S4-J [S] J* R15 | 5 / 2017 = 0,25 % [0,11 % ; 0,58 %] ; marge minimale -58,7 kcal/j, P1 38,6 | GO |
| S3-P [S] J* R30 | 0 violation(s) sur 40254 évaluations (2024 utilisateurs) ; exemptées : 0 | GO |
| S3-D [S] J* R30 | 325 / 10029 utilisateurs-blocs = 3,24 % [2,81 % ; 3,68 %] (2023 utilisateurs) | GO |
| S4-P [S] J* R30 | 0 jour(s) (2024 utilisateurs) | GO |
| S4-J [S] J* R30 | 1 / 2024 = 0,05 % [0,01 % ; 0,28 %] ; marge minimale -17,3 kcal/j, P1 61,2 | GO |

**S1 de J*, V1 P00 : GO**

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| S1 J* (R0 à R30) perte, sem. 5-12 | 1,015 [1,009 ; 1,021] (n = 2660 ; P10 / P90 0,656 / 1,370) | GO |
| S1 J* (R0 à R30) perte, sem. 13-24 | 1,012 [1,008 ; 1,016] (n = 2519 ; P10 / P90 0,811 / 1,201) | GO |
| S1 J* (R0 à R30) prise, sem. 5-12 | 1,041 [1,025 ; 1,061] (n = 2220 ; P10 / P90 0,393 / 1,709) | GO |
| S1 J* (R0 à R30) prise, sem. 13-24 | 1,038 [1,026 ; 1,046] (n = 2220 ; P10 / P90 0,647 / 1,438) | GO |

**V1 P00 : GO.**

**J* (A7.6), basculés avec un plan J***

| Comportement | Utilisateurs | h brut au premier plan : P5 / P25 / médiane / P75 / P95 | Borne basse / haute atteinte : utilisateurs (constructions) | Erreur de h, tous plans : médiane [P10 ; P90] | Écart de M à la vérité (unités de saisie), premier plan : médiane [P10 ; P90] | Variation hebdomadaire de M / h (kcal/j) : médiane [P10 ; P90] | Recalibrations / recalculs, médianes ; garde-fous J* | Échecs de construction ; constructions à plancher actif |
|---|---|---|---|---|---|---|---|---|
| R0 | 1979 | 0,951 / 0,981 / 1,000 / 1,020 / 1,049 | 0 / 0 (0 / 0) | -0,000 [-0,059 ; 0,058] (23520 plans) | -1,5 [-326,7 ; 348,2] ; |écart| moyen médian 66,4 | 44,6 [30,8 ; 62,0] | 11,0 / 0,0 ; G1 111, G2 203 | 321 ; plancher actif 3038 |
| R15 | 2017 | 0,973 / 1,010 / 1,037 / 1,062 / 1,100 | 0 / 0 (0 / 0) | 0,000 [-0,078 ; 0,076] (24963 plans) | -3,5 [-335,5 ; 359,6] ; |écart| moyen médian 65,5 | 48,1 [34,1 ; 67,5] | 12,0 / 0,0 ; G1 114, G2 224 | 609 ; plancher actif 3672 |
| R30 | 2024 | 1,004 / 1,043 / 1,076 / 1,105 / 1,148 | 0 / 2 (0 / 2) | 0,001 [-0,090 ; 0,086] (25398 plans) | 0,6 [-331,4 ; 342,2] ; |écart| moyen médian 64,4 | 49,2 [34,5 ; 68,9] | 12,0 / 0,0 ; G1 117, G2 198 | 724 ; plancher actif 3745 |
| tous | 6020 | 0,965 / 1,001 / 1,033 / 1,070 / 1,126 | 0 / 2 (0 / 2) | 0,000 [-0,076 ; 0,074] (73881 plans) | -1,1 [-330,8 ; 351,1] ; |écart| moyen médian 65,6 | 47,4 [32,9 ; 66,6] | 12,0 / 0,0 ; G1 342, G2 625 | 1654 ; plancher actif 10455 |

**Échecs de construction J* par raison (plan laissé en place)**

| Type : raison | Constructions |
|---|---|
| recal_jstar:no_feasible_speed | 1341 |
| recal_jstar:target_not_above_current | 141 |
| replan_periodic_jstar:no_feasible_speed | 116 |
| replan_periodic_jstar:target_not_above_current | 56 |

**Bras C, critères (rapportés, sans verdict ; référence : jour de la cible choisie)**

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| S1 C perte, sem. 5-12 | 0,989 [0,981 ; 0,996] (n = 2667 ; P10 / P90 0,557 / 1,338) | rapporté |
| S1 C perte, sem. 13-24 | 0,986 [0,982 ; 0,990] (n = 2538 ; P10 / P90 0,766 / 1,180) | rapporté |
| S1 C prise, sem. 5-12 | 1,165 [1,142 ; 1,188] (n = 2220 ; P10 / P90 0,476 / 1,936) | rapporté |
| S1 C prise, sem. 13-24 | 1,007 [0,996 ; 1,019] (n = 2220 ; P10 / P90 0,614 / 1,412) | rapporté |
| S3-P [S] C R0 | 0 violation(s) sur 41558 évaluations (1987 utilisateurs) ; exemptées : 2156 | rapporté |
| S3-D [S] C R0 | 261 / 9935 utilisateurs-blocs = 2,63 % [2,27 % ; 3,01 %] (1987 utilisateurs) | rapporté |
| S4-P [S] C R0 | 0 jour(s) (1987 utilisateurs) | rapporté |
| S4-J [S] C R0 | 7 / 1987 = 0,35 % [0,17 % ; 0,73 %] ; marge minimale -48,7 kcal/j, P1 16,0 | rapporté |
| S3-P [S] C R15 | 0 violation(s) sur 42459 évaluations (2027 utilisateurs) ; exemptées : 2135 | rapporté |
| S3-D [S] C R15 | 296 / 10135 utilisateurs-blocs = 2,92 % [2,51 % ; 3,38 %] (2027 utilisateurs) | rapporté |
| S4-P [S] C R15 | 0 jour(s) (2027 utilisateurs) | rapporté |
| S4-J [S] C R15 | 5 / 2027 = 0,25 % [0,11 % ; 0,58 %] ; marge minimale -24,9 kcal/j, P1 43,1 | rapporté |
| S3-P [S] C R30 | 0 violation(s) sur 42691 évaluations (2044 utilisateurs) ; exemptées : 2277 | rapporté |
| S3-D [S] C R30 | 321 / 10220 utilisateurs-blocs = 3,14 % [2,73 % ; 3,57 %] (2044 utilisateurs) | rapporté |
| S4-P [S] C R30 | 0 jour(s) (2044 utilisateurs) | rapporté |
| S4-J [S] C R30 | 1 / 2044 = 0,05 % [0,01 % ; 0,28 %] ; marge minimale -13,1 kcal/j, P1 61,2 | rapporté |
| S3-P [S] C tous | 0 violation(s) sur 126708 évaluations (6058 utilisateurs) ; exemptées : 6568 | rapporté |
| S3-D [S] C tous | 878 / 30290 utilisateurs-blocs = 2,90 % [2,66 % ; 3,14 %] (6058 utilisateurs) | rapporté |
| S4-P [S] C tous | 0 jour(s) (6058 utilisateurs) | rapporté |
| S4-J [S] C tous | 13 / 6058 = 0,21 % [0,13 % ; 0,37 %] ; marge minimale -48,7 kcal/j, P1 28,6 | rapporté |

T_c remplacées par le plancher × 1,10 : 961 / 6058.

**S2 (rapporté), basculés**

| Bras | Objectif | Fenêtre | Blocs | Médiane | P90 | P90 / médiane | P90 − médiane |
|---|---|---|---|---|---|---|---|
| C | perte | sem. 5-12 | 5288 | 0,989 | 1,338 | 1,352 | 0,348 |
| C | perte | sem. 13-24 | 7347 | 0,986 | 1,180 | 1,197 | 0,194 |
| C | prise | sem. 5-12 | 4440 | 1,165 | 1,936 | 1,662 | 0,771 |
| C | prise | sem. 13-24 | 6660 | 1,007 | 1,412 | 1,402 | 0,405 |
| JS | perte | sem. 5-12 | 5254 | 1,015 | 1,370 | 1,351 | 0,356 |
| JS | perte | sem. 13-24 | 7300 | 1,012 | 1,201 | 1,186 | 0,189 |
| JS | prise | sem. 5-12 | 4440 | 1,041 | 1,709 | 1,642 | 0,668 |
| JS | prise | sem. 13-24 | 6660 | 1,038 | 1,438 | 1,385 | 0,400 |

**S7 (rapporté) : maintien dans la zone à 8 semaines, tous les non-suiveurs en maintien**

| Bras | Dans la zone (cible) | Centrée sur le poids vrai de départ |
|---|---|---|
| C | 519 / 1383 = 37,53 % [35,01 % ; 40,11 %] | 508 / 1383 |
| JS | 506 / 1383 = 36,59 % [34,09 % ; 39,16 %] | 554 / 1383 |

**Garde-fous et IMC vrai, basculés**

| Bras | n | G1 : utilisateurs (événements) | G2 : utilisateurs (événements) | Événements (J* : chemin J* ; C : tous) | Échecs | Fins sous IMC 20 vrai | IMC vrai minimal : min ; P1 ; P5 |
|---|---|---|---|---|---|---|---|
| C | 6058 | 354 (354) | 682 (705) | G1 354, G2 705 | 0 | 196 = 3,24 % [2,82 % ; 3,71 %] | 18,644 ; P1 19,672 ; P5 19,905 |
| JS | 6058 | 367 (367) | 665 (698) | G1 342, G2 625 | 0 | 247 = 4,08 % [3,61 % ; 4,61 %] | 18,644 ; P1 19,630 ; P5 19,885 |

Blocs exclus (changement d'objectif) : C 249, J* 259.

**Stratification de Δ (J* − C), perte et prise ensemble, basculés**

| Variable | Valeur | Utilisateurs | Δ sem. 5-12 [IC 95 %] | Δ sem. 13-24 [IC 95 %] |
|---|---|---|---|---|
| sexe | female | 2719 | -0,028 [-0,038 ; -0,018] (n = 2689) | -0,005 [-0,010 ; -0,002] (n = 2588) |
| sexe | male | 2217 | -0,038 [-0,051 ; -0,027] (n = 2189) | -0,001 [-0,006 ; 0,004] (n = 2119) |
| classe d’IMC | 21 | 1110 | -0,061 [-0,090 ; -0,031] (n = 1052) | 0,006 [-0,009 ; 0,019] (n = 881) |
| classe d’IMC | 26 | 1104 | -0,036 [-0,053 ; -0,019] (n = 1104) | -0,003 [-0,010 ; 0,006] (n = 1104) |
| classe d’IMC | 31 | 1103 | -0,032 [-0,042 ; -0,017] (n = 1103) | -0,005 [-0,011 ; 0,001] (n = 1103) |
| classe d’IMC | 38 | 1134 | -0,026 [-0,037 ; -0,013] (n = 1134) | -0,003 [-0,008 ; 0,001] (n = 1134) |
| classe d’IMC | case_R | 246 | -0,013 [-0,026 ; 0,004] (n = 246) | -0,018 [-0,029 ; -0,006] (n = 246) |
| classe d’IMC | case_S | 239 | -0,019 [-0,038 ; -0,003] (n = 239) | -0,004 [-0,017 ; 0,008] (n = 239) |
| activité | sedentary | 2259 | -0,038 [-0,049 ; -0,026] (n = 2230) | -0,003 [-0,008 ; 0,003] (n = 2145) |
| activité | strength | 2677 | -0,030 [-0,038 ; -0,020] (n = 2648) | -0,004 [-0,008 ; 0,000] (n = 2562) |
| objectif | gain | 2220 | -0,063 [-0,080 ; -0,048] (n = 2220) | -0,002 [-0,009 ; 0,004] (n = 2220) |
| objectif | loss | 2716 | -0,019 [-0,026 ; -0,012] (n = 2658) | -0,006 [-0,009 ; -0,003] (n = 2487) |
| vitesse demandée | 0.0025 | 2759 | -0,055 [-0,071 ; -0,042] (n = 2701) | -0,003 [-0,009 ; 0,004] (n = 2530) |
| vitesse demandée | 0.005 | 835 | -0,009 [-0,021 ; 0,000] (n = 835) | -0,008 [-0,012 ; -0,003] (n = 835) |
| vitesse demandée | 0.01 | 1342 | -0,017 [-0,024 ; -0,010] (n = 1342) | -0,005 [-0,010 ; -0,002] (n = 1342) |
| décalage s | -150 | 987 | -0,027 [-0,044 ; -0,011] (n = 977) | -0,005 [-0,012 ; 0,001] (n = 932) |
| décalage s | -270 | 999 | -0,040 [-0,055 ; -0,025] (n = 985) | -0,007 [-0,014 ; -0,000] (n = 951) |
| décalage s | -400 | 956 | -0,046 [-0,065 ; -0,030] (n = 930) | -0,009 [-0,017 ; -0,001] (n = 890) |
| décalage s | 150 | 1007 | -0,022 [-0,041 ; -0,008] (n = 1000) | -0,001 [-0,008 ; 0,006] (n = 969) |
| décalage s | 270 | 987 | -0,023 [-0,043 ; -0,003] (n = 986) | 0,002 [-0,006 ; 0,010] (n = 965) |
| part déclarée | 0.8 | 917 | -0,032 [-0,048 ; -0,017] (n = 905) | -0,009 [-0,017 ; -0,001] (n = 877) |
| part déclarée | 0.95 | 1981 | -0,033 [-0,046 ; -0,022] (n = 1951) | -0,001 [-0,006 ; 0,004] (n = 1890) |
| part déclarée | 1 | 2038 | -0,031 [-0,044 ; -0,021] (n = 2022) | -0,004 [-0,009 ; 0,001] (n = 1940) |
| comportement | R0 | 1616 | -0,034 [-0,049 ; -0,022] (n = 1585) | 0,002 [-0,004 ; 0,007] (n = 1526) |
| comportement | R15 | 1661 | -0,031 [-0,044 ; -0,020] (n = 1648) | -0,009 [-0,015 ; -0,003] (n = 1597) |
| comportement | R30 | 1659 | -0,034 [-0,045 ; -0,020] (n = 1645) | -0,003 [-0,010 ; 0,003] (n = 1584) |
| population | P00 | 4936 | -0,032 [-0,040 ; -0,025] (n = 4878) | -0,004 [-0,007 ; -0,001] (n = 4707) |
| quartile de h au premier plan J* (1,001 / 1,033 / 1,071) | Q1 | 1226 | -0,030 [-0,046 ; -0,014] (n = 1206) | -0,002 [-0,008 ; 0,004] (n = 1163) |
| quartile de h au premier plan J* (1,001 / 1,033 / 1,071) | Q2 | 1225 | -0,045 [-0,062 ; -0,030] (n = 1212) | -0,006 [-0,013 ; 0,001] (n = 1171) |
| quartile de h au premier plan J* (1,001 / 1,033 / 1,071) | Q3 | 1225 | -0,024 [-0,042 ; -0,010] (n = 1213) | -0,005 [-0,013 ; 0,002] (n = 1174) |
| quartile de h au premier plan J* (1,001 / 1,033 / 1,071) | Q4 | 1225 | -0,030 [-0,043 ; -0,014] (n = 1212) | -0,003 [-0,011 ; 0,004] (n = 1164) |
| quartile de h au premier plan J* (1,001 / 1,033 / 1,071) | sans plan J* | 35 | 0,000 [0,000 ; 0,000] (n = 35) | 0,000 [0,000 ; 0,000] (n = 35) |

Cellules où J* fait mieux que C (borne haute < 0) : NI R0 perte, sem. 5-12 ; NI R0 prise, sem. 5-12 ; NI R15 perte, sem. 5-12 ; NI R15 perte, sem. 13-24 ; NI R15 prise, sem. 5-12 ; NI R30 perte, sem. 5-12 ; NI R30 perte, sem. 13-24 ; NI R30 prise, sem. 5-12.

**Étape V1 (v1) : GO.**

## 4. V2 : P00, H1, H2a, H2b, H3 (v2)

Non-suiveurs : 10000 ; basculés (proposition acceptée) : 8057 ; sans proposition : 1943. Basculés avec un plan J* : 7998 (99,27 %), jour médian du premier plan J* 28, délai médian depuis la bascule 14 j. Contrôle continu (5.4) : 0 différence(s) sur 8057 utilisateurs.

**Basculés par comportement et objectif**

| Comportement | Objectif | Non-suiveurs | Basculés |
|---|---|---|---|
| H1 | perte | 1109 | 898 |
| H1 | maintien | 457 | 356 |
| H1 | prise | 934 | 772 |
| H2a | perte | 1058 | 845 |
| H2a | maintien | 493 | 393 |
| H2a | prise | 949 | 757 |
| H2b | perte | 1115 | 893 |
| H2b | maintien | 476 | 381 |
| H2b | prise | 909 | 733 |
| H3 | perte | 1172 | 944 |
| H3 | maintien | 434 | 352 |
| H3 | prise | 894 | 733 |

**Basculés sans plan J* : critère de porte manquant à la dernière évaluation du repli**

| Critère(s) manquant(s) | Utilisateurs |
|---|---|
| (porte ouverte, plan en échec) | 59 |

**NI (J* − C), V2 P00 : GO**

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| NI H1 perte, sem. 5-12 | C 0,171 → J* 0,156 ; Δ -0,015 [-0,027 ; -0,001] (n = 872) ; J* meilleur | GO |
| NI H1 perte, sem. 13-24 | C 0,105 → J* 0,098 ; Δ -0,008 [-0,015 ; -0,002] (n = 830) ; J* meilleur | GO |
| NI H1 prise, sem. 5-12 | C 0,417 → J* 0,332 ; Δ -0,085 [-0,116 ; -0,057] (n = 772) ; J* meilleur | GO |
| NI H1 prise, sem. 13-24 | C 0,233 → J* 0,222 ; Δ -0,012 [-0,026 ; 0,001] (n = 772) | GO |
| NI H2a perte, sem. 13-24 | C 0,188 → J* 0,112 ; Δ -0,076 [-0,085 ; -0,065] (n = 765) ; J* meilleur | GO |
| NI H2a prise, sem. 13-24 | C 0,509 → J* 0,304 ; Δ -0,205 [-0,220 ; -0,184] (n = 757) ; J* meilleur | GO |
| NI H2b perte, sem. 13-24 | C 0,149 → J* 0,093 ; Δ -0,055 [-0,063 ; -0,047] (n = 805) ; J* meilleur | GO |
| NI H2b prise, sem. 13-24 | C 0,424 → J* 0,219 ; Δ -0,205 [-0,222 ; -0,187] (n = 733) ; J* meilleur | GO |
| NI H3 perte, sem. 5-12 | C 0,184 → J* 0,171 ; Δ -0,013 [-0,025 ; 0,001] (n = 925) | GO |
| NI H3 perte, sem. 13-24 | C 0,113 → J* 0,105 ; Δ -0,008 [-0,014 ; -0,002] (n = 869) ; J* meilleur | GO |
| NI H3 prise, sem. 5-12 | C 0,425 → J* 0,356 ; Δ -0,069 [-0,097 ; -0,042] (n = 733) ; J* meilleur | GO |
| NI H3 prise, sem. 13-24 | C 0,242 → J* 0,233 ; Δ -0,009 [-0,021 ; 0,008] (n = 733) | GO |

**Sécurité de J* (période après le premier plan J*), V2 P00 : GO**

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| S3-P [S] J* H1 | 0 violation(s) sur 40087 évaluations (2012 utilisateurs) ; exemptées : 0 | GO |
| S3-D [S] J* H1 | 280 / 9993 utilisateurs-blocs = 2,80 % [2,40 % ; 3,19 %] (2011 utilisateurs) | GO |
| S4-P [S] J* H1 | 0 jour(s) (2012 utilisateurs) | GO |
| S4-J [S] J* H1 | 1 / 2012 = 0,05 % [0,01 % ; 0,28 %] ; marge minimale -21,4 kcal/j, P1 57,1 | GO |
| S3-P [S] J* H2a | 0 violation(s) sur 39647 évaluations (1985 utilisateurs) ; exemptées : 0 | GO |
| S3-D [S] J* H2a | 261 / 9895 utilisateurs-blocs = 2,64 % [2,25 % ; 3,03 %] (1985 utilisateurs) | GO |
| S4-P [S] J* H2a | 0 jour(s) (1985 utilisateurs) | GO |
| S4-J [S] J* H2a | 7 / 1985 = 0,35 % [0,17 % ; 0,73 %] ; marge minimale -52,4 kcal/j, P1 23,5 | GO |
| S3-P [S] J* H2b | 0 violation(s) sur 39660 évaluations (1996 utilisateurs) ; exemptées : 0 | GO |
| S3-D [S] J* H2b | 403 / 9881 utilisateurs-blocs = 4,08 % [3,62 % ; 4,54 %] (1995 utilisateurs) | GO |
| S4-P [S] J* H2b | 0 jour(s) (1996 utilisateurs) | GO |
| S4-J [S] J* H2b | 6 / 1996 = 0,30 % [0,14 % ; 0,65 %] ; marge minimale -50,0 kcal/j, P1 29,2 | GO |
| S3-P [S] J* H3 | 0 violation(s) sur 39923 évaluations (2005 utilisateurs) ; exemptées : 0 | GO |
| S3-D [S] J* H3 | 338 / 9957 utilisateurs-blocs = 3,39 % [2,97 % ; 3,84 %] (2003 utilisateurs) | GO |
| S4-P [S] J* H3 | 0 jour(s) (2005 utilisateurs) | GO |
| S4-J [S] J* H3 | 1 / 2005 = 0,05 % [0,01 % ; 0,28 %] ; marge minimale -3,3 kcal/j, P1 48,9 | GO |

**V2 P00 : GO.**

**J* (A7.6), basculés avec un plan J***

| Comportement | Utilisateurs | h brut au premier plan : P5 / P25 / médiane / P75 / P95 | Borne basse / haute atteinte : utilisateurs (constructions) | Erreur de h, tous plans : médiane [P10 ; P90] | Écart de M à la vérité (unités de saisie), premier plan : médiane [P10 ; P90] | Variation hebdomadaire de M / h (kcal/j) : médiane [P10 ; P90] | Recalibrations / recalculs, médianes ; garde-fous J* | Échecs de construction ; constructions à plancher actif |
|---|---|---|---|---|---|---|---|---|
| H1 | 2012 | 1,001 / 1,042 / 1,072 / 1,103 / 1,150 | 0 / 2 (0 / 3) | -0,001 [-0,094 ; 0,086] (25224 plans) | -8,3 [-323,5 ; 337,6] ; |écart| moyen médian 63,7 | 49,5 [35,0 ; 68,6] | 12,0 / 0,0 ; G1 114, G2 180 | 829 ; plancher actif 3879 |
| H2a | 1985 | 0,952 / 0,980 / 1,000 / 1,020 / 1,051 | 0 / 0 (0 / 0) | -0,009 [-0,089 ; 0,063] (25594 plans) | -4,1 [-314,5 ; 340,1] ; |écart| moyen médian 65,5 | 51,1 [35,9 ; 71,6] | 13,0 / 0,0 ; G1 115, G2 194 | 575 ; plancher actif 2960 |
| H2b | 1996 | 1,002 / 1,041 / 1,072 / 1,103 / 1,151 | 0 / 0 (0 / 0) | 0,011 [-0,071 ; 0,089] (24852 plans) | 21,8 [-300,6 ; 348,3] ; |écart| moyen médian 64,4 | 48,9 [33,9 ; 68,6] | 12,0 / 0,0 ; G1 120, G2 222 | 564 ; plancher actif 3539 |
| H3 | 2005 | 0,975 / 1,011 / 1,037 / 1,063 / 1,105 | 0 / 0 (0 / 0) | 0,001 [-0,080 ; 0,076] (24640 plans) | -16,1 [-333,0 ; 335,7] ; |écart| moyen médian 67,9 | 48,0 [33,8 ; 66,6] | 12,0 / 0,0 ; G1 115, G2 213 | 681 ; plancher actif 3610 |
| tous | 7998 | 0,970 / 1,010 / 1,043 / 1,081 / 1,135 | 0 / 2 (0 / 3) | 0,000 [-0,084 ; 0,079] (100310 plans) | -2,3 [-317,5 ; 341,2] ; |écart| moyen médian 65,5 | 49,3 [34,6 ; 68,9] | 12,0 / 0,0 ; G1 464, G2 809 | 2649 ; plancher actif 13988 |

**Échecs de construction J* par raison (plan laissé en place)**

| Type : raison | Constructions |
|---|---|
| recal_jstar:no_feasible_speed | 2198 |
| recal_jstar:target_not_above_current | 164 |
| replan_periodic_jstar:no_feasible_speed | 226 |
| replan_periodic_jstar:target_not_above_current | 61 |

**Bras C, critères (rapportés, sans verdict ; référence : jour de la cible choisie)**

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| S3-P [S] C H1 | 0 violation(s) sur 42373 évaluations (2026 utilisateurs) ; exemptées : 2199 | rapporté |
| S3-D [S] C H1 | 305 / 10130 utilisateurs-blocs = 3,01 % [2,60 % ; 3,43 %] (2026 utilisateurs) | rapporté |
| S4-P [S] C H1 | 0 jour(s) (2026 utilisateurs) | rapporté |
| S4-J [S] C H1 | 3 / 2026 = 0,15 % [0,05 % ; 0,43 %] ; marge minimale -31,1 kcal/j, P1 45,2 | rapporté |
| S3-P [S] C H2a | 0 violation(s) sur 41792 évaluations (1995 utilisateurs) ; exemptées : 2098 | rapporté |
| S3-D [S] C H2a | 267 / 9975 utilisateurs-blocs = 2,68 % [2,34 % ; 3,03 %] (1995 utilisateurs) | rapporté |
| S4-P [S] C H2a | 0 jour(s) (1995 utilisateurs) | rapporté |
| S4-J [S] C H2a | 12 / 1995 = 0,60 % [0,34 % ; 1,05 %] ; marge minimale -55,5 kcal/j, P1 13,6 | rapporté |
| S3-P [S] C H2b | 0 violation(s) sur 42035 évaluations (2007 utilisateurs) ; exemptées : 2119 | rapporté |
| S3-D [S] C H2b | 637 / 10035 utilisateurs-blocs = 6,35 % [5,73 % ; 6,98 %] (2007 utilisateurs) | rapporté |
| S4-P [S] C H2b | 0 jour(s) (2007 utilisateurs) | rapporté |
| S4-J [S] C H2b | 3 / 2007 = 0,15 % [0,05 % ; 0,44 %] ; marge minimale -44,9 kcal/j, P1 25,1 | rapporté |
| S3-P [S] C H3 | 0 violation(s) sur 42391 évaluations (2029 utilisateurs) ; exemptées : 2247 | rapporté |
| S3-D [S] C H3 | 363 / 10145 utilisateurs-blocs = 3,58 % [3,13 % ; 4,03 %] (2029 utilisateurs) | rapporté |
| S4-P [S] C H3 | 0 jour(s) (2029 utilisateurs) | rapporté |
| S4-J [S] C H3 | 3 / 2029 = 0,15 % [0,05 % ; 0,43 %] ; marge minimale -12,3 kcal/j, P1 46,7 | rapporté |
| S3-P [S] C tous | 0 violation(s) sur 168591 évaluations (8057 utilisateurs) ; exemptées : 8663 | rapporté |
| S3-D [S] C tous | 1572 / 40285 utilisateurs-blocs = 3,90 % [3,67 % ; 4,15 %] (8057 utilisateurs) | rapporté |
| S4-P [S] C tous | 0 jour(s) (8057 utilisateurs) | rapporté |
| S4-J [S] C tous | 21 / 8057 = 0,26 % [0,17 % ; 0,40 %] ; marge minimale -55,5 kcal/j, P1 29,2 | rapporté |

T_c remplacées par le plancher × 1,10 : 1298 / 8057.

**S2 (rapporté), basculés**

| Bras | Objectif | Fenêtre | Blocs | Médiane | P90 | P90 / médiane | P90 − médiane |
|---|---|---|---|---|---|---|---|
| C | perte | sem. 5-12 | 6933 | 0,971 | 1,355 | 1,395 | 0,384 |
| C | perte | sem. 13-24 | 9665 | 0,980 | 1,247 | 1,273 | 0,267 |
| C | prise | sem. 5-12 | 5990 | 1,177 | 2,020 | 1,716 | 0,843 |
| C | prise | sem. 13-24 | 8985 | 0,990 | 1,690 | 1,706 | 0,699 |
| JS | perte | sem. 5-12 | 6901 | 1,002 | 1,388 | 1,386 | 0,386 |
| JS | perte | sem. 13-24 | 9558 | 1,008 | 1,232 | 1,222 | 0,224 |
| JS | prise | sem. 5-12 | 5990 | 1,031 | 1,732 | 1,681 | 0,701 |
| JS | prise | sem. 13-24 | 8985 | 1,028 | 1,526 | 1,485 | 0,498 |

**S7 (rapporté) : maintien dans la zone à 8 semaines, tous les non-suiveurs en maintien**

| Bras | Dans la zone (cible) | Centrée sur le poids vrai de départ |
|---|---|---|
| C | 663 / 1860 = 35,65 % [33,50 % ; 37,85 %] | 632 / 1860 |
| JS | 644 / 1860 = 34,62 % [32,50 % ; 36,82 %] | 679 / 1860 |

**Garde-fous et IMC vrai, basculés**

| Bras | n | G1 : utilisateurs (événements) | G2 : utilisateurs (événements) | Événements (J* : chemin J* ; C : tous) | Échecs | Fins sous IMC 20 vrai | IMC vrai minimal : min ; P1 ; P5 |
|---|---|---|---|---|---|---|---|
| C | 8057 | 482 (482) | 886 (932) | G1 482, G2 932 | 0 | 298 = 3,70 % [3,31 % ; 4,13 %] | 18,135 ; P1 19,553 ; P5 19,874 |
| JS | 8057 | 510 (510) | 868 (909) | G1 464, G2 809 | 0 | 311 = 3,86 % [3,46 % ; 4,30 %] | 18,135 ; P1 19,605 ; P5 19,869 |

Blocs exclus (changement d'objectif) : C 342, J* 370.

**Stratification de Δ (J* − C), perte et prise ensemble, basculés**

| Variable | Valeur | Utilisateurs | Δ sem. 5-12 [IC 95 %] | Δ sem. 13-24 [IC 95 %] |
|---|---|---|---|---|
| sexe | female | 3590 | -0,025 [-0,034 ; -0,017] (n = 3536) | -0,046 [-0,051 ; -0,041] (n = 3438) |
| sexe | male | 2985 | -0,041 [-0,052 ; -0,030] (n = 2942) | -0,058 [-0,066 ; -0,051] (n = 2826) |
| classe d’IMC | 21 | 1514 | -0,079 [-0,108 ; -0,057] (n = 1417) | -0,113 [-0,133 ; -0,093] (n = 1203) |
| classe d’IMC | 26 | 1477 | -0,048 [-0,062 ; -0,031] (n = 1477) | -0,058 [-0,068 ; -0,049] (n = 1477) |
| classe d’IMC | 31 | 1487 | -0,032 [-0,044 ; -0,020] (n = 1487) | -0,045 [-0,053 ; -0,037] (n = 1487) |
| classe d’IMC | 38 | 1452 | -0,022 [-0,032 ; -0,010] (n = 1452) | -0,038 [-0,044 ; -0,031] (n = 1452) |
| classe d’IMC | case_R | 318 | -0,008 [-0,020 ; 0,006] (n = 318) | -0,034 [-0,048 ; -0,022] (n = 318) |
| classe d’IMC | case_S | 327 | -0,008 [-0,022 ; 0,007] (n = 327) | -0,024 [-0,039 ; -0,011] (n = 327) |
| activité | sedentary | 2957 | -0,038 [-0,049 ; -0,027] (n = 2910) | -0,052 [-0,059 ; -0,046] (n = 2799) |
| activité | strength | 3618 | -0,027 [-0,035 ; -0,019] (n = 3568) | -0,049 [-0,055 ; -0,044] (n = 3465) |
| objectif | gain | 2995 | -0,069 [-0,082 ; -0,055] (n = 2995) | -0,087 [-0,095 ; -0,079] (n = 2995) |
| objectif | loss | 3580 | -0,016 [-0,023 ; -0,010] (n = 3483) | -0,034 [-0,038 ; -0,030] (n = 3269) |
| vitesse demandée | 0.0025 | 3762 | -0,073 [-0,086 ; -0,060] (n = 3665) | -0,085 [-0,094 ; -0,078] (n = 3451) |
| vitesse demandée | 0.005 | 1076 | -0,022 [-0,034 ; -0,009] (n = 1076) | -0,038 [-0,044 ; -0,031] (n = 1076) |
| vitesse demandée | 0.01 | 1737 | -0,011 [-0,018 ; -0,006] (n = 1737) | -0,026 [-0,031 ; -0,022] (n = 1737) |
| décalage s | -150 | 1308 | -0,028 [-0,042 ; -0,015] (n = 1288) | -0,051 [-0,063 ; -0,042] (n = 1248) |
| décalage s | -270 | 1295 | -0,037 [-0,052 ; -0,023] (n = 1272) | -0,053 [-0,062 ; -0,043] (n = 1217) |
| décalage s | -400 | 1308 | -0,044 [-0,062 ; -0,027] (n = 1269) | -0,048 [-0,055 ; -0,038] (n = 1208) |
| décalage s | 150 | 1327 | -0,019 [-0,034 ; -0,005] (n = 1316) | -0,054 [-0,064 ; -0,044] (n = 1286) |
| décalage s | 270 | 1337 | -0,025 [-0,040 ; -0,010] (n = 1333) | -0,049 [-0,059 ; -0,039] (n = 1305) |
| part déclarée | 0.8 | 1207 | -0,031 [-0,046 ; -0,018] (n = 1187) | -0,056 [-0,068 ; -0,046] (n = 1154) |
| part déclarée | 0.95 | 2645 | -0,027 [-0,037 ; -0,016] (n = 2606) | -0,051 [-0,058 ; -0,045] (n = 2510) |
| part déclarée | 1 | 2723 | -0,037 [-0,051 ; -0,026] (n = 2685) | -0,048 [-0,055 ; -0,042] (n = 2600) |
| comportement | H1 | 1670 | -0,035 [-0,052 ; -0,020] (n = 1644) | -0,012 [-0,019 ; -0,004] (n = 1602) |
| comportement | H2a | 1602 | -0,024 [-0,036 ; -0,011] (n = 1574) | -0,118 [-0,132 ; -0,104] (n = 1522) |
| comportement | H2b | 1626 | -0,035 [-0,052 ; -0,022] (n = 1602) | -0,104 [-0,115 ; -0,095] (n = 1538) |
| comportement | H3 | 1677 | -0,025 [-0,041 ; -0,012] (n = 1658) | -0,005 [-0,011 ; 0,002] (n = 1602) |
| population | P00 | 6575 | -0,031 [-0,038 ; -0,024] (n = 6478) | -0,051 [-0,055 ; -0,047] (n = 6264) |
| quartile de h au premier plan J* (1,011 / 1,043 / 1,081) | Q1 | 1631 | -0,021 [-0,034 ; -0,008] (n = 1609) | -0,065 [-0,078 ; -0,056] (n = 1550) |
| quartile de h au premier plan J* (1,011 / 1,043 / 1,081) | Q2 | 1631 | -0,029 [-0,044 ; -0,018] (n = 1596) | -0,050 [-0,059 ; -0,042] (n = 1557) |
| quartile de h au premier plan J* (1,011 / 1,043 / 1,081) | Q3 | 1631 | -0,041 [-0,054 ; -0,029] (n = 1609) | -0,037 [-0,046 ; -0,028] (n = 1549) |
| quartile de h au premier plan J* (1,011 / 1,043 / 1,081) | Q4 | 1631 | -0,026 [-0,041 ; -0,010] (n = 1613) | -0,052 [-0,059 ; -0,043] (n = 1557) |
| quartile de h au premier plan J* (1,011 / 1,043 / 1,081) | sans plan J* | 51 | 0,000 [0,000 ; 0,000] (n = 51) | 0,000 [0,000 ; 0,000] (n = 51) |

Cellules où J* fait mieux que C (borne haute < 0) : NI H1 perte, sem. 5-12 ; NI H1 perte, sem. 13-24 ; NI H1 prise, sem. 5-12 ; NI H2a perte, sem. 13-24 ; NI H2a prise, sem. 13-24 ; NI H2b perte, sem. 13-24 ; NI H2b prise, sem. 13-24 ; NI H3 perte, sem. 13-24 ; NI H3 prise, sem. 5-12.

**Étape V2 (v2) : GO.**

### H4, robustesse (rapportée, sans verdict)

Non-suiveurs : 500 ; basculés (proposition acceptée) : 403 ; sans proposition : 97. Basculés avec un plan J* : 399 (99,01 %), jour médian du premier plan J* 28, délai médian depuis la bascule 14 j. Contrôle continu (5.4) : 0 différence(s) sur 403 utilisateurs.

**Basculés par comportement et objectif**

| Comportement | Objectif | Non-suiveurs | Basculés |
|---|---|---|---|
| H4 | perte | 219 | 178 |
| H4 | maintien | 92 | 72 |
| H4 | prise | 189 | 153 |

**Basculés sans plan J* : critère de porte manquant à la dernière évaluation du repli**

| Critère(s) manquant(s) | Utilisateurs |
|---|---|
| (porte ouverte, plan en échec) | 4 |

**Sécurité de J* (rapportée)**

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| S3-P [S] J* H4 | 0 violation(s) sur 7977 évaluations (399 utilisateurs) ; exemptées : 0 | rapporté |
| S3-D [S] J* H4 | 333 / 1992 utilisateurs-blocs = 16,72 % [13,33 % ; 20,06 %] (399 utilisateurs) | rapporté |
| S4-P [S] J* H4 | 0 jour(s) (399 utilisateurs) | rapporté |
| S4-J [S] J* H4 | 6 / 399 = 1,50 % [0,69 % ; 3,24 %] ; marge minimale -27,0 kcal/j, P1 -18,2 | rapporté |

**Stabilité de la cible affichée après le jour de référence : variation hebdomadaire |ΔT| (kcal/j)**

| Bras | Basculés | Médiane [P10 ; P90] |
|---|---|---|
| C | 403 | 48,8 [23,5 ; 72,8] |
| JS | 399 | 35,3 [13,7 ; 62,2] |

**J* (A7.6), basculés avec un plan J***

| Comportement | Utilisateurs | h brut au premier plan : P5 / P25 / médiane / P75 / P95 | Borne basse / haute atteinte : utilisateurs (constructions) | Erreur de h, tous plans : médiane [P10 ; P90] | Écart de M à la vérité (unités de saisie), premier plan : médiane [P10 ; P90] | Variation hebdomadaire de M / h (kcal/j) : médiane [P10 ; P90] | Recalibrations / recalculs, médianes ; garde-fous J* | Échecs de construction ; constructions à plancher actif |
|---|---|---|---|---|---|---|---|---|
| H4 | 399 | 0,843 / 0,917 / 0,980 / 1,041 / 1,121 | 218 / 95 (1457 / 715) | 0,049 [-0,134 ; 0,172] (4495 plans) | 19,9 [-318,9 ; 378,0] ; |écart| moyen médian 66,6 | 43,1 [26,6 ; 65,7] | 10,0 / 1,0 ; G1 21, G2 71 | 346 ; plancher actif 605 |
| tous | 399 | 0,843 / 0,917 / 0,980 / 1,041 / 1,121 | 218 / 95 (1457 / 715) | 0,049 [-0,134 ; 0,172] (4495 plans) | 19,9 [-318,9 ; 378,0] ; |écart| moyen médian 66,6 | 43,1 [26,6 ; 65,7] | 10,0 / 1,0 ; G1 21, G2 71 | 346 ; plancher actif 605 |

**Échecs de construction J* par raison (plan laissé en place)**

| Type : raison | Constructions |
|---|---|
| recal_jstar:no_feasible_speed | 130 |
| recal_jstar:target_not_above_current | 145 |
| replan_periodic_jstar:no_feasible_speed | 21 |
| replan_periodic_jstar:target_not_above_current | 50 |

## 5. V3 : P05, P10, P20, R0, R15, R30 (v3)

### P05

Non-suiveurs : 7500 ; basculés (proposition acceptée) : 6028 ; sans proposition : 1472. Basculés avec un plan J* : 5910 (98,04 %), jour médian du premier plan J* 28, délai médian depuis la bascule 14 j. Contrôle continu (5.4) : 0 différence(s) sur 6028 utilisateurs.

**Basculés par comportement et objectif**

| Comportement | Objectif | Non-suiveurs | Basculés |
|---|---|---|---|
| R0 | perte | 1123 | 910 |
| R0 | maintien | 481 | 397 |
| R0 | prise | 896 | 717 |
| R15 | perte | 1104 | 872 |
| R15 | maintien | 465 | 377 |
| R15 | prise | 931 | 755 |
| R30 | perte | 1132 | 916 |
| R30 | maintien | 445 | 349 |
| R30 | prise | 923 | 735 |

**Basculés sans plan J* : critère de porte manquant à la dernière évaluation du repli**

| Critère(s) manquant(s) | Utilisateurs |
|---|---|
| (porte ouverte, plan en échec) | 118 |

**NI (J* − C), V3 P05 : GO**

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| NI R0 perte, sem. 5-12 | C 0,165 → J* 0,147 ; Δ -0,018 [-0,031 ; -0,007] (n = 886) ; J* meilleur | GO |
| NI R0 perte, sem. 13-24 | C 0,080 → J* 0,074 ; Δ -0,006 [-0,011 ; -0,001] (n = 826) ; J* meilleur | GO |
| NI R0 prise, sem. 5-12 | C 0,383 → J* 0,308 ; Δ -0,075 [-0,105 ; -0,047] (n = 717) ; J* meilleur | GO |
| NI R0 prise, sem. 13-24 | C 0,161 → J* 0,175 ; Δ 0,014 [0,004 ; 0,024] (n = 717) | GO |
| NI R15 perte, sem. 5-12 | C 0,194 → J* 0,167 ; Δ -0,027 [-0,040 ; -0,016] (n = 848) ; J* meilleur | GO |
| NI R15 perte, sem. 13-24 | C 0,110 → J* 0,104 ; Δ -0,006 [-0,012 ; 0,001] (n = 799) | GO |
| NI R15 prise, sem. 5-12 | C 0,429 → J* 0,333 ; Δ -0,097 [-0,120 ; -0,065] (n = 755) ; J* meilleur | GO |
| NI R15 prise, sem. 13-24 | C 0,217 → J* 0,210 ; Δ -0,006 [-0,022 ; 0,005] (n = 755) | GO |
| NI R30 perte, sem. 5-12 | C 0,202 → J* 0,168 ; Δ -0,034 [-0,047 ; -0,018] (n = 898) ; J* meilleur | GO |
| NI R30 perte, sem. 13-24 | C 0,123 → J* 0,112 ; Δ -0,011 [-0,018 ; -0,004] (n = 851) ; J* meilleur | GO |
| NI R30 prise, sem. 5-12 | C 0,489 → J* 0,370 ; Δ -0,119 [-0,148 ; -0,087] (n = 735) ; J* meilleur | GO |
| NI R30 prise, sem. 13-24 | C 0,246 → J* 0,221 ; Δ -0,025 [-0,041 ; -0,011] (n = 735) ; J* meilleur | GO |

**Sécurité de J* (période après le premier plan J*), V3 P05 : NO-GO**

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| S3-P [S] J* R0 | 0 violation(s) sur 39904 évaluations (2002 utilisateurs) ; exemptées : 0 | GO |
| S3-D [S] J* R0 | 216 / 9943 utilisateurs-blocs = 2,17 % [1,85 % ; 2,53 %] (2002 utilisateurs) | GO |
| S4-P [S] J* R0 | 0 jour(s) (2002 utilisateurs) | GO |
| S4-J [S] J* R0 | 40 / 2002 = 2,00 % [1,47 % ; 2,71 %] ; marge minimale -207,3 kcal/j, P1 -31,8 | NO-GO |
| S3-P [S] J* R15 | 0 violation(s) sur 39020 évaluations (1965 utilisateurs) ; exemptées : 0 | GO |
| S3-D [S] J* R15 | 265 / 9716 utilisateurs-blocs = 2,73 % [2,33 % ; 3,11 %] (1963 utilisateurs) | GO |
| S4-P [S] J* R15 | 0 jour(s) (1965 utilisateurs) | GO |
| S4-J [S] J* R15 | 27 / 1965 = 1,37 % [0,95 % ; 1,99 %] ; marge minimale -160,1 kcal/j, P1 -24,3 | INCONCLUSIF |
| S3-P [S] J* R30 | 0 violation(s) sur 38576 évaluations (1943 utilisateurs) ; exemptées : 0 | GO |
| S3-D [S] J* R30 | 275 / 9600 utilisateurs-blocs = 2,86 % [2,47 % ; 3,28 %] (1939 utilisateurs) | GO |
| S4-P [S] J* R30 | 0 jour(s) (1943 utilisateurs) | GO |
| S4-J [S] J* R30 | 26 / 1943 = 1,34 % [0,91 % ; 1,95 %] ; marge minimale -166,8 kcal/j, P1 -17,6 | INCONCLUSIF |

**S1 de J*, V3 P05 : GO**

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| S1 J* (R0 à R30) perte, sem. 5-12 | 0,991 [0,982 ; 1,000] (n = 2632 ; P10 / P90 0,523 / 1,362) | GO |
| S1 J* (R0 à R30) perte, sem. 13-24 | 1,000 [0,995 ; 1,004] (n = 2500 ; P10 / P90 0,721 / 1,196) | GO |
| S1 J* (R0 à R30) prise, sem. 5-12 | 1,018 [0,999 ; 1,038] (n = 2207 ; P10 / P90 0,381 / 1,730) | GO |
| S1 J* (R0 à R30) prise, sem. 13-24 | 1,025 [1,017 ; 1,034] (n = 2207 ; P10 / P90 0,640 / 1,437) | GO |

**V3 P05 : NO-GO.**

**J* (A7.6), basculés avec un plan J***

| Comportement | Utilisateurs | h brut au premier plan : P5 / P25 / médiane / P75 / P95 | Borne basse / haute atteinte : utilisateurs (constructions) | Erreur de h, tous plans : médiane [P10 ; P90] | Écart de M à la vérité (unités de saisie), premier plan : médiane [P10 ; P90] | Variation hebdomadaire de M / h (kcal/j) : médiane [P10 ; P90] | Recalibrations / recalculs, médianes ; garde-fous J* | Échecs de construction ; constructions à plancher actif |
|---|---|---|---|---|---|---|---|---|
| R0 | 2002 | 0,951 / 0,980 / 1,000 / 1,020 / 1,051 | 0 / 0 (0 / 0) | 0,000 [-0,059 ; 0,057] (23381 plans) | 16,6 [-320,3 ; 365,0] ; |écart| moyen médian 66,4 | 43,6 [30,0 ; 60,9] | 11,0 / 1,0 ; G1 117, G2 195 | 532 ; plancher actif 3677 |
| R15 | 1965 | 0,976 / 1,010 / 1,035 / 1,063 / 1,106 | 0 / 0 (0 / 0) | 0,000 [-0,079 ; 0,075] (23807 plans) | 8,6 [-312,5 ; 346,8] ; |écart| moyen médian 64,6 | 46,8 [32,3 ; 67,4] | 12,0 / 0,0 ; G1 101, G2 162 | 1008 ; plancher actif 3547 |
| R30 | 1943 | 1,001 / 1,044 / 1,070 / 1,103 / 1,149 | 0 / 0 (0 / 0) | -0,000 [-0,091 ; 0,086] (23938 plans) | 13,0 [-310,1 ; 355,9] ; |écart| moyen médian 64,1 | 47,7 [33,4 ; 67,5] | 12,0 / 0,0 ; G1 107, G2 177 | 1147 ; plancher actif 4114 |
| tous | 5910 | 0,965 / 1,001 / 1,032 / 1,067 / 1,124 | 0 / 0 (0 / 0) | 0,000 [-0,076 ; 0,073] (71126 plans) | 11,6 [-314,7 ; 355,2] ; |écart| moyen médian 64,9 | 46,0 [31,6 ; 65,5] | 11,0 / 0,0 ; G1 325, G2 534 | 2687 ; plancher actif 11338 |

**Échecs de construction J* par raison (plan laissé en place)**

| Type : raison | Constructions |
|---|---|
| recal_jstar:no_feasible_speed | 2282 |
| recal_jstar:target_not_above_current | 150 |
| replan_periodic_jstar:no_feasible_speed | 207 |
| replan_periodic_jstar:target_not_above_current | 48 |

**Bras C, critères (rapportés, sans verdict ; référence : jour de la cible choisie)**

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| S1 C perte, sem. 5-12 | 0,946 [0,933 ; 0,954] (n = 2640 ; P10 / P90 0,359 / 1,311) | rapporté |
| S1 C perte, sem. 13-24 | 0,976 [0,972 ; 0,981] (n = 2540 ; P10 / P90 0,661 / 1,187) | rapporté |
| S1 C prise, sem. 5-12 | 1,209 [1,186 ; 1,232] (n = 2207 ; P10 / P90 0,459 / 2,185) | rapporté |
| S1 C prise, sem. 13-24 | 1,001 [0,992 ; 1,010] (n = 2207 ; P10 / P90 0,598 / 1,424) | rapporté |
| S3-P [S] C R0 | 0 violation(s) sur 42344 évaluations (2024 utilisateurs) ; exemptées : 2184 | rapporté |
| S3-D [S] C R0 | 265 / 10120 utilisateurs-blocs = 2,62 % [2,24 % ; 3,00 %] (2024 utilisateurs) | rapporté |
| S4-P [S] C R0 | 0 jour(s) (2024 utilisateurs) | rapporté |
| S4-J [S] C R0 | 59 / 2024 = 2,92 % [2,27 % ; 3,74 %] ; marge minimale -209,7 kcal/j, P1 -53,6 | rapporté |
| S3-P [S] C R15 | 0 violation(s) sur 41893 évaluations (2004 utilisateurs) ; exemptées : 2195 | rapporté |
| S3-D [S] C R15 | 320 / 10020 utilisateurs-blocs = 3,19 % [2,77 % ; 3,65 %] (2004 utilisateurs) | rapporté |
| S4-P [S] C R15 | 0 jour(s) (2004 utilisateurs) | rapporté |
| S4-J [S] C R15 | 28 / 2004 = 1,40 % [0,97 % ; 2,01 %] ; marge minimale -127,9 kcal/j, P1 -34,1 | rapporté |
| S3-P [S] C R30 | 0 violation(s) sur 41714 évaluations (2000 utilisateurs) ; exemptées : 2286 | rapporté |
| S3-D [S] C R30 | 376 / 10000 utilisateurs-blocs = 3,76 % [3,31 % ; 4,24 %] (2000 utilisateurs) | rapporté |
| S4-P [S] C R30 | 0 jour(s) (2000 utilisateurs) | rapporté |
| S4-J [S] C R30 | 25 / 2000 = 1,25 % [0,85 % ; 1,84 %] ; marge minimale -190,8 kcal/j, P1 -5,9 | rapporté |
| S3-P [S] C tous | 0 violation(s) sur 125951 évaluations (6028 utilisateurs) ; exemptées : 6665 | rapporté |
| S3-D [S] C tous | 961 / 30140 utilisateurs-blocs = 3,19 % [2,94 % ; 3,44 %] (6028 utilisateurs) | rapporté |
| S4-P [S] C tous | 0 jour(s) (6028 utilisateurs) | rapporté |
| S4-J [S] C tous | 112 / 6028 = 1,86 % [1,55 % ; 2,23 %] ; marge minimale -209,7 kcal/j, P1 -36,3 | rapporté |

T_c remplacées par le plancher × 1,10 : 1193 / 6028.

**S2 (rapporté), basculés**

| Bras | Objectif | Fenêtre | Blocs | Médiane | P90 | P90 / médiane | P90 − médiane |
|---|---|---|---|---|---|---|---|
| C | perte | sem. 5-12 | 5248 | 0,946 | 1,311 | 1,386 | 0,365 |
| C | perte | sem. 13-24 | 7352 | 0,976 | 1,187 | 1,216 | 0,211 |
| C | prise | sem. 5-12 | 4414 | 1,209 | 2,185 | 1,807 | 0,976 |
| C | prise | sem. 13-24 | 6621 | 1,001 | 1,424 | 1,422 | 0,423 |
| JS | perte | sem. 5-12 | 5207 | 0,991 | 1,362 | 1,374 | 0,370 |
| JS | perte | sem. 13-24 | 7248 | 1,000 | 1,196 | 1,196 | 0,196 |
| JS | prise | sem. 5-12 | 4414 | 1,018 | 1,730 | 1,700 | 0,712 |
| JS | prise | sem. 13-24 | 6621 | 1,025 | 1,437 | 1,401 | 0,411 |

**S7 (rapporté) : maintien dans la zone à 8 semaines, tous les non-suiveurs en maintien**

| Bras | Dans la zone (cible) | Centrée sur le poids vrai de départ |
|---|---|---|
| C | 461 / 1391 = 33,14 % [30,72 % ; 35,66 %] | 442 / 1391 |
| JS | 479 / 1391 = 34,44 % [31,98 % ; 36,97 %] | 514 / 1391 |

**Garde-fous et IMC vrai, basculés**

| Bras | n | G1 : utilisateurs (événements) | G2 : utilisateurs (événements) | Événements (J* : chemin J* ; C : tous) | Échecs | Fins sous IMC 20 vrai | IMC vrai minimal : min ; P1 ; P5 |
|---|---|---|---|---|---|---|---|
| C | 6028 | 339 (339) | 600 (627) | G1 339, G2 627 | 0 | 191 = 3,17 % [2,76 % ; 3,64 %] | 18,245 ; P1 19,634 ; P5 19,891 |
| JS | 6028 | 365 (365) | 575 (605) | G1 325, G2 534 | 0 | 223 = 3,70 % [3,25 % ; 4,21 %] | 18,245 ; P1 19,601 ; P5 19,888 |

Blocs exclus (changement d'objectif) : C 222, J* 262.

**Stratification de Δ (J* − C), perte et prise ensemble, basculés**

| Variable | Valeur | Utilisateurs | Δ sem. 5-12 [IC 95 %] | Δ sem. 13-24 [IC 95 %] |
|---|---|---|---|---|
| sexe | female | 2692 | -0,047 [-0,059 ; -0,035] (n = 2654) | -0,011 [-0,016 ; -0,006] (n = 2576) |
| sexe | male | 2213 | -0,054 [-0,066 ; -0,040] (n = 2185) | -0,005 [-0,012 ; 0,000] (n = 2107) |
| classe d’IMC | 21 | 1114 | -0,113 [-0,146 ; -0,081] (n = 1048) | -0,004 [-0,020 ; 0,013] (n = 892) |
| classe d’IMC | 26 | 1081 | -0,070 [-0,092 ; -0,050] (n = 1081) | -0,005 [-0,012 ; 0,003] (n = 1081) |
| classe d’IMC | 31 | 1113 | -0,044 [-0,059 ; -0,027] (n = 1113) | -0,013 [-0,019 ; -0,006] (n = 1113) |
| classe d’IMC | 38 | 1120 | -0,031 [-0,042 ; -0,020] (n = 1120) | -0,003 [-0,009 ; 0,002] (n = 1120) |
| classe d’IMC | case_R | 245 | -0,025 [-0,045 ; -0,005] (n = 245) | -0,018 [-0,032 ; -0,004] (n = 245) |
| classe d’IMC | case_S | 232 | -0,021 [-0,043 ; -0,003] (n = 232) | -0,001 [-0,014 ; 0,011] (n = 232) |
| activité | sedentary | 2233 | -0,055 [-0,069 ; -0,040] (n = 2199) | -0,008 [-0,014 ; -0,001] (n = 2139) |
| activité | strength | 2672 | -0,048 [-0,060 ; -0,037] (n = 2640) | -0,010 [-0,014 ; -0,005] (n = 2544) |
| objectif | gain | 2207 | -0,097 [-0,113 ; -0,080] (n = 2207) | -0,006 [-0,013 ; 0,002] (n = 2207) |
| objectif | loss | 2698 | -0,026 [-0,034 ; -0,019] (n = 2632) | -0,007 [-0,010 ; -0,003] (n = 2476) |
| vitesse demandée | 0.0025 | 2772 | -0,091 [-0,107 ; -0,073] (n = 2706) | -0,007 [-0,014 ; -0,001] (n = 2550) |
| vitesse demandée | 0.005 | 825 | -0,027 [-0,037 ; -0,014] (n = 825) | -0,005 [-0,010 ; 0,000] (n = 825) |
| vitesse demandée | 0.01 | 1308 | -0,025 [-0,033 ; -0,015] (n = 1308) | -0,005 [-0,009 ; -0,001] (n = 1308) |
| décalage s | -150 | 965 | -0,042 [-0,058 ; -0,016] (n = 950) | -0,011 [-0,022 ; -0,002] (n = 921) |
| décalage s | -270 | 986 | -0,042 [-0,061 ; -0,025] (n = 967) | -0,009 [-0,016 ; 0,000] (n = 932) |
| décalage s | -400 | 1004 | -0,062 [-0,080 ; -0,041] (n = 976) | -0,012 [-0,020 ; -0,004] (n = 928) |
| décalage s | 150 | 965 | -0,063 [-0,078 ; -0,041] (n = 963) | -0,005 [-0,013 ; 0,003] (n = 936) |
| décalage s | 270 | 985 | -0,051 [-0,069 ; -0,032] (n = 983) | -0,007 [-0,016 ; 0,000] (n = 966) |
| part déclarée | 0.8 | 911 | -0,050 [-0,068 ; -0,027] (n = 903) | -0,010 [-0,017 ; -0,000] (n = 877) |
| part déclarée | 0.95 | 1987 | -0,049 [-0,062 ; -0,033] (n = 1959) | -0,010 [-0,017 ; -0,005] (n = 1901) |
| part déclarée | 1 | 2007 | -0,054 [-0,069 ; -0,040] (n = 1977) | -0,007 [-0,013 ; -0,001] (n = 1905) |
| comportement | R0 | 1627 | -0,033 [-0,047 ; -0,022] (n = 1603) | -0,000 [-0,006 ; 0,005] (n = 1543) |
| comportement | R15 | 1627 | -0,052 [-0,064 ; -0,037] (n = 1603) | -0,013 [-0,021 ; -0,007] (n = 1554) |
| comportement | R30 | 1651 | -0,064 [-0,081 ; -0,048] (n = 1633) | -0,018 [-0,025 ; -0,010] (n = 1586) |
| population | P05 | 4905 | -0,052 [-0,060 ; -0,042] (n = 4839) | -0,009 [-0,013 ; -0,005] (n = 4683) |
| quartile de h au premier plan J* (1,001 / 1,032 / 1,068) | Q1 | 1202 | -0,039 [-0,053 ; -0,021] (n = 1185) | -0,001 [-0,009 ; 0,006] (n = 1135) |
| quartile de h au premier plan J* (1,001 / 1,032 / 1,068) | Q2 | 1201 | -0,057 [-0,074 ; -0,041] (n = 1184) | -0,004 [-0,012 ; 0,004] (n = 1149) |
| quartile de h au premier plan J* (1,001 / 1,032 / 1,068) | Q3 | 1201 | -0,047 [-0,065 ; -0,027] (n = 1180) | -0,013 [-0,021 ; -0,004] (n = 1143) |
| quartile de h au premier plan J* (1,001 / 1,032 / 1,068) | Q4 | 1201 | -0,056 [-0,073 ; -0,037] (n = 1191) | -0,015 [-0,022 ; -0,007] (n = 1157) |
| quartile de h au premier plan J* (1,001 / 1,032 / 1,068) | sans plan J* | 100 | 0,000 [0,000 ; 0,000] (n = 99) | 0,000 [0,000 ; 0,000] (n = 99) |

### P10

Non-suiveurs : 7500 ; basculés (proposition acceptée) : 6028 ; sans proposition : 1472. Basculés avec un plan J* : 5838 (96,85 %), jour médian du premier plan J* 28, délai médian depuis la bascule 14 j. Contrôle continu (5.4) : 0 différence(s) sur 6028 utilisateurs.

**Basculés par comportement et objectif**

| Comportement | Objectif | Non-suiveurs | Basculés |
|---|---|---|---|
| R0 | perte | 1123 | 910 |
| R0 | maintien | 481 | 397 |
| R0 | prise | 896 | 717 |
| R15 | perte | 1104 | 872 |
| R15 | maintien | 465 | 377 |
| R15 | prise | 931 | 755 |
| R30 | perte | 1132 | 916 |
| R30 | maintien | 445 | 349 |
| R30 | prise | 923 | 735 |

**Basculés sans plan J* : critère de porte manquant à la dernière évaluation du repli**

| Critère(s) manquant(s) | Utilisateurs |
|---|---|
| (porte ouverte, plan en échec) | 190 |

**NI (J* − C), V3 P10 : GO**

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| NI R0 perte, sem. 5-12 | C 0,177 → J* 0,157 ; Δ -0,020 [-0,033 ; -0,008] (n = 887) ; J* meilleur | GO |
| NI R0 perte, sem. 13-24 | C 0,091 → J* 0,082 ; Δ -0,009 [-0,014 ; -0,004] (n = 843) ; J* meilleur | GO |
| NI R0 prise, sem. 5-12 | C 0,396 → J* 0,316 ; Δ -0,080 [-0,113 ; -0,053] (n = 717) ; J* meilleur | GO |
| NI R0 prise, sem. 13-24 | C 0,165 → J* 0,176 ; Δ 0,011 [0,001 ; 0,022] (n = 717) | GO |
| NI R15 perte, sem. 5-12 | C 0,216 → J* 0,182 ; Δ -0,033 [-0,047 ; -0,017] (n = 849) ; J* meilleur | GO |
| NI R15 perte, sem. 13-24 | C 0,123 → J* 0,114 ; Δ -0,008 [-0,017 ; -0,002] (n = 806) ; J* meilleur | GO |
| NI R15 prise, sem. 5-12 | C 0,476 → J* 0,345 ; Δ -0,131 [-0,169 ; -0,100] (n = 755) ; J* meilleur | GO |
| NI R15 prise, sem. 13-24 | C 0,226 → J* 0,216 ; Δ -0,010 [-0,026 ; 0,005] (n = 755) | GO |
| NI R30 perte, sem. 5-12 | C 0,230 → J* 0,185 ; Δ -0,046 [-0,061 ; -0,029] (n = 899) ; J* meilleur | GO |
| NI R30 perte, sem. 13-24 | C 0,142 → J* 0,125 ; Δ -0,017 [-0,025 ; -0,009] (n = 857) ; J* meilleur | GO |
| NI R30 prise, sem. 5-12 | C 0,547 → J* 0,376 ; Δ -0,171 [-0,202 ; -0,131] (n = 735) ; J* meilleur | GO |
| NI R30 prise, sem. 13-24 | C 0,255 → J* 0,221 ; Δ -0,034 [-0,046 ; -0,020] (n = 735) ; J* meilleur | GO |

**Sécurité de J* (période après le premier plan J*), V3 P10 : GO**

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| S3-P [S] J* R0 | 0 violation(s) sur 39552 évaluations (1994 utilisateurs) ; exemptées : 0 | GO |
| S3-D [S] J* R0 | 193 / 9841 utilisateurs-blocs = 1,96 % [1,63 % ; 2,29 %] (1992 utilisateurs) | GO |
| S4-P [S] J* R0 | 0 jour(s) (1994 utilisateurs) | GO |
| S4-J [S] J* R0 | 17 / 1994 = 0,85 % [0,53 % ; 1,36 %] ; marge minimale -165,5 kcal/j, P1 14,4 | GO |
| S3-P [S] J* R15 | 0 violation(s) sur 38306 évaluations (1931 utilisateurs) ; exemptées : 0 | GO |
| S3-D [S] J* R15 | 229 / 9524 utilisateurs-blocs = 2,40 % [2,06 % ; 2,78 %] (1929 utilisateurs) | GO |
| S4-P [S] J* R15 | 0 jour(s) (1931 utilisateurs) | GO |
| S4-J [S] J* R15 | 9 / 1931 = 0,47 % [0,25 % ; 0,88 %] ; marge minimale -125,9 kcal/j, P1 19,7 | GO |
| S3-P [S] J* R30 | 0 violation(s) sur 37882 évaluations (1913 utilisateurs) ; exemptées : 0 | GO |
| S3-D [S] J* R30 | 241 / 9407 utilisateurs-blocs = 2,56 % [2,17 % ; 2,94 %] (1911 utilisateurs) | GO |
| S4-P [S] J* R30 | 0 jour(s) (1913 utilisateurs) | GO |
| S4-J [S] J* R30 | 9 / 1913 = 0,47 % [0,25 % ; 0,89 %] ; marge minimale -147,0 kcal/j, P1 37,1 | GO |

**S1 de J*, V3 P10 : GO**

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| S1 J* (R0 à R30) perte, sem. 5-12 | 0,971 [0,964 ; 0,982] (n = 2636 ; P10 / P90 0,351 / 1,354) | GO |
| S1 J* (R0 à R30) perte, sem. 13-24 | 0,985 [0,980 ; 0,990] (n = 2519 ; P10 / P90 0,572 / 1,187) | GO |
| S1 J* (R0 à R30) prise, sem. 5-12 | 1,007 [0,985 ; 1,027] (n = 2207 ; P10 / P90 0,362 / 1,735) | GO |
| S1 J* (R0 à R30) prise, sem. 13-24 | 1,015 [1,006 ; 1,023] (n = 2207 ; P10 / P90 0,628 / 1,440) | GO |

**V3 P10 : GO.**

**J* (A7.6), basculés avec un plan J***

| Comportement | Utilisateurs | h brut au premier plan : P5 / P25 / médiane / P75 / P95 | Borne basse / haute atteinte : utilisateurs (constructions) | Erreur de h, tous plans : médiane [P10 ; P90] | Écart de M à la vérité (unités de saisie), premier plan : médiane [P10 ; P90] | Variation hebdomadaire de M / h (kcal/j) : médiane [P10 ; P90] | Recalibrations / recalculs, médianes ; garde-fous J* | Échecs de construction ; constructions à plancher actif |
|---|---|---|---|---|---|---|---|---|
| R0 | 1994 | 0,951 / 0,980 / 1,000 / 1,020 / 1,050 | 0 / 0 (0 / 0) | -0,000 [-0,059 ; 0,057] (22748 plans) | 19,2 [-309,6 ; 361,4] ; |écart| moyen médian 65,8 | 42,1 [28,5 ; 59,6] | 11,0 / 1,0 ; G1 110, G2 165 | 1098 ; plancher actif 4108 |
| R15 | 1931 | 0,976 / 1,010 / 1,035 / 1,063 / 1,106 | 0 / 0 (0 / 0) | -0,000 [-0,079 ; 0,074] (22973 plans) | 13,8 [-303,7 ; 342,8] ; |écart| moyen médian 64,2 | 45,2 [31,2 ; 65,8] | 11,0 / 0,0 ; G1 95, G2 132 | 1182 ; plancher actif 3968 |
| R30 | 1913 | 1,001 / 1,044 / 1,070 / 1,103 / 1,148 | 0 / 0 (0 / 0) | -0,000 [-0,090 ; 0,086] (22929 plans) | 17,9 [-298,0 ; 355,8] ; |écart| moyen médian 63,9 | 46,2 [32,2 ; 65,5] | 12,0 / 0,0 ; G1 100, G2 143 | 1797 ; plancher actif 4507 |
| tous | 5838 | 0,965 / 1,000 / 1,031 / 1,067 / 1,123 | 0 / 0 (0 / 0) | -0,000 [-0,076 ; 0,072] (68650 plans) | 17,1 [-305,2 ; 353,7] ; |écart| moyen médian 64,7 | 44,5 [30,4 ; 63,9] | 11,0 / 0,0 ; G1 305, G2 440 | 4077 ; plancher actif 12583 |

**Échecs de construction J* par raison (plan laissé en place)**

| Type : raison | Constructions |
|---|---|
| recal_jstar:no_feasible_speed | 3600 |
| recal_jstar:target_not_above_current | 132 |
| replan_periodic_jstar:no_feasible_speed | 295 |
| replan_periodic_jstar:target_not_above_current | 50 |

**Bras C, critères (rapportés, sans verdict ; référence : jour de la cible choisie)**

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| S1 C perte, sem. 5-12 | 0,906 [0,896 ; 0,915] (n = 2647 ; P10 / P90 0,147 / 1,280) | rapporté |
| S1 C perte, sem. 13-24 | 0,961 [0,955 ; 0,967] (n = 2574 ; P10 / P90 0,524 / 1,185) | rapporté |
| S1 C prise, sem. 5-12 | 1,278 [1,252 ; 1,303] (n = 2207 ; P10 / P90 0,505 / 2,385) | rapporté |
| S1 C prise, sem. 13-24 | 0,990 [0,981 ; 1,000] (n = 2207 ; P10 / P90 0,571 / 1,435) | rapporté |
| S3-P [S] C R0 | 0 violation(s) sur 42327 évaluations (2024 utilisateurs) ; exemptées : 2201 | rapporté |
| S3-D [S] C R0 | 260 / 10120 utilisateurs-blocs = 2,57 % [2,20 % ; 2,97 %] (2024 utilisateurs) | rapporté |
| S4-P [S] C R0 | 0 jour(s) (2024 utilisateurs) | rapporté |
| S4-J [S] C R0 | 23 / 2024 = 1,14 % [0,76 % ; 1,70 %] ; marge minimale -192,3 kcal/j, P1 -2,6 | rapporté |
| S3-P [S] C R15 | 0 violation(s) sur 41881 évaluations (2004 utilisateurs) ; exemptées : 2207 | rapporté |
| S3-D [S] C R15 | 317 / 10020 utilisateurs-blocs = 3,16 % [2,75 % ; 3,60 %] (2004 utilisateurs) | rapporté |
| S4-P [S] C R15 | 0 jour(s) (2004 utilisateurs) | rapporté |
| S4-J [S] C R15 | 15 / 2004 = 0,75 % [0,45 % ; 1,23 %] ; marge minimale -121,9 kcal/j, P1 20,1 | rapporté |
| S3-P [S] C R30 | 0 violation(s) sur 41570 évaluations (2000 utilisateurs) ; exemptées : 2430 | rapporté |
| S3-D [S] C R30 | 375 / 10000 utilisateurs-blocs = 3,75 % [3,26 % ; 4,26 %] (2000 utilisateurs) | rapporté |
| S4-P [S] C R30 | 0 jour(s) (2000 utilisateurs) | rapporté |
| S4-J [S] C R30 | 9 / 2000 = 0,45 % [0,24 % ; 0,85 %] ; marge minimale -140,7 kcal/j, P1 35,3 | rapporté |
| S3-P [S] C tous | 0 violation(s) sur 125778 évaluations (6028 utilisateurs) ; exemptées : 6838 | rapporté |
| S3-D [S] C tous | 952 / 30140 utilisateurs-blocs = 3,16 % [2,92 % ; 3,42 %] (6028 utilisateurs) | rapporté |
| S4-P [S] C tous | 0 jour(s) (6028 utilisateurs) | rapporté |
| S4-J [S] C tous | 47 / 6028 = 0,78 % [0,59 % ; 1,04 %] ; marge minimale -192,3 kcal/j, P1 13,8 | rapporté |

T_c remplacées par le plancher × 1,10 : 1440 / 6028.

**S2 (rapporté), basculés**

| Bras | Objectif | Fenêtre | Blocs | Médiane | P90 | P90 / médiane | P90 − médiane |
|---|---|---|---|---|---|---|---|
| C | perte | sem. 5-12 | 5275 | 0,906 | 1,280 | 1,413 | 0,374 |
| C | perte | sem. 13-24 | 7455 | 0,961 | 1,185 | 1,233 | 0,224 |
| C | prise | sem. 5-12 | 4414 | 1,278 | 2,385 | 1,867 | 1,108 |
| C | prise | sem. 13-24 | 6621 | 0,990 | 1,435 | 1,449 | 0,445 |
| JS | perte | sem. 5-12 | 5224 | 0,971 | 1,354 | 1,395 | 0,383 |
| JS | perte | sem. 13-24 | 7310 | 0,985 | 1,187 | 1,205 | 0,202 |
| JS | prise | sem. 5-12 | 4414 | 1,007 | 1,735 | 1,723 | 0,728 |
| JS | prise | sem. 13-24 | 6621 | 1,015 | 1,440 | 1,420 | 0,426 |

**S7 (rapporté) : maintien dans la zone à 8 semaines, tous les non-suiveurs en maintien**

| Bras | Dans la zone (cible) | Centrée sur le poids vrai de départ |
|---|---|---|
| C | 431 / 1391 = 30,98 % [28,61 % ; 33,46 %] | 392 / 1391 |
| JS | 490 / 1391 = 35,23 % [32,76 % ; 37,77 %] | 504 / 1391 |

**Garde-fous et IMC vrai, basculés**

| Bras | n | G1 : utilisateurs (événements) | G2 : utilisateurs (événements) | Événements (J* : chemin J* ; C : tous) | Échecs | Fins sous IMC 20 vrai | IMC vrai minimal : min ; P1 ; P5 |
|---|---|---|---|---|---|---|---|
| C | 6028 | 306 (306) | 521 (549) | G1 306, G2 549 | 0 | 166 = 2,75 % [2,37 % ; 3,20 %] | 18,243 ; P1 19,652 ; P5 19,916 |
| JS | 6028 | 343 (343) | 490 (514) | G1 305, G2 440 | 0 | 193 = 3,20 % [2,79 % ; 3,68 %] | 18,243 ; P1 19,627 ; P5 19,895 |

Blocs exclus (changement d'objectif) : C 204, J* 249.

**Stratification de Δ (J* − C), perte et prise ensemble, basculés**

| Variable | Valeur | Utilisateurs | Δ sem. 5-12 [IC 95 %] | Δ sem. 13-24 [IC 95 %] |
|---|---|---|---|---|
| sexe | female | 2692 | -0,058 [-0,071 ; -0,046] (n = 2655) | -0,012 [-0,017 ; -0,007] (n = 2591) |
| sexe | male | 2213 | -0,071 [-0,087 ; -0,055] (n = 2187) | -0,009 [-0,016 ; -0,002] (n = 2122) |
| classe d’IMC | 21 | 1114 | -0,145 [-0,188 ; -0,108] (n = 1051) | -0,002 [-0,016 ; 0,019] (n = 922) |
| classe d’IMC | 26 | 1081 | -0,092 [-0,114 ; -0,068] (n = 1081) | -0,007 [-0,015 ; 0,002] (n = 1081) |
| classe d’IMC | 31 | 1113 | -0,060 [-0,076 ; -0,039] (n = 1113) | -0,010 [-0,017 ; -0,002] (n = 1113) |
| classe d’IMC | 38 | 1120 | -0,035 [-0,048 ; -0,023] (n = 1120) | -0,004 [-0,010 ; 0,002] (n = 1120) |
| classe d’IMC | case_R | 245 | -0,021 [-0,042 ; -0,002] (n = 245) | -0,022 [-0,037 ; -0,011] (n = 245) |
| classe d’IMC | case_S | 232 | -0,035 [-0,055 ; -0,019] (n = 232) | -0,001 [-0,016 ; 0,012] (n = 232) |
| activité | sedentary | 2233 | -0,067 [-0,083 ; -0,052] (n = 2201) | -0,006 [-0,013 ; -0,000] (n = 2149) |
| activité | strength | 2672 | -0,055 [-0,068 ; -0,043] (n = 2641) | -0,013 [-0,018 ; -0,008] (n = 2564) |
| objectif | gain | 2207 | -0,125 [-0,142 ; -0,107] (n = 2207) | -0,010 [-0,017 ; -0,001] (n = 2207) |
| objectif | loss | 2698 | -0,031 [-0,039 ; -0,022] (n = 2635) | -0,010 [-0,013 ; -0,006] (n = 2506) |
| vitesse demandée | 0.0025 | 2772 | -0,123 [-0,142 ; -0,107] (n = 2709) | -0,012 [-0,019 ; -0,004] (n = 2580) |
| vitesse demandée | 0.005 | 825 | -0,029 [-0,040 ; -0,016] (n = 825) | -0,004 [-0,010 ; 0,002] (n = 825) |
| vitesse demandée | 0.01 | 1308 | -0,028 [-0,036 ; -0,019] (n = 1308) | -0,008 [-0,014 ; -0,004] (n = 1308) |
| décalage s | -150 | 965 | -0,064 [-0,084 ; -0,044] (n = 952) | -0,012 [-0,023 ; -0,004] (n = 927) |
| décalage s | -270 | 986 | -0,058 [-0,077 ; -0,035] (n = 967) | -0,010 [-0,018 ; -0,002] (n = 936) |
| décalage s | -400 | 1004 | -0,091 [-0,112 ; -0,069] (n = 977) | -0,017 [-0,027 ; -0,008] (n = 937) |
| décalage s | 150 | 965 | -0,063 [-0,084 ; -0,041] (n = 963) | -0,005 [-0,013 ; 0,005] (n = 945) |
| décalage s | 270 | 985 | -0,045 [-0,068 ; -0,026] (n = 983) | -0,009 [-0,017 ; -0,001] (n = 968) |
| part déclarée | 0.8 | 911 | -0,057 [-0,077 ; -0,038] (n = 903) | -0,011 [-0,020 ; -0,001] (n = 885) |
| part déclarée | 0.95 | 1987 | -0,062 [-0,078 ; -0,048] (n = 1959) | -0,014 [-0,019 ; -0,007] (n = 1911) |
| part déclarée | 1 | 2007 | -0,069 [-0,083 ; -0,053] (n = 1980) | -0,009 [-0,015 ; -0,003] (n = 1917) |
| comportement | R0 | 1627 | -0,042 [-0,055 ; -0,029] (n = 1604) | -0,003 [-0,008 ; 0,002] (n = 1560) |
| comportement | R15 | 1627 | -0,073 [-0,091 ; -0,054] (n = 1604) | -0,013 [-0,020 ; -0,005] (n = 1561) |
| comportement | R30 | 1651 | -0,087 [-0,103 ; -0,066] (n = 1634) | -0,024 [-0,034 ; -0,016] (n = 1592) |
| population | P10 | 4905 | -0,062 [-0,072 ; -0,055] (n = 4842) | -0,011 [-0,015 ; -0,007] (n = 4713) |
| quartile de h au premier plan J* (1,000 / 1,031 / 1,068) | Q1 | 1186 | -0,051 [-0,068 ; -0,034] (n = 1170) | -0,007 [-0,014 ; 0,002] (n = 1130) |
| quartile de h au premier plan J* (1,000 / 1,031 / 1,068) | Q2 | 1185 | -0,064 [-0,079 ; -0,045] (n = 1169) | -0,002 [-0,010 ; 0,005] (n = 1141) |
| quartile de h au premier plan J* (1,000 / 1,031 / 1,068) | Q3 | 1185 | -0,072 [-0,085 ; -0,048] (n = 1165) | -0,014 [-0,022 ; -0,007] (n = 1134) |
| quartile de h au premier plan J* (1,000 / 1,031 / 1,068) | Q4 | 1186 | -0,061 [-0,083 ; -0,038] (n = 1176) | -0,016 [-0,024 ; -0,009] (n = 1146) |
| quartile de h au premier plan J* (1,000 / 1,031 / 1,068) | sans plan J* | 163 | 0,000 [0,000 ; 0,000] (n = 162) | 0,000 [0,000 ; 0,000] (n = 162) |

### P20

Non-suiveurs : 7500 ; basculés (proposition acceptée) : 6028 ; sans proposition : 1472. Basculés avec un plan J* : 5461 (90,59 %), jour médian du premier plan J* 28, délai médian depuis la bascule 14 j. Contrôle continu (5.4) : 0 différence(s) sur 6028 utilisateurs.

**Basculés par comportement et objectif**

| Comportement | Objectif | Non-suiveurs | Basculés |
|---|---|---|---|
| R0 | perte | 1123 | 910 |
| R0 | maintien | 481 | 397 |
| R0 | prise | 896 | 717 |
| R15 | perte | 1104 | 872 |
| R15 | maintien | 465 | 377 |
| R15 | prise | 931 | 755 |
| R30 | perte | 1132 | 916 |
| R30 | maintien | 445 | 349 |
| R30 | prise | 923 | 735 |

**Basculés sans plan J* : critère de porte manquant à la dernière évaluation du repli**

| Critère(s) manquant(s) | Utilisateurs |
|---|---|
| (porte ouverte, plan en échec) | 567 |

**NI (J* − C), V3 P20 : GO**

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| NI R0 perte, sem. 5-12 | C 0,250 → J* 0,200 ; Δ -0,050 [-0,069 ; -0,030] (n = 897) ; J* meilleur | GO |
| NI R0 perte, sem. 13-24 | C 0,128 → J* 0,111 ; Δ -0,017 [-0,024 ; -0,010] (n = 860) ; J* meilleur | GO |
| NI R0 prise, sem. 5-12 | C 0,472 → J* 0,339 ; Δ -0,133 [-0,171 ; -0,103] (n = 717) ; J* meilleur | GO |
| NI R0 prise, sem. 13-24 | C 0,183 → J* 0,184 ; Δ 0,001 [-0,012 ; 0,013] (n = 717) | GO |
| NI R15 perte, sem. 5-12 | C 0,316 → J* 0,253 ; Δ -0,063 [-0,081 ; -0,044] (n = 858) ; J* meilleur | GO |
| NI R15 perte, sem. 13-24 | C 0,176 → J* 0,159 ; Δ -0,017 [-0,026 ; -0,007] (n = 829) ; J* meilleur | GO |
| NI R15 prise, sem. 5-12 | C 0,601 → J* 0,376 ; Δ -0,225 [-0,276 ; -0,185] (n = 755) ; J* meilleur | GO |
| NI R15 prise, sem. 13-24 | C 0,257 → J* 0,228 ; Δ -0,029 [-0,045 ; -0,013] (n = 755) ; J* meilleur | GO |
| NI R30 perte, sem. 5-12 | C 0,352 → J* 0,267 ; Δ -0,085 [-0,108 ; -0,065] (n = 903) ; J* meilleur | GO |
| NI R30 perte, sem. 13-24 | C 0,207 → J* 0,184 ; Δ -0,023 [-0,035 ; -0,010] (n = 868) ; J* meilleur | GO |
| NI R30 prise, sem. 5-12 | C 0,703 → J* 0,408 ; Δ -0,295 [-0,349 ; -0,248] (n = 735) ; J* meilleur | GO |
| NI R30 prise, sem. 13-24 | C 0,289 → J* 0,245 ; Δ -0,043 [-0,059 ; -0,028] (n = 735) ; J* meilleur | GO |

**Sécurité de J* (période après le premier plan J*), V3 P20 : GO**

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| S3-P [S] J* R0 | 0 violation(s) sur 36992 évaluations (1880 utilisateurs) ; exemptées : 0 | GO |
| S3-D [S] J* R0 | 135 / 9177 utilisateurs-blocs = 1,47 % [1,18 % ; 1,79 %] (1875 utilisateurs) | GO |
| S4-P [S] J* R0 | 0 jour(s) (1880 utilisateurs) | GO |
| S4-J [S] J* R0 | 3 / 1880 = 0,16 % [0,05 % ; 0,47 %] ; marge minimale -87,5 kcal/j, P1 126,8 | GO |
| S3-P [S] J* R15 | 0 violation(s) sur 35792 évaluations (1820 utilisateurs) ; exemptées : 0 | GO |
| S3-D [S] J* R15 | 167 / 8861 utilisateurs-blocs = 1,88 % [1,55 % ; 2,25 %] (1818 utilisateurs) | GO |
| S4-P [S] J* R15 | 0 jour(s) (1820 utilisateurs) | GO |
| S4-J [S] J* R15 | 1 / 1820 = 0,05 % [0,01 % ; 0,31 %] ; marge minimale -3,2 kcal/j, P1 145,6 | GO |
| S3-P [S] J* R30 | 0 violation(s) sur 34544 évaluations (1761 utilisateurs) ; exemptées : 0 | GO |
| S3-D [S] J* R30 | 158 / 8560 utilisateurs-blocs = 1,85 % [1,52 % ; 2,20 %] (1755 utilisateurs) | GO |
| S4-P [S] J* R30 | 0 jour(s) (1761 utilisateurs) | GO |
| S4-J [S] J* R30 | 2 / 1761 = 0,11 % [0,03 % ; 0,41 %] ; marge minimale -15,2 kcal/j, P1 173,8 | GO |

**S1 de J*, V3 P20 : GO**

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| S1 J* (R0 à R30) perte, sem. 5-12 | 0,890 [0,878 ; 0,904] (n = 2659 ; P10 / P90 -0,325 / 1,296) | GO |
| S1 J* (R0 à R30) perte, sem. 13-24 | 0,933 [0,925 ; 0,941] (n = 2563 ; P10 / P90 -0,251 / 1,173) | GO |
| S1 J* (R0 à R30) prise, sem. 5-12 | 0,977 [0,956 ; 0,998] (n = 2207 ; P10 / P90 0,301 / 1,818) | GO |
| S1 J* (R0 à R30) prise, sem. 13-24 | 1,000 [0,990 ; 1,011] (n = 2207 ; P10 / P90 0,597 / 1,475) | GO |

**V3 P20 : GO.**

**J* (A7.6), basculés avec un plan J***

| Comportement | Utilisateurs | h brut au premier plan : P5 / P25 / médiane / P75 / P95 | Borne basse / haute atteinte : utilisateurs (constructions) | Erreur de h, tous plans : médiane [P10 ; P90] | Écart de M à la vérité (unités de saisie), premier plan : médiane [P10 ; P90] | Variation hebdomadaire de M / h (kcal/j) : médiane [P10 ; P90] | Recalibrations / recalculs, médianes ; garde-fous J* | Échecs de construction ; constructions à plancher actif |
|---|---|---|---|---|---|---|---|---|
| R0 | 1880 | 0,951 / 0,980 / 0,999 / 1,019 / 1,050 | 0 / 0 (0 / 0) | -0,000 [-0,058 ; 0,056] (20323 plans) | 31,9 [-288,1 ; 354,2] ; |écart| moyen médian 66,3 | 39,8 [26,4 ; 56,4] | 10,0 / 1,0 ; G1 91, G2 102 | 2240 ; plancher actif 4445 |
| R15 | 1820 | 0,976 / 1,009 / 1,035 / 1,062 / 1,106 | 0 / 0 (0 / 0) | -0,000 [-0,079 ; 0,073] (20324 plans) | 24,0 [-272,1 ; 349,5] ; |écart| moyen médian 64,5 | 42,2 [28,8 ; 62,4] | 11,0 / 0,0 ; G1 70, G2 86 | 2726 ; plancher actif 4359 |
| R30 | 1761 | 1,000 / 1,043 / 1,069 / 1,101 / 1,145 | 0 / 0 (0 / 0) | -0,001 [-0,090 ; 0,085] (19830 plans) | 33,2 [-264,4 ; 360,3] ; |écart| moyen médian 64,6 | 43,2 [29,7 ; 61,6] | 11,0 / 0,0 ; G1 74, G2 90 | 2983 ; plancher actif 4643 |
| tous | 5461 | 0,965 / 1,000 / 1,030 / 1,066 / 1,122 | 0 / 0 (0 / 0) | -0,000 [-0,075 ; 0,071] (60477 plans) | 28,6 [-273,9 ; 354,4] ; |écart| moyen médian 65,2 | 41,7 [28,2 ; 60,3] | 11,0 / 1,0 ; G1 235, G2 278 | 7949 ; plancher actif 13447 |

**Échecs de construction J* par raison (plan laissé en place)**

| Type : raison | Constructions |
|---|---|
| recal_jstar:no_feasible_speed | 7166 |
| recal_jstar:target_not_above_current | 149 |
| replan_periodic_jstar:no_feasible_speed | 587 |
| replan_periodic_jstar:target_not_above_current | 47 |

**Bras C, critères (rapportés, sans verdict ; référence : jour de la cible choisie)**

| Critère | Valeur [IC 95 %] | Statut |
|---|---|---|
| S1 C perte, sem. 5-12 | 0,773 [0,755 ; 0,790] (n = 2667 ; P10 / P90 -0,471 / 1,209) | rapporté |
| S1 C perte, sem. 13-24 | 0,909 [0,899 ; 0,918] (n = 2625 ; P10 / P90 -0,234 / 1,182) | rapporté |
| S1 C prise, sem. 5-12 | 1,442 [1,411 ; 1,469] (n = 2207 ; P10 / P90 0,560 / 2,862) | rapporté |
| S1 C prise, sem. 13-24 | 0,985 [0,973 ; 0,996] (n = 2207 ; P10 / P90 0,521 / 1,555) | rapporté |
| S3-P [S] C R0 | 0 violation(s) sur 42164 évaluations (2024 utilisateurs) ; exemptées : 2364 | rapporté |
| S3-D [S] C R0 | 317 / 10120 utilisateurs-blocs = 3,13 % [2,71 % ; 3,59 %] (2024 utilisateurs) | rapporté |
| S4-P [S] C R0 | 0 jour(s) (2024 utilisateurs) | rapporté |
| S4-J [S] C R0 | 1 / 2024 = 0,05 % [0,01 % ; 0,28 %] ; marge minimale -78,4 kcal/j, P1 110,9 | rapporté |
| S3-P [S] C R15 | 0 violation(s) sur 41500 évaluations (2004 utilisateurs) ; exemptées : 2588 | rapporté |
| S3-D [S] C R15 | 398 / 10020 utilisateurs-blocs = 3,97 % [3,50 % ; 4,48 %] (2004 utilisateurs) | rapporté |
| S4-P [S] C R15 | 0 jour(s) (2004 utilisateurs) | rapporté |
| S4-J [S] C R15 | 0 / 2004 = 0,00 % [0,00 % ; 0,19 %] ; marge minimale 7,9 kcal/j, P1 142,8 | rapporté |
| S3-P [S] C R30 | 0 violation(s) sur 41336 évaluations (2000 utilisateurs) ; exemptées : 2664 | rapporté |
| S3-D [S] C R30 | 538 / 10000 utilisateurs-blocs = 5,38 % [4,81 % ; 6,02 %] (2000 utilisateurs) | rapporté |
| S4-P [S] C R30 | 0 jour(s) (2000 utilisateurs) | rapporté |
| S4-J [S] C R30 | 2 / 2000 = 0,10 % [0,03 % ; 0,36 %] ; marge minimale -32,3 kcal/j, P1 161,0 | rapporté |
| S3-P [S] C tous | 0 violation(s) sur 125000 évaluations (6028 utilisateurs) ; exemptées : 7616 | rapporté |
| S3-D [S] C tous | 1253 / 30140 utilisateurs-blocs = 4,16 % [3,87 % ; 4,46 %] (6028 utilisateurs) | rapporté |
| S4-P [S] C tous | 0 jour(s) (6028 utilisateurs) | rapporté |
| S4-J [S] C tous | 3 / 6028 = 0,05 % [0,02 % ; 0,15 %] ; marge minimale -78,4 kcal/j, P1 131,1 | rapporté |

T_c remplacées par le plancher × 1,10 : 2072 / 6028.

**S2 (rapporté), basculés**

| Bras | Objectif | Fenêtre | Blocs | Médiane | P90 | P90 / médiane | P90 − médiane |
|---|---|---|---|---|---|---|---|
| C | perte | sem. 5-12 | 5323 | 0,773 | 1,209 | 1,564 | 0,436 |
| C | perte | sem. 13-24 | 7656 | 0,909 | 1,182 | 1,300 | 0,272 |
| C | prise | sem. 5-12 | 4414 | 1,442 | 2,862 | 1,985 | 1,420 |
| C | prise | sem. 13-24 | 6621 | 0,985 | 1,555 | 1,579 | 0,571 |
| JS | perte | sem. 5-12 | 5285 | 0,890 | 1,296 | 1,456 | 0,405 |
| JS | perte | sem. 13-24 | 7499 | 0,933 | 1,173 | 1,257 | 0,240 |
| JS | prise | sem. 5-12 | 4414 | 0,977 | 1,818 | 1,861 | 0,841 |
| JS | prise | sem. 13-24 | 6621 | 1,000 | 1,475 | 1,476 | 0,476 |

**S7 (rapporté) : maintien dans la zone à 8 semaines, tous les non-suiveurs en maintien**

| Bras | Dans la zone (cible) | Centrée sur le poids vrai de départ |
|---|---|---|
| C | 335 / 1391 = 24,08 % [21,91 % ; 26,40 %] | 328 / 1391 |
| JS | 475 / 1391 = 34,15 % [31,70 % ; 36,68 %] | 464 / 1391 |

**Garde-fous et IMC vrai, basculés**

| Bras | n | G1 : utilisateurs (événements) | G2 : utilisateurs (événements) | Événements (J* : chemin J* ; C : tous) | Échecs | Fins sous IMC 20 vrai | IMC vrai minimal : min ; P1 ; P5 |
|---|---|---|---|---|---|---|---|
| C | 6028 | 227 (227) | 353 (377) | G1 227, G2 377 | 0 | 109 = 1,81 % [1,50 % ; 2,18 %] | 18,237 ; P1 19,686 ; P5 20,019 |
| JS | 6028 | 265 (265) | 316 (332) | G1 235, G2 278 | 0 | 142 = 2,36 % [2,00 % ; 2,77 %] | 18,237 ; P1 19,669 ; P5 19,978 |

Blocs exclus (changement d'objectif) : C 153, J* 177.

**Stratification de Δ (J* − C), perte et prise ensemble, basculés**

| Variable | Valeur | Utilisateurs | Δ sem. 5-12 [IC 95 %] | Δ sem. 13-24 [IC 95 %] |
|---|---|---|---|---|
| sexe | female | 2692 | -0,103 [-0,120 ; -0,089] (n = 2665) | -0,020 [-0,027 ; -0,012] (n = 2621) |
| sexe | male | 2213 | -0,128 [-0,145 ; -0,111] (n = 2200) | -0,019 [-0,027 ; -0,012] (n = 2143) |
| classe d’IMC | 21 | 1114 | -0,247 [-0,293 ; -0,201] (n = 1074) | -0,005 [-0,027 ; 0,013] (n = 973) |
| classe d’IMC | 26 | 1081 | -0,140 [-0,167 ; -0,113] (n = 1081) | -0,005 [-0,017 ; 0,005] (n = 1081) |
| classe d’IMC | 31 | 1113 | -0,100 [-0,121 ; -0,081] (n = 1113) | -0,020 [-0,030 ; -0,011] (n = 1113) |
| classe d’IMC | 38 | 1120 | -0,078 [-0,094 ; -0,063] (n = 1120) | -0,019 [-0,025 ; -0,012] (n = 1120) |
| classe d’IMC | case_R | 245 | -0,058 [-0,085 ; -0,037] (n = 245) | -0,041 [-0,063 ; -0,024] (n = 245) |
| classe d’IMC | case_S | 232 | -0,037 [-0,062 ; -0,015] (n = 232) | -0,025 [-0,036 ; -0,005] (n = 232) |
| activité | sedentary | 2233 | -0,137 [-0,157 ; -0,112] (n = 2215) | -0,019 [-0,026 ; -0,010] (n = 2170) |
| activité | strength | 2672 | -0,109 [-0,121 ; -0,095] (n = 2650) | -0,020 [-0,027 ; -0,015] (n = 2594) |
| objectif | gain | 2207 | -0,210 [-0,234 ; -0,191] (n = 2207) | -0,022 [-0,030 ; -0,013] (n = 2207) |
| objectif | loss | 2698 | -0,065 [-0,077 ; -0,054] (n = 2658) | -0,020 [-0,025 ; -0,014] (n = 2557) |
| vitesse demandée | 0.0025 | 2772 | -0,222 [-0,245 ; -0,199] (n = 2732) | -0,024 [-0,032 ; -0,015] (n = 2631) |
| vitesse demandée | 0.005 | 825 | -0,059 [-0,073 ; -0,040] (n = 825) | -0,009 [-0,017 ; -0,003] (n = 825) |
| vitesse demandée | 0.01 | 1308 | -0,052 [-0,064 ; -0,040] (n = 1308) | -0,021 [-0,028 ; -0,016] (n = 1308) |
| décalage s | -150 | 965 | -0,138 [-0,166 ; -0,113] (n = 957) | -0,011 [-0,024 ; 0,000] (n = 934) |
| décalage s | -270 | 986 | -0,127 [-0,161 ; -0,102] (n = 973) | -0,023 [-0,035 ; -0,011] (n = 948) |
| décalage s | -400 | 1004 | -0,156 [-0,193 ; -0,126] (n = 985) | -0,029 [-0,041 ; -0,017] (n = 954) |
| décalage s | 150 | 965 | -0,086 [-0,117 ; -0,064] (n = 965) | -0,016 [-0,027 ; -0,003] (n = 953) |
| décalage s | 270 | 985 | -0,068 [-0,094 ; -0,046] (n = 985) | -0,017 [-0,028 ; -0,007] (n = 975) |
| part déclarée | 0.8 | 911 | -0,104 [-0,127 ; -0,077] (n = 907) | -0,021 [-0,032 ; -0,008] (n = 893) |
| part déclarée | 0.95 | 1987 | -0,121 [-0,141 ; -0,100] (n = 1966) | -0,018 [-0,027 ; -0,010] (n = 1928) |
| part déclarée | 1 | 2007 | -0,117 [-0,136 ; -0,098] (n = 1992) | -0,020 [-0,029 ; -0,011] (n = 1943) |
| comportement | R0 | 1627 | -0,076 [-0,096 ; -0,056] (n = 1614) | -0,009 [-0,016 ; -0,002] (n = 1577) |
| comportement | R15 | 1627 | -0,130 [-0,150 ; -0,105] (n = 1613) | -0,023 [-0,031 ; -0,014] (n = 1584) |
| comportement | R30 | 1651 | -0,162 [-0,189 ; -0,134] (n = 1638) | -0,035 [-0,045 ; -0,023] (n = 1603) |
| population | P20 | 4905 | -0,116 [-0,128 ; -0,103] (n = 4865) | -0,019 [-0,024 ; -0,014] (n = 4764) |
| quartile de h au premier plan J* (1,000 / 1,030 / 1,067) | Q1 | 1109 | -0,099 [-0,121 ; -0,076] (n = 1101) | -0,015 [-0,025 ; -0,006] (n = 1072) |
| quartile de h au premier plan J* (1,000 / 1,030 / 1,067) | Q2 | 1109 | -0,087 [-0,110 ; -0,064] (n = 1098) | -0,011 [-0,022 ; -0,003] (n = 1078) |
| quartile de h au premier plan J* (1,000 / 1,030 / 1,067) | Q3 | 1109 | -0,110 [-0,131 ; -0,090] (n = 1096) | -0,022 [-0,032 ; -0,013] (n = 1068) |
| quartile de h au premier plan J* (1,000 / 1,030 / 1,067) | Q4 | 1109 | -0,097 [-0,119 ; -0,078] (n = 1102) | -0,020 [-0,030 ; -0,012] (n = 1078) |
| quartile de h au premier plan J* (1,000 / 1,030 / 1,067) | sans plan J* | 469 | 0,000 [0,000 ; 0,000] (n = 468) | 0,000 [0,000 ; 0,000] (n = 468) |

Cellules où J* fait mieux que C (borne haute < 0) : NI R0 perte, sem. 5-12 ; NI R0 perte, sem. 13-24 ; NI R0 prise, sem. 5-12 ; NI R15 perte, sem. 5-12 ; NI R15 prise, sem. 5-12 ; NI R30 perte, sem. 5-12 ; NI R30 perte, sem. 13-24 ; NI R30 prise, sem. 5-12 ; NI R30 prise, sem. 13-24 ; NI R0 perte, sem. 5-12 ; NI R0 perte, sem. 13-24 ; NI R0 prise, sem. 5-12 ; NI R15 perte, sem. 5-12 ; NI R15 perte, sem. 13-24 ; NI R15 prise, sem. 5-12 ; NI R30 perte, sem. 5-12 ; NI R30 perte, sem. 13-24 ; NI R30 prise, sem. 5-12 ; NI R30 prise, sem. 13-24 ; NI R0 perte, sem. 5-12 ; NI R0 perte, sem. 13-24 ; NI R0 prise, sem. 5-12 ; NI R15 perte, sem. 5-12 ; NI R15 perte, sem. 13-24 ; NI R15 prise, sem. 5-12 ; NI R15 prise, sem. 13-24 ; NI R30 perte, sem. 5-12 ; NI R30 perte, sem. 13-24 ; NI R30 prise, sem. 5-12 ; NI R30 prise, sem. 13-24.

**Étape V3 (v3) : NO-GO.**

## 7. Décision de A7.5

V1 GO, V2 GO, V3 NO-GO, V4 non exécutée → J* NON RETENU.

## 9. Temps de calcul (lancements)

```
2026-09-27T17:30:43+02:00 start repro2r subs=16
2026-09-27T17:33:41+02:00 end repro2r wall_s=178
2026-09-27T17:35:53+02:00 start fallback2d shards=16
2026-09-27T17:37:38+02:00 end fallback2d wall_s=105 failed_shards=0
2026-09-27T17:37:38+02:00 start pairing2d parts=16
2026-09-27T17:38:40+02:00 end pairing2d wall_s=61
2026-09-27T17:38:42+02:00 start pilot2d shards=16
2026-09-27T17:41:04+02:00 end pilot2d wall_s=142 failed_shards=0
2026-09-27T17:41:50+02:00 start v1 shards=16
2026-09-27T18:45:24+02:00 end v1 wall_s=3814 failed_shards=0
2026-09-27T18:48:55+02:00 start v2 shards=16
2026-09-27T20:11:42+02:00 end v2 wall_s=4967 failed_shards=0
2026-09-27T20:11:43+02:00 start v2h4 shards=16
2026-09-27T20:16:39+02:00 end v2h4 wall_s=297 failed_shards=0
2026-09-27T20:27:47+02:00 start v3 shards=16
2026-09-28T00:29:39+02:00 end v3 wall_s=14512 failed_shards=0
2026-09-28T00:40:13+02:00 V3 NO-GO (P05, S4-J R0 lower bound > 1 %): V4 not launched (s10.3)
```

