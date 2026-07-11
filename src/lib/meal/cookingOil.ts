import type { LogMealIngredientInput } from '@/lib/meal/logMeal';

const CALORIES_PER_TEASPOON = 40;
const FAT_GRAMS_PER_TEASPOON = 4.5;
const WEIGHT_GRAMS_PER_TEASPOON = 4.5;

export const MIN_COOKING_OIL_TEASPOONS = 0.25;
export const MAX_COOKING_OIL_TEASPOONS = 48;

export function createCookingOilIngredient(
  teaspoons: number
): LogMealIngredientInput | null {
  if (
    !Number.isFinite(teaspoons) ||
    teaspoons < MIN_COOKING_OIL_TEASPOONS ||
    teaspoons > MAX_COOKING_OIL_TEASPOONS
  ) {
    return null;
  }

  const weightG = Math.round(teaspoons * WEIGHT_GRAMS_PER_TEASPOON);
  const calories = Math.round(teaspoons * CALORIES_PER_TEASPOON);
  const fat = Math.round(teaspoons * FAT_GRAMS_PER_TEASPOON * 10) / 10;

  if (
    ![weightG, calories, fat].every(Number.isFinite) ||
    weightG < 1 ||
    calories <= 0 ||
    fat <= 0
  ) {
    return null;
  }

  return {
    name: 'Cooking oil',
    source: 'MANUAL',
    calories,
    protein: 0,
    carbs: 0,
    fat,
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
