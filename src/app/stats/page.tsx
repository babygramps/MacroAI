'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { WeeklyChart, WeeklyChartSkeleton } from '@/components/ui/WeeklyChart';
import { MacroPieChart, MacroPieChartSkeleton } from '@/components/ui/MacroPieChart';
import { WeightChart, WeightChartSkeleton } from '@/components/ui/WeightChart';
import { WeightLogModal } from '@/components/WeightLogModal';
import { MetabolicInsightsCard, MetabolicInsightsCardSkeleton } from '@/components/ui/MetabolicInsightsCard';
import { TdeeProgressCard, TdeeProgressCardSkeleton } from '@/components/ui/TdeeProgressCard';
import { WeeklyCheckInCard, WeeklyCheckInCardSkeleton } from '@/components/ui/WeeklyCheckInCard';
import { 
  fetchWeeklyStats, 
  fetchUserGoals, 
  fetchWeightStatsWithTrend, 
  formatWeight,
  fetchMetabolicInsights,
} from '@/lib/statsHelpers';
import type { WeeklyStats, UserGoals, WeightStatsWithTrend, MetabolicInsights } from '@/lib/types';

export default function StatsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<WeeklyStats | null>(null);
  const [goals, setGoals] = useState<UserGoals | null>(null);
  const [weightStats, setWeightStats] = useState<WeightStatsWithTrend | null>(null);
  const [metabolicInsights, setMetabolicInsights] = useState<MetabolicInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);

  const loadStats = useCallback(async () => {
    console.log('[StatsPage] Loading stats...');
    try {
      const [weeklyStats, userGoals, weightData, insights] = await Promise.all([
        fetchWeeklyStats(),
        fetchUserGoals(),
        fetchWeightStatsWithTrend(),
        fetchMetabolicInsights(),
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
    // Refresh weight stats
    loadStats();
  };

  // Determine weight unit from unit system (new) or legacy field
  const preferredUnit = goals?.preferredUnitSystem === 'imperial' 
    ? 'lbs' 
    : goals?.preferredWeightUnit || 'kg';

  return (
    <div className="page-container-compact">
      {/* Header */}
      <header className="page-header">
        <div className="content-wrapper flex items-center">
          <button
            onClick={() => router.push('/')}
            className="icon-button mr-4"
            aria-label="Go back"
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-section-title">Statistics</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="content-wrapper py-6">
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
        ) : (
          <>
            {/* Cold Start Progress Card (shown during learning phase) */}
            {isLoading ? (
              <section className="mb-6">
                <TdeeProgressCardSkeleton />
              </section>
            ) : metabolicInsights?.isInColdStart && (
              <section className="mb-6">
                <TdeeProgressCard
                  daysTracked={metabolicInsights.daysTracked}
                  coldStartTdee={metabolicInsights.coldStartTdee}
                  isInColdStart={metabolicInsights.isInColdStart}
                />
              </section>
            )}

            {/* Metabolic Insights Card (shown after cold start or with data) */}
            {isLoading ? (
              <section className="mb-6">
                <MetabolicInsightsCardSkeleton />
              </section>
            ) : metabolicInsights && !metabolicInsights.isInColdStart && (
              <section className="mb-6">
                <MetabolicInsightsCard 
                  insights={metabolicInsights}
                  unit={preferredUnit}
                />
              </section>
            )}

            {/* Weekly Check-In Card (shown when available) */}
            {isLoading ? (
              <section className="mb-6">
                <WeeklyCheckInCardSkeleton />
              </section>
            ) : metabolicInsights?.weeklyCheckIn && (
              <section className="mb-6">
                <WeeklyCheckInCard 
                  checkIn={metabolicInsights.weeklyCheckIn}
                  goals={goals}
                  unit={preferredUnit}
                />
              </section>
            )}

            {/* Streak Card */}
            <section className="card mb-6 animate-fade-in-up">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-card-title text-text-secondary mb-1">Current Streak</h2>
                  {isLoading ? (
                    <div className="h-10 w-24 skeleton rounded" />
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-mono font-bold text-macro-calories">
                        {stats?.streak ?? 0}
                      </span>
                      <span className="text-body text-text-muted">
                        {stats?.streak === 1 ? 'day' : 'days'}
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-5xl">
                  {isLoading ? '...' : stats?.streak && stats.streak >= 7 ? '🔥' : stats?.streak && stats.streak >= 3 ? '✨' : '💪'}
                </div>
              </div>
              {!isLoading && stats?.streak === 0 && (
                <p className="text-caption text-text-muted mt-2">
                  Log food today to start your streak!
                </p>
              )}
            </section>

            {/* Weekly Calories Chart */}
            <section className="card mb-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              <h2 className="text-card-title text-text-secondary mb-4">Weekly Calories</h2>
              {isLoading ? (
                <WeeklyChartSkeleton />
              ) : stats && goals ? (
                <WeeklyChart data={stats.days} calorieGoal={goals.calorieGoal} />
              ) : (
                <p className="text-center text-text-muted py-8">No data available</p>
              )}
            </section>

            {/* Weekly Averages */}
            <section className="card mb-6 animate-fade-in-up" style={{ '--stagger-index': 2 } as React.CSSProperties}>
              <h2 className="text-card-title text-text-secondary mb-4">Weekly Averages</h2>
              {isLoading ? (
                <div className="stats-grid">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="card-stat">
                      <div className="h-4 w-16 skeleton rounded mb-2" />
                      <div className="h-8 w-20 skeleton rounded" />
                    </div>
                  ))}
                </div>
              ) : stats ? (
                <div className="stats-grid">
                  <div className="card-stat">
                    <p className="text-caption text-text-muted mb-1">Calories</p>
                    <p className="text-2xl font-mono font-bold text-macro-calories">
                      {stats.averages.calories}
                      <span className="text-sm text-text-muted ml-1">kcal</span>
                    </p>
                    {goals && (
                      <p className="text-xs text-text-muted mt-1">
                        Goal: {goals.calorieGoal}
                      </p>
                    )}
                  </div>
                  <div className="card-stat">
                    <p className="text-caption text-text-muted mb-1">Protein</p>
                    <p className="text-2xl font-mono font-bold text-macro-protein">
                      {stats.averages.protein}
                      <span className="text-sm text-text-muted ml-1">g</span>
                    </p>
                    {goals && (
                      <p className="text-xs text-text-muted mt-1">
                        Goal: {goals.proteinGoal}g
                      </p>
                    )}
                  </div>
                  <div className="card-stat">
                    <p className="text-caption text-text-muted mb-1">Carbs</p>
                    <p className="text-2xl font-mono font-bold text-macro-carbs">
                      {stats.averages.carbs}
                      <span className="text-sm text-text-muted ml-1">g</span>
                    </p>
                    {goals && (
                      <p className="text-xs text-text-muted mt-1">
                        Goal: {goals.carbsGoal}g
                      </p>
                    )}
                  </div>
                  <div className="card-stat">
                    <p className="text-caption text-text-muted mb-1">Fat</p>
                    <p className="text-2xl font-mono font-bold text-macro-fat">
                      {stats.averages.fat}
                      <span className="text-sm text-text-muted ml-1">g</span>
                    </p>
                    {goals && (
                      <p className="text-xs text-text-muted mt-1">
                        Goal: {goals.fatGoal}g
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-center text-text-muted py-8">No data available</p>
              )}
            </section>

            {/* Macro Distribution */}
            <section className="card mb-6 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
              <h2 className="text-card-title text-text-secondary mb-4">Weekly Macro Distribution</h2>
              <div className="flex justify-center py-4">
                {isLoading ? (
                  <MacroPieChartSkeleton />
                ) : stats ? (
                  <MacroPieChart
                    protein={stats.averages.protein}
                    carbs={stats.averages.carbs}
                    fat={stats.averages.fat}
                  />
                ) : (
                  <p className="text-center text-text-muted py-8">No data available</p>
                )}
              </div>
              {!isLoading && stats && (
                <p className="text-caption text-text-muted text-center mt-2">
                  Based on your daily averages
                </p>
              )}
            </section>

            {/* Weight Progress - Enhanced with Trend */}
            <section className="card animate-fade-in-up" style={{ '--stagger-index': 4 } as React.CSSProperties}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-card-title text-text-secondary">Weight Progress</h2>
                <button
                  onClick={() => setIsWeightModalOpen(true)}
                  className="preset-button text-weight"
                >
                  <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Log Weight
                </button>
              </div>

              {/* Current Weight & Change - Now with Trend */}
              {isLoading ? (
                <div className="flex gap-4 mb-4">
                  <div className="flex-1 card-stat">
                    <div className="h-4 w-20 skeleton rounded mb-2" />
                    <div className="h-8 w-24 skeleton rounded" />
                  </div>
                  <div className="flex-1 card-stat">
                    <div className="h-4 w-16 skeleton rounded mb-2" />
                    <div className="h-8 w-16 skeleton rounded" />
                  </div>
                </div>
              ) : weightStats && (weightStats.currentWeight || weightStats.trendWeight) ? (
                <div className="flex gap-4 mb-4">
                  {/* Trend Weight (Primary) */}
                  <div className="flex-1 card-stat">
                    <p className="text-caption text-text-muted mb-1">Trend Weight</p>
                    <p className="text-2xl font-mono font-bold text-weight">
                      {formatWeight(weightStats.trendWeight ?? weightStats.currentWeight ?? 0, preferredUnit)}
                    </p>
                    {weightStats.trendWeight && weightStats.currentWeight && weightStats.trendWeight !== weightStats.currentWeight && (
                      <p className="text-xs text-text-muted mt-1">
                        Scale: {formatWeight(weightStats.currentWeight, preferredUnit)}
                      </p>
                    )}
                  </div>
                  {/* Weekly Change */}
                  <div className="flex-1 card-stat">
                    <p className="text-caption text-text-muted mb-1">7-Day Change</p>
                    {weightStats.changeFromWeekAgo !== null ? (
                      <p className={`text-2xl font-mono font-bold ${
                        weightStats.changeFromWeekAgo > 0 
                          ? 'text-red-400' 
                          : weightStats.changeFromWeekAgo < 0 
                            ? 'text-green-400' 
                            : 'text-text-secondary'
                      }`}>
                        {weightStats.changeFromWeekAgo > 0 ? '+' : ''}
                        {preferredUnit === 'lbs' 
                          ? Math.round(weightStats.changeFromWeekAgo * 2.20462 * 10) / 10
                          : weightStats.changeFromWeekAgo
                        }
                        <span className="text-sm text-text-muted ml-1">{preferredUnit}</span>
                      </p>
                    ) : (
                      <p className="text-xl text-text-muted">—</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="card-stat text-center py-6 mb-4">
                  <p className="text-3xl mb-2">⚖️</p>
                  <p className="text-text-secondary mb-2">No weight data yet</p>
                  <p className="text-caption text-text-muted">
                    Start tracking your weight to see progress
                  </p>
                </div>
              )}

              {/* Weight Chart - Enhanced with Trend Line */}
              {isLoading ? (
                <WeightChartSkeleton />
              ) : weightStats && weightStats.entries.length >= 2 ? (
                <WeightChart 
                  data={weightStats.entries} 
                  unit={preferredUnit}
                  targetWeight={goals?.targetWeightKg}
                  trendData={weightStats.trendData}
                  showTrendLine={true}
                />
              ) : weightStats && weightStats.entries.length === 1 ? (
                <p className="text-caption text-text-muted text-center py-4">
                  Log more weights to see your progress chart
                </p>
              ) : null}

              {/* Goal weight if set */}
              {!isLoading && goals?.targetWeightKg && (weightStats?.trendWeight || weightStats?.currentWeight) && (
                <div className="mt-4 pt-4 border-t border-border-subtle">
                  <div className="flex items-center justify-between">
                    <span className="text-caption text-text-muted">Goal Weight</span>
                    <span className="text-sm font-mono text-green-400">
                      {formatWeight(goals.targetWeightKg, preferredUnit)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-caption text-text-muted">To go</span>
                    <span className="text-sm font-mono text-text-secondary">
                      {formatWeight(
                        Math.abs((weightStats?.trendWeight ?? weightStats?.currentWeight ?? 0) - goals.targetWeightKg),
                        preferredUnit
                      )}
                    </span>
                  </div>
                </div>
              )}
            </section>
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
    </div>
  );
}
