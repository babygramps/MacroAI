import { logDebug, logError, logInfo, logWarn } from '@/lib/logger';
import type { ActionError } from '@/lib/types';

/**
 * Shared `console` shim (log→debug, info, warn, error→@/lib/logger) that was
 * duplicated verbatim in all 4 AI actions.
 */
export const actionConsole = {
  log: logDebug,
  info: logInfo,
  warn: logWarn,
  error: logError,
} as const;

/**
 * Union of the four actions' local `*ErrorCode` types:
 * TextParseErrorCode | ImageAnalysisErrorCode | RecipeParseErrorCode | SearchErrorCode.
 */
export type FoodActionErrorCode =
  | 'no_api_key'
  | 'no_image'
  | 'gemini_empty_response'
  | 'gemini_no_food_detected'
  | 'gemini_parse_error'
  | 'gemini_api_error'
  | 'gemini_error'
  | 'no_ingredients_found'
  | 'usda_error'
  | 'off_error'
  | 'no_results'
  | 'unknown_error';

/**
 * Builds the ActionError for a terminal catch block. Each action logs its
 * own context-specific message via `actionConsole.error` before calling
 * this — `fallbackMessage` stays per-action because the four actions each
 * use distinct user-facing copy for the same `unknown_error` code
 * (e.g. "Something went wrong. Please try again." vs "...parsing the
 * recipe..." vs "...analyzing your photo...").
 */
export function toErrorResult(
  fallbackCode: FoodActionErrorCode,
  fallbackMessage: string
): ActionError & { code: FoodActionErrorCode } {
  return { code: fallbackCode, message: fallbackMessage };
}
