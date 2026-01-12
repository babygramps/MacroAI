'use client';

import { useState } from 'react';
import { parseTextLog } from '@/actions/parseTextLog';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import type { NormalizedFood } from '@/lib/types';
import { showToast } from './ui/Toast';

const client = generateClient<Schema>();

interface TextTabProps {
  onSuccess: () => void;
}

export function TextTab({ onSuccess }: TextTabProps) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<NormalizedFood[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());

  const handleAnalyze = async () => {
    if (!text.trim()) return;

    setIsLoading(true);
    try {
      const foods = await parseTextLog(text);
      setResults(foods);
      // Select all items by default
      setSelectedItems(new Set(foods.map((_, i) => i)));
    } catch (error) {
      console.error('Parse error:', error);
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

  const handleLogAll = async () => {
    if (selectedItems.size === 0) return;

    setIsSaving(true);
    try {
      const selectedFoods = results.filter((_, i) => selectedItems.has(i));

      for (const food of selectedFoods) {
        await client.models.FoodLog.create({
          name: food.name,
          weightG: food.servingSize,
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat,
          source: food.source,
          eatenAt: new Date().toISOString(),
        });
      }

      showToast(`${selectedFoods.length} item${selectedFoods.length > 1 ? 's' : ''} logged!`, 'success');
      onSuccess();
    } catch (error) {
      console.error('Error logging foods:', error);
      showToast('Failed to log foods. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const totals = results
    .filter((_, i) => selectedItems.has(i))
    .reduce(
      (acc, food) => ({
        calories: acc.calories + (food.calories || 0),
        protein: acc.protein + (food.protein || 0),
        carbs: acc.carbs + (food.carbs || 0),
        fat: acc.fat + (food.fat || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

  // Results view
  if (results.length > 0) {
    return (
      <div className="p-4 pb-safe">
        <button
          onClick={() => {
            setResults([]);
            setSelectedItems(new Set());
          }}
          className="mb-4 text-text-secondary flex items-center gap-2 hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Edit description
        </button>

        <h3 className="text-section-title mb-4">Review Your Meal</h3>

        <div className="flex flex-col gap-3 mb-6">
          {results.map((food, index) => (
            <button
              key={index}
              onClick={() => toggleItem(index)}
              className={`card text-left transition-all ${
                selectedItems.has(index)
                  ? 'border-macro-calories/50'
                  : 'opacity-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    selectedItems.has(index)
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
          <div className="grid grid-cols-4 gap-2 text-center">
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
          onClick={handleLogAll}
          disabled={isSaving || selectedItems.size === 0}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Logging...
            </>
          ) : (
            `Log ${selectedItems.size} Item${selectedItems.size !== 1 ? 's' : ''}`
          )}
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
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Analyzing...
          </>
        ) : (
          <>
            <span>✨</span>
            Analyze Meal
          </>
        )}
      </button>

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
              className="text-xs bg-bg-elevated px-3 py-1.5 rounded-full text-text-secondary hover:text-text-primary transition-colors"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
