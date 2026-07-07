jest.mock('@/lib/logger', () => ({
  logDebug: jest.fn(),
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

import { getUsdaApiKey, getGeminiApiKey } from '@/lib/server/env';
import { logError } from '@/lib/logger';

const ORIGINAL_USDA = process.env.USDA_API_KEY;
const ORIGINAL_GEMINI = process.env.GEMINI_API_KEY;

afterEach(() => {
  if (ORIGINAL_USDA === undefined) delete process.env.USDA_API_KEY;
  else process.env.USDA_API_KEY = ORIGINAL_USDA;
  if (ORIGINAL_GEMINI === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = ORIGINAL_GEMINI;
  jest.clearAllMocks();
});

describe('getUsdaApiKey', () => {
  it('returns a clean key unchanged', () => {
    process.env.USDA_API_KEY = 'abcDEF123';
    expect(getUsdaApiKey()).toBe('abcDEF123');
  });

  it('trims a trailing CRLF (Vercel-stored secrets carry one; USDA 403s on it)', () => {
    process.env.USDA_API_KEY = 'abcDEF123\r\n';
    expect(getUsdaApiKey()).toBe('abcDEF123');
  });

  it('trims surrounding whitespace', () => {
    process.env.USDA_API_KEY = '  abcDEF123 \n';
    expect(getUsdaApiKey()).toBe('abcDEF123');
  });

  it('treats a whitespace-only value as missing', () => {
    process.env.USDA_API_KEY = ' \r\n ';
    expect(getUsdaApiKey()).toBeNull();
    expect(logError).toHaveBeenCalledWith('USDA_API_KEY not configured');
  });

  it('returns null when unset', () => {
    delete process.env.USDA_API_KEY;
    expect(getUsdaApiKey()).toBeNull();
  });
});

describe('getGeminiApiKey', () => {
  it('trims a trailing CRLF', () => {
    process.env.GEMINI_API_KEY = 'AIzaExample\r\n';
    expect(getGeminiApiKey()).toBe('AIzaExample');
  });

  it('treats a whitespace-only value as missing', () => {
    process.env.GEMINI_API_KEY = '\n';
    expect(getGeminiApiKey()).toBeNull();
    expect(logError).toHaveBeenCalledWith('GEMINI_API_KEY not configured');
  });
});
