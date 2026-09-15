# 02 - Activity, NEAT, Steps and TEF

## Objective

Model activity well enough to:

- classify the initial PAL category;
- decompose activity in a meaningful way;
- compute marginal calorie changes when steps change;
- prevent double-counting between steps and structured exercise;
- treat unobserved NEAT honestly as residual uncertainty;
- include diet-induced thermogenesis without counting it twice.

The activity engine is **not** allowed to claim that every free-living calorie is directly measurable from questionnaire data.

---

## 1. Required onboarding inputs

### Steps

Ask:

```text
average_steps_7d
usual_walking_pace
```

`average_steps_7d` should be described to the user as the average of the last 7 days when available.

Walking pace enum:

```ts
type WalkingPace = "slow" | "normal" | "brisk";
```

### Occupation

```ts
type OccupationActivity = "seated" | "mixed" | "standing" | "physical";
```

### Structured activities

Allow several activities.

Each requires:

```ts
type StructuredActivity = {
  type:
    | "strength"
    | "running"
    | "walking"
    | "hiking"
    | "cycling"
    | "swimming"
    | "rowing"
    | "team_sport"
    | "other";
  sessionsPerWeek: number;
  durationMin: number;
  intensity: "light" | "moderate" | "vigorous";
};
```

Do not infer meaningful exercise energy from only `3 workouts/week`.

Frequency without duration and intensity is insufficient.

### Activities offered at onboarding

Daily steps already capture walking. A `Marche` or `Randonnée / marche sportive` choice would suggest entering the same walking twice, so neither is **offered**.

Offered choices:

```text
Musculation                    strength
Course                         running
Vélo                           cycling
Natation                       swimming
Sports collectifs              team_sport
Rameur                         rowing
Autre                          other
```

An exceptional hike can be entered through `Autre`. The `walking` and `hiking` types remain valid in the data contract and in the energy calculation for existing profiles (displayed as `Marche structurée` and `Randonnée / marche sportive`), still subject to the step and exercise overlap correction of section 5, but they are not offered to new users.

---

## 2. Step energy model

### 19 to 59 years

Use these Wheighty pace presets, derived from 2024 Adult Compendium walking entries and cadence literature:

| pace | cadence | MET | reference activity |
|---|---:|---:|---|
| slow | 80 steps/min | 2.8 | walking 2.0-2.4 mph |
| normal | 100 steps/min | 3.8 | walking 2.8-3.4 mph |
| brisk | 120 steps/min | 4.8 | walking 3.5-3.9 mph |

The cadence values are practical Wheighty heuristics. Around 100 steps/min is widely supported as a practical marker of absolutely defined moderate walking intensity in adults.

### 60 to 65 years

Use Older Adult Compendium MET60 values because that Compendium is designed for age 60+.

Wheighty v1 presets:

| pace | cadence | MET60 | reference activity |
|---|---:|---:|---|
| slow | 80 steps/min | 4.0 | walking 1.0-1.9 mph |
| normal | 100 steps/min | 5.3 | walking 2.8-3.2 mph |
| brisk | 115 steps/min | 6.0 | walking 3.3-3.7 mph |

MET60 uses a resting oxygen cost of 2.7 ml/kg/min rather than 3.5.

### Standard MET conversion

For age 19 to 59:

```text
gross_kcal_min = MET * 3.5 * weight_kg / 200
rest_kcal_min  = 1.0 * 3.5 * weight_kg / 200
net_kcal_min   = max(0, gross_kcal_min - rest_kcal_min)
minutes        = steps / cadence_steps_min
net_step_kcal  = net_kcal_min * minutes
```

For age 60 to 65:

```text
gross_kcal_min = MET60 * 2.7 * weight_kg / 200
rest_kcal_min  = 1.0 * 2.7 * weight_kg / 200
net_kcal_min   = max(0, gross_kcal_min - rest_kcal_min)
minutes        = steps / cadence_steps_min
net_step_kcal  = net_kcal_min * minutes
```

Use **net** activity calories because resting expenditure is already represented elsewhere.

Never display the step-energy estimate as exact.

---

## 3. Structured exercise MET table

Bundle a curated static activity table in the application. Do not fetch it at runtime.

For age 19 to 59, values come from the 2024 Adult Compendium.

Suggested initial mappings:

### Strength training

```text
light:    3.0 MET
moderate: 3.5 MET
vigorous: 6.0 MET
```

The moderate value aligns with multiple-exercise resistance training, 8-15 reps. Vigorous aligns with vigorous weight lifting/power lifting/bodybuilding.

### Running

Map by intensity:

```text
light:    7.5 MET   // general jogging
moderate: 9.3 MET   // around 6 mph
vigorous: 11.8 MET  // around 7.5 mph
```

### Cycling

Use curated Compendium entries. Suggested generic defaults:

```text
light:    4.0 MET
moderate: 6.8 MET
vigorous: 9.3 MET
```

### Swimming

Suggested generic defaults:

```text
light:    6.0 MET   // leisurely/general swimming
moderate: 7.0 MET
vigorous: 9.8 MET
```

### Rowing ergometer

Use a curated Compendium mapping appropriate to the intensity label. Do not invent a value if a source entry is not bundled.

### Hiking, walking and team sports

Use a curated Compendium mapping and mark them as `stepDominant = true`.

For age 60 to 65, use corresponding Older Adult Compendium entries where available and convert with the 2.7 ml/kg/min MET60 basis.

If an exact sport is missing, route to an explicit generic category with a documented MET. Do not silently guess.

---

## 4. Exercise energy formula

For standard MET activities:

```text
gross_kcal_min = MET * 3.5 * weight_kg / 200
rest_kcal_min  = 3.5 * weight_kg / 200
net_kcal_min   = max(0, gross_kcal_min - rest_kcal_min)
session_net_kcal = net_kcal_min * duration_min
weekly_net_kcal  = session_net_kcal * sessions_per_week
daily_avg_exercise_kcal = weekly_net_kcal / 7
```

For age 60 to 65 with MET60, replace 3.5 by 2.7.

---

## 5. Step and exercise overlap

This is mandatory.

### Step-dominant activities

Examples:

- running;
- walking;
- hiking;
- football and many field/team sports.

The user's daily step count is assumed to include those steps.

Do not add full exercise energy on top of full step energy.

For these activities calculate:

```text
exercise_extra_kcal = max(
  0,
  exercise_net_kcal - generic_step_energy_for_activity_steps
)
```

Estimate activity steps using:

```text
estimated_activity_steps = duration_min * activity_cadence
```

Use an activity-specific cadence if available. Otherwise use a documented conservative default and widen uncertainty.

Wheighty v1 values (both `engineering_prior`, never presented as universal physiological constants):

```text
RUNNING_CADENCE_STEPS_PER_MIN    = 160    // running
DEFAULT_CADENCE_SIGMA_MULTIPLIER = 1.15   // hiking / sport walking and team sports: usual walking-pace cadence, sigma widened
```

Structured walking from older profiles uses the walking-pace cadence matching its intensity. No running-cadence question is asked at onboarding.

### Non-step-dominant activities

Examples:

- strength training;
- cycling;
- swimming;
- rowing.

Add their full net exercise energy because normal phone step totals do not adequately represent the activity cost.

---

## 6. Occupation and NEAT

NEAT includes non-exercise activity such as locomotion, standing, household work, job tasks and spontaneous movement.

Wheighty must not pretend to measure all of NEAT precisely.

Split the concept internally:

```text
ambulatory_neat      -> mostly represented by steps
postural_occupation  -> occupation category
structured_exercise  -> exercise engine
residual_neat        -> latent, not directly observed
```

### Posture adjustment

A meta-analysis found standing averages about 0.15 kcal/min more than sitting.

Use only a conservative postural adjustment for PAL classification:

```text
seated:   0 kcal/day
mixed:   18 kcal/day   // about 2 h/day extra standing
standing:54 kcal/day   // about 6 h/day extra standing
physical:54 kcal/day, plus special routing rule below
```

Do not add arbitrary hundreds of kcal because someone selects `standing`.

### Physical occupation

A physical job is too heterogeneous for a single kcal constant.

Rule:

```text
if occupation == physical:
    PAL category cannot be lower than active
    initial uncertainty multiplier *= 1.15
```

The 1.15 is an engineering uncertainty multiplier, not a physiological coefficient.

---

## 7. Automatic PAL classification

The NASEM equations require a PAL category but directly identifying an individual's PAL from a simple questionnaire is difficult.

Wheighty uses a transparent factoral proxy only to choose the NASEM category.

### Step 1: compute factoral proxy

```text
ADL_PRIOR = 0.20 * REE
POSTURE   = occupation_posture_kcal
STEPS     = net_step_kcal
EXERCISE  = daily_avg_exercise_kcal_after_overlap
```

Assume a reference mixed-diet TEF of 10 percent of TEE for the classifier:

```text
provisional_tdee = (REE + ADL_PRIOR + POSTURE + STEPS + EXERCISE) / 0.90
provisional_pal  = provisional_tdee / REE
```

`ADL_PRIOR = 0.20 * REE` is a Wheighty engineering prior. It exists to represent non-step daily activity that is not captured by the explicit variables. It must be tested in the validation matrix and must not be described as a measured physiological quantity.

### Step 2: map to NASEM categories

```text
PAL < 1.53              -> inactive
1.53 <= PAL < 1.68      -> low_active
1.68 <= PAL < 1.85      -> active
1.85 <= PAL < 2.50      -> very_active
PAL >= 2.50             -> very_active + outlier flag
```

For physical occupation:

```text
pal_category = max(category_from_proxy, active)
```

### Step 3: boundary uncertainty

If the provisional PAL is within 0.05 of a category boundary:

```text
pal_boundary_flag = true
initial_sigma *= 1.15
```

Do not interpolate between two NASEM equations in v1.

---

## 8. Residual NEAT

After initial TDEE is obtained from NASEM:

```text
initial_tdee = nasem_eer
```

For explanatory decomposition only, calculate:

```text
reference_tef = 0.10 * initial_tdee
residual_neat = initial_tdee
              - ree
              - net_step_kcal
              - exercise_net_kcal_after_overlap
              - occupation_posture_kcal
              - reference_tef
```

Clamp only for display if needed, but keep the raw diagnostic internally.

Important:

`residual_neat` is a bookkeeping residual. It is **not measured NEAT** and must never be presented to the user as such.

After calibration, the user's personal TDEE correction absorbs much of this unobserved variation.

---

## 9. TEF engine

Macro-specific thermic effect coefficients are used for explanation, energy decomposition and diagnostics. The dynamic weight model uses its own native TEF term (see "Hall model integration" below).

Evidence-based ranges:

```text
protein:      20 to 30 percent
carbohydrate:  5 to 10 percent
fat:           0 to 3 percent
```

Wheighty central coefficients:

```text
TEF_PROTEIN = 0.25
TEF_CARB    = 0.075
TEF_FAT     = 0.025
```

Calculate:

```text
protein_kcal = protein_g * 4
carb_kcal    = carb_g * 4
fat_kcal     = fat_g * 9

tef_kcal = protein_kcal * 0.25
         + carb_kcal    * 0.075
         + fat_kcal     * 0.025
```

The protein and carbohydrate coefficients are range midpoints. The fat coefficient 0.025 sits inside the published 0 to 3 percent range (it is the value used in the Hall 2006 macronutrient model, which Wheighty does not run). These are explanatory parameters, not universal biological constants.

### Hall model integration

Wheighty's production dynamic model is the adult model of Hall et al. 2011 (NIDDK Body Weight Planner). It represents diet-induced thermogenesis with its native term:

```text
TEF(t) = beta_TEF * (EI(t) - EI_baseline)
beta_TEF = 0.10
```

This native term is the only TEF used by goal solving, projections, the calories/steps slider and calibration.

- The macro-specific coefficients above never modify the Hall trajectory. The model's daily input carries no TEF value, so no TEF can be counted twice.
- Macro composition reaches the Hall model only through carbohydrate intake (glycogen and associated water).
- The full Hall 2006/2010 macronutrient metabolism model (oxidation, gluconeogenesis, ketogenesis) is not ported in v1.

The standalone macro-specific TEF function is used for:

- explanatory decomposition;
- detailed scientific display;
- diagnostics;
- isolated unit tests.

### Avoiding double counting

NASEM EER already represents total free-living energy expenditure and therefore already contains diet-induced thermogenesis.

Define:

```text
reference_tef = 0.10 * baseline_tdee
tef_delta = calculated_tef - reference_tef
```

`tef_delta` is an explanatory quantity (for example in the detailed decomposition). In the dynamic model, the only intake-dependent TEF is the native Hall term above.

Never do:

```text
TDEE = NASEM_EER + full_TEF
```

After personal calibration, the calibrated TDEE also already contains the TEF of the observed plan.

---

## 10. Solver interaction

When the goal or step slider changes calorie intake, the macro plan changes. With the native Hall TEF, the macro plan affects the trajectory only through its carbohydrate intake (glycogen and water).

The calorie solver evaluates, for each candidate:

```text
candidate calories
 -> macro engine (carbohydrate intake)
 -> Hall 2011 model with native TEF
 -> day-42 weight
 -> next candidate calories
```

Use bisection or another deterministic root solver.

Acceptance criteria:

```text
absolute energy residual < 1 kcal/day
max 50 iterations
```

---

## References

1. Herrmann SD et al. 2024 Adult Compendium of Physical Activities. PMID 38242596.
2. Older Adult Compendium of Physical Activities. PMID 38242593.
3. Compendium of Physical Activities, pacompendium.com, official activity tables.
4. Slaght J et al. Walking Cadence to Exercise at Moderate Intensity for Adults. 2017. PMID 28459099.
5. Saeidifard F et al. Differences of energy expenditure while sitting versus standing. Eur J Prev Cardiol. 2018. PMID 29385357.
6. Tappy L. Thermic effect of food and sympathetic nervous system activity in humans. Reprod Nutr Dev. 1996. PMID 8878356.
7. National Academies of Sciences, Engineering, and Medicine. Dietary Reference Intakes for Energy. 2023.
