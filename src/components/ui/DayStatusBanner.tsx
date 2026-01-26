'use client';

import { useState, useCallback } from 'react';
import type { LogStatus } from '@/lib/types';
import { updateDayStatus } from '@/actions/updateDayStatus';
import { showToast } from './Toast';

interface DayStatusBannerProps {
  selectedDate: Date;
  currentStatus: LogStatus | null;
  totalCalories: number;
  estimatedTdee?: number;
  onStatusChange: (status: LogStatus) => void;
  isLoading?: boolean;
}

// Status colors
const STATUS_COLORS = {
  complete: '#10B981',
  partial: '#F59E0B',
  skipped: '#6B7280',
  incomplete: '#EF4444',
} as const;

/**
 * Check if the selected date is today
 */
function isToday(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);
  return compareDate.getTime() === today.getTime();
}

/**
 * Banner component for showing day status context when viewing past days
 */
export function DayStatusBanner({
  selectedDate,
  currentStatus,
  totalCalories,
  estimatedTdee = 2000,
  onStatusChange,
  isLoading = false,
}: DayStatusBannerProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleMarkSkipped = useCallback(async () => {
    setIsUpdating(true);
    try {
      const result = await updateDayStatus(selectedDate, 'skipped');
      if (result.success) {
        onStatusChange('skipped');
        showToast('Day marked as skipped', 'success');
      } else {
        showToast(result.error || 'Failed to update status', 'error');
      }
    } catch (error) {
      console.error('[DayStatusBanner] Error:', error);
      showToast('Failed to update day status', 'error');
    } finally {
      setIsUpdating(false);
    }
  }, [selectedDate, onStatusChange]);

  // Don't show for today - use DayStatusAction instead
  if (isToday(selectedDate)) {
    return null;
  }

  // Don't show while data is loading to prevent flash of incorrect state
  if (isLoading) {
    return null;
  }

  // If already marked as skipped, show info banner
  if (currentStatus === 'skipped') {
    return (
      <div 
        className="mb-4 rounded-xl p-4 flex items-start gap-3"
        style={{ 
          backgroundColor: `${STATUS_COLORS.skipped}10`,
          borderLeft: `3px solid ${STATUS_COLORS.skipped}`,
        }}
      >
        <svg 
          className="w-5 h-5 mt-0.5 flex-shrink-0" 
          style={{ color: STATUS_COLORS.skipped }}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
          />
        </svg>
        <div>
          <p className="text-sm font-medium text-text-secondary">
            This day was skipped
          </p>
          <p className="text-xs text-text-muted mt-1">
            Excluded from TDEE calculations to keep your data accurate
          </p>
        </div>
      </div>
    );
  }

  // If already marked as complete, show subtle success indicator
  if (currentStatus === 'complete') {
    return (
      <div 
        className="mb-4 rounded-xl p-3 flex items-center gap-2"
        style={{ 
          backgroundColor: `${STATUS_COLORS.complete}08`,
          borderLeft: `3px solid ${STATUS_COLORS.complete}`,
        }}
      >
        <svg 
          className="w-4 h-4" 
          style={{ color: STATUS_COLORS.complete }}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-xs" style={{ color: STATUS_COLORS.complete }}>
          Day complete - included in TDEE
        </span>
      </div>
    );
  }

  // Check if the day looks incomplete (low or no calories)
  const isLowCalories = totalCalories > 0 && totalCalories < estimatedTdee * 0.5;
  const hasNoFood = totalCalories === 0;

  // Determine if we should show a warning (incomplete-looking) or just an option
  const showWarning = isLowCalories || hasNoFood;

  // For days with reasonable calories, show a subtle option to mark as incomplete
  if (!showWarning) {
    return (
      <div
        className="mb-4 rounded-xl p-3 flex items-center justify-between gap-3"
        style={{
          backgroundColor: '#1E1E26',
          borderLeft: '3px solid #2A2A35',
        }}
      >
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-xs text-text-muted">
            Didn&apos;t log everything?
          </span>
        </div>
        <button
          onClick={handleMarkSkipped}
          disabled={isUpdating}
          className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap
                     transition-colors hover:opacity-90 disabled:opacity-50"
          style={{
            backgroundColor: `${STATUS_COLORS.skipped}20`,
            color: STATUS_COLORS.skipped,
          }}
        >
          {isUpdating ? 'Updating...' : 'Mark Incomplete'}
        </button>
      </div>
    );
  }

  // Show warning banner for incomplete-looking days
  const warningColor = hasNoFood ? STATUS_COLORS.skipped : STATUS_COLORS.incomplete;
  const message = hasNoFood
    ? 'No food logged for this day'
    : `Only ${totalCalories} kcal logged - looks incomplete`;
  const suggestion = hasNoFood
    ? 'Mark as skipped to exclude from TDEE calculations'
    : 'If you forgot to log, mark as skipped for accurate TDEE';

  return (
    <div
      className="mb-4 rounded-xl p-4"
      style={{
        backgroundColor: `${warningColor}10`,
        borderLeft: `3px solid ${warningColor}`,
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 mt-0.5 flex-shrink-0"
            style={{ color: warningColor }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <p className="text-sm font-medium" style={{ color: warningColor }}>
              {message}
            </p>
            <p className="text-xs text-text-muted mt-1">{suggestion}</p>
          </div>
        </div>

        <button
          onClick={handleMarkSkipped}
          disabled={isUpdating}
          className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap
                     transition-colors hover:opacity-90 disabled:opacity-50"
          style={{
            backgroundColor: `${STATUS_COLORS.skipped}20`,
            color: STATUS_COLORS.skipped,
          }}
        >
          {isUpdating ? 'Updating...' : 'Mark Skipped'}
        </button>
      </div>
    </div>
  );
}
