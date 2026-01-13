'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { ProgressRing } from './ui/ProgressRing';
import { FoodLogCard, FoodLogCardSkeleton } from './ui/FoodLogCard';
import { FoodLogModal } from './FoodLogModal';
import { DateNavigator } from './ui/DateNavigator';
import type { FoodLogEntry, UserGoals, DailySummary, WeightLogEntry } from '@/lib/types';
import { WeightLogModal } from './WeightLogModal';
import { formatWeight } from '@/lib/statsHelpers';

// Helper to check if a date is today
function isToday(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);
  return compareDate.getTime() === today.getTime();
}

// Helper to format date for section header
function formatLogHeader(date: Date): string {
  if (isToday(date)) {
    return "Today's Log";
  }
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }) + "'s Log";
}

const client = generateClient<Schema>();

// Default goals for new users
const DEFAULT_GOALS: UserGoals = {
  calorieGoal: 2000,
  proteinGoal: 150,
  carbsGoal: 200,
  fatGoal: 65,
};

export function Dashboard() {
  const { user } = useAuthenticator();
  const [goals, setGoals] = useState<UserGoals>(DEFAULT_GOALS);
  const [summary, setSummary] = useState<DailySummary>({
    totalCalories: 0,
    totalProtein: 0,
    totalCarbs: 0,
    totalFat: 0,
    entries: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [latestWeight, setLatestWeight] = useState<WeightLogEntry | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  // Fetch user profile and logs for the selected date
  const fetchData = useCallback(async (date: Date) => {
    setIsLoading(true);
    try {
      // Fetch user profile and today's weight in parallel
      const today = new Date();
      const todayStart = new Date(`${today.toISOString().split('T')[0]}T00:00:00`).toISOString();
      const todayEnd = new Date(`${today.toISOString().split('T')[0]}T23:59:59`).toISOString();

      const [profilesResult, weightResult] = await Promise.all([
        client.models.UserProfile.list(),
        client.models.WeightLog.list({
          filter: {
            recordedAt: {
              between: [todayStart, todayEnd],
            },
          },
        }),
      ]);

      // Set today's weight if exists
      const todayWeight = weightResult.data && weightResult.data.length > 0
        ? {
            id: weightResult.data[0].id,
            weightKg: weightResult.data[0].weightKg,
            recordedAt: weightResult.data[0].recordedAt,
            note: weightResult.data[0].note ?? undefined,
          }
        : null;

      const { data: profiles } = profilesResult;
      if (profiles && profiles.length > 0) {
        const profile = profiles[0];

        // Determine weight unit from preferredUnitSystem first, then fall back to legacy field
        const unitSystem = (profile.preferredUnitSystem as 'metric' | 'imperial') ??
          (profile.preferredWeightUnit === 'lbs' ? 'imperial' : 'metric');
        const weightUnit = unitSystem === 'imperial' ? 'lbs' : 'kg';

        console.log('[Dashboard] Profile loaded:', {
          preferredUnitSystem: profile.preferredUnitSystem,
          preferredWeightUnit: profile.preferredWeightUnit,
          derivedUnitSystem: unitSystem,
          derivedWeightUnit: weightUnit,
        });

        setGoals({
          calorieGoal: profile.calorieGoal ?? DEFAULT_GOALS.calorieGoal,
          proteinGoal: profile.proteinGoal ?? DEFAULT_GOALS.proteinGoal,
          carbsGoal: profile.carbsGoal ?? DEFAULT_GOALS.carbsGoal,
          fatGoal: profile.fatGoal ?? DEFAULT_GOALS.fatGoal,
          preferredWeightUnit: weightUnit,
          targetWeightKg: profile.targetWeightKg ?? undefined,
        });
      } else {
        setNeedsOnboarding(true);
      }
      
      setLatestWeight(todayWeight);

      // Fetch food logs for the selected date
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      const { data: logs } = await client.models.FoodLog.list({
        filter: {
          eatenAt: {
            between: [startOfDay.toISOString(), endOfDay.toISOString()],
          },
        },
      });

      if (logs) {
        const entries: FoodLogEntry[] = logs.map((log) => ({
          id: log.id,
          name: log.name ?? '',
          weightG: log.weightG ?? 0,
          calories: log.calories ?? 0,
          protein: log.protein ?? 0,
          carbs: log.carbs ?? 0,
          fat: log.fat ?? 0,
          source: log.source ?? '',
          eatenAt: log.eatenAt ?? new Date().toISOString(),
          // Include serving info for editing
          servingDescription: log.servingDescription ?? null,
          servingSizeGrams: log.servingSizeGrams ?? null,
        }));

        // Sort by time descending (most recent first)
        entries.sort((a, b) => new Date(b.eatenAt).getTime() - new Date(a.eatenAt).getTime());

        const totals = entries.reduce(
          (acc, entry) => ({
            totalCalories: acc.totalCalories + entry.calories,
            totalProtein: acc.totalProtein + entry.protein,
            totalCarbs: acc.totalCarbs + entry.carbs,
            totalFat: acc.totalFat + entry.fat,
          }),
          { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0 }
        );

        setSummary({ ...totals, entries });
      } else {
        // No logs for this date
        setSummary({
          totalCalories: 0,
          totalProtein: 0,
          totalCarbs: 0,
          totalFat: 0,
          entries: [],
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(selectedDate);
  }, [fetchData, selectedDate]);

  const handleDateChange = (newDate: Date) => {
    setSelectedDate(newDate);
  };

  const handleDeleteEntry = async (id: string) => {
    try {
      await client.models.FoodLog.delete({ id });
      // Refresh data
      fetchData(selectedDate);
    } catch (error) {
      console.error('Error deleting entry:', error);
    }
  };

  const handleUpdateEntry = async (id: string, updates: Partial<FoodLogEntry>) => {
    try {
      await client.models.FoodLog.update({
        id,
        name: updates.name,
        weightG: updates.weightG,
        calories: updates.calories,
        protein: updates.protein,
        carbs: updates.carbs,
        fat: updates.fat,
      });
      // Refresh data
      fetchData(selectedDate);
    } catch (error) {
      console.error('Error updating entry:', error);
    }
  };

  const handleLogSuccess = () => {
    setIsModalOpen(false);
    // Return to today and refresh if we were viewing a past date
    if (!isToday(selectedDate)) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      setSelectedDate(today);
    } else {
      fetchData(selectedDate);
    }
  };

  const handleWeightLogSuccess = () => {
    setIsWeightModalOpen(false);
    // Refresh data to get updated weight
    fetchData(selectedDate);
  };

  // Check if we can add food (only for today)
  const canAddFood = isToday(selectedDate);
  const preferredUnit = goals.preferredWeightUnit || 'kg';

  // Redirect to onboarding if needed
  if (needsOnboarding && !isLoading) {
    return (
      <div className="page-container flex items-center justify-center p-6">
        <div className="card max-w-md text-center">
          <h1 className="text-page-title mb-4">Welcome to MacroAI!</h1>
          <p className="text-body text-text-secondary mb-6">
            Let&apos;s set up your daily nutrition goals to get started.
          </p>
          <a href="/onboarding" className="btn-primary inline-block">
            Set Up Goals
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <header className="page-header">
        <div className="content-wrapper flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-macro-calories">MacroAI</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-caption hidden sm:block mr-1">
              {user?.signInDetails?.loginId}
            </span>
            <a
              href="/stats"
              className="icon-button"
              aria-label="View statistics"
            >
              <svg
                className="w-5 h-5 text-text-secondary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </a>
            <a
              href="/settings"
              className="icon-button"
              aria-label="Settings"
            >
              <svg
                className="w-5 h-5 text-text-secondary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="content-wrapper">
        {/* Date Navigator */}
        <div className="flex justify-center mt-6 mb-6">
          <DateNavigator 
            selectedDate={selectedDate} 
            onDateChange={handleDateChange} 
          />
        </div>

        {/* Calorie Ring */}
        <div className="flex justify-center mb-6">
          <ProgressRing
            value={summary.totalCalories}
            max={goals.calorieGoal}
            color="calories"
            size="lg"
            unit="kcal"
          />
        </div>

        {/* Macro Rings */}
        <div className="flex justify-center gap-6 mb-6">
          <ProgressRing
            value={summary.totalProtein}
            max={goals.proteinGoal}
            color="protein"
            size="sm"
            unit="g"
            label="Protein"
          />
          <ProgressRing
            value={summary.totalCarbs}
            max={goals.carbsGoal}
            color="carbs"
            size="sm"
            unit="g"
            label="Carbs"
          />
          <ProgressRing
            value={summary.totalFat}
            max={goals.fatGoal}
            color="fat"
            size="sm"
            unit="g"
            label="Fat"
          />
        </div>

        {/* Weight Card */}
        <div className="mb-8">
          <button
            onClick={() => setIsWeightModalOpen(true)}
            className="w-full card-interactive flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="icon-button bg-weight-subtle">
                <svg
                  className="w-5 h-5 text-weight"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
                  />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-caption text-text-muted">Today&apos;s Weight</p>
                {isLoading ? (
                  <div className="h-6 w-16 skeleton rounded mt-1" />
                ) : latestWeight ? (
                  <p className="text-lg font-mono font-bold text-weight">
                    {formatWeight(latestWeight.weightKg, preferredUnit)}
                  </p>
                ) : (
                  <p className="text-body text-text-secondary">Tap to log</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-text-muted group-hover:text-text-secondary transition-colors">
              {latestWeight ? (
                <>
                  <span className="text-caption">Edit</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </>
              ) : (
                <>
                  <span className="text-caption">Log</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </>
              )}
            </div>
          </button>
        </div>

        {/* Food Log */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-section-title">{formatLogHeader(selectedDate)}</h2>
            <a href="/onboarding" className="text-caption text-macro-calories hover:underline">
              Edit Goals
            </a>
          </div>

          <div className="flex flex-col gap-3">
            {isLoading ? (
              <>
                <FoodLogCardSkeleton index={0} />
                <FoodLogCardSkeleton index={1} />
                <FoodLogCardSkeleton index={2} />
              </>
            ) : summary.entries.length > 0 ? (
              summary.entries.map((entry, index) => (
                <FoodLogCard
                  key={entry.id}
                  entry={entry}
                  index={index}
                  onDelete={handleDeleteEntry}
                  onUpdate={handleUpdateEntry}
                />
              ))
            ) : (
              <div className="card-empty">
                <p className="text-4xl mb-4">🍽️</p>
                <p className="text-body text-text-secondary">
                  {canAddFood ? 'No meals logged yet today' : 'No meals were logged this day'}
                </p>
                {canAddFood && (
                  <p className="text-caption mt-2">Tap the + button to log your first meal</p>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Floating Action Button - only shown when viewing today */}
      {canAddFood && (
        <button
          onClick={() => setIsModalOpen(true)}
          className="fab"
          aria-label="Log food"
        >
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}

      {/* Food Log Modal */}
      <FoodLogModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleLogSuccess}
      />

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
