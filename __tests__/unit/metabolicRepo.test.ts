/**
 * Unit tests for metabolicRepo.ts
 *
 * Covers the pure row mappers (Amplify record -> domain type) extracted
 * from statsHelpers.ts / metabolicService.ts in Task 6, including the
 * defaulting behavior reconciled between the two former duplicate copies,
 * plus the promoted listAllPages pagination helper.
 */

import {
  listAllPages,
  mapUserProfileToGoals,
  mapWeightLogToEntry,
  mapDailyLogToDomain,
  mapComputedStateToDomain,
} from '@/lib/data/metabolicRepo';

describe('metabolicRepo', () => {
  describe('listAllPages', () => {
    it('returns all items when there is only one page', async () => {
      const queryFn = jest.fn().mockResolvedValue({ data: [1, 2, 3], nextToken: null });

      const result = await listAllPages(queryFn);

      expect(result).toEqual([1, 2, 3]);
      expect(queryFn).toHaveBeenCalledTimes(1);
    });

    it('concatenates items across multiple pages, following nextToken', async () => {
      const queryFn = jest.fn()
        .mockResolvedValueOnce({ data: [1, 2], nextToken: 'page-2' })
        .mockResolvedValueOnce({ data: [3, 4], nextToken: 'page-3' })
        .mockResolvedValueOnce({ data: [5], nextToken: null });

      const result = await listAllPages(queryFn);

      expect(result).toEqual([1, 2, 3, 4, 5]);
      expect(queryFn).toHaveBeenCalledTimes(3);
      // First call has no token; subsequent calls pass the previous nextToken through
      expect(queryFn).toHaveBeenNthCalledWith(1, undefined);
      expect(queryFn).toHaveBeenNthCalledWith(2, 'page-2');
      expect(queryFn).toHaveBeenNthCalledWith(3, 'page-3');
    });

    it('handles a page with no data gracefully', async () => {
      const queryFn = jest.fn().mockResolvedValue({ data: undefined, nextToken: null });

      const result = await listAllPages(queryFn as never);

      expect(result).toEqual([]);
    });
  });

  describe('mapUserProfileToGoals', () => {
    it('applies documented defaults when the profile has no fields set', () => {
      const goals = mapUserProfileToGoals({});

      expect(goals).toEqual({
        calorieGoal: 2000,
        proteinGoal: 150,
        carbsGoal: 200,
        fatGoal: 65,
        targetWeightKg: undefined,
        preferredWeightUnit: 'kg',
        preferredUnitSystem: 'metric',
        heightCm: undefined,
        birthDate: undefined,
        sex: undefined,
        initialBodyFatPct: undefined,
        expenditureStrategy: 'dynamic',
        startDate: undefined,
        athleteStatus: false,
        goalType: 'maintain',
        goalRate: 0.5,
      });
    });

    it('maps explicit fields straight through', () => {
      const goals = mapUserProfileToGoals({
        calorieGoal: 2500,
        proteinGoal: 180,
        carbsGoal: 250,
        fatGoal: 80,
        targetWeightKg: 75,
        heightCm: 180,
        birthDate: '1990-05-01',
        sex: 'male',
        initialBodyFatPct: 18,
        expenditureStrategy: 'static',
        startDate: '2026-01-01',
        athleteStatus: true,
        goalType: 'gain',
        goalRate: 0.25,
      });

      expect(goals.calorieGoal).toBe(2500);
      expect(goals.heightCm).toBe(180);
      expect(goals.sex).toBe('male');
      expect(goals.expenditureStrategy).toBe('static');
      expect(goals.athleteStatus).toBe(true);
      expect(goals.goalType).toBe('gain');
    });

    // Reconciled divergence: statsHelpers derived preferredUnitSystem from the
    // legacy preferredWeightUnit field when unset; metabolicService's copy
    // defaulted unconditionally to 'metric'. statsHelpers' behavior is canonical.
    it('derives preferredUnitSystem=imperial from legacy preferredWeightUnit=lbs when unset', () => {
      const goals = mapUserProfileToGoals({ preferredWeightUnit: 'lbs' });

      expect(goals.preferredUnitSystem).toBe('imperial');
      expect(goals.preferredWeightUnit).toBe('lbs');
    });

    it('derives preferredUnitSystem=metric from legacy preferredWeightUnit=kg when unset', () => {
      const goals = mapUserProfileToGoals({ preferredWeightUnit: 'kg' });

      expect(goals.preferredUnitSystem).toBe('metric');
    });

    it('prefers an explicit preferredUnitSystem over the legacy field', () => {
      const goals = mapUserProfileToGoals({
        preferredWeightUnit: 'lbs',
        preferredUnitSystem: 'metric',
      });

      expect(goals.preferredUnitSystem).toBe('metric');
    });
  });

  describe('mapWeightLogToEntry', () => {
    it('maps fields through, defaulting a missing note to undefined', () => {
      const entry = mapWeightLogToEntry({
        id: 'w1',
        weightKg: 80.2,
        recordedAt: '2026-01-15T12:00:00Z',
      });

      expect(entry).toEqual({
        id: 'w1',
        weightKg: 80.2,
        recordedAt: '2026-01-15T12:00:00Z',
        note: undefined,
      });
    });

    it('preserves a note when present', () => {
      const entry = mapWeightLogToEntry({
        id: 'w2',
        weightKg: 79.5,
        recordedAt: '2026-01-16T12:00:00Z',
        note: 'after workout',
      });

      expect(entry.note).toBe('after workout');
    });
  });

  describe('mapDailyLogToDomain', () => {
    it('defaults nullable fields to null and logStatus to skipped', () => {
      const log = mapDailyLogToDomain({ date: '2026-01-15' });

      expect(log).toEqual({
        date: '2026-01-15',
        scaleWeightKg: null,
        nutritionCalories: null,
        nutritionProteinG: null,
        nutritionCarbsG: null,
        nutritionFatG: null,
        stepCount: null,
        logStatus: 'skipped',
      });
    });

    it('maps present fields through', () => {
      const log = mapDailyLogToDomain({
        date: '2026-01-15',
        scaleWeightKg: 80,
        nutritionCalories: 1800,
        nutritionProteinG: 150,
        nutritionCarbsG: 180,
        nutritionFatG: 60,
        stepCount: 8000,
        logStatus: 'complete',
      });

      expect(log.logStatus).toBe('complete');
      expect(log.nutritionCalories).toBe(1800);
      expect(log.stepCount).toBe(8000);
    });
  });

  describe('mapComputedStateToDomain', () => {
    it('defaults rawTdeeKcal to estimatedTdeeKcal, and flux/energy/delta to their standard values', () => {
      const state = mapComputedStateToDomain({
        id: 'cs1',
        date: '2026-01-15',
        trendWeightKg: 80,
        estimatedTdeeKcal: 2200,
      });

      expect(state).toEqual({
        id: 'cs1',
        date: '2026-01-15',
        trendWeightKg: 80,
        estimatedTdeeKcal: 2200,
        rawTdeeKcal: 2200,
        fluxConfidenceRange: 200,
        energyDensityUsed: 7700,
        weightDeltaKg: 0,
      });
    });

    it('preserves explicit values when present, including a rawTdeeKcal that differs from the smoothed value', () => {
      const state = mapComputedStateToDomain({
        id: 'cs2',
        date: '2026-01-16',
        trendWeightKg: 79.9,
        estimatedTdeeKcal: 2180,
        rawTdeeKcal: 2050,
        fluxConfidenceRange: 350,
        energyDensityUsed: 5500,
        weightDeltaKg: -0.2,
      });

      expect(state.rawTdeeKcal).toBe(2050);
      expect(state.fluxConfidenceRange).toBe(350);
      expect(state.energyDensityUsed).toBe(5500);
      expect(state.weightDeltaKg).toBe(-0.2);
    });
  });
});
