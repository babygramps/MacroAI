import { AppHeader } from '@/components/ui/AppHeader';
import { StatsHeroCardSkeleton } from '@/components/ui/StatsHeroCard';
import { WeightJourneyCardSkeleton } from '@/components/ui/WeightJourneyCard';
import { WeeklyNutritionCardSkeleton } from '@/components/ui/WeeklyNutritionCard';

export default function StatsLoading() {
  return (
    <div className="page-container-compact">
      <AppHeader title="Statistics" showBack showSettings />
      <main className="content-wrapper py-6 space-y-4">
        <StatsHeroCardSkeleton />
        <WeightJourneyCardSkeleton />
        <WeeklyNutritionCardSkeleton />
      </main>
    </div>
  );
}
