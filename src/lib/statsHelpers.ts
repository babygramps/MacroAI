import { getAmplifyDataClient } from '@/lib/data/amplifyClient';
import type { WeightLogEntry, ComputedState, WeeklyCheckIn } from './types';

/**
 * Stats Helpers
 *
 * Historically this file held five fetch-and-compute functions
 * (fetchWeeklyStats, fetchWeightStats, fetchWeightStatsWithTrend,
 * fetchMetabolicInsights, fetchTdeeHistory, fetchDailyLogs) that the stats
 * page called in a `Promise.all`, each of which internally re-fetched the
 * same underlying data with no sharing - netting ~100+ per-day GSI queries
 * per page load. Task 13 of the core-separation refactor ("Phase 5a")
 * replaced all six with `src/lib/stats/statsBundle.ts`: a single
 * `fetchStatsBundle()` fetch plus pure derivers
 * (deriveWeeklyStats/deriveWeightStats(WithTrend)/deriveMetabolicInsights/
 * deriveTdeeHistory/deriveDailyLogs) that reproduce their exact math and
 * edge-case behavior. Those six had no callers besides
 * src/app/stats/page.tsx (grepped before deleting), which now calls
 * fetchStatsBundle + the derivers directly - so they were deleted here
 * rather than kept as wrappers that would have re-fetched a bundle per call.
 * See task-13-report.md for the full per-export disposition.
 *
 * What remains below are the exports Task 13 is NOT about: pure unit
 * helpers used outside the stats page (formatDateKey, kgToLbs, lbsToKg,
 * formatWeight) and pre-existing standalone read/write helpers
 * (calculateStreak, getLatestWeight, saveComputedState, saveWeeklyCheckIn)
 * that were already uncalled before this refactor and are out of its scope.
 */

/**
 * Format a date to YYYY-MM-DD string
 */
export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate consecutive day streak (counting back from today)
 * A day counts as "logged" if it has at least one meal entry.
 * Uses the localDate GSI for efficient per-day checks.
 */
export async function calculateStreak(): Promise<number> {
  const client = getAmplifyDataClient();
  if (!client) {
    return 0;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  const currentDate = new Date(today);

  // We'll check up to 365 days back (reasonable limit)
  const maxDays = 365;

  console.log('[statsHelpers] Calculating streak from:', formatDateKey(today));

  try {
    for (let i = 0; i < maxDays; i++) {
      const dateKey = formatDateKey(currentDate);

      const { data: meals } = await client.models.Meal.listMealByLocalDate({
        localDate: dateKey,
      });

      // If this day has entries, increment streak
      if (meals && meals.length > 0) {
        streak++;
        // Move to previous day
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        // Streak broken (unless it's today - we allow today to have no entries yet)
        if (i === 0) {
          // Today has no entries yet, check yesterday
          currentDate.setDate(currentDate.getDate() - 1);
          continue;
        }
        break;
      }
    }

    console.log('[statsHelpers] Calculated streak:', streak);
    return streak;
  } catch (error) {
    console.error('[statsHelpers] Error calculating streak:', error);
    return 0;
  }
}

/**
 * Get the most recent weight entry
 */
export async function getLatestWeight(): Promise<WeightLogEntry | null> {
  const client = getAmplifyDataClient();
  if (!client) {
    return null;
  }
  console.log('[statsHelpers] Fetching latest weight...');

  try {
    const { data: logs } = await client.models.WeightLog.list();

    if (!logs || logs.length === 0) {
      console.log('[statsHelpers] No weight entries found');
      return null;
    }

    // Sort by recordedAt descending (most recent first)
    const sorted = [...logs].sort(
      (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
    );

    const latest = sorted[0];
    console.log('[statsHelpers] Latest weight:', latest.weightKg, 'kg');

    return {
      id: latest.id,
      weightKg: latest.weightKg,
      recordedAt: latest.recordedAt,
      note: latest.note ?? undefined,
    };
  } catch (error) {
    console.error('[statsHelpers] Error fetching latest weight:', error);
    return null;
  }
}

/**
 * Convert kg to lbs
 */
export function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

/**
 * Convert lbs to kg
 */
export function lbsToKg(lbs: number): number {
  return Math.round((lbs / 2.20462) * 100) / 100;
}

/**
 * Format weight with unit
 */
export function formatWeight(weightKg: number, unit: 'kg' | 'lbs' = 'kg'): string {
  if (unit === 'lbs') {
    return `${kgToLbs(weightKg)} lbs`;
  }
  return `${Math.round(weightKg * 10) / 10} kg`;
}

/**
 * Save a computed state to the database
 */
export async function saveComputedState(state: ComputedState): Promise<void> {
  try {
    const client = getAmplifyDataClient();
    if (!client) {
      return;
    }
    await client.models.ComputedState.create({
      date: state.date,
      trendWeightKg: state.trendWeightKg,
      estimatedTdeeKcal: state.estimatedTdeeKcal,
      rawTdeeKcal: state.rawTdeeKcal,
      fluxConfidenceRange: state.fluxConfidenceRange,
      energyDensityUsed: state.energyDensityUsed,
      weightDeltaKg: state.weightDeltaKg,
    });
    console.log('[statsHelpers] Saved computed state for', state.date);
  } catch (error) {
    console.error('[statsHelpers] Error saving computed state:', error);
  }
}

/**
 * Save a weekly check-in to the database
 */
export async function saveWeeklyCheckIn(checkIn: WeeklyCheckIn): Promise<void> {
  try {
    const client = getAmplifyDataClient();
    if (!client) {
      return;
    }
    await client.models.WeeklyCheckIn.create({
      weekStartDate: checkIn.weekStartDate,
      weekEndDate: checkIn.weekEndDate,
      averageTdee: checkIn.averageTdee,
      suggestedCalories: checkIn.suggestedCalories,
      adherenceScore: checkIn.adherenceScore,
      confidenceLevel: checkIn.confidenceLevel,
      trendWeightStart: checkIn.trendWeightStart,
      trendWeightEnd: checkIn.trendWeightEnd,
      weeklyWeightChange: checkIn.weeklyWeightChange,
      notes: checkIn.notes,
    });
    console.log('[statsHelpers] Saved weekly check-in for', checkIn.weekStartDate);
  } catch (error) {
    console.error('[statsHelpers] Error saving weekly check-in:', error);
  }
}
