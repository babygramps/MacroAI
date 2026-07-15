/**
 * Macro <-> calorie arithmetic (protein/carbs 4 kcal/g, fat 9 kcal/g)
 * shared by the onboarding macro step.
 */

export type MacroName = 'protein' | 'carbs' | 'fat';

export const MACRO_KCAL_PER_GRAM: Record<MacroName, number> = {
  protein: 4,
  carbs: 4,
  fat: 9,
};

export interface MacroGrams {
  protein: number;
  carbs: number;
  fat: number;
}

/** Percentage split across the three macros; expected to sum to 100. */
export interface MacroSplit {
  protein: number;
  carbs: number;
  fat: number;
}

export function macroCalories(grams: MacroGrams): number {
  return (
    grams.protein * MACRO_KCAL_PER_GRAM.protein +
    grams.carbs * MACRO_KCAL_PER_GRAM.carbs +
    grams.fat * MACRO_KCAL_PER_GRAM.fat
  );
}

/** Calories in the goal not yet allocated to a macro (negative when over). */
export function remainingCalories(calorieGoal: number, grams: MacroGrams): number {
  return calorieGoal - macroCalories(grams);
}

/** This macro's share of the calorie goal, as a whole percentage. */
export function macroPercent(calorieGoal: number, grams: number, macro: MacroName): number {
  if (calorieGoal <= 0) return 0;
  return Math.round(((grams * MACRO_KCAL_PER_GRAM[macro]) / calorieGoal) * 100);
}

/**
 * Grams for `macro` such that the three macros together hit the calorie
 * goal exactly, given the other two macros' current grams. Clamped at 0.
 */
export function gramsForRemaining(calorieGoal: number, grams: MacroGrams, macro: MacroName): number {
  const others = remainingCalories(calorieGoal, { ...grams, [macro]: 0 });
  return Math.max(0, Math.round(others / MACRO_KCAL_PER_GRAM[macro]));
}

/** Convert a percentage split of the calorie goal into grams per macro. */
export function gramsFromSplit(calorieGoal: number, split: MacroSplit): MacroGrams {
  const toGrams = (pct: number, macro: MacroName) =>
    Math.round((calorieGoal * (pct / 100)) / MACRO_KCAL_PER_GRAM[macro]);
  return {
    protein: toGrams(split.protein, 'protein'),
    carbs: toGrams(split.carbs, 'carbs'),
    fat: toGrams(split.fat, 'fat'),
  };
}

export const MACRO_SPLIT_PRESETS: Array<MacroSplit & { label: string }> = [
  { label: 'Balanced', protein: 30, carbs: 40, fat: 30 },
  { label: 'High protein', protein: 40, carbs: 35, fat: 25 },
  { label: 'Low carb', protein: 35, carbs: 25, fat: 40 },
];
