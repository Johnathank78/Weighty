# Itération 2b : tableaux reconstruits depuis les bruts

Script : `tests/experiments-journal/it2b/tables2b.experiment.ts`. Bootstrap : 2000 tirages d’utilisateurs, graine 38000001. Ratio **tissus** (verdict, A4.1) : pente de la masse tissulaire vraie (gras + maigre) sur un bloc de 4 semaines / (vitesse du plan actif × poids vrai au début du bloc). Ratio **poids total** (rapporté) : définition de 2a.

## 5.1 Sélection (monde idéal, graines de sélection 2,7·10⁹)

500 utilisateurs (perte 191, prise 156, maintien 153), 2000 lignes utilisateur × bras.

### Médianes par fenêtre [IC 95 %]

| Bras | Objectif | Fenêtre | Blocs (utilisateurs) | Tissus | P10 / P90 tissus | Poids total | P10 / P90 poids |
|---|---|---|---|---|---|---|---|
| S0 témoin | perte | semaines 5 à 12 | 382 (191) | 0,715 [0,709 ; 0,724] | 0,628 / 0,794 | 0,709 [0,699 ; 0,719] | 0,610 / 0,800 |
| S0 témoin | perte | semaines 13 à 24 | 573 (191) | 0,640 [0,629 ; 0,652] | 0,506 / 0,728 | 0,639 [0,627 ; 0,653] | 0,492 / 0,728 |
| S0 témoin | perte | semaines 5 à 24 | 955 (191) | 0,673 [0,660 ; 0,685] | 0,546 / 0,762 | 0,667 [0,658 ; 0,678] | 0,534 / 0,761 |
| S0 témoin | prise | semaines 5 à 12 | 312 (156) | 0,770 [0,755 ; 0,791] | 0,634 / 0,878 | 0,774 [0,753 ; 0,793] | 0,627 / 0,916 |
| S0 témoin | prise | semaines 13 à 24 | 468 (156) | 0,673 [0,661 ; 0,680] | 0,569 / 0,760 | 0,676 [0,669 ; 0,683] | 0,569 / 0,762 |
| S0 témoin | prise | semaines 5 à 24 | 780 (156) | 0,701 [0,690 ; 0,715] | 0,583 / 0,826 | 0,700 [0,690 ; 0,715] | 0,576 / 0,839 |
| FX (2a, sans recalcul) | perte | semaines 5 à 12 | 382 (191) | 1,021 [1,018 ; 1,029] | 0,983 / 1,084 | 1,020 [1,016 ; 1,025] | 0,972 / 1,096 |
| FX (2a, sans recalcul) | perte | semaines 13 à 24 | 573 (191) | 0,985 [0,980 ; 0,987] | 0,897 / 1,012 | 0,987 [0,984 ; 0,989] | 0,868 / 1,019 |
| FX (2a, sans recalcul) | perte | semaines 5 à 24 | 955 (191) | 0,996 [0,993 ; 0,998] | 0,925 / 1,051 | 0,999 [0,995 ; 1,003] | 0,879 / 1,055 |
| FX (2a, sans recalcul) | prise | semaines 5 à 12 | 312 (156) | 1,068 [1,057 ; 1,074] | 0,991 / 1,131 | 1,072 [1,061 ; 1,086] | 0,978 / 1,184 |
| FX (2a, sans recalcul) | prise | semaines 13 à 24 | 468 (156) | 0,962 [0,958 ; 0,966] | 0,858 / 1,038 | 0,966 [0,963 ; 0,972] | 0,862 / 1,052 |
| FX (2a, sans recalcul) | prise | semaines 5 à 24 | 780 (156) | 1,010 [1,000 ; 1,017] | 0,894 / 1,096 | 1,022 [1,013 ; 1,029] | 0,893 / 1,132 |
| K1 (recalcul 28 j, horizon 42 j) | perte | semaines 5 à 12 | 382 (191) | 1,021 [1,018 ; 1,029] | 0,983 / 1,084 | 1,020 [1,016 ; 1,025] | 0,972 / 1,096 |
| K1 (recalcul 28 j, horizon 42 j) | perte | semaines 13 à 24 | 573 (191) | 1,001 [0,998 ; 1,003] | 0,960 / 1,029 | 1,005 [1,003 ; 1,008] | 0,897 / 1,040 |
| K1 (recalcul 28 j, horizon 42 j) | perte | semaines 5 à 24 | 955 (191) | 1,005 [1,003 ; 1,008] | 0,964 / 1,055 | 1,009 [1,006 ; 1,013] | 0,932 / 1,067 |
| K1 (recalcul 28 j, horizon 42 j) | prise | semaines 5 à 12 | 312 (156) | 1,068 [1,057 ; 1,074] | 0,991 / 1,131 | 1,072 [1,061 ; 1,086] | 0,978 / 1,184 |
| K1 (recalcul 28 j, horizon 42 j) | prise | semaines 13 à 24 | 468 (156) | 1,029 [1,022 ; 1,034] | 0,989 / 1,062 | 1,044 [1,037 ; 1,051] | 0,999 / 1,090 |
| K1 (recalcul 28 j, horizon 42 j) | prise | semaines 5 à 24 | 780 (156) | 1,038 [1,032 ; 1,044] | 0,989 / 1,097 | 1,053 [1,045 ; 1,058] | 0,995 / 1,132 |
| K2 (recalcul 28 j, horizon 28 j) | perte | semaines 5 à 12 | 382 (191) | 1,015 [1,011 ; 1,020] | 0,974 / 1,068 | 1,013 [1,008 ; 1,017] | 0,952 / 1,083 |
| K2 (recalcul 28 j, horizon 28 j) | perte | semaines 13 à 24 | 573 (191) | 0,991 [0,988 ; 0,994] | 0,948 / 1,016 | 0,996 [0,992 ; 0,999] | 0,885 / 1,024 |
| K2 (recalcul 28 j, horizon 28 j) | perte | semaines 5 à 24 | 955 (191) | 0,998 [0,995 ; 1,000] | 0,957 / 1,047 | 1,000 [0,998 ; 1,004] | 0,929 / 1,053 |
| K2 (recalcul 28 j, horizon 28 j) | prise | semaines 5 à 12 | 312 (156) | 1,047 [1,039 ; 1,053] | 0,975 / 1,093 | 1,054 [1,044 ; 1,063] | 0,967 / 1,145 |
| K2 (recalcul 28 j, horizon 28 j) | prise | semaines 13 à 24 | 468 (156) | 1,011 [1,005 ; 1,014] | 0,975 / 1,035 | 1,025 [1,019 ; 1,029] | 0,984 / 1,060 |
| K2 (recalcul 28 j, horizon 28 j) | prise | semaines 5 à 24 | 780 (156) | 1,018 [1,014 ; 1,023] | 0,975 / 1,070 | 1,031 [1,027 ; 1,037] | 0,980 / 1,102 |

### Médianes par bloc de 4 semaines, tissus [IC 95 %]

| Bras | Objectif | Semaines 5-8 | 9-12 | 13-16 | 17-20 | 21-24 |
|---|---|---|---|---|---|---|
| S0 témoin | perte | 0,737 [0,725 ; 0,744] | 0,691 [0,682 ; 0,706] | 0,659 [0,652 ; 0,672] | 0,634 [0,623 ; 0,651] | 0,617 [0,598 ; 0,631] |
| S0 témoin | prise | 0,792 [0,771 ; 0,810] | 0,753 [0,732 ; 0,769] | 0,724 [0,712 ; 0,738] | 0,671 [0,657 ; 0,679] | 0,644 [0,629 ; 0,653] |
| FX (2a, sans recalcul) | perte | 1,037 [1,032 ; 1,041] | 1,007 [1,003 ; 1,012] | 0,996 [0,992 ; 1,001] | 0,980 [0,973 ; 0,985] | 0,976 [0,969 ; 0,982] |
| FX (2a, sans recalcul) | prise | 1,080 [1,076 ; 1,086] | 1,047 [1,034 ; 1,053] | 1,021 [1,016 ; 1,028] | 0,941 [0,935 ; 0,954] | 0,912 [0,901 ; 0,920] |
| K1 (recalcul 28 j, horizon 42 j) | perte | 1,037 [1,032 ; 1,041] | 1,007 [1,003 ; 1,012] | 0,998 [0,995 ; 1,002] | 1,002 [0,998 ; 1,004] | 1,001 [0,998 ; 1,003] |
| K1 (recalcul 28 j, horizon 42 j) | prise | 1,080 [1,076 ; 1,086] | 1,047 [1,034 ; 1,053] | 1,029 [1,021 ; 1,032] | 1,027 [1,020 ; 1,032] | 1,031 [1,027 ; 1,036] |
| K2 (recalcul 28 j, horizon 28 j) | perte | 1,028 [1,023 ; 1,032] | 1,000 [0,997 ; 1,005] | 0,991 [0,987 ; 0,994] | 0,992 [0,989 ; 0,995] | 0,989 [0,987 ; 0,994] |
| K2 (recalcul 28 j, horizon 28 j) | prise | 1,060 [1,056 ; 1,066] | 1,027 [1,018 ; 1,033] | 1,011 [1,003 ; 1,013] | 1,009 [1,004 ; 1,013] | 1,012 [1,008 ; 1,016] |

### Médianes par bloc de 4 semaines, poids total [IC 95 %]

| Bras | Objectif | Semaines 5-8 | 9-12 | 13-16 | 17-20 | 21-24 |
|---|---|---|---|---|---|---|
| S0 témoin | perte | 0,729 [0,719 ; 0,741] | 0,689 [0,676 ; 0,708] | 0,659 [0,651 ; 0,668] | 0,634 [0,623 ; 0,651] | 0,611 [0,583 ; 0,627] |
| S0 témoin | prise | 0,795 [0,773 ; 0,829] | 0,759 [0,738 ; 0,775] | 0,727 [0,715 ; 0,740] | 0,671 [0,657 ; 0,679] | 0,648 [0,636 ; 0,660] |
| FX (2a, sans recalcul) | perte | 1,034 [1,025 ; 1,040] | 1,011 [1,006 ; 1,015] | 0,996 [0,993 ; 1,001] | 0,984 [0,975 ; 0,986] | 0,976 [0,948 ; 0,985] |
| FX (2a, sans recalcul) | prise | 1,100 [1,075 ; 1,115] | 1,060 [1,053 ; 1,071] | 1,025 [1,020 ; 1,032] | 0,942 [0,935 ; 0,954] | 0,914 [0,902 ; 0,931] |
| K1 (recalcul 28 j, horizon 42 j) | perte | 1,034 [1,025 ; 1,040] | 1,011 [1,006 ; 1,015] | 1,000 [0,996 ; 1,005] | 1,007 [1,004 ; 1,010] | 1,007 [1,004 ; 1,009] |
| K1 (recalcul 28 j, horizon 42 j) | prise | 1,100 [1,075 ; 1,115] | 1,060 [1,053 ; 1,071] | 1,040 [1,035 ; 1,048] | 1,041 [1,035 ; 1,049] | 1,049 [1,044 ; 1,054] |
| K2 (recalcul 28 j, horizon 28 j) | perte | 1,026 [1,017 ; 1,033] | 1,003 [1,000 ; 1,009] | 0,995 [0,990 ; 0,998] | 0,997 [0,992 ; 1,000] | 0,995 [0,992 ; 0,999] |
| K2 (recalcul 28 j, horizon 28 j) | prise | 1,082 [1,057 ; 1,092] | 1,042 [1,031 ; 1,051] | 1,020 [1,016 ; 1,027] | 1,021 [1,017 ; 1,028] | 1,028 [1,025 ; 1,034] |

### Ratio selon l’âge moyen du plan actif sur le bloc (tous blocs, médiane [IC 95 %])

| Bras | Objectif | Âge (j) | Utilisateurs-blocs | Tissus | Poids total |
|---|---|---|---|---|---|
| S0 | perte | 0 à 7 | 190 | 0,737 [0,724 ; 0,745] | 0,729 [0,718 ; 0,741] |
| S0 | perte | 7 à 14 | 374 | 0,683 [0,673 ; 0,693] | 0,679 [0,668 ; 0,693] |
| S0 | perte | 14 à 21 | 78 | 0,666 [0,654 ; 0,686] | 0,666 [0,654 ; 0,686] |
| S0 | perte | 21 à 28 | 38 | 0,605 [0,391 ; 0,657] | 0,601 [0,147 ; 0,661] |
| S0 | perte | 28 à 42 | 159 | 0,625 [0,605 ; 0,637] | 0,624 [0,606 ; 0,636] |
| S0 | perte | 42 à … | 116 | 0,603 [0,578 ; 0,621] | 0,599 [0,569 ; 0,618] |
| S0 | prise | 0 à 7 | 156 | 0,792 [0,771 ; 0,810] | 0,795 [0,773 ; 0,829] |
| S0 | prise | 7 à 14 | 255 | 0,742 [0,726 ; 0,756] | 0,749 [0,730 ; 0,762] |
| S0 | prise | 14 à 21 | 67 | 0,690 [0,677 ; 0,718] | 0,690 [0,677 ; 0,718] |
| S0 | prise | 21 à 28 | 7 | 0,673 [0,649 ; 0,683] | 0,696 [0,671 ; 0,704] |
| S0 | prise | 28 à 42 | 108 | 0,693 [0,676 ; 0,702] | 0,694 [0,683 ; 0,704] |
| S0 | prise | 42 à … | 187 | 0,633 [0,617 ; 0,644] | 0,635 [0,619 ; 0,644] |
| FX | perte | 0 à 7 | 188 | 1,037 [1,032 ; 1,041] | 1,035 [1,026 ; 1,041] |
| FX | perte | 7 à 14 | 393 | 1,001 [0,998 ; 1,003] | 1,003 [0,998 ; 1,006] |
| FX | perte | 14 à 21 | 100 | 0,993 [0,989 ; 0,996] | 1,002 [0,994 ; 1,007] |
| FX | perte | 21 à 28 | 38 | 0,979 [0,973 ; 0,989] | 0,986 [0,976 ; 0,994] |
| FX | perte | 28 à 42 | 121 | 0,974 [0,967 ; 0,982] | 0,976 [0,969 ; 0,985] |
| FX | perte | 42 à … | 115 | 0,901 [0,886 ; 0,928] | 0,901 [0,886 ; 0,928] |
| FX | prise | 0 à 7 | 156 | 1,080 [1,076 ; 1,086] | 1,100 [1,075 ; 1,115] |
| FX | prise | 7 à 14 | 255 | 1,034 [1,028 ; 1,041] | 1,044 [1,036 ; 1,053] |
| FX | prise | 14 à 21 | 69 | 1,017 [1,007 ; 1,026] | 1,017 [1,007 ; 1,026] |
| FX | prise | 21 à 28 | 16 | 1,012 [1,007 ; 1,026] | 1,078 [1,049 ; 1,094] |
| FX | prise | 28 à 42 | 116 | 0,963 [0,960 ; 0,965] | 0,964 [0,961 ; 0,966] |
| FX | prise | 42 à … | 168 | 0,902 [0,894 ; 0,910] | 0,903 [0,895 ; 0,912] |
| K1 | perte | 0 à 7 | 207 | 1,033 [1,030 ; 1,038] | 1,031 [1,023 ; 1,036] |
| K1 | perte | 7 à 14 | 691 | 1,002 [1,000 ; 1,004] | 1,007 [1,004 ; 1,009] |
| K1 | perte | 14 à 21 | 22 | 1,017 [1,003 ; 1,037] | 1,017 [1,003 ; 1,037] |
| K1 | perte | 21 à 28 | 1 | 0,826 [0,826 ; 0,826] | 0,826 [0,826 ; 0,826] |
| K1 | perte | 28 à 42 | 11 | 0,885 [0,828 ; 0,911] | 0,885 [0,828 ; 0,911] |
| K1 | perte | 42 à … | 23 | 0,775 [0,567 ; 0,896] | 0,775 [0,567 ; 0,896] |
| K1 | prise | 0 à 7 | 166 | 1,079 [1,074 ; 1,084] | 1,092 [1,072 ; 1,107] |
| K1 | prise | 7 à 14 | 613 | 1,031 [1,027 ; 1,036] | 1,046 [1,041 ; 1,053] |
| K1 | prise | 28 à 42 | 1 | 1,275 [1,275 ; 1,275] | 1,275 [1,275 ; 1,275] |
| K2 | perte | 0 à 7 | 207 | 1,024 [1,021 ; 1,030] | 1,021 [1,015 ; 1,027] |
| K2 | perte | 7 à 14 | 695 | 0,994 [0,991 ; 0,997] | 0,998 [0,996 ; 1,001] |
| K2 | perte | 14 à 21 | 23 | 0,997 [0,968 ; 1,015] | 0,997 [0,968 ; 1,015] |
| K2 | perte | 21 à 28 | 1 | 0,797 [0,797 ; 0,797] | 0,797 [0,797 ; 0,797] |
| K2 | perte | 28 à 42 | 9 | 0,862 [0,816 ; 0,873] | 0,862 [0,816 ; 0,873] |
| K2 | perte | 42 à … | 20 | 0,792 [-0,776 ; 0,876] | 0,792 [0,028 ; 0,876] |
| K2 | prise | 0 à 7 | 169 | 1,058 [1,054 ; 1,062] | 1,070 [1,053 ; 1,087] |
| K2 | prise | 7 à 14 | 610 | 1,012 [1,008 ; 1,016] | 1,027 [1,022 ; 1,031] |
| K2 | prise | 28 à 42 | 1 | 1,263 [1,263 ; 1,263] | 1,263 [1,263 ; 1,263] |

### Âge moyen du plan actif et plans démarrés, par bloc (médianes par utilisateur-bloc)

| Bras | Objectif | Semaines 5-8 | 9-12 | 13-16 | 17-20 | 21-24 |
|---|---|---|---|---|---|---|
| S0 | perte | 3,0 j ; 4,0 | 10,0 j ; 1,0 | 13,5 j ; 1,0 | 41,5 j ; 0,0 | 34,5 j ; 1,0 |
| S0 | prise | 3,0 j ; 4,0 | 10,0 j ; 1,0 | 13,5 j ; 1,0 | 41,5 j ; 0,0 | 69,5 j ; 0,0 |
| FX | perte | 3,0 j ; 4,0 | 10,0 j ; 1,0 | 13,5 j ; 1,0 | 41,5 j ; 0,0 | 27,5 j ; 0,0 |
| FX | prise | 3,0 j ; 4,0 | 10,0 j ; 1,0 | 13,5 j ; 1,0 | 41,5 j ; 0,0 | 69,5 j ; 0,0 |
| K1 | perte | 3,0 j ; 4,0 | 10,0 j ; 1,0 | 13,5 j ; 1,0 | 13,5 j ; 1,0 | 13,5 j ; 1,0 |
| K1 | prise | 3,0 j ; 4,0 | 10,0 j ; 1,0 | 13,5 j ; 1,0 | 13,5 j ; 1,0 | 13,5 j ; 1,0 |
| K2 | perte | 3,0 j ; 4,0 | 10,0 j ; 1,0 | 13,5 j ; 1,0 | 13,5 j ; 1,0 | 13,5 j ; 1,0 |
| K2 | prise | 3,0 j ; 4,0 | 10,0 j ; 1,0 | 13,5 j ; 1,0 | 13,5 j ; 1,0 | 13,5 j ; 1,0 |

### Différences appariées de médiane, tissus (bras b − bras a)

| a → b | Objectif | Fenêtre | Δ médiane [IC 95 %] |
|---|---|---|---|
| S0 → FX | perte | semaines 5 à 12 | 0,306 [0,298 ; 0,314] |
| S0 → FX | perte | semaines 13 à 24 | 0,345 [0,334 ; 0,354] |
| S0 → FX | perte | semaines 5 à 24 | 0,324 [0,312 ; 0,335] |
| S0 → FX | prise | semaines 5 à 12 | 0,298 [0,282 ; 0,307] |
| S0 → FX | prise | semaines 13 à 24 | 0,290 [0,285 ; 0,298] |
| S0 → FX | prise | semaines 5 à 24 | 0,309 [0,299 ; 0,317] |
| S0 → K1 | perte | semaines 5 à 12 | 0,306 [0,298 ; 0,314] |
| S0 → K1 | perte | semaines 13 à 24 | 0,361 [0,348 ; 0,372] |
| S0 → K1 | perte | semaines 5 à 24 | 0,333 [0,321 ; 0,345] |
| S0 → K1 | prise | semaines 5 à 12 | 0,298 [0,282 ; 0,307] |
| S0 → K1 | prise | semaines 13 à 24 | 0,356 [0,349 ; 0,366] |
| S0 → K1 | prise | semaines 5 à 24 | 0,338 [0,325 ; 0,346] |
| S0 → K2 | perte | semaines 5 à 12 | 0,299 [0,291 ; 0,306] |
| S0 → K2 | perte | semaines 13 à 24 | 0,351 [0,339 ; 0,361] |
| S0 → K2 | perte | semaines 5 à 24 | 0,325 [0,314 ; 0,336] |
| S0 → K2 | prise | semaines 5 à 12 | 0,278 [0,261 ; 0,288] |
| S0 → K2 | prise | semaines 13 à 24 | 0,338 [0,331 ; 0,347] |
| S0 → K2 | prise | semaines 5 à 24 | 0,317 [0,305 ; 0,326] |
| FX → K1 | perte | semaines 5 à 12 | 0,000 [0,000 ; 0,000] |
| FX → K1 | perte | semaines 13 à 24 | 0,016 [0,013 ; 0,020] |
| FX → K1 | perte | semaines 5 à 24 | 0,009 [0,008 ; 0,011] |
| FX → K1 | prise | semaines 5 à 12 | 0,000 [0,000 ; 0,000] |
| FX → K1 | prise | semaines 13 à 24 | 0,067 [0,060 ; 0,072] |
| FX → K1 | prise | semaines 5 à 24 | 0,028 [0,023 ; 0,035] |
| FX → K2 | perte | semaines 5 à 12 | -0,006 [-0,010 ; -0,004] |
| FX → K2 | perte | semaines 13 à 24 | 0,006 [0,004 ; 0,010] |
| FX → K2 | perte | semaines 5 à 24 | 0,002 [-0,000 ; 0,003] |
| FX → K2 | prise | semaines 5 à 12 | -0,020 [-0,023 ; -0,017] |
| FX → K2 | prise | semaines 13 à 24 | 0,049 [0,043 ; 0,052] |
| FX → K2 | prise | semaines 5 à 24 | 0,008 [0,003 ; 0,015] |

### Autres constats

| Bras | Recalibrations appliquées (médiane) | Recalculs périodiques faits (médiane ; total) | Dus sans snapshot (total) | Refusés (total) | Utilisateurs avec échec de recalibration | Échecs `no_feasible_speed` des recalibrations |
|---|---|---|---|---|---|---|
| S0 | 8,0 | 0,0 ; 0 | 0 | 0 | 1 | 5 |
| FX | 8,0 | 0,0 ; 0 | 0 | 0 | 7 | 16 |
| K1 | 8,0 | 2,0 ; 995 | 5 | 53 | 7 | 16 |
| K2 | 8,0 | 2,0 ; 1000 | 5 | 49 | 5 | 16 |

### Strates (médiane du ratio sur les tissus ; poids total entre parenthèses)

| Strate | Valeur | Objectif | Utilisateurs | S0 sem. 5-12 | S0 sem. 13-24 | FX sem. 5-12 | FX sem. 13-24 | K1 sem. 5-12 | K1 sem. 13-24 | K2 sem. 5-12 | K2 sem. 13-24 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| sexe | female | perte | 105 | 0,696 (0,683) | 0,617 (0,615) | 1,028 (1,021) | 0,976 (0,976) | 1,028 (1,021) | 1,000 (1,003) | 1,020 (1,014) | 0,988 (0,992) |
| sexe | female | prise | 77 | 0,754 (0,748) | 0,655 (0,662) | 1,074 (1,079) | 0,962 (0,966) | 1,074 (1,079) | 1,028 (1,045) | 1,054 (1,058) | 1,011 (1,026) |
| sexe | male | perte | 86 | 0,752 (0,748) | 0,689 (0,690) | 1,018 (1,019) | 0,989 (0,992) | 1,018 (1,019) | 1,001 (1,007) | 1,010 (1,010) | 0,994 (0,999) |
| sexe | male | prise | 79 | 0,791 (0,794) | 0,687 (0,691) | 1,056 (1,064) | 0,963 (0,967) | 1,056 (1,064) | 1,029 (1,044) | 1,038 (1,043) | 1,011 (1,022) |
| classe d’IMC | 21 | perte | 35 | 0,743 (0,746) | 0,601 (0,601) | 1,070 (1,089) | 0,934 (0,934) | 1,070 (1,089) | 1,020 (1,029) | 1,049 (1,069) | 1,000 (1,007) |
| classe d’IMC | 21 | prise | 37 | 0,733 (0,737) | 0,592 (0,592) | 1,083 (1,093) | 0,903 (0,903) | 1,083 (1,093) | 1,028 (1,057) | 1,051 (1,060) | 1,001 (1,028) |
| classe d’IMC | 26 | perte | 35 | 0,690 (0,653) | 0,600 (0,600) | 1,019 (1,019) | 0,971 (0,984) | 1,019 (1,019) | 1,002 (1,010) | 1,006 (1,006) | 0,987 (0,998) |
| classe d’IMC | 26 | prise | 44 | 0,770 (0,776) | 0,665 (0,677) | 1,078 (1,089) | 0,966 (0,982) | 1,078 (1,089) | 1,033 (1,059) | 1,053 (1,067) | 1,012 (1,037) |
| classe d’IMC | 31 | perte | 47 | 0,728 (0,728) | 0,664 (0,665) | 1,018 (1,017) | 0,991 (0,993) | 1,018 (1,017) | 0,999 (1,000) | 1,012 (1,008) | 0,992 (0,995) |
| classe d’IMC | 31 | prise | 37 | 0,771 (0,774) | 0,685 (0,687) | 1,063 (1,068) | 0,967 (0,973) | 1,063 (1,068) | 1,027 (1,037) | 1,044 (1,053) | 1,012 (1,021) |
| classe d’IMC | 38 | perte | 34 | 0,743 (0,736) | 0,702 (0,702) | 1,016 (1,015) | 0,995 (0,998) | 1,016 (1,015) | 1,001 (1,004) | 1,012 (1,009) | 0,994 (0,999) |
| classe d’IMC | 38 | prise | 38 | 0,785 (0,790) | 0,711 (0,712) | 1,053 (1,058) | 0,972 (0,974) | 1,053 (1,058) | 1,028 (1,033) | 1,040 (1,043) | 1,012 (1,016) |
| classe d’IMC | case_R | perte | 20 | 0,685 (0,661) | 0,592 (0,591) | 1,019 (1,006) | 0,952 (0,923) | 1,019 (1,006) | 0,993 (0,995) | 1,011 (1,003) | 0,984 (0,975) |
| classe d’IMC | case_S | perte | 20 | 0,698 (0,688) | 0,611 (0,609) | 1,029 (1,021) | 0,965 (0,907) | 1,029 (1,021) | 1,002 (1,005) | 1,020 (1,015) | 0,986 (0,989) |
| activité | sedentary | perte | 74 | 0,729 (0,727) | 0,665 (0,666) | 1,020 (1,023) | 0,988 (0,991) | 1,020 (1,023) | 0,999 (1,005) | 1,013 (1,013) | 0,993 (0,998) |
| activité | sedentary | prise | 77 | 0,769 (0,773) | 0,679 (0,682) | 1,060 (1,066) | 0,964 (0,968) | 1,060 (1,066) | 1,027 (1,037) | 1,041 (1,045) | 1,009 (1,021) |
| activité | strength | perte | 117 | 0,711 (0,698) | 0,626 (0,623) | 1,022 (1,020) | 0,980 (0,983) | 1,022 (1,020) | 1,002 (1,005) | 1,016 (1,013) | 0,989 (0,993) |
| activité | strength | prise | 79 | 0,774 (0,777) | 0,666 (0,670) | 1,074 (1,084) | 0,961 (0,964) | 1,074 (1,084) | 1,034 (1,051) | 1,053 (1,062) | 1,013 (1,030) |
| vitesse demandée | 0.0025 | perte | 35 | 0,743 (0,746) | 0,601 (0,601) | 1,070 (1,089) | 0,934 (0,934) | 1,070 (1,089) | 1,020 (1,029) | 1,049 (1,069) | 1,000 (1,007) |
| vitesse demandée | 0.0025 | prise | 156 | 0,770 (0,774) | 0,673 (0,676) | 1,068 (1,072) | 0,962 (0,966) | 1,068 (1,072) | 1,029 (1,044) | 1,047 (1,054) | 1,011 (1,025) |
| vitesse demandée | 0.005 | perte | 62 | 0,741 (0,735) | 0,676 (0,678) | 1,034 (1,033) | 0,996 (1,003) | 1,034 (1,033) | 1,006 (1,014) | 1,025 (1,024) | 0,998 (1,007) |
| vitesse demandée | 0.01 | perte | 94 | 0,698 (0,683) | 0,624 (0,623) | 1,009 (1,005) | 0,979 (0,982) | 1,009 (1,005) | 0,990 (0,993) | 1,005 (1,000) | 0,985 (0,986) |
| objectif | gain | prise | 156 | 0,770 (0,774) | 0,673 (0,676) | 1,068 (1,072) | 0,962 (0,966) | 1,068 (1,072) | 1,029 (1,044) | 1,047 (1,054) | 1,011 (1,025) |
| objectif | loss | perte | 191 | 0,715 (0,709) | 0,640 (0,639) | 1,021 (1,020) | 0,985 (0,987) | 1,021 (1,020) | 1,001 (1,005) | 1,015 (1,013) | 0,991 (0,996) |

**Arrêt 2 (témoin S0, poids total, semaines 5 à 24, contre le rapport 37)** : perte 0,667 (attendu 0,654 ± 0,03), prise 0,700 (attendu 0,703 ± 0,03) : reproduit.

### Critères de A3.1 sur les tissus, bras S0 (rapporté, hors sélection)

| Critère | Objectif | Unité | Médiane tissus [IC 95 %] | Bande | IC dans la bande | Statut | Médiane seule dans la bande |
|---|---|---|---|---|---|---|---|
| fenêtre | perte | w1 | 0,715 [0,709 ; 0,724] | [0,950 ; 1,050] | **non** | **échoue** | non |
| fenêtre | perte | w2 | 0,640 [0,629 ; 0,652] | [0,950 ; 1,050] | **non** | **échoue** | non |
| bloc | perte | b1 | 0,737 [0,725 ; 0,744] | [0,900 ; 1,100] | **non** | **échoue** | non |
| bloc | perte | b2 | 0,691 [0,682 ; 0,706] | [0,900 ; 1,100] | **non** | **échoue** | non |
| bloc | perte | b3 | 0,659 [0,652 ; 0,672] | [0,900 ; 1,100] | **non** | **échoue** | non |
| bloc | perte | b4 | 0,634 [0,623 ; 0,651] | [0,900 ; 1,100] | **non** | **échoue** | non |
| bloc | perte | b5 | 0,617 [0,598 ; 0,631] | [0,900 ; 1,100] | **non** | **échoue** | non |
| fenêtre | prise | w1 | 0,770 [0,755 ; 0,791] | [0,950 ; 1,050] | **non** | **échoue** | non |
| fenêtre | prise | w2 | 0,673 [0,661 ; 0,680] | [0,950 ; 1,050] | **non** | **échoue** | non |
| bloc | prise | b1 | 0,792 [0,771 ; 0,810] | [0,900 ; 1,100] | **non** | **échoue** | non |
| bloc | prise | b2 | 0,753 [0,732 ; 0,769] | [0,900 ; 1,100] | **non** | **échoue** | non |
| bloc | prise | b3 | 0,724 [0,712 ; 0,738] | [0,900 ; 1,100] | **non** | **échoue** | non |
| bloc | prise | b4 | 0,671 [0,657 ; 0,679] | [0,900 ; 1,100] | **non** | **échoue** | non |
| bloc | prise | b5 | 0,644 [0,629 ; 0,653] | [0,900 ; 1,100] | **non** | **échoue** | non |

**S0, première passe : **échoue**.**

### Critères de A3.1 sur les tissus, bras FX (rapporté, hors sélection)

| Critère | Objectif | Unité | Médiane tissus [IC 95 %] | Bande | IC dans la bande | Statut | Médiane seule dans la bande |
|---|---|---|---|---|---|---|---|
| fenêtre | perte | w1 | 1,021 [1,018 ; 1,029] | [0,950 ; 1,050] | oui | passe | oui |
| fenêtre | perte | w2 | 0,985 [0,980 ; 0,987] | [0,950 ; 1,050] | oui | passe | oui |
| bloc | perte | b1 | 1,037 [1,032 ; 1,041] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | perte | b2 | 1,007 [1,003 ; 1,012] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | perte | b3 | 0,996 [0,992 ; 1,001] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | perte | b4 | 0,980 [0,973 ; 0,985] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | perte | b5 | 0,976 [0,969 ; 0,982] | [0,900 ; 1,100] | oui | passe | oui |
| fenêtre | prise | w1 | 1,068 [1,057 ; 1,074] | [0,950 ; 1,050] | **non** | **échoue** | non |
| fenêtre | prise | w2 | 0,962 [0,958 ; 0,966] | [0,950 ; 1,050] | oui | passe | oui |
| bloc | prise | b1 | 1,080 [1,076 ; 1,086] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | prise | b2 | 1,047 [1,034 ; 1,053] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | prise | b3 | 1,021 [1,016 ; 1,028] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | prise | b4 | 0,941 [0,935 ; 0,954] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | prise | b5 | 0,912 [0,901 ; 0,920] | [0,900 ; 1,100] | oui | passe | oui |

**FX, première passe : **échoue**.**

### Critères de A3.1 sur les tissus, bras K1 (candidat)

| Critère | Objectif | Unité | Médiane tissus [IC 95 %] | Bande | IC dans la bande | Statut | Médiane seule dans la bande |
|---|---|---|---|---|---|---|---|
| fenêtre | perte | w1 | 1,021 [1,018 ; 1,029] | [0,950 ; 1,050] | oui | passe | oui |
| fenêtre | perte | w2 | 1,001 [0,998 ; 1,003] | [0,950 ; 1,050] | oui | passe | oui |
| bloc | perte | b1 | 1,037 [1,032 ; 1,041] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | perte | b2 | 1,007 [1,003 ; 1,012] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | perte | b3 | 0,998 [0,995 ; 1,002] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | perte | b4 | 1,002 [0,998 ; 1,004] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | perte | b5 | 1,001 [0,998 ; 1,003] | [0,900 ; 1,100] | oui | passe | oui |
| fenêtre | prise | w1 | 1,068 [1,057 ; 1,074] | [0,950 ; 1,050] | **non** | **échoue** | non |
| fenêtre | prise | w2 | 1,029 [1,022 ; 1,034] | [0,950 ; 1,050] | oui | passe | oui |
| bloc | prise | b1 | 1,080 [1,076 ; 1,086] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | prise | b2 | 1,047 [1,034 ; 1,053] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | prise | b3 | 1,029 [1,021 ; 1,032] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | prise | b4 | 1,027 [1,020 ; 1,032] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | prise | b5 | 1,031 [1,027 ; 1,036] | [0,900 ; 1,100] | oui | passe | oui |

**K1, première passe : **échoue**.**

### Critères de A3.1 sur les tissus, bras K2 (candidat)

| Critère | Objectif | Unité | Médiane tissus [IC 95 %] | Bande | IC dans la bande | Statut | Médiane seule dans la bande |
|---|---|---|---|---|---|---|---|
| fenêtre | perte | w1 | 1,015 [1,011 ; 1,020] | [0,950 ; 1,050] | oui | passe | oui |
| fenêtre | perte | w2 | 0,991 [0,988 ; 0,994] | [0,950 ; 1,050] | oui | passe | oui |
| bloc | perte | b1 | 1,028 [1,023 ; 1,032] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | perte | b2 | 1,000 [0,997 ; 1,005] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | perte | b3 | 0,991 [0,987 ; 0,994] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | perte | b4 | 0,992 [0,989 ; 0,995] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | perte | b5 | 0,989 [0,987 ; 0,994] | [0,900 ; 1,100] | oui | passe | oui |
| fenêtre | prise | w1 | 1,047 [1,039 ; 1,053] | [0,950 ; 1,050] | **non** | **inconclusif** | oui |
| fenêtre | prise | w2 | 1,011 [1,005 ; 1,014] | [0,950 ; 1,050] | oui | passe | oui |
| bloc | prise | b1 | 1,060 [1,056 ; 1,066] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | prise | b2 | 1,027 [1,018 ; 1,033] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | prise | b3 | 1,011 [1,003 ; 1,013] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | prise | b4 | 1,009 [1,004 ; 1,013] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | prise | b5 | 1,012 [1,008 ; 1,016] | [0,900 ; 1,100] | oui | passe | oui |

**K2, première passe : **inconclusif**.**

## 5.1 bis Passe doublée de la sélection (graines 3,5·10⁹)

Règle commune de THRESHOLDS.md (INCONCLUSIF : n doublé une fois, graines neuves A1.3, verdict sur la nouvelle passe seule). 1000 utilisateurs (perte 392, prise 306, maintien 302), bras S0 et K2.

### Médianes par fenêtre [IC 95 %]

| Bras | Objectif | Fenêtre | Blocs (utilisateurs) | Tissus | P10 / P90 tissus | Poids total | P10 / P90 poids |
|---|---|---|---|---|---|---|---|
| S0 témoin | perte | semaines 5 à 12 | 784 (392) | 0,709 [0,706 ; 0,715] | 0,600 / 0,796 | 0,693 [0,687 ; 0,703] | 0,558 / 0,800 |
| S0 témoin | perte | semaines 13 à 24 | 1176 (392) | 0,631 [0,623 ; 0,638] | 0,481 / 0,726 | 0,631 [0,622 ; 0,639] | 0,466 / 0,727 |
| S0 témoin | perte | semaines 5 à 24 | 1960 (392) | 0,663 [0,654 ; 0,670] | 0,517 / 0,758 | 0,658 [0,650 ; 0,666] | 0,484 / 0,756 |
| S0 témoin | prise | semaines 5 à 12 | 612 (306) | 0,769 [0,760 ; 0,779] | 0,645 / 0,861 | 0,771 [0,762 ; 0,783] | 0,629 / 0,886 |
| S0 témoin | prise | semaines 13 à 24 | 918 (306) | 0,669 [0,661 ; 0,675] | 0,551 / 0,753 | 0,671 [0,665 ; 0,678] | 0,551 / 0,758 |
| S0 témoin | prise | semaines 5 à 24 | 1530 (306) | 0,704 [0,696 ; 0,711] | 0,570 / 0,817 | 0,704 [0,696 ; 0,712] | 0,571 / 0,833 |
| K2 (recalcul 28 j, horizon 28 j) | perte | semaines 5 à 12 | 784 (392) | 1,014 [1,011 ; 1,017] | 0,964 / 1,074 | 1,009 [1,006 ; 1,013] | 0,946 / 1,092 |
| K2 (recalcul 28 j, horizon 28 j) | perte | semaines 13 à 24 | 1176 (392) | 0,988 [0,986 ; 0,990] | 0,940 / 1,020 | 0,992 [0,990 ; 0,995] | 0,883 / 1,028 |
| K2 (recalcul 28 j, horizon 28 j) | perte | semaines 5 à 24 | 1960 (392) | 0,996 [0,993 ; 0,998] | 0,947 / 1,046 | 0,998 [0,996 ; 1,001] | 0,909 / 1,053 |
| K2 (recalcul 28 j, horizon 28 j) | prise | semaines 5 à 12 | 612 (306) | 1,044 [1,042 ; 1,049] | 0,981 / 1,085 | 1,054 [1,049 ; 1,061] | 0,971 / 1,130 |
| K2 (recalcul 28 j, horizon 28 j) | prise | semaines 13 à 24 | 918 (306) | 1,010 [1,007 ; 1,012] | 0,973 / 1,032 | 1,023 [1,021 ; 1,026] | 0,989 / 1,054 |
| K2 (recalcul 28 j, horizon 28 j) | prise | semaines 5 à 24 | 1530 (306) | 1,017 [1,015 ; 1,020] | 0,975 / 1,066 | 1,030 [1,027 ; 1,034] | 0,984 / 1,095 |

### Médianes par bloc de 4 semaines, tissus [IC 95 %]

| Bras | Objectif | Semaines 5-8 | 9-12 | 13-16 | 17-20 | 21-24 |
|---|---|---|---|---|---|---|
| S0 témoin | perte | 0,725 [0,721 ; 0,728] | 0,679 [0,671 ; 0,684] | 0,648 [0,643 ; 0,657] | 0,627 [0,617 ; 0,634] | 0,607 [0,587 ; 0,617] |
| S0 témoin | prise | 0,793 [0,779 ; 0,802] | 0,751 [0,737 ; 0,760] | 0,719 [0,710 ; 0,724] | 0,665 [0,653 ; 0,674] | 0,639 [0,629 ; 0,643] |
| K2 (recalcul 28 j, horizon 28 j) | perte | 1,028 [1,025 ; 1,031] | 0,998 [0,996 ; 1,001] | 0,987 [0,983 ; 0,990] | 0,989 [0,987 ; 0,991] | 0,988 [0,986 ; 0,991] |
| K2 (recalcul 28 j, horizon 28 j) | prise | 1,062 [1,058 ; 1,065] | 1,027 [1,022 ; 1,032] | 1,010 [1,006 ; 1,012] | 1,009 [1,006 ; 1,012] | 1,011 [1,009 ; 1,013] |

### Médianes par bloc de 4 semaines, poids total [IC 95 %]

| Bras | Objectif | Semaines 5-8 | 9-12 | 13-16 | 17-20 | 21-24 |
|---|---|---|---|---|---|---|
| S0 témoin | perte | 0,713 [0,706 ; 0,718] | 0,675 [0,668 ; 0,681] | 0,647 [0,643 ; 0,656] | 0,627 [0,617 ; 0,634] | 0,599 [0,575 ; 0,612] |
| S0 témoin | prise | 0,796 [0,782 ; 0,817] | 0,757 [0,743 ; 0,766] | 0,722 [0,711 ; 0,732] | 0,665 [0,653 ; 0,674] | 0,640 [0,632 ; 0,650] |
| K2 (recalcul 28 j, horizon 28 j) | perte | 1,024 [1,019 ; 1,028] | 1,001 [0,998 ; 1,004] | 0,990 [0,987 ; 0,994] | 0,994 [0,990 ; 0,996] | 0,994 [0,991 ; 0,996] |
| K2 (recalcul 28 j, horizon 28 j) | prise | 1,082 [1,074 ; 1,090] | 1,041 [1,035 ; 1,046] | 1,021 [1,018 ; 1,024] | 1,022 [1,019 ; 1,024] | 1,028 [1,025 ; 1,030] |

### Ratio selon l’âge moyen du plan actif sur le bloc (tous blocs, médiane [IC 95 %])

| Bras | Objectif | Âge (j) | Utilisateurs-blocs | Tissus | Poids total |
|---|---|---|---|---|---|
| S0 | perte | 0 à 7 | 391 | 0,725 [0,721 ; 0,728] | 0,714 [0,706 ; 0,718] |
| S0 | perte | 7 à 14 | 766 | 0,670 [0,664 ; 0,679] | 0,668 [0,661 ; 0,677] |
| S0 | perte | 14 à 21 | 145 | 0,647 [0,633 ; 0,667] | 0,647 [0,631 ; 0,665] |
| S0 | perte | 21 à 28 | 78 | 0,587 [0,470 ; 0,615] | 0,592 [0,494 ; 0,615] |
| S0 | perte | 28 à 42 | 322 | 0,617 [0,607 ; 0,628] | 0,617 [0,607 ; 0,629] |
| S0 | perte | 42 à … | 258 | 0,580 [0,559 ; 0,606] | 0,568 [0,537 ; 0,591] |
| S0 | prise | 0 à 7 | 305 | 0,793 [0,779 ; 0,802] | 0,796 [0,782 ; 0,818] |
| S0 | prise | 7 à 14 | 505 | 0,743 [0,734 ; 0,752] | 0,749 [0,740 ; 0,757] |
| S0 | prise | 14 à 21 | 119 | 0,682 [0,672 ; 0,694] | 0,682 [0,672 ; 0,694] |
| S0 | prise | 21 à 28 | 21 | 0,668 [0,648 ; 0,685] | 0,701 [0,676 ; 0,711] |
| S0 | prise | 28 à 42 | 207 | 0,691 [0,682 ; 0,701] | 0,693 [0,683 ; 0,701] |
| S0 | prise | 42 à … | 373 | 0,627 [0,612 ; 0,633] | 0,627 [0,615 ; 0,634] |
| K2 | perte | 0 à 7 | 423 | 1,025 [1,023 ; 1,029] | 1,021 [1,016 ; 1,026] |
| K2 | perte | 7 à 14 | 1423 | 0,991 [0,989 ; 0,994] | 0,996 [0,994 ; 0,998] |
| K2 | perte | 14 à 21 | 54 | 0,966 [0,960 ; 0,992] | 0,966 [0,960 ; 0,992] |
| K2 | perte | 28 à 42 | 15 | 0,874 [0,861 ; 0,893] | 0,874 [0,861 ; 0,893] |
| K2 | perte | 42 à … | 45 | 0,846 [0,832 ; 0,866] | 0,846 [0,832 ; 0,866] |
| K2 | prise | 0 à 7 | 322 | 1,060 [1,058 ; 1,063] | 1,078 [1,070 ; 1,086] |
| K2 | prise | 7 à 14 | 1208 | 1,012 [1,010 ; 1,015] | 1,026 [1,023 ; 1,028] |

### Âge moyen du plan actif et plans démarrés, par bloc (médianes par utilisateur-bloc)

| Bras | Objectif | Semaines 5-8 | 9-12 | 13-16 | 17-20 | 21-24 |
|---|---|---|---|---|---|---|
| S0 | perte | 3,0 j ; 4,0 | 10,0 j ; 1,0 | 13,5 j ; 1,0 | 41,5 j ; 0,0 | 34,5 j ; 1,0 |
| S0 | prise | 3,0 j ; 4,0 | 10,0 j ; 1,0 | 13,5 j ; 1,0 | 41,5 j ; 0,0 | 69,5 j ; 0,0 |
| K2 | perte | 3,0 j ; 4,0 | 10,0 j ; 1,0 | 13,5 j ; 1,0 | 13,5 j ; 1,0 | 13,5 j ; 1,0 |
| K2 | prise | 3,0 j ; 4,0 | 10,0 j ; 1,0 | 13,5 j ; 1,0 | 13,5 j ; 1,0 | 13,5 j ; 1,0 |

### Différences appariées de médiane, tissus (bras b − bras a)

| a → b | Objectif | Fenêtre | Δ médiane [IC 95 %] |
|---|---|---|---|
| S0 → K2 | perte | semaines 5 à 12 | 0,305 [0,300 ; 0,309] |
| S0 → K2 | perte | semaines 13 à 24 | 0,357 [0,351 ; 0,364] |
| S0 → K2 | perte | semaines 5 à 24 | 0,333 [0,327 ; 0,340] |
| S0 → K2 | prise | semaines 5 à 12 | 0,276 [0,268 ; 0,283] |
| S0 → K2 | prise | semaines 13 à 24 | 0,341 [0,335 ; 0,347] |
| S0 → K2 | prise | semaines 5 à 24 | 0,313 [0,307 ; 0,320] |

### Autres constats

| Bras | Recalibrations appliquées (médiane) | Recalculs périodiques faits (médiane ; total) | Dus sans snapshot (total) | Refusés (total) | Utilisateurs avec échec de recalibration | Échecs `no_feasible_speed` des recalibrations |
|---|---|---|---|---|---|---|
| S0 | 8,0 | 0,0 ; 0 | 0 | 0 | 3 | 19 |
| K2 | 8,0 | 2,0 ; 1968 | 5 | 114 | 6 | 25 |

### Strates (médiane du ratio sur les tissus ; poids total entre parenthèses)

| Strate | Valeur | Objectif | Utilisateurs | S0 sem. 5-12 | S0 sem. 13-24 | K2 sem. 5-12 | K2 sem. 13-24 |
|---|---|---|---|---|---|---|---|
| sexe | female | perte | 238 | 0,691 (0,677) | 0,612 (0,608) | 1,014 (1,008) | 0,986 (0,989) |
| sexe | female | prise | 150 | 0,751 (0,749) | 0,650 (0,655) | 1,050 (1,063) | 1,011 (1,027) |
| sexe | male | perte | 154 | 0,751 (0,747) | 0,691 (0,691) | 1,015 (1,012) | 0,992 (0,998) |
| sexe | male | prise | 156 | 0,790 (0,792) | 0,688 (0,690) | 1,039 (1,049) | 1,009 (1,021) |
| classe d’IMC | 21 | perte | 81 | 0,722 (0,719) | 0,591 (0,591) | 1,031 (1,048) | 0,987 (0,998) |
| classe d’IMC | 21 | prise | 82 | 0,739 (0,743) | 0,589 (0,591) | 1,039 (1,055) | 0,999 (1,018) |
| classe d’IMC | 26 | perte | 81 | 0,666 (0,621) | 0,584 (0,586) | 0,987 (0,964) | 0,972 (0,991) |
| classe d’IMC | 26 | prise | 76 | 0,752 (0,755) | 0,654 (0,663) | 1,050 (1,059) | 1,007 (1,033) |
| classe d’IMC | 31 | perte | 71 | 0,720 (0,709) | 0,656 (0,656) | 1,016 (1,009) | 0,990 (0,993) |
| classe d’IMC | 31 | prise | 75 | 0,772 (0,778) | 0,682 (0,683) | 1,044 (1,053) | 1,014 (1,021) |
| classe d’IMC | 38 | perte | 79 | 0,733 (0,726) | 0,689 (0,689) | 1,018 (1,015) | 0,993 (0,995) |
| classe d’IMC | 38 | prise | 73 | 0,798 (0,803) | 0,722 (0,726) | 1,045 (1,054) | 1,016 (1,021) |
| classe d’IMC | case_R | perte | 40 | 0,681 (0,669) | 0,603 (0,594) | 1,010 (1,006) | 0,981 (0,980) |
| classe d’IMC | case_S | perte | 40 | 0,691 (0,680) | 0,600 (0,594) | 1,018 (1,012) | 0,985 (0,987) |
| activité | sedentary | perte | 160 | 0,718 (0,708) | 0,650 (0,650) | 1,012 (1,008) | 0,990 (0,995) |
| activité | sedentary | prise | 153 | 0,761 (0,762) | 0,676 (0,680) | 1,039 (1,046) | 1,007 (1,021) |
| activité | strength | perte | 232 | 0,706 (0,686) | 0,620 (0,617) | 1,016 (1,011) | 0,987 (0,991) |
| activité | strength | prise | 153 | 0,774 (0,777) | 0,660 (0,664) | 1,052 (1,068) | 1,013 (1,027) |
| vitesse demandée | 0.0025 | perte | 81 | 0,722 (0,719) | 0,591 (0,591) | 1,031 (1,048) | 0,987 (0,998) |
| vitesse demandée | 0.0025 | prise | 306 | 0,769 (0,771) | 0,669 (0,671) | 1,044 (1,054) | 1,010 (1,023) |
| vitesse demandée | 0.005 | perte | 109 | 0,738 (0,737) | 0,678 (0,681) | 1,027 (1,023) | 0,999 (1,006) |
| vitesse demandée | 0.01 | perte | 202 | 0,692 (0,675) | 0,619 (0,615) | 1,004 (1,000) | 0,983 (0,985) |
| objectif | gain | prise | 306 | 0,769 (0,771) | 0,669 (0,671) | 1,044 (1,054) | 1,010 (1,023) |
| objectif | loss | perte | 392 | 0,709 (0,693) | 0,631 (0,631) | 1,014 (1,009) | 0,988 (0,992) |

### Critères de A3.1 sur les tissus, passe doublée, bras K2

| Critère | Objectif | Unité | Médiane tissus [IC 95 %] | Bande | IC dans la bande | Statut | Médiane seule dans la bande |
|---|---|---|---|---|---|---|---|
| fenêtre | perte | w1 | 1,014 [1,011 ; 1,017] | [0,950 ; 1,050] | oui | passe | oui |
| fenêtre | perte | w2 | 0,988 [0,986 ; 0,990] | [0,950 ; 1,050] | oui | passe | oui |
| bloc | perte | b1 | 1,028 [1,025 ; 1,031] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | perte | b2 | 0,998 [0,996 ; 1,001] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | perte | b3 | 0,987 [0,983 ; 0,990] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | perte | b4 | 0,989 [0,987 ; 0,991] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | perte | b5 | 0,988 [0,986 ; 0,991] | [0,900 ; 1,100] | oui | passe | oui |
| fenêtre | prise | w1 | 1,044 [1,042 ; 1,049] | [0,950 ; 1,050] | oui | passe | oui |
| fenêtre | prise | w2 | 1,010 [1,007 ; 1,012] | [0,950 ; 1,050] | oui | passe | oui |
| bloc | prise | b1 | 1,062 [1,058 ; 1,065] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | prise | b2 | 1,027 [1,022 ; 1,032] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | prise | b3 | 1,010 [1,006 ; 1,012] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | prise | b4 | 1,009 [1,006 ; 1,012] | [0,900 ; 1,100] | oui | passe | oui |
| bloc | prise | b5 | 1,011 [1,009 ; 1,013] | [0,900 ; 1,100] | oui | passe | oui |

**K2, passe doublée : passe.**

**Règle A4.2 : K1 **échoue**, K2 passe (après la passe doublée) ; candidat retenu : K2.**

### Recalculs périodiques, sélection : bras K1

- Utilisateurs : 500. Recalculs périodiques faits : 995 ; par utilisateur, médiane 2,0 [P10 1,0 ; P90 3,0], max 3, 18 utilisateurs sans recalcul.
- Écart de cible (nouvelle − ancienne), kcal/j : médiane 0,0 [P10 -19,5 ; P90 27,3] ; |écart| médian 15,7, P90 29,4.
- Part des recalculs avec |écart| < 10 kcal/j : 394 / 995 = 39,60 % [36,60 % ; 42,67 %].
- Recalculs dus mais non faits sans snapshot appliqué : 5. Refusés (plan laissé en place) : 53 (loss_unavailable_low_bmi : 50, target_not_above_current : 1, no_feasible_speed : 2).
- perte : 313 recalculs, écart médian -15,7 [P10 -27,3 ; P90 -4,2] kcal/j, |écart| < 10 : 53.
- prise : 341 recalculs, écart médian 24,1 [P10 16,8 ; P90 32,6] kcal/j, |écart| < 10 : 0.
- maintien : 341 recalculs, écart médian 0,0 [P10 0,0 ; P90 0,0] kcal/j, |écart| < 10 : 341.

### Recalculs périodiques, sélection : bras K2

- Utilisateurs : 500. Recalculs périodiques faits : 1000 ; par utilisateur, médiane 2,0 [P10 1,0 ; P90 3,0], max 3, 17 utilisateurs sans recalcul.
- Écart de cible (nouvelle − ancienne), kcal/j : médiane 0,0 [P10 -17,9 ; P90 27,3] ; |écart| médian 15,7, P90 28,4.
- Part des recalculs avec |écart| < 10 kcal/j : 396 / 1000 = 39,60 % [36,61 % ; 42,67 %].
- Recalculs dus mais non faits sans snapshot appliqué : 5. Refusés (plan laissé en place) : 49 (loss_unavailable_low_bmi : 46, target_not_above_current : 1, no_feasible_speed : 2).
- perte : 318 recalculs, écart médian -14,7 [P10 -26,6 ; P90 -4,2] kcal/j, |écart| < 10 : 55.
- prise : 341 recalculs, écart médian 23,1 [P10 16,8 ; P90 31,5] kcal/j, |écart| < 10 : 0.
- maintien : 341 recalculs, écart médian 0,0 [P10 0,0 ; P90 0,0] kcal/j, |écart| < 10 : 341.

## 5.6 Invariants du curseur calories ↔ pas (par candidat)

- premiers plans (hypercube) (K1, horizon 42 j) : 200 plans, 5936 points du curseur ; violations de monotonie : **0** ; écart |masse tissulaire à l’horizon − cible| max par plan (curseur) : médiane 0,002 kg, max 0,003 kg ; plan lui-même : max 0,003 kg ; points non convergés : 0.
- utilisateurs simulés, jour 83, état actuel (K1, horizon 42 j) : 50 plans, 1466 points du curseur ; violations de monotonie : **0** ; écart |masse tissulaire à l’horizon − cible| max par plan (curseur) : médiane 0,002 kg, max 0,003 kg ; plan lui-même : max 0,002 kg ; points non convergés : 0.
- premiers plans (hypercube) (K2, horizon 28 j) : 200 plans, 5936 points du curseur ; violations de monotonie : **0** ; écart |masse tissulaire à l’horizon − cible| max par plan (curseur) : médiane 0,001 kg, max 0,002 kg ; plan lui-même : max 0,002 kg ; points non convergés : 0.
- utilisateurs simulés, jour 83, état actuel (K2, horizon 28 j) : 50 plans, 1466 points du curseur ; violations de monotonie : **0** ; écart |masse tissulaire à l’horizon − cible| max par plan (curseur) : médiane 0,002 kg, max 0,002 kg ; plan lui-même : max 0,002 kg ; points non convergés : 0.

## 5.6 Temps d’un recalcul complet (calibration + état actuel + solveur)

| Lancement | Bras | Opération | Profils | P50 (ms) | P95 (ms) | P95 × 4 [déduit] (ms) | Seuil 1 s |
|---|---|---|---|---|---|---|---|
| K1 | S0 | recalcul complet | 50 | 96,8 | 107,5 | 429,9 | sous |
| K1 | K1 | recalcul complet | 50 | 98,9 | 107,1 | 428,5 | sous |
| K1 | K1 | recalcul périodique | 50 | 3,1 | 5,2 | 20,9 | sous |
| K2 | S0 | recalcul complet | 50 | 94,8 | 103,4 | 413,5 | sous |
| K2 | K2 | recalcul complet | 50 | 96,9 | 106,3 | 425,0 | sous |
| K2 | K2 | recalcul périodique | 50 | 2,9 | 4,7 | 18,8 | sous |

## Temps réel des lancements

```
2026-09-25T19:45:02+02:00 start pilot2b shards=4 candidate=
2026-09-25T19:45:37+02:00 end pilot2b wall_s=35 failed_shards=0
2026-09-25T19:52:30+02:00 start select2b shards=16 candidate=
2026-09-25T20:01:09+02:00 end select2b wall_s=519 failed_shards=0
2026-09-25T20:03:04+02:00 start invariants2bK1 shards=8
2026-09-25T20:03:07+02:00 end invariants2bK1 wall_s=3
2026-09-25T20:03:07+02:00 start invariants2bK2 shards=8
2026-09-25T20:03:10+02:00 end invariants2bK2 wall_s=3
2026-09-25T20:03:10+02:00 start timing2bK1 (alone)
2026-09-25T20:04:57+02:00 end timing2bK1 wall_s=107 exit=0
2026-09-25T20:04:57+02:00 start timing2bK2 (alone)
2026-09-25T20:06:42+02:00 end timing2bK2 wall_s=105 exit=0
2026-09-25T20:06:52+02:00 start select2bx2 shards=16 candidate=
2026-09-25T20:15:20+02:00 end select2bx2 wall_s=508 failed_shards=0
```

