'use client';

import { useState, useCallback } from 'react';
import type { LogStatus } from '@/lib/types';
import { updateDayStatus } from '@/actions/updateDayStatus';
import { showToast } from './Toast';

interface DayStatusActionProps {
  selectedDate: Date;
  currentStatus: LogStatus | null;
  totalCalories: number;
  estimatedTdee?: number;
  onStatusChange: (status: LogStatus) => void;
}

// Status configuration
const STATUS_CONFIG = {
  complete: {
    color: '#10B981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    label: 'Day Complete',
    description: 'Included in TDEE calculations',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  partial: {
    color: '#F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    label: 'Partial Day',
    description: 'Some entries may be missing',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  skipped: {
    color: '#6B7280',
    bgColor: 'rgba(107, 114, 128, 0.1)',
    label: 'Day Skipped',
    description: 'Excluded from TDEE calculations',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
  },
} as const;

/**
 * Check if it's late enough in the day to prompt for day completion
 */
function isLateInDay(): boolean {
  const hour = new Date().getHours();
  return hour >= 20; // After 8 PM
}

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

export function DayStatusAction({
  selectedDate,
  currentStatus,
  totalCalories,
  estimatedTdee = 2000,
  onStatusChange,
}: DayStatusActionProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const handleUpdateStatus = useCallback(async (newStatus: LogStatus) => {
    setIsUpdating(true);
    try {
      const result = await updateDayStatus(selectedDate, newStatus);
      if (result.success) {
        onStatusChange(newStatus);
        showToast(
          newStatus === 'skipped' 
            ? 'Day marked as skipped' 
            : 'Day marked as complete',
          'success'
        );
        setShowOptions(false);
      } else {
        showToast(result.error || 'Failed to update status', 'error');
      }
    } catch (error) {
      console.error('[DayStatusAction] Error updating status:', error);
      showToast('Failed to update day status', 'error');
    } finally {
      setIsUpdating(false);
    }
  }, [selectedDate, onStatusChange]);

  // Don't show anything if:
  // - It's today but not late enough AND no calories logged
  // - The day is already marked with a status
  const isTodayDate = isToday(selectedDate);
  const hasFood = totalCalories > 0;
  const isLate = isLateInDay();
  const isLowCalories = hasFood && totalCalories < estimatedTdee * 0.5;

  // If already has a status, show status indicator
  if (currentStatus) {
    const config = STATUS_CONFIG[currentStatus];
    return (
      <div 
        className="mt-4 rounded-xl p-4 flex items-center justify-between"
        style={{ backgroundColor: config.bgColor }}
      >
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${config.color}20`, color: config.color }}
          >
            {config.icon}
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: config.color }}>
              {config.label}
            </p>
            <p className="text-xs text-text-muted">{config.description}</p>
          </div>
        </div>
        <button
          onClick={() => setShowOptions(!showOptions)}
          className="text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          Change
        </button>
      </div>
    );
  }

  // For today: only show if late OR has low calories
  if (isTodayDate && !isLate && !isLowCalories) {
    return null;
  }

  // For past days with no status: always show the option to mark
  // For today: show if late or has low calories
  const showPrompt = !isTodayDate || isLate || isLowCalories;

  if (!showPrompt) {
    return null;
  }

  // Determine the prompt message
  let promptMessage = 'Done logging for this day?';
  if (isLowCalories) {
    promptMessage = `Only ${totalCalories} kcal logged. Finished for the day?`;
  } else if (!hasFood && !isTodayDate) {
    promptMessage = 'No food logged. Mark this day as skipped?';
  }

  return (
    <div className="mt-4">
      {/* Prompt Card */}
      <div className="card-stat rounded-xl p-4">
        <p className="text-sm text-text-secondary mb-3">{promptMessage}</p>
        
        {showOptions ? (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => handleUpdateStatus('complete')}
              disabled={isUpdating}
              className="flex items-center gap-2 p-3 rounded-lg transition-colors"
              style={{ 
                backgroundColor: STATUS_CONFIG.complete.bgColor,
                color: STATUS_CONFIG.complete.color,
              }}
            >
              {STATUS_CONFIG.complete.icon}
              <span className="text-sm font-medium">Mark as Complete</span>
            </button>
            
            <button
              onClick={() => handleUpdateStatus('skipped')}
              disabled={isUpdating}
              className="flex items-center gap-2 p-3 rounded-lg transition-colors"
              style={{ 
                backgroundColor: STATUS_CONFIG.skipped.bgColor,
                color: STATUS_CONFIG.skipped.color,
              }}
            >
              {STATUS_CONFIG.skipped.icon}
              <span className="text-sm font-medium">Skip Day (Exclude from TDEE)</span>
            </button>
            
            <button
              onClick={() => setShowOptions(false)}
              className="text-xs text-text-muted hover:text-text-secondary py-2"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setShowOptions(true)}
              className="flex-1 py-2.5 px-4 rounded-lg bg-bg-elevated text-text-secondary 
                         text-sm font-medium hover:bg-bg-surface transition-colors"
            >
              Mark Day Status
            </button>
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {isUpdating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bg-surface rounded-xl p-6 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-macro-calories border-t-transparent rounded-full animate-spin" />
            <span className="text-text-secondary">Updating...</span>
          </div>
        </div>
      )}
    </div>
  );
}
