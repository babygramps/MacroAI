'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

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

// Easing function (ease-out cubic)
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function ProgressRing({
  value,
  max,
  color,
  size,
  label,
  unit = '',
  showPercentage = false,
}: ProgressRingProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const [goalHit, setGoalHit] = useState(false);
  const prevValueRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const config = sizeMap[size];
  const colors = colorMap[color];

  const radius = (config.size - config.strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Animated number counter using requestAnimationFrame
  const animateNumber = useCallback((from: number, to: number, duration: number) => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);
      const current = from + (to - from) * easedProgress;
      setDisplayValue(current);
      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };
    animFrameRef.current = requestAnimationFrame(animate);
  }, []);
  
  // Calculate percentages - allow overflow up to 200% (2x goal) for visualization
  const rawPercentage = max > 0 ? (displayValue / max) * 100 : 0;
  const isOver = displayValue > max;
  
  // For the base ring: show up to 100%
  const basePercentage = Math.min(rawPercentage, 100);
  const baseStrokeDashoffset = circumference - (basePercentage / 100) * circumference;
  
  // For the overflow ring: show the amount over 100%, capped at another 100% (so max 200% total)
  const overflowPercentage = isOver ? Math.min(rawPercentage - 100, 100) : 0;
  const overflowStrokeDashoffset = circumference - (overflowPercentage / 100) * circumference;

  useEffect(() => {
    const prevValue = prevValueRef.current;
    const currentPercentage = max > 0 ? (value / max) * 100 : 0;
    const prevPct = max > 0 ? (prevValue / max) * 100 : 0;

    // Animate the number from previous to current value
    const timer = setTimeout(() => {
      animateNumber(prevValue, value, 800);
    }, 100);

    // Trigger goal-hit glow when crossing 95% upward (use setTimeout to avoid sync setState in effect)
    // glowOffTimer duration must match --animate-goal-glow in globals.css
    let glowOnTimer: ReturnType<typeof setTimeout> | undefined;
    let glowOffTimer: ReturnType<typeof setTimeout> | undefined;
    if (currentPercentage >= 95 && currentPercentage <= 105 && prevPct < 95 && prevValue > 0) {
      glowOnTimer = setTimeout(() => setGoalHit(true), 0);
      glowOffTimer = setTimeout(() => setGoalHit(false), 1500);
    }

    prevValueRef.current = value;
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(animFrameRef.current);
      if (glowOnTimer) clearTimeout(glowOnTimer);
      if (glowOffTimer) clearTimeout(glowOffTimer);
    };
  }, [value, max, animateNumber]);

  // Determine SVG class - goal hit glow overrides normal glow
  const svgClass = goalHit
    ? 'transform -rotate-90 animate-goal-glow'
    : `transform -rotate-90 ${isOver ? 'drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]' : colors.glow}`;

  return (
    <div className="relative inline-flex flex-col items-center">
      <svg
        width={config.size}
        height={config.size}
        className={svgClass}
        style={{ '--ring-color': colors.stroke } as React.CSSProperties}
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
        {/* Base progress ring - shows up to 100% in the macro color */}
        <circle
          cx={config.size / 2}
          cy={config.size / 2}
          r={radius}
          fill="none"
          stroke={isOver ? colors.stroke : colors.stroke}
          strokeWidth={config.strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={baseStrokeDashoffset}
        />
        {/* Overflow ring - shows amount over 100% in red, overlapping the start */}
        {isOver && (
          <circle
            cx={config.size / 2}
            cy={config.size / 2}
            r={radius}
            fill="none"
            stroke="#EF4444"
            strokeWidth={config.strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={overflowStrokeDashoffset}
          />
        )}
      </svg>

      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`${config.fontSize} font-mono font-bold ${isOver ? 'text-red-500' : 'text-text-primary'}`}
        >
          {showPercentage ? `${Math.round(rawPercentage)}%` : Math.round(displayValue)}
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
