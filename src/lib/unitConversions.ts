/**
 * Unit Conversion Utilities
 * 
 * Handles metric <-> imperial conversions for weight and height.
 * All data is stored in metric (kg, cm) internally.
 */

// ============================================
// Unit System Types
// ============================================

export type UnitSystem = 'metric' | 'imperial';

export interface UnitPreferences {
  unitSystem: UnitSystem;
  // Individual overrides (optional)
  weightUnit?: 'kg' | 'lbs';
  heightUnit?: 'cm' | 'ft';
}

// ============================================
// Weight Conversions
// ============================================

const LBS_PER_KG = 2.20462;

/**
 * Convert kg to lbs
 */
export function kgToLbs(kg: number): number {
  return Math.round(kg * LBS_PER_KG * 10) / 10;
}

/**
 * Convert lbs to kg
 */
export function lbsToKg(lbs: number): number {
  return Math.round((lbs / LBS_PER_KG) * 10) / 10;
}

/**
 * Format weight with appropriate unit
 */
export function formatWeight(weightKg: number, unit: 'kg' | 'lbs'): string {
  if (unit === 'lbs') {
    return `${kgToLbs(weightKg)} lbs`;
  }
  return `${Math.round(weightKg * 10) / 10} kg`;
}

/**
 * Format weight value only (no unit suffix)
 */
export function formatWeightValue(weightKg: number, unit: 'kg' | 'lbs'): number {
  if (unit === 'lbs') {
    return kgToLbs(weightKg);
  }
  return Math.round(weightKg * 10) / 10;
}

/**
 * Convert weight to kg for storage
 */
export function toKg(weight: number, unit: 'kg' | 'lbs'): number {
  if (unit === 'lbs') {
    return lbsToKg(weight);
  }
  return weight;
}

/**
 * Get weight step value for the unit
 */
export function getWeightStep(unit: 'kg' | 'lbs'): number {
  return unit === 'lbs' ? 1 : 0.5;
}

/**
 * Get weight rate step (for goal rate per week)
 */
export function getWeightRateStep(unit: 'kg' | 'lbs'): number {
  return unit === 'lbs' ? 0.5 : 0.25;
}

// ============================================
// Height Conversions
// ============================================

const CM_PER_INCH = 2.54;
const INCHES_PER_FOOT = 12;

/**
 * Convert cm to feet and inches
 */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cm / CM_PER_INCH;
  const feet = Math.floor(totalInches / INCHES_PER_FOOT);
  const inches = Math.round(totalInches % INCHES_PER_FOOT);
  return { feet, inches };
}

/**
 * Convert feet and inches to cm
 */
export function feetInchesToCm(feet: number, inches: number): number {
  const totalInches = feet * INCHES_PER_FOOT + inches;
  return Math.round(totalInches * CM_PER_INCH);
}

/**
 * Format height with appropriate unit
 */
export function formatHeight(heightCm: number, unit: 'cm' | 'ft'): string {
  if (unit === 'ft') {
    const { feet, inches } = cmToFeetInches(heightCm);
    return `${feet}'${inches}"`;
  }
  return `${Math.round(heightCm)} cm`;
}

/**
 * Convert height to cm for storage
 */
export function toCm(height: number | { feet: number; inches: number }, unit: 'cm' | 'ft'): number {
  if (unit === 'ft' && typeof height === 'object') {
    return feetInchesToCm(height.feet, height.inches);
  }
  return typeof height === 'number' ? height : 0;
}

// ============================================
// Unit System Helpers
// ============================================

/**
 * Get the weight unit based on unit system
 */
export function getWeightUnit(unitSystem: UnitSystem): 'kg' | 'lbs' {
  return unitSystem === 'imperial' ? 'lbs' : 'kg';
}

/**
 * Get the height unit based on unit system
 */
export function getHeightUnit(unitSystem: UnitSystem): 'cm' | 'ft' {
  return unitSystem === 'imperial' ? 'ft' : 'cm';
}

/**
 * Get default presets for weight based on unit system
 */
export function getWeightPresets(unitSystem: UnitSystem): number[] {
  if (unitSystem === 'imperial') {
    return [150, 175, 200]; // lbs
  }
  return [60, 75, 90]; // kg
}

/**
 * Get default presets for height based on unit system
 */
export function getHeightPresets(unitSystem: UnitSystem): number[] {
  if (unitSystem === 'imperial') {
    // Heights in total inches (5'4" = 64", 5'8" = 68", 6'0" = 72")
    return [64, 68, 72];
  }
  return [160, 170, 180]; // cm
}

/**
 * Get default presets for goal rate based on unit system
 */
export function getGoalRatePresets(unitSystem: UnitSystem): number[] {
  if (unitSystem === 'imperial') {
    return [0.5, 1.0, 1.5]; // lbs/week
  }
  return [0.25, 0.5, 0.75]; // kg/week
}

/**
 * Format goal rate with unit
 */
export function formatGoalRate(rateKgPerWeek: number, unit: 'kg' | 'lbs'): string {
  if (unit === 'lbs') {
    return `${kgToLbs(rateKgPerWeek)} lbs/week`;
  }
  return `${rateKgPerWeek} kg/week`;
}

/**
 * Convert goal rate to kg/week for storage
 */
export function toKgPerWeek(rate: number, unit: 'kg' | 'lbs'): number {
  if (unit === 'lbs') {
    return lbsToKg(rate);
  }
  return rate;
}
