import { formatLogHeader, isToday } from '@/lib/date';

describe('date utilities', () => {
  it('identifies today correctly', () => {
    expect(isToday(new Date())).toBe(true);
  });

  it('formats today log header', () => {
    expect(formatLogHeader(new Date())).toBe("Today's Log");
  });
});
