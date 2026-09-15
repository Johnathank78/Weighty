/**
 * Curated, bundled MET table for structured activities (02 section 3).
 *
 * Sources bundled at build time (no runtime fetch):
 * - 2024 Adult Compendium of Physical Activities, PMID 38242596, activity codes cited per entry.
 * - 2024 Older Adult Compendium (MET60, 2.7 ml O2/kg/min), PMID 38242593, codes cited per entry.
 *
 * Values given explicitly in instruct/02 section 3 are used as written there.
 * Entries marked `older: null` have no Older Adult Compendium equivalent: the
 * adult MET with the 3.5 ml/kg/min basis is used instead (IMPLEMENTATION_NOTES D-04).
 */
import type { ActivityIntensity, StructuredActivityType, WalkingPace } from './types';
import { RUNNING_CADENCE_STEPS_PER_MIN } from './constants';

export type MetEntry = {
  readonly met: number;
  readonly source: string;
};

export type ActivityMetDefinition = {
  readonly stepDominant: boolean;
  /**
   * Steps per minute used to estimate the steps already counted by the phone
   * for step-dominant activities. null = no activity-specific cadence, use the
   * user's usual walking-pace cadence and widen uncertainty.
   */
  readonly cadenceStepsPerMin: number | null;
  readonly cadenceSource: string;
  readonly adult: Readonly<Record<ActivityIntensity, MetEntry>>;
  readonly older: Readonly<Record<ActivityIntensity, MetEntry | null>>;
};

export const STEP_PACE_PRESETS_ADULT: Readonly<Record<WalkingPace, { cadenceStepsPerMin: number; met: number; source: string }>> = {
  slow: { cadenceStepsPerMin: 80, met: 2.8, source: '02 s2; Adult 17152 walking 2.0-2.4 mph' },
  normal: { cadenceStepsPerMin: 100, met: 3.8, source: '02 s2; Adult 17190 walking 2.8-3.4 mph' },
  brisk: { cadenceStepsPerMin: 120, met: 4.8, source: '02 s2; Adult 17200 walking 3.5-3.9 mph' },
};

export const STEP_PACE_PRESETS_OLDER: Readonly<Record<WalkingPace, { cadenceStepsPerMin: number; met: number; source: string }>> = {
  slow: { cadenceStepsPerMin: 80, met: 4.0, source: '02 s2; Older 1715260 walking 1.0-1.9 mph' },
  normal: { cadenceStepsPerMin: 100, met: 5.3, source: '02 s2; Older 1719060 walking 2.8-3.2 mph' },
  brisk: { cadenceStepsPerMin: 115, met: 6.0, source: '02 s2; Older 1720060 walking 3.3-3.7 mph' },
};

export const ACTIVITY_MET_TABLE: Readonly<Record<StructuredActivityType, ActivityMetDefinition>> = {
  strength: {
    stepDominant: false,
    cadenceStepsPerMin: null,
    cadenceSource: 'not step dominant',
    adult: {
      light: { met: 3.0, source: '02 s3; Adult 02056 body weight resistance, general' },
      moderate: { met: 3.5, source: '02 s3; Adult 02054 multiple exercises 8-15 reps' },
      vigorous: { met: 6.0, source: '02 s3; Adult 02050 power lifting or body building, vigorous' },
    },
    older: {
      light: { met: 2.3, source: 'Older 0205360 resistance training, general, light' },
      moderate: { met: 4.3, source: 'Older 0205460 multiple exercises 8-15 reps' },
      vigorous: null,
    },
  },
  running: {
    stepDominant: true,
    cadenceStepsPerMin: RUNNING_CADENCE_STEPS_PER_MIN,
    cadenceSource: 'engineering prior, IMPLEMENTATION_NOTES D-05',
    adult: {
      light: { met: 7.5, source: '02 s3; Adult 12020 jogging, general' },
      moderate: { met: 9.3, source: '02 s3; Adult 12050 running 6-6.3 mph' },
      vigorous: { met: 11.8, source: '02 s3; Adult 12080 running 7.5 mph' },
    },
    older: {
      light: { met: 8.5, source: 'Older 1202860 running 3.6 mph' },
      moderate: null,
      vigorous: { met: 15.8, source: 'Older 1207060 running 7 mph' },
    },
  },
  walking: {
    stepDominant: true,
    cadenceStepsPerMin: null,
    cadenceSource: 'uses the walking-pace cadence matching the intensity (02 s2 presets)',
    adult: {
      light: { met: 2.8, source: 'Adult 17152 walking 2.0-2.4 mph' },
      moderate: { met: 3.8, source: 'Adult 17190 walking 2.8-3.4 mph' },
      vigorous: { met: 4.8, source: 'Adult 17200 walking 3.5-3.9 mph brisk' },
    },
    older: {
      light: { met: 4.0, source: 'Older 1715260 walking 1.0-1.9 mph' },
      moderate: { met: 5.3, source: 'Older 1719060 walking 2.8-3.2 mph' },
      vigorous: { met: 6.0, source: 'Older 1720060 walking 3.3-3.7 mph brisk' },
    },
  },
  hiking: {
    stepDominant: true,
    cadenceStepsPerMin: null,
    cadenceSource: 'no activity-specific cadence bundled, IMPLEMENTATION_NOTES D-05',
    adult: {
      light: { met: 3.8, source: 'Adult 17081 hiking slowly, no load' },
      moderate: { met: 5.3, source: 'Adult 17082 hiking normal pace, no load' },
      vigorous: { met: 6.0, source: 'Adult 17080 hiking, cross country' },
    },
    older: { light: null, moderate: null, vigorous: null },
  },
  cycling: {
    stepDominant: false,
    cadenceStepsPerMin: null,
    cadenceSource: 'not step dominant',
    adult: {
      light: { met: 4.0, source: '02 s3; Adult 01010 <10 mph leisure' },
      moderate: { met: 6.8, source: '02 s3; Adult 01011 to/from work, self-selected pace' },
      vigorous: { met: 9.3, source: '02 s3 suggested default (closest 2024 entry 01017 = 9.0), IMPLEMENTATION_NOTES D-04' },
    },
    older: {
      light: { met: 4.3, source: 'Older 0101160 stationary 30-50 W' },
      moderate: { met: 5.3, source: 'Older 0101060 stationary general moderate' },
      vigorous: { met: 6.3, source: 'Older 0101260 stationary 90-100 W vigorous' },
    },
  },
  swimming: {
    stepDominant: false,
    cadenceStepsPerMin: null,
    cadenceSource: 'not step dominant',
    adult: {
      light: { met: 6.0, source: '02 s3; Adult 18310 leisurely, general' },
      moderate: { met: 7.0, source: '02 s3; Adult 18320 sidestroke general' },
      vigorous: { met: 9.8, source: '02 s3; Adult 18230 laps freestyle fast vigorous' },
    },
    older: { light: null, moderate: null, vigorous: null },
  },
  rowing: {
    stepDominant: false,
    cadenceStepsPerMin: null,
    cadenceSource: 'not step dominant',
    adult: {
      light: { met: 5.0, source: 'Adult 02071 ergometer <100 W' },
      moderate: { met: 7.5, source: 'Adult 02072 ergometer 100-149 W' },
      vigorous: { met: 11.0, source: 'Adult 02073 ergometer 150-199 W' },
    },
    older: {
      light: null,
      moderate: { met: 6.5, source: 'Older 0207260 stationary 50-99 W' },
      vigorous: { met: 9.0, source: 'Older 0207360 stationary 100-149 W' },
    },
  },
  team_sport: {
    stepDominant: true,
    cadenceStepsPerMin: null,
    cadenceSource: 'no activity-specific cadence bundled, IMPLEMENTATION_NOTES D-05',
    adult: {
      light: { met: 6.0, source: 'Adult 15050 basketball, non-game, general' },
      moderate: { met: 7.0, source: 'Adult 15610 soccer, casual, general' },
      vigorous: { met: 9.5, source: 'Adult 15605 soccer, competitive' },
    },
    older: { light: null, moderate: null, vigorous: null },
  },
  other: {
    stepDominant: false,
    cadenceStepsPerMin: null,
    cadenceSource: 'not step dominant (generic category)',
    adult: {
      light: { met: 3.8, source: 'Adult 02064 home exercise, general (generic category)' },
      moderate: { met: 5.5, source: 'Adult 02060 health club exercise, general (generic category)' },
      vigorous: { met: 7.8, source: 'Adult 02062 health club conditioning classes (generic category)' },
    },
    older: { light: null, moderate: null, vigorous: null },
  },
};

/** Walking-intensity to pace mapping, used for structured walking cadence. */
export const WALKING_INTENSITY_TO_PACE: Readonly<Record<ActivityIntensity, WalkingPace>> = {
  light: 'slow',
  moderate: 'normal',
  vigorous: 'brisk',
};
