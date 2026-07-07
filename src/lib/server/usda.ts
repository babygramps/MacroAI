import type { NormalizedFood, USDAFood, USDASearchResponse } from '@/lib/types';
import { normalizeUSDA } from '@/lib/normalizer';
import { findBestMatch } from '@/lib/search/relevance';
import { logError } from '@/lib/logger';
import { getUsdaApiKey } from './env';

const USDA_SEARCH_ENDPOINT = 'https://api.nal.usda.gov/fdc/v1/foods/search';

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
