import { toErrorResult } from '@/lib/server/actionShared';

describe('toErrorResult', () => {
  it('builds an ActionError with the given code and message', () => {
    const result = toErrorResult('unknown_error', 'Something went wrong. Please try again.');
    expect(result).toEqual({
      code: 'unknown_error',
      message: 'Something went wrong. Please try again.',
    });
  });

  it('preserves distinct fallback messages per action for the same code', () => {
    const textLog = toErrorResult('unknown_error', 'Something went wrong. Please try again.');
    const recipe = toErrorResult('unknown_error', 'Something went wrong parsing the recipe. Please try again.');
    expect(textLog.message).not.toBe(recipe.message);
    expect(textLog.code).toBe(recipe.code);
  });
});
