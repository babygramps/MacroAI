'use client';

import { useEffect, useState } from 'react';
import type { TdeeDataPoint } from '@/lib/types';

interface TdeeChartProps {
    data: TdeeDataPoint[];
    targetCalories?: number;
    showRawPoints?: boolean;
}

// Get short date format (Jan 5)
function formatShortDate(dateString: string): string {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateString)
        ? new Date(`${dateString}T00:00:00`)
        : new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function TdeeChart({
    data,
    targetCalories,
    showRawPoints = true,
}: TdeeChartProps) {
    const [animatedProgress, setAnimatedProgress] = useState(0);

    // Chart dimensions
    const chartWidth = 320;
    const chartHeight = 180;
    const padding = { top: 25, bottom: 35, left: 50, right: 15 };

    const graphWidth = chartWidth - padding.left - padding.right;
    const graphHeight = chartHeight - padding.top - padding.bottom;

    // Collect all TDEE values for y-axis scaling
    const rawValues = data
        .filter((d) => d.rawTdee !== null)
        .map((d) => d.rawTdee as number);
    const smoothedValues = data.map((d) => d.smoothedTdee);
    const allValues = [...rawValues, ...smoothedValues];

    if (targetCalories) {
        allValues.push(targetCalories);
    }

    const minTdee = Math.min(...allValues);
    const maxTdee = Math.max(...allValues);
    const tdeeRange = maxTdee - minTdee || 500; // Minimum range of 500 kcal
    const tdeePadding = tdeeRange * 0.1; // Add 10% padding

    const yMin = minTdee - tdeePadding;
    const yMax = maxTdee + tdeePadding;
    const yRange = yMax - yMin;

    // Generate points for raw TDEE (scatter points)
    const rawPoints = data
        .map((entry, index) => {
            if (entry.rawTdee === null) return null;
            const x = padding.left + (index / (data.length - 1 || 1)) * graphWidth;
            const y = padding.top + graphHeight - ((entry.rawTdee - yMin) / yRange) * graphHeight;
            return { x, y, value: entry.rawTdee, date: entry.date };
        })
        .filter((p): p is { x: number; y: number; value: number; date: string } => p !== null);

    // Generate points for smoothed TDEE (smooth line)
    const smoothedPoints = data.map((entry, index) => {
        const x = padding.left + (index / (data.length - 1 || 1)) * graphWidth;
        const y = padding.top + graphHeight - ((entry.smoothedTdee - yMin) / yRange) * graphHeight;
        return { x, y, value: entry.smoothedTdee, date: entry.date };
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

    const linePath = createSmoothPath(smoothedPoints);

    // Create gradient area path
    const areaPath = linePath && smoothedPoints.length > 0
        ? `${linePath} L ${smoothedPoints[smoothedPoints.length - 1]?.x} ${padding.top + graphHeight} L ${smoothedPoints[0]?.x} ${padding.top + graphHeight} Z`
        : '';

    // Target line position
    const targetY = targetCalories
        ? padding.top + graphHeight - ((targetCalories - yMin) / yRange) * graphHeight
        : null;

    // Y-axis labels (3 labels)
    const yLabels = [
        { value: yMax, y: padding.top },
        { value: (yMax + yMin) / 2, y: padding.top + graphHeight / 2 },
        { value: yMin, y: padding.top + graphHeight },
    ];

    // X-axis labels (first and last date)
    const xLabels =
        data.length > 0
            ? [
                { label: formatShortDate(data[0].date), x: padding.left },
                { label: formatShortDate(data[data.length - 1].date), x: chartWidth - padding.right },
            ]
            : [];

    // Animate on mount
    useEffect(() => {
        const timer = setTimeout(() => {
            setAnimatedProgress(1);
        }, 100);
        return () => clearTimeout(timer);
    }, [data]);

    if (data.length === 0) {
        return (
            <div className="w-full flex items-center justify-center py-8">
                <p className="text-text-muted text-center">No TDEE data yet</p>
            </div>
        );
    }

    // Get latest value for display
    const latestSmoothedTdee = smoothedPoints.length > 0 ? smoothedPoints[smoothedPoints.length - 1].value : null;

    return (
        <div className="w-full">
            {/* Legend */}
            {showRawPoints && rawPoints.length > 0 && (
                <div className="flex items-center justify-center gap-4 mb-2">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-[#FF6B35] opacity-50" />
                        <span className="text-xs text-text-muted">Raw</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-0.5 bg-[#FF6B35]" />
                        <span className="text-xs text-text-muted">Smoothed</span>
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
                    <linearGradient id="tdeeGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FF6B35" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#FF6B35" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="tdeeLineGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#FF6B35" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="#FF6B35" stopOpacity={1} />
                    </linearGradient>
                    <clipPath id="tdeeLineClip">
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
                        {Math.round(label.value)}
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

                {/* Target line */}
                {targetY !== null && (
                    <>
                        <line
                            x1={padding.left}
                            y1={targetY}
                            x2={chartWidth - padding.right}
                            y2={targetY}
                            stroke="#10B981"
                            strokeWidth={1.5}
                            strokeDasharray="6 4"
                        />
                        <rect
                            x={chartWidth - padding.right - 50}
                            y={targetY - 14}
                            width={48}
                            height={14}
                            rx={3}
                            fill="#141419"
                        />
                        <text
                            x={chartWidth - padding.right - 4}
                            y={targetY - 4}
                            textAnchor="end"
                            fill="#10B981"
                            fontSize="10"
                            fontFamily="'Satoshi', sans-serif"
                        >
                            Target
                        </text>
                    </>
                )}

                {/* Area fill under smoothed line */}
                <path
                    d={areaPath}
                    fill="url(#tdeeGradient)"
                    clipPath="url(#tdeeLineClip)"
                    style={{
                        transition: 'opacity 0.6s ease-out',
                        opacity: animatedProgress,
                    }}
                />

                {/* Smoothed TDEE Line */}
                {smoothedPoints.length > 0 && (
                    <path
                        d={linePath}
                        fill="none"
                        stroke="url(#tdeeLineGradient)"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        clipPath="url(#tdeeLineClip)"
                        style={{
                            transition: 'stroke-dashoffset 0.6s ease-out',
                        }}
                    />
                )}

                {/* Raw TDEE points (scatter) */}
                {showRawPoints && rawPoints.map((point, index) => (
                    <g key={`raw-${index}`}>
                        <circle
                            cx={point.x}
                            cy={point.y}
                            r={3}
                            fill="#141419"
                            stroke="#FF6B35"
                            strokeWidth={1.5}
                            opacity={animatedProgress * 0.7}
                            style={{
                                transition: 'opacity 0.6s ease-out',
                                transitionDelay: `${index * 30}ms`,
                            }}
                        />
                    </g>
                ))}

                {/* Smoothed endpoint highlight */}
                {smoothedPoints.length > 0 && (
                    <g>
                        {/* Outer glow */}
                        <circle
                            cx={smoothedPoints[smoothedPoints.length - 1].x}
                            cy={smoothedPoints[smoothedPoints.length - 1].y}
                            r={10}
                            fill="#FF6B35"
                            opacity={0.15 * animatedProgress}
                        />
                        {/* Inner point */}
                        <circle
                            cx={smoothedPoints[smoothedPoints.length - 1].x}
                            cy={smoothedPoints[smoothedPoints.length - 1].y}
                            r={5}
                            fill="#FF6B35"
                            opacity={animatedProgress}
                        />
                    </g>
                )}

                {/* Latest smoothed TDEE label */}
                {latestSmoothedTdee !== null && smoothedPoints.length > 0 && (
                    <text
                        x={smoothedPoints[smoothedPoints.length - 1].x}
                        y={smoothedPoints[smoothedPoints.length - 1].y - 14}
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontSize="11"
                        fontFamily="'Space Mono', monospace"
                        fontWeight="500"
                        opacity={animatedProgress}
                    >
                        {Math.round(latestSmoothedTdee)}
                    </text>
                )}
            </svg>
        </div>
    );
}

// Skeleton loader for the chart
export function TdeeChartSkeleton() {
    const chartWidth = 320;
    const chartHeight = 180;
    const padding = { top: 25, bottom: 35, left: 50, right: 15 };
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
                        x={padding.left - 40}
                        y={padding.top + graphHeight * pos - 5}
                        width={30}
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
