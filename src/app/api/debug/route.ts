import { NextRequest, NextResponse } from 'next/server';

interface DebugPayload {
  logId?: string;
  debug?: boolean;
  level?: 'debug' | 'info' | 'warn' | 'error';
  message?: string;
  timestamp?: number;
  context?: Record<string, unknown>;
}

function sanitizeHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'cookie' || lowerKey === 'authorization') {
      return;
    }
    result[key] = value;
  });
  return result;
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
  const debugParam = request.nextUrl.searchParams.get('debug') === '1';
  const requestContext = buildRequestContext(request);

  try {
    const payload: DebugPayload = await request.json();
    const logEntry = {
      source: 'debug-api',
      debugParam,
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
  const debugParam = request.nextUrl.searchParams.get('debug') === '1';
  const requestContext = buildRequestContext(request);

  console.info('[DEBUG_API] GET', JSON.stringify({ debugParam, request: requestContext }));
  return NextResponse.json({
    status: 'ok',
    endpoint: 'debug',
    debugParam,
    serverTime: new Date().toISOString(),
  });
}
