'use server';

import { getAmplifyDataClient } from '@/lib/data/amplifyClient';
import type { LogStatus } from '@/lib/types';
import { recalculateTdeeFromDate } from '@/lib/metabolicService';

/**
 * Format date to YYYY-MM-DD string
 */
function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface UpdateDayStatusResult {
  success: boolean;
  error?: string;
  logStatus?: LogStatus;
}

/**
 * Update the log status for a specific day
 * Creates a DailyLog record if it doesn't exist
 */
export async function updateDayStatus(
  date: Date,
  status: LogStatus
): Promise<UpdateDayStatusResult> {
  console.log('[updateDayStatus] Updating status for', date, 'to', status);

  const client = getAmplifyDataClient();
  if (!client) {
    return { success: false, error: 'Not authenticated' };
  }

  const dateKey = formatDateKey(date);

  try {
    // Check if DailyLog exists for this date
    const { data: existingLogs } = await client.models.DailyLog.listDailyLogByDate({
      date: dateKey,
    });

    if (existingLogs && existingLogs.length > 0) {
      // Update existing record
      const existingLog = existingLogs[0];
      await client.models.DailyLog.update({
        id: existingLog.id,
        logStatus: status,
      });
      console.log('[updateDayStatus] Updated existing DailyLog:', existingLog.id);
    } else {
      // Create new DailyLog record
      // We need to aggregate nutrition data from Meals and FoodLogs for this date
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const [mealsResult, foodLogsResult, weightResult] = await Promise.all([
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
        client.models.WeightLog.list({
          filter: {
            recordedAt: {
              between: [startOfDay.toISOString(), endOfDay.toISOString()],
            },
          },
        }),
      ]);

      // Calculate nutrition totals from meals
      const meals = mealsResult.data || [];
      const foodLogs = foodLogsResult.data || [];
      const weights = weightResult.data || [];

      let totalCalories = 0;
      let totalProtein = 0;
      let totalCarbs = 0;
      let totalFat = 0;

      for (const meal of meals) {
        totalCalories += meal.totalCalories || 0;
        totalProtein += meal.totalProtein || 0;
        totalCarbs += meal.totalCarbs || 0;
        totalFat += meal.totalFat || 0;
      }

      for (const log of foodLogs) {
        totalCalories += log.calories || 0;
        totalProtein += log.protein || 0;
        totalCarbs += log.carbs || 0;
        totalFat += log.fat || 0;
      }

      const hasNutritionData = meals.length > 0 || foodLogs.length > 0;
      const scaleWeight = weights.length > 0 ? weights[0].weightKg : null;

      await client.models.DailyLog.create({
        date: dateKey,
        scaleWeightKg: scaleWeight,
        nutritionCalories: hasNutritionData ? totalCalories : null,
        nutritionProteinG: hasNutritionData ? totalProtein : null,
        nutritionCarbsG: hasNutritionData ? totalCarbs : null,
        nutritionFatG: hasNutritionData ? totalFat : null,
        stepCount: null,
        logStatus: status,
      });
      console.log('[updateDayStatus] Created new DailyLog for', dateKey);
    }

    // Trigger TDEE recalculation from this date forward
    // This ensures skipped days are properly excluded from calculations
    console.log('[updateDayStatus] Triggering TDEE recalculation from', dateKey);
    const daysRecalculated = await recalculateTdeeFromDate(dateKey);
    console.log('[updateDayStatus] Recalculated TDEE for', daysRecalculated, 'days');

    return { success: true, logStatus: status };
  } catch (error) {
    console.error('[updateDayStatus] Error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Fetch the log status for a specific day
 */
export async function fetchDayStatus(date: Date): Promise<LogStatus | null> {
  const client = getAmplifyDataClient();
  if (!client) {
    return null;
  }

  const dateKey = formatDateKey(date);

  try {
    const { data: existingLogs } = await client.models.DailyLog.listDailyLogByDate({
      date: dateKey,
    });

    if (existingLogs && existingLogs.length > 0) {
      return (existingLogs[0].logStatus as LogStatus) || null;
    }

    return null;
  } catch (error) {
    console.error('[fetchDayStatus] Error:', error);
    return null;
  }
}

/**
 * Fetch log statuses for a range of dates
 * Returns a map of dateKey -> LogStatus
 */
export async function fetchDayStatusRange(
  startDate: Date,
  endDate: Date
): Promise<Map<string, LogStatus>> {
  const client = getAmplifyDataClient();
  const statusMap = new Map<string, LogStatus>();

  if (!client) {
    return statusMap;
  }

  const startKey = formatDateKey(startDate);
  const endKey = formatDateKey(endDate);

  try {
    const { data: dailyLogs } = await client.models.DailyLog.list({
      filter: {
        date: {
          between: [startKey, endKey],
        },
      },
    });

    if (dailyLogs) {
      for (const log of dailyLogs) {
        if (log.logStatus) {
          statusMap.set(log.date, log.logStatus as LogStatus);
        }
      }
    }

    return statusMap;
  } catch (error) {
    console.error('[fetchDayStatusRange] Error:', error);
    return statusMap;
  }
}
