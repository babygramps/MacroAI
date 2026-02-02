import { act, renderHook, waitFor } from '@testing-library/react';
import { useDashboardData } from '@/lib/hooks/useDashboardData';
import { calculateDailyTotals, DEFAULT_GOALS, fetchDashboardData } from '@/lib/data/dashboard';
import { fetchDayStatus } from '@/actions/updateDayStatus';
import type { MealEntry } from '@/lib/types';

jest.mock('@/lib/data/dashboard', () => {
  const actual = jest.requireActual('@/lib/data/dashboard');
  return {
    ...actual,
    fetchDashboardData: jest.fn(),
  };
});

jest.mock('@/actions/updateDayStatus', () => ({
  fetchDayStatus: jest.fn(),
  fetchDayStatusRange: jest.fn(),
}));

jest.mock('@/lib/data/amplifyClient', () => ({
  getAmplifyDataClient: jest.fn(() => null),
}));

jest.mock('@/lib/metabolicService', () => ({
  backfillMetabolicData: jest.fn(),
}));

jest.mock('@/lib/clientLogger', () => ({
  logRemote: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  getErrorContext: jest.fn(() => ({})),
}));

jest.mock('@/lib/logger', () => ({
  logError: jest.fn(),
}));

const emptySummary = {
  totalCalories: 0,
  totalProtein: 0,
  totalCarbs: 0,
  totalFat: 0,
  meals: [],
  entries: [],
};

const baseData = {
  goals: DEFAULT_GOALS,
  summary: emptySummary,
  latestWeight: null,
  needsOnboarding: false,
};

function createMeal(id: string, eatenAt: string): MealEntry {
  return {
    id,
    name: 'Test Meal',
    category: 'meal',
    eatenAt,
    totalCalories: 100,
    totalProtein: 10,
    totalCarbs: 5,
    totalFat: 2,
    totalWeightG: 100,
    ingredients: [],
  };
}

describe('useDashboardData optimistic merge', () => {
  const mockFetchDashboardData = fetchDashboardData as jest.MockedFunction<typeof fetchDashboardData>;
  const mockFetchDayStatus = fetchDayStatus as jest.MockedFunction<typeof fetchDayStatus>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchDashboardData.mockResolvedValue(baseData);
    mockFetchDayStatus.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps optimistic meal after refresh when backend is missing it', async () => {
    const selectedDate = new Date('2026-02-01T10:00:00.000Z');
    const optimisticMeal = createMeal('meal-1', '2026-02-01T18:00:00.000Z');

    const { result } = renderHook(() => useDashboardData(selectedDate));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addOptimisticMeal(optimisticMeal, false);
      result.current.setSummary((prev) => calculateDailyTotals([...prev.meals, optimisticMeal]));
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.summary.meals.some((meal) => meal.id === optimisticMeal.id)).toBe(true);
  });

  it('deduplicates when backend returns the optimistic meal', async () => {
    const selectedDate = new Date('2026-02-01T10:00:00.000Z');
    const optimisticMeal = createMeal('meal-2', '2026-02-01T19:00:00.000Z');
    const backendSummary = calculateDailyTotals([optimisticMeal]);

    mockFetchDashboardData.mockResolvedValueOnce(baseData).mockResolvedValueOnce({
      ...baseData,
      summary: backendSummary,
    });

    const { result } = renderHook(() => useDashboardData(selectedDate));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addOptimisticMeal(optimisticMeal, true);
      result.current.setSummary((prev) => calculateDailyTotals([...prev.meals, optimisticMeal]));
    });

    await act(async () => {
      await result.current.refresh();
    });

    const matchingMeals = result.current.summary.meals.filter((meal) => meal.id === optimisticMeal.id);
    expect(matchingMeals).toHaveLength(1);
  });

  it('drops expired optimistic meals after TTL', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-01T12:00:00.000Z'));

    const selectedDate = new Date('2026-02-01T10:00:00.000Z');
    const optimisticMeal = createMeal('meal-3', '2026-02-01T20:00:00.000Z');
    const ttlMs = 2 * 60 * 1000 + 1;

    const { result } = renderHook(() => useDashboardData(selectedDate));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addOptimisticMeal(optimisticMeal, false);
      result.current.setSummary((prev) => calculateDailyTotals([...prev.meals, optimisticMeal]));
    });

    act(() => {
      jest.advanceTimersByTime(ttlMs);
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.summary.meals.some((meal) => meal.id === optimisticMeal.id)).toBe(false);
  });

  it('does not merge optimistic meals outside selected date', async () => {
    const selectedDate = new Date('2026-02-01T10:00:00.000Z');
    const optimisticMeal = createMeal('meal-4', '2026-02-02T10:00:00.000Z');

    const { result } = renderHook(() => useDashboardData(selectedDate));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addOptimisticMeal(optimisticMeal, false);
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.summary.meals.some((meal) => meal.id === optimisticMeal.id)).toBe(false);
  });
});
