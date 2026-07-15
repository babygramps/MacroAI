'use client';

import { useSyncExternalStore } from 'react';
import { pendingMealCount, subscribeMealQueue } from '@/lib/offline/mealQueue';

function subscribeOnlineStatus(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * Floating status pill for offline mode. Hidden while online with an empty
 * sync queue; shows "offline" while disconnected and "syncing" once
 * connectivity returns with meals still queued.
 */
export function OfflineBanner() {
  const isOnline = useSyncExternalStore(
    subscribeOnlineStatus,
    () => navigator.onLine,
    () => true // SSR: assume online
  );
  const pending = useSyncExternalStore(
    subscribeMealQueue,
    pendingMealCount,
    () => 0 // SSR: no queue
  );

  if (isOnline && pending === 0) {
    return null;
  }

  const label = !isOnline
    ? pending > 0
      ? `Offline — ${pending} meal${pending === 1 ? '' : 's'} waiting to sync`
      : 'Offline — meals you log will sync later'
    : `Syncing ${pending} queued meal${pending === 1 ? '' : 's'}…`;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
      <div
        className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm animate-fade-in ${
          !isOnline
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
        }`}
        style={{ backgroundColor: 'rgba(10, 10, 15, 0.9)' }}
        role="status"
      >
        {isOnline && <div className="spinner w-3.5 h-3.5" />}
        <span>{label}</span>
      </div>
    </div>
  );
}
