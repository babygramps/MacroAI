import type { USDAFood } from '@/lib/types';

export interface MatchResult {
  food: USDAFood | null;
  score: number;
}

/**
 * Generate singular/plural word variants for better matching.
 */
export function generateWordVariants(words: string[]): Set<string> {
  const variants = new Set<string>();
  words.forEach((word) => {
    variants.add(word);
    if (word.endsWith('e')) {
      variants.add(word + 's'); // bake -> bakes
    } else if (!word.endsWith('s')) {
      variants.add(word + 's'); // chicken -> chickens
    }
    if (word.endsWith('s') && word.length > 3) {
      variants.add(word.slice(0, -1)); // bakes -> bake
    }
  });
  return variants;
}

/**
 * Extract potential brand terms from a query.
 */
export function extractBrandTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

/**
 * Calculate a relevance score for a USDA food result based on the search term.
 * Higher score = better match.
 */
export function calculateRelevanceScore(
  food: USDAFood,
  searchTerm: string,
  originalQuery?: string
): number {
  const searchWords = searchTerm.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const description = food.description.toLowerCase();
  const category = (food.foodCategory || '').toLowerCase();
  const ingredients = (food.ingredients || '').toLowerCase();
  const brandName = (food.brandName || '').toLowerCase();
  const brandOwner = (food.brandOwner || '').toLowerCase();

  let score = 0;

  const wordVariants = generateWordVariants(searchWords);
  const descriptionMatches = Array.from(wordVariants).filter((word) => description.includes(word)).length;
  score += descriptionMatches * 20;

  if (description.includes(searchTerm.toLowerCase())) {
    score += 50;
  }

  const categoryMatches = Array.from(wordVariants).filter((word) => category.includes(word)).length;
  score += categoryMatches * 15;

  const ingredientMatches = Array.from(wordVariants).filter((word) => ingredients.includes(word)).length;
  score += ingredientMatches * 10;

  if (originalQuery) {
    const queryBrandTerms = extractBrandTerms(originalQuery);
    const brandText = `${brandName} ${brandOwner}`;
    const brandMatches = queryBrandTerms.filter((term) => brandText.includes(term)).length;
    if (brandMatches > 0) {
      score += brandMatches * 25;
    }
  }

  const searchBrandMatches = Array.from(wordVariants).filter((word) =>
    brandName.includes(word) || brandOwner.includes(word)
  ).length;
  score += searchBrandMatches * 15;

  const firstWord = description.split(/[,\s]/)[0];
  const hasFirstWordMatch = Array.from(wordVariants).some((word) =>
    firstWord.includes(word) || word.includes(firstWord)
  );
  if (searchWords.length > 0 && !hasFirstWordMatch) {
    score -= 30;
  }

  const hasBrandInQuery = originalQuery
    ? extractBrandTerms(originalQuery).some((term) => `${brandName} ${brandOwner}`.includes(term))
    : false;

  if (!hasBrandInQuery) {
    if (food.dataType === 'Foundation') {
      score += 5;
    } else if (food.dataType === 'SR Legacy') {
      score += 3;
    }
  }

  return score;
}

/**
 * Find the best matching food from a list of USDA results.
 */
export function findBestMatch(
  foods: USDAFood[],
  searchTerm: string,
  originalQuery?: string
): MatchResult {
  if (!foods || foods.length === 0) {
    return { food: null, score: 0 };
  }

  let bestFood = foods[0];
  let bestScore = calculateRelevanceScore(foods[0], searchTerm, originalQuery);

  for (let i = 1; i < foods.length; i++) {
    const score = calculateRelevanceScore(foods[i], searchTerm, originalQuery);
    if (score > bestScore) {
      bestScore = score;
      bestFood = foods[i];
    }
  }

  if (bestScore < 10) {
    return { food: null, score: bestScore };
  }

  return { food: bestFood, score: bestScore };
}
