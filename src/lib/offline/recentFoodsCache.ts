import { getRecentFoods } from '@/actions/getRecentFoods';
import type { RecentFoodsResponse } from '@/lib/types';

/**
 * getRecentFoods with an offline fallback: successful responses are cached
 * in localStorage; when the server action fails (offline), the last cached
 * response is returned so users can still re-log frequent foods.
 */

const STORAGE_KEY = 'macroai_recent_foods_cache_v1';

export async function getRecentFoodsWithCache(): Promise<RecentFoodsResponse> {
  try {
    const data = await getRecentFoods();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Quota failures must not break the fetch path
    }
    return data;
  } catch (error) {
    const cached = loadCachedRecentFoods();
    if (cached) return cached;
    throw error;
  }
}

export function loadCachedRecentFoods(): RecentFoodsResponse | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecentFoodsResponse) : null;
  } catch {
    return null;
  }
}
