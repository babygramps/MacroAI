'use client';

import { useCallback, useState, useEffect } from 'react';
import { getCurrentUser, fetchUserAttributes } from 'aws-amplify/auth';
import { FoodLogModal } from './FoodLogModal';
import { MealEditModal } from './MealEditModal';
import { DateNavigator } from './ui/DateNavigator';
import type { MealEntry } from '@/lib/types';
import { WeightLogModal } from './WeightLogModal';
import { showToast } from './ui/Toast';
import { ConfirmModal } from './ui/ConfirmModal';
import { deleteMealEntry, updateMeal } from '@/lib/data/dashboard';
import { useDashboardData } from '@/lib/hooks/useDashboardData';
import { DashboardHeader } from './dashboard/DashboardHeader';
import { DashboardRings } from './dashboard/DashboardRings';
import { WeightCard } from './dashboard/WeightCard';
import { MealLogSection } from './dashboard/MealLogSection';
import { DayStatusBanner } from './ui/DayStatusBanner';
import { DayStatusAction } from './ui/DayStatusAction';
import { BottomNav } from './ui/BottomNav';
import { isToday } from '@/lib/date';
import { logError } from '@/lib/logger';

export function Dashboard() {
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);

  // Fetch user email on mount
  useEffect(() => {
    async function fetchUserEmail() {
      try {
        // Try to get email from user attributes first
        const attributes = await fetchUserAttributes();
        if (attributes.email) {
          setUserEmail(attributes.email);
          return;
        }
        
        // Fallback to signInDetails
        const user = await getCurrentUser();
        setUserEmail(user.signInDetails?.loginId);
      } catch (error) {
        console.error('[Dashboard] Error fetching user email:', error);
      }
    }
    fetchUserEmail();
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

  const handleLogSuccess = useCallback(() => {
    setIsModalOpen(false);
    // Return to today and refresh if we were viewing a past date
    if (!isToday(selectedDate)) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      setSelectedDate(today);
    } else {
      refresh();
    }
  }, [refresh, selectedDate]);

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
    </div>
  );
}
