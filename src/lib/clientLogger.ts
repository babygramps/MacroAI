/**
 * Client-side logger that sends logs to CloudWatch via API route
 * 
 * Usage:
 *   import { logRemote, generateTraceId } from '@/lib/clientLogger';
 *   const traceId = generateTraceId();
 *   logRemote.info('MEAL_LOG_START', { traceId, tab: 'search' });
 *   logRemote.error('Photo upload failed', { fileSize: file.size, fileType: file.type });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
    [key: string]: unknown;
}

// User context for identifying logs
let userContext: { userId?: string; email?: string } = {};

/**
 * Set user context to be included in all logs
 * Call this after authentication
 */
export function setUserContext(ctx: { userId?: string; email?: string }): void {
    userContext = ctx;
}

/**
 * Generate a unique trace ID for correlating logs across the meal logging flow
 * Format: ml_<timestamp>_<random>
 */
export function generateTraceId(): string {
    return `ml_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// In-memory buffer of recent log entries for debug overlay
export interface DebugLogEntry {
    timestamp: number;
    level: LogLevel;
    message: string;
    traceId?: string;
    context?: LogContext;
}

const DEBUG_LOG_BUFFER_SIZE = 20;
const debugLogBuffer: DebugLogEntry[] = [];
const debugLogListeners: Set<(entries: DebugLogEntry[]) => void> = new Set();

/**
 * Subscribe to debug log updates (for DebugOverlay)
 */
export function subscribeToDebugLogs(callback: (entries: DebugLogEntry[]) => void): () => void {
    debugLogListeners.add(callback);
    // Immediately send current buffer
    callback([...debugLogBuffer]);
    // Return unsubscribe function
    return () => debugLogListeners.delete(callback);
}

/**
 * Get current debug log entries
 */
export function getDebugLogs(): DebugLogEntry[] {
    return [...debugLogBuffer];
}

function addToDebugBuffer(entry: DebugLogEntry): void {
    debugLogBuffer.unshift(entry);
    if (debugLogBuffer.length > DEBUG_LOG_BUFFER_SIZE) {
        debugLogBuffer.pop();
    }
    // Notify listeners
    debugLogListeners.forEach(cb => cb([...debugLogBuffer]));
}

// Collect device/browser info for debugging
function getDeviceContext(): LogContext {
    if (typeof window === 'undefined') return {};

    return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        screenWidth: window.screen?.width,
        screenHeight: window.screen?.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        online: navigator.onLine,
        // Memory info (Chrome only)
        ...(('deviceMemory' in navigator) && { deviceMemory: (navigator as unknown as { deviceMemory: number }).deviceMemory }),
    };
}

async function sendLog(level: LogLevel, message: string, context?: LogContext): Promise<void> {
    const timestamp = Date.now();
    
    // Add to debug buffer for overlay
    const traceId = context?.traceId as string | undefined;
    addToDebugBuffer({
        timestamp,
        level,
        message,
        traceId,
        context,
    });

    // Don't block the UI - fire and forget
    try {
        const payload = {
            level,
            message,
            timestamp,
            context: {
                ...context,
                ...userContext, // Include user context in all logs
                device: getDeviceContext(),
                url: typeof window !== 'undefined' ? window.location.pathname : undefined,
            },
        };

        // Use sendBeacon if available (works even if page is closing)
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            navigator.sendBeacon('/api/log', blob);
            return;
        }

        // Fallback to fetch
        await fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            // Don't wait for response
            keepalive: true,
        });
    } catch {
        // Silently fail - we don't want logging to break the app
        // Still log to console for local debugging
        console.warn('[clientLogger] Failed to send remote log:', message);
    }
}

/**
 * Remote logger - sends logs to CloudWatch via /api/log
 * 
 * All methods are fire-and-forget (non-blocking)
 */
export const logRemote = {
    debug: (message: string, context?: LogContext) => sendLog('debug', message, context),
    info: (message: string, context?: LogContext) => sendLog('info', message, context),
    warn: (message: string, context?: LogContext) => sendLog('warn', message, context),
    error: (message: string, context?: LogContext) => sendLog('error', message, context),
};

/**
 * Helper to capture file metadata for debugging
 */
export function getFileContext(file: File | null | undefined): LogContext {
    if (!file) return { file: null };

    return {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileSizeKB: Math.round(file.size / 1024),
        fileSizeMB: Math.round(file.size / 1024 / 1024 * 100) / 100,
        lastModified: file.lastModified,
    };
}

/**
 * Helper to safely extract error information
 */
export function getErrorContext(error: unknown): LogContext {
    if (error instanceof Error) {
        return {
            errorName: error.name,
            errorMessage: error.message,
            errorStack: error.stack?.split('\n').slice(0, 5).join('\n'), // First 5 lines of stack
        };
    }
    return { error: String(error) };
}
