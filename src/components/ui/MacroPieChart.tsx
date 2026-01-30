'use client';

import { useEffect, useState } from 'react';

interface MacroPieChartProps {
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
  size?: number; // optional size override (default 160)
  hideLegend?: boolean; // hide the percentage legend
}

// Macro colors matching the design system
const COLORS = {
  protein: '#00E5A0', // Electric Mint
  carbs: '#FFD23F', // Golden Yellow
  fat: '#A855F7', // Vivid Purple
};

// Calories per gram
const CALS_PER_GRAM = {
  protein: 4,
  carbs: 4,
  fat: 9,
};

export function MacroPieChart({ protein, carbs, fat, size: propSize = 160, hideLegend = false }: MacroPieChartProps) {
  const [animationProgress, setAnimationProgress] = useState(0);

  // Calculate total calories from macros
  const proteinCals = protein * CALS_PER_GRAM.protein;
  const carbsCals = carbs * CALS_PER_GRAM.carbs;
  const fatCals = fat * CALS_PER_GRAM.fat;
  const totalCals = proteinCals + carbsCals + fatCals;

  // Calculate percentages
  const proteinPct = totalCals > 0 ? (proteinCals / totalCals) * 100 : 0;
  const carbsPct = totalCals > 0 ? (carbsCals / totalCals) * 100 : 0;
  const fatPct = totalCals > 0 ? (fatCals / totalCals) * 100 : 0;

  // SVG dimensions - scale stroke width proportionally
  const size = propSize;
  const strokeWidth = Math.max(8, Math.round(propSize * 0.125));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const isSmall = propSize < 120;

  // Calculate dash arrays for each segment
  // Order: Protein, Carbs, Fat
  const proteinDash = (proteinPct / 100) * circumference * animationProgress;
  const carbsDash = (carbsPct / 100) * circumference * animationProgress;
  const fatDash = (fatPct / 100) * circumference * animationProgress;

  // Calculate rotation offsets (each segment starts where the previous ended)
  const proteinOffset = 0;
  const carbsOffset = proteinDash;
  const fatOffset = proteinDash + carbsDash;

  // Animate on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimationProgress(1);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // If no data, show empty state
  if (totalCals === 0) {
    return (
      <div className="flex flex-col items-center">
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#1E1E26"
            strokeWidth={strokeWidth}
          />
        </svg>
        <p className="text-caption text-text-muted mt-2">No data</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background ring */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#1E1E26"
            strokeWidth={strokeWidth}
          />

          {/* Fat segment (drawn first, at the "back") */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={COLORS.fat}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${fatDash} ${circumference}`}
            strokeDashoffset={-fatOffset}
            style={{
              transition: 'stroke-dasharray 1s ease-out, stroke-dashoffset 1s ease-out',
            }}
          />

          {/* Carbs segment */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={COLORS.carbs}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${carbsDash} ${circumference}`}
            strokeDashoffset={-carbsOffset}
            style={{
              transition: 'stroke-dasharray 1s ease-out, stroke-dashoffset 1s ease-out',
            }}
          />

          {/* Protein segment (drawn last, at the "front") */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={COLORS.protein}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${proteinDash} ${circumference}`}
            strokeDashoffset={-proteinOffset}
            style={{
              transition: 'stroke-dasharray 1s ease-out',
            }}
          />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`${isSmall ? 'text-sm' : 'text-2xl'} font-mono font-bold text-text-primary`}>
            {Math.round(totalCals)}
          </span>
          {!isSmall && <span className="text-xs text-text-muted">kcal</span>}
        </div>
      </div>

      {/* Legend */}
      {!hideLegend && (
        <div className="flex gap-4 mt-4">
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: COLORS.protein }}
            />
            <span className="text-xs text-text-secondary">
              {Math.round(proteinPct)}% P
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: COLORS.carbs }}
            />
            <span className="text-xs text-text-secondary">
              {Math.round(carbsPct)}% C
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: COLORS.fat }}
            />
            <span className="text-xs text-text-secondary">
              {Math.round(fatPct)}% F
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Skeleton loader
export function MacroPieChartSkeleton() {
  const size = 160;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="skeleton"
        />
      </svg>
      <div className="flex gap-4 mt-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full skeleton" />
            <div className="w-8 h-3 rounded skeleton" />
          </div>
        ))}
      </div>
    </div>
  );
}
