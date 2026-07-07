// @google/genai ships untranspiled ESM that jest's default transform can't
// parse. Only the pure prompt builder is under test here, so stub the SDK.
jest.mock('@google/genai', () => ({
  GoogleGenAI: class GoogleGenAI {},
  ThinkingLevel: { LOW: 'LOW' },
}));

import { buildNutritionFallbackPrompt } from '@/lib/server/gemini';

const BRANDED_HINT = " If it's a restaurant/branded item, use known published nutrition facts.";

describe('buildNutritionFallbackPrompt', () => {
  it('with mentionBrandedHint=true matches the parseTextLog/analyzeImage prompt verbatim', () => {
    const prompt = buildNutritionFallbackPrompt('Big Mac', 220, true);
    expect(prompt).toBe(`Provide accurate nutrition data for: "Big Mac" (220g total)

Return ONLY a JSON object with these exact fields:
{"name": "Big Mac", "estimated_weight_g": 220, "calories": 250, "protein_g": 20, "carbs_g": 30, "fat_g": 10}

Use accurate nutrition data for this specific item.${BRANDED_HINT}`);
  });

  it('with mentionBrandedHint=false matches the parseRecipe prompt verbatim (no branded sentence)', () => {
    const prompt = buildNutritionFallbackPrompt('2 lbs Beef Chuck', 908, false);
    expect(prompt).toBe(`Provide accurate nutrition data for: "2 lbs Beef Chuck" (908g total)

Return ONLY a JSON object with these exact fields:
{"name": "2 lbs Beef Chuck", "estimated_weight_g": 908, "calories": 250, "protein_g": 20, "carbs_g": 30, "fat_g": 10}

Use accurate nutrition data for this specific item.`);
    expect(prompt).not.toContain('restaurant/branded');
  });

  it('the two variants differ only by the trailing branded-hint sentence', () => {
    const withHint = buildNutritionFallbackPrompt('Oatmeal', 234, true);
    const withoutHint = buildNutritionFallbackPrompt('Oatmeal', 234, false);
    expect(withHint).toBe(withoutHint + BRANDED_HINT);
  });
});
