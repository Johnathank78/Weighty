# 08 - Reference Notes and Evidence Hierarchy

This file summarizes which Wheighty decisions are directly source-backed and which are deliberate product engineering decisions.

## Directly source-backed foundations

### NASEM 2023 EER

The 2023 National Academies adult energy equations are based on total energy expenditure datasets measured primarily using doubly labelled water. They publish sex-specific equations by PAL category and quantify individual prediction uncertainty.

Adult SEPV values used by Wheighty:

```text
women: 241 kcal/day
men:   342 kcal/day
```

NASEM explicitly recommends monitoring body weight over time and adjusting intake because individual requirements may differ substantially from EER.

### Mifflin-St Jeor

Derived using indirect calorimetry in 498 healthy adults aged 19 to 78, including normal-weight and obese adults.

### ten Haaf

Developed in recreational athletes aged 18 to 35. Original cohort averaged about 9.1 h/week and 5 sessions/week. A 2023 meta-analysis found the ten Haaf equation among the best-performing athlete-specific equations, with the weight-based equation particularly precise.

### Consumer BIA caution

A 2026 systematic review against 4-compartment models reported wide individual limits of agreement for body-fat percentage and FFM. Wheighty therefore refuses to use consumer BIA as a primary REE-routing trigger.

### Activity Compendium

The 2024 Adult Compendium is tailored to ages 19 to 59.

The Older Adult Compendium is designed for age 60+ and defines MET60 using 2.7 ml O2/kg/min.

Wheighty uses the older-adult activity table only for ages 60 to 65 because >65 is outside v1 scope.

### TEF

Published ranges used:

```text
protein: 20-30 percent
carbohydrate: 5-10 percent
fat: 0-3 percent
```

Wheighty uses 0.25 for protein and 0.075 for carbohydrate. For fat it uses 0.025, inside the 0 to 3 percent empirical range. These coefficients serve explanation and energy decomposition only; they do not drive the weight trajectory.

### Dynamic weight model

Hall et al. 2011 provides the dynamic adult weight model underpinning the NIH/NIDDK Body Weight Planner and explicitly rejects static linear weight-change rules. Wheighty runs this model with its native thermic-effect term (`beta_TEF = 0.10` applied to the intake change). The Hall 2006/2010 macronutrient model is not used.

Validation status: the TypeScript port matches a line-by-line transcription of the `bw` package (numerical port validation). Manual comparisons with the official planner are planned (`06` section 11) and are not an independent biological validation either.

### Protein and sports nutrition

Sports-position statements and reviews support roughly 1.4-2.0 g/kg/day for most exercising adults, higher intakes during energy restriction in lean resistance-trained athletes, and conservative rates of weight loss/gain to preserve body composition.

## Wheighty engineering decisions

These are deliberately chosen product rules and must not be represented as universally validated biological cutoffs:

- athlete routing threshold of 6 h/week and 4 sessions/week;
- measured RMR validity window of 12 months and 5 percent body-weight change;
- body-composition quality scores;
- 10 percent REE disagreement flag;
- PAL classifier `ADL_PRIOR = 0.20 * REE`;
- PAL-boundary distance of 0.05;
- PAL uncertainty multiplier 1.15;
- physical-job uncertainty multiplier 1.15;
- walking pace cadence presets;
- running cadence 160 steps/min and default-cadence uncertainty multiplier 1.15;
- continuous nutrition reference weight: BMI 25 weight plus 0.33 of the excess weight (not an ideal weight);
- protein target centers chosen inside evidence-supported ranges;
- 0.6 g/kg nutrition-reference-weight fat floor;
- weekly-rate slider ranges (loss 0.2 to 1.0 percent, gain 0.1 to 0.5 percent), initial values, qualitative zone boundaries, BMI rate caps and the 0.75 percent caution threshold;
- 1200 kcal product floor and 0.70*REE relative floor;
- maintenance zone width rule;
- 42-day goal-solver horizon;
- slider usability limits;
- calibration Student-t df=4 and 0.60 kg scale;
- calibration starting-weight nuisance grid (+/-3 kg by 0.05 kg);
- adherence likelihood weights;
- first recalibration gate;
- confidence-width thresholds;
- recalibration notification thresholds;
- warm-start rules: 7-day minimum, intake reporting SD of 10 / 20 / 30 percent by tracking quality, +200 kcal/day when activity is not comparable, 100 kcal/day structural floor, coherence bound +/-1200 kcal/day (display signal only since model 1.2.0, value still to be sourced), evidence support half-width 3000 kcal/day, predictive conflict threshold z = 2, medium-confidence width ratio 0.75;
- model-mismatch benchmark criteria at 42 days (median absolute error 175 kcal/day, coverage 0.70 and 0.90).

These decisions are not hidden. They are versioned and validated through simulation. Changing them requires a scientific model version bump and tests.

## Source identifiers

- NASEM 2023 Dietary Reference Intakes for Energy: NCBI Bookshelf NBK588659, NBK591034, NBK591021, NBK591020.
- Mifflin et al. PMID 2305711.
- ten Haaf et al. PMID 25275434.
- O'Neill et al. PMID 37632665.
- Oliver et al. PMID 41718193.
- 2024 Adult Compendium PMID 38242596.
- Older Adult Compendium PMID 38242593.
- Walking cadence systematic review PMID 28459099.
- Sitting vs standing meta-analysis PMID 29385357.
- TEF review PMID 8878356.
- ISSN protein position stand PMID 28642676.
- Overweight/obesity protein meta-analysis PMID 39002131.
- Off-season bodybuilding review PMID 31247944.
- Resistance-trained fat-loss review PMID 34579132.
- Hall dynamic model PMID 21872751.
- IOC RED-S consensus statement, Br J Sports Med 2023;57:1073-1097.
