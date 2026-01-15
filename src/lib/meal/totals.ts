import type { IngredientEntry } from '@/lib/types';

export function calculateMealTotals(
  ingredients: Omit<IngredientEntry, 'id' | 'mealId' | 'sortOrder'>[]
): {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalWeightG: number;
} {
  return ingredients.reduce(
    (acc, ing) => ({
      totalCalories: acc.totalCalories + ing.calories,
      totalProtein: acc.totalProtein + ing.protein,
      totalCarbs: acc.totalCarbs + ing.carbs,
      totalFat: acc.totalFat + ing.fat,
      totalWeightG: acc.totalWeightG + ing.weightG,
    }),
    { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0, totalWeightG: 0 }
  );
}
