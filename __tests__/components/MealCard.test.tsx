import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MealCard } from '@/components/ui/MealCard';
import type { MealEntry } from '@/lib/types';

describe('MealCard', () => {
  it('toggles expanded state for multi-ingredient meals', async () => {
    const user = userEvent.setup();
    const meal: MealEntry = {
      id: 'meal-1',
      name: 'Chicken Bowl',
      category: 'meal',
      eatenAt: new Date().toISOString(),
      totalCalories: 600,
      totalProtein: 45,
      totalCarbs: 50,
      totalFat: 20,
      totalWeightG: 500,
      ingredients: [
        {
          id: 'ing-1',
          mealId: 'meal-1',
          name: 'Chicken',
          weightG: 200,
          calories: 300,
          protein: 40,
          carbs: 0,
          fat: 6,
          source: 'USDA',
          sortOrder: 0,
        },
        {
          id: 'ing-2',
          mealId: 'meal-1',
          name: 'Rice',
          weightG: 300,
          calories: 300,
          protein: 5,
          carbs: 50,
          fat: 2,
          source: 'USDA',
          sortOrder: 1,
        },
      ],
    };

    const { container, getByRole } = render(
      <MealCard meal={meal} index={0} onEdit={jest.fn()} onDelete={jest.fn()} />
    );

    const panel = container.querySelector('.expandable-content');
    expect(panel?.className).not.toContain('expanded');

    await user.click(getByRole('button', { name: /chicken bowl/i }));
    expect(panel?.className).toContain('expanded');
  });
});
