'use client';

import Link from 'next/link';
import { AppHeader } from '@/components/ui/AppHeader';

export default function StatsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page-container-compact">
      <AppHeader title="Statistics" showBack showSettings />
      <main className="content-wrapper py-6">
        <div className="card text-center py-8">
          <div className="text-5xl mb-4">📊</div>
          <h2 className="text-section-title mb-2">Failed to load statistics</h2>
          <p className="text-body text-text-secondary mb-2">
            Something went wrong while loading your stats.
          </p>
          {error.digest && (
            <p className="text-caption text-text-muted mb-4">
              Error ID: {error.digest}
            </p>
          )}
          <div className="flex flex-col gap-3 mt-6 max-w-xs mx-auto">
            <button onClick={reset} className="btn-primary w-full">
              Try again
            </button>
            <Link
              href="/"
              className="btn-secondary w-full text-center"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
