'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface MealContextMenuAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
}

interface MealContextMenuProps {
  actions: MealContextMenuAction[];
  children: React.ReactNode;
  disabled?: boolean;
}

const LONG_PRESS_DURATION = 500; // ms

/**
 * Context menu component that works on both mobile (long press) and desktop (3-dot menu)
 */
export function MealContextMenu({ actions, children, disabled = false }: MealContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    // Use a slight delay to avoid immediately closing on the same click that opened
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside, { passive: true });
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Close menu on scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = () => setIsOpen(false);
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isOpen]);

  // Close menu on escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const openContextMenu = useCallback((x: number, y: number) => {
    if (disabled) return;
    
    // Adjust position to ensure menu stays within viewport
    const menuWidth = 160;
    const menuHeight = actions.length * 44 + 16; // Approximate menu height
    
    let adjustedX = x;
    let adjustedY = y;

    // Check if menu would overflow right edge
    if (x + menuWidth > window.innerWidth - 16) {
      adjustedX = window.innerWidth - menuWidth - 16;
    }

    // Check if menu would overflow bottom edge
    if (y + menuHeight > window.innerHeight - 16) {
      adjustedY = y - menuHeight;
    }

    // Ensure menu doesn't go off left or top edge
    adjustedX = Math.max(16, adjustedX);
    adjustedY = Math.max(16, adjustedY);

    setMenuPosition({ x: adjustedX, y: adjustedY });
    setIsOpen(true);
  }, [actions.length, disabled]);

  // Long press handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    
    longPressTimerRef.current = setTimeout(() => {
      // Vibrate on supported devices
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      
      if (touchStartPosRef.current) {
        openContextMenu(touchStartPosRef.current.x, touchStartPosRef.current.y);
      }
    }, LONG_PRESS_DURATION);
  }, [disabled, openContextMenu]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    // Cancel long press if user moves finger significantly
    if (touchStartPosRef.current) {
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
      const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
      
      if (dx > 10 || dy > 10) {
        clearLongPressTimer();
        touchStartPosRef.current = null;
      }
    }
  }, [clearLongPressTimer]);

  const handleTouchEnd = useCallback(() => {
    clearLongPressTimer();
    touchStartPosRef.current = null;
  }, [clearLongPressTimer]);

  // Desktop 3-dot menu button click
  const handleMenuButtonClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;

    const button = e.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    
    // Position menu below the button, aligned to the right
    openContextMenu(rect.right - 160, rect.bottom + 4);
  }, [disabled, openContextMenu]);

  const handleActionClick = useCallback((action: MealContextMenuAction) => {
    setIsOpen(false);
    // Small delay to allow menu to close before action (prevents visual glitch)
    setTimeout(() => action.onClick(), 10);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* Wrapper with long-press handlers */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className="relative"
      >
        {children}

        {/* 3-dot menu button - always visible, subtle on mobile, prominent on hover */}
        {!disabled && (
          <button
            onClick={handleMenuButtonClick}
            className="absolute top-1/2 -translate-y-1/2 right-1 p-1.5 rounded-lg
                       text-text-muted/50 hover:text-text-primary hover:bg-bg-elevated/80
                       active:bg-bg-elevated transition-colors
                       md:right-2 md:p-2 md:text-text-muted md:bg-bg-elevated/60
                       md:hover:bg-bg-elevated md:backdrop-blur-sm"
            aria-label="More options"
            aria-haspopup="true"
            aria-expanded={isOpen}
          >
            <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
        )}
      </div>

      {/* Context menu dropdown - rendered via portal to avoid stacking context issues */}
      {isOpen && menuPosition && typeof document !== 'undefined' && createPortal(
        <>
          {/* Backdrop for mobile */}
          <div
            className="fixed inset-0 z-[9998] bg-black/20 md:hidden"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Menu */}
          <div
            ref={menuRef}
            className="fixed z-[9999] min-w-[160px] py-2 rounded-xl bg-bg-surface border border-border-subtle
                       shadow-lg shadow-black/30"
            style={{
              left: menuPosition.x,
              top: menuPosition.y,
            }}
            role="menu"
            aria-orientation="vertical"
          >
            {actions.map((action, index) => (
              <button
                key={index}
                onClick={() => handleActionClick(action)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm
                           transition-colors ${
                             action.variant === 'danger'
                               ? 'text-red-400 hover:bg-red-500/10'
                               : 'text-text-primary hover:bg-bg-elevated'
                           }`}
                role="menuitem"
              >
                <span className="w-5 h-5">{action.icon}</span>
                {action.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

// Icons for common actions
export const EditIcon = (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
    />
  </svg>
);

export const DeleteIcon = (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);

export const DuplicateIcon = (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
    />
  </svg>
);
