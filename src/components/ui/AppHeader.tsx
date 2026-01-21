'use client';

import { memo } from 'react';
import Link from 'next/link';

// Hoisted static SVG icons for better performance
const BackIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
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

interface AppHeaderProps {
  /** Page title - if not provided, shows MacroAI branding */
  title?: string;
  /** Show back button that navigates to home */
  showBack?: boolean;
  /** Custom back URL (defaults to '/') */
  backUrl?: string;
  /** Show stats icon link (hidden on stats page) */
  showStats?: boolean;
  /** Show settings icon link (hidden on settings page) */
  showSettings?: boolean;
  /** Optional user email to display */
  userEmail?: string | null;
}

export const AppHeader = memo(function AppHeader({
  title,
  showBack = false,
  backUrl = '/',
  showStats = false,
  showSettings = true,
  userEmail,
}: AppHeaderProps) {
  const isBranding = !title;

  return (
    <header className="page-header">
      <div className="content-wrapper flex items-center justify-between">
        {/* Left section: Back button or branding */}
        <div className="flex items-center gap-3">
          {showBack ? (
            <Link
              href={backUrl}
              className="icon-button"
              aria-label="Go back"
            >
              {BackIcon}
            </Link>
          ) : null}
          
          {isBranding ? (
            <span className="text-xl font-bold text-macro-calories">MacroAI</span>
          ) : (
            <h1 className="text-section-title">{title}</h1>
          )}
        </div>

        {/* Right section: Navigation icons */}
        <div className="flex items-center gap-2">
          {userEmail && (
            <span className="text-caption hidden sm:block mr-1 text-text-muted">
              {userEmail}
            </span>
          )}
          
          {showStats && (
            <Link
              href="/stats"
              className="icon-button"
              aria-label="View statistics"
            >
              {StatsIcon}
            </Link>
          )}
          
          {showSettings && (
            <Link
              href="/settings"
              className="icon-button"
              aria-label="Settings"
            >
              {SettingsIcon}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
});
