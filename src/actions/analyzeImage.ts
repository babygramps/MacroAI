'use server';

import type { NormalizedFood, ActionError } from '@/lib/types';
import { scaleToWeightWithName, withValidation } from '@/lib/normalizer';
import { getAuthenticatedServerContext } from '@/lib/serverAuth';
import { actionConsole, type FoodActionErrorCode } from '@/lib/server/actionShared';
import { searchUSDAIngredient } from '@/lib/server/usda';
import { generateStructuredJson, getGeminiClient, getGeminiNutritionFallback } from '@/lib/server/gemini';

// Types for Gemini image parsing response
interface GeminiImageParsedItem {
  usda_search_term: string;
  display_name: string;
  estimated_weight_g: number;
  is_branded: boolean; // True for restaurant/branded items (Big Mac, etc.)
}

const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB guardrail
const MAX_DESCRIPTION_LENGTH = 800;

// Error codes for user-friendly messaging
export type ImageAnalysisErrorCode = FoodActionErrorCode;

// Structured result for better error handling
export interface ImageAnalysisResult {
  success: boolean;
  foods: NormalizedFood[];
  error?: ActionError & { code: ImageAnalysisErrorCode };
}

/**
 * Detects the Gemini "content blocked" failure mode (safety filters, etc.)
 * from a thrown/carried error. Pre-refactor this lived inline in the outer
 * catch block; kept as its own function since it's now needed both there
 * (for genuinely unexpected exceptions) and in the Vision call's
 * `request_error` branch (which no longer throws).
 */
function isSafetyBlocked(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('SAFETY') || message.includes('blocked');
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
  const auth = await getAuthenticatedServerContext();
  if (!auth) {
    return {
      success: false,
      foods: [],
      error: {
        code: 'unknown_error',
        message: 'Please sign in to analyze photos.',
      },
    };
  }

  // Checked eagerly (before image validation/conversion), matching the
  // pre-refactor order, so a missing key short-circuits before any image
  // processing/logging happens. getGeminiClient() -> getGeminiApiKey()
  // already logs 'GEMINI_API_KEY not configured' on a miss.
  if (!getGeminiClient()) {
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
  const safeUserDescription = userDescription?.slice(0, MAX_DESCRIPTION_LENGTH) ?? null;
  const startedAt = Date.now();

  if (!imageFile) {
    actionConsole.error('No image provided');
    return {
      success: false,
      foods: [],
      error: {
        code: 'no_image',
        message: 'No image was received. Please try taking another photo.',
      },
    };
  }

  if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
    return {
      success: false,
      foods: [],
      error: {
        code: 'no_image',
        message: 'Image is too large. Please upload an image under 8MB.',
      },
    };
  }

  // Log incoming image details for debugging
  actionConsole.info('analyzeImage called', {
    fileName: imageFile.name,
    fileType: imageFile.type,
    fileSize: imageFile.size,
    fileSizeMB: Math.round(imageFile.size / 1024 / 1024 * 100) / 100,
    hasDescription: !!userDescription,
    descriptionLength: safeUserDescription?.length ?? 0,
    estimatedBase64Bytes: Math.ceil((imageFile.size * 4) / 3),
  });

  try {
    // Convert file to base64
    const arrayBuffer = await imageFile.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');

    actionConsole.info('Image converted to base64', {
      base64Length: base64Image.length,
      mimeType: imageFile.type || 'image/jpeg',
      durationMs: Date.now() - startedAt,
    });

    // Build context section if user provided a description
    const userContextSection = safeUserDescription
      ? `
USER-PROVIDED CONTEXT:
USER_DESCRIPTION_START
${safeUserDescription}
USER_DESCRIPTION_END
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

    actionConsole.info('Sending request to Gemini Vision...');

    const visionResult = await generateStructuredJson<GeminiImageParsedItem[]>(
      [
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
      { logContext: 'Image analysis error:' }
    );

    if (!visionResult.ok) {
      if (visionResult.reason === 'no_client') {
        // Unreachable in practice (the eager getGeminiClient() check above
        // already returned), kept for exhaustiveness over the discriminated
        // union and as defense in depth.
        return {
          success: false,
          foods: [],
          error: {
            code: 'no_api_key',
            message: 'AI service is not configured. Please contact support.',
          },
        };
      }

      if (visionResult.reason === 'empty_response') {
        actionConsole.warn('Gemini returned empty response');
        return {
          success: false,
          foods: [],
          error: {
            code: 'gemini_empty_response',
            message: 'The AI could not process this image. Please try a clearer photo.',
          },
        };
      }

      if (visionResult.reason === 'parse_error') {
        return {
          success: false,
          foods: [],
          error: {
            code: 'gemini_parse_error',
            message: 'The AI returned an unexpected response. Please try again.',
          },
        };
      }

      // reason === 'request_error': preserve the exact SAFETY/'blocked'
      // mapping the pre-refactor outer catch performed for this same call.
      const requestError: unknown = visionResult.reason === 'request_error' ? visionResult.error : undefined;

      // Restore the rich contextual log the pre-refactor outer catch emitted
      // for Gemini request failures (generateStructuredJson logs the raw
      // error itself, but has no access to the image/timing context).
      const requestErrorMessage = requestError instanceof Error ? requestError.message : String(requestError);
      const requestErrorStack = requestError instanceof Error ? requestError.stack : undefined;
      actionConsole.error('Image analysis error:', {
        message: requestErrorMessage,
        stack: requestErrorStack?.split('\n').slice(0, 5).join('\n'),
        imageType: imageFile.type,
        imageSize: imageFile.size,
        durationMs: Date.now() - startedAt,
      });

      if (isSafetyBlocked(requestError)) {
        return {
          success: false,
          foods: [],
          error: {
            code: 'gemini_api_error',
            message: 'This image could not be analyzed. Please try a different photo.',
          },
        };
      }

      return {
        success: false,
        foods: [],
        error: {
          code: 'unknown_error',
          message: 'Something went wrong analyzing your photo. Please try again.',
        },
      };
    }

    const parsedItems = visionResult.data;

    actionConsole.info(`Gemini identified ${parsedItems.length} food items`, {
      items: parsedItems.map(i => i.display_name),
    });

    if (parsedItems.length === 0) {
      return {
        success: false,
        foods: [],
        error: {
          code: 'gemini_no_food_detected',
          message: 'No food items were detected in this image. Try taking a clearer photo with better lighting, or add a description.',
        },
      };
    }

    // Step 2: Query USDA for each non-branded item (parallel)
    const results: NormalizedFood[] = [];

    await Promise.all(
      parsedItems.map(async (item) => {
        let food: NormalizedFood | null = null;

        if (item.is_branded) {
          // Branded item - use Gemini directly. analyzeImage's fallback
          // prompt is the branded-hint variant (mentionBrandedHint defaults
          // to true).
          actionConsole.log(`Using Gemini fallback for branded item: ${item.display_name}`);
          food = await getGeminiNutritionFallback(item.display_name, item.estimated_weight_g);
        } else {
          // Try USDA first
          actionConsole.log(`Searching USDA for: ${item.usda_search_term}`);
          const usdaResult = await searchUSDAIngredient(item.usda_search_term);

          if (usdaResult) {
            // Scale USDA result to actual weight
            food = scaleToWeightWithName(usdaResult, item.estimated_weight_g, item.display_name);
            actionConsole.log(`USDA match found for ${item.display_name}: ${usdaResult.name}`);
          } else {
            // USDA miss - fallback to Gemini
            actionConsole.log(`USDA miss for ${item.display_name}, using Gemini fallback`);
            food = await getGeminiNutritionFallback(item.display_name, item.estimated_weight_g);
          }
        }

        if (food) {
          results.push(withValidation(food));
        }
      })
    );

    actionConsole.info(`Returning ${results.length} food items with nutrition data`);
    actionConsole.info('analyzeImage completed', {
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

    actionConsole.error('Image analysis error:', {
      message: errorMessage,
      stack: errorStack?.split('\n').slice(0, 5).join('\n'),
      imageType: imageFile.type,
      imageSize: imageFile.size,
      durationMs: Date.now() - startedAt,
    });

    // Check for specific Gemini API errors
    if (isSafetyBlocked(error)) {
      return {
        success: false,
        foods: [],
        error: {
          code: 'gemini_api_error',
          message: 'This image could not be analyzed. Please try a different photo.',
        },
      };
    }

    return {
      success: false,
      foods: [],
      error: {
        code: 'unknown_error',
        message: 'Something went wrong analyzing your photo. Please try again.',
      },
    };
  }
}
