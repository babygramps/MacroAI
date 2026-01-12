/**
 * Weight Trend Engine
 * 
 * Implements Exponential Moving Average (EMA) for weight smoothing,
 * similar to MacroFactor's V3 architecture.
 * 
 * Raw scale weight is noisy due to water/gut content fluctuations.
 * The trend weight is a "latent variable" that represents true tissue mass.
 */

import { METABOLIC_CONSTANTS, type WeightDataPoint, type WeightLogEntry } from './types';

const { WEIGHT_EMA_ALPHA } = METABOLIC_CONSTANTS;

/**
 * Calculate the next trend weight using Exponential Moving Average
 * 
 * @param prevTrend - Previous day's trend weight
 * @param rawScaleWeight - Today's scale weight (null if not weighed)
 * @param alpha - Smoothing factor (0.1 = smoother, 0.2 = more responsive)
 * @returns New trend weight
 */
export function updateTrendWeight(
  prevTrend: number,
  rawScaleWeight: number | null,
  alpha: number = WEIGHT_EMA_ALPHA
): number {
  if (rawScaleWeight === null) {
    // If no measurement, hold the previous trend
    return prevTrend;
  }
  
  // Standard EMA formula: new = (raw * alpha) + (prev * (1 - alpha))
  return (rawScaleWeight * alpha) + (prevTrend * (1 - alpha));
}

/**
 * Linear interpolation between two known weights for missing days
 * 
 * @param startWeight - Weight at start date
 * @param endWeight - Weight at end date
 * @param startDate - Start date
 * @param endDate - End date
 * @param targetDate - Date to interpolate for
 * @returns Interpolated weight
 */
export function interpolateWeight(
  startWeight: number,
  endWeight: number,
  startDate: Date,
  endDate: Date,
  targetDate: Date
): number {
  const totalDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  const daysFromStart = (targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  
  if (totalDays === 0) return startWeight;
  
  const progress = daysFromStart / totalDays;
  return startWeight + (endWeight - startWeight) * progress;
}

/**
 * Fill in missing weight measurements using interpolation
 * 
 * @param entries - Array of weight entries (may have gaps)
 * @param startDate - Start date for the range
 * @param endDate - End date for the range
 * @returns Array with interpolated values for missing days
 */
export function interpolateMissingWeights(
  entries: WeightLogEntry[],
  startDate: Date,
  endDate: Date
): Map<string, number | null> {
  const weightMap = new Map<string, number | null>();
  
  // Sort entries by date
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );
  
  // Create a map of date -> weight for existing entries
  const existingWeights = new Map<string, number>();
  for (const entry of sortedEntries) {
    const dateKey = formatDateKey(new Date(entry.recordedAt));
    existingWeights.set(dateKey, entry.weightKg);
  }
  
  // Iterate through each day in the range
  const currentDate = new Date(startDate);
  currentDate.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  
  while (currentDate <= end) {
    const dateKey = formatDateKey(currentDate);
    
    if (existingWeights.has(dateKey)) {
      // We have a real measurement
      weightMap.set(dateKey, existingWeights.get(dateKey)!);
    } else {
      // Need to interpolate or leave null
      const prevEntry = findPreviousEntry(sortedEntries, currentDate);
      const nextEntry = findNextEntry(sortedEntries, currentDate);
      
      if (prevEntry && nextEntry) {
        // Interpolate between known values
        const interpolated = interpolateWeight(
          prevEntry.weightKg,
          nextEntry.weightKg,
          new Date(prevEntry.recordedAt),
          new Date(nextEntry.recordedAt),
          currentDate
        );
        weightMap.set(dateKey, interpolated);
      } else if (prevEntry) {
        // No future data, use last known value (trend will hold)
        weightMap.set(dateKey, null);
      } else {
        // No prior data
        weightMap.set(dateKey, null);
      }
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return weightMap;
}

/**
 * Calculate trend weights for a series of weight entries
 * 
 * @param entries - Weight log entries
 * @param startDate - Start date for calculation
 * @param endDate - End date for calculation
 * @param initialTrendWeight - Starting trend weight (optional, uses first weight if not provided)
 * @returns Array of weight data points with both raw and trend values
 */
export function calculateTrendWeights(
  entries: WeightLogEntry[],
  startDate: Date,
  endDate: Date,
  initialTrendWeight?: number
): WeightDataPoint[] {
  const result: WeightDataPoint[] = [];
  
  if (entries.length === 0) {
    return result;
  }
  
  // Sort entries by date
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );
  
  // Get interpolated weights for missing days
  const interpolatedWeights = interpolateMissingWeights(sortedEntries, startDate, endDate);
  
  // Initialize trend weight
  let trendWeight = initialTrendWeight ?? sortedEntries[0].weightKg;
  
  // Iterate through each day
  const currentDate = new Date(startDate);
  currentDate.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  
  while (currentDate <= end) {
    const dateKey = formatDateKey(currentDate);
    const rawWeight = interpolatedWeights.get(dateKey) ?? null;
    
    // Find if there's an actual measurement for this day
    const actualEntry = sortedEntries.find(e => 
      formatDateKey(new Date(e.recordedAt)) === dateKey
    );
    const scaleWeight = actualEntry?.weightKg ?? null;
    
    // Update trend weight
    // For interpolated values, we still apply EMA to smooth the curve
    // For missing values (null), trend holds
    trendWeight = updateTrendWeight(trendWeight, rawWeight);
    
    result.push({
      date: dateKey,
      scaleWeight,
      trendWeight: Math.round(trendWeight * 100) / 100, // Round to 2 decimals
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return result;
}

/**
 * Calculate the weight delta between two trend weights
 * Used for TDEE back-solving
 * 
 * @param currentTrend - Today's trend weight
 * @param previousTrend - Yesterday's trend weight
 * @returns Weight change in kg (negative = losing, positive = gaining)
 */
export function calculateWeightDelta(
  currentTrend: number,
  previousTrend: number
): number {
  return Math.round((currentTrend - previousTrend) * 1000) / 1000; // 3 decimal precision
}

/**
 * Get the weekly weight change rate from trend data
 * 
 * @param trendData - Array of weight data points
 * @returns Weekly change rate in kg (negative = losing, positive = gaining)
 */
export function getWeeklyWeightChange(trendData: WeightDataPoint[]): number {
  if (trendData.length < 2) return 0;
  
  const latest = trendData[trendData.length - 1];
  
  // Find entry from ~7 days ago
  const targetIndex = Math.max(0, trendData.length - 7);
  const weekAgo = trendData[targetIndex];
  
  const change = latest.trendWeight - weekAgo.trendWeight;
  return Math.round(change * 100) / 100;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Format date to YYYY-MM-DD string
 */
function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Find the most recent entry before the target date
 */
function findPreviousEntry(
  entries: WeightLogEntry[],
  targetDate: Date
): WeightLogEntry | null {
  const target = targetDate.getTime();
  let result: WeightLogEntry | null = null;
  
  for (const entry of entries) {
    const entryDate = new Date(entry.recordedAt);
    entryDate.setHours(0, 0, 0, 0);
    
    if (entryDate.getTime() < target) {
      if (!result || new Date(entry.recordedAt).getTime() > new Date(result.recordedAt).getTime()) {
        result = entry;
      }
    }
  }
  
  return result;
}

/**
 * Find the next entry after the target date
 */
function findNextEntry(
  entries: WeightLogEntry[],
  targetDate: Date
): WeightLogEntry | null {
  const target = targetDate.getTime();
  let result: WeightLogEntry | null = null;
  
  for (const entry of entries) {
    const entryDate = new Date(entry.recordedAt);
    entryDate.setHours(0, 0, 0, 0);
    
    if (entryDate.getTime() > target) {
      if (!result || new Date(entry.recordedAt).getTime() < new Date(result.recordedAt).getTime()) {
        result = entry;
      }
    }
  }
  
  return result;
}

/**
 * Debug logging for trend calculations
 */
export function logTrendCalculation(
  date: string,
  rawWeight: number | null,
  prevTrend: number,
  newTrend: number,
  alpha: number = WEIGHT_EMA_ALPHA
): void {
  console.log(`[TrendEngine] ${date}: raw=${rawWeight?.toFixed(1) ?? 'null'}, prev=${prevTrend.toFixed(2)}, new=${newTrend.toFixed(2)}, alpha=${alpha}`);
}
