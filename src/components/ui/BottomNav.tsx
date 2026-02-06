'use client';

import { memo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Hoisted SVG icons
const PlusIcon = (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const StatsIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
    />
  </svg>
);

const SettingsIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
);

interface BottomNavProps {
  /** Handler for the Add button click */
  onAddClick?: () => void;
  /** Whether the Add button should be visible */
  showAdd?: boolean;
}

export const BottomNav = memo(function BottomNav({ 
  onAddClick, 
  showAdd = true 
}: BottomNavProps) {
  const pathname = usePathname();
  
  const isStatsActive = pathname === '/stats';
  const isSettingsActive = pathname === '/settings';

  return (
    <nav className="bottom-nav">
      <div className="max-w-lg mx-auto flex items-stretch">
        {/* Stats */}
        <Link
          href="/stats"
          className={`bottom-nav-item ${isStatsActive ? 'active' : ''}`}
          aria-label="Statistics"
          aria-current={isStatsActive ? 'page' : undefined}
        >
          <span className="bottom-nav-icon">{StatsIcon}</span>
          <span className="bottom-nav-label">Stats</span>
        </Link>

        {/* Add - Elevated central button */}
        {showAdd ? (
          <button
            onClick={onAddClick}
            className="bottom-nav-add"
            aria-label="Log food"
          >
            <span
              className="bottom-nav-add-inner"
              style={{ animation: 'fab-breathe 3s ease-in-out infinite' }}
            >
              {PlusIcon}
            </span>
          </button>
        ) : (
          <div className="flex-1" /> // Spacer when Add is hidden
        )}

        {/* Settings */}
        <Link
          href="/settings"
          className={`bottom-nav-item ${isSettingsActive ? 'active' : ''}`}
          aria-label="Settings"
          aria-current={isSettingsActive ? 'page' : undefined}
        >
          <span className="bottom-nav-icon">{SettingsIcon}</span>
          <span className="bottom-nav-label">Settings</span>
        </Link>
      </div>
    </nav>
  );
});
