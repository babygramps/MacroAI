import { GoogleGenAI, ThinkingLevel, type ContentListUnion } from '@google/genai';
import { logError } from '@/lib/logger';
import { normalizeGemini } from '@/lib/normalizer';
import type { NormalizedFood } from '@/lib/types';
import { getGeminiApiKey } from './env';

export const GEMINI_MODEL = 'gemini-3.5-flash';

const DEFAULT_TIMEOUT_MS = 20000;

// Lazy singleton: `undefined` = not yet attempted, `null` = attempted and
// the API key was missing (getGeminiApiKey already logged), otherwise the
// live client. process.env doesn't change mid-process, so we only need to
// try once.
let cachedClient: GoogleGenAI | null | undefined;

/** Lazy singleton Gemini client. Returns null (logged) when the API key is missing. */
export function getGeminiClient(): GoogleGenAI | null {
  if (cachedClient === undefined) {
    const apiKey = getGeminiApiKey();
    cachedClient = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }
  return cachedClient;
}

export interface GenerateStructuredJsonOptions {
  timeoutMs?: number;
}

/**
 * Shared wrapper around `client.models.generateContent` for the 7 call
 * sites that all repeat the same `thinkingConfig: LOW` +
 * `responseMimeType: 'application/json'` config, then JSON.parse the
 * response text. Accepts either plain text contents or multimodal
 * `Content[]` (e.g. analyzeImage's inlineData image parts).
 * Returns null (logged) on missing key, empty response, or parse/network error.
 */
export async function generateStructuredJson<T>(
  contents: ContentListUnion,
  opts: GenerateStructuredJsonOptions = {}
): Promise<T | null> {
  const client = getGeminiClient();
  if (!client) return null;

  try {
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        abortSignal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      },
    });

    const responseText = response.text;
    if (!responseText) return null;

    return JSON.parse(responseText) as T;
  } catch (error) {
    logError('Gemini generateContent error:', error);
    return null;
  }
}

interface GeminiFallbackFood {
  name: string;
  estimated_weight_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface GeminiNutritionFallbackOptions {
  /**
   * The 3 existing `getGeminiFallback` copies diverge here: parseTextLog and
   * analyzeImage's prompts end with "If it's a restaurant/branded item, use
   * known published nutrition facts." — parseRecipe's copy omits that
   * sentence. Rather than silently pick one, this is an explicit option.
   * Defaults to `true` (matches parseTextLog, the action migrated in this task).
   */
  mentionBrandedHint?: boolean;
}

/**
 * Shared replacement for the 3 near-identical `getGeminiFallback` copies:
 * ask Gemini for a full nutrition estimate (branded/complex items, or USDA misses).
 */
export async function getGeminiNutritionFallback(
  displayName: string,
  weightG: number,
  opts: GeminiNutritionFallbackOptions = {}
): Promise<NormalizedFood | null> {
  const { mentionBrandedHint = true } = opts;

  const brandedHint = mentionBrandedHint
    ? " If it's a restaurant/branded item, use known published nutrition facts."
    : '';

  const prompt = `Provide accurate nutrition data for: "${displayName}" (${weightG}g total)

Return ONLY a JSON object with these exact fields:
{"name": "${displayName}", "estimated_weight_g": ${weightG}, "calories": 250, "protein_g": 20, "carbs_g": 30, "fat_g": 10}

Use accurate nutrition data for this specific item.${brandedHint}`;

  const parsed = await generateStructuredJson<GeminiFallbackFood>(prompt);
  if (!parsed) return null;

  return normalizeGemini(parsed);
}
