import type { Schema } from '@/amplify/data/resource';
import type { DailySummary, IngredientEntry, MealCategory, MealEntry, UserGoals, WeightLogEntry } from '@/lib/types';
import { getAmplifyDataClient } from '@/lib/data/amplifyClient';

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

function calculateDailyTotals(meals: MealEntry[]): DailySummary {
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
      const existing = ingredientsByMeal.get(mapped.mealId);
      if (existing) {
        existing.push(mapped);
      } else {
        ingredientsByMeal.set(mapped.mealId, [mapped]);
      }
    }

    for (const [mealId, ingredients] of ingredientsByMeal.entries()) {
      ingredientsByMeal.set(mealId, sortIngredientsByOrder(ingredients));
    }

    return ingredientsByMeal;
  }

  const ingredientLists = await Promise.all(
    meals.map(async (meal) => {
      const { data: mealIngredients } = await client.models.MealIngredient.listMealIngredientByMealId({
        mealId: meal.id,
      });
      return {
        mealId: meal.id,
        ingredients: sortIngredientsByOrder((mealIngredients || []).map(mapMealIngredient)),
      };
    })
  );

  for (const item of ingredientLists) {
    ingredientsByMeal.set(item.mealId, item.ingredients);
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

  const [mealsResult, legacyLogsResult] = await Promise.all([
    client.models.Meal.list({
      filter: {
        eatenAt: {
          between: [startOfDay.toISOString(), endOfDay.toISOString()],
        },
      },
    }),
    client.models.FoodLog.list({
      filter: {
        eatenAt: {
          between: [startOfDay.toISOString(), endOfDay.toISOString()],
        },
      },
    }),
  ]);

  const mealsData = mealsResult.data || [];
  const legacyLogs = legacyLogsResult.data || [];

  const ingredientsByMeal = await fetchIngredientsByMealForDay(
    client,
    mealsData,
    startOfDay.toISOString(),
    endOfDay.toISOString()
  );

  const mealsWithIngredients = mealsData.map((meal) => ({
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
  const legacyMeals = mapLegacyFoodLogsToMeals(legacyLogs);

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
        servingSizeGrams: ingredient.servingSizeGrams ?? undefined,
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
}

export async function deleteMealEntry(mealId: string): Promise<void> {
  const client = getAmplifyDataClient();
  if (!client) return;
  if (mealId.startsWith('legacy-')) {
    const realId = mealId.replace('legacy-', '');
    await client.models.FoodLog.delete({ id: realId });
    return;
  }

  const { data: ingredients } = await client.models.MealIngredient.listMealIngredientByMealId({
    mealId,
  });

  for (const ingredient of ingredients || []) {
    await client.models.MealIngredient.delete({ id: ingredient.id });
  }

  await client.models.Meal.delete({ id: mealId });
}
