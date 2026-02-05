'use client';

import { useState } from 'react';
import { WeightChart } from '@/components/ui/WeightChart';
import { TdeeChart } from '@/components/ui/TdeeChart'; // From Insights
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import type { WeightLogEntry, WeightDataPoint, GoalType, WeeklyCheckIn, TdeeDataPoint } from '@/lib/types';

interface WeightJourneyCardProps {
    // Weight Stats
    trendWeight: number | null;
    scaleWeight: number | null;
    weeklyTrendChange: number | null; // Unified smoothed metric
    targetWeight: number | null;
    entries: WeightLogEntry[];
    trendData: WeightDataPoint[];
    unit: 'kg' | 'lbs';

    // Insights Stats
    goalType: GoalType;
    goalRate: number | null; // kg/week
    adherenceScore: number | null;
    weeklyCheckIn: WeeklyCheckIn | null;
    tdeeHistory: TdeeDataPoint[];
    targetCalories?: number;
    isInColdStart?: boolean;

    // Actions
    onLogWeight: () => void;
}

// Format weight with unit conversion
function formatWeight(weightKg: number, unit: 'kg' | 'lbs'): string {
    if (unit === 'lbs') {
        return `${Math.round(weightKg * 2.20462 * 10) / 10}`;
    }
    return `${Math.round(weightKg * 10) / 10}`;
}

// Convert kg to user's unit (helper for goal rate)
function convertWeight(kg: number, unit: 'kg' | 'lbs'): string {
    if (unit === 'lbs') {
        return `${Math.round(kg * 2.20462 * 10) / 10}`;
    }
    return `${Math.round(kg * 10) / 10}`;
}

// Get goal alignment info (From InsightsCard)
function getGoalAlignment(goalType: GoalType, weeklyWeightChange: number) {
    if (goalType === 'lose') {
        if (weeklyWeightChange < 0) {
            return {
                message: 'On track for weight loss',
                color: '#10B981',
                icon: 'check',
            };
        } else if (weeklyWeightChange > 0) {
            return {
                message: 'Gaining instead of losing',
                color: '#EF4444',
                icon: 'x',
            };
        } else {
            return {
                message: 'Weight stable - increase deficit',
                color: '#F59E0B',
                icon: 'warning',
            };
        }
    } else if (goalType === 'gain') {
        if (weeklyWeightChange > 0) {
            return {
                message: 'On track for weight gain',
                color: '#10B981',
                icon: 'check',
            };
        } else if (weeklyWeightChange < 0) {
            return {
                message: 'Losing instead of gaining',
                color: '#EF4444',
                icon: 'x',
            };
        } else {
            return {
                message: 'Weight stable - increase surplus',
                color: '#F59E0B',
                icon: 'warning',
            };
        }
    } else {
        // maintain
        if (Math.abs(weeklyWeightChange) < 0.2) {
            return {
                message: 'Maintaining well',
                color: '#10B981',
                icon: 'check',
            };
        } else {
            return {
                message: 'Weight drifting - adjust intake',
                color: '#F59E0B',
                icon: 'warning',
            };
        }
    }
}

// Get adherence color (From InsightsCard)
function getAdherenceColor(score: number): string {
    if (score >= 0.85) return '#10B981';
    if (score >= 0.7) return '#F59E0B';
    return '#EF4444';
}

// Get adherence label (From InsightsCard)
function getAdherenceLabel(score: number): string {
    if (score >= 0.85) return 'Excellent';
    if (score >= 0.7) return 'Good';
    if (score >= 0.5) return 'Fair';
    return 'Needs work';
}

// Icons
function CheckIcon({ color }: { color: string }) {
    return (
        <svg className="w-4 h-4" style={{ color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
    );
}

function XIcon({ color }: { color: string }) {
    return (
        <svg className="w-4 h-4" style={{ color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
    );
}

function WarningIcon({ color }: { color: string }) {
    return (
        <svg className="w-4 h-4" style={{ color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
    );
}

export function WeightJourneyCard({
    trendWeight,
    scaleWeight,
    weeklyTrendChange,
    targetWeight,
    entries,
    trendData,
    unit,
    onLogWeight,
    goalType,
    goalRate,
    adherenceScore,
    weeklyCheckIn,
    tdeeHistory,
    targetCalories,
    isInColdStart = false,
}: WeightJourneyCardProps) {
    const [showTdeeChart, setShowTdeeChart] = useState(false);

    // Use smoothed weekly change for goal alignment
    const goalAlignment = getGoalAlignment(goalType, weeklyTrendChange ?? 0);

    const hasData = trendWeight !== null || scaleWeight !== null;
    const hasChartData = entries.length >= 2;
    const hasEnoughTdeeData = tdeeHistory.length >= 2 && !isInColdStart;

    // Weight change color for stats display
    const changeColor = weeklyTrendChange !== null
        ? weeklyTrendChange > 0
            ? '#EF4444' // Red for gaining
            : weeklyTrendChange < 0
                ? '#10B981' // Green for losing
                : '#9CA3AF'
        : '#9CA3AF';

    const changeSign = weeklyTrendChange !== null && weeklyTrendChange > 0 ? '+' : '';

    return (
        <div className="card animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            {/* Header with Log Button */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-card-title text-text-secondary">Weight & Insights</h2>
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
                    {/* Goal Alignment Banner (from Insights) */}
                    {/* Don't show during cold start if unknown */}
                    {!(isInColdStart && !adherenceScore) && (
                        <div
                            className="rounded-xl p-3 flex items-center gap-3 mb-4"
                            style={{ backgroundColor: `${goalAlignment.color}15` }}
                        >
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: `${goalAlignment.color}25` }}
                            >
                                {goalAlignment.icon === 'check' && <CheckIcon color={goalAlignment.color} />}
                                {goalAlignment.icon === 'x' && <XIcon color={goalAlignment.color} />}
                                {goalAlignment.icon === 'warning' && <WarningIcon color={goalAlignment.color} />}
                            </div>
                            <div>
                                <p className="text-sm font-medium" style={{ color: goalAlignment.color }}>
                                    {goalAlignment.message}
                                </p>
                                {goalType !== 'maintain' && goalRate && (
                                    <p className="text-xs text-text-muted mt-0.5">
                                        Goal: {goalType === 'lose' ? 'Lose' : 'Gain'} {convertWeight(goalRate, unit)} {unit}/week
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Stats Grid (Merged) */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        {/* Trend Weight */}
                        <div className="bg-bg-elevated rounded-xl p-3">
                            <div className="flex items-center gap-1.5 mb-1">
                                <svg className="w-4 h-4" style={{ color: '#60A5FA' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                                </svg>
                                <p className="text-caption text-text-muted">Trend</p>
                                <InfoTooltip text="Your true weight (smoothed moving average). Ignores daily water weight fluctuations." />
                            </div>
                            <p className="text-2xl font-mono font-bold" style={{ color: '#60A5FA' }}>
                                {formatWeight(trendWeight ?? scaleWeight ?? 0, unit)}
                                <span className="text-sm text-text-muted ml-1">{unit}</span>
                            </p>
                            {/* Unified 7-Day Change (Trend based) */}
                            <div className="mt-2 pt-2 border-t border-border-subtle flex items-center justify-between">
                                <div className="flex items-center gap-1">
                                    <span className="text-caption text-text-muted">7-Day</span>
                                    <InfoTooltip text="Change in trend weight over the last 7 days." />
                                </div>
                                <span className={`text-sm font-mono font-medium`} style={{ color: changeColor }}>
                                    {weeklyTrendChange !== null ? `${changeSign}${formatWeight(Math.abs(weeklyTrendChange), unit)}` : '—'}
                                </span>
                            </div>
                        </div>

                        {/* Adherence (from Insights) or Target */}
                        {adherenceScore !== null ? (
                            <div className="bg-bg-elevated rounded-xl p-3">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <p className="text-caption text-text-muted">Adherence</p>
                                    <InfoTooltip text="% of days logged this week. Consistent logging improves TDEE accuracy." />
                                </div>
                                <div className="flex items-center gap-2 mb-1">
                                    <p
                                        className="text-2xl font-mono font-bold"
                                        style={{ color: getAdherenceColor(adherenceScore) }}
                                    >
                                        {Math.round(adherenceScore * 100)}%
                                    </p>
                                </div>
                                <p className="text-xs" style={{ color: getAdherenceColor(adherenceScore) }}>
                                    {getAdherenceLabel(adherenceScore)}
                                </p>

                                {/* Target Weight Mini-stat (moved here) */}
                                {targetWeight && (
                                    <div className="mt-2 pt-2 border-t border-border-subtle flex items-center justify-between">
                                        <span className="text-caption text-text-muted">Goal</span>
                                        <span className="text-sm font-mono text-green-400">
                                            {formatWeight(targetWeight, unit)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            // Fallback if no adherence (e.g. strict cold start with no food logs)
                            <div className="bg-bg-elevated rounded-xl p-3 flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <p className="text-caption text-text-muted">Goal</p>
                                    </div>
                                    <p className="text-xl font-mono text-green-400">
                                        {targetWeight ? `${formatWeight(targetWeight, unit)} ${unit}` : 'Not set'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Weight Chart (with dots) */}
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

                    {/* TDEE Chart Toggle (from Insights) */}
                    {hasEnoughTdeeData && (
                        <div className="border-t border-border-subtle pt-3 mt-2">
                            <button
                                onClick={() => setShowTdeeChart(!showTdeeChart)}
                                className="w-full flex items-center justify-between py-2 text-left"
                            >
                                <span className="text-sm text-text-secondary font-medium">
                                    TDEE Over Time
                                </span>
                                <svg
                                    className={`w-5 h-5 text-text-muted transition-transform ${showTdeeChart ? 'rotate-180' : ''}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {showTdeeChart && (
                                <div className="mt-3">
                                    <TdeeChart
                                        data={tdeeHistory}
                                        targetCalories={targetCalories}
                                        showRawPoints={true}
                                    />
                                    <p className="text-caption text-text-muted text-center mt-2">
                                        Your daily energy expenditure over the last 30 days
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tips (from Insights) */}
                    {adherenceScore !== null && adherenceScore < 0.7 && (
                        <div className="mt-3 bg-bg-primary rounded-xl p-3">
                            <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-macro-protein mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <div>
                                    <p className="text-xs text-text-secondary font-medium">Tips to improve:</p>
                                    <ul className="text-xs text-text-muted mt-1 space-y-0.5">
                                        <li>Log all meals, even small snacks</li>
                                        <li>Weigh yourself daily for better data</li>
                                    </ul>
                                </div>
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
            <div className="h-10 w-full skeleton rounded-xl mb-4" /> {/* Goal banner */}
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
