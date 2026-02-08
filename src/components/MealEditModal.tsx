'use client';

import { useState, useEffect } from 'react';
import type { MealEntry, IngredientEntry, MealCategory, NormalizedFood } from '@/lib/types';
import { calculateMealTotals } from '@/lib/meal/totals';
import { CategoryPicker } from './ui/CategoryPicker';
import { IngredientCard } from './ui/IngredientCard';
import { searchFoods } from '@/actions/searchFoods';
import { scaleNutrition } from '@/lib/normalizer';
import { ModalShell } from './ui/ModalShell';
import { SourceBadge } from './ui/SourceBadge';
import { logError } from '@/lib/logger';

interface MealEditModalProps {
  isOpen: boolean;
  meal: MealEntry | null;
  onClose: () => void;
  onSave: (meal: MealEntry) => Promise<void>;
  onDelete?: (mealId: string) => void;
}

type View = 'edit' | 'add-ingredient';

export function MealEditModal({ isOpen, meal, onClose, onSave, onDelete }: MealEditModalProps) {
  const [view, setView] = useState<View>('edit');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<MealCategory>('meal');
  const [ingredients, setIngredients] = useState<IngredientEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Add ingredient search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NormalizedFood[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState<NormalizedFood | null>(null);
  const [addWeight, setAddWeight] = useState('100');

  // Reset state when meal changes
  useEffect(() => {
    if (meal) {
      setName(meal.name);
      setCategory(meal.category);
      setIngredients([...meal.ingredients]);
      setView('edit');
      setSearchQuery('');
      setSearchResults([]);
      setSelectedFood(null);
    }
  }, [meal]);

  if (!isOpen || !meal) return null;

  // Calculate totals from current ingredients
  const totals = calculateMealTotals(ingredients);

  const handleUpdateIngredient = async (id: string, updates: Partial<IngredientEntry>) => {
    setIngredients((prev) =>
      prev.map((ing) => (ing.id === id ? { ...ing, ...updates } : ing))
    );
  };

  const handleRemoveIngredient = (id: string) => {
    setIngredients((prev) => prev.filter((ing) => ing.id !== id));
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const result = await searchFoods(searchQuery);
      setSearchResults(result.foods);
    } catch (error) {
      logError('Search error', { error });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectFood = (food: NormalizedFood) => {
    setSelectedFood(food);
    setAddWeight(food.servingSize.toString());
  };

  const handleAddIngredient = () => {
    if (!selectedFood) return;

    const weightNum = parseInt(addWeight) || 100;
    const scaled = scaleNutrition(selectedFood, weightNum);

    const newIngredient: IngredientEntry = {
      id: `temp-${Date.now()}`, // Temporary ID, will be replaced on save
      mealId: meal.id,
      name: scaled.name,
      weightG: weightNum,
      calories: scaled.calories,
      protein: scaled.protein,
      carbs: scaled.carbs,
      fat: scaled.fat,
      source: scaled.source,
      servingDescription: selectedFood.servingDescription || null,
      servingSizeGrams: selectedFood.servingSizeGrams || null,
      sortOrder: ingredients.length,
    };

    setIngredients((prev) => [...prev, newIngredient]);

    // Reset add ingredient state and go back to edit view
    setView('edit');
    setSearchQuery('');
    setSearchResults([]);
    setSelectedFood(null);
    setAddWeight('100');
  };

  const handleSave = async () => {
    if (ingredients.length === 0) return;

    setIsSaving(true);
    try {
      const updatedMeal: MealEntry = {
        ...meal,
        name,
        category,
        ...totals,
        ingredients,
      };
      await onSave(updatedMeal);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || !confirm('Are you sure you want to delete this meal?')) return;

    setIsDeleting(true);
    try {
      await onDelete(meal.id);
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Edit meal"
      contentClassName="absolute inset-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 
                      sm:max-w-md sm:w-full sm:max-h-[90vh] sm:rounded-2xl
                      bg-bg-primary flex flex-col animate-slide-up"
    >
      <div className="modal-header">
        <button
          onClick={view === 'add-ingredient' ? () => setView('edit') : onClose}
          className="icon-button -ml-2"
          aria-label={view === 'add-ingredient' ? 'Back' : 'Close'}
        >
          <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-card-title flex-1 text-center mr-8">
          {view === 'add-ingredient' ? 'Add Ingredient' : 'Edit Meal'}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-safe">
        {view === 'edit' ? (
          <>
            <div className="mb-4">
              <label className="text-caption block mb-2">Meal Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                placeholder="e.g., Tom Kha Soup with Rice"
              />
            </div>

            {/* Category picker */}
            <div className="mb-6">
              <label className="text-caption block mb-2">Category</label>
              <CategoryPicker value={category} onChange={setCategory} />
            </div>

            {/* Ingredients list */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-card-title">
                  Ingredients ({ingredients.length})
                </h3>
              </div>

              {ingredients.length > 0 ? (
                <div className="space-y-2 mb-3">
                  {ingredients.map((ingredient) => (
                    <IngredientCard
                      key={ingredient.id}
                      ingredient={ingredient}
                      onUpdate={handleUpdateIngredient}
                      onRemove={handleRemoveIngredient}
                      isEditable={true}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 bg-bg-surface rounded-lg mb-3">
                  <p className="text-text-secondary text-sm">No ingredients yet</p>
                </div>
              )}

              <button
                onClick={() => setView('add-ingredient')}
                className="w-full py-2.5 rounded-lg border border-dashed border-border-subtle
                           text-text-secondary text-sm hover:border-macro-calories hover:text-macro-calories
                           transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Ingredient
              </button>
            </div>

            {/* Totals */}
            {ingredients.length > 0 && (
              <div className="card mb-6">
                <h4 className="text-card-title mb-3">Total Nutrition</h4>
                <div className="macro-grid text-center">
                  <div>
                    <p className="text-lg font-mono font-bold text-macro-calories">{totals.totalCalories}</p>
                    <p className="text-caption">kcal</p>
                  </div>
                  <div>
                    <p className="text-lg font-mono font-bold text-macro-protein">{Math.round(totals.totalProtein)}g</p>
                    <p className="text-caption">protein</p>
                  </div>
                  <div>
                    <p className="text-lg font-mono font-bold text-macro-carbs">{Math.round(totals.totalCarbs)}g</p>
                    <p className="text-caption">carbs</p>
                  </div>
                  <div>
                    <p className="text-lg font-mono font-bold text-macro-fat">{Math.round(totals.totalFat)}g</p>
                    <p className="text-caption">fat</p>
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              {onDelete && (
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="py-3 px-4 rounded-xl bg-bg-elevated text-red-500 
                             hover:bg-red-500/20 transition-colors disabled:opacity-50
                             flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <div className="spinner" style={{ borderColor: 'rgb(239 68 68)', borderTopColor: 'transparent' }} />
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  )}
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={isSaving || ingredients.length === 0 || !name.trim()}
                className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <div className="spinner" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </>
        ) : (
          /* Add ingredient view */
          <>
            {/* Search input */}
            <div className="relative mb-4">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search foods..."
                className="input-field !pl-12"
                autoFocus
              />
            </div>

            <button
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="btn-secondary w-full mb-4 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSearching ? (
                <>
                  <div className="spinner" style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }} />
                  Searching...
                </>
              ) : (
                'Search'
              )}
            </button>

            {/* Search results */}
            {searchResults.length > 0 && !selectedFood && (
              <div className="space-y-2 mb-4">
                {searchResults.map((food, index) => (
                  <button
                    key={`${food.source}-${food.originalId || food.name}-${index}`}
                    onClick={() => handleSelectFood(food)}
                    className="card-interactive w-full text-left"
                  >
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-text-primary truncate">{food.name}</p>
                      <SourceBadge source={food.source} compact />
                    </div>
                    <p className="text-caption">
                      {food.calories} kcal per {food.servingSize}g
                    </p>
                  </button>
                ))}
              </div>
            )}

            {/* Selected food - set weight */}
            {selectedFood && (
              <div className="mb-4">
                <div className="card mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-card-title">{selectedFood.name}</h4>
                    <SourceBadge source={selectedFood.source} compact />
                  </div>
                  <p className="text-caption mb-4">
                    {selectedFood.calories} kcal per {selectedFood.servingSize}g
                  </p>

                  <label className="text-caption block mb-2">Weight (grams)</label>
                  <input
                    type="number"
                    value={addWeight}
                    onChange={(e) => setAddWeight(e.target.value)}
                    className="input-field text-center text-xl font-mono mb-3"
                    min="1"
                  />

                  <div className="flex gap-2 mb-4">
                    {[50, 100, 150, 200].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setAddWeight(preset.toString())}
                        className={`preset-button flex-1 ${addWeight === preset.toString() ? 'active' : ''}`}
                      >
                        {preset}g
                      </button>
                    ))}
                  </div>

                  {/* Show scaled nutrition */}
                  {(() => {
                    const weightNum = parseInt(addWeight) || 100;
                    const scaled = scaleNutrition(selectedFood, weightNum);
                    return (
                      <div className="macro-grid text-center">
                        <div>
                          <p className="font-mono font-bold text-macro-calories">{scaled.calories}</p>
                          <p className="text-caption">kcal</p>
                        </div>
                        <div>
                          <p className="font-mono font-bold text-macro-protein">{scaled.protein}g</p>
                          <p className="text-caption">protein</p>
                        </div>
                        <div>
                          <p className="font-mono font-bold text-macro-carbs">{scaled.carbs}g</p>
                          <p className="text-caption">carbs</p>
                        </div>
                        <div>
                          <p className="font-mono font-bold text-macro-fat">{scaled.fat}g</p>
                          <p className="text-caption">fat</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setSelectedFood(null)}
                    className="btn-secondary flex-1"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleAddIngredient}
                    className="btn-primary flex-1"
                  >
                    Add to Meal
                  </button>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!isSearching && searchQuery && searchResults.length === 0 && (
              <div className="text-center py-8">
                <p className="text-4xl mb-4">🔍</p>
                <p className="text-body text-text-secondary">No foods found</p>
                <p className="text-caption mt-2">Try a different search term</p>
              </div>
            )}

            {/* Initial state */}
            {!searchQuery && searchResults.length === 0 && (
              <div className="text-center py-8">
                <p className="text-4xl mb-4">🍎</p>
                <p className="text-body text-text-secondary">Search for a food to add</p>
              </div>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
}
