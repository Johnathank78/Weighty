# 05 - Personal Calibration, Trend and Uncertainty

## Objective

Turn Wheighty from a population calculator into a personal estimator.

The initial model is a prior. Longitudinal observations progressively update a user-specific TDEE offset.

Calibration must be robust to:

- water-weight noise;
- irregular weighing;
- mild plan deviations;
- inaccurate step logging;
- model uncertainty;
- occasional outliers.

It must not overreact to a small number of weigh-ins.

---

## 1. What is calibrated

Do not rewrite every physiological parameter after each weigh-in.

Calibrate a single interpretable latent offset:

```text
personal_tdee_offset_kcal_day
```

Then:

```text
calibrated_tdee = initial_tdee_population + personal_tdee_offset
```

The dynamic weight model continues to handle adaptation caused by changing weight and intake.

This design keeps the personalization identifiable and stable.

### Estimand: apparent maintenance (model 1.3.0)

The calibrated value is the **apparent maintenance**: the calories that keep the weight stable when the user follows the target the way they usually do. The dynamic prediction feeds the prescribed calories of each day, so any intake actually eaten above the target (declared deviations and undeclared extra intake) is part of the estimate:

```text
apparent_offset = metabolic_offset - mean(intake eaten above the day's target over the window)
```

In the Hall model, eating the target with a maintenance lowered by X, or eating target + X with the true maintenance, gives the same energy balance (TEF and adaptive thermogenesis both depend on the intake change relative to the baseline), so this estimand is well defined.

Why: the plan is built from this maintenance and applied to the same behaviour, so the predicted trajectory stays consistent with what the user actually does, without unvalidated priors on the size of deviations.

It is neither the REE (which stays an equation and is never recalibrated) nor a measured energy expenditure, and the UI must say so. Benchmarks (`06` section 13) measure recovery against the apparent offset and report the metabolic offset for information. Rationale and measurements: `IMPLEMENTATION_NOTES.md` D-31.

---

## 2. Prior distribution

Start with:

```text
personal_tdee_offset ~ Normal(0, sigma_initial)
```

Base sigma:

```text
female physiological equation: 241 kcal/day
male physiological equation:   342 kcal/day
```

These originate from the NASEM 2023 standard error of predicted value for adult EER equations.

Apply multiplicative uncertainty factors:

```text
if pal_boundary_flag:             sigma *= 1.15
if occupation == physical:        sigma *= 1.15
if ree_model_disagreement:        sigma *= 1.15
if unknown measured-RMR quality:  do not reduce sigma
```

Do not allow uncertainty to shrink solely because a user supplied consumer BIA body fat.

When the user supplied usable historical intake evidence at onboarding, the initial posterior combines this prior with the historical likelihood (section 17). The population prior itself is unchanged.

---

## 3. Initial displayed interval

Use the central 80-percent interval for normal UI:

```text
z80 = 1.2815515655
lower80 = mean - z80 * sigma
upper80 = mean + z80 * sigma
```

Use 95 percent only in advanced details:

```text
lower95 = mean - 1.96 * sigma
upper95 = mean + 1.96 * sigma
```

Display the 80-percent interval on:

- initial result;
- Analysis.

Do not display it on Today.

---

## 4. Weight data

Store raw weights. Never replace them with the smoothed trend.

```ts
type WeightEntry = {
  id: string;
  date: string;       // ISO local date
  weightKg: number;
  createdAt: string;
};
```

Use raw weights for model fitting.

Use a separate smoothed trend only for the UI.

---

## 5. UI weight trend

Use an exponentially weighted moving average with a 7-day half-life.

Because observations are irregular, calculate decay from elapsed days:

```text
alpha(dt_days) = 1 - exp(-ln(2) * dt_days / 7)
trend_new = trend_old + alpha * (measurement - trend_old)
```

The chart should make the trend visually stronger than raw points.

Do not use the EWMA as the calibration target.

---

## 6. Adherence quality

User can report:

```ts
type Adherence = "on_plan" | "minor_deviation" | "major_deviation" | "unknown";
```

Calibration weights:

```text
on_plan:          1.00
minor_deviation:  0.35
major_deviation:  0.00
unknown:          0.50
```

These are Wheighty statistical robustness weights, not measured calorie-error percentages.

A major-deviation day contributes no evidence that the prescribed calories equal actual intake.

---

## 7. Daily activity reconstruction

For each calendar day in the fit window, use:

```text
actual steps if user logged them
otherwise current step target
```

If actual steps are missing, reduce that day's effective calibration weight by:

```text
0.70
```

Structured activity uses the user's schedule unless an activity-edit feature later provides actual sessions.

Wheighty v1 assumes the declared routine unless the user changes it.

---

## 8. First recalibration gate

Do not surface a first recalibration until all are true:

```text
at least 5 weigh-ins
span >= 14 calendar days
at least 4 weigh-ins occur in windows not dominated by major-deviation days
at least 50 percent of days have adherence information or an explicit "plan respected" confirmation
```

The engine may calculate an internal posterior earlier for debugging, but the product must still report initial confidence as low until the gate is met.

This replaces the prototype mock rule of `3 pesées sur 2 semaines`.

---

## 9. Posterior estimation

Use a deterministic one-dimensional grid posterior for v1. This is simple, inspectable and runs easily in-browser.

Candidate offset grid:

```text
-1200 to +1200 kcal/day
step = 5 kcal/day
```

For each candidate offset:

1. set candidate maintenance = initial TDEE + offset;
2. run the dynamic weight model (production Hall 2011, native TEF) over the observation period using prescribed calorie targets, the day's carbohydrate intake, activity deltas and day-level adherence weights;
3. compare predicted raw body weight with actual raw measurements;
4. calculate robust likelihood, marginalizing the unknown true starting weight (below);
5. multiply by the normal prior (and by the historical likelihood when a warm start was used, section 17);
6. normalize the grid.

### Unknown true starting weight

The true body weight at the start of the window is **not** the first raw weigh-in: that weigh-in carries water and measurement noise, and treating it as exact injects roughly 150 kcal/day of error over 28 days. The starting weight is a nuisance parameter, marginalized under a flat prior on a fixed grid:

```text
starting weight = first weigh-in + c
c in [-3 kg, +3 kg], step 0.05 kg
likelihood(offset) = sum over c of likelihood(offset, c)
```

The posterior stays one-dimensional in the offset. No second prior is added on the first weigh-in, which would count it twice (`IMPLEMENTATION_NOTES` D-10).

### Robust likelihood

Use Student-t errors:

```text
degrees_of_freedom = 4
base_scale_kg = 0.60
```

At each weight observation, raise the likelihood contribution to the effective adherence/activity weight for that observation window.

The 0.60 kg scale and df=4 are Wheighty engineering robustness parameters. They must be validated by simulation and can change only with `SCIENTIFIC_MODEL_VERSION` bump.

Student-t is chosen because short-term body-weight data contain heavy-tailed water and measurement noise.

---

## 10. Posterior summary

Persist:

```ts
type CalibrationSnapshot = {
  scientificModelVersion: string;
  createdAt: string;
  posteriorMeanOffsetKcal: number;
  posteriorMedianOffsetKcal: number;
  interval80: [number, number];
  interval95: [number, number];
  calibratedTdeeMedian: number;
  validWeightCount: number;
  observationSpanDays: number;
  confidence: "low" | "medium" | "good" | "high";
  // Extensions
  populationTdeeKcal?: number;
  appliedAt?: string;
  source?: "weights" | "warm_start";   // absent = weigh-in calibration
};
```

Production central value:

```text
calibrated_tdee = initial_tdee + posterior_median_offset
```

Use median rather than mean for the displayed calibrated estimate because it is robust to mild posterior skew.

### Structural uncertainty floor (model 1.3.0)

The grid posterior assumes a perfect model and independent weigh-ins, so its width would keep shrinking with time while the model error does not. Before summarizing, convolve the weigh-in posterior with a normal model error:

```text
posterior_reported = posterior_grid * Normal(0, CALIBRATION_STRUCTURAL_SD_KCAL = 50 kcal/day)
```

Kernel truncated at 6 SD, renormalized; offsets outside the Hall admissible domain keep a zero probability. The warm-start posterior of section 17 is not convolved (its likelihood already carries a model SD). The value was selected with a fixed protocol on the ideal benchmark at 84 and 120 days and the autocorrelated-water scenario (`IMPLEMENTATION_NOTES.md` D-33).

---

## 11. Confidence levels

Confidence is not a fake percentage.

Use rules:

### Low

Any of:

```text
first recalibration gate not met
observation span < 14 days
```

Single exception before the gate: a usable warm start may show `medium` under the rule of section 17. It can never show `good` or `high`.

### Medium

Gate met and:

```text
80-percent interval full width > 500 kcal/day
```

### Good

Gate met and:

```text
300 < 80-percent interval full width <= 500 kcal/day
```

### High

All are true:

```text
80-percent interval full width <= 300 kcal/day
observation span >= 28 days
valid weigh-ins >= 8
major-deviation days < 25 percent of tracked days
```

These are v1 product thresholds. Validate them against synthetic tests before release.

---

## 12. When to surface a recalibration event

The internal posterior can update whenever a new valid weigh-in is saved.

Show the dedicated `Wheighty te connaît mieux` event only if the recalibration gate is met and at least one condition is true:

```text
abs(new_tdee - last_surfaced_tdee) >= 75 kcal/day
80-percent interval width shrank by >= 10 percent
at least 7 days passed since previous surfaced recalibration and estimate changed >= 40 kcal/day
```

In every case, never surface a new event less than 7 days after the previous surfaced one (`RECAL_SURFACE_MIN_INTERVAL_DAYS`, model 1.3.0, `IMPLEMENTATION_NOTES.md` D-34). The first event after the gate is not concerned.

This avoids noisy daily recalibration messages and plans that change several times in a week.

The new plan is not silently applied before the user confirms it on the recalibration screen.

---

## 13. Uncertainty after calibration

The current range comes directly from the posterior distribution of TDEE offset plus the baseline TDEE.

```text
current80 = initial_tdee + posterior_offset_interval80
```

Do not artificially force the interval to shrink with time.

If weight data are noisy or adherence is poor, it can remain wide or widen.

That behavior is correct.

---

## 14. Projection uncertainty

The central trajectory uses posterior median TDEE.

For the UI uncertainty band:

1. sample or deterministically evaluate TDEE at posterior 10th, 50th and 90th percentiles;
2. simulate the same plan with each;
3. use the 10th and 90th predicted weights as the central 80-percent projection band.

Do not pretend this captures every source of future behavior uncertainty. It represents current model uncertainty under plan adherence.

The projection copy should make that clear.

---

## 15. No simple 7700-rule calibration

Prohibited:

```text
new_tdee = old_tdee + weight_error * 7700 / days
```

Calibration must fit the dynamic model across the observation window.

---

## 16. What calibration assumes

Wheighty v1 does not ask users to log every food item.

Therefore the calibration is conditional on the user's adherence report.

The app should communicate this simply:

```text
Plus tes pesées et tes journées notées sont régulières, plus l'estimation peut s'affiner.
```

Do not imply that the app directly measures metabolism.

Consequence, by design since model 1.3.0 (section 1, estimand): the dynamic prediction uses the prescribed calories on every day, including days declared as deviations (which are only down-weighted). Real extra intake on those days, and undeclared extra intake, lowers the apparent maintenance. The displayed value therefore describes the user's behaviour with the plan, not their physiology. Autocorrelated water fluctuations, which made the intervals too narrow up to model 1.2.0, are covered by the structural uncertainty floor (section 10). Remaining unmet benchmark criteria are documented, not hidden by tuning.

---

## 17. Warm start from historical intake evidence

Users who already track calories and weight can start partially calibrated. The onboarding asks, after profile and activity and before the goal, the optional question `Tu suis déjà tes calories ?`.

- `Non` is shown selected and stored by default (the question is marked `Facultatif` as a secondary note): nothing changes.
- `Oui`: on the next screen, recent average intake (kcal/day), the exact number of days (a single field, no duration categories), weight at the start of the period (left empty when unknown, with the note `Laisse vide si tu ne le connais pas.`; stored as `null`, never invented), weight today (prefilled with the onboarding weight), tracking quality, and whether activity was close to the current routine.

### Principle

```text
population prior
+
historical personal evidence
=
initial personalized posterior
```

Never use `average_intake = maintenance`. The weight change over the period is explained with the production dynamic model.

### Historical likelihood

For every candidate offset of the evidence support (model 1.2.0: step 5 kcal/day, from -3000 to +3000, limited below to offsets whose baseline intake NASEM + offset is admissible for the Hall model; the calibration grid -1200 to +1200 is a subset and receives the same values):

1. initialize the Hall 2011 model at steady state at the history start weight, with maintenance = NASEM(start weight, PAL category fixed at onboarding) + offset and the maintenance plan carbohydrate share;
2. feed the declared average intake for the declared duration, usual steps unchanged;
3. compare the predicted weight change with the declared change (end weight − start weight).

Gaussian likelihood on the weight change:

```text
sd_kg^2 = 2 * sd_weighin^2 + s^2 * (sd_intake^2 + sd_activity^2 + sd_model^2)
s = d(predicted change) / d(offset)      // model sensitivity, kg per kcal/day
```

| Source | Value (engineering_prior, to validate) |
|---|---|
| single weigh-in at each end | 0.85 kg (SD of the calibration Student-t noise: 0.6 kg scale, df 4) |
| declared intake, "Je pèse et note la plupart de mes aliments" | 10 percent of the declared intake |
| declared intake, "Je note régulièrement mais j'estime certaines portions" | 20 percent |
| declared intake, "C'est une approximation" | 30 percent |
| activity not comparable to the current routine | +200 kcal/day |
| structural floor (model mismatch, non-constant offset) | 100 kcal/day |

Duration acts through the model sensitivity: a longer period makes the weight change more informative, while intake reporting error does not average out.

### Insufficient or incoherent data

- Duration below 7 days, or unknown start weight: evidence stored, not used; the population prior is kept and the UI says so.
- Invalid values (intake outside 800 to 6000 kcal/day, duration outside 1 to 365 whole days, weights outside the software bounds): refused at input, ignored by the engine.
- Coherence (model 1.2.0): the history is flagged `incoherent` if and only if the exact root of predicted(offset) = observed lies outside [-1200, +1200] kcal/day, i.e. the observed change lies outside [predicted(+1200), predicted(-1200)]. The flag is a display and diagnostic signal only: it never changes the likelihood, the fusion, the confidence or the calibration handoff. It is never shown in the digest view. (Model 1.1.0 used the linearised offset and doubled the likelihood SD; abandoned.)

### Conflict

Prior predictive statistic on the exact distribution (model 1.2.0):

```text
z = Phi^-1( P(change >= observed) )   under   sum_o prior(o) * Normal(predicted(o), sd_kg^2)
conflict if |z| >= 2
```

The sign follows the former linearised z (negative when the history points to a lower maintenance); for a linear model both are equal. The linearised history-only offset is kept as a diagnostic approximation only.

A conflict is never hidden. Message:

```text
Tes données récentes diffèrent de notre estimation théorique. Wheighty leur donne du poids, mais continuera à vérifier cette estimation avec tes prochaines pesées.
```

Never accuse the user of misreporting intake.

### Initial plan and display

- Maintenance = NASEM + posterior median; `Fourchette actuelle` = posterior 80-percent interval.
- Confidence on the first result: `medium` when the history is used and the 80-percent width is at most 75 percent of the population prior width, otherwise `low`. A warm start never reaches `good` or `high`; those require Wheighty weigh-ins and the first recalibration gate.
- Provenance in the result: `Ton historique récent a été utilisé pour affiner cette première estimation.`
- `Pourquoi ce résultat ?` (model 1.2.0 panel): the digest compares on one scale the theoretical estimate, what the history suggests on its own (the historical likelihood normalised on the evidence support under a flat prior) and the retained maintenance, with 80-percent ranges rounded to 50 kcal; it shows the weight of each source in the fusion (1 - fused variance / prior variance), why the retained maintenance is not the declared intake, and the four real recalibration gate criteria. The `incoherent` flag and excluded points never appear in the digest. The scientific details, in six collapsible groups, show the exact history-only distribution as the source of truth, the linearised offset as a diagnostic approximation, edge masses, the exact root and its distance to the coherence bound, z and its margin, the likelihood maximum relative to the Hall delta-clamp threshold, the precise confidence criterion and the stored-plan integrity. These values are exposed for observability only and never change the plan.
- The warm-start posterior is stored as a calibration snapshot with `source = warm_start`; it is not counted as a recalibration.

### Later recalibration

The historical log-likelihood is added again to the population prior in every later calibration (section 9), sampled on the calibration grid (481 values aligned with the offset grid, contract unchanged by the wider evidence support). The warm-start posterior is never reused as a prior, which would count the history twice. The history period precedes the first weigh-in; the onboarding weigh-in is both the history end point and the calibration level, which is marginalized, so its noise pushes the two slopes in opposite directions (slightly conservative).

### Storage

The evidence is stored explicitly and versioned (`07` section 2), never expanded into artificial daily logs.

---

## References

1. National Academies of Sciences, Engineering, and Medicine. Applications of the Dietary Reference Intakes for Energy. 2023. Adult SEPV: 241 kcal/day for women, 342 kcal/day for men.
2. Hall KD et al. Quantification of the effect of energy imbalance on bodyweight. Lancet. 2011. PMID 21872751.
3. Hall KD. Predicting metabolic adaptation, body weight change, and energy intake in humans. Am J Physiol. 2010. PMCID PMC2838532.
4. Short-term body weight can vary materially with hydration and glycogen. Calibration therefore uses robust observation errors rather than interpreting every fluctuation as tissue change.
