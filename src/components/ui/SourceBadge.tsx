'use client';

import { memo } from 'react';

type FoodSource = 'USDA' | 'OFF' | 'GEMINI' | 'API_NINJAS' | string;

interface SourceBadgeProps {
  source: FoodSource;
  /** Compact mode shows only icon + short label */
  compact?: boolean;
}

/**
 * Visual badge indicating the data source for a food item.
 * Helps users distinguish verified data (USDA) from AI estimates (Gemini).
 */
export const SourceBadge = memo(function SourceBadge({ source, compact = false }: SourceBadgeProps) {
  const config = getSourceConfig(source);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap ${config.className} ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      }`}
      title={config.tooltip}
    >
      <span className="leading-none">{config.icon}</span>
      {compact ? config.shortLabel : config.label}
    </span>
  );
});

function getSourceConfig(source: FoodSource) {
  switch (source) {
    case 'USDA':
      return {
        icon: '✓',
        label: 'USDA Verified',
        shortLabel: 'USDA',
        className: 'bg-macro-protein/15 text-macro-protein',
        tooltip: 'Nutrition data from the USDA FoodData Central database',
      };
    case 'GEMINI':
      return {
        icon: '✦',
        label: 'AI Estimate',
        shortLabel: 'AI',
        className: 'bg-amber-500/15 text-amber-400',
        tooltip: 'Nutrition estimated by AI — consider verifying weights and values',
      };
    case 'OFF':
      return {
        icon: '◉',
        label: 'Product DB',
        shortLabel: 'OFF',
        className: 'bg-blue-500/15 text-blue-400',
        tooltip: 'Data from Open Food Facts product database',
      };
    default:
      return {
        icon: '•',
        label: source,
        shortLabel: source,
        className: 'bg-text-muted/15 text-text-muted',
        tooltip: `Data source: ${source}`,
      };
  }
}

/**
 * Summary line showing the count of items by source.
 * e.g., "3 USDA verified, 1 AI estimate"
 */
export function SourceSummary({ sources }: { sources: string[] }) {
  const counts = sources.reduce<Record<string, number>>((acc, s) => {
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const parts: string[] = [];

  if (counts['USDA']) {
    parts.push(`${counts['USDA']} verified`);
  }
  if (counts['GEMINI']) {
    parts.push(`${counts['GEMINI']} AI estimate${counts['GEMINI'] > 1 ? 's' : ''}`);
  }
  if (counts['OFF']) {
    parts.push(`${counts['OFF']} from product DB`);
  }

  if (parts.length === 0) return null;

  const hasAI = (counts['GEMINI'] || 0) > 0;

  return (
    <p className={`text-xs mt-1 ${hasAI ? 'text-amber-400/80' : 'text-text-muted'}`}>
      {parts.join(' · ')}
    </p>
  );
}
