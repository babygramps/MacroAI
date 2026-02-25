'use client';

import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
      <div className="card max-w-md w-full text-center">
        <div className="text-5xl mb-4">😵</div>
        <h1 className="text-page-title mb-2">Something went wrong</h1>
        <p className="text-body text-text-secondary mb-2">
          The dashboard encountered an unexpected error.
        </p>
        {error.digest && (
          <p className="text-caption text-text-muted mb-4">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex flex-col gap-3 mt-6">
          <button onClick={reset} className="btn-primary w-full">
            Try again
          </button>
          <Link
            href="/"
            className="btn-secondary w-full text-center"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
