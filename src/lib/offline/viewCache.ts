/**
 * Generic per-view cache for stale-while-revalidate page loads.
 *
 * Pages (stats, settings) seed their state from here on mount so returning
 * to a page paints instantly with last-known data, then refetch in the
 * background. Values must be JSON-serializable.
 */

const KEY_PREFIX = 'macroai_view_cache_v1:';

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function saveViewCache<T>(view: string, value: T): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(KEY_PREFIX + view, JSON.stringify(value));
  } catch {
    // Quota or serialization failures must never break the page
  }
}

export function loadViewCache<T>(view: string): T | null {
  if (!hasStorage()) return null;
  try {
    const raw = localStorage.getItem(KEY_PREFIX + view);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
