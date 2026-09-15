/**
 * Residual NEAT bookkeeping (instruct/02 section 8).
 * The residual is NOT measured NEAT and must never be presented as such.
 */
import { referenceTefKcalDay } from './tef';

export type ExpenditureDecomposition = {
  initialTdeeKcal: number;
  reeKcal: number;
  netStepKcal: number;
  exerciseKcalAfterOverlap: number;
  occupationPostureKcal: number;
  referenceTefKcal: number;
  /** Raw diagnostic, can be negative. */
  residualNeatKcalRaw: number;
  /** Clamped at 0 for display only. */
  residualNeatKcalDisplay: number;
};

export function decomposeExpenditure(input: {
  initialTdeeKcal: number;
  reeKcal: number;
  netStepKcal: number;
  exerciseKcalAfterOverlap: number;
  occupationPostureKcal: number;
}): ExpenditureDecomposition {
  const referenceTefKcal = referenceTefKcalDay(input.initialTdeeKcal);
  const residualNeatKcalRaw =
    input.initialTdeeKcal - input.reeKcal - input.netStepKcal - input.exerciseKcalAfterOverlap - input.occupationPostureKcal - referenceTefKcal;
  return {
    ...input,
    referenceTefKcal,
    residualNeatKcalRaw,
    residualNeatKcalDisplay: Math.max(0, residualNeatKcalRaw),
  };
}
