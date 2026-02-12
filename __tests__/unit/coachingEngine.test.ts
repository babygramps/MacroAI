/**
 * Unit tests for coachingEngine.ts
 * Tests calorie recommendations, adherence scoring, and weekly check-ins
 */

import {
  calculateGoalAdjustment,
  calculateCalorieTarget,
  calculateAdherenceScore,
  checkWeeklyUpdateEligibility,
  checkMaintenanceDrift,
  buildWeeklyCheckIn,
  detectPartialLogging,
  determineLogStatus,
  calculateGoalProgress,
  estimateWeeksToGoal,
  getWeekStartDate,
  getWeekEndDate,
} from '@/lib/coachingEngine';
import { METABOLIC_CONSTANTS } from '@/lib/types';
import type { DailyLog, ComputedState, UserGoals } from '@/lib/types';

const DEFICIT_KCAL_PER_KG_WEEKLY = METABOLIC_CONSTANTS.ENERGY_DENSITY_DEFICIT / 7;
const SURPLUS_KCAL_PER_KG_WEEKLY = METABOLIC_CONSTANTS.ENERGY_DENSITY_SURPLUS / 7;

describe('coachingEngine', () => {
  describe('calculateGoalAdjustment', () => {
    it('should return negative adjustment for weight loss', () => {
      // Lose 0.5 kg/week = -550 kcal/day
      const result = calculateGoalAdjustment('lose', 0.5);
      expect(result).toBe(-Math.round(0.5 * DEFICIT_KCAL_PER_KG_WEEKLY));
      expect(result).toBeCloseTo(-550, -1);
    });

    it('should return positive adjustment for weight gain', () => {
      // Gain 0.5 kg/week = +393 kcal/day (5500 kcal/kg model)
      const result = calculateGoalAdjustment('gain', 0.5);
      expect(result).toBe(Math.round(0.5 * SURPLUS_KCAL_PER_KG_WEEKLY));
      expect(result).toBe(393);
    });

    it('should return zero for maintenance', () => {
      const result = calculateGoalAdjustment('maintain', 0.5);
      expect(result).toBe(0);
    });

    it('should scale with rate', () => {
      const result025 = calculateGoalAdjustment('lose', 0.25);
      const result05 = calculateGoalAdjustment('lose', 0.5);
      const result1 = calculateGoalAdjustment('lose', 1);
      
      expect(result05).toBe(result025 * 2);
      expect(result1).toBe(result05 * 2);
    });

    it('should use default rate of 0.5 when not provided', () => {
      const result = calculateGoalAdjustment('lose');
      expect(result).toBeCloseTo(-550, -1);
    });
  });

  describe('calculateCalorieTarget', () => {
    it('should subtract adjustment for weight loss', () => {
      // TDEE 2500, lose 0.5 kg/week = 2500 - 550 = 1950
      const result = calculateCalorieTarget(2500, 'lose', 0.5);
      expect(result).toBeCloseTo(1950, -2);
    });

    it('should add adjustment for weight gain', () => {
      // TDEE 2500, gain 0.5 kg/week = 2500 + 393 = 2893
      const result = calculateCalorieTarget(2500, 'gain', 0.5);
      expect(result).toBe(2893);
    });

    it('should return TDEE for maintenance', () => {
      const result = calculateCalorieTarget(2500, 'maintain');
      expect(result).toBe(2500);
    });

    it('should enforce minimum of 1200 calories', () => {
      const result = calculateCalorieTarget(1500, 'lose', 1);
      expect(result).toBe(1200);
    });

    it('should enforce maximum of 6000 calories', () => {
      const result = calculateCalorieTarget(5500, 'gain', 1);
      expect(result).toBe(6000);
    });
  });

  describe('calculateAdherenceScore', () => {
    it('should return 0 for empty logs', () => {
      expect(calculateAdherenceScore([])).toBe(0);
    });

    it('should return 1.0 for 7 complete days', () => {
      const logs: DailyLog[] = Array.from({ length: 7 }, (_, i) => ({
        date: `2026-01-0${i + 1}`,
        scaleWeightKg: 85,
        nutritionCalories: 2000,
        nutritionProteinG: 150,
        nutritionCarbsG: 200,
        nutritionFatG: 65,
        stepCount: null,
        logStatus: 'complete' as const,
      }));
      
      expect(calculateAdherenceScore(logs)).toBe(1);
    });

    it('should calculate partial adherence', () => {
      const logs: DailyLog[] = [
        { date: '2026-01-01', scaleWeightKg: 85, nutritionCalories: 2000, nutritionProteinG: 150, nutritionCarbsG: 200, nutritionFatG: 65, stepCount: null, logStatus: 'complete' },
        { date: '2026-01-02', scaleWeightKg: 85, nutritionCalories: 2000, nutritionProteinG: 150, nutritionCarbsG: 200, nutritionFatG: 65, stepCount: null, logStatus: 'complete' },
        { date: '2026-01-03', scaleWeightKg: 85, nutritionCalories: null, nutritionProteinG: null, nutritionCarbsG: null, nutritionFatG: null, stepCount: null, logStatus: 'skipped' },
        { date: '2026-01-04', scaleWeightKg: 85, nutritionCalories: 2000, nutritionProteinG: 150, nutritionCarbsG: 200, nutritionFatG: 65, stepCount: null, logStatus: 'complete' },
        { date: '2026-01-05', scaleWeightKg: 85, nutritionCalories: 2000, nutritionProteinG: 150, nutritionCarbsG: 200, nutritionFatG: 65, stepCount: null, logStatus: 'complete' },
        { date: '2026-01-06', scaleWeightKg: 85, nutritionCalories: null, nutritionProteinG: null, nutritionCarbsG: null, nutritionFatG: null, stepCount: null, logStatus: 'skipped' },
        { date: '2026-01-07', scaleWeightKg: 85, nutritionCalories: 2000, nutritionProteinG: 150, nutritionCarbsG: 200, nutritionFatG: 65, stepCount: null, logStatus: 'complete' },
      ];
      
      // 5 complete out of 7 = 5/7 ≈ 0.71
      const result = calculateAdherenceScore(logs);
      expect(result).toBeCloseTo(0.71, 2);
    });

    it('should not count days with null calories as complete', () => {
      const logs: DailyLog[] = [
        { date: '2026-01-01', scaleWeightKg: 85, nutritionCalories: 2000, nutritionProteinG: 150, nutritionCarbsG: 200, nutritionFatG: 65, stepCount: null, logStatus: 'complete' },
        { date: '2026-01-02', scaleWeightKg: 85, nutritionCalories: null, nutritionProteinG: null, nutritionCarbsG: null, nutritionFatG: null, stepCount: null, logStatus: 'complete' }, // Should not count
      ];
      
      // Only 1 truly complete out of 7 expected
      const result = calculateAdherenceScore(logs);
      expect(result).toBeCloseTo(1/7, 2);
    });
  });

  describe('checkWeeklyUpdateEligibility', () => {
    const makeCompleteLogs = (count: number): DailyLog[] => 
      Array.from({ length: count }, (_, i) => ({
        date: `2026-01-0${i + 1}`,
        scaleWeightKg: 85,
        nutritionCalories: 2000,
        nutritionProteinG: 150,
        nutritionCarbsG: 200,
        nutritionFatG: 65,
        stepCount: null,
        logStatus: 'complete' as const,
      }));

    it('should allow update with all 7 days complete', () => {
      const logs = makeCompleteLogs(7);
      const result = checkWeeklyUpdateEligibility(logs);
      
      expect(result.canUpdate).toBe(true);
      expect(result.warning).toBeNull();
      expect(result.missingDays).toBe(0);
    });

    it('should allow update with 1 missing day', () => {
      const logs = makeCompleteLogs(6);
      const result = checkWeeklyUpdateEligibility(logs);
      
      expect(result.canUpdate).toBe(true);
      expect(result.warning).toBeNull();
      expect(result.missingDays).toBe(1);
    });

    it('should warn with 2-3 missing days', () => {
      const logs = makeCompleteLogs(5);
      const result = checkWeeklyUpdateEligibility(logs);
      
      expect(result.canUpdate).toBe(true);
      expect(result.warning).not.toBeNull();
      expect(result.missingDays).toBe(2);
    });

    it('should not allow update with 4+ missing days', () => {
      const logs = makeCompleteLogs(3);
      const result = checkWeeklyUpdateEligibility(logs);
      
      expect(result.canUpdate).toBe(false);
      expect(result.warning).not.toBeNull();
      expect(result.missingDays).toBe(4);
    });
  });

  describe('checkMaintenanceDrift', () => {
    const toleranceKg = METABOLIC_CONSTANTS.MAINTENANCE_TOLERANCE_KG; // 1.5
    const microAdjustment = METABOLIC_CONSTANTS.MICRO_ADJUSTMENT_KCAL; // 150

    it('should return "within" when within tolerance', () => {
      const result = checkMaintenanceDrift(85, 85, 2500);
      
      expect(result.driftStatus).toBe('within');
      expect(result.adjustedCalories).toBe(2500);
      expect(result.drift).toBe(0);
    });

    it('should return "within" at edge of tolerance', () => {
      const result = checkMaintenanceDrift(86.5, 85, 2500); // +1.5kg exactly
      
      expect(result.driftStatus).toBe('within');
      expect(result.adjustedCalories).toBe(2500);
    });

    it('should apply micro-cut when above tolerance', () => {
      const result = checkMaintenanceDrift(87, 85, 2500); // +2kg
      
      expect(result.driftStatus).toBe('above');
      expect(result.adjustedCalories).toBe(2500 - microAdjustment);
      expect(result.drift).toBe(2);
    });

    it('should apply micro-bulk when below tolerance', () => {
      const result = checkMaintenanceDrift(83, 85, 2500); // -2kg
      
      expect(result.driftStatus).toBe('below');
      expect(result.adjustedCalories).toBe(2500 + microAdjustment);
      expect(result.drift).toBe(-2);
    });
  });

  describe('buildWeeklyCheckIn', () => {
    const makeComputedState = (date: string, tdee: number, trendWeight: number): ComputedState => ({
      date,
      trendWeightKg: trendWeight,
      estimatedTdeeKcal: tdee,
      rawTdeeKcal: tdee,
      fluxConfidenceRange: 200,
      energyDensityUsed: 7700,
      weightDeltaKg: -0.1,
    });

    const makeDailyLog = (date: string): DailyLog => ({
      date,
      scaleWeightKg: 85,
      nutritionCalories: 2000,
      nutritionProteinG: 150,
      nutritionCarbsG: 200,
      nutritionFatG: 65,
      stepCount: null,
      logStatus: 'complete',
    });

    it('should build weekly check-in with valid data', () => {
      const dailyLogs = Array.from({ length: 7 }, (_, i) => 
        makeDailyLog(`2026-01-0${i + 1}`)
      );
      
      const computedStates = Array.from({ length: 7 }, (_, i) => 
        makeComputedState(`2026-01-0${i + 1}`, 2500, 85 - i * 0.05)
      );
      
      const userGoals: UserGoals = {
        calorieGoal: 2000,
        proteinGoal: 150,
        carbsGoal: 200,
        fatGoal: 65,
        goalType: 'lose',
        goalRate: 0.5,
      };
      
      const result = buildWeeklyCheckIn(
        '2026-01-01',
        '2026-01-07',
        dailyLogs,
        computedStates,
        userGoals
      );
      
      expect(result).not.toBeNull();
      expect(result!.weekStartDate).toBe('2026-01-01');
      expect(result!.weekEndDate).toBe('2026-01-07');
      expect(result!.averageTdee).toBe(2500);
      expect(result!.adherenceScore).toBe(1);
      expect(result!.trendWeightStart).toBe(85);
    });

    it('should return null with no valid computed states', () => {
      const dailyLogs = [makeDailyLog('2026-01-01')];
      const computedStates: ComputedState[] = [];
      
      const userGoals: UserGoals = {
        calorieGoal: 2000,
        proteinGoal: 150,
        carbsGoal: 200,
        fatGoal: 65,
      };
      
      const result = buildWeeklyCheckIn(
        '2026-01-01',
        '2026-01-07',
        dailyLogs,
        computedStates,
        userGoals
      );
      
      expect(result).toBeNull();
    });

    it('should use dynamic maintenance when goal is maintain', () => {
      const dailyLogs = Array.from({ length: 7 }, (_, i) => 
        makeDailyLog(`2026-01-0${i + 1}`)
      );
      
      const computedStates = Array.from({ length: 7 }, (_, i) => 
        makeComputedState(`2026-01-0${i + 1}`, 2500, 87) // Above target
      );
      
      const userGoals: UserGoals = {
        calorieGoal: 2000,
        proteinGoal: 150,
        carbsGoal: 200,
        fatGoal: 65,
        goalType: 'maintain',
        targetWeightKg: 85, // Target is 85, current is 87
      };
      
      const result = buildWeeklyCheckIn(
        '2026-01-01',
        '2026-01-07',
        dailyLogs,
        computedStates,
        userGoals
      );
      
      expect(result).not.toBeNull();
      // Should suggest lower calories due to being above target
      expect(result!.suggestedCalories).toBeLessThan(2500);
    });
  });

  describe('detectPartialLogging', () => {
    it('should return false for null calories (untracked)', () => {
      const dailyLog: DailyLog = {
        date: '2026-01-01',
        scaleWeightKg: 85,
        nutritionCalories: null,
        nutritionProteinG: null,
        nutritionCarbsG: null,
        nutritionFatG: null,
        stepCount: null,
        logStatus: 'skipped',
      };
      
      expect(detectPartialLogging(dailyLog, 2500)).toBe(false);
    });

    it('should return false for zero calories (fasting)', () => {
      const dailyLog: DailyLog = {
        date: '2026-01-01',
        scaleWeightKg: 85,
        nutritionCalories: 0,
        nutritionProteinG: 0,
        nutritionCarbsG: 0,
        nutritionFatG: 0,
        stepCount: null,
        logStatus: 'complete',
      };
      
      expect(detectPartialLogging(dailyLog, 2500)).toBe(false);
    });

    it('should detect partial logging below 50% of TDEE', () => {
      const dailyLog: DailyLog = {
        date: '2026-01-01',
        scaleWeightKg: 85,
        nutritionCalories: 1000, // < 50% of 2500
        nutritionProteinG: 75,
        nutritionCarbsG: 100,
        nutritionFatG: 30,
        stepCount: null,
        logStatus: 'complete',
      };
      
      expect(detectPartialLogging(dailyLog, 2500)).toBe(true);
    });

    it('should not detect partial logging at 50%+ of TDEE', () => {
      const dailyLog: DailyLog = {
        date: '2026-01-01',
        scaleWeightKg: 85,
        nutritionCalories: 1300, // > 50% of 2500
        nutritionProteinG: 100,
        nutritionCarbsG: 130,
        nutritionFatG: 40,
        stepCount: null,
        logStatus: 'complete',
      };
      
      expect(detectPartialLogging(dailyLog, 2500)).toBe(false);
    });
  });

  describe('determineLogStatus', () => {
    it('should return "skipped" for null calories', () => {
      const dailyLog: DailyLog = {
        date: '2026-01-01',
        scaleWeightKg: 85,
        nutritionCalories: null,
        nutritionProteinG: null,
        nutritionCarbsG: null,
        nutritionFatG: null,
        stepCount: null,
        logStatus: 'complete',
      };
      
      expect(determineLogStatus(dailyLog, 2500)).toBe('skipped');
    });

    it('should return "partial" for low calories', () => {
      const dailyLog: DailyLog = {
        date: '2026-01-01',
        scaleWeightKg: 85,
        nutritionCalories: 800,
        nutritionProteinG: 60,
        nutritionCarbsG: 80,
        nutritionFatG: 25,
        stepCount: null,
        logStatus: 'complete',
      };
      
      expect(determineLogStatus(dailyLog, 2500)).toBe('partial');
    });

    it('should return "complete" for adequate calories', () => {
      const dailyLog: DailyLog = {
        date: '2026-01-01',
        scaleWeightKg: 85,
        nutritionCalories: 2000,
        nutritionProteinG: 150,
        nutritionCarbsG: 200,
        nutritionFatG: 65,
        stepCount: null,
        logStatus: 'complete',
      };
      
      expect(determineLogStatus(dailyLog, 2500)).toBe('complete');
    });
  });

  describe('calculateGoalProgress', () => {
    it('should calculate progress toward weight loss goal', () => {
      // Start: 90kg, Target: 80kg, Current: 85kg
      // Progress: (85 - 90) / (80 - 90) = -5 / -10 = 0.5 = 50%
      const result = calculateGoalProgress(90, 85, 80);
      expect(result).toBe(50);
    });

    it('should calculate progress toward weight gain goal', () => {
      // Start: 70kg, Target: 80kg, Current: 75kg
      // Progress: (75 - 70) / (80 - 70) = 5 / 10 = 0.5 = 50%
      const result = calculateGoalProgress(70, 75, 80);
      expect(result).toBe(50);
    });

    it('should return 100 when at goal', () => {
      const result = calculateGoalProgress(90, 80, 80);
      expect(result).toBe(100);
    });

    it('should return 100 when already at goal at start', () => {
      const result = calculateGoalProgress(80, 80, 80);
      expect(result).toBe(100);
    });

    it('should cap at 150% for overshooting', () => {
      // Started at 90, target 80, now at 70 (went too far)
      const result = calculateGoalProgress(90, 70, 80);
      expect(result).toBe(150);
    });

    it('should return 0 for no progress', () => {
      const result = calculateGoalProgress(90, 90, 80);
      expect(result).toBe(0);
    });
  });

  describe('estimateWeeksToGoal', () => {
    it('should estimate weeks for weight loss', () => {
      // Current: 85kg, Target: 80kg, Rate: -0.5kg/week
      // 5kg / 0.5 = 10 weeks
      const result = estimateWeeksToGoal(85, 80, -0.5);
      expect(result).toBe(10);
    });

    it('should estimate weeks for weight gain', () => {
      // Current: 75kg, Target: 80kg, Rate: +0.5kg/week
      // 5kg / 0.5 = 10 weeks
      const result = estimateWeeksToGoal(75, 80, 0.5);
      expect(result).toBe(10);
    });

    it('should return 0 when at goal', () => {
      const result = estimateWeeksToGoal(80, 80, -0.5);
      expect(result).toBe(0);
    });

    it('should return null when rate is zero', () => {
      const result = estimateWeeksToGoal(85, 80, 0);
      expect(result).toBeNull();
    });

    it('should return null when moving away from goal', () => {
      // Need to lose weight but gaining
      const result = estimateWeeksToGoal(85, 80, 0.5);
      expect(result).toBeNull();
    });
  });

  describe('getWeekStartDate / getWeekEndDate', () => {
    it('should return Monday for week start', () => {
      // January 15, 2026 is a Thursday
      const date = new Date('2026-01-15T12:00:00Z');
      const result = getWeekStartDate(date);
      
      // Should be Monday Jan 12
      expect(result).toBe('2026-01-12');
    });

    it('should return Sunday for week end', () => {
      // January 15, 2026 is a Thursday
      const date = new Date('2026-01-15T12:00:00Z');
      const result = getWeekEndDate(date);
      
      // Should be Sunday Jan 18
      expect(result).toBe('2026-01-18');
    });

    it('should handle Sunday correctly', () => {
      // January 18, 2026 is a Sunday
      const date = new Date('2026-01-18T12:00:00Z');
      
      const startResult = getWeekStartDate(date);
      const endResult = getWeekEndDate(date);
      
      // Sunday belongs to the previous week (Mon-Sun)
      expect(startResult).toBe('2026-01-12');
      expect(endResult).toBe('2026-01-18');
    });

    it('should handle Monday correctly', () => {
      // January 19, 2026 is a Monday
      const date = new Date('2026-01-19T12:00:00Z');
      
      const startResult = getWeekStartDate(date);
      const endResult = getWeekEndDate(date);
      
      expect(startResult).toBe('2026-01-19');
      expect(endResult).toBe('2026-01-25');
    });
  });
});
