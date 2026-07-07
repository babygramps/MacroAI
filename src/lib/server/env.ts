import { logError } from '@/lib/logger';

/**
 * Read USDA_API_KEY from the environment.
 * Logs a single consistent error when missing; callers decide the
 * user-facing error shape/code.
 *
 * Trimmed: the secrets stored in Vercel carry a trailing CRLF, which is
 * harmless in an HTTP header (Gemini) but 403s when percent-encoded into
 * the USDA query string.
 */
export function getUsdaApiKey(): string | null {
  const apiKey = process.env.USDA_API_KEY?.trim();
  if (!apiKey) {
    logError('USDA_API_KEY not configured');
    return null;
  }
  return apiKey;
}

/**
 * Read GEMINI_API_KEY from the environment.
 * Logs a single consistent error when missing; callers decide the
 * user-facing error shape/code. Trimmed for the same reason as the USDA key.
 */
export function getGeminiApiKey(): string | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    logError('GEMINI_API_KEY not configured');
    return null;
  }
  return apiKey;
}
