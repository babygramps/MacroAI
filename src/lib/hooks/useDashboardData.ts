import { useCallback, useEffect, useRef, useState } from 'react';
import type { DailySummary, UserGoals, WeightLogEntry, LogStatus, MealEntry, MealSyncStatus } from '@/lib/types';
import { DEFAULT_GOALS, fetchDashboardData, calculateDailyTotals } from '@/lib/data/dashboard';
import { backfillMetabolicData } from '@/lib/metabolicService';
import { getAmplifyDataClient } from '@/lib/data/amplifyClient';
import { logError } from '@/lib/logger';
import { logRemote, getErrorContext } from '@/lib/clientLogger';
import { fetchDayStatus, fetchDayStatusRange } from '@/actions/updateDayStatus';

export type OptimisticMealStatus = 'pending' | 'confirmed';

interface OptimisticEntry {
  meal: MealEntry;
  addedAt: number;
  status: OptimisticMealStatus;
}

interface UseDashboardDataResult {
  goals: UserGoals;
  summary: DailySummary;
  latestWeight: WeightLogEntry | null;
  needsOnboarding: boolean;
  isLoading: boolean;
  dayStatus: LogStatus | null;
  dayStatusMap: Map<string, LogStatus>;
  refresh: () => Promise<void>;
  updateDayStatus: (status: LogStatus) => void;
  setSummary: React.Dispatch<React.SetStateAction<DailySummary>>;
  addOptimisticMeal: (meal: MealEntry, status?: OptimisticMealStatus) => void;
  confirmOptimisticMeal: (mealId: string) => void;
  getOptimisticStatus: (mealId: string) => OptimisticMealStatus | null;
}

const EMPTY_SUMMARY: DailySummary = {
  totalCalories: 0,
  totalProtein: 0,
  totalCarbs: 0,
  totalFat: 0,
  meals: [],
  entries: [],
};

const OPTIMISTIC_TTL_MS = 2 * 60 * 1000;
const OPTIMISTIC_STORAGE_KEY = 'macroai_optimistic_meals';

// Persist optimistic meals to localStorage so they survive page refresh
function saveOptimisticToStorage(entries: Map<string, OptimisticEntry>): void {
  if (typeof window === 'undefined') return;
  try {
    const serializable = Array.from(entries.entries());
    localStorage.setItem(OPTIMISTIC_STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // localStorage might be full or disabled
  }
}

function loadOptimisticFromStorage(): Map<string, OptimisticEntry> {
  if (typeof window === 'undefined') return new Map();
  try {
    const stored = localStorage.getItem(OPTIMISTIC_STORAGE_KEY);
    if (!stored) return new Map();
    const parsed: [string, OptimisticEntry][] = JSON.parse(stored);
    const nowMs = Date.now();
    // Filter out expired entries on load
    const valid = parsed.filter(([, entry]) => nowMs - entry.addedAt <= OPTIMISTIC_TTL_MS);
    if (valid.length !== parsed.length) {
      // Some expired, update storage
      localStorage.setItem(OPTIMISTIC_STORAGE_KEY, JSON.stringify(valid));
    }
    return new Map(valid);
  } catch {
    return new Map();
  }
}

// Helper to format date to YYYY-MM-DD
function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateBoundsMs(date: Date): { startMs: number; endMs: number } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

function mergeOptimisticMeals(
  summary: DailySummary,
  selectedDate: Date,
  optimisticMealsRef: React.MutableRefObject<Map<string, OptimisticEntry>>
): DailySummary {
  if (optimisticMealsRef.current.size === 0) {
    return summary;
  }

  const nowMs = Date.now();
  const { startMs, endMs } = getDateBoundsMs(selectedDate);
  const fetchedMealIds = new Set(summary.meals.map((meal) => meal.id));
  const optimisticMeals: MealEntry[] = [];

  let storageNeedsUpdate = false;

  for (const [mealId, entry] of optimisticMealsRef.current.entries()) {
    const ageMs = nowMs - entry.addedAt;
    if (ageMs > OPTIMISTIC_TTL_MS) {
      optimisticMealsRef.current.delete(mealId);
      storageNeedsUpdate = true;
      logRemote.info('DASHBOARD_OPTIMISTIC_EXPIRED', { mealId, ageMs });
      continue;
    }

    if (fetchedMealIds.has(mealId)) {
      optimisticMealsRef.current.delete(mealId);
      storageNeedsUpdate = true;
      logRemote.info('DASHBOARD_OPTIMISTIC_SYNCED', { mealId });
      continue;
    }

    const eatenAtMs = new Date(entry.meal.eatenAt).getTime();
    if (eatenAtMs >= startMs && eatenAtMs < endMs) {
      // Attach syncStatus based on optimistic entry status
      const syncStatus: MealSyncStatus = entry.status === 'confirmed' ? 'confirmed' : 'pending';
      optimisticMeals.push({ ...entry.meal, syncStatus });
    }
  }

  // Persist changes to localStorage
  if (storageNeedsUpdate) {
    saveOptimisticToStorage(optimisticMealsRef.current);
  }

  if (optimisticMeals.length === 0) {
    return summary;
  }

  const mergedMeals = [...summary.meals, ...optimisticMeals];
  mergedMeals.sort((a, b) => new Date(b.eatenAt).getTime() - new Date(a.eatenAt).getTime());

  logRemote.info('DASHBOARD_OPTIMISTIC_MERGE', {
    mergedCount: optimisticMeals.length,
    mealIds: optimisticMeals.map((meal) => meal.id),
  });

  return calculateDailyTotals(mergedMeals);
}

export function useDashboardData(selectedDate: Date): UseDashboardDataResult {
  const [goals, setGoals] = useState<UserGoals>(DEFAULT_GOALS);
  const [summary, setSummary] = useState<DailySummary>(EMPTY_SUMMARY);
  const [latestWeight, setLatestWeight] = useState<WeightLogEntry | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [dayStatus, setDayStatus] = useState<LogStatus | null>(null);
  const [dayStatusMap, setDayStatusMap] = useState<Map<string, LogStatus>>(new Map());
  const hasLoadedRef = useRef(false);
  const backfillCheckedRef = useRef(false);
  const statusMapLoadedRef = useRef(false);
  const optimisticInitializedRef = useRef(false);
  const optimisticMealsRef = useRef<Map<string, OptimisticEntry>>(new Map());

  // Initialize optimistic store from localStorage on first render (client-side only)
  useEffect(() => {
    if (optimisticInitializedRef.current) return;
    optimisticInitializedRef.current = true;
    const stored = loadOptimisticFromStorage();
    if (stored.size > 0) {
      optimisticMealsRef.current = stored;
      logRemote.info('DASHBOARD_OPTIMISTIC_RESTORED', { count: stored.size, mealIds: Array.from(stored.keys()) });
    }
  }, []);

  const addOptimisticMeal = useCallback((meal: MealEntry, status: OptimisticMealStatus = 'pending') => {
    optimisticMealsRef.current.set(meal.id, {
      meal,
      addedAt: Date.now(),
      status,
    });
    saveOptimisticToStorage(optimisticMealsRef.current);
    logRemote.info('DASHBOARD_OPTIMISTIC_STORED', { mealId: meal.id, status });
  }, []);

  const confirmOptimisticMeal = useCallback((mealId: string) => {
    const entry = optimisticMealsRef.current.get(mealId);
    if (entry && entry.status === 'pending') {
      optimisticMealsRef.current.set(mealId, {
        ...entry,
        status: 'confirmed',
      });
      saveOptimisticToStorage(optimisticMealsRef.current);
      logRemote.info('DASHBOARD_OPTIMISTIC_CONFIRMED', { mealId });
    }
  }, []);

  const getOptimisticStatus = useCallback((mealId: string): OptimisticMealStatus | null => {
    const entry = optimisticMealsRef.current.get(mealId);
    return entry ? entry.status : null;
  }, []);

  // One-time auto-backfill for existing users who don't have ComputedState data yet
  useEffect(() => {
    if (backfillCheckedRef.current) return;
    backfillCheckedRef.current = true;

    const checkAndBackfill = async () => {
      try {
        const client = getAmplifyDataClient();
        if (!client) return;

        // Check if user has any ComputedState records
        const { data: existingStates } = await client.models.ComputedState.list({
          limit: 1,
        });

        // If no computed states exist, run backfill silently
        if (!existingStates || existingStates.length === 0) {
          await backfillMetabolicData(90);
        }
      } catch (error) {
        // Silently fail - this is a background optimization, not critical
        logError('Auto-backfill check failed', { error });
      }
    };

    checkAndBackfill();
  }, []);

  const refresh = useCallback(async () => {
    const shouldShowLoading = !hasLoadedRef.current;
    const dateStr = formatDateKey(selectedDate);
    const startTime = Date.now();

    logRemote.info('FETCH_DASHBOARD_START', { date: dateStr, isFirstLoad: shouldShowLoading });

    if (shouldShowLoading) {
      setIsLoading(true);
    }

    // Helper function for the actual fetch
    const doFetch = async () => {
      const [data, status] = await Promise.all([
        fetchDashboardData(selectedDate),
        fetchDayStatus(selectedDate),
      ]);
      return { data, status };
    };

    try {
      let result: { data: Awaited<ReturnType<typeof fetchDashboardData>>; status: LogStatus | null };

      try {
        result = await doFetch();
      } catch (firstError) {
        // First attempt failed, retry after a short delay
        logRemote.warn('FETCH_DASHBOARD_RETRY', {
          date: dateStr,
          durationMs: Date.now() - startTime,
          ...getErrorContext(firstError),
        });
        await new Promise(r => setTimeout(r, 500));
        result = await doFetch();
      }

      const { data, status } = result;

      logRemote.info('FETCH_DASHBOARD_RESULT', {
        date: dateStr,
        durationMs: Date.now() - startTime,
        mealCount: data.summary.meals.length,
        mealIds: data.summary.meals.map(m => m.id),
        totalCalories: data.summary.totalCalories,
      });

      setGoals(data.goals);
      const mergedSummary = mergeOptimisticMeals(data.summary, selectedDate, optimisticMealsRef);
      setSummary(mergedSummary);
      setLatestWeight(data.latestWeight);
      setNeedsOnboarding(data.needsOnboarding);
      setDayStatus(status);

      // Update the status map for the current day
      if (status) {
        setDayStatusMap(prev => {
          const next = new Map(prev);
          next.set(formatDateKey(selectedDate), status);
          return next;
        });
      }
    } catch (error) {
      logRemote.error('FETCH_DASHBOARD_ERROR', {
        date: dateStr,
        durationMs: Date.now() - startTime,
        ...getErrorContext(error),
      });
      logError('Error fetching dashboard data', { error });
    } finally {
      if (shouldShowLoading) {
        setIsLoading(false);
      }
      hasLoadedRef.current = true;
    }
  }, [selectedDate]);

  // Callback to update day status locally (optimistic update)
  const updateDayStatusLocal = useCallback((status: LogStatus) => {
    setDayStatus(status);
    setDayStatusMap(prev => {
      const next = new Map(prev);
      next.set(formatDateKey(selectedDate), status);
      return next;
    });
  }, [selectedDate]);

  // Load status map for the visible month range (once)
  useEffect(() => {
    if (statusMapLoadedRef.current) return;
    statusMapLoadedRef.current = true;

    const loadStatusMap = async () => {
      try {
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 60); // Load last 60 days

        const statuses = await fetchDayStatusRange(startDate, today);
        if (statuses.size > 0) {
          setDayStatusMap(statuses);
        }
      } catch (error) {
        logError('Error loading day status map', { error });
      }
    };

    loadStatusMap();
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    goals,
    summary,
    latestWeight,
    needsOnboarding,
    isLoading,
    dayStatus,
    dayStatusMap,
    refresh,
    updateDayStatus: updateDayStatusLocal,
    setSummary,
    addOptimisticMeal,
    confirmOptimisticMeal,
    getOptimisticStatus,
  };
}
