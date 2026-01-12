'use client';

import { useState, useCallback } from 'react';
import { searchFoods } from '@/actions/searchFoods';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import type { NormalizedFood } from '@/lib/types';
import { scaleNutrition } from '@/lib/normalizer';
import { BarcodeScanner } from './BarcodeScanner';
import { showToast } from './ui/Toast';

const client = generateClient<Schema>();

interface SearchTabProps {
  onSuccess: () => void;
}

type View = 'search' | 'scanner' | 'detail';
type InputMode = 'grams' | 'servings';

export function SearchTab({ onSuccess }: SearchTabProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NormalizedFood[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFood, setSelectedFood] = useState<NormalizedFood | null>(null);
  const [weight, setWeight] = useState('100');
  const [servings, setServings] = useState('1');
  const [inputMode, setInputMode] = useState<InputMode>('grams');
  const [view, setView] = useState<View>('search');
  const [isSaving, setIsSaving] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    try {
      const foods = await searchFoods(query);
      setResults(foods);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  const handleBarcodeScanned = async (barcode: string) => {
    setQuery(barcode);
    setView('search');
    setIsLoading(true);
    try {
      const foods = await searchFoods(barcode);
      setResults(foods);
    } catch (error) {
      console.error('Barcode search error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectFood = (food: NormalizedFood) => {
    setSelectedFood(food);
    // Reset input mode based on available serving info
    if (food.servingSizeGrams && food.servingDescription && food.servingDescription !== `${food.servingSizeGrams}g`) {
      // Food has meaningful serving info (not just "100g")
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

  const handleLog = async () => {
    if (!selectedFood) return;

    setIsSaving(true);
    try {
      const weightNum = getEffectiveWeight();
      const scaled = scaleNutrition(selectedFood, weightNum);

      await client.models.FoodLog.create({
        name: scaled.name,
        weightG: weightNum,
        calories: scaled.calories,
        protein: scaled.protein,
        carbs: scaled.carbs,
        fat: scaled.fat,
        source: scaled.source,
        eatenAt: new Date().toISOString(),
        // Store serving info for future editing
        servingDescription: selectedFood.servingDescription || null,
        servingSizeGrams: selectedFood.servingSizeGrams || null,
      });

      showToast(`${scaled.name} logged!`, 'success');
      onSuccess();
    } catch (error) {
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
          <p className="text-caption">
            per {selectedFood.servingDescription || `${selectedFood.servingSize}g`} from {selectedFood.source}
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
          onClick={handleLog}
          disabled={isSaving || effectiveWeight <= 0}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <div className="spinner" />
              Logging...
            </>
          ) : (
            'Log Food'
          )}
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
          className="input-field !pl-12 !pr-10"
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
          {results.map((food, index) => (
            <button
              key={`${food.source}-${food.originalId || food.name}-${index}`}
              onClick={() => handleSelectFood(food)}
              className="card-interactive text-left"
            >
              <p className="font-medium text-text-primary truncate">{food.name}</p>
              <p className="text-caption">
                {food.calories} kcal per {food.servingSize}g • {food.source}
              </p>
            </button>
          ))}
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

      {/* Initial state */}
      {!isLoading && !query && results.length === 0 && (
        <div className="text-center py-8">
          <p className="text-4xl mb-4">🍎</p>
          <p className="text-body text-text-secondary">Search for a food</p>
          <p className="text-caption mt-2">
            Type a food name or scan a barcode
          </p>
        </div>
      )}
    </div>
  );
}
