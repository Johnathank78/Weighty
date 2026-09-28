/**
 * Schema migrations. Each migration upgrades a raw object from version N to N+1.
 * Migrations never drop data they do not understand: unknown fields are carried over.
 */
import { PLAN_MESSAGE } from '@/domain/planMessages';
import { emptyFoodJournal, SCHEMA_VERSION } from '@/domain/types';
import type { PlanEvent } from '@/domain/types';
import { TARGET_BMI_MIN } from '@/science/constants';
import { localIsoDate } from '@/science/dates';
import { bmi, minimumTargetWeightKg } from '@/science/macros';
import { isObject } from './schema';

/** When the migration runs (dates the trace entry of the 6 -> 7 target migration). */
export type MigrationContext = { nowIso: string };
export type Migration = (input: Record<string, unknown>, context: MigrationContext) => Record<string, unknown>;

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * 6 -> 7, loss target (pass 5a): a stored loss target under the BMI-20 weight is raised to it (`minimumTargetWeightKg`),
 * in the profile and in the plan in force, and a trace entry announces it once. Null when nothing is raised.
 */
function raiseLossTarget(input: Record<string, unknown>, context: MigrationContext): { profile: Record<string, unknown>; plan: unknown; event: PlanEvent } | null {
  const profile = input.profile;
  if (!isObject(profile) || profile.goal !== 'loss' || !num(profile.heightCm) || !num(profile.targetWeightKg)) return null;
  if (bmi(profile.targetWeightKg, profile.heightCm) >= TARGET_BMI_MIN) return null;
  const min = minimumTargetWeightKg(profile.heightCm);
  if (profile.targetWeightKg >= min) return null;
  const plan = input.plan;
  const raisedPlan = isObject(plan) && plan.goal === 'loss' && num(plan.targetWeightKg) && plan.targetWeightKg < min ? { ...plan, targetWeightKg: min } : plan;
  const event: PlanEvent = {
    id: `e-${context.nowIso.replace(/D/g, '')}-target`,
    date: localIsoDate(new Date(context.nowIso)),
    rule: 'target_bmi_20',
    status: 'applied',
    before: null,
    after: null,
    message: PLAN_MESSAGE.targetRaised(min),
    seen: false,
  };
  return { profile: { ...profile, targetWeightKg: min }, plan: raisedPlan, event };
}

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
  // 2 -> 3 (no model change, J-01): empty food journal and product search opt-in, off by default.
  // Nothing existing is modified: dailyLogs and plan targets stay untouched.
  2: (input) => {
    const out: Record<string, unknown> = { ...input, schemaVersion: 3, foodJournal: input.foodJournal ?? emptyFoodJournal() };
    if (isObject(input.preferences)) out.preferences = { ...input.preferences, productSearchEnabled: false };
    return out;
  },
  // 3 -> 4 (no model change, J-06): time of consumption. Schema 3 only knew the save time, which is the
  // best available value; the entry day is kept as it was. Everything else is carried over untouched.
  3: (input) => {
    const out: Record<string, unknown> = { ...input, schemaVersion: 4 };
    const journal = input.foodJournal;
    if (isObject(journal) && Array.isArray(journal.entries)) {
      out.foodJournal = { ...journal, entries: journal.entries.map((e) => (isObject(e) && e.consumedTime === undefined && typeof e.localTime === 'string' ? { ...e, consumedTime: e.localTime } : e)) };
    }
    return out;
  },
  // 4 -> 5 (no model change, J-09): empty "Mes aliments" library. Entries, portions and all other data untouched.
  4: (input) => {
    const out: Record<string, unknown> = { ...input, schemaVersion: 5 };
    const journal = input.foodJournal;
    if (isObject(journal) && journal.library === undefined) out.foodJournal = { ...journal, library: [] };
    return out;
  },
  // 5 -> 6 (no model change, C-01): weigh-ins can carry `menstruating`, journaling only. Existing
  // weigh-ins are left exactly as they are: an absent flag means "not noted", which is the truth for
  // every weigh-in saved before the box existed. The bump is what keeps a version 6 export out of an
  // older build, and lets a version 5 file be read here.
  5: (input) => ({ ...input, schemaVersion: 6 }),
  // 6 -> 7 (model 1.4.0, pass 5a): plan sources 'guardrail' and 'periodic_replan' (new values only), the persistent trace
  // and the two dates of the plan checks, empty or null. A loss target under the BMI-20 weight is raised to it, with a
  // trace entry that announces it once. Weigh-ins, logs, snapshots, the journal and every other field are carried over.
  6: (input, context) => {
    const meta = isObject(input.meta) ? input.meta : {};
    const events = Array.isArray(meta.planEvents) ? meta.planEvents : [];
    const raised = raiseLossTarget(input, context);
    return {
      ...input,
      schemaVersion: 7,
      ...(raised ? { profile: raised.profile, plan: raised.plan } : {}),
      meta: {
        ...meta,
        planEvents: raised ? [...events, raised.event] : events,
        periodicReplanCheckedOn: meta.periodicReplanCheckedOn ?? null,
        guardrailMaintenanceSince: meta.guardrailMaintenanceSince ?? null,
      },
    };
  },
};

export type MigrationResult = { ok: true; value: Record<string, unknown>; fromVersion: number } | { ok: false; error: 'not_an_object' | 'future_schema_version' | 'missing_migration' };

export function migrateToCurrent(
  raw: unknown,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  target = SCHEMA_VERSION,
  context: MigrationContext = { nowIso: new Date().toISOString() },
): MigrationResult {
  if (!isObject(raw)) return { ok: false, error: 'not_an_object' };
  const version = typeof raw.schemaVersion === 'number' && Number.isInteger(raw.schemaVersion) ? raw.schemaVersion : 0;
  if (version > target) return { ok: false, error: 'future_schema_version' };
  let value: Record<string, unknown> = raw;
  for (let v = version; v < target; v++) {
    const m = migrations[v];
    if (!m) return { ok: false, error: 'missing_migration' };
    value = m(value, context);
  }
  return { ok: true, value, fromVersion: version };
}
