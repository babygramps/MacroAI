import { NextRequest, NextResponse } from 'next/server';

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

export async function POST(request: NextRequest) {
  try {
    const payload: LogPayload = await request.json();
    const { level, message, context, timestamp } = payload;

    // Format the log entry
    const logEntry = {
      source: 'client',
      level,
      message,
      timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
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
