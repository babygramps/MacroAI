'use client';

import { useEffect, useState, useRef } from 'react';
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
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    // Chart dimensions
    const chartWidth = 320;
    const chartHeight = 180;
    const padding = { top: 25, bottom: 35, left: 50, right: 15 };

    const graphWidth = chartWidth - padding.left - padding.right;
    const graphHeight = chartHeight - padding.top - padding.bottom;

    // Collect all TDEE values for y-axis scaling (include confidence bands)
    const rawValues = data
        .filter((d) => d.rawTdee !== null)
        .map((d) => d.rawTdee as number);
    const smoothedValues = data.map((d) => d.smoothedTdee);
    const upperBandValues = data.map((d) => d.smoothedTdee + d.fluxConfidenceRange);
    const lowerBandValues = data.map((d) => Math.max(0, d.smoothedTdee - d.fluxConfidenceRange));
    const allValues = [...rawValues, ...smoothedValues, ...upperBandValues, ...lowerBandValues];

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
            return { x, y, value: entry.rawTdee, date: entry.date, index };
        })
        .filter((p): p is { x: number; y: number; value: number; date: string; index: number } => p !== null);

    // Generate points for smoothed TDEE (smooth line)
    const smoothedPoints = data.map((entry, index) => {
        const x = padding.left + (index / (data.length - 1 || 1)) * graphWidth;
        const y = padding.top + graphHeight - ((entry.smoothedTdee - yMin) / yRange) * graphHeight;
        return { x, y, value: entry.smoothedTdee, date: entry.date, index };
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

    // Generate confidence band points (upper and lower bounds)
    const upperBandPoints = data.map((entry, index) => {
        const x = padding.left + (index / (data.length - 1 || 1)) * graphWidth;
        const upperValue = entry.smoothedTdee + entry.fluxConfidenceRange;
        const y = padding.top + graphHeight - ((upperValue - yMin) / yRange) * graphHeight;
        return { x, y };
    });

    const lowerBandPoints = data.map((entry, index) => {
        const x = padding.left + (index / (data.length - 1 || 1)) * graphWidth;
        const lowerValue = Math.max(0, entry.smoothedTdee - entry.fluxConfidenceRange);
        const y = padding.top + graphHeight - ((lowerValue - yMin) / yRange) * graphHeight;
        return { x, y };
    });

    // Create confidence band area path (upper curve forward, lower curve backward)
    const upperPath = createSmoothPath(upperBandPoints);
    const confidenceBandPath = upperBandPoints.length >= 2 && lowerBandPoints.length >= 2
        ? `${upperPath} L ${lowerBandPoints[lowerBandPoints.length - 1].x} ${lowerBandPoints[lowerBandPoints.length - 1].y} ${createSmoothPath([...lowerBandPoints].reverse()).replace('M', 'L')} L ${upperBandPoints[0].x} ${upperBandPoints[0].y} Z`
        : '';

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

    // Handle mouse move for hover
    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!svgRef.current || data.length === 0) return;

        const svg = svgRef.current;
        const rect = svg.getBoundingClientRect();
        const scaleX = chartWidth / rect.width;
        const mouseX = (e.clientX - rect.left) * scaleX;

        // Find the closest data point
        const graphMouseX = mouseX - padding.left;
        const dataIndex = Math.round((graphMouseX / graphWidth) * (data.length - 1));
        const clampedIndex = Math.max(0, Math.min(data.length - 1, dataIndex));

        // Only show hover if within the graph area
        if (mouseX >= padding.left && mouseX <= chartWidth - padding.right) {
            setHoveredIndex(clampedIndex);
        } else {
            setHoveredIndex(null);
        }
    };

    const handleMouseLeave = () => {
        setHoveredIndex(null);
    };

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

    // Get latest value for display (when not hovering)
    const latestSmoothedTdee = smoothedPoints.length > 0 ? smoothedPoints[smoothedPoints.length - 1].value : null;

    // Get hovered point data
    const hoveredPoint = hoveredIndex !== null ? smoothedPoints[hoveredIndex] : null;
    const hoveredRawPoint = hoveredIndex !== null ? rawPoints.find(p => p.index === hoveredIndex) : null;
    const hoveredFlux = hoveredIndex !== null ? data[hoveredIndex]?.fluxConfidenceRange ?? 0 : 0;

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
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-2 bg-[#FF6B35] opacity-15 rounded-sm" />
                        <span className="text-xs text-text-muted">&plusmn; Range</span>
                    </div>
                </div>
            )}

            <svg
                ref={svgRef}
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full max-w-[320px] mx-auto cursor-crosshair"
                preserveAspectRatio="xMidYMid meet"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
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
                    <linearGradient id="confidenceBandGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FF6B35" stopOpacity={0.08} />
                        <stop offset="50%" stopColor="#FF6B35" stopOpacity={0.12} />
                        <stop offset="100%" stopColor="#FF6B35" stopOpacity={0.08} />
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

                {/* Hover vertical line */}
                {hoveredPoint && (
                    <line
                        x1={hoveredPoint.x}
                        y1={padding.top}
                        x2={hoveredPoint.x}
                        y2={padding.top + graphHeight}
                        stroke="#FF6B35"
                        strokeWidth={1}
                        strokeDasharray="4 2"
                        opacity={0.5}
                    />
                )}

                {/* Confidence band (uncertainty range) */}
                {confidenceBandPath && (
                    <path
                        d={confidenceBandPath}
                        fill="url(#confidenceBandGradient)"
                        clipPath="url(#tdeeLineClip)"
                        style={{
                            transition: 'opacity 0.6s ease-out',
                            opacity: animatedProgress,
                        }}
                    />
                )}

                {/* Upper confidence band edge (dashed) */}
                {upperBandPoints.length >= 2 && (
                    <path
                        d={createSmoothPath(upperBandPoints)}
                        fill="none"
                        stroke="#FF6B35"
                        strokeWidth={0.75}
                        strokeDasharray="3 3"
                        opacity={0.25 * animatedProgress}
                        clipPath="url(#tdeeLineClip)"
                    />
                )}

                {/* Lower confidence band edge (dashed) */}
                {lowerBandPoints.length >= 2 && (
                    <path
                        d={createSmoothPath(lowerBandPoints)}
                        fill="none"
                        stroke="#FF6B35"
                        strokeWidth={0.75}
                        strokeDasharray="3 3"
                        opacity={0.25 * animatedProgress}
                        clipPath="url(#tdeeLineClip)"
                    />
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
                {showRawPoints && rawPoints.map((point) => (
                    <g key={`raw-${point.index}`}>
                        <circle
                            cx={point.x}
                            cy={point.y}
                            r={hoveredIndex === point.index ? 5 : 3}
                            fill="#141419"
                            stroke="#FF6B35"
                            strokeWidth={1.5}
                            opacity={animatedProgress * (hoveredIndex === point.index ? 1 : 0.7)}
                            style={{
                                transition: 'r 0.15s ease-out, opacity 0.15s ease-out',
                            }}
                        />
                    </g>
                ))}

                {/* Hovered point highlight on smoothed line */}
                {hoveredPoint && (
                    <g>
                        {/* Outer glow */}
                        <circle
                            cx={hoveredPoint.x}
                            cy={hoveredPoint.y}
                            r={10}
                            fill="#FF6B35"
                            opacity={0.2}
                        />
                        {/* Inner point */}
                        <circle
                            cx={hoveredPoint.x}
                            cy={hoveredPoint.y}
                            r={5}
                            fill="#FF6B35"
                        />
                    </g>
                )}

                {/* Smoothed endpoint highlight (when not hovering) */}
                {smoothedPoints.length > 0 && hoveredIndex === null && (
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

                {/* Hover tooltip */}
                {hoveredPoint && (
                    <g>
                        {/* Tooltip background */}
                        <rect
                            x={Math.min(Math.max(hoveredPoint.x - 50, padding.left), chartWidth - padding.right - 100)}
                            y={Math.max(hoveredPoint.y - 55, padding.top)}
                            width={100}
                            height={hoveredRawPoint ? 48 : 38}
                            rx={4}
                            fill="#1E1E26"
                            stroke="#2A2A35"
                            strokeWidth={1}
                        />
                        {/* Date */}
                        <text
                            x={Math.min(Math.max(hoveredPoint.x, padding.left + 50), chartWidth - padding.right - 50)}
                            y={Math.max(hoveredPoint.y - 42, padding.top + 13)}
                            textAnchor="middle"
                            fill="#9CA3AF"
                            fontSize="9"
                            fontFamily="'Satoshi', sans-serif"
                        >
                            {formatShortDate(hoveredPoint.date)}
                        </text>
                        {/* Smoothed value */}
                        <text
                            x={Math.min(Math.max(hoveredPoint.x, padding.left + 50), chartWidth - padding.right - 50)}
                            y={Math.max(hoveredPoint.y - 30, padding.top + 25)}
                            textAnchor="middle"
                            fill="#FF6B35"
                            fontSize="11"
                            fontFamily="'Space Mono', monospace"
                            fontWeight="600"
                        >
                            {Math.round(hoveredPoint.value)} kcal
                        </text>
                        {/* Confidence range */}
                        <text
                            x={Math.min(Math.max(hoveredPoint.x, padding.left + 50), chartWidth - padding.right - 50)}
                            y={Math.max(hoveredPoint.y - 20, padding.top + 35)}
                            textAnchor="middle"
                            fill="#9CA3AF"
                            fontSize="8"
                            fontFamily="'Space Mono', monospace"
                        >
                            &plusmn;{hoveredFlux} kcal
                        </text>
                        {/* Raw value (if different) */}
                        {hoveredRawPoint && (
                            <text
                                x={Math.min(Math.max(hoveredPoint.x, padding.left + 50), chartWidth - padding.right - 50)}
                                y={Math.max(hoveredPoint.y - 10, padding.top + 45)}
                                textAnchor="middle"
                                fill="#9CA3AF"
                                fontSize="9"
                                fontFamily="'Space Mono', monospace"
                            >
                                Raw: {Math.round(hoveredRawPoint.value)}
                            </text>
                        )}
                    </g>
                )}

                {/* Latest smoothed TDEE label (when not hovering) */}
                {latestSmoothedTdee !== null && smoothedPoints.length > 0 && hoveredIndex === null && (
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
