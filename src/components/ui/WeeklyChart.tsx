'use client';

import { useEffect, useState } from 'react';
import type { DayData, LogStatus } from '@/lib/types';

interface WeeklyChartProps {
  data: DayData[];
  calorieGoal: number;
  /** Map of date strings (YYYY-MM-DD) to their log status */
  dayStatuses?: Map<string, LogStatus>;
}

// Get day abbreviation from date string (YYYY-MM-DD)
function getDayAbbr(dateString: string): string {
  const date = new Date(dateString + 'T12:00:00'); // Add time to avoid timezone issues
  const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  return days[date.getDay()];
}

// Check if date is today
function isToday(dateString: string): boolean {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return dateString === todayStr;
}

export function WeeklyChart({ data, calorieGoal, dayStatuses }: WeeklyChartProps) {
  const [animatedHeights, setAnimatedHeights] = useState<number[]>(data.map(() => 0));

  // Chart dimensions - increased top padding for goal label and calorie values
  const chartWidth = 320;
  const chartHeight = 180;
  const barWidth = 32;
  const barGap = 12;
  const padding = { top: 35, bottom: 30, left: 10, right: 10 };
  
  const graphHeight = chartHeight - padding.top - padding.bottom;
  
  // Calculate max value for scaling (at least the goal)
  const maxCalories = Math.max(
    calorieGoal * 1.2, // 20% above goal for headroom
    ...data.map(d => d.summary.totalCalories)
  );
  
  // Calculate bar heights as percentages
  const barHeights = data.map(d => 
    (d.summary.totalCalories / maxCalories) * graphHeight
  );
  
  // Goal line position
  const goalLineY = padding.top + graphHeight - (calorieGoal / maxCalories) * graphHeight;

  // Animate bars on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedHeights(barHeights);
    }, 100);
    return () => clearTimeout(timer);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate total width needed
  const totalBarsWidth = data.length * barWidth + (data.length - 1) * barGap;
  const startX = (chartWidth - totalBarsWidth) / 2;

  return (
    <div className="w-full">
      <svg 
        viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
        className="w-full max-w-[320px] mx-auto"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Define patterns for skipped days */}
        <defs>
          <pattern
            id="skippedPattern"
            patternUnits="userSpaceOnUse"
            width="6"
            height="6"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="#6B7280" strokeWidth="3" />
          </pattern>
          <pattern
            id="partialPattern"
            patternUnits="userSpaceOnUse"
            width="8"
            height="8"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="8" stroke="#F59E0B" strokeWidth="2" strokeDasharray="2 2" />
          </pattern>
        </defs>

        {/* Bars - drawn first so goal line appears on top */}
        {data.map((day, index) => {
          const x = startX + index * (barWidth + barGap);
          const height = animatedHeights[index];
          const y = padding.top + graphHeight - height;
          const isOverGoal = day.summary.totalCalories > calorieGoal;
          const hasData = day.summary.entries.length > 0;
          const isTodayBar = isToday(day.date);
          const dayStatus = dayStatuses?.get(day.date);
          const isSkipped = dayStatus === 'skipped';
          const isPartial = dayStatus === 'partial';

          // Determine bar fill based on status
          let barFill = isOverGoal ? '#EF4444' : '#FF6B35';
          let barOpacity = hasData ? 1 : 0.3;

          if (isSkipped) {
            barFill = 'url(#skippedPattern)';
            barOpacity = 0.6;
          } else if (isPartial) {
            barFill = 'url(#partialPattern)';
            barOpacity = 0.8;
          }

          return (
            <g key={day.date}>
              {/* Bar background (subtle) */}
              <rect
                x={x}
                y={padding.top}
                width={barWidth}
                height={graphHeight}
                rx={4}
                fill="#1E1E26"
              />
              
              {/* Actual bar */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={height}
                rx={4}
                fill={barFill}
                opacity={barOpacity}
                style={{
                  transition: 'height 0.6s ease-out, y 0.6s ease-out',
                }}
              />

              {/* Solid overlay for skipped/partial to show the pattern better */}
              {(isSkipped || isPartial) && height > 0 && (
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={height}
                  rx={4}
                  fill="none"
                  stroke={isSkipped ? '#6B7280' : '#F59E0B'}
                  strokeWidth={1.5}
                  strokeDasharray={isSkipped ? '4 2' : '0'}
                  style={{
                    transition: 'height 0.6s ease-out, y 0.6s ease-out',
                  }}
                />
              )}

              {/* Day label */}
              <text
                x={x + barWidth / 2}
                y={chartHeight - 10}
                textAnchor="middle"
                fill={isTodayBar ? '#FF6B35' : isSkipped ? '#6B7280' : '#9CA3AF'}
                fontSize="11"
                fontFamily="'Satoshi', sans-serif"
                fontWeight="500"
              >
                {getDayAbbr(day.date)}
              </text>

              {/* Today indicator dot */}
              {isTodayBar && (
                <circle
                  cx={x + barWidth / 2}
                  cy={chartHeight - 4}
                  r={2}
                  fill="#FF6B35"
                />
              )}

              {/* Skipped indicator (small X or slash) */}
              {isSkipped && (
                <text
                  x={x + barWidth / 2}
                  y={padding.top + graphHeight / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#6B7280"
                  fontSize="14"
                  fontWeight="bold"
                >
                  /
                </text>
              )}
            </g>
          );
        })}

        {/* Goal line - drawn after bars so it appears on top */}
        <line
          x1={padding.left}
          y1={goalLineY}
          x2={chartWidth - padding.right}
          y2={goalLineY}
          stroke="#9CA3AF"
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
        
        {/* Goal label with background for visibility */}
        <rect
          x={chartWidth - padding.right - 62}
          y={goalLineY - 14}
          width={60}
          height={14}
          rx={3}
          fill="#141419"
        />
        <text
          x={chartWidth - padding.right - 4}
          y={goalLineY - 4}
          textAnchor="end"
          fill="#9CA3AF"
          fontSize="10"
          fontFamily="'Satoshi', sans-serif"
        >
          Goal: {calorieGoal}
        </text>

        {/* Calorie values on top of bars - drawn last so they're always visible */}
        {data.map((day, index) => {
          const x = startX + index * (barWidth + barGap);
          const height = animatedHeights[index];
          const y = padding.top + graphHeight - height;
          const hasData = day.summary.entries.length > 0;

          if (!hasData || height <= 20) return null;

          return (
            <text
              key={`value-${day.date}`}
              x={x + barWidth / 2}
              y={y - 6}
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="10"
              fontFamily="'Space Mono', monospace"
              fontWeight="500"
            >
              {day.summary.totalCalories}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// Skeleton loader for the chart
// Pre-defined heights for skeleton bars (deterministic for React purity)
const SKELETON_HEIGHTS = [0.5, 0.7, 0.4, 0.65, 0.55, 0.45, 0.6];

export function WeeklyChartSkeleton() {
  const chartWidth = 320;
  const chartHeight = 180;
  const barWidth = 32;
  const barGap = 12;
  const padding = { top: 35, bottom: 30 };
  const graphHeight = chartHeight - padding.top - padding.bottom;
  const numBars = 7;
  
  const totalBarsWidth = numBars * barWidth + (numBars - 1) * barGap;
  const startX = (chartWidth - totalBarsWidth) / 2;

  return (
    <div className="w-full">
      <svg 
        viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
        className="w-full max-w-[320px] mx-auto"
        preserveAspectRatio="xMidYMid meet"
      >
        {Array.from({ length: numBars }).map((_, index) => {
          const x = startX + index * (barWidth + barGap);
          const height = graphHeight * SKELETON_HEIGHTS[index];
          const y = padding.top + graphHeight - height;

          return (
            <g key={index}>
              <rect
                x={x}
                y={padding.top}
                width={barWidth}
                height={graphHeight}
                rx={4}
                fill="#1E1E26"
              />
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={height}
                rx={4}
                className="skeleton"
                style={{ animationDelay: `${index * 100}ms` }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
