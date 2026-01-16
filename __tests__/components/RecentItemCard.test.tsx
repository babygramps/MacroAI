import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecentItemCard, RecentItemCardSkeleton } from '@/components/ui/RecentItemCard';
import type { RecentFood } from '@/lib/types';

describe('RecentItemCard', () => {
  const mockIngredient: RecentFood = {
    id: 'ing-1',
    name: 'Chicken Breast',
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
    servingSize: 100,
    source: 'USDA',
    logCount: 5,
    lastLoggedAt: '2026-01-16T12:00:00Z',
    type: 'ingredient',
    servingDescription: '100g',
    servingSizeGrams: 100,
  };

  const mockMeal: RecentFood = {
    id: 'meal-1',
    name: 'Chicken Bowl',
    calories: 600,
    protein: 45,
    carbs: 50,
    fat: 20,
    servingSize: 500,
    source: 'MEAL',
    logCount: 3,
    lastLoggedAt: '2026-01-16T12:00:00Z',
    type: 'meal',
    category: 'meal',
    ingredients: [
      {
        id: 'ing-1',
        mealId: 'meal-1',
        name: 'Chicken',
        weightG: 200,
        calories: 330,
        protein: 40,
        carbs: 0,
        fat: 7,
        source: 'USDA',
        sortOrder: 0,
      },
      {
        id: 'ing-2',
        mealId: 'meal-1',
        name: 'Rice',
        weightG: 300,
        calories: 270,
        protein: 5,
        carbs: 50,
        fat: 1,
        source: 'USDA',
        sortOrder: 1,
      },
    ],
  };

  it('displays ingredient name and macros', () => {
    const onSelect = jest.fn();
    render(<RecentItemCard item={mockIngredient} onSelect={onSelect} />);

    expect(screen.getByText('Chicken Breast')).toBeInTheDocument();
    expect(screen.getByText('165')).toBeInTheDocument(); // calories
    expect(screen.getByText('31P')).toBeInTheDocument(); // protein
    expect(screen.getByText('0C')).toBeInTheDocument(); // carbs
    expect(screen.getByText('4F')).toBeInTheDocument(); // fat (rounded)
  });

  it('displays log count badge', () => {
    const onSelect = jest.fn();
    render(<RecentItemCard item={mockIngredient} onSelect={onSelect} />);

    expect(screen.getByText('×5')).toBeInTheDocument();
  });

  it('calls onSelect when clicked', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    render(<RecentItemCard item={mockIngredient} onSelect={onSelect} />);

    await user.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(mockIngredient);
  });

  it('displays meal category badge for meals', () => {
    const onSelect = jest.fn();
    render(<RecentItemCard item={mockMeal} onSelect={onSelect} />);

    expect(screen.getByText(/Meal/)).toBeInTheDocument();
  });

  it('displays ingredient count for multi-ingredient meals', () => {
    const onSelect = jest.fn();
    render(<RecentItemCard item={mockMeal} onSelect={onSelect} />);

    expect(screen.getByText('2 ingredients')).toBeInTheDocument();
  });

  it('displays serving description for ingredients', () => {
    const onSelect = jest.fn();
    render(<RecentItemCard item={mockIngredient} onSelect={onSelect} />);

    expect(screen.getByText(/100g/)).toBeInTheDocument();
    expect(screen.getByText(/USDA/)).toBeInTheDocument();
  });
});

describe('RecentItemCardSkeleton', () => {
  it('renders skeleton elements', () => {
    const { container } = render(<RecentItemCardSkeleton />);

    // Should have skeleton divs
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
