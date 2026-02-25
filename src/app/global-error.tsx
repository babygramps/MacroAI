'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#0A0A0F',
          color: '#FFFFFF',
          fontFamily: "'Satoshi', sans-serif",
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
        }}
      >
        <div
          style={{
            background: '#141419',
            borderRadius: '0.75rem',
            padding: '2rem',
            border: '1px solid rgba(42, 42, 53, 0.5)',
            maxWidth: '28rem',
            width: '100%',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💥</div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              marginBottom: '0.5rem',
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              color: '#9CA3AF',
              fontSize: '0.875rem',
              marginBottom: '1.5rem',
              lineHeight: 1.5,
            }}
          >
            An unexpected error occurred. Please try again.
            {error.digest && (
              <span style={{ display: 'block', marginTop: '0.5rem', color: '#6B7280', fontSize: '0.75rem' }}>
                Error ID: {error.digest}
              </span>
            )}
          </p>
          <button
            onClick={reset}
            style={{
              background: '#FF6B35',
              color: 'white',
              fontWeight: 500,
              padding: '0.75rem 1.5rem',
              borderRadius: '0.75rem',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              width: '100%',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
