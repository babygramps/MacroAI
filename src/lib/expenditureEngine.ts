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

const {
  TDEE_EMA_ALPHA,
  TDEE_EMA_ALPHA_RESPONSIVE,
  ENERGY_DENSITY_DEFICIT,
  ENERGY_DENSITY_SURPLUS,
  STEP_RESPONSIVENESS_THRESHOLD,
  COLD_START_DAYS,
  DEFAULT_ACTIVITY_MULTIPLIER,
} = METABOLIC_CONSTANTS;

/**
 * Select the appropriate energy density factor based on weight change direction
 * 
 * V3 "Modular" approach:
 * - Deficit (losing): 7700 kcal/kg (high energy density, fat loss dominant)
 * - Surplus (gaining): 5500 kcal/kg (accounts for anabolic inefficiency)
 * 
 * @param weightDeltaKg - Weight change (negative = losing, positive = gaining)
 * @returns Energy density in kcal/kg
 */
export function selectEnergyDensity(weightDeltaKg: number): number {
  if (weightDeltaKg < 0) {
    // Losing weight - fat loss releases ~7700 kcal/kg
    return ENERGY_DENSITY_DEFICIT;
  } else {
    // Gaining weight - muscle gain is energetically expensive
    // Stores ~600 kcal but costs ~2000+ to synthesize
    // We use a lower effective density to account for this
    return ENERGY_DENSITY_SURPLUS;
  }
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
  const estimatedTdee = smoothTdee(rawTdee, prevTdee, stepCountDelta);
  
  return {
    estimatedTdee,
    rawTdee,
    energyDensity,
  };
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
 * @returns ComputedState object
 */
export function buildComputedState(
  date: string,
  trendWeightKg: number,
  prevTrendWeightKg: number,
  dailyLog: DailyLog | null,
  prevTdee: number,
  stepCountDelta?: number,
  daysTracked: number = 0,
  recentTdeeVariance: number = 0
): ComputedState {
  const weightDeltaKg = trendWeightKg - prevTrendWeightKg;

  // If no calorie data OR day is marked as skipped, we can't calculate TDEE - hold previous
  // This ensures user-marked incomplete days are excluded from TDEE calculations
  const isSkipped = dailyLog?.logStatus === 'skipped';
  if (!dailyLog || dailyLog.nutritionCalories === null || isSkipped) {
    if (isSkipped) {
      console.log(`[ExpenditureEngine] Day ${date} marked as skipped - holding previous TDEE`);
    }
    // Missing data = high uncertainty; use dynamic range but with a floor of 400
    const missingFlux = Math.max(400, calculateFluxRange(daysTracked, recentTdeeVariance));
    return {
      date,
      trendWeightKg,
      estimatedTdeeKcal: prevTdee,
      rawTdeeKcal: prevTdee,
      fluxConfidenceRange: missingFlux,
      energyDensityUsed: selectEnergyDensity(weightDeltaKg),
      weightDeltaKg,
    };
  }
  
  const { estimatedTdee, rawTdee, energyDensity } = calculateDailyExpenditure(
    dailyLog.nutritionCalories,
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
