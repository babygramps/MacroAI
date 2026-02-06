/**
 * One-time migration script to:
 * 1. Backfill `localDate` on all Meal and MealIngredient records that don't have it
 * 2. Convert all FoodLog entries into Meal + MealIngredient records
 * 3. Delete migrated FoodLog entries
 *
 * Run from browser console: window.runMigration()
 * Safe to run multiple times (idempotent).
 */

import { getAmplifyDataClient } from '@/lib/data/amplifyClient';

function formatDateKeyLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface MigrationResult {
  mealsBackfilled: number;
  ingredientsBackfilled: number;
  foodLogsConverted: number;
  foodLogsDeleted: number;
  errors: string[];
}

async function listAll<T>(
  queryFn: (nextToken?: string | null) => Promise<{ data: T[]; nextToken?: string | null }>
): Promise<T[]> {
  const items: T[] = [];
  let token: string | null | undefined = undefined;
  do {
    const result = await queryFn(token);
    if (result.data) items.push(...result.data);
    token = result.nextToken ?? null;
  } while (token);
  return items;
}

export async function runMigration(): Promise<MigrationResult> {
  const client = getAmplifyDataClient();
  if (!client) {
    throw new Error('Amplify client not available');
  }

  const result: MigrationResult = {
    mealsBackfilled: 0,
    ingredientsBackfilled: 0,
    foodLogsConverted: 0,
    foodLogsDeleted: 0,
    errors: [],
  };

  console.log('[Migration] Starting legacy data migration...');

  // ── Step 1: Backfill localDate on Meals ──
  console.log('[Migration] Step 1: Backfilling localDate on Meals...');
  const allMeals = await listAll((nextToken) =>
    client.models.Meal.list({ nextToken: nextToken ?? undefined })
  );

  console.log(`[Migration] Found ${allMeals.length} total Meal records`);

  for (const meal of allMeals) {
    if (meal.localDate) continue; // Already has localDate
    try {
      const localDate = formatDateKeyLocal(new Date(meal.eatenAt));
      await client.models.Meal.update({
        id: meal.id,
        localDate,
      });
      result.mealsBackfilled++;
    } catch (err) {
      const msg = `Failed to backfill Meal ${meal.id}: ${err}`;
      console.error('[Migration]', msg);
      result.errors.push(msg);
    }
  }
  console.log(`[Migration] Backfilled localDate on ${result.mealsBackfilled} Meals`);

  // ── Step 2: Backfill localDate on MealIngredients ──
  console.log('[Migration] Step 2: Backfilling localDate on MealIngredients...');
  const allIngredients = await listAll((nextToken) =>
    client.models.MealIngredient.list({ nextToken: nextToken ?? undefined })
  );

  console.log(`[Migration] Found ${allIngredients.length} total MealIngredient records`);

  for (const ing of allIngredients) {
    if (ing.localDate) continue; // Already has localDate
    try {
      // Derive localDate from eatenAt if available, otherwise from parent meal
      let localDate: string;
      if (ing.eatenAt) {
        localDate = formatDateKeyLocal(new Date(ing.eatenAt));
      } else {
        // Find parent meal to get the date
        const parentMeal = allMeals.find(m => m.id === ing.mealId);
        if (parentMeal) {
          localDate = parentMeal.localDate ?? formatDateKeyLocal(new Date(parentMeal.eatenAt));
        } else {
          console.warn(`[Migration] Orphan ingredient ${ing.id} - no parent meal ${ing.mealId}`);
          continue;
        }
      }
      await client.models.MealIngredient.update({
        id: ing.id,
        localDate,
        eatenAt: ing.eatenAt ?? undefined, // Ensure eatenAt is set too
      });
      result.ingredientsBackfilled++;
    } catch (err) {
      const msg = `Failed to backfill MealIngredient ${ing.id}: ${err}`;
      console.error('[Migration]', msg);
      result.errors.push(msg);
    }
  }
  console.log(`[Migration] Backfilled localDate on ${result.ingredientsBackfilled} MealIngredients`);

  // ── Step 3: Convert FoodLog entries to Meal + MealIngredient ──
  console.log('[Migration] Step 3: Converting FoodLog entries...');
  const allFoodLogs = await listAll((nextToken) =>
    client.models.FoodLog.list({ nextToken: nextToken ?? undefined })
  );

  console.log(`[Migration] Found ${allFoodLogs.length} FoodLog entries to convert`);

  for (const log of allFoodLogs) {
    try {
      const eatenAt = log.eatenAt ?? new Date().toISOString();
      const localDate = formatDateKeyLocal(new Date(eatenAt));

      // Create Meal record
      const { data: newMeal } = await client.models.Meal.create({
        name: log.name ?? 'Unknown Food',
        category: 'snack', // Legacy items default to snack
        eatenAt,
        localDate,
        totalCalories: log.calories ?? 0,
        totalProtein: log.protein ?? 0,
        totalCarbs: log.carbs ?? 0,
        totalFat: log.fat ?? 0,
        totalWeightG: log.weightG ?? 0,
      });

      if (!newMeal) {
        result.errors.push(`Failed to create Meal for FoodLog ${log.id}`);
        continue;
      }

      // Create MealIngredient record
      await client.models.MealIngredient.create({
        mealId: newMeal.id,
        name: log.name ?? 'Unknown Food',
        eatenAt,
        localDate,
        weightG: log.weightG ?? 0,
        calories: log.calories ?? 0,
        protein: log.protein ?? 0,
        carbs: log.carbs ?? 0,
        fat: log.fat ?? 0,
        source: log.source ?? 'USDA',
        servingDescription: log.servingDescription ?? undefined,
        servingSizeGrams: log.servingSizeGrams ?? undefined,
        sortOrder: 0,
      });

      // Delete the original FoodLog entry
      await client.models.FoodLog.delete({ id: log.id });
      result.foodLogsConverted++;
      result.foodLogsDeleted++;
    } catch (err) {
      const msg = `Failed to convert FoodLog ${log.id}: ${err}`;
      console.error('[Migration]', msg);
      result.errors.push(msg);
    }
  }
  console.log(`[Migration] Converted ${result.foodLogsConverted} FoodLog entries`);

  console.log('[Migration] ✅ Migration complete!', result);
  return result;
}

// Expose to browser console
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).runMigration = runMigration;
}
