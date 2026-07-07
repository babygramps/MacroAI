/**
 * Expenditure Engine
 * 
 * Implements the "back-solving" TDEE algorithm from MacroFactor V3.
 * Instead of estimating TDEE from population formulas, we calculate
 * the actual TDEE required to produce the observed weight change.
 * 
 * Core formula: TDEE = Calories_In - (Weight_Delta * Energy_Density)
 */

import { 
  METABOLIC_CONSTANTS, 
  type ComputedState, 
  type DailyLog,
  type UserGoals,
  type ConfidenceLevel,
} from './types';
import { validateDailyLogForTdee, isTdeeOutlier, calculateTdeeStatistics } from './edgeCaseHandler';

const {
  TDEE_EMA_ALPHA,
  TDEE_EMA_ALPHA_RESPONSIVE,
  ENERGY_DENSITY_ESTIMATION_KCAL_PER_KG,
  STEP_RESPONSIVENESS_THRESHOLD,
  COLD_START_DAYS,
  DEFAULT_ACTIVITY_MULTIPLIER,
} = METABOLIC_CONSTANTS;

const MAX_RAW_TDEE_DELTA = 1200;

// Outlier rejection guardrails. Only reject once there is enough history to
// compute meaningful statistics, use a conservative z-threshold so only extreme
// anomalies (likely mis-logs) are dropped, and never reject a *sustained*
// anomaly — 3+ consecutive breaches are treated as a real trend, not noise.
const OUTLIER_MIN_HISTORY_DAYS = 5;
const OUTLIER_Z_THRESHOLD = 2.5;
const OUTLIER_MAX_CONSECUTIVE = 3;

/**
 * Rolling context the estimation loop supplies so a single day's back-solved
 * TDEE can be tested against recent history for outlier rejection.
 */
export interface OutlierContext {
  /** Recent raw (pre-smoothing) daily TDEE values, e.g. the last 7. */
  recentRawTdees: number[];
  /** How many immediately-preceding days were already excluded as outliers. */
  consecutiveOutlierCount: number;
}

/** ComputedState plus per-day metadata the loop needs but does not persist. */
export type ComputedStateResult = ComputedState & { wasOutlierExcluded: boolean };

/**
 * Decide whether a day's raw back-solved TDEE should be rejected as an outlier.
 * Returns false (accept) unless every guardrail is satisfied and the value is
 * beyond the z-threshold relative to the recent raw-TDEE window.
 */
function shouldExcludeAsOutlier(
  rawTdee: number,
  daysTracked: number,
  outlierContext?: OutlierContext
): boolean {
  if (!outlierContext) return false;
  if (daysTracked < OUTLIER_MIN_HISTORY_DAYS) return false;
  if (outlierContext.recentRawTdees.length < OUTLIER_MIN_HISTORY_DAYS) return false;
  if (outlierContext.consecutiveOutlierCount >= OUTLIER_MAX_CONSECUTIVE) return false;

  const stats = calculateTdeeStatistics(outlierContext.recentRawTdees);
  return isTdeeOutlier(rawTdee, stats.average, stats.stdDev, OUTLIER_Z_THRESHOLD).isOutlier;
}

/**
 * Energy density used to back-solve TDEE from a trend-weight change.
 *
 * This is intentionally symmetric (direction-independent). An asymmetric
 * density (e.g. 7700 losing / 5500 gaining) means a down-day adds more implied
 * expenditure than an equal up-day subtracts, so normal weight oscillation
 * ratchets estimated TDEE upward over time. MacroFactor removed exactly this
 * bias in V3; we keep a single symmetric density here.
 *
 * The parameter is retained so callers can still record `energyDensityUsed`
 * per day, but the returned value no longer depends on the sign.
 *
 * @param weightDeltaKg - Weight change (retained for call-site symmetry; the
 *   returned density no longer depends on its sign)
 * @returns Energy density in kcal/kg
 */
export function selectEnergyDensity(weightDeltaKg: number): number {
  void weightDeltaKg; // intentionally unused: density is direction-independent
  return ENERGY_DENSITY_ESTIMATION_KCAL_PER_KG;
}

/**
 * Calculate raw (unsmoothed) TDEE from daily data
 * 
 * Formula: Raw_TDEE = Calories_In - (Weight_Delta_kg * Energy_Density)
 * 
 * @param caloriesIn - Total calories consumed that day
 * @param weightDeltaKg - Change in trend weight (today - yesterday)
 * @returns Raw TDEE estimate for that day
 */
export function calculateRawTdee(
  caloriesIn: number,
  weightDeltaKg: number
): { rawTdee: number; energyDensity: number } {
  const energyDensity = selectEnergyDensity(weightDeltaKg);
  
  // Back-solve: if user ate 2000 kcal and lost 0.1kg:
  // TDEE = 2000 - (-0.1 * 7700) = 2000 + 770 = 2770 kcal
  const rawTdee = caloriesIn - (weightDeltaKg * energyDensity);
  
  return {
    rawTdee: Math.round(rawTdee),
    energyDensity,
  };
}

/**
 * Apply EMA smoothing to TDEE
 * 
 * Raw TDEE can jump wildly (1500 one day, 4000 the next).
 * We smooth with a low alpha (0.05) because TDEE changes slowly.
 * 
 * @param rawTdee - Today's calculated raw TDEE
 * @param prevSmoothedTdee - Yesterday's smoothed TDEE
 * @param stepCountDelta - Optional: relative change in step count
 * @returns Smoothed TDEE
 */
export function smoothTdee(
  rawTdee: number,
  prevSmoothedTdee: number,
  stepCountDelta?: number
): number {
  // Determine alpha based on activity changes
  let alpha: number = TDEE_EMA_ALPHA;
  
  if (stepCountDelta !== undefined && stepCountDelta > STEP_RESPONSIVENESS_THRESHOLD) {
    // Activity increased significantly, use more responsive alpha
    alpha = TDEE_EMA_ALPHA_RESPONSIVE;
    console.log(`[ExpenditureEngine] Step increase detected (${(stepCountDelta * 100).toFixed(0)}%), using responsive alpha ${alpha}`);
  }
  
  // Standard EMA formula
  const smoothed = (rawTdee * alpha) + (prevSmoothedTdee * (1 - alpha));
  
  return Math.round(smoothed);
}

/**
 * Calculate daily expenditure with full smoothing
 * 
 * This is the main entry point combining raw calculation + smoothing
 * 
 * @param intakeKcal - Calories consumed
 * @param weightDeltaKg - Change in trend weight
 * @param prevTdee - Previous day's smoothed TDEE
 * @param stepCountDelta - Optional relative change in steps
 * @returns Object with smoothed TDEE and metadata
 */
export function calculateDailyExpenditure(
  intakeKcal: number,
  weightDeltaKg: number,
  prevTdee: number,
  stepCountDelta?: number
): { estimatedTdee: number; rawTdee: number; energyDensity: number } {
  const { rawTdee, energyDensity } = calculateRawTdee(intakeKcal, weightDeltaKg);
  const boundedRawTdee = boundRawTdeeDelta(rawTdee, prevTdee);
  const estimatedTdee = smoothTdee(boundedRawTdee, prevTdee, stepCountDelta);
  
  return {
    estimatedTdee,
    rawTdee: boundedRawTdee,
    energyDensity,
  };
}

function boundRawTdeeDelta(rawTdee: number, prevTdee: number): number {
  const lowerBound = prevTdee - MAX_RAW_TDEE_DELTA;
  const upperBound = prevTdee + MAX_RAW_TDEE_DELTA;
  const boundedRawTdee = Math.min(upperBound, Math.max(lowerBound, rawTdee));

  if (boundedRawTdee !== rawTdee) {
    console.log(
      `[ExpenditureEngine] Raw TDEE bounded from ${rawTdee} to ${boundedRawTdee} (prev=${prevTdee}, maxDelta=${MAX_RAW_TDEE_DELTA})`
    );
  }

  return boundedRawTdee;
}

// ============================================
// Cold Start / Mifflin-St Jeor Estimation
// ============================================

/**
 * Calculate BMR using Mifflin-St Jeor equation
 * 
 * This is used during the cold start period (first 7 days)
 * before we have enough data for back-solving.
 * 
 * Formula:
 * Males: BMR = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5
 * Females: BMR = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161
 * 
 * @param weightKg - Current weight in kg
 * @param heightCm - Height in cm
 * @param ageYears - Age in years
 * @param sex - 'male' or 'female'
 * @returns Estimated BMR in kcal
 */
export function calculateMifflinStJeorBmr(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  sex: 'male' | 'female'
): number {
  const base = (10 * weightKg) + (6.25 * heightCm) - (5 * ageYears);
  const sexFactor = sex === 'male' ? 5 : -161;
  
  return Math.round(base + sexFactor);
}

/**
 * Calculate age from birth date
 */
export function calculateAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Calculate cold start TDEE estimate
 * 
 * Uses Mifflin-St Jeor BMR * activity multiplier
 * 
 * @param profile - User profile with height, birth date, sex
 * @param currentWeightKg - Current weight
 * @param athleteStatus - Whether user is an athlete (adds 10-12% for organ hypertrophy)
 * @returns Estimated TDEE during cold start
 */
export function calculateColdStartTdee(
  profile: UserGoals,
  currentWeightKg: number
): number | null {
  const { heightCm, birthDate, sex, athleteStatus } = profile;
  
  if (!heightCm || !birthDate || !sex) {
    console.log('[ExpenditureEngine] Missing profile data for cold start TDEE');
    return null;
  }
  
  const age = calculateAge(birthDate);
  const bmr = calculateMifflinStJeorBmr(currentWeightKg, heightCm, age, sex);
  
  // Apply activity multiplier
  let tdee = bmr * DEFAULT_ACTIVITY_MULTIPLIER;
  
  // Apply athlete correction (10-12% higher due to organ hypertrophy)
  if (athleteStatus) {
    tdee *= 1.1;
    console.log('[ExpenditureEngine] Applied athlete correction (+10%)');
  }
  
  return Math.round(tdee);
}

// ============================================
// Confidence Level Calculation
// ============================================

/**
 * Determine confidence level based on data availability
 * 
 * @param daysTracked - Number of days with complete data
 * @param recentMissingDays - Days missing in last 7
 * @returns Confidence level
 */
export function determineConfidenceLevel(
  daysTracked: number,
  recentMissingDays: number
): ConfidenceLevel {
  if (daysTracked < COLD_START_DAYS) {
    return 'learning';
  }
  
  if (recentMissingDays > 3) {
    return 'low';
  }
  
  if (recentMissingDays > 1) {
    return 'medium';
  }
  
  return 'high';
}

/**
 * Calculate flux confidence range (uncertainty band)
 * 
 * The flux range represents how much uncertainty we have in the TDEE.
 * Wider when data is sparse or inconsistent.
 * 
 * @param daysTracked - Days of tracking data
 * @param recentVariance - Variance in recent TDEE estimates
 * @returns Confidence range in +/- kcal
 */
export function calculateFluxRange(
  daysTracked: number,
  recentVariance: number = 0
): number {
  // Base uncertainty starts high and decreases with more data
  const baseUncertainty = Math.max(100, 500 - (daysTracked * 20));
  
  // Add variance component
  const varianceComponent = Math.sqrt(recentVariance) * 0.5;
  
  return Math.round(baseUncertainty + varianceComponent);
}

// ============================================
// Computed State Builder
// ============================================

/**
 * Build a ComputedState entry from daily data
 * 
 * @param date - Date string (YYYY-MM-DD)
 * @param trendWeightKg - Trend weight for this day
 * @param prevTrendWeightKg - Previous day's trend weight
 * @param dailyLog - Daily log entry
 * @param prevTdee - Previous day's smoothed TDEE
 * @param stepCountDelta - Optional step count change
 * @param daysTracked - Number of days with valid data so far (for dynamic flux range)
 * @param recentTdeeVariance - Variance in recent raw TDEE values (for dynamic flux range)
 * @param weightDeltaOverrideKg - Optional weight delta to use instead of the trend delta
 * @param outlierContext - Optional recent-history context enabling outlier rejection
 * @returns ComputedState plus a wasOutlierExcluded flag for the caller's loop
 */
export function buildComputedState(
  date: string,
  trendWeightKg: number,
  prevTrendWeightKg: number,
  dailyLog: DailyLog | null,
  prevTdee: number,
  stepCountDelta?: number,
  daysTracked: number = 0,
  recentTdeeVariance: number = 0,
  weightDeltaOverrideKg?: number,
  outlierContext?: OutlierContext
): ComputedStateResult {
  const trendWeightDeltaKg = trendWeightKg - prevTrendWeightKg;
  const weightDeltaKg = weightDeltaOverrideKg ?? trendWeightDeltaKg;

  // Shared "hold previous TDEE + widen uncertainty" result, used whenever a day
  // cannot (or should not) update the estimate.
  const holdResult = (): ComputedStateResult => ({
    date,
    trendWeightKg,
    estimatedTdeeKcal: prevTdee,
    rawTdeeKcal: prevTdee,
    fluxConfidenceRange: Math.max(400, calculateFluxRange(daysTracked, recentTdeeVariance)),
    energyDensityUsed: selectEnergyDensity(weightDeltaKg),
    weightDeltaKg,
    wasOutlierExcluded: false,
  });

  // If no calorie data or day quality is invalid, hold previous TDEE and widen uncertainty.
  if (!dailyLog) {
    console.log(`[ExpenditureEngine] Day ${date} has no DailyLog - holding previous TDEE`);
    return holdResult();
  }

  const validation = validateDailyLogForTdee(dailyLog, prevTdee);
  if (!validation.isValid) {
    console.log(
      `[ExpenditureEngine] Day ${date} excluded from TDEE update: ${validation.reason ?? 'invalid daily log'}`
    );
    return holdResult();
  }

  const nutritionCalories = dailyLog.nutritionCalories;
  if (nutritionCalories === null) {
    // Defensive guard for type narrowing; validation above should catch this.
    console.log(`[ExpenditureEngine] Day ${date} has null calories post-validation - holding previous TDEE`);
    return holdResult();
  }

  // Reject days whose back-solved TDEE is an extreme outlier relative to recent
  // history (likely a mis-log). Guardrails in shouldExcludeAsOutlier prevent
  // this from suppressing genuine, sustained metabolic changes.
  const { rawTdee: unsmoothedRawTdee } = calculateRawTdee(nutritionCalories, weightDeltaKg);
  if (shouldExcludeAsOutlier(unsmoothedRawTdee, daysTracked, outlierContext)) {
    console.log(
      `[ExpenditureEngine] Day ${date} excluded as TDEE outlier (raw=${unsmoothedRawTdee}) - holding previous TDEE`
    );
    return { ...holdResult(), wasOutlierExcluded: true };
  }

  const { estimatedTdee, rawTdee, energyDensity } = calculateDailyExpenditure(
    nutritionCalories,
    weightDeltaKg,
    prevTdee,
    stepCountDelta
  );

  return {
    date,
    trendWeightKg,
    estimatedTdeeKcal: estimatedTdee,
    rawTdeeKcal: rawTdee,
    fluxConfidenceRange: calculateFluxRange(daysTracked, recentTdeeVariance),
    energyDensityUsed: energyDensity,
    weightDeltaKg,
    wasOutlierExcluded: false,
  };
}

// ============================================
// Goal Transition Handling
// ============================================

/**
 * Predict TDEE change when switching goals
 * 
 * When switching from cut to bulk (or vice versa), TDEE changes
 * immediately due to TEF and NEAT adjustments.
 * 
 * @param currentTdee - Current calculated TDEE
 * @param oldGoalType - Previous goal type
 * @param newGoalType - New goal type
 * @param rateChange - Change in target rate (kg/week)
 * @returns Predicted new TDEE
 */
export function predictGoalTransitionTdee(
  currentTdee: number,
  oldGoalType: 'lose' | 'gain' | 'maintain',
  newGoalType: 'lose' | 'gain' | 'maintain',
  rateChange: number = 0
): number {
  // If goal direction changes significantly, apply predictive adjustment
  // This helps "jump start" the algorithm without waiting for lag
  
  if (oldGoalType === 'lose' && newGoalType === 'gain') {
    // Switching from cut to bulk - TDEE will increase
    // TEF from higher protein, NEAT upregulation
    const adjustment = 1 + (Math.abs(rateChange) * 4 * 0.01); // ~4% per 0.25kg/week
    return Math.round(currentTdee * adjustment);
  }
  
  if (oldGoalType === 'gain' && newGoalType === 'lose') {
    // Switching from bulk to cut - TDEE will decrease
    // Metabolic adaptation kicks in
    const adjustment = 1 - (Math.abs(rateChange) * 4 * 0.01);
    return Math.round(currentTdee * adjustment);
  }
  
  return currentTdee;
}

// ============================================
// Debug Logging
// ============================================

/**
 * Debug logging for TDEE calculations
 */
export function logTdeeCalculation(
  date: string,
  caloriesIn: number,
  weightDelta: number,
  rawTdee: number,
  smoothedTdee: number,
  energyDensity: number
): void {
  console.log(
    `[ExpenditureEngine] ${date}: ` +
    `intake=${caloriesIn}, delta=${weightDelta.toFixed(3)}kg, ` +
    `raw=${rawTdee}, smoothed=${smoothedTdee}, density=${energyDensity}`
  );
}
