'use client';

import { METABOLIC_CONSTANTS, type ConfidenceLevel, type GoalType } from '@/lib/types';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

interface StatsHeroCardProps {
    targetCalories: number;
    tdee: number;
    streak: number;
    confidenceLevel: ConfidenceLevel;
    isInColdStart: boolean;
    coldStartProgress?: { daysTracked: number; daysRequired: number };
    goalType?: GoalType;
}

// Get confidence color
function getConfidenceColor(level: ConfidenceLevel): string {
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
function getConfidenceLabel(level: ConfidenceLevel): string {
    switch (level) {
        case 'high':
            return 'High Accuracy';
        case 'medium':
            return 'Medium Accuracy';
        case 'low':
            return 'Low Accuracy';
        case 'learning':
        default:
            return 'Learning';
    }
}

// Get goal type config
function getGoalConfig(type: GoalType | undefined) {
    switch (type) {
        case 'lose':
            return { label: 'Cutting', color: '#10B981', icon: '📉' };
        case 'gain':
            return { label: 'Bulking', color: '#60A5FA', icon: '📈' };
        case 'maintain':
        default:
            return { label: 'Maintaining', color: '#9CA3AF', icon: '⚖️' };
    }
}

export function StatsHeroCard({
    targetCalories,
    tdee,
    streak,
    confidenceLevel,
    isInColdStart,
    coldStartProgress,
    goalType,
}: StatsHeroCardProps) {
    const confidenceColor = getConfidenceColor(confidenceLevel);
    const confidenceLabel = getConfidenceLabel(confidenceLevel);
    const goalConfig = getGoalConfig(goalType);

    const progress = coldStartProgress
        ? Math.min(100, (coldStartProgress.daysTracked / coldStartProgress.daysRequired) * 100)
        : 100;

    return (
        <div className="card animate-fade-in-up bg-gradient-to-br from-bg-surface to-bg-elevated">
            {/* Goal Badge */}
            <div className="flex items-center justify-between mb-4">
                <div
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{ backgroundColor: `${goalConfig.color}20`, color: goalConfig.color }}
                >
                    <span>{goalConfig.icon}</span>
                    {goalConfig.label}
                </div>
                {/* Confidence Badge (when not in cold start) */}
                {!isInColdStart && (
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
                )}
            </div>

            {/* Main Stats Row */}
            <div className="grid grid-cols-3 gap-3 mb-4">
                {/* Target Intake */}
                <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                        <svg className="w-4 h-4 text-macro-protein" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <span className="text-xs text-text-muted">Target</span>
                        <InfoTooltip text="Your daily calorie goal based on your TDEE and weight goal" />
                    </div>
                    <p className="text-2xl font-mono font-bold text-macro-protein">
                        {targetCalories.toLocaleString()}
                    </p>
                    <p className="text-xs text-text-muted">kcal</p>
                </div>

                {/* TDEE */}
                <div className="text-center border-x border-border-subtle">
                    <div className="flex items-center justify-center gap-1 mb-1">
                        <svg className="w-4 h-4 text-macro-calories" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span className="text-xs text-text-muted">Burn</span>
                        <InfoTooltip text="TDEE: Total Daily Energy Expenditure - calories your body burns each day" />
                    </div>
                    <p className="text-2xl font-mono font-bold text-macro-calories">
                        {tdee.toLocaleString()}
                    </p>
                    <p className="text-xs text-text-muted">kcal</p>
                </div>

                {/* Streak */}
                <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                        <span className="text-sm">
                            {streak >= 7 ? '🔥' : streak >= 3 ? '✨' : '💪'}
                        </span>
                        <span className="text-xs text-text-muted">Streak</span>
                    </div>
                    <p className="text-2xl font-mono font-bold text-macro-calories">
                        {streak}
                    </p>
                    <p className="text-xs text-text-muted">{streak === 1 ? 'day' : 'days'}</p>
                </div>
            </div>

            {/* Cold Start Progress Bar */}
            {isInColdStart && coldStartProgress && (
                <div className="bg-bg-primary rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" style={{ color: '#60A5FA' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                            <span className="text-xs text-text-secondary font-medium">Learning your metabolism</span>
                        </div>
                        <span className="text-xs font-mono" style={{ color: '#60A5FA' }}>
                            {coldStartProgress.daysTracked}/{coldStartProgress.daysRequired}
                        </span>
                    </div>
                    <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                                width: `${progress}%`,
                                backgroundColor: '#60A5FA',
                                boxShadow: '0 0 8px rgba(96, 165, 250, 0.4)',
                            }}
                        />
                    </div>
                    <p className="text-xs text-text-muted mt-2">
                        {coldStartProgress.daysRequired - coldStartProgress.daysTracked} more days for personalized TDEE
                    </p>
                </div>
            )}

            {/* Deficit/Surplus indicator (when not in cold start) */}
            {!isInColdStart && (
                <div className="bg-bg-primary rounded-xl px-3 py-2 text-center">
                    <span className="text-xs text-text-muted">
                        {targetCalories < tdee
                            ? `${tdee - targetCalories} kcal deficit`
                            : targetCalories > tdee
                                ? `${targetCalories - tdee} kcal surplus`
                                : 'Maintenance'}
                    </span>
                </div>
            )}
        </div>
    );
}

// Skeleton loader
export function StatsHeroCardSkeleton() {
    return (
        <div className="card">
            <div className="flex items-center justify-between mb-4">
                <div className="h-6 w-24 skeleton rounded-full" />
                <div className="h-6 w-28 skeleton rounded-full" />
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="text-center">
                        <div className="h-4 w-12 skeleton rounded mx-auto mb-2" />
                        <div className="h-8 w-16 skeleton rounded mx-auto" />
                    </div>
                ))}
            </div>
            <div className="h-16 skeleton rounded-xl" />
        </div>
    );
}
