# Itération 2c : tableaux reconstruits depuis les bruts

Script : `tests/experiments-journal/it2c/tables2c.experiment.ts`. Bootstrap : 2 000 tirages d’utilisateurs, graine 39 000 001 ; Wilson pour les proportions d’utilisateurs. Ratio tissulaire (A4.1) ; blocs dont l’objectif du plan change en cours de bloc retirés des ratios de S1, S2-NI et A3.1 (A5.4).

## 4.2 Monde idéal (graines 3,6·10⁹) : isolement dans la boucle et A3.1 pour K2 + G

500 utilisateurs (perte 189, prise 158, maintien 153), 1000 lignes utilisateur × bras.

### Contrôle d’isolement dans la boucle

- Utilisateurs sans aucun événement de garde-fou sous K2 + G : 389 ; lignes brutes identiques à K2 au bit près (toutes colonnes sauf le nom du bras) : **389 / 389**.
- Utilisateurs avec au moins un événement sous K2 + G : 111 ; G1 appliqué : 32 ; G2 appliqué : 79 ; échec : 0.
- **Contrôle d’isolement : PASSE**.

### Événements des garde-fous (G1, G2)

| Bras | Utilisateurs G1 | Événements G1 | Jour G1 médiane [P10 ; P90] (min – max) | IMC de l’app à G1 médiane (min – max) | Utilisateurs G2 | Événements G2 | Jour du premier G2 médiane [P10 ; P90] | IMC de l’app au premier G2 médiane (min – max) | Échecs de reconstruction |
|---|---|---|---|---|---|---|---|---|---|
| K2 | 0 | 0 | — [— ; —] (— – —) | — (— – —) | 0 | 0 | — [— ; —] | — (— – —) | 0 |
| K2 + G | 32 | 32 | 126 [105 ; 153] (84 – 154) | 19,974 (19,950 – 19,999) | 79 | 79 | 84 [28 ; 154] | 24,868 (24,722 – 24,999) | 0 |

Aucun échec de reconstruction d’un garde-fou.

### Verdict A3.1 (tissus, blocs exclus retirés selon A5.4), K2 + G

| Critère | Objectif | Unité | Blocs (utilisateurs) | Médiane tissus [IC 95 %] | Bande | Statut |
|---|---|---|---|---|---|---|
| fenêtre | perte | w1 | 378 (189) | 1,011 [1,007 ; 1,018] | [0,950 ; 1,050] | passe |
| fenêtre | perte | w2 | 509 (184) | 0,988 [0,984 ; 0,992] | [0,950 ; 1,050] | passe |
| bloc | perte | b1 | 189 (189) | 1,028 [1,023 ; 1,033] | [0,900 ; 1,100] | passe |
| bloc | perte | b2 | 189 (189) | 1,001 [0,997 ; 1,003] | [0,900 ; 1,100] | passe |
| bloc | perte | b3 | 184 (184) | 0,983 [0,979 ; 0,990] | [0,900 ; 1,100] | passe |
| bloc | perte | b4 | 168 (168) | 0,991 [0,987 ; 0,997] | [0,900 ; 1,100] | passe |
| bloc | perte | b5 | 157 (157) | 0,989 [0,985 ; 0,992] | [0,900 ; 1,100] | passe |
| fenêtre | prise | w1 | 316 (158) | 1,043 [1,037 ; 1,048] | [0,950 ; 1,050] | passe |
| fenêtre | prise | w2 | 474 (158) | 1,011 [1,004 ; 1,014] | [0,950 ; 1,050] | passe |
| bloc | prise | b1 | 158 (158) | 1,060 [1,055 ; 1,064] | [0,900 ; 1,100] | passe |
| bloc | prise | b2 | 158 (158) | 1,025 [1,018 ; 1,030] | [0,900 ; 1,100] | passe |
| bloc | prise | b3 | 158 (158) | 1,009 [1,002 ; 1,013] | [0,900 ; 1,100] | passe |
| bloc | prise | b4 | 158 (158) | 1,009 [1,003 ; 1,013] | [0,900 ; 1,100] | passe |
| bloc | prise | b5 | 158 (158) | 1,013 [1,008 ; 1,016] | [0,900 ; 1,100] | passe |

**A3.1, K2 + G : PASSÉ.**

### Critères de A3.1 appliqués à K2 (rapporté, sans verdict)

| Critère | Objectif | Unité | Blocs (utilisateurs) | Médiane tissus [IC 95 %] | Bande | Statut |
|---|---|---|---|---|---|---|
| fenêtre | perte | w1 | 378 (189) | 1,010 [1,006 ; 1,017] | [0,950 ; 1,050] | passe |
| fenêtre | perte | w2 | 567 (189) | 0,986 [0,983 ; 0,990] | [0,950 ; 1,050] | passe |
| bloc | perte | b1 | 189 (189) | 1,028 [1,023 ; 1,033] | [0,900 ; 1,100] | passe |
| bloc | perte | b2 | 189 (189) | 0,999 [0,993 ; 1,002] | [0,900 ; 1,100] | passe |
| bloc | perte | b3 | 189 (189) | 0,984 [0,980 ; 0,990] | [0,900 ; 1,100] | passe |
| bloc | perte | b4 | 189 (189) | 0,986 [0,983 ; 0,991] | [0,900 ; 1,100] | passe |
| bloc | perte | b5 | 189 (189) | 0,987 [0,984 ; 0,990] | [0,900 ; 1,100] | passe |
| fenêtre | prise | w1 | 316 (158) | 1,043 [1,037 ; 1,048] | [0,950 ; 1,050] | passe |
| fenêtre | prise | w2 | 474 (158) | 1,011 [1,004 ; 1,014] | [0,950 ; 1,050] | passe |
| bloc | prise | b1 | 158 (158) | 1,060 [1,055 ; 1,064] | [0,900 ; 1,100] | passe |
| bloc | prise | b2 | 158 (158) | 1,025 [1,018 ; 1,030] | [0,900 ; 1,100] | passe |
| bloc | prise | b3 | 158 (158) | 1,009 [1,002 ; 1,013] | [0,900 ; 1,100] | passe |
| bloc | prise | b4 | 158 (158) | 1,009 [1,003 ; 1,013] | [0,900 ; 1,100] | passe |
| bloc | prise | b5 | 158 (158) | 1,013 [1,008 ; 1,016] | [0,900 ; 1,100] | passe |

### Médianes par fenêtre, blocs exclus retirés [IC 95 %]

| Bras | Objectif | Fenêtre | Blocs (utilisateurs) | Tissus | P10 / P90 tissus | Poids total |
|---|---|---|---|---|---|---|
| K2 | perte | semaines 5 à 12 | 378 (189) | 1,010 [1,006 ; 1,017] | 0,956 / 1,072 | 1,008 [1,005 ; 1,015] |
| K2 | perte | semaines 13 à 24 | 567 (189) | 0,986 [0,983 ; 0,990] | 0,932 / 1,018 | 0,991 [0,987 ; 0,994] |
| K2 | perte | semaines 5 à 24 | 945 (189) | 0,994 [0,990 ; 0,999] | 0,937 / 1,042 | 0,997 [0,994 ; 1,002] |
| K2 | prise | semaines 5 à 12 | 316 (158) | 1,043 [1,037 ; 1,048] | 0,975 / 1,084 | 1,048 [1,040 ; 1,057] |
| K2 | prise | semaines 13 à 24 | 474 (158) | 1,011 [1,004 ; 1,014] | 0,967 / 1,033 | 1,023 [1,019 ; 1,027] |
| K2 | prise | semaines 5 à 24 | 790 (158) | 1,018 [1,014 ; 1,021] | 0,968 / 1,065 | 1,030 [1,025 ; 1,034] |
| K2 + G | perte | semaines 5 à 12 | 378 (189) | 1,011 [1,007 ; 1,018] | 0,956 / 1,072 | 1,008 [1,005 ; 1,015] |
| K2 + G | perte | semaines 13 à 24 | 509 (184) | 0,988 [0,984 ; 0,992] | 0,951 / 1,019 | 0,993 [0,989 ; 0,997] |
| K2 + G | perte | semaines 5 à 24 | 887 (189) | 0,998 [0,993 ; 1,001] | 0,951 / 1,045 | 1,000 [0,995 ; 1,004] |
| K2 + G | prise | semaines 5 à 12 | 316 (158) | 1,043 [1,037 ; 1,048] | 0,975 / 1,084 | 1,048 [1,040 ; 1,057] |
| K2 + G | prise | semaines 13 à 24 | 474 (158) | 1,011 [1,004 ; 1,014] | 0,967 / 1,033 | 1,023 [1,019 ; 1,027] |
| K2 + G | prise | semaines 5 à 24 | 790 (158) | 1,018 [1,014 ; 1,021] | 0,968 / 1,065 | 1,030 [1,025 ; 1,034] |

### Médianes par bloc de 4 semaines, tissus, blocs exclus retirés [IC 95 %]

| Bras | Objectif | Semaines 5-8 | 9-12 | 13-16 | 17-20 | 21-24 |
|---|---|---|---|---|---|---|
| K2 | perte | 1,028 [1,023 ; 1,033] | 0,999 [0,993 ; 1,002] | 0,984 [0,980 ; 0,990] | 0,986 [0,983 ; 0,991] | 0,987 [0,984 ; 0,990] |
| K2 | prise | 1,060 [1,055 ; 1,064] | 1,025 [1,018 ; 1,030] | 1,009 [1,002 ; 1,013] | 1,009 [1,003 ; 1,013] | 1,013 [1,008 ; 1,016] |
| K2 + G | perte | 1,028 [1,023 ; 1,033] | 1,001 [0,997 ; 1,003] | 0,983 [0,979 ; 0,990] | 0,991 [0,987 ; 0,997] | 0,989 [0,985 ; 0,992] |
| K2 + G | prise | 1,060 [1,055 ; 1,064] | 1,025 [1,018 ; 1,030] | 1,009 [1,002 ; 1,013] | 1,009 [1,003 ; 1,013] | 1,013 [1,008 ; 1,016] |

### Blocs exclus des ratios (changement d’objectif du plan en cours de bloc)

| Bras | Objectif | Utilisateurs-blocs exclus | Utilisateurs concernés | Sem. 5-8 | 9-12 | 13-16 | 17-20 | 21-24 |
|---|---|---|---|---|---|---|---|---|
| K2 | perte | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| K2 | prise | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| K2 | maintien | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| K2 + G | perte | 22 | 22 | 0 | 0 | 3 | 13 | 6 |
| K2 + G | prise | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| K2 + G | maintien | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

### Différences appariées de médiane, tissus, blocs exclus retirés (bras b − bras a)

| a → b | Objectif | Fenêtre | Δ médiane [IC 95 %] |
|---|---|---|---|
| K2 → K2 + G | perte | semaines 5 à 12 | 0,001 [0,000 ; 0,004] |
| K2 → K2 + G | perte | semaines 13 à 24 | 0,001 [0,000 ; 0,003] |
| K2 → K2 + G | perte | semaines 5 à 24 | 0,003 [0,001 ; 0,005] |
| K2 → K2 + G | prise | semaines 5 à 12 | 0,000 [0,000 ; 0,000] |
| K2 → K2 + G | prise | semaines 13 à 24 | 0,000 [0,000 ; 0,000] |
| K2 → K2 + G | prise | semaines 5 à 24 | 0,000 [0,000 ; 0,000] |

### Strates (médiane du ratio tissulaire, blocs exclus retirés ; S3-D ; fins sous IMC 20 vrai)

| Strate | Valeur | Utilisateurs | K2 perte 5-12 / 13-24 | K2 prise 5-12 / 13-24 | K2 S3-D | K2 fins < IMC 20 | K2 + G perte 5-12 / 13-24 | K2 + G prise 5-12 / 13-24 | K2 + G S3-D | K2 + G fins < IMC 20 |
|---|---|---|---|---|---|---|---|---|---|---|
| sexe | female | 270 | 1,018 / 0,987 | 1,050 / 1,008 | 0,89 % [0,44 % ; 1,41 %] | 20 / 270 | 1,019 / 0,989 | 1,050 / 1,008 | 0,22 % [0,00 % ; 0,52 %] | 17 / 270 |
| sexe | male | 230 | 1,005 / 0,986 | 1,037 / 1,012 | 0,61 % [0,26 % ; 1,13 %] | 14 / 230 | 1,005 / 0,987 | 1,037 / 1,012 | 0,61 % [0,26 % ; 1,13 %] | 12 / 230 |
| classe d’IMC | 21 | 111 | 1,024 / 0,971 | 1,037 / 1,001 | 0,36 % [0,00 % ; 0,90 %] | 34 / 111 | 1,024 / 1,008 | 1,037 / 1,001 | 0,36 % [0,00 % ; 0,90 %] | 29 / 111 |
| classe d’IMC | 26 | 117 | 0,979 / 0,970 | 1,042 / 1,002 | 0,00 % [0,00 % ; 0,00 %] | 0 / 117 | 0,979 / 0,970 | 1,042 / 1,002 | 0,00 % [0,00 % ; 0,00 %] | 0 / 117 |
| classe d’IMC | 31 | 116 | 1,022 / 0,992 | 1,044 / 1,011 | 1,55 % [0,69 % ; 2,59 %] | 0 / 116 | 1,022 / 0,992 | 1,044 / 1,011 | 1,03 % [0,34 % ; 1,90 %] | 0 / 116 |
| classe d’IMC | 38 | 116 | 1,011 / 0,990 | 1,045 / 1,014 | 0,00 % [0,00 % ; 0,00 %] | 0 / 116 | 1,011 / 0,990 | 1,045 / 1,014 | 0,00 % [0,00 % ; 0,00 %] | 0 / 116 |
| classe d’IMC | case_R | 20 | 1,013 / 0,989 | — / — | 5,00 % [1,98 % ; 9,00 %] | 0 / 20 | 1,017 / 0,991 | — / — | 2,00 % [0,00 % ; 5,00 %] | 0 / 20 |
| classe d’IMC | case_S | 20 | 1,018 / 0,987 | — / — | 3,00 % [0,00 % ; 6,00 %] | 0 / 20 | 1,022 / 0,987 | — / — | 0,00 % [0,00 % ; 0,00 %] | 0 / 20 |
| activité | sedentary | 235 | 1,012 / 0,987 | 1,037 / 1,007 | 0,43 % [0,09 % ; 0,77 %] | 17 / 235 | 1,012 / 0,989 | 1,037 / 1,007 | 0,17 % [0,00 % ; 0,43 %] | 14 / 235 |
| activité | strength | 265 | 1,009 / 0,986 | 1,050 / 1,015 | 1,06 % [0,53 % ; 1,66 %] | 17 / 265 | 1,011 / 0,987 | 1,050 / 1,015 | 0,60 % [0,23 % ; 1,06 %] | 15 / 265 |
| objectif | prise | 158 | — / — | 1,043 / 1,011 | 0,00 % [0,00 % ; 0,00 %] | 0 / 158 | — / — | 1,043 / 1,011 | 0,00 % [0,00 % ; 0,00 %] | 0 / 158 |
| objectif | perte | 189 | 1,010 / 0,986 | — / — | 2,01 % [1,27 % ; 2,96 %] | 34 / 189 | 1,011 / 0,988 | — / — | 1,06 % [0,53 % ; 1,69 %] | 29 / 189 |
| objectif | maintien | 153 | — / — | — / — | 0,00 % [0,00 % ; 0,00 %] | 0 / 153 | — / — | — / — | 0,00 % [0,00 % ; 0,00 %] | 0 / 153 |
| vitesse demandée | 0,00 %/sem. | 153 | — / — | — / — | 0,00 % [0,00 % ; 0,00 %] | 0 / 153 | — / — | — / — | 0,00 % [0,00 % ; 0,00 %] | 0 / 153 |
| vitesse demandée | 0,25 %/sem. | 192 | 1,024 / 0,971 | 1,043 / 1,011 | 0,21 % [0,00 % ; 0,52 %] | 34 / 192 | 1,024 / 1,008 | 1,043 / 1,011 | 0,21 % [0,00 % ; 0,52 %] | 29 / 192 |
| vitesse demandée | 0,50 %/sem. | 54 | 1,033 / 1,001 | — / — | 0,00 % [0,00 % ; 0,00 %] | 0 / 54 | 1,033 / 1,001 | — / — | 0,00 % [0,00 % ; 0,00 %] | 0 / 54 |
| vitesse demandée | 1,00 %/sem. | 101 | 1,002 / 0,982 | — / — | 3,37 % [1,98 % ; 4,95 %] | 0 / 101 | 1,004 / 0,981 | — / — | 1,58 % [0,59 % ; 2,77 %] | 0 / 101 |

**Synthèse 4.2 : isolement passe ; A3.1 (K2 + G) : PASSÉ.**

## Exports quotidiens

- Export quotidien `ideal2c` : 52052 lignes, 154 utilisateurs (échantillon stratifié : 56 ; hors échantillon, avec un garde-fou déclenché : 98).

## Temps réel des lancements

```
2026-09-26T11:24:38+02:00 start pilot2c shards=12
2026-09-26T11:24:57+02:00 end pilot2c wall_s=19 failed_shards=0
2026-09-26T11:30:24+02:00 start ideal2c shards=16
2026-09-26T11:34:49+02:00 end ideal2c wall_s=265 failed_shards=0
```

