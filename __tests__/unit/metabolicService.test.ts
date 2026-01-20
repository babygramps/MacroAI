/**
 * Unit tests for Metabolic Service
 * 
 * Tests for the event-driven TDEE calculation and persistence logic.
 * Since the service interacts with Amplify, we mock the data layer.
 */

import { formatDateKey } from '@/lib/statsHelpers';

// Mock the Amplify data client
const mockMealList = jest.fn();
const mockFoodLogList = jest.fn();
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
      FoodLog: { list: mockFoodLogList },
      WeightLog: { list: mockWeightLogList },
      DailyLog: { list: mockDailyLogList, create: mockDailyLogCreate, update: mockDailyLogUpdate },
      ComputedState: { list: mockComputedStateList, create: mockComputedStateCreate, update: mockComputedStateUpdate },
      UserProfile: { list: mockUserProfileList },
    },
  }),
}));

// Import after mocking
import { aggregateDailyNutrition, recalculateTdeeFromDate, onMealLogged, onWeightLogged } from '@/lib/metabolicService';

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
      mockFoodLogList.mockResolvedValue({ data: [] });
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

    it('aggregates multiple meals and food logs', async () => {
      mockMealList.mockResolvedValue({
        data: [
          { id: 'meal-1', totalCalories: 500, totalProtein: 30, totalCarbs: 50, totalFat: 20 },
          { id: 'meal-2', totalCalories: 300, totalProtein: 20, totalCarbs: 30, totalFat: 10 },
        ],
      });
      mockFoodLogList.mockResolvedValue({
        data: [
          { id: 'food-1', calories: 200, protein: 10, carbs: 20, fat: 8 },
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
      mockFoodLogList.mockResolvedValue({ data: [] });

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
  });

  describe('event handlers', () => {
    const testDateTime = '2026-01-15T12:00:00Z';

    beforeEach(() => {
      mockMealList.mockResolvedValue({ data: [] });
      mockFoodLogList.mockResolvedValue({ data: [] });
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
