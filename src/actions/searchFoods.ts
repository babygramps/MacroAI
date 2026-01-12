'use server';

import type { NormalizedFood, USDASearchResponse, OFFResponse } from '@/lib/types';
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

async function getSmartSearchTerms(userQuery: string): Promise<GeminiSearchSuggestion[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('GEMINI_API_KEY not configured, using direct search');
    return [{ usda_search_term: userQuery, display_name: userQuery, description: '' }];
  }

  try {
    const client = new GoogleGenAI({ apiKey });

    const prompt = `You are a USDA food database expert. The user is searching for: "${userQuery}"

Generate 3-5 specific USDA search terms that would return the most relevant results for what the user likely wants.

INSTRUCTIONS:
1. Think about what the user MOST LIKELY wants when they search this term
2. Prioritize common, everyday foods over obscure variations
3. Use USDA-friendly terminology (singular, specific descriptors)
4. Include the most common/popular interpretation first

EXAMPLES:
- "whole milk" → User probably wants "milk whole 3.25%" (a glass of milk), NOT "milk whole dry powder" or "milk chocolate"
- "chicken" → User probably wants "chicken breast meat cooked" or "chicken thigh meat cooked"
- "rice" → User probably wants "rice white cooked" or "rice brown cooked"
- "bread" → User probably wants "bread white commercial" or "bread whole wheat"
- "apple" → User probably wants "apple raw with skin" 

For each suggestion, provide:
- usda_search_term: The exact term to search USDA (specific, singular)
- display_name: User-friendly name to show in the app
- description: Brief description of what this is (e.g., "Per 1 cup serving")

Return ONLY a valid JSON array:
[
  {"usda_search_term": "milk whole 3.25%", "display_name": "Whole Milk", "description": "3.25% fat, per 1 cup (244g)"},
  {"usda_search_term": "milk whole vitamin d", "display_name": "Whole Milk (Vitamin D)", "description": "Fortified, per 1 cup"}
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
      return [{ usda_search_term: userQuery, display_name: userQuery, description: '' }];
    }

    console.log('Gemini search suggestions:', responseText);
    return JSON.parse(responseText) as GeminiSearchSuggestion[];
  } catch (error) {
    console.error('Gemini search optimization error:', error);
    return [{ usda_search_term: userQuery, display_name: userQuery, description: '' }];
  }
}

// Search USDA FoodData Central for a specific term (returns top result)
async function searchUSDAForTerm(searchTerm: string, displayName: string): Promise<NormalizedFood | null> {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    console.error('USDA_API_KEY not configured');
    return null;
  }

  try {
    const response = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}&query=${encodeURIComponent(searchTerm)}&dataType=Foundation,SR%20Legacy&pageSize=1`,
      { next: { revalidate: 3600 } }
    );

    if (!response.ok) {
      throw new Error(`USDA API error: ${response.status}`);
    }

    const data: USDASearchResponse = await response.json();
    
    if (data.foods && data.foods.length > 0) {
      const normalized = normalizeUSDA(data.foods[0]);
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
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}&query=${encodeURIComponent(query)}&dataType=Foundation,SR%20Legacy&pageSize=10`,
      { next: { revalidate: 3600 } }
    );

    if (!response.ok) {
      throw new Error(`USDA API error: ${response.status}`);
    }

    const data: USDASearchResponse = await response.json();
    return data.foods.map(normalizeUSDA);
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
 *    a. Use Gemini to generate smart USDA search terms
 *    b. Query USDA for each suggested term (parallel)
 *    c. Return deduplicated results with friendly names
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
    // Use Gemini to get smart search suggestions
    const suggestions = await getSmartSearchTerms(trimmedQuery);
    
    if (suggestions.length === 0) {
      // Fallback to direct search
      results = await searchUSDADirect(trimmedQuery);
    } else {
      // Search USDA for each suggestion in parallel
      console.log(`Searching USDA for ${suggestions.length} smart suggestions...`);
      
      const searchPromises = suggestions.map(suggestion =>
        searchUSDAForTerm(suggestion.usda_search_term, suggestion.display_name)
      );
      
      const searchResults = await Promise.all(searchPromises);
      
      // Filter out nulls and deduplicate by name
      const seen = new Set<string>();
      results = searchResults.filter((food): food is NormalizedFood => {
        if (!food) return false;
        const key = food.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      console.log(`Found ${results.length} unique results from smart search`);

      // If no results from smart search, fallback to direct
      if (results.length === 0) {
        console.log('Smart search returned no results, falling back to direct search');
        results = await searchUSDADirect(trimmedQuery);
      }
    }
  }

  // Step 3: Save to cache if we got results
  if (results.length > 0) {
    await saveToCache(trimmedQuery, cacheSource, results);
  }

  return results;
}
