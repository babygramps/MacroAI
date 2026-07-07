import {
  resolveEffectiveTdee,
  assessPartialLogging,
  DEFAULT_FALLBACK_TDEE,
} from '@/lib/selectors/dayStatusSelectors';
import { isPartialLogging } from '@/lib/edgeCaseHandler';

describe('resolveEffectiveTdee', () => {
  it('prefers a valid positive computed TDEE over the calorie goal', () => {
    expect(resolveEffectiveTdee({ latestComputedTdee: 2300, calorieGoal: 1800 })).toBe(2300);
  });

  it('falls back to the calorie goal when computed TDEE is undefined', () => {
    expect(resolveEffectiveTdee({ latestComputedTdee: undefined, calorieGoal: 1800 })).toBe(1800);
  });

  it('falls back to the calorie goal when computed TDEE is null', () => {
    expect(resolveEffectiveTdee({ latestComputedTdee: null, calorieGoal: 1800 })).toBe(1800);
  });

  it('falls back to the calorie goal when computed TDEE is zero', () => {
    expect(resolveEffectiveTdee({ latestComputedTdee: 0, calorieGoal: 1800 })).toBe(1800);
  });

  it('falls back to the calorie goal when computed TDEE is negative', () => {
    expect(resolveEffectiveTdee({ latestComputedTdee: -50, calorieGoal: 1800 })).toBe(1800);
  });

  it('falls back to the default constant when both inputs are missing', () => {
    expect(resolveEffectiveTdee({})).toBe(DEFAULT_FALLBACK_TDEE);
  });

  it('falls back to the default constant when both inputs are invalid (zero/negative)', () => {
    expect(resolveEffectiveTdee({ latestComputedTdee: 0, calorieGoal: -10 })).toBe(DEFAULT_FALLBACK_TDEE);
  });

  it('falls back to the default constant when both inputs are null', () => {
    expect(resolveEffectiveTdee({ latestComputedTdee: null, calorieGoal: null })).toBe(DEFAULT_FALLBACK_TDEE);
  });
});

describe('assessPartialLogging', () => {
  it('delegates to edgeCaseHandler.isPartialLogging and agrees just below the 50% threshold', () => {
    const totalCalories = 1249;
    const tdee = 2500;
    expect(assessPartialLogging(totalCalories, tdee)).toEqual(isPartialLogging(totalCalories, tdee));
    expect(assessPartialLogging(totalCalories, tdee).isPartial).toBe(true);
  });

  it('delegates to edgeCaseHandler.isPartialLogging and agrees just above the 50% threshold', () => {
    const totalCalories = 1251;
    const tdee = 2500;
    expect(assessPartialLogging(totalCalories, tdee)).toEqual(isPartialLogging(totalCalories, tdee));
    expect(assessPartialLogging(totalCalories, tdee).isPartial).toBe(false);
  });

  it('agrees with the engine on the minimum-valid-calories floor below the 50% threshold', () => {
    // At tdee=800, the 50% threshold (400) sits below MINIMUM_VALID_CALORIES (500),
    // so the engine's absolute floor is what actually governs this boundary.
    const tdee = 800;
    expect(assessPartialLogging(499, tdee)).toEqual(isPartialLogging(499, tdee));
    expect(assessPartialLogging(499, tdee).isPartial).toBe(true);
    expect(assessPartialLogging(500, tdee)).toEqual(isPartialLogging(500, tdee));
    expect(assessPartialLogging(500, tdee).isPartial).toBe(false);
  });

  it('treats zero calories as fasted, not partial, matching the engine', () => {
    expect(assessPartialLogging(0, 2500)).toEqual(isPartialLogging(0, 2500));
    expect(assessPartialLogging(0, 2500).isPartial).toBe(false);
  });
});
