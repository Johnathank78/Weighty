/**
 * "Je souhaite changer de plan" (UX pass 2, points 3 and 4): one entry in the Plan tab for the two ways to change the target,
 * "Choisir ma cible" (the personal target) and "Aligner ma cible sur ce que je mange" (the journal path). Their availability
 * is unchanged (`personalTargetAvailable`, `alignButton`); this only gathers them for the sheet.
 */
import { alignButton } from './journalPath';
import { personalTargetAvailable } from './personalTarget';
import { PLAN_CHANGE_MESSAGE } from './planMessages';
import type { WheightyStore } from './types';

export type PlanChangeOption = {
  id: 'personal' | 'align';
  title: string;
  /** Under the title: what the option is, or, greyed, what it waits for. */
  sub: string;
  enabled: boolean;
};

/**
 * The options of the sheet "Changer de plan", in their order; null when none is offered (no entry in Plan). An option the
 * data do not allow yet is listed greyed, with the existing line of what it waits for.
 */
export function planChangeOptions(store: WheightyStore, today: string): PlanChangeOption[] | null {
  const options: PlanChangeOption[] = [];
  if (personalTargetAvailable(store)) options.push({ id: 'personal', title: PLAN_CHANGE_MESSAGE.personalTitle, sub: PLAN_CHANGE_MESSAGE.personalSub, enabled: true });
  const align = alignButton(store, today);
  if (align) options.push({ id: 'align', title: PLAN_CHANGE_MESSAGE.alignTitle, sub: align.enabled ? PLAN_CHANGE_MESSAGE.alignSub : (align.hint ?? PLAN_CHANGE_MESSAGE.alignSub), enabled: align.enabled });
  return options.length > 0 ? options : null;
}
