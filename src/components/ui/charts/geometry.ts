// Shared SVG chart geometry helpers.
//
// Previously `createSmoothPath` was defined inline (and identically, modulo
// indentation) in both WeightChart.tsx and TdeeChart.tsx. Pulling it out here
// gives both charts one canonical implementation instead of two copies that
// could silently drift apart.

export interface SplinePoint {
  x: number;
  y: number;
}

/**
 * Build an SVG path `d` string that draws a smooth curve through `pts`
 * using a Catmull-Rom spline expressed as cubic Bezier segments.
 *
 * - 0 or 1 points: no path is drawn.
 * - 2 points: a straight line segment.
 * - 3+ points: a Catmull-Rom smoothed curve through every point.
 */
export function createSmoothPath(pts: SplinePoint[]): string {
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
