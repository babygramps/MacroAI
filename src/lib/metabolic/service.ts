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
import {
  fetchUserGoals,
  fetchWeightHistory,
  fetchDailyLogsRange,
  fetchComputedStates,
} from '@/lib/data/metabolicRepo';
import { formatDateKey } from '../statsHelpers';
import { calculateTrendWeights } from '../trendEngine';
import { calculateColdStartTdee } from '../expenditureEngine';
import { computeStateChain } from './stateChain';
import type { DailyLog } from '../types';

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
      fetchUserGoals(client),
      fetchWeightHistory(startDate, today, client),
      fetchDailyLogsRange(formatDateKey(startDate), formatDateKey(today), client),
      // Also fetch existing ComputedStates to update them
      fetchComputedStates(formatDateKey(startDate), formatDateKey(today), client),
    ]);

    if (weightEntries.length === 0) {
      return 0;
    }

    // Build a map of existing states for quick lookup (date -> id)
    const existingStateMap = new Map<string, string>();
    for (const state of existingStates) {
      if (state.id) {
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
      const persistedPrevTdee = prevStates[0].estimatedTdeeKcal;
      if (typeof persistedPrevTdee === 'number' && Number.isFinite(persistedPrevTdee)) {
        prevTdee = persistedPrevTdee;
      }
    } else if (userGoals && weightEntries.length > 0) {
      // Cold start - use Mifflin-St Jeor
      const coldStart = calculateColdStartTdee(userGoals, weightEntries[0].weightKg);
      if (coldStart) {
        prevTdee = coldStart;
      }
    }

    // Compute the full day-by-day state chain (pure) using the seed above.
    // The whoosh-dampening diagnostic log is reproduced here via the observer so
    // this path's logging stays identical to before the extraction.
    const states = computeStateChain({
      trendData,
      dailyLogsByDate: dailyLogMap,
      initialTdee: prevTdee,
      onWhooshDamp: ({ date, scaleWeightDeltaKg, trendWeightDeltaKg, adjustedWeightDeltaKg }) => {
        console.log(
          `[metabolicService] Whoosh dampening ${date}: scaleDelta=${scaleWeightDeltaKg.toFixed(3)}, trendDelta=${trendWeightDeltaKg.toFixed(3)}, usedDelta=${adjustedWeightDeltaKg.toFixed(3)}`
        );
      },
    });

    // Persist each computed state with the SAME per-day serial create/update
    // writes as before (batching/diff-skip is Task 8).
    let daysRecalculated = 0;
    for (const state of states) {
      const existingId = existingStateMap.get(state.date);

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

/**
 * Handle day status changed event
 * Called after a day's logStatus is updated (e.g. marked skipped/complete)
 *
 * @param date - Date whose status changed
 */
export async function onDayStatusChanged(date: string | Date): Promise<void> {
  const dateKey = typeof date === 'string'
    ? formatDateKey(new Date(date))
    : formatDateKey(date);

  // Step 1: Update the DailyLog to reflect current nutrition data
  await aggregateDailyNutrition(dateKey);

  // Step 2: Recalculate TDEE from this date forward
  // Skipping/unskipping a day changes which days are excluded from TDEE calculations
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
