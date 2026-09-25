# Itération 2a : tableaux reconstruits depuis les bruts

Script : `tests/experiments-journal/it2a/tables2a.experiment.ts`. Bootstrap : 2000 tirages d’utilisateurs, graine 37000001. Ratio : pente du poids vrai sur un bloc de 4 semaines / (vitesse du plan actif × poids vrai au début du bloc).

## 5.1 Monde idéal : décomposition 2 × 2

500 utilisateurs (perte 194, prise 150, maintien 156), 2000 lignes utilisateur × bras. Hall nominal, pesées sans bruit, u = 0, suiveurs parfaits, graines 2,1·10⁹.

### Médianes par fenêtre

| Bras | Objectif | Fenêtre | Blocs (utilisateurs) | Médiane [IC 95 %] | P10 / P90 |
|---|---|---|---|---|---|
| S0 témoin (équilibre + poids j42) | perte | semaines 5 à 12 | 388 (194) | 0,696 [0,684 ; 0,704] | 0,509 / 0,778 |
| S0 témoin (équilibre + poids j42) | perte | semaines 13 à 24 | 582 (194) | 0,628 [0,616 ; 0,637] | 0,372 / 0,718 |
| S0 témoin (équilibre + poids j42) | perte | semaines 5 à 24 | 970 (194) | 0,654 [0,644 ; 0,664] | 0,445 / 0,747 |
| S0 témoin (équilibre + poids j42) | prise | semaines 5 à 12 | 300 (150) | 0,780 [0,760 ; 0,793] | 0,651 / 0,891 |
| S0 témoin (équilibre + poids j42) | prise | semaines 13 à 24 | 450 (150) | 0,669 [0,662 ; 0,683] | 0,561 / 0,757 |
| S0 témoin (équilibre + poids j42) | prise | semaines 5 à 24 | 750 (150) | 0,703 [0,693 ; 0,716] | 0,583 / 0,825 |
| CS (état actuel seul) | perte | semaines 5 à 12 | 388 (194) | 1,044 [1,038 ; 1,051] | 0,978 / 1,131 |
| CS (état actuel seul) | perte | semaines 13 à 24 | 582 (194) | 0,999 [0,995 ; 1,003] | 0,872 / 1,114 |
| CS (état actuel seul) | perte | semaines 5 à 24 | 970 (194) | 1,015 [1,010 ; 1,020] | 0,907 / 1,125 |
| CS (état actuel seul) | prise | semaines 5 à 12 | 300 (150) | 1,085 [1,073 ; 1,090] | 1,008 / 1,175 |
| CS (état actuel seul) | prise | semaines 13 à 24 | 450 (150) | 0,959 [0,955 ; 0,962] | 0,864 / 1,033 |
| CS (état actuel seul) | prise | semaines 5 à 24 | 750 (150) | 1,013 [1,009 ; 1,018] | 0,887 / 1,127 |
| ST (masse tissulaire seule) | perte | semaines 5 à 12 | 388 (194) | 0,926 [0,909 ; 0,941] | 0,689 / 1,031 |
| ST (masse tissulaire seule) | perte | semaines 13 à 24 | 582 (194) | 0,832 [0,809 ; 0,855] | 0,434 / 0,953 |
| ST (masse tissulaire seule) | perte | semaines 5 à 24 | 970 (194) | 0,871 [0,855 ; 0,887] | 0,555 / 0,995 |
| ST (masse tissulaire seule) | prise | semaines 5 à 12 | 300 (150) | 0,978 [0,972 ; 0,985] | 0,901 / 1,072 |
| ST (masse tissulaire seule) | prise | semaines 13 à 24 | 450 (150) | 0,868 [0,858 ; 0,878] | 0,729 / 0,951 |
| ST (masse tissulaire seule) | prise | semaines 5 à 24 | 750 (150) | 0,919 [0,907 ; 0,928] | 0,772 / 1,020 |
| FX correctif (les deux) | perte | semaines 5 à 12 | 388 (194) | 1,016 [1,010 ; 1,020] | 0,936 / 1,089 |
| FX correctif (les deux) | perte | semaines 13 à 24 | 582 (194) | 0,981 [0,972 ; 0,985] | 0,856 / 1,016 |
| FX correctif (les deux) | perte | semaines 5 à 24 | 970 (194) | 0,993 [0,989 ; 0,997] | 0,866 / 1,052 |
| FX correctif (les deux) | prise | semaines 5 à 12 | 300 (150) | 1,077 [1,067 ; 1,087] | 0,996 / 1,167 |
| FX correctif (les deux) | prise | semaines 13 à 24 | 450 (150) | 0,966 [0,962 ; 0,970] | 0,874 / 1,052 |
| FX correctif (les deux) | prise | semaines 5 à 24 | 750 (150) | 1,022 [1,013 ; 1,028] | 0,894 / 1,120 |

### Médianes par bloc de 4 semaines

| Bras | Objectif | Semaines 5-8 | 9-12 | 13-16 | 17-20 | 21-24 |
|---|---|---|---|---|---|---|
| S0 témoin (équilibre + poids j42) | perte | 0,715 [0,704 ; 0,725] | 0,673 [0,666 ; 0,682] | 0,647 [0,640 ; 0,664] | 0,628 [0,616 ; 0,636] | 0,594 [0,572 ; 0,605] |
| S0 témoin (équilibre + poids j42) | prise | 0,803 [0,782 ; 0,824] | 0,756 [0,748 ; 0,770] | 0,723 [0,709 ; 0,732] | 0,663 [0,653 ; 0,673] | 0,641 [0,623 ; 0,646] |
| CS (état actuel seul) | perte | 1,068 [1,059 ; 1,076] | 1,029 [1,025 ; 1,033] | 1,015 [1,009 ; 1,020] | 0,994 [0,988 ; 0,999] | 0,989 [0,982 ; 0,995] |
| CS (état actuel seul) | prise | 1,119 [1,101 ; 1,131] | 1,061 [1,054 ; 1,069] | 1,019 [1,015 ; 1,022] | 0,941 [0,931 ; 0,951] | 0,902 [0,894 ; 0,912] |
| ST (masse tissulaire seule) | perte | 0,952 [0,934 ; 0,968] | 0,907 [0,884 ; 0,923] | 0,869 [0,851 ; 0,893] | 0,832 [0,810 ; 0,857] | 0,765 [0,736 ; 0,800] |
| ST (masse tissulaire seule) | prise | 1,012 [0,999 ; 1,026] | 0,966 [0,962 ; 0,971] | 0,929 [0,919 ; 0,937] | 0,858 [0,846 ; 0,869] | 0,828 [0,811 ; 0,842] |
| FX correctif (les deux) | perte | 1,027 [1,020 ; 1,033] | 1,008 [1,005 ; 1,010] | 0,993 [0,989 ; 0,996] | 0,972 [0,965 ; 0,979] | 0,953 [0,931 ; 0,976] |
| FX correctif (les deux) | prise | 1,103 [1,086 ; 1,119] | 1,060 [1,055 ; 1,069] | 1,026 [1,022 ; 1,031] | 0,946 [0,936 ; 0,955] | 0,909 [0,900 ; 0,915] |

### Différences appariées de médiane (bras − S0)

| Bras | Objectif | Fenêtre | Δ médiane [IC 95 %] |
|---|---|---|---|
| CS | perte | semaines 5 à 12 | 0,348 [0,339 ; 0,360] |
| CS | perte | semaines 13 à 24 | 0,371 [0,361 ; 0,383] |
| CS | perte | semaines 5 à 24 | 0,360 [0,350 ; 0,370] |
| CS | prise | semaines 5 à 12 | 0,305 [0,292 ; 0,319] |
| CS | prise | semaines 13 à 24 | 0,290 [0,278 ; 0,295] |
| CS | prise | semaines 5 à 24 | 0,311 [0,300 ; 0,318] |
| ST | perte | semaines 5 à 12 | 0,231 [0,217 ; 0,244] |
| ST | perte | semaines 13 à 24 | 0,204 [0,189 ; 0,221] |
| ST | perte | semaines 5 à 24 | 0,217 [0,205 ; 0,229] |
| ST | prise | semaines 5 à 12 | 0,198 [0,189 ; 0,214] |
| ST | prise | semaines 13 à 24 | 0,200 [0,188 ; 0,207] |
| ST | prise | semaines 5 à 24 | 0,216 [0,205 ; 0,224] |
| FX | perte | semaines 5 à 12 | 0,320 [0,311 ; 0,331] |
| FX | perte | semaines 13 à 24 | 0,353 [0,345 ; 0,361] |
| FX | perte | semaines 5 à 24 | 0,339 [0,330 ; 0,347] |
| FX | prise | semaines 5 à 12 | 0,297 [0,286 ; 0,312] |
| FX | prise | semaines 13 à 24 | 0,297 [0,285 ; 0,302] |
| FX | prise | semaines 5 à 24 | 0,319 [0,309 ; 0,326] |

**Arrêt 2 (témoin S0 contre le rapport 36, semaines 5 à 24)** : perte 0,654 (attendu 0,65 ± 0,03), prise 0,703 (attendu 0,70 ± 0,03) : reproduit.

### Verdict A3.1 (correctif FX)

| Critère | Objectif | Unité | Médiane [IC 95 %] | Bande | IC dans la bande | Médiane seule dans la bande |
|---|---|---|---|---|---|---|
| fenêtre | perte | w1 | 1,016 [1,010 ; 1,020] | [0,950 ; 1,050] | oui | oui |
| fenêtre | perte | w2 | 0,981 [0,972 ; 0,985] | [0,950 ; 1,050] | oui | oui |
| bloc | perte | b1 | 1,027 [1,020 ; 1,033] | [0,900 ; 1,100] | oui | oui |
| bloc | perte | b2 | 1,008 [1,005 ; 1,010] | [0,900 ; 1,100] | oui | oui |
| bloc | perte | b3 | 0,993 [0,989 ; 0,996] | [0,900 ; 1,100] | oui | oui |
| bloc | perte | b4 | 0,972 [0,965 ; 0,979] | [0,900 ; 1,100] | oui | oui |
| bloc | perte | b5 | 0,953 [0,931 ; 0,976] | [0,900 ; 1,100] | oui | oui |
| fenêtre | prise | w1 | 1,077 [1,067 ; 1,087] | [0,950 ; 1,050] | **non** | non |
| fenêtre | prise | w2 | 0,966 [0,962 ; 0,970] | [0,950 ; 1,050] | oui | oui |
| bloc | prise | b1 | 1,103 [1,086 ; 1,119] | [0,900 ; 1,100] | **non** | non |
| bloc | prise | b2 | 1,060 [1,055 ; 1,069] | [0,900 ; 1,100] | oui | oui |
| bloc | prise | b3 | 1,026 [1,022 ; 1,031] | [0,900 ; 1,100] | oui | oui |
| bloc | prise | b4 | 0,946 [0,936 ; 0,955] | [0,900 ; 1,100] | oui | oui |
| bloc | prise | b5 | 0,909 [0,900 ; 0,915] | [0,900 ; 1,100] | **non** | oui |

**A3.1 : ÉCHOUÉ.**

### Autres constats

| Bras | Recalibrations appliquées (médiane) | Utilisateurs avec échec de plan | Échecs `no_feasible_speed` | Plans (état actuel) | Écart poids modélisé − tendance, médiane [P10 ; P90] (kg) | Écart modélisé − vrai, médiane [P10 ; P90] (kg) |
|---|---|---|---|---|---|---|
| S0 | 8,0 | 8 | 48 | — | — | — |
| CS | 8,0 | 11 | 47 | 3999 (sans état : 0) | -0,006 [-0,932 ; 0,347] | 0,004 [-0,052 ; 0,072] |
| ST | 8,0 | 8 | 52 | — | — | — |
| FX | 8,0 | 10 | 51 | 4008 (sans état : 0) | -0,006 [-0,931 ; 0,350] | 0,003 [-0,048 ; 0,067] |

### Strates (médiane du ratio, S0 → FX)

| Strate | Valeur | Objectif | Utilisateurs | S0 sem. 5-12 | S0 sem. 13-24 | FX sem. 5-12 | FX sem. 13-24 |
|---|---|---|---|---|---|---|---|
| sexe | female | perte | 121 | 0,677 | 0,605 | 1,016 | 0,966 |
| sexe | female | prise | 67 | 0,735 | 0,647 | 1,075 | 0,961 |
| sexe | male | perte | 73 | 0,743 | 0,683 | 1,014 | 0,986 |
| sexe | male | prise | 83 | 0,803 | 0,695 | 1,079 | 0,968 |
| classe d’IMC | 21 | perte | 44 | 0,681 | 0,573 | 1,068 | 0,917 |
| classe d’IMC | 21 | prise | 35 | 0,775 | 0,599 | 1,115 | 0,898 |
| classe d’IMC | 26 | perte | 32 | 0,618 | 0,590 | 0,976 | 0,969 |
| classe d’IMC | 26 | prise | 41 | 0,773 | 0,661 | 1,088 | 0,966 |
| classe d’IMC | 31 | perte | 40 | 0,719 | 0,650 | 1,014 | 0,990 |
| classe d’IMC | 31 | prise | 39 | 0,754 | 0,673 | 1,057 | 0,968 |
| classe d’IMC | 38 | perte | 38 | 0,729 | 0,691 | 1,013 | 0,992 |
| classe d’IMC | 38 | prise | 35 | 0,808 | 0,728 | 1,067 | 0,979 |
| classe d’IMC | case_R | perte | 20 | 0,672 | 0,600 | 1,009 | 0,924 |
| classe d’IMC | case_S | perte | 20 | 0,682 | 0,594 | 1,020 | 0,915 |
| activité | sedentary | perte | 81 | 0,704 | 0,642 | 1,011 | 0,984 |
| activité | sedentary | prise | 77 | 0,774 | 0,686 | 1,066 | 0,969 |
| activité | strength | perte | 113 | 0,687 | 0,617 | 1,017 | 0,972 |
| activité | strength | prise | 73 | 0,785 | 0,654 | 1,090 | 0,961 |
| vitesse demandée | 0.0025 | perte | 44 | 0,681 | 0,573 | 1,068 | 0,917 |
| vitesse demandée | 0.0025 | prise | 150 | 0,780 | 0,669 | 1,077 | 0,966 |
| vitesse demandée | 0.005 | perte | 53 | 0,722 | 0,665 | 1,029 | 1,002 |
| vitesse demandée | 0.01 | perte | 97 | 0,677 | 0,616 | 1,006 | 0,974 |

### Diagnostic de l’échec de A3.1 (sans critère)

Script : `it2a/diag2a.experiment.ts`. Utilisateurs en perte et en prise de ideal2a, rejoués avec les mêmes graines. Chaque plan de recalibration FX est reconstruit depuis le magasin tronqué au jour D : 2785 / 2785 cibles identiques au bit près à celles de la simulation.

**Cadence des recalibrations et âge du plan actif** (médianes par utilisateur-bloc)

| Bras | Objectif | Bloc | Ratio | Âge moyen du plan actif (j) | Plans démarrés dans le bloc |
|---|---|---|---|---|---|
| S0 | perte | 1 | 0,715 | 3,0 | 4,0 |
| S0 | perte | 2 | 0,673 | 10,0 | 1,0 |
| S0 | perte | 3 | 0,647 | 13,5 | 1,0 |
| S0 | perte | 4 | 0,628 | 41,5 | 0,0 |
| S0 | perte | 5 | 0,594 | 34,5 | 1,0 |
| S0 | prise | 1 | 0,803 | 3,0 | 4,0 |
| S0 | prise | 2 | 0,756 | 10,0 | 1,0 |
| S0 | prise | 3 | 0,723 | 13,5 | 1,0 |
| S0 | prise | 4 | 0,663 | 41,5 | 0,0 |
| S0 | prise | 5 | 0,641 | 69,5 | 0,0 |
| FX | perte | 1 | 1,027 | 3,0 | 4,0 |
| FX | perte | 2 | 1,008 | 10,0 | 1,0 |
| FX | perte | 3 | 0,993 | 13,5 | 1,0 |
| FX | perte | 4 | 0,972 | 41,5 | 0,0 |
| FX | perte | 5 | 0,953 | 34,5 | 0,0 |
| FX | prise | 1 | 1,103 | 3,0 | 4,0 |
| FX | prise | 2 | 1,060 | 10,0 | 1,0 |
| FX | prise | 3 | 1,026 | 13,5 | 1,0 |
| FX | prise | 4 | 0,946 | 41,5 | 0,0 |
| FX | prise | 5 | 0,909 | 62,5 | 0,0 |

**Ratio du monde sous FX selon l’âge moyen du plan actif sur le bloc** (tous blocs)

| Objectif | Âge (j) | Utilisateurs-blocs | Médiane [IC 95 %] |
|---|---|---|---|
| perte | 0 à 7 | 187 | 1,029 [1,021 ; 1,034] |
| perte | 7 à 14 | 395 | 0,999 [0,997 ; 1,003] |
| perte | 14 à 21 | 90 | 0,991 [0,988 ; 1,001] |
| perte | 21 à 28 | 31 | 0,979 [0,958 ; 0,989] |
| perte | 28 à 42 | 122 | 0,974 [0,967 ; 0,981] |
| perte | 42 à … | 145 | 0,884 [0,853 ; 0,899] |
| prise | 0 à 7 | 151 | 1,103 [1,086 ; 1,117] |
| prise | 7 à 14 | 247 | 1,050 [1,040 ; 1,056] |
| prise | 14 à 21 | 62 | 1,013 [1,004 ; 1,020] |
| prise | 21 à 28 | 19 | 1,053 [1,051 ; 1,063] |
| prise | 28 à 42 | 105 | 0,964 [0,961 ; 0,969] |
| prise | 42 à … | 166 | 0,900 [0,898 ; 0,907] |

**Trajectoire propre du modèle du solveur FX** (départ : corps modélisé du jour D, apport constant du plan ; pente MCO / (vitesse appliquée × poids de référence)), médianes sur les plans de recalibration

| Objectif | Plans | Jours 0-7 | 0-28 | 7-35 | 0-42 | 28-42 | 42-70 | Monde, 28 premiers jours des plans de ≥ 28 j (n) | Durée de vie du plan (j) | AT de départ (kcal/j) | Glycogène − base (kg) | LEC − base (kg) | Cible − cible précédente (kcal/j) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| perte | 1595 | 1,014 | 0,997 | 0,984 | 0,984 | 0,953 | 0,913 | 0,995 (305) | 7,0 | -103,6 | -0,138 | -0,634 | 0,0 |
| prise | 1190 | 1,093 | 1,028 | 1,005 | 1,007 | 0,968 | 0,923 | 1,035 (189) | 7,0 | 44,6 | 0,043 | 0,239 | 10,5 |

## 5.3 Premier plan (hypercube, sans seuil)

1000 profils. Pour chaque vitesse demandée : écart de cible FX − S0 sur les plans valides dans les deux bras, part des plans où le plancher ralentit la vitesse (rejet `below_hard_floor`), part sans vitesse faisable.

| Objectif | Vitesse demandée (%/sem.) | Profils | Δ cible médiane [P10 ; P90] (kcal/j) | Ralentis par le plancher S0 → FX | Sans vitesse faisable S0 → FX | Vitesse retenue plus lente sous FX |
|---|---|---|---|---|---|---|
| perte | 0,20 | 388 | -47 [-76 ; -31] | 0,00 % → 0,00 % | 0,00 % → 0,00 % | 0 |
| perte | 0,25 | 388 | -61 [-96 ; -39] | 0,00 % → 0,00 % | 0,00 % → 0,00 % | 0 |
| perte | 0,30 | 388 | -72 [-114 ; -39] | 0,00 % → 0,00 % | 0,00 % → 0,00 % | 0 |
| perte | 0,35 | 388 | -84 [-133 ; -39] | 0,00 % → 0,00 % | 0,00 % → 0,00 % | 0 |
| perte | 0,40 | 388 | -97 [-153 ; -39] | 0,00 % → 0,00 % | 0,00 % → 0,00 % | 0 |
| perte | 0,45 | 388 | -108 [-173 ; -39] | 0,00 % → 0,00 % | 0,00 % → 0,00 % | 0 |
| perte | 0,50 | 388 | -120 [-192 ; -39] | 0,00 % → 0,00 % | 0,00 % → 0,00 % | 0 |
| perte | 0,55 | 388 | -132 [-212 ; -39] | 0,00 % → 0,00 % | 0,00 % → 0,00 % | 0 |
| perte | 0,60 | 388 | -144 [-232 ; -39] | 0,00 % → 0,00 % | 0,00 % → 0,00 % | 0 |
| perte | 0,65 | 388 | -155 [-251 ; -39] | 0,00 % → 0,00 % | 0,00 % → 0,00 % | 0 |
| perte | 0,70 | 388 | -168 [-272 ; -39] | 0,00 % → 0,77 % | 0,00 % → 0,00 % | 3 |
| perte | 0,75 | 388 | -180 [-288 ; -39] | 0,00 % → 3,61 % | 0,00 % → 0,00 % | 14 |
| perte | 0,80 | 388 | -192 [-299 ; -39] | 0,00 % → 8,25 % | 0,00 % → 0,00 % | 32 |
| perte | 0,85 | 388 | -201 [-312 ; -39] | 0,00 % → 15,72 % | 0,00 % → 0,00 % | 61 |
| perte | 0,90 | 388 | -205 [-318 ; -39] | 0,00 % → 22,42 % | 0,00 % → 0,00 % | 87 |
| perte | 0,95 | 388 | -216 [-310 ; -39] | 0,00 % → 29,38 % | 0,00 % → 0,00 % | 114 |
| perte | 1,00 | 388 | -205 [-301 ; -37] | 1,03 % → 35,05 % | 0,00 % → 0,00 % | 136 |
| prise | 0,10 | 304 | 26 [15 ; 37] | 0,00 % → 0,00 % | 0,00 % → 0,00 % | 0 |
| prise | 0,15 | 304 | 39 [23 ; 56] | 0,00 % → 0,00 % | 0,00 % → 0,00 % | 0 |
| prise | 0,20 | 304 | 52 [30 ; 75] | 0,00 % → 0,00 % | 0,00 % → 0,00 % | 0 |
| prise | 0,25 | 304 | 65 [38 ; 93] | 0,00 % → 0,00 % | 0,00 % → 0,00 % | 0 |
| prise | 0,30 | 304 | 78 [45 ; 112] | 0,00 % → 0,00 % | 0,00 % → 0,00 % | 0 |
| prise | 0,35 | 304 | 91 [54 ; 130] | 0,00 % → 0,00 % | 0,00 % → 0,00 % | 0 |
| prise | 0,40 | 304 | 104 [61 ; 148] | 0,00 % → 0,00 % | 0,00 % → 0,00 % | 0 |
| prise | 0,45 | 304 | 118 [69 ; 167] | 0,00 % → 0,00 % | 0,00 % → 0,00 % | 0 |
| prise | 0,50 | 304 | 131 [77 ; 186] | 0,00 % → 0,00 % | 0,00 % → 0,00 % | 0 |
| maintien | 0,00 | 308 | 0 [0 ; 0] | 0,00 % → 0,00 % | 0,00 % → 0,00 % | 0 |

## 5.3 Golden et cas R et S (premier plan, S0 → FX)

| Cas | Objectif | Vitesse demandée | Cible S0 | Cible FX | Δ (kcal/j) | Vitesse retenue S0 → FX | Statut S0 → FX | Rejets FX |
|---|---|---|---|---|---|---|---|---|
| 01 female 25 sedentary normal BMI loss | perte | 0.005 | 1781 | 1683 | -98 | 0.005 → 0.005 | ok → ok |  |
| 02 male 30 low active normal BMI maintenance | maintien | 0 | 2871 | 2871 | 0 | 0 → 0 | ok → ok |  |
| 03 female 35 resistance training loss | perte | 0.005 | 1931 | 1809 | -122 | 0.005 → 0.005 | ok → ok |  |
| 04 male 28 athlete-like resistance + endurance maintenance | maintien | 0 | 3162 | 3162 | 0 | 0 → 0 | ok → ok |  |
| 05 female 42 obesity low active loss | perte | 0.005 | 1958 | 1777 | -182 | 0.005 → 0.005 | ok → ok |  |
| 06 male 45 obesity active loss | perte | 0.0075 | 2423 | 2189 | -234 | 0.0075 → 0.0075 | ok → ok |  |
| 07 female 55 active maintenance | maintien | 0 | 2368 | 2368 | 0 | 0 → 0 | ok → ok |  |
| 08 male 60 moderate activity maintenance | maintien | 0 | 2609 | 2609 | 0 | 0 → 0 | ok → ok |  |
| 09 female 65 resistance training maintenance | maintien | 0 | 1941 | 1941 | 0 | 0 → 0 | ok → ok |  |
| 10 male 35 resistance training gain | prise | 0.0025 | 3118 | 3157 | 39 | 0.0025 → 0.0025 | ok → ok |  |
| 11 female 30 endurance heavy gain | prise | 0.001 | 2357 | 2370 | 13 | 0.001 → 0.001 | ok → ok |  |
| 12 valid indirect calorimetry | perte | 0.0025 | 1881 | 1819 | -62 | 0.0025 → 0.0025 | ok → ok |  |
| R (historique 1 450 kcal) | perte | 0.01 | 1405 | 1234 | -171 | 0.01 → 0.009 | ok → ok | 0.01:below_hard_floor/0.0095:below_hard_floor |
| S (historique 1 450 kcal) | perte | 0.01 | 1503 | 1254 | -249 | 0.01 → 0.01 | ok → ok |  |
| R (sans historique) | perte | 0.01 | 1562 | 1320 | -241 | 0.01 → 0.01 | ok → ok |  |
| S (sans historique) | perte | 0.01 | 1682 | 1455 | -228 | 0.01 → 0.01 | ok → ok |  |

## 5.4 Invariants du curseur calories ↔ pas (correctif FX)

- premier plan (hypercube) : 200 plans, 5940 points du curseur ; violations de monotonie : **0** ; écart |masse tissulaire j42 − cible| max par plan : médiane 0,002 kg, max 0,003 kg ; points non convergés : 0.
- utilisateurs simulés, jour 83, état actuel : 49 plans, 1435 points du curseur ; violations de monotonie : **0** ; écart |masse tissulaire j42 − cible| max par plan : médiane 0,002 kg, max 0,003 kg ; points non convergés : 0.

## 5.5 Temps d’un recalcul complet (calibration + état actuel + solveur)

| Bras | Profils | P50 (ms) | P95 (ms) | P95 × 4 [déduit] (ms) | Seuil 1 s |
|---|---|---|---|---|---|
| S0 | 50 | 100,3 | 110,5 | 442,0 | sous |
| FX | 50 | 102,1 | 112,0 | 447,9 | sous |

## Temps réel des lancements

```
2026-09-25T18:46:10+02:00 start pilot2a shards=12
2026-09-25T18:46:26+02:00 end pilot2a wall_s=16 failed_shards=0
2026-09-25T18:47:03+02:00 start ideal2a shards=16
2026-09-25T18:55:18+02:00 end ideal2a wall_s=495 failed_shards=0
2026-09-25T19:06:55+02:00 start firstplan2a shards=16
2026-09-25T19:07:05+02:00 end firstplan2a wall_s=10
2026-09-25T19:07:34+02:00 start timing2a single process
2026-09-25T19:09:25+02:00 end timing2a wall_s=110
```

