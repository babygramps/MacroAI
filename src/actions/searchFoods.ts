'use server';

import type { NormalizedFood, USDASearchResponse, OFFResponse, USDAFood, USDAFoodPortion } from '@/lib/types';
import { normalizeUSDA, normalizeOFF } from '@/lib/normalizer';
import { generateCacheKey, createCacheEntry, isExpired, type CacheSource } from '@/lib/cache';
import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import type { Schema } from '@/amplify/data/resource';
import { cookies } from 'next/headers';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

// Check if a string looks like a barcode (8-14 digits)
function isBarcode(query: string): boolean {
  const cleaned = query.replace(/\s/g, '');
  return /^\d{8,14}$/.test(cleaned);
}

// Full food details response from USDA /v1/food/{fdcId} endpoint
interface USDAFoodDetails {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients: Array<{
    nutrient: {
      id: number;
      number: string;
      name: string;
      unitName: string;
    };
    amount: number;
  }>;
  foodPortions?: USDAFoodPortion[];
  brandOwner?: string;
  brandName?: string;
  ingredients?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodCategory?: {
    id: number;
    code: string;
    description: string;
  };
}

/**
 * Fetch full food details from USDA including portion information
 * The search endpoint doesn't return foodPortions, so we need this for accurate serving sizes
 */
async function fetchFoodDetails(fdcId: number): Promise<USDAFood | null> {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    console.error('USDA_API_KEY not configured');
    return null;
  }

  try {
    const response = await fetch(
      `https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${apiKey}`,
      { next: { revalidate: 3600 } }
    );

    if (!response.ok) {
      console.error(`Failed to fetch food details for ${fdcId}: ${response.status}`);
      return null;
    }

    const data: USDAFoodDetails = await response.json();
    
    // Convert the full details format to our USDAFood format
    // The full details endpoint has a different nutrient structure
    const foodNutrients = data.foodNutrients.map(fn => ({
      nutrientId: fn.nutrient.id,
      nutrientName: fn.nutrient.name,
      nutrientNumber: fn.nutrient.number,
      unitName: fn.nutrient.unitName,
      value: fn.amount,
    }));

    return {
      fdcId: data.fdcId,
      description: data.description,
      dataType: data.dataType,
      foodNutrients,
      brandOwner: data.brandOwner,
      brandName: data.brandName,
      ingredients: data.ingredients,
      servingSize: data.servingSize,
      servingSizeUnit: data.servingSizeUnit,
      foodCategory: data.foodCategory?.description,
      foodPortions: data.foodPortions,
      householdServingFullText: data.householdServingFullText,
    };
  } catch (error) {
    console.error(`Error fetching food details for ${fdcId}:`, error);
    return null;
  }
}

/**
 * Enrich a USDAFood from search results with portion data from full details
 * Only fetches details if the food doesn't already have serving info
 */
async function enrichWithPortionData(food: USDAFood): Promise<USDAFood> {
  // If it's a Branded food with servingSize, we might already have enough info
  // But for SR Legacy and Foundation foods, we need to fetch foodPortions
  const hasServingInfo = (food.servingSize && food.servingSize > 0) || 
                         (food.foodPortions && food.foodPortions.length > 0);
  
  if (hasServingInfo) {
    console.log(`  ${food.description.substring(0, 40)}... already has serving info`);
    return food;
  }
  
  console.log(`  Fetching portion data for: ${food.description.substring(0, 40)}...`);
  const fullDetails = await fetchFoodDetails(food.fdcId);
  
  if (fullDetails) {
    return {
      ...food,
      foodPortions: fullDetails.foodPortions,
      householdServingFullText: fullDetails.householdServingFullText,
      // Also update nutrients if the full details have them
      foodNutrients: fullDetails.foodNutrients.length > 0 ? fullDetails.foodNutrients : food.foodNutrients,
    };
  }
  
  return food;
}

/**
 * Generate singular/plural word variants for better matching
 */
function generateWordVariants(words: string[]): Set<string> {
  const variants = new Set<string>();
  words.forEach(word => {
    variants.add(word);
    // Add plural variants
    if (word.endsWith('e')) {
      variants.add(word + 's'); // bake -> bakes
    } else if (!word.endsWith('s')) {
      variants.add(word + 's'); // chicken -> chickens
    }
    // Add singular variants
    if (word.endsWith('s') && word.length > 3) {
      variants.add(word.slice(0, -1)); // bakes -> bake
    }
  });
  return variants;
}

/**
 * Extract potential brand names from a query
 * Returns words that might be brand identifiers (capitalized words, known patterns)
 */
function extractBrandTerms(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  // Common brand indicators - these words suggest a branded search
  // We'll check if any query word appears in brand name/owner
  return words;
}

/**
 * Calculate a relevance score for a USDA food result based on the search term
 * Higher score = better match
 */
function calculateRelevanceScore(food: USDAFood, searchTerm: string, originalQuery?: string): number {
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
  score += descriptionMatches * 20; // 20 points per matching word in description
  
  // Bonus for exact phrase match in description
  if (description.includes(searchTerm.toLowerCase())) {
    score += 50;
  }
  
  // Check if search words appear in food category (strong signal)
  const categoryMatches = Array.from(wordVariants).filter(word => category.includes(word)).length;
  score += categoryMatches * 15;
  
  // Check ingredients for relevance
  const ingredientMatches = Array.from(wordVariants).filter(word => ingredients.includes(word)).length;
  score += ingredientMatches * 10;
  
  // Brand matching: Check if any word from the original query matches brand name/owner
  // This is general-purpose - works for any brand (Costco, Starbucks, McDonald's, etc.)
  if (originalQuery) {
    const queryBrandTerms = extractBrandTerms(originalQuery);
    const brandText = `${brandName} ${brandOwner}`;
    
    // Count how many query words match in the brand
    const brandMatches = queryBrandTerms.filter(term => brandText.includes(term)).length;
    if (brandMatches > 0) {
      score += brandMatches * 25; // Strong bonus for brand match
      console.log(`    Brand match: ${brandMatches} term(s) found in "${brandOwner || brandName}"`);
    }
  }
  
  // Also check brand matches from the search term itself
  const searchBrandMatches = Array.from(wordVariants).filter(word => 
    brandName.includes(word) || brandOwner.includes(word)
  ).length;
  score += searchBrandMatches * 15;
  
  // Penalize if the description starts with a completely different food
  // e.g., searching "chicken bake" but getting "STRAWBERRY SPREAD"
  const firstWord = description.split(/[,\s]/)[0];
  const hasFirstWordMatch = Array.from(wordVariants).some(w => firstWord.includes(w) || w.includes(firstWord));
  if (searchWords.length > 0 && !hasFirstWordMatch) {
    score -= 30; // Penalty for misleading first word
  }
  
  // Prefer Foundation and SR Legacy for generic searches (no brand in query)
  // But don't penalize Branded when user is searching for a brand
  const hasBrandInQuery = originalQuery && extractBrandTerms(originalQuery).some(term => 
    `${brandName} ${brandOwner}`.includes(term)
  );
  
  if (!hasBrandInQuery) {
    if (food.dataType === 'Foundation') {
      score += 5;
    } else if (food.dataType === 'SR Legacy') {
      score += 3;
    }
  }
  
  console.log(`  Relevance score for "${food.description.substring(0, 50)}..." (${food.brandOwner || 'N/A'}): ${score}`);
  return score;
}

/**
 * Find the best matching food from a list of USDA results
 */
function findBestMatch(foods: USDAFood[], searchTerm: string, originalQuery?: string): USDAFood | null {
  if (!foods || foods.length === 0) return null;
  
  console.log(`\nScoring ${foods.length} USDA results for "${searchTerm}"${originalQuery ? ` (original: "${originalQuery}")` : ''}:`);
  
  let bestFood = foods[0];
  let bestScore = calculateRelevanceScore(foods[0], searchTerm, originalQuery);
  
  for (let i = 1; i < foods.length; i++) {
    const score = calculateRelevanceScore(foods[i], searchTerm, originalQuery);
    if (score > bestScore) {
      bestScore = score;
      bestFood = foods[i];
    }
  }
  
  console.log(`Best match: "${bestFood.description}" (${bestFood.brandOwner || 'N/A'}) with score ${bestScore}`);
  
  // If the best score is too low, the results are probably irrelevant
  if (bestScore < 10) {
    console.log(`Score too low (${bestScore}), considering this a miss`);
    return null;
  }
  
  return bestFood;
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
async function getCachedResults(
  query: string,
  source: CacheSource
): Promise<NormalizedFood[] | null> {
  const client = await getServerClient();
  if (!client) return null;

  const cacheKey = generateCacheKey(query, source);

  try {
    const { data } = await client.models.FoodCache.listFoodCacheByCacheKey({
      cacheKey,
    });

    if (data && data.length > 0) {
      const entry = data[0];
      if (entry.expiresAt && !isExpired(entry.expiresAt)) {
        console.log('Returning cached search results for:', query);
        return entry.results as NormalizedFood[];
      }
    }
  } catch (error) {
    console.error('Cache lookup error:', error);
  }

  return null;
}

// Save results to cache
async function saveToCache(
  query: string,
  source: CacheSource,
  results: NormalizedFood[]
): Promise<void> {
  const client = await getServerClient();
  if (!client) return;

  const entry = createCacheEntry(query, source, results);

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

// Use Gemini to generate optimal USDA search terms
interface GeminiSearchSuggestion {
  usda_search_term: string;
  display_name: string;
  description: string;
}

// Gemini's analysis of the user query
interface GeminiQueryAnalysis {
  has_brand: boolean;
  brand_name: string | null; // The brand to search for (e.g., "Kirkland", "Starbucks")
  brand_owner: string | null; // The parent company (e.g., "Costco" for Kirkland)
  product_keywords: string[]; // Keywords to filter brand results (e.g., ["chicken", "bake"])
  fallback_searches: GeminiSearchSuggestion[]; // Generic search terms if brand search fails
}

async function analyzeQueryWithGemini(userQuery: string): Promise<GeminiQueryAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('GEMINI_API_KEY not configured, using direct search');
    return {
      has_brand: false,
      brand_name: null,
      brand_owner: null,
      product_keywords: userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2),
      fallback_searches: [{ usda_search_term: userQuery, display_name: userQuery, description: '' }],
    };
  }

  try {
    const client = new GoogleGenAI({ apiKey });

    const prompt = `You are a USDA food database expert. Analyze this food search query: "${userQuery}"

TASK: Determine if this query contains a brand name, and extract the key information.

INSTRUCTIONS:
1. Identify if there's a brand, store, or restaurant name in the query
2. If there's a brand, provide:
   - brand_name: The brand/store name as it might appear in USDA (e.g., "KIRKLAND SIGNATURE", "STARBUCKS")
   - brand_owner: The parent company that owns the brand (e.g., "Costco" owns "Kirkland Signature")
   - product_keywords: Words that describe the specific product (excluding the brand name)
3. Always provide fallback_searches: 3-5 generic search terms in case the brand search fails

BRAND MAPPINGS (use these exact names for USDA):
- Costco / Kirkland → brand_name: "KIRKLAND SIGNATURE", brand_owner: "Costco"
- Trader Joe's / TJ's → brand_name: "TRADER JOE'S", brand_owner: "Trader Joe's"
- Starbucks → brand_name: "STARBUCKS", brand_owner: "Starbucks"
- McDonald's / McD's → brand_name: "MCDONALD'S", brand_owner: "McDonald's"
- Wendy's → brand_name: "WENDY'S", brand_owner: "Wendy's"
- Burger King / BK → brand_name: "BURGER KING", brand_owner: "Burger King"
- Chick-fil-A → brand_name: "CHICK-FIL-A", brand_owner: "Chick-fil-A"
- Chipotle → brand_name: "CHIPOTLE", brand_owner: "Chipotle"

EXAMPLES:
- "costco chicken bake" → has_brand: true, brand_name: "KIRKLAND SIGNATURE", brand_owner: "Costco", product_keywords: ["chicken", "bake", "bakes"]
- "starbucks caramel frappuccino" → has_brand: true, brand_name: "STARBUCKS", brand_owner: "Starbucks", product_keywords: ["caramel", "frappuccino"]
- "grilled chicken breast" → has_brand: false, brand_name: null, brand_owner: null, product_keywords: ["grilled", "chicken", "breast"]
- "trader joes orange chicken" → has_brand: true, brand_name: "TRADER JOE'S", brand_owner: "Trader Joe's", product_keywords: ["orange", "chicken"]

Return ONLY a valid JSON object:
{
  "has_brand": true,
  "brand_name": "KIRKLAND SIGNATURE",
  "brand_owner": "Costco",
  "product_keywords": ["chicken", "bake", "bakes"],
  "fallback_searches": [
    {"usda_search_term": "chicken bakes", "display_name": "Chicken Bake", "description": "Chicken filled bread"},
    {"usda_search_term": "chicken caesar bread", "display_name": "Chicken Caesar Bread", "description": "Chicken with caesar in bread"}
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
      return {
        has_brand: false,
        brand_name: null,
        brand_owner: null,
        product_keywords: userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2),
        fallback_searches: [{ usda_search_term: userQuery, display_name: userQuery, description: '' }],
      };
    }

    console.log('Gemini query analysis:', responseText);
    return JSON.parse(responseText) as GeminiQueryAnalysis;
  } catch (error) {
    console.error('Gemini query analysis error:', error);
    return {
      has_brand: false,
      brand_name: null,
      brand_owner: null,
      product_keywords: userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2),
      fallback_searches: [{ usda_search_term: userQuery, display_name: userQuery, description: '' }],
    };
  }
}

/**
 * Search USDA for brand products across ALL data types (Branded, SR Legacy, Foundation)
 * Some brand items like McDonald's Big Mac are in SR Legacy, not Branded!
 */
async function searchBrandedProducts(
  brandName: string,
  brandOwner: string | null,
  productKeywords: string[],
  originalQuery: string
): Promise<NormalizedFood[]> {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    console.error('USDA_API_KEY not configured');
    return [];
  }

  try {
    console.log(`\n========== BRAND SEARCH (ALL DATA TYPES) ==========`);
    console.log(`Brand: "${brandName}" (Owner: ${brandOwner || 'N/A'})`);
    console.log(`Product keywords: ${productKeywords.join(', ')}`);
    
    // Generate keyword variants (singular/plural)
    const keywordVariants = generateWordVariants(productKeywords);
    
    // Strategy: Run multiple searches in parallel
    // 1. Search for brand name (to find Branded products)
    // 2. Search for "brand + product keywords" (to find SR Legacy items like "MCDONALD'S, BIG MAC")
    const searchQueries = [
      brandName, // e.g., "KIRKLAND SIGNATURE" or "MCDONALD'S"
      `${brandName} ${productKeywords.join(' ')}`, // e.g., "MCDONALD'S big mac"
    ];
    
    // Add product keyword search as well (some items might not have brand in search results)
    if (productKeywords.length > 0) {
      searchQueries.push(productKeywords.join(' ')); // e.g., "big mac"
    }
    
    console.log(`Running ${searchQueries.length} parallel searches...`);
    
    const searchPromises = searchQueries.map(async (query) => {
      const response = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}&query=${encodeURIComponent(query)}&dataType=Foundation,SR%20Legacy,Branded&pageSize=25`,
        { next: { revalidate: 3600 } }
      );
      
      if (!response.ok) {
        console.error(`USDA search failed for "${query}": ${response.status}`);
        return [];
      }
      
      const data: USDASearchResponse = await response.json();
      console.log(`  "${query}" → ${data.foods?.length || 0} results`);
      return data.foods || [];
    });
    
    const allResults = await Promise.all(searchPromises);
    
    // Combine all results and deduplicate by fdcId
    const seenIds = new Set<number>();
    const allFoods: USDAFood[] = [];
    
    for (const foods of allResults) {
      for (const food of foods) {
        if (!seenIds.has(food.fdcId)) {
          seenIds.add(food.fdcId);
          allFoods.push(food);
        }
      }
    }
    
    console.log(`Combined: ${allFoods.length} unique foods`);
    
    if (allFoods.length === 0) {
      console.log('No products found');
      return [];
    }

    // Filter products that match brand AND product keywords
    const matchingProducts = allFoods.filter(food => {
      const description = food.description.toLowerCase();
      const ingredients = (food.ingredients || '').toLowerCase();
      const category = (food.foodCategory || '').toLowerCase();
      const foodBrandName = (food.brandName || '').toLowerCase();
      const foodBrandOwner = (food.brandOwner || '').toLowerCase();
      
      // Check if this food is from the target brand
      // Brand can be in: brandName, brandOwner, or even in the description (for SR Legacy)
      const brandLower = brandName.toLowerCase();
      const brandOwnerLower = (brandOwner || '').toLowerCase();
      
      const isBrandMatch = 
        description.includes(brandLower) ||
        description.includes(brandOwnerLower) ||
        foodBrandName.includes(brandLower) ||
        foodBrandOwner.includes(brandLower) ||
        foodBrandOwner.includes(brandOwnerLower);
      
      // Check if any keyword variant appears in description, ingredients, or category
      const hasKeywordMatch = Array.from(keywordVariants).some(keyword => 
        description.includes(keyword) || 
        ingredients.includes(keyword) ||
        category.includes(keyword)
      );
      
      // Must match brand AND have at least one keyword match
      return isBrandMatch && hasKeywordMatch;
    });

    console.log(`Filtered to ${matchingProducts.length} products matching brand + keywords`);

    // Score and sort the matching products
    const scoredProducts = matchingProducts.map(food => ({
      food,
      score: calculateRelevanceScore(food, productKeywords.join(' '), originalQuery),
    }));

    scoredProducts.sort((a, b) => b.score - a.score);

    // Log top matches
    console.log('\nTop matches:');
    scoredProducts.slice(0, 5).forEach((item, i) => {
      console.log(`  ${i + 1}. "${item.food.description}" [${item.food.dataType}] (score: ${item.score})`);
    });
    
    // Enrich top results with portion data (fetch full details for accurate serving sizes)
    console.log('\nFetching portion data for top results...');
    const topFoods = scoredProducts.slice(0, 5).map(item => item.food);
    const enrichedFoods = await Promise.all(topFoods.map(enrichWithPortionData));
    
    console.log('===================================================\n');

    // Return enriched and normalized results
    return enrichedFoods.map(food => normalizeUSDA(food));

  } catch (error) {
    console.error('Brand search error:', error);
    return [];
  }
}

// Search USDA FoodData Central for a specific term (returns best matching result)
async function searchUSDAForTerm(searchTerm: string, displayName: string, originalQuery?: string): Promise<NormalizedFood | null> {
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
      const usdaFood = findBestMatch(data.foods, searchTerm, originalQuery);
      
      if (!usdaFood) {
        console.log(`No relevant USDA match found for: ${searchTerm}`);
        return null;
      }
      
      // Enrich with portion data for accurate serving sizes
      const enrichedFood = await enrichWithPortionData(usdaFood);
      
      // Log full USDA response details
      console.log('\n========== USDA FOOD DETAILS (SELECTED) ==========');
      console.log('Search term:', searchTerm);
      console.log('FDC ID:', enrichedFood.fdcId);
      console.log('Description:', enrichedFood.description);
      console.log('Data Type:', enrichedFood.dataType);
      console.log('Brand Owner:', enrichedFood.brandOwner || 'N/A');
      console.log('Brand Name:', enrichedFood.brandName || 'N/A');
      console.log('Serving Size:', enrichedFood.servingSize, enrichedFood.servingSizeUnit || '');
      console.log('Food Category:', enrichedFood.foodCategory || 'N/A');
      if (enrichedFood.foodPortions && enrichedFood.foodPortions.length > 0) {
        console.log('Food Portions:');
        enrichedFood.foodPortions.forEach((portion, i) => {
          console.log(`  ${i + 1}. ${portion.gramWeight}g - ${portion.modifier || portion.portionDescription || 'N/A'}`);
        });
      }
      console.log('\n--- Nutrients (per 100g) ---');
      if (enrichedFood.foodNutrients) {
        enrichedFood.foodNutrients.slice(0, 10).forEach((nutrient) => {
          console.log(`  ${nutrient.nutrientName}: ${nutrient.value} ${nutrient.unitName}`);
        });
      }
      console.log('===================================================\n');
      
      const normalized = normalizeUSDA(enrichedFood);
      // Use the friendly display name instead of USDA's verbose name
      return {
        ...normalized,
        name: displayName || normalized.name,
      };
    }
    
    return null;
  } catch (error) {
    console.error('USDA search error for:', searchTerm, error);
    return null;
  }
}

// Search USDA with raw query (fallback, returns multiple results)
async function searchUSDADirect(query: string): Promise<NormalizedFood[]> {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    console.error('USDA_API_KEY not configured');
    return [];
  }

  try {
    const response = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}&query=${encodeURIComponent(query)}&dataType=Foundation,SR%20Legacy,Branded&pageSize=10`,
      { next: { revalidate: 3600 } }
    );

    if (!response.ok) {
      throw new Error(`USDA API error: ${response.status}`);
    }

    const data: USDASearchResponse = await response.json();
    
    // Log search results summary
    console.log('\n========== USDA DIRECT SEARCH RESULTS ==========');
    console.log('Query:', query);
    console.log('Total hits:', data.totalHits);
    console.log('Foods returned:', data.foods?.length || 0);
    data.foods?.slice(0, 5).forEach((usdaFood, index) => {
      console.log(`  ${index + 1}. ${usdaFood.description} [${usdaFood.dataType}]`);
    });
    
    // Enrich top results with portion data
    console.log('\nFetching portion data...');
    const enrichedFoods = await Promise.all(
      data.foods.slice(0, 10).map(enrichWithPortionData)
    );
    console.log('=================================================\n');
    
    return enrichedFoods.map(food => normalizeUSDA(food));
  } catch (error) {
    console.error('USDA search error:', error);
    return [];
  }
}

// Search Open Food Facts by barcode
async function searchOFF(barcode: string): Promise<NormalizedFood[]> {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`,
      { next: { revalidate: 3600 } }
    );

    if (!response.ok) {
      throw new Error(`OFF API error: ${response.status}`);
    }

    const data: OFFResponse = await response.json();

    if (data.status === 1 && data.product) {
      return [normalizeOFF(data.product)];
    }

    return [];
  } catch (error) {
    console.error('OFF search error:', error);
    return [];
  }
}

/**
 * Search for foods using a smart search strategy:
 * 1. Check cache first
 * 2. If barcode, query Open Food Facts directly
 * 3. Otherwise:
 *    a. Use Gemini to analyze the query for brand detection
 *    b. If branded: Search USDA for all products from that brand, then filter by product keywords
 *    c. If not branded: Use fallback search terms
 *    d. Return deduplicated results
 */
export async function searchFoods(query: string): Promise<NormalizedFood[]> {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const trimmedQuery = query.trim();
  const isBarcodeQuery = isBarcode(trimmedQuery);

  // Step 1: Check cache
  const cacheSource: CacheSource = isBarcodeQuery ? 'OFF' : 'USDA';
  const cachedResults = await getCachedResults(trimmedQuery, cacheSource);
  if (cachedResults && cachedResults.length > 0) {
    return cachedResults;
  }

  let results: NormalizedFood[];

  // Step 2: Query appropriate API
  if (isBarcodeQuery) {
    // Barcodes go directly to Open Food Facts
    results = await searchOFF(trimmedQuery);
  } else {
    // Use Gemini to analyze the query
    const analysis = await analyzeQueryWithGemini(trimmedQuery);
    
    if (analysis.has_brand && analysis.brand_name) {
      // BRANDED SEARCH: Get all products from this brand, then filter
      console.log(`\nDetected brand search: ${analysis.brand_name} (${analysis.brand_owner || 'N/A'})`);
      console.log(`Product keywords: ${analysis.product_keywords.join(', ')}`);
      
      results = await searchBrandedProducts(
        analysis.brand_name,
        analysis.brand_owner,
        analysis.product_keywords,
        trimmedQuery
      );
      
      // If branded search found results, use them
      if (results.length > 0) {
        console.log(`Branded search returned ${results.length} results`);
      } else {
        // Fallback to generic searches if brand search failed
        console.log('Branded search found no matches, trying fallback searches...');
        
        const fallbackPromises = analysis.fallback_searches.map(suggestion =>
          searchUSDAForTerm(suggestion.usda_search_term, suggestion.display_name, trimmedQuery)
        );
        
        const fallbackResults = await Promise.all(fallbackPromises);
        
        const seen = new Set<string>();
        results = fallbackResults.filter((food): food is NormalizedFood => {
          if (!food) return false;
          const key = food.name.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        
        console.log(`Fallback search returned ${results.length} results`);
      }
    } else {
      // NON-BRANDED SEARCH: Use the fallback/generic search terms
      console.log('\nNo brand detected, using generic search...');
      
      if (analysis.fallback_searches.length === 0) {
        results = await searchUSDADirect(trimmedQuery);
      } else {
        const searchPromises = analysis.fallback_searches.map(suggestion =>
          searchUSDAForTerm(suggestion.usda_search_term, suggestion.display_name, trimmedQuery)
        );
        
        const searchResults = await Promise.all(searchPromises);
        
        const seen = new Set<string>();
        results = searchResults.filter((food): food is NormalizedFood => {
          if (!food) return false;
          const key = food.name.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        console.log(`Found ${results.length} unique results from search`);

        if (results.length === 0) {
          console.log('Search returned no results, falling back to direct search');
          results = await searchUSDADirect(trimmedQuery);
        }
      }
    }
  }

  // Step 3: Save to cache if we got results
  if (results.length > 0) {
    await saveToCache(trimmedQuery, cacheSource, results);
  }

  return results;
}
