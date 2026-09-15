# 06 - Scientific Validation and Acceptance Test Plan

## Objective

No scientific engine ships because it "looks plausible".

Wheighty v1 must pass deterministic unit tests, golden reference profiles, property tests, simulation-recovery tests and end-to-end invariants.

All scientific functions should be pure functions wherever possible.

---

## 1. Test layers

Required:

```text
unit tests
reference/golden tests
property tests
simulation recovery tests
end-to-end scenario tests
static policy checks
```

Target framework can be Vitest if the app uses Vite/TypeScript.

---

## 2. REE unit tests

### Mifflin-St Jeor

Implement direct formula tests for both sexes.

Example male:

```text
age 30
height 180 cm
weight 80 kg
expected = 10*80 + 6.25*180 - 5*30 + 5 = 1780 kcal/day
```

Example female:

```text
age 30
height 165 cm
weight 60 kg
expected = 10*60 + 6.25*165 - 5*30 - 161 = 1320.25 kcal/day
```

Tolerance:

```text
1e-9 before UI rounding
```

### ten Haaf

Test both sex values and verify height is in meters.

Add an explicit regression test preventing accidental use of centimeters.

---

## 3. NASEM EER exact tests

Implement exact formula tests for all 8 adult sex/PAL equations.

Mandatory official example:

```text
female
22 years
165 cm
63 kg
low active
expected EER = 2275 kcal/day
```

Tolerance:

```text
<= 1 kcal due to floating arithmetic
```

Also add the official-style male example:

```text
male
45 years
175 cm
100 kg
low active
expected approximately 3041 kcal/day
```

---

## 4. Router tests

Test every route boundary:

- age 19 accepted;
- age 65 accepted;
- age 18 rejected;
- age 66 rejected;
- valid indirect calorimetry selected;
- indirect calorimetry older than 12 months falls back;
- current weight more than 5 percent from test weight falls back;
- athlete age 35, 6 h/week, 4 sessions routes to ten Haaf;
- athlete age 36 routes to Mifflin;
- 5.9 h/week does not activate athlete route;
- consumer BIA never activates an FFM primary route.

---

## 5. Step-energy tests

Properties:

```text
more steps => non-decreasing net step kcal
higher body weight => higher step kcal for same pace/steps
brisk pace => different energy estimate than slow pace
0 steps => 0 net step kcal
net step kcal >= 0
```

Test age 59 vs 60 routes to the correct Compendium basis.

---

## 6. Exercise tests

Properties:

```text
0 duration => 0 kcal
0 sessions => 0 daily-average kcal
vigorous >= moderate for same mapped activity
net kcal < gross kcal for MET > 1
```

### Overlap tests

For running:

- daily steps include estimated run steps;
- full run energy is not added on top of step energy;
- only intensity premium is added.

For cycling:

- cycling energy is added in full as non-step-dominant exercise.

---

## 7. PAL classifier tests

Test exact category boundaries:

```text
1.5299 -> inactive
1.5300 -> low_active
1.6799 -> low_active
1.6800 -> active
1.8499 -> active
1.8500 -> very_active
```

Test boundary flag within 0.05.

Test physical occupation cannot be below active.

Property:

Increasing steps or exercise while all else stays equal must never decrease provisional PAL.

---

## 8. TEF tests

Example:

```text
protein = 160 g
carbs = 250 g
fat = 70 g
```

Expected central TEF:

```text
protein: 160*4*0.25  = 160.00
carbs:   250*4*0.075 = 75.00
fat:      70*9*0.025 = 15.75
TOTAL                  = 250.75 kcal
```

Tolerance:

```text
1e-9
```

Add a regression test proving NASEM EER never receives full TEF as an additive term.

Add tests proving TEF cannot be counted twice in the dynamic model:

- the production Hall model uses only its native term `0.10 * (EI - EI_baseline)`;
- the Hall daily input has no TEF field and the model does not depend on the macro-specific TEF module;
- two plans with equal calories and carbohydrate but different protein follow identical trajectories.

---

## 9. Macro tests

For at least 50 fixture profiles:

```text
protein >= 0
fat >= 0
carbs >= 0
macro kcal within +/-5 kcal of displayed calorie target after rounding
protein <= 2.2 g/kg actual body weight
fat >= 20 percent of energy unless plan is rejected as infeasible
```

Reference weight and obesity tests:

- reference weight = actual weight up to the BMI 25 weight, then BMI 25 weight + 0.33 of the excess;
- continuity and monotonicity around BMI 25 and BMI 30 for several heights (no step, no exemption);
- protein, fat floor and carbohydrate move continuously across BMI 25 and BMI 30;
- actual body weight remains unchanged for TDEE equations;
- BIA does not override FFM routing.

Macro class tests: `mixed` exactly when resistance criteria are met and endurance volume is at least 150 min/week.

---

## 10. Goal-engine tests

Continuous rate:

```text
loss range 0.2 to 1.0 percent/week, initial 0.5; gain range 0.1 to 0.5, initial 0.25
faster requested loss rate => strictly lower calories
qualitative zones Douce / Modérée / Rapide map ranges, not presets
maintenance: rate always 0, no slider
```

BMI safety:

- target BMI <18.5 rejected;
- current BMI <20 cannot create weight-loss plan;
- BMI 20-21.99 caps loss at 0.25 percent/week;
- BMI 22-24.99 caps loss at 0.50 percent/week;
- BMI >=25 caps loss at the 1.0 percent/week product maximum.

Selectable limit:

- the slider maximum equals the fastest grid rate accepted by the engine (guardrail, calorie floor, macros, convergence);
- a plan at the selectable maximum is never adjusted; one step above is adjusted back to it, visibly.

Calorie safety:

- no saved plan under hard floor;
- slider cannot cross hard floor.

---

## 11. Hall model validation

This is release-blocking.

Implement at least 12 reference scenarios spanning:

- female/male physiological equations;
- age 20s, 40s, 60-65;
- BMI normal, overweight, obese;
- loss and gain;
- calorie change only;
- physical-activity change;
- 90, 180 and 365 day horizons.

Compare the TypeScript implementation with an authoritative Hall-model implementation or published reference output.

Preferred references:

- NIDDK Body Weight Planner research equations;
- the original published model equations/code;
- a reproducible independent implementation based on the Hall equations, with its license respected.

Acceptance tolerances:

```text
predicted body weight difference <= 0.20 kg at 90 days
<= 0.35 kg at 180 days
<= 0.50 kg at 365 days
```

If these cannot be achieved, do not hide the discrepancy. Fix the port or document a scientifically justified reason before release.

The reference validation runs in the production mode (native Hall 2011 TEF). Wheighty v1 validates against a line-by-line transcription of the `bw` package: this is a **validation of the numerical port**, not an independent biological validation.

Also test numerical stability: a stiff glycogen equation (very high carbohydrate intake) must not make the one-day integration diverge (one-day and 0.1-day steps agree, glycogen stays positive), and ordinary intakes keep one RK4 step per day.

### Manual comparisons with the NIDDK Body Weight Planner (future)

Not release-blocking. When done, record a few manual runs of the official planner here:

| Date | Planner inputs (sex, age, height, weight, activity, intake change) | Planner weight at day 90 / 180 / 365 | Wheighty weight | Difference |
|---|---|---|---|---|
| | | | | |

Use the same baseline maintenance and intake change in both tools; note any input the planner derives differently (for example its own baseline PAL).

---

## 12. Slider invariants

Across random valid profiles:

```text
moving toward more steps must not reduce allowed calories
moving toward fewer steps must not increase allowed calories
trajectory at day 42 should stay within 0.05 kg of baseline trajectory when within slider range
saved calories respect floor
saved steps respect range
no discontinuity occurs at NASEM PAL boundaries while dragging
```

The slider must never use a hard-coded linear kcal/step relationship.

Static test: fail if prototype mock expressions or equivalent constants are copied into production scientific code.

---

## 13. Calibration simulation recovery

Create synthetic users with known TDEE offsets:

```text
-500, -300, -150, 0, +150, +300, +500 kcal/day
```

For each, simulate:

- 120 days (every horizon below reuses the same simulated users);
- weight noise with heavy tails;
- weigh-in every 1 day and every 3 days;
- 0, 10 and 25 percent minor-deviation days;
- occasional major-deviation days;
- missing step logs.

The truth is the apparent maintenance offset, the estimand of the calibration (`05` section 1, model 1.3.0): the metabolic offset minus the mean intake eaten above the day's target over the window. The metabolic offset is reported for information.

Recovery acceptance after 28 days with at least 8 usable weights, and again at 42, 84 and 120 days:

```text
median absolute error of posterior-median TDEE <= 125 kcal/day
80-percent posterior interval contains the apparent offset in at least 70 percent of simulated users
95-percent interval contains the apparent offset in at least 90 percent of simulated users
```

These empirical coverage targets are intentionally slightly below nominal because the simulator will not perfectly reproduce all model assumptions. The 84- and 120-day horizons (added in model 1.3.0) guard against intervals that keep shrinking while the model error does not. If the engine performs substantially worse, report the metrics and causes first; recalibrating likelihood scale or weights is a scientific decision that requires explicit approval and a model version bump.

### Benchmark with model mismatch (distinct from the ideal benchmark)

Keep the ideal simulation above, and add a separate benchmark in which the simulated world does **not** follow the estimator's assumptions. At 42 and 84 days, same offsets, frequencies and profiles, scenarios:

```text
A  unmodelled energy drift reaching about +/-100 to +/-150 kcal/day
B  hidden intake +200 to +500 kcal on some days, declared "plan respecté", undeclared or unknown adherence
C  step counter with a systematic +/-10 to +/-15 percent bias
D  autocorrelated water noise (deviations that persist several days), not only independent daily noise
E  water episodes of about +/-0.5 to +/-1.0 kg without any energy change
F  combination of the above
```

Wheighty v1 criteria at 42 and 84 days (product criteria, not published physiological constants):

```text
median absolute error <= 175 kcal/day
80-percent interval coverage >= 0.70
95-percent interval coverage >= 0.90
```

The truth used is the apparent offset: the world's mean metabolic offset over the window minus the mean intake eaten above the targets (declared deviations and hidden intake). The errors against the window-mean and end-of-window metabolic offsets are reported as well.

If criteria are not met: report the metrics, identify the causes, and never tune priors or parameters silently to pass. The test records the documented outcome of every criterion so any change forces re-documentation. Current results and causes: `IMPLEMENTATION_NOTES` T-04.

### Convergence journey through the real engine (model 1.3.0)

A virtual user goes through the production domain functions for 84 days (onboarding, weigh-ins 6 days out of 7, adherence and steps, autocorrelated water, every surfaced recalibration accepted), with a true maintenance 300 kcal below NASEM, the same with undeclared extra intake, and 250 kcal above NASEM. Required:

```text
no two recalibrations surfaced less than 7 days apart
every calorie target at or above the hard floor
final 95-percent interval contains the apparent offset (scenarios without undeclared intake)
```

The trajectory (gate day, recalibrations, target amplitude, final offset) is recorded in a snapshot and in `IMPLEMENTATION_NOTES` D-34.

---

## 14. Confidence-level tests

Ensure:

- no user is `medium`, `good` or `high` before first recalibration gate, except `medium` from a usable warm start (`05` section 17);
- high requires at least 28 days and 8 valid weigh-ins;
- reducing posterior interval width can only maintain or improve confidence if all data-quality gates remain satisfied;
- adding poor adherence can reduce confidence.

---

## 15. Randomized property test matrix

Generate at least 10,000 valid profiles:

```text
age: 19-65
height: 145-205 cm
weight: 45-200 kg
steps: 0-30000
training: 0-20 h/week
```

Reject pathological input combinations with validation rules.

For all accepted profiles assert:

```text
no NaN
no Infinity
all calorie outputs finite and positive
REE > 0
TDEE > 0
interval lower < center < upper
goal plan never violates hard product floor
macro grams non-negative
macro energy reconciles
projection is continuous under small input changes
```

The continuity check applies to every accepted profile, without any exemption (the former BMI 30 exemption was removed with the continuous reference weight).

---

## 16. Golden end-to-end profiles

Create at least these fixtures:

1. female, 25, sedentary, normal BMI, loss;
2. male, 30, low active, normal BMI, maintenance;
3. female, 35, resistance training, loss;
4. male, 28, athlete-like, resistance + endurance, maintenance;
5. female, 42, obesity, low active, loss;
6. male, 45, obesity, active, loss;
7. female, 55, active, maintenance;
8. male, 60, moderate activity, maintenance;
9. female, 65, resistance training, maintenance;
10. male, 35, resistance training, gain;
11. female, 30, endurance heavy, gain;
12. profile with valid indirect calorimetry.

Snapshot every engine layer, not just final calories. Golden weekly rates reproduce the former presets (loss 0.25 / 0.5 / 0.75 percent, gain 0.10 / 0.25 percent) so model changes stay comparable.

---

## 16b. Onboarding tests

Render the real onboarding step components from a draft (static markup is enough) so the displayed state is checked against the stored draft.

Structure:

- one main piece of information per screen, progress by section (Profil, Corps, Activité, Historique, Objectif);
- first and last name optional, persisted, initials in the Today avatar with a neutral fallback.

Age:

- empty at start, `22` only as a grey placeholder, never stored;
- validation refuses an empty age;
- on an empty field the first + or − sets the real value 22, then + increments and − decrements the same stored value, clamped to 19 to 65;
- no desynchronization between displayed and stored value.

Body composition:

- nothing entered: `Continuer` hidden, `Ignorer cette étape` visible;
- method enabled with valid data: `Continuer` visible.

Calorie history:

- `Non` selected by default;
- duration asked once, as an exact number of days;
- empty start weight accepted and stored as unknown.

Sex:

- `Homme` selected initially and stored;
- choosing `Femme` persists into the profile.

Height and weight:

- grey placeholders visible (170 cm, 70,0 kg);
- placeholders never stored as data;
- validation refuses to continue with empty fields.

Occupation:

- `Assis` selected by default and stored.

Activities:

- no `Marche` and no `Randonnée / marche sportive` choice;
- existing `walking` and `hiking` entries still accepted;
- step and exercise overlap correction still applied.

Speed slider:

- correct initial value;
- percent and kg/week display consistent;
- dynamic limit depending on the profile;
- no slider for maintenance;
- gain uses its own range.

Splash: no decorative dots under the logo.

Result explanation and screens:

- for a known profile the explanation view model exposes REE route and value, PAL, population TDEE, history alone when available, fused posterior, Hall baseline, requested and applied speed, limiting rule and final calories, each equal to the engine value;
- the explanation component imports only the view model type, never `science/` or the engine;
- `showScientificDetails` off: digest only; on: technical values visible; the preference survives a reload;
- first-recalibration progress: one entry per real gate criterion, each `met` equal to `evaluateGate`, gate met only when all are;
- no `Ajouter une pesée` button in Analyse; no detailed projection in Plan; navigation to Suivi and Analyse still works.

---

## 16c. Warm-start tests

- user without history;
- history under 7 days;
- 14 days, low tracking quality;
- 28 days, high tracking quality;
- historical maintenance close to the prior;
- historical maintenance very far from the prior (conflict surfaced, neutral wording);
- declared intake incompatible with the weight change;
- activity not comparable;
- unknown start weight;
- invalid values;
- persistence, export and import;
- later recalibration that keeps the historical likelihood.

---

## 17. UI/static policy checks

CI should fail if visible source strings contain the em dash character.

Search app source files for Unicode U+2014.

Exclusions can be limited to third-party dependencies, generated build output and research citation files if necessary. UI source must contain zero occurrences.

Also verify:

- no scientific runtime request to external APIs;
- no Google Fonts runtime request if offline-first is required;
- no cloud persistence;
- no hidden use of health-platform APIs.

---

## 18. Definition of done for scientific v1

Scientific engine is done only when:

- every test above passes;
- no prototype placeholder science remains;
- Hall validation passes;
- calibration recovery simulation passes;
- model-mismatch benchmark is run and its results, including unmet criteria, are reported with their causes;
- storage migrations preserve existing data (tested);
- all constants are centralized and documented;
- model version is persisted;
- UI exposes initial uncertainty honestly;
- no output uses fake single-kcal precision.
