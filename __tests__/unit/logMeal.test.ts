/**
 * Unit tests for the unified logMeal use case.
 *
 * logMeal() generalizes the create-Meal -> create-MealIngredients (parallel)
 * -> verify -> onMealLogged -> optimistic-MealEntry sequence that used to be
 * hand-written in SearchTab/TextTab/PhotoTab/RecipeTab.
 */

import type { LogMealIngredientInput } from '@/lib/meal/logMeal';

// Mock the Amplify data client the way metabolicService.test.ts does.
const mockMealCreate = jest.fn();
const mockIngredientCreate = jest.fn();

jest.mock('@/lib/data/amplifyClient', () => ({
  getAmplifyDataClient: jest.fn(),
}));

jest.mock('@/lib/meal/mealVerification', () => ({
  verifyMealById: jest.fn(() => Promise.resolve({ verified: true, attempts: 1 })),
}));

jest.mock('@/lib/metabolicService', () => ({
  onMealLogged: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/clientLogger', () => ({
  logRemote: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { getAmplifyDataClient } from '@/lib/data/amplifyClient';
import { verifyMealById } from '@/lib/meal/mealVerification';
import { onMealLogged } from '@/lib/metabolicService';
import { logRemote } from '@/lib/clientLogger';
import {
  logMeal,
  buildOptimisticMeal,
  AmplifyClientNotReadyError,
} from '@/lib/meal/logMeal';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

function ingredient(overrides: Partial<LogMealIngredientInput> = {}): LogMealIngredientInput {
  return {
    name: 'Chicken breast',
    weightG: 200,
    calories: 330,
    protein: 62,
    carbs: 0,
    fat: 7,
    source: 'USDA',
    ...overrides,
  };
}

const baseMealRow = {
  id: 'meal-1',
  name: 'Lunch',
  category: 'meal',
  eatenAt: '2026-01-15T18:00:00.000Z',
  totalCalories: 500,
  totalProtein: 66,
  totalCarbs: 37,
  totalFat: 7,
  totalWeightG: 300,
};

describe('buildOptimisticMeal', () => {
  it('maps a meal row + ingredient rows into a MealEntry', () => {
    const ingredients = [
      {
        id: 'ing-1',
        mealId: 'meal-1',
        name: 'Chicken',
        weightG: 200,
        calories: 330,
        protein: 62,
        carbs: 0,
        fat: 7,
        source: 'USDA',
        servingDescription: null,
        servingSizeGrams: null,
        sortOrder: 0,
      },
      {
        id: 'ing-2',
        mealId: 'meal-1',
        name: 'Rice',
        weightG: 100,
        calories: 170,
        protein: 4,
        carbs: 37,
        fat: 0,
        source: 'USDA',
        servingDescription: '1 cup',
        servingSizeGrams: 158,
        sortOrder: 1,
      },
    ];

    const result = buildOptimisticMeal(baseMealRow, ingredients);

    expect(result).toEqual({
      id: 'meal-1',
      name: 'Lunch',
      category: 'meal',
      eatenAt: '2026-01-15T18:00:00.000Z',
      totalCalories: 500,
      totalProtein: 66,
      totalCarbs: 37,
      totalFat: 7,
      totalWeightG: 300,
      ingredients,
    });
  });

  it('defaults a missing sortOrder to 0', () => {
    const result = buildOptimisticMeal(baseMealRow, [
      {
        id: 'i',
        mealId: 'meal-1',
        name: 'Bar',
        weightG: 1,
        calories: 1,
        protein: 1,
        carbs: 1,
        fat: 1,
        source: 'USDA',
        sortOrder: undefined,
      },
    ]);
    expect(result.ingredients[0].sortOrder).toBe(0);
  });

  it('returns an empty ingredients array when no ingredient rows were created', () => {
    expect(buildOptimisticMeal(baseMealRow, [])).toEqual({ ...baseMealRow, ingredients: [] });
  });
});

describe('logMeal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAmplifyDataClient as jest.Mock).mockReturnValue({
      models: {
        Meal: { create: mockMealCreate },
        MealIngredient: { create: mockIngredientCreate },
      },
    });
  });

  it('throws AmplifyClientNotReadyError and never touches the client when Amplify is not ready', async () => {
    (getAmplifyDataClient as jest.Mock).mockReturnValue(null);

    await expect(
      logMeal({ name: 'Snack', category: 'snack', ingredients: [ingredient()] })
    ).rejects.toThrow(AmplifyClientNotReadyError);

    expect(mockMealCreate).not.toHaveBeenCalled();
  });

  it('defaults totals to calculateMealTotals(ingredients) when totals is omitted', async () => {
    mockMealCreate.mockResolvedValue({ data: baseMealRow });
    mockIngredientCreate.mockResolvedValue({
      data: { id: 'ing-1', mealId: 'meal-1', name: 'x', weightG: 1, calories: 1, protein: 1, carbs: 1, fat: 1, source: 'USDA', sortOrder: 0 },
    });

    await logMeal({
      name: 'Lunch',
      category: 'meal',
      ingredients: [
        ingredient({ calories: 330, protein: 62, carbs: 0, fat: 7, weightG: 200 }),
        ingredient({ name: 'Rice', calories: 170, protein: 4, carbs: 37, fat: 0, weightG: 100 }),
      ],
    });

    expect(mockMealCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        totalCalories: 500,
        totalProtein: 66,
        totalCarbs: 37,
        totalFat: 7,
        totalWeightG: 300,
      })
    );
  });

  it('uses explicit totals instead of recomputing from ingredients when provided', async () => {
    mockMealCreate.mockResolvedValue({ data: baseMealRow });
    mockIngredientCreate.mockResolvedValue({
      data: { id: 'ing-1', mealId: 'meal-1', name: 'x', weightG: 1, calories: 1, protein: 1, carbs: 1, fat: 1, source: 'USDA', sortOrder: 0 },
    });

    await logMeal({
      name: 'Recipe portion',
      category: 'meal',
      ingredients: [ingredient()],
      totals: { totalCalories: 999, totalProtein: 11, totalCarbs: 22, totalFat: 33, totalWeightG: 444 },
    });

    expect(mockMealCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        totalCalories: 999,
        totalProtein: 11,
        totalCarbs: 22,
        totalFat: 33,
        totalWeightG: 444,
      })
    );
  });

  it('sets eatenAt/localDate from input.eatenAt when provided, else defaults to now', async () => {
    mockMealCreate.mockResolvedValue({ data: baseMealRow });
    mockIngredientCreate.mockResolvedValue({ data: { id: 'i', mealId: 'meal-1', name: 'x', weightG: 1, calories: 1, protein: 1, carbs: 1, fat: 1, source: 'USDA', sortOrder: 0 } });

    const eatenAt = new Date(2026, 0, 15, 10, 30, 0); // local Jan 15 2026, 10:30am

    await logMeal({ name: 'Lunch', category: 'meal', eatenAt, ingredients: [ingredient()] });

    expect(mockMealCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        eatenAt: eatenAt.toISOString(),
        localDate: '2026-01-15',
      })
    );
  });

  it('assigns sortOrder by array index for each ingredient', async () => {
    mockMealCreate.mockResolvedValue({ data: baseMealRow });
    mockIngredientCreate.mockResolvedValue({ data: { id: 'i', mealId: 'meal-1', name: 'x', weightG: 1, calories: 1, protein: 1, carbs: 1, fat: 1, source: 'USDA', sortOrder: 0 } });

    await logMeal({
      name: 'Meal',
      category: 'meal',
      ingredients: [ingredient({ name: 'a' }), ingredient({ name: 'b' }), ingredient({ name: 'c' })],
    });

    expect(mockIngredientCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: 'a', sortOrder: 0 }));
    expect(mockIngredientCreate).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: 'b', sortOrder: 1 }));
    expect(mockIngredientCreate).toHaveBeenNthCalledWith(3, expect.objectContaining({ name: 'c', sortOrder: 2 }));
  });

  it('creates all MealIngredient rows in parallel (Promise.all), not one at a time', async () => {
    mockMealCreate.mockResolvedValue({ data: baseMealRow });

    const resolvers: Array<(value: unknown) => void> = [];
    mockIngredientCreate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );

    const resultPromise = logMeal({
      name: 'Meal',
      category: 'meal',
      ingredients: [ingredient({ name: 'a' }), ingredient({ name: 'b' }), ingredient({ name: 'c' })],
    });

    // Give the Meal.create microtask a chance to resolve and the ingredient
    // creates to be issued, WITHOUT resolving any of them yet.
    await flushPromises();

    expect(mockIngredientCreate).toHaveBeenCalledTimes(3);

    resolvers.forEach((resolve, i) =>
      resolve({ data: { id: `ing-${i}`, mealId: 'meal-1', name: 'x', weightG: 1, calories: 1, protein: 1, carbs: 1, fat: 1, source: 'USDA', sortOrder: i } })
    );

    await resultPromise;
  });

  it('throws when Meal.create returns no data', async () => {
    mockMealCreate.mockResolvedValue({ data: null });

    await expect(
      logMeal({ name: 'Meal', category: 'meal', ingredients: [ingredient()] })
    ).rejects.toThrow('Failed to create meal');

    expect(mockIngredientCreate).not.toHaveBeenCalled();
  });

  it('verifies the meal, triggers onMealLogged, and returns the optimistic meal', async () => {
    mockMealCreate.mockResolvedValue({ data: baseMealRow });
    mockIngredientCreate.mockResolvedValue({
      data: { id: 'ing-1', mealId: 'meal-1', name: 'Chicken breast', weightG: 200, calories: 330, protein: 62, carbs: 0, fat: 7, source: 'USDA', sortOrder: 0 },
    });

    const result = await logMeal({
      name: 'Lunch',
      category: 'meal',
      ingredients: [ingredient()],
    });

    expect(verifyMealById).toHaveBeenCalledWith(expect.anything(), 'meal-1', expect.objectContaining({ traceId: undefined }));
    expect(onMealLogged).toHaveBeenCalled();
    expect(result.verified).toBe(true);
    expect(result.meal).toEqual(
      expect.objectContaining({
        id: 'meal-1',
        name: 'Lunch',
        ingredients: [expect.objectContaining({ id: 'ing-1', name: 'Chicken breast' })],
      })
    );
  });

  it('omits ingredients whose MealIngredient.create failed from the optimistic meal', async () => {
    mockMealCreate.mockResolvedValue({ data: baseMealRow });
    mockIngredientCreate
      .mockResolvedValueOnce({ data: { id: 'ing-1', mealId: 'meal-1', name: 'a', weightG: 1, calories: 1, protein: 1, carbs: 1, fat: 1, source: 'USDA', sortOrder: 0 } })
      .mockResolvedValueOnce({ data: null, errors: [{ message: 'boom' }] });

    const result = await logMeal({
      name: 'Meal',
      category: 'meal',
      ingredients: [ingredient({ name: 'a' }), ingredient({ name: 'b' })],
    });

    expect(result.meal.ingredients).toHaveLength(1);
    expect(result.meal.ingredients[0].name).toBe('a');
  });
});

// Contract test: pins the event names and field sets logMeal emits via
// logRemote, so a future edit can't silently drop/rename a field or event
// without a test failing. Every tab (search/text/photo/recipe) relies on
// this shape being stable for its own trace correlation.
describe('logMeal trace-event contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAmplifyDataClient as jest.Mock).mockReturnValue({
      models: {
        Meal: { create: mockMealCreate },
        MealIngredient: { create: mockIngredientCreate },
      },
    });
  });

  it('emits MEAL_CREATED, INGREDIENTS_CREATED, and MEAL_LOG_COMPLETE with their documented field sets on success', async () => {
    mockMealCreate.mockResolvedValue({ data: baseMealRow });
    mockIngredientCreate.mockResolvedValue({
      data: { id: 'ing-1', mealId: 'meal-1', name: 'Chicken breast', weightG: 200, calories: 330, protein: 62, carbs: 0, fat: 7, source: 'USDA', sortOrder: 0 },
    });

    const eatenAt = new Date(2026, 0, 15, 12, 0, 0);

    await logMeal(
      { name: 'Lunch', category: 'meal', eatenAt, ingredients: [ingredient()] },
      { traceId: 'trace-1', tab: 'text' }
    );

    expect(logRemote.info).toHaveBeenCalledWith('MEAL_CREATED', {
      traceId: 'trace-1',
      tab: 'text',
      mealId: 'meal-1',
      eatenAt: eatenAt.toISOString(),
      localDate: '2026-01-15',
    });

    expect(logRemote.info).toHaveBeenCalledWith('INGREDIENTS_CREATED', {
      traceId: 'trace-1',
      tab: 'text',
      mealId: 'meal-1',
      count: 1,
      expected: 1,
    });

    expect(logRemote.info).toHaveBeenCalledWith('MEAL_LOG_COMPLETE', {
      traceId: 'trace-1',
      tab: 'text',
      mealId: 'meal-1',
      verified: true,
      attempts: 1,
    });
  });

  it('emits MEAL_LOG_ERROR with {traceId, tab, error} when the Amplify client is not ready', async () => {
    (getAmplifyDataClient as jest.Mock).mockReturnValue(null);

    await expect(
      logMeal({ name: 'Snack', category: 'snack', ingredients: [ingredient()] }, { traceId: 'trace-2', tab: 'photo' })
    ).rejects.toThrow(AmplifyClientNotReadyError);

    expect(logRemote.error).toHaveBeenCalledWith('MEAL_LOG_ERROR', {
      traceId: 'trace-2',
      tab: 'photo',
      error: 'Amplify client not ready',
    });
  });

  it('emits MEAL_CREATE_FAILED with {traceId, tab, error} when Meal.create returns no data', async () => {
    mockMealCreate.mockResolvedValue({ data: null });

    await expect(
      logMeal({ name: 'Meal', category: 'meal', ingredients: [ingredient()] }, { traceId: 'trace-3', tab: 'recipe' })
    ).rejects.toThrow('Failed to create meal');

    expect(logRemote.error).toHaveBeenCalledWith('MEAL_CREATE_FAILED', {
      traceId: 'trace-3',
      tab: 'recipe',
      error: 'Meal.create returned null',
    });
  });
});
