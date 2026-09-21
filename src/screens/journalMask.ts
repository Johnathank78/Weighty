/**
 * Masking state of the journal screen (J-11, A2). Display only: it lives in the screen's React state,
 * is never persisted and never reaches the domain. Leaving the mode shows every food again, so the eye
 * button and the gauges can never disagree.
 */
export type MaskState = {
  /** The eye button is on: each food shows its own eye instead of "Retirer". */
  active: boolean;
  /** Ids of the foods hidden from the gauges. Always empty when the mode is off. */
  ids: ReadonlySet<string>;
};

export const MASK_OFF: MaskState = { active: false, ids: new Set<string>() };

/** The main eye: entering starts from a clean selection, leaving shows everything again. */
export function toggleMaskMode(state: MaskState): MaskState {
  return state.active ? MASK_OFF : { active: true, ids: new Set<string>() };
}

/** One food's eye. Outside the mode nothing can be hidden. */
export function toggleMasked(state: MaskState, id: string): MaskState {
  if (!state.active) return state;
  const ids = new Set(state.ids);
  if (!ids.delete(id)) ids.add(id);
  return { active: true, ids };
}

/** Changing day, or leaving the journal, drops the selection with the mode. */
export function resetMask(): MaskState {
  return MASK_OFF;
}

export const isMasked = (state: MaskState, id: string): boolean => state.ids.has(id);
