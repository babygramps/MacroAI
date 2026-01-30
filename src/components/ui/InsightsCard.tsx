'use client';

import { useState } from 'react';
import { TdeeChart } from '@/components/ui/TdeeChart';
import type { GoalType, WeeklyCheckIn, TdeeDataPoint } from '@/lib/types';

interface InsightsCardProps {
    goalType: GoalType;
    weeklyWeightChange: number;
    goalRate: number | null;
    adherenceScore: number | null;
    weeklyCheckIn: WeeklyCheckIn | null;
    tdeeHistory: TdeeDataPoint[];
    targetCalories?: number;
    unit: 'kg' | 'lbs';
    isInColdStart?: boolean;
}

// Convert kg to user's unit
function convertWeight(kg: number, unit: 'kg' | 'lbs'): string {
    if (unit === 'lbs') {
        return `${Math.round(kg * 2.20462 * 10) / 10}`;
    }
    return `${Math.round(kg * 10) / 10}`;
}

// Get goal alignment info
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

// Get adherence color
function getAdherenceColor(score: number): string {
    if (score >= 0.85) return '#10B981';
    if (score >= 0.7) return '#F59E0B';
    return '#EF4444';
}

// Get adherence label
function getAdherenceLabel(score: number): string {
    if (score >= 0.85) return 'Excellent';
    if (score >= 0.7) return 'Good';
    if (score >= 0.5) return 'Fair';
    return 'Needs work';
}

// Icon components
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

export function InsightsCard({
    goalType,
    weeklyWeightChange,
    goalRate,
    adherenceScore,
    weeklyCheckIn,
    tdeeHistory,
    targetCalories,
    unit,
    isInColdStart = false,
}: InsightsCardProps) {
    const [showTdeeChart, setShowTdeeChart] = useState(false);
    const goalAlignment = getGoalAlignment(goalType, weeklyWeightChange);
    const hasEnoughTdeeData = tdeeHistory.length >= 2 && !isInColdStart;

    // Don't show this card during cold start if there's no meaningful data
    if (isInColdStart && !adherenceScore && !weeklyCheckIn) {
        return null;
    }

    return (
        <div className="card animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <h2 className="text-card-title text-text-secondary mb-4">Insights</h2>

            {/* Goal Alignment */}
            <div
                className="rounded-xl p-3 flex items-center gap-3 mb-3"
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

            {/* Stats Row */}
            <div className="grid grid-cols-2 gap-3 mb-3">
                {/* Adherence */}
                {adherenceScore !== null && (
                    <div className="bg-bg-elevated rounded-xl p-3">
                        <p className="text-caption text-text-muted mb-1">Adherence</p>
                        <div className="flex items-center gap-2">
                            <p
                                className="text-xl font-mono font-bold"
                                style={{ color: getAdherenceColor(adherenceScore) }}
                            >
                                {Math.round(adherenceScore * 100)}%
                            </p>
                            <span
                                className="text-xs"
                                style={{ color: getAdherenceColor(adherenceScore) }}
                            >
                                {getAdherenceLabel(adherenceScore)}
                            </span>
                        </div>
                    </div>
                )}

                {/* Weekly Weight Change */}
                <div className="bg-bg-elevated rounded-xl p-3">
                    <p className="text-caption text-text-muted mb-1">This Week</p>
                    <p
                        className="text-xl font-mono font-bold"
                        style={{
                            color: weeklyWeightChange < 0
                                ? '#10B981'
                                : weeklyWeightChange > 0
                                    ? '#EF4444'
                                    : '#9CA3AF'
                        }}
                    >
                        {weeklyWeightChange > 0 ? '+' : ''}{convertWeight(Math.abs(weeklyWeightChange), unit)}
                        <span className="text-sm text-text-muted ml-1">{unit}</span>
                    </p>
                </div>
            </div>

            {/* TDEE Chart Toggle */}
            {hasEnoughTdeeData && (
                <div className="border-t border-border-subtle pt-3">
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

            {/* Tips */}
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
                                <li>Weigh yourself daily at the same time</li>
                                <li>Be consistent with tracking</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Skeleton loader
export function InsightsCardSkeleton() {
    return (
        <div className="card">
            <div className="h-5 w-20 skeleton rounded mb-4" />
            <div className="h-16 skeleton rounded-xl mb-3" />
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-bg-elevated rounded-xl p-3">
                    <div className="h-4 w-16 skeleton rounded mb-2" />
                    <div className="h-6 w-12 skeleton rounded" />
                </div>
                <div className="bg-bg-elevated rounded-xl p-3">
                    <div className="h-4 w-16 skeleton rounded mb-2" />
                    <div className="h-6 w-12 skeleton rounded" />
                </div>
            </div>
        </div>
    );
}
