import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedServerContext } from '@/lib/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';

/**
 * Client-side logging endpoint
 * Receives logs from the browser and outputs to CloudWatch via console
 * 
 * In AWS Amplify, all console output from API routes is automatically
 * captured and sent to CloudWatch Logs.
 */

interface LogPayload {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
  timestamp?: number;
}

const MAX_BODY_BYTES = 10_000;
const MAX_MESSAGE_LENGTH = 500;
const MAX_CONTEXT_BYTES = 8_000;
const ALLOWED_LEVELS = new Set<LogPayload['level']>(['debug', 'info', 'warn', 'error']);

function getRequestIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  return realIp ?? forwardedFor?.split(',')[0]?.trim() ?? 'unknown';
}

function sanitizeContext(context: unknown): Record<string, unknown> | undefined {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return undefined;
  }

  try {
    const json = JSON.stringify(context);
    if (json.length > MAX_CONTEXT_BYTES) {
      return { warning: 'context_truncated_for_size' };
    }
  } catch {
    return { warning: 'context_unserializable' };
  }

  return context as Record<string, unknown>;
}

function parsePayload(raw: string): LogPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const candidate = parsed as Record<string, unknown>;
  const level = candidate.level;
  const message = candidate.message;
  const timestamp = candidate.timestamp;

  if (typeof level !== 'string' || !ALLOWED_LEVELS.has(level as LogPayload['level'])) {
    return null;
  }
  if (typeof message !== 'string' || message.length === 0 || message.length > MAX_MESSAGE_LENGTH) {
    return null;
  }
  if (timestamp !== undefined && (typeof timestamp !== 'number' || !Number.isFinite(timestamp))) {
    return null;
  }

  return {
    level: level as LogPayload['level'],
    message,
    timestamp,
    context: sanitizeContext(candidate.context),
  };
}

export async function POST(request: NextRequest) {
  const ip = getRequestIp(request);
  const routeLimit = checkRateLimit({
    key: `api-log:${ip}`,
    windowMs: 60_000,
    maxRequests: 60,
  });
  if (!routeLimit.allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(routeLimit.retryAfterSeconds) } }
    );
  }

  const auth = await getAuthenticatedServerContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userLimit = checkRateLimit({
    key: `api-log-user:${auth.userEmail ?? 'unknown'}:${ip}`,
    windowMs: 60_000,
    maxRequests: 120,
  });
  if (!userLimit.allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(userLimit.retryAfterSeconds) } }
    );
  }

  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Payload too large' },
        { status: 413 }
      );
    }

    const payload = parsePayload(raw);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: 'Invalid payload' },
        { status: 400 }
      );
    }

    const { level, message, context, timestamp } = payload;

    // Format the log entry
    const logEntry = {
      source: 'client',
      level,
      message,
      timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
      userEmail: auth.userEmail,
      ip,
      ...context,
    };

    const logString = JSON.stringify(logEntry);

    // Output to appropriate console method (captured by CloudWatch in Amplify)
    switch (level) {
      case 'error':
        console.error(`[CLIENT_LOG] ${logString}`);
        break;
      case 'warn':
        console.warn(`[CLIENT_LOG] ${logString}`);
        break;
      case 'info':
        console.info(`[CLIENT_LOG] ${logString}`);
        break;
      default:
        console.log(`[CLIENT_LOG] ${logString}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[CLIENT_LOG] Failed to parse log payload:', error);
    return NextResponse.json(
      { success: false, error: 'Invalid payload' },
      { status: 400 }
    );
  }
}

// Allow GET for health checks
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'client-log' });
}
