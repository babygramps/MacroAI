'use client';

import { memo, useMemo } from 'react';
import type { RecentFood } from '@/lib/types';
import { MEAL_CATEGORY_INFO } from '@/lib/types';

interface RecentItemCardProps {
  item: RecentFood;
  onSelect: (item: RecentFood) => void;
}

// Map common food/meal names to emojis
function getFoodEmoji(name: string, type: 'meal' | 'ingredient', category?: string): string {
  const lowercaseName = name.toLowerCase();

  // For meals, check category first
  if (type === 'meal' && category) {
    if (category === 'drink') {
      if (lowercaseName.includes('coffee') || lowercaseName.includes('latte')) return '☕';
      if (lowercaseName.includes('tea')) return '🍵';
      if (lowercaseName.includes('smoothie') || lowercaseName.includes('shake')) return '🥤';
      if (lowercaseName.includes('juice')) return '🧃';
      return '🥤';
    }
    if (category === 'snack') {
      if (lowercaseName.includes('bar') || lowercaseName.includes('protein')) return '🍫';
      if (lowercaseName.includes('fruit')) return '🍎';
      if (lowercaseName.includes('nut')) return '🥜';
      if (lowercaseName.includes('yogurt')) return '🥛';
      return '🍪';
    }
  }

  // Common food mappings
  const foodEmojiMap: Record<string, string> = {
    chicken: '🍗',
    egg: '🥚',
    rice: '🍚',
    bread: '🍞',
    pasta: '🍝',
    salad: '🥗',
    fish: '🐟',
    salmon: '🐟',
    beef: '🥩',
    steak: '🥩',
    pork: '🥓',
    bacon: '🥓',
    cheese: '🧀',
    milk: '🥛',
    yogurt: '🥛',
    apple: '🍎',
    banana: '🍌',
    orange: '🍊',
    avocado: '🥑',
    broccoli: '🥦',
    carrot: '🥕',
    potato: '🥔',
    tomato: '🍅',
    pizza: '🍕',
    burger: '🍔',
    sandwich: '🥪',
    taco: '🌮',
    sushi: '🍣',
    soup: '🍜',
    noodle: '🍜',
    oatmeal: '🥣',
    cereal: '🥣',
  };

  for (const [key, emoji] of Object.entries(foodEmojiMap)) {
    if (lowercaseName.includes(key)) {
      return emoji;
    }
  }

  // Default based on type
  return type === 'meal' ? '🍽️' : '🥘';
}

/**
 * Compact card for displaying a recently/frequently logged food item.
 * Shows food name, macro preview, log count badge, and ingredient count for meals.
 * 
 * Follows Vercel React Best Practices:
 * - rerender-memo: Wrapped with memo() for stable reference
 * - rendering-conditional-render: Uses ternary for conditionals
 */
export const RecentItemCard = memo(function RecentItemCard({ item, onSelect }: RecentItemCardProps) {
  const emoji = useMemo(
    () => getFoodEmoji(item.name, item.type, item.category),
    [item.name, item.type, item.category]
  );

  const ingredientCount = item.ingredients?.length ?? 0;
  const isMeal = item.type === 'meal';
  const hasMultipleIngredients = isMeal && ingredientCount > 1;

  return (
    <button
      onClick={() => onSelect(item)}
      className="w-full card-interactive text-left group"
    >
      <div className="flex items-center gap-3">
        {/* Emoji icon */}
        <div className="w-10 h-10 bg-bg-elevated rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-xl">{emoji}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-satoshi font-medium text-text-primary truncate text-sm">
              {item.name}
            </p>
            {/* Log count badge */}
            <span className="flex-shrink-0 px-1.5 py-0.5 text-xs font-mono rounded-full bg-macro-protein/20 text-macro-protein">
              ×{item.logCount}
            </span>
          </div>

          {/* Macro preview pills */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-macro-calories font-mono">{item.calories}</span>
            <span className="text-text-muted">•</span>
            <span className="text-macro-protein font-mono">{Math.round(item.protein)}P</span>
            <span className="text-text-muted">•</span>
            <span className="text-macro-carbs font-mono">{Math.round(item.carbs)}C</span>
            <span className="text-text-muted">•</span>
            <span className="text-macro-fat font-mono">{Math.round(item.fat)}F</span>
          </div>

          {/* Meal metadata */}
          {isMeal ? (
            <div className="flex items-center gap-2 mt-1">
              {item.category && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">
                  {MEAL_CATEGORY_INFO[item.category].emoji} {MEAL_CATEGORY_INFO[item.category].label}
                </span>
              )}
              {hasMultipleIngredients ? (
                <span className="text-xs text-text-muted">
                  {ingredientCount} ingredients
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-text-muted mt-0.5">
              {item.servingDescription ? item.servingDescription : `${item.servingSize}g`} • {item.source}
            </p>
          )}
        </div>

        {/* Arrow indicator */}
        <svg
          className="w-4 h-4 text-text-muted group-hover:text-macro-calories transition-colors flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
});

/**
 * Skeleton loading state for RecentItemCard
 */
export function RecentItemCardSkeleton() {
  return (
    <div className="card-interactive flex items-center gap-3">
      <div className="w-10 h-10 skeleton rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton h-3 w-48" />
      </div>
    </div>
  );
}
