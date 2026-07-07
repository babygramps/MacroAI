import type { NormalizedFood } from '@/lib/types';
import { generateCacheKey, createCacheEntry, isExpired, type CacheSource } from '@/lib/cache';
import { logError } from '@/lib/logger';
import type { AuthenticatedServerContext } from '@/lib/serverAuth';

type ServerDataClient = AuthenticatedServerContext['client'];

/**
 * Shared replacement for the `getCachedResults` copies in searchFoods and
 * parseTextLog (identical apart from a hardcoded vs. parameterized
 * CacheSource). The client is passed in — callers get it once from
 * `getAuthenticatedServerContext()` instead of building their own.
 *
 * Parameterized over the cached payload type because the FoodCache.results
 * column is untyped JSON and different sources cache different shapes
 * (NormalizedFood[] for food searches, ParsedRecipe for GEMINI_RECIPE).
 * The default preserves the original NormalizedFood[] contract for
 * existing callers.
 */
export async function getCachedResults<T = NormalizedFood[]>(
  client: ServerDataClient,
  query: string,
  source: CacheSource
): Promise<T | null> {
  const cacheKey = generateCacheKey(query, source);

  try {
    const { data } = await client.models.FoodCache.listFoodCacheByCacheKey({
      cacheKey,
    });

    if (data && data.length > 0) {
      const entry = data[0];
      if (entry.expiresAt && !isExpired(entry.expiresAt)) {
        return entry.results as T;
      }
    }
  } catch (error) {
    logError('Cache lookup error:', error);
  }

  return null;
}

/**
 * Shared replacement for the `saveToCache` copies in searchFoods and
 * parseTextLog. See `getCachedResults` for the client-passed-in and
 * payload-type-parameter rationale.
 */
export async function saveToCache<T = NormalizedFood[]>(
  client: ServerDataClient,
  query: string,
  source: CacheSource,
  results: T
): Promise<void> {
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
    logError('Cache save error:', error);
  }
}
