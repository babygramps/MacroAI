import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import type { Schema } from '@/amplify/data/resource';
import { cookies } from 'next/headers';

type ServerDataClient = ReturnType<typeof generateServerClientUsingCookies<Schema>>;

export interface AuthenticatedServerContext {
  client: ServerDataClient;
  userEmail: string | null;
}

export async function getServerDataClient(): Promise<ServerDataClient | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const outputs = require('@/amplify_outputs.json');
    return generateServerClientUsingCookies<Schema>({
      config: outputs,
      cookies: cookies,
    });
  } catch {
    return null;
  }
}

/**
 * Verifies request authentication by issuing a user-scoped model query.
 * If the request is unauthenticated, Amplify owner rules reject this query.
 */
export async function getAuthenticatedServerContext(): Promise<AuthenticatedServerContext | null> {
  const client = await getServerDataClient();
  if (!client) {
    return null;
  }

  try {
    const { data } = await client.models.UserProfile.list({ limit: 1 });
    return {
      client,
      userEmail: data?.[0]?.email ?? null,
    };
  } catch {
    return null;
  }
}
