/**
 * Schema migrations. Each migration upgrades a raw object from version N to N+1.
 * Migrations never drop data they do not understand: unknown fields are carried over.
 */
import { SCHEMA_VERSION } from '@/domain/types';
import { isObject } from './schema';

export type Migration = (input: Record<string, unknown>) => Record<string, unknown>;

/**
 * Frozen weekly rates of the schema-1 speed presets (instruct/04 s2 as of model 1.0.0), fraction of
 * body weight per week. Only used to translate stored presets; never used by the current engine.
 */
export const V1_SPEED_PRESET_RATES: Readonly<Record<'loss' | 'gain', Readonly<Record<'gentle' | 'moderate' | 'fast', number>>>> = {
  loss: { gentle: 0.0025, moderate: 0.005, fast: 0.0075 },
  gain: { gentle: 0.001, moderate: 0.0025, fast: 0.004 },
};

function presetRate(goal: unknown, speed: unknown): number | undefined {
  if (goal === 'maintenance') return 0;
  if ((goal !== 'loss' && goal !== 'gain') || (speed !== 'gentle' && speed !== 'moderate' && speed !== 'fast')) return undefined;
  return V1_SPEED_PRESET_RATES[goal][speed];
}

/** MIGRATIONS[n] upgrades version n to n + 1. Version 1 is the first schema. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // 0 -> 1: pre-release objects without schemaVersion.
  0: (input) => ({
    ...input,
    schemaVersion: 1,
    calibrationSnapshots: Array.isArray(input.calibrationSnapshots) ? input.calibrationSnapshots : [],
    dailyLogs: Array.isArray(input.dailyLogs) ? input.dailyLogs : [],
    weights: Array.isArray(input.weights) ? input.weights : [],
  }),
  // 1 -> 2 (model 1.1.0): speed presets become a continuous weekly rate; explicit historical evidence slot.
  // Everything else (weights, logs, snapshots, plan history, preferences, meta) is carried over untouched.
  1: (input) => {
    const out: Record<string, unknown> = { ...input, schemaVersion: 2, historicalEvidence: input.historicalEvidence ?? null };
    if (isObject(input.profile)) {
      const { speedPreset, ...profile } = input.profile;
      const rate = typeof profile.weeklyRateTarget === 'number' ? profile.weeklyRateTarget : presetRate(profile.goal, speedPreset);
      out.profile = rate === undefined ? input.profile : { ...profile, weeklyRateTarget: rate };
    }
    if (isObject(input.plan)) {
      const { speedPreset, appliedSpeed: _appliedSpeed, ...plan } = input.plan;
      const requested = presetRate(plan.goal, speedPreset);
      out.plan = requested === undefined ? plan : { ...plan, requestedWeeklyRate: requested };
    }
    return out;
  },
};

export type MigrationResult = { ok: true; value: Record<string, unknown>; fromVersion: number } | { ok: false; error: 'not_an_object' | 'future_schema_version' | 'missing_migration' };

export function migrateToCurrent(raw: unknown, migrations: Readonly<Record<number, Migration>> = MIGRATIONS, target = SCHEMA_VERSION): MigrationResult {
  if (!isObject(raw)) return { ok: false, error: 'not_an_object' };
  const version = typeof raw.schemaVersion === 'number' && Number.isInteger(raw.schemaVersion) ? raw.schemaVersion : 0;
  if (version > target) return { ok: false, error: 'future_schema_version' };
  let value: Record<string, unknown> = raw;
  for (let v = version; v < target; v++) {
    const m = migrations[v];
    if (!m) return { ok: false, error: 'missing_migration' };
    value = m(value);
  }
  return { ok: true, value, fromVersion: version };
}
