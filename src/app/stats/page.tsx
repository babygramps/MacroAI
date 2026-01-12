'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { WeeklyChart, WeeklyChartSkeleton } from '@/components/ui/WeeklyChart';
import { MacroPieChart, MacroPieChartSkeleton } from '@/components/ui/MacroPieChart';
import { WeightChart, WeightChartSkeleton } from '@/components/ui/WeightChart';
import { WeightLogModal } from '@/components/WeightLogModal';
import { fetchWeeklyStats, fetchUserGoals, fetchWeightStats, formatWeight } from '@/lib/statsHelpers';
import type { WeeklyStats, UserGoals, WeightStats } from '@/lib/types';

export default function StatsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<WeeklyStats | null>(null);
  const [goals, setGoals] = useState<UserGoals | null>(null);
  const [weightStats, setWeightStats] = useState<WeightStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);

  const loadStats = useCallback(async () => {
    console.log('[StatsPage] Loading stats...');
    try {
      const [weeklyStats, userGoals, weightData] = await Promise.all([
        fetchWeeklyStats(),
        fetchUserGoals(),
        fetchWeightStats(),
      ]);
      
      console.log('[StatsPage] Stats loaded:', {
        daysCount: weeklyStats.days.length,
        streak: weeklyStats.streak,
        averages: weeklyStats.averages,
        weightEntries: weightData.entries.length,
        currentWeight: weightData.currentWeight,
      });
      
      setStats(weeklyStats);
      setGoals(userGoals);
      setWeightStats(weightData);
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

  const preferredUnit = goals?.preferredWeightUnit || 'kg';

  return (
    <div className="min-h-screen bg-bg-primary pb-8">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-bg-primary/80 backdrop-blur-lg border-b border-border-subtle">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center">
          <button
            onClick={() => router.push('/')}
            className="w-10 h-10 rounded-full bg-bg-elevated flex items-center justify-center 
                       hover:bg-bg-surface transition-colors mr-4"
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
      <main className="max-w-lg mx-auto px-4 py-6">
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
            <section className="card mb-6 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <h2 className="text-card-title text-text-secondary mb-4">Weekly Averages</h2>
              {isLoading ? (
                <div className="grid grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-bg-elevated rounded-xl p-4">
                      <div className="h-4 w-16 skeleton rounded mb-2" />
                      <div className="h-8 w-20 skeleton rounded" />
                    </div>
                  ))}
                </div>
              ) : stats ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-bg-elevated rounded-xl p-4">
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
                  <div className="bg-bg-elevated rounded-xl p-4">
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
                  <div className="bg-bg-elevated rounded-xl p-4">
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
                  <div className="bg-bg-elevated rounded-xl p-4">
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

            {/* Weight Progress */}
            <section className="card animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-card-title text-text-secondary">Weight Progress</h2>
                <button
                  onClick={() => setIsWeightModalOpen(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-colors bg-bg-elevated text-text-secondary hover:bg-bg-primary"
                  style={{ color: '#60A5FA' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Log Weight
                </button>
              </div>

              {/* Current Weight & Change */}
              {isLoading ? (
                <div className="flex gap-4 mb-4">
                  <div className="flex-1 bg-bg-elevated rounded-xl p-4">
                    <div className="h-4 w-20 skeleton rounded mb-2" />
                    <div className="h-8 w-24 skeleton rounded" />
                  </div>
                  <div className="flex-1 bg-bg-elevated rounded-xl p-4">
                    <div className="h-4 w-16 skeleton rounded mb-2" />
                    <div className="h-8 w-16 skeleton rounded" />
                  </div>
                </div>
              ) : weightStats && weightStats.currentWeight ? (
                <div className="flex gap-4 mb-4">
                  <div className="flex-1 bg-bg-elevated rounded-xl p-4">
                    <p className="text-caption text-text-muted mb-1">Current</p>
                    <p className="text-2xl font-mono font-bold" style={{ color: '#60A5FA' }}>
                      {formatWeight(weightStats.currentWeight, preferredUnit)}
                    </p>
                  </div>
                  <div className="flex-1 bg-bg-elevated rounded-xl p-4">
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
                <div className="bg-bg-elevated rounded-xl p-6 mb-4 text-center">
                  <p className="text-3xl mb-2">⚖️</p>
                  <p className="text-text-secondary mb-2">No weight data yet</p>
                  <p className="text-caption text-text-muted">
                    Start tracking your weight to see progress
                  </p>
                </div>
              )}

              {/* Weight Chart */}
              {isLoading ? (
                <WeightChartSkeleton />
              ) : weightStats && weightStats.entries.length >= 2 ? (
                <WeightChart 
                  data={weightStats.entries} 
                  unit={preferredUnit}
                  targetWeight={goals?.targetWeightKg}
                />
              ) : weightStats && weightStats.entries.length === 1 ? (
                <p className="text-caption text-text-muted text-center py-4">
                  Log more weights to see your progress chart
                </p>
              ) : null}

              {/* Goal weight if set */}
              {!isLoading && goals?.targetWeightKg && weightStats?.currentWeight && (
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
                        Math.abs(weightStats.currentWeight - goals.targetWeightKg),
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
