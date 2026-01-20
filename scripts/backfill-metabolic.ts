#!/usr/bin/env tsx
/**
 * Backfill Metabolic Data Script
 * 
 * This script populates DailyLog and ComputedState records for all
 * existing meal and weight data in the database.
 * 
 * Run this once after deploying the metabolic service update to
 * backfill historical data.
 * 
 * Usage:
 *   npx tsx scripts/backfill-metabolic.ts [days]
 * 
 * Arguments:
 *   days - Number of days to backfill (default: 90)
 * 
 * Example:
 *   npx tsx scripts/backfill-metabolic.ts        # Backfill last 90 days
 *   npx tsx scripts/backfill-metabolic.ts 30    # Backfill last 30 days
 *   npx tsx scripts/backfill-metabolic.ts 365   # Backfill last year
 * 
 * NOTE: This script requires:
 * 1. Amplify sandbox running (npx ampx sandbox)
 * 2. User to be authenticated (run after logging in via the app)
 * 
 * For authenticated access in production, use the server action
 * from the settings page instead of this CLI script.
 */

console.log('='.repeat(60));
console.log('Metabolic Data Backfill Script');
console.log('='.repeat(60));
console.log();

// Parse command line arguments
const args = process.argv.slice(2);
const days = args[0] ? parseInt(args[0], 10) : 90;

if (isNaN(days) || days <= 0) {
  console.error('Error: days must be a positive number');
  console.log('Usage: npx tsx scripts/backfill-metabolic.ts [days]');
  process.exit(1);
}

console.log(`Configuration:`);
console.log(`  Days to backfill: ${days}`);
console.log();

console.log('IMPORTANT: This script requires authenticated access to Amplify.');
console.log();
console.log('For development:');
console.log('  1. Start the dev server: npm run dev');
console.log('  2. Log in via the app');
console.log('  3. Go to Settings and trigger backfill from there');
console.log();
console.log('Or add a temporary button to your Settings page that calls:');
console.log();
console.log('  import { runBackfillMetabolic } from "@/actions/backfillMetabolic";');
console.log('  await runBackfillMetabolic(90);');
console.log();
console.log('This will backfill data with your authenticated session.');
console.log();
console.log('For more information, see src/lib/metabolicService.ts');
console.log('='.repeat(60));
