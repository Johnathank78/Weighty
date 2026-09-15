/** Historical intake evidence generated with the production Hall model (warm-start tests). */
import { assessBaseline, planContextFrom } from '@/science/assessment';
import { baselineCarbFractionFor } from '@/science/goals';
import { initializeHall, simulateHall } from '@/science/hall/model';
import type { HistoricalIntakeEvidence, TrackingQuality, UserProfile } from '@/science/types';

/** End weight after `days` at `intakeKcal` for a person whose true maintenance is NASEM + trueOffset at the start weight. */
export function historyEndWeight(profile: UserProfile, today: string, startWeightKg: number, trueOffsetKcal: number, intakeKcal: number, days: number): number {
  const a = assessBaseline(profile, today, { weightKg: startWeightKg });
  const carb = baselineCarbFractionFor(planContextFrom(profile, a, a.populationTdeeKcal), 'maintenance');
  const p = initializeHall({ sex: profile.sexForEquation, ageYears: profile.ageYears, heightM: profile.heightCm / 100, bodyWeightKg: startWeightKg, baselineIntakeKcal: a.populationTdeeKcal + trueOffsetKcal, baselineRmrKcal: a.ree.reeKcalDay, baselineCarbFraction: carb });
  return simulateHall(p, days, () => ({ intakeKcal, carbKcal: carb * intakeKcal, paDeltaKcalPerKgDay: 0, sodiumDeltaMg: 0 }), { recordEveryDays: days }).days.at(-1)?.bodyWeightKg as number;
}

export function makeHistory(
  profile: UserProfile,
  today: string,
  options: { startWeightKg: number; trueOffsetKcal: number; intakeKcal: number; days: number; quality: TrackingQuality; activityComparable?: boolean },
): { evidence: HistoricalIntakeEvidence; profile: UserProfile } {
  const end = historyEndWeight(profile, today, options.startWeightKg, options.trueOffsetKcal, options.intakeKcal, options.days);
  const endWeightKg = Math.round(end * 10) / 10;
  return {
    profile: { ...profile, currentWeightKg: endWeightKg },
    evidence: {
      evidenceVersion: 1,
      recordedOn: today,
      averageCaloriesKcal: options.intakeKcal,
      durationDays: options.days,
      startWeightKg: options.startWeightKg,
      endWeightKg,
      trackingQuality: options.quality,
      activityComparable: options.activityComparable ?? true,
    },
  };
}
