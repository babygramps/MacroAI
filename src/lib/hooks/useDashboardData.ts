import { useCallback, useEffect, useRef, useState } from 'react';
import type { DailySummary, UserGoals, WeightLogEntry, LogStatus } from '@/lib/types';
import { DEFAULT_GOALS, fetchDashboardData } from '@/lib/data/dashboard';
import { backfillMetabolicData } from '@/lib/metabolicService';
import { getAmplifyDataClient } from '@/lib/data/amplifyClient';
import { logError } from '@/lib/logger';
import { logRemote, getErrorContext } from '@/lib/clientLogger';
import { fetchDayStatus, fetchDayStatusRange } from '@/actions/updateDayStatus';

interface UseDashboardDataResult {
  goals: UserGoals;
  summary: DailySummary;
  latestWeight: WeightLogEntry | null;
  needsOnboarding: boolean;
  isLoading: boolean;
  isSyncing: boolean;
  dayStatus: LogStatus | null;
  dayStatusMap: Map<string, LogStatus>;
  refresh: () => Promise<void>;
  updateDayStatus: (status: LogStatus) => void;
}

const EMPTY_SUMMARY: DailySummary = {
  totalCalories: 0,
  totalProtein: 0,
  totalCarbs: 0,
  totalFat: 0,
  meals: [],
  entries: [],
};

// Clear any stale optimistic data from previous versions
const OPTIMISTIC_STORAGE_KEY = 'macroai_optimistic_meals';
function clearLegacyOptimisticStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const stored = localStorage.getItem(OPTIMISTIC_STORAGE_KEY);
    if (stored) {
      localStorage.removeItem(OPTIMISTIC_STORAGE_KEY);
      logRemote.info('DASHBOARD_LEGACY_OPTIMISTIC_CLEARED', {});
    }
  } catch {
    // Ignore errors
  }
}

// Helper to format date to YYYY-MM-DD
function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function useDashboardData(selectedDate: Date): UseDashboardDataResult {
  const [goals, setGoals] = useState<UserGoals>(DEFAULT_GOALS);
  const [summary, setSummary] = useState<DailySummary>(EMPTY_SUMMARY);
  const [latestWeight, setLatestWeight] = useState<WeightLogEntry | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dayStatus, setDayStatus] = useState<LogStatus | null>(null);
  const [dayStatusMap, setDayStatusMap] = useState<Map<string, LogStatus>>(new Map());
  const hasLoadedRef = useRef(false);
  const backfillCheckedRef = useRef(false);
  const statusMapLoadedRef = useRef(false);
  const legacyClearedRef = useRef(false);

  // Clear any stale optimistic data from previous version on first render
  useEffect(() => {
    if (legacyClearedRef.current) return;
    legacyClearedRef.current = true;
    clearLegacyOptimisticStorage();
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
    const now = new Date();

    logRemote.info('FETCH_DASHBOARD_START', {
      date: dateStr,
      isFirstLoad: shouldShowLoading,
      selectedDate: selectedDate.toISOString(),
      now: now.toISOString(),
      timezoneOffsetMinutes: now.getTimezoneOffset(),
      locale: typeof navigator !== 'undefined' ? navigator.language : undefined,
    });

    if (shouldShowLoading) {
      setIsLoading(true);
    } else {
      // Show syncing indicator for background refreshes
      setIsSyncing(true);
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
        localDayStart: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0).toISOString(),
        localDayEnd: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59).toISOString(),
      });

      setGoals(data.goals);
      setSummary(data.summary);
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
      } else {
        setIsSyncing(false);
      }
      hasLoadedRef.current = true;
    }
  }, [selectedDate]);

  // Callback to update day status locally (optimistic update for day status only)
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
    isSyncing,
    dayStatus,
    dayStatusMap,
    refresh,
    updateDayStatus: updateDayStatusLocal,
  };
}
