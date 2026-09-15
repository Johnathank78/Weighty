# Wheighty Scientific Handoff v1

## Status

This folder is the scientific and functional source of truth for Wheighty v1.

The visual source of truth is the implemented interface (`src/screens`, `src/components`, `src/styles`) and the mascot assets in `assets/`. The original Claude Design prototype that seeded it has been retired from the repository; it remains available in the Git history (commit `37fa35d`, folder `reference/claude-design/`).

If the design prototype and these specifications disagree on a scientific formula, threshold, number, recommendation, confidence level, projection or behavior, **these specifications win**.

The numeric logic embedded in the design prototype was mock logic. It existed only to demonstrate the interface and must never be copied into production.

In particular, formulas such as a linear `kcal <-> steps` relationship from the prototype are prohibited.

## Product target

Wheighty v1 targets healthy adults from **19 through 65 years old inclusive**.

The following profiles are outside v1:

- age below 19;
- age above 65;
- pregnancy;
- breastfeeding;
- active eating-disorder treatment or a known eating disorder for which calorie prescription is clinically inappropriate;
- bariatric surgery with active medical nutrition follow-up;
- severe renal, hepatic, endocrine or other medical conditions requiring individualized nutrition management;
- any situation in which a clinician has prescribed a specific energy or macronutrient plan that conflicts with Wheighty.

Obesity itself is supported. Recreational athletes and highly active users are supported within the limits described in this specification.

Wheighty is not a diagnostic or medical-treatment tool.

## Core scientific architecture

Wheighty does not pretend that one equation can know an individual's maintenance calories exactly.

The engine is built around two stages:

1. **Population prior**: create the best initial estimate from validated population equations and activity information. When the user already tracks calories, optional historical intake evidence is combined with this prior (warm start, `05` section 17).
2. **Personal calibration**: progressively update that estimate using the user's observed weight trajectory, declared plan adherence and actual activity.

The initial maintenance estimate uses the 2023 National Academies EER equations as the population-level TEE anchor. REE equations and activity-component calculations are used for routing, decomposition, activity deltas, sanity checks and uncertainty.

Conceptually:

```text
profile
  -> REE router
  -> activity classifier
  -> NASEM 2023 EER baseline
  -> optional historical intake evidence (warm start)
  -> macro engine
  -> goal engine (continuous weekly rate, percent of body weight)
  -> Hall 2011 dynamic weight projection (native TEF term)
  -> calorie + step plan
  -> observations
  -> Bayesian-like personal TDEE calibration
  -> narrower uncertainty
```

Macro-specific TEF coefficients are used for explanation and energy decomposition only. They never modify the Hall trajectory (`02` section 9, `04` section 1).

## Source priority

Claude Code must use sources in this order:

1. these markdown specifications;
2. cited scientific publications and official reference documents;
3. the implemented interface for layout, spacing, visual language and interaction presentation;
4. never the retired prototype's placeholder science.

## Required documents

Read all documents before implementing the scientific engine:

- `01_REE_TDEE_ROUTER.md`
- `02_ACTIVITY_NEAT_TEF.md`
- `03_MACRO_ENGINE.md`
- `04_GOALS_PROJECTION_SLIDER.md`
- `05_CALIBRATION_UNCERTAINTY.md`
- `06_VALIDATION_TEST_PLAN.md`
- `07_DATA_CONTRACT_AND_DEV_RULES.md`
- `08_REFERENCE_NOTES.md`

The implementation log `IMPLEMENTATION_NOTES.md` at the repository root records every interpretation, validated decision and measured validation result. These specifications and the log are kept consistent; decision identifiers such as `D-21` refer to that log.

## Non-negotiable product rules

- No server.
- No backend.
- No account.
- No cloud sync.
- No health-platform integration.
- Runtime must work offline after PWA installation.
- User data stays local.
- Persistent user data is stored locally with schema versioning and export/import support.
- No network dependency is required for the scientific engine.
- Do not expose fake precision.
- Internal calculations use full floating-point precision.
- UI calorie values are rounded to the nearest 10 kcal unless a detailed scientific view explicitly requires more.
- Target steps are rounded to the nearest 100 steps.
- Weight is displayed to 0.1 kg.
- Macros are displayed to the nearest gram.
- The current uncertainty range appears on the initial result and Analysis views, not on the Today screen.
- Visible UI copy must not contain the em dash character `\u2014`.
- A mathematical minus sign or normal hyphen remains allowed where appropriate.

## Scientific model version

The first release used `SCIENTIFIC_MODEL_VERSION = "1.0.0"`. The current version is:

```text
SCIENTIFIC_MODEL_VERSION = "1.3.0"
```

Version 1.1.0: native Hall 2011 TEF in production, continuous nutrition reference weight, continuous weekly-rate speed slider, optional warm start from historical intake, model-mismatch calibration benchmark.

Version 1.2.0: warm-start decision rules on the exact distribution (coherence flag without numerical effect, prior predictive conflict statistic, dedicated evidence support), `IMPLEMENTATION_NOTES.md` D-29.

Version 1.3.0 (beta pass): the calibrated value is the apparent maintenance (D-31), sex-specific absolute calorie floor (D-32), structural uncertainty floor of the calibration posterior (D-33), recalibration events at least 7 days apart (D-34), calibration off the main thread (P-01).

Persist the model version with each saved model snapshot so future changes can be migrated and audited. Any change to an engineering prior, product safety rule or statistical robustness parameter requires a version bump.

## References

Primary references are repeated in the relevant documents. The most important are:

- National Academies of Sciences, Engineering, and Medicine. Dietary Reference Intakes for Energy. 2023.
- Mifflin MD et al. Am J Clin Nutr. 1990. PMID 2305711.
- ten Haaf T, Weijs PJM. PLoS One. 2014. PMID 25275434.
- O'Neill JER et al. Sports Med. 2023. PMID 37632665.
- Herrmann SD et al. 2024 Adult Compendium of Physical Activities. PMID 38242596.
- Hall KD et al. Lancet. 2011. PMID 21872751.
