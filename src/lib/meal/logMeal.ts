import { getAmplifyDataClient } from '@/lib/data/amplifyClient';
import { logRemote } from '@/lib/clientLogger';
import { getLocalDateString } from '@/lib/date';
import { onMealLogged } from '@/lib/metabolicService';
import { enqueueMeal, flushMealQueue } from '@/lib/offline/mealQueue';
import { verifyMealById } from './mealVerification';
import { calculateMealTotals } from './totals';
import type { MealCategory, MealEntry, IngredientEntry } from '@/lib/types';

/**
 * Ingredient as supplied by a caller of logMeal — the shape every tab already
 * builds today, minus the fields logMeal itself assigns (id, mealId, and
 * sortOrder, which is derived from the ingredient's position in the array).
 */
export type LogMealIngredientInput = Omit<IngredientEntry, 'id' | 'mealId' | 'sortOrder'>;

/** Aggregate Meal totals — same shape calculateMealTotals returns. */
export type LogMealTotals = ReturnType<typeof calculateMealTotals>;

export interface LogMealInput {
  name: string;
  category: MealCategory;
  /** When omitted, defaults to `new Date()` at call time. */
  eatenAt?: Date;
  ingredients: LogMealIngredientInput[];
  /**
   * When omitted, defaults to calculateMealTotals(ingredients). Callers
   * whose meal-level totals are computed independently of the per-ingredient
   * values (e.g. a recipe portion scaled as a whole) should pass this
   * explicitly so persisted totals aren't silently replaced by a sum that
   * can differ by rounding.
   */
  totals?: LogMealTotals;
}

export interface LogMealOptions {
  /** Correlates this call's trace events; also passed to verifyMealById. */
  traceId?: string;
  /** Name of the calling tab, attached to logMeal's own trace events. */
  tab?: 'search' | 'text' | 'photo' | 'recipe';
}

export interface LogMealResult {
  verified: boolean;
  meal: MealEntry;
  /** True when the device was offline and the meal was queued for later sync. */
  queued?: boolean;
}

/**
 * Thrown when the Amplify client isn't ready yet (e.g. called before
 * hydration). Callers should catch this to show the same
 * "Amplify is not ready yet" toast the tabs show today.
 */
export class AmplifyClientNotReadyError extends Error {
  constructor() {
    super('Amplify client not ready');
    this.name = 'AmplifyClientNotReadyError';
  }
}

/** Minimal shape of a persisted Meal row, as returned by Meal.create(). */
export interface MealRow {
  id: string;
  name: string;
  category: string;
  eatenAt: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalWeightG: number;
}

/** Minimal shape of a persisted MealIngredient row, as returned by MealIngredient.create(). */
export interface MealIngredientRow {
  id: string;
  mealId: string;
  name: string;
  weightG: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
  servingDescription?: string | null;
  servingSizeGrams?: number | null;
  sortOrder?: number | null;
}

/**
 * Pure mapping from persisted Meal/MealIngredient rows to the optimistic
 * MealEntry handed to a tab's onSuccess callback. No I/O — safe to unit test
 * directly with plain object fixtures.
 */
export function buildOptimisticMeal(mealRow: MealRow, ingredientRows: MealIngredientRow[]): MealEntry {
  return {
    id: mealRow.id,
    name: mealRow.name,
    category: mealRow.category as MealCategory,
    eatenAt: mealRow.eatenAt,
    totalCalories: mealRow.totalCalories,
    totalProtein: mealRow.totalProtein,
    totalCarbs: mealRow.totalCarbs,
    totalFat: mealRow.totalFat,
    totalWeightG: mealRow.totalWeightG,
    ingredients: ingredientRows.map((ing) => ({
      id: ing.id,
      mealId: ing.mealId,
      name: ing.name,
      weightG: ing.weightG,
      calories: ing.calories,
      protein: ing.protein,
      carbs: ing.carbs,
      fat: ing.fat,
      source: ing.source,
      servingDescription: ing.servingDescription,
      servingSizeGrams: ing.servingSizeGrams,
      sortOrder: ing.sortOrder ?? 0,
    })),
  };
}

/**
 * Unified meal-logging use case.
 *
 * Generalizes the create-Meal -> create-MealIngredients -> verify ->
 * onMealLogged -> optimistic-MealEntry sequence that used to be hand-written
 * (and quadruplicated) in SearchTab, TextTab, PhotoTab, and RecipeTab.
 *
 * MealIngredient rows are created with Promise.all (in parallel) — the one
 * sanctioned behavior change over the original per-tab code, some of which
 * created ingredients one at a time in a serial loop.
 *
 * When the device is offline, the meal is queued locally instead (returned
 * with queued: true and a `pending` syncStatus) and replayed by
 * flushQueuedMeals() when connectivity returns.
 */
export async function logMeal(input: LogMealInput, opts: LogMealOptions = {}): Promise<LogMealResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const meal = enqueueMeal(input);
    logRemote.info('MEAL_QUEUED_OFFLINE', { traceId: opts.traceId, tab: opts.tab, mealId: meal.id });
    return { verified: false, queued: true, meal };
  }
  return logMealOnline(input, opts);
}

/**
 * Replay offline-queued meals through the normal network path. Stops at the
 * first failure (typically: connectivity dropped again), leaving the rest
 * queued. Exposed for the online-event handler in useDashboardData.
 */
export async function flushQueuedMeals(): Promise<{ sent: number; remaining: number }> {
  return flushMealQueue((input) => logMealOnline(input));
}

async function logMealOnline(input: LogMealInput, opts: LogMealOptions = {}): Promise<LogMealResult> {
  const { traceId, tab } = opts;

  const client = getAmplifyDataClient();
  if (!client) {
    logRemote.error('MEAL_LOG_ERROR', { traceId, tab, error: 'Amplify client not ready' });
    throw new AmplifyClientNotReadyError();
  }

  const now = input.eatenAt ?? new Date();
  const nowISO = now.toISOString();
  const localDate = getLocalDateString(now);
  const totals = input.totals ?? calculateMealTotals(input.ingredients);

  const { data: meal } = await client.models.Meal.create({
    name: input.name,
    category: input.category,
    eatenAt: nowISO,
    localDate, // Store user's local date for unambiguous day queries
    totalCalories: totals.totalCalories,
    totalProtein: totals.totalProtein,
    totalCarbs: totals.totalCarbs,
    totalFat: totals.totalFat,
    totalWeightG: totals.totalWeightG,
  });

  if (!meal) {
    logRemote.error('MEAL_CREATE_FAILED', { traceId, tab, error: 'Meal.create returned null' });
    throw new Error('Failed to create meal');
  }

  logRemote.info('MEAL_CREATED', { traceId, tab, mealId: meal.id, eatenAt: nowISO, localDate });

  const ingredientResults = await Promise.all(
    input.ingredients.map((ingredient, index) =>
      client.models.MealIngredient.create({
        mealId: meal.id,
        name: ingredient.name,
        eatenAt: nowISO,
        localDate, // Store user's local date for unambiguous day queries
        weightG: ingredient.weightG,
        calories: ingredient.calories,
        protein: ingredient.protein,
        carbs: ingredient.carbs,
        fat: ingredient.fat,
        source: ingredient.source,
        // Note: servingSizeGrams must be an integer (schema constraint)
        servingDescription: ingredient.servingDescription || undefined,
        servingSizeGrams: ingredient.servingSizeGrams ? Math.round(ingredient.servingSizeGrams) : undefined,
        sortOrder: index,
      })
    )
  );

  const createdIngredients = ingredientResults
    .map((result) => result.data)
    .filter((row): row is NonNullable<typeof row> => row != null);

  logRemote.info('INGREDIENTS_CREATED', {
    traceId,
    tab,
    mealId: meal.id,
    count: createdIngredients.length,
    expected: input.ingredients.length,
  });

  // Verify meal is readable using strongly consistent get
  const { verified, attempts } = await verifyMealById(client, meal.id, { traceId });

  // Trigger metabolic recalculation
  await onMealLogged(now);

  logRemote.info('MEAL_LOG_COMPLETE', { traceId, tab, mealId: meal.id, verified, attempts });

  return { verified, meal: buildOptimisticMeal(meal, createdIngredients) };
}
