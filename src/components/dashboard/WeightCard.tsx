import { formatWeight } from '@/lib/statsHelpers';
import type { WeightLogEntry } from '@/lib/types';
import { isToday } from '@/lib/date';

interface WeightCardProps {
  selectedDate: Date;
  isLoading: boolean;
  latestWeight: WeightLogEntry | null;
  preferredUnit: 'kg' | 'lbs';
  onClick: () => void;
}

export function WeightCard({
  selectedDate,
  isLoading,
  latestWeight,
  preferredUnit,
  onClick,
}: WeightCardProps) {
  const formattedWeight = latestWeight ? formatWeight(latestWeight.weightKg, preferredUnit) : null;
  return (
    <div className="mb-8">
      <button
        onClick={onClick}
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
            <p className="text-caption text-text-muted">
              {isToday(selectedDate) ? "Today's Weight" : "Weight"}
            </p>
            {isLoading ? (
              <div className="h-6 w-16 skeleton rounded mt-1" />
            ) : latestWeight ? (
              <p className="text-lg font-mono font-bold text-weight">
                {formattedWeight}
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
  );
}
