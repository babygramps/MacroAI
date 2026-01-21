import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  // Custom passkey names (Cognito doesn't support renaming)
  // Maps credential ID to user-provided friendly name
  PasskeyName: a
    .model({
      credentialId: a.string().required(), // Cognito credential ID
      customName: a.string().required(), // User's custom name for this passkey
    })
    .authorization((allow) => [allow.owner()])
    .secondaryIndexes((index) => [index('credentialId')]),

  UserProfile: a
    .model({
      email: a.string(),
      calorieGoal: a.integer(),
      proteinGoal: a.integer(),
      carbsGoal: a.integer(),
      fatGoal: a.integer(),
      targetWeightKg: a.float(), // optional target weight in kg
      preferredWeightUnit: a.string(), // "kg" | "lbs" (legacy, use preferredUnitSystem)
      preferredUnitSystem: a.string(), // "metric" | "imperial"
      // Metabolic modeling additions
      heightCm: a.float(), // height in centimeters (stored in metric)
      birthDate: a.date(), // for age calculation in BMR
      sex: a.string(), // "male" | "female" for BMR calculation
      initialBodyFatPct: a.float(), // optional, helps with initial BMR guess
      expenditureStrategy: a.string(), // "static" | "dynamic"
      startDate: a.date(), // when tracking began
      athleteStatus: a.boolean(), // for BMR correction (+10-12%)
      goalType: a.string(), // "lose" | "gain" | "maintain"
      goalRate: a.float(), // kg per week (stored in metric)
    })
    .authorization((allow) => [allow.owner()]),

  // Weight tracking entries
  WeightLog: a
    .model({
      weightKg: a.float().required(), // weight stored in kg
      recordedAt: a.datetime().required(),
      note: a.string(), // optional note (e.g., "after workout")
    })
    .authorization((allow) => [allow.owner()])
    .secondaryIndexes((index) => [index('recordedAt')]),

  // Legacy FoodLog - kept for backward compatibility during migration
  FoodLog: a
    .model({
      name: a.string(),
      weightG: a.integer(),
      calories: a.integer(),
      protein: a.float(),
      carbs: a.float(),
      fat: a.float(),
      source: a.string(), // "USDA", "OFF", "API_NINJAS", "GEMINI"
      eatenAt: a.datetime(),
      // Serving info for editing (optional for backwards compatibility)
      servingDescription: a.string(), // e.g., "1 cup", "1 slice", "1 medium"
      servingSizeGrams: a.integer(), // grams per serving
    })
    .authorization((allow) => [allow.owner()]),

  // Meal - Parent container for logged food items
  // Can be a full meal with multiple ingredients or a single snack/drink
  Meal: a
    .model({
      name: a.string().required(), // "Tom Kha Soup with Rice", "Protein Bar"
      category: a.string().required(), // "meal" | "snack" | "drink"
      eatenAt: a.datetime().required(), // When consumed
      // Aggregated totals (computed from ingredients for fast loading)
      totalCalories: a.integer().required(),
      totalProtein: a.float().required(),
      totalCarbs: a.float().required(),
      totalFat: a.float().required(),
      totalWeightG: a.integer().required(),
    })
    .authorization((allow) => [allow.owner()])
    .secondaryIndexes((index) => [index('eatenAt')]),

  // MealIngredient - Individual ingredients within a meal
  MealIngredient: a
    .model({
      mealId: a.string().required(), // Reference to parent Meal
      name: a.string().required(), // "Chicken breast", "Rice"
      eatenAt: a.datetime(), // Copied from parent Meal for day-based queries
      weightG: a.integer().required(),
      calories: a.integer().required(),
      protein: a.float().required(),
      carbs: a.float().required(),
      fat: a.float().required(),
      source: a.string().required(), // "USDA" | "OFF" | "GEMINI"
      // Serving info for editing
      servingDescription: a.string(), // e.g., "1 cup", "1 slice"
      servingSizeGrams: a.integer(), // grams per serving
      sortOrder: a.integer(), // For consistent ordering within meal
    })
    .authorization((allow) => [allow.owner()])
    .secondaryIndexes((index) => [index('mealId'), index('eatenAt')]),

  // Shared cache for API responses (reduces duplicate API calls)
  FoodCache: a
    .model({
      cacheKey: a.string().required(), // hash of query + source
      source: a.string().required(), // "USDA", "OFF", "API_NINJAS"
      query: a.string(), // original search term
      results: a.json(), // normalized food results array
      expiresAt: a.integer(), // TTL timestamp (epoch seconds)
    })
    .authorization((allow) => [allow.authenticated()])
    .secondaryIndexes((index) => [index('cacheKey')]),

  // DailyLog - Aggregated daily data for adherence neutrality
  // Crucial: null = untracked, 0 = fasted/zero
  DailyLog: a
    .model({
      date: a.date().required(), // Unique per user (YYYY-MM-DD)
      scaleWeightKg: a.float(), // Nullable = not weighed that day
      nutritionCalories: a.integer(), // Nullable = untracked, 0 = fasted
      nutritionProteinG: a.float(),
      nutritionCarbsG: a.float(),
      nutritionFatG: a.float(),
      stepCount: a.integer(), // Optional, for V3 step modifier
      logStatus: a.string(), // "complete" | "partial" | "skipped"
    })
    .authorization((allow) => [allow.owner()])
    .secondaryIndexes((index) => [index('date')]),

  // ComputedState - Cached daily calculated values (avoids re-computing history)
  ComputedState: a
    .model({
      date: a.date().required(), // Unique per user (YYYY-MM-DD)
      trendWeightKg: a.float().required(), // EMA smoothed weight
      estimatedTdeeKcal: a.float().required(), // Smoothed TDEE
      rawTdeeKcal: a.float(), // Pre-smoothed value for debugging
      fluxConfidenceRange: a.float(), // Uncertainty band (+/- kcal)
      energyDensityUsed: a.float(), // 7700 (deficit) or 5500 (surplus)
      weightDeltaKg: a.float(), // Daily weight change used in calculation
    })
    .authorization((allow) => [allow.owner()])
    .secondaryIndexes((index) => [index('date')]),

  // WeeklyCheckIn - Weekly coaching snapshots
  WeeklyCheckIn: a
    .model({
      weekStartDate: a.date().required(), // Start of the week (YYYY-MM-DD)
      weekEndDate: a.date().required(),
      averageTdee: a.float().required(),
      suggestedCalories: a.float().required(),
      adherenceScore: a.float(), // Days logged / 7
      confidenceLevel: a.string(), // "learning" | "low" | "medium" | "high"
      trendWeightStart: a.float(),
      trendWeightEnd: a.float(),
      weeklyWeightChange: a.float(), // kg change over the week
      notes: a.string(), // Optional coaching notes
    })
    .authorization((allow) => [allow.owner()])
    .secondaryIndexes((index) => [index('weekStartDate')]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
