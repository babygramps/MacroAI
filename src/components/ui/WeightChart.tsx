'use client';

import { useEffect, useState } from 'react';
import type { WeightLogEntry, WeightDataPoint } from '@/lib/types';

interface WeightChartProps {
  data: WeightLogEntry[];
  unit?: 'kg' | 'lbs';
  targetWeight?: number;
  // New prop for trend data
  trendData?: WeightDataPoint[];
  showTrendLine?: boolean;
}

// Get short date format (Jan 5)
function formatShortDate(dateString: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateString)
    ? new Date(`${dateString}T00:00:00`)
    : new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Convert kg to lbs if needed
function convertWeight(weightKg: number, unit: 'kg' | 'lbs'): number {
  if (unit === 'lbs') {
    return Math.round(weightKg * 2.20462 * 10) / 10;
  }
  return Math.round(weightKg * 10) / 10;
}

export function WeightChart({ 
  data, 
  unit = 'kg', 
  targetWeight,
  trendData,
  showTrendLine = true,
}: WeightChartProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);

  // Chart dimensions
  const chartWidth = 320;
  const chartHeight = 180;
  const padding = { top: 25, bottom: 35, left: 45, right: 15 };

  const graphWidth = chartWidth - padding.left - padding.right;
  const graphHeight = chartHeight - padding.top - padding.bottom;

  // Collect all weights (raw + trend + target) for y-axis scaling
  const rawWeights = data.map((d) => convertWeight(d.weightKg, unit));
  const trendWeights = trendData?.map((d) => convertWeight(d.trendWeight, unit)) ?? [];
  const allWeights = [...rawWeights, ...trendWeights];
  
  if (targetWeight) {
    allWeights.push(convertWeight(targetWeight, unit));
  }

  const minWeight = Math.min(...allWeights);
  const maxWeight = Math.max(...allWeights);
  const weightRange = maxWeight - minWeight || 1;
  const weightPadding = weightRange * 0.1; // Add 10% padding

  const yMin = minWeight - weightPadding;
  const yMax = maxWeight + weightPadding;
  const yRange = yMax - yMin;

  // Generate points for raw scale weights (scatter points)
  const scalePoints = data.map((entry, index) => {
    const x = padding.left + (index / (data.length - 1 || 1)) * graphWidth;
    const weight = convertWeight(entry.weightKg, unit);
    const y = padding.top + graphHeight - ((weight - yMin) / yRange) * graphHeight;
    return { x, y, weight, date: entry.recordedAt };
  });

  // Generate points for trend weights (smooth line)
  const trendPoints = (trendData ?? []).map((entry, index, arr) => {
    const x = padding.left + (index / (arr.length - 1 || 1)) * graphWidth;
    const weight = convertWeight(entry.trendWeight, unit);
    const y = padding.top + graphHeight - ((weight - yMin) / yRange) * graphHeight;
    return { x, y, weight, date: entry.date };
  });

  // Create smooth curve path using catmull-rom spline
  function createSmoothPath(pts: { x: number; y: number }[]): string {
    if (pts.length < 2) return '';
    if (pts.length === 2) {
      return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
    }

    let path = `M ${pts[0].x} ${pts[0].y}`;

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    return path;
  }

  // Use trend data for the line if available, otherwise fall back to scale data
  const linePoints = showTrendLine && trendPoints.length > 0 ? trendPoints : scalePoints;
  const linePath = createSmoothPath(linePoints);

  // Create gradient area path
  const areaPath = linePath && linePoints.length > 0
    ? `${linePath} L ${linePoints[linePoints.length - 1]?.x} ${padding.top + graphHeight} L ${linePoints[0]?.x} ${padding.top + graphHeight} Z`
    : '';

  // Goal line position
  const goalY = targetWeight
    ? padding.top + graphHeight - ((convertWeight(targetWeight, unit) - yMin) / yRange) * graphHeight
    : null;

  // Y-axis labels (3 labels)
  const yLabels = [
    { value: yMax, y: padding.top },
    { value: (yMax + yMin) / 2, y: padding.top + graphHeight / 2 },
    { value: yMin, y: padding.top + graphHeight },
  ];

  // X-axis labels (first and last date)
  // Helper to get date from either type
  const getDateFromEntry = (entry: WeightLogEntry | WeightDataPoint): string => {
    if ('recordedAt' in entry) {
      return entry.recordedAt;
    }
    return entry.date;
  };
  
  const dateSource = trendData && trendData.length > 0 ? trendData : data;
  const xLabels =
    dateSource.length > 0
      ? [
          { label: formatShortDate(getDateFromEntry(dateSource[0] as WeightLogEntry | WeightDataPoint)), x: padding.left },
          { label: formatShortDate(getDateFromEntry(dateSource[dateSource.length - 1] as WeightLogEntry | WeightDataPoint)), x: chartWidth - padding.right },
        ]
      : [];

  // Animate on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedProgress(1);
    }, 100);
    return () => clearTimeout(timer);
  }, [data, trendData]);

  if (data.length === 0 && (!trendData || trendData.length === 0)) {
    return (
      <div className="w-full flex items-center justify-center py-8">
        <p className="text-text-muted text-center">No weight data yet</p>
      </div>
    );
  }

  // Get latest values for display
  const latestTrendWeight = trendPoints.length > 0 ? trendPoints[trendPoints.length - 1].weight : null;
  const latestScaleWeight = scalePoints.length > 0 ? scalePoints[scalePoints.length - 1].weight : null;

  return (
    <div className="w-full">
      {/* Legend */}
      {showTrendLine && trendData && trendData.length > 0 && (
        <div className="flex items-center justify-center gap-4 mb-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#60A5FA] opacity-50" />
            <span className="text-xs text-text-muted">Scale</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-[#60A5FA]" />
            <span className="text-xs text-text-muted">Trend</span>
          </div>
        </div>
      )}
      
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full max-w-[320px] mx-auto"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Definitions */}
        <defs>
          <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#60A5FA" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="trendLineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#60A5FA" stopOpacity={1} />
          </linearGradient>
          <clipPath id="lineClip">
            <rect
              x={padding.left}
              y={padding.top}
              width={graphWidth * animatedProgress}
              height={graphHeight}
            />
          </clipPath>
        </defs>

        {/* Y-axis labels */}
        {yLabels.map((label, index) => (
          <text
            key={index}
            x={padding.left - 8}
            y={label.y + 4}
            textAnchor="end"
            fill="#9CA3AF"
            fontSize="10"
            fontFamily="'Space Mono', monospace"
          >
            {Math.round(label.value * 10) / 10}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map((label, index) => (
          <text
            key={index}
            x={label.x}
            y={chartHeight - 8}
            textAnchor={index === 0 ? 'start' : 'end'}
            fill="#9CA3AF"
            fontSize="10"
            fontFamily="'Satoshi', sans-serif"
          >
            {label.label}
          </text>
        ))}

        {/* Grid lines */}
        {yLabels.map((label, index) => (
          <line
            key={index}
            x1={padding.left}
            y1={label.y}
            x2={chartWidth - padding.right}
            y2={label.y}
            stroke="#2A2A35"
            strokeWidth={1}
          />
        ))}

        {/* Goal line */}
        {goalY !== null && (
          <>
            <line
              x1={padding.left}
              y1={goalY}
              x2={chartWidth - padding.right}
              y2={goalY}
              stroke="#10B981"
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
            <rect
              x={chartWidth - padding.right - 50}
              y={goalY - 14}
              width={48}
              height={14}
              rx={3}
              fill="#141419"
            />
            <text
              x={chartWidth - padding.right - 4}
              y={goalY - 4}
              textAnchor="end"
              fill="#10B981"
              fontSize="10"
              fontFamily="'Satoshi', sans-serif"
            >
              Goal
            </text>
          </>
        )}

        {/* Area fill under trend line */}
        <path
          d={areaPath}
          fill="url(#weightGradient)"
          clipPath="url(#lineClip)"
          style={{
            transition: 'opacity 0.6s ease-out',
            opacity: animatedProgress,
          }}
        />

        {/* Trend Line (smooth, solid) */}
        {showTrendLine && trendPoints.length > 0 && (
          <path
            d={createSmoothPath(trendPoints)}
            fill="none"
            stroke="url(#trendLineGradient)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            clipPath="url(#lineClip)"
            style={{
              transition: 'stroke-dashoffset 0.6s ease-out',
            }}
          />
        )}

        {/* Fallback: Simple line if no trend data */}
        {(!showTrendLine || trendPoints.length === 0) && (
          <path
            d={linePath}
            fill="none"
            stroke="#60A5FA"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            clipPath="url(#lineClip)"
            style={{
              transition: 'stroke-dashoffset 0.6s ease-out',
            }}
          />
        )}

        {/* Raw scale weight points (scatter) */}
        {scalePoints.map((point, index) => (
          <g key={`scale-${index}`}>
            {/* Point */}
            <circle
              cx={point.x}
              cy={point.y}
              r={3}
              fill="#141419"
              stroke="#60A5FA"
              strokeWidth={1.5}
              opacity={animatedProgress * 0.7}
              style={{
                transition: 'opacity 0.6s ease-out',
                transitionDelay: `${index * 30}ms`,
              }}
            />
          </g>
        ))}

        {/* Trend endpoint highlight */}
        {showTrendLine && trendPoints.length > 0 && (
          <g>
            {/* Outer glow */}
            <circle
              cx={trendPoints[trendPoints.length - 1].x}
              cy={trendPoints[trendPoints.length - 1].y}
              r={10}
              fill="#60A5FA"
              opacity={0.15 * animatedProgress}
            />
            {/* Inner point */}
            <circle
              cx={trendPoints[trendPoints.length - 1].x}
              cy={trendPoints[trendPoints.length - 1].y}
              r={5}
              fill="#60A5FA"
              opacity={animatedProgress}
            />
          </g>
        )}

        {/* Latest trend weight label */}
        {latestTrendWeight !== null && trendPoints.length > 0 && (
          <text
            x={trendPoints[trendPoints.length - 1].x}
            y={trendPoints[trendPoints.length - 1].y - 14}
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="11"
            fontFamily="'Space Mono', monospace"
            fontWeight="500"
            opacity={animatedProgress}
          >
            {latestTrendWeight}
          </text>
        )}

        {/* Fallback: show scale weight if no trend */}
        {(!showTrendLine || trendPoints.length === 0) && latestScaleWeight !== null && scalePoints.length > 0 && (
          <>
            {/* Outer glow for last scale point */}
            <circle
              cx={scalePoints[scalePoints.length - 1].x}
              cy={scalePoints[scalePoints.length - 1].y}
              r={8}
              fill="#60A5FA"
              opacity={0.2 * animatedProgress}
            />
            <circle
              cx={scalePoints[scalePoints.length - 1].x}
              cy={scalePoints[scalePoints.length - 1].y}
              r={5}
              fill="#60A5FA"
              opacity={animatedProgress}
            />
            <text
              x={scalePoints[scalePoints.length - 1].x}
              y={scalePoints[scalePoints.length - 1].y - 12}
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="11"
              fontFamily="'Space Mono', monospace"
              fontWeight="500"
              opacity={animatedProgress}
            >
              {latestScaleWeight}
            </text>
          </>
        )}
      </svg>

      {/* Scale vs Trend comparison */}
      {showTrendLine && latestTrendWeight !== null && latestScaleWeight !== null && latestTrendWeight !== latestScaleWeight && (
        <div className="flex justify-center mt-2">
          <div className="text-xs text-text-muted">
            Scale: {latestScaleWeight} {unit} | Trend: {latestTrendWeight} {unit}
          </div>
        </div>
      )}
    </div>
  );
}

// Skeleton loader for the chart
export function WeightChartSkeleton() {
  const chartWidth = 320;
  const chartHeight = 180;
  const padding = { top: 25, bottom: 35, left: 45, right: 15 };
  const graphWidth = chartWidth - padding.left - padding.right;
  const graphHeight = chartHeight - padding.top - padding.bottom;

  // Generate a fake wavy line for skeleton
  const points = Array.from({ length: 7 }, (_, i) => ({
    x: padding.left + (i / 6) * graphWidth,
    y: padding.top + graphHeight / 2 + Math.sin(i * 0.8) * 20,
  }));

  const path = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full max-w-[320px] mx-auto"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Y-axis skeleton labels */}
        {[0, 0.5, 1].map((pos, index) => (
          <rect
            key={index}
            x={padding.left - 35}
            y={padding.top + graphHeight * pos - 5}
            width={25}
            height={10}
            rx={3}
            className="skeleton"
          />
        ))}

        {/* Grid lines */}
        {[0, 0.5, 1].map((pos, index) => (
          <line
            key={index}
            x1={padding.left}
            y1={padding.top + graphHeight * pos}
            x2={chartWidth - padding.right}
            y2={padding.top + graphHeight * pos}
            stroke="#2A2A35"
            strokeWidth={1}
          />
        ))}

        {/* Skeleton line */}
        <path
          d={path}
          fill="none"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="skeleton"
          style={{ stroke: '#2A2A35' }}
        />

        {/* Skeleton points */}
        {points.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r={3} className="skeleton" />
        ))}

        {/* X-axis skeleton labels */}
        <rect x={padding.left} y={chartHeight - 15} width={40} height={10} rx={3} className="skeleton" />
        <rect
          x={chartWidth - padding.right - 40}
          y={chartHeight - 15}
          width={40}
          height={10}
          rx={3}
          className="skeleton"
        />
      </svg>
    </div>
  );
}
