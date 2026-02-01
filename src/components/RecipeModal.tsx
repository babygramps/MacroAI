'use client';

import { useState, useCallback } from 'react';
import { parseRecipe } from '@/actions/parseRecipe';
import { getAmplifyDataClient } from '@/lib/data/amplifyClient';
import type { ParsedRecipe, ParsedRecipeIngredient } from '@/lib/types';
import { ModalShell } from './ui/ModalShell';
import { showToast } from './ui/Toast';
import { ErrorAlert } from './ui/ErrorAlert';
import { logRemote, getErrorContext } from '@/lib/clientLogger';

interface RecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type View = 'input' | 'review';

/**
 * Modal for creating new recipes from pasted text.
 * Parses recipe with Gemini + USDA hybrid strategy and saves to database.
 */
export function RecipeModal({ isOpen, onClose, onSuccess }: RecipeModalProps) {
  const [view, setView] = useState<View>('input');
  const [recipeText, setRecipeText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Parsed recipe data
  const [parsedRecipe, setParsedRecipe] = useState<ParsedRecipe | null>(null);
  const [selectedIngredients, setSelectedIngredients] = useState<Set<number>>(new Set());

  // Editable fields
  const [recipeName, setRecipeName] = useState('');
  const [totalServings, setTotalServings] = useState('');
  const [servingDescription, setServingDescription] = useState('');

  // Error state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleParse = async () => {
    if (!recipeText.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);
    const startTime = Date.now();
    logRemote.info('Recipe parse started', { textLength: recipeText.length, textPreview: recipeText.substring(0, 100) });

    try {
      const result = await parseRecipe(recipeText);

      logRemote.info('Recipe parse completed', {
        durationMs: Date.now() - startTime,
        success: result.success,
        ingredientsCount: result.recipe?.ingredients?.length ?? 0,
        errorCode: result.error?.code
      });

      if (!result.success || !result.recipe) {
        const errorMsg = result.error?.message || 'Could not parse recipe. Please try again.';
        setErrorMessage(errorMsg);
        return;
      }

      setParsedRecipe(result.recipe);
      setRecipeName(result.recipe.name);
      setTotalServings(result.recipe.totalServings.toString());
      setServingDescription(result.recipe.servingDescription);
      setSelectedIngredients(new Set(result.recipe.ingredients.map((_, i) => i)));
      setView('review');
    } catch (error) {
      logRemote.error('Recipe parse failed', {
        textLength: recipeText.length,
        durationMs: Date.now() - startTime,
        ...getErrorContext(error)
      });
      console.error('Parse error:', error);
      setErrorMessage('Failed to parse recipe. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleIngredient = useCallback((index: number) => {
    setSelectedIngredients((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  }, []);

  const getSelectedIngredients = useCallback((): ParsedRecipeIngredient[] => {
    if (!parsedRecipe) return [];
    return parsedRecipe.ingredients.filter((_, i) => selectedIngredients.has(i));
  }, [parsedRecipe, selectedIngredients]);

  const calculateTotals = useCallback(() => {
    const selected = getSelectedIngredients();
    return selected.reduce(
      (acc, ing) => ({
        calories: acc.calories + ing.calories,
        protein: acc.protein + ing.protein,
        carbs: acc.carbs + ing.carbs,
        fat: acc.fat + ing.fat,
        weight: acc.weight + ing.weightG,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, weight: 0 }
    );
  }, [getSelectedIngredients]);

  const handleSave = async () => {
    if (!parsedRecipe || selectedIngredients.size === 0) return;

    const servingsNum = parseFloat(totalServings) || parsedRecipe.totalServings;
    if (servingsNum <= 0) {
      showToast('Please enter a valid number of servings.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const client = getAmplifyDataClient();
      if (!client) {
        showToast('Amplify is not ready yet. Please try again.', 'error');
        setIsSaving(false);
        return;
      }

      const totals = calculateTotals();
      const now = new Date().toISOString();
      const servingSizeG = Math.round(totals.weight / servingsNum);

      // Create the recipe
      const { data: recipe } = await client.models.Recipe.create({
        name: recipeName || parsedRecipe.name,
        totalYieldG: totals.weight,
        totalServings: servingsNum,
        servingDescription: servingDescription || parsedRecipe.servingDescription,
        servingSizeG,
        totalCalories: totals.calories,
        totalProtein: Math.round(totals.protein * 10) / 10,
        totalCarbs: Math.round(totals.carbs * 10) / 10,
        totalFat: Math.round(totals.fat * 10) / 10,
        createdAt: now,
      });

      if (!recipe) {
        throw new Error('Failed to create recipe');
      }

      // Create all ingredients
      const selectedIngs = getSelectedIngredients();
      await Promise.all(
        selectedIngs.map((ing, index) =>
          client.models.RecipeIngredient.create({
            recipeId: recipe.id,
            name: ing.name,
            weightG: ing.weightG,
            calories: ing.calories,
            protein: ing.protein,
            carbs: ing.carbs,
            fat: ing.fat,
            source: ing.source,
            sortOrder: index,
          })
        )
      );

      showToast(`📖 ${recipeName || parsedRecipe.name} saved!`, 'success');
      handleClose();
      onSuccess();
    } catch (error) {
      console.error('Error saving recipe:', error);
      showToast('Failed to save recipe. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = useCallback(() => {
    setView('input');
    setRecipeText('');
    setParsedRecipe(null);
    setSelectedIngredients(new Set());
    setRecipeName('');
    setTotalServings('');
    setServingDescription('');
    onClose();
  }, [onClose]);

  const handleBack = () => {
    setView('input');
  };

  const totals = parsedRecipe ? calculateTotals() : null;
  const servingsNum = parseFloat(totalServings) || 1;
  const perServing = totals ? {
    calories: Math.round(totals.calories / servingsNum),
    protein: Math.round((totals.protein / servingsNum) * 10) / 10,
    carbs: Math.round((totals.carbs / servingsNum) * 10) / 10,
    fat: Math.round((totals.fat / servingsNum) * 10) / 10,
    weight: Math.round(totals.weight / servingsNum),
  } : null;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      contentClassName="absolute inset-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 
                      sm:max-w-md sm:w-full sm:max-h-[90vh] sm:rounded-2xl
                      bg-bg-primary flex flex-col animate-slide-up"
    >
      <div className="modal-header">
        <button
          onClick={view === 'review' ? handleBack : handleClose}
          className="icon-button -ml-2"
          aria-label={view === 'review' ? 'Back' : 'Close'}
        >
          <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-card-title flex-1 text-center mr-8">
          {view === 'input' ? 'Create Recipe' : 'Review Recipe'}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-safe">
        {view === 'input' ? (
          <>
            <p className="text-body text-text-secondary mb-4">
              Paste a recipe below and we&apos;ll calculate the nutrition for each ingredient.
            </p>

            <textarea
              value={recipeText}
              onChange={(e) => setRecipeText(e.target.value)}
              placeholder="Paste your recipe here...

Example:
Borscht Recipe

Ingredients:
- 2 lbs beef chuck
- 3 medium beets, peeled and diced
- 1 can (14oz) diced tomatoes
- 2 cups cabbage, shredded
- 2 medium potatoes, cubed
- 1 large onion, diced
- 2 carrots, sliced
- 4 cloves garlic, minced
- 6 cups beef broth

Makes about 12 cups"
              className="input-field min-h-[200px] resize-none mb-4 text-sm"
            />

            <button
              onClick={handleParse}
              disabled={isLoading || !recipeText.trim()}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="spinner" />
                  Parsing recipe...
                </>
              ) : (
                <>
                  <span>✨</span>
                  Parse Recipe
                </>
              )}
            </button>

            {/* Error message */}
            {errorMessage ? (
              <ErrorAlert title="Recipe Error" message={errorMessage} className="mt-4" />
            ) : null}
          </>
        ) : parsedRecipe && totals && perServing ? (
          <>
            {/* Recipe name */}
            <div className="mb-4">
              <label className="text-caption block mb-2">Recipe Name</label>
              <input
                type="text"
                value={recipeName}
                onChange={(e) => setRecipeName(e.target.value)}
                className="input-field"
                placeholder="e.g., Grandma's Borscht"
              />
            </div>

            {/* Yield settings */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-caption block mb-2">Servings</label>
                <input
                  type="number"
                  value={totalServings}
                  onChange={(e) => setTotalServings(e.target.value)}
                  className="input-field text-center"
                  min="1"
                  step="0.5"
                />
              </div>
              <div>
                <label className="text-caption block mb-2">Serving Size</label>
                <input
                  type="text"
                  value={servingDescription}
                  onChange={(e) => setServingDescription(e.target.value)}
                  className="input-field"
                  placeholder="e.g., 1 cup"
                />
              </div>
            </div>

            {/* Ingredients */}
            <div className="mb-4">
              <h3 className="text-card-title mb-3 flex items-center gap-2">
                <span>📦</span>
                Ingredients ({selectedIngredients.size})
              </h3>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {parsedRecipe.ingredients.map((ing, index) => (
                  <button
                    key={index}
                    onClick={() => toggleIngredient(index)}
                    className={`card w-full text-left text-sm transition-all ${selectedIngredients.has(index)
                      ? 'border-macro-calories/50'
                      : 'opacity-50'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedIngredients.has(index)
                          ? 'border-macro-calories bg-macro-calories'
                          : 'border-border-subtle'
                          }`}
                      >
                        {selectedIngredients.has(index) && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-text-primary truncate">
                          {ing.name}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-text-secondary">{ing.weightG}g</p>
                        <p className="text-xs text-macro-calories">{ing.calories} kcal</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="card mb-4">
              <h4 className="text-card-title mb-3">Total Recipe Nutrition</h4>
              <div className="macro-grid text-center mb-4">
                <div>
                  <p className="font-mono font-bold text-macro-calories">{totals.calories}</p>
                  <p className="text-caption">kcal</p>
                </div>
                <div>
                  <p className="font-mono font-bold text-macro-protein">{Math.round(totals.protein * 10) / 10}g</p>
                  <p className="text-caption">protein</p>
                </div>
                <div>
                  <p className="font-mono font-bold text-macro-carbs">{Math.round(totals.carbs * 10) / 10}g</p>
                  <p className="text-caption">carbs</p>
                </div>
                <div>
                  <p className="font-mono font-bold text-macro-fat">{Math.round(totals.fat * 10) / 10}g</p>
                  <p className="text-caption">fat</p>
                </div>
              </div>

              <div className="border-t border-border-subtle pt-3">
                <p className="text-caption text-center mb-2">
                  Per {servingDescription || 'serving'} ({perServing.weight}g)
                </p>
                <div className="macro-grid text-center text-sm">
                  <div>
                    <p className="font-mono text-macro-calories">{perServing.calories}</p>
                  </div>
                  <div>
                    <p className="font-mono text-macro-protein">{perServing.protein}g</p>
                  </div>
                  <div>
                    <p className="font-mono text-macro-carbs">{perServing.carbs}g</p>
                  </div>
                  <div>
                    <p className="font-mono text-macro-fat">{perServing.fat}g</p>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={isSaving || selectedIngredients.size === 0}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <div className="spinner" />
                  Saving...
                </>
              ) : (
                <>
                  <span>💾</span>
                  Save Recipe
                </>
              )}
            </button>
          </>
        ) : null}
      </div>
    </ModalShell>
  );
}
