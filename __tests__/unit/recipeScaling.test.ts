import { scaleRecipePortion } from '@/lib/data/dashboard';
import type { RecipeEntry } from '@/lib/types';

describe('scaleRecipePortion', () => {
  const mockRecipe: RecipeEntry = {
    id: 'recipe-1',
    name: 'Test Borscht',
    description: null,
    totalYieldG: 2400,
    totalServings: 8,
    servingDescription: '1 cup',
    servingSizeG: 300,
    totalCalories: 1200,
    totalProtein: 80,
    totalCarbs: 120,
    totalFat: 40,
    sourceUrl: null,
    createdAt: new Date().toISOString(),
    ingredients: [
      {
        id: 'ing-1',
        recipeId: 'recipe-1',
        name: 'Beef Chuck',
        weightG: 900,
        calories: 600,
        protein: 60,
        carbs: 0,
        fat: 30,
        source: 'USDA',
        sortOrder: 0,
      },
      {
        id: 'ing-2',
        recipeId: 'recipe-1',
        name: 'Vegetables',
        weightG: 1500,
        calories: 600,
        protein: 20,
        carbs: 120,
        fat: 10,
        source: 'USDA',
        sortOrder: 1,
      },
    ],
  };

  describe('servings mode', () => {
    it('should scale correctly for 1 serving', () => {
      const result = scaleRecipePortion(mockRecipe, 1, 'servings');

      expect(result.weightG).toBe(300);
      expect(result.calories).toBe(150);
      expect(result.protein).toBe(10);
      expect(result.carbs).toBe(15);
      expect(result.fat).toBe(5);
      expect(result.scaleFactor).toBeCloseTo(0.125, 5);
    });

    it('should scale correctly for 2 servings', () => {
      const result = scaleRecipePortion(mockRecipe, 2, 'servings');

      expect(result.weightG).toBe(600);
      expect(result.calories).toBe(300);
      expect(result.protein).toBe(20);
      expect(result.carbs).toBe(30);
      expect(result.fat).toBe(10);
      expect(result.scaleFactor).toBeCloseTo(0.25, 5);
    });

    it('should scale correctly for 0.5 servings', () => {
      const result = scaleRecipePortion(mockRecipe, 0.5, 'servings');

      expect(result.weightG).toBe(150);
      expect(result.calories).toBe(75);
      expect(result.protein).toBe(5);
      expect(result.carbs).toBe(7.5);
      expect(result.fat).toBe(2.5);
      expect(result.scaleFactor).toBeCloseTo(0.0625, 5);
    });

    it('should scale correctly for full recipe (8 servings)', () => {
      const result = scaleRecipePortion(mockRecipe, 8, 'servings');

      expect(result.weightG).toBe(2400);
      expect(result.calories).toBe(1200);
      expect(result.protein).toBe(80);
      expect(result.carbs).toBe(120);
      expect(result.fat).toBe(40);
      expect(result.scaleFactor).toBe(1);
    });
  });

  describe('grams mode', () => {
    it('should scale correctly for 300g (1 serving equivalent)', () => {
      const result = scaleRecipePortion(mockRecipe, 300, 'grams');

      expect(result.weightG).toBe(300);
      expect(result.calories).toBe(150);
      expect(result.scaleFactor).toBeCloseTo(0.125, 5);
    });

    it('should scale correctly for 100g', () => {
      const result = scaleRecipePortion(mockRecipe, 100, 'grams');

      expect(result.weightG).toBe(100);
      expect(result.calories).toBe(50);
      expect(result.scaleFactor).toBeCloseTo(0.0417, 3);
    });

    it('should scale correctly for 600g', () => {
      const result = scaleRecipePortion(mockRecipe, 600, 'grams');

      expect(result.weightG).toBe(600);
      expect(result.calories).toBe(300);
      expect(result.scaleFactor).toBeCloseTo(0.25, 5);
    });

    it('should handle full recipe weight', () => {
      const result = scaleRecipePortion(mockRecipe, 2400, 'grams');

      expect(result.weightG).toBe(2400);
      expect(result.calories).toBe(1200);
      expect(result.scaleFactor).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle recipe without servingSizeG (calculates from totalYieldG / totalServings)', () => {
      const recipeWithoutServingSize: RecipeEntry = {
        ...mockRecipe,
        servingSizeG: null,
      };

      const result = scaleRecipePortion(recipeWithoutServingSize, 1, 'servings');

      // Should calculate: 2400 / 8 = 300g per serving
      expect(result.weightG).toBe(300);
      expect(result.calories).toBe(150);
    });

    it('should handle very small portions', () => {
      const result = scaleRecipePortion(mockRecipe, 50, 'grams');

      expect(result.weightG).toBe(50);
      expect(result.calories).toBe(25);
      expect(result.scaleFactor).toBeCloseTo(0.0208, 3);
    });

    it('should handle large portions (more than full recipe)', () => {
      const result = scaleRecipePortion(mockRecipe, 4800, 'grams');

      // Double the recipe
      expect(result.weightG).toBe(4800);
      expect(result.calories).toBe(2400);
      expect(result.scaleFactor).toBe(2);
    });

    it('should round macros to 1 decimal place', () => {
      // 1/3 of the recipe to get non-round numbers
      const result = scaleRecipePortion(mockRecipe, 800, 'grams');

      // scaleFactor = 800 / 2400 = 0.333...
      // protein = 80 * 0.333... = 26.666... -> should round to 26.7
      expect(result.protein).toBe(26.7);
      expect(result.carbs).toBe(40);
      expect(result.fat).toBe(13.3);
    });
  });
});
