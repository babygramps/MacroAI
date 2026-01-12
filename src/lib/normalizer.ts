import type {
  NormalizedFood,
  USDAFood,
  OFFProduct,
  APINinjasFood,
} from './types';

// USDA Nutrient IDs
const USDA_NUTRIENT_IDS = {
  CALORIES: 1008, // Energy (kcal)
  PROTEIN: 1003, // Protein
  CARBS: 1005, // Carbohydrate, by difference
  FAT: 1004, // Total lipid (fat)
};

/**
 * Normalize USDA food response to our standard format
 * USDA returns nutrients in an array with nutrient IDs
 */
export function normalizeUSDA(food: USDAFood): NormalizedFood {
  const getNutrientValue = (nutrientId: number): number => {
    const nutrient = food.foodNutrients.find((n) => n.nutrientId === nutrientId);
    return nutrient?.value ?? 0;
  };

  return {
    name: food.description,
    calories: Math.round(getNutrientValue(USDA_NUTRIENT_IDS.CALORIES)),
    protein: Math.round(getNutrientValue(USDA_NUTRIENT_IDS.PROTEIN) * 10) / 10,
    carbs: Math.round(getNutrientValue(USDA_NUTRIENT_IDS.CARBS) * 10) / 10,
    fat: Math.round(getNutrientValue(USDA_NUTRIENT_IDS.FAT) * 10) / 10,
    servingSize: 100, // USDA always returns per 100g
    source: 'USDA',
    originalId: food.fdcId.toString(),
  };
}

/**
 * Normalize Open Food Facts product to our standard format
 * OFF returns nutriments in an object with various key formats
 */
export function normalizeOFF(product: OFFProduct): NormalizedFood {
  const nutriments = product.nutriments;

  // Try _100g values first, fallback to base values
  const calories =
    nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal'] ?? 0;
  const protein = nutriments.proteins_100g ?? nutriments.proteins ?? 0;
  const carbs =
    nutriments.carbohydrates_100g ?? nutriments.carbohydrates ?? 0;
  const fat = nutriments.fat_100g ?? nutriments.fat ?? 0;

  return {
    name: product.product_name || 'Unknown Product',
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    servingSize: 100, // Normalized to 100g
    source: 'OFF',
    originalId: product.code,
  };
}

/**
 * Normalize API Ninjas nutrition response to our standard format
 * API Ninjas returns calories, protein_g, carbohydrates_total_g, fat_total_g
 */
export function normalizeAPINinjas(food: APINinjasFood): NormalizedFood {
  return {
    name: food.name ? food.name.charAt(0).toUpperCase() + food.name.slice(1) : 'Unknown',
    calories: Math.round(food.calories || 0),
    protein: Math.round((food.protein_g || 0) * 10) / 10,
    carbs: Math.round((food.carbohydrates_total_g || 0) * 10) / 10,
    fat: Math.round((food.fat_total_g || 0) * 10) / 10,
    servingSize: Math.round(food.serving_size_g || 100),
    source: 'API_NINJAS',
  };
}

/**
 * Normalize Gemini parsed food response to our standard format
 * Handles variations in field names that Gemini might return
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeGemini(food: any): NormalizedFood {
  // Handle various field name formats Gemini might return
  const calories = food.calories ?? food.kcal ?? 0;
  const protein = food.protein_g ?? food.protein ?? food.proteins ?? 0;
  const carbs = food.carbs_g ?? food.carbohydrates_g ?? food.carbs ?? food.carbohydrates ?? 0;
  const fat = food.fat_g ?? food.fats_g ?? food.fat ?? food.fats ?? 0;
  const weight = food.estimated_weight_g ?? food.weight_g ?? food.serving_size_g ?? food.weight ?? food.servingSize ?? 100;

  return {
    name: food.name || 'Unknown',
    calories: Math.round(Number(calories) || 0),
    protein: Math.round((Number(protein) || 0) * 10) / 10,
    carbs: Math.round((Number(carbs) || 0) * 10) / 10,
    fat: Math.round((Number(fat) || 0) * 10) / 10,
    servingSize: Math.round(Number(weight) || 100),
    source: 'GEMINI',
  };
}

/**
 * Scale nutrition values based on weight
 */
export function scaleNutrition(
  food: NormalizedFood,
  targetWeight: number
): NormalizedFood {
  const scaleFactor = targetWeight / food.servingSize;

  return {
    ...food,
    calories: Math.round(food.calories * scaleFactor),
    protein: Math.round(food.protein * scaleFactor * 10) / 10,
    carbs: Math.round(food.carbs * scaleFactor * 10) / 10,
    fat: Math.round(food.fat * scaleFactor * 10) / 10,
    servingSize: targetWeight,
  };
}

/**
 * Validate that a normalized food object has reasonable values
 */
export function isValidFood(food: NormalizedFood): boolean {
  return (
    food.name.length > 0 &&
    food.calories >= 0 &&
    food.protein >= 0 &&
    food.carbs >= 0 &&
    food.fat >= 0 &&
    food.servingSize > 0
  );
}
