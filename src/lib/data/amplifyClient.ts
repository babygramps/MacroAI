import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

let client: ReturnType<typeof generateClient<Schema>> | null = null;

export function getAmplifyDataClient(): ReturnType<typeof generateClient<Schema>> | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (!client) {
    client = generateClient<Schema>();
  }
  return client;
}
