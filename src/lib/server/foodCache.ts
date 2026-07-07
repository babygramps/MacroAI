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
 */
export async function getCachedResults(
  client: ServerDataClient,
  query: string,
  source: CacheSource
): Promise<NormalizedFood[] | null> {
  const cacheKey = generateCacheKey(query, source);

  try {
    const { data } = await client.models.FoodCache.listFoodCacheByCacheKey({
      cacheKey,
    });

    if (data && data.length > 0) {
      const entry = data[0];
      if (entry.expiresAt && !isExpired(entry.expiresAt)) {
        return entry.results as NormalizedFood[];
      }
    }
  } catch (error) {
    logError('Cache lookup error:', error);
  }

  return null;
}

/**
 * Namespaces a cache query so two callers sharing the same `CacheSource`
 * can't collide on the same cache row. parseRecipe (Task 4) uses this to
 * keep its recipe-shaped cache entries separate from parseTextLog's —
 * both cache under `CacheSource: 'GEMINI'`, but the cached payload shapes
 * differ (a `ParsedRecipe` vs `NormalizedFood[]`), and identical text could
 * plausibly be submitted to both actions.
 */
export function namespaceCacheQuery(namespace: string, query: string): string {
  return `${namespace}:${query}`;
}

/**
 * Shared replacement for the `saveToCache` copies in searchFoods and
 * parseTextLog. See `getCachedResults` for the client-passed-in rationale.
 */
export async function saveToCache(
  client: ServerDataClient,
  query: string,
  source: CacheSource,
  results: NormalizedFood[]
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
