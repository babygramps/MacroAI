/**
 * Unit tests for the recent foods scoring algorithm.
 * Tests the recency + frequency scoring logic used in getRecentFoods.
 */

// Constants matching the server action
const RECENCY_WEIGHT = 0.4;
const FREQUENCY_WEIGHT = 0.6;
const MAX_DAYS_LOOKBACK = 30;

/**
 * Calculate a combined score based on recency and frequency.
 * This is a copy of the scoring logic from getRecentFoods.ts for testing.
 */
function calculateScore(
  lastLoggedAt: Date,
  logCount: number,
  maxLogCount: number,
  now: Date
): number {
  const daysSinceLogged = (now.getTime() - lastLoggedAt.getTime()) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 1 - daysSinceLogged / MAX_DAYS_LOOKBACK);
  const frequencyScore = maxLogCount > 0 ? logCount / maxLogCount : 0;
  return RECENCY_WEIGHT * recencyScore + FREQUENCY_WEIGHT * frequencyScore;
}

describe('Recent Foods Scoring Algorithm', () => {
  const now = new Date('2026-01-16T12:00:00Z');

  describe('recency scoring', () => {
    it('gives maximum recency score for items logged today', () => {
      const score = calculateScore(now, 1, 1, now);
      // With 0 days since logged: recencyScore = 1, frequencyScore = 1
      // Combined = 0.4 * 1 + 0.6 * 1 = 1.0
      expect(score).toBe(1.0);
    });

    it('gives lower recency score for older items', () => {
      const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
      const score = calculateScore(fifteenDaysAgo, 1, 1, now);
      // recencyScore = 1 - (15/30) = 0.5
      // Combined = 0.4 * 0.5 + 0.6 * 1 = 0.2 + 0.6 = 0.8
      expect(score).toBeCloseTo(0.8);
    });

    it('gives zero recency score for items 30+ days old', () => {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const score = calculateScore(thirtyDaysAgo, 1, 1, now);
      // recencyScore = max(0, 1 - 30/30) = 0
      // Combined = 0.4 * 0 + 0.6 * 1 = 0.6
      expect(score).toBeCloseTo(0.6);
    });

    it('clamps recency score to 0 for items older than 30 days', () => {
      const fortyFiveDaysAgo = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
      const score = calculateScore(fortyFiveDaysAgo, 1, 1, now);
      // recencyScore = max(0, 1 - 45/30) = max(0, -0.5) = 0
      // Combined = 0.4 * 0 + 0.6 * 1 = 0.6
      expect(score).toBeCloseTo(0.6);
    });
  });

  describe('frequency scoring', () => {
    it('gives maximum frequency score to most logged item', () => {
      const score = calculateScore(now, 10, 10, now);
      // frequencyScore = 10/10 = 1
      expect(score).toBe(1.0);
    });

    it('gives proportional frequency score based on log count', () => {
      const score = calculateScore(now, 5, 10, now);
      // frequencyScore = 5/10 = 0.5
      // Combined = 0.4 * 1 + 0.6 * 0.5 = 0.4 + 0.3 = 0.7
      expect(score).toBeCloseTo(0.7);
    });

    it('gives zero frequency score when maxLogCount is 0', () => {
      const score = calculateScore(now, 0, 0, now);
      // frequencyScore = 0 (division by zero protection)
      // Combined = 0.4 * 1 + 0.6 * 0 = 0.4
      expect(score).toBeCloseTo(0.4);
    });
  });

  describe('combined scoring', () => {
    it('ranks frequently logged recent items highest', () => {
      // Item A: logged today, logged 10 times (max)
      const scoreA = calculateScore(now, 10, 10, now);
      
      // Item B: logged today, logged 5 times
      const scoreB = calculateScore(now, 5, 10, now);
      
      // Item C: logged 10 days ago, logged 10 times
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const scoreC = calculateScore(tenDaysAgo, 10, 10, now);
      
      expect(scoreA).toBeGreaterThan(scoreB);
      expect(scoreA).toBeGreaterThan(scoreC);
    });

    it('weights frequency higher than recency (60% vs 40%)', () => {
      // Item A: logged today, logged 1 time
      const scoreA = calculateScore(now, 1, 10, now);
      
      // Item B: logged 20 days ago, logged 10 times
      const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
      const scoreB = calculateScore(twentyDaysAgo, 10, 10, now);
      
      // scoreA = 0.4 * 1 + 0.6 * 0.1 = 0.46
      // scoreB = 0.4 * (1 - 20/30) + 0.6 * 1 = 0.4 * 0.333 + 0.6 = 0.733
      expect(scoreB).toBeGreaterThan(scoreA);
    });
  });

  describe('edge cases', () => {
    it('handles single item in collection', () => {
      const score = calculateScore(now, 1, 1, now);
      expect(score).toBe(1.0);
    });

    it('produces valid score range (0 to 1)', () => {
      // Best case: logged today, max frequency
      const bestScore = calculateScore(now, 10, 10, now);
      expect(bestScore).toBeLessThanOrEqual(1.0);
      expect(bestScore).toBeGreaterThanOrEqual(0);

      // Worst case: logged 30+ days ago, min frequency
      const oldDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const worstScore = calculateScore(oldDate, 1, 100, now);
      expect(worstScore).toBeLessThanOrEqual(1.0);
      expect(worstScore).toBeGreaterThanOrEqual(0);
    });
  });
});
