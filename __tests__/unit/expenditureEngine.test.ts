/**
 * Unit tests for expenditureEngine.ts
 * Tests TDEE calculation, BMR formulas, and energy density selection
 */

import {
  selectEnergyDensity,
  calculateRawTdee,
  smoothTdee,
  calculateDailyExpenditure,
  calculateMifflinStJeorBmr,
  calculateAge,
  calculateColdStartTdee,
  determineConfidenceLevel,
  calculateFluxRange,
  buildComputedState,
  predictGoalTransitionTdee,
} from '@/lib/expenditureEngine';
import { METABOLIC_CONSTANTS } from '@/lib/types';
import type { DailyLog, UserGoals } from '@/lib/types';

describe('expenditureEngine', () => {
  describe('selectEnergyDensity', () => {
    it('should return 7700 for deficit (losing weight)', () => {
      expect(selectEnergyDensity(-0.1)).toBe(METABOLIC_CONSTANTS.ENERGY_DENSITY_DEFICIT);
      expect(selectEnergyDensity(-0.5)).toBe(7700);
    });

    it('should return 5500 for surplus (gaining weight)', () => {
      expect(selectEnergyDensity(0.1)).toBe(METABOLIC_CONSTANTS.ENERGY_DENSITY_SURPLUS);
      expect(selectEnergyDensity(0.5)).toBe(5500);
    });

    it('should return 5500 for zero delta (no change)', () => {
      // Zero is not negative, so it falls into the surplus/neutral branch
      expect(selectEnergyDensity(0)).toBe(5500);
    });
  });

  describe('calculateRawTdee', () => {
    it('should calculate TDEE correctly for deficit (weight loss)', () => {
      // TDEE = Calories - (Delta * Density)
      // TDEE = 2000 - (-0.1 * 7700) = 2000 + 770 = 2770
      const result = calculateRawTdee(2000, -0.1);
      expect(result.rawTdee).toBe(2770);
      expect(result.energyDensity).toBe(7700);
    });

    it('should calculate TDEE correctly for surplus (weight gain)', () => {
      // TDEE = 3000 - (0.1 * 5500) = 3000 - 550 = 2450
      const result = calculateRawTdee(3000, 0.1);
      expect(result.rawTdee).toBe(2450);
      expect(result.energyDensity).toBe(5500);
    });

    it('should return calories when delta is zero', () => {
      // TDEE = 2500 - (0 * 5500) = 2500
      const result = calculateRawTdee(2500, 0);
      expect(result.rawTdee).toBe(2500);
    });

    it('should handle large calorie surplus with weight maintenance', () => {
      // Eating a lot but not gaining - high TDEE
      // TDEE = 4000 - (0 * 5500) = 4000
      const result = calculateRawTdee(4000, 0);
      expect(result.rawTdee).toBe(4000);
    });

    it('should handle low calories with weight loss', () => {
      // TDEE = 1500 - (-0.2 * 7700) = 1500 + 1540 = 3040
      const result = calculateRawTdee(1500, -0.2);
      expect(result.rawTdee).toBe(3040);
    });
  });

  describe('smoothTdee', () => {
    const defaultAlpha = METABOLIC_CONSTANTS.TDEE_EMA_ALPHA; // 0.05

    it('should apply EMA smoothing with default alpha', () => {
      // EMA: new = (raw * 0.05) + (prev * 0.95)
      // new = (2800 * 0.05) + (2500 * 0.95) = 140 + 2375 = 2515
      const result = smoothTdee(2800, 2500);
      expect(result).toBe(2515);
    });

    it('should use responsive alpha when step count increases significantly', () => {
      // With 25% step increase, should use responsive alpha (0.1)
      // new = (2800 * 0.1) + (2500 * 0.9) = 280 + 2250 = 2530
      const result = smoothTdee(2800, 2500, 0.25);
      expect(result).toBe(2530);
    });

    it('should use default alpha when step increase is below threshold', () => {
      // 10% increase is below 20% threshold
      const result = smoothTdee(2800, 2500, 0.1);
      expect(result).toBe(2515);
    });

    it('should converge slowly toward raw TDEE', () => {
      let smoothed = 2500;
      const rawTdee = 2800;
      
      // After 20 iterations, should move toward raw but not reach it
      for (let i = 0; i < 20; i++) {
        smoothed = smoothTdee(rawTdee, smoothed);
      }
      
      // Should be closer to 2800 but not quite there with alpha=0.05
      expect(smoothed).toBeGreaterThan(2650);
      expect(smoothed).toBeLessThan(2800);
    });
  });

  describe('calculateDailyExpenditure', () => {
    it('should combine raw calculation and smoothing', () => {
      const result = calculateDailyExpenditure(2000, -0.1, 2500);
      
      // Raw: 2000 - (-0.1 * 7700) = 2770
      expect(result.rawTdee).toBe(2770);
      expect(result.energyDensity).toBe(7700);
      
      // Smoothed: (2770 * 0.05) + (2500 * 0.95) = 138.5 + 2375 = 2513.5 -> 2514
      expect(result.estimatedTdee).toBe(2514);
    });

    it('should handle step count delta for responsive smoothing', () => {
      const result = calculateDailyExpenditure(2000, -0.1, 2500, 0.25);
      
      // Raw: 2770
      // Smoothed with responsive alpha (0.1): (2770 * 0.1) + (2500 * 0.9) = 2527
      expect(result.rawTdee).toBe(2770);
      expect(result.estimatedTdee).toBe(2527);
    });
  });

  describe('calculateMifflinStJeorBmr', () => {
    it('should calculate BMR for male correctly', () => {
      // BMR = (10 * 85) + (6.25 * 180) - (5 * 30) + 5
      // BMR = 850 + 1125 - 150 + 5 = 1830
      const result = calculateMifflinStJeorBmr(85, 180, 30, 'male');
      expect(result).toBe(1830);
    });

    it('should calculate BMR for female correctly', () => {
      // BMR = (10 * 65) + (6.25 * 165) - (5 * 25) - 161
      // BMR = 650 + 1031.25 - 125 - 161 = 1395.25 -> 1395
      const result = calculateMifflinStJeorBmr(65, 165, 25, 'female');
      expect(result).toBe(1395);
    });

    it('should handle different ages', () => {
      const bmr20 = calculateMifflinStJeorBmr(80, 175, 20, 'male');
      const bmr40 = calculateMifflinStJeorBmr(80, 175, 40, 'male');
      
      // Older should have lower BMR (5 kcal per year difference)
      expect(bmr40).toBe(bmr20 - 100); // 20 year difference * 5 = 100
    });

    it('should handle different weights', () => {
      const bmrLight = calculateMifflinStJeorBmr(60, 175, 30, 'male');
      const bmrHeavy = calculateMifflinStJeorBmr(100, 175, 30, 'male');
      
      // Heavier should have higher BMR (10 kcal per kg)
      expect(bmrHeavy).toBe(bmrLight + 400); // 40kg difference * 10 = 400
    });
  });

  describe('calculateAge', () => {
    it('should calculate age correctly', () => {
      // Use a fixed date for testing
      const today = new Date();
      const birthYear = today.getFullYear() - 30;
      const birthDate = `${birthYear}-01-01`;
      
      const age = calculateAge(birthDate);
      
      // Should be 30 or 29 depending on current date
      expect(age).toBeGreaterThanOrEqual(29);
      expect(age).toBeLessThanOrEqual(30);
    });

    it('should handle birthday later in year', () => {
      const today = new Date();
      const birthYear = today.getFullYear() - 30;
      // Set birthday to December 31 (likely hasn't happened yet in January)
      const birthDate = `${birthYear}-12-31`;
      
      const age = calculateAge(birthDate);
      
      // If today is before Dec 31, age should be 29
      if (today.getMonth() < 11) {
        expect(age).toBe(29);
      }
    });
  });

  describe('calculateColdStartTdee', () => {
    it('should calculate cold start TDEE using Mifflin-St Jeor', () => {
      const profile: UserGoals = {
        calorieGoal: 2000,
        proteinGoal: 150,
        carbsGoal: 200,
        fatGoal: 65,
        heightCm: 180,
        birthDate: '1994-01-01', // ~32 years old
        sex: 'male',
        athleteStatus: false,
      };
      
      const result = calculateColdStartTdee(profile, 85);
      
      // BMR = (10 * 85) + (6.25 * 180) - (5 * 32) + 5 = 1820
      // TDEE = 1820 * 1.55 (default activity) = 2821
      expect(result).toBeGreaterThan(2700);
      expect(result).toBeLessThan(2900);
    });

    it('should apply athlete correction (+10%)', () => {
      const profile: UserGoals = {
        calorieGoal: 2000,
        proteinGoal: 150,
        carbsGoal: 200,
        fatGoal: 65,
        heightCm: 180,
        birthDate: '1994-01-01',
        sex: 'male',
        athleteStatus: true,
      };
      
      const nonAthleteProfile = { ...profile, athleteStatus: false };
      
      const athleteResult = calculateColdStartTdee(profile, 85);
      const nonAthleteResult = calculateColdStartTdee(nonAthleteProfile, 85);
      
      // Athlete should be ~10% higher
      expect(athleteResult).toBeCloseTo(nonAthleteResult! * 1.1, -1);
    });

    it('should return null if missing required profile data', () => {
      const incompleteProfile: UserGoals = {
        calorieGoal: 2000,
        proteinGoal: 150,
        carbsGoal: 200,
        fatGoal: 65,
        // Missing heightCm, birthDate, sex
      };
      
      const result = calculateColdStartTdee(incompleteProfile, 85);
      expect(result).toBeNull();
    });
  });

  describe('determineConfidenceLevel', () => {
    it('should return "learning" for less than 7 days', () => {
      expect(determineConfidenceLevel(3, 0)).toBe('learning');
      expect(determineConfidenceLevel(6, 0)).toBe('learning');
    });

    it('should return "high" for 7+ days with minimal missing', () => {
      expect(determineConfidenceLevel(14, 0)).toBe('high');
      expect(determineConfidenceLevel(14, 1)).toBe('high');
    });

    it('should return "medium" for moderate missing days', () => {
      expect(determineConfidenceLevel(14, 2)).toBe('medium');
      expect(determineConfidenceLevel(14, 3)).toBe('medium');
    });

    it('should return "low" for many missing days', () => {
      expect(determineConfidenceLevel(14, 4)).toBe('low');
      expect(determineConfidenceLevel(14, 5)).toBe('low');
    });
  });

  describe('calculateFluxRange', () => {
    it('should have higher uncertainty with fewer days tracked', () => {
      const range5days = calculateFluxRange(5);
      const range20days = calculateFluxRange(20);
      
      expect(range5days).toBeGreaterThan(range20days);
    });

    it('should have minimum base uncertainty', () => {
      const range = calculateFluxRange(100); // Many days
      expect(range).toBeGreaterThanOrEqual(100);
    });

    it('should increase with variance', () => {
      const rangeNoVariance = calculateFluxRange(14, 0);
      const rangeHighVariance = calculateFluxRange(14, 10000);
      
      expect(rangeHighVariance).toBeGreaterThan(rangeNoVariance);
    });
  });

  describe('buildComputedState', () => {
    it('should build computed state with valid data', () => {
      const dailyLog: DailyLog = {
        date: '2026-01-15',
        scaleWeightKg: 84,
        nutritionCalories: 2000,
        nutritionProteinG: 150,
        nutritionCarbsG: 200,
        nutritionFatG: 65,
        stepCount: null,
        logStatus: 'complete',
      };
      
      const result = buildComputedState(
        '2026-01-15',
        84.5, // trendWeightKg
        85,   // prevTrendWeightKg
        dailyLog,
        2500  // prevTdee
      );
      
      expect(result.date).toBe('2026-01-15');
      expect(result.trendWeightKg).toBe(84.5);
      expect(result.weightDeltaKg).toBe(-0.5);
      expect(result.energyDensityUsed).toBe(7700); // Deficit
      
      // Raw TDEE: 2000 - (-0.5 * 7700) = 5850
      expect(result.rawTdeeKcal).toBe(5850);
    });

    it('should hold previous TDEE when no calorie data', () => {
      const dailyLog: DailyLog = {
        date: '2026-01-15',
        scaleWeightKg: 84,
        nutritionCalories: null, // No data
        nutritionProteinG: null,
        nutritionCarbsG: null,
        nutritionFatG: null,
        stepCount: null,
        logStatus: 'skipped',
      };
      
      const result = buildComputedState(
        '2026-01-15',
        84.5,
        85,
        dailyLog,
        2500
      );
      
      expect(result.estimatedTdeeKcal).toBe(2500); // Held from previous
      expect(result.fluxConfidenceRange).toBe(500); // High uncertainty
    });

    it('should hold previous TDEE when daily log is null', () => {
      const result = buildComputedState(
        '2026-01-15',
        84.5,
        85,
        null,
        2500
      );

      expect(result.estimatedTdeeKcal).toBe(2500);
    });

    it('should hold previous TDEE when day is marked as skipped even with calorie data', () => {
      const dailyLog: DailyLog = {
        date: '2026-01-15',
        scaleWeightKg: 84,
        nutritionCalories: 1500, // Has calories but user marked incomplete
        nutritionProteinG: 100,
        nutritionCarbsG: 150,
        nutritionFatG: 50,
        stepCount: null,
        logStatus: 'skipped', // User explicitly marked as incomplete
      };

      const result = buildComputedState(
        '2026-01-15',
        84.5,
        85,
        dailyLog,
        2500
      );

      // Should hold previous TDEE because user marked day as skipped
      expect(result.estimatedTdeeKcal).toBe(2500);
      expect(result.rawTdeeKcal).toBe(2500);
      expect(result.fluxConfidenceRange).toBe(500); // High uncertainty
    });
  });

  describe('predictGoalTransitionTdee', () => {
    it('should increase TDEE when going from cut to bulk', () => {
      const currentTdee = 2500;
      const result = predictGoalTransitionTdee(currentTdee, 'lose', 'gain', 1);
      
      expect(result).toBeGreaterThan(currentTdee);
    });

    it('should decrease TDEE when going from bulk to cut', () => {
      const currentTdee = 2500;
      const result = predictGoalTransitionTdee(currentTdee, 'gain', 'lose', 1);
      
      expect(result).toBeLessThan(currentTdee);
    });

    it('should return same TDEE when staying on same goal', () => {
      const currentTdee = 2500;
      const result = predictGoalTransitionTdee(currentTdee, 'lose', 'lose', 0);
      
      expect(result).toBe(currentTdee);
    });

    it('should return same TDEE for maintain to maintain', () => {
      const currentTdee = 2500;
      const result = predictGoalTransitionTdee(currentTdee, 'maintain', 'maintain', 0);
      
      expect(result).toBe(currentTdee);
    });
  });
});
