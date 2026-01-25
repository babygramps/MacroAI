'use client';

import type { WeeklyCheckIn, UserGoals, LogStatus } from '@/lib/types';

interface DayStatusBreakdown {
  complete: number;
  partial: number;
  skipped: number;
  untracked: number;
}

interface WeeklyCheckInCardProps {
  checkIn: WeeklyCheckIn;
  goals?: UserGoals | null;
  unit?: 'kg' | 'lbs';
  /** Optional breakdown of day statuses for the week */
  dayStatusBreakdown?: DayStatusBreakdown;
}

// Status colors for the mini indicators
const STATUS_COLORS: Record<LogStatus | 'untracked', string> = {
  complete: '#10B981',
  partial: '#F59E0B',
  skipped: '#6B7280',
  untracked: '#374151',
};

// Convert kg to lbs
function convertWeight(kg: number, unit: 'kg' | 'lbs'): string {
  if (unit === 'lbs') {
    return `${Math.round(kg * 2.20462 * 10) / 10}`;
  }
  return `${Math.round(kg * 10) / 10}`;
}

// Format date range
function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  
  const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  
  return `${startStr} - ${endStr}`;
}

// Get adherence color
function getAdherenceColor(score: number): string {
  if (score >= 0.85) return '#10B981'; // Green
  if (score >= 0.7) return '#F59E0B'; // Amber
  return '#EF4444'; // Red
}

// Get adherence label
function getAdherenceLabel(score: number): string {
  if (score >= 0.85) return 'Excellent';
  if (score >= 0.7) return 'Good';
  if (score >= 0.5) return 'Fair';
  return 'Needs Improvement';
}

// Get confidence badge color
function getConfidenceBadgeColor(level: WeeklyCheckIn['confidenceLevel']): { bg: string; text: string } {
  switch (level) {
    case 'high':
      return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10B981' };
    case 'medium':
      return { bg: 'rgba(245, 158, 11, 0.15)', text: '#F59E0B' };
    case 'low':
      return { bg: 'rgba(239, 68, 68, 0.15)', text: '#EF4444' };
    case 'learning':
    default:
      return { bg: 'rgba(96, 165, 250, 0.15)', text: '#60A5FA' };
  }
}

export function WeeklyCheckInCard({ checkIn, goals, unit = 'kg', dayStatusBreakdown }: WeeklyCheckInCardProps) {
  const adherenceColor = getAdherenceColor(checkIn.adherenceScore);
  const adherenceLabel = getAdherenceLabel(checkIn.adherenceScore);
  const adherencePercent = Math.round(checkIn.adherenceScore * 100);
  
  const confidenceColors = getConfidenceBadgeColor(checkIn.confidenceLevel);
  
  // Weight change direction
  const weightChangeColor = checkIn.weeklyWeightChange < 0 
    ? '#10B981' // Green for losing
    : checkIn.weeklyWeightChange > 0 
      ? '#EF4444' // Red for gaining
      : '#9CA3AF';
  
  const weightChangeSign = checkIn.weeklyWeightChange > 0 ? '+' : '';

  // Goal alignment
  const goalType = goals?.goalType ?? 'maintain';
  let goalAlignmentMessage = '';
  let goalAlignmentColor = '#9CA3AF';
  
  if (goalType === 'lose') {
    if (checkIn.weeklyWeightChange < 0) {
      goalAlignmentMessage = 'On track for weight loss';
      goalAlignmentColor = '#10B981';
    } else if (checkIn.weeklyWeightChange > 0) {
      goalAlignmentMessage = 'Gaining instead of losing';
      goalAlignmentColor = '#EF4444';
    } else {
      goalAlignmentMessage = 'Weight stable - increase deficit';
      goalAlignmentColor = '#F59E0B';
    }
  } else if (goalType === 'gain') {
    if (checkIn.weeklyWeightChange > 0) {
      goalAlignmentMessage = 'On track for weight gain';
      goalAlignmentColor = '#10B981';
    } else if (checkIn.weeklyWeightChange < 0) {
      goalAlignmentMessage = 'Losing instead of gaining';
      goalAlignmentColor = '#EF4444';
    } else {
      goalAlignmentMessage = 'Weight stable - increase surplus';
      goalAlignmentColor = '#F59E0B';
    }
  } else {
    if (Math.abs(checkIn.weeklyWeightChange) < 0.2) {
      goalAlignmentMessage = 'Maintaining well';
      goalAlignmentColor = '#10B981';
    } else {
      goalAlignmentMessage = 'Weight drifting - adjust intake';
      goalAlignmentColor = '#F59E0B';
    }
  }

  return (
    <div className="card animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-card-title text-text-secondary">Weekly Check-In</h3>
          <p className="text-caption text-text-muted">
            {formatDateRange(checkIn.weekStartDate, checkIn.weekEndDate)}
          </p>
        </div>
        <div 
          className="px-2 py-1 rounded-full text-xs font-medium"
          style={{ 
            backgroundColor: confidenceColors.bg, 
            color: confidenceColors.text,
          }}
        >
          {checkIn.confidenceLevel.charAt(0).toUpperCase() + checkIn.confidenceLevel.slice(1)}
        </div>
      </div>

      {/* Suggested Calories - Prominent */}
      <div className="bg-bg-elevated rounded-xl p-4 mb-4 text-center">
        <p className="text-caption text-text-muted mb-1">Suggested Daily Intake</p>
        <p className="text-3xl font-mono font-bold text-macro-calories">
          {checkIn.suggestedCalories.toLocaleString()}
          <span className="text-lg text-text-muted ml-1">kcal</span>
        </p>
        <p className="text-xs text-text-muted mt-1">
          Based on your {checkIn.averageTdee.toLocaleString()} kcal TDEE
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Weight Change */}
        <div className="bg-bg-elevated rounded-xl p-3">
          <p className="text-caption text-text-muted mb-1">Weight Change</p>
          <p className="text-xl font-mono font-bold" style={{ color: weightChangeColor }}>
            {weightChangeSign}{convertWeight(Math.abs(checkIn.weeklyWeightChange), unit)}
            <span className="text-sm text-text-muted ml-0.5">{unit}</span>
          </p>
        </div>

        {/* Adherence */}
        <div className="bg-bg-elevated rounded-xl p-3">
          <p className="text-caption text-text-muted mb-1">Adherence</p>
          <div className="flex items-center gap-2">
            <p className="text-xl font-mono font-bold" style={{ color: adherenceColor }}>
              {adherencePercent}%
            </p>
            <span className="text-xs" style={{ color: adherenceColor }}>
              {adherenceLabel}
            </span>
          </div>
        </div>

        {/* Trend Weight Start */}
        <div className="bg-bg-elevated rounded-xl p-3">
          <p className="text-caption text-text-muted mb-1">Week Start</p>
          <p className="text-lg font-mono" style={{ color: '#60A5FA' }}>
            {convertWeight(checkIn.trendWeightStart, unit)}
            <span className="text-sm text-text-muted ml-0.5">{unit}</span>
          </p>
        </div>

        {/* Trend Weight End */}
        <div className="bg-bg-elevated rounded-xl p-3">
          <p className="text-caption text-text-muted mb-1">Week End</p>
          <p className="text-lg font-mono" style={{ color: '#60A5FA' }}>
            {convertWeight(checkIn.trendWeightEnd, unit)}
            <span className="text-sm text-text-muted ml-0.5">{unit}</span>
          </p>
        </div>
      </div>

      {/* Day Status Breakdown */}
      {dayStatusBreakdown && (
        <div className="bg-bg-elevated rounded-xl p-3 mb-4">
          <p className="text-caption text-text-muted mb-2">Logging Breakdown</p>
          <div className="flex items-center gap-4">
            {dayStatusBreakdown.complete > 0 && (
              <div className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS.complete }}
                />
                <span className="text-xs text-text-secondary">
                  {dayStatusBreakdown.complete} complete
                </span>
              </div>
            )}
            {dayStatusBreakdown.partial > 0 && (
              <div className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS.partial }}
                />
                <span className="text-xs text-text-secondary">
                  {dayStatusBreakdown.partial} partial
                </span>
              </div>
            )}
            {dayStatusBreakdown.skipped > 0 && (
              <div className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS.skipped }}
                />
                <span className="text-xs text-text-secondary">
                  {dayStatusBreakdown.skipped} skipped
                </span>
              </div>
            )}
            {dayStatusBreakdown.untracked > 0 && (
              <div className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS.untracked }}
                />
                <span className="text-xs text-text-secondary">
                  {dayStatusBreakdown.untracked} no data
                </span>
              </div>
            )}
          </div>
          {dayStatusBreakdown.skipped > 0 && (
            <p className="text-xs text-text-muted mt-2">
              Skipped days are excluded from TDEE calculations
            </p>
          )}
        </div>
      )}

      {/* Goal Alignment */}
      <div 
        className="rounded-xl p-3 flex items-center gap-3"
        style={{ backgroundColor: `${goalAlignmentColor}15` }}
      >
        <div 
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${goalAlignmentColor}25` }}
        >
          {goalAlignmentColor === '#10B981' ? (
            <svg className="w-4 h-4" style={{ color: goalAlignmentColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : goalAlignmentColor === '#EF4444' ? (
            <svg className="w-4 h-4" style={{ color: goalAlignmentColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-4 h-4" style={{ color: goalAlignmentColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
        </div>
        <div>
          <p className="text-sm font-medium" style={{ color: goalAlignmentColor }}>
            {goalAlignmentMessage}
          </p>
          {goals?.goalType && goals.goalType !== 'maintain' && (
            <p className="text-xs text-text-muted mt-0.5">
              Goal: {goals.goalType === 'lose' ? 'Lose' : 'Gain'} {goals.goalRate ?? 0.5} {unit}/week
            </p>
          )}
        </div>
      </div>

      {/* Notes */}
      {checkIn.notes && (
        <div className="mt-4 pt-4 border-t border-border-subtle">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-text-muted mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-text-muted">{checkIn.notes}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Skeleton loader
export function WeeklyCheckInCardSkeleton() {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="h-5 w-28 skeleton rounded mb-1" />
          <div className="h-4 w-32 skeleton rounded" />
        </div>
        <div className="h-6 w-16 skeleton rounded-full" />
      </div>

      <div className="bg-bg-elevated rounded-xl p-4 mb-4 text-center">
        <div className="h-4 w-32 skeleton rounded mx-auto mb-2" />
        <div className="h-10 w-40 skeleton rounded mx-auto" />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-bg-elevated rounded-xl p-3">
            <div className="h-4 w-20 skeleton rounded mb-1" />
            <div className="h-6 w-16 skeleton rounded" />
          </div>
        ))}
      </div>

      <div className="bg-bg-elevated rounded-xl p-3">
        <div className="h-4 w-48 skeleton rounded" />
      </div>
    </div>
  );
}
