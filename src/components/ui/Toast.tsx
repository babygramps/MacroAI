'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

// Simple toast store
let toastListeners: (() => void)[] = [];
let toasts: Toast[] = [];

function notifyListeners() {
  toastListeners.forEach((listener) => listener());
}

function subscribeToToasts(callback: () => void) {
  toastListeners.push(callback);
  return () => {
    toastListeners = toastListeners.filter((l) => l !== callback);
  };
}

function getToastsSnapshot() {
  return toasts;
}

function getServerToastsSnapshot() {
  return [];
}

export function showToast(message: string, type: ToastType = 'info') {
  const id = Math.random().toString(36).substring(7);
  toasts = [...toasts, { id, message, type }];
  notifyListeners();

  // Auto remove after 3 seconds
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notifyListeners();
  }, 3000);
}

// SSR-safe way to check if mounted (React 19 compatible)
const subscribeMounted = () => () => {};
const getMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

export function ToastContainer() {
  const mounted = useSyncExternalStore(subscribeMounted, getMountedSnapshot, getServerMountedSnapshot);
  const currentToasts = useSyncExternalStore(subscribeToToasts, getToastsSnapshot, getServerToastsSnapshot);

  const removeToast = useCallback((id: string) => {
    toasts = toasts.filter((t) => t.id !== id);
    notifyListeners();
  }, []);

  if (!mounted) return null;

  const content = (
    <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-[100] flex flex-col gap-2">
      {currentToasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            px-4 py-3 rounded-xl backdrop-blur-sm border animate-fade-in-up
            flex items-center gap-3
            ${
              toast.type === 'success'
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                : toast.type === 'error'
                  ? 'bg-red-500/20 border-red-500/50 text-red-400'
                  : 'bg-blue-500/20 border-blue-500/50 text-blue-400'
            }
          `}
        >
          {/* Icon */}
          {toast.type === 'success' && (
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {toast.type === 'error' && (
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {toast.type === 'info' && (
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}

          <span className="flex-1 text-sm font-medium">{toast.message}</span>

          <button
            onClick={() => removeToast(toast.id)}
            className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );

  return createPortal(content, document.body);
}

// Hook for easy access
export function useToast(): ToastContextValue {
  return { showToast };
}
