import { logRemote } from '@/lib/clientLogger';

/**
 * Type for Amplify data client
 */
type AmplifyClient = {
    models: {
        Meal: {
            list: (options: { filter: { eatenAt: { between: [string, string] } } }) => Promise<{
                data: { id: string }[] | null;
            }>;
        };
    };
};

interface VerifyMealOptions {
    maxAttempts?: number;
    traceId?: string;
}

interface VerifyMealResult {
    verified: boolean;
    attempts: number;
}

/**
 * Delay utility for exponential backoff
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get start and end of day for a given ISO timestamp
 */
function getDayBounds(isoTimestamp: string): { startOfDay: string; endOfDay: string } {
    const date = new Date(isoTimestamp);
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    return {
        startOfDay: startOfDay.toISOString(),
        endOfDay: endOfDay.toISOString(),
    };
}

/**
 * Verify a meal is readable after creation using list query (GSI).
 * Uses exponential backoff to handle DynamoDB eventual consistency.
 * 
 * @param client - Amplify data client
 * @param mealId - ID of the meal to verify
 * @param eatenAt - ISO timestamp of when meal was eaten (used for list query)
 * @param options - Optional configuration
 * @returns Object with verified status and number of attempts made
 */
export async function verifyMealCreated(
    client: AmplifyClient,
    mealId: string,
    eatenAt: string,
    options: VerifyMealOptions = {}
): Promise<VerifyMealResult> {
    const { maxAttempts = 4, traceId } = options;

    // Exponential backoff delays: 200ms, 400ms, 800ms, 1600ms
    const baseDelay = 200;

    const { startOfDay, endOfDay } = getDayBounds(eatenAt);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Calculate delay with exponential backoff
        const delayMs = baseDelay * Math.pow(2, attempt - 1);
        await delay(delayMs);

        try {
            // Use list query which goes through GSI - this is what the dashboard uses
            const { data: meals } = await client.models.Meal.list({
                filter: { eatenAt: { between: [startOfDay, endOfDay] } },
            });

            const foundInList = meals?.some(m => m.id === mealId) ?? false;

            if (foundInList) {
                logRemote.info('MEAL_VERIFICATION_SUCCESS', {
                    traceId,
                    mealId,
                    attempt,
                    delayMs,
                    totalMealsInList: meals?.length ?? 0,
                });
                return { verified: true, attempts: attempt };
            }

            // Not found yet, log and retry
            if (attempt < maxAttempts) {
                logRemote.info('MEAL_VERIFICATION_RETRY', {
                    traceId,
                    mealId,
                    attempt,
                    nextDelayMs: baseDelay * Math.pow(2, attempt),
                    totalMealsInList: meals?.length ?? 0,
                });
            }
        } catch (error) {
            logRemote.warn('MEAL_VERIFICATION_ERROR', {
                traceId,
                mealId,
                attempt,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            // Continue to next attempt
        }
    }

    // Exhausted all attempts
    logRemote.warn('MEAL_VERIFICATION_EXHAUSTED', {
        traceId,
        mealId,
        maxAttempts,
        totalDelayMs: baseDelay * (Math.pow(2, maxAttempts) - 1),
    });

    return { verified: false, attempts: maxAttempts };
}
