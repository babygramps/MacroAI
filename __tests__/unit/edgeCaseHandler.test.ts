/**
 * Unit tests for edgeCaseHandler.ts
 * Tests partial logging detection, whoosh effect handling, and data quality scoring
 */

import {
  isPartialLogging,
  validateDailyLogForTdee,
  isWhooshEffect,
  dampWhooshEffect,
  calculateGoalTransitionAdjustment,
  detectGoalTransition,
  calculateDataQualityScore,
  isTdeeOutlier,
  calculateTdeeStatistics,
  validateWeightEntry,
  validateCalorieEntry,
} from '@/lib/edgeCaseHandler';
import type { DailyLog, ComputedState, UserGoals } from '@/lib/types';

describe('edgeCaseHandler', () => {
  describe('isPartialLogging', () => {
    it('should return false for null (untracked)', () => {
      const result = isPartialLogging(null, 2500);
      expect(result.isPartial).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('should return false for zero (fasted)', () => {
      const result = isPartialLogging(0, 2500);
      expect(result.isPartial).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('should detect partial logging below minimum threshold', () => {
      const result = isPartialLogging(400, 2500);
      expect(result.isPartial).toBe(true);
      expect(result.reason).toContain('likely incomplete');
    });

    it('should detect partial logging below 50% of TDEE', () => {
      const result = isPartialLogging(1000, 2500);
      expect(result.isPartial).toBe(true);
      expect(result.reason).toContain('less than 50%');
    });

    it('should not flag logging at 50%+ of TDEE', () => {
      const result = isPartialLogging(1300, 2500);
      expect(result.isPartial).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('should not flag full logging', () => {
      const result = isPartialLogging(2200, 2500);
      expect(result.isPartial).toBe(false);
    });
  });

  describe('validateDailyLogForTdee', () => {
    const makeLog = (calories: number | null, status: 'complete' | 'partial' | 'skipped' = 'complete'): DailyLog => ({
      date: '2026-01-15',
      scaleWeightKg: 85,
      nutritionCalories: calories,
      nutritionProteinG: calories ? 150 : null,
      nutritionCarbsG: calories ? 200 : null,
      nutritionFatG: calories ? 65 : null,
      stepCount: null,
      logStatus: status,
    });

    it('should be invalid without nutrition data', () => {
      const result = validateDailyLogForTdee(makeLog(null), 2500);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('No nutrition data');
    });

    it('should be invalid for partial logging', () => {
      const result = validateDailyLogForTdee(makeLog(800), 2500);
      expect(result.isValid).toBe(false);
      expect(result.reason).not.toBeNull();
    });

    it('should be invalid for skipped days', () => {
      const result = validateDailyLogForTdee(makeLog(2000, 'skipped'), 2500);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('skipped');
    });

    it('should be valid for complete logging', () => {
      const result = validateDailyLogForTdee(makeLog(2200), 2500);
      expect(result.isValid).toBe(true);
      expect(result.reason).toBeNull();
    });
  });

  describe('isWhooshEffect', () => {
    it('should not detect whoosh when scale and trend are similar', () => {
      const result = isWhooshEffect(-0.3, -0.25);
      expect(result.isWhoosh).toBe(false);
      expect(result.severity).toBeNull();
    });

    it('should detect moderate whoosh for 0.5+ kg change with divergence', () => {
      // Scale change = 0.6, which is >= 0.5 (MAX_CREDIBLE_DAILY_CHANGE)
      // Divergence = 0.6 - 0.2 = 0.4, which is > 0.3
      const result = isWhooshEffect(-0.6, -0.2);
      expect(result.isWhoosh).toBe(true);
      expect(result.severity).toBe('moderate');
    });

    it('should detect mild whoosh for small change with divergence', () => {
      // Scale change = 0.45, which is < 0.5 (MAX_CREDIBLE_DAILY_CHANGE)
      // Divergence = 0.45 - 0.1 = 0.35, which is > 0.3
      const result = isWhooshEffect(-0.45, -0.1);
      expect(result.isWhoosh).toBe(true);
      expect(result.severity).toBe('mild');
    });

    it('should detect extreme whoosh at 1.5+ kg change', () => {
      const result = isWhooshEffect(-2.0, -0.3);
      expect(result.isWhoosh).toBe(true);
      expect(result.severity).toBe('extreme');
    });

    it('should detect whoosh for weight gain too', () => {
      const result = isWhooshEffect(1.8, 0.2);
      expect(result.isWhoosh).toBe(true);
      expect(result.severity).toBe('extreme');
    });
  });

  describe('dampWhooshEffect', () => {
    it('should return trend delta when no whoosh', () => {
      const result = dampWhooshEffect(-0.2, -0.15);
      expect(result).toBe(-0.15);
    });

    it('should apply 70% dampening for mild whoosh', () => {
      // Raw change = 0.45 (< 0.5 so mild), divergence > 0.3
      const rawDelta = -0.45;
      const trendDelta = -0.1;
      const result = dampWhooshEffect(rawDelta, trendDelta);
      expect(result).toBeCloseTo(rawDelta * 0.7, 2);
    });

    it('should apply 50% dampening for moderate whoosh', () => {
      // Raw change = 0.6 (>= 0.5 so moderate), divergence > 0.3
      const rawDelta = -0.6;
      const trendDelta = -0.2;
      const result = dampWhooshEffect(rawDelta, trendDelta);
      expect(result).toBeCloseTo(rawDelta * 0.5, 2);
    });

    it('should apply 30% dampening for extreme whoosh', () => {
      const rawDelta = -2.0;
      const trendDelta = -0.3;
      const result = dampWhooshEffect(rawDelta, trendDelta);
      expect(result).toBeCloseTo(rawDelta * 0.3, 2);
    });
  });

  describe('calculateGoalTransitionAdjustment', () => {
    it('should not adjust for same goal type', () => {
      const result = calculateGoalTransitionAdjustment(2500, 'lose', 'lose', 0.5, 0.5);
      expect(result.adjustedTdee).toBe(2500);
      expect(result.adjustment).toBe(0);
    });

    it('should increase TDEE when going from cut to bulk', () => {
      const result = calculateGoalTransitionAdjustment(2500, 'lose', 'gain', 0.5, 0.5);
      expect(result.adjustedTdee).toBeGreaterThan(2500);
      expect(result.adjustment).toBeGreaterThan(0);
      expect(result.reason).toContain('increased');
    });

    it('should decrease TDEE when going from bulk to cut', () => {
      const result = calculateGoalTransitionAdjustment(2500, 'gain', 'lose', 0.5, 0.5);
      expect(result.adjustedTdee).toBeLessThan(2500);
      expect(result.adjustment).toBeLessThan(0);
      expect(result.reason).toContain('decreased');
    });

    it('should maintain TDEE when switching to/from maintain', () => {
      const result = calculateGoalTransitionAdjustment(2500, 'maintain', 'maintain', 0, 0);
      expect(result.adjustedTdee).toBe(2500);
    });
  });

  describe('detectGoalTransition', () => {
    const baseGoals: UserGoals = {
      calorieGoal: 2000,
      proteinGoal: 150,
      carbsGoal: 200,
      fatGoal: 65,
      goalType: 'lose',
      goalRate: 0.5,
    };

    it('should not detect transition for null previous', () => {
      const result = detectGoalTransition(null, baseGoals);
      expect(result.hasTransitioned).toBe(false);
    });

    it('should not detect transition for same goals', () => {
      const result = detectGoalTransition(baseGoals, baseGoals);
      expect(result.hasTransitioned).toBe(false);
    });

    it('should detect goal type change', () => {
      const newGoals = { ...baseGoals, goalType: 'gain' as const };
      const result = detectGoalTransition(baseGoals, newGoals);
      expect(result.hasTransitioned).toBe(true);
      expect(result.details).toContain('lose');
      expect(result.details).toContain('gain');
    });

    it('should detect rate change', () => {
      const newGoals = { ...baseGoals, goalRate: 0.75 };
      const result = detectGoalTransition(baseGoals, newGoals);
      expect(result.hasTransitioned).toBe(true);
      expect(result.details).toContain('Rate');
    });

    it('should not detect rate change for maintain goal', () => {
      const maintainGoals: UserGoals = { ...baseGoals, goalType: 'maintain', goalRate: 0 };
      const newMaintain = { ...maintainGoals, goalRate: 0.5 }; // Rate shouldn't matter for maintain
      const result = detectGoalTransition(maintainGoals, newMaintain);
      expect(result.hasTransitioned).toBe(false);
    });
  });

  describe('calculateDataQualityScore', () => {
    const makeLog = (calories: number | null, status: 'complete' | 'partial' | 'skipped', weight: number | null = 85): DailyLog => ({
      date: '2026-01-15',
      scaleWeightKg: weight,
      nutritionCalories: calories,
      nutritionProteinG: calories ? 150 : null,
      nutritionCarbsG: calories ? 200 : null,
      nutritionFatG: calories ? 65 : null,
      stepCount: null,
      logStatus: status,
    });

    it('should return 0 for empty logs', () => {
      const result = calculateDataQualityScore([], 2500);
      expect(result.score).toBe(0);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should return high score for complete data', () => {
      const logs = Array.from({ length: 7 }, () => makeLog(2200, 'complete', 85));
      const result = calculateDataQualityScore(logs, 2500);
      expect(result.score).toBeGreaterThanOrEqual(80);
    });

    it('should penalize low complete rate', () => {
      const logs = [
        makeLog(2200, 'complete'),
        makeLog(null, 'skipped'),
        makeLog(null, 'skipped'),
        makeLog(null, 'skipped'),
      ];
      const result = calculateDataQualityScore(logs, 2500);
      expect(result.score).toBeLessThanOrEqual(60);
      expect(result.issues.some(i => i.includes('logged'))).toBe(true);
    });

    it('should penalize partial logging', () => {
      const logs = [
        makeLog(800, 'complete'), // Partial
        makeLog(700, 'complete'), // Partial
        makeLog(2200, 'complete'),
      ];
      const result = calculateDataQualityScore(logs, 2500);
      expect(result.score).toBeLessThan(90);
      expect(result.issues.some(i => i.toLowerCase().includes('incomplete'))).toBe(true);
    });

    it('should penalize missing weight data', () => {
      const logs = [
        makeLog(2200, 'complete', null),
        makeLog(2200, 'complete', null),
        makeLog(2200, 'complete', null),
      ];
      const result = calculateDataQualityScore(logs, 2500);
      expect(result.score).toBeLessThan(80);
      expect(result.issues.some(i => i.toLowerCase().includes('weight'))).toBe(true);
    });
  });

  describe('isTdeeOutlier', () => {
    it('should not flag values within 2 standard deviations', () => {
      const result = isTdeeOutlier(2600, 2500, 100);
      expect(result.isOutlier).toBe(false);
    });

    it('should flag values beyond 2 standard deviations', () => {
      const result = isTdeeOutlier(2800, 2500, 100);
      expect(result.isOutlier).toBe(true);
      expect(result.deviation).toBe(300);
    });

    it('should handle zero standard deviation', () => {
      const result = isTdeeOutlier(2600, 2500, 0);
      expect(result.isOutlier).toBe(false);
    });
  });

  describe('calculateTdeeStatistics', () => {
    it('should return zeros for empty array', () => {
      const result = calculateTdeeStatistics([]);
      expect(result.average).toBe(0);
      expect(result.stdDev).toBe(0);
      expect(result.min).toBe(0);
      expect(result.max).toBe(0);
    });

    it('should calculate statistics correctly', () => {
      const states: ComputedState[] = [
        { date: '2026-01-01', trendWeightKg: 85, estimatedTdeeKcal: 2400, rawTdeeKcal: 2400, fluxConfidenceRange: 200, energyDensityUsed: 7700, weightDeltaKg: -0.1 },
        { date: '2026-01-02', trendWeightKg: 85, estimatedTdeeKcal: 2500, rawTdeeKcal: 2500, fluxConfidenceRange: 200, energyDensityUsed: 7700, weightDeltaKg: -0.1 },
        { date: '2026-01-03', trendWeightKg: 85, estimatedTdeeKcal: 2600, rawTdeeKcal: 2600, fluxConfidenceRange: 200, energyDensityUsed: 7700, weightDeltaKg: -0.1 },
      ];
      
      const result = calculateTdeeStatistics(states);
      
      expect(result.average).toBe(2500);
      expect(result.min).toBe(2400);
      expect(result.max).toBe(2600);
      expect(result.stdDev).toBeGreaterThan(0);
    });
  });

  describe('validateWeightEntry', () => {
    it('should reject weight below 30kg', () => {
      const result = validateWeightEntry(25, null);
      expect(result.isValid).toBe(false);
      expect(result.warning).toContain('outside reasonable range');
    });

    it('should reject weight above 300kg', () => {
      const result = validateWeightEntry(350, null);
      expect(result.isValid).toBe(false);
      expect(result.warning).toContain('outside reasonable range');
    });

    it('should accept valid weight', () => {
      const result = validateWeightEntry(85, null);
      expect(result.isValid).toBe(true);
      expect(result.warning).toBeNull();
    });

    it('should warn on large daily change', () => {
      const result = validateWeightEntry(88, 84);
      expect(result.isValid).toBe(true);
      expect(result.warning).toContain('Large weight change');
    });

    it('should not warn on normal daily change', () => {
      const result = validateWeightEntry(85.5, 85);
      expect(result.isValid).toBe(true);
      expect(result.warning).toBeNull();
    });
  });

  describe('validateCalorieEntry', () => {
    it('should reject negative calories', () => {
      const result = validateCalorieEntry(-100, 2500);
      expect(result.isValid).toBe(false);
      expect(result.warning).toContain('negative');
    });

    it('should reject extremely high calories', () => {
      const result = validateCalorieEntry(15000, 2500);
      expect(result.isValid).toBe(false);
      expect(result.warning).toContain('unreasonably high');
    });

    it('should accept valid calories', () => {
      const result = validateCalorieEntry(2200, 2500);
      expect(result.isValid).toBe(true);
      expect(result.warning).toBeNull();
    });

    it('should warn when calories exceed 2x TDEE', () => {
      const result = validateCalorieEntry(5500, 2500);
      expect(result.isValid).toBe(true);
      expect(result.warning).toContain('double');
    });

    it('should accept zero calories (fasting)', () => {
      const result = validateCalorieEntry(0, 2500);
      expect(result.isValid).toBe(true);
      expect(result.warning).toBeNull();
    });
  });
});
