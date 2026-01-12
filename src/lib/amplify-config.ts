'use client';

import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

// Configure Amplify - this will be populated by amplify_outputs.json at runtime
// For now, we check if outputs exist before configuring
let isConfigured = false;

export function configureAmplify() {
  if (isConfigured) return;

  try {
    // Dynamic import of amplify outputs
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const outputs = require('@/amplify_outputs.json');
    Amplify.configure(outputs, { ssr: true });
    isConfigured = true;
  } catch {
    // amplify_outputs.json doesn't exist yet (before sandbox is run)
    console.warn(
      'Amplify outputs not found. Run `npx ampx sandbox` to generate them.'
    );
  }
}

// Create a typed client for data operations
export function getDataClient() {
  configureAmplify();
  return generateClient<Schema>();
}

// Export the Schema type for use in components
export type { Schema };
