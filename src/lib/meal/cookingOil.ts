import type { LogMealIngredientInput } from '@/lib/meal/logMeal';

const CALORIES_PER_TEASPOON = 40;
const FAT_GRAMS_PER_TEASPOON = 4.5;
const WEIGHT_GRAMS_PER_TEASPOON = 4.5;

export function createCookingOilIngredient(
  teaspoons: number
): LogMealIngredientInput | null {
  if (!Number.isFinite(teaspoons) || teaspoons <= 0) {
    return null;
  }

  const weightG = Math.round(teaspoons * WEIGHT_GRAMS_PER_TEASPOON);

  return {
    name: 'Cooking oil',
    source: 'MANUAL',
    calories: Math.round(teaspoons * CALORIES_PER_TEASPOON),
    protein: 0,
    carbs: 0,
    fat: Math.round(teaspoons * FAT_GRAMS_PER_TEASPOON * 10) / 10,
    weightG,
    servingDescription: `${teaspoons} tsp`,
    servingSizeGrams: weightG,
  };
}

export function withCookingOil(
  ingredients: LogMealIngredientInput[],
  teaspoons: number
): LogMealIngredientInput[] {
  const cookingOil = createCookingOilIngredient(teaspoons);

  return cookingOil ? [...ingredients, cookingOil] : ingredients;
}
