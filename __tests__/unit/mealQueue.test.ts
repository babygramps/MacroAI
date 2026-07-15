/**
 * Unit tests for the offline meal queue.
 *
 * When the device is offline, logMeal() enqueues the LogMealInput here
 * instead of writing to Amplify. The queue is flushed (FIFO) when
 * connectivity returns.
 */

import type { LogMealInput } from '@/lib/meal/logMeal';
import {
  enqueueMeal,
  getQueuedMeals,
  pendingMealCount,
  queuedMealEntriesForDate,
  flushMealQueue,
  subscribeMealQueue,
  clearMealQueue,
} from '@/lib/offline/mealQueue';
import { getLocalDateString } from '@/lib/date';

function mealInput(overrides: Partial<LogMealInput> = {}): LogMealInput {
  return {
    name: 'Chicken breast',
    category: 'meal',
    ingredients: [
      {
        name: 'Chicken breast',
        weightG: 200,
        calories: 330,
        protein: 62,
        carbs: 0,
        fat: 7,
        source: 'USDA',
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  clearMealQueue();
});

describe('enqueueMeal', () => {
  it('stores the meal and returns an optimistic entry with an offline id', () => {
    const entry = enqueueMeal(mealInput());

    expect(entry.id).toMatch(/^offline-/);
    expect(entry.syncStatus).toBe('pending');
    expect(entry.name).toBe('Chicken breast');
    expect(entry.totalCalories).toBe(330);
    expect(entry.totalProtein).toBe(62);
    expect(entry.ingredients).toHaveLength(1);
    expect(getQueuedMeals()).toHaveLength(1);
    expect(pendingMealCount()).toBe(1);
  });

  it('respects explicit totals when provided', () => {
    const entry = enqueueMeal(
      mealInput({
        totals: {
          totalCalories: 500,
          totalProtein: 40,
          totalCarbs: 30,
          totalFat: 20,
          totalWeightG: 350,
        },
      })
    );

    expect(entry.totalCalories).toBe(500);
    expect(entry.totalWeightG).toBe(350);
  });

  it('survives a reload (persisted in localStorage)', () => {
    enqueueMeal(mealInput());
    // Simulate reload: module state is read back from localStorage
    expect(getQueuedMeals()).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem('macroai_offline_meal_queue_v1') || '[]')).toHaveLength(1);
  });
});

describe('queuedMealEntriesForDate', () => {
  it('returns only meals eaten on the given local date', () => {
    enqueueMeal(mealInput({ eatenAt: new Date('2026-07-14T12:00:00') }));
    enqueueMeal(mealInput({ name: 'Old meal', eatenAt: new Date('2026-07-10T12:00:00') }));

    const todays = queuedMealEntriesForDate('2026-07-14');
    expect(todays).toHaveLength(1);
    expect(todays[0].name).toBe('Chicken breast');
  });

  it('defaults eatenAt to enqueue time', () => {
    enqueueMeal(mealInput());
    const today = getLocalDateString(new Date());
    expect(queuedMealEntriesForDate(today)).toHaveLength(1);
  });
});

describe('flushMealQueue', () => {
  it('replays queued meals FIFO through send() and empties the queue', async () => {
    enqueueMeal(mealInput({ name: 'First' }));
    enqueueMeal(mealInput({ name: 'Second' }));

    const sent: string[] = [];
    const result = await flushMealQueue(async (input) => {
      sent.push(input.name);
    });

    expect(sent).toEqual(['First', 'Second']);
    expect(result).toEqual({ sent: 2, remaining: 0 });
    expect(pendingMealCount()).toBe(0);
  });

  it('preserves the original eatenAt through a flush', async () => {
    const eatenAt = new Date('2026-07-14T08:30:00');
    enqueueMeal(mealInput({ eatenAt }));

    let sentEatenAt: Date | undefined;
    await flushMealQueue(async (input) => {
      sentEatenAt = input.eatenAt;
    });

    expect(sentEatenAt?.toISOString()).toBe(eatenAt.toISOString());
  });

  it('stops at the first failure and keeps unsent meals queued', async () => {
    enqueueMeal(mealInput({ name: 'First' }));
    enqueueMeal(mealInput({ name: 'Second' }));
    enqueueMeal(mealInput({ name: 'Third' }));

    let calls = 0;
    const result = await flushMealQueue(async () => {
      calls += 1;
      if (calls === 2) throw new Error('network down again');
    });

    expect(result).toEqual({ sent: 1, remaining: 2 });
    expect(getQueuedMeals().map((m) => m.input.name)).toEqual(['Second', 'Third']);
  });

  it('does not run concurrently', async () => {
    enqueueMeal(mealInput());

    let resolveFirst: () => void = () => {};
    const firstSendStarted = new Promise<void>((r) => {
      resolveFirst = r;
    });

    const first = flushMealQueue(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst();
          setTimeout(resolve, 10);
        })
    );

    await firstSendStarted;
    const second = await flushMealQueue(async () => {
      throw new Error('should not be called');
    });

    expect(second).toEqual({ sent: 0, remaining: 1 });
    await expect(first).resolves.toEqual({ sent: 1, remaining: 0 });
  });
});

describe('subscribeMealQueue', () => {
  it('notifies listeners on enqueue and flush', async () => {
    const counts: number[] = [];
    const unsubscribe = subscribeMealQueue((count) => counts.push(count));

    enqueueMeal(mealInput());
    await flushMealQueue(async () => {});

    expect(counts).toEqual([1, 0]);
    unsubscribe();
  });
});
