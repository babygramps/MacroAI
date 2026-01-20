#!/usr/bin/env npx ts-node
/**
 * TDEE Validation Script
 * 
 * CLI tool that validates TDEE calculations against stored computed states.
 * Outputs structured JSON for LLM agents and human-readable summary.
 * 
 * Usage: npm run validate:tdee
 */

import {
  loadFixture,
  fixtureExists,
  getFixtureSummary,
  buildDateMaps,
  calculateAge,
  type TestFixture,
  type ComputedState,
  type DailyLog,
} from './lib/loadFixture';

// Import engine functions
import { updateTrendWeight, calculateWeightDelta } from '../src/lib/trendEngine';
import {
  calculateRawTdee,
  smoothTdee,
  calculateMifflinStJeorBmr,
  selectEnergyDensity,
} from '../src/lib/expenditureEngine';
import { isWhooshEffect, isPartialLogging } from '../src/lib/edgeCaseHandler';
import { METABOLIC_CONSTANTS } from '../src/lib/types';

// ============================================
// Types for Validation Output
// ============================================

interface ValidationIssue {
  id: string;
  type: string;
  severity: 'error' | 'warning' | 'info';
  date: string;
  message: string;
  expected?: number;
  actual?: number;
  diff?: number;
  context?: Record<string, unknown>;
  possibleCause?: string;
  relevantCode: {
    file: string;
    function: string;
    lines?: string;
  };
  suggestedFix?: string;
}

interface ValidationCategory {
  status: 'PASS' | 'FAIL' | 'WARNING' | 'SKIP';
  message: string;
  details?: Record<string, unknown>;
}

interface ValidationResult {
  timestamp: string;
  status: 'PASS' | 'NEEDS_ATTENTION' | 'FAIL' | 'NO_DATA';
  summary: {
    totalDataPoints: number;
    passed: number;
    failed: number;
    warnings: number;
    passRate: string;
  };
  userProfile: {
    heightCm: number | null;
    sex: string | null;
    age: number | null;
    goalType: string | null;
    goalRate: number | null;
    athleteStatus: boolean;
  } | null;
  dataRange: {
    start: string;
    end: string;
    totalDays: number;
  } | null;
  issues: ValidationIssue[];
  validations: {
    trendWeight: ValidationCategory;
    energyDensity: ValidationCategory;
    coldStart: ValidationCategory;
    whooshHandling: ValidationCategory;
    tdeeSmoothing: ValidationCategory;
    partialLogging: ValidationCategory;
  };
  recommendations: Array<{
    priority: number;
    action: string;
    reason: string;
  }>;
}

// ============================================
// Validation Logic
// ============================================

function validateTdeeCalculations(fixture: TestFixture): ValidationResult {
  const timestamp = new Date().toISOString();
  const issues: ValidationIssue[] = [];
  let issueCounter = 0;
  
  const generateIssueId = (prefix: string): string => {
    issueCounter++;
    return `${prefix}_${String(issueCounter).padStart(3, '0')}`;
  };
  
  // Check if we have data
  if (!fixture.userProfile || fixture.computedStates.length === 0) {
    return {
      timestamp,
      status: 'NO_DATA',
      summary: { totalDataPoints: 0, passed: 0, failed: 0, warnings: 0, passRate: '0%' },
      userProfile: null,
      dataRange: null,
      issues: [{
        id: 'NO_DATA_001',
        type: 'MISSING_DATA',
        severity: 'error',
        date: timestamp.split('T')[0],
        message: 'No computed states found in fixture',
        relevantCode: { file: '__tests__/fixtures/userData.json', function: 'N/A' },
        suggestedFix: 'Export your data via the app (Settings -> Export -> All data)',
      }],
      validations: {
        trendWeight: { status: 'SKIP', message: 'No data to validate' },
        energyDensity: { status: 'SKIP', message: 'No data to validate' },
        coldStart: { status: 'SKIP', message: 'No data to validate' },
        whooshHandling: { status: 'SKIP', message: 'No data to validate' },
        tdeeSmoothing: { status: 'SKIP', message: 'No data to validate' },
        partialLogging: { status: 'SKIP', message: 'No data to validate' },
      },
      recommendations: [{ priority: 1, action: 'Export user data', reason: 'No data available for validation' }],
    };
  }
  
  // Build lookup maps for O(1) access
  const { weightByDate, dailyLogByDate, computedStateByDate } = buildDateMaps(fixture);
  
  // Get date range
  const summary = getFixtureSummary(fixture);
  const profile = fixture.userProfile;
  const age = profile.birthDate ? calculateAge(profile.birthDate) : null;
  
  // Sorted dates for iteration
  const dates = fixture.computedStates.map(s => s.date).toSorted();
  
  // Tracking variables
  let passed = 0;
  let failed = 0;
  let warnings = 0;
  
  // Validation trackers
  let trendWeightMaxDev = 0;
  let energyDensityCorrect = true;
  let coldStartViolations = 0;
  let whooshIssues = 0;
  let smoothingIssues = 0;
  let partialLoggingDetected = 0;
  
  // Calculate cold start threshold
  const coldStartDays = METABOLIC_CONSTANTS.COLD_START_DAYS;
  const startDate = dates[0];
  
  // Iterate through each date
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const storedState = computedStateByDate.get(date);
    const dailyLog = dailyLogByDate.get(date);
    const dayNumber = i + 1;
    
    if (!storedState) continue;
    
    // Get previous state for delta calculation
    const prevDate = i > 0 ? dates[i - 1] : null;
    const prevState = prevDate ? computedStateByDate.get(prevDate) : null;
    
    // 1. Validate trend weight EMA
    if (prevState) {
      const rawWeight = weightByDate.get(date) ?? null;
      const expectedTrend = updateTrendWeight(prevState.trendWeightKg, rawWeight);
      const trendDev = Math.abs(storedState.trendWeightKg - expectedTrend);
      
      if (trendDev > trendWeightMaxDev) {
        trendWeightMaxDev = trendDev;
      }
      
      if (trendDev > 0.5) {
        issues.push({
          id: generateIssueId('TREND'),
          type: 'TREND_WEIGHT_DEVIATION',
          severity: 'warning',
          date,
          message: `Trend weight deviation of ${trendDev.toFixed(2)}kg from expected`,
          expected: expectedTrend,
          actual: storedState.trendWeightKg,
          diff: trendDev,
          context: { rawWeight, prevTrend: prevState.trendWeightKg },
          relevantCode: { file: 'src/lib/trendEngine.ts', function: 'updateTrendWeight', lines: '23-35' },
          suggestedFix: 'Check EMA alpha value and weight interpolation logic',
        });
        warnings++;
      } else {
        passed++;
      }
    }
    
    // 2. Validate energy density selection
    if (storedState.weightDeltaKg !== undefined) {
      const expectedDensity = selectEnergyDensity(storedState.weightDeltaKg);
      if (storedState.energyDensityUsed !== expectedDensity) {
        energyDensityCorrect = false;
        issues.push({
          id: generateIssueId('DENSITY'),
          type: 'ENERGY_DENSITY_MISMATCH',
          severity: 'error',
          date,
          message: `Energy density mismatch: used ${storedState.energyDensityUsed}, expected ${expectedDensity}`,
          expected: expectedDensity,
          actual: storedState.energyDensityUsed,
          context: { weightDelta: storedState.weightDeltaKg },
          relevantCode: { file: 'src/lib/expenditureEngine.ts', function: 'selectEnergyDensity', lines: '39-49' },
          suggestedFix: 'Verify energy density selection based on weight delta sign',
        });
        failed++;
      } else {
        passed++;
      }
    }
    
    // 3. Validate cold start period
    if (dayNumber <= coldStartDays) {
      // During cold start, TDEE should be based on Mifflin-St Jeor, not back-solved
      if (profile.heightCm && profile.birthDate && profile.sex && age) {
        const expectedBmr = calculateMifflinStJeorBmr(
          storedState.trendWeightKg,
          profile.heightCm,
          age,
          profile.sex
        );
        const expectedColdStartTdee = Math.round(expectedBmr * METABOLIC_CONSTANTS.DEFAULT_ACTIVITY_MULTIPLIER);
        
        // Allow 15% tolerance for cold start TDEE
        const tolerance = expectedColdStartTdee * 0.15;
        const tdeeDeviation = Math.abs(storedState.estimatedTdeeKcal - expectedColdStartTdee);
        
        if (tdeeDeviation > tolerance && dailyLog?.nutritionCalories) {
          // Check if it looks like back-solved TDEE was used instead
          const backSolvedTdee = calculateRawTdee(
            dailyLog.nutritionCalories,
            storedState.weightDeltaKg
          ).rawTdee;
          
          if (Math.abs(storedState.estimatedTdeeKcal - backSolvedTdee) < 200) {
            coldStartViolations++;
            issues.push({
              id: generateIssueId('COLD'),
              type: 'COLD_START_VIOLATION',
              severity: 'error',
              date,
              message: `Day ${dayNumber} appears to use back-solved TDEE instead of Mifflin-St Jeor`,
              expected: expectedColdStartTdee,
              actual: storedState.estimatedTdeeKcal,
              diff: tdeeDeviation,
              context: { dayNumber, backSolvedTdee, coldStartDays },
              relevantCode: { file: 'src/lib/expenditureEngine.ts', function: 'calculateColdStartTdee', lines: '192-216' },
              suggestedFix: 'Ensure cold start period check occurs before back-solving TDEE',
            });
            failed++;
          }
        }
      }
    }
    
    // 4. Check for whoosh effect handling
    if (prevState && storedState.weightDeltaKg) {
      const scaleWeight = weightByDate.get(date);
      const prevScaleWeight = weightByDate.get(prevDate!);
      
      if (scaleWeight && prevScaleWeight) {
        const scaleDelta = scaleWeight - prevScaleWeight;
        const trendDelta = storedState.weightDeltaKg;
        
        const whooshCheck = isWhooshEffect(scaleDelta, trendDelta);
        if (whooshCheck.isWhoosh && whooshCheck.severity === 'extreme') {
          // Check if the raw TDEE spike is too high
          if (storedState.rawTdeeKcal > 4000 || storedState.rawTdeeKcal < 1000) {
            whooshIssues++;
            issues.push({
              id: generateIssueId('WHOOSH'),
              type: 'WHOOSH_NOT_DAMPENED',
              severity: 'warning',
              date,
              message: `Extreme weight change (${scaleDelta.toFixed(2)}kg) may not be properly dampened`,
              context: { scaleDelta, trendDelta, rawTdee: storedState.rawTdeeKcal, severity: whooshCheck.severity },
              possibleCause: 'Large water weight fluctuation affecting TDEE calculation',
              relevantCode: { file: 'src/lib/edgeCaseHandler.ts', function: 'dampWhooshEffect', lines: '148-176' },
              suggestedFix: 'Review whoosh detection threshold and dampening factors',
            });
            warnings++;
          }
        }
      }
    }
    
    // 5. Check TDEE smoothing
    if (prevState && dailyLog?.nutritionCalories) {
      const { rawTdee } = calculateRawTdee(dailyLog.nutritionCalories, storedState.weightDeltaKg);
      const expectedSmoothed = smoothTdee(rawTdee, prevState.estimatedTdeeKcal);
      const smoothingDev = Math.abs(storedState.estimatedTdeeKcal - expectedSmoothed);
      
      if (smoothingDev > 100) {
        smoothingIssues++;
        issues.push({
          id: generateIssueId('SMOOTH'),
          type: 'TDEE_SMOOTHING_DEVIATION',
          severity: 'info',
          date,
          message: `TDEE smoothing deviation of ${smoothingDev} kcal`,
          expected: expectedSmoothed,
          actual: storedState.estimatedTdeeKcal,
          diff: smoothingDev,
          context: { rawTdee, prevTdee: prevState.estimatedTdeeKcal },
          relevantCode: { file: 'src/lib/expenditureEngine.ts', function: 'smoothTdee', lines: '87-105' },
        });
      }
    }
    
    // 6. Check for partial logging
    if (dailyLog && storedState.estimatedTdeeKcal) {
      const partialCheck = isPartialLogging(dailyLog.nutritionCalories, storedState.estimatedTdeeKcal);
      if (partialCheck.isPartial) {
        partialLoggingDetected++;
        issues.push({
          id: generateIssueId('PARTIAL'),
          type: 'PARTIAL_LOGGING_DETECTED',
          severity: 'info',
          date,
          message: partialCheck.reason || 'Partial logging detected',
          context: { calories: dailyLog.nutritionCalories, tdee: storedState.estimatedTdeeKcal },
          relevantCode: { file: 'src/lib/edgeCaseHandler.ts', function: 'isPartialLogging', lines: '37-69' },
        });
      }
    }
  }
  
  // Build validation categories
  const validations = {
    trendWeight: {
      status: trendWeightMaxDev <= 0.5 ? 'PASS' : 'WARNING',
      message: trendWeightMaxDev <= 0.5
        ? `EMA calculations within acceptable range (max deviation: ${trendWeightMaxDev.toFixed(3)}kg)`
        : `Trend weight deviations detected (max: ${trendWeightMaxDev.toFixed(2)}kg)`,
      details: { maxDeviation: trendWeightMaxDev },
    } as ValidationCategory,
    energyDensity: {
      status: energyDensityCorrect ? 'PASS' : 'FAIL',
      message: energyDensityCorrect
        ? 'Correctly using 7700 kcal/kg for deficit, 5500 for surplus'
        : 'Energy density selection errors detected',
    } as ValidationCategory,
    coldStart: {
      status: coldStartViolations === 0 ? 'PASS' : 'FAIL',
      message: coldStartViolations === 0
        ? `Cold start period (days 1-${coldStartDays}) using Mifflin-St Jeor correctly`
        : `${coldStartViolations} days incorrectly used back-solved TDEE during cold start`,
      details: { violations: coldStartViolations, coldStartDays },
    } as ValidationCategory,
    whooshHandling: {
      status: whooshIssues === 0 ? 'PASS' : 'WARNING',
      message: whooshIssues === 0
        ? 'Whoosh effects properly handled'
        : `${whooshIssues} whoosh events may not have been dampened correctly`,
      details: { issues: whooshIssues },
    } as ValidationCategory,
    tdeeSmoothing: {
      status: smoothingIssues === 0 ? 'PASS' : 'WARNING',
      message: smoothingIssues === 0
        ? 'TDEE smoothing within expected range'
        : `${smoothingIssues} smoothing deviations detected`,
      details: { issues: smoothingIssues },
    } as ValidationCategory,
    partialLogging: {
      status: partialLoggingDetected === 0 ? 'PASS' : 'WARNING',
      message: partialLoggingDetected === 0
        ? 'No partial logging days detected'
        : `${partialLoggingDetected} days with potential partial logging`,
      details: { count: partialLoggingDetected },
    } as ValidationCategory,
  };
  
  // Build recommendations
  const recommendations: ValidationResult['recommendations'] = [];
  
  if (coldStartViolations > 0) {
    recommendations.push({
      priority: 1,
      action: 'Fix cold start detection in expenditureEngine.ts',
      reason: `Days 1-${coldStartDays} should use Mifflin-St Jeor, not back-solved TDEE`,
    });
  }
  
  if (whooshIssues > 0) {
    recommendations.push({
      priority: 2,
      action: 'Review whoosh dampening threshold in edgeCaseHandler.ts',
      reason: 'Large weight drops are causing TDEE spikes',
    });
  }
  
  if (!energyDensityCorrect) {
    recommendations.push({
      priority: 1,
      action: 'Fix energy density selection in expenditureEngine.ts',
      reason: 'Incorrect density values being used for deficit/surplus',
    });
  }
  
  if (partialLoggingDetected > 3) {
    recommendations.push({
      priority: 3,
      action: 'Review partial logging detection sensitivity',
      reason: `${partialLoggingDetected} days flagged as partial - may need threshold adjustment`,
    });
  }
  
  // Determine overall status
  const totalDataPoints = passed + failed + warnings;
  const passRate = totalDataPoints > 0 ? Math.round((passed / totalDataPoints) * 100) : 0;
  
  let status: ValidationResult['status'];
  if (failed > 0) {
    status = 'FAIL';
  } else if (warnings > 0) {
    status = 'NEEDS_ATTENTION';
  } else {
    status = 'PASS';
  }
  
  return {
    timestamp,
    status,
    summary: {
      totalDataPoints,
      passed,
      failed,
      warnings,
      passRate: `${passRate}%`,
    },
    userProfile: {
      heightCm: profile.heightCm ?? null,
      sex: profile.sex ?? null,
      age,
      goalType: profile.goalType ?? null,
      goalRate: profile.goalRate ?? null,
      athleteStatus: profile.athleteStatus ?? false,
    },
    dataRange: summary.dateRange ? {
      start: summary.dateRange.start,
      end: summary.dateRange.end,
      totalDays: summary.totalDays,
    } : null,
    issues,
    validations,
    recommendations: recommendations.toSorted((a, b) => a.priority - b.priority),
  };
}

// ============================================
// Output Formatting
// ============================================

function printHumanReadable(result: ValidationResult): void {
  const separator = '='.repeat(80);
  const date = result.timestamp.split('T')[0];
  
  console.log('');
  console.log(separator);
  console.log(`TDEE VALIDATION REPORT - ${date}`);
  console.log(separator);
  console.log('');
  
  // User profile
  if (result.userProfile) {
    const { sex, age, heightCm, goalType, goalRate } = result.userProfile;
    const profileStr = [
      sex,
      age ? `${age}yo` : null,
      heightCm ? `${heightCm}cm` : null,
    ].filter(Boolean).join(', ');
    
    const goalStr = goalType && goalRate
      ? `${goalType} ${goalRate} kg/week`
      : goalType || 'not set';
    
    console.log(`User: ${profileStr || 'Profile incomplete'} | Goal: ${goalStr}`);
  }
  
  // Data range
  if (result.dataRange) {
    console.log(`Data: ${result.dataRange.totalDays} days (${result.dataRange.start} to ${result.dataRange.end})`);
  }
  
  console.log('');
  
  // Results summary
  const statusEmoji = {
    'PASS': '[PASS]',
    'NEEDS_ATTENTION': '[WARN]',
    'FAIL': '[FAIL]',
    'NO_DATA': '[NONE]',
  }[result.status];
  
  console.log(`RESULTS: ${result.summary.passed}/${result.summary.totalDataPoints} passed (${result.summary.passRate}) - ${statusEmoji} ${result.status}`);
  console.log('');
  
  // Validation categories
  console.log('VALIDATIONS:');
  for (const [name, cat] of Object.entries(result.validations)) {
    const icon = cat.status === 'PASS' ? '[OK]' : cat.status === 'FAIL' ? '[X]' : '[!]';
    console.log(`  ${icon} ${name}: ${cat.message}`);
  }
  console.log('');
  
  // Issues
  if (result.issues.length > 0) {
    const errors = result.issues.filter(i => i.severity === 'error');
    const warnings = result.issues.filter(i => i.severity === 'warning');
    
    console.log('ISSUES FOUND:');
    
    for (const issue of errors.slice(0, 5)) {
      console.log(`  [ERROR] ${issue.id}: ${issue.message}`);
      console.log(`          -> Check ${issue.relevantCode.file}:${issue.relevantCode.function}`);
      if (issue.relevantCode.lines) {
        console.log(`             (lines ${issue.relevantCode.lines})`);
      }
    }
    
    for (const issue of warnings.slice(0, 5)) {
      console.log(`  [WARN]  ${issue.id}: ${issue.message}`);
      console.log(`          -> Check ${issue.relevantCode.file}:${issue.relevantCode.function}`);
    }
    
    const remaining = result.issues.length - errors.slice(0, 5).length - warnings.slice(0, 5).length;
    if (remaining > 0) {
      console.log(`  ... and ${remaining} more issues (see JSON output)`);
    }
    
    console.log('');
  }
  
  // Recommendations
  if (result.recommendations.length > 0) {
    console.log('RECOMMENDATIONS:');
    for (const rec of result.recommendations) {
      console.log(`  ${rec.priority}. ${rec.action}`);
      console.log(`     Reason: ${rec.reason}`);
    }
    console.log('');
  }
  
  console.log(separator);
  console.log('');
}

// ============================================
// Main Entry Point
// ============================================

async function main(): Promise<void> {
  console.log('TDEE Validation Script');
  console.log('----------------------');
  
  // Check if fixture exists
  if (!fixtureExists()) {
    console.error('\nError: Fixture file not found.');
    console.error('\nTo create the fixture:');
    console.error('  1. Open the MacroAI app');
    console.error('  2. Go to Settings -> Export -> All data');
    console.error('  3. Save the JSON file to: __tests__/fixtures/userData.json');
    process.exit(1);
  }
  
  // Load fixture
  console.log('\nLoading fixture...');
  const fixture = loadFixture();
  
  const summary = getFixtureSummary(fixture);
  console.log(`Found ${summary.weightEntries} weight entries, ${summary.dailyLogEntries} daily logs, ${summary.computedStateEntries} computed states`);
  
  // Run validation
  console.log('\nRunning validation...');
  const result = validateTdeeCalculations(fixture);
  
  // Output JSON (for LLM agents to parse)
  console.log('\n--- JSON OUTPUT START ---');
  console.log(JSON.stringify(result, null, 2));
  console.log('--- JSON OUTPUT END ---');
  
  // Output human-readable summary
  printHumanReadable(result);
  
  // Exit with appropriate code
  if (result.status === 'FAIL') {
    process.exit(1);
  } else if (result.status === 'NEEDS_ATTENTION') {
    process.exit(0); // Still success, but with warnings
  }
  
  process.exit(0);
}

// Run the script
main().catch((error) => {
  console.error('Validation failed:', error);
  process.exit(1);
});
