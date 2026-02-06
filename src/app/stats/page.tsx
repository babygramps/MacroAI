'use client';

import { useState, useEffect, useCallback } from 'react';
import { StatsHeroCard, StatsHeroCardSkeleton } from '@/components/ui/StatsHeroCard';
import { WeightJourneyCard, WeightJourneyCardSkeleton } from '@/components/ui/WeightJourneyCard';
import { WeeklyNutritionCard, WeeklyNutritionCardSkeleton } from '@/components/ui/WeeklyNutritionCard';
import { WeightLogModal } from '@/components/WeightLogModal';
import { FoodLogModal } from '@/components/FoodLogModal';
import { AppHeader } from '@/components/ui/AppHeader';
import { BottomNav } from '@/components/ui/BottomNav';
import {
  fetchWeeklyStats,
  fetchUserGoals,
  fetchWeightStatsWithTrend,
  fetchMetabolicInsights,
  fetchTdeeHistory,
} from '@/lib/statsHelpers';
import { METABOLIC_CONSTANTS } from '@/lib/types';
import type { WeeklyStats, UserGoals, WeightStatsWithTrend, MetabolicInsights, TdeeDataPoint } from '@/lib/types';

export default function StatsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<WeeklyStats | null>(null);
  const [goals, setGoals] = useState<UserGoals | null>(null);
  const [weightStats, setWeightStats] = useState<WeightStatsWithTrend | null>(null);
  const [metabolicInsights, setMetabolicInsights] = useState<MetabolicInsights | null>(null);
  const [tdeeHistory, setTdeeHistory] = useState<TdeeDataPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isFoodModalOpen, setIsFoodModalOpen] = useState(false);

  const loadStats = useCallback(async () => {
    console.log('[StatsPage] Loading stats...');
    try {
      const [weeklyStats, userGoals, weightData, insights, tdeeData] = await Promise.all([
        fetchWeeklyStats(),
        fetchUserGoals(),
        fetchWeightStatsWithTrend(),
        fetchMetabolicInsights(),
        fetchTdeeHistory(30),
      ]);

      console.log('[StatsPage] Stats loaded:', {
        daysCount: weeklyStats.days.length,
        streak: weeklyStats.streak,
        averages: weeklyStats.averages,
        weightEntries: weightData.entries.length,
        currentWeight: weightData.currentWeight,
        trendWeight: weightData.trendWeight,
        metabolicInsights: insights ? {
          tdee: insights.currentTdee,
          confidence: insights.confidenceLevel,
          isInColdStart: insights.isInColdStart,
        } : null,
      });

      setStats(weeklyStats);
      setGoals(userGoals);
      setWeightStats(weightData);
      setMetabolicInsights(insights);
      setTdeeHistory(tdeeData);
    } catch (err) {
      console.error('[StatsPage] Error loading stats:', err);
      setError('Failed to load statistics. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleWeightLogSuccess = () => {
    setIsWeightModalOpen(false);
    loadStats();
  };

  // Determine weight unit from unit system (new) or legacy field
  const preferredUnit = goals?.preferredUnitSystem === 'imperial'
    ? 'lbs'
    : goals?.preferredWeightUnit || 'kg';

  // Derived values for components
  const targetCalories = metabolicInsights?.suggestedCalories ?? goals?.calorieGoal ?? 2000;
  const tdee = metabolicInsights?.currentTdee ?? goals?.calorieGoal ?? 2000;
  const isInColdStart = metabolicInsights?.isInColdStart ?? true;

  return (
    <div className="page-container-compact">
      <AppHeader
        title="Statistics"
        showBack
        showSettings
      />

      {/* Main Content */}
      <main className="content-wrapper py-6 space-y-4">
        {error ? (
          <div className="card text-center py-8">
            <p className="text-red-500 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="btn-secondary"
            >
              Retry
            </button>
          </div>
        ) : isLoading ? (
          /* Loading State */
          <>
            <StatsHeroCardSkeleton />
            <WeightJourneyCardSkeleton />
            <WeeklyNutritionCardSkeleton />
          </>
        ) : (
          /* Loaded State */
          <>
            {/* Hero Card - Today's Snapshot */}
            <StatsHeroCard
              targetCalories={targetCalories}
              tdee={tdee}
              streak={stats?.streak ?? 0}
              confidenceLevel={metabolicInsights?.confidenceLevel ?? 'learning'}
              isInColdStart={isInColdStart}
              coldStartProgress={isInColdStart ? {
                daysTracked: metabolicInsights?.daysTracked ?? 0,
                daysRequired: METABOLIC_CONSTANTS.COLD_START_DAYS,
              } : undefined}
              goalType={goals?.goalType}
            />

            {/* Weight Journey Card (Merged with Insights) */}
            <WeightJourneyCard
              // Weight Stats
              trendWeight={weightStats?.trendWeight ?? null}
              scaleWeight={weightStats?.currentWeight ?? null}
              weeklyTrendChange={weightStats?.trendChangeFromWeekAgo ?? null}
              targetWeight={goals?.targetWeightKg ?? null}
              entries={weightStats?.entries ?? []}
              trendData={weightStats?.trendData ?? []}
              unit={preferredUnit}

              // Insights Stats
              goalType={goals?.goalType ?? 'maintain'}
              goalRate={goals?.goalRate ?? null}
              adherenceScore={metabolicInsights?.weeklyCheckIn?.adherenceScore ?? null}
              weeklyCheckIn={metabolicInsights?.weeklyCheckIn ?? null}
              tdeeHistory={tdeeHistory}
              targetCalories={targetCalories}
              isInColdStart={isInColdStart}

              // Actions
              onLogWeight={() => setIsWeightModalOpen(true)}
            />

            {/* Weekly Nutrition Card */}
            {stats && (
              <WeeklyNutritionCard
                days={stats.days}
                averages={stats.averages}
                goals={goals ? { ...goals, calorieGoal: targetCalories } : goals}
              />
            )}
          </>
        )}
      </main>

      {/* Weight Log Modal */}
      <WeightLogModal
        isOpen={isWeightModalOpen}
        onClose={() => setIsWeightModalOpen(false)}
        onSuccess={handleWeightLogSuccess}
        preferredUnit={preferredUnit}
      />

      {/* Bottom Navigation */}
      <BottomNav onAddClick={() => setIsFoodModalOpen(true)} />

      {/* Food Log Modal */}
      <FoodLogModal
        isOpen={isFoodModalOpen}
        onClose={() => setIsFoodModalOpen(false)}
        onSuccess={() => {
          setIsFoodModalOpen(false);
          loadStats();
        }}
      />
    </div>
  );
}
