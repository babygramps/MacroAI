'use client';

import { WeightChart } from '@/components/ui/WeightChart';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import type { WeightLogEntry, WeightDataPoint } from '@/lib/types';

interface WeightJourneyCardProps {
    trendWeight: number | null;
    scaleWeight: number | null;
    weeklyChange: number | null;
    targetWeight: number | null;
    entries: WeightLogEntry[];
    trendData: WeightDataPoint[];
    unit: 'kg' | 'lbs';
    onLogWeight: () => void;
}

// Format weight with unit conversion
function formatWeight(weightKg: number, unit: 'kg' | 'lbs'): string {
    if (unit === 'lbs') {
        return `${Math.round(weightKg * 2.20462 * 10) / 10}`;
    }
    return `${Math.round(weightKg * 10) / 10}`;
}

export function WeightJourneyCard({
    trendWeight,
    scaleWeight,
    weeklyChange,
    targetWeight,
    entries,
    trendData,
    unit,
    onLogWeight,
}: WeightJourneyCardProps) {
    const hasData = trendWeight !== null || scaleWeight !== null;
    const hasChartData = entries.length >= 2;

    // Weight change color
    const changeColor = weeklyChange !== null
        ? weeklyChange > 0
            ? '#EF4444' // Red for gaining
            : weeklyChange < 0
                ? '#10B981' // Green for losing
                : '#9CA3AF'
        : '#9CA3AF';

    const changeSign = weeklyChange !== null && weeklyChange > 0 ? '+' : '';

    // Calculate progress to goal
    const currentWeight = trendWeight ?? scaleWeight ?? 0;
    const progressToGoal = targetWeight && currentWeight
        ? Math.abs(currentWeight - targetWeight)
        : null;

    return (
        <div className="card animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            {/* Header with Log Button */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-card-title text-text-secondary">Weight Journey</h2>
                <button
                    onClick={onLogWeight}
                    className="preset-button text-weight"
                >
                    <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Log
                </button>
            </div>

            {hasData ? (
                <>
                    {/* Stats Row */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        {/* Trend Weight */}
                        <div className="bg-bg-elevated rounded-xl p-4">
                            <div className="flex items-center gap-1.5 mb-1">
                                <svg className="w-4 h-4" style={{ color: '#60A5FA' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                                </svg>
                                <p className="text-caption text-text-muted">Trend</p>
                                <InfoTooltip text="Smoothed weight that filters out daily fluctuations from water, food, etc." />
                            </div>
                            <p className="text-2xl font-mono font-bold" style={{ color: '#60A5FA' }}>
                                {formatWeight(trendWeight ?? scaleWeight ?? 0, unit)}
                                <span className="text-sm text-text-muted ml-1">{unit}</span>
                            </p>
                            {scaleWeight && trendWeight && scaleWeight !== trendWeight && (
                                <p className="text-xs text-text-muted mt-1">
                                    Scale: {formatWeight(scaleWeight, unit)} {unit}
                                </p>
                            )}
                        </div>

                        {/* 7-Day Change */}
                        <div className="bg-bg-elevated rounded-xl p-4">
                            <div className="flex items-center gap-1.5 mb-1">
                                <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                                <p className="text-caption text-text-muted">7-Day</p>
                                <InfoTooltip text="How much your weight has changed over the past week" />
                            </div>
                            {weeklyChange !== null ? (
                                <p className="text-2xl font-mono font-bold" style={{ color: changeColor }}>
                                    {changeSign}{formatWeight(Math.abs(weeklyChange), unit)}
                                    <span className="text-sm text-text-muted ml-1">{unit}</span>
                                </p>
                            ) : (
                                <p className="text-xl text-text-muted">—</p>
                            )}
                            {weeklyChange !== null && (
                                <p className="text-xs text-text-muted mt-1">
                                    {weeklyChange < 0 ? 'Lost' : weeklyChange > 0 ? 'Gained' : 'Stable'}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Weight Chart */}
                    {hasChartData ? (
                        <WeightChart
                            data={entries}
                            unit={unit}
                            targetWeight={targetWeight ?? undefined}
                            trendData={trendData}
                            showTrendLine={true}
                        />
                    ) : entries.length === 1 ? (
                        <p className="text-caption text-text-muted text-center py-4">
                            Log more weights to see your progress chart
                        </p>
                    ) : null}

                    {/* Goal Progress Footer */}
                    {targetWeight && progressToGoal !== null && (
                        <div className="mt-4 pt-4 border-t border-border-subtle">
                            <div className="flex items-center justify-between">
                                <span className="text-caption text-text-muted">Goal</span>
                                <span className="text-sm font-mono text-green-400">
                                    {formatWeight(targetWeight, unit)} {unit}
                                </span>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                                <span className="text-caption text-text-muted">To go</span>
                                <span className="text-sm font-mono text-text-secondary">
                                    {formatWeight(progressToGoal, unit)} {unit}
                                </span>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                /* Empty State */
                <div className="text-center py-8">
                    <p className="text-4xl mb-3">⚖️</p>
                    <p className="text-text-secondary mb-2">No weight data yet</p>
                    <p className="text-caption text-text-muted mb-4">
                        Start tracking your weight to see progress
                    </p>
                    <button
                        onClick={onLogWeight}
                        className="btn-primary"
                    >
                        Log Your First Weight
                    </button>
                </div>
            )}
        </div>
    );
}

// Skeleton loader
export function WeightJourneyCardSkeleton() {
    return (
        <div className="card">
            <div className="flex items-center justify-between mb-4">
                <div className="h-5 w-28 skeleton rounded" />
                <div className="h-8 w-16 skeleton rounded" />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
                {[1, 2].map((i) => (
                    <div key={i} className="bg-bg-elevated rounded-xl p-4">
                        <div className="h-4 w-16 skeleton rounded mb-2" />
                        <div className="h-8 w-24 skeleton rounded" />
                    </div>
                ))}
            </div>
            <div className="h-48 skeleton rounded-xl" />
        </div>
    );
}
