import { calculateMealTotals } from '@/lib/meal/totals';

describe('calculateMealTotals', () => {
  it('sums nutrition totals and weight', () => {
    const totals = calculateMealTotals([
      {
        name: 'Chicken',
        weightG: 120,
        calories: 240,
        protein: 32,
        carbs: 0,
        fat: 6,
        source: 'USDA',
      },
      {
        name: 'Rice',
        weightG: 180,
        calories: 230,
        protein: 4,
        carbs: 50,
        fat: 1,
        source: 'USDA',
      },
    ]);

    expect(totals).toEqual({
      totalCalories: 470,
      totalProtein: 36,
      totalCarbs: 50,
      totalFat: 7,
      totalWeightG: 300,
    });
  });
});
