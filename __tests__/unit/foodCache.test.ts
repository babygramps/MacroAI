import { namespaceCacheQuery } from '@/lib/server/foodCache';
import { generateCacheKey } from '@/lib/cache';

describe('namespaceCacheQuery', () => {
  it('prefixes the query with the namespace', () => {
    expect(namespaceCacheQuery('recipe', 'chili')).toBe('recipe:chili');
  });

  it('keeps a namespaced query and the plain query distinct under the same CacheSource', () => {
    // Regression guard: parseRecipe and parseTextLog both cache under
    // CacheSource 'GEMINI'. Without namespacing, identical recipe/meal text
    // sent to both actions would resolve to the same cache row even though
    // the cached payload shapes differ (ParsedRecipe vs NormalizedFood[]).
    const plainKey = generateCacheKey('chicken parmesan', 'GEMINI');
    const namespacedKey = generateCacheKey(namespaceCacheQuery('recipe', 'chicken parmesan'), 'GEMINI');
    expect(namespacedKey).not.toBe(plainKey);
  });

  it('different namespaces over the same query also stay distinct', () => {
    const a = generateCacheKey(namespaceCacheQuery('recipe', 'chili'), 'GEMINI');
    const b = generateCacheKey(namespaceCacheQuery('other', 'chili'), 'GEMINI');
    expect(a).not.toBe(b);
  });
});
