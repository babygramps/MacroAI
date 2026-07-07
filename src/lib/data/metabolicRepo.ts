/**
 * Metabolic Repo
 *
 * Shared, client-side data-access layer for the metabolic domain: fetchers,
 * row mappers, and the `listAllPages` pagination helper used by both
 * statsHelpers.ts and metabolicService.ts.
 *
 * Every fetcher takes the Amplify client as a parameter, defaulting to
 * getAmplifyDataClient(), so existing (client-side) callers don't change
 * behavior, but a server client could be injected later.
 *
 * Extracted in Task 6 of the core-separation refactor to eliminate
 * fetchers/mappers that had drifted apart between statsHelpers.ts and
 * metabolicService.ts. See task-6-report.md for the full reconciliation
 * of each duplicate pair; the mapper doc comments below summarize the
 * canonical choice for each divergence found.
 */

import { getAmplifyDataClient } from './amplifyClient';
import type { UserGoals, WeightLogEntry, DailyLog, ComputedState, LogStatus } from '@/lib/types';

type AmplifyClient = ReturnType<typeof getAmplifyDataClient>;

// ============================================
// Pagination
// ============================================

/**
 * Fetch ALL pages from an Amplify list/query operation.
 * Amplify's list() returns only one page of results from DynamoDB.
 * Without this, scan-based queries can miss records as the table grows.
 *
 * Moved from statsHelpers.ts (was private there); promoted here so any
 * fetcher in this module can opt into full pagination.
 */
export async function listAllPages<T>(
  queryFn: (nextToken?: string | null) => Promise<{ data: T[]; nextToken?: string | null }>
): Promise<T[]> {
  const allItems: T[] = [];
  let currentToken: string | null | undefined = undefined;

  do {
    const result = await queryFn(currentToken);
    if (result.data) {
      allItems.push(...result.data);
    }
    currentToken = result.nextToken ?? null;
  } while (currentToken);

  return allItems;
}

// ============================================
// UserGoals (Amplify UserProfile -> domain UserGoals)
// ============================================

interface UserProfileRecord {
  calorieGoal?: number | null;
  proteinGoal?: number | null;
  carbsGoal?: number | null;
  fatGoal?: number | null;
  targetWeightKg?: number | null;
  preferredWeightUnit?: string | null;
  preferredUnitSystem?: string | null;
  heightCm?: number | null;
  birthDate?: string | null;
  sex?: string | null;
  initialBodyFatPct?: number | null;
  expenditureStrategy?: string | null;
  startDate?: string | null;
  athleteStatus?: boolean | null;
  goalType?: string | null;
  goalRate?: number | null;
}

/**
 * Map an Amplify UserProfile record to the domain UserGoals shape.
 *
 * Reconciled divergence (statsHelpers vs metabolicService copies): when
 * `preferredUnitSystem` isn't set, statsHelpers derived it from the legacy
 * `preferredWeightUnit` field ('lbs' -> 'imperial', else 'metric');
 * metabolicService's copy defaulted unconditionally to 'metric', silently
 * ignoring a user's legacy lbs preference. statsHelpers' behavior is
 * canonical and is what's implemented below.
 */
export function mapUserProfileToGoals(profile: UserProfileRecord): UserGoals {
  const unitSystem = (profile.preferredUnitSystem as UserGoals['preferredUnitSystem']) ??
    (profile.preferredWeightUnit === 'lbs' ? 'imperial' : 'metric');

  return {
    calorieGoal: profile.calorieGoal ?? 2000,
    proteinGoal: profile.proteinGoal ?? 150,
    carbsGoal: profile.carbsGoal ?? 200,
    fatGoal: profile.fatGoal ?? 65,
    targetWeightKg: profile.targetWeightKg ?? undefined,
    preferredWeightUnit: (profile.preferredWeightUnit as 'kg' | 'lbs') ?? 'kg',
    preferredUnitSystem: unitSystem,
    // Metabolic modeling fields
    heightCm: profile.heightCm ?? undefined,
    birthDate: profile.birthDate ?? undefined,
    sex: (profile.sex as 'male' | 'female') ?? undefined,
    initialBodyFatPct: profile.initialBodyFatPct ?? undefined,
    expenditureStrategy: (profile.expenditureStrategy as 'static' | 'dynamic') ?? 'dynamic',
    startDate: profile.startDate ?? undefined,
    athleteStatus: profile.athleteStatus ?? false,
    goalType: (profile.goalType as 'lose' | 'gain' | 'maintain') ?? 'maintain',
    goalRate: profile.goalRate ?? 0.5,
  };
}

/**
 * Fetch the current user's goals. Only one UserProfile row exists per user,
 * so this reads a single (unpaginated) page and takes the first row.
 */
export async function fetchUserGoals(
  client: AmplifyClient = getAmplifyDataClient()
): Promise<UserGoals | null> {
  if (!client) {
    return null;
  }
  try {
    const { data: profiles } = await client.models.UserProfile.list();
    if (profiles && profiles.length > 0) {
      return mapUserProfileToGoals(profiles[0]);
    }
    return null;
  } catch (error) {
    console.error('[metabolicRepo] Error fetching user goals:', error);
    return null;
  }
}

// ============================================
// Weight history (Amplify WeightLog -> domain WeightLogEntry)
// ============================================

interface WeightLogRecord {
  id: string;
  weightKg: number;
  recordedAt: string;
  note?: string | null;
}

/**
 * Map an Amplify WeightLog record to the domain WeightLogEntry shape.
 * Identical in both former copies - no divergence to reconcile here.
 */
export function mapWeightLogToEntry(log: WeightLogRecord): WeightLogEntry {
  return {
    id: log.id,
    weightKg: log.weightKg,
    recordedAt: log.recordedAt,
    note: log.note ?? undefined,
  };
}

/**
 * Fetch weight log entries recorded between startDate and endDate
 * (inclusive), sorted ascending by recordedAt.
 *
 * statsHelpers previously exposed this as `fetchWeightHistory(days)`,
 * computing the range internally; metabolicService took an explicit
 * (startDate, endDate) pair. This canonical version takes the explicit
 * range (metabolicService's shape); statsHelpers now wraps it with a
 * `days`-based convenience function that computes the range and delegates
 * here, preserving its existing public signature for external callers.
 */
export async function fetchWeightHistory(
  startDate: Date,
  endDate: Date,
  client: AmplifyClient = getAmplifyDataClient()
): Promise<WeightLogEntry[]> {
  if (!client) {
    return [];
  }
  try {
    const { data: logs } = await client.models.WeightLog.list({
      filter: {
        recordedAt: {
          between: [startDate.toISOString(), endDate.toISOString()],
        },
      },
    });

    if (!logs || logs.length === 0) {
      return [];
    }

    const entries = logs.map(mapWeightLogToEntry);
    entries.sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
    return entries;
  } catch (error) {
    console.error('[metabolicRepo] Error fetching weight history:', error);
    return [];
  }
}

// ============================================
// DailyLog range (Amplify DailyLog -> domain DailyLog)
// ============================================

interface DailyLogRecord {
  date: string;
  scaleWeightKg?: number | null;
  nutritionCalories?: number | null;
  nutritionProteinG?: number | null;
  nutritionCarbsG?: number | null;
  nutritionFatG?: number | null;
  stepCount?: number | null;
  logStatus?: string | null;
}

/**
 * Map an Amplify DailyLog record to the domain DailyLog shape.
 *
 * Note: this mapper (only ever implemented in metabolicService) does not
 * carry the row's `id` through, even though DailyLog.id is optional in the
 * domain type. Preserved as-is (no current consumer reads it), but flagged
 * here for Task 8 (batched diffed writes will likely need row ids).
 */
export function mapDailyLogToDomain(log: DailyLogRecord): DailyLog {
  return {
    date: log.date,
    scaleWeightKg: log.scaleWeightKg ?? null,
    nutritionCalories: log.nutritionCalories ?? null,
    nutritionProteinG: log.nutritionProteinG ?? null,
    nutritionCarbsG: log.nutritionCarbsG ?? null,
    nutritionFatG: log.nutritionFatG ?? null,
    stepCount: log.stepCount ?? null,
    logStatus: (log.logStatus as LogStatus) ?? 'skipped',
  };
}

/**
 * Fetch persisted DailyLog rows (the Amplify `DailyLog` model, populated by
 * metabolicService's aggregateDailyNutrition) for a date-key range
 * [startDateKey, endDateKey], sorted ascending by date.
 *
 * This is distinct from statsHelpers.fetchDailyLogs, which synthesizes
 * DailyLog-shaped objects on the fly from Meal + WeightLog data and never
 * reads this table - see task-6 report for why those were NOT unified.
 */
export async function fetchDailyLogsRange(
  startDateKey: string,
  endDateKey: string,
  client: AmplifyClient = getAmplifyDataClient()
): Promise<DailyLog[]> {
  if (!client) {
    return [];
  }
  try {
    const { data: logs } = await client.models.DailyLog.list({
      filter: {
        date: {
          between: [startDateKey, endDateKey],
        },
      },
    });

    if (!logs) {
      return [];
    }

    const result = logs.map(mapDailyLogToDomain);
    result.sort((a, b) => a.date.localeCompare(b.date));
    return result;
  } catch (error) {
    console.error('[metabolicRepo] Error fetching daily logs range:', error);
    return [];
  }
}

// ============================================
// ComputedState (Amplify ComputedState -> domain ComputedState)
// ============================================

interface ComputedStateRecord {
  id: string;
  date: string;
  trendWeightKg: number;
  estimatedTdeeKcal: number;
  rawTdeeKcal?: number | null;
  fluxConfidenceRange?: number | null;
  energyDensityUsed?: number | null;
  weightDeltaKg?: number | null;
}

/**
 * Map an Amplify ComputedState record to the domain ComputedState shape.
 * Only statsHelpers had a full mapper for this; metabolicService only ever
 * read raw `.id`/`.date` off the list result (to build an existing-state
 * lookup map), so there was no full-mapping divergence to reconcile.
 */
export function mapComputedStateToDomain(state: ComputedStateRecord): ComputedState {
  return {
    id: state.id,
    date: state.date,
    trendWeightKg: state.trendWeightKg,
    estimatedTdeeKcal: state.estimatedTdeeKcal,
    rawTdeeKcal: state.rawTdeeKcal ?? state.estimatedTdeeKcal,
    fluxConfidenceRange: state.fluxConfidenceRange ?? 200,
    energyDensityUsed: state.energyDensityUsed ?? 7700,
    weightDeltaKg: state.weightDeltaKg ?? 0,
  };
}

/**
 * Fetch persisted ComputedState rows for a date-key range, mapped to the
 * domain shape and sorted ascending by date.
 *
 * Deliberately does NOT swallow errors internally (unlike fetchUserGoals /
 * fetchWeightHistory above): its two call sites need different behavior on
 * failure and each already has its own enclosing try/catch -
 * statsHelpers.fetchComputedStates falls back to on-the-fly computation
 * only when the query truly returned zero rows, not when it threw; letting
 * the error propagate there preserves its original "error -> return []
 * immediately, no fallback" behavior. metabolicService.recalculateTdeeFromDate
 * aborts the whole recalculation (returns 0) on any error in its Promise.all,
 * which this also preserves by propagating rather than swallowing.
 */
export async function fetchComputedStates(
  startDateKey: string,
  endDateKey: string,
  client: AmplifyClient = getAmplifyDataClient()
): Promise<ComputedState[]> {
  if (!client) {
    return [];
  }
  const { data: storedStates } = await client.models.ComputedState.list({
    filter: {
      date: {
        between: [startDateKey, endDateKey],
      },
    },
  });

  if (!storedStates) {
    return [];
  }

  const states = storedStates.map(mapComputedStateToDomain);
  states.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return states;
}
