'use client';

import { useState, useRef, useCallback } from 'react';
import { analyzeImage } from '@/actions/analyzeImage';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import type { NormalizedFood } from '@/lib/types';
import { showToast } from './ui/Toast';

const client = generateClient<Schema>();

interface PhotoTabProps {
  onSuccess: () => void;
}

export function PhotoTab({ onSuccess }: PhotoTabProps) {
  const [image, setImage] = useState<string | null>(null);
  const [results, setResults] = useState<NormalizedFood[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview
    const reader = new FileReader();
    reader.onload = () => {
      setImage(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Analyze image
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const foods = await analyzeImage(formData);
      setResults(foods);
      setSelectedItems(new Set(foods.map((_, i) => i)));
    } catch (error) {
      console.error('Image analysis error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  const handleReset = () => {
    setImage(null);
    setResults([]);
    setSelectedItems(new Set());
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
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
  if (results.length > 0 && image) {
    return (
      <div className="p-4 pb-safe">
        <button
          onClick={handleReset}
          className="mb-4 text-text-secondary flex items-center gap-2 hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Take another photo
        </button>

        {/* Image preview */}
        <div className="aspect-video rounded-xl overflow-hidden bg-bg-elevated mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="Food" className="w-full h-full object-cover" />
        </div>

        <h3 className="text-section-title mb-4">Detected Foods</h3>

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
                    {food.name} (~{food.servingSize}g)
                  </p>
                  <p className="text-caption">
                    {food.calories} kcal • {food.protein}g P
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
          onClick={handleLogAll}
          disabled={isSaving || selectedItems.size === 0}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <div className="spinner" />
              Logging...
            </>
          ) : (
            `Log ${selectedItems.size} Item${selectedItems.size !== 1 ? 's' : ''}`
          )}
        </button>
      </div>
    );
  }

  // Loading state
  if (isLoading && image) {
    return (
      <div className="p-4 pb-safe">
        <div className="aspect-video rounded-xl overflow-hidden bg-bg-elevated mb-4 relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="Food" className="w-full h-full object-cover opacity-50" />
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
            <div className="w-12 h-12 border-4 border-macro-calories border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-text-primary font-medium">Analyzing with AI...</p>
            <p className="text-caption">Identifying foods in your image</p>
          </div>
        </div>
      </div>
    );
  }

  // Input view
  return (
    <div className="p-4 pb-safe">
      <p className="text-body text-text-secondary mb-6 text-center">
        Take a photo of your meal and our AI will identify the foods and estimate nutrition.
      </p>

      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Camera button */}
      <button
        onClick={() => cameraInputRef.current?.click()}
        className="w-full aspect-square max-w-xs mx-auto bg-bg-elevated rounded-2xl flex flex-col items-center justify-center gap-4 hover:bg-bg-surface transition-colors mb-4"
      >
        <div className="w-20 h-20 rounded-full bg-bg-surface flex items-center justify-center">
          <svg className="w-10 h-10 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <p className="text-text-secondary">Tap to take a photo</p>
      </button>

      {/* Gallery option */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full text-center text-text-secondary hover:text-macro-calories transition-colors"
      >
        or choose from gallery
      </button>

      {/* Tips */}
      <div className="mt-8">
        <p className="text-caption mb-2">Tips for best results:</p>
        <ul className="text-caption text-text-muted space-y-1">
          <li>• Good lighting helps accuracy</li>
          <li>• Capture the entire plate</li>
          <li>• Keep portions visible and separated</li>
        </ul>
      </div>
    </div>
  );
}
