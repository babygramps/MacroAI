'use client';

import { useEffect, useState } from 'react';

interface ProgressRingProps {
  value: number;
  max: number;
  color: 'calories' | 'protein' | 'carbs' | 'fat';
  size: 'sm' | 'lg';
  label?: string;
  unit?: string;
  showPercentage?: boolean;
}

const colorMap = {
  calories: {
    stroke: '#FF6B35',
    glow: 'glow-calories',
  },
  protein: {
    stroke: '#00E5A0',
    glow: 'glow-protein',
  },
  carbs: {
    stroke: '#FFD23F',
    glow: 'glow-carbs',
  },
  fat: {
    stroke: '#A855F7',
    glow: 'glow-fat',
  },
};

const sizeMap = {
  sm: {
    size: 80,
    strokeWidth: 6,
    fontSize: 'text-lg',
    labelSize: 'text-xs',
  },
  lg: {
    size: 200,
    strokeWidth: 10,
    fontSize: 'text-macro-number',
    labelSize: 'text-sm',
  },
};

export function ProgressRing({
  value,
  max,
  color,
  size,
  label,
  unit = '',
  showPercentage = false,
}: ProgressRingProps) {
  const [animatedValue, setAnimatedValue] = useState(0);
  const config = sizeMap[size];
  const colors = colorMap[color];

  const radius = (config.size - config.strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = Math.min((animatedValue / max) * 100, 100);
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const isOver = value > max;

  useEffect(() => {
    // Animate the value on mount
    const timer = setTimeout(() => {
      setAnimatedValue(value);
    }, 100);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div className="relative inline-flex flex-col items-center">
      <svg
        width={config.size}
        height={config.size}
        className={`transform -rotate-90 ${colors.glow}`}
      >
        {/* Background ring */}
        <circle
          cx={config.size / 2}
          cy={config.size / 2}
          r={radius}
          fill="none"
          stroke="#1E1E26"
          strokeWidth={config.strokeWidth}
        />
        {/* Progress ring */}
        <circle
          cx={config.size / 2}
          cy={config.size / 2}
          r={radius}
          fill="none"
          stroke={isOver ? '#EF4444' : colors.stroke}
          strokeWidth={config.strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{
            transition: 'stroke-dashoffset 1.2s ease-out',
          }}
        />
      </svg>

      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`${config.fontSize} font-mono font-bold ${isOver ? 'text-red-500' : 'text-text-primary'}`}
        >
          {showPercentage ? `${Math.round(percentage)}%` : Math.round(animatedValue)}
        </span>
        {unit && size === 'lg' && (
          <span className={`${config.labelSize} text-text-muted`}>
            of {max} {unit}
          </span>
        )}
        {unit && size === 'sm' && (
          <span className={`${config.labelSize} text-text-muted`}>{unit}</span>
        )}
      </div>

      {/* Label below ring */}
      {label && (
        <span className="mt-1 text-xs text-text-secondary font-medium">
          {label}
        </span>
      )}
    </div>
  );
}
