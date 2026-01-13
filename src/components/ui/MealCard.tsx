'use client';

import { useState } from 'react';
import type { MealEntry } from '@/lib/types';
import { CategoryBadge } from './CategoryPicker';
import { IngredientListItem } from './IngredientCard';

interface MealCardProps {
  meal: MealEntry;
  index: number;
  onEdit?: (meal: MealEntry) => void;
  onDelete?: (id: string) => void;
}

// Map common food/meal names to emojis
function getMealEmoji(name: string, category: string): string {
  const lowercaseName = name.toLowerCase();
  
  // Drink emojis
  if (category === 'drink') {
    if (lowercaseName.includes('coffee') || lowercaseName.includes('latte') || lowercaseName.includes('espresso')) return '☕';
    if (lowercaseName.includes('tea')) return '🍵';
    if (lowercaseName.includes('smoothie') || lowercaseName.includes('shake')) return '🥤';
    if (lowercaseName.includes('juice')) return '🧃';
    if (lowercaseName.includes('water')) return '💧';
    if (lowercaseName.includes('milk')) return '🥛';
    if (lowercaseName.includes('soda') || lowercaseName.includes('cola')) return '🥤';
    return '🥤';
  }
  
  // Snack emojis
  if (category === 'snack') {
    if (lowercaseName.includes('bar') || lowercaseName.includes('protein')) return '🍫';
    if (lowercaseName.includes('fruit')) return '🍎';
    if (lowercaseName.includes('nut') || lowercaseName.includes('almond')) return '🥜';
    if (lowercaseName.includes('yogurt')) return '🥛';
    if (lowercaseName.includes('cookie')) return '🍪';
    if (lowercaseName.includes('chip')) return '🍟';
    if (lowercaseName.includes('cracker')) return '🍘';
    return '🍪';
  }
  
  // Meal emojis
  const mealEmojiMap: Record<string, string> = {
    breakfast: '🍳',
    egg: '🍳',
    oatmeal: '🥣',
    cereal: '🥣',
    pancake: '🥞',
    waffle: '🧇',
    toast: '🍞',
    sandwich: '🥪',
    burger: '🍔',
    pizza: '🍕',
    pasta: '🍝',
    noodle: '🍜',
    soup: '🍜',
    ramen: '🍜',
    pho: '🍜',
    salad: '🥗',
    bowl: '🥗',
    rice: '🍚',
    sushi: '🍣',
    taco: '🌮',
    burrito: '🌯',
    curry: '🍛',
    steak: '🥩',
    chicken: '🍗',
    fish: '🐟',
    salmon: '🐟',
    shrimp: '🦐',
  };

  for (const [key, emoji] of Object.entries(mealEmojiMap)) {
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

export function MealCard({ meal, index, onEdit, onDelete }: MealCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const emoji = getMealEmoji(meal.name, meal.category);
  const hasMultipleIngredients = meal.ingredients.length > 1;

  return (
    <div
      className="card-interactive animate-fade-in-up overflow-hidden"
      style={{ '--stagger-index': index } as React.CSSProperties}
    >
      {/* Main card content - always visible */}
      <button
        onClick={() => hasMultipleIngredients && setIsExpanded(!isExpanded)}
        className={`w-full flex items-center gap-3 text-left ${hasMultipleIngredients ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <span className="text-2xl">{emoji}</span>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-satoshi font-medium text-text-primary truncate">
              {meal.name}
            </p>
            <CategoryBadge category={meal.category} />
          </div>
          <p className="text-caption">
            {meal.totalCalories} kcal • {Math.round(meal.totalProtein)}g protein
          </p>
          {hasMultipleIngredients && (
            <p className="text-xs text-text-muted mt-0.5 flex items-center gap-1">
              <svg
                className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {meal.ingredients.length} ingredients
            </p>
          )}
        </div>
        
        <span className="text-caption text-text-muted whitespace-nowrap hidden sm:block">
          {formatTime(meal.eatenAt)}
        </span>
      </button>

      {/* Expanded content - ingredients list */}
      <div
        className={`transition-all duration-200 ease-out overflow-hidden ${
          isExpanded ? 'max-h-96 opacity-100 mt-3' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="border-t border-border-subtle pt-3">
          {/* Ingredients list */}
          <div className="space-y-1 mb-3">
            {meal.ingredients.map((ingredient) => (
              <IngredientListItem key={ingredient.id} ingredient={ingredient} />
            ))}
          </div>
          
          {/* Action buttons */}
          <div className="flex gap-2 pt-2 border-t border-border-subtle">
            {onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(meal);
                }}
                className="flex-1 py-2 rounded-lg bg-bg-elevated text-text-secondary text-sm
                           hover:bg-macro-calories/20 hover:text-macro-calories transition-colors
                           flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
                Edit Meal
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(meal.id);
                }}
                className="py-2 px-4 rounded-lg bg-bg-elevated text-text-muted text-sm
                           hover:bg-red-500/20 hover:text-red-500 transition-colors
                           flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* For single-ingredient meals, show quick action buttons on hover */}
      {!hasMultipleIngredients && (onEdit || onDelete) && (
        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border-subtle">
          {onEdit && (
            <button
              onClick={() => onEdit(meal)}
              className="flex-1 py-1.5 rounded-lg bg-bg-elevated text-text-secondary text-xs
                         hover:bg-macro-calories/20 hover:text-macro-calories transition-colors
                         flex items-center justify-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
              Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(meal.id)}
              className="py-1.5 px-3 rounded-lg bg-bg-elevated text-text-muted text-xs
                         hover:bg-red-500/20 hover:text-red-500 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

// Skeleton version for loading state
export function MealCardSkeleton({ index }: { index: number }) {
  return (
    <div
      className="card-interactive flex items-center gap-4 animate-fade-in-up"
      style={{ '--stagger-index': index } as React.CSSProperties}
    >
      <div className="w-10 h-10 skeleton rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-40" />
        <div className="skeleton h-3 w-28" />
      </div>
      <div className="skeleton h-3 w-16" />
    </div>
  );
}
