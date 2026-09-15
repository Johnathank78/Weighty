import type { UserProfile } from '@/science/types';

export function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    ageYears: 30,
    sexForEquation: 'female',
    heightCm: 165,
    currentWeightKg: 62,
    averageSteps7d: 7000,
    walkingPace: 'normal',
    occupation: 'seated',
    activities: [],
    goal: 'maintenance',
    targetWeightKg: 62,
    weeklyRateTarget: 0,
    ...overrides,
  };
}
