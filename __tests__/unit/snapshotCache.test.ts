/**
 * Unit tests for the offline dashboard snapshot cache.
 *
 * After every successful dashboard fetch, the result is cached per local
 * date so the dashboard can render last-known data when the device is
 * offline.
 */

import {
  saveDashboardSnapshot,
  loadDashboardSnapshot,
  type DashboardSnapshot,
} from '@/lib/offline/snapshotCache';

function snapshot(overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  return {
    goals: { calorieGoal: 2000, proteinGoal: 150, carbsGoal: 200, fatGoal: 65 },
    summary: {
      totalCalories: 1500,
      totalProtein: 120,
      totalCarbs: 130,
      totalFat: 50,
      meals: [],
      mealCount: 0,
    },
    latestWeight: null,
    latestTdee: 2400,
    dayStatus: null,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('snapshotCache', () => {
  it('round-trips a snapshot for a date', () => {
    saveDashboardSnapshot('2026-07-14', snapshot());

    const loaded = loadDashboardSnapshot('2026-07-14');
    expect(loaded).not.toBeNull();
    expect(loaded?.summary.totalCalories).toBe(1500);
    expect(loaded?.latestTdee).toBe(2400);
  });

  it('returns null for a date with no snapshot', () => {
    expect(loadDashboardSnapshot('2026-01-01')).toBeNull();
  });

  it('returns null for corrupted stored data', () => {
    localStorage.setItem('macroai_dashboard_snapshot_v1:2026-07-14', '{not json');
    expect(loadDashboardSnapshot('2026-07-14')).toBeNull();
  });

  it('prunes the oldest snapshots beyond the retention limit', () => {
    for (let day = 1; day <= 20; day++) {
      const key = `2026-06-${String(day).padStart(2, '0')}`;
      saveDashboardSnapshot(key, snapshot());
    }

    // Retention is 14: the 6 oldest days should be gone, newest kept.
    expect(loadDashboardSnapshot('2026-06-01')).toBeNull();
    expect(loadDashboardSnapshot('2026-06-06')).toBeNull();
    expect(loadDashboardSnapshot('2026-06-07')).not.toBeNull();
    expect(loadDashboardSnapshot('2026-06-20')).not.toBeNull();
  });
});
