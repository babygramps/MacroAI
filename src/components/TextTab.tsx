'use client';

import { useState } from 'react';
import { parseTextLog } from '@/actions/parseTextLog';
import { getAmplifyDataClient } from '@/lib/data/amplifyClient';
import type { NormalizedFood, MealCategory, MealEntry, IngredientEntry } from '@/lib/types';
import { MEAL_CATEGORY_INFO } from '@/lib/types';
import { calculateMealTotals } from '@/lib/meal/totals';
import { onMealLogged } from '@/lib/metabolicService';
import { verifyMealById } from '@/lib/meal/mealVerification';
import { CategoryPicker } from './ui/CategoryPicker';
import { showToast } from './ui/Toast';
import { ErrorAlert } from './ui/ErrorAlert';
import { logRemote, getErrorContext, generateTraceId } from '@/lib/clientLogger';

interface TextTabProps {
  onSuccess: (options?: { verified?: boolean; meal?: MealEntry }) => void;
}

type View = 'input' | 'review' | 'category';

export function TextTab({ onSuccess }: TextTabProps) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<NormalizedFood[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [view, setView] = useState<View>('input');

  // Category selection state
  const [category, setCategory] = useState<MealCategory>('meal');
  const [mealName, setMealName] = useState('');

  // Error state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!text.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);
    const startTime = Date.now();
    logRemote.info('Text analysis started', { textLength: text.length, textPreview: text.substring(0, 100) });

    try {
      const result = await parseTextLog(text);

      logRemote.info('Text analysis completed', {
        durationMs: Date.now() - startTime,
        success: result.success,
        foodsCount: result.foods.length,
        errorCode: result.error?.code
      });

      setResults(result.foods);

      if (result.success && result.foods.length > 0) {
        // Select all items by default
        setSelectedItems(new Set(result.foods.map((_, i) => i)));
        setView('review');
      } else if (!result.success && result.error) {
        setErrorMessage(result.error.message);
      } else {
        setErrorMessage('Could not identify any food items. Try describing your meal differently.');
      }
    } catch (error) {
      logRemote.error('Text analysis failed', {
        textLength: text.length,
        durationMs: Date.now() - startTime,
        ...getErrorContext(error)
      });
      console.error('Parse error:', error);
      setErrorMessage('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleItem = (index: number) => {
    setSelectedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleContinueToCategory = () => {
    if (selectedItems.size === 0) return;

    // Generate a default meal name from the description or first few items
    const selectedFoods = results.filter((_, i) => selectedItems.has(i));
    const defaultName = text.length > 40
      ? text.substring(0, 40) + '...'
      : text || selectedFoods.map(f => f.name).slice(0, 2).join(' & ');

    setMealName(defaultName);
    // Default to meal for multi-ingredient, snack for single
    setCategory(selectedFoods.length > 1 ? 'meal' : 'snack');
    setView('category');
  };

  const handleLogMeal = async () => {
    if (selectedItems.size === 0) return;

    const traceId = generateTraceId();
    const selectedFoods = results.filter((_, i) => selectedItems.has(i));

    logRemote.info('MEAL_LOG_START', {
      traceId,
      tab: 'text',
      mealName,
      category,
      ingredientCount: selectedFoods.length,
      ingredientNames: selectedFoods.map(f => f.name),
    });

    setIsSaving(true);
    try {
      const client = getAmplifyDataClient();
      if (!client) {
        logRemote.error('MEAL_LOG_ERROR', { traceId, error: 'Amplify client not ready' });
        showToast('Amplify is not ready yet. Please try again.', 'error');
        setIsSaving(false);
        return;
      }

      // Calculate totals
      const ingredients = selectedFoods.map((food) => ({
        name: food.name,
        weightG: food.servingSize || 100,
        calories: food.calories || 0,
        protein: food.protein || 0,
        carbs: food.carbs || 0,
        fat: food.fat || 0,
        source: food.source,
      }));

      const totals = calculateMealTotals(ingredients);
      const now = new Date().toISOString();

      // Create the meal
      const { data: meal } = await client.models.Meal.create({
        name: mealName || 'Meal',
        category,
        eatenAt: now,
        totalCalories: totals.totalCalories,
        totalProtein: totals.totalProtein,
        totalCarbs: totals.totalCarbs,
        totalFat: totals.totalFat,
        totalWeightG: totals.totalWeightG,
      });

      if (!meal) {
        logRemote.error('MEAL_CREATE_FAILED', { traceId, error: 'Meal.create returned null' });
        throw new Error('Failed to create meal');
      }

      logRemote.info('MEAL_CREATED', { traceId, mealId: meal.id, eatenAt: now });

      // Create all ingredients
      let ingredientsCreated = 0;
      const createdIngredients: IngredientEntry[] = [];

      for (let i = 0; i < selectedFoods.length; i++) {
        const food = selectedFoods[i];
        // Note: servingSizeGrams must be an integer (schema constraint)
        const servingSizeGramsInt = food.servingSizeGrams
          ? Math.round(food.servingSizeGrams)
          : undefined;

        const { data: ingredient } = await client.models.MealIngredient.create({
          mealId: meal.id,
          name: food.name,
          eatenAt: now,
          weightG: food.servingSize || 100,
          calories: food.calories || 0,
          protein: food.protein || 0,
          carbs: food.carbs || 0,
          fat: food.fat || 0,
          source: food.source,
          servingDescription: food.servingDescription || undefined,
          servingSizeGrams: servingSizeGramsInt,
          sortOrder: i,
        });

        if (ingredient) {
          ingredientsCreated++;
          createdIngredients.push({
            id: ingredient.id,
            mealId: meal.id,
            name: ingredient.name,
            weightG: ingredient.weightG,
            calories: ingredient.calories,
            protein: ingredient.protein,
            carbs: ingredient.carbs,
            fat: ingredient.fat,
            source: ingredient.source,
            servingDescription: ingredient.servingDescription,
            servingSizeGrams: ingredient.servingSizeGrams,
            sortOrder: ingredient.sortOrder ?? i,
          });
        }
      }

      logRemote.info('INGREDIENTS_CREATED', { traceId, mealId: meal.id, count: ingredientsCreated, expected: selectedFoods.length });

      // Verify meal is readable using strongly consistent get
      const { verified, attempts } = await verifyMealById(client, meal.id, { traceId });

      // Trigger metabolic recalculation
      await onMealLogged(now);

      logRemote.info('MEAL_LOG_COMPLETE', { traceId, mealId: meal.id, verified, attempts });

      // Construct optimistic meal entry
      const optimisticMeal: MealEntry = {
        id: meal.id,
        name: meal.name,
        category: meal.category as MealCategory,
        eatenAt: meal.eatenAt,
        totalCalories: meal.totalCalories,
        totalProtein: meal.totalProtein,
        totalCarbs: meal.totalCarbs,
        totalFat: meal.totalFat,
        totalWeightG: meal.totalWeightG,
        ingredients: createdIngredients,
      };

      const categoryInfo = MEAL_CATEGORY_INFO[category];
      showToast(`${categoryInfo.emoji} ${mealName} logged!`, 'success');
      onSuccess({ verified, meal: optimisticMeal });
    } catch (error) {
      logRemote.error('MEAL_LOG_ERROR', { traceId, ...getErrorContext(error) });
      console.error('Error logging meal:', error);
      showToast('Failed to log meal. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackToInput = () => {
    setResults([]);
    setSelectedItems(new Set());
    setView('input');
  };

  const totals = results
    .filter((_, i) => selectedItems.has(i))
    .reduce(
      (acc, food) => ({
        calories: acc.calories + (food.calories || 0),
        protein: acc.protein + (food.protein || 0),
        carbs: acc.carbs + (food.carbs || 0),
        fat: acc.fat + (food.fat || 0),
        weight: acc.weight + (food.servingSize || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, weight: 0 }
    );

  // Category selection view
  if (view === 'category') {
    const selectedFoods = results.filter((_, i) => selectedItems.has(i));

    return (
      <div className="p-4 pb-safe">
        <button
          onClick={() => setView('review')}
          className="mb-4 text-text-secondary flex items-center gap-2 hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <h3 className="text-section-title text-center mb-6">What is this?</h3>

        {/* Category picker */}
        <div className="mb-6">
          <CategoryPicker value={category} onChange={setCategory} />
        </div>

        {/* Meal name input */}
        <div className="mb-6">
          <label className="text-caption block mb-2">Name</label>
          <input
            type="text"
            value={mealName}
            onChange={(e) => setMealName(e.target.value)}
            className="input-field"
            placeholder="e.g., Breakfast, Lunch, Afternoon Snack"
          />
        </div>

        {/* Summary card */}
        <div className="card mb-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{MEAL_CATEGORY_INFO[category].emoji}</span>
            <div>
              <p className="font-medium text-text-primary">{mealName}</p>
              <p className="text-caption">{selectedFoods.length} ingredient{selectedFoods.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          {/* Ingredients preview */}
          <div className="space-y-1 mb-4 pl-9">
            {selectedFoods.slice(0, 3).map((food, i) => (
              <p key={i} className="text-xs text-text-muted truncate">
                • {food.name} ({food.servingSize}g)
              </p>
            ))}
            {selectedFoods.length > 3 && (
              <p className="text-xs text-text-muted">
                + {selectedFoods.length - 3} more
              </p>
            )}
          </div>

          <div className="macro-grid text-center">
            <div>
              <p className="font-mono font-bold text-macro-calories">{Math.round(totals.calories)}</p>
              <p className="text-caption">kcal</p>
            </div>
            <div>
              <p className="font-mono font-bold text-macro-protein">{Math.round(totals.protein)}g</p>
              <p className="text-caption">protein</p>
            </div>
            <div>
              <p className="font-mono font-bold text-macro-carbs">{Math.round(totals.carbs)}g</p>
              <p className="text-caption">carbs</p>
            </div>
            <div>
              <p className="font-mono font-bold text-macro-fat">{Math.round(totals.fat)}g</p>
              <p className="text-caption">fat</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleLogMeal}
          disabled={isSaving || !mealName.trim()}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <div className="spinner" />
              Saving...
            </>
          ) : (
            `Log ${MEAL_CATEGORY_INFO[category].label}`
          )}
        </button>
      </div>
    );
  }

  // Review ingredients view
  if (view === 'review' && results.length > 0) {
    return (
      <div className="p-4 pb-safe">
        <button
          onClick={handleBackToInput}
          className="mb-4 text-text-secondary flex items-center gap-2 hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Edit description
        </button>

        <h3 className="text-section-title mb-4">Review Ingredients</h3>

        <div className="flex flex-col gap-3 mb-6">
          {results.map((food, index) => (
            <button
              key={index}
              onClick={() => toggleItem(index)}
              className={`card text-left transition-all ${selectedItems.has(index)
                ? 'border-macro-calories/50'
                : 'opacity-50'
                }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedItems.has(index)
                    ? 'border-macro-calories bg-macro-calories'
                    : 'border-border-subtle'
                    }`}
                >
                  {selectedItems.has(index) && (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text-primary truncate">
                    {food.name} ({food.servingSize || 0}g)
                  </p>
                  <p className="text-caption">
                    {food.calories || 0} kcal • {food.protein || 0}g P
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Totals */}
        <div className="card mb-6">
          <h4 className="text-card-title mb-3">Total ({selectedItems.size} items)</h4>
          <div className="macro-grid text-center">
            <div>
              <p className="text-lg font-mono font-bold text-macro-calories">{Math.round(totals.calories)}</p>
              <p className="text-caption">kcal</p>
            </div>
            <div>
              <p className="text-lg font-mono font-bold text-macro-protein">{Math.round(totals.protein)}g</p>
              <p className="text-caption">protein</p>
            </div>
            <div>
              <p className="text-lg font-mono font-bold text-macro-carbs">{Math.round(totals.carbs)}g</p>
              <p className="text-caption">carbs</p>
            </div>
            <div>
              <p className="text-lg font-mono font-bold text-macro-fat">{Math.round(totals.fat)}g</p>
              <p className="text-caption">fat</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleContinueToCategory}
          disabled={selectedItems.size === 0}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    );
  }

  // Input view
  return (
    <div className="p-4 pb-safe">
      <p className="text-body text-text-secondary mb-4">
        Describe your meal in natural language and we&apos;ll estimate the nutrition.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g., 2 eggs, 3 strips of bacon, and a glass of orange juice"
        className="input-field min-h-[120px] resize-none mb-4"
      />

      <button
        onClick={handleAnalyze}
        disabled={isLoading || !text.trim()}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {isLoading ? (
          <>
            <div className="spinner" />
            Analyzing...
          </>
        ) : (
          <>
            <span>✨</span>
            Analyze Meal
          </>
        )}
      </button>

      {/* Error message */}
      {errorMessage ? (
        <ErrorAlert title="Analysis Error" message={errorMessage} className="mt-4" />
      ) : null}

      {/* Examples */}
      <div className="mt-6">
        <p className="text-caption mb-2">Examples:</p>
        <div className="flex flex-wrap gap-2">
          {[
            '1 cup of oatmeal with banana',
            '2 scrambled eggs with toast',
            'grilled chicken salad',
          ].map((example) => (
            <button
              key={example}
              onClick={() => setText(example)}
              className="preset-button text-xs"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
