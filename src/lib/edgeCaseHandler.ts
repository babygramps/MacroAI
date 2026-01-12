/**
 * Edge Case Handler
 * 
 * Handles special scenarios in metabolic modeling:
 * 1. Partial logging detection
 * 2. Whoosh effect protection
 * 3. Goal transition smoothing
 * 4. Data quality validation
 */

import { 
  type DailyLog, 
  type ComputedState,
  type UserGoals,
  type GoalType,
} from './types';

// ============================================
// Partial Logging Detection
// ============================================

/**
 * Threshold for detecting partial logging
 * If logged calories < 50% of TDEE, likely incomplete
 */
const PARTIAL_LOGGING_THRESHOLD = 0.5;

/**
 * Minimum calories to be considered a valid day
 * Below this is almost certainly incomplete
 */
const MINIMUM_VALID_CALORIES = 500;

/**
 * Detect if a day's logging appears incomplete
 */
export function isPartialLogging(
  loggedCalories: number | null,
  estimatedTdee: number
): { isPartial: boolean; reason: string | null } {
  // Null means untracked, not partial
  if (loggedCalories === null) {
    return { isPartial: false, reason: null };
  }
  
  // Zero means fasted, not partial
  if (loggedCalories === 0) {
    return { isPartial: false, reason: null };
  }
  
  // Below minimum threshold
  if (loggedCalories < MINIMUM_VALID_CALORIES) {
    return { 
      isPartial: true, 
      reason: `Only ${loggedCalories} kcal logged - likely incomplete`,
    };
  }
  
  // Below 50% of TDEE
  const threshold = estimatedTdee * PARTIAL_LOGGING_THRESHOLD;
  if (loggedCalories < threshold) {
    return { 
      isPartial: true, 
      reason: `${loggedCalories} kcal is less than 50% of your ${estimatedTdee} kcal TDEE`,
    };
  }
  
  return { isPartial: false, reason: null };
}

/**
 * Validate a daily log for use in TDEE calculation
 */
export function validateDailyLogForTdee(
  dailyLog: DailyLog,
  estimatedTdee: number
): { isValid: boolean; reason: string | null } {
  // Must have nutrition data
  if (dailyLog.nutritionCalories === null) {
    return { isValid: false, reason: 'No nutrition data logged' };
  }
  
  // Check for partial logging
  const partialCheck = isPartialLogging(dailyLog.nutritionCalories, estimatedTdee);
  if (partialCheck.isPartial) {
    return { isValid: false, reason: partialCheck.reason };
  }
  
  // Must not be marked as skipped
  if (dailyLog.logStatus === 'skipped') {
    return { isValid: false, reason: 'Day marked as skipped' };
  }
  
  return { isValid: true, reason: null };
}

// ============================================
// Whoosh Effect Protection
// ============================================

/**
 * Maximum credible daily weight change in kg
 * Anything beyond this is likely water fluctuation
 */
const MAX_CREDIBLE_DAILY_CHANGE = 0.5; // kg

/**
 * Extreme weight spike threshold
 * Used to detect "whoosh" or water retention events
 */
const EXTREME_CHANGE_THRESHOLD = 1.5; // kg

/**
 * Detect if a weight change is likely a whoosh effect
 */
export function isWhooshEffect(
  scaleWeightChange: number,
  trendWeightChange: number
): { isWhoosh: boolean; severity: 'mild' | 'moderate' | 'extreme' | null } {
  const absScaleChange = Math.abs(scaleWeightChange);
  const absTrendChange = Math.abs(trendWeightChange);
  
  // If scale and trend are similar, no whoosh
  const divergence = absScaleChange - absTrendChange;
  
  if (divergence < 0.3) {
    return { isWhoosh: false, severity: null };
  }
  
  // Classify severity
  if (absScaleChange >= EXTREME_CHANGE_THRESHOLD) {
    return { isWhoosh: true, severity: 'extreme' };
  }
  
  if (absScaleChange >= MAX_CREDIBLE_DAILY_CHANGE) {
    return { isWhoosh: true, severity: 'moderate' };
  }
  
  return { isWhoosh: true, severity: 'mild' };
}

/**
 * Adjust raw TDEE calculation to protect against whoosh
 * 
 * When a whoosh is detected, we dampen the weight delta used
 * in the TDEE calculation to prevent over-reaction
 */
export function dampWhooshEffect(
  rawWeightDelta: number,
  trendWeightDelta: number
): number {
  const whooshCheck = isWhooshEffect(rawWeightDelta, trendWeightDelta);
  
  if (!whooshCheck.isWhoosh) {
    // No whoosh, use trend delta (already smoothed by EMA)
    return trendWeightDelta;
  }
  
  // Apply dampening based on severity
  let dampingFactor: number;
  switch (whooshCheck.severity) {
    case 'extreme':
      dampingFactor = 0.3; // Use only 30% of the change
      break;
    case 'moderate':
      dampingFactor = 0.5; // Use 50%
      break;
    case 'mild':
    default:
      dampingFactor = 0.7; // Use 70%
  }
  
  console.log(`[EdgeCaseHandler] Whoosh detected (${whooshCheck.severity}): dampening delta from ${rawWeightDelta.toFixed(3)} to ${(rawWeightDelta * dampingFactor).toFixed(3)}`);
  
  return rawWeightDelta * dampingFactor;
}

// ============================================
// Goal Transition Handling
// ============================================

/**
 * Multiplier for TDEE adjustment during goal transitions
 * Higher values = faster adaptation
 */
const TRANSITION_MULTIPLIER = 0.04; // 4% per 0.25 kg/week rate change

/**
 * Calculate TDEE adjustment for goal transition
 */
export function calculateGoalTransitionAdjustment(
  currentTdee: number,
  oldGoalType: GoalType,
  newGoalType: GoalType,
  oldRate: number,
  newRate: number
): { adjustedTdee: number; adjustment: number; reason: string } {
  // Same goal, no adjustment
  if (oldGoalType === newGoalType && oldRate === newRate) {
    return {
      adjustedTdee: currentTdee,
      adjustment: 0,
      reason: 'No goal change detected',
    };
  }
  
  // Calculate effective rate change
  const effectiveOldRate = oldGoalType === 'lose' ? -oldRate : oldGoalType === 'gain' ? oldRate : 0;
  const effectiveNewRate = newGoalType === 'lose' ? -newRate : newGoalType === 'gain' ? newRate : 0;
  
  const rateChange = effectiveNewRate - effectiveOldRate;
  
  // Calculate adjustment multiplier
  // Moving from deficit to surplus = TDEE increases (TEF, NEAT upregulation)
  // Moving from surplus to deficit = TDEE decreases (metabolic adaptation)
  const adjustmentPercent = rateChange * TRANSITION_MULTIPLIER * 100;
  const adjustment = currentTdee * (adjustmentPercent / 100);
  const adjustedTdee = Math.round(currentTdee + adjustment);
  
  let reason: string;
  if (adjustment > 0) {
    reason = `TDEE increased by ${Math.round(adjustment)} kcal for transition from ${oldGoalType} to ${newGoalType}`;
  } else if (adjustment < 0) {
    reason = `TDEE decreased by ${Math.round(Math.abs(adjustment))} kcal for transition from ${oldGoalType} to ${newGoalType}`;
  } else {
    reason = 'No TDEE adjustment needed';
  }
  
  console.log(`[EdgeCaseHandler] Goal transition: ${reason}`);
  
  return { adjustedTdee, adjustment, reason };
}

/**
 * Detect if a goal transition has occurred
 */
export function detectGoalTransition(
  previousGoals: UserGoals | null,
  currentGoals: UserGoals
): { hasTransitioned: boolean; details: string | null } {
  if (!previousGoals) {
    return { hasTransitioned: false, details: null };
  }
  
  const oldType = previousGoals.goalType ?? 'maintain';
  const newType = currentGoals.goalType ?? 'maintain';
  const oldRate = previousGoals.goalRate ?? 0.5;
  const newRate = currentGoals.goalRate ?? 0.5;
  
  if (oldType !== newType) {
    return {
      hasTransitioned: true,
      details: `Goal changed from ${oldType} to ${newType}`,
    };
  }
  
  if (oldRate !== newRate && oldType !== 'maintain') {
    return {
      hasTransitioned: true,
      details: `Rate changed from ${oldRate} to ${newRate} kg/week`,
    };
  }
  
  return { hasTransitioned: false, details: null };
}

// ============================================
// Data Quality Scoring
// ============================================

/**
 * Calculate a quality score for a set of daily logs
 * Used to determine confidence in TDEE calculation
 */
export function calculateDataQualityScore(
  dailyLogs: DailyLog[],
  estimatedTdee: number
): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;
  
  if (dailyLogs.length === 0) {
    return { score: 0, issues: ['No daily logs provided'] };
  }
  
  // Check for missing days
  const completeDays = dailyLogs.filter(d => d.logStatus === 'complete').length;
  const completeRate = completeDays / dailyLogs.length;
  
  if (completeRate < 0.5) {
    score -= 40;
    issues.push(`Only ${Math.round(completeRate * 100)}% of days logged completely`);
  } else if (completeRate < 0.7) {
    score -= 20;
    issues.push(`${Math.round(completeRate * 100)}% of days logged completely`);
  } else if (completeRate < 0.85) {
    score -= 10;
  }
  
  // Check for partial logging
  const partialDays = dailyLogs.filter(d => {
    if (d.nutritionCalories === null) return false;
    return isPartialLogging(d.nutritionCalories, estimatedTdee).isPartial;
  }).length;
  
  if (partialDays > 0) {
    const partialRate = partialDays / dailyLogs.length;
    if (partialRate > 0.3) {
      score -= 30;
      issues.push(`${partialDays} days appear to have incomplete logging`);
    } else if (partialRate > 0.15) {
      score -= 15;
      issues.push(`${partialDays} days may have incomplete logging`);
    }
  }
  
  // Check for weight data availability
  const daysWithWeight = dailyLogs.filter(d => d.scaleWeightKg !== null).length;
  const weightRate = daysWithWeight / dailyLogs.length;
  
  if (weightRate < 0.3) {
    score -= 30;
    issues.push('Very few weight measurements available');
  } else if (weightRate < 0.5) {
    score -= 15;
    issues.push('Weight measured less than half the days');
  }
  
  // Check for calorie variance (too consistent might indicate estimation)
  const calorieValues = dailyLogs
    .filter(d => d.nutritionCalories !== null)
    .map(d => d.nutritionCalories as number);
  
  if (calorieValues.length >= 3) {
    const avg = calorieValues.reduce((a, b) => a + b, 0) / calorieValues.length;
    const variance = calorieValues.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / calorieValues.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / avg; // Coefficient of variation
    
    // Very low variance is suspicious (< 5%)
    if (cv < 0.05 && calorieValues.length >= 5) {
      score -= 10;
      issues.push('Calorie intake appears unusually consistent - ensure accurate logging');
    }
  }
  
  return { score: Math.max(0, score), issues };
}

// ============================================
// Outlier Detection
// ============================================

/**
 * Detect if a computed TDEE value is an outlier
 */
export function isTdeeOutlier(
  rawTdee: number,
  recentAverage: number,
  stdDev: number
): { isOutlier: boolean; deviation: number } {
  const deviation = Math.abs(rawTdee - recentAverage);
  const zScore = stdDev > 0 ? deviation / stdDev : 0;
  
  // Consider outlier if > 2 standard deviations
  const isOutlier = zScore > 2;
  
  if (isOutlier) {
    console.log(`[EdgeCaseHandler] TDEE outlier detected: ${rawTdee} vs avg ${recentAverage} (z=${zScore.toFixed(2)})`);
  }
  
  return { isOutlier, deviation };
}

/**
 * Calculate statistics for recent TDEE values
 */
export function calculateTdeeStatistics(
  computedStates: ComputedState[]
): { average: number; stdDev: number; min: number; max: number } {
  if (computedStates.length === 0) {
    return { average: 0, stdDev: 0, min: 0, max: 0 };
  }
  
  const values = computedStates.map(s => s.estimatedTdeeKcal);
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  
  return { average, stdDev, min, max };
}

// ============================================
// Validation Utilities
// ============================================

/**
 * Validate weight entry for reasonableness
 */
export function validateWeightEntry(
  weightKg: number,
  previousWeightKg: number | null
): { isValid: boolean; warning: string | null } {
  // Absolute bounds check
  if (weightKg < 30 || weightKg > 300) {
    return { isValid: false, warning: 'Weight outside reasonable range (30-300 kg)' };
  }
  
  // Daily change check
  if (previousWeightKg !== null) {
    const change = Math.abs(weightKg - previousWeightKg);
    if (change > 3) {
      return { 
        isValid: true, // Still valid but warn
        warning: `Large weight change (${change.toFixed(1)} kg) - this may be water fluctuation`,
      };
    }
  }
  
  return { isValid: true, warning: null };
}

/**
 * Validate calorie entry for reasonableness
 */
export function validateCalorieEntry(
  calories: number,
  estimatedTdee: number
): { isValid: boolean; warning: string | null } {
  // Absolute bounds check
  if (calories < 0) {
    return { isValid: false, warning: 'Calories cannot be negative' };
  }
  
  if (calories > 10000) {
    return { isValid: false, warning: 'Calorie value seems unreasonably high' };
  }
  
  // Relative check
  if (calories > estimatedTdee * 2) {
    return {
      isValid: true,
      warning: `${calories} kcal is more than double your estimated TDEE - verify accuracy`,
    };
  }
  
  return { isValid: true, warning: null };
}
