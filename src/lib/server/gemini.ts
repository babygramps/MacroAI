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
  /**
   * Label used as the error-log message, so each call site keeps its
   * historical log identity (e.g. 'Gemini parsing error:' in parseTextLog's
   * parseWithGemini vs 'Gemini fallback error:' in the nutrition fallback).
   * Defaults to a generic label.
   */
  logContext?: string;
  /**
   * Plain JSON Schema forwarded as the request's `responseJsonSchema`,
   * constraining decoding server-side so the model cannot emit malformed
   * JSON. gemini-3.5-flash was observed emitting a stray closing brace on
   * ~1/3 of array-of-objects prompts without it (2026-07-07).
   */
  responseJsonSchema?: unknown;
}

/**
 * Discriminated result so callers can distinguish failure modes —
 * analyzeImage (Task 4) maps 'empty_response' and 'parse_error' to
 * different user-facing error codes. Callers that treat all failures
 * uniformly (parseTextLog today) just check `.ok`.
 *
 * `request_error` carries the underlying thrown error so callers can
 * inspect it (e.g. analyzeImage's SAFETY/'blocked' detection, which
 * pre-refactor lived in a catch block around the raw SDK call).
 */
export type StructuredJsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'no_client' | 'empty_response' | 'parse_error' }
  | { ok: false; reason: 'request_error'; error: unknown };

/**
 * Shared wrapper around `client.models.generateContent` for the 7 call
 * sites that all repeat the same `thinkingConfig: LOW` +
 * `responseMimeType: 'application/json'` config, then JSON.parse the
 * response text. Accepts either plain text contents or multimodal
 * `Content[]` (e.g. analyzeImage's inlineData image parts).
 *
 * Request and JSON-parse errors are logged under `opts.logContext`; an
 * empty response is NOT logged here — no pre-refactor call site logged it
 * inside the helper, so callers decide.
 */
export async function generateStructuredJson<T>(
  contents: ContentListUnion,
  opts: GenerateStructuredJsonOptions = {}
): Promise<StructuredJsonResult<T>> {
  const client = getGeminiClient();
  if (!client) return { ok: false, reason: 'no_client' };

  const logLabel = opts.logContext ?? 'Gemini generateContent error:';

  // One retry, on parse failures only: the model intermittently emits
  // malformed JSON even in JSON mode (see responseJsonSchema doc above);
  // a fresh generation is independent, so a second attempt usually lands.
  // Request errors and empty responses are not retried — callers map those
  // to distinct user-facing codes and they are not transient in the same way.
  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let responseText: string | undefined;
    try {
      const response = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          ...(opts.responseJsonSchema !== undefined && {
            responseJsonSchema: opts.responseJsonSchema,
          }),
          abortSignal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        },
      });
      responseText = response.text;
    } catch (error) {
      logError(logLabel, error);
      return { ok: false, reason: 'request_error', error };
    }

    if (!responseText) {
      return { ok: false, reason: 'empty_response' };
    }

    try {
      return { ok: true, data: JSON.parse(responseText) as T };
    } catch (error) {
      // Pre-refactor code caught JSON.parse failures in the same catch as the
      // request itself, under the same per-call-site label — preserved here.
      logError(logLabel, error);
    }
  }

  return { ok: false, reason: 'parse_error' };
}

interface GeminiFallbackFood {
  name: string;
  estimated_weight_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

// Mirrors GeminiFallbackFood — keep in sync.
const NUTRITION_FALLBACK_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    estimated_weight_g: { type: 'number' },
    calories: { type: 'number' },
    protein_g: { type: 'number' },
    carbs_g: { type: 'number' },
    fat_g: { type: 'number' },
  },
  required: ['name', 'estimated_weight_g', 'calories', 'protein_g', 'carbs_g', 'fat_g'],
};

/**
 * Pure prompt builder for the nutrition fallback — exported for unit
 * testing so the `mentionBrandedHint` divergence (see
 * GeminiNutritionFallbackOptions) can't silently drift.
 */
export function buildNutritionFallbackPrompt(
  displayName: string,
  weightG: number,
  mentionBrandedHint: boolean
): string {
  const brandedHint = mentionBrandedHint
    ? " If it's a restaurant/branded item, use known published nutrition facts."
    : '';

  return `Provide accurate nutrition data for: "${displayName}" (${weightG}g total)

Return ONLY a JSON object with these exact fields:
{"name": "${displayName}", "estimated_weight_g": ${weightG}, "calories": 250, "protein_g": 20, "carbs_g": 30, "fat_g": 10}

Use accurate nutrition data for this specific item.${brandedHint}`;
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

  const prompt = buildNutritionFallbackPrompt(displayName, weightG, mentionBrandedHint);

  const result = await generateStructuredJson<GeminiFallbackFood>(prompt, {
    logContext: 'Gemini fallback error:',
    responseJsonSchema: NUTRITION_FALLBACK_SCHEMA,
  });
  if (!result.ok) return null;

  return normalizeGemini(result.data);
}
