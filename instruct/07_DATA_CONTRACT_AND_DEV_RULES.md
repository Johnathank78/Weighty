# 07 - Data Contract and Development Rules

## Objective

Define exactly what the production app needs to store and how scientific modules should be separated from UI code.

This document is not a full architecture prescription, but Claude Code must preserve these boundaries.

---

## 1. Recommended stack

For this static PWA:

```text
Vite
React
TypeScript strict mode
Vitest
PWA/service-worker plugin
```

Deployment target:

```text
GitHub Pages
```

No server runtime.

No database server.

No authentication.

No runtime cloud dependency.

---

## 2. Persistence

Use localStorage with a single versioned root object or a small set of versioned keys.

Suggested root:

```ts
type WheightyStore = {
  schemaVersion: number;              // 2 since model 1.1.0
  scientificModelVersion: string;
  profile: UserProfile | null;
  plan: CurrentPlan | null;
  weights: WeightEntry[];
  dailyLogs: DailyLog[];
  calibrationSnapshots: CalibrationSnapshot[];
  historicalEvidence: HistoricalIntakeEvidence | null;   // warm start, 05 s17
  preferences: Preferences;
  meta: AppMeta;                      // initial estimate, fixed PAL category, surfacing state, recovery trace
};
```

Expected data volume is tiny enough for localStorage in v1.

### Schema versions and migrations

- Schema 1: first release (model 1.0.0).
- Schema 2 (model 1.1.0): `UserProfile.speedPreset` becomes `weeklyRateTarget`; `CurrentPlan.speedPreset` / `appliedSpeed` become `requestedWeeklyRate` (the applied rate was already `weeklyRateTarget`); `historicalEvidence` is added (`null` for existing users).

Migration 1 → 2 translates stored presets with the frozen schema-1 rates (loss 0.25 / 0.5 / 0.75 percent, gain 0.10 / 0.25 / 0.40 percent, maintenance 0) and carries every other record over unchanged (weights, logs, snapshots, plan values and their model version, preferences, meta). A schema bump is required whenever an older reader would otherwise drop or misread data: an older app refuses a newer schema and keeps the raw data instead of discarding unknown fields. Migrations are tested on stored data and on imported export files.

All writes should be atomic at app level:

1. serialize complete validated object;
2. write;
3. recover gracefully from invalid JSON;
4. never silently discard valid history.

Provide JSON export/import.

Import must validate schema before replacing current data.

---

## 3. User profile

```ts
type SexForEquation = "female" | "male";

type UserProfile = {
  firstName?: string;         // optional, at most 60 characters, local display only (initials, profile title)
  lastName?: string;          // optional, at most 60 characters, never read by the engine, never sent anywhere

  ageYears: number;
  sexForEquation: SexForEquation;
  heightCm: number;
  currentWeightKg: number;

  bodyFatPercent?: number;
  bodyFatMethod?:
    | "four_compartment"
    | "air_displacement_plethysmography"
    | "dxa"
    | "skinfold"
    | "consumer_bia"
    | "self_estimate";

  measuredRmr?: {
    kcalPerDay: number;
    measuredAt: string;
    weightKgAtTest: number;
    method: "indirect_calorimetry" | "unknown";
    conditionsKnown: boolean;
  };

  averageSteps7d: number;
  walkingPace: "slow" | "normal" | "brisk";
  occupation: "seated" | "mixed" | "standing" | "physical";
  activities: StructuredActivity[];

  goal: "loss" | "maintenance" | "gain";
  targetWeightKg: number;
  weeklyRateTarget: number;   // fraction of body weight per week (0.005 = 0.5 %), 0 for maintenance
};
```

`activities[].type` keeps `walking` and `hiking` as valid values for existing profiles, but onboarding no longer offers them (`02` section 1).

`firstName` and `lastName` were added without a schema bump: they are optional, a store without them stays valid, and a schema-2 reader that predates them validates the profile without removing unknown keys.

### Historical intake evidence (warm start)

```ts
type HistoricalIntakeEvidence = {
  evidenceVersion: 1;
  recordedOn: string;                  // ISO date, end of the history (onboarding day)
  averageCaloriesKcal: number;         // 800 to 6000
  durationDays: number;                // whole days, 1 to 365
  startWeightKg: number | null;        // null when unknown (evidence then not used)
  endWeightKg: number;
  trackingQuality: "high" | "medium" | "low";
  activityComparable: boolean;
};
```

Stored as supplied, never converted into daily logs.

---

## 4. Current plan

```ts
type CurrentPlan = {
  createdAt: string;
  source: "initial" | "recalibrated" | "user_adjusted_slider";

  maintenanceKcal: number;
  maintenanceInterval80: [number, number];
  maintenanceInterval95: [number, number];

  calorieTarget: number;
  stepTarget: number;

  macros: {
    proteinG: number;
    carbsG: number;
    fatG: number;
  };

  reeKcal: number;
  reeMethod: string;
  palCategory: "inactive" | "low_active" | "active" | "very_active";
  provisionalPal: number;

  goal: "loss" | "maintenance" | "gain";
  weeklyRateTarget: number;        // applied rate after guardrails
  requestedWeeklyRate?: number;    // rate requested on the slider

  projection: {
    approximateWeeks?: number;
    trajectory: Array<{ day: number; weightKg: number }>;
    lower80: Array<{ day: number; weightKg: number }>;
    upper80: Array<{ day: number; weightKg: number }>;
  };

  scientificModelVersion: string;
};
```

Store full precision. Round only when rendering.

The implementation adds optional display and audit fields (rounded macros, plan weight, target weight, baseline slider values, population TDEE and personal offset, hard floor, warnings, protein rule), listed in `IMPLEMENTATION_NOTES` D-13.

### Calibration snapshots

Defined in `05` section 10, with the optional `source` field: `warm_start` for the posterior built from historical intake evidence, absent for weigh-in calibrations.

---

## 5. Daily log

```ts
type DailyLog = {
  date: string;
  actualSteps?: number;
  adherence?: "on_plan" | "minor_deviation" | "major_deviation";
  calorieTargetForDay: number;
  stepTargetForDay: number;
  macrosForDay?: { proteinG: number; carbsG: number; fatG: number };   // plan macros in force that day
};
```

Important: preserve historical target values for each day. Do not reconstruct old days using today's plan after a recalibration.

---

## 6. Scientific module boundaries

Recommended folder structure:

```text
src/science/
  constants.ts
  types.ts
  ree.ts
  nasem.ts
  activity.ts
  neat.ts
  tef.ts
  macros.ts
  goals.ts
  hall/
    model.ts
    solver.ts
  calibration.ts
  uncertainty.ts
  trend.ts
  validation.ts
  warmStart.ts
```

UI must not contain scientific formulas.

Components call typed science functions through a small service/use-case layer.

Every science module should be independently unit-testable.

---

## 7. Constants

All Wheighty engineering constants must live in one documented location with comments that identify whether each is:

```text
published_constant
published_range_midpoint
product_safety_rule
engineering_prior
statistical_robustness_parameter
ui_rounding_rule
```

Example:

```ts
export const TEF_PROTEIN = 0.25; // published_range_midpoint
export const PAL_ADL_PRIOR_FRACTION = 0.20; // engineering_prior
export const ABSOLUTE_MIN_CALORIES = 1200; // product_safety_rule
```

No unexplained numeric literals in science code.

---

## 8. Input validation

Recommended v1 hard input sanity bounds:

```text
age: 19 to 65
height: 130 to 220 cm
weight: 35 to 300 kg
body fat: 3 to 65 percent
steps: 0 to 50000/day
training duration: 0 to 1800 min/week
measured RMR: 700 to 4500 kcal/day
```

These are software sanity bounds, not healthy-range declarations.

Values near extremes should not be silently clamped. Reject clearly invalid input and ask the user to correct it.

---

## 9. Display precision

```text
maintenance/calorie targets: nearest 10 kcal
step targets: nearest 100 steps
body weight: 0.1 kg
body fat: 0.1 percent if user entered decimals
macros: nearest 1 g
confidence: label only
```

Advanced scientific details can show formulas and unrounded intermediate values, but primary recommendations must not display fake precision.

`Pourquoi ce résultat ?` explains the actual calculation path of the current user's result (REE and route, activity counted, PAL, population TDEE, history and what it suggests alone, fused maintenance sent to the solver, requested and applied speed with the real limiting rule, prescription). The `showScientificDetails` preference switches between this digest and the same section enriched with every technical value. Both read a domain view model that only collects values already produced by the engine; no scientific value is ever recomputed in a component, and no value that does not exist in the engine is displayed.

---

## 10. Visual source of truth

The implemented interface is the visual reference. It was built from the Claude Design prototype, now retired from the repository (Git history, commit `37fa35d`).

Preserve:

- Warm Precision identity;
- peach accent and gradients;
- large numerical hierarchy;
- floating bottom navigation;
- bottom sheets;
- mascot usage by context;
- Today/Plan/Suivi/Analyse/Profil architecture;
- expanded Manger <-> Marcher sheet concept;
- compact, non-draggable preview entry on Plan once the refinement is applied;
- uncertainty range on initial Result and Analysis, not Today.

Do not copy the design prototype's scientific calculations.

---

## 11. PWA/offline rules

After first successful installation/load, core app must work without network.

Bundle application assets at build time.

Do not require:

- Google Fonts at runtime;
- external React CDN;
- scientific APIs;
- analytics services for core behavior.

The visual prototype may use CDNs. Production must not inherit that requirement.

---

## 12. Reminder limitation

The design contains a weigh-in reminder preference.

Do not promise reliable background notifications unless the chosen PWA notification implementation is supported and tested on the target browsers.

If not reliably available, implement the setting as an in-app due-state only:

```text
Prochaine pesée recommandée
```

Do not fake an OS notification feature.

---

## 13. Visible text policy

No visible application string may contain Unicode U+2014, the em dash.

Rewrite with commas, periods, colons, parentheses or separate sentences.

This does not forbid:

- the minus sign for negative values;
- normal hyphenation where linguistically needed;
- the visual `<->` concept or a proper arrow icon for Manger/Marcher.

Add a CI/static test.

---

## 14. Privacy

All user data remains on device.

Implement:

- export JSON;
- import JSON;
- delete all data with confirmation;
- no telemetry by default;
- no hidden network transmission of personal data.

The UI does not need to market privacy aggressively, but behavior must honor it.
