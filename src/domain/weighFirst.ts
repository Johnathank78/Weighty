/**
 * "Se peser d'abord" (report 50, UX pass 3, point 5, decision E5): at the opening of the sheets that change the plan ("Je
 * souhaite changer de plan", the change of speed and of goal), when the last valid weigh-in is more than
 * AUTO_UPDATE_MAX_WEIGHIN_AGE_DAYS (7) days old (the same reading as D3, report 49: age strictly over 7, or no weigh-in), a
 * short line invites to weigh in first. Nothing is blocked: "Continuer" goes on; the guardrails and the underweight alert do
 * not change.
 */
import { AUTO_UPDATE_MAX_WEIGHIN_AGE_DAYS } from '@/science/constants';
import { daysBetween } from '@/science/dates';
import { lastValidWeighInDate } from './engine';
import { WEIGH_FIRST_MESSAGE } from './planMessages';
import type { ShortText } from './planMessages';
import type { WheightyStore } from './types';

/** The invitation, or null when the last valid weigh-in is recent enough. `days`: its age, null without any weigh-in. */
export function weighFirstInvitation(store: WheightyStore, today: string): (ShortText & { days: number | null }) | null {
  const last = lastValidWeighInDate(store);
  const days = last === null ? null : daysBetween(last, today);
  if (days !== null && days <= AUTO_UPDATE_MAX_WEIGHIN_AGE_DAYS) return null;
  return { title: WEIGH_FIRST_MESSAGE.title, line: WEIGH_FIRST_MESSAGE.line(days), days };
}
