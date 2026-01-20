/**
 * Unit tests for trendEngine.ts
 * Tests weight trend EMA calculations and interpolation
 */

import {
  updateTrendWeight,
  interpolateWeight,
  calculateTrendWeights,
  calculateWeightDelta,
  getWeeklyWeightChange,
  interpolateMissingWeights,
} from '@/lib/trendEngine';
import { METABOLIC_CONSTANTS } from '@/lib/types';
import type { WeightLogEntry } from '@/lib/types';

describe('trendEngine', () => {
  describe('updateTrendWeight', () => {
    const alpha = METABOLIC_CONSTANTS.WEIGHT_EMA_ALPHA; // 0.1

    it('should apply EMA formula correctly with default alpha', () => {
      // EMA: new = (raw * alpha) + (prev * (1 - alpha))
      // new = (84 * 0.1) + (85 * 0.9) = 8.4 + 76.5 = 84.9
      const result = updateTrendWeight(85, 84);
      expect(result).toBeCloseTo(84.9, 2);
    });

    it('should return previous trend when raw weight is null', () => {
      const result = updateTrendWeight(85, null);
      expect(result).toBe(85);
    });

    it('should apply custom alpha when provided', () => {
      // With alpha = 0.2: new = (84 * 0.2) + (85 * 0.8) = 16.8 + 68 = 84.8
      const result = updateTrendWeight(85, 84, 0.2);
      expect(result).toBeCloseTo(84.8, 2);
    });

    it('should handle weight increase correctly', () => {
      // Gaining weight: new = (86 * 0.1) + (85 * 0.9) = 8.6 + 76.5 = 85.1
      const result = updateTrendWeight(85, 86);
      expect(result).toBeCloseTo(85.1, 2);
    });

    it('should handle same weight (no change)', () => {
      // Same weight: new = (85 * 0.1) + (85 * 0.9) = 8.5 + 76.5 = 85
      const result = updateTrendWeight(85, 85);
      expect(result).toBeCloseTo(85, 2);
    });

    it('should converge toward raw weight over multiple updates', () => {
      let trend = 85;
      const rawWeight = 80;
      
      // Apply EMA multiple times
      for (let i = 0; i < 50; i++) {
        trend = updateTrendWeight(trend, rawWeight);
      }
      
      // After many iterations, trend should approach raw weight (within 0.1kg)
      expect(trend).toBeCloseTo(rawWeight, 0);
    });
  });

  describe('interpolateWeight', () => {
    it('should interpolate linearly between two weights', () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-10');
      const targetDate = new Date('2026-01-05');
      
      // 4 days out of 9 total = 4/9 progress
      // 80 + (90 - 80) * (4/9) = 80 + 4.44 = 84.44
      const result = interpolateWeight(80, 90, startDate, endDate, targetDate);
      expect(result).toBeCloseTo(84.44, 1);
    });

    it('should return start weight when target is at start', () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-10');
      const targetDate = new Date('2026-01-01');
      
      const result = interpolateWeight(80, 90, startDate, endDate, targetDate);
      expect(result).toBe(80);
    });

    it('should return end weight when target is at end', () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-10');
      const targetDate = new Date('2026-01-10');
      
      const result = interpolateWeight(80, 90, startDate, endDate, targetDate);
      expect(result).toBe(90);
    });

    it('should handle same start and end date', () => {
      const date = new Date('2026-01-01');
      
      const result = interpolateWeight(80, 90, date, date, date);
      expect(result).toBe(80);
    });

    it('should handle decreasing weight', () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-10');
      const targetDate = new Date('2026-01-05');
      
      // 4/9 progress from 90 to 80 = 90 + (80 - 90) * (4/9) = 90 - 4.44 = 85.56
      const result = interpolateWeight(90, 80, startDate, endDate, targetDate);
      expect(result).toBeCloseTo(85.56, 1);
    });
  });

  describe('interpolateMissingWeights', () => {
    it('should preserve existing weights', () => {
      const entries: WeightLogEntry[] = [
        { id: '1', weightKg: 85, recordedAt: '2026-01-01T08:00:00' },
        { id: '2', weightKg: 84, recordedAt: '2026-01-02T08:00:00' },
      ];
      
      const startDate = new Date(2026, 0, 1); // Jan 1, 2026 in local time
      const endDate = new Date(2026, 0, 2);   // Jan 2, 2026 in local time
      
      const result = interpolateMissingWeights(entries, startDate, endDate);
      
      expect(result.get('2026-01-01')).toBe(85);
      expect(result.get('2026-01-02')).toBe(84);
    });

    it('should interpolate missing days between entries', () => {
      const entries: WeightLogEntry[] = [
        { id: '1', weightKg: 85, recordedAt: '2026-01-01T08:00:00' },
        { id: '2', weightKg: 83, recordedAt: '2026-01-03T08:00:00' },
      ];
      
      const startDate = new Date(2026, 0, 1);
      const endDate = new Date(2026, 0, 3);
      
      const result = interpolateMissingWeights(entries, startDate, endDate);
      
      // Jan 2 should be interpolated between 85 and 83
      // The exact value depends on the timestamp, but should be between the two
      const jan2Value = result.get('2026-01-02');
      expect(jan2Value).toBeDefined();
      expect(jan2Value).toBeGreaterThan(83);
      expect(jan2Value).toBeLessThan(85);
    });

    it('should return null for days before first entry', () => {
      const entries: WeightLogEntry[] = [
        { id: '1', weightKg: 85, recordedAt: '2026-01-02T08:00:00' },
      ];
      
      const startDate = new Date(2026, 0, 1);
      const endDate = new Date(2026, 0, 2);
      
      const result = interpolateMissingWeights(entries, startDate, endDate);
      
      expect(result.get('2026-01-01')).toBeNull();
      expect(result.get('2026-01-02')).toBe(85);
    });

    it('should return null for days after last entry with no next', () => {
      const entries: WeightLogEntry[] = [
        { id: '1', weightKg: 85, recordedAt: '2026-01-01T08:00:00' },
      ];
      
      const startDate = new Date(2026, 0, 1);
      const endDate = new Date(2026, 0, 2);
      
      const result = interpolateMissingWeights(entries, startDate, endDate);
      
      expect(result.get('2026-01-01')).toBe(85);
      expect(result.get('2026-01-02')).toBeNull();
    });
  });

  describe('calculateTrendWeights', () => {
    it('should return empty array for empty entries', () => {
      const result = calculateTrendWeights(
        [],
        new Date('2026-01-01'),
        new Date('2026-01-05')
      );
      expect(result).toEqual([]);
    });

    it('should calculate trend weights for consecutive days', () => {
      const entries: WeightLogEntry[] = [
        { id: '1', weightKg: 85, recordedAt: '2026-01-01T08:00:00' },
        { id: '2', weightKg: 84.5, recordedAt: '2026-01-02T08:00:00' },
        { id: '3', weightKg: 84, recordedAt: '2026-01-03T08:00:00' },
      ];
      
      const result = calculateTrendWeights(
        entries,
        new Date(2026, 0, 1),
        new Date(2026, 0, 3)
      );
      
      expect(result.length).toBeGreaterThanOrEqual(3);
      
      // Find the entry for Jan 1
      const jan1 = result.find(r => r.date === '2026-01-01');
      expect(jan1).toBeDefined();
      expect(jan1!.scaleWeight).toBe(85);
      expect(jan1!.trendWeight).toBe(85); // First day uses raw weight as trend
      
      // Find the entry for Jan 2
      const jan2 = result.find(r => r.date === '2026-01-02');
      expect(jan2).toBeDefined();
      // Day 2: trend = (84.5 * 0.1) + (85 * 0.9) = 84.95
      expect(jan2!.trendWeight).toBeCloseTo(84.95, 1);
    });

    it('should handle missing days with interpolation', () => {
      const entries: WeightLogEntry[] = [
        { id: '1', weightKg: 85, recordedAt: '2026-01-01T08:00:00' },
        { id: '2', weightKg: 83, recordedAt: '2026-01-03T08:00:00' },
      ];
      
      const result = calculateTrendWeights(
        entries,
        new Date(2026, 0, 1),
        new Date(2026, 0, 3)
      );
      
      expect(result.length).toBeGreaterThanOrEqual(3);
      
      const jan1 = result.find(r => r.date === '2026-01-01');
      const jan2 = result.find(r => r.date === '2026-01-02');
      const jan3 = result.find(r => r.date === '2026-01-03');
      
      expect(jan1?.scaleWeight).toBe(85);
      expect(jan2?.scaleWeight).toBeNull(); // No actual measurement on Jan 2
      expect(jan3?.scaleWeight).toBe(83);
    });

    it('should use provided initial trend weight', () => {
      const entries: WeightLogEntry[] = [
        { id: '1', weightKg: 84, recordedAt: '2026-01-02T08:00:00' },
      ];
      
      const result = calculateTrendWeights(
        entries,
        new Date(2026, 0, 1),
        new Date(2026, 0, 2),
        85 // Initial trend weight
      );
      
      // Jan 1 has no measurement, trend holds at 85
      // Jan 2 has measurement: (84 * 0.1) + (85 * 0.9) = 84.9
      const jan2 = result.find(r => r.date === '2026-01-02');
      expect(jan2).toBeDefined();
      expect(jan2!.trendWeight).toBeCloseTo(84.9, 1);
    });
  });

  describe('calculateWeightDelta', () => {
    it('should calculate weight loss correctly', () => {
      const result = calculateWeightDelta(84, 85);
      expect(result).toBe(-1);
    });

    it('should calculate weight gain correctly', () => {
      const result = calculateWeightDelta(86, 85);
      expect(result).toBe(1);
    });

    it('should return zero for no change', () => {
      const result = calculateWeightDelta(85, 85);
      expect(result).toBe(0);
    });

    it('should handle small deltas with precision', () => {
      const result = calculateWeightDelta(85.123, 85);
      expect(result).toBe(0.123);
    });
  });

  describe('getWeeklyWeightChange', () => {
    it('should return 0 for less than 2 data points', () => {
      expect(getWeeklyWeightChange([])).toBe(0);
      expect(getWeeklyWeightChange([{ date: '2026-01-01', scaleWeight: 85, trendWeight: 85 }])).toBe(0);
    });

    it('should calculate weekly change from 7 days of data', () => {
      const trendData = Array.from({ length: 7 }, (_, i) => ({
        date: `2026-01-0${i + 1}`,
        scaleWeight: 85 - i * 0.1,
        trendWeight: 85 - i * 0.1,
      }));
      
      // Change from day 1 (85) to day 7 (84.4) = -0.6
      const result = getWeeklyWeightChange(trendData);
      expect(result).toBeCloseTo(-0.6, 1);
    });

    it('should use index 0 for data less than 7 days', () => {
      const trendData = [
        { date: '2026-01-01', scaleWeight: 85, trendWeight: 85 },
        { date: '2026-01-02', scaleWeight: 84.5, trendWeight: 84.5 },
        { date: '2026-01-03', scaleWeight: 84, trendWeight: 84 },
      ];
      
      // Change from day 1 (85) to day 3 (84) = -1
      const result = getWeeklyWeightChange(trendData);
      expect(result).toBe(-1);
    });

    it('should handle weight gain', () => {
      const trendData = Array.from({ length: 7 }, (_, i) => ({
        date: `2026-01-0${i + 1}`,
        scaleWeight: 85 + i * 0.1,
        trendWeight: 85 + i * 0.1,
      }));
      
      // Change from day 1 (85) to day 7 (85.6) = +0.6
      const result = getWeeklyWeightChange(trendData);
      expect(result).toBeCloseTo(0.6, 1);
    });
  });
});
