'use server';

import type { NormalizedFood, USDASearchResponse } from '@/lib/types';
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

// Types for Gemini image parsing response
interface GeminiImageParsedItem {
  usda_search_term: string;
  display_name: string;
  estimated_weight_g: number;
  is_branded: boolean; // True for restaurant/branded items (Big Mac, etc.)
}

// Fallback nutrition data from Gemini (used when USDA lookup fails)
interface GeminiFallbackFood {
  name: string;
  estimated_weight_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

// Error codes for user-friendly messaging
export type ImageAnalysisErrorCode =
  | 'no_api_key'
  | 'no_image'
  | 'gemini_empty_response'
  | 'gemini_no_food_detected'
  | 'gemini_parse_error'
  | 'gemini_api_error'
  | 'unknown_error';

// Structured result for better error handling
export interface ImageAnalysisResult {
  success: boolean;
  foods: NormalizedFood[];
  error?: {
    code: ImageAnalysisErrorCode;
    message: string;
    details?: string; // For debugging - Gemini raw response, etc.
  };
}

// Search USDA for a single ingredient (returns best match using relevance scoring)
async function searchUSDAIngredient(searchTerm: string): Promise<NormalizedFood | null> {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    console.error('USDA_API_KEY not configured');
    return null;
  }

  try {
    // Fetch more results (10) so we can pick the best match
    const response = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}&query=${encodeURIComponent(searchTerm)}&dataType=Foundation,SR%20Legacy,Branded&pageSize=10`,
      { next: { revalidate: 3600 } }
    );

    if (!response.ok) {
      throw new Error(`USDA API error: ${response.status}`);
    }

    const data: USDASearchResponse = await response.json();

    if (data.foods && data.foods.length > 0) {
      // Use relevance scoring to find the best match
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

// Fallback: Get full nutrition estimate from Gemini for branded/complex items
async function getGeminiFallback(item: GeminiImageParsedItem): Promise<NormalizedFood | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new GoogleGenAI({ apiKey });

    const prompt = `Provide accurate nutrition data for: "${item.display_name}" (${item.estimated_weight_g}g total)

Return ONLY a JSON object with these exact fields:
{"name": "${item.display_name}", "estimated_weight_g": ${item.estimated_weight_g}, "calories": 250, "protein_g": 20, "carbs_g": 30, "fat_g": 10}

Use accurate nutrition data for this specific item. If it's a restaurant/branded item, use known published nutrition facts.`;

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

// Scale USDA nutrition (per 100g) to actual portion weight
function scaleToWeight(food: NormalizedFood, targetWeight: number, displayName: string): NormalizedFood {
  const scaleFactor = targetWeight / 100; // USDA data is per 100g

  return {
    ...food,
    name: displayName, // Use the friendly display name
    calories: Math.round(food.calories * scaleFactor),
    protein: Math.round(food.protein * scaleFactor * 10) / 10,
    carbs: Math.round(food.carbs * scaleFactor * 10) / 10,
    fat: Math.round(food.fat * scaleFactor * 10) / 10,
    servingSize: targetWeight,
  };
}

/**
 * Analyze a food image using Gemini 3 Flash Vision + USDA data
 * 
 * HYBRID STRATEGY:
 * 1. Use Gemini Vision to identify food items and estimate weights
 * 2. Query USDA for each item (parallel)
 * 3. Scale USDA nutrition data to estimated portion sizes
 * 4. For branded items or USDA misses, fallback to Gemini estimates
 *
 * Note: Images are NOT cached due to uniqueness
 */
export async function analyzeImage(formData: FormData): Promise<ImageAnalysisResult> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.error('GEMINI_API_KEY not configured');
    return {
      success: false,
      foods: [],
      error: {
        code: 'no_api_key',
        message: 'AI service is not configured. Please contact support.',
      },
    };
  }

  const imageFile = formData.get('image') as File | null;
  const userDescription = formData.get('description') as string | null;
  const startedAt = Date.now();

  if (!imageFile) {
    console.error('No image provided');
    return {
      success: false,
      foods: [],
      error: {
        code: 'no_image',
        message: 'No image was received. Please try taking another photo.',
      },
    };
  }

  // Log incoming image details for debugging
  console.info('analyzeImage called', {
    fileName: imageFile.name,
    fileType: imageFile.type,
    fileSize: imageFile.size,
    fileSizeMB: Math.round(imageFile.size / 1024 / 1024 * 100) / 100,
    hasDescription: !!userDescription,
    descriptionLength: userDescription?.length ?? 0,
    estimatedBase64Bytes: Math.ceil((imageFile.size * 4) / 3),
  });

  try {
    // Convert file to base64
    const arrayBuffer = await imageFile.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');

    console.info('Image converted to base64', {
      base64Length: base64Image.length,
      mimeType: imageFile.type || 'image/jpeg',
      durationMs: Date.now() - startedAt,
    });

    const client = new GoogleGenAI({ apiKey: geminiKey });

    // Build context section if user provided a description
    const userContextSection = userDescription
      ? `
USER-PROVIDED CONTEXT:
The user has described this meal as: "${userDescription}"
Use this information to:
- Identify specific restaurants/brands mentioned (mark as is_branded: true)
- Use any portion sizes mentioned (e.g., "6oz steak", "large fries")
- Account for hidden ingredients the user mentions (sauces, dressings, cooking oil)
- Correct any visual misidentifications based on the description

`
      : '';

    // Step 1: Use Gemini to identify foods and estimate weights (but NOT nutrition)
    const prompt = `You are a nutrition expert analyzing a food photo. Identify each food item visible and provide USDA-searchable terms.
${userContextSection}
INSTRUCTIONS:
1. Identify ALL distinct food items in the image
2. Estimate portion sizes using visual cues:
   - Compare to plate size (standard dinner plate = 10-11 inches)
   - A fist-sized portion ≈ 1 cup
   - Palm-sized meat ≈ 3-4 oz (85-115g)
   - Thumb-sized fat portion ≈ 1 tbsp
3. Determine if each item is branded/restaurant food (mark is_branded: true) or generic (is_branded: false)
4. Include sauces, dressings, and toppings as separate items if visible or mentioned

For each item, provide:
- usda_search_term: A simple, USDA-friendly search term (e.g., "chicken breast meat cooked roasted" not just "chicken")
- display_name: Human-readable name (e.g., "Grilled Chicken Breast")
- estimated_weight_g: Weight in grams based on visual size estimation
- is_branded: true if this is a restaurant/branded item that won't be in USDA (e.g., "Big Mac", "Starbucks Frappuccino")

USDA SEARCH TERM TIPS:
- Use singular forms: "egg" not "eggs", "bacon" not "bacons"
- Be specific: "chicken breast meat cooked roasted" not just "chicken"
- Common mappings:
  - grilled chicken → "chicken breast meat cooked roasted"
  - steamed broccoli → "broccoli cooked boiled"
  - brown rice → "rice brown cooked"
  - mashed potatoes → "potato mashed prepared"
  - steak → "beef steak grilled"
  - salmon → "salmon atlantic cooked"
  - salad greens → "lettuce green leaf raw"

CRITICAL: If the image does NOT contain food (e.g., cars, electronics, landscapes, people without food), return an EMPTY array: []

IMPORTANT: If you cannot identify any food items in the image (e.g., image is blurry, not food, or unclear), return an empty array: []

Return ONLY a valid JSON array. Example:
[
  {"usda_search_term": "chicken breast meat cooked roasted", "display_name": "Grilled Chicken Breast", "estimated_weight_g": 150, "is_branded": false},
  {"usda_search_term": "broccoli cooked boiled", "display_name": "Steamed Broccoli", "estimated_weight_g": 85, "is_branded": false},
  {"usda_search_term": "rice brown cooked", "display_name": "Brown Rice", "estimated_weight_g": 150, "is_branded": false}
]`;

    console.info('Sending request to Gemini Vision...');

    const response = await client.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: imageFile.type || 'image/jpeg',
                data: base64Image,
              },
            },
          ],
        },
      ],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text;

    // Log the raw response for debugging
    console.info('Gemini raw response received', {
      hasResponse: !!responseText,
      responseLength: responseText?.length ?? 0,
      responsePreview: responseText?.substring(0, 500) ?? 'null',
    });

    if (!responseText) {
      console.warn('Gemini returned empty response');
      return {
        success: false,
        foods: [],
        error: {
          code: 'gemini_empty_response',
          message: 'The AI could not process this image. Please try a clearer photo.',
          details: 'Gemini returned null/empty response',
        },
      };
    }

    // Try to parse the JSON response
    let parsedItems: GeminiImageParsedItem[];
    try {
      parsedItems = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse Gemini response as JSON', {
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
        rawResponse: responseText.substring(0, 1000),
      });
      return {
        success: false,
        foods: [],
        error: {
          code: 'gemini_parse_error',
          message: 'The AI returned an unexpected response. Please try again.',
          details: `Parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}. Raw: ${responseText.substring(0, 500)}`,
        },
      };
    }

    console.info(`Gemini identified ${parsedItems.length} food items`, {
      items: parsedItems.map(i => i.display_name),
    });

    if (parsedItems.length === 0) {
      return {
        success: false,
        foods: [],
        error: {
          code: 'gemini_no_food_detected',
          message: 'No food items were detected in this image. Try taking a clearer photo with better lighting, or add a description.',
          details: 'Gemini returned empty array - no food items recognized',
        },
      };
    }

    // Step 2: Query USDA for each non-branded item (parallel)
    const results: NormalizedFood[] = [];

    await Promise.all(
      parsedItems.map(async (item) => {
        let food: NormalizedFood | null = null;

        if (item.is_branded) {
          // Branded item - use Gemini directly
          console.log(`Using Gemini fallback for branded item: ${item.display_name}`);
          food = await getGeminiFallback(item);
        } else {
          // Try USDA first
          console.log(`Searching USDA for: ${item.usda_search_term}`);
          const usdaResult = await searchUSDAIngredient(item.usda_search_term);

          if (usdaResult) {
            // Scale USDA result to actual weight
            food = scaleToWeight(usdaResult, item.estimated_weight_g, item.display_name);
            console.log(`USDA match found for ${item.display_name}: ${usdaResult.name}`);
          } else {
            // USDA miss - fallback to Gemini
            console.log(`USDA miss for ${item.display_name}, using Gemini fallback`);
            food = await getGeminiFallback(item);
          }
        }

        if (food) {
          results.push(food);
        }
      })
    );

    console.info(`Returning ${results.length} food items with nutrition data`);
    console.info('analyzeImage completed', {
      durationMs: Date.now() - startedAt,
      foodsReturned: results.length,
    });
    return {
      success: true,
      foods: results,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error('Image analysis error:', {
      message: errorMessage,
      stack: errorStack?.split('\n').slice(0, 5).join('\n'),
      imageType: imageFile.type,
      imageSize: imageFile.size,
      durationMs: Date.now() - startedAt,
    });

    // Check for specific Gemini API errors
    if (errorMessage.includes('SAFETY') || errorMessage.includes('blocked')) {
      return {
        success: false,
        foods: [],
        error: {
          code: 'gemini_api_error',
          message: 'This image could not be analyzed. Please try a different photo.',
          details: `Safety filter: ${errorMessage}`,
        },
      };
    }

    return {
      success: false,
      foods: [],
      error: {
        code: 'unknown_error',
        message: 'Something went wrong analyzing your photo. Please try again.',
        details: errorMessage,
      },
    };
  }
}
