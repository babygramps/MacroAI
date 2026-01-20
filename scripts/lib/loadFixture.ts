/**
 * Fixture Loader Utility
 * 
 * Loads exported user data from the test fixture file.
 * Used by both integration tests and the validation script.
 */

import * as fs from 'fs';
import * as path from 'path';

// Types matching the app's data structures
export interface UserProfile {
  id?: string;
  email?: string;
  calorieGoal?: number;
  proteinGoal?: number;
  carbsGoal?: number;
  fatGoal?: number;
  targetWeightKg?: number;
  preferredWeightUnit?: string;
  preferredUnitSystem?: string;
  heightCm?: number;
  birthDate?: string;
  sex?: 'male' | 'female';
  initialBodyFatPct?: number;
  expenditureStrategy?: string;
  startDate?: string;
  athleteStatus?: boolean;
  goalType?: 'lose' | 'gain' | 'maintain';
  goalRate?: number;
}

export interface WeightLogEntry {
  id: string;
  weightKg: number;
  recordedAt: string;
  note?: string;
}

export interface DailyLog {
  id?: string;
  date: string;
  scaleWeightKg: number | null;
  nutritionCalories: number | null;
  nutritionProteinG: number | null;
  nutritionCarbsG: number | null;
  nutritionFatG: number | null;
  stepCount: number | null;
  logStatus: 'complete' | 'partial' | 'skipped';
}

export interface ComputedState {
  id?: string;
  date: string;
  trendWeightKg: number;
  estimatedTdeeKcal: number;
  rawTdeeKcal: number;
  fluxConfidenceRange: number;
  energyDensityUsed: number;
  weightDeltaKg: number;
}

export interface WeeklyCheckIn {
  id?: string;
  weekStartDate: string;
  weekEndDate: string;
  averageTdee: number;
  suggestedCalories: number;
  adherenceScore: number;
  confidenceLevel: string;
  trendWeightStart: number;
  trendWeightEnd: number;
  weeklyWeightChange: number;
  notes?: string;
}

export interface TestFixture {
  exportedAt: string;
  userProfile: UserProfile | null;
  weightLogs: WeightLogEntry[];
  dailyLogs: DailyLog[];
  computedStates: ComputedState[];
  weeklyCheckIns: WeeklyCheckIn[];
}

export interface RawExportData {
  exportedAt: string;
  scope: string;
  version: string;
  data: {
    UserProfile?: UserProfile[];
    WeightLog?: WeightLogEntry[];
    DailyLog?: DailyLog[];
    ComputedState?: ComputedState[];
    WeeklyCheckIn?: WeeklyCheckIn[];
  };
}

/**
 * Get the path to the test fixture file
 */
export function getFixturePath(): string {
  // Try multiple possible locations
  const possiblePaths = [
    path.join(__dirname, '../../__tests__/fixtures/userData.json'),
    path.join(process.cwd(), '__tests__/fixtures/userData.json'),
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  
  // Return the expected path even if it doesn't exist (for error message)
  return possiblePaths[0];
}

/**
 * Check if the fixture file exists
 */
export function fixtureExists(): boolean {
  return fs.existsSync(getFixturePath());
}

/**
 * Load the test fixture from the JSON file
 * 
 * @returns TestFixture object with normalized data
 * @throws Error if fixture file not found or invalid
 */
export function loadFixture(): TestFixture {
  const fixturePath = getFixturePath();
  
  if (!fs.existsSync(fixturePath)) {
    throw new Error(
      'Fixture not found. Export your data from the app:\n\n' +
      '  1. Go to Settings -> Export -> All data\n' +
      '  2. Save to __tests__/fixtures/userData.json\n\n' +
      `Expected path: ${fixturePath}`
    );
  }
  
  const rawContent = fs.readFileSync(fixturePath, 'utf-8');
  
  let raw: RawExportData;
  try {
    raw = JSON.parse(rawContent);
  } catch {
    throw new Error(`Failed to parse fixture file: ${fixturePath}`);
  }
  
  // Validate structure
  if (!raw.data) {
    throw new Error('Invalid fixture format: missing "data" property');
  }
  
  // Normalize the data
  return {
    exportedAt: raw.exportedAt,
    userProfile: raw.data.UserProfile?.[0] ?? null,
    weightLogs: normalizeWeightLogs(raw.data.WeightLog ?? []),
    dailyLogs: normalizeDailyLogs(raw.data.DailyLog ?? []),
    computedStates: normalizeComputedStates(raw.data.ComputedState ?? []),
    weeklyCheckIns: raw.data.WeeklyCheckIn ?? [],
  };
}

/**
 * Normalize weight log entries
 */
function normalizeWeightLogs(logs: WeightLogEntry[]): WeightLogEntry[] {
  return logs
    .map(log => ({
      id: log.id,
      weightKg: log.weightKg,
      recordedAt: log.recordedAt,
      note: log.note,
    }))
    .toSorted((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
}

/**
 * Normalize daily log entries
 */
function normalizeDailyLogs(logs: DailyLog[]): DailyLog[] {
  return logs
    .map(log => ({
      id: log.id,
      date: log.date,
      scaleWeightKg: log.scaleWeightKg,
      nutritionCalories: log.nutritionCalories,
      nutritionProteinG: log.nutritionProteinG,
      nutritionCarbsG: log.nutritionCarbsG,
      nutritionFatG: log.nutritionFatG,
      stepCount: log.stepCount,
      logStatus: log.logStatus || 'complete',
    }))
    .toSorted((a, b) => a.date.localeCompare(b.date));
}

/**
 * Normalize computed state entries
 */
function normalizeComputedStates(states: ComputedState[]): ComputedState[] {
  return states
    .map(state => ({
      id: state.id,
      date: state.date,
      trendWeightKg: state.trendWeightKg,
      estimatedTdeeKcal: state.estimatedTdeeKcal,
      rawTdeeKcal: state.rawTdeeKcal,
      fluxConfidenceRange: state.fluxConfidenceRange,
      energyDensityUsed: state.energyDensityUsed,
      weightDeltaKg: state.weightDeltaKg,
    }))
    .toSorted((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get summary statistics about the fixture
 */
export function getFixtureSummary(fixture: TestFixture): {
  dateRange: { start: string; end: string } | null;
  totalDays: number;
  weightEntries: number;
  dailyLogEntries: number;
  computedStateEntries: number;
  weeklyCheckIns: number;
} {
  const allDates = [
    ...fixture.weightLogs.map(w => w.recordedAt.split('T')[0]),
    ...fixture.dailyLogs.map(d => d.date),
    ...fixture.computedStates.map(c => c.date),
  ].toSorted();
  
  const uniqueDates = [...new Set(allDates)];
  
  return {
    dateRange: uniqueDates.length > 0
      ? { start: uniqueDates[0], end: uniqueDates[uniqueDates.length - 1] }
      : null,
    totalDays: uniqueDates.length,
    weightEntries: fixture.weightLogs.length,
    dailyLogEntries: fixture.dailyLogs.length,
    computedStateEntries: fixture.computedStates.length,
    weeklyCheckIns: fixture.weeklyCheckIns.length,
  };
}

/**
 * Build Maps for efficient O(1) lookups by date
 */
export function buildDateMaps(fixture: TestFixture): {
  weightByDate: Map<string, number>;
  dailyLogByDate: Map<string, DailyLog>;
  computedStateByDate: Map<string, ComputedState>;
} {
  // Weight by date
  const weightByDate = new Map<string, number>();
  for (const log of fixture.weightLogs) {
    const dateKey = log.recordedAt.split('T')[0];
    weightByDate.set(dateKey, log.weightKg);
  }
  
  // Daily log by date
  const dailyLogByDate = new Map<string, DailyLog>();
  for (const log of fixture.dailyLogs) {
    dailyLogByDate.set(log.date, log);
  }
  
  // Computed state by date
  const computedStateByDate = new Map<string, ComputedState>();
  for (const state of fixture.computedStates) {
    computedStateByDate.set(state.date, state);
  }
  
  return { weightByDate, dailyLogByDate, computedStateByDate };
}

/**
 * Calculate user age from birth date
 */
export function calculateAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
}
