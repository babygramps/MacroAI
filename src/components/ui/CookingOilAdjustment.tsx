'use client';

import { useId, useState } from 'react';
import { createCookingOilIngredient } from '@/lib/meal/cookingOil';

interface CookingOilAdjustmentProps {
  teaspoons: number;
  onChange: (teaspoons: number) => void;
}

const PRESETS = [
  { label: 'None', teaspoons: 0 },
  { label: '1 tsp', teaspoons: 1 },
  { label: '2 tsp', teaspoons: 2 },
  { label: '1 tbsp (3 tsp)', teaspoons: 3 },
] as const;

function isPresetAmount(teaspoons: number): boolean {
  return PRESETS.some((preset) => preset.teaspoons === teaspoons);
}

export function CookingOilAdjustment({
  teaspoons,
  onChange,
}: CookingOilAdjustmentProps) {
  const id = useId();
  const headingId = `${id}-heading`;
  const customInputId = `${id}-custom`;
  const teaspoonsInputId = `${id}-teaspoons`;
  const isCustomAmount = teaspoons > 0 && !isPresetAmount(teaspoons);
  const [isCustomOpen, setIsCustomOpen] = useState(isCustomAmount);
  const showCustomInput = isCustomOpen || isCustomAmount;
  const cookingOil = createCookingOilIngredient(teaspoons);

  const handleCustomChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextTeaspoons = event.currentTarget.valueAsNumber;
    onChange(
      Number.isFinite(nextTeaspoons) && nextTeaspoons > 0
        ? nextTeaspoons
        : 0
    );
  };

  return (
    <section
      className="rounded-xl border border-macro-calories/30 bg-macro-calories/10 p-4"
      aria-labelledby={headingId}
    >
      <h3
        id={headingId}
        className="text-card-title text-text-primary"
      >
        Was cooking oil left out?
      </h3>
      <p className="mt-1 text-sm text-text-muted">
        Add an estimate only if oil is not already listed in the meal.
      </p>

      <fieldset className="mt-4">
        <legend className="sr-only">Cooking oil amount</legend>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => {
            const isActive = teaspoons === preset.teaspoons;

            return (
              <button
                key={preset.label}
                type="button"
                className={`preset-button ${isActive ? 'active' : ''}`}
                aria-pressed={isActive}
                onClick={() => {
                  setIsCustomOpen(false);
                  onChange(preset.teaspoons);
                }}
              >
                {preset.label}
              </button>
            );
          })}
          <button
            type="button"
            className={`preset-button ${isCustomAmount ? 'active' : ''}`}
            aria-pressed={isCustomAmount}
            aria-expanded={showCustomInput}
            aria-controls={customInputId}
            onClick={() => setIsCustomOpen(true)}
          >
            Custom
          </button>
        </div>

        {showCustomInput ? (
          <div id={customInputId} className="mt-4">
            <label
              htmlFor={teaspoonsInputId}
              className="mb-2 block text-sm font-medium text-text-primary"
            >
              Teaspoons
            </label>
            <input
              id={teaspoonsInputId}
              type="number"
              min="0"
              step="0.25"
              inputMode="decimal"
              value={teaspoons > 0 ? teaspoons : ''}
              onChange={handleCustomChange}
              className="input-number w-full sm:max-w-40"
            />
          </div>
        ) : null}
      </fieldset>

      {cookingOil ? (
        <p
          className="mt-4 rounded-lg bg-bg-primary/40 px-3 py-2 font-mono text-sm text-macro-calories"
          aria-live="polite"
        >
          +{cookingOil.calories} kcal · +{cookingOil.fat}g fat
        </p>
      ) : null}
    </section>
  );
}
