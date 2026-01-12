'use server';

import type { NormalizedFood, USDASearchResponse, USDAFood } from '@/lib/types';
import { normalizeUSDA, normalizeGemini } from '@/lib/normalizer';
import { generateCacheKey, createCacheEntry, isExpired } from '@/lib/cache';
import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import type { Schema } from '@/amplify/data/resource';
import { cookies } from 'next/headers';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

/**
 * Generate singular/plural word variants for better matching
 */
function generateWordVariants(words: string[]): Set<string> {
  const variants = new Set<string>();
  words.forEach(word => {
    variants.add(word);
    if (word.endsWith('e')) {
      variants.add(word + 's'); // bake -> bakes
    } else if (!word.endsWith('s')) {
      variants.add(word + 's'); // chicken -> chickens
    }
    if (word.endsWith('s') && word.length > 3) {
      variants.add(word.slice(0, -1)); // bakes -> bake
    }
  });
  return variants;
}

/**
 * Calculate a relevance score for a USDA food result based on the search term
 * Higher score = better match
 */
function calculateRelevanceScore(food: USDAFood, searchTerm: string): number {
  const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const description = food.description.toLowerCase();
  const category = (food.foodCategory || '').toLowerCase();
  const ingredients = (food.ingredients || '').toLowerCase();
  const brandName = (food.brandName || '').toLowerCase();
  const brandOwner = (food.brandOwner || '').toLowerCase();
  
  let score = 0;
  
  // Generate word variants (singular/plural)
  const wordVariants = generateWordVariants(searchWords);
  
  // Check how many search words (or variants) appear in the description
  const descriptionMatches = Array.from(wordVariants).filter(word => description.includes(word)).length;
  score += descriptionMatches * 20;
  
  // Bonus for exact phrase match in description
  if (description.includes(searchTerm.toLowerCase())) {
    score += 50;
  }
  
  // Check if search words appear in food category
  const categoryMatches = Array.from(wordVariants).filter(word => category.includes(word)).length;
  score += categoryMatches * 15;
  
  // Check ingredients for relevance
  const ingredientMatches = Array.from(wordVariants).filter(word => ingredients.includes(word)).length;
  score += ingredientMatches * 10;
  
  // Check brand matches (for branded ingredient searches)
  const brandMatches = Array.from(wordVariants).filter(word => 
    brandName.includes(word) || brandOwner.includes(word)
  ).length;
  score += brandMatches * 15;
  
  // Penalize if the description starts with a completely different food
  const firstWord = description.split(/[,\s]/)[0];
  const hasFirstWordMatch = Array.from(wordVariants).some(w => firstWord.includes(w) || w.includes(firstWord));
  if (searchWords.length > 0 && !hasFirstWordMatch) {
    score -= 30;
  }
  
  // Prefer Foundation and SR Legacy over Branded for ingredient searches
  // (ingredients are usually generic, not branded)
  if (food.dataType === 'Foundation') {
    score += 5;
  } else if (food.dataType === 'SR Legacy') {
    score += 3;
  }
  
  return score;
}

/**
 * Find the best matching food from a list of USDA results
 */
function findBestMatch(foods: USDAFood[], searchTerm: string): USDAFood | null {
  if (!foods || foods.length === 0) return null;
  
  let bestFood = foods[0];
  let bestScore = calculateRelevanceScore(foods[0], searchTerm);
  
  for (let i = 1; i < foods.length; i++) {
    const score = calculateRelevanceScore(foods[i], searchTerm);
    if (score > bestScore) {
      bestScore = score;
      bestFood = foods[i];
    }
  }
  
  // If the best score is too low, the results are probably irrelevant
  if (bestScore < 10) {
    console.log(`Relevance score too low (${bestScore}) for "${searchTerm}", treating as miss`);
    return null;
  }
  
  return bestFood;
}

// Types for Gemini parsing response
interface GeminiParsedIngredient {
  usda_search_term: string;
  display_name: string;
  quantity: number;
  weight_g: number;
  is_branded: boolean; // True for restaurant/branded items (Big Mac, etc.)
}

interface GeminiFallbackFood {
  name: string;
  estimated_weight_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

// Get client with cookies for server-side operations
async function getServerClient() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const outputs = require('@/amplify_outputs.json');
    return generateServerClientUsingCookies<Schema>({
      config: outputs,
      cookies: cookies,
    });
  } catch {
    return null;
  }
}

// Check cache for existing results
async function getCachedResults(query: string): Promise<NormalizedFood[] | null> {
  const client = await getServerClient();
  if (!client) return null;

  const cacheKey = generateCacheKey(query, 'GEMINI'); // Cache by original query

  try {
    const { data } = await client.models.FoodCache.listFoodCacheByCacheKey({
      cacheKey,
    });

    if (data && data.length > 0) {
      const entry = data[0];
      if (entry.expiresAt && !isExpired(entry.expiresAt)) {
        console.log('Returning cached results for:', query);
        return entry.results as NormalizedFood[];
      }
    }
  } catch (error) {
    console.error('Cache lookup error:', error);
  }

  return null;
}

// Save results to cache
async function saveToCache(query: string, results: NormalizedFood[]): Promise<void> {
  const client = await getServerClient();
  if (!client) return;

  const entry = createCacheEntry(query, 'GEMINI', results);

  try {
    await client.models.FoodCache.create({
      cacheKey: entry.cacheKey,
      source: entry.source,
      query: entry.query,
      results: JSON.parse(JSON.stringify(entry.results)),
      expiresAt: entry.expiresAt,
    });
  } catch (error) {
    console.error('Cache save error:', error);
  }
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
      const usdaFood = findBestMatch(data.foods, searchTerm);
      
      if (!usdaFood) {
        console.log(`No relevant USDA match found for ingredient: ${searchTerm}`);
        return null;
      }
      
      // Log full USDA response details
      console.log('\n========== USDA INGREDIENT DETAILS (SELECTED) ==========');
      console.log('Search term:', searchTerm);
      console.log('FDC ID:', usdaFood.fdcId);
      console.log('Description:', usdaFood.description);
      console.log('Data Type:', usdaFood.dataType);
      console.log('Brand Owner:', usdaFood.brandOwner || 'N/A');
      console.log('Brand Name:', usdaFood.brandName || 'N/A');
      console.log('Ingredients:', usdaFood.ingredients || 'N/A');
      console.log('Serving Size:', usdaFood.servingSize, usdaFood.servingSizeUnit || '');
      console.log('Food Category:', usdaFood.foodCategory || 'N/A');
      console.log('\n--- Nutrients (per 100g) ---');
      if (usdaFood.foodNutrients) {
        usdaFood.foodNutrients.forEach((nutrient) => {
          console.log(`  ${nutrient.nutrientName}: ${nutrient.value} ${nutrient.unitName}`);
        });
      }
      console.log('=========================================================\n');
      
      // Return per-100g data for ingredient scaling (scaleToServing=false)
      return normalizeUSDA(usdaFood, false);
    }
    
    return null;
  } catch (error) {
    console.error('USDA search error for:', searchTerm, error);
    return null;
  }
}

// Step 1: Use Gemini to parse meal into USDA-searchable ingredients
async function parseWithGemini(text: string): Promise<GeminiParsedIngredient[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return [];
  }

  try {
    const client = new GoogleGenAI({ apiKey });

    const prompt = `You are a nutrition data parser. Parse this meal description into individual ingredients that can be searched in the USDA FoodData Central database.

INSTRUCTIONS:
1. Break down the meal into individual, simple ingredients
2. For each ingredient, provide:
   - usda_search_term: A simple, USDA-friendly search term (e.g., "egg whole raw fresh" not "eggs")
   - display_name: Human-readable name with quantity (e.g., "2 Large Eggs")
   - quantity: Number of units
   - weight_g: Total estimated weight in grams for the full quantity
   - is_branded: true if this is a restaurant/branded item that won't be in USDA (e.g., "Big Mac", "Starbucks Frappuccino")

USDA SEARCH TERM TIPS:
- Use singular forms: "egg" not "eggs", "bacon" not "bacons"
- Be specific: "chicken breast meat cooked" not just "chicken"
- Common mappings:
  - eggs → "egg whole raw fresh" (50g each)
  - bacon → "pork bacon cooked" (8g per strip)
  - toast/bread → "bread white commercial" (30g per slice)
  - butter → "butter salted" (14g per tbsp)
  - rice → "rice white cooked" (185g per cup)
  - oatmeal → "oats regular cooked" (234g per cup)
  - banana → "banana raw" (118g medium)
  - chicken breast → "chicken breast meat cooked roasted" (170g)

MEAL DESCRIPTION: "${text}"

Return ONLY a valid JSON array:
[
  {"usda_search_term": "egg whole raw fresh", "display_name": "2 Large Eggs", "quantity": 2, "weight_g": 100, "is_branded": false},
  {"usda_search_term": "pork bacon cooked", "display_name": "3 Strips of Bacon", "quantity": 3, "weight_g": 24, "is_branded": false}
]`;

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
      return [];
    }

    console.log('Gemini parsed ingredients:', responseText);
    return JSON.parse(responseText) as GeminiParsedIngredient[];
  } catch (error) {
    console.error('Gemini parsing error:', error);
    return [];
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
 * Parse natural language text to extract food items
 * 
 * HYBRID STRATEGY:
 * 1. Check cache for the full query
 * 2. Use Gemini to parse into USDA-searchable ingredients
 * 3. Query USDA for each ingredient (parallel)
 * 4. For branded items or USDA misses, fallback to Gemini estimates
 * 5. Scale all results to correct portion sizes
 * 6. Cache the final results
 */
export async function parseTextLog(text: string): Promise<NormalizedFood[]> {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const trimmedText = text.trim();

  // Step 1: Check cache
  const cachedResults = await getCachedResults(trimmedText);
  if (cachedResults && cachedResults.length > 0) {
    return cachedResults;
  }

  // Step 2: Parse with Gemini into ingredients
  const parsedIngredients = await parseWithGemini(trimmedText);
  if (parsedIngredients.length === 0) {
    console.log('No ingredients parsed from text');
    return [];
  }

  console.log(`Parsed ${parsedIngredients.length} ingredients, searching USDA...`);

  // Step 3: Query USDA for each non-branded ingredient (parallel)
  const results: NormalizedFood[] = [];

  await Promise.all(
    parsedIngredients.map(async (ingredient) => {
      let food: NormalizedFood | null = null;

      if (ingredient.is_branded) {
        // Branded item - use Gemini directly
        console.log(`Branded item, using Gemini: ${ingredient.display_name}`);
        food = await getGeminiFallback(ingredient);
      } else {
        // Try USDA first
        const usdaResult = await searchUSDAIngredient(ingredient.usda_search_term);
        
        if (usdaResult) {
          // Scale USDA result to actual weight
          food = scaleToWeight(usdaResult, ingredient.weight_g, ingredient.display_name);
          console.log(`USDA found: ${ingredient.usda_search_term} → ${food.calories} kcal`);
        } else {
          // USDA miss - fallback to Gemini
          console.log(`USDA miss, using Gemini fallback: ${ingredient.usda_search_term}`);
          food = await getGeminiFallback(ingredient);
        }
      }

      if (food) {
        results.push(food);
      }
    })
  );

  // Step 4: Cache successful results
  if (results.length > 0) {
    await saveToCache(trimmedText, results);
  }

  console.log(`Returning ${results.length} foods with nutrition data`);
  return results;
}
