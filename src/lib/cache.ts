import CryptoJS from 'crypto-js';
import type { NormalizedFood } from './types';

// Cache source type. The FoodCache.source column is a plain string
// (a.string() in the Amplify schema), so adding a value here is a
// TypeScript-only change — no backend deploy required.
export type CacheSource = 'USDA' | 'OFF' | 'API_NINJAS' | 'GEMINI' | 'GEMINI_RECIPE';

// Cache TTL constants (in days)
export const CACHE_TTL: Record<CacheSource, number> = {
  USDA: 7, // Static nutritional data
  OFF: 7, // Product data is stable
  API_NINJAS: 1, // 24 hours for NLP results
  GEMINI: 3, // 3 days for Gemini-parsed meals (cached by full query)
  // 3 days for Gemini-parsed recipes. A distinct source (not a query prefix)
  // so identical text sent to parseTextLog (GEMINI) and parseRecipe can never
  // hash to the same cache row — the cached payload shapes differ
  // (NormalizedFood[] vs ParsedRecipe) and FoodCache is global across users.
  GEMINI_RECIPE: 3,
};

/**
 * Generate a consistent cache key from query and source
 * Uses MD5 hash for compactness
 */
export function generateCacheKey(
  query: string,
  source: CacheSource
): string {
  const normalizedQuery = query.toLowerCase().trim();
  const input = `${source}:${normalizedQuery}`;
  return CryptoJS.MD5(input).toString();
}

/**
 * Calculate expiry timestamp based on TTL in days
 */
export function calculateExpiry(ttlDays: number): number {
  return Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60;
}

/**
 * Check if a cache entry has expired
 */
export function isExpired(expiresAt: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now >= expiresAt;
}

/**
 * Cache entry structure for FoodCache model.
 * Parameterized because the FoodCache.results column is untyped JSON and
 * different sources cache different payload shapes (NormalizedFood[] for
 * food searches, ParsedRecipe for GEMINI_RECIPE). Defaults preserve the
 * original NormalizedFood[] contract for existing callers.
 */
export interface CacheEntry<T = NormalizedFood[]> {
  cacheKey: string;
  source: string;
  query: string;
  results: T;
  expiresAt: number;
}

/**
 * Create a new cache entry object
 */
export function createCacheEntry<T = NormalizedFood[]>(
  query: string,
  source: CacheSource,
  results: T
): CacheEntry<T> {
  const ttlDays = CACHE_TTL[source];

  return {
    cacheKey: generateCacheKey(query, source),
    source,
    query: query.toLowerCase().trim(),
    results,
    expiresAt: calculateExpiry(ttlDays),
  };
}
