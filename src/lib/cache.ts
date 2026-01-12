import CryptoJS from 'crypto-js';
import type { NormalizedFood } from './types';

// Cache source type
export type CacheSource = 'USDA' | 'OFF' | 'API_NINJAS' | 'GEMINI';

// Cache TTL constants (in days)
export const CACHE_TTL: Record<CacheSource, number> = {
  USDA: 7, // Static nutritional data
  OFF: 7, // Product data is stable
  API_NINJAS: 1, // 24 hours for NLP results
  GEMINI: 3, // 3 days for Gemini-parsed meals (cached by full query)
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
 * Cache entry structure for FoodCache model
 */
export interface CacheEntry {
  cacheKey: string;
  source: string;
  query: string;
  results: NormalizedFood[];
  expiresAt: number;
}

/**
 * Create a new cache entry object
 */
export function createCacheEntry(
  query: string,
  source: CacheSource,
  results: NormalizedFood[]
): CacheEntry {
  const ttlDays = CACHE_TTL[source];

  return {
    cacheKey: generateCacheKey(query, source),
    source,
    query: query.toLowerCase().trim(),
    results,
    expiresAt: calculateExpiry(ttlDays),
  };
}
