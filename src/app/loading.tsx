import { AppHeader } from '@/components/ui/AppHeader';

export default function DashboardLoading() {
  return (
    <div className="page-container">
      <AppHeader />

      <main className="content-wrapper">
        {/* Date Navigator skeleton */}
        <div className="flex justify-center mt-6 mb-6">
          <div className="h-10 w-64 skeleton rounded-full" />
        </div>

        {/* Calorie ring skeleton */}
        <div className="flex justify-center mb-6">
          <div className="w-40 h-40 rounded-full skeleton" />
        </div>

        {/* Macro rings skeleton */}
        <div className="flex justify-center gap-6 mb-6">
          <div className="w-20 h-20 rounded-full skeleton" />
          <div className="w-20 h-20 rounded-full skeleton" />
          <div className="w-20 h-20 rounded-full skeleton" />
        </div>

        {/* Weight card skeleton */}
        <div className="mb-8">
          <div className="card-interactive h-16 skeleton" />
        </div>

        {/* Meal log section skeleton */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="h-6 w-40 skeleton rounded" />
            <div className="h-4 w-20 skeleton rounded" />
          </div>
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card h-20 skeleton" />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
