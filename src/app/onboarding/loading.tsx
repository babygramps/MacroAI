export default function OnboardingLoading() {
  return (
    <div className="page-container-compact flex flex-col">
      {/* Progress dots skeleton */}
      <div className="flex gap-2 justify-center py-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`h-2 rounded-full skeleton ${i === 0 ? 'w-8' : 'w-2'}`}
          />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-32">
        {/* Emoji placeholder */}
        <div className="w-16 h-16 rounded-full skeleton mb-6" />

        {/* Title */}
        <div className="h-8 w-64 skeleton rounded mb-2" />

        {/* Subtitle */}
        <div className="h-5 w-48 skeleton rounded mb-8" />

        {/* Input area */}
        <div className="w-full max-w-sm space-y-4">
          <div className="h-24 skeleton rounded-xl" />
          <div className="flex gap-4 justify-center">
            <div className="h-12 w-12 rounded-full skeleton" />
            <div className="h-12 w-12 rounded-full skeleton" />
          </div>
        </div>
      </div>

      {/* Bottom CTA skeleton */}
      <div className="fixed-bottom-cta">
        <div className="h-14 skeleton rounded-xl w-full" />
      </div>
    </div>
  );
}
