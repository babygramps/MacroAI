'use server';

import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import type { Schema } from '@/amplify/data/resource';
import { cookies } from 'next/headers';
import type { RecentFood, RecentFoodsResponse } from '@/lib/types';
import type { MealCategory, IngredientEntry } from '@/lib/types';

// Constants for scoring algorithm
const RECENCY_WEIGHT = 0.4;
const FREQUENCY_WEIGHT = 0.6;
const MAX_DAYS_LOOKBACK = 30;
const MAX_RESULTS_PER_CATEGORY = 10;

// Get server client for DynamoDB operations
async function getServerClient() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const outputs = require('@/amplify_outputs.json');
    return generateServerClientUsingCookies<Schema>({
      config: outputs,
      cookies: cookies,
    });
  } catch {
    return null;
  }
}

/**
 * Calculate a combined score based on recency and frequency.
 * Recency: max(0, 1 - (daysSinceLogged / 30))
 * Frequency: logCount / maxLogCount (normalized to 0-1)
 * Combined: 0.4 * recency + 0.6 * frequency
 */
function calculateScore(
  lastLoggedAt: Date,
  logCount: number,
  maxLogCount: number,
  now: Date
): number {
  const daysSinceLogged = (now.getTime() - lastLoggedAt.getTime()) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 1 - daysSinceLogged / MAX_DAYS_LOOKBACK);
  const frequencyScore = maxLogCount > 0 ? logCount / maxLogCount : 0;
  return RECENCY_WEIGHT * recencyScore + FREQUENCY_WEIGHT * frequencyScore;
}

// Aggregation structure for building frequency/recency data
interface FoodAggregation {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: number;
  source: string;
  logCount: number;
  lastLoggedAt: Date;
  type: 'meal' | 'ingredient';
  category?: MealCategory;
  ingredients?: IngredientEntry[];
  servingDescription?: string | null;
  servingSizeGrams?: number | null;
}

/**
 * Fetches recent foods (meals and ingredients) from the last 30 days,
 * scores them by recency + frequency, and returns the top 10 of each category.
 * 
 * Follows Vercel React Best Practices:
 * - async-parallel: Parallel DB queries with Promise.all()
 * - js-set-map-lookups: Map for O(1) deduplication
 * - js-tosorted-immutable: .toSorted() for immutable sorting
 * - js-combine-iterations: Single loop for aggregation
 */
export async function getRecentFoods(): Promise<RecentFoodsResponse> {
  const client = await getServerClient();
  
  if (!client) {
    return { recentMeals: [], recentIngredients: [] };
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - MAX_DAYS_LOOKBACK * 24 * 60 * 60 * 1000);
  const startIso = thirtyDaysAgo.toISOString();
  const endIso = now.toISOString();

  try {
    // Fetch meals and ingredients in parallel (async-parallel rule)
    const [mealsResult, ingredientsResult] = await Promise.all([
      client.models.Meal.list({
        filter: {
          eatenAt: {
            between: [startIso, endIso],
          },
        },
      }),
      client.models.MealIngredient.list({
        filter: {
          eatenAt: {
            between: [startIso, endIso],
          },
        },
      }),
    ]);

    const meals = mealsResult.data || [];
    const ingredients = ingredientsResult.data || [];

    // Use Map for O(1) deduplication (js-set-map-lookups rule)
    const mealAggregations = new Map<string, FoodAggregation>();
    const ingredientAggregations = new Map<string, FoodAggregation>();

    // Single loop aggregation for meals (js-combine-iterations rule)
    for (const meal of meals) {
      const normalizedName = meal.name.trim().toLowerCase();
      const existing = mealAggregations.get(normalizedName);
      const mealDate = new Date(meal.eatenAt);

      if (existing) {
        existing.logCount += 1;
        if (mealDate > existing.lastLoggedAt) {
          existing.lastLoggedAt = mealDate;
          // Update with most recent meal's data
          existing.id = meal.id;
          existing.calories = meal.totalCalories;
          existing.protein = meal.totalProtein;
          existing.carbs = meal.totalCarbs;
          existing.fat = meal.totalFat;
          existing.servingSize = meal.totalWeightG;
          existing.category = meal.category as MealCategory;
        }
      } else {
        mealAggregations.set(normalizedName, {
          id: meal.id,
          name: meal.name,
          calories: meal.totalCalories,
          protein: meal.totalProtein,
          carbs: meal.totalCarbs,
          fat: meal.totalFat,
          servingSize: meal.totalWeightG,
          source: 'MEAL',
          logCount: 1,
          lastLoggedAt: mealDate,
          type: 'meal',
          category: meal.category as MealCategory,
          ingredients: [], // Will be populated below
        });
      }
    }

    // Fetch ingredients for the most recent version of each unique meal
    // Group ingredients by mealId first
    const ingredientsByMealId = new Map<string, IngredientEntry[]>();
    for (const ing of ingredients) {
      const entry: IngredientEntry = {
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
      
      const existing = ingredientsByMealId.get(ing.mealId);
      if (existing) {
        existing.push(entry);
      } else {
        ingredientsByMealId.set(ing.mealId, [entry]);
      }
    }

    // Attach ingredients to meal aggregations
    for (const agg of mealAggregations.values()) {
      const mealIngredients = ingredientsByMealId.get(agg.id);
      if (mealIngredients) {
        agg.ingredients = mealIngredients.toSorted((a, b) => a.sortOrder - b.sortOrder);
      }
    }

    // Single loop aggregation for ingredients (js-combine-iterations rule)
    for (const ing of ingredients) {
      const normalizedName = ing.name.trim().toLowerCase();
      const existing = ingredientAggregations.get(normalizedName);
      const ingDate = ing.eatenAt ? new Date(ing.eatenAt) : now;

      if (existing) {
        existing.logCount += 1;
        if (ingDate > existing.lastLoggedAt) {
          existing.lastLoggedAt = ingDate;
          // Update with most recent ingredient's data
          existing.id = ing.id;
          existing.calories = ing.calories;
          existing.protein = ing.protein;
          existing.carbs = ing.carbs;
          existing.fat = ing.fat;
          existing.servingSize = ing.weightG;
          existing.source = ing.source;
          existing.servingDescription = ing.servingDescription ?? null;
          existing.servingSizeGrams = ing.servingSizeGrams ?? null;
        }
      } else {
        ingredientAggregations.set(normalizedName, {
          id: ing.id,
          name: ing.name,
          calories: ing.calories,
          protein: ing.protein,
          carbs: ing.carbs,
          fat: ing.fat,
          servingSize: ing.weightG,
          source: ing.source,
          logCount: 1,
          lastLoggedAt: ingDate,
          type: 'ingredient',
          servingDescription: ing.servingDescription ?? null,
          servingSizeGrams: ing.servingSizeGrams ?? null,
        });
      }
    }

    // Find max log counts for normalization
    let maxMealLogCount = 0;
    let maxIngredientLogCount = 0;

    for (const agg of mealAggregations.values()) {
      if (agg.logCount > maxMealLogCount) {
        maxMealLogCount = agg.logCount;
      }
    }

    for (const agg of ingredientAggregations.values()) {
      if (agg.logCount > maxIngredientLogCount) {
        maxIngredientLogCount = agg.logCount;
      }
    }

    // Convert aggregations to RecentFood with scores, then sort
    // Using .toSorted() for immutability (js-tosorted-immutable rule)
    const scoredMeals = Array.from(mealAggregations.values())
      .map((agg) => ({
        ...agg,
        score: calculateScore(agg.lastLoggedAt, agg.logCount, maxMealLogCount, now),
      }))
      .toSorted((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS_PER_CATEGORY);

    const scoredIngredients = Array.from(ingredientAggregations.values())
      .map((agg) => ({
        ...agg,
        score: calculateScore(agg.lastLoggedAt, agg.logCount, maxIngredientLogCount, now),
      }))
      .toSorted((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS_PER_CATEGORY);

    // Transform to RecentFood format (strip internal score)
    const recentMeals: RecentFood[] = scoredMeals.map((m) => ({
      id: m.id,
      name: m.name,
      calories: m.calories,
      protein: m.protein,
      carbs: m.carbs,
      fat: m.fat,
      servingSize: m.servingSize,
      source: m.source,
      logCount: m.logCount,
      lastLoggedAt: m.lastLoggedAt.toISOString(),
      type: m.type,
      category: m.category,
      ingredients: m.ingredients,
    }));

    const recentIngredients: RecentFood[] = scoredIngredients.map((i) => ({
      id: i.id,
      name: i.name,
      calories: i.calories,
      protein: i.protein,
      carbs: i.carbs,
      fat: i.fat,
      servingSize: i.servingSize,
      source: i.source,
      logCount: i.logCount,
      lastLoggedAt: i.lastLoggedAt.toISOString(),
      type: i.type,
      servingDescription: i.servingDescription,
      servingSizeGrams: i.servingSizeGrams,
    }));

    return { recentMeals, recentIngredients };
  } catch (error) {
    console.error('Error fetching recent foods:', error);
    return { recentMeals: [], recentIngredients: [] };
  }
}
