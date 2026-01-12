'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { ProgressRing } from './ui/ProgressRing';
import { FoodLogCard, FoodLogCardSkeleton } from './ui/FoodLogCard';
import { FoodLogModal } from './FoodLogModal';
import { DateNavigator } from './ui/DateNavigator';
import type { FoodLogEntry, UserGoals, DailySummary } from '@/lib/types';

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
  const { user, signOut } = useAuthenticator();
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
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  // Fetch user profile and logs for the selected date
  const fetchData = useCallback(async (date: Date) => {
    setIsLoading(true);
    try {
      // Fetch user profile
      const { data: profiles } = await client.models.UserProfile.list();
      if (profiles && profiles.length > 0) {
        const profile = profiles[0];
        setGoals({
          calorieGoal: profile.calorieGoal ?? DEFAULT_GOALS.calorieGoal,
          proteinGoal: profile.proteinGoal ?? DEFAULT_GOALS.proteinGoal,
          carbsGoal: profile.carbsGoal ?? DEFAULT_GOALS.carbsGoal,
          fatGoal: profile.fatGoal ?? DEFAULT_GOALS.fatGoal,
        });
      } else {
        setNeedsOnboarding(true);
      }

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

  // Check if we can add food (only for today)
  const canAddFood = isToday(selectedDate);

  // Redirect to onboarding if needed
  if (needsOnboarding && !isLoading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
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
    <div className="min-h-screen bg-bg-primary pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-bg-primary/80 backdrop-blur-lg border-b border-border-subtle">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-macro-calories">MacroAI</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-caption hidden sm:block mr-1">
              {user?.signInDetails?.loginId}
            </span>
            <a
              href="/stats"
              className="w-10 h-10 rounded-full bg-bg-elevated flex items-center justify-center hover:bg-bg-surface transition-colors"
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
            <button
              onClick={signOut}
              className="w-10 h-10 rounded-full bg-bg-elevated flex items-center justify-center hover:bg-bg-surface transition-colors"
              aria-label="Sign out"
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
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto px-4">
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
        <div className="flex justify-center gap-6 mb-8">
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
              <div className="card text-center py-12">
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
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-macro-calories 
                     flex items-center justify-center shadow-lg shadow-macro-calories/30
                     hover:scale-105 active:scale-95 transition-transform z-50"
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
    </div>
  );
}
