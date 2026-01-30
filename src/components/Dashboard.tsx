'use client';

import { useCallback, useState, useEffect } from 'react';
import { getCurrentUser, fetchUserAttributes } from 'aws-amplify/auth';
import { FoodLogModal } from './FoodLogModal';
import { MealEditModal } from './MealEditModal';
import { DateNavigator } from './ui/DateNavigator';
import type { MealEntry, RecentFoodsResponse } from '@/lib/types';
import { WeightLogModal } from './WeightLogModal';
import { showToast } from './ui/Toast';
import { ConfirmModal } from './ui/ConfirmModal';
import { deleteMealEntry, updateMeal, duplicateMealEntry } from '@/lib/data/dashboard';
import { useDashboardData } from '@/lib/hooks/useDashboardData';
import { DashboardHeader } from './dashboard/DashboardHeader';
import { DashboardRings } from './dashboard/DashboardRings';
import { WeightCard } from './dashboard/WeightCard';
import { MealLogSection } from './dashboard/MealLogSection';
import { DayStatusBanner } from './ui/DayStatusBanner';
import { DayStatusAction } from './ui/DayStatusAction';
import { BottomNav } from './ui/BottomNav';
import { DebugOverlay } from './ui/DebugOverlay';
import { isToday } from '@/lib/date';
import { logError } from '@/lib/logger';
import { logRemote, setUserContext } from '@/lib/clientLogger';
import { getRecentFoods } from '@/actions/getRecentFoods';

export function Dashboard() {
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);

  // Prefetch recents on mount so data is ready when FoodLogModal opens (async-parallel rule)
  const [prefetchedRecents, setPrefetchedRecents] = useState<RecentFoodsResponse | null>(null);

  // Fetch user email and prefetch recents on mount
  useEffect(() => {
    async function fetchUserEmail() {
      try {
        // Try to get email from user attributes first
        const attributes = await fetchUserAttributes();
        if (attributes.email) {
          setUserEmail(attributes.email);
          // Set user context for all logs
          setUserContext({ email: attributes.email });
          return;
        }

        // Fallback to signInDetails
        const user = await getCurrentUser();
        setUserEmail(user.signInDetails?.loginId);
        // Set user context for all logs
        if (user.signInDetails?.loginId) {
          setUserContext({ email: user.signInDetails.loginId, userId: user.userId });
        }
      } catch (error) {
        console.error('[Dashboard] Error fetching user email:', error);
      }
    }

    async function prefetchRecents() {
      try {
        const data = await getRecentFoods();
        setPrefetchedRecents(data);
      } catch (error) {
        // Silent fail - SearchTab will fetch on its own if needed
        console.error('[Dashboard] Error prefetching recents:', error);
      }
    }

    // Start both fetches in parallel (async-parallel rule)
    fetchUserEmail();
    prefetchRecents();
  }, []);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingMeal, setEditingMeal] = useState<MealEntry | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; mealId: string | null; mealName: string }>({
    isOpen: false,
    mealId: null,
    mealName: '',
  });
  const {
    goals,
    summary,
    latestWeight,
    needsOnboarding,
    isLoading,
    dayStatus,
    dayStatusMap,
    refresh,
    updateDayStatus,
  } = useDashboardData(selectedDate);

  const handleDateChange = useCallback((newDate: Date) => {
    setSelectedDate(newDate);
  }, []);

  const handleEditMeal = useCallback((meal: MealEntry) => {
    // Legacy FoodLog entries can't be edited in the new modal
    // They need to be deleted and re-logged with the new system
    if (meal.id.startsWith('legacy-')) {
      showToast('Legacy entries cannot be edited. Delete and re-log to use new features.', 'error');
      return;
    }
    setEditingMeal(meal);
    setIsEditModalOpen(true);
  }, []);

  const handleSaveMeal = useCallback(async (updatedMeal: MealEntry) => {
    try {
      await updateMeal(updatedMeal);
      showToast('Meal updated!', 'success');
      await refresh();
    } catch (error) {
      logError('Error saving meal', { error });
      showToast('Failed to save meal', 'error');
    }
  }, [refresh]);

  const handleDeleteMeal = useCallback((mealId: string) => {
    // Find the meal to get its name for the confirmation dialog
    const meal = summary.meals.find((m) => m.id === mealId);
    const mealName = meal?.name || 'this item';
    setDeleteConfirm({ isOpen: true, mealId, mealName });
  }, [summary.meals]);

  const confirmDeleteMeal = useCallback(async () => {
    const mealId = deleteConfirm.mealId;
    if (!mealId) return;

    setDeleteConfirm({ isOpen: false, mealId: null, mealName: '' });

    try {
      await deleteMealEntry(mealId);
      showToast('Meal deleted', 'success');
      await refresh();
    } catch (error) {
      logError('Error deleting meal', { error });
      showToast('Failed to delete meal', 'error');
    }
  }, [deleteConfirm.mealId, refresh]);

  const cancelDeleteMeal = useCallback(() => {
    setDeleteConfirm({ isOpen: false, mealId: null, mealName: '' });
  }, []);

  const handleDuplicateMeal = useCallback(async (mealId: string) => {
    try {
      await duplicateMealEntry(mealId);
      showToast('Meal duplicated!', 'success');
      await refresh();
    } catch (error) {
      logError('Error duplicating meal', { error });
      showToast('Failed to duplicate meal', 'error');
    }
  }, [refresh]);

  const handleLogSuccess = useCallback(async (options?: { verified?: boolean }) => {
    logRemote.info('DASHBOARD_LOG_SUCCESS', { isToday: isToday(selectedDate), verified: options?.verified });
    setIsModalOpen(false);
    // Return to today and refresh if we were viewing a past date
    if (!isToday(selectedDate)) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      setSelectedDate(today);
    } else {
      logRemote.info('DASHBOARD_REFRESH_TRIGGERED', { trigger: 'log_success' });
      await refresh();
      logRemote.info('DASHBOARD_REFRESH_COMPLETE', { mealCount: summary.meals.length });

      // If verification failed, schedule a delayed refresh as fallback
      if (options?.verified === false) {
        logRemote.info('DASHBOARD_DELAYED_REFRESH_SCHEDULED', { delayMs: 5000 });
        setTimeout(async () => {
          logRemote.info('DASHBOARD_DELAYED_REFRESH_TRIGGERED', { trigger: 'verification_fallback' });
          await refresh();
          logRemote.info('DASHBOARD_DELAYED_REFRESH_COMPLETE', { mealCount: summary.meals.length });
        }, 5000);
      }
    }
    // Refresh prefetched recents so they're up-to-date for next modal open
    try {
      const data = await getRecentFoods();
      setPrefetchedRecents(data);
    } catch {
      // Silent fail - will fetch fresh next time
    }
  }, [refresh, selectedDate, summary.meals.length]);

  const handleWeightLogSuccess = useCallback(() => {
    setIsWeightModalOpen(false);
    // Refresh data to get updated weight
    refresh();
  }, [refresh]);

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
      <DashboardHeader userEmail={userEmail} />

      {/* Main Content */}
      <main className="content-wrapper">
        {/* Date Navigator */}
        <div className="flex justify-center mt-6 mb-6">
          <DateNavigator
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
            dayStatuses={dayStatusMap}
          />
        </div>

        {/* Day Status Banner (for past days) */}
        <DayStatusBanner
          selectedDate={selectedDate}
          currentStatus={dayStatus}
          totalCalories={summary.totalCalories}
          estimatedTdee={goals.calorieGoal}
          onStatusChange={updateDayStatus}
          isLoading={isLoading}
        />

        <DashboardRings summary={summary} goals={goals} />

        <WeightCard
          selectedDate={selectedDate}
          isLoading={isLoading}
          latestWeight={latestWeight}
          preferredUnit={preferredUnit}
          onClick={() => setIsWeightModalOpen(true)}
        />

        <MealLogSection
          selectedDate={selectedDate}
          isLoading={isLoading}
          meals={summary.meals}
          canAddFood={canAddFood}
          onEdit={handleEditMeal}
          onDelete={handleDeleteMeal}
          onDuplicate={handleDuplicateMeal}
        />

        {/* Day Status Action (for marking today as complete/skipped) */}
        <DayStatusAction
          selectedDate={selectedDate}
          currentStatus={dayStatus}
          totalCalories={summary.totalCalories}
          estimatedTdee={goals.calorieGoal}
          onStatusChange={updateDayStatus}
        />
      </main>

      {/* Bottom Navigation */}
      <BottomNav
        onAddClick={() => setIsModalOpen(true)}
        showAdd={canAddFood}
      />

      {/* Food Log Modal */}
      <FoodLogModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleLogSuccess}
        prefetchedRecents={prefetchedRecents}
      />

      {/* Meal Edit Modal */}
      <MealEditModal
        isOpen={isEditModalOpen}
        meal={editingMeal}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingMeal(null);
        }}
        onSave={handleSaveMeal}
        onDelete={handleDeleteMeal}
      />

      {/* Weight Log Modal */}
      <WeightLogModal
        isOpen={isWeightModalOpen}
        onClose={() => setIsWeightModalOpen(false)}
        onSuccess={handleWeightLogSuccess}
        preferredUnit={preferredUnit}
        selectedDate={selectedDate}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title="Delete Entry"
        message={`Are you sure you want to delete "${deleteConfirm.mealName}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDeleteMeal}
        onCancel={cancelDeleteMeal}
      />

      {/* Debug Overlay - visible only when ?debug=1 in URL */}
      <DebugOverlay />
    </div>
  );
}
