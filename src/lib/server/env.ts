import { logError } from '@/lib/logger';

/**
 * Read USDA_API_KEY from the environment.
 * Logs a single consistent error when missing; callers decide the
 * user-facing error shape/code.
 */
export function getUsdaApiKey(): string | null {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    logError('USDA_API_KEY not configured');
    return null;
  }
  return apiKey;
}

/**
 * Read GEMINI_API_KEY from the environment.
 * Logs a single consistent error when missing; callers decide the
 * user-facing error shape/code.
 */
export function getGeminiApiKey(): string | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logError('GEMINI_API_KEY not configured');
    return null;
  }
  return apiKey;
}
