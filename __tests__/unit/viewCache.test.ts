/**
 * Unit tests for the generic per-view cache used for stale-while-revalidate
 * page loads (stats, settings). Pages seed their state from the cache for an
 * instant paint, then revalidate in the background.
 */

import { loadViewCache, saveViewCache } from '@/lib/offline/viewCache';

beforeEach(() => {
  localStorage.clear();
});

describe('viewCache', () => {
  it('round-trips a value for a view key', () => {
    saveViewCache('stats', { streak: 7, days: [{ date: '2026-07-14' }] });

    expect(loadViewCache<{ streak: number }>('stats')?.streak).toBe(7);
  });

  it('returns null for an unknown view', () => {
    expect(loadViewCache('settings-profile')).toBeNull();
  });

  it('returns null for corrupted stored data', () => {
    localStorage.setItem('macroai_view_cache_v1:stats', '{broken');
    expect(loadViewCache('stats')).toBeNull();
  });

  it('keeps views independent', () => {
    saveViewCache('stats', { a: 1 });
    saveViewCache('settings-profile', { b: 2 });

    expect(loadViewCache<{ a: number }>('stats')).toEqual({ a: 1 });
    expect(loadViewCache<{ b: number }>('settings-profile')).toEqual({ b: 2 });
  });
});
