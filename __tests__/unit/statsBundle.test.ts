/**
 * Unit tests for the stats-page single-fetch bundle (Task 13).
 *
 * statsBundle.fetchStatsBundle() loads every dataset the stats page needs
 * EXACTLY ONCE; the derivers below are pure functions of that bundle and
 * reproduce the pre-Task-13 statsHelpers exports' math/composition exactly
 * (see task-13-brief.md). Fixture style mirrors stateChain.test.ts: no
 * Amplify mocking for the derivers themselves (they're pure), a light
 * Amplify mock only for the fetchStatsBundle query-count assertions.
 */

// Mock the Amplify data client (metabolicService.test.ts style) - only used
// by the fetchStatsBundle query-count assertions at the bottom of this file;
// the derivers above never touch it, since they're pure functions of an
// already-fetched StatsBundle.
const mockMealListByLocalDate = jest.fn();
const mockWeightLogList = jest.fn();
const mockComputedStateList = jest.fn();
const mockUserProfileList = jest.fn();

jest.mock('@/lib/data/amplifyClient', () => ({
  getAmplifyDataClient: () => ({
    models: {
      Meal: { listMealByLocalDate: mockMealListByLocalDate },
      WeightLog: { list: mockWeightLogList },
      ComputedState: { list: mockComputedStateList },
      UserProfile: { list: mockUserProfileList },
    },
  }),
}));

import {
  fetchStatsBundle,
  deriveWeeklyStats,
  deriveWeightStats,
  deriveWeightStatsWithTrend,
  deriveDailyLogs,
  deriveMetabolicInsights,
  deriveTdeeHistory,
  calculateAverages,
  calculateWeightChange,
  calculateStreakFromWeekData,
  computeStatesOnTheFlyFromBundle,
  type StatsBundle,
} from '@/lib/stats/statsBundle';
import { calculateColdStartTdee } from '@/lib/expenditureEngine';
import { calculateCalorieTarget } from '@/lib/coachingEngine';
import { calculateTrendWeights } from '@/lib/trendEngine';
import type {
  DayData,
  DailySummary,
  WeightLogEntry,
  ComputedState,
  UserGoals,
} from '@/lib/types';

// --- fixtures ---------------------------------------------------------

const D = (n: number): string => `2026-05-${String(n).padStart(2, '0')}`;

/** Local midnight for a given calendar date (matches fetchStatsBundle's `today`). */
const localDay = (year: number, month: number, day: number): Date => new Date(year, month - 1, day);

/**
 * A timestamp that falls on `day` (YYYY-MM-DD) in LOCAL time, regardless of
 * the test runner's timezone - built from local Date components (like the
 * rest of the app's date handling: formatDateKey, fetchWeekData, etc. all
 * use local getters/setters, never UTC).
 */
const dateAt = (day: string, hour = 8): string => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0).toISOString();
};

function summary(overrides: Partial<DailySummary> = {}): DailySummary {
  return {
    totalCalories: 0,
    totalProtein: 0,
    totalCarbs: 0,
    totalFat: 0,
    meals: [],
    mealCount: 0,
    ...overrides,
  };
}

function loggedDay(date: string, calories = 2000, protein = 150, carbs = 200, fat = 65): DayData {
  return {
    date,
    summary: summary({ totalCalories: calories, totalProtein: protein, totalCarbs: carbs, totalFat: fat, mealCount: 1 }),
  };
}

function emptyDay(date: string): DayData {
  return { date, summary: summary() };
}

function weightEntry(id: string, weightKg: number, recordedAt: string): WeightLogEntry {
  return { id, weightKg, recordedAt };
}

/** Build a `days`-length weekData array ending at `today` (ascending). */
function buildWeekData(today: Date, days: number, loggedIndices: Set<number>): DayData[] {
  const result: DayData[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    result.push(loggedIndices.has(days - 1 - i) ? loggedDay(key) : emptyDay(key));
  }
  return result;
}

const baseGoals = (overrides: Partial<UserGoals> = {}): UserGoals => ({
  calorieGoal: 2000,
  proteinGoal: 150,
  carbsGoal: 200,
  fatGoal: 65,
  preferredWeightUnit: 'kg',
  preferredUnitSystem: 'metric',
  expenditureStrategy: 'dynamic',
  athleteStatus: false,
  goalType: 'maintain',
  goalRate: 0.5,
  ...overrides,
});

function emptyBundle(overrides: Partial<StatsBundle> = {}): StatsBundle {
  const today = localDay(2026, 5, 31);
  return {
    today,
    days: 30,
    userGoals: null,
    weightEntries: [],
    weekData: [],
    computedStates: [],
    ...overrides,
  };
}

// --- calculateAverages --------------------------------------------------

describe('calculateAverages', () => {
  it('returns zeroed averages for empty weekData', () => {
    expect(calculateAverages([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it('only counts days with meals, rounding per the original rules', () => {
    const weekData: DayData[] = [
      loggedDay(D(1), 2000, 150.15, 200.24, 65.05),
      loggedDay(D(2), 2200, 160.05, 210.16, 70.15),
      emptyDay(D(3)), // excluded (mealCount 0)
    ];
    const averages = calculateAverages(weekData);
    // calories: round((2000+2200)/2) = 2100
    // protein: round(((150.15+160.05)/2)*10)/10 = round(155.1*10)/10 = 155.1
    expect(averages).toEqual({
      calories: 2100,
      protein: 155.1,
      carbs: 205.2,
      fat: 67.6,
    });
  });
});

// --- calculateWeightChange -----------------------------------------------

describe('calculateWeightChange', () => {
  it('returns null with fewer than 2 entries', () => {
    expect(calculateWeightChange([], 7)).toBeNull();
    expect(calculateWeightChange([weightEntry('w1', 80, dateAt(D(1)))], 7)).toBeNull();
  });

  it('computes change from entries within the period', () => {
    const now = new Date();
    const twoDaysAgo = new Date(now); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const oneDayAgo = new Date(now); oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const entries = [
      weightEntry('w1', 80, twoDaysAgo.toISOString()),
      weightEntry('w2', 79.4, oneDayAgo.toISOString()),
    ];
    expect(calculateWeightChange(entries, 7)).toBeCloseTo(-0.6, 5);
  });

  it('falls back to first/last entry when too few entries fall in the period', () => {
    // Entries far outside the 7-day window -> fallback path uses entries[0] and entries[last].
    const entries = [
      weightEntry('w1', 82, '2020-01-01T00:00:00.000Z'),
      weightEntry('w2', 80, '2020-02-01T00:00:00.000Z'),
    ];
    expect(calculateWeightChange(entries, 7)).toBeCloseTo(-2, 5);
  });
});

// --- calculateStreakFromWeekData ------------------------------------------

describe('calculateStreakFromWeekData', () => {
  it('returns 0 for no data', () => {
    expect(calculateStreakFromWeekData([])).toBe(0);
  });

  it('allows today to be unlogged and counts backward', () => {
    const weekData = [
      loggedDay(D(1)),
      loggedDay(D(2)),
      loggedDay(D(3)),
      emptyDay(D(4)), // "today" not yet logged - should be skipped, not a break
    ];
    expect(calculateStreakFromWeekData(weekData)).toBe(3);
  });

  it('counts today when it has entries', () => {
    const weekData = [loggedDay(D(1)), loggedDay(D(2))];
    expect(calculateStreakFromWeekData(weekData)).toBe(2);
  });

  it('stops at the first gap once past today', () => {
    const weekData = [
      loggedDay(D(1)),
      emptyDay(D(2)), // gap
      loggedDay(D(3)),
      loggedDay(D(4)), // today, logged
    ];
    expect(calculateStreakFromWeekData(weekData)).toBe(2); // D(4), D(3) then break at D(2)
  });
});

// --- deriveWeeklyStats -----------------------------------------------------

describe('deriveWeeklyStats', () => {
  it('averages the last 7 days and streaks over the full 30-day window', () => {
    const today = localDay(2026, 5, 31);
    // Days 24..30 (the last 7, 0-indexed 23..29) are logged; nothing else.
    const loggedIndices = new Set([23, 24, 25, 26, 27, 28, 29]);
    const weekData = buildWeekData(today, 30, loggedIndices);
    const bundle = emptyBundle({ today, weekData });

    const stats = deriveWeeklyStats(bundle);

    // `days` on WeeklyStats is the 7-day slice (matches the old
    // fetchWeeklyStats, whose `days` field was fetchWeekData(endDate, 7) -
    // only the streak looked at the wider 30-day window).
    expect(stats.days).toHaveLength(7);
    expect(stats.days).toEqual(weekData.slice(-7));
    expect(stats.averages).toEqual(calculateAverages(weekData.slice(-7)));
    expect(stats.streak).toBe(calculateStreakFromWeekData(weekData));
    expect(stats.streak).toBe(7);
  });

  it('handles a fully-empty bundle', () => {
    const bundle = emptyBundle({ weekData: buildWeekData(localDay(2026, 5, 31), 30, new Set()) });
    const stats = deriveWeeklyStats(bundle);
    expect(stats.averages).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
    expect(stats.streak).toBe(0);
  });
});

// --- deriveWeightStats / deriveWeightStatsWithTrend -------------------------

describe('deriveWeightStats', () => {
  it('returns nulls for an empty bundle', () => {
    const stats = deriveWeightStats(emptyBundle());
    expect(stats).toEqual({
      entries: [],
      currentWeight: null,
      changeFromWeekAgo: null,
      changeFromMonthAgo: null,
    });
  });

  it('derives currentWeight from the latest entry', () => {
    const entries = [
      weightEntry('w1', 82, '2026-03-01T00:00:00.000Z'),
      weightEntry('w2', 80, '2026-05-30T00:00:00.000Z'),
    ];
    const stats = deriveWeightStats(emptyBundle({ weightEntries: entries }));
    expect(stats.currentWeight).toBe(80);
    expect(stats.entries).toBe(entries);
  });
});

describe('deriveWeightStatsWithTrend', () => {
  it('returns null trend fields when there are no weight entries', () => {
    const stats = deriveWeightStatsWithTrend(emptyBundle());
    expect(stats.trendWeight).toBeNull();
    expect(stats.trendData).toEqual([]);
    expect(stats.trendChangeFromWeekAgo).toBeNull();
  });

  it('matches hand-computed EMA trend for a two-point series', () => {
    // Day1: 80kg, Day2 (next day): 79kg. alpha=0.1 (METABOLIC_CONSTANTS default).
    // trend Day1 = 80 (initial = first entry's weight, EMA(80,80)=80)
    // trend Day2 = 79*0.1 + 80*0.9 = 79.9
    const today = localDay(2026, 5, 31);
    const entries = [
      weightEntry('w1', 80, dateAt(D(30))),
      weightEntry('w2', 79, dateAt(D(31))),
    ];
    const bundle = emptyBundle({ today, weightEntries: entries });

    const stats = deriveWeightStatsWithTrend(bundle);

    expect(stats.trendData.map(p => p.trendWeight)).toEqual([80, 79.9]);
    expect(stats.trendWeight).toBe(79.9);
    expect(stats.trendChangeFromWeekAgo).toBeCloseTo(-0.1, 5);
  });
});

// --- deriveDailyLogs ---------------------------------------------------------

describe('deriveDailyLogs', () => {
  it('marks days with meals complete and merges same-day scale weight', () => {
    const today = localDay(2026, 5, 31);
    const weekData = [loggedDay(D(30), 1800), emptyDay(D(31))];
    const weightEntries = [weightEntry('w1', 79.5, dateAt(D(30)))];
    const bundle = emptyBundle({ today, days: 2, weekData, weightEntries });

    const logs = deriveDailyLogs(bundle, 2);

    expect(logs).toEqual([
      {
        date: D(30),
        scaleWeightKg: 79.5,
        nutritionCalories: 1800,
        nutritionProteinG: 150,
        nutritionCarbsG: 200,
        nutritionFatG: 65,
        stepCount: null,
        logStatus: 'complete',
      },
      {
        date: D(31),
        scaleWeightKg: null,
        nutritionCalories: null,
        nutritionProteinG: null,
        nutritionCarbsG: null,
        nutritionFatG: null,
        stepCount: null,
        logStatus: 'skipped',
      },
    ]);
  });

  it('slices the last N days from a wider bundle window', () => {
    const today = localDay(2026, 5, 31);
    const weekData = buildWeekData(today, 30, new Set([29])); // only "today" logged
    const bundle = emptyBundle({ today, weekData });

    const logs7 = deriveDailyLogs(bundle, 7);
    expect(logs7).toHaveLength(7);
    expect(logs7[6].logStatus).toBe('complete'); // today
    expect(logs7[0].logStatus).toBe('skipped');
  });
});

// --- deriveTdeeHistory --------------------------------------------------------

describe('deriveTdeeHistory', () => {
  it('returns an empty array when there are no computed states', () => {
    expect(deriveTdeeHistory(emptyBundle())).toEqual([]);
  });

  it('maps stored/computed states to TdeeDataPoint, nulling rawTdee when held', () => {
    const computedStates: ComputedState[] = [
      {
        date: D(1),
        trendWeightKg: 80,
        estimatedTdeeKcal: 2500,
        rawTdeeKcal: 2500, // held day: raw === estimated
        fluxConfidenceRange: 450,
        energyDensityUsed: 7700,
        weightDeltaKg: 0,
      },
      {
        date: D(2),
        trendWeightKg: 79.9,
        estimatedTdeeKcal: 2510,
        rawTdeeKcal: 2600, // real update day: raw !== estimated
        fluxConfidenceRange: 400,
        energyDensityUsed: 7700,
        weightDeltaKg: -0.1,
      },
    ];
    const history = deriveTdeeHistory(emptyBundle({ computedStates }));
    expect(history).toEqual([
      { date: D(1), rawTdee: null, smoothedTdee: 2500, fluxConfidenceRange: 450 },
      { date: D(2), rawTdee: 2600, smoothedTdee: 2510, fluxConfidenceRange: 400 },
    ]);
  });
});

// --- deriveMetabolicInsights ---------------------------------------------------

describe('deriveMetabolicInsights', () => {
  it('returns null when there are no user goals', () => {
    expect(deriveMetabolicInsights(emptyBundle({ userGoals: null }))).toBeNull();
  });

  it('cold start: uses Mifflin-St Jeor TDEE and reports null weeklyCheckIn', () => {
    const today = localDay(2026, 5, 31);
    // Only 3 of 30 days logged -> daysTracked (3) < COLD_START_DAYS (7).
    const weekData = buildWeekData(today, 30, new Set([27, 28, 29]));
    const userGoals = baseGoals({ heightCm: 175, birthDate: '1990-06-01', sex: 'male' });
    const weightEntries = [
      weightEntry('w1', 80, dateAt(D(30))),
      weightEntry('w2', 79.8, dateAt(D(31))),
    ];
    const bundle = emptyBundle({ today, weekData, userGoals, weightEntries, computedStates: [] });

    const insights = deriveMetabolicInsights(bundle);
    expect(insights).not.toBeNull();

    const expectedColdStartTdee = calculateColdStartTdee(userGoals, 79.8);
    expect(insights!.isInColdStart).toBe(true);
    expect(insights!.coldStartTdee).toBe(expectedColdStartTdee);
    expect(insights!.currentTdee).toBe(expectedColdStartTdee);
    expect(insights!.daysTracked).toBe(3);
    expect(insights!.daysUntilAccurate).toBe(4);
    expect(insights!.confidenceLevel).toBe('learning');
    expect(insights!.weeklyCheckIn).toBeNull();
  });

  it('warmed up: uses the latest computed-state TDEE and builds a weekly check-in', () => {
    const today = localDay(2026, 5, 31);
    // All 30 days logged -> daysTracked 30, recentMissingDays 0 -> confidence 'high'.
    const weekData = buildWeekData(today, 30, new Set(Array.from({ length: 30 }, (_, i) => i)));
    const userGoals = baseGoals({ goalType: 'lose', goalRate: 0.5 });
    const weightEntries = [
      weightEntry('w1', 80, dateAt(D(25))),
      weightEntry('w2', 79, dateAt(D(31))),
    ];
    // Last 7 dates must line up with weekData's last 7 keys (D(25)..D(31)).
    const computedStates: ComputedState[] = [D(25), D(26), D(27), D(28), D(29), D(30), D(31)].map((date, i) => ({
      date,
      trendWeightKg: 80 - i * 0.15,
      estimatedTdeeKcal: 2400 + i * 10,
      rawTdeeKcal: 2400 + i * 10,
      fluxConfidenceRange: 150,
      energyDensityUsed: 7700,
      weightDeltaKg: -0.15,
    }));
    const bundle = emptyBundle({ today, weekData, userGoals, weightEntries, computedStates });

    const insights = deriveMetabolicInsights(bundle);
    expect(insights).not.toBeNull();
    expect(insights!.isInColdStart).toBe(false);
    expect(insights!.daysTracked).toBe(30);
    expect(insights!.confidenceLevel).toBe('high');
    expect(insights!.currentTdee).toBe(2460); // last computed state (i=6): 2400+60
    expect(insights!.fluxConfidenceRange).toBe(150);

    const expectedSuggested = calculateCalorieTarget(2460, 'lose', 0.5);
    expect(insights!.suggestedCalories).toBe(expectedSuggested);
    expect(insights!.weeklyCheckIn).not.toBeNull();
    expect(insights!.weeklyCheckIn!.suggestedCalories).toBe(expectedSuggested);
    expect(insights!.weeklyCheckIn!.adherenceScore).toBe(1); // all 7 days complete
  });
});

// --- computeStatesOnTheFlyFromBundle (the compute-on-the-fly fallback) --------

describe('computeStatesOnTheFlyFromBundle', () => {
  it('returns an empty array when there is no weight data', () => {
    const today = localDay(2026, 5, 31);
    const states = computeStatesOnTheFlyFromBundle({
      today,
      days: 30,
      weekData: buildWeekData(today, 30, new Set()),
      weightEntries: [],
      userGoals: null,
    });
    expect(states).toEqual([]);
  });

  it('matches computeStateChain fed the same windowed trend/log data (no hidden fetches)', () => {
    const today = localDay(2026, 5, 31);
    const days = 3;
    const weekData = [loggedDay(D(29), 2600), loggedDay(D(30), 2600), loggedDay(D(31), 2600)];
    // One entry OUTSIDE the 3-day window (should be excluded from the trend calc).
    const weightEntries = [
      weightEntry('old', 90, '2020-01-01T00:00:00.000Z'),
      weightEntry('w1', 80, dateAt(D(29))),
      weightEntry('w2', 80, dateAt(D(30))),
      weightEntry('w3', 80, dateAt(D(31))),
    ];
    const userGoals = baseGoals({ heightCm: 175, birthDate: '1990-06-01', sex: 'male' });

    const states = computeStatesOnTheFlyFromBundle({ today, days, weekData, weightEntries, userGoals });

    // Windowed (in-window) entries only: the 2020 entry must not affect the series length/start.
    const windowStart = new Date(today); windowStart.setDate(windowStart.getDate() - days);
    const windowedEntries = weightEntries.filter(e => new Date(e.recordedAt) >= windowStart);
    const expectedTrend = calculateTrendWeights(windowedEntries, windowStart, today);
    expect(states).toHaveLength(expectedTrend.length);
    expect(states.map(s => s.date)).toEqual(expectedTrend.map(p => p.date));

    // prevTdee should have been seeded from the cold-start estimate using the
    // EARLIEST in-window entry's weight (80), not the excluded 2020 entry (90).
    const expectedColdStart = calculateColdStartTdee(userGoals, 80);

    // The trend series (inclusive [today-days, today]) has one more day than
    // the meal-data window (fetchWeekData(today, days)) - D28 has no
    // DailyLog, so it holds the seeded cold-start TDEE exactly. This mirrors
    // the original statsHelpers.computeStatesOnTheFly's own trend/log window
    // mismatch, not a regression introduced by bundling.
    expect(states[0].date).toBe('2026-05-28');
    expect(states[0].estimatedTdeeKcal).toBe(expectedColdStart);
    expect(states[0].rawTdeeKcal).toBe(expectedColdStart);

    // Day 2 (D29, the first day with a real DailyLog) updates from that held
    // prevTdee: rawTdee = calories(2600) - weightDelta(0)*density -> smoothed.
    const expectedDay2 = Math.round(2600 * 0.05 + (expectedColdStart ?? 2000) * 0.95);
    expect(states[1].date).toBe(D(29));
    expect(states[1].estimatedTdeeKcal).toBe(expectedDay2);
  });
});

// --- fetchStatsBundle (query-count dedup) -------------------------------------
//
// Direct evidence for the task's core claim: each dataset is fetched exactly
// once per fetchStatsBundle() call, even when the ComputedState fallback has
// to run the compute-on-the-fly path (which must consume zero extra fetches).

describe('fetchStatsBundle (query dedup)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMealListByLocalDate.mockResolvedValue({ data: [], nextToken: null });
    mockWeightLogList.mockResolvedValue({ data: [] });
    mockComputedStateList.mockResolvedValue({ data: [] });
    mockUserProfileList.mockResolvedValue({ data: [] });
  });

  it('fetches user goals, weight history, and computed states exactly once each, and meals once per day', async () => {
    await fetchStatsBundle(30);

    expect(mockUserProfileList).toHaveBeenCalledTimes(1);
    expect(mockWeightLogList).toHaveBeenCalledTimes(1);
    expect(mockComputedStateList).toHaveBeenCalledTimes(1);
    // One query per day for the 30-day meal window (the localDate GSI has no
    // range key, so this can't be collapsed further) - and NOT re-fetched by
    // any deriver, since none of them touch the Amplify client.
    expect(mockMealListByLocalDate).toHaveBeenCalledTimes(30);
  });

  it('does not issue any extra fetches when the on-the-fly ComputedState fallback runs', async () => {
    mockUserProfileList.mockResolvedValue({
      data: [{ calorieGoal: 2000, heightCm: 175, birthDate: '1990-06-01', sex: 'male' }],
    });
    mockWeightLogList.mockResolvedValue({
      data: [
        { id: 'w1', weightKg: 80, recordedAt: new Date().toISOString() },
        { id: 'w2', weightKg: 79.5, recordedAt: new Date().toISOString() },
      ],
    });
    mockComputedStateList.mockResolvedValue({ data: [] }); // forces the fallback

    const bundle = await fetchStatsBundle(30);

    // Fallback actually ran (produced states from the fetched weight data)...
    expect(bundle.computedStates.length).toBeGreaterThan(0);
    // ...without calling any fetcher more than once.
    expect(mockUserProfileList).toHaveBeenCalledTimes(1);
    expect(mockWeightLogList).toHaveBeenCalledTimes(1);
    expect(mockComputedStateList).toHaveBeenCalledTimes(1);
    expect(mockMealListByLocalDate).toHaveBeenCalledTimes(30);
  });

  it('the requested 30-day window totals ~35 queries (30 meal-days + weight + computed-states + profile)', async () => {
    await fetchStatsBundle(30);
    const totalQueries =
      mockUserProfileList.mock.calls.length +
      mockWeightLogList.mock.calls.length +
      mockComputedStateList.mock.calls.length +
      mockMealListByLocalDate.mock.calls.length;
    expect(totalQueries).toBe(33);
  });
});
