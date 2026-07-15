import type { LogMealInput } from '@/lib/meal/logMeal';
import type { MealEntry } from '@/lib/types';
import { calculateMealTotals } from '@/lib/meal/totals';
import { getLocalDateString } from '@/lib/date';
import { logError } from '@/lib/logger';

/**
 * Offline meal queue.
 *
 * When the device is offline, logMeal() stores its input here instead of
 * writing to Amplify. Queued meals are shown optimistically on the dashboard
 * (syncStatus: 'pending') and replayed FIFO through the real network path
 * when connectivity returns.
 */

const STORAGE_KEY = 'macroai_offline_meal_queue_v1';

/** LogMealInput with eatenAt resolved and serialized for storage. */
type StoredLogMealInput = Omit<LogMealInput, 'eatenAt'> & { eatenAt: string };

export interface QueuedMeal {
  id: string;
  queuedAt: string;
  input: StoredLogMealInput;
}

type QueueListener = (pendingCount: number) => void;

const listeners = new Set<QueueListener>();
let isFlushing = false;

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readQueue(): QueuedMeal[] {
  if (!hasStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedMeal[]): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (error) {
    logError('Failed to persist offline meal queue', { error });
  }
  notify(queue.length);
}

function notify(count: number): void {
  for (const listener of listeners) {
    try {
      listener(count);
    } catch {
      // Listener errors must not break queue operations
    }
  }
}

function generateOfflineId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `offline-${crypto.randomUUID()}`;
  }
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toMealEntry(queued: QueuedMeal): MealEntry {
  const { input } = queued;
  const totals = input.totals ?? calculateMealTotals(input.ingredients);
  return {
    id: queued.id,
    name: input.name,
    category: input.category,
    eatenAt: input.eatenAt,
    totalCalories: totals.totalCalories,
    totalProtein: totals.totalProtein,
    totalCarbs: totals.totalCarbs,
    totalFat: totals.totalFat,
    totalWeightG: totals.totalWeightG,
    syncStatus: 'pending',
    ingredients: input.ingredients.map((ing, index) => ({
      id: `${queued.id}-ing-${index}`,
      mealId: queued.id,
      name: ing.name,
      weightG: ing.weightG,
      calories: ing.calories,
      protein: ing.protein,
      carbs: ing.carbs,
      fat: ing.fat,
      source: ing.source,
      servingDescription: ing.servingDescription ?? null,
      servingSizeGrams: ing.servingSizeGrams ?? null,
      sortOrder: index,
    })),
  };
}

/** Queue a meal logged while offline. Returns the optimistic MealEntry. */
export function enqueueMeal(input: LogMealInput): MealEntry {
  const queued: QueuedMeal = {
    id: generateOfflineId(),
    queuedAt: new Date().toISOString(),
    input: { ...input, eatenAt: (input.eatenAt ?? new Date()).toISOString() },
  };
  writeQueue([...readQueue(), queued]);
  return toMealEntry(queued);
}

export function getQueuedMeals(): QueuedMeal[] {
  return readQueue();
}

export function pendingMealCount(): number {
  return readQueue().length;
}

/** Optimistic MealEntry list for queued meals eaten on the given local date (YYYY-MM-DD). */
export function queuedMealEntriesForDate(dateKey: string): MealEntry[] {
  return readQueue()
    .filter((queued) => getLocalDateString(new Date(queued.input.eatenAt)) === dateKey)
    .map(toMealEntry);
}

/**
 * Replay queued meals FIFO through send(). Each meal is removed from the
 * queue as soon as its send succeeds; the flush stops at the first failure
 * (typically: still offline) leaving the rest queued. Concurrent calls are
 * no-ops while a flush is in flight.
 */
export async function flushMealQueue(
  send: (input: LogMealInput) => Promise<unknown>
): Promise<{ sent: number; remaining: number }> {
  if (isFlushing) {
    return { sent: 0, remaining: readQueue().length };
  }
  isFlushing = true;
  let sent = 0;
  try {
    for (const queued of readQueue()) {
      try {
        await send({ ...queued.input, eatenAt: new Date(queued.input.eatenAt) });
      } catch {
        break;
      }
      writeQueue(readQueue().filter((entry) => entry.id !== queued.id));
      sent += 1;
    }
  } finally {
    isFlushing = false;
  }
  return { sent, remaining: readQueue().length };
}

/** Subscribe to pending-count changes. Returns an unsubscribe function. */
export function subscribeMealQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper / logout hook: drop all queued meals. */
export function clearMealQueue(): void {
  if (!hasStorage()) return;
  localStorage.removeItem(STORAGE_KEY);
  notify(0);
}
