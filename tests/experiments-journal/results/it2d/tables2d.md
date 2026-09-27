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

## 7. Décision de A7.5

V1 GO, V2 non exécutée, V3 non exécutée, V4 non exécutée → J* NON RETENU.

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
```

