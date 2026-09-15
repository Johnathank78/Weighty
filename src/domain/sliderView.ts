/** Slider presentation helpers (bounds for the compact, non-draggable Plan preview). */
import { sliderBounds } from '@/science/goals';
import type { SliderBounds } from '@/science/goals';
import type { CurrentPlan } from './types';

export function sliderBoundsFor(plan: CurrentPlan): SliderBounds {
  return sliderBounds(plan.baselineStepTarget ?? plan.stepTarget);
}
