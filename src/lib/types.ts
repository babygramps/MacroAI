import type { FoodLogEntry } from '@/lib/types/food';
import type { MealEntry } from '@/lib/types/meal';

export * from '@/lib/types/food';
export * from '@/lib/types/usda';
export * from '@/lib/types/off';
export * from '@/lib/types/meal';
export * from '@/lib/types/recipe';

// ============================================
// Shared Action Result Types
// ============================================

/**
 * Standard error structure for server action failures.
 * Used consistently across all AI features for debugging and user feedback.
 */
export interface ActionError {
  code: string;
  message: string;  // User-friendly message for display
  details?: string; // Technical details for logging
}

/**
 * Generic action result wrapper for server actions.
 * Use this pattern for consistent error handling across the app.
 */
export interface ActionResult<T> {
  success: boolean;
  data: T;
  error?: ActionError;
}

// Unit system type
export type UnitSystem = 'metric' | 'imperial';

// User profile for goals
export interface UserGoals {
  calorieGoal: number;
  proteinGoal: number;
  carbsGoal: number;
  fatGoal: number;
  targetWeightKg?: number;
  preferredWeightUnit?: 'kg' | 'lbs'; // legacy, use preferredUnitSystem
  preferredUnitSystem?: UnitSystem;
  // Metabolic modeling additions
  heightCm?: number;
  birthDate?: string;
  sex?: 'male' | 'female';
  initialBodyFatPct?: number;
  expenditureStrategy?: 'static' | 'dynamic';
  startDate?: string;
  athleteStatus?: boolean;
  goalType?: 'lose' | 'gain' | 'maintain';
  goalRate?: number; // kg per week (always stored in kg)
}

// Weight tracking
export interface WeightLogEntry {
  id: string;
  weightKg: number;
  recordedAt: string;
  note?: string;
}

export interface WeightStats {
  entries: WeightLogEntry[];
  currentWeight: number | null;
  changeFromWeekAgo: number | null;
  changeFromMonthAgo: number | null;
}



// Daily summary (updated to support both legacy and new meal structure)
export interface DailySummary {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  meals: MealEntry[];
  // Legacy support - will be empty for new data
  entries: FoodLogEntry[];
}

// Day data for history views
export interface DayData {
  date: string; // ISO date string (YYYY-MM-DD)
  summary: DailySummary;
}

// Weekly statistics for stats page
export interface WeeklyStats {
  days: DayData[];
  averages: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  streak: number;
}

// ============================================
// Metabolic Modeling Types
// ============================================

// Log status for adherence neutrality
export type LogStatus = 'complete' | 'partial' | 'skipped';

// Confidence levels for TDEE calculation
export type ConfidenceLevel = 'learning' | 'low' | 'medium' | 'high';

// Goal types for coaching engine
export type GoalType = 'lose' | 'gain' | 'maintain';

// DailyLog - Aggregated daily data
// Crucial: null = untracked, 0 = fasted
export interface DailyLog {
  id?: string;
  date: string; // YYYY-MM-DD format
  scaleWeightKg: number | null; // null = not weighed
  nutritionCalories: number | null; // null = untracked, 0 = fasted
  nutritionProteinG: number | null;
  nutritionCarbsG: number | null;
  nutritionFatG: number | null;
  stepCount: number | null;
  logStatus: LogStatus;
}

// ComputedState - Cached daily calculations
export interface ComputedState {
  id?: string;
  date: string; // YYYY-MM-DD format
  trendWeightKg: number;
  estimatedTdeeKcal: number;
  rawTdeeKcal: number;
  fluxConfidenceRange: number;
  energyDensityUsed: number; // 7700 or 5500
  weightDeltaKg: number;
}

// WeeklyCheckIn - Weekly coaching snapshot
export interface WeeklyCheckIn {
  id?: string;
  weekStartDate: string;
  weekEndDate: string;
  averageTdee: number;
  suggestedCalories: number;
  adherenceScore: number; // 0-1 (days logged / 7)
  confidenceLevel: ConfidenceLevel;
  trendWeightStart: number;
  trendWeightEnd: number;
  weeklyWeightChange: number; // kg
  notes?: string;
}

// MetabolicInsights - Aggregated view for UI
export interface MetabolicInsights {
  currentTdee: number;
  trendWeight: number;
  scaleWeight: number | null;
  weeklyWeightChange: number;
  confidenceLevel: ConfidenceLevel;
  daysUntilAccurate: number; // 0 when fully calibrated
  daysTracked: number;
  suggestedCalories: number;
  weeklyCheckIn: WeeklyCheckIn | null;
  isInColdStart: boolean;
  coldStartTdee: number | null; // Mifflin-St Jeor estimate during cold start
}

// Weight data point for charts (includes both raw and trend)
export interface WeightDataPoint {
  date: string;
  scaleWeight: number | null;
  trendWeight: number;
}

// Extended weight stats with trend data
export interface WeightStatsWithTrend extends WeightStats {
  trendWeight: number | null;
  trendData: WeightDataPoint[];
}

// Algorithm constants (exported for testing/debugging)
export const METABOLIC_CONSTANTS = {
  // Weight trend EMA
  WEIGHT_EMA_ALPHA: 0.1,

  // TDEE EMA
  TDEE_EMA_ALPHA: 0.05,
  TDEE_EMA_ALPHA_RESPONSIVE: 0.1, // Used when activity changes significantly

  // Energy density (kcal per kg)
  ENERGY_DENSITY_DEFICIT: 7700, // ~3500 kcal/lb - fat loss dominant
  ENERGY_DENSITY_SURPLUS: 5500, // Accounts for anabolic inefficiency

  // Step responsiveness
  STEP_RESPONSIVENESS_THRESHOLD: 0.2, // 20% increase triggers responsive mode

  // Coaching
  MIN_VALID_DAYS: 4, // Minimum days logged for weekly update
  COLD_START_DAYS: 7, // Days before TDEE is calibrated
  MAINTENANCE_TOLERANCE_KG: 1.5, // +/- tolerance for maintenance mode
  MICRO_ADJUSTMENT_KCAL: 150, // Small adjustment for maintenance drift

  // BMR activity multipliers
  ACTIVITY_MULTIPLIERS: {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    veryActive: 1.9,
  } as const,

  // Default activity level for cold start
  DEFAULT_ACTIVITY_MULTIPLIER: 1.55,
} as const;
