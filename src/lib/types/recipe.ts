/**
 * Recipe types for saved user recipes
 */

export interface RecipeIngredientEntry {
  id: string;
  recipeId: string;
  name: string;
  weightG: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
  sortOrder: number;
}

export interface RecipeEntry {
  id: string;
  name: string;
  description?: string | null;
  totalYieldG: number;
  totalServings: number;
  servingDescription?: string | null;
  servingSizeG?: number | null;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  sourceUrl?: string | null;
  createdAt: string;
  ingredients: RecipeIngredientEntry[];
}

/**
 * Parsed recipe data returned from Gemini before saving
 */
export interface ParsedRecipe {
  name: string;
  totalServings: number;
  servingDescription: string;
  totalYieldG: number;
  servingSizeG: number;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  ingredients: ParsedRecipeIngredient[];
}

export interface ParsedRecipeIngredient {
  name: string;
  weightG: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: 'USDA' | 'GEMINI';
  /** Nutrition validation warnings */
  warnings?: string[];
}

/**
 * Scaled portion data when logging from a recipe
 */
export interface ScaledRecipePortion {
  weightG: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  scaleFactor: number;
}

/**
 * Response from getRecipes server action
 */
export interface RecipesResponse {
  recipes: RecipeEntry[];
}
