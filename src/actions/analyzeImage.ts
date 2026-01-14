'use server';

import type { NormalizedFood, GeminiParsedFood } from '@/lib/types';
import { normalizeGemini } from '@/lib/normalizer';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

/**
 * Analyze a food image using Gemini 3 Flash Vision
 * Returns parsed food items with estimated nutrition
 *
 * Note: Images are NOT cached due to uniqueness
 */
export async function analyzeImage(formData: FormData): Promise<NormalizedFood[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return [];
  }

  const imageFile = formData.get('image') as File | null;
  const userDescription = formData.get('description') as string | null;
  
  if (!imageFile) {
    console.error('No image provided');
    return [];
  }

  try {
    // Convert file to base64
    const arrayBuffer = await imageFile.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');

    const client = new GoogleGenAI({ apiKey });

    // Build context section if user provided a description
    const userContextSection = userDescription 
      ? `
USER-PROVIDED CONTEXT:
The user has described this meal as: "${userDescription}"
Use this information to:
- Identify specific restaurants/brands mentioned and use their actual nutrition data
- Use any portion sizes mentioned (e.g., "6oz steak", "large fries")
- Account for hidden ingredients the user mentions (sauces, dressings, cooking oil)
- Correct any visual misidentifications based on the description

`
      : '';

    const prompt = `You are a nutrition expert analyzing a food photo. Identify each food item visible and provide accurate USDA-based nutrition data.
${userContextSection}
INSTRUCTIONS:
1. Identify ALL distinct food items in the image
2. Estimate portion sizes using visual cues:
   - Compare to plate size (standard dinner plate = 10-11 inches)
   - A fist-sized portion ≈ 1 cup
   - Palm-sized meat ≈ 3-4 oz (85-115g)
   - Thumb-sized fat portion ≈ 1 tbsp
3. Use standard USDA nutrition values per 100g, then scale to estimated weight
4. For branded/restaurant items you recognize (or mentioned by the user), use known nutrition data
5. Include sauces, dressings, and toppings as separate items if visible or mentioned

For each item, provide:
- name: Descriptive food name (e.g., "Grilled Chicken Breast" not just "chicken")
- estimated_weight_g: Weight in grams based on visual size estimation
- calories: Total calories for the estimated portion
- protein_g: Total protein in grams
- carbs_g: Total carbohydrates in grams  
- fat_g: Total fat in grams

Return ONLY a valid JSON array. Example:
[
  {"name": "Grilled Chicken Breast", "estimated_weight_g": 150, "calories": 248, "protein_g": 46.5, "carbs_g": 0, "fat_g": 5.4},
  {"name": "Steamed Broccoli", "estimated_weight_g": 85, "calories": 29, "protein_g": 2.4, "carbs_g": 5.6, "fat_g": 0.3},
  {"name": "Brown Rice", "estimated_weight_g": 150, "calories": 165, "protein_g": 3.8, "carbs_g": 34.5, "fat_g": 1.4}
]`;

    const response = await client.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: imageFile.type || 'image/jpeg',
                data: base64Image,
              },
            },
          ],
        },
      ],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text;
    if (!responseText) {
      return [];
    }

    const parsed: GeminiParsedFood[] = JSON.parse(responseText);
    return parsed.map(normalizeGemini);
  } catch (error) {
    console.error('Gemini image analysis error:', error);
    return [];
  }
}
