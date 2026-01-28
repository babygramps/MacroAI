/**
 * Client-side logger that sends logs to CloudWatch via API route
 * 
 * Usage:
 *   import { logRemote } from '@/lib/clientLogger';
 *   logRemote.error('Photo upload failed', { fileSize: file.size, fileType: file.type });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
    [key: string]: unknown;
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
    // Don't block the UI - fire and forget
    try {
        const payload = {
            level,
            message,
            timestamp: Date.now(),
            context: {
                ...context,
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
