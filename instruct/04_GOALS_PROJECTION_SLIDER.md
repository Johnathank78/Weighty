# 04 - Goal Engine, Dynamic Projection and Calories/Steps Slider

## Objective

Translate the user's desired scenario into a safe, dynamic and internally consistent plan for:

- weight loss;
- maintenance;
- weight gain;
- calories;
- steps;
- projected time course.

Wheighty must never use the static rule `7700 kcal = 1 kg` as its weight-change model.

---

## 1. Dynamic weight model

Use the Kevin Hall adult dynamic body-weight model as the production trajectory model.

Reference implementation target:

- Hall KD et al. Lancet 2011, PMID 21872751;
- NIDDK Body Weight Planner equations and research documentation.

Implement the published adult model in TypeScript as a deterministic pure module.

The production variant is the Hall 2011 model used by the Body Weight Planner, with its **native TEF term** `beta_TEF * (EI - EI_baseline)`, `beta_TEF = 0.10`. This mode is used for goal solving, projections, the calories/steps slider and calibration. Macro-specific TEF coefficients never modify the trajectory and no external TEF term is ever added (`02` section 9). The full Hall 2006/2010 macronutrient model is not ported in v1.

Numerical integration: classical RK4 with a one-day step; a day is split into equal sub-steps when the glycogen equation is too stiff for a one-day step (very high carbohydrate intakes). Ordinary intakes, including all reference validation scenarios, keep one step per day.

### Baseline initialization

Before simulating an intervention, initialize the Hall model at a steady state that matches Wheighty rather than accepting an arbitrary default PAL:

```text
baseline_energy_intake = current Wheighty maintenance TDEE
baseline_body_weight   = current trend weight or onboarding weight if no trend exists
baseline_activity      = solve/set model physical-activity parameter so baseline TEE equals baseline energy intake
baseline_carb_share    = carbohydrate energy share of the Wheighty plan macros at maintenance calories
```

The model tracks glycogen and its water relative to the carbohydrate intake of the baseline diet. The baseline carbohydrate share is therefore aligned with the composition of the maintenance plan used as baseline, never a fixed 50 percent: with a fixed 50 percent, merely adopting a recommended split of 55 to 60 percent carbohydrate would look like water gain and the 42-day solver would wrongly compensate it as tissue. The same rule applies in calibration. For warm-start history, whose diet composition is unknown, the maintenance plan composition is the reference (`IMPLEMENTATION_NOTES` D-16).

At day 0 the initialized model must remain weight-stable when intake and activity are held at baseline. Add a test asserting less than 0.05 kg drift over 30 days at baseline.

If a personal calibrated TDEE exists, use that as the baseline energy intake. Otherwise use the initial maintenance estimate: NASEM-based, or NASEM plus the warm-start posterior median when historical intake evidence was used (`05` section 17).

Do not use a remote API.

Do not scrape the NIH tool at runtime.

The model must account for adaptation of energy expenditure and changing body composition over time.

Validation requirements are in `06_VALIDATION_TEST_PLAN.md`.

---

## 2. Goal speed: continuous weekly rate

The speed is a **continuous slider**. Its scientific variable is the weekly rate as a percentage of current body weight, never a universal kg/week value and never a fixed kcal deficit. Stored as a fraction (`0.005` = 0.5 percent per week).

Slider resolution: 0.05 percent per week.

### Weight loss

```text
range:         0.2 to 1.0 percent body weight / week
initial value: 0.5 percent / week (lowered to the profile maximum when needed)
hard maximum:  1.0 percent / week
```

### Weight gain

```text
range:         0.1 to 0.5 percent body weight / week
initial value: 0.25 percent / week
hard maximum:  0.5 percent / week
```

The gain range is intentionally conservative. Off-season resistance-training literature often suggests about 0.25 to 0.5 percent/week for novice/intermediate bodybuilders, with more conservative rates for advanced trainees.

### Maintenance

No speed slider. The maintenance zone logic of section 5 applies.

### Qualitative zones

`Douce`, `Modérée` and `Rapide` are labels for ranges of the slider, not presets:

```text
loss:  Douce < 0.375 %  <=  Modérée  < 0.625 %  <=  Rapide
gain:  Douce < 0.175 %  <=  Modérée  < 0.325 %  <=  Rapide
```

The boundaries are the midpoints between the former v1.0 presets (loss 0.25 / 0.5 / 0.75, gain 0.10 / 0.25 / 0.40). They are display rules only.

### Display

The selected rate is always shown precisely, together with its estimated equivalent for the person:

```text
0.5 % / sem.
≈ 0.34 kg / sem.      // 0.005 * 68 kg
```

The kg/week value is a display equivalent at the current weight; the goal solver uses the compound 42-day target of section 6.

---

## 3. Additional loss guardrails

Calculate BMI from current and target weight.

### Refuse clearly inappropriate target

```text
if target_bmi < 18.5:
    reject loss target
```

### Low-BMI rate limits

```text
if current_bmi < 20:
    loss plan unavailable
    offer maintenance

if 20 <= current_bmi < 22:
    max loss rate = 0.25 percent/week

if 22 <= current_bmi < 25:
    max loss rate = 0.50 percent/week

if current_bmi >= 25:
    max loss rate = 1.00 percent/week (absolute product max)
    rates above 0.75 percent/week stay selectable but show a "very demanding, short periods only" caution
```

These are conservative Wheighty product safety rules. BMI is used only as a coarse guardrail, not as a diagnosis. The 0.75 percent value was the "max selectable default" of the preset design; with the continuous slider it is a caution threshold (`IMPLEMENTATION_NOTES` D-22, to be validated).

### Selectable limit connected to the engine

The slider's upper bound is not decorative. It is the fastest rate on the slider grid that the goal engine accepts for this profile and this maintenance estimate:

1. BMI guardrail above;
2. calorie hard floor below;
3. feasible macros;
4. solver convergence.

The part of the track above that limit is shown as unavailable and cannot be selected, so the engine never silently refuses a selected speed. If a stored rate later becomes infeasible (for example after the trend weight changed), the engine applies the fastest feasible slower rate on the grid and the UI states it (`Vitesse ajustée à X % par semaine`).

### Minimum calorie policy

Hard lower product limit:

```text
absolute_min_calories = 1200 kcal/day for women, 1500 kcal/day for men
relative_min_calories = 0.70 * REE
hard_floor = max(absolute_min_calories, relative_min_calories)
```

If the selected goal would require calories below `hard_floor`, refuse that rate and select the fastest feasible slower rate on the slider grid. The selectable limit above prevents this in normal use.

Additionally show a soft warning when:

```text
calorie_target < REE
```

This is not a claim that intake below REE is inherently unsafe. It is a signal that the selected deficit is aggressive and deserves extra context.

The absolute floors (1200 kcal/day for women, 1500 kcal/day for men, since model 1.3.0, `IMPLEMENTATION_NOTES.md` D-32) are a conservative product policy aligned with the common recommendation not to go below these intakes without medical supervision, including NIDDK weight-loss material. They are not universal physiological requirements.

---

## 4. Energy availability guardrail for athletes

If all are true:

- athlete-like or high structured exercise load;
- credible FFM available from 4C, ADP/BodPod or DXA;

calculate:

```text
EA = (calorie_intake - exercise_energy_expenditure) / ffm_kg
```

This follows the IOC definition of energy availability.

Do not diagnose RED-S.

Do not use a universal hard threshold such as `EA < 30 = disease`.

Use it only as a caution signal:

```text
if EA < 30:
    show strong caution
    never pre-select a rate in the Rapide zone
```

The current IOC consensus describes low energy availability as a continuum and distinguishes adaptable from problematic LEA.

---

## 5. Maintenance mode

Maintenance is a first-class scenario.

Use a target zone centered on target weight:

```text
half_width_kg = clamp(0.0075 * target_weight_kg, 0.5, 1.0)
```

So:

```text
maintenance_low  = target_weight - half_width
maintenance_high = target_weight + half_width
```

If trend weight remains inside this zone, the maintenance goal is considered on track.

Do not overreact to one raw weigh-in outside the zone. Use trend weight.

---

## 6. Solving a calorie target

Do not convert the requested weekly change directly to a fixed kcal deficit.

For loss or gain:

1. Build a baseline state from current weight and calibrated or initial maintenance.
2. Take the requested weekly rate from the slider (snapped to the 0.05 percent grid).
3. Define a 42-day target body-weight path.
4. Use a bisection solver over calorie intake to find the constant daily intake that makes the Hall model's day-42 weight match the target implied by the requested weekly rate, with baseline step target and structured activity held constant.
5. Feed the candidate plan's carbohydrate intake to the Hall model; its native TEF term responds to the intake change. Do not add TEF a second time.
6. Enforce all guardrails.

Target weight at 42 days:

For loss:

```text
target_42d = current_weight * (1 - weekly_rate)^6
```

For gain:

```text
target_42d = current_weight * (1 + weekly_rate)^6
```

Bisection requirements:

```text
max iterations: 60
calorie residual tolerance: 1 kcal/day
weight target tolerance at day 42: 0.01 kg
```

If the full Hall implementation exposes a direct inverse solver, it may be used only if validated to the same standard.

---

## 7. Projection to final target

After finding the current daily plan, run the dynamic model forward until one of:

```text
target is reached
730 days reached
```

If target is not reached within 730 days, show no precise completion date. Display a message that the current plan does not produce a reliable target date in the projection window.

The UI must show:

- central projected path;
- uncertainty band;
- approximate weeks, not an exact guaranteed date.

Projection uncertainty should widen with horizon and is defined further in the calibration document.

---

## 8. Calories/steps slider principle

The slider changes the plan while preserving the same intended weight trajectory as closely as possible.

The slider is **not** a fixed conversion between steps and calories.

Inputs:

```text
baseline_calorie_target
baseline_step_target
baseline_weight_trajectory
user_profile
macro engine
step energy model
personal calibration
```

When steps change:

```text
step_delta_kcal = net_step_energy(new_steps) - net_step_energy(baseline_steps)
```

Then solve a new calorie target such that the Hall-model trajectory at day 42 remains as close as possible to the baseline plan.

This solve must also feed the new plan's carbohydrate intake to the Hall model; the model's native TEF term follows the new calorie intake. Do not add an external TEF delta on top of the Hall output.

Do not dynamically reclassify the user's NASEM PAL category while dragging the slider. PAL is part of the initial baseline. The slider applies local activity deltas around that baseline, which avoids discontinuities at category boundaries.

---

## 9. Slider limits

Recommended interactive range:

```text
minimum steps = max(2000, baseline_steps - 6000)
maximum steps = min(20000, baseline_steps + 10000)
```

Hard product limit:

```text
30000 steps/day
```

The slider must also stop before calorie intake would cross the calorie hard floor.

Suggested zones:

```text
recommended: within +/-3000 steps of baseline unless another bound is tighter
caution: outside recommended zone
blocked: safety/feasibility bound crossed
```

These are usability constraints, not claims that 20,001 steps are physiologically unsafe.

---

## 10. Step-target rounding

The slider can solve internally at full precision.

Displayed target:

```text
round to nearest 100 steps
```

After rounding, re-solve calories once using the rounded step target so the saved plan is internally consistent with what the user sees.

Displayed calorie target:

```text
round to nearest 10 kcal
```

After calorie rounding, accept a tiny trajectory difference. Never display single-kcal precision as a recommendation.

---

## 11. Weight-gain context

If user selects weight gain but reports less than two resistance-training sessions/week, do not block the goal.

Show a neutral context message:

```text
Une prise de poids rapide sans entraînement de résistance favorise moins la prise de masse maigre.
```

Do not claim the app can guarantee muscle gain.

---

## 12. Onboarding goal screen

The onboarding goal step (and the later goal-change sheet) shows:

- goal cards: loss, maintenance, gain;
- for loss and gain only, the target weight, then (onboarding: on its own screen) the continuous speed slider of section 2 with its precise percent, kg/week equivalent, qualitative zones, and the unavailable zone above the engine limit.

Maintenance asks for neither a target weight nor a speed: the target is the weight already entered and the weekly rate is 0.

The plan screen answers "what should I do?" (calories, steps, calories/steps balance, macros, practical rules). It shows at most a one-line estimated completion and a link to `Pourquoi ce résultat ?`; the weight trajectory lives in the tracking screen, not in a second projection block.

The slider limit is computed with the maintenance actually used for the plan, including the warm-start estimate when historical intake evidence was given; the calorie-history question therefore comes before the goal step.

---

## 13. Prohibited production shortcuts

Never use:

```text
7700 kcal = 1 kg
3500 kcal = 1 lb
fixed 500 kcal deficit for everyone
fixed kcal per 1000 steps
linear slider mock formulas from the design prototype
```

---

## References

1. Hall KD et al. Quantification of the effect of energy imbalance on bodyweight. Lancet. 2011;378:826-837. PMID 21872751.
2. NIDDK. Research Behind the Body Weight Planner.
3. NIDDK. Your Game Plan to Prevent Type 2 Diabetes: intake below 1200 kcal/day is not advised in that program context.
4. Iraki J et al. Nutrition Recommendations for Bodybuilders in the Off-Season. Sports. 2019. PMID 31247944.
5. Ruiz-Castellano C et al. Achieving an Optimal Fat Loss Phase in Resistance-Trained Athletes. Nutrients. 2021. PMID 34579132.
6. Mountjoy M et al. 2023 IOC consensus statement on Relative Energy Deficiency in Sport. Br J Sports Med. 2023.
