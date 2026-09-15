# 01 - REE and Initial TDEE Router

## Objective

Produce a defensible initial estimate of resting energy expenditure and maintenance energy expenditure without pretending that either is exact at the individual level.

The key design decision is:

- **REE** is routed to the most appropriate resting-energy method for the user's profile.
- **Initial maintenance TDEE** is anchored to the 2023 National Academies EER equation selected by PAL category.
- REE and component models are not multiplied by a generic activity factor to create the final maintenance estimate.

This avoids the classic `REE x 1.55` calculator design.

---

## 1. Eligible age range

Supported:

```text
19 <= age <= 65
```

For age 19 to 59, use the 2024 Adult Compendium for activity MET values.

For age 60 to 65, use the 2024 Older Adult Compendium for activity MET values where available. REE routing still uses the rules below because Mifflin-St Jeor was developed in adults aged 19 to 78.

Age above 65 is not a Wheighty v1 target.

---

## 2. REE variable and terminology

Use one canonical internal variable:

```text
ree_kcal_day
```

Do not mix BMR, RMR and REE as different interchangeable state fields.

UI copy should use a simple phrase such as `métabolisme au repos` unless the advanced scientific view is enabled.

---

## 3. REE routing order

### Route A: valid indirect calorimetry

A measured resting metabolic rate from indirect calorimetry is the primary REE anchor if all of the following are true:

- user explicitly states the method was indirect calorimetry;
- test age is 12 months or less;
- current body weight differs by less than 5 percent from body weight at the test;
- value is within a plausible sanity range of 700 to 4500 kcal/day;
- user is within Wheighty target scope.

If the method is unknown, the test is older, or weight changed by 5 percent or more, store the value as a **secondary reference** only and route normally.

The 12-month and 5-percent rules are Wheighty engineering rules. They are not claimed as universal clinical cutoffs. Their purpose is to prevent stale measurements from dominating the model.

Store:

```ts
type MeasuredRmr = {
  kcalPerDay: number;
  measuredAt: string;        // ISO date
  weightKgAtTest: number;
  method: "indirect_calorimetry" | "unknown";
  conditionsKnown: boolean;
};
```

If valid:

```text
ree_method = measured_indirect_calorimetry
ree_kcal_day = measured value
```

### Route B: athlete-like profile

Use the ten Haaf weight-based equation when all are true:

```text
19 <= age <= 35
structured_training_hours_week >= 6
structured_training_sessions_week >= 4
```

This intentionally uses a strict eligibility rule because the original ten Haaf cohort was composed of recreational athletes aged 18 to 35 who trained on average 9.1 +/- 5.0 hours/week and 5.0 +/- 1.8 sessions/week.

The exact 6-hour and 4-session thresholds are Wheighty engineering cutoffs designed to stay reasonably close to the derivation population. They are not validated biological boundaries.

Ten Haaf weight-based equation, kcal/day:

```text
REE = 11.936 * weight_kg
    + 587.728 * height_m
    - 8.129 * age_years
    + 191.027 * sex_male
    + 29.279
```

Where:

```text
sex_male = 1 for male physiological equation
sex_male = 0 for female physiological equation
```

Store:

```text
ree_method = ten_haaf_weight
```

### Route C: general adult

For all other supported users, use Mifflin-St Jeor.

Male physiological equation:

```text
REE = 10 * weight_kg
    + 6.25 * height_cm
    - 5 * age_years
    + 5
```

Female physiological equation:

```text
REE = 10 * weight_kg
    + 6.25 * height_cm
    - 5 * age_years
    - 161
```

Store:

```text
ree_method = mifflin_st_jeor
```

Mifflin was derived from 498 adults aged 19 to 78, including normal-weight and obese participants, with REE measured by indirect calorimetry.

---

## 4. Fat-free-mass equations: secondary checks only

Body-composition equations must **not** automatically replace the main REE route in v1.

This is deliberate. Consumer body-composition estimates can be too imprecise at individual level to justify changing the primary equation.

If a user supplies sufficiently credible FFM, compute secondary REE checks:

### ten Haaf FFM

```text
REE = 22.771 * ffm_kg + 484.264
```

### Cunningham 1980

```text
REE = 500 + 22 * ffm_kg
```

These values are diagnostics only.

Never calculate:

```text
Mifflin + "calories burned by lean mass"
```

That would double-count resting metabolism.

---

## 5. Body-composition quality levels

```ts
type BodyFatMethod =
  | "four_compartment"
  | "air_displacement_plethysmography"
  | "dxa"
  | "skinfold"
  | "consumer_bia"
  | "self_estimate";
```

Assign quality:

| Method | quality | FFM secondary check allowed |
|---|---:|---:|
| 4-compartment laboratory model | 1.00 | yes |
| ADP / BodPod | 0.90 | yes |
| DXA | 0.85 | yes |
| skinfolds | 0.60 | yes, low weight |
| consumer BIA | 0.30 | no routing, diagnostic only |
| self estimate | 0.10 | no |

These quality numbers are product weights, not measurement-error percentages.

A 2026 systematic review found consumer BIA generally non-equivalent to 4-compartment models at individual level, with body-fat limits of agreement commonly spanning 15 to 20 percentage points and FFM limits often exceeding +/-6 kg. Therefore BIA never changes the primary REE equation in v1.

---

## 6. REE disagreement flag

When a secondary FFM equation is available, calculate:

```text
relative_disagreement = abs(primary_ree - secondary_ree) / primary_ree
```

If:

```text
relative_disagreement > 0.10
```

then:

```text
ree_model_disagreement = true
```

Do not average the equations.

Instead:

- widen initial uncertainty;
- show no alarming UI warning;
- make the detail available in advanced scientific explanation.

---

## 7. NASEM 2023 EER equations

Use the National Academies 2023 adult TEE equations as the initial population TDEE anchor after automatic PAL classification.

All heights below are in centimeters, weights in kilograms, ages in years, output in kcal/day.

### Male, 19+

Inactive:

```text
EER = 753.07 - 10.83*age + 6.50*height_cm + 14.10*weight_kg
```

Low active:

```text
EER = 581.47 - 10.83*age + 8.30*height_cm + 14.94*weight_kg
```

Active:

```text
EER = 1004.82 - 10.83*age + 6.52*height_cm + 15.91*weight_kg
```

Very active:

```text
EER = -517.88 - 10.83*age + 15.61*height_cm + 19.11*weight_kg
```

### Female, 19+

Inactive:

```text
EER = 584.90 - 7.01*age + 5.72*height_cm + 11.71*weight_kg
```

Low active:

```text
EER = 575.77 - 7.01*age + 6.60*height_cm + 12.14*weight_kg
```

Active:

```text
EER = 710.25 - 7.01*age + 6.54*height_cm + 12.34*weight_kg
```

Very active:

```text
EER = 511.83 - 7.01*age + 9.07*height_cm + 12.56*weight_kg
```

PAL boundaries:

```text
inactive:    1.00 <= PAL < 1.53
low_active:  1.53 <= PAL < 1.68
active:      1.68 <= PAL < 1.85
very_active: 1.85 <= PAL < 2.50
```

PAL selection is defined in `02_ACTIVITY_NEAT_TEF.md`.

---

## 8. Initial TDEE field

After selecting PAL:

```text
initial_tdee_population_kcal_day = NASEM_EER(profile, pal_category)
```

This is the center of the initial maintenance distribution before personalization.

Do not calculate production maintenance as:

```text
REE * activity_multiplier
```

The REE and component model still matters for:

- PAL classification;
- explaining expenditure components;
- step-slider deltas;
- exercise deltas;
- explanatory TEF decomposition (the dynamic model uses its native TEF term, `02` section 9);
- uncertainty;
- consistency checks.

---

## 9. NASEM uncertainty prior

Use the NASEM standard error of predicted value as the starting TDEE uncertainty scale:

```text
female physiological equation: sigma = 241 kcal/day
male physiological equation:   sigma = 342 kcal/day
```

Approximate central 80-percent half-widths:

```text
female: 1.2816 * 241 ~= 309 kcal/day
male:   1.2816 * 342 ~= 438 kcal/day
```

Approximate 95-percent half-widths:

```text
female: 1.96 * 241 ~= 472 kcal/day
male:   1.96 * 342 ~= 670 kcal/day
```

The UI should show the central 80-percent interval as `Fourchette actuelle`.

When usable historical intake evidence was given at onboarding, the first result shows the warm-start posterior instead: maintenance = NASEM + posterior median, interval = posterior quantiles (`05` section 17). The population prior defined here is unchanged.

The 95-percent interval belongs only in advanced scientific details.

Do not show the range on Today.

---

## 10. Exact validation example

Official NASEM example:

```text
sex: female
age: 22
height: 165 cm
weight: 63 kg
PAL: low_active
expected EER: 2275 kcal/day
```

This must be an exact unit test within reasonable floating rounding.

---

## References

1. National Academies of Sciences, Engineering, and Medicine. Dietary Reference Intakes for Energy. 2023. NCBI Bookshelf NBK588659, NBK591021, NBK591020.
2. Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr. 1990;51(2):241-247. PMID 2305711.
3. ten Haaf T, Weijs PJM. Resting energy expenditure prediction in recreational athletes of 18-35 years. PLoS One. 2014;9(9):e108460. PMID 25275434.
4. O'Neill JER, Corish CA, Horner K. Accuracy of Resting Metabolic Rate Prediction Equations in Athletes. Sports Med. 2023;53:2373-2398. PMID 37632665.
5. Oliver CJ et al. The Validity of Bioelectrical Impedance Analysis Compared to a Four-Compartment Model in Healthy Adults. J Funct Morphol Kinesiol. 2026;11(1):65. PMID 41718193.
