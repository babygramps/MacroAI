import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  UserProfile: a
    .model({
      email: a.string(),
      calorieGoal: a.integer(),
      proteinGoal: a.integer(),
      carbsGoal: a.integer(),
      fatGoal: a.integer(),
    })
    .authorization((allow) => [allow.owner()]),

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
    })
    .authorization((allow) => [allow.owner()]),

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
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
