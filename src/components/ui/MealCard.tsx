'use client';

import { memo, useMemo, useState, useCallback } from 'react';
import type { MealEntry } from '@/lib/types';
import { CategoryBadge } from './CategoryPicker';
import { IngredientListItem } from './IngredientCard';
import { MealContextMenu, EditIcon, DeleteIcon, DuplicateIcon, type MealContextMenuAction } from './MealContextMenu';

interface MealCardProps {
  meal: MealEntry;
  index: number;
  onEdit?: (meal: MealEntry) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  isDeleting?: boolean;
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

export const MealCard = memo(function MealCard({ meal, index, onEdit, onDelete, onDuplicate, isDeleting = false }: MealCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const emoji = useMemo(() => getMealEmoji(meal.name, meal.category), [meal.name, meal.category]);
  const hasMultipleIngredients = meal.ingredients.length > 1;
  const formattedTime = useMemo(() => formatTime(meal.eatenAt), [meal.eatenAt]);

  // Build context menu actions
  const contextMenuActions = useMemo((): MealContextMenuAction[] => {
    const actions: MealContextMenuAction[] = [];

    if (onEdit) {
      actions.push({
        label: 'Edit',
        icon: EditIcon,
        onClick: () => onEdit(meal),
      });
    }

    if (onDuplicate) {
      actions.push({
        label: 'Duplicate',
        icon: DuplicateIcon,
        onClick: () => onDuplicate(meal.id),
      });
    }

    if (onDelete) {
      actions.push({
        label: 'Delete',
        icon: DeleteIcon,
        onClick: () => onDelete(meal.id),
        variant: 'danger',
      });
    }

    return actions;
  }, [meal, onEdit, onDelete, onDuplicate]);

  const hasActions = contextMenuActions.length > 0;

  // Handle expand/collapse click while avoiding conflict with context menu
  const handleCardClick = useCallback(() => {
    if (hasMultipleIngredients) {
      setIsExpanded((prev) => !prev);
    }
  }, [hasMultipleIngredients]);

  return (
    <div
      className={`card-interactive animate-fade-in-up overflow-hidden group ${isDeleting ? 'animate-card-remove' : ''}`}
      style={{ '--stagger-index': index } as React.CSSProperties}
    >
      <MealContextMenu actions={contextMenuActions} disabled={!hasActions}>
        {/* Main card content - always visible */}
        <button
          onClick={handleCardClick}
          className={`w-full flex items-center gap-3 text-left pr-10 ${hasMultipleIngredients ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <span className="text-2xl">{emoji}</span>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="font-satoshi font-medium text-text-primary truncate">
                {meal.name}
              </p>
              <CategoryBadge category={meal.category} />
              {meal.syncStatus === 'pending' && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/20 text-yellow-400"
                  title="Syncing to server"
                >
                  <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                  </svg>
                  Syncing
                </span>
              )}
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
            {formattedTime}
          </span>
        </button>
      </MealContextMenu>

      {/* Expanded content - ingredients list with smooth height animation */}
      {hasMultipleIngredients && (
        <div className={`expandable-content ${isExpanded ? 'expanded mt-3' : ''}`}>
          <div>
            <div className="border-t border-border-subtle pt-3">
              <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                {meal.ingredients.map((ingredient) => (
                  <IngredientListItem key={ingredient.id} ingredient={ingredient} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
});

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
