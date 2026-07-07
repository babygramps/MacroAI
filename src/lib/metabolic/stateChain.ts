/**
 * State Chain
 *
 * The single, pure implementation of the app's day-by-day TDEE state loop.
 *
 * This was previously duplicated (and had drifted) between two call sites:
 *   - write side: metabolicService.recalculateTdeeFromDate (compute + persist per day)
 *   - read  side: statsHelpers.computeStatesOnTheFly       (compute only)
 * Both were the CANONICAL algorithm plus the July-6 outlier guardrail. Task 7 of
 * the core-separation refactor extracts that shared logic here so there is one
 * source of truth; each call site now just gathers inputs, calls computeStateChain,
 * and does its own thing with the result (persist vs return).
 *
 * Purity: no I/O, no Amplify client, no Date.now() — every input arrives via
 * parameters. The seed (initialTdee) is resolved by each caller *before* calling,
 * because the two callers seed differently (see field docs below); that divergence
 * is intentionally preserved, not unified. The optional onWhooshDamp observer lets
 * the write side reproduce its per-day diagnostic log without the chain performing
 * I/O itself.
 */

import type { ComputedState, DailyLog, WeightDataPoint } from '@/lib/types';
import { buildComputedState, type ComputedStateResult } from '@/lib/expenditureEngine';
import { dampWhooshEffect, validateDailyLogForTdee } from '@/lib/edgeCaseHandler';

/** Details of a single day whose weight delta was damped by the whoosh guard. */
export interface WhooshDampInfo {
  date: string;
  scaleWeightDeltaKg: number;
  trendWeightDeltaKg: number;
  adjustedWeightDeltaKg: number;
}

export interface StateChainInput {
  /**
   * Per-day trend series (date, scaleWeight, trendWeight), ascending by date.
   * Drives iteration and provides the previous day's trend weight + scale weight.
   */
  trendData: WeightDataPoint[];
  /**
   * Lookup of DailyLog by date key. A missing entry (or a log that fails
   * validation) causes that day to hold the previous TDEE.
   */
  dailyLogsByDate: Map<string, DailyLog>;
  /**
   * Seed for day 0's previous TDEE. Resolved by the caller, which differs by
   * call site and is deliberately NOT unified here:
   *   - write side: day-before persisted ComputedState -> cold start -> 2000
   *   - read  side: cold start -> 2000
   */
  initialTdee: number;
  /**
   * Optional observer invoked once per day whose weight delta was whoosh-damped.
   * Injected so the write side can emit its `[metabolicService] Whoosh dampening`
   * log while keeping this function free of direct I/O.
   */
  onWhooshDamp?: (info: WhooshDampInfo) => void;
}

/**
 * Population variance of a numeric window. Returns 0 for fewer than 2 values.
 * Matches the previous implementations (statsHelpers.calculateVariance and the
 * inline reducer in metabolicService) exactly.
 */
function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
}

/**
 * Compute the ordered ComputedState chain for a trend series.
 *
 * Day N's estimate depends only on in-memory state carried forward from day N-1
 * (prevTdee) plus that day's own inputs — never on anything persisted mid-loop.
 * Internal accumulators (validDaysProcessed, recentRawTdees, consecutiveOutlierCount)
 * are kept private to this function.
 */
export function computeStateChain(input: StateChainInput): ComputedState[] {
  const { trendData, dailyLogsByDate, initialTdee, onWhooshDamp } = input;

  const states: ComputedState[] = [];
  const recentRawTdees: number[] = []; // raw TDEE from valid update days, for variance
  let validDaysProcessed = 0;
  let consecutiveOutlierCount = 0; // sustained-anomaly guardrail
  let prevTdee = initialTdee;

  for (let i = 0; i < trendData.length; i++) {
    const point = trendData[i];
    const prevPoint = i > 0 ? trendData[i - 1] : point;
    const prevTrendWeight = prevPoint.trendWeight;
    const dailyLog = dailyLogsByDate.get(point.date) ?? null;

    // Days counted valid so far (drives the dynamic flux range).
    const validDaysSoFar = validDaysProcessed;

    // Variance of the recent raw-TDEE window (last 7).
    const recentVariance = variance(recentRawTdees.slice(-7));

    // Whoosh dampening: only when both this and the previous day have a real
    // scale weight. Depends purely on the trend series, not on the TDEE chain.
    let adjustedWeightDeltaKg: number | undefined;
    if (i > 0 && point.scaleWeight !== null && prevPoint.scaleWeight !== null) {
      const scaleWeightDeltaKg = point.scaleWeight - prevPoint.scaleWeight;
      const trendWeightDeltaKg = point.trendWeight - prevTrendWeight;
      adjustedWeightDeltaKg = dampWhooshEffect(scaleWeightDeltaKg, trendWeightDeltaKg);
      if (adjustedWeightDeltaKg !== trendWeightDeltaKg) {
        onWhooshDamp?.({
          date: point.date,
          scaleWeightDeltaKg,
          trendWeightDeltaKg,
          adjustedWeightDeltaKg,
        });
      }
    }

    // Build the computed state with dynamic flux range + outlier context.
    const state: ComputedStateResult = buildComputedState(
      point.date,
      point.trendWeight,
      prevTrendWeight,
      dailyLog,
      prevTdee,
      undefined, // stepCountDelta
      validDaysSoFar,
      recentVariance,
      adjustedWeightDeltaKg,
      { recentRawTdees: recentRawTdees.slice(-7), consecutiveOutlierCount }
    );

    const isValidForTdee =
      dailyLog !== null && validateDailyLogForTdee(dailyLog, prevTdee).isValid;

    // Track consecutive outlier exclusions for the sustained-anomaly guardrail.
    if (state.wasOutlierExcluded) {
      consecutiveOutlierCount++;
    } else if (isValidForTdee) {
      consecutiveOutlierCount = 0;
    }

    // Track raw TDEE variance from valid update days only.
    if (isValidForTdee && state.rawTdeeKcal !== state.estimatedTdeeKcal) {
      recentRawTdees.push(state.rawTdeeKcal);
    }

    if (isValidForTdee) {
      validDaysProcessed++;
    }

    states.push(state);

    // Chain the TDEE for next iteration (in-memory; never re-read from storage).
    prevTdee = state.estimatedTdeeKcal;
  }

  return states;
}
