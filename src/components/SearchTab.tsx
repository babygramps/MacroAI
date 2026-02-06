'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { searchFoods } from '@/actions/searchFoods';
import { getRecentFoods } from '@/actions/getRecentFoods';
import { getAmplifyDataClient } from '@/lib/data/amplifyClient';
import type { NormalizedFood, MealCategory, RecentFood, RecentFoodsResponse, MealEntry } from '@/lib/types';
import { MEAL_CATEGORY_INFO } from '@/lib/types';
import { scaleNutrition } from '@/lib/normalizer';
import { onMealLogged } from '@/lib/metabolicService';
import { verifyMealById } from '@/lib/meal/mealVerification';
import { CategoryPicker } from './ui/CategoryPicker';
import { showToast } from './ui/Toast';
import { RecentItemCard, RecentItemCardSkeleton } from './ui/RecentItemCard';
import { ErrorAlert } from './ui/ErrorAlert';
import { SourceBadge } from './ui/SourceBadge';
import { logRemote, getErrorContext, generateTraceId } from '@/lib/clientLogger';
import { getLocalDateString } from '@/lib/date';

interface SearchTabProps {
  onSuccess: (options?: { verified?: boolean; meal?: MealEntry }) => void;
  prefetchedRecents?: RecentFoodsResponse | null;
}

type View = 'search' | 'scanner' | 'detail' | 'category';
type InputMode = 'grams' | 'servings';

const BarcodeScanner = dynamic(
  () => import('./BarcodeScanner').then((mod) => mod.BarcodeScanner),
  {
    ssr: false,
    loading: () => (
      <div className="p-4 text-center text-text-secondary">Loading scanner…</div>
    ),
  }
);

const INITIAL_RESULTS_SHOWN = 5;

export function SearchTab({ onSuccess, prefetchedRecents }: SearchTabProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NormalizedFood[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFood, setSelectedFood] = useState<NormalizedFood | null>(null);
  const [weight, setWeight] = useState('100');
  const [servings, setServings] = useState('1');
  const [inputMode, setInputMode] = useState<InputMode>('grams');
  const [view, setView] = useState<View>('search');
  const [isSaving, setIsSaving] = useState(false);
  const [showAllResults, setShowAllResults] = useState(false);
  const [shakeInput, setShakeInput] = useState(false);

  // Category selection state
  const [category, setCategory] = useState<MealCategory>('snack');
  const [mealName, setMealName] = useState('');

  // Recents state - use prefetched data if available (async-parallel optimization)
  const [recentsData, setRecentsData] = useState<RecentFoodsResponse | null>(prefetchedRecents ?? null);
  const [isLoadingRecents, setIsLoadingRecents] = useState(!prefetchedRecents);

  // Error state for search failures
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Only fetch recents if not prefetched (fallback for when Dashboard didn't prefetch)
  useEffect(() => {
    // If we already have prefetched data, skip fetching
    if (prefetchedRecents) {
      setRecentsData(prefetchedRecents);
      setIsLoadingRecents(false);
      return;
    }

    // Fallback: fetch if no prefetched data available
    let mounted = true;

    async function fetchRecents() {
      try {
        const data = await getRecentFoods();
        if (mounted) {
          setRecentsData(data);
        }
      } catch (error) {
        console.error('Error fetching recents:', error);
      } finally {
        if (mounted) {
          setIsLoadingRecents(false);
        }
      }
    }

    fetchRecents();
    return () => {
      mounted = false;
    };
  }, [prefetchedRecents]);

  // Convert RecentFood to NormalizedFood for selection
  const handleSelectRecentItem = useCallback((item: RecentFood) => {
    const normalizedFood: NormalizedFood = {
      id: item.id,
      name: item.name,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      servingSize: item.servingSize,
      source: item.source as NormalizedFood['source'],
      servingDescription: item.servingDescription ?? undefined,
      servingSizeGrams: item.servingSizeGrams ?? undefined,
    };
    handleSelectFood(normalizedFood);
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      setShakeInput(true);
      setTimeout(() => setShakeInput(false), 400);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setShowAllResults(false);
    const startTime = Date.now();
    logRemote.info('Search started', { query: query.trim() });

    try {
      const result = await searchFoods(query);

      logRemote.info('Search completed', {
        query: query.trim(),
        durationMs: Date.now() - startTime,
        success: result.success,
        resultsCount: result.foods.length,
        errorCode: result.error?.code
      });

      setResults(result.foods);

      if (!result.success && result.error) {
        setErrorMessage(result.error.message);
      }
    } catch (error) {
      logRemote.error('Search failed', {
        query: query.trim(),
        durationMs: Date.now() - startTime,
        ...getErrorContext(error)
      });
      console.error('Search error:', error);
      setErrorMessage('Search failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  const handleBarcodeScanned = async (barcode: string) => {
    setQuery(barcode);
    setView('search');
    setIsLoading(true);
    setErrorMessage(null);
    const startTime = Date.now();
    logRemote.info('Barcode scan started', { barcode });

    try {
      const result = await searchFoods(barcode);

      logRemote.info('Barcode search completed', {
        barcode,
        durationMs: Date.now() - startTime,
        success: result.success,
        resultsCount: result.foods.length
      });

      setResults(result.foods);

      if (!result.success && result.error) {
        setErrorMessage(result.error.message);
      }
    } catch (error) {
      logRemote.error('Barcode search failed', {
        barcode,
        durationMs: Date.now() - startTime,
        ...getErrorContext(error)
      });
      console.error('Barcode search error:', error);
      setErrorMessage('Could not find product. Try searching manually.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectFood = (food: NormalizedFood) => {
    setSelectedFood(food);
    // Reset input mode based on available serving info
    if (food.servingSizeGrams && food.servingDescription && food.servingDescription !== `${food.servingSizeGrams}g`) {
      setInputMode('servings');
      setServings('1');
      setWeight(food.servingSizeGrams.toString());
    } else {
      setInputMode('grams');
      setWeight(food.servingSize.toString());
      setServings('1');
    }
    setView('detail');
  };

  // Calculate effective weight based on input mode
  const getEffectiveWeight = useCallback((): number => {
    if (inputMode === 'servings' && selectedFood?.servingSizeGrams) {
      return Math.round((parseFloat(servings) || 0) * selectedFood.servingSizeGrams);
    }
    return parseInt(weight) || 0;
  }, [inputMode, servings, selectedFood?.servingSizeGrams, weight]);

  const handleContinueToCategory = () => {
    if (!selectedFood) return;

    // Set default meal name and category
    setMealName(selectedFood.name);
    setCategory('snack'); // Default to snack for single items
    setView('category');
  };

  const handleLog = async () => {
    if (!selectedFood) return;

    const traceId = generateTraceId();
    const weightNum = getEffectiveWeight();
    const scaled = scaleNutrition(selectedFood, weightNum);

    logRemote.info('MEAL_LOG_START', {
      traceId,
      tab: 'search',
      foodName: scaled.name,
      category,
      weightG: weightNum,
      calories: scaled.calories,
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
      const now = new Date();
      const nowISO = now.toISOString();
      const localDate = getLocalDateString(now);

      // Create the meal
      const { data: meal } = await client.models.Meal.create({
        name: mealName || scaled.name,
        category,
        eatenAt: nowISO,
        localDate, // Store user's local date for unambiguous day queries
        totalCalories: scaled.calories,
        totalProtein: scaled.protein,
        totalCarbs: scaled.carbs,
        totalFat: scaled.fat,
        totalWeightG: weightNum,
      });

      if (!meal) {
        logRemote.error('MEAL_CREATE_FAILED', { traceId, error: 'Meal.create returned null' });
        throw new Error('Failed to create meal');
      }

      logRemote.info('MEAL_CREATED', { traceId, mealId: meal.id, eatenAt: nowISO, localDate });

      // Create the ingredient
      // Note: servingSizeGrams must be an integer (schema constraint)
      const servingSizeGramsInt = selectedFood.servingSizeGrams
        ? Math.round(selectedFood.servingSizeGrams)
        : undefined;

      const ingredientResult = await client.models.MealIngredient.create({
        mealId: meal.id,
        name: scaled.name,
        eatenAt: nowISO,
        localDate, // Store user's local date for unambiguous day queries
        weightG: weightNum,
        calories: scaled.calories,
        protein: scaled.protein,
        carbs: scaled.carbs,
        fat: scaled.fat,
        source: scaled.source,
        servingDescription: selectedFood.servingDescription || undefined,
        servingSizeGrams: servingSizeGramsInt,
        sortOrder: 0,
      });

      if (ingredientResult.data) {
        logRemote.info('INGREDIENT_CREATED', { traceId, ingredientId: ingredientResult.data.id, mealId: meal.id });
      } else {
        logRemote.error('INGREDIENT_CREATE_FAILED', {
          traceId,
          mealId: meal.id,
          errors: ingredientResult.errors?.map(e => ({ message: e.message, errorType: e.errorType })),
        });
      }

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
        ingredients: [{
          id: ingredientResult.data?.id ?? 'temp-id',
          mealId: meal.id,
          name: ingredientResult.data?.name ?? scaled.name,
          weightG: ingredientResult.data?.weightG ?? weightNum,
          calories: ingredientResult.data?.calories ?? scaled.calories,
          protein: ingredientResult.data?.protein ?? scaled.protein,
          carbs: ingredientResult.data?.carbs ?? scaled.carbs,
          fat: ingredientResult.data?.fat ?? scaled.fat,
          source: ingredientResult.data?.source ?? scaled.source,
          servingDescription: ingredientResult.data?.servingDescription ?? (selectedFood.servingDescription || undefined),
          servingSizeGrams: ingredientResult.data?.servingSizeGrams ?? servingSizeGramsInt,
          sortOrder: 0,
        }]
      };

      const categoryInfo = MEAL_CATEGORY_INFO[category];
      showToast(`${categoryInfo.emoji} ${mealName || scaled.name} logged!`, 'success');
      onSuccess({ verified, meal: optimisticMeal });
    } catch (error) {
      logRemote.error('MEAL_LOG_ERROR', { traceId, ...getErrorContext(error) });
      console.error('Error logging food:', error);
      showToast('Failed to log food. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const effectiveWeight = getEffectiveWeight();
  const scaledFood = selectedFood
    ? scaleNutrition(selectedFood, effectiveWeight)
    : null;

  // Scanner view
  if (view === 'scanner') {
    return (
      <div className="p-4">
        <button
          onClick={() => setView('search')}
          className="mb-4 text-text-secondary flex items-center gap-2 hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to search
        </button>
        <BarcodeScanner onScan={handleBarcodeScanned} />
      </div>
    );
  }

  // Category selection view
  if (view === 'category' && selectedFood && scaledFood) {
    return (
      <div className="p-4 pb-safe">
        <button
          onClick={() => setView('detail')}
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
            placeholder="e.g., Afternoon Snack"
          />
        </div>

        {/* Summary card */}
        <div className="card mb-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{MEAL_CATEGORY_INFO[category].emoji}</span>
            <div>
              <p className="font-medium text-text-primary">{mealName || scaledFood.name}</p>
              <p className="text-caption">{effectiveWeight}g</p>
            </div>
          </div>
          <div className="macro-grid text-center">
            <div>
              <p className="font-mono font-bold text-macro-calories">{scaledFood.calories}</p>
              <p className="text-caption">kcal</p>
            </div>
            <div>
              <p className="font-mono font-bold text-macro-protein">{scaledFood.protein}g</p>
              <p className="text-caption">protein</p>
            </div>
            <div>
              <p className="font-mono font-bold text-macro-carbs">{scaledFood.carbs}g</p>
              <p className="text-caption">carbs</p>
            </div>
            <div>
              <p className="font-mono font-bold text-macro-fat">{scaledFood.fat}g</p>
              <p className="text-caption">fat</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleLog}
          disabled={isSaving}
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

  // Detail view
  if (view === 'detail' && selectedFood && scaledFood) {
    const hasServingInfo = selectedFood.servingSizeGrams &&
      selectedFood.servingDescription &&
      selectedFood.servingDescription !== `${selectedFood.servingSizeGrams}g`;

    return (
      <div className="p-4 pb-safe">
        <button
          onClick={() => setView('search')}
          className="mb-4 text-text-secondary flex items-center gap-2 hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to results
        </button>

        <div className="text-center mb-6">
          <div className="w-20 h-20 bg-bg-elevated rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">🍽️</span>
          </div>
          <h3 className="text-section-title">{selectedFood.name}</h3>
          <div className="flex items-center justify-center gap-2">
            <p className="text-caption">
              per {selectedFood.servingDescription || `${selectedFood.servingSize}g`}
            </p>
            <SourceBadge source={selectedFood.source} compact />
          </div>
        </div>

        {/* Input mode toggle */}
        <div className="flex rounded-xl bg-bg-elevated p-1 mb-4">
          <button
            onClick={() => setInputMode('grams')}
            className={`tab-button rounded-lg ${inputMode === 'grams' ? 'active bg-macro-calories text-white' : ''}`}
          >
            Grams
          </button>
          <button
            onClick={() => setInputMode('servings')}
            className={`tab-button rounded-lg ${inputMode === 'servings' ? 'active bg-macro-calories text-white' : ''}`}
          >
            Servings
          </button>
        </div>

        {/* Grams input mode */}
        {inputMode === 'grams' && (
          <>
            <div className="mb-4">
              <label className="text-caption block mb-2">Weight (grams)</label>
              <input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="input-field text-center text-2xl font-mono"
                min="1"
              />
            </div>

            <div className="flex gap-2 mb-6">
              {[50, 100, 150, 200].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setWeight(preset.toString())}
                  className={`preset-button flex-1 ${weight === preset.toString() ? 'active' : ''}`}
                >
                  {preset}g
                </button>
              ))}
            </div>
          </>
        )}

        {/* Servings input mode */}
        {inputMode === 'servings' && (
          <>
            <div className="mb-4">
              <label className="text-caption block mb-2">
                Number of servings
                {hasServingInfo && (
                  <span className="text-text-muted ml-1">
                    ({selectedFood.servingDescription} = {selectedFood.servingSizeGrams}g)
                  </span>
                )}
              </label>
              <input
                type="number"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                className="input-field text-center text-2xl font-mono"
                min="0.1"
                step="0.25"
              />
            </div>

            <div className="flex gap-2 mb-6">
              {[0.5, 1, 1.5, 2].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setServings(preset.toString())}
                  className={`preset-button flex-1 ${servings === preset.toString() ? 'active' : ''}`}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Show calculated weight */}
            <p className="text-caption text-center mb-4">
              = {effectiveWeight}g
            </p>
          </>
        )}

        <div className="card mb-6">
          <h4 className="text-card-title mb-4">
            Nutrition ({inputMode === 'servings' ? `${servings} serving${parseFloat(servings) !== 1 ? 's' : ''}` : `${weight}g`})
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-caption">Calories</p>
              <p className="text-xl font-mono font-bold text-macro-calories">
                {scaledFood.calories}
              </p>
            </div>
            <div>
              <p className="text-caption">Protein</p>
              <p className="text-xl font-mono font-bold text-macro-protein">
                {scaledFood.protein}g
              </p>
            </div>
            <div>
              <p className="text-caption">Carbs</p>
              <p className="text-xl font-mono font-bold text-macro-carbs">
                {scaledFood.carbs}g
              </p>
            </div>
            <div>
              <p className="text-caption">Fat</p>
              <p className="text-xl font-mono font-bold text-macro-fat">
                {scaledFood.fat}g
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleContinueToCategory}
          disabled={effectiveWeight <= 0}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    );
  }

  // Search view
  return (
    <div className="p-4 pb-safe">
      {/* Search input */}
      <div className="relative mb-4">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search foods..."
          className={`input-field !pl-12 !pr-10 ${shakeInput ? 'animate-input-shake' : ''}`}
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
          >
            ✕
          </button>
        )}
      </div>

      {/* Barcode button */}
      <button
        onClick={() => setView('scanner')}
        className="w-full btn-secondary flex items-center justify-center gap-2 mb-6"
      >
        <span>📷</span>
        Scan Barcode
      </button>

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-16 w-full" />
          ))}
        </div>
      )}

      {/* Results */}
      {!isLoading && results.length > 0 && (
        <div className="flex flex-col gap-2">
          {(showAllResults ? results : results.slice(0, INITIAL_RESULTS_SHOWN)).map((food, index) => (
            <button
              key={`${food.source}-${food.originalId || food.name}-${index}`}
              onClick={() => handleSelectFood(food)}
              className="card-interactive text-left animate-stagger opacity-0"
              style={{ '--stagger-index': index } as React.CSSProperties}
            >
              <div className="flex items-center gap-2">
                <p className="font-medium text-text-primary truncate">{food.name}</p>
                {index === 0 && results.length > 1 && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-macro-protein/15 text-macro-protein whitespace-nowrap">
                    Best Match
                  </span>
                )}
                <SourceBadge source={food.source} compact />
              </div>
              <p className="text-caption">
                {food.calories} kcal per {food.servingSize}g
              </p>
            </button>
          ))}
          {results.length > INITIAL_RESULTS_SHOWN && !showAllResults && (
            <button
              onClick={() => setShowAllResults(true)}
              className="text-sm text-text-secondary hover:text-macro-calories transition-colors py-2 text-center"
            >
              Show {results.length - INITIAL_RESULTS_SHOWN} more results
            </button>
          )}
          {showAllResults && results.length > INITIAL_RESULTS_SHOWN && (
            <button
              onClick={() => setShowAllResults(false)}
              className="text-sm text-text-secondary hover:text-macro-calories transition-colors py-2 text-center"
            >
              Show less
            </button>
          )}
        </div>
      )}

      {/* No results */}
      {!isLoading && query && results.length === 0 && (
        <div className="text-center py-8">
          <p className="text-4xl mb-4">🔍</p>
          <p className="text-body text-text-secondary">No foods found</p>
          <p className="text-caption mt-2">Try a different search term</p>
        </div>
      )}

      {/* Error message */}
      {errorMessage ? (
        <ErrorAlert title="Search Error" message={errorMessage} className="mb-4" />
      ) : null}

      {/* Initial state - show recents when no query */}
      {!isLoading && !query && results.length === 0 && (
        <>
          {/* Loading state */}
          {isLoadingRecents ? (
            <div className="space-y-3">
              <RecentItemCardSkeleton />
              <RecentItemCardSkeleton />
              <RecentItemCardSkeleton />
            </div>
          ) : recentsData && (recentsData.recentMeals.length > 0 || recentsData.recentIngredients.length > 0) ? (
            <>
              {/* Recent Meals section */}
              {recentsData.recentMeals.length > 0 ? (
                <div className="mb-6">
                  <h3 className="text-card-title mb-3 flex items-center gap-2">
                    <span>🍽️</span>
                    Recent Meals
                  </h3>
                  <div className="space-y-2">
                    {recentsData.recentMeals.map((meal) => (
                      <RecentItemCard
                        key={meal.id}
                        item={meal}
                        onSelect={handleSelectRecentItem}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Frequent Foods section */}
              {recentsData.recentIngredients.length > 0 ? (
                <div className="mb-6">
                  <h3 className="text-card-title mb-3 flex items-center gap-2">
                    <span>⭐</span>
                    Frequent Foods
                  </h3>
                  <div className="space-y-2">
                    {recentsData.recentIngredients.map((ingredient) => (
                      <RecentItemCard
                        key={ingredient.id}
                        item={ingredient}
                        onSelect={handleSelectRecentItem}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            /* Empty state - no recents yet */
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-bg-elevated rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">🍎</span>
              </div>
              <h3 className="text-section-title mb-2">Search for a Food</h3>
              <p className="text-body text-text-secondary mb-2">
                Type a food name or scan a barcode
              </p>
              <p className="text-caption text-text-muted">
                Foods you log will appear here for quick access
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
