import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import type { 
  DayData, 
  DailySummary, 
  FoodLogEntry, 
  WeeklyStats, 
  UserGoals, 
  WeightLogEntry, 
  WeightStats,
  DailyLog,
  ComputedState,
  WeeklyCheckIn,
  MetabolicInsights,
  WeightStatsWithTrend,
} from './types';
import { METABOLIC_CONSTANTS } from './types';
import { calculateTrendWeights, getWeeklyWeightChange } from './trendEngine';
import { 
  calculateColdStartTdee, 
  determineConfidenceLevel,
  buildComputedState,
} from './expenditureEngine';
import { 
  buildWeeklyCheckIn, 
  calculateCalorieTarget,
  getWeekStartDate,
  getWeekEndDate,
} from './coachingEngine';

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
    // Fetch from BOTH FoodLog (legacy) and Meal (new) tables
    const [foodLogResult, mealResult] = await Promise.all([
      client.models.FoodLog.list({
        filter: {
          eatenAt: {
            between: [start.toISOString(), end.toISOString()],
          },
        },
      }),
      client.models.Meal.list({
        filter: {
          eatenAt: {
            between: [start.toISOString(), end.toISOString()],
          },
        },
      }),
    ]);

    const logs = foodLogResult.data;
    const meals = mealResult.data;

    console.log('[statsHelpers] Fetched logs count:', logs?.length ?? 0);
    console.log('[statsHelpers] Fetched meals count:', meals?.length ?? 0);

    // Group logs by date
    const logsByDate: Map<string, FoodLogEntry[]> = new Map();
    
    // Initialize all days with empty arrays
    for (let i = 0; i < days; i++) {
      const dayDate = new Date(start);
      dayDate.setDate(dayDate.getDate() + i);
      const dateKey = formatDateKey(dayDate);
      logsByDate.set(dateKey, []);
    }

    // Populate with actual legacy FoodLog entries
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

    // Populate with new Meal entries (convert to FoodLogEntry format for stats)
    if (meals) {
      for (const meal of meals) {
        if (!meal.eatenAt) continue;
        const mealDate = new Date(meal.eatenAt);
        const dateKey = formatDateKey(mealDate);
        
        // Convert Meal to FoodLogEntry format for consistent handling
        const entry: FoodLogEntry = {
          id: meal.id,
          name: meal.name ?? '',
          weightG: meal.totalWeightG ?? 0,
          calories: meal.totalCalories ?? 0,
          protein: meal.totalProtein ?? 0,
          carbs: meal.totalCarbs ?? 0,
          fat: meal.totalFat ?? 0,
          source: 'MEAL', // Mark as coming from Meal table
          eatenAt: meal.eatenAt,
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
        meals: [], // Legacy stats view uses entries, not meals
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
 * Fetch user goals (with metabolic modeling fields)
 */
export async function fetchUserGoals(): Promise<UserGoals | null> {
  try {
    const { data: profiles } = await client.models.UserProfile.list();
    if (profiles && profiles.length > 0) {
      const profile = profiles[0];
      // Determine unit system - prefer new field, fall back to legacy
      const unitSystem = (profile.preferredUnitSystem as 'metric' | 'imperial') ?? 
        (profile.preferredWeightUnit === 'lbs' ? 'imperial' : 'metric');
      
      return {
        calorieGoal: profile.calorieGoal ?? 2000,
        proteinGoal: profile.proteinGoal ?? 150,
        carbsGoal: profile.carbsGoal ?? 200,
        fatGoal: profile.fatGoal ?? 65,
        targetWeightKg: profile.targetWeightKg ?? undefined,
        preferredWeightUnit: (profile.preferredWeightUnit as 'kg' | 'lbs') ?? 'kg',
        preferredUnitSystem: unitSystem,
        // Metabolic modeling fields
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

// ============================================
// Metabolic Modeling Helper Functions
// ============================================

/**
 * Fetch or create DailyLog entries for a date range
 * Aggregates FoodLog entries into daily totals
 */
export async function fetchDailyLogs(days: number = 30): Promise<DailyLog[]> {
  console.log('[statsHelpers] Fetching daily logs for', days, 'days');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - days);
  
  try {
    // Fetch food data for the range
    const weekData = await fetchWeekData(today, days);
    
    // Fetch weight data for the range
    const weightEntries = await fetchWeightHistory(days);
    
    // Create a map of date -> weight
    const weightByDate = new Map<string, number>();
    for (const entry of weightEntries) {
      const dateKey = formatDateKey(new Date(entry.recordedAt));
      weightByDate.set(dateKey, entry.weightKg);
    }
    
    // Build DailyLog entries
    const dailyLogs: DailyLog[] = weekData.map(dayData => {
      const hasEntries = dayData.summary.entries.length > 0;
      const scaleWeight = weightByDate.get(dayData.date) ?? null;
      
      // Determine log status
      let logStatus: 'complete' | 'partial' | 'skipped' = 'skipped';
      if (hasEntries) {
        logStatus = 'complete';
      }
      
      return {
        date: dayData.date,
        scaleWeightKg: scaleWeight,
        nutritionCalories: hasEntries ? dayData.summary.totalCalories : null,
        nutritionProteinG: hasEntries ? dayData.summary.totalProtein : null,
        nutritionCarbsG: hasEntries ? dayData.summary.totalCarbs : null,
        nutritionFatG: hasEntries ? dayData.summary.totalFat : null,
        stepCount: null, // Not currently tracking steps
        logStatus,
      };
    });
    
    console.log('[statsHelpers] Built', dailyLogs.length, 'daily logs');
    return dailyLogs;
  } catch (error) {
    console.error('[statsHelpers] Error fetching daily logs:', error);
    return [];
  }
}

/**
 * Fetch computed states for a date range
 * If not stored, compute them on-the-fly
 */
export async function fetchComputedStates(days: number = 30): Promise<ComputedState[]> {
  console.log('[statsHelpers] Fetching/computing states for', days, 'days');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - days);
  
  try {
    // Check if we have stored computed states
    const { data: storedStates } = await client.models.ComputedState.list({
      filter: {
        date: {
          between: [formatDateKey(startDate), formatDateKey(today)],
        },
      },
    });
    
    if (storedStates && storedStates.length > 0) {
      console.log('[statsHelpers] Found', storedStates.length, 'stored computed states');
      
      // Convert to our type
      const states: ComputedState[] = storedStates.map(s => ({
        id: s.id,
        date: s.date,
        trendWeightKg: s.trendWeightKg,
        estimatedTdeeKcal: s.estimatedTdeeKcal,
        rawTdeeKcal: s.rawTdeeKcal ?? s.estimatedTdeeKcal,
        fluxConfidenceRange: s.fluxConfidenceRange ?? 200,
        energyDensityUsed: s.energyDensityUsed ?? 7700,
        weightDeltaKg: s.weightDeltaKg ?? 0,
      }));
      
      // Sort by date
      states.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      return states;
    }
    
    // No stored states - compute on the fly
    console.log('[statsHelpers] No stored states, computing on-the-fly');
    return await computeStatesOnTheFly(days);
  } catch (error) {
    console.error('[statsHelpers] Error fetching computed states:', error);
    return [];
  }
}

/**
 * Compute states on-the-fly when no stored data exists
 */
async function computeStatesOnTheFly(days: number): Promise<ComputedState[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - days);
  
  // Get daily logs and weight entries
  const dailyLogs = await fetchDailyLogs(days);
  const weightEntries = await fetchWeightHistory(days);
  const userGoals = await fetchUserGoals();
  
  if (weightEntries.length === 0) {
    console.log('[statsHelpers] No weight data for computing states');
    return [];
  }
  
  // Calculate trend weights
  const trendData = calculateTrendWeights(weightEntries, startDate, today);
  
  // Get initial TDEE estimate
  let prevTdee = 2000; // Default
  if (userGoals && weightEntries.length > 0) {
    const coldStartTdee = calculateColdStartTdee(userGoals, weightEntries[0].weightKg);
    if (coldStartTdee) {
      prevTdee = coldStartTdee;
    }
  }
  
  // Build computed states
  const states: ComputedState[] = [];
  
  for (let i = 0; i < trendData.length; i++) {
    const point = trendData[i];
    const prevTrendWeight = i > 0 ? trendData[i - 1].trendWeight : point.trendWeight;
    const dailyLog = dailyLogs.find(d => d.date === point.date) ?? null;
    
    const state = buildComputedState(
      point.date,
      point.trendWeight,
      prevTrendWeight,
      dailyLog,
      prevTdee
    );
    
    states.push(state);
    prevTdee = state.estimatedTdeeKcal;
  }
  
  console.log('[statsHelpers] Computed', states.length, 'states on-the-fly');
  return states;
}

/**
 * Fetch weight stats with trend data included
 */
export async function fetchWeightStatsWithTrend(): Promise<WeightStatsWithTrend> {
  console.log('[statsHelpers] Fetching weight stats with trend...');
  
  const baseStats = await fetchWeightStats();
  const entries = baseStats.entries;
  
  if (entries.length === 0) {
    return {
      ...baseStats,
      trendWeight: null,
      trendData: [],
    };
  }
  
  // Calculate trend weights for all entries
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const startDate = new Date(entries[0].recordedAt);
  startDate.setHours(0, 0, 0, 0);
  
  const trendData = calculateTrendWeights(entries, startDate, today);
  const latestTrend = trendData.length > 0 
    ? trendData[trendData.length - 1].trendWeight 
    : null;
  
  console.log('[statsHelpers] Trend data calculated:', {
    points: trendData.length,
    latestTrend,
    scaleWeight: baseStats.currentWeight,
  });
  
  return {
    ...baseStats,
    trendWeight: latestTrend,
    trendData,
  };
}

/**
 * Fetch complete metabolic insights
 * This is the main entry point for the stats page
 */
export async function fetchMetabolicInsights(): Promise<MetabolicInsights | null> {
  console.log('[statsHelpers] Fetching metabolic insights...');
  
  try {
    // Fetch all required data in parallel
    // Note: We need 30 days of dailyLogs for accurate daysTracked calculation
    const [userGoals, weightStatsWithTrend, computedStates, dailyLogs30, dailyLogs7] = await Promise.all([
      fetchUserGoals(),
      fetchWeightStatsWithTrend(),
      fetchComputedStates(30),
      fetchDailyLogs(30), // Full 30 days for daysTracked calculation
      fetchDailyLogs(7), // Last 7 days for weekly check-in
    ]);
    
    if (!userGoals) {
      console.log('[statsHelpers] No user goals found');
      return null;
    }
    
    // Determine days tracked - count days where user actually logged weight OR food
    // A day is "tracked" if it has real data, not just interpolated values
    const daysTracked = dailyLogs30.filter(d => 
      d.logStatus !== 'skipped' || d.scaleWeightKg !== null
    ).length;
    const isInColdStart = daysTracked < METABOLIC_CONSTANTS.COLD_START_DAYS;
    
    // Get current TDEE
    let currentTdee = 2000; // Default
    let coldStartTdee: number | null = null;
    
    if (isInColdStart) {
      // Use Mifflin-St Jeor during cold start
      if (weightStatsWithTrend.currentWeight) {
        coldStartTdee = calculateColdStartTdee(userGoals, weightStatsWithTrend.currentWeight);
        currentTdee = coldStartTdee ?? 2000;
      }
    } else if (computedStates.length > 0) {
      // Use the most recent computed TDEE
      const latest = computedStates[computedStates.length - 1];
      currentTdee = latest.estimatedTdeeKcal;
    }
    
    // Calculate weekly weight change
    const weeklyWeightChange = getWeeklyWeightChange(weightStatsWithTrend.trendData);
    
    // Determine confidence level (use last 7 days for recent missing days)
    const recentMissingDays = dailyLogs7.filter(d => d.logStatus === 'skipped').length;
    const confidenceLevel = determineConfidenceLevel(daysTracked, recentMissingDays);
    
    // Calculate suggested calories
    const goalType = userGoals.goalType ?? 'maintain';
    const goalRate = userGoals.goalRate ?? 0.5;
    const suggestedCalories = calculateCalorieTarget(currentTdee, goalType, goalRate);
    
    // Build weekly check-in if we have enough data
    let weeklyCheckIn: WeeklyCheckIn | null = null;
    if (daysTracked >= 7) {
      const weekStart = getWeekStartDate();
      const weekEnd = getWeekEndDate();
      weeklyCheckIn = buildWeeklyCheckIn(
        weekStart,
        weekEnd,
        dailyLogs7,
        computedStates.slice(-7),
        userGoals
      );
    }
    
    const insights: MetabolicInsights = {
      currentTdee,
      trendWeight: weightStatsWithTrend.trendWeight ?? weightStatsWithTrend.currentWeight ?? 0,
      scaleWeight: weightStatsWithTrend.currentWeight,
      weeklyWeightChange,
      confidenceLevel,
      daysUntilAccurate: Math.max(0, METABOLIC_CONSTANTS.COLD_START_DAYS - daysTracked),
      daysTracked,
      suggestedCalories,
      weeklyCheckIn,
      isInColdStart,
      coldStartTdee,
    };
    
    console.log('[statsHelpers] Metabolic insights:', {
      tdee: insights.currentTdee,
      trendWeight: insights.trendWeight,
      confidence: insights.confidenceLevel,
      isInColdStart: insights.isInColdStart,
      daysTracked: insights.daysTracked,
    });
    
    return insights;
  } catch (error) {
    console.error('[statsHelpers] Error fetching metabolic insights:', error);
    return null;
  }
}

/**
 * Save a computed state to the database
 */
export async function saveComputedState(state: ComputedState): Promise<void> {
  try {
    await client.models.ComputedState.create({
      date: state.date,
      trendWeightKg: state.trendWeightKg,
      estimatedTdeeKcal: state.estimatedTdeeKcal,
      rawTdeeKcal: state.rawTdeeKcal,
      fluxConfidenceRange: state.fluxConfidenceRange,
      energyDensityUsed: state.energyDensityUsed,
      weightDeltaKg: state.weightDeltaKg,
    });
    console.log('[statsHelpers] Saved computed state for', state.date);
  } catch (error) {
    console.error('[statsHelpers] Error saving computed state:', error);
  }
}

/**
 * Save a weekly check-in to the database
 */
export async function saveWeeklyCheckIn(checkIn: WeeklyCheckIn): Promise<void> {
  try {
    await client.models.WeeklyCheckIn.create({
      weekStartDate: checkIn.weekStartDate,
      weekEndDate: checkIn.weekEndDate,
      averageTdee: checkIn.averageTdee,
      suggestedCalories: checkIn.suggestedCalories,
      adherenceScore: checkIn.adherenceScore,
      confidenceLevel: checkIn.confidenceLevel,
      trendWeightStart: checkIn.trendWeightStart,
      trendWeightEnd: checkIn.trendWeightEnd,
      weeklyWeightChange: checkIn.weeklyWeightChange,
      notes: checkIn.notes,
    });
    console.log('[statsHelpers] Saved weekly check-in for', checkIn.weekStartDate);
  } catch (error) {
    console.error('[statsHelpers] Error saving weekly check-in:', error);
  }
}
