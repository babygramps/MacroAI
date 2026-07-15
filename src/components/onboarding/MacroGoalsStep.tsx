'use client';

import { useMemo } from 'react';
import {
  MACRO_SPLIT_PRESETS,
  gramsForRemaining,
  gramsFromSplit,
  macroPercent,
  remainingCalories,
  type MacroGrams,
  type MacroName,
} from '@/lib/macroMath';

interface MacroGoalsStepProps {
  calorieGoal: number;
  grams: MacroGrams;
  onChange: (grams: MacroGrams) => void;
}

const MACRO_ROWS: Array<{ macro: MacroName; label: string; emoji: string; colorVar: string }> = [
  { macro: 'protein', label: 'Protein', emoji: '💪', colorVar: 'var(--color-protein)' },
  { macro: 'carbs', label: 'Carbs', emoji: '🍞', colorVar: 'var(--color-carbs)' },
  { macro: 'fat', label: 'Fat', emoji: '🥑', colorVar: 'var(--color-fat)' },
];

/**
 * Single onboarding step for all three macro targets. Grams are typed (or
 * preset) directly; each row shows its live share of the calorie goal, any
 * unallocated calories are surfaced, and "use rest" sizes a macro to absorb
 * exactly the remainder.
 */
export function MacroGoalsStep({ calorieGoal, grams, onChange }: MacroGoalsStepProps) {
  const remaining = useMemo(() => remainingCalories(calorieGoal, grams), [calorieGoal, grams]);
  const isBalanced = Math.abs(remaining) < 25; // within a rounding-slop margin

  const handleGramsInput = (macro: MacroName, raw: string) => {
    const parsed = parseInt(raw, 10);
    onChange({ ...grams, [macro]: Number.isNaN(parsed) ? 0 : Math.max(0, Math.min(2000, parsed)) });
  };

  return (
    <div className="w-full animate-fade-in-up" style={{ '--stagger-index': 2 } as React.CSSProperties}>
      {/* Unallocated-calories indicator */}
      <div
        className={`text-center text-sm rounded-xl border px-4 py-2 mb-4 ${
          isBalanced
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
        }`}
        role="status"
      >
        {isBalanced
          ? `Adds up to your ${calorieGoal} kcal goal ✓`
          : remaining > 0
            ? `${remaining} kcal not yet allocated`
            : `${Math.abs(remaining)} kcal over your goal`}
      </div>

      {/* One row per macro */}
      <div className="space-y-3 mb-4">
        {MACRO_ROWS.map(({ macro, label, emoji, colorVar }) => (
          <div key={macro} className="card flex items-center gap-3 !py-3">
            <span className="text-2xl" aria-hidden>
              {emoji}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-body">{label}</div>
              <div className="text-caption" style={{ color: colorVar }}>
                {macroPercent(calorieGoal, grams[macro], macro)}% of calories
              </div>
            </div>
            {!isBalanced && (
              <button
                type="button"
                onClick={() => onChange({ ...grams, [macro]: gramsForRemaining(calorieGoal, grams, macro) })}
                className="preset-button !px-3 !py-1 text-xs shrink-0"
              >
                use rest
              </button>
            )}
            <div className="flex items-baseline gap-1 shrink-0">
              <input
                type="text"
                inputMode="numeric"
                value={grams[macro]}
                onChange={(e) => handleGramsInput(macro, e.target.value)}
                onFocus={(e) => e.target.select()}
                className="input-field !w-20 text-center text-lg"
                aria-label={`${label} grams`}
              />
              <span className="text-caption">g</span>
            </div>
          </div>
        ))}
      </div>

      {/* Percentage-split presets */}
      <div className="flex gap-2">
        {MACRO_SPLIT_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange(gramsFromSplit(calorieGoal, preset))}
            className="preset-button flex-1 !px-2"
          >
            <span className="block">{preset.label}</span>
            <span className="block text-xs text-text-muted">
              {preset.protein}/{preset.carbs}/{preset.fat}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
