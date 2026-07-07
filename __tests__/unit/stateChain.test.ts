/**
 * Unit tests for the pure computeStateChain (Phase 3b extraction).
 *
 * computeStateChain is the single, pure implementation of the app's day-by-day
 * TDEE state loop, previously duplicated in metabolicService.recalculateTdeeFromDate
 * (write side) and statsHelpers.computeStatesOnTheFly (read side). These tests pin
 * the extracted logic directly (no Amplify mocking needed) by feeding it trend
 * series + daily-log maps and asserting the resulting ComputedState sequence.
 *
 * Coverage: chain continuity, a skipped day (validation rejects it), the outlier
 * guardrail (consecutive-count accumulation + reset + sustained-anomaly cap), and
 * the whoosh-dampening interaction.
 */

import { computeStateChain } from '@/lib/metabolic/stateChain';
import type { ComputedStateResult } from '@/lib/expenditureEngine';
import type { DailyLog, WeightDataPoint } from '@/lib/types';

// --- fixtures -------------------------------------------------------------

const D = (n: number): string => `2026-03-${String(n).padStart(2, '0')}`;

const point = (
  date: string,
  trendWeight: number,
  scaleWeight: number | null = null
): WeightDataPoint => ({ date, scaleWeight, trendWeight });

const log = (
  date: string,
  calories: number | null,
  logStatus: DailyLog['logStatus'] = 'complete'
): DailyLog => ({
  date,
  scaleWeightKg: null,
  nutritionCalories: calories,
  nutritionProteinG: null,
  nutritionCarbsG: null,
  nutritionFatG: null,
  stepCount: null,
  logStatus,
});

const mapOf = (logs: DailyLog[]): Map<string, DailyLog> =>
  new Map(logs.map((l) => [l.date, l]));

const asResult = (s: unknown): ComputedStateResult => s as ComputedStateResult;

describe('computeStateChain', () => {
  it('returns an empty array for empty trend data', () => {
    expect(
      computeStateChain({ trendData: [], dailyLogsByDate: mapOf([]), initialTdee: 2500 })
    ).toEqual([]);
  });

  describe('multi-day chain with a skipped day', () => {
    // All days share the same trend weight => weightDelta 0 => rawTdee == calories
    // (within bounds). Hand-computed with alpha 0.05: est = round(raw*0.05 + prev*0.95).
    const trendData: WeightDataPoint[] = [
      point(D(1), 80),
      point(D(2), 80),
      point(D(3), 80),
      point(D(4), 80),
    ];
    const logs = mapOf([
      log(D(1), 2600),
      log(D(2), 2600),
      log(D(3), null, 'skipped'),
      log(D(4), 2600),
    ]);

    const states = computeStateChain({ trendData, dailyLogsByDate: logs, initialTdee: 2500 });

    it('produces one state per trend-data day, in order', () => {
      expect(states.map((s) => s.date)).toEqual([D(1), D(2), D(3), D(4)]);
    });

    it('matches the hand-computed smoothed TDEE sequence', () => {
      // Day1: round(2600*.05 + 2500*.95) = 2505
      // Day2: round(2600*.05 + 2505*.95) = 2510
      // Day3: skipped -> holds prev (2510)
      // Day4: round(2600*.05 + 2510*.95) = 2515
      expect(states.map((s) => s.estimatedTdeeKcal)).toEqual([2505, 2510, 2510, 2515]);
      expect(states.map((s) => s.rawTdeeKcal)).toEqual([2600, 2600, 2510, 2600]);
    });

    it('holds previous TDEE and widens flux on the skipped day', () => {
      expect(states[2].estimatedTdeeKcal).toBe(states[1].estimatedTdeeKcal); // held
      expect(states[2].rawTdeeKcal).toBe(states[2].estimatedTdeeKcal); // raw == smoothed when held
      expect(states[2].fluxConfidenceRange).toBeGreaterThanOrEqual(400);
    });

    it('chains continuity through the skipped day (day N prevTdee = day N-1 estimatedTdeeKcal)', () => {
      // Day4's smoothed value (2515) is derived from the held Day3 value (2510),
      // which itself equals Day2's estimate — proving the chain is unbroken.
      expect(states[3].estimatedTdeeKcal).toBe(2515);
    });
  });

  describe('whoosh-dampening interaction', () => {
    // Day 2 shows a 2 kg scale jump against a 0.2 kg trend move -> extreme whoosh,
    // damping factor 0.3 -> adjusted delta = 2 * 0.3 = 0.6 (overrides the trend delta).
    const trendData: WeightDataPoint[] = [
      point(D(1), 80, 80),
      point(D(2), 80.2, 82),
    ];
    const logs = mapOf([log(D(1), 2000), log(D(2), 2000)]);

    it('invokes onWhooshDamp once with the scale/trend/adjusted deltas', () => {
      const onWhooshDamp = jest.fn();
      computeStateChain({ trendData, dailyLogsByDate: logs, initialTdee: 2500, onWhooshDamp });

      expect(onWhooshDamp).toHaveBeenCalledTimes(1);
      const info = onWhooshDamp.mock.calls[0][0];
      expect(info.date).toBe(D(2));
      expect(info.scaleWeightDeltaKg).toBeCloseTo(2, 5);
      expect(info.trendWeightDeltaKg).toBeCloseTo(0.2, 5);
      expect(info.adjustedWeightDeltaKg).toBeCloseTo(0.6, 5);
    });

    it('feeds the whoosh-adjusted delta into buildComputedState', () => {
      const states = computeStateChain({ trendData, dailyLogsByDate: logs, initialTdee: 2500 });
      // weightDeltaKg on the state is the adjusted (damped) delta, not the raw 0.2 trend delta.
      expect(states[1].weightDeltaKg).toBeCloseTo(0.6, 5);
    });

    it('does not require the callback (chain still computes without onWhooshDamp)', () => {
      expect(() =>
        computeStateChain({ trendData, dailyLogsByDate: logs, initialTdee: 2500 })
      ).not.toThrow();
    });
  });

  describe('outlier guardrail', () => {
    // Five clean days establish a tight recent-raw-TDEE window (needed before the
    // guardrail can fire: >=5 tracked days AND >=5 values in the window).
    const cleanDays: WeightDataPoint[] = [
      point(D(1), 80),
      point(D(2), 80),
      point(D(3), 80),
      point(D(4), 80),
      point(D(5), 80),
    ];
    const cleanLogs: DailyLog[] = [
      log(D(1), 2480),
      log(D(2), 2520),
      log(D(3), 2480),
      log(D(4), 2520),
      log(D(5), 2530), // differs from smoothed so it is tracked (5th window value)
    ];

    const spike = (n: number): WeightDataPoint => point(D(n), 80);
    const spikeLog = (n: number): DailyLog => log(D(n), 3200); // ~z=32 vs window

    it('excludes 3 consecutive outliers then accepts the 4th (sustained anomaly)', () => {
      const trendData = [...cleanDays, spike(6), spike(7), spike(8), spike(9)];
      const logs = mapOf([...cleanLogs, spikeLog(6), spikeLog(7), spikeLog(8), spikeLog(9)]);

      const states = computeStateChain({ trendData, dailyLogsByDate: logs, initialTdee: 2500 });

      // Days 6,7,8: excluded -> held at the last good estimate (Day5's).
      for (const idx of [5, 6, 7]) {
        expect(asResult(states[idx]).wasOutlierExcluded).toBe(true);
        expect(states[idx].estimatedTdeeKcal).toBe(states[idx].rawTdeeKcal); // held
        expect(states[idx].estimatedTdeeKcal).toBe(states[4].estimatedTdeeKcal);
      }
      // Day9: consecutive count hit the cap (3) -> anomaly accepted as a real trend.
      expect(asResult(states[8]).wasOutlierExcluded).toBe(false);
      expect(states[8].estimatedTdeeKcal).not.toBe(states[8].rawTdeeKcal); // updated
    });

    it('resets the consecutive-outlier counter after a normal valid day', () => {
      // clean x5, outlier, outlier, NORMAL, outlier, outlier, outlier, outlier
      const trendData = [
        ...cleanDays,
        spike(6),
        spike(7),
        point(D(8), 80), // normal
        spike(9),
        spike(10),
        spike(11),
        spike(12),
      ];
      const logs = mapOf([
        ...cleanLogs,
        spikeLog(6),
        spikeLog(7),
        log(D(8), 2500), // normal, non-outlier -> resets the counter to 0
        spikeLog(9),
        spikeLog(10),
        spikeLog(11),
        spikeLog(12),
      ]);

      const states = computeStateChain({ trendData, dailyLogsByDate: logs, initialTdee: 2500 });

      // Day8 (index 7) is a normal, accepted update.
      expect(asResult(states[7]).wasOutlierExcluded).toBe(false);
      expect(states[7].estimatedTdeeKcal).not.toBe(states[7].rawTdeeKcal);

      // Because the counter reset at Day8, the NEXT three outliers (Day9/10/11)
      // are excluded and only Day12 (the 4th consecutive) is accepted. Without
      // the reset, an outlier would have been accepted one day earlier.
      expect(asResult(states[8]).wasOutlierExcluded).toBe(true);
      expect(asResult(states[9]).wasOutlierExcluded).toBe(true);
      expect(asResult(states[10]).wasOutlierExcluded).toBe(true);
      expect(asResult(states[11]).wasOutlierExcluded).toBe(false);
    });

    it('never excludes before the minimum-history window is established', () => {
      // A spike on day 3 (only 2 tracked days, tiny window) is NOT rejected.
      const trendData = [point(D(1), 80), point(D(2), 80), point(D(3), 80)];
      const logs = mapOf([log(D(1), 2480), log(D(2), 2520), log(D(3), 3200)]);

      const states = computeStateChain({ trendData, dailyLogsByDate: logs, initialTdee: 2500 });

      expect(asResult(states[2]).wasOutlierExcluded).toBe(false);
      expect(states[2].estimatedTdeeKcal).not.toBe(states[2].rawTdeeKcal); // updated normally
    });
  });
});
