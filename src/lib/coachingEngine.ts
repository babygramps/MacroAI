/**
 * Coaching Engine
 * 
 * Implements weekly check-in logic for goal-based calorie adjustments.
 * This engine runs periodically (weekly) to:
 * 1. Calculate suggested calorie targets based on TDEE and goals
 * 2. Check adherence (days logged vs expected)
 * 3. Apply dynamic maintenance adjustments
 * 
 * Key principle: Don't adjust daily - that leads to "chasing the dragon"
 */

import {
  METABOLIC_CONSTANTS,
  type WeeklyCheckIn,
  type ComputedState,
  type DailyLog,
  type UserGoals,
  type GoalType,
} from './types';
import { determineConfidenceLevel } from './expenditureEngine';

const {
  MAINTENANCE_TOLERANCE_KG,
  MICRO_ADJUSTMENT_KCAL,
} = METABOLIC_CONSTANTS;

// Kcal adjustment per kg of weekly weight change goal
const KCAL_PER_KG_WEEKLY = 7700 / 7; // ~1100 kcal/day per kg/week

/**
 * Calculate the daily calorie deficit/surplus needed for a goal
 * 
 * @param goalType - 'lose', 'gain', or 'maintain'
 * @param goalRateKgPerWeek - Target kg change per week (e.g., 0.5)
 * @returns Daily kcal adjustment (negative for deficit, positive for surplus)
 */
export function calculateGoalAdjustment(
  goalType: GoalType,
  goalRateKgPerWeek: number = 0.5
): number {
  switch (goalType) {
    case 'lose':
      // Deficit = rate * 1100 kcal/day (for each kg/week)
      return -Math.round(goalRateKgPerWeek * KCAL_PER_KG_WEEKLY);
    case 'gain':
      // Surplus = rate * 1100 kcal/day
      return Math.round(goalRateKgPerWeek * KCAL_PER_KG_WEEKLY);
    case 'maintain':
    default:
      return 0;
  }
}

/**
 * Calculate suggested calorie target based on TDEE and goal
 * 
 * @param currentTdee - Current calculated TDEE
 * @param goalType - User's goal type
 * @param goalRateKgPerWeek - Target rate of change
 * @returns Suggested daily calorie target
 */
export function calculateCalorieTarget(
  currentTdee: number,
  goalType: GoalType,
  goalRateKgPerWeek: number = 0.5
): number {
  const adjustment = calculateGoalAdjustment(goalType, goalRateKgPerWeek);
  const target = currentTdee + adjustment;
  
  // Apply reasonable bounds (min 1200, max 6000)
  return Math.max(1200, Math.min(6000, Math.round(target)));
}

/**
 * Calculate adherence score for a week
 * 
 * @param dailyLogs - Array of daily logs for the week
 * @returns Adherence score (0-1, where 1 = all 7 days logged completely)
 */
export function calculateAdherenceScore(dailyLogs: DailyLog[]): number {
  if (dailyLogs.length === 0) return 0;
  
  const completeDays = dailyLogs.filter(
    log => log.logStatus === 'complete' && log.nutritionCalories !== null
  ).length;
  
  return Math.round((completeDays / 7) * 100) / 100;
}

/**
 * Check if we have enough data for a weekly update
 * 
 * @param dailyLogs - Daily logs for the week
 * @returns Object indicating whether to proceed and any warnings
 */
export function checkWeeklyUpdateEligibility(
  dailyLogs: DailyLog[]
): { canUpdate: boolean; warning: string | null; missingDays: number } {
  const completeDays = dailyLogs.filter(
    log => log.logStatus === 'complete' && log.nutritionCalories !== null
  ).length;
  
  const missingDays = 7 - completeDays;
  
  if (missingDays > 3) {
    return {
      canUpdate: false,
      warning: 'Not enough data for weekly update. Keep previous targets.',
      missingDays,
    };
  }
  
  if (missingDays > 1) {
    return {
      canUpdate: true,
      warning: 'Low confidence update due to missing data.',
      missingDays,
    };
  }
  
  return {
    canUpdate: true,
    warning: null,
    missingDays,
  };
}

// ============================================
// Dynamic Maintenance (Soft Landing)
// ============================================

/**
 * Check if user has drifted from maintenance target and apply micro-adjustments
 * 
 * Creates a "soft landing" that prevents yo-yo dieting by:
 * 1. Defining a tolerance zone (+/- 1.5 kg from target)
 * 2. Applying gentle corrections when drifting outside
 * 
 * @param trendWeight - Current trend weight
 * @param targetWeight - User's target maintenance weight
 * @param currentTdee - Current calculated TDEE
 * @returns Adjusted calorie target (or same if within tolerance)
 */
export function checkMaintenanceDrift(
  trendWeight: number,
  targetWeight: number,
  currentTdee: number
): { adjustedCalories: number; driftStatus: 'within' | 'above' | 'below'; drift: number } {
  const drift = trendWeight - targetWeight;
  
  if (Math.abs(drift) <= MAINTENANCE_TOLERANCE_KG) {
    // Within tolerance zone - maintain at TDEE
    return {
      adjustedCalories: currentTdee,
      driftStatus: 'within',
      drift,
    };
  }
  
  if (drift > 0) {
    // Drifted above target - apply micro-cut
    console.log(`[CoachingEngine] Drift detected: +${drift.toFixed(1)}kg above target, applying micro-cut`);
    return {
      adjustedCalories: currentTdee - MICRO_ADJUSTMENT_KCAL,
      driftStatus: 'above',
      drift,
    };
  } else {
    // Drifted below target - apply micro-bulk
    console.log(`[CoachingEngine] Drift detected: ${drift.toFixed(1)}kg below target, applying micro-bulk`);
    return {
      adjustedCalories: currentTdee + MICRO_ADJUSTMENT_KCAL,
      driftStatus: 'below',
      drift,
    };
  }
}

// ============================================
// Weekly Check-in Builder
// ============================================

/**
 * Build a complete weekly check-in summary
 * 
 * @param weekStartDate - Start of the week (YYYY-MM-DD)
 * @param weekEndDate - End of the week (YYYY-MM-DD)
 * @param dailyLogs - Daily logs for the week
 * @param computedStates - Computed states for the week
 * @param userGoals - User's goals and profile
 * @returns WeeklyCheckIn object or null if insufficient data
 */
export function buildWeeklyCheckIn(
  weekStartDate: string,
  weekEndDate: string,
  dailyLogs: DailyLog[],
  computedStates: ComputedState[],
  userGoals: UserGoals
): WeeklyCheckIn | null {
  // Check eligibility
  const eligibility = checkWeeklyUpdateEligibility(dailyLogs);
  
  // Get TDEE from computed states
  const validStates = computedStates.filter(s => s.estimatedTdeeKcal > 0);
  if (validStates.length === 0) {
    console.log('[CoachingEngine] No valid computed states for weekly check-in');
    return null;
  }
  
  // Calculate average TDEE for the week
  const averageTdee = Math.round(
    validStates.reduce((sum, s) => sum + s.estimatedTdeeKcal, 0) / validStates.length
  );
  
  // Get trend weights for start and end of week
  const sortedStates = [...validStates].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const trendWeightStart = sortedStates[0]?.trendWeightKg ?? 0;
  const trendWeightEnd = sortedStates[sortedStates.length - 1]?.trendWeightKg ?? 0;
  const weeklyWeightChange = Math.round((trendWeightEnd - trendWeightStart) * 100) / 100;
  
  // Calculate suggested calories based on goal
  const goalType = userGoals.goalType ?? 'maintain';
  const goalRate = userGoals.goalRate ?? 0.5;
  let suggestedCalories: number;
  
  if (goalType === 'maintain' && userGoals.targetWeightKg) {
    // Use dynamic maintenance
    const { adjustedCalories } = checkMaintenanceDrift(
      trendWeightEnd,
      userGoals.targetWeightKg,
      averageTdee
    );
    suggestedCalories = adjustedCalories;
  } else {
    suggestedCalories = calculateCalorieTarget(averageTdee, goalType, goalRate);
  }
  
  // Determine confidence level
  const totalDaysTracked = computedStates.length;
  const adherenceScore = calculateAdherenceScore(dailyLogs);
  const confidenceLevel = determineConfidenceLevel(totalDaysTracked, eligibility.missingDays);
  
  // Build notes
  let notes: string | undefined;
  if (!eligibility.canUpdate) {
    notes = eligibility.warning ?? undefined;
  } else if (eligibility.warning) {
    notes = eligibility.warning;
  }
  
  return {
    weekStartDate,
    weekEndDate,
    averageTdee,
    suggestedCalories,
    adherenceScore,
    confidenceLevel,
    trendWeightStart,
    trendWeightEnd,
    weeklyWeightChange,
    notes,
  };
}

// ============================================
// Partial Logging Detection
// ============================================

/**
 * Detect if a day's logging appears incomplete
 * 
 * If calories logged < 50% of expected TDEE and not marked as fasting,
 * the day is likely partial (user forgot to log dinner, etc.)
 * 
 * @param dailyLog - The daily log entry
 * @param estimatedTdee - Expected TDEE for comparison
 * @returns Whether the log appears to be partial
 */
export function detectPartialLogging(
  dailyLog: DailyLog,
  estimatedTdee: number
): boolean {
  if (dailyLog.nutritionCalories === null) {
    return false; // Untracked, not partial
  }
  
  if (dailyLog.nutritionCalories === 0) {
    return false; // Fasted, not partial
  }
  
  // If logged calories < 50% of TDEE, likely partial
  const threshold = estimatedTdee * 0.5;
  
  if (dailyLog.nutritionCalories < threshold) {
    console.log(
      `[CoachingEngine] Partial logging detected: ${dailyLog.nutritionCalories} kcal < ${threshold.toFixed(0)} (50% of TDEE)`
    );
    return true;
  }
  
  return false;
}

/**
 * Determine log status based on data quality
 * 
 * @param dailyLog - The daily log entry
 * @param estimatedTdee - Expected TDEE for comparison
 * @returns Updated log status
 */
export function determineLogStatus(
  dailyLog: DailyLog,
  estimatedTdee: number
): 'complete' | 'partial' | 'skipped' {
  if (dailyLog.nutritionCalories === null) {
    return 'skipped';
  }
  
  if (detectPartialLogging(dailyLog, estimatedTdee)) {
    return 'partial';
  }
  
  return 'complete';
}

// ============================================
// Goal Progress Calculation
// ============================================

/**
 * Calculate progress toward weight goal
 * 
 * @param startWeight - Starting weight when goal was set
 * @param currentTrendWeight - Current trend weight
 * @param targetWeight - Target weight
 * @returns Progress percentage (0-100+)
 */
export function calculateGoalProgress(
  startWeight: number,
  currentTrendWeight: number,
  targetWeight: number
): number {
  const totalChange = targetWeight - startWeight;
  
  if (Math.abs(totalChange) < 0.1) {
    return 100; // Already at goal
  }
  
  const currentChange = currentTrendWeight - startWeight;
  const progress = (currentChange / totalChange) * 100;
  
  return Math.round(Math.max(0, Math.min(150, progress))); // Cap at 150%
}

/**
 * Estimate weeks remaining to reach goal
 * 
 * @param currentTrendWeight - Current trend weight
 * @param targetWeight - Target weight
 * @param weeklyChangeRate - Current rate of weekly change
 * @returns Estimated weeks remaining (null if not applicable)
 */
export function estimateWeeksToGoal(
  currentTrendWeight: number,
  targetWeight: number,
  weeklyChangeRate: number
): number | null {
  const remaining = targetWeight - currentTrendWeight;
  
  if (Math.abs(remaining) < 0.1) {
    return 0; // At goal
  }
  
  if (weeklyChangeRate === 0) {
    return null; // Can't estimate without movement
  }
  
  // Check if moving in the right direction
  const movingTowardGoal = 
    (remaining > 0 && weeklyChangeRate > 0) ||
    (remaining < 0 && weeklyChangeRate < 0);
  
  if (!movingTowardGoal) {
    return null; // Moving away from goal
  }
  
  const weeks = Math.abs(remaining / weeklyChangeRate);
  return Math.round(weeks);
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get the start of the current week (Monday)
 */
export function getWeekStartDate(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return formatDateKey(d);
}

/**
 * Get the end of the current week (Sunday)
 */
export function getWeekEndDate(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() + (day === 0 ? 0 : 7 - day);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return formatDateKey(d);
}

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
 * Debug logging for weekly check-ins
 */
export function logWeeklyCheckIn(checkIn: WeeklyCheckIn): void {
  console.log('[CoachingEngine] Weekly Check-in:');
  console.log(`  Week: ${checkIn.weekStartDate} to ${checkIn.weekEndDate}`);
  console.log(`  Avg TDEE: ${checkIn.averageTdee} kcal`);
  console.log(`  Suggested: ${checkIn.suggestedCalories} kcal`);
  console.log(`  Weight: ${checkIn.trendWeightStart.toFixed(1)} → ${checkIn.trendWeightEnd.toFixed(1)} kg (${checkIn.weeklyWeightChange > 0 ? '+' : ''}${checkIn.weeklyWeightChange.toFixed(2)} kg)`);
  console.log(`  Adherence: ${(checkIn.adherenceScore * 100).toFixed(0)}%`);
  console.log(`  Confidence: ${checkIn.confidenceLevel}`);
  if (checkIn.notes) {
    console.log(`  Notes: ${checkIn.notes}`);
  }
}
