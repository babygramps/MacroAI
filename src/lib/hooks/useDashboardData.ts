import { useCallback, useEffect, useRef, useState } from 'react';
import type { DailySummary, UserGoals, WeightLogEntry } from '@/lib/types';
import { DEFAULT_GOALS, fetchDashboardData } from '@/lib/data/dashboard';
import { backfillMetabolicData } from '@/lib/metabolicService';
import { getAmplifyDataClient } from '@/lib/data/amplifyClient';
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
  const hasLoadedRef = useRef(false);
  const backfillCheckedRef = useRef(false);

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
      const data = await fetchDashboardData(selectedDate);
      setGoals(data.goals);
      setSummary(data.summary);
      setLatestWeight(data.latestWeight);
      setNeedsOnboarding(data.needsOnboarding);
    } catch (error) {
      logError('Error fetching dashboard data', { error });
    } finally {
      if (shouldShowLoading) {
        setIsLoading(false);
      }
      hasLoadedRef.current = true;
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
