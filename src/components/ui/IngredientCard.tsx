'use client';

import { memo, useMemo, useState } from 'react';
import type { IngredientEntry } from '@/lib/types';
import { SourceBadge } from './SourceBadge';

interface IngredientCardProps {
  ingredient: IngredientEntry;
  onUpdate?: (id: string, updates: Partial<IngredientEntry>) => void;
  onRemove?: (id: string) => void;
  isEditable?: boolean;
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
    coconut: '🥥',
    soup: '🍜',
    noodle: '🍜',
    shrimp: '🦐',
    tofu: '🧈',
    nut: '🥜',
    almond: '🥜',
  };

  for (const [key, emoji] of Object.entries(emojiMap)) {
    if (lowercaseName.includes(key)) {
      return emoji;
    }
  }

  return '🍽️';
}

export function IngredientCard({ 
  ingredient, 
  onUpdate, 
  onRemove,
  isEditable = true 
}: IngredientCardProps) {
  const emoji = useMemo(() => getFoodEmoji(ingredient.name), [ingredient.name]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Edit form state
  const [editName, setEditName] = useState(ingredient.name);
  const [editWeight, setEditWeight] = useState(ingredient.weightG);
  const [editServings, setEditServings] = useState('1');
  const [inputMode, setInputMode] = useState<InputMode>('grams');

  // Check if entry has serving info
  const hasServingInfo = useMemo(() => {
    return Boolean(
      ingredient.servingSizeGrams &&
        ingredient.servingDescription &&
        ingredient.servingDescription !== `${ingredient.servingSizeGrams}g`
    );
  }, [ingredient.servingDescription, ingredient.servingSizeGrams]);

  const perGram = useMemo(() => {
    const originalWeight = ingredient.weightG || 100;
    return {
      calories: ingredient.calories / originalWeight,
      protein: ingredient.protein / originalWeight,
      carbs: ingredient.carbs / originalWeight,
      fat: ingredient.fat / originalWeight,
    };
  }, [ingredient.calories, ingredient.carbs, ingredient.fat, ingredient.protein, ingredient.weightG]);

  const effectiveWeight = useMemo(() => {
    if (inputMode === 'servings' && ingredient.servingSizeGrams) {
      return Math.round((parseFloat(editServings) || 0) * ingredient.servingSizeGrams);
    }
    return editWeight;
  }, [editServings, editWeight, ingredient.servingSizeGrams, inputMode]);

  const calculatedCalories = useMemo(() => {
    return Math.round(effectiveWeight * perGram.calories);
  }, [effectiveWeight, perGram.calories]);

  const calculatedProtein = useMemo(() => {
    return Math.round(effectiveWeight * perGram.protein * 10) / 10;
  }, [effectiveWeight, perGram.protein]);

  const calculatedCarbs = useMemo(() => {
    return Math.round(effectiveWeight * perGram.carbs * 10) / 10;
  }, [effectiveWeight, perGram.carbs]);

  const calculatedFat = useMemo(() => {
    return Math.round(effectiveWeight * perGram.fat * 10) / 10;
  }, [effectiveWeight, perGram.fat]);

  const handleStartEdit = () => {
    setEditName(ingredient.name);
    setEditWeight(ingredient.weightG);
    
    if (hasServingInfo && ingredient.servingSizeGrams) {
      setInputMode('servings');
      const calculatedServings = ingredient.weightG / ingredient.servingSizeGrams;
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

  const handleSave = async () => {
    if (!onUpdate) return;
    
    setIsSaving(true);
    try {
      const finalWeight = effectiveWeight;
      await onUpdate(ingredient.id, {
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
      <div className="bg-bg-elevated rounded-lg p-3 border border-macro-calories/30">
        {/* Name input */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">{emoji}</span>
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="flex-1 bg-bg-surface rounded-lg px-2 py-1.5 text-sm text-text-primary 
                       font-medium focus:outline-none focus:ring-2 focus:ring-macro-calories/50"
            placeholder="Ingredient name"
          />
        </div>

        {/* Input mode toggle */}
        <div className="flex rounded-lg bg-bg-surface p-0.5 mb-3">
          <button
            onClick={() => setInputMode('grams')}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors
              ${inputMode === 'grams' ? 'bg-macro-calories text-white' : 'text-text-muted'}`}
          >
            Grams
          </button>
          <button
            onClick={() => setInputMode('servings')}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors
              ${inputMode === 'servings' ? 'bg-macro-calories text-white' : 'text-text-muted'}`}
          >
            Servings
          </button>
        </div>

        {/* Weight/Servings input */}
        <div className="mb-3">
          {inputMode === 'grams' ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={editWeight}
                onChange={(e) => setEditWeight(Number(e.target.value) || 0)}
                className="w-20 bg-bg-surface rounded-lg px-2 py-1.5 text-sm text-text-primary text-center
                           font-mono focus:outline-none focus:ring-2 focus:ring-macro-calories/50"
              />
              <span className="text-xs text-text-muted">grams</span>
              <div className="flex-1 flex gap-1 justify-end">
                {[50, 100, 150, 200].map((w) => (
                  <button
                    key={w}
                    onClick={() => setEditWeight(w)}
                    className={`px-2 py-1 rounded text-xs font-mono transition-colors
                      ${editWeight === w 
                        ? 'bg-macro-calories text-white' 
                        : 'bg-bg-surface text-text-muted hover:text-text-primary'}`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={editServings}
                onChange={(e) => setEditServings(e.target.value)}
                className="w-20 bg-bg-surface rounded-lg px-2 py-1.5 text-sm text-text-primary text-center
                           font-mono focus:outline-none focus:ring-2 focus:ring-macro-calories/50"
                min="0.1"
                step="0.25"
              />
              {hasServingInfo && (
                <span className="text-xs text-text-muted truncate">
                  × {ingredient.servingDescription}
                </span>
              )}
              <span className="text-xs text-text-muted ml-auto">= {effectiveWeight}g</span>
            </div>
          )}
        </div>

        {/* Calculated macros */}
        <div className="grid grid-cols-4 gap-2 mb-3 text-center">
          <div className="bg-bg-surface rounded p-1.5">
            <p className="text-xs text-macro-calories">{calculatedCalories}</p>
            <p className="text-[10px] text-text-muted">kcal</p>
          </div>
          <div className="bg-bg-surface rounded p-1.5">
            <p className="text-xs text-macro-protein">{calculatedProtein}g</p>
            <p className="text-[10px] text-text-muted">protein</p>
          </div>
          <div className="bg-bg-surface rounded p-1.5">
            <p className="text-xs text-macro-carbs">{calculatedCarbs}g</p>
            <p className="text-[10px] text-text-muted">carbs</p>
          </div>
          <div className="bg-bg-surface rounded p-1.5">
            <p className="text-xs text-macro-fat">{calculatedFat}g</p>
            <p className="text-[10px] text-text-muted">fat</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="flex-1 py-1.5 rounded-lg bg-bg-surface text-text-secondary text-sm
                       hover:bg-bg-primary transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || effectiveWeight <= 0}
            className="flex-1 py-1.5 rounded-lg bg-macro-calories text-white text-sm font-medium
                       hover:bg-macro-calories/80 transition-colors disabled:opacity-50
                       flex items-center justify-center gap-1"
          >
            {isSaving ? (
              <>
                <div className="spinner" style={{ width: '0.875rem', height: '0.875rem' }} />
                Saving
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
    <div className="flex items-center gap-3 py-2 px-3 bg-bg-elevated rounded-lg group">
      <span className="text-base">{emoji}</span>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-text-primary truncate">
            {ingredient.name}
          </p>
          <SourceBadge source={ingredient.source} compact />
        </div>
        <p className="text-xs text-text-muted">
          {ingredient.weightG}g • {ingredient.calories} kcal
        </p>
      </div>
      
      {isEditable && (
        <div className={`flex items-center gap-1 transition-opacity ${
          ingredient.source === 'GEMINI'
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100'
        }`}>
          {onUpdate && (
            <button
              onClick={handleStartEdit}
              className={`p-1.5 rounded-full transition-colors ${
                ingredient.source === 'GEMINI'
                  ? 'bg-amber-500/10 hover:bg-amber-500/20'
                  : 'hover:bg-macro-calories/20'
              }`}
              aria-label="Edit ingredient"
              title={ingredient.source === 'GEMINI' ? 'AI estimate — tap to verify' : 'Edit ingredient'}
            >
              <svg
                className={`w-3.5 h-3.5 ${
                  ingredient.source === 'GEMINI'
                    ? 'text-amber-400'
                    : 'text-text-muted hover:text-macro-calories'
                }`}
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
          
          {onRemove && (
            <button
              onClick={() => onRemove(ingredient.id)}
              className="p-1.5 rounded-full hover:bg-red-500/20 transition-colors"
              aria-label="Remove ingredient"
            >
              <svg
                className="w-3.5 h-3.5 text-text-muted hover:text-red-500"
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
      )}
    </div>
  );
}

// Compact version for listing (no edit capabilities)
export const IngredientListItem = memo(function IngredientListItem({ ingredient }: { ingredient: IngredientEntry }) {
  const emoji = useMemo(() => getFoodEmoji(ingredient.name), [ingredient.name]);

  return (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      <span className="text-sm">{emoji}</span>
      <span className="text-text-secondary truncate">{ingredient.name}</span>
      <SourceBadge source={ingredient.source} compact />
      <span className="text-text-muted ml-auto whitespace-nowrap">
        {ingredient.weightG}g • {ingredient.calories} kcal
      </span>
    </div>
  );
});
