'use client';

import type { RecipeEntry } from '@/lib/types';

interface RecipeCardProps {
  recipe: RecipeEntry;
  onSelect: (recipe: RecipeEntry) => void;
  onDelete?: (recipe: RecipeEntry) => void;
  showDeleteButton?: boolean;
}

/**
 * Card component for displaying a saved recipe in a list.
 * Shows recipe name, per-serving nutrition, and ingredient count.
 */
export function RecipeCard({ recipe, onSelect, onDelete, showDeleteButton = false }: RecipeCardProps) {
  const perServingCalories = Math.round(recipe.totalCalories / recipe.totalServings);
  const perServingProtein = Math.round((recipe.totalProtein / recipe.totalServings) * 10) / 10;
  
  const servingLabel = recipe.servingDescription || 'serving';
  const ingredientCount = recipe.ingredients.length;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(recipe);
  };

  return (
    <button
      onClick={() => onSelect(recipe)}
      className="card w-full text-left hover:border-macro-calories/30 transition-all group"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-bg-elevated rounded-lg flex items-center justify-center shrink-0">
          <span className="text-xl">📖</span>
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="font-medium text-text-primary truncate group-hover:text-macro-calories transition-colors">
            {recipe.name}
          </p>
          <p className="text-caption text-text-secondary">
            {perServingCalories} kcal · {perServingProtein}g P per {servingLabel}
          </p>
          <p className="text-xs text-text-muted mt-1">
            {ingredientCount} ingredient{ingredientCount !== 1 ? 's' : ''} · {recipe.totalServings} {servingLabel}s total
          </p>
        </div>

        {showDeleteButton && onDelete ? (
          <button
            onClick={handleDelete}
            className="p-2 text-text-muted hover:text-red-500 transition-colors shrink-0"
            aria-label="Delete recipe"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        ) : (
          <div className="p-2 text-text-muted group-hover:text-macro-calories transition-colors shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        )}
      </div>
    </button>
  );
}

/**
 * Skeleton loader for RecipeCard
 */
export function RecipeCardSkeleton() {
  return (
    <div className="card animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-bg-elevated rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-bg-elevated rounded w-3/4" />
          <div className="h-3 bg-bg-elevated rounded w-1/2" />
          <div className="h-3 bg-bg-elevated rounded w-1/3" />
        </div>
      </div>
    </div>
  );
}
