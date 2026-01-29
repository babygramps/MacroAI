'use server';

import type { NormalizedFood, USDASearchResponse, ParsedRecipe, ParsedRecipeIngredient, ActionError } from '@/lib/types';
import { normalizeUSDA, normalizeGemini } from '@/lib/normalizer';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { findBestMatch } from '@/lib/search/relevance';
import { logDebug, logError, logInfo, logWarn } from '@/lib/logger';

const console = {
  log: logDebug,
  info: logInfo,
  warn: logWarn,
  error: logError,
} as const;

// Error codes for recipe parsing debugging
export type RecipeParseErrorCode =
  | 'no_api_key'
  | 'gemini_parse_error'
  | 'no_ingredients_found'
  | 'unknown_error';

// Structured result using shared ActionError
export interface RecipeParseResult {
  success: boolean;
  recipe: ParsedRecipe | null;
  error?: ActionError & { code: RecipeParseErrorCode };
}

// Types for Gemini recipe parsing response
interface GeminiParsedRecipe {
  name: string;
  total_yield_description: string;
  estimated_total_weight_g: number;
  servings: number;
  serving_description: string;
  serving_size_g: number;
  ingredients: GeminiParsedIngredient[];
}

interface GeminiParsedIngredient {
  usda_search_term: string;
  display_name: string;
  weight_g: number;
  is_branded: boolean;
}

interface GeminiFallbackFood {
  name: string;
  estimated_weight_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

// Search USDA for a single ingredient (returns best match using relevance scoring)
async function searchUSDAIngredient(searchTerm: string): Promise<NormalizedFood | null> {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    console.error('USDA_API_KEY not configured');
    return null;
  }

  try {
    const response = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}&query=${encodeURIComponent(searchTerm)}&dataType=Foundation,SR%20Legacy,Branded&pageSize=10`,
      { next: { revalidate: 3600 } }
    );

    if (!response.ok) {
      throw new Error(`USDA API error: ${response.status}`);
    }

    const data: USDASearchResponse = await response.json();

    if (data.foods && data.foods.length > 0) {
      const { food: usdaFood } = findBestMatch(data.foods, searchTerm);

      if (!usdaFood) {
        return null;
      }

      // Return per-100g data for ingredient scaling (scaleToServing=false)
      return normalizeUSDA(usdaFood, false);
    }

    return null;
  } catch (error) {
    console.error('USDA search error for:', searchTerm, error);
    return null;
  }
}

// Scale USDA nutrition (per 100g) to actual portion weight
function scaleToWeight(food: NormalizedFood, targetWeight: number, displayName: string): NormalizedFood {
  const scaleFactor = targetWeight / 100;

  return {
    ...food,
    name: displayName,
    calories: Math.round(food.calories * scaleFactor),
    protein: Math.round(food.protein * scaleFactor * 10) / 10,
    carbs: Math.round(food.carbs * scaleFactor * 10) / 10,
    fat: Math.round(food.fat * scaleFactor * 10) / 10,
    servingSize: targetWeight,
  };
}

// Parse recipe with Gemini
async function parseRecipeWithGemini(recipeText: string): Promise<GeminiParsedRecipe | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  try {
    const client = new GoogleGenAI({ apiKey });

    const prompt = `You are a recipe parser. Parse this recipe and extract structured data for nutrition tracking.

CRITICAL RULE: If the text is NOT a recipe (no food ingredients, not about cooking/food), return null. Examples of non-recipes: "how to fix a car", "laptop repair guide", "windshield installation".

INSTRUCTIONS:
1. First verify this is actually a recipe with food ingredients. If not, return null.
2. Extract the recipe name
3. Determine the total yield (e.g., "8 cups", "6 servings", "makes 12")
4. Estimate the total weight in grams of the finished recipe
5. Calculate servings and per-serving size in grams
6. Break down all ingredients with estimated weights in grams

WEIGHT ESTIMATION TIPS:
- 1 cup liquid = ~240g
- 1 cup vegetables (chopped) = ~150g
- 1 lb = 454g
- 1 medium onion = ~110g
- 1 medium potato = ~150g
- 1 medium carrot = ~60g
- 1 clove garlic = ~3g
- 1 tbsp oil = ~14g
- 1 can (14oz) = ~400g

For each ingredient, provide:
- usda_search_term: USDA-friendly search term (e.g., "beef chuck roasted", "potato raw")
- display_name: Human-readable name with original quantity (e.g., "2 lbs Beef Chuck")
- weight_g: Total weight in grams
- is_branded: true only for restaurant/branded items not in USDA

RECIPE TEXT:
${recipeText}

Return ONLY valid JSON (or null if not a recipe):
{
  "name": "Recipe Name",
  "total_yield_description": "8 cups",
  "estimated_total_weight_g": 2400,
  "servings": 8,
  "serving_description": "1 cup",
  "serving_size_g": 300,
  "ingredients": [
    {"usda_search_term": "beef chuck raw", "display_name": "2 lbs Beef Chuck", "weight_g": 908, "is_branded": false}
  ]
}`;

    const response = await client.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text;
    if (!responseText) {
      return null;
    }

    return JSON.parse(responseText) as GeminiParsedRecipe;
  } catch (error) {
    console.error('Gemini recipe parsing error:', error);
    return null;
  }
}

// Fallback: Get full nutrition estimate from Gemini for branded/complex items
async function getGeminiFallback(ingredient: GeminiParsedIngredient): Promise<NormalizedFood | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new GoogleGenAI({ apiKey });

    const prompt = `Provide accurate nutrition data for: "${ingredient.display_name}" (${ingredient.weight_g}g total)

Return ONLY a JSON object with these exact fields:
{"name": "${ingredient.display_name}", "estimated_weight_g": ${ingredient.weight_g}, "calories": 250, "protein_g": 20, "carbs_g": 30, "fat_g": 10}

Use accurate nutrition data for this specific item.`;

    const response = await client.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text;
    if (!responseText) return null;

    const parsed: GeminiFallbackFood = JSON.parse(responseText);
    return normalizeGemini(parsed);
  } catch (error) {
    console.error('Gemini fallback error:', error);
    return null;
  }
}

/**
 * Parse a recipe text and extract nutrition data for all ingredients
 * 
 * HYBRID STRATEGY:
 * 1. Use Gemini to parse recipe into ingredients with weights and yield info
 * 2. Query USDA for each ingredient (parallel)
 * 3. For branded items or USDA misses, fallback to Gemini estimates
 * 4. Calculate total recipe nutrition and per-serving values
 */
export async function parseRecipe(recipeText: string): Promise<RecipeParseResult> {
  console.info('Recipe parse started', { textLength: recipeText?.length, textPreview: recipeText?.substring(0, 100) });

  if (!recipeText || recipeText.trim().length === 0) {
    return { success: true, recipe: null };
  }

  const trimmedText = recipeText.trim();

  try {
    // Step 1: Parse recipe with Gemini
    const parsedRecipe = await parseRecipeWithGemini(trimmedText);
    console.info('Gemini recipe parsing completed', {
      recipeName: parsedRecipe?.name,
      ingredientsCount: parsedRecipe?.ingredients?.length ?? 0,
      servings: parsedRecipe?.servings
    });

    if (!parsedRecipe || parsedRecipe.ingredients.length === 0) {
      return {
        success: false,
        recipe: null,
        error: {
          code: 'gemini_parse_error',
          message: 'Could not parse the recipe. Make sure it includes a list of ingredients.',
          details: 'Gemini returned null or empty ingredients'
        }
      };
    }

    // Step 2: Query USDA for each ingredient (parallel)
    const ingredientResults: ParsedRecipeIngredient[] = [];

    await Promise.all(
      parsedRecipe.ingredients.map(async (ingredient) => {
        let food: NormalizedFood | null = null;

        if (ingredient.is_branded) {
          food = await getGeminiFallback(ingredient);
        } else {
          const usdaResult = await searchUSDAIngredient(ingredient.usda_search_term);

          if (usdaResult) {
            food = scaleToWeight(usdaResult, ingredient.weight_g, ingredient.display_name);
          } else {
            console.warn(`USDA miss for: ${ingredient.usda_search_term}, falling back to Gemini`);
            food = await getGeminiFallback(ingredient);
          }
        }

        if (food) {
          ingredientResults.push({
            name: food.name,
            weightG: food.servingSize,
            calories: food.calories,
            protein: food.protein,
            carbs: food.carbs,
            fat: food.fat,
            source: food.source === 'GEMINI' ? 'GEMINI' : 'USDA',
          });
        }
      })
    );

    if (ingredientResults.length === 0) {
      return {
        success: false,
        recipe: null,
        error: {
          code: 'no_ingredients_found',
          message: 'Could not find nutrition data for the ingredients.',
          details: 'No USDA matches and Gemini fallback failed'
        }
      };
    }

    // Step 3: Calculate totals
    const totals = ingredientResults.reduce(
      (acc, ing) => ({
        calories: acc.calories + ing.calories,
        protein: acc.protein + ing.protein,
        carbs: acc.carbs + ing.carbs,
        fat: acc.fat + ing.fat,
        weight: acc.weight + ing.weightG,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, weight: 0 }
    );

    // Use calculated weight if Gemini's estimate seems off
    const totalYieldG = totals.weight > 0 ? totals.weight : parsedRecipe.estimated_total_weight_g;
    const servingSizeG = Math.round(totalYieldG / parsedRecipe.servings);

    console.info('Recipe parse completed', {
      recipeName: parsedRecipe.name,
      ingredientsResolved: ingredientResults.length,
      totalCalories: totals.calories,
      servings: parsedRecipe.servings
    });

    return {
      success: true,
      recipe: {
        name: parsedRecipe.name,
        totalServings: parsedRecipe.servings,
        servingDescription: parsedRecipe.serving_description,
        totalYieldG,
        servingSizeG,
        totalCalories: totals.calories,
        totalProtein: Math.round(totals.protein * 10) / 10,
        totalCarbs: Math.round(totals.carbs * 10) / 10,
        totalFat: Math.round(totals.fat * 10) / 10,
        ingredients: ingredientResults,
      }
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Recipe parse failed', { error: errorMessage });

    return {
      success: false,
      recipe: null,
      error: {
        code: 'unknown_error',
        message: 'Something went wrong parsing the recipe. Please try again.',
        details: errorMessage
      }
    };
  }
}
