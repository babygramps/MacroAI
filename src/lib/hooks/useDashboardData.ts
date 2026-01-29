import { useCallback, useEffect, useRef, useState } from 'react';
import type { DailySummary, UserGoals, WeightLogEntry, LogStatus, MealEntry } from '@/lib/types';
import { DEFAULT_GOALS, fetchDashboardData } from '@/lib/data/dashboard';
import { backfillMetabolicData } from '@/lib/metabolicService';
import { getAmplifyDataClient } from '@/lib/data/amplifyClient';
import { logError } from '@/lib/logger';
import { fetchDayStatus, fetchDayStatusRange } from '@/actions/updateDayStatus';

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
  addMeal: (meal: MealEntry) => void;
}

const EMPTY_SUMMARY: DailySummary = {
  totalCalories: 0,
  totalProtein: 0,
  totalCarbs: 0,
  totalFat: 0,
  meals: [],
  entries: [],
};

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
  const [dayStatus, setDayStatus] = useState<LogStatus | null>(null);
  const [dayStatusMap, setDayStatusMap] = useState<Map<string, LogStatus>>(new Map());
  const hasLoadedRef = useRef(false);
  const backfillCheckedRef = useRef(false);
  const statusMapLoadedRef = useRef(false);

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
    if (shouldShowLoading) {
      setIsLoading(true);
    }
    try {
      const [data, status] = await Promise.all([
        fetchDashboardData(selectedDate),
        fetchDayStatus(selectedDate),
      ]);
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

  // Optimistic update for adding a meal
  const addMeal = useCallback((meal: MealEntry) => {
    setSummary((prev) => {
      const newMeals = [meal, ...prev.meals];
      // Sort by eatenAt descending
      newMeals.sort((a, b) => new Date(b.eatenAt).getTime() - new Date(a.eatenAt).getTime());

      return {
        ...prev,
        meals: newMeals,
        totalCalories: prev.totalCalories + meal.totalCalories,
        totalProtein: prev.totalProtein + meal.totalProtein,
        totalCarbs: prev.totalCarbs + meal.totalCarbs,
        totalFat: prev.totalFat + meal.totalFat,
      };
    });
  }, []);

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
    addMeal,
  };
}
