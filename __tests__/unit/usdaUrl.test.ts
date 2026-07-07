import { buildUsdaSearchUrl, buildUsdaFoodDetailsUrl } from '@/lib/server/usda';

describe('buildUsdaSearchUrl', () => {
  it('builds the default search URL used by ingredient lookups (pageSize 10, Foundation/SR Legacy/Branded)', () => {
    const url = buildUsdaSearchUrl('egg whole raw fresh', { apiKey: 'KEY123' });
    expect(url).toBe(
      'https://api.nal.usda.gov/fdc/v1/foods/search?api_key=KEY123&query=egg%20whole%20raw%20fresh&dataType=Foundation,SR%20Legacy,Branded&pageSize=10'
    );
  });

  it('url-encodes special characters in the search term', () => {
    const url = buildUsdaSearchUrl('mac & cheese, "kraft"', { apiKey: 'KEY123' });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('query')).toBe('mac & cheese, "kraft"');
  });

  it('supports a custom pageSize (used by brand searches)', () => {
    const url = buildUsdaSearchUrl('kirkland chicken', { apiKey: 'KEY123', pageSize: 25 });
    expect(url).toContain('pageSize=25');
  });

  it('supports a custom dataType list', () => {
    const url = buildUsdaSearchUrl('chicken', { apiKey: 'KEY123', dataTypes: ['Branded'] });
    expect(url).toContain('dataType=Branded');
  });

  it('defaults apiKey to empty string when omitted (pure function, no env access)', () => {
    const url = buildUsdaSearchUrl('chicken');
    expect(url).toBe(
      'https://api.nal.usda.gov/fdc/v1/foods/search?api_key=&query=chicken&dataType=Foundation,SR%20Legacy,Branded&pageSize=10'
    );
  });
});

describe('buildUsdaFoodDetailsUrl', () => {
  it('builds the /food/{fdcId} details URL used to fetch foodPortions', () => {
    const url = buildUsdaFoodDetailsUrl(454004, { apiKey: 'KEY123' });
    expect(url).toBe('https://api.nal.usda.gov/fdc/v1/food/454004?api_key=KEY123');
  });

  it('defaults apiKey to empty string when omitted (pure function, no env access)', () => {
    const url = buildUsdaFoodDetailsUrl(454004);
    expect(url).toBe('https://api.nal.usda.gov/fdc/v1/food/454004?api_key=');
  });
});
