'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { subscribeToDebugLogs, type DebugLogEntry } from '@/lib/clientLogger';

/**
 * Floating debug panel that shows recent log entries.
 * Only visible when ?debug=1 is in the URL.
 * Useful for debugging production issues on mobile.
 */
export function DebugOverlay() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);

  // Check URL for debug flag - computed once
  const isEnabled = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('debug') === '1';
  }, []);

  // Subscribe to log updates
  useEffect(() => {
    if (!isEnabled) return;

    const unsubscribe = subscribeToDebugLogs((entries) => {
      setLogs(entries);
    });

    return unsubscribe;
  }, [isEnabled]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  if (!isEnabled) return null;

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-yellow-400';
      case 'info':
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  };

  // Collapsed: just show a small badge
  if (!isExpanded) {
    return (
      <button
        onClick={toggleExpanded}
        className="fixed bottom-20 right-4 z-[9999] bg-bg-surface/90 backdrop-blur-sm border border-border-subtle rounded-full px-3 py-1.5 shadow-lg"
      >
        <span className="text-xs font-mono text-text-secondary">
          🐛 {logs.length}
        </span>
      </button>
    );
  }

  // Expanded: show full log panel
  return (
    <div className="fixed bottom-20 right-4 left-4 z-[9999] max-h-[50vh] bg-bg-surface/95 backdrop-blur-sm border border-border-subtle rounded-xl shadow-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle bg-bg-elevated/50">
        <span className="text-xs font-mono font-semibold text-text-primary">
          🐛 Debug Logs ({logs.length})
        </span>
        <button
          onClick={toggleExpanded}
          className="text-text-secondary hover:text-text-primary text-lg leading-none"
        >
          ✕
        </button>
      </div>

      {/* Log entries */}
      <div className="overflow-y-auto flex-1 p-2 space-y-1.5">
        {logs.length === 0 ? (
          <p className="text-xs text-text-muted text-center py-4">
            No logs yet. Perform an action to see logs.
          </p>
        ) : (
          logs.map((log, index) => (
            <div
              key={`${log.timestamp}-${index}`}
              className="text-xs font-mono bg-bg-elevated/50 rounded-lg p-2"
            >
              {/* Time + Level + Message */}
              <div className="flex items-start gap-2">
                <span className="text-text-muted shrink-0">
                  {formatTime(log.timestamp)}
                </span>
                <span className={`shrink-0 uppercase ${getLevelColor(log.level)}`}>
                  {log.level.charAt(0)}
                </span>
                <span className="text-text-primary font-semibold break-all">
                  {log.message}
                </span>
              </div>

              {/* Trace ID if present */}
              {log.traceId && (
                <div className="mt-1 text-text-muted pl-12">
                  trace: <span className="text-macro-protein">{log.traceId}</span>
                </div>
              )}

              {/* Context summary */}
              {log.context && Object.keys(log.context).length > 0 && (
                <div className="mt-1 text-text-muted pl-12 break-all">
                  {Object.entries(log.context)
                    .filter(([key]) => key !== 'traceId' && key !== 'device')
                    .slice(0, 8)
                    .map(([key, value]) => (
                      <span key={key} className="mr-2">
                        {key}:{' '}
                        <span className="text-text-secondary">
                          {typeof value === 'object'
                            ? JSON.stringify(value).slice(0, 50)
                            : String(value).slice(0, 50)}
                        </span>
                      </span>
                    ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
