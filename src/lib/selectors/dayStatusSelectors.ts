/**
 * Day Status Selectors
 *
 * Pure, I/O-free helpers that decide what the day-status banners should show.
 * These delegate the actual "is this day partially logged" judgment call to
 * the canonical, unit-tested edgeCaseHandler engine rather than restating the
 * threshold math in each UI component.
 */

import { isPartialLogging } from '@/lib/edgeCaseHandler';

/**
 * Fallback TDEE used only when neither a real computed TDEE nor a calorie
 * goal is available (e.g. brand-new users with no data yet).
 */
export const DEFAULT_FALLBACK_TDEE = 2000;

function isValidPositive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Resolve the TDEE value the day-status banners should treat as "real".
 *
 * Precedence: a valid, positive computed TDEE (from ComputedState) wins;
 * otherwise fall back to the user's calorie goal (better than nothing, but
 * note this is a goal-adjusted target, not TDEE); otherwise use a fixed
 * default so cold-start users still get sane heuristics.
 */
export function resolveEffectiveTdee(input: {
  latestComputedTdee?: number | null;
  calorieGoal?: number | null;
}): number {
  if (isValidPositive(input.latestComputedTdee)) {
    return input.latestComputedTdee;
  }
  if (isValidPositive(input.calorieGoal)) {
    return input.calorieGoal;
  }
  return DEFAULT_FALLBACK_TDEE;
}

/**
 * Determine whether a day's logged calories look like partial/incomplete
 * logging, given an effective TDEE. Delegates entirely to
 * edgeCaseHandler.isPartialLogging so the threshold logic lives in one place.
 */
export function assessPartialLogging(
  totalCalories: number,
  effectiveTdee: number
): { isPartial: boolean; reason: string | null } {
  return isPartialLogging(totalCalories, effectiveTdee);
}
