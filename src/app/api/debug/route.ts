import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedServerContext } from '@/lib/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';

interface DebugPayload {
  logId?: string;
  debug?: boolean;
  level?: 'debug' | 'info' | 'warn' | 'error';
  message?: string;
  timestamp?: number;
  context?: Record<string, unknown>;
}

const MAX_BODY_BYTES = 10_000;
const MAX_MESSAGE_LENGTH = 500;
const ALLOWED_LEVELS = new Set<NonNullable<DebugPayload['level']>>(['debug', 'info', 'warn', 'error']);
const ALLOWED_HEADERS = new Set([
  'user-agent',
  'content-type',
  'content-length',
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-forwarded-host',
]);

function sanitizeHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (!ALLOWED_HEADERS.has(lowerKey)) {
      return;
    }
    result[key] = value;
  });
  return result;
}

function getRequestIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  return realIp ?? forwardedFor?.split(',')[0]?.trim() ?? 'unknown';
}

function parsePayload(raw: string): DebugPayload | null {
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

  if (level !== undefined && (typeof level !== 'string' || !ALLOWED_LEVELS.has(level as NonNullable<DebugPayload['level']>))) {
    return null;
  }

  if (message !== undefined && (typeof message !== 'string' || message.length > MAX_MESSAGE_LENGTH)) {
    return null;
  }

  const timestamp = candidate.timestamp;
  if (timestamp !== undefined && (typeof timestamp !== 'number' || !Number.isFinite(timestamp))) {
    return null;
  }

  return {
    logId: typeof candidate.logId === 'string' ? candidate.logId : undefined,
    debug: typeof candidate.debug === 'boolean' ? candidate.debug : undefined,
    level: level as DebugPayload['level'] | undefined,
    message: message as string | undefined,
    timestamp: timestamp as number | undefined,
    context: candidate.context && typeof candidate.context === 'object' && !Array.isArray(candidate.context)
      ? (candidate.context as Record<string, unknown>)
      : undefined,
  };
}

function buildRequestContext(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const inferredIp = realIp ?? forwardedFor?.split(',')[0]?.trim() ?? null;
  return {
    method: request.method,
    url: request.nextUrl.toString(),
    path: request.nextUrl.pathname,
    searchParams: Object.fromEntries(request.nextUrl.searchParams.entries()),
    userAgent: request.headers.get('user-agent'),
    ip: inferredIp,
    forwardedFor,
    forwardedProto: request.headers.get('x-forwarded-proto'),
    forwardedHost: request.headers.get('x-forwarded-host'),
    contentType: request.headers.get('content-type'),
    contentLength: request.headers.get('content-length'),
    headers: sanitizeHeaders(request.headers),
    receivedAt: new Date().toISOString(),
  };
}

export async function POST(request: NextRequest) {
  const ip = getRequestIp(request);
  const routeLimit = checkRateLimit({
    key: `api-debug:${ip}`,
    windowMs: 60_000,
    maxRequests: 30,
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

  const debugParam = request.nextUrl.searchParams.get('debug') === '1';
  const requestContext = buildRequestContext(request);

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

    const logEntry = {
      source: 'debug-api',
      debugParam,
      userEmail: auth.userEmail,
      request: requestContext,
      payload: {
        logId: payload.logId,
        debug: payload.debug,
        level: payload.level,
        message: payload.message,
        timestamp: payload.timestamp ? new Date(payload.timestamp).toISOString() : undefined,
        context: payload.context,
      },
    };

    console.info('[DEBUG_API]', JSON.stringify(logEntry));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DEBUG_API] Failed to parse payload', {
      request: requestContext,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: 'Invalid payload' },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedServerContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const debugParam = request.nextUrl.searchParams.get('debug') === '1';
  const requestContext = buildRequestContext(request);

  console.info('[DEBUG_API] GET', JSON.stringify({ debugParam, userEmail: auth.userEmail, request: requestContext }));
  return NextResponse.json({
    status: 'ok',
    endpoint: 'debug',
    debugParam,
    serverTime: new Date().toISOString(),
  });
}
