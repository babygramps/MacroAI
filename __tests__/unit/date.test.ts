import { formatLogHeader, formatShortDate, isToday } from '@/lib/date';

describe('date utilities', () => {
  it('identifies today correctly', () => {
    expect(isToday(new Date())).toBe(true);
  });

  it('formats today log header', () => {
    expect(formatLogHeader(new Date())).toBe("Today's Log");
  });
});

describe('formatShortDate', () => {
  it('formats a YYYY-MM-DD date-only string as local midnight (protects the WeightChart/TdeeChart dedup)', () => {
    expect(formatShortDate('2024-01-05')).toBe('Jan 5');
    expect(formatShortDate('2024-12-31')).toBe('Dec 31');
  });
});
