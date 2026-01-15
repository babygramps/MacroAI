import { calculateRelevanceScore, findBestMatch, generateWordVariants } from '@/lib/search/relevance';
import type { USDAFood } from '@/lib/types';

describe('search relevance helpers', () => {
  it('generates plural and singular variants', () => {
    const variants = generateWordVariants(['bake', 'chicken']);
    expect(variants.has('bakes')).toBe(true);
    expect(variants.has('chickens')).toBe(true);
  });

  it('scores better matches higher', () => {
    const baseFood: USDAFood = {
      fdcId: 1,
      description: 'Chicken breast, roasted',
      dataType: 'Foundation',
      foodNutrients: [],
    };

    const similarFood: USDAFood = {
      fdcId: 2,
      description: 'Chicken thigh, roasted',
      dataType: 'Foundation',
      foodNutrients: [],
    };

    const score1 = calculateRelevanceScore(baseFood, 'chicken breast');
    const score2 = calculateRelevanceScore(similarFood, 'chicken breast');
    expect(score1).toBeGreaterThan(score2);
  });

  it('returns the best match when score is high enough', () => {
    const foods: USDAFood[] = [
      {
        fdcId: 1,
        description: 'Chicken thigh, roasted',
        dataType: 'Foundation',
        foodNutrients: [],
      },
      {
        fdcId: 2,
        description: 'Chicken breast, roasted',
        dataType: 'Foundation',
        foodNutrients: [],
      },
    ];

    const result = findBestMatch(foods, 'chicken breast');
    expect(result.food?.fdcId).toBe(2);
    expect(result.score).toBeGreaterThan(0);
  });
});
