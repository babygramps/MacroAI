import { act, render } from '@testing-library/react';
import { DashboardRings } from '@/components/dashboard/DashboardRings';
import type { DailySummary, UserGoals } from '@/lib/types';

describe('DashboardRings', () => {
  it('renders macro totals and goals', () => {
    jest.useFakeTimers();
    const summary: DailySummary = {
      totalCalories: 1200,
      totalProtein: 110,
      totalCarbs: 140,
      totalFat: 50,
      meals: [],
      entries: [],
    };

    const goals: UserGoals = {
      calorieGoal: 2000,
      proteinGoal: 150,
      carbsGoal: 200,
      fatGoal: 65,
    };

    const { getByText } = render(<DashboardRings summary={summary} goals={goals} />);

    act(() => {
      jest.runAllTimers();
    });

    expect(getByText('1200')).toBeInTheDocument();
    expect(getByText('of 2000 kcal')).toBeInTheDocument();
    expect(getByText('Protein')).toBeInTheDocument();
    expect(getByText('Carbs')).toBeInTheDocument();
    expect(getByText('Fat')).toBeInTheDocument();
    jest.useRealTimers();
  });
});
