/**
 * Metabolic Service
 * 
 * Event-driven TDEE calculation and persistence.
 * This service handles:
 * 1. Aggregating daily nutrition from meals
 * 2. Recalculating TDEE when data changes
 * 3. Persisting DailyLog and ComputedState records
 * 
 * Trigger points:
 * - After meal is logged (create/update/delete)
 * - After weight is logged (create/update/delete)
 * - Manual backfill for existing data
 */

import { getAmplifyDataClient } from '@/lib/data/amplifyClient';
import { formatDateKey } from './statsHelpers';
import { calculateTrendWeights } from './trendEngine';
import { buildComputedState, calculateColdStartTdee } from './expenditureEngine';
import type { DailyLog, UserGoals, WeightLogEntry } from './types';

// ============================================
// Daily Nutrition Aggregation
// ============================================

/**
 * Aggregate all meals for a specific date into DailyLog
 * Creates or updates the DailyLog record
 * 
 * @param date - Date to aggregate (YYYY-MM-DD string or Date object)
 * @returns The updated DailyLog or null if no client
 */
export async function aggregateDailyNutrition(date: string | Date): Promise<DailyLog | null> {
  const client = getAmplifyDataClient();
  if (!client) {
    return null;
  }

  const dateKey = typeof date === 'string' ? date : formatDateKey(date);

  try {
    // Get start and end of day for query
    const startOfDay = new Date(`${dateKey}T00:00:00`);
    const endOfDay = new Date(`${dateKey}T23:59:59.999`);

    // Fetch all meals for this date in parallel with weight and existing DailyLog
    const [mealsResult, weightResult, existingDailyLog] = await Promise.all([
      client.models.Meal.list({
        filter: {
          eatenAt: {
            between: [startOfDay.toISOString(), endOfDay.toISOString()],
          },
        },
      }),
      // Also fetch weight for this date (for completeness in DailyLog)
      client.models.WeightLog.list({
        filter: {
          recordedAt: {
            between: [startOfDay.toISOString(), endOfDay.toISOString()],
          },
        },
      }),
      // Check for existing DailyLog
      client.models.DailyLog.list({
        filter: {
          date: { eq: dateKey },
        },
      }),
    ]);

    const meals = mealsResult.data ?? [];
    const weights = weightResult.data ?? [];
    const existingLogs = existingDailyLog.data ?? [];

    // Sum up all nutrition from meals
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    for (const meal of meals) {
      totalCalories += meal.totalCalories ?? 0;
      totalProtein += meal.totalProtein ?? 0;
      totalCarbs += meal.totalCarbs ?? 0;
      totalFat += meal.totalFat ?? 0;
    }

    // Get scale weight for the day (use first entry if multiple)
    const scaleWeightKg = weights.length > 0 ? weights[0].weightKg : null;

    // Determine log status
    const hasNutritionData = meals.length > 0;
    let logStatus: 'complete' | 'partial' | 'skipped' = 'skipped';
    if (hasNutritionData) {
      logStatus = 'complete';
    }

    // Build the DailyLog object
    const dailyLogData = {
      date: dateKey,
      scaleWeightKg,
      nutritionCalories: hasNutritionData ? Math.round(totalCalories) : null,
      nutritionProteinG: hasNutritionData ? Math.round(totalProtein * 10) / 10 : null,
      nutritionCarbsG: hasNutritionData ? Math.round(totalCarbs * 10) / 10 : null,
      nutritionFatG: hasNutritionData ? Math.round(totalFat * 10) / 10 : null,
      stepCount: null, // Not currently tracked
      logStatus,
    };

    // Create or update DailyLog
    if (existingLogs.length > 0) {
      // Update existing
      const existingId = existingLogs[0].id;
      await client.models.DailyLog.update({
        id: existingId,
        ...dailyLogData,
      });
    } else {
      // Create new
      await client.models.DailyLog.create(dailyLogData);
    }

    return dailyLogData as DailyLog;
  } catch (error) {
    console.error('[metabolicService] Error aggregating daily nutrition:', error);
    return null;
  }
}

// ============================================
// TDEE Recalculation
// ============================================

/**
 * Fetch user goals from the database
 */
async function fetchUserGoals(): Promise<UserGoals | null> {
  const client = getAmplifyDataClient();
  if (!client) return null;

  try {
    const { data: profiles } = await client.models.UserProfile.list();
    if (!profiles || profiles.length === 0) return null;

    const profile = profiles[0];
    return {
      calorieGoal: profile.calorieGoal ?? 2000,
      proteinGoal: profile.proteinGoal ?? 150,
      carbsGoal: profile.carbsGoal ?? 200,
      fatGoal: profile.fatGoal ?? 65,
      targetWeightKg: profile.targetWeightKg ?? undefined,
      preferredWeightUnit: (profile.preferredWeightUnit as 'kg' | 'lbs') ?? 'kg',
      preferredUnitSystem: (profile.preferredUnitSystem as 'metric' | 'imperial') ?? 'metric',
      heightCm: profile.heightCm ?? undefined,
      birthDate: profile.birthDate ?? undefined,
      sex: (profile.sex as 'male' | 'female') ?? undefined,
      initialBodyFatPct: profile.initialBodyFatPct ?? undefined,
      expenditureStrategy: (profile.expenditureStrategy as 'static' | 'dynamic') ?? 'dynamic',
      startDate: profile.startDate ?? undefined,
      athleteStatus: profile.athleteStatus ?? false,
      goalType: (profile.goalType as 'lose' | 'gain' | 'maintain') ?? 'maintain',
      goalRate: profile.goalRate ?? 0.5,
    };
  } catch (error) {
    console.error('[metabolicService] Error fetching user goals:', error);
    return null;
  }
}

/**
 * Fetch weight history for a date range
 */
async function fetchWeightHistory(startDate: Date, endDate: Date): Promise<WeightLogEntry[]> {
  const client = getAmplifyDataClient();
  if (!client) return [];

  try {
    const { data: logs } = await client.models.WeightLog.list({
      filter: {
        recordedAt: {
          between: [startDate.toISOString(), endDate.toISOString()],
        },
      },
    });

    if (!logs) return [];

    const entries: WeightLogEntry[] = logs.map((log) => ({
      id: log.id,
      weightKg: log.weightKg,
      recordedAt: log.recordedAt,
      note: log.note ?? undefined,
    }));

    // Sort by date ascending
    entries.sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
    return entries;
  } catch (error) {
    console.error('[metabolicService] Error fetching weight history:', error);
    return [];
  }
}

/**
 * Fetch DailyLog entries for a date range
 */
async function fetchDailyLogsRange(startDate: Date, endDate: Date): Promise<DailyLog[]> {
  const client = getAmplifyDataClient();
  if (!client) return [];

  const startKey = formatDateKey(startDate);
  const endKey = formatDateKey(endDate);

  try {
    const { data: logs } = await client.models.DailyLog.list({
      filter: {
        date: {
          between: [startKey, endKey],
        },
      },
    });

    if (!logs) return [];

    const result: DailyLog[] = logs.map((log) => ({
      date: log.date,
      scaleWeightKg: log.scaleWeightKg ?? null,
      nutritionCalories: log.nutritionCalories ?? null,
      nutritionProteinG: log.nutritionProteinG ?? null,
      nutritionCarbsG: log.nutritionCarbsG ?? null,
      nutritionFatG: log.nutritionFatG ?? null,
      stepCount: log.stepCount ?? null,
      logStatus: (log.logStatus as 'complete' | 'partial' | 'skipped') ?? 'skipped',
    }));

    // Sort by date
    result.sort((a, b) => a.date.localeCompare(b.date));
    return result;
  } catch (error) {
    console.error('[metabolicService] Error fetching daily logs range:', error);
    return [];
  }
}

/**
 * Recalculate TDEE from a specific date forward
 * This handles the cascade effect when historical data is modified
 * 
 * @param fromDate - Start recalculating from this date (YYYY-MM-DD string or Date)
 * @returns Number of days recalculated
 */
export async function recalculateTdeeFromDate(fromDate: string | Date): Promise<number> {
  const client = getAmplifyDataClient();
  if (!client) {
    console.error('[metabolicService] No Amplify client available');
    return 0;
  }

  const startDate = typeof fromDate === 'string' ? new Date(fromDate) : new Date(fromDate);
  startDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  try {
    // Fetch all required data in parallel
    const [userGoals, weightEntries, dailyLogs, existingStates] = await Promise.all([
      fetchUserGoals(),
      fetchWeightHistory(startDate, today),
      fetchDailyLogsRange(startDate, today),
      // Also fetch existing ComputedStates to update them
      client.models.ComputedState.list({
        filter: {
          date: {
            between: [formatDateKey(startDate), formatDateKey(today)],
          },
        },
      }),
    ]);

    if (weightEntries.length === 0) {
      return 0;
    }

    // Build a map of existing states for quick lookup (date -> id)
    const existingStateMap = new Map<string, string>();
    if (existingStates.data) {
      for (const state of existingStates.data) {
        existingStateMap.set(state.date, state.id);
      }
    }

    // Build a map of daily logs for quick lookup
    const dailyLogMap = new Map<string, DailyLog>();
    for (const log of dailyLogs) {
      dailyLogMap.set(log.date, log);
    }

    // Calculate trend weights using the trendEngine
    const trendData = calculateTrendWeights(weightEntries, startDate, today);

    if (trendData.length === 0) {
      return 0;
    }

    // Get initial TDEE for the chain
    // Try to get the previous day's state, or use cold start
    let prevTdee = 2000;
    
    // Check for state from day before startDate
    const dayBefore = new Date(startDate);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const dayBeforeKey = formatDateKey(dayBefore);
    
    const { data: prevStates } = await client.models.ComputedState.list({
      filter: {
        date: { eq: dayBeforeKey },
      },
    });

    if (prevStates && prevStates.length > 0) {
      prevTdee = prevStates[0].estimatedTdeeKcal;
    } else if (userGoals && weightEntries.length > 0) {
      // Cold start - use Mifflin-St Jeor
      const coldStart = calculateColdStartTdee(userGoals, weightEntries[0].weightKg);
      if (coldStart) {
        prevTdee = coldStart;
      }
    }

    // Process each day and calculate/persist ComputedState
    let daysRecalculated = 0;

    for (let i = 0; i < trendData.length; i++) {
      const point = trendData[i];
      const prevTrendWeight = i > 0 ? trendData[i - 1].trendWeight : point.trendWeight;
      const dailyLog = dailyLogMap.get(point.date) ?? null;

      // Build the computed state
      const state = buildComputedState(
        point.date,
        point.trendWeight,
        prevTrendWeight,
        dailyLog,
        prevTdee
      );

      // Persist to database
      const existingId = existingStateMap.get(point.date);
      
      if (existingId) {
        // Update existing state
        await client.models.ComputedState.update({
          id: existingId,
          trendWeightKg: state.trendWeightKg,
          estimatedTdeeKcal: state.estimatedTdeeKcal,
          rawTdeeKcal: state.rawTdeeKcal,
          fluxConfidenceRange: state.fluxConfidenceRange,
          energyDensityUsed: state.energyDensityUsed,
          weightDeltaKg: state.weightDeltaKg,
        });
      } else {
        // Create new state
        await client.models.ComputedState.create({
          date: state.date,
          trendWeightKg: state.trendWeightKg,
          estimatedTdeeKcal: state.estimatedTdeeKcal,
          rawTdeeKcal: state.rawTdeeKcal,
          fluxConfidenceRange: state.fluxConfidenceRange,
          energyDensityUsed: state.energyDensityUsed,
          weightDeltaKg: state.weightDeltaKg,
        });
      }

      // Chain the TDEE for next iteration
      prevTdee = state.estimatedTdeeKcal;
      daysRecalculated++;
    }

    return daysRecalculated;
  } catch (error) {
    console.error('[metabolicService] Error recalculating TDEE:', error);
    return 0;
  }
}

// ============================================
// Unified Event Handlers
// ============================================

/**
 * Handle meal logged event
 * Called after a meal is created, updated, or deleted
 * 
 * Only aggregates daily nutrition - does NOT recalculate TDEE.
 * TDEE recalculation happens only when weight is logged to avoid
 * confusing users with TDEE bouncing around as they log food.
 * 
 * @param date - Date of the meal (from meal.eatenAt)
 */
export async function onMealLogged(date: string | Date): Promise<void> {
  const dateKey = typeof date === 'string' 
    ? formatDateKey(new Date(date)) 
    : formatDateKey(date);

  // Only aggregate nutrition - TDEE updates on weight log only
  await aggregateDailyNutrition(dateKey);
}

/**
 * Handle weight logged event
 * Called after a weight entry is created, updated, or deleted
 * 
 * @param date - Date of the weight entry (from weightLog.recordedAt)
 */
export async function onWeightLogged(date: string | Date): Promise<void> {
  const dateKey = typeof date === 'string'
    ? formatDateKey(new Date(date))
    : formatDateKey(date);

  // Step 1: Update the DailyLog with the new weight
  await aggregateDailyNutrition(dateKey);

  // Step 2: Recalculate TDEE from this date forward
  // Weight changes affect trend weight which cascades through all subsequent days
  await recalculateTdeeFromDate(dateKey);
}

// ============================================
// Backfill Utility
// ============================================

/**
 * Backfill DailyLog and ComputedState for all historical data
 * Run this once to populate existing data, or to repair data integrity
 * 
 * @param days - Number of days to backfill (default 90)
 * @returns Summary of backfill operation
 */
export async function backfillMetabolicData(days: number = 90): Promise<{
  daysProcessed: number;
  dailyLogsCreated: number;
  computedStatesCreated: number;
}> {
  const client = getAmplifyDataClient();
  if (!client) {
    return { daysProcessed: 0, dailyLogsCreated: 0, computedStatesCreated: 0 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - days);

  let dailyLogsCreated = 0;

  // Process each day
  for (let i = 0; i <= days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateKey = formatDateKey(date);

    const result = await aggregateDailyNutrition(dateKey);
    if (result) {
      dailyLogsCreated++;
    }
  }

  // Now recalculate all TDEE from the start
  const computedStatesCreated = await recalculateTdeeFromDate(startDate);

  return {
    daysProcessed: days + 1,
    dailyLogsCreated,
    computedStatesCreated,
  };
}

// ============================================
// Debug Helpers (for browser console)
// ============================================

/**
 * Clear all ComputedState records and re-run backfill
 * Call from browser console: window.resetMetabolicData()
 */
export async function resetMetabolicData(days: number = 90): Promise<void> {
  const client = getAmplifyDataClient();
  if (!client) {
    return;
  }

  // Delete all ComputedState records
  const { data: states } = await client.models.ComputedState.list({ limit: 1000 });
  
  if (states) {
    for (const state of states) {
      await client.models.ComputedState.delete({ id: state.id });
    }
  }
  
  // Run backfill
  await backfillMetabolicData(days);
}

/**
 * Review high-calorie days and interactively skip them
 * Fetches full meal breakdowns so you can identify anomalies.
 * Call from browser console: window.reviewHighCal(2500)
 * 
 * @param threshold - Calorie threshold (default 2500)
 */
export async function reviewHighCalorieDays(threshold: number = 2500): Promise<void> {
  const client = getAmplifyDataClient();
  if (!client) {
    console.error('[reviewHighCal] No Amplify client available');
    return;
  }

  console.log(`[reviewHighCal] Finding days with > ${threshold} calories...`);

  // Fetch all DailyLogs (paginate to get everything)
  const allLogs: Array<{
    id: string;
    date: string;
    nutritionCalories: number | null;
    logStatus: string | null;
  }> = [];

  let nextToken: string | null | undefined = undefined;
  do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = { limit: 1000 };
    if (nextToken) params.nextToken = nextToken;

    const result = await client.models.DailyLog.list(params);
    if (result.data) {
      for (const log of result.data) {
        allLogs.push({
          id: log.id,
          date: log.date,
          nutritionCalories: log.nutritionCalories ?? null,
          logStatus: log.logStatus ?? null,
        });
      }
    }
    nextToken = result.nextToken;
  } while (nextToken);

  // Filter for high-calorie days that aren't already skipped
  const highCalDays = allLogs
    .filter(
      (log) =>
        log.nutritionCalories !== null &&
        log.nutritionCalories > threshold &&
        log.logStatus !== 'skipped'
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  if (highCalDays.length === 0) {
    console.log(`[reviewHighCal] No days found with > ${threshold} calories (excluding already-skipped days).`);
    return;
  }

  console.log(`[reviewHighCal] Found ${highCalDays.length} days over ${threshold} cal. Fetching meal details...\n`);

  // Fetch meals for each high-cal day
  interface MealDetail {
    name: string;
    category: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    ingredients: Array<{ name: string; calories: number; weightG: number }>;
  }

  interface DayDetail {
    id: string;
    date: string;
    totalCalories: number;
    logStatus: string;
    meals: MealDetail[];
  }

  const dayDetails: DayDetail[] = [];

  for (const day of highCalDays) {
    // Fetch meals via localDate GSI
    const { data: meals } = await client.models.Meal.listMealByLocalDate({
      localDate: day.date,
    });

    const mealDetails: MealDetail[] = [];

    if (meals && meals.length > 0) {
      for (const meal of meals) {
        // Fetch ingredients for this meal
        const { data: ingredients } = await client.models.MealIngredient.listMealIngredientByMealId({
          mealId: meal.id,
        });

        mealDetails.push({
          name: meal.name,
          category: meal.category,
          calories: meal.totalCalories,
          protein: meal.totalProtein,
          carbs: meal.totalCarbs,
          fat: meal.totalFat,
          ingredients: (ingredients || [])
            .sort((a, b) => (b.calories || 0) - (a.calories || 0))
            .map((ing) => ({
              name: ing.name,
              calories: ing.calories,
              weightG: ing.weightG,
            })),
        });
      }
    }

    // Sort meals by calories descending
    mealDetails.sort((a, b) => b.calories - a.calories);

    dayDetails.push({
      id: day.id,
      date: day.date,
      totalCalories: day.nutritionCalories || 0,
      logStatus: day.logStatus || 'complete',
      meals: mealDetails,
    });
  }

  // Print full summary to console
  console.log('='.repeat(70));
  for (const day of dayDetails) {
    const dayName = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
    console.log(`\n📅 ${day.date} (${dayName}) — ${day.totalCalories} cal [${day.logStatus}]`);
    console.log('-'.repeat(50));

    if (day.meals.length === 0) {
      console.log('  (no meals found via localDate query)');
    } else {
      for (const meal of day.meals) {
        const emoji = meal.category === 'drink' ? '🥤' : meal.category === 'snack' ? '🍪' : '🍽️';
        console.log(`  ${emoji} ${meal.name} — ${meal.calories} cal (P:${meal.protein}g C:${meal.carbs}g F:${meal.fat}g)`);
        for (const ing of meal.ingredients) {
          console.log(`      • ${ing.name}: ${ing.calories} cal (${ing.weightG}g)`);
        }
      }
    }
  }
  console.log('\n' + '='.repeat(70));

  // Also print a compact table for quick overview
  console.log('\nSummary table:');
  console.table(
    dayDetails.map((d) => ({
      date: d.date,
      calories: d.totalCalories,
      status: d.logStatus,
      meals: d.meals.map((m) => `${m.name} (${m.calories})`).join(' | '),
    }))
  );

  // Interactive prompts with full context
  const toSkip: DayDetail[] = [];

  for (const day of dayDetails) {
    const dayName = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });

    const mealLines = day.meals
      .map((m) => {
        const ingList = m.ingredients
          .slice(0, 5) // top 5 by calories
          .map((i) => `  • ${i.name}: ${i.calories} cal`)
          .join('\n');
        return `${m.name} — ${m.calories} cal\n${ingList}`;
      })
      .join('\n\n');

    const message = [
      `${dayName} (${day.date})`,
      `Total: ${day.totalCalories} cal`,
      `Status: ${day.logStatus}`,
      '',
      'Meals:',
      mealLines || '(no meal data)',
      '',
      'Skip this day from TDEE calculation?',
    ].join('\n');

    const answer = window.confirm(message);
    if (answer) {
      toSkip.push(day);
    }
  }

  if (toSkip.length === 0) {
    console.log('[reviewHighCal] No days selected to skip.');
    return;
  }

  console.log(`\n[reviewHighCal] Skipping ${toSkip.length} days: ${toSkip.map((d) => d.date).join(', ')}`);

  // Update each day's logStatus to 'skipped'
  for (const day of toSkip) {
    await client.models.DailyLog.update({
      id: day.id,
      logStatus: 'skipped',
    });
    console.log(`  ✓ ${day.date} (${day.totalCalories} cal) marked as skipped`);
  }

  // Recalculate TDEE from the earliest skipped date forward
  const earliestDate = toSkip[0].date; // already sorted
  console.log(`\n[reviewHighCal] Recalculating TDEE from ${earliestDate}...`);
  const daysRecalculated = await recalculateTdeeFromDate(earliestDate);
  console.log(`[reviewHighCal] Done! Recalculated ${daysRecalculated} days. Refresh the page to see updated values.`);
}

// Expose to window for browser console access
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).resetMetabolicData = resetMetabolicData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).backfillMetabolicData = backfillMetabolicData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).reviewHighCal = reviewHighCalorieDays;
}
