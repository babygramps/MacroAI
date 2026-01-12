'use client';

import type { MetabolicInsights } from '@/lib/types';

interface MetabolicInsightsCardProps {
  insights: MetabolicInsights;
  unit?: 'kg' | 'lbs';
}

// Convert kg to lbs
function convertWeight(kg: number, unit: 'kg' | 'lbs'): string {
  if (unit === 'lbs') {
    return `${Math.round(kg * 2.20462 * 10) / 10}`;
  }
  return `${Math.round(kg * 10) / 10}`;
}

// Get confidence color
function getConfidenceColor(level: MetabolicInsights['confidenceLevel']): string {
  switch (level) {
    case 'high':
      return '#10B981'; // Green
    case 'medium':
      return '#F59E0B'; // Amber
    case 'low':
      return '#EF4444'; // Red
    case 'learning':
    default:
      return '#60A5FA'; // Blue
  }
}

// Get confidence label
function getConfidenceLabel(level: MetabolicInsights['confidenceLevel']): string {
  switch (level) {
    case 'high':
      return 'High Confidence';
    case 'medium':
      return 'Medium Confidence';
    case 'low':
      return 'Low Confidence';
    case 'learning':
    default:
      return 'Learning';
  }
}

export function MetabolicInsightsCard({ insights, unit = 'kg' }: MetabolicInsightsCardProps) {
  const confidenceColor = getConfidenceColor(insights.confidenceLevel);
  const confidenceLabel = getConfidenceLabel(insights.confidenceLevel);
  
  // Determine weight change indicator
  const weightChangeColor = insights.weeklyWeightChange > 0 
    ? '#EF4444' // Red for gaining
    : insights.weeklyWeightChange < 0 
      ? '#10B981' // Green for losing
      : '#9CA3AF'; // Gray for no change
  
  const weightChangeSign = insights.weeklyWeightChange > 0 ? '+' : '';

  return (
    <div className="card animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-card-title text-text-secondary">Metabolic Insights</h2>
        <div 
          className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs"
          style={{ backgroundColor: `${confidenceColor}20`, color: confidenceColor }}
        >
          <div 
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: confidenceColor }}
          />
          {confidenceLabel}
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* TDEE */}
        <div className="bg-bg-elevated rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <svg className="w-4 h-4 text-macro-calories" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <p className="text-caption text-text-muted">Daily Burn</p>
          </div>
          <p className="text-2xl font-mono font-bold text-macro-calories">
            {insights.currentTdee.toLocaleString()}
            <span className="text-sm text-text-muted ml-1">kcal</span>
          </p>
          {insights.isInColdStart && (
            <p className="text-xs text-text-muted mt-1">Estimated</p>
          )}
        </div>

        {/* Suggested Intake */}
        <div className="bg-bg-elevated rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <svg className="w-4 h-4 text-macro-protein" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-caption text-text-muted">Target</p>
          </div>
          <p className="text-2xl font-mono font-bold text-macro-protein">
            {insights.suggestedCalories.toLocaleString()}
            <span className="text-sm text-text-muted ml-1">kcal</span>
          </p>
          <p className="text-xs text-text-muted mt-1">
            {insights.suggestedCalories < insights.currentTdee 
              ? `${insights.currentTdee - insights.suggestedCalories} deficit`
              : insights.suggestedCalories > insights.currentTdee
                ? `${insights.suggestedCalories - insights.currentTdee} surplus`
                : 'Maintenance'}
          </p>
        </div>

        {/* Trend Weight */}
        <div className="bg-bg-elevated rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <svg className="w-4 h-4" style={{ color: '#60A5FA' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
            <p className="text-caption text-text-muted">Trend Weight</p>
          </div>
          <p className="text-2xl font-mono font-bold" style={{ color: '#60A5FA' }}>
            {convertWeight(insights.trendWeight, unit)}
            <span className="text-sm text-text-muted ml-1">{unit}</span>
          </p>
          {insights.scaleWeight && insights.scaleWeight !== insights.trendWeight && (
            <p className="text-xs text-text-muted mt-1">
              Scale: {convertWeight(insights.scaleWeight, unit)} {unit}
            </p>
          )}
        </div>

        {/* Weekly Change */}
        <div className="bg-bg-elevated rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <p className="text-caption text-text-muted">Weekly Change</p>
          </div>
          <p className="text-2xl font-mono font-bold" style={{ color: weightChangeColor }}>
            {weightChangeSign}{convertWeight(Math.abs(insights.weeklyWeightChange), unit)}
            <span className="text-sm text-text-muted ml-1">{unit}/wk</span>
          </p>
          <p className="text-xs text-text-muted mt-1">
            {insights.weeklyWeightChange < 0 
              ? 'Losing' 
              : insights.weeklyWeightChange > 0 
                ? 'Gaining' 
                : 'Stable'}
          </p>
        </div>
      </div>

      {/* Tracking Progress */}
      <div className="bg-bg-elevated rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-caption text-text-muted">Tracking Data</p>
          <p className="text-sm font-mono text-text-secondary">
            {insights.daysTracked} days
          </p>
        </div>
        
        {/* Progress bar */}
        <div className="h-2 bg-bg-primary rounded-full overflow-hidden">
          <div 
            className="h-full rounded-full transition-all duration-500"
            style={{ 
              width: `${Math.min(100, (insights.daysTracked / 30) * 100)}%`,
              backgroundColor: '#60A5FA',
            }}
          />
        </div>
        
        <p className="text-xs text-text-muted mt-2">
          {insights.daysTracked < 7 
            ? `${7 - insights.daysTracked} more days for personalized TDEE`
            : insights.daysTracked < 14
              ? 'TDEE calibrating - accuracy improving'
              : insights.daysTracked < 30
                ? 'Good data - TDEE is reliable'
                : 'Excellent data - TDEE is highly accurate'}
        </p>
      </div>

      {/* Info Footer */}
      <div className="mt-4 pt-4 border-t border-border-subtle">
        <div className="flex items-start gap-2">
          <svg className="w-4 h-4 text-text-muted mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-text-muted">
            Your TDEE is calculated by analyzing your weight changes and calorie intake. 
            The more consistently you log, the more accurate it becomes.
          </p>
        </div>
      </div>
    </div>
  );
}

// Skeleton loader
export function MetabolicInsightsCardSkeleton() {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="h-5 w-32 skeleton rounded" />
        <div className="h-6 w-24 skeleton rounded-full" />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-bg-elevated rounded-xl p-4">
            <div className="h-4 w-20 skeleton rounded mb-2" />
            <div className="h-8 w-24 skeleton rounded" />
          </div>
        ))}
      </div>

      <div className="bg-bg-elevated rounded-xl p-4">
        <div className="h-4 w-24 skeleton rounded mb-2" />
        <div className="h-2 w-full skeleton rounded-full" />
      </div>
    </div>
  );
}
