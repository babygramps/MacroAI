/**
 * Unit tests for Metabolic Service
 * 
 * Tests for the event-driven TDEE calculation and persistence logic.
 * Since the service interacts with Amplify, we mock the data layer.
 */

import { formatDateKey } from '@/lib/statsHelpers';

// Mock the Amplify data client
const mockMealList = jest.fn();
const mockWeightLogList = jest.fn();
const mockDailyLogList = jest.fn();
const mockDailyLogCreate = jest.fn();
const mockDailyLogUpdate = jest.fn();
const mockComputedStateList = jest.fn();
const mockComputedStateCreate = jest.fn();
const mockComputedStateUpdate = jest.fn();
const mockUserProfileList = jest.fn();

jest.mock('@/lib/data/amplifyClient', () => ({
  getAmplifyDataClient: () => ({
    models: {
      Meal: { list: mockMealList },
      WeightLog: { list: mockWeightLogList },
      DailyLog: { list: mockDailyLogList, create: mockDailyLogCreate, update: mockDailyLogUpdate },
      ComputedState: { list: mockComputedStateList, create: mockComputedStateCreate, update: mockComputedStateUpdate },
      UserProfile: { list: mockUserProfileList },
    },
  }),
}));

// Import after mocking
import { aggregateDailyNutrition, recalculateTdeeFromDate, onMealLogged, onWeightLogged, onDayStatusChanged } from '@/lib/metabolicService';

describe('metabolicService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('formatDateKey', () => {
    it('formats date to YYYY-MM-DD string', () => {
      const date = new Date(2026, 0, 15); // Jan 15, 2026
      expect(formatDateKey(date)).toBe('2026-01-15');
    });

    it('pads single-digit months and days', () => {
      const date = new Date(2026, 0, 5); // Jan 5, 2026
      expect(formatDateKey(date)).toBe('2026-01-05');
    });
  });

  describe('aggregateDailyNutrition', () => {
    const testDate = '2026-01-15';

    beforeEach(() => {
      // Default mock responses
      mockMealList.mockResolvedValue({ data: [] });
      mockWeightLogList.mockResolvedValue({ data: [] });
      mockDailyLogList.mockResolvedValue({ data: [] });
    });

    it('creates a new DailyLog when none exists', async () => {
      mockMealList.mockResolvedValue({
        data: [{
          id: 'meal-1',
          totalCalories: 500,
          totalProtein: 30,
          totalCarbs: 50,
          totalFat: 20,
        }],
      });

      const result = await aggregateDailyNutrition(testDate);

      expect(result).not.toBeNull();
      expect(result?.nutritionCalories).toBe(500);
      expect(result?.nutritionProteinG).toBe(30);
      expect(result?.nutritionCarbsG).toBe(50);
      expect(result?.nutritionFatG).toBe(20);
      expect(result?.logStatus).toBe('complete');
      expect(mockDailyLogCreate).toHaveBeenCalled();
    });

    it('updates existing DailyLog', async () => {
      mockDailyLogList.mockResolvedValue({
        data: [{ id: 'daily-log-1', date: testDate }],
      });
      mockMealList.mockResolvedValue({
        data: [{
          id: 'meal-1',
          totalCalories: 700,
          totalProtein: 40,
          totalCarbs: 60,
          totalFat: 25,
        }],
      });

      const result = await aggregateDailyNutrition(testDate);

      expect(result).not.toBeNull();
      expect(result?.nutritionCalories).toBe(700);
      expect(mockDailyLogUpdate).toHaveBeenCalled();
      expect(mockDailyLogCreate).not.toHaveBeenCalled();
    });

    it('aggregates multiple meals', async () => {
      mockMealList.mockResolvedValue({
        data: [
          { id: 'meal-1', totalCalories: 500, totalProtein: 30, totalCarbs: 50, totalFat: 20 },
          { id: 'meal-2', totalCalories: 300, totalProtein: 20, totalCarbs: 30, totalFat: 10 },
          { id: 'meal-3', totalCalories: 200, totalProtein: 10, totalCarbs: 20, totalFat: 8 },
        ],
      });

      const result = await aggregateDailyNutrition(testDate);

      expect(result?.nutritionCalories).toBe(1000); // 500 + 300 + 200
      expect(result?.nutritionProteinG).toBe(60); // 30 + 20 + 10
      expect(result?.nutritionCarbsG).toBe(100); // 50 + 30 + 20
      expect(result?.nutritionFatG).toBe(38); // 20 + 10 + 8
    });

    it('includes weight in DailyLog when available', async () => {
      mockWeightLogList.mockResolvedValue({
        data: [{ id: 'weight-1', weightKg: 75.5 }],
      });
      mockMealList.mockResolvedValue({
        data: [{ id: 'meal-1', totalCalories: 500, totalProtein: 30, totalCarbs: 50, totalFat: 20 }],
      });

      const result = await aggregateDailyNutrition(testDate);

      expect(result?.scaleWeightKg).toBe(75.5);
    });

    it('sets logStatus to skipped when no nutrition data', async () => {
      mockMealList.mockResolvedValue({ data: [] });

      const result = await aggregateDailyNutrition(testDate);

      expect(result?.logStatus).toBe('skipped');
      expect(result?.nutritionCalories).toBeNull();
    });

    it('accepts Date object as input', async () => {
      const date = new Date(2026, 0, 15);
      mockMealList.mockResolvedValue({
        data: [{ id: 'meal-1', totalCalories: 500, totalProtein: 30, totalCarbs: 50, totalFat: 20 }],
      });

      const result = await aggregateDailyNutrition(date);

      expect(result).not.toBeNull();
      expect(mockDailyLogCreate).toHaveBeenCalled();
    });
  });

  describe('recalculateTdeeFromDate', () => {
    const testDate = '2026-01-15';

    beforeEach(() => {
      mockUserProfileList.mockResolvedValue({
        data: [{
          id: 'profile-1',
          calorieGoal: 2000,
          heightCm: 175,
          birthDate: '1990-01-01',
          sex: 'male',
          goalType: 'lose',
          goalRate: 0.5,
        }],
      });
      mockWeightLogList.mockResolvedValue({ data: [] });
      mockDailyLogList.mockResolvedValue({ data: [] });
      mockComputedStateList.mockResolvedValue({ data: [] });
    });

    it('returns 0 when no weight data exists', async () => {
      const count = await recalculateTdeeFromDate(testDate);
      expect(count).toBe(0);
    });

    it('calculates and stores computed states for each day with weight data', async () => {
      mockWeightLogList.mockResolvedValue({
        data: [
          { id: 'w1', weightKg: 80, recordedAt: '2026-01-15T12:00:00Z' },
          { id: 'w2', weightKg: 79.8, recordedAt: '2026-01-16T12:00:00Z' },
          { id: 'w3', weightKg: 79.5, recordedAt: '2026-01-17T12:00:00Z' },
        ],
      });
      mockDailyLogList.mockResolvedValue({
        data: [
          { date: '2026-01-15', nutritionCalories: 1800, logStatus: 'complete' },
          { date: '2026-01-16', nutritionCalories: 1900, logStatus: 'complete' },
          { date: '2026-01-17', nutritionCalories: 1850, logStatus: 'complete' },
        ],
      });

      const count = await recalculateTdeeFromDate(testDate);

      expect(count).toBeGreaterThan(0);
      expect(mockComputedStateCreate).toHaveBeenCalled();
    });

    it('updates existing computed states when they exist', async () => {
      mockWeightLogList.mockResolvedValue({
        data: [{ id: 'w1', weightKg: 80, recordedAt: '2026-01-15T12:00:00Z' }],
      });
      mockDailyLogList.mockResolvedValue({
        data: [{ date: '2026-01-15', nutritionCalories: 1800, logStatus: 'complete' }],
      });
      // Provide existing states for dates that will be processed
      mockComputedStateList.mockResolvedValue({
        data: [{ id: 'cs1', date: '2026-01-15' }],
      });

      await recalculateTdeeFromDate(testDate);

      // Should update the existing state for 2026-01-15
      expect(mockComputedStateUpdate).toHaveBeenCalled();
      // Should also create states for other dates that don't have existing entries
      // This is expected behavior - only matching dates get updated
    });

    it('replays the same history for a latest-day update, historical edit, and full rebuild', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 20, 18));
      try {
        const weights = [0, 1, 2, 4, 5, 6, 7, 8, 9].map((i) => ({
          id: `w${i}`, weightKg: 80 - i * 0.1,
          recordedAt: new Date(2026, 0, 11 + i, 8).toISOString(),
        }));
        const logs = Array.from({ length: 10 }, (_, i) => ({
          date: formatDateKey(new Date(2026, 0, 11 + i)),
          nutritionCalories: 2000 + (i % 3) * 100, logStatus: 'complete',
        }));
        // Respect query boundaries and pagination so a suffix-only fetch cannot
        // accidentally pass because the mocks supplied all historical records.
        mockWeightLogList.mockImplementation(async ({ filter, nextToken }) => {
          const [start, end] = filter.recordedAt.between;
          const rows = weights.filter(w => w.recordedAt >= start && w.recordedAt <= end);
          return nextToken ? { data: rows.slice(4) } : { data: rows.slice(0, 4), nextToken: 'page2' };
        });
        mockDailyLogList.mockImplementation(async ({ filter, nextToken }) => {
          const [start, end] = filter.date.between;
          const rows = logs.filter(l => l.date >= start && l.date <= end);
          return nextToken ? { data: rows.slice(4) } : { data: rows.slice(0, 4), nextToken: 'page2' };
        });
        await recalculateTdeeFromDate('2026-01-11');
        const baseline = mockComputedStateCreate.mock.calls.map(([row]) => row);
        expect(baseline).toHaveLength(10);
        expect(baseline.at(-1).weightDeltaKg).toBeLessThan(0);
        expect(baseline.at(-1).fluxConfidenceRange).toBeLessThan(500);

        for (const date of ['2026-01-20', '2026-01-15']) {
          mockComputedStateCreate.mockClear();
          await recalculateTdeeFromDate(date);
          expect(mockComputedStateCreate.mock.calls.map(([row]) => row)).toEqual(baseline);
        }

        // A replay with unchanged persisted rows should perform no writes,
        // including when those rows span multiple pages.
        mockComputedStateList.mockImplementation(async ({ nextToken }) => {
          const rows = baseline.map((row, i) => ({ ...row, id: `cs${i}` }));
          return nextToken ? { data: rows.slice(4) } : { data: rows.slice(0, 4), nextToken: 'page2' };
        });
        mockComputedStateCreate.mockClear();
        mockComputedStateUpdate.mockClear();
        await recalculateTdeeFromDate('2026-01-20');
        expect(mockComputedStateCreate).not.toHaveBeenCalled();
        expect(mockComputedStateUpdate).not.toHaveBeenCalled();

        // An actual historical correction must propagate identically whether
        // triggered at the edit date or replayed from the beginning.
        weights[4].weightKg -= 0.4;
        mockComputedStateList.mockResolvedValue({ data: [] });
        mockComputedStateCreate.mockClear();
        await recalculateTdeeFromDate('2026-01-16');
        const corrected = mockComputedStateCreate.mock.calls.map(([row]) => row);
        expect(corrected).not.toEqual(baseline);
        mockComputedStateCreate.mockClear();
        await recalculateTdeeFromDate('2026-01-11');
        expect(mockComputedStateCreate.mock.calls.map(([row]) => row)).toEqual(corrected);
      } finally {
        jest.useRealTimers();
      }
    });

    it('holds TDEE on partial logging days in recalculation path', async () => {
      const today = new Date();
      const todayIso = today.toISOString();
      const todayKey = formatDateKey(today);

      mockWeightLogList.mockResolvedValue({
        data: [{ id: 'w1', weightKg: 80, recordedAt: todayIso }],
      });
      mockDailyLogList.mockResolvedValue({
        data: [{
          date: todayKey,
          nutritionCalories: 800,
          nutritionProteinG: 50,
          nutritionCarbsG: 80,
          nutritionFatG: 20,
          stepCount: null,
          logStatus: 'partial',
        }],
      });
      mockComputedStateList.mockResolvedValue({ data: [] });

      await recalculateTdeeFromDate(todayKey);

      expect(mockComputedStateCreate).toHaveBeenCalled();
      const createdState = mockComputedStateCreate.mock.calls[0][0];
      expect(createdState.rawTdeeKcal).toBe(createdState.estimatedTdeeKcal);
      expect(createdState.fluxConfidenceRange).toBeGreaterThanOrEqual(400);
    });
  });

  describe('event handlers', () => {
    const testDateTime = '2026-01-15T12:00:00Z';

    beforeEach(() => {
      mockMealList.mockResolvedValue({ data: [] });
      mockWeightLogList.mockResolvedValue({ data: [] });
      mockDailyLogList.mockResolvedValue({ data: [] });
      mockComputedStateList.mockResolvedValue({ data: [] });
      mockUserProfileList.mockResolvedValue({
        data: [{
          id: 'profile-1',
          calorieGoal: 2000,
          heightCm: 175,
          birthDate: '1990-01-01',
          sex: 'male',
          goalType: 'lose',
          goalRate: 0.5,
        }],
      });
    });

    it('onMealLogged triggers aggregation and recalculation', async () => {
      await onMealLogged(testDateTime);

      // Should have called the list functions for aggregation
      expect(mockMealList).toHaveBeenCalled();
    });

    it('onWeightLogged triggers aggregation and recalculation', async () => {
      await onWeightLogged(testDateTime);

      // Should have called the list functions for aggregation
      expect(mockMealList).toHaveBeenCalled();
    });

    it('onDayStatusChanged does not re-aggregate and does not overwrite the persisted logStatus', async () => {
      // Simulate updateDayStatus having already persisted the user's explicit
      // "skipped" choice on a day that has meals (see src/actions/updateDayStatus.ts,
      // which writes logStatus itself and only re-aggregates nutrition on create).
      mockDailyLogList.mockResolvedValue({
        data: [{
          id: 'daily-log-1',
          date: '2026-01-15',
          logStatus: 'skipped',
          nutritionCalories: 500,
          nutritionProteinG: 30,
          nutritionCarbsG: 50,
          nutritionFatG: 20,
        }],
      });
      mockMealList.mockResolvedValue({
        data: [{ id: 'meal-1', totalCalories: 500, totalProtein: 30, totalCarbs: 50, totalFat: 20 }],
      });
      mockWeightLogList.mockResolvedValue({
        data: [{ id: 'w1', weightKg: 80, recordedAt: testDateTime }],
      });

      await onDayStatusChanged(testDateTime);

      // Must NOT re-aggregate: no DailyLog write, and meals are never even
      // fetched, so the user's explicit logStatus can't be clobbered.
      expect(mockDailyLogCreate).not.toHaveBeenCalled();
      expect(mockDailyLogUpdate).not.toHaveBeenCalled();
      expect(mockMealList).not.toHaveBeenCalled();

      // The recalc path must still run.
      expect(mockUserProfileList).toHaveBeenCalled();
      expect(mockComputedStateCreate).toHaveBeenCalled();
    });

    it('handles ISO datetime strings', async () => {
      await onMealLogged('2026-01-15T14:30:00.000Z');

      expect(mockMealList).toHaveBeenCalled();
    });

    it('handles Date objects', async () => {
      await onMealLogged(new Date(2026, 0, 15));

      expect(mockMealList).toHaveBeenCalled();
    });

    it('handles date strings', async () => {
      await onMealLogged('2026-01-15');

      expect(mockMealList).toHaveBeenCalled();
    });
  });
});
