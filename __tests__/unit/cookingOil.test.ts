import {
  createCookingOilIngredient,
  withCookingOil,
} from '@/lib/meal/cookingOil';
import type { LogMealIngredientInput } from '@/lib/meal/logMeal';

const chicken: LogMealIngredientInput = {
  name: 'Chicken breast',
  weightG: 100,
  calories: 165,
  protein: 31,
  carbs: 0,
  fat: 3.6,
  source: 'USDA',
};

describe('createCookingOilIngredient', () => {
  it('returns null when no oil is selected', () => {
    expect(createCookingOilIngredient(0)).toBeNull();
  });

  it('creates nutrition and serving metadata for one teaspoon', () => {
    expect(createCookingOilIngredient(1)).toEqual({
      name: 'Cooking oil',
      source: 'MANUAL',
      calories: 40,
      protein: 0,
      carbs: 0,
      fat: 4.5,
      weightG: 5,
      servingDescription: '1 tsp',
      servingSizeGrams: 5,
    });
  });

  it('scales three teaspoons (one tablespoon) linearly', () => {
    expect(createCookingOilIngredient(3)).toEqual({
      name: 'Cooking oil',
      source: 'MANUAL',
      calories: 120,
      protein: 0,
      carbs: 0,
      fat: 13.5,
      weightG: 14,
      servingDescription: '3 tsp',
      servingSizeGrams: 14,
    });
  });

  it('rounds a custom fractional amount as required', () => {
    expect(createCookingOilIngredient(1.25)).toEqual({
      name: 'Cooking oil',
      source: 'MANUAL',
      calories: 50,
      protein: 0,
      carbs: 0,
      fat: 5.6,
      weightG: 6,
      servingDescription: '1.25 tsp',
      servingSizeGrams: 6,
    });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'returns null for invalid input %s',
    (teaspoons) => {
      expect(createCookingOilIngredient(teaspoons)).toBeNull();
    }
  );
});

describe('withCookingOil', () => {
  it('returns the original list when no valid oil is selected', () => {
    const ingredients = [chicken];

    expect(withCookingOil(ingredients, 0)).toBe(ingredients);
  });

  it('appends oil without mutating the caller array', () => {
    const ingredients = [chicken];

    const result = withCookingOil(ingredients, 1);

    expect(result).toEqual([chicken, createCookingOilIngredient(1)]);
    expect(result).not.toBe(ingredients);
    expect(ingredients).toEqual([chicken]);
  });
});
