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

export function SearchTab({ onSuccess }: SearchTabProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NormalizedFood[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFood, setSelectedFood] = useState<NormalizedFood | null>(null);
  const [weight, setWeight] = useState('100');
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
    setWeight(food.servingSize.toString());
    setView('detail');
  };

  const handleLog = async () => {
    if (!selectedFood) return;

    setIsSaving(true);
    try {
      const weightNum = parseInt(weight) || 100;
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

  const scaledFood = selectedFood
    ? scaleNutrition(selectedFood, parseInt(weight) || 0)
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
          <p className="text-caption">per {selectedFood.servingSize}g from {selectedFood.source}</p>
        </div>

        <div className="mb-6">
          <label className="text-caption block mb-2">How much? (grams)</label>
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
              className={`flex-1 py-2 rounded-xl text-sm transition-colors ${
                weight === preset.toString()
                  ? 'bg-macro-calories text-white'
                  : 'bg-bg-elevated text-text-secondary hover:bg-bg-surface'
              }`}
            >
              {preset}g
            </button>
          ))}
        </div>

        <div className="card mb-6">
          <h4 className="text-card-title mb-4">Nutrition ({weight}g)</h4>
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
          disabled={isSaving || !weight || parseInt(weight) <= 0}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
              className="card text-left hover:bg-bg-elevated transition-colors"
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
