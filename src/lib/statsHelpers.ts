import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import type { DayData, DailySummary, FoodLogEntry, WeeklyStats, UserGoals, WeightLogEntry, WeightStats } from './types';

const client = generateClient<Schema>();

/**
 * Format a date to YYYY-MM-DD string
 */
export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the start of a day (midnight)
 */
function getStartOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Fetch food logs for a date range and group by day
 */
export async function fetchWeekData(endDate: Date, days: number = 7): Promise<DayData[]> {
  const end = getStartOfDay(endDate);
  end.setDate(end.getDate() + 1); // End is exclusive, so add 1 day
  
  const start = getStartOfDay(endDate);
  start.setDate(start.getDate() - (days - 1)); // Go back (days - 1) to include endDate
  
  console.log('[statsHelpers] Fetching week data:', {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    days,
  });

  try {
    const { data: logs } = await client.models.FoodLog.list({
      filter: {
        eatenAt: {
          between: [start.toISOString(), end.toISOString()],
        },
      },
    });

    console.log('[statsHelpers] Fetched logs count:', logs?.length ?? 0);

    // Group logs by date
    const logsByDate: Map<string, FoodLogEntry[]> = new Map();
    
    // Initialize all days with empty arrays
    for (let i = 0; i < days; i++) {
      const dayDate = new Date(start);
      dayDate.setDate(dayDate.getDate() + i);
      const dateKey = formatDateKey(dayDate);
      logsByDate.set(dateKey, []);
    }

    // Populate with actual logs
    if (logs) {
      for (const log of logs) {
        if (!log.eatenAt) continue;
        const logDate = new Date(log.eatenAt);
        const dateKey = formatDateKey(logDate);
        
        const entry: FoodLogEntry = {
          id: log.id,
          name: log.name ?? '',
          weightG: log.weightG ?? 0,
          calories: log.calories ?? 0,
          protein: log.protein ?? 0,
          carbs: log.carbs ?? 0,
          fat: log.fat ?? 0,
          source: log.source ?? '',
          eatenAt: log.eatenAt,
        };

        const dayLogs = logsByDate.get(dateKey);
        if (dayLogs) {
          dayLogs.push(entry);
        }
      }
    }

    // Convert to DayData array
    const result: DayData[] = [];
    for (let i = 0; i < days; i++) {
      const dayDate = new Date(start);
      dayDate.setDate(dayDate.getDate() + i);
      const dateKey = formatDateKey(dayDate);
      const entries = logsByDate.get(dateKey) ?? [];

      const totals = entries.reduce(
        (acc, entry) => ({
          totalCalories: acc.totalCalories + entry.calories,
          totalProtein: acc.totalProtein + entry.protein,
          totalCarbs: acc.totalCarbs + entry.carbs,
          totalFat: acc.totalFat + entry.fat,
        }),
        { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0 }
      );

      const summary: DailySummary = {
        ...totals,
        entries,
      };

      result.push({
        date: dateKey,
        summary,
      });
    }

    console.log('[statsHelpers] Week data result:', result.map(d => ({
      date: d.date,
      entries: d.summary.entries.length,
      calories: d.summary.totalCalories,
    })));

    return result;
  } catch (error) {
    console.error('[statsHelpers] Error fetching week data:', error);
    throw error;
  }
}

/**
 * Calculate consecutive day streak (counting back from today)
 * A day counts as "logged" if it has at least one food entry
 */
export async function calculateStreak(): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let streak = 0;
  const currentDate = new Date(today);
  
  // We'll check up to 365 days back (reasonable limit)
  const maxDays = 365;
  
  console.log('[statsHelpers] Calculating streak from:', formatDateKey(today));

  try {
    for (let i = 0; i < maxDays; i++) {
      const startOfDay = getStartOfDay(currentDate);
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      const { data: logs } = await client.models.FoodLog.list({
        filter: {
          eatenAt: {
            between: [startOfDay.toISOString(), endOfDay.toISOString()],
          },
        },
      });

      // If this day has entries, increment streak
      if (logs && logs.length > 0) {
        streak++;
        // Move to previous day
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        // Streak broken (unless it's today - we allow today to have no entries yet)
        if (i === 0) {
          // Today has no entries yet, check yesterday
          currentDate.setDate(currentDate.getDate() - 1);
          continue;
        }
        break;
      }
    }

    console.log('[statsHelpers] Calculated streak:', streak);
    return streak;
  } catch (error) {
    console.error('[statsHelpers] Error calculating streak:', error);
    return 0;
  }
}

/**
 * Efficient streak calculation using batch fetch
 * Fetches last 30 days and calculates streak from that
 */
export async function calculateStreakEfficient(): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Fetch last 30 days of data
  const weekData = await fetchWeekData(today, 30);
  
  // Reverse so we start from today
  const daysReversed = [...weekData].reverse();
  
  let streak = 0;
  let skipToday = true; // Allow today to have no entries
  
  for (const dayData of daysReversed) {
    const hasEntries = dayData.summary.entries.length > 0;
    
    if (skipToday) {
      skipToday = false;
      if (!hasEntries) {
        // Today has no entries, that's ok, continue to yesterday
        continue;
      }
    }
    
    if (hasEntries) {
      streak++;
    } else {
      // Streak broken
      break;
    }
  }
  
  console.log('[statsHelpers] Calculated streak (efficient):', streak);
  return streak;
}

/**
 * Calculate weekly averages from DayData array
 * Only counts days that have at least one entry
 */
export function calculateAverages(weekData: DayData[]): WeeklyStats['averages'] {
  // Filter to only days with entries
  const daysWithData = weekData.filter(d => d.summary.entries.length > 0);
  
  if (daysWithData.length === 0) {
    return {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    };
  }

  const totals = daysWithData.reduce(
    (acc, day) => ({
      calories: acc.calories + day.summary.totalCalories,
      protein: acc.protein + day.summary.totalProtein,
      carbs: acc.carbs + day.summary.totalCarbs,
      fat: acc.fat + day.summary.totalFat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const count = daysWithData.length;

  return {
    calories: Math.round(totals.calories / count),
    protein: Math.round((totals.protein / count) * 10) / 10,
    carbs: Math.round((totals.carbs / count) * 10) / 10,
    fat: Math.round((totals.fat / count) * 10) / 10,
  };
}

/**
 * Fetch complete weekly stats
 */
export async function fetchWeeklyStats(endDate: Date = new Date()): Promise<WeeklyStats> {
  console.log('[statsHelpers] Fetching weekly stats for:', formatDateKey(endDate));
  
  const days = await fetchWeekData(endDate, 7);
  const averages = calculateAverages(days);
  const streak = await calculateStreakEfficient();

  return {
    days,
    averages,
    streak,
  };
}

/**
 * Fetch user goals
 */
export async function fetchUserGoals(): Promise<UserGoals | null> {
  try {
    const { data: profiles } = await client.models.UserProfile.list();
    if (profiles && profiles.length > 0) {
      const profile = profiles[0];
      return {
        calorieGoal: profile.calorieGoal ?? 2000,
        proteinGoal: profile.proteinGoal ?? 150,
        carbsGoal: profile.carbsGoal ?? 200,
        fatGoal: profile.fatGoal ?? 65,
        targetWeightKg: profile.targetWeightKg ?? undefined,
        preferredWeightUnit: (profile.preferredWeightUnit as 'kg' | 'lbs') ?? 'kg',
      };
    }
    return null;
  } catch (error) {
    console.error('[statsHelpers] Error fetching user goals:', error);
    return null;
  }
}

// ============================================
// Weight Tracking Helper Functions
// ============================================

/**
 * Fetch weight history for a given number of days
 */
export async function fetchWeightHistory(days: number = 30): Promise<WeightLogEntry[]> {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  console.log('[statsHelpers] Fetching weight history:', {
    startDate: startDate.toISOString(),
    endDate: today.toISOString(),
    days,
  });

  try {
    const { data: logs } = await client.models.WeightLog.list({
      filter: {
        recordedAt: {
          between: [startDate.toISOString(), today.toISOString()],
        },
      },
    });

    if (!logs || logs.length === 0) {
      console.log('[statsHelpers] No weight entries found');
      return [];
    }

    const entries: WeightLogEntry[] = logs.map((log) => ({
      id: log.id,
      weightKg: log.weightKg,
      recordedAt: log.recordedAt,
      note: log.note ?? undefined,
    }));

    // Sort by date ascending (oldest first)
    entries.sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());

    console.log('[statsHelpers] Weight history fetched:', entries.length, 'entries');
    return entries;
  } catch (error) {
    console.error('[statsHelpers] Error fetching weight history:', error);
    return [];
  }
}

/**
 * Get the most recent weight entry
 */
export async function getLatestWeight(): Promise<WeightLogEntry | null> {
  console.log('[statsHelpers] Fetching latest weight...');
  
  try {
    const { data: logs } = await client.models.WeightLog.list();

    if (!logs || logs.length === 0) {
      console.log('[statsHelpers] No weight entries found');
      return null;
    }

    // Sort by recordedAt descending (most recent first)
    const sorted = [...logs].sort(
      (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
    );

    const latest = sorted[0];
    console.log('[statsHelpers] Latest weight:', latest.weightKg, 'kg');

    return {
      id: latest.id,
      weightKg: latest.weightKg,
      recordedAt: latest.recordedAt,
      note: latest.note ?? undefined,
    };
  } catch (error) {
    console.error('[statsHelpers] Error fetching latest weight:', error);
    return null;
  }
}

/**
 * Calculate weight change over a period
 * Returns the difference between the most recent entry and the oldest entry within the period
 */
export function calculateWeightChange(entries: WeightLogEntry[], days: number): number | null {
  if (entries.length < 2) {
    return null;
  }

  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // Get entries within the period
  const recentEntries = entries.filter(
    (e) => new Date(e.recordedAt).getTime() >= cutoffDate.getTime()
  );

  if (recentEntries.length < 2) {
    // Not enough data within the period, use all entries
    const current = entries[entries.length - 1];
    const oldest = entries[0];
    return Math.round((current.weightKg - oldest.weightKg) * 10) / 10;
  }

  const current = recentEntries[recentEntries.length - 1];
  const oldest = recentEntries[0];

  return Math.round((current.weightKg - oldest.weightKg) * 10) / 10;
}

/**
 * Fetch complete weight statistics
 */
export async function fetchWeightStats(): Promise<WeightStats> {
  console.log('[statsHelpers] Fetching weight stats...');

  const entries = await fetchWeightHistory(90); // Get 90 days of data
  const latestEntry = entries.length > 0 ? entries[entries.length - 1] : null;
  const currentWeight = latestEntry?.weightKg ?? null;

  const changeFromWeekAgo = calculateWeightChange(entries, 7);
  const changeFromMonthAgo = calculateWeightChange(entries, 30);

  console.log('[statsHelpers] Weight stats:', {
    entriesCount: entries.length,
    currentWeight,
    changeFromWeekAgo,
    changeFromMonthAgo,
  });

  return {
    entries,
    currentWeight,
    changeFromWeekAgo,
    changeFromMonthAgo,
  };
}

/**
 * Convert kg to lbs
 */
export function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

/**
 * Convert lbs to kg
 */
export function lbsToKg(lbs: number): number {
  return Math.round(lbs / 2.20462 * 10) / 10;
}

/**
 * Format weight with unit
 */
export function formatWeight(weightKg: number, unit: 'kg' | 'lbs' = 'kg'): string {
  if (unit === 'lbs') {
    return `${kgToLbs(weightKg)} lbs`;
  }
  return `${Math.round(weightKg * 10) / 10} kg`;
}
