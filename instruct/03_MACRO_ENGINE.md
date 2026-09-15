# 03 - Macronutrient Engine

## Objective

Generate protein, fat and carbohydrate targets that are compatible with the user's goal, activity and calorie target without relying on arbitrary percentage splits.

The macro engine must satisfy:

```text
4 * protein_g + 4 * carbs_g + 9 * fat_g ~= calorie_target
```

within rounding tolerance.

The macro targets are recommendations for healthy adults in Wheighty's target domain, not medical nutrition therapy.

---

## 1. Reference body weight for protein and fat floors

Using total body weight blindly can create extreme protein targets in obesity.

Wheighty uses a transparent reference-weight rule.

Calculate:

```text
height_m = height_cm / 100
bmi = weight_kg / height_m^2
bmi25_weight = 25 * height_m^2
```

### General reference weight

Continuous rule (model 1.1.0):

```ts
const bmi25Weight = 25 * heightM ** 2;

const nutritionReferenceWeight =
  actualWeightKg <= bmi25Weight
    ? actualWeightKg
    : bmi25Weight + 0.33 * (actualWeightKg - bmi25Weight);
```

```text
NUTRITION_REFERENCE_BMI             = 25     // engineering_prior
NUTRITION_REFERENCE_EXCESS_FRACTION = 0.33   // engineering_prior, documented in CONSTANT_METADATA
```

This is a Wheighty engineering normalization rule. It is not an "ideal weight" and must never be presented as a clinical ideal-body-weight formula. The 0.33 coefficient remains to be validated.

Its purpose is to prevent obviously excessive g/kg recommendations at high body weight without any discontinuity: the function is continuous and non-decreasing, in particular around BMI 25 and BMI 30. The former step rule (actual weight below BMI 30, BMI 25 weight above) is abandoned.

The reference weight is used everywhere a g/kg nutrition rule applies: protein targets, fat floor, carbohydrate performance flags.

### Athlete override

If all are true:

- `athlete_like == true` from the REE router;
- high-quality body composition method is available: 4C, ADP/BodPod or DXA;
- FFM value is plausible;

then protein rules that explicitly use FFM may use measured FFM instead of the nutrition reference weight. This high-quality FFM rule keeps priority where section 2 allows it.

Consumer BIA and visual estimates do not activate this override.

---

## 2. Protein targets

Use the following central recommendations.

### Maintenance or gain, no regular exercise

```text
protein_g = 1.2 * nutrition_reference_weight
```

### Regular endurance or mixed exercise, maintenance/gain

```text
protein_g = 1.6 * nutrition_reference_weight
```

### Resistance training, maintenance/gain

```text
protein_g = 1.6 * nutrition_reference_weight
```

### Weight loss, no resistance training

```text
protein_g = 1.6 * nutrition_reference_weight
```

### Weight loss with resistance training

```text
protein_g = 1.8 * nutrition_reference_weight
```

### Lean, athlete-like, resistance-trained weight loss with high-quality FFM

Use:

```text
protein_g = max(
    1.8 * nutrition_reference_weight,
    2.3 * ffm_kg
)
```

Then apply the general v1 cap below.

### General product cap

Wheighty v1 does not intentionally prescribe more than:

```text
2.2 g protein / kg actual body weight / day
```

So:

```text
protein_g = min(protein_g, 2.2 * actual_weight_kg)
```

This is deliberately conservative. Literature in resistance-trained athletes during hypocaloric phases sometimes supports higher intakes, but Wheighty v1 does not need to push the top of those ranges.

---

## 3. Fat target

Adult AMDR for fat is 20 to 35 percent of energy.

Use a central target that leaves room for carbohydrate:

```text
if endurance_heavy:
    target_fat_fraction = 0.25
else:
    target_fat_fraction = 0.30
```

Set a practical gram floor:

```text
fat_floor_g = 0.6 * nutrition_reference_weight
```

Then:

```text
fat_target_g = max(
    target_calories * target_fat_fraction / 9,
    fat_floor_g,
    target_calories * 0.20 / 9
)
```

The 0.6 g/kg floor sits conservatively within sports-nutrition ranges that commonly include 0.5 g/kg as a lower bound. The 20-percent floor preserves the adult AMDR lower boundary.

If this creates an infeasible calorie budget after protein, the plan itself is too aggressive. Do not force carbohydrates negative. The goal engine must raise the calorie target or reject the requested speed.

Do not display claims such as `never below 0.8 g/kg for hormones`.

---

## 4. Carbohydrate target

Carbohydrate receives the remaining calories:

```text
remaining_kcal = target_calories
               - 4 * protein_g
               - 9 * fat_g

carbs_g = remaining_kcal / 4
```

If `carbs_g < 0`, the plan is infeasible and must be rejected by the goal engine.

### Performance context

Do not force a universal carbohydrate minimum that breaks the energy target.

Instead, define performance guidance flags:

```text
low_carb_for_endurance = endurance_heavy
                      && carbs_g < 3.0 * nutrition_reference_weight
```

For resistance training:

```text
low_carb_for_resistance = resistance_training
                       && carbs_g < 2.0 * nutrition_reference_weight
```

These are soft performance flags, not hard health limits.

The 3 to 5 g/kg range is consistent with lower-end sports recommendations for training support, while higher endurance workloads can require substantially more.

---

## 5. Activity classification for macros

```ts
type MacroActivityClass =
  | "sedentary"
  | "endurance"
  | "resistance"
  | "mixed";
```

Official v1 routing:

```text
resistance criteria  = strength sessions >= 2/week AND strength minutes >= 60/week
endurance volume     = running + cycling + swimming + rowing + hiking minutes >= 150/week

mixed      = resistance criteria met AND endurance volume >= 150 min/week
resistance = resistance criteria met (and not mixed)
endurance  = endurance volume >= 150 min/week AND strength < 2 sessions/week
sedentary  otherwise
```

The earlier wording "mixed if both resistance and endurance criteria are met" could never be true, because the endurance class requires fewer than 2 strength sessions. The definition above is the validated one (`IMPLEMENTATION_NOTES` D-14).

For `mixed`, use resistance protein rules and endurance-aware carbohydrate guidance.

---

## 6. Rounding algorithm

1. Calculate all macros in full precision.
2. Round protein to nearest 1 g.
3. Round fat to nearest 1 g.
4. Calculate carbohydrate from remaining calories.
5. Round carbohydrate to nearest 1 g.
6. Calculate final energy difference.
7. Correct carbohydrate by the minimum integer grams needed to keep displayed macro energy within +/-5 kcal of displayed target when possible.

Internal energy calculations retain full precision.

---

## 7. Macro and TEF loop

The macro engine must be a pure function of:

```text
profile
activity_class
objective
calorie_target
```

The explanatory TEF engine consumes the macro output. The Hall model only consumes its carbohydrate intake (`02` section 9).

Goal/slider solving can call the macro engine repeatedly.

Do not let macro state become an independent mutable source of truth.

---

## 8. Special handling in obesity

Obesity is supported.

Rules:

- TDEE still uses NASEM EER for actual weight and selected PAL.
- Protein/fat gram normalization uses the continuous nutrition reference weight of section 1 above the BMI 25 weight, unless the high-quality athlete FFM override applies.
- Do not reduce the TDEE weight input to the reference weight.
- Do not assume a person with obesity has low activity.
- Do not use consumer BIA to infer metabolically active mass with high confidence.

---

## 9. UI wording

Prefer:

```text
Protéines: 165 g
Glucides: 230 g
Lipides: 70 g
```

Advanced explanations may state the rule selected, for example:

```text
Tes protéines sont ajustées à ton objectif et à ton entraînement de résistance.
```

Avoid categorical physiological claims that exceed the evidence.

---

## References

1. Jager R et al. International Society of Sports Nutrition Position Stand: protein and exercise. JISSN. 2017. PMID 28642676.
2. Hector AJ, Phillips SM. Considerations for protein intake in managing weight loss in athletes. Eur J Sport Sci. 2018. PMID 25014731.
3. Helms ER et al. A systematic review of dietary protein during caloric restriction in resistance trained lean athletes. Int J Sport Nutr Exerc Metab. 2014. PMID 24092765.
4. Ueshima J et al. Enhanced protein intake on maintaining muscle mass in adults with overweight/obesity. Clin Nutr ESPEN. 2024. PMID 39002131.
5. Iraki J et al. Nutrition Recommendations for Bodybuilders in the Off-Season. Sports. 2019. PMID 31247944.
6. Institute of Medicine. Dietary Reference Intakes, AMDR: adults fat 20-35 percent, carbohydrate 45-65 percent, protein 10-35 percent. NCBI Bookshelf NBK208874.
