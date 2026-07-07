/**
 * Kalman Expenditure Filter (PROTOTYPE)
 *
 * A 2-state linear Kalman filter that jointly estimates trend weight and TDEE
 * from calorie intake (a control input) and scale weight (a measurement). It is
 * an alternative to the current double-EMA back-solve, motivated by the fact
 * that a single state-space filter with adaptive gain can be simultaneously
 * more responsive and more stable than a fixed-alpha EMA cascade.
 *
 * State:        x = [ trendWeightKg, tdeeKcal ]
 * Dynamics:     W_t = W_{t-1} + (intake_{t-1} - E_{t-1}) / rho   (energy balance)
 *               E_t = E_{t-1}                                     (random walk)
 * Measurement:  z_t = W_t + noise                                (scale weight)
 *
 * A missing weigh-in is handled by running only the predict step (uncertainty
 * grows); a missing intake day is skipped entirely. The covariance term
 * P[1][1] is the variance of the TDEE estimate and yields an uncertainty band
 * for free.
 *
 * This module is intentionally self-contained (no Amplify / network) and is NOT
 * wired into the production estimator. It exists to be A/B-tested by the
 * backtest harness before any integration decision.
 */

/** Filter state: the estimate mean plus its 2x2 error covariance P. */
export interface KalmanState {
  weightKg: number;
  tdee: number;
  covariance: Matrix2; // P
}

export interface KalmanParams {
  /** Energy density rho (kcal/kg). Symmetric, matching the back-solve. */
  energyDensity: number;
  /** Process noise variance on weight (kg^2/day). Small: the balance model is near-exact. */
  processNoiseWeight: number;
  /** Process noise variance on TDEE (kcal^2/day). The responsiveness knob. */
  processNoiseTdee: number;
  /** Measurement noise variance on scale weight (kg^2), i.e. water/glycogen jitter. */
  measurementNoise: number;
  /** Initial covariance for weight (kg^2). */
  initialWeightVariance: number;
  /** Initial covariance for TDEE (kcal^2). Large -> fast early convergence. */
  initialTdeeVariance: number;
}

export const DEFAULT_KALMAN_PARAMS: KalmanParams = {
  energyDensity: 7700,
  processNoiseWeight: 1e-4,
  processNoiseTdee: 25, // ~5 kcal/day drift std; tune for responsiveness
  measurementNoise: 0.16, // sigma ~ 0.4 kg
  initialWeightVariance: 0.25,
  initialTdeeVariance: 250000, // sigma ~ 500 kcal
};

// ============================================
// Minimal 2x2 matrix helpers (no external deps)
// ============================================

type Matrix2 = [[number, number], [number, number]];

function matMul(a: Matrix2, b: Matrix2): Matrix2 {
  return [
    [a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]],
    [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]],
  ];
}

function matT(a: Matrix2): Matrix2 {
  return [
    [a[0][0], a[1][0]],
    [a[0][1], a[1][1]],
  ];
}

function matAdd(a: Matrix2, b: Matrix2): Matrix2 {
  return [
    [a[0][0] + b[0][0], a[0][1] + b[0][1]],
    [a[1][0] + b[1][0], a[1][1] + b[1][1]],
  ];
}

// ============================================
// Filter steps
// ============================================

/**
 * Initialize the filter. TDEE starts uncertain (large initial variance) so the
 * estimate moves quickly toward the truth in the first weeks, then self-stabilizes.
 */
export function initKalmanState(
  initialWeightKg: number,
  initialTdee: number,
  params: KalmanParams = DEFAULT_KALMAN_PARAMS
): KalmanState {
  return {
    weightKg: initialWeightKg,
    tdee: initialTdee,
    covariance: [
      [params.initialWeightVariance, 0],
      [0, params.initialTdeeVariance],
    ],
  };
}

/**
 * Predict step: advance the state one day forward given the day's intake.
 * Weight moves by the energy balance; TDEE is unchanged in mean but its
 * uncertainty grows by the process noise.
 */
export function kalmanPredict(
  state: KalmanState,
  intakeKcal: number,
  params: KalmanParams = DEFAULT_KALMAN_PARAMS
): KalmanState {
  const d = 1 / params.energyDensity;

  // State transition F = [[1, -d], [0, 1]], control B = [d, 0]^T
  const weightKg = state.weightKg + d * (intakeKcal - state.tdee);
  const tdee = state.tdee;

  const F: Matrix2 = [
    [1, -d],
    [0, 1],
  ];
  const Q: Matrix2 = [
    [params.processNoiseWeight, 0],
    [0, params.processNoiseTdee],
  ];
  // P' = F P F^T + Q
  const covariance = matAdd(matMul(matMul(F, state.covariance), matT(F)), Q);

  return { weightKg, tdee, covariance };
}

/**
 * Update step: correct the predicted state with a measured scale weight.
 * H = [1, 0] (we measure weight only).
 */
export function kalmanUpdate(
  state: KalmanState,
  measuredWeightKg: number,
  params: KalmanParams = DEFAULT_KALMAN_PARAMS
): KalmanState {
  const P = state.covariance;

  // Innovation and its covariance S = H P H^T + R = P00 + R
  const innovation = measuredWeightKg - state.weightKg;
  const S = P[0][0] + params.measurementNoise;

  // Kalman gain K = P H^T / S = [P00/S, P10/S]^T
  const k0 = P[0][0] / S;
  const k1 = P[1][0] / S;

  const weightKg = state.weightKg + k0 * innovation;
  const tdee = state.tdee + k1 * innovation;

  // P' = (I - K H) P, with H = [1, 0]
  const covariance: Matrix2 = [
    [(1 - k0) * P[0][0], (1 - k0) * P[0][1]],
    [-k1 * P[0][0] + P[1][0], -k1 * P[0][1] + P[1][1]],
  ];

  return { weightKg, tdee, covariance };
}

/** One day: predict with the day's intake, then update if a weight was measured. */
export function kalmanStep(
  state: KalmanState,
  intakeKcal: number | null,
  measuredWeightKg: number | null,
  params: KalmanParams = DEFAULT_KALMAN_PARAMS
): KalmanState {
  // A missing intake day carries no usable information; hold the state.
  if (intakeKcal === null) return state;

  const predicted = kalmanPredict(state, intakeKcal, params);
  if (measuredWeightKg === null) return predicted; // predict-only; uncertainty grows
  return kalmanUpdate(predicted, measuredWeightKg, params);
}

export interface KalmanDayInput {
  intakeKcal: number | null;
  weightKg: number | null;
}

/**
 * Run the filter over a chronological series of days.
 *
 * Convention: day 0 seeds the state (its weight is the initial estimate); for
 * each subsequent day i, `intakeKcal` is the intake that drove the change from
 * day i-1 to day i, and `weightKg` is that day's measurement. Returns one state
 * per input day (post-update), so `states[i]` is the estimate as of day i.
 */
export function runKalmanFilter(
  days: KalmanDayInput[],
  params: KalmanParams = DEFAULT_KALMAN_PARAMS,
  initialTdee: number = 2000
): KalmanState[] {
  if (days.length === 0) return [];

  const firstWeight = days[0].weightKg ?? 0;
  let state = initKalmanState(firstWeight, initialTdee, params);

  const out: KalmanState[] = [state];
  for (let i = 1; i < days.length; i++) {
    state = kalmanStep(state, days[i].intakeKcal, days[i].weightKg, params);
    out.push(state);
  }
  return out;
}
