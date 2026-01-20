'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getRecentFoods } from '@/actions/getRecentFoods';
import { getAmplifyDataClient } from '@/lib/data/amplifyClient';
import type { RecentFood, RecentFoodsResponse, MealCategory, NormalizedFood } from '@/lib/types';
import { MEAL_CATEGORY_INFO } from '@/lib/types';
import { scaleNutrition } from '@/lib/normalizer';
import { onMealLogged } from '@/lib/metabolicService';
import { RecentItemCard, RecentItemCardSkeleton } from './ui/RecentItemCard';
import { CategoryPicker } from './ui/CategoryPicker';
import { showToast } from './ui/Toast';

interface RecentsTabProps {
  onSuccess: () => void;
}

type View = 'list' | 'detail' | 'category';
type InputMode = 'grams' | 'servings';

/**
 * Tab component for displaying and logging recently/frequently logged foods.
 * Shows two sections: Recent Meals and Frequent Foods (ingredients).
 * 
 * Follows Vercel React Best Practices:
 * - rerender-functional-setstate: Functional updates in callbacks
 * - rerender-memo: Memoize derived state with useMemo
 * - rendering-conditional-render: Ternary operators for conditionals
 */
export function RecentsTab({ onSuccess }: RecentsTabProps) {
  // Data state
  const [recentsData, setRecentsData] = useState<RecentFoodsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Selection state
  const [selectedItem, setSelectedItem] = useState<RecentFood | null>(null);
  const [view, setView] = useState<View>('list');

  // Weight/serving input state
  const [weight, setWeight] = useState('100');
  const [servings, setServings] = useState('1');
  const [inputMode, setInputMode] = useState<InputMode>('grams');

  // Category selection state
  const [category, setCategory] = useState<MealCategory>('snack');
  const [mealName, setMealName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Fetch recents on mount
  useEffect(() => {
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
          setIsLoading(false);
        }
      }
    }

    fetchRecents();
    return () => {
      mounted = false;
    };
  }, []);

  // Calculate effective weight based on input mode (rerender-functional-setstate)
  const getEffectiveWeight = useCallback((): number => {
    if (inputMode === 'servings' && selectedItem?.servingSizeGrams) {
      return Math.round((parseFloat(servings) || 0) * selectedItem.servingSizeGrams);
    }
    return parseInt(weight) || 0;
  }, [inputMode, servings, selectedItem?.servingSizeGrams, weight]);

  // Memoize scaled nutrition (rerender-memo)
  const scaledNutrition = useMemo(() => {
    if (!selectedItem) return null;

    const effectiveWeight = getEffectiveWeight();
    if (effectiveWeight <= 0) return null;

    // Create a NormalizedFood-like object for scaling
    const baseFood: NormalizedFood = {
      name: selectedItem.name,
      calories: selectedItem.calories,
      protein: selectedItem.protein,
      carbs: selectedItem.carbs,
      fat: selectedItem.fat,
      servingSize: selectedItem.servingSize,
      source: selectedItem.source as NormalizedFood['source'],
      servingDescription: selectedItem.servingDescription ?? undefined,
      servingSizeGrams: selectedItem.servingSizeGrams ?? undefined,
    };

    return scaleNutrition(baseFood, effectiveWeight);
  }, [selectedItem, getEffectiveWeight]);

  // Handle item selection
  const handleSelectItem = useCallback((item: RecentFood) => {
    setSelectedItem(item);
    
    // For meals, allow quick re-log with same weight
    if (item.type === 'meal') {
      setWeight(item.servingSize.toString());
      setInputMode('grams');
      setMealName(item.name);
      setCategory(item.category || 'meal');
    } else {
      // For ingredients, check if there's serving info
      if (item.servingSizeGrams && item.servingDescription) {
        setInputMode('servings');
        setServings('1');
        setWeight(item.servingSizeGrams.toString());
      } else {
        setInputMode('grams');
        setWeight(item.servingSize.toString());
        setServings('1');
      }
      setMealName(item.name);
      setCategory('snack');
    }
    
    setView('detail');
  }, []);

  // Continue to category selection
  const handleContinueToCategory = useCallback(() => {
    if (!selectedItem) return;
    setView('category');
  }, [selectedItem]);

  // Log the food
  const handleLog = useCallback(async () => {
    if (!selectedItem || !scaledNutrition) return;

    setIsSaving(true);
    try {
      const client = getAmplifyDataClient();
      if (!client) {
        showToast('Amplify is not ready yet. Please try again.', 'error');
        setIsSaving(false);
        return;
      }

      const weightNum = getEffectiveWeight();
      const now = new Date().toISOString();

      // For meals with ingredients, re-create the full meal with scaled ingredients
      if (selectedItem.type === 'meal' && selectedItem.ingredients && selectedItem.ingredients.length > 0) {
        // Scale factor based on total weight change
        const scaleFactor = weightNum / selectedItem.servingSize;

        // Create the meal
        const { data: meal } = await client.models.Meal.create({
          name: mealName || selectedItem.name,
          category,
          eatenAt: now,
          totalCalories: scaledNutrition.calories,
          totalProtein: scaledNutrition.protein,
          totalCarbs: scaledNutrition.carbs,
          totalFat: scaledNutrition.fat,
          totalWeightG: weightNum,
        });

        if (!meal) {
          throw new Error('Failed to create meal');
        }

        // Create all ingredients with scaled values
        await Promise.all(
          selectedItem.ingredients.map((ing, index) =>
            client.models.MealIngredient.create({
              mealId: meal.id,
              name: ing.name,
              eatenAt: now,
              weightG: Math.round(ing.weightG * scaleFactor),
              calories: Math.round(ing.calories * scaleFactor),
              protein: Math.round(ing.protein * scaleFactor * 10) / 10,
              carbs: Math.round(ing.carbs * scaleFactor * 10) / 10,
              fat: Math.round(ing.fat * scaleFactor * 10) / 10,
              source: ing.source,
              servingDescription: ing.servingDescription ?? undefined,
              servingSizeGrams: ing.servingSizeGrams ?? undefined,
              sortOrder: index,
            })
          )
        );
      } else {
        // Single ingredient - create meal + single ingredient
        const { data: meal } = await client.models.Meal.create({
          name: mealName || scaledNutrition.name,
          category,
          eatenAt: now,
          totalCalories: scaledNutrition.calories,
          totalProtein: scaledNutrition.protein,
          totalCarbs: scaledNutrition.carbs,
          totalFat: scaledNutrition.fat,
          totalWeightG: weightNum,
        });

        if (!meal) {
          throw new Error('Failed to create meal');
        }

        await client.models.MealIngredient.create({
          mealId: meal.id,
          name: scaledNutrition.name,
          eatenAt: now,
          weightG: weightNum,
          calories: scaledNutrition.calories,
          protein: scaledNutrition.protein,
          carbs: scaledNutrition.carbs,
          fat: scaledNutrition.fat,
          source: scaledNutrition.source,
          servingDescription: selectedItem.servingDescription ?? undefined,
          servingSizeGrams: selectedItem.servingSizeGrams ?? undefined,
          sortOrder: 0,
        });
      }

      // Trigger metabolic recalculation
      await onMealLogged(now);

      const categoryInfo = MEAL_CATEGORY_INFO[category];
      showToast(`${categoryInfo.emoji} ${mealName || selectedItem.name} logged!`, 'success');
      onSuccess();
    } catch (error) {
      console.error('Error logging food:', error);
      showToast('Failed to log food. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [selectedItem, scaledNutrition, getEffectiveWeight, category, mealName, onSuccess]);

  // Back to list
  const handleBack = useCallback(() => {
    if (view === 'category') {
      setView('detail');
    } else {
      setView('list');
      setSelectedItem(null);
    }
  }, [view]);

  const effectiveWeight = getEffectiveWeight();
  const hasContent = recentsData && (recentsData.recentMeals.length > 0 || recentsData.recentIngredients.length > 0);

  // Category selection view
  if (view === 'category' && selectedItem && scaledNutrition) {
    return (
      <div className="p-4 pb-safe">
        <button
          onClick={handleBack}
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
              <p className="font-medium text-text-primary">{mealName || selectedItem.name}</p>
              <p className="text-caption">{effectiveWeight}g</p>
            </div>
          </div>
          <div className="macro-grid text-center">
            <div>
              <p className="font-mono font-bold text-macro-calories">{scaledNutrition.calories}</p>
              <p className="text-caption">kcal</p>
            </div>
            <div>
              <p className="font-mono font-bold text-macro-protein">{scaledNutrition.protein}g</p>
              <p className="text-caption">protein</p>
            </div>
            <div>
              <p className="font-mono font-bold text-macro-carbs">{scaledNutrition.carbs}g</p>
              <p className="text-caption">carbs</p>
            </div>
            <div>
              <p className="font-mono font-bold text-macro-fat">{scaledNutrition.fat}g</p>
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
              Logging...
            </>
          ) : (
            `Log ${MEAL_CATEGORY_INFO[category].label}`
          )}
        </button>
      </div>
    );
  }

  // Detail view (weight/servings selection)
  if (view === 'detail' && selectedItem && scaledNutrition) {
    const hasServingInfo = selectedItem.servingSizeGrams && 
      selectedItem.servingDescription && 
      selectedItem.servingDescription !== `${selectedItem.servingSizeGrams}g`;

    return (
      <div className="p-4 pb-safe">
        <button
          onClick={handleBack}
          className="mb-4 text-text-secondary flex items-center gap-2 hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to recents
        </button>

        <div className="text-center mb-6">
          <div className="w-20 h-20 bg-bg-elevated rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">
              {selectedItem.type === 'meal' ? '🍽️' : '🥘'}
            </span>
          </div>
          <h3 className="text-section-title">{selectedItem.name}</h3>
          <p className="text-caption">
            Logged {selectedItem.logCount} time{selectedItem.logCount !== 1 ? 's' : ''}
          </p>
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
        {inputMode === 'grams' ? (
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
        ) : (
          <>
            <div className="mb-4">
              <label className="text-caption block mb-2">
                Number of servings
                {hasServingInfo ? (
                  <span className="text-text-muted ml-1">
                    ({selectedItem.servingDescription} = {selectedItem.servingSizeGrams}g)
                  </span>
                ) : null}
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
                {scaledNutrition.calories}
              </p>
            </div>
            <div>
              <p className="text-caption">Protein</p>
              <p className="text-xl font-mono font-bold text-macro-protein">
                {scaledNutrition.protein}g
              </p>
            </div>
            <div>
              <p className="text-caption">Carbs</p>
              <p className="text-xl font-mono font-bold text-macro-carbs">
                {scaledNutrition.carbs}g
              </p>
            </div>
            <div>
              <p className="text-caption">Fat</p>
              <p className="text-xl font-mono font-bold text-macro-fat">
                {scaledNutrition.fat}g
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

  // List view (main recents display)
  return (
    <div className="p-4 pb-safe">
      {/* Loading state */}
      {isLoading ? (
        <div className="space-y-3">
          <RecentItemCardSkeleton />
          <RecentItemCardSkeleton />
          <RecentItemCardSkeleton />
        </div>
      ) : hasContent ? (
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
                    onSelect={handleSelectItem}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* Frequent Foods section */}
          {recentsData.recentIngredients.length > 0 ? (
            <div>
              <h3 className="text-card-title mb-3 flex items-center gap-2">
                <span>⭐</span>
                Frequent Foods
              </h3>
              <div className="space-y-2">
                {recentsData.recentIngredients.map((ingredient) => (
                  <RecentItemCard
                    key={ingredient.id}
                    item={ingredient}
                    onSelect={handleSelectItem}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        /* Empty state */
        <div className="text-center py-12">
          <div className="w-20 h-20 bg-bg-elevated rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">📋</span>
          </div>
          <h3 className="text-section-title mb-2">No Recent Foods</h3>
          <p className="text-body text-text-secondary mb-2">
            Foods you log will appear here for quick access.
          </p>
          <p className="text-caption text-text-muted">
            Start by searching for a food or scanning a barcode!
          </p>
        </div>
      )}
    </div>
  );
}
