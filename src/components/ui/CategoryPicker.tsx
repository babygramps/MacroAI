'use client';

import { useState } from 'react';
import type { MealCategory } from '@/lib/types';
import { MEAL_CATEGORY_INFO } from '@/lib/types';

interface CategoryPickerProps {
  value: MealCategory;
  onChange: (category: MealCategory) => void;
  disabled?: boolean;
}

const categories: MealCategory[] = ['meal', 'snack', 'drink'];

export function CategoryPicker({ value, onChange, disabled = false }: CategoryPickerProps) {
  const [poppedCategory, setPoppedCategory] = useState<MealCategory | null>(null);

  const handleClick = (category: MealCategory) => {
    if (category !== value) {
      setPoppedCategory(category);
      // Duration must match --animate-emoji-pop in globals.css
      setTimeout(() => setPoppedCategory(null), 300);
    }
    onChange(category);
  };

  return (
    <div className="flex rounded-xl bg-bg-elevated p-1 gap-1">
      {categories.map((category) => {
        const info = MEAL_CATEGORY_INFO[category];
        const isActive = value === category;
        
        return (
          <button
            key={category}
            type="button"
            onClick={() => handleClick(category)}
            disabled={disabled}
            className={`
              flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg
              text-sm font-medium transition-all duration-150
              ${isActive 
                ? 'bg-macro-calories text-white shadow-sm' 
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            aria-pressed={isActive}
          >
            <span
              className={`text-base inline-block ${poppedCategory === category ? 'animate-emoji-pop' : ''}`}
            >
              {info.emoji}
            </span>
            <span>{info.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Compact version for inline use
export function CategoryBadge({ category }: { category: MealCategory }) {
  const info = MEAL_CATEGORY_INFO[category];
  
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-bg-elevated text-xs text-text-secondary">
      <span>{info.emoji}</span>
      <span>{info.label}</span>
    </span>
  );
}
