'use client';

import { WeeklyChart, WeeklyChartSkeleton } from '@/components/ui/WeeklyChart';
import { MacroPieChart, MacroPieChartSkeleton } from '@/components/ui/MacroPieChart';
import type { DayData, UserGoals, LogStatus } from '@/lib/types';

interface WeeklyNutritionCardProps {
    days: DayData[];
    averages: {
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
    };
    goals: UserGoals | null;
    dayStatuses?: Map<string, LogStatus>;
    isLoading?: boolean;
}

export function WeeklyNutritionCard({
    days,
    averages,
    goals,
    dayStatuses,
    isLoading = false,
}: WeeklyNutritionCardProps) {
    const hasData = days.length > 0 && averages.calories > 0;

    // Calculate percentage of goal for each macro
    const getPercentOfGoal = (value: number, goal: number | undefined) =>
        goal ? Math.round((value / goal) * 100) : null;

    const caloriePercent = getPercentOfGoal(averages.calories, goals?.calorieGoal);
    const proteinPercent = getPercentOfGoal(averages.protein, goals?.proteinGoal);
    const carbsPercent = getPercentOfGoal(averages.carbs, goals?.carbsGoal);
    const fatPercent = getPercentOfGoal(averages.fat, goals?.fatGoal);

    // Color based on if over/under goal
    const getPercentColor = (percent: number | null) => {
        if (percent === null) return 'text-text-muted';
        if (percent >= 95 && percent <= 105) return 'text-green-400';
        if (percent > 105) return 'text-red-400';
        return 'text-amber-400';
    };

    if (isLoading) {
        return <WeeklyNutritionCardSkeleton />;
    }

    return (
        <div className="card animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <h2 className="text-card-title text-text-secondary mb-4">Weekly Nutrition</h2>

            {hasData ? (
                <>
                    {/* Weekly Bar Chart */}
                    {goals && (
                        <div className="mb-4">
                            <WeeklyChart
                                data={days}
                                calorieGoal={goals.calorieGoal}
                                dayStatuses={dayStatuses}
                            />
                        </div>
                    )}

                    {/* Macro Stats Grid + Pie Chart */}
                    <div className="flex gap-4">
                        {/* Compact Stats Grid */}
                        <div className="flex-1 grid grid-cols-2 gap-2">
                            {/* Calories */}
                            <div className="bg-bg-elevated rounded-lg p-3">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs text-text-muted">Calories</span>
                                    {caloriePercent !== null && (
                                        <span className={`text-xs font-mono ${getPercentColor(caloriePercent)}`}>
                                            {caloriePercent}%
                                        </span>
                                    )}
                                </div>
                                <p className="text-lg font-mono font-bold text-macro-calories">
                                    {averages.calories}
                                </p>
                                {goals && (
                                    <p className="text-xs text-text-muted">/ {goals.calorieGoal}</p>
                                )}
                            </div>

                            {/* Protein */}
                            <div className="bg-bg-elevated rounded-lg p-3">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs text-text-muted">Protein</span>
                                    {proteinPercent !== null && (
                                        <span className={`text-xs font-mono ${getPercentColor(proteinPercent)}`}>
                                            {proteinPercent}%
                                        </span>
                                    )}
                                </div>
                                <p className="text-lg font-mono font-bold text-macro-protein">
                                    {averages.protein}g
                                </p>
                                {goals && (
                                    <p className="text-xs text-text-muted">/ {goals.proteinGoal}g</p>
                                )}
                            </div>

                            {/* Carbs */}
                            <div className="bg-bg-elevated rounded-lg p-3">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs text-text-muted">Carbs</span>
                                    {carbsPercent !== null && (
                                        <span className={`text-xs font-mono ${getPercentColor(carbsPercent)}`}>
                                            {carbsPercent}%
                                        </span>
                                    )}
                                </div>
                                <p className="text-lg font-mono font-bold text-macro-carbs">
                                    {averages.carbs}g
                                </p>
                                {goals && (
                                    <p className="text-xs text-text-muted">/ {goals.carbsGoal}g</p>
                                )}
                            </div>

                            {/* Fat */}
                            <div className="bg-bg-elevated rounded-lg p-3">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs text-text-muted">Fat</span>
                                    {fatPercent !== null && (
                                        <span className={`text-xs font-mono ${getPercentColor(fatPercent)}`}>
                                            {fatPercent}%
                                        </span>
                                    )}
                                </div>
                                <p className="text-lg font-mono font-bold text-macro-fat">
                                    {averages.fat}g
                                </p>
                                {goals && (
                                    <p className="text-xs text-text-muted">/ {goals.fatGoal}g</p>
                                )}
                            </div>
                        </div>

                        {/* Inline Pie Chart */}
                        <div className="flex-shrink-0 flex flex-col items-center justify-center">
                            <MacroPieChart
                                protein={averages.protein}
                                carbs={averages.carbs}
                                fat={averages.fat}
                                size={100}
                                hideLegend
                            />
                            <p className="text-xs text-text-muted mt-1">Distribution</p>
                        </div>
                    </div>
                </>
            ) : (
                /* Empty State */
                <div className="text-center py-8">
                    <p className="text-4xl mb-3">📊</p>
                    <p className="text-text-secondary mb-2">No nutrition data this week</p>
                    <p className="text-caption text-text-muted">
                        Start logging meals to see your weekly stats
                    </p>
                </div>
            )}
        </div>
    );
}

// Skeleton loader
export function WeeklyNutritionCardSkeleton() {
    return (
        <div className="card">
            <div className="h-5 w-32 skeleton rounded mb-4" />
            <div className="h-40 skeleton rounded-xl mb-4" />
            <div className="flex gap-4">
                <div className="flex-1 grid grid-cols-2 gap-2">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="bg-bg-elevated rounded-lg p-3">
                            <div className="h-3 w-12 skeleton rounded mb-2" />
                            <div className="h-6 w-16 skeleton rounded" />
                        </div>
                    ))}
                </div>
                <div className="w-[100px] h-[100px] skeleton rounded-full" />
            </div>
        </div>
    );
}
