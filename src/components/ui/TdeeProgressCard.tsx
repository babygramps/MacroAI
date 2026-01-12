'use client';

import { METABOLIC_CONSTANTS } from '@/lib/types';

interface TdeeProgressCardProps {
  daysTracked: number;
  coldStartTdee: number | null;
  isInColdStart: boolean;
}

const { COLD_START_DAYS } = METABOLIC_CONSTANTS;

export function TdeeProgressCard({ 
  daysTracked, 
  coldStartTdee,
  isInColdStart,
}: TdeeProgressCardProps) {
  const progress = Math.min(100, (daysTracked / COLD_START_DAYS) * 100);
  const daysRemaining = Math.max(0, COLD_START_DAYS - daysTracked);
  
  // Calculate progress segments for visual effect
  const segments = Array.from({ length: COLD_START_DAYS }, (_, i) => ({
    filled: i < daysTracked,
    current: i === daysTracked - 1,
  }));

  if (!isInColdStart) {
    return null; // Don't show if we're past cold start
  }

  return (
    <div className="card animate-fade-in-up bg-gradient-to-br from-bg-surface to-bg-elevated border-[#60A5FA]/20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div 
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'rgba(96, 165, 250, 0.15)' }}
        >
          <svg 
            className="w-6 h-6" 
            style={{ color: '#60A5FA' }}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" 
            />
          </svg>
        </div>
        <div>
          <h3 className="text-card-title">Learning Your Metabolism</h3>
          <p className="text-caption text-text-muted">
            {daysRemaining === 0 
              ? 'Almost there!' 
              : `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} until personalized TDEE`}
          </p>
        </div>
      </div>

      {/* Progress Segments */}
      <div className="flex gap-1 mb-4">
        {segments.map((segment, index) => (
          <div
            key={index}
            className={`flex-1 h-3 rounded-full transition-all duration-500 ${
              segment.filled 
                ? 'bg-[#60A5FA]' 
                : 'bg-bg-primary'
            } ${segment.current ? 'animate-pulse' : ''}`}
            style={{
              boxShadow: segment.filled ? '0 0 8px rgba(96, 165, 250, 0.4)' : 'none',
            }}
          />
        ))}
      </div>

      {/* Stats Row */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="text-text-muted">Progress:</span>
          <span className="font-mono font-bold" style={{ color: '#60A5FA' }}>
            {daysTracked}/{COLD_START_DAYS} days
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-text-muted">Accuracy:</span>
          <span className="font-mono font-bold" style={{ color: '#60A5FA' }}>
            {Math.round(progress)}%
          </span>
        </div>
      </div>

      {/* Estimated TDEE during cold start */}
      {coldStartTdee && (
        <div className="mt-4 pt-4 border-t border-border-subtle">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="text-caption text-text-muted">Estimated TDEE:</span>
            </div>
            <span className="font-mono text-macro-calories">
              {coldStartTdee.toLocaleString()} kcal
            </span>
          </div>
          <p className="text-xs text-text-muted mt-2">
            Based on your profile. This estimate will be replaced with your actual TDEE 
            once we have enough tracking data.
          </p>
        </div>
      )}

      {/* Tips */}
      <div className="mt-4 bg-bg-primary rounded-xl p-3">
        <div className="flex items-start gap-2">
          <svg className="w-4 h-4 text-macro-protein mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-xs text-text-secondary font-medium">Tips for better accuracy:</p>
            <ul className="text-xs text-text-muted mt-1 space-y-0.5">
              <li>Log all meals, even small snacks</li>
              <li>Weigh yourself daily, same time</li>
              <li>Be consistent with tracking</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// Skeleton loader
export function TdeeProgressCardSkeleton() {
  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full skeleton" />
        <div>
          <div className="h-5 w-40 skeleton rounded mb-1" />
          <div className="h-4 w-32 skeleton rounded" />
        </div>
      </div>

      <div className="flex gap-1 mb-4">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="flex-1 h-3 rounded-full skeleton" />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="h-4 w-24 skeleton rounded" />
        <div className="h-4 w-20 skeleton rounded" />
      </div>
    </div>
  );
}
