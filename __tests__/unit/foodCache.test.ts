import { generateCacheKey, CACHE_TTL } from '@/lib/cache';

describe('GEMINI_RECIPE cache-source separation', () => {
  it('identical text under GEMINI vs GEMINI_RECIPE produces distinct cache keys', () => {
    // parseTextLog caches under 'GEMINI', parseRecipe under 'GEMINI_RECIPE'.
    // The same input text sent to both actions must never resolve to the same
    // FoodCache row: the cached payload shapes differ (NormalizedFood[] vs
    // ParsedRecipe) and FoodCache is global across users.
    const mealKey = generateCacheKey('chicken parmesan', 'GEMINI');
    const recipeKey = generateCacheKey('chicken parmesan', 'GEMINI_RECIPE');
    expect(recipeKey).not.toBe(mealKey);
  });

  it('is immune to prefix forgery: text-log input "recipe:X" cannot collide with a recipe entry for X', () => {
    // Regression guard for the rejected query-prefix namespacing scheme:
    // under that scheme, a parseTextLog user typing "recipe:chicken parmesan"
    // would have hashed to the same key as parseRecipe's entry for
    // "chicken parmesan", poisoning the (globally shared) cache with a
    // wrong-shaped payload. A distinct CacheSource is collision-proof
    // because generateCacheKey hashes `${source}:${query}`.
    const forgedTextLogKey = generateCacheKey('recipe:chicken parmesan', 'GEMINI');
    const recipeKey = generateCacheKey('chicken parmesan', 'GEMINI_RECIPE');
    expect(forgedTextLogKey).not.toBe(recipeKey);
  });

  it('GEMINI_RECIPE has a TTL configured (3 days, matching GEMINI)', () => {
    expect(CACHE_TTL.GEMINI_RECIPE).toBe(3);
    expect(CACHE_TTL.GEMINI_RECIPE).toBe(CACHE_TTL.GEMINI);
  });
});
