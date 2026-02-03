import type { Schema } from '@/amplify/data/resource';
import type { DailySummary, IngredientEntry, MealCategory, MealEntry, UserGoals, WeightLogEntry, RecipeEntry, ScaledRecipePortion } from '@/lib/types';
import { getAmplifyDataClient } from '@/lib/data/amplifyClient';
import { onMealLogged } from '@/lib/metabolicService';
import { getLocalDateString } from '@/lib/date';

export const DEFAULT_GOALS: UserGoals = {
  calorieGoal: 2000,
  proteinGoal: 150,
  carbsGoal: 200,
  fatGoal: 65,
};

interface DashboardData {
  goals: UserGoals;
  summary: DailySummary;
  latestWeight: WeightLogEntry | null;
  needsOnboarding: boolean;
}

function mapLegacyFoodLogsToMeals(legacyLogs: Schema['FoodLog']['type'][]): MealEntry[] {
  return legacyLogs.map((log) => ({
    id: `legacy-${log.id}`,
    name: log.name ?? 'Unknown Food',
    category: 'snack' as MealCategory,
    eatenAt: log.eatenAt ?? new Date().toISOString(),
    totalCalories: log.calories ?? 0,
    totalProtein: log.protein ?? 0,
    totalCarbs: log.carbs ?? 0,
    totalFat: log.fat ?? 0,
    totalWeightG: log.weightG ?? 0,
    ingredients: [
      {
        id: log.id,
        mealId: `legacy-${log.id}`,
        name: log.name ?? 'Unknown Food',
        weightG: log.weightG ?? 0,
        calories: log.calories ?? 0,
        protein: log.protein ?? 0,
        carbs: log.carbs ?? 0,
        fat: log.fat ?? 0,
        source: log.source ?? 'USDA',
        servingDescription: log.servingDescription ?? null,
        servingSizeGrams: log.servingSizeGrams ?? null,
        sortOrder: 0,
      },
    ],
  }));
}

export function calculateDailyTotals(meals: MealEntry[]): DailySummary {
  const totals = meals.reduce(
    (acc, meal) => ({
      totalCalories: acc.totalCalories + meal.totalCalories,
      totalProtein: acc.totalProtein + meal.totalProtein,
      totalCarbs: acc.totalCarbs + meal.totalCarbs,
      totalFat: acc.totalFat + meal.totalFat,
    }),
    { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0 }
  );

  return { ...totals, meals, entries: [] };
}

function mapMealIngredient(ing: Schema['MealIngredient']['type']): IngredientEntry {
  return {
    id: ing.id,
    mealId: ing.mealId,
    name: ing.name,
    weightG: ing.weightG,
    calories: ing.calories,
    protein: ing.protein,
    carbs: ing.carbs,
    fat: ing.fat,
    source: ing.source,
    servingDescription: ing.servingDescription ?? null,
    servingSizeGrams: ing.servingSizeGrams ?? null,
    sortOrder: ing.sortOrder ?? 0,
  };
}

function sortIngredientsByOrder(ingredients: IngredientEntry[]): IngredientEntry[] {
  return ingredients.sort((a, b) => a.sortOrder - b.sortOrder);
}

async function fetchIngredientsByMealForDay(
  client: ReturnType<typeof getAmplifyDataClient>,
  meals: Schema['Meal']['type'][],
  startIso: string,
  endIso: string
): Promise<Map<string, IngredientEntry[]>> {
  const ingredientsByMeal = new Map<string, IngredientEntry[]>();
  if (!client || meals.length === 0) {
    return ingredientsByMeal;
  }

  // Initialize map with empty arrays for all meals
  const mealIds = new Set(meals.map((m) => m.id));
  for (const mealId of mealIds) {
    ingredientsByMeal.set(mealId, []);
  }

  // Try batch query first using eatenAt index (most efficient for full day views)
  const { data: ingredientsData } = await client.models.MealIngredient.list({
    filter: {
      eatenAt: {
        between: [startIso, endIso],
      },
    },
  });

  if (ingredientsData && ingredientsData.length > 0) {
    for (const ing of ingredientsData) {
      const mapped = mapMealIngredient(ing);
      // Only add if this ingredient belongs to one of our meals
      if (mealIds.has(mapped.mealId)) {
        const existing = ingredientsByMeal.get(mapped.mealId);
        if (existing) {
          existing.push(mapped);
        }
      }
    }
  }

  // Find meals that still have no ingredients - they may have ingredients
  // without eatenAt set (legacy data) or with different timestamps
  const mealsWithoutIngredients = meals.filter(
    (meal) => (ingredientsByMeal.get(meal.id) || []).length === 0
  );

  // Fetch missing ingredients per-meal using mealId index
  if (mealsWithoutIngredients.length > 0) {
    const missingIngredientLists = await Promise.all(
      mealsWithoutIngredients.map(async (meal) => {
        const { data: mealIngredients } = await client.models.MealIngredient.listMealIngredientByMealId({
          mealId: meal.id,
        });
        return {
          mealId: meal.id,
          ingredients: (mealIngredients || []).map(mapMealIngredient),
        };
      })
    );

    for (const item of missingIngredientLists) {
      ingredientsByMeal.set(item.mealId, item.ingredients);
    }
  }

  // Sort all ingredient lists by sortOrder
  for (const [mealId, ingredients] of ingredientsByMeal.entries()) {
    ingredientsByMeal.set(mealId, sortIngredientsByOrder(ingredients));
  }

  return ingredientsByMeal;
}

export async function fetchDashboardData(date: Date): Promise<DashboardData> {
  const client = getAmplifyDataClient();
  if (!client) {
    return {
      goals: DEFAULT_GOALS,
      summary: {
        totalCalories: 0,
        totalProtein: 0,
        totalCarbs: 0,
        totalFat: 0,
        meals: [],
        entries: [],
      },
      latestWeight: null,
      needsOnboarding: false,
    };
  }
  const selectedDateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0).toISOString();
  const selectedDateEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59).toISOString();

  const [profilesResult, weightResult] = await Promise.all([
    client.models.UserProfile.list(),
    client.models.WeightLog.list({
      filter: {
        recordedAt: {
          between: [selectedDateStart, selectedDateEnd],
        },
      },
    }),
  ]);

  const selectedDateWeight = weightResult.data && weightResult.data.length > 0
    ? {
      id: weightResult.data[0].id,
      weightKg: weightResult.data[0].weightKg,
      recordedAt: weightResult.data[0].recordedAt,
      note: weightResult.data[0].note ?? undefined,
    }
    : null;

  const { data: profiles } = profilesResult;
  let needsOnboarding = false;
  let goals: UserGoals = DEFAULT_GOALS;

  if (profiles && profiles.length > 0) {
    const profile = profiles[0];
    const unitSystem = (profile.preferredUnitSystem as 'metric' | 'imperial') ??
      (profile.preferredWeightUnit === 'lbs' ? 'imperial' : 'metric');
    const weightUnit = unitSystem === 'imperial' ? 'lbs' : 'kg';

    goals = {
      calorieGoal: profile.calorieGoal ?? DEFAULT_GOALS.calorieGoal,
      proteinGoal: profile.proteinGoal ?? DEFAULT_GOALS.proteinGoal,
      carbsGoal: profile.carbsGoal ?? DEFAULT_GOALS.carbsGoal,
      fatGoal: profile.fatGoal ?? DEFAULT_GOALS.fatGoal,
      preferredWeightUnit: weightUnit,
      targetWeightKg: profile.targetWeightKg ?? undefined,
    };
  } else {
    needsOnboarding = true;
  }

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  // Use localDate (YYYY-MM-DD) for unambiguous day queries
  // This solves cross-device timezone issues - meals always appear on the day they were logged
  const targetLocalDate = getLocalDateString(date);

  // For legacy meals without localDate, we still need the widened time-based query
  const QUERY_PADDING_MS = 14 * 60 * 60 * 1000; // 14 hours
  const queryStart = new Date(startOfDay.getTime() - QUERY_PADDING_MS);
  const queryEnd = new Date(endOfDay.getTime() + QUERY_PADDING_MS);
  const startISO = queryStart.toISOString();
  const endISO = queryEnd.toISOString();

  // Query meals by localDate (new meals) AND by eatenAt range (for legacy meals without localDate)
  const [mealsWithLocalDateResult, mealsWithoutLocalDateResult, legacyLogsResult] = await Promise.all([
    // Primary query: meals with localDate set (new meals)
    client.models.Meal.listMealByLocalDate({
      localDate: targetLocalDate,
    }),
    // Fallback query: meals without localDate (legacy) using widened time range
    client.models.Meal.list({
      filter: {
        and: [
          { localDate: { attributeExists: false } },
          { eatenAt: { between: [startISO, endISO] } },
        ],
      },
    }),
    // Legacy FoodLog entries
    client.models.FoodLog.list({
      filter: {
        eatenAt: {
          between: [startISO, endISO],
        },
      },
    }),
  ]);

  const mealsWithLocalDate = mealsWithLocalDateResult.data || [];
  const mealsWithoutLocalDate = mealsWithoutLocalDateResult.data || [];

  // Debug: log query results
  if (typeof window !== 'undefined') {
    const { logRemote } = await import('@/lib/clientLogger');
    logRemote.info('MEAL_QUERY_DEBUG', {
      targetLocalDate,
      queryStart: startISO,
      queryEnd: endISO,
      localOffsetMinutes: new Date().getTimezoneOffset(),
      mealsWithLocalDateCount: mealsWithLocalDate.length,
      mealsWithoutLocalDateCount: mealsWithoutLocalDate.length,
      mealsWithLocalDateIds: mealsWithLocalDate.map(m => m.id),
    });
  }
  const legacyLogs = legacyLogsResult.data || [];

  // Filter legacy meals (without localDate) to the selected local day
  const inDayLegacyMeals = mealsWithoutLocalDate.filter((meal) => {
    const eatenAtMs = new Date(meal.eatenAt).getTime();
    return eatenAtMs >= startOfDay.getTime() && eatenAtMs < endOfDay.getTime();
  });
  const inDayLegacyLogs = legacyLogs.filter((log) => {
    const eatenAtMs = new Date(log.eatenAt ?? '').getTime();
    return eatenAtMs >= startOfDay.getTime() && eatenAtMs < endOfDay.getTime();
  });

  // Combine meals with localDate and filtered legacy meals
  const inDayMeals = [...mealsWithLocalDate, ...inDayLegacyMeals];

  if (typeof window !== 'undefined') {
    const { logRemote } = await import('@/lib/clientLogger');
    logRemote.info('MEAL_QUERY_FILTERED', {
      targetLocalDate,
      dayStart: startOfDay.toISOString(),
      dayEnd: endOfDay.toISOString(),
      inDayMealsCount: inDayMeals.length,
      inDayLegacyCount: inDayLegacyLogs.length,
      mealsWithLocalDateCount: mealsWithLocalDate.length,
      inDayLegacyMealsCount: inDayLegacyMeals.length,
    });
  }

  const ingredientsByMeal = await fetchIngredientsByMealForDay(
    client,
    inDayMeals,
    startOfDay.toISOString(),
    endOfDay.toISOString()
  );

  const mealsWithIngredients = inDayMeals.map((meal) => ({
    id: meal.id,
    name: meal.name,
    category: meal.category as MealCategory,
    eatenAt: meal.eatenAt,
    totalCalories: meal.totalCalories,
    totalProtein: meal.totalProtein,
    totalCarbs: meal.totalCarbs,
    totalFat: meal.totalFat,
    totalWeightG: meal.totalWeightG,
    ingredients: ingredientsByMeal.get(meal.id) ?? [],
  }));
  const legacyMeals = mapLegacyFoodLogsToMeals(inDayLegacyLogs);

  const allMeals = [...mealsWithIngredients, ...legacyMeals];
  allMeals.sort((a, b) => new Date(b.eatenAt).getTime() - new Date(a.eatenAt).getTime());

  return {
    goals,
    summary: calculateDailyTotals(allMeals),
    latestWeight: selectedDateWeight,
    needsOnboarding,
  };
}

export async function updateMeal(updatedMeal: MealEntry): Promise<void> {
  const client = getAmplifyDataClient();
  if (!client) return;
  await client.models.Meal.update({
    id: updatedMeal.id,
    name: updatedMeal.name,
    category: updatedMeal.category,
    totalCalories: updatedMeal.totalCalories,
    totalProtein: updatedMeal.totalProtein,
    totalCarbs: updatedMeal.totalCarbs,
    totalFat: updatedMeal.totalFat,
    totalWeightG: updatedMeal.totalWeightG,
  });

  const { data: existingIngredients } = await client.models.MealIngredient.listMealIngredientByMealId({
    mealId: updatedMeal.id,
  });

  const existingIds = new Set((existingIngredients || []).map((i) => i.id));
  const updatedIds = new Set(updatedMeal.ingredients.filter((i) => !i.id.startsWith('temp-')).map((i) => i.id));

  for (const existing of existingIngredients || []) {
    if (!updatedIds.has(existing.id)) {
      await client.models.MealIngredient.delete({ id: existing.id });
    }
  }

  for (let i = 0; i < updatedMeal.ingredients.length; i++) {
    const ingredient = updatedMeal.ingredients[i];

    if (ingredient.id.startsWith('temp-')) {
      // Note: servingSizeGrams must be an integer (schema constraint)
      const servingSizeGramsInt = ingredient.servingSizeGrams
        ? Math.round(ingredient.servingSizeGrams)
        : undefined;

      await client.models.MealIngredient.create({
        mealId: updatedMeal.id,
        name: ingredient.name,
        eatenAt: updatedMeal.eatenAt,
        weightG: ingredient.weightG,
        calories: ingredient.calories,
        protein: ingredient.protein,
        carbs: ingredient.carbs,
        fat: ingredient.fat,
        source: ingredient.source,
        servingDescription: ingredient.servingDescription ?? undefined,
        servingSizeGrams: servingSizeGramsInt,
        sortOrder: i,
      });
    } else if (existingIds.has(ingredient.id)) {
      await client.models.MealIngredient.update({
        id: ingredient.id,
        name: ingredient.name,
        weightG: ingredient.weightG,
        calories: ingredient.calories,
        protein: ingredient.protein,
        carbs: ingredient.carbs,
        fat: ingredient.fat,
        sortOrder: i,
      });
    }
  }

  // Trigger metabolic recalculation for the meal's date
  await onMealLogged(updatedMeal.eatenAt);
}

export async function deleteMealEntry(mealId: string): Promise<void> {
  const client = getAmplifyDataClient();
  if (!client) return;

  // For legacy food logs, we need to get the date first for metabolic recalculation
  if (mealId.startsWith('legacy-')) {
    const realId = mealId.replace('legacy-', '');
    // Get the food log first to know its date
    const { data: foodLog } = await client.models.FoodLog.get({ id: realId });
    const eatenAt = foodLog?.eatenAt;

    await client.models.FoodLog.delete({ id: realId });

    // Trigger metabolic recalculation
    if (eatenAt) {
      await onMealLogged(eatenAt);
    }
    return;
  }

  // Get the meal first to know its date for metabolic recalculation
  const { data: meal } = await client.models.Meal.get({ id: mealId });
  const eatenAt = meal?.eatenAt;

  const { data: ingredients } = await client.models.MealIngredient.listMealIngredientByMealId({
    mealId,
  });

  for (const ingredient of ingredients || []) {
    await client.models.MealIngredient.delete({ id: ingredient.id });
  }

  await client.models.Meal.delete({ id: mealId });

  // Trigger metabolic recalculation for the meal's date
  if (eatenAt) {
    await onMealLogged(eatenAt);
  }
}

/**
 * Duplicate a meal entry (creates a new copy with current timestamp)
 */
export async function duplicateMealEntry(mealId: string): Promise<void> {
  const client = getAmplifyDataClient();
  if (!client) return;

  const now = new Date();
  const nowISO = now.toISOString();
  const localDate = getLocalDateString(now);

  // Handle legacy food logs
  if (mealId.startsWith('legacy-')) {
    const realId = mealId.replace('legacy-', '');
    const { data: foodLog } = await client.models.FoodLog.get({ id: realId });

    if (!foodLog) {
      throw new Error('Food log not found');
    }

    await client.models.FoodLog.create({
      name: foodLog.name,
      weightG: foodLog.weightG,
      calories: foodLog.calories,
      protein: foodLog.protein,
      carbs: foodLog.carbs,
      fat: foodLog.fat,
      source: foodLog.source,
      eatenAt: nowISO,
      servingDescription: foodLog.servingDescription ?? undefined,
      servingSizeGrams: foodLog.servingSizeGrams ?? undefined,
    });

    await onMealLogged(nowISO);
    return;
  }

  // Get the meal and its ingredients
  const { data: meal } = await client.models.Meal.get({ id: mealId });

  if (!meal) {
    throw new Error('Meal not found');
  }

  const { data: ingredients } = await client.models.MealIngredient.listMealIngredientByMealId({
    mealId,
  });

  // Create a new meal with the same data but current timestamp
  const { data: newMeal } = await client.models.Meal.create({
    name: meal.name,
    category: meal.category,
    eatenAt: nowISO,
    localDate, // Store user's local date for unambiguous day queries
    totalCalories: meal.totalCalories,
    totalProtein: meal.totalProtein,
    totalCarbs: meal.totalCarbs,
    totalFat: meal.totalFat,
    totalWeightG: meal.totalWeightG,
  });

  if (!newMeal) {
    throw new Error('Failed to duplicate meal');
  }

  // Duplicate all ingredients
  if (ingredients && ingredients.length > 0) {
    await Promise.all(
      ingredients.map((ing) => {
        // Note: servingSizeGrams must be an integer (schema constraint)
        const servingSizeGramsInt = ing.servingSizeGrams
          ? Math.round(ing.servingSizeGrams)
          : undefined;

        return client.models.MealIngredient.create({
          mealId: newMeal.id,
          name: ing.name,
          eatenAt: nowISO,
          localDate, // Store user's local date for unambiguous day queries
          weightG: ing.weightG,
          calories: ing.calories,
          protein: ing.protein,
          carbs: ing.carbs,
          fat: ing.fat,
          source: ing.source,
          servingDescription: ing.servingDescription ?? undefined,
          servingSizeGrams: servingSizeGramsInt,
          sortOrder: ing.sortOrder ?? 0,
        });
      })
    );
  }

  // Trigger metabolic recalculation
  await onMealLogged(nowISO);
}

/**
 * Scale recipe nutrition to a specific portion
 */
export function scaleRecipePortion(
  recipe: RecipeEntry,
  portionAmount: number,
  portionMode: 'servings' | 'grams'
): ScaledRecipePortion {
  let portionWeightG: number;

  if (portionMode === 'servings') {
    const servingSizeG = recipe.servingSizeG || Math.round(recipe.totalYieldG / recipe.totalServings);
    portionWeightG = portionAmount * servingSizeG;
  } else {
    portionWeightG = portionAmount;
  }

  const scaleFactor = portionWeightG / recipe.totalYieldG;

  return {
    weightG: Math.round(portionWeightG),
    calories: Math.round(recipe.totalCalories * scaleFactor),
    protein: Math.round(recipe.totalProtein * scaleFactor * 10) / 10,
    carbs: Math.round(recipe.totalCarbs * scaleFactor * 10) / 10,
    fat: Math.round(recipe.totalFat * scaleFactor * 10) / 10,
    scaleFactor,
  };
}

/**
 * Log a portion of a recipe as a meal with scaled ingredients
 */
export async function logRecipePortion(
  recipe: RecipeEntry,
  portionAmount: number,
  portionMode: 'servings' | 'grams',
  category: MealCategory,
  mealName: string
): Promise<void> {
  const client = getAmplifyDataClient();
  if (!client) return;

  const scaled = scaleRecipePortion(recipe, portionAmount, portionMode);
  const now = new Date();
  const nowISO = now.toISOString();
  const localDate = getLocalDateString(now);

  // Create the meal
  const { data: meal } = await client.models.Meal.create({
    name: mealName || recipe.name,
    category,
    eatenAt: nowISO,
    localDate, // Store user's local date for unambiguous day queries
    totalCalories: scaled.calories,
    totalProtein: scaled.protein,
    totalCarbs: scaled.carbs,
    totalFat: scaled.fat,
    totalWeightG: scaled.weightG,
  });

  if (!meal) {
    throw new Error('Failed to create meal from recipe');
  }

  // Create scaled ingredients
  await Promise.all(
    recipe.ingredients.map((ing, index) =>
      client.models.MealIngredient.create({
        mealId: meal.id,
        name: ing.name,
        eatenAt: nowISO,
        localDate, // Store user's local date for unambiguous day queries
        weightG: Math.round(ing.weightG * scaled.scaleFactor),
        calories: Math.round(ing.calories * scaled.scaleFactor),
        protein: Math.round(ing.protein * scaled.scaleFactor * 10) / 10,
        carbs: Math.round(ing.carbs * scaled.scaleFactor * 10) / 10,
        fat: Math.round(ing.fat * scaled.scaleFactor * 10) / 10,
        source: ing.source,
        sortOrder: index,
      })
    )
  );

  // Trigger metabolic recalculation
  await onMealLogged(nowISO);
}
