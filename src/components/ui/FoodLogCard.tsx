'use client';

import { useState } from 'react';
import type { FoodLogEntry } from '@/lib/types';

interface FoodLogCardProps {
  entry: FoodLogEntry;
  index: number;
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<FoodLogEntry>) => void;
}

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

  // Store the original per-gram ratios for scaling
  const originalWeight = entry.weightG || 100;
  const caloriesPerGram = entry.calories / originalWeight;
  const proteinPerGram = entry.protein / originalWeight;
  const carbsPerGram = entry.carbs / originalWeight;
  const fatPerGram = entry.fat / originalWeight;

  // Calculated macros based on current weight
  const calculatedCalories = Math.round(editWeight * caloriesPerGram);
  const calculatedProtein = Math.round(editWeight * proteinPerGram * 10) / 10;
  const calculatedCarbs = Math.round(editWeight * carbsPerGram * 10) / 10;
  const calculatedFat = Math.round(editWeight * fatPerGram * 10) / 10;

  const handleStartEdit = () => {
    // Reset form to current values
    setEditName(entry.name);
    setEditWeight(entry.weightG);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleWeightChange = (newWeight: number) => {
    setEditWeight(newWeight);
  };

  const handleSave = async () => {
    if (!onUpdate) return;
    
    setIsSaving(true);
    try {
      await onUpdate(entry.id, {
        name: editName,
        weightG: editWeight,
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
        className="bg-bg-surface rounded-xl p-4 border border-macro-calories/30
                   animate-fade-in-up"
        style={{ animationDelay: `${index * 0.05}s` }}
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

        {/* Weight input with quick buttons */}
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
                className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                  editWeight === w 
                    ? 'bg-macro-calories text-white' 
                    : 'bg-bg-elevated text-text-muted hover:bg-bg-primary'
                }`}
              >
                {w}g
              </button>
            ))}
          </div>
        </div>

        {/* Calculated macros display (read-only, updates with weight) */}
        <div className="grid grid-cols-4 gap-2 mb-4">
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
            disabled={isSaving}
            className="flex-1 py-2 rounded-lg bg-macro-calories text-white font-medium
                       hover:bg-macro-calories/80 transition-colors disabled:opacity-50
                       flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
      className="bg-bg-surface rounded-xl p-4 flex items-center gap-4 
                 hover:bg-bg-elevated transition-colors duration-200
                 animate-fade-in-up"
      style={{ animationDelay: `${index * 0.05}s` }}
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
            className="w-8 h-8 rounded-full bg-bg-elevated hover:bg-macro-calories/20 
                       flex items-center justify-center transition-colors"
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
            className="w-8 h-8 rounded-full bg-bg-elevated hover:bg-red-500/20 
                       flex items-center justify-center transition-colors"
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
      className="bg-bg-surface rounded-xl p-4 flex items-center gap-4 animate-fade-in-up"
      style={{ animationDelay: `${index * 0.05}s` }}
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
