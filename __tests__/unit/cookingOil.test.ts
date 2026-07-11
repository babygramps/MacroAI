import {
  createCookingOilIngredient,
  MAX_COOKING_OIL_TEASPOONS,
  MIN_COOKING_OIL_TEASPOONS,
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

  it('rejects an amount just below the minimum', () => {
    expect(
      createCookingOilIngredient(MIN_COOKING_OIL_TEASPOONS - 0.001)
    ).toBeNull();
  });

  it('accepts the minimum with a usable weight', () => {
    const ingredient = createCookingOilIngredient(
      MIN_COOKING_OIL_TEASPOONS
    );

    expect(ingredient).not.toBeNull();
    expect(ingredient?.weightG).toBeGreaterThanOrEqual(1);
    expect(ingredient?.servingSizeGrams).toBeGreaterThanOrEqual(1);
  });

  it('accepts the maximum with finite nutrition values', () => {
    const ingredient = createCookingOilIngredient(
      MAX_COOKING_OIL_TEASPOONS
    );

    expect(ingredient).not.toBeNull();
    expect(ingredient).toEqual(
      expect.objectContaining({
        servingDescription: `${MAX_COOKING_OIL_TEASPOONS} tsp`,
      })
    );
    for (const value of [
      ingredient?.calories,
      ingredient?.protein,
      ingredient?.carbs,
      ingredient?.fat,
      ingredient?.weightG,
      ingredient?.servingSizeGrams,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('rejects an amount just above the maximum', () => {
    expect(
      createCookingOilIngredient(MAX_COOKING_OIL_TEASPOONS + 0.001)
    ).toBeNull();
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
    expect(
      withCookingOil(ingredients, MIN_COOKING_OIL_TEASPOONS - 0.001)
    ).toBe(ingredients);
    expect(
      withCookingOil(ingredients, MAX_COOKING_OIL_TEASPOONS + 0.001)
    ).toBe(ingredients);
  });

  it('appends oil without mutating the caller array', () => {
    const ingredients = [chicken];

    const result = withCookingOil(ingredients, 1);

    expect(result).toEqual([chicken, createCookingOilIngredient(1)]);
    expect(result).not.toBe(ingredients);
    expect(ingredients).toEqual([chicken]);
  });
});
