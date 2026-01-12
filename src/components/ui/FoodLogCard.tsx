'use client';

import { useState, useCallback } from 'react';
import type { FoodLogEntry } from '@/lib/types';

interface FoodLogCardProps {
  entry: FoodLogEntry;
  index: number;
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<FoodLogEntry>) => void;
}

type InputMode = 'grams' | 'servings';

// Map common food names to emojis
function getFoodEmoji(name: string): string {
  const lowercaseName = name.toLowerCase();
  
  const emojiMap: Record<string, string> = {
    egg: '🍳',
    eggs: '🍳',
    chicken: '🍗',
    beef: '🥩',
    steak: '🥩',
    fish: '🐟',
    salmon: '🐟',
    rice: '🍚',
    bread: '🍞',
    pasta: '🍝',
    pizza: '🍕',
    burger: '🍔',
    salad: '🥗',
    apple: '🍎',
    banana: '🍌',
    orange: '🍊',
    avocado: '🥑',
    broccoli: '🥦',
    carrot: '🥕',
    potato: '🥔',
    cheese: '🧀',
    milk: '🥛',
    yogurt: '🥛',
    coffee: '☕',
    bacon: '🥓',
    sandwich: '🥪',
    taco: '🌮',
    sushi: '🍣',
    cookie: '🍪',
    cake: '🍰',
    ice: '🍨',
    smoothie: '🥤',
    juice: '🧃',
    oatmeal: '🥣',
    oats: '🥣',
    cereal: '🥣',
  };

  for (const [key, emoji] of Object.entries(emojiMap)) {
    if (lowercaseName.includes(key)) {
      return emoji;
    }
  }

  return '🍽️';
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function FoodLogCard({ entry, index, onDelete, onUpdate }: FoodLogCardProps) {
  const emoji = getFoodEmoji(entry.name);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Edit form state - weight is the primary input, macros are calculated
  const [editName, setEditName] = useState(entry.name);
  const [editWeight, setEditWeight] = useState(entry.weightG);
  const [editServings, setEditServings] = useState('1');
  const [inputMode, setInputMode] = useState<InputMode>('grams');

  // Check if entry has serving info
  const hasServingInfo = entry.servingSizeGrams && 
    entry.servingDescription && 
    entry.servingDescription !== `${entry.servingSizeGrams}g`;

  // Store the original per-gram ratios for scaling
  const originalWeight = entry.weightG || 100;
  const caloriesPerGram = entry.calories / originalWeight;
  const proteinPerGram = entry.protein / originalWeight;
  const carbsPerGram = entry.carbs / originalWeight;
  const fatPerGram = entry.fat / originalWeight;

  // Calculate effective weight based on input mode
  const getEffectiveWeight = useCallback((): number => {
    if (inputMode === 'servings' && entry.servingSizeGrams) {
      return Math.round((parseFloat(editServings) || 0) * entry.servingSizeGrams);
    }
    return editWeight;
  }, [inputMode, editServings, entry.servingSizeGrams, editWeight]);

  const effectiveWeight = getEffectiveWeight();

  // Calculated macros based on effective weight
  const calculatedCalories = Math.round(effectiveWeight * caloriesPerGram);
  const calculatedProtein = Math.round(effectiveWeight * proteinPerGram * 10) / 10;
  const calculatedCarbs = Math.round(effectiveWeight * carbsPerGram * 10) / 10;
  const calculatedFat = Math.round(effectiveWeight * fatPerGram * 10) / 10;

  const handleStartEdit = () => {
    // Reset form to current values
    setEditName(entry.name);
    setEditWeight(entry.weightG);
    
    // Set initial input mode and servings based on entry
    if (hasServingInfo && entry.servingSizeGrams) {
      setInputMode('servings');
      // Calculate servings from current weight
      const calculatedServings = entry.weightG / entry.servingSizeGrams;
      setEditServings(calculatedServings.toFixed(2).replace(/\.?0+$/, ''));
    } else {
      setInputMode('grams');
      setEditServings('1');
    }
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleWeightChange = (newWeight: number) => {
    setEditWeight(newWeight);
  };

  const handleServingsChange = (newServings: string) => {
    setEditServings(newServings);
  };

  const handleSave = async () => {
    if (!onUpdate) return;
    
    setIsSaving(true);
    try {
      const finalWeight = getEffectiveWeight();
      await onUpdate(entry.id, {
        name: editName,
        weightG: finalWeight,
        calories: calculatedCalories,
        protein: calculatedProtein,
        carbs: calculatedCarbs,
        fat: calculatedFat,
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Editing mode
  if (isEditing) {
    return (
      <div
        className="card-editing animate-fade-in-up"
        style={{ '--stagger-index': index } as React.CSSProperties}
      >
        {/* Name input */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">{emoji}</span>
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="flex-1 bg-bg-elevated rounded-lg px-3 py-2 text-text-primary 
                       font-medium focus:outline-none focus:ring-2 focus:ring-macro-calories/50"
            placeholder="Food name"
          />
        </div>

        {/* Input mode toggle */}
        <div className="flex rounded-lg bg-bg-elevated p-0.5 mb-4">
          <button
            onClick={() => setInputMode('grams')}
            className={`tab-button rounded-md text-xs ${inputMode === 'grams' ? 'active bg-macro-calories text-white' : ''}`}
          >
            Grams
          </button>
          <button
            onClick={() => setInputMode('servings')}
            className={`tab-button rounded-md text-xs ${inputMode === 'servings' ? 'active bg-macro-calories text-white' : ''}`}
          >
            Servings
          </button>
        </div>

        {/* Grams input mode */}
        {inputMode === 'grams' && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <label className="text-caption text-text-muted w-16">Weight:</label>
              <input
                type="number"
                value={editWeight}
                onChange={(e) => handleWeightChange(Number(e.target.value) || 0)}
                className="w-24 bg-bg-elevated rounded-lg px-3 py-2 text-text-primary text-center
                           font-mono focus:outline-none focus:ring-2 focus:ring-macro-calories/50"
              />
              <span className="text-caption text-text-muted">g</span>
            </div>
            {/* Quick weight buttons */}
            <div className="flex gap-2 ml-16">
              {[50, 100, 150, 200, 250].map((w) => (
                <button
                  key={w}
                  onClick={() => handleWeightChange(w)}
                  className={`preset-button-weight ${editWeight === w ? 'active' : ''}`}
                >
                  {w}g
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Servings input mode */}
        {inputMode === 'servings' && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <label className="text-caption text-text-muted w-16">Servings:</label>
              <input
                type="number"
                value={editServings}
                onChange={(e) => handleServingsChange(e.target.value)}
                className="w-24 bg-bg-elevated rounded-lg px-3 py-2 text-text-primary text-center
                           font-mono focus:outline-none focus:ring-2 focus:ring-macro-calories/50"
                min="0.1"
                step="0.25"
              />
              {hasServingInfo && (
                <span className="text-caption text-text-muted truncate">
                  × {entry.servingDescription}
                </span>
              )}
            </div>
            {/* Quick serving buttons */}
            <div className="flex gap-2 ml-16">
              {[0.5, 1, 1.5, 2, 3].map((s) => (
                <button
                  key={s}
                  onClick={() => handleServingsChange(s.toString())}
                  className={`preset-button-weight ${editServings === s.toString() ? 'active' : ''}`}
                >
                  {s}
                </button>
              ))}
            </div>
            {/* Show calculated weight */}
            <p className="text-caption text-text-muted text-center mt-2">
              = {effectiveWeight}g
            </p>
          </div>
        )}

        {/* Calculated macros display (read-only, updates with weight) */}
        <div className="macro-grid mb-4">
          <div className="flex flex-col items-center p-2 bg-bg-elevated rounded-lg">
            <span className="text-caption text-macro-calories mb-1">Calories</span>
            <span className="font-mono font-bold text-text-primary">{calculatedCalories}</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-bg-elevated rounded-lg">
            <span className="text-caption text-macro-protein mb-1">Protein</span>
            <span className="font-mono font-bold text-text-primary">{calculatedProtein}g</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-bg-elevated rounded-lg">
            <span className="text-caption text-macro-carbs mb-1">Carbs</span>
            <span className="font-mono font-bold text-text-primary">{calculatedCarbs}g</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-bg-elevated rounded-lg">
            <span className="text-caption text-macro-fat mb-1">Fat</span>
            <span className="font-mono font-bold text-text-primary">{calculatedFat}g</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="flex-1 py-2 rounded-lg bg-bg-elevated text-text-secondary 
                       hover:bg-bg-primary transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || effectiveWeight <= 0}
            className="flex-1 py-2 rounded-lg bg-macro-calories text-white font-medium
                       hover:bg-macro-calories/80 transition-colors disabled:opacity-50
                       flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="spinner" style={{ width: '1rem', height: '1rem' }} />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>
    );
  }

  // Normal display mode
  return (
    <div
      className="card-interactive flex items-center gap-4 animate-fade-in-up"
      style={{ '--stagger-index': index } as React.CSSProperties}
    >
      <span className="text-2xl">{emoji}</span>
      
      <div className="flex-1 min-w-0">
        <p className="font-satoshi font-medium text-text-primary truncate">
          {entry.name}
        </p>
        <p className="text-caption">
          {entry.calories} kcal • {entry.protein}g protein
        </p>
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-caption text-text-muted whitespace-nowrap hidden sm:block">
          {formatTime(entry.eatenAt)}
        </span>
        
        {/* Edit button */}
        {onUpdate && (
          <button
            onClick={handleStartEdit}
            className="icon-button-sm hover:bg-macro-calories/20"
            aria-label="Edit entry"
          >
            <svg
              className="w-4 h-4 text-text-muted hover:text-macro-calories"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </button>
        )}
        
        {/* Delete button */}
        {onDelete && (
          <button
            onClick={() => onDelete(entry.id)}
            className="icon-button-sm hover:bg-red-500/20"
            aria-label="Delete entry"
          >
            <svg
              className="w-4 h-4 text-text-muted hover:text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// Skeleton version for loading state
export function FoodLogCardSkeleton({ index }: { index: number }) {
  return (
    <div
      className="card-interactive flex items-center gap-4 animate-fade-in-up"
      style={{ '--stagger-index': index } as React.CSSProperties}
    >
      <div className="w-10 h-10 skeleton rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton h-3 w-24" />
      </div>
      <div className="skeleton h-3 w-16" />
    </div>
  );
}
