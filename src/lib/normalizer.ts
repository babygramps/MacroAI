import type {
  NormalizedFood,
  USDAFood,
  OFFProduct,
  APINinjasFood,
} from './types';

// USDA Nutrient IDs
const USDA_NUTRIENT_IDS = {
  CALORIES_KCAL: 1008, // Energy (kcal)
  CALORIES_KJ: 1062, // Energy (kJ) - some foods only have this
  PROTEIN: 1003, // Protein
  CARBS: 1005, // Carbohydrate, by difference
  FAT: 1004, // Total lipid (fat)
};

/**
 * Extract the best serving size from USDA food data
 * Priority: foodPortions > servingSize > householdServingFullText > default 100g
 */
function extractUSDAServingInfo(food: USDAFood): { grams: number; description: string } {
  // 1. Check foodPortions (SR Legacy and Foundation foods)
  if (food.foodPortions && food.foodPortions.length > 0) {
    // Find the first portion with a gram weight (usually the primary serving)
    const portion = food.foodPortions[0];
    if (portion.gramWeight && portion.gramWeight > 0) {
      // Build a description from the portion data
      let description = '';
      if (portion.amount && portion.amount !== 1) {
        description = `${portion.amount} `;
      }
      if (portion.modifier) {
        description += portion.modifier;
      } else if (portion.portionDescription) {
        description += portion.portionDescription;
      } else if (portion.measureUnit?.name && portion.measureUnit.name !== 'undetermined') {
        description += portion.measureUnit.name;
      } else {
        description = `${Math.round(portion.gramWeight)}g`;
      }
      
      return {
        grams: portion.gramWeight,
        description: description.trim() || `${Math.round(portion.gramWeight)}g`,
      };
    }
  }
  
  // 2. Check servingSize (Branded foods from search results)
  if (food.servingSize && food.servingSize > 0) {
    const unit = food.servingSizeUnit || 'g';
    // If it's already in grams, use directly
    if (unit.toLowerCase() === 'g' || unit.toLowerCase() === 'gram' || unit.toLowerCase() === 'grams') {
      return {
        grams: food.servingSize,
        description: food.householdServingFullText || `${Math.round(food.servingSize)}g`,
      };
    }
    // For ml, approximate as grams (close enough for most foods)
    if (unit.toLowerCase() === 'ml' || unit.toLowerCase() === 'milliliter') {
      return {
        grams: food.servingSize,
        description: food.householdServingFullText || `${Math.round(food.servingSize)}ml`,
      };
    }
  }
  
  // 3. Check householdServingFullText (Branded foods)
  if (food.householdServingFullText) {
    // Try to parse grams from text like "1 cup (240g)" or "2 cookies (30g)"
    const gramsMatch = food.householdServingFullText.match(/(\d+(?:\.\d+)?)\s*g(?:rams?)?/i);
    if (gramsMatch) {
      return {
        grams: parseFloat(gramsMatch[1]),
        description: food.householdServingFullText,
      };
    }
  }
  
  // 4. Default to 100g (USDA standard reference)
  return {
    grams: 100,
    description: '100g',
  };
}

/**
 * Normalize USDA food response to our standard format
 * USDA returns nutrients per 100g, we scale to serving size
 * 
 * @param food - The USDA food data
 * @param scaleToServing - If true (default), scale nutrients to serving size. If false, keep per 100g.
 */
export function normalizeUSDA(food: USDAFood, scaleToServing: boolean = true): NormalizedFood {
  const getNutrientValue = (nutrientId: number): number => {
    const nutrient = food.foodNutrients.find((n) => n.nutrientId === nutrientId);
    return nutrient?.value ?? 0;
  };

  // Get serving info
  const servingInfo = extractUSDAServingInfo(food);
  
  // Get per-100g values for macros
  const proteinPer100g = getNutrientValue(USDA_NUTRIENT_IDS.PROTEIN);
  const carbsPer100g = getNutrientValue(USDA_NUTRIENT_IDS.CARBS);
  const fatPer100g = getNutrientValue(USDA_NUTRIENT_IDS.FAT);
  
  // Get calories - try kcal first, then kJ (convert), then calculate from macros
  let caloriesPer100g = getNutrientValue(USDA_NUTRIENT_IDS.CALORIES_KCAL);
  
  if (caloriesPer100g === 0) {
    // Try kJ and convert to kcal (1 kcal = 4.184 kJ)
    const caloriesKJ = getNutrientValue(USDA_NUTRIENT_IDS.CALORIES_KJ);
    if (caloriesKJ > 0) {
      caloriesPer100g = Math.round(caloriesKJ / 4.184);
    }
  }
  
  if (caloriesPer100g === 0 && (proteinPer100g > 0 || carbsPer100g > 0 || fatPer100g > 0)) {
    // Calculate from macros as last resort: protein*4 + carbs*4 + fat*9
    caloriesPer100g = Math.round((proteinPer100g * 4) + (carbsPer100g * 4) + (fatPer100g * 9));
  }

  if (scaleToServing) {
    // Scale to actual serving size
    const scaleFactor = servingInfo.grams / 100;
    
    return {
      name: food.description,
      calories: Math.round(caloriesPer100g * scaleFactor),
      protein: Math.round(proteinPer100g * scaleFactor * 10) / 10,
      carbs: Math.round(carbsPer100g * scaleFactor * 10) / 10,
      fat: Math.round(fatPer100g * scaleFactor * 10) / 10,
      servingSize: servingInfo.grams,
      servingDescription: servingInfo.description,
      servingSizeGrams: servingInfo.grams,
      source: 'USDA',
      originalId: food.fdcId.toString(),
    };
  } else {
    // Keep per 100g (for ingredient scaling)
    return {
      name: food.description,
      calories: Math.round(caloriesPer100g),
      protein: Math.round(proteinPer100g * 10) / 10,
      carbs: Math.round(carbsPer100g * 10) / 10,
      fat: Math.round(fatPer100g * 10) / 10,
      servingSize: 100,
      servingDescription: '100g',
      servingSizeGrams: 100,
      source: 'USDA',
      originalId: food.fdcId.toString(),
    };
  }
}

/**
 * Parse serving size from OFF format (e.g., "30g", "1 cup (240ml)", "2 cookies (30g)")
 */
function parseOFFServingSize(servingSize?: string): { description: string; grams: number } | null {
  if (!servingSize) return null;
  
  // Try to extract grams from the string (e.g., "30g", "2 cookies (30g)")
  const gramsMatch = servingSize.match(/(\d+(?:\.\d+)?)\s*g(?:rams?)?/i);
  if (gramsMatch) {
    return {
      description: servingSize.replace(/\s*\(\d+(?:\.\d+)?\s*g(?:rams?)?\)/i, '').trim() || servingSize,
      grams: parseFloat(gramsMatch[1]),
    };
  }
  
  // Return the description without grams if we can't parse it
  return null;
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

  // Parse serving size from OFF
  const parsedServing = parseOFFServingSize(product.serving_size);

  return {
    name: product.product_name || 'Unknown Product',
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    servingSize: 100, // Normalized to 100g
    servingDescription: parsedServing?.description || product.serving_size || '100g',
    servingSizeGrams: parsedServing?.grams || 100,
    source: 'OFF',
    originalId: product.code,
  };
}

/**
 * Normalize API Ninjas nutrition response to our standard format
 * API Ninjas returns calories, protein_g, carbohydrates_total_g, fat_total_g
 */
export function normalizeAPINinjas(food: APINinjasFood): NormalizedFood {
  const servingGrams = Math.round(food.serving_size_g || 100);
  return {
    name: food.name ? food.name.charAt(0).toUpperCase() + food.name.slice(1) : 'Unknown',
    calories: Math.round(food.calories || 0),
    protein: Math.round((food.protein_g || 0) * 10) / 10,
    carbs: Math.round((food.carbohydrates_total_g || 0) * 10) / 10,
    fat: Math.round((food.fat_total_g || 0) * 10) / 10,
    servingSize: servingGrams,
    servingDescription: `${servingGrams}g`,
    servingSizeGrams: servingGrams,
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
  const servingDescription = food.serving_description ?? food.servingDescription ?? food.portion ?? null;

  const weightNum = Math.round(Number(weight) || 100);

  return {
    name: food.name || 'Unknown',
    calories: Math.round(Number(calories) || 0),
    protein: Math.round((Number(protein) || 0) * 10) / 10,
    carbs: Math.round((Number(carbs) || 0) * 10) / 10,
    fat: Math.round((Number(fat) || 0) * 10) / 10,
    servingSize: weightNum,
    servingDescription: servingDescription || `${weightNum}g`,
    servingSizeGrams: weightNum,
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
