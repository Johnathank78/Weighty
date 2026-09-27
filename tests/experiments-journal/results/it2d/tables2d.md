# Itération 2d : J* contre « cible choisie », tableaux et verdicts (reconstruits depuis les bruts)

Script : tests/experiments-journal/it2d/tables2d.experiment.ts. Ratios sur la masse tissulaire (A4.1), blocs à changement d’objectif exclus (A5.4, A6.5). Seuils : THRESHOLDS.md, amendement 7.

## 2. Contrôle 6.1 : repli (densité 0,90 et 0,75)

Basculés : 235 (0.9 : 122 basculés, 6 avec un plan J* ; 0.75 : 113 basculés, 0 avec un plan J*). Sans plan J* : 229, identiques au bras C sur les 168 jours : 229. Avec un plan J* malgré la densité : 6, identiques jusqu'à la veille : 6. Différences : 0.

**Contrôle 6.1 : PASSE.**

## 7. Décision de A7.5

V1 non exécutée, V2 non exécutée, V3 non exécutée, V4 non exécutée → J* NON RETENU.

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
```

