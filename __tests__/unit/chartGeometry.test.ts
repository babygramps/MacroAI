import { createSmoothPath } from '@/components/ui/charts/geometry';

describe('createSmoothPath', () => {
  it('returns an empty string for 0 or 1 points', () => {
    expect(createSmoothPath([])).toBe('');
    expect(createSmoothPath([{ x: 1, y: 2 }])).toBe('');
  });

  it('draws a straight line for exactly 2 points', () => {
    expect(createSmoothPath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe(
      'M 0 0 L 10 5'
    );
  });

  it('pins the Catmull-Rom output for a fixed point set (protects the WeightChart/TdeeChart dedup)', () => {
    const points = [
      { x: 0, y: 10 },
      { x: 20, y: 0 },
      { x: 40, y: 15 },
      { x: 60, y: 5 },
    ];

    expect(createSmoothPath(points)).toBe(
      'M 0 10 C 3.3333333333333335 8.333333333333334, 13.333333333333332 -0.8333333333333334, 20 0 C 26.666666666666668 0.8333333333333334, 33.333333333333336 14.166666666666666, 40 15 C 46.666666666666664 15.833333333333334, 56.666666666666664 6.666666666666667, 60 5'
    );
  });
});
