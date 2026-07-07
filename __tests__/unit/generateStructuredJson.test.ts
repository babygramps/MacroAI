// @google/genai ships untranspiled ESM that jest's default transform can't
// parse — stub the SDK class and capture generateContent calls.
const mockGenerateContent = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: class GoogleGenAI {
    models = { generateContent: mockGenerateContent };
  },
  ThinkingLevel: { LOW: 'LOW' },
}));

jest.mock('@/lib/logger', () => ({
  logDebug: jest.fn(),
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

import { generateStructuredJson } from '@/lib/server/gemini';

beforeAll(() => {
  process.env.GEMINI_API_KEY = 'test-key';
});

afterEach(() => {
  mockGenerateContent.mockReset();
});

describe('generateStructuredJson', () => {
  it('retries once when the model returns malformed JSON, succeeding on the second attempt', async () => {
    // The stray-brace shape gemini-3.5-flash was observed emitting (2026-07-07)
    mockGenerateContent
      .mockResolvedValueOnce({ text: '[\n  {"a": 1}\n}\n]' })
      .mockResolvedValueOnce({ text: '[{"a": 1}]' });

    const result = await generateStructuredJson<Array<{ a: number }>>('prompt');

    expect(result).toEqual({ ok: true, data: [{ a: 1 }] });
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('returns parse_error after two consecutive malformed responses', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({ text: '[{"a": 1}}' })
      .mockResolvedValueOnce({ text: '[{"a": 1}}' });

    const result = await generateStructuredJson('prompt');

    expect(result).toEqual({ ok: false, reason: 'parse_error' });
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('does not retry request errors', async () => {
    const boom = new Error('SAFETY blocked');
    mockGenerateContent.mockRejectedValueOnce(boom);

    const result = await generateStructuredJson('prompt');

    expect(result).toEqual({ ok: false, reason: 'request_error', error: boom });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('does not retry empty responses', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: undefined });

    const result = await generateStructuredJson('prompt');

    expect(result).toEqual({ ok: false, reason: 'empty_response' });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('forwards responseJsonSchema into the request config alongside the shared config', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: '{"ok": true}' });
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } } };

    await generateStructuredJson('prompt', { responseJsonSchema: schema });

    const request = mockGenerateContent.mock.calls[0][0];
    expect(request.config.responseJsonSchema).toBe(schema);
    expect(request.config.responseMimeType).toBe('application/json');
    expect(request.config.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
  });

  it('omits responseJsonSchema from the config when not provided', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: '{}' });

    await generateStructuredJson('prompt');

    const request = mockGenerateContent.mock.calls[0][0];
    expect('responseJsonSchema' in request.config).toBe(false);
  });
});
