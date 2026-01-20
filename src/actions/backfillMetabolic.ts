'use server';

/**
 * Backfill Metabolic Data Action
 * 
 * This server action can be called from the client to backfill
 * DailyLog and ComputedState records for all existing data.
 * 
 * NOTE: This is designed to be called once after deploying the
 * metabolic service update, or to repair data integrity.
 * 
 * For production use, this should be triggered from an admin page
 * or settings screen. It does NOT require CLI access.
 */

import { backfillMetabolicData } from '@/lib/metabolicService';

export interface BackfillResult {
  success: boolean;
  daysProcessed: number;
  dailyLogsCreated: number;
  computedStatesCreated: number;
  error?: string;
}

/**
 * Backfill metabolic data for the specified number of days
 * 
 * @param days - Number of days to backfill (default 90)
 * @returns Result summary
 */
export async function runBackfillMetabolic(days: number = 90): Promise<BackfillResult> {
  console.log('[backfillMetabolic] Starting backfill for', days, 'days');
  
  try {
    const result = await backfillMetabolicData(days);
    
    console.log('[backfillMetabolic] Backfill complete:', result);
    
    return {
      success: true,
      ...result,
    };
  } catch (error) {
    console.error('[backfillMetabolic] Backfill failed:', error);
    
    return {
      success: false,
      daysProcessed: 0,
      dailyLogsCreated: 0,
      computedStatesCreated: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
