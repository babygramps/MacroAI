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

export interface GeminiParsedFood {
  name: string;
  estimated_weight_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

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
  servingDescription?: string | null;
  servingSizeGrams?: number | null;
}

// Import IngredientEntry type for RecentFood
import type { IngredientEntry, MealCategory } from './meal';

/**
 * Represents a recently/frequently logged food item.
 * Can be either a full meal or an individual ingredient.
 */
export interface RecentFood {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: number; // typical weight in grams
  source: string;
  logCount: number;
  lastLoggedAt: string;
  type: 'meal' | 'ingredient';
  // For meals, include category and ingredients
  category?: MealCategory;
  ingredients?: IngredientEntry[];
  // For ingredient-based items, include serving info
  servingDescription?: string | null;
  servingSizeGrams?: number | null;
}

/**
 * Response from the getRecentFoods server action.
 */
export interface RecentFoodsResponse {
  recentMeals: RecentFood[];
  recentIngredients: RecentFood[];
}
