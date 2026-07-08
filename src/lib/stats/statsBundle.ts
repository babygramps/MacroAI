/**
 * Stats Bundle
 *
 * Task 13 of the core-separation refactor ("Phase 5a"): the stats page used
 * to call five statsHelpers fetch-and-compute functions in a `Promise.all`,
 * each of which internally re-fetched the same underlying data (user goals,
 * weight history, 30-day meal data, computed states) 2-4x with no sharing -
 * netting ~100+ per-day GSI queries per page load.
 *
 * This module splits fetch (once, here) from derivation (pure, below):
 *   - `fetchStatsBundle` loads every dataset the stats page needs exactly
 *     once, in one parallel batch, and resolves the ComputedState
 *     compute-on-the-fly fallback (when no rows are stored) from that same
 *     already-fetched data - no additional fetches.
 *   - The `derive*` functions are pure: same inputs, same outputs, every
 *     time. They reproduce the pre-Task-13 statsHelpers exports' math and
 *     edge-case behavior (empty data, missing goals, etc.) exactly; see
 *     task-13-report.md for the per-helper behavioral-identity analysis.
 *
 * The six statsHelpers exports this replaces (fetchWeeklyStats,
 * fetchWeightStats, fetchWeightStatsWithTrend, fetchMetabolicInsights,
 * fetchTdeeHistory, fetchDailyLogs) had no callers besides
 * src/app/stats/page.tsx, which now calls fetchStatsBundle + these derivers
 * directly instead - so those six were deleted rather than kept as
 * per-call-refetching wrappers (see statsHelpers.ts's file header).
 */

import { getAmplifyDataClient } from '@/lib/data/amplifyClient';
import {
  listAllPages,
  fetchUserGoals as repoFetchUserGoals,
  fetchWeightHistory as repoFetchWeightHistory,
  fetchComputedStates as repoFetchComputedStates,
} from '@/lib/data/metabolicRepo';
import { formatDateKey } from '@/lib/statsHelpers';
import { calculateTrendWeights, getWeeklyWeightChange } from '@/lib/trendEngine';
import { calculateColdStartTdee, determineConfidenceLevel } from '@/lib/expenditureEngine';
import {
  buildWeeklyCheckIn,
  calculateCalorieTarget,
  getWeekStartDate,
  getWeekEndDate,
} from '@/lib/coachingEngine';
import { computeStateChain } from '@/lib/metabolic/stateChain';
import { METABOLIC_CONSTANTS } from '@/lib/types';
import type {
  DayData,
  DailySummary,
  WeeklyStats,
  WeightLogEntry,
  WeightStats,
  DailyLog,
  ComputedState,
  MetabolicInsights,
  WeightStatsWithTrend,
  TdeeDataPoint,
  UserGoals,
} from '@/lib/types';

type AmplifyClient = ReturnType<typeof getAmplifyDataClient>;

/** Widest weight-history window any deriver needs (fetchWeightStats used 90). */
const WEIGHT_HISTORY_WINDOW_DAYS = 90;

// ============================================
// The bundle
// ============================================

export interface StatsBundle {
  /** Midnight-normalized anchor date all windows are computed relative to. */
  today: Date;
  /** Requested window size (meal data + computed states); default 30. */
  days: number;
  userGoals: UserGoals | null;
  /** Widest window (90 days), ascending by recordedAt. */
  weightEntries: WeightLogEntry[];
  /** `days`-window meal aggregates, ascending by date, ending at `today`. */
  weekData: DayData[];
  /** Stored ComputedStates for `days`, or computed on-the-fly if none stored. */
  computedStates: ComputedState[];
}

/**
 * Fetch meal data for a date range and group by day.
 *
 * All meals have localDate set (backfilled via migration). Uses the
 * localDate GSI for fast, accurate per-day queries - one query PER DAY
 * (parallelized), because the GSI has no range key. This can't be
 * collapsed into fewer queries; the win from bundling is calling it once
 * for the widest window and slicing in memory instead of re-fetching it
 * per consumer (moved here from statsHelpers.ts, its only caller).
 */
async function fetchWeekData(endDate: Date, days: number): Promise<DayData[]> {
  const client = getAmplifyDataClient();
  if (!client) {
    return [];
  }

  const startDay = new Date(endDate);
  startDay.setHours(0, 0, 0, 0);
  startDay.setDate(startDay.getDate() - (days - 1));

  const dayKeys: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDay);
    d.setDate(d.getDate() + i);
    dayKeys.push(formatDateKey(d));
  }

  interface MealSummary { calories: number; protein: number; carbs: number; fat: number; }
  const mealsByDate = new Map<string, MealSummary[]>();
  for (const key of dayKeys) {
    mealsByDate.set(key, []);
  }

  try {
    const mealsByDayResults = await Promise.all(
      dayKeys.map(async (localDate) => {
        const meals = await listAllPages((nextToken) =>
          client.models.Meal.listMealByLocalDate(
            { localDate },
            nextToken ? { nextToken } : undefined,
          )
        );
        return { localDate, meals };
      })
    );

    for (const { localDate, meals } of mealsByDayResults) {
      const dayMeals = mealsByDate.get(localDate);
      if (!dayMeals) continue;
      for (const meal of meals) {
        dayMeals.push({
          calories: meal.totalCalories ?? 0,
          protein: meal.totalProtein ?? 0,
          carbs: meal.totalCarbs ?? 0,
          fat: meal.totalFat ?? 0,
        });
      }
    }

    const result: DayData[] = [];
    for (const dateKey of dayKeys) {
      const dayMeals = mealsByDate.get(dateKey) ?? [];

      const totals = dayMeals.reduce(
        (acc, m) => ({
          totalCalories: acc.totalCalories + m.calories,
          totalProtein: acc.totalProtein + m.protein,
          totalCarbs: acc.totalCarbs + m.carbs,
          totalFat: acc.totalFat + m.fat,
        }),
        { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0 }
      );

      const summary: DailySummary = {
        ...totals,
        meals: [],
        mealCount: dayMeals.length,
      };

      result.push({ date: dateKey, summary });
    }

    return result;
  } catch (error) {
    console.error('[statsBundle] Error fetching week data:', error);
    throw error;
  }
}

/** Inclusive [start, end] bounds matching statsHelpers' old fetchWeightHistory(days). */
function weightWindowBounds(anchorDay: Date, days: number): { start: Date; end: Date } {
  const end = new Date(anchorDay);
  end.setHours(23, 59, 59, 999);
  const start = new Date(anchorDay);
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

/** Filter the bundle's widest-window weightEntries down to a narrower window. */
function filterWeightEntriesToWindow(
  entries: WeightLogEntry[],
  anchorDay: Date,
  days: number
): WeightLogEntry[] {
  const { start, end } = weightWindowBounds(anchorDay, days);
  const startMs = start.getTime();
  const endMs = end.getTime();
  return entries.filter((e) => {
    const t = new Date(e.recordedAt).getTime();
    return t >= startMs && t <= endMs;
  });
}

export async function fetchStatsBundle(days: number = 30): Promise<StatsBundle> {
  const client: AmplifyClient = getAmplifyDataClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { start: weightStart, end: weightEnd } = weightWindowBounds(today, WEIGHT_HISTORY_WINDOW_DAYS);

  const startDateForStates = new Date(today);
  startDateForStates.setDate(startDateForStates.getDate() - days);

  const [userGoals, weightEntries, weekData, storedComputedStates] = await Promise.all([
    repoFetchUserGoals(client),
    repoFetchWeightHistory(weightStart, weightEnd, client),
    fetchWeekData(today, days),
    // Isolated like the old fetchComputedStates: a query error here resolves
    // to [] without touching (or being blocked by) the other three fetches.
    (async (): Promise<ComputedState[] | null> => {
      try {
        return await repoFetchComputedStates(
          formatDateKey(startDateForStates),
          formatDateKey(today),
          client
        );
      } catch (error) {
        console.error('[statsBundle] Error fetching computed states:', error);
        return null;
      }
    })(),
  ]);

  let computedStates: ComputedState[];
  if (storedComputedStates === null) {
    computedStates = [];
  } else if (storedComputedStates.length > 0) {
    computedStates = storedComputedStates;
  } else {
    try {
      computedStates = computeStatesOnTheFlyFromBundle({ today, days, weekData, weightEntries, userGoals });
    } catch (error) {
      console.error('[statsBundle] Error computing states on-the-fly:', error);
      computedStates = [];
    }
  }

  return { today, days, userGoals, weightEntries, weekData, computedStates };
}

// ============================================
// Pure helpers (moved from statsHelpers.ts - reused, not duplicated)
// ============================================

/**
 * Calculate weekly averages from DayData array. Only counts days that have
 * at least one entry. Verbatim port of statsHelpers.calculateAverages.
 */
export function calculateAverages(weekData: DayData[]): WeeklyStats['averages'] {
  const daysWithData = weekData.filter((d) => d.summary.mealCount > 0);

  if (daysWithData.length === 0) {
    return { calories: 0, protein: 0, carbs: 0, fat: 0 };
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
 * Calculate weight change over a period. Returns the difference between the
 * most recent entry and the oldest entry within the period. Verbatim port
 * of statsHelpers.calculateWeightChange.
 */
export function calculateWeightChange(entries: WeightLogEntry[], days: number): number | null {
  if (entries.length < 2) {
    return null;
  }

  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const recentEntries = entries.filter(
    (e) => new Date(e.recordedAt).getTime() >= cutoffDate.getTime()
  );

  if (recentEntries.length < 2) {
    const current = entries[entries.length - 1];
    const oldest = entries[0];
    return Math.round((current.weightKg - oldest.weightKg) * 10) / 10;
  }

  const current = recentEntries[recentEntries.length - 1];
  const oldest = recentEntries[0];

  return Math.round((current.weightKg - oldest.weightKg) * 10) / 10;
}

/**
 * Consecutive day streak counted back from the end of `weekData` ("today").
 * A day counts as logged if it has at least one meal entry; today is
 * allowed to have no entries yet without breaking the streak. Pure
 * extraction of the loop inside statsHelpers.calculateStreakEfficient
 * (which fetched its own 30-day window); here the window is supplied.
 */
export function calculateStreakFromWeekData(weekData: DayData[]): number {
  const daysReversed = [...weekData].reverse();

  let streak = 0;
  let skipToday = true;

  for (const dayData of daysReversed) {
    const hasEntries = dayData.summary.mealCount > 0;

    if (skipToday) {
      skipToday = false;
      if (!hasEntries) {
        continue;
      }
    }

    if (hasEntries) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Build DailyLog entries by merging meal aggregates with same-day scale
 * weight. Pure port of the body of statsHelpers.fetchDailyLogs (sans the
 * fetches - weekData/weightEntries now arrive as already-fetched bundle
 * slices).
 */
function buildDailyLogs(weekData: DayData[], weightEntries: WeightLogEntry[]): DailyLog[] {
  const weightByDate = new Map<string, number>();
  for (const entry of weightEntries) {
    weightByDate.set(formatDateKey(new Date(entry.recordedAt)), entry.weightKg);
  }

  return weekData.map((dayData) => {
    const hasEntries = dayData.summary.mealCount > 0;
    const scaleWeight = weightByDate.get(dayData.date) ?? null;

    return {
      date: dayData.date,
      scaleWeightKg: scaleWeight,
      nutritionCalories: hasEntries ? dayData.summary.totalCalories : null,
      nutritionProteinG: hasEntries ? dayData.summary.totalProtein : null,
      nutritionCarbsG: hasEntries ? dayData.summary.totalCarbs : null,
      nutritionFatG: hasEntries ? dayData.summary.totalFat : null,
      stepCount: null,
      logStatus: hasEntries ? 'complete' : 'skipped',
    };
  });
}

/** Slice the last `days` entries of the bundle's `days`-window weekData. */
function weekDataForWindow(bundle: StatsBundle, days: number): DayData[] {
  if (days >= bundle.weekData.length) {
    return bundle.weekData;
  }
  return bundle.weekData.slice(bundle.weekData.length - days);
}

// ============================================
// computeStatesOnTheFly, from already-fetched bundle data (no fetches)
// ============================================

export interface ComputeStatesOnTheFlyInput {
  today: Date;
  days: number;
  weekData: DayData[];
  /** Widest-window (or already-windowed) entries; filtered internally to `days`. */
  weightEntries: WeightLogEntry[];
  userGoals: UserGoals | null;
}

/**
 * Compute ComputedStates on-the-fly when no stored rows exist, from data the
 * bundle already fetched - zero additional fetches. Pure port of
 * statsHelpers.computeStatesOnTheFly; only the two fetches that function did
 * (fetchDailyLogs(days), a second fetchWeightHistory(days)) are replaced by
 * filtering the bundle's already-fetched arrays down to the same window.
 */
export function computeStatesOnTheFlyFromBundle(input: ComputeStatesOnTheFlyInput): ComputedState[] {
  const { today, days, weekData, weightEntries, userGoals } = input;

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - days);

  const windowedWeightEntries = filterWeightEntriesToWindow(weightEntries, today, days);

  if (windowedWeightEntries.length === 0) {
    return [];
  }

  const trendData = calculateTrendWeights(windowedWeightEntries, startDate, today);

  let prevTdee = 2000;
  if (userGoals) {
    const coldStartTdee = calculateColdStartTdee(userGoals, windowedWeightEntries[0].weightKg);
    if (coldStartTdee) {
      prevTdee = coldStartTdee;
    }
  }

  const dailyLogs = buildDailyLogs(weekData, windowedWeightEntries);
  const dailyLogsByDate = new Map<string, DailyLog>();
  for (const dailyLog of dailyLogs) {
    dailyLogsByDate.set(dailyLog.date, dailyLog);
  }

  return computeStateChain({ trendData, dailyLogsByDate, initialTdee: prevTdee });
}

// ============================================
// Derivers (pure: bundle in, statsHelpers-shaped result out)
// ============================================

/** Equivalent of the old statsHelpers.fetchWeeklyStats(), from the bundle. */
export function deriveWeeklyStats(bundle: StatsBundle): WeeklyStats {
  const days = weekDataForWindow(bundle, 7);
  const averages = calculateAverages(days);
  // Matches the original: the streak always used a fixed 30-day window
  // (calculateStreakEfficient ignored fetchWeeklyStats' own endDate/days),
  // which is exactly bundle.weekData when fetchStatsBundle's default (30)
  // is used - the only way this is ever called.
  const streak = calculateStreakFromWeekData(bundle.weekData);

  return { days, averages, streak };
}

/** Equivalent of the old statsHelpers.fetchWeightStats(), from the bundle. */
export function deriveWeightStats(bundle: StatsBundle): WeightStats {
  const entries = bundle.weightEntries;
  const latestEntry = entries.length > 0 ? entries[entries.length - 1] : null;
  const currentWeight = latestEntry?.weightKg ?? null;

  const changeFromWeekAgo = calculateWeightChange(entries, 7);
  const changeFromMonthAgo = calculateWeightChange(entries, 30);

  return { entries, currentWeight, changeFromWeekAgo, changeFromMonthAgo };
}

/** Equivalent of the old statsHelpers.fetchWeightStatsWithTrend(), from the bundle. */
export function deriveWeightStatsWithTrend(bundle: StatsBundle): WeightStatsWithTrend {
  const baseStats = deriveWeightStats(bundle);
  const entries = baseStats.entries;

  if (entries.length === 0) {
    return {
      ...baseStats,
      trendWeight: null,
      trendData: [],
      trendChangeFromWeekAgo: null,
    };
  }

  const startDate = new Date(entries[0].recordedAt);
  startDate.setHours(0, 0, 0, 0);

  const trendData = calculateTrendWeights(entries, startDate, bundle.today);
  const latestTrend = trendData.length > 0 ? trendData[trendData.length - 1].trendWeight : null;
  const trendChangeFromWeekAgo = getWeeklyWeightChange(trendData);

  return {
    ...baseStats,
    trendWeight: latestTrend,
    trendData,
    trendChangeFromWeekAgo,
  };
}

/**
 * Equivalent of the old statsHelpers.fetchDailyLogs(days), from the bundle.
 * `days` must be <= bundle.days (the bundle's own meal-data window); the
 * stats page only ever needs 7 and 30 out of a 30-day bundle.
 */
export function deriveDailyLogs(bundle: StatsBundle, days: number): DailyLog[] {
  const weekData = weekDataForWindow(bundle, days);
  const weightEntries = filterWeightEntriesToWindow(bundle.weightEntries, bundle.today, days);
  return buildDailyLogs(weekData, weightEntries);
}

/** Equivalent of the old statsHelpers.fetchTdeeHistory(days), from the bundle. */
export function deriveTdeeHistory(bundle: StatsBundle): TdeeDataPoint[] {
  const computedStates = bundle.computedStates;

  if (computedStates.length === 0) {
    return [];
  }

  return computedStates.map((state) => ({
    date: state.date,
    rawTdee: state.rawTdeeKcal !== state.estimatedTdeeKcal ? state.rawTdeeKcal : null,
    smoothedTdee: state.estimatedTdeeKcal,
    fluxConfidenceRange: state.fluxConfidenceRange,
  }));
}

/** Equivalent of the old statsHelpers.fetchMetabolicInsights(), from the bundle. */
export function deriveMetabolicInsights(bundle: StatsBundle): MetabolicInsights | null {
  const userGoals = bundle.userGoals;
  if (!userGoals) {
    return null;
  }

  const weightStatsWithTrend = deriveWeightStatsWithTrend(bundle);
  const computedStates = bundle.computedStates;
  const dailyLogs30 = deriveDailyLogs(bundle, 30);
  const dailyLogs7 = deriveDailyLogs(bundle, 7);

  const daysTracked = dailyLogs30.filter(
    (d) => d.logStatus !== 'skipped' || d.scaleWeightKg !== null
  ).length;
  const isInColdStart = daysTracked < METABOLIC_CONSTANTS.COLD_START_DAYS;

  let currentTdee = 2000;
  let coldStartTdee: number | null = null;

  if (isInColdStart) {
    if (weightStatsWithTrend.currentWeight) {
      coldStartTdee = calculateColdStartTdee(userGoals, weightStatsWithTrend.currentWeight);
      currentTdee = coldStartTdee ?? 2000;
    }
  } else if (computedStates.length > 0) {
    const latest = computedStates[computedStates.length - 1];
    currentTdee = latest.estimatedTdeeKcal;
  }

  const weeklyWeightChange = getWeeklyWeightChange(weightStatsWithTrend.trendData);

  const recentMissingDays = dailyLogs7.filter((d) => d.logStatus === 'skipped').length;
  const confidenceLevel = determineConfidenceLevel(daysTracked, recentMissingDays);

  const goalType = userGoals.goalType ?? 'maintain';
  const goalRate = userGoals.goalRate ?? 0.5;
  const suggestedCalories = calculateCalorieTarget(currentTdee, goalType, goalRate);

  let weeklyCheckIn: MetabolicInsights['weeklyCheckIn'] = null;
  if (daysTracked >= 7) {
    const weekStart = getWeekStartDate();
    const weekEnd = getWeekEndDate();
    weeklyCheckIn = buildWeeklyCheckIn(
      weekStart,
      weekEnd,
      dailyLogs7,
      computedStates.slice(-7),
      userGoals,
      currentTdee
    );
  }

  const latestFlux = computedStates.length > 0
    ? computedStates[computedStates.length - 1].fluxConfidenceRange
    : 500;

  return {
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
    fluxConfidenceRange: latestFlux,
  };
}
