'use client';

import { useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  containerClassName?: string;
  contentClassName?: string;
  contentProps?: React.HTMLAttributes<HTMLDivElement>;
  ariaLabel?: string;
}

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

// Selector for all focusable elements within the modal
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function ModalShell({
  isOpen,
  onClose,
  children,
  containerClassName,
  contentClassName,
  contentProps,
  ariaLabel,
}: ModalShellProps) {
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // ESC key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Body overflow lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Save and restore focus
  useEffect(() => {
    if (isOpen) {
      // Save the element that had focus before the modal opened
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;

      // Move focus into the modal content after a tick (so the portal is mounted)
      requestAnimationFrame(() => {
        if (!contentRef.current) return;
        const firstFocusable = contentRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          // If no focusable element, focus the content div itself
          contentRef.current.focus();
        }
      });
    } else {
      // Restore focus to the element that triggered the modal
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
        previousActiveElementRef.current = null;
      }
    }
  }, [isOpen]);

  // Focus trap: keep Tab / Shift+Tab within the modal
  const handleFocusTrap = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !contentRef.current) return;

    const focusableElements = contentRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey) {
      // Shift+Tab: if focus is on first element, wrap to last
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab: if focus is on last element, wrap to first
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }, []);

  if (!mounted || !isOpen) return null;

  const modalContent = (
    <div
      className={`fixed inset-0 z-50 ${containerClassName || ''}`}
      onKeyDown={handleFocusTrap}
    >
      <div className="modal-backdrop" onClick={onClose} />
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={contentClassName}
        tabIndex={-1}
        {...contentProps}
      >
        {children}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
