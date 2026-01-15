import { useCallback, useEffect, useState } from 'react';
import type { DailySummary, UserGoals, WeightLogEntry } from '@/lib/types';
import { DEFAULT_GOALS, fetchDashboardData } from '@/lib/data/dashboard';
import { logError } from '@/lib/logger';

interface UseDashboardDataResult {
  goals: UserGoals;
  summary: DailySummary;
  latestWeight: WeightLogEntry | null;
  needsOnboarding: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const EMPTY_SUMMARY: DailySummary = {
  totalCalories: 0,
  totalProtein: 0,
  totalCarbs: 0,
  totalFat: 0,
  meals: [],
  entries: [],
};

export function useDashboardData(selectedDate: Date): UseDashboardDataResult {
  const [goals, setGoals] = useState<UserGoals>(DEFAULT_GOALS);
  const [summary, setSummary] = useState<DailySummary>(EMPTY_SUMMARY);
  const [latestWeight, setLatestWeight] = useState<WeightLogEntry | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchDashboardData(selectedDate);
      setGoals(data.goals);
      setSummary(data.summary);
      setLatestWeight(data.latestWeight);
      setNeedsOnboarding(data.needsOnboarding);
    } catch (error) {
      logError('Error fetching dashboard data', { error });
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    goals,
    summary,
    latestWeight,
    needsOnboarding,
    isLoading,
    refresh,
  };
}
