// Normalized food item type used throughout the app
export interface NormalizedFood {
  id?: string;
  name: string;
  calories: number;
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
  servingSize: number; // grams
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

export interface USDAFood {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients: USDAFoodNutrient[];
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

// User profile for goals
export interface UserGoals {
  calorieGoal: number;
  proteinGoal: number;
  carbsGoal: number;
  fatGoal: number;
  targetWeightKg?: number;
  preferredWeightUnit?: 'kg' | 'lbs';
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

// Food log entry
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
}

// Daily summary
export interface DailySummary {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
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
