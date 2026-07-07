/**
 * Metabolic Debug Tooling (browser console)
 *
 * Moved verbatim out of `metabolicService.ts` (Task 9 of the core-separation
 * refactor) so it no longer ships in every page's client bundle. This module
 * is only ever loaded via a dev-only dynamic `import()` — loading it is what
 * installs the `window.*` console globals below.
 */

import { getAmplifyDataClient } from '@/lib/data/amplifyClient';
import { backfillMetabolicData, recalculateTdeeFromDate } from './service';

// ============================================
// Debug Helpers (for browser console)
// ============================================

/**
 * Clear all ComputedState records and re-run backfill
 * Call from browser console: window.resetMetabolicData()
 */
export async function resetMetabolicData(days: number = 90): Promise<void> {
  const client = getAmplifyDataClient();
  if (!client) {
    return;
  }

  // Delete all ComputedState records
  const { data: states } = await client.models.ComputedState.list({ limit: 1000 });
  
  if (states) {
    for (const state of states) {
      await client.models.ComputedState.delete({ id: state.id });
    }
  }
  
  // Run backfill
  await backfillMetabolicData(days);
}

/**
 * Review high-calorie days and interactively skip them
 * Fetches full meal breakdowns so you can identify anomalies.
 * Call from browser console: window.reviewHighCal(2500)
 * 
 * @param threshold - Calorie threshold (default 2500)
 */
export async function reviewHighCalorieDays(threshold: number = 2500): Promise<void> {
  const client = getAmplifyDataClient();
  if (!client) {
    console.error('[reviewHighCal] No Amplify client available');
    return;
  }

  console.log(`[reviewHighCal] Finding days with > ${threshold} calories...`);

  // Fetch all DailyLogs (paginate to get everything)
  const allLogs: Array<{
    id: string;
    date: string;
    nutritionCalories: number | null;
    logStatus: string | null;
  }> = [];

  let nextToken: string | null | undefined = undefined;
  do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = { limit: 1000 };
    if (nextToken) params.nextToken = nextToken;

    const result = await client.models.DailyLog.list(params);
    if (result.data) {
      for (const log of result.data) {
        allLogs.push({
          id: log.id,
          date: log.date,
          nutritionCalories: log.nutritionCalories ?? null,
          logStatus: log.logStatus ?? null,
        });
      }
    }
    nextToken = result.nextToken;
  } while (nextToken);

  // Filter for high-calorie days that aren't already skipped
  const highCalDays = allLogs
    .filter(
      (log) =>
        log.nutritionCalories !== null &&
        log.nutritionCalories > threshold &&
        log.logStatus !== 'skipped'
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  if (highCalDays.length === 0) {
    console.log(`[reviewHighCal] No days found with > ${threshold} calories (excluding already-skipped days).`);
    return;
  }

  console.log(`[reviewHighCal] Found ${highCalDays.length} days over ${threshold} cal. Fetching meal details...\n`);

  // Fetch meals for each high-cal day
  interface MealDetail {
    name: string;
    category: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    ingredients: Array<{ name: string; calories: number; weightG: number }>;
  }

  interface DayDetail {
    id: string;
    date: string;
    totalCalories: number;
    logStatus: string;
    meals: MealDetail[];
  }

  const dayDetails: DayDetail[] = [];

  for (const day of highCalDays) {
    // Fetch meals via localDate GSI
    const { data: meals } = await client.models.Meal.listMealByLocalDate({
      localDate: day.date,
    });

    const mealDetails: MealDetail[] = [];

    if (meals && meals.length > 0) {
      for (const meal of meals) {
        // Fetch ingredients for this meal
        const { data: ingredients } = await client.models.MealIngredient.listMealIngredientByMealId({
          mealId: meal.id,
        });

        mealDetails.push({
          name: meal.name,
          category: meal.category,
          calories: meal.totalCalories,
          protein: meal.totalProtein,
          carbs: meal.totalCarbs,
          fat: meal.totalFat,
          ingredients: (ingredients || [])
            .sort((a, b) => (b.calories || 0) - (a.calories || 0))
            .map((ing) => ({
              name: ing.name,
              calories: ing.calories,
              weightG: ing.weightG,
            })),
        });
      }
    }

    // Sort meals by calories descending
    mealDetails.sort((a, b) => b.calories - a.calories);

    dayDetails.push({
      id: day.id,
      date: day.date,
      totalCalories: day.nutritionCalories || 0,
      logStatus: day.logStatus || 'complete',
      meals: mealDetails,
    });
  }

  // Print full summary to console
  console.log('='.repeat(70));
  for (const day of dayDetails) {
    const dayName = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
    console.log(`\n📅 ${day.date} (${dayName}) — ${day.totalCalories} cal [${day.logStatus}]`);
    console.log('-'.repeat(50));

    if (day.meals.length === 0) {
      console.log('  (no meals found via localDate query)');
    } else {
      for (const meal of day.meals) {
        const emoji = meal.category === 'drink' ? '🥤' : meal.category === 'snack' ? '🍪' : '🍽️';
        console.log(`  ${emoji} ${meal.name} — ${meal.calories} cal (P:${meal.protein}g C:${meal.carbs}g F:${meal.fat}g)`);
        for (const ing of meal.ingredients) {
          console.log(`      • ${ing.name}: ${ing.calories} cal (${ing.weightG}g)`);
        }
      }
    }
  }
  console.log('\n' + '='.repeat(70));

  // Also print a compact table for quick overview
  console.log('\nSummary table:');
  console.table(
    dayDetails.map((d) => ({
      date: d.date,
      calories: d.totalCalories,
      status: d.logStatus,
      meals: d.meals.map((m) => `${m.name} (${m.calories})`).join(' | '),
    }))
  );

  // Interactive prompts with full context
  const toSkip: DayDetail[] = [];

  for (const day of dayDetails) {
    const dayName = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });

    const mealLines = day.meals
      .map((m) => {
        const ingList = m.ingredients
          .slice(0, 5) // top 5 by calories
          .map((i) => `  • ${i.name}: ${i.calories} cal`)
          .join('\n');
        return `${m.name} — ${m.calories} cal\n${ingList}`;
      })
      .join('\n\n');

    const message = [
      `${dayName} (${day.date})`,
      `Total: ${day.totalCalories} cal`,
      `Status: ${day.logStatus}`,
      '',
      'Meals:',
      mealLines || '(no meal data)',
      '',
      'Skip this day from TDEE calculation?',
    ].join('\n');

    const answer = window.confirm(message);
    if (answer) {
      toSkip.push(day);
    }
  }

  if (toSkip.length === 0) {
    console.log('[reviewHighCal] No days selected to skip.');
    return;
  }

  console.log(`\n[reviewHighCal] Skipping ${toSkip.length} days: ${toSkip.map((d) => d.date).join(', ')}`);

  // Update each day's logStatus to 'skipped'
  for (const day of toSkip) {
    await client.models.DailyLog.update({
      id: day.id,
      logStatus: 'skipped',
    });
    console.log(`  ✓ ${day.date} (${day.totalCalories} cal) marked as skipped`);
  }

  // Recalculate TDEE from the earliest skipped date forward
  const earliestDate = toSkip[0].date; // already sorted
  console.log(`\n[reviewHighCal] Recalculating TDEE from ${earliestDate}...`);
  const daysRecalculated = await recalculateTdeeFromDate(earliestDate);
  console.log(`[reviewHighCal] Done! Recalculated ${daysRecalculated} days. Refresh the page to see updated values.`);
}

/**
 * Review low-calorie days (likely incomplete logging) and interactively skip them
 * Call from browser console: window.reviewLowCal(500)
 * 
 * @param threshold - Calorie threshold (default 500) — days UNDER this get flagged
 */
export async function reviewLowCalorieDays(threshold: number = 500): Promise<void> {
  const client = getAmplifyDataClient();
  if (!client) {
    console.error('[reviewLowCal] No Amplify client available');
    return;
  }

  console.log(`[reviewLowCal] Finding days with < ${threshold} calories (likely incomplete logging)...`);

  // Fetch all DailyLogs (paginate)
  const allLogs: Array<{
    id: string;
    date: string;
    nutritionCalories: number | null;
    logStatus: string | null;
  }> = [];

  let nextToken: string | null | undefined = undefined;
  do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = { limit: 1000 };
    if (nextToken) params.nextToken = nextToken;

    const result = await client.models.DailyLog.list(params);
    if (result.data) {
      for (const log of result.data) {
        allLogs.push({
          id: log.id,
          date: log.date,
          nutritionCalories: log.nutritionCalories ?? null,
          logStatus: log.logStatus ?? null,
        });
      }
    }
    nextToken = result.nextToken;
  } while (nextToken);

  // Filter for low-calorie days that aren't already skipped and have some data
  const lowCalDays = allLogs
    .filter(
      (log) =>
        log.nutritionCalories !== null &&
        log.nutritionCalories > 0 &&
        log.nutritionCalories < threshold &&
        log.logStatus !== 'skipped'
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  if (lowCalDays.length === 0) {
    console.log(`[reviewLowCal] No days found with < ${threshold} calories (excluding already-skipped days).`);
    return;
  }

  console.log(`[reviewLowCal] Found ${lowCalDays.length} days under ${threshold} cal. Fetching meal details...\n`);

  // Print details and build confirm data
  console.log('='.repeat(70));
  const dayDetails: Array<{ id: string; date: string; totalCalories: number; meals: string }> = [];

  for (const day of lowCalDays) {
    const dayName = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    const { data: meals } = await client.models.Meal.listMealByLocalDate({
      localDate: day.date,
    });

    const mealNames: string[] = [];

    console.log(`\n⚠️  ${day.date} (${dayName}) — ${day.nutritionCalories} cal [${day.logStatus || 'complete'}]`);
    console.log('-'.repeat(50));

    if (meals && meals.length > 0) {
      for (const meal of meals) {
        const emoji = meal.category === 'drink' ? '🥤' : meal.category === 'snack' ? '🍪' : '🍽️';
        console.log(`  ${emoji} ${meal.name} — ${meal.totalCalories} cal`);
        mealNames.push(`${meal.name} (${meal.totalCalories})`);
      }
    } else {
      console.log('  (no meals found)');
      mealNames.push('(no meals)');
    }

    dayDetails.push({
      id: day.id,
      date: day.date,
      totalCalories: day.nutritionCalories || 0,
      meals: mealNames.join(' | '),
    });
  }

  console.log('\n' + '='.repeat(70));
  console.log('\nSummary:');
  console.table(dayDetails.map((d) => ({ date: d.date, calories: d.totalCalories, meals: d.meals })));

  // Interactive prompts
  const toSkip: typeof dayDetails = [];

  for (const day of dayDetails) {
    const dayName = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });

    const answer = window.confirm(
      `${dayName} (${day.date})\n` +
      `Total: ${day.totalCalories} cal\n` +
      `Meals: ${day.meals}\n\n` +
      `Skip this day from TDEE calculation?`
    );
    if (answer) {
      toSkip.push(day);
    }
  }

  if (toSkip.length === 0) {
    console.log('[reviewLowCal] No days selected to skip.');
    return;
  }

  console.log(`\n[reviewLowCal] Skipping ${toSkip.length} days: ${toSkip.map((d) => d.date).join(', ')}`);

  for (const day of toSkip) {
    await client.models.DailyLog.update({
      id: day.id,
      logStatus: 'skipped',
    });
    console.log(`  ✓ ${day.date} (${day.totalCalories} cal) marked as skipped`);
  }

  const earliestDate = toSkip.sort((a, b) => a.date.localeCompare(b.date))[0].date;
  console.log(`\n[reviewLowCal] Recalculating TDEE from ${earliestDate}...`);
  const daysRecalculated = await recalculateTdeeFromDate(earliestDate);
  console.log(`[reviewLowCal] Done! Recalculated ${daysRecalculated} days. Refresh the page to see updated values.`);
}

/**
 * List all skipped days with their calorie summaries and meal breakdowns
 * Call from browser console: window.listSkipped()
 */
export async function listSkippedDays(): Promise<void> {
  const client = getAmplifyDataClient();
  if (!client) {
    console.error('[listSkipped] No Amplify client available');
    return;
  }

  console.log('[listSkipped] Fetching skipped days...');

  // Fetch all DailyLogs (paginate)
  const skippedLogs: Array<{
    id: string;
    date: string;
    nutritionCalories: number | null;
  }> = [];

  let nextToken: string | null | undefined = undefined;
  do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = { limit: 1000 };
    if (nextToken) params.nextToken = nextToken;

    const result = await client.models.DailyLog.list(params);
    if (result.data) {
      for (const log of result.data) {
        if (log.logStatus === 'skipped') {
          skippedLogs.push({
            id: log.id,
            date: log.date,
            nutritionCalories: log.nutritionCalories ?? null,
          });
        }
      }
    }
    nextToken = result.nextToken;
  } while (nextToken);

  skippedLogs.sort((a, b) => a.date.localeCompare(b.date));

  if (skippedLogs.length === 0) {
    console.log('[listSkipped] No skipped days found.');
    return;
  }

  console.log(`[listSkipped] Found ${skippedLogs.length} skipped days. Fetching meal details...\n`);

  // Fetch meals for each skipped day
  console.log('='.repeat(70));
  const tableRows: Array<{ date: string; day: string; calories: number | string; meals: string }> = [];

  for (const log of skippedLogs) {
    const dayName = new Date(log.date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    const { data: meals } = await client.models.Meal.listMealByLocalDate({
      localDate: log.date,
    });

    const mealSummaries: string[] = [];

    if (meals && meals.length > 0) {
      // Sort meals by calories descending
      const sortedMeals = [...meals].sort((a, b) => (b.totalCalories || 0) - (a.totalCalories || 0));

      console.log(`\n⏭️  ${log.date} (${dayName}) — ${log.nutritionCalories ?? '?'} cal [SKIPPED]`);
      console.log('-'.repeat(50));

      for (const meal of sortedMeals) {
        const emoji = meal.category === 'drink' ? '🥤' : meal.category === 'snack' ? '🍪' : '🍽️';
        console.log(`  ${emoji} ${meal.name} — ${meal.totalCalories} cal (P:${meal.totalProtein}g C:${meal.totalCarbs}g F:${meal.totalFat}g)`);

        // Fetch ingredients
        const { data: ingredients } = await client.models.MealIngredient.listMealIngredientByMealId({
          mealId: meal.id,
        });

        if (ingredients && ingredients.length > 0) {
          const sorted = [...ingredients].sort((a, b) => (b.calories || 0) - (a.calories || 0));
          for (const ing of sorted) {
            console.log(`      • ${ing.name}: ${ing.calories} cal (${ing.weightG}g)`);
          }
        }

        mealSummaries.push(`${meal.name} (${meal.totalCalories})`);
      }
    } else {
      console.log(`\n⏭️  ${log.date} (${dayName}) — ${log.nutritionCalories ?? '?'} cal [SKIPPED]`);
      console.log('-'.repeat(50));
      console.log('  (no meals found)');
      mealSummaries.push('(no meals)');
    }

    tableRows.push({
      date: log.date,
      day: dayName,
      calories: log.nutritionCalories ?? '—',
      meals: mealSummaries.join(' | '),
    });
  }

  console.log('\n' + '='.repeat(70));
  console.log('\nSummary:');
  console.table(tableRows);

  const totalSkippedCal = skippedLogs.reduce((sum, d) => sum + (d.nutritionCalories || 0), 0);
  console.log(`\n${skippedLogs.length} skipped days, ${totalSkippedCal} total calories excluded from TDEE.`);
  console.log('To unskip a day, use: await window.unskipDay("YYYY-MM-DD")');
}

/**
 * Unskip a previously skipped day and recalculate TDEE
 * Call from browser console: window.unskipDay("2026-02-02")
 * 
 * @param dateKey - Date to unskip (YYYY-MM-DD)
 */
export async function unskipDay(dateKey: string): Promise<void> {
  const client = getAmplifyDataClient();
  if (!client) {
    console.error('[unskipDay] No Amplify client available');
    return;
  }

  const { data: logs } = await client.models.DailyLog.listDailyLogByDate({
    date: dateKey,
  });

  if (!logs || logs.length === 0) {
    console.error(`[unskipDay] No DailyLog found for ${dateKey}`);
    return;
  }

  const log = logs[0];
  if (log.logStatus !== 'skipped') {
    console.log(`[unskipDay] ${dateKey} is not skipped (status: ${log.logStatus || 'complete'}). Nothing to do.`);
    return;
  }

  await client.models.DailyLog.update({
    id: log.id,
    logStatus: 'complete',
  });
  console.log(`✓ ${dateKey} restored to 'complete'`);

  console.log(`[unskipDay] Recalculating TDEE from ${dateKey}...`);
  const daysRecalculated = await recalculateTdeeFromDate(dateKey);
  console.log(`[unskipDay] Done! Recalculated ${daysRecalculated} days. Refresh the page to see updated values.`);
}

// Expose to window for browser console access
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).resetMetabolicData = resetMetabolicData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).backfillMetabolicData = backfillMetabolicData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).reviewHighCal = reviewHighCalorieDays;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).reviewLowCal = reviewLowCalorieDays;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).listSkipped = listSkippedDays;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).unskipDay = unskipDay;
}
