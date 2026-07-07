import { scaleToWeightWithName } from '@/lib/normalizer';
import type { NormalizedFood } from '@/lib/types';

describe('scaleToWeightWithName', () => {
  const per100g: NormalizedFood = {
    name: 'Egg, whole, raw, fresh',
    calories: 143,
    protein: 12.6,
    carbs: 0.7,
    fat: 9.5,
    servingSize: 100,
    servingDescription: '100g',
    servingSizeGrams: 100,
    source: 'USDA',
  };

  it('scales per-100g USDA nutrition to the target weight (matches the old scaleToWeight math)', () => {
    const scaled = scaleToWeightWithName(per100g, 50, '1 Large Egg');
    // Old scaleToWeight: scaleFactor = targetWeight / 100
    expect(scaled.calories).toBe(Math.round(143 * 0.5));
    expect(scaled.protein).toBe(Math.round(12.6 * 0.5 * 10) / 10);
    expect(scaled.carbs).toBe(Math.round(0.7 * 0.5 * 10) / 10);
    expect(scaled.fat).toBe(Math.round(9.5 * 0.5 * 10) / 10);
    expect(scaled.servingSize).toBe(50);
  });

  it('overrides the name with the friendly display name when provided', () => {
    const scaled = scaleToWeightWithName(per100g, 50, '1 Large Egg');
    expect(scaled.name).toBe('1 Large Egg');
  });

  it('keeps the original name when no override is given', () => {
    const scaled = scaleToWeightWithName(per100g, 50);
    expect(scaled.name).toBe('Egg, whole, raw, fresh');
  });
});
