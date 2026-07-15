'use client';

import { useEffect } from 'react';

/**
 * Registers the offline service worker (public/sw.js). Rendered once from
 * the root layout; no UI.
 */
export function SWRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('[SWRegister] Service worker registration failed:', error);
      });
    }
  }, []);

  return null;
}
