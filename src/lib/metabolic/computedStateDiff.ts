/**
 * ComputedState diff comparator
 *
 * Pure helper for the batched/diffed writes in `recalculateTdeeFromDate`
 * (Task 8 of the core-separation refactor). Decides whether a freshly
 * computed ComputedState actually needs to be written, by comparing it
 * against the existing persisted row (if any) on exactly the fields the
 * create/update calls in `./service` write.
 *
 * `id` and `date` are identity, not diffed - the caller already resolved
 * "which row" via the existing-states map keyed by date. `wasOutlierExcluded`
 * (present on ComputedStateResult, the chain's internal return type) is a
 * runtime-only diagnostic and is never persisted, so it is intentionally
 * excluded here too.
 *
 * Comparison is tolerance-free/exact: none of the persisted fields are
 * rounded at write time beyond whatever rounding buildComputedState already
 * baked into the values (estimatedTdeeKcal/rawTdeeKcal/fluxConfidenceRange
 * are Math.round'd there; trendWeightKg/weightDeltaKg/energyDensityUsed are
 * not further rounded), so there is no additional rounding to mirror.
 */

import type { ComputedState } from '@/lib/types';

/** Fields actually written by ComputedState.create/.update in ./service. */
const PERSISTED_COMPUTED_STATE_FIELDS = [
  'trendWeightKg',
  'estimatedTdeeKcal',
  'rawTdeeKcal',
  'fluxConfidenceRange',
  'energyDensityUsed',
  'weightDeltaKg',
] as const satisfies ReadonlyArray<keyof ComputedState>;

/**
 * Returns true when `next` needs to be persisted: either there is no
 * existing row (create case) or at least one persisted field differs from
 * the existing row (update case). Returns false only when an existing row
 * is present and every persisted field matches exactly (skip case).
 */
export function hasComputedStateChanged(
  existing: ComputedState | undefined,
  next: ComputedState
): boolean {
  if (!existing) {
    return true;
  }

  return PERSISTED_COMPUTED_STATE_FIELDS.some((field) => existing[field] !== next[field]);
}
