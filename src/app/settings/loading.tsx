import { AppHeader } from '@/components/ui/AppHeader';

export default function SettingsLoading() {
  return (
    <div className="page-container-compact">
      <AppHeader title="Settings" showBack showSettings={false} />
      <main className="content-wrapper py-6 space-y-6">
        {/* Units section */}
        <div className="card">
          <div className="h-5 w-16 skeleton rounded mb-4" />
          <div className="flex gap-3">
            <div className="flex-1 h-24 skeleton rounded-xl" />
            <div className="flex-1 h-24 skeleton rounded-xl" />
          </div>
        </div>

        {/* Profile section */}
        <div className="card">
          <div className="h-5 w-20 skeleton rounded mb-4" />
          <div className="space-y-3">
            <div className="h-14 skeleton rounded" />
            <div className="h-14 skeleton rounded" />
            <div className="h-14 skeleton rounded" />
            <div className="h-14 skeleton rounded" />
          </div>
        </div>

        {/* Goals section */}
        <div className="card">
          <div className="h-5 w-16 skeleton rounded mb-4" />
          <div className="space-y-3">
            <div className="h-14 skeleton rounded" />
            <div className="h-14 skeleton rounded" />
            <div className="h-14 skeleton rounded" />
            <div className="h-14 skeleton rounded" />
          </div>
        </div>
      </main>
    </div>
  );
}
