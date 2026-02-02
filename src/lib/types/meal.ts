export type MealCategory = 'meal' | 'snack' | 'drink';

export const MEAL_CATEGORY_INFO: Record<MealCategory, { label: string; emoji: string }> = {
  meal: { label: 'Meal', emoji: '🍽️' },
  snack: { label: 'Snack', emoji: '🍪' },
  drink: { label: 'Drink', emoji: '🥤' },
};

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

/**
 * Sync status for optimistic meals (UI-only, not persisted)
 */
export type MealSyncStatus = 'pending' | 'confirmed' | 'synced';

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
  /** UI-only: sync status for optimistic meals */
  syncStatus?: MealSyncStatus;
}
