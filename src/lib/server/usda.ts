import type { NormalizedFood, USDAFood, USDAFoodPortion, USDASearchResponse } from '@/lib/types';
import { normalizeUSDA } from '@/lib/normalizer';
import { findBestMatch } from '@/lib/search/relevance';
import { logError } from '@/lib/logger';
import { getUsdaApiKey } from './env';

const USDA_SEARCH_ENDPOINT = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const USDA_FOOD_DETAILS_ENDPOINT = 'https://api.nal.usda.gov/fdc/v1/food';

// dataType/pageSize used identically across all ~7 hand-built search URLs in
// the four actions today (see task-3 divergence notes). pageSize=25 is only
// used by searchFoods' brand search (Task 5).
const DEFAULT_DATA_TYPES = ['Foundation', 'SR Legacy', 'Branded'];
const DEFAULT_PAGE_SIZE = 10;

export interface BuildUsdaSearchUrlOptions {
  /** Defaults to '' so this stays a pure function usable without env access in tests. */
  apiKey?: string;
  dataTypes?: string[];
  pageSize?: number;
}

/**
 * Pure URL builder for the USDA FoodData Central /foods/search endpoint.
 * Exported for unit testing. Mirrors the exact query-string shape used by
 * every existing call site (api_key, query, dataType, pageSize) — no
 * invented params (e.g. brandOwner is never sent as a URL param today; it's
 * only used for client-side filtering in searchFoods).
 */
export function buildUsdaSearchUrl(term: string, opts: BuildUsdaSearchUrlOptions = {}): string {
  const { apiKey = '', dataTypes = DEFAULT_DATA_TYPES, pageSize = DEFAULT_PAGE_SIZE } = opts;

  const dataTypeParam = dataTypes.map((dt) => encodeURIComponent(dt)).join(',');

  return (
    `${USDA_SEARCH_ENDPOINT}?api_key=${encodeURIComponent(apiKey)}` +
    `&query=${encodeURIComponent(term)}` +
    `&dataType=${dataTypeParam}` +
    `&pageSize=${pageSize}`
  );
}

export interface SearchUsdaOptions {
  dataTypes?: string[];
  pageSize?: number;
}

/**
 * Fetch raw USDA search results for a term. Returns null (logged) on
 * missing API key, non-OK response, or network/parse failure.
 */
export async function searchUsda(term: string, opts: SearchUsdaOptions = {}): Promise<USDAFood[] | null> {
  const apiKey = getUsdaApiKey();
  if (!apiKey) return null;

  const url = buildUsdaSearchUrl(term, { apiKey, ...opts });

  try {
    const response = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`USDA API error: ${response.status}`);
    }

    const data: USDASearchResponse = await response.json();
    return data.foods ?? [];
  } catch (error) {
    logError('USDA search error for:', term, error);
    return null;
  }
}

/**
 * Shared replacement for the 3 near-identical `searchUSDAIngredient` copies
 * (analyzeImage, parseTextLog, parseRecipe). Diffed all 3 first — they are
 * functionally identical: same search params, same `findBestMatch(foods,
 * searchTerm)` call (no originalQuery), same `normalizeUSDA(food, false)`
 * (per-100g, for later scaling to actual portion weight). No divergence to
 * surface here.
 */
export async function searchUSDAIngredient(searchTerm: string): Promise<NormalizedFood | null> {
  const foods = await searchUsda(searchTerm);
  if (!foods || foods.length === 0) {
    return null;
  }

  const { food: usdaFood } = findBestMatch(foods, searchTerm);
  if (!usdaFood) {
    return null;
  }

  return normalizeUSDA(usdaFood, false);
}

export interface BuildUsdaFoodDetailsUrlOptions {
  /** Defaults to '' so this stays a pure function usable without env access in tests. */
  apiKey?: string;
}

/**
 * Pure URL builder for the USDA FoodData Central /food/{fdcId} endpoint.
 * Exported for unit testing, mirroring `buildUsdaSearchUrl`.
 */
export function buildUsdaFoodDetailsUrl(fdcId: number, opts: BuildUsdaFoodDetailsUrlOptions = {}): string {
  const { apiKey = '' } = opts;
  return `${USDA_FOOD_DETAILS_ENDPOINT}/${fdcId}?api_key=${encodeURIComponent(apiKey)}`;
}

// Raw response shape from USDA's /v1/food/{fdcId} endpoint. Distinct from
// USDAFood (the /foods/search shape): nutrient info is nested under
// `nutrient` here instead of flattened onto the entry.
interface UsdaFoodDetailsResponse {
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
 * Fetch full food details (including `foodPortions`, which the search
 * endpoint omits) from USDA's /food/{fdcId} endpoint. Migrated from
 * searchFoods' local `fetchFoodDetails` — same 8s timeout + revalidate
 * pattern as `searchUsda`. The caller (searchFoods' `enrichWithPortionData`)
 * decides when to call this and how to merge the result; this function only
 * fetches and reshapes the response into `USDAFood`.
 */
export async function fetchUsdaFoodDetails(fdcId: number): Promise<USDAFood | null> {
  const apiKey = getUsdaApiKey();
  if (!apiKey) return null;

  const url = buildUsdaFoodDetailsUrl(fdcId, { apiKey });

  try {
    const response = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      logError(`Failed to fetch food details for ${fdcId}: ${response.status}`);
      return null;
    }

    const data: UsdaFoodDetailsResponse = await response.json();

    const foodNutrients = data.foodNutrients.map((fn) => ({
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
    logError(`Error fetching food details for ${fdcId}:`, error);
    return null;
  }
}
