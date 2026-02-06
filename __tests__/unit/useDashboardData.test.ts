import { renderHook, waitFor } from '@testing-library/react';
import { useDashboardData } from '@/lib/hooks/useDashboardData';
import { DEFAULT_GOALS, fetchDashboardData } from '@/lib/data/dashboard';
import { fetchDayStatus, fetchDayStatusRange } from '@/actions/updateDayStatus';

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

jest.mock('@/lib/migration', () => ({}));

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

describe('useDashboardData', () => {
  const mockFetchDashboardData = fetchDashboardData as jest.MockedFunction<typeof fetchDashboardData>;
  const mockFetchDayStatus = fetchDayStatus as jest.MockedFunction<typeof fetchDayStatus>;
  const mockFetchDayStatusRange = fetchDayStatusRange as jest.MockedFunction<typeof fetchDayStatusRange>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchDashboardData.mockResolvedValue(baseData);
    mockFetchDayStatus.mockResolvedValue(null);
    mockFetchDayStatusRange.mockResolvedValue(new Map());
  });

  it('returns initial loading state', () => {
    const selectedDate = new Date('2026-02-01T10:00:00.000Z');
    const { result } = renderHook(() => useDashboardData(selectedDate));

    expect(result.current.isLoading).toBe(true);
  });

  it('fetches dashboard data on mount', async () => {
    const selectedDate = new Date('2026-02-01T10:00:00.000Z');
    const { result } = renderHook(() => useDashboardData(selectedDate));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFetchDashboardData).toHaveBeenCalledWith(selectedDate);
    expect(result.current.goals).toEqual(DEFAULT_GOALS);
    expect(result.current.summary).toEqual(emptySummary);
  });

  it('returns fetched meals in summary', async () => {
    const selectedDate = new Date('2026-02-01T10:00:00.000Z');
    const mealData = {
      ...baseData,
      summary: {
        ...emptySummary,
        totalCalories: 500,
        totalProtein: 30,
        meals: [
          {
            id: 'meal-1',
            name: 'Breakfast',
            category: 'meal' as const,
            eatenAt: '2026-02-01T08:00:00.000Z',
            totalCalories: 500,
            totalProtein: 30,
            totalCarbs: 50,
            totalFat: 20,
            totalWeightG: 300,
            ingredients: [],
          },
        ],
      },
    };
    mockFetchDashboardData.mockResolvedValue(mealData);

    const { result } = renderHook(() => useDashboardData(selectedDate));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.summary.meals).toHaveLength(1);
    expect(result.current.summary.meals[0].name).toBe('Breakfast');
    expect(result.current.summary.totalCalories).toBe(500);
  });

  it('updates day status via updateDayStatus callback', async () => {
    const selectedDate = new Date('2026-02-01T10:00:00.000Z');
    const { result } = renderHook(() => useDashboardData(selectedDate));

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 3000 });

    expect(result.current.dayStatus).toBeNull();

    result.current.updateDayStatus('complete');

    await waitFor(() => expect(result.current.dayStatus).toBe('complete'));
  });

  it('provides refresh function that refetches data', async () => {
    const selectedDate = new Date('2026-02-01T10:00:00.000Z');
    const { result } = renderHook(() => useDashboardData(selectedDate));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFetchDashboardData).toHaveBeenCalledTimes(1);

    await result.current.refresh();

    expect(mockFetchDashboardData).toHaveBeenCalledTimes(2);
  });
});
