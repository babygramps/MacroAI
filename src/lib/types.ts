// Normalized food item type used throughout the app
export interface NormalizedFood {
  id?: string;
  name: string;
  calories: number;
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
  servingSize: number; // grams (base for scaling)
  servingDescription?: string; // e.g., "1 cup", "1 slice", "1 medium"
  servingSizeGrams?: number; // grams per serving (for serving-based input)
  source: 'USDA' | 'OFF' | 'API_NINJAS' | 'GEMINI';
  originalId?: string; // Original ID from the source API
}

// USDA API response types
export interface USDAFoodNutrient {
  nutrientId: number;
  nutrientName: string;
  nutrientNumber: string;
  unitName: string;
  value: number;
}

// Food portion from USDA (available in full food details)
export interface USDAFoodPortion {
  id: number;
  gramWeight: number;
  amount: number;
  modifier?: string; // e.g., "item 7.6 oz", "1 cup", "1 slice"
  measureUnit?: {
    id: number;
    name: string;
    abbreviation: string;
  };
  portionDescription?: string;
  sequenceNumber?: number;
}

export interface USDAFood {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients: USDAFoodNutrient[];
  // Extended fields for better matching
  brandOwner?: string;
  brandName?: string;
  ingredients?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodCategory?: string;
  score?: number; // USDA relevance score
  // Portion data (from full food details endpoint)
  foodPortions?: USDAFoodPortion[];
  householdServingFullText?: string; // e.g., "1 item" for Branded foods
}

export interface USDASearchResponse {
  foods: USDAFood[];
  totalHits: number;
}

// Open Food Facts API response types
export interface OFFNutriments {
  'energy-kcal_100g'?: number;
  'energy-kcal'?: number;
  proteins_100g?: number;
  proteins?: number;
  carbohydrates_100g?: number;
  carbohydrates?: number;
  fat_100g?: number;
  fat?: number;
}

export interface OFFProduct {
  code: string;
  product_name: string;
  nutriments: OFFNutriments;
  serving_size?: string;
}

export interface OFFResponse {
  status: number;
  product: OFFProduct;
}

// API Ninjas Nutrition response types
export interface APINinjasFood {
  name: string;
  calories: number;
  serving_size_g: number;
  fat_total_g: number;
  fat_saturated_g: number;
  protein_g: number;
  sodium_mg: number;
  potassium_mg: number;
  cholesterol_mg: number;
  carbohydrates_total_g: number;
  fiber_g: number;
  sugar_g: number;
}

// Gemini parsed response type
export interface GeminiParsedFood {
  name: string;
  estimated_weight_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
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

// Food log entry (legacy - kept for backward compatibility)
export interface FoodLogEntry {
  id: string;
  name: string;
  weightG: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
  eatenAt: string;
  // Serving info for editing
  servingDescription?: string | null;
  servingSizeGrams?: number | null;
}

// ============================================
// Meal Hierarchy Types
// ============================================

// Category for logged items
export type MealCategory = 'meal' | 'snack' | 'drink';

// Display info for meal categories
export const MEAL_CATEGORY_INFO: Record<MealCategory, { label: string; emoji: string }> = {
  meal: { label: 'Meal', emoji: '🍽️' },
  snack: { label: 'Snack', emoji: '🍪' },
  drink: { label: 'Drink', emoji: '🥤' },
};

// Single ingredient within a meal
export interface IngredientEntry {
  id: string;
  mealId: string;
  name: string;
  weightG: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
  servingDescription?: string | null;
  servingSizeGrams?: number | null;
  sortOrder: number;
}

// Meal entry with ingredients
export interface MealEntry {
  id: string;
  name: string;
  category: MealCategory;
  eatenAt: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalWeightG: number;
  ingredients: IngredientEntry[];
}

// Helper to calculate meal totals from ingredients
export function calculateMealTotals(ingredients: Omit<IngredientEntry, 'id' | 'mealId' | 'sortOrder'>[]): {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalWeightG: number;
} {
  return ingredients.reduce(
    (acc, ing) => ({
      totalCalories: acc.totalCalories + ing.calories,
      totalProtein: acc.totalProtein + ing.protein,
      totalCarbs: acc.totalCarbs + ing.carbs,
      totalFat: acc.totalFat + ing.fat,
      totalWeightG: acc.totalWeightG + ing.weightG,
    }),
    { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0, totalWeightG: 0 }
  );
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
