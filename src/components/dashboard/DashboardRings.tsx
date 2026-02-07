import { ProgressRing } from '@/components/ui/ProgressRing';
import type { DailySummary, UserGoals } from '@/lib/types';

interface DashboardRingsProps {
  summary: DailySummary;
  goals: UserGoals;
  pulse?: boolean;
}

export function DashboardRings({ summary, goals, pulse = false }: DashboardRingsProps) {
  return (
    <>
      <div
        className={`flex justify-center mb-6 ${pulse ? 'animate-ring-pulse' : ''}`}
      >
        <ProgressRing
          value={summary.totalCalories}
          max={goals.calorieGoal}
          color="calories"
          size="lg"
          unit="kcal"
        />
      </div>

      <div className="flex justify-center gap-6 mb-6">
        <ProgressRing
          value={summary.totalProtein}
          max={goals.proteinGoal}
          color="protein"
          size="sm"
          unit="g"
          label="Protein"
        />
        <ProgressRing
          value={summary.totalCarbs}
          max={goals.carbsGoal}
          color="carbs"
          size="sm"
          unit="g"
          label="Carbs"
        />
        <ProgressRing
          value={summary.totalFat}
          max={goals.fatGoal}
          color="fat"
          size="sm"
          unit="g"
          label="Fat"
        />
      </div>
    </>
  );
}
