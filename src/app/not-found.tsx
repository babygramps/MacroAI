import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
      <div className="card max-w-md w-full text-center">
        <div className="text-6xl mb-4">🔍</div>
        <h1 className="text-page-title mb-2">Page not found</h1>
        <p className="text-body text-text-secondary mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link href="/" className="btn-primary inline-block w-full">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
