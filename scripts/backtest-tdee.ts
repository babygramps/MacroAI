/**
 * TDEE Backtest / A/B Harness
 *
 * Compares the CURRENT production estimator (trend-weight EMA + symmetric
 * back-solve + EMA smoothing + outlier rejection) against the PROTOTYPE Kalman
 * filter, on synthetic ground-truth data where the true TDEE is known.
 *
 * It answers two questions the plan set out:
 *   1. Does the symmetric-density fix remove the upward bias? (see the
 *      "stable-weight oscillation" scenario — bias should be ~0.)
 *   2. Is the Kalman filter worth integrating? (compare MAE / RMSE / bias /
 *      volatility, and convergence lag on the step scenario.)
 *
 * Run: npm run backtest:tdee
 *
 * This is evaluation tooling. It imports the real engine functions so the
 * "current" column reflects production behavior, and it does not touch any
 * database or production state.
 */

import { updateTrendWeight } from '../src/lib/trendEngine';
import { buildComputedState } from '../src/lib/expenditureEngine';
import { validateDailyLogForTdee, dampWhooshEffect } from '../src/lib/edgeCaseHandler';
import { runKalmanFilter, DEFAULT_KALMAN_PARAMS } from '../src/lib/kalmanExpenditure';
import type { DailyLog } from '../src/lib/types';
import { fixtureExists, loadFixture, buildDateMaps, getFixtureSummary } from './lib/loadFixture';

const RHO = DEFAULT_KALMAN_PARAMS.energyDensity; // 7700
const WARMUP_DAYS = 21; // exclude the initial convergence period from scoring

// ============================================
// Seeded PRNG (reproducible runs)
// ============================================

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number, mean: number, sd: number): number {
  // Box-Muller
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + sd * z;
}

// ============================================
// Synthetic data
// ============================================

interface SynthDay {
  trueTdee: number;
  loggedIntake: number | null; // what the estimators see
  measuredWeight: number | null; // what the estimators see
}

interface Scenario {
  name: string;
  description: string;
  days: SynthDay[];
  trueTdee: number[]; // ground truth per day (for scoring)
  stepDay?: number; // day index of a regime change, for lag measurement
}

interface GenOptions {
  n: number;
  tdeeAt: (day: number) => number;
  deficit: number; // true daily deficit (intake below true TDEE); 0 = weight-stable
  weightNoiseSd: number;
  missingWeightRate: number;
  mislogRate: number; // fraction of days with under-logged intake
  seed: number;
}

function generateScenario(name: string, description: string, opts: GenOptions, stepDay?: number): Scenario {
  const rng = mulberry32(opts.seed);
  const days: SynthDay[] = [];
  const trueTdee: number[] = [];

  let trueWeight = 85;
  for (let i = 0; i < opts.n; i++) {
    const tdee = opts.tdeeAt(i);
    trueTdee.push(tdee);

    const trueIntake = tdee - opts.deficit;
    // Occasional under-logging (e.g. forgot dinner): estimators see less than truth.
    const misLogged = rng() < opts.mislogRate;
    const loggedIntake = misLogged ? Math.round(trueIntake * 0.6) : trueIntake;

    const missing = rng() < opts.missingWeightRate;
    const measuredWeight = missing ? null : round2(gaussian(rng, trueWeight, opts.weightNoiseSd));

    days.push({ trueTdee: tdee, loggedIntake, measuredWeight });

    // True weight evolves from TRUE intake, next day.
    trueWeight = trueWeight + (trueIntake - tdee) / RHO;
  }

  return { name, description, days, trueTdee, stepDay };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

// ============================================
// Estimator A: current production pipeline
// ============================================

function recentVariance(values: number[]): number {
  const w = values.slice(-7);
  if (w.length < 2) return 0;
  const mean = w.reduce((s, x) => s + x, 0) / w.length;
  return w.reduce((s, x) => s + (x - mean) ** 2, 0) / w.length;
}

function runCurrentEstimator(days: SynthDay[], initialTdee: number): number[] {
  // 1. Trend weight via the real EMA (missing days hold the trend).
  const trend: number[] = [];
  let prevTrend = firstDefined(days.map((d) => d.measuredWeight)) ?? 85;
  for (const d of days) {
    prevTrend = updateTrendWeight(prevTrend, d.measuredWeight);
    trend.push(prevTrend);
  }

  // 2. Per-day back-solve, mirroring recalculateTdeeFromDate / computeStatesOnTheFly.
  let prevTdee = initialTdee;
  const recentRawTdees: number[] = [];
  let consecutiveOutlierCount = 0;
  let validDays = 0;
  const estimates: number[] = [];

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const date = `d${i}`;
    const dailyLog: DailyLog =
      day.loggedIntake === null
        ? emptyLog(date)
        : {
            date,
            scaleWeightKg: day.measuredWeight,
            nutritionCalories: day.loggedIntake,
            nutritionProteinG: null,
            nutritionCarbsG: null,
            nutritionFatG: null,
            stepCount: null,
            logStatus: 'complete',
          };

    // Whoosh damping when both scale weights are present (as in production).
    let weightDeltaOverride: number | undefined;
    if (i > 0 && day.measuredWeight !== null && days[i - 1].measuredWeight !== null) {
      const scaleDelta = day.measuredWeight - (days[i - 1].measuredWeight as number);
      const trendDelta = trend[i] - trend[i - 1];
      weightDeltaOverride = dampWhooshEffect(scaleDelta, trendDelta);
    }

    const state = buildComputedState(
      date,
      trend[i],
      i > 0 ? trend[i - 1] : trend[i],
      dailyLog,
      prevTdee,
      undefined,
      validDays,
      recentVariance(recentRawTdees),
      weightDeltaOverride,
      { recentRawTdees: recentRawTdees.slice(-7), consecutiveOutlierCount }
    );

    const isValid = dailyLog.nutritionCalories !== null && validateDailyLogForTdee(dailyLog, prevTdee).isValid;

    if (state.wasOutlierExcluded) consecutiveOutlierCount++;
    else if (isValid) consecutiveOutlierCount = 0;

    if (isValid && state.rawTdeeKcal !== state.estimatedTdeeKcal) recentRawTdees.push(state.rawTdeeKcal);
    if (isValid) validDays++;

    prevTdee = state.estimatedTdeeKcal;
    estimates.push(prevTdee);
  }

  return estimates;
}

function emptyLog(date: string): DailyLog {
  return {
    date,
    scaleWeightKg: null,
    nutritionCalories: null,
    nutritionProteinG: null,
    nutritionCarbsG: null,
    nutritionFatG: null,
    stepCount: null,
    logStatus: 'skipped',
  };
}

function firstDefined<T>(arr: (T | null)[]): T | null {
  for (const v of arr) if (v !== null) return v;
  return null;
}

// ============================================
// Estimator B: Kalman prototype
// ============================================

function runKalmanEstimator(days: SynthDay[], initialTdee: number): number[] {
  const states = runKalmanFilter(
    days.map((d) => ({ intakeKcal: d.loggedIntake, weightKg: d.measuredWeight })),
    DEFAULT_KALMAN_PARAMS,
    initialTdee
  );
  return states.map((s) => s.tdee);
}

// ============================================
// Metrics
// ============================================

interface Metrics {
  mae: number;
  rmse: number;
  bias: number;
  volatility: number;
  convergenceLag: number | null;
}

function scoreAgainstTruth(est: number[], truth: number[], stepDay?: number): Metrics {
  let sumAbs = 0;
  let sumSq = 0;
  let sumBias = 0;
  let count = 0;
  for (let i = WARMUP_DAYS; i < est.length; i++) {
    const err = est[i] - truth[i];
    sumAbs += Math.abs(err);
    sumSq += err * err;
    sumBias += err;
    count++;
  }
  let volSum = 0;
  let volCount = 0;
  for (let i = Math.max(1, WARMUP_DAYS); i < est.length; i++) {
    volSum += Math.abs(est[i] - est[i - 1]);
    volCount++;
  }

  let convergenceLag: number | null = null;
  if (stepDay !== undefined) {
    for (let i = stepDay; i < est.length; i++) {
      if (Math.abs(est[i] - truth[i]) < 100) {
        convergenceLag = i - stepDay;
        break;
      }
    }
  }

  return {
    mae: count ? sumAbs / count : 0,
    rmse: count ? Math.sqrt(sumSq / count) : 0,
    bias: count ? sumBias / count : 0,
    volatility: volCount ? volSum / volCount : 0,
    convergenceLag,
  };
}

// ============================================
// Reporting
// ============================================

function fmt(x: number, digits = 1): string {
  return x.toFixed(digits).padStart(8);
}

function printScenario(scn: Scenario, current: Metrics, kalman: Metrics): void {
  console.log(`\n### ${scn.name}`);
  console.log(`    ${scn.description}`);
  console.log(`    (${scn.days.length} days; metrics scored after a ${WARMUP_DAYS}-day warmup)`);
  console.log('');
  console.log('    Metric            Current     Kalman     Winner');
  console.log('    ----------------------------------------------');
  row('MAE (kcal)', current.mae, kalman.mae, true);
  row('RMSE (kcal)', current.rmse, kalman.rmse, true);
  row('Bias (kcal)', current.bias, kalman.bias, true, true);
  row('Volatility (kcal/day)', current.volatility, kalman.volatility, true);
  if (scn.stepDay !== undefined) {
    const c = current.convergenceLag;
    const k = kalman.convergenceLag;
    console.log(
      `    ${'Conv. lag (days)'.padEnd(18)}${(c ?? NaN).toString().padStart(8)}   ${(k ?? NaN)
        .toString()
        .padStart(8)}     ${lagWinner(c, k)}`
    );
  }

  function row(label: string, c: number, k: number, lowerBetter: boolean, absCompare = false): void {
    const cCmp = absCompare ? Math.abs(c) : c;
    const kCmp = absCompare ? Math.abs(k) : k;
    let winner = '=';
    if (Math.abs(cCmp - kCmp) > 0.5) winner = (lowerBetter ? cCmp < kCmp : cCmp > kCmp) ? 'Current' : 'Kalman';
    console.log(`    ${label.padEnd(18)}${fmt(c)}   ${fmt(k)}     ${winner}`);
  }
}

function lagWinner(c: number | null, k: number | null): string {
  if (c === null && k === null) return '—';
  if (c === null) return 'Kalman';
  if (k === null) return 'Current';
  return c < k ? 'Current' : c > k ? 'Kalman' : '=';
}

// ============================================
// Main
// ============================================

function main(): void {
  console.log('='.repeat(64));
  console.log('TDEE BACKTEST — current production estimator vs Kalman prototype');
  console.log('='.repeat(64));

  const scenarios: Scenario[] = [
    generateScenario(
      'Stable weight + noise (bias check)',
      'True TDEE flat at 2600, eating at maintenance; only scale oscillation, no under-logging. Bias should be ~0 with the symmetric density (pre-fix this drifted upward).',
      { n: 160, tdeeAt: () => 2600, deficit: 0, weightNoiseSd: 0.5, missingWeightRate: 0.2, mislogRate: 0, seed: 101 }
    ),
    generateScenario(
      'Step change (responsiveness)',
      'True TDEE 2700 for 60 days, then drops to 2400 (e.g. new job, less activity).',
      {
        n: 160,
        tdeeAt: (d) => (d < 60 ? 2700 : 2400),
        deficit: 300,
        weightNoiseSd: 0.4,
        missingWeightRate: 0.25,
        mislogRate: 0.05,
        seed: 202,
      },
      60
    ),
    generateScenario(
      'Gradual adaptation',
      'True TDEE drifts 2650 -> 2350 linearly over the period (metabolic adaptation during a cut).',
      {
        n: 160,
        tdeeAt: (d) => 2650 - (300 * d) / 159,
        deficit: 350,
        weightNoiseSd: 0.4,
        missingWeightRate: 0.25,
        mislogRate: 0.06,
        seed: 303,
      }
    ),
    generateScenario(
      'Activity spike',
      'Baseline 2500; a 15-day training block adds +400 (days 40-55), then back to baseline.',
      {
        n: 160,
        tdeeAt: (d) => (d >= 40 && d < 55 ? 2900 : 2500),
        deficit: 200,
        weightNoiseSd: 0.4,
        missingWeightRate: 0.2,
        mislogRate: 0.05,
        seed: 404,
      }
    ),
  ];

  for (const scn of scenarios) {
    const initialGuess = scn.trueTdee[0] + 300; // realistic cold-start error
    // Silence the engines' per-day debug logging so the report stays readable.
    const current = quiet(() => runCurrentEstimator(scn.days, initialGuess));
    const kalman = runKalmanEstimator(scn.days, initialGuess);
    printScenario(scn, scoreAgainstTruth(current, scn.trueTdee, scn.stepDay), scoreAgainstTruth(kalman, scn.trueTdee, scn.stepDay));
  }

  console.log('\nNotes:');
  console.log('  - Lower is better for MAE / RMSE / Volatility; Bias closest to 0 is best.');
  console.log('  - "Bias" near 0 in the stable scenario confirms the symmetric-density fix.');
  console.log('  - Kalman winning MAE/lag with comparable volatility argues for integration.');

  runRealFixtureIfPresent();
}

function runRealFixtureIfPresent(): void {
  if (!fixtureExists()) {
    console.log('\n(No real-data fixture at __tests__/fixtures/userData.json — skipping real-data run.)');
    return;
  }
  try {
    const fixture = loadFixture();
    const summary = getFixtureSummary(fixture);
    const maps = buildDateMaps(fixture);

    // Reconstruct a chronological daily series from the export.
    const dates = [...maps.dailyLogByDate.keys()].sort();
    if (dates.length === 0) {
      console.log('\n(Real fixture present but contains no daily logs — skipping.)');
      return;
    }
    const days: SynthDay[] = dates.map((date) => {
      const log = maps.dailyLogByDate.get(date);
      const weight = maps.weightByDate.get(date);
      return {
        trueTdee: 0, // unknown for real data
        loggedIntake: log?.nutritionCalories ?? null,
        measuredWeight: weight ?? null,
      };
    });

    const initialGuess = 2200;
    const current = quiet(() => runCurrentEstimator(days, initialGuess));
    const kalman = runKalmanEstimator(days, initialGuess);

    // No ground truth: report agreement + each estimator's volatility.
    let divSum = 0;
    for (let i = 0; i < current.length; i++) divSum += Math.abs(current[i] - kalman[i]);
    const meanDivergence = current.length ? divSum / current.length : 0;
    const curVol = volatility(current);
    const kalVol = volatility(kalman);

    console.log('\n### Real data (no ground truth)');
    console.log(
      `    ${summary.dailyLogEntries} logs over ${summary.dateRange?.start ?? '?'}..${summary.dateRange?.end ?? '?'}`
    );
    console.log(`    Final TDEE:  current ${Math.round(current[current.length - 1])}   kalman ${Math.round(kalman[kalman.length - 1])}`);
    console.log(`    Mean |current - kalman|: ${meanDivergence.toFixed(1)} kcal`);
    console.log(`    Volatility:  current ${curVol.toFixed(1)}   kalman ${kalVol.toFixed(1)} kcal/day`);
  } catch (err) {
    console.log(`\n(Failed to run real fixture: ${(err as Error).message})`);
  }
}

/** Run fn with console.log suppressed (the engines log per-day diagnostics). */
function quiet<T>(fn: () => T): T {
  const orig = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = orig;
  }
}

function volatility(series: number[]): number {
  if (series.length < 2) return 0;
  let s = 0;
  for (let i = 1; i < series.length; i++) s += Math.abs(series[i] - series[i - 1]);
  return s / (series.length - 1);
}

main();
