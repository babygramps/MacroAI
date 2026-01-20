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
    console.error('[metabolicService] No Amplify client available');
    return null;
  }

  const dateKey = typeof date === 'string' ? date : formatDateKey(date);
  console.log('[metabolicService] Aggregating nutrition for:', dateKey);

  try {
    // Get start and end of day for query
    const startOfDay = new Date(`${dateKey}T00:00:00`);
    const endOfDay = new Date(`${dateKey}T23:59:59.999`);

    // Fetch all meals and legacy food logs for this date in parallel
    const [mealsResult, foodLogsResult, weightResult, existingDailyLog] = await Promise.all([
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
    const foodLogs = foodLogsResult.data ?? [];
    const weights = weightResult.data ?? [];
    const existingLogs = existingDailyLog.data ?? [];

    console.log('[metabolicService] Found:', {
      meals: meals.length,
      foodLogs: foodLogs.length,
      weights: weights.length,
      existingDailyLogs: existingLogs.length,
    });

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

    // Add legacy FoodLog entries
    for (const log of foodLogs) {
      totalCalories += log.calories ?? 0;
      totalProtein += log.protein ?? 0;
      totalCarbs += log.carbs ?? 0;
      totalFat += log.fat ?? 0;
    }

    // Get scale weight for the day (use first entry if multiple)
    const scaleWeightKg = weights.length > 0 ? weights[0].weightKg : null;

    // Determine log status
    const hasNutritionData = meals.length > 0 || foodLogs.length > 0;
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
      console.log('[metabolicService] Updated DailyLog for', dateKey);
    } else {
      // Create new
      await client.models.DailyLog.create(dailyLogData);
      console.log('[metabolicService] Created DailyLog for', dateKey);
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

  console.log('[metabolicService] Recalculating TDEE from', formatDateKey(startDate), 'to today');

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
      console.log('[metabolicService] No weight entries found for recalculation');
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
      console.log('[metabolicService] No trend data calculated');
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
      console.log('[metabolicService] Using previous TDEE from', dayBeforeKey, ':', prevTdee);
    } else if (userGoals && weightEntries.length > 0) {
      // Cold start - use Mifflin-St Jeor
      const coldStart = calculateColdStartTdee(userGoals, weightEntries[0].weightKg);
      if (coldStart) {
        prevTdee = coldStart;
        console.log('[metabolicService] Using cold start TDEE:', prevTdee);
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

    console.log('[metabolicService] Recalculated', daysRecalculated, 'days of TDEE');
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
 * @param date - Date of the meal (from meal.eatenAt)
 */
export async function onMealLogged(date: string | Date): Promise<void> {
  const dateKey = typeof date === 'string' 
    ? formatDateKey(new Date(date)) 
    : formatDateKey(date);
  
  console.log('[metabolicService] onMealLogged triggered for:', dateKey);

  // Step 1: Aggregate nutrition for the day
  await aggregateDailyNutrition(dateKey);

  // Step 2: Recalculate TDEE from this date forward
  await recalculateTdeeFromDate(dateKey);
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

  console.log('[metabolicService] onWeightLogged triggered for:', dateKey);

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
    console.error('[metabolicService] No Amplify client available');
    return { daysProcessed: 0, dailyLogsCreated: 0, computedStatesCreated: 0 };
  }

  console.log('[metabolicService] Starting backfill for', days, 'days');

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

  console.log('[metabolicService] Backfill complete:', {
    daysProcessed: days + 1,
    dailyLogsCreated,
    computedStatesCreated,
  });

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
    console.error('[metabolicService] No Amplify client available');
    return;
  }

  console.log('[metabolicService] Clearing existing ComputedState records...');
  
  // Delete all ComputedState records
  const { data: states } = await client.models.ComputedState.list({ limit: 1000 });
  console.log(`[metabolicService] Found ${states?.length || 0} ComputedState records to delete`);
  
  if (states) {
    for (const state of states) {
      await client.models.ComputedState.delete({ id: state.id });
    }
  }
  
  console.log('[metabolicService] Deleted all ComputedState records, running backfill...');
  
  // Run backfill
  const result = await backfillMetabolicData(days);
  console.log('[metabolicService] Reset complete:', result);
}

// Expose to window for browser console access
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).resetMetabolicData = resetMetabolicData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).backfillMetabolicData = backfillMetabolicData;
  console.log('[metabolicService] Debug helpers available: window.resetMetabolicData(), window.backfillMetabolicData()');
}
