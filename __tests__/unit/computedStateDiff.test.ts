/**
 * Unit tests for the pure ComputedState diff comparator (Task 8).
 *
 * `recalculateTdeeFromDate` used to persist every day's computed state via a
 * serial per-day create/update loop, even when nothing had changed. This
 * comparator decides, for a single freshly-computed state, whether the
 * existing persisted row (if any) already matches it on every field that
 * actually gets written - so unchanged rows can be skipped instead of
 * re-written every time TDEE is recalculated.
 *
 * Persisted fields (mirrors the create/update calls in
 * src/lib/metabolic/service.ts): trendWeightKg, estimatedTdeeKcal,
 * rawTdeeKcal, fluxConfidenceRange, energyDensityUsed, weightDeltaKg.
 * `date`/`id` are identity, not diffed; `wasOutlierExcluded` is a
 * runtime-only extra on ComputedStateResult and is never persisted.
 */

import { hasComputedStateChanged } from '@/lib/metabolic/computedStateDiff';
import type { ComputedState } from '@/lib/types';

const baseState: ComputedState = {
  id: 'cs-1',
  date: '2026-01-15',
  trendWeightKg: 79.6,
  estimatedTdeeKcal: 2150,
  rawTdeeKcal: 2100,
  fluxConfidenceRange: 300,
  energyDensityUsed: 7700,
  weightDeltaKg: -0.1,
};

describe('hasComputedStateChanged', () => {
  it('returns false when every persisted field is identical', () => {
    const next = { ...baseState };
    expect(hasComputedStateChanged(baseState, next)).toBe(false);
  });

  it('returns true when there is no existing row (create case)', () => {
    expect(hasComputedStateChanged(undefined, baseState)).toBe(true);
  });

  it.each([
    ['trendWeightKg', { trendWeightKg: 80.1 }],
    ['estimatedTdeeKcal', { estimatedTdeeKcal: 2200 }],
    ['rawTdeeKcal', { rawTdeeKcal: 2050 }],
    ['fluxConfidenceRange', { fluxConfidenceRange: 400 }],
    ['energyDensityUsed', { energyDensityUsed: 5500 }],
    ['weightDeltaKg', { weightDeltaKg: 0.2 }],
  ] as const)('returns true when %s changes', (_field, override) => {
    const next = { ...baseState, ...override };
    expect(hasComputedStateChanged(baseState, next)).toBe(true);
  });

  it('ignores id and date differences (identity fields, not persisted-field diffs)', () => {
    const existing = { ...baseState, id: 'different-id', date: '2026-01-16' };
    const next = { ...baseState };
    expect(hasComputedStateChanged(existing, next)).toBe(false);
  });
});
