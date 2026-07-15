/**
 * Unit tests for macro <-> calorie arithmetic used by the onboarding
 * macro step (protein/carbs 4 kcal/g, fat 9 kcal/g).
 */

import {
  macroCalories,
  remainingCalories,
  macroPercent,
  gramsForRemaining,
  gramsFromSplit,
  MACRO_SPLIT_PRESETS,
} from '@/lib/macroMath';

describe('macroCalories', () => {
  it('sums 4/4/9 kcal per gram', () => {
    expect(macroCalories({ protein: 150, carbs: 200, fat: 65 })).toBe(
      150 * 4 + 200 * 4 + 65 * 9
    );
  });
});

describe('remainingCalories', () => {
  it('is the calorie goal minus allocated macro calories', () => {
    expect(remainingCalories(2000, { protein: 150, carbs: 200, fat: 0 })).toBe(600);
  });

  it('goes negative when macros exceed the goal', () => {
    expect(remainingCalories(1000, { protein: 150, carbs: 200, fat: 0 })).toBe(-400);
  });
});

describe('macroPercent', () => {
  it('reports each macro as a share of the calorie goal', () => {
    expect(macroPercent(2000, 150, 'protein')).toBe(30); // 600/2000
    expect(macroPercent(2000, 100, 'fat')).toBe(45); // 900/2000
  });

  it('is 0 when the calorie goal is 0', () => {
    expect(macroPercent(0, 150, 'protein')).toBe(0);
  });
});

describe('gramsForRemaining', () => {
  it('sizes the macro to absorb exactly the unallocated calories', () => {
    // 2000 - (150*4 + 200*4) = 600 kcal remaining -> 600/9 ≈ 67g fat
    expect(gramsForRemaining(2000, { protein: 150, carbs: 200, fat: 65 }, 'fat')).toBe(67);
  });

  it('recomputes from the other two macros, ignoring its current value', () => {
    expect(gramsForRemaining(2000, { protein: 150, carbs: 200, fat: 0 }, 'fat')).toBe(67);
  });

  it('clamps at zero when the other macros already exceed the goal', () => {
    expect(gramsForRemaining(1000, { protein: 200, carbs: 200, fat: 50 }, 'fat')).toBe(0);
  });
});

describe('gramsFromSplit', () => {
  it('converts a percentage split into grams', () => {
    const grams = gramsFromSplit(2000, { protein: 30, carbs: 40, fat: 30 });
    expect(grams).toEqual({
      protein: 150, // 600 kcal / 4
      carbs: 200, // 800 kcal / 4
      fat: 67, // 600 kcal / 9, rounded
    });
  });
});

describe('MACRO_SPLIT_PRESETS', () => {
  it('all sum to 100%', () => {
    for (const preset of MACRO_SPLIT_PRESETS) {
      expect(preset.protein + preset.carbs + preset.fat).toBe(100);
    }
  });
});
