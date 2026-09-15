import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as constants from '@/science/constants';
import { ACTIVITY_MET_TABLE, STEP_PACE_PRESETS_ADULT, STEP_PACE_PRESETS_OLDER } from '@/science/activityTable';

const CATEGORIES = ['published_constant', 'published_range_midpoint', 'product_safety_rule', 'engineering_prior', 'statistical_robustness_parameter', 'ui_rounding_rule'];

describe('constants registry (07 s7)', () => {
  it('every exported numeric or table constant has a documented category', () => {
    const exported = Object.entries(constants).filter(([name, v]) => name !== 'CONSTANT_METADATA' && name !== 'SCIENTIFIC_MODEL_VERSION' && (typeof v === 'number' || (typeof v === 'object' && v !== null)));
    expect(exported.length).toBeGreaterThan(150);
    for (const [name] of exported) {
      const meta = constants.CONSTANT_METADATA[name];
      expect(meta, `missing metadata for ${name}`).toBeDefined();
      expect(CATEGORIES).toContain(meta?.category);
      expect(meta?.source.length).toBeGreaterThan(2);
    }
  });

  it('metadata lists no unknown names', () => {
    for (const name of Object.keys(constants.CONSTANT_METADATA)) expect(name in constants, name).toBe(true);
  });

  it('scientific model version is 1.3.0 (apparent maintenance, structural floor, spaced recalibrations, sex-specific floor, D-31 to D-34)', () => {
    expect(constants.SCIENTIFIC_MODEL_VERSION).toBe('1.3.0');
  });

  it('keeps cadence and uncertainty multipliers classified as engineering priors, never physiological constants', () => {
    expect(constants.CONSTANT_METADATA.RUNNING_CADENCE_STEPS_PER_MIN?.category).toBe('engineering_prior');
    expect(constants.CONSTANT_METADATA.DEFAULT_CADENCE_SIGMA_MULTIPLIER?.category).toBe('engineering_prior');
    expect([constants.RUNNING_CADENCE_STEPS_PER_MIN, constants.DEFAULT_CADENCE_SIGMA_MULTIPLIER]).toEqual([160, 1.15]);
    expect(constants.CONSTANT_METADATA.NUTRITION_REFERENCE_EXCESS_FRACTION?.category).toBe('engineering_prior');
    expect(constants.CONSTANT_METADATA.NUTRITION_REFERENCE_EXCESS_FRACTION?.source).toMatch(/not an ideal weight/);
  });
});

describe('the three uses of +/-1200 kcal/day are separate constants (D-28)', () => {
  it('A numerical support, B Hall admissible domain, C warm-start coherence bound', () => {
    // A: support of the offset posterior, unchanged.
    expect([constants.CALIBRATION_GRID_MIN_KCAL, constants.CALIBRATION_GRID_MAX_KCAL]).toEqual([-1200, 1200]);
    expect(constants.CONSTANT_METADATA.CALIBRATION_GRID_MIN_KCAL?.category).toBe('statistical_robustness_parameter');
    expect(constants.CONSTANT_METADATA.CALIBRATION_GRID_MAX_KCAL?.category).toBe('statistical_robustness_parameter');
    // B: numerical admissibility of the Hall initialisation (B1).
    expect(constants.HALL_MIN_BASELINE_INTAKE_KCAL).toBe(1);
    expect(constants.CONSTANT_METADATA.HALL_MIN_BASELINE_INTAKE_KCAL?.category).toBe('engineering_prior');
    // C: coherence bound, a product rule inherited from the grid, not a statistical parameter.
    expect(constants.WARM_START_INCOHERENT_OFFSET_BOUND).toBe(1200);
    expect(constants.CONSTANT_METADATA.WARM_START_INCOHERENT_OFFSET_BOUND?.category).toBe('product_safety_rule');
    expect(constants.CONSTANT_METADATA.WARM_START_INCOHERENT_OFFSET_BOUND?.source).toMatch(/inherited from the offset grid support.*to be sourced/);
  });

  it('the incoherent sigma multiplier is gone (no numerical effect of the flag since 1.2.0) and the evidence support is a separate numerical parameter', () => {
    expect('WARM_START_INCOHERENT_SIGMA_MULTIPLIER' in constants).toBe(false);
    expect(constants.WARM_START_EVIDENCE_SUPPORT_HALF_WIDTH_KCAL).toBe(3000);
    expect(constants.CONSTANT_METADATA.WARM_START_EVIDENCE_SUPPORT_HALF_WIDTH_KCAL?.category).toBe('statistical_robustness_parameter');
  });

  it('the warm start coherence rule reads C, never the grid support', () => {
    const src = readFileSync('src/science/warmStart.ts', 'utf8');
    expect(src).toContain('WARM_START_INCOHERENT_OFFSET_BOUND');
    expect(src).not.toMatch(/CALIBRATION_GRID_(MIN|MAX)_KCAL/);
  });

  it('PAL_ACTIVE_MIN stays 1.68 (NASEM 2023 Table 7-1); 1.60 is the IOM 2002/2005 boundary and must not come back', () => {
    expect(constants.PAL_ACTIVE_MIN).toBe(1.68);
  });
});

describe('non-regression of important constants', () => {
  it('matches the specification values', () => {
    expect({
      TEF: [constants.TEF_PROTEIN, constants.TEF_CARB, constants.TEF_FAT, constants.REFERENCE_TEF_FRACTION],
      SEPV: [constants.NASEM_SEPV_FEMALE_KCAL, constants.NASEM_SEPV_MALE_KCAL],
      Z: [constants.Z_80, constants.Z_95],
      PAL: [constants.PAL_LOW_ACTIVE_MIN, constants.PAL_ACTIVE_MIN, constants.PAL_VERY_ACTIVE_MIN, constants.PAL_OUTLIER_MIN, constants.PAL_ADL_PRIOR_FRACTION, constants.PAL_BOUNDARY_DISTANCE],
      multipliers: [constants.PAL_BOUNDARY_SIGMA_MULTIPLIER, constants.PHYSICAL_JOB_SIGMA_MULTIPLIER, constants.REE_DISAGREEMENT_SIGMA_MULTIPLIER],
      posture: [constants.POSTURE_KCAL_SEATED, constants.POSTURE_KCAL_MIXED, constants.POSTURE_KCAL_STANDING, constants.POSTURE_KCAL_PHYSICAL],
      protein: [constants.PROTEIN_G_PER_KG_BASE, constants.PROTEIN_G_PER_KG_TRAINED, constants.PROTEIN_G_PER_KG_LOSS, constants.PROTEIN_G_PER_KG_LOSS_RESISTANCE, constants.PROTEIN_G_PER_KG_FFM_ATHLETE_LOSS, constants.PROTEIN_MAX_G_PER_KG_ACTUAL],
      fat: [constants.FAT_FRACTION_DEFAULT, constants.FAT_FRACTION_ENDURANCE, constants.FAT_FLOOR_G_PER_KG_REFERENCE, constants.FAT_AMDR_MIN_FRACTION],
      loss: [constants.LOSS_RATE_MIN, constants.LOSS_RATE_DEFAULT, constants.LOSS_RATE_CAUTION_ABOVE, constants.LOSS_RATE_HARD_MAX, constants.LOSS_RATE_MAX_BMI_UNDER_22, constants.LOSS_RATE_MAX_BMI_UNDER_25],
      gain: [constants.GAIN_RATE_MIN, constants.GAIN_RATE_DEFAULT, constants.GAIN_RATE_HARD_MAX],
      referenceWeight: [constants.NUTRITION_REFERENCE_BMI, constants.NUTRITION_REFERENCE_EXCESS_FRACTION],
      hallTef: constants.HALL_BETA_TEF,
      floors: [constants.ABSOLUTE_MIN_CALORIES_FEMALE, constants.ABSOLUTE_MIN_CALORIES_MALE, constants.RELATIVE_MIN_CALORIES_REE_FRACTION],
      calibration: [
        constants.ADHERENCE_WEIGHT_ON_PLAN,
        constants.ADHERENCE_WEIGHT_MINOR,
        constants.ADHERENCE_WEIGHT_MAJOR,
        constants.ADHERENCE_WEIGHT_UNKNOWN,
        constants.MISSING_STEPS_WEIGHT_FACTOR,
        constants.CALIBRATION_GRID_MIN_KCAL,
        constants.CALIBRATION_GRID_MAX_KCAL,
        constants.CALIBRATION_GRID_STEP_KCAL,
        constants.CALIBRATION_T_DF,
        constants.CALIBRATION_T_SCALE_KG,
      ],
      gate: [constants.GATE_MIN_WEIGHINS, constants.GATE_MIN_SPAN_DAYS, constants.GATE_MIN_CLEAN_WEIGHINS, constants.GATE_MIN_ADHERENCE_COVERAGE],
      confidence: [constants.CONFIDENCE_MEDIUM_MIN_WIDTH_KCAL, constants.CONFIDENCE_GOOD_MIN_WIDTH_KCAL, constants.CONFIDENCE_HIGH_MIN_SPAN_DAYS, constants.CONFIDENCE_HIGH_MIN_WEIGHINS, constants.CONFIDENCE_HIGH_MAX_MAJOR_FRACTION],
      surfacing: [constants.RECAL_SURFACE_MIN_CHANGE_KCAL, constants.RECAL_SURFACE_MIN_WIDTH_SHRINK, constants.RECAL_SURFACE_MIN_DAYS, constants.RECAL_SURFACE_MIN_CHANGE_AFTER_DAYS_KCAL],
      slider: [constants.SLIDER_MIN_STEPS_FLOOR, constants.SLIDER_MIN_STEPS_BELOW_BASELINE, constants.SLIDER_MAX_STEPS_CEILING, constants.SLIDER_MAX_STEPS_ABOVE_BASELINE, constants.SLIDER_HARD_MAX_STEPS, constants.SLIDER_RECOMMENDED_HALF_WIDTH_STEPS],
      solver: [constants.GOAL_SOLVER_HORIZON_DAYS, constants.GOAL_SOLVER_MAX_ITERATIONS, constants.GOAL_SOLVER_CALORIE_TOLERANCE_KCAL, constants.GOAL_SOLVER_WEIGHT_TOLERANCE_KG, constants.PROJECTION_MAX_DAYS],
      trend: constants.TREND_HALF_LIFE_DAYS,
      rounding: [constants.DISPLAY_KCAL_ROUNDING, constants.DISPLAY_STEPS_ROUNDING, constants.DISPLAY_WEIGHT_DECIMALS],
    }).toEqual({
      TEF: [0.25, 0.075, 0.025, 0.1],
      SEPV: [241, 342],
      Z: [1.2815515655, 1.96],
      PAL: [1.53, 1.68, 1.85, 2.5, 0.2, 0.05],
      multipliers: [1.15, 1.15, 1.15],
      posture: [0, 18, 54, 54],
      protein: [1.2, 1.6, 1.6, 1.8, 2.3, 2.2],
      fat: [0.3, 0.25, 0.6, 0.2],
      loss: [0.002, 0.005, 0.0075, 0.01, 0.0025, 0.005],
      gain: [0.001, 0.0025, 0.005],
      referenceWeight: [25, 0.33],
      hallTef: 0.1,
      floors: [1200, 1500, 0.7],
      calibration: [1, 0.35, 0, 0.5, 0.7, -1200, 1200, 5, 4, 0.6],
      gate: [5, 14, 4, 0.5],
      confidence: [500, 300, 28, 8, 0.25],
      surfacing: [75, 0.1, 7, 40],
      slider: [2000, 6000, 20000, 10000, 30000, 3000],
      solver: [42, 60, 1, 0.01, 730],
      trend: 7,
      rounding: [10, 100, 1],
    });
  });

  it('step pace presets match 02 section 2', () => {
    expect(STEP_PACE_PRESETS_ADULT).toMatchObject({ slow: { cadenceStepsPerMin: 80, met: 2.8 }, normal: { cadenceStepsPerMin: 100, met: 3.8 }, brisk: { cadenceStepsPerMin: 120, met: 4.8 } });
    expect(STEP_PACE_PRESETS_OLDER).toMatchObject({ slow: { cadenceStepsPerMin: 80, met: 4.0 }, normal: { cadenceStepsPerMin: 100, met: 5.3 }, brisk: { cadenceStepsPerMin: 115, met: 6.0 } });
  });

  it('structured MET values given in 02 section 3 are used as written', () => {
    expect([ACTIVITY_MET_TABLE.strength.adult.light.met, ACTIVITY_MET_TABLE.strength.adult.moderate.met, ACTIVITY_MET_TABLE.strength.adult.vigorous.met]).toEqual([3.0, 3.5, 6.0]);
    expect([ACTIVITY_MET_TABLE.running.adult.light.met, ACTIVITY_MET_TABLE.running.adult.moderate.met, ACTIVITY_MET_TABLE.running.adult.vigorous.met]).toEqual([7.5, 9.3, 11.8]);
    expect([ACTIVITY_MET_TABLE.cycling.adult.light.met, ACTIVITY_MET_TABLE.cycling.adult.moderate.met, ACTIVITY_MET_TABLE.cycling.adult.vigorous.met]).toEqual([4.0, 6.8, 9.3]);
    expect([ACTIVITY_MET_TABLE.swimming.adult.light.met, ACTIVITY_MET_TABLE.swimming.adult.moderate.met, ACTIVITY_MET_TABLE.swimming.adult.vigorous.met]).toEqual([6.0, 7.0, 9.8]);
    for (const t of ['running', 'walking', 'hiking', 'team_sport'] as const) expect(ACTIVITY_MET_TABLE[t].stepDominant).toBe(true);
    for (const t of ['strength', 'cycling', 'swimming', 'rowing'] as const) expect(ACTIVITY_MET_TABLE[t].stepDominant).toBe(false);
  });
});
