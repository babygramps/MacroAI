import type { DailySummary, LogStatus, UserGoals, WeightLogEntry } from '@/lib/types';

/**
 * Offline dashboard snapshot cache.
 *
 * After every successful dashboard fetch, useDashboardData caches the result
 * per local date so the dashboard can render last-known data when the device
 * is offline.
 */

const KEY_PREFIX = 'macroai_dashboard_snapshot_v1:';
const MAX_SNAPSHOTS = 14;

export interface DashboardSnapshot {
  goals: UserGoals;
  summary: DailySummary;
  latestWeight: WeightLogEntry | null;
  latestTdee: number | null;
  dayStatus: LogStatus | null;
}

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function saveDashboardSnapshot(dateKey: string, snapshot: DashboardSnapshot): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(
      KEY_PREFIX + dateKey,
      JSON.stringify({ ...snapshot, savedAt: new Date().toISOString() })
    );
    prune();
  } catch {
    // Quota or serialization failures must never break the dashboard
  }
}

export function loadDashboardSnapshot(dateKey: string): DashboardSnapshot | null {
  if (!hasStorage()) return null;
  try {
    const raw = localStorage.getItem(KEY_PREFIX + dateKey);
    return raw ? (JSON.parse(raw) as DashboardSnapshot) : null;
  } catch {
    return null;
  }
}

/** Keep only the newest MAX_SNAPSHOTS date keys (YYYY-MM-DD sorts lexicographically). */
function prune(): void {
  const dateKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(KEY_PREFIX)) {
      dateKeys.push(key.slice(KEY_PREFIX.length));
    }
  }
  if (dateKeys.length <= MAX_SNAPSHOTS) return;
  dateKeys
    .sort()
    .slice(0, dateKeys.length - MAX_SNAPSHOTS)
    .forEach((dateKey) => localStorage.removeItem(KEY_PREFIX + dateKey));
}
