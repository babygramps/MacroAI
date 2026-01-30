'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getRecipes } from '@/actions/getRecipes';
import { getAmplifyDataClient } from '@/lib/data/amplifyClient';
import type { RecipeEntry, MealCategory, ScaledRecipePortion } from '@/lib/types';
import { MEAL_CATEGORY_INFO } from '@/lib/types';
import { onMealLogged } from '@/lib/metabolicService';
import { verifyMealCreated } from '@/lib/meal/mealVerification';
import { logRemote, getErrorContext, generateTraceId } from '@/lib/clientLogger';
import { RecipeCard, RecipeCardSkeleton } from './ui/RecipeCard';
import { CategoryPicker } from './ui/CategoryPicker';
import { showToast } from './ui/Toast';
import { RecipeModal } from './RecipeModal';

interface RecipeTabProps {
  onSuccess: (options?: { verified?: boolean }) => void;
}

type View = 'list' | 'portion' | 'category';
type InputMode = 'servings' | 'grams';

/**
 * Scale recipe nutrition to a specific portion
 */
function scaleRecipePortion(
  recipe: RecipeEntry,
  portionAmount: number,
  portionMode: InputMode
): ScaledRecipePortion {
  let portionWeightG: number;

  if (portionMode === 'servings') {
    const servingSizeG = recipe.servingSizeG || Math.round(recipe.totalYieldG / recipe.totalServings);
    portionWeightG = portionAmount * servingSizeG;
  } else {
    portionWeightG = portionAmount;
  }

  const scaleFactor = portionWeightG / recipe.totalYieldG;

  return {
    weightG: Math.round(portionWeightG),
    calories: Math.round(recipe.totalCalories * scaleFactor),
    protein: Math.round(recipe.totalProtein * scaleFactor * 10) / 10,
    carbs: Math.round(recipe.totalCarbs * scaleFactor * 10) / 10,
    fat: Math.round(recipe.totalFat * scaleFactor * 10) / 10,
    scaleFactor,
  };
}

/**
 * Tab component for logging meals from saved recipes.
 * Shows list of saved recipes and allows portion-based logging.
 */
export function RecipeTab({ onSuccess }: RecipeTabProps) {
  // Data state
  const [recipes, setRecipes] = useState<RecipeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Selection state
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeEntry | null>(null);
  const [view, setView] = useState<View>('list');

  // Modal state
  const [showRecipeModal, setShowRecipeModal] = useState(false);

  // Portion input state
  const [portionAmount, setPortionAmount] = useState('1');
  const [inputMode, setInputMode] = useState<InputMode>('servings');

  // Category selection state
  const [category, setCategory] = useState<MealCategory>('meal');
  const [mealName, setMealName] = useState('');

  // Fetch recipes on mount
  const fetchRecipes = useCallback(async () => {
    setIsLoading(true);
    try {
      const { recipes: data } = await getRecipes();
      setRecipes(data);
    } catch (error) {
      console.error('Error fetching recipes:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

  // Calculate scaled nutrition based on inputs
  const scaledPortion = useMemo(() => {
    if (!selectedRecipe) return null;

    const amount = parseFloat(portionAmount) || 0;
    if (amount <= 0) {
      return {
        weightG: 0,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        scaleFactor: 0,
      };
    }

    return scaleRecipePortion(selectedRecipe, amount, inputMode);
  }, [selectedRecipe, portionAmount, inputMode]);

  // Handle recipe selection
  const handleSelectRecipe = useCallback((recipe: RecipeEntry) => {
    setSelectedRecipe(recipe);
    setPortionAmount('1');
    setInputMode('servings');
    setMealName(recipe.name);
    setCategory('meal');
    setView('portion');
  }, []);

  // Continue to category selection
  const handleContinueToCategory = useCallback(() => {
    if (!selectedRecipe || !scaledPortion || scaledPortion.weightG <= 0) return;
    setView('category');
  }, [selectedRecipe, scaledPortion]);

  // Log the recipe portion as a meal
  const handleLog = useCallback(async () => {
    if (!selectedRecipe || !scaledPortion || scaledPortion.scaleFactor <= 0) return;

    const traceId = generateTraceId();

    logRemote.info('MEAL_LOG_START', {
      traceId,
      tab: 'recipe',
      recipeName: selectedRecipe.name,
      mealName,
      category,
      portionWeightG: scaledPortion.weightG,
      scaleFactor: scaledPortion.scaleFactor,
      ingredientCount: selectedRecipe.ingredients.length,
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

      const now = new Date().toISOString();

      // Create the meal
      const { data: meal } = await client.models.Meal.create({
        name: mealName || selectedRecipe.name,
        category,
        eatenAt: now,
        totalCalories: scaledPortion.calories,
        totalProtein: scaledPortion.protein,
        totalCarbs: scaledPortion.carbs,
        totalFat: scaledPortion.fat,
        totalWeightG: scaledPortion.weightG,
      });

      if (!meal) {
        logRemote.error('MEAL_CREATE_FAILED', { traceId, error: 'Meal.create returned null' });
        throw new Error('Failed to create meal');
      }

      logRemote.info('MEAL_CREATED', { traceId, mealId: meal.id, eatenAt: now });

      // Create scaled ingredients
      const ingredientResults = await Promise.all(
        selectedRecipe.ingredients.map((ing, index) =>
          client.models.MealIngredient.create({
            mealId: meal.id,
            name: ing.name,
            eatenAt: now,
            weightG: Math.round(ing.weightG * scaledPortion.scaleFactor),
            calories: Math.round(ing.calories * scaledPortion.scaleFactor),
            protein: Math.round(ing.protein * scaledPortion.scaleFactor * 10) / 10,
            carbs: Math.round(ing.carbs * scaledPortion.scaleFactor * 10) / 10,
            fat: Math.round(ing.fat * scaledPortion.scaleFactor * 10) / 10,
            source: ing.source,
            sortOrder: index,
          })
        )
      );

      const ingredientsCreated = ingredientResults.filter(r => r.data).length;
      logRemote.info('INGREDIENTS_CREATED', { traceId, mealId: meal.id, count: ingredientsCreated, expected: selectedRecipe.ingredients.length });

      // Verify meal is readable with exponential backoff retry
      const { verified, attempts } = await verifyMealCreated(client, meal.id, now, { traceId });

      // Trigger metabolic recalculation
      await onMealLogged(now);

      logRemote.info('MEAL_LOG_COMPLETE', { traceId, mealId: meal.id, verified, attempts });

      const categoryInfo = MEAL_CATEGORY_INFO[category];
      showToast(`${categoryInfo.emoji} ${mealName || selectedRecipe.name} logged!`, 'success');
      onSuccess({ verified });
    } catch (error) {
      logRemote.error('MEAL_LOG_ERROR', { traceId, ...getErrorContext(error) });
      console.error('Error logging recipe portion:', error);
      showToast('Failed to log meal. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [selectedRecipe, scaledPortion, category, mealName, onSuccess]);

  // Back navigation
  const handleBack = useCallback(() => {
    if (view === 'category') {
      setView('portion');
    } else {
      setView('list');
      setSelectedRecipe(null);
    }
  }, [view]);

  // Recipe modal success
  const handleRecipeModalSuccess = useCallback(() => {
    setShowRecipeModal(false);
    fetchRecipes();
  }, [fetchRecipes]);

  const servingLabel = selectedRecipe?.servingDescription || 'serving';
  const servingSizeG = selectedRecipe?.servingSizeG ||
    (selectedRecipe ? Math.round(selectedRecipe.totalYieldG / selectedRecipe.totalServings) : 0);

  // Category selection view
  if (view === 'category' && selectedRecipe && scaledPortion) {
    const portionLabel = inputMode === 'servings'
      ? `${portionAmount} ${servingLabel}${parseFloat(portionAmount) !== 1 ? 's' : ''}`
      : `${scaledPortion.weightG}g`;

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
            placeholder="e.g., Lunch"
          />
        </div>

        {/* Summary card */}
        <div className="card mb-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{MEAL_CATEGORY_INFO[category].emoji}</span>
            <div>
              <p className="font-medium text-text-primary">{mealName || selectedRecipe.name}</p>
              <p className="text-caption">{portionLabel} ({scaledPortion.weightG}g)</p>
            </div>
          </div>
          <div className="macro-grid text-center">
            <div>
              <p className="font-mono font-bold text-macro-calories">{scaledPortion.calories}</p>
              <p className="text-caption">kcal</p>
            </div>
            <div>
              <p className="font-mono font-bold text-macro-protein">{scaledPortion.protein}g</p>
              <p className="text-caption">protein</p>
            </div>
            <div>
              <p className="font-mono font-bold text-macro-carbs">{scaledPortion.carbs}g</p>
              <p className="text-caption">carbs</p>
            </div>
            <div>
              <p className="font-mono font-bold text-macro-fat">{scaledPortion.fat}g</p>
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

  // Portion selection view
  if (view === 'portion' && selectedRecipe && scaledPortion) {
    return (
      <div className="p-4 pb-safe">
        <button
          onClick={handleBack}
          className="mb-4 text-text-secondary flex items-center gap-2 hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to recipes
        </button>

        <div className="text-center mb-6">
          <div className="w-20 h-20 bg-bg-elevated rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">📖</span>
          </div>
          <h3 className="text-section-title">{selectedRecipe.name}</h3>
          <p className="text-caption">
            {selectedRecipe.totalServings} {servingLabel}s total · {selectedRecipe.totalYieldG}g
          </p>
        </div>

        {/* Input mode toggle */}
        <div className="flex rounded-xl bg-bg-elevated p-1 mb-4">
          <button
            onClick={() => {
              setInputMode('servings');
              setPortionAmount('1');
            }}
            className={`tab-button rounded-lg ${inputMode === 'servings' ? 'active bg-macro-calories text-white' : ''}`}
          >
            Servings
          </button>
          <button
            onClick={() => {
              setInputMode('grams');
              setPortionAmount(servingSizeG.toString());
            }}
            className={`tab-button rounded-lg ${inputMode === 'grams' ? 'active bg-macro-calories text-white' : ''}`}
          >
            Grams
          </button>
        </div>

        {inputMode === 'servings' ? (
          <>
            <div className="mb-4">
              <label className="text-caption block mb-2">
                How many {servingLabel}s?
              </label>
              <input
                type="number"
                value={portionAmount}
                onChange={(e) => setPortionAmount(e.target.value)}
                className="input-field text-center text-2xl font-mono"
                min="0.25"
                step="0.25"
              />
            </div>

            <div className="flex gap-2 mb-4">
              {[0.5, 1, 1.5, 2].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setPortionAmount(preset.toString())}
                  className={`preset-button flex-1 ${portionAmount === preset.toString() ? 'active' : ''}`}
                >
                  {preset}
                </button>
              ))}
            </div>

            <p className="text-caption text-center mb-4">
              = {scaledPortion.weightG}g
            </p>
          </>
        ) : (
          <>
            <div className="mb-4">
              <label className="text-caption block mb-2">Weight (grams)</label>
              <input
                type="number"
                value={portionAmount}
                onChange={(e) => setPortionAmount(e.target.value)}
                className="input-field text-center text-2xl font-mono"
                min="1"
              />
            </div>

            <div className="flex gap-2 mb-6">
              {[100, 200, 300, 400].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setPortionAmount(preset.toString())}
                  className={`preset-button flex-1 ${portionAmount === preset.toString() ? 'active' : ''}`}
                >
                  {preset}g
                </button>
              ))}
            </div>
          </>
        )}

        <div className="card mb-6">
          <h4 className="text-card-title mb-4">
            Nutrition ({inputMode === 'servings'
              ? `${portionAmount} ${servingLabel}${parseFloat(portionAmount) !== 1 ? 's' : ''}`
              : `${scaledPortion.weightG}g`})
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-caption">Calories</p>
              <p className="text-xl font-mono font-bold text-macro-calories">
                {scaledPortion.calories}
              </p>
            </div>
            <div>
              <p className="text-caption">Protein</p>
              <p className="text-xl font-mono font-bold text-macro-protein">
                {scaledPortion.protein}g
              </p>
            </div>
            <div>
              <p className="text-caption">Carbs</p>
              <p className="text-xl font-mono font-bold text-macro-carbs">
                {scaledPortion.carbs}g
              </p>
            </div>
            <div>
              <p className="text-caption">Fat</p>
              <p className="text-xl font-mono font-bold text-macro-fat">
                {scaledPortion.fat}g
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleContinueToCategory}
          disabled={scaledPortion.weightG <= 0}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    );
  }

  // List view
  return (
    <div className="p-4 pb-safe">
      {/* Add recipe button */}
      <button
        onClick={() => setShowRecipeModal(true)}
        className="card w-full text-left mb-4 border-dashed border-2 hover:border-macro-calories/50 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-bg-elevated rounded-lg flex items-center justify-center group-hover:bg-macro-calories/20 transition-colors">
            <svg className="w-5 h-5 text-text-secondary group-hover:text-macro-calories" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-text-primary group-hover:text-macro-calories transition-colors">
              Add New Recipe
            </p>
            <p className="text-caption text-text-secondary">
              Paste a recipe to calculate nutrition
            </p>
          </div>
        </div>
      </button>

      {/* Loading state */}
      {isLoading ? (
        <div className="space-y-3">
          <RecipeCardSkeleton />
          <RecipeCardSkeleton />
          <RecipeCardSkeleton />
        </div>
      ) : recipes.length > 0 ? (
        <>
          <h3 className="text-card-title mb-3 flex items-center gap-2">
            <span>📖</span>
            My Recipes
          </h3>
          <div className="space-y-2">
            {recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onSelect={handleSelectRecipe}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-bg-elevated rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">📖</span>
          </div>
          <h3 className="text-section-title mb-2">No Recipes Yet</h3>
          <p className="text-body text-text-secondary">
            Add a recipe to quickly log portions with calculated nutrition.
          </p>
        </div>
      )}

      {/* Recipe Modal */}
      <RecipeModal
        isOpen={showRecipeModal}
        onClose={() => setShowRecipeModal(false)}
        onSuccess={handleRecipeModalSuccess}
      />
    </div>
  );
}
